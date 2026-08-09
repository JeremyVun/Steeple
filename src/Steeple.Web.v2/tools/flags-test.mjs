import { strict as assert } from 'node:assert';

const moduleUrl = new URL('../src/data/flags.js', import.meta.url);

async function load(name, fetcher) {
  globalThis.fetch = fetcher;
  return import(`${moduleUrl.href}?case=${name}`);
}

let requested = null;
let calls = 0;
const off = await load('off', async (url) => {
  requested = url;
  calls += 1;
  return {
    ok: true,
    status: 200,
    json: async () => ({ 'payments.enabled': false }),
  };
});

assert.equal(await off.isEnabled('payments.enabled'), false);
assert.equal(await off.isEnabled('unknown.flag'), false);
assert.equal(requested, 'api/v1/flags?platform=web');
assert.equal(calls, 1, 'the successful snapshot should stay in memory');

const on = await load('on', async () => ({
  ok: true,
  status: 200,
  json: async () => ({ 'payments.enabled': true }),
}));
assert.equal(await on.isEnabled('payments.enabled'), true);

const offline = await load('offline', async () => {
  throw new Error('offline');
});
assert.equal(await offline.isEnabled('payments.enabled'), false);

console.log('ok    public flags are cached and payments fails closed');
