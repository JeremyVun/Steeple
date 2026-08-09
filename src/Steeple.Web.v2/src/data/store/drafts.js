export function createDraftStore(context) {
  const { DAY_LABELS, DAY_TOKENS, emit, effectiveRoom, fromWireRoom, load, openHoursFor, overlaps, roomKey, timeOk } = context;

  function mirrorRoomAvailability(venueId, roomId, dto) {
    const data = load();
    const key = roomKey(venueId, roomId);
    const windows = [];
    for (const entry of dto?.days ?? []) {
      const day = DAY_TOKENS.indexOf(String(entry.dayOfWeek ?? '').toLowerCase());
      if (day < 0) continue;
      for (const window of entry.windows ?? []) {
        windows.push({ day, start: window.startTime, end: window.endTime });
      }
    }
    data.openHours[key] = windows.sort((a, b) => a.day - b.day || (a.start < b.start ? -1 : 1));
    data.blackouts[key] = (dto?.blackouts ?? []).map((b) => ({ date: b.date, reason: b.reason ?? null }));
    // A list read, not a change somebody made: the desk redraws, nothing animates.
    emit('mirror-list', { venueId, roomId, windows: windows.length });
    return windows;
  }
  
  /** Replace-all weekly windows for a room, as the Manage service does. */
  function setOpenHours(venueId, roomId, windows) {
    const data = load();
    for (const w of windows) {
      if (!(w.day >= 0 && w.day <= 6) || !timeOk(w.start) || !timeOk(w.end) || w.start >= w.end)
        return { ok: false, errors: { hours: 'Each window needs a weekday and a valid time range.' } };
    }
    for (const a of windows) {
      for (const b of windows) {
        if (a !== b && a.day === b.day && overlaps(a.start, a.end, b.start, b.end))
          return { ok: false, errors: { hours: `Two ${DAY_LABELS[a.day]} windows overlap.` } };
      }
    }
    data.openHours[roomKey(venueId, roomId)] = windows
      .map((w) => ({ day: w.day, start: w.start, end: w.end }))
      .sort((a, b) => a.day - b.day || (a.start < b.start ? -1 : 1));
    emit('open-hours', { venueId, roomId });
    return { ok: true };
  }
  
  function addBlackout(venueId, roomId, date, reason) {
    const data = load();
    const key = roomKey(venueId, roomId);
    const list = (data.blackouts[key] ??= []);
    if (!list.some((b) => b.date === date)) list.push({ date, reason: reason?.trim() || null });
    list.sort((a, b) => (a.date < b.date ? -1 : 1));
    emit('blackout', { venueId, roomId });
    return { ok: true };
  }
  
  function removeBlackout(venueId, roomId, date) {
    const data = load();
    const key = roomKey(venueId, roomId);
    data.blackouts[key] = (data.blackouts[key] ?? []).filter((b) => b.date !== date);
    emit('blackout', { venueId, roomId });
    return { ok: true };
  }
  
  /**
   * The describe flow: host edits over the canonical room, publish included.
   *
   * With no third argument this is the store acting alone, as it always has: the
   * publish rule is checked here and the state is decided here.
   *
   * With `remote` — steeple's own ManagedRoomDto, straight off the wire — the
   * write has already happened at the service, and this only mirrors it. The
   * server's status is recorded as it stands (a room the moderation gate holds
   * comes back `draft` with a publish request against it), and the local gate is
   * not re-run, because refusing here what the service accepted would be a
   * phantom failure after a real success.
   */
  function editRoom(venueId, roomId, patch, remote = null) {
    const data = load();
    const room = effectiveRoom(venueId, roomId);
    if (!room) return { ok: false };
    if (!remote && patch.status === 'published' && room.status !== 'published') {
      if (openHoursFor(venueId, roomId).length === 0)
        return { ok: false, errors: { status: 'Set open hours before publishing.' } };
    }
    const key = roomKey(venueId, roomId);
    const mirrored = remote ? fromWireRoom(remote) : {};
    data.roomEdits[key] = { ...(data.roomEdits[key] ?? {}), ...patch, ...mirrored };
    const published = (mirrored.status ?? patch.status) === 'published';
    emit('room-edit', { venueId, roomId, published });
    return { ok: true, room: effectiveRoom(venueId, roomId) };
  }

  return { mirrorRoomAvailability, setOpenHours, addBlackout, removeBlackout, editRoom };
}
