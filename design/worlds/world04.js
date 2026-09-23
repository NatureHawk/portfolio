// 04 · SOMEWHERE — the bottom-right corner.
//
// The fourth world, and the fourth one that is actually built. This file is
// only its IDENTITY: the corner it lives in, the three colours the whole page
// and the browser chrome take on while you are in it, and the recipe the portal
// uses to get here. The site itself is design/somewhere/ — see site.js.
//
// It replaces a `worldFrame` stand-in, and replacing one is exactly the two
// lines the architecture promised it would be: `mount` stops calling the shared
// frame and calls the world's own builder instead. Nothing in the shell, the
// nav, the portal or the registry knows it happened.
//
// WHY THESE COLOURS. The other three worlds are all made of ink on a ground —
// HUM is warm paper, BRUSH is a black studio, NEW FORMS is a night street. This
// one is not a page at all, so its "paper" is a SKY: the deep desaturated teal
// of 4-Landing.png, which is the colour of the room a model is photographed in
// rather than the colour of a document. The ink is the warm cream the reference
// sets its type in, and the accent is the one green in the palette that is
// unmistakably grass — the only place in the four worlds where the accent is a
// colour taken from a physical material rather than chosen against a ground.
//
// WHY THE PORTAL IS DIFFERENT. The other three arrive as an edge crossing the
// screen — a blade, a shatter, a letterform. This one must not, because what is
// behind it is not a page: it is a world with depth, and an edge sliding over
// the top of it would announce a flat layer. So the `iris` variant opens from
// the corner instead, the way a lens does, and the sky is already behind it
// when it starts.

import { createSomewhere } from '../somewhere/site.js';

const spec = {
  id: '04',
  corner: 'br',
  name: 'SOMEWHERE',
  kicker: 'A WORLD WORTH EXPLORING',

  // The three the shell paints the document with — the tab's theme colour, the
  // corner controls' ink, and the ground behind everything.
  paper: '#0e2a38',
  ink: '#f3ead8',
  accent: '#8fb04a',
  title: 'SOMEWHERE — a world worth exploring.',

  // The portal marker's glyph — a lens, the same shape the iris portal opens
  // in and the landmark dots on the world's own compass share.
  glyph: '◎',

  /* The portal recipe. An iris rather than a wipe: this world has depth behind
     it and a blade crossing the screen would flatten it on arrival. `fill` is
     the landing sky, so the opening is already the right colour before the
     world is visible through it. */
  portal: { variant: 'iris', fill: '#0e2a38', edge: '#8fb04a' },
};

spec.mount = (host, context) => createSomewhere(spec, host, context);

export default spec;
