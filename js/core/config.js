// Central configuration. Every ranked/XP number lives here so the rules are
// transparent (shown on the Rank Ladder screen) and adjustable in Settings.

import { deepMerge } from './util.js';

export const APP = {
  name: 'Lockstep',
  tagline: 'Your life, ranked.',
  version: '1.0.0',
  schemaVersion: 1,
  storageKey: 'lockstep.state.v1',
};

export const CATEGORIES = [
  { id: 'school', name: 'School', short: 'School', icon: 'school', color: '#4d8dff' },
  { id: 'study', name: 'Studying', short: 'Study', icon: 'book', color: '#22c3ff' },
  { id: 'fitness', name: 'Fitness', short: 'Fitness', icon: 'dumbbell', color: '#ff5d6c' },
  { id: 'care', name: 'Face & Self-care', short: 'Care', icon: 'sparkle', color: '#ff7ad9' },
  { id: 'discipline', name: 'Discipline', short: 'Discipline', icon: 'shield', color: '#ffb020' },
  { id: 'productivity', name: 'Productivity', short: 'Productive', icon: 'bolt', color: '#9be15d' },
  { id: 'sleep', name: 'Sleep & Routines', short: 'Sleep', icon: 'moon', color: '#8f7dff' },
  { id: 'trading', name: 'Trading Education', short: 'Trading', icon: 'chart', color: '#2ee6b0' },
  { id: 'business', name: 'Business', short: 'Business', icon: 'briefcase', color: '#ff8a3d' },
  { id: 'growth', name: 'Personal Growth', short: 'Growth', icon: 'seed', color: '#c58cff' },
];
export const CAT = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
export const catOf = (id) => CAT[id] || CAT.growth;

export const DIFFICULTIES = [
  { id: 'easy', name: 'Easy', w: 1, color: '#9be15d' },
  { id: 'medium', name: 'Medium', w: 2, color: '#4d8dff' },
  { id: 'hard', name: 'Hard', w: 3, color: '#ff8a3d' },
  { id: 'epic', name: 'Epic', w: 4, color: '#e879f9' },
];
export const diffIndex = (id) => Math.max(0, DIFFICULTIES.findIndex((d) => d.id === id));
export const diffWeight = (id) => DIFFICULTIES[diffIndex(id)].w;

export const MAJORS = [
  { id: 'unranked', name: 'Unranked', c1: '#9aa0c8', c2: '#4b4f73', divisions: 0 },
  { id: 'bronze', name: 'Bronze', c1: '#f0a46c', c2: '#8a4b26', divisions: 3 },
  { id: 'silver', name: 'Silver', c1: '#e9eef8', c2: '#7b8499', divisions: 3 },
  { id: 'gold', name: 'Gold', c1: '#ffe07a', c2: '#c48a12', divisions: 3 },
  { id: 'platinum', name: 'Platinum', c1: '#7cf5e6', c2: '#178a9b', divisions: 3 },
  { id: 'diamond', name: 'Diamond', c1: '#8cc0ff', c2: '#2a4fd6', divisions: 3 },
  { id: 'elite', name: 'Elite', c1: '#ddd2ff', c2: '#6b4fd8', divisions: 0 },
  { id: 'champion', name: 'Champion', c1: '#ffb36b', c2: '#d1263b', divisions: 0 },
  { id: 'unreal', name: 'Unreal', c1: '#f5a8ff', c2: '#7c3aed', divisions: 0 },
];
export const MAJOR = Object.fromEntries(MAJORS.map((m) => [m.id, m]));

/** Default ranked rules. Users can override parts of this in Settings → Ranked rules. */
export const DEFAULT_RANKED = {
  // Minimum rating (SR) for each tier, in ladder order after UNRANKED:
  // Bronze I-III, Silver I-III, Gold I-III, Platinum I-III, Diamond I-III, Elite, Champion, Unreal.
  tierMins: [0, 80, 160, 250, 350, 450, 560, 680, 800, 930, 1070, 1210, 1360, 1520, 1680, 1850, 2150, 2500],

  // Every day is a ranked "match". Your match score is the difficulty-weighted share of
  // today's scheduled quests you completed. At the end of the day:
  //   score ≥ standard → gain up to `up` SR (scaled by how far above the standard you are)
  //   score < standard → lose up to `down` SR (scaled by how far below you are)
  // Gains are also scaled down if the day's quest load is below `minLoad`
  // (difficulty weight: Easy 1, Medium 2, Hard 3, Epic 4), so one trivial quest can't farm SR.
  majors: {
    bronze: { standard: 0.3, up: 30, down: 12, minLoad: 3 },
    silver: { standard: 0.45, up: 28, down: 15, minLoad: 4 },
    gold: { standard: 0.58, up: 26, down: 18, minLoad: 5 },
    platinum: { standard: 0.68, up: 24, down: 22, minLoad: 6 },
    diamond: { standard: 0.76, up: 22, down: 26, minLoad: 7 },
    elite: { standard: 0.83, up: 20, down: 30, minLoad: 8 },
    champion: { standard: 0.88, up: 16, down: 34, minLoad: 9 },
    unreal: { standard: 0.92, up: 14, down: 40, minLoad: 10 },
  },
  perfectDayBonus: 4,
  perfectDayMinQuests: 3,

  // Match credit for completions that skipped a required check.
  credit: { videoMissing: 0.5, timerMissing: 0.75, backfill: 0.75 },

  // XP per difficulty [easy, medium, hard, epic]
  xpBase: [10, 25, 45, 70],
  // Direct SR (outside the daily match) for one-time challenges and weekly targets.
  srBase: [1, 2, 3, 4],
  directSrCap: 12, // max direct SR per day (goals excluded)
  // Immediate SR for every completion that doesn't already earn one-time / weekly-target / goal SR,
  // by effective difficulty [easy, medium, hard, epic]. Capped per day so it can't be farmed.
  questSr: [1, 2, 3, 4],
  questSrDailyCap: 40,
  // A self-reported (unverified) quest can't be rated harder than its length allows:
  // under 5 min → max Easy, under 20 → Medium, under 45 → Hard, otherwise Epic.
  durationCaps: [5, 20, 45],

  verifiedBonusSr: 2,
  verifiedBonusXp: 0.25,
  streakXpPerDay: 0.01,
  streakXpMax: 0.25,
  xpSoftCapDaily: 700, // quest XP beyond this per day is reduced…
  xpSoftMult: 0.25, // …to this fraction
  onTimeAlarmXp: 15,
  onTimeAlarmSr: 2,
  lateAlarmXpMult: 0.75,
  inactivePenaltyMult: 0.5, // missed days where the app was never opened
  awayAfterInactiveDays: 2, // after N inactive days in a row, further days are "away" (no penalty, streak still breaks)

  demotionBuffer: 25,
  promotionProtectionDays: 3,
  lockedOverflow: 49, // how far past a locked promotion threshold SR can go

  placementDays: 7,
  placementMaxRating: 930, // best possible placement = Platinum I
  placementMinCompletions: 15,
  placementLowActivityCap: 250,

  goalSr: 12,
  goalXp: 250,
  goalMinAgeDays: 7,

  weekly: {
    strongMargin: 0.08,
    strongBonus: 10,
    weakMargin: 0.15,
    weakPenalty: 10,
    eliteMinDue: 14, // Elite+ must schedule at least this many quests in a week…
    lowActivityPenalty: 15, // …or lose this much SR
  },

  // Requirements checked when entering the FIRST division of a rank.
  requirements: {
    platinum: { activeDays14: 9 },
    diamond: { activeDays14: 10, categories7: 4 },
    elite: { activeDays14: 11, categories7: 4, verified14: 1, weeks: { n: 1, score: 0.75 } },
    champion: { activeDays14: 12, categories7: 5, verified14: 2, weeks: { n: 2, score: 0.8 }, streak: 14 },
    unreal: { activeDays14: 13, categories14: 6, verified14: 4, weeks: { n: 4, score: 0.9 }, streak: 21, daysAtChampion: 28 },
  },

  season: { weeks: 12, resetStrength: 0.1, resetPivot: 560 },

  streakThreshold: 0.5, // a day "counts" for your streak at ≥ 50% of due quests
  backfillDays: 2,
  excuseWindowDays: 3,
  excuseAllowance30: 4, // sick/emergency/rest days you can declare per 30 days
};

export function rankedConfig(state) {
  return deepMerge(DEFAULT_RANKED, (state && state.settings && state.settings.rankedOverrides) || {});
}

/** Builds the 19-entry tier list from a ranked config. */
export function buildTiers(cfg) {
  const out = [{ index: 0, id: 'unranked', major: 'unranked', div: 0, name: 'Unranked', min: null }];
  let i = 0;
  for (const m of MAJORS.slice(1)) {
    const divs = m.divisions || 1;
    for (let d = 1; d <= divs; d++) {
      const roman = ['I', 'II', 'III'][d - 1];
      out.push({
        index: out.length,
        id: m.divisions ? `${m.id}${d}` : m.id,
        major: m.id,
        div: m.divisions ? d : 0,
        name: m.divisions ? `${m.name} ${roman}` : m.name,
        min: cfg.tierMins[i++],
      });
    }
  }
  return out;
}

// ----- Lifetime XP levels (separate from ranked rating) -----
export function xpForLevel(level) {
  const n = Math.max(0, level - 1);
  return Math.round(60 * n ** 1.7 + 40 * n);
}

export function levelFromXp(xp) {
  let lv = 1;
  while (xpForLevel(lv + 1) <= xp && lv < 999) lv++;
  const cur = xpForLevel(lv);
  const next = xpForLevel(lv + 1);
  return { level: lv, cur, next, into: xp - cur, need: next - cur, pct: (xp - cur) / (next - cur) };
}

// Cosmetic unlocks earned with lifetime XP levels.
export const ACCENTS = [
  { id: 'blue', name: 'Hyper Blue', color: '#3d7bff', level: 1 },
  { id: 'violet', name: 'Violet', color: '#8b5cf6', level: 3 },
  { id: 'emerald', name: 'Emerald', color: '#10c98f', level: 5 },
  { id: 'amber', name: 'Amber', color: '#f59e0b', level: 8 },
  { id: 'rose', name: 'Rose', color: '#f43f73', level: 12 },
  { id: 'cyan', name: 'Cyan', color: '#06b6d4', level: 16 },
  { id: 'gold', name: 'Royal Gold', color: '#eab308', level: 20 },
  { id: 'crimson', name: 'Crimson', color: '#dc2626', level: 30 },
  { id: 'prism', name: 'Prism', color: '#d946ef', level: 40 },
];

export const TITLES = [
  { id: 'rookie', name: 'Rookie', level: 1 },
  { id: 'initiate', name: 'Initiate', level: 3 },
  { id: 'grinder', name: 'Grinder', level: 6 },
  { id: 'disciplined', name: 'Disciplined', level: 10 },
  { id: 'lockedin', name: 'Locked In', level: 15 },
  { id: 'relentless', name: 'Relentless', level: 20 },
  { id: 'machine', name: 'Machine', level: 30 },
  { id: 'unbreakable', name: 'Unbreakable', level: 40 },
  { id: 'legend', name: 'Legend', level: 50 },
];

// Activity XP for logging real work outside of quests (does NOT give rating).
export const ACTIVITY_XP = {
  workout: { amount: 30, dailyMax: 2 },
  study: { perMinutes: 5, dailyCapXp: 60 },
  journal: { amount: 15, dailyMax: 3 },
  bizTask: { amount: 10, dailyMax: 6 },
  schoolItem: { amount: 15, dailyMax: 5 },
  routine: { amount: 5, dailyMax: 6 },
  sleepLog: { amount: 5, dailyMax: 1 },
  review: { amount: 40, dailyMax: 1 },
  lesson: { amount: 10, dailyMax: 3 },
  goalProgress: { amount: 10, dailyMax: 3 },
  challenge: { amount: 30, dailyMax: 3 },
};
