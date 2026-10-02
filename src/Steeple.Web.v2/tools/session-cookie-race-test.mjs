// node tools/session-cookie-race-test.mjs — real HTTP cookies, isolated browser contexts, no API/secrets.
/* global session, api */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer';

const sources = Object.fromEntries(['session', 'api'].map((name) =>
  [`/${name}.js`, readFileSync(new URL(`../src/data/${name}.js`, import.meta.url))]));
const tokens = new Map();
const accessFamilies = new Map();
const revoked = new Set();
const calls = [];
let serial = 0;
let nextGate;
let forceRefreshRefusal = false;
let checks = 0;
const cookieHeader = (token) => `steeple_refresh=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=7776000`;
const expiredCookie = 'steeple_refresh=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0';
const person = (id) => ({ id, email: `${id}@example.test`, displayName: id, createdAtUtc: '2026-10-02T00:00:00Z' });
function issue(user, family = ++serial) {
  const token = `refresh-${++serial}`;
  const access = `access-${serial}`;
  tokens.set(token, { user, family });
  accessFamilies.set(access, { user, family });
  return { token, access };
}
function gate(method, path = '/api/v1/auth/sessions') {
  let arrive;
  const reached = new Promise((resolve) => { arrive = resolve; });
  nextGate = { method, path, arrive };
  return reached;
}
const server = createServer(async (req, res) => {
  if (sources[req.url]) {
    res.writeHead(200, { 'content-type': 'text/javascript' });
    res.end(sources[req.url]);
    return;
  }
  if (req.url === '/') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<script type="module">window.api=await import("/api.js");window.session=await import("/session.js");await session.fetchCurrentUser();window.ready=true;</script>');
    return;
  }
  let text = '';
  for await (const chunk of req) text += chunk;
  const body = text ? JSON.parse(text) : {};
  const cookie = /steeple_refresh=([^;]*)/.exec(req.headers.cookie ?? '')?.[1];
  const bearer = req.headers.authorization?.replace('Bearer ', '');
  const call = { method: req.method, path: req.url, cookie, bearer };
  calls.push(call);
  const finish = (status, data, setCookie) => {
    res.writeHead(status, { 'content-type': 'application/json', ...(setCookie ? { 'set-cookie': setCookie } : {}) });
    res.end(data == null ? '' : JSON.stringify(data));
  };
  let reply;
  if (req.url === '/api/v1/auth/sessions' && req.method === 'POST') {
    const user = person(body.idToken.split('@')[0]);
    if (user.id === 'invalid') reply = () => finish(401, { code: 'invalid_id_token' });
    else {
      const { token, access } = issue(user);
      call.issued = token;
      reply = () => finish(200, { accessToken: access, user }, cookieHeader(token));
    }
  } else if (req.url === '/api/v1/auth/sessions' && req.method === 'DELETE') {
    const session = accessFamilies.get(bearer) ?? tokens.get(cookie);
    if (session) revoked.add(session.family);
    reply = () => finish(session ? 204 : 401, null, cookie ? expiredCookie : null);
  } else if (req.url === '/api/v1/auth/refresh') {
    const session = tokens.get(cookie);
    const refused = forceRefreshRefusal;
    forceRefreshRefusal = false;
    if (session && !revoked.has(session.family) && !refused) {
      const { token, access } = issue(session.user, session.family);
      reply = () => finish(200, { accessToken: access }, cookieHeader(token));
    } else reply = () => finish(401, { code: 'invalid_refresh_token' }, cookie ? expiredCookie : null);
  } else if (req.url === '/api/v1/me') {
    const session = accessFamilies.get(bearer);
    reply = () => finish(session ? 200 : 401, session?.user ?? {});
  } else reply = () => finish(404, {});
  if (nextGate?.method === req.method && nextGate.path === req.url) {
    const selected = nextGate;
    nextGate = null;
    selected.arrive(reply);
  } else reply();
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
let browser;
try {
  browser = await puppeteer.launch({ headless: true, pipe: true, args: ['--no-sandbox'] });
  const pageIn = async (context, fallback = false) => {
    const page = await context.newPage();
    if (fallback) await page.evaluateOnNewDocument(() => Object.defineProperty(navigator, 'locks', { value: undefined }));
    await page.goto(url);
    await page.waitForFunction('window.ready === true');
    return page;
  };
  const begin = (page, name, operation) => page.evaluate(({ name, operation }) => {
    const action = operation === 'out' ? session.signOut()
      : operation === 'refresh' ? session.withAccess(async () => { throw new api.ApiError('expired', 401); })
        : session.signIn({ email: `${operation}@example.test` });
    window[name] = action.catch((error) => ({ status: error.status }));
  }, { name, operation });
  const finish = (page) => page.evaluate(() => Promise.all([window.first, window.second]));
  const assertState = async (page, expected) => {
    assert.equal(await page.evaluate(() => session.currentUser()?.id ?? null), expected);
    const cookie = (await page.browserContext().cookies()).find((item) => item.name === 'steeple_refresh');
    assert.equal(tokens.get(cookie?.value)?.user.id ?? null, expected);
    if (cookie) assert.equal(cookie.httpOnly, true);
    checks++;
  };
  const reloadAndAssert = async (page, expected) => {
    await page.bringToFront();
    await page.reload();
    await page.waitForFunction('window.ready === true', { polling: 50 });
    await assertState(page, expected);
  };

  for (const fallback of [false, true]) {
    for (const scenario of ['in-out', 'in-in', 'out-in', 'refresh-in', 'refusal-in', 'in-failed-in']) {
      const context = await browser.createBrowserContext();
      try {
        const page = await pageIn(context, fallback);
        if (['out-in', 'refresh-in', 'refusal-in', 'in-failed-in'].includes(scenario)) {
          await page.evaluate(() => session.signIn({ email: 'original@example.test' }));
        }
        const initialCalls = calls.length;
        const isRefresh = scenario.endsWith('refresh-in') || scenario === 'refusal-in';
        forceRefreshRefusal = scenario === 'refusal-in';
        const arrival = gate(isRefresh ? 'POST' : scenario === 'out-in' ? 'DELETE' : 'POST',
          isRefresh ? '/api/v1/auth/refresh' : '/api/v1/auth/sessions');
        await begin(page, 'first', isRefresh ? 'refresh' : scenario === 'out-in' ? 'out' : 'old');
        const release = await arrival;
        await begin(page, 'second', scenario === 'in-out' ? 'out' : scenario === 'in-failed-in' ? 'invalid' : 'replacement');
        assert.equal(calls.length, initialCalls + 1, 'later cookie mutation waits for the earlier response');
        if (scenario === 'in-out') assert.equal(await page.evaluate(() => session.currentUser()), null);
        release();
        await finish(page);
        const expected = ['in-out', 'in-failed-in'].includes(scenario) ? null : 'replacement';
        await assertState(page, expected);
        if (scenario === 'in-out') {
          const issued = calls[initialCalls].issued;
          const response = await fetch(`${url}api/v1/auth/refresh`, { method: 'POST', headers: { cookie: `steeple_refresh=${issued}` } });
          assert.equal(response.status, 401, 'logout revoked the late-created token family');
          assert.equal(calls.findLast((call) => call.method === 'DELETE').bearer, undefined);
        }
        await reloadAndAssert(page, expected);
        console.log(`ok ${fallback ? 'fallback' : 'Web Locks'} ${scenario}: cookie and reload agree`);
      } finally { await context.close(); }
    }
  }

  for (const operation of ['old', 'refresh']) {
    const context = await browser.createBrowserContext();
    try {
      const one = await pageIn(context);
      await one.evaluate(() => session.signIn({ email: 'original@example.test' }));
      const two = await pageIn(context);
      const arrival = gate('POST', operation === 'refresh' ? '/api/v1/auth/refresh' : '/api/v1/auth/sessions');
      await begin(one, 'first', operation);
      const release = await arrival;
      await begin(two, 'second', 'out');
      await one.waitForFunction('session.currentUser() === null');
      release();
      await Promise.all([finish(one), finish(two)]);
      await assertState(one, null);
      await assertState(two, null);
      await reloadAndAssert(one, null);
      console.log(`ok sibling sign-out waits for ${operation} and clears both tabs`);
    } finally { await context.close(); }
  }

  const context = await browser.createBrowserContext();
  try {
    const one = await pageIn(context);
    const two = await pageIn(context);
    const arrival = gate('POST');
    await begin(one, 'first', 'older-sibling');
    const release = await arrival;
    await begin(two, 'second', 'newer-local');
    release();
    await Promise.all([finish(one), finish(two)]);
    await two.waitForFunction('session.currentUser()?.id === "newer-local"');
    await assertState(two, 'newer-local');
    await reloadAndAssert(two, 'newer-local');
    console.log('ok passive sibling announcement cannot cancel a newer queued explicit sign-in');
  } finally { await context.close(); }
  const failedContext = await browser.createBrowserContext();
  try {
    const one = await pageIn(failedContext);
    await one.evaluate(() => session.signIn({email: 'original@example.test'}));
    const two = await pageIn(failedContext);
    await two.evaluate(() => session.signIn({email: 'invalid@example.test'}).catch(() => null));
    await one.waitForFunction('session.currentUser() === null', {polling: 50});
    await assertState(one, null);
    await assertState(two, null);
    console.log('ok failed sign-in clears the shared identity in sibling tabs');
  } finally { await failedContext.close(); }
  const replacementContext = await browser.createBrowserContext();
  try {
    const one = await pageIn(replacementContext);
    const two = await pageIn(replacementContext);
    const arrival = gate('POST');
    await begin(one, 'first', 'invalid');
    const release = await arrival;
    await begin(two, 'second', 'replacement');
    release();
    await Promise.all([finish(one), finish(two)]);
    await assertState(two, 'replacement');
    await reloadAndAssert(two, 'replacement');
    console.log('ok failed sibling login preserves a newer queued explicit sign-in');
  } finally { await replacementContext.close(); }
  console.log(`${checks} real-cookie identity checks passed`);
} finally {
  if (browser) await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
