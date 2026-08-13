import * as THREE from './node_modules/three/build/three.module.js';

const canvas = document.querySelector('#scene');
const body = document.body;
const buttons = [...document.querySelectorAll('.world-button')];
const pages = [...document.querySelectorAll('.world-view')];
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x060814, 1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x070914, 0.036);
const camera = new THREE.PerspectiveCamera(43, window.innerWidth / window.innerHeight, 0.1, 80);
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(3, 3);

const homeCamera = new THREE.Vector3(0, 3.5, 13.2);
const homeLook = new THREE.Vector3(0, 2.18, -0.15);
const cameraGoal = homeCamera.clone();
const lookGoal = homeLook.clone();
const lookNow = homeLook.clone();
let hovered = null;
let entering = false;

const monitorSpecs = [
  { id: 'code', x: -3.08, color: 0x9dff69, hoverCamera: new THREE.Vector3(-2.45, 3.55, 9.65), hoverLook: new THREE.Vector3(-2.84, 2.28, -0.2), enterCamera: new THREE.Vector3(-3.08, 2.25, 3.15) },
  { id: 'design', x: 0, color: 0x61a9ff, hoverCamera: new THREE.Vector3(3.1, 4.05, 9.1), hoverLook: new THREE.Vector3(0, 2.37, -0.35), enterCamera: new THREE.Vector3(0, 2.38, 3.05) },
  { id: 'explore', x: 3.08, color: 0xff9561, hoverCamera: new THREE.Vector3(2.45, 3.55, 9.65), hoverLook: new THREE.Vector3(2.84, 2.28, -0.2), enterCamera: new THREE.Vector3(3.08, 2.25, 3.15) },
];
const monitorTargets = [];

function box(width, height, depth, material, position, parent = scene, radius = 0) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function createScreenTexture(id, color) {
  const c = document.createElement('canvas');
  c.width = 768; c.height = 520;
  const ctx = c.getContext('2d');
  const css = `#${new THREE.Color(color).getHexString()}`;
  const grad = ctx.createRadialGradient(384, 250, 30, 384, 250, 520);
  grad.addColorStop(0, css); grad.addColorStop(.18, '#183422'); grad.addColorStop(1, '#08100c');
  if (id === 'design') { grad.addColorStop(.18, '#12317a'); grad.addColorStop(1, '#061125'); }
  if (id === 'explore') { grad.addColorStop(.18, '#783323'); grad.addColorStop(1, '#210a0e'); }
  ctx.fillStyle = grad; ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalAlpha = .2; ctx.strokeStyle = css; ctx.lineWidth = 2;
  for (let y = 10; y < c.height; y += 11) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(c.width, y); ctx.stroke(); }
  ctx.globalAlpha = 1;
  ctx.fillStyle = css; ctx.font = '900 108px monospace'; ctx.textAlign = 'center'; ctx.shadowColor = css; ctx.shadowBlur = 22;
  ctx.fillText(id.toUpperCase(), 384, 298);
  ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(245,235,214,.76)'; ctx.font = '21px monospace';
  ctx.fillText(id === 'code' ? 'systems / experiments' : id === 'design' ? 'identity / visual language' : 'notes / unfinished ideas', 384, 355);
  ctx.globalAlpha = .55; ctx.strokeStyle = css;
  if (id === 'code') {
    for (let y = 70; y < 190; y += 17) { ctx.beginPath(); ctx.moveTo(60, y); ctx.lineTo(280 + (y % 3) * 30, y); ctx.stroke(); }
  } else if (id === 'design') {
    ctx.strokeRect(58, 62, 165, 115); ctx.strokeRect(546, 70, 135, 108); ctx.beginPath(); ctx.arc(612, 240, 59, 0, Math.PI * 2); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(165, 142, 60, 0, Math.PI * 2); ctx.stroke(); ctx.strokeRect(505, 90, 145, 150);
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}

function makeMonitor(spec, isCentre = false) {
  const group = new THREE.Group();
  group.position.set(spec.x, 2.05, -0.15);
  const scale = isCentre ? 1.18 : 1;
  group.scale.setScalar(scale);
  const shell = new THREE.MeshStandardMaterial({ color: 0x756653, roughness: .75, metalness: .08 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x11100e, roughness: .5, metalness: .15 });
  const screenTexture = createScreenTexture(spec.id, spec.color);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.85, 1.28), new THREE.MeshBasicMaterial({ map: screenTexture, color: 0xffffff }));
  box(2.25, 1.72, .54, shell, new THREE.Vector3(0, 0, 0), group, .13);
  box(2.01, 1.45, .08, dark, new THREE.Vector3(0, .02, .3), group, .1);
  screen.position.set(0, .06, .355); group.add(screen);
  box(.9, .12, .7, shell, new THREE.Vector3(0, -1.03, -.04), group, .04);
  box(1.45, .08, .8, dark, new THREE.Vector3(0, -1.11, -.15), group, .02);
  const led = new THREE.Mesh(new THREE.SphereGeometry(.034, 12, 12), new THREE.MeshBasicMaterial({ color: spec.color })); led.position.set(.77, -.62, .32); group.add(led);
  const light = new THREE.PointLight(spec.color, .44, 4.5, 2); light.position.set(0, .1, 1.15); group.add(light);
  const hit = new THREE.Mesh(new THREE.PlaneGeometry(1.88, 1.3), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  hit.position.set(0, .06, .39); hit.userData = { spec, group, light, screen }; group.add(hit); monitorTargets.push(hit);
  scene.add(group);
}

function addRoom() {
  const wood = new THREE.MeshStandardMaterial({ color: 0x251a19, roughness: .93 });
  const wall = new THREE.MeshStandardMaterial({ color: 0x0b101b, roughness: 1 });
  const floor = new THREE.MeshStandardMaterial({ color: 0x120e16, roughness: 1 });
  box(18, 9, .2, wall, new THREE.Vector3(0, 4.2, -2.1));
  box(18, .2, 13, floor, new THREE.Vector3(0, -.9, 1.8));
  box(10.8, .38, 2.1, wood, new THREE.Vector3(0, .74, .95));
  box(10.4, .18, .7, wood, new THREE.Vector3(0, -.18, .95));
  for (const x of [-4.7, 4.7]) box(.26, 2.2, .34, wood, new THREE.Vector3(x, -.38, .95));

  const windowFrame = new THREE.MeshStandardMaterial({ color: 0x080a0f, roughness: .5, metalness: .3 });
  const glass = new THREE.MeshBasicMaterial({ color: 0x090d20, transparent: true, opacity: .76 });
  const glow = new THREE.MeshBasicMaterial({ color: 0x29165c, transparent: true, opacity: .36 });
  box(8.2, 5.65, .12, glass, new THREE.Vector3(0, 4.25, -1.9));
  box(8.05, 5.48, .04, glow, new THREE.Vector3(0, 4.25, -1.82));
  box(.18, 5.85, .2, windowFrame, new THREE.Vector3(0, 4.25, -1.7));
  box(8.5, .18, .2, windowFrame, new THREE.Vector3(0, 4.25, -1.7));
  box(8.5, .18, .2, windowFrame, new THREE.Vector3(0, 1.37, -1.7));
  box(8.5, .18, .2, windowFrame, new THREE.Vector3(0, 7.15, -1.7));
  box(.18, 5.85, .2, windowFrame, new THREE.Vector3(-4.15, 4.25, -1.7));
  box(.18, 5.85, .2, windowFrame, new THREE.Vector3(4.15, 4.25, -1.7));

  const stars = new THREE.BufferGeometry(); const points = [];
  for (let i = 0; i < 470; i += 1) points.push((Math.random() - .5) * 8, 1.55 + Math.random() * 5.25, -1.75 + Math.random() * .08);
  stars.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  scene.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: 0xc7c4ff, size: .025, transparent: true, opacity: .88 })));
}

function addPerson() {
  const person = new THREE.Group(); person.position.set(0, .02, 2.05);
  const hoodie = new THREE.MeshStandardMaterial({ color: 0x090b12, roughness: .96 });
  const chair = new THREE.MeshStandardMaterial({ color: 0x14131c, roughness: .9 });
  const rimBlue = new THREE.MeshStandardMaterial({ color: 0x101c3a, roughness: .65, emissive: 0x071226, emissiveIntensity: .5 });
  box(2.25, 2.4, .55, chair, new THREE.Vector3(0, .72, .04), person, .2);
  box(2.7, .26, 1.42, chair, new THREE.Vector3(0, -.32, .7), person, .15);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.85, 1.72, 8, 18), hoodie); torso.position.set(0, 1.55, .1); torso.scale.z = .7; person.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.58, 26, 20), hoodie); head.position.set(0, 2.86, .03); head.scale.set(1, 1.08, .82); person.add(head);
  const hood = new THREE.Mesh(new THREE.TorusGeometry(.67, .16, 10, 24, Math.PI), rimBlue); hood.position.set(0, 2.66, .13); hood.rotation.x = Math.PI; person.add(hood);
  const band = new THREE.Mesh(new THREE.TorusGeometry(.68, .065, 10, 28, Math.PI), new THREE.MeshStandardMaterial({ color: 0x242c41, roughness: .5, metalness: .25 })); band.position.set(0, 2.92, .05); band.rotation.x = Math.PI; person.add(band);
  for (const side of [-1, 1]) { const ear = new THREE.Mesh(new THREE.CylinderGeometry(.22, .22, .14, 16), new THREE.MeshStandardMaterial({ color: 0x1c2232, roughness: .5, metalness: .35 })); ear.rotation.z = Math.PI / 2; ear.position.set(side * .59, 2.86, .03); person.add(ear); }
  for (const side of [-1, 1]) { const arm = new THREE.Mesh(new THREE.CapsuleGeometry(.28, 1.15, 8, 14), hoodie); arm.position.set(side * .82, 1.42, .5); arm.rotation.z = side * -.42; arm.rotation.x = .35; person.add(arm); }
  scene.add(person);
  const blueLight = new THREE.PointLight(0x2a70ff, .58, 5, 2); blueLight.position.set(-.8, 3.1, .5); scene.add(blueLight);
  const orangeLight = new THREE.PointLight(0xff7739, .38, 4, 2); orangeLight.position.set(2.8, 2.2, .5); scene.add(orangeLight);
}

addRoom();
makeMonitor(monitorSpecs[0]); makeMonitor(monitorSpecs[1], true); makeMonitor(monitorSpecs[2]); addPerson();

scene.add(new THREE.HemisphereLight(0x263e8d, 0x130b0d, 1.05));
const lamp = new THREE.PointLight(0xffa65b, .72, 9, 2); lamp.position.set(5.3, 5.3, 2.5); lamp.castShadow = true; scene.add(lamp);
const moon = new THREE.PointLight(0x728cff, .6, 11, 2); moon.position.set(-2, 6.3, -1.1); scene.add(moon);

function setHover(target) {
  if (entering || hovered === target) return;
  hovered = target; body.classList.toggle('is-hovering', Boolean(target));
  buttons.forEach((button) => button.classList.toggle('active', button.dataset.world === target?.userData.spec.id));
  monitorTargets.forEach((hit) => { hit.userData.light.intensity = hit === target ? 1.15 : .2; hit.userData.group.scale.setScalar(hit === target ? (hit.userData.spec.id === 'design' ? 1.25 : 1.06) : (hit.userData.spec.id === 'design' ? 1.18 : 1)); });
  if (target) { cameraGoal.copy(target.userData.spec.hoverCamera); lookGoal.copy(target.userData.spec.hoverLook); } else { cameraGoal.copy(homeCamera); lookGoal.copy(homeLook); }
}

function openWorld(id) {
  if (entering) return;
  const target = monitorTargets.find((hit) => hit.userData.spec.id === id);
  if (!target) return;
  entering = true; setHover(target); body.classList.add('is-entering');
  cameraGoal.copy(target.userData.spec.enterCamera); lookGoal.set(target.userData.spec.x, 2.15, -.2);
  window.setTimeout(() => {
    const page = pages.find((item) => item.dataset.worldView === id);
    if (!page) return;
    page.hidden = false; requestAnimationFrame(() => page.classList.add('visible'));
  }, prefersReducedMotion ? 0 : 700);
}

function returnRoom() {
  const page = pages.find((item) => !item.hidden);
  if (!page) return;
  page.classList.remove('visible');
  window.setTimeout(() => { page.hidden = true; entering = false; body.classList.remove('is-entering'); setHover(null); }, prefersReducedMotion ? 0 : 250);
}

canvas.addEventListener('pointermove', (event) => {
  const rect = canvas.getBoundingClientRect(); pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1; pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera); const hit = raycaster.intersectObjects(monitorTargets, false)[0]?.object || null; setHover(hit);
});
canvas.addEventListener('pointerleave', () => setHover(null));
canvas.addEventListener('click', () => { if (hovered) openWorld(hovered.userData.spec.id); });
buttons.forEach((button) => { button.addEventListener('mouseenter', () => setHover(monitorTargets.find((hit) => hit.userData.spec.id === button.dataset.world))); button.addEventListener('focus', () => setHover(monitorTargets.find((hit) => hit.userData.spec.id === button.dataset.world))); button.addEventListener('click', () => openWorld(button.dataset.world)); });
document.querySelectorAll('.back-button').forEach((button) => button.addEventListener('click', returnRoom));
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { if (entering) returnRoom(); else setHover(null); } });

function resize() { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); }
window.addEventListener('resize', resize);

function animate() {
  const delta = Math.min(clock.getDelta(), .05); const ease = prefersReducedMotion ? 1 : 1 - Math.exp(-delta * 4.3);
  camera.position.lerp(cameraGoal, ease); lookNow.lerp(lookGoal, ease); camera.lookAt(lookNow);
  const time = clock.elapsedTime; scene.children.forEach((object) => { if (object.isPoints) object.rotation.z = time * .006; });
  renderer.render(scene, camera); requestAnimationFrame(animate);
}
camera.position.copy(homeCamera); camera.lookAt(homeLook); animate();
