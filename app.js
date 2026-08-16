import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const canvas = document.querySelector('#scene');
const body = document.body;
const buttons = [...document.querySelectorAll('.world-button')];
const pages = [...document.querySelectorAll('.world-view')];
const audioToggleBtn = document.querySelector('#audio-toggle');
const audioLabel = document.querySelector('.audio-label');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// --- HIGH PERFORMANCE WEBGL RENDERER CONFIGURATION ---
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
  precision: 'mediump',
  stencil: false,
  depth: true,
  alpha: false
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x03050a, 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x050714, 0.022);

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 80);
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(3, 3);

// --- CAMERA STAGING & INTERACTION COORDINATES ---
const homeCamera = new THREE.Vector3(0, 2.8, 9.5);
const homeLook = new THREE.Vector3(0, 1.85, -0.15);
const cameraGoal = homeCamera.clone();
const lookGoal = homeLook.clone();
const lookNow = homeLook.clone();

let hovered = null;
let entering = false;
let silhouetteGroup = null;
let silhouetteFadeAmount = 0;

const monitorSpecs = [
  {
    id: 'code',
    x: -2.85,
    ry: 0.18,
    color: 0x8eff56,
    hoverCamera: new THREE.Vector3(-2.20, 2.35, 6.40),
    hoverLook: new THREE.Vector3(-2.85, 2.05, -0.15),
    enterCamera: new THREE.Vector3(-2.85, 2.125, 2.55)
  },
  {
    id: 'design',
    x: 0,
    color: 0x5aa2ff,
    hoverCamera: new THREE.Vector3(1.10, 2.40, 6.00),
    hoverLook: new THREE.Vector3(0, 2.05, -0.15),
    enterCamera: new THREE.Vector3(0, 2.125, 2.55)
  },
  {
    id: 'explore',
    x: 2.85,
    ry: -0.18,
    color: 0xff9158,
    hoverCamera: new THREE.Vector3(2.20, 2.35, 6.40),
    hoverLook: new THREE.Vector3(2.85, 2.05, -0.15),
    enterCamera: new THREE.Vector3(2.85, 2.125, 2.55)
  }
];

const monitorTargets = [];

// --- GEOMETRIC PRIMITIVE HELPERS ---
function box(w, h, d, material, pos, parent = scene, castShadow = true, receiveShadow = true) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(pos);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  parent.add(mesh);
  return mesh;
}

function cyl(rTop, rBot, h, segs, material, pos, parent = scene, rot = null) {
  const geo = new THREE.CylinderGeometry(rTop, rBot, h, segs);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(pos);
  if (rot) mesh.rotation.copy(rot);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

// The character + chair are ~30 overlapping capsules/spheres/boxes, which makes
// every "fade the figure out" approach fail in its own way:
//
//  - Tweening each material's .opacity turns the figure into an x-ray of its
//    own component parts, because every overlapping layer blends through.
//  - A Fresnel rim term (the previous fix) fails more subtly: every primitive
//    contributes its OWN rim, so the interior fills with the outlines of
//    individual body parts — the "bubbles" of arm/shoulder/skull ellipsoids.
//
// Overlapping primitives only read as one shape if each pixel is blended
// exactly once, in exactly one colour. Two halves to that:
//
//  1. A depth pre-pass (built at init, below) writes the nearest silhouette
//     surface's depth with colour writes off; the real materials then draw with
//     depthWrite off, so every fragment behind that nearest surface fails the
//     depth test and never blends. One blend per pixel — no stacking, so no
//     seams where parts intersect and no darker patches where they overlap.
//  2. This shader patch collapses each part's shaded colour toward a single
//     flat silhouette tint and a single shared alpha as the fade rises, so the
//     one surviving layer is uniform across the whole figure. The only edge
//     left anywhere is the outer boundary against the background.
const SILHOUETTE_TINT = 'vec3(0.016, 0.020, 0.030)';
const SILHOUETTE_MIN_ALPHA = 0.72; // translucent, deliberately not see-through

function applySilhouetteFade(material) {
  // Depth is owned entirely by the pre-pass proxies; if these wrote depth too
  // they would occlude each other and reintroduce per-primitive edges.
  material.transparent = true;
  material.opacity = 1;
  material.depthWrite = false;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFadeAmount = { value: 0 };
    material.userData.shader = shader;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uFadeAmount;`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
float fade = clamp(uFadeAmount, 0.0, 1.0);
// Colour flattens well ahead of the alpha so no part's own material (skin,
// oak, sole white) is ever recognisable through the translucent figure.
float tint = smoothstep(0.0, 0.30, fade);
gl_FragColor.rgb = mix(gl_FragColor.rgb, ${SILHOUETTE_TINT}, tint);
gl_FragColor.a *= mix(1.0, ${SILHOUETTE_MIN_ALPHA.toFixed(2)}, fade);`);
  };
  material.needsUpdate = true;
}

// --- SEAMLESS HIGH-RESOLUTION CELESTIAL SKY GENERATOR (TRUE INFINITE PARALLAX) ---
function createCosmicBackdropTexture() {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 1024;
  const ctx = c.getContext('2d');

  // Deep midnight cosmic atmospheric gradient
  const bgGrad = ctx.createLinearGradient(0, 0, 0, 1024);
  bgGrad.addColorStop(0, '#010308');
  bgGrad.addColorStop(0.3, '#030616');
  bgGrad.addColorStop(0.65, '#070b22');
  bgGrad.addColorStop(1, '#0c0b26');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 2048, 1024);

  // Layered Cosmic Nebula Clouds (calibrated for top-right window view at z = -36)
  const nebulae = [
    { x: 1350, y: 380, rx: 500, ry: 240, color: 'rgba(145, 32, 110, 0.45)', rot: -0.22 },
    { x: 1420, y: 340, rx: 380, ry: 180, color: 'rgba(75, 28, 135, 0.58)', rot: -0.15 },
    { x: 1280, y: 440, rx: 350, ry: 150, color: 'rgba(32, 70, 145, 0.48)', rot: -0.28 },
    { x: 1520, y: 280, rx: 260, ry: 120, color: 'rgba(210, 80, 155, 0.38)', rot: -0.1 },
    { x: 650, y: 420, rx: 420, ry: 200, color: 'rgba(35, 45, 110, 0.32)', rot: 0.15 },
    { x: 500, y: 320, rx: 280, ry: 130, color: 'rgba(55, 25, 90, 0.25)', rot: 0.1 }
  ];

  nebulae.forEach(n => {
    ctx.save();
    ctx.translate(n.x, n.y);
    ctx.rotate(n.rot);
    ctx.scale(n.rx, n.ry);
    const rad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    rad.addColorStop(0, n.color);
    rad.addColorStop(0.5, n.color.replace(/[\d\.]+\)$/, '0.18)'));
    rad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rad;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  // Dense Multi-Temperature Starfield (1500+ stars)
  const starColors = ['#ffffff', '#e6f0ff', '#fff0d0', '#c8f4ff', '#ffdaf4', '#b0d0ff'];
  for (let i = 0; i < 1500; i++) {
    const sx = Math.random() * 2048;
    const sy = Math.random() * 950;
    const sRad = Math.random() * 1.6 + 0.35;
    const alpha = Math.random() * 0.85 + 0.15;
    const color = starColors[Math.floor(Math.random() * starColors.length)];

    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(sx, sy, sRad, 0, Math.PI * 2);
    ctx.fill();

    if (sRad > 1.4 && Math.random() > 0.55) {
      ctx.globalAlpha = 0.28;
      ctx.beginPath();
      ctx.arc(sx, sy, sRad * 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1.0;

  // Prominent Anchor Stars with Optical Diffraction Spikes
  const anchorStars = [
    { x: 1250, y: 240, r: 3.0 },
    { x: 1480, y: 390, r: 2.6 },
    { x: 880, y: 260, r: 2.4 },
    { x: 420, y: 200, r: 2.7 }
  ];
  anchorStars.forEach(st => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(st.x - 16, st.y); ctx.lineTo(st.x + 16, st.y);
    ctx.moveTo(st.x, st.y - 16); ctx.lineTo(st.x, st.y + 16);
    ctx.stroke();
  });

  // Photorealistic Shaded Moon (calibrated for top-left window view at z = -36)
  const mx = 700;
  const my = 290;
  const mr = 85;

  // Atmospheric lunar glow halo
  const moonGlow = ctx.createRadialGradient(mx, my, mr * 0.75, mx, my, mr * 3.4);
  moonGlow.addColorStop(0, 'rgba(215, 235, 255, 0.42)');
  moonGlow.addColorStop(0.35, 'rgba(150, 190, 255, 0.22)');
  moonGlow.addColorStop(0.75, 'rgba(95, 140, 250, 0.06)');
  moonGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = moonGlow;
  ctx.beginPath();
  ctx.arc(mx, my, mr * 3.4, 0, Math.PI * 2);
  ctx.fill();

  // Moon spherical base disc with limb darkening
  const moonDisc = ctx.createRadialGradient(mx - 22, my - 20, mr * 0.1, mx, my, mr);
  moonDisc.addColorStop(0, '#ffffff');
  moonDisc.addColorStop(0.55, '#ede6d8');
  moonDisc.addColorStop(0.85, '#cfc6b4');
  moonDisc.addColorStop(1, '#9a9486');
  ctx.fillStyle = moonDisc;
  ctx.beginPath();
  ctx.arc(mx, my, mr, 0, Math.PI * 2);
  ctx.fill();

  // Detailed lunar maria & surface craters
  ctx.fillStyle = 'rgba(110, 105, 96, 0.38)';
  const craters = [
    { x: -22, y: -14, r: 21 }, { x: 15, y: -26, r: 16 }, { x: 26, y: 10, r: 25 },
    { x: -10, y: 22, r: 19 }, { x: -32, y: 10, r: 14 }, { x: 10, y: 32, r: 12 },
    { x: 34, y: -10, r: 13 }, { x: -14, y: -36, r: 9 }, { x: 18, y: -6, r: 8 }
  ];
  craters.forEach(cr => {
    ctx.beginPath();
    ctx.arc(mx + cr.x, my + cr.y, cr.r, 0, Math.PI * 2);
    ctx.fill();
  });

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

// --- ULTRA-DETAILED PIXEL-PERFECT CRT TEXTURE ENGINE ---
function createScreenTexture(id, color) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 768;
  const bctx = c.getContext('2d');
  const css = `#${new THREE.Color(color).getHexString()}`;

  if (id === 'code') {
    // === CODE SCREEN (Pixel-perfect Green Terminal) ===
    const grad = bctx.createRadialGradient(512, 384, 60, 512, 384, 620);
    grad.addColorStop(0, '#0e341b');
    grad.addColorStop(0.5, '#051d0d');
    grad.addColorStop(1, '#020d06');
    bctx.fillStyle = grad;
    bctx.fillRect(0, 0, 1024, 768);

    // Matrix background data lines
    bctx.fillStyle = 'rgba(110, 255, 90, 0.08)';
    bctx.font = '14px monospace';
    for (let r = 0; r < 40; r++) {
      let codeStr = '';
      for (let k = 0; k < 68; k++) {
        codeStr += (r + k) % 2 === 0 ? '1' : '0';
      }
      bctx.fillText(codeStr, 30, 30 + r * 19);
    }

    // Top status line
    bctx.fillStyle = 'rgba(142, 255, 86, 0.2)';
    bctx.fillRect(50, 45, 924, 40);
    bctx.fillStyle = '#8eff56';
    bctx.font = '700 18px monospace';
    bctx.textAlign = 'left';
    bctx.fillText('TRINITRON KV-1340 // SIGNAL: STABLE', 68, 71);
    bctx.textAlign = 'right';
    bctx.fillText('SYS_LOG: RUNNING', 956, 71);

    // Huge Pixelated "CODE" Title
    bctx.textAlign = 'center';
    bctx.fillStyle = '#9dff69';
    bctx.shadowColor = '#8eff56';
    bctx.shadowBlur = 32;
    bctx.font = '900 148px "Courier New", Courier, monospace';
    bctx.fillText('CODE', 512, 335);
    bctx.shadowBlur = 0;

    // Subtitle
    bctx.fillStyle = 'rgba(238, 225, 207, 0.88)';
    bctx.font = '700 28px monospace';
    bctx.fillText('systems / experiments', 512, 405);

    // Terminal command blocks
    bctx.textAlign = 'left';
    bctx.font = '18px monospace';
    bctx.fillStyle = 'rgba(142, 255, 86, 0.65)';
    const terminalLogs = [
      '> initializing kernel subsystems [OK]',
      '> loading neural network graph: 1.4B parameters',
      '> memory stream attached: socket://127.0.0.1:4173',
      '> systems online // ready for deployment'
    ];
    for (let i = 0; i < terminalLogs.length; i++) {
      bctx.fillText(terminalLogs[i], 80, 490 + i * 40);
    }

    // Terminal block cursor
    bctx.fillStyle = css;
    bctx.fillRect(80, 660, 22, 26);

  } else if (id === 'design') {
    // === DESIGN SCREEN (Sony Blueprint & Swiss Editorial) ===
    const grad = bctx.createRadialGradient(512, 384, 60, 512, 384, 620);
    grad.addColorStop(0, '#123682');
    grad.addColorStop(0.5, '#081c4a');
    grad.addColorStop(1, '#030b22');
    bctx.fillStyle = grad;
    bctx.fillRect(0, 0, 1024, 768);

    // Architectural millimeter grid
    bctx.strokeStyle = 'rgba(90, 162, 255, 0.16)';
    bctx.lineWidth = 1;
    for (let x = 30; x < 1024; x += 32) {
      bctx.beginPath(); bctx.moveTo(x, 0); bctx.lineTo(x, 768); bctx.stroke();
    }
    for (let y = 30; y < 768; y += 32) {
      bctx.beginPath(); bctx.moveTo(0, y); bctx.lineTo(1024, y); bctx.stroke();
    }

    // Top status line
    bctx.fillStyle = 'rgba(90, 162, 255, 0.2)';
    bctx.fillRect(50, 45, 924, 40);
    bctx.fillStyle = '#61a9ff';
    bctx.font = '700 18px monospace';
    bctx.textAlign = 'left';
    bctx.fillText('MULTISCAN 200ES // VECTOR PASS 16:10', 68, 71);
    bctx.textAlign = 'right';
    bctx.fillText('SWISS IDENTITY', 956, 71);

    // Mountain landscape wireframe box (top right)
    bctx.strokeStyle = 'rgba(90, 162, 255, 0.55)';
    bctx.lineWidth = 2;
    bctx.strokeRect(680, 110, 240, 130);
    bctx.fillStyle = 'rgba(90, 162, 255, 0.15)';
    bctx.fillRect(680, 110, 240, 130);
    bctx.beginPath();
    bctx.moveTo(690, 220); bctx.lineTo(740, 150); bctx.lineTo(780, 185); bctx.lineTo(840, 135); bctx.lineTo(910, 220);
    bctx.stroke();

    // Circle target crosshair (top left)
    bctx.beginPath();
    bctx.arc(180, 175, 55, 0, Math.PI * 2);
    bctx.stroke();
    bctx.beginPath();
    bctx.moveTo(180, 105); bctx.lineTo(180, 245);
    bctx.moveTo(110, 175); bctx.lineTo(250, 175);
    bctx.stroke();

    // Bold Crisp "DESIGN" Title
    bctx.textAlign = 'center';
    bctx.fillStyle = '#ffffff';
    bctx.shadowColor = '#5aa2ff';
    bctx.shadowBlur = 30;
    bctx.font = '900 138px "Arial Black", Impact, sans-serif';
    bctx.fillText('DESIGN', 512, 335);
    bctx.shadowBlur = 0;

    // Subtitle
    bctx.fillStyle = 'rgba(97, 169, 255, 0.95)';
    bctx.font = '700 28px monospace';
    bctx.fillText('identity / visual language', 512, 405);

    // Large Lowercase Serif "a" (bottom left)
    bctx.strokeStyle = '#5aa2ff';
    bctx.strokeRect(80, 470, 160, 210);
    bctx.fillStyle = 'rgba(97, 169, 255, 0.8)';
    bctx.font = 'italic 700 140px "Times New Roman", Georgia, serif';
    bctx.fillText('a', 160, 625);

    // Color Swatch Blocks (bottom center)
    const swatches = ['#1a3a6b', '#2b6cb0', '#4299e1', '#90cdf4', '#eee1cf'];
    for (let i = 0; i < swatches.length; i++) {
      bctx.fillStyle = swatches[i];
      bctx.fillRect(320 + i * 74, 595, 62, 62);
      bctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      bctx.strokeRect(320 + i * 74, 595, 62, 62);
    }

    // Dimension target box (bottom right)
    bctx.strokeRect(740, 480, 180, 170);
    bctx.fillStyle = 'rgba(97, 169, 255, 0.6)';
    bctx.font = '14px monospace';
    bctx.textAlign = 'left';
    bctx.fillText('GRID: 8px BASE', 755, 515);
    bctx.fillText('TYPE: GROTESK', 755, 545);
    bctx.fillText('COLOR: CMYK/RGB', 755, 575);
    bctx.fillText('RATIO: 1.618', 755, 605);

  } else {
    // === EXPLORE SCREEN (Surreal Twilight & Classical Collage) ===
    const grad = bctx.createRadialGradient(512, 384, 60, 512, 384, 620);
    grad.addColorStop(0, '#662244');
    grad.addColorStop(0.45, '#35143a');
    grad.addColorStop(1, '#110620');
    bctx.fillStyle = grad;
    bctx.fillRect(0, 0, 1024, 768);

    // Top status line
    bctx.fillStyle = 'rgba(255, 145, 88, 0.2)';
    bctx.fillRect(50, 45, 924, 40);
    bctx.fillStyle = '#ff9158';
    bctx.font = '700 18px monospace';
    bctx.textAlign = 'left';
    bctx.fillText('ANALOG DECK // FREQ: 432Hz // SIDE: B', 68, 71);
    bctx.textAlign = 'right';
    bctx.fillText('SURREAL DISCOVERY', 956, 71);

    // Surreal Portal Archway with Staircase (top left)
    bctx.strokeStyle = '#ff9158';
    bctx.lineWidth = 2.5;
    bctx.strokeRect(100, 120, 140, 170);
    bctx.beginPath();
    bctx.arc(170, 120, 70, Math.PI, 0);
    bctx.stroke();
    for (let s = 0; s < 6; s++) {
      bctx.strokeRect(120 + s * 8, 260 - s * 14, 100 - s * 16, 14);
    }

    // Celestial Planet & Moon (top right)
    bctx.fillStyle = '#ffd1a4';
    bctx.beginPath();
    bctx.arc(840, 180, 45, 0, Math.PI * 2);
    bctx.fill();
    bctx.strokeStyle = 'rgba(255, 209, 164, 0.6)';
    bctx.lineWidth = 3;
    bctx.beginPath();
    bctx.ellipse(840, 180, 85, 26, -0.3, 0, Math.PI * 2);
    bctx.stroke();

    // Warm Typography "EXPLORE" Title
    bctx.textAlign = 'center';
    bctx.fillStyle = '#ffb38a';
    bctx.shadowColor = '#ff9158';
    bctx.shadowBlur = 30;
    bctx.font = '900 138px "Arial Black", Impact, sans-serif';
    bctx.fillText('EXPLORE', 512, 335);
    bctx.shadowBlur = 0;

    // Subtitle
    bctx.fillStyle = 'rgba(255, 220, 195, 0.9)';
    bctx.font = '700 28px monospace';
    bctx.fillText('notes / unfinished ideas', 512, 405);

    // Classical Statue Sketch (bottom left)
    bctx.strokeStyle = 'rgba(255, 179, 138, 0.7)';
    bctx.lineWidth = 2;
    bctx.beginPath();
    bctx.arc(180, 550, 45, 0, Math.PI * 2);
    bctx.moveTo(140, 640); bctx.lineTo(180, 595); bctx.lineTo(220, 640);
    bctx.stroke();

    // Polaroid Tape Frame (bottom right)
    bctx.fillStyle = 'rgba(242, 234, 220, 0.95)';
    bctx.fillRect(720, 470, 190, 230);
    bctx.fillStyle = '#1c0f24';
    bctx.fillRect(738, 488, 154, 145);
    bctx.fillStyle = 'rgba(255, 200, 120, 0.6)';
    bctx.fillRect(775, 455, 80, 24);
    bctx.fillStyle = '#4a372c';
    bctx.font = '16px monospace';
    bctx.textAlign = 'center';
    bctx.fillText('MAY 94 / TAPE', 815, 675);
  }

  // Pre-baked CRT raster scanlines
  bctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
  bctx.lineWidth = 1.5;
  for (let y = 0; y < 768; y += 6) {
    bctx.beginPath(); bctx.moveTo(0, y); bctx.lineTo(1024, y); bctx.stroke();
  }

  // Tube vignette: darken toward the corners so the flat canvas reads as the
  // curved, rounded glass of a CRT rather than a sharp-edged flat panel
  const vignette = bctx.createRadialGradient(512, 384, 260, 512, 384, 640);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(0.75, 'rgba(0, 0, 0, 0.12)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.62)');
  bctx.fillStyle = vignette;
  bctx.fillRect(0, 0, 1024, 768);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

// --- SHARED CRT GLASS-EFFECT RESOURCES (highlight streak, phosphor glow, scan bar) ---
function createGlassHighlightTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 220, 256);
  grad.addColorStop(0, 'rgba(255,255,255,0.5)');
  grad.addColorStop(0.16, 'rgba(255,255,255,0.16)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}
function createSoftGlowTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.28)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
// A tiny repeating tile of dark scanlines — tiled densely down the screen and
// scrolled very slowly in the render loop, for a subtle rolling-scanline feel
// instead of a brightness flicker (which read as the whole screen "breathing")
function createScanlineOverlayTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 6;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 4, 6);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.fillRect(0, 0, 4, 2);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 140);
  tex.magFilter = THREE.NearestFilter;
  return tex;
}
const glassHighlightTex = createGlassHighlightTexture();
const softGlowTex = createSoftGlowTexture();
const scanlineOverlayTex = createScanlineOverlayTexture();

// Displaces a subdivided plane into a shallow convex bulge — the "tube glass"
// curvature that reads as CRT rather than a flat LCD panel
function createCurvedScreenGeometry(w, h, bulge = 0.05) {
  const segs = 20;
  const geo = new THREE.PlaneGeometry(w, h, segs, segs);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const nx = pos.getX(i) / (w / 2);
    const ny = pos.getY(i) / (h / 2);
    const d = Math.min(1, Math.sqrt(nx * nx + ny * ny));
    pos.setZ(i, bulge * (1 - d * d));
  }
  geo.computeVertexNormals();
  return geo;
}

// --- REALISTIC RETRO SONY CRT MONITOR BUILDER ---
function makeMonitor(spec, isCentre = false) {
  const group = new THREE.Group();
  group.position.set(spec.x, 2.05, -0.15);
  if (spec.ry) group.rotation.y = spec.ry;
  const scale = isCentre ? 1.18 : 1;
  group.scale.setScalar(scale);

  const shellMat = new THREE.MeshStandardMaterial({
    color: 0x5a544c,
    roughness: 0.65,
    metalness: 0.08
  });
  const darkBezelMat = new THREE.MeshStandardMaterial({
    color: 0x141416,
    roughness: 0.5,
    metalness: 0.2
  });
  const buttonMat = new THREE.MeshStandardMaterial({
    color: 0x2e2c2a,
    roughness: 0.4,
    metalness: 0.3
  });

  const screenTex = createScreenTexture(spec.id, spec.color);
  const screenMat = new THREE.MeshBasicMaterial({ map: screenTex });
  const screen = new THREE.Mesh(createCurvedScreenGeometry(1.88, 1.34, 0.05), screenMat);

  // Main Chiseled Monitor Cabinet
  box(2.28, 1.76, 0.62, shellMat, new THREE.Vector3(0, 0, 0), group);
  // Beveled Front Frame
  box(2.06, 1.52, 0.08, darkBezelMat, new THREE.Vector3(0, 0.04, 0.31), group);
  screen.position.set(0, 0.075, 0.36);
  group.add(screen);

  // Glass highlight streak — a soft diagonal sheen across the curved tube
  const glassHighlight = new THREE.Mesh(
    createCurvedScreenGeometry(1.86, 1.32, 0.05),
    new THREE.MeshBasicMaterial({
      map: glassHighlightTex, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false
    })
  );
  glassHighlight.position.set(0, 0.075, 0.361);
  group.add(glassHighlight);

  // Phosphor bloom — the glow bleeding past the tube edge that makes a CRT
  // read as an emissive light source rather than a printed flat panel.
  // Fixed opacity (no per-frame pulsing) so the screen doesn't visibly
  // "breathe" — the scanline roll below carries the sense of motion instead.
  const phosphorGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: softGlowTex, color: spec.color, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5
  }));
  phosphorGlow.scale.set(2.3, 1.7, 1);
  phosphorGlow.position.set(0, 0.075, 0.42);
  group.add(phosphorGlow);

  // Rolling scanlines — dense, dim, and scrolled very slowly in the render
  // loop, for a subtle CRT-refresh feel without a distracting sweep or flicker
  const scanlineOverlay = new THREE.Mesh(
    new THREE.PlaneGeometry(1.86, 1.32),
    new THREE.MeshBasicMaterial({
      map: scanlineOverlayTex, transparent: true,
      blending: THREE.NormalBlending, depthWrite: false, opacity: 0.5
    })
  );
  scanlineOverlay.position.set(0, 0.075, 0.363);
  group.add(scanlineOverlay);

  // Sony Model Badge Header
  box(0.55, 0.04, 0.02, darkBezelMat, new THREE.Vector3(0, 0.82, 0.32), group);

  // Bottom Control Panel with Buttons & Dials
  box(2.06, 0.2, 0.1, darkBezelMat, new THREE.Vector3(0, -0.7, 0.31), group);
  for (let b = 0; b < 6; b++) {
    cyl(0.024, 0.024, 0.04, 12, buttonMat, new THREE.Vector3(-0.6 + b * 0.15, -0.7, 0.37), group, new THREE.Euler(Math.PI / 2, 0, 0));
  }

  // SONY Logo Plaque (for center monitor)
  if (isCentre) {
    const plaque = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.07, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x282828, metalness: 0.7, roughness: 0.3 })
    );
    plaque.position.set(0, -0.68, 0.37);
    group.add(plaque);
  }

  // Pedestal Swivel Stand
  box(0.96, 0.14, 0.74, shellMat, new THREE.Vector3(0, -1.02, -0.04), group);
  box(1.52, 0.09, 0.84, darkBezelMat, new THREE.Vector3(0, -1.11, -0.15), group);

  // Power Status LED — gently pulses in the render loop (a small, localized
  // dynamic touch rather than the whole screen breathing)
  const ledMat = new THREE.MeshBasicMaterial({ color: spec.color });
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 12), ledMat);
  led.position.set(0.8, -0.7, 0.37);
  group.add(led);
  const ledBaseHsl = { h: 0, s: 0, l: 0 };
  ledMat.color.getHSL(ledBaseHsl);

  // Directional CRT Phosphor Glow forward onto the desk (boosted for visibility)
  const light = new THREE.PointLight(spec.color, 2.2, 11.0, 1.3);
  light.position.set(0, 0.1, 1.05);
  group.add(light);

  // Clickable Raycast Hitbox
  const hit = new THREE.Mesh(
    new THREE.PlaneGeometry(1.9, 1.36),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  hit.position.set(0, 0.075, 0.39);
  hit.userData = { spec, group, light, screen, phosphorGlow, scanlineOverlay, led, ledMat, ledBaseHsl };
  group.add(hit);
  monitorTargets.push(hit);

  scene.add(group);
}

// --- SOFT RADIAL STEAM TEXTURE GENERATOR ---
function createSteamTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(235, 240, 255, 0.7)');
  grad.addColorStop(0.25, 'rgba(210, 225, 250, 0.35)');
  grad.addColorStop(0.6, 'rgba(180, 200, 240, 0.1)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

// --- DESK PROPS, WALL ART & ENVIRONMENT GEOMETRY ---
let steamParticles = null;

function addRoomAndProps() {
  // Rich, warm wooden desk material with realistic light reflection
  const wood = new THREE.MeshStandardMaterial({
    color: 0x482a1b,
    roughness: 0.72,
    metalness: 0.04
  });
  // Moody wall material with texture response to ambient light
  const wall = new THREE.MeshStandardMaterial({ color: 0x121526, roughness: 0.92 });
  const floor = new THREE.MeshStandardMaterial({ color: 0x16131c, roughness: 0.92 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x3e4450, roughness: 0.35, metalness: 0.85 });
  const plasticDark = new THREE.MeshStandardMaterial({ color: 0x1e2026, roughness: 0.6 });
  const retroBeige = new THREE.MeshStandardMaterial({ color: 0xd6cdbc, roughness: 0.68 });

  // --- ROOM ARCHITECTURE WITH PHYSICAL WINDOW CUTOUT OPENING ---
  // Window Opening dimensions: x from -4.6 to +4.6, y from 1.35 to 7.35, at z = -1.75
  // Floor and Ceiling
  box(28, 0.2, 22, floor, new THREE.Vector3(0, -0.9, 5.0));
  box(28, 0.2, 22, wall, new THREE.Vector3(0, 9.8, 5.0));

  // Back Wall Panels (Framing the window opening cleanly so sky never bleeds onto walls)
  box(7.6, 11.0, 0.2, wall, new THREE.Vector3(-8.4, 4.45, -1.75)); // Left wall
  box(7.6, 11.0, 0.2, wall, new THREE.Vector3(8.4, 4.45, -1.75));  // Right wall
  box(9.4, 2.7, 0.2, wall, new THREE.Vector3(0, 8.7, -1.75));      // Top wall above window
  box(9.4, 2.3, 0.2, wall, new THREE.Vector3(0, 0.2, -1.75));      // Bottom wall below window sill

  // Left & Right Room Side Walls
  box(0.2, 11.0, 20.0, wall, new THREE.Vector3(-12.2, 4.45, 6.0));
  box(0.2, 11.0, 20.0, wall, new THREE.Vector3(12.2, 4.45, 6.0));

  // Desk Surface & Solid Wooden Support Structure
  box(11.5, 0.38, 2.35, wood, new THREE.Vector3(0, 0.74, 0.95));
  box(11.0, 0.18, 0.7, wood, new THREE.Vector3(0, -0.18, 0.95));
  for (const x of [-5.1, 5.1]) {
    box(0.28, 2.2, 0.36, wood, new THREE.Vector3(x, -0.38, 0.95));
  }

  // --- TRUE PARALLAX DEEP CELESTIAL SKY (Placed far in the background at z = -36.0) ---
  const cosmicTex = createCosmicBackdropTexture();
  const skyPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(54.0, 32.0),
    new THREE.MeshBasicMaterial({ map: cosmicTex, depthWrite: false })
  );
  skyPlane.position.set(0, 10.5, -36.0);
  scene.add(skyPlane);

  // Architectural Dark Window Frame with 6 Panes
  const windowFrameMat = new THREE.MeshStandardMaterial({ color: 0x141722, roughness: 0.45, metalness: 0.2 });
  // Outer perimeter frame
  box(9.4, 0.22, 0.24, windowFrameMat, new THREE.Vector3(0, 7.35, -1.72));
  box(9.4, 0.28, 0.38, windowFrameMat, new THREE.Vector3(0, 1.35, -1.68)); // Window Sill
  box(0.22, 6.2, 0.24, windowFrameMat, new THREE.Vector3(-4.6, 4.35, -1.72));
  box(0.22, 6.2, 0.24, windowFrameMat, new THREE.Vector3(4.6, 4.35, -1.72));
  // Central Vertical & Horizontal Mullions
  box(0.18, 6.0, 0.22, windowFrameMat, new THREE.Vector3(0, 4.35, -1.72));
  box(9.2, 0.16, 0.22, windowFrameMat, new THREE.Vector3(0, 4.35, -1.72));

  // --- WALL ART & POSTERS (matching reference image) ---
  // Left Wall: "ENDLESS CURIOSITY" Framed Grid Poster
  const posterCanvas = document.createElement('canvas');
  posterCanvas.width = 384;
  posterCanvas.height = 512;
  const pctx = posterCanvas.getContext('2d');
  pctx.fillStyle = '#060a14';
  pctx.fillRect(0, 0, 384, 512);
  pctx.strokeStyle = 'rgba(70, 130, 220, 0.28)';
  pctx.lineWidth = 1;
  for (let x = 20; x < 384; x += 24) {
    pctx.beginPath(); pctx.moveTo(x, 0); pctx.lineTo(x, 512); pctx.stroke();
  }
  for (let y = 20; y < 512; y += 24) {
    pctx.beginPath(); pctx.moveTo(0, y); pctx.lineTo(384, y); pctx.stroke();
  }
  pctx.fillStyle = '#1e3860';
  pctx.beginPath(); pctx.arc(192, 210, 95, 0, Math.PI * 2); pctx.fill();
  pctx.fillStyle = '#ffffff';
  pctx.font = '900 24px monospace';
  pctx.textAlign = 'center';
  pctx.fillText('ENDLESS', 192, 430);
  pctx.fillText('CURIOSITY', 192, 465);

  const posterTex = new THREE.CanvasTexture(posterCanvas);
  posterTex.colorSpace = THREE.SRGBColorSpace;
  const posterMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 2.0),
    new THREE.MeshStandardMaterial({ map: posterTex, roughness: 0.8 })
  );
  posterMesh.position.set(-6.8, 5.2, -1.64);
  scene.add(posterMesh);

  // Left Wall: Yellow Sticky Note ("QUESTION EVERYTHING <3")
  const sticky1Canvas = document.createElement('canvas');
  sticky1Canvas.width = 160; sticky1Canvas.height = 160;
  const s1ctx = sticky1Canvas.getContext('2d');
  s1ctx.fillStyle = '#ebd680'; s1ctx.fillRect(0, 0, 160, 160);
  s1ctx.fillStyle = '#221915'; s1ctx.font = '700 16px monospace'; s1ctx.textAlign = 'center';
  s1ctx.fillText('QUESTION', 80, 60);
  s1ctx.fillText('EVERYTHING', 80, 88);
  s1ctx.fillText('<3', 80, 115);
  const sticky1Tex = new THREE.CanvasTexture(sticky1Canvas);
  sticky1Tex.colorSpace = THREE.SRGBColorSpace;
  const sticky1Mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.55, 0.55),
    new THREE.MeshStandardMaterial({ map: sticky1Tex, roughness: 0.9 })
  );
  sticky1Mesh.position.set(-6.8, 3.4, -1.63);
  sticky1Mesh.rotation.z = -0.06;
  scene.add(sticky1Mesh);

  // Small, tightly-scoped fill light so the poster + sticky note read by eye
  // without washing out the rest of the (still-dark, still-night) room
  const leftWallFill = new THREE.PointLight(0x8fa8e0, 0.9, 4.2, 1.8);
  leftWallFill.position.set(-6.5, 4.3, -1.0);
  scene.add(leftWallFill);

  // Right Wall: Kraft Paper Note ("IDEAS ARE CHEAP. EXPLORATION IS EVERYTHING.")
  const kraftCanvas = document.createElement('canvas');
  kraftCanvas.width = 256; kraftCanvas.height = 340;
  const kctx = kraftCanvas.getContext('2d');
  kctx.fillStyle = '#b89c72'; kctx.fillRect(0, 0, 256, 340);
  kctx.fillStyle = '#261b14'; kctx.font = '700 18px monospace'; kctx.textAlign = 'center';
  kctx.fillText('IDEAS', 128, 70);
  kctx.fillText('ARE', 128, 105);
  kctx.fillText('CHEAP.', 128, 140);
  kctx.font = '700 15px monospace';
  kctx.fillText('EXPLORATION', 128, 210);
  kctx.fillText('IS EVERYTHING.', 128, 245);
  const kraftTex = new THREE.CanvasTexture(kraftCanvas);
  kraftTex.colorSpace = THREE.SRGBColorSpace;
  const kraftMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 1.45),
    new THREE.MeshStandardMaterial({ map: kraftTex, roughness: 0.9 })
  );
  kraftMesh.position.set(6.8, 5.6, -1.64);
  scene.add(kraftMesh);

  // --- STUDIO SPEAKERS & DESKTOP PLANTS ---
  const plantMat = new THREE.MeshStandardMaterial({ color: 0x1c3e22, roughness: 0.85 });
  const potMat = new THREE.MeshStandardMaterial({ color: 0x2e2520, roughness: 0.6 });

  for (const sx of [-4.4, 4.4]) {
    const speakerGroup = new THREE.Group();
    speakerGroup.position.set(sx, 1.7, 0.4);
    box(0.96, 1.54, 0.86, plasticDark, new THREE.Vector3(0, 0, 0), speakerGroup);
    cyl(0.25, 0.25, 0.05, 20, metal, new THREE.Vector3(0, -0.22, 0.44), speakerGroup, new THREE.Euler(Math.PI / 2, 0, 0));
    cyl(0.1, 0.1, 0.05, 20, metal, new THREE.Vector3(0, 0.32, 0.44), speakerGroup, new THREE.Euler(Math.PI / 2, 0, 0));
    scene.add(speakerGroup);

    // Small Potted Foliage Plant on top of each speaker
    const plantGroup = new THREE.Group();
    plantGroup.position.set(sx, 2.55, 0.4);
    cyl(0.18, 0.14, 0.22, 16, potMat, new THREE.Vector3(0, 0.11, 0), plantGroup);
    for (let l = 0; l < 8; l++) {
      const angle = (l / 8) * Math.PI * 2;
      const lx = Math.cos(angle) * 0.18;
      const lz = Math.sin(angle) * 0.18;
      box(0.12, 0.24, 0.02, plantMat, new THREE.Vector3(lx, 0.28, lz), plantGroup, true, true);
    }
    scene.add(plantGroup);
  }

  // --- MECHANICAL RETRO KEYBOARD (Scaled to realistic desk proportions) ---
  const keyboardGroup = new THREE.Group();
  keyboardGroup.position.set(0, 0.95, 1.55);
  keyboardGroup.rotation.x = -0.06;

  box(2.2, 0.10, 0.82, retroBeige, new THREE.Vector3(0, 0, 0), keyboardGroup);
  box(2.06, 0.05, 0.70, plasticDark, new THREE.Vector3(0, 0.05, 0), keyboardGroup);

  const keyMat = new THREE.MeshStandardMaterial({ color: 0xede4d5, roughness: 0.6 });
  const keyDarkMat = new THREE.MeshStandardMaterial({ color: 0x48423a, roughness: 0.6 });
  for (let r = 0; r < 4; r++) {
    for (let k = 0; k < 14; k++) {
      const kx = -0.91 + k * 0.14;
      const kz = -0.24 + r * 0.135;
      const useDark = k === 0 || k === 13 || r === 0;
      box(0.10, 0.055, 0.10, useDark ? keyDarkMat : keyMat, new THREE.Vector3(kx, 0.08, kz), keyboardGroup);
    }
  }
  box(0.84, 0.055, 0.11, keyMat, new THREE.Vector3(0, 0.08, 0.24), keyboardGroup);
  scene.add(keyboardGroup);

  // --- RETRO MOUSE & MOUSEPAD (Scaled to realistic proportions) ---
  const mousepad = new THREE.MeshStandardMaterial({ color: 0x10121a, roughness: 0.95 });
  box(0.72, 0.012, 0.85, mousepad, new THREE.Vector3(1.52, 0.94, 1.55));
  const mouseMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.10, 0.16, 6, 12), retroBeige);
  mouseMesh.position.set(1.52, 0.98, 1.55);
  mouseMesh.scale.set(1, 0.55, 1.3);
  scene.add(mouseMesh);

  // --- CERAMIC COFFEE MUG WITH SATURN EMBLEM ---
  const mugGroup = new THREE.Group();
  mugGroup.position.set(-1.52, 0.95, 1.55);
  const mugMat = new THREE.MeshStandardMaterial({ color: 0x1e2632, roughness: 0.45 });
  cyl(0.38, 0.38, 0.03, 20, wood, new THREE.Vector3(0, 0, 0), mugGroup);
  cyl(0.24, 0.22, 0.44, 20, mugMat, new THREE.Vector3(0, 0.24, 0), mugGroup);
  cyl(0.21, 0.21, 0.02, 16, new THREE.MeshStandardMaterial({ color: 0x22150e, roughness: 0.3 }), new THREE.Vector3(0, 0.41, 0), mugGroup);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.035, 8, 16, Math.PI), mugMat);
  handle.position.set(-0.24, 0.24, 0);
  handle.rotation.y = Math.PI / 2;
  mugGroup.add(handle);
  scene.add(mugGroup);

  // --- REALISTIC GENTLE COFFEE STEAM SYSTEM ---
  const steamCount = 60;
  const steamGeo = new THREE.BufferGeometry();
  const steamPos = new Float32Array(steamCount * 3);
  const steamData = [];
  
  const mugX = -1.52;
  const mugY = 1.39; // Liquid surface & top rim of coffee mug
  const mugZ = 1.55;

  for (let i = 0; i < steamCount; i++) {
    const age = Math.random();
    const strand = i % 3;
    steamData.push({
      age: age,
      speed: 0.18 + Math.random() * 0.10,
      strand: strand,
      seed: Math.random() * 10
    });
    const y = mugY + age * 0.65;
    const curlX = Math.sin(age * 5.0 + strand * 2.0) * 0.03 * age;
    const curlZ = Math.cos(age * 4.0 + strand * 1.5) * 0.02 * age;
    steamPos[i * 3] = mugX + curlX + (Math.random() - 0.5) * 0.03;
    steamPos[i * 3 + 1] = y;
    steamPos[i * 3 + 2] = mugZ + curlZ + (Math.random() - 0.5) * 0.03;
  }
  steamGeo.setAttribute('position', new THREE.BufferAttribute(steamPos, 3));
  
  const steamMat = new THREE.PointsMaterial({
    size: 0.16,
    map: createSteamTexture(),
    transparent: true,
    opacity: 0.20,
    depthWrite: false,
    blending: THREE.NormalBlending
  });
  steamParticles = new THREE.Points(steamGeo, steamMat);
  steamParticles.userData = { steamData, mugX, mugY, mugZ };
  scene.add(steamParticles);

  // --- CASSETTE TAPE STACKS (Left Desk) ---
  const tapeColors = [0x222a38, 0x482420, 0x1f2e24];
  for (let c = 0; c < 3; c++) {
    const cassMat = new THREE.MeshStandardMaterial({ color: tapeColors[c], roughness: 0.6 });
    box(0.94, 0.08, 0.64, cassMat, new THREE.Vector3(-2.85, 0.96 + c * 0.09, 1.52), scene, true, true);
  }

  // --- VINTAGE WALKMAN & CASSETTES (Right Desk) ---
  const walkmanMat = new THREE.MeshStandardMaterial({ color: 0x3a404c, metalness: 0.6, roughness: 0.35 });
  box(0.92, 0.14, 0.66, walkmanMat, new THREE.Vector3(2.85, 0.99, 1.55));
  box(0.42, 0.04, 0.36, new THREE.MeshBasicMaterial({ color: 0x10141c }), new THREE.Vector3(2.85, 1.07, 1.55));
  for (let c = 0; c < 2; c++) {
    const cassMat = new THREE.MeshStandardMaterial({ color: c === 0 ? 0x2e2824 : 0x1c2430, roughness: 0.6 });
    box(0.94, 0.08, 0.64, cassMat, new THREE.Vector3(3.75, 0.96 + c * 0.09, 1.55), scene, true, true);
  }

  // --- OPEN SPIRAL NOTEBOOK (Right Foreground) ---
  const notebookCanvas = document.createElement('canvas');
  notebookCanvas.width = 512; notebookCanvas.height = 384;
  const nbCtx = notebookCanvas.getContext('2d');
  nbCtx.fillStyle = '#ede3d0'; nbCtx.fillRect(0, 0, 512, 384);
  nbCtx.strokeStyle = '#c4b59f'; nbCtx.lineWidth = 1;
  for (let y = 30; y < 384; y += 22) {
    nbCtx.beginPath(); nbCtx.moveTo(20, y); nbCtx.lineTo(492, y); nbCtx.stroke();
  }
  nbCtx.fillStyle = '#3a2f26'; nbCtx.font = '700 16px monospace';
  nbCtx.fillText('// late night thoughts', 36, 55);
  nbCtx.font = '14px monospace';
  nbCtx.fillText('3 worlds converging...', 36, 88);
  nbCtx.fillText('architecture / synthesis', 36, 120);
  nbCtx.strokeStyle = '#3a2f26'; nbCtx.lineWidth = 1.5;
  nbCtx.strokeRect(300, 45, 160, 110);
  nbCtx.beginPath(); nbCtx.arc(380, 100, 35, 0, Math.PI * 2); nbCtx.stroke();

  const notebookTex = new THREE.CanvasTexture(notebookCanvas);
  notebookTex.colorSpace = THREE.SRGBColorSpace;

  const notebookMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.25, 0.95),
    new THREE.MeshStandardMaterial({ map: notebookTex, roughness: 0.9 })
  );
  notebookMesh.position.set(2.4, 0.95, 1.85);
  notebookMesh.rotation.x = -Math.PI / 2;
  notebookMesh.rotation.z = -0.15;
  scene.add(notebookMesh);

  // --- STICKY NOTE ("hover to enter") ---
  const stickyCanvas = document.createElement('canvas');
  stickyCanvas.width = 256; stickyCanvas.height = 128;
  const sctx = stickyCanvas.getContext('2d');
  sctx.fillStyle = '#e8d4a7'; sctx.fillRect(0, 0, 256, 128);
  sctx.fillStyle = '#221915'; sctx.font = '700 24px monospace'; sctx.textAlign = 'center';
  sctx.fillText('hover to enter', 128, 62);
  sctx.font = '16px monospace';
  sctx.fillText('----------------', 128, 88);
  const stickyTex = new THREE.CanvasTexture(stickyCanvas);
  stickyTex.colorSpace = THREE.SRGBColorSpace;

  const noteMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.36),
    new THREE.MeshBasicMaterial({ map: stickyTex })
  );
  noteMesh.position.set(0, 0.945, 1.95);
  noteMesh.rotation.x = -Math.PI / 2;
  scene.add(noteMesh);

  // --- ARTICULATED DESK LAMP (Right Side Directional Light) ---
  const lampGroup = new THREE.Group();
  lampGroup.position.set(4.25, 0.94, 0.9);
  cyl(0.38, 0.42, 0.1, 20, plasticDark, new THREE.Vector3(0, 0.05, 0), lampGroup);
  cyl(0.03, 0.03, 1.4, 12, metal, new THREE.Vector3(-0.15, 0.72, 0), lampGroup, new THREE.Euler(0, 0, -0.22));
  cyl(0.03, 0.03, 1.1, 12, metal, new THREE.Vector3(-0.45, 1.7, 0), lampGroup, new THREE.Euler(0, 0, 0.45));

  // Lamp head: a single group anchored at the arm's actual tip, so the shade
  // and bulb are defined relative to EACH OTHER (bulb nested inside the shade's
  // local space) instead of as two independently-guessed world coordinates
  // that merely happened to sit near each other. The arm's second segment is
  // centered at (-0.45, 1.7, 0) with length 1.1 and Euler(0,0,0.45); its free
  // (non-base) end — where the head attaches — is that center offset by half
  // its length along its own rotated axis, i.e. (-0.689, 2.195, 0).
  const lampHeadGroup = new THREE.Group();
  lampHeadGroup.position.set(-0.689, 2.195, 0.1);
  // Negative Z rotation tips the head down-and-LEFT (toward the desk centre).
  // A positive angle here mirrors it to down-and-right, aiming the cone off the
  // right edge of the desk at nothing — the head hangs from the joint either
  // way, so this sign is the only thing that decides which way it points.
  lampHeadGroup.rotation.z = -0.75;
  lampGroup.add(lampHeadGroup);

  const shadeRadius = 0.38;
  const shadeHeight = 0.52;
  const shade = new THREE.Mesh(
    new THREE.ConeGeometry(shadeRadius, shadeHeight, 20, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x1b1d24, roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide })
  );
  // A cone's apex sits at local +height/2 by default; shifting it down by
  // half its height puts that apex exactly at the group origin (the arm
  // joint), so the shade hangs from the joint with its wide opening below.
  shade.position.set(0, -shadeHeight / 2, 0);
  lampHeadGroup.add(shade);

  // Bulb nested inside the shade's hollow interior, near the open end so it
  // reads as the actual light source rather than a separate floating sphere.
  // At 58% of the way down from the apex the cone's interior radius is ~0.22,
  // comfortably larger than the bulb's 0.12 radius.
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xffe099 })
  );
  bulb.position.set(0, -shadeHeight * 0.58, 0);
  lampHeadGroup.add(bulb);
  scene.add(lampGroup);

  // Primary warm directional lamp illumination — positioned to exactly match
  // the bulb's true world position (computed, not guessed) so the light
  // genuinely appears to originate from inside the shade
  lampGroup.updateMatrixWorld(true);
  const bulbWorldPos = new THREE.Vector3();
  bulb.getWorldPosition(bulbWorldPos);
  const deskLampLight = new THREE.PointLight(0xffa045, 3.8, 16.0, 1.2);
  deskLampLight.position.copy(bulbWorldPos);
  scene.add(deskLampLight);
}

// --- DETAILED JAPANESE OAK BENTWOOD CHAIR & HOODIE DEVELOPER ---
function addPerson() {
  silhouetteGroup = new THREE.Group();
  silhouetteGroup.position.set(0, 0.02, 2.65);

  // --- Materials ---
  const oakWoodMat = new THREE.MeshStandardMaterial({
    color: 0xc6a27e, roughness: 0.55, metalness: 0.05,
    transparent: true, opacity: 1
  });
  const blackSteelMat = new THREE.MeshStandardMaterial({
    color: 0x16181e, roughness: 0.4, metalness: 0.8,
    transparent: true, opacity: 1
  });
  const hoodieMat = new THREE.MeshStandardMaterial({
    color: 0x111622, roughness: 0.85, metalness: 0.08,
    transparent: true, opacity: 1
  });
  const hoodFoldMat = new THREE.MeshStandardMaterial({
    color: 0x0c101a, roughness: 0.92,
    transparent: true, opacity: 1
  });
  const headphoneMat = new THREE.MeshStandardMaterial({
    color: 0x1a1d26, roughness: 0.35, metalness: 0.65,
    transparent: true, opacity: 1
  });
  const silverMetalMat = new THREE.MeshStandardMaterial({
    color: 0x8fa0b8, roughness: 0.25, metalness: 0.9,
    transparent: true, opacity: 1
  });
  const hairMat = new THREE.MeshStandardMaterial({
    color: 0x080a10, roughness: 0.9,
    transparent: true, opacity: 1
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0x8c6e5a, roughness: 0.75, metalness: 0.02,
    transparent: true, opacity: 1
  });
  const pantsMat = new THREE.MeshStandardMaterial({
    color: 0x0c1018, roughness: 0.92, metalness: 0.04,
    transparent: true, opacity: 1
  });
  const pantsFoldMat = new THREE.MeshStandardMaterial({
    color: 0x080b12, roughness: 0.96,
    transparent: true, opacity: 1
  });
  const shoeMat = new THREE.MeshStandardMaterial({
    color: 0x181a22, roughness: 0.55, metalness: 0.15,
    transparent: true, opacity: 1
  });
  const soleMat = new THREE.MeshStandardMaterial({
    color: 0xded9cf, roughness: 0.4,
    transparent: true, opacity: 1
  });
  const sockMat = new THREE.MeshStandardMaterial({
    color: 0x242834, roughness: 0.8,
    transparent: true, opacity: 1
  });

  // ==========================================
  // A. DETAILED JAPANESE OAK BENTWOOD CHAIR (Properly sized seat, visible backrest)
  // ==========================================
  const chairGroup = new THREE.Group();
  chairGroup.scale.set(1.35, 1.4, 1.35);

  // -- PROMINENT OAK BACKREST (Tall enough to be clearly visible behind the person) --
  // Main backrest panel — taller and positioned to show above the person's lower back
  const backrestPanel = new THREE.Mesh(
    new THREE.BoxGeometry(0.88, 0.72, 0.06),
    oakWoodMat
  );
  backrestPanel.position.set(0, 1.02, 1.12);
  backrestPanel.rotation.x = -0.10;
  chairGroup.add(backrestPanel);

  // Top rail of the backrest (curved cap strip)
  const topRail = new THREE.Mesh(
    new THREE.BoxGeometry(0.94, 0.065, 0.07),
    oakWoodMat
  );
  topRail.position.set(0, 1.38, 1.14);
  topRail.rotation.x = -0.08;
  chairGroup.add(topRail);

  // Vertical grain detail strips on backrest face
  for (const sx of [-0.28, 0, 0.28]) {
    const grain = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.62, 0.008),
      new THREE.MeshStandardMaterial({ color: 0xb8935f, roughness: 0.6, metalness: 0.04 })
    );
    // Placed slightly in front of the backrest panel (Z = 1.12 - 0.04 = 1.08)
    grain.position.set(sx, 1.02, 1.08);
    grain.rotation.x = -0.10;
    chairGroup.add(grain);
  }

  // -- PROPERLY SIZED SEAT PAN (Not too wide — matching reference proportions) --
  const seatMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.82, 0.055, 0.78),
    oakWoodMat
  );
  seatMesh.position.set(0, 0.52, 0.75);
  chairGroup.add(seatMesh);

  // Seat front edge rounding
  // The front of the seat is towards the monitors (lower Z).
  // Seat center = 0.75. Depth = 0.78. Front edge = 0.75 - 0.39 = 0.36
  cyl(0.028, 0.028, 0.82, 12, oakWoodMat, new THREE.Vector3(0, 0.52, 0.36), chairGroup, new THREE.Euler(0, 0, Math.PI / 2));

  // -- Black Steel Frame (Seat to backrest supports) --
  // Central spine rod
  cyl(0.022, 0.022, 0.65, 14, blackSteelMat, new THREE.Vector3(0, 0.74, 0.94), chairGroup, new THREE.Euler(-0.32, 0, 0));
  // Diagonal side supports
  for (const s of [-0.30, 0.30]) {
    cyl(0.018, 0.018, 0.55, 12, blackSteelMat, new THREE.Vector3(s, 0.74, 0.94), chairGroup, new THREE.Euler(-0.26, 0, s > 0 ? 0.06 : -0.06));
  }
  // Horizontal crossbar under seat
  cyl(0.022, 0.022, 0.72, 14, blackSteelMat, new THREE.Vector3(0, 0.48, 0.75), chairGroup, new THREE.Euler(0, 0, Math.PI / 2));

  // -- Armrests --
  for (const side of [-1, 1]) {
    cyl(0.018, 0.018, 0.48, 12, blackSteelMat, new THREE.Vector3(side * 0.42, 0.72, 0.82), chairGroup, new THREE.Euler(-0.10, 0, side * -0.16));
    cyl(0.016, 0.016, 0.30, 10, blackSteelMat, new THREE.Vector3(side * 0.44, 0.88, 0.78), chairGroup, new THREE.Euler(Math.PI / 2, 0, 0));
    const armpad = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.03, 0.34), oakWoodMat);
    armpad.position.set(side * 0.46, 0.92, 0.78);
    chairGroup.add(armpad);
  }

  // -- Gas Lift --
  cyl(0.045, 0.035, 0.36, 16, blackSteelMat, new THREE.Vector3(0, 0.30, 0.75), chairGroup);

  // -- 5-Star Base (Properly proportioned to seat width) --
  const baseRadius = 0.42;
  for (let w = 0; w < 5; w++) {
    const wAngle = (w / 5) * Math.PI * 2;
    const wx = Math.cos(wAngle) * baseRadius;
    const wz = Math.sin(wAngle) * baseRadius;

    const spoke = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.035, 0.44, 8),
      oakWoodMat
    );
    spoke.position.set(wx * 0.5, 0.10, 0.75 + wz * 0.5);
    spoke.rotation.z = Math.PI / 2;
    spoke.rotation.y = -wAngle + Math.PI / 2;
    chairGroup.add(spoke);

    // Caster
    const casterHousing = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.05, 0.035),
      blackSteelMat
    );
    casterHousing.position.set(wx, 0.035, 0.75 + wz);
    casterHousing.rotation.y = -wAngle;
    chairGroup.add(casterHousing);

    for (const offset of [-0.015, 0.015]) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.024, 0.024, 0.018, 10),
        blackSteelMat
      );
      wheel.position.set(
        wx + Math.cos(wAngle + Math.PI / 2) * offset,
        0.024,
        0.75 + wz + Math.sin(wAngle + Math.PI / 2) * offset
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.rotation.y = -wAngle;
      chairGroup.add(wheel);
    }
  }
  cyl(0.055, 0.055, 0.035, 16, blackSteelMat, new THREE.Vector3(0, 0.10, 0.75), chairGroup);

  silhouetteGroup.add(chairGroup);

  // ==========================================
  // B. HUMANOID IN OVERSIZED HOODIE WITH FULL LOWER BODY & STUDIO HEADPHONES
  // ==========================================
  const personGroup = new THREE.Group();
  personGroup.rotation.x = 0.06;

  // -- HOODIE BOTTOM HEM (Drapes naturally over hips/waist) --
  const hoodieHem = new THREE.Mesh(
    new THREE.TorusGeometry(0.31, 0.05, 8, 20),
    hoodFoldMat
  );
  hoodieHem.position.set(0, 0.82, 0.74);
  hoodieHem.rotation.x = Math.PI / 2;
  hoodieHem.scale.set(1.12, 0.86, 1.0);
  personGroup.add(hoodieHem);

  // -- LOWER TORSO (Hips, belly) --
  const lowerTorso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.28, 0.22, 8, 14),
    hoodieMat
  );
  lowerTorso.position.set(0, 0.96, 0.72);
  lowerTorso.scale.set(1.1, 1.0, 0.85);
  personGroup.add(lowerTorso);

  // -- MID TORSO (Ribcage — wider) --
  const midTorso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.32, 0.24, 8, 14),
    hoodieMat
  );
  midTorso.position.set(0, 1.26, 0.70);
  midTorso.scale.set(1.15, 1.0, 0.82);
  personGroup.add(midTorso);

  // -- UPPER CHEST --
  const upperChest = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.34, 0.14, 8, 14),
    hoodieMat
  );
  upperChest.position.set(0, 1.50, 0.68);
  upperChest.scale.set(1.18, 0.85, 0.78);
  personGroup.add(upperChest);

  // -- SHOULDERS (Natural shoulder line below neck) --
  const shoulders = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.10, 0.68, 6, 12),
    hoodieMat
  );
  shoulders.position.set(0, 1.56, 0.67);
  shoulders.rotation.z = Math.PI / 2;
  shoulders.scale.set(1.0, 1.0, 0.82);
  personGroup.add(shoulders);

  // -- SIDE TORSO FILL (Connects lats to arms) --
  for (const side of [-1, 1]) {
    const latFill = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.16, 0.32, 6, 10),
      hoodieMat
    );
    latFill.position.set(side * 0.38, 1.38, 0.70);
    latFill.scale.set(0.85, 1.0, 0.78);
    personGroup.add(latFill);

    const delt = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 12), hoodieMat);
    delt.position.set(side * 0.44, 1.56, 0.67);
    delt.scale.set(1.0, 0.85, 0.8);
    personGroup.add(delt);
  }

  // -- HOODIE HOOD (Collapsed naturally behind neck) --
  const hoodDrape = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.18, 0.12, 6, 10),
    hoodFoldMat
  );
  hoodDrape.position.set(0, 1.54, 0.52);
  hoodDrape.rotation.z = Math.PI / 2;
  hoodDrape.scale.set(0.7, 1.0, 0.6);
  personGroup.add(hoodDrape);

  const hoodRoll = new THREE.Mesh(
    new THREE.TorusGeometry(0.14, 0.035, 8, 14),
    hoodFoldMat
  );
  hoodRoll.position.set(0, 1.64, 0.53);
  hoodRoll.rotation.x = Math.PI / 2.5;
  hoodRoll.scale.set(1.2, 0.65, 1.0);
  personGroup.add(hoodRoll);

  // ==========================================
  // LOWER BODY: PELVIS / GLUTES (ASS), THIGHS, KNEES, SHINS & RETRO SNEAKERS
  // ==========================================
  // Pelvis / Glutes Base (Sitting securely on the Japanese bentwood chair seat)
  const pelvis = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.24, 0.28, 8, 14),
    pantsMat
  );
  pelvis.position.set(0, 0.64, 0.76);
  pelvis.scale.set(1.18, 0.85, 0.92);
  personGroup.add(pelvis);

  // Distinct rounded glute cheeks (visible form resting on chair pan)
  for (const side of [-1, 1]) {
    const gluteCheek = new THREE.Mesh(
      new THREE.SphereGeometry(0.19, 14, 14),
      pantsMat
    );
    gluteCheek.position.set(side * 0.16, 0.58, 0.80);
    gluteCheek.scale.set(1.0, 0.78, 1.08);
    personGroup.add(gluteCheek);
  }

  // Butt crease & fabric tension line
  const buttCrease = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.035, 0.20, 6, 8),
    pantsFoldMat
  );
  buttCrease.position.set(0, 0.60, 0.87);
  buttCrease.rotation.x = 0.35;
  personGroup.add(buttCrease);

  // Thighs (Upper legs extending horizontally along the seat towards the desk)
  for (const side of [-1, 1]) {
    const thigh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.14, 0.42, 8, 12),
      pantsMat
    );
    thigh.position.set(side * 0.21, 0.54, 0.52);
    thigh.rotation.x = Math.PI / 2 - 0.05;
    thigh.rotation.y = side * -0.04;
    thigh.scale.set(0.95, 1.0, 0.85);
    personGroup.add(thigh);

    // Thigh fabric fold
    const thighFold = new THREE.Mesh(
      new THREE.TorusGeometry(0.135, 0.018, 6, 14),
      pantsFoldMat
    );
    thighFold.position.set(side * 0.21, 0.54, 0.52);
    thighFold.rotation.y = Math.PI / 2;
    personGroup.add(thighFold);

    // Knees (Bent at front edge of seat pan)
    const knee = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.12, 0.08, 8, 10),
      pantsMat
    );
    knee.position.set(side * 0.22, 0.50, 0.25);
    knee.rotation.x = 0.32;
    personGroup.add(knee);

    // Lower Legs / Calves (Extending down towards the floor under desk)
    const calf = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.105, 0.40, 8, 12),
      pantsMat
    );
    calf.position.set(side * 0.22, 0.26, 0.27);
    calf.rotation.x = -0.14;
    personGroup.add(calf);

    // Ankle cuff / rolled pants hem
    const cuff = new THREE.Mesh(
      new THREE.TorusGeometry(0.085, 0.022, 6, 14),
      pantsFoldMat
    );
    cuff.position.set(side * 0.22, 0.09, 0.31);
    cuff.rotation.x = Math.PI / 2 - 0.14;
    personGroup.add(cuff);

    // Socks
    cyl(0.065, 0.065, 0.07, 12, sockMat, new THREE.Vector3(side * 0.22, 0.065, 0.32), personGroup);

    // Chunky Retro Sneakers
    const shoeGroup = new THREE.Group();
    shoeGroup.position.set(side * 0.22, 0.035, 0.38);
    shoeGroup.rotation.y = side * -0.06;

    // Main sneaker body
    box(0.14, 0.09, 0.30, shoeMat, new THREE.Vector3(0, 0.03, 0), shoeGroup);
    // Rounded toe cap
    const toeCap = new THREE.Mesh(new THREE.SphereGeometry(0.068, 10, 10), shoeMat);
    toeCap.position.set(0, 0.02, -0.13);
    toeCap.scale.set(1.0, 0.65, 1.1);
    shoeGroup.add(toeCap);
    // Chunky off-white midsole
    box(0.155, 0.032, 0.33, soleMat, new THREE.Vector3(0, -0.015, -0.01), shoeGroup);
    // Heel tab detail
    box(0.07, 0.04, 0.02, silverMetalMat, new THREE.Vector3(0, 0.06, 0.14), shoeGroup);

    personGroup.add(shoeGroup);
  }

  // -- NECK --
  cyl(0.08, 0.09, 0.14, 14, hairMat, new THREE.Vector3(0, 1.72, 0.66), personGroup);

  // -- HEAD & HAIR (Natural cranial human proportions) --
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.195, 24, 20), hairMat);
  head.position.set(0, 1.88, 0.65);
  head.scale.set(0.92, 1.05, 0.94);
  personGroup.add(head);

  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.205, 20, 18), hairMat);
  hair.position.set(0, 1.91, 0.64);
  hair.scale.set(0.93, 1.02, 0.95);
  personGroup.add(hair);

  // ==========================================
  // ERGONOMIC STUDIO MONITOR HEADPHONES (Snug-fitting, zero floating gap)
  // ==========================================
  // Headband Outer Frame (Sits snugly right over the hair)
  const headband = new THREE.Mesh(
    new THREE.TorusGeometry(0.182, 0.020, 12, 32, Math.PI),
    headphoneMat
  );
  headband.position.set(0, 1.85, 0.64);
  headband.scale.set(1.04, 1.34, 1.0);
  personGroup.add(headband);

  // Padded Leather Cushion (Underside of headband resting against crown)
  const headbandCushion = new THREE.Mesh(
    new THREE.TorusGeometry(0.176, 0.014, 8, 24, Math.PI * 0.72),
    new THREE.MeshStandardMaterial({ color: 0x0e1017, roughness: 0.7, transparent: true, opacity: 1 })
  );
  headbandCushion.position.set(0, 1.85, 0.64);
  headbandCushion.scale.set(1.04, 1.33, 1.0);
  headbandCushion.rotation.z = Math.PI * 0.14;
  personGroup.add(headbandCushion);

  for (const side of [-1, 1]) {
    // Metal adjustment extension slider brackets
    const slider = new THREE.Mesh(
      new THREE.BoxGeometry(0.016, 0.07, 0.024),
      silverMetalMat
    );
    slider.position.set(side * 0.194, 1.87, 0.64);
    personGroup.add(slider);

    // Gimbal Swivel block
    const hinge = new THREE.Mesh(
      new THREE.BoxGeometry(0.022, 0.032, 0.030),
      headphoneMat
    );
    hinge.position.set(side * 0.196, 1.83, 0.64);
    personGroup.add(hinge);

    // Earcup Assembly (Angled ergonomically flush to the head)
    const earcupGroup = new THREE.Group();
    earcupGroup.position.set(side * 0.190, 1.82, 0.64);
    earcupGroup.rotation.y = side * 0.08;
    earcupGroup.rotation.x = -0.05;
    earcupGroup.rotation.z = side * -0.06;

    // Thick Plush Leather Oval Cushion (Inner side flush against ear)
    const cushion = new THREE.Mesh(
      new THREE.TorusGeometry(0.070, 0.025, 12, 22),
      new THREE.MeshStandardMaterial({ color: 0x12151e, roughness: 0.8, transparent: true, opacity: 1 })
    );
    cushion.position.set(side * -0.012, 0, 0);
    cushion.rotation.y = Math.PI / 2;
    cushion.scale.set(0.85, 1.25, 0.85);
    earcupGroup.add(cushion);

    // Inner Driver Grille
    const grille = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 0.012, 16),
      new THREE.MeshStandardMaterial({ color: 0x08090d, roughness: 0.9, transparent: true, opacity: 1 })
    );
    grille.position.set(side * -0.01, 0, 0);
    grille.rotation.z = Math.PI / 2;
    earcupGroup.add(grille);

    // Outer Studio Dome Shell
    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.080, 0.074, 0.042, 20),
      headphoneMat
    );
    shell.position.set(side * 0.020, 0, 0);
    shell.rotation.z = Math.PI / 2;
    shell.scale.set(1.0, 1.0, 1.22);
    earcupGroup.add(shell);

    // Brushed Aluminum Backplate & Metallic Ring
    const backplate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.058, 0.058, 0.008, 18),
      silverMetalMat
    );
    backplate.position.set(side * 0.044, 0, 0);
    backplate.rotation.z = Math.PI / 2;
    earcupGroup.add(backplate);

    const metalRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.062, 0.004, 8, 20),
      silverMetalMat
    );
    metalRing.position.set(side * 0.043, 0, 0);
    metalRing.rotation.y = Math.PI / 2;
    earcupGroup.add(metalRing);

    // Left side audio cable jack
    if (side === -1) {
      const jack = new THREE.Mesh(
        new THREE.CylinderGeometry(0.010, 0.010, 0.035, 8),
        silverMetalMat
      );
      jack.position.set(-0.015, -0.075, 0.02);
      earcupGroup.add(jack);
    }

    personGroup.add(earcupGroup);
  }

  // -- ARMS (Connected at shoulder height) --
  for (const side of [-1, 1]) {
    const upperArm = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.09, 0.36, 6, 12),
      hoodieMat
    );
    upperArm.position.set(side * 0.48, 1.28, 0.72);
    upperArm.rotation.x = 0.18;
    upperArm.rotation.z = side * -0.08;
    personGroup.add(upperArm);

    const forearm = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.065, 0.44, 6, 10),
      hoodieMat
    );
    forearm.position.set(side * 0.44, 1.04, 1.10);
    forearm.rotation.x = 1.0;
    forearm.rotation.y = side * 0.10;
    personGroup.add(forearm);

    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), skinMat);
    hand.position.set(side * 0.40, 0.92, 1.40);
    hand.scale.set(1.0, 0.7, 1.2);
    personGroup.add(hand);
  }

  personGroup.scale.set(1.2, 1.45, 1.25);

  silhouetteGroup.add(personGroup);
  scene.add(silhouetteGroup);
}

// --- LO-FI NIGHT DESK CLUTTER (cat, fairy lights, vinyl stack, rug, wall clock) ---
// Both GLBs share one manager so the boot overlay can wait on the pair of them
// rather than revealing an empty floor and popping the cat in a beat later.
// onError resolves too — a missing asset should cost us a prop, not the room.
let resolveClutter;
const clutterReady = new Promise((resolve) => { resolveClutter = resolve; });
const clutterManager = new THREE.LoadingManager(
  () => resolveClutter(),
  undefined,
  () => resolveClutter()
);

function addLofiClutter() {
  // ==========================================
  // SLEEPING CAT FIGURINE (real modeled/textured asset, floor level, front of desk)
  // ==========================================
  const catLoader = new GLTFLoader(clutterManager);
  catLoader.load(
    './assets/cat.glb',
    (gltf) => {
      const catModel = gltf.scene;

      // The source asset's raw scale/pivot are unknown ahead of time, so measure
      // its bounding box and fit it to a deliberately chosen footprint sized
      // against this scene's own desk/chair/character proportions, then ground
      // it and center it at the desired floor spot regardless of its internal origin.
      const targetLength = 0.6;
      const rawBox = new THREE.Box3().setFromObject(catModel);
      const rawSize = rawBox.getSize(new THREE.Vector3());
      const scale = targetLength / Math.max(rawSize.x, rawSize.y, rawSize.z);
      catModel.scale.setScalar(scale);
      catModel.rotation.y = 0.6;

      const box = new THREE.Box3().setFromObject(catModel);
      const center = box.getCenter(new THREE.Vector3());
      const desiredX = -2.05, desiredZ = 3.2, desiredGroundY = 0.03;
      catModel.position.set(
        desiredX - center.x,
        desiredGroundY - box.min.y,
        desiredZ - center.z
      );

      catModel.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          // The source asset ships with no fur texture (plain white material),
          // so give it a warm ginger tint directly rather than leaving it to
          // pick up whatever tint the scene's cool moonlit ambient happens to cast
          if (child.material) {
            child.material.color.set(0xc9793d);
            child.material.roughness = 0.82;
            child.material.metalness = 0.0;
          }
        }
      });

      scene.add(catModel);

      // Small warm fill so the figurine's own coloring reads instead of
      // washing out to the room's cool moonlit ambient
      const catFill = new THREE.PointLight(0xffc98a, 0.8, 2.4, 1.8);
      catFill.position.set(desiredX + 0.3, 0.5, desiredZ + 0.3);
      scene.add(catFill);
    },
    undefined,
    (error) => console.error('Cat model failed to load:', error)
  );

  // ==========================================
  // WARM FAIRY LIGHTS DRAPED ACROSS THE WINDOW HEADER
  // Real modeled cable + cylindrical-bulb string asset (cable/socket/metal/
  // emissive-glass materials), scaled to the window span, with a few small
  // short-range lights layered on top so the bulbs cast a little natural glow.
  // ==========================================
  const spanStart = -4.3;
  const spanEnd = 4.3;
  // Anchor points sit high enough that they're out of frame in the default,
  // unzoomed view — only the sagging middle swoop is meant to read there —
  // while the deeper sag still brings the bulbs back down to their old height.
  const fairyTopY = 6.2;
  const sagAt = (t) => Math.sin(t * Math.PI) * 1.15;

  // Two wide, soft lights (not five tight ones): a real strung light casts a
  // broad, diffuse pool rather than a tiny hotspot, so this trades a small
  // count for a much larger falloff radius and a gentler decay — which also
  // halves the light count for the GPU's sake.
  for (const t of [0.28, 0.72]) {
    const x = spanStart + (spanEnd - spanStart) * t;
    const y = fairyTopY - sagAt(t);
    const twinkle = new THREE.PointLight(0xffcf9a, 0.7, 6.5, 1.3);
    twinkle.position.set(x, y, -1.4);
    scene.add(twinkle);
  }

  const fairyLoader = new GLTFLoader(clutterManager);
  fairyLoader.load(
    './assets/fairy_lights.glb',
    (gltf) => {
      const fairyModel = gltf.scene;
      const rawBox = new THREE.Box3().setFromObject(fairyModel);
      const rawSize = rawBox.getSize(new THREE.Vector3());
      const scale = (spanEnd - spanStart) / rawSize.x;
      fairyModel.scale.setScalar(scale);

      const box = new THREE.Box3().setFromObject(fairyModel);
      const center = box.getCenter(new THREE.Vector3());
      fairyModel.position.set(0 - center.x, fairyTopY - box.max.y, -1.58 - center.z);

      fairyModel.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material.roughness = Math.min(child.material.roughness ?? 0.6, 0.7);
          if (/emiss/i.test(child.material.name || '')) {
            child.material.color.set(0xfff0c8);
            if (child.material.emissive) {
              child.material.emissive.set(0xffdca0);
              child.material.emissiveIntensity = 1.8;
            }
          }
        }
      });

      scene.add(fairyModel);
    },
    undefined,
    (error) => console.error('Fairy lights model failed to load:', error)
  );

  // ==========================================
  // LEANING VINYL RECORD STACK (against the left desk leg)
  // ==========================================
  const vinylGroup = new THREE.Group();
  vinylGroup.position.set(-5.55, 0.05, 1.4);
  vinylGroup.rotation.z = 0.24;
  const sleeveColors = [0x8b3a3a, 0x2f4f6b, 0x5c7a3a, 0x6b4a8b];
  sleeveColors.forEach((color, i) => {
    const sleeve = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.34, 0.016, 24),
      new THREE.MeshStandardMaterial({ color, roughness: 0.55 })
    );
    sleeve.position.set(0, 0.02 + i * 0.05, i * -0.045);
    sleeve.rotation.x = Math.PI / 2;
    vinylGroup.add(sleeve);
    const label = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 0.02, 16),
      new THREE.MeshStandardMaterial({ color: 0xe8ddc8, roughness: 0.5 })
    );
    label.position.copy(sleeve.position);
    label.position.z += 0.001;
    label.rotation.x = Math.PI / 2;
    vinylGroup.add(label);
  });
  scene.add(vinylGroup);

  // ==========================================
  // FLOOR RUG (beneath the chair, adds warmth underfoot)
  // ==========================================
  const rugCanvas = document.createElement('canvas');
  rugCanvas.width = 256; rugCanvas.height = 256;
  const rctx = rugCanvas.getContext('2d');
  rctx.fillStyle = '#26150f'; rctx.fillRect(0, 0, 256, 256);
  const rugBands = [
    { c: '#341c14', w: 20 }, { c: '#4a2a1c', w: 10 }, { c: '#22283a', w: 8 }, { c: '#341c14', w: 20 }
  ];
  let ry = 10;
  while (ry < 246) {
    for (const band of rugBands) {
      rctx.fillStyle = band.c;
      rctx.fillRect(10, ry, 236, band.w);
      ry += band.w + 6;
      if (ry >= 246) break;
    }
  }
  rctx.strokeStyle = 'rgba(74, 42, 28, 0.7)';
  rctx.lineWidth = 5;
  rctx.strokeRect(14, 14, 228, 228);
  // Soft vignette so the rug's edge dissolves into the floor instead of reading as a hard rectangle
  const rugVignette = rctx.createRadialGradient(128, 128, 60, 128, 128, 150);
  rugVignette.addColorStop(0, 'rgba(0,0,0,0)');
  rugVignette.addColorStop(1, 'rgba(5, 3, 2, 0.85)');
  rctx.fillStyle = rugVignette;
  rctx.fillRect(0, 0, 256, 256);
  const rugTex = new THREE.CanvasTexture(rugCanvas);
  rugTex.colorSpace = THREE.SRGBColorSpace;
  const rug = new THREE.Mesh(
    new THREE.PlaneGeometry(3.7, 2.9),
    new THREE.MeshStandardMaterial({ map: rugTex, roughness: 0.95 })
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.005, 2.75);
  scene.add(rug);

  // ==========================================
  // UNDER-DESK FLOOR CLUTTER — fills out the empty floor/shelf area, kept
  // dim and out of the main light so it reads as background detail
  // ==========================================
  // Yarn ball with a trailing thread, dropped beside the sleeping cat
  const yarnGroup = new THREE.Group();
  yarnGroup.position.set(-1.55, 0.1, 3.0);
  const yarnCanvas = document.createElement('canvas');
  yarnCanvas.width = 128; yarnCanvas.height = 128;
  const yctx = yarnCanvas.getContext('2d');
  yctx.fillStyle = '#8a3a42';
  yctx.fillRect(0, 0, 128, 128);
  yctx.strokeStyle = 'rgba(55, 18, 24, 0.55)';
  yctx.lineWidth = 2;
  for (let i = 0; i < 16; i++) {
    yctx.beginPath();
    const r = 8 + i * 7;
    const a0 = (i * 2.4) % (Math.PI * 2);
    yctx.arc(64 + (i % 2 === 0 ? -5 : 5), 64, r, a0, a0 + 3.2);
    yctx.stroke();
  }
  const yarnTex = new THREE.CanvasTexture(yarnCanvas);
  yarnTex.colorSpace = THREE.SRGBColorSpace;
  const yarnBall = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 16, 14),
    new THREE.MeshStandardMaterial({ map: yarnTex, roughness: 0.9 })
  );
  yarnGroup.add(yarnBall);
  const threadCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.03, 0.09),
    new THREE.Vector3(0.16, -0.04, 0.24),
    new THREE.Vector3(0.34, -0.03, 0.32),
    new THREE.Vector3(0.5, -0.01, 0.3)
  ]);
  const thread = new THREE.Mesh(
    new THREE.TubeGeometry(threadCurve, 16, 0.006, 5, false),
    new THREE.MeshStandardMaterial({ color: 0x8a3a42, roughness: 0.9 })
  );
  yarnGroup.add(thread);
  scene.add(yarnGroup);

  // Empty coffee mug, tipped over and forgotten near the right desk leg
  const floorMugGroup = new THREE.Group();
  floorMugGroup.position.set(4.55, 0.03, 2.15);
  floorMugGroup.rotation.z = 1.35;
  floorMugGroup.rotation.y = 0.5;
  const floorMugMat = new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.5 });
  cyl(0.13, 0.12, 0.2, 14, floorMugMat, new THREE.Vector3(0, 0.13, 0), floorMugGroup);
  const floorMugHandle = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.017, 8, 14, Math.PI), floorMugMat);
  floorMugHandle.position.set(0.12, 0.13, 0);
  floorMugHandle.rotation.y = Math.PI / 2;
  floorMugGroup.add(floorMugHandle);
  scene.add(floorMugGroup);

  // Small stack of books on the floor by the right leg, leaned at a slight angle
  const bookColors = [0x4a3a2a, 0x2e3a4a, 0x5a2e2e];
  for (let i = 0; i < 3; i++) {
    const book = new THREE.Mesh(
      new THREE.BoxGeometry(0.4 - i * 0.03, 0.052, 0.29),
      new THREE.MeshStandardMaterial({ color: bookColors[i], roughness: 0.8 })
    );
    book.position.set(3.55, 0.055 + i * 0.056, 2.55);
    book.rotation.y = 0.5 + (i - 1) * 0.07;
    scene.add(book);
  }

  // Loose cables trailing off the desk down to the floor by the right leg
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x0e0e12, roughness: 0.6 });
  for (const offset of [-0.06, 0.05]) {
    const cableCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(5.05 + offset, 0.7, 0.9),
      new THREE.Vector3(5.18 + offset, 0.32, 0.88),
      new THREE.Vector3(5.05 + offset, 0.05, 1.05),
      new THREE.Vector3(4.85 + offset, 0.02, 1.3)
    ]);
    const cable = new THREE.Mesh(new THREE.TubeGeometry(cableCurve, 20, 0.012, 5, false), cableMat);
    scene.add(cable);
  }

  // ==========================================
  // "LATE NIGHT" LIVED-IN DETAIL — the small human touches a workspace
  // accumulates after hours: leftover takeout, a charging phone, kicked-off
  // slippers, a bin that hasn't been emptied
  // ==========================================
  // Takeout container, lid propped open, chopsticks resting across it
  const takeoutGroup = new THREE.Group();
  takeoutGroup.position.set(4.75, 0.94, 1.85);
  takeoutGroup.rotation.y = 0.32;
  const takeoutMat = new THREE.MeshStandardMaterial({ color: 0xe8e0c8, roughness: 0.6 });
  const takeoutBox = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.15, 0.24), takeoutMat);
  takeoutBox.position.set(0, 0.075, 0);
  takeoutGroup.add(takeoutBox);
  const takeoutLid = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.015, 0.25), takeoutMat);
  takeoutLid.position.set(0.05, 0.16, 0.3);
  takeoutLid.rotation.x = -0.65;
  takeoutGroup.add(takeoutLid);
  const chopstickMat = new THREE.MeshStandardMaterial({ color: 0xc9a876, roughness: 0.5 });
  for (const cx of [-0.025, 0.025]) {
    const chopstick = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.34, 6), chopstickMat);
    chopstick.position.set(cx + 0.06, 0.16, -0.02);
    chopstick.rotation.z = Math.PI / 2 - 0.12;
    chopstick.rotation.y = 0.25;
    takeoutGroup.add(chopstick);
  }
  scene.add(takeoutGroup);

  // Phone, face down and charging, cable coiled beside it on the desk
  const phoneGroup = new THREE.Group();
  phoneGroup.position.set(4.35, 0.945, 2.05);
  phoneGroup.rotation.y = 0.45;
  phoneGroup.add(new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.012, 0.19),
    new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.3, metalness: 0.4 })
  ));
  scene.add(phoneGroup);
  const phoneCableCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(4.28, 0.955, 2.15),
    new THREE.Vector3(4.18, 0.955, 2.24),
    new THREE.Vector3(4.24, 0.955, 2.32),
    new THREE.Vector3(4.35, 0.955, 2.28),
    new THREE.Vector3(4.4, 0.955, 2.18)
  ]);
  const phoneCable = new THREE.Mesh(
    new THREE.TubeGeometry(phoneCableCurve, 24, 0.007, 5, false),
    new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.6 })
  );
  scene.add(phoneCable);

  // Small trash bin with a couple of crumpled paper balls beside it, floor level
  const binMat = new THREE.MeshStandardMaterial({ color: 0x2a2e38, roughness: 0.55, metalness: 0.15, side: THREE.DoubleSide });
  const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.28, 16, 1, true), binMat);
  bin.position.set(4.3, 0.17, 2.85);
  scene.add(bin);
  const paperMat = new THREE.MeshStandardMaterial({ color: 0xdcd4c0, roughness: 0.9 });
  const paperOffsets = [[-0.12, -0.05], [0.14, 0.08], [0.02, 0.22]];
  for (const [dx, dz] of paperOffsets) {
    const paperBall = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), paperMat);
    paperBall.position.set(4.3 + dx, 0.045, 2.85 + dz + 0.15);
    paperBall.scale.set(1, 0.75, 1);
    scene.add(paperBall);
  }

  // A pair of kicked-off slippers beside the rug, clear of the chair silhouette
  const slipperMat = new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 0.82 });
  const slipperSoleMat = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.7 });
  for (const side of [-1, 1]) {
    const slipperGroup = new THREE.Group();
    slipperGroup.position.set(1.7 + side * 0.22, 0.03, 3.55);
    slipperGroup.rotation.y = side * 0.4 + 0.3;
    const slipperTop = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.1, 4, 8), slipperMat);
    slipperTop.scale.set(1, 0.45, 1.5);
    slipperTop.position.y = 0.04;
    slipperGroup.add(slipperTop);
    const slipperSole = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.02, 0.28), slipperSoleMat);
    slipperGroup.add(slipperSole);
    scene.add(slipperGroup);
  }

  // Spare headphones on a small stand beside the keyboard
  const headphoneStandGroup = new THREE.Group();
  headphoneStandGroup.position.set(-2.15, 0.94, 1.75);
  const standMat = new THREE.MeshStandardMaterial({ color: 0x2e3038, roughness: 0.4, metalness: 0.6 });
  cyl(0.06, 0.07, 0.02, 16, standMat, new THREE.Vector3(0, 0.01, 0), headphoneStandGroup);
  cyl(0.012, 0.012, 0.24, 8, standMat, new THREE.Vector3(0, 0.13, 0), headphoneStandGroup);
  const hpBand = new THREE.Mesh(
    new THREE.TorusGeometry(0.09, 0.012, 8, 16, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0x16181e, roughness: 0.5 })
  );
  hpBand.position.set(0, 0.25, 0);
  hpBand.rotation.z = Math.PI;
  headphoneStandGroup.add(hpBand);
  const hpCupMat = new THREE.MeshStandardMaterial({ color: 0x1a1d26, roughness: 0.4, metalness: 0.5 });
  for (const side of [-1, 1]) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 14), hpCupMat);
    cup.position.set(side * 0.09, 0.17, 0);
    cup.rotation.z = Math.PI / 2;
    headphoneStandGroup.add(cup);
  }
  scene.add(headphoneStandGroup);

  // Pen holder with a few pens/pencils, tucked near the monitor base
  const penCupGroup = new THREE.Group();
  penCupGroup.position.set(-1.35, 0.94, 2.05);
  cyl(0.055, 0.05, 0.11, 14, new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.5, metalness: 0.3 }), new THREE.Vector3(0, 0.055, 0), penCupGroup);
  const penColors = [0xd6483c, 0x4a90d6, 0xe8d048, 0xdedede];
  penColors.forEach((color, i) => {
    const pen = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 0.22, 6),
      new THREE.MeshStandardMaterial({ color, roughness: 0.4 })
    );
    const a = (i / penColors.length) * Math.PI * 2;
    pen.position.set(Math.cos(a) * 0.02, 0.16, Math.sin(a) * 0.02);
    pen.rotation.z = Math.cos(a) * 0.18;
    pen.rotation.x = Math.sin(a) * 0.18;
    penCupGroup.add(pen);
  });
  scene.add(penCupGroup);

  // Second trailing vine on the right side of the window, balancing the left ivy
  const rightIvyGroup = new THREE.Group();
  rightIvyGroup.position.set(4.15, 7.2, -1.55);
  const rightIvyStem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.014, 2.6, 6),
    new THREE.MeshStandardMaterial({ color: 0x3a5a28, roughness: 0.7 })
  );
  rightIvyStem.position.set(-0.25, -1.15, 0.1);
  rightIvyStem.rotation.z = -0.12;
  rightIvyGroup.add(rightIvyStem);
  const rightIvyLeafMat = new THREE.MeshStandardMaterial({ color: 0x2a5e2e, roughness: 0.82 });
  const rightIvyDarkMat = new THREE.MeshStandardMaterial({ color: 0x1a3e1c, roughness: 0.85 });
  const rightIvyPositions = [
    { x: -0.1, y: -0.15, z: 0.12, rot: -0.3, s: 0.75 },
    { x: -0.3, y: -0.5, z: 0.14, rot: 0.4, s: 0.95 },
    { x: -0.12, y: -0.85, z: 0.1, rot: -0.5, s: 0.85 },
    { x: -0.38, y: -1.15, z: 0.15, rot: 0.2, s: 1.05 },
    { x: -0.2, y: -1.5, z: 0.12, rot: -0.6, s: 0.8 },
    { x: -0.42, y: -1.85, z: 0.14, rot: 0.5, s: 0.9 },
    { x: -0.15, y: -2.15, z: 0.16, rot: 0.7, s: 0.65 },
    { x: -0.32, y: -2.4, z: 0.12, rot: -0.4, s: 0.75 }
  ];
  for (const lp of rightIvyPositions) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.08 * lp.s, 6, 5), Math.random() > 0.5 ? rightIvyLeafMat : rightIvyDarkMat);
    leaf.position.set(lp.x, lp.y, lp.z);
    leaf.scale.set(1.2, 0.35, 1.0);
    leaf.rotation.z = lp.rot;
    leaf.rotation.x = 0.2 + Math.random() * 0.3;
    rightIvyGroup.add(leaf);
  }
  scene.add(rightIvyGroup);

  // ==========================================
  // WALL CLOCK (left wall, balances the poster/sticky-note cluster)
  // ==========================================
  const clockGroup = new THREE.Group();
  clockGroup.position.set(-7.6, 3.55, -1.63);
  const clockFace = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.42, 0.04, 28),
    new THREE.MeshStandardMaterial({ color: 0xe8ddc8, roughness: 0.5 })
  );
  clockFace.rotation.x = Math.PI / 2;
  clockGroup.add(clockFace);
  const clockRim = new THREE.Mesh(
    new THREE.TorusGeometry(0.42, 0.03, 10, 28),
    new THREE.MeshStandardMaterial({ color: 0x1e2026, roughness: 0.4, metalness: 0.4 })
  );
  clockGroup.add(clockRim);
  for (let h = 0; h < 12; h++) {
    const angle = (h / 12) * Math.PI * 2;
    const tick = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.06, 0.01),
      new THREE.MeshStandardMaterial({ color: 0x2a241c })
    );
    tick.position.set(Math.sin(angle) * 0.34, Math.cos(angle) * 0.34, 0.025);
    tick.rotation.z = -angle;
    clockGroup.add(tick);
  }
  const minuteHand = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.3, 0.012), new THREE.MeshStandardMaterial({ color: 0x181614 }));
  minuteHand.position.set(0, 0.14, 0.03);
  clockGroup.add(minuteHand);
  const hourHand = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.2, 0.012), new THREE.MeshStandardMaterial({ color: 0x181614 }));
  hourHand.position.set(0.07, 0.08, 0.035);
  hourHand.rotation.z = -0.9;
  clockGroup.add(hourHand);
  scene.add(clockGroup);
}

// --- INITIALIZE SCENE & CINEMATIC DIRECTIONAL LIGHTING ---
addRoomAndProps();
makeMonitor(monitorSpecs[0]);
makeMonitor(monitorSpecs[1], true);
makeMonitor(monitorSpecs[2]);
addPerson();
addLofiClutter();

// Make the whole character/chair group fade as ONE flat silhouette rather than
// as ~30 independently-blending primitives (see applySilhouetteFade for why the
// opacity-tween and Fresnel-rim approaches both failed).
//
// Every mesh in the group is enrolled, not just the ones already authored with
// `transparent: true` — a couple (the backrest grain strips) were not, and they
// stayed stubbornly solid while the rest of the figure dissolved around them.
const silhouetteFadeMaterials = [];
const silhouetteBodyMeshes = [];
silhouetteGroup.traverse((child) => {
  if (!child.isMesh || !child.material) return;
  // Renders after the depth pre-pass proxies below, and after every other
  // transparent object in the scene.
  child.renderOrder = 2;
  silhouetteBodyMeshes.push(child);
  // Materials are shared across many meshes (one hoodieMat for a dozen parts),
  // so patch each distinct material exactly once.
  if (!silhouetteFadeMaterials.includes(child.material)) {
    applySilhouetteFade(child.material);
    silhouetteFadeMaterials.push(child.material);
  }
});

// Depth pre-pass. `transparent: true` keeps these in the transparent queue —
// i.e. AFTER all opaque geometry, so the monitors and room behind the character
// still get drawn — while renderOrder 1 puts them ahead of the body itself, so
// the body's own depth test has the nearest-surface depth to reject against.
const silhouetteDepthMat = new THREE.MeshBasicMaterial({
  colorWrite: false, depthWrite: true, transparent: true
});
for (const mesh of silhouetteBodyMeshes) {
  // Parented to the mesh with an identity local transform, so the proxy shares
  // its world matrix exactly (including the breathing bob) with no bookkeeping.
  const proxy = new THREE.Mesh(mesh.geometry, silhouetteDepthMat);
  proxy.renderOrder = 1;
  mesh.add(proxy);
}

// Cinematic Directional Night Atmosphere Lighting
// 1. Hemisphere ambient (slightly brighter for overall visibility)
scene.add(new THREE.HemisphereLight(0x18243c, 0x22160d, 1.15));

// 2. Window Moonlight
const moonDir = new THREE.DirectionalLight(0x789ef5, 1.6);
moonDir.position.set(-4.5, 7.5, -2.5);
moonDir.target.position.set(0, 1.4, 1.0);
scene.add(moonDir);
scene.add(moonDir.target);

// 3. Screen Backlight Spill (rim outline on character)
const screenBacklight = new THREE.PointLight(0x6095ff, 2.2, 5.5, 1.4);
screenBacklight.position.set(0, 1.95, 0.6);
scene.add(screenBacklight);

// 4. Trailing Ivy Vine Plant (Top-left window frame, matching reference)
const ivyLeafMat = new THREE.MeshStandardMaterial({ color: 0x2a5e2e, roughness: 0.82 });
const ivyDarkMat = new THREE.MeshStandardMaterial({ color: 0x1a3e1c, roughness: 0.85 });
const ivyStemMat = new THREE.MeshStandardMaterial({ color: 0x3a5a28, roughness: 0.7 });

const ivyGroup = new THREE.Group();
ivyGroup.position.set(-4.2, 7.2, -1.55);

// Main trailing stem
const ivyStem = new THREE.Mesh(
  new THREE.CylinderGeometry(0.02, 0.015, 3.2, 6),
  ivyStemMat
);
ivyStem.position.set(0.3, -1.4, 0.1);
ivyStem.rotation.z = 0.15;
ivyGroup.add(ivyStem);

// Ivy leaves cascading down the stem
const ivyLeafPositions = [
  { x: 0.1, y: -0.2, z: 0.12, rot: 0.3, s: 0.8 },
  { x: 0.35, y: -0.6, z: 0.14, rot: -0.4, s: 1.0 },
  { x: 0.15, y: -0.95, z: 0.1, rot: 0.5, s: 0.9 },
  { x: 0.45, y: -1.3, z: 0.15, rot: -0.2, s: 1.1 },
  { x: 0.25, y: -1.65, z: 0.12, rot: 0.6, s: 0.85 },
  { x: 0.5, y: -2.0, z: 0.14, rot: -0.5, s: 1.0 },
  { x: 0.3, y: -2.35, z: 0.11, rot: 0.35, s: 0.75 },
  { x: 0.55, y: -2.65, z: 0.13, rot: -0.3, s: 0.9 },
  { x: 0.2, y: -0.4, z: 0.16, rot: 0.8, s: 0.7 },
  { x: 0.4, y: -1.0, z: 0.18, rot: -0.7, s: 0.65 },
  { x: 0.6, y: -1.5, z: 0.12, rot: 0.4, s: 0.8 },
  { x: 0.35, y: -2.5, z: 0.16, rot: -0.6, s: 0.6 },
];
for (const lp of ivyLeafPositions) {
  const leafMat = Math.random() > 0.5 ? ivyLeafMat : ivyDarkMat;
  const leaf = new THREE.Mesh(
    new THREE.SphereGeometry(0.08 * lp.s, 6, 5),
    leafMat
  );
  leaf.position.set(lp.x, lp.y, lp.z);
  leaf.scale.set(1.2, 0.35, 1.0);
  leaf.rotation.z = lp.rot;
  leaf.rotation.x = 0.2 + Math.random() * 0.3;
  ivyGroup.add(leaf);
}
scene.add(ivyGroup);

// 5. Potted Plant on Right Side of Desk (matching reference)
const rightPlantGroup = new THREE.Group();
rightPlantGroup.position.set(4.0, 0.94, 1.20);

// Terracotta pot
const terraMat = new THREE.MeshStandardMaterial({ color: 0x8b5e3c, roughness: 0.7 });
cyl(0.22, 0.16, 0.30, 14, terraMat, new THREE.Vector3(0, 0.15, 0), rightPlantGroup);
// Soil
cyl(0.20, 0.20, 0.04, 14, new THREE.MeshStandardMaterial({ color: 0x2a1f14, roughness: 0.95 }), new THREE.Vector3(0, 0.30, 0), rightPlantGroup);

// Leafy foliage (multiple small leaves fanning outward)
const foliageMat = new THREE.MeshStandardMaterial({ color: 0x264d2a, roughness: 0.8 });
const foliageLightMat = new THREE.MeshStandardMaterial({ color: 0x3a6e3e, roughness: 0.78 });
for (let l = 0; l < 10; l++) {
  const angle = (l / 10) * Math.PI * 2 + Math.random() * 0.3;
  const r = 0.12 + Math.random() * 0.08;
  const h = 0.35 + Math.random() * 0.25;
  const lmat = l % 3 === 0 ? foliageLightMat : foliageMat;
  const leafMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.06 + Math.random() * 0.04, 6, 5),
    lmat
  );
  leafMesh.position.set(Math.cos(angle) * r, h, Math.sin(angle) * r);
  leafMesh.scale.set(1.4, 0.4, 1.0);
  leafMesh.rotation.z = Math.cos(angle) * 0.4;
  leafMesh.rotation.x = Math.sin(angle) * 0.3;
  rightPlantGroup.add(leafMesh);
}
scene.add(rightPlantGroup);

// --- PROCEDURAL WEB AUDIO ATMOSPHERE & SFX ENGINE ---
class AudioManager {
  constructor() {
    this.ctx = null;
    this.isPlaying = false;
    this.masterGain = null;
    this.ambientGain = null;
    this.noiseNode = null;
    this.chordOscs = [];
  }

  init() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioCtx();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.7, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    this.ambientGain = this.ctx.createGain();
    this.ambientGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.ambientGain.connect(this.masterGain);

    this.buildAmbient();
  }

  buildAmbient() {
    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * 0.025;
    }
    this.noiseNode = this.ctx.createBufferSource();
    this.noiseNode.buffer = noiseBuffer;
    this.noiseNode.loop = true;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(650, this.ctx.currentTime);

    this.noiseNode.connect(noiseFilter);
    noiseFilter.connect(this.ambientGain);
    this.noiseNode.start();

    // Lo-Fi Drone chord
    const freqs = [65.41, 98.0, 116.54, 155.56];
    freqs.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq + (Math.random() - 0.5) * 0.4, this.ctx.currentTime);

      const oscGain = this.ctx.createGain();
      oscGain.gain.setValueAtTime(0.04 / (idx + 1), this.ctx.currentTime);

      osc.connect(oscGain);
      oscGain.connect(this.ambientGain);
      osc.start();
      this.chordOscs.push(osc);
    });
  }

  toggle() {
    this.init();
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    this.isPlaying = !this.isPlaying;
    const now = this.ctx.currentTime;
    if (this.isPlaying) {
      this.ambientGain.gain.cancelScheduledValues(now);
      this.ambientGain.gain.linearRampToValueAtTime(0.85, now + 1.2);
      audioToggleBtn.classList.add('is-playing');
      audioLabel.textContent = 'LO-FI AUDIO: ON';
    } else {
      this.ambientGain.gain.cancelScheduledValues(now);
      this.ambientGain.gain.linearRampToValueAtTime(0, now + 0.6);
      audioToggleBtn.classList.remove('is-playing');
      audioLabel.textContent = 'LO-FI AUDIO: OFF';
    }
  }

  playHover() {
    if (!this.ctx || this.ctx.state === 'suspended') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(950, now);
    osc.frequency.exponentialRampToValueAtTime(1400, now + 0.04);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  playEnter(id) {
    if (!this.ctx || this.ctx.state === 'suspended') return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    const baseFreq = id === 'code' ? 180 : id === 'design' ? 220 : 260;
    osc.frequency.setValueAtTime(baseFreq * 2, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.55);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2400, now);
    filter.frequency.exponentialRampToValueAtTime(120, now + 0.55);

    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.65);
  }

  playReturn() {
    if (!this.ctx || this.ctx.state === 'suspended') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(660, now + 0.3);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.38);
  }
}

const audio = new AudioManager();
if (audioToggleBtn) {
  audioToggleBtn.addEventListener('click', () => audio.toggle());
}

// --- INTERACTION & CAMERA GLIDE WITH STICKY HYSTERESIS ---
let hoverDebounceTimer = null;
// Guards against a browser quirk: hiding the full-screen world-view overlay
// re-runs hit-testing under a stationary cursor, which can fire a "phantom"
// trusted mouseenter/focus on whichever HUD button was underneath — yanking
// the camera back into that monitor's hover zoom right after returning home.
let suppressHoverUntil = 0;

// --- Runaway-hover guard (see the pointermove handler for the full story) ---
// Hover picking raycasts from the live camera, and committing a hover MOVES
// that camera — so the act of selecting a monitor re-aims the very ray that
// selected it. Left unguarded that feeds back on itself and walks the camera
// along the desk. These two are the responsiveness/stability dial: lower the
// epsilon to unblock sooner after a glide, lower the travel to react to
// smaller cursor moves. Both only ever gate RAYCAST-driven changes.
const CAMERA_SETTLE_EPSILON = 0.12;   // world units from cameraGoal
const HOVER_SWITCH_TRAVEL = 0.05;     // NDC distance; ~2.5% of viewport width
let cameraSettled = true;
// Where the cursor was the moment the camera last finished gliding. Switch
// travel is measured from here rather than from the previous hover commit,
// because the tail of a gesture keeps firing events all through the glide —
// measuring from the commit would bank that motion and spend it the instant
// the camera arrived, which is the runaway all over again.
const switchAnchor = new THREE.Vector2(3, 3);

function setHover(target) {
  if (entering || hovered === target) return;
  if (target && performance.now() < suppressHoverUntil) return;
  const previous = hovered;
  hovered = target;
  body.classList.toggle('is-hovering', Boolean(target));

  if (target && !previous) {
    audio.playHover();
  }

  buttons.forEach((button) =>
    button.classList.toggle('active', button.dataset.world === target?.userData.spec.id)
  );

  monitorTargets.forEach((hit) => {
    hit.userData.light.intensity = hit === target ? 2.8 : 1.35;
    hit.userData.group.scale.setScalar(
      hit === target
        ? hit.userData.spec.id === 'design' ? 1.24 : 1.06
        : hit.userData.spec.id === 'design' ? 1.18 : 1
    );
  });

  if (target) {
    cameraGoal.copy(target.userData.spec.hoverCamera);
    lookGoal.copy(target.userData.spec.hoverLook);
  } else {
    cameraGoal.copy(homeCamera);
    lookGoal.copy(homeLook);
  }
}

// Worlds that have grown into real pages of their own. The rest still open as
// the in-page overlay. Entering a routed world plays the same camera push into
// the monitor, then floods the viewport with that screen's colour and hands off
// to the document — so the cut lands while the screen already fills the frame
// and reads as travelling INTO it rather than as a page navigation.
// `surface` is the destination page's background. The flood blooms in the
// monitor's own colour, then blows out to that exact value before the
// navigation fires — so the document swap happens between two frames of the
// same colour instead of cutting from a dark room to a white page.
const WORLD_ROUTES = { code: { href: 'code.html', surface: '#ecf0f3' } };
const screenFlood = document.querySelector('.screen-flood');

// Entry choreography. Fixed offsets, deliberately: the camera push has to feel
// identical on localhost and on a cold connection, and the only way to get
// that is to stop the timing depending on when the next document arrives
// (which is what prefetching it at idle makes cheap).
// The flood must be FULLY opaque before the blow-out starts, or the green
// stage of the ramp is drawn onto a transparent element and never seen. Bloom
// at 440 + a 160ms fade lands it solid at ~600; the blow-out then has 80ms of
// solid colour to start from.
const ENTER_BLOOM_MS = 440;    // monitor colour swallows the frame
const ENTER_BLOWOUT_MS = 680;  // …then over-exposes and settles
const BLOWOUT_MS = 200;
// Safety net only. Navigation normally waits on the animation's own `finished`
// promise, so it cannot be cut off mid-ramp the way a hand-set offset was.
const ENTER_NAVIGATE_FALLBACK_MS = ENTER_BLOWOUT_MS + BLOWOUT_MS + 260;

// Resolves any CSS colour — hex, rgb(), a var() lookup — to a literal rgb()
// string, by letting the canvas 2D context do the parsing. The blow-out needs
// real values rather than custom properties: see the note in styles.css.
const colourProbe = document.createElement('canvas').getContext('2d');
function resolveColour(value, fallback = '#ffffff') {
  try {
    colourProbe.fillStyle = fallback;
    colourProbe.fillStyle = value;
    return colourProbe.fillStyle;
  } catch {
    return fallback;
  }
}
function mixColours(a, b, amount) {
  const parse = (c) => {
    colourProbe.fillStyle = c;
    const hex = colourProbe.fillStyle;
    if (hex.startsWith('#')) {
      return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    }
    return hex.match(/\d+/g).slice(0, 3).map(Number);
  };
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const m = (x, y) => Math.round(x + (y - x) * amount);
  return `rgb(${m(ar, br)}, ${m(ag, bg)}, ${m(ab, bb)})`;
}

function openWorld(id) {
  if (entering) return;
  const target = monitorTargets.find((hit) => hit.userData.spec.id === id);
  if (!target) return;

  if (hoverDebounceTimer) {
    clearTimeout(hoverDebounceTimer);
    hoverDebounceTimer = null;
  }

  entering = true;
  setHover(target);
  body.classList.add('is-entering');
  audio.playEnter(id);

  cameraGoal.copy(target.userData.spec.enterCamera);
  lookGoal.set(target.userData.spec.x, 2.125, -0.15);

  const route = WORLD_ROUTES[id];
  if (route) {
    if (prefersReducedMotion) {
      window.location.href = route.href;
      return;
    }
    // The bloom starts before the glide finishes so the two overlap instead of
    // queueing; the camera is still pushing in underneath as the screen takes
    // over the frame.
    // Resolved now, once, into literal colours the animation can interpolate
    // without depending on custom-property resolution inside keyframes.
    const accent = resolveColour(
      getComputedStyle(document.documentElement).getPropertyValue(`--${id}`).trim(),
      '#ffffff'
    );
    // Midpoint: the accent's own hue washed hot, so the phosphor reads as
    // getting brighter rather than crossfading to a different colour.
    const hot = mixColours(accent, '#ffffff', 0.5);

    let navigated = false;
    const go = () => {
      if (navigated) return;
      navigated = true;
      window.location.href = route.href;
    };

    window.setTimeout(() => {
      if (screenFlood) {
        screenFlood.style.backgroundColor = accent;
        screenFlood.classList.add('active');
      }
    }, ENTER_BLOOM_MS);

    window.setTimeout(() => {
      if (!screenFlood?.animate) return;
      // Easing is LINEAR on purpose. An ease-out here maps most of the colour
      // ramp into the first few milliseconds: measured with a
      // cubic-bezier(.33,0,.1,1) the flood hit pure white by 68ms and then
      // spent 112ms travelling from rgb(255,255,255) to rgb(236,240,243),
      // which is visually nothing. The result was green, four frames, white —
      // a jump wearing an animation. Linear keeps each stage on screen for the
      // share of the duration its offsets claim; the shaping lives in the
      // per-keyframe easings instead.
      const blowout = screenFlood.animate(
        [
          { backgroundColor: accent, offset: 0, easing: 'cubic-bezier(.5, 0, .8, .4)' },
          { backgroundColor: hot, offset: 0.45, easing: 'cubic-bezier(.3, .5, .5, 1)' },
          { backgroundColor: '#ffffff', offset: 0.70 },
          { backgroundColor: '#ffffff', offset: 0.82 },
          { backgroundColor: route.surface, offset: 1 },
        ],
        { duration: BLOWOUT_MS, easing: 'linear', fill: 'forwards' }
      );
      // Navigating off the animation's own completion, rather than a hand-set
      // offset, is what guarantees the ramp is never cut short.
      blowout.finished.then(go, go);
    }, ENTER_BLOWOUT_MS);

    // Fires only if the animation never resolves (or WAAPI is unavailable).
    window.setTimeout(go, ENTER_NAVIGATE_FALLBACK_MS);
    return;
  }

  window.setTimeout(() => {
    const page = pages.find((item) => item.dataset.worldView === id);
    if (!page) return;
    page.hidden = false;
    requestAnimationFrame(() => page.classList.add('visible'));
  }, prefersReducedMotion ? 0 : 820);
}

// Coming back from a routed world, the browser may restore this document from
// the back/forward cache with every variable exactly as we left it — mid-entry,
// flood still up, camera parked inside a monitor. Reset to the room.
window.addEventListener('pageshow', (event) => {
  if (!event.persisted) return;
  entering = false;
  body.classList.remove('is-entering');
  if (screenFlood) screenFlood.classList.remove('active', 'blown');
  setHover(null);
  suppressHoverUntil = performance.now() + 300;
  camera.position.copy(homeCamera);
  lookNow.copy(homeLook);
  cameraGoal.copy(homeCamera);
  lookGoal.copy(homeLook);
  silhouetteFadeAmount = 0;
});

function returnRoom() {
  const page = pages.find((item) => !item.hidden);
  if (!page) return;

  audio.playReturn();
  page.classList.remove('visible');

  window.setTimeout(() => {
    page.hidden = true;
    entering = false;
    body.classList.remove('is-entering');
    setHover(null);
    suppressHoverUntil = performance.now() + 300;
  }, prefersReducedMotion ? 0 : 480);
}

// Event Listeners with Sticky Workspace Hysteresis
canvas.addEventListener('pointermove', (event) => {
  if (entering) return;
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  // Picking raycasts from the live camera, and every hover change MOVES that
  // camera — so a hover change re-aims the very ray that produced it. The tail
  // of a gesture (a real mouse fires 100+ events/sec, and the hand keeps
  // trickling them out while it decelerates) then gets evaluated against a
  // camera that has already swung, lands somewhere completely different, and
  // commits again. Zoom into EXPLORE, flick left to DESIGN, and the camera
  // coasts straight past DESIGN into CODE with the mouse effectively still;
  // the same loop in the other direction makes a fresh hover bounce back home
  // mid-glide.
  //
  // So every raycast-driven hover change has to prove it came from the user
  // and not from the camera: the glide must have finished, and the cursor must
  // have travelled since it finished (measured from where it was when the
  // camera came to rest — see switchAnchor for why not from the last commit).
  // The nav buttons and clicks bypass this entirely; they were never ambiguous.
  const userDriven = cameraSettled && pointer.distanceTo(switchAnchor) >= HOVER_SWITCH_TRAVEL;

  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(monitorTargets, false)[0]?.object || null;

  if (hit) {
    // The ray is on a monitor, so we are definitely not unhovering — kill any
    // pending release whether or not the change below is honoured.
    if (hoverDebounceTimer) {
      clearTimeout(hoverDebounceTimer);
      hoverDebounceTimer = null;
    }
    if (hit !== hovered && !userDriven) return;
    setHover(hit);
    return;
  }

  // If already previewing a monitor:
  if (hovered) {
    // Check if cursor is still in the active workspace area:
    // User can move mouse freely across the zoomed preview without losing focus!
    const inDeskZone = pointer.y > -0.38 && pointer.y < 0.44 && Math.abs(pointer.x) < 0.46;

    if (inDeskZone || !userDriven) {
      if (hoverDebounceTimer) {
        clearTimeout(hoverDebounceTimer);
        hoverDebounceTimer = null;
      }
      return; // Keep active preview locked in place!
    }

    // Cursor deliberately moved away (down to floor, up to ceiling, or out of window):
    if (!hoverDebounceTimer) {
      hoverDebounceTimer = setTimeout(() => {
        setHover(null);
        hoverDebounceTimer = null;
      }, 120);
    }
  } else {
    setHover(null);
  }
});

canvas.addEventListener('pointerleave', () => {
  if (entering) return;
  if (hoverDebounceTimer) clearTimeout(hoverDebounceTimer);
  hoverDebounceTimer = setTimeout(() => {
    setHover(null);
    hoverDebounceTimer = null;
  }, 160);
});

canvas.addEventListener('click', () => {
  if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
  if (hovered) {
    openWorld(hovered.userData.spec.id);
  } else {
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(monitorTargets, false)[0]?.object || null;
    if (hit) openWorld(hit.userData.spec.id);
  }
});

buttons.forEach((button) => {
  button.addEventListener('mouseenter', () => {
    if (hoverDebounceTimer) {
      clearTimeout(hoverDebounceTimer);
      hoverDebounceTimer = null;
    }
    setHover(monitorTargets.find((hit) => hit.userData.spec.id === button.dataset.world));
  });
  button.addEventListener('focus', () => {
    if (hoverDebounceTimer) {
      clearTimeout(hoverDebounceTimer);
      hoverDebounceTimer = null;
    }
    setHover(monitorTargets.find((hit) => hit.userData.spec.id === button.dataset.world));
  });
  button.addEventListener('click', () => {
    if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
    openWorld(button.dataset.world);
  });
});

document.querySelectorAll('.back-button').forEach((button) =>
  button.addEventListener('click', returnRoom)
);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (entering) returnRoom();
    else setHover(null);
  }
});

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);

// --- 60+ FPS ANIMATION LOOP ---
let lastTime = performance.now();

function animate() {
  const now = performance.now();
  const delta = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  const time = now * 0.001;
  // Entering used to be the slowest of the three (3.1) so the push would read
  // as cinematic. It read as a stall instead — the camera was still crawling
  // when the flood arrived. It now completes inside ENTER_BLOOM_MS.
  const dampFactor = prefersReducedMotion ? 25 : entering ? 5.0 : hovered ? 6.2 : 5.8;

  // Frame-rate independent smooth damping for buttery camera gliding
  camera.position.x = THREE.MathUtils.damp(camera.position.x, cameraGoal.x, dampFactor, delta);
  camera.position.y = THREE.MathUtils.damp(camera.position.y, cameraGoal.y, dampFactor, delta);
  camera.position.z = THREE.MathUtils.damp(camera.position.z, cameraGoal.z, dampFactor, delta);

  lookNow.x = THREE.MathUtils.damp(lookNow.x, lookGoal.x, dampFactor, delta);
  lookNow.y = THREE.MathUtils.damp(lookNow.y, lookGoal.y, dampFactor, delta);
  lookNow.z = THREE.MathUtils.damp(lookNow.z, lookGoal.z, dampFactor, delta);
  camera.lookAt(lookNow);

  // Re-anchor hover switching whenever the camera comes to rest: from here on
  // any picking-ray movement is the user's doing, not the glide's.
  const settledNow = camera.position.distanceToSquared(cameraGoal) < CAMERA_SETTLE_EPSILON * CAMERA_SETTLE_EPSILON;
  if (settledNow && !cameraSettled) switchAnchor.copy(pointer);
  cameraSettled = settledNow;

  // CRT Life: a slow scanline roll (visible motion, not a distracting speed)
  // plus a small, localized status-LED pulse — a tasteful bit of "alive"
  // without the whole screen brightening and dimming like before
  monitorTargets.forEach((hit, idx) => {
    const { scanlineOverlay, ledMat, ledBaseHsl, led } = hit.userData;
    if (scanlineOverlay) {
      scanlineOverlay.material.map.offset.y = (time * 0.08) % 1;
    }
    if (ledMat && led) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 2.2 + idx * 2.1);
      ledMat.color.setHSL(ledBaseHsl.h, ledBaseHsl.s, THREE.MathUtils.lerp(0.35, 0.72, pulse));
      const s = 1 + 0.16 * pulse;
      led.scale.setScalar(s);
    }
  });

  // Silhouette Character POV Fade Out — flat single-blend dissolve (see applySilhouetteFade)
  if (silhouetteGroup) {
    const breath = Math.sin(time * 1.5) * 0.012;
    silhouetteGroup.position.y = 0.02 + breath;

    const distToHome = camera.position.distanceTo(homeCamera);
    // The 0.9-unit dead zone matters: the camera itself damps home at 5.8, so
    // driving the fade off raw distance left the figure visibly ghosted for the
    // last half-second of an otherwise-finished return. Inside that radius the
    // figure is simply solid, and the fade still reaches ~0.5 at hover depth.
    const targetFade = entering ? 1 : THREE.MathUtils.clamp((distToHome - 0.9) / 5.5, 0, 0.94);
    // Asymmetric: fading out follows the camera's pace, but coming back to
    // solid is deliberately near-instant so it never lags behind the zoom-out.
    const fadeDamp = targetFade < silhouetteFadeAmount ? 16.0 : 8.0;
    silhouetteFadeAmount = THREE.MathUtils.damp(silhouetteFadeAmount, targetFade, fadeDamp, delta);

    for (const mat of silhouetteFadeMaterials) {
      if (mat.userData.shader) mat.userData.shader.uniforms.uFadeAmount.value = silhouetteFadeAmount;
    }
  }

  // Realistic Coffee Steam Simulation (Organic Curling Dissipation)
  if (steamParticles && steamParticles.userData.steamData) {
    const pos = steamParticles.geometry.attributes.position.array;
    const { steamData, mugX, mugY, mugZ } = steamParticles.userData;
    for (let i = 0; i < steamData.length; i++) {
      const d = steamData[i];
      d.age += delta * d.speed;
      if (d.age > 1.0) {
        d.age = 0;
        d.seed = Math.random() * 10;
      }
      
      const a = d.age;
      const y = mugY + a * 0.65;
      
      // Delicate natural wisps drifting upwards
      const curlX = Math.sin(time * 1.5 + a * 5.5 + d.strand * 2.1 + d.seed) * (0.015 + 0.045 * a);
      const curlZ = Math.cos(time * 1.2 + a * 4.2 + d.strand * 1.7 + d.seed) * (0.012 + 0.035 * a);
      
      pos[i * 3] = mugX + curlX;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = mugZ + curlZ;
    }
    steamParticles.geometry.attributes.position.needsUpdate = true;
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

camera.position.copy(homeCamera);
camera.lookAt(homeLook);
animate();

// --- REVEAL ---------------------------------------------------------------
// Everything above this point ran synchronously; the GLBs did not. Hold the
// boot overlay until both have landed AND a frame has been rendered with them
// in it, so the room appears complete rather than materialising the cat a beat
// later. The floor keeps a fast connection from flashing the overlay for 80ms,
// which is what made localhost and the deployed site feel like different sites.
const BOOT_FLOOR_MS = 900;
const BOOT_CEILING_MS = 9000;
const bootStart = performance.now();

function revealRoom() {
  if (body.classList.contains('booted')) return;
  // Both at once. Staggering the HUD behind the room read as the copy loading
  // in late rather than as choreography — the room is the thing you notice
  // arriving, so anything that follows it looks like it was waiting on
  // something.
  body.classList.add('booted');
  body.classList.remove('booting');
}

Promise.race([
  clutterReady,
  new Promise((resolve) => window.setTimeout(resolve, BOOT_CEILING_MS)),
]).then(() => {
  const held = performance.now() - bootStart;
  const wait = Math.max(0, BOOT_FLOOR_MS - held);
  window.setTimeout(() => {
    // Two frames: one to draw the newly-added props, one to be sure it landed.
    requestAnimationFrame(() => requestAnimationFrame(revealRoom));
  }, wait);
});

// The CODE page is a separate document, so entering it is a real navigation.
// Warmed at idle rather than on hover: by the time anyone has read the intro
// copy and moved to a monitor, the whole page is already in the HTTP cache, so
// the hand-off costs the same on a cold connection as it does on localhost.
const warmCodePage = () => {
  for (const href of ['code.html', 'code.css', 'code.js', 'projects.js']) {
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = href;
    document.head.appendChild(link);
  }
};
if ('requestIdleCallback' in window) requestIdleCallback(warmCodePage, { timeout: 3000 });
else window.setTimeout(warmCodePage, 2000);
