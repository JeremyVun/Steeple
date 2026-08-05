// Shared materials. Nearly every solid in the village uses one vertex-coloured
// lambert so geometry can be merged aggressively; only glow and foliage differ.

import * as THREE from 'three';
import { C, col } from './palette.js';

export const timeUniform = { value: 0 };

/** Warm the light, cool the shade — a painter's habit, applied in linear space
 *  just before tone mapping so nothing in the valley ever reads grey. */
function painterly(material, strength = 0.5) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uStrength = { value: strength };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uStrength;`
      )
      .replace(
        '#include <tonemapping_fragment>',
        `{
           float lum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
           float t = smoothstep(0.008, 0.30, lum);
           vec3 tint = mix(vec3(0.74, 0.86, 1.06), vec3(1.14, 1.03, 0.84), t);
           gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * tint, uStrength);
           gl_FragColor.rgb += vec3(0.030, 0.026, 0.018) * uStrength * (1.0 - t);
         }
         #include <tonemapping_fragment>`
      );
  };
  return material;
}

export function paperMaterial(opts = {}) {
  const m = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: opts.flat !== false,
    ...opts.props,
  });
  return painterly(m, opts.warmth ?? 0.42);
}

export function smoothPaperMaterial(opts = {}) {
  return paperMaterial({ ...opts, flat: false });
}

/** Emissive-looking material for lit windows, lanterns, glow pools. */
export function glowMaterial(color = C.glass, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    transparent: opacity < 1,
    opacity,
    fog: true,
    toneMapped: true,
  });
}

/** Foliage that breathes: vertex sway driven by one shared clock, zero CPU cost. */
export function swayMaterial({ instanced = false, amp = 1.0, freq = 0.55, base = 0 } = {}) {
  const m = paperMaterial({ warmth: 0.5 });
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    prev?.(shader, renderer);
    shader.uniforms.uTime = timeUniform;
    shader.uniforms.uAmp = { value: amp };
    shader.uniforms.uFreq = { value: freq };
    shader.uniforms.uBase = { value: base };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uTime; uniform float uAmp; uniform float uFreq; uniform float uBase;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         #ifdef USE_INSTANCING
           vec2 swayOrigin = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
         #else
           vec2 swayOrigin = position.xz;
         #endif
         float swayPhase = swayOrigin.x * 0.031 + swayOrigin.y * 0.047;
         float swayH = max(transformed.y - uBase, 0.0);
         float swayK = swayH * swayH * 0.006;
         transformed.x += sin(uTime * uFreq + swayPhase) * uAmp * swayK;
         transformed.z += cos(uTime * uFreq * 0.83 + swayPhase * 1.3) * uAmp * swayK * 0.7;`
      );
  };
  return m;
}

export function disposeMaterialCache() {}
