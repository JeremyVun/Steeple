export function createHostState(context) {
  const { emit, load } = context;

  /**
   * A venue the host has listed, kept on the Wayfinder beside the five. Where it
   * stands is not this browser's guess: steeple geocodes the address on create
   * and the position it answers with is what lands here.
   */
  function upsertPlacedVenue(venue) {
    const data = load();
    const existing = data.placedVenues.findIndex((v) => v.id === venue.id);
    if (existing >= 0) {
      // A partial upsert changes what it names and nothing else. Merging a
      // defaulted `rooms: []` over a venue that already had rooms emptied it —
      // and an emptied venue has no room to publish.
      const before = data.placedVenues[existing];
      const entry = { ...before, ...venue, rooms: venue.rooms ?? before.rooms ?? [] };
      data.placedVenues[existing] = entry;
      emit('venue-placed', { venueId: entry.id });
      return { ok: true, venue: entry };
    }
    const entry = { rooms: [], published: false, placed: true, ...venue };
    data.placedVenues.push(entry);
    emit('venue-placed', { venueId: entry.id });
    return { ok: true, venue: entry };
  }
  
  /**
   * Move every map keyed by `venue/room` from one id to another.
   *
   * `from` is either a venue id — every room under it travels — or a whole
   * `venue/room` key, in which case only that room does. The arrays are carried
   * whole; the edits are merged, because the newer record is the one being
   * written now and whatever was already under the new key is older.
   */
  function moveKeyed(from, to) {
    const data = load();
    const belongs = (key) => key === from || key.startsWith(`${from}/`);
    const carry = (map, merge) => {
      for (const key of Object.keys(map)) {
        if (!belongs(key)) continue;
        const moved = to + key.slice(from.length);
        if (moved === key) continue;
        map[moved] = merge ? { ...(map[moved] ?? {}), ...map[key] } : map[key];
        delete map[key];
      }
    };
    carry(data.openHours, false);
    carry(data.blackouts, false);
    carry(data.roomEdits, true);
    for (const occurrence of data.occurrences) {
      if (belongs(occurrence.roomKey ?? '')) {
        occurrence.roomKey = to + occurrence.roomKey.slice(from.length);
      }
    }
  }
  
  /**
   * Take the id steeple gave a venue this browser placed under a guess.
   *
   * A record here is keyed by slug, and the slug guessed while the create was in
   * flight ('placed-test-space') is rarely the one the service minted
   * ('test-space'). Two records of one venue is how a desk ends up showing an
   * empty copy of itself: `mirrorManagedVenues` keeps the server's and drops the
   * guess, and everything hanging off the old id goes with it — the rooms, their
   * open hours, their closed days, the host's edits, which venue this desk was
   * left on. So the moment steeple answers a create, its slug becomes the id here
   * and every map keyed by the old one is carried across.
   */
  function adoptVenueSlug(fromId, toId) {
    const data = load();
    if (!toId || !fromId || fromId === toId) return { ok: true, venueId: toId ?? fromId };
    const at = data.placedVenues.findIndex((v) => v.id === fromId);
    if (at < 0) return { ok: false };
    const moved = { ...data.placedVenues[at], id: toId };
    const already = data.placedVenues.findIndex((v) => v.id === toId);
    if (already >= 0) {
      // The desk's own re-read can land the server's copy under the real slug
      // while this draft is still open. One venue, one record: keep every room
      // either of them knows about, the draft's own winning where they collide.
      const held = data.placedVenues[already].rooms ?? [];
      const rooms = [...held];
      for (const room of moved.rooms ?? []) {
        const seen = rooms.findIndex((r) => r.id === room.id);
        if (seen >= 0) rooms[seen] = { ...rooms[seen], ...room };
        else rooms.push(room);
      }
      data.placedVenues[already] = { ...data.placedVenues[already], ...moved, rooms };
      data.placedVenues.splice(at, 1);
    } else {
      data.placedVenues[at] = moved;
    }
    moveKeyed(fromId, toId);
    if (data.hostVenueId === fromId) data.hostVenueId = toId;
    emit('venue-placed', { venueId: toId, wasVenueId: fromId });
    return { ok: true, venueId: toId };
  }
  
  /** The same, for a room: steeple's slug replaces the one guessed from its name. */
  function adoptRoomSlug(venueId, fromId, toId) {
    const data = load();
    if (!toId || !fromId || fromId === toId) return { ok: true, roomId: toId ?? fromId };
    const venue = data.placedVenues.find((v) => v.id === venueId);
    const room = venue?.rooms.find((r) => r.id === fromId);
    if (!room) return { ok: false };
    // A venue never holds two rooms under one id; where the server's slug is
    // already here, this draft is that room and its own record is the newer one.
    venue.rooms = venue.rooms.filter((r) => r.id !== toId);
    room.id = toId;
    moveKeyed(`${venueId}/${fromId}`, `${venueId}/${toId}`);
    emit('venue-placed', { venueId, roomId: toId, wasRoomId: fromId });
    return { ok: true, roomId: toId };
  }
  
  function setHomePin(pin) {
    const data = load();
    data.homePin = pin ? { lat: pin.lat, lng: pin.lng } : null;
    emit('home-pin', { pin: data.homePin });
    return { ok: true };
  }
  
  function setHostVenue(venueId) {
    const data = load();
    data.hostVenueId = venueId;
    emit('host-venue', { venueId });
    return { ok: true };
  }

  return { upsertPlacedVenue, adoptVenueSlug, adoptRoomSlug, setHomePin, setHostVenue };
}
