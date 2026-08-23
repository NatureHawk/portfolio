// THE WORLD FRAME — the shared skeleton behind worlds 02, 03 and 04.
//
// Three of the four worlds do not exist yet. What exists is the ARCHITECTURE
// they will be built inside, and this file is it: a mounted, self-contained
// panel with its own ground, its own type, its own palette and its own arrival
// choreography — everything a world needs in order to be entered, except the
// site itself.
//
// It is deliberately not a placeholder screen. A placeholder announces that
// nothing is there; this announces what IS there and when. The moment one of
// these becomes a real site, its module stops calling `worldFrame` and builds
// its own DOM instead — nothing else in the system has to change, because the
// shell only ever talks to the handle returned at the bottom of this file.
//
// THE HANDLE is the contract every world implements:
//
//   root            the element the shell shows and hides
//   show / hide     become / stop being the live world
//   enter(tl, ctx)  arrive, out of the corner the visitor came through
//   exit(tl, ctx)   leave, towards the corner they are heading for
//   settle()        the transition is over; start anything ambient
//
// Everything in `enter` and `exit` is transform and opacity. Nothing here
// measures layout while a transition is running.

import { animate, utils, motion, EASE, el, $, $$ } from '../motion.js';
import { CORNERS, towards } from './corners.js';

/* The five beats of an arrival, in the order they land. Short — the whole
   sequence is over in about 240ms — because the visitor is already looking at
   this world by the time it starts; a slow stagger would read as a page
   assembling itself rather than as a world that was already there. */
const BEATS = [
  ['ground', 0],
  ['art', 40],
  ['title', 80],
  ['bar', 140],
  ['small', 180],
];

export function worldFrame(spec, host, context = {}) {
  const root = el('section', 'wframe');
  root.dataset.world = spec.id;
  root.dataset.state = 'idle';
  root.tabIndex = -1;
  root.setAttribute('aria-label', `${spec.name} — world ${spec.id}`);
  root.style.setProperty('--w-paper', spec.paper);
  root.style.setProperty('--w-ink', spec.ink);
  root.style.setProperty('--w-accent', spec.accent);
  // The ground's own light comes from the doorway: the wash is centred on the
  // corner this world is entered through, so the screen is brightest exactly
  // where the portal just was.
  root.style.setProperty('--w-origin', `${CORNERS[spec.corner].x * 100}% ${CORNERS[spec.corner].y * 100}%`);

  root.innerHTML = `
    <div class="wframe-ground" aria-hidden="true"></div>
    <div class="wframe-art" aria-hidden="true">${spec.art?.() ?? ''}</div>

    <header class="wframe-bar">
      <p class="wframe-id"><b>${spec.id}</b><span>${spec.name}</span></p>
      <button class="wframe-home" type="button" data-cursor="BACK">
        <i aria-hidden="true">←</i>${spec.home ?? 'HUM'}
      </button>
    </header>

    <div class="wframe-mid">
      <p class="wframe-kicker">${spec.kicker}</p>
      <h1 class="wframe-title">${spec.name}</h1>
      <p class="wframe-line">${spec.line}</p>
    </div>

    <footer class="wframe-foot">
      <p class="wframe-state"><i aria-hidden="true"></i>${spec.state ?? 'OPENS SOON'}</p>
      <p class="wframe-hint">${spec.hint ?? 'THREE MORE, ONE IN EACH CORNER'}</p>
    </footer>
  `;

  host.appendChild(root);

  const parts = {
    ground: $('.wframe-ground', root),
    art: $('.wframe-art', root),
    title: $('.wframe-title', root),
    bar: $('.wframe-bar', root),
    small: [$('.wframe-kicker', root), $('.wframe-line', root), ...$$('.wframe-foot > *', root)],
  };

  $('.wframe-home', root)?.addEventListener('click', () => context.travel?.('01'));

  /* ── ARRIVAL ─────────────────────────────────────────────────────────────
     Everything comes out of the corner the visitor pressed. The ground scales
     from it, the rest slides along the diagonal from it — one direction for the
     whole screen, so the world reads as a single object being pushed into
     place rather than as five independent entrances that happen to agree. */
  function enter(timeline, ctx) {
    const dir = towards(ctx.corner);
    const c = CORNERS[ctx.corner];
    const at = ctx.at ?? 0;

    if (motion.reduced || !timeline) {
      utils.set([parts.ground, parts.art, parts.title, parts.bar, ...parts.small], {
        opacity: 1, x: 0, y: 0, scale: 1,
      });
      return;
    }

    // The ground grows out of the corner itself, which is why its origin is the
    // corner and not the centre — the world unfolds from the doorway.
    utils.set(parts.ground, {
      transformOrigin: `${c.x * 100}% ${c.y * 100}%`,
      scale: 1.14,
      opacity: 1,
    });
    timeline.add(parts.ground, {
      scale: 1,
      duration: 620,
      ease: EASE.rise,
    }, at + BEATS[0][1]);

    const moving = [
      [parts.art, 54],
      [parts.title, 40],
      [parts.bar, 26],
    ];
    for (const [index, [node, distance]] of moving.entries()) {
      if (!node) continue;
      utils.set(node, { x: dir.x * distance, y: dir.y * distance, opacity: 0 });
      timeline.add(node, {
        x: 0, y: 0, opacity: 1,
        duration: 620,
        ease: EASE.rise,
      }, at + BEATS[index + 1][1]);
    }

    const small = parts.small.filter(Boolean);
    utils.set(small, { x: dir.x * 18, y: dir.y * 18, opacity: 0 });
    timeline.add(small, {
      x: 0, y: 0, opacity: 1,
      duration: 520,
      delay: (_, i) => i * 45,
      ease: EASE.rise,
    }, at + BEATS[4][1]);

    // A world may add its own signature beat on top of the shared five — see
    // world04's scatter settling, or world03's counterweight on the glyph.
    spec.choreo?.(timeline, { ...ctx, at }, parts);
  }

  /* ── DEPARTURE ───────────────────────────────────────────────────────────
     The mirror image, compressed into a third of the time. The world does not
     dissolve; it leans towards the corner it is being pulled through, so the
     portal reads as having weight. */
  function exit(timeline, ctx) {
    if (motion.reduced || !timeline) return;
    const dir = towards(ctx.corner);
    const stack = [parts.title, parts.art, parts.bar, ...parts.small].filter(Boolean);

    timeline.add(stack, {
      x: dir.x * 30,
      y: dir.y * 30,
      opacity: 0,
      duration: 300,
      delay: (_, i) => i * 22,
      ease: EASE.exit,
    }, 0);

    timeline.add(parts.ground, {
      scale: 0.965,
      duration: 340,
      ease: EASE.exit,
    }, 0);
  }

  let ambient = null;

  return {
    id: spec.id,
    root,

    show() {
      root.dataset.state = 'live';
      window.scrollTo(0, 0);
    },

    hide() {
      root.dataset.state = 'idle';
      ambient?.pause?.();
      ambient = null;
    },

    enter,
    exit,

    settle() {
      root.focus({ preventScroll: true });
      // The one thing that keeps breathing: the status dot. It is the same
      // honesty rule the HUM meter follows — it marks a state that is true
      // (this world is not finished) rather than faking activity.
      const dot = $('.wframe-state i', root);
      if (!dot || motion.reduced) return;
      ambient = animate(dot, {
        opacity: [0.25, 1],
        duration: 1900,
        ease: EASE.wave,
        loop: true,
        alternate: true,
      });
    },

    destroy() {
      ambient?.pause?.();
      utils.remove(root);
      root.remove();
    },
  };
}
