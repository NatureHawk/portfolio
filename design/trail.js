// THE TRAIL — how deep into this document the history stack has gone.
//
// One page, many history entries. The worlds push one every time somebody
// crosses a corner (worlds/shell.js), and every in-page hash link pushes one
// the browser makes by itself. Which is a problem for exactly one control: the
// back links go home with `history.back()` rather than a normal navigation,
// because a back navigation is what lets the browser restore index.html from
// the bfcache instead of paying for a cold Three.js boot — and one step back
// only leaves this document from the FIRST entry the page owns. Pressed after
// a single corner crossing it lands on the world you just left, which is a
// "back to the room" button that goes to a toothbrush.
//
// So every entry this document owns carries how deep it is, and the way out is
// one step past the deepest. The count lives in the entry's own state rather
// than in a variable alone, so it is still right after a reload and after the
// visitor has walked the stack with the browser's own buttons.

let depth = Number(history.state?.trail ?? 0);

export const trailDepth = () => depth;

/* The two calls the worlds make instead of touching history directly. */
export function trailPush(state, url) {
  depth += 1;
  history.pushState({ ...state, trail: depth }, '', url);
}

export function trailReplace(state, url) {
  history.replaceState({ ...state, trail: depth }, '', url);
}

/* Hash links are entries this page never asked for: the browser makes them and
   leaves their state null. They are stamped as they arrive — and an entry that
   ALREADY carries a stamp is one being returned to rather than a new one,
   which is what lets a single handler read both directions without a flag to
   tell it which way the visitor is moving. */
export function watchTrail() {
  const sync = () => {
    const known = history.state?.trail;
    if (typeof known === 'number') { depth = known; return; }
    depth += 1;
    history.replaceState({ ...history.state, trail: depth }, '');
  };
  window.addEventListener('popstate', sync);
  window.addEventListener('hashchange', sync);
}
