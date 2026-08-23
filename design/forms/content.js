// NEW FORMS — everything the issue says.
//
// Kept deliberately thin. This is a house that shows rather than explains, and
// the brief for it was "prioritise visual storytelling" — so there is no body
// copy anywhere in this world, only marks: a plate number, a material, a
// discipline. If a label here grew into a sentence it would be the wrong label.
//
// Every path is checked against assets/website3/ by name. Nothing is generated
// and nothing is substituted.
//
// WEBP, and the .jpeg masters are still on disk beside these. The nine plates
// were 5.1 MB as JPEG and are 2.9 MB as WebP at the same perceptual quality —
// worth having on a world that is nothing but full-bleed photography, and the
// one image optimisation available here that costs no visible quality.
// `npm run images` regenerates them; see scripts/encode-images.mjs.

export const ISSUE = {
  house: 'NEW FORMS',
  no: '03',
  sub: 'FORM / BODY / SPACE',
  stamp: ['ISSUE 03', 'FORM STUDY'],
  edge: 'ARCHITECTURE / FASHION',
};

const SRC = 'assets/website3/';

export const PLATES = {
  hero: {
    src: `${SRC}3-Hero.webp`,
    alt: 'A model in a sculptural black coat with a red cord tie, standing on a concrete ledge inside a brutalist underpass at night.',
  },
  building: {
    src: `${SRC}3-building.webp`,
    alt: 'A vast brutalist courtyard of interlocking raw concrete volumes seen from below, with a single figure on a high walkway.',
  },
  // Used twice, at two crops. In 01 it is the dark side of the hall in a narrow
  // strip; in 05 it is the same hall wide and lit, with the figure in it. The
  // issue closes on the photograph it opened its world with.
  hall: {
    src: `${SRC}3-Final.webp`,
    alt: 'A monumental ivory and concrete hall, a large black carbon-fibre sculpture at the left, and one small figure standing alone in the light.',
  },
  object: {
    src: `${SRC}3-Object.webp`,
    alt: 'A black and machined-steel mechanism resting on a concrete plinth in an empty room, lit by a single shaft of daylight.',
  },
  fashion: {
    src: `${SRC}3-main_fashion.webp`,
    alt: 'A model crouched on a concrete plinth in a wide ivory room, wearing an angular black coat with a red buckle at the shoulder.',
  },
  close: {
    src: `${SRC}3-CloseUP.webp`,
    alt: 'A close crop of the black garment: quilted panels, an oval steel eyelet, and a red cord tied in a bow at the cuff.',
  },
  motion: {
    src: `${SRC}3-Motion.webp`,
    alt: 'The same model mid-movement, long black ribbons of fabric whipping outward through the air of the ivory room.',
  },
  musician: {
    src: `${SRC}3-Musician.webp`,
    alt: 'A performer backstage in a black technical harness and high collar, turning to face the camera, a single red stage light behind him.',
  },
  night: {
    src: `${SRC}3-NightLife.webp`,
    alt: 'A crowded warehouse floor in haze and red light, dancers in black with long fabric panels sweeping outward.',
  },
};

// The five acts, in the order the issue reads. `short` is what the rail sets —
// abbreviated for the same reason a running head is: "AFTER DARK" set there
// cost 60px of every headline on the page and ran under one of them.
export const ACTS = [
  { id: 'space', no: '01', name: 'THE SPACE', short: 'SPACE', meta: 'PLATES I—II' },
  { id: 'object', no: '02', name: 'THE OBJECT', short: 'OBJECT', meta: 'PLATES III—IV' },
  { id: 'body', no: '03', name: 'THE BODY', short: 'BODY', meta: 'PLATES V—VI' },
  { id: 'dark', no: '04', name: 'AFTER DARK', short: 'DARK', meta: 'PLATES VII—VIII' },
  { id: 'return', no: '05', name: 'THE RETURN', short: 'RETURN', meta: 'PLATE IX' },
];

export const MARKS = {
  space: { cross: ['THE SPACE', 'BEFORE THE BODY.'], say: ['CAST IN PLACE.'], cap: ['PLATE I', 'CONCRETE, POURED'] },
  vault: { cap: ['PLATE II', 'THE HALL, EAST'] },
  // TWO PLATES, NOT ONE IMAGE BECOMING ANOTHER. The mechanism is stated whole
  // (III), then the same house's construction is read at the seam (IV). The
  // materials line sits under the object rather than beside it: a caption is
  // what tells you a photograph is a plate.
  object: {
    specs: ['OBJECT 01', 'MATERIAL STUDY', 'FORM / MASS / MECHANISM'],
    cap: ['PLATE III', 'ALUMINIUM / STEEL / ANODISED RED'],
    detail: ['PLATE IV', 'DETAIL / MATERIAL / CONSTRUCTION'],
  },
  body: {
    // Broken across the line on desktop and set whole on a phone — see the note
    // on .fb-title. The clean sentence is carried by the .fsr line.
    title: ['THE BODY', 'BECOMES', 'ARCHI-', 'TECTURE.'],
    read: 'The body becomes architecture.',
    cap: ['PLATE V', 'WOOL, LEATHER, HARDWARE'],
    label: ['BODY STUDY', 'FORM / MOVEMENT / STRUCTURE'],
    word: 'MOTION',
  },
  dark: {
    type: ['LIVE', 'NOISE', 'BODY'],
    cap: ['PLATE VII', 'MOVEMENT STUDY'],
    night: ['PLATE VIII', '03:40'],
  },
  coda: 'FORM REMAINS.',
};

export const COLOPHON = [
  ['ISSUE', '03'],
  ['PLATES', '09'],
  ['SUBJECT', 'FORM / BODY / SPACE'],
  ['SET', 'ARCHIVO · DM MONO'],
];
