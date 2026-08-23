// 01 · HUM — the top-left corner, and the only world that is actually built.
//
// This module does not create anything. HUM is the document: the header, the
// eight sections and the status strip that were already in design.html. What it
// adds is the two halves of a portal transition that the other three get for
// free from frame.js — how HUM LEAVES, and how it comes back.
//
// THE DEPARTURE IS PER-DESTINATION, and that is the point of the file. There is
// no generic `transitionOut`. There is a table:
//
//   → 02  the canvas is pulled apart: whatever objects and cursors you can see
//         accelerate into the top-right corner, nearest first.
//   → 03  the typography goes first: the display lines stretch towards the
//         bottom-left and hand over to KILN's letterform.
//   → 04  the objects scatter outward for a frame, then fall into the corner —
//         the screen coming apart before DRIFT reassembles it.
//
// Adding a fifth is adding a row. Nothing else in the system changes.
//
// WHAT MAY BE ANIMATED, AND WHAT MAY NOT. Canvas objects are two nested
// elements for a reason (see canvas.js): the outer `.obj` transform belongs to
// the drag layer and to nothing else. So every gesture here writes to `.obj-in`,
// and every value written is snapshotted first and put back on the way in — a
// visitor who leaves and returns must find the canvas exactly as they left it,
// including anything they had moved by hand.

import { utils, motion, EASE, $, $$ } from '../motion.js';
import { towards, onScreen, pullTo } from './corners.js';

/* WHERE A THING BELONGS.
   The way back is not a recording of where an element was when it left — it is
   the state the page defines as that element's rest. Recording would be the
   obvious choice and it is wrong twice over: leave again while the return is
   still settling and the recording captures a half-finished entrance, which then
   becomes the element's new idea of "home" forever.

   So rest is DERIVED. The chrome, the page and every object's inner card have a
   rest that this page states outright (see enterObjects in canvas.js, and the
   resting angle each object carries in its own dataset). The one exception is a
   collaborator's cursor, whose position is genuinely wherever the hero's script
   left it — and which nothing else animates, so reading it is always safe. */
function restFor(node) {
  // A collaborator's cursor has no defined rest — where it is, and whether it is
  // there at all, is whatever the hero's script last decided. Reading it back is
  // safe here in a way it is not for anything else, because nothing animates
  // these on the way IN: a departure interrupting an arrival cannot catch one
  // of them halfway through anything.
  if (node.classList.contains('pcur')) {
    return {
      x: utils.get(node, 'x'),
      y: utils.get(node, 'y'),
      scale: utils.get(node, 'scale'),
      opacity: utils.get(node, 'opacity'),
    };
  }
  const rest = { x: 0, y: 0, scale: 1, opacity: 1 };
  const shell = node.classList.contains('obj-in') ? node.closest('.obj') : null;
  if (shell) rest.rotate = Number(shell.dataset.rot || 0);
  return rest;
}

const spec = {
  id: '01',
  corner: 'tl',
  name: 'HUM',
  kicker: 'SHARED CANVAS',
  paper: '#f1eee5',
  ink: '#15150f',
  accent: '#cbf03c',
  title: 'HUM — The internet should feel alive.',

  // Coming home is the plain sweep, in HUM's own paper and highlighter.
  portal: { variant: 'sweep', fill: '#f1eee5', edge: '#cbf03c' },
};

spec.mount = () => {
  const root = $('#world-01');
  if (!root) return null;

  const chrome = [$('#top'), $('#strip')].filter(Boolean);
  const page = $('main', root);

  // Keyed by node so a thing touched by two gestures in one departure is only
  // remembered once, and remembered as it was before either of them ran.
  const restore = new Map();
  const remember = (nodes) => {
    for (const node of nodes) if (!restore.has(node)) restore.set(node, restFor(node));
  };
  let scrollY = 0;

  /* ── PIECES ────────────────────────────────────────────────────────────
     Chosen at the moment of departure, not at boot: what is on screen when
     somebody reaches for a corner depends entirely on where they had scrolled
     to, and animating the hero while they are reading section 06 is work with
     no audience. */
  const objectsInView = (corner, limit) => onScreen($$('.obj', root), { corner, limit });
  /* Cursors that have already left are still in the document, still have a
     rectangle, and are invisible. Pulling one into the portal is work nobody
     sees; putting it back is worse, because it would arrive as a ghost of
     somebody who had politely gone. */
  const cursorsInView = (corner, limit) => {
    const live = $$('.pcur-layer .pcur', root).filter((node) => Number(utils.get(node, 'opacity')) > 0.1);
    return onScreen(live, { corner, limit });
  };
  const linesInView = (corner, limit) =>
    onScreen($$('.hero-title .tl-in, .h2 .tl-in, .cta-title .tl-in', root), { corner, limit });

  const inner = (item) => item.node.querySelector('.obj-in') ?? item.node;

  /* The gesture every departure is made of: a thing leaves towards the corner,
     losing a little size on the way, and the ones nearest the portal go first.
     Short on purpose — this is the first 300ms of a 600ms transition and it has
     to be finished before the portal covers it. */
  function pull(timeline, items, corner, { at = 0, step = 26, scale = 0.9, reach = 0.62, spin = 0, nodeOf = inner } = {}) {
    if (!items.length) return;
    remember(items.map(nodeOf));

    items.forEach((item, i) => {
      const vector = pullTo(item, corner, { reach });
      const props = {
        x: '+=' + vector.x.toFixed(1),
        y: '+=' + vector.y.toFixed(1),
        scale,
        opacity: 0,
        duration: 340,
        ease: EASE.exit,
      };
      // Only when asked for: a property set to `undefined` is still a property
      // anime will try to tween, and it tweens it to nothing.
      if (spin) props.rotate = '+=' + (i % 2 ? spin : -spin);
      timeline.add(nodeOf(item), props, at + i * step);
    });
  }

  /* ── THE TABLE ─────────────────────────────────────────────────────────── */
  const DEPARTURES = {
    /* → SIGNAL. The canvas is what HUM is about, so the canvas is what gets
       taken. Objects first, then the people who were standing on them. */
    '02': (timeline, ctx) => {
      const corner = ctx.corner;
      pull(timeline, objectsInView(corner, 6), corner, { at: 0, step: 28, scale: 0.88 });
      pull(timeline, cursorsInView(corner, 3), corner, {
        at: 60, step: 34, scale: 0.7, reach: 0.8, nodeOf: (item) => item.node,
      });
    },

    /* → KILN. Type leads. The lines lean towards the bottom-left and widen a
       touch on the way, so the last thing on screen before KILN's letterform
       arrives is HUM's own letterforms moving in the same direction. */
    '03': (timeline, ctx) => {
      const corner = ctx.corner;
      const lines = linesInView(corner, 4);
      const dir = towards(corner);

      if (lines.length) {
        const nodes = lines.map((line) => line.node);
        remember(nodes);
        timeline.add(nodes, {
          x: dir.x * 120,
          y: dir.y * 120,
          scale: 1.12,
          opacity: 0,
          duration: 380,
          delay: (_, i) => i * 40,
          ease: EASE.exit,
        }, 0);
      }

      // The canvas does not follow the type out; it sinks quietly instead, so
      // the two gestures stay legible as two.
      pull(timeline, objectsInView(corner, 4), corner, { at: 90, step: 30, scale: 0.94, reach: 0.3 });
    },

    /* → DRIFT. Coming apart before it goes: one short outward shove against the
       corner, then everything falls into it. The shove is 130ms and it is the
       entire reason this reads as fragmentation rather than as suction. */
    '04': (timeline, ctx) => {
      const corner = ctx.corner;
      const items = objectsInView(corner, 7);
      if (!items.length) return;
      remember(items.map(inner));
      const dir = towards(corner);

      timeline.add(items.map(inner), {
        x: '-=' + (dir.x * 26).toFixed(1),
        y: '-=' + (dir.y * 26).toFixed(1),
        duration: 130,
        delay: (_, i) => i * 12,
        ease: EASE.snap,
      }, 0);

      items.forEach((item, i) => {
        const vector = pullTo(item, corner, { reach: 0.78 });
        timeline.add(inner(item), {
          x: '+=' + vector.x.toFixed(1),
          y: '+=' + vector.y.toFixed(1),
          rotate: '+=' + (i % 2 ? 9 : -9),
          scale: 0.82,
          opacity: 0,
          duration: 300,
          ease: EASE.exit,
        }, 140 + i * 20);
      });
    },
  };

  /* Common to all three: the chrome leans out of frame, and the page gives up
     one percent of its size — small enough that nobody names it, large enough
     that the screen feels like it is being drawn into the corner. */
  function exit(timeline, ctx) {
    if (motion.reduced || !timeline) return;
    const dir = towards(ctx.corner);

    remember([...chrome, page].filter(Boolean));

    if (chrome.length) {
      timeline.add(chrome, {
        x: dir.x * 26,
        y: dir.y * 26,
        opacity: 0,
        duration: 260,
        delay: (_, i) => i * 40,
        ease: EASE.exit,
      }, 0);
    }

    if (page) {
      timeline.add(page, {
        x: dir.x * 18,
        y: dir.y * 18,
        scale: 0.99,
        duration: 360,
        ease: EASE.exit,
      }, 0);
    }

    (DEPARTURES[ctx.to] ?? DEPARTURES['02'])(timeline, ctx);
  }

  /* ── COMING BACK ───────────────────────────────────────────────────────
     Everything the departure moved is put back where it was, invisibly, while
     the portal still covers the screen — and then the page rises out of the
     corner the visitor pressed. The restore is a `set`, not an animation: the
     canvas must be exactly as they left it before a single frame of it shows. */
  function enter(timeline, ctx) {
    const at = ctx.at ?? 0;
    const dir = towards(ctx.corner);

    const putBack = () => {
      for (const [node, rest] of restore) utils.set(node, rest);
      restore.clear();
    };

    if (motion.reduced || !timeline) {
      putBack();
      return;
    }

    const surfaces = [page, ...chrome].filter(Boolean);

    // Both of these land while the portal is still opaque — the restore first,
    // then the offset the page will rise out of.
    timeline.call(putBack, Math.max(at - 30, 0));
    timeline.call(() => {
      utils.set(surfaces, { x: dir.x * 34, y: dir.y * 34, opacity: 0, scale: 1 });
    }, Math.max(at - 20, 0));

    timeline.add(surfaces, {
      x: 0,
      y: 0,
      opacity: 1,
      duration: 640,
      delay: (_, i) => i * 50,
      ease: EASE.rise,
    }, at);
  }

  return {
    id: '01',
    root,

    show() {
      root.hidden = false;
      root.dataset.state = 'live';
      // Restored before anything is visible, so returning to HUM returns you to
      // the paragraph you left rather than to the top of the page.
      window.scrollTo(0, scrollY);
    },

    hide() {
      scrollY = window.scrollY;
      root.dataset.state = 'idle';
      // `hidden`, not opacity: with the document collapsed, every observer in
      // the page reports off screen and every ambient loop in it stops. A world
      // you are not in costs nothing.
      root.hidden = true;
    },

    exit,
    enter,

    settle() {
      // Deliberately empty. HUM's own systems — the meter, the section spine,
      // the cursor loops — are driven by observers that woke up the moment
      // `hidden` came off, and the entrance is still settling at this point:
      // anything written here would cancel the tween that is mid-flight and
      // strand the header at whatever opacity it had reached.
    },
  };
};

export default spec;
