// Competitive rating (SR), placement, promotions/demotions, daily & weekly settlement, seasons.
// Lifetime XP lives elsewhere: nothing in this file touches XP.

import { rankedConfig, buildTiers, MAJORS, diffIndex } from '../core/config.js';
import { addDays, diffDays, weekday, weekKey, dayKey } from '../core/dates.js';
import { mean } from '../core/util.js';
import {
  computeDay,
  dayMode,
  streakAsOf,
  activeDaysInLast,
  categoriesInLast,
  verifiedInLast,
  computeWeek,
} from './schedule.js';

const majorIdx = (id) => MAJORS.findIndex((m) => m.id === id);

export function tiersOf(state) {
  return buildTiers(rankedConfig(state));
}

export function tierForRating(tiers, rating) {
  let idx = 1;
  for (let i = 1; i < tiers.length; i++) if (rating >= tiers[i].min) idx = i;
  return idx;
}

export function currentTier(state) {
  return tiersOf(state)[state.ranked.placed ? state.ranked.tier : 0];
}

/** Progress from the current tier toward the next one. */
export function rankProgress(state) {
  const tiers = tiersOf(state);
  const r = state.ranked;
  const cfg = rankedConfig(state);
  if (!r.placed) {
    const done = r.placement.days.length;
    return { placement: true, done, total: cfg.placementDays, pct: Math.min(1, done / cfg.placementDays) };
  }
  const cur = tiers[r.tier];
  const next = tiers[r.tier + 1] || null;
  if (!next) return { cur, next: null, pct: 1, need: 0, max: true };
  const span = next.min - cur.min;
  const pctv = Math.max(0, Math.min(1, (r.rating - cur.min) / span));
  return { cur, next, pct: pctv, need: Math.max(0, next.min - r.rating) };
}

/** How close you are to being demoted (null if safe or protected). */
export function demotionRisk(state, today) {
  const r = state.ranked;
  if (!r.placed || r.tier <= 1) return null;
  const cfg = rankedConfig(state);
  const tiers = tiersOf(state);
  const line = tiers[r.tier].min - cfg.demotionBuffer;
  const margin = r.rating - line;
  const protectedUntil = r.lastPromotionDay ? addDays(r.lastPromotionDay, cfg.promotionProtectionDays) : null;
  return { line, margin, protected: !!(protectedUntil && today <= protectedUntil), protectedUntil, risky: margin < 20 };
}

// ---------- requirements ----------

function settledWeeksBefore(state, wk) {
  return Object.entries(state.weeks)
    .filter(([k, w]) => w.settled && k < wk && w.score !== null && w.score !== undefined)
    .sort((a, b) => (a[0] < b[0] ? 1 : -1));
}

export function daysAtMajor(state, major, day) {
  const since = state.ranked.reachedMajor && state.ranked.reachedMajor[major];
  return since ? Math.max(0, diffDays(since, day)) : 0;
}

/** Requirements to enter `tierIdx` (only the first division of a rank has any). */
export function requirementStatus(state, tierIdx, day, today = day) {
  const cfg = rankedConfig(state);
  const t = tiersOf(state)[tierIdx];
  if (!t || t.div > 1) return { ok: true, items: [] };
  const req = cfg.requirements[t.major];
  if (!req) return { ok: true, items: [] };
  const items = [];
  if (req.activeDays14) items.push({ id: 'active', label: `Secure ${req.activeDays14} of your last 14 days`, have: activeDaysInLast(state, 14, day, today), need: req.activeDays14 });
  if (req.categories7) items.push({ id: 'cats7', label: `Quests in ${req.categories7} categories (last 7 days)`, have: categoriesInLast(state, 7, day), need: req.categories7 });
  if (req.categories14) items.push({ id: 'cats14', label: `Quests in ${req.categories14} categories (last 14 days)`, have: categoriesInLast(state, 14, day), need: req.categories14 });
  if (req.verified14) items.push({ id: 'verified', label: `${req.verified14} verified challenge${req.verified14 > 1 ? 's' : ''} (last 14 days)`, have: verifiedInLast(state, 14, day), need: req.verified14 });
  if (req.weeks) {
    const wk = weekKey(day, state.settings.weekStartsOn);
    const last = settledWeeksBefore(state, wk).slice(0, req.weeks.n);
    const good = last.filter(([, w]) => w.score >= req.weeks.score).length;
    items.push({ id: 'weeks', label: `Last ${req.weeks.n === 1 ? 'week' : req.weeks.n + ' weeks'} at ≥ ${Math.round(req.weeks.score * 100)}% weekly score`, have: good, need: req.weeks.n });
  }
  if (req.streak) items.push({ id: 'streak', label: `${req.streak}-day streak`, have: streakAsOf(state, day, today), need: req.streak });
  if (req.daysAtChampion) items.push({ id: 'champ', label: `${req.daysAtChampion} days at Champion`, have: daysAtMajor(state, 'champion', day), need: req.daysAtChampion });
  return { ok: items.every((i) => i.have >= i.need), items };
}

/** If a promotion is blocked by requirements, SR can only go slightly past that threshold. */
export function ratingCap(state, day, today = day) {
  const r = state.ranked;
  if (!r.placed) return Infinity;
  const cfg = rankedConfig(state);
  const tiers = tiersOf(state);
  for (let t = r.tier + 1; t < tiers.length; t++) {
    if (tiers[t].div > 1) continue;
    if (!requirementStatus(state, t, day, today).ok) return tiers[t].min + cfg.lockedOverflow;
  }
  return Infinity;
}

export function lockedPromotion(state, day) {
  const r = state.ranked;
  if (!r.placed) return null;
  const tiers = tiersOf(state);
  const target = tierForRating(tiers, r.rating);
  if (target <= r.tier) {
    // Even if not over the line yet, show the next major's requirements when close.
    const next = tiers.slice(r.tier + 1).find((t) => t.div <= 1);
    if (!next || next.min - r.rating > 60) return null;
    const st = requirementStatus(state, next.index, day);
    return st.ok ? null : { tier: next, ...st, over: false };
  }
  for (let t = r.tier + 1; t <= target; t++) {
    const st = requirementStatus(state, t, day);
    if (!st.ok) return { tier: tiers[t], ...st, over: true };
  }
  return null;
}

// ---------- applying rating ----------

/** Adds SR (clamped at 0 and at any locked-promotion cap). Returns the amount actually applied. */
export function applyRating(state, delta, day, today = day) {
  const r = state.ranked;
  if (!delta) return 0;
  if (!r.placed) {
    // During placement, quest SR banks up and is added to the placement result.
    const b0 = r.rating || 0;
    r.rating = Math.max(0, Math.round(b0 + delta));
    return r.rating - b0;
  }
  const before = r.rating;
  let after = Math.max(0, before + delta);
  if (delta > 0) after = Math.min(after, Math.max(before, ratingCap(state, day, today)));
  after = Math.round(after);
  r.rating = after;
  if (after > r.peakRating) r.peakRating = after;
  if (after > (r.season.peakRating || 0)) r.season.peakRating = after;
  return after - before;
}

function setTier(state, to, day, type, now, note) {
  const r = state.ranked;
  const from = r.tier;
  if (from === to) return null;
  r.tier = to;
  r.tierSince = day;
  const tiers = tiersOf(state);
  const newMajor = majorIdx(tiers[to].major);
  r.reachedMajor ||= {};
  for (const m of MAJORS) {
    const mi = majorIdx(m.id);
    if (mi <= newMajor && mi > 0 && !r.reachedMajor[m.id]) r.reachedMajor[m.id] = day;
    if (mi > newMajor) delete r.reachedMajor[m.id];
  }
  if (type === 'promotion') r.lastPromotionDay = day;
  if (to > r.peakTier) r.peakTier = to;
  if (to > (r.season.peakTier || 0)) r.season.peakTier = to;
  const ev = { ts: now, day, type, from, to, rating: r.rating, note: note || '' };
  r.history.push(ev);
  return ev;
}

/** Promotes (if requirements allow) or demotes (past the buffer, outside protection). */
export function evaluateRank(state, day, now, today = day) {
  const r = state.ranked;
  if (!r.placed) return [];
  const cfg = rankedConfig(state);
  const tiers = tiersOf(state);
  const target = tierForRating(tiers, r.rating);
  const events = [];
  if (target > r.tier) {
    let best = r.tier;
    for (let t = r.tier + 1; t <= target; t++) {
      if (requirementStatus(state, t, day, today).ok) best = t;
      else break;
    }
    if (best > r.tier) events.push(setTier(state, best, day, 'promotion', now));
  } else if (target < r.tier) {
    const floor = tiers[r.tier].min;
    const protectedUntil = r.lastPromotionDay ? addDays(r.lastPromotionDay, cfg.promotionProtectionDays) : null;
    const isProtected = protectedUntil && day <= protectedUntil;
    if (r.rating < floor - cfg.demotionBuffer && !isProtected) events.push(setTier(state, target, day, 'demotion', now));
  }
  return events.filter(Boolean);
}

// ---------- daily settlement ----------

export function ensureDay(state, day) {
  return (state.days[day] ||= {});
}

export function majorRules(state, tierIdx = state.ranked.tier) {
  const cfg = rankedConfig(state);
  const major = tiersOf(state)[Math.max(1, tierIdx)].major;
  return cfg.majors[major] || cfg.majors.bronze;
}

/** The daily "match" result: SR change from a day's weighted completion rate. */
export function dailyDelta(state, rec) {
  const cfg = rankedConfig(state);
  const m = majorRules(state);
  const std = m.standard;
  const rate = rec.rate ?? 0;
  const load = Math.min(1, (rec.dueW || 0) / m.minLoad);
  if (rate >= std) {
    let up = (m.up * (rate - std)) / (1 - std);
    // At the very top, gains taper so Unreal SR reflects consistency, not just time served.
    const tiers = tiersOf(state);
    const top = tiers[tiers.length - 1];
    if (state.ranked.tier === top.index) up *= Math.max(0.25, 1 - (state.ranked.rating - top.min) / 1500);
    const perfect = rate >= 0.999 && (rec.due || []).length >= cfg.perfectDayMinQuests && load >= 1;
    if (perfect) up += cfg.perfectDayBonus;
    const delta = Math.round(up * load);
    return { delta, std, load, kind: perfect ? 'perfect' : delta > 0 ? 'win' : 'hold' };
  }
  let down = (-m.down * (std - rate)) / std;
  if (rec.inactive) down *= cfg.inactivePenaltyMult;
  return { delta: Math.round(down), std, load, kind: 'loss' };
}

/** Live projection of today's match (what settlement would give if the day ended now). */
export function matchProjection(state, day) {
  if (!state.ranked.placed || !state.setupDay || day <= state.setupDay) return null;
  const mode = dayMode(state, day);
  const live = computeDay(state, day);
  const m = majorRules(state);
  if (mode !== 'normal') return { ...live, mode, delta: 0, std: m.standard, minLoad: m.minLoad, kind: mode };
  if (live.rate === null) return { ...live, mode, delta: 0, std: m.standard, minLoad: m.minLoad, kind: 'empty' };
  const d = dailyDelta(state, live);
  return { ...live, mode, ...d, minLoad: m.minLoad };
}

/** How much completing a due quest (weight w) would raise today's projected match result. */
export function matchImpact(state, day, w) {
  const p = matchProjection(state, day);
  if (!p || p.kind === 'empty' || p.mode !== 'normal' || !p.dueW) return 0;
  const after = dailyDelta(state, { ...p, doneW: p.doneW + w, rate: Math.min(1, (p.doneW + w) / p.dueW) });
  return Math.max(0, after.delta - p.delta);
}

function inactiveRunBefore(state, day) {
  let n = 0;
  for (let k = addDays(day, -1), i = 0; i < 30; k = addDays(k, -1), i++) {
    const rec = state.days[k];
    if (rec && rec.settled && (rec.inactive || rec.status === 'away')) n++;
    else break;
  }
  return n;
}

function settleDay(state, day, now, events) {
  const cfg = rankedConfig(state);
  const r = state.ranked;
  const rec = ensureDay(state, day);
  if (rec.settled) return;
  const live = computeDay(state, day);
  Object.assign(rec, live);
  rec.active = (state.meta.openDays || []).includes(day) || live.anyCount > 0;
  rec.inactive = false;
  rec.srApplied = 0;
  const mode = dayMode(state, day);
  if (day <= state.setupDay) rec.status = 'setup';
  else if (mode !== 'normal') rec.status = mode;
  else if (live.rate === null) rec.status = 'empty';
  else rec.status = 'normal';

  if (rec.status === 'normal' && !rec.active) {
    rec.inactive = true;
    if (inactiveRunBefore(state, day) >= cfg.awayAfterInactiveDays) rec.status = 'away';
  }

  const inPlacement = !r.placed || (r.placement.endDay && day <= r.placement.endDay);
  if (!r.placed) r.placement.days = r.placement.days.filter((p) => p.day !== day);
  if (rec.status === 'normal') {
    if (!r.placed) {
      r.placement.days.push({ day, rate: rec.rate, due: rec.due.length, done: rec.doneCount });
    } else if (!inPlacement) {
      const d = dailyDelta(state, rec);
      rec.srKind = d.kind;
      rec.std = d.std;
      rec.srApplied = applyRating(state, d.delta, day);
    }
  }
  rec.settled = true;
  rec.settledAt = now;
  if (!state.meta.lastSettledDay || day > state.meta.lastSettledDay) state.meta.lastSettledDay = day;

  if (!r.placed && r.placement.days.length >= cfg.placementDays) finishPlacement(state, day, now, events);

  events.push(...evaluateRank(state, day, now));
  logRating(state, day);
  events.push({ type: 'day', day, status: rec.status, rate: rec.rate, sr: rec.srApplied });
}

function logRating(state, day) {
  const r = state.ranked;
  const log = r.ratingLog;
  const entry = { day, rating: r.rating, tier: r.placed ? r.tier : 0 };
  const i = log.findIndex((x) => x.day === day);
  if (i >= 0) log[i] = entry;
  else {
    log.push(entry);
    log.sort((a, b) => (a.day < b.day ? -1 : 1));
  }
  if (log.length > 800) log.splice(0, log.length - 800);
}

// ---------- placement ----------

export function placementBreakdown(state, endDay) {
  const cfg = rankedConfig(state);
  const r = state.ranked;
  const days = r.placement.days;
  const start = r.placement.startDay || state.setupDay;
  const comps = state.completions.filter((c) => c.day >= start && c.day <= endDay);
  const avgRate = mean(days.map((d) => d.rate || 0));
  const consistency = days.length ? days.filter((d) => d.rate >= 0.6).length / days.length : 0;
  const difficulty = comps.length ? mean(comps.map((c) => diffIndex(c.diff))) / 3 : 0;
  const breadth = Math.min(1, new Set(comps.map((c) => c.cat)).size / 5);
  const verified = Math.min(1, comps.filter((c) => c.verified).length / 3);
  const goals = Math.min(1, comps.filter((c) => c.type === 'goal' || diffIndex(c.diff) >= 2).length / 6);
  const score = 0.4 * avgRate + 0.2 * consistency + 0.15 * difficulty + 0.1 * breadth + 0.1 * verified + 0.05 * goals;
  let rating = Math.round(cfg.placementMaxRating * Math.pow(Math.max(0, Math.min(1, score)), 1.3));
  const lowActivity = comps.length < cfg.placementMinCompletions;
  if (lowActivity) rating = Math.min(rating, cfg.placementLowActivityCap);
  return { avgRate, consistency, difficulty, breadth, verified, goals, score, rating, lowActivity, completions: comps.length, days: days.length };
}

function finishPlacement(state, day, now, events) {
  const r = state.ranked;
  const tiers = tiersOf(state);
  const b = placementBreakdown(state, day);
  const earned = r.rating || 0; // quest SR banked during placement
  b.questSr = earned;
  r.placed = true;
  r.rating = b.rating + earned;
  r.peakRating = Math.max(r.peakRating, r.rating);
  r.placement.result = b;
  r.placement.endDay = day;
  r.tier = 0;
  // Walk up from Bronze I, respecting promotion requirements.
  const target = tierForRating(tiers, r.rating);
  let best = 1;
  for (let t = 2; t <= target; t++) {
    if (requirementStatus(state, t, day).ok) best = t;
    else break;
  }
  r.tier = best;
  r.tierSince = day;
  r.reachedMajor = {};
  const mi = majorIdx(tiers[best].major);
  for (const m of MAJORS) if (majorIdx(m.id) > 0 && majorIdx(m.id) <= mi) r.reachedMajor[m.id] = day;
  r.peakTier = Math.max(r.peakTier, best);
  r.season.peakTier = Math.max(r.season.peakTier || 0, best);
  r.season.peakRating = Math.max(r.season.peakRating || 0, b.rating);
  const ev = { ts: now, day, type: 'placement', from: 0, to: best, rating: b.rating, note: '' };
  r.history.push(ev);
  events.push(ev);
}

// ---------- weekly settlement ----------

function settleWeek(state, wk, now, events) {
  const w = (state.weeks[wk] ||= {});
  if (w.settled) return;
  const cfg = rankedConfig(state);
  const r = state.ranked;
  const lastDay = addDays(wk, 6);
  const res = computeWeek(state, wk, lastDay);
  Object.assign(w, { score: res.score, dueCount: res.dueCount, doneCount: res.doneCount, normalDays: res.normalDays });
  w.srApplied = 0;
  const fullyRanked = r.placed && r.placement.endDay && r.placement.endDay < wk;
  if (fullyRanked && res.score !== null) {
    const major = tiersOf(state)[r.tier].major;
    const std = (cfg.majors[major] || cfg.majors.bronze).standard;
    let delta = 0;
    const notes = [];
    if (res.score >= Math.min(0.97, std + cfg.weekly.strongMargin)) {
      delta += cfg.weekly.strongBonus;
      notes.push('Strong week');
    } else if (res.score < std - cfg.weekly.weakMargin) {
      delta -= cfg.weekly.weakPenalty;
      notes.push('Weak week');
    }
    if (majorIdx(major) >= majorIdx('elite') && res.dueCount < cfg.weekly.eliteMinDue && res.normalDays >= 5) {
      delta -= cfg.weekly.lowActivityPenalty;
      notes.push('Low activity for your rank');
    }
    w.notes = notes;
    w.srApplied = applyRating(state, delta, lastDay);
    events.push(...evaluateRank(state, lastDay, now));
  }
  if (res.score !== null && res.score > (state.records.bestWeekScore || 0) && res.dueCount >= 7) state.records.bestWeekScore = res.score;
  w.settled = true;
  w.settledAt = now;
  state.meta.lastSettledWeek = wk;
  events.push({ type: 'week', week: wk, score: res.score, sr: w.srApplied });
}

// ---------- seasons ----------

export function seasonEnd(state) {
  const cfg = rankedConfig(state);
  const s = state.ranked.season;
  if (!s.startDay) return null;
  return addDays(s.startDay, cfg.season.weeks * 7 - 1);
}

function checkSeason(state, day, now, events) {
  const r = state.ranked;
  const cfg = rankedConfig(state);
  if (!r.season.startDay) r.season.startDay = state.setupDay;
  const end = seasonEnd(state);
  if (!end || day < end) return;
  r.seasons.push({
    number: r.season.number,
    startDay: r.season.startDay,
    endDay: end,
    finalTier: r.placed ? r.tier : 0,
    finalRating: r.rating,
    peakTier: r.season.peakTier || 0,
    peakRating: r.season.peakRating || 0,
    customRules: !!(r.season.customRules || state.settings.customRules),
  });
  if (r.placed) {
    const over = Math.max(0, r.rating - cfg.season.resetPivot);
    r.rating = Math.round(r.rating - over * cfg.season.resetStrength);
    const tiers = tiersOf(state);
    const t = Math.min(r.tier, tierForRating(tiers, r.rating));
    if (t !== r.tier) setTier(state, t, day, 'season', now, 'Season soft reset');
    r.lastPromotionDay = null;
  }
  r.season = { number: r.season.number + 1, startDay: addDays(end, 1), peakTier: r.placed ? r.tier : 0, peakRating: r.rating, customRules: Object.keys(state.settings.rankedOverrides || {}).length > 0 };
  const ev = { ts: now, day, type: 'season', from: r.tier, to: r.tier, rating: r.rating, note: `Season ${r.season.number} started` };
  r.history.push(ev);
  events.push(ev);
}

// ---------- entry point ----------

/** Settles every finished day/week up to (not including) today. Safe to call often. */
export function runSettlement(state, now) {
  const events = [];
  if (!state.onboarded || !state.setupDay) return events;
  const s = state.settings;
  const today = dayKey(now, s);
  let d = state.meta.lastSettledDay ? addDays(state.meta.lastSettledDay, 1) : state.setupDay;
  if (d < state.setupDay) d = state.setupDay;
  const endOfWeekDay = ((s.weekStartsOn ?? 1) + 6) % 7;
  let guard = 0;
  while (d < today && guard++ < 1000) {
    settleDay(state, d, now, events);
    if (weekday(d) === endOfWeekDay) settleWeek(state, weekKey(d, s.weekStartsOn), now, events);
    checkSeason(state, d, now, events);
    d = addDays(d, 1);
  }
  return events;
}

/** Re-runs settlement for one past day (after a backfill or an excuse). */
export function resettleDay(state, day, now) {
  const rec = state.days[day];
  if (!rec || !rec.settled) return [];
  const r = state.ranked;
  if (rec.srApplied) r.rating = Math.max(0, r.rating - rec.srApplied);
  rec.settled = false;
  rec.srApplied = 0;
  const events = [];
  settleDay(state, day, now, events);
  return events;
}

/** Declare a day as rest / excused (sick, emergency) or back to normal. */
export function declareDay(state, day, mode, now, reason = '') {
  const cfg = rankedConfig(state);
  const today = dayKey(now, state.settings);
  if (!state.setupDay || day <= state.setupDay) return { ok: false, reason: 'Your setup day is already neutral.' };
  if (day < addDays(today, -cfg.excuseWindowDays)) return { ok: false, reason: `You can only change the last ${cfg.excuseWindowDays} days.` };
  if (day > addDays(today, 30)) return { ok: false, reason: 'You can only plan up to 30 days ahead.' };
  const rec = ensureDay(state, day);
  if (mode === 'normal') {
    if (day < today) return { ok: false, reason: 'Past days can’t be switched back.' };
    delete rec.mode;
    delete rec.modeReason;
    return { ok: true };
  }
  if (rec.mode === mode) return { ok: true };
  const used = recoveryDaysUsed(state, day);
  if (!rec.mode && used >= cfg.excuseAllowance30) return { ok: false, reason: `You’ve used all ${cfg.excuseAllowance30} recovery days in this 30-day window.` };
  rec.mode = mode;
  rec.modeReason = reason;
  rec.modeSetAt = now;
  const events = rec.settled ? resettleDay(state, day, now) : [];
  return { ok: true, events };
}

export function recoveryDaysUsed(state, aroundDay) {
  const from = addDays(aroundDay, -29);
  const to = addDays(aroundDay, 29);
  return Object.entries(state.days).filter(([k, v]) => (v.mode === 'rest' || v.mode === 'excused') && k >= from && k <= to).length;
}

/** Days since the last open that were settled as inactive (shown in the Welcome Back sheet). */
export function recentInactiveDays(state, today) {
  const cfg = rankedConfig(state);
  const out = [];
  for (let i = 1; i <= cfg.excuseWindowDays; i++) {
    const k = addDays(today, -i);
    const rec = state.days[k];
    if (rec && rec.settled && (rec.inactive || rec.status === 'away') && !rec.mode) out.push(k);
  }
  return out;
}
