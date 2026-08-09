// Postprocessing: gentle bloom on the golden-hour light, a tilt-shift band that
// keeps the world feeling like a miniature, a warm paper grade, and a soft
// vignette. Journey takes over engine.render; at quality 'low' the composer is
// never built and the renderer draws straight to the canvas.
//
// A paper-coloured fullscreen quad rides on top of both paths — it is the
// crossfade used instead of the roll crane under prefers-reduced-motion.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { state } from '../core/bus.js';
import { approach } from './easing.js';

const PAPER = '#FBF7F0';

/**
 * Warm filmic grade + tilt-shift + vignette, applied in display space after
 * tone mapping so the palette stays exactly where it is aimed.
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTexel: { value: new THREE.Vector2(1 / 1440, 1 / 900) },
    uBlur: { value: 2.6 },
    uFocus: { value: 0.54 },
    uBand: { value: 0.13 },
    uVignette: { value: 0.82 },
    uWarmth: { value: 1.0 },
    uGrain: { value: 0.022 },
    uSat: { value: 1.07 },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uTexel;
    uniform float uBlur;
    uniform float uFocus;
    uniform float uBand;
    uniform float uVignette;
    uniform float uWarmth;
    uniform float uGrain;
    uniform float uSat;
    uniform float uTime;
    varying vec2 vUv;

    const vec3 GOLD  = vec3(1.000, 0.878, 0.690);
    const vec3 PAPER = vec3(0.984, 0.969, 0.941);
    const vec3 LUMA  = vec3(0.2126, 0.7152, 0.0722);

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    vec3 softenedSample(vec2 uv, vec2 r) {
      vec3 sum = texture2D(tDiffuse, uv).rgb * 0.28;
      sum += texture2D(tDiffuse, uv + vec2( 1.000,  0.000) * r).rgb * 0.09;
      sum += texture2D(tDiffuse, uv + vec2( 0.707,  0.707) * r).rgb * 0.09;
      sum += texture2D(tDiffuse, uv + vec2( 0.000,  1.000) * r).rgb * 0.09;
      sum += texture2D(tDiffuse, uv + vec2(-0.707,  0.707) * r).rgb * 0.09;
      sum += texture2D(tDiffuse, uv + vec2(-1.000,  0.000) * r).rgb * 0.09;
      sum += texture2D(tDiffuse, uv + vec2(-0.707, -0.707) * r).rgb * 0.09;
      sum += texture2D(tDiffuse, uv + vec2( 0.000, -1.000) * r).rgb * 0.09;
      sum += texture2D(tDiffuse, uv + vec2( 0.707, -0.707) * r).rgb * 0.09;
      return sum;
    }

    void main() {
      // Tilt-shift: the far band (up the frame) softens sooner than the near one.
      float d = vUv.y - uFocus;
      float band = d > 0.0 ? uBand * 0.85 : uBand * 1.25;
      float soft = smoothstep(band, band + 0.30, abs(d)) * uBlur;

      vec3 c = soft > 0.05
        ? softenedSample(vUv, uTexel * soft)
        : texture2D(tDiffuse, vUv).rgb;

      float l = dot(c, LUMA);
      // Filmic S-curve, kept gentle — this world is calm, not contrasty.
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.26);
      // Golden hour lives in the highlights; paper warmth lifts the shadows.
      float hi = smoothstep(0.52, 1.0, l);
      c = mix(c, c * GOLD, hi * 0.34 * uWarmth);
      float lo = 1.0 - smoothstep(0.0, 0.42, l);
      c += PAPER * (0.05 * lo * uWarmth);
      c = mix(vec3(dot(c, LUMA)), c, uSat);

      // Warm vignette: corners fall toward dusk, never toward black.
      vec2 q = (vUv - 0.5) * vec2(1.04, 1.0);
      float v = smoothstep(0.86, 0.28, length(q));
      c = mix(c * vec3(0.94, 0.90, 0.86), c, mix(1.0, v, uVignette));
      c *= mix(1.0 - 0.30 * uVignette, 1.0, v);

      c += (hash(gl_FragCoord.xy + uTime) - 0.5) * uGrain;

      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }
  `,
};

export function createPost(engine) {
  const { renderer, scene, camera } = engine;
  const enabled = state.quality !== 'low';

  // The crossfade wash — one quad, drawn over whichever path rendered the frame.
  const washScene = new THREE.Scene();
  const washCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const washMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(PAPER),
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    fog: false,
    toneMapped: false, // the wash is exactly paper, whatever the grade is doing
  });
  washScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), washMaterial));

  let composer = null;
  let grade = null;
  let bloom = null;

  if (enabled) {
    composer = new EffectComposer(renderer);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.addPass(new RenderPass(scene, camera));
    // Threshold above white on purpose: this world is nearly all paper and
    // sunlit sage. Only genuinely emissive things — windows, lanterns, the
    // low sun — are allowed to glow.
    bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.55,
      0.85,
      1.02
    );
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    grade = new ShaderPass(GradeShader);
    composer.addPass(grade);
  }

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (composer) {
      composer.setSize(w, h);
      bloom.setSize(w, h);
      grade.uniforms.uTexel.value.set(1 / w, 1 / h);
    }
  }
  window.addEventListener('resize', resize);
  resize();

  // Tilt-shift depth is a per-view mood, eased so it never snaps between depths.
  // `?tilt=` scales that mood: off, the tuned default, or the full model-village
  // effect where only a thin band of the world is in focus.
  const TILT_MODES = {
    off: { blur: 0, band: 0.5, spread: 0, sat: 1.07 },
    default: { blur: 3.4, band: 0.30, spread: 0.14, sat: 1.07 },
    strong: { blur: 7.0, band: 0.20, spread: 0.10, sat: 1.2 },
  };
  const mode = TILT_MODES[state.tilt] ?? TILT_MODES.default;
  if (grade) grade.uniforms.uSat.value = mode.sat;
  let tilt = 0.6;

  engine.render = function renderJourney() {
    if (composer) composer.render();
    else renderer.render(scene, camera);

    if (washMaterial.opacity > 0.002) {
      const previousAutoClear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.render(washScene, washCamera);
      renderer.autoClear = previousAutoClear;
    }
  };

  return {
    /** @param {number} amount 0..1 paper wash over the frame. */
    setFade(amount) {
      washMaterial.opacity = amount;
      washMaterial.visible = amount > 0.002;
    },
    update(dt, elapsed, targetTilt) {
      tilt = approach(tilt, targetTilt, 2.4, dt);
      if (!grade) return;
      grade.uniforms.uTime.value = elapsed;
      grade.uniforms.uBlur.value = mode.blur * tilt;
      grade.uniforms.uBand.value = mode.band - mode.spread * tilt;
    },
  };
}
