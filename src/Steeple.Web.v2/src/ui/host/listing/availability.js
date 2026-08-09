/** AvailabilityPanel workflow panel. */
export function renderAvailabilityPanel(context) {
  const { addBlackout, announce, blackoutsFor, draft, el, fmtDate, noticeBlock, onChanged, painter, removeBlackout, replaceChildren, todayIso } = context;

  function availabilityStep() {
    painter.load(draft.venueId, draft.roomId);
    const blackoutDate = el('input', {
      class: 'input',
      id: 'blackout-date',
      type: 'date',
      min: todayIso(),
    });
    const blackoutReason = el('input', {
      class: 'input',
      id: 'blackout-reason',
      type: 'text',
      // steeple keeps 200 characters of reason and refuses the whole rule set
      // over a longer one. A field that took more would trade a note nobody
      // reads for the week's open hours.
      maxlength: '200',
      placeholder: 'Parish festival',
    });
    const list = el('ul', { class: 'blackouts' });
  
    function drawBlackouts() {
      const entries = blackoutsFor(draft.venueId, draft.roomId);
      replaceChildren(
        list,
        entries.length
          ? entries.map((entry) =>
              el('li', { class: 'blackouts__item' }, [
                el('span', { text: `${fmtDate(entry.date, true)}${entry.reason ? ` · ${entry.reason}` : ''}` }),
                el(
                  'button',
                  {
                    type: 'button',
                    class: 'linkish',
                    dataset: { remove: entry.date },
                    onclick: () => {
                      removeBlackout(draft.venueId, draft.roomId, entry.date);
                      drawBlackouts();
                      onChanged?.();
                      announce?.(`${fmtDate(entry.date, true)} is open again.`);
                    },
                  },
                  'Remove'
                ),
              ])
            )
          : [el('li', { class: 'blackouts__empty', text: 'No closed days.' })]
      );
    }
    drawBlackouts();
  
    const add = el(
      'button',
      {
        type: 'button',
        class: 'pill pill--sm',
        dataset: { action: 'add-blackout' },
        onclick: () => {
          if (!blackoutDate.value) {
            blackoutDate.focus();
            return;
          }
          // A day already gone cannot be set aside: steeple refuses a whole
          // rule set over one past date, and keeping it here alone would show
          // the host a closed day the service has never heard of.
          if (blackoutDate.value < todayIso()) {
            blackoutDate.reportValidity();
            blackoutDate.focus();
            return;
          }
          addBlackout(draft.venueId, draft.roomId, blackoutDate.value, blackoutReason.value);
          announce?.(`${fmtDate(blackoutDate.value, true)} set aside.`);
          blackoutDate.value = '';
          blackoutReason.value = '';
          drawBlackouts();
          onChanged?.();
        },
      },
      'Add closed day'
    );
  
    return [
      el('p', {
        class: 'prose',
        text: 'Paint the hours the room can be used. Drag along a day to open it, drag back to close it. Arrows and Space do the same.',
      }),
      noticeBlock(),
      painter.element,
      el('section', { class: 'closed' }, [
        el('h3', { class: 'eyebrow', text: 'Closed days' }),
        el('p', { class: 'prose prose--sm', text: 'Dates set aside here are skipped when a booking is made.' }),
        // Labels on one line, the controls they name on the next, in one grid:
        // nested field boxes let the date picker's extra height push its label
        // out of line with the one beside it.
        el('div', { class: 'closed__form' }, [
          el('label', { class: 'eyebrow', for: 'blackout-date', text: 'Date' }),
          el('label', { class: 'eyebrow', for: 'blackout-reason', text: 'Reason' }),
          el('span', { 'aria-hidden': 'true' }),
          blackoutDate,
          blackoutReason,
          add,
        ]),
        list,
      ]),
    ];
  }

  return availabilityStep();
}

