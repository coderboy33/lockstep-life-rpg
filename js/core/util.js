// Small, dependency-free helpers shared by the engine and the UI.

export const uid = (prefix = '') =>
  prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const sum = (arr, fn = (x) => x) => arr.reduce((s, x) => s + (Number(fn(x)) || 0), 0);

export const mean = (arr) => (arr.length ? sum(arr) / arr.length : 0);

export const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function deepClone(o) {
  if (typeof structuredClone === 'function') return structuredClone(o);
  return JSON.parse(JSON.stringify(o));
}

/** Recursively merges `over` onto a copy of `base`. Arrays are replaced, not merged. */
export function deepMerge(base, over) {
  if (!isObj(base)) return over === undefined ? base : over;
  const out = { ...base };
  if (!isObj(over)) return out;
  for (const k of Object.keys(over)) {
    const v = over[k];
    if (v === undefined) continue;
    out[k] = isObj(base[k]) && isObj(v) ? deepMerge(base[k], v) : v;
  }
  return out;
}

/** Fills in missing keys of `target` from `defaults` (in place). Wrong types are replaced. */
export function fillDefaults(target, defaults) {
  if (!isObj(target)) return deepClone(defaults);
  for (const k of Object.keys(defaults)) {
    const d = defaults[k];
    const v = target[k];
    if (v === undefined || v === null) {
      if (d !== null) target[k] = deepClone(d);
    } else if (isObj(d)) {
      target[k] = isObj(v) ? fillDefaults(v, d) : deepClone(d);
    } else if (Array.isArray(d)) {
      if (!Array.isArray(v)) target[k] = deepClone(d);
    } else if (d !== null && typeof d !== typeof v) {
      target[k] = d;
    }
  }
  return target;
}

export const fmtNum = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');

export const signed = (n) => (n > 0 ? `+${fmtNum(n)}` : n < 0 ? `−${fmtNum(Math.abs(n))}` : '±0');

export const pct = (x) => `${Math.round((Number(x) || 0) * 100)}%`;

export function plural(n, one, many) {
  return `${fmtNum(n)} ${n === 1 ? one : many || one + 's'}`;
}

export function fmtDuration(min) {
  min = Math.round(Number(min) || 0);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function fmtClock(totalSec) {
  totalSec = Math.max(0, Math.round(totalSec));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  return h ? `${h}:${mm}:${String(s).padStart(2, '0')}` : `${mm}:${String(s).padStart(2, '0')}`;
}

export function fmtBytes(b) {
  if (!b) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(b) / Math.log(1024)));
  return `${(b / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
}

/** Trims, caps length and strips control characters from user text. */
export function cleanText(s, max = 500) {
  return String(s ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}

export function toInt(v, fallback = 0, lo = -Infinity, hi = Infinity) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? clamp(n, lo, hi) : fallback;
}

export function toNum(v, fallback = 0, lo = -Infinity, hi = Infinity) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? clamp(n, lo, hi) : fallback;
}

export function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

export function groupBy(arr, fn) {
  const m = {};
  for (const x of arr) (m[fn(x)] ||= []).push(x);
  return m;
}

export function uniq(arr) {
  return [...new Set(arr)];
}

export function capitalize(s) {
  s = String(s || '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
