# Engineering Handoff & Technical Documentation

## 1. Project Overview

This project is a high-performance, real-time 3D portfolio experience built with Vanilla JavaScript, WebGL (Three.js), and CSS. The aesthetic follows a "Late Night Desk / After Hours" theme, featuring:
- An atmospheric room with physical architectural window framing and an infinite celestial starry parallax backdrop.
- Three interactive retro Sony Trinitron-style CRT monitors (`01 CODE`, `02 DESIGN`, `03 EXPLORE`) arranged in an ergonomic V-formation.
- A fully modeled seated developer in an oversized hoodie with pro studio monitor headphones, Japanese oak bentwood swivel chair, desk accessories, potted plants, and dynamic hot coffee steam.
- A custom procedural Web Audio synthesis engine for ambient lo-fi drone soundscapes, CRT focus hums, and UI feedback without external audio asset dependencies.
- Seamless spatial camera transitions with sticky hysteresis and full 2D HUD overlays.

---

## 2. Repository Architecture & File Manifest

```
├── index.html          # Semantic HTML structure, HUD overlays, 2D world views, audio controls
├── styles.css          # Design system, CSS variables, typography, CRT effects, transitions
├── app.js              # Complete Three.js scene graph, materials, procedural textures, audio engine, loop
├── package.json        # Dependencies (Three.js v0.185.1)
├── package-lock.json   # Lockfile
├── .gitignore          # Git ignore rules for node_modules and OS files
└── HANDOFF.md          # Technical documentation & future roadmap
```

### File Responsibilities

#### `index.html`
- **Canvas Container**: `#scene` serves as the WebGL canvas mount point.
- **HUD Layer**:
  - `.hud-top`: Branding header and lo-fi audio toggle button (`#audio-toggle`).
  - `.intro`: Floating typography prompt (`LOOK OVER MY SHOULDER`).
  - `.monitor-ui`: Bottom world selection navigation (`01 Code`, `02 Design`, `03 Explore`).
  - `.cursor-note`: Spatial helper indicator (`↗ Move across a screen`).
- **World Views** (`.world-view`):
  - Fullscreen overlay screens for `code`, `design`, and `explore` that fade in when a user zooms into a monitor. Each contains a back button (`.back-button`) to return to the 3D room.

#### `styles.css`
- **Design Tokens**:
  - Theme colors: `--bg: #03050a`, `--paper: #e5dec9`, `--muted: #737887`.
  - World accents: `--code: #8eff56`, `--design: #5aa2ff`, `--explore: #ff9158`.
  - Typography: Display font `Impact, sans-serif` for prominent titles, monospace for technical metadata.
- **Micro-Interactions**: Transitions for UI state toggles (`body.is-hovering`, `body.is-entering`, `.world-view.visible`).

#### `app.js`
- **Renderer Configuration**:
  - Mediump precision, ACES Filmic Tone Mapping (`exposure: 1.05`), SRGB color space, no heavy shadow maps for maximum 60+ FPS performance.
- **3D Procedural Scene Graph**:
  - `createCosmicBackdropTexture()`: Procedural 2048x1024 celestial sky dome with multi-layer star fields, nebulae, and high-altitude moon.
  - `createScreenTexture()`: Procedural CRT raster graphics for Code, Design, and Explore monitors with vector graphics, typography, and scanlines.
  - `createSteamTexture()`: Soft feathered radial alpha gradient for natural coffee steam wafting.
  - `makeMonitor()`: Parametric CRT monitor chassis builder (bezel, screen plane, button array, LEDs, pedestal swivel base, directional phosphor point lights).
  - `addRoomAndProps()`: Room architecture, physical window frame cutout, solid wooden desk, vintage mechanical keyboard, retro mouse, coffee mug, cassette stacks, articulated desk lamp, trailing ivy vine, and potted plants.
  - `addPerson()`: Full humanoid anatomy (pelvis, glutes, thighs, knees, calves, chunky retro sneakers, oversized hoodie with dropped shoulders and lat-to-arm fill volumes, head, hair, and studio headphones).
- **Procedural Web Audio Engine** (`AudioManager`):
  - Filtered pink/brown noise generator with resonant low-pass filter.
  - Harmonic chord drones (4-oscillator sine bank).
  - Interactive SFX: Hover chime, enter sweep, return drop.
- **Camera & Interaction Controller**:
  - Raycaster-based monitor targeting with screen-space sticky workspace hysteresis.
  - Frame-rate independent damping (`THREE.MathUtils.damp`) for buttery smooth camera gliding.

---

## 3. 3D Coordinate System & Spatial Staging

All coordinates are in Three.js world units (Right-Handed System: +X right, +Y up, +Z towards camera).

### Camera Trajectory Matrix

| Phase | Camera Position (X, Y, Z) | Look Target (X, Y, Z) | Purpose |
| :--- | :--- | :--- | :--- |
| **Room Default (`homeCamera`)** | `(0, 2.80, 9.50)` | `(0, 1.85, -0.15)` | Tight, atmospheric wide view of desk and monitors |
| **Hover `CODE`** | `(-2.20, 2.35, 6.40)` | `(-2.85, 2.05, -0.15)` | Medium inspection zoom angled toward left monitor |
| **Hover `DESIGN`** | `(1.10, 2.40, 6.00)` | `(0.00, 2.05, -0.15)` | Over-the-shoulder inspection of center monitor |
| **Hover `EXPLORE`** | `(2.20, 2.35, 6.40)` | `(2.85, 2.05, -0.15)` | Medium inspection zoom angled toward right monitor |
| **Enter `CODE`** | `(-2.85, 2.05, 1.25)` | `(-2.85, 2.05, -0.15)` | Full immersion glide into CRT glass surface |
| **Enter `DESIGN`** | `(0.00, 2.05, 1.25)` | `(0.00, 2.05, -0.15)` | Full immersion glide into CRT glass surface |
| **Enter `EXPLORE`** | `(2.85, 2.05, 1.25)` | `(2.85, 2.05, -0.15)` | Full immersion glide into CRT glass surface |

### Monitor Layout & V-Formation

- **`CODE` Monitor**: `X: -2.85, Y: 2.05, Z: -0.15`, Rotation `Y: +0.18 rad` (angled inward to center)
- **`DESIGN` Monitor**: `X: 0.00, Y: 2.05, Z: -0.15`, Scale `1.18x`
- **`EXPLORE` Monitor**: `X: +2.85, Y: 2.05, Z: -0.15`, Rotation `Y: -0.18 rad` (angled inward to center)

### Key Prop Anchor Coordinates

- **Coffee Mug**: `X: -1.52, Y: 0.95, Z: 1.55` (Top rim / Steam origin at `Y: 1.39`)
- **Mechanical Keyboard**: `X: 0.00, Y: 0.95, Z: 1.55`
- **Mouse & Pad**: `X: 1.52, Y: 0.94, Z: 1.55`
- **Desk Lamp**: `X: 4.25, Y: 0.94, Z: 0.90` (Point Light at `X: 3.45, Y: 2.70, Z: 1.00`, intensity 3.8)
- **Character & Chair (`silhouetteGroup`)**: `X: 0.00, Y: 0.02, Z: 2.65`

---

## 4. Lighting & Shader Model

1. **Hemisphere Light** (`sky: 0x223355, ground: 0x080c14, intensity: 1.15`): Base fill light preventing crushed blacks.
2. **Directional Moonlight** (`color: 0x90b0e0, intensity: 1.6`): Angled through window cutout (`position: (-6, 8, 4)`).
3. **CRT Monitor Glows**: Three point lights parented to each monitor (`intensity: 2.2 - 2.8, radius: 11.0, decay: 1.3`).
4. **Articulated Desk Lamp**: Warm tungsten point light (`color: 0xffa045, intensity: 3.8, radius: 16.0, decay: 1.2`).
5. **Screen Rim Backlight**: Point light positioned behind character (`color: 0x5a88cc, intensity: 2.2, radius: 5.5`).

---

## 5. Interaction Mechanics & Edge Case Solutions

### Sticky Workspace Hysteresis (Raycast Oscillation Fix)
- **Problem**: When hovering a monitor, the camera pans to center it. The physical cursor (still on the side of the display) loses raycast collision with the moving 3D object, creating an infinite hover/unhover oscillation loop.
- **Solution**:
  - Direct monitor collision immediately triggers that monitor.
  - While in zoom preview, the active monitor is locked as long as the cursor remains within the active desk boundary (`pointer.x in [-0.90, 0.90], pointer.y in [-0.68, 0.72]`).
  - Switching monitors happens seamlessly on direct hit.
  - Moving the cursor to the ceiling, floor, or window edges exits cleanly to `homeCamera` with a 120ms debounce.

### World Entry Transition Timing
- Camera dampening slows to `4.8` during world entry for a smooth cinematic glide.
- The 2D page overlay (`.world-view`) fades in at `500ms` via a custom cubic-bezier curve (`opacity .48s cubic-bezier(.16, 1, 0.3, 1)`), aligning with the camera's arrival at the CRT glass.

---

## 6. Future Roadmap & Next Milestones

When resuming development, the following phases are ready for implementation:

### Phase 1: World Content Implementation
- **`01 CODE` World**:
  - Interactive project catalog, live demo embeds, GitHub API integrations, technical writeups, tech stack tags.
- **`02 DESIGN` World**:
  - High-resolution design portfolio, UI/UX case studies, interactive prototypes, design system documentation.
- **`03 EXPLORE` World**:
  - Interactive experimental creative coding demos, generative art canvas, sound toys, notebooks/essays.

### Phase 2: Enhanced Mobile & Touch Controls
- Add touch drag pan / pinch zoom gestures for mobile devices.
- Bottom sheet navigation support for smaller screens.

### Phase 3: Performance & Asset Optimization
- Texture caching and lazy-loading for heavy assets inside individual world pages.
- Dynamic resolution scaling based on device FPS metrics.

---

## 7. Development Quickstart

To run the project locally:

```bash
# Start local static server
npx -y serve -l 5173 .
```

Open [http://localhost:5173](http://localhost:5173) in any modern WebGL-supported browser.
