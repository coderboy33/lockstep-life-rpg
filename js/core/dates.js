// Date helpers. All "day keys" are 'YYYY-MM-DD' strings in the user's chosen time zone.
// A "game day" can start later than midnight (settings.dayStartHour) so a 12:30 AM
// completion still counts toward the previous day.

export const WD_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const WD_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WD_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const HOUR = 3600000;
const fmtCache = new Map();

function formatterFor(tz) {
  if (!fmtCache.has(tz)) {
    fmtCache.set(
      tz,
      new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        weekday: 'short',
      })
    );
  }
  return fmtCache.get(tz);
}

export function deviceTz() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function listTimeZones() {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return ['UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Toronto', 'America/Vancouver', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney'];
  }
}

function tzOf(settings) {
  const tz = settings && settings.timeZone;
  return !tz || tz === 'auto' ? null : tz;
}

/** Wall-clock parts of a timestamp in the configured zone. */
export function parts(ts, settings) {
  const tz = tzOf(settings);
  if (tz) {
    try {
      const out = {};
      for (const p of formatterFor(tz).formatToParts(new Date(ts))) out[p.type] = p.value;
      return {
        y: +out.year,
        m: +out.month,
        d: +out.day,
        hh: +out.hour % 24,
        mm: +out.minute,
        ss: +out.second,
        wd: WD_SHORT.indexOf(out.weekday),
      };
    } catch {
      /* invalid zone: fall through to device time */
    }
  }
  const d = new Date(ts);
  return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), hh: d.getHours(), mm: d.getMinutes(), ss: d.getSeconds(), wd: d.getDay() };
}

const pad = (n) => String(n).padStart(2, '0');
export const keyOf = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

/** Calendar date (midnight boundary). Used for alarms. */
export function dateKey(ts, settings) {
  const p = parts(ts, settings);
  return keyOf(p.y, p.m, p.d);
}

/** Game day (respects settings.dayStartHour). Used for quests, streaks and ranked. */
export function dayKey(ts, settings) {
  const shift = (Number(settings?.dayStartHour) || 0) * HOUR;
  const p = parts(ts - shift, settings);
  return keyOf(p.y, p.m, p.d);
}

export function isKey(k) {
  return typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k);
}

export function parseKey(k) {
  const [y, m, d] = String(k).split('-').map(Number);
  return { y, m, d };
}

const utcOf = (k) => {
  const { y, m, d } = parseKey(k);
  return Date.UTC(y, m - 1, d);
};

export function addDays(k, n) {
  const dt = new Date(utcOf(k) + n * 86400000);
  return keyOf(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** b − a in whole days. */
export function diffDays(a, b) {
  return Math.round((utcOf(b) - utcOf(a)) / 86400000);
}

export function weekday(k) {
  return new Date(utcOf(k)).getUTCDay();
}

export function weekKey(k, weekStartsOn = 1) {
  const off = (weekday(k) - weekStartsOn + 7) % 7;
  return addDays(k, -off);
}

export function weekDays(wk) {
  return Array.from({ length: 7 }, (_, i) => addDays(wk, i));
}

export function rangeKeys(a, b) {
  const out = [];
  if (!a || !b || a > b) return out;
  for (let k = a; k <= b && out.length < 3700; k = addDays(k, 1)) out.push(k);
  return out;
}

export function hmToMin(hm) {
  if (typeof hm !== 'string' || !/^\d{1,2}:\d{2}$/.test(hm)) return null;
  const [h, m] = hm.split(':').map(Number);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

export function minToHm(min) {
  min = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

export function isValidHm(hm) {
  return hmToMin(hm) !== null;
}

/** Minutes since local midnight (calendar time, not game day). */
export function minuteOfDay(ts, settings) {
  const p = parts(ts, settings);
  return p.hh * 60 + p.mm + p.ss / 60;
}

export function fmtTime(hm, use24 = false) {
  const min = hmToMin(hm);
  if (min === null) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (use24) return `${pad(h)}:${pad(m)}`;
  const h12 = h % 12 || 12;
  return `${h12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
}

export function fmtTs(ts, settings, use24 = false) {
  const p = parts(ts, settings);
  return fmtTime(`${pad(p.hh)}:${pad(p.mm)}`, use24);
}

export function fmtDay(k, opts = {}) {
  if (!isKey(k)) return '';
  const { m, d } = parseKey(k);
  const base = `${MONTHS[m - 1]} ${d}`;
  return opts.weekday ? `${WD_SHORT[weekday(k)]}, ${base}` : base;
}

export function fmtDayFull(k) {
  if (!isKey(k)) return '';
  const { y, m, d } = parseKey(k);
  return `${WD_LONG[weekday(k)]}, ${MONTHS[m - 1]} ${d}, ${y}`;
}

export function relDay(k, today) {
  const n = diffDays(today, k);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n < 7) return `In ${n} days`;
  if (n < -1 && n > -7) return `${-n} days ago`;
  return fmtDay(k, { weekday: true });
}

export function greeting(ts, settings) {
  const h = parts(ts, settings).hh;
  if (h < 5) return 'Late night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Global clock. `offset` is only used by the developer time-travel tool in Settings,
 * so you can test day rollovers without waiting.
 */
export const clock = {
  offset: 0,
  now() {
    return Date.now() + this.offset;
  },
};
