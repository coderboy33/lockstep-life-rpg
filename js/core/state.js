// The shape of all saved data, plus migration and repair of old/corrupted saves.

import { APP } from './config.js';
import { dayKey, deviceTz, addDays } from './dates.js';
import { fillDefaults, isObj } from './util.js';

export function defaultProfile() {
  return {
    name: '',
    avatar: '🔥',
    titleId: 'rookie',
    focusAreas: [],
    priorities: [],
    mainGoals: [],
    improve: '',
    wakeTime: '06:30',
    bedTime: '22:30',
    schoolDays: [1, 2, 3, 4, 5],
    schoolStart: '08:30',
    schoolEnd: '15:00',
    availMinSchool: 120,
    availMinWeekend: 240,
    studyTime: '16:30',
    studyMinutesPerDay: 60,
    studyPriorities: '',
    fitness: {
      experience: 'beginner',
      equipment: ['none'],
      days: [1, 3, 5],
      time: '17:30',
      sessionMin: 40,
      pushupMax: 15,
      limitations: '',
    },
    care: {
      skinType: 'normal',
      currentRoutine: '',
      faceRelax: true,
      posture: true,
      flossDaily: true,
      grooming: ['shower', 'hair', 'lips', 'clothes'],
    },
    productivity: { goals: [], keepHabits: [], breakHabits: [] },
    trading: { level: 'none', markets: [], journalPerWeek: 3, backtestPerWeek: 1 },
    business: { weeklyHours: 5 },
    reminders: { pushupAlarm: true, study: true, workout: true, evening: true },
    notes: '',
  };
}

export function defaultSettings() {
  return {
    timeZone: 'auto',
    detectedTz: deviceTz(),
    dayStartHour: 3,
    weekStartsOn: 1,
    clock24: false,
    restDays: [],
    accent: 'blue',
    starfield: true,
    reduceMotion: false,
    sound: true,
    haptics: true,
    notifications: false,
    evidenceRetentionDays: 14,
    pinHash: '',
    rankedOverrides: {},
    customRules: false,
  };
}

export function defaultState(now) {
  return {
    schemaVersion: APP.schemaVersion,
    app: 'lockstep',
    createdAt: now,
    setupDay: null,
    onboarded: false,
    profile: defaultProfile(),
    settings: defaultSettings(),
    quests: [],
    completions: [],
    xpLog: [],
    days: {},
    weeks: {},
    xp: { total: 0, byCat: {}, byDay: {} },
    ranked: {
      placed: false,
      rating: 0,
      tier: 0,
      peakRating: 0,
      peakTier: 0,
      tierSince: null,
      lastPromotionDay: null,
      placement: { startDay: null, days: [], result: null },
      history: [],
      ratingLog: [],
      season: { number: 1, startDay: null, endDay: null, peakTier: 0, peakRating: 0 },
      seasons: [],
    },
    records: { bestStreak: 0, maxXpDay: 0, bestWeekScore: 0, pushupBest: 0 },
    achievements: {},
    alarms: [],
    alarmLog: {},
    challenges: [],
    evidence: [],
    references: [],
    fitness: { routines: [], customExercises: [], sessions: [], active: null, prs: {} },
    care: { routines: [], products: [], sensitivities: [], logs: [] },
    school: { subjects: [], items: [], sessions: [], timetable: [], weeklyGoalMin: 300 },
    trading: {
      entries: [],
      strategies: [],
      lessonsDone: {},
      checklist: [
        'My setup matches a written strategy rule',
        'Stop-loss is defined before entry',
        'Risk is within my max risk per trade',
        'I am not revenge trading or chasing',
        'I checked the news / calendar for this market',
      ],
      maxRiskPct: 1,
      accountSize: 1000,
    },
    business: { projects: [] },
    sleep: [],
    timer: null,
    meta: {
      lastSettledDay: null,
      lastSettledWeek: null,
      openDays: [],
      lastOpenTs: now,
      lastReportDay: null,
      lastBackupDay: null,
      seenRankEventTs: 0,
    },
  };
}

const MIGRATIONS = {
  // Example for the future:
  // 2: (s) => { s.newThing = []; return s; },
};

/** Upgrades any older save to the current schema, then repairs missing fields. */
export function migrate(raw, now) {
  if (!isObj(raw)) throw new Error('Save data is not an object');
  let s = raw;
  let v = Number(s.schemaVersion) || 1;
  if (v > APP.schemaVersion) throw new Error(`This backup is from a newer version (schema ${v}). Update the app first.`);
  while (v < APP.schemaVersion) {
    v++;
    if (MIGRATIONS[v]) s = MIGRATIONS[v](s);
  }
  s.schemaVersion = APP.schemaVersion;
  return normalize(s, now);
}

/** Fills in defaults and drops malformed records so the app never crashes on bad data. */
export function normalize(s, now) {
  const d = defaultState(now);
  fillDefaults(s, d);
  s.profile = fillDefaults(s.profile, d.profile);
  s.settings = fillDefaults(s.settings, d.settings);
  s.settings.detectedTz = deviceTz();
  const arr = (a, test) => (Array.isArray(a) ? a.filter((x) => isObj(x) && test(x)) : []);
  s.quests = arr(s.quests, (q) => typeof q.id === 'string' && typeof q.title === 'string');
  for (const q of s.quests) {
    q.days = Array.isArray(q.days) ? q.days.filter((n) => n >= 0 && n <= 6) : [];
    q.instructions = Array.isArray(q.instructions) ? q.instructions.map(String) : [];
    q.type ||= 'daily';
    q.difficulty ||= 'medium';
    q.verification ||= 'none';
    q.durationMin = Number(q.durationMin) || 10;
    q.target = Math.max(1, Number(q.target) || 1);
  }
  s.completions = arr(s.completions, (c) => typeof c.qid === 'string' && typeof c.day === 'string');
  s.xpLog = arr(s.xpLog, (x) => Number.isFinite(x.amount));
  s.alarms = arr(s.alarms, (a) => typeof a.id === 'string' && typeof a.time === 'string');
  s.challenges = arr(s.challenges, (c) => typeof c.id === 'string');
  s.evidence = arr(s.evidence, (e) => typeof e.id === 'string');
  s.references = arr(s.references, (r) => typeof r.id === 'string');
  s.sleep = arr(s.sleep, (x) => typeof x.day === 'string');
  if (!isObj(s.days)) s.days = {};
  if (!isObj(s.weeks)) s.weeks = {};
  if (!isObj(s.alarmLog)) s.alarmLog = {};
  if (!isObj(s.achievements)) s.achievements = {};
  const r = s.ranked;
  r.rating = Math.max(0, Number(r.rating) || 0);
  r.tier = Math.min(18, Math.max(0, Number(r.tier) || 0));
  if (!Array.isArray(r.history)) r.history = [];
  if (!Array.isArray(r.ratingLog)) r.ratingLog = [];
  if (!Array.isArray(r.seasons)) r.seasons = [];
  if (!Array.isArray(r.placement.days)) r.placement.days = [];
  // Recompute XP totals from the source records so totals can never drift.
  recomputeXp(s);
  if (!s.setupDay && s.onboarded) s.setupDay = dayKey(s.createdAt || now, s.settings);
  if (s.meta.openDays.length > 400) s.meta.openDays = s.meta.openDays.slice(-400);
  return s;
}

export function recomputeXp(s) {
  const xp = { total: 0, byCat: {}, byDay: {} };
  const add = (amt, cat, day) => {
    amt = Number(amt) || 0;
    xp.total += amt;
    xp.byCat[cat] = (xp.byCat[cat] || 0) + amt;
    xp.byDay[day] = (xp.byDay[day] || 0) + amt;
  };
  for (const c of s.completions) add(c.xp, c.cat, c.day);
  for (const e of s.xpLog) add(e.amount, e.cat, e.day);
  s.xp = xp;
}

/** Called when onboarding finishes: day 0 is a setup day, placement starts tomorrow. */
export function startAccount(s, now) {
  s.onboarded = true;
  s.createdAt = s.createdAt || now;
  s.setupDay = dayKey(now, s.settings);
  s.meta.lastSettledDay = addDays(s.setupDay, -1);
  s.ranked.placement.startDay = addDays(s.setupDay, 1);
  s.ranked.season = {
    number: 1,
    startDay: s.setupDay,
    endDay: null, // set by ranked engine
    peakTier: 0,
    peakRating: 0,
  };
}
