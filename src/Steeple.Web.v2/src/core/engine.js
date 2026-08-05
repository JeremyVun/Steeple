// Renderer + scene + camera + frame loop. Owned by the scaffold — modules
// register per-frame callbacks via engine.onUpdate(fn(dt, elapsed)).
//
// The loop can be put down and picked up again: past the roll the visitor is in
// the product, the canvas is covered by the browse surface, and the world must
// cost exactly nothing. stop() leaves the last frame on the canvas; start()
// resumes from it without a jump in elapsed time.

import * as THREE from 'three';
import { state, bus } from './bus.js';

export function createEngine(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const params = new URLSearchParams(window.location.search);
  state.quality = params.get('q') === 'low' ? 'low' : 'high';
  const dprCap = state.quality === 'low' ? 1 : 2;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, dprCap));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.5,
    4000
  );
  camera.position.set(0, 260, 420);
  camera.lookAt(0, 0, 0);

  const updates = new Set();
  let frames = 0;
  let last = performance.now();
  let elapsed = 0;
  let running = false;
  let pauseWhenWarm = false;

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', resize);
  resize();

  const engine = {
    renderer,
    scene,
    camera,
    canvas,
    /** Register fn(dt, elapsed); returns unsubscribe. */
    onUpdate(fn) {
      updates.add(fn);
      return () => updates.delete(fn);
    },
    /** Journey may replace this to route rendering through postprocessing. */
    render() {
      renderer.render(scene, camera);
    },
    start() {
      // Until the loop has warmed up, start() is the boot call — it must not
      // cancel a pause the roll asked for on the way in, as a deep link does.
      if (window.__steepleReady) pauseWhenWarm = false;
      if (running) return;
      running = true;
      last = performance.now();
      renderer.setAnimationLoop(frame);
    },
    stop() {
      // The verification harness waits on window.__steepleReady before it does
      // anything at all: never put the loop down before it has been set.
      if (!window.__steepleReady) {
        pauseWhenWarm = true;
        return;
      }
      running = false;
      // Three schedules the next frame *after* our callback returns, so tearing
      // the loop down from inside it leaves an orphan running forever. Let the
      // frame finish first.
      queueMicrotask(() => {
        if (!running) renderer.setAnimationLoop(null);
      });
    },
    get running() {
      return running;
    },
  };

  function frame() {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    elapsed += dt;
    updates.forEach((fn) => fn(dt, elapsed));
    engine.render();
    if (++frames === 10) {
      window.__steepleReady = true;
      if (pauseWhenWarm) engine.stop();
    }
  }

  return engine;
}
