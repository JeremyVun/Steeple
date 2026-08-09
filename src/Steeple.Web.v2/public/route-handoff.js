/* ROUTE HANDOFF — the bridge from a served document to the running application.
 *
 * A clean route arrives as a real HTTP document: the API renders the listing at
 * /space/{venue}/{room}, and nginx serves a tiny boot document for every other
 * clean route. Both of them are whole pages — a crawler, a share-card scraper
 * and a person with no JavaScript get the truth from the response and never
 * need this file. What this file does is turn that page into the ordinary Vite
 * application, at the same URL, with no redirect, no iframe, no second runtime
 * and no copy of Vite's generated asset names anywhere on the server
 * (docs/backlog/seo/design.md SEO-D3, SEO-D4).
 *
 * The shape of it:
 *
 *   1. read the shell URL the document was served with (`data-shell`)
 *   2. fetch that deployment's index.html, same-origin only
 *   3. parse it inert — DOMParser marks every script it parses as already
 *      started, so nothing in the parsed tree can ever run
 *   4. resolve its subresource URLs against the *shell's own response URL*,
 *      because a relative `assets/…` in that file means relative to that file
 *   5. put the application's stylesheets in this head and WAIT for them
 *   6. swap the body, drop `rd-body`, and append one fresh copy of each of the
 *      shell's executable scripts
 *
 * THE FAILURE CONTRACT IS THE POINT. Every step above can fail — a blocked
 * script, a dead network, a shell that 404s, a browser with no fetch. When any
 * of them does, this file changes nothing: the served document stays exactly as
 * it was, readable, with working links, and one short line in the console. It
 * never replaces a page with a blank one, and it never writes anything a
 * listing or a person could be identified by into a log.
 *
 * Two things the route document keeps through the swap, and they are why only
 * the BODY moves: its head carries the listing's metadata, canonical, JSON-LD
 * and the `#steeple-listing-bootstrap` payload that saves the app a second read
 * of a room the server already answered (SEO-D5), plus the prefix-aware <base>
 * that every relative URL in the running app resolves against (design §7).
 *
 * Dependency-free and un-built on purpose: it ships from public/ under a stable
 * name because the server has to be able to name it, and it runs before —
 * possibly instead of — anything the bundler produced.
 */
(function () {
  'use strict';

  /** The shell is a document, not a room read: patience is cheaper than a broken page. */
  var SHELL_TIMEOUT_MS = 10000;

  /**
   * How long the swap waits on the application's stylesheets. Past this the
   * body is swapped anyway: an unstyled application is a worse page than a
   * styled one, but it is a far better page than a document that never became
   * one because a single stylesheet hung.
   */
  var STYLE_TIMEOUT_MS = 4000;

  /** Only these run. Everything else with a <script> tag is inert data. */
  var EXECUTABLE_TYPES = ['', 'module', 'text/javascript', 'application/javascript'];

  /** Attributes whose value is a subresource this document will fetch itself. */
  var URL_ATTRIBUTES = ['src', 'poster', 'data'];

  /** Elements whose `src` is a subresource. `a[href]` is deliberately absent: an
   *  anchor is a destination, and the document's own <base> already resolves it
   *  to the right place — rewriting it against index.html would point every link
   *  on the page at /index.html. */
  var ASSET_ELEMENTS = 'img, source, video, audio, track, iframe, embed, object';

  var doc = document;
  var root = doc.documentElement;

  if (root.getAttribute('data-steeple-handoff')) return;

  var script =
    doc.currentScript || doc.querySelector('script[data-shell]');
  var shellHref = script && script.getAttribute('data-shell');
  if (!shellHref || typeof window.fetch !== 'function' || typeof window.DOMParser !== 'function') {
    return;
  }

  var shellUrl;
  try {
    shellUrl = new URL(shellHref, doc.baseURI);
  } catch (e) {
    return;
  }

  // Same-origin, checked here rather than trusted from the markup. The document
  // this runs in is server-rendered, but "the server rendered it" is not a
  // security property a client can verify — so the one URL this file is allowed
  // to fetch is proven to be ours before it is asked for.
  if (shellUrl.origin !== window.location.origin) {
    fail('cross-origin shell refused');
    return;
  }

  root.setAttribute('data-steeple-handoff', 'pending');

  var controller = typeof AbortController === 'function' ? new AbortController() : null;
  var abortTimer = window.setTimeout(function () {
    if (controller) controller.abort();
  }, SHELL_TIMEOUT_MS);

  fetch(shellUrl.href, {
    credentials: 'same-origin',
    signal: controller ? controller.signal : undefined,
  })
    .then(function (response) {
      window.clearTimeout(abortTimer);
      if (!response.ok) throw new Error('shell ' + response.status);
      // A redirect may have moved the shell; the response URL is where the
      // bytes actually came from, and therefore what its relative URLs mean.
      // It may also have moved it off this origin, which is refused again here.
      var resolved = new URL(response.url || shellUrl.href, shellUrl.href);
      if (resolved.origin !== window.location.origin) throw new Error('cross-origin shell refused');
      return response.text().then(function (html) {
        return { html: html, base: resolved.href };
      });
    })
    .then(function (shell) {
      return adopt(shell.html, shell.base);
    })
    .catch(function (error) {
      window.clearTimeout(abortTimer);
      root.setAttribute('data-steeple-handoff', 'failed');
      fail(error && error.name === 'AbortError' ? 'shell timed out' : error);
    });

  /**
   * Takes the parsed shell apart and puts the application on the page.
   *
   * @param {string} html the shell document's source
   * @param {string} base the URL it was served from — the base every relative
   *   URL inside it is relative to
   */
  function adopt(html, base) {
    var shell = new DOMParser().parseFromString(html, 'text/html');
    var body = shell.body;
    if (!body) throw new Error('shell has no body');

    // Executable scripts are taken out of the parsed tree before anything is
    // moved. The parsed originals could not run — DOMParser marks them already
    // started — but taking them out is what makes "exactly once" a property of
    // the code rather than of a browser's flag: what is inserted later is one
    // fresh element per script, and no inert twin is left behind to confuse a
    // reader or a harness counting entries.
    var scripts = [];
    var parsed = shell.querySelectorAll('script');
    for (var i = 0; i < parsed.length; i += 1) {
      var candidate = parsed[i];
      var type = (candidate.getAttribute('type') || '').toLowerCase().trim();
      if (EXECUTABLE_TYPES.indexOf(type) === -1) continue;
      scripts.push(candidate);
      if (candidate.parentNode) candidate.parentNode.removeChild(candidate);
    }

    resolveUrls(body, base);

    var styles = collectStyles(shell, base);

    return whenStyled(styles).then(function () {
      // From here on nothing may throw between the first removal and the last
      // append: this is the one moment the page is neither document nor app.
      var fallback = doc.getElementById('steeple-route-document');
      if (fallback && fallback.parentNode) {
        // Removed, not hidden. Its <header>, <main> and <footer> are landmarks,
        // and two of each would leave a screen reader with two pages.
        fallback.parentNode.removeChild(fallback);
      } else {
        doc.body.textContent = '';
      }

      while (body.firstChild) {
        doc.body.appendChild(doc.adoptNode(body.firstChild));
      }

      // The shell's own body attributes win, then `rd-body` goes whatever they
      // were: that class is the switch every rule in route-document.css and in
      // the served document's inline <style> hangs off, so dropping it retires
      // the whole served presentation in one assignment without removing the
      // head that carries the listing's metadata and boot payload.
      var shellAttributes = body.attributes;
      for (var a = 0; a < shellAttributes.length; a += 1) {
        doc.body.setAttribute(shellAttributes[a].name, shellAttributes[a].value);
      }
      doc.body.classList.remove('rd-body');

      for (var s = 0; s < scripts.length; s += 1) {
        doc.body.appendChild(reanimate(scripts[s], base));
      }

      root.setAttribute('data-steeple-handoff', 'done');
      doc.dispatchEvent(new CustomEvent('steeple:handoff'));
    });
  }

  /**
   * The application's styles, appended to this document's head and reported as
   * promises. They go in the head rather than replacing it: the head is where
   * the listing's metadata lives.
   *
   * @returns {Promise<void>[]} one settled-either-way promise per stylesheet
   */
  function collectStyles(shell, base) {
    var pending = [];
    var nodes = shell.querySelectorAll(
      'link[rel~="stylesheet"][href], link[rel~="modulepreload"][href], link[rel~="icon"][href], style'
    );
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      var copy = doc.createElement(node.tagName.toLowerCase());
      var attributes = node.attributes;
      for (var a = 0; a < attributes.length; a += 1) {
        var name = attributes[a].name;
        var value = attributes[a].value;
        if (name === 'href') value = resolve(value, base);
        copy.setAttribute(name, value);
      }

      if (node.tagName.toLowerCase() === 'style') {
        copy.textContent = node.textContent;
      } else if ((node.getAttribute('rel') || '').indexOf('stylesheet') !== -1) {
        pending.push(settled(copy));
      }

      copy.setAttribute('data-steeple-shell-style', '');
      doc.head.appendChild(copy);
    }

    return pending;
  }

  /** Resolves when the element has loaded or failed — a 404 stylesheet must not hold the page. */
  function settled(element) {
    return new Promise(function (done) {
      element.addEventListener('load', function () { done(); });
      element.addEventListener('error', function () { done(); });
    });
  }

  /**
   * Waits for the application's styles, but not forever. Swapping the body
   * before its stylesheet exists is what makes a handoff flash a page of
   * unstyled markup; waiting past this timeout is what makes it never happen.
   */
  function whenStyled(pending) {
    if (!pending.length) return Promise.resolve();
    return Promise.race([
      Promise.all(pending),
      new Promise(function (done) { window.setTimeout(done, STYLE_TIMEOUT_MS); }),
    ]).then(function () {});
  }

  /**
   * One fresh, live element per script the shell carried. A parsed script is
   * inert for the life of the document it was parsed into; copying its
   * attributes onto a newly created element is the only way to make the app's
   * entry actually run, and creating exactly one is the only way to be sure it
   * runs once.
   */
  function reanimate(original, base) {
    var fresh = doc.createElement('script');
    var attributes = original.attributes;
    for (var a = 0; a < attributes.length; a += 1) {
      var name = attributes[a].name;
      var value = attributes[a].value;
      if (name === 'src') value = resolve(value, base);
      fresh.setAttribute(name, value);
    }

    if (!original.getAttribute('src')) fresh.textContent = original.textContent;
    return fresh;
  }

  /** Rewrites every subresource URL under `node` to where it really is. */
  function resolveUrls(node, base) {
    var elements = node.querySelectorAll(ASSET_ELEMENTS);
    for (var i = 0; i < elements.length; i += 1) {
      var element = elements[i];
      for (var a = 0; a < URL_ATTRIBUTES.length; a += 1) {
        var name = URL_ATTRIBUTES[a];
        if (element.hasAttribute(name)) element.setAttribute(name, resolve(element.getAttribute(name), base));
      }

      // <picture> chooses by media query, and every candidate in the set is a
      // URL of its own — a handoff that resolved only `src` would leave the
      // poster's whole responsive set pointing at the visible route.
      if (element.hasAttribute('srcset')) {
        element.setAttribute('srcset', resolveSrcset(element.getAttribute('srcset'), base));
      }
    }
  }

  function resolve(value, base) {
    try {
      return new URL(value, base).href;
    } catch (e) {
      return value;
    }
  }

  /**
   * `srcset` is a comma-separated list whose entries are a URL and an optional
   * descriptor — but a URL may itself contain commas, so it cannot be split on
   * one. It can be walked: a candidate's URL runs to the first whitespace, and
   * a URL ending in a comma is a candidate with no descriptor at all.
   */
  function resolveSrcset(value, base) {
    var out = [];
    var i = 0;
    while (i < value.length) {
      while (i < value.length && /[\s,]/.test(value.charAt(i))) i += 1;
      if (i >= value.length) break;

      var start = i;
      while (i < value.length && !/\s/.test(value.charAt(i))) i += 1;
      var url = value.slice(start, i);
      var bare = false;
      while (url.charAt(url.length - 1) === ',') {
        url = url.slice(0, -1);
        bare = true;
      }

      var descriptor = '';
      if (!bare) {
        while (i < value.length && /\s/.test(value.charAt(i))) i += 1;
        start = i;
        while (i < value.length && value.charAt(i) !== ',') i += 1;
        descriptor = value.slice(start, i).trim();
        if (value.charAt(i) === ',') i += 1;
      }

      out.push(descriptor ? resolve(url, base) + ' ' + descriptor : resolve(url, base));
    }

    return out.join(', ');
  }

  /**
   * The whole console budget for this file: one line, once, naming the step and
   * nothing else. No URL, no listing, no person — a console is a place other
   * people's software reads.
   */
  function fail(reason) {
    var detail = reason && reason.message ? reason.message : String(reason);
    try {
      console.error('steeple: the application could not be loaded over this page (' + detail + ')');
    } catch (e) {
      /* a console is not a guarantee either */
    }
  }
})();
