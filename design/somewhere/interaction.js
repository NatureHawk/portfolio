// INTERACTION — picking the world up, and noticing what is under the finger.
//
// Two jobs, and they share one pointer stream because they have to: a press
// that turns into a drag must NOT also count as a click on whatever happened to
// be under it. That distinction — the few pixels of slop between "tapped the
// village" and "started turning the world" — is most of what makes a draggable
// scene feel deliberate rather than twitchy.
//
// HOW LANDMARKS ARE PICKED. Not with a raycast against the terrain. Each
// landmark owns an invisible sphere sitting over its part of the world, and the
// ray is tested against those four spheres and nothing else. Three reasons:
// a raycast against a hundred-thousand-vertex displaced sphere every time the
// pointer moves is real work; the answer it gives is "you touched the ground
// near the mountain", which still needs turning into "you touched the
// mountain"; and a generous invisible sphere is far easier to hit than the
// silhouette of a model, which is exactly what you want on a touchscreen.
//
// POINTER EVENTS, not mouse and touch. One code path covers mouse, pen and
// finger, and `setPointerCapture` means a drag that leaves the canvas — or the
// window — still ends properly instead of leaving the world spinning.

import * as THREE from 'three';
import { hasHover } from '../motion.js';

/* How far a press may travel before it stops being a click. Generous, because
   a finger on glass always moves a little and a tap that turns into a spin is
   worse than a drag that also selects. */
const SLOP = 7;

export function createInteraction(canvas, cam, landmarks, {
  onHover, onPick, onDragStart, onDragEnd,
} = {}) {
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  /* The pointer, in the same shape motion.js publishes: raw client position and
     a signed -1..1 pair the camera uses for parallax. Local rather than the
     shared one because this canvas is only part of the page. */
  const pointer = { x: 0, y: 0, sx: 0, sy: 0, has: false, down: false };

  let dragging = false;
  let moved = 0;
  let last = { x: 0, y: 0 };
  /* When the previous move event arrived. The camera converts a pixel delta
     into an angular VELOCITY, so it needs to know how long that delta took —
     the same twenty pixels is a gentle push over 32ms and a flick over 4ms. */
  let lastAt = 0;
  let hovered = null;
  let enabled = true;

  /* The pick targets. One invisible sphere per landmark, parented into the
     rotating world so they turn with it. `visible = false` would take them out
     of raycasting too, so they are kept visible with a fully transparent
     material — the renderer skips them, the raycaster does not. */
  const picks = landmarks.map(({ dest, position, radius }) => {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 10, 8),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    mesh.position.copy(position);
    mesh.userData.dest = dest;
    cam.world.add(mesh);
    return mesh;
  });

  function toNDC(e) {
    const r = canvas.getBoundingClientRect();
    pointer.x = e.clientX - r.left;
    pointer.y = e.clientY - r.top;
    pointer.sx = (pointer.x / r.width) * 2 - 1;
    pointer.sy = -((pointer.y / r.height) * 2 - 1);
    ndc.set(pointer.sx, pointer.sy);
  }

  /* What is under the pointer right now, or null. Only ever called when the
     world is idle — during a drag or a flight the answer is not wanted and the
     work is skipped entirely. */
  function hit() {
    ray.setFromCamera(ndc, cam.camera);
    const found = ray.intersectObjects(picks, false);
    return found.length ? found[0].object.userData.dest : null;
  }

  function setHover(next) {
    if (next === hovered) return;
    hovered = next;
    canvas.style.cursor = next ? 'pointer' : (dragging ? 'grabbing' : 'grab');
    onHover?.(next);
  }

  /* ── EVENTS ──────────────────────────────────────────────────────────────── */

  function down(e) {
    if (!enabled || e.button > 0) return;
    toNDC(e);
    dragging = true;
    moved = 0;
    pointer.down = true;
    last = { x: e.clientX, y: e.clientY };
    lastAt = e.timeStamp || performance.now();
    canvas.setPointerCapture?.(e.pointerId);
    canvas.style.cursor = 'grabbing';
    onDragStart?.();
  }

  function move(e) {
    if (!enabled) return;
    toNDC(e);
    pointer.has = true;

    if (dragging) {
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      const at = e.timeStamp || performance.now();
      // Clamped low as well as high: a browser can deliver two moves in the
      // same millisecond (coalesced pointer events do this routinely), and
      // dividing by that gives an enormous velocity from a tiny movement.
      const dt = Math.min(64, Math.max(6, at - lastAt));
      last = { x: e.clientX, y: e.clientY };
      lastAt = at;
      moved += Math.abs(dx) + Math.abs(dy);
      // Past the slop threshold this is definitively a drag, so anything the
      // press started over stops being hovered.
      if (moved > SLOP) {
        cam.drag(dx, dy, dt);
        if (hovered) setHover(null);
      }
      return;
    }

    // Hover is a hover-capable-pointer luxury. On a touchscreen there is no
    // such thing as hovering, and running a raycast on every touchmove to
    // produce a label nobody can see is pure waste.
    if (hasHover && cam.mode === 'globe') setHover(hit());
  }

  function up(e) {
    if (!dragging) return;
    dragging = false;
    pointer.down = false;
    canvas.releasePointerCapture?.(e.pointerId);
    cam.release();
    onDragEnd?.();

    // A press that never really moved is a click. On touch this is also the
    // only moment a landmark can be selected, so the pick is done here rather
    // than relying on a hover that never happened.
    if (moved <= SLOP) {
      toNDC(e);
      const target = cam.mode === 'globe' ? hit() : null;
      if (target) onPick?.(target);
    }
    canvas.style.cursor = hovered ? 'pointer' : 'grab';
  }

  function leave() {
    pointer.has = false;
    if (!dragging) setHover(null);
  }

  /* Keyboard. The world is a control, so it has to be operable without a
     pointer at all — arrows turn it, and the landmarks are reachable as real
     buttons built by the UI layer, which calls `onPick` directly. */
  function key(e) {
    if (!enabled || (cam.mode !== 'globe' && cam.mode !== 'place')) return;
    const step = e.shiftKey ? 44 : 18;
    if (e.key === 'ArrowLeft') cam.drag(-step, 0, 16.67);
    else if (e.key === 'ArrowRight') cam.drag(step, 0, 16.67);
    else if (e.key === 'ArrowUp') cam.drag(0, -step, 16.67);
    else if (e.key === 'ArrowDown') cam.drag(0, step, 16.67);
    else return;
    e.preventDefault();
    cam.release();
  }

  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('pointerleave', leave);
  canvas.addEventListener('keydown', key);
  // Stop the browser treating a drag on the canvas as a scroll or a text
  // selection. `touch-action` in CSS does the same job for touch; this covers
  // the mouse case.
  canvas.addEventListener('dragstart', (e) => e.preventDefault());

  return {
    pointer,
    get hovered() { return hovered; },

    /* Suspended while a flight is running and while the world is not the live
       world, so a hidden canvas is never doing raycasts. */
    set enabled(v) {
      enabled = v;
      if (!v) { dragging = false; setHover(null); }
    },
    get enabled() { return enabled; },

    destroy() {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('pointerleave', leave);
      canvas.removeEventListener('keydown', key);
      picks.forEach((m) => {
        m.geometry.dispose();
        m.material.dispose();
        m.parent?.remove(m);
      });
    },
  };
}
