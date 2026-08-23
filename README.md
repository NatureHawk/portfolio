# The Late Night Desk

A real-time 3D portfolio room you look at over the shoulder of the person sitting in it. Hover a monitor and the camera drifts closer; click and you fall into that world.

Built with vanilla JavaScript and [Three.js](https://threejs.org/) — **no framework, no bundler, no build step.** Every texture in the scene is drawn procedurally to a `<canvas>` at load time, and every sound is synthesised with the Web Audio API. There are exactly two binary assets in the whole project, both `.glb` models.

> **Status:** the room is finished. `01 CODE` is built — a full editorial product page of its own. `02 DESIGN` is three of the four sites reachable from the four corners of that screen: HUM top-left, BRUSH / 01 top-right, NEW FORMS bottom-left; the bottom-right corner has its navigation and transition but not yet its site. `03 EXPLORE` is still a placeholder. See [Roadmap](#roadmap).

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
| **Three CRT monitors** | `01 CODE`, `02 DESIGN`, `03 EXPLORE`, in a V-formation — `01` and `02` open a world, `03` is still a placeholder. Genuinely curved tube glass (a subdivided plane displaced into a parabolic bulge), a baked corner vignette, an additive phosphor bloom, rolling scanlines, and a pulsing status LED. |
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

design.html     02 DESIGN — HUM, a fictional product, built as a real website
design.css      Warm paper, near-black ink, one acid accent. Its own system again
design.js       Entry point: wires the modules, owns the arrival sequence
design/         The behaviour, split by job — see below

assets/website3/  The nine plates for NEW FORMS (world 03 of /design, below)

vendor/three/   The five Three.js files the browser loads. Committed — see below
vendor/anime/   The anime.js bundle. Loaded only by /design
vendor/unlazy/  The unlazy bundle. Loaded only by /design — see Images, below
scripts/        vendor-*.mjs and encode-images.mjs — see `npm run` below
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

`/design` is the one part of the site that is *not* one file. It is a canvas
you can actually manipulate, so behaviour and layout are genuinely separable:

```
design/motion.js    One clock, one pointer value, one scroll value, one easing set
design/parts.js     The object vocabulary — notes, tiles, comments, procedural art
design/canvas.js    What makes an object real: drag, keyboard, placement, links
design/cursors.js   Other people's cursors, and yours
design/chrome.js    Nav, status strip, the HUM meter, shared micro-interactions
design/hero.js      Section 01 and the closing gesture
design/story.js     Sections 02–04: the argument, the proof, the payoff
design/product.js   Sections 05–08: the tool, the case for it, the pile, the close
design/content.js   Data only — every word on the page lives in design.html

design/lazy.js      When a photograph is fetched. Wraps unlazy — see Images below
design/worlds.css     The corner controls, the portal layer, the world frame
design/worlds/        The four-corner navigation — see below

design/brush.css      World 02's own material. Nothing in it applies outside .bw
design/brush/site.js  BRUSH / 01 — nine acts, built when a hand nears the corner
design/brush/sequence.js  The sixty-frame disassembly, driven by scroll position
design/brush/content.js   Data only — every word and number the product claims

design/forms.css      World 03's own material. Nothing in it applies outside .fw
design/forms/site.js     NEW FORMS — five acts, built when a hand nears the corner
design/forms/content.js  Data only — every plate, mark and act name in the issue
```

### Four worlds, one document

`/design` is not one site. It is a doorway into four, one per corner of the
screen: **01 HUM** top-left, **02 BRUSH / 01** top-right and **03 NEW FORMS**
bottom-left (all three built), **04 DRIFT** bottom-right (a frame only —
architecture without content). Idle, the navigation is four two-digit numbers
and four hairlines; move a hand towards one and the corner opens.

```
design/worlds/registry.js   Which world lives in which corner. One object each
design/worlds/corners.js    Corner geometry: direction, nearness, what to pull
design/worlds/nav.js        The corner controls, driven by pointer distance
design/worlds/portal.js     The transition layer — three portal recipes
design/worlds/shell.js      Mounts, swaps, history. The only piece that sees all four
design/worlds/frame.js      The skeleton world 04 stands in until it is built
design/worlds/world0*.js    One module per world: palette, portal, choreography
```

Replacing a frame with a real site turned out to be the two lines the
architecture promised. `world02.js` stopped calling `worldFrame` and called its
own builder instead; the shell, the navigation, the portal, the registry and
HUM's departure table did not change at all.

Crossing takes ~640ms and never reloads anything. The world you are leaving
reacts towards the corner you pressed, the portal opens out of that exact corner
as a 45° blade, the swap happens at the frame the screen is fully covered, and
the destination arrives out of the same corner — so there is no intermediate
state, and never a placeholder. **Each destination owns its own choreography**:
`01 → 02` pulls the canvas objects and cursors into the top-right, `01 → 03`
stretches the typography into the bottom-left and hands over to a letterform,
`01 → 04` scatters the canvas and crosses the screen with fragmented plates.
Departures are a table in `world01.js`; portals are three functions in
`portal.js`. Adding a fifth of either is adding a row.

The destination is mounted the moment a pointer comes within 40% of its corner
(and on focus, so the keyboard route is never the slow one), which is what makes
the swap invisible. `prefers-reduced-motion` gets no transition at all — the
worlds simply exchange, fully composed. Each world is a URL (`?w=03`), so one
can be linked to and the back button moves between them.

Two things follow from a world being a real address. **The boot curtain wears
the world it is covering**: an inline script in `<head>` reads `?w=` and stamps
`data-boot` on the root element before the first paint, so refreshing on `?w=03`
opens on NEW FORMS' void-and-vermilion panel rather than on HUM's cream one
announcing a world you are not going to. And **every world has a way out** —
`.room-back` lives outside `#worlds` so it survives the swaps, and it carries
the same `data-back` treatment as HUM's own: `history.go()` past every entry
this document owns, so the browser restores the room from the bfcache instead of
booting Three.js cold. HUM keeps its own link in its top bar; the shared one
steps aside there and moves to the foot in BRUSH, which owns the top centre.

### Images

Every photograph the site loads is a `.webp` generated from a master that stays
in the repo. The masters were 19 MB and the encoded set is 3.4 MB, and the
largest part of that was not subtle: BRUSH's ten product stills shipped as
**PNG**, 11.6 MB between them, for photographs that are lit objects on a black
ground — mostly large fields of near-black, the worst case there is for a
lossless format. Re-encoded they are 0.4 MB, same pixel dimensions, mean
luminance moving by about a tenth of a level.

```bash
npm run images          # encode assets/*.png and assets/website3/*.jpeg → .webp
npm run images -- --force   # re-encode even where the .webp is current
```

`.vercelignore` keeps the masters out of the deploy, so **run `npm run images`
after adding a photograph** — a source with no encoded counterpart is a missing
image in production.

Fetching is handled by [unlazy](https://unlazy.byjohann.dev), vendored the same
way anime.js is. It is worth being precise about what it does, because it is
easy to assume more: it runs no `IntersectionObserver` and takes no root margin.
It holds the URL in `data-src`, puts a 1×1 transparent SVG in `src`, and swaps
the real URL in — the browser's own `loading="lazy"` still decides when bytes
move. The value is that **an image with no `src` costs nothing until that
happens**, which matters here because every world is built the moment a hand
moves toward its corner, long before anyone has decided to go there. A visitor
who reads HUM and leaves pays for none of the other three worlds' photography.
The second benefit is a known moment of arrival, so a plate fades up instead of
snapping in mid-scroll. → [`design/lazy.js`](design/lazy.js)

### 02 · BRUSH / 01

The second world is an absurdly over-engineered product launch for a toothbrush,
played completely straight — near-black, smoked polycarbonate, one warm orange
used on about two percent of the screen, and specifications set at the size of
headlines. Nine acts on one continuous scroll. Nothing on the page winks; the
object being a toothbrush is the entire joke and saying so out loud would spend
it, so the only line that steps outside the fiction is the last one.

Its centre is a **sixty-frame disassembly driven by scroll position** — a pinned
viewport four and a half screens tall where the scroll offset *is* the frame
number, so scrolling back up puts the toothbrush together again. One canvas, not
sixty stacked images: one compositing layer, one draw per changed frame, and
nothing in the document reflowing when the picture changes. Frames arrive on a
three-rung ladder — five anchors two screens out, then every fourth, then the
rest nearest-first while the browser is idle — and on a small or low-memory
device the sequence takes every second frame, because sixty 720×1280 stills
decoded at once is 220MB. `prefers-reduced-motion` builds a different section
entirely: one still of the finished disassembly, all four callouts showing, and
the sixty frames never requested.

A visitor who reads HUM and leaves pays **zero bytes** for any of it. The world
is built the moment a hand moves towards the top-right corner and not before.

The other half of the work is that none of the photographs look placed on the
page. They were lit separately and do not share a background — measured at the
pixel, the quietest peaks at luminance 6 around its border and the loudest at
234 — so on true black each one otherwise leaves a faint rectangle. Every image
is either **bled** (its edge pushed off the screen, or cropped by a window sized
to a screen) or **feathered** with a mask tuned per side from that measurement,
and where a window crops a picture the mask goes on the window, because the
window's edge is the one you can see. The exploded sequence feathers in the draw
instead, since a CSS mask there would land on the empty stage rather than on the
picture. Measured back at the boundary, every image now steps by under one
luminance level.

One rule came out of getting that wrong. `object-fit: cover` crops whichever
axis its CONTAINER is relatively longer in, so what survives depends on the
column width, which depends on the viewport — a crop that frames perfectly at
one width quietly eats the subject at another. Every product shot here is the
same shape: the subject runs the full height of the frame and sits in the middle
third of the width, so there is no vertical margin to crop into and any vertical
crop is subject. The whole-product shots are therefore sized by HEIGHT with
`width: auto`, which makes the element exactly the picture and crops nothing at
any size; the side margin they do have is spent bleeding them off the page
instead. Only the pressure band, which is landscape and has margin above and
below, is still a cropping window.

### 03 · NEW FORMS

The third world is a fictional avant-garde fashion house presented as a
photographic editorial — nine plates in five acts, on one continuous scroll.
Dark sci-fi campaign rather than architecture museum: the ground runs
**black → charcoal → bone → black → bone**, and bone (the one warm surface in
the issue) survives in exactly one act, THE BODY, because those garments were
shot on a lit ivory wall and a bone ground is what puts black clothing on white
paper at full contrast. Everywhere else the ground is the dark the photographs
were lit against.

Every plate's `--z`/`--dx`/`--dy`/`--open` is written by a scroll scrubber
rather than an animation, so scrubbing back up undoes exactly what scrolling
down did — none of it ever "played." All nine source photographs are the same
2752 × 1536, so variety comes from the frame rather than the pictures: a pinned
screen of architecture with a sentence crossing it the other way, a full-width
uncropped object bleeding off one edge, a peak with the headline set into the
wall beside the figure.

The motion is deliberately kept **tertiary** — photography first, typography
second. No scrub changes a scale by more than 8%, no pin runs longer than
180vh, and nothing is laid out at a size it is not meant to be seen at. That
last rule is one this world learned by breaking it: THE OBJECT used to arrive
at 0.42 scale and grow across three screens of pinned scroll, which made the
act's subject the growing rather than the object, and spent three screens
delivering a picture that was legible on the first. The single exception is the
movement frame, which travels 10% because that photograph is *already* motion
and the frame is agreeing with it rather than adding to it.

This was also this world's rework: the first pass of NEW FORMS was built by
mistake as a standalone page wired to the room's `03 EXPLORE` monitor. EXPLORE
and DESIGN are separate parts of the portfolio, and NEW FORMS is the *design*
section's third website — it now lives entirely in `design/forms/` +
`design/forms.css`, mounted by `design/worlds/world03.js` at the bottom-left
corner, and `03 EXPLORE` is back to being an unbuilt placeholder. The original
standalone version is kept at `_backup/website3-standalone/` as the source the
rework was ported from — not published, not linked, not loaded. → [HANDOFF §18](HANDOFF.md#18-new-forms-world-03-of-design)

### Design systems, kept apart

The room is cinematic, dark, 3D. `01 CODE` is soft, tactile, editorial — a neumorphic surface where every panel, switch and dial is extruded from one continuous sheet, with no borders anywhere. `02 DESIGN`'s HUM is warm paper and near-black ink with a single acid-lime accent used strictly as a highlighter: it fills, it never glows, and no text is ever set in it. `02 DESIGN`'s NEW FORMS (world 03 of the four corners) is a photographic editorial: three grounds sampled off the photographs themselves, one vermilion accent that only appears because the pictures already contain it, and no card, radius, shadow or border anywhere near an image.

That contrast is the point, so each world gets its own document (or, inside `/design`, its own stylesheet scoped to its own root class) and its own typefaces rather than sharing tokens with the room or with each other. Clicking a monitor pushes the camera into it, floods the viewport with that screen's colour, and hands off to the page; **Back** returns to the room via `history.back()` so the browser can restore the already-built 3D scene from the bfcache instead of booting Three.js cold. → [HANDOFF §15](HANDOFF.md#15-the-code-world-codehtml)

`02 DESIGN` is a product site for **HUM**, a fictional collaborative canvas, and the argument it makes is one the page has to demonstrate rather than assert: *the internet should feel alive.* So the headline lives inside the canvas rather than above it, every object on the page can be picked up, other people's cursors arrive unprompted and move things — and they stop the moment you touch anything yourself. Section 04 is scroll-scrubbed rather than autoplayed, so the visitor assembles the poster instead of watching it assemble. There is not one image request on the page: every piece of artwork is drawn in CSS.

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

**Phase 1 — World content.** `01 CODE` and `02 DESIGN` are built; `03 EXPLORE` (the room's third monitor) is still a placeholder. What's left in CODE is the case study behind each project's `EXPLORE →` (the cards render those as inert controls tagged `SOON` until the routes exist). `02 DESIGN` now holds three of its four sites — HUM, BRUSH / 01 and NEW FORMS — and the four-corner navigation that moves between them is built; the bottom-right corner (DRIFT) still needs its site, not its architecture (`design/worlds/frame.js` is what stands in until then). NEW FORMS ships as Issue 03; the shape of it is an issue, so a second one is a new set of plates and a new act list rather than a new page.

**Phase 2 — Mobile and touch.** There is currently *no* touch input handling. Tapping a monitor works via the raycast click handler, but hover-to-preview has no touch equivalent, so the entire preview interaction is desktop-only.

**Phase 3 — Performance.** The scene runs ~11 dynamic lights ([HANDOFF §9](HANDOFF.md#9-lighting-inventory)), which is high for hand-authored WebGL with this much geometry. Budget for pruning before adding much more.

---

## Credits and licensing

Code is ISC (see `package.json`). The 3D models under `assets/` are third-party and carry their own terms — check them before reusing or redeploying this repo. The scene, textures, audio synthesis, and shader work are original.
