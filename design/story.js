// HUM — sections 02, 03 and 04: the argument, the proof, and the payoff.
//
//   02  A document comes apart as you scroll. The claim is "ideas are not
//       static", so the page takes a static thing apart in front of you rather
//       than writing the claim in bigger type.
//   03  A choreographed take: four people editing one board, with a session log
//       written by the same score that drives the animation — so the log can
//       never describe something that did not happen.
//   04  The assembly. Scroll-scrubbed, not autoplayed: the visitor assembles the
//       poster, which is the difference between a demonstration and a video.

import {
  animate, createTimeline, utils, prepLines, revealLines, typeText,
  scrubber, inView, frame, scroll, motion, EASE, SPRING, $, $$, el,
} from './motion.js';
import { movesBoard, movesScore, movesHome, byId } from './content.js';
import { object } from './parts.js';
import {
  enterObjects, makeDraggable, placeObjects, onLayoutChange, linkObjects, activePos,
} from './canvas.js';
import { createPresence } from './cursors.js';

/* Headline reveal, shared by all three sections. Masked lines rise once, when
   the block arrives. */
function revealHead(id) {
  const host = $(id);
  if (!host) return;
  const lines = prepLines(host);
  if (motion.reduced) { revealLines(lines); return; }
  utils.set(lines.map((l) => l.inner), { y: '110%' });
  inView(host, {
    once: true,
    amount: 0.5,
    margin: '0px 0px -8% 0px',
    onEnter: () => revealLines(lines, { stagger: 95, duration: 980 }),
  });
}

/* ══ 02 · IDEAS ARE NOT STATIC ═════════════════════════════════════════════ */

export function initStill() {
  revealHead('#still-title');
  initFlat();
  initMarquee();
}

/* The document that comes apart. Every piece carries its own destination in
   `data-loose`, and one scrubber interpolates all six — so this is one style
   write per piece per frame, and nothing measures anything mid-scroll. */
function initFlat() {
  const flat = $('#flat');
  const state = $('#flat-state');
  if (!flat) return;

  const pieces = $$('.flat-piece', flat).map((node) => {
    const [dx, dy, rot] = (node.dataset.loose ?? '0,0,0').split(',').map(Number);
    return { node, dx, dy, rot };
  });

  if (motion.reduced) {
    // Nothing to scrub, so show the honest end state: loose, and legible.
    flat.classList.add('is-loose');
    for (const { node, dx, dy, rot } of pieces) {
      node.style.transform = `translate3d(${dx * 0.42}px, ${dy * 0.42}px, 0) rotate(${rot * 0.5}deg)`;
    }
    if (state) state.textContent = 'SIX LIVE THINGS';
    return;
  }

  let label = '';
  scrubber(
    flat,
    (p) => {
      // Eased so the pieces hold together for the first part of the scroll and
      // then let go — a linear break-up reads as a slider, not a decision.
      const e = p * p * (3 - 2 * p);
      for (const { node, dx, dy, rot } of pieces) {
        node.style.transform =
          `translate3d(${(dx * e).toFixed(1)}px, ${(dy * e).toFixed(1)}px, 0) rotate(${(rot * e).toFixed(2)}deg)`;
      }
      flat.classList.toggle('is-loose', p > 0.1);

      const next = p < 0.08 ? 'KEEP SCROLLING' : p < 0.7 ? 'COMING APART' : 'SIX LIVE THINGS';
      if (next !== label && state) { label = next; state.textContent = next; }
    },
    { start: 0.9, end: 0.35 }
  );
}

/* The band. The one linear-eased thing on the page, because it is the one thing
   that is supposed to look mechanical — and scroll velocity pushes it, so the
   reader's own motion drives it. */
function initMarquee() {
  const marq = $('#marq');
  const row = $('#marq-row');
  if (!marq || !row) return;

  // Two copies is the minimum for a seamless wrap; a third covers ultra-wide.
  const phrase = 'IDEAS ARE NOT STATIC';
  const copy = () => {
    const span = el('span');
    span.append(document.createTextNode(phrase), el('i'));
    return span;
  };
  for (let i = 0; i < 6; i += 1) row.appendChild(copy());

  if (motion.reduced) return;

  let x = 0;
  let width = 0;
  let stop = null;

  const measure = () => { width = row.scrollWidth / 2; };
  measure();
  window.addEventListener('resize', measure, { passive: true });

  const run = (dt) => {
    if (!width) measure();
    // Base creep plus a velocity term. The sign never flips: a marquee that
    // reverses direction reads as broken rather than as responsive.
    const speed = 0.035 + Math.min(Math.abs(scroll.velocity) * 0.014, 0.5);
    x -= speed * dt;
    if (x <= -width) x += width;
    row.style.transform = `translate3d(${x.toFixed(1)}px, 0, 0)`;
  };

  inView(marq, {
    amount: 0,
    margin: '10% 0px 10% 0px',
    onEnter: () => { stop ??= frame.add(run); },
    onLeave: () => { stop?.(); stop = null; },
  });
}

/* ══ 03 · EVERYTHING MOVES ═════════════════════════════════════════════════ */

export function initMoves() {
  revealHead('#moves-title');

  const board = $('#moves-board');
  const list = $('#log-list');
  const count = $('#log-count');
  const replay = $('#log-replay');
  if (!board) return;

  /* ── BUILD ─────────────────────────────────────────────────────────────── */
  const fragment = document.createDocumentFragment();
  for (const data of movesBoard) fragment.appendChild(object({ ...data, drag: true }));
  board.appendChild(fragment);

  const nodes = $$('.obj', board);
  placeObjects(movesBoard, { root: board });
  const drags = makeDraggable(board);
  onLayoutChange(() => placeObjects(movesBoard, { root: board, drags }));

  const presence = createPresence(board, ['mara', 'alex', 'juno', 'you']);
  const noteNode = board.querySelector('[data-obj="m-note"]');
  const typeWord = board.querySelector('[data-obj="m-type"] [data-word]');
  const originalWord = typeWord?.textContent ?? '';

  let take = null;
  let links = [];
  let releases = [];
  let drifts = [];
  let logged = 0;

  /* ── THE LOG ───────────────────────────────────────────────────────────
     Written by the score, at the moment the beat fires. Elapsed time is real:
     it is read off the timeline, not typed into the data. */
  const logRow = (who, what, at) => {
    const person = byId(who);
    const row = el('div', 'log-row');
    row.innerHTML = `
      <span class="log-who" data-tone="${person?.tone ?? 'ink'}">${person?.initials ?? '??'}</span>
      <span class="log-what"><b>${person?.name ?? ''}</b> ${what}</span>
      <span class="log-when">${(at / 1000).toFixed(1)}s</span>`;
    list?.prepend(row);
    logged += 1;
    if (count) count.textContent = `${logged} EVENT${logged === 1 ? '' : 'S'}`;
    if (motion.reduced) return;
    animate(row, { opacity: [0, 1], y: [-8, 0], duration: 420, ease: EASE.rise });
  };

  /* ── RESET ─────────────────────────────────────────────────────────────
     A replay has to put the board back, or the second take starts from wherever
     the first one left off and stops making sense. */
  const reset = () => {
    take?.pause();
    take = null;
    for (const drift of drifts) drift?.pause();
    drifts = [];
    for (const link of links) link.remove();
    links = [];
    for (const release of releases) release?.();
    releases = [];
    logged = 0;
    if (list) list.textContent = '';
    if (count) count.textContent = '0 EVENTS';
    if (typeWord) typeWord.textContent = originalWord;
    board.querySelector('[data-obj="m-type"]')?.classList.remove('is-editing');
    for (const drag of drags.values()) drag.reset?.();
    utils.set(noteNode, { opacity: 0 });
    for (const id of Object.keys(movesHome)) presence.hide(id);
  };

  /* ── THE TAKE ──────────────────────────────────────────────────────────
     Built from the score in content.js. Each act is one verb; adding a beat is
     one line of data, not one more branch of animation code. */
  // Everyone arrives before the first beat. An arrival and a move are two
  // animations on the same two properties, so a cursor asked to travel while it
  // is still arriving inherits a position it never reached — which reads as a
  // teleport. The lead-in is how long the arrivals get to themselves.
  const LEAD = 1100;

  const build = () => {
    const timeline = createTimeline({ defaults: { ease: EASE.soft } });

    // Everyone is already in the room when the take starts — walking four
    // cursors in from off-stage would spend two seconds on nothing.
    for (const [id, home] of Object.entries(movesHome)) {
      if (id === 'you') continue;
      timeline.call(() => presence.show(id, home), 0);
    }

    for (const beat of movesScore) {
      const target = board.querySelector(`[data-obj="${beat.target}"]`);
      const at = beat.at + LEAD;

      timeline.call(() => {
        if (!target) return;
        if (beat.act === 'arrive') presence.show(beat.who, movesHome[beat.who]);
        else presence.moveToObject(beat.who, target, { duration: 820 });
      }, Math.max(at - 700, LEAD));

      timeline.call(() => {
        if (!target) return;
        presence.press(beat.who);
        logRow(beat.who, beat.log, beat.at);

        switch (beat.act) {
          case 'move': {
            const drag = drags.get(beat.target);
            if (!drag) break;
            releases.push(presence.select(beat.who, target));
            // The cursor and the object travel together, which is the only
            // reason the gesture reads as dragging rather than as two things
            // animating near each other.
            const rect = board.getBoundingClientRect();
            // A delta from wherever this object is anchored in the composition
            // that is actually in force, not from the desktop one.
            const home = activePos(movesBoard.find((o) => o.id === beat.target));
            drag.animate[drag.xProp](((beat.to.x - home.x) / 100) * rect.width, 1000);
            drag.animate[drag.yProp](((beat.to.y - home.y) / 100) * rect.height, 1000);
            presence.moveTo(beat.who, { x: beat.to.x + 12, y: beat.to.y + 16 }, { duration: 1000 });
            break;
          }

          case 'select':
            releases.push(presence.select(beat.who, target));
            target.classList.add('is-editing');
            break;

          case 'retype':
            typeText(typeWord, beat.to);
            break;

          case 'note':
            enterObjects([target], { step: 0 });
            releases.push(presence.select(beat.who, target));
            break;

          case 'link': {
            const from = board.querySelector(`[data-obj="${beat.from}"]`);
            if (from) links.push(linkObjects(board, from, target, { tone: 'accent' }));
            break;
          }

          case 'arrive':
            releases.push(presence.select(beat.who, target));
            break;

          default:
            break;
        }
      }, at);
    }

    // Let go of everything at the end, so the board is left in a state you
    // could pick up rather than frozen mid-edit.
    const last = movesScore[movesScore.length - 1].at + LEAD + 1400;
    timeline.call(() => {
      board.querySelector('[data-obj="m-type"]')?.classList.remove('is-editing');
      for (const release of releases) release?.();
      releases = [];
      // Kept, so leaving the section can stop them. A looping animation nobody
      // can see is the definition of work this page should not be doing.
      for (const id of ['mara', 'alex', 'juno']) drifts.push(presence.drift(id));
    }, last);

    return timeline;
  };

  /* ── GATING ────────────────────────────────────────────────────────────
     The take plays once when the board arrives, and never while off-screen.
     Four cursors and a timeline running eight screens away is exactly the kind
     of cost that makes a page like this feel heavy for no visible reason. */
  // Outer opacity only. The outer transform belongs to the drag layer — see the
  // note on enterObjects in canvas.js.
  utils.set(nodes, { opacity: 0 });

  let played = false;
  inView(board, {
    amount: 0.35,
    onEnter: () => {
      if (played) {
        take?.resume();
        for (const drift of drifts) drift?.resume();
        return;
      }
      played = true;
      enterObjects(nodes.filter((n) => n !== noteNode), { step: 90 });
      take = build();
    },
    onLeave: () => {
      take?.pause();
      for (const drift of drifts) drift?.pause();
    },
  });

  replay?.addEventListener('click', () => {
    reset();
    played = true;
    enterObjects(nodes.filter((n) => n !== noteNode), { step: 70 });
    take = build();
  });
}

/* ══ 04 · MAKE SOMETHING TOGETHER ══════════════════════════════════════════ */

export function initTogether() {
  revealHead('#together-title');

  const track = $('.together-track');
  const poster = $('#poster');
  const stamp = $('#stamp');
  const fill = $('#together-fill');
  const pct = $('#together-pct');
  const state = $('#together-state');
  if (!track || !poster) return;

  /* Each piece: where it starts, and who it belongs to. Where it LANDS is not
     here — that is the CSS grid, which is the only description of the finished
     composition. The two therefore cannot disagree. */
  const pieces = $$('.poster-piece', poster).map((node, index) => {
    const [x, y, rot] = (node.dataset.from ?? '0,0,0').split(',').map(Number);
    const person = byId(node.dataset.who);
    if (person) {
      const tag = el('span', 'piece-tag', person.name);
      tag.dataset.tone = person.tone;
      node.appendChild(tag);
    }
    return { node, x, y, rot, index, tag: node.querySelector('.piece-tag') };
  });

  if (motion.reduced) {
    // The finished poster, assembled. The tags come off, since nothing is loose.
    for (const { tag } of pieces) tag?.remove();
    if (stamp) utils.set(stamp, { opacity: 1, scale: 1, rotate: -8 });
    if (fill) utils.set(fill, { scaleX: 1 });
    if (state) state.textContent = 'SHIPPED';
    if (pct) pct.textContent = '100%';
    return;
  }

  /* Offsets are percentages of the STAGE, not of each piece and not of the
     poster. Percentages of a piece would barely move a 2px rule; percentages of
     the poster would keep everything inside a 380px column, which is a shuffle
     rather than a scatter. The stage is the full width the section owns, so the
     pieces genuinely start spread across it and genuinely converge. */
  const stage = $('.together-stage');
  let box = { width: 0, height: 0 };
  const measure = () => {
    const rect = (stage ?? poster).getBoundingClientRect();
    box = { width: rect.width, height: rect.height };
  };
  measure();
  window.addEventListener('resize', measure, { passive: true });

  let stamped = false;
  let label = '';

  scrubber(
    track,
    (p) => {
      for (const piece of pieces) {
        // Staggered windows: pieces land in sequence, and the last one lands
        // just before the stamp. `t` is this piece's own progress through its
        // own window, so the ordering is data, not six magic numbers.
        const start = piece.index * 0.07;
        const end = 0.62 + piece.index * 0.055;
        const t = utils.clamp((p - start) / (end - start), 0, 1);
        // Ease out back, mildly: the piece overshoots its slot by a hair and
        // settles, which is what landing feels like.
        const e = 1 - Math.pow(1 - t, 3);
        const over = Math.sin(t * Math.PI) * 0.04;

        const dx = ((piece.x / 100) * box.width) * (1 - e);
        const dy = ((piece.y / 100) * box.height) * (1 - e);
        piece.node.style.transform =
          `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0) rotate(${(piece.rot * (1 - e)).toFixed(2)}deg) scale(${(1 - over).toFixed(3)})`;
        if (piece.tag) piece.tag.style.opacity = String(utils.clamp(1 - t * 1.6, 0, 1));
      }

      if (fill) fill.style.transform = `scaleX(${p.toFixed(3)})`;
      const rounded = Math.round(p * 100);
      if (pct) pct.textContent = `${String(rounded).padStart(2, '0')}%`;

      const next = p < 0.06 ? 'SCATTERED' : p < 0.94 ? 'ASSEMBLING' : 'SHIPPED';
      if (next !== label && state) { label = next; state.textContent = next; }

      // The stamp is the one thing that is not scrubbed — it is a moment, and a
      // moment you can scrub backwards and forwards is not one.
      if (p > 0.965 && !stamped && stamp) {
        stamped = true;
        utils.set(stamp, { opacity: 0, scale: 0.6, rotate: -22 });
        animate(stamp, { opacity: 1, scale: 1, rotate: -8, duration: 700, ease: SPRING.drop });
      } else if (p < 0.9 && stamped && stamp) {
        stamped = false;
        animate(stamp, { opacity: 0, scale: 0.7, duration: 240, ease: EASE.exit });
      }
    },
    { start: 0, end: 1 }
  );
}
