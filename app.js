import * as THREE from './node_modules/three/build/three.module.js';

const canvas = document.querySelector('#scene');
const body = document.body;
const buttons = [...document.querySelectorAll('.world-button')];
const pages = [...document.querySelectorAll('.world-view')];
const audioToggleBtn = document.querySelector('#audio-toggle');
const audioLabel = document.querySelector('.audio-label');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// --- HIGH PERFORMANCE WEBGL RENDERER ---
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
renderer.setClearColor(0x04060d, 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
renderer.shadowMap.enabled = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x06081a, 0.026);

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 80);
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(3, 3);

// --- BUTTERY SMOOTH CAMERA SYSTEM ---
const homeCamera = new THREE.Vector3(0, 3.35, 12.6);
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
const dynamicScreenRenderers = [];

// Helper function for building boxes
function box(w, h, d, material, pos, parent = scene, castShadow = true, receiveShadow = true) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(pos);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  parent.add(mesh);
  return mesh;
}

// Helper function for building cylinders
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

// --- ULTRA-DETAILED PIXEL-PERFECT CRT TEXTURE ENGINE (STATIC ZERO-OVERHEAD) ---
function createScreenTexture(id, color) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 768;
  const bctx = c.getContext('2d');
  const css = `#${new THREE.Color(color).getHexString()}`;

  if (id === 'code') {
    // === CODE SCREEN (Pixel-perfect Green Terminal) ===
    const grad = bctx.createRadialGradient(512, 384, 60, 512, 384, 620);
    grad.addColorStop(0, '#0f331a');
    grad.addColorStop(0.5, '#051b0c');
    grad.addColorStop(1, '#020b05');
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
    bctx.fillRect(775, 455, 80, 24); // Tape on top
    bctx.fillStyle = '#4a372c';
    bctx.font = '16px monospace';
    bctx.textAlign = 'center';
    bctx.fillText('MAY 94 / TAPE', 815, 675);
  }

  // Pre-baked scanlines across all CRTs
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

  // Materials with authentic retro plastic finishes
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

  // Pre-baked Ultra-detail CRT Texture (Zero GPU upload overhead)
  const screenTex = createScreenTexture(spec.id, spec.color);
  const screenMat = new THREE.MeshBasicMaterial({ map: screenTex });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.88, 1.34), screenMat);

  // Main Chiseled Monitor Cabinet
  box(2.28, 1.76, 0.62, shellMat, new THREE.Vector3(0, 0, 0), group);
  // Beveled Front Frame
  box(2.06, 1.52, 0.08, darkBezelMat, new THREE.Vector3(0, 0.04, 0.31), group);
  screen.position.set(0, 0.075, 0.36);
  group.add(screen);

  // Bottom Control Panel with Buttons & Dials
  box(2.06, 0.2, 0.1, darkBezelMat, new THREE.Vector3(0, -0.7, 0.31), group);
  for (let b = 0; b < 6; b++) {
    cyl(0.024, 0.024, 0.04, 12, buttonMat, new THREE.Vector3(-0.6 + b * 0.15, -0.7, 0.37), group, new THREE.Euler(Math.PI / 2, 0, 0));
  }

  // Pedestal Swivel Stand
  box(0.96, 0.14, 0.74, shellMat, new THREE.Vector3(0, -1.02, -0.04), group);
  box(1.52, 0.09, 0.84, darkBezelMat, new THREE.Vector3(0, -1.11, -0.15), group);

  // Power LED
  const ledMat = new THREE.MeshBasicMaterial({ color: spec.color });
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 12), ledMat);
  led.position.set(0.8, -0.7, 0.37);
  group.add(led);

  // Monitor Glow PointLight — strong enough to visibly color the desk
  const light = new THREE.PointLight(spec.color, 1.2, 5.5, 1.8);
  light.position.set(0, 0.1, 1.15);
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

// --- DESK PROPS & ENVIRONMENT GEOMETRY ---
let steamParticles = null;

function addRoomAndProps() {
  // Warmer wood — visible grain catching the lamp light like the reference
  const wood = new THREE.MeshStandardMaterial({
    color: 0x4a2e1e,
    roughness: 0.82,
    metalness: 0.04
  });
  // Dark indigo wall — visible but moody, not pure black
  const wall = new THREE.MeshStandardMaterial({ color: 0x0e1225, roughness: 0.95 });
  const floor = new THREE.MeshStandardMaterial({ color: 0x120e18, roughness: 0.95 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.35, metalness: 0.85 });
  const plasticDark = new THREE.MeshStandardMaterial({ color: 0x1e2024, roughness: 0.6 });
  const retroBeige = new THREE.MeshStandardMaterial({ color: 0xd6ccba, roughness: 0.68 });

  // Main Room Architecture
  box(24, 11, 0.2, wall, new THREE.Vector3(0, 4.2, -2.1));
  box(24, 0.2, 15, floor, new THREE.Vector3(0, -0.9, 1.8));

  // Desk Surface & Sturdy Wooden Legs
  box(11.5, 0.38, 2.35, wood, new THREE.Vector3(0, 0.74, 0.95));
  box(11.0, 0.18, 0.7, wood, new THREE.Vector3(0, -0.18, 0.95));
  for (const x of [-5.1, 5.1]) {
    box(0.28, 2.2, 0.36, wood, new THREE.Vector3(x, -0.38, 0.95));
  }

  // --- WINDOW & CELESTIAL BACKDROP ---
  const windowFrame = new THREE.MeshStandardMaterial({ color: 0x12151e, roughness: 0.4, metalness: 0.3 });
  // Rich deep space backdrop — deep indigo-purple instead of near-black
  const glass = new THREE.MeshBasicMaterial({ color: 0x0c1232, transparent: true, opacity: 0.72 });
  const cosmicGlow = new THREE.MeshBasicMaterial({ color: 0x2a1868, transparent: true, opacity: 0.55 });

  box(9.0, 6.0, 0.12, glass, new THREE.Vector3(0, 4.3, -1.9));
  box(8.8, 5.8, 0.04, cosmicGlow, new THREE.Vector3(0, 4.3, -1.82));

  // Window Panes / Mullions
  box(0.18, 6.2, 0.2, windowFrame, new THREE.Vector3(0, 4.3, -1.7));
  box(9.2, 0.18, 0.2, windowFrame, new THREE.Vector3(0, 4.3, -1.7));
  box(9.2, 0.18, 0.2, windowFrame, new THREE.Vector3(0, 1.4, -1.7));
  box(9.2, 0.18, 0.2, windowFrame, new THREE.Vector3(0, 7.2, -1.7));
  box(0.18, 6.2, 0.2, windowFrame, new THREE.Vector3(-4.5, 4.3, -1.7));
  box(0.18, 6.2, 0.2, windowFrame, new THREE.Vector3(4.5, 4.3, -1.7));

  // Luminous Moon Mesh
  const moonMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.74, 28, 28),
    new THREE.MeshBasicMaterial({ color: 0xfff8e8 })
  );
  moonMesh.position.set(-2.2, 6.2, -1.78);
  scene.add(moonMesh);

  // Atmospheric Lunar Corona Glow — larger and more visible
  const coronaMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1.35, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0x8eaaff, transparent: true, opacity: 0.25 })
  );
  coronaMesh.position.copy(moonMesh.position);
  scene.add(coronaMesh);

  // Outer soft moonlight haze
  const moonHaze = new THREE.Mesh(
    new THREE.SphereGeometry(2.2, 20, 20),
    new THREE.MeshBasicMaterial({ color: 0x6680cc, transparent: true, opacity: 0.08 })
  );
  moonHaze.position.copy(moonMesh.position);
  scene.add(moonHaze);

  // Multi-color Nebula Starfield
  const starsGeo = new THREE.BufferGeometry();
  const starCoords = [];
  const starColors = [];
  const palette = [new THREE.Color(0xcbd6ff), new THREE.Color(0xffd4f4), new THREE.Color(0xffe1b8), new THREE.Color(0xaeeaff)];

  for (let i = 0; i < 600; i++) {
    starCoords.push((Math.random() - 0.5) * 8.8, 1.5 + Math.random() * 5.6, -1.75 + Math.random() * 0.08);
    const col = palette[Math.floor(Math.random() * palette.length)];
    starColors.push(col.r, col.g, col.b);
  }
  starsGeo.setAttribute('position', new THREE.Float32BufferAttribute(starCoords, 3));
  starsGeo.setAttribute('color', new THREE.Float32BufferAttribute(starColors, 3));
  const starsPoints = new THREE.Points(
    starsGeo,
    new THREE.PointsMaterial({ size: 0.04, vertexColors: true, transparent: true, opacity: 0.95 })
  );
  scene.add(starsPoints);

  // Nebula cloud patches — subtle colored fog areas in the starfield
  const nebulaMat1 = new THREE.MeshBasicMaterial({ color: 0x4422aa, transparent: true, opacity: 0.12 });
  const nebulaMat2 = new THREE.MeshBasicMaterial({ color: 0x882255, transparent: true, opacity: 0.1 });
  const nebula1 = new THREE.Mesh(new THREE.SphereGeometry(1.8, 12, 12), nebulaMat1);
  nebula1.position.set(2.5, 5.5, -1.82);
  nebula1.scale.set(2, 1, 0.3);
  scene.add(nebula1);
  const nebula2 = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 12), nebulaMat2);
  nebula2.position.set(-1.0, 4.8, -1.82);
  nebula2.scale.set(1.8, 0.8, 0.3);
  scene.add(nebula2);

  // Cascading Vine Leaves from Window Top
  // Subtle dark vine leaves — barely-there organic shapes
  const vineMat = new THREE.MeshStandardMaterial({ color: 0x132a18, roughness: 0.92 });
  for (let v = 0; v < 22; v++) {
    const vx = -4.2 + v * 0.42 + (Math.random() - 0.5) * 0.25;
    const vy = 7.1 - Math.random() * 1.2;
    const leafW = 0.08 + Math.random() * 0.1;
    const leafH = 0.2 + Math.random() * 0.45;
    box(leafW, leafH, 0.04, vineMat, new THREE.Vector3(vx, vy, -1.65));
  }

  // --- STUDIO AUDIO SPEAKERS (Left & Right) ---
  for (const sx of [-4.9, 4.9]) {
    const speakerGroup = new THREE.Group();
    speakerGroup.position.set(sx, 1.7, 0.4);
    box(0.96, 1.54, 0.86, plasticDark, new THREE.Vector3(0, 0, 0), speakerGroup);
    // Metallic Speaker Cones
    cyl(0.25, 0.25, 0.05, 20, metal, new THREE.Vector3(0, -0.22, 0.44), speakerGroup, new THREE.Euler(Math.PI / 2, 0, 0));
    cyl(0.1, 0.1, 0.05, 20, metal, new THREE.Vector3(0, 0.32, 0.44), speakerGroup, new THREE.Euler(Math.PI / 2, 0, 0));
    scene.add(speakerGroup);
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

  // --- CERAMIC COFFEE MUG ---
  const mugGroup = new THREE.Group();
  mugGroup.position.set(-1.88, 0.95, 1.45);
  // Visible dark ceramic mug — slightly lighter so lamp catches it
  const mugMat = new THREE.MeshStandardMaterial({ color: 0x242e3a, roughness: 0.45 });
  cyl(0.38, 0.38, 0.03, 20, wood, new THREE.Vector3(0, 0, 0), mugGroup);
  cyl(0.24, 0.22, 0.44, 20, mugMat, new THREE.Vector3(0, 0.24, 0), mugGroup);
  cyl(0.21, 0.21, 0.02, 16, new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.3 }), new THREE.Vector3(0, 0.41, 0), mugGroup);
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
  for (let c = 0; c < 3; c++) {
    const cassMat = new THREE.MeshStandardMaterial({
      color: c === 0 ? 0x222a38 : c === 1 ? 0x482420 : 0x1f2e24,
      roughness: 0.6
    });
    box(0.94, 0.08, 0.64, cassMat, new THREE.Vector3(-3.25, 0.96 + c * 0.09, 1.42), scene, true, true);
  }

  // --- VINTAGE WALKMAN (Right Desk) ---
  const walkmanMat = new THREE.MeshStandardMaterial({ color: 0x303642, metalness: 0.5, roughness: 0.4 });
  box(0.92, 0.14, 0.66, walkmanMat, new THREE.Vector3(3.25, 0.99, 1.45));
  box(0.4, 0.04, 0.35, glass, new THREE.Vector3(3.25, 1.07, 1.45));

  // --- OPEN SPIRAL NOTEBOOK (Right Foreground) ---
  const notebookCanvas = document.createElement('canvas');
  notebookCanvas.width = 256; notebookCanvas.height = 256;
  const nbCtx = notebookCanvas.getContext('2d');
  nbCtx.fillStyle = '#f0e6d6'; nbCtx.fillRect(0, 0, 256, 256);
  nbCtx.strokeStyle = '#c4b59f'; nbCtx.lineWidth = 1;
  for (let y = 30; y < 256; y += 22) {
    nbCtx.beginPath(); nbCtx.moveTo(20, y); nbCtx.lineTo(236, y); nbCtx.stroke();
  }
  nbCtx.fillStyle = '#3a2f26'; nbCtx.font = '14px monospace';
  nbCtx.fillText('// late night thoughts', 28, 55);
  nbCtx.fillText('3 worlds converging...', 28, 98);
  const notebookTex = new THREE.CanvasTexture(notebookCanvas);
  notebookTex.colorSpace = THREE.SRGBColorSpace;

  const notebookMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.85, 0.85),
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

  // --- ARTICULATED DESK LAMP (Right Side) ---
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

  // Visible glowing lamp bulb
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xffcc77 })
  );
  bulb.position.set(-0.72, 1.85, 0.1);
  lampGroup.add(bulb);
  scene.add(lampGroup);

  // === WARM AMBER DESK LAMP LIGHT — the hero light of the scene ===
  // Primary warm directional pool (the main warm glow bathing the desk)
  const deskLampLight = new THREE.PointLight(0xffaa5e, 2.8, 9.5, 1.6);
  deskLampLight.position.set(3.45, 2.7, 1.0);
  scene.add(deskLampLight);

  // Secondary warm fill (wider, softer warmth across the whole desk surface)
  const warmFill = new THREE.PointLight(0xff9944, 1.2, 7.0, 2.0);
  warmFill.position.set(2.0, 1.8, 1.4);
  scene.add(warmFill);

  // Subtle warm bounce off the desk surface (simulates indirect light)
  const deskBounce = new THREE.PointLight(0xffbb66, 0.5, 5.0, 2.0);
  deskBounce.position.set(0, 1.2, 1.6);
  scene.add(deskBounce);
}

// --- 3D SILHOUETTE CHARACTER ---
function addPerson() {
  silhouetteGroup = new THREE.Group();
  silhouetteGroup.position.set(0, 0.02, 2.05);

  const hoodie = new THREE.MeshStandardMaterial({
    color: 0x080a10,
    roughness: 0.96,
    transparent: true,
    opacity: 1
  });
  const chair = new THREE.MeshStandardMaterial({
    color: 0x121118,
    roughness: 0.9,
    transparent: true,
    opacity: 1
  });
  const rimBlue = new THREE.MeshStandardMaterial({
    color: 0x101c3a,
    roughness: 0.65,
    emissive: 0x071226,
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 1
  });

  // Ergonomic Mesh Chair
  box(2.25, 2.4, 0.55, chair, new THREE.Vector3(0, 0.72, 0.04), silhouetteGroup, true, true);
  box(2.7, 0.26, 1.42, chair, new THREE.Vector3(0, -0.32, 0.7), silhouetteGroup, true, true);

  // Torso
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.85, 1.72, 8, 18), hoodie);
  torso.position.set(0, 1.55, 0.1);
  torso.scale.z = 0.7;
  torso.name = 'torso';
  silhouetteGroup.add(torso);

  // Head & Hood
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.58, 26, 20), hoodie);
  head.position.set(0, 2.86, 0.03);
  head.scale.set(1, 1.08, 0.82);
  head.name = 'head';
  silhouetteGroup.add(head);

  const hood = new THREE.Mesh(new THREE.TorusGeometry(0.67, 0.16, 10, 24, Math.PI), rimBlue);
  hood.position.set(0, 2.66, 0.13);
  hood.rotation.x = Math.PI;
  silhouetteGroup.add(hood);

  // Headphones
  const bandMat = new THREE.MeshStandardMaterial({
    color: 0x242c41,
    roughness: 0.5,
    metalness: 0.25,
    transparent: true,
    opacity: 1
  });
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.065, 10, 28, Math.PI), bandMat);
  band.position.set(0, 2.92, 0.05);
  band.rotation.x = Math.PI;
  silhouetteGroup.add(band);

  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.14, 16), bandMat);
    ear.rotation.z = Math.PI / 2;
    ear.position.set(side * 0.59, 2.86, 0.03);
    silhouetteGroup.add(ear);
  }

  // Arms
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.15, 8, 14), hoodie);
    arm.position.set(side * 0.82, 1.42, 0.5);
    arm.rotation.z = side * -0.42;
    arm.rotation.x = 0.35;
    silhouetteGroup.add(arm);
  }

  scene.add(silhouetteGroup);

  // Silhouette Rim Lighting
  const blueRim = new THREE.PointLight(0x2a70ff, 0.65, 5, 2);
  blueRim.position.set(-0.8, 3.1, 0.5);
  scene.add(blueRim);

  const orangeRim = new THREE.PointLight(0xff7739, 0.45, 4, 2);
  orangeRim.position.set(2.8, 2.2, 0.5);
  scene.add(orangeRim);
}

// Build Scene
addRoomAndProps();
makeMonitor(monitorSpecs[0]);
makeMonitor(monitorSpecs[1], true);
makeMonitor(monitorSpecs[2]);
addPerson();

// Ambient & Celestial Lighting
// Hemisphere: cool blue sky + warm amber ground for that cozy late-night feel
scene.add(new THREE.HemisphereLight(0x2a3d78, 0x33200e, 1.6));

// Moonlight — cool blue fill illuminating the window area and upper walls
const moonFill = new THREE.PointLight(0x728cff, 1.4, 14, 1.8);
moonFill.position.set(-2.2, 6.4, -0.8);
scene.add(moonFill);

// Subtle ambient fill from window — low-level cool light on desk back
const windowAmbient = new THREE.PointLight(0x3344aa, 0.4, 8, 2.0);
windowAmbient.position.set(0, 3.5, -1.0);
scene.add(windowAmbient);

// --- WEB AUDIO ATMOSPHERE & SFX ENGINE ---
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

// --- INTERACTION & SMOOTH CAMERA GLIDE ---
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
    hit.userData.light.intensity = hit === target ? 2.5 : 1.2;
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

// --- 60+ FPS BUTTERY SMOOTH ANIMATION LOOP ---
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

  // Silhouette First-Person POV Fade Out
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

  // Steam Particle Animation
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
