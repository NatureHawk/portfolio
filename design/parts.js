// HUM — the object vocabulary.
//
// Every note, tile, comment and swatch on the page is built here, from the data
// in content.js. Two reasons it is one module rather than markup in the HTML:
//
//   · The same note appears in the hero, in section 03, in the workspace and on
//     the desk in section 07. Written once, it cannot drift into four slightly
//     different notes.
//   · The canvas objects only make sense with behaviour attached (drag, tilt,
//     lift). Building them in JS keeps the thing and its behaviour in one place.
//
// ART is deliberately procedural. Placeholder images are where a page like this
// usually starts looking like a template — a stock photograph, or worse, a grey
// box with a mountain icon. These are small risograph-ish prints drawn in CSS:
// no requests, no assets, and they belong to this page and no other.

import { el } from './motion.js';
import { byId } from './content.js';

/* ── ART ─────────────────────────────────────────────────────────────────── */
const ART = {
  // A half-arch over two bars. Reads as a cover, at any size.
  arc: () => `
    <span class="art-arc"></span>
    <span class="art-bar art-bar--a"></span>
    <span class="art-bar art-bar--b"></span>`,
  // A dot field. This one is also the grid motif the whole page is set on.
  dots: () => '<span class="art-dots"></span>',
  // A halftone gradient — dense at one corner, open at the other.
  halftone: () => '<span class="art-halftone"></span>',
  // Ruled diagonals, the way a plate is hatched.
  stripe: () => '<span class="art-stripe"></span>',
  // Four colours of the page, as ink drawdowns.
  swatch: () => `
    <span class="art-chips">
      <i style="--c: var(--ink)"></i>
      <i style="--c: var(--accent)"></i>
      <i style="--c: var(--paper-deep)"></i>
      <i style="--c: var(--ink-soft)"></i>
    </span>`,
};

export const art = (name) => `<span class="art art--${name}">${ART[name]?.() ?? ''}</span>`;

/* ── SHARED CHROME ───────────────────────────────────────────────────────
   The label strip along the top of a canvas object: what it is on the left,
   the grab handle on the right. The handle is the affordance — it is the only
   reason anyone believes the object can be moved before they try. */
const head = (label, { handle = true } = {}) => `
  <span class="obj-head">
    <span class="obj-label">${label}</span>
    ${handle ? '<span class="obj-handle" aria-hidden="true"><i></i><i></i><i></i></span>' : ''}
  </span>`;

/* Selection furniture. Drawn on demand by the choreography in section 03 when
   a collaborator selects an object, and by the hero when MARA grabs the note. */
export const selectionFrame = (name, tone) => {
  const node = el('span', `sel sel--${tone}`);
  node.innerHTML = `
    <i class="sel-c sel-c--tl"></i><i class="sel-c sel-c--tr"></i>
    <i class="sel-c sel-c--bl"></i><i class="sel-c sel-c--br"></i>
    <span class="sel-tag">${name}</span>`;
  node.setAttribute('aria-hidden', 'true');
  return node;
};

/* ── OBJECT BODIES ───────────────────────────────────────────────────────
   Each builder returns inner HTML only. `object()` below owns the shell, the
   positioning custom properties and the accessible name, so a new object kind
   is one entry here and nothing else. */
const BODY = {
  note: (d) => `
    ${head(d.label)}
    <span class="note-body">${d.body ?? ''}</span>
    <span class="note-pin" aria-hidden="true"></span>`,

  tile: (d) => `
    ${head(d.label)}
    ${art(d.art ?? 'arc')}
    ${d.meta ? `<span class="obj-foot"><span>${d.meta}</span><span class="obj-foot-dot"></span></span>` : ''}`,

  swatch: (d) => `
    ${head(d.label)}
    ${art('swatch')}
    <span class="obj-foot"><span>SPRING / 04</span><span class="obj-foot-dot"></span></span>`,

  shape: (d) => `
    ${head(d.label, { handle: false })}
    ${art(d.art ?? 'dots')}`,

  comment: (d) => {
    const person = byId(d.author);
    return `
      <span class="cm-top">
        <span class="cm-avatar" data-tone="${person?.tone ?? 'ink'}">${person?.initials ?? '??'}</span>
        <span class="cm-name">${person?.name ?? ''}</span>
        <span class="cm-time">NOW</span>
      </span>
      <span class="cm-body">${d.body ?? ''}</span>
      <span class="cm-tail" aria-hidden="true"></span>`;
  },

  // A block of display type, editable-looking. The word lives in its own span
  // so section 03 can retype it without touching the frame around it.
  type: (d) => `
    ${head(d.label)}
    <span class="tb"><span class="tb-word" data-word>${d.body ?? ''}</span><i class="tb-caret" aria-hidden="true"></i></span>`,

  doc: (d) => `
    ${head(d.title, { handle: true })}
    <span class="doc-lines" aria-hidden="true">
      <i style="--w: 92%"></i><i style="--w: 78%"></i><i style="--w: 86%"></i>
      <i style="--w: 44%"></i><i style="--w: 81%"></i><i style="--w: 62%"></i>
    </span>
    <span class="obj-foot"><span>${d.meta ?? ''}</span><span class="obj-foot-dot"></span></span>`,

  task: (d) => `
    ${head('TASK')}
    <span class="task-row">
      <span class="task-box${d.done ? ' is-done' : ''}" aria-hidden="true"><i>✓</i></span>
      <span class="task-title${d.done ? ' is-done' : ''}">${d.title}</span>
    </span>
    <span class="obj-foot"><span>${d.meta ?? ''}</span><span class="obj-foot-dot"></span></span>`,

  ref: (d) => `
    ${head('REFERENCE')}
    <span class="ref-body">
      <span class="ref-title">${d.title}</span>
      <span class="ref-arrow" aria-hidden="true">↗</span>
    </span>
    <span class="obj-foot"><span>${d.meta ?? ''}</span><span class="obj-foot-dot"></span></span>`,

  sketch: (d) => `
    ${head('SKETCH')}
    ${art(d.art ?? 'stripe')}
    <span class="obj-foot"><span>${d.meta ?? ''}</span><span class="obj-foot-dot"></span></span>`,
};

/* Builds one canvas object.
   TWO NESTED ELEMENTS, ON PURPOSE. The outer `.obj` is placed with `--x/--y`
   and belongs to the drag layer, which owns its `transform` outright. The inner
   `.obj-in` carries the resting rotation and the hover tilt. Collapse them into
   one node and dragging fights hovering over the same declaration — which looks
   exactly like a bug and is impossible to ease out of. */
export function object(data, { positioned = true } = {}) {
  const node = el('div', `obj obj--${data.kind}`);
  node.dataset.obj = data.id;
  if (data.tone) node.dataset.tone = data.tone;
  if (data.cat) node.dataset.cat = data.cat;

  if (positioned) {
    node.style.setProperty('--x', `${data.x ?? 0}%`);
    node.style.setProperty('--y', `${data.y ?? 0}%`);
  }
  if (data.w) node.style.setProperty('--w', `${data.w}px`);

  const inner = el('div', 'obj-in');
  inner.dataset.rot = String(data.rot ?? 0);
  inner.style.setProperty('--rot', `${data.rot ?? 0}deg`);
  inner.innerHTML = BODY[data.kind]?.(data) ?? '';
  node.appendChild(inner);

  if (data.drag) {
    node.dataset.drag = 'true';
    node.tabIndex = 0;
    node.setAttribute('role', 'button');
    node.setAttribute(
      'aria-label',
      `${data.label ?? data.title ?? data.kind} — drag to move, or use arrow keys`
    );
  }
  return node;
}

/* ── PRESENCE CURSOR ─────────────────────────────────────────────────────
   An arrow and a name flag. The flag is what makes it a person rather than a
   pointer, so it never renders without one. */
export function cursorNode(person) {
  const node = el('div', `pcur pcur--${person.tone}`);
  node.dataset.who = person.id;
  node.setAttribute('aria-hidden', 'true');
  node.innerHTML = `
    <svg class="pcur-arrow" viewBox="0 0 20 22" width="20" height="22" aria-hidden="true">
      <path d="M2 1.4 17.4 12.2 10.3 12.8 8.2 20.2Z" />
    </svg>
    <span class="pcur-flag">${person.name}</span>
    <span class="pcur-ping" aria-hidden="true"></span>`;
  return node;
}

/* ── AVATAR ──────────────────────────────────────────────────────────────── */
export function avatar(person, { live = true } = {}) {
  const node = el('span', 'av');
  node.dataset.tone = person.tone;
  node.innerHTML = `<b>${person.initials}</b>${live ? '<i class="av-live"></i>' : ''}`;
  node.title = `${person.name} — ${person.role}`;
  return node;
}
