// The village breathes: paper clouds sliding across the ring of sky, a few birds
// on a slow circuit, and dust caught in the low sun. Nothing here ever performs.

import * as THREE from 'three';
import { Builder, blobShape } from './builder.js';
import { paperMaterial } from './materials.js';
import { makeRng, rngRange } from './rng.js';

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3(1, 1, 1);

/** Cut-out clouds standing on rings around the valley — they slide past each
 *  other as the camera drifts, which is the whole trick. */
export function buildClouds(style, quality) {
  const rng = makeRng(8081);
  const layers =
    style === 'diorama'
      ? [
          { radius: 1000, y: 235, count: 9, scale: 1.3, color: ['#EFCB98', '#FFFFFF'], speed: 0.0055 },
          { radius: 1450, y: 320, count: 8, scale: 2.0, color: ['#EED3AA', '#FDFAF3'], speed: -0.0036 },
          { radius: 2000, y: 430, count: 7, scale: 2.9, color: ['#E9D6BC', '#F9F4EB'], speed: 0.0022 },
        ]
      : [
          { radius: 1150, y: 270, count: 9, scale: 1.4, color: ['#EFCE9E', '#FFFFFF'], speed: 0.005 },
          { radius: 1650, y: 370, count: 8, scale: 2.2, color: ['#EED4AE', '#FDFAF4'], speed: -0.0032 },
          { radius: 2200, y: 470, count: 6, scale: 3.1, color: ['#EAD7BF', '#F9F5ED'], speed: 0.002 },
        ];

  const group = new THREE.Group();
  const rings = [];
  for (const layer of layers) {
    const ring = new THREE.Group();
    const n = quality === 'low' ? Math.max(4, layer.count - 2) : layer.count;
    for (let i = 0; i < n; i++) {
      const b = new Builder();
      const puffs = 3 + Math.floor(rng() * 3);
      const base = rngRange(rng, 30, 52) * layer.scale;
      for (let k = 0; k < puffs; k++) {
        const r = base * rngRange(rng, 0.42, 0.8);
        b.card(blobShape(r, 0.2, rng() * 6.283, 26, rngRange(rng, 0.5, 0.72)), 1.6, layer.color, {
          x: (k - (puffs - 1) / 2) * base * 0.62 + rngRange(rng, -6, 6),
          y: rngRange(rng, -r * 0.18, r * 0.3),
          bevelSize: 0.5,
          curveSegments: 4,
          shade: 0.92,
        });
      }
      const mesh = b.mesh(paperMaterial({ warmth: 0.3 }), { cast: false, receive: false });
      const a = (i / n) * Math.PI * 2 + rngRange(rng, -0.2, 0.2);
      mesh.position.set(
        Math.cos(a) * layer.radius,
        layer.y + rngRange(rng, -40, 55) * layer.scale,
        Math.sin(a) * layer.radius
      );
      mesh.rotation.y = -a - Math.PI / 2; // face the valley, not away from it
      mesh.rotation.z = rngRange(rng, -0.05, 0.05);
      mesh.frustumCulled = false;
      ring.add(mesh);
    }
    group.add(ring);
    rings.push({ ring, speed: layer.speed });
  }
  group.renderOrder = -9;
  return { group, rings };
}

const BIRD_COUNT = 16;

export function buildBirds(quality) {
  const b = new Builder();
  const wing = new THREE.BufferGeometry();
  const v = [0, 0, 0, -2.6, 0.9, -1.3, -2.4, 0.2, 0.9, 0, 0, 0, 2.4, 0.2, 0.9, 2.6, 0.9, -1.3];
  wing.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  wing.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(12), 2));
  wing.computeVertexNormals();
  b.add(wing, ['#4A4A44', '#7A776C'], { shade: 1 });
  const geo = b.build();

  const count = quality === 'low' ? 10 : BIRD_COUNT;
  const mesh = new THREE.InstancedMesh(
    geo,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: true }),
    count
  );
  mesh.frustumCulled = false;

  const rng = makeRng(5150);
  const birds = [];
  for (let i = 0; i < count; i++) {
    birds.push({
      cx: rngRange(rng, -260, 260),
      cz: rngRange(rng, -260, 260),
      r: rngRange(rng, 90, 260),
      y: rngRange(rng, 110, 210),
      speed: rngRange(rng, 0.055, 0.115) * (rng() < 0.5 ? -1 : 1),
      phase: rng() * 6.283,
      flap: rngRange(rng, 5.5, 8.5),
      scale: rngRange(rng, 1.5, 2.8),
    });
  }

  function update(elapsed) {
    for (let i = 0; i < birds.length; i++) {
      const b0 = birds[i];
      const a = b0.phase + elapsed * b0.speed;
      _p.set(
        b0.cx + Math.cos(a) * b0.r,
        b0.y + Math.sin(elapsed * 0.4 + b0.phase) * 6,
        b0.cz + Math.sin(a) * b0.r * 0.7
      );
      const flap = Math.sin(elapsed * b0.flap + b0.phase);
      _e.set(flap * 0.42, -a + (b0.speed > 0 ? -Math.PI / 2 : Math.PI / 2), 0);
      _q.setFromEuler(_e);
      _s.set(b0.scale, b0.scale, b0.scale);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  return { mesh, update };
}

const MOTE_VERT = /* glsl */ `
  attribute float aPhase;
  attribute float aSpeed;
  attribute float aSize;
  uniform float uTime;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    p.x += sin(uTime * aSpeed * 0.7 + aPhase * 1.3) * 11.0;
    p.y += sin(uTime * aSpeed + aPhase) * 7.0;
    p.z += cos(uTime * aSpeed * 0.6 + aPhase * 0.8) * 11.0;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = aSize * (420.0 / max(1.0, -mv.z));
    gl_Position = projectionMatrix * mv;
    vAlpha = 0.25 + 0.75 * (0.5 + 0.5 * sin(uTime * 1.1 + aPhase * 3.1));
  }
`;

const MOTE_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = dot(d, d);
    if (r > 0.25) discard;
    float a = smoothstep(0.25, 0.02, r) * vAlpha;
    gl_FragColor = vec4(uColor, a * 0.55);
  }
`;

export function buildMotes(quality, timeUniform) {
  const count = quality === 'low' ? 260 : 620;
  const rng = makeRng(60606);
  const pos = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  const speed = new Float32Array(count);
  const size = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * 520;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = rngRange(rng, 6, 130);
    pos[i * 3 + 2] = Math.sin(a) * r;
    phase[i] = rng() * 6.283;
    speed[i] = rngRange(rng, 0.18, 0.5);
    size[i] = rngRange(rng, 1.4, 4.2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geo.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: MOTE_VERT,
    fragmentShader: MOTE_FRAG,
    uniforms: { uTime: timeUniform, uColor: { value: new THREE.Color('#FFE0AE') } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 5;
  return points;
}
