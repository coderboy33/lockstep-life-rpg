// Which quests are due on which days, per-day results, streaks and rolling-window stats.
// Pure functions: (state, ...) → data. No DOM, no storage.

import { weekday, weekKey, addDays, diffDays, weekDays } from '../core/dates.js';
import { DIFFICULTIES, diffIndex, rankedConfig } from '../core/config.js';

// ---------- quest scheduling ----------

export function isActiveOn(q, day) {
  if (q.createdDay && day < q.createdDay) return false;
  if (q.archived && (!q.archivedDay || day >= q.archivedDay)) return false;
  if (q.paused && (!q.pausedDay || day >= q.pausedDay)) return false;
  return true;
}

export function isScheduledOn(q, day) {
  if (q.type !== 'daily') return false;
  return !q.days || !q.days.length || q.days.includes(weekday(day));
}

/** Due for ranked purposes: quests only count from the day AFTER they're created. */
export function isDueOn(q, day) {
  return q.type === 'daily' && isActiveOn(q, day) && !!q.createdDay && q.createdDay < day && isScheduledOn(q, day);
}

export function periodKey(q, day, settings) {
  if (q.type === 'daily') return day;
  if (q.type === 'weekly') return 'w' + weekKey(day, settings?.weekStartsOn ?? 1);
  return 'once';
}

/** A self-reported quest can't be rated harder than its length allows (anti-exploit). */
export function effDiffIndex(q, cfg) {
  const di = diffIndex(q.difficulty);
  if (q.verification !== 'none' || (q.linked && q.linked.kind === 'alarm')) return di;
  const caps = cfg.durationCaps;
  const d = Number(q.durationMin) || 0;
  const cap = d < caps[0] ? 0 : d < caps[1] ? 1 : d < caps[2] ? 2 : 3;
  return Math.min(di, cap);
}

export const effWeight = (q, cfg) => DIFFICULTIES[effDiffIndex(q, cfg)].w;

export function dueQuestsOn(state, day) {
  return state.quests.filter((q) => isDueOn(q, day));
}

/** Rest / excused / normal, as declared by the user or by weekly rest-day settings. */
export function dayMode(state, day) {
  const rec = state.days[day];
  if (rec && (rec.mode === 'excused' || rec.mode === 'rest')) return rec.mode;
  if ((state.settings.restDays || []).includes(weekday(day))) return 'rest';
  return 'normal';
}

// ---------- completions ----------

export function completionsOn(state, day) {
  return state.completions.filter((c) => c.day === day);
}

export function findCompletion(state, qid, period) {
  return state.completions.find((c) => c.qid === qid && c.period === period);
}

export function weeklyProgress(state, q, day) {
  const period = periodKey(q, day, state.settings);
  const steps = state.completions.filter((c) => c.qid === q.id && c.period === period);
  return { period, steps, count: steps.length, done: steps.length >= (q.target || 1) };
}

// ---------- day results ----------

/**
 * Live calculation of a day's quest results (used for today, and by settlement).
 * Returns { due:[{qid,w,cat,title}], dueW, doneW, rate, doneCount, anyCount }
 */
export function computeDay(state, day) {
  const cfg = rankedConfig(state);
  const due = dueQuestsOn(state, day).map((q) => ({ qid: q.id, w: effWeight(q, cfg), cat: q.category, title: q.title, time: q.time || null }));
  const comps = completionsOn(state, day);
  const credit = new Map();
  for (const c of comps) if (c.type === 'daily') credit.set(c.qid, c.credit ?? 1);
  const dueW = due.reduce((s, x) => s + x.w, 0);
  const doneW = due.reduce((s, x) => s + x.w * (credit.get(x.qid) || 0), 0);
  return {
    due,
    dueW,
    doneW,
    doneCount: due.filter((x) => credit.has(x.qid)).length,
    anyCount: comps.length,
    rate: dueW ? doneW / dueW : null,
  };
}

/** Match credit (0–1) a completion earns toward the daily ranked match. */
export function completionCredit(q, ctx, cfg) {
  let c = 1;
  if (q.verification === 'video' && !ctx.verified) c = Math.min(c, cfg.credit.videoMissing);
  if (q.verification === 'timer' && !ctx.timed && !ctx.verified) c = Math.min(c, cfg.credit.timerMissing);
  if (ctx.backfill) c *= cfg.credit.backfill;
  return Math.round(c * 100) / 100;
}

/**
 * How a day counts for streaks/requirements.
 * kind: 'skip' (neutral), 'secured', 'missed', 'pending' (today, not yet secured).
 */
export function dayResult(state, day, today) {
  const cfg = rankedConfig(state);
  if (!state.setupDay || day < state.setupDay) return { kind: 'none' };
  const rec = state.days[day];
  if (rec && rec.settled) {
    if (['setup', 'rest', 'excused', 'empty'].includes(rec.status)) return { kind: 'skip', status: rec.status, any: rec.anyCount };
    if (rec.status === 'away') return { kind: 'missed', status: 'away' };
    return { kind: rec.rate >= cfg.streakThreshold ? 'secured' : 'missed', rate: rec.rate, status: rec.status };
  }
  if (day > today) return { kind: 'future' };
  if (day === state.setupDay) return { kind: 'skip', status: 'setup' };
  const mode = dayMode(state, day);
  if (mode !== 'normal') return { kind: 'skip', status: mode };
  const live = computeDay(state, day);
  if (live.rate === null) return { kind: 'skip', status: 'empty', any: live.anyCount };
  if (live.rate >= cfg.streakThreshold) return { kind: 'secured', rate: live.rate, live: true };
  return { kind: day === today ? 'pending' : 'missed', rate: live.rate, live: true };
}

/** Consecutive secured days ending at `endDay` (rest/excused days are frozen, not broken). */
export function streakAsOf(state, endDay, today = endDay) {
  if (!state.setupDay) return 0;
  let n = 0;
  for (let k = endDay, i = 0; k >= state.setupDay && i < 3000; k = addDays(k, -1), i++) {
    const r = dayResult(state, k, today);
    if (r.kind === 'secured') n++;
    else if (r.kind === 'skip' || r.kind === 'pending' || r.kind === 'future') continue;
    else break;
  }
  return n;
}

export function categoryStreak(state, cat, today) {
  if (!state.setupDay) return 0;
  let n = 0;
  for (let k = today, i = 0; k >= state.setupDay && i < 1000; k = addDays(k, -1), i++) {
    const rec = state.days[k];
    const mode = rec?.settled ? rec.status : dayMode(state, k);
    const hasDone = state.completions.some((c) => c.day === k && c.cat === cat);
    if (hasDone) {
      n++;
      continue;
    }
    if (mode === 'rest' || mode === 'excused' || mode === 'setup') continue;
    const due = rec?.settled ? (rec.due || []).some((d) => d.cat === cat) : dueQuestsOn(state, k).some((q) => q.category === cat);
    if (!due || k === today) continue;
    break;
  }
  return n;
}

/** Days in the window that were secured, rest/excused, or empty-with-activity. */
export function activeDaysInLast(state, n, endDay, today = endDay) {
  let count = 0;
  for (let i = 0; i < n; i++) {
    const k = addDays(endDay, -i);
    const r = dayResult(state, k, today);
    if (r.kind === 'secured') count++;
    else if (r.kind === 'skip' && (r.status === 'rest' || r.status === 'excused' || (r.status === 'empty' && r.any > 0))) count++;
  }
  return count;
}

export function categoriesInLast(state, n, endDay) {
  const start = addDays(endDay, -(n - 1));
  return new Set(state.completions.filter((c) => c.day >= start && c.day <= endDay).map((c) => c.cat)).size;
}

export function verifiedInLast(state, n, endDay) {
  const start = addDays(endDay, -(n - 1));
  return state.completions.filter((c) => c.verified && c.day >= start && c.day <= endDay).length;
}

/** Weighted completion of a week: daily quests (excluding rest/excused days) + weekly targets. */
export function computeWeek(state, wk, today) {
  const cfg = rankedConfig(state);
  let dueW = 0;
  let doneW = 0;
  let dueCount = 0;
  let doneCount = 0;
  let normalDays = 0;
  for (const k of weekDays(wk)) {
    if (!state.setupDay || k <= state.setupDay || k > today) continue;
    const rec = state.days[k];
    let res;
    if (rec && rec.settled) {
      if (rec.status !== 'normal') continue;
      res = rec;
    } else {
      if (dayMode(state, k) !== 'normal') continue;
      res = computeDay(state, k);
    }
    normalDays++;
    dueW += res.dueW || 0;
    doneW += res.doneW || 0;
    dueCount += (res.due || []).length;
    doneCount += res.doneCount || 0;
  }
  const weekly = state.quests.filter((q) => q.type === 'weekly' && q.createdDay && q.createdDay < wk && isActiveOn(q, addDays(wk, 6)));
  for (const q of weekly) {
    const w = effWeight(q, cfg) * 2;
    const steps = state.completions.filter((c) => c.qid === q.id && c.period === 'w' + wk).length;
    dueW += w;
    dueCount++;
    doneW += w * Math.min(1, steps / (q.target || 1));
    if (steps >= (q.target || 1)) doneCount++;
  }
  return { dueW, doneW, dueCount, doneCount, normalDays, score: dueW ? doneW / dueW : null };
}

export function daysSince(a, b) {
  return a && b ? diffDays(a, b) : 0;
}
