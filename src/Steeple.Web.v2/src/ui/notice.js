// A word about something that happened to you rather than something you did.
//
// One slip, low in the corner, in the same hand as the confirmation the request
// sheet leaves behind. It never blocks anything and it never asks anything: a
// session that has quietly expired is the case it exists for (D6) — the chip
// vanishing on its own is a page telling you nothing.
//
// It is `.slip`, not `.notice`: the listing flow's own inline messages already
// own that name (styles/host.css).

import { el, replaceChildren } from './dom.js';

const LINGER_MS = 12000;

export function createNotice() {
  const line = el('p', { class: 'slip__line' });
  const actions = el('div', { class: 'slip__actions' });
  const element = el('aside', { class: 'slip', role: 'status', hidden: true }, [line, actions]);

  let timer = null;

  function hide() {
    clearTimeout(timer);
    element.classList.remove('is-open');
    element.hidden = true;
  }

  /**
   * @param {string} text
   * @param {{label:string, onPick:() => void}|null} action  one way on, at most.
   */
  function show(text, action = null) {
    line.textContent = text;
    replaceChildren(
      actions,
      action
        ? [
            el(
              'button',
              {
                type: 'button',
                class: 'linkish',
                onclick: () => {
                  hide();
                  action.onPick();
                },
              },
              action.label
            ),
          ]
        : []
    );
    element.hidden = false;
    // The frame the fade starts from, read rather than waited for: a page with
    // nothing moving on it may not hand out another one soon.
    void element.offsetHeight;
    element.classList.add('is-open');
    clearTimeout(timer);
    timer = setTimeout(hide, LINGER_MS);
  }

  for (const type of ['pointerdown', 'pointerup', 'click', 'wheel']) {
    element.addEventListener(type, (event) => event.stopPropagation());
  }

  return { element, show, hide };
}
