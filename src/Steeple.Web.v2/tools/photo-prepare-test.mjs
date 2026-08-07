// PREPARING A PHOTOGRAPH — the module, driven directly (src/data/photo.js).
//
// Not a journey and not a screen: this imports the module and hands it files,
// because sizing a picture is programmatic work and nothing about it needs a
// session, an API, or the listing flow. What it does need is a browser, because
// the work is done with browser APIs — `createImageBitmap`, a 2d canvas and
// `toBlob` have no Node equivalent, and jsdom has no canvas at all. So Chrome
// is the runtime here, not the subject.
//
// Needs only the app's own dev server (it serves the module). No API.
//
//   node tools/photo-prepare-test.mjs "http://localhost:5332"

import { closeBrowsers, launch } from './fixtures.mjs';

const origin = (process.argv[2] ?? 'http://localhost:5332').replace(/\/$/, '');

let checks = 0;
let failures = 0;

function check(label, ok, detail = '') {
  checks += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
}

const MB = 1024 * 1024;
const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;

const browser = await launch();
try {
  const page = await browser.newPage();
  console.log(`\n── preparing a photograph · ${origin} ──`);
  await page.goto(`${origin}/?world=off`, { waitUntil: 'domcontentloaded' });

  const report = await page.evaluate(async () => {
    const photo = await import('/src/data/photo.js');

    /** A photograph-shaped file: noise, so PNG cannot squeeze it into nothing. */
    const noisePng = (width, height) =>
      new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        const pixels = context.createImageData(width, height);
        let seed = 0x2f6e2b1;
        for (let i = 0; i < pixels.data.length; i += 4) {
          seed ^= seed << 13;
          seed ^= seed >>> 17;
          seed ^= seed << 5;
          pixels.data[i] = seed & 0xff;
          pixels.data[i + 1] = (seed >>> 8) & 0xff;
          pixels.data[i + 2] = (seed >>> 16) & 0xff;
          pixels.data[i + 3] = 255;
        }
        context.putImageData(pixels, 0, 0);
        canvas.toBlob((blob) => resolve(new File([blob], 'hall.png', { type: 'image/png' })), 'image/png');
      });

    /** A flat little image: PNG holds it in a few hundred bytes, JPEG cannot. */
    const flatPng = (width, height) =>
      new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        context.fillStyle = '#e8e0d2';
        context.fillRect(0, 0, width, height);
        canvas.toBlob((blob) => resolve(new File([blob], 'plate.png', { type: 'image/png' })), 'image/png');
      });

    /**
     * The photograph a phone takes held sideways: landscape pixels plus an
     * orientation flag saying "turn this a quarter". A canvas that ignores the
     * flag bakes the wrong one in, and the room is on the map sideways forever.
     * So: a real JPEG, with a hand-built EXIF block (orientation 6) spliced in
     * after the start marker, which is exactly what the camera writes.
     */
    const sidewaysJpeg = (width, height) =>
      new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        // Noise, like the other fixtures: a flat plate re-encodes *larger* than
        // it arrived, and the module would rightly hand back the host's own
        // file — which would leave this case proving nothing about turning it.
        const pixels = context.createImageData(width, height);
        let seed = 0x51f3a7;
        for (let i = 0; i < pixels.data.length; i += 4) {
          seed ^= seed << 13;
          seed ^= seed >>> 17;
          seed ^= seed << 5;
          pixels.data[i] = seed & 0xff;
          pixels.data[i + 1] = (seed >>> 8) & 0xff;
          pixels.data[i + 2] = (seed >>> 16) & 0xff;
          pixels.data[i + 3] = 255;
        }
        context.putImageData(pixels, 0, 0);
        canvas.toBlob(async (blob) => {
          const jpeg = new Uint8Array(await blob.arrayBuffer());
          const exif = new Uint8Array([
            0xff, 0xe1, 0x00, 0x22, // APP1, 34 bytes
            0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
            0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, // little-endian TIFF header
            0x01, 0x00, // one entry
            0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, // orientation = 6
            0x00, 0x00, 0x00, 0x00, // no next IFD
          ]);
          const out = new Uint8Array(jpeg.length + exif.length);
          out.set(jpeg.subarray(0, 2), 0); // SOI
          out.set(exif, 2);
          out.set(jpeg.subarray(2), 2 + exif.length);
          resolve(new File([out], 'sideways.jpg', { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.9);
      });

    const holdsExif = async (file) => {
      const head = new Uint8Array(await file.slice(0, 8192).arrayBuffer());
      const marker = [0x45, 0x78, 0x69, 0x66]; // "Exif"
      for (let i = 0; i < head.length - 4; i += 1) {
        if (marker.every((byte, n) => head[i + n] === byte)) return true;
      }
      return false;
    };

    const put = async (label, file) => {
      const started = performance.now();
      const answer = await photo.prepareRoomPhoto(file);
      const took = Math.round(performance.now() - started);
      if (!answer.ok) return { label, took, ok: false, detail: answer.detail, source: file.size };
      const bitmap = await createImageBitmap(answer.file).catch(() => null);
      const measured = { width: bitmap?.width ?? 0, height: bitmap?.height ?? 0 };
      bitmap?.close?.();
      return {
        label,
        took,
        ok: true,
        prepared: answer.prepared,
        source: file.size,
        size: answer.file.size,
        type: answer.file.type,
        name: answer.file.name,
        exif: await holdsExif(answer.file),
        ...measured,
      };
    };

    const bytes = (count) => new Uint8Array(count);
    return {
      cap: photo.MAX_PHOTO_BYTES,
      words: { tooBig: photo.PHOTO_TOO_BIG, unreadable: photo.PHOTO_UNREADABLE },
      phone: await put('phone', await noisePng(2400, 1800)),
      middling: await put('middling', await noisePng(900, 600)),
      // Small and flat enough that JPEG's own overhead beats PNG on it — the
      // one shape where preparing would cost bytes rather than save them.
      little: await put('little', await flatPng(24, 24)),
      sideways: await put('sideways', await sidewaysJpeg(1200, 600)),
      notAPhoto: await put('notAPhoto', new File([bytes(40)], 'photo.jpg', { type: 'image/jpeg' })),
      hugeNotAPhoto: await put('hugeNotAPhoto', new File([bytes(11 * 1024 * 1024)], 'photo.jpg', { type: 'image/jpeg' })),
    };
  });

  // ── 1. the photograph a phone takes ───────────────────────────────────────
  console.log('\n1. a 12-megapixel photograph, prepared');
  const phone = report.phone;
  check('the file chosen is one the API would refuse whole', phone.source > report.cap, `${(phone.source / MB).toFixed(1)} MB vs a ${(report.cap / MB).toFixed(0)} MB cap`);
  check('it is taken, not refused', phone.ok === true, phone.detail ?? '');
  check('and it was prepared rather than passed through', phone.prepared === true);
  check('drawn down to the widest variant steeple keeps', phone.width === 1600 && phone.height === 1200, `${phone.width}×${phone.height}`);
  check('sent as a JPEG', phone.type === 'image/jpeg' && phone.name.endsWith('.jpg'), `${phone.type} · ${phone.name}`);
  check('and it comfortably clears the cap now', phone.size < report.cap / 4, `${(phone.source / MB).toFixed(1)} MB → ${kb(phone.size)}`);
  check('with no metadata riding along', phone.exif === false);
  check('in a moment, not a minute', phone.took < 4000, `${phone.took}ms`);

  // ── 2. what must not change ───────────────────────────────────────────────
  console.log('\n2. what preparing must never do');
  const middling = report.middling;
  check('a photograph inside the widest width keeps its size', middling.width === 900 && middling.height === 600, `${middling.width}×${middling.height}`);
  check('and is still made lighter', middling.prepared === true && middling.size < middling.source, `${kb(middling.source)} → ${kb(middling.size)}`);
  // Three claims, and only together: a file that was re-encoded here, whose
  // pixels are the turned ones, and which carries no flag to be turned again.
  // (Measuring alone proves nothing — the browser applies the flag when it
  // reads a file too, so an untouched sideways photograph measures the same.)
  const sideways = report.sideways;
  check('a photograph taken sideways is re-encoded here', sideways.prepared === true);
  check(
    'and it is turned before it is sent, not left to be turned after',
    sideways.width === 600 && sideways.height === 1200,
    `${sideways.width}×${sideways.height} — the flag says turn 1200×600 a quarter`
  );
  check('the flag does not travel with it', sideways.exif === false);

  const little = report.little;
  check(
    'a picture JPEG would only inflate is left exactly as it came',
    little.prepared === false && little.size === little.source,
    `${little.source} bytes → ${little.size} bytes`
  );

  // ── 3. the two refusals ───────────────────────────────────────────────────
  console.log('\n3. files that are not photographs');
  check('a file that is not a photograph is refused', report.notAPhoto.ok === false);
  check('in the words the API would have used', report.notAPhoto.detail === report.words.unreadable, report.notAPhoto.detail);
  check('an unreadable file over the cap is refused for its size', report.hugeNotAPhoto.detail === report.words.tooBig, report.hugeNotAPhoto.detail);
  check('and the size the words quote is the API’s own', report.cap === 10 * MB, `${report.cap} bytes`);

  console.log(`\n${failures ? 'FAILURES' : 'all clear'}: ${checks - failures}/${checks} checks`);
} finally {
  await closeBrowsers();
}
process.exit(failures ? 1 : 0);
