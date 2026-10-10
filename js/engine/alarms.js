// Alarm scheduling rules (pure). The runtime in services/alarmRunner.js uses these to ring.
// IMPORTANT: a web page can only ring while it is open. See README "Alarms on iPhone".

import { dateKey, minuteOfDay, addDays, diffDays, weekday, hmToMin, isValidHm, fmtTime } from '../core/dates.js';
import { uid, cleanText, toInt } from '../core/util.js';

export const ALARM_KINDS = [
  { id: 'pushup', name: 'Push-up challenge', icon: 'dumbbell', category: 'fitness', challenge: true },
  { id: 'wake', name: 'Wake up', icon: 'sun', category: 'sleep' },
  { id: 'study', name: 'Study session', icon: 'book', category: 'study' },
  { id: 'workout', name: 'Workout', icon: 'dumbbell', category: 'fitness' },
  { id: 'care', name: 'Personal care', icon: 'sparkle', category: 'care' },
  { id: 'business', name: 'Business work', icon: 'briefcase', category: 'business' },
  { id: 'trading', name: 'Trading journal', icon: 'chart', category: 'trading' },
  { id: 'evening', name: 'Evening routine', icon: 'moon', category: 'sleep' },
  { id: 'custom', name: 'Custom', icon: 'bell', category: 'growth' },
];
export const kindOf = (id) => ALARM_KINDS.find((k) => k.id === id) || ALARM_KINDS[ALARM_KINDS.length - 1];

export function sanitizeAlarm(data, existing = {}) {
  const errors = [];
  const kind = ALARM_KINDS.some((k) => k.id === data.kind) ? data.kind : existing.kind || 'custom';
  const time = isValidHm(data.time) ? data.time : existing.time;
  if (!time) errors.push('Pick a valid time.');
  const days = Array.isArray(data.days) ? [...new Set(data.days.map(Number).filter((d) => d >= 0 && d <= 6))].sort() : existing.days || [];
  if (!days.length) errors.push('Choose at least one day.');
  const ch = data.challenge || existing.challenge || {};
  const a = {
    kind,
    label: cleanText(data.label, 60) || kindOf(kind).name,
    time,
    days,
    enabled: data.enabled !== false,
    challenge:
      kind === 'pushup' || data.withChallenge
        ? {
            pushups: toInt(ch.pushups, 20, 1, 300),
            situps: toInt(ch.situps, 0, 0, 300),
            requireVideo: !!ch.requireVideo,
          }
        : null,
    reminderEveryMin: toInt(data.reminderEveryMin, 5, 1, 60),
    reminderRepeats: toInt(data.reminderRepeats, 3, 0, 10),
    graceMin: toInt(data.graceMin, 30, 5, 240),
    xp: toInt(data.xp, 40, 5, 300),
    partOfDaily: data.partOfDaily !== false,
    sound: ['pulse', 'chime', 'siren'].includes(data.sound) ? data.sound : 'pulse',
    target: data.target && data.target.kind ? { kind: String(data.target.kind), id: data.target.id ? String(data.target.id) : null } : null,
  };
  return { ok: !errors.length, errors, alarm: a };
}

export function newAlarm(data, now) {
  const res = sanitizeAlarm(data);
  if (!res.ok) return res;
  return { ok: true, alarm: { id: uid('a'), createdAt: now, questId: null, ...res.alarm } };
}

export const occKey = (alarm, date) => `${alarm.id}@${date}`;

/**
 * The occurrence that matters right now: today's, or yesterday's if its grace window crosses midnight.
 * Returns { key, date, startMin, nowMin, endMin, log } with minutes relative to `date`'s midnight.
 */
export function currentOccurrence(state, alarm, now) {
  const s = state.settings;
  const today = dateKey(now, s);
  const nowMin = minuteOfDay(now, s);
  const at = hmToMin(alarm.time);
  const cand = [];
  if (alarm.days.includes(weekday(today))) cand.push({ date: today, nowMin });
  const y = addDays(today, -1);
  if (alarm.days.includes(weekday(y)) && at + alarm.graceMin >= 1440) cand.push({ date: y, nowMin: nowMin + 1440 });
  for (const c of cand) {
    const endMin = at + alarm.graceMin;
    if (c.nowMin >= at && c.nowMin <= endMin) return { key: occKey(alarm, c.date), date: c.date, startMin: at, endMin, nowMin: c.nowMin, log: state.alarmLog[occKey(alarm, c.date)] || null, inWindow: true };
  }
  if (cand[0]) {
    const c = cand[0];
    return { key: occKey(alarm, c.date), date: c.date, startMin: at, endMin: at + alarm.graceMin, nowMin: c.nowMin, log: state.alarmLog[occKey(alarm, c.date)] || null, inWindow: false };
  }
  return null;
}

/** 'off' | 'notToday' | 'upcoming' | 'ringing' | 'snoozed' | 'started' | 'done' | 'dismissed' | 'skipped' | 'missed' */
export function alarmPhase(state, alarm, now) {
  if (!alarm.enabled) return 'off';
  const occ = currentOccurrence(state, alarm, now);
  if (!occ) return 'notToday';
  // An alarm created after its time on that day doesn't count as missed (or ring late).
  if (alarm.createdAt && dateKey(alarm.createdAt, state.settings) === occ.date && minuteOfDay(alarm.createdAt, state.settings) > occ.startMin && !occ.log) return 'notToday';
  const st = occ.log && occ.log.status;
  if (st === 'done' || st === 'dismissed' || st === 'skipped') return st;
  if (occ.nowMin < occ.startMin) return 'upcoming';
  if (!occ.inWindow) return st === 'started' ? 'started' : 'missed';
  if (st === 'snoozed') return occ.log.snoozedUntil > now ? 'snoozed' : 'ringing';
  if (st === 'started') return 'started';
  return 'ringing';
}

/** Alarms that should be ringing right now (respecting snooze and reminder limits). */
export function ringingAlarms(state, now) {
  const out = [];
  for (const a of state.alarms) {
    if (alarmPhase(state, a, now) !== 'ringing') continue;
    const occ = currentOccurrence(state, a, now);
    const log = occ.log;
    if (log && log.status === 'snoozed' && (log.rings || 0) > a.reminderRepeats) continue;
    out.push({ alarm: a, occ });
  }
  return out;
}

export function logOcc(state, key, patch) {
  state.alarmLog[key] = { ...(state.alarmLog[key] || {}), ...patch };
  return state.alarmLog[key];
}

export function markRung(state, alarm, occ, now) {
  const log = occ.log || {};
  if (log.status === 'ringing' && log.lastRingTs && now - log.lastRingTs < 60000) return log;
  return logOcc(state, occ.key, {
    status: 'ringing',
    firstRingTs: log.firstRingTs || now,
    lastRingTs: now,
    rings: (log.rings || 0) + (log.status === 'ringing' ? 0 : 1),
  });
}

export function snooze(state, alarm, occ, now) {
  const rings = (occ.log && occ.log.rings) || 1;
  if (rings > alarm.reminderRepeats) return { ok: false, reason: 'No snoozes left for this alarm.' };
  logOcc(state, occ.key, { status: 'snoozed', snoozedUntil: now + alarm.reminderEveryMin * 60000 });
  return { ok: true };
}

export function canSnooze(alarm, occ) {
  return ((occ.log && occ.log.rings) || 1) <= alarm.reminderRepeats;
}

/** Was `ts` (when the challenge was started) on time for the occurrence on `date`? Up to 60 min early counts. */
export function isOnTime(state, alarm, date, ts) {
  const s = state.settings;
  const at = hmToMin(alarm.time);
  const d0 = dateKey(ts, s);
  if (d0 < date) return false;
  const m = minuteOfDay(ts, s) + 1440 * diffDays(date, d0);
  return m >= at - 60 && m <= at + alarm.graceMin;
}

/** Next time this alarm will go off. Returns { date, time, inMin } or null. */
export function nextOccurrence(state, alarm, now) {
  if (!alarm.enabled || !alarm.days.length) return null;
  const s = state.settings;
  const today = dateKey(now, s);
  const nowMin = minuteOfDay(now, s);
  const at = hmToMin(alarm.time);
  for (let i = 0; i < 8; i++) {
    const d = addDays(today, i);
    if (!alarm.days.includes(weekday(d))) continue;
    if (i === 0 && at <= nowMin) continue;
    return { date: d, time: alarm.time, inMin: Math.round(i * 1440 + at - nowMin) };
  }
  return null;
}

export function nextAlarm(state, now) {
  let best = null;
  for (const a of state.alarms) {
    const n = nextOccurrence(state, a, now);
    if (n && (!best || n.inMin < best.inMin)) best = { alarm: a, ...n };
  }
  return best;
}

export function describeDays(days) {
  const set = [...days].sort().join(',');
  if (set === '0,1,2,3,4,5,6') return 'Every day';
  if (set === '1,2,3,4,5') return 'Weekdays';
  if (set === '0,6') return 'Weekends';
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days.map((d) => names[d]).join(', ');
}

export function pruneAlarmLog(state, today) {
  const cutoff = addDays(today, -60);
  for (const k of Object.keys(state.alarmLog)) {
    const date = k.split('@')[1];
    if (!date || date < cutoff) delete state.alarmLog[k];
  }
}

// ---------- calendar export (reliable alerts on iPhone even when the app is closed) ----------

const ICS_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function icsEscape(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function foldLine(line) {
  const out = [];
  while (line.length > 74) {
    out.push(line.slice(0, 74));
    line = ' ' + line.slice(74);
  }
  out.push(line);
  return out.join('\r\n');
}

export function buildICS(alarms, { appUrl, now, startDate }) {
  const stamp = new Date(now).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lockstep//Life RPG//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const a of alarms) {
    if (!a.enabled || !a.days.length) continue;
    // First matching day on/after startDate.
    let d = startDate;
    for (let i = 0; i < 7 && !a.days.includes(weekday(d)); i++) d = addDays(d, 1);
    const [hh, mm] = a.time.split(':');
    const dt = `${d.replace(/-/g, '')}T${hh}${mm}00`;
    const url = `${appUrl}#/alarm/${a.id}`;
    const what = a.challenge ? `${a.challenge.pushups} push-ups${a.challenge.situps ? ` + ${a.challenge.situps} sit-ups` : ''}` : kindOf(a.kind).name;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${a.id}@lockstep.app`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${dt}`,
      'DURATION:PT15M',
      `RRULE:FREQ=WEEKLY;BYDAY=${a.days.map((x) => ICS_DAYS[x]).join(',')}`,
      `SUMMARY:${icsEscape(`⏰ ${a.label}`)}`,
      `DESCRIPTION:${icsEscape(`${what} at ${fmtTime(a.time)}. Open Lockstep from your Home Screen to start.\n${url}`)}`,
      `URL:${url}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsEscape(a.label)}`,
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
