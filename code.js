// CODE — build + choreography.
//
// One rAF loop drives everything that moves with scroll or cursor. Nothing here
// listens to `scroll` and writes styles inline; the listener only flags dirty,
// the frame reads once and writes once, so we never interleave layout reads
// with style writes and thrash.
//
// Reveals that only need to fire once (the principle rows) use
// IntersectionObserver instead, so they cost nothing per frame.

import { projects, disciplines, principles, categories, buildPlate } from './projects.js';

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// The OS setting and the MOTION switch land on the same flag, so there is one
// code path to reason about rather than two that can disagree.
let motionOff = prefersReducedMotion;

const $ = (id) => document.getElementById(id);
const pad2 = (n) => String(n).padStart(2, '0');
// Short form of a project code — AMB-TDS reads as AMB in a cross-reference.
const shortCode = (code) => code.split('-')[0];

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
  if (motionOff) return;
  inner.style.transform = 'translateY(105%)';
  inner.style.transition = `transform .9s cubic-bezier(.22,1,.36,1) ${0.16 + i * 0.09}s`;
  requestAnimationFrame(() => requestAnimationFrame(() => { inner.style.transform = 'translateY(0)'; }));
});

// Category legend. Indicators with an index and a name — the information the
// old pill row carried, minus the four containers it carried it in.
$('legend').innerHTML = categories
  .map(
    (c, i) => `
    <li title="${c.note}">
      <span class="lamp lit" style="--lamp-color:#2e3f59"></span>
      <b>${pad2(i + 1)}</b>
      <span>${c.name}</span>
    </li>`
  )
  .join('');

// Tally. Every figure is counted from the project list rather than typed, so
// adding a sixth project updates the hero without anyone remembering to.
const shipped = projects.filter((p) => p.status === 'SHIPPED').length;
const inDev = projects.length - shipped;
const tallyRows = [
  ['PROJECTS', pad2(projects.length)],
  ['SHIPPED', pad2(shipped)],
  ['IN DEV', pad2(inDev)],
  ['DOMAINS', pad2(disciplines.length)],
];
$('tally').innerHTML = tallyRows
  .map(([k, v]) => `<div><dt>${k}</dt><i></i><dd>${v}</dd></div>`)
  .join('');

/* ══ PANEL SWITCHES ═════════════════════════════════════════════════════
   Two controls that exist because they do something. MOTION stops the page
   moving; GRID shows the twelve columns this sheet is set on. Neither is
   decoration, which is the whole test for putting a control on a page. */

const wireToggle = (button, stateEl, initial, onChange) => {
  let on = initial;
  const apply = () => {
    button.setAttribute('aria-checked', String(on));
    stateEl.textContent = on ? 'ON' : 'OFF';
    onChange(on);
  };
  button.addEventListener('click', () => { on = !on; apply(); });
  apply();
};

wireToggle($('toggle-motion'), $('toggle-motion-state'), !prefersReducedMotion, (on) => {
  motionOff = !on;
  document.body.classList.toggle('no-motion', motionOff);
  // Rows that never got their reveal shouldn't stay invisible when motion is
  // switched off mid-page.
  if (motionOff) {
    document.querySelectorAll('.principle').forEach((el) => el.classList.add('seated', 'thrown'));
  }
});

wireToggle($('toggle-grid'), $('toggle-grid-state'), false, (on) => {
  document.body.classList.toggle('grid-on', on);
});

/* ══ PRINCIPLES ═════════════════════════════════════════════════════════ */

// Each row carries a real throw switch rather than a bullet, and the thing
// that proves it. They sit off until the row reaches you, then flip — the
// reveal is a physical state change, not a fade.
$('principles').innerHTML = principles
  .map(
    (p, i) => `
    <li class="principle">
      <span class="principle-no">P—${pad2(i + 1)}</span>
      <span class="switch" aria-hidden="true"><i></i></span>
      <span class="principle-statement">${p.statement}</span>
      <p class="principle-note">${p.note}</p>
      <span class="principle-proof"><b>${p.evidence}</b><span>${p.evidenceNote}</span></span>
    </li>`
  )
  .join('');

/* ══ SPECIFICATION SHEET ════════════════════════════════════════════════
   The same data read from two ends. BY DOMAIN answers "what do you work
   with"; BY PROJECT answers "what is this thing made of". Both are generated
   from projects[].domains, so the cross-references cannot drift apart. */

const specTable = $('spec-table');
const toolCount = disciplines.reduce((sum, d) => sum + d.items.length, 0);
$('spec-count').textContent = `${disciplines.length} DOMAINS · ${toolCount} TOOLS`;

const itemGrid = (items) => items.map((i) => `<span>${i}</span>`).join('');
const crossRefs = (list) => list.map((r) => `<span>${r}</span>`).join('<i>·</i>');

const specRow = ({ index, name, note, items, refLabel, refs, lampColor }) => `
  <div class="spec-row">
    <span class="spec-no">${pad2(index + 1)}</span>
    <div class="spec-id">
      <span class="spec-name">
        <span class="lamp lit" style="--lamp-color:${lampColor}"></span>${name}
      </span>
      <p class="spec-note">${note}</p>
    </div>
    <div class="spec-items">${itemGrid(items)}</div>
    <div class="spec-used">
      <span class="spec-used-label">${refLabel}</span>
      <span class="spec-used-list">${crossRefs(refs)}</span>
    </div>
  </div>`;

const byDomain = () =>
  disciplines
    .map((d, i) => {
      const used = projects.filter((p) => p.domains.includes(d.name)).map((p) => shortCode(p.code));
      if (d.alsoUsedIn) used.push(d.alsoUsedIn);
      return specRow({
        index: i,
        name: d.name,
        note: d.note,
        items: d.items,
        refLabel: 'USED IN',
        refs: used.length ? used : ['—'],
        lampColor: '#2e3f59',
      });
    })
    .join('');

const byProject = () =>
  projects
    .map((p, i) =>
      specRow({
        index: i,
        name: p.name,
        note: `${p.kind} · ${p.status.toLowerCase()} ${p.year}`,
        items: p.stack,
        refLabel: 'DOMAINS',
        refs: p.domains,
        lampColor: p.accent,
      })
    )
    .join('');

// The first render happens while this module is still evaluating, before the
// rail's own consts exist — calling measure() then would touch them in their
// temporal dead zone and throw. Everything after boot is a genuine re-layout.
let booted = false;

const renderSpec = (mode) => {
  specTable.innerHTML = mode === 'project' ? byProject() : byDomain();
  // Row count changes with the mode, which changes the document height, which
  // changes where the rail sits. Re-measure or the showcase drifts.
  if (booted) { measure(); trackX = null; flag(); }
};

const modeSwitch = $('mode-switch');
modeSwitch.dataset.mode = 'domain';
modeSwitch.querySelectorAll('button').forEach((button) => {
  button.addEventListener('click', () => {
    const mode = button.dataset.mode;
    if (modeSwitch.dataset.mode === mode) return;
    modeSwitch.dataset.mode = mode;
    modeSwitch
      .querySelectorAll('button')
      .forEach((b) => b.setAttribute('aria-checked', String(b === button)));
    renderSpec(mode);
  });
});
renderSpec('domain');

/* ══ SCHEMATICS ═════════════════════════════════════════════════════════
   Deliberate placeholders, not fake screenshots — abstract diagrams of what
   each project IS, labelled as schematics so nothing here reads as a claim
   about a running interface. Each sits in the card's display well; when a
   real screenshot lands at projects[].preview it replaces the whole contents
   of that well, so swapping one in needs no change to the card.

   All five share a 480×200 frame and the same stroke vocabulary, so five
   different subjects still read as one set of drawings. */

const FIG = (body) =>
  `<svg viewBox="0 0 480 200" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${body}</svg>`;

const figures = {
  // Specification in, finished datasheet out.
  datasheet: () => FIG(`
    <rect class="fig-soft" x="26" y="46" width="128" height="108" rx="6"/>
    <path class="fig-soft" d="M44 72h74M44 90h92M44 108h60M44 126h84"/>
    <path class="fig-line" d="M172 100h44"/>
    <path class="fig-line" d="M208 92l10 8-10 8"/>
    <rect class="fig-line" x="238" y="26" width="216" height="148" rx="6"/>
    <rect class="fig-fill" x="238" y="26" width="216" height="20" rx="6"/>
    <rect class="fig-fill" x="238" y="38" width="216" height="8"/>
    <path class="fig-soft" d="M256 66h180M256 82h180M256 98h180M256 114h96"/>
    <rect class="fig-line" x="352" y="106" width="84" height="52" rx="3"/>
    <circle class="fig-accent" cx="394" cy="132" r="15"/>
    <path class="fig-soft fig-dash" d="M394 110v44M372 132h44"/>
  `),

  // One log a day. The grid is the product.
  streak: () => {
    const cols = 16;
    const rows = 4;
    const size = 13;
    const gap = 5;
    const w = cols * (size + gap) - gap;
    const x0 = (480 - w) / 2;
    const y0 = 38;
    let cells = '';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // A contiguous run, filled — the shape of a streak, not a statistic.
        const filled = r < 2 || (r === 2 && c < 11);
        cells += `<rect class="${filled ? 'fig-fill' : 'fig-soft'}" x="${x0 + c * (size + gap)}" y="${
          y0 + r * (size + gap)
        }" width="${size}" height="${size}" rx="2"/>`;
      }
    }
    return FIG(`
      ${cells}
      <path class="fig-soft" d="M${x0} 156h${w}"/>
      <path class="fig-accent" d="M${x0} 148l${w * 0.28} -6 ${w * 0.24} -10 ${w * 0.22} -4 ${w * 0.26} -12"/>
      <circle class="fig-fill-dot" cx="${x0 + w}" cy="116" r="4"/>
    `);
  },

  // One gesture per photo: keep, delete, favourite.
  triage: () => FIG(`
    <rect class="fig-soft" x="186" y="42" width="108" height="122" rx="8" transform="rotate(-7 240 103)"/>
    <rect class="fig-soft" x="192" y="38" width="108" height="122" rx="8" transform="rotate(-3 246 99)"/>
    <rect class="fig-line" x="198" y="34" width="108" height="122" rx="8"/>
    <path class="fig-soft" d="M216 60h72M216 76h50"/>
    <rect class="fig-soft" x="216" y="94" width="72" height="44" rx="4"/>
    <path class="fig-line" d="M60 84l24 24M84 84l-24 24"/>
    <path class="fig-accent" d="M396 100l12 13 24-30"/>
    <path class="fig-accent fig-dash" d="M320 96c26-16 48-14 62-4"/>
    <path class="fig-accent" d="M374 84l10 8-11 7"/>
    <path class="fig-soft fig-dash" d="M108 96c-12 0-20 0-28 0"/>
  `),

  // Kernel up. Dashed because it is not built yet.
  kernel: () => FIG(`
    <circle class="fig-soft fig-dash" cx="240" cy="100" r="86"/>
    <circle class="fig-soft fig-dash" cx="240" cy="100" r="62"/>
    <circle class="fig-accent fig-dash" cx="240" cy="100" r="38"/>
    <circle class="fig-fill-dot" cx="240" cy="100" r="13"/>
    <path class="fig-soft" d="M240 6v20M240 174v20M146 100h20M314 100h20"/>
    <path class="fig-line" d="M240 62v-24M240 138v24"/>
    <rect class="fig-soft" x="40" y="88" width="46" height="24" rx="3"/>
    <rect class="fig-soft" x="394" y="88" width="46" height="24" rx="3"/>
    <path class="fig-hazard" d="M40 168h400"/>
  `),

  // Ledger on the left, stock on the right. Structure, not data.
  ledger: () => {
    let rows = '';
    for (let i = 0; i < 6; i++) {
      const y = 40 + i * 21;
      rows += `<rect class="${i === 1 ? 'fig-fill' : 'fig-soft'}" x="34" y="${y}" width="10" height="10" rx="2"/>`;
      rows += `<path class="fig-soft" d="M56 ${y + 5}h${i % 2 ? 132 : 158}"/>`;
      rows += `<path class="fig-soft" d="M212 ${y + 5}h26"/>`;
    }
    let tiles = '';
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const on = (r + c) % 2 === 0;
        tiles += `<rect class="${on ? 'fig-line' : 'fig-soft'}" x="${290 + c * 54}" y="${
          40 + r * 44
        }" width="44" height="34" rx="3"/>`;
      }
    }
    return FIG(`
      ${rows}
      ${tiles}
      <path class="fig-soft" d="M266 30v140"/>
      <rect class="fig-fill" x="290" y="84" width="44" height="34" rx="3"/>
    `);
  },
};

/* ══ PROJECT CARDS ══════════════════════════════════════════════════════ */

const track = $('track');

// Relative luminance, so a bright accent (SwipeSort's yellow) doesn't get
// white text reversed out of it at 3:1.
const isLight = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5;
};

const buildCard = (p, i) => {
  const n = pad2(i + 1);
  const cta = p.pending
    ? `<span class="card-cta" aria-disabled="true"><b>EXPLORE →</b><small>WRITE-UP SOON</small></span>`
    : `<a class="card-cta" href="${p.href}"><b>EXPLORE →</b><small>${p.code}</small></a>`;

  const classes = [
    'card',
    p.underConstruction ? 'card--wip' : '',
    isLight(p.accent) ? 'card--light-accent' : '',
  ].filter(Boolean).join(' ');

  return `
    <article class="${classes}" style="--accent:${p.accent}" data-index="${i}">
      <div class="card-face">
        <header class="card-plate">
          <span class="card-no">${n}</span>
          <span class="card-code">${p.code}</span>
          <span class="card-plate-rule"></span>
          <span class="card-status">
            <span class="lamp ${p.underConstruction ? 'pending' : 'lit'}" style="--lamp-color:${p.accent}"></span>
            ${p.status} · ${p.year}
          </span>
        </header>

        <figure class="card-display" data-window>
          <span class="card-display-tag">FIG. ${n}</span>
          <span class="card-display-note">SCHEMATIC — PLACEHOLDER</span>
          <div class="card-display-art">${(figures[p.figure] || figures.datasheet)()}</div>
        </figure>

        <div class="card-id">
          <h3 class="card-name">${p.name}</h3>
          <p class="card-kind">${p.kind}</p>
        </div>

        <p class="card-blurb">${p.blurb}</p>

        <dl class="card-specs">
          ${p.specs.map(([k, v]) => `<div><dt>${k}</dt><i></i><dd>${v}</dd></div>`).join('')}
        </dl>

        <div class="card-foot">
          <div class="card-stack">
            <span class="card-stack-label">STACK</span>
            <span class="card-stack-list">${p.stack
              .map((s) => `<span>${s}</span>`)
              .join('<i>·</i>')}</span>
          </div>
          ${cta}
        </div>
      </div>
    </article>`;
};

track.innerHTML = projects.map(buildCard).join('');

// Swap in a real preview the moment one exists at the data-driven path. The
// schematic stays until the file both exists and decodes, so a 404 never
// leaves an empty well — and dropping a file in later needs no layout change.
track.querySelectorAll('[data-window]').forEach((win, i) => {
  const src = projects[i].preview;
  if (!src) return;
  const img = new Image();
  img.loading = 'lazy';
  img.decoding = 'async';
  img.alt = `${projects[i].name} preview`;
  img.onload = () => {
    win.innerHTML = '';
    win.classList.add('has-image');
    win.appendChild(img);
  };
  img.src = src;
});

/* ══ MANIFEST ═══════════════════════════════════════════════════════════
   The index of work, as an index — the whole set legible before the rail
   takes over. Each row is also a selector: picking one drives the rail to
   that project, exactly as turning the dial does. */

const manifest = $('manifest');
manifest.innerHTML = `
  <div class="manifest-head" aria-hidden="true">
    <span>#</span>
    <span>PROJECT</span>
    <span class="manifest-col-kind">TYPE</span>
    <span>CODE</span>
    <span>YEAR</span>
    <span>STATUS</span>
  </div>
  ${projects
    .map(
      (p, i) => `
      <button
        type="button"
        class="manifest-row"
        data-index="${i}"
        style="--accent:${p.accent};--accent-ink:color-mix(in srgb, ${p.accent} 55%, #1e2c42)"
      >
        <span class="manifest-no">${pad2(i + 1)}</span>
        <span class="manifest-name">${p.name}</span>
        <span class="manifest-kind">${p.kind}</span>
        <span class="manifest-code">${p.code}</span>
        <span class="manifest-year">${p.year}</span>
        <span class="manifest-state">
          <span class="lamp ${p.underConstruction ? 'pending' : 'lit'}" style="--lamp-color:${p.accent}"></span>
          ${p.status}
        </span>
      </button>`
    )
    .join('')}
`;
const manifestRows = [...manifest.querySelectorAll('.manifest-row')];

/* ══ SELECTOR DIAL ══════════════════════════════════════════════════════ */

const cards = [...track.querySelectorAll('.card')];
const dialTicks = $('dial-ticks');
const dialKnob = $('dial-knob');
const dialNotch = dialKnob.querySelector('.dial-notch');
const readoutIndex = $('readout-index');
const readoutName = $('readout-name');
const readoutKind = $('readout-kind');
$('readout-total').textContent = pad2(projects.length);

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

// Detent ladder: the dial's five positions, drawn. A detent you can see
// should be a detent you can pick, so each segment is a button.
const ladder = $('ladder');
ladder.innerHTML = projects
  .map(
    (p, i) =>
      // The ladder duplicates the dial, which is the accessible control, so it
      // stays out of the tab order rather than adding five redundant stops.
      `<button type="button" data-index="${i}" style="--ladder-color:${p.accent}" tabindex="-1"></button>`
  )
  .join('');
const ladderCells = [...ladder.querySelectorAll('button')];

/* ══ THE DIAL IS A CONTROL ══════════════════════════════════════════════
   Grab it and turn it and the rail follows. It does not animate the track
   itself — it converts the angle into a scroll position and moves the page.
   That keeps scroll as the single source of truth for where the rail is, so
   dragging, scrolling, the ladder, the manifest and the keyboard can never
   disagree about it. */

const dial = $('dial');
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
  dragStartProgress = railProgress();
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
  const current = railProgress();
  const next = jump !== undefined ? jump : clamp01(Math.round(current * steps + step) / steps);
  goToProject(next * steps);
});

// One way in for every selector on the page. On a stacked layout the rail
// doesn't exist, so a pick scrolls to the card itself instead.
function goToProject(index) {
  const i = Math.max(0, Math.min(steps, Math.round(index)));
  const behavior = motionOff ? 'auto' : 'smooth';
  if (cache.stacked) {
    cards[i]?.scrollIntoView({ behavior, block: 'center' });
    return;
  }
  window.scrollTo({ top: scrollForProgress(i / steps), behavior });
}

manifestRows.forEach((row) =>
  row.addEventListener('click', () => goToProject(Number(row.dataset.index)))
);
ladderCells.forEach((cell) =>
  cell.addEventListener('click', () => goToProject(Number(cell.dataset.index)))
);

/* ══ BUILD PLATE ════════════════════════════════════════════════════════ */

$('build-plate').innerHTML = buildPlate
  .map(([k, v]) => `<div><dt>${k}</dt><i></i><dd>${v}</dd></div>`)
  .join('');

/* ══ RAIL GEOMETRY ══════════════════════════════════════════════════════ */

const rail = $('rail');

// Pin length grows with the collection so adding a project lengthens the
// scroll instead of speeding the whole thing up.
const DWELL_VH = 106;
rail.style.setProperty('--rail-height', `${100 + (projects.length - 1) * DWELL_VH}vh`);

// Measured, not assumed: card widths are clamped in CSS, so the only reliable
// source for "where does card i sit" is the laid-out DOM.
const trackViewport = $('track-viewport');
let geometry = { start: 0, end: 0, centers: [], fit: 1 };
// Layout values, read once in measure() and never inside the frame loop.
const cache = {
  viewportH: 0, focusX: 0, stacked: false, docMax: 0,
  sectionTops: [], stickyTop: 0, stageHeight: 1, falloff: 1,
};
let trackTarget = 0;
// Set by measure(); forces one more frame so a re-measure is always applied,
// even when the page is sitting still.
let geometryDirty = true;

// The cards are content-sized; the stage is viewport-sized. Browser zoom, a
// laptop screen, or a fourth spec row all make the first exceed the second, and
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
  // this runs a few times. Five passes rather than REV. A's three: this card
  // carries more text, so the correction takes an extra round or two to land
  // inside a pixel. It converges — the later passes are a correction, not a
  // search — and the display well is a fixed height precisely so that its own
  // size can't join the feedback loop.
  for (let pass = 0; pass < 5; pass++) {
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
// is exactly what micro-jitter is. Nothing in frame() may read layout.
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
  // the stage's sticky `top`. The stage is shorter than the viewport (it sits
  // between the two floating chrome panels), so using `rail.offsetHeight -
  // viewportH` runs out early: progress reaches 1 before the pin releases, and
  // with the easing lag the last card never arrives at centre before the page
  // scrolls on.
  const stage = document.querySelector('.rail-stage');
  cache.stickyTop = parseFloat(getComputedStyle(stage).top) || 0;
  cache.stageHeight = stage.offsetHeight;
  // Any re-measure changes where the cards sit, so the loop must run at least
  // one more frame even if nothing scrolled — otherwise it stays parked on the
  // target it computed under the old geometry.
  geometryDirty = true;
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

// Read live from the DOM rather than from cached scroll arithmetic. A cached
// version depends on measure() having run since the last thing that moved the
// document — a late font, a resize, an image finally decoding, the spec table
// changing mode — and any miss leaves the mapping silently wrong. A single
// getBoundingClientRect at the top of the frame, before any style writes,
// costs nothing and cannot go stale.
function railMetrics() {
  const rect = rail.getBoundingClientRect();
  return {
    travelled: cache.stickyTop - rect.top,
    range: Math.max(1, rail.offsetHeight - cache.stageHeight),
    docTop: window.scrollY + rect.top,
  };
}

function railProgress() {
  const { travelled, range } = railMetrics();
  return clamp01((travelled / range - RAIL_LEAD) / (1 - RAIL_LEAD - RAIL_TAIL));
}

// Inverse of the above: where must the page be scrolled for the rail to sit at
// `p`? Used by every selector, which all drive the scroll position rather than
// fighting it with a second source of truth for where the track is.
function scrollForProgress(p) {
  const { range, docTop } = railMetrics();
  const raw = clamp01(p) * (1 - RAIL_LEAD - RAIL_TAIL) + RAIL_LEAD;
  return docTop - cache.stickyTop + raw * range;
}

/* ══ FRAME LOOP ═════════════════════════════════════════════════════════ */

const statusSection = $('status-section');
const statusIndex = $('status-index');
const statusFill = $('status-fill');
const statusPct = $('status-pct');
const sections = [...document.querySelectorAll('main > section, main > footer')];
const sectionNames = ['HERO', 'PHILOSOPHY', 'SPECIFICATION', 'INDEX OF WORK', 'COLOPHON'];

const pointer = { x: 0.5, y: 0.5, active: false, dirty: true };
let trackX = null;      // smoothed, so wheel steps don't read as stutter
let lastReadout = -1;
let lastScrollY = -1;
let lastPct = -1;
let lastSection = -1;
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

  // The target has to be computed BEFORE the idle check, because the idle check
  // is asking "is the track where it should be?" — a question you cannot answer
  // against a target from whenever the loop last happened to run. Computing it
  // afterwards means that once the track converges the loop parks and keeps
  // comparing to a stale value; any later re-measure then moves the cards with
  // nothing noticing, and the last card sits off-centre for good.
  const nextTarget = cache.stacked
    ? trackTarget
    : lerp(geometry.start, geometry.end, railProgress());

  const scrolled = scrollY !== lastScrollY;
  const settling = trackX !== null && Math.abs(trackX - nextTarget) > 0.05;
  if (!scrolled && !settling && !pointer.dirty && !geometryDirty) return;
  lastScrollY = scrollY;
  pointer.dirty = false;
  geometryDirty = false;
  trackTarget = nextTarget;

  // ── document progress readout ──
  const docProgress = cache.docMax > 0 ? Math.min(1, scrollY / cache.docMax) : 0;
  // scaleX, not width: width is a layout property, so animating it re-lays out
  // the status bar every single frame.
  statusFill.style.transform = `scaleX(${docProgress.toFixed(4)})`;
  const pct = Math.round(docProgress * 100);
  if (pct !== lastPct) {
    lastPct = pct;
    statusPct.textContent = `${pad2(pct)}%`;
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
  if (current !== lastSection) {
    lastSection = current;
    statusSection.textContent = sectionNames[current] || '';
    statusIndex.textContent = `${pad2(current + 1)}/${pad2(sections.length)}`;
  }

  // ── the rail ──
  if (!cache.stacked) {
    const p = railProgress();

    // Exponential damping toward the target: the carriage keeps its sense of
    // mass, but the amount of smoothing per second is constant regardless of
    // how long the frame took.
    const ease = motionOff ? 1 : 1 - Math.exp(-13 * delta);
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
      if (pointer.active && !motionOff && emph > 0.12) {
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
      const project = projects[nearest];
      readoutIndex.textContent = pad2(nearest + 1);
      readoutName.textContent = project.name.toUpperCase();
      readoutKind.textContent = project.kind;
      // Every indicator takes the colour of whatever it is pointing at.
      dialNotch.style.setProperty('--dial-color', project.accent);
      dial.setAttribute('aria-valuenow', String(nearest + 1));
      dial.setAttribute('aria-valuetext', project.name);
      ladderCells.forEach((cell, i) => cell.classList.toggle('live', i === nearest));
      manifestRows.forEach((row, i) => row.classList.toggle('live', i === nearest));
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

// Principle rows seat themselves once, then stop costing anything.
const seatObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('seated');
      seatObserver.unobserve(entry.target);
      // Row lands first, switch throws a beat later — the order reads as cause
      // and effect rather than one simultaneous animation.
      setTimeout(() => entry.target.classList.add('thrown'), motionOff ? 0 : 260);
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

if (motionOff) document.body.classList.add('no-motion');

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

booted = true;

requestAnimationFrame(frame);
