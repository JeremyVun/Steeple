// Arrival-only fixtures: every API response is 503; no account or inventory is changed.
// STEEPLE_ARRIVAL_OUT chooses the evidence directory. See HARNESS.md for modes and fixture limits.
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { AxePuppeteer } from '@axe-core/puppeteer';
import { createServer, preview } from 'vite';
import { closeBrowsers, launch } from './fixtures.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = process.env.STEEPLE_ARRIVAL_OUT ?? await mkdtemp(`${tmpdir()}/steeple-arrival-web-`);
await mkdir(out, { recursive: true });
const mode = process.argv[2] ?? '--all';
const records = [];
const checks = [];
const frames = [['desktop', 1440, 900], ['phone', 390, 844], ['narrow', 320, 740]];
const fixture = (server) => {
  server.middlewares.use((req, res, next) => {
    if (req.url.startsWith('/arrival-prefix/')) req.url = req.url.slice('/arrival-prefix'.length);
    next();
  });
  server.middlewares.use('/api', (req, res) => {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end('{}');
  });
};
const config = { root, envDir: false, cacheDir: `${out}/vite-cache`,
  build: { outDir: process.env.STEEPLE_ARRIVAL_DIST ?? 'dist-debug' },
  server: { host: '127.0.0.1', port: 5837, strictPort: true },
  preview: { host: '127.0.0.1', port: 5837, strictPort: true },
  plugins: [{ name: 'arrival-fixtures', configureServer: fixture, configurePreviewServer: fixture }],
};
const server = process.env.STEEPLE_ARRIVAL_DIST ? await preview(config) : await createServer(config);

function check(label, value) {
  assert.ok(value, label);
  checks.push(label);
  console.log(`ok  ${label}`);
}

async function probe(page) {
  return page.evaluate(() => {
    const arrival = document.querySelector('#arrival');
    const box = (e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
    };
    return {
      viewport: [innerWidth, innerHeight, devicePixelRatio],
      scrollable: arrival.classList.contains('is-scrollable'),
      scrollHeight: arrival.scrollHeight, scrollTop: arrival.scrollTop,
      controls: [...arrival.querySelectorAll('a')].map((e) => ({ text: e.textContent.trim() || e.getAttribute('aria-label'), href: e.getAttribute('href'), ...box(e) })),
      text: [...arrival.querySelectorAll('p,h1,.arrival__brand span')].map((e) => ({ text: e.textContent, font: getComputedStyle(e).fontSize, color: getComputedStyle(e).color, ...box(e) })),
      ink: [...arrival.querySelectorAll('p,h1,.arrival__brand span')].flatMap((e) => {
        const nodes = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
        const ranges = [];
        while (nodes.nextNode()) {
          if (!nodes.currentNode.textContent.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(nodes.currentNode);
          for (const r of range.getClientRects()) ranges.push({ text: e.textContent, color: getComputedStyle(e).color, x: r.x, y: r.y, right: r.right, bottom: r.bottom });
        }
        return ranges;
      }),
      spill: [...arrival.querySelectorAll('*')].filter((e) => e.scrollWidth > e.clientWidth + 1 && !e.matches('svg,path')).map((e) => e.className),
      poster: document.querySelector('#poster img')?.currentSrc,
      canvas: document.querySelector('#scene')?.className,
      state: window.__steeple ? { view: window.__steeple.state.view, roll: window.__steeple.state.roll } : null,
    };
  });
}

let browser;
let origin;
async function pageFor(width, height, scenario = 'live') {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 2 });
  const cdp = await page.createCDPSession();
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: false });
  await page.emulateMediaFeatures([
    { name: 'prefers-reduced-motion', value: scenario === 'reduced' ? 'reduce' : 'no-preference' },
    { name: 'prefers-color-scheme', value: scenario === 'dark' ? 'dark' : 'light' },
  ]);
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/'))
      return request.respond({ status: 503, contentType: 'application/json', body: '{}' });
    return request.continue();
  });
  if (scenario === 'poster') await page.setJavaScriptEnabled(false);
  if (scenario === 'unavailable') await page.evaluateOnNewDocument(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return String(type).includes('webgl') ? null : get.call(this, type, ...args);
    };
  });
  if (scenario === 'large') await page.evaluateOnNewDocument(() => {
    addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = '200%'; });
  });
  if (scenario === 'handoff') await page.evaluateOnNewDocument(() => {
    addEventListener('DOMContentLoaded', () => {
      const canvas = document.querySelector('#scene');
      const observer = new MutationObserver(() => {
        if (!canvas.classList.contains('is-live')) return;
        window.__steeple.engine.stop();
        window.__arrivalFirstFrame = true;
        observer.disconnect();
      });
      observer.observe(canvas, { attributes: true, attributeFilter: ['class'] });
    });
  });
  return page;
}

async function capture(page, name, width, height) {
  const measurement = await probe(page);
  assert.deepEqual(measurement.viewport, [width, height, 2]);
  const data = Buffer.from(await page.screenshot({ path: `${out}/${name}.png` }));
  assert.equal(data.readUInt32BE(16), width * 2);
  assert.equal(data.readUInt32BE(20), height * 2);
  records.push({ name, ...measurement });
  await writeFile(`${out}/measurements-${mode.slice(2)}.json`, JSON.stringify(records, null, 2));
  return measurement;
}

async function tabTo(page, selector) {
  for (let n = 0; n < 12; n++) {
    if (await page.evaluate((s) => document.activeElement.matches(s), selector)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`Tab did not reach ${selector}`);
}

async function returned(page) {
  if (await page.$('.signin__layer.is-open')) await page.keyboard.press('Escape');
  await page.click('.wordmark');
  await page.waitForFunction(() => __steeple.state.roll === 0 && __steeple.state.view === 'arrival', { timeout: 30000 });
}

async function landed(page, destination) {
  await page.waitForFunction((target) => __steeple.state.roll === 1 &&
    (target === 'desk' ? document.querySelector('.signin__layer.is-open .signin--host') : __steeple.state.view === 'village'),
  { timeout: 60000 }, destination);
}

try {
  if (server.listen) await server.listen();
  origin = server.resolvedUrls.local[0];
  const pid = execFileSync('lsof', ['-tiTCP:5837', '-sTCP:LISTEN'], { encoding: 'utf8' }).trim();
  const cwd = execFileSync('lsof', ['-a', '-p', pid, '-d', 'cwd', '-Fn'], { encoding: 'utf8' }).trim();
  check('isolated listener cwd', cwd.includes(root.replace(/\/$/, '')));
  browser = await launch({ userDataDir: `${out}/chrome-${mode.slice(2)}` });
  if (mode === '--poster' || mode === '--visual' || mode === '--all') {
    const scenarios = mode === '--poster' ? ['poster'] : ['poster', 'handoff', 'live', 'reduced', 'dark', 'large', 'unavailable'];
    for (const [frame, width, height] of frames) for (const scenario of scenarios) {
      const page = await pageFor(width, height, scenario);
      await page.goto(origin, { waitUntil: 'domcontentloaded' });
      if (scenario === 'poster') await page.waitForFunction(() => document.querySelector('#poster img').complete);
      else if (scenario === 'handoff') {
        await page.waitForFunction('window.__arrivalFirstFrame === true', { timeout: 120000 });
        await page.evaluate(() => {
          const canvas = document.querySelector('#scene');
          canvas.style.transition = 'none'; canvas.style.opacity = '1';
        });
      } else {
        await page.waitForFunction('window.__steepleReady === true', { timeout: 120000 });
        if (scenario !== 'unavailable') await page.evaluate(() => window.__steeple.engine?.stop());
      }
      if (scenario === 'large') {
        await capture(page, `${frame}-large-top`, width, height);
        if (await page.evaluate(() => document.querySelector('.arrival.is-scrollable') !== null)) {
          await page.mouse.move(width / 2, height / 2);
          await page.mouse.wheel({ deltaY: 1500 });
          await page.waitForFunction(() => document.querySelector('#arrival').scrollTop > 0);
        }
        check(`${frame} 200% text scroll stays on arrival`, await page.evaluate(() => window.__steeple.state.view === 'arrival'));
      }
      const m = await capture(page, `${frame}-${scenario}`, width, height);
      if (scenario === 'poster') {
        await page.addStyleTag({ content: '#arrival p, #arrival h1, .arrival__brand span { color: transparent !important; }' });
        await page.screenshot({ path: `${out}/${frame}-background.png` });
      }
      if (scenario !== 'unavailable') {
        check(`${frame} ${scenario}: no horizontal text spill`, !m.spill.length);
        check(`${frame} ${scenario}: all targets >= 44px`, m.controls.every((c) => c.width >= 44 && c.height >= 44));
        if (scenario !== 'large') check(`${frame} ${scenario}: controls above fold`, m.controls.every((c) => c.y >= 0 && c.bottom <= height));
      } else check(`${frame} renderer refusal opens browse`, m.state.view === 'village' && m.state.roll === 1);
      await page.close();
    }
  }
  if (mode === '--flows' || mode === '--all') {
    for (const [frame, width, height] of frames) {
      const page = await pageFor(width, height);
      await page.goto(`${origin}?q=low&arrival=verified`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction('window.__steepleReady === true', { timeout: 120000 });
      for (const [selector, destination] of [['.arrival__cta', 'village'], ['.arrival__host', 'desk'], ['.arrival__scroll', 'village']]) {
        await page.click(selector);
        await landed(page, destination);
        check(`${frame} ${selector} native pointer (${destination === 'desk' ? 'signed-out host guide' : 'browse'})`, page.url().includes('/browse?') && page.url().includes('arrival=verified'));
        await returned(page);
      }
      const settled = await page.evaluate(() => __steeple.arrival());
      check(`${frame} analytics exactly once per entry`, settled.length === 3);
      await tabTo(page, '.arrival__host');
      await capture(page, `${frame}-focus`, width, height);
      await page.close();
    }
    const page = await pageFor(320, 740, 'reduced');
    await page.goto(`${origin}?q=low`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('window.__steepleReady === true', { timeout: 120000 });
    await page.keyboard.press('Tab');
    check('header host is first keyboard target', await page.evaluate(() => document.activeElement.matches('.arrival__host')));
    for (const [selector, view] of [['.arrival__host', 'desk'], ['.arrival__cta', 'village'], ['.arrival__scroll', 'village']]) {
      await tabTo(page, selector);
      await page.keyboard.press('Enter');
      await landed(page, view);
      check(`reduced-motion ${selector} native keyboard`, page.url().includes('/browse?'));
      await returned(page);
    }
    check('keyboard analytics exactly once per entry', await page.evaluate(() => __steeple.arrival().length === 3));
    await page.close();

    for (const route of ['browse', 'desk', 'journal', 'letter/missing']) {
      const cold = await pageFor(390, 844);
      await cold.goto(`${origin}${route}?q=low&arrival=cold`, { waitUntil: 'domcontentloaded' });
      await cold.waitForFunction('window.__steepleReady === true', { timeout: 30000 });
      check(`cold ${route} skips scenery`, await cold.evaluate(() => __steeple.state.roll === 1 && !__steeple.engine));
      check(`cold ${route} preserves query`, cold.url().includes('arrival=cold'));
      await cold.close();
    }

    const gestures = await pageFor(390, 844, 'reduced');
    await gestures.goto(`${origin}?q=low`, { waitUntil: 'domcontentloaded' });
    await gestures.waitForFunction('window.__steepleReady === true', { timeout: 120000 });
    await gestures.mouse.move(195, 680);
    await gestures.mouse.wheel({ deltaY: 400 });
    await gestures.waitForFunction(() => __steeple.state.roll === 1, { timeout: 30000 });
    check('canvas wheel still enters browse', await gestures.evaluate(() => __steeple.state.view === 'village'));
    await returned(gestures);
    const touch = await gestures.createCDPSession();
    await touch.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    await gestures.touchscreen.tap(195, 680);
    await gestures.waitForFunction(() => __steeple.state.roll === 1, { timeout: 30000 });
    check('canvas native touch still enters browse', await gestures.evaluate(() => __steeple.state.view === 'village'));
    await gestures.close();

    const large = await pageFor(320, 740, 'large');
    await large.goto(`${origin}?q=low`, { waitUntil: 'domcontentloaded' });
    await large.waitForFunction('window.__steepleReady === true', { timeout: 120000 });
    await tabTo(large, '.arrival__cta');
    await large.keyboard.press('Enter');
    await large.waitForFunction(() => __steeple.state.roll === 1 && __steeple.state.view === 'village', { timeout: 30000 });
    check('200% text keyboard reaches and activates Find a space', large.url().includes('/browse'));
    await returned(large);
    await tabTo(large, '.arrival__host');
    await large.keyboard.press('Enter');
    await landed(large, 'desk');
    check('200% text keyboard reaches and activates Host a space', large.url().includes('/browse'));
    await large.close();

    const resized = await pageFor(1440, 900);
    await resized.goto(origin, { waitUntil: 'domcontentloaded' });
    await resized.waitForFunction('window.__steepleReady === true', { timeout: 120000 });
    for (const [name, width, height] of [['phone', 390, 844], ['desktop', 1440, 900]]) {
      await resized.setViewport({ width, height, deviceScaleFactor: 2 });
      await resized.evaluate(() => new Promise((resolve) => {
        let n = 0;
        const next = () => ++n === 20 ? resolve() : requestAnimationFrame(next);
        requestAnimationFrame(next);
      }));
      const m = await capture(resized, `${name}-resized`, width, height);
      check(`${name} after live resize fits`, !m.spill.length && m.controls.every((c) => c.x >= 0 && c.right <= width && c.bottom <= height));
    }
    await resized.close();
    const auditPage = await pageFor(390, 844, 'reduced');
    await auditPage.goto(`${origin}?q=low`, { waitUntil: 'domcontentloaded' });
    await auditPage.waitForFunction('window.__steepleReady === true', { timeout: 120000 });
    const axe = await new AxePuppeteer(auditPage).include('#arrival').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    await writeFile(`${out}/axe.json`, JSON.stringify(axe.violations, null, 2));
    check('arrival axe has no violations', axe.violations.length === 0);
    await auditPage.close();
  }
  if (mode === '--motion' || mode === '--all') {
    for (const [frame, width, height] of frames.slice(0, 2)) {
      const page = await pageFor(width, height);
      await page.goto(origin, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction('window.__steepleReady === true', { timeout: 120000 });
      await page.click('.arrival__cta');
      await page.waitForFunction(() => __steeple.state.roll >= 0.12, { timeout: 60000 });
      await capture(page, `${frame}-entering`, width, height);
      await landed(page, 'village');
      await page.click('.wordmark');
      await page.waitForFunction(() => __steeple.state.roll < 0.8, { timeout: 60000 });
      await capture(page, `${frame}-returning`, width, height);
      await page.waitForFunction(() => __steeple.state.roll === 0, { timeout: 60000 });
      check(`${frame} normal motion returns to opening`, await page.evaluate(() => __steeple.state.view === 'arrival'));
      await page.close();
    }
  }
  if (mode === '--contracts' || mode === '--all') {
    for (const prefix of ['', 'arrival-prefix/']) {
      for (const [selector, route] of [['.arrival__cta', 'browse'], ['.arrival__host', 'desk'], ['.arrival__scroll', 'browse']]) {
        const page = await pageFor(390, 844, 'poster');
        await page.goto(`${origin}${prefix}`, { waitUntil: 'domcontentloaded' });
        check(`${prefix || 'root'} ${selector} is a native base-relative link`, await page.$eval(selector, (e, path) => e.tagName === 'A' && e.getAttribute('href') === path, route));
        await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click(selector)]);
        check(`${prefix || 'root'} ${selector} navigates without JavaScript`, new URL(page.url()).pathname === `/${prefix}${route}`);
        await page.close();
      }
    }
    const prefixed = await pageFor(390, 844, 'reduced');
    await prefixed.goto(`${origin}arrival-prefix/?q=low&arrival=prefix`, { waitUntil: 'domcontentloaded' });
    await prefixed.waitForFunction('window.__steepleReady === true', { timeout: 120000 });
    await prefixed.click('.arrival__cta');
    await landed(prefixed, 'village');
    check('scripted prefix entry preserves route and query', new URL(prefixed.url()).pathname === '/arrival-prefix/browse' && prefixed.url().includes('arrival=prefix'));
    await returned(prefixed);
    check('wordmark returns to prefixed root', new URL(prefixed.url()).pathname === '/arrival-prefix/');
    await prefixed.close();

    const native = await pageFor(390, 844, 'reduced');
    await native.goto(`${origin}?q=low&arrival=native`, { waitUntil: 'domcontentloaded' });
    await native.waitForFunction('window.__steepleReady === true', { timeout: 120000 });
    for (const input of ['middle', 'Meta']) {
      const opened = browser.waitForTarget((t) => t.type() === 'page' && new URL(t.url()).pathname === '/browse', { timeout: 30000 });
      if (input === 'Meta') await native.keyboard.down('Meta');
      await native.click('.arrival__cta', { button: input === 'middle' ? 'middle' : 'left' });
      if (input === 'Meta') await native.keyboard.up('Meta');
      const target = await opened;
      check(`${input} opens a native browse tab`, new URL(target.url()).pathname === '/browse');
      await (await target.page()).close();
      await native.bringToFront();
      check(`${input} leaves source intent untouched`, await native.evaluate(() => __steeple.state.roll === 0 && __steeple.arrival().length === 0));
    }
    await native.close();

    const markup = await (await fetch(origin)).text();
    const shape = () => {
      const root = document.querySelector('#arrival');
      return [...root.querySelectorAll('h1,p,a,.arrival__brand span')].map((e) => ({
        tag: e.tagName, text: e.textContent.replace(/\s+/g, ' ').trim(), href: e.getAttribute('href'),
        intent: e.getAttribute('data-intent'), label: e.getAttribute('aria-label'),
      }));
    };
    const printed = await pageFor(390, 844, 'poster');
    await printed.goto(origin, { waitUntil: 'domcontentloaded' });
    const staticShape = await printed.evaluate(shape);
    await printed.close();
    const rebuilt = await pageFor(390, 844, 'reduced');
    rebuilt.removeAllListeners('request');
    rebuilt.on('request', (r) => {
      if (r.isNavigationRequest() && r.url() === origin)
        return r.respond({ status: 200, contentType: 'text/html', body: markup.replace(/<section id="arrival"[\s\S]*?<\/section>/, '') });
      return r.continue();
    });
    await rebuilt.goto(origin, { waitUntil: 'domcontentloaded' });
    await rebuilt.waitForFunction('window.__steepleReady === true', { timeout: 120000 });
    assert.deepEqual(await rebuilt.evaluate(shape), staticShape);
    check('fallback builder matches printed copy, links and accessible labels', true);
    await rebuilt.close();
  }
  await writeFile(`${out}/checks-${mode.slice(2)}.json`, JSON.stringify(checks, null, 2));
  console.log(`PASS ${checks.length} checks; evidence ${out}`);
} finally {
  await closeBrowsers();
  if (server.close) await server.close();
  else await new Promise((resolve) => server.httpServer.close(resolve));
}
