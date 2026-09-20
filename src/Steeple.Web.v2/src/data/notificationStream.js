const MAX_FRAME_BYTES = 8 * 1024;

export class NotificationStreamParseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotificationStreamParseError';
  }
}

function abortError(signal) {
  return signal?.reason instanceof Error
    ? signal.reason
    : new DOMException('The notification stream was withdrawn.', 'AbortError');
}

function readChunk(reader, signal) {
  if (signal?.aborted) return Promise.reject(abortError(signal));
  if (!signal) return reader.read();

  return new Promise((resolve, reject) => {
    const withdraw = () => {
      signal.removeEventListener('abort', withdraw);
      void reader.cancel(signal.reason).catch(() => {});
      reject(abortError(signal));
    };
    signal.addEventListener('abort', withdraw, { once: true });
    reader.read().then(
      (value) => {
        signal.removeEventListener('abort', withdraw);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', withdraw);
        reject(error);
      }
    );
  });
}

/** Consume complete notification invalidations until EOF, cancellation, or malformed input. */
export async function consumeNotificationStream(
  response,
  { signal = null, onInvalidate, onBytes = null } = {}
) {
  if (typeof onInvalidate !== 'function') throw new TypeError('onInvalidate must be a function');
  const reader = response?.body?.getReader?.();
  if (!reader) throw new NotificationStreamParseError('notification stream has no readable body');

  const decoder = new TextDecoder('utf-8', { fatal: true });
  let line = [];
  let eventType = '';
  let data = [];
  let frameBytes = 0;
  let afterCr = false;
  let resetAfterCr = false;

  const dispatch = () => {
    if (eventType === 'invalidate') {
      let payload;
      try {
        payload = JSON.parse(data.join('\n'));
      } catch {
        throw new NotificationStreamParseError('invalidate event carried malformed JSON');
      }
      if (payload === null || Array.isArray(payload) || typeof payload !== 'object') {
        throw new NotificationStreamParseError('invalidate event payload was not an object');
      }
      onInvalidate(payload);
    }
    eventType = '';
    data = [];
  };

  const finishLine = () => {
    if (line.length === 0) {
      dispatch();
      return true;
    }

    let value;
    try {
      value = decoder.decode(Uint8Array.from(line));
    } catch {
      throw new NotificationStreamParseError('notification stream carried invalid UTF-8');
    } finally {
      line = [];
    }
    if (value.startsWith(':')) return false;

    const colon = value.indexOf(':');
    const field = colon < 0 ? value : value.slice(0, colon);
    let fieldValue = colon < 0 ? '' : value.slice(colon + 1);
    if (fieldValue.startsWith(' ')) fieldValue = fieldValue.slice(1);
    if (field === 'event') eventType = fieldValue;
    else if (field === 'data') data.push(fieldValue);
    return false;
  };

  try {
    while (true) {
      const { done, value } = await readChunk(reader, signal);
      if (done) return;
      if (signal?.aborted) throw abortError(signal);
      const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
      if (bytes.byteLength > 0) onBytes?.(bytes.byteLength);

      for (const byte of bytes) {
        if (afterCr && byte === 0x0a) {
          frameBytes += 1;
          if (frameBytes > MAX_FRAME_BYTES) {
            throw new NotificationStreamParseError('notification stream frame exceeded 8 KiB');
          }
          afterCr = false;
          if (resetAfterCr) frameBytes = 0;
          resetAfterCr = false;
          continue;
        }
        if (afterCr && resetAfterCr) frameBytes = 0;
        afterCr = false;
        resetAfterCr = false;
        frameBytes += 1;
        if (frameBytes > MAX_FRAME_BYTES) {
          throw new NotificationStreamParseError('notification stream frame exceeded 8 KiB');
        }
        if (byte === 0x0d) {
          resetAfterCr = finishLine();
          afterCr = true;
        } else if (byte === 0x0a) {
          if (finishLine()) frameBytes = 0;
        } else {
          line.push(byte);
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
