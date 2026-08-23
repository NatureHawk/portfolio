// BRUSH / 01 — the site.
//
// Website 02 of the design section, and the second world of four. It is a
// product film: nine acts, one continuous scroll, one object. Everything it
// says lives in content.js; everything it does lives here.
//
// WHY IT IS SHAPED LIKE THIS. HUM is a document that was already in the HTML
// and got wrapped. BRUSH is not — it is built at the moment somebody's hand
// moves towards the top-right corner and never before, because it is nine
// full-bleed product photographs and a sixty-frame disassembly, and a visitor
// who reads HUM and leaves must not pay for a single byte of it.
//
// THE ONE RULE THE LAYOUT DEPENDS ON. The exploded act is `position: sticky`,
// and sticky dies inside any ancestor carrying a transform. So nothing in this
// file ever animates a wrapper: the arrival moves the ground layer, the rail
// and the hero's own children, and the page element itself is never touched.
// Break that rule and the wow moment silently stops pinning.
//
// WHAT RUNS PER FRAME, AND WHEN. Four things, all of them gated by an
// IntersectionObserver and all of them on the page's single shared clock:
// the disassembly chase (sequence.js), four parallax scrubbers, the pressure
// meter, and the hero's pointer drift. A world that is not on screen is
// `hidden`, which makes every one of those observers report off-screen and
// every loop above stop by itself.

import {
  animate, stagger, utils, motion, inView, scrubber, frame, pointer, hasHover,
  magnetic, EASE, clamp, lerp, el, $, $$,
} from '../motion.js';
import { CORNERS, towards, onScreen, pullTo } from '../worlds/corners.js';
import { createSequence } from './sequence.js';
import {
  IMAGES, SEQUENCE, ACTS, HERO, OBJECT, EXPLODE, INTERNALS,
  PRESSURE, HEAD, POWER, DOCK, CLOSE,
} from './content.js';

/* ══ MARKUP HELPERS ════════════════════════════════════════════════════════
   Three of them, and between them they build most of the page. A display line
   is a masked box with a block inside it, so the entrance is one transform on
   the inner element and no clip-path is ever animated. */
const lines = (list) => list.map((text) => `<span class="bl"><i>${text}</i></span>`).join('');

const plate = (no, label) => `
  <header class="bp">
    <p class="bp-no">${no}</p>
    <p class="bp-label">${label}</p>
    <span class="bp-rule"><i></i></span>
  </header>`;

/* Every product shot on the page, built the same way — and built out of THREE
   elements, which is the single most important structural decision in this
   file. A transform has exactly one owner. Three systems want to move a
   product shot, so each one gets an element of its own:

     .bfig      anime — the reveal's opacity, and the pull into the corner
     .bfig-box  CSS   — the scroll drift, written as a custom property
     .bfig-img  anime — the percent of scale the reveal gives back

   Collapse any two of these into one node and the last system to write wins:
   the scrubber's `y` lands on top of the entrance mid-tween, or the departure
   erases the drift. It has to be three. */
/* `className` is not decoration. Every one of these photographs was lit
   separately and they do not share a background: measured at the pixel, the
   quietest of them peaks at luminance 6 around its border and the loudest at
   234, and three of them have the product itself crossing an edge. So the
   feather that dissolves the seam is set PER IMAGE in the stylesheet, keyed off
   this class — see the table under `.bfig-img` in brush.css. A single global
   mask either leaves seams on the bright ones or eats the subject on the dark
   ones, which is why there isn't one. */
const shot = (src, alt, { w = 1024, h = 1535, eager = false, className = '' } = {}) => `
  <figure class="bfig ${className}">
    <span class="bfig-box">
      <img class="bfig-img" src="${src}" alt="${alt}" width="${w}" height="${h}"
        decoding="async" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} />
    </span>
  </figure>`;

const facts = (list) => `
  <dl class="bfacts">
    ${list.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}
  </dl>`;

/* ══ THE DOCUMENT ══════════════════════════════════════════════════════════
   One template, in the order the visitor meets it. It is long because the site
   is long, and it is here rather than in design.html because design.html is
   HUM's document and this world does not exist until it is asked for. */
function markup(reduced) {
  return `
    <div class="bw-ground" aria-hidden="true"></div>

    <header class="bw-rail">
      <p class="bw-mark"><b>BRUSH</b><i>/ 01</i></p>
      <p class="bw-act" aria-hidden="true"><i>00</i><span>${ACTS[0].label}</span></p>
      <p class="bw-price">${CLOSE.price}</p>
    </header>

    <main class="bw-page">

      <!-- ══ 00 · HERO ══ -->
      <section class="bs bs--hero" id="b-hero">
        <div class="bh-type">
          <p class="bh-kicker"><b>${HERO.kicker}</b><i>${HERO.edition}</i></p>
          <h1 class="bh-title">${lines(HERO.title)}</h1>
          <p class="bh-lede">${HERO.lede}</p>
        </div>
        <div class="bh-shot">
          ${shot(IMAGES.hero, 'The BRUSH / 01 handle, standing.', { eager: true, className: 'bfig--hero' })}
        </div>
        <div class="bh-foot">
          ${facts(HERO.facts)}
          <p class="bh-scroll"><span class="bh-line"><i></i></span>${HERO.scroll}</p>
        </div>
      </section>

      <!-- ══ 01 · THE OBJECT ══ -->
      <section class="bs bs--object" id="b-object">
        <div class="bs-col">
          ${plate(OBJECT.no, OBJECT.label)}
          <h2 class="bt bt--mid">${lines(OBJECT.title)}</h2>
          <p class="bbody">${OBJECT.body}</p>
          <p class="bhint">${OBJECT.hint}</p>
        </div>
        <div class="bspots">
          ${shot(IMAGES.master, 'The whole handle, front on.', { w: 941, h: 1672, className: 'bfig--object' })}
          ${OBJECT.spots.map((spot, i) => `
            <button class="bspot" type="button" data-spot="${i}"
              style="--x:${spot.x}%; --y:${spot.y}%; --i:${i}"
              aria-expanded="false" aria-controls="bspot-${i}">
              <span class="bspot-dot" aria-hidden="true"></span>
              <span class="bspot-no">${spot.no}</span>
            </button>
            <span class="bspot-card" id="bspot-${i}" role="tooltip"
              style="--x:${spot.x}%; --y:${spot.y}%">
              <b>${spot.title}</b><em>${spot.text}</em>
            </span>`).join('')}
        </div>
      </section>

      <!-- ══ 02 · EXPLODED — the pinned act ══ -->
      <section class="bs bs--explode ${reduced ? 'is-still' : ''}" id="b-explode">
        <div class="bx">
          <div class="bx-head bx-head--split">
            ${plate(EXPLODE.no, EXPLODE.label)}
            <!-- Two lines, and the stylesheet throws one to each side of the
                 product. The order of the spans IS the reading order across
                 it, so nothing here changes when the copy does. -->
            <h2 class="bt bt--tight bt--split">${lines(EXPLODE.title)}</h2>
          </div>

          <div class="bx-stage">
            ${reduced
              ? `<img class="bx-still" src="${SEQUENCE.still}" width="1024" height="1535"
                   alt="The handle fully exploded: shell, motor, sensor ring, cell and control board." />`
              : `<canvas class="bx-canvas" role="img"
                   aria-label="The handle coming apart as you scroll: shell, motor, sensor ring, cell and control board."></canvas>`}
            <div class="bx-labels" aria-hidden="${reduced ? 'false' : 'true'}">
              ${EXPLODE.labels.map((label, i) => `
                <p class="bx-label bx-label--${label.side}" data-label="${i}">
                  <b>${label.no}</b><span>${label.name}</span><em>${label.spec}</em>
                </p>`).join('')}
            </div>
          </div>

          <div class="bx-foot">
            <p class="bx-hint">${EXPLODE.hint}</p>
            <p class="bx-read">
              <span>${EXPLODE.readout}</span>
              <b class="bx-pct">00%</b>
              <span class="bx-bar" aria-hidden="true"><i></i></span>
              <span class="bx-parts">${EXPLODE.parts}</span>
            </p>
          </div>
        </div>
      </section>

      <!-- ══ 03 · INTERNALS ══ -->
      <section class="bs bs--internals" id="b-internals">
        <div class="bs-wide">
          ${plate(INTERNALS.no, INTERNALS.label)}
          <h2 class="bt bt--big">${lines(INTERNALS.title)}</h2>
        </div>
        <div class="bi-grid">
          <div class="bi-main">
            ${shot(IMAGES.internals, 'The smoked shell, lit from behind so the internals read through it.', { className: 'bfig--internals' })}
          </div>
          <div class="bi-side">
            <p class="bbody">${INTERNALS.body}</p>
            ${facts(INTERNALS.notes)}
            <div class="bi-rear">
              ${shot(IMAGES.rear, 'The back of the handle.', { className: 'bfig--rear' })}
              <p class="bcap">${INTERNALS.rearCaption}</p>
            </div>
          </div>
        </div>
      </section>

      <!-- ══ 04 · PRESSURE — the full-bleed band ══
           This photograph is the brightest on the page at its border (luminance
           38 average down its left edge, peaking at 234) and its subject runs
           off three sides of the frame. There is no feather that hides that and
           keeps the brush heads. So it is not feathered: it is run edge to edge
           across the whole viewport, where the only edges left to see are the
           screen's own. The 50/50 split goes with it. -->
      <section class="bs bs--pressure" id="b-pressure">
        <div class="bs-band bwin">
          ${shot(IMAGES.pressure, 'The neck of the handle under load, the collar warm amber.', { w: 1535, h: 1024, className: 'bfig--wide bfig--pressure' })}
        </div>
        <div class="bs-col">
          ${plate(PRESSURE.no, PRESSURE.label)}
          <h2 class="bt bt--mid">${lines(PRESSURE.title)}</h2>
          <p class="bbody">${PRESSURE.body}</p>

          <div class="bpm" data-over="false">
            <p class="bpm-cap">${PRESSURE.meter.caption}</p>
            <div class="bpm-track">
              <span class="bpm-fill"></span>
              <span class="bpm-limit" style="--at:${(PRESSURE.meter.limit / PRESSURE.meter.max) * 100}%">
                <i>${PRESSURE.meter.threshold}</i>
              </span>
            </div>
            <p class="bpm-out">
              <b class="bpm-val">0.0</b><em>${PRESSURE.meter.unit}</em>
              <span class="bpm-state">${PRESSURE.meter.under}</span>
            </p>
          </div>
        </div>
      </section>

      <!-- ══ 05 · THE HEAD ══ -->
      <section class="bs bs--head" id="b-head">
        <div class="bs-wide">
          ${plate(HEAD.no, HEAD.label)}
          <h2 class="bt bt--mega">${lines(HEAD.title)}</h2>
        </div>
        <div class="bhd-shot">
          ${shot(IMAGES.macro, 'The bristle field, close enough to count the filaments.', { w: 1024, h: 1536, className: 'bfig--macro' })}
        </div>
        <div class="bhd-side">
          <p class="bbody">${HEAD.body}</p>
          ${facts(HEAD.facts)}
        </div>
      </section>

      <!-- ══ 06 · PERFORMANCE ══ -->
      <section class="bs bs--power" id="b-power">
        <div class="bs-col">
          ${plate(POWER.no, POWER.label)}
          <h2 class="bt bt--mid">${lines(POWER.title)}</h2>
          <p class="bbody">${POWER.body}</p>
        </div>
        <div class="bs-plate">
          ${shot(IMAGES.battery, 'The cell and the control board, out of the shell.', { className: 'bfig--battery' })}
        </div>
        <ol class="bnums">
          ${POWER.stats.map((stat, i) => `
            <li class="bnum" data-num="${i}">
              <b class="bnum-v" data-to="${stat.value}" data-text="${stat.text}">0</b>
              <span class="bnum-u">${stat.unit}</span>
              <em class="bnum-n">${stat.note}</em>
            </li>`).join('')}
        </ol>
        <dl class="btable">
          ${POWER.table.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}
        </dl>
      </section>

      <!-- ══ 07 · THE DOCK ══ -->
      <section class="bs bs--dock" id="b-dock">
        <div class="bs-wide bs-wide--centre">
          ${plate(DOCK.no, DOCK.label)}
          <h2 class="bt bt--mid bt--centre">${lines(DOCK.title)}</h2>
        </div>
        <div class="bd-shot">
          ${shot(IMAGES.dock, 'The handle standing in its brass dock.', { className: 'bfig--dock' })}
        </div>
        <div class="bd-foot">
          ${facts(DOCK.facts)}
          <p class="bbody bbody--narrow">${DOCK.body}</p>
        </div>
      </section>

      <!-- ══ 08 · CLOSE ══ -->
      <section class="bs bs--close" id="b-close">
        <div class="bc-shot">
          ${shot(IMAGES.final, 'BRUSH / 01, finished.', { w: 1023, h: 1537, className: 'bfig--final' })}
        </div>
        <div class="bc-type">
          <h2 class="bt bt--mega bt--close">${lines(CLOSE.title)}</h2>
          <div class="bc-buy">
            <p class="bc-code">${CLOSE.code}</p>
            <p class="bc-price">${CLOSE.price}</p>
            <button class="bc-cta" type="button" data-magnetic data-cursor="BUY">
              <span>${CLOSE.cta}</span><i aria-hidden="true">→</i>
            </button>
          </div>
          <p class="bc-ship">${CLOSE.ship}</p>
        </div>
      </section>

      <footer class="bw-foot">
        <p class="bw-colophon">${CLOSE.colophon}</p>
        <button class="bw-home" type="button" data-cursor="BACK">
          <i aria-hidden="true">←</i>${CLOSE.back}
        </button>
      </footer>
    </main>

    <div class="bw-base" aria-hidden="true"><i class="bw-base-fill"></i></div>`;
}

/* ══ THE WORLD ═════════════════════════════════════════════════════════════ */
export function createBrush(spec, host, context = {}) {
  const reduced = motion.reduced;

  const root = el('div', 'bw');
  root.id = 'world-02';
  root.dataset.world = spec.id;
  root.hidden = true;
  root.tabIndex = -1;
  root.setAttribute('aria-label', `${spec.name} — world ${spec.id}`);
  root.style.setProperty('--b-origin', `${CORNERS[spec.corner].x * 100}% ${CORNERS[spec.corner].y * 100}%`);
  root.innerHTML = markup(reduced);
  host.appendChild(root);

  const ground = $('.bw-ground', root);
  const rail = $('.bw-rail', root);
  const base = $('.bw-base', root);
  const heroType = $('.bh-type', root);
  const heroShot = $('.bh-shot', root);
  const heroFoot = $('.bh-foot', root);
  const heroLines = $$('.bh-title .bl > i', root);
  const heroBox = $('.bh-shot .bfig-box', root);

  // Everything that has to be undone. One list, one loop, so `destroy` cannot
  // drift out of step with what was actually started.
  const teardown = [];
  const own = (stop) => { if (typeof stop === 'function') teardown.push(stop); };

  /* ── PLATES AND LINES ──────────────────────────────────────────────────
     The generic entrance, and the only one most of the page needs: a plate
     draws itself, a headline's lines rise out of their masks, and body copy
     follows. Everything below the hero comes in this way; the hero is owned by
     `enter` instead, because its entrance is the world's arrival. */
  function initReveals() {
    for (const node of $$('.bp', root)) {
      const parts = $$('.bp-no, .bp-label', node);
      const rule = $('.bp-rule i', node);
      if (reduced) { utils.set(parts, { opacity: 1, y: 0 }); utils.set(rule, { scaleX: 1 }); continue; }
      utils.set(parts, { opacity: 0, y: 9 });
      utils.set(rule, { scaleX: 0 });
      own(inView(node, {
        once: true,
        amount: 0.6,
        onEnter: () => {
          animate(parts, { opacity: 1, y: 0, duration: 560, delay: stagger(60), ease: EASE.rise });
          animate(rule, { scaleX: 1, duration: 900, delay: 120, ease: EASE.glide });
        },
      }));
    }

    // Titles below the hero.
    for (const title of $$('.bt', root)) {
      const inner = $$('.bl > i', title);
      if (!inner.length) continue;
      if (reduced) { utils.set(inner, { y: '0%', opacity: 1 }); continue; }
      utils.set(inner, { y: '110%', opacity: 1 });
      own(inView(title, {
        once: true,
        amount: 0.35,
        onEnter: () => animate(inner, {
          y: '0%',
          duration: 980,
          delay: stagger(80),
          ease: EASE.rise,
        }),
      }));
    }

    /* Prose, specs and captions — EXCEPT anything in the hero, which belongs
       to `enter` and only to `enter`.

       This is not tidiness, it is a bug designed out. The reveal below observes
       each block's parent with the bottom of the root trimmed by 8%, so a block
       sitting in the last slice of the first screen is never inside the observed
       region while the page is at rest — and the hero's spec row sits exactly
       there, on the fold, by design. Left in this list it is set to opacity 0 at
       build and then waits for an intersection that only happens if somebody
       scrolls, which means arriving in this world shows a hero with its
       specifications missing. */
    const copy = $$('.bbody, .bfacts > div, .bhint, .bcap, .btable > div, .bc-buy > *, .bc-ship, .bw-foot > *', root)
      .filter((node) => !node.closest('.bs--hero'));
    if (reduced) {
      utils.set(copy, { opacity: 1, y: 0 });
    } else {
      utils.set(copy, { opacity: 0, y: 14 });
      // Grouped by parent so a three-item spec row staggers within itself
      // rather than staggering across the whole act.
      const byParent = new Map();
      for (const node of copy) {
        if (!byParent.has(node.parentElement)) byParent.set(node.parentElement, []);
        byParent.get(node.parentElement).push(node);
      }
      for (const [parent, list] of byParent) {
        own(inView(parent, {
          once: true,
          amount: 0,
          margin: '0px 0px -8% 0px',
          onEnter: () => animate(list, {
            opacity: 1, y: 0, duration: 760, delay: stagger(70), ease: EASE.rise,
          }),
        }));
      }
    }
  }

  /* ── PRODUCT SHOTS ─────────────────────────────────────────────────────
     Two gestures on every figure below the hero, and they are deliberately
     kept on two different elements: the figure is unmasked once (a wipe, plus
     a percent of scale it gives back), and the image inside it drifts against
     the scroll for as long as it is on screen. */
  function initShots() {
    for (const fig of $$('.bfig', root)) {
      if (fig.closest('.bh-shot')) continue;   // the hero belongs to `enter`
      const box = $('.bfig-box', fig);
      const img = $('.bfig-img', fig);

      if (!reduced) {
        utils.set(fig, { opacity: 0 });
        utils.set(img, { scale: 1.08 });
        own(inView(fig, {
          once: true,
          amount: 0.15,
          onEnter: () => {
            animate(fig, { opacity: 1, duration: 900, ease: EASE.soft });
            animate(img, { scale: 1, duration: 1500, ease: EASE.rise });
          },
        }));
      }

      // The drift. Small — twenty-odd pixels across a whole screen of travel —
      // because parallax you can name is parallax that is too strong.
      if (!reduced) {
        const range = Number(fig.dataset.drift ?? (fig.classList.contains('bfig--wide') ? 26 : 46));
        own(scrubber(fig, (p) => {
          // A custom property on the middle element, never a transform: the
          // stylesheet turns it into one, so anime's transforms on the figure
          // and on the image never meet it.
          box.style.setProperty('--drift', `${((p - 0.5) * -2 * range).toFixed(1)}px`);
        }));
      }
    }
  }

  /* ── THE HUD ───────────────────────────────────────────────────────────
     The rail reads whichever act is crossing the middle of the screen, and the
     hairline at the foot reads how far through the film you are. Two style
     writes a frame between them, and neither measures anything. */
  function initHud() {
    const no = $('.bw-act i', rail);
    const label = $('.bw-act span', rail);
    let current = null;

    for (const act of ACTS) {
      const node = root.querySelector(`#${act.id}`);
      if (!node) continue;
      own(inView(node, {
        amount: 0,
        margin: '-48% 0px -48% 0px',
        onEnter: () => {
          if (current === act.id) return;
          current = act.id;
          if (no) no.textContent = act.no;
          if (label) label.textContent = act.label;
          root.dataset.act = act.no;
        },
      }));
    }

    const fill = $('.bw-base-fill', base);
    let last = -1;
    own(frame.add(() => {
      if (root.hidden) return;
      // The shared scroll value, already computed once for the whole page.
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? clamp(window.scrollY / max, 0, 1) : 0;
      const rounded = Math.round(p * 1000) / 1000;
      if (rounded === last) return;
      last = rounded;
      fill.style.transform = `scaleX(${rounded})`;
    }));
  }

  /* ── 01 · THE MARKERS ──────────────────────────────────────────────────
     The one thing on this page you press rather than scroll past. Three
     markers on the handle; one card at a time, because three cards fanned out
     at once is a diagram and this is supposed to be a thing somebody finds.

     TWO STATES, NOT ONE, and that is the whole design of it. `open` is what is
     showing; `pinned` is what has been asked to stay. A hover opens and closes
     as the pointer passes, and a PRESS pins — so the card survives the pointer
     leaving and can be read, and pressing again lets it go.

     The single-state version of this does not work, and it fails in a way that
     looks like the click is broken: moving a mouse onto a marker opens the card
     via hover, so a click that toggles "is it open?" arrives to find it already
     open and closes it. Nothing appears to happen. Pinning asks a different
     question — "was this one held?" — which hover never answers, so the two
     gestures stop fighting. It also happens to be the behaviour that suits
     every input: on a touch screen there is no hover, so a tap pins and a
     second tap releases; on a keyboard, Tab previews and Enter pins. */
  function initSpots() {
    const buttons = $$('.bspot', root);
    const cards = $$('.bspot-card', root);
    let open = -1;
    let pinned = -1;

    const show = (index) => {
      if (open === index) return;
      open = index;
      buttons.forEach((button, i) => {
        const on = i === index;
        button.classList.toggle('is-open', on);
        button.setAttribute('aria-expanded', String(on));
        cards[i]?.classList.toggle('is-open', on);
      });
    };

    const release = () => { pinned = -1; show(-1); };

    buttons.forEach((button, i) => {
      button.addEventListener('click', () => {
        pinned = pinned === i ? -1 : i;
        show(pinned === i ? i : -1);
      });

      // Focus previews without pinning: tabbing through three markers should
      // not leave three of them held open behind you.
      button.addEventListener('focus', () => { if (pinned === -1) show(i); });
      button.addEventListener('blur', () => { if (pinned === -1 && open === i) show(-1); });

      if (hasHover) {
        button.addEventListener('pointerenter', () => { if (pinned === -1) show(i); });
        button.addEventListener('pointerleave', () => { if (pinned !== i && open === i) show(-1); });
      }
    });

    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && open !== -1) release();
    });
  }

  /* ── 02 · THE DISASSEMBLY ──────────────────────────────────────────────
     The wow moment, and the whole reason the act is four screens tall. The
     scroll position across the pin IS the frame number; nothing here plays, no
     timer runs, and going back up puts the toothbrush back together.

     Under reduced motion none of this exists: the act is one still of the
     fully exploded handle with all four labels showing, and the sixty frames
     are never requested. */
  let sequence = null;

  function initExplode() {
    const section = $('.bs--explode', root);
    const labels = $$('.bx-label', root);
    if (!section) return;

    /* MOTION DECLINED. The act is one still of the finished disassembly, every
       callout showing at once, and the readout tells the truth about it: this
       is the end state, not nought percent of a journey nobody can take. */
    if (reduced) {
      for (const label of labels) label.classList.add('is-on', 'is-top');
      const still = {
        pct: $('.bx-pct', root),
        bar: $('.bx-bar i', root),
        hint: $('.bx-hint', root),
      };
      if (still.pct) still.pct.textContent = '100%';
      if (still.bar) still.bar.style.transform = 'scaleX(1)';
      if (still.hint) still.hint.textContent = EXPLODE.stillHint;
      return;
    }

    const canvas = $('.bx-canvas', root);
    const pct = $('.bx-pct', root);
    const bar = $('.bx-bar i', root);
    const stage = $('.bx-stage', root);
    const head = $('.bx-head', root);
    const hint = $('.bx-hint', root);

    sequence = createSequence(canvas, {
      dir: SEQUENCE.dir,
      count: SEQUENCE.count,
      onProgress: (p) => {
        const whole = Math.round(p * 100);
        if (pct.dataset.v !== String(whole)) {
          pct.dataset.v = String(whole);
          pct.textContent = `${String(whole).padStart(2, '0')}%`;
        }
        bar.style.transform = `scaleX(${p.toFixed(3)})`;
      },
    });
    own(sequence.destroy);

    /* The labels. Each one owns a band of the disassembly and is on screen
       only while the part it names is travelling — an industrial drawing being
       annotated as it comes apart, rather than four captions parked over the
       product for four screens. */
    /* The bands DELIBERATELY overlap, so one callout is still leaving while the
       next arrives — on a wide screen they are at different heights beside
       different parts and the overlap is the whole grace of it. On a phone
       they stack into one line at the foot of the picture and two at once is
       two lines of type on top of each other, so the furthest-along one is
       marked and the stylesheet shows only that one below 760px. */
    const bands = EXPLODE.labels;
    let lit = -1;
    const setLabels = (p) => {
      let top = -1;
      for (let i = 0; i < bands.length; i += 1) {
        const on = p >= bands[i].at && p < bands[i].out;
        if (labels[i].classList.contains('is-on') !== on) labels[i].classList.toggle('is-on', on);
        if (on) top = i;
      }
      if (top === lit) return;
      labels.forEach((label, i) => label.classList.toggle('is-top', i === top));
      lit = top;
      stage.dataset.part = top >= 0 ? bands[top].no : '';
    };

    /* THE TITLE CARD LEAVES. It is not a heading sitting above a picture, it
       is the card at the front of the act — and the parts eventually arrive in
       the two columns it occupies. Fading it on the same scrub that drives the
       frames means it is gone before they get there rather than being collided
       with, and it reads as direction rather than as a fix. The hint goes with
       it: an instruction to scroll is spent the moment somebody has scrolled.

       0.2, and the number is measured rather than chosen. The handle sits
       within 9% of the stage height of the middle for the first fifth of the
       disassembly and the split title clears 11.5% on each side, so the two
       never meet; by a quarter of the way in the parts have thrown out to 15%
       and the columns are theirs. The title is already gone by then. */
    const fade = (p) => {
      const gone = clamp(p / 0.2, 0, 1);
      head.style.opacity = String(1 - gone);
      hint.style.opacity = String(1 - clamp(p / 0.08, 0, 1));
    };

    /* start: 0 / end: 1 is exactly the pinned range — progress 0 the instant
       the act's top reaches the top of the screen, progress 1 the instant its
       bottom reaches the bottom. Frame 0000 to frame 0059, and every position
       in between is a scroll position somebody can stop on. */
    own(scrubber(section, (p) => {
      sequence.set(p);
      setLabels(p);
      fade(p);
    }, { start: 0, end: 1 }));

    // Off screen, the chase stops. It would stop on its own once it caught up,
    // but a visitor who flings past the act mid-disassembly would otherwise
    // leave it interpolating towards a frame nobody can see.
    own(inView(section, {
      amount: 0,
      margin: '20% 0px 20% 0px',
      onLeave: () => sequence.pause(),
    }));
  }

  /* ── 04 · THE PRESSURE METER ───────────────────────────────────────────
     A real reading of a fictional thing, driven by where you are in the act:
     the load climbs as you scroll in, crosses 2.4 newtons, and then falls back
     — which is the product's own behaviour, not a decoration. The collar going
     amber is the same state change the copy describes. */
  function initMeter() {
    const section = $('.bs--pressure', root);
    const meter = $('.bpm', root);
    if (!section || !meter) return;

    const fill = $('.bpm-fill', meter);
    const value = $('.bpm-val', meter);
    const state = $('.bpm-state', meter);
    const { limit, max, over, under } = PRESSURE.meter;

    if (reduced) {
      fill.style.transform = `scaleX(${(limit / max).toFixed(3)})`;
      value.textContent = limit.toFixed(1);
      return;
    }

    // Up to a shove, then the drive easing itself off. The peak is past the
    // limit on purpose — a meter that never crosses its own threshold never
    // demonstrates the thing it is there to demonstrate.
    const PEAK = 0.62;
    const load = (p) => (p < PEAK
      ? lerp(0, 3.3, p / PEAK)
      : lerp(3.3, 1.9, (p - PEAK) / (1 - PEAK)));

    let lastText = '';
    own(scrubber(section, (p) => {
      const n = load(p);
      fill.style.transform = `scaleX(${clamp(n / max, 0, 1).toFixed(3)})`;
      const text = n.toFixed(1);
      if (text !== lastText) {
        lastText = text;
        value.textContent = text;
        const isOver = n > limit;
        if ((meter.dataset.over === 'true') !== isOver) {
          meter.dataset.over = String(isOver);
          state.textContent = isOver ? over : under;
        }
      }
    }, { start: 0.85, end: 0.15 }));
  }

  /* ── 06 · THE NUMBERS ──────────────────────────────────────────────────
     Counters, once each, when the act arrives. The formatted string in the
     markup is what finally lands — the count is a proxy value and the last
     write is the text the copy actually asked for, so 31,000 keeps its comma
     and nothing has to parse a formatted number back out.

     WHEN, AND WHY IT IS NOT THE USUAL THRESHOLD. Every other reveal on this
     page is a thing that happens TO an element, so firing it as the element
     clears the bottom edge is right. A count is different: it is a thing that
     takes time, and the row only stays on screen for about a screen and a half
     of travel. Started as it first peeked in — 40% of a 197px block, which is
     eighty pixels above the fold — the tween ran for its 1.6 seconds while the
     visitor kept scrolling, and at an ordinary speed it landed some two and a
     half thousand pixels above the top of the window. Nobody ever saw a moving
     number; they saw 31,000, already arrived, every time they looked at it.

     So the row has to be on screen before it starts — and the threshold is
     bounded on BOTH sides. Late enough that the count is not spent on a sliver
     at the bottom edge; early enough that a row somebody has stopped on can
     never be sitting there fully visible and reading nought, which is a worse
     failure than the one being fixed. Sixty percent of the block inside the top
     ninety-two of the window puts the first digit on the move within twenty
     pixels of the row clearing the fold.

     It is a ratio and not a pixel count because the row stacks into one column
     on a phone and is three times taller there. Sixty percent of it is reachable
     on any screen this site is legible on; a fixed margin would not be.

     AND IF THEY LEAVE ANYWAY. A count interrupted is a count nobody watched, so
     it is put back to zero and stays armed. These numbers are spent only on
     somebody who was actually looking at them, which is why the observer is
     disconnected on COMPLETION rather than on arrival. */
  function initCounters() {
    const nodes = $$('.bnum-v', root);
    if (!nodes.length) return;

    if (reduced) {
      for (const node of nodes) node.textContent = node.dataset.text;
      return;
    }

    const zero = () => { for (const node of nodes) node.textContent = '0'; };
    zero();

    let running = [];
    let landed = 0;
    let spent = false;
    let stop = null;

    stop = inView($('.bnums', root), {
      amount: 0.6,
      margin: '0px 0px -8% 0px',

      onEnter: () => {
        if (spent || running.length) return;
        landed = 0;
        running = nodes.map((node, i) => {
          const to = Number(node.dataset.to);
          const proxy = { v: 0 };
          return animate(proxy, {
            v: to,
            // Shorter than it was, and by exactly the amount the row's time on
            // screen is short: the last of the three now lands 1.5s after the
            // first digit moves rather than 1.86s.
            duration: 1300,
            delay: i * 100,
            ease: EASE.glide,
            onUpdate: () => { node.textContent = Math.round(proxy.v).toLocaleString('en-US'); },
            onComplete: () => {
              node.textContent = node.dataset.text;
              landed += 1;
              if (landed < nodes.length) return;
              spent = true;
              running = [];
              stop?.();
            },
          });
        });
      },

      // Fires once on arrival too, before anything is on screen — which is only
      // the reset it already is.
      onLeave: () => {
        if (spent) return;
        for (const animation of running) animation.pause();
        running = [];
        zero();
      },
    });

    own(() => stop?.());
  }

  /* ── THE HERO, WHILE YOU ARE STANDING IN IT ────────────────────────────
     Parallax from the pointer, not from the scroll, and deliberately tiny: the
     product moves about ten pixels across the whole screen and the type moves
     four the other way. Enough that the hero has depth, not enough that
     anybody would say the toothbrush moves. Runs only while the hero is on
     screen, and only where there is a pointer to read. */
  function initHeroDrift() {
    if (reduced || !hasHover || !heroBox) return;
    let stop = null;
    let x = 0;
    let y = 0;

    const run = (dt) => {
      const k = 1 - Math.exp(-dt / 220);
      const tx = (pointer.sx / window.innerWidth - 0.5) * 2;
      const ty = (pointer.sy / window.innerHeight - 0.5) * 2;
      x += (tx - x) * k;
      y += (ty - y) * k;
      heroBox.style.setProperty('--px', `${(x * -11).toFixed(2)}px`);
      heroBox.style.setProperty('--py', `${(y * -7).toFixed(2)}px`);
      heroType?.style.setProperty('--px', `${(x * 4).toFixed(2)}px`);
      heroType?.style.setProperty('--py', `${(y * 3).toFixed(2)}px`);
    };

    own(inView($('.bs--hero', root), {
      amount: 0,
      onEnter: () => { stop ??= frame.add(run); },
      onLeave: () => { stop?.(); stop = null; },
    }));
    own(() => stop?.());
  }

  /* ── THE HANDOFF ───────────────────────────────────────────────────────
     One gesture, and the only one added for continuity: as the hero leaves,
     the product grows very slightly and settles downward while the typography
     lifts and gives up most of its opacity. The hero does not end and the next
     act begin — the type gets out of the way and the object is handed forward
     still growing, which is what the section under it opens on.

     Deliberately small. The scale runs to 1.05 and the type moves forty pixels;
     anything larger stops reading as continuity and starts reading as an
     effect, and this page already has enough motion. It is a scroll position,
     not an animation: there is no timeline, nothing plays, and scrolling back
     up puts it exactly where it was. */
  function initHandoff() {
    const hero = $('.bs--hero', root);
    if (!hero || reduced || !heroShot) return;

    /* THE RANGE MATTERS AS MUCH AS THE GESTURE. `end: 1` would measure this
       act from its top reaching the top of the screen to its BOTTOM reaching
       the top — and the hero is exactly one screen tall, so that span is zero
       and the whole handoff would fire inside the first pixel of scroll. With
       `end: 0` the span is the hero's own height: it begins as the page moves
       and finishes as the hero leaves, which is the thing being described. */
    own(scrubber(hero, (p) => {
      // Nothing happens for the first third: the hero is meant to be still
      // while it is being read.
      const t = clamp((p - 0.34) / 0.66, 0, 1);
      // Eased, so the handoff accelerates away rather than tracking the scroll
      // linearly — a linear one feels like dragging a slider.
      const e = t * t * (3 - 2 * t);
      heroShot.style.setProperty('--cs', (1 + e * 0.05).toFixed(4));
      heroShot.style.setProperty('--cy', `${(e * 34).toFixed(1)}px`);
      // The product goes last and goes quietly. It is still the largest thing
      // on the screen while the next act is arriving underneath it, so it has
      // to be gone before it can crowd it.
      heroShot.style.opacity = String(1 - clamp((e - 0.45) / 0.5, 0, 1));
      if (heroType) {
        heroType.style.setProperty('--cy', `${(e * -46).toFixed(1)}px`);
        heroType.style.opacity = String(1 - e * 0.82);
      }
    }, { start: 0, end: 0 }));
  }

  /* ── THE BUY ───────────────────────────────────────────────────────────
     The one button on the page that is supposed to feel like a thing. It is
     also honest: this product cannot be bought, so pressing it says so rather
     than pretending to open a checkout. */
  function initClose() {
    const cta = $('.bc-cta', root);
    // `magnetic` alone. `tactile` writes the same transform, and two systems
    // on one element is the bug this whole file is arranged to avoid.
    if (cta && !reduced) magnetic(cta, { strength: 0.26, rotate: 0 });
    cta?.addEventListener('click', () => {
      if (cta.dataset.said === 'true') return;
      cta.dataset.said = 'true';
      const label = $('span', cta);
      const was = label.textContent;
      label.textContent = 'IT IS NOT REAL';
      window.setTimeout(() => {
        label.textContent = was;
        cta.dataset.said = 'false';
      }, 2000);
    });

    $('.bw-home', root)?.addEventListener('click', () => context.travel?.('01'));
  }

  /* ── BUILD ─────────────────────────────────────────────────────────────
     Every piece in its own try, so one failing system leaves the other eight
     standing. A product page that loses its pressure meter is still a product
     page; one that throws on build is a blank screen. */
  for (const step of [initReveals, initShots, initHud, initSpots, initExplode, initMeter, initCounters, initHeroDrift, initHandoff, initClose]) {
    try { step(); } catch (error) { console.warn(`BRUSH: ${step.name} failed.`, error); }
  }

  /* ══ ARRIVAL ═════════════════════════════════════════════════════════════
     Out of the corner the visitor pressed, and it is the hero's only entrance:
     arriving through the portal and arriving on a shared link are the same
     sequence, because they are the same event.

     WHAT MOVES: the ground, the rail, the hero's type, the hero's product and
     the hero's foot. Not the page — see the note at the top of this file about
     sticky and transformed ancestors. */
  const heroParts = () => [heroType, heroShot, heroFoot].filter(Boolean);

  function enter(timeline, ctx) {
    // FIRST, and synchronously. `enter` is called while the timeline is being
    // built — which is before the portal is opaque and before `show`, so this
    // world is still `hidden` and nobody can see it happen. Doing it later, on
    // the timeline or in `settle`, would either overwrite the starting
    // positions set below or pop the last departure's leftovers back into view
    // after the portal had already gone.
    restore();

    const corner = ctx?.corner ?? spec.corner;
    const dir = towards(corner);
    const c = CORNERS[corner];
    const at = ctx?.at ?? 0;

    if (reduced || !timeline) {
      utils.set([ground, rail, base, ...heroParts()], { opacity: 1, x: 0, y: 0, scale: 1 });
      utils.set(heroLines, { y: '0%' });
      return;
    }

    // The ground unfolds from the doorway rather than from the middle, so the
    // screen opens where the portal just was.
    utils.set(ground, { transformOrigin: `${c.x * 100}% ${c.y * 100}%`, scale: 1.1, opacity: 1 });
    timeline.add(ground, { scale: 1, duration: 700, ease: EASE.rise }, at);

    // The product carries the most distance and the most time — it is the
    // thing the world is about, so it is the thing still settling when
    // everything else has landed.
    utils.set(heroShot, { x: dir.x * 62, y: dir.y * 62, scale: 1.05, opacity: 0 });
    timeline.add(heroShot, {
      x: 0, y: 0, scale: 1, opacity: 1, duration: 1000, ease: EASE.rise,
    }, at + 20);

    utils.set(heroLines, { y: '110%' });
    timeline.add(heroLines, {
      y: '0%', duration: 900, delay: stagger(70), ease: EASE.rise,
    }, at + 90);

    const small = [$('.bh-kicker', root), $('.bh-lede', root), heroFoot, rail, base].filter(Boolean);
    utils.set(small, { x: dir.x * 20, y: dir.y * 20, opacity: 0 });
    timeline.add(small, {
      x: 0, y: 0, opacity: 1, duration: 620, delay: stagger(55), ease: EASE.rise,
    }, at + 130);
  }

  /* ══ DEPARTURE ═══════════════════════════════════════════════════════════
     Whatever is on screen leans towards the corner being pressed, nearest
     first. It is chosen at the moment of departure rather than at build, for
     the same reason HUM's is: a visitor leaving from the dock act must watch
     the dock act react, and animating a hero six screens up is work with no
     audience.

     Every value written here is put back by `enter`, which sets its own
     starting positions on the hero, and by `restore` for anything else. */
  const moved = new Set();

  function exit(timeline, ctx) {
    if (reduced || !timeline) return;
    const corner = ctx.corner;
    const dir = towards(corner);

    // Product shots first — they are the biggest things on any screen of this
    // site and the ones the eye is already on.
    const figures = onScreen($$('.bfig', root), { corner, limit: 4 });
    figures.forEach((item, i) => {
      const vector = pullTo(item, corner, { reach: 0.5 });
      moved.add(item.node);
      timeline.add(item.node, {
        x: vector.x.toFixed(1),
        y: vector.y.toFixed(1),
        scale: 0.9,
        opacity: 0,
        duration: 340,
        ease: EASE.exit,
      }, i * 28);
    });

    // Then the type in front of them.
    const type = onScreen($$('.bt, .bh-title, .bnum, .bpm, .bp', root), { corner, limit: 5 });
    type.forEach((item, i) => {
      moved.add(item.node);
      timeline.add(item.node, {
        x: dir.x * 40,
        y: dir.y * 40,
        opacity: 0,
        duration: 300,
        ease: EASE.exit,
      }, 60 + i * 24);
    });

    const chrome = [rail, base].filter(Boolean);
    for (const node of chrome) moved.add(node);
    timeline.add(chrome, {
      x: dir.x * 24, y: dir.y * 24, opacity: 0, duration: 260, delay: stagger(40), ease: EASE.exit,
    }, 0);

    timeline.add(ground, { scale: 0.98, duration: 340, ease: EASE.exit }, 0);
  }

  /* Rest is DERIVED, not recorded — the same reasoning as world01.js. Every
     element this world moves on the way out has a rest of "untransformed and
     opaque", so putting it back is a statement rather than a snapshot that
     could have caught something mid-entrance. */
  function restore() {
    if (!moved.size) return;
    utils.set([...moved], { x: 0, y: 0, scale: 1, opacity: 1 });
    moved.clear();
  }

  /* ── WARMING ───────────────────────────────────────────────────────────
     The two shots below the fold, fetched once the arrival is over and the
     browser has nothing better to do. Everything further down is `loading`
     lazy and stays that way — this is only about the first scroll not being
     the first time the second act is asked for. */
  function warm() {
    const later = () => {
      for (const src of [IMAGES.master, IMAGES.internals]) new Image().src = src;
    };
    if ('requestIdleCallback' in window) window.requestIdleCallback(later, { timeout: 2000 });
    else window.setTimeout(later, 900);
  }

  let warmed = false;
  let scrollY = 0;

  return {
    id: spec.id,
    root,

    show() {
      root.hidden = false;
      root.dataset.state = 'live';
      // The act you were reading, not the top of the film.
      window.scrollTo(0, scrollY);
    },

    hide() {
      scrollY = window.scrollY;
      root.dataset.state = 'idle';
      sequence?.pause();
      // `hidden`, not opacity: with the world collapsed every observer in it
      // reports off screen, so the disassembly chase, the four parallax
      // scrubbers, the meter and the hero drift all stop by themselves.
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
