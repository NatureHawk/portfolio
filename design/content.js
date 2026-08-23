// HUM — the data.
//
// COPY IS NOT IN HERE. Every headline, lede and label on this page is written in
// design.html, where it is crawlable, translatable and visible with JavaScript
// switched off; the modules read it out of the DOM and animate what they find.
// What lives here is the material the page could not express as markup: where
// objects sit on a canvas, who is in the room, and the score the collaboration
// demo is played from.
//
// Positions are percentages of their stage, so one set of numbers holds at every
// width. `m` is the phone composition — not a shrunk copy of the desktop one,
// the same objects placed again for a tall narrow frame.

/* ── PEOPLE ────────────────────────────────────────────────────────────────
   The cast. Four, because five is a crowd on a canvas this size and three does
   not read as a studio. `tone` picks the cursor's material: the accent is spent
   on exactly one collaborator, so the canvas never becomes a colour chart. */
export const people = [
  { id: 'mara', name: 'MARA', role: 'ART DIRECTION', tone: 'accent', initials: 'MK' },
  { id: 'alex', name: 'ALEX', role: 'MOTION', tone: 'ink', initials: 'AV' },
  { id: 'juno', name: 'JUNO', role: 'RESEARCH', tone: 'outline', initials: 'JO' },
  { id: 'you', name: 'YOU', role: 'THIS BROWSER', tone: 'you', initials: 'Y' },
];

export const byId = (id) => people.find((p) => p.id === id);

/* ── SECTION SPINE ───────────────────────────────────────────────────────
   The status strip and the nav both read this, so the page can never disagree
   with itself about which section you are in. */
export const sections = [
  { id: 'hero', no: '01', label: 'ALIVE' },
  { id: 'still', no: '02', label: 'NOT STATIC' },
  { id: 'moves', no: '03', label: 'EVERYTHING MOVES' },
  { id: 'together', no: '04', label: 'MAKE SOMETHING' },
  { id: 'product', no: '05', label: 'THE WORKSPACE' },
  { id: 'faster', no: '06', label: 'COLLABORATION' },
  { id: 'everything', no: '07', label: 'ONE PLACE' },
  { id: 'start', no: '08', label: 'START' },
];

/* ── 01 · HERO CANVAS ────────────────────────────────────────────────────
   The composition is built around the fact that the third headline line is
   short: ALIVE. leaves the right two thirds of its row empty, and the cluster
   goes there. The two objects at the top right sit in the margin the first two
   lines leave. Nothing is centred and nothing is square. */
export const heroObjects = [
  {
    kind: 'shape', id: 'h-shape', x: 76, y: 1, rot: -2.4, w: 116, art: 'dots',
    label: 'SHAPE', drag: true, m: { x: 58, y: 1 },
  },
  {
    kind: 'tile', id: 'h-tile', x: 65, y: 18, rot: 2.2, w: 226, art: 'arc',
    label: 'IMAGE / 2400x3000', meta: 'cover-study-04.png', drag: true, m: { x: 36, y: 28 },
  },
  {
    kind: 'swatch', id: 'h-swatch', x: 79, y: 55, rot: -1.6, w: 164,
    label: 'PALETTE', drag: true, m: { x: 48, y: 22 },
  },
  {
    kind: 'note', id: 'h-note', x: 34, y: 70, rot: -3.4, w: 188, tone: 'accent',
    label: 'NOTE / MARA', body: 'what if the page moved while you read it', drag: true,
    m: { x: 0, y: 54 },
  },
  {
    kind: 'comment', id: 'h-comment', x: 62, y: 76, rot: 1.1, w: 214,
    author: 'juno', body: '71% never scroll past the fold. so move the fold.', drag: true,
    m: { x: 16, y: 76 },
  },
];

/* ── 03 · EVERYTHING MOVES ───────────────────────────────────────────────
   A choreographed demonstration, written as a score. Each beat says who acts,
   what they act on, and what the session log should say about it — so the log is
   never a second list that can drift out of step with the animation.
   `at` is milliseconds from the start of the take. */
export const movesBoard = [
  { id: 'm-cover', kind: 'tile', x: 5, y: 10, w: 184, rot: -2, art: 'arc', label: 'COVER', m: { x: 4, y: 6 } },
  { id: 'm-type', kind: 'type', x: 44, y: 16, w: 244, rot: 0, label: 'TYPE', body: 'FEEL ALIVE', m: { x: 30, y: 40 } },
  { id: 'm-note', kind: 'note', x: 57, y: 58, w: 170, rot: 3, tone: 'accent', label: 'NOTE', body: 'louder', m: { x: 8, y: 68 } },
  { id: 'm-grid', kind: 'shape', x: 9, y: 58, w: 142, rot: 1, art: 'dots', label: 'GRID', m: { x: 62, y: 20 } },
];

export const movesScore = [
  { at: 400, who: 'mara', act: 'move', target: 'm-cover', to: { x: 22, y: 30 }, log: 'moved COVER' },
  { at: 1900, who: 'alex', act: 'select', target: 'm-type', log: 'selected TYPE' },
  { at: 2800, who: 'alex', act: 'retype', target: 'm-type', to: 'MOVE ALIVE', log: 'edited TYPE' },
  { at: 4200, who: 'juno', act: 'note', target: 'm-note', log: 'pinned a note' },
  { at: 5300, who: 'mara', act: 'link', from: 'm-cover', target: 'm-type', log: 'linked COVER to TYPE' },
  { at: 6600, who: 'you', act: 'arrive', target: 'm-grid', log: 'joined the room' },
];

/* Where each collaborator waits before their first beat. */
export const movesHome = {
  mara: { x: 14, y: 74 },
  alex: { x: 78, y: 22 },
  juno: { x: 86, y: 72 },
  you: { x: 30, y: 88 },
};

/* ── 05 · THE WORKSPACE ─────────────────────────────────────────────────── */
export const projects = [
  { id: 'living', name: 'THE LIVING ISSUE', kind: 'EDITORIAL', live: 3, updated: 'NOW' },
  { id: 'atlas', name: 'ATLAS REBRAND', kind: 'IDENTITY', live: 1, updated: '12M' },
  { id: 'kiosk', name: 'KIOSK / MOTION', kind: 'MOTION', live: 0, updated: '2H' },
  { id: 'field', name: 'FIELD NOTES 07', kind: 'RESEARCH', live: 0, updated: 'YDAY' },
];

export const assets = [
  { name: 'cover-study-04.png', kind: 'IMAGE', size: '2.1 MB', art: 'arc' },
  { name: 'living-grid.svg', kind: 'VECTOR', size: '18 KB', art: 'dots' },
  { name: 'halftone-plate.tif', kind: 'IMAGE', size: '8.4 MB', art: 'halftone' },
  { name: 'type-specimen.pdf', kind: 'DOC', size: '410 KB', art: 'stripe' },
  { name: 'palette-spring.aco', kind: 'COLOUR', size: '2 KB', art: 'swatch' },
  { name: 'kiosk-loop.mp4', kind: 'VIDEO', size: '14 MB', art: 'arc' },
];

export const activity = [
  { who: 'mara', what: 'moved COVER into the grid', when: 'NOW' },
  { who: 'alex', what: 'changed TYPE to MOVE ALIVE', when: '4S' },
  { who: 'juno', what: 'pinned a note on THE LIVING ISSUE', when: '31S' },
  { who: 'mara', what: 'linked COVER to TYPE', when: '1M' },
  { who: 'you', what: 'joined the room', when: '1M' },
  { who: 'alex', what: 'dropped six assets', when: '3M' },
];

/* The objects on the workspace's own canvas tab — a smaller, calmer set than
   the hero's, because this one is furniture inside a UI rather than the subject. */
export const appCanvasObjects = [
  { kind: 'tile', id: 'a-tile', x: 4, y: 8, rot: -1.6, w: 168, art: 'arc', label: 'COVER', drag: true, m: { x: 0, y: 2 } },
  { kind: 'note', id: 'a-note', x: 44, y: 14, rot: 2.4, w: 158, tone: 'accent', label: 'NOTE / MARA', body: 'crop tighter', drag: true, m: { x: 44, y: 14 } },
  { kind: 'shape', id: 'a-shape', x: 76, y: 44, rot: -1, w: 116, art: 'dots', label: 'GRID', drag: true, m: { x: 2, y: 54 } },
  { kind: 'doc', id: 'a-doc', x: 22, y: 54, rot: 1.4, w: 176, title: 'THE LIVING ISSUE', meta: 'BRIEF / 6 PP', drag: true, m: { x: 42, y: 58 } },
];

/* ── 06 · COLLABORATION ──────────────────────────────────────────────────
   The word four people take turns pushing into the same object. It ends where
   it started, so the loop has no seam. */
export const wordCycle = ['ALIVE', 'AWAKE', 'MOVING', 'ALIVE'];

/* ── 07 · THE DESK ───────────────────────────────────────────────────────
   Nine loose things. `cat` is what the filters sort on. The scatter is hand
   placed rather than generated: a random spread reliably produces two objects
   sitting almost on top of each other and one marooned in a corner. */
export const deskItems = [
  { id: 'e1', cat: 'NOTES', kind: 'note', title: 'move the fold', body: 'move the fold', label: 'NOTE / MARA', meta: 'MARA / 2M', x: 2, y: 4, rot: -4, w: 196, tone: 'accent', drag: true, m: { x: 2, y: 1 } },
  { id: 'e2', cat: 'IMAGES', kind: 'tile', label: 'COVER-STUDY-04', meta: '2400x3000', x: 26, y: 1, rot: 2, w: 204, art: 'arc', drag: true, m: { x: 40, y: 10 } },
  { id: 'e3', cat: 'DOCS', kind: 'doc', title: 'THE LIVING ISSUE', meta: 'BRIEF / 6 PP', x: 55, y: 3, rot: -2, w: 202, drag: true, m: { x: 3, y: 21 } },
  { id: 'e4', cat: 'IMAGES', kind: 'tile', label: 'HALFTONE-PLATE', meta: '8.4 MB', x: 78, y: 50, rot: 4, w: 182, art: 'halftone', drag: true, m: { x: 42, y: 32 } },
  { id: 'e5', cat: 'TASKS', kind: 'task', title: 'Set the poster grid', meta: 'ALEX / TODAY', x: 2, y: 58, rot: 3, w: 208, done: false, drag: true, m: { x: 2, y: 43 } },
  { id: 'e6', cat: 'NOTES', kind: 'note', body: 'louder, then quieter', label: 'NOTE / JUNO', meta: 'JUNO / 9M', x: 44, y: 46, rot: -5, w: 174, tone: 'paper', drag: true, m: { x: 40, y: 54 } },
  { id: 'e7', cat: 'DOCS', kind: 'ref', title: 'scroll-depth study', meta: 'JUNO / 21M', x: 21, y: 30, rot: 1, w: 192, drag: true, m: { x: 4, y: 65 } },
  { id: 'e8', cat: 'IMAGES', kind: 'sketch', label: 'SKETCH', meta: 'MARA / SKETCH', x: 56, y: 68, rot: -3, w: 196, art: 'stripe', drag: true, m: { x: 38, y: 76 } },
  { id: 'e9', cat: 'TASKS', kind: 'task', title: 'Ship issue 04', meta: 'MARA / FRI', x: 80, y: 4, rot: -6, w: 186, done: true, drag: true, m: { x: 6, y: 87 } },
];
