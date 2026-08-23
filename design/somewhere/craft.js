// CRAFT — the layer that makes WebGL look like it was made by hand.
//
// Everything visible in SOMEWHERE is built from the six or seven helpers in
// this file, and that is the whole reason the world holds together as one
// object. The style sheet's promise is "all assets share a soft, hand-crafted,
// slightly exaggerated style" — which in a real-time renderer is not a look you
// apply at the end, it is a set of constraints you build every shape inside.
//
// THE FOUR RULES. They are worth stating because breaking any one of them is
// what makes a scene slide into generic low-poly:
//
//   1. NOTHING IS SMOOTH. Every material is roughness 0.9+, metalness 0. There
//      is no specular highlight anywhere in this world except on water.
//   2. NOTHING IS EXACT. Every geometry gets its vertices nudged off the maths
//      by `jitter`, so no two trees are the same tree and no wall is flat.
//   3. NOTHING IS SHARP. Boxes are round-cornered, cones are soft, and the
//      silhouette is always fatter than it needs to be.
//   4. EVERYTHING IS WOVEN. One shared canvas-drawn weave rides on every
//      material as a bump map, which is what stops flat colour reading as
//      plastic. It costs one 256px texture for the entire scene.
//
// WHY NO IMAGE TEXTURES. The references are photographs of felt, and the honest
// way to get felt in a browser is not to download a 2MB fabric photograph — it
// is bump, roughness and a lot of small geometric noise. That keeps this whole
// world inside the vendored three build with no asset payload at all.

import * as THREE from 'three';

/* ══ THE WEAVE ═════════════════════════════════════════════════════════════
   One canvas, drawn once, shared by every material in the scene. It is a
   cross-hatch of short strokes at two angles — not a photograph of cloth, just
   enough directional noise that the lighting breaks up across a surface.

   Drawn at 256 and tiled hard. At the scale these props are seen, a bigger
   texture buys nothing and costs memory on a page that also has to hold three
   other worlds. */
let WEAVE = null;

export function weave() {
  if (WEAVE) return WEAVE;

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#808080';           // neutral: bump reads from the strokes only
  ctx.fillRect(0, 0, size, size);

  // Two passes of short strokes at opposing angles — warp and weft. Low alpha
  // and a lot of them, so the result is a texture rather than a pattern.
  const stroke = (angle, count, alpha) => {
    ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
    ctx.lineWidth = 1;
    for (let i = 0; i < count; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const len = 3 + Math.random() * 5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
      ctx.stroke();
    }
  };

  stroke(0.35, 2600, 0.09);
  stroke(Math.PI / 2 + 0.35, 2600, 0.09);
  stroke(0.35, 1400, 0.05);

  // A sparse speckle of dark flecks — the slubs in a coarse yarn. Without these
  // the weave is too even and starts to read as noise rather than as cloth.
  ctx.fillStyle = 'rgba(0,0,0,0.10)';
  for (let i = 0; i < 900; i++) {
    ctx.fillRect(Math.random() * size, Math.random() * size, 1.5, 1.5);
  }

  WEAVE = new THREE.CanvasTexture(canvas);
  WEAVE.wrapS = WEAVE.wrapT = THREE.RepeatWrapping;
  WEAVE.colorSpace = THREE.NoColorSpace;   // it is a bump map, not a colour
  return WEAVE;
}

/* ══ THE GROUND ═════════════════════════════════════════════════════════════
   The land is the one surface in the world big enough, and looked at closely
   enough, that the shared 256px `weave` reads as noise rather than as fabric —
   at the distance the destinations stand off the ground, its cross-hatch is
   too fine to register as anything but a slight matte roughening. The
   reference gets its "sewn felt panel" read from three things a flat bump
   cannot give it: a visible running stitch holding the panel together, a
   dye that is not perfectly even, and the odd tiny embroidered flower or
   button caught in among the grass. These two textures are that, kept to the
   ground alone so nothing else in the scene pays for them.

   Two canvases rather than one, because they carry different KINDS of
   information: `groundWeave` is luminance only, read as relief (the stitching
   has to visibly sit proud of the cloth), while `groundTint` is colour, read
   as albedo (the dye and the flecks have to be tinted, which a bump map
   cannot do). Multiplying a coloured layer into a bump map would corrupt the
   relief everywhere else that shares the texture; keeping them apart is what
   lets the ground have both without touching `weave` at all. */
let GROUND_WEAVE = null;

export function groundWeave() {
  if (GROUND_WEAVE) return GROUND_WEAVE;

  const size = 384;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);

  // The same cross-hatch weave as the shared texture, so the ground still
  // reads as the same cloth as everything standing on it.
  const hatch = (angle, count, alpha, len0, len1) => {
    ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
    ctx.lineWidth = 1;
    for (let i = 0; i < count; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const len = len0 + Math.random() * (len1 - len0);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
      ctx.stroke();
    }
  };
  hatch(0.35, 5200, 0.08, 3, 8);
  hatch(Math.PI / 2 + 0.35, 5200, 0.08, 3, 8);

  /* THE SEAM LINES. A loose grid of long dashed strokes at the two diagonals
     a running stitch actually takes across a panel — raised, not printed, so
     it is drawn brighter than the base rather than as a dark line. Irregular
     spacing and a little jitter on every dash keeps it from reading as a
     ruled grid; a perfectly even one is the fastest way to make hand-sewn
     cloth look like graph paper. */
  const seam = (angle) => {
    ctx.strokeStyle = 'rgba(255,255,255,0.30)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([5, 4]);
    const step = 46;
    const c = Math.cos(angle), s = Math.sin(angle);
    for (let o = -size; o < size * 2; o += step + (Math.random() - 0.5) * 10) {
      ctx.beginPath();
      ctx.moveTo(o * c - size * s, o * s + size * c);
      ctx.lineTo(o * c + size * 2 * s, o * s - size * 2 * c);
      ctx.stroke();
    }
  };
  seam(0.42);

  // Slubs and grit — the same speckle as the shared weave, doubled up since
  // this canvas is seen at closer range.
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(0,0,0,0.11)';
  for (let i = 0; i < 1800; i++) {
    ctx.fillRect(Math.random() * size, Math.random() * size, 1.5, 1.5);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  for (let i = 0; i < 900; i++) {
    ctx.fillRect(Math.random() * size, Math.random() * size, 1.2, 1.2);
  }

  GROUND_WEAVE = new THREE.CanvasTexture(canvas);
  GROUND_WEAVE.wrapS = GROUND_WEAVE.wrapT = THREE.RepeatWrapping;
  GROUND_WEAVE.colorSpace = THREE.NoColorSpace;
  return GROUND_WEAVE;
}

let GROUND_TINT = null;

export function groundTint() {
  if (GROUND_TINT) return GROUND_TINT;

  const size = 384;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  // White, so multiplying this over the vertex colour changes nothing by
  // default — everything below is a departure from that, kept small.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  // THE UNEVEN DYE. A handful of large, very soft blobs, alternately a shade
  // warmer and a shade cooler than plain white. Individually invisible; in
  // aggregate the ground stops being one flat colour under its vertex paint.
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = size * (0.14 + Math.random() * 0.20);
    const warm = Math.random() < 0.5;
    const tint = warm ? '46,38,20' : '20,34,42';
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(${tint},0.05)`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  /* THE STITCHING, in colour this time — a warm thread tone along the same
     seam lines `groundWeave` raises, so the relief and the colour agree with
     each other instead of the panel looking sewn from one angle and painted
     from another. */
  ctx.strokeStyle = 'rgba(84,64,36,0.16)';
  ctx.lineWidth = 1.4;
  ctx.setLineDash([5, 4]);
  const step = 46;
  const angle = 0.42;
  const c = Math.cos(angle), s = Math.sin(angle);
  for (let o = -size; o < size * 2; o += step) {
    ctx.beginPath();
    ctx.moveTo(o * c - size * s, o * s + size * c);
    ctx.lineTo(o * c + size * 2 * s, o * s - size * 2 * c);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  /* THE EMBROIDERED FLECKS. Tiny, sparse, low-alpha dots in the style
     sheet's accent hues — a flower or a button caught in the weave, seen
     from far enough back that it is texture rather than a prop. Real flower
     geometry already exists for the ones close to a path; this is the
     ambient scatter of the ones that are not. */
  const flecks = ['214,72,60', '212,127,150', '79,127,181', '217,164,65', '255,255,255'];
  for (let i = 0; i < 46; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 1.1 + Math.random() * 1.3;
    ctx.fillStyle = `rgba(${flecks[i % flecks.length]},${0.34 + Math.random() * 0.22})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  GROUND_TINT = new THREE.CanvasTexture(canvas);
  GROUND_TINT.wrapS = GROUND_TINT.wrapT = THREE.RepeatWrapping;
  GROUND_TINT.colorSpace = THREE.SRGBColorSpace;
  return GROUND_TINT;
}

/* ══ THE WAVES ═════════════════════════════════════════════════════════════
   White stitched arcs on blue — the water in every reference image is a sheet
   of fabric with waves embroidered onto it, and this is that pattern.

   IT HAS TO BE A TEXTURE. An earlier version painted these into the sea
   sphere's vertex colours, which failed for a reason worth recording: the wave
   lines are much finer than the mesh, so the colour snapped to whatever
   vertices happened to be nearby and the ocean came out covered in white
   rectangles. A texture is resolution-independent and costs one 512px canvas. */
let WAVES = null;

export function waves() {
  if (WAVES) return WAVES;

  const size = 768;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';        // white = untouched water; everything below is dyed on top
  ctx.fillRect(0, 0, size, size);

  /* THE CLOTH ITSELF, before a single wave is stitched on it. A fine
     diagonal cross-hatch, exactly the logic of `weave` but drawn straight
     into the colour map instead of a bump — the reference water is visibly
     woven fabric even in the flat stretches between wave lines, which a bump
     map alone under a low sun angle cannot promise. Very low alpha: this has
     to stay a texture, not a pattern that competes with the stitching. */
  const hatch = (angle, count, alpha) => {
    ctx.strokeStyle = `rgba(20,50,70,${alpha})`;
    ctx.lineWidth = 1;
    for (let i = 0; i < count; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const len = 4 + Math.random() * 7;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
      ctx.stroke();
    }
  };
  hatch(0.4, 5000, 0.05);
  hatch(Math.PI / 2 + 0.4, 5000, 0.05);

  // Rows of short arcs, offset every other row and jittered, so it reads as
  // handwork rather than as a repeating motif. The tile has to wrap, so every
  // arc that crosses an edge is drawn again on the far side. Dashed rather
  // than solid, and drawn twice — a soft pale pass under a crisper white one
  // — so each arc reads as thread catching the light rather than as a drawn
  // line.
  const arc = (x, y, r, a) => {
    ctx.beginPath();
    ctx.arc(x, y, r, Math.PI + a, Math.PI * 2 - a);
    ctx.stroke();
  };

  const rows = 11;
  const seeds = [];
  for (let r = 0; r < rows; r++) {
    const y = (r + 0.5) * (size / rows);
    const n = 6 + (r % 2);
    for (let i = 0; i < n; i++) {
      const x = ((i + (r % 2) * 0.5) / n) * size + (Math.random() - 0.5) * 26;
      const rad = 22 + Math.random() * 18;
      const spread = 0.5 + Math.random() * 0.35;
      seeds.push({ x, y, rad, spread });
    }
  }

  ctx.lineCap = 'round';
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(140,182,208,0.55)';
  ctx.lineWidth = 5;
  seeds.forEach(({ x, y, rad, spread }) => {
    arc(x, y, rad, spread);
    if (x < rad + 4) arc(x + size, y, rad, spread);
    if (x > size - rad - 4) arc(x - size, y, rad, spread);
  });

  ctx.setLineDash([4, 3.5]);
  ctx.strokeStyle = 'rgba(232,244,250,0.92)';
  ctx.lineWidth = 2.2;
  seeds.forEach(({ x, y, rad, spread }) => {
    arc(x, y, rad, spread);
    if (x < rad + 4) arc(x + size, y, rad, spread);
    if (x > size - rad - 4) arc(x - size, y, rad, spread);
  });
  ctx.setLineDash([]);

  /* THE FOAM. A few of the wave crests get a little cluster of french-knot
     puffs at each end — the felt-ball foam the reference draws where water
     meets a rock or a shore, scattered thinly enough here that most crests
     stay plain stitched thread. */
  const knot = (x, y, r) => {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(180,205,220,0.4)';
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.4, 0, Math.PI * 2);
    ctx.fill();
  };
  seeds.filter(() => Math.random() < 0.22).forEach(({ x, y, rad, spread }) => {
    const end = Math.random() < 0.5 ? -1 : 1;
    const ex = x + Math.cos(Math.PI - spread * end) * rad;
    const ey = y + Math.sin(Math.PI - spread * end) * rad;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      knot(ex + (Math.random() - 0.5) * 10, ey + (Math.random() - 0.5) * 6, 2 + Math.random() * 2.4);
    }
  });

  WAVES = new THREE.CanvasTexture(canvas);
  WAVES.wrapS = WAVES.wrapT = THREE.RepeatWrapping;
  WAVES.colorSpace = THREE.SRGBColorSpace;
  return WAVES;
}

/* ══ THE FABRIC SHADER ══════════════════════════════════════════════════════
   The ground is cloth, and this is what makes it cloth rather than a green
   polygon with lines drawn on it.

   WHY A SHADER AND NOT A TEXTURE, in one number. The land is a sphere of
   radius 10, so it is about 63 units around. A canvas tiled `repeat: 18` — the
   old value — puts one tile every 3.5 world units, and a destination camera
   sees roughly five units across. That is a weave with about one and a half
   threads on screen: the stitches came out metres apart and read exactly like
   what they were, a pattern stretched over a polygon. Tiling hard enough to
   read as fabric up close (repeat ≈ 300) then moirés into grey noise from
   orbit, and drags the equirectangular UV's pole pinch and seam into view.

   So the weave is computed in WORLD SPACE instead, from the fragment's own
   position. There is no UV, so there is no seam and no pole; thread density is
   the same everywhere by construction; and the frequency can be chosen for the
   close camera without the far view paying for it, because the fine terms fade
   out on their own (see `lod` below).

   TRIPLANAR, AND THE WEAVE DIRECTION IS THE POINT. Sampling on all three world
   axes and blending by the normal means the thread direction turns as the
   surface turns — a hillside and the flat below it are woven at different
   angles. On a real object that would be wrong. On this one it is the whole
   look: the reference is a model assembled from separate panels of cloth, and
   panels do not share a grain.

   Cost is a handful of sin/fract per fragment and no loops or texture fetches. */
const FABRIC_PARS = /* glsl */`
  varying vec3 vFabWorld;
  varying vec3 vFabNormalW;
  uniform float uFabThread;   // threads per world unit
  uniform float uFabSeam;     // threads between stitched seams
  uniform float uFabRelief;   // how far the weave bends the normal
  uniform float uFabDye;      // how far the dye wanders off the vertex colour

  float fabHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float fabNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(fabHash(i), fabHash(i + vec2(1.0, 0.0)), f.x),
               mix(fabHash(i + vec2(0.0, 1.0)), fabHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  /* One plane's worth of cloth: .x is surface height, .y is how much of this
     fragment is stitch rather than cloth.

     THE TWO COME BACK SEPARATELY because they are not the same kind of thing.
     Height only ever bends the light; the stitch also has its own colour — it
     is a different thread from the panel it is holding down — and a seam that
     is merely raised reads as a crease rather than as sewing. */
  vec2 fabPlane(vec2 uv, float lod) {
    vec2 t = uv * uFabThread;
    float warp = abs(sin(t.x * 3.14159));
    float weft = abs(sin(t.y * 3.14159));
    float over = mod(floor(t.x) + floor(t.y), 2.0);
    float h = mix(warp, weft, over) * 0.55;

    // Slubs: the thick and thin places in a hand-spun yarn.
    h += (fabNoise(t * 0.35) - 0.5) * 0.30;
    // Fibre fuzz, the finest term and the first to go at distance.
    h += (fabNoise(t * 3.1) - 0.5) * 0.22 * lod;

    /* THE SEAMS. A running stitch along a coarse grid — dashed, because a
       continuous line is a pipe and a dashed one is thread. The dash phase is
       offset by the perpendicular cell so neighbouring runs do not start
       together and betray the grid underneath them. */
    vec2 s = t / uFabSeam;
    vec2 cell = floor(s);
    vec2 d = abs(fract(s) - 0.5);
    float dashX = step(0.38, fract(t.y * 0.42 + cell.x * 0.37));
    float dashY = step(0.38, fract(t.x * 0.42 + cell.y * 0.61));
    /* THE LINE HAS TO BE THREAD-WIDTH, and that is measured in threads, not in
       seam cells: at a seam every 26 threads a line 0.045 of a cell across is
       more than a thread thick and comes out as chalk. A couple of thread
       widths is what sewing looks like. */
    float wide = 2.2 / uFabSeam;
    float seam = smoothstep(wide, wide * 0.25, d.x) * dashX
               + smoothstep(wide, wide * 0.25, d.y) * dashY;
    seam = clamp(seam, 0.0, 1.0);
    h += seam * 0.45;
    return vec2(h, seam);
  }

  /* The full triplanar cloth at a world point. */
  vec2 fabHeight(vec3 p, vec3 n, float lod) {
    vec3 w = pow(abs(n), vec3(4.0));
    w /= max(w.x + w.y + w.z, 1e-4);
    return fabPlane(p.yz, lod) * w.x
         + fabPlane(p.zx, lod) * w.y
         + fabPlane(p.xy, lod) * w.z;
  }
`;

const FABRIC_VERT = /* glsl */`
  vFabWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vFabNormalW = normalize(mat3(modelMatrix) * normal);
`;

const FABRIC_FRAG = /* glsl */`
  {
    /* DETAIL FADE. fwidth() is how much the world position changes across one
       pixel, so it is exactly the footprint the weave has to survive. Once a
       thread is thinner than a pixel, keeping it produces shimmer rather than
       cloth, so the fine terms are faded out and the surface returns to plain
       shading — which is what the distant planet wants anyway. */
    float foot = length(fwidth(vFabWorld)) * uFabThread;
    float lod = clamp(1.0 - foot * 0.9, 0.0, 1.0);

    if (lod > 0.001) {
      vec3 nW = normalize(vFabNormalW);
      vec2 cloth = fabHeight(vFabWorld, nW, lod);
      float h = cloth.x;
      float seam = cloth.y * lod;

      /* THE NORMAL, TAKEN FROM THE HEIGHT'S OWN SLOPE. Screen-space
         derivatives give the gradient for free and need no tangent frame,
         which this geometry does not have — the land has no UVs worth
         speaking of and no tangents at all. */
      vec3 dpx = dFdx(vFabWorld);
      vec3 dpy = dFdy(vFabWorld);
      float dhx = dFdx(h);
      float dhy = dFdy(h);
      vec3 bump = cross(dpy, normal) * dhx + cross(normal, dpx) * dhy;
      float bl = length(bump);
      if (bl > 1e-6) {
        normal = normalize(normal + (bump / bl) * uFabRelief * lod);
      }

      /* THE DYE. Cloth is never one colour: a low-frequency wander plus the
         weave's own shading, both kept small so the terrain painting in the
         vertex colours still decides what this ground IS. */
      float dye = fabNoise(vFabWorld.xz * 0.8) * 0.6
                + fabNoise(vFabWorld.yx * 1.7) * 0.4;
      float shade = 1.0 + (h - 0.5) * 0.16 * lod;
      diffuseColor.rgb *= shade * (1.0 + (dye - 0.5) * uFabDye);

      /* THE THREAD'S OWN COLOUR. Warm and pale, lifted towards the cream the
         reference sews everything with, and blended in by how much stitch is
         actually here. This is what turns a raised crease into sewing. */
      vec3 thread = vec3(0.86, 0.80, 0.66);
      diffuseColor.rgb = mix(diffuseColor.rgb,
                             diffuseColor.rgb * 0.72 + thread * 0.30,
                             seam * 0.34);

      // Roughness follows the weave, so the crowns of the threads catch a
      // fraction more light than the troughs between them.
      roughnessFactor = clamp(roughnessFactor - (h - 0.5) * 0.10 * lod, 0.55, 1.0);
    }
  }
`;

/* Turn any MeshStandardMaterial into cloth. Returns the same material. */
export function makeFabric(mat, {
  thread = 26,    // threads per world unit
  seam = 30,      // threads between stitched seams
  relief = 0.55,  // how far the weave bends the normal
  dye = 0.10,     // how far the dye wanders
  key = 'fabric',
} = {}) {
  const u = {
    uFabThread: { value: thread },
    uFabSeam: { value: seam },
    uFabRelief: { value: relief },
    uFabDye: { value: dye },
  };
  mat.userData.fabric = u;

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n varying vec3 vFabWorld;\n varying vec3 vFabNormalW;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${FABRIC_VERT}`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FABRIC_PARS}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${FABRIC_FRAG}`);
  };

  /* Without this every fabric material shares three's default cache key and
     the first compiled variant is silently reused for all of them. */
  mat.customProgramCacheKey = () => key;
  mat.needsUpdate = true;
  return mat;
}

/* ══ MATERIALS ═════════════════════════════════════════════════════════════
   Five of them, and every object in the world is made of one. They are cached
   by their arguments: a scene with four hundred trees in it should have ONE
   leaf material, not four hundred, or the renderer recompiles a shader per
   tree and the frame budget is gone before anything moves. */
const CACHE = new Map();

const cached = (key, make) => {
  if (!CACHE.has(key)) CACHE.set(key, make());
  return CACHE.get(key);
};

/* FELT — the default. Grass, canopies, snow, cloth, clouds. Fully rough, bump
   from the weave, flat-shaded so the facets catch the light like stitched
   panels rather than like a smooth balloon. */
export function felt(color, { flat = true, bump = 0.06, rough = 0.98, repeat = 3 } = {}) {
  return cached(`felt:${color}:${flat}:${bump}:${rough}:${repeat}`, () => {
    const map = weave().clone();
    map.repeat.set(repeat, repeat);
    map.needsUpdate = true;
    return new THREE.MeshStandardMaterial({
      color,
      roughness: rough,
      metalness: 0,
      flatShading: flat,
      bumpMap: map,
      bumpScale: bump,
    });
  });
}

/* PAINTED WOOD — planks, hulls, bridges, roofs. Very slightly less rough than
   felt and smooth-shaded, which is the whole difference between a thing that
   was sewn and a thing that was painted. */
export function painted(color, { rough = 0.86, bump = 0.03 } = {}) {
  return cached(`paint:${color}:${rough}:${bump}`, () => {
    const map = weave().clone();
    map.repeat.set(2, 2);
    map.needsUpdate = true;
    return new THREE.MeshStandardMaterial({
      color,
      roughness: rough,
      metalness: 0,
      flatShading: false,
      bumpMap: map,
      bumpScale: bump,
    });
  });
}

/* CLAY / ROCK — the mountain, the cliffs, the stones. Flat-shaded hard so the
   facets are the form, and a stronger bump than anything else in the world. */
export function clay(color, { rough = 0.95 } = {}) {
  return cached(`clay:${color}:${rough}`, () => {
    const map = weave().clone();
    map.repeat.set(5, 5);
    map.needsUpdate = true;
    return new THREE.MeshStandardMaterial({
      color,
      roughness: rough,
      metalness: 0,
      flatShading: true,
      bumpMap: map,
      bumpScale: 0.12,
    });
  });
}

/* WATER — the one thing in this world allowed to shine, and only a little. The
   reference water is fabric with white stitched waves on it, not glass, so the
   roughness stays high and the highlight stays broad.

   It gets the shared weave as a bump, same as every other material in the
   world — water was the one surface that had been left perfectly smooth
   underneath its wave stitching, which is what let it read as paint rather
   than as the same dyed cloth the land is cut from. */
export function water(color, { rough = 0.34, opacity = 1 } = {}) {
  return cached(`water:${color}:${rough}:${opacity}`, () => {
    const map = weave().clone();
    map.repeat.set(10, 10);
    map.needsUpdate = true;
    return new THREE.MeshStandardMaterial({
      color,
      roughness: rough,
      metalness: 0.06,
      flatShading: true,
      transparent: opacity < 1,
      opacity,
      bumpMap: map,
      bumpScale: 0.028,
    });
  });
}

/* GLOW — window light, lamp cores, the lighthouse lens. Unlit on purpose:
   these are the only things in the world that are a light SOURCE rather than a
   surface, and shading them would make them grey out at night, which is
   exactly when they matter. */
export function glow(color, { opacity = 1 } = {}) {
  return cached(`glow:${color}:${opacity}`, () => new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    toneMapped: false,
  }));
}

/* Drop every cached material and the weave. Called when the world unmounts —
   the design section keeps three other worlds alive and this one must not leave
   forty compiled shaders behind it. */
export function disposeCraft() {
  CACHE.forEach((mat) => {
    mat.bumpMap?.dispose?.();
    mat.dispose();
  });
  CACHE.clear();
  WEAVE?.dispose();
  WEAVE = null;
}

/* ══ IMPERFECTION ══════════════════════════════════════════════════════════
   Rule 2, as a function. Every vertex is pushed off the maths by a small
   deterministic amount, so a sphere becomes a hand-rolled ball and a cylinder
   becomes a whittled post.

   DETERMINISTIC is the important word. A random jitter per mount means the
   world is a different world every time the visitor arrives, and the whole
   premise is that this is one physical model that exists. `seed` fixes it. */
export function jitter(geo, amount = 0.03, seed = 1) {
  const pos = geo.attributes.position;
  let s = seed * 9301 + 49297;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280 - 0.5;
  };
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(
      i,
      pos.getX(i) + rnd() * amount,
      pos.getY(i) + rnd() * amount,
      pos.getZ(i) + rnd() * amount,
    );
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/* ══ SHAPES ════════════════════════════════════════════════════════════════
   The vocabulary. Six primitives, and between them they build the entire
   world — which is the point: a world assembled from six shapes reads as one
   set of hands, and a world assembled from thirty reads as an asset store. */

/* A hand-rolled ball. The base of every canopy, cloud puff, head and boulder. */
export function blob(radius = 1, detail = 1, wob = 0.09, seed = 1) {
  const geo = new THREE.IcosahedronGeometry(radius, detail);
  jitter(geo, radius * wob, seed);
  return geo;
}

/* A soft-cornered box. Everything built rather than grown: walls, planks,
   crates, carriages. `r` is how much the corners are eaten back — the default
   is generous because rule 3 says the silhouette should always be fatter and
   softer than the drawing. */
export function softBox(w = 1, h = 1, d = 1, r = 0.12, seed = 1) {
  const seg = 2;
  const geo = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
  // Pull every vertex towards the box's centre in proportion to how close it is
  // to a corner. Cheap round-over: no CSG, no bevel modifier, one pass.
  const pos = geo.attributes.position;
  const half = new THREE.Vector3(w / 2, h / 2, d / 2);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const k = Math.min(r, half.x, half.y, half.z);
    v.x -= Math.sign(v.x) * (Math.abs(v.x) === half.x ? k * 0.5 : 0);
    v.y -= Math.sign(v.y) * (Math.abs(v.y) === half.y ? k * 0.5 : 0);
    v.z -= Math.sign(v.z) * (Math.abs(v.z) === half.z ? k * 0.5 : 0);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  jitter(geo, Math.min(w, h, d) * 0.02, seed);
  return geo;
}

/* A whittled post — trunks, masts, lamp columns, pilings. Tapered by default,
   because a perfectly parallel cylinder is the single most machine-looking
   shape there is. */
export function post(rTop = 0.1, rBot = 0.14, h = 1, seg = 7, seed = 1) {
  const geo = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1);
  jitter(geo, rBot * 0.10, seed);
  return geo;
}

/* A soft cone — conifer tiers, roofs, mountain peaks. */
export function cone(r = 1, h = 1.6, seg = 8, seed = 1) {
  const geo = new THREE.ConeGeometry(r, h, seg, 1);
  jitter(geo, r * 0.07, seed);
  return geo;
}

/* ══ PLACEMENT ON A SPHERE ═════════════════════════════════════════════════
   The whole world is a ball, so "put this here" is never an (x, y, z) — it is a
   latitude, a longitude and a height above the surface. These three helpers are
   used by every single prop placement in the world, which is why the terrain
   can be re-scaled and everything on it stays put. */

/* Degrees on the sphere → a point in world space. */
export function onSphere(lat, lon, radius) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon);
  return new THREE.Vector3(
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

/* Stand an object on the surface: move it to the point AND tip it so its own
   up-axis is the sphere's normal there. Without the second half, a tree at the
   equator grows sideways out of the planet. */
const UP = new THREE.Vector3(0, 1, 0);

export function standOn(obj, lat, lon, radius, spin = 0) {
  const p = onSphere(lat, lon, radius);
  obj.position.copy(p);
  obj.quaternion.setFromUnitVectors(UP, p.clone().normalize());
  if (spin) obj.rotateY(spin);
  return obj;
}

/* ══ WHICH WAY IS FORWARD ═══════════════════════════════════════════════════
   The spin that makes an object standing at `at` face towards `toward`, such
   that its local +X points that way.

   +X IS THE CONVENTION, and this function is the only place it is decided.
   Everything that has a front — the locomotive, the carriages, the boats, the
   pier running out to sea — is modelled nose-along-+X and oriented through
   here, so there is exactly one definition of "forward" in the world.

   WHY THIS IS NOT `atan2(f·north, f·east)`. That is the compass bearing, and
   it is only the right spin if the object's local +X happens to start out
   pointing due east — which it does not. `standOn` orients by the SHORTEST ARC
   from world-up to the surface normal, and the tangent frame that falls out of
   that is rotated by an amount which depends on where you are on the sphere.
   So the offset between the compass bearing and the object's actual +X is not
   a constant, and no constant correction can fix it: a half-turn that squares
   the train up at one end of the line has it running backwards at the other.

   What is measured here instead is the signed angle from where local +X
   ACTUALLY points at spin zero, round to where we want it, about the surface
   normal. That is exact everywhere, and it is why the direction has to be
   projected into the tangent plane first — over a long span `toward - at` dips
   below the horizon, and the component pointing into the ground is not part of
   any heading. */
export function headingTo(at, toward) {
  const n = at.clone().normalize();
  // Where local +X points before any spin is applied.
  const x0 = new THREE.Vector3(1, 0, 0)
    .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, n));
  // The wanted direction, flattened onto the surface.
  const f = toward.clone().sub(at);
  f.addScaledVector(n, -f.dot(n));
  if (f.lengthSq() < 1e-12) return 0;
  f.normalize();
  const cross = new THREE.Vector3().crossVectors(x0, f);
  return Math.atan2(cross.dot(n), x0.dot(f));
}

/* The same thing for an InstancedMesh, which has matrices rather than objects.
   Returns the matrix so the caller can hand it straight to `setMatrixAt`. */
const _o = new THREE.Object3D();

export function surfaceMatrix(lat, lon, radius, { scale = 1, spin = 0, tilt = 0 } = {}) {
  standOn(_o, lat, lon, radius, spin);
  if (tilt) _o.rotateX(tilt);
  _o.scale.setScalar(scale);
  _o.updateMatrix();
  return _o.matrix.clone();
}

/* ══ A SEEDED RANDOM ═══════════════════════════════════════════════════════
   Used by every scatter in the world for the same reason `jitter` is seeded:
   the diorama is a specific object, not a fresh procedural generation on every
   page load. Somebody who leaves and comes back must find the same trees. */
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}
