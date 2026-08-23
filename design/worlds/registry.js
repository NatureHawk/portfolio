// THE FOUR WORLDS.
//
// One place that knows which world lives in which corner. Everything else in
// the system — the corner controls, the portal, the history entries, the
// document title — is generated from this list, so a world can be renamed,
// recoloured or moved to a different corner by editing one object.
//
// A world is a MODULE, not a route. It owns its palette, its portal recipe, its
// arrival choreography and (once it exists) its own DOM. `mount(host, context)`
// is the only thing the shell calls, and what it returns is the handle
// documented at the top of frame.js.

import world01 from './world01.js';
import world02 from './world02.js';
import world03 from './world03.js';
import world04 from './world04.js';

export const WORLD_LIST = [world01, world02, world03, world04];

export const WORLDS = new Map(WORLD_LIST.map((world) => [world.id, world]));

export const HOME = '01';

export const byCorner = (corner) => WORLD_LIST.find((world) => world.corner === corner);

/* Both spellings are accepted on the way in — `?w=02` from a shared link and
   `#02` from somebody typing — and only the padded id is ever written back. */
export function normalise(value) {
  if (!value) return null;
  const id = String(value).replace(/[^0-9]/g, '').padStart(2, '0');
  return WORLDS.has(id) ? id : null;
}

export function fromLocation() {
  const params = new URLSearchParams(window.location.search);
  return normalise(params.get('w')) ?? normalise(window.location.hash.slice(1)) ?? HOME;
}

/* HOME keeps a clean URL. A world you can link to has one query parameter and
   nothing else — no route, no file, no second copy of the page. */
export function urlFor(id) {
  const url = new URL(window.location.href);
  url.hash = '';
  if (id === HOME) url.searchParams.delete('w');
  else url.searchParams.set('w', id);
  return url.pathname + url.search;
}
