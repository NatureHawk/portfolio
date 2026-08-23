// NEW FORMS — the site.
//
// Website 03 of the design section, and the third world of four. A fashion
// house presented as an editorial: five acts, nine plates, one scroll.
// Everything it says lives in content.js; everything it does lives here.
//
// WHY IT IS SHAPED LIKE THIS. Like BRUSH, it is built at the moment somebody's
// hand moves towards its corner and never before — it is nine full-bleed
// photographs and a visitor who reads HUM and leaves must not pay for a byte of
// it. Like BRUSH, it is `hidden` when it is not the live world, which makes
// every observer in it report off-screen and every loop below stop by itself.
//
// THE ONE RULE THE LAYOUT DEPENDS ON. Five acts are `position: sticky`, and
// sticky dies inside any ancestor carrying a transform. So nothing in this file
// ever animates a wrapper: the arrival moves the ground layer, the rail and the
// hero's own children, and `.fw`, `.fw-page` and every `.fs` are never touched.
// Break that rule and every pinned moment on the page silently stops pinning.
//
// WHAT RUNS PER FRAME, AND WHEN. One pointer loop (the hero, and only while the
// hero is on screen and only where there is a pointer), plus a set of
// `scrubber`s — each of which suspends itself entirely when its element is off
// screen. All of them are on the page's single shared clock in motion.js and
// all of them write CSS custom properties. Nothing here measures layout while a
// transition is running, and nothing writes a property that triggers one.
//
// WHY EVERY MOVE IS A SCROLL POSITION RATHER THAN AN ANIMATION. There is no
// timeline anywhere below the arrival. Scrubbing back up puts the whole issue
// exactly where it was, because none of it ever "played" — which is the
// difference between a page that responds to you and a page that performs at
// you, and it is the entire brief for this world.

import {
  motion, inView, scrubber, frame, pointer, hasHover,
  stagger, utils, EASE, clamp, el, $, $$,
} from '../motion.js';
import { CORNERS, towards, onScreen, pullTo } from '../worlds/corners.js';
import { lazyAttrs, initLazy } from '../lazy.js';
import { ISSUE, PLATES, ACTS, MARKS, COLOPHON } from './content.js';

/* One tile of fractal noise, painted once. The job it is actually for is
   stopping large flat blacks from banding on an 8-bit panel; an animated grain
   would be a full-screen repaint every frame for an effect nobody can name. */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='168' height='168'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.86' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

const smooth = (t) => t * t * (3 - 2 * t);
// 0 at both ends, 1 in the middle — for anything that has to arrive and leave
// inside one scrub rather than just arrive.
const arc = (p) => smooth(clamp(1 - Math.abs(p - 0.5) * 2.4, 0, 1));

/* `lazy: false` is for the masthead alone. It is the picture the portal opens
   onto, so it is the one plate that must already be there rather than arriving:
   a real `src`, high priority, and no fade. Everything else is handed to unlazy
   — see design/lazy.js for what that does and does not do. */
const plate = (key, cls, { pos, lazy = true, extra = '' } = {}) => {
  const p = PLATES[key];
  return `
    <figure class="fp ${cls}"${pos ? ` style="--pos:${pos}"` : ''}>
      <div class="fp-frame">
        <div class="fp-shift">
          <img ${lazyAttrs(p.src, { eager: !lazy })} alt="${p.alt}"
               width="2752" height="1536" />
        </div>
      </div>${extra}
    </figure>`;
};

const marks = (pair, cls = 'fcap') =>
  `<p class="${cls}">${pair.map((t) => `<i>${t}</i>`).join('')}</p>`;

const lines = (arr, cls) =>
  `<p class="${cls}">${arr.map((t) => `<span class="fln">${t}</span>`).join('')}</p>`;

const head = (act) => `
  <header class="fs-head">
    <span class="fs-no">${act.no}</span>
    <h2 class="fs-name">${act.name}</h2>
    <span class="fs-rule" aria-hidden="true"></span>
    <span class="fs-meta">${act.meta}</span>
  </header>`;

export function createForms(spec, host, context = {}) {
  const reduced = motion.reduced;
  const teardown = [];
  const own = (stop) => { if (typeof stop === 'function') teardown.push(stop); };
  // Elements `exit` displaced. Cleared on the way back in, before the portal is
  // opaque, so the last departure's leftovers never pop back into view.
  const moved = new Set();
  let scrollY = 0;
  let warmed = false;

  const root = el('section', 'fw');
  root.dataset.world = spec.id;
  root.dataset.motion = reduced ? 'off' : 'on';
  root.dataset.lit = 'void';
  root.tabIndex = -1;
  root.hidden = true;
  root.setAttribute('aria-label', `${ISSUE.house} — issue ${ISSUE.no}`);
  root.style.setProperty('--grain', GRAIN);
  root.style.setProperty(
    '--w-origin',
    `${CORNERS[spec.corner].x * 100}% ${CORNERS[spec.corner].y * 100}%`
  );

  root.innerHTML = `
    <div class="fw-ground" aria-hidden="true"></div>
    <div class="fw-grain" aria-hidden="true"></div>

    <nav class="fw-rail" aria-label="Issue contents">
      <ol>${ACTS.map(
        (a) => `<li data-act="${a.id}"><a href="#nf-${a.id}"><b>${a.no}</b><span>${a.short}</span></a></li>`
      ).join('')}</ol>
    </nav>
    <p class="fw-mark" aria-hidden="true"><i></i>${ISSUE.house} ${ISSUE.no}</p>
    <p class="fw-ticker" aria-hidden="true">
      <b data-tick="no">01</b><em data-tick="name">SPACE</em><span><i></i></span>
    </p>

    <div class="fw-page">
      <!-- ══ 00 · MASTHEAD ══════════════════════════════════════════════════
           Kept. The strongest thing on the first pass, and the brief was to
           make it live rather than redraw it. -->
      <section class="fs fs--hero" data-g="void" aria-labelledby="nf-title">
        ${plate('hero', 'fp--hero', { lazy: false, extra: '<span class="fh-scrim" aria-hidden="true"></span>' })}
        <div class="fh-type">
          <p class="fmark fh-stamp">${ISSUE.stamp.map((t) => `<i>${t}</i>`).join('')}</p>
          <h1 class="fh-title" id="nf-title">
            <span class="fln">NEW</span><span class="fln">FORMS</span>
          </h1>
          <p class="fh-sub"><span class="fln">${ISSUE.sub}</span></p>
          <p class="fh-edge" aria-hidden="true">${ISSUE.edge}</p>
          <p class="fh-cue" aria-hidden="true"><span>SCROLL</span><i></i></p>
        </div>
      </section>

      <!-- ══ 01 · THE SPACE ═════════════════════════════════════════════════
           The architecture, made imposing rather than exhibited: it holds the
           screen while it resolves, and the sentence crosses it the other way. -->
      <section class="fs" id="nf-space" data-g="void" data-act="space" aria-labelledby="nf-space-h">
        ${head({ ...ACTS[0], name: `<span id="nf-space-h">${ACTS[0].name}</span>` })}
        <div class="fp-pin sp-pin">
          <div class="fp-pin-stage">
            ${plate('building', 'fp--space')}
            <span class="sp-floor" aria-hidden="true"></span>
            ${lines(MARKS.space.cross, 'sp-cross')}
          </div>
        </div>
        <div class="sp-strip">
          ${plate('hall', 'fp--vault', { extra: `<p class="fcap fp-note">${MARKS.vault.cap.map((t) => `<i>${t}</i>`).join('')}</p>` })}
          <div class="sp-say">
            ${marks(MARKS.space.cap)}
            ${lines(MARKS.space.say, 'fsay')}
          </div>
        </div>
      </section>

      <!-- ══ 02 · THE OBJECT ════════════════════════════════════════════════
           Charcoal, not cream: on a dark ground the photograph becomes a lit
           slab and the object reads as something made by the same house as the
           clothes.

           TWO PLATES IN SEQUENCE, AND THE ORDER OF THE BLOCKS IS THE WHOLE
           FIX. This act used to be one pinned stage three screens tall where
           the object arrived at 0.42 scale and grew — which read as a landing
           page transforming an image rather than an editorial stating one, and
           put three screens of scroll between the visitor and a photograph
           that was legible on the first. Now the object is at full size the
           moment it arrives: specs above it, the plate, its materials caption,
           then the detail as its OWN plate underneath with its own caption.
           Neither picture is ever inside the other, and nothing opens out of
           anything. -->
      <section class="fs" id="nf-object" data-g="char" data-act="object" aria-labelledby="nf-object-h">
        ${head({ ...ACTS[1], name: `<span id="nf-object-h">${ACTS[1].name}</span>` })}
        <p class="ob-specs">${MARKS.object.specs.map((t) => `<i>${t}</i>`).join('')}</p>
        ${plate('object', 'fp--object fp--set')}
        ${marks(MARKS.object.cap, 'fcap ob-cap')}
        ${plate('close', 'fp--detail')}
        ${marks(MARKS.object.detail, 'fcap ob-cap ob-cap--last')}
      </section>

      <!-- ══ 03 · THE BODY ══════════════════════════════════════════════════
           The peak, and the one act on bone — those garments were shot on a lit
           ivory wall, so bone puts black clothing on white paper. Two plates:
           the garment stated whole, then the same garment in movement. The
           detail crop that used to sit between them now opens THE OBJECT's
           second half, where it is doing material work rather than repeating
           the peak. -->
      <section class="fs" id="nf-body" data-g="bone" data-act="body" aria-labelledby="nf-body-h">
        ${head({ ...ACTS[2], name: `<span id="nf-body-h">${ACTS[2].name}</span>` })}
        ${plate('fashion', 'fp--peak', {
          extra: `
          <p class="fb-title">
            <span class="fsr">${MARKS.body.read}</span>
            ${MARKS.body.title.map((t) => `<span class="fln" aria-hidden="true">${t}</span>`).join('')}
          </p>
          <p class="fcap fp-note">${MARKS.body.cap.map((t) => `<i>${t}</i>`).join('')}</p>`,
        })}
        <p class="bd-label">${MARKS.body.label.map((t) => `<i>${t}</i>`).join('')}</p>
        <div class="fp-pin mo-pin">
          <div class="fp-pin-stage">
            ${plate('motion', 'fp--motion')}
            <span class="mo-lift" aria-hidden="true"></span>
            <p class="mo-word" aria-hidden="true">${MARKS.body.word}</p>
          </div>
        </div>
      </section>

      <!-- ══ 04 · AFTER DARK ════════════════════════════════════════════════
           The darkest point of the issue. The act above is pulled over its top
           edge so arriving here reads as entering another environment. -->
      <section class="fs" id="nf-dark" data-g="void" data-act="dark" aria-labelledby="nf-dark-h">
        ${head({ ...ACTS[3], name: `<span id="nf-dark-h">${ACTS[3].name}</span>` })}
        <div class="nk">
          ${lines(MARKS.dark.type, 'nk-type')}
          ${plate('musician', 'fp--musician')}
          ${marks(MARKS.dark.cap, 'fcap nk-cap')}
        </div>
        <div class="fp-pin nl-pin">
          <div class="fp-pin-stage">
            ${plate('night', 'fp--night')}
            <span class="nl-heat" aria-hidden="true"></span>
            <p class="nl-time" aria-hidden="true">${MARKS.dark.night[1]}</p>
          </div>
        </div>
      </section>

      <!-- ══ 05 · THE RETURN ════════════════════════════════════════════════
           The same hall 01 passed through, read the other way — wide and lit,
           with the figure in it. It arrives through an aperture rather than a
           curtain: the issue has come full circle and should not arrive the way
           it started. -->
      <section class="fs" id="nf-return" data-g="bone" data-act="return" aria-labelledby="nf-return-h">
        ${head({ ...ACTS[4], name: `<span id="nf-return-h">${ACTS[4].name}</span>` })}
        <div class="fp-pin rt-pin">
          <div class="fp-pin-stage">
            ${plate('hall', 'fp--return')}
          </div>
        </div>
        <div class="fcoda"><p><span class="fln">${MARKS.coda}</span></p></div>
      </section>

      <footer class="fs-end">
        <p class="end-mark"><b>${ISSUE.no}</b><em>${ISSUE.house}</em></p>
        <div class="end-side">
          <dl class="end-plate">
            ${COLOPHON.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}
          </dl>
        </div>
      </footer>
    </div>`;

  host.appendChild(root);

  /* Hands the plates to unlazy as soon as they are in the document, rather than
     waiting for the world to be entered. The swap it performs is only
     `data-src` → `src`; the fetch itself is still the browser's decision, and
     while this world is `hidden` it has no layout box, so a lazy image inside
     it is not fetched at all. Doing it here rather than in `warm()` simply
     means the browser has the earliest possible notice of what it will need. */
  own(initLazy(root));

  /* ══ NODES ══════════════════════════════════════════════════════════════ */

  const ground = $('.fw-ground', root);
  const grain = $('.fw-grain', root);
  const rail = $('.fw-rail', root);
  const mark = $('.fw-mark', root);
  const ticker = $('.fw-ticker', root);
  const tickNo = $('[data-tick="no"]', root);
  const tickName = $('[data-tick="name"]', root);
  const heroSec = $('.fs--hero', root);
  const heroShift = $('.fp--hero .fp-shift', root);
  const heroType = $('.fh-type', root);
  const heroCue = $('.fh-cue', root);
  const railItems = new Map($$('.fw-rail li', root).map((li) => [li.dataset.act, li]));

  /* Wrap every display line so it can rise out of its own mask. Done here
     rather than in the markup because the mask is a motion concern: with motion
     off the wrapper is still built, but nothing is ever transformed. */
  const lineInners = $$('.fln', root).map((line) => {
    const inner = el('span');
    inner.innerHTML = line.innerHTML;
    line.textContent = '';
    line.appendChild(inner);
    return inner;
  });
  const heroLines = $$('.fh-title .fln > span, .fh-sub .fln > span', root);

  /* ══ REVEALS ════════════════════════════════════════════════════════════
     Scroll-linked, not one-shot: `--open` is written by a scrubber, so
     scrubbing back closes the plate again. The picture becomes a thing the
     scroll is doing rather than a thing that happened once — which is most of
     the difference between this pass and the last one. Plates that are already
     driven by their own pin are excluded; they have a job. */
  function initReveals() {
    if (reduced) return;
    // Plates driven by their own pin or their own scrubber are excluded; they
    // have a job, and two scrubbers writing --z on one element is a fight.
    const owned = new Set([...$$('.fp-pin .fp', root), ...$$('.fp--hero, .fp--object', root)]);
    for (const fig of $$('.fp', root)) {
      if (owned.has(fig)) continue;
      const frameEl = $('.fp-frame', fig);
      const shift = $('.fp-shift', fig);
      fig.style.setProperty('--open', '0');
      own(scrubber(fig, (p) => {
        // Open across the first third of the crossing, then hold. A plate that
        // is still opening as it leaves never gets to be looked at.
        frameEl.style.setProperty('--open', smooth(clamp(p / 0.34, 0, 1)).toFixed(4));
        // Differential parallax: the picture inside the frame runs slower than
        // the frame runs up the page, so the two read as different distances.
        // 3.5% of the plate's height across a whole crossing — enough to
        // separate the planes, not enough that the picture looks like it is
        // sliding inside its own frame.
        shift.style.setProperty('--dy', `${((p - 0.5) * -2 * 3.5).toFixed(2)}%`);
      }, { start: 1, end: 0 }));
    }
  }

  /* Display type rises when its own block arrives. Once, and then it stops
     costing anything — a line cannot un-arrive. */
  function initType() {
    if (reduced) { utils.set(lineInners, { y: '0%' }); return; }
    utils.set(lineInners, { y: '106%' });
    for (const block of $$('.sp-cross, .fsay, .fb-title, .nk-type, .fcoda p', root)) {
      const inners = $$('.fln > span', block);
      if (!inners.length) continue;
      own(inView(block, {
        once: true,
        amount: 0.25,
        margin: '0px 0px -18% 0px',
        onEnter: () => {
          utils.set(inners, { y: '106%' });
          animateLines(inners);
        },
      }));
    }
  }

  function animateLines(inners) {
    inners.forEach((inner, i) => {
      inner.style.transition = `transform 1.05s cubic-bezier(.16,1,.3,1) ${(i * 0.09).toFixed(3)}s`;
      inner.style.transform = 'translateY(0)';
    });
  }

  /* ══ 00 · THE HERO ══════════════════════════════════════════════════════
     Two independent sources of movement, composed in CSS so neither has to
     know about the other: the pointer drifts the picture, the scroll hands the
     whole composition forward.

     THE DRIFT IS DELIBERATELY TINY. The photograph moves about fourteen pixels
     across the entire screen and the type moves five the other way. Enough that
     the hero has depth and visibly answers the visitor; not enough that anybody
     would say the picture moves. Runs only while the hero is on screen and only
     where there is a pointer to read. */
  function initHeroDrift() {
    if (reduced || !hasHover || !heroShift) return;
    let stop = null;
    let x = 0;
    let y = 0;

    const run = (dt) => {
      const k = 1 - Math.exp(-dt / 240);
      const tx = (pointer.sx / window.innerWidth - 0.5) * 2;
      const ty = (pointer.sy / window.innerHeight - 0.5) * 2;
      x += (tx - x) * k;
      y += (ty - y) * k;
      heroShift.style.setProperty('--px', `${(x * -10).toFixed(2)}px`);
      heroShift.style.setProperty('--py', `${(y * -6).toFixed(2)}px`);
      heroType.style.setProperty('--tx', `${(x * 3.5).toFixed(2)}px`);
    };

    own(inView(heroSec, {
      amount: 0,
      onEnter: () => { stop ??= frame.add(run); },
      onLeave: () => { stop?.(); stop = null; },
    }));
    own(() => stop?.());
  }

  /* THE HANDOFF. The hero does not end and the next act begin: the type lifts
     and gives up its opacity while the photograph keeps growing, and THE SPACE
     opens underneath it still moving. It is a scroll position, not an
     animation — scrolling back up puts it exactly where it was.

     `end: 0` matters. `end: 1` would measure this act from its top reaching the
     top of the screen to its bottom reaching the top — and the hero is exactly
     one screen tall, so that span is zero and the whole handoff would fire
     inside the first pixel of scroll. */
  function initHandoff() {
    if (reduced || !heroShift) return;
    own(scrubber(heroSec, (p) => {
      // Nothing for the first third: the hero is meant to be still while it is
      // being read.
      const e = smooth(clamp((p - 0.32) / 0.68, 0, 1));
      heroShift.style.setProperty('--cs', (1 + e * 0.08).toFixed(4));
      heroShift.style.setProperty('--cy', `${(e * -20).toFixed(1)}px`);
      heroType.style.setProperty('--ty', `${(e * -46).toFixed(1)}px`);
      heroType.style.setProperty('--op', (1 - e * 0.9).toFixed(3));
      // The cue retracts as you act on it.
      heroCue?.style.setProperty('--cue', (1 - clamp(p * 3, 0, 1)).toFixed(3));
    }, { start: 0, end: 0 }));
  }

  /* ══ 01 · THE SPACE ═════════════════════════════════════════════════════
     The plate holds the screen for two and a half of them while the courtyard
     resolves out of an oversized crop, and the sentence crosses it in the
     opposite direction. Type and world move against each other rather than one
     sitting still on top of the other — which is the thing the first pass never
     did anywhere. */
  function initSpace() {
    const pin = $('.sp-pin', root);
    const shift = $('.fp--space .fp-shift', root);
    const cross = $('.sp-cross', root);
    const floor = $('.sp-floor', root);
    if (!pin || reduced) return;

    own(scrubber(pin, (p) => {
      // The picture resolves: it arrives a little oversized and settles to its
      // own size, so the architecture reads as being walked into rather than
      // shown. 8%, not the 18% this started at — past about a tenth the settle
      // stops reading as depth and starts reading as a zoom.
      shift.style.setProperty('--z', (1.08 - p * 0.08).toFixed(4));
      shift.style.setProperty('--dy', `${((p - 0.5) * 3).toFixed(2)}%`);
      // The sentence crosses the frame. It still enters low and leaves high —
      // that is the composition — but over 46vh rather than 78, so it reads as
      // type set on a moving picture rather than type flying past one.
      cross.style.setProperty('--ty', `${((0.5 - p) * 46).toFixed(1)}vh`);
      // The band under the type. The sentence is on screen for the WHOLE pin —
      // it enters from below the frame and leaves above it — so this is a
      // plateau rather than an arc: up over the first tenth, held, down over
      // the last. An arc would fade the floor out from under type that is still
      // being read at both ends of the scrub.
      const hold = Math.min(smooth(clamp(p / 0.1, 0, 1)), smooth(clamp((1 - p) / 0.1, 0, 1)));
      floor.style.setProperty('--floor', hold.toFixed(3));
    }, { start: 1, end: 0 }));
  }

  /* ══ 02 · THE OBJECT ════════════════════════════════════════════════════
     The object is at full size the moment it arrives and stays that size. All
     the scroll does is breathe it: a 3.5% scale over the whole crossing, which
     is about the amount a slow dolly moves and about the amount nobody names.

     WHAT THIS REPLACED, AND WHY IT IS NOT COMING BACK. The plate used to be
     laid out at full size and scaled from 0.42, pinned across three screens.
     Two things were wrong with it. It read as software transforming a picture
     rather than an editorial presenting one — the gesture was the subject, and
     in this issue the photograph is the subject. And it spent three screens of
     scroll delivering an image that was already legible at the top of the
     first, which is the one thing a reader of an editorial will not forgive.

     SCALE ONLY, DELIBERATELY NO PARALLAX. This is the single plate in the
     issue whose ratio matches its source exactly, so its shift layer has no
     headroom (`.fp--set`, `inset: 0`) and nothing is cropped off it. A --dy
     here would either expose the frame's own ground at one edge or force
     headroom that starts cropping the sides — and "nothing has been taken off
     this one" is worth more than 2% of drift. */
  function initObject() {
    const fig = $('.fp--object', root);
    if (!fig || reduced) return;
    const frameEl = $('.fp-frame', fig);
    const shift = $('.fp-shift', fig);

    own(scrubber(fig, (p) => {
      frameEl.style.setProperty('--open', smooth(clamp(p / 0.3, 0, 1)).toFixed(4));
      shift.style.setProperty('--z', (1 + smooth(p) * 0.035).toFixed(4));
    }, { start: 1, end: 0 }));
  }

  /* ══ 03 · THE BODY ══════════════════════════════════════════════════════
     The peak's headline is set INSIDE the photograph, on the bare wall nothing
     is standing on, and it drifts against the picture as the plate crosses —
     so the words and the figure are on two different planes.

     THE MOVEMENT FRAME is the one place the layout is allowed to come apart:
     pinned, the picture travels sideways across its own oversized crop while it
     scales down, so the composition is re-forming under the visitor rather than
     parallaxing past them. The word runs the other way at a different rate. */
  function initBody() {
    if (reduced) return;

    const peak = $('.fp--peak', root);
    const peakTitle = $('.fb-title', root);
    if (peak && peakTitle) {
      own(scrubber(peak, (p) => {
        peakTitle.style.setProperty('--ty', `${((p - 0.5) * -44).toFixed(1)}px`);
      }, { start: 1, end: 0 }));
    }

    /* THE MOVEMENT FRAME is the one place in the issue allowed to be more than
       subtle, and the reason is in the photograph rather than in the code: it
       is the only frame whose subject is already in motion, so movement here
       is agreeing with the picture instead of being applied to it. It is still
       pulled well back from where it was — the travel is 10% of the crop
       rather than 16%, the settle 6% rather than 14% — because the fabric is
       doing the work and the frame only has to not sit perfectly still while
       it does. */
    const pin = $('.mo-pin', root);
    const shift = $('.fp--motion .fp-shift', root);
    const word = $('.mo-word', root);
    if (!pin) return;
    own(scrubber(pin, (p) => {
      shift.style.setProperty('--dx', `${((0.5 - p) * 10).toFixed(2)}%`);
      shift.style.setProperty('--z', (1.06 - p * 0.06).toFixed(4));
      word?.style.setProperty('--wx', `${((p - 0.5) * 15).toFixed(1)}vw`);
    }, { start: 1, end: 0 }));
  }

  /* ══ 04 · AFTER DARK ════════════════════════════════════════════════════
     The room opens outward: the crop starts well inside the frame and widens as
     the visitor scrolls, so the plate is walking into the room rather than
     showing a picture of it. The heat comes up with it and goes again — the
     accent is a light in the photograph, not a wash over the page. */
  function initDark() {
    if (reduced) return;

    const type = $('.nk-type', root);
    const musician = $('.fp--musician', root);
    if (type && musician) {
      own(scrubber(musician, (p) => {
        type.style.setProperty('--ty', `${((p - 0.5) * -30).toFixed(1)}px`);
      }, { start: 1, end: 0 }));
    }

    /* The most restrained scrub in the issue, and that is on purpose: this
       photograph is a hazed room full of people, red light and swinging
       fabric — there is more happening inside the frame here than anywhere
       else on the page, and adding much on top of it is how an atmosphere
       becomes an effect. One slow 8% settle, and the heat comes up and goes
       again so the accent reads as a light in the room rather than a wash
       over the page. */
    const pin = $('.nl-pin', root);
    const shift = $('.fp--night .fp-shift', root);
    const heat = $('.nl-heat', root);
    if (!pin) return;
    own(scrubber(pin, (p) => {
      shift.style.setProperty('--z', (1.08 - smooth(p) * 0.08).toFixed(4));
      heat?.style.setProperty('--heat', (arc(p) * 0.7).toFixed(3));
    }, { start: 1, end: 0 }));
  }

  /* ══ 05 · THE RETURN ════════════════════════════════════════════════════
     An aperture rather than a curtain: the hall opens from its own centre line
     outward. It is the only reveal in the issue shaped this way, because the
     issue has come full circle and should not arrive the way it started. */
  function initReturn() {
    const pin = $('.rt-pin', root);
    const frameEl = $('.fp--return .fp-frame', root);
    const shift = $('.fp--return .fp-shift', root);
    const coda = $('.fcoda p', root);
    if (!pin || reduced) return;

    own(scrubber(pin, (p) => {
      frameEl.style.setProperty('--open', smooth(clamp(p / 0.42, 0, 1)).toFixed(4));
      shift.style.setProperty('--z', (1.05 - smooth(clamp(p / 0.8, 0, 1)) * 0.05).toFixed(4));
    }, { start: 1, end: 0 }));

    if (coda) {
      own(scrubber(coda, (p) => {
        coda.style.setProperty('--ty', `${((p - 0.5) * -24).toFixed(1)}px`);
      }, { start: 1, end: 0 }));
    }
  }

  /* ══ THE RAIL ═══════════════════════════════════════════════════════════
     Which act you are in, and what the fixed chrome is standing on.

     THE TONE IS RESOLVED AGAINST THE ACT UNDER THE RAIL, NOT THE ONE THE PAGE
     IS "IN". The rail sits at mid-height on the left; an act whose ground is
     bone puts ink type there and one set on void puts chalk, and those two are
     invisible on each other's ground. So the observer that lights an entry is
     also the one that repaints the rail. */
  function initRail() {
    const acts = $$('.fs[data-act]', root);
    const tones = {
      bone: { ink: 'var(--f-ink)', faint: 'var(--f-ink-faint)', red: 'var(--f-red-bone)', ground: 'var(--f-bone)' },
      void: { ink: 'var(--f-chalk)', faint: 'var(--f-chalk-faint)', red: 'var(--f-red-void)', ground: 'var(--f-void)' },
      char: { ink: 'var(--f-chalk)', faint: 'var(--f-chalk-faint)', red: 'var(--f-red-void)', ground: 'var(--f-char)' },
    };

    const light = (act) => {
      for (const [id, li] of railItems) li.classList.toggle('live', id === act.dataset.act);
      const g = act.dataset.g ?? 'void';
      const t = tones[g] ?? tones.void;
      for (const node of [rail, mark, ticker]) {
        node.style.setProperty('--r-ink', t.ink);
        node.style.setProperty('--r-faint', t.faint);
        node.style.setProperty('--r-red', t.red);
        node.style.setProperty('--r-ground', t.ground);
      }
      root.dataset.lit = g === 'bone' ? 'bone' : 'void';
      const meta = ACTS.find((a) => a.id === act.dataset.act);
      if (meta) { tickNo.textContent = meta.no; tickName.textContent = meta.short; }
    };

    for (const act of acts) {
      own(inView(act, {
        amount: 0,
        margin: '-50% 0px -50% 0px',
        onEnter: () => light(act),
      }));
    }

    // The rail stays out of the way of the title page.
    own(inView(heroSec, {
      amount: 0,
      margin: '-45% 0px 0px 0px',
      onEnter: () => { root.dataset.pastHero = '0'; },
      onLeave: () => { root.dataset.pastHero = '1'; },
    }));

    // Progress, for the ticker's hairline. One subscriber, and only while the
    // world is the live one — `hidden` stops it with everything else.
    let stop = null;
    const run = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      ticker.style.setProperty('--prog', max > 0 ? (window.scrollY / max).toFixed(4) : '0');
    };
    own(inView(root, {
      amount: 0,
      onEnter: () => { stop ??= frame.add(run); },
      onLeave: () => { stop?.(); stop = null; },
    }));
    own(() => stop?.());
  }

  /* Smooth-scroll the rail's own links without touching the document's scroll
     behaviour, which belongs to the page and not to one world inside it. */
  function initRailLinks() {
    for (const a of $$('.fw-rail a', root)) {
      a.addEventListener('click', (event) => {
        const target = $(a.getAttribute('href'), root);
        if (!target) return;
        event.preventDefault();
        target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      });
    }
  }

  /* ══ ARRIVAL / DEPARTURE ════════════════════════════════════════════════ */

  /* The hero's OWN marks. The rail, the issue mark and the ticker are not in
     here on purpose: their visibility belongs to the scroll position — they are
     gated by `data-past-hero` so nothing competes with the title page — and an
     arrival that animated them to `opacity: 1` would write an inline value that
     beats the gate and park the mark on top of the standfirst, which is exactly
     what it did. Entering the world below the hero still fades them in; that is
     the stylesheet's own transition doing it. */
  const heroParts = () =>
    [$('.fh-stamp', root), $('.fh-edge', root), heroCue].filter(Boolean);

  /* Clears what a departure wrote rather than overwriting it with a guess.
     Setting `opacity: 1` here would have the same bug as animating the chrome
     in: an inline value the stylesheet can no longer override. */
  function restore() {
    for (const node of moved) {
      utils.remove(node);
      for (const prop of ['opacity', 'transform', 'translate', 'scale', 'rotate']) {
        node.style.removeProperty(prop);
      }
    }
    moved.clear();
  }

  function enter(timeline, ctx) {
    // First, and synchronously: `enter` is called while the timeline is being
    // built, which is before the portal is opaque and before `show`, so this
    // world is still hidden and nobody can see it happen.
    restore();

    const corner = ctx?.corner ?? spec.corner;
    const dir = towards(corner);
    const c = CORNERS[corner];
    const at = ctx?.at ?? 0;

    if (reduced || !timeline) {
      utils.set([ground, grain, ...heroParts()], { opacity: 1, x: 0, y: 0, scale: 1 });
      utils.set(heroLines, { y: '0%' });
      return;
    }


    // The ground unfolds from the doorway rather than from the middle, so the
    // screen opens where the portal just was.
    utils.set(ground, { transformOrigin: `${c.x * 100}% ${c.y * 100}%`, scale: 1.12, opacity: 1 });
    timeline.add(ground, { scale: 1, duration: 760, ease: EASE.rise }, at);

    // The photograph carries the most distance and the most time — it is the
    // thing the world is about, so it is the thing still settling when
    // everything else has landed.
    utils.set(heroShift, { x: dir.x * 46, y: dir.y * 46, opacity: 0 });
    timeline.add(heroShift, { x: 0, y: 0, opacity: 1, duration: 1050, ease: EASE.rise }, at + 20);

    utils.set(heroLines, { y: '110%' });
    timeline.add(heroLines, { y: '0%', duration: 940, delay: stagger(80), ease: EASE.rise }, at + 110);

    const small = heroParts();
    utils.set(small, { x: dir.x * 18, y: dir.y * 18, opacity: 0 });
    timeline.add(small, {
      x: 0, y: 0, opacity: 1, duration: 640, delay: stagger(55), ease: EASE.rise,
    }, at + 150);
  }

  function exit(timeline, ctx) {
    if (reduced || !timeline) return;
    const corner = ctx.corner;
    const dir = towards(corner);

    // Photographs first — they are the biggest things on any screen of this
    // site and the ones the eye is already on.
    const figures = onScreen($$('.fp-frame', root), { corner, limit: 4 });
    figures.forEach((item, i) => {
      const vector = pullTo(item, corner, { reach: 0.5 });
      moved.add(item.node);
      timeline.add(item.node, {
        x: vector.x.toFixed(1),
        y: vector.y.toFixed(1),
        scale: 0.92,
        opacity: 0,
        duration: 340,
        ease: EASE.exit,
      }, i * 28);
    });

    // Then the type in front of them.
    const type = onScreen(
      $$('.fh-title, .sp-cross, .fb-title, .nk-type, .mo-word, .fs-name, .fcoda p', root),
      { corner, limit: 5 }
    );
    type.forEach((item, i) => {
      moved.add(item.node);
      timeline.add(item.node, {
        x: dir.x * 40, y: dir.y * 40, opacity: 0, duration: 300, ease: EASE.exit,
      }, 60 + i * 24);
    });

    const chrome = [rail, mark, ticker].filter(Boolean);
    for (const node of chrome) moved.add(node);
    timeline.add(chrome, {
      x: dir.x * 24, y: dir.y * 24, opacity: 0, duration: 260, delay: stagger(40), ease: EASE.exit,
    }, 0);

    timeline.add(ground, { scale: 0.98, duration: 340, ease: EASE.exit }, 0);
  }

  /* Everything that costs anything is wired on the first settle rather than at
     mount: a visitor who opens the corner panel and changes their mind has paid
     for the markup and nothing else. */
  function warm() {
    initReveals();
    initType();
    initHeroDrift();
    initHandoff();
    initSpace();
    initObject();
    initBody();
    initDark();
    initReturn();
    initRail();
    initRailLinks();
    if (reduced) utils.set(lineInners, { y: '0%' });
  }

  return {
    id: spec.id,
    root,

    show() {
      root.hidden = false;
      // The act you were reading, not the top of the issue.
      window.scrollTo(0, scrollY);
    },

    hide() {
      scrollY = window.scrollY;
      // `hidden`, not opacity: with the world collapsed every observer in it
      // reports off screen, so the scrubbers, the pointer loop and the progress
      // subscriber all stop by themselves. A world you are not in costs nothing.
      root.hidden = true;
    },

    enter,
    exit,

    settle() {
      root.focus({ preventScroll: true });
      if (warmed) return;
      warmed = true;
      warm();
    },

    destroy() {
      for (const stop of teardown) { try { stop(); } catch { /* already gone */ } }
      teardown.length = 0;
      utils.remove(root);
      root.remove();
    },
  };
}
