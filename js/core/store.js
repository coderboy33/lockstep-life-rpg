// Persistent storage for all app data (this device only — see README "Your data").
// - Main save in localStorage, written shortly after every change and when the app is hidden.
// - A rolling daily backup copy so a corrupted save can be recovered automatically.
// - Versioned schema with migrations (core/state.js).

import { APP } from './config.js';
import { defaultState, migrate } from './state.js';
import { clock, dayKey } from './dates.js';

const KEY = APP.storageKey;
const BACKUP_KEY = KEY + '.backup';
const CORRUPT_KEY = KEY + '.corrupt';

let state = null;
let saveTimer = null;
let dirty = false;
const subs = new Set();
const errorSubs = new Set();

export const loadInfo = { fresh: false, recovered: null, error: null, storageBlocked: false };

function ls() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function load() {
  const now = clock.now();
  const storage = ls();
  let raw = null;
  if (!storage) loadInfo.storageBlocked = true;
  else {
    try {
      raw = storage.getItem(KEY);
    } catch {
      loadInfo.storageBlocked = true;
    }
  }
  if (raw) {
    try {
      state = migrate(JSON.parse(raw), now);
    } catch (e) {
      loadInfo.error = e.message || String(e);
      try {
        storage.setItem(CORRUPT_KEY, raw);
      } catch {
        /* ignore */
      }
      const b = storage.getItem(BACKUP_KEY);
      if (b) {
        try {
          state = migrate(JSON.parse(b), now);
          loadInfo.recovered = 'backup';
        } catch {
          state = null;
        }
      }
    }
  }
  if (!state) {
    state = defaultState(now);
    loadInfo.fresh = !raw;
  }
  // Keep yesterday's good copy as an automatic backup.
  if (raw && !loadInfo.error && storage) {
    const today = dayKey(now, state.settings);
    if (state.meta.lastBackupDay !== today) {
      try {
        storage.setItem(BACKUP_KEY, raw);
        state.meta.lastBackupDay = today;
      } catch {
        /* storage full: skip backup */
      }
    }
  }
  return state;
}

function writeNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!dirty) return true;
  const storage = ls();
  if (!storage) return false;
  try {
    storage.setItem(KEY, JSON.stringify(state));
    dirty = false;
    return true;
  } catch (e) {
    const quota = e && (e.name === 'QuotaExceededError' || e.code === 22);
    for (const f of errorSubs) f(quota ? 'Storage is full. Export a backup and delete old evidence videos in Settings → Data.' : 'Couldn’t save your progress. Is private browsing on?');
    return false;
  }
}

export const store = {
  get state() {
    return state;
  },
  load,
  /** Mutate state, persist, and re-render. */
  update(fn, opts = {}) {
    const result = fn(state);
    dirty = true;
    if (opts.immediate) writeNow();
    else {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(writeNow, 120);
    }
    if (opts.render !== false) notify();
    return result;
  },
  flush: writeNow,
  /** Replace everything (import / reset). */
  replace(next) {
    state = next;
    dirty = true;
    writeNow();
    notify();
  },
  subscribe(fn) {
    subs.add(fn);
    return () => subs.delete(fn);
  },
  onError(fn) {
    errorSubs.add(fn);
  },
  notify,
  wipe() {
    const storage = ls();
    try {
      storage.removeItem(KEY);
      storage.removeItem(BACKUP_KEY);
      storage.removeItem(CORRUPT_KEY);
    } catch {
      /* ignore */
    }
  },
  corruptCopy() {
    try {
      return ls().getItem(CORRUPT_KEY);
    } catch {
      return null;
    }
  },
  sizeBytes() {
    try {
      return (ls().getItem(KEY) || '').length * 2;
    } catch {
      return 0;
    }
  },
};

let notifyQueued = false;
function notify() {
  if (notifyQueued) return;
  notifyQueued = true;
  let ran = false;
  const run = () => {
    if (ran) return;
    ran = true;
    notifyQueued = false;
    for (const f of subs) {
      try {
        f(state);
      } catch (e) {
        console.error(e);
      }
    }
  };
  // rAF pauses in background tabs, so fall back to a timer.
  requestAnimationFrame(run);
  setTimeout(run, 50);
}

// Save when the app goes to the background or closes.
if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && writeNow());
  window.addEventListener('pagehide', writeNow);
  // Another tab changed the data: reload it so we never overwrite newer progress.
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY || !e.newValue) return;
    try {
      state = migrate(JSON.parse(e.newValue), clock.now());
      dirty = false;
      notify();
    } catch {
      /* ignore bad data from other tab */
    }
  });
}
