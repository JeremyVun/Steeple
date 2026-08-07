// A PHOTOGRAPH, PREPARED BEFORE IT LEAVES THE DEVICE.
//
// Steeple keeps three widths of every room photograph — 400, 800 and 1600 — and
// re-encodes all of them as JPEG on the server. So a 12 MP photograph straight
// off a phone spends ten megabytes of somebody's uplink to be thrown away on
// arrival: the pixels past 1600 are discarded, and the file the API accepts is
// smaller than the one the browser struggled to send.
//
// This is the one file that knows how a picked file becomes the file that is
// sent. Three things happen here, in this order:
//
//   · decode, honoring the EXIF orientation flag — a phone's portrait shot is
//     landscape pixels plus a rotation, and the canvas would otherwise bake the
//     wrong one in;
//   · draw it down to the widest width steeple keeps and re-encode as JPEG,
//     which also drops EXIF — the GPS in a photograph of a church hall never
//     leaves the device at all now, rather than being stripped on arrival;
//   · hand back a File the wire can take as-is.
//
// The server is still the gate, and its refusals are still the truth: anything
// this cannot read is passed through untouched for the API to judge in its own
// words. The one thing refused here is a file too big for the API to even
// receive, because a 413 arriving after a minute of uploading is not an answer
// anybody can act on.

/** The widest variant steeple keeps (MediaVariants.Widths) — past this is waste. */
const MAX_EDGE = 1600;

/**
 * The server re-encodes at quality 82, so this pass only has to not be the one
 * that limits the result: a touch above it, and the picture arrives with its
 * detail intact for the encoder that actually sets the final quality.
 */
const QUALITY = 0.85;

/** The API's own cap (ManageRoomsController.MaxUploadBytes), said in one place. */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export const PHOTO_TOO_BIG =
  'That photo is over 10 MB and this browser could not read it to size it down. Try a JPEG, PNG, or WebP.';

/** The API's own words for the same file, said here so nobody waits to hear them. */
export const PHOTO_UNREADABLE = 'That file isn’t a photo Steeple can read. Try a JPEG, PNG, or WebP.';

/**
 * Prepare a picked file for `POST /manage/rooms/{id}/photos`.
 *
 * @param {File} file the file the host chose
 * @returns {Promise<{ok:true,file:File,prepared:boolean}|{ok:false,detail:string}>}
 *   `prepared:false` means the bytes are the host's own — this browser could not
 *   read the file, and the API is left to say so in its own words.
 */
export async function prepareRoomPhoto(file) {
  if (!(file instanceof Blob)) return { ok: false, detail: PHOTO_UNREADABLE };

  // A file this browser cannot decode is one the frame could only show broken,
  // and one the API is going to refuse in these same words at the end of an
  // upload. Saying it at the moment of the choice costs the host nothing.
  const source = await decode(file);
  if (!source) return { ok: false, detail: file.size > MAX_PHOTO_BYTES ? PHOTO_TOO_BIG : PHOTO_UNREADABLE };

  try {
    const { width, height } = sizeOf(source);
    if (!width || !height) return passThrough(file);
    // Never upscale: a small photograph is sent at the size it was taken.
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const blob = await encode(
      source,
      Math.max(1, Math.round(width * scale)),
      Math.max(1, Math.round(height * scale))
    );
    // A picture is never made bigger by being prepared: a small flat source can
    // encode larger than it arrived, and then the host's own file is the better
    // one to send (the server re-encodes either way).
    if (!blob || (blob.size >= file.size && file.size <= MAX_PHOTO_BYTES)) return passThrough(file);
    return {
      ok: true,
      prepared: true,
      file: new File([blob], jpegName(file.name), { type: 'image/jpeg', lastModified: Date.now() }),
    };
  } catch {
    return passThrough(file);
  } finally {
    source.close?.();
  }
}

/**
 * The host's own bytes: this browser read the picture but could not re-encode
 * it (or would only have made it bigger), so the file goes as it came — unless
 * it is too big for the API to receive, which is the one thing said here.
 */
const passThrough = (file) =>
  file.size > MAX_PHOTO_BYTES ? { ok: false, detail: PHOTO_TOO_BIG } : { ok: true, file, prepared: false };

const sizeOf = (source) => ({
  width: source.naturalWidth || source.width,
  height: source.naturalHeight || source.height,
});

/**
 * `createImageBitmap` is the cheap path and the only one that can be *told* to
 * apply the orientation flag; where it is missing (or where the options bag is
 * not understood) an <img> decodes with the orientation applied by default.
 */
async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // An older engine, or a file it cannot read — the element says which.
    }
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    const answer = (value) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    image.onload = () => answer(image);
    image.onerror = () => answer(null);
    image.src = url;
  });
}

function encode(source, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return Promise.resolve(null);
  // JPEG has no transparency: a PNG's clear corners become paper here rather
  // than the black a bare canvas would hand the encoder.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, width, height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
}

const jpegName = (name) => `${String(name || 'photo').replace(/\.[^.]+$/, '')}.jpg`;
