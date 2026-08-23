// BUILDS — everything in the world that somebody made rather than grew.
//
// Houses, the clock tower, the lighthouse, bridges, the dock, the train, the
// boats. Same kit contract as props.js: a builder returns an array of
// { geo, mat }, and `build()` or `scatter()` turns it into scene objects.
//
// THE ONE THING EVERY BUILDING HERE HAS. Warm light in the windows. In every
// single reference image — the bright midday coast, the noon mountain, the dusk
// village — every window is lit. It is not realism, it is the diorama-maker
// putting a bulb inside the model, and it is the detail that makes a cluster of
// boxes read as a place where somebody lives. So `glow` windows are not an
// option on these builders; they are always on.
//
// THE ROOF RULE. Every roof overhangs its walls by a lot, sits at a steep
// pitch, and is a different material from the walls. Those three things are
// most of the style: the reference cottages are basically a big roof with a
// small house underneath, and pulling the roof in flush turns them instantly
// into generic low-poly huts.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PAL } from './content.js';
import { felt, painted, clay, water, glow, blob, softBox, post, cone, jitter, rng } from './craft.js';

const merge = (list) => {
  if (!list.length) return null;
  // Non-indexed everywhere: three's primitives disagree about indexing
  // (Icosahedron is not indexed, Box/Sphere/Cylinder/Cone/Torus are) and
  // `mergeGeometries` refuses a list that mixes the two. See props.js.
  const flat = list.map((g) => (g.index ? g.toNonIndexed() : g));
  return mergeGeometries(flat, false);
};

function put(geo, [x, y, z], { rx = 0, ry = 0, rz = 0, s = 1 } = {}) {
  if (s !== 1) geo.scale(s, s, s);
  if (rx) geo.rotateX(rx);
  if (ry) geo.rotateY(ry);
  if (rz) geo.rotateZ(rz);
  geo.translate(x, y, z);
  return geo;
}

/* A pitched roof. Two sloped slabs meeting at a ridge, overhanging on all four
   sides. Returns the slabs; the caller picks the colour. */
function roof(w, d, h, over = 0.16, seed = 1) {
  const slabs = [];
  const span = (d / 2 + over);
  const pitch = Math.atan2(h, span);
  const len = Math.sqrt(h * h + span * span);
  [-1, 1].forEach((side) => {
    const slab = softBox(w + over * 2, 0.045, len, 0.02, seed + side);
    slabs.push(put(slab, [0, h / 2, side * span / 2], { rx: side * -pitch }));
  });
  return slabs;
}

/* ══ COTTAGE ═══════════════════════════════════════════════════════════════
   The village's basic unit, in four roof colours. Warm plaster walls, exposed
   timber, a big overhanging roof, a chimney, and windows that are always lit. */
export function cottage(seed = 1, { roofColor = PAL.roofRed, storeys = 1 } = {}) {
  const rand = rng(seed);
  const wall = [];
  const timber = [];
  const tile = [];
  const lit = [];

  const w = 0.62 + rand() * 0.18;
  const d = 0.52 + rand() * 0.14;
  const h = 0.40 + storeys * 0.20;

  wall.push(put(softBox(w, h, d, 0.03, seed), [0, h / 2, 0]));

  // Corner posts and a belt rail — the half-timbering every reference house has.
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz], i) => {
    timber.push(put(softBox(0.055, h, 0.055, 0.012, seed + i), [
      sx * (w / 2 - 0.015), h / 2, sz * (d / 2 - 0.015),
    ]));
  });
  timber.push(put(softBox(w + 0.02, 0.05, d + 0.02, 0.01, seed), [0, h * 0.52, 0]));

  // Roof, ridge beam, chimney.
  const rh = 0.30 + rand() * 0.10;
  roof(w, d, rh, 0.15, seed).forEach((s) => tile.push(put(s, [0, h, 0])));
  tile.push(put(softBox(w + 0.34, 0.05, 0.06, 0.02, seed), [0, h + rh - 0.01, 0]));

  const cx = (rand() - 0.5) * w * 0.5;
  timber.push(put(softBox(0.13, 0.34, 0.13, 0.02, seed), [cx, h + rh * 0.55, -0.06]));

  // Windows. Two on the front, one on each side, all lit, all set slightly
  // proud of the wall so they catch a rim of shadow.
  const win = (x, y, z, ry, ww = 0.15, wh = 0.17) => {
    timber.push(put(softBox(ww + 0.05, wh + 0.05, 0.03, 0.008, seed), [x, y, z], { ry }));
    lit.push(put(softBox(ww, wh, 0.02, 0.004, seed), [
      x + Math.sin(ry) * 0.012, y, z + Math.cos(ry) * 0.012,
    ], { ry }));
  };
  win(-w * 0.24, h * 0.62, d / 2, 0);
  win(w * 0.24, h * 0.62, d / 2, 0);
  win(w / 2, h * 0.58, 0, Math.PI / 2, 0.13, 0.15);
  if (storeys > 1) win(0, h * 0.26 + 0.34, d / 2, 0, 0.13, 0.13);

  // Door — dark timber, with a step.
  timber.push(put(softBox(0.19, 0.30, 0.035, 0.01, seed), [0, 0.15, d / 2 + 0.005]));
  timber.push(put(softBox(0.26, 0.04, 0.14, 0.01, seed), [0, 0.02, d / 2 + 0.06]));

  return [
    { geo: merge(wall), mat: felt(rand() > 0.5 ? PAL.plaster : PAL.plasterDim, { bump: 0.05, repeat: 2 }) },
    { geo: merge(timber), mat: painted(PAL.woodDark) },
    { geo: merge(tile), mat: painted(roofColor, { rough: 0.9 }) },
    { geo: merge(lit), mat: glow(PAL.lamp) },
  ].filter((p) => p.geo);
}

/* ══ CLOCK TOWER ═══════════════════════════════════════════════════════════
   The village's landmark and the tallest thing that is not the mountain. Tall
   plaster shaft, a slate spire, a balcony, and a clock face on two sides.
   Straight from 4-Village.png, where it is the only object with a pure white
   element on it — which is exactly why it reads from any distance. */
export function clockTower(seed = 1) {
  const wall = [];
  const timber = [];
  const tile = [];
  const lit = [];
  const face = [];

  const w = 0.42;
  const h = 1.55;

  wall.push(put(softBox(w, h, w, 0.03, seed), [0, h / 2, 0]));
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz], i) => {
    timber.push(put(softBox(0.05, h, 0.05, 0.01, seed + i), [
      sx * (w / 2 - 0.012), h / 2, sz * (w / 2 - 0.012),
    ]));
  });

  // Balcony under the clock stage.
  timber.push(put(softBox(w + 0.20, 0.05, w + 0.20, 0.015, seed), [0, h * 0.70, 0]));

  // Clock faces, north and south. Cream disc, dark rim, two hands.
  [0, Math.PI].forEach((ry, i) => {
    const z = Math.cos(ry) * (w / 2 + 0.012);
    const x = Math.sin(ry) * (w / 2 + 0.012);
    timber.push(put(new THREE.CylinderGeometry(0.155, 0.155, 0.03, 14), [x, h * 0.86, z], { rx: Math.PI / 2, ry }));
    face.push(put(new THREE.CylinderGeometry(0.132, 0.132, 0.022, 14), [
      x + Math.sin(ry) * 0.008, h * 0.86, z + Math.cos(ry) * 0.008,
    ], { rx: Math.PI / 2, ry }));
    // Hands, frozen at the time in content.js. A clock in a diorama does not
    // need to run; it needs to be READABLE, and 5:40 gives two hands that are
    // clearly not the same hand.
    const hand = (len, angle, thick) => {
      const g = softBox(thick, len, 0.012, 0.003, seed);
      g.translate(0, len / 2, 0);
      g.rotateZ(angle);
      return put(g, [x + Math.sin(ry) * 0.016, h * 0.86, z + Math.cos(ry) * 0.016], { ry });
    };
    timber.push(hand(0.10, i ? -2.62 : 2.62, 0.018));
    timber.push(hand(0.075, i ? 1.05 : -1.05, 0.022));
  });

  // Spire, finial, and the lit belfry openings under it.
  tile.push(put(cone(w * 0.92, 0.46, 6, seed), [0, h + 0.23, 0]));
  timber.push(put(blob(0.05, 1, 0.1, seed), [0, h + 0.49, 0]));
  [0, Math.PI / 2, Math.PI, -Math.PI / 2].forEach((a) => {
    lit.push(put(softBox(0.16, 0.20, 0.02, 0.006, seed), [
      Math.sin(a) * (w / 2 + 0.004), h * 0.53, Math.cos(a) * (w / 2 + 0.004),
    ], { ry: a }));
  });
  lit.push(put(softBox(0.15, 0.19, 0.02, 0.006, seed), [0, 0.30, w / 2 + 0.004]));

  return [
    { geo: merge(wall), mat: felt(PAL.plaster, { bump: 0.05, repeat: 2 }) },
    { geo: merge(timber), mat: painted(PAL.woodDark) },
    { geo: merge(tile), mat: painted(PAL.roofBlue, { rough: 0.9 }) },
    { geo: merge(face), mat: felt(PAL.snow, { flat: false, bump: 0.02 }) },
    { geo: merge(lit), mat: glow(PAL.lamp) },
  ].filter((p) => p.geo);
}

/* ══ LIGHTHOUSE ════════════════════════════════════════════════════════════
   The coast's landmark. Red and white bands, a stone footing, a railed gallery,
   a teal cap — and the four buttons down the shaft that 4-Coast.png uses
   instead of portholes, which is the single most charming detail in the whole
   reference set and is reproduced here exactly. */
export function lighthouse(seed = 1) {
  const white = [];
  const red = [];
  const stone = [];
  const timber = [];
  const lit = [];
  const tile = [];

  const h = 1.9;
  const bands = 6;
  // The tapered tower, built as a stack of short cylinders so the bands are
  // geometry rather than texture.
  for (let i = 0; i < bands; i++) {
    const t0 = i / bands;
    const t1 = (i + 1) / bands;
    const r0 = 0.30 - t0 * 0.11;
    const r1 = 0.30 - t1 * 0.11;
    const seg = put(new THREE.CylinderGeometry(r1, r0, h / bands + 0.004, 14), [0, h * (t0 + t1) / 2, 0]);
    jitter(seg, 0.006, seed + i);
    (i % 2 ? red : white).push(seg);
  }

  stone.push(put(new THREE.CylinderGeometry(0.36, 0.42, 0.22, 14), [0, 0.11, 0]));

  // Buttons, four of them, up the white bands.
  [0.30, 0.52, 0.74].forEach((t, i) => {
    const r = 0.30 - t * 0.11;
    timber.push(put(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 10), [0, h * t, r], { rx: Math.PI / 2 }));
  });

  // Gallery: a deck, a rail, and the lamp room on top.
  timber.push(put(new THREE.CylinderGeometry(0.30, 0.30, 0.035, 14), [0, h, 0]));
  timber.push(put(new THREE.TorusGeometry(0.28, 0.016, 5, 16), [0, h + 0.10, 0], { rx: Math.PI / 2 }));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    timber.push(put(post(0.012, 0.014, 0.13, 4, seed + i), [Math.cos(a) * 0.28, h + 0.06, Math.sin(a) * 0.28]));
  }

  lit.push(put(new THREE.CylinderGeometry(0.17, 0.17, 0.24, 12), [0, h + 0.15, 0]));
  tile.push(put(cone(0.25, 0.22, 8, seed), [0, h + 0.37, 0]));
  timber.push(put(blob(0.045, 1, 0.1, seed), [0, h + 0.51, 0]));

  // Door at the base.
  timber.push(put(softBox(0.17, 0.26, 0.04, 0.01, seed), [0, 0.35, 0.245]));

  return [
    { geo: merge(white), mat: felt(PAL.snow, { bump: 0.05, repeat: 2 }) },
    { geo: merge(red), mat: felt(PAL.stripe, { bump: 0.05, repeat: 2 }) },
    { geo: merge(stone), mat: clay(PAL.rock) },
    { geo: merge(timber), mat: painted(PAL.woodDark) },
    { geo: merge(tile), mat: painted(PAL.roofBlue) },
    { geo: merge(lit), mat: glow(PAL.lampCore) },
  ].filter((p) => p.geo);
}

/* ══ CABIN ═════════════════════════════════════════════════════════════════
   The mountain's building: all timber, no plaster, and raised on stilts on the
   downhill side. 4-Mountain destination.png has three of them and every one is
   propped up on legs, which is what makes the ground read as sloping. */
export function cabin(seed = 1) {
  const rand = rng(seed);
  const wood = [];
  const dark = [];
  const tile = [];
  const lit = [];

  const w = 0.52;
  const d = 0.44;
  const h = 0.40;
  const stilt = 0.16 + rand() * 0.10;

  // Stilts and deck.
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz], i) => {
    dark.push(put(post(0.028, 0.036, stilt, 5, seed + i), [
      sx * (w / 2 - 0.05), stilt / 2, sz * (d / 2 - 0.05),
    ]));
  });
  wood.push(put(softBox(w + 0.14, 0.05, d + 0.14, 0.012, seed), [0, stilt, 0]));

  wood.push(put(softBox(w, h, d, 0.025, seed), [0, stilt + h / 2, 0]));
  // Horizontal log courses.
  for (let i = 0; i < 4; i++) {
    dark.push(put(softBox(w + 0.015, 0.022, d + 0.015, 0.006, seed + i), [0, stilt + 0.06 + i * 0.095, 0]));
  }

  const rh = 0.26;
  roof(w, d, rh, 0.19, seed).forEach((s) => tile.push(put(s, [0, stilt + h, 0])));
  dark.push(put(softBox(0.11, 0.28, 0.11, 0.02, seed), [w * 0.26, stilt + h + rh * 0.6, -0.05]));

  lit.push(put(softBox(0.19, 0.17, 0.02, 0.005, seed), [0, stilt + h * 0.60, d / 2 + 0.008]));
  lit.push(put(softBox(0.13, 0.14, 0.02, 0.005, seed), [w / 2 + 0.008, stilt + h * 0.58, 0], { ry: Math.PI / 2 }));
  dark.push(put(softBox(0.24, 0.22, 0.03, 0.008, seed), [0, stilt + h * 0.60, d / 2 + 0.002]));

  // Rail along the front of the deck.
  dark.push(put(softBox(w + 0.12, 0.02, 0.016, 0.004, seed), [0, stilt + 0.14, d / 2 + 0.06]));
  [-1, 0, 1].forEach((i) => {
    dark.push(put(post(0.013, 0.016, 0.14, 4, seed + i), [i * (w / 2.4), stilt + 0.08, d / 2 + 0.06]));
  });

  return [
    { geo: merge(wood), mat: painted(PAL.wood) },
    { geo: merge(dark), mat: painted(PAL.woodDark) },
    { geo: merge(tile), mat: painted(PAL.woodLight, { rough: 0.92 }) },
    { geo: merge(lit), mat: glow(PAL.lamp) },
  ].filter((p) => p.geo);
}

/* ══ LOOKOUT TOWER ═════════════════════════════════════════════════════════
   Four splayed legs, a platform, a rail and a little roof — the watch structure
   on the mountain reference. */
export function lookout(seed = 1) {
  const wood = [];
  const tile = [];
  const h = 0.78;

  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz], i) => {
    const g = post(0.022, 0.032, h, 5, seed + i);
    wood.push(put(g, [sx * 0.13, h / 2, sz * 0.13], { rz: -sx * 0.09, rx: sz * 0.09 }));
  });
  // Cross-bracing, which is what stops it looking like a table.
  [0.28, 0.54].forEach((t, i) => {
    wood.push(put(softBox(0.30, 0.018, 0.018, 0.004, seed + i), [0, h * t, -0.13]));
    wood.push(put(softBox(0.30, 0.018, 0.018, 0.004, seed + i), [0, h * t, 0.13]));
  });

  wood.push(put(softBox(0.44, 0.04, 0.44, 0.012, seed), [0, h, 0]));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    wood.push(put(post(0.018, 0.020, 0.24, 4, seed + i), [Math.cos(a) * 0.19, h + 0.12, Math.sin(a) * 0.19]));
  }
  wood.push(put(softBox(0.46, 0.02, 0.46, 0.006, seed), [0, h + 0.17, 0]));
  tile.push(put(cone(0.36, 0.20, 6, seed), [0, h + 0.34, 0]));

  return [
    { geo: merge(wood), mat: painted(PAL.wood) },
    { geo: merge(tile), mat: painted(PAL.woodDark) },
  ];
}

/* ══ MARKET STALL ══════════════════════════════════════════════════════════
   Four posts and a striped awning. The stripes are separate slabs so they are
   real geometry, and the awning has a scalloped front edge — both details are
   visible on 4-Village.png and both are what stop it reading as a carport. */
export function stall(seed = 1) {
  const wood = [];
  const cream = [];
  const gold = [];
  const crate = [];

  const w = 0.78;
  const d = 0.54;
  const h = 0.46;

  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz], i) => {
    wood.push(put(post(0.022, 0.028, h, 5, seed + i), [sx * w / 2, h / 2, sz * d / 2]));
  });
  wood.push(put(softBox(w + 0.08, 0.03, 0.03, 0.008, seed), [0, h, -d / 2]));
  wood.push(put(softBox(w + 0.08, 0.03, 0.03, 0.008, seed), [0, h + 0.08, d / 2]));

  // Awning: eight alternating stripes, tilted forward.
  const n = 8;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1) - 0.5) * (w + 0.10);
    const g = softBox((w + 0.10) / n + 0.004, 0.02, d + 0.16, 0.004, seed + i);
    (i % 2 ? gold : cream).push(put(g, [x, h + 0.045, 0], { rx: -0.14 }));
  }
  // Scalloped valance along the front.
  for (let i = 0; i < 9; i++) {
    const x = (i / 8 - 0.5) * (w + 0.06);
    const s = new THREE.SphereGeometry(0.036, 6, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    (i % 2 ? gold : cream).push(put(s, [x, h + 0.055, d / 2 + 0.07]));
  }

  // Counter and produce crates.
  wood.push(put(softBox(w, 0.05, d * 0.6, 0.01, seed), [0, h * 0.55, d * 0.1]));
  for (let i = 0; i < 3; i++) {
    crate.push(put(softBox(0.19, 0.10, 0.15, 0.012, seed + i), [(i - 1) * 0.23, h * 0.63, d * 0.1]));
  }
  return [
    { geo: merge(wood), mat: painted(PAL.wood) },
    { geo: merge(cream), mat: felt(PAL.snow, { bump: 0.04, repeat: 2 }) },
    { geo: merge(gold), mat: felt(PAL.button, { bump: 0.04, repeat: 2 }) },
    { geo: merge(crate), mat: painted(PAL.woodLight) },
  ];
}

/* ══ BRIDGES AND DECKS ═════════════════════════════════════════════════════ */

/* A plank bridge with rope rails — the one that crosses the river on the master
   world. `span` is its length so the same builder covers a footbridge and a
   crossing. */
export function bridge(span = 1.4, seed = 1) {
  const wood = [];
  const dark = [];
  const planks = Math.round(span / 0.11);
  for (let i = 0; i < planks; i++) {
    const t = i / (planks - 1) - 0.5;
    // A shallow arch, because a flat bridge over a river reads as a plank.
    const y = Math.cos(t * Math.PI) * 0.06;
    wood.push(put(softBox(0.095, 0.028, 0.46, 0.006, seed + i), [t * span, y, 0], { rz: -Math.sin(t * Math.PI) * 0.12 }));
  }
  [-1, 1].forEach((side) => {
    for (let i = 0; i < 4; i++) {
      const t = (i / 3 - 0.5) * 0.92;
      const y = Math.cos(t * Math.PI) * 0.06;
      dark.push(put(post(0.017, 0.021, 0.24, 4, seed + i), [t * span, y + 0.12, side * 0.22]));
    }
    dark.push(put(softBox(span * 0.98, 0.02, 0.02, 0.005, seed), [0, 0.235, side * 0.22]));
  });
  return [
    { geo: merge(wood), mat: painted(PAL.wood) },
    { geo: merge(dark), mat: painted(PAL.woodDark) },
  ];
}

/* ══ THE PIER ══════════════════════════════════════════════════════════════
   The harbour's dock, and the one structure in the world that has to exist in
   two places at once: it starts on dry land and finishes over open water.

   ITS LOCAL FRAME, and every number below depends on it:

     +X   runs OUT TO SEA. The origin is the LANDWARD end.
     y=0  is the DECK. Everything structural hangs below it.

   WHY THE PILINGS GET LONGER AS THEY GO OUT, and why that is not a fudge. The
   deck is flat — piers are — but the thing it is built over is a sphere of
   radius 10 that curves away underneath it, and the seabed drops at the
   shoreline as well. Over a 2.6-unit pier the two together come to the better
   part of a unit. A single piling length would leave the landward posts buried
   to their necks and the seaward ones dangling in mid-air, which is exactly
   how a dock ends up looking like it is floating. `deep0` and `deepen` are the
   two numbers the caller tunes against the real terrain, and world.js reads
   them straight off `heightAt`. */
export function pier(len = 2.6, seed = 1, {
  width = 0.62,
  deep0 = 0.26,        // how far the landward pilings reach below the deck
  deepen = 0.26,       // extra depth per unit of X, following the seabed down
  headWidth = 1.05,    // the wider landing at the seaward end
  headLen = 0.72,
  ramp = 0.52,         // how far back the shore ramp reaches, into -X
  rampDrop = 0.20,     // and how far down — set to the deck's height above the apron
} = {}) {
  const wood = [];
  const dark = [];
  const rope = [];

  const halfW = width / 2;
  const halfH = headWidth / 2;
  // How wide the deck is at a given x — the pier flares into its head.
  const wAt = (x) => (x > len - headLen ? halfH : halfW);

  /* THE DECK. Planks laid ACROSS the pier, which is the way a jetty is
     actually boarded and also the way the reference reads: a row of short
     boards, not one long plank. Each gets a hair of jitter in its length so
     the outer edge is ragged rather than sawn. */
  const gap = 0.088;
  const planks = Math.round(len / gap);
  for (let i = 0; i < planks; i++) {
    const x = (i + 0.5) * (len / planks);
    const w = wAt(x) * 2 + (((i * 37) % 11) - 5) * 0.004;
    wood.push(put(softBox(gap * 0.82, 0.026, w, 0.005, seed + i), [x, 0, 0]));
  }

  /* THE LANDWARD RAMP. The deck stands a clear step above the apron so the
     pilings read as posts rather than as kerbstones — which leaves the shore
     end hanging in mid-air unless something walks it down to the ground. Four
     planks on a slope, running back off the origin into negative X, do it.
     Without this the pier is a jetty nobody could get onto. */
  for (let i = 0; i < 4; i++) {
    const t = (i + 0.5) / 4;
    wood.push(put(softBox(ramp / 4 * 0.86, 0.024, halfW * 1.9, 0.005, seed + i), [
      -t * ramp, -t * rampDrop, 0,
    ], { rz: Math.atan2(rampDrop, ramp) }));
  }

  // Stringers: the two beams the planks are nailed to, running the length.
  [-1, 1].forEach((side) => {
    dark.push(put(softBox(len, 0.042, 0.055, 0.008, seed), [len / 2, -0.034, side * (halfW - 0.07)]));
  });
  // And a pair more under the head, which is wider than the run.
  [-1, 1].forEach((side) => {
    dark.push(put(softBox(headLen, 0.042, 0.055, 0.008, seed), [
      len - headLen / 2, -0.034, side * (halfH - 0.08),
    ]));
  });

  /* THE PILINGS. Bents of two, down the pier, each pair longer than the last.
     They are pushed a little proud of the deck edge so they read as posts the
     deck is resting ON rather than as legs hanging out of its underside. */
  const bents = Math.max(3, Math.round(len / 0.62));
  for (let i = 0; i <= bents; i++) {
    const x = (i / bents) * (len - 0.12) + 0.06;
    const w = wAt(x) - 0.045;
    const depth = deep0 + x * deepen;
    [-1, 1].forEach((side) => {
      dark.push(put(post(0.036, 0.044, depth, 6, seed + i * 2 + side), [x, -depth / 2 + 0.01, side * w]));
    });
    // A cross-brace between the pair, just under the deck, on every other bent.
    if (i % 2 === 0) {
      dark.push(put(softBox(0.030, 0.028, w * 2, 0.006, seed + i), [x, -0.085, 0]));
    }
  }

  /* THE HEAD. Four mooring bollards with rope rings, and a ladder over the
     edge — the two details that say a boat ties up here. */
  const bx = len - headLen * 0.5;
  [[bx - 0.22, 1], [bx + 0.22, 1], [bx - 0.22, -1], [bx + 0.22, -1]].forEach(([x, side], i) => {
    const z = side * (halfH - 0.06);
    dark.push(put(post(0.032, 0.040, 0.22, 6, seed + i), [x, 0.10, z]));
    dark.push(put(blob(0.040, 0, 0.10, seed + i), [x, 0.215, z]));
    rope.push(put(new THREE.TorusGeometry(0.044, 0.009, 4, 9), [x, 0.145, z], { rx: Math.PI / 2 }));
  });

  // A rope slung in a shallow catenary between the two bollards down one side.
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const x = (bx - 0.22) + t * 0.44;
    const y = 0.145 - Math.sin(t * Math.PI) * 0.055;
    rope.push(put(new THREE.CylinderGeometry(0.008, 0.008, 0.062, 5), [x, y, halfH - 0.06], { rz: Math.PI / 2 }));
  }

  // The ladder, down the seaward face into the water.
  {
    const x = len - 0.03;
    [-1, 1].forEach((side) => {
      dark.push(put(post(0.014, 0.014, 0.52, 4, seed), [x, -0.24, side * 0.085]));
    });
    for (let i = 0; i < 4; i++) {
      dark.push(put(softBox(0.016, 0.014, 0.19, 0.004, seed + i), [x, -0.06 - i * 0.12, 0]));
    }
  }

  return [
    { geo: merge(wood), mat: painted(PAL.wood) },
    { geo: merge(dark), mat: painted(PAL.woodDark) },
    { geo: merge(rope), mat: felt(PAL.cloth, { flat: false, bump: 0.08, repeat: 1 }) },
  ].filter((p) => p.geo);
}

/* ══ THE TRAIN ═════════════════════════════════════════════════════════════
   A stubby steam locomotive and its carriages, straight off the vehicles row of
   the style sheet: black boiler, red frame, brass dome and a big flared funnel,
   with the proportions pushed well past reality. A scale locomotive at this
   size reads as a smudge; a toy one reads as a toy, which is the brief.

   ══ TWO CONVENTIONS EVERYTHING ON RAILS OBEYS ══════════════════════════════

   1. +X IS THE DIRECTION OF TRAVEL. `ride()` in life.js orients a vehicle by
      rotating it so its local +X lies along the track tangent, so a vehicle
      modelled down any other axis rides BROADSIDE. That is not hypothetical:
      the Blender kit's LOCO, CARR and BOAT are all modelled along Z, and the
      train really was running sideways down its own rails.

   2. LOCAL y = 0 IS THE RAILHEAD, and these are modelled at final world scale
      rather than at some convenient unit size. Both halves matter. Wheels can
      then be placed at exactly the rails' own half-gauge — ±0.105, the number
      world.js lays the rail instances at — and a wheel of radius r has its hub
      at y = r and its tread on y = 0, which is where the rail top is. Nothing
      has to be scaled into agreement afterwards, so nothing can drift out of
      it. life.js rides the train at `railHeight + RAIL_TOP`, and that is the
      whole of the vertical alignment.

   The gauge is exported because life.js and world.js both need to agree with
   it, and a third copy of `0.105` is a third chance to be wrong. */
export const GAUGE = 0.105;      // rail centre offset either side, world units
export const RAIL_TOP = 0.053;   // railhead above `railHeight`, world units

/* A barrel roof: a cylinder lying along X, squashed flat.

   The squash has to happen AFTER the rotation, which is exactly what `put()`
   cannot do — it scales first, then rotates — and getting that backwards is
   what turned the cab roof into a loaf of bread. Rotating the geometry here and
   scaling it afterwards keeps `height` meaning height. */
function barrel(halfWidth, length, halfHeight, at) {
  const geo = new THREE.CylinderGeometry(halfWidth, halfWidth, length, 14);
  geo.rotateZ(Math.PI / 2);
  geo.scale(1, halfHeight / halfWidth, 1);
  geo.translate(at[0], at[1], at[2]);
  return geo;
}

/* A wheel: dark tyre, coloured centre, brass hub. Drawn as a disc lying across
   the track — the axle runs on Z, so the cylinder is tipped about X. */
function wheel(dark, tint, brass, x, z, r, seed) {
  const face = Math.sign(z) * 0.018;
  dark.push(put(new THREE.CylinderGeometry(r, r, 0.030, 12), [x, r, z], { rx: Math.PI / 2 }));
  tint.push(put(new THREE.CylinderGeometry(r * 0.74, r * 0.74, 0.032, 12), [x, r, z + face * 0.5], { rx: Math.PI / 2 }));
  brass.push(put(new THREE.CylinderGeometry(r * 0.22, r * 0.22, 0.036, 8), [x, r, z + face], { rx: Math.PI / 2 }));
  // Three spokes, which is what stops a wheel reading as a bottle cap.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI + seed * 0.3;
    brass.push(put(softBox(r * 1.35, 0.014, 0.012, 0.004, seed + i), [x, r, z + face], { rz: a }));
  }
}

export function locomotive(seed = 1) {
  const black = [];
  const red = [];
  const brass = [];
  const lit = [];

  // ── FRAME ── a red running board with a deeper valance under it, which is
  // what gives the loco a waist instead of a slab side.
  red.push(put(softBox(0.60, 0.030, 0.25, 0.010, seed), [0.01, 0.100, 0]));
  red.push(put(softBox(0.54, 0.050, 0.20, 0.012, seed), [0.01, 0.072, 0]));

  // ── BOILER ── a cylinder down X, with a fatter smokebox at the front and a
  // domed smokebox door on the very nose.
  black.push(put(new THREE.CylinderGeometry(0.072, 0.072, 0.34, 14), [0.10, 0.187, 0], { rz: Math.PI / 2 }));
  black.push(put(new THREE.CylinderGeometry(0.079, 0.079, 0.11, 14), [0.29, 0.187, 0], { rz: Math.PI / 2 }));
  const door = blob(0.078, 1, 0.04, seed);
  door.scale(0.5, 1, 1);
  black.push(put(door, [0.345, 0.187, 0]));

  // Brass boiler bands. A torus rings the X axis once it is turned about Y.
  [0.00, 0.10, 0.20].forEach((x) => {
    brass.push(put(new THREE.TorusGeometry(0.0735, 0.0040, 4, 14), [x, 0.187, 0], { ry: Math.PI / 2 }));
  });

  // ── CAB ── a low box under a shallow barrel roof that overhangs all round.
  black.push(put(softBox(0.24, 0.175, 0.21, 0.022, seed), [-0.16, 0.200, 0]));
  black.push(barrel(0.128, 0.30, 0.052, [-0.16, 0.293, 0]));

  // Cab windows, both sides, always lit — the rule every building here follows.
  [-1, 1].forEach((side) => {
    black.push(put(softBox(0.085, 0.070, 0.02, 0.006, seed), [-0.115, 0.238, side * 0.106]));
    lit.push(put(softBox(0.062, 0.050, 0.015, 0.004, seed), [-0.115, 0.238, side * 0.114]));
  });

  // ── FUNNEL ── stack plus a flared lip. The lip is the whole silhouette: a
  // plain tube reads as a pipe, a flared one reads as a steam engine.
  black.push(put(new THREE.CylinderGeometry(0.030, 0.036, 0.115, 10), [0.255, 0.315, 0]));
  black.push(put(new THREE.CylinderGeometry(0.045, 0.033, 0.038, 10), [0.255, 0.388, 0]));

  // Dome, safety valve, whistle — the brass on top of the boiler.
  const dome = blob(0.050, 1, 0.05, seed);
  dome.scale(1, 0.78, 1);
  brass.push(put(dome, [0.075, 0.248, 0]));
  brass.push(put(new THREE.CylinderGeometry(0.020, 0.024, 0.045, 8), [-0.02, 0.268, 0]));
  brass.push(put(new THREE.CylinderGeometry(0.011, 0.011, 0.052, 6), [-0.055, 0.272, 0.035]));

  // Handrails down both sides of the boiler, hugging it just proud of the skin.
  [-1, 1].forEach((side) => {
    brass.push(put(new THREE.CylinderGeometry(0.005, 0.005, 0.30, 5), [0.13, 0.220, side * 0.068], { rz: Math.PI / 2 }));
  });

  // ── FRONT END ── buffer beam, two buffers, and a lamp sat on the smokebox.
  red.push(put(softBox(0.030, 0.085, 0.27, 0.010, seed), [0.365, 0.128, 0]));
  [-1, 1].forEach((side) => {
    brass.push(put(new THREE.CylinderGeometry(0.017, 0.014, 0.035, 8), [0.383, 0.135, side * 0.078], { rz: Math.PI / 2 }));
  });
  brass.push(put(softBox(0.034, 0.038, 0.038, 0.008, seed), [0.310, 0.252, 0]));
  lit.push(put(softBox(0.012, 0.026, 0.026, 0.005, seed), [0.329, 0.252, 0]));

  // ── WHEELS ── two big drivers and a small leading pair, both sides, with a
  // coupling rod tying the drivers together.
  [-1, 1].forEach((side) => {
    const z = side * GAUGE;
    wheel(black, red, brass, -0.055, z, 0.062, seed);
    wheel(black, red, brass, 0.105, z, 0.062, seed + 1);
    wheel(black, red, brass, 0.255, z, 0.040, seed + 2);
    brass.push(put(softBox(0.20, 0.016, 0.011, 0.004, seed), [0.025, 0.040, z + side * 0.026]));
  });

  return [
    { geo: merge(black), mat: painted(0x241f1c, { rough: 0.74 }) },
    { geo: merge(red), mat: painted(PAL.stripe, { rough: 0.82 }) },
    { geo: merge(brass), mat: painted(PAL.button, { rough: 0.52 }) },
    { geo: merge(lit), mat: glow(PAL.lampCore) },
  ].filter((p) => p.geo);
}

/* A carriage. Same conventions as the loco: +X forward, y = 0 at the railhead.
   Painted body, a cream waist band, a barrel roof and four lit windows a side. */
export function carriage(seed = 1, { color = PAL.roofRed } = {}) {
  const body = [];
  const cream = [];
  const dark = [];
  const brass = [];
  const lit = [];

  // Underframe and solebar.
  dark.push(put(softBox(0.56, 0.034, 0.22, 0.010, seed), [0, 0.098, 0]));

  // Body, waist band, and a roof that overhangs both ends.
  body.push(put(softBox(0.52, 0.195, 0.21, 0.026, seed), [0, 0.215, 0]));
  cream.push(put(softBox(0.53, 0.026, 0.216, 0.008, seed), [0, 0.148, 0]));
  cream.push(barrel(0.120, 0.56, 0.040, [0, 0.316, 0]));

  // Four lit windows a side, in dark surrounds.
  [-1, 1].forEach((side) => {
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * 0.125;
      dark.push(put(softBox(0.088, 0.090, 0.018, 0.006, seed + i), [x, 0.248, side * 0.106]));
      lit.push(put(softBox(0.068, 0.068, 0.014, 0.004, seed + i), [x, 0.248, side * 0.114]));
    }
  });

  // Buffers and a coupling hook at both ends.
  [-1, 1].forEach((end) => {
    dark.push(put(softBox(0.024, 0.070, 0.24, 0.008, seed), [end * 0.278, 0.126, 0]));
    [-1, 1].forEach((side) => {
      brass.push(put(new THREE.CylinderGeometry(0.014, 0.012, 0.028, 8), [end * 0.293, 0.132, side * 0.072], { rz: Math.PI / 2 }));
    });
  });

  // Four wheels, on the gauge.
  [-1, 1].forEach((side) => {
    const z = side * GAUGE;
    wheel(dark, body, brass, -0.165, z, 0.046, seed);
    wheel(dark, body, brass, 0.165, z, 0.046, seed + 1);
  });

  return [
    { geo: merge(body), mat: painted(color, { rough: 0.84 }) },
    { geo: merge(cream), mat: felt(PAL.plaster, { flat: false, bump: 0.04, repeat: 2 }) },
    { geo: merge(dark), mat: painted(PAL.woodDark) },
    { geo: merge(brass), mat: painted(PAL.button, { rough: 0.52 }) },
    { geo: merge(lit), mat: glow(PAL.lamp) },
  ].filter((p) => p.geo);
}

/* The loco's smoke. A short column of felt puffs above the funnel, returned as
   separate nodes rather than one merged geometry because life.js drives each
   one's rise and fade independently. Built here so the funnel's position is
   stated once, next to the funnel. */
export const FUNNEL = { x: 0.255, y: 0.42 };

export function smokePuff(seed = 1) {
  return [{ geo: blob(0.045, 1, 0.22, seed), mat: felt(PAL.cloud, { flat: false, bump: 0.05, repeat: 1 }) }];
}

/* A stone tunnel mouth — where the track disappears into the hill on both the
   master world and the coast reference. */
export function tunnel(seed = 1) {
  const stone = [];
  const dark = [];
  // An arch built from wedges around a half-circle, plus a keystone.
  const n = 11;
  for (let i = 0; i < n; i++) {
    const a = (i / (n - 1)) * Math.PI;
    stone.push(put(softBox(0.14, 0.20, 0.30, 0.02, seed + i), [
      Math.cos(a) * 0.42, Math.sin(a) * 0.42, 0,
    ], { rz: a - Math.PI / 2 }));
  }
  stone.push(put(softBox(1.06, 0.16, 0.32, 0.02, seed), [0, 0.06, 0]));
  // The dark inside — a plain black disc so the mouth reads as a hole.
  dark.push(put(new THREE.CircleGeometry(0.36, 14), [0, 0.20, -0.14]));
  return [
    { geo: merge(stone), mat: clay(PAL.rockLit) },
    { geo: merge(dark), mat: glow(0x0d0f10) },
  ];
}

/* ══ BOATS ═════════════════════════════════════════════════════════════════
   ══ THE CONVENTION EVERY HULL HERE OBEYS ══════════════════════════════════

     +X   is the BOW. Same axis `ride()` puts along the direction of travel,
          so a boat under way points where it is going.
     y=0  is the WATERLINE — not the keel.

   The second one is the whole reason these read as floating. A hull modelled
   from its keel up has to be sunk by a guessed draft at every call site, and a
   guess that is even slightly wrong leaves the boat either perched on the
   surface like a bath toy or swamped. Modelled from the waterline, the hull
   already knows how deep it sits: place the origin exactly on the sea shell
   and the water cuts the hull where the builder said it should. Nothing
   downstream has to know anything about the shape of the boat. */

/* The shared hull: an ellipsoid pinched into a bow, split at y = 0 so the
   part below the waterline can be a darker antifouling colour. Returns the
   two halves plus the gunwale rim that caps them. */
function hull(len, beam, above, below, seed) {
  const topHalf = blob(0.5, 2, 0.05, seed);
  topHalf.scale(len, above * 2, beam);
  // Squash the back half of the hull down and pull the bow to a point.
  const pos = topHalf.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / len;                 // -0.5 .. 0.5
    const taper = 1 - Math.pow(Math.max(0, x) * 2, 2.2) * 0.82;
    pos.setZ(i, pos.getZ(i) * taper);
    if (pos.getY(i) < 0) pos.setY(i, pos.getY(i) * (below / above));
  }
  pos.needsUpdate = true;
  topHalf.computeVertexNormals();
  return topHalf;
}

/* The sailboat: wooden hull, blue boot-top, one mast, two cream sails. The
   hero boat of the coast, and the one life.js sails in and out of the bay. */
export function sailboat(seed = 1) {
  const wood = [];
  const blue = [];
  const sail = [];
  const rope = [];

  wood.push(put(hull(0.66, 0.26, 0.11, 0.075, seed), [0.02, 0, 0]));
  // Boot-top: a thin band right on the waterline, which is what makes the
  // waterline legible from a distance instead of a colour change in shadow.
  const band = hull(0.665, 0.268, 0.030, 0.014, seed);
  blue.push(put(band, [0.02, 0.012, 0]));

  // Deck, gunwale and a transom across the stern.
  wood.push(put(softBox(0.44, 0.022, 0.20, 0.02, seed), [0.02, 0.088, 0]));
  wood.push(put(softBox(0.09, 0.085, 0.20, 0.02, seed), [-0.27, 0.045, 0]));

  // Mast, boom, forestay.
  wood.push(put(post(0.011, 0.016, 0.68, 5, seed), [0.02, 0.40, 0]));
  wood.push(put(post(0.008, 0.010, 0.30, 4, seed), [-0.11, 0.14, 0], { rz: Math.PI / 2 }));

  /* The sails. Very flat cones rather than planes: this world has no
     double-sided materials, and a plane seen from behind is a hole. */
  const main = cone(0.19, 0.56, 3, seed);
  main.scale(1, 1, 0.14);
  sail.push(put(main, [-0.07, 0.40, 0], { ry: Math.PI / 2, rz: -0.06 }));
  const jib = cone(0.115, 0.38, 3, seed + 1);
  jib.scale(1, 1, 0.14);
  sail.push(put(jib, [0.16, 0.31, 0], { ry: Math.PI / 2, rz: 0.05 }));

  // Rigging: bow stay and a shroud each side.
  rope.push(put(new THREE.CylinderGeometry(0.005, 0.005, 0.72, 4), [0.19, 0.36, 0], { rz: 0.62 }));
  [-1, 1].forEach((side) => {
    rope.push(put(new THREE.CylinderGeometry(0.004, 0.004, 0.66, 4), [0.02, 0.36, side * 0.05], { rx: -side * 0.10 }));
  });

  return [
    { geo: merge(wood), mat: painted(PAL.wood) },
    { geo: merge(blue), mat: painted(PAL.roofBlue) },
    { geo: merge(sail), mat: felt(PAL.snow, { flat: false, bump: 0.05, repeat: 1 }) },
    { geo: merge(rope), mat: felt(PAL.cloth, { flat: false, bump: 0.06, repeat: 1 }) },
  ].filter((p) => p.geo);
}

/* The fishing boat from the style sheet's vehicles row: a red hull, a cream
   wheelhouse, a stubby mast and a life ring. Moored at the pier head. */
export function fishingBoat(seed = 1) {
  const red = [];
  const cream = [];
  const dark = [];
  const white = [];

  red.push(put(hull(0.72, 0.30, 0.13, 0.085, seed), [0, 0, 0]));
  dark.push(put(hull(0.724, 0.306, 0.028, 0.020, seed), [0, 0.006, 0]));

  // Deck and bulwark.
  cream.push(put(softBox(0.50, 0.024, 0.24, 0.02, seed), [-0.02, 0.105, 0]));
  red.push(put(softBox(0.10, 0.10, 0.24, 0.02, seed), [-0.31, 0.06, 0]));

  // Wheelhouse: cream box, dark roof, one lit window each side.
  cream.push(put(softBox(0.20, 0.16, 0.22, 0.026, seed), [-0.13, 0.19, 0]));
  dark.push(put(softBox(0.24, 0.026, 0.25, 0.010, seed), [-0.13, 0.276, 0]));
  [-1, 1].forEach((side) => {
    dark.push(put(softBox(0.10, 0.07, 0.02, 0.006, seed), [-0.11, 0.21, side * 0.112]));
  });

  // Mast with a crosstree, and a short funnel.
  dark.push(put(post(0.011, 0.014, 0.40, 5, seed), [-0.05, 0.42, 0]));
  dark.push(put(softBox(0.012, 0.012, 0.17, 0.004, seed), [-0.05, 0.55, 0]));
  dark.push(put(new THREE.CylinderGeometry(0.028, 0.032, 0.10, 8), [-0.20, 0.33, 0]));

  // The life ring on the wheelhouse side — the one white accent, and the
  // detail that makes the whole thing read as a working boat.
  white.push(put(new THREE.TorusGeometry(0.045, 0.014, 5, 12), [-0.13, 0.19, 0.128], { rx: Math.PI / 2, ry: Math.PI / 2 }));

  // Two fish crates on the after deck.
  [[0.10, 0.05], [0.17, -0.05]].forEach(([x, z], i) => {
    dark.push(put(softBox(0.075, 0.055, 0.075, 0.008, seed + i), [x, 0.142, z], { ry: i * 0.5 }));
  });

  return [
    { geo: merge(red), mat: painted(PAL.stripe, { rough: 0.84 }) },
    { geo: merge(cream), mat: felt(PAL.plaster, { flat: false, bump: 0.05, repeat: 2 }) },
    { geo: merge(dark), mat: painted(PAL.woodDark) },
    { geo: merge(white), mat: felt(PAL.snow, { flat: false, bump: 0.06, repeat: 1 }) },
  ].filter((p) => p.geo);
}

/* A rowboat — the little one tied alongside the pier. */
export function rowboat(seed = 1) {
  const wood = [];
  const dark = [];

  wood.push(put(hull(0.40, 0.19, 0.075, 0.045, seed), [0, 0, 0]));
  dark.push(put(hull(0.404, 0.194, 0.020, 0.014, seed), [0, 0.004, 0]));

  // Two thwarts to sit on, and a pair of oars shipped along the gunwale.
  [-0.07, 0.06].forEach((x, i) => {
    wood.push(put(softBox(0.036, 0.016, 0.155, 0.005, seed + i), [x, 0.055, 0]));
  });
  [-1, 1].forEach((side) => {
    dark.push(put(post(0.007, 0.009, 0.30, 4, seed), [-0.02, 0.062, side * 0.055], { rz: Math.PI / 2, ry: side * 0.08 }));
    dark.push(put(softBox(0.075, 0.008, 0.030, 0.004, seed), [-0.17, 0.062, side * 0.062]));
  });

  return [
    { geo: merge(wood), mat: painted(PAL.woodLight) },
    { geo: merge(dark), mat: painted(PAL.woodDark) },
  ].filter((p) => p.geo);
}

/* ══ HARBOUR PROPS ═════════════════════════════════════════════════════════
   The small stuff that turns a jetty into a working quay. All of it is scale-
   agnostic and stands on y = 0, so it can be dropped on the deck or on the
   grass with the same call. */

/* A barrel, banded. Stood on end or laid on its side by the caller. */
export function barrelProp(seed = 1) {
  const rand = rng(seed);
  const wood = [];
  const band = [];
  const h = 0.16 + rand() * 0.03;
  const g = new THREE.CylinderGeometry(0.058, 0.052, h, 10);
  jitter(g, 0.004, seed);
  wood.push(put(g, [0, h / 2, 0]));
  [0.26, 0.74].forEach((t) => {
    band.push(put(new THREE.TorusGeometry(0.059, 0.007, 4, 10), [0, h * t, 0], { rx: Math.PI / 2 }));
  });
  return [
    { geo: merge(wood), mat: painted(PAL.wood) },
    { geo: merge(band), mat: painted(PAL.woodDark) },
  ];
}

/* A crate, with a plank cross on the lid. */
export function crate(seed = 1) {
  const rand = rng(seed);
  const s = 0.11 + rand() * 0.03;
  const wood = [put(softBox(s, s * 0.86, s, 0.012, seed), [0, s * 0.43, 0])];
  const dark = [
    put(softBox(s * 1.02, 0.014, 0.018, 0.004, seed), [0, s * 0.86, 0]),
    put(softBox(0.018, 0.014, s * 1.02, 0.004, seed), [0, s * 0.86, 0]),
  ];
  return [
    { geo: merge(wood), mat: painted(PAL.woodLight) },
    { geo: merge(dark), mat: painted(PAL.woodDark) },
  ];
}

/* A coil of rope on the quayside — three flattened rings. */
export function ropeCoil(seed = 1) {
  const coil = [];
  for (let i = 0; i < 3; i++) {
    const r = 0.058 - i * 0.012;
    coil.push(put(new THREE.TorusGeometry(r, 0.011, 4, 12), [0, 0.012 + i * 0.019, 0], { rx: Math.PI / 2 }));
  }
  return [{ geo: merge(coil), mat: felt(PAL.cloth, { flat: false, bump: 0.09, repeat: 1 }) }];
}

/* A mooring buoy: a float with a band and a little mast. Floats, so like the
   boats it is modelled with y = 0 on the waterline. */
export function buoy(seed = 1, { color = PAL.stripe } = {}) {
  const body = [];
  const white = [];
  const dark = [];
  const b = blob(0.062, 1, 0.10, seed);
  b.scale(1, 1.15, 1);
  body.push(put(b, [0, -0.005, 0]));
  white.push(put(new THREE.TorusGeometry(0.058, 0.012, 4, 12), [0, 0.024, 0], { rx: Math.PI / 2 }));
  dark.push(put(post(0.006, 0.008, 0.13, 4, seed), [0, 0.115, 0]));
  return [
    { geo: merge(body), mat: painted(color, { rough: 0.86 }) },
    { geo: merge(white), mat: felt(PAL.snow, { flat: false, bump: 0.05, repeat: 1 }) },
    { geo: merge(dark), mat: painted(PAL.woodDark) },
  ];
}

/* A lobster pot — a domed wicker basket, the props row's fishing detail. */
export function lobsterPot(seed = 1) {
  const cage = [];
  const dome = blob(0.072, 1, 0.08, seed);
  dome.scale(1, 0.62, 1);
  cage.push(put(dome, [0, 0.044, 0]));
  for (let i = 0; i < 4; i++) {
    cage.push(put(new THREE.TorusGeometry(0.070 - i * 0.004, 0.006, 3, 10), [0, 0.016 + i * 0.020, 0], { rx: Math.PI / 2 }));
  }
  return [{ geo: merge(cage), mat: felt(PAL.cloth, { flat: false, bump: 0.10, repeat: 2 }) }];
}

/* A bench — the props row's, for the path along the cliff top. */
export function bench(seed = 1) {
  const wood = [];
  const dark = [];
  [-1, 1].forEach((side) => {
    dark.push(put(softBox(0.028, 0.13, 0.028, 0.006, seed), [side * 0.11, 0.065, -0.045]));
    dark.push(put(softBox(0.028, 0.13, 0.028, 0.006, seed), [side * 0.11, 0.065, 0.045]));
    dark.push(put(softBox(0.028, 0.20, 0.028, 0.006, seed), [side * 0.11, 0.10, -0.055]));
  });
  [0, 1].forEach((i) => {
    wood.push(put(softBox(0.30, 0.020, 0.048, 0.006, seed + i), [0, 0.135, -0.028 + i * 0.058]));
  });
  [0, 1].forEach((i) => {
    wood.push(put(softBox(0.30, 0.042, 0.018, 0.005, seed + i), [0, 0.175 + i * 0.048, -0.062]));
  });
  return [
    { geo: merge(wood), mat: painted(PAL.woodLight) },
    { geo: merge(dark), mat: painted(PAL.woodDark) },
  ];
}

/* ══ WATER FEATURES ════════════════════════════════════════════════════════ */

/* A waterfall: a stack of narrowing slabs with a foam pool at the bottom.
   `drop` is the height. The slabs are separate so `life.js` can slide their
   texture offset and make it fall. */
export function waterfall(drop = 1.2, width = 0.36, seed = 1) {
  const flow = [];
  const foam = [];
  const steps = Math.max(3, Math.round(drop / 0.34));
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const w = width * (1 - t * 0.25);
    flow.push(put(softBox(w, drop / steps + 0.03, 0.10, 0.02, seed + i), [
      0, drop - t * drop - drop / steps / 2, t * 0.10,
    ], { rx: 0.10 }));
    foam.push(put(blob(w * 0.42, 1, 0.2, seed + i * 3), [0, drop - t * drop - drop / steps, t * 0.10 + 0.03]));
  }
  foam.push(put(blob(width * 0.75, 1, 0.22, seed), [0, 0.03, 0.14]));
  return [
    { geo: merge(flow), mat: water(PAL.river, { rough: 0.3 }) },
    { geo: merge(foam), mat: felt(PAL.seaFoam, { flat: false, bump: 0.04, repeat: 2 }) },
  ];
}
