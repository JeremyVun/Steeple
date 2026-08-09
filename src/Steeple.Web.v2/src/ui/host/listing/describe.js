/** DescribePanel workflow panel. */
export function renderDescribePanel(context) {
  const { ACCESS_VOCABULARY, ACTIVITY_TYPES, AMENITY_VOCABULARY, FREE_NOTE, PHOTO_SVG, announce, chosen, draft, el, isFree, labelled, noticeBlock, prepareRoomPhoto, renderFoot, replaceChildren, toggleSet, withSteeple } = context;

  function describeStep() {
    const room = draft.room;
    const amenities = new Set(room.amenities);
    const access = new Set(room.accessibility);
    const activities = new Set(room.activities);
    draft.sets = { amenities, access, activities };
  
    const name = el('input', {
      class: 'input',
      id: 'room-name',
      type: 'text',
      value: room.name,
      placeholder: 'Main space',
      oninput: (event) => {
        room.name = event.target.value;
        renderFoot();
      },
    });
    const description = el('textarea', {
      class: 'input input--area',
      id: 'room-description',
      rows: '3',
      placeholder: 'A bright hall with a stage, a kitchen through the side door, and chairs for eighty.',
      oninput: (event) => {
        room.description = event.target.value;
        renderFoot();
      },
    });
    description.value = room.description ?? '';
  
    const capacity = el('input', {
      class: 'input input--num',
      id: 'room-capacity',
      type: 'number',
      min: '1',
      value: String(room.capacity ?? ''),
      oninput: (event) => {
        room.capacity = Number(event.target.value);
        renderFoot();
      },
    });
  
    // One number. Zero reads as Free, in sage, as it does everywhere else —
    // and says plainly that a free space is not something steeple can publish.
    const priceNote = el('p', { class: 'field__hint' });
    const priceWord = el('span', { class: 'price price--sm' });
    const price = el('input', {
      class: 'input input--num',
      id: 'room-price',
      type: 'number',
      min: '0',
      step: '1',
      value: room.pricePerHour == null ? '' : String(room.pricePerHour),
      oninput: (event) => {
        room.pricePerHour = event.target.value === '' ? null : Number(event.target.value);
        drawPrice();
        renderFoot();
      },
    });
  
    function drawPrice() {
      const free = isFree(room.pricePerHour);
      priceWord.textContent = free ? 'Free' : '';
      priceWord.classList.toggle('price--free', free);
      priceNote.textContent = free && withSteeple() ? FREE_NOTE : '';
      priceWord.hidden = !free;
    }
    drawPrice();
  
    const rules = el('textarea', {
      class: 'input input--area',
      id: 'room-rules',
      rows: '2',
      placeholder: 'No alcohol. Chairs stacked at the end.',
      oninput: (event) => {
        room.houseRules = event.target.value;
      },
    });
    rules.value = room.houseRules ?? '';
  
    // Two kinds of question, so two shapes. What the host writes about the room
    // stands in a column of its own; what steeple needs to show it — the
    // photograph, the seats, the hourly price — stands beside it; and the three
    // vocabularies are chosen from underneath, on one aligned ledger. The step
    // used to be a single tall stack that no window could hold at once.
    return [
      noticeBlock(),
      el('div', { class: 'describe' }, [
        el('div', { class: 'describe__words' }, [
          labelled('Name', name),
          labelled('Description', description),
          labelled('House rules', rules),
        ]),
        el('div', { class: 'describe__facts' }, [
          photoField(),
          el('div', { class: 'describe__nums' }, [
            labelled('Capacity', capacity),
            el('div', { class: 'field' }, [
              el('label', { class: 'eyebrow', for: 'room-price', text: 'Price' }),
              el('div', { class: 'field__inline' }, [
                el('span', { class: 'field__prefix', text: '$' }),
                price,
                el('span', { class: 'field__suffix', text: 'per hour' }),
                priceWord,
              ]),
              priceNote,
            ]),
          ]),
        ]),
      ]),
      el('div', { class: 'chosens' }, [
        chosen('Amenities', [toggleSet('Amenities', AMENITY_VOCABULARY, amenities)]),
        chosen('Accessibility', [toggleSet('Accessibility features', ACCESS_VOCABULARY, access)]),
        welcomeField(activities),
      ]),
    ];
  }
  
  /**
   * The photograph steeple will not publish a space without — shown as the one
   * thing it is, a picture of the room, at the size a picture deserves. The
   * frame is the control: the file input lies over it, so a click anywhere
   * opens the picker and a chosen photograph fills the frame it will be seen
   * in rather than being named in a filename. It is also the step's give — the
   * frame takes whatever height the written column leaves, so the picture is as
   * large as the step can afford and nothing stands empty under it.
   */
  function photoField() {
    const tile = el('label', { class: 'shotpick', for: 'room-photo' });
    const input = el('input', {
      class: 'shotpick__input',
      id: 'room-photo',
      type: 'file',
      // The tile is a picture once it holds one, so the field says its own name.
      'aria-label': 'Photograph of the room',
      accept: 'image/jpeg,image/png,image/webp',
      onchange: async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        // A photograph is sized here, before it is sent (data/photo.js): what
        // the frame shows from this moment is the file steeple will be given,
        // not the twelve-megapixel one this browser was handed.
        const mine = (picking += 1);
        refused = null;
        working = true;
        drawPreview();
        const prepared = await prepareRoomPhoto(file);
        if (mine !== picking) return; // a second choice overtook this one
        working = false;
        if (!prepared.ok) {
          takeAway();
          refused = prepared.detail;
          drawPreview();
          announce?.(prepared.detail);
          return;
        }
        hold({ file: prepared.file, url: URL.createObjectURL(prepared.file), name: file.name, sent: false });
        drawPreview();
        renderFoot();
        announce?.(`${file.name} attached.`);
      },
    });
  
    // The picked file is read and re-encoded off the main path, so two quick
    // choices can be in flight at once: only the last one may land.
    let picking = 0;
    let working = false;
    let refused = null;
  
    /** Hold a prepared photograph, and let go of the last one's object URL. */
    function hold(photo) {
      const stale = draft.room.photo?.url;
      draft.room.photo = photo;
      if (stale && stale !== photo?.url && stale.startsWith('blob:')) URL.revokeObjectURL(stale);
    }
  
    function takeAway() {
      hold(null);
      working = false;
      input.value = '';
      renderFoot();
    }
  
    const remove = el(
      'button',
      {
        type: 'button',
        class: 'shotpick__remove',
        // The button stands inside the label that opens the picker: taking the
        // photograph away must not ask for another one in the same click.
        onclick: (event) => {
          event.preventDefault();
          event.stopPropagation();
          refused = null;
          takeAway();
          drawPreview();
        },
      },
      'Remove'
    );
  
    /**
     * What an empty frame says: the one thing it wants, and how to frame it —
     * or, when the last file could not be used, why, in the place the host is
     * already looking. A refusal is never a wall: the frame is still the picker.
     */
    function invitation() {
      const mark = el('span', { class: 'shotpick__mark' });
      mark.innerHTML = PHOTO_SVG; // static markup, no data in it
      return el('span', { class: 'shotpick__empty' }, [
        mark,
        el('span', { class: 'shotpick__prompt', text: refused ? 'Try another photograph' : 'Add a photograph' }),
        el('span', {
          class: `shotpick__hint${refused ? ' shotpick__hint--refused' : ''}`,
          text: refused ?? 'One wide shot of the whole space.',
        }),
      ]);
    }
  
    /** The moment a picked file is being read and sized down, said plainly. */
    const preparing = () =>
      el('span', { class: 'shotpick__empty' }, [
        el('span', { class: 'shotpick__prompt', text: 'Preparing the photograph…' }),
      ]);
  
    function drawPreview() {
      const photo = draft.room.photo;
      const busy = working && !photo;
      replaceChildren(tile, [
        input,
        ...(photo
          ? [
              el('img', { class: 'shotpick__thumb', src: photo.url ?? photo.remoteUrl, alt: '' }),
              el('span', { class: 'shotpick__veil', 'aria-hidden': 'true', text: 'Replace photograph' }),
              remove,
            ]
          : [busy ? preparing() : invitation()]),
      ]);
      tile.classList.toggle('is-filled', Boolean(photo));
      tile.classList.toggle('is-refused', Boolean(refused));
      tile.setAttribute('aria-busy', busy ? 'true' : 'false');
    }
    drawPreview();
  
    return tile;
  }
  
  /**
   * Welcoming everyone is the default and costs nothing; narrowing starts from
   * everything and asks the host to turn off what they cannot host, which is
   * how a hall keeper actually thinks about it.
   */
  function welcomeField(activities) {
    const chips = el('div', { class: 'welcome__chips' });
  
    // The chips are the sentence: what is on is what may ask. Nothing here says
    // so in words — the footer already names what a listing still owes, which is
    // where the host looks when the way forward is greyed out.
    function draw() {
      replaceChildren(
        chips,
        draft.room.welcomeAll
          ? []
          : [toggleSet('Activities', ACTIVITY_TYPES, activities, () => renderFoot())]
      );
    }
  
    const choose = (all) => {
      // Narrowing starts from everything; going back to everyone remembers what
      // was turned off, so the choice can be tried both ways without retyping.
      if (all) draft.room.narrowed = [...activities];
      draft.room.welcomeAll = all;
      activities.clear();
      const next = all ? ACTIVITY_TYPES : (draft.room.narrowed ?? ACTIVITY_TYPES);
      for (const activity of next.length ? next : ACTIVITY_TYPES) activities.add(activity);
      draw();
      renderFoot();
    };
  
    const segment = (label, all) =>
      el(
        'button',
        {
          type: 'button',
          class: `segment${draft.room.welcomeAll === all ? ' is-on' : ''}`,
          dataset: { welcome: all ? 'all' : 'some' },
          'aria-pressed': draft.room.welcomeAll === all ? 'true' : 'false',
          onclick: (event) => {
            for (const other of event.currentTarget.parentElement.children)
              other.classList.toggle('is-on', other === event.currentTarget);
            choose(all);
          },
        },
        label
      );
  
    draw();
    return chosen(
      'Who can use it',
      [
        el('div', { class: 'segments segments--flat', role: 'group', 'aria-label': 'Who can use it' }, [
          segment('Everyone', true),
          segment('Some activities only', false),
        ]),
        chips,
      ],
      'welcome'
    );
  }

  return describeStep();
}

