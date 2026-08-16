// CODE — build + choreography.
//
// One rAF loop drives everything that moves with scroll or cursor. Nothing here
// listens to `scroll` and writes styles inline; the listener only flags dirty,
// the frame reads once and writes once, so we never interleave layout reads
// with style writes and thrash.
//
// Reveals that only need to fire once (the principle plates) use
// IntersectionObserver instead, so they cost nothing per frame.

import { projects, disciplines, principles } from './projects.js';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const stacked = () => window.matchMedia('(max-width: 760px)').matches;

/* ══ BACK TO THE ROOM ═══════════════════════════════════════════════════
   Going back through history lets the browser restore index.html from the
   bfcache — the 3D scene comes back already built, instead of paying for a
   cold Three.js boot. Only safe if we actually came from there; a direct
   visit or an external referrer falls through to a normal navigation. */
document.querySelectorAll('[data-back]').forEach((link) => {
  link.addEventListener('click', (event) => {
    let cameFromRoom = false;
    try {
      cameFromRoom =
        document.referrer &&
        new URL(document.referrer).origin === location.origin &&
        /(^|\/)index\.html$|\/$/.test(new URL(document.referrer).pathname);
    } catch { cameFromRoom = false; }

    if (cameFromRoom && history.length > 1) {
      event.preventDefault();
      history.back();
    }
  });
});

/* ══ HERO ═══════════════════════════════════════════════════════════════ */

// Wrap each line so it can rise out of its own clip mask.
document.querySelectorAll('.hero-title .line').forEach((line, i) => {
  const inner = document.createElement('span');
  inner.innerHTML = line.innerHTML;
  line.textContent = '';
  line.appendChild(inner);
  if (reduceMotion) return;
  inner.style.transform = 'translateY(105%)';
  inner.style.transition = `transform .9s cubic-bezier(.22,1,.36,1) ${0.16 + i * 0.09}s`;
  requestAnimationFrame(() => requestAnimationFrame(() => { inner.style.transform = 'translateY(0)'; }));
});

/* ══ PRINCIPLES ═════════════════════════════════════════════════════════ */

// Each principle carries a real throw switch rather than a bullet. They sit
// off until the plate reaches you, then flip — the progressive reveal is a
// physical state change, not a fade.
const principlesList = document.getElementById('principles');
principlesList.innerHTML = principles
  .map(
    (p) => `
    <li class="principle">
      <span class="switch" style="--switch-color:#ff4a1c"><i></i></span>
      <span class="principle-statement">${p.statement}</span>
      <p class="principle-note">${p.note}</p>
    </li>`
  )
  .join('');

/* ══ SPECIFICATION TABLE ════════════════════════════════════════════════ */

document.getElementById('spec-table').innerHTML = disciplines
  .map(
    (d) => `
    <div class="spec-row">
      <span class="spec-name"><span class="lamp lit" style="--lamp-color:#2e3f59"></span>${d.name}</span>
      <span class="spec-note">${d.note}</span>
      <span class="spec-items">${d.items.map((i) => `<span>${i}</span>`).join('')}</span>
    </div>`
  )
  .join('');

/* ══ PROJECT CARDS ══════════════════════════════════════════════════════ */

const track = document.getElementById('track');

const buildCard = (p, i) => {
  const n = String(i + 1).padStart(2, '0');
  const cta = p.pending
    ? `<span class="card-cta" aria-disabled="true"><b>EXPLORE →</b><small>SOON</small></span>`
    : `<a class="card-cta" href="${p.href}"><b>EXPLORE →</b><small>${p.code}</small></a>`;

  return `
    <article class="card${p.underConstruction ? ' card--wip' : ''}" style="--accent:${p.accent}" data-index="${i}">
      <div class="card-face">
        <header class="card-head">
          <span class="card-index"><i>${n}</i>${p.code}</span>
          <span class="card-state">
            <span class="lamp lit" style="--lamp-color:${p.accent}"></span>${p.status} · ${p.year}
          </span>
        </header>

        <div class="card-title">
          <h3 class="card-name">${p.name}</h3>
          <p class="card-kind">${p.kind}</p>
        </div>

        <div class="card-window" data-window>
          <div class="card-window-pending">
            <b>${p.code}</b>
            <span>Preview pending</span>
          </div>
        </div>

        <p class="card-blurb">${p.blurb}</p>

        <dl class="card-specs">
          ${p.specs.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}
        </dl>

        <div class="card-foot">
          <div class="card-stack">${p.stack.map((s) => `<span>${s}</span>`).join('')}</div>
          ${cta}
        </div>
      </div>
    </article>`;
};

track.innerHTML = projects.map(buildCard).join('');

// Swap in a real preview the moment one exists at the data-driven path. The
// pending plate stays until the file both exists and decodes, so a 404 never
// leaves an empty well — and dropping a file in later needs no layout change.
track.querySelectorAll('[data-window]').forEach((win, i) => {
  const src = projects[i].preview;
  if (!src) return;
  const img = new Image();
  img.loading = 'lazy';
  img.decoding = 'async';
  img.alt = `${projects[i].name} preview`;
  img.onload = () => { win.innerHTML = ''; win.appendChild(img); };
  img.src = src;
});

/* ══ SELECTOR DIAL ══════════════════════════════════════════════════════ */

const cards = [...track.querySelectorAll('.card')];
const dialTicks = document.getElementById('dial-ticks');
const dialKnob = document.getElementById('dial-knob');
const dialNotch = dialKnob.querySelector('.dial-notch');
const readoutIndex = document.getElementById('readout-index');
const readoutName = document.getElementById('readout-name');
document.getElementById('readout-total').textContent = String(projects.length).padStart(2, '0');

// Real potentiometer sweep: 270° of travel with a dead zone at the bottom,
// the way a physical rotary control is built. One major tick per project with
// four minors between, so the knob reads as "between 2 and 3" at a glance.
const SWEEP = 270;
const START_ANGLE = -SWEEP / 2;
const steps = projects.length - 1;

dialTicks.innerHTML = projects
  .map((_, i) => {
    const angle = START_ANGLE + (SWEEP / steps) * i;
    const major = `<i class="major" style="transform:rotate(${angle}deg)"></i>`;
    if (i === steps) return major;
    const minors = [1, 2, 3, 4]
      .map((m) => {
        const a = angle + (SWEEP / steps) * (m / 5);
        return `<i style="transform:rotate(${a}deg)"></i>`;
      })
      .join('');
    return major + minors;
  })
  .join('');

/* ══ THE DIAL IS A CONTROL ══════════════════════════════════════════════
   Grab it and turn it and the rail follows. It does not animate the track
   itself — it converts the angle into a scroll position and moves the page.
   That keeps scroll as the single source of truth for where the rail is, so
   dragging, scrolling and the keyboard can never disagree about it. */

const dial = document.getElementById('dial');
dial.setAttribute('aria-valuemax', String(projects.length));

const angleFromCentre = (event) => {
  const r = dial.getBoundingClientRect();
  return (
    (Math.atan2(event.clientY - (r.top + r.height / 2), event.clientX - (r.left + r.width / 2)) *
      180) / Math.PI
  );
};

let dragStartAngle = 0;
let dragStartProgress = 0;
let dragging = false;

dial.addEventListener('pointerdown', (event) => {
  if (cache.stacked) return;
  dragging = true;
  dragStartAngle = angleFromCentre(event);
  dragStartProgress = railProgress(window.scrollY);
  dial.setPointerCapture(event.pointerId);
  dial.classList.add('turning');
  event.preventDefault();
});

dial.addEventListener('pointermove', (event) => {
  if (!dragging) return;
  let delta = angleFromCentre(event) - dragStartAngle;
  // Shortest way round, so dragging across the ±180° seam doesn't fling the
  // rail to the far end.
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  const next = clamp01(dragStartProgress + delta / SWEEP);
  window.scrollTo(0, scrollForProgress(next));
  // Re-anchor each move so accumulated clamping at either end doesn't build up
  // a debt you have to unwind before the knob responds again.
  dragStartAngle = angleFromCentre(event);
  dragStartProgress = next;
});

const endDrag = (event) => {
  if (!dragging) return;
  dragging = false;
  dial.classList.remove('turning');
  if (dial.hasPointerCapture?.(event.pointerId)) dial.releasePointerCapture(event.pointerId);
};
dial.addEventListener('pointerup', endDrag);
dial.addEventListener('pointercancel', endDrag);

// Arrow keys step card to card — the detents the tick marks are drawing.
dial.addEventListener('keydown', (event) => {
  const step = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[event.key];
  const jump = { Home: 0, End: 1 }[event.key];
  if (step === undefined && jump === undefined) return;
  event.preventDefault();
  const current = railProgress(window.scrollY);
  const next =
    jump !== undefined ? jump : clamp01(Math.round(current * steps + step) / steps);
  window.scrollTo({ top: scrollForProgress(next), behavior: reduceMotion ? 'auto' : 'smooth' });
});

/* ══ RAIL GEOMETRY ══════════════════════════════════════════════════════ */

const rail = document.getElementById('rail');

// Pin length grows with the collection so adding a project lengthens the
// scroll instead of speeding the whole thing up.
// Raised from 88 to keep per-card pacing after RAIL_LEAD/RAIL_TAIL took ~18%
// of the pinned range for dwell at the two ends.
const DWELL_VH = 106;
rail.style.setProperty('--rail-height', `${100 + (projects.length - 1) * DWELL_VH}vh`);

// Measured, not assumed: card widths are clamped in CSS, so the only reliable
// source for "where does card i sit" is the laid-out DOM.
const trackViewport = document.getElementById('track-viewport');
let geometry = { start: 0, end: 0, centers: [], fit: 1 };
// Layout values, read once in measure() and never inside the frame loop.
const cache = {
  viewportH: 0, focusX: 0, stacked: false, docMax: 0,
  sectionTops: [], railTop: 0, railRange: 0, falloff: 1,
};
let trackTarget = 0;

// The cards are content-sized; the stage is viewport-sized. Browser zoom, a
// laptop screen, or a sixth spec row all make the first exceed the second, and
// the stage clips whatever doesn't fit — the dial goes first. So measure both
// and scale the row down until it fits, keeping a margin top and bottom so the
// cards sit in the space rather than filling it edge to edge.
const FIT_MARGIN = 28;
// Card width as a share of the viewport, on screen. This is what produces the
// "half a card either side of a full one" composition, so it has to hold after
// the fit scale is applied — not before it.
const CARD_SHARE = 0.45;
const CARD_MAX = 660;
const GAP_SHARE = 0.034;

function fitTrack() {
  // Scaling the track down would otherwise shrink the cards on screen and let
  // three full ones into frame. So the layout width is inflated by the inverse
  // of the scale, holding the on-screen width constant. Widening a card also
  // rewraps its text, which changes its height, which changes the scale — so
  // this runs a few times. It converges immediately; the later passes are a
  // correction, not a search.
  for (let pass = 0; pass < 3; pass++) {
    const available = trackViewport.clientHeight - FIT_MARGIN;
    // offsetHeight is the untransformed layout height — the track's own scale
    // does not feed back into it, so this stays stable across resizes.
    const natural = track.offsetHeight;
    geometry.fit = natural > 0 ? Math.min(1, available / natural) : 1;

    const targetWidth = Math.min(window.innerWidth * CARD_SHARE, CARD_MAX);
    const targetGap = Math.max(22, window.innerWidth * GAP_SHARE);
    track.style.setProperty('--card-w', `${Math.round(targetWidth / geometry.fit)}px`);
    track.style.setProperty('--card-gap', `${Math.round(targetGap / geometry.fit)}px`);
  }
}

// EVERY layout read the frame loop needs is taken here and cached. That is the
// whole point of this function: reading offsetTop/offsetWidth/scrollHeight
// inside the loop forces the browser to flush pending layout on each call, and
// interleaving those reads with style writes makes it flush repeatedly per
// frame. It doesn't cost frames-per-second — it costs *even* frame times, which
// is exactly what micro-jitter is. Nothing below may read layout.
function measure() {
  const viewport = window.innerWidth;
  fitTrack();
  // Centres are untransformed offsets; the fit scale is applied where they are
  // consumed, so the two measurements stay independent of each other.
  geometry.centers = cards.map((card) => card.offsetLeft + card.offsetWidth / 2);
  geometry.start = viewport / 2 - geometry.centers[0] * geometry.fit;
  geometry.end = viewport / 2 - geometry.centers[geometry.centers.length - 1] * geometry.fit;

  cache.viewportH = window.innerHeight;
  cache.focusX = viewport / 2;
  cache.stacked = window.matchMedia('(max-width: 760px)').matches;
  cache.docMax = document.documentElement.scrollHeight - cache.viewportH;
  cache.sectionTops = sections.map((section) => section.offsetTop);

  // The pinned range is the rail's height minus the STAGE's height, offset by
  // the stage's sticky `top` — not `rail.offsetHeight - viewportH`, which is
  // what this used to be. The stage is shorter than the viewport (it sits
  // between the two floating chrome panels), so that older figure ran out
  // early: progress reached 1 only ~68px before the pin released, and with the
  // easing lag the last card never actually arrived at centre before the page
  // scrolled on. RetailHub was permanently half off-screen.
  const stage = document.querySelector('.rail-stage');
  const stickyTop = parseFloat(getComputedStyle(stage).top) || 0;
  cache.railTop = rail.offsetTop - stickyTop;
  cache.railRange = Math.max(1, rail.offsetHeight - stage.offsetHeight);
  // Falloff is measured in card-widths, so this is a geometry constant, not a
  // per-frame lookup.
  cache.falloff = (cards[0]?.offsetWidth || 1) * geometry.fit * 1.15;
}

// Travel finishes before the pin does, and starts after it begins. Without the
// tail the last card reaches centre at the exact moment the stage unsticks, so
// it is never actually seen there — the eased track is still catching up as
// the page scrolls away. The lead gives the first card the same courtesy.
const RAIL_LEAD = 0.05;
const RAIL_TAIL = 0.13;

const clamp01 = (v) => Math.min(1, Math.max(0, v));

function railProgress(scrollY) {
  const raw = (scrollY - cache.railTop) / cache.railRange;
  return clamp01((raw - RAIL_LEAD) / (1 - RAIL_LEAD - RAIL_TAIL));
}

// Inverse of the above: where must the page be scrolled for the rail to sit at
// `p`? Used by the dial, which drives the scroll position rather than fighting
// it with a second source of truth for where the track is.
function scrollForProgress(p) {
  const raw = clamp01(p) * (1 - RAIL_LEAD - RAIL_TAIL) + RAIL_LEAD;
  return cache.railTop + raw * cache.railRange;
}

/* ══ FRAME LOOP ═════════════════════════════════════════════════════════ */

const statusSection = document.getElementById('status-section');
const statusFill = document.getElementById('status-fill');
const statusPct = document.getElementById('status-pct');
const sections = [...document.querySelectorAll('main > section, main > footer')];
const sectionNames = ['HERO', 'PHILOSOPHY', 'SPECIFICATION', 'INDEX OF WORK', 'COLOPHON'];

const pointer = { x: 0.5, y: 0.5, active: false, dirty: true };
let trackX = null;      // smoothed, so wheel steps don't read as stutter
let lastReadout = -1;
let lastScrollY = -1;
let lastPct = -1;
let lastFrameTime = performance.now();

const lerp = (a, b, t) => a + (b - a) * t;

function frame(now) {
  requestAnimationFrame(frame);

  // Frame-rate independent. A fixed per-frame lerp factor smooths by a
  // different amount on every frame whose duration differs from the last,
  // which turns variable frame timing into visible wobble — the thing it was
  // supposed to hide.
  const delta = Math.min((now - lastFrameTime) / 1000, 0.05);
  lastFrameTime = now;

  const scrollY = window.scrollY;
  const scrolled = scrollY !== lastScrollY;
  const settling = trackX !== null && Math.abs(trackX - trackTarget) > 0.05;
  if (!scrolled && !settling && !pointer.dirty) return;
  lastScrollY = scrollY;
  pointer.dirty = false;

  // ── document progress readout ──
  const docProgress = cache.docMax > 0 ? Math.min(1, scrollY / cache.docMax) : 0;
  // scaleX, not width: width is a layout property, so animating it re-lays out
  // the status bar every single frame.
  statusFill.style.transform = `scaleX(${docProgress.toFixed(4)})`;
  const pct = Math.round(docProgress * 100);
  if (pct !== lastPct) {
    lastPct = pct;
    statusPct.textContent = `${String(pct).padStart(2, '0')}%`;
  }

  // Whichever section owns the viewport's middle. The explicit end case matters
  // because the colophon is taller than the remaining scroll — without it the
  // readout still claims "INDEX OF WORK" while you're looking at the footer.
  let current = 0;
  const mid = scrollY + cache.viewportH * 0.5;
  for (let i = 0; i < cache.sectionTops.length; i++) {
    if (cache.sectionTops[i] <= mid) current = i;
  }
  if (cache.docMax > 0 && scrollY >= cache.docMax - 4) current = cache.sectionTops.length - 1;
  const name = sectionNames[current] || '';
  if (statusSection.textContent !== name) statusSection.textContent = name;

  // ── the rail ──
  if (!cache.stacked) {
    const p = railProgress(scrollY);

    trackTarget = lerp(geometry.start, geometry.end, p);
    // Exponential damping toward the target: the carriage keeps its sense of
    // mass, but the amount of smoothing per second is constant regardless of
    // how long the frame took.
    const ease = reduceMotion ? 1 : 1 - Math.exp(-13 * delta);
    trackX = trackX === null ? trackTarget : lerp(trackX, trackTarget, ease);
    if (Math.abs(trackTarget - trackX) < 0.05) trackX = trackTarget;

    track.style.transform = `translate3d(${trackX.toFixed(2)}px, 0, 0) scale(${geometry.fit.toFixed(4)})`;

    // Emphasis + cursor tilt, per card, from the same measured centres.
    cards.forEach((card, i) => {
      const centre = geometry.centers[i] * geometry.fit + trackX;
      const dist = Math.abs(centre - cache.focusX) / cache.falloff;
      const emph = Math.max(0, 1 - dist);
      card.style.setProperty('--emph', emph.toFixed(3));

      const face = card.firstElementChild;
      if (!face) return;
      if (pointer.active && emph > 0.12) {
        // Tilt is scaled by emphasis, so off-centre cards stay calm instead of
        // all five reacting at once and turning into a wall of movement.
        face.style.setProperty('--tilt-x', ((0.5 - pointer.y) * 4 * emph).toFixed(2));
        face.style.setProperty('--tilt-y', ((pointer.x - 0.5) * 5 * emph).toFixed(2));
        face.style.setProperty('--shift-x', ((pointer.x - 0.5) * -14 * emph).toFixed(2));
        face.style.setProperty('--shift-y', ((pointer.y - 0.5) * -10 * emph).toFixed(2));
      } else {
        face.style.setProperty('--tilt-x', '0');
        face.style.setProperty('--tilt-y', '0');
        face.style.setProperty('--shift-x', '0');
        face.style.setProperty('--shift-y', '0');
      }
    });

    // ── dial ──
    dialKnob.style.transform = `rotate(${(START_ANGLE + SWEEP * p).toFixed(2)}deg)`;

    const nearest = Math.round(p * steps);
    if (nearest !== lastReadout) {
      lastReadout = nearest;
      readoutIndex.textContent = String(nearest + 1).padStart(2, '0');
      readoutName.textContent = projects[nearest].name.toUpperCase();
      // The indicator takes the colour of whatever it's pointing at.
      dialNotch.style.setProperty('--dial-color', projects[nearest].accent);
      dial.setAttribute('aria-valuenow', String(nearest + 1));
      dial.setAttribute('aria-valuetext', projects[nearest].name);
    }
  }
}

/* ══ EVENTS ═════════════════════════════════════════════════════════════ */

// The loop samples window.scrollY itself rather than reacting to the event,
// so a scroll event landing after that frame's rAF can't push the update a
// frame late. flag() only exists to wake the loop for non-scroll changes.
const flag = () => { pointer.dirty = true; };

window.addEventListener('resize', () => { measure(); trackX = null; flag(); }, { passive: true });

window.addEventListener(
  'pointermove',
  (event) => {
    pointer.x = event.clientX / window.innerWidth;
    pointer.y = event.clientY / window.innerHeight;
    pointer.active = true;
    pointer.dirty = true;
  },
  { passive: true }
);
window.addEventListener('pointerleave', () => { pointer.active = false; pointer.dirty = true; });

// Principle plates seat themselves once, then stop costing anything.
const seatObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('seated');
      seatObserver.unobserve(entry.target);
      // Plate lands first, switch throws a beat later — the order reads as
      // cause and effect rather than one simultaneous animation.
      setTimeout(() => entry.target.classList.add('thrown'), 260);
    });
  },
  { rootMargin: '0px 0px -18% 0px', threshold: 0.25 }
);
document.querySelectorAll('.principle').forEach((el) => seatObserver.observe(el));

/* ══ READY ══════════════════════════════════════════════════════════════
   The display face is a variable-width grotesque loaded over the network, and
   it changes card widths — so the rail must be measured after it lands, and
   the page must not be shown re-typesetting itself while we wait.

   The floor keeps a warm cache from flashing the overlay for two frames; the
   ceiling means a font CDN having a bad day costs a re-typeset, not a blank
   page. Both fixed, so this feels the same on localhost and on a cold load. */
const READY_FLOOR_MS = 260;
const READY_CEILING_MS = 2200;
const readyStart = performance.now();

measure();

const fontsSettled = document.fonts?.ready
  ? Promise.race([
      document.fonts.ready,
      new Promise((r) => setTimeout(r, READY_CEILING_MS)),
    ])
  : Promise.resolve();

fontsSettled.then(() => {
  measure();
  trackX = null;
  flag();
  const wait = Math.max(0, READY_FLOOR_MS - (performance.now() - readyStart));
  setTimeout(() => requestAnimationFrame(() => document.body.classList.add('ready')), wait);
});

requestAnimationFrame(frame);
