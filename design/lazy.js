// LAZY IMAGES — the one place /design decides when a photograph is fetched.
//
// WHAT UNLAZY ACTUALLY DOES, because it is easy to assume it does more. It runs
// NO IntersectionObserver and takes no root margin: it holds the real URL in
// `data-src`, puts a 1×1 transparent SVG in `src` so the element is a valid
// image with no request behind it, and swaps the real URL in. The browser's own
// `loading="lazy"` is still what decides when the bytes are pulled. So this is
// not a replacement for native lazy loading — it is a controlled handover to
// it, and the value is in what that handover makes possible:
//
//   1. AN IMAGE WITH NO `src` COSTS NOTHING UNTIL THIS RUNS. Every world here
//      is built the moment a hand moves toward its corner, which is well
//      before anybody has decided to go there. With a real `src` in the markup
//      the browser may begin those requests as the element is parsed; with
//      `data-src` it cannot, and a visitor who reads HUM and leaves pays for
//      none of the other three worlds' photography.
//   2. A KNOWN MOMENT OF ARRIVAL. `onImageLoad` is the only reliable hook for
//      "this picture is now decoded", which is what lets a plate fade up
//      instead of snapping in halfway through a scroll.
//
// WHAT IS DELIBERATELY NOT USED. unlazy's blurhash/thumbhash builds decode a
// placeholder hash into a blurred preview. Nothing here ships a hash, and
// generating them would mean a build step this project does not have — so the
// smaller plain build is vendored instead (see scripts/vendor-unlazy.mjs).
//
// THE ONE THING TO KNOW BEFORE ADDING A PLATE. `data-src` means no image at all
// without JavaScript. That is an acceptable trade in these worlds — they are
// built entirely by JavaScript, so without it there is no page to put an image
// in — and it would NOT be acceptable in a document that renders server-side.

import { lazyLoad } from '../vendor/unlazy/unlazy.js';

/* Marks an <img> as lazy in the markup. Returns the attribute string rather
   than an element because both worlds build their DOM as HTML strings.

   `eager` is the escape hatch, and it is not a nicety: the first plate of a
   world is the one thing that must never fade in, because it is what the
   visitor is looking at the moment the portal opens. */
export function lazyAttrs(src, { eager = false } = {}) {
  return eager
    ? `src="${src}" fetchpriority="high" decoding="async"`
    : `data-src="${src}" loading="lazy" decoding="async"`;
}

/* Starts unlazy inside one world. Called once, when the world is first built.
   Returns a teardown, because everything else in these worlds does. */
export function initLazy(root) {
  if (!root) return () => {};
  const images = [...root.querySelectorAll('img[data-src]')];
  if (!images.length) return () => {};

  for (const img of images) img.classList.add('is-lazy');

  const settle = (event) => {
    const img = event.target;
    if (img instanceof HTMLImageElement) img.classList.add('is-loaded');
  };
  // `load` does not bubble, so this is a capturing listener on the root rather
  // than one listener per image — same coverage, one registration.
  root.addEventListener('load', settle, true);

  const stop = lazyLoad(images, {
    onImageLoad: (img) => img.classList.add('is-loaded'),
    onImageError: (img) => {
      // A plate that cannot be fetched must not stay at opacity 0 forever —
      // better a visibly missing image than a silent hole in the layout.
      img.classList.add('is-loaded');
    },
  });

  return () => {
    root.removeEventListener('load', settle, true);
    stop?.();
  };
}
