import * as THREE from './node_modules/three/build/three.module.js';

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
const homeCamera = new THREE.Vector3(0, 3.25, 12.4);
const homeLook = new THREE.Vector3(0, 2.12, -0.15);
const cameraGoal = homeCamera.clone();
const lookGoal = homeLook.clone();
const lookNow = homeLook.clone();

let hovered = null;
let entering = false;
let silhouetteGroup = null;

const monitorSpecs = [
  {
    id: 'code',
    x: -3.15,
    color: 0x8eff56,
    hoverCamera: new THREE.Vector3(-2.6, 3.42, 9.35),
    hoverLook: new THREE.Vector3(-3.02, 2.2, -0.2),
    enterCamera: new THREE.Vector3(-3.15, 2.15, 2.75)
  },
  {
    id: 'design',
    x: 0,
    color: 0x5aa2ff,
    hoverCamera: new THREE.Vector3(2.75, 3.75, 8.85),
    hoverLook: new THREE.Vector3(0, 2.28, -0.35),
    enterCamera: new THREE.Vector3(0, 2.25, 2.65)
  },
  {
    id: 'explore',
    x: 3.15,
    color: 0xff9158,
    hoverCamera: new THREE.Vector3(2.6, 3.42, 9.35),
    hoverLook: new THREE.Vector3(3.02, 2.2, -0.2),
    enterCamera: new THREE.Vector3(3.15, 2.15, 2.75)
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

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

// --- REALISTIC RETRO SONY CRT MONITOR BUILDER ---
function makeMonitor(spec, isCentre = false) {
  const group = new THREE.Group();
  group.position.set(spec.x, 2.05, -0.15);
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
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.88, 1.34), screenMat);

  // Main Chiseled Monitor Cabinet
  box(2.28, 1.76, 0.62, shellMat, new THREE.Vector3(0, 0, 0), group);
  // Beveled Front Frame
  box(2.06, 1.52, 0.08, darkBezelMat, new THREE.Vector3(0, 0.04, 0.31), group);
  screen.position.set(0, 0.075, 0.36);
  group.add(screen);

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

  // Power Status LED
  const ledMat = new THREE.MeshBasicMaterial({ color: spec.color });
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 12), ledMat);
  led.position.set(0.8, -0.7, 0.37);
  group.add(led);

  // Directional CRT Phosphor Glow forward onto the desk (radius: 9.0, decay: 1.35)
  const light = new THREE.PointLight(spec.color, 1.5, 9.0, 1.35);
  light.position.set(0, 0.1, 1.05);
  group.add(light);

  // Clickable Raycast Hitbox
  const hit = new THREE.Mesh(
    new THREE.PlaneGeometry(1.9, 1.36),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  hit.position.set(0, 0.075, 0.39);
  hit.userData = { spec, group, light, screen };
  group.add(hit);
  monitorTargets.push(hit);

  scene.add(group);
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
    new THREE.MeshBasicMaterial({ map: sticky1Tex })
  );
  sticky1Mesh.position.set(-6.8, 3.4, -1.63);
  sticky1Mesh.rotation.z = -0.06;
  scene.add(sticky1Mesh);

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

  for (const sx of [-4.9, 4.9]) {
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

  // --- MECHANICAL RETRO KEYBOARD (Center Desk) ---
  const keyboardGroup = new THREE.Group();
  keyboardGroup.position.set(0, 0.95, 1.45);
  keyboardGroup.rotation.x = -0.06;

  box(2.94, 0.14, 1.08, retroBeige, new THREE.Vector3(0, 0, 0), keyboardGroup);
  box(2.76, 0.06, 0.92, plasticDark, new THREE.Vector3(0, 0.06, 0), keyboardGroup);

  const keyMat = new THREE.MeshStandardMaterial({ color: 0xede4d5, roughness: 0.6 });
  const keyDarkMat = new THREE.MeshStandardMaterial({ color: 0x48423a, roughness: 0.6 });
  for (let r = 0; r < 4; r++) {
    for (let k = 0; k < 14; k++) {
      const kx = -1.22 + k * 0.188;
      const kz = -0.32 + r * 0.18;
      const useDark = k === 0 || k === 13 || r === 0;
      box(0.14, 0.07, 0.14, useDark ? keyDarkMat : keyMat, new THREE.Vector3(kx, 0.1, kz), keyboardGroup);
    }
  }
  box(1.12, 0.07, 0.15, keyMat, new THREE.Vector3(0, 0.1, 0.32), keyboardGroup);
  scene.add(keyboardGroup);

  // --- RETRO MOUSE & MOUSEPAD ---
  const mousepad = new THREE.MeshStandardMaterial({ color: 0x10121a, roughness: 0.95 });
  box(1.0, 0.015, 1.15, mousepad, new THREE.Vector3(1.88, 0.94, 1.45));
  const mouseMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.22, 6, 12), retroBeige);
  mouseMesh.position.set(1.88, 0.99, 1.45);
  mouseMesh.scale.set(1, 0.6, 1.4);
  scene.add(mouseMesh);

  // --- CERAMIC COFFEE MUG WITH SATURN EMBLEM ---
  const mugGroup = new THREE.Group();
  mugGroup.position.set(-1.88, 0.95, 1.45);
  const mugMat = new THREE.MeshStandardMaterial({ color: 0x1e2632, roughness: 0.45 });
  cyl(0.38, 0.38, 0.03, 20, wood, new THREE.Vector3(0, 0, 0), mugGroup);
  cyl(0.24, 0.22, 0.44, 20, mugMat, new THREE.Vector3(0, 0.24, 0), mugGroup);
  cyl(0.21, 0.21, 0.02, 16, new THREE.MeshStandardMaterial({ color: 0x22150e, roughness: 0.3 }), new THREE.Vector3(0, 0.41, 0), mugGroup);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.035, 8, 16, Math.PI), mugMat);
  handle.position.set(-0.24, 0.24, 0);
  handle.rotation.y = Math.PI / 2;
  mugGroup.add(handle);
  scene.add(mugGroup);

  // Rising Steam Particle System
  const steamGeo = new THREE.BufferGeometry();
  const steamPos = [];
  for (let i = 0; i < 36; i++) {
    steamPos.push(
      -1.88 + (Math.random() - 0.5) * 0.15,
      1.4 + Math.random() * 0.7,
      1.45 + (Math.random() - 0.5) * 0.15
    );
  }
  steamGeo.setAttribute('position', new THREE.Float32BufferAttribute(steamPos, 3));
  const steamMat = new THREE.PointsMaterial({
    color: 0xded8ff,
    size: 0.055,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending
  });
  steamParticles = new THREE.Points(steamGeo, steamMat);
  scene.add(steamParticles);

  // --- CASSETTE TAPE STACKS (Left Desk) ---
  const tapeColors = [0x222a38, 0x482420, 0x1f2e24];
  for (let c = 0; c < 3; c++) {
    const cassMat = new THREE.MeshStandardMaterial({ color: tapeColors[c], roughness: 0.6 });
    box(0.94, 0.08, 0.64, cassMat, new THREE.Vector3(-3.25, 0.96 + c * 0.09, 1.42), scene, true, true);
  }

  // --- VINTAGE WALKMAN & CASSETTES (Right Desk) ---
  const walkmanMat = new THREE.MeshStandardMaterial({ color: 0x3a404c, metalness: 0.6, roughness: 0.35 });
  box(0.92, 0.14, 0.66, walkmanMat, new THREE.Vector3(3.25, 0.99, 1.45));
  box(0.42, 0.04, 0.36, new THREE.MeshBasicMaterial({ color: 0x10141c }), new THREE.Vector3(3.25, 1.07, 1.45));
  for (let c = 0; c < 2; c++) {
    const cassMat = new THREE.MeshStandardMaterial({ color: c === 0 ? 0x2e2824 : 0x1c2430, roughness: 0.6 });
    box(0.94, 0.08, 0.64, cassMat, new THREE.Vector3(4.25, 0.96 + c * 0.09, 1.45), scene, true, true);
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

  const shade = new THREE.Mesh(
    new THREE.ConeGeometry(0.38, 0.52, 20, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x1b1d24, roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide })
  );
  shade.position.set(-0.72, 2.05, 0.1);
  shade.rotation.z = Math.PI / 3;
  shade.rotation.x = 0.2;
  lampGroup.add(shade);

  // Glowing lamp bulb
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xffe099 })
  );
  bulb.position.set(-0.72, 1.85, 0.1);
  lampGroup.add(bulb);
  scene.add(lampGroup);

  // Primary warm directional lamp illumination (radius 14.0, decay 1.25)
  const deskLampLight = new THREE.PointLight(0xffa045, 2.5, 14.0, 1.25);
  deskLampLight.position.set(3.45, 2.7, 1.0);
  scene.add(deskLampLight);
}

// --- AUTHENTIC JAPANESE OAK BENTWOOD CHAIR & HOODIE DEVELOPER WITH HEADPHONES ---
function addPerson() {
  silhouetteGroup = new THREE.Group();
  // Placed further back from the desk (z = 2.65) for natural desk distance
  silhouetteGroup.position.set(0, 0.02, 2.65);

  // Materials
  // 1. Japanese Light Oak Wood (matching reference chair photo)
  const oakWoodMat = new THREE.MeshStandardMaterial({
    color: 0xc6a27e,
    roughness: 0.55,
    metalness: 0.05,
    transparent: true,
    opacity: 1
  });
  // 2. Matte Black Steel Frame
  const blackSteelMat = new THREE.MeshStandardMaterial({
    color: 0x16181e,
    roughness: 0.4,
    metalness: 0.8,
    transparent: true,
    opacity: 1
  });
  // 3. Dark Charcoal Navy Hoodie Fabric
  const hoodieMat = new THREE.MeshStandardMaterial({
    color: 0x111622,
    roughness: 0.85,
    metalness: 0.08,
    transparent: true,
    opacity: 1
  });
  const hoodFoldMat = new THREE.MeshStandardMaterial({
    color: 0x0c101a,
    roughness: 0.92,
    transparent: true,
    opacity: 1
  });
  // 4. Studio Monitor Headphones
  const headphoneMat = new THREE.MeshStandardMaterial({
    color: 0x1a1d26,
    roughness: 0.35,
    metalness: 0.65,
    transparent: true,
    opacity: 1
  });
  const silverMetalMat = new THREE.MeshStandardMaterial({
    color: 0x8fa0b8,
    roughness: 0.25,
    metalness: 0.9,
    transparent: true,
    opacity: 1
  });
  const hairMat = new THREE.MeshStandardMaterial({
    color: 0x080a10,
    roughness: 0.9,
    transparent: true,
    opacity: 1
  });

  // ==========================================
  // A. JAPANESE OAK BENTWOOD CHAIR (image-1.png) - 1.45x Scaled
  // ==========================================
  const chairGroup = new THREE.Group();
  chairGroup.scale.set(1.45, 1.4, 1.45);

  // 1. Oak Bentwood Low Mid-Backrest Panel
  const backrestMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.08, 0.54, 0.05),
    oakWoodMat
  );
  backrestMesh.position.set(0, 0.96, 0.46);
  backrestMesh.rotation.x = -0.06;
  chairGroup.add(backrestMesh);

  // 2. Oak Bentwood Seat Board
  const seatMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.04, 0.055, 0.92),
    oakWoodMat
  );
  seatMesh.position.set(0, 0.52, 0.82);
  chairGroup.add(seatMesh);

  // 3. Black Steel Tubular Frame Under Seat & Back Support
  cyl(0.022, 0.022, 0.78, 12, blackSteelMat, new THREE.Vector3(0, 0.48, 0.82), chairGroup, new THREE.Euler(0, 0, Math.PI / 2));
  for (const s of [-0.32, 0.32]) {
    cyl(0.018, 0.018, 0.52, 10, blackSteelMat, new THREE.Vector3(s, 0.74, 0.52), chairGroup, new THREE.Euler(0.24, 0, 0));
  }

  // 4. Minimalist Loop Armrests with Oak Wood Armpads
  for (const side of [-1, 1]) {
    cyl(0.018, 0.018, 0.42, 10, blackSteelMat, new THREE.Vector3(side * 0.54, 0.72, 0.75), chairGroup, new THREE.Euler(0, 0, side * 0.12));
    const armpad = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.028, 0.32), oakWoodMat);
    armpad.position.set(side * 0.56, 0.92, 0.75);
    chairGroup.add(armpad);
  }

  // 5. Black Gas Lift Cylinder
  cyl(0.045, 0.045, 0.36, 16, blackSteelMat, new THREE.Vector3(0, 0.32, 0.82), chairGroup);

  // 6. 5-Star Oak Wood Leg Base with Black Casters
  for (let w = 0; w < 5; w++) {
    const wAngle = (w / 5) * Math.PI * 2;
    const wx = Math.cos(wAngle) * 0.48;
    const wz = Math.sin(wAngle) * 0.48;

    const legMesh = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.055, 0.48), oakWoodMat);
    legMesh.position.set(wx * 0.5, 0.12, 0.82 + wz * 0.5);
    legMesh.rotation.y = -wAngle + Math.PI / 2;
    chairGroup.add(legMesh);

    const caster = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.04, 10), blackSteelMat);
    caster.position.set(wx, 0.04, 0.82 + wz);
    caster.rotation.z = Math.PI / 2;
    chairGroup.add(caster);
  }
  silhouetteGroup.add(chairGroup);

  // ==========================================
  // B. HUMANOID IN HOODIE WITH HEADPHONES (Taller Proportions)
  // ==========================================
  const personGroup = new THREE.Group();
  personGroup.scale.set(1.42, 1.55, 1.35);

  // 1. Broad, Natural Torso in Hoodie (slight forward lean)
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.44, 0.68, 12, 16), hoodieMat);
  torso.position.set(0, 1.12, 0.74);
  torso.scale.set(1.32, 1.0, 0.75);
  torso.rotation.x = 0.08;
  personGroup.add(torso);

  // 2. Anatomical Rounded Shoulders (Trapezius)
  const shoulderBeam = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.88, 8, 14), hoodieMat);
  shoulderBeam.position.set(0, 1.48, 0.69);
  shoulderBeam.rotation.z = Math.PI / 2;
  shoulderBeam.scale.set(1.0, 1.12, 0.88);
  personGroup.add(shoulderBeam);

  // Left and Right Deltoid volumes
  for (const side of [-1, 1]) {
    const delt = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), hoodieMat);
    delt.position.set(side * 0.54, 1.44, 0.69);
    delt.scale.set(1.0, 1.15, 0.9);
    personGroup.add(delt);
  }

  // 3. Draped Fabric Hood on Upper Back / Neck (matching image-2.png)
  const hoodDrape = new THREE.Mesh(
    new THREE.TorusGeometry(0.28, 0.08, 12, 24),
    hoodFoldMat
  );
  hoodDrape.position.set(0, 1.52, 0.64);
  hoodDrape.rotation.x = Math.PI / 2.6;
  hoodDrape.scale.set(1.15, 0.9, 1.1);
  personGroup.add(hoodDrape);

  const hoodCrease = new THREE.Mesh(
    new THREE.TorusGeometry(0.22, 0.05, 8, 18),
    hoodieMat
  );
  hoodCrease.position.set(0, 1.42, 0.66);
  hoodCrease.rotation.x = Math.PI / 2.8;
  personGroup.add(hoodCrease);

  // 4. Humanoid Head & Natural Hair Silhouette
  cyl(0.12, 0.14, 0.22, 16, hairMat, new THREE.Vector3(0, 1.68, 0.64), personGroup, new THREE.Euler(0.08, 0, 0));

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 24, 20), hairMat);
  head.position.set(0, 1.88, 0.62);
  head.scale.set(0.96, 1.08, 1.02);
  personGroup.add(head);

  const hairVolume = new THREE.Mesh(new THREE.SphereGeometry(0.275, 20, 18), hairMat);
  hairVolume.position.set(0, 1.92, 0.61);
  hairVolume.scale.set(1.02, 1.06, 1.08);
  personGroup.add(hairVolume);

  // 5. Studio Over-Ear Monitor Headphones (matching image-2.png)
  const headband = new THREE.Mesh(
    new THREE.TorusGeometry(0.29, 0.035, 10, 24, Math.PI),
    headphoneMat
  );
  headband.position.set(0, 1.92, 0.61);
  headband.rotation.x = Math.PI;
  personGroup.add(headband);

  for (const side of [-1, 1]) {
    const earcupGroup = new THREE.Group();
    earcupGroup.position.set(side * 0.29, 1.86, 0.61);
    earcupGroup.rotation.y = side * 0.1;

    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.07, 18), headphoneMat);
    cup.rotation.z = Math.PI / 2;
    earcupGroup.add(cup);

    const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.015, 16), silverMetalMat);
    badge.position.set(side * 0.038, 0, 0);
    badge.rotation.z = Math.PI / 2;
    earcupGroup.add(badge);

    box(0.015, 0.06, 0.03, silverMetalMat, new THREE.Vector3(0, 0.09, 0), earcupGroup);
    personGroup.add(earcupGroup);
  }

  // 6. Arms Extending Forward to Desk
  for (const side of [-1, 1]) {
    const upperArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.62, 6, 12), hoodieMat);
    upperArm.position.set(side * 0.58, 1.25, 0.72);
    upperArm.rotation.z = side * -0.25;
    upperArm.rotation.x = 0.45;
    personGroup.add(upperArm);

    const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.68, 6, 12), hoodieMat);
    forearm.position.set(side * 0.46, 0.95, 1.18);
    forearm.rotation.x = 1.05;
    forearm.rotation.y = side * 0.16;
    personGroup.add(forearm);
  }

  silhouetteGroup.add(personGroup);
  scene.add(silhouetteGroup);
}

// --- INITIALIZE SCENE & CINEMATIC DIRECTIONAL LIGHTING ---
addRoomAndProps();
makeMonitor(monitorSpecs[0]);
makeMonitor(monitorSpecs[1], true);
makeMonitor(monitorSpecs[2]);
addPerson();

// Cinematic Directional Night Atmosphere Lighting (Matching reference photo & illustration)
// 1. Balanced Night Hemisphere
scene.add(new THREE.HemisphereLight(0x18243c, 0x22160d, 0.95));

// 2. Window Moonlight Directional Light (cool key light from window)
const moonDir = new THREE.DirectionalLight(0x789ef5, 1.4);
moonDir.position.set(-4.5, 7.5, -2.5);
moonDir.target.position.set(0, 1.4, 1.0);
scene.add(moonDir);
scene.add(moonDir.target);

// 3. Screen Backlight Spill behind character (creates the authentic rim outline from reference photo)
const screenBacklight = new THREE.PointLight(0x6095ff, 1.8, 4.5, 1.5);
screenBacklight.position.set(0, 1.95, 0.6);
scene.add(screenBacklight);

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

// --- INTERACTION & CAMERA GLIDE ---
function setHover(target) {
  if (entering || hovered === target) return;
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
    hit.userData.light.intensity = hit === target ? 2.6 : 1.35;
    hit.userData.group.scale.setScalar(
      hit === target
        ? hit.userData.spec.id === 'design' ? 1.26 : 1.08
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

function openWorld(id) {
  if (entering) return;
  const target = monitorTargets.find((hit) => hit.userData.spec.id === id);
  if (!target) return;

  entering = true;
  setHover(target);
  body.classList.add('is-entering');
  audio.playEnter(id);

  cameraGoal.copy(target.userData.spec.enterCamera);
  lookGoal.set(target.userData.spec.x, 2.15, -0.2);

  window.setTimeout(() => {
    const page = pages.find((item) => item.dataset.worldView === id);
    if (!page) return;
    page.hidden = false;
    requestAnimationFrame(() => page.classList.add('visible'));
  }, prefersReducedMotion ? 0 : 320);
}

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
  }, prefersReducedMotion ? 0 : 200);
}

// Event Listeners
canvas.addEventListener('pointermove', (event) => {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(monitorTargets, false)[0]?.object || null;
  setHover(hit);
});

canvas.addEventListener('pointerleave', () => setHover(null));

canvas.addEventListener('click', () => {
  if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
  if (hovered) openWorld(hovered.userData.spec.id);
});

buttons.forEach((button) => {
  button.addEventListener('mouseenter', () =>
    setHover(monitorTargets.find((hit) => hit.userData.spec.id === button.dataset.world))
  );
  button.addEventListener('focus', () =>
    setHover(monitorTargets.find((hit) => hit.userData.spec.id === button.dataset.world))
  );
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
  const dampFactor = prefersReducedMotion ? 25 : 7.2;

  // Frame-rate independent smooth damping for buttery camera gliding
  camera.position.x = THREE.MathUtils.damp(camera.position.x, cameraGoal.x, dampFactor, delta);
  camera.position.y = THREE.MathUtils.damp(camera.position.y, cameraGoal.y, dampFactor, delta);
  camera.position.z = THREE.MathUtils.damp(camera.position.z, cameraGoal.z, dampFactor, delta);

  lookNow.x = THREE.MathUtils.damp(lookNow.x, lookGoal.x, dampFactor, delta);
  lookNow.y = THREE.MathUtils.damp(lookNow.y, lookGoal.y, dampFactor, delta);
  lookNow.z = THREE.MathUtils.damp(lookNow.z, lookGoal.z, dampFactor, delta);
  camera.lookAt(lookNow);

  // Silhouette Character POV Fade Out
  if (silhouetteGroup) {
    const breath = Math.sin(time * 1.5) * 0.012;
    silhouetteGroup.position.y = 0.02 + breath;

    const distToHome = camera.position.distanceTo(homeCamera);
    const targetOpacity = entering ? 0 : Math.max(0.08, 1 - (distToHome / 7.2));

    silhouetteGroup.traverse((child) => {
      if (child.isMesh && child.material && child.material.transparent) {
        child.material.opacity = THREE.MathUtils.damp(child.material.opacity, targetOpacity, 8.0, delta);
      }
    });
  }

  // Steam Particle Simulation
  if (steamParticles) {
    const pos = steamParticles.geometry.attributes.position.array;
    for (let i = 1; i < pos.length; i += 3) {
      pos[i] += delta * 0.18;
      pos[i - 1] += Math.sin(time * 2 + i) * 0.001;
      if (pos[i] > 2.05) {
        pos[i] = 1.38;
        pos[i - 1] = -1.88 + (Math.random() - 0.5) * 0.12;
      }
    }
    steamParticles.geometry.attributes.position.needsUpdate = true;
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

camera.position.copy(homeCamera);
camera.lookAt(homeLook);
animate();
