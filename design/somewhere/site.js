// SOMEWHERE — the site.
//
// Website 04 of the design section, and the fourth world of four. It is not a
// page: it is one persistent 3D scene that the visitor turns with their hands
// and travels into. There is no second screen and no route — every destination
// is the same world with the camera somewhere else in it.
//
// WHAT THIS FILE IS. The conductor, and nothing else. It owns the renderer, the
// clock and the state machine, and it delegates everything with an opinion:
//
//   planet.js       what shape the ground is
//   world.js        where everything stands on it
//   camera.js       how the world is held and how it is flown into
//   interaction.js  what the pointer is doing
//   life.js         what moves on its own
//   ui.js           the words
//
// THE ONE RULE THE RENDER LOOP DEPENDS ON. This world is expensive, so it must
// cost NOTHING when it is not the live world. `hide()` stops the loop outright
// — not a paused animation, no frame scheduled at all — and `show()` starts it
// again. A visitor who reads HUM and leaves never pays for a frame of this, and
// a visitor who leaves SOMEWHERE for NOCT stops paying immediately.
//
// WHY THE WORLD IS BUILT LAZILY. Terrain generation is ~200ms of solid main
// thread and the kit is 190KB over the wire. Both happen on `mount`, which the
// shell calls when a hand moves towards the bottom-right corner — not on page
// load. Nothing above is fetched or computed until somebody is actually on
// their way here.

import * as THREE from 'three';
import { animate, utils, motion, frame, EASE, el, $, $$ } from '../motion.js';
import { CORNERS, towards } from '../worlds/corners.js';
import { R, SKY, DESTINATIONS, BUILDING } from './content.js';
import { buildWorld, buildSky } from './world.js';
import { createCamera, destinationAnchor } from './camera.js';
import { createInteraction } from './interaction.js';
import { createLife } from './life.js';
import { createUI } from './ui.js';
import { disposeCraft } from './craft.js';
import { disposeKit } from './kit.js';

/* Pick a detail budget from what the device looks like. Deliberately crude —
   the alternative is a benchmark on first frame, which means the first thing
   the visitor sees is the world changing its mind about how good it looks. */
function quality() {
  const cores = navigator.hardwareConcurrency ?? 4;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 620;
  if (coarse && (small || cores <= 4)) return 'low';
  if (coarse || cores <= 4) return 'medium';
  return 'high';
}

export function createSomewhere(spec, host, context = {}) {
  const root = el('section', 'sw');
  root.dataset.world = spec.id;
  root.dataset.state = 'idle';
  root.tabIndex = -1;
  root.setAttribute('aria-label', `${spec.name} — world ${spec.id}`);
  root.style.setProperty('--sw-paper', spec.paper);
  root.style.setProperty('--sw-ink', spec.ink);
  root.style.setProperty('--sw-accent', spec.accent);

  const stage = el('div', 'sw-stage');
  const canvas = el('canvas', 'sw-canvas');
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-label',
    'A miniature world. Drag to turn it, or use the arrow keys. '
    + 'The four places on it can be opened from the list of destinations.');
  stage.appendChild(canvas);
  root.appendChild(stage);
  host.appendChild(root);

  /* ══ RENDERER ════════════════════════════════════════════════════════════
     `powerPreference: high-performance` matters on laptops with two GPUs — the
     integrated one will run this, badly, unless asked not to. Antialiasing is
     on because the world is full of small silhouettes against a flat sky, which
     is the worst possible case for aliasing. */
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    alpha: false,
  });
  const Q = quality();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, Q === 'low' ? 1.5 : 2));
  renderer.shadowMap.enabled = Q !== 'low';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  const scene = new THREE.Scene();
  const cam = createCamera(1);
  scene.add(cam.world);
  const sky = buildSky(scene);

  const ui = createUI(root, {
    onPick: (dest) => travel(dest),
    onBack: () => goBack(),
    onExplore: () => { ui.exploring = true; },
    onSound: (on) => sound(on),
  });

  /* ══ STATE ═══════════════════════════════════════════════════════════════ */
  let world = null;
  let life = null;
  let touch = null;
  let stop = null;              // the frame-loop unsubscribe, or null if stopped
  let here = null;              // the destination we are standing in, or null
  let built = false;
  let dead = false;

  const size = { w: 0, h: 0 };

  /* ══ BUILD ═══════════════════════════════════════════════════════════════
     Runs once, on mount. The `step` calls tick the loading list; the awaits
     between them are what let the browser paint it, so the list is a real
     progress report rather than four lines that appear together at the end. */
  async function boot() {
    const breathe = () => new Promise((r) => requestAnimationFrame(() => r()));

    ui.step(BUILDING[0]);
    await breathe();

    world = await buildWorld({ quality: Q });
    if (dead) return;

    ui.step(BUILDING[1]);
    ui.step(BUILDING[2]);
    await breathe();

    cam.world.add(world.group);
    life = createLife(world, { reduced: motion.reduced });
    life.warm(14);

    ui.step(BUILDING[3]);
    await breathe();

    touch = createInteraction(canvas, cam, world.landmarks, {
      onHover: () => {},
      onPick: (dest) => travel(dest),
    });

    built = true;
    resize();
    ui.ready();
    if (stop) touch.enabled = true;
  }

  /* ══ TRAVEL ══════════════════════════════════════════════════════════════ */
  function travel(dest) {
    if (!built || cam.mode === 'flying' || here === dest) return;
    here = dest;
    ui.busy = true;
    ui.exploring = true;
    touch.enabled = false;
    root.dataset.place = dest.id;

    /* Move the key light to the place we are going, in world space, at the
       moment we set off — so the shadows swing round during the flight and the
       destination is already lit when the camera gets there. Without this the
       sun stays parked for the globe view and half the destinations arrive on
       the night side. */
    cam.world.updateMatrixWorld(true);
    const a = destinationAnchor(dest);
    sky.focusOn(
      a.position.clone().applyMatrix4(cam.world.matrixWorld),
      a.normal.clone().applyQuaternion(cam.world.quaternion).normalize(),
    );

    cam.flyTo(dest, {
      onArrive: () => {
        ui.busy = false;
        ui.arrive(dest);
        touch.enabled = true;
      },
    });
  }

  function goBack() {
    if (!built || cam.mode === 'flying') return;
    here = null;
    ui.busy = true;
    ui.leave();
    touch.enabled = false;
    delete root.dataset.place;

    sky.focusOnWorld();

    cam.backToWorld({
      onArrive: () => {
        ui.busy = false;
        touch.enabled = true;
        ui.exploring = false;
        canvas.focus({ preventScroll: true });
      },
    });
  }

  /* ══ SOUND ═══════════════════════════════════════════════════════════════
     Deliberately a stub with a real toggle. The brief says sound is optional
     and must never block the world, and there are no ambience files in the
     project — so the control exists, remembers its state, and does nothing
     audible rather than pretending to. Wiring a bed in later is one function. */
  let audio = null;
  function sound(on) {
    root.dataset.sound = on ? 'on' : 'off';
    if (!on && audio) { audio.pause?.(); audio = null; }
  }

  /* ══ THE FRAME ═══════════════════════════════════════════════════════════
     One function, subscribed to the design section's shared clock. Everything
     that moves in this world is downstream of this call and nothing else
     schedules work of its own. */
  const ndc = new THREE.Vector3();
  const marks = [];

  function tick(dt) {
    if (!built) { renderer.render(scene, cam.camera); return; }

    const step = Math.min(dt, 50);   // a tab that was backgrounded must not lurch
    cam.update(step, touch.pointer);
    life.update(step);
    sky.update(step);

    // Where the landmark tags belong this frame. `behind` is a dot product
    // against the camera direction — a landmark facing away from us is on the
    // far side of the planet and must not be labelled.
    marks.length = 0;
    for (const lm of world.landmarks) {
      cam.project(lm.position, ndc);
      const worldPos = lm.position.clone().applyMatrix4(cam.world.matrixWorld);
      const behind = worldPos.z < -R * 0.06 || ndc.z > 1;
      marks.push({ dest: lm.dest, ndc: { x: ndc.x, y: ndc.y }, behind });
    }
    ui.positionMarks(marks, {
      hovered: touch.hovered,
      touch: window.matchMedia('(pointer: coarse)').matches,
      visible: cam.mode === 'globe',
    });

    renderer.render(scene, cam.camera);
  }

  /* ══ SIZE ════════════════════════════════════════════════════════════════ */
  function resize() {
    const w = stage.clientWidth || window.innerWidth;
    const h = stage.clientHeight || window.innerHeight;
    if (w === size.w && h === size.h) return;
    size.w = w; size.h = h;
    renderer.setSize(w, h, false);
    cam.resize(w / h);
  }

  const onResize = () => { if (stop) resize(); };
  window.addEventListener('resize', onResize, { passive: true });

  /* ══ ARRIVAL AND DEPARTURE ═══════════════════════════════════════════════
     The world-frame contract. Everything here is transform and opacity, and
     nothing measures layout while a transition is running. */
  function enter(timeline, ctx) {
    if (motion.reduced || !timeline) return;
    const dir = towards(ctx?.corner ?? spec.corner);

    // The stage arrives as a whole — a 3D scene cannot stagger its contents,
    // so the choreography is one push and the world's own motion does the rest.
    utils.set(stage, { opacity: 0, scale: 1.06 });
    timeline.add(stage, {
      opacity: 1, scale: 1, duration: 620, ease: EASE.rise,
    }, 0);

    const type = [$('.sw-title', root), $('.sw-welcome', root), $('.sw-sub', root),
      $('.sw-rule', root), $('.sw-cta', root), $('.sw-drag', root)].filter(Boolean);
    utils.set(type, { opacity: 0, y: 26 });
    timeline.add(type, {
      opacity: 1, y: 0, duration: 700,
      delay: (_, i) => 120 + i * 62,
      ease: EASE.rise,
    }, 0);
  }

  function exit(timeline, ctx) {
    if (motion.reduced || !timeline) return;
    const dir = towards(ctx?.corner ?? spec.corner);
    timeline.add(stage, {
      x: dir.x * 26, y: dir.y * 26, opacity: 0, scale: 0.97,
      duration: 320, ease: EASE.exit,
    }, 0);
    timeline.add($('.sw-ui', root), {
      opacity: 0, duration: 240, ease: EASE.exit,
    }, 0);
  }

  return {
    id: spec.id,
    root,

    show() {
      root.dataset.state = 'live';
      window.scrollTo(0, 0);
      resize();
      if (!built && !dead) boot();
      if (!stop) stop = frame.add(tick);
      if (touch) touch.enabled = true;
    },

    hide() {
      root.dataset.state = 'idle';
      // THE WHOLE POINT: unsubscribing from the clock is the only thing that
      // actually stops this world costing anything.
      stop?.();
      stop = null;
      if (touch) touch.enabled = false;
    },

    enter,
    exit,

    settle() {
      root.focus({ preventScroll: true });
      resize();
    },

    destroy() {
      dead = true;
      stop?.();
      stop = null;
      window.removeEventListener('resize', onResize);
      touch?.destroy();
      ui.destroy();
      sky.dispose();

      // Give back everything the GPU is holding. A world that unmounts without
      // this leaves its terrain, its kit and forty compiled shaders resident
      // for as long as the tab is open.
      scene.traverse((o) => {
        if (o.isMesh || o.isInstancedMesh) {
          o.geometry?.dispose();
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => m?.dispose?.());
        }
      });
      disposeCraft();
      disposeKit();
      renderer.dispose();
      utils.remove(root);
      root.remove();
    },
  };
}
