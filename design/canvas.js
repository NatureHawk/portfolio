// HUM — making the objects real.
//
// A canvas object has to survive being touched. That means four things, and all
// four are here so no section reinvents any of them:
//
//   drag     anime's Draggable, bounded to the stage, released on a spring.
//   tilt     the resting hover response (motion.js `tactile`).
//   lift     z-order and shadow while held — the thing that makes a flat page
//            feel like a stack of paper.
//   reach    keyboard. Every draggable object is focusable and moves on the
//            arrow keys, because a drag-only affordance is an affordance only
//            some people have.
//
// Objects also arrive: `enterObjects` is the staggered drop used by every stage
// on the page, so the hero, the demo board and the desk all land the same way.

import {
  animate, createDraggable, stagger, utils, motion, tactile, EASE, SPRING, $$,
} from './motion.js';

let topLayer = 10;

/* ══ PLACEMENT ═════════════════════════════════════════════════════════════
   Objects carry two compositions: the desktop one, and `m` for a phone. Which
   one is in force is a media query, not a width calculation, so it matches the
   CSS breakpoint exactly rather than nearly.

   Re-placing has to reset the drag layer as well. Without that, an object moved
   by hand keeps its old translate on top of its new anchor and lands somewhere
   neither composition asked for. */
const phone = window.matchMedia('(max-width: 760px)');

/* Which of an object's two compositions is currently in force. Choreographies
   that move an object to a given percentage of the stage need this: the move is
   a delta from wherever the object is anchored right now, and on a phone that is
   not the same place it is on a desktop. */
export const activePos = (item) => (phone.matches && item.m ? item.m : item);

export function placeObjects(items, { root = document, drags = null } = {}) {
  for (const item of items) {
    const node = root.querySelector(`[data-obj="${item.id}"]`);
    if (!node) continue;
    const pos = activePos(item);
    node.style.setProperty('--x', `${pos.x ?? 0}%`);
    node.style.setProperty('--y', `${pos.y ?? 0}%`);
  }
  if (drags) for (const drag of drags.values?.() ?? drags) drag.reset?.();
}

/* Calls back when the composition changes. Returns a teardown. */
export function onLayoutChange(fn) {
  const handler = () => fn(phone.matches);
  phone.addEventListener('change', handler);
  return () => phone.removeEventListener('change', handler);
}

/* ══ ARRIVAL ═══════════════════════════════════════════════════════════════
   Objects drop in, over-rotated and slightly high, and settle into their resting
   angle. Order comes from the caller (usually document order); the stagger is
   what turns six simultaneous appearances into a sequence you can follow.

   IT ANIMATES THE INNER ELEMENT, NOT THE OUTER ONE. The outer `.obj` transform
   belongs to the drag layer and to nothing else: animate `y` or `scale` on it and
   two animatables end up writing `transform` on the same node, which does not
   fail loudly — it leaves objects sitting a hundred pixels from where they were
   placed. Opacity is safe on the outer, since the drag layer never touches it.

   Because the inner element's resting rotation comes from CSS, and any transform
   anime writes replaces that declaration wholesale, the rotation has to be part
   of the animation rather than left to the stylesheet. */
export function enterObjects(nodes, { delay = 0, step = 90, from = 26 } = {}) {
  const list = [...nodes];
  if (!list.length) return null;
  const inners = list.map((n) => n.querySelector('.obj-in') ?? n);
  const restAngle = (node) => Number(node.dataset.rot || 0);

  utils.set(list, { opacity: 1 });

  if (motion.reduced) {
    // Left untransformed, so the CSS resting angle survives untouched.
    utils.set(inners, { opacity: 1 });
    return null;
  }

  for (const inner of inners) {
    utils.set(inner, { opacity: 0, y: from, scale: 0.94, rotate: restAngle(inner) * 2.2 });
  }

  return animate(inners, {
    opacity: 1,
    y: 0,
    scale: 1,
    rotate: (node) => restAngle(node),
    duration: 900,
    delay: stagger(step, { start: delay }),
    ease: SPRING.drop,
  });
}

/* ══ DRAG ══════════════════════════════════════════════════════════════════ */

/* Makes every `[data-drag]` object inside a stage movable. Returns a Map of
   object id to Draggable, because the choreographies need to move specific
   objects BY NAME — and they have to move them through the same instance the
   pointer uses, or a scripted move and a hand-drag end up disagreeing about
   where the object is. */
export function makeDraggable(stage, { onGrab, onRelease } = {}) {
  const nodes = $$('[data-drag]', stage);
  const instances = new Map();

  for (const node of nodes) {
    // Objects can be added to a live stage (the CTA drops one onto the hero), so
    // this runs more than once over overlapping sets. Marking them keeps a
    // second pass from stacking a second Draggable on the same element, which
    // presents as an object that moves at double speed.
    if (node.dataset.draggable === 'true') continue;
    node.dataset.draggable = 'true';

    const inner = node.querySelector('.obj-in') ?? node;
    const baseRot = Number(inner.dataset.rot || 0);

    // Reduced motion still gets to move things — it just does not get thrown
    // physics. Snapping straight to the pointer is the honest version of that.
    const drag = createDraggable(node, {
      container: stage,
      containerPadding: -8,
      releaseStiffness: motion.reduced ? 400 : 92,
      releaseDamping: motion.reduced ? 40 : 15,
      onGrab() {
        node.dataset.dragging = 'true';
        node.style.zIndex = String(++topLayer);
        node.classList.add('is-held');
        if (!motion.reduced) {
          animate(inner, { scale: 1.045, rotate: baseRot * 0.4, duration: 420, ease: SPRING.ui });
        }
        onGrab?.(node);
      },
      onDrag() {
        // Lean into the throw. `deltaX` comes off the instance, so this costs
        // no layout read — and it is signed, which the scalar velocity is not.
        if (motion.reduced) return;
        const lean = utils.clamp(drag.deltaX * 0.5, -9, 9);
        inner.style.setProperty('--lean', `${lean}deg`);
      },
      onRelease() {
        node.dataset.dragging = 'false';
        node.classList.remove('is-held');
        inner.style.setProperty('--lean', '0deg');
        if (!motion.reduced) {
          animate(inner, {
            scale: 1,
            rotate: baseRot,
            duration: 900,
            ease: SPRING.drop,
          });
        }
        onRelease?.(node);
      },
    });

    instances.set(node.dataset.obj, drag);
    tactile(inner, { lift: 7, tilt: 2.6 });
    keyboardMove(node, drag);
  }

  return instances;
}

/* Arrow keys nudge, shift-arrow strides. The move goes through the Draggable's
   own animatable rather than being written onto the element behind its back, so
   a keyboard move and a pointer drag can never disagree about where the object
   is — and the next drag starts from where the keys left it. */
function keyboardMove(node, drag) {
  const STEP = 16;
  node.addEventListener('keydown', (event) => {
    const stride = event.shiftKey ? STEP * 4 : STEP;
    let dx = 0;
    let dy = 0;
    if (event.key === 'ArrowLeft') dx = -stride;
    else if (event.key === 'ArrowRight') dx = stride;
    else if (event.key === 'ArrowUp') dy = -stride;
    else if (event.key === 'ArrowDown') dy = stride;
    else return;

    event.preventDefault();
    node.style.zIndex = String(++topLayer);

    // Same walls the pointer hits. `containerBounds` is [top, right, bottom,
    // left]; without the clamp the arrow keys would walk an object off the
    // stage, which dragging it is not allowed to do.
    const [top, right, bottom, left] = drag.containerBounds;
    const duration = motion.reduced ? 0 : 340;
    if (dx) drag.animate[drag.xProp](utils.clamp(drag.x + dx, left, right), duration);
    if (dy) drag.animate[drag.yProp](utils.clamp(drag.y + dy, top, bottom), duration);
  });
}

/* ══ LINKS ═════════════════════════════════════════════════════════════════
   A connector between two objects, drawn as an SVG path that draws itself on.
   Section 03 uses it when MARA links the cover to the type; it is here because
   "two things on a canvas are related" is canvas vocabulary, not demo-specific.

   The path is a quadratic with the control point pushed perpendicular to the
   run, so it bows the way a hand-drawn arrow does instead of arcing through
   whatever is between the two objects. */
export function linkObjects(stage, fromNode, toNode, { tone = 'ink' } = {}) {
  const svg = stage.querySelector('.link-layer') ?? createLinkLayer(stage);
  const r = stage.getBoundingClientRect();
  const a = fromNode.getBoundingClientRect();
  const b = toNode.getBoundingClientRect();

  const x1 = a.left + a.width / 2 - r.left;
  const y1 = a.top + a.height / 2 - r.top;
  const x2 = b.left + b.width / 2 - r.left;
  const y2 = b.top + b.height / 2 - r.top;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const nx = -(y2 - y1);
  const ny = x2 - x1;
  const len = Math.hypot(nx, ny) || 1;
  const bow = Math.min(len * 0.22, 90);

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', `M ${x1} ${y1} Q ${mx + (nx / len) * bow} ${my + (ny / len) * bow} ${x2} ${y2}`);
  path.setAttribute('class', `link link--${tone}`);
  svg.appendChild(path);

  const length = path.getTotalLength();
  if (motion.reduced) {
    utils.set(path, { opacity: 1 });
  } else {
    utils.set(path, { strokeDasharray: length, strokeDashoffset: length, opacity: 1 });
    animate(path, { strokeDashoffset: 0, duration: 780, ease: EASE.glide });
  }

  return {
    node: path,
    remove() {
      if (!path.isConnected) return;
      animate(path, {
        opacity: 0,
        duration: 260,
        ease: EASE.exit,
        onComplete: () => path.remove(),
      });
    },
  };
}

function createLinkLayer(stage) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'link-layer');
  svg.setAttribute('aria-hidden', 'true');
  stage.appendChild(svg);
  return svg;
}
