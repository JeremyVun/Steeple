// A picture of the room, or an honest stand-in for one.
//
// steeple's own room card does this: a photo when the church has uploaded one,
// and otherwise a lettered plate in the brand's tones — never a broken image,
// never a grey box with a torn-page icon. The plate's tone is picked from the
// name, so the same room keeps the same colour from session to session and the
// list reads as a set of places rather than a set of gaps.

import { el } from '../dom.js';

const TONES = ['terracotta', 'sage', 'paper'];

const toneFor = (seed) => {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) % 9973;
  return TONES[hash % TONES.length];
};

const initial = (name) => (name.trim()[0] ?? '·').toUpperCase();

export function createBanner(className = 'dm-banner') {
  const image = el('img', { class: 'dm-banner__img', alt: '', loading: 'lazy', decoding: 'async' });
  const plate = el('span', { class: 'dm-banner__letter', 'aria-hidden': 'true' });
  const element = el('span', { class: className }, [image, plate]);

  // A URL that answers with anything other than a picture is the same as no
  // picture: fall back rather than leave the browser's own broken mark.
  image.addEventListener('error', () => element.classList.add('is-lettered'));

  return {
    element,
    show({ url, name = '' }) {
      plate.textContent = initial(name);
      element.dataset.tone = toneFor(name || 'steeple');
      element.classList.toggle('is-lettered', !url);
      if (url && image.getAttribute('src') !== url) image.setAttribute('src', url);
      if (!url) image.removeAttribute('src');
    },
  };
}
