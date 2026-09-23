// 03 · NEW FORMS — the bottom-left corner.
//
// The third world, and the third one that is actually built. This file is only
// its IDENTITY: the corner it lives in, the three colours the whole page and the
// browser chrome take on while you are in it, and the recipe the portal uses to
// get here. The site itself is design/forms/ — see site.js.
//
// It replaces a `worldFrame` stand-in, and replacing one is exactly the two
// lines the architecture promised it would be: `mount` stops calling the shared
// frame and calls the world's own builder instead. Nothing in the shell, the
// nav, the portal or the registry knows it happened.
//
// WHY THESE COLOURS. HUM is warm paper and highlighter — a room with the lights
// on. BRUSH is near-black and one warm orange. This is near-black again, and
// that is deliberate rather than a repeat: BRUSH's black is a product studio,
// lit from nowhere, and this one is a night street. The difference is the red,
// which is a colder and more violent thing than BRUSH's orange, and the fact
// that this world's black is interrupted — one act of it is set on bone, which
// is the only place in the four worlds that colour appears at all.
//
// NOTE ON WHERE THIS LIVES. This is the design section's THIRD WEBSITE. It is
// not the room's third monitor: EXPLORE is a separate part of the portfolio and
// nothing here is routed through it.

import { createForms } from '../forms/site.js';

const spec = {
  id: '03',
  corner: 'bl',
  name: 'NEW FORMS',
  kicker: 'ISSUE 03',

  // The three the shell paints the document with — the tab's theme colour, the
  // corner controls' ink, and the ground behind everything.
  paper: '#08080a',
  ink: '#ece7dd',
  accent: '#df3d1d',
  title: 'NEW FORMS — Issue 03.',

  // The portal marker's glyph — the same small red square `.fw-mark` sets
  // beside the issue number, the one folio mark this world already owns.
  glyph: '■',

  /* The portal recipe. The letterform variant, because this world's whole
     argument is made in type: a single enormous word grows out of the corner
     and the ground arrives inside it, so the wipe reads as the masthead
     becoming the door. One word rather than two — "FORMS" is the half of the
     name that is a shape. */
  portal: { variant: 'type', fill: '#08080a', edge: '#df3d1d', word: 'FORMS' },
};

spec.mount = (host, context) => createForms(spec, host, context);

export default spec;
