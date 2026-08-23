// THE TRANSITION LAYER.
//
// One fixed layer above everything, empty except during the ~600ms it takes to
// move between worlds. It has exactly one job: to be opaque at the moment the
// worlds are swapped underneath it, and to arrive and leave from the corner the
// visitor pressed.
//
// THE GEOMETRY, once, because everything here depends on it. A square rotated
// 45° and centred ON the corner covers the region |x| + |y| ≤ R, where R is its
// half-diagonal. Growing it from scale 0 therefore sweeps a single straight
// edge across the screen at 45° — a diagonal wipe out of the exact corner — and
// it does so with nothing but a `scale`, which is a compositor operation. No
// clip-path is animated, no layout is read, nothing repaints per frame.
//
// The far point of a viewport from its corner is W + H away in that metric, so
// the square's side is (W + H) × 1.5 — the √2 the rotation costs, plus a little.
//
// COVER AND UNCOVER ARE TWO SHEETS, not one played backwards. The cover sheet
// is centred on the pressed corner and grows; the uncover sheet is centred on
// the OPPOSITE corner and shrinks, which retreats the same 45° edge in the same
// direction and so uncovers the new world starting at the pressed corner. Both
// are full-screen opaque at the moment they trade places, so the swap is
// invisible.
//
// EACH DESTINATION PICKS ITS OWN RECIPE. `variant` names one of the three
// below; `fill` and `edge` are the destination's own colours. Adding a fourth
// is adding a function to VARIANTS and naming it in a world module.

import { utils, EASE, el } from '../motion.js';
import { CORNERS, OPPOSITE } from './corners.js';

const SPAN = 1.5;   // sheet side, as a multiple of (W + H)
const LEAD = 48;    // how far ahead of the ground the accent blade runs, in ms

/* The blade is a GLAZE, not a fill. At full opacity the screen spends a sixth
   of a second as one flat colour, which reads as a swipe effect; at three
   quarters the world you are leaving is still legible underneath it and the
   blade reads as something passing over the page. The ground behind it is
   opaque, so nothing about the cover guarantee changes. */
const glaze = (color) => 'color-mix(in srgb, ' + color + ' 74%, transparent)';

export function createPortal() {
  const layer = el('div', 'portal');
  layer.id = 'portal';
  layer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(layer);

  let made = [];

  const measure = () => {
    const side = Math.ceil((window.innerWidth + window.innerHeight) * SPAN);
    layer.style.setProperty('--pl', side + 'px');
  };
  measure();
  window.addEventListener('resize', measure, { passive: true });

  /* One rotated square, anchored on a corner. Everything the portal draws is
     one of these, or the word in the `type` variant. */
  function sheet(corner, fill, { scale = 0, rotate = 45, opacity = 1 } = {}) {
    const node = el('div', 'portal-sheet');
    node.style.setProperty('--px', CORNERS[corner].x ? '100%' : '0%');
    node.style.setProperty('--py', CORNERS[corner].y ? '100%' : '0%');
    node.style.background = fill;
    layer.appendChild(node);
    utils.set(node, { rotate, scale, opacity });
    made.push(node);
    return node;
  }

  /* The letterform variant's mark. It is anchored by the two edges that meet at
     its corner — `data-corner` picks the pair in the stylesheet — rather than by
     a translate, because anime owns the transform on this element and a layout
     offset written into it would be overwritten on the first frame. */
  function word(corner, text, color) {
    const node = el('div', 'portal-word');
    node.textContent = text;
    node.dataset.corner = corner;
    node.style.color = color;
    layer.appendChild(node);
    utils.set(node, { scale: 0.5, opacity: 0 });
    made.push(node);
    return node;
  }

  /* ══ 02 · SWEEP ══════════════════════════════════════════════════════════
     The straight blade. An accent edge crosses first and the ground follows it
     by LEAD milliseconds, so the screen is cut rather than covered. */
  function sweep(timeline, ctx) {
    const { corner, portal, t } = ctx;
    const back = OPPOSITE[corner];
    const coverDur = t.coverEnd - t.coverStart - LEAD;
    const uncoverDur = t.uncoverEnd - t.uncoverStart - LEAD;

    // DOM order is the whole trick: within each pair the ground sheet is built
    // last, so it paints over the accent and leaves it showing only as a blade
    // along its own leading edge.
    const leadIn = sheet(corner, glaze(portal.edge));
    const fillIn = sheet(corner, portal.fill);
    const leadOut = sheet(back, glaze(portal.edge), { scale: 1, opacity: 0 });
    const fillOut = sheet(back, portal.fill, { scale: 1, opacity: 0 });

    timeline.add(leadIn, { scale: 1, duration: coverDur, ease: EASE.snap }, t.coverStart);
    timeline.add(fillIn, { scale: 1, duration: coverDur, ease: EASE.snap }, t.coverStart + LEAD);

    // The trade. Both sheets are opaque and full-screen at this instant, so it
    // is a change of nothing at all — which is exactly what it has to be.
    timeline.call(() => {
      utils.set([leadOut, fillOut], { opacity: 1 });
      utils.set([leadIn, fillIn], { opacity: 0 });
    }, t.coverEnd);

    timeline.add(fillOut, { scale: 0, duration: uncoverDur, ease: EASE.rise }, t.uncoverStart);
    timeline.add(leadOut, { scale: 0, duration: uncoverDur, ease: EASE.rise }, t.uncoverStart + LEAD);
  }

  /* ══ 03 · TYPE ═══════════════════════════════════════════════════════════
     The same blade, but a letterform gets there first. The word grows out of
     the corner UNDER the sheets, so the ground catches it and swallows it — the
     type opens the door and then becomes the door. */
  function type(timeline, ctx) {
    const { corner, portal, t } = ctx;
    const mark = word(corner, portal.word ?? ctx.world.name, portal.edge);

    utils.set(mark, { scale: 0.4, opacity: 1 });
    timeline.add(mark, {
      scale: 9,
      duration: t.coverEnd - t.coverStart + 120,
      ease: EASE.snap,
    }, Math.max(t.coverStart - 40, 0));
    timeline.add(mark, { opacity: 0, duration: 160, ease: EASE.exit }, t.coverStart + 150);

    sweep(timeline, ctx);
  }

  /* ══ 04 · SHARDS ═════════════════════════════════════════════════════════
     The blade, broken. Several accent plates are thrown from the corner at
     slightly different angles and slightly different moments, so the edge that
     crosses the screen is ragged and reassembles into one ground behind it.
     Only the plates are jittered — the ground sheet stays at a true 45°, and
     that is what guarantees the screen is genuinely covered at the swap. */
  function shards(timeline, ctx) {
    const { corner, portal, t } = ctx;
    const back = OPPOSITE[corner];
    const count = portal.shards ?? 4;
    const angles = [41, 45.5, 48, 43.5, 46.5];
    const coverDur = t.coverEnd - t.coverStart - LEAD;
    const uncoverDur = t.uncoverEnd - t.uncoverStart - LEAD;

    const platesIn = [];
    const platesOut = [];
    for (let i = 0; i < count; i += 1) {
      platesIn.push(sheet(corner, glaze(portal.edge), { rotate: angles[i % angles.length] }));
    }
    const fillIn = sheet(corner, portal.fill);
    for (let i = 0; i < count; i += 1) {
      platesOut.push(sheet(back, glaze(portal.edge), { rotate: angles[i % angles.length], scale: 1, opacity: 0 }));
    }
    const fillOut = sheet(back, portal.fill, { scale: 1, opacity: 0 });

    timeline.add(platesIn, {
      scale: 1,
      duration: coverDur,
      delay: (_, i) => i * 34,
      ease: EASE.snap,
    }, t.coverStart);
    timeline.add(fillIn, { scale: 1, duration: coverDur, ease: EASE.snap }, t.coverStart + LEAD);

    timeline.call(() => {
      utils.set([...platesOut, fillOut], { opacity: 1 });
      utils.set([...platesIn, fillIn], { opacity: 0 });
    }, t.coverEnd);

    timeline.add(fillOut, { scale: 0, duration: uncoverDur, ease: EASE.rise }, t.uncoverStart);
    timeline.add(platesOut, {
      scale: 0,
      duration: uncoverDur,
      delay: (_, i) => (count - 1 - i) * 30,
      ease: EASE.rise,
    }, t.uncoverStart + LEAD);
  }

  /* ══ 05 · IRIS ═══════════════════════════════════════════════════════════
     Not a blade at all. SOMEWHERE is the only world with real depth behind it,
     and an edge sliding over the top of a 3D scene announces that the scene is
     a flat layer — so this one OPENS rather than wipes, the way a lens does.

     The same two-sheet trade every variant makes, with one difference that is
     the whole effect: the sheets are circles rather than squares, and the
     uncovering one is scaled from the corner the visitor arrived through. What
     they see is the sky widening out of that corner with the world already
     inside it, rather than a colour arriving on top of one.

     The accent still runs LEAD ahead, but as a RING rather than a blade — it is
     the same promise the other three make (a line of the world's own colour
     crosses first) kept in a shape that belongs to a circle. */
  function iris(timeline, ctx) {
    const { corner, portal, t } = ctx;
    const back = OPPOSITE[corner];
    const coverDur = t.coverEnd - t.coverStart - LEAD;
    const uncoverDur = t.uncoverEnd - t.uncoverStart - LEAD;

    const round = (node) => { node.style.borderRadius = '50%'; return node; };

    const ringIn = round(sheet(corner, glaze(portal.edge), { rotate: 0 }));
    const fillIn = round(sheet(corner, portal.fill, { rotate: 0 }));
    const fillOut = round(sheet(back, portal.fill, { rotate: 0, scale: 1, opacity: 0 }));
    const ringOut = round(sheet(back, glaze(portal.edge), { rotate: 0, scale: 1, opacity: 0 }));

    timeline.add(ringIn, { scale: 1, duration: coverDur, ease: EASE.snap }, t.coverStart);
    timeline.add(fillIn, { scale: 1, duration: coverDur, ease: EASE.snap }, t.coverStart + LEAD);

    timeline.call(() => {
      utils.set([fillOut, ringOut], { opacity: 1 });
      utils.set([ringIn, fillIn], { opacity: 0 });
    }, t.coverEnd);

    // The opening. The ground goes first here and the ring follows it out,
    // which is the reverse of the covering order — on the way in the accent
    // leads, on the way out it is the last thing to leave, so the world is
    // revealed through a closing ring of its own colour.
    timeline.add(fillOut, { scale: 0, duration: uncoverDur, ease: EASE.rise }, t.uncoverStart);
    timeline.add(ringOut, { scale: 0, duration: uncoverDur, ease: EASE.rise }, t.uncoverStart + LEAD);
  }

  const VARIANTS = { sweep, type, shards, iris };

  return {
    layer,

    open(portal) {
      layer.dataset.variant = portal?.variant ?? 'sweep';
      layer.classList.add('is-open');
    },

    play(timeline, ctx) {
      (VARIANTS[ctx.portal?.variant] ?? sweep)(timeline, ctx);
    },

    close() {
      layer.classList.remove('is-open');
      // Handed back to anime as well as to the DOM: an element removed while
      // still registered keeps being written to on every tick.
      if (made.length) utils.remove(made);
      made = [];
      layer.textContent = '';
    },
  };
}
