// A photograph, made here.
//
// The hosting tests upload a real image, because steeple's media pipeline
// decodes what it is given and refuses anything it cannot read — a fixture
// checked into the repo would be a binary nobody can review, and a stub would
// prove nothing. This writes a small honest PNG with node's own zlib.

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A truecolour PNG with a soft gradient — decodable, and clearly a test image. */
export function roomPhoto(width = 320, height = 220) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolour
  const raw = Buffer.alloc(height * (1 + width * 3));
  let at = 0;
  for (let y = 0; y < height; y += 1) {
    raw[at++] = 0; // filter: none
    for (let x = 0; x < width; x += 1) {
      raw[at++] = 150 + (((x * 60) / width) | 0);
      raw[at++] = 140 + (((y * 60) / height) | 0);
      raw[at++] = 120;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Write one where the browser can pick it up, and hand back the path. */
export function writeRoomPhoto(path) {
  writeFileSync(path, roomPhoto());
  return path;
}

/**
 * The photograph a phone actually takes: too many pixels, and too many bytes
 * for the API to accept as it stands (`MaxUploadBytes` is 10 MB). Noise rather
 * than a gradient on purpose — deflate would squeeze a smooth image down to
 * nothing, and the point of this fixture is its size on the wire. Seeded, so a
 * run's file is the same file every time.
 */
export function writeOversizedRoomPhoto(path, width = 2400, height = 1800) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const raw = Buffer.alloc(height * (1 + width * 3));
  let seed = 0x2f6e2b1;
  let at = 0;
  for (let y = 0; y < height; y += 1) {
    raw[at++] = 0; // filter: none
    for (let x = 0; x < width * 3; x += 1) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      raw[at++] = seed & 0xff;
    }
  }
  writeFileSync(
    path,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(raw, { level: 1 })),
      chunk('IEND', Buffer.alloc(0)),
    ])
  );
  return path;
}
