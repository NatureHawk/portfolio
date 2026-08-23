// BRUSH / 01 — the copy, and the only place it lives.
//
// Everything the site says is here: the nine acts, their plates, their images
// and their numbers. site.js turns this into DOM and never invents a word of
// its own, so the whole product story can be rewritten without opening a file
// that contains a single line of choreography.
//
// TONE. The joke is that there is no joke. Nothing on this page winks — the
// copy is written exactly as a company that had genuinely spent four years on a
// toothbrush would write it, because the object being a toothbrush is already
// the entire gag and saying so out loud would spend it. Specifications are
// specific, plausible and consistent with each other; adjectives are rationed.

export const PRODUCT = {
  code: 'BRUSH / 01',
  name: 'BRUSH 01',
  price: '$249',
  edition: 'ATELIER OBJECT No. 001',
};

/* The image set. Named once so a rename is one edit, and so the preloader in
   site.js can walk the list without knowing what any of them are for.
   NOTE the `+` in the battery filename — it is the character on disk, and in a
   URL an unescaped `+` is a space. Encoded here, once, rather than in nine
   places that each have to remember.

   WEBP, NOT PNG, AND IT IS NOT A SMALL DIFFERENCE. These ten shipped as PNG
   and weighed 11.6 MB between them — PNG is lossless and it is the wrong
   format for a photograph, doubly so for these, which are lit objects on a
   black ground and therefore mostly large fields of near-black that PNG has no
   way to be clever about. Re-encoded they are 0.4 MB, with the same pixel
   dimensions and a mean luminance that moves by about a tenth of a level.
   The .png masters are still in assets/ and are what regenerates these —
   see scripts/encode-images.mjs and `npm run images`. */
export const IMAGES = {
  hero: 'assets/hero.webp',
  master: 'assets/mastertoothbrush.webp',
  exploded: 'assets/exploded.webp',
  internals: 'assets/transparentshellinternals.webp',
  rear: 'assets/rear.webp',
  pressure: 'assets/pressuresense.webp',
  macro: 'assets/brush_macro.webp',
  battery: 'assets/battery%2Belectronics.webp',
  dock: 'assets/chargingdock.webp',
  final: 'assets/finalhero.webp',
};

export const SEQUENCE = {
  dir: 'assets/toothbrush_explosion_frames',
  count: 60,
  // The still that stands in for the whole sequence when motion is declined.
  still: 'assets/exploded.webp',
};

/* ══ THE HUD ═══════════════════════════════════════════════════════════════
   The top rail reads the act you are in. Order matters — it is the order the
   sections are built in, and the readout is driven by whichever one is
   crossing the middle of the screen. */
export const ACTS = [
  { id: 'b-hero', no: '00', label: 'BRUSH / 01' },
  { id: 'b-object', no: '01', label: 'THE OBJECT' },
  { id: 'b-explode', no: '02', label: 'ENGINEERING' },
  { id: 'b-internals', no: '03', label: 'INTERNALS' },
  { id: 'b-pressure', no: '04', label: 'PRESSURE' },
  { id: 'b-head', no: '05', label: 'THE HEAD' },
  { id: 'b-power', no: '06', label: 'PERFORMANCE' },
  { id: 'b-dock', no: '07', label: 'THE DOCK' },
  { id: 'b-close', no: '08', label: 'AVAILABLE NOW' },
];

/* ══ 00 · HERO ═════════════════════════════════════════════════════════════ */
export const HERO = {
  kicker: PRODUCT.code,
  edition: PRODUCT.edition,
  // Written as lines because where a display line breaks is a design decision
  // and not something to leave to the width of a box.
  title: ['RETHINK', 'YOUR', 'MORNING.'],
  lede: 'Two minutes, twice a day, one thousand four hundred and sixty times a year. The most-used object you own has never once been designed like one.',
  facts: [
    ['DRIVE', 'SONIC 31,000'],
    ['SEALED', 'IPX7'],
    ['RANGE', '21 DAYS'],
  ],
  scroll: 'SCROLL',
};

/* ══ 01 · THE OBJECT ═══════════════════════════════════════════════════════
   The markers are the one interaction on this page that is not scroll. Three,
   because four would be a diagram and two would be decoration. Positions are
   percentages of the image box. */
export const OBJECT = {
  no: '01',
  label: 'THE OBJECT',
  title: ['A TOOTHBRUSH', 'TAKEN', 'SERIOUSLY.'],
  body: 'A machined aluminium spine carries a brushless drive on four silicone isolators, so the handle stays still while the head does not. The shell over it is smoked polycarbonate, 1.2mm, held to a 0.05mm gap along its whole length.',
  hint: 'TOUCH A MARKER',
  spots: [
    { x: 53, y: 44, no: '01', title: 'DRIVE COLLAR', text: 'Anodised 6061. The only part of this you are meant to hold.' },
    { x: 47, y: 64, no: '02', title: 'SMOKED SHELL', text: '18% transmission. Everything inside is visible, so nothing inside is hidden.' },
    { x: 52, y: 82, no: '03', title: 'CONTACT BASE', text: 'Inductive, keyed, and flat enough to stand up on its own.' },
  ],
};

/* ══ 02 · EXPLODED ═════════════════════════════════════════════════════════
   The labels are placed on the DISASSEMBLY, not on the page: each one owns a
   band of scroll progress and is on screen only while the part it names is
   travelling. `at` and `out` are progress values from 0 to 1. */
export const EXPLODE = {
  no: '02',
  label: 'ENGINEERING',
  title: ['THE BRUSH,', 'REENGINEERED.'],
  hint: 'SCROLL TO DISASSEMBLE',
  // What the same line says when there is nothing to scroll: with motion
  // declined the act is a single still of the finished state, and an
  // instruction to scroll — or a readout claiming nought percent — would be
  // the page describing a thing it deliberately did not build.
  stillHint: 'SHOWN FULLY DISASSEMBLED',
  readout: 'DISASSEMBLY',
  parts: '41 PARTS',
  labels: [
    { no: '01', name: 'PRECISION MOTOR', spec: 'BRUSHLESS / 31,000 MPM', at: 0.12, out: 0.44, side: 'left' },
    { no: '02', name: 'PRESSURE SENSOR', spec: '4 × STRAIN GAUGE', at: 0.32, out: 0.64, side: 'right' },
    { no: '03', name: 'POWER CORE', spec: 'Li-ion / 1400mAh', at: 0.52, out: 0.86, side: 'left' },
    { no: '04', name: 'CONTROL SYSTEM', spec: 'ARM M0 / 200Hz', at: 0.70, out: 1.01, side: 'right' },
  ],
};

/* ══ 03 · INTERNALS ════════════════════════════════════════════════════════ */
export const INTERNALS = {
  no: '03',
  label: 'INTERNALS',
  title: ['YOU CAN', 'SEE', 'EVERYTHING.'],
  body: 'Nothing inside is finished to a lower standard than the outside, because you can see all of it. Every board is black, every joint is inspected three times, and the ribbon running the length of the spine is routed to be looked at.',
  notes: [
    ['SHELL', 'PC / 1.2mm / 18%'],
    ['BOARD', '4-LAYER / MATTE BLACK'],
    ['JOINTS', 'INSPECTED × 3'],
  ],
  rearCaption: 'REAR · THE SEAM THAT IS NOT THERE',
};

/* ══ 04 · PRESSURE ═════════════════════════════════════════════════════════ */
export const PRESSURE = {
  no: '04',
  label: 'PRESSURE',
  title: ['KNOW WHEN', 'TO PUSH.'],
  body: 'Four strain gauges under the neck read the load two hundred times a second. Past 2.4 newtons the drive eases itself off and the collar warms to amber. You feel the correction before you are told about it.',
  meter: {
    unit: 'N',
    limit: 2.4,
    max: 4,
    threshold: 'LIMIT 2.4N',
    over: 'EASING OFF',
    under: 'IN RANGE',
    caption: 'LOAD AT THE NECK, LIVE',
  },
};

/* ══ 05 · THE HEAD ═════════════════════════════════════════════════════════ */
export const HEAD = {
  no: '05',
  label: 'THE HEAD',
  title: ['PRECISION,', 'DOWN TO', 'THE BRISTLE.'],
  body: '4,096 filaments, tapered to one hundredth of a millimetre and end-rounded in three passes. The outer rows sit two degrees proud of the inner ones, and that is the whole of the reason it reaches the gumline.',
  facts: [
    ['FILAMENTS', '4,096'],
    ['TAPER', '0.01mm'],
    ['ROUNDING', '3 PASSES'],
  ],
};

/* ══ 06 · PERFORMANCE ══════════════════════════════════════════════════════
   Three numbers, set at the size of the headline rather than in cards. `value`
   is what the counter counts to; `text` is what is finally written, so 31,000
   keeps its comma and nothing has to parse a formatted string back out. */
export const POWER = {
  no: '06',
  label: 'PERFORMANCE',
  title: ['21 DAYS.', 'ONE CHARGE.'],
  body: 'A 1400mAh cell, a drive that costs 0.9 watts to hold at speed, and a controller that spends most of its life asleep. Three weeks is not a headline figure measured once in a laboratory. It is the number we could not get below.',
  stats: [
    { value: 31000, text: '31,000', unit: 'MOVEMENTS / MIN', note: 'SUSTAINED, NOT PEAK' },
    { value: 4, text: '4', unit: 'PRESSURE SENSORS', note: 'ONE PER QUADRANT' },
    { value: 21, text: '21', unit: 'DAYS OF BATTERY', note: 'TWO MINUTES, TWICE DAILY' },
  ],
  table: [
    ['CELL', 'Li-ion 1400mAh'],
    ['DRAW', '0.9W AT SPEED'],
    ['CHARGE', '3H 10M TO FULL'],
    ['NOISE', '52 dB AT 1M'],
    ['MASS', '141g'],
  ],
};

/* ══ 07 · THE DOCK ═════════════════════════════════════════════════════════ */
export const DOCK = {
  no: '07',
  label: 'THE DOCK',
  title: ['IT DOES NOT', 'LOOK LIKE', 'A CHARGER.'],
  body: 'Solid brass, 340 grams, cold to the touch in the morning. It charges through six millimetres of stone and it has no light on it anywhere, because a thing sitting on your basin at three in the morning should not be a thing that glows.',
  facts: [
    ['MATERIAL', 'SOLID BRASS'],
    ['MASS', '340g'],
    ['INDICATORS', 'NONE'],
  ],
};

/* ══ 08 · CLOSE ════════════════════════════════════════════════════════════ */
export const CLOSE = {
  no: '08',
  label: 'AVAILABLE NOW',
  title: ['BRUSH', 'BETTER.'],
  code: PRODUCT.code,
  price: PRODUCT.price,
  cta: 'GET YOURS',
  ship: 'SHIPS IN 3 WEEKS / GRAPHITE / SMOKE',
  /* The one line that steps outside the fiction, and it is deliberately the
     last thing on the page rather than the first. Saying it at the top would
     mean the site never gets to be the thing it is pretending to be. */
  colophon: 'BRUSH / 01 is a fictional product, built as a real website.',
  back: 'HUM SITS IN THE TOP LEFT',
};
