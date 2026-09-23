// HUM — presence.
//
// Two cursor systems, and they are deliberately drawn the same way.
//
//   · createPresence() puts other people's cursors on a canvas: an arrow with a
//     name flag, moved by a score (see `movesScore` in content.js).
//   · userCursor() replaces the native pointer INSIDE a canvas with the exact
//     same arrow, flagged YOU.
//
// That symmetry is the whole idea. The moment your own pointer picks up a name
// flag identical to MARA's, the page stops being a page about a product and
// starts being an instance of it. Outside a canvas the native cursor is left
// completely alone — hijacking the pointer across a whole document is a cost
// paid by everyone and earned by nobody.
//
// Nothing here polls. Cursors are moved by anime springs; the user cursor rides
// the shared frame only while the pointer is actually inside a canvas.

import { animate, utils, frame, pointer, hasHover, motion, SPRING, EASE, el, $$ } from './motion.js';
import { cursorNode, selectionFrame } from './parts.js';
import { people, byId } from './content.js';

/* ══ OTHER PEOPLE ══════════════════════════════════════════════════════════ */

/* A cursor layer over one stage. Positions are given in percentages of the
   stage and converted at the moment of the move, so the same score plays at
   any width without a second set of numbers. */
export function createPresence(stage, ids = ['mara', 'alex', 'juno']) {
  const layer = el('div', 'pcur-layer');
  layer.setAttribute('aria-hidden', 'true');
  stage.appendChild(layer);

  const cursors = new Map();
  for (const id of ids) {
    const person = byId(id);
    if (!person) continue;
    const node = cursorNode(person);
    utils.set(node, { opacity: 0, scale: 0.4, x: 0, y: 0 });
    layer.appendChild(node);
    cursors.set(id, { person, node, x: 0, y: 0, held: null });
  }

  const rect = () => stage.getBoundingClientRect();
  const toPx = (pos) => {
    const r = rect();
    return { x: (pos.x / 100) * r.width, y: (pos.y / 100) * r.height };
  };

  const api = {
    cursors,
    layer,

    /* Arrival, not a fade-in: the cursor comes from slightly off its mark and
       settles, the way a real one does when someone opens the tab. */
    show(id, pos, { delay = 0 } = {}) {
      const c = cursors.get(id);
      if (!c) return;
      const to = toPx(pos);
      c.x = to.x;
      c.y = to.y;
      if (motion.reduced) {
        utils.set(c.node, { opacity: 1, scale: 1, x: to.x, y: to.y });
        return;
      }
      utils.set(c.node, { x: to.x + 26, y: to.y + 34 });
      animate(c.node, {
        opacity: [0, 1],
        scale: [0.4, 1],
        x: to.x,
        y: to.y,
        duration: 900,
        delay,
        ease: SPRING.cursor,
      });
    },

    hide(id, { delay = 0 } = {}) {
      const c = cursors.get(id);
      if (!c) return;
      animate(c.node, { opacity: 0, scale: 0.5, duration: 380, delay, ease: EASE.exit });
    },

    /* Moves a cursor, and returns the animation so a score can await it. */
    moveTo(id, pos, { duration = 900, delay = 0, ease = SPRING.cursor } = {}) {
      const c = cursors.get(id);
      if (!c) return null;
      const to = toPx(pos);
      c.x = to.x;
      c.y = to.y;
      if (motion.reduced) {
        utils.set(c.node, { x: to.x, y: to.y });
        return null;
      }
      return animate(c.node, { x: to.x, y: to.y, duration, delay, ease });
    },

    /* Sends a cursor to an object's grab handle rather than its centre — the
       small correctness that makes the gesture read as picking a thing up. */
    moveToObject(id, target, options = {}) {
      const r = rect();
      const t = target.getBoundingClientRect();
      const handle = target.querySelector('.obj-handle');
      const h = handle ? handle.getBoundingClientRect() : t;
      const x = ((h.left + h.width / 2 - r.left) / r.width) * 100;
      const y = ((h.top + h.height / 2 - r.top) / r.height) * 100;
      return api.moveTo(id, { x, y }, options);
    },

    /* The press. A cursor that grabs something shrinks a touch and the ping
       ring fires once — no permanent pulsing anywhere on this page. */
    press(id) {
      const c = cursors.get(id);
      if (!c || motion.reduced) return;
      animate(c.node.querySelector('.pcur-arrow'), {
        scale: [1, 0.82, 1],
        duration: 420,
        ease: EASE.snap,
      });
      const ping = c.node.querySelector('.pcur-ping');
      utils.set(ping, { scale: 0.2, opacity: 0.9 });
      animate(ping, { scale: 2.6, opacity: 0, duration: 720, ease: EASE.soft });
    },

    /* Selection frame in the collaborator's own tone, so who is holding what is
       readable without reading the flags. */
    select(id, target) {
      const c = cursors.get(id);
      if (!c || !target) return () => {};
      // The frame belongs to the tilted inner card, not the drag shell, so it
      // stays glued to the object's actual edges while it is being handled.
      const host = target.querySelector('.obj-in') ?? target;
      host.querySelector('.sel')?.remove();
      const frameNode = selectionFrame(c.person.name, c.person.tone);
      host.appendChild(frameNode);
      if (!motion.reduced) {
        animate(frameNode, { opacity: [0, 1], scale: [1.04, 1], duration: 380, ease: EASE.rise });
      }
      return () => {
        if (!frameNode.isConnected) return;
        animate(frameNode, {
          opacity: 0,
          duration: 240,
          ease: EASE.exit,
          onComplete: () => frameNode.remove(),
        });
      };
    },

    /* Idle life. Two pixels of drift is the difference between a cursor that is
       parked and one that belongs to somebody who is still there. */
    drift(id) {
      const c = cursors.get(id);
      if (!c || motion.reduced) return null;
      return animate(c.node, {
        x: c.x + utils.random(-7, 7),
        y: c.y + utils.random(-5, 5),
        duration: utils.random(1600, 2600),
        ease: EASE.wave,
        loop: true,
        alternate: true,
      });
    },

    destroy() {
      utils.remove([...cursors.values()].map((c) => c.node));
      layer.remove();
    },
  };

  return api;
}

/* ══ YOU ═══════════════════════════════════════════════════════════════════
   The visitor's own cursor, but only over a canvas. `[data-canvas]` marks the
   regions that take it; CSS hides the native pointer inside exactly those, so
   there is never a frame with two cursors or none. */
export function userCursor() {
  if (!hasHover) return;

  /* TWO NESTED ELEMENTS, ON PURPOSE — the same rule as the canvas objects.
     The holder is translated by hand every frame (following a pointer is the one
     thing a tween is wrong for), and the arrow inside it is what anime scales
     and fades. Put both on one element and each writes `transform` over the
     other: the cursor snaps to the top-left corner mid-fade. */
  const you = people.find((p) => p.id === 'you');
  const holder = el('div', 'ucur');
  holder.setAttribute('aria-hidden', 'true');
  const node = cursorNode(you);
  node.classList.add('pcur--you');
  holder.appendChild(node);
  document.body.appendChild(holder);
  utils.set(node, { opacity: 0, scale: 0.5 });

  // The label that answers "what happens if I click this" — DRAG, OPEN, VIEW.
  // Same split: the holder moves, the pill animates.
  const tip = el('div', 'ctip');
  tip.setAttribute('aria-hidden', 'true');
  const pill = el('span', 'ctip-text');
  tip.appendChild(pill);
  document.body.appendChild(tip);
  utils.set(pill, { opacity: 0, scale: 0.7 });

  const state = { inCanvas: false, tipShown: false, tx: 0, ty: 0 };

  /* WHERE THE ARROW IS PUT. One function, two callers, and the difference
     between them is the whole reason this is not just a line inside the loop.

     With motion allowed, the frame loop drives it: the arrow rides the damped
     pointer so it has a little weight, and the label damps more slowly still so
     it trails behind like a flag.

     With motion REDUCED, the pointer event drives it directly and the loop does
     nothing. Two reasons, and the second one matters more. First, damping is
     only legible as weight next to things that also move — on a page where
     nothing else does, an arrow arriving 70ms after the hand just reads as a
     dropped frame. Second, and this is the real point: in that mode the cursor
     stops depending on the clock at all. A cursor is not decoration, it is where
     the visitor believes their hand is, and it must not be able to end up parked
     in a corner because something upstream of it stopped ticking.

     Both paths write unconditionally rather than only while the arrow is
     visible, so it can never fade in at a position it held some seconds ago.

     Neither is drawn at all before the pointer has reported a real position.
     A canvas region can be entered with no movement whatsoever — hiding a
     full-screen layer re-runs hit-testing under a stationary cursor and fires
     a trusted pointerenter — and the damped pointer is still (0, 0) then, so
     the arrow would be painted in the top-left corner while the real cursor
     sits hidden somewhere else on the canvas. That reads as a frozen cursor,
     not as one waiting to be placed. Both start hidden and are revealed by
     their first genuine placement. */
  holder.style.visibility = 'hidden';
  tip.style.visibility = 'hidden';
  const place = (x, y) => {
    if (!pointer.has) return;
    holder.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    if (holder.style.visibility) holder.style.visibility = '';
  };
  const placeTip = (x, y) => {
    if (!pointer.has) return;
    tip.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    if (tip.style.visibility) tip.style.visibility = '';
  };

  let unsubscribe = null;
  const start = () => {
    if (unsubscribe) return;
    unsubscribe = frame.add((dt) => {
      // In reduced mode placement has already happened, on the event itself.
      if (motion.reduced) return;
      /* Until the pointer has actually reported a position, the damped one is
         still (0, 0) — the top-left corner. A region can be entered without
         any movement at all (hiding a full-screen layer re-runs hit-testing
         under a stationary cursor and fires a trusted pointerenter), and the
         arrow would then be drawn parked in that corner while the real cursor
         is hidden underneath the canvas — which reads as a frozen cursor
         rather than as one that has not been placed yet. */
      if (!pointer.has) return;
      const k = 1 - Math.exp(-dt / 120);
      state.tx += (pointer.sx - state.tx) * k;
      state.ty += (pointer.sy - state.ty) * k;
      place(pointer.sx, pointer.sy);
      placeTip(state.tx, state.ty);
    });
  };

  /* The reduced-motion driver. Registered once, costs one assignment per event,
     and is the only thing keeping the cursor honest when the clock is not. */
  window.addEventListener('pointermove', (event) => {
    if (!motion.reduced) return;
    state.tx = event.clientX;
    state.ty = event.clientY;
    place(state.tx, state.ty);
    placeTip(state.tx, state.ty);
  }, { passive: true });
  const stop = () => {
    if (!state.inCanvas && !state.tipShown && unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  };

  /* Canvas regions. Enter one and you join it — your pointer picks up the same
     name flag the others are wearing. */
  const enterCanvas = () => {
    if (state.inCanvas) return;
    state.inCanvas = true;
    state.tx = motion.reduced ? pointer.x : pointer.sx;
    state.ty = motion.reduced ? pointer.y : pointer.sy;
    place(state.tx, state.ty);
    start();
    animate(node, { opacity: 1, scale: 1, duration: 460, ease: SPRING.ui });
  };
  const leaveCanvas = () => {
    if (!state.inCanvas) return;
    state.inCanvas = false;
    animate(node, {
      opacity: 0,
      scale: 0.5,
      duration: 260,
      ease: EASE.exit,
      onComplete: stop,
    });
  };

  const bindCanvas = (region) => {
    region.addEventListener('pointerenter', enterCanvas);
    region.addEventListener('pointerleave', leaveCanvas);
  };
  $$('[data-canvas]').forEach(bindCanvas);

  /* Label targets. `data-cursor` is the word; that is the whole API. */
  const showTip = (text) => {
    pill.textContent = text;
    if (state.tipShown) return;
    state.tipShown = true;
    state.tx = motion.reduced ? pointer.x : pointer.sx;
    state.ty = motion.reduced ? pointer.y : pointer.sy;
    placeTip(state.tx, state.ty);
    start();
    animate(pill, { opacity: 1, scale: 1, duration: 420, ease: SPRING.ui });
  };
  const hideTip = () => {
    if (!state.tipShown) return;
    state.tipShown = false;
    animate(pill, { opacity: 0, scale: 0.7, duration: 220, ease: EASE.exit, onComplete: stop });
  };

  document.addEventListener('pointerover', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-cursor]') : null;
    if (target) showTip(target.dataset.cursor);
    else hideTip();
  });

  // Pressing anywhere gives your arrow the same nudge the collaborators get.
  window.addEventListener('pointerdown', () => {
    holder.classList.add('is-down');
    if (state.inCanvas && !motion.reduced) {
      animate(node.querySelector('.pcur-arrow'), { scale: [1, 0.84, 1], duration: 380, ease: EASE.snap });
    }
  }, { passive: true });
  window.addEventListener('pointerup', () => holder.classList.remove('is-down'), { passive: true });

  // A canvas that arrives later (there are none today, but section 07 rebuilds
  // its own contents) can register itself.
  return { bindCanvas };
}
