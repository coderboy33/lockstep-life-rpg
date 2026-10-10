// Lifetime XP levels, cosmetics, personal records, achievements and category attributes.

import { levelFromXp, ACCENTS, TITLES, CATEGORIES, rankedConfig } from '../core/config.js';
import { dayKey, addDays, weekKey } from '../core/dates.js';
import { sum } from '../core/util.js';
import { streakAsOf, computeWeek } from './schedule.js';

export function levelInfo(state) {
  return levelFromXp(Math.max(0, state.xp.total || 0));
}

export function unlockedAccents(state) {
  const lv = levelInfo(state).level;
  return ACCENTS.map((a) => ({ ...a, unlocked: lv >= a.level }));
}

export function unlockedTitles(state) {
  const lv = levelInfo(state).level;
  return TITLES.map((t) => ({ ...t, unlocked: lv >= t.level }));
}

export function currentTitle(state) {
  const all = unlockedTitles(state);
  const chosen = all.find((t) => t.id === state.profile.titleId && t.unlocked);
  return chosen || [...all].reverse().find((t) => t.unlocked) || all[0];
}

/** Per-category "attributes": a level from category XP plus this week's completion rate. */
export function attributes(state, today) {
  const wk = weekKey(today, state.settings.weekStartsOn);
  const prevWk = addDays(wk, -7);
  const xpIn = (cat, from, to) =>
    sum(state.completions.filter((c) => c.cat === cat && c.day >= from && c.day <= to), (c) => c.xp) +
    sum(state.xpLog.filter((e) => e.cat === cat && e.day >= from && e.day <= to), (e) => e.amount);
  return CATEGORIES.map((c) => {
    const xp = state.xp.byCat[c.id] || 0;
    const lv = levelFromXp(xp * 3);
    return {
      ...c,
      xp,
      level: lv.level,
      pct: lv.pct,
      weekXp: xpIn(c.id, wk, addDays(wk, 6)),
      lastWeekXp: xpIn(c.id, prevWk, addDays(prevWk, 6)),
      count: state.completions.filter((x) => x.cat === c.id).length,
    };
  });
}

export function updateRecords(state, now) {
  const today = dayKey(now, state.settings);
  const rec = state.records;
  const streak = streakAsOf(state, today, today);
  if (streak > (rec.bestStreak || 0)) rec.bestStreak = streak;
  const xpDay = state.xp.byDay[today] || 0;
  if (xpDay > (rec.maxXpDay || 0)) rec.maxXpDay = xpDay;
  for (const ch of state.challenges) {
    if (ch.final && ch.pushupsDone > (rec.pushupBest || 0) && ch.status !== 'self') rec.pushupBest = ch.pushupsDone;
  }
}

const tierAt = (state, i) => (state.ranked.peakTier || 0) >= i;

export const ACHIEVEMENTS = [
  { id: 'first', name: 'First Step', desc: 'Complete your first quest.', icon: 'check', test: (s) => s.completions.length >= 1 },
  { id: 'placed', name: 'Placed', desc: 'Finish your placement period.', icon: 'shield', test: (s) => s.ranked.placed },
  {
    id: 'perfect',
    name: 'Perfect Day',
    desc: 'Finish 100% of a day with 5+ quests due.',
    icon: 'star',
    test: (s) => Object.values(s.days).some((d) => d.settled && d.status === 'normal' && d.rate >= 0.999 && (d.due || []).length >= 5),
  },
  { id: 'streak7', name: 'Iron Week', desc: 'Reach a 7-day streak.', icon: 'flame', test: (s) => s.records.bestStreak >= 7 },
  { id: 'streak30', name: 'Unbroken', desc: 'Reach a 30-day streak.', icon: 'flame', test: (s) => s.records.bestStreak >= 30 },
  { id: 'q100', name: 'Century', desc: 'Complete 100 quests.', icon: 'target', test: (s) => s.completions.length >= 100 },
  {
    id: 'riser',
    name: 'Early Riser',
    desc: 'Complete 5 alarm challenges on time.',
    icon: 'alarm',
    test: (s) => s.challenges.filter((c) => c.final && c.onTime).length >= 5,
  },
  { id: 'verified1', name: 'Proof', desc: 'Complete your first verified challenge.', icon: 'video', test: (s) => s.completions.some((c) => c.verified) },
  { id: 'verified10', name: 'Proof of Work', desc: 'Complete 10 verified challenges.', icon: 'video', test: (s) => s.completions.filter((c) => c.verified).length >= 10 },
  { id: 'scholar', name: 'Scholar', desc: 'Log 20 hours of focused study.', icon: 'book', test: (s) => sum(s.school.sessions, (x) => x.minutes) >= 1200 },
  {
    id: 'deadline',
    name: 'Ahead of Schedule',
    desc: 'Finish 10 school tasks on or before their due date.',
    icon: 'calendar',
    test: (s) => s.school.items.filter((i) => i.status === 'done' && i.doneDay && (!i.due || i.doneDay <= i.due)).length >= 10,
  },
  { id: 'iron', name: 'Iron Body', desc: 'Log 25 workouts.', icon: 'dumbbell', test: (s) => s.fitness.sessions.length >= 25 },
  { id: 'glow', name: 'Consistent Care', desc: 'Complete 30 self-care routines.', icon: 'sparkle', test: (s) => s.care.logs.filter((l) => l.complete).length >= 30 },
  {
    id: 'process',
    name: 'Process Over Profit',
    desc: 'Log 20 journal entries where you followed your plan.',
    icon: 'chart',
    test: (s) => s.trading.entries.filter((e) => e.followedPlan).length >= 20,
  },
  {
    id: 'builder',
    name: 'Builder',
    desc: 'Ship 25 business tasks.',
    icon: 'briefcase',
    test: (s) => sum(s.business.projects, (p) => (p.tasks || []).filter((t) => t.status === 'done').length) >= 25,
  },
  { id: 'reflect', name: 'Reflective', desc: 'Complete 4 weekly reviews.', icon: 'clipboard', test: (s) => Object.values(s.weeks).filter((w) => w.reviewed).length >= 4 },
  {
    id: 'comeback',
    name: 'Comeback',
    desc: 'Earn a promotion after being demoted.',
    icon: 'trend',
    test: (s) => {
      const h = s.ranked.history;
      const di = h.findIndex((e) => e.type === 'demotion');
      return di >= 0 && h.slice(di + 1).some((e) => e.type === 'promotion');
    },
  },
  { id: 'gold', name: 'Gold Standard', desc: 'Reach Gold.', icon: 'trophy', test: (s) => tierAt(s, 7) },
  { id: 'diamond', name: 'Diamond Mind', desc: 'Reach Diamond.', icon: 'trophy', test: (s) => tierAt(s, 13) },
  { id: 'champion', name: 'Champion', desc: 'Reach Champion.', icon: 'crown', test: (s) => tierAt(s, 17) },
  { id: 'unreal', name: 'Unreal', desc: 'Reach Unreal — the top of the ladder.', icon: 'crown', test: (s) => tierAt(s, 18) },
];

export function checkAchievements(state, now) {
  const today = dayKey(now, state.settings);
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (state.achievements[a.id]) continue;
    let ok = false;
    try {
      ok = !!a.test(state);
    } catch {
      ok = false;
    }
    if (ok) {
      state.achievements[a.id] = { ts: now, day: today };
      fresh.push(a);
    }
  }
  return fresh;
}

export function weekScoreLive(state, wk, today) {
  return computeWeek(state, wk, today);
}

export function streakTarget(state) {
  return rankedConfig(state).streakThreshold;
}
