# The Late Night Desk

A real-time 3D portfolio room you look at over the shoulder of the person sitting in it. Hover a monitor and the camera drifts closer; click and you fall into that world.

Built with vanilla JavaScript and [Three.js](https://threejs.org/) — **no framework, no bundler, no build step.** Every texture in the scene is drawn procedurally to a `<canvas>` at load time, and every sound is synthesised with the Web Audio API. There are exactly two binary assets in the whole project, both `.glb` models.

> **Status:** the room is finished. `01 CODE` is built — a full editorial product page of its own. `02 DESIGN` and `03 EXPLORE` are still placeholders. See [Roadmap](#roadmap).

---

## Quickstart

Requires Node (any recent version) and a browser with [import-map](https://caniuse.com/import-maps) support — all current evergreen browsers.

```bash
npm install          # pulls in three@0.185.1 — required, see "The import map" below
npm start            # serves on http://localhost:5173
```

`npm start` just shells out to `npx -y serve`; any static file server works just as well:

```bash
npx -y serve -l 5173 .
python -m http.server 5173
```

It must be served over HTTP — opening `index.html` from the filesystem will fail, because ES modules and the import map are both subject to CORS.

### The import map

`index.html` maps the bare specifier `"three"` to `./node_modules/three/...`:

```html
<script type="importmap">
  { "imports": {
      "three": "./node_modules/three/build/three.module.js",
      "three/addons/": "./node_modules/three/examples/jsm/"
  } }
</script>
```

This exists specifically so `GLTFLoader.js` resolves without a bundler — it does `import ... from 'three'` internally, and nothing rewrites that for us. **Two consequences worth knowing before you change anything:**

- `npm install` is genuinely required. `node_modules/` is gitignored, so a fresh clone will show a blank page until you run it.
- Don't swap `app.js` back to a relative `./node_modules/...` import without also either dropping `GLTFLoader` or keeping the map. The map is what makes the loader's own import resolve.

This is also why the repo won't deploy to GitHub Pages as-is: `node_modules/` isn't published. Either commit the two Three.js files the map points at, or repoint the map at a CDN.

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

The room is cinematic, dark, 3D. `01 CODE` is white, tactile, editorial — a datasheet for the things Priyanshu has built. That contrast is the point, so CODE gets its own document, its own stylesheet, and its own typefaces rather than sharing tokens with the room. Clicking `01 CODE` pushes the camera into the monitor, floods the viewport with that screen's colour, and hands off to `code.html`; **Back** returns to the room via `history.back()` so the browser can restore the already-built 3D scene from the bfcache instead of booting Three.js cold. → [HANDOFF §15](HANDOFF.md#15-the-code-world-codehtml)

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
