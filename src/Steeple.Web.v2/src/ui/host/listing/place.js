/** PlacePanel workflow panel. */
export function renderPlacePanel(context) {
  const { L, PIN_SVG, draft, el, labelled, manage, noticeBlock, partsFromLabel, renderFoot, replaceChildren, track } = context;

  function placeStep() {
    const editing = draft.entry === 'venue-edit';
    const field = (id, key, label, placeholder, type = 'text') => {
      const input = el('input', {
        class: 'input',
        id,
        type,
        value: draft.venue[key],
        placeholder,
        oninput: (event) => {
          draft.venue[key] = event.target.value;
          renderFoot();
        },
      });
      return labelled(label, input);
    };
  
    const description = el('textarea', {
      class: 'input input--area',
      id: 'place-description',
      rows: '4',
      placeholder: 'A hall with two meeting rooms, a short walk from the shops.',
      oninput: (event) => {
        draft.venue.description = event.target.value;
        renderFoot();
      },
    });
    description.value = draft.venue.description;
  
    // Where the venue stands, redrawn on its own. A suggestion picked answers
    // the address field's own question, so it must not cost the host the caret
    // they are typing with — only this much of the step is drawn again.
    const mark = el('div', { class: 'place__mark' });
    // The map alone, as big as the column: it is the confirmation, and needs
    // no caption to say so. Its ground is reserved from the first frame — a
    // quiet framed slot with a ghost of the pin — so the sheet never changes
    // size and no field moves when the real map arrives.
    const drawMark = () => {
      const at = placeMark();
      replaceChildren(mark, [
        at ? miniMap(at.at) : ghostSlot(),
      ]);
    };
    drawMark();
  
    // The street address suggests as it is typed. Steeple asks once the input
    // could mean somewhere (three characters), 300ms after the last keystroke,
    // and a suggestion picked fills all three address fields with parts the
    // provider resolved — an address chosen here is one that geocodes.
    function addressField() {
      let items = [];
      let active = -1;
      let timer = 0;
      let asking = null;
  
      const list = el('ul', { class: 'suggest', id: 'place-address-suggest', role: 'listbox' });
      list.hidden = true;
      // Steeple being asked, said inside the field's own right edge: the room
      // for it is reserved whether or not it shows, so nothing moves, and the
      // CSS holds it back a quarter-second so a fast answer never flickers one.
      const waitMark = el('span', { class: 'suggest__busy', 'aria-hidden': 'true' });
      const input = el('input', {
        class: 'input',
        id: 'place-address',
        type: 'text',
        value: draft.venue.addressLine,
        placeholder: '400 Maple Avenue West',
        autocomplete: 'off',
        role: 'combobox',
        'aria-expanded': 'false',
        'aria-autocomplete': 'list',
        'aria-controls': 'place-address-suggest',
        oninput: (event) => {
          draft.venue.addressLine = event.target.value;
          // The preview belongs to the address that was picked. A line edited by
          // hand afterwards is an address nobody has resolved, so the preview
          // goes with it rather than standing under a different address.
          if (draft.picked) {
            draft.picked = null;
            drawMark();
          }
          renderFoot();
          ask(event.target.value);
        },
        onkeydown: (event) => {
          if (list.hidden) return;
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const step = event.key === 'ArrowDown' ? 1 : -1;
            active = (active + step + items.length) % items.length;
            draw();
          } else if (event.key === 'Enter' && active >= 0) {
            event.preventDefault();
            pick(items[active]);
          } else if (event.key === 'Escape') {
            // With the list open, Escape is the list's alone — the sheet
            // underneath must not read the same press as "leave the flow".
            event.stopPropagation();
            close();
          }
        },
        // Delayed so a mousedown on a suggestion still lands before the list goes.
        onblur: () => setTimeout(close, 150),
      });
  
      // Closed means nothing is coming: a question still in flight would
      // otherwise answer after the press that dismissed it and open the list
      // again, over a host who had moved on.
      function close() {
        clearTimeout(timer);
        asking?.abort();
        waiting(false);
        items = [];
        active = -1;
        draw();
      }
  
      function waiting(on) {
        waitMark.classList.toggle('is-on', on);
        input.setAttribute('aria-busy', String(on));
      }
  
      // The list is fixed to the viewport rather than laid into the sheet: an
      // absolutely-positioned box still counts toward a scroll ancestor's
      // scrollable overflow, so laying it in would grow the sheet's scrollbar
      // the moment suggestions appear. A scroll anywhere would desync a fixed
      // box from its field, so it closes the list instead.
      function place() {
        const at = input.getBoundingClientRect();
        list.style.top = `${at.bottom + 4}px`;
        list.style.left = `${at.left}px`;
        list.style.width = `${at.width}px`;
      }
  
      const onScroll = (event) => {
        if (!list.contains(event.target)) close();
      };
  
      function draw() {
        const opening = list.hidden && items.length > 0;
        const closing = !list.hidden && items.length === 0;
        list.hidden = items.length === 0;
        input.setAttribute('aria-expanded', String(!list.hidden));
        if (opening) {
          place();
          window.addEventListener('scroll', onScroll, true);
        }
        if (closing) window.removeEventListener('scroll', onScroll, true);
        replaceChildren(
          list,
          items.map((s, i) =>
            el(
              'li',
              {
                class: `suggest__item${i === active ? ' suggest__item--active' : ''}`,
                role: 'option',
                'aria-selected': String(i === active),
                onmousedown: (event) => {
                  event.preventDefault();
                  pick(s);
                },
              },
              [el('span', { text: s.label })]
            )
          )
        );
      }
  
      function pick(s) {
        // The provider breaks the address into parts when it can; when it only
        // gives the label, the label is read for them. Either way the host is
        // never asked to retype what they just picked.
        const parts = partsFromLabel(s.label);
        draft.venue.addressLine = s.addressLine ?? parts.addressLine;
        draft.venue.suburb = s.suburb ?? parts.suburb;
        draft.venue.postcode = s.postcode ?? parts.postcode;
        // The field keeps the whole label that was picked: a line cut to the
        // street alone reads as information thrown away, and no longer says
        // *which* Maple Avenue was chosen.
        input.value = s.label;
        // The provider resolved this suggestion to a coordinate before offering
        // it, so where the address falls can be shown at once. It is the
        // provider's reading and not steeple's answer — `placeMark` keeps the
        // two apart, and nothing here is sent or stored as a position.
        draft.picked =
          Number.isFinite(s.latitude) && Number.isFinite(s.longitude)
            ? { lat: s.latitude, lng: s.longitude }
            : null;
        track('address_suggestion_picked', {});
        close();
        drawMark();
        renderFoot();
      }
  
      function ask(text) {
        clearTimeout(timer);
        asking?.abort();
        waiting(false);
        const q = text.trim();
        if (q.length < 3) {
          close();
          return;
        }
        timer = setTimeout(async () => {
          asking = new AbortController();
          waiting(true);
          const got = await manage.suggestAddresses(q, { signal: asking.signal });
          // The field may have moved on while steeple was answering — and if it
          // has, a newer question is the one being waited on, not this one.
          if (input.value.trim() !== q) return;
          waiting(false);
          items = got;
          active = -1;
          draw();
        }, 300);
      }
  
      return labelled(
        'Street address',
        el('div', { class: 'suggest__anchor' }, [input, waitMark, list])
      );
    }
  
    return [
      el('p', {
        class: 'prose',
        text: editing
          ? // The rename that cannot break a link: steeple derives a listing's
            // address from the name once, when it is created, and never again.
            'What groups read about the venue. Renaming it never changes its web address, and a new street address is put back on the map.'
          : 'A venue is the building or location where your spaces are. Add its details and address first; next, you’ll describe the room or space groups can hire.',
      }),
      noticeBlock(),
      // Two kinds of question, so two columns — the same reading as Describe.
      // What groups read about the venue stands at the left, where the venue is
      // stands at the right with the map under it. As one stack, a venue name
      // was given the same long line as a paragraph about the place.
      el('div', { class: 'place' }, [
        el('div', { class: 'place__words' }, [
          field('place-name', 'name', 'Venue name', 'St Andrew’s Church'),
          addressField(),
          labelled('About the venue', description),
        ]),
        el('div', { class: 'place__where' }, [mark]),
      ]),
    ];
  }
  
  /** Steeple's own answer for where the venue stands, when it has given one. */
  const savedMark = () =>
    draft.remote.position ? { at: draft.remote.position, sure: true } : null;
  
  /**
   * What the Place step can honestly draw. Steeple's answer whenever there is
   * one — it is what the map is showing the world. Failing that, the coordinate
   * the provider attached to the suggestion the host picked, which is a preview
   * of where that address falls and is never called more than that. An address
   * typed and left unpicked has no coordinate at all, and is not guessed at.
   */
  const placeMark = () => savedMark() ?? (draft.picked ? { at: draft.picked, sure: false } : null);
  
  /**
   * The real map, small: the same OpenStreetMap tiles the discovery surface
   * runs, framed on the coordinate, with the teardrop of the design system on
   * the spot. Still — it confirms a place, it is not for browsing. Leaflet can
   * only size itself once the element is laid out, so the map is raised a frame
   * after the block lands in the document.
   */
  /** The map's reserved ground before an address has been picked. */
  function ghostSlot() {
    const ghost = el('span', { class: 'minimap__ghost' });
    ghost.innerHTML = PIN_SVG; // static markup, no data in it
    return el('div', { class: 'minimap minimap--waiting', 'aria-hidden': 'true' }, [ghost]);
  }
  
  function miniMap(at) {
    const element = el('div', { class: 'minimap', 'aria-hidden': 'true' });
    requestAnimationFrame(() => {
      if (!element.isConnected) return;
      const map = L.map(element, {
        zoomControl: false,
        attributionControl: true,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        touchZoom: false,
        inertia: false,
      });
      map.attributionControl.setPrefix('');
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors',
        className: 'minimap__tiles',
      }).addTo(map);
      map.setView([at.lat, at.lng], 15);
      L.marker([at.lat, at.lng], {
        interactive: false,
        keyboard: false,
        icon: L.divIcon({
          className: 'minimap__pin',
          html: PIN_SVG,
          iconSize: [30, 38],
          iconAnchor: [15, 38],
        }),
      }).addTo(map);
    });
    return element;
  }
  
  return placeStep();
}

/** The publish panel's quiet confirmation of where the venue stands. */
export function renderPlacedBlock({ L, PIN_SVG, draft, el }) {
  if (!draft.remote.position) return null;
  const at = draft.remote.position;
  const mapElement = el('div', { class: 'minimap', 'aria-hidden': 'true' });
  requestAnimationFrame(() => {
    if (!mapElement.isConnected) return;
    const map = L.map(mapElement, {
      zoomControl: false,
      attributionControl: true,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      touchZoom: false,
      inertia: false,
    });
    map.attributionControl.setPrefix('');
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
      className: 'minimap__tiles',
    }).addTo(map);
    map.setView([at.lat, at.lng], 15);
    L.marker([at.lat, at.lng], {
      interactive: false,
      keyboard: false,
      icon: L.divIcon({
        className: 'minimap__pin',
        html: PIN_SVG,
        iconSize: [30, 38],
        iconAnchor: [15, 38],
      }),
    }).addTo(map);
  });
  return el('section', { class: 'placed' }, [
    mapElement,
    el('div', { class: 'placed__words' }, [
      el('p', { class: 'eyebrow', text: 'On the map' }),
      el('p', {
        class: 'prose prose--sm',
        text: 'This is where groups browsing the map will find the venue.',
      }),
    ]),
  ]);
}
