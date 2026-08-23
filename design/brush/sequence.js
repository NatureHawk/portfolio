// THE IMAGE SEQUENCE — sixty frames on a piece of string.
//
// One canvas, sixty WebP stills, and a scroll position. This is the only part
// of BRUSH / 01 that is genuinely expensive, so every decision in here is about
// spending as little as possible and spending it late.
//
// WHY A CANVAS AND NOT SIXTY <img> ELEMENTS. Stacked images crossfaded by
// opacity means sixty full-screen composited layers, sixty style writes a frame
// at worst, and a browser deciding on its own when to keep or drop each one's
// decoded bitmap. One canvas is one layer, one draw call per changed frame, and
// nothing in the document reflows when the picture changes.
//
// THE LOADING LADDER. Nothing is fetched until the section is worth fetching
// for, and even then not all at once:
//
//   RUNG 1  five frames — 0, 15, 30, 45, 59 — the moment the section is within
//           two screens. Whatever the scroll position, something within seven
//           frames of correct is already drawable, so the section is never
//           blank and never has to wait to become useful.
//   RUNG 2  every fourth frame, so the whole disassembly plays at 15fps-worth
//           of positions while the rest arrives.
//   RUNG 3  everything else, nearest-to-where-you-are first.
//
// Six requests in flight at a time. More than that on a cold 4G connection just
// means every frame arrives late instead of the ones you need arriving first.
//
// MEMORY. 720×1280 decoded is 3.7MB a frame; sixty of them held at once is
// 220MB, which is a number no phone should be asked for to look at a toothbrush
// come apart. On a small or low-memory device the sequence takes every SECOND
// frame — thirty stills, half the memory, and a disassembly nobody can tell is
// running at half the sample rate because the scrubbing is interpolated anyway.
//
// NOTHING HERE READS LAYOUT ON A FRAME. The canvas box is measured by a
// ResizeObserver and the fit is recomputed only when that fires.

import { frame, inView, clamp } from '../motion.js';

const PAD = (n) => String(n).padStart(4, '0');
const CONCURRENCY = 6;

/* How many frames the device is asked to hold. Two signals, both cheap and
   neither reliable on its own: `deviceMemory` is absent on Safari and rounded
   down hard on Chrome, and a small viewport is a decent proxy for a phone. */
function strideFor() {
  const memory = navigator.deviceMemory ?? 8;
  const small = window.innerWidth < 900 || window.innerHeight < 620;
  return memory <= 4 || small ? 2 : 1;
}

export function createSequence(canvas, {
  dir,
  count,
  // How hard the drawn frame chases the scroll frame. 1 would be exact and
  // would also mean the picture inherits every stutter in the scroll; this is
  // a light drag that costs about 60ms of lag and buys a fluid disassembly.
  chase = 0.22,
  /* HOW FAR PAST CONTAIN THE PICTURE IS DRAWN.
     The frames are portrait and the screen is not, so a contained fit is
     limited by height and the toothbrush can never be taller than the viewport.
     The only way to give the disassembly more presence is to draw it larger
     than the stage and let the surplus fall outside — which the canvas clips
     for free, and which incidentally removes the top and bottom seams
     altogether, because those edges are no longer on screen to be seen.

     1.06 is not a taste value, it is measured. Real content in these frames
     runs from 2.0% of the height (the bristle tip, at full disassembly) to
     99.9% (the base and its reflection). At this scale the surplus is 54px on a
     900px screen, and `anchor` puts 22% of it above and 78% below — so nothing
     is ever cut from the top, and what leaves the bottom is reflection. */
  overscale = 1.06,
  anchor = 0.22,
  onProgress = null,
} = {}) {
  const context = canvas.getContext('2d', { alpha: true });

  const stride = strideFor();
  // The frames this instance will ever hold. Always includes the last one: an
  // explosion that stops one frame short of exploded is the one frame anybody
  // would notice.
  const indices = [];
  for (let i = 0; i < count; i += stride) indices.push(i);
  if (indices[indices.length - 1] !== count - 1) indices.push(count - 1);

  const slots = indices.map((source) => ({ source, img: null, ready: false }));
  const total = slots.length;

  /* ── LOADING ─────────────────────────────────────────────────────────── */
  const queue = [];
  const queued = new Set();
  let active = 0;
  let ready = 0;
  let stopped = false;

  function pump() {
    while (active < CONCURRENCY && queue.length) {
      const slot = queue.shift();
      if (slot.ready || slot.img) continue;
      active += 1;

      const img = new Image();
      slot.img = img;
      img.decoding = 'async';
      img.src = `${dir}/frame-${PAD(slot.source)}.webp`;

      const settle = (ok) => {
        active -= 1;
        if (ok) {
          slot.ready = true;
          ready += 1;
          // The first frame to land has to be painted, and so does any frame
          // that is a better answer than what is currently on the canvas.
          if (drawn === -1 || Math.abs(slots.indexOf(slot) - want) < Math.abs(drawn - want)) paint();
        } else {
          // A frame that failed is a frame the picker steps over. It is not
          // retried: on a connection bad enough to drop one, retrying is how
          // you drop the next five.
          slot.img = null;
        }
        if (!stopped) pump();
      };

      // `decode()` moves the expensive part off the moment of first draw. Where
      // it is missing or rejects (Safari has historically rejected on images
      // that draw perfectly well), `onload` is the answer that matters.
      img.addEventListener('load', () => {
        if (img.decode) img.decode().then(() => settle(true), () => settle(true));
        else settle(true);
      }, { once: true });
      img.addEventListener('error', () => settle(false), { once: true });
    }
  }

  function request(list) {
    for (const slot of list) {
      if (!slot || slot.ready || queued.has(slot)) continue;
      queued.add(slot);
      queue.push(slot);
    }
    pump();
  }

  const at = (fraction) => slots[Math.min(Math.round(fraction * (total - 1)), total - 1)];

  function rung1() {
    request([at(0), at(0.25), at(0.5), at(0.75), at(1)]);
  }

  function rung2() {
    request(slots.filter((_, i) => i % 4 === 0));
  }

  /* The rest, ordered outward from wherever the visitor currently is — so
     somebody who jumped into the middle of the section gets the middle of the
     sequence rather than the beginning of it. */
  function rung3() {
    const here = Math.round(want);
    const rest = slots
      .map((slot, i) => ({ slot, d: Math.abs(i - here) }))
      .filter(({ slot }) => !slot.ready && !queued.has(slot))
      .sort((a, b) => a.d - b.d)
      .map(({ slot }) => slot);
    request(rest);
  }

  /* ── FIT ─────────────────────────────────────────────────────────────────
     Recomputed on resize only, and it contains rather than covers: the frames
     are a product shot on a transparent ground and cropping one is cropping
     the toothbrush. */
  let fit = { x: 0, y: 0, w: 0, h: 0 };
  let box = { w: 0, h: 0 };

  function measure() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    // Capped at 2: past that the memory cost of the backing store doubles
    // again for a difference nobody has ever been able to point at.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (w === box.w && h === box.h) return;
    box = { w, h };
    canvas.width = w;
    canvas.height = h;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    fitTo();
    drawn = -1;
    paint();
  }

  /* THE EDGE, again, and it cannot be solved the way the still images solve it.
     A CSS mask on the canvas would feather the CANVAS box, which is the whole
     stage — and the picture only occupies a 440px column down the middle of it,
     so the feather would land on empty pixels and the frame's own studio
     backdrop would still end in a hard rectangle.

     So it is done in the draw. Two gradients, opaque at the picture's edges and
     clear through the middle, painted with `destination-out` — which erases in
     proportion to what it paints. They are built once per resize and reused on
     every frame, so a paint costs one drawImage and two fillRects. */
  let featherX = null;
  let featherY = null;

  function fitTo() {
    const source = slots.find((slot) => slot.ready)?.img;
    const iw = source?.naturalWidth || 720;
    const ih = source?.naturalHeight || 1280;
    const scale = Math.min(box.w / iw, box.h / ih) * overscale;
    const w = iw * scale;
    const h = ih * scale;
    fit = {
      w,
      h,
      x: (box.w - w) / 2,
      // The surplus height is shared by `anchor` rather than halved: an even
      // split would clip the bristle tip at full disassembly.
      y: (box.h - h) * anchor,
    };

    /* THE FEATHER, AND ONLY WHERE IT IS NEEDED. An edge drawn outside the
       canvas is already clipped by it — feathering there would be a gradient
       applied to pixels nobody can see, and worse, it would eat into the part
       that IS visible. So each axis is only softened when its edges actually
       land inside the box, which after the overscale above means the sides
       are and the top and bottom are not. */
    const opaque = 'rgba(0,0,0,1)';
    const clear = 'rgba(0,0,0,0)';

    if (fit.x > -1) {
      featherX = context.createLinearGradient(fit.x, 0, fit.x + w, 0);
      featherX.addColorStop(0, opaque);
      featherX.addColorStop(0.10, clear);
      featherX.addColorStop(0.90, clear);
      featherX.addColorStop(1, opaque);
    } else {
      featherX = null;
    }

    if (fit.y > -1 && fit.y + h < box.h + 1) {
      featherY = context.createLinearGradient(0, fit.y, 0, fit.y + h);
      featherY.addColorStop(0, opaque);
      featherY.addColorStop(0.042, clear);
      featherY.addColorStop(0.958, clear);
      featherY.addColorStop(1, opaque);
    } else {
      featherY = null;
    }
  }

  /* ── DRAWING ─────────────────────────────────────────────────────────────
     `want` is where the scroll says we are, `have` is where the picture has
     got to, `drawn` is what is actually on the canvas. Three numbers, because
     the picture chases the scroll and the canvas only repaints when the answer
     to "which frame" changes. */
  let want = 0;
  let have = 0;
  let drawn = -1;
  let fitted = false;

  /* The nearest LOADED frame to the one asked for. Searching outward rather
     than waiting is the difference between a sequence that plays roughly from
     the first second and one that plays perfectly starting whenever the last
     byte lands. */
  function pick(index) {
    if (slots[index]?.ready) return index;
    for (let step = 1; step < total; step += 1) {
      if (slots[index - step]?.ready) return index - step;
      if (slots[index + step]?.ready) return index + step;
    }
    return -1;
  }

  function paint() {
    if (!box.w) return;
    const index = pick(clamp(Math.round(have), 0, total - 1));
    if (index < 0 || index === drawn) return;
    const img = slots[index].img;
    if (!img) return;
    if (!fitted) { fitTo(); fitted = true; }
    drawn = index;
    context.clearRect(0, 0, box.w, box.h);
    context.drawImage(img, fit.x, fit.y, fit.w, fit.h);

    if (featherX || featherY) {
      context.globalCompositeOperation = 'destination-out';
      if (featherX) { context.fillStyle = featherX; context.fillRect(fit.x, fit.y, fit.w, fit.h); }
      if (featherY) { context.fillStyle = featherY; context.fillRect(fit.x, fit.y, fit.w, fit.h); }
      // Handed straight back. A composite mode left set is the next draw's bug.
      context.globalCompositeOperation = 'source-over';
    }
  }

  /* ── THE LOOP ────────────────────────────────────────────────────────────
     Subscribed to the page's one clock, and only while the section is near the
     viewport. It idles itself out the moment the picture has caught up with
     the scroll, so a visitor who has stopped reading pays nothing. */
  let unsubscribe = null;
  let idle = true;

  function run(dt) {
    // Frame-rate independent chase: the same lag at 60Hz and at 144Hz.
    const k = 1 - Math.exp((-dt * chase) / 16);
    have += (want - have) * k;
    if (Math.abs(want - have) < 0.02) {
      have = want;
      idle = true;
    }
    paint();
    if (idle) sleep();
  }

  function wake() {
    idle = false;
    if (!unsubscribe && !stopped) unsubscribe = frame.add(run);
  }

  function sleep() {
    unsubscribe?.();
    unsubscribe = null;
  }

  /* The public end of it: scroll progress in, frames out. */
  function set(progress) {
    const p = clamp(progress, 0, 1);
    want = p * (total - 1);
    onProgress?.(p, ready / total);
    if (Math.abs(want - have) > 0.02) wake();
  }

  /* ── WAKING UP ───────────────────────────────────────────────────────────
     Two rings, two rungs. The outer one is two screens out and fetches the
     five anchors; the inner one is the section actually arriving and fetches
     the rest. Nothing above this line has run before the first of them fires,
     so a visitor who never reaches the section never pays a byte for it. */
  const stopFar = inView(canvas, {
    amount: 0,
    margin: '200% 0px 200% 0px',
    once: true,
    onEnter: () => { rung1(); },
  });

  const stopNear = inView(canvas, {
    amount: 0,
    margin: '60% 0px 60% 0px',
    once: true,
    onEnter: () => {
      rung2();
      // The long tail waits for the browser to be doing nothing else. It is a
      // megabyte and a half of frames nobody is looking at yet.
      const later = () => rung3();
      if ('requestIdleCallback' in window) window.requestIdleCallback(later, { timeout: 1200 });
      else window.setTimeout(later, 600);
    },
  });

  const observer = new ResizeObserver(measure);
  observer.observe(canvas);
  measure();

  return {
    set,
    /* The section-visible gate, so a canvas that is off screen is not being
       chased towards a frame nobody can see. */
    pause: sleep,
    get loaded() { return ready / total; },
    get frames() { return total; },

    destroy() {
      stopped = true;
      sleep();
      stopFar();
      stopNear();
      observer.disconnect();
      queue.length = 0;
      queued.clear();
      for (const slot of slots) { slot.img = null; slot.ready = false; }
    },
  };
}
