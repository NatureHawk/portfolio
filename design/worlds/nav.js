// THE CORNER CONTROLS.
//
// This is the navigation, and it is four numbers. Idle, each corner is a mono
// pair of digits and a hairline tick — small enough that the page reads as
// having no navigation at all, present enough that the eye eventually catches
// one and wonders.
//
// It is driven by DISTANCE, not by hover. `nearness` is a 0..1 value written
// into a custom property on each control every frame the pointer is anywhere
// near it, and the CSS does the rest: the tick lengthens, the number gains
// contrast, the panel underneath it opens. Nothing snaps on, which is the
// difference between a control that responds to you and one that toggles.
//
// One frame subscriber for all four, on the page's shared clock (motion.js), and
// it writes a single custom property per corner — no layout is read here, ever.
// On a touch device there is nothing to be near, so the loop never starts and
// the CSS shows the compact labelled state permanently instead.

import { animate, frame, pointer, hasHover, motion, utils, EASE, el, $$ } from '../motion.js';
import { CORNERS, nearness } from './corners.js';
import { WORLD_LIST } from './registry.js';
import { createHotCorners } from './hotcorners.js';

const REACH = 210;      // px from the corner at which a control starts waking
const PREPARE_AT = 0.4; // nearness at which the destination is built, unasked

export function createNav({ onEnter, onApproach } = {}) {
  const node = el('nav', 'corners');
  node.id = 'corners';
  node.setAttribute('aria-label', 'The four worlds');

  const controls = WORLD_LIST.map((world) => {
    const corner = CORNERS[world.corner];
    const button = el('button', `corner corner--${world.corner}`);
    button.type = 'button';
    button.dataset.world = world.id;
    button.dataset.cursor = 'ENTER';
    button.setAttribute('aria-label', `${world.name} — ${world.kicker}, ${corner.label} corner`);
    button.innerHTML = `
      <span class="corner-tick" aria-hidden="true"></span>
      <span class="corner-no">${world.id}</span>
      <span class="corner-panel" aria-hidden="true">
        <span class="corner-rule"></span>
        <span class="corner-go">ENTER <i>${corner.arrow}</i></span>
        <span class="corner-name">${world.name}</span>
        <span class="corner-kicker">${world.kicker}</span>
      </span>
    `;
    node.appendChild(button);
    return { world, button, near: 0, written: -1, prepared: false };
  });

  /* PLACED SECOND IN THE DOCUMENT, right after the skip link. Painting order is
     settled by z-index and does not care where this sits — but the tab order
     does, and HUM has some forty focusable objects on its canvases. Appended at
     the end, the four doors out of this site would be forty presses away, which
     is not navigation. */
  const skip = document.querySelector('.skip');
  if (skip && skip.parentNode === document.body) skip.after(node);
  else document.body.prepend(node);

  let current = null;

  /* THROWN, NOT CLICKED. A second way into the same four doors: aim the
     cursor at a corner and move fast, and it opens on its own — see
     hotcorners.js for what "fast" and "aimed" mean. It shares these exact
     controls (so it lights the same corner click does) and the same
     `onEnter`/`onApproach`, so a throw is indistinguishable from a very fast,
     very deliberate click by the time it reaches the shell. Mouse-only, and
     only where there is a pointer to throw in the first place. */
  const hot = hasHover ? createHotCorners({ controls, node, getCurrent: () => current, onEnter, onApproach }) : null;

  const write = (control, value) => {
    // Two decimals is below the threshold at which any of the derived values
    // change by a visible amount, and it keeps the loop from writing a new
    // string every frame while the pointer sits still.
    const rounded = Math.round(value * 100) / 100;
    if (rounded === control.written) return;
    control.written = rounded;
    control.button.style.setProperty('--near', rounded);
    control.button.classList.toggle('is-near', rounded > 0.34);
  };

  /* ── PROXIMITY ─────────────────────────────────────────────────────────
     The only per-frame work the navigation does. It is also where the next
     world gets BUILT: cross forty percent of the way to a corner and its
     destination is mounted, hidden, behind the page you are still reading — so
     by the time a click happens there is nothing left to prepare. */
  /* A pointer that leaves the window stops sending moves, and the damped value
     it leaves behind is wherever it was last — which, if that was a corner,
     would leave the corner lit for as long as the tab is open. */
  let away = false;
  if (hasHover) {
    window.addEventListener('pointermove', () => { away = false; }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => { away = true; });

    frame.add(() => {
      if (!pointer.has) return;
      for (const control of controls) {
        if (away || control.world.id === current) { write(control, 0); continue; }
        const value = nearness(control.world.corner, pointer.sx, pointer.sy, REACH);
        write(control, value);
        if (!control.prepared && value > PREPARE_AT) {
          control.prepared = true;
          onApproach?.(control.world.id);
        }
      }
    });
  }

  /* ── THE PRESS ─────────────────────────────────────────────────────────
     Focus prepares the destination too, so the keyboard route is never the slow
     one. The control takes the press itself: a short compression, because a
     portal that opens out of a corner should look like it was pushed. */
  for (const control of controls) {
    const { button, world } = control;

    button.addEventListener('focus', () => {
      button.classList.add('is-near');
      if (control.prepared) return;
      control.prepared = true;
      onApproach?.(world.id);
    });
    button.addEventListener('blur', () => {
      if (control.written <= 0.34) button.classList.remove('is-near');
    });

    button.addEventListener('pointerdown', () => {
      if (motion.reduced) return;
      animate(button, { scale: 0.9, duration: 120, ease: EASE.snap });
    });
    button.addEventListener('pointerup', () => {
      if (motion.reduced) return;
      animate(button, { scale: 1, duration: 420, ease: EASE.rise });
    });

    button.addEventListener('click', () => onEnter?.(world.id));
  }

  return {
    node,
    controls,

    /* The corner you are standing in goes quiet. It is still in the tab order
       and still says where you are — it simply stops offering to take you
       somewhere you already are. */
    setCurrent(id) {
      current = id;
      for (const control of controls) {
        const isHere = control.world.id === id;
        // Deliberately NOT `disabled`: a disabled button leaves the tab order
        // and drops focus the instant you arrive somewhere, which strands a
        // keyboard visitor on the body. It stays focusable and says where you
        // are; the CSS takes its pointer events away and travel() ignores a
        // request to go where you already are.
        control.button.dataset.current = String(isHere);
        control.button.setAttribute('aria-disabled', String(isHere));
        control.button.setAttribute('aria-current', isHere ? 'true' : 'false');
        if (isHere) write(control, 0);
      }
    },

    /* Held back until the arrival curtain has gone. Then the four ticks draw in
       one after another and each number breathes once — the single moment the
       navigation asks to be noticed. After that it never does it again. */
    reveal() {
      if (node.classList.contains('is-awake')) return;
      node.classList.add('is-awake');
      if (motion.reduced) return;

      // The marks brighten; the panels stay shut. Three panels opening by
      // themselves on arrival would be the page explaining its own navigation,
      // which is the opposite of a mechanic somebody finds.
      node.classList.add('is-hinting');

      controls.forEach((control, i) => {
        if (control.world.id === current) return;
        const proxy = { v: 0 };
        animate(proxy, {
          v: [0, 0.62, 0],
          duration: 1150,
          delay: 420 + i * 110,
          ease: EASE.wave,
          onUpdate: () => write(control, proxy.v),
          onComplete: () => node.classList.remove('is-hinting'),
        });
      });
    },

    /* The pressed corner holds its lit state while the portal pours out of it,
       then hands over to the new world's palette. */
    hold(id) {
      const control = controls.find((c) => c.world.id === id);
      if (!control || motion.reduced) return;
      write(control, 1);
      animate(control.button, { scale: [0.9, 1], duration: 520, ease: EASE.rise });
    },

    /* The whole navigation takes the destination's ink, under the portal, so it
       is already the right colour when the new ground appears behind it. */
    tint(world) {
      node.style.setProperty('--corner-ink', world.ink);
      node.style.setProperty('--corner-accent', world.accent);
      node.style.setProperty('--corner-paper', world.paper);
    },

    destroy() {
      hot?.destroy();
      utils.remove($$('.corner', node));
      node.remove();
    },
  };
}
