// Golden hour, painted. A gradient dome plus three lights: a low warm key that
// throws long shadows, a sage/paper hemisphere bounce, and a cool rim from behind.

import * as THREE from 'three';
import { C, col } from './palette.js';

export const SUN_DIR = new THREE.Vector3(-0.78, 0.40, 0.48).normalize();

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const SKY_FRAG = /* glsl */ `
  varying vec3 vDir;
  uniform vec3 uHigh;
  uniform vec3 uMid;
  uniform vec3 uLow;
  uniform vec3 uSunColor;
  uniform vec3 uSun;
  uniform float uBandStrength;

  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    // Paper at the horizon, warm cream through the working band, and only the
    // last of the sky turns blue — the page never goes cold on you.
    vec3 c = mix(uLow, uMid, smoothstep(-0.06, 0.17, h));
    c = mix(c, uHigh, smoothstep(0.20, 0.86, h));

    float sd = max(dot(d, uSun), 0.0);
    c = mix(c, uSunColor, pow(sd, 2.2) * 0.55 * (1.0 - smoothstep(0.30, 0.85, h)));
    c += uSunColor * pow(sd, 110.0) * 0.9;

    // Faint horizontal wash bands — the grain of tinted paper.
    float band = sin(h * 34.0 + 1.2) * 0.5 + 0.5;
    c += (band - 0.5) * uBandStrength;

    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function buildSky(scene, style, quality) {
  const isDiorama = style === 'diorama';

  const uniforms = {
    uHigh: { value: col(isDiorama ? '#7FB3D6' : '#8ABBDA') },
    uMid: { value: col(isDiorama ? '#F0E4CA' : '#EEE4CD') },
    uLow: { value: col(isDiorama ? '#F9DFB2' : '#F8E1B8') },
    uSunColor: { value: col('#FFCE86') },
    uSun: { value: SUN_DIR.clone() },
    uBandStrength: { value: isDiorama ? 0.010 : 0.005 },
  };

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(3000, 32, 20),
    new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    })
  );
  dome.frustumCulled = false;
  dome.renderOrder = -100;
  // The dome rides with the camera. Standing still it would sail past the far
  // plane when the camera pulls back for arrival, punching a paper-white disc
  // through the middle of the sky.
  dome.onBeforeRender = (renderer, scene_, cam) => {
    dome.matrixWorld.setPosition(cam.position);
  };
  scene.add(dome);

  // Fog is the colour of the sky at the horizon, so the far hills dissolve into
  // the page instead of ending in a hard bright rim.
  scene.background = new THREE.Color(C.paper);
  scene.fog = isDiorama
    ? new THREE.Fog('#F2E2C6', 520, 2500)
    : new THREE.Fog('#F1E3CA', 620, 2300);

  const sun = new THREE.DirectionalLight('#FFD59A', 2.85);
  sun.position.copy(SUN_DIR).multiplyScalar(900);
  sun.castShadow = true;
  const s = sun.shadow;
  s.mapSize.set(2048, 2048);
  s.camera.left = -580;
  s.camera.right = 580;
  s.camera.top = 520;
  s.camera.bottom = -520;
  s.camera.near = 200;
  s.camera.far = 2000;
  s.bias = -0.0008;
  s.normalBias = 0.9;
  s.radius = 2.4;
  scene.add(sun);
  scene.add(sun.target);

  // Generous bounce: golden-hour shadows should stay warm and readable, never
  // become the dark two-thirds of a top-down frame.
  const hemi = new THREE.HemisphereLight('#FFEFD4', '#B0A075', 1.55);
  scene.add(hemi);

  const rim = new THREE.DirectionalLight('#B9D2E4', 0.5);
  rim.position.set(420, 240, -520);
  scene.add(rim);

  return { dome, sun, hemi, rim, uniforms };
}
