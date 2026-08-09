// THE ADDRESS, AND A QUIET WAY TO TAKE IT WITH YOU.
//
//   addressCopy(address, { textClass }) -> element
//
// A church's address is the one thing on a surface that is meant to leave it —
// it goes into a maps app, a group chat, a flyer — so it is one press away, and
// the press says so. Two surfaces need it now (the venue sheet, and a booking
// letter, where it is the answer to "where am I going on Monday"), and they say
// it the same way because it is the same act.
//
// The clipboard is not always ours to write to (an insecure origin, a browser
// that asks first, a refusal). When it is not, the address is selected instead
// so the copy the visitor makes by hand is still the right one, and the words
// under the button say which of the two happened.

import { el } from './dom.js';

// Two sheets of paper, one behind the other — the plainest drawing of "take a
// copy of this" there is. Hand-written markup, never anything from the data.
const COPY_ICON =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">' +
  '<rect x="5.4" y="1.6" width="9" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
  '<path d="M10.6 13.2a2 2 0 0 1-2 2H3.6a2 2 0 0 1-2-2V6.4a2 2 0 0 1 2-2" fill="none" ' +
  'stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';

const TICK_ICON =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">' +
  '<path d="M3 8.6 6.4 12 13 4.6" fill="none" stroke="currentColor" stroke-width="1.7" ' +
  'stroke-linecap="round" stroke-linejoin="round"/></svg>';

export function addressCopy(address, { textClass = 'sheet__address' } = {}) {
  const text = el('p', { class: textClass, text: address });
  // role=status rather than a live region on the button: the confirmation is a
  // state of the page, and it must not re-announce the button's own name.
  const said = el('span', { class: 'copyaddr__said', role: 'status' });

  const button = el('button', {
    type: 'button',
    class: 'copyaddr',
    title: 'Copy the address',
    'aria-label': `Copy the address — ${address}`,
  });
  button.innerHTML = COPY_ICON;

  let settle = 0;

  function confirm(word, ok) {
    clearTimeout(settle);
    button.innerHTML = ok ? TICK_ICON : COPY_ICON;
    button.classList.toggle('is-done', ok);
    said.textContent = word;
    settle = setTimeout(() => {
      button.innerHTML = COPY_ICON;
      button.classList.remove('is-done');
      said.textContent = '';
    }, 2400);
  }

  function select() {
    const range = document.createRange();
    range.selectNodeContents(text);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  button.addEventListener('click', async (event) => {
    // The letter's card sits inside surfaces that answer a press of their own;
    // taking a copy of the address is not asking to go anywhere.
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(address);
      confirm('Address copied', true);
    } catch {
      select();
      confirm('Selected — copy it from here', false);
    }
  });

  return el('div', { class: 'addressline' }, [text, button, said]);
}
