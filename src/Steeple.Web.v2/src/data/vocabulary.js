// THE SHARED VOCABULARY — steeple's token registries (CONTRACTS §2.1) paired
// with the labels this product prints, held once. The wire always speaks the
// camelCase tokens; the catalog reads them into labels, the hosting chain
// writes labels back as tokens, and the store mirrors full rooms — all through
// this file, so no surface can drift alone. Unknown values are humanized or
// camelized rather than dropped: steeple is allowed to know more words than
// this bundle does.

export const ACTIVITY_LABELS = Object.freeze({
  children: 'Children',
  sports: 'Sports',
  community: 'Community',
  religious: 'Religious',
  arts: 'Arts',
  education: 'Education',
  music: 'Music',
});

export const AMENITY_LABELS = Object.freeze({
  parking: 'Parking',
  kitchen: 'Kitchen',
  restrooms: 'Restrooms',
  wifi: 'Wi-Fi',
  audioVisual: 'Audio/visual',
  tables: 'Tables',
  chairs: 'Chairs',
  heating: 'Heating',
  airConditioning: 'Air conditioning',
  stage: 'Stage',
  piano: 'Piano',
});

export const ACCESS_LABELS = Object.freeze({
  stepFreeAccess: 'Step-free access',
  accessibleRestroom: 'Accessible restroom',
  accessibleParking: 'Accessible parking',
  hearingLoop: 'Hearing loop',
  liftAccess: 'Lift access',
});

const humanize = (token) =>
  String(token)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());

const camel = (label) =>
  String(label)
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^./, (c) => c.toLowerCase());

/** label (lowercased) → token, built once per registry. */
const inverses = new Map();
const inverseOf = (registry) => {
  let index = inverses.get(registry);
  if (!index) {
    index = new Map(Object.entries(registry).map(([token, label]) => [label.toLowerCase(), token]));
    inverses.set(registry, index);
  }
  return index;
};

/** Wire tokens as the labels the product prints. */
export const toLabels = (tokens, registry) => (tokens ?? []).map((t) => registry[t] ?? humanize(t));

/** Printed labels (or already-tokens) as the wire's tokens, de-duplicated. */
export const toTokens = (values, registry) => {
  const index = inverseOf(registry);
  return [...new Set((values ?? []).map((value) => index.get(String(value).toLowerCase()) ?? camel(value)))];
};
