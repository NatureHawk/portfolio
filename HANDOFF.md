# Engineering Handoff & Technical Documentation

## 1. Project Overview

A high-performance, real-time 3D portfolio experience built with Vanilla JavaScript, WebGL (Three.js), and CSS — no framework, no bundler. The aesthetic is "Late Night Desk / After Hours":

- An atmospheric room with a physical window cutout, infinite celestial starry parallax backdrop, and a warm string of fairy lights draped across the window header.
- Three interactive retro CRT monitors (`01 CODE`, `02 DESIGN`, `03 EXPLORE`) in a V-formation, with genuine tube curvature, phosphor bloom, a rolling scanline overlay, and a pulsing status LED.
- A fully modeled seated developer in an oversized hoodie with studio headphones, a Japanese oak bentwood swivel chair, and a densely detailed desk (mechanical keyboard, mouse, coffee mug with live steam, desk lamp with a bulb correctly nested inside its shade).
- A "lived-in" clutter pass: a sleeping cat (real GLB asset) with a yarn ball, a rug, vinyl records, a wall clock, takeout container + chopsticks, a charging phone, a trash bin, kicked-off slippers, a headphone stand, a pen holder — all placed and verified to actually be visible from the fixed camera angles, not just mathematically present.
- A custom procedural Web Audio engine (ambient drone, CRT hum, UI SFX) — zero external audio files.
- Camera transitions with sticky hover hysteresis, a single-blend translucent dissolve on the character silhouette, and full 2D HUD overlays.

---

## 2. Repository Architecture & File Manifest

```
├── index.html                 # HTML structure, HUD overlays, 2D world views, import map
├── styles.css                 # Design tokens, CRT/world-view transitions
├── app.js                     # Entire Three.js scene graph, materials, procedural textures, audio, render loop
├── assets/
│   ├── cat.glb                 # Sleeping-cat figurine — decimated to 3,000 tris (see §3)
│   ├── fairy_lights.glb        # Cable + bulb string, exported from fairy_lights.blend (see §3)
│   ├── fairy_lights.blend      # Source Blender file (kept for re-export if the asset needs changes)
│   ├── lofi-room.png           # Reference mood image (not loaded at runtime)
│   └── sleeping-fat-cat-figurine.../  # Source OBJ/STL/zip cat.glb came from — GITIGNORED, local only
├── package.json                # Dependencies (three ^0.185.1) + `npm start`
├── package-lock.json
├── .gitignore
├── README.md                   # Orientation, quickstart, highlights — start there
└── HANDOFF.md                  # This file: the deep engineering detail
```

### File Responsibilities

**`index.html`**
- `#scene` — WebGL canvas mount point.
- `<script type="importmap">` — maps the bare specifier `"three"` and `"three/addons/"` to `node_modules/three/...`. This exists *specifically* so `GLTFLoader.js` (which imports from the bare specifier `'three'` internally) resolves in the browser with no bundler. `app.js` itself imports Three via the same bare specifier now, not a relative path.
- HUD layer: `.hud-top` (brand + audio toggle), `.intro` (title copy), `.monitor-ui` (`01/02/03` world nav), `.cursor-note`.
- `.world-view[data-world-view]` — fullscreen overlay pages for each world, with a `.back-button`.

**`styles.css`** — design tokens (`--code`, `--design`, `--explore` accent colors), `.world-view` fade/scale transition, responsive breakpoints, reduced-motion media query.

**`app.js`** (~2,600 lines) — everything else. Organized top-to-bottom as: geometry helpers → texture generators → CRT monitor builder → room/props builder → character builder → lo-fi clutter builder → global lighting → audio engine → interaction/camera state machine → render loop.

---

## 3. Asset Pipeline (GLB models via headless Blender)

Two real 3D assets are loaded at runtime instead of being built from primitives:

| Asset | Source | How it got here |
|---|---|---|
| `assets/cat.glb` | User-supplied "sleeping cat figurine" pack (OBJ + STL + a textured GLB inside a zip) | Extracted the GLB from the zip. It shipped with **no fur texture** (plain white material) — tinted it warm ginger (`0xc9793d`) directly in code (`app.js`, cat `traverse` callback) since there's no texture to rely on. It also shipped at **50,000 triangles**, absurd for a small background prop — decimated to **3,000 triangles** (94% reduction, 901KB → 55KB) via headless Blender's Decimate modifier, then re-exported. If you ever need to redo this: `blender.exe --background --python <script using bpy.ops.import_scene.gltf + modifiers.new('DECIMATE') + export_scene.gltf>`. The original full-res files are untouched in `assets/sleeping-fat-cat-figurine.../` if a higher-detail re-export is ever needed — but note that folder is **gitignored** (~6.7MB of OBJ/STL that nothing loads at runtime, and a third-party asset we'd rather not redistribute), so it exists only on machines that downloaded the pack. A fresh clone has `cat.glb` and nothing to regenerate it from. |
| `assets/fairy_lights.glb` | User-supplied `fairy_lights.blend` | The `.blend` file contains a fully modeled cable+bulb string asset (object name `FaerieLight`, ~1,600 tris, with `Cable`/`Emissive`/`Metal`/`Socket` materials). Exported directly via headless Blender (`bpy.ops.export_scene.gltf`, `use_selection=True`). No decimation needed — already lightweight. |

Both are loaded via `GLTFLoader` (`three/addons/loaders/GLTFLoader.js`), auto-fit and grounded by **measuring their own bounding box** (`THREE.Box3().setFromObject(...)`) rather than hardcoding a scale/offset — this makes both loaders robust to the source asset's arbitrary internal scale, pivot, and orientation. See `addLofiClutter()` in `app.js` for both loader callbacks.

**Do not** re-introduce a relative `./node_modules/three/build/three.module.js` import in `app.js` without also either removing the `GLTFLoader` import or keeping the import map — `GLTFLoader.js`'s own `from 'three'` import will break without the map.

---

## 4. 3D Coordinate System & Spatial Staging

Three.js world units, right-handed (+X right, +Y up, +Z toward camera).

### Camera Trajectory Matrix

| Phase | Camera Position | Look Target | Damp Factor |
| :--- | :--- | :--- | :--- |
| **Home** | `(0, 2.80, 9.50)` | `(0, 1.85, -0.15)` | `5.8` |
| **Hover `CODE`** | `(-2.20, 2.35, 6.40)` | `(-2.85, 2.05, -0.15)` | `6.2` |
| **Hover `DESIGN`** | `(1.10, 2.40, 6.00)` | `(0.00, 2.05, -0.15)` | `6.2` |
| **Hover `EXPLORE`** | `(2.20, 2.35, 6.40)` | `(2.85, 2.05, -0.15)` | `6.2` |
| **Enter `CODE`/`DESIGN`/`EXPLORE`** | `(monitor.x, 2.05, 1.25)` | `(monitor.x, 2.05, -0.15)` | `3.1` |

`3.1` (entering) is deliberately the *slowest* of the three — it was previously `4.8`, which felt too fast/abrupt; the world-view page reveal delay was extended from `500ms` to `820ms` to match so the camera glide is mostly complete before the page cuts in, instead of being visibly cut off mid-motion.

### Monitor Layout
- `CODE`: `x: -2.85`, `ry: +0.18 rad`
- `DESIGN`: `x: 0`, scale `1.18×` (the "hero" center monitor)
- `EXPLORE`: `x: +2.85`, `ry: -0.18 rad`

All at `y: 2.05, z: -0.15`.

---

## 5. Scene Content Inventory (added this pass)

Everything below was added/repositioned to fill out the room without feeling like random clutter. Positions matter here more than usual — several items initially landed **outside the visible camera frustum** or **directly behind HUD text**, which isn't obvious from code alone. If you move the camera's home framing, re-check these against a real screenshot, not just the math.

| Item | Position (x, y, z) | Notes |
|---|---|---|
| Sleeping cat (GLB) | `(-2.05, 0.03, 3.2)` (target; actual placement auto-centers via bounding box) | `targetLength = 0.6` world units, longest axis |
| Yarn ball + thread | `(-1.55, 0.1, 3.0)` | Beside the cat |
| Rug | `(0, 0.005, 2.75)`, `3.7 × 2.9` plane | Canvas-textured with a radial vignette baked in so the edge dissolves into the floor instead of reading as a hard rectangle |
| Vinyl stack | `(-5.55, 0.05, 1.4)` | Leaning against the left desk leg |
| Wall clock | `(-7.6, 3.55, -1.63)` | Left wall; kept low enough to actually be in frame — anything much above `y≈5.5` on that wall is above what any camera state in this app looks at |
| Takeout container + chopsticks | `(4.75, 0.94, 1.85)` | Right desk — moved off its original spot at `x=-3.95` because that was **directly behind the "SHOULDER." HUD headline** |
| Phone + charging cable | `(4.35, 0.945, 2.05)` | Cable is a short coiled loop resting on the desk — an earlier version dangled a straight cable to the floor with nothing at the end and read as a stray floating line |
| Trash bin + paper balls | `(4.3, 0.17, 2.85)` | Originally at `x=5.05`, which was **outside the visible frustum** at that depth (`z=2.75` → visible half-width ≈4.67, so `x=5.05` was clipped) |
| Slippers | `(1.7 ± 0.22, 0.03, 3.55)` | Originally near `x=0.65`, which sat inside the character/chair's silhouette footprint from the home camera and was invisible |
| Headphone stand | `(-2.15, 0.94, 1.75)` | Left of the CODE monitor's desk area |
| Pen holder | `(-1.35, 0.94, 2.05)` | Originally at `(-1.05, 0.94, 1.35)`, which clipped into the keyboard's bounding box |
| Second ivy vine | `(4.15, 7.2, -1.55)` | Mirrors the original left-side ivy for symmetry |
| Left-wall fill light | `(-6.5, 4.3, -1.0)` | Small, short-range (`PointLight`, intensity `0.9`, distance `4.2`) — added because the "QUESTION EVERYTHING" sticky note was unreadable in ambient light after its material was fixed (see §8) |
| Cat fill light | computed from cat position `+ (0.3, 0.5, 0.3)` | Same reasoning — the cat's texture-less material was reading as a cool grey blob under pure moonlight ambient |

**Lesson learned repeatedly this session**: positioning by coordinate math alone is not reliable in this scene. The camera's visible frustum narrows a lot at close depths, HUD text overlays a large chunk of the left-center of the screen, and the character/chair silhouette occupies more of the center-floor area than it looks like from the code. **Always verify new object placement with an actual screenshot at the home camera framing**, not just by checking the numbers.

---

## 6. CRT Monitor System

The monitors were originally a flat `PlaneGeometry` with a static baked texture — looked like an LCD, not a CRT. Now each screen (`makeMonitor()` in `app.js`) is layered:

1. **Curved glass** — `createCurvedScreenGeometry(w, h, bulge)` subdivides a plane (20×20 segments) and displaces each vertex outward by `bulge * (1 - d²)` where `d` is normalized radial distance from center — a cheap parabolic convex bulge, not a sphere-cap.
2. **Baked vignette** — `createScreenTexture()` draws a radial gradient darkening the canvas corners *into the texture itself* (not a separate mesh), for the "rounded tube" look.
3. **Glass highlight** — a second curved-geometry mesh, slightly in front, with a diagonal soft-gradient texture, additive blended, low opacity — a fixed sheen, not animated.
4. **Phosphor glow** — a `Sprite` behind/around the screen, tinted per-monitor (`spec.color`), additive blended, **fixed opacity** (`0.5`). This used to pulse every frame (`sin(time*9)`-driven opacity) — removed, because at the whole-screen scale it read as "the display glowing and dimming," which felt wrong. Do not re-add per-frame opacity animation to this sprite without a specific reason; it was explicitly asked to be removed.
5. **Rolling scanlines** — `createScanlineOverlayTexture()` is a 4×6px tile of one dark line, `RepeatWrapping`, tiled ~140× vertically, `NearestFilter` for crisp lines. Its `.offset.y` is incremented in the render loop (`time * 0.08 % 1`) for a continuous slow roll. This is the *only* per-frame "alive" cue on the screen surface now.
6. **Status LED** — the small colored dot mesh (`ledMat`) gets its HSL lightness and scale pulsed each frame (`sin(time*2.2 + idx*2.1)`), a small, localized, low-amplitude touch — deliberately *not* screen-wide.

If asked to make the monitors feel "more alive" again, prefer extending #5/#6 (localized, motion-based) over reintroducing #4 as an animated brightness pulse (rejected once already).

---

## 7. Character Silhouette Fade (why it's neither an `.opacity` tween nor a Fresnel rim)

The character + chair are built from ~30 overlapping `Capsule`/`Sphere`/`Torus` primitives, each its own mesh (by design, so they blend into a continuous-looking opaque body). Two earlier approaches to fading them out both failed, for related reasons — **read this before "simplifying" the current one**:

1. **Per-material `.opacity` tween.** Once opacity drops below 1, alpha blending lets you see through each translucent layer to whatever overlapping part is behind it. With dozens of intersecting shapes the result is an X-ray of the component pieces, not one dissolving figure.
2. **Fresnel rim term** (`pow(1 - dot(normal, viewDir), edgePower)`, interior alpha collapsing to 0 the instant any fade began). This hid the *interior* seams but failed in a subtler way: **every primitive contributes its own rim**, so the figure filled up with the outlines of individual body parts — a soup of arm/shoulder/skull ellipsoids, which is exactly what "bubbles" refers to in past feedback.

Overlapping primitives only read as one shape if **each pixel is blended exactly once, in exactly one colour**. The current implementation is those two guarantees:

**(a) Depth pre-pass.** Built at init right after `addPerson()`. Every mesh in `silhouetteGroup` gets a proxy `Mesh` sharing its geometry, parented to it with an identity local transform (so it inherits the exact world matrix, breathing bob included), using a shared `MeshBasicMaterial({ colorWrite: false, depthWrite: true, transparent: true })`.

- `transparent: true` is **load-bearing, not sloppiness** — it keeps the proxies in the transparent render queue, i.e. *after* all opaque geometry. Put them in the opaque queue and they write depth before the monitors/room draw, punching black holes wherever the character overlaps the scene.
- `renderOrder`: proxies `1`, real body meshes `2`, everything else in the scene the default `0`. Proxies must run after other transparents but before the body itself.
- The real materials then use `depthWrite: false`, so every fragment behind the nearest surface fails the depth test and never blends. One blend per pixel — no stacking, so no seams where parts intersect and no darker patches where they overlap.

**(b) `applySilhouetteFade()`** patches each material's compiled shader via `onBeforeCompile`:

```glsl
float fade = clamp(uFadeAmount, 0.0, 1.0);
float tint = smoothstep(0.0, 0.30, fade);         // colour flattens well ahead of alpha
gl_FragColor.rgb = mix(gl_FragColor.rgb, SILHOUETTE_TINT, tint);
gl_FragColor.a  *= mix(1.0, SILHOUETTE_MIN_ALPHA, fade);   // 0.72 — translucent, not see-through
```

Colour collapsing faster than alpha matters: it means no part's own material (skin, oak, the white sneaker sole) is ever recognisable through the figure at partial fade. Alpha is *uniform across the whole body* — deliberately no view-dependent term — so the only edge anywhere is the outer boundary against the background.

Note the traverse enrolls **every** mesh in `silhouetteGroup`, not just ones already authored `transparent: true`; the backrest grain strips weren't, and stayed stubbornly solid while the rest of the figure dissolved around them. `applySilhouetteFade()` forces `transparent`/`opacity`/`depthWrite` itself. Materials are shared across many meshes (one `hoodieMat` for a dozen parts), so each distinct material is patched exactly once.

`silhouetteFadeAmount` (module-level) drives every material's `uFadeAmount` from the render loop:

```js
const targetFade = entering ? 1 : THREE.MathUtils.clamp((distToHome - 0.9) / 5.5, 0, 0.94);
const fadeDamp   = targetFade < silhouetteFadeAmount ? 16.0 : 8.0;   // asymmetric
```

Both numbers exist to stop the figure looking ghosted *after* a zoom-out has visually finished. The camera itself damps home at only `5.8`, so driving fade off raw distance left it translucent for the last half-second; the `0.9`-unit dead zone makes it simply solid once the camera is that close, and the asymmetric damp (fast in, normal out) keeps the return from lagging the camera. Hover depth still lands around `fade ≈ 0.5`.

If this ever needs revisiting: hover the `DESIGN` monitor (centre, closest hover distance) and look for *any* internal edge in the figure — overlapping-shape seams or per-part outlines — before touching anything else.

---

## 8. Lamp Hierarchy

The desk lamp shade and bulb used to be two independently-hardcoded world-space coordinates that merely happened to sit near each other — fragile, and the actual bug (bulb rendering *outside/below* the shade instead of inside it) came from exactly that: nothing tied them together.

Now (`app.js`, inside `addRoomAndProps()`):

- `lampHeadGroup` is anchored at the arm's **actual computed tip** — derived from the existing arm segment's center + half its rotated length, not guessed: `(-0.689, 2.195, 0.1)`, with `rotation.z = -0.75` tilting the whole assembly so the opening faces down over the desk.
- **The sign of that `rotation.z` is the only thing deciding which way the cone points.** Negative tips the head down-and-*left*, over the desk and the monitors — correct. Positive mirrors it down-and-right, aiming the shade off the right edge of the desk at nothing. The head hangs from the joint either way, so if the lamp ever looks like it's lighting the wrong direction, this is the one-character fix; don't go re-deriving the arm tip.
- The shade (`ConeGeometry`) is positioned at local `(0, -shadeHeight/2, 0)` inside that group — this puts the cone's **apex** (its default `+height/2` point) exactly at the group's origin (the arm joint), so the shade hangs from the joint with its wide opening below.
- The bulb sits at local `(0, -shadeHeight * 0.58, 0)` — inside the shade's hollow interior, near the open end (interior radius at that height ≈0.22, comfortably larger than the bulb's `0.12` radius).
- `deskLampLight`'s world position is set via `bulb.getWorldPosition()` **after** `lampGroup.updateMatrixWorld(true)` — computed from the actual bulb, not a separately hand-typed coordinate. If you ever move/re-angle the lamp head, the light will follow automatically; you should never need to hand-tune its position again.

If the shade ever looks flipped (wide end up instead of down) after a geometry change, the fix is almost certainly in this group's `rotation.z`/the shade's local `position.y` sign — not a `scale.y = -1` mirror hack (that was tried first, and only fixed which end was wide without fixing the actual parent/child relationship — kept for reference as what *not* to do).

---

## 9. Lighting Inventory

| Light | Type | Color | Intensity | Range/Decay | Purpose |
|---|---|---|---|---|---|
| Hemisphere | `HemisphereLight` | sky `0x18243c` / ground `0x22160d` | `1.15` | — | Base fill |
| Moonlight | `DirectionalLight` | `0x789ef5` | `1.6` | — | Through the window |
| Per-monitor CRT glow | `PointLight` ×3 | `spec.color` | `2.2`–`2.8` (hover-modulated) | `11.0` / `1.3` | Desk phosphor spill |
| Desk lamp | `PointLight` | `0xffa045` | `3.8` | `16.0` / `1.2` | Position = bulb's real world position (§8) |
| Screen backlight | `PointLight` | `0x6095ff` | `2.2` | `5.5` / `1.4` | Character rim light |
| Fairy lights | `PointLight` ×2 | `0xffcf9a` | `0.7` each | `6.5` / `1.3` | **Deliberately 2 wide lights, not 5 tight ones** — a real string light casts a broad diffuse pool, not a pinpoint hotspot; this also roughly halves the light count vs. the first attempt |
| Left-wall fill | `PointLight` | `0x8fa8e0` | `0.9` | `4.2` / `1.8` | Makes the sticky note legible (§5, §10) |
| Cat fill | `PointLight` | `0xffc98a` | `0.8` | `2.4` / `1.8` | Same reasoning, for the cat |

**Total lights: 11** (1 hemisphere + 1 directional + 9 point lights). This is already on the higher side for a hand-authored WebGL scene with this much geometry — think twice before adding more, especially unbounded-range ones. If performance ever becomes a concern again, the fairy-light and fill lights are the first candidates to prune or shrink further, in that order.

---

## 10. Materials Fixed This Pass (unlit-vs-lit bug)

The left-wall "QUESTION EVERYTHING <3" sticky note used `MeshBasicMaterial` — which renders at full brightness regardless of scene lighting. Against this scene's very dark ambient, that made it look like it was *glowing* for no reason, while everything else (correctly using `MeshStandardMaterial`) looked properly dim/moody by comparison. Fixed by switching it to `MeshStandardMaterial` + adding the small `leftWallFill` light so it's still legible.

**When adding new textured planes to this scene**: use `MeshBasicMaterial` only for things that are *actually* light sources or self-illuminated in-universe (CRT screens, LEDs, the moon, stars, lamp bulb). Everything else — posters, notes, papers, fabric — should be `MeshStandardMaterial` so it responds to the room's actual lighting, or it will look like an unintentional light source the moment the surrounding area is dim.

---

## 11. Interaction Mechanics & Edge Case Solutions

### Sticky Workspace Hysteresis
While hovering a monitor, the zoomed-in focus stays locked as long as the cursor is within a "desk zone" in screen space, so small mouse movements over the zoomed monitor don't cause flicker. This zone was originally far too large (`x: ±0.90, y: [-0.68, 0.72]` — nearly the entire screen, meaning the mouse had to travel almost to the window edge to lose focus). **Current bounds: `x: ±0.46, y: [-0.38, 0.44]`** — tightened to roughly match the actual zoomed monitor's footprint.

### Runaway Hover: the Picking Feedback Loop

**This is the subtlest thing in the interaction layer — read it before touching the `pointermove` handler.**

Hover picking raycasts from the *live* camera, and committing a hover *moves* that camera. So a hover change re-aims the very ray that produced it. A real mouse fires 100+ events/sec and a hand keeps trickling them out while it decelerates, so the tail of a gesture gets evaluated against a camera that has already swung several units sideways — lands on a completely different monitor — and commits again, which swings the camera further. It compounds.

Two symptoms, same cause:

- Zoom into `EXPLORE`, flick left onto `DESIGN`: it reaches `DESIGN`, then coasts straight past it into `CODE` with the mouse effectively still.
- Switch onto a monitor near a screen edge: mid-glide the cursor's ray falls off every monitor *and* outside the desk zone, the release debounce fires, and the fresh hover bounces back home.

**Fix**: every *raycast-driven* hover change must prove it came from the user and not from the camera. Both conditions, in the `pointermove` handler as `userDriven`:

1. `cameraSettled` — `camera.position` within `CAMERA_SETTLE_EPSILON` (0.12 world units) of `cameraGoal`, tracked in the render loop.
2. The cursor has travelled at least `HOVER_SWITCH_TRAVEL` (0.05 NDC, ~2.5% of viewport width) since `switchAnchor`.

**`switchAnchor` is set when the camera *finishes* gliding, not when the hover commits** — this distinction is the whole fix. Measuring from the commit banks all the motion that occurs during the glide and spends it the instant the camera arrives, which is the runaway all over again.

The nav buttons, `focus`, and clicks bypass `userDriven` entirely — an explicit `mouseenter` on `01/02/03` was never ambiguous about intent, and gating it would only make the HUD feel laggy.

`CAMERA_SETTLE_EPSILON` and `HOVER_SWITCH_TRAVEL` are the responsiveness/stability dial: lower the epsilon to unblock sooner after a glide, lower the travel to react to smaller cursor moves. Raising either makes the camera calmer but slower to respond.

**Testing note**: this bug does *not* reproduce with synthetic single events — it needs a decelerating stream of them, i.e. an easing ramp of `pointermove`s followed by a tail of near-identical ones, all inside one continuous rAF-pumped run. Splitting a test across two `page.evaluate` calls also gives false failures, because rAF stalls between them and the camera never reaches the settled state that updates `switchAnchor`.

### Phantom Re-Hover After Returning Home
**Bug**: hide a full-screen overlay (`display:none` via the `[hidden]` attribute) while the cursor sits stationary over a HUD element that was underneath it, and Chrome (and other browsers) re-runs hit-testing and fires a **trusted** `mouseenter` on whatever's now exposed — even with zero mouse movement. Reproducible by: hover a `01/02/03` nav button, click it to enter, then leave via **Escape** (not moving the mouse) — the phantom `mouseenter` on the still-cursor-covered button would silently re-trigger `setHover()`, snapping the camera right back into that monitor's zoom instead of resting at home.

**Fix**: `suppressHoverUntil` — a 300ms window after `returnRoom()` completes during which `setHover(target)` calls for a non-null target are ignored. Set in `returnRoom()`'s `setTimeout` callback, checked at the top of `setHover()`.

### Return Transition Timing
The CSS fade-out for `.world-view` is `.48s`, but the JS was hiding the page (`hidden = true`) after only `250ms` — visually chopping the fade off mid-transition. Now `480ms`, matching the CSS.

---

## 12. Known Limitations / Things to Watch

- **No touch/mobile input handling.** Hover-to-preview doesn't translate to touch; tapping a monitor works via the raycasted `click` handler but there's no equivalent "preview" state for touch devices. Flagged in the original roadmap, still unaddressed.
- **GLB assets add network/parse cost** the rest of the scene doesn't have. Both are small (55KB, 133KB) and loaded async so they don't block first paint, but they do pop in a beat after the rest of the room — expected, not a bug.
- **11 lights** is a lot for a scene this geometry-dense. If you're adding a *lot* more scene content, budget for either removing some existing lights or accepting a real performance cost — this isn't a "just add one more" situation anymore.
- **Camera framing is fixed** (home/hover/enter, per monitor) — any new scene content should be checked against these specific camera states, not assumed visible just because the coordinates seem reasonable. See §5's "lesson learned" — this bit us multiple times this session (books behind HUD text, trash bin outside the frustum, slippers behind the character).
- **The cat's fur color is hardcoded**, not from a texture (the source asset had none). If you ever swap in a properly textured cat model, remove the `child.material.color.set(0xc9793d)` override in the GLTF load callback or it'll stay tinted.

---

## 13. Future Roadmap

### Phase 1: World Content
- `01 CODE`: project catalog, live demo embeds, GitHub integration.
- `02 DESIGN`: portfolio gallery, case studies, design system docs.
- `03 EXPLORE`: creative-coding demos, generative art, essays.

### Phase 2: Mobile & Touch
- Touch drag/pinch gestures; a proper touch-equivalent to the hover-preview state.

### Phase 3: Performance
- Revisit the 11-light budget if adding more scene content.
- Consider merging some of the character's ~30 primitive meshes into fewer geometries if the silhouette pass ever becomes measurable — note it is now ~30 extra draw calls for the depth pre-pass proxies too (unlikely to matter at this scale, but worth knowing it's there).

---

## 14. Development Quickstart

No build step. Any static file server works:

```bash
npx -y serve -l 5173 .
```

Open `http://localhost:5173`. Requires a browser with import-map support (all current evergreen browsers).

**Only needed if regenerating the GLB assets in §3**: Blender 4.x, run headlessly via `blender.exe --background <file.blend> --python <script.py>` — no GUI needed, see §3 for the exact operations used.
