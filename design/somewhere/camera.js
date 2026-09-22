// CAMERA — the hand that holds the world, and the journey into a place.
//
// TWO MODES, AND THEY ARE GENUINELY DIFFERENT THINGS.
//
//   GLOBE   the camera is still, the WORLD turns under your hand. You are
//           holding an object.
//   PLACE   the world is still, the CAMERA has travelled somewhere and is
//           standing in it. You are inside the object.
//
// The flight between them interpolates a full camera TRANSFORM — position and
// orientation — rather than a set of spherical parameters, which is what makes
// it read as travelling rather than as zooming.
//
// WHY THE EARLIER VERSION FELT LIKE A WEBSITE ZOOM. It never moved the camera.
// The camera sat on the +Z axis at every moment of its life and the world was
// spun to bring a landmark in front of it, so "flying to the village" was
// really "rotate the planet, then reduce a distance". Three things follow from
// that and all three were wrong: there was no approach direction, so you always
// arrived from the same side; there was no control of roll, so the horizon
// tilted at random; and the camera looked at the planet's CENTRE, a whole
// radius past the thing it was supposed to be visiting.
//
// So a destination is now authored in WORLD SPACE, as a DestinationAnchor:
//
//   position   where the place actually is, on the terrain
//   look       what the camera should be pointing at
//   approach   which compass direction it comes in from
//   distance   how far back it stops, in world units
//   height     how far above the ground it stops
//
// and the camera is placed from those, with the surface normal as UP — which is
// what finally makes the horizon level.

import * as THREE from 'three';
import { CAM, R, WORLD } from './content.js';
import { heightAt } from './planet.js';
import { onSphere } from './craft.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

/* The easing for a flight. Slow at both ends, quick through the middle, so the
   departure has weight and the arrival settles instead of stopping. */
const flight = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* How far the globe may be tipped. Straight down a pole the drag loses all
   sense of direction, so it stops short. */
const PITCH_LIMIT = 1.30;

/* ══ DESTINATION ANCHORS ═══════════════════════════════════════════════════
   Turn a destination's description into the two world-space transforms the
   flight needs: where the camera ends up, and what it is looking at.

   Everything here is built from the surface frame at the landmark — the normal
   out of the ground, and two tangents lying along it. Authoring in that frame
   rather than in raw xyz is what makes "come in from the south-east, thirty
   degrees up, four units back" a sentence you can actually write. */
const WORLD_UP = new THREE.Vector3(0, 1, 0);

export function destinationAnchor(dest) {
  // Where the place IS. The anchor sits on the real terrain, so it is grounded
  // by construction — if the ground moves, the anchor moves with it.
  const dir = onSphere(dest.lat, dest.lon, 1);
  const ground = heightAt(dir);
  const position = dir.clone().multiplyScalar(ground);

  // The surface frame: normal out, and two tangents across.
  const normal = dir.clone();
  const east = new THREE.Vector3().crossVectors(WORLD_UP, normal).normalize();
  const north = new THREE.Vector3().crossVectors(normal, east).normalize();

  // The approach bearing, measured like a compass around the normal.
  const bearing = THREE.MathUtils.degToRad(dest.approach ?? 0);
  const along = east.clone().multiplyScalar(Math.sin(bearing))
    .addScaledVector(north, Math.cos(bearing)).normalize();

  /* WHAT THE CAMERA LOOKS AT. Not the anchor itself but a point a little above
     it and a little BEYOND it, so the landmark sits in the lower half of the
     frame with sky and landscape behind it. Aiming exactly at a thing puts it
     dead centre, which is how a specimen is photographed, not how a place is. */
  const look = position.clone()
    .addScaledVector(normal, R * (dest.lookUp ?? 0.035))
    .addScaledVector(along, -R * (dest.lookPast ?? 0.03));

  /* WHERE THE CAMERA STANDS. Back along the approach bearing, and up along the
     normal. Both are in units of R so a destination reads the same whether it
     is on the coast or up the mountain. */
  const eye = position.clone()
    .addScaledVector(along, R * dest.distance)
    .addScaledVector(normal, R * dest.height);

  return { dir, ground, position, normal, east, north, along, look, eye };
}

/* The orientation a camera at `eye` looking at `look` should have, with UP
   taken from the SURFACE rather than from the world.

   This is the fix for the tilted horizon. On a sphere there is no global "up"
   that works everywhere — at the coast the world's +Y is halfway to the
   horizon. Using the local normal means level is level wherever you land. */
const _m = new THREE.Matrix4();

function orientationAt(eye, look, up) {
  _m.lookAt(eye, look, up);
  return new THREE.Quaternion().setFromRotationMatrix(_m);
}

export function createCamera(aspect) {
  const camera = new THREE.PerspectiveCamera(CAM.fov, aspect, CAM.near, CAM.far);

  /* ── GLOBE STATE ──────────────────────────────────────────────────────── */
  const now = {
    yaw: CAM.landing.yaw ?? 0.72,
    pitch: CAM.landing.pitch ?? 0.5,
    dist: CAM.landing.dist,
  };
  const goal = { ...now };
  const pan = { now: CAM.landing.pan ?? 0, goal: CAM.landing.pan ?? 0 };

  /* Angular velocity, in radians per second. Per SECOND, not per frame — a
     per-frame velocity means the world spins twice as fast on a 120Hz screen,
     and makes the cap below meaningless. */
  const vel = { yaw: 0, pitch: 0 };

  let mode = 'globe';        // 'globe' | 'flying' | 'place'
  let trip = null;
  let idle = true;

  /* ── PLACE-MODE LOOK ─────────────────────────────────────────────────────
     The flight decides the EYE; this decides which way it faces once there.
     `placeFrame` is the fixed basis set the moment a flight arrives — the eye
     itself, the TRUE surface normal as up, the arrival gaze split into its
     horizontal direction and its pitch off the horizon, and the per-arrival
     pitch range that is guaranteed to contain that arrival pitch — and
     `look` is the yaw/pitch the visitor has since dragged in, measured
     against that same horizon. Rebuilding the orientation from this basis
     every frame (rather than nudging the quaternion directly) is what keeps
     the horizon level through an arbitrary amount of looking around: `up`
     never drifts, because it is never derived from anything that changed.

     `yaw`/`pitch` are the EASED values the camera actually renders;
     `goalYaw`/`goalPitch` are what the drag is asking for, already clamped.
     Chasing the goal with damping (rather than setting `yaw`/`pitch`
     directly) is what makes a flick settle instead of snapping, and
     clamping the goal rather than the eased value is what guarantees the
     eased value can never overshoot the limit while catching up. */
  let placeFrame = null;
  const look = { yaw: 0, pitch: 0, goalYaw: 0, goalPitch: 0 };

  const world = new THREE.Group();

  /* The camera's own transform. In globe mode these are derived every frame
     from the spherical state above; in place mode they are held at whatever the
     flight arrived on. Keeping them as first-class state is what lets the two
     modes be interpolated against each other at all. */
  const eye = new THREE.Vector3(0, 0, CAM.landing.dist);
  const quat = new THREE.Quaternion();

  /* ── DRAG ─────────────────────────────────────────────────────────────────
     DIRECT WHILE HELD, MOMENTUM AFTER RELEASE. That split is what makes this
     feel like a globe rather than like a control with lag.

     While the pointer is down the rotation is applied STRAIGHT to the goal, so
     the world turns with the hand and the spot under the finger stays under the
     finger. An earlier version only ever fed a velocity, which meant a drag
     moved the world about two degrees and the other thirty-five arrived after
     you let go — technically momentum, but it felt like pushing a heavy object
     through treacle and then having it slide away on its own.

     The velocity is measured alongside, as an instantaneous estimate, purely so
     there is something to coast on at release. It is SET rather than
     accumulated: a throw is how fast you were going at the end, not the sum of
     everything you did on the way there.

     BOTH ENDS ARE CLAMPED. `maxDragStep` caps what one frame's movement may
     contribute, so a single coalesced 600-pixel sample cannot dominate;
     `maxSpin` caps the resulting speed, so no sequence of samples can either.
     Measured: a 600px-per-frame flick now produces slightly LESS total rotation
     than a firm 90px one, which is exactly the ceiling working. */
  let holding = false;

  function drag(dx, dy, dt = 16.67) {
    if (mode !== 'globe' && mode !== 'place') return;
    holding = true;
    idle = false;

    const cx = clamp(dx, -CAM.maxDragStep, CAM.maxDragStep);
    const cy = clamp(dy, -CAM.maxDragStep, CAM.maxDragStep);

    /* PLACE — turn the head, not the world. The GOAL moves straight with the
       hand, same as a globe drag; `update` is what eases the rendered
       yaw/pitch towards it, so the look settles instead of snapping. Yaw is
       left to wrap freely (it is a full 360° pan); pitch is clamped to this
       arrival's own range — tight around the horizon, but never tighter than
       the arrival shot itself, so a look-around can never un-arrive. */
    if (mode === 'place') {
      if (placeFrame) {
        look.goalYaw -= cx * CAM.lookSensitivity;
        look.goalPitch = clamp(
          look.goalPitch - cy * CAM.lookSensitivity * 0.62,
          placeFrame.pitchLower, placeFrame.pitchUpper,
        );
      }
      return;
    }

    // DIRECT — the world moves now, with the hand.
    goal.yaw += cx * CAM.sensitivity;
    goal.pitch = clamp(goal.pitch + cy * CAM.sensitivity * 0.62, -PITCH_LIMIT, PITCH_LIMIT);

    /* THE BACKLOG CLAMP, and it is the piece that finally bounds everything.

       `goal` is where the world is being asked to get to; `now` is where it has
       actually reached, chasing it under damping. Nothing above stops the gap
       between them growing without limit — and a twelve-sample flick was
       opening a gap of two hundred and sixty degrees, every one of which then
       arrived AFTER the release as an enormous "coast". The velocity cap could
       not help: the spin was not velocity, it was accumulated debt.

       Holding the goal within a fixed angle of the world means the debt can
       never exceed one clamp's worth, so letting go mid-flick releases a known,
       small amount of catch-up instead of a quarter of a turn. */
    goal.yaw = clamp(goal.yaw, now.yaw - CAM.maxLag, now.yaw + CAM.maxLag);

    // ...and the speed we are travelling at, for the throw.
    const secs = clamp(dt, 6, 64) / 1000;
    const vy = clamp((cx * CAM.sensitivity) / secs, -CAM.maxSpin, CAM.maxSpin);
    const vp = clamp((cy * CAM.sensitivity * 0.62) / secs, -CAM.maxSpin * 0.6, CAM.maxSpin * 0.6);

    // Lightly smoothed, so one jittery sample does not decide the whole throw.
    vel.yaw = vel.yaw * 0.35 + vy * 0.65;
    vel.pitch = vel.pitch * 0.35 + vp * 0.65;
  }

  function release() {
    holding = false;
    idle = true;
  }

  /* ── THE FLIGHT ───────────────────────────────────────────────────────────
     Interpolates the camera's POSITION and ORIENTATION from wherever it is to
     wherever the destination anchor says it should be. The world stops turning
     for the duration — you are travelling, it is not.

     The position is eased along a curve that bulges outward, so the camera
     arcs over the landscape instead of tunnelling through it in a straight
     line. On a sphere a straight line between two surface points goes
     underground, which is exactly what "the camera stopped inside the terrain"
     looked like. */
  function flyTo(dest, { duration = CAM.flyDuration, onArrive } = {}) {
    const a = destinationAnchor(dest);

    /* INTO WORLD SPACE. The anchor is built in the planet's OWN coordinates —
       latitude and longitude on an unrotated sphere — but the camera lives in
       the scene, and the planet has whatever rotation the visitor last left it
       at. Placing the camera at the raw anchor ignores that rotation entirely,
       which is how clicking FOREST parked the camera over open ocean with the
       forest somewhere off the right of frame.

       So the whole frame is carried through the world's current transform:
       the two points by the full matrix, the two directions by the rotation
       alone. The rotation is then frozen for the visit, so the place stays put
       while you are standing in it. */
    world.updateMatrixWorld(true);
    const M = world.matrixWorld;
    const Q = world.quaternion;

    const eyeTo = a.eye.clone().applyMatrix4(M);
    const lookTo = a.look.clone().applyMatrix4(M);
    const upTo = a.normal.clone().applyQuaternion(Q).normalize();

    const to = {
      eye: eyeTo,
      quat: orientationAt(eyeTo, lookTo, upTo),
    };

    // The midpoint of the arc: halfway between, pushed out away from the planet
    // so the path clears the ground it is crossing. A straight line between two
    // points on a sphere goes underground, which is what "the camera stopped
    // inside the terrain" looked like.
    const mid = eye.clone().add(eyeTo).multiplyScalar(0.5);
    const lift = Math.max(R * 0.35, mid.length() * 0.10);
    mid.setLength(Math.max(mid.length(), a.ground) + lift);

    start(to, mid, duration, () => {
      mode = 'place';
      /* The look-around frame, built to stand on the ground directly under
         THE CAMERA — not on the landmark's own surface normal. The two are
         not the same thing: a destination stands `distance` * R back and
         `height` * R up from the landmark it is framing (the coast shot in
         particular sits more than a radius out over open water), and on a
         ten-unit planet that tangential offset is itself tens of degrees.
         Yawing about the LANDMARK's normal was the original bug's tilted
         axis all over again, just measured from a point the camera is not
         actually standing on.

         So `up` is the EYE's own radial direction — `a.eye` is a point in
         the planet's local (unrotated) space, and the planet is centred on
         the origin in that space (nothing here ever moves or scales the
         `world` group, only rotates it), so `normalize(a.eye)` IS that
         direction; `Q` carries it into world space exactly like `upTo`
         above. */
      const eyeDist = a.eye.length();
      const dirEyeLocal = a.eye.clone().normalize();
      const up = dirEyeLocal.clone().applyQuaternion(Q).normalize();

      /* THE HORIZON DIPS. Standing `eyeDist` from the planet's centre above
         ground of radius `groundAtEye`, the horizon is not level — it falls
         below the tangent plane by `dip = acos(groundAtEye / eyeDist)`. On a
         planet this small and from up here that is not a rounding error: a
         person standing at the mountain's height looks perceptibly DOWN to
         see the edge of the world. `heightAt` is asked in the SAME local
         space `a.eye` is in, and clamped up to the waterline — the coast
         destination stands out over open water, and what a visitor sees as
         "the ground" out there is the sea SURFACE, not the (lower) sea bed
         `heightAt` returns underwater. */
      const groundAtEye = Math.max(heightAt(dirEyeLocal), WORLD.ocean);
      const dip = Math.acos(clamp(groundAtEye / eyeDist, -1, 1));

      /* The arrival gaze (`forward0`, read off `to.quat` so this is exactly
         the frame the visitor sees land, floating-point noise and all) is
         split against this true horizon: `horiz0` is its component IN the
         tangent plane at the eye — the direction yaw turns around — and
         `pitch0` is how far off THAT horizon it already sits. `right0` is
         derived the same way the yaw/pitch rebuild uses it every frame
         (`horiz0 × up`); the reconstruction at yaw 0 / pitch `pitch0`
         reproduces `forward0` exactly regardless of which `up` it is taken
         against (see the proof in `update`'s place branch) — but its ROLL
         generally will not match `to.quat`'s, since that was built against
         the landmark's normal, not this one. `rollFrom`/`rollT` below are
         what eases that one discrepancy out instead of snapping it.

         `pitchLower`/`pitchUpper` are this arrival's own look range: a
         window either side of the horizon's own dip, widened just enough to
         contain `pitch0` with a little margin, so the very first drag can
         never ask for a pitch narrower than where the camera already is. */
      const forward0 = new THREE.Vector3(0, 0, -1).applyQuaternion(to.quat);
      const dotFU = clamp(forward0.dot(up), -1, 1);
      const horiz0 = forward0.clone().addScaledVector(up, -dotFU);
      // Straight up/down (never happens with these destinations, but the
      // fallback keeps a normalize() from ever dividing by zero): the
      // approach bearing, carried into world space the same way `up` was.
      if (horiz0.lengthSq() < 1e-10) horiz0.copy(a.along).applyQuaternion(Q);
      horiz0.normalize();
      const pitch0 = Math.asin(dotFU);
      const right0 = new THREE.Vector3().crossVectors(horiz0, up).normalize();

      placeFrame = {
        eye: to.eye.clone(),
        up,
        horiz0,
        right0,
        pitch0,
        dip,
        pitchLower: Math.min(-dip - CAM.lookPitchWindow, pitch0 - CAM.lookPitchMargin),
        pitchUpper: Math.max(-dip + CAM.lookPitchWindow, pitch0 + CAM.lookPitchMargin),
        // The roll-settle: exactly what the flight left on screen, eased
        // towards the standing frame above over `CAM.lookRollSettle` ms.
        rollFrom: to.quat.clone(),
        rollT: 0,
      };
      look.yaw = 0;
      look.goalYaw = 0;
      look.pitch = pitch0;
      look.goalPitch = pitch0;
      onArrive?.();
    });
  }

  /* Back out to the whole planet. The globe keeps the yaw it had, so returning
     puts the world back the way the visitor left it rather than undoing their
     rotation for them. */
  function backToWorld({ duration = CAM.backDuration, onArrive } = {}) {
    placeFrame = null;
    pan.goal = CAM.landing.pan ?? 0;
    goal.pitch = CAM.landing.pitch;
    goal.dist = CAM.landing.dist;
    now.pitch = goal.pitch;
    now.dist = goal.dist;

    const home = globeEye(now, pan.goal);
    const to = { eye: home.eye, quat: home.quat };

    const mid = eye.clone().add(to.eye).multiplyScalar(0.5);
    mid.setLength(Math.max(mid.length(), R * 1.5) + R * 0.5);

    start(to, mid, duration, () => {
      mode = 'globe';
      vel.yaw = vel.pitch = 0;
      onArrive?.();
    });
  }

  function start(to, mid, duration, done) {
    mode = 'flying';
    trip = {
      from: { eye: eye.clone(), quat: quat.clone() },
      to,
      mid,
      t: 0,
      duration,
      done,
    };
    vel.yaw = vel.pitch = 0;
  }

  /* Where the camera sits in globe mode, for a given spherical state. Returned
     rather than applied, because `backToWorld` needs to know the answer before
     it starts moving towards it. */
  const _look = new THREE.Vector3();

  // Scratch for the place-mode look-around, reused every frame.
  const _pq = new THREE.Quaternion();
  const _pf = new THREE.Vector3();
  const _pr = new THREE.Vector3();
  const _sysQuat = new THREE.Quaternion();

  // A smooth 0..1 ease, for the roll-settle blend below — cheap, and the
  // same shape as the flight's own easing at each end.
  const smoothstep01 = (t) => t * t * (3 - 2 * t);

  function globeEye(state, panFrac, pointer) {
    const halfW = state.dist * Math.tan((CAM.fov * Math.PI / 180) / 2) * camera.aspect;
    const shift = panFrac * halfW;
    const px = pointer?.has ? pointer.sx : 0;
    const py = pointer?.has ? pointer.sy : 0;

    const e = new THREE.Vector3(shift + px * R * 0.07, py * R * 0.04, state.dist);
    _look.set(shift, 0, 0);
    return { eye: e, quat: orientationAt(e, _look, WORLD_UP) };
  }

  /* ── THE FRAME ─────────────────────────────────────────────────────────── */
  const _a = new THREE.Vector3();
  const _b = new THREE.Vector3();

  function update(dt, pointer) {
    const secs = Math.min(dt, 50) / 1000;

    if (mode === 'flying' && trip) {
      trip.t = Math.min(1, trip.t + dt / trip.duration);
      const k = flight(trip.t);

      // Quadratic Bezier through the lifted midpoint — the arc over the world.
      const u = 1 - k;
      _a.copy(trip.from.eye).multiplyScalar(u * u);
      _b.copy(trip.mid).multiplyScalar(2 * u * k);
      eye.copy(_a).add(_b).addScaledVector(trip.to.eye, k * k);

      quat.slerpQuaternions(trip.from.quat, trip.to.quat, k);

      if (trip.t >= 1) { const d = trip.done; trip = null; d?.(); }
    } else if (mode === 'globe') {
      /* INERTIA, in real time. The decay is expressed per second and raised to
         the elapsed seconds, so the world settles in the same wall-clock time
         on every machine. `CAM.inertia` is the fraction of speed KEPT after one
         second — deliberately small, so a flick coasts briefly and stops
         instead of spinning on for the best part of a minute. */
      if (holding) {
        // The hand is on it. `drag` has already moved the goal directly, so
        // integrating the velocity here as well would double every gesture.
        vel.yaw *= 0.90;
        vel.pitch *= 0.90;
      } else {
        const decay = Math.pow(CAM.inertia, secs);
        vel.yaw *= decay;
        vel.pitch *= decay;
        // A generous floor. The exponential tail is imperceptible long before
        // it reaches zero, and letting it run to 1e-4 kept the world creeping
        // for the better part of three seconds after every flick.
        if (Math.abs(vel.yaw) < 0.012) vel.yaw = 0;
        if (Math.abs(vel.pitch) < 0.012) vel.pitch = 0;

        goal.yaw += vel.yaw * secs;
        goal.pitch = clamp(goal.pitch + vel.pitch * secs, -PITCH_LIMIT, PITCH_LIMIT);
      }

      // The idle drift: the world keeps turning very slowly on its own, so it
      // is never a still photograph. Suppressed while a hand is on it and while
      // there is real inertia left, so it never fights the visitor.
      if (idle && !holding && vel.yaw === 0) goal.yaw += CAM.spin * secs;

      const k = 1 - Math.pow(1 - CAM.damp, dt / 16.67);
      now.yaw = lerp(now.yaw, goal.yaw, k);
      now.pitch = lerp(now.pitch, goal.pitch, k);
      now.dist = lerp(now.dist, goal.dist, k);
      // Close enough is stopped. An asymptote never actually arrives, and
      // without this the world kept creeping imperceptibly for ten seconds
      // after everything else had settled.
      if (Math.abs(goal.yaw - now.yaw) < 1e-4) now.yaw = goal.yaw;
      if (Math.abs(goal.pitch - now.pitch) < 1e-4) now.pitch = goal.pitch;
      pan.now = lerp(pan.now, pan.goal, 1 - Math.pow(1 - CAM.damp * 0.55, dt / 16.67));

      const g = globeEye(now, pan.now, pointer);
      eye.copy(g.eye);
      quat.copy(g.quat);
    } else if (mode === 'place' && placeFrame) {
      /* THE LOOK-AROUND. Position never moves — `eye` is copied straight from
         the frame the flight arrived on. The rendered `look.yaw`/`look.pitch`
         EASE toward whatever `drag` last set as the goal, frame-rate
         independent exactly like the globe's own damping above — a flick
         settles instead of snapping, and because the GOAL is what gets
         clamped (in `drag`), the eased value can never overshoot the limit
         while it is still catching up.

         The facing direction is then rebuilt from scratch every frame,
         rather than integrated onto the live quaternion: yaw turns
         `horiz0` — the arrival gaze's own horizontal direction — about the
         fixed surface normal; pitch then tilts that yawed direction up or
         down from the horizon, about whatever axis is "right" once the yaw
         has been applied. Rebuilding rather than integrating is what keeps
         ten minutes of dragging accumulating exactly as much drift as
         zero — none, since `look.yaw`/`look.pitch` are the only state and
         `up` is never touched at all.

         At yaw 0 / pitch `pitch0` (arrival, before any drag) this reproduces
         `forward0` exactly, whichever `up` the frame is built against —
         `horiz0` and `right0` are `forward0`'s own decomposition against
         that axis, so rotating `horiz0` back up by `pitch0` about `right0`
         retraces the same path in reverse. What it does NOT reproduce is
         `to.quat`'s own ROLL, because `to.quat` was built against the
         landmark's normal and `placeFrame.up` is the eye's own — see the
         roll-settle just below. */
      const k = 1 - Math.pow(1 - CAM.lookDamp, dt / 16.67);
      look.yaw = lerp(look.yaw, look.goalYaw, k);
      look.pitch = lerp(look.pitch, look.goalPitch, k);
      if (Math.abs(look.goalYaw - look.yaw) < 1e-5) look.yaw = look.goalYaw;
      if (Math.abs(look.goalPitch - look.pitch) < 1e-5) look.pitch = look.goalPitch;

      _pq.setFromAxisAngle(placeFrame.up, look.yaw);
      _pf.copy(placeFrame.horiz0).applyQuaternion(_pq);
      _pr.copy(placeFrame.right0).applyQuaternion(_pq);
      _pq.setFromAxisAngle(_pr, look.pitch);
      _pf.applyQuaternion(_pq);

      eye.copy(placeFrame.eye);
      _look.copy(eye).add(_pf);
      _sysQuat.copy(orientationAt(eye, _look, placeFrame.up));

      /* THE ROLL-SETTLE. `_sysQuat` is what standing here, looking this way,
         actually looks like — level against the eye's own horizon. But the
         very first place-mode frame has to be indistinguishable from the
         flight's last one (`placeFrame.rollFrom`), or arriving is a cut, not
         a landing. So for `CAM.lookRollSettle` ms the rendered orientation
         is SLERPED from that exact arrival frame to `_sysQuat` — nothing
         else about the shot moves, so it reads as the horizon settling
         under your feet, not as the view jumping. Once `rollT` reaches 1 the
         blend is indistinguishable from `_sysQuat` and is skipped outright. */
      if (placeFrame.rollT < 1) {
        placeFrame.rollT = Math.min(1, placeFrame.rollT + dt / CAM.lookRollSettle);
        quat.slerpQuaternions(placeFrame.rollFrom, _sysQuat, smoothstep01(placeFrame.rollT));
      } else {
        quat.copy(_sysQuat);
      }
    }

    /* The world's rotation is ONLY driven in globe mode. In a place it is
       frozen, which is what makes the destination a fixed piece of scenery you
       have travelled to rather than something still turning under you. */
    if (mode === 'globe') world.rotation.set(now.pitch, now.yaw, 0, 'XYZ');

    camera.position.copy(eye);
    camera.quaternion.copy(quat);
  }

  function resize(aspect) {
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  }

  return {
    camera,
    world,
    drag,
    release,
    flyTo,
    backToWorld,
    update,
    resize,
    get mode() { return mode; },
    get yaw() { return now.yaw; },

    /* Where a world-space point lands on screen, in NDC. The landmark tags
       follow their anchors with this every frame. */
    project(v, out = new THREE.Vector3()) {
      out.copy(v).applyMatrix4(world.matrixWorld).project(camera);
      return out;
    },
  };
}
