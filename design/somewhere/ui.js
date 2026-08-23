// UI — the type over the world.
//
// Everything here is DOM, not WebGL, and that is a decision rather than a
// convenience: text drawn into a canvas cannot be selected, cannot be read by a
// screen reader, does not scale with the visitor's font size and goes blurry on
// a retina display. The world is the picture; the words stay words.
//
// THE UI IS SECONDARY. Small labels, thin rules, a lot of empty space. The
// brief's rule — no giant buttons floating over the planet — is enforced here
// by the labels being anchored to the landmarks they name and following them
// as the world turns, so they read as tags on the model rather than as chrome
// on top of it.
//
// ACCESSIBILITY IS NOT A LAYER ON TOP. The four destinations are real
// `<button>`s in a real list. On a keyboard they are reachable, focusable and
// pressable without the pointer ever being involved, and the fact that they
// happen to be positioned over a 3D landmark is a visual detail. That list is
// also the entire mobile navigation.

import { el, $, $$ } from '../motion.js';
import { COPY, DESTINATIONS, BUILDING } from './content.js';

export function createUI(host, { onPick, onBack, onSound, onExplore } = {}) {
  const root = el('div', 'sw-ui');
  root.innerHTML = `
    <!-- LOADING. Not a spinner: a list of the things being built, ticked off as
         they arrive. It is over in well under a second on a warm cache, which
         is why it says what it is doing rather than how far along it is. -->
    <div class="sw-boot" data-state="live">
      <p class="sw-boot-title">BUILDING SOMEWHERE</p>
      <ul class="sw-boot-list">
        ${BUILDING.map((b) => `<li data-step="${b}"><i></i>${b}</li>`).join('')}
      </ul>
    </div>

    <!-- THE LANDING. Four lines and a button, laid out to the left of the
         planet exactly as 4-Landing.png has them. -->
    <div class="sw-landing" data-state="idle">
      <h1 class="sw-title"><span>${COPY.title}</span></h1>
      <p class="sw-welcome"><span>${COPY.welcome}</span></p>
      <p class="sw-sub"><span>${COPY.sub}</span></p>
      <span class="sw-rule"><i></i></span>
      <button class="sw-cta" type="button" data-cursor="EXPLORE">${COPY.cta}</button>
      <p class="sw-drag">
        <svg viewBox="0 0 14 20" aria-hidden="true" width="11" height="16">
          <rect x="0.75" y="0.75" width="12.5" height="18.5" rx="6.25" fill="none"
                stroke="currentColor" stroke-width="1.5"/>
          <path d="M7 5v3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        ${COPY.drag}
      </p>
    </div>

    <!-- THE LANDMARK TAGS. Positioned every frame from the 3D anchors. They are
         buttons, so this is also the keyboard navigation. -->
    <ul class="sw-marks">
      ${DESTINATIONS.map((d) => `
        <li class="sw-mark" data-dest="${d.id}" data-state="off">
          <button type="button" data-cursor="EXPLORE">
            <span class="sw-mark-dot"><i></i></span>
            <span class="sw-mark-body">
              <b>${d.name}</b>
              <em>${d.no} · ${COPY.explore} →</em>
            </span>
          </button>
        </li>`).join('')}
    </ul>

    <!-- THE DESTINATION PLATE. One element, rewritten on arrival — four of
         these would be four things to keep in step. -->
    <div class="sw-place" data-state="idle">
      <p class="sw-place-no"></p>
      <h2 class="sw-place-name"></h2>
      <p class="sw-place-line"></p>
      <dl class="sw-place-facts"></dl>
      <button class="sw-back" type="button" data-cursor="BACK">
        <i aria-hidden="true">←</i>${COPY.back}
      </button>
    </div>

    <button class="sw-sound" type="button" aria-pressed="false" title="Ambient sound">
      <span class="sw-sound-bars" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="sw-sound-label">SOUND</span>
    </button>
  `;
  host.appendChild(root);

  const boot = $('.sw-boot', root);
  const landing = $('.sw-landing', root);
  const place = $('.sw-place', root);
  const marks = new Map($$('.sw-mark', root).map((li) => [li.dataset.dest, li]));

  /* ── WIRING ──────────────────────────────────────────────────────────────
     Every landmark button reports the destination it belongs to. Delegated
     rather than four listeners, because the list is generated. */
  $('.sw-marks', root).addEventListener('click', (e) => {
    const li = e.target.closest('.sw-mark');
    if (!li) return;
    const dest = DESTINATIONS.find((d) => d.id === li.dataset.dest);
    if (dest) onPick?.(dest);
  });

  $('.sw-back', root).addEventListener('click', () => onBack?.());
  $('.sw-cta', root).addEventListener('click', () => onExplore?.());

  const soundBtn = $('.sw-sound', root);
  let soundOn = false;
  soundBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    soundBtn.setAttribute('aria-pressed', String(soundOn));
    soundBtn.dataset.on = soundOn ? 'yes' : 'no';
    onSound?.(soundOn);
  });

  /* ── POSITIONING THE TAGS ────────────────────────────────────────────────
     Called every frame with each landmark's projected screen position. Three
     things decide whether a tag is shown, and all three matter:

       behind    a landmark on the far side of the planet must not show a label
                 floating over the front of it
       edge      one sliding off the side of the viewport is noise
       hover     on a pointer device, only the one under the cursor is named;
                 on touch, all four are named all the time, because there is no
                 hover and an unlabelled target is invisible

     Written with transform and opacity only — this runs at 60fps and must
     never touch layout. */
  function positionMarks(list, { hovered = null, touch = false, visible = true } = {}) {
    list.forEach(({ dest, ndc, behind }) => {
      const li = marks.get(dest.id);
      if (!li) return;

      const off = !visible || behind
        || ndc.x < -0.94 || ndc.x > 0.94 || ndc.y < -0.94 || ndc.y > 0.94;

      const state = off ? 'off' : (touch ? 'on' : (hovered === dest ? 'on' : 'dim'));
      if (li.dataset.state !== state) li.dataset.state = state;
      if (off) return;

      // NDC (-1..1, y up) to CSS pixels (y down), as a percentage so it stays
      // right through a resize without re-reading the element's box.
      li.style.setProperty('--x', `${(ndc.x * 0.5 + 0.5) * 100}%`);
      li.style.setProperty('--y', `${(1 - (ndc.y * 0.5 + 0.5)) * 100}%`);
    });
  }

  return {
    root,
    positionMarks,

    /* Tick a build step off the loading list. */
    step(name) {
      const li = $(`.sw-boot-list [data-step="${name}"]`, root);
      if (li) li.dataset.done = 'yes';
    },

    /* The loading panel goes, the landing arrives. */
    ready() {
      boot.dataset.state = 'gone';
      landing.dataset.state = 'live';
      // Taken out of the tree once it has faded, so it can never be tabbed to.
      setTimeout(() => { boot.hidden = true; }, 700);
    },

    /* The landing type gets out of the way when the visitor commits to
       exploring — either by pressing the button or by flying somewhere. */
    set exploring(v) {
      landing.dataset.state = v ? 'away' : 'live';
    },

    /* Fill and show the destination plate. */
    arrive(dest) {
      $('.sw-place-no', root).textContent = dest.no;
      $('.sw-place-name', root).textContent = dest.name;
      $('.sw-place-line', root).textContent = dest.line;
      $('.sw-place-facts', root).innerHTML = dest.facts
        .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
      place.dataset.state = 'live';
      // Focus moves to the way out, so a keyboard visitor who just flew
      // somewhere is standing on the door rather than back at the top.
      $('.sw-back', root).focus({ preventScroll: true });
    },

    leave() {
      place.dataset.state = 'idle';
    },

    /* The flight is running: everything interactive is inert, so nothing can be
       clicked while the camera is between two places. */
    set busy(v) {
      root.dataset.busy = v ? 'yes' : 'no';
    },

    destroy() {
      root.remove();
    },
  };
}
