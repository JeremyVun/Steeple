#!/usr/bin/env node
// INTENT BEATS SCENERY — the boot's own promise, driven (build_plan Phase 3.5).
//
// The title page is printed in index.html and on screen before any script has
// arrived. This suite proves that a press on it is *answered* from that first
// frame, whichever of the three boot states the page happens to be in:
//
//   §1 pre-controller     nothing has executed yet. Only the markup can answer,
//                         and it does: the press is a real link, so the address
//                         bar records it and the boot that follows opens there.
//   §2 controller live    the entry chunk has run, the 105KB interface has not.
//                         The press is recorded, acknowledged on screen, and the
//                         product opens flat — no engine, no world, no three.
//   §3 world in flight    the interface is interactive and the village chunks
//                         are downloading. The press abandons that boot: the
//                         transfers finish, no engine is ever created, and the
//                         product is not overwritten afterwards.
//   §4 world standing     nobody pressed in time. The village is up and the
//                         press is the cinematic it has always been.
//   §5 the hash           a cold deep link is somebody who has already chosen:
//                         same no-world policy, and the product reads start
//                         without waiting on anything 3D.
//
// Every section clicks BEFORE waiting on `window.__steepleReady`. Waiting first
// is the blind spot that let a lost click ship: by then the handlers are on.
//
// It drives a BUILT bundle, not the Vite module graph — the chunk boundaries
// are the thing under test and dev has none:
//
//   npm run build:debug
//   STEEPLE_API_ORIGIN=http://localhost:5214 \
//     npx vite preview --outDir dist-debug --port 5279 --strictPort
//   node tools/boot-priority-test.mjs "http://localhost:5279/?q=low"
//
// The three windows are made deterministic by holding named chunk responses
// open (CDP request interception) over slow-4G network and 4× CPU throttling,
// so "before the interface arrives" is a real interval and not a race the
// harness hopes to win.
//
// Known local noise, judge the check lines: rooms written by other agents carry
// absolute photo URLs on API ports that are gone, so the console may carry
// image 404s that have nothing to do with the boot.

import puppeteer from 'puppeteer';

const url = process.argv[2] ?? 'http://localhost:5279/?q=low';
const origin = url.split('#')[0];

let failures = 0;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function check(label, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}

/** Slow 4G and a phone's main thread: the window the phase was written for. */
const SLOW = { download: (1.6 * 1024 * 1024) / 8, upload: (750 * 1024) / 8, latency: 150 };

const THREE_D = /\/assets\/(engine|world|journey|three)[.-]/;
const INTERFACE = /\/assets\/ui-[^/]*\.js/;
const ENTRY = /\/assets\/index-[^/]*\.js/;

const browser = await puppeteer.launch({
  headless: true,
  pipe: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});

try {
  /**
   * One page, throttled, with named chunks held open for `holds` milliseconds.
   * Nothing is blocked outright: a held request still lands, which is exactly
   * the case the phase cares about — the transfers cannot be called back.
   */
  async function stage({ hold = [], cpu = 4, network = SLOW } = {}) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    const errors = [];
    page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
    page.on('console', (m) => {
      const from = m.location()?.url ?? '';
      if (m.type() === 'error' && !m.text().includes('GL Driver') && !/\/api\/v1\/|\/media\//.test(from))
        errors.push(`[console] ${m.text()}`);
    });

    const client = await page.createCDPSession();
    await client.send('Emulation.setCPUThrottlingRate', { rate: cpu });
    if (network) await page.emulateNetworkConditions(network);

    // What the page has *asked* for, as it asks. The resource timeline only
    // learns of a request when it finishes, which is no use for catching a
    // download while it is still in flight.
    const issued = [];
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      issued.push(request.url());
      const held = hold.find(([pattern]) => pattern.test(request.url()));
      if (!held) return void request.continue().catch(() => {});
      setTimeout(() => request.continue().catch(() => {}), held[1]);
    });

    return {
      page,
      errors,
      issued,
      /** Wait until the page has asked for something matching `pattern`. */
      async asked(pattern, timeout = 60000) {
        const until = Date.now() + timeout;
        while (Date.now() < until) {
          if (issued.some((n) => pattern.test(n))) return true;
          await wait(50);
        }
        throw new Error(`nothing matching ${pattern} was ever requested`);
      },
      async close() {
        await page.close().catch(() => {});
      },
      /** Every resource the page has asked for, by URL. */
      resources: () =>
        page.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name)),
      /** A real mouse press on a printed control, wherever it currently sits. */
      async press(selector) {
        await page.waitForSelector(selector, { timeout: 30000 });
        const box = await (await page.$(selector)).boundingBox();
        if (!box) throw new Error(`${selector} has no box`);
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      },
      settled: () => page.evaluate(() => window.__steeple?.arrival?.() ?? null),
      ready: () => page.waitForFunction('window.__steepleReady === true', { timeout: 90000 }),
      view: () => page.evaluate(() => window.__steeple.state.view),
      roll: () => page.evaluate(() => window.__steeple.state.roll),
    };
  }

  const noWorld = (names) => !names.some((n) => THREE_D.test(n));

  // ── §1 the press nothing has answered yet ─────────────────────────────────
  //
  // The entry chunk is held for two seconds. At the moment of the press there is
  // no controller, no bus and no roll — only the document. The markup alone has
  // to carry the intent, and the only place it can put it is the address bar.
  {
    console.log('\n── §1 pre-controller: the markup is the whole promise ───────');
    const s = await stage({ hold: [[ENTRY, 2000]] });
    await s.page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });

    const scripted = await s.page.evaluate(() => Boolean(window.__steeple));
    check('nothing of the app has run yet', scripted === false);
    check(
      'the calls to action are links, not styled buttons',
      await s.page.evaluate(() =>
        [...document.querySelectorAll('.arrival__cta, .arrival__host, .arrival__scroll')].every(
          (n) => n.tagName === 'A' && n.getAttribute('href')?.startsWith('#/')
        )
      )
    );
    check(
      'each keeps its accessible name',
      await s.page.evaluate(() => {
        const name = (n) => (n.getAttribute('aria-label') ?? n.textContent ?? '').trim();
        return (
          name(document.querySelector('.arrival__cta')) === 'Find a space' &&
          name(document.querySelector('.arrival__host')) === 'Host a space' &&
          name(document.querySelector('.arrival__scroll')).length > 0
        );
      })
    );

    await s.press('.arrival__cta');
    check(
      'the press is recorded before a line of JavaScript',
      (await s.page.evaluate(() => location.hash)) === '#/browse',
      await s.page.evaluate(() => location.hash)
    );

    await s.ready();
    check('...and the boot that follows opens on the product', (await s.view()) === 'village');
    check('...past the roll', (await s.roll()) === 1);
    check('...with no village anywhere in the timeline', noWorld(await s.resources()));
    check(
      'the intent settled exactly once, as a direct entry',
      JSON.stringify((await s.settled()).map((a) => `${a.destination}:${a.entry}`)) ===
        JSON.stringify(['village:direct'])
    );
    check('no page error along the way', s.errors.length === 0, s.errors.join(' · '));
    await s.close();
  }

  // ── §2 the controller is live, the interface is not ───────────────────────
  {
    console.log('\n── §2 controller live, interface still on the wire ──────────');
    const s = await stage({ hold: [[INTERFACE, 2500]] });
    await s.page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
    // The entry has run when the controller is armed; the interface has not when
    // the debug API is still absent (main.js publishes it at the end of a boot).
    await s.page.waitForFunction(
      () => Boolean(document.querySelector('.arrival__cta')) && !window.__steeple,
      { timeout: 30000 }
    );

    await s.press('.arrival__cta');
    check(
      'the press is acknowledged on screen at once',
      await s.page.evaluate(
        () =>
          document.querySelector('.arrival__cta')?.dataset.working === 'on' &&
          document.querySelector('.arrival')?.getAttribute('aria-busy') === 'true'
      )
    );
    check(
      '...visibly: the control carries its own progress',
      await s.page.evaluate(
        () => getComputedStyle(document.querySelector('.arrival__cta')).animationName !== 'none'
      )
    );

    const before = await s.resources();
    check('nothing 3D had been asked for by then', noWorld(before));

    await s.ready();
    check('the press lands on the product', (await s.view()) === 'village');
    check('...once, and only once', (await s.settled()).length === 1);
    check('...as a direct entry', (await s.settled())[0]?.entry === 'direct');
    check('the map is on the page and interactive', await s.page.evaluate(
      () => Boolean(document.querySelector('.leaflet-container .leaflet-tile-pane'))
    ));

    // The listings request must not have waited for the boot signal, and the
    // tiles must have had the connection the village would have taken.
    await s.page.waitForFunction('document.querySelectorAll(".dm-row").length > 0', { timeout: 60000 });
    const after = await s.resources();
    check('the catalog was asked, and answered', after.some((n) => /\/api\/v1\/listings\/search/.test(n)));
    check('map tiles were fetched', after.some((n) => /tile\.openstreetmap\.org/.test(n)));
    check('no engine, world, journey or three before a return', noWorld(after));
    check('the debug API agrees there is no world', await s.page.evaluate(
      () => window.__steeple.engine === null && window.__steeple.world === null
    ));

    // The flat visit is not a dead end. Going back restores the cheap opening
    // frame at once, then raises the live village only because it was asked for.
    await s.press('.wordmark');
    check('returning restores the poster synchronously', await s.page.evaluate(
      () => Boolean(document.getElementById('poster'))
    ));
    await s.page.waitForFunction('__steeple.state.roll === 0', { timeout: 30000 });
    check('the return lands on the arrival', (await s.view()) === 'arrival');

    // They may change their mind before the world finishes building. A late
    // engine must adopt the current product position and do zero hidden work.
    await s.press('.arrival__cta');
    await s.page.waitForFunction('__steeple.state.roll === 1', { timeout: 30000 });
    await s.page.waitForFunction('__steeple.engine !== null', { timeout: 90000 });
    check('a late engine stays paused if the visitor already went back down', await s.page.evaluate(
      () => __steeple.engine.running === false
    ));
    await s.press('.wordmark');
    await s.page.waitForFunction('__steeple.state.roll === 0', { timeout: 30000 });
    await s.page.waitForFunction(
      '__steeple.engine !== null && document.getElementById("scene")?.classList.contains("is-live")',
      { timeout: 90000 }
    );
    check('the village is hydrated only after that return', await s.page.evaluate(
      () => __steeple.world !== null && document.documentElement.dataset.world === 'on'
    ));
    await s.page.evaluate(() => { window.__hydratedEngine = __steeple.engine; });
    await s.press('.arrival__cta');
    await s.page.waitForFunction('__steeple.state.roll === 1', { timeout: 30000 });
    check('the hydrated engine pauses back in the product', await s.page.evaluate(
      () => __steeple.engine.running === false
    ));
    await s.press('.wordmark');
    await s.page.waitForFunction('__steeple.state.roll === 0', { timeout: 30000 });
    check('later returns reuse that engine rather than remounting it', await s.page.evaluate(
      () => __steeple.engine === window.__hydratedEngine && __steeple.engine.running === true
    ));
    check('no page error along the way', s.errors.length === 0, s.errors.join(' · '));
    await s.close();
  }

  // ── §3 the press that overtakes a village already downloading ─────────────
  //
  // The interface arrives; the world's own chunks are held. The press lands in
  // the narrow interval the phase names: their transfers cannot be called back,
  // and the test lets them finish — but nothing may be made of them.
  {
    console.log('\n── §3 the world in flight, and somebody presses ─────────────');
    const s = await stage({ hold: [[THREE_D, 4000]] });
    await s.page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
    // The village chunks must be genuinely on the wire — asked for, not yet
    // answered — when the press lands. The resource timeline is no good for
    // this: it only learns of a request once it has finished.
    await s.asked(/\/assets\/engine-/);
    check('the village had started downloading', s.issued.some((n) => THREE_D.test(n)));
    check('...and had not landed yet', noWorld(await s.resources()));

    await s.press('.arrival__host');
    check('the press is acknowledged at once', await s.page.evaluate(
      () => document.querySelector('.arrival__host')?.dataset.working === 'on'
    ));

    await s.ready();
    check('...once', (await s.settled()).length === 1, JSON.stringify(await s.settled()));
    check(
      '...as a direct entry to the desk',
      (await s.settled())[0]?.destination === 'desk' && (await s.settled())[0]?.entry === 'direct',
      JSON.stringify(await s.settled())
    );
    // Hosting is somebody's and this browser is nobody, so the desk answers for
    // itself: it sends a signed-out visitor to the product as a guest
    // (ui/host/index.js — "a cold link to #/desk while signed out is not a
    // desk"). The direct path's job is to deliver the press to that truth, not
    // to invent a different one.
    check('...and it lands on the hosting truth a signed-out press has', await s.page.evaluate(
      () => window.__steeple.state.view === 'village' && window.__steeple.state.mode === 'guest'
    ), await s.view());
    check('the canvas is gone from the page', await s.page.evaluate(
      () => document.getElementById('scene') === null
    ));

    // The abandoned generation gets its chunks; it must never make an engine of
    // them, or move the product, once the press has landed.
    const landed = await s.view();
    await wait(5000);
    check('no engine was created after the product landed', await s.page.evaluate(
      () => window.__steeple.engine === null && window.__steeple.world === null
    ));
    check('the abandoned chunks change nothing when they arrive', (await s.view()) === landed);
    check('no unhandled rejection or page error', s.errors.length === 0, s.errors.join(' · '));
    await s.close();
  }

  // ── §4 nobody pressed: the arrival the village was built for ──────────────
  {
    console.log('\n── §4 no intent: the overture, intact ───────────────────────');
    const s = await stage({ cpu: 1, network: null });
    await s.page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await s.ready();

    check('the village stands', await s.page.evaluate(
      () => window.__steeple.engine !== null && window.__steeple.world !== null
    ));
    check('the page opens on the title, not the product', (await s.view()) === 'arrival');
    check('the roll is at the top', (await s.roll()) === 0);
    check('the canvas is live over the poster', await s.page.evaluate(
      () => document.getElementById('scene')?.classList.contains('is-live') === true
    ));

    const names = await s.resources();
    const first = (re) => names.findIndex((n) => re.test(n));
    check(
      'the interface went on the wire before the village did',
      first(INTERFACE) >= 0 && first(INTERFACE) < first(THREE_D),
      `ui@${first(INTERFACE)} 3d@${first(THREE_D)}`
    );

    // A cinematic is a roll that was *seen* between its two ends. A jump would
    // never be caught anywhere but at 1, however often it is sampled.
    await s.press('.arrival__cta');
    const eased = [];
    for (let i = 0; i < 40 && !eased.some((p) => p > 0 && p < 1); i += 1) {
      eased.push(await s.roll());
      await wait(60);
    }
    check(
      'the press eases the roll rather than jumping it',
      eased.some((p) => p > 0 && p < 1),
      eased.join(' ')
    );
    await s.page.waitForFunction('__steeple.state.roll === 1', { timeout: 30000 });
    check('...and it lands on the product', (await s.view()) === 'village');
    check('...settling exactly one arrival, as cinematic', await s.page.evaluate(
      () => window.__steeple.arrival().length === 1 && window.__steeple.arrival()[0].entry === 'cinematic'
    ), JSON.stringify(await s.settled()));
    check('the village is still behind it', await s.page.evaluate(
      () => window.__steeple.engine !== null
    ));
    check('no page error along the way', s.errors.length === 0, s.errors.join(' · '));
    await s.close();
  }

  // ── §5 a cold link into the product ───────────────────────────────────────
  {
    console.log('\n── §5 the hash: somebody who has already chosen ─────────────');
    const s = await stage({ cpu: 1, network: null });
    await s.page.goto(`${origin}#/browse`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await s.ready();
    check('it opens on the product', (await s.view()) === 'village');
    check('with no village fetched behind it', noWorld(await s.resources()));
    await s.page.waitForFunction('document.querySelectorAll(".dm-row").length > 0', { timeout: 60000 });
    check(
      'the catalog answered, with nothing 3D on the wire beside it',
      (await s.resources()).some((n) => /\/api\/v1\/listings\/search/.test(n)) &&
        noWorld(await s.resources())
    );
    check('no page error along the way', s.errors.length === 0, s.errors.join(' · '));
    await s.close();
  }

  // ── §6 the down affordance, and the keyboard ──────────────────────────────
  {
    console.log('\n── §6 the down affordance, by mouse and by key ──────────────');
    const s = await stage({ hold: [[INTERFACE, 2000]] });
    await s.page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await s.page.waitForFunction(
      () => Boolean(document.querySelector('.arrival__scroll')) && !window.__steeple,
      { timeout: 30000 }
    );
    // Space is the button half of a control that is now a link: the printed page
    // must not lose it while it waits for the interface.
    await s.page.focus('.arrival__scroll');
    await s.page.keyboard.press('Space');
    check('a space press on the down affordance is heard', await s.page.evaluate(
      () => document.querySelector('.arrival__scroll')?.dataset.working === 'on'
    ));
    check('...and recorded in the address bar', (await s.page.evaluate(() => location.hash)) === '#/browse');
    await s.ready();
    check('it lands on the product', (await s.view()) === 'village');
    check('...once', (await s.settled()).length === 1);
    check('with no village anywhere in the timeline', noWorld(await s.resources()));
    check('no page error along the way', s.errors.length === 0, s.errors.join(' · '));
    await s.close();
  }

  console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} FAILING`}\n`);
} finally {
  await browser.close();
}

process.exit(failures === 0 ? 0 : 1);
