// WORLD — assembling the diorama.
//
// Terrain, sea, sky, light, and everything standing on the ground. This file
// decides WHERE things go; planet.js decides what shape the ground is and
// props.js / kit.js decide what the things look like.
//
// THE PLACEMENT RULE that makes the whole thing read as a place rather than as
// a scatter: nothing is placed uniformly. Trees clump, because forests clump.
// Houses gather at the village and nowhere else. Conifers climb towards the
// mountain and give up below the snow. Every one of those is a weight applied
// to a candidate point before it is accepted, and together they are the
// difference between a landscape and a lawn with objects on it.
//
// EVERYTHING IS INSTANCED. The count here is deliberately high — the charm of
// 4-MasterWorld.png is density, and a tasteful forty trees is a different and
// much worse picture — so nothing may cost a draw call of its own unless there
// is exactly one of it.

import * as THREE from 'three';
import { PAL, SKY, R, WORLD, DESTINATIONS } from './content.js';
import {
  buildLand, buildSea, heightAt, standable, anchorOf, RIVER, biomeAt,
  railPoint, railHeight, arc,
} from './planet.js';
import { loadKit } from './kit.js';
import { scatter, build, cloud, bush, flower, mushroom, lamp, fence, signpost } from './props.js';
import { barrelProp, crate, ropeCoil, buoy, lobsterPot, bench } from './builds.js';
/* What is LEFT in builds.js after the Blender pass: the structures that are
   mostly straight timber and read fine as primitives — a lookout frame, a
   plank dock, a bridge, an arch, a rowboat — plus the waterfall, which is
   animated and so has to stay procedural. Everything with a soft or moulded
   silhouette now comes out of the kit instead. */
import {
  lookout, pier, bridge, tunnel, rowboat, sailboat, fishingBoat, waterfall,
  locomotive, carriage, RAIL_TOP,
} from './builds.js';
import { surfaceMatrix, onSphere, standOn, rng, felt, headingTo } from './craft.js';

const DEG = 180 / Math.PI;

/* A direction back to the lat/lon the placement helpers speak. */
const latOf = (d) => Math.asin(Math.min(1, Math.max(-1, d.y))) * DEG;
const lonOf = (d) => Math.atan2(d.z, d.x) * DEG;

export async function buildWorld({ quality = 'high' } = {}) {
  const group = new THREE.Group();
  group.name = 'somewhere-world';

  const rand = rng(20260824);
  const kits = await loadKit();

  /* Detail budget. The terrain and the scatter counts are the only two things
     that scale, and they are the only two that matter: everything else in the
     world is a handful of one-off objects. */
  const Q = {
    high:   { detail: 40, trees: 340, conifers: 260, rocks: 180, bushes: 150, flowers: 220, folk: 22 },
    medium: { detail: 32, trees: 210, conifers: 160, rocks: 110, bushes: 90,  flowers: 130, folk: 14 },
    low:    { detail: 24, trees: 120, conifers: 90,  rocks: 60,  bushes: 50,  flowers: 70,  folk: 8 },
  }[quality] ?? {};

  // ── GROUND ────────────────────────────────────────────────────────────────
  const land = buildLand(Q.detail);
  const sea = buildSea();
  group.add(land, sea);

  // ── WHERE THINGS MAY STAND ────────────────────────────────────────────────
  /* Candidate points, weighted. `weight(dir)` returns 0..1 for how much this
     kind of thing wants to be here; a point is accepted with that probability.
     Rejection sampling rather than anything cleverer, because the terrain is a
     cheap function and clarity is worth more here than elegance. */
  function spots(n, { weight = () => 1, maxSteep = 0.34, tries = 90, biome = 'main' } = {}) {
    const out = [];
    let guard = 0;
    while (out.length < n && guard < n * tries) {
      guard++;
      // Uniform on the sphere — `u` flat in -1..1 rather than the latitude,
      // which would bunch everything at the poles.
      const u = rand() * 2 - 1;
      const th = rand() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const dir = new THREE.Vector3(s * Math.cos(th), u, s * Math.sin(th));
      if (!standable(dir, { maxSteep })) continue;
      if (biome && biomeAt(dir) !== biome) continue;
      // Ground a hand-placed structure has already claimed.
      if (reserved(dir)) continue;
      if (rand() > weight(dir)) continue;
      out.push(dir);
    }
    return out;
  }

  const near = (dir, id) => dir.dot(anchorOf(id));

  /* ── THE HARBOUR'S FRAME ──────────────────────────────────────────────────
     Declared up here, well before it is used to place anything, because the
     SCATTER needs it: the pier is a hand-placed structure and the tree seeder
     knows nothing about it, so without a keep-out the forest grows straight up
     through the deck. It did. `KEEP_OUT` is the general fix — any hand-built
     area can reserve ground by adding itself to the list, and `spots()` will
     not seed inside it.

     `harbour(out, along)` rotates the local frame onto the bay itself: `out`
     walks from the quay towards open water on the bearing the shore actually
     faces, `along` walks across it. Every harbour number in this file is then
     a sentence rather than a diagonal — and can be checked against the only
     thing that matters, which is whether that spot is wet or dry. */
  const cDir = anchorOf('coast');
  const cEast = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), cDir).normalize();
  const cNorth = new THREE.Vector3().crossVectors(cDir, cEast).normalize();
  const nearCoast = (de, dn) => cDir.clone()
    .addScaledVector(cEast, de / R).addScaledVector(cNorth, dn / R).normalize();

  const OUT = [-0.35, -0.94];
  const ALONG = [0.94, -0.35];
  const harbour = (out, along) => nearCoast(
    OUT[0] * out + ALONG[0] * along,
    OUT[1] * out + ALONG[1] * along,
  );

  const PIER_START = 2.0;
  const PIER_LEN = 2.4;

  /* Ground reserved for hand-placed structures: { dir, radius in radians }.
     The pier is covered by three overlapping discs down its length rather than
     one big one, so the quay stays clear without sterilising the whole
     headland around it. */
  const KEEP_OUT = [
    { dir: harbour(PIER_START + 0.2, 0), r: 0.055 },
    { dir: harbour(PIER_START + 1.2, 0), r: 0.055 },
    { dir: harbour(PIER_START + 2.2, 0), r: 0.060 },
    { dir: harbour(0.9, 0.1), r: 0.048 },     // the quay, where the props stand
  ];
  const reserved = (dir) => KEEP_OUT.some(({ dir: d, r }) =>
    Math.acos(Math.min(1, Math.max(-1, dir.dot(d)))) < r);

  /* The clumping. A low-frequency band around the sphere: high in some regions,
     low in others, so trees come in woods with clearings between them. Without
     this the forest is evenly seeded and reads as wallpaper. */
  const clump = (dir, k = 3.4, bias = 0.35) => {
    const n = Math.sin(dir.x * k + 1.7) * Math.sin(dir.y * k * 1.3) * Math.sin(dir.z * k - 0.6);
    return Math.min(1, Math.max(0, n * 0.5 + 0.5 + bias));
  };

  const matrices = (dirs, scale, { lift = 0 } = {}) => dirs.map((d) => surfaceMatrix(
    latOf(d), lonOf(d), heightAt(d) + lift,
    { scale: scale(), spin: rand() * Math.PI * 2 },
  ));

  // ── TREES ─────────────────────────────────────────────────────────────────
  /* Broadleaf: the default cover. Pushed towards the forest, kept off the
     summit, and clumped. */
  const trees = spots(Q.trees, {
    weight: (d) => {
      const alt = heightAt(d) / R;
      if (alt > 1.10) return 0;                       // nothing grows in the snow
      const forest = Math.max(0, near(d, 'forest')) ** 2;
      return Math.min(1, clump(d) * (0.55 + forest * 0.9));
    },
  });
  group.add(scatter(kits.tree, matrices(trees, () => 0.30 + rand() * 0.13), { name: 'trees' }));

  /* Conifers: the opposite bias. They climb where the broadleaf gives up, so
     the treeline changes species on the way up the mountain — which is the
     detail that makes an altitude gradient read as one. */
  const conifers = spots(Q.conifers, {
    weight: (d) => {
      const alt = heightAt(d) / R;
      if (alt > 1.16) return 0;
      const high = Math.min(1, Math.max(0, (alt - 0.99) * 7));
      const forest = Math.max(0, near(d, 'forest')) ** 2;
      return Math.min(1, clump(d, 4.1, 0.2) * (0.25 + high * 1.1 + forest * 0.5));
    },
    maxSteep: 0.44,                                   // firs take a steeper slope
  });
  group.add(scatter(kits.conifer, matrices(conifers, () => 0.26 + rand() * 0.16), { name: 'conifers' }));

  /* ── GROUND COVER ─────────────────────────────────────────────────────────
     THE HOUSE IS THE UNIT. Everything below is scaled against it, because that
     is how the references read: a lamp is about half a house, a person about a
     third, a flower a tenth. Those ratios were badly off at first — the lamp
     posts stood taller than the buildings and the flowers came up to a
     character's shoulder, which made the village read as a toy set rather than
     as a place at a consistent scale. */
  /* Rocks. SMALL — this is the one scale in the world that was badly wrong: at
     the kit's natural size they stood as tall as the trees and the meadow read
     as a boulder field. They are ground texture, not scenery, so they sit at
     roughly a third of a tree and cluster where the ground is high or steep. */
  group.add(scatter(kits.rock, matrices(
    spots(Q.rocks, {
      weight: (d) => 0.22 + Math.min(1, Math.max(0, (heightAt(d) / R - 1.02) * 7)),
      maxSteep: 0.62,
    }),
    () => 0.16 + rand() * 0.26,
  ), { name: 'rocks' }));

  group.add(scatter(bush(5), matrices(
    spots(Q.bushes, { weight: (d) => clump(d, 5, 0.2) }), () => 0.42 + rand() * 0.40,
  ), { name: 'bushes' }));

  // Flowers, in three colours, so a meadow is not monochrome.
  [PAL.flowerRed, PAL.flowerPink, PAL.flowerBlue].forEach((c, i) => {
    group.add(scatter(flower(c, 11 + i), matrices(
      spots(Math.round(Q.flowers / 3), {
        weight: (d) => (heightAt(d) / R > 1.06 ? 0 : clump(d, 6.2, 0.1)),
        maxSteep: 0.22,
      }),
      () => 0.42 + rand() * 0.28,
    ), { name: `flowers-${i}` }));
  });

  group.add(scatter(mushroom(7), matrices(
    spots(Math.round(Q.flowers * 0.22), {
      weight: (d) => Math.max(0, near(d, 'forest')) ** 3,
      maxSteep: 0.24,
    }), () => 0.45 + rand() * 0.35,
  ), { name: 'mushrooms' }));

  // ── THE FOLK ──────────────────────────────────────────────────────────────
  /* Small, and mostly gathered where there is something to do. Their positions
     are kept so life.js can walk them. */
  const folkDirs = spots(Q.folk, {
    weight: (d) => 0.15 + Math.max(0, near(d, 'village')) ** 3 * 1.4,
    maxSteep: 0.18,
  });
  const folk = scatter(kits.character, matrices(folkDirs, () => 0.9 + rand() * 0.25), { name: 'folk' });
  group.add(folk);

  // ── THE VILLAGE ───────────────────────────────────────────────────────────
  /* A real cluster rather than a scattered weight: houses around a square, the
     clock tower on one side, the market on another. This is the one place in
     the world laid out by hand, because 4-Village.png is a composition and a
     random scatter cannot produce one. */
  const village = new THREE.Group();
  village.name = 'village';
  const vDest = DESTINATIONS.find((d) => d.id === 'village');
  const vDir = anchorOf('village');

  /* Walk a small distance across the surface from an anchor, in a local frame.
     Everything hand-placed in this file is positioned this way: "twelve metres
     north-east of the village centre", not an absolute lat/lon nobody can
     reason about. */
  const east = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), vDir).normalize();
  const north = new THREE.Vector3().crossVectors(vDir, east).normalize();
  function nearVillage(de, dn) {
    const d = vDir.clone()
      .addScaledVector(east, de / R)
      .addScaledVector(north, dn / R)
      .normalize();
    return d;
  }

  /* `radius` overrides the terrain lookup outright, which is what anything
     floating needs: a boat belongs on the sea shell at a fixed radius, and
     asking `heightAt` where the ground is under it would sit it on the seabed. */
  function place(objOrKit, dir, { scale = 1, spin = 0, lift = 0, radius = null, isKit = true } = {}) {
    const node = isKit ? build(objOrKit, { name: '' }) : objOrKit;
    const h = (radius ?? heightAt(dir)) + lift;
    standOn(node, latOf(dir), lonOf(dir), h, spin);
    node.scale.setScalar(scale);
    return node;
  }

  // Houses round three sides of a square.
  const RING = [
    [-1.9, 1.5, 0.6], [-0.7, 2.1, 0.2], [0.9, 2.0, -0.4], [2.0, 1.2, -0.9],
    [-2.3, -0.4, 1.4], [2.4, -0.3, -1.6], [-1.7, -1.9, 2.3], [0.4, -2.3, 3.1],
  ];
  RING.forEach(([e, n, spin], i) => {
    village.add(place(kits.house, nearVillage(e, n), { scale: 0.55 + rand() * 0.10, spin }));
  });
  village.add(place(kits.clocktower, nearVillage(1.6, 2.4), { scale: 0.58, spin: -0.5 }));
  village.add(place(kits.stall, nearVillage(-1.2, -0.9), { scale: 0.62, spin: 1.9 }));

  // Lamps around the square — the warm points that carry the village at dusk.
  [[-1.2, 0.9], [1.3, 0.8], [-1.1, -1.4], [1.4, -1.3]].forEach(([e, n], i) => {
    village.add(place(lamp(i), nearVillage(e, n), { scale: 0.40 }));
  });
  [[-2.6, 0.5, 0.4], [2.7, 0.2, 1.2]].forEach(([e, n, s]) => {
    village.add(place(fence(3), nearVillage(e, n), { scale: 0.55, spin: s }));
  });
  village.add(place(signpost(4), nearVillage(0.2, -1.8), { scale: 0.5, spin: 0.7 }));
  group.add(village);

  // ── THE COAST ─────────────────────────────────────────────────────────────
  const coast = new THREE.Group();
  coast.name = 'coast';

  /* Measured off `heightAt` along the harbour axis declared above: dry apron
     from the quay out to 2.5, the cliff at about 2.75, then open water from 3
     onwards on a seabed 0.43 below the waterline. Every number below is placed
     against that profile. */
  const SEA = WORLD.ocean;
  const QUAY = SEA + 0.30;          // the pier deck, a clear step above the apron

  // Which way is "out to sea" from a given spot — the spin that turns a pier
  // or points a moored boat's bow down the bay.
  const seaward = (out, along) => headingTo(harbour(out, along), harbour(out + 1, along));

  // ── THE LIGHTHOUSE ── the landmark, on the headland, with a fenced path.
  coast.add(place(kits.lighthouse, nearCoast(1.9, 0.9), { scale: 0.72 }));
  [0, 1, 2, 3, 4, 5].forEach((i) => {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    coast.add(place(fence(6 + i), nearCoast(1.9 + Math.cos(a) * 0.95, 0.9 + Math.sin(a) * 0.95), {
      scale: 0.52, spin: a + Math.PI / 2,
    }));
  });

  // ── THE COASTAL COTTAGE ── above the quay, looking out over the water.
  coast.add(place(kits.house, harbour(0.4, 1.5), { scale: 0.58, spin: seaward(0.4, 1.5) + 0.5 }));
  coast.add(place(kits.house, harbour(-0.9, -1.4), { scale: 0.48, spin: seaward(-0.9, -1.4) - 0.8 }));

  /* ── THE PIER ── the one structure that has to exist in two places at once.
     It starts at out = 1.5, which is dry apron, and runs 2.6 units to out =
     4.1, which is open water — so it genuinely crosses the shoreline rather
     than sitting beside it. `deep0`/`deepen` are tuned against the measured
     profile above so the landward posts are buried in the apron and the
     seaward ones run down to the seabed. */
  coast.add(place(
    /* `rampDrop` is exactly the deck's height above the apron — QUAY is 0.30
       over the waterline and the ground here measures 0.137 over it — so the
       ramp lands on the grass instead of guessing at it. */
    pier(PIER_LEN, 3, {
      width: 0.46, headWidth: 0.84, deep0: 0.34, deepen: 0.26,
      ramp: 0.55, rampDrop: QUAY - (SEA + 0.137),
    }),
    harbour(PIER_START, 0),
    { radius: QUAY, spin: seaward(PIER_START, 0) },
  ));

  /* ── THE BOATS ── all three ON the water, at the sea shell's own radius.
     Hulls are modelled with y = 0 on their waterline, so this is the whole of
     making them float: no draft to guess, no lift to tune. */
  const moored = [];
  const tieUp = (kit, out, along, spin) => {
    const node = place(kit, harbour(out, along), { radius: SEA, spin });
    moored.push(node);
    coast.add(node);
    return node;
  };
  // The fishing boat, alongside the pier head, bow out to sea.
  tieUp(fishingBoat(4), 3.85, 0.78, seaward(3.85, 0.78) + 0.06);
  // The rowboat, clear of the deck's edge rather than under it.
  tieUp(rowboat(5), 3.35, -0.80, seaward(3.35, -0.80) - 0.35);
  // Two mooring buoys further out in the bay.
  tieUp(buoy(6), 4.9, -1.55, 0);
  tieUp(buoy(7, { color: PAL.roofBlue }), 5.5, 1.25, 0);

  /* ── THE QUAY ── the working clutter at the root of the pier. Placed in a
     loose arc around the pier head rather than scattered, so it reads as
     somebody's landing rather than as dressing. */
  const quayProps = [
    [barrelProp(8), 1.05, 0.55, 0.5], [barrelProp(9), 1.22, 0.72, 1.9],
    [barrelProp(10), 0.92, 0.78, 0.2], [crate(11), 1.35, -0.48, 0.7],
    [crate(12), 1.15, -0.62, 2.2], [ropeCoil(13), 1.55, 0.42, 0],
    [lobsterPot(14), 0.82, -0.55, 0], [lobsterPot(15), 0.95, -0.72, 0],
    [crate(16), 0.70, 0.95, 1.1],
  ];
  quayProps.forEach(([kit, out, along, spin]) => {
    coast.add(place(kit, harbour(out, along), { spin }));
  });

  // A bench and a signpost on the path along the cliff top.
  coast.add(place(bench(17), harbour(0.2, -1.9), { scale: 0.85, spin: seaward(0.2, -1.9) + Math.PI / 2 }));
  coast.add(place(signpost(18), harbour(0.9, 1.05), { scale: 0.55, spin: 1.2 }));

  group.add(coast);

  // ── THE MOUNTAIN ──────────────────────────────────────────────────────────
  const mountain = new THREE.Group();
  mountain.name = 'mountain';
  const mDir = anchorOf('mountain');
  const mEast = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), mDir).normalize();
  const mNorth = new THREE.Vector3().crossVectors(mDir, mEast).normalize();
  const nearMountain = (de, dn) => mDir.clone()
    .addScaledVector(mEast, de / R).addScaledVector(mNorth, dn / R).normalize();

  [[-2.2, -1.8, 0.4], [2.4, -2.2, -0.8], [-3.0, 0.6, 1.6]].forEach(([e, n, s]) => {
    mountain.add(place(kits.cabin, nearMountain(e, n), { scale: 0.66, spin: s }));
  });
  mountain.add(place(lookout(1), nearMountain(1.5, 0.9), { scale: 0.7 }));

  /* The waterfall, at the head of the river where it leaves the mountain. Its
     position comes from RIVER[2] rather than from a number, so if the river is
     ever re-routed the fall moves with it instead of pouring off a cliff that
     is no longer there. */
  const fallDir = RIVER[3];
  const fall = place(waterfall(1.5, 0.5, 1), fallDir, { scale: 1, lift: -0.55 });
  fall.name = 'waterfall';
  mountain.add(fall);
  group.add(mountain);

  // ── THE RIVER CROSSINGS ───────────────────────────────────────────────────
  /* Two bridges, on the river, oriented along it. The direction comes from the
     river's own neighbouring points, so a bridge is always square to the water
     rather than at whatever angle a hand-typed rotation happened to give. */
  [14, 26].forEach((i, n) => {
    const here = RIVER[i];
    const ahead = RIVER[i + 1];
    // Sized against the house, like everything else. A 1.5-unit span at 0.8
    // scale made a footbridge twice the width of the buildings beside it.
    const b = build(bridge(1.1, n + 1));
    const h = heightAt(here);
    standOn(b, latOf(here), lonOf(here), h + 0.10);
    // Turn it to face along the flow: the angle between the river's local
    // direction and the object's own east axis.
    const e = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), here).normalize();
    const nn = new THREE.Vector3().crossVectors(here, e).normalize();
    const flow = ahead.clone().sub(here);
    b.rotateY(Math.atan2(flow.dot(nn), flow.dot(e)));
    b.scale.setScalar(0.42);
    group.add(b);
  });

  // ── THE RAILWAY ───────────────────────────────────────────────────────────
  /* Sleepers and rails, laid along the loop from planet.js. Both read
     `railPoint` and `railHeight` — the same two functions the train reads — so
     the track and the thing running on it cannot disagree. Nothing here
     recomputes a position from the terrain, which is exactly how the train
     previously ended up beside its own rails. */
  const SLEEPERS = quality === 'low' ? 150 : 300;
  const sleeperMats = [];
  const railMats = [[], []];
  const _p = new THREE.Vector3();
  const _a = new THREE.Vector3();

  for (let i = 0; i < SLEEPERS; i++) {
    const t = i / SLEEPERS;
    railPoint(t, _p);
    railPoint(t + 0.0022, _a);
    const h = railHeight(t) + 0.018;

    const e = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), _p).normalize();
    const nn = new THREE.Vector3().crossVectors(_p, e).normalize();
    const flow = _a.clone().sub(_p);
    const spin = Math.atan2(flow.dot(nn), flow.dot(e));

    sleeperMats.push(surfaceMatrix(latOf(_p), lonOf(_p), h, { scale: 1, spin }));
    // The two rails, offset either side along the sleeper's own axis.
    [-0.105, 0.105].forEach((off, k) => {
      const o = new THREE.Object3D();
      o.applyMatrix4(sleeperMats[sleeperMats.length - 1]);
      o.translateZ(off);
      o.translateY(0.022);
      o.updateMatrix();
      railMats[k].push(o.matrix.clone());
    });
  }

  const sleeperGeo = new THREE.BoxGeometry(0.05, 0.03, 0.30);
  const railGeo = new THREE.BoxGeometry(0.145, 0.026, 0.026);
  group.add(scatter([{ geo: sleeperGeo, mat: felt(PAL.woodDark, { flat: false, repeat: 1 }) }],
    sleeperMats, { name: 'sleepers', shadow: false }));
  railMats.forEach((mats, i) => {
    group.add(scatter([{ geo: railGeo, mat: felt(0x4a4038, { flat: false, repeat: 1 }) }],
      mats, { name: `rail-${i}`, shadow: false }));
  });

  // The tunnel mouth, sitting on the bed like everything else on the line.
  {
    const t = 0.62;
    const at = railPoint(t, new THREE.Vector3());
    const ahead = railPoint(t + 0.004, new THREE.Vector3());
    const node = build(tunnel(1), { name: 'tunnel' });
    standOn(node, latOf(at), lonOf(at), railHeight(t));
    const e = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), at).normalize();
    const nn = new THREE.Vector3().crossVectors(at, e).normalize();
    const flow = ahead.clone().sub(at);
    node.rotateY(Math.atan2(flow.dot(nn), flow.dot(e)));
    node.scale.setScalar(0.9);
    group.add(node);
  }

  // ── CLOUDS ────────────────────────────────────────────────────────────────
  /* Hung on threads, outside the planet, in a loose shell. The threads are the
     single most important detail in the world: they are what says this is a
     model on a table rather than a planet in space. */
  const clouds = new THREE.Group();
  clouds.name = 'clouds';
  const CLOUD_N = quality === 'low' ? 9 : 16;
  // Every destination's camera stands close enough to the shell that a cloud
  // placed directly overhead reads as a boulder a few metres away rather than
  // as weather in the distance — exactly the "just the tip and a cloud" shot
  // the mountain view collapsed into. So the same loose scatter is used, but a
  // candidate too near any destination's own airspace is redrawn rather than
  // kept, which costs nothing where nobody is standing and clears the sky
  // precisely where a visitor arrives.
  const destDirs = DESTINATIONS.map((d) => onSphere(d.lat, d.lon, 1));
  const CLOUD_CLEAR = 0.34;
  for (let i = 0; i < CLOUD_N; i++) {
    const kit = cloud(i * 13 + 5, { string: true });
    const node = build(kit, { shadow: false, name: `cloud-${i}` });
    let dir;
    for (let attempt = 0; attempt < 10; attempt++) {
      const u = rand() * 1.4 - 0.35;
      const th = rand() * Math.PI * 2;
      const s = Math.sqrt(Math.max(0, 1 - u * u));
      dir = new THREE.Vector3(s * Math.cos(th), u, s * Math.sin(th)).normalize();
      if (destDirs.every((dd) => arc(dir, dd) > CLOUD_CLEAR)) break;
    }
    const d = R * (1.24 + rand() * 0.40);
    standOn(node, latOf(dir), lonOf(dir), d);
    node.scale.setScalar(0.55 + rand() * 0.45);
    node.userData.drift = 0.02 + rand() * 0.05;
    clouds.add(node);
  }
  group.add(clouds);

  // ── THE MOVING THINGS ─────────────────────────────────────────────────────
  /* Built here, driven by life.js. They are returned rather than just added, so
     the animation layer does not have to go looking for them by name. */
  /* THE TRAIN IS BUILT IN JS, NOT TAKEN FROM THE KIT, and that is a fix rather
     than a preference. The kit's LOCO, CARR and BOAT are all modelled with
     their long axis on Z, but `headingTo` puts an object's +X along its
     direction of travel — so all three rode broadside, the locomotive running
     down its own rails sideways. The JS builders are modelled nose-along-+X at
     final world scale with y = 0 on the railhead, so they need no scaling and
     no fudge factor to sit on the track. */
  const train = new THREE.Group();
  train.name = 'train';
  const loco = build(locomotive(1), { name: 'loco' });
  train.add(loco);
  // Three carriages in three colours — the kit could not do this (one mesh,
  // one material), and a rake of identical coaches reads as a conveyor belt.
  const CAR_COLOURS = [PAL.roofRed, PAL.roofGreen, PAL.roofBlue];
  const cars = CAR_COLOURS.map((color, i) => {
    const car = build(carriage(i + 2, { color }), { name: `car-${i}` });
    train.add(car);
    return car;
  });
  group.add(train);

  const boat = build(sailboat(1), { name: 'sailboat' });
  group.add(boat);

  // ── THE LANDMARK ANCHORS ──────────────────────────────────────────────────
  /* What interaction.js raycasts against, and what the labels follow. The
     radius is generous — these are targets, not colliders. */
  const landmarks = DESTINATIONS.map((dest) => {
    const dir = anchorOf(dest.id);
    const h = heightAt(dir);
    return {
      dest,
      position: dir.clone().multiplyScalar(h + R * 0.03),
      radius: R * 0.16,
    };
  });

  return {
    group,
    land,
    sea,
    clouds,
    train: { group: train, loco, cars },
    boat,
    waterfall: fall,
    landmarks,
    folk: { group: folk, dirs: folkDirs },
    village,
    counts: {
      trees: trees.length,
      conifers: conifers.length,
      folk: folkDirs.length,
    },
  };
}

/* ══ SKY AND LIGHT ═════════════════════════════════════════════════════════
   Three lights and a fog, and the whole mood of the world is in the balance
   between them. The key is warm and comes from high and to the side; the fill
   is cold and comes from the opposite side to keep the shadow sides blue rather
   than black; the hemisphere light is what stops the undersides going dead.

   Returned as an object with a `mood()` so destinations can change the light
   without rebuilding it — the village at dusk is the same three lights turned
   down and warmed up, not a second rig. */
export function buildSky(scene) {
  /* THE KEY, and where it stands is the single biggest decision about how this
     world reads. It sits high, in FRONT of the world and a little to the left —
     the same place a desk lamp would be if you were photographing a model on a
     table, which is exactly the impression the references give.

     It was originally behind-and-right, which lit the far side of the planet
     and left the whole face the visitor actually sees in shadow. On a sphere
     there is no recovering from that with fill: the key has to be on the
     camera's side of the object. */
  const sun = new THREE.DirectionalLight(0xfff1da, 3.1);
  sun.position.set(-11, 19, 17);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const d = R * 1.45;
  Object.assign(sun.shadow.camera, { left: -d, right: d, top: d, bottom: -d, near: 1, far: 70 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  // A DirectionalLight aims at its `target`, which must itself be in the scene
  // or the light keeps pointing at the origin no matter what the target says.
  scene.add(sun.target);

  /* The hemisphere light does the job a bounce card does on a real tabletop
     model: it stops the side facing away from the key going to black. The sky
     colour is on the cool side and the ground colour warm, so an unlit face
     picks up blue from above and a little warmth from below rather than just
     getting darker. */
  const hemi = new THREE.HemisphereLight(0x9ec9e6, 0x6a5a42, 1.55);
  scene.add(hemi);

  /* The fill comes from the opposite side and is cold, so the shadow side of
     everything goes blue rather than black — which is what the sky would do to
     a real model, and what stops the unlit limb of the planet reading as a hole
     cut in the picture. */
  const fill = new THREE.DirectionalLight(0x9dc2dc, 0.85);
  fill.position.set(15, 3, -9);
  scene.add(fill);

  const fog = new THREE.Fog(SKY.landing.fog, R * 2.6, R * 7.2);
  scene.fog = fog;
  scene.background = new THREE.Color(SKY.landing.fog);

  const target = { sun: 3.1, hemi: 1.55, fill: 0.85 };
  let current = { ...target };

  /* WHERE THE KEY LIGHT LIVES. On the globe it is parked in front of the
     planet; inside a destination it is moved to suit the place. Both are kept
     so the return trip can put it back. */
  const GLOBE_SUN = sun.position.clone();
  const sunGoal = GLOBE_SUN.clone();

  return {
    sun, hemi, fill, fog,

    /* ── LIGHT THE PLACE YOU ARE STANDING IN ────────────────────────────────
       A single fixed sun works for the globe — the planet turns under it and
       the terminator sweeping across the land is half of what makes the world
       read as an object on a table. It does NOT work once you have travelled
       somewhere: the destination is wherever the visitor left the planet
       pointing, so half the time you arrive on the night side and the village
       is a silhouette.

       So on arrival the key is moved to a spot above and behind the CAMERA,
       raking across the place at a low angle. That is not a cheat, it is what
       anybody photographing a model does — you move the lamp, not the model.

       `shadowSpan` tightens the shadow camera at the same time. The globe needs
       a frustum wide enough for a whole planet, which spends almost all of its
       resolution on empty space when you are looking at one village. */
    focusOn(position, normal, { shadowSpan = R * 0.55 } = {}) {
      const side = new THREE.Vector3().crossVectors(normal, new THREE.Vector3(0, 1, 0));
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
      side.normalize();

      sunGoal.copy(position)
        .addScaledVector(normal, R * 0.9)
        .addScaledVector(side, R * 0.55);

      sun.target.position.copy(position);
      sun.target.updateMatrixWorld();

      const d = shadowSpan;
      Object.assign(sun.shadow.camera, { left: -d, right: d, top: d, bottom: -d, near: 0.5, far: R * 3.2 });
      sun.shadow.camera.updateProjectionMatrix();
    },

    /* Put the key back where the globe wants it. */
    focusOnWorld() {
      sunGoal.copy(GLOBE_SUN);
      sun.target.position.set(0, 0, 0);
      sun.target.updateMatrixWorld();
      const d = R * 1.45;
      Object.assign(sun.shadow.camera, { left: -d, right: d, top: d, bottom: -d, near: 1, far: 70 });
      sun.shadow.camera.updateProjectionMatrix();
    },

    /* Move the whole rig towards one of the moods in content.js. Called on
       arrival at a destination and on the way back out. */
    mood(name, k = 1) {
      const s = SKY[name] ?? SKY.landing;
      scene.background.lerp(new THREE.Color(s.fog), k);
      fog.color.lerp(new THREE.Color(s.fog), k);
      const dusk = name === 'dusk';
      target.sun = dusk ? 1.25 : 3.1;
      target.hemi = dusk ? 0.65 : 1.55;
      target.fill = dusk ? 0.42 : 0.85;
      sun.color.lerp(new THREE.Color(dusk ? 0xffb877 : 0xfff1da), k);
      hemi.color.lerp(new THREE.Color(dusk ? 0x35507a : 0xa8cde4), k);
    },

    /* Eased on the world's clock, so a mood change is a fade rather than a cut. */
    update(dt) {
      const k = 1 - Math.pow(0.94, dt / 16.67);
      // The key slides to its new post rather than jumping, so the shadows
      // swing round as the camera travels instead of snapping on arrival.
      sun.position.lerp(sunGoal, k * 0.6);
      current.sun += (target.sun - current.sun) * k;
      current.hemi += (target.hemi - current.hemi) * k;
      current.fill += (target.fill - current.fill) * k;
      sun.intensity = current.sun;
      hemi.intensity = current.hemi;
      fill.intensity = current.fill;
    },

    dispose() {
      scene.remove(sun, hemi, fill);
      scene.fog = null;
    },
  };
}
