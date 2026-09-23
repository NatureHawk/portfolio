// 02 · BRUSH / 01 — the top-right corner.
//
// The second world, and the second one that is actually built. This file is
// only its IDENTITY: the corner it lives in, the three colours the whole page
// and the browser chrome take on while you are in it, and the recipe the portal
// uses to get here. The site itself is design/brush/ — see site.js.
//
// It replaces a `worldFrame` stand-in, and replacing one is exactly the two
// lines the architecture promised it would be: `mount` stops calling the shared
// frame and calls the world's own builder instead. Nothing in the shell, the
// nav, the portal or the registry knows it happened, and HUM's departure table
// still has its `'02'` row pointing at this corner.
//
// WHY THESE COLOURS. HUM is warm paper and highlighter — a room with the lights
// on. This is the opposite reading of the same screen: near-black, a single
// warm orange used at about two percent of the surface, and nothing in between.
// The contrast is the point of having four worlds at all; two sites that share
// a palette are one site with two layouts.

import { createBrush } from '../brush/site.js';

const spec = {
  id: '02',
  corner: 'tr',
  name: 'BRUSH',
  kicker: 'PRODUCT / 01',

  // The three the shell paints the document with — the tab's theme colour, the
  // corner controls' ink, and the ground behind everything.
  paper: '#000000',
  ink: '#eceae4',
  accent: '#ff6b21',
  title: 'BRUSH / 01 — Rethink your morning.',

  // The portal marker's glyph — the same small triangle `.bw-act` uses to
  // mark the live act, read here as a cue into a product film rather than
  // out of one.
  glyph: '▸',

  /* The portal recipe. The straight diagonal blade, because this world is
     about machined edges and a shattering entrance would be a promise the site
     behind it does not keep. `edge` runs 48ms ahead of `fill`, so the screen is
     crossed by a line of warm orange a breath before the black arrives. */
  portal: { variant: 'sweep', fill: '#000000', edge: '#ff6b21' },
};

spec.mount = (host, context) => createBrush(spec, host, context);

export default spec;
