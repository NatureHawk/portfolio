// THE FOUR CORNERS — geometry.
//
// The whole navigation rests on one idea: a corner is not a button, it is a
// direction. Every part of the system — the idle marks, the portal, the way the
// current world gets pulled off screen, the way the next one arrives — needs to
// agree about where "top-right" is and which way "towards it" points, so all of
// that arithmetic lives here and nowhere else.
//
// Corners are named by their two edges (`tl`, `tr`, `bl`, `br`) rather than by
// the world that happens to sit in them, because the mapping between the two is
// a decision made in the registry and could change; the geometry cannot.

export const CORNERS = {
  tl: { id: 'tl', x: 0, y: 0, arrow: '↖', label: 'top left' },
  tr: { id: 'tr', x: 1, y: 0, arrow: '↗', label: 'top right' },
  bl: { id: 'bl', x: 0, y: 1, arrow: '↙', label: 'bottom left' },
  br: { id: 'br', x: 1, y: 1, arrow: '↘', label: 'bottom right' },
};

export const OPPOSITE = { tl: 'br', tr: 'bl', bl: 'tr', br: 'tl' };

/* The corner in viewport pixels. Read at the moment it is needed rather than
   cached: a transition can be triggered mid-resize, and a stale corner is a
   portal that opens from somewhere that is not a corner. */
export const cornerPoint = (corner) => ({
  x: CORNERS[corner].x * window.innerWidth,
  y: CORNERS[corner].y * window.innerHeight,
});

/* The unit direction from the middle of the screen towards a corner. This is
   what every "shift towards the portal" gesture is multiplied by, so a world
   can express a departure as "16 pixels that way" without knowing which way
   that is. */
export const towards = (corner) => {
  const c = CORNERS[corner];
  const x = c.x ? 1 : -1;
  const y = c.y ? 1 : -1;
  const k = Math.SQRT1_2; // normalised: the diagonal is not longer than an edge
  return { x: x * k, y: y * k };
};

/* How far a point is from a corner, as a 0..1 nearness where 1 is on it and 0
   is `reach` pixels away or further. The corner UI is driven entirely by this
   number — see nav.js. */
export function nearness(corner, x, y, reach = 200) {
  const p = cornerPoint(corner);
  const d = Math.hypot(x - p.x, y - p.y);
  return d >= reach ? 0 : 1 - d / reach;
}

/* ══ WHAT GETS PULLED IN ═══════════════════════════════════════════════════
   A departure animates a handful of things, not a page. These two helpers are
   how a world picks that handful without hard-coding a list that goes stale the
   moment a section is edited:

     `onScreen`  keeps only the elements you can actually see. A visitor who
                 leaves from section 06 must watch section 06 react — animating
                 the hero eight screens up is work nobody sees.
     `pullTo`    turns an element into the vector that carries it into the
                 corner, scaled by how far it has to go, so a thing sitting next
                 to the portal drifts and a thing across the screen travels.

   Both measure in one pass, before anything animates. Nothing here reads layout
   while a transition is running. */
export function onScreen(nodes, { limit = 8, corner = null, margin = 40 } = {}) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const seen = [];

  for (const node of nodes) {
    const rect = node.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    if (rect.bottom < -margin || rect.top > vh + margin) continue;
    if (rect.right < -margin || rect.left > vw + margin) continue;
    seen.push({ node, rect, cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 });
  }

  if (corner) {
    // Nearest the portal first. The stagger then reads as suction — the things
    // closest to the corner go first and the far ones follow — instead of as a
    // list playing in document order.
    const p = cornerPoint(corner);
    seen.sort((a, b) => Math.hypot(a.cx - p.x, a.cy - p.y) - Math.hypot(b.cx - p.x, b.cy - p.y));
  }

  return seen.slice(0, limit);
}

export function pullTo(item, corner, { reach = 0.62, max = 460 } = {}) {
  const p = cornerPoint(corner);
  const dx = (p.x - item.cx) * reach;
  const dy = (p.y - item.cy) * reach;
  const d = Math.hypot(dx, dy);
  if (d <= max) return { x: dx, y: dy, distance: d };
  const k = max / d;
  return { x: dx * k, y: dy * k, distance: max };
}
