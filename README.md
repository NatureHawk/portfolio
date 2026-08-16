# The Late Night Desk

A real-time 3D portfolio room you look at over the shoulder of the person sitting in it. Hover a monitor and the camera drifts closer; click and you fall into that world.

Built with vanilla JavaScript and [Three.js](https://threejs.org/) — **no framework, no bundler, no build step.** Every texture in the scene is drawn procedurally to a `<canvas>` at load time, and every sound is synthesised with the Web Audio API. There are exactly two binary assets in the whole project, both `.glb` models.

> **Status:** the room is finished. `01 CODE` is built — a full editorial product page of its own. `02 DESIGN` and `03 EXPLORE` are still placeholders. See [Roadmap](#roadmap).

---

## Quickstart

No build step, and **no install step either** — a clean clone runs as-is. Any static file server works:

```bash
npx -y serve -l 5173 .    # or: npm start
python -m http.server 5173
```

It must be served over HTTP — opening `index.html` from the filesystem will fail, because ES modules and the import map are both subject to CORS. You need a browser with [import-map](https://caniuse.com/import-maps) support, which is all current evergreen browsers.

`npm install` is only needed to *update* Three.js (see [Updating Three.js](#updating-threejs)).

## Deploying

It's static files. Push to Vercel, Netlify, GitHub Pages, S3 — anything that serves a directory. `vercel.json` sets clean URLs, long-lived caching for `vendor/` and `assets/`, and revalidation for the source files; `.vercelignore` keeps `node_modules/` and source material out of the upload.

There is no build command. If a host asks, leave it empty and set the output directory to the repo root.

### The import map, and why `vendor/` is committed

`index.html` maps the bare specifier `"three"` so `GLTFLoader.js` resolves without a bundler — it does `import ... from 'three'` internally and nothing rewrites that for us:

```html
<script type="importmap">
  { "imports": {
      "three": "./vendor/three/three.module.min.js",
      "three/addons/": "./vendor/three/addons/"
  } }
</script>
```

It points at [`vendor/`](vendor/), **not** `node_modules/`. That distinction is the whole reason the site deploys: an import map names files the browser will actually fetch, and `node_modules/` is gitignored, so pointing there means a clean checkout renders a blank page and a static host has nothing to serve. Five files live in `vendor/` instead — the minified Three.js build, its core, and the three addon modules `GLTFLoader` pulls in. Nothing else in Three is reachable from `app.js`.

Don't repoint the map back at `node_modules/` without also dropping `GLTFLoader`, and don't point `app.js` at a relative build path — the map is what makes the loader's own import resolve.

### Updating Three.js

```bash
npm install three@latest
npm run vendor
```

`npm run vendor` re-copies the five files and then verifies that every relative import inside them resolves to something it copied. If a future `GLTFLoader.js` picks up a new dependency the script fails loudly, instead of the browser 404-ing at runtime.

---

## What's in the room

| | |
|---|---|
| **Three CRT monitors** | `01 CODE`, `02 DESIGN`, `03 EXPLORE`, in a V-formation. Genuinely curved tube glass (a subdivided plane displaced into a parabolic bulge), a baked corner vignette, an additive phosphor bloom, rolling scanlines, and a pulsing status LED. |
| **A seated developer** | ~30 primitives — oversized hoodie, studio headphones, a Japanese oak bentwood swivel chair. Dissolves into a flat translucent silhouette as the camera pushes past. |
| **A densely dressed desk** | Mechanical keyboard, mouse, coffee mug with live particle steam, and an articulated lamp whose bulb actually sits inside its shade. |
| **A "lived-in" clutter pass** | Sleeping cat with a yarn ball, rug, vinyl records, wall clock, takeout container, charging phone, trash bin, kicked-off slippers, headphone stand, pen holder. |
| **The window** | A physical cutout onto an infinite parallax starfield, with a string of fairy lights draped across the header. |
| **Sound** | Ambient drone, CRT hum, and UI SFX, all procedurally generated — zero audio files. |

---

## How it's put together

```
index.html      The room — structure, HUD overlays, the import map
styles.css      Design tokens, CRT/world-view transitions, reduced-motion support
app.js          Everything else in the room — the entire scene graph, in one file

code.html       01 CODE — a separate page with its own visual system
code.css        …and its own stylesheet. Shares nothing with the room, on purpose
code.js         Scroll choreography and card rendering
projects.js     All CODE content. Reorder the array, the showcase reorders

vendor/three/   The five Three.js files the browser loads. Committed — see below
scripts/        vendor-three.mjs, run by `npm run vendor`
vercel.json     Caching + clean URLs. No build command
assets/
  cat.glb              Sleeping cat, decimated 50k → 3k tris in headless Blender
  fairy_lights.glb     Cable + bulb string
  fairy_lights.blend   Source file, kept for re-export
  lofi-room.png        Reference mood image (not loaded at runtime)
  projects/            Drop project previews here — see the README inside
```

`app.js` is ~2,700 lines and reads top to bottom in build order: geometry helpers → procedural texture generators → CRT monitor builder → room and props → character → clutter → lighting → audio engine → interaction state machine → render loop.

One file is a deliberate choice, not neglect. There's no bundler, so every split would become another `<script>` or another network round-trip, and the scene is authored as one continuous pass of set dressing where almost everything is positioned relative to something else.

### Two design systems, kept apart

The room is cinematic, dark, 3D. `01 CODE` is soft, tactile, editorial — a neumorphic surface where every panel, switch and dial is extruded from one continuous sheet, with no borders anywhere. That contrast is the point, so CODE gets its own document, its own stylesheet, and its own typefaces rather than sharing tokens with the room. Clicking `01 CODE` pushes the camera into the monitor, floods the viewport with that screen's colour, and hands off to `code.html`; **Back** returns to the room via `history.back()` so the browser can restore the already-built 3D scene from the bfcache instead of booting Three.js cold. → [HANDOFF §15](HANDOFF.md#15-the-code-world-codehtml)

---

## The interesting problems

Full engineering detail — including what was tried and rejected — lives in **[HANDOFF.md](HANDOFF.md)**. The three worth knowing about up front:

### Fading a character made of 30 overlapping primitives

Tweening each part's `.opacity` turns the figure into an X-ray of its own components. Adding a Fresnel rim term fixes the interior but fails more subtly: *every* primitive contributes its own rim, so the body fills with the outlines of individual arm, shoulder, and skull ellipsoids.

Overlapping primitives only read as one shape if each pixel is blended **exactly once, in exactly one colour**. So: a depth pre-pass (colour writes off) establishes the nearest surface, the real materials draw with `depthWrite: false` so everything behind it fails the depth test, and a shader patch collapses every part's colour and alpha to one flat silhouette value. The only edge left anywhere is the outer boundary. → [HANDOFF §7](HANDOFF.md#7-character-silhouette-fade-why-its-neither-an-opacity-tween-nor-a-fresnel-rim)

### Hover picking that fed back into itself

Picking raycasts from the live camera, and committing a hover *moves* that camera — so selecting a monitor re-aims the very ray that selected it. A real mouse fires 100+ events/sec and a hand keeps trickling them out as it decelerates, so the tail of a gesture gets evaluated against a camera that has already swung, lands on the next monitor along, and commits again. Zoom into `EXPLORE`, flick left toward `DESIGN`, and the camera coasts straight past it into `CODE` with the mouse effectively still.

The fix: every raycast-driven hover change must prove it came from the user and not from the camera — the glide must have finished, *and* the cursor must have travelled since it finished. → [HANDOFF §11](HANDOFF.md#11-interaction-mechanics--edge-case-solutions)

### Coordinates lie; screenshots don't

Several props were first placed at coordinates that were perfectly reasonable and completely invisible — outside the frustum at that depth, behind the HUD headline, or inside the character's silhouette. The camera's visible frustum narrows sharply up close and the HUD covers a large part of the frame.

**Verify new scene content against an actual screenshot at the home framing.** This one bit repeatedly. → [HANDOFF §5](HANDOFF.md#5-scene-content-inventory-added-this-pass)

---

## Regenerating the GLB assets

Only needed if you want to change the models. Requires Blender 4.x, run headlessly — no GUI:

```bash
blender.exe --background <file.blend> --python <script.py>
```

`cat.glb` came out of a source pack at 50,000 triangles — absurd for a small background prop — and was decimated to 3,000 (94% reduction, 901 KB → 55 KB) via Blender's Decimate modifier. That source pack is gitignored: it's ~6.7 MB of OBJ/STL that nothing loads at runtime, and it's a third-party asset. See [HANDOFF §3](HANDOFF.md#3-asset-pipeline-glb-models-via-headless-blender) for the exact operations.

Both models are auto-fit and grounded at load by measuring their own bounding box rather than hardcoding a scale and offset, so they survive whatever arbitrary internal scale, pivot, or orientation the source file happens to have.

---

## Roadmap

**Phase 1 — World content.** `01 CODE` is built; what's left is the case study behind each project's `EXPLORE →` (the cards render those as inert controls tagged `SOON` until the routes exist). `02 DESIGN`: gallery, case studies, design system docs. `03 EXPLORE`: creative-coding demos, generative art, essays.

**Phase 2 — Mobile and touch.** There is currently *no* touch input handling. Tapping a monitor works via the raycast click handler, but hover-to-preview has no touch equivalent, so the entire preview interaction is desktop-only.

**Phase 3 — Performance.** The scene runs ~11 dynamic lights ([HANDOFF §9](HANDOFF.md#9-lighting-inventory)), which is high for hand-authored WebGL with this much geometry. Budget for pruning before adding much more.

---

## Credits and licensing

Code is ISC (see `package.json`). The 3D models under `assets/` are third-party and carry their own terms — check them before reusing or redeploying this repo. The scene, textures, audio synthesis, and shader work are original.
