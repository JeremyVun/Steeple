#!/usr/bin/env node
// Web half of the shared API wire-token contract. No browser or server needed.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { APP_STATUS, COUNTER_STATUS, DAY_TOKENS } from '../src/data/store/model.js';
import { ACCESS_LABELS, ACTIVITY_LABELS, AMENITY_LABELS } from '../src/data/vocabulary.js';
import {
  ALL_FEATURE_FLAG_KEYS,
  PUBLIC_FEATURE_FLAG_KEYS,
  WIRE_TOKEN_SETS,
} from '../src/data/wireTokens.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const golden = JSON.parse(readFileSync(resolve(root, 'tests/fixtures/wire-tokens.json'), 'utf8'));

assert.deepEqual(WIRE_TOKEN_SETS, golden.tokenSets, 'web token registry drifted from the API');
assert.deepEqual(ALL_FEATURE_FLAG_KEYS, golden.featureFlags.all, 'web feature-flag registry drifted');
assert.deepEqual(PUBLIC_FEATURE_FLAG_KEYS, golden.featureFlags.public, 'web public flags drifted');

assert.deepEqual(Object.keys(ACTIVITY_LABELS), golden.tokenSets.activityTypes);
assert.deepEqual(Object.keys(AMENITY_LABELS), golden.tokenSets.amenities);
assert.deepEqual(Object.keys(ACCESS_LABELS), golden.tokenSets.accessibilityFeatures);
assert.deepEqual(Object.values(APP_STATUS), golden.tokenSets.applicationStatuses);
assert.deepEqual(Object.values(COUNTER_STATUS), golden.tokenSets.counterOfferStatuses);
assert.deepEqual(DAY_TOKENS, golden.tokenSets.weekdays);

console.log('ok    web wire-token maps match the API golden table');
