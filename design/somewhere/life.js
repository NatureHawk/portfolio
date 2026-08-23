// LIFE — the things that move on their own.
//
// A train going round, a boat crossing, clouds drifting, water breathing, and
// the folk shifting their weight. This is the file that decides whether the
// world is a model or a place, and it is governed by one rule:
//
//   NOT EVERYTHING AT ONCE.
//
// Every loop here runs at a different speed and none of them are in phase, so
// there is always something moving and never everything moving. A diorama where
// all fourteen animations tick together reads as a machine; one where the train
// passes, and a while later the boat comes back, reads as somewhere with things
// going on in it. The periods below are deliberately not round multiples of
// each other for exactly that reason.
//
// EVERYTHING IS DRIVEN BY ONE CLOCK. `update(dt)` is called once per frame from
// site.js, which is on the design section's single shared timer. Nothing in
// here owns a requestAnimationFrame or a setInterval, so when the world is
// hidden it all stops for free.

import * as THREE from 'three';
import { R, WORLD } from './content.js';
import { heightAt, railPoint, railHeight, anchorOf } from './planet.js';
import { standOn, headingTo } from './craft.js';
import { RAIL_TOP } from './builds.js';

const DEG = 180 / Math.PI;
const latOf = (d) => Math.asin(Math.min(1, Math.max(-1, d.y))) * DEG;
const lonOf = (d) => Math.atan2(d.z, d.x) * DEG;
const UP = new THREE.Vector3(0, 1, 0);

/* Put an object on the surface at a point, facing along the direction it is
   travelling. Used by everything that moves along a path.

   `ahead` is what makes it face the right way: the tangent is derived from
   where the thing is going next rather than from a stored heading, so a vehicle
   is always square to its own track no matter how the track is shaped. */
function ride(obj, at, ahead, height, { bank = 0 } = {}) {
  standOn(obj, latOf(at), lonOf(at), height);
  obj.rotateY(headingTo(at, ahead));
  if (bank) obj.rotateZ(bank);
  return obj;
}

export function createLife(world, { reduced = false } = {}) {
  /* Every loop's phase, in seconds. Started at scattered values rather than at
     zero so the world is already mid-motion on the first frame — a diorama
     where everything begins from its start position announces that it just
     loaded. */
  const t = { train: 3.1, boat: 0.7, cloud: 11.4, water: 0, folk: 2.2, lamp: 0 };

  /* The periods. Chosen to be mutually awkward: 74, 53 and 96 seconds share no
     useful factor, so the train, the boat and the clouds will not line up again
     for over an hour. */
  const TRAIN_PERIOD = 74;
  const BOAT_PERIOD = 53;

  const { train, boat, clouds, waterfall, folk, sea } = world;

  /* ── THE TRAIN ───────────────────────────────────────────────────────────
     Loco plus carriages, each a fixed distance behind the one in front, all
     riding the same circle. Spacing them by track parameter rather than by
     world distance is what keeps the couplings even as it goes over hills. */
  const CAR_GAP = 0.0115;

  /* THE ONE RULE: the train's position is SAMPLED FROM THE CURVE. It never
     integrates its own x/y/z, never reads the terrain, and never keeps a
     heading of its own — position comes from `railPoint`, height comes from
     `railHeight`, and the facing comes from the tangent between this sample and
     the next one. There is no state that can drift, because there is no state.

     That is the whole fix for the train wandering off into the sea. The old
     version asked the TERRAIN how high it was, which is a different question
     from how high the RAILS are, and the two disagreed by however much the
     embankment was carrying. */
  const _at = new THREE.Vector3();
  const _ah = new THREE.Vector3();

  function updateTrain() {
    const u = (t.train / TRAIN_PERIOD) % 1;
    const put = (obj, offset) => {
      const p = ((u - offset) % 1 + 1) % 1;
      railPoint(p, _at);
      railPoint(p + 0.0018, _ah);
      /* `RAIL_TOP` and not a local guess: builds.js models every vehicle with
         y = 0 at the railhead, so riding at exactly the railhead is what puts
         the wheel treads on the rail. The two numbers used to live in two
         files and disagreed by a millimetre. */
      ride(obj, _at, _ah, railHeight(p) + RAIL_TOP);
    };
    put(train.loco, 0);
    train.cars.forEach((car, i) => put(car, CAR_GAP * (i + 1)));
  }

  /* ── THE BOAT ────────────────────────────────────────────────────────────
     Out from the harbour and back, on a slow there-and-back rather than a
     circuit: a sailing boat that laps the planet is a submarine.

     It rides the sea shell, not the land, and it heels a little into the turn
     at each end, which is the whole difference between a boat and a bath toy. */
  const harbour = anchorOf('coast');
  const away = new THREE.Vector3().crossVectors(UP, harbour).normalize();

  function boatPoint(p) {
    // p in 0..1; a smooth out-and-back via a cosine, so it eases at both ends
    // instead of stopping dead and reversing.
    const s = (1 - Math.cos(p * Math.PI * 2)) * 0.5;
    return harbour.clone()
      .addScaledVector(away, 0.30 * s + 0.06)
      .addScaledVector(UP, -0.10 * s)
      .normalize();
  }

  function updateBoat() {
    const u = (t.boat / BOAT_PERIOD) % 1;
    const at = boatPoint(u);
    const ahead = boatPoint(u + 0.004);
    // Bob and heel, both tied to the water's own rhythm rather than the boat's,
    // so it looks like the sea is moving the boat and not the other way round.
    /* RIDE THE WATERLINE, NOT THE SURFACE. Hulls in builds.js are modelled
       with y = 0 on their own waterline, so the sea shell's radius IS the
       right height — the water then cuts the hull exactly where the builder
       drew it. The old `+ 0.10` sat the whole boat a tenth of a unit clear of
       the sea, which is what made it read as a bath toy on a blue floor. */
    const bob = Math.sin(t.water * 1.1) * 0.012;
    ride(boat, at, ahead, WORLD.ocean + bob, { bank: Math.sin(u * Math.PI * 2) * 0.10 });
    boat.rotateX(Math.sin(t.water * 0.9 + 1) * 0.035);
  }

  /* ── CLOUDS ──────────────────────────────────────────────────────────────
     Each drifts around the world on its own axis at its own rate, and swings
     very slightly on its thread. The swing is the detail that sells the string:
     a cloud that translates without pivoting is not hanging from anything. */
  function updateClouds(dt) {
    clouds.children.forEach((c, i) => {
      const speed = c.userData.drift ?? 0.03;
      c.rotateOnWorldAxis(UP, speed * dt * 0.00006);
      const sway = Math.sin(t.cloud * 0.35 + i * 1.7) * 0.022;
      c.rotation.z = sway;
    });
  }

  /* ── WATER ───────────────────────────────────────────────────────────────
     The sea's embroidered waves slide, very slowly, and the whole shell
     breathes by a fraction of a percent. Both are texture and scale rather than
     vertex work — the ocean is 12,000 vertices and re-uploading them every
     frame to make a ripple would be the most expensive thing in the world. */
  const seaSurface = sea?.getObjectByName('sea-surface');
  /* The sea's own clock. The swell is stitched procedurally now rather than
     printed on a texture, so it advances by feeding the shader a time rather
     than by sliding a UV offset — which also means the waves bend and travel
     instead of the whole pattern marching sideways as one sheet. */
  const seaTime = seaSurface?.material?.userData?.sea?.uSeaTime;

  function updateWater() {
    if (seaTime) seaTime.value = t.water;
    if (seaSurface) {
      const breath = 1 + Math.sin(t.water * 0.5) * 0.0016;
      seaSurface.scale.setScalar(breath);
    }
    // The waterfall's foam pulses on the same clock as the sea, so the whole
    // world's water shares one rhythm.
    if (waterfall) {
      const p = 1 + Math.sin(t.water * 2.3) * 0.03;
      waterfall.scale.y = p;
    }
  }

  /* ── THE FOLK ────────────────────────────────────────────────────────────
     They do not walk. They shift: a slow rock from foot to foot, each on its
     own phase, which at the size these are seen at is indistinguishable from
     idling and costs one matrix write each instead of a path solver.

     Written straight into the InstancedMesh's matrix buffer, so twenty-two
     characters moving independently is still one draw call. */
  const folkMesh = folk?.group?.children ?? [];
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3();
  const _axis = new THREE.Vector3();

  // The rest pose of every instance, captured once so the sway is always
  // applied to the original rather than compounding frame on frame.
  const folkRest = folkMesh.map((mesh) => {
    const out = [];
    for (let i = 0; i < mesh.count; i++) {
      const m = new THREE.Matrix4();
      mesh.getMatrixAt(i, m);
      out.push(m);
    }
    return out;
  });

  function updateFolk() {
    folkMesh.forEach((mesh, mi) => {
      const rest = folkRest[mi];
      for (let i = 0; i < mesh.count; i++) {
        _m.copy(rest[i]);
        _m.decompose(_p, _q, _s);
        // Rock about the character's own up-axis-perpendicular — a lean, not a
        // spin. The phase is per-instance so nobody is in time with anybody.
        const a = Math.sin(t.folk * 1.15 + i * 2.4) * 0.055;
        _axis.copy(_p).normalize();
        const side = new THREE.Vector3().crossVectors(_axis, UP).normalize();
        if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
        _q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a));
        _m.compose(_p, _q, _s);
        mesh.setMatrixAt(i, _m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    });
  }

  let folkTick = 0;

  return {
    /* One call per frame. `dt` is milliseconds. */
    update(dt) {
      const s = dt / 1000;
      t.water += s;
      t.cloud += s;

      if (reduced) {
        // Reduced motion: the world still exists and the water still shifts a
        // hair, but nothing travels. A train crossing the screen is exactly the
        // kind of motion the preference is asking us not to make.
        updateWater();
        return;
      }

      t.train += s;
      t.boat += s;
      t.folk += s;

      updateTrain();
      updateBoat();
      updateClouds(dt);
      updateWater();

      // The folk are the most expensive loop and the least visible, so they run
      // at a third of the framerate. Nobody can tell.
      if ((folkTick = (folkTick + 1) % 3) === 0) updateFolk();
    },

    /* Jump every loop forward, used when the world is entered so it does not
       begin from a standing start. */
    warm(seconds = 12) {
      t.train += seconds; t.boat += seconds * 0.6; t.cloud += seconds;
      updateTrain(); updateBoat(); updateWater();
    },
  };
}
