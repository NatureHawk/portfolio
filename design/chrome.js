// HUM — the furniture.
//
// Nav, status strip, the HUM meter, and the two micro-interactions that appear
// in more than one section (magnetic buttons, plate reveals). None of it is
// section-specific, and all of it reads the same section spine, so the nav, the
// strip and the URL can never disagree about where you are.

import {
  animate, stagger, utils, frame, inView, motion, magnetic, pointer, hasHover,
  scroll, revealUp, EASE, $, $$, el,
  motionPreference, motionSystemPrefersReduced, setMotionPreference, onMotionChange,
} from './motion.js';
import { sections, people } from './content.js';
import { avatar } from './parts.js';
import { trailDepth, watchTrail } from './trail.js';

/* ══ BACK TO THE ROOM ══════════════════════════════════════════════════════
   Going back through history lets the browser restore index.html from the
   bfcache, so the 3D room comes back already built instead of paying for a cold
   Three.js boot. Only safe if we actually came from there; a direct visit or an
   external referrer falls through to a normal navigation.
   (This is the same reasoning as /code — the two pages are unrelated, but the
   room they both return to is not.)

   ONE STEP BACK IS NOT ENOUGH, and that is the whole reason trail.js exists.
   This page owns more than one history entry: a corner crossing pushes one and
   so does every hash link in the nav. A single `history.back()` from here
   therefore lands somewhere else on this same page — the world you just left —
   rather than in the room. The way out is one step past the deepest entry this
   document owns, which is what `trailDepth` counts. */
export function initBackLinks() {
  watchTrail();

  for (const link of $$('[data-back]')) {
    link.addEventListener('click', (event) => {
      let cameFromRoom = false;
      try {
        cameFromRoom =
          document.referrer &&
          new URL(document.referrer).origin === location.origin &&
          /(^|\/)index\.html$|\/$/.test(new URL(document.referrer).pathname);
      } catch {
        cameFromRoom = false;
      }
      // The guard is not decoration: if the stack is shallower than the trail
      // claims — a session restore, a stack the browser has trimmed — there is
      // no entry back there to land on, and the href is the honest way home.
      const steps = trailDepth() + 1;
      if (cameFromRoom && history.length > steps) {
        event.preventDefault();
        history.go(-steps);
      }
    });
  }
}

/* ══ NAV ═══════════════════════════════════════════════════════════════════
   Sticky, and it gets out of the way: hidden on the way down, back on the way
   up. The threshold is deliberately not zero — a 6px flick of scroll should not
   dismiss the navigation. */
export function initNav() {
  const top = $('#top');
  if (!top) return;
  let hidden = false;
  let anchor = scroll.y;

  frame.add(() => {
    const y = scroll.y;
    top.classList.toggle('is-stuck', y > 12);

    // Anchor tracking: we hide only after 90px of continuous downward travel,
    // and show after 40px upward, so direction changes are decisive rather
    // than twitchy.
    if (scroll.direction > 0 && y > anchor + 90 && y > 200) {
      if (!hidden) { hidden = true; top.classList.add('is-away'); }
      anchor = y;
    } else if (scroll.direction < 0 && y < anchor - 40) {
      if (hidden) { hidden = false; top.classList.remove('is-away'); }
      anchor = y;
    }
    if ((scroll.direction > 0) === (y < anchor)) anchor = y;
  });

  // The nav never covers the thing you just jumped to.
  window.addEventListener('hashchange', () => {
    hidden = false;
    top.classList.remove('is-away');
  });
}

/* ══ SECTION SPINE ═════════════════════════════════════════════════════════
   One observer set drives the strip label, the nav current-state and the
   inverted strip over the closing act. */
export function initSpine() {
  const strip = $('#strip');
  const no = $('#strip-no');
  const label = $('#strip-label');
  const fill = $('#strip-fill');
  const pct = $('#strip-pct');
  const links = new Map($$('.top-link').map((a) => [a.getAttribute('href')?.slice(1), a]));

  let current = null;
  const setSection = (section) => {
    if (!section || current === section.id) return;
    current = section.id;
    if (no) no.textContent = section.no;
    if (label) label.textContent = section.label;
    strip?.classList.toggle('is-dark', section.id === 'start');

    for (const [id, link] of links) {
      link.setAttribute('aria-current', String(id === section.id));
    }
  };

  for (const section of sections) {
    const node = document.getElementById(section.id);
    if (!node) continue;
    inView(node, {
      amount: 0,
      // A band across the middle of the viewport: whichever section is crossing
      // it is the one you are reading.
      margin: '-45% 0px -45% 0px',
      onEnter: () => setSection(section),
    });
  }

  // The progress readout. Written from the shared scroll value, so it costs one
  // style write per frame and never measures anything.
  let lastPct = -1;
  frame.add(() => {
    const p = scroll.progress;
    if (fill) fill.style.transform = `scaleX(${p})`;
    const rounded = Math.round(p * 100);
    if (rounded !== lastPct && pct) {
      lastPct = rounded;
      pct.textContent = `${String(rounded).padStart(2, '0')}%`;
    }
  });
}

/* ══ PEOPLE ════════════════════════════════════════════════════════════════ */
export function initPeople() {
  for (const host of $$('[id$="-people"]')) {
    host.textContent = '';
    for (const person of people) host.appendChild(avatar(person));
  }
}

/* ══ THE HUM METER ═════════════════════════════════════════════════════════
   A real instrument, not a decorative equaliser: the level is scroll velocity
   plus pointer speed, so it is quiet when you are and busy when you are. It is
   also the honest version of a "live" indicator — a permanently pulsing dot
   claims activity that is not happening.

   Runs only while its own section is on screen. Two of these on a page (hero and
   the closing act) at 14 bars each is 28 style writes a frame; gating them means
   you never pay for both. */
export function initMeter(host, { bars = 14 } = {}) {
  if (!host) return;
  host.textContent = '';
  for (let i = 0; i < bars; i += 1) host.appendChild(el('i'));
  const nodes = $$('i', host);

  if (motion.reduced) {
    // Static, and still readable as a meter: a fixed profile rather than a flat
    // line, because a flat line looks broken.
    nodes.forEach((node, i) => {
      node.style.transform = `scaleY(${0.25 + Math.abs(Math.sin(i * 0.9)) * 0.5})`;
    });
    return;
  }

  // Per-bar phase and inertia. Without the phase offset all fourteen bars move
  // as one block, which reads as a progress bar rather than a level.
  const state = nodes.map((_, i) => ({ v: 0.2, phase: i * 0.62, target: 0.2 }));
  let level = 0;
  let stop = null;

  const run = (dt) => {
    const speed = Math.min(Math.abs(scroll.velocity) / 26, 1);
    const hand = hasHover ? Math.min(Math.hypot(pointer.vx, pointer.vy) / 9, 1) : 0;
    // Attack fast, decay slow — the shape every real level meter has.
    const drive = Math.max(speed, hand);
    level += (drive - level) * (drive > level ? 0.32 : 0.05);

    const t = performance.now() / 1000;
    for (let i = 0; i < state.length; i += 1) {
      const s = state[i];
      // A quiet idle wave under the driven level, so the meter is alive even
      // when nothing is happening — but only just.
      const idle = 0.16 + Math.sin(t * 1.4 + s.phase) * 0.06;
      s.target = Math.min(idle + level * (0.5 + Math.sin(s.phase * 2.1) * 0.35 + 0.35), 1);
      s.v += (s.target - s.v) * (1 - Math.exp(-dt / 90));
      nodes[i].style.transform = `scaleY(${s.v.toFixed(3)})`;
    }
  };

  inView(host, {
    amount: 0,
    margin: '20% 0px 20% 0px',
    onEnter: () => { stop ??= frame.add(run); },
    onLeave: () => { stop?.(); stop = null; },
  });
}

/* ══ THE MOTION SWITCH ═════════════════════════════════════════════════════
   Small, and deliberately not hidden. It exists because the system setting it
   defers to can be off for reasons that have nothing to do with the person
   reading — a vendor power profile, a machine set up by somebody else — and
   this page's whole argument is one you cannot make in a still frame.

   IT RELOADS, and that is the honest implementation rather than a lazy one.
   Every module on this page reads the budget once, at build time, and takes a
   different shape because of it: the marquee never subscribes to the clock, the
   scrubbers are never created, the objects are placed instead of dropped. There
   is no flag to flip that would retroactively give a page that was built static
   the choreography it declined to build. The preference is stored first, so
   what comes back is the same page assembled the other way — and since the
   world you are in lives in the URL, you come back into the same world.

   The label says what the page IS doing, not what pressing it would do: a
   control that reads OFF while the page is moving is a control nobody can
   parse. */
export function initMotionToggle() {
  const button = $('#motion');
  if (!button) return;
  const state = $('#motion-state', button);

  const paint = () => {
    const on = !motion.reduced;
    button.dataset.on = String(on);
    // aria-pressed describes the switch itself: pressed means motion is on.
    button.setAttribute('aria-pressed', String(on));
    if (state) state.textContent = on ? 'ON' : 'OFF';

    // The system's own answer is worth saying out loud, because the visitor who
    // needs this control is precisely the one who does not know their machine
    // has an opinion about it.
    const following = motionPreference() === null;
    const system = motionSystemPrefersReduced() ? 'reduced' : 'full';
    button.title = following
      ? `Motion follows your system setting (currently ${system}). Click to override it.`
      : `Motion is set to ${on ? 'on' : 'off'} for this site. Your system asks for ${system}.`;
    button.setAttribute(
      'aria-label',
      on ? 'Motion is on. Turn off animation on this page.' : 'Motion is off. Turn on animation on this page.'
    );
  };

  paint();

  button.addEventListener('click', () => {
    setMotionPreference(motion.reduced ? 'full' : 'reduced');
    paint();
    window.location.reload();
  });

  // Someone changing the OS setting with the page open, while not overriding it.
  onMotionChange(paint);
}

/* ══ MAGNETIC ══════════════════════════════════════════════════════════════ */
export function initMagnets() {
  for (const node of $$('[data-magnetic]')) magnetic(node, { strength: 0.2, rotate: 1.2 });
}

/* ══ PLATES ════════════════════════════════════════════════════════════════
   Every section header arrives the same way: number, label, then the rule
   drawing itself across to the count. Ten lines here instead of the same
   sequence written eight times. */
export function initPlates() {
  for (const plate of $$('.plate')) {
    const parts = $$('.plate-no, .plate-label, .plate-meta', plate);
    const rule = $('.plate-rule', plate);

    if (motion.reduced) {
      utils.set(parts, { opacity: 1, y: 0 });
      if (rule) utils.set(rule, { scaleX: 1 });
      continue;
    }

    utils.set(parts, { opacity: 0, y: 10 });
    if (rule) utils.set(rule, { scaleX: 0 });

    inView(plate, {
      once: true,
      amount: 0.4,
      onEnter: () => {
        animate(parts, {
          opacity: 1,
          y: 0,
          duration: 620,
          delay: stagger(70),
          ease: EASE.rise,
        });
        if (rule) animate(rule, { scaleX: 1, duration: 900, delay: 140, ease: EASE.glide });
      },
    });
  }
}

/* ══ BODY COPY ═════════════════════════════════════════════════════════════
   The generic entrance, applied to the things that are just prose. Kept out of
   the section modules so those only contain what is actually bespoke. */
export function initCopyReveals() {
  const groups = [
    ['.sec-top .lede', { distance: 16, stagger: 0 }],
    ['.still-col', { distance: 20, stagger: 90 }],
    ['.stat', { distance: 20, stagger: 90 }],
    ['.flat-caption > *', { distance: 12, stagger: 80 }],
    ['.desk-foot > *', { distance: 12, stagger: 80 }],
    ['.colophon > *', { distance: 16, stagger: 90 }],
  ];

  for (const [selector, options] of groups) {
    const nodes = $$(selector);
    if (!nodes.length) continue;
    if (motion.reduced) { utils.set(nodes, { opacity: 1, y: 0 }); continue; }

    // Grouped by parent so a two-column block staggers within itself rather
    // than staggering across the whole page.
    const byParent = new Map();
    for (const node of nodes) {
      const key = node.parentElement;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key).push(node);
    }
    for (const [parent, list] of byParent) {
      utils.set(list, { opacity: 0, y: options.distance ?? 16 });
      inView(parent, {
        once: true,
        // Threshold zero, and only a small bite out of the bottom of the root.
        // A block that sits at the very end of the document — the colophon —
        // can never occupy 10% of a viewport that has had 10% trimmed off it,
        // so a stricter gate here means it stays invisible forever.
        amount: 0,
        margin: '0px 0px -5% 0px',
        onEnter: () => revealUp(list, options),
      });
    }
  }
}
