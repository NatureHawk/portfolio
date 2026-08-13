import * as THREE from './node_modules/three/build/three.module.js';

const canvas = document.querySelector('#scene');
const body = document.body;
const buttons = [...document.querySelectorAll('.world-button')];
const pages = [...document.querySelectorAll('.world-view')];
const audioToggleBtn = document.querySelector('#audio-toggle');
const audioLabel = document.querySelector('.audio-label');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// --- RENDERER & SCENE SETUP ---
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x060812, 1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x070914, 0.034);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 90);
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(3, 3);

// --- CAMERA TARGETS & STATES ---
const homeCamera = new THREE.Vector3(0, 3.4, 12.8);
const homeLook = new THREE.Vector3(0, 2.15, -0.15);
const cameraGoal = homeCamera.clone();
const lookGoal = homeLook.clone();
const lookNow = homeLook.clone();

let hovered = null;
let entering = false;
let silhouetteGroup = null;

// --- MONITOR SPECS ---
const monitorSpecs = [
  {
    id: 'code',
    x: -3.12,
    color: 0x9dff69,
    hoverCamera: new THREE.Vector3(-2.6, 3.45, 9.4),
    hoverLook: new THREE.Vector3(-2.95, 2.22, -0.2),
    enterCamera: new THREE.Vector3(-3.12, 2.15, 2.85)
  },
  {
    id: 'design',
    x: 0,
    color: 0x61a9ff,
    hoverCamera: new THREE.Vector3(2.8, 3.85, 8.9),
    hoverLook: new THREE.Vector3(0, 2.32, -0.35),
    enterCamera: new THREE.Vector3(0, 2.28, 2.75)
  },
  {
    id: 'explore',
    x: 3.12,
    color: 0xff9561,
    hoverCamera: new THREE.Vector3(2.6, 3.45, 9.4),
    hoverLook: new THREE.Vector3(2.95, 2.22, -0.2),
    enterCamera: new THREE.Vector3(3.12, 2.15, 2.85)
  }
];
const monitorTargets = [];
const dynamicScreenTextures = [];

// Helper function for building boxes
function box(width, height, depth, material, position, parent = scene, castShadow = true, receiveShadow = true) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  parent.add(mesh);
  return mesh;
}

// Helper function for building cylinders
function cyl(radiusTop, radiusBottom, height, radialSegments, material, position, parent = scene, rotation = null) {
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);
  if (rotation) mesh.rotation.copy(rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

// --- DYNAMIC CRT SCREEN TEXTURES ---
function createScreenCanvas(id, color) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 720;
  const ctx = c.getContext('2d');
  const css = `#${new THREE.Color(color).getHexString()}`;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;

  function render(time) {
    ctx.clearRect(0, 0, c.width, c.height);

    if (id === 'code') {
      // CODE MONITOR (Deep Emerald Matrix Terminal)
      const grad = ctx.createRadialGradient(512, 360, 40, 512, 360, 680);
      grad.addColorStop(0, '#0d2b15');
      grad.addColorStop(0.5, '#05170a');
      grad.addColorStop(1, '#020904');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, c.width, c.height);

      // Top status bar
      ctx.fillStyle = 'rgba(157,255,105,0.22)';
      ctx.fillRect(40, 36, 944, 38);
      ctx.fillStyle = css;
      ctx.font = '700 18px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('TRINITRON KV-1340 // SIGNAL: STABLE // PORT: 01', 56, 61);
      ctx.textAlign = 'right';
      ctx.fillText('STATUS: ONLINE', 968, 61);

      // Main Title
      ctx.textAlign = 'center';
      ctx.font = '900 128px monospace';
      ctx.fillStyle = css;
      ctx.shadowColor = css;
      ctx.shadowBlur = 28;
      ctx.fillText('CODE', 512, 320);
      ctx.shadowBlur = 0;

      // Subtitle
      ctx.fillStyle = 'rgba(238,225,207,0.85)';
      ctx.font = '26px monospace';
      ctx.fillText('systems / experiments', 512, 385);

      // Terminal Code Lines
      ctx.textAlign = 'left';
      ctx.font = '16px monospace';
      ctx.fillStyle = 'rgba(157,255,105,0.48)';
      const codeSnippets = [
        'const agent = await initUniverse({ mode: "systems" });',
        'import { neuralCore, memoryGraph } from "@engine/ai";',
        'function deployPipeline() { return new Stream(); }',
        '>> kernel.optimize({ latency: "ultra-low", threads: 16 });',
        '>> cache.sync([0x01, 0x02, 0x03]) // 3 worlds verified'
      ];
      for (let i = 0; i < codeSnippets.length; i++) {
        ctx.fillText(codeSnippets[i], 70, 470 + i * 36);
      }

      // Blinking cursor
      if (Math.floor(time * 2.5) % 2 === 0) {
        ctx.fillStyle = css;
        ctx.fillRect(70, 650, 20, 24);
      }
    } else if (id === 'design') {
      // DESIGN MONITOR (Sony Blueprint & Swiss Grid)
      const grad = ctx.createRadialGradient(512, 360, 40, 512, 360, 680);
      grad.addColorStop(0, '#102d6b');
      grad.addColorStop(0.5, '#071638');
      grad.addColorStop(1, '#030a1c');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, c.width, c.height);

      // Blueprint grid lines
      ctx.strokeStyle = 'rgba(97,169,255,0.18)';
      ctx.lineWidth = 1;
      for (let x = 40; x < c.width; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, c.height); ctx.stroke();
      }
      for (let y = 40; y < c.height; y += 40) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(c.width, y); ctx.stroke();
      }

      // Top Bar
      ctx.fillStyle = 'rgba(97,169,255,0.22)';
      ctx.fillRect(40, 36, 944, 38);
      ctx.fillStyle = css;
      ctx.font = '700 18px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('MULTISCAN 200ES // GRID: 16:10 // VECTOR PASS', 56, 61);
      ctx.textAlign = 'right';
      ctx.fillText('SWISS DESIGN MODE', 968, 61);

      // Main Title
      ctx.textAlign = 'center';
      ctx.font = '900 120px sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = css;
      ctx.shadowBlur = 24;
      ctx.fillText('DESIGN', 512, 310);
      ctx.shadowBlur = 0;

      // Subtitle
      ctx.fillStyle = 'rgba(97,169,255,0.9)';
      ctx.font = '26px monospace';
      ctx.fillText('identity / visual language', 512, 375);

      // Blueprint Glyphs & Layout Boxes
      ctx.strokeStyle = css;
      ctx.lineWidth = 2;
      ctx.strokeRect(70, 440, 160, 180);
      ctx.font = 'italic 700 110px serif';
      ctx.fillStyle = 'rgba(97,169,255,0.7)';
      ctx.fillText('a', 150, 565);

      // Palette swatches
      const colors = ['#1d4ed8', '#3b82f6', '#93c5fd', '#f8fafc'];
      for (let i = 0; i < colors.length; i++) {
        ctx.fillStyle = colors[i];
        ctx.fillRect(320 + i * 65, 540, 52, 52);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.strokeRect(320 + i * 65, 540, 52, 52);
      }

      // Target circle
      ctx.beginPath();
      ctx.arc(820, 520, 75, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(820, 425); ctx.lineTo(820, 615);
      ctx.moveTo(725, 520); ctx.lineTo(915, 520);
      ctx.stroke();
    } else {
      // EXPLORE MONITOR (Surreal Collage & Notes)
      const grad = ctx.createRadialGradient(512, 360, 40, 512, 360, 680);
      grad.addColorStop(0, '#592036');
      grad.addColorStop(0.4, '#2e122b');
      grad.addColorStop(1, '#110719');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, c.width, c.height);

      // Top Bar
      ctx.fillStyle = 'rgba(255,149,97,0.22)';
      ctx.fillRect(40, 36, 944, 38);
      ctx.fillStyle = css;
      ctx.font = '700 18px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('ANALOG DECK // FREQUENCY: SURREAL // SIDE: B', 56, 61);
      ctx.textAlign = 'right';
      ctx.fillText('IDEAS UNFINISHED', 968, 61);

      // Main Title
      ctx.textAlign = 'center';
      ctx.font = '900 120px sans-serif';
      ctx.fillStyle = '#ffb38a';
      ctx.shadowColor = css;
      ctx.shadowBlur = 24;
      ctx.fillText('EXPLORE', 512, 310);
      ctx.shadowBlur = 0;

      // Subtitle
      ctx.fillStyle = 'rgba(255,220,195,0.85)';
      ctx.font = '26px monospace';
      ctx.fillText('notes / unfinished ideas', 512, 375);

      // Surreal portal arch with stairs
      ctx.strokeStyle = css;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(100, 440, 150, 200);
      ctx.beginPath();
      ctx.arc(175, 440, 75, Math.PI, 0);
      ctx.stroke();
      for (let s = 0; s < 6; s++) {
        ctx.strokeRect(125 + s * 8, 580 - s * 16, 100 - s * 16, 16);
      }

      // Moon & Celestial sphere
      ctx.fillStyle = '#ffcf99';
      ctx.beginPath();
      ctx.arc(820, 480, 50, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,207,153,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(820, 480, 85, 26, -0.25, 0, Math.PI * 2);
      ctx.stroke();

      // Polaroid photo frame
      ctx.fillStyle = 'rgba(240,230,215,0.92)';
      ctx.fillRect(440, 440, 160, 200);
      ctx.fillStyle = '#1c0f24';
      ctx.fillRect(455, 455, 130, 130);
      ctx.fillStyle = '#5c4538';
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('MAY 94 / CASSETTE', 520, 615);
    }

    // Common Scanlines across all CRTs
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 2;
    for (let y = 0; y < c.height; y += 7) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(c.width, y);
      ctx.stroke();
    }

    // Moving scanline bar
    const scanY = (time * 120) % c.height;
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(0, scanY, c.width, 18);

    tex.needsUpdate = true;
  }

  return { texture: tex, render };
}

// --- MONITOR MESH BUILDER ---
function makeMonitor(spec, isCentre = false) {
  const group = new THREE.Group();
  group.position.set(spec.x, 2.05, -0.15);
  const scale = isCentre ? 1.18 : 1;
  group.scale.setScalar(scale);

  const shellMat = new THREE.MeshStandardMaterial({ color: 0x6e6150, roughness: 0.72, metalness: 0.1 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x121110, roughness: 0.55, metalness: 0.15 });

  // Dynamic CRT Screen
  const screenData = createScreenCanvas(spec.id, spec.color);
  dynamicScreenTextures.push(screenData);

  const screenMat = new THREE.MeshBasicMaterial({ map: screenData.texture, color: 0xffffff });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.86, 1.3), screenMat);

  // Monitor Housing
  box(2.26, 1.74, 0.58, shellMat, new THREE.Vector3(0, 0, 0), group);
  box(2.02, 1.46, 0.08, darkMat, new THREE.Vector3(0, 0.02, 0.3), group);
  screen.position.set(0, 0.06, 0.355);
  group.add(screen);

  // Pedestal Stand
  box(0.92, 0.14, 0.72, shellMat, new THREE.Vector3(0, -1.02, -0.04), group);
  box(1.48, 0.09, 0.82, darkMat, new THREE.Vector3(0, -1.11, -0.15), group);

  // Power LED & Glow
  const ledMat = new THREE.MeshBasicMaterial({ color: spec.color });
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 12), ledMat);
  led.position.set(0.78, -0.62, 0.32);
  group.add(led);

  const light = new THREE.PointLight(spec.color, 0.45, 4.5, 2);
  light.position.set(0, 0.1, 1.15);
  group.add(light);

  // Raycast Hitbox
  const hit = new THREE.Mesh(
    new THREE.PlaneGeometry(1.88, 1.32),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  hit.position.set(0, 0.06, 0.39);
  hit.userData = { spec, group, light, screen };
  group.add(hit);
  monitorTargets.push(hit);

  scene.add(group);
}

// --- DESK PROPS & ENVIRONMENT GEOMETRY ---
let steamParticles = null;

function addRoomAndProps() {
  const wood = new THREE.MeshStandardMaterial({ color: 0x221816, roughness: 0.9 });
  const wall = new THREE.MeshStandardMaterial({ color: 0x0a0f1b, roughness: 1 });
  const floor = new THREE.MeshStandardMaterial({ color: 0x100d14, roughness: 1 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x282c35, roughness: 0.4, metalness: 0.8 });
  const plasticDark = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.6 });
  const retroBeige = new THREE.MeshStandardMaterial({ color: 0xd8cebc, roughness: 0.7 });

  // Main Room Architecture
  box(22, 10, 0.2, wall, new THREE.Vector3(0, 4.2, -2.1));
  box(22, 0.2, 14, floor, new THREE.Vector3(0, -0.9, 1.8));

  // Desk Surface & Legs
  box(11.2, 0.38, 2.3, wood, new THREE.Vector3(0, 0.74, 0.95));
  box(10.8, 0.18, 0.7, wood, new THREE.Vector3(0, -0.18, 0.95));
  for (const x of [-5.0, 5.0]) {
    box(0.28, 2.2, 0.36, wood, new THREE.Vector3(x, -0.38, 0.95));
  }

  // --- WINDOW & CELESTIAL BACKGROUND ---
  const windowFrame = new THREE.MeshStandardMaterial({ color: 0x07090e, roughness: 0.5, metalness: 0.3 });
  const glass = new THREE.MeshBasicMaterial({ color: 0x080c1e, transparent: true, opacity: 0.8 });
  const cosmicGlow = new THREE.MeshBasicMaterial({ color: 0x241454, transparent: true, opacity: 0.45 });

  box(8.8, 5.8, 0.12, glass, new THREE.Vector3(0, 4.3, -1.9));
  box(8.6, 5.6, 0.04, cosmicGlow, new THREE.Vector3(0, 4.3, -1.82));

  // Window Panes / Mullions
  box(0.18, 6.0, 0.2, windowFrame, new THREE.Vector3(0, 4.3, -1.7));
  box(9.0, 0.18, 0.2, windowFrame, new THREE.Vector3(0, 4.3, -1.7));
  box(9.0, 0.18, 0.2, windowFrame, new THREE.Vector3(0, 1.4, -1.7));
  box(9.0, 0.18, 0.2, windowFrame, new THREE.Vector3(0, 7.2, -1.7));
  box(0.18, 6.0, 0.2, windowFrame, new THREE.Vector3(-4.4, 4.3, -1.7));
  box(0.18, 6.0, 0.2, windowFrame, new THREE.Vector3(4.4, 4.3, -1.7));

  // Glowing Moon in Window
  const moonMat = new THREE.MeshBasicMaterial({ color: 0xfff3db });
  const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(0.72, 24, 24), moonMat);
  moonMesh.position.set(-2.2, 6.2, -1.78);
  scene.add(moonMesh);

  // Moon Corona Glow
  const coronaMat = new THREE.MeshBasicMaterial({ color: 0x8aa8ff, transparent: true, opacity: 0.35 });
  const coronaMesh = new THREE.Mesh(new THREE.SphereGeometry(0.95, 24, 24), coronaMat);
  coronaMesh.position.copy(moonMesh.position);
  scene.add(coronaMesh);

  // Starfield & Nebula Particles
  const starsGeo = new THREE.BufferGeometry();
  const starCoords = [];
  const starColors = [];
  const colorPalette = [new THREE.Color(0xc9d4ff), new THREE.Color(0xffd2f2), new THREE.Color(0xffdfb3), new THREE.Color(0xaae8ff)];

  for (let i = 0; i < 550; i++) {
    starCoords.push((Math.random() - 0.5) * 8.6, 1.5 + Math.random() * 5.6, -1.75 + Math.random() * 0.08);
    const col = colorPalette[Math.floor(Math.random() * colorPalette.length)];
    starColors.push(col.r, col.g, col.b);
  }
  starsGeo.setAttribute('position', new THREE.Float32BufferAttribute(starCoords, 3));
  starsGeo.setAttribute('color', new THREE.Float32BufferAttribute(starColors, 3));
  const starsPoints = new THREE.Points(
    starsGeo,
    new THREE.PointsMaterial({ size: 0.03, vertexColors: true, transparent: true, opacity: 0.9 })
  );
  scene.add(starsPoints);

  // Hanging Ivy/Vine Leaves from Window Top
  const vineMat = new THREE.MeshStandardMaterial({ color: 0x0e1b12, roughness: 0.9 });
  for (let v = 0; v < 14; v++) {
    const vx = -4.0 + v * 0.6 + (Math.random() - 0.5) * 0.2;
    const vy = 6.9 - Math.random() * 0.8;
    box(0.18 + Math.random() * 0.12, 0.4 + Math.random() * 0.5, 0.06, vineMat, new THREE.Vector3(vx, vy, -1.65));
  }

  // --- STUDIO AUDIO SPEAKERS (Left & Right) ---
  for (const sx of [-4.85, 4.85]) {
    const speakerGroup = new THREE.Group();
    speakerGroup.position.set(sx, 1.7, 0.4);
    box(0.95, 1.5, 0.85, plasticDark, new THREE.Vector3(0, 0, 0), speakerGroup);
    // Woofer & Tweeter Cones
    cyl(0.24, 0.24, 0.05, 18, metal, new THREE.Vector3(0, -0.22, 0.44), speakerGroup, new THREE.Euler(Math.PI / 2, 0, 0));
    cyl(0.1, 0.1, 0.05, 18, metal, new THREE.Vector3(0, 0.32, 0.44), speakerGroup, new THREE.Euler(Math.PI / 2, 0, 0));
    scene.add(speakerGroup);
  }

  // --- MECHANICAL RETRO KEYBOARD (Center Desk) ---
  const keyboardGroup = new THREE.Group();
  keyboardGroup.position.set(0, 0.95, 1.45);
  keyboardGroup.rotation.x = -0.06;

  // Angled Base Chassis
  box(2.9, 0.14, 1.05, retroBeige, new THREE.Vector3(0, 0, 0), keyboardGroup);
  // Keybed Tray
  box(2.72, 0.06, 0.9, plasticDark, new THREE.Vector3(0, 0.06, 0), keyboardGroup);

  // Keycap Rows & Spacebar
  const keyMat = new THREE.MeshStandardMaterial({ color: 0xede4d5, roughness: 0.6 });
  const keyDarkMat = new THREE.MeshStandardMaterial({ color: 0x4a443b, roughness: 0.6 });
  for (let r = 0; r < 4; r++) {
    for (let k = 0; k < 14; k++) {
      const kx = -1.2 + k * 0.185;
      const kz = -0.32 + r * 0.18;
      const useDark = k === 0 || k === 13 || r === 0;
      box(0.14, 0.07, 0.14, useDark ? keyDarkMat : keyMat, new THREE.Vector3(kx, 0.1, kz), keyboardGroup);
    }
  }
  // Spacebar
  box(1.1, 0.07, 0.15, keyMat, new THREE.Vector3(0, 0.1, 0.32), keyboardGroup);
  scene.add(keyboardGroup);

  // --- RETRO COMPUTER MOUSE & PAD ---
  const mousepad = new THREE.MeshStandardMaterial({ color: 0x12141c, roughness: 0.95 });
  box(1.0, 0.015, 1.15, mousepad, new THREE.Vector3(1.85, 0.94, 1.45));
  // Contoured Mouse
  const mouseMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.22, 6, 12), retroBeige);
  mouseMesh.position.set(1.85, 0.99, 1.45);
  mouseMesh.scale.set(1, 0.6, 1.4);
  scene.add(mouseMesh);

  // --- CERAMIC COFFEE MUG WITH SATURN GRAPHIC ---
  const mugGroup = new THREE.Group();
  mugGroup.position.set(-1.85, 0.95, 1.45);
  const mugMat = new THREE.MeshStandardMaterial({ color: 0x161c28, roughness: 0.5 });
  // Coaster
  cyl(0.38, 0.38, 0.03, 20, wood, new THREE.Vector3(0, 0, 0), mugGroup);
  // Cup Cylinder
  cyl(0.24, 0.22, 0.44, 20, mugMat, new THREE.Vector3(0, 0.24, 0), mugGroup);
  // Coffee Liquid inside
  cyl(0.21, 0.21, 0.02, 16, new THREE.MeshStandardMaterial({ color: 0x1f120c, roughness: 0.3 }), new THREE.Vector3(0, 0.41, 0), mugGroup);
  scene.add(mugGroup);

  // Rising Steam Particle System
  const steamGeo = new THREE.BufferGeometry();
  const steamPos = [];
  for (let i = 0; i < 36; i++) {
    steamPos.push(
      -1.85 + (Math.random() - 0.5) * 0.15,
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

  // --- CASSETTE TAPES STACK (Left Desk) ---
  for (let c = 0; c < 3; c++) {
    const cassMat = new THREE.MeshStandardMaterial({
      color: c === 0 ? 0x222a38 : c === 1 ? 0x482420 : 0x1f2e24,
      roughness: 0.6
    });
    box(0.92, 0.08, 0.62, cassMat, new THREE.Vector3(-3.2, 0.96 + c * 0.09, 1.42), scene, true, true);
  }

  // --- VINTAGE WALKMAN (Right Desk) ---
  const walkmanMat = new THREE.MeshStandardMaterial({ color: 0x323a48, metalness: 0.5, roughness: 0.4 });
  box(0.9, 0.14, 0.65, walkmanMat, new THREE.Vector3(3.2, 0.99, 1.45));
  box(0.4, 0.04, 0.35, glass, new THREE.Vector3(3.2, 1.07, 1.45));

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
  lampGroup.position.set(4.2, 0.94, 0.9);
  // Base
  cyl(0.38, 0.42, 0.1, 20, plasticDark, new THREE.Vector3(0, 0.05, 0), lampGroup);
  // Arm rods
  cyl(0.03, 0.03, 1.4, 12, metal, new THREE.Vector3(-0.15, 0.72, 0), lampGroup, new THREE.Euler(0, 0, -0.22));
  cyl(0.03, 0.03, 1.1, 12, metal, new THREE.Vector3(-0.45, 1.7, 0), lampGroup, new THREE.Euler(0, 0, 0.45));
  // Shade Cone
  const shade = new THREE.Mesh(
    new THREE.ConeGeometry(0.36, 0.5, 20, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x1b1d24, roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide })
  );
  shade.position.set(-0.72, 2.05, 0.1);
  shade.rotation.z = Math.PI / 3;
  shade.rotation.x = 0.2;
  lampGroup.add(shade);
  scene.add(lampGroup);

  // Warm Amber Desk Lamp Light
  const deskLampLight = new THREE.PointLight(0xffaa5e, 1.1, 6.5, 1.8);
  deskLampLight.position.set(3.4, 2.7, 1.0);
  deskLampLight.castShadow = true;
  scene.add(deskLampLight);
}

// --- 3D SILHOUETTE CHARACTER ---
function addPerson() {
  silhouetteGroup = new THREE.Group();
  silhouetteGroup.position.set(0, 0.02, 2.05);

  const hoodie = new THREE.MeshStandardMaterial({
    color: 0x090b12,
    roughness: 0.96,
    transparent: true,
    opacity: 1
  });
  const chair = new THREE.MeshStandardMaterial({
    color: 0x14131c,
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

  // Torso (Hoodie)
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

  // Headphones Headband & Ear Cups
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

  // Silhouette Rim Lights (Cyan left, warm right)
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

// Ambient & Fill Lighting
scene.add(new THREE.HemisphereLight(0x283e88, 0x11090c, 1.15));
const moonFill = new THREE.PointLight(0x728cff, 0.65, 12, 2);
moonFill.position.set(-2.2, 6.4, -0.8);
scene.add(moonFill);

// --- WEB AUDIO ATMOSPHERE & SFX ENGINE (OPTION 3) ---
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
    // 1. Vinyl / Room Noise Floor
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

    // 2. Late-night Lo-Fi Ambient Drone (C Minor 9th chord drone)
    const freqs = [65.41, 98.0, 116.54, 155.56]; // C2, G2, Bb2, Eb3
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

    // CRT degauss resonance
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

// --- INTERACTION HANDLING & SMOOTH FIRST-PERSON TRANSITION ---
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
    hit.userData.light.intensity = hit === target ? 1.25 : 0.2;
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
  }, prefersReducedMotion ? 0 : 700);
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
  }, prefersReducedMotion ? 0 : 250);
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
  // Unlock audio context on user gesture
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

// --- ANIMATION LOOP ---
let lastScreenUpdate = 0;

function animate() {
  const delta = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;
  const ease = prefersReducedMotion ? 1 : 1 - Math.exp(-delta * 4.4);

  // Camera Lerp
  camera.position.lerp(cameraGoal, ease);
  lookNow.lerp(lookGoal, ease);
  camera.lookAt(lookNow);

  // Silhouette First-Person Fade Out when entering / zooming close
  if (silhouetteGroup) {
    // Subtle organic breathing motion
    const breath = Math.sin(time * 1.6) * 0.012;
    silhouetteGroup.position.y = 0.02 + breath;

    // Smoothly fade out character when camera pushes past the shoulder into the monitor
    const distToHome = camera.position.distanceTo(homeCamera);
    const targetOpacity = entering ? 0 : Math.max(0.1, 1 - (distToHome / 7.5));
    
    silhouetteGroup.traverse((child) => {
      if (child.isMesh && child.material && child.material.transparent) {
        child.material.opacity = THREE.MathUtils.lerp(child.material.opacity, targetOpacity, ease * 1.5);
      }
    });
  }

  // Steam Particle Animation
  if (steamParticles) {
    const pos = steamParticles.geometry.attributes.position.array;
    for (let i = 1; i < pos.length; i += 3) {
      pos[i] += delta * 0.16; // Rise
      pos[i - 1] += Math.sin(time * 2 + i) * 0.0012; // Gentle sway
      if (pos[i] > 2.05) {
        pos[i] = 1.38; // Reset to cup level
        pos[i - 1] = -1.85 + (Math.random() - 0.5) * 0.12;
      }
    }
    steamParticles.geometry.attributes.position.needsUpdate = true;
  }

  // Update dynamic CRT canvas textures at ~20fps for performance
  if (time - lastScreenUpdate > 0.05) {
    dynamicScreenTextures.forEach((item) => item.render(time));
    lastScreenUpdate = time;
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

camera.position.copy(homeCamera);
camera.lookAt(homeLook);
animate();
