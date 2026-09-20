import assert from 'node:assert/strict';
import { createNotificationFeed } from '../src/data/notificationFeed.js';

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const row = (id, readAt = null) => ({ id, readAt, type: 'applicationMessage' });
const answer = (...items) => ({ ok: true, value: { items } });
const settle = async () => { for (let n = 0; n < 20; n++) await Promise.resolve(); };
function harness() {
  let time = 0, next = 0;
  const timers = new Map(), clearCounts = new Map(), reads = [], opens = [], receipts = [], announcements = [], changes = [];
  const feed = createNotificationFeed({
    snapshot() { const d = deferred(); reads.push(d); return d.promise; },
    markRead() { const d = deferred(); receipts.push(d); return d.promise; },
    openStream({ signal }) {
      const d = deferred(); const stream = { ...d, signal, callbacks: null, body: { cancel: async () => {} } };
      opens.push(stream); return d.promise;
    },
    consumeStream(response, callbacks) {
      response.callbacks = callbacks;
      const d = deferred(); response.end = d.resolve;
      callbacks.signal.addEventListener('abort', () => d.resolve(), { once: true });
      return d.promise;
    },
    printable: () => true, changed: (rows) => changes.push(rows), announce: (rows) => announcements.push(rows),
    now: () => time, random: () => 0,
    setTimer(fn, delay) { const id = ++next; timers.set(id, { fn, at: time + delay }); return id; },
    clearTimer(id) { clearCounts.set(id, (clearCounts.get(id) ?? 0) + 1); timers.delete(id); },
  });
  async function tick(ms = 0) {
    const until = time + ms;
    await settle();
    for (;;) {
      const entries = [...timers].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at);
      if (!entries.length) break;
      const [id, timer] = entries[0]; time = timer.at; timers.delete(id); timer.fn(); await settle();
    }
    time = until; await settle();
  }
  async function connect() { const stream = opens.at(-1); stream.resolve(stream); await settle(); return stream; }
  return { feed, reads, opens, receipts, announcements, changes, timers, clearCounts, tick, connect };
}
async function test(name, work) { await work(); console.log(`ok    ${name}`); }
await test('invalidation during snapshot survives completion and bursts coalesce without starvation', async () => {
  const h = harness(); h.feed.reconcile('A', true); await h.tick(); const stream = await h.connect();
  stream.callbacks.onInvalidate(); stream.callbacks.onInvalidate(); h.reads[0].resolve(answer(row('old'))); await h.tick();
  assert.equal(h.reads.length, 1); await h.tick(999); assert.equal(h.reads.length, 1);
  stream.callbacks.onInvalidate(); await h.tick(1); assert.equal(h.reads.length, 2);
  h.reads[1].resolve(answer(row('new'))); await h.tick(); assert.equal(h.feed.rows()[0].id, 'new'); h.feed.dispose();
});
await test('initial admission forces a snapshot after a completed boot read', async () => {
  const h = harness(); h.feed.reconcile('A', true); await h.tick(); h.reads[0].resolve(answer()); await h.tick();
  const stream = await h.connect(); stream.callbacks.onInvalidate(); await h.tick(1000);
  assert.equal(h.reads.length, 2); h.feed.dispose();
});
await test('failed dirty snapshot retries without any subsequent event and honors Retry-After', async () => {
  const h = harness(); h.feed.reconcile('A', true); await h.tick(); await h.connect();
  h.reads[0].resolve({ ok: false, status: 429, retryAfterMs: 5000 }); await h.tick();
  h.feed.wake(); await h.tick(4999); assert.equal(h.reads.length, 1); await h.tick(1); assert.equal(h.reads.length, 2);
  h.reads[1].resolve(answer(row('recovered'))); await h.tick(); assert.equal(h.feed.rows()[0].id, 'recovered'); h.feed.dispose();
});
await test('A sign-out B rejects late snapshot and late stream open without clearing B work', async () => {
  const h = harness(); h.feed.reconcile('A', true); await h.tick();
  const a = h.opens[0]; h.feed.reconcile(null, false); h.feed.reconcile('B', true); await h.tick();
  h.reads[0].resolve(answer(row('private-A'))); a.resolve(a); await h.tick();
  assert.deepEqual(h.feed.rows(), []); assert.equal(a.signal.aborted, true);
  h.reads[1].resolve(answer(row('B'))); await h.tick(); assert.equal(h.feed.rows()[0].id, 'B');
  assert.equal(h.announcements.length, 1); h.feed.dispose();
});
await test('identity replacement before the snapshot microtask prevents the obsolete request', async () => {
  const h = harness(); h.feed.reconcile('A', true); const obsolete = h.feed.read();
  h.feed.reconcile('B', true); await settle(); assert.equal(h.reads.length, 0); await obsolete;
  await h.tick(); assert.equal(h.reads.length, 1); h.reads[0].resolve(answer(row('B'))); await h.tick();
  assert.equal(h.feed.rows()[0].id, 'B'); h.feed.dispose();
});
await test('hide/show aborts old stream; late EOF cannot close its replacement', async () => {
  const h = harness(); h.feed.reconcile('A', true); await h.tick(); const first = await h.connect();
  h.reads[0].resolve(answer()); await h.tick(); h.feed.reconcile('A', false);
  await h.tick(90000); assert.equal(h.opens.length, 1); assert.equal(h.reads.length, 1); assert.equal(h.timers.size, 0);
  h.feed.reconcile('A', true); await h.tick(); const second = await h.connect(); first.end(); await h.tick();
  assert.equal(second.signal.aborted, false); assert.equal(h.opens.length, 2); h.feed.dispose();
});
await test('stream cooldown persists across visibility/online wakes and disconnected reads are bounded', async () => {
  const h = harness(); h.feed.reconcile('A', true); await h.tick(); h.reads[0].resolve(answer());
  h.opens[0].reject({ status: 429, retryAfterMs: 120000 }); await h.tick();
  h.feed.reconcile('A', false); h.feed.reconcile('A', true); h.feed.wake(); await h.tick(1000);
  h.reads.at(-1).resolve(answer()); await h.tick(); await h.tick(59000);
  assert.equal(h.opens.length, 1); assert.equal(h.reads.length, 2); await h.tick(1000); assert.equal(h.reads.length, 3);
  h.reads.at(-1).resolve(answer()); await h.tick(); await h.tick(59000); assert.equal(h.opens.length, 2); h.feed.dispose();
});
await test('503 and 429 stream failures use their default cooldowns without Retry-After', async () => {
  const h = harness(); h.feed.reconcile('A', true); await h.tick(); h.reads[0].resolve(answer());
  h.opens[0].reject({ status: 503 }); await h.tick(); await h.tick(4999); assert.equal(h.opens.length, 1);
  await h.tick(1); assert.equal(h.opens.length, 2); h.opens[1].reject({ status: 429 }); await h.tick();
  await h.tick(59999); assert.equal(h.opens.length, 2); await h.tick(1); assert.equal(h.opens.length, 3); h.feed.dispose();
});
await test('75 seconds without bytes reconnects; heartbeat bytes reset inactivity without reading', async () => {
  const h = harness(); h.feed.reconcile('A', true); await h.tick(); const s = await h.connect();
  h.reads[0].resolve(answer()); await h.tick(); await h.tick(74000); s.callbacks.onBytes(13); await h.tick(74000);
  assert.equal(h.opens.length, 1); assert.equal(h.reads.length, 1); await h.tick(1000); assert.equal(s.signal.aborted, true);
  await h.tick(500); assert.equal(h.opens.length, 2); h.feed.dispose();
});
await test('stopping a stream clears its idle timer exactly once', async () => {
  const h = harness(); h.feed.reconcile('A', true); await h.tick(); const stream = await h.connect();
  h.reads[0].resolve(answer()); await h.tick(); const idle = [...h.timers.keys()][0];
  h.feed.reconcile('A', false); await settle(); assert.equal(stream.signal.aborted, true);
  assert.equal(h.clearCounts.get(idle), 1); h.feed.dispose();
});
await test('pending and pre-ack snapshots cannot undo a receipt; post-ack snapshot reconciles', async () => {
  const h = harness(); h.feed.reconcile('A', true); await h.tick(); await h.connect();
  h.reads[0].resolve(answer(row('mail'))); await h.tick(); const receipt = h.feed.receipt(h.feed.rows()[0]);
  h.feed.wake(); await h.tick(1000); h.receipts[0].resolve({ ok: true }); await receipt;
  h.reads[1].resolve(answer(row('mail'))); await h.tick(); assert.ok(h.feed.rows()[0].readAt);
  h.feed.wake(); await h.tick(1000); h.reads[2].resolve(answer(row('mail', 'server-time'))); await h.tick();
  assert.equal(h.feed.rows()[0].readAt, 'server-time'); assert.equal(h.announcements.length, 1); h.feed.dispose();
});
await test('failed receipt releases overlay for authoritative read and never repeats announcement', async () => {
  const h = harness(); h.feed.reconcile('A', true); await h.tick(); await h.connect();
  h.reads[0].resolve(answer(row('mail'))); await h.tick(); const receipt = h.feed.receipt(h.feed.rows()[0]);
  h.receipts[0].resolve({ ok: false }); await receipt; await h.tick(1000); h.reads[1].resolve(answer(row('mail'))); await h.tick();
  assert.equal(h.feed.rows()[0].readAt, null); assert.equal(h.announcements.length, 1); h.feed.dispose();
});
await test('an old identity receipt completion cannot alter or schedule work for the replacement', async () => {
  const h = harness(); h.feed.reconcile('A', true); await h.tick(); await h.connect();
  h.reads[0].resolve(answer(row('A-mail'))); await h.tick(); const receipt = h.feed.receipt(h.feed.rows()[0]);
  h.feed.reconcile('B', true); await h.tick(); h.reads[1].resolve(answer(row('B-mail', 'read'))); await h.tick();
  const before = h.changes.length; h.receipts[0].resolve({ ok: false }); await receipt; await h.tick(60000);
  assert.equal(h.feed.rows()[0].id, 'B-mail'); assert.equal(h.changes.length, before); h.feed.dispose();
});
await test('same-user profile refresh keeps feed; dispose releases timers and stream', async () => {
  const h = harness(); h.feed.reconcile('A', true); await h.tick(); const stream = await h.connect();
  h.reads[0].resolve(answer(row('mail'))); await h.tick(); h.feed.reconcile('A', true); await h.tick();
  assert.equal(h.feed.rows().length, 1); assert.equal(h.opens.length, 1); h.feed.dispose(); await h.tick();
  assert.equal(h.timers.size, 0); assert.equal(stream.signal.aborted, true);
});
