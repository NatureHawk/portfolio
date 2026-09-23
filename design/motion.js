// HUM — the motion layer.
//
// Everything on this page that moves goes through this file. Three rules it
// exists to enforce:
//
//   1. ONE clock. anime.js already runs a rAF loop for its own animations, so
//      per-frame work (pointer damping, scroll scrubbing, velocity) rides that
//      same tick via `frame.add` instead of starting a second loop. Two loops
//      is how a page ends up writing styles twice per frame.
//   2. ONE read, ONE write. Nothing here measures layout inside a scroll or
//      pointer handler. Handlers set numbers; the frame reads them.
//   3. Nothing animates off-screen. Every scrubber and every choreography is
//      gated by an IntersectionObserver, so a section eight screens down costs
//      nothing while you are reading the hero.
//
// `prefers-reduced-motion` is honoured by making the utilities land elements in
// their final state instead of by skipping the call, so no caller needs an
// `if (reduced)` branch around it.

import {
  animate,
  createTimeline,
  createTimer,
  createDraggable,
  cubicBezier,
  spring,
  stagger,
  utils,
  eases,
} from '../vendor/anime/anime.esm.min.js';

// Re-exported so the section modules have ONE import path for motion. Only what
// they actually use is passed through; anything the page needs is added here
// rather than imported from the vendor bundle twice.
//
// anime's own `onScroll` is deliberately not among them. It is a fine API, but
// it runs a second scroll-observer system alongside the one below — and the
// whole point of this file is that there is one clock, one scroll value and one
// place that decides what is on screen. `scrubber` covers the same ground on
// that shared tick.
export { animate, createTimeline, createDraggable, stagger, utils };

/* ══ MOTION BUDGET ═════════════════════════════════════════════════════════
   Read once at boot, and kept live: if someone turns the OS setting on while
   the page is open, everything registered after that point lands static and
   the ambient loops stop.

   THE OS SETTING IS THE DEFAULT AND IT IS NEVER SECOND-GUESSED. What sits on
   top of it is an override the visitor has to ask for, stored under their own
   key, and it exists for one specific reason: a laptop can arrive with the
   system animation setting turned off by its vendor's power software, and the
   person using it has no idea that is what happened. On a page whose entire
   argument is that the internet should feel alive, that is a visitor being
   shown the opposite case and told it is the case. So there is a way back in —
   opt-in, remembered, and equally a way out for anyone who wants the quiet
   version regardless of what their system says. */
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const motionListeners = new Set();
const PREF_KEY = 'hum:motion';

// Storage can throw outright — Safari in private mode, a locked-down profile —
// and a preference nobody can save is not worth a broken page over.
const readPref = () => {
  try { return window.localStorage.getItem(PREF_KEY); } catch { return null; }
};

let preference = readPref();   // 'full' | 'reduced' | null, where null follows the system

const resolveMotion = () => {
  if (preference === 'full') return false;
  if (preference === 'reduced') return true;
  return motionQuery.matches;
};

export const motion = { reduced: resolveMotion() };

/* What the toggle needs to draw itself: whether the visitor has taken the
   decision off the system, and which way. */
export const motionPreference = () => preference;
export const motionSystemPrefersReduced = () => motionQuery.matches;

function applyMotion() {
  const next = resolveMotion();
  if (next === motion.reduced) return;
  motion.reduced = next;
  document.documentElement.classList.toggle('reduced-motion', motion.reduced);
  motionListeners.forEach((fn) => fn(motion.reduced));
}

export function setMotionPreference(next) {
  try {
    if (next) window.localStorage.setItem(PREF_KEY, next);
    else window.localStorage.removeItem(PREF_KEY);
  } catch { /* unstorable, but still honoured for this page view */ }
  preference = next;
  applyMotion();
}

motionQuery.addEventListener('change', applyMotion);
document.documentElement.classList.toggle('reduced-motion', motion.reduced);

export const onMotionChange = (fn) => {
  motionListeners.add(fn);
  return () => motionListeners.delete(fn);
};

// Touch-only devices get the choreography but not the cursor-follow work,
// which has nothing to follow.
export const hasHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/* ══ EASING VOCABULARY ═════════════════════════════════════════════════════
   A named set, so easing is a decision made once rather than eight curves that
   all nearly agree. Anything that ENTERS uses `rise`. Anything the pointer
   drives uses a spring. Nothing uses linear except the marquee, which is
   supposed to look mechanical.

   Passed as FUNCTIONS, not strings. anime 4 removed string `cubicBezier(...)`
   from the core: a string curve is silently ignored and the animation quietly
   runs on the default ease, which is the kind of bug you feel and cannot see.
   Nothing on this page may write an inline curve — every duration-and-curve pair
   comes from this object. */
export const EASE = {
  rise: cubicBezier(0.16, 1, 0.3, 1),      // entrances: fast out, long settle
  glide: cubicBezier(0.32, 0.72, 0, 1),    // position changes on screen
  snap: cubicBezier(0.7, 0, 0.28, 1),      // things locking into place
  soft: cubicBezier(0.4, 0, 0.2, 1),       // small state changes, hovers
  exit: cubicBezier(0.6, 0, 0.9, 0.3),     // leaving: slow start, quick away
  mark: cubicBezier(0.65, 0, 0.35, 1),     // the highlighter swipe
  curtain: cubicBezier(0.7, 0, 0.2, 1),    // the arrival panel leaving
  wave: eases.inOutSine,                   // the only thing allowed to loop
  linear: eases.linear,
};

export const SPRING = {
  // Cursors: heavy enough to lag the target a little, so they read as
  // somebody's hand rather than a tween.
  cursor: spring({ mass: 1, stiffness: 92, damping: 14 }),
  // Objects being dropped on the canvas.
  drop: spring({ mass: 1.1, stiffness: 130, damping: 16 }),
  // UI: a single overshoot, never a wobble.
  ui: spring({ mass: 1, stiffness: 210, damping: 22 }),
};

/* ══ THE CLOCK ═════════════════════════════════════════════════════════════
   One anime timer, subscribers in a Set. It only runs while something is
   subscribed and the tab is visible; an idle page ticks nothing. */
const subscribers = new Set();
let clock = null;

const tick = (self) => {
  const dt = self.deltaTime;
  for (const fn of subscribers) fn(dt);
};

function ensureClock() {
  if (clock) return;
  clock = createTimer({ duration: Infinity, onUpdate: tick });
}

export const frame = {
  add(fn) {
    subscribers.add(fn);
    ensureClock();
    clock.resume();
    return () => frame.remove(fn);
  },
  remove(fn) {
    subscribers.delete(fn);
    if (clock && subscribers.size === 0) clock.pause();
  },
};

document.addEventListener('visibilitychange', () => {
  if (!clock) return;
  if (document.hidden) clock.pause();
  else if (subscribers.size) clock.resume();
});

/* ══ VIEWPORT GATE ═════════════════════════════════════════════════════════
   `inView` is the only IntersectionObserver wrapper on the page. `once` for
   reveals that can never need to happen twice; the repeating form is what
   suspends the running choreographies. */
export function inView(el, { onEnter, onLeave, once = false, amount = 0.2, margin = '0px' } = {}) {
  if (!el) return () => {};
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          onEnter?.(entry);
          if (once) observer.disconnect();
        } else {
          onLeave?.(entry);
        }
      }
    },
    { threshold: amount, rootMargin: margin }
  );
  observer.observe(el);
  return () => observer.disconnect();
}

/* ══ POINTER ═══════════════════════════════════════════════════════════════
   Raw position from the event, damped position from the frame. Anything that
   follows the cursor reads `pointer.sx/sy` so every follower shares one
   smoothing pass rather than each running its own.
   `has` stays false until the pointer actually moves, so nothing lurches from
   0,0 on the first frame. */
export const pointer = { x: 0, y: 0, sx: 0, sy: 0, vx: 0, vy: 0, has: false, down: false };

if (hasHover) {
  window.addEventListener(
    'pointermove',
    (event) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      if (!pointer.has) {
        pointer.sx = pointer.x;
        pointer.sy = pointer.y;
        pointer.has = true;
      }
    },
    { passive: true }
  );
  /* The FIRST position, without waiting for a hand to move. A visitor who
     lands on a world without having moved the mouse yet — arriving through a
     crossing, or simply loading the page with the cursor already over it —
     has a pointer the page knows nothing about, and anything that follows it
     (see cursors.js) has to either guess or stay hidden. `pointerover` fires
     on arrival under a stationary cursor as the browser re-runs hit-testing,
     and it carries real coordinates, so it seeds the position exactly once.
     It never overrides a live pointermove: this only fills in a position that
     was never known. */
  window.addEventListener(
    'pointerover',
    (event) => {
      if (pointer.has) return;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.sx = pointer.x;
      pointer.sy = pointer.y;
      pointer.has = true;
    },
    { passive: true }
  );
  window.addEventListener('pointerdown', () => { pointer.down = true; }, { passive: true });
  window.addEventListener('pointerup', () => { pointer.down = false; }, { passive: true });

  frame.add((dt) => {
    // Frame-rate independent damping: the same feel at 60Hz and 144Hz.
    const k = 1 - Math.exp(-dt / 70);
    const px = pointer.sx;
    const py = pointer.sy;
    pointer.sx += (pointer.x - pointer.sx) * k;
    pointer.sy += (pointer.y - pointer.sy) * k;
    pointer.vx = pointer.sx - px;
    pointer.vy = pointer.sy - py;
  });
}

/* ══ SCROLL ════════════════════════════════════════════════════════════════
   One listener for the whole page. It writes two numbers; everything else
   reads them on the frame. `velocity` is normalised per 16ms so it means the
   same thing regardless of refresh rate. */
export const scroll = { y: window.scrollY, velocity: 0, progress: 0, direction: 1 };
let lastScrollY = scroll.y;

window.addEventListener(
  'scroll',
  () => {
    scroll.y = window.scrollY;
  },
  { passive: true }
);

frame.add((dt) => {
  const delta = scroll.y - lastScrollY;
  if (delta !== 0) scroll.direction = delta > 0 ? 1 : -1;
  lastScrollY = scroll.y;
  const perFrame = (delta * 16) / Math.max(dt, 1);
  scroll.velocity += (perFrame - scroll.velocity) * 0.2;
  if (Math.abs(scroll.velocity) < 0.01) scroll.velocity = 0;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  scroll.progress = max > 0 ? utils.clamp(scroll.y / max, 0, 1) : 0;
});

/* Scrubs `cb(progress)` for an element crossing the viewport, where 0 is the
   element's top reaching `start` of the viewport height and 1 is its bottom
   reaching `end`. Measured on resize, not per frame. Suspended entirely while
   the element is off-screen. */
export function scrubber(el, cb, { start = 1, end = 0, extra = 0 } = {}) {
  if (!el) return () => {};
  let top = 0;
  let height = 0;
  let vh = window.innerHeight;
  let active = false;
  let last = -1;

  const measure = () => {
    vh = window.innerHeight;
    const rect = el.getBoundingClientRect();
    top = rect.top + window.scrollY;
    height = rect.height + extra;
  };

  const read = () => {
    const from = top - vh * start;
    const to = top + height - vh * end;
    const span = Math.max(to - from, 1);
    const p = utils.clamp((scroll.y - from) / span, 0, 1);
    if (p !== last) {
      last = p;
      cb(p);
    }
  };

  const onFrame = () => { if (active) read(); };
  const stopFrame = frame.add(onFrame);

  const stopView = inView(el, {
    margin: '30% 0px 30% 0px',
    amount: 0,
    onEnter: () => { measure(); active = true; },
    onLeave: () => { active = false; read(); },
  });

  const onResize = () => { measure(); read(); };
  window.addEventListener('resize', onResize, { passive: true });
  measure();
  read();

  return () => {
    stopFrame();
    stopView();
    window.removeEventListener('resize', onResize);
  };
}

/* ══ TYPE ══════════════════════════════════════════════════════════════════
   Headlines are written in the HTML, already broken into `.tl > .tl-in` lines —
   where a display line breaks is a design decision, not something to leave to
   the box width, and putting it in the markup means the page reads correctly
   with no JavaScript at all.
   `prepLines` is the enhancement pass: it wraps the words so each one can be
   hovered and animated, and hands back the handles the choreography needs. It
   leaves any element already inside the line (the highlighter span behind
   ALIVE.) exactly where it is. */
export function prepLines(host, { words = true } = {}) {
  if (!host) return [];
  return $$('.tl', host).map((line, index) => {
    const inner = line.querySelector('.tl-in') ?? line;
    inner.style.setProperty('--i', index);
    if (words) wrapWords(inner);
    return { line, inner, words: $$('.tl-w', inner) };
  });
}

/* Wraps the bare words of an element in spans, in place. Only text nodes are
   touched, so existing children survive — and it is idempotent, so calling it
   twice cannot produce spans inside spans. */
function wrapWords(host) {
  if (host.dataset.split === 'true') return;
  host.dataset.split = 'true';
  for (const node of [...host.childNodes]) {
    if (node.nodeType !== Node.TEXT_NODE) continue;
    const text = node.textContent;
    if (!text.trim()) continue;
    const fragment = document.createDocumentFragment();
    // The split keeps the separators, so the original spacing is preserved
    // exactly rather than rebuilt from assumptions about single spaces.
    for (const part of text.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        fragment.appendChild(document.createTextNode(part));
      } else {
        const word = document.createElement('span');
        word.className = 'tl-w';
        word.textContent = part;
        fragment.appendChild(word);
      }
    }
    node.replaceWith(fragment);
  }
}

/* Targets in, array of elements out — a string selector, one node, a NodeList
   or an array all land in the same shape. */
const resolve = (targets) => {
  if (!targets) return [];
  if (typeof targets === 'string') return [...document.querySelectorAll(targets)];
  if (targets instanceof Element) return [targets];
  return [...targets];
};

/* Rises masked lines into place. The default delay is the beat the whole page
   is timed to — see the entrance in design.js. */
export function revealLines(parts, { delay = 0, stagger: step = 90, duration = 1000 } = {}) {
  const inners = parts.map((p) => p.inner ?? p);
  if (motion.reduced) {
    utils.set(inners, { y: '0%', opacity: 1 });
    return null;
  }
  utils.set(inners, { y: '110%', opacity: 1 });
  return animate(inners, {
    y: '0%',
    duration,
    delay: stagger(step, { start: delay }),
    ease: EASE.rise,
  });
}

/* The workhorse entrance: a short rise with a fade, staggered. Used by every
   section so all of them arrive with the same physics. */
export function revealUp(targets, { delay = 0, stagger: step = 60, distance = 22, duration = 780 } = {}) {
  const list = resolve(targets);
  if (!list.length) return null;
  if (motion.reduced) {
    utils.set(list, { y: 0, opacity: 1 });
    return null;
  }
  utils.set(list, { y: distance, opacity: 0 });
  return animate(list, {
    y: 0,
    opacity: 1,
    duration,
    delay: stagger(step, { start: delay }),
    ease: EASE.rise,
  });
}

/* ══ TYPING ════════════════════════════════════════════════════════════════
   Deletes what is there, then types the replacement. A crossfade would be
   cheaper and would read as a text swap; this reads as somebody editing, which
   is the entire point of showing it. Used by the demo board in section 03 and by
   the shared headline in 06, so it lives here rather than in either. */
export function typeText(node, text, { rate = 22 } = {}) {
  if (!node) return null;
  if (motion.reduced) {
    node.textContent = text;
    return null;
  }
  const from = node.textContent;
  let i = from.length;
  let deleting = true;

  return createTimer({
    duration: Infinity,
    frameRate: rate,
    onUpdate: (self) => {
      if (deleting) {
        i -= 1;
        node.textContent = from.slice(0, Math.max(i, 0));
        if (i <= 0) { deleting = false; i = 0; }
      } else {
        i += 1;
        node.textContent = text.slice(0, i);
        if (i >= text.length) self.pause();
      }
    },
  });
}

/* ══ MAGNETISM ═════════════════════════════════════════════════════════════
   Pointer attraction, as a spring rather than a transform written straight
   from the event — so releasing feels like release and not a cut. Returns a
   teardown; every caller that can be removed from the page uses it. */
export function magnetic(el, { strength = 0.24, rotate = 0, scale = 1, radius = 1.6 } = {}) {
  if (!hasHover || motion.reduced || !el) return () => {};

  let inside = false;

  const move = (event) => {
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (event.clientX - cx) / (rect.width / 2);
    const dy = (event.clientY - cy) / (rect.height / 2);
    const reach = Math.min(Math.hypot(dx, dy) / radius, 1);
    animate(el, {
      x: dx * rect.width * strength * 0.5,
      y: dy * rect.height * strength * 0.5,
      rotate: rotate ? dx * rotate : 0,
      scale: scale !== 1 ? 1 + (scale - 1) * (1 - reach * 0.4) : 1,
      ease: SPRING.ui,
      duration: 700,
    });
  };

  const leave = () => {
    inside = false;
    animate(el, { x: 0, y: 0, rotate: 0, scale: 1, ease: SPRING.drop, duration: 800 });
  };

  const enter = () => { inside = true; };

  el.addEventListener('pointerenter', enter);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerleave', leave);

  return () => {
    el.removeEventListener('pointerenter', enter);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerleave', leave);
    if (inside) leave();
  };
}

/* ══ TACTILE OBJECTS ═══════════════════════════════════════════════════════
   The canvas primitive: a thing that lifts under the cursor, tilts a little
   away from where you touched it, and settles back with weight. This is the
   single place "feels physical" is defined, so every note, tile and card on
   the page agrees about it. */
export function tactile(el, { lift = 6, tilt = 2.4, scale = 1.02 } = {}) {
  if (!hasHover || motion.reduced || !el) return () => {};
  const base = Number(el.dataset.rot || 0);

  const move = (event) => {
    if (el.dataset.dragging === 'true') return;
    const rect = el.getBoundingClientRect();
    const dx = (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
    const dy = (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
    animate(el, {
      rotate: base + dx * tilt,
      translateX: dx * lift * 0.6,
      translateY: dy * lift * 0.6 - lift,
      scale,
      duration: 600,
      ease: SPRING.ui,
    });
  };

  const leave = () => {
    if (el.dataset.dragging === 'true') return;
    animate(el, {
      rotate: base,
      translateX: 0,
      translateY: 0,
      scale: 1,
      duration: 850,
      ease: SPRING.drop,
    });
  };

  el.addEventListener('pointermove', move);
  el.addEventListener('pointerleave', leave);
  return () => {
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerleave', leave);
  };
}

/* ══ SMALL HELPERS ═════════════════════════════════════════════════════════ */
export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
export const el = (tag, className, html) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html != null) node.innerHTML = html;
  return node;
};
export const pad2 = (n) => String(n).padStart(2, '0');
export const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
export const lerp = (a, b, t) => a + (b - a) * t;
