// The brand, translated to pigment. Every colour in the village comes from here so
// the whole valley stays in one harmony: warm paper, sage, terracotta, golden hour.

import * as THREE from 'three';

export const PAPER = '#FBF7F0';
export const INK = '#2A2620';
export const TERRACOTTA = '#C0623F';

export const C = {
  paper: '#FBF7F0',
  paperWarm: '#F6E9D4',
  paperGold: '#F2CE96',
  goldDeep: '#E8B071',
  skyHigh: '#BFD2DA',
  skyMid: '#DCE4DF',

  sageDeep: '#4E6B4C',
  sageDark: '#5B7553',
  sage: '#7A9670',
  sageMid: '#8CA67E',
  sageLight: '#A9C098',
  sagePale: '#C6D6B6',
  sageMist: '#E1E9DC',
  meadow: '#9DB37C',
  ochre: '#C3B67E',
  wheat: '#D8C48E',

  terracotta: '#C0623F',
  terracottaLight: '#D2805C',
  terracottaDeep: '#9C4B2F',
  clay: '#B5654A',
  brick: '#BB7256',

  ivory: '#F6F0E4',
  ivoryShade: '#E6DCCA',
  stone: '#DCD2C2',
  stoneWarm: '#CDBFA6',
  sandstone: '#D8BE99',
  timber: '#8A6A4B',
  timberDark: '#6B5138',

  slate: '#59634F',
  slateLight: '#6E7A63',
  roofDark: '#7C513C',

  glass: '#FFD9A0',
  glassLit: '#FFE7B8',
  glassRest: '#B9C2BA',
  water: '#A7C3C4',
  waterDeep: '#82A7AC',

  asphalt: '#B0A796',
  gravel: '#DCCDB2',
  lineWhite: '#F3EDE0',
};

// three's colour management already reads hex literals as sRGB and stores them in
// the linear working space, so no manual conversion here.
const _c = new THREE.Color();
export function col(hex) {
  return new THREE.Color(hex);
}
/** Working-space rgb triple for vertex-colour writing. */
export function rgb(hex) {
  _c.set(hex);
  return [_c.r, _c.g, _c.b];
}

/** Blend two hex colours in sRGB and return a hex string. */
export function mix(a, b, t) {
  const ca = new THREE.Color(a);
  const cb = new THREE.Color(b);
  return `#${ca.lerp(cb, t).getHexString()}`;
}
