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

const principlesList = document.getElementById('principles');
principlesList.innerHTML = principles
  .map(
    (p) => `
    <li class="principle plate">
      <span class="screw"></span><span class="screw"></span>
      <span class="screw"></span><span class="screw"></span>
      <span class="lamp" style="--lamp-color:#ff4a1c"></span>
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
      <span class="spec-name"><span class="lamp lit" style="--lamp-color:#101012"></span>${d.name}</span>
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
        <span class="screw"></span><span class="screw"></span>
        <span class="screw"></span><span class="screw"></span>

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

        <div class="card-window well" data-window>
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

/* ══ GAUGE SCALE ════════════════════════════════════════════════════════ */

const cards = [...track.querySelectorAll('.card')];
const gaugeScale = document.getElementById('gauge-scale');
const carriage = document.getElementById('gauge-carriage');
const readoutIndex = document.getElementById('readout-index');
const readoutName = document.getElementById('readout-name');
document.getElementById('readout-total').textContent = String(projects.length).padStart(2, '0');

// One major tick per project, four minor between — a real linear scale, so the
// carriage position is readable as "between 2 and 3", not just decorative.
gaugeScale.innerHTML = projects
  .map((_, i) => {
    const step = 100 / (projects.length - 1);
    const majors = `<i class="major" style="left:${i * step}%"></i>`;
    if (i === projects.length - 1) return majors;
    const minors = [1, 2, 3, 4]
      .map((m) => `<i style="left:${i * step + (step * m) / 5}%"></i>`)
      .join('');
    return majors + minors;
  })
  .join('');

/* ══ RAIL GEOMETRY ══════════════════════════════════════════════════════ */

const rail = document.getElementById('rail');

// Pin length grows with the collection so adding a project lengthens the
// scroll instead of speeding the whole thing up.
const DWELL_VH = 88;
rail.style.setProperty('--rail-height', `${100 + (projects.length - 1) * DWELL_VH}vh`);

// Measured, not assumed: card widths are clamped in CSS, so the only reliable
// source for "where does card i sit" is the laid-out DOM.
let geometry = { start: 0, end: 0, centers: [] };

function measure() {
  const viewport = window.innerWidth;
  geometry.centers = cards.map((card) => card.offsetLeft + card.offsetWidth / 2);
  geometry.start = viewport / 2 - geometry.centers[0];
  geometry.end = viewport / 2 - geometry.centers[geometry.centers.length - 1];
}

/* ══ FRAME LOOP ═════════════════════════════════════════════════════════ */

const statusSection = document.getElementById('status-section');
const statusFill = document.getElementById('status-fill');
const statusPct = document.getElementById('status-pct');
const sections = [...document.querySelectorAll('main > section, main > footer')];
const sectionNames = ['HERO', 'PHILOSOPHY', 'SPECIFICATION', 'INDEX OF WORK', 'COLOPHON'];

const pointer = { x: 0.5, y: 0.5, active: false };
let trackX = null;      // smoothed, so wheel steps don't read as stutter
let needsFrame = true;
let lastReadout = -1;

const lerp = (a, b, t) => a + (b - a) * t;

function frame() {
  requestAnimationFrame(frame);
  if (!needsFrame && trackX === null) return;
  needsFrame = false;

  const scrollY = window.scrollY;
  const viewportH = window.innerHeight;

  // ── document progress readout ──
  const docMax = document.documentElement.scrollHeight - viewportH;
  const docProgress = docMax > 0 ? Math.min(1, scrollY / docMax) : 0;
  statusFill.style.width = `${docProgress * 100}%`;
  statusPct.textContent = `${String(Math.round(docProgress * 100)).padStart(2, '0')}%`;

  // Whichever section owns the viewport's middle. The explicit end case matters
  // because the colophon is taller than the remaining scroll — without it the
  // readout still claims "INDEX OF WORK" while you're looking at the footer.
  let current = 0;
  sections.forEach((section, i) => {
    if (section.offsetTop <= scrollY + viewportH * 0.5) current = i;
  });
  if (docMax > 0 && scrollY >= docMax - 4) current = sections.length - 1;
  const name = sectionNames[current] || '';
  if (statusSection.textContent !== name) statusSection.textContent = name;

  // ── the rail ──
  if (!stacked()) {
    const railTop = rail.offsetTop;
    const railRange = rail.offsetHeight - viewportH;
    const p = railRange > 0 ? Math.min(1, Math.max(0, (scrollY - railTop) / railRange)) : 0;

    const targetX = lerp(geometry.start, geometry.end, p);
    // Direct on the first frame, then eased — the carriage should feel like it
    // has mass, but never drift far enough to desync from the scrollbar.
    trackX = trackX === null ? targetX : lerp(trackX, targetX, reduceMotion ? 1 : 0.18);
    if (Math.abs(targetX - trackX) < 0.05) trackX = targetX;
    else needsFrame = true;

    track.style.transform = `translate3d(${trackX.toFixed(2)}px, 0, 0)`;

    // Emphasis + cursor tilt, per card, from the same measured centres.
    const focus = window.innerWidth / 2;
    cards.forEach((card, i) => {
      const centre = geometry.centers[i] + trackX;
      const dist = Math.abs(centre - focus) / (window.innerWidth * 0.55);
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

    // ── gauge ──
    // `left` (not transform) so the carriage reads against the tick scale in
    // the same percentage space the ticks were laid out in.
    carriage.style.left = `${(p * 100).toFixed(2)}%`;

    const nearest = Math.round(p * (projects.length - 1));
    if (nearest !== lastReadout) {
      lastReadout = nearest;
      readoutIndex.textContent = String(nearest + 1).padStart(2, '0');
      readoutName.textContent = projects[nearest].name.toUpperCase();
    }
  }
}

/* ══ EVENTS ═════════════════════════════════════════════════════════════ */

const flag = () => { needsFrame = true; };

window.addEventListener('scroll', flag, { passive: true });
window.addEventListener('resize', () => { measure(); trackX = null; flag(); });

window.addEventListener(
  'pointermove',
  (event) => {
    pointer.x = event.clientX / window.innerWidth;
    pointer.y = event.clientY / window.innerHeight;
    pointer.active = true;
    flag();
  },
  { passive: true }
);
window.addEventListener('pointerleave', () => { pointer.active = false; flag(); });

// Principle plates seat themselves once, then stop costing anything.
const seatObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('seated');
      seatObserver.unobserve(entry.target);
      const lamp = entry.target.querySelector('.lamp');
      if (lamp) setTimeout(() => lamp.classList.add('lit'), 220);
    });
  },
  { rootMargin: '0px 0px -18% 0px', threshold: 0.25 }
);
document.querySelectorAll('.principle').forEach((el) => seatObserver.observe(el));

// Fonts change card widths, so geometry has to be re-measured once they land.
measure();
if (document.fonts?.ready) document.fonts.ready.then(() => { measure(); trackX = null; flag(); });
requestAnimationFrame(frame);
