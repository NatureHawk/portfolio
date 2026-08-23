// HUM — sections 05, 06 and 07: the tool, the argument for it, and the pile.
//
//   05  The workspace. A real interface: the sidebar selects, the tabs switch,
//       the canvas rearranges. Everything visible here does what it looks like
//       it does, which is cheaper to build than a convincing fake and impossible
//       to catch out.
//   06  One object, four cursors, one word being rewritten. The whole claim of
//       the section in a single frame.
//   07  The desk. Nine loose things, filterable, all of them draggable — a grid
//       would tidy away the one fact that matters, which is that a person put
//       each of these somewhere on purpose.

import {
  animate, stagger, utils, prepLines, revealLines, typeText, inView, motion,
  hasHover, magnetic, tactile, EASE, SPRING, $, $$, el,
} from './motion.js';
import {
  projects, assets, activity, appCanvasObjects, deskItems, wordCycle, people, byId,
} from './content.js';
import { object, art, avatar } from './parts.js';
import { enterObjects, makeDraggable, placeObjects, onLayoutChange } from './canvas.js';
import { createPresence } from './cursors.js';

function revealHead(id, options = {}) {
  const host = $(id);
  if (!host) return;
  const lines = prepLines(host);
  if (motion.reduced) { revealLines(lines); return; }
  utils.set(lines.map((l) => l.inner), { y: '110%' });
  inView(host, {
    once: true,
    amount: 0.5,
    margin: '0px 0px -8% 0px',
    onEnter: () => {
      revealLines(lines, { stagger: 95, duration: 980 });
      options.then?.();
    },
  });
}

/* ══ 05 · THE WORKSPACE ════════════════════════════════════════════════════ */

export function initWorkspace() {
  revealHead('#product-title');

  const app = $('#app');
  if (!app) return;

  const crumb = $('#app-crumb');
  const crumbTab = $('#app-crumb-tab');

  /* ── PROJECTS ──────────────────────────────────────────────────────────
     A listbox, because that is what it is: single selection out of a set. Using
     the real role means the arrow keys work without us writing them. */
  const side = $('#app-projects');
  const projectNodes = projects.map((project, index) => {
    const node = el('button', 'app-proj');
    node.type = 'button';
    node.setAttribute('role', 'option');
    node.setAttribute('aria-selected', String(index === 0));
    node.dataset.project = project.id;
    node.innerHTML = `
      <b>${project.name}</b>
      <span class="app-proj-live">${project.live ? `<i></i>${project.live}` : ''}</span>
      <span class="app-proj-meta">${project.kind} / ${project.updated}</span>`;
    node.dataset.cursor = 'OPEN';
    side?.appendChild(node);
    return node;
  });
  $('#app-proj-count') && ($('#app-proj-count').textContent = String(projects.length).padStart(2, '0'));

  /* ── TABS ──────────────────────────────────────────────────────────────
     Roving tabindex and a sliding ink bar. The bar is measured from the live
     tab rather than positioned from a table of offsets, so it stays correct when
     the labels change length or the row scrolls. */
  const tabsHost = $('#app-tabs');
  const panelsHost = $('#app-panels');
  if (!tabsHost || !panelsHost) return;

  const tabs = [
    { id: 'canvas', label: 'CANVAS', count: String(appCanvasObjects.length).padStart(2, '0'), build: buildCanvasPanel },
    { id: 'assets', label: 'ASSETS', count: String(assets.length).padStart(2, '0'), build: buildAssetsPanel },
    { id: 'people', label: 'PEOPLE', count: String(people.length).padStart(2, '0'), build: buildPeoplePanel },
    { id: 'activity', label: 'ACTIVITY', count: String(activity.length).padStart(2, '0'), build: buildActivityPanel },
  ];

  const ink = el('span', 'app-tab-ink');
  ink.setAttribute('aria-hidden', 'true');

  const tabNodes = tabs.map((tab, index) => {
    const node = el('button', 'app-tab');
    node.type = 'button';
    node.setAttribute('role', 'tab');
    node.id = `tab-${tab.id}`;
    node.setAttribute('aria-controls', `panel-${tab.id}`);
    node.setAttribute('aria-selected', String(index === 0));
    node.tabIndex = index === 0 ? 0 : -1;
    node.dataset.cursor = 'OPEN';
    node.innerHTML = `${tab.label}<em>${tab.count}</em>`;
    tabsHost.appendChild(node);
    return node;
  });
  tabsHost.appendChild(ink);

  const panelNodes = tabs.map((tab, index) => {
    const panel = el('div', 'app-panel');
    panel.id = `panel-${tab.id}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', `tab-${tab.id}`);
    panel.hidden = index !== 0;
    tab.build(panel);
    panelsHost.appendChild(panel);
    return panel;
  });

  let current = 0;

  const moveInk = (node, animated = true) => {
    const left = node.offsetLeft - tabsHost.scrollLeft;
    const width = node.offsetWidth;
    if (!animated || motion.reduced) {
      utils.set(ink, { x: left, width });
      return;
    }
    animate(ink, { x: left, width, duration: 560, ease: EASE.glide });
  };
  moveInk(tabNodes[0], false);
  tabsHost.addEventListener('scroll', () => {
    const live = tabNodes[current];
    if (live) moveInk(live, false);
  }, { passive: true });
  window.addEventListener('resize', () => moveInk(tabNodes[current], false), { passive: true });

  const select = (index, { focus = false } = {}) => {
    if (index === current) return;
    const previous = current;
    current = index;

    tabNodes.forEach((node, i) => {
      node.setAttribute('aria-selected', String(i === index));
      node.tabIndex = i === index ? 0 : -1;
    });
    if (focus) tabNodes[index].focus();
    moveInk(tabNodes[index]);
    if (crumbTab) crumbTab.textContent = tabs[index].label;

    // The outgoing panel leaves in the scroll direction of the move, so the
    // panels read as a row you are moving along rather than a stack of dialogs.
    const forward = index > previous;
    const out = panelNodes[previous];
    const into = panelNodes[index];

    if (motion.reduced) {
      out.hidden = true;
      into.hidden = false;
      return;
    }

    animate(out, {
      opacity: 0,
      x: forward ? -18 : 18,
      duration: 220,
      ease: EASE.exit,
      onComplete: () => { out.hidden = true; },
    });
    into.hidden = false;
    utils.set(into, { opacity: 0, x: forward ? 22 : -22 });
    animate(into, { opacity: 1, x: 0, duration: 520, delay: 90, ease: EASE.rise });
    animate($$('[data-stagger]', into), {
      opacity: [0, 1],
      y: [14, 0],
      duration: 620,
      delay: stagger(40, { start: 140 }),
      ease: EASE.rise,
    });
  };

  tabNodes.forEach((node, index) => {
    node.addEventListener('click', () => select(index));
    node.addEventListener('keydown', (event) => {
      const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      event.preventDefault();
      select((current + step + tabNodes.length) % tabNodes.length, { focus: true });
    });
  });

  /* Selecting a project reloads the panel. That is not decoration: it is the
     only truthful way to show a switch happening, and it reuses the entrance
     the panel already has. */
  projectNodes.forEach((node, index) => {
    node.addEventListener('click', () => {
      projectNodes.forEach((other, i) => other.setAttribute('aria-selected', String(i === index)));
      if (crumb) crumb.textContent = projects[index].name;
      const panel = panelNodes[current];
      if (motion.reduced) return;
      animate(panel, { opacity: [0.35, 1], duration: 480, ease: EASE.rise });
      const staggered = $$('[data-stagger]', panel);
      if (staggered.length) {
        animate(staggered, {
          opacity: [0, 1],
          y: [12, 0],
          duration: 560,
          delay: stagger(34),
          ease: EASE.rise,
        });
      }
    });
  });

  inView(app, {
    once: true,
    amount: 0.12,
    onEnter: () => {
      if (motion.reduced) return;
      animate(app, { opacity: [0, 1], y: [26, 0], duration: 900, ease: EASE.rise });
    },
  });
}

/* ── PANELS ──────────────────────────────────────────────────────────────
   Each builder owns one panel and nothing else. `data-stagger` marks the rows a
   panel transition should bring in one after another. */

function buildCanvasPanel(panel) {
  // The canvas fills its panel and does not scroll: its objects are placed as
  // percentages of it, so a scrollable canvas would mean a canvas whose own
  // coordinate space changes size as you scroll it.
  panel.classList.add('app-panel--canvas');
  const stage = el('div', 'app-canvas stage');
  stage.dataset.canvas = '';
  panel.appendChild(stage);

  for (const data of appCanvasObjects) stage.appendChild(object(data));
  placeObjects(appCanvasObjects, { root: stage });
  const drags = makeDraggable(stage);
  onLayoutChange(() => placeObjects(appCanvasObjects, { root: stage, drags }));

  panel.appendChild(el('p', 'lab app-canvas-hint', 'THIS CANVAS IS REAL / DRAG SOMETHING'));

  inView(stage, {
    once: true,
    amount: 0.2,
    onEnter: () => enterObjects($$('.obj', stage), { step: 80 }),
  });
}

function buildAssetsPanel(panel) {
  const grid = el('div', 'asset-grid');
  for (const asset of assets) {
    const node = el('button', 'asset');
    node.type = 'button';
    node.dataset.stagger = '';
    node.dataset.cursor = 'VIEW';
    node.innerHTML = `
      ${art(asset.art)}
      <span class="asset-name">${asset.name}</span>
      <span class="asset-meta"><span>${asset.kind}</span><span>${asset.size}</span></span>`;
    grid.appendChild(node);
  }
  panel.appendChild(grid);
}

function buildPeoplePanel(panel) {
  const list = el('div', 'people-list');
  people.forEach((person, index) => {
    const row = el('div', 'person');
    row.dataset.stagger = '';
    row.appendChild(avatar(person, { live: index < 3 }));
    row.appendChild(
      el('div', null, `<span class="person-name">${person.name}</span><br /><span class="person-role">${person.role}</span>`)
    );
    row.appendChild(
      el('span', 'person-state', index < 3 ? '<i></i>IN THE ROOM' : 'HERE NOW')
    );
    list.appendChild(row);
  });
  panel.appendChild(list);
}

function buildActivityPanel(panel) {
  const feed = el('div', 'feed');
  for (const item of activity) {
    const person = byId(item.who);
    const row = el('div', 'feed-row');
    row.dataset.stagger = '';
    row.appendChild(avatar(person, { live: false }));
    row.appendChild(el('span', 'feed-what', `<b>${person?.name ?? ''}</b> ${item.what}`));
    row.appendChild(el('span', 'feed-when', item.when));
    feed.appendChild(row);
  }
  panel.appendChild(feed);
}

/* ══ 06 · COLLABORATION ════════════════════════════════════════════════════ */

export function initFaster() {
  const mark = $('.faster-head .mark');
  if (mark) utils.set(mark, { '--swipe': motion.reduced ? 1 : 0 });

  revealHead('#faster-title', {
    then: () => {
      if (!mark || motion.reduced) return;
      // The highlighter lands after the words it marks, so it reads as a second
      // gesture by the same hand.
      animate(mark, { '--swipe': 1, duration: 620, delay: 420, ease: EASE.snap });
    },
  });

  const stage = $('#shared');
  const word = $('#shared-word');
  if (!stage || !word) return;

  const presence = createPresence(stage, ['mara', 'alex', 'juno']);
  const obj = $('.shared-obj', stage);
  tactile(obj, { lift: 5, tilt: 1.6 });

  if (motion.reduced) return;

  /* Four cursors converge on one object and take turns rewriting it. The loop is
     gated on visibility and torn down when the section leaves, so the page is
     never running a four-cursor choreography you cannot see. */
  const spots = [
    { id: 'mara', at: { x: 24, y: 26 }, from: { x: 8, y: 12 } },
    { id: 'alex', at: { x: 74, y: 30 }, from: { x: 92, y: 14 } },
    { id: 'juno', at: { x: 68, y: 76 }, from: { x: 90, y: 92 } },
  ];

  let step = 0;
  let timer = null;
  let running = false;

  const beat = () => {
    if (!running) return;
    const spot = spots[step % spots.length];
    const next = wordCycle[(step + 1) % wordCycle.length];

    presence.moveTo(spot.id, spot.at, { duration: 900 });
    window.setTimeout(() => {
      if (!running) return;
      presence.press(spot.id);
      const release = presence.select(spot.id, obj);
      typeText(word, next, { rate: 20 });
      // The object registers the edit: a small settle, not a bounce.
      animate(obj, { scale: [1, 1.015, 1], duration: 620, ease: SPRING.ui });
      window.setTimeout(() => release?.(), 1500);
    }, 900);

    step += 1;
    timer = window.setTimeout(beat, 3400);
  };

  inView(stage, {
    amount: 0.3,
    onEnter: () => {
      if (running) return;
      running = true;
      for (const spot of spots) presence.show(spot.id, spot.from);
      // Long enough for the three arrivals to land before anyone is asked to
      // move; see the same note on the take in story.js.
      timer = window.setTimeout(beat, 1200);
    },
    onLeave: () => {
      running = false;
      window.clearTimeout(timer);
      for (const spot of spots) presence.hide(spot.id);
    },
  });
}

/* ══ 07 · EVERYTHING IN ONE PLACE ══════════════════════════════════════════ */

export function initDesk() {
  revealHead('#every-title');

  const desk = $('#desk');
  const filtersHost = $('#filters');
  const state = $('#desk-state');
  const count = $('#desk-count');
  if (!desk) return;

  for (const data of deskItems) desk.appendChild(object(data));
  placeObjects(deskItems, { root: desk });
  const drags = makeDraggable(desk);
  onLayoutChange(() => placeObjects(deskItems, { root: desk, drags }));

  const nodes = $$('.obj', desk);
  if (count) count.textContent = `${String(deskItems.length).padStart(2, '0')} THINGS`;

  utils.set(nodes, { opacity: 0 });
  inView(desk, {
    once: true,
    amount: 0.15,
    onEnter: () => enterObjects(nodes, { step: 70 }),
  });

  /* ── FILTERS ───────────────────────────────────────────────────────────
     Filtering does not remove anything. Matching things lift and everything
     else recedes — which is what "everything is in one place" has to look like,
     and it means nothing ever jumps position because a sibling vanished. */
  const categories = ['ALL', ...new Set(deskItems.map((item) => item.cat))];
  let active = 'ALL';

  const buttons = categories.map((cat) => {
    const node = el('button', 'filter', cat);
    node.type = 'button';
    node.setAttribute('aria-pressed', String(cat === active));
    node.dataset.cursor = 'FILTER';
    filtersHost?.appendChild(node);
    node.addEventListener('click', () => apply(cat));
    return node;
  });

  function apply(cat) {
    active = cat;
    for (const button of buttons) {
      button.setAttribute('aria-pressed', String(button.textContent === cat));
    }

    const matched = nodes.filter((node) => cat === 'ALL' || node.dataset.cat === cat);
    const dimmed = nodes.filter((node) => !matched.includes(node));

    for (const node of nodes) node.classList.toggle('is-dimmed', dimmed.includes(node));
    if (state) {
      state.textContent = cat === 'ALL'
        ? `SHOWING ALL ${String(nodes.length).padStart(2, '0')}`
        : `${String(matched.length).padStart(2, '0')} IN ${cat}`;
    }
    if (motion.reduced) return;

    // Matching objects lift and come forward; the rest sink a little. Two
    // properties, no layout, and the composition never rearranges.
    animate(matched.map((n) => n.querySelector('.obj-in')), {
      opacity: 1,
      scale: 1,
      duration: 620,
      delay: stagger(34),
      ease: SPRING.ui,
    });
    animate(dimmed.map((n) => n.querySelector('.obj-in')), {
      opacity: 0.24,
      scale: 0.97,
      duration: 520,
      delay: stagger(22),
      ease: EASE.soft,
    });
  }
}

/* ══ 08 · THE CLOSING ACT ══════════════════════════════════════════════════ */

export function initClosing() {
  const title = $('#start-title');
  if (title) {
    const lines = prepLines(title);
    if (motion.reduced) {
      revealLines(lines);
    } else {
      utils.set(lines.map((l) => l.inner), { y: '110%' });
      inView(title, {
        once: true,
        amount: 0.4,
        onEnter: () => revealLines(lines, { stagger: 105, duration: 1050 }),
      });
    }
  }

  // The button is the last thing on the page, so it is the one allowed to be
  // magnetic — a pull you feel before you arrive.
  const button = $('#cta-btn');
  if (button && hasHover) magnetic(button, { strength: 0.16, rotate: 0.8 });

  // The closing waveform is the hero's HUM meter, read one last time — built and
  // driven by chrome.js so there is exactly one implementation of it.
}
