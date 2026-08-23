// HUM — the first screen.
//
// The hero has to do three things in about four seconds, in this order, or the
// idea does not land:
//
//   1. Read as a still, confident piece of typography. If it arrives already
//      busy, there is nothing for the movement to be a change FROM.
//   2. Come alive by itself — objects settle, then somebody else's cursor walks
//      in and moves one of them. Nobody clicks anything to make this happen.
//      And it does not stop: after the scripted arrival the three of them keep
//      working the canvas indefinitely, because a room that goes still after
//      seven seconds is a room that was only ever a loading animation.
//   3. Hand over. The moment the visitor touches anything, the demonstration
//      stops and gets out of the way. A scripted hand fighting a real one is
//      the single worst thing a page like this can do.
//
// Point 3 is why `handOver` exists and why every scripted beat checks it — and
// why it is triggered ONLY by a real grab or an arrow key. Scrolling past is
// not the visitor taking the canvas; see the note on the observer at the foot
// of this file.

import {
  animate, createTimeline, stagger, utils, prepLines, revealLines,
  inView, frame, scroll, motion, hasHover, EASE, SPRING, $, $$,
} from './motion.js';
import { heroObjects } from './content.js';
import { object } from './parts.js';
import { enterObjects, makeDraggable, placeObjects, onLayoutChange } from './canvas.js';
import { createPresence } from './cursors.js';

export function initHero() {
  const hero = $('#hero');
  const stage = $('#hero-stage');
  const title = $('#hero-title');
  if (!hero || !stage || !title) return { entrance: null };

  const lines = prepLines(title);
  const swipe = $('.hero-swipe', stage);

  /* ── BUILD ─────────────────────────────────────────────────────────────── */
  const fragment = document.createDocumentFragment();
  for (const data of heroObjects) fragment.appendChild(object(data));
  stage.appendChild(fragment);

  const nodes = $$('.obj', stage);
  placeObjects(heroObjects, { root: stage });
  const drags = makeDraggable(stage, { onGrab: () => handOver() });
  onLayoutChange(() => placeObjects(heroObjects, { root: stage, drags }));

  const presence = hasHover || !motion.reduced
    ? createPresence(stage, ['mara', 'alex', 'juno'])
    : null;

  /* ── HAND-OVER ─────────────────────────────────────────────────────────
     One flag, checked by every beat. Set by the first real interaction — a
     drag, a keypress on an object, or simply scrolling away. The cursors leave
     politely rather than vanishing. */
  const PEOPLE = ['mara', 'alex', 'juno'];

  let handedOver = false;
  let sequence = null;

  // Idle drift, one looping animation per person, held by id so a person about
  // to reach for something can have theirs stopped first. Two animations
  // writing x and y on one cursor is a cursor that stutters.
  const driftOf = new Map();
  // Objects a scripted hand is currently holding, so two of them never reach
  // for the same one.
  const busy = new Set();

  function startDrift(id) {
    driftOf.get(id)?.pause();
    const d = presence?.drift(id);
    if (d) driftOf.set(id, d);
    else driftOf.delete(id);
  }

  function stopDrift(id) {
    driftOf.get(id)?.pause();
    driftOf.delete(id);
  }

  function stopAllDrift() {
    for (const d of driftOf.values()) d?.pause();
    driftOf.clear();
  }

  function handOver() {
    if (handedOver) return;
    handedOver = true;
    sequence?.pause();
    ambient?.pause();
    window.clearTimeout(ambientTimer);
    stopAllDrift();
    if (!presence) return;
    PEOPLE.forEach((id, i) => presence.hide(id, { delay: i * 90 }));
  }

  stage.addEventListener('keydown', (event) => {
    if (event.key.startsWith('Arrow')) handOver();
  });

  /* ── ENTRANCE ──────────────────────────────────────────────────────────
     Returned to design.js so the curtain and the hero are ONE timeline rather
     than two that have to be kept in agreement about when the other is done.
     `at` is where the hero's own beats begin on that shared clock. */
  function entrance(timeline, at = 0) {
    const eyebrow = $$('.hero-eyebrow > *', hero);
    const rail = $$('.hero-rail > *', hero);

    if (motion.reduced) {
      revealLines(lines);
      utils.set([...eyebrow, ...rail, ...nodes], { opacity: 1, y: 0 });
      if (swipe) utils.set(swipe, { scaleX: 1 });
      return;
    }

    utils.set([...eyebrow, ...rail], { opacity: 0, y: 12 });
    utils.set(nodes, { opacity: 0 });

    // The headline first, and alone. Everything else is timed off it.
    timeline.add(lines.map((l) => l.inner), {
      y: ['110%', '0%'],
      duration: 1050,
      delay: stagger(95),
      ease: EASE.rise,
    }, at + 0);

    // The highlighter arrives late enough to read as a separate gesture — a
    // hand coming back to mark the word it already wrote.
    if (swipe) {
      timeline.add(swipe, {
        scaleX: [0, 1],
        duration: 620,
        ease: EASE.mark,
      }, at + 620);
    }

    timeline.add(eyebrow, {
      opacity: 1, y: 0, duration: 620, delay: stagger(60), ease: EASE.rise,
    }, at + 320);

    timeline.add(rail, {
      opacity: 1, y: 0, duration: 700, delay: stagger(80), ease: EASE.rise,
    }, at + 520);

    // Then the canvas fills in. Objects drop last, so the page reads as
    // typography that the workspace assembles itself around.
    timeline.call(() => enterObjects(nodes, { step: 105 }), at + 760);

    // And then somebody else turns up.
    timeline.call(() => { if (!handedOver) sequence = play(); }, at + 1900);
  }

  /* ── THE UNPROMPTED BEAT ───────────────────────────────────────────────
     MARA arrives, moves the note, and stays. ALEX glances at the image. JUNO
     drops in on the comment. Then all three settle into drift.

     The note is moved through its own Draggable instance, not by writing a
     transform onto the element — so when the visitor grabs it a moment later,
     it is exactly where the scripted hand left it. */
  function play() {
    if (!presence) return null;
    const timeline = createTimeline({ defaults: { ease: EASE.soft } });
    const noteNode = stage.querySelector('[data-obj="h-note"]');
    const tileNode = stage.querySelector('[data-obj="h-tile"]');
    const noteDrag = drags.get('h-note');
    let release = null;
    let alexRelease = null;

    /* TIMING NOTE. Every cursor gets to FINISH arriving before it is asked to go
       anywhere: an arrival and a move are two animations on the same two
       properties, and overlapping them means the second one inherits a position
       the first had not reached yet — which looks like a cursor teleporting.
       Hence the gaps below; none of them is arbitrary. */

    // MARA arrives, picks the note up, moves it, and stands beside it.
    timeline.call(() => presence.show('mara', { x: 16, y: 92 }), 0);
    timeline.call(() => { if (noteNode) presence.moveToObject('mara', noteNode, { duration: 1100 }); }, 1000);
    timeline.call(() => {
      if (handedOver || !noteNode) return;
      presence.press('mara');
      release = presence.select('mara', noteNode);
      noteNode.classList.add('is-held');
    }, 2150);

    // The move itself: a short weighted shove, not a glide across the screen.
    // The cursor parks clear of the note rather than on top of its label.
    timeline.call(() => {
      if (handedOver || !noteDrag) return;
      noteDrag.animate[noteDrag.xProp](-26, 900);
      noteDrag.animate[noteDrag.yProp](-34, 900);
      // Parked clear of the headline: at 24/76 she comes to rest on top of
      // ALIVE., and a name flag sitting on the one word the page is about is
      // the wrong kind of alive.
      presence.moveTo('mara', { x: 27, y: 88 }, { duration: 900 });
    }, 2350);

    timeline.call(() => {
      noteNode?.classList.remove('is-held');
      release?.();
      release = null;
    }, 3350);

    // ALEX looks at the image, then lets go of it again. A selection that gets
    // released is what tells you these are people rather than a loop.
    timeline.call(() => presence.show('alex', { x: 90, y: 6 }), 2600);
    timeline.call(() => { if (tileNode) presence.moveToObject('alex', tileNode, { duration: 950 }); }, 3600);
    timeline.call(() => {
      if (handedOver || !tileNode) return;
      presence.press('alex');
      alexRelease = presence.select('alex', tileNode);
    }, 4650);
    timeline.call(() => { alexRelease?.(); alexRelease = null; }, 6000);

    // JUNO drops in on her own comment and says nothing.
    timeline.call(() => presence.show('juno', { x: 78, y: 98 }), 4800);
    timeline.call(() => presence.moveTo('juno', { x: 70, y: 82 }, { duration: 900 }), 5800);
    timeline.call(() => { if (!handedOver) presence.press('juno'); }, 6800);

    // Settle, and then keep going. The scripted take is an introduction, not
    // the whole performance — it hands the canvas to the ambient loop below.
    timeline.call(() => {
      if (handedOver) return;
      beginAmbient();
    }, 7300);

    return timeline;
  }

  /* ── THE ROOM KEEPS WORKING ─────────────────────────────────────────────
     The scripted arrival is six beats long and then it is over. On its own
     that reads as a canned intro: three cursors walk in, do a trick, and stand
     there for as long as you care to watch. The whole claim of this page is
     that the surface is ALIVE, and a surface that stops moving after seven
     seconds has just disproved it in front of you.

     So after the introduction the same three people go on working, picking an
     object and shoving it a little, indefinitely, until the visitor takes over.
     It is deliberately unhurried — one person at a time, a second or two of
     nothing between beats, and never the same person twice in a row — because
     the failure mode on the other side is a screen that never settles, which
     is just as unreadable as one that never moves.

     EVERY SHOVE GOES THROUGH THE OBJECT'S OWN DRAGGABLE, exactly as the
     keyboard nudge does, and is clamped to the same walls a pointer hits. Two
     consequences, both of which matter: an ambient hand can never walk a thing
     somewhere a visitor could not have dragged it, and when the visitor does
     grab that object a moment later it is precisely where the scripted hand
     left it — because there is one source of truth for where a thing is, and
     nothing here writes a transform behind the Draggable's back. */

  const AMBIENT = {
    settle: [1500, 3400],   // quiet between beats
    travel: [820, 1200],    // how long a cursor takes to reach a thing
    shove: 900,
    reach: [-72, 72],       // how far a thing gets pushed, in px
    lift: [-54, 54],
  };

  let ambient = null;
  let ambientTimer = 0;
  let ambientReady = false;
  let lastActor = null;
  // Whoever is mid-reach. Their drift must stay off until they let go, or the
  // two animations fight over the same cursor's x and y.
  let acting = null;

  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  function queueAmbient(delay) {
    window.clearTimeout(ambientTimer);
    ambientTimer = window.setTimeout(ambientBeat, delay);
  }

  /* Never the same person twice running: the point is that there are several
     of them, and a single cursor doing all the work reads as one bot. */
  function pickActor() {
    const actor = pick(PEOPLE.filter((id) => id !== lastActor)) ?? PEOPLE[0];
    lastActor = actor;
    return actor;
  }

  /* Anything not already in somebody's hand — including the visitor's. */
  function pickObject() {
    const free = [];
    for (const [id, drag] of drags) {
      if (busy.has(id)) continue;
      const node = stage.querySelector(`[data-obj="${id}"]`);
      if (!node || node.dataset.dragging === 'true') continue;
      free.push({ id, node, drag });
    }
    return free.length ? pick(free) : null;
  }

  /* The shove. Returns the delta it actually applied AFTER the clamp, so the
     cursor can travel exactly as far as the thing it is carrying rather than
     to where the thing was going to be. */
  function shove(drag) {
    const [top, right, bottom, left] = drag.containerBounds;
    const fromX = drag.x;
    const fromY = drag.y;
    const toX = utils.clamp(fromX + utils.random(...AMBIENT.reach), left, right);
    const toY = utils.clamp(fromY + utils.random(...AMBIENT.lift), top, bottom);
    drag.animate[drag.xProp](toX, AMBIENT.shove);
    drag.animate[drag.yProp](toY, AMBIENT.shove);
    return { dx: toX - fromX, dy: toY - fromY };
  }

  function beginAmbient() {
    if (handedOver || !presence) return;
    ambientReady = true;
    for (const id of PEOPLE) startDrift(id);
    queueAmbient(utils.random(900, 1800));
  }

  function ambientBeat() {
    if (handedOver || !presence) return;
    // Off screen or in a background tab, the loop keeps its place and spends
    // nothing. It is not over — it is waiting.
    if (!visible || document.hidden) { queueAmbient(1200); return; }

    const target = pickObject();
    if (!target) { queueAmbient(utils.random(...AMBIENT.settle)); return; }

    const actor = pickActor();
    const travel = utils.random(...AMBIENT.travel);
    let release = null;

    busy.add(target.id);
    acting = actor;
    stopDrift(actor);

    const beat = createTimeline({ defaults: { ease: EASE.soft } });

    beat.call(() => {
      if (handedOver) return;
      presence.moveToObject(actor, target.node, { duration: travel });
    }, 0);

    beat.call(() => {
      if (handedOver) return;
      presence.press(actor);
      release = presence.select(actor, target.node);
      target.node.classList.add('is-held');
    }, travel + 140);

    beat.call(() => {
      if (handedOver) return;
      const { dx, dy } = shove(target.drag);
      // The hand goes with what it is holding. Reading the object's rect again
      // here would aim the cursor at where the object IS, which is the start of
      // its travel, not the end — so the delta is used instead.
      const cursor = presence.cursors.get(actor);
      const r = stage.getBoundingClientRect();
      if (cursor && r.width && r.height) {
        presence.moveTo(actor, {
          x: ((cursor.x + dx) / r.width) * 100,
          y: ((cursor.y + dy) / r.height) * 100,
        }, { duration: AMBIENT.shove });
      }
    }, travel + 320);

    beat.call(() => {
      target.node.classList.remove('is-held');
      release?.();
      release = null;
      busy.delete(target.id);
      if (acting === actor) acting = null;
      // Not while off screen: a looping drift on a cursor nobody can see is
      // the one cost this whole loop is arranged to avoid.
      if (!handedOver && visible) startDrift(actor);
    }, travel + 320 + AMBIENT.shove + 260);

    beat.call(() => {
      if (!handedOver) queueAmbient(utils.random(...AMBIENT.settle));
    }, travel + 320 + AMBIENT.shove + 400);

    ambient = beat;
  }

  /* ── LEAVING ───────────────────────────────────────────────────────────
     Parallax, once, on one container — see the note in the frame below for why
     it is the type layer and not the objects.

     The scroll cue is not a loop either: it fills with the hero's own scroll
     progress, so it reports something true instead of miming. */
  const typeLayer = $('.hero-type', hero);
  const cueFill = $('.hero-scroll-line i', hero);
  let visible = true;

  /* SCROLLING PAST IS NOT A HAND-OVER. It used to call `handOver`, which meant
     leaving the first screen ended the collaborators permanently — scroll down,
     come back, and the room you were told was alive is empty and stays empty
     for the rest of the visit. The flag is meant for the visitor TAKING the
     canvas, and reading further down the page is not that.

     So this pauses instead: the drift animations stop, the ambient loop keeps
     its place and spends nothing while off screen, and coming back finds the
     three of them still working. Only a real grab or an arrow key ends it. */
  inView(hero, {
    amount: 0,
    onEnter: () => {
      visible = true;
      if (handedOver || !ambientReady || !presence) return;
      for (const id of PEOPLE) if (id !== acting && !driftOf.has(id)) startDrift(id);
      queueAmbient(utils.random(500, 1300));
    },
    onLeave: () => {
      visible = false;
      window.clearTimeout(ambientTimer);
      stopAllDrift();
    },
  });

  if (!motion.reduced) {
    frame.add(() => {
      if (!visible) return;
      const height = hero.offsetHeight || 1;
      const p = utils.clamp(scroll.y / height, 0, 1);
      // Parallax on the type layer ONLY. The objects deliberately do not move:
      // their transform belongs to the drag layer, and translating an ancestor
      // of a draggable shifts the bounds the pointer maths was measured
      // against. The words drifting past a canvas that stays put is the depth
      // cue, and it costs one transform.
      if (typeLayer) typeLayer.style.transform = `translate3d(0, ${(-p * 74).toFixed(2)}px, 0)`;
      if (cueFill) cueFill.style.transform = `translateY(${(-100 + p * 260).toFixed(1)}%)`;
    });
  }

  return { entrance, stage, drags, handOver };
}

/* ══ THE CLOSING GESTURE ═══════════════════════════════════════════════════
   START A PROJECT does something. It scrolls back to the hero and drops a fresh
   note onto the canvas, tagged YOU — which is the only honest thing a CTA on a
   fictional product can do, and it is the payoff for the whole page: the last
   click puts something of yours on the surface you have been watching. */
export function initStartAction(hero) {
  const button = $('#cta-btn');
  if (!button || !hero?.stage) return;
  let count = 0;

  button.addEventListener('click', () => {
    count += 1;
    const note = object({
      kind: 'note',
      id: `you-note-${count}`,
      x: 8 + ((count * 13) % 52),
      y: 14 + ((count * 21) % 46),
      rot: -6 + ((count * 5) % 12),
      w: 196,
      tone: 'paper',
      label: `NOTE / YOU`,
      body: count === 1 ? 'a project. mine.' : 'and another one.',
      drag: true,
    });
    hero.stage.appendChild(note);

    // Made draggable and dropped — the new note is a first-class object, not a
    // decoration. makeDraggable skips anything it has already wired, so calling
    // it again over the whole stage costs one pass and no duplicates.
    makeDraggable(hero.stage);
    enterObjects([note], { step: 0 });

    document.getElementById('hero-title')?.scrollIntoView({
      behavior: motion.reduced ? 'auto' : 'smooth',
      block: 'center',
    });

    if (motion.reduced) return;
    animate(button, { scale: [1, 0.97, 1], duration: 460, ease: SPRING.ui });
  });
}
