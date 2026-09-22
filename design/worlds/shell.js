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
// destination's own arrival. It contributes no choreography of its own — with
// one small, deliberate exception: when a crossing was THROWN rather than
// clicked (`ctx.impulse` — see hotcorners.js), the shell gives the leaving
// world's own fixed-position layers a brief shove toward the corner before
// anything else starts, so the momentum reads even when the origin is 02, 03
// or 04 — each has its own exit choreography, but none of it is
// impulse-aware the way HUM's is. It is NEVER done by transforming an
// ancestor such as `#worlds` — see the note inside `travel()` for why that is
// specifically unsafe here.

import { createTimeline, utils, motion, EASE, el, $ } from '../motion.js';
import { WORLDS, WORLD_LIST, HOME, fromLocation, urlFor } from './registry.js';
import { towards } from './corners.js';
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
    // `opts` carries `impulse` when the press was a hot-corner throw rather
    // than a click — see hotcorners.js. A plain click passes nothing, and
    // travel() behaves exactly as it always has.
    onEnter: (id, opts) => travel(id, opts),
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
  function travel(id, { push = true, impulse = null } = {}) {
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
      // Set only when this crossing was THROWN rather than clicked — see
      // hotcorners.js. A world's exit/enter and the portal recipe may read it
      // to make the crossing feel like it was pushed, but nothing is
      // required to: a click leaves it null and every choreography here is
      // unchanged.
      impulse,
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

    /* THE SHOVE. NEVER `host` (`#worlds`) — 02/03/04 each build their visible
       surface as one or more `position: fixed` panels (see brush.css's
       `.bw-ground`/`.bw-rail`/`.bw-base`, forms.css's `.fw-ground`/`.fw-grain`,
       somewhere.css's canvas stage), and a `transform` on ANY ancestor of a
       fixed element becomes that element's containing block for as long as
       the transform is non-none — CSS does this regardless of how many
       levels down the fixed element sits. `host` is exactly such an
       ancestor, and it is a zero-height relative box (see the note at
       somewhere.css's `position: fixed` — "`.worlds` is a zero-height
       relative box"), so transforming it would have re-anchored every
       `inset: 0` layer to a zero-height box at the document's scroll
       position for the 150ms of the shove: a full collapse, invisible only
       because the portal happened to be covering it when this was first
       written.

       So this shoves the leaving world's OWN fixed layers directly instead —
       a fixed element transforming ITSELF is fine, it only changes
       containing-block-ness for that element's own descendants, and none of
       the worlds nest a fixed layer inside another one. The set is read
       fresh off `from.root` every time (computed `position`, not a
       per-world class list), so a new fixed layer added to any world is
       picked up for free. HUM (01) already carries its own impulse-aware
       push through `kick` in world01.js's exit()/enter() and lives outside
       `host` entirely — excluded here so it is never shoved twice.
       `composition: 'blend'` (this vendored build has no 'add'; its
       composition enum is `{replace:0,none:1,blend:2}`, and the string is
       looked up against it directly) lets this compose with whatever a
       world's own exit() does to the same element rather than one replacing
       the other. A click leaves `ctx.impulse` null and skips this entirely —
       the whole point is that only a throw feels shoved. Out and fully back
       to rest inside 150ms, well clear of `coverEnd` (380ms), so the
       destination never inherits any of it. */
    if (ctx.impulse && !motion.reduced && ctx.from && ctx.from !== HOME && from?.root) {
      const dir = towards(spec.corner);
      const reach = 10 + ctx.impulse.strength * 18; // 10–28px
      // The root itself can be the fixed layer (SOMEWHERE's `.sw` is —
      // `position: fixed; inset: 0` — the whole world is one viewport-sized
      // stage, not a scrollable document with fixed chrome around it), so it
      // is checked too, not just its descendants.
      const layers = [];
      if (getComputedStyle(from.root).position === 'fixed') layers.push(from.root);
      for (const el of from.root.querySelectorAll('*')) {
        if (getComputedStyle(el).position === 'fixed') layers.push(el);
      }
      if (layers.length) {
        timeline.add(layers, {
          x: [0, dir.x * reach, 0],
          y: [0, dir.y * reach, 0],
          duration: 150,
          ease: EASE.exit,
          composition: 'blend',
        }, 0);
      }
    }

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
