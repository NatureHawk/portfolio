# vendor/

Runtime dependencies, committed on purpose.

The site has no bundler. The browser resolves `import ... from 'three'` through
the import map in [`index.html`](../index.html), which means whatever that map
points at has to exist **as a served file**. Pointing it at `node_modules/` is
what most no-build setups do, and it breaks the moment the site is deployed:
`node_modules/` is gitignored, so a clean checkout renders a blank page and a
static host has nothing to serve.

So the five files the browser actually loads live here instead. A clean
`git clone` runs the site with no install step, and any static host — Vercel,
GitHub Pages, S3 — serves it as-is.

## What's here, and why each file

```
three.module.min.js              the "three" bare specifier resolves here
└── three.core.min.js            …which imports this. Both required.
addons/loaders/GLTFLoader.js     loads assets/cat.glb and fairy_lights.glb
├── addons/utils/BufferGeometryUtils.js   GLTFLoader imports this
└── addons/utils/SkeletonUtils.js         …and this
```

Nothing else from three is reachable from `app.js`, so nothing else is copied.
The two `build/` files are the **minified** ones (750 KB, ~190 KB over the wire
after compression); the addons ship unminified from three and are left that way.

## Updating

```bash
npm install three@latest   # or a pinned version
npm run vendor             # re-copies the five files above
```

`three` stays in `devDependencies` for exactly this. If a future version of
`GLTFLoader.js` picks up a new relative import, the copy will 404 in the
browser — check its `import` statements against the list above when bumping.

Do not edit these files. They are copies, and `npm run vendor` overwrites them.
