// Quest creation, scheduling views, completion rewards (XP + SR), undo, linked auto-completion,
// long-term goals and activity XP. All anti-exploit rules for rewards live here.

import { rankedConfig, DIFFICULTIES, diffIndex, CAT, ACTIVITY_XP } from '../core/config.js';
import { dayKey, addDays, diffDays, isKey, isValidHm, hmToMin } from '../core/dates.js';
import { uid, clamp, sum, cleanText, toInt, toNum } from '../core/util.js';
import {
  isActiveOn,
  isScheduledOn,
  isDueOn,
  periodKey,
  effDiffIndex,
  findCompletion,
  weeklyProgress,
  streakAsOf,
  dayMode,
  computeDay,
  completionCredit,
  effWeight,
} from './schedule.js';
import { applyRating, evaluateRank, resettleDay, tiersOf, matchImpact } from './ranked.js';
import { updateRecords, checkAchievements } from './progress.js';

export const QUEST_TYPES = [
  { id: 'daily', name: 'Daily / recurring' },
  { id: 'weekly', name: 'Weekly target' },
  { id: 'once', name: 'One-time challenge' },
  { id: 'goal', name: 'Long-term goal' },
];

export const VERIFICATIONS = [
  { id: 'none', name: 'Self-report', desc: 'Tick it off yourself.' },
  { id: 'timer', name: 'Timer', desc: 'Full SR only when completed with the built-in timer or tracker.' },
  { id: 'video', name: 'Video evidence', desc: 'Needs a recorded/uploaded video or assisted rep count for SR.' },
];

export const LINK_KINDS = [
  { id: '', name: 'Nothing (manual)' },
  { id: 'focus', name: 'Focus timer session' },
  { id: 'workout', name: 'Workout session' },
  { id: 'care', name: 'Self-care routine' },
  { id: 'journal', name: 'Trading journal entry' },
  { id: 'project', name: 'Business task completed' },
  { id: 'sleep', name: 'Sleep log' },
  { id: 'review', name: 'Weekly review' },
];

const fail = (reason) => ({ ok: false, reason });

// ---------- creation & editing ----------

export function sanitizeQuest(data, existing = {}) {
  const errors = [];
  const title = cleanText(data.title ?? existing.title, 80);
  if (!title) errors.push('Give the quest a title.');
  const category = CAT[data.category] ? data.category : existing.category || 'growth';
  const type = ['daily', 'weekly', 'once', 'goal'].includes(data.type) ? data.type : existing.type || 'daily';
  const days = Array.isArray(data.days) ? [...new Set(data.days.map(Number).filter((d) => d >= 0 && d <= 6))].sort() : existing.days || [];
  const time = data.time && isValidHm(data.time) ? data.time : null;
  const durationMin = toInt(data.durationMin, existing.durationMin || 15, 1, 600);
  const difficulty = DIFFICULTIES.some((d) => d.id === data.difficulty) ? data.difficulty : existing.difficulty || 'medium';
  const verification = ['none', 'timer', 'video'].includes(data.verification) ? data.verification : existing.verification || 'none';
  const instructions = (Array.isArray(data.instructions) ? data.instructions : String(data.instructions || '').split('\n'))
    .map((s) => cleanText(s.replace(/^\s*(\d+[.)]|[-•*])\s*/, ''), 200))
    .filter(Boolean)
    .slice(0, 15);
  let linked = null;
  if (data.linked && data.linked.kind) {
    linked = { kind: String(data.linked.kind) };
    if (data.linked.id) linked.id = String(data.linked.id);
    if (data.linked.mode) linked.mode = String(data.linked.mode);
    if (data.linked.minutes) linked.minutes = toInt(data.linked.minutes, 25, 1, 600);
  }
  const q = {
    title,
    category,
    type,
    days: type === 'daily' ? days : [],
    time,
    durationMin,
    difficulty,
    verification,
    description: cleanText(data.description ?? existing.description, 600),
    instructions,
    target: type === 'weekly' ? toInt(data.target, existing.target || 3, 1, 7) : 1,
    dueDate: (type === 'once' || type === 'goal') && isKey(data.dueDate) ? data.dueDate : null,
    linked,
    xpOverride: data.xpOverride ? toInt(data.xpOverride, 0, 1, 300) : null,
  };
  if (type === 'daily' && days.length === 0) q.days = [0, 1, 2, 3, 4, 5, 6];
  if (type === 'goal') {
    const g = data.goal || existing.goal || {};
    q.goal = {
      target: toNum(g.target, 1, 0.0001, 1e12),
      unit: cleanText(g.unit, 24),
      current: toNum(g.current, 0, 0, 1e12),
      start: toNum(g.start ?? g.current, 0, 0, 1e12),
      history: Array.isArray(g.history) ? g.history.slice(-200) : [],
    };
    if (!(q.goal.target > 0)) errors.push('Goal target must be greater than zero.');
  }
  return { ok: errors.length === 0, errors, quest: q };
}

export function createQuest(state, data, now, source = 'custom') {
  const res = sanitizeQuest(data);
  if (!res.ok) return { ok: false, reason: res.errors.join(' ') };
  const q = {
    id: uid('q'),
    ...res.quest,
    source,
    createdAt: now,
    createdDay: data.createdDay && isKey(data.createdDay) ? data.createdDay : dayKey(now, state.settings),
    paused: false,
    pausedDay: null,
    archived: false,
    archivedDay: null,
  };
  state.quests.push(q);
  const dup = state.quests.filter((x) => !x.archived && x.title.toLowerCase() === q.title.toLowerCase()).length > 1;
  return { ok: true, quest: q, warning: dup ? 'You already have a quest with this name — duplicates share the daily SR caps.' : null };
}

export function updateQuest(state, id, data) {
  const q = state.quests.find((x) => x.id === id);
  if (!q) return fail('Quest not found.');
  const res = sanitizeQuest({ ...q, ...data }, q);
  if (!res.ok) return { ok: false, reason: res.errors.join(' ') };
  // Rewards already earned are stored on each completion, so edits never change past rewards.
  Object.assign(q, res.quest);
  return { ok: true, quest: q };
}

export function setPaused(state, id, paused, now) {
  const q = state.quests.find((x) => x.id === id);
  if (!q) return fail('Quest not found.');
  q.paused = !!paused;
  q.pausedDay = paused ? dayKey(now, state.settings) : null;
  return { ok: true };
}

/** Deletes a quest. If it has history it's archived (history stays intact). */
export function deleteQuest(state, id, now) {
  const q = state.quests.find((x) => x.id === id);
  if (!q) return fail('Quest not found.');
  const hasHistory = state.completions.some((c) => c.qid === id);
  if (hasHistory) {
    q.archived = true;
    q.archivedDay = addDays(dayKey(now, state.settings), 1);
    const today = dayKey(now, state.settings);
    if (!state.completions.some((c) => c.qid === id && c.day === today)) q.archivedDay = today;
  } else {
    state.quests = state.quests.filter((x) => x.id !== id);
  }
  for (const a of state.alarms) if (a.questId === id) a.questId = null;
  return { ok: true };
}

// ---------- views ----------

export function questState(state, q, day) {
  if (q.type === 'weekly') {
    const wp = weeklyProgress(state, q, day);
    return { done: wp.done, progress: wp.count, target: q.target, todayDone: wp.steps.some((c) => c.day === day), completion: wp.steps.find((c) => c.day === day) || null };
  }
  const c = findCompletion(state, q.id, periodKey(q, day, state.settings));
  return { done: !!c, completion: c || null };
}

export function todayView(state, now) {
  const today = dayKey(now, state.settings);
  const live = state.quests.filter((q) => isActiveOn(q, today));
  const byTime = (a, b) => (hmToMin(a.q.time) ?? 2000) - (hmToMin(b.q.time) ?? 2000) || a.q.createdAt - b.q.createdAt;
  const normalDay = dayMode(state, today) === 'normal';
  const daily = live
    .filter((q) => q.type === 'daily' && isScheduledOn(q, today))
    .map((q) => ({ q, ...questState(state, q, today), due: normalDay && isDueOn(q, today), isNew: q.createdDay >= today }))
    .sort(byTime);
  const weekly = live.filter((q) => q.type === 'weekly').map((q) => ({ q, ...questState(state, q, today) }));
  const once = live
    .filter((q) => q.type === 'once')
    .map((q) => ({ q, ...questState(state, q, today) }))
    .filter((x) => !x.done || (x.completion && x.completion.day === today));
  const goals = state.quests.filter((q) => q.type === 'goal' && !q.archived).map((q) => ({ q, ...questState(state, q, today) }));
  const stats = computeDay(state, today);
  return { today, mode: dayMode(state, today), daily, weekly, once, goals, stats };
}

// ---------- rewards ----------

/**
 * Works out the rewards for completing `q`. Does not change state.
 * - xp: lifetime XP (never lost except by undoing today's completion)
 * - credit: share of the quest's weight that counts toward today's ranked match
 * - match: projected SR this adds to today's match (settled at end of day)
 * - sr: direct SR (one-time challenges, weekly targets, goals, verified/on-time bonuses)
 */
export function computeAward(state, q, ctx) {
  const cfg = rankedConfig(state);
  const r = state.ranked;
  const lines = [];
  const eff = effDiffIndex(q, cfg);
  if (eff < diffIndex(q.difficulty)) lines.push(`Counted as ${DIFFICULTIES[eff].name} (${q.durationMin} min, self-reported)`);
  let xp = q.xpOverride ? clamp(q.xpOverride, 1, 300) : cfg.xpBase[eff];
  let direct = 0;
  if (q.type === 'weekly') {
    if (ctx.final) {
      xp = Math.round(xp * 1.5);
      direct = cfg.srBase[eff] * 2;
      lines.push('Weekly target reached');
    } else {
      xp = Math.round(xp * 0.5);
      lines.push(`Weekly progress ${ctx.step}/${q.target} — SR comes when the target is reached`);
    }
  } else if (q.type === 'once') direct = cfg.srBase[eff];
  else if (q.type === 'goal') {
    xp = cfg.goalXp;
    direct = cfg.goalSr;
  }

  // ----- XP -----
  const streak = streakAsOf(state, ctx.today, ctx.today);
  let mult = 1;
  const sb = Math.min(cfg.streakXpMax, streak * cfg.streakXpPerDay);
  if (sb > 0) {
    mult += sb;
    lines.push(`Streak bonus +${Math.round(sb * 100)}% XP`);
  }
  if (ctx.verified) {
    mult += cfg.verifiedBonusXp;
    lines.push(`Verified +${Math.round(cfg.verifiedBonusXp * 100)}% XP`);
  }
  const missingVideo = q.verification === 'video' && !ctx.verified;
  const missingTimer = q.verification === 'timer' && !ctx.timed && !ctx.verified;
  if (missingVideo) {
    mult *= 0.5;
    lines.push(`Video evidence required but not accepted: 50% XP, ${Math.round(cfg.credit.videoMissing * 100)}% match credit`);
  }
  if (missingTimer) lines.push(`Timer not used: ${Math.round(cfg.credit.timerMissing * 100)}% match credit`);
  if (ctx.late) {
    mult *= cfg.lateAlarmXpMult;
    lines.push('Completed after the grace period');
  }
  xp = Math.round(xp * mult);
  if (ctx.onTime) {
    xp += cfg.onTimeAlarmXp;
    lines.push('On-time alarm bonus');
  }
  const questXpToday = sum(state.completions.filter((c) => c.day === ctx.day), (c) => c.xp);
  if (questXpToday >= cfg.xpSoftCapDaily) {
    xp = Math.max(1, Math.round(xp * cfg.xpSoftMult));
    lines.push('Daily XP soft cap reached');
  }

  // ----- Ranked -----
  const credit = completionCredit(q, ctx, cfg);
  if (ctx.backfill) lines.push(`Logged for a past day: ${Math.round(cfg.credit.backfill * 100)}% match credit`);
  let match = 0;
  let sr = 0;
  let srNote = null;
  const ageDays = q.createdDay ? diffDays(q.createdDay, ctx.day) : 0;
  if (!r.placed) srNote = 'Placement in progress — SR you earn now is added to your placement result.';
  else {
    if (q.type === 'daily') {
      if (isDueOn(q, ctx.day)) {
        if (!ctx.backfill) match = matchImpact(state, ctx.day, effWeight(q, cfg) * credit);
      } else if (ageDays < 1) srNote = 'New quests join your ranked match tomorrow.';
      else srNote = 'Off-schedule — not part of today’s ranked match.';
    } else if (q.type === 'goal' && ageDays < cfg.goalMinAgeDays) {
      direct = 0;
      srNote = `Goals need to be ${cfg.goalMinAgeDays}+ days old to earn SR.`;
    } else if (q.type !== 'goal' && ageDays < 1) {
      direct = 0;
      srNote = 'One-time / weekly bonus SR starts tomorrow for new quests.';
    }
    if (missingVideo) direct = 0;
    if (ctx.verified && !missingVideo) direct += cfg.verifiedBonusSr;
    if (ctx.onTime) direct += cfg.onTimeAlarmSr;
    if (q.type !== 'goal' && direct > 0) {
      const used = sum(state.completions.filter((c) => c.day === ctx.day && c.type !== 'goal'), (c) => c.sr);
      const room = Math.max(0, cfg.directSrCap - used);
      if (direct > room) {
        direct = room;
        srNote = `Daily bonus-SR cap (${cfg.directSrCap}) reached.`;
      }
    }
    sr = Math.max(0, Math.round(direct));
  }
  // Every completion that doesn't already earn one-time / weekly-target / goal SR gets quest SR now.
  const hasTypeSr = r.placed && !missingVideo && (q.type === 'goal' ? ageDays >= cfg.goalMinAgeDays : (q.type === 'once' || (q.type === 'weekly' && ctx.final)) && ageDays >= 1);
  let questSr = 0;
  if (!hasTypeSr) {
    const used = sum(state.completions.filter((c) => c.day === ctx.day), (c) => c.questSr || 0);
    questSr = Math.min(Math.max(0, cfg.questSrDailyCap - used), Math.max(1, Math.round(cfg.questSr[eff] * credit)));
    if (questSr > 0) sr += questSr;
    else lines.push(`Daily quest-SR cap (${cfg.questSrDailyCap}) reached`);
  }
  return { xp, sr, questSr, match, credit, eff, lines, srNote };
}

function addXp(state, amount, cat, day) {
  const xp = state.xp;
  xp.total = (xp.total || 0) + amount;
  xp.byCat[cat] = (xp.byCat[cat] || 0) + amount;
  xp.byDay[day] = (xp.byDay[day] || 0) + amount;
}

/** Checks whether a quest can be completed for `day`, and returns the context needed to reward it. */
export function canComplete(state, q, day, today) {
  const cfg = rankedConfig(state);
  if (!q) return fail('Quest not found.');
  if (q.archived) return fail('This quest was deleted.');
  if (q.paused) return fail('This quest is paused. Resume it first.');
  if (day > today) return fail('You can’t complete a quest for a future day.');
  if (q.createdDay && day < q.createdDay) return fail('This quest didn’t exist on that day.');
  const backfill = day < today;
  if (backfill) {
    if (q.type !== 'daily') return fail('Only daily quests can be logged for past days.');
    if (diffDays(day, today) > cfg.backfillDays) return fail(`You can only log up to ${cfg.backfillDays} days back.`);
    if (!isScheduledOn(q, day)) return fail('It wasn’t scheduled that day.');
  }
  if (q.type === 'goal') return fail('Update the goal’s progress instead.');
  if (q.type === 'weekly') {
    const wp = weeklyProgress(state, q, day);
    if (wp.done) return fail('Weekly target already reached. It resets next week.');
    if (wp.steps.some((c) => c.day === day)) return fail('Already logged today — weekly quests count once per day.');
    return { ok: true, backfill, step: wp.count + 1, final: wp.count + 1 >= q.target, period: wp.period };
  }
  const period = periodKey(q, day, state.settings);
  if (findCompletion(state, q.id, period)) return fail(q.type === 'once' ? 'Already completed.' : 'Already completed for this day. It resets tomorrow.');
  return { ok: true, backfill, period };
}

export function previewAward(state, q, now, opts = {}) {
  const today = dayKey(now, state.settings);
  const day = opts.day || today;
  const chk = canComplete(state, q, day, today);
  const ctx = { day, today, verified: !!opts.verified, timed: !!opts.timed, backfill: day < today, step: chk.step, final: chk.final ?? true, onTime: !!opts.onTime, late: !!opts.late };
  if (q.type === 'goal') ctx.final = true;
  return { ...computeAward(state, q, ctx), allowed: chk.ok, reason: chk.reason };
}

/**
 * Completes a quest. opts: { now, day, verified, timed, method, evidence, challengeId, onTime, late, note }
 * Returns { ok, completion, events, achievements } or { ok:false, reason }.
 */
export function completeQuest(state, qid, opts = {}) {
  const now = opts.now ?? Date.now();
  const today = dayKey(now, state.settings);
  const day = opts.day || today;
  const q = state.quests.find((x) => x.id === qid);
  let chk;
  if (q && q.type === 'goal' && opts._goal) {
    chk = findCompletion(state, q.id, 'once') ? fail('Goal already completed.') : { ok: true, period: 'once', final: true };
  } else chk = canComplete(state, q, day, today);
  if (!chk.ok) return chk;
  const ctx = { day, today, verified: !!opts.verified, timed: !!opts.timed, backfill: chk.backfill, step: chk.step, final: chk.final ?? true, onTime: !!opts.onTime, late: !!opts.late };
  const award = computeAward(state, q, ctx);
  const c = {
    id: uid('c'),
    qid: q.id,
    title: q.title,
    cat: q.category,
    diff: q.difficulty,
    eff: award.eff,
    type: q.type,
    day,
    period: chk.period,
    ts: now,
    xp: award.xp,
    sr: 0,
    credit: award.credit,
    match: award.match,
    verified: !!opts.verified,
    timed: !!opts.timed,
    method: opts.method || 'manual',
    evidence: Array.isArray(opts.evidence) ? opts.evidence : [],
    challengeId: opts.challengeId || null,
    backfill: !!chk.backfill,
    note: cleanText(opts.note, 300),
    lines: award.lines,
    srNote: award.srNote,
    questSr: award.questSr || 0,
  };
  if (q.type === 'weekly') {
    c.step = chk.step;
    c.final = chk.final;
  }
  state.completions.push(c);
  addXp(state, c.xp, c.cat, c.day);
  c.sr = applyRating(state, award.sr, today, today);
  if (award.sr > c.sr) c.lines.push('SR capped: a promotion requirement is still locked.');
  const events = evaluateRank(state, today, now, today);
  if (c.backfill && state.days[day] && state.days[day].settled) events.push(...resettleDay(state, day, now));
  updateRecords(state, now);
  const achievements = checkAchievements(state, now);
  return { ok: true, completion: c, events, achievements };
}

/** Undo a completion made today (rewards are removed exactly). */
export function undoCompletion(state, cid, now) {
  const today = dayKey(now, state.settings);
  const c = state.completions.find((x) => x.id === cid);
  if (!c) return fail('Completion not found.');
  if (dayKey(c.ts, state.settings) !== today) return fail('Only completions made today can be undone.');
  if (c.type === 'weekly') {
    const later = state.completions.some((x) => x.qid === c.qid && x.period === c.period && x.ts > c.ts);
    if (later) return fail('Undo the latest weekly progress first.');
  }
  state.completions = state.completions.filter((x) => x.id !== cid);
  addXp(state, -c.xp, c.cat, c.day);
  const r = state.ranked;
  if (c.sr) r.rating = Math.max(0, r.rating - c.sr);
  // If that SR caused a promotion today, roll it back.
  const tiers = tiersOf(state);
  while (r.placed && r.history.length) {
    const last = r.history[r.history.length - 1];
    if (last.type !== 'promotion' || last.day !== today || r.rating >= tiers[r.tier].min) break;
    r.history.pop();
    r.tier = last.from;
    const prev = [...r.history].reverse().find((e) => e.type === 'promotion');
    r.lastPromotionDay = prev ? prev.day : null;
    if (r.reachedMajor) {
      const maj = tiers[r.tier].major;
      const order = ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'elite', 'champion', 'unreal'];
      for (const m of order.slice(order.indexOf(maj) + 1)) delete r.reachedMajor[m];
    }
  }
  if (c.backfill && state.days[c.day] && state.days[c.day].settled) resettleDay(state, c.day, now);
  if (c.challengeId) {
    const ch = state.challenges.find((x) => x.id === c.challengeId);
    if (ch) ch.undone = true;
  }
  return { ok: true, completion: c };
}

// ---------- long-term goals ----------

export function updateGoal(state, qid, value, now) {
  const q = state.quests.find((x) => x.id === qid && x.type === 'goal');
  if (!q) return fail('Goal not found.');
  if (findCompletion(state, q.id, 'once')) return fail('This goal is already complete.');
  const v = toNum(value, q.goal.current, 0, 1e12);
  q.goal.current = v;
  q.goal.history = [...(q.goal.history || []), { ts: now, value: v }].slice(-200);
  const xp = grantActivityXp(state, 'goalProgress', q.category, now, q.id);
  if (v >= q.goal.target) {
    const res = completeQuest(state, q.id, { now, _goal: true, method: 'goal' });
    return { ok: true, xp, completed: res.ok ? res : null };
  }
  return { ok: true, xp };
}

export function goalPct(q) {
  if (!q.goal) return 0;
  const { target, current, start = 0 } = q.goal;
  if (target === start) return current >= target ? 1 : 0;
  // Works for "increase to" and "decrease to" goals (e.g. weight 180 → 150).
  return clamp((current - start) / (target - start), 0, 1);
}

// ---------- activity XP (no rating) ----------

export function grantActivityXp(state, source, cat, now, ref = null, amountOverride = null) {
  const conf = ACTIVITY_XP[source];
  if (!conf) return 0;
  const day = dayKey(now, state.settings);
  const todays = state.xpLog.filter((e) => e.day === day && e.source === source);
  let amount = amountOverride ?? conf.amount ?? 0;
  if (conf.dailyMax && todays.length >= conf.dailyMax) return 0;
  if (conf.dailyCapXp) amount = Math.min(amount, conf.dailyCapXp - sum(todays, (e) => e.amount));
  amount = Math.round(amount);
  if (amount <= 0) return 0;
  state.xpLog.push({ id: uid('x'), ts: now, day, amount, cat, source, ref });
  addXp(state, amount, cat, day);
  return amount;
}

export function revokeActivityXp(state, source, ref, now) {
  const day = dayKey(now, state.settings);
  const hit = state.xpLog.filter((e) => e.source === source && e.ref === ref && e.day === day);
  for (const e of hit) addXp(state, -e.amount, e.cat, e.day);
  state.xpLog = state.xpLog.filter((e) => !hit.includes(e));
  return sum(hit, (e) => e.amount);
}

// ---------- linked quests (auto-complete from real activity) ----------

export function focusMinutesToday(state, now, subjectId = null) {
  const today = dayKey(now, state.settings);
  return sum(
    state.school.sessions.filter((s) => s.day === today && s.mode === 'focus' && (!subjectId || s.subjectId === subjectId)),
    (s) => s.minutes
  );
}

/** Completes open quests linked to an activity. payload: { id, mode } */
export function triggerLinked(state, kind, payload, now, extra = {}) {
  const today = dayKey(now, state.settings);
  const results = [];
  const candidates = state.quests.filter((q) => {
    if (!q.linked || q.linked.kind !== kind || q.archived || q.paused) return false;
    if (q.linked.id && payload && payload.id && q.linked.id !== payload.id) return false;
    if (q.linked.id && (!payload || !payload.id) && kind !== 'focus') return false;
    if (q.linked.mode && (!payload || payload.mode !== q.linked.mode)) return false;
    if (q.type === 'daily' && !isScheduledOn(q, today)) return false;
    if (q.type === 'goal') return false;
    const st = questState(state, q, today);
    return q.type === 'weekly' ? !st.done && !st.todayDone : !st.done;
  });
  for (const q of candidates) {
    if (kind === 'focus') {
      const need = q.linked.minutes || q.durationMin;
      if (focusMinutesToday(state, now, q.linked.id || null) < need) continue;
    }
    const res = completeQuest(state, q.id, { now, method: kind, timed: kind === 'focus' || kind === 'workout' || kind === 'care', ...extra });
    if (res.ok) results.push(res);
  }
  return results;
}
