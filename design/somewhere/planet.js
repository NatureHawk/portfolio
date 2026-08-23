// PLANET — the ball everything else stands on.
//
// One displaced icosphere for the land, one plain sphere inside it for the sea,
// and a single height function that decides, for any direction out from the
// centre, how high the ground is there and what colour it is.
//
// WHY A HEIGHT FUNCTION RATHER THAN A MODEL. Everything in the world has to
// agree about where the ground is: a tree has to stand on it, a path has to lie
// on it, the camera has to stop above it, and the river has to run downhill.
// If the terrain were a mesh somebody sculpted, every one of those would need to
// raycast against it. Because it is a function, they all just call `height()`
// and get an exact answer for nothing. That one decision is what makes the rest
// of this world cheap.
//
// HOW THE CLIFFS HAPPEN. They are not modelled. The land mask falls off very
// sharply at the coastline — `smoothstep` over a narrow band — so the geometry
// itself drops almost vertically into the sea, and the colouring rule "steep
// means rock" paints that drop as a rock face with grass on the lip. That is
// exactly how the edge reads on 4-MasterWorld.png, and it costs one line.
//
// COLOUR LIVES IN THE VERTICES. Grass, sand, rock, snow, beaches, paths and the
// river are all painted into the vertex colours of one geometry, so the entire
// terrain — the single biggest object in the world — is ONE draw call with one
// material. No splat maps, no texture atlas, no second pass.

import * as THREE from 'three';
import { PAL, WORLD, R, DESTINATIONS } from './content.js';
import { felt, water, onSphere, makeFabric, makeSea } from './craft.js';

/* ══ NOISE ═════════════════════════════════════════════════════════════════
   A small 3D value noise, hashed rather than table-driven so there is nothing
   to allocate. Four octaves is enough: this terrain is read from far away and
   is covered in props, and a fifth octave is detail nobody will ever see. */
function hash3(x, y, z) {
  let h = x * 374761393 + y * 668265263 + z * 1274126177;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

const fade = (t) => t * t * (3 - 2 * t);
const mix = (a, b, t) => a + (b - a) * t;

function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = fade(x - xi), yf = fade(y - yi), zf = fade(z - zi);
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz);
  return mix(
    mix(mix(c(0, 0, 0), c(1, 0, 0), xf), mix(c(0, 1, 0), c(1, 1, 0), xf), yf),
    mix(mix(c(0, 0, 1), c(1, 0, 1), xf), mix(c(0, 1, 1), c(1, 1, 1), xf), yf),
    zf,
  );
}

function fbm(x, y, z, octaves = 4) {
  let sum = 0, amp = 0.5, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise3(x * freq, y * freq, z * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

const smoothstep = (a, b, t) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/* ══ WHERE THINGS ARE ══════════════════════════════════════════════════════
   The destinations' unit directions, resolved once. The height function needs
   them on every vertex, so recomputing the trigonometry each time would make
   terrain generation several times more expensive than it needs to be. */
const ANCHORS = Object.fromEntries(
  DESTINATIONS.map((d) => [d.id, onSphere(d.lat, d.lon, 1)]),
);

/* Angular distance from a direction to an anchor, in radians. This is the
   measure every feature below is shaped with: "how far am I from the mountain"
   rather than any kind of xyz distance, because on a sphere those are not the
   same thing and using xyz gives features that shear near the poles. */
const arc = (dir, anchor) => Math.acos(Math.min(1, Math.max(-1, dir.dot(anchor))));

/* ══ THE RIVER ═════════════════════════════════════════════════════════════
   A chain of points from the mountain's shoulder down to the sea past the
   village, walked as great-circle steps. Its only job is to be somewhere the
   height function can subtract from and the colouring can paint blue.

   Public, because the bridges, the waterfall and the boats all need to know
   where the water actually ended up. */
export const RIVER = (() => {
  const pts = [];
  const from = onSphere(58, -12, 1);
  const via = onSphere(34, 16, 1);
  const to = onSphere(2, 74, 1);
  // Two quadratic arcs through `via`, normalised back onto the sphere at each
  // step so the path stays on the surface rather than cutting through the ball.
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const a = from.clone().lerp(via, t);
    const b = via.clone().lerp(to, t);
    pts.push(a.lerp(b, t).normalize());
  }
  return pts;
})();

/* Distance from a direction to the river, in radians — the only per-vertex loop
   left in the file, so it is written to be cheap: the search compares raw dot
   products (largest dot = smallest angle) and pays for exactly one arc-cosine at
   the end, rather than one per sample. */
function toRiver(dir) {
  let best = -Infinity;
  for (let i = 0; i < RIVER.length; i++) {
    const p = RIVER[i];
    const d = dir.x * p.x + dir.y * p.y + dir.z * p.z;
    if (d > best) best = d;
  }
  return Math.acos(Math.min(1, Math.max(-1, best)));
}

/* ══ THE RAILWAY ═══════════════════════════════════════════════════════════
   A closed loop the train is physically constrained to, and the single most
   important property it has is this:

       EVERY POINT OF IT IS ON DRY LAND.

   The first version was a tilted great circle right round the planet, which
   looked correct on the master-world reference and was wrong for a very simple
   reason: land is only about a quarter of this sphere, so a great circle spends
   half its length over open ocean. The train followed the terrain height
   faithfully — straight down onto the sea bed. Measured: 48.5% of the circuit
   underwater.

   So the loop is now a SMALL circle around the land cap rather than a great
   circle around the planet. It was found by searching axes near the cap pole
   for the largest cone angle whose entire circumference clears the waterline;
   the numbers below are that search's answer and should be re-derived, not
   nudged, if the coastline ever changes.

   THE BED. `railHeight` is a smoothed height profile sampled once around the
   loop. The terrain blends towards it near the track, so the railway sits on a
   level embankment with gentle grades instead of following every lump — and
   `life.js` reads the same profile, which is what guarantees the train is on
   the rails rather than near them. */
export const RAIL = (() => {
  const axis = new THREE.Vector3(-0.0786, 0.9706, 0.2274).normalize();
  // Any vector perpendicular to the axis will do for the circle's frame.
  const u = new THREE.Vector3().crossVectors(axis, new THREE.Vector3(0, 0, 1)).normalize();
  const v = new THREE.Vector3().crossVectors(axis, u).normalize();
  const angle = THREE.MathUtils.degToRad(41);
  return { axis, u, v, angle, k: Math.sin(angle), h: Math.cos(angle) };
})();

/* A point on the railway at t (0..1 around the loop). Exported because the
   train, the sleepers and the rails must all read the SAME curve — three
   separate approximations of "roughly a circle" is how a train ends up beside
   its own track. */
export function railPoint(t, out = new THREE.Vector3()) {
  const a = t * Math.PI * 2;
  return out.set(0, 0, 0)
    .addScaledVector(RAIL.u, Math.cos(a) * RAIL.k)
    .addScaledVector(RAIL.v, Math.sin(a) * RAIL.k)
    .addScaledVector(RAIL.axis, RAIL.h)
    .normalize();
}

/* Angular distance from any direction to the railway — solved, not searched.
   The loop is a circle of constant angle around `RAIL.axis`, so the distance is
   just how far this point's own angle from that axis differs from the circle's.
   Called for every terrain vertex and every candidate prop position. */
function toTrack(dir) {
  return Math.abs(Math.acos(Math.min(1, Math.max(-1, dir.dot(RAIL.axis)))) - RAIL.angle);
}

/* ── THE TRACK BED ────────────────────────────────────────────────────────
   The height profile of the railway, smoothed. Built lazily and once, from the
   RAW terrain — `baseHeight` below is the height function without the railway
   term in it, which is what stops this definition being circular.

   The smoothing is a wrapped box blur run twice. It has to wrap: the loop is
   closed, and a profile whose two ends do not agree gives the train a step to
   fall down once per lap. */
const RAIL_SAMPLES = 256;
let RAIL_PROFILE = null;

function buildRailProfile() {
  const raw = new Float64Array(RAIL_SAMPLES);
  const p = new THREE.Vector3();
  for (let i = 0; i < RAIL_SAMPLES; i++) {
    raw[i] = baseHeight(railPoint(i / RAIL_SAMPLES, p));
  }
  let cur = raw;
  for (let pass = 0; pass < 2; pass++) {
    const next = new Float64Array(RAIL_SAMPLES);
    const W = 9;                       // half-width of the blur, in samples
    for (let i = 0; i < RAIL_SAMPLES; i++) {
      let sum = 0;
      for (let j = -W; j <= W; j++) {
        sum += cur[(i + j + RAIL_SAMPLES * 2) % RAIL_SAMPLES];
      }
      next[i] = sum / (W * 2 + 1);
    }
    cur = next;
  }
  return cur;
}

/* The height of the rail bed at t, interpolated between samples.

   IN WORLD UNITS, like everything else the height system returns. The profile
   is sampled from `baseHeight`, which has already multiplied by R — an earlier
   version multiplied again here, which put the railway at a radius of ninety
   and the train in orbit. Worse, it did so SILENTLY: every "is the track under
   water" check passed, because a bed ten times too high clears the sea very
   comfortably indeed. A unit bug that makes the test go green is the expensive
   kind. */
export function railHeight(t) {
  if (!RAIL_PROFILE) RAIL_PROFILE = buildRailProfile();
  const x = ((t % 1) + 1) % 1 * RAIL_SAMPLES;
  const i = Math.floor(x);
  const f = x - i;
  const a = RAIL_PROFILE[i % RAIL_SAMPLES];
  const b = RAIL_PROFILE[(i + 1) % RAIL_SAMPLES];
  return a + (b - a) * f;
}

/* Where a direction sits along the loop, 0..1 — needed to look the bed height
   up for a point that is near the track but was not generated from it. */
function railParam(dir) {
  const x = dir.dot(RAIL.u);
  const y = dir.dot(RAIL.v);
  return (Math.atan2(y, x) / (Math.PI * 2) + 1) % 1;
}

/* ══ THE LAND MASK ═════════════════════════════════════════════════════════
   Positive on land, negative at sea. A tilted cap — so the land sits on top of
   the ball the way it does in the reference rather than wrapping it — with
   enough noise on the edge to give an irregular coastline, and a deliberate
   bulge towards the coast destination so the harbour has something to sit on. */
const CAP_AXIS = new THREE.Vector3(0.16, 1, 0.10).normalize();

/* ══ THE OTHER LAND ════════════════════════════════════════════════════════
   One continent is not a world, it is a lid. Everything below exists so that
   turning the planet keeps finding things: a real island on the far side with
   its own weather, a scatter of rocks that are just rocks, and ice at the
   bottom.

   WHY IT MATTERS MORE THAN IT SOUNDS. The whole promise of this world is that
   it is worth turning over. If the only thing on the back is empty water, the
   visitor learns in one drag that there is nothing there and stops exploring —
   and the drag was supposed to be the point. */

/* THE ISLAND. Far enough from the mainland to be unmistakably separate, and
   deliberately placed on the opposite face so it is a REWARD for turning the
   world rather than something visible from the landing. */
const ISLAND = onSphere(8, -150, 1);
const ISLAND_R = 0.36;        // angular radius, radians

/* THE ISLETS. Rocks with a bit of sand on them. They hold nothing, they lead
   nowhere, and that is the point: a world where every single object is a
   destination is a menu, not a place. */
const ISLETS = [
  { dir: onSphere(-14, -66, 1), r: 0.052 },
  { dir: onSphere(-30, 24, 1), r: 0.040 },
  { dir: onSphere(4, 156, 1), r: 0.061 },
  { dir: onSphere(-22, 138, 1), r: 0.035 },
  { dir: onSphere(-6, -108, 1), r: 0.046 },
  { dir: onSphere(-40, -168, 1), r: 0.038 },
  { dir: onSphere(18, 168, 1), r: 0.030 },
];

/* THE SOUTH POLE. A low shelf of ice around the bottom of the world — no
   relief to speak of, because an ice cap is a sheet, and giving it mountains
   would make it read as a second continent rather than as the bottom of this
   one. */
const POLE_AXIS = new THREE.Vector3(0, -1, 0);
/* How far up from the pole the ice reaches, 0..1. Small, and it has to be:
   at 0.42 the cap covered a fifth of the entire sphere — as much ground as the
   mainland — and the world read as an ice planet with a garden on top. An ice
   cap should be a hem at the bottom of the picture, not a second continent. */
const POLE_EDGE = 0.185;

function islandMask(dir) {
  const d = arc(dir, ISLAND);
  if (d > ISLAND_R * 2.2) return -1;
  // A ragged edge, at a finer scale than the mainland's, so the island reads
  // as smaller rather than just as a smaller version of the same shape.
  const edge = (fbm(dir.x * 9 + 21, dir.y * 9, dir.z * 9, 3) - 0.5) * 0.30;
  return (ISLAND_R - d) / ISLAND_R + edge;
}

function isletMask(dir) {
  let best = -1;
  for (let i = 0; i < ISLETS.length; i++) {
    const { dir: c, r } = ISLETS[i];
    const d = arc(dir, c);
    if (d > r * 2.4) continue;
    const edge = (fbm(dir.x * 26 + i * 7, dir.y * 26, dir.z * 26, 2) - 0.5) * 0.55;
    const m = (r - d) / r + edge;
    if (m > best) best = m;
  }
  return best;
}

function poleMask(dir) {
  const t = dir.dot(POLE_AXIS);                 // 1 at the south pole
  const edge = (fbm(dir.x * 5 + 41, dir.y * 5, dir.z * 5, 3) - 0.5) * 0.30;
  return (t - (1 - POLE_EDGE)) / POLE_EDGE + edge;
}

/* Which of the four kinds of ground is this? Used by the colouring here and by
   the scatter in world.js, which plants completely different things on the
   island than it does on the mainland. */
export function biomeAt(dir) {
  if (islandMask(dir) > 0) return 'island';
  if (poleMask(dir) > 0) return 'pole';
  if (isletMask(dir) > 0) return 'islet';
  return 'main';
}

function landMask(dir) {
  const lat = dir.dot(CAP_AXIS);                       // 1 at the cap's pole

  // THREE scales of edge noise, not one. The big wobble decides the shape of the
  // continent, the middle one puts bays and headlands on it, and the fine one
  // exists purely to stop the coastline staircasing: the shore band in
  // `heightAt` is very narrow, so without noise at the same spatial frequency as
  // the mesh, the cliff edge snaps to the triangle grid and reads as pixel art.
  const wobble = (fbm(dir.x * 1.7 + 5, dir.y * 1.7, dir.z * 1.7, 3) - 0.5) * 0.62;
  const bays = (fbm(dir.x * 5.5, dir.y * 5.5 + 9, dir.z * 5.5, 3) - 0.5) * 0.20;
  const fine = (fbm(dir.x * 17, dir.y * 17 + 3, dir.z * 17, 2) - 0.5) * 0.055;

  // The coast destination needs a peninsula: without this the harbour ends up
  // either inland or in open water, depending on where the noise happened to
  // put the coastline that day.
  const coastPull = smoothstep(0.62, 0.10, arc(dir, ANCHORS.coast)) * 0.30;

  /* THE SETTLEMENTS ARE LAND BY DEFINITION, and this is not decoration — it is
     the fix for buildings standing in the sea.

     `baseHeight` levels a plateau under the village and the forest, but that
     happens further down and it can only raise ground that EXISTS. A point the
     mask has already called sea returns early with a sea-bed height and never
     reaches the flattening at all — which is precisely what happened to the
     outer ring of the village: six of ten houses stood on terrain that had
     exited the function before the plateau was ever applied.

     So the places that must be buildable are pushed positive HERE, at the mask,
     before anything downstream can decide they are water. */
  const built = Math.max(
    smoothstep(0.50, 0.16, arc(dir, ANCHORS.village)) * 0.55,
    smoothstep(0.44, 0.14, arc(dir, ANCHORS.forest)) * 0.45,
  );

  const main = lat - (1 - WORLD.landCap) + wobble * 0.34 + bays + fine + coastPull + built;

  // The mainland, the island, the islets and the ice cap are all just LAND, as
  // far as the rest of the height function is concerned. Taking the maximum
  // means each one carves its own coastline out of the same ocean, and they
  // cannot interfere with each other.
  return Math.max(main, islandMask(dir) * 0.45, isletMask(dir) * 0.30, poleMask(dir) * 0.40);
}

/* ══ HEIGHT ════════════════════════════════════════════════════════════════
   The one function the whole world agrees on. Give it a unit direction, get
   back the radius of the ground there.

   The order matters: build the land, then put the mountain on it, then flatten
   the places that have to be flat, then cut the river. Doing the flattening
   before the mountain gives a village on a slope; cutting the river before the
   mountain gives a waterfall that runs uphill. */
/* The terrain WITHOUT the railway on it. Everything below is the real shape of
   the ground; `heightAt` then lays the embankment over the top. The split
   exists so the rail bed can be measured against the land it is being built on
   without asking about itself. */
function baseHeight(dir) {
  const mask = landMask(dir);

  // SEA. Everything below the waterline is a smooth shelf, not noise — it is
  // never seen, and noise down there only makes the coastline sparkle.
  if (mask <= 0) {
    return R * (0.930 - clamp01(-mask * 1.4) * 0.02);
  }

  // SHORE → INLAND. A hard rise over the first fraction of the mask, which is
  // the cliff, then rolling country above it.
  //
  // TWO OCTAVES OF HILLS, and they do different jobs. The broad one gives the
  // land its shoulders — the sense that the interior is higher than the rim,
  // which is most of what makes a diorama read as landscape rather than as a
  // green lid. The fine one is the lumpiness underfoot that catches the sun and
  // gives every tree a slightly different footing. An earlier pass had a single
  // octave at a tenth of this amplitude and the result was a smooth blob.
  const shore = smoothstep(0, 0.050, mask);
  const broad = (fbm(dir.x * 2.2 + 31, dir.y * 2.2, dir.z * 2.2, 3) - 0.5) * 0.085;
  const fine = (fbm(dir.x * 6.4, dir.y * 6.4 + 2, dir.z * 6.4, 4) - 0.5) * 0.030;
  let h = 0.958 + shore * 0.048 + (broad + fine) * shore;

  // THE MOUNTAIN. A cone with a soft shoulder and a little noise on its flanks,
  // plus two lesser peaks beside it so the massif is not one tidy pyramid.
  // The exponent is what shapes it: above 1 the flanks are concave and it reads
  // as a mountain, at 1 it is a tent, and below 1 it is a pudding.
  const dm = arc(dir, ANCHORS.mountain);
  const peak = smoothstep(0.26, 0.010, dm);

  /* NARROW AND STEEP. The first version spread the massif over 0.52 radians —
     five units across on a ten-unit world — and raised it 2.3 units, which is a
     gradient of about one in four. That is not a mountain, it is a hill the
     size of a continent, and from the destination camera it filled the frame as
     a smooth bald dome with the snow rule painting the whole thing cream.

     Halving the radius and keeping the height is what turns it into a peak. The
     exponent does the rest: at 2.4 the flanks are strongly concave, so the
     thing has shoulders and a point instead of a shallow curve. */
  h += Math.pow(peak, 2.4) * 0.255;
  h += smoothstep(0.17, 0.02, arc(dir, onSphere(56, -34, 1))) ** 2.2 * 0.150;
  h += smoothstep(0.15, 0.02, arc(dir, onSphere(58, 4, 1))) ** 2.2 * 0.125;

  /* The crags. TWO octaves at different scales, both gated on being up the
     mountain: a broad one that breaks the cone into ridges and gullies, and a
     fine one that stops any face reading as a smooth plane. Without these the
     silhouette is a cone no matter how steep it is. */
  const alp = Math.pow(peak, 0.55);
  h += (fbm(dir.x * 16, dir.y * 16, dir.z * 16, 3) - 0.5) * 0.075 * alp;
  h += (fbm(dir.x * 34 + 7, dir.y * 34, dir.z * 34, 2) - 0.5) * 0.028 * alp;

  /* THE HEADLAND. The coast needs somewhere for the lighthouse to STAND — a
     lighthouse at sea level on a flat shelf is a shed. This raises a small
     bluff at the anchor, which the "steep means rock" colouring then wraps in
     cliffs, and which gives the destination camera something to look at other
     than open water.

     Added BEFORE the flattening below, so the harbour is still cut flat into
     the side of it rather than the bluff being levelled away. */
  const dc = arc(dir, ANCHORS.coast);
  h += smoothstep(0.20, 0.03, dc) ** 1.9 * 0.075;
  h += (fbm(dir.x * 19 + 13, dir.y * 19, dir.z * 19, 2) - 0.5) * 0.020
       * smoothstep(0.26, 0.05, dc);

  /* FLAT GROUND where a place has to be built. `core` is the radius that is
     levelled COMPLETELY; between there and `edge` it eases back into whatever
     the land was doing.

     Both numbers matter, and getting the first one wrong is what put six of the
     village's ten buildings under water. The old version levelled a core of half
     a unit and eased out over two — but the village footprint is nearly five
     units across, so most of it was standing on raw terrain that happened to
     slope into the sea. A settlement's plateau has to be at least as big as the
     settlement. */
  const flatten = (anchor, core, edge, target) => {
    const k = smoothstep(edge, core, arc(dir, anchor));
    h = mix(h, target, k);
  };
  // The village square and everything round it — a genuine plateau, comfortably
  // above the waterline (0.965) with room to spare.
  flatten(ANCHORS.village, 0.30, 0.46, 1.012);
  // The harbour: a smaller flat apron on the seaward side of the headland.
  flatten(onSphere(25, 106, 1), 0.055, 0.13, 0.981);
  // The forest floor — gently levelled so paths and a stream can run through it
  // without the ground falling away underneath them.
  flatten(ANCHORS.forest, 0.16, 0.40, 1.004);


  /* THE ISLAND. Low and rounded, with one modest hill off centre — a small
     landmass with an alpine spine would read as a chunk broken off the
     mainland rather than as somewhere else. */
  const isl = islandMask(dir);
  if (isl > 0) {
    const dome = smoothstep(0, 0.8, isl);
    h = 0.958 + smoothstep(0, 0.16, isl) * 0.042 + dome * 0.055;
    h += smoothstep(0.26, 0.02, arc(dir, onSphere(11, -146, 1))) ** 1.6 * 0.085;
    h += (fbm(dir.x * 13 + 3, dir.y * 13, dir.z * 13, 3) - 0.5) * 0.022 * dome;
  }

  /* THE ISLETS. Barely anything: a hump just clear of the water. */
  const ilt = isletMask(dir);
  if (ilt > 0 && isl <= 0) {
    h = Math.max(h, 0.962 + smoothstep(0, 0.9, ilt) * 0.034);
  }

  /* THE ICE. A shelf, not a landscape — near-flat with a shallow rise inland
     and a low bank of pressure ridges where it meets the sea. */
  const pol = poleMask(dir);
  if (pol > 0) {
    const shelf = 0.968 + smoothstep(0, 0.55, pol) * 0.030;
    const ridges = (fbm(dir.x * 16 + 61, dir.y * 16, dir.z * 16, 2) - 0.5)
      * 0.018 * smoothstep(0.45, 0.02, pol);
    h = Math.max(h, shelf + ridges);
  }

  // THE RIVER, cut last so it wins over everything it crosses.
  const dr = toRiver(dir);
  if (dr < 0.070) {
    const cut = smoothstep(0.070, 0.012, dr);
    h -= cut * 0.030 * (1 - peak * 0.6);
  }

  return R * h;
}

/* ══ HEIGHT ════════════════════════════════════════════════════════════════
   The public one, and the answer the entire world agrees on: the ground, with
   the railway embankment laid over it.

   THE EMBANKMENT is what keeps the train honest. Near the track the terrain is
   pulled all the way onto the smoothed rail profile — not blended part of the
   way, but actually set to it — so the bed under the rails is exactly the
   surface `life.js` puts the train on. Further out it eases back into open
   country over a few hundredths of a radian, which reads as the shoulder of a
   cutting or a causeway depending on which way the land was going. */
const RAIL_BED = 0.030;      // radians: how wide the level bed is
const RAIL_SHOULDER = 0.085; // radians: how far the blend back to terrain runs

export function heightAt(dir) {
  const h = baseHeight(dir);
  const dt = toTrack(dir);
  if (dt > RAIL_SHOULDER) return h;

  const bed = railHeight(railParam(dir));
  // 1 on the bed itself, easing to 0 at the edge of the shoulder.
  const k = smoothstep(RAIL_SHOULDER, RAIL_BED, dt);
  return h + (bed - h) * k;
}

/* ══ COLOUR ════════════════════════════════════════════════════════════════
   Given a direction, the height there and the local steepness, what colour is
   the ground? Six rules, applied in order, each one overriding the last. */
const C = {
  grass: new THREE.Color(PAL.grass),
  grassLit: new THREE.Color(PAL.grassLit),
  grassDeep: new THREE.Color(PAL.grassDeep),
  moss: new THREE.Color(PAL.moss),
  sand: new THREE.Color(PAL.sand),
  sandDeep: new THREE.Color(PAL.sandDeep),
  rock: new THREE.Color(PAL.rock),
  rockDeep: new THREE.Color(PAL.rockDeep),
  snow: new THREE.Color(PAL.snow),
  river: new THREE.Color(PAL.river),
  foam: new THREE.Color(PAL.seaFoam),
  // The island's own palette: paler, warmer sand and a brighter, yellower
  // green than the mainland's. Same family, different weather.
  palm: new THREE.Color(0x8fbe4e),
  palmDeep: new THREE.Color(0x63913a),
  shell: new THREE.Color(0xe4d0a4),
  // The ice. Not white — white reads as paper. A very pale blue-grey with a
  // colder shadow, which is what makes it look like ice rather than like snow.
  ice: new THREE.Color(0xdfe9ee),
  iceDeep: new THREE.Color(0xa9c4d2),
  seaDeep: new THREE.Color(PAL.seaDeep),
};

const _c = new THREE.Color();

export function colorAt(dir, h, steep) {
  const t = h / R;

  // Under water — never really seen, but it stops the coastline fringing black.
  if (t < 0.947) return _c.copy(C.seaDeep);

  /* 0. WHICH LAND IS THIS? The island and the ice cap take completely
        different ramps, and they return early — nothing below this point (the
        river, the paths, the snowline) applies anywhere but the mainland. */
  const isl = islandMask(dir);
  const pol = poleMask(dir);
  const ilt = isletMask(dir);

  if (pol > 0) {
    const nn = fbm(dir.x * 7 + 51, dir.y * 7, dir.z * 7, 3);
    _c.copy(C.ice).lerp(C.iceDeep, clamp01(nn * 1.3 - 0.15));
    // A rim of bare rock and grit where the ice meets the water.
    const rim = smoothstep(0.16, 0, pol);
    if (rim > 0) _c.lerp(C.rockDeep, rim * 0.5);
    if (steep > 0.30) _c.lerp(C.iceDeep, smoothstep(0.30, 0.62, steep) * 0.7);
    return _c;
  }

  if (isl > 0 || ilt > 0) {
    const nn = fbm(dir.x * 8 + 31, dir.y * 8, dir.z * 8, 3);
    _c.copy(C.palm).lerp(C.palmDeep, clamp01(nn * 1.4 - 0.2));
    // A broad pale beach — an island is mostly edge, and the wide bright sand
    // is most of what makes it read as tropical rather than as a spare hill.
    const beach = smoothstep(0.982, 0.962, t);
    if (beach > 0) _c.lerp(C.shell, beach * 0.95);
    if (ilt > 0 && isl <= 0) _c.lerp(C.shell, 0.55);   // islets are mostly sand
    if (steep > 0.26) _c.lerp(C.rock, smoothstep(0.26, 0.58, steep) * 0.8);
    const surfI = smoothstep(0.9585, 0.9660, t) * smoothstep(0.9760, 0.9670, t);
    if (surfI > 0) _c.lerp(C.foam, surfI * 0.9);
    return _c;
  }

  // 1. Base grass, varied by a low-frequency noise so the meadow is not one
  //    flat green. Three greens, mixed continuously.
  const n = fbm(dir.x * 4.4 + 11, dir.y * 4.4, dir.z * 4.4, 3);
  _c.copy(C.grass).lerp(C.grassLit, clamp01(n * 1.6 - 0.2));
  if (n < 0.42) _c.lerp(C.grassDeep, smoothstep(0.42, 0.24, n));

  // 2. Beach — a band of sand just above the waterline.
  const beach = smoothstep(0.975, 0.958, t);
  if (beach > 0) _c.lerp(C.sand, beach * 0.92);

  // 2b. SURF. A hard white line exactly at the waterline, and it is doing more
  // work than its two lines suggest: without it the land does not meet the sea,
  // it just stops, and the whole planet reads as two objects that happen to
  // intersect. Every reference image has this line drawn round every shore.
  const surf = smoothstep(0.9585, 0.9660, t) * smoothstep(0.9760, 0.9670, t);
  if (surf > 0) _c.lerp(C.foam, surf * 0.9);

  // 3. Rock wherever the ground is steep. This is what turns the coastline drop
  //    into a cliff and the mountain into a mountain, with no extra geometry.
  const rocky = smoothstep(0.20, 0.52, steep);
  if (rocky > 0) _c.lerp(t > 1.02 ? C.rock : C.rockDeep, rocky * 0.95);

  // 4. Snow on the summit — but only where it is not sheer, so the cliff faces
  //    of the peak stay bare the way they do on the reference.
  /* Snow only near the SUMMIT, and never on a sheer face. The band was far too
     wide before, so every high slope went cream and the peak lost its rock
     entirely — in the references the snow is a cap with rock showing through
     it, not a coat of paint. */
  const cap = smoothstep(1.150, 1.205, t) * (1 - smoothstep(0.36, 0.62, steep));
  if (cap > 0) _c.lerp(C.snow, cap);

  // 5. The river, painted rather than modelled.
  const dr = toRiver(dir);
  if (dr < 0.030 && t > 0.95) _c.lerp(C.river, smoothstep(0.030, 0.008, dr) * 0.96);

  // 6. Paths. The track's ballast, and a worn trail between the village and the
  //    mountain — both just sand laid over whatever was there.
  const dt = toTrack(dir);
  if (dt < 0.020) _c.lerp(C.sandDeep, smoothstep(0.020, 0.006, dt) * 0.9);

  const trail = Math.min(
    arc(dir, ANCHORS.village) + arc(dir, ANCHORS.mountain) - arc(ANCHORS.village, ANCHORS.mountain),
    arc(dir, ANCHORS.village) + arc(dir, ANCHORS.coast) - arc(ANCHORS.village, ANCHORS.coast),
  );
  if (trail < 0.020 && t > 0.96) _c.lerp(C.sand, smoothstep(0.020, 0.004, trail) * 0.85);

  return _c;
}

/* ══ BUILDING THE MESH ═════════════════════════════════════════════════════ */

/* The steepness at a direction: 0 on flat ground, 1 on a sheer wall.
   Measured by sampling the height a short way off in two perpendicular
   directions and looking at how much it changed.

   This is the SLOW form, and it exists for one caller — prop placement, which
   asks about a few thousand candidate points and needs an answer before the
   geometry exists. The terrain itself uses `steepnessFromNormal` below, which is
   free: three height samples per vertex across a hundred thousand vertices is
   most of a second, and the mesh has already worked out its own normals by then. */
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _t = new THREE.Vector3();

export function steepnessAt(dir, h = heightAt(dir)) {
  // Any two vectors perpendicular to `dir` will do; this picks a stable pair.
  _a.set(-dir.y, dir.x, 0);
  if (_a.lengthSq() < 1e-6) _a.set(1, 0, 0);
  _a.normalize();
  _b.crossVectors(dir, _a).normalize();

  const step = 0.018;
  const h1 = heightAt(_t.copy(_a).multiplyScalar(step).add(dir).normalize());
  const h2 = heightAt(_t.copy(_b).multiplyScalar(step).add(dir).normalize());

  // The two samples give a gradient — rise over run, i.e. the tangent of the
  // slope. Converted here to the SAME 0..1 measure `steepnessFromNormal`
  // returns, so a threshold like 0.42 means one thing everywhere in the world
  // rather than two different things depending on which function was asked.
  const grad = Math.hypot(h1 - h, h2 - h) / (R * step);
  return 1 - 1 / Math.sqrt(1 + grad * grad);
}

/* The fast form: how far the surface normal has tipped away from straight up.
   On a sphere "up" is the direction itself, so a face whose normal still points
   radially is flat ground and one whose normal is perpendicular is a cliff. */
export const steepnessFromNormal = (dir, nx, ny, nz) =>
  1 - Math.abs(dir.x * nx + dir.y * ny + dir.z * nz);

/* The land. An icosphere subdivided until it can hold the coastline, displaced
   by `heightAt` and coloured by `colorAt`.

   ON `detail`. This is a PolyhedronGeometry subdivision count, not a recursion
   depth: each icosahedron edge is cut into `detail + 1` pieces, so the vertex
   count is 20 × (detail + 1)² × 3 — quadratic, not exponential. 40 gives ~101k
   vertices and a coastline that still reads as a coastline at the landing
   distance; below about 30 the cliffs go visibly polygonal, and above 48 the
   build stops being something you can hide behind a loading line.

   TWO PASSES, and the order is the whole performance story. Displace first,
   let three compute the normals, and only then colour — because the colouring
   needs to know how steep the ground is, and reading that off a normal the mesh
   has already worked out costs nothing, while re-deriving it from extra height
   samples would triple the cost of the single most expensive thing this world
   does. */
export function buildLand(detail = 40) {
  const geo = new THREE.IcosahedronGeometry(R, detail);
  // KEPT, not deleted. IcosahedronGeometry already ships a seam-corrected
  // equirectangular UV (PolyhedronGeometry's own `correctSeam` — the geometry
  // is non-indexed, so every triangle owns its three corners outright and the
  // fix costs nothing shared with a neighbour). It only ever looked "torn" for
  // the SEA, whose surface must tile a fine wave pattern uniformly across
  // open water; the land's texture is unstructured noise multiplied under
  // vertex-painted terrain, which hides the ordinary pole-pinch of any
  // sphere UV the way grass hides footprints.

  const pos = geo.attributes.position;
  const count = pos.count;
  const dir = new THREE.Vector3();

  // PASS 1 — displace. One `heightAt` per vertex, and nothing else.
  const dirs = new Float32Array(count * 3);
  const heights = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    dir.fromBufferAttribute(pos, i).normalize();
    const h = heightAt(dir);
    dirs[i * 3] = dir.x; dirs[i * 3 + 1] = dir.y; dirs[i * 3 + 2] = dir.z;
    heights[i] = h;
    pos.setXYZ(i, dir.x * h, dir.y * h, dir.z * h);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();

  // PASS 2 — colour, using the normals from pass 1 to know what is a cliff.
  const nrm = geo.attributes.normal;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    dir.set(dirs[i * 3], dirs[i * 3 + 1], dirs[i * 3 + 2]);
    const steep = steepnessFromNormal(dir, nrm.getX(i), nrm.getY(i), nrm.getZ(i));
    const c = colorAt(dir, heights[i], steep);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  /* THE GROUND IS CLOTH, and it is woven in the shader rather than wrapped in
     a texture. See `makeFabric` in craft.js for why: at this radius no tiling
     of a canvas can be both dense enough to read as fabric from a destination
     and quiet enough not to moiré from orbit.

     SMOOTH-SHADED, unlike everything else in the world. Every prop here is
     flat-shaded on purpose — facets are the form on a hand-cut object — but
     the land is a hundred thousand triangles pretending to be a continuous
     sheet, and faceting it just reads as low-poly ground. The relief now comes
     from the weave, which is finer than any triangle and does not care how the
     mesh was subdivided.

     The material multiplies by the vertex colour, so the base has to be white:
     `colorAt` above has already painted grass, sand, rock and snow into the
     vertices, and the fabric only decides what the surface is MADE of. */
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.97,
    metalness: 0,
    flatShading: false,
  });
  /* THREAD COUNT IS SET AGAINST THE CLOSE CAMERA, not the planet view. A
     destination frames roughly eight world units across a 1440px viewport, so
     70 threads per unit puts a thread at about 2.5 screen pixels — fine enough
     to read as cloth rather than as knitting, coarse enough to survive the
     detail fade. At the first value tried, 24, a thread was seven pixels wide
     and the ground came out looking like a scarf. */
  makeFabric(mat, { thread: 44, seam: 15, relief: 0.60, dye: 0.12, key: 'fabric-land' });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'land';
  return mesh;
}

/* The sea. A plain sphere just inside the land shell — the cliffs are what hide
   the seam, which is why the waterline in content.js and the shore band in
   `heightAt` have to stay in step.

   Two layers: an opaque deep sphere, and a slightly larger translucent one that
   `life.js` breathes in and out so the surface moves without any vertex work. */
export function buildSea() {
  const group = new THREE.Group();
  group.name = 'sea';

  // ONE sphere, and it is OPAQUE. An earlier version had a translucent surface
  // over a darker deep layer, which is the obvious way to get depth and the
  // wrong one here: the two shells sit a few hundredths apart, so the blend
  // fought with the depth buffer and speckled the whole ocean. The reference
  // water is a sheet of blue fabric, not a volume — depth comes from the foam
  // at the shoreline and the shading, both of which are cheaper and read better.
  // A UV sphere rather than an icosphere, and only because of the texture: an
  // icosphere's UVs are a torn mess at the poles, and the embroidered waves
  // have to be able to tile across the surface. The pole pinch a UV sphere has
  // instead is invisible here — the land cap covers one pole and the other is
  // at the bottom of the world.
  const geo = new THREE.SphereGeometry(WORLD.ocean, 96, 64);

  // A long, low swell rather than per-vertex noise. `jitter` is the wrong tool
  // for water — it spikes individual vertices, and on a sphere this size every
  // spike caught the sun and read as a piece of grit floating in the sea.
  const pos = geo.attributes.position;
  const d = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    d.fromBufferAttribute(pos, i).normalize();
    const swell = (fbm(d.x * 6, d.y * 6, d.z * 6, 2) - 0.5) * 0.055;
    const r = WORLD.ocean * (1 + swell * 0.06);
    pos.setXYZ(i, d.x * r, d.y * r, d.z * r);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();

  // DEPTH, painted into the vertices: darker away from the land cap, so the
  // open ocean reads as deeper than the shallows the island sits in. This is
  // the ONLY thing the vertex colours do — the wave lines are far finer than
  // this mesh and belong in a texture, not here.
  const colors = new Float32Array(pos.count * 3);
  const deep = new THREE.Color(PAL.seaDeep);
  const mid = new THREE.Color(PAL.sea);
  const c = new THREE.Color();

  /* HOW DEEP IS IT HERE. Baked per vertex, and the reason the sea can have a
     shoreline at all: a sphere of water has no idea where the land is, so for
     every vertex we ask `heightAt` how high the ground is directly beneath and
     store the gap. The shader turns that into foam in the shallows and darker
     blue offshore — shoaling without a texture, a lookup or a second pass.

     Cheap enough to be uninteresting: about six thousand vertices against a
     height function the terrain already calls a hundred thousand times. */
  const depths = new Float32Array(pos.count);

  for (let i = 0; i < pos.count; i++) {
    d.fromBufferAttribute(pos, i).normalize();
    const near = clamp01((d.dot(CAP_AXIS) + 0.35) / 1.2);
    c.copy(deep).lerp(mid, near * 0.85);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    depths[i] = Math.max(0, WORLD.ocean - heightAt(d));
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aSeaDepth', new THREE.BufferAttribute(depths, 1));

  /* Smooth-shaded, like the land and for the same reason: the relief is the
     stitching, which is finer than any triangle here. */
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.42,
    metalness: 0.04,
    flatShading: false,
  });
  /* `wave` is the number of wave ROWS from pole to pole. Half the sphere's
     circumference is about 30 units, so 80 rows puts a wave every 0.38 units —
     visible as swell at a destination, and fading to an even sheen from orbit. */
  makeSea(mat, { thread: 22, wave: 80 });

  const surf = new THREE.Mesh(geo, mat);
  surf.receiveShadow = true;
  surf.name = 'sea-surface';
  group.add(surf);

  return group;
}

/* ══ WHAT THE REST OF THE WORLD ASKS ═══════════════════════════════════════ */

/* Is this a place something could stand? Used by every scatter: props refuse
   cliffs, refuse water, and refuse the middle of the railway. */
export function standable(dir, { maxSteep = 0.42, minH = R * 0.962 } = {}) {
  const h = heightAt(dir);
  if (h < minH) return false;
  if (steepnessAt(dir, h) > maxSteep) return false;
  if (toTrack(dir) < 0.014) return false;
  if (toRiver(dir) < 0.024) return false;
  return true;
}

export const riverDistance = toRiver;
export const trackDistance = toTrack;
export const anchorOf = (id) => ANCHORS[id];
export { fbm, arc, smoothstep };
