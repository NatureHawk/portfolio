// HUM — /design
//
// Website 01 of the design section. The entry point: it wires the page together
// and owns the arrival sequence, and nothing else. Every behaviour lives in a
// module under design/:
//
//   motion.js    one clock, one pointer, one scroll value, the easing vocabulary
//   parts.js     the object vocabulary — notes, tiles, comments, procedural art
//   canvas.js    what makes an object real: drag, keyboard, placement, links
//   cursors.js   other people's cursors, and yours
//   chrome.js    nav, status strip, the HUM meter, shared micro-interactions
//   hero.js      section 01 and the closing gesture
//   story.js     sections 02, 03, 04
//   product.js   sections 05, 06, 07, 08
//   worlds/      the four corners: this site is one of four, and the shell that
//                moves between them lives there rather than in any of them
//
// ORDER MATTERS EXACTLY ONCE. Everything is built and wired first, and only then
// does the curtain lift — so the page is complete and interactive before it is
// visible, and the entrance is a reveal rather than a wait. If anything in the
// build throws, the curtain still goes (see the `finally`): a broken module must
// never leave a visitor looking at a blank panel.

import { createTimeline, utils, motion, EASE, $ } from './design/motion.js';
import {
  initBackLinks, initNav, initSpine, initPeople, initMeter, initMagnets,
  initPlates, initCopyReveals, initMotionToggle,
} from './design/chrome.js';
import { userCursor } from './design/cursors.js';
import { initHero, initStartAction } from './design/hero.js';
import { initStill, initMoves, initTogether } from './design/story.js';
import { initWorkspace, initFaster, initDesk, initClosing } from './design/product.js';
import { createShell } from './design/worlds/shell.js';

/* ══ BUILD ═════════════════════════════════════════════════════════════════ */

let hero = null;
let worlds = null;

try {
  initBackLinks();
  initNav();
  initMotionToggle();
  initSpine();
  initPeople();
  initPlates();
  initCopyReveals();
  initMagnets();

  // The cursor system announces itself with a class, and the CSS hides the
  // native pointer over canvases only once that class is present — so a failure
  // above this line cannot leave anyone without a cursor.
  userCursor();
  document.body.classList.add('has-ucur');

  hero = initHero();
  initStill();
  initMoves();
  initTogether();
  initWorkspace();
  initFaster();
  initDesk();
  initClosing();
  initStartAction(hero);

  initMeter($('#meter'));
  initMeter($('#cta-hum'), { bars: 22 });
} catch (error) {
  // Deliberately swallowed to a console warning. A page whose whole argument is
  // "this is alive" fails better as a static, readable document than as a
  // curtain that never lifts.
  console.warn('HUM: build failed, falling back to the static page.', error);
}

/* ══ THE OTHER THREE ═══════════════════════════════════════════════════════
   HUM is website 01 of four, one per corner of the screen. The shell mounts the
   corner controls, the portal layer and — on approach, never on click — the
   world behind whichever corner a hand is moving towards.

   It is built in its own try/catch and it is built LAST, so a page that has
   already assembled itself cannot be taken down by the navigation on top of it:
   worst case, this site loses its three doors and stays a complete site. */
try {
  worlds = createShell({ hero });
} catch (error) {
  console.warn('HUM: the world shell failed to start; the page stays on 01.', error);
}

/* ══ ARRIVAL ═══════════════════════════════════════════════════════════════
   Four beats and about 1.4 seconds. The rule draws while the fonts settle, the
   wordmark steps aside, the curtain lifts out of the top of the frame, and the
   hero is already rising underneath it as it goes — so the reveal shows motion
   in progress rather than a finished screen waiting to be uncovered.

   The page can be scrolled and touched from the moment the curtain starts
   moving, not when it finishes. */
const curtain = $('#arrive');
const START_HERO_AT = 700;

function release() {
  document.body.classList.remove('is-arriving');
  // The corners wake as the curtain starts to lift, not before it: four numbers
  // fading up under a panel that is still covering them is four numbers nobody
  // ever sees arrive.
  worlds?.reveal();
}

function finish() {
  curtain?.remove();
  release();
}

function arrive() {
  if (motion.reduced || !curtain) {
    finish();
    hero?.entrance?.(createTimeline(), 0);
    return;
  }

  const timeline = createTimeline({ defaults: { ease: EASE.rise } });

  timeline.add('#arrive .arrive-rule i', {
    scaleX: [0, 1],
    duration: 520,
    ease: EASE.glide,
  }, 0);

  timeline.add('#arrive .arrive-mark, #arrive .arrive-note', {
    opacity: 0,
    y: -14,
    duration: 400,
    ease: EASE.soft,
  }, 380);

  timeline.add(curtain, {
    y: '-101%',
    duration: 860,
    ease: EASE.curtain,
    onComplete: finish,
  }, 480);

  // Interaction is handed back as the curtain starts to move, not when it lands.
  timeline.call(release, 560);

  hero?.entrance?.(timeline, START_HERO_AT);
}

/* Fonts first, but never at the cost of the arrival: the display face is doing
   real work in the hero (the width axis is the page's signature), so a swap
   mid-reveal would be visible. 900ms is the whole patience budget — after that
   the curtain lifts on whatever is loaded. */
const fontsReady = document.fonts?.ready ?? Promise.resolve();
Promise.race([fontsReady, new Promise((resolve) => window.setTimeout(resolve, 900))]).then(() => {
  // Two frames: one for the newly-swapped face to lay out, one to be sure it
  // landed before anything measures a line box.
  requestAnimationFrame(() => requestAnimationFrame(arrive));
});

/* A safety net for the case where neither promise ever settles (a font host
   hanging behind a captive portal, say). Without it the curtain is permanent. */
window.setTimeout(() => {
  if (document.body.classList.contains('is-arriving')) {
    utils.set(curtain, { opacity: 0 });
    finish();
  }
}, 4000);
