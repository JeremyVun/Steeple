import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { build } from 'vite';
import { paymentLine, rescindWarning, cancellationLine } from '../src/ui/money.js';

// Exercise the compiled production catalogue, including its initial map roster.
const result = await build({
  configFile: false,
  mode: 'production',
  logLevel: 'error',
  build: {
    write: false,
    minify: false,
    lib: { entry: 'src/data/catalog.js', formats: ['es'] },
  },
});
const output = (Array.isArray(result) ? result[0] : result).output;
const code = output.find((item) => item.type === 'chunk' && item.isEntry).code;
for (const status of [0, 404, 502, 503, 500, 429]) {
  globalThis.fetch = async () => {
    if (status === 0) throw new TypeError('Synthetic network failure');
    return new Response('{}', { status, headers: { 'content-type': 'application/json' } });
  };
  const catalog = await import(`data:text/javascript;base64,${Buffer.from(`${code}\n// case ${status}`).toString('base64')}`);
  assert.deepEqual(catalog.knownVenues(), [], `no provisional demo pins for ${status}`);
  await assert.rejects(catalog.searchListings(), `outage ${status} must not return demo inventory`);
  assert.deepEqual(catalog.heldResults(), []);
  assert.deepEqual(catalog.knownVenues(), []);
}
const offline = { payment: { mode: 'offline', perOccurrenceAmount: 120, currency: 'USD' } };
assert.match(paymentLine(offline), /\$120 a session/);
assert.match(paymentLine(offline), /Arrange payment directly/);
assert.match(rescindWarning(offline), /Arrange any refund directly/);
assert.doesNotMatch(cancellationLine(offline), /has been refunded/);
assert.doesNotMatch(paymentLine(offline), /Paid directly/);
assert.doesNotMatch(paymentLine({ payment: { mode: 'offline' } }), /\$|free/i);

// A version bump must reach every client and the served page in the same change.
const agreements = readFileSync('src/data/agreements.js', 'utf8');
const apiPolicy = readFileSync('../Steeple.Api/Services/Identity/CurrentAgreements.cs', 'utf8');
const mobile = readFileSync('../../mobile/lib/core/models/legal_documents.dart', 'utf8');
const version = apiPolicy.match(/const string Version = "([^"]+)"/)[1];
for (const text of [agreements, mobile, readFileSync('public/terms.html', 'utf8'), readFileSync('public/privacy.html', 'utf8')]) {
  assert.ok(text.includes(version), `all clients and legal pages must use ${version}`);
}
console.log('PASS: production outages never expose demo inventory; offline prices and legal versions agree');
