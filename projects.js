// Single source of truth for the CODE sheet.
//
// Reordering `projects` reorders everything downstream — the manifest, the rail
// ticks, the detent ladder, the carriage readout and the scroll range are all
// derived from it. Same for `preview`: drop a real file at that path and it
// replaces the schematic with no layout change (see mountPreviews in code.js).
//
// Field notes:
//   figure     which schematic is drawn in the card's display well
//   domains    which spec-sheet domains the project draws on (both directions
//              of the spec table are generated from this one mapping)
//   pending    the case-study route does not exist yet, so EXPLORE renders as
//              an inert control rather than a dead link

export const projects = [
  {
    slug: 'ambassu',
    code: 'AMB-TDS',
    name: 'Ambassu',
    kind: 'Technical Datasheet System',
    accent: '#FF4A1C',
    status: 'SHIPPED',
    year: '2025',
    // Two sentences, maximum. The card is a teaser, not the case study.
    blurb:
      'Turns a customer’s motor specification into a finished technical datasheet — intake, catalog matching, engineering review, document generation.',
    // Facts that survive being read in half a second, from the repo docs.
    specs: [
      ['CATALOG', '2,800+ models'],
      ['MATCHING', 'Weighted scoring'],
      ['OUTPUT', 'Datasheet + drawing PDF'],
      ['ROLE', 'Design + full stack'],
    ],
    stack: ['NEXT.JS 16', 'REACT 19', 'TYPESCRIPT', 'PRISMA', 'SQLITE', 'PDF-LIB'],
    domains: ['WEB', 'DATA'],
    figure: 'datasheet',
    preview: 'assets/projects/ambassu-preview.webp',
    href: 'projects/ambassu.html',
    pending: true,
    featured: true,
  },
  {
    slug: 'lockedin',
    code: 'LKD-01',
    name: 'LockedIn',
    kind: 'Offline Fitness Tracker',
    accent: '#2C4BFF',
    status: 'SHIPPED',
    year: '2025',
    blurb:
      'Built to track my own body transformation. One log a day, stored on-device, no account and no network — the streak is the whole product.',
    specs: [
      ['LOGGING', 'One entry per day'],
      ['TRACKS', 'Weight · fat · muscle'],
      ['STORAGE', 'On-device SQLite'],
      ['NETWORK', 'None required'],
    ],
    stack: ['REACT NATIVE', 'EXPO', 'EXPO ROUTER', 'SQLITE'],
    domains: ['MOBILE', 'DATA'],
    figure: 'streak',
    preview: 'assets/projects/lockedin-preview.webp',
    href: 'projects/lockedin.html',
    pending: true,
  },
  {
    slug: 'swipesort',
    code: 'SWP-01',
    name: 'SwipeSort',
    kind: 'Photo Triage Utility',
    accent: '#FFC400',
    status: 'SHIPPED',
    year: '2025',
    blurb:
      'My phone was full. Swipe left to delete, right to keep, up to favourite — one gesture per photo until the storage bar moves.',
    specs: [
      ['GESTURE', 'Keep · delete · favourite'],
      ['SCOPE', 'One job, done fast'],
      ['TARGET', 'iOS · Android'],
      ['INPUT', 'Single-thumb'],
    ],
    stack: ['REACT NATIVE', 'EXPO'],
    domains: ['MOBILE'],
    figure: 'triage',
    preview: 'assets/projects/swipesort-preview.webp',
    href: 'projects/swipesort.html',
    pending: true,
  },
  {
    slug: 'hawkos',
    code: 'HWK-OS',
    name: 'HawkOS',
    kind: 'Operating System',
    accent: '#00BFA0',
    status: 'IN DEVELOPMENT',
    year: '2026',
    // Deliberately says what it IS, not what it will do. Nothing to overstate yet.
    blurb:
      'An operating system, written from the ground up. Early — there is nothing to demo yet, and this card will change a lot.',
    specs: [
      ['STAGE', 'Under construction'],
      ['SCOPE', 'Kernel up'],
      ['DEMO', 'Not yet'],
      ['ETA', 'Unannounced'],
    ],
    stack: ['SYSTEMS', 'LOW-LEVEL'],
    domains: ['SYSTEMS'],
    figure: 'kernel',
    preview: 'assets/projects/hawkos-preview.webp',
    href: 'projects/hawkos.html',
    pending: true,
    // Drives the hazard striping and the unbuilt treatment on the card.
    underConstruction: true,
  },
  {
    slug: 'retailhub',
    code: 'RTL-01',
    name: 'RetailHub',
    kind: 'Retail Software',
    accent: '#E24E9C',
    status: 'SHIPPED',
    year: '2024',
    blurb:
      'Conventional retail management software. Here for breadth — proof the boring, necessary parts get built properly too.',
    specs: [
      ['DOMAIN', 'Retail operations'],
      ['ROLE', 'Full stack'],
      ['SHAPE', 'Conventional, on purpose'],
      ['YEAR', '2024'],
    ],
    stack: ['WEB', 'DATABASE'],
    domains: ['WEB', 'DATA'],
    figure: 'ledger',
    preview: 'assets/projects/retailhub-preview.webp',
    href: 'projects/retailhub.html',
    pending: true,
  },
];

// What I work with. Grounded in the projects above and in this site — nothing
// aspirational, nothing claimed that isn't shipped somewhere in the list.
//
// `note` is the one-line description. `items` is the tool list, laid out as a
// column grid rather than a row of pills. Which projects use a domain is NOT
// stored here — it is derived from projects[].domains, so the two can't drift.
export const disciplines = [
  {
    name: 'WEB',
    note: 'Application front ends and the servers behind them.',
    items: ['Next.js', 'React', 'TypeScript', 'Tailwind CSS', 'NextAuth'],
  },
  {
    name: 'MOBILE',
    note: 'Offline-first apps that survive with no network.',
    items: ['React Native', 'Expo', 'Expo Router'],
  },
  {
    name: 'DATA',
    note: 'Schemas, documents, and the pipelines between them.',
    items: ['SQLite', 'Prisma', 'pdf-lib', '@react-pdf/renderer'],
  },
  {
    name: 'GRAPHICS',
    note: 'Real-time 3D on the web — including the room you just left.',
    items: ['Three.js', 'WebGL', 'GLSL', 'Blender'],
    // Not a listed project, but it is the thing this domain shipped.
    alsoUsedIn: 'THIS SITE',
  },
  {
    name: 'SYSTEMS',
    note: 'The layer under everything else. Currently HawkOS.',
    items: ['C', 'Kernel internals', 'Toolchains'],
  },
];

// Each principle carries the thing that proves it. `evidence` is a real code
// from the project list (or this page), not a slogan — the point is that every
// rule can be checked against something that exists.
export const principles = [
  {
    statement: 'BUILD FOR A REAL PROBLEM',
    note: 'Every project here started as something that annoyed me first.',
    evidence: 'SWP-01',
    evidenceNote: 'Storage full',
  },
  {
    statement: 'MAKE THE COMPLEX FEEL SIMPLE',
    note: 'Matching 2,800 motors should feel like asking a question.',
    evidence: 'AMB-TDS',
    evidenceNote: '2,800 models',
  },
  {
    statement: 'CARE ABOUT HOW IT WORKS',
    note: 'Correct under load, honest when it fails, fast on the machines people own.',
    evidence: 'RTL-01',
    evidenceNote: 'Unglamorous',
  },
  {
    statement: 'CARE ABOUT HOW IT FEELS',
    note: 'The weight of a transition is a feature. So is the sound of a click.',
    evidence: 'SHEET 01',
    evidenceNote: 'This page',
  },
];

// The hero's category legend. Four things this sheet is an index of — kept as
// indicators rather than pills, each with a count taken from the work above.
export const categories = [
  { name: 'SYSTEMS', note: 'Kernel, toolchain, the layer underneath' },
  { name: 'PRODUCTS', note: 'Whole things people can actually use' },
  { name: 'SOFTWARE', note: 'Web and mobile applications' },
  { name: 'EXPERIMENTS', note: 'Built to find out what happens' },
];

// The plate on the back of the device. Facts about the page itself — the sort
// of thing a physical product prints where nobody looks until they need it.
export const buildPlate = [
  ['TYPEFACE', 'Archivo · IBM Plex Mono'],
  ['RUNTIME', 'Vanilla JS · no framework'],
  ['SURFACE', '#ECF0F3'],
  ['SHEET', '01 of 03'],
  ['REV', 'B'],
];
