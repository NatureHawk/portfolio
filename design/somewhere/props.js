// PROPS — the things that grow, the things that lie about, and the people.
//
// Every natural object in SOMEWHERE is built here, and all of them are built to
// the same contract so the world can afford to have thousands of them:
//
//   A BUILDER returns a KIT — an array of { geo, mat } parts.
//
// A kit is not a scene object. It is a recipe that has already been flattened:
// all the leaf geometry of a tree merged into one buffer, all the wood into
// another. Handing that to `scatter()` gives one InstancedMesh per material, so
// three hundred trees cost two draw calls instead of twelve hundred.
//
// WHY THIS MATTERS HERE SPECIFICALLY. The reference images are dense — 4-Master
// World.png has well over a thousand visible objects on it, and the charm is
// entirely in that density. A world with forty tasteful trees is a different
// and much worse picture. Instancing is what buys the density back.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PAL } from './content.js';
import { felt, painted, clay, glow, blob, softBox, post, cone, jitter, rng } from './craft.js';

/* Merge a list of geometries that share a material into one buffer. Returns
   null for an empty list so callers can drop unused parts from a kit.

   EVERYTHING IS STRIPPED TO NON-INDEXED FIRST, and it is not optional. Three's
   primitives disagree about this: Box, Sphere, Cylinder, Cone and Torus come
   back indexed, and Icosahedron — which is what `blob()` is built on — does
   not. `mergeGeometries` refuses a list that mixes the two, so any builder
   combining a blob with a box would fail at run time. Normalising here rather
   than at each of the forty call sites means a new prop cannot get it wrong.

   Non-indexed is the right direction to normalise in: this world is flat-shaded
   almost everywhere, which needs unshared vertices anyway, and the geometries
   are small enough that the duplication costs nothing worth counting. */
const merge = (list) => {
  if (!list.length) return null;
  const flat = list.map((g) => (g.index ? g.toNonIndexed() : g));
  return mergeGeometries(flat, false);
};

/* Position/rotate/scale a geometry in place, then hand it back for merging.
   Every builder below is written as "make a primitive, place it, collect it",
   and this is the placing half. */
function put(geo, [x, y, z], { rx = 0, ry = 0, rz = 0, s = 1 } = {}) {
  if (s !== 1) geo.scale(s, s, s);
  if (rx) geo.rotateX(rx);
  if (ry) geo.rotateY(ry);
  if (rz) geo.rotateZ(rz);
  geo.translate(x, y, z);
  return geo;
}

/* ══ TREES ═════════════════════════════════════════════════════════════════
   Two species, straight off the style sheet: a round-canopy broadleaf with
   berry flecks, and a layered conifer. Both sit on a flared trunk, because
   every trunk in the reference widens where it meets the ground — it is the
   detail that makes them read as grown rather than as stuck in.

   The berries are the signature. In 4-StyleSheet.png the canopies are dotted
   with tiny red and orange beads, and on 4-Mountain destination.png some of
   them are literally BUTTONS. They cost almost nothing and they are most of
   what stops a green ball from looking like a green ball. */

export function broadleaf(seed = 1) {
  const rand = rng(seed);
  const wood = [];
  const leaf = [];
  const berry = [];

  const h = 0.9 + rand() * 0.4;

  // Trunk, plus two roots flaring out at the base.
  wood.push(put(post(0.055, 0.115, h, 7, seed), [0, h / 2, 0]));
  for (let i = 0; i < 3; i++) {
    const a = rand() * Math.PI * 2;
    wood.push(put(post(0.03, 0.06, 0.16, 5, seed + i), [
      Math.cos(a) * 0.09, 0.05, Math.sin(a) * 0.09,
    ], { rz: Math.cos(a) * 0.5, rx: -Math.sin(a) * 0.5 }));
  }

  // Canopy: three overlapping blobs rather than one sphere. A single ball is a
  // lollipop; three that interpenetrate at slightly different heights read as
  // foliage with mass.
  const cy = h + 0.34;
  const lobes = [
    [0, cy, 0, 0.42],
    [0.20, cy - 0.10, 0.10, 0.30],
    [-0.16, cy - 0.06, -0.14, 0.32],
    [0.04, cy + 0.16, -0.08, 0.26],
  ];
  lobes.forEach(([x, y, z, r], i) => {
    leaf.push(put(blob(r, 1, 0.16, seed * 7 + i), [x, y, z]));
  });

  // Berries — scattered on the upper surface of the canopy only, because that
  // is where fruit is and because the underside is never seen.
  for (let i = 0; i < 9; i++) {
    const a = rand() * Math.PI * 2;
    const t = 0.3 + rand() * 0.7;
    berry.push(put(blob(0.028 + rand() * 0.014, 0, 0.3, seed + i * 3), [
      Math.cos(a) * 0.36 * t,
      cy + 0.16 * t + rand() * 0.12,
      Math.sin(a) * 0.36 * t,
    ]));
  }

  return [
    { geo: merge(wood), mat: painted(PAL.wood) },
    { geo: merge(leaf), mat: felt(PAL.grass, { bump: 0.09, repeat: 2 }) },
    { geo: merge(berry), mat: felt(PAL.flowerRed, { flat: false, bump: 0.02 }) },
  ].filter((p) => p.geo);
}

export function conifer(seed = 1) {
  const rand = rng(seed);
  const wood = [];
  const leaf = [];
  const button = [];

  const h = 0.34 + rand() * 0.12;
  wood.push(put(post(0.05, 0.10, h + 0.1, 6, seed), [0, (h + 0.1) / 2, 0]));

  // Four tiers, each narrower and shorter than the one below. The overlap is
  // deliberate and heavy — the style sheet's conifers are stacked skirts, not a
  // smooth spire, and you only get the skirt edge if the tiers cut into each
  // other.
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const r = 0.40 - t * 0.26;
    const th = 0.44 - t * 0.12;
    leaf.push(put(cone(r, th, 8, seed + i * 5), [0, h + i * 0.26 + th / 2, 0], {
      ry: rand() * 0.8,
    }));
  }

  // The buttons from 4-Mountain destination.png. Two or three per tree, on the
  // sunny side, sitting proud of the surface.
  for (let i = 0; i < 3; i++) {
    const a = rand() * Math.PI * 2;
    const y = h + 0.12 + rand() * 0.5;
    const r = 0.30 - (y - h) * 0.28;
    button.push(put(
      new THREE.CylinderGeometry(0.045, 0.045, 0.018, 8),
      [Math.cos(a) * r, y, Math.sin(a) * r],
      { rx: Math.PI / 2, rz: a },
    ));
  }

  return [
    { geo: merge(wood), mat: painted(PAL.woodDark) },
    { geo: merge(leaf), mat: felt(PAL.grassDeep, { bump: 0.10, repeat: 2 }) },
    { geo: merge(button), mat: painted(PAL.button, { rough: 0.7 }) },
  ].filter((p) => p.geo);
}

/* A sapling — the small round-canopy tree the style sheet puts in the gaps.
   Cheap, and it breaks up the rhythm of a hillside of full-size trees. */
export function sapling(seed = 1) {
  const rand = rng(seed);
  const h = 0.34 + rand() * 0.1;
  return [
    { geo: put(post(0.032, 0.055, h, 5, seed), [0, h / 2, 0]), mat: painted(PAL.wood) },
    {
      geo: merge([
        put(blob(0.20, 1, 0.18, seed), [0, h + 0.15, 0]),
        put(blob(0.13, 1, 0.2, seed + 2), [0.11, h + 0.08, 0.05]),
      ]),
      mat: felt(PAL.grassLit, { bump: 0.08, repeat: 2 }),
    },
  ];
}

/* ══ GROUND COVER ══════════════════════════════════════════════════════════
   Rocks, bushes, flowers, mushrooms. Individually invisible; collectively they
   are the difference between a golf course and a meadow. */

export function rock(seed = 1) {
  const rand = rng(seed);
  const parts = [];
  const n = 1 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const r = 0.10 + rand() * 0.13;
    const g = blob(r, 0, 0.26, seed + i * 11);
    g.scale(1, 0.66 + rand() * 0.3, 1);          // boulders sit, they do not float
    parts.push(put(g, [(rand() - 0.5) * 0.28, r * 0.4, (rand() - 0.5) * 0.28]));
  }
  return [{ geo: merge(parts), mat: clay(rand() > 0.5 ? PAL.rock : PAL.rockDeep) }];
}

export function bush(seed = 1) {
  const rand = rng(seed);
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const r = 0.09 + rand() * 0.08;
    parts.push(put(blob(r, 0, 0.24, seed + i * 7), [
      (rand() - 0.5) * 0.2, r * 0.7, (rand() - 0.5) * 0.2,
    ]));
  }
  return [{ geo: merge(parts), mat: felt(PAL.moss, { bump: 0.08, repeat: 2 }) }];
}

/* A flower: a stem, and a head of four petals around a centre. Built at a size
   that is frankly too big for the scale, which is correct — every decorative
   detail in the references is exaggerated, and a botanically-scaled flower on a
   planet this size would be one pixel. */
export function flower(color, seed = 1) {
  const rand = rng(seed);
  const stem = put(post(0.008, 0.012, 0.11, 4, seed), [0, 0.055, 0]);
  const petals = [];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand();
    const p = new THREE.SphereGeometry(0.032, 5, 4);
    p.scale(1, 0.4, 1);
    petals.push(put(p, [Math.cos(a) * 0.034, 0.115, Math.sin(a) * 0.034]));
  }
  return [
    { geo: stem, mat: felt(PAL.moss, { repeat: 1 }) },
    { geo: merge(petals), mat: felt(color, { flat: false, bump: 0.02, repeat: 1 }) },
    { geo: put(blob(0.020, 0, 0.2, seed), [0, 0.125, 0]), mat: felt(PAL.button, { flat: false }) },
  ];
}

export function mushroom(seed = 1) {
  const rand = rng(seed);
  const h = 0.07 + rand() * 0.05;
  const cap = new THREE.SphereGeometry(0.055, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  jitter(cap, 0.008, seed);
  const dots = [];
  for (let i = 0; i < 4; i++) {
    const a = rand() * Math.PI * 2;
    const t = 0.3 + rand() * 0.6;
    dots.push(put(blob(0.011, 0, 0.2, seed + i), [
      Math.cos(a) * 0.042 * t, h + 0.030 - t * 0.012, Math.sin(a) * 0.042 * t,
    ]));
  }
  return [
    { geo: put(post(0.018, 0.024, h, 6, seed), [0, h / 2, 0]), mat: felt(PAL.snow, { flat: false }) },
    { geo: put(cap, [0, h, 0]), mat: felt(PAL.mushroom, { flat: false, bump: 0.03, repeat: 1 }) },
    { geo: merge(dots), mat: felt(PAL.snow, { flat: false }) },
  ];
}

/* ══ CLOUDS ════════════════════════════════════════════════════════════════
   Puffball clusters, exactly as drawn on the style sheet: six to nine balls of
   different sizes crowded into a lozenge. Nothing clever — the charm is that
   they are obviously made of separate lumps.

   The string is not decoration. In 4-MasterWorld.png, 4-Coast.png and 4-Mountain
   destination.png the clouds hang from threads that run up out of frame, which
   is the single detail that tells you the whole thing is a model on a table
   rather than a planet. It is the most important object in this file. */
export function cloud(seed = 1, { string = true } = {}) {
  const rand = rng(seed);
  const puffs = [];
  const n = 7 + Math.floor(rand() * 4);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const r = 0.26 + rand() * 0.24 - Math.abs(t - 0.5) * 0.20;
    const x = (t - 0.5) * 1.45;
    const y = (rand() - 0.35) * 0.20;
    const z = (rand() - 0.5) * 0.40;
    // DETAIL 2 AND ALMOST NO WOBBLE. An earlier version used detail 1 with a
    // 0.14 wobble, which gave craggy faceted lumps — the clouds read as grey
    // asteroids hanging over the world. Cotton wool is ROUND: the silhouette
    // has to be made of circles or it is not cloud, it is rock.
    puffs.push(put(blob(Math.max(r, 0.13), 2, 0.035, seed + i * 13), [x, y, z]));
  }

  // Smooth-shaded and near-white. This is the one place in the world where flat
  // shading is wrong: facets on a cloud are what made them look like stone.
  const kit = [{
    geo: merge(puffs),
    mat: felt(PAL.cloud, { flat: false, bump: 0.02, repeat: 3, rough: 1 }),
  }];

  if (string) {
    // A SHORT thread, and short is the whole point. The first version ran nine
    // units up, and because a cloud is stood on the sphere's normal the thread
    // pointed radially — which on screen is a long diagonal line right across
    // the frame. In every reference the threads are barely more than a hint
    // above each cloud, so that is what this is.
    kit.push({
      geo: put(new THREE.CylinderGeometry(0.0045, 0.0045, 1.5, 3), [0, 0.86, 0]),
      mat: felt(0xd8d2c6, { flat: false, rough: 1 }),
    });
  }
  return kit;
}

/* ══ THE CHARACTER ═════════════════════════════════════════════════════════
   A small stitched doll: round head, button eyes, a soft body, stub arms and
   legs. Knitted burlap, a zip down the front, and that is all.

   Deliberately NOT a copy of any existing game character — the shape here is
   driven by what the style sheet's material row says (fabric/stitched, buttons)
   and by the constraint that it has to read at four pixels tall on the planet
   view. Round head, dark eyes, warm brown cloth. Its charm is that it is barely
   a figure at all.

   Built facing +Z so `lookAt` and path-following work without a correction. */
export function character(seed = 1, { vest = null } = {}) {
  const rand = rng(seed);
  const cloth = [];
  const dark = [];

  const bodyH = 0.17;
  // Body — a rounded barrel, wider at the bottom.
  const body = blob(0.10, 1, 0.10, seed);
  body.scale(1, bodyH / 0.10 / 1.5, 0.9);
  cloth.push(put(body, [0, 0.115, 0]));

  // Head — the biggest thing on it, by a lot. Exaggerated proportion is the
  // whole style, and a correctly-proportioned head kills it instantly.
  cloth.push(put(blob(0.093, 1, 0.07, seed + 3), [0, 0.255, 0]));

  // Arms and legs — stubs. No joints, no hands, no feet.
  [-1, 1].forEach((side, i) => {
    const arm = blob(0.036, 0, 0.14, seed + 20 + i);
    arm.scale(1, 1.7, 1);
    cloth.push(put(arm, [side * 0.105, 0.135, 0], { rz: side * 0.28 }));

    const leg = blob(0.040, 0, 0.12, seed + 30 + i);
    leg.scale(1, 1.35, 1);
    cloth.push(put(leg, [side * 0.045, 0.032, 0]));
  });

  // Eyes — two dark discs pressed into the front of the head. Set wide and low.
  [-1, 1].forEach((side) => {
    dark.push(put(new THREE.SphereGeometry(0.019, 7, 6), [side * 0.036, 0.262, 0.082]));
  });

  // The zip: a thin dark strip down the belly, straight off the style sheet.
  dark.push(put(softBox(0.016, 0.09, 0.012, 0.004, seed), [0, 0.115, 0.083]));

  const kit = [
    { geo: merge(cloth), mat: felt(PAL.cloth, { bump: 0.07, repeat: 1.4 }) },
    { geo: merge(dark), mat: painted(PAL.clothDark, { rough: 0.6 }) },
  ];

  if (vest) {
    const v = blob(0.104, 1, 0.08, seed + 40);
    v.scale(1, 0.6, 0.92);
    kit.push({ geo: put(v, [0, 0.108, 0]), mat: felt(vest, { bump: 0.05, repeat: 1 }) });
  }
  return kit;
}

/* ══ SMALL BUILT THINGS ════════════════════════════════════════════════════ */

/* A lamp post: black column, a warm box of light, a little roof. One of the few
   things in the world that emits, so it gets a `glow` part the lighting cannot
   touch and a `light` flag the caller can hang a real PointLight off. */
export function lamp(seed = 1) {
  const h = 0.52;
  const iron = [
    put(post(0.020, 0.034, h, 6, seed), [0, h / 2, 0]),
    put(new THREE.CylinderGeometry(0.055, 0.075, 0.04, 8), [0, 0.02, 0]),
    put(cone(0.062, 0.07, 6, seed), [0, h + 0.115, 0]),
  ];
  return [
    { geo: merge(iron), mat: painted(PAL.woodDark, { rough: 0.7 }) },
    { geo: put(softBox(0.075, 0.09, 0.075, 0.02, seed), [0, h + 0.055, 0]), mat: glow(PAL.lamp) },
  ];
}

/* A run of fence: three posts and two rails. Built as one kit so a whole
   hillside of fencing is one instanced draw. */
export function fence(seed = 1) {
  const wood = [];
  for (let i = 0; i < 3; i++) {
    wood.push(put(post(0.022, 0.030, 0.26, 5, seed + i), [(i - 1) * 0.30, 0.13, 0]));
  }
  [0.10, 0.20].forEach((y, i) => {
    wood.push(put(softBox(0.62, 0.028, 0.018, 0.006, seed + i), [0, y, 0], { rz: (i - 0.5) * 0.02 }));
  });
  return [{ geo: merge(wood), mat: painted(PAL.wood) }];
}

/* A signpost — a post with one or two arrow boards. The world's only text-free
   wayfinding, and a direct lift from the props row of the style sheet. */
export function signpost(seed = 1) {
  const rand = rng(seed);
  const wood = [
    put(post(0.020, 0.028, 0.42, 5, seed), [0, 0.21, 0]),
    put(softBox(0.24, 0.075, 0.018, 0.01, seed), [0.09, 0.34, 0], { ry: rand() * 0.4 }),
  ];
  if (rand() > 0.4) {
    wood.push(put(softBox(0.20, 0.065, 0.018, 0.01, seed + 1), [-0.08, 0.245, 0], { ry: -rand() * 0.5 }));
  }
  return [{ geo: merge(wood), mat: painted(PAL.woodLight) }];
}

/* ══ SCATTER ═══════════════════════════════════════════════════════════════
   The other half of the kit contract. Takes a kit and a list of matrices and
   returns a Group of InstancedMeshes — one per part, which is one per material.

   Everything scattered across the planet goes through here, and it is the
   reason the world can carry the density the references have. */
export function scatter(kit, matrices, { shadow = true, name = '' } = {}) {
  const group = new THREE.Group();
  group.name = name;
  kit.forEach(({ geo, mat }, i) => {
    const mesh = new THREE.InstancedMesh(geo, mat, matrices.length);
    matrices.forEach((m, j) => mesh.setMatrixAt(j, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = shadow;
    mesh.receiveShadow = shadow;
    mesh.frustumCulled = false;     // the planet rotates; per-instance culling lies
    mesh.name = `${name}-${i}`;
    group.add(mesh);
  });
  return group;
}

/* Build a kit into a single ordinary Group — for the handful of objects that
   exist exactly once (the lighthouse, the clock tower, the locomotive). */
export function build(kit, { shadow = true, name = '' } = {}) {
  const group = new THREE.Group();
  group.name = name;
  kit.forEach(({ geo, mat }) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = shadow;
    mesh.receiveShadow = shadow;
    group.add(mesh);
  });
  return group;
}
