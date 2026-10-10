// Lockstep — app bootstrap, router, tab bar, background tick.

import { store, loadInfo } from './core/store.js';
import { session } from './core/session.js';
import { clock, dayKey } from './core/dates.js';
import { ACCENTS, APP } from './core/config.js';
import { runSettlement } from './engine/ranked.js';
import { pruneAlarmLog } from './engine/alarms.js';
import { h, icon, clear } from './ui/dom.js';
import { toast, closeAllSheets, hasOpenSheet } from './ui/overlay.js';
import { unlockAudio, setMuted, silentTestMode } from './services/audio.js';
import { registerServiceWorker, persistStorage } from './services/platform.js';
import { showRankEvents, advanceFocus } from './services/actions.js';
import { startAlarmRunner, checkAlarms } from './services/alarmRunner.js';
import { enforceEvidenceRetention } from './services/backup.js';

const SCREENS = {
  home: () => import('./screens/home.js'),
  quests: () => import('./screens/quests.js'),
  body: () => import('./screens/body.js'),
  grind: () => import('./screens/grind.js'),
  me: () => import('./screens/me.js'),
  onboarding: () => import('./screens/onboarding.js'),
  alarms: () => import('./screens/alarms.js'),
  alarm: () => import('./screens/alarms.js'),
  bedside: () => import('./screens/alarms.js'),
  challenge: () => import('./screens/challenge.js'),
  focus: () => import('./screens/focus.js'),
  workout: () => import('./screens/workout.js'),
  routine: () => import('./screens/routine.js'),
  ladder: () => import('./screens/ladder.js'),
  review: () => import('./screens/review.js'),
  settings: () => import('./screens/settings.js'),
  project: () => import('./screens/business.js'),
  references: () => import('./screens/references.js'),
};

const TABS = [
  { id: 'home', name: 'Home', icon: 'home' },
  { id: 'quests', name: 'Quests', icon: 'target' },
  { id: 'body', name: 'Body', icon: 'dumbbell' },
  { id: 'grind', name: 'Grind', icon: 'bolt' },
  { id: 'me', name: 'Me', icon: 'user' },
];
const TAB_OF = { alarms: 'home', focus: 'grind', project: 'grind', workout: 'body', routine: 'body', ladder: 'me', review: 'me', settings: 'me', references: 'me' };

const view = document.getElementById('view');
const tabbar = document.getElementById('tabbar');
const modCache = {};
let current = { name: null, mod: null, key: null };
let renderSeq = 0;
let lastDay = null;

export function nav(path) {
  const target = path.startsWith('#') ? path : `#/${path.replace(/^\/+/, '')}`;
  if (location.hash === target) render();
  else location.hash = target;
}
window.__nav = nav;

function parseHash() {
  const raw = (location.hash || '#/home').replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  return { name: parts[0] || 'home', params: parts.slice(1), query, key: raw };
}

async function loadScreen(name) {
  const loader = SCREENS[name];
  if (!loader) return null;
  if (!modCache[name]) modCache[name] = await loader();
  return modCache[name];
}

function renderTabbar(active) {
  clear(tabbar);
  tabbar.appendChild(h('div.brand-mini', { html: '<img src="./assets/icons/favicon.svg" width="40" height="40" alt="">' }));
  for (const t of TABS) {
    tabbar.appendChild(
      h(
        'a.tab' + (t.id === active ? '.on' : ''),
        { href: `#/${t.id}`, 'aria-current': t.id === active ? 'page' : undefined },
        icon(t.icon, 23),
        h('span', t.name)
      )
    );
  }
}

export async function render(opts = {}) {
  const seq = ++renderSeq;
  const s = store.state;
  let route = parseHash();
  applyAppearance(s);

  if (s.settings.pinHash && !session.unlocked) route = { name: 'lock', params: [], query: {}, key: 'lock' };
  else if (!s.onboarded && route.name !== 'onboarding') route = { name: 'onboarding', params: [], query: {}, key: 'onboarding' };
  else if (s.onboarded && route.name === 'onboarding' && !route.query.edit) route = { name: 'home', params: [], query: {}, key: 'home' };

  let mod;
  try {
    mod = route.name === 'lock' ? await import('./screens/lock.js') : await loadScreen(route.name);
    if (!mod) {
      location.replace('#/home');
      return;
    }
  } catch (e) {
    console.error(e);
    clear(view).appendChild(errorView(e));
    return;
  }
  if (seq !== renderSeq) return;

  const sameScreen = current.key === route.key && current.mod === mod;
  // Some screens (camera, onboarding) manage their own DOM and must not be rebuilt on data changes.
  if (sameScreen && opts.fromStore && mod.isStatic && mod.isStatic(route)) return;
  if (!sameScreen && current.mod && current.mod.cleanup) {
    try {
      current.mod.cleanup();
    } catch (e) {
      console.error(e);
    }
  }

  const ctx = { route, params: route.params, query: route.query, state: s, now: clock.now(), today: dayKey(clock.now(), s.settings), nav, refresh: () => render() };
  let node;
  try {
    node = await mod.render(ctx);
  } catch (e) {
    console.error(e);
    node = errorView(e);
  }
  if (seq !== renderSeq) return;
  const scrollY = window.scrollY;
  view.replaceChildren(node);
  const fullScreen = !!(mod.fullScreen && mod.fullScreen(route));
  view.classList.toggle('no-tabbar', fullScreen);
  tabbar.classList.toggle('hidden', fullScreen || route.name === 'lock' || route.name === 'onboarding');
  renderTabbar(TAB_OF[route.name] || route.name);
  if (sameScreen) window.scrollTo(0, scrollY);
  else if (!opts.keepScroll) window.scrollTo(0, 0);
  current = { name: route.name, mod, key: route.key };
}

function errorView(e) {
  return h(
    'div.card.danger.mt-24',
    h('div.card-title', 'Something went wrong on this screen'),
    h('p.muted.mt-8', 'Your data is safe. Try going back home. If it keeps happening, export a backup from Settings.'),
    h('pre.tiny.faint.mt-8', { style: 'white-space:pre-wrap' }, String((e && e.message) || e)),
    h('div.row.gap-8.mt-12', h('a.btn.btn-primary.btn-sm', { href: '#/home' }, 'Go home'), h('button.btn.btn-ghost.btn-sm', { onclick: () => location.reload() }, 'Reload'))
  );
}

function applyAppearance(s) {
  const root = document.documentElement;
  const acc = ACCENTS.find((a) => a.id === s.settings.accent) || ACCENTS[0];
  root.style.setProperty('--accent', acc.color);
  root.dataset.stars = s.settings.starfield ? 'on' : 'off';
  root.dataset.motion = s.settings.reduceMotion ? 'reduce' : 'auto';
  root.dataset.haptics = s.settings.haptics && !silentTestMode() ? 'on' : 'off';
  root.dataset.bg = s.settings.oled ? 'oled' : 'default';
  setMuted(!s.settings.sound);
}

function buildStars() {
  const el = document.getElementById('stars');
  if (!el || el.childElementCount) return;
  const rnd = (n) => Math.floor(Math.random() * n);
  const shadows = (count) =>
    Array.from({ length: count }, () => `${rnd(2000)}px ${rnd(2000)}px rgba(255,255,255,${(0.3 + Math.random() * 0.7).toFixed(2)})`).join(',');
  el.append(h('i.s1', { style: { boxShadow: shadows(160) } }), h('i.s2', { style: { boxShadow: shadows(45) } }));
}

/** Settles finished days, prunes old data, and shows any rank changes. */
export function dayTick(force = false) {
  const s = store.state;
  if (!s.onboarded) return;
  const now = clock.now();
  const today = dayKey(now, s.settings);
  if (!force && today === lastDay) return;
  const firstRun = lastDay === null;
  lastDay = today;
  const events = store.update(
    (st) => {
      if (!st.meta.openDays.includes(today)) st.meta.openDays.push(today);
      st.meta.lastOpenTs = now;
      const ev = runSettlement(st, now);
      pruneAlarmLog(st, today);
      return ev;
    },
    { render: !firstRun }
  );
  enforceEvidenceRetention().catch(() => {});
  showRankEvents(events);
  import('./screens/reports.js').then((m) => m.maybeShowReports()).catch((e) => console.error(e));
}

function tick() {
  dayTick();
  advanceFocus();
  checkAlarms();
}

export function unlock() {
  session.unlocked = true;
  render();
}

async function boot() {
  try {
    clock.offset = Number(localStorage.getItem('lockstep.devOffsetMs')) || 0;
  } catch {
    clock.offset = 0;
  }
  store.load();
  store.onError((msg) => toast(msg, { type: 'error', duration: 6000 }));
  buildStars();
  if (loadInfo.recovered) setTimeout(() => toast('Your last save was damaged, so Lockstep restored yesterday’s automatic backup.', { type: 'error', duration: 8000 }), 800);
  else if (loadInfo.error) setTimeout(() => toast('Saved data couldn’t be read. A copy was kept — see Settings → Data.', { type: 'error', duration: 8000 }), 800);
  if (loadInfo.storageBlocked) setTimeout(() => toast('This browser is blocking storage (private mode?). Progress won’t be saved.', { type: 'error', duration: 9000 }), 1200);

  // Audio needs a user gesture to unlock (browser rule).
  for (const ev of ['pointerdown', 'keydown', 'touchend']) document.addEventListener(ev, unlockAudio, { passive: true });

  store.subscribe(() => render({ fromStore: true, keepScroll: true }));
  window.addEventListener('hashchange', () => {
    if (hasOpenSheet()) closeAllSheets();
    render();
  });

  if (store.state.onboarded) dayTick(true);
  await render();
  startAlarmRunner();
  setInterval(tick, 5000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick();
  });
  window.addEventListener('focus', tick);

  registerServiceWorker((worker) => {
    toast('A new version of Lockstep is ready.', {
      action: {
        label: 'Update',
        onClick: () => {
          worker.postMessage('skipWaiting');
          navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
        },
      },
    });
  });
  persistStorage();
  // Warm up the main tabs so switching is instant.
  setTimeout(() => ['home', 'quests', 'body', 'grind', 'me'].forEach((n) => loadScreen(n).catch(() => {})), 1500);
  window.__lockstep = { store, clock, version: APP.version };
}

boot();
