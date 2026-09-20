// Generation ownership keeps late network answers out of the next person's inbox.
export function createNotificationFeed({
  snapshot, markRead, openStream, consumeStream, printable, changed, announce,
  now = Date.now, random = Math.random, setTimer = setTimeout, clearTimer = clearTimeout,
}) {
  let current;
  let eligible = false;
  let disposed = false;
  const jitter = (n) => Math.min(30000, 1000 * 2 ** Math.min(n, 5)) * (0.5 + random() / 2);
  const live = (g) => !disposed && current === g;
  const emit = (g) => { if (live(g)) changed(g.rows); };
  function fresh(id) {
    return { id, rows: [], announced: new Set(), overlays: new Map(), dirty: false,
      asked: false, reading: null, readTimer: null, lastRead: -Infinity, readAfter: 0,
      readFailures: 0, sequence: 0, stream: null, streamTimer: null, streamAfter: 0,
      streamFailures: 0, degradedTimer: null };
  }
  function cancelTimer(g, name) {
    if (g[name] !== null) clearTimer(g[name]);
    g[name] = null;
  }
  function stop(g) {
    for (const name of ['readTimer', 'streamTimer', 'degradedTimer']) cancelTimer(g, name);
    const stream = g.stream;
    g.stream = null;
    stream?.controller.abort();
    if (stream?.idle != null) { clearTimer(stream.idle); stream.idle = null; }
  }
  function say(g) {
    if (!live(g) || !eligible) return;
    const rows = g.rows.filter((row) => !row.readAt && !g.announced.has(row.id));
    rows.forEach((row) => g.announced.add(row.id));
    if (rows.length) announce(rows);
  }
  function cooldown(error, fallback = 0) {
    return Number.isFinite(error?.retryAfterMs) ? Math.max(0, error.retryAfterMs)
      : error?.status === 429 ? 60000 : error?.status === 503 ? 5000 : fallback;
  }
  function scheduleRead(g) {
    if (!live(g) || !g.id || !eligible || !g.dirty || g.reading || g.readTimer !== null) return;
    const delay = Math.max(0, g.lastRead + 1000 - now(), g.readAfter - now());
    g.readTimer = setTimer(() => {
      g.readTimer = null;
      if (live(g) && eligible) void pull(g);
    }, delay);
  }
  function dirty(g) {
    if (!live(g) || !g.id) return;
    g.dirty = true;
    scheduleRead(g);
  }
  function pull(g) {
    if (g.reading) return g.reading;
    if (!live(g) || !g.id) return Promise.resolve([]);
    cancelTimer(g, 'readTimer');
    g.asked = true;
    g.dirty = false;
    g.lastRead = now();
    const sequence = ++g.sequence;
    const request = Promise.resolve().then(() => live(g) ? snapshot() : null).then((answer) => {
      if (!live(g)) return [];
      if (!answer.ok) throw answer;
      g.rows = (answer.value.items ?? []).filter(printable).map((row) => {
        const overlay = g.overlays.get(row.id);
        if (!overlay) return row;
        if (overlay.completedAt !== null && sequence > overlay.completedAt) {
          g.overlays.delete(row.id);
          return row;
        }
        return { ...row, readAt: overlay.readAt };
      });
      const ids = new Set(g.rows.map((row) => row.id));
      for (const [id, overlay] of g.overlays) {
        if (overlay.completedAt !== null && !ids.has(id)) g.overlays.delete(id);
      }
      g.readFailures = 0;
      g.readAfter = 0;
      emit(g);
      say(g);
      return g.rows;
    }).catch((error) => {
      if (!live(g)) return [];
      g.dirty = true;
      g.readAfter = now() + Math.max(jitter(g.readFailures++), cooldown(error));
      return g.rows;
    }).finally(() => {
      if (!live(g) || g.reading !== request) return;
      g.reading = null;
      scheduleRead(g);
      degraded(g);
    });
    g.reading = request;
    return request;
  }
  function degraded(g) {
    cancelTimer(g, 'degradedTimer');
    if (!live(g) || !eligible || g.stream?.connected) return;
    g.degradedTimer = setTimer(() => {
      g.degradedTimer = null;
      if (!live(g) || !eligible || g.stream?.connected) return;
      dirty(g);
      degraded(g);
    }, Math.max(1000, g.lastRead + 60000 - now(), g.readAfter - now()));
  }
  function connect(g) {
    if (!live(g) || !eligible || !g.id || g.stream || g.streamTimer !== null) return;
    if (now() < g.streamAfter) {
      g.streamTimer = setTimer(() => { g.streamTimer = null; connect(g); }, g.streamAfter - now());
      return;
    }
    const attempt = { controller: new AbortController(), connected: false, idle: null, started: null };
    g.stream = attempt;
    const owns = () => live(g) && g.stream === attempt && eligible;
    const bytes = () => {
      if (!owns()) return;
      if (attempt.idle !== null) clearTimer(attempt.idle);
      attempt.idle = setTimer(() => attempt.controller.abort(), 75000);
    };
    void (async () => {
      let error;
      try {
        const response = await openStream({ signal: attempt.controller.signal });
        if (!owns()) { await response.body?.cancel(); return; }
        attempt.connected = true;
        attempt.started = now();
        cancelTimer(g, 'degradedTimer');
        bytes();
        await consumeStream(response, { signal: attempt.controller.signal,
          onInvalidate: () => { if (owns()) dirty(g); }, onBytes: bytes });
      } catch (failure) { error = failure; }
      finally {
        if (attempt.idle !== null) clearTimer(attempt.idle);
        if (owns()) {
          g.stream = null;
          if (attempt.started !== null && now() - attempt.started >= 60000) g.streamFailures = 0;
          g.streamAfter = now() + Math.max(jitter(g.streamFailures++), cooldown(error));
          connect(g);
          degraded(g);
        }
      }
    })();
  }
  function reconcile(id, active) {
    if (disposed) return;
    const replaced = !current || current.id !== id;
    if (replaced) {
      if (current) stop(current);
      current = fresh(id);
      emit(current);
    }
    const wasEligible = eligible;
    eligible = Boolean(id && active);
    if (!eligible) stop(current);
    else {
      if (replaced || !wasEligible) dirty(current);
      connect(current);
      degraded(current);
    }
  }
  function wake() {
    dirty(current);
    return current.reading ?? Promise.resolve(current.rows);
  }
  function read({ again = false } = {}) {
    const g = current;
    if (!g?.id) return Promise.resolve([]);
    if (again) g.dirty = true;
    if (g.reading) return g.reading;
    if (g.asked && !again) return Promise.resolve(g.rows);
    if (now() < g.readAfter) { scheduleRead(g); return Promise.resolve(g.rows); }
    return pull(g);
  }
  async function receipt(row) {
    const g = current;
    if (!g?.id || !g.rows.some((held) => held.id === row.id) || row.readAt) return;
    const overlay = { readAt: new Date(now()).toISOString(), completedAt: null };
    g.overlays.set(row.id, overlay);
    row.readAt = overlay.readAt;
    g.rows = g.rows.map((held) => held.id === row.id ? { ...held, readAt: overlay.readAt } : held);
    g.announced.add(row.id);
    emit(g);
    try {
      const answer = await markRead([row.id]);
      if (!live(g)) return;
      if (!answer.ok) throw answer;
      overlay.completedAt = g.sequence;
      if (!g.rows.some((held) => held.id === row.id)) g.overlays.delete(row.id);
    } catch {
      if (!live(g)) return;
      g.overlays.delete(row.id);
      dirty(g);
    }
  }
  function dispose() { if (current) stop(current); disposed = true; }
  return { reconcile, read, wake, receipt, rows: () => current?.rows ?? [], dispose };
}
