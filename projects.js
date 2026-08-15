// Single source of truth for the CODE showcase.
//
// Reordering this array reorders the showcase — the index badge, the rail ticks,
// the carriage readout and the scroll range are all derived from it, so nothing
// else needs touching. Same for `preview`: drop a real file at that path and it
// replaces the pending plate with no layout change (see buildCard in code.js).
//
// `pending: true` means the case-study route does not exist yet, so the card
// renders EXPLORE as an inert control with a SOON tag instead of a dead link.
// When /projects/<slug> ships, flip it to false and the button becomes live.

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
    ],
    stack: ['NEXT.JS 16', 'REACT 19', 'TYPESCRIPT', 'PRISMA', 'SQLITE', 'PDF-LIB'],
    preview: 'assets/projects/ambassu-preview.webp',
    href: 'projects/ambassu.html',
    pending: true,
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
    ],
    stack: ['REACT NATIVE', 'EXPO', 'EXPO ROUTER', 'SQLITE'],
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
    ],
    stack: ['REACT NATIVE', 'EXPO'],
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
    ],
    stack: ['SYSTEMS', 'LOW-LEVEL'],
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
    ],
    stack: ['WEB', 'DATABASE'],
    preview: 'assets/projects/retailhub-preview.webp',
    href: 'projects/retailhub.html',
    pending: true,
  },
];

// What I work with. Grounded in the projects above and in this site — nothing
// aspirational, nothing claimed that isn't shipped somewhere in the list.
export const disciplines = [
  {
    name: 'WEB',
    note: 'Application front ends and the servers behind them',
    items: ['Next.js', 'React', 'TypeScript', 'Tailwind CSS', 'NextAuth'],
  },
  {
    name: 'MOBILE',
    note: 'Offline-first apps that survive with no network',
    items: ['React Native', 'Expo', 'Expo Router'],
  },
  {
    name: 'DATA',
    note: 'Schemas, documents, and the pipelines between them',
    items: ['SQLite', 'Prisma', 'pdf-lib', '@react-pdf/renderer'],
  },
  {
    name: 'GRAPHICS',
    note: 'Real-time 3D on the web — including the room you just left',
    items: ['Three.js', 'WebGL', 'GLSL', 'Blender'],
  },
  {
    name: 'SYSTEMS',
    note: 'The layer under everything else. Currently HawkOS',
    items: ['C', 'Kernel internals', 'Toolchains'],
  },
];

export const principles = [
  {
    statement: 'BUILD FOR A REAL PROBLEM',
    note: 'Every project here started as something that annoyed me first.',
  },
  {
    statement: 'MAKE THE COMPLEX FEEL SIMPLE',
    note: 'Matching 2,800 motors should feel like asking a question.',
  },
  {
    statement: 'CARE ABOUT HOW IT WORKS',
    note: 'Correct under load, honest when it fails, fast on the machines people own.',
  },
  {
    statement: 'CARE ABOUT HOW IT FEELS',
    note: 'The weight of a transition is a feature. So is the sound of a click.',
  },
];
