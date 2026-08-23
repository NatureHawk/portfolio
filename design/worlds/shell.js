// THE WORLD SHELL.
//
// Four sites, one document, no navigation. The shell owns which world is live,
// mounts the others before they are needed, and runs the ~640ms of choreography
// that moves between them. It is the only thing that knows about all four.
//
// THE SEQUENCE, and why it is in this order:
//
//   0ms    the world you are in reacts, towards the corner you pressed
//   60ms   the portal opens out of that corner
//   380ms  the portal is opaque — THE SWAP HAPPENS HERE, seen by nobody
//   400ms  the new world starts arriving, still covered
//   600ms  the portal has retreated; the new world is fully on screen
//   640ms  the layer is emptied and the shell is idle again
//
// Nothing is fetched, nothing is parsed and nothing is laid out inside those
// 640ms. The destination is built the moment the pointer comes within forty
// percent of its corner (see nav.js), and if it is somehow still unbuilt at
// click time it is built synchronously before the timeline starts — which is
// why there is never an intermediate state to show, and so never a loading
// screen, a fade to black or a placeholder.
//
// TRANSITIONS ARE NOT SHARED. The shell composes three separately owned pieces:
// the current world's departure (per destination — see the table in world01.js),
// the destination's portal recipe (per destination — see portal.js), and the
// destination's own arrival. It contributes no choreography of its own.

import { createTimeline, utils, motion, EASE, el, $ } from '../motion.js';
import { WORLDS, WORLD_LIST, HOME, fromLocation, urlFor } from './registry.js';
/* Every entry this document pushes is counted, so the back links know how many
   steps are between them and the page before this one. See design/trail.js. */
import { trailPush, trailReplace } from '../trail.js';
import { createPortal } from './portal.js';
import { createNav } from './nav.js';

const TIMING = {
  coverStart: 60,
  coverEnd: 380,
  uncoverStart: 380,
  uncoverEnd: 600,
  enterAt: 400,
  done: 640,
};

export function createShell(context = {}) {
  const host = $('#worlds') ?? document.body;
  const themeMeta = document.querySelector('meta[name="theme-color"]');

  const portal = createPortal();
  const nav = createNav({
    onEnter: (id) => travel(id),
    onApproach: (id) => prepare(id),
  });

  // Worlds are stateful once mounted — HUM remembers its scroll position and
  // every object anybody moved — so they are built once and kept, never rebuilt.
  const mounted = new Map();

  const announce = el('p', 'sr-only');
  announce.setAttribute('role', 'status');
  announce.setAttribute('aria-live', 'polite');
  document.body.appendChild(announce);

  let currentId = null;
  let busy = false;
  let pending = null;
  let heading = null;

  function prepare(id) {
    if (mounted.has(id)) return mounted.get(id);
    const spec = WORLDS.get(id);
    if (!spec) return null;
    const handle = spec.mount(host, { ...context, travel });
    if (!handle) return null;
    mounted.set(id, handle);
    return handle;
  }

  /* Runs at the end of every crossing, in both motion modes: a history event
     that arrived mid-flight is honoured now rather than lost. */
  function flush() {
    if (!pending) return;
    const next = pending;
    pending = null;
    travel(next, { push: false });
  }

  /* Identity is not decoration. The tab, the browser's own theme colour and the
     value every stylesheet keys off all change at the same instant the ground
     does — under the portal, so none of it is ever seen changing. */
  function wear(spec) {
    document.body.dataset.world = spec.id;
    document.documentElement.style.setProperty('--world-paper', spec.paper);
    document.documentElement.style.setProperty('--world-ink', spec.ink);
    document.documentElement.style.setProperty('--world-accent', spec.accent);
    if (themeMeta) themeMeta.content = spec.paper;
    document.title = spec.title;
    nav.setCurrent(spec.id);
    nav.tint(spec);
    announce.textContent = `${spec.name} — ${spec.kicker}`;
  }

  /* ══ THE CROSSING ════════════════════════════════════════════════════════ */
  function travel(id, { push = true } = {}) {
    // Where the page will BE, not where it is. Mid-crossing those are two
    // different worlds for 640ms, and comparing against the wrong one is how a
    // request to go back to the world you are leaving reads as "you are already
    // there" and gets thrown away.
    if (!WORLDS.has(id) || id === (busy ? heading : currentId)) return;

    /* A second press mid-crossing is dropped: the corners are 640ms apart at
       worst and a queued click would land somewhere the hand had already
       changed its mind about. A HISTORY event is different — the address bar
       has already changed, so dropping it would leave the URL describing a
       world the visitor is not in. That one waits its turn. */
    if (busy) {
      if (!push) pending = id;
      return;
    }

    const spec = WORLDS.get(id);
    const to = prepare(id);
    if (!to) return;
    const from = mounted.get(currentId) ?? null;

    busy = true;
    heading = id;
    document.body.classList.add('is-crossing');

    const ctx = {
      corner: spec.corner,
      from: currentId,
      to: id,
      world: spec,
      portal: spec.portal,
      t: TIMING,
      at: TIMING.enterAt,
    };

    // Everything that has to happen at the instant of full coverage, in the
    // order it has to happen in: the old world leaves the document, the new one
    // enters it, and the page becomes the new world in every other respect.
    const swap = () => {
      from?.hide?.();
      to.show?.();
      wear(spec);
      currentId = id;
    };

    if (push) {
      trailPush({ world: id }, urlFor(id));
    }

    // REDUCED MOTION. Not a shorter version of the transition — no version of
    // it. The visitor asked not to be moved through anything, so they are
    // simply somewhere else, with everything else the crossing does intact.
    if (motion.reduced) {
      swap();
      to.enter?.(null, ctx);
      // One frame later, and only for the focus: `travel` runs inside the click
      // handler, and a browser moves focus to the element that was clicked once
      // that handler returns — so a `settle` that focuses the new world from
      // here would be quietly undone a moment after it happened.
      requestAnimationFrame(() => to.settle?.());
      busy = false;
      document.body.classList.remove('is-crossing');
      flush();
      return;
    }

    nav.hold(id);
    portal.open(spec.portal);

    const timeline = createTimeline({ defaults: { ease: EASE.glide } });

    from?.exit?.(timeline, ctx);        // how this world leaves, for THIS corner
    portal.play(timeline, ctx);         // the destination's own portal recipe
    timeline.call(swap, TIMING.coverEnd);
    to.enter?.(timeline, ctx);          // the destination, out of the same corner

    timeline.call(() => {
      portal.close();
      document.body.classList.remove('is-crossing');
      busy = false;
      to.settle?.();
      flush();
    }, TIMING.done);
  }

  /* ══ BOOT ════════════════════════════════════════════════════════════════
     A world is a URL — `?w=03` — so one can be linked to, bookmarked and gone
     back to. Arriving on one directly is not a transition: there is nothing to
     transition FROM, so the world is simply mounted, shown and given its own
     arrival on a bare timeline. */
  function start() {
    const home = prepare(HOME);
    if (home) home.show?.();

    const wanted = fromLocation();
    if (wanted !== HOME) {
      const spec = WORLDS.get(wanted);
      const handle = prepare(wanted);
      if (handle) {
        home?.hide?.();
        // Entrance first, THEN visible: `enter` puts its targets in their
        // starting positions the moment it is called, and a world shown before
        // that has one frame of itself sitting at rest.
        const timeline = motion.reduced ? null : createTimeline();
        handle.enter?.(timeline, { corner: spec.corner, world: spec, t: TIMING, at: 0, from: null, to: wanted });
        handle.show?.();
        wear(spec);
        currentId = wanted;
        handle.settle?.();
        trailReplace({ world: wanted }, urlFor(wanted));
        return;
      }
    }

    currentId = HOME;
    wear(WORLDS.get(HOME));
    trailReplace({ world: HOME }, urlFor(HOME));
  }

  /* The back button moves between worlds the same way the corners do, from the
     corner the destination owns — so history is not an exception to the
     mechanic, it is another way of using it. */
  window.addEventListener('popstate', (event) => {
    const id = event.state?.world ?? fromLocation();
    travel(id, { push: false });
  });

  /* The rest of the page is built and mounted before any of this is visible.
     `reveal` is called by the arrival sequence in design.js, at the moment the
     curtain starts to lift — see the note there about why interaction is handed
     back then rather than when it lands. */
  function reveal() {
    nav.reveal();
  }

  start();

  return {
    travel,
    prepare,
    reveal,
    get current() { return currentId; },
    get worlds() { return WORLD_LIST; },

    /* Nothing in the page tears this down today, but a shell that cannot be
       removed is a shell that leaks the moment one thing outside it changes. */
    destroy() {
      for (const handle of mounted.values()) handle.destroy?.();
      mounted.clear();
      portal.close();
      nav.destroy();
      utils.remove(announce);
      announce.remove();
    },
  };
}
