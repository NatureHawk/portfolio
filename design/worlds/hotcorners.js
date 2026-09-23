// HOT CORNERS — velocity, not position.
//
// The corner controls already respond to distance (nav.js: get close enough
// and a corner wakes; click it and you travel). This adds a second way in,
// for the hand that already knows where it is going: THROW the cursor at a
// corner — fast, deliberate, aimed — and that corner's world opens on its
// own. Click remains the reliable fallback and nothing here changes how it
// works; a click is still one `onEnter` call away, untouched.
//
// WHAT MAKES A THROW, AND NOT AN ACCIDENT. Four things have to agree, all at
// once, or nothing happens:
//   proximity   the cursor is actually near the corner (a resolution-aware
//               radius — the same radius reads the same on a laptop and a
//               32" monitor because it is derived from the viewport diagonal)
//   speed       recent speed is above a threshold, ALSO derived from the
//               diagonal, in viewport-diagonals/second — a "fast flick" feels
//               the same gesture at 1366×768 and 2560×1440
//   aim         the throw's own displacement points at the corner (a
//               normalised dot product against the vector from where the
//               throw started to the corner)
//   quadrant    the throw has a real component on BOTH of the corner's axes —
//               this is what stops a fast flick along the top edge from
//               reading as a throw at the top-left just because it grazes the
//               zone; a pure horizontal or vertical flick never has both.
//
// A short RAW history (position + real event timestamp, not the damped
// pointer.sx/sy nav.js reads for proximity) is the only state kept, pruned to
// ~220ms on every sample. Evaluating "peak speed across that window" rather
// than "speed at the last event" is what survives the cursor arriving pinned
// against the physical edge of the screen — the OS clamps position there and
// the last event or two reads near-zero velocity even though the throw that
// got it there was fast.
//
// THE PEAK IS WINDOWED, NOT PAIRWISE. `getCoalescedEvents` on a high-report-
// rate mouse can hand back samples a millisecond apart — two or three pixels
// of jitter between THOSE reads as several thousand px/s, which is exactly
// the "single noisy event" this whole mechanic exists to reject. So the peak
// is the fastest span of at least `MIN_SPAN` (32ms) anywhere in the window,
// never a single adjacent pair — 32ms of real jitter averages out to nothing,
// while 32ms of an actual throw is still comfortably inside the ~150-250ms a
// deliberate one takes.
//
// ONE MOUSE, ONE GESTURE, ONE TRAVEL. Only `pointerType === 'mouse'` is ever
// looked at — pen and touch keep exactly the interaction they have today.
// After a trigger, every corner is locked for one crossing's worth of time
// and the corner that fired stays disarmed until the cursor is measurably
// outside its zone again, so a hand that overshoots or jitters after landing
// cannot fire the same corner twice.

import { clamp } from '../motion.js';
import { CORNERS } from './corners.js';

const WINDOW_MS = 220;        // how much raw history is kept
const MIN_SAMPLES = 3;        // a single noisy event can never be a throw
const MIN_DURATION = 40;      // ms — same reason
const MIN_SPAN = 32;          // ms — the shortest span the peak is ever measured over
const LOCK_MS = 950;          // longer than the ~640ms crossing, on purpose
/* px — how close "on the corner" is, for a corner with one of the world's own
   controls sitting in its zone. Wide enough that throwing AT the corner still
   feels like a throw rather than threading a needle, and still far inside the
   nearest such control (SOMEWHERE's back button sits 72px out, HUM's top-right
   button 105px), so reaching for one of those never opens a world. */
const PINNED = 48;
const INTERACTIVE = 'button, a[href], input, select, textarea, [role="button"]';

const ZONE_MIN = 140;         // px
const ZONE_MAX = 260;         // px
const ZONE_FRACTION = 0.12;   // × viewport diagonal

// viewport-diagonals / second, the trigger floor. 0.85 puts the effective bar
// (see `measure`) at ~1330/1870/2500 px/s at 1366×768/1920×1080/2560×1440 —
// clearly above ordinary brisk mousing and inside the "deliberate throw" band
// a flick actually reaches, while still scaling with the screen so the same
// gesture is what is asked for on a laptop and a 32" monitor.
const SPEED_DIAGONALS = 0.85;
const AXIS_MIN = 20;          // px a throw must move on EACH of the corner's axes
const DOT_TRIGGER = 0.84;     // ≈ cos(33°) — how tightly the throw must aim
const DOT_CHARGE = 0.5;       // looser aim still feeds the stage-2 glow

/* THE PURE METRIC, exported so it can be exercised directly with synthetic
   history arrays (see the test harness) rather than only through real pointer
   events — CDP-simulated mouse timing is too noisy in a headless browser to
   calibrate the speed floor against. Takes the same `{ x, y, t }[]` shape
   `pushSample` builds, already time-pruned to the window it should evaluate;
   returns the numbers every corner check needs, or `null` when there is not
   yet enough of a gesture to say anything about it. */
export function measure(history, { minDuration = MIN_DURATION, minSpan = MIN_SPAN } = {}) {
  if (history.length < MIN_SAMPLES) return null;
  const first = history[0];
  const last = history[history.length - 1];
  const duration = last.t - first.t;
  if (duration < minDuration) return null;
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 4) return null;

  const avgSpeed = (dist / duration) * 1000;

  // Windowed peak: for every sample j, pair it with the MOST RECENT earlier
  // sample k such that j and k are at least `minSpan` apart, and take the
  // fastest such pair across the whole history. `k` only ever advances as `j`
  // does, so this is a single O(n) sweep, not the O(n²) every-pair search the
  // definition ("any span ≥ minSpan") would naively suggest.
  let peak = 0;
  let k = 0;
  for (let j = 1; j < history.length; j += 1) {
    while (k + 1 <= j && history[j].t - history[k + 1].t >= minSpan) k += 1;
    const span = history[j].t - history[k].t;
    if (span < minSpan) continue;
    const d = Math.hypot(history[j].x - history[k].x, history[j].y - history[k].y);
    const s = (d / span) * 1000;
    if (s > peak) peak = s;
  }

  // No extra discount on `peak` here: unlike a raw adjacent-pair reading, a
  // span of at least `minSpan` is already jitter-resistant on its own.
  return { first, last, dx, dy, dist, speed: Math.max(avgSpeed, peak) };
}

export function createHotCorners({ controls, node, getCurrent, onEnter, onApproach }) {
  let history = [];
  let locked = false;
  let lockTimer = null;
  const disarmed = new Set();     // corners that must be left before re-arming
  const chargeWritten = new Map();

  const diag = () => Math.hypot(window.innerWidth, window.innerHeight);
  const radiusFor = () => clamp(diag() * ZONE_FRACTION, ZONE_MIN, ZONE_MAX);
  const speedFloor = () => diag() * SPEED_DIAGONALS;
  const cornerPoint = (cid) => ({ x: CORNERS[cid].x * window.innerWidth, y: CORNERS[cid].y * window.innerHeight });

  const writeCharge = (control, value) => {
    const rounded = Math.round(value * 100) / 100;
    if (chargeWritten.get(control) === rounded) return;
    chargeWritten.set(control, rounded);
    control.button.style.setProperty('--charge', String(rounded));
  };
  const clearCharge = () => { for (const control of controls) writeCharge(control, 0); };

  const pushSample = (x, y, t) => {
    history.push({ x, y, t });
    while (history.length && t - history[0].t > WINDOW_MS) history.shift();
  };

  /* Re-arms every corner the cursor is no longer measurably inside — checked
     on every sample so a corner that just fired comes back the moment the
     hand has genuinely left it, not on a timer. */
  const rearm = (x, y) => {
    if (!disarmed.size) return;
    const r = radiusFor();
    for (const cid of [...disarmed]) {
      const p = cornerPoint(cid);
      if (Math.hypot(x - p.x, y - p.y) > r) disarmed.delete(cid);
    }
  };

  /* The window, reduced to the numbers every corner check needs — a thin
     wrapper so the instance's own history array feeds the pure, testable
     `measure` above. */
  const metrics = () => measure(history);

  /* Proximity, aim and quadrant intent for one corner, against one window of
     metrics. Speed is checked by the caller — it is the one number every
     corner shares, so there is no reason to compute it four times. */
  function aimAt(cid, m) {
    const corner = CORNERS[cid];
    const p = cornerPoint(cid);
    const distToCorner = Math.hypot(m.last.x - p.x, m.last.y - p.y);

    const axisOK =
      (corner.x ? m.dx > AXIS_MIN : m.dx < -AXIS_MIN) &&
      (corner.y ? m.dy > AXIS_MIN : m.dy < -AXIS_MIN);

    // Aim: the throw's own displacement against the vector from where it
    // STARTED to this corner — not from the cursor's current position, which
    // would make every throw look aimed the instant it is close enough.
    const toX = p.x - m.first.x;
    const toY = p.y - m.first.y;
    const toLen = Math.hypot(toX, toY) || 1;
    const dot = (m.dx * toX + m.dy * toY) / (m.dist * toLen);

    return { distToCorner, axisOK, dot };
  }

  /* A corner whose zone holds one of the live world's own controls — SOMEWHERE's
     "back to world" button sits in the bottom-left — cannot treat the whole zone
     as a door, or reaching briskly for that button throws you into another
     world. Such a corner asks for the throw to land ON the corner itself, the
     way a macOS hot corner does. Only measured once every cheaper gate has
     already passed, so this layout read happens at most once per candidate
     throw, never per frame. */
  function occupied(cid) {
    const p = cornerPoint(cid);
    const r = radiusFor();
    for (const el of document.querySelectorAll(INTERACTIVE)) {
      if (node.contains(el)) continue;
      if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      /* Only the part of it that is ON SCREEN can be in the way. A control
         parked off the viewport until it is needed — the skip link sits at
         `top: -100px` and drops in on focus — is still a rectangle 91px from
         the top-left corner as far as `getBoundingClientRect` is concerned,
         and counting it made EVERY world's top-left corner demand a bullseye
         landing while the other three took the whole zone. */
      const left = clamp(rect.left, 0, window.innerWidth);
      const right = clamp(rect.right, 0, window.innerWidth);
      const top = clamp(rect.top, 0, window.innerHeight);
      const bottom = clamp(rect.bottom, 0, window.innerHeight);
      if (right - left <= 0 || bottom - top <= 0) continue;
      const nx = clamp(p.x, left, right);
      const ny = clamp(p.y, top, bottom);
      if (Math.hypot(p.x - nx, p.y - ny) < r) return true;
    }
    return false;
  }

  function qualifies(cid, control, m) {
    if (!control || control.world.id === getCurrent()) return false;
    if (disarmed.has(cid)) return false;
    const { distToCorner, axisOK, dot } = aimAt(cid, m);
    if (distToCorner > radiusFor()) return false;
    if (!axisOK) return false;
    if (dot < DOT_TRIGGER) return false;
    if (m.speed < speedFloor()) return false;
    if (distToCorner > PINNED && occupied(cid)) return false;
    return true;
  }

  /* Stage 2. A looser version of the same three shape-checks, turned into a
     0..1 the CSS uses for a little extra response ahead of the trigger —
     never as loose as "any movement in the general area", or the corner
     nearest wherever the cursor already is would glow constantly. */
  function chargeFor(cid, m) {
    const { distToCorner, dot } = aimAt(cid, m);
    const reach = radiusFor() * 2.1;
    if (distToCorner > reach || dot < DOT_CHARGE) return 0;
    const floor = speedFloor();
    const speedFactor = clamp((m.speed - floor * 0.3) / (floor * 0.7), 0, 1);
    const dirFactor = clamp((dot - DOT_CHARGE) / (DOT_TRIGGER - DOT_CHARGE), 0, 1);
    const proxFactor = clamp(1 - distToCorner / reach, 0, 1);
    return speedFactor * (0.35 + 0.65 * dirFactor) * (0.3 + 0.7 * proxFactor);
  }

  function trigger(control, m) {
    const cid = control.world.corner;
    locked = true;
    disarmed.add(cid);
    clearCharge();
    clearTimeout(lockTimer);
    lockTimer = setTimeout(() => { locked = false; }, LOCK_MS);

    const d = diag();
    const len = Math.hypot(m.dx, m.dy) || 1;
    const impulse = {
      speed: m.speed,
      strength: clamp((m.speed / d) / (SPEED_DIAGONALS * 2.4), 0, 1),
      x: m.dx / len,
      y: m.dy / len,
    };

    if (!control.prepared) {
      control.prepared = true;
      onApproach?.(control.world.id);
    }
    onEnter?.(control.world.id, { impulse });
  }

  function gated() {
    return locked || document.body.classList.contains('is-crossing') || !node.classList.contains('is-awake');
  }

  function onMove(event) {
    if (event.pointerType !== 'mouse') return;

    // A held button is a drag — orbiting a globe, scrubbing, selecting text —
    // never a throw.
    if (gated() || event.buttons !== 0) {
      // A crossing or a not-yet-awake nav invalidates whatever the hand was
      // doing before it — the next throw starts from a clean window rather
      // than one stitched across an unrelated pause.
      if (history.length) history = [];
      clearCharge();
      return;
    }

    const coalesced = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : null;
    const list = coalesced && coalesced.length ? coalesced : [event];
    for (const e of list) pushSample(e.clientX, e.clientY, e.timeStamp);

    rearm(event.clientX, event.clientY);

    const m = metrics();
    if (!m) { clearCharge(); return; }

    let fired = false;
    for (const control of controls) {
      const cid = control.world.corner;
      if (fired || control.world.id === getCurrent()) { writeCharge(control, 0); continue; }
      if (qualifies(cid, control, m)) {
        trigger(control, m);
        fired = true;
        continue;
      }
      writeCharge(control, chargeFor(cid, m));
    }
  }

  /* A windowed browser lets the cursor exit the viewport through a corner
     region entirely — no more pointermove events follow, so the trigger has
     to be decided here, on the way out, from whatever history is left. */
  function onOut(event) {
    if (event.pointerType && event.pointerType !== 'mouse') return;
    if (event.relatedTarget) return; // still inside the document somewhere
    if (gated()) return;

    const m = metrics();
    if (!m) return;

    for (const control of controls) {
      if (control.world.id === getCurrent()) continue;
      if (qualifies(control.world.corner, control, m)) {
        trigger(control, m);
        break;
      }
    }
  }

  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerout', onOut, { passive: true });

  return {
    destroy() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerout', onOut);
      clearTimeout(lockTimer);
      history = [];
      disarmed.clear();
      chargeWritten.clear();
    },
  };
}
