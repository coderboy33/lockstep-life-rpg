// Weekly review statistics and data-driven recommendations. Nothing here is invented:
// every number comes from your recorded completions, days and logs.

import { CATEGORIES, catOf, rankedConfig } from '../core/config.js';
import { addDays, weekDays, weekday, hmToMin, WD_LONG } from '../core/dates.js';
import { sum } from '../core/util.js';
import { computeWeek, computeDay, dayMode } from './schedule.js';
import { tiersOf, majorRules } from './ranked.js';

const BUCKETS = [
  { id: 'morning', name: 'mornings (before noon)', test: (m) => m !== null && m < 720 },
  { id: 'afternoon', name: 'afternoons (12–5 PM)', test: (m) => m !== null && m >= 720 && m < 1020 },
  { id: 'evening', name: 'evenings (5–9 PM)', test: (m) => m !== null && m >= 1020 && m < 1260 },
  { id: 'night', name: 'late evenings (after 9 PM)', test: (m) => m !== null && m >= 1260 },
];

export function weekStats(state, wk, today) {
  const cfg = rankedConfig(state);
  const days = weekDays(wk).filter((k) => state.setupDay && k > state.setupDay && k <= today);
  const end = addDays(wk, 6);
  const w = state.weeks[wk] && state.weeks[wk].settled ? state.weeks[wk] : computeWeek(state, wk, today);
  const inWeek = (d) => d >= wk && d <= end;
  const comps = state.completions.filter((c) => inWeek(c.day));
  const xpLog = state.xpLog.filter((e) => inWeek(e.day));

  // Per-day due/done (rest & excused days are excluded from "missed").
  const byCat = Object.fromEntries(CATEGORIES.map((c) => [c.id, { due: 0, done: 0, xp: 0 }]));
  const perQuest = new Map();
  const buckets = Object.fromEntries(BUCKETS.map((b) => [b.id, { due: 0, done: 0 }]));
  const byWeekday = {};
  const missed = [];
  const dayRows = [];
  for (const k of days) {
    const rec = state.days[k];
    const settled = rec && rec.settled;
    const status = settled ? rec.status : dayMode(state, k);
    const due = settled ? rec.due || [] : computeDay(state, k).due;
    const doneIds = new Set(comps.filter((c) => c.day === k).map((c) => c.qid));
    dayRows.push({ day: k, status, rate: settled ? rec.rate : computeDay(state, k).rate, sr: settled ? rec.srApplied || 0 : null });
    if (status !== 'normal' && status !== 'away' && settled) continue;
    if (!settled && status !== 'normal') continue;
    for (const d of due) {
      const done = doneIds.has(d.qid);
      byCat[d.cat] ||= { due: 0, done: 0, xp: 0 };
      byCat[d.cat].due++;
      if (done) byCat[d.cat].done++;
      const pq = perQuest.get(d.qid) || { qid: d.qid, title: d.title, cat: d.cat, due: 0, done: 0 };
      pq.due++;
      if (done) pq.done++;
      perQuest.set(d.qid, pq);
      const m = hmToMin(d.time);
      const b = BUCKETS.find((x) => x.test(m));
      if (b) {
        buckets[b.id].due++;
        if (done) buckets[b.id].done++;
      }
      const wd = weekday(k);
      byWeekday[wd] ||= { due: 0, done: 0 };
      byWeekday[wd].due++;
      if (done) byWeekday[wd].done++;
      if (!done && k < today) missed.push({ day: k, title: d.title, cat: d.cat, qid: d.qid });
    }
  }
  for (const c of comps) (byCat[c.cat] ||= { due: 0, done: 0, xp: 0 }).xp += c.xp;
  for (const e of xpLog) (byCat[e.cat] ||= { due: 0, done: 0, xp: 0 }).xp += e.amount;

  const xp = sum(comps, (c) => c.xp) + sum(xpLog, (e) => e.amount);
  const srDays = sum(days.map((k) => state.days[k]).filter((r) => r && r.settled), (r) => r.srApplied || 0);
  const srBonus = sum(comps, (c) => c.sr);
  const srWeek = state.weeks[wk] && state.weeks[wk].settled ? state.weeks[wk].srApplied || 0 : 0;
  const rankEvents = state.ranked.history.filter((e) => inWeek(e.day) && ['promotion', 'demotion', 'placement'].includes(e.type));

  const cats = Object.entries(byCat)
    .map(([id, v]) => ({ id, ...v, rate: v.due ? v.done / v.due : null }))
    .filter((c) => c.due || c.xp);
  const rated = cats.filter((c) => c.due >= 3);
  const strongest = [...rated].sort((a, b) => b.rate - a.rate || b.xp - a.xp)[0] || [...cats].sort((a, b) => b.xp - a.xp)[0] || null;
  const weakest = [...rated].sort((a, b) => a.rate - b.rate)[0] || null;

  const studyMin = sum(state.school.sessions.filter((x) => inWeek(x.day)), (x) => x.minutes);
  const workouts = state.fitness.sessions.filter((x) => inWeek(x.day));
  const careLogs = state.care.logs.filter((x) => inWeek(x.day) && x.complete);
  const journal = state.trading.entries.filter((x) => inWeek(x.day));
  const bizDone = sum(state.business.projects, (p) => (p.tasks || []).filter((t) => t.status === 'done' && t.doneDay && inWeek(t.doneDay)).length);
  const objectives = state.business.projects.flatMap((p) => (p.objectives || []).filter((o) => o.week === wk));
  const sleep = state.sleep.filter((x) => inWeek(x.day));

  const stats = {
    week: wk,
    end,
    partial: end >= today,
    score: w.score ?? null,
    dueCount: w.dueCount || 0,
    doneCount: w.doneCount || 0,
    missedCount: missed.length,
    missed,
    days: dayRows,
    cats,
    strongest,
    weakest,
    xp,
    sr: { days: srDays, bonus: srBonus, week: srWeek, total: srDays + srBonus + srWeek },
    rankEvents,
    study: { minutes: studyMin, goal: state.school.weeklyGoalMin || 0, sessions: state.school.sessions.filter((x) => inWeek(x.day)).length },
    fitness: { workouts: workouts.length, sets: sum(workouts, (x) => x.setsDone || 0) },
    care: { routines: careLogs.length, rate: byCat.care && byCat.care.due ? byCat.care.done / byCat.care.due : null },
    trading: { entries: journal.length, followed: journal.filter((e) => e.followedPlan).length, broken: journal.filter((e) => e.ruleBroken).length },
    business: { tasks: bizDone, objectivesDone: objectives.filter((o) => o.done).length, objectives: objectives.length },
    sleep: { logs: sleep.length, avgHours: sleep.length ? sum(sleep, (x) => x.hours || 0) / sleep.length : null, avgQuality: sleep.length ? sum(sleep, (x) => x.quality || 0) / sleep.length : null },
    perQuest: [...perQuest.values()],
    buckets,
    byWeekday,
    verified: comps.filter((c) => c.verified).length,
    restDays: dayRows.filter((d) => d.status === 'rest' || d.status === 'excused').length,
  };
  stats.recommendations = recommendations(state, stats, cfg);
  return stats;
}

function recommendations(state, st, cfg) {
  const out = [];
  const pctTxt = (x) => `${Math.round(x * 100)}%`;
  if (!st.dueCount) {
    out.push({ icon: 'target', text: 'No ranked quests were scheduled this week. Add a few daily quests so your rank can move.', action: { kind: 'nav', href: '#/quests?tab=all', label: 'Add quests' } });
    return out;
  }
  const std = majorRules(state).standard;
  if (st.score !== null && st.score >= std + 0.1)
    out.push({ icon: 'trend', text: `Strong week: ${pctTxt(st.score)} against a ${pctTxt(std)} standard. To keep climbing, add one harder quest or a verified challenge — not more easy ones.` });
  // Struggling quests
  for (const q of st.perQuest.filter((x) => x.due >= 3 && x.done / x.due < 0.4).sort((a, b) => a.done / a.due - b.done / b.due).slice(0, 3)) {
    out.push({ icon: 'alert', text: `“${q.title}” was done ${q.done}/${q.due} times. Make it smaller, schedule fewer days, or pause it — an unrealistic plan costs rating.`, action: { kind: 'quest', qid: q.qid, label: 'Adjust' } });
  }
  if (st.weakest && st.weakest.rate < 0.5 && st.weakest.id !== (st.strongest && st.strongest.id))
    out.push({ icon: catOf(st.weakest.id).icon, text: `${catOf(st.weakest.id).name} needs attention: ${st.weakest.done}/${st.weakest.due} done (${pctTxt(st.weakest.rate)}). Pick one quest there to protect next week.` });
  // Time-of-day pattern
  const bks = Object.entries(st.buckets).map(([id, v]) => ({ id, ...v, rate: v.due ? v.done / v.due : null })).filter((b) => b.due >= 4);
  const worst = [...bks].sort((a, b) => a.rate - b.rate)[0];
  const best = [...bks].sort((a, b) => b.rate - a.rate)[0];
  if (worst && best && worst.id !== best.id && worst.rate < 0.5 && best.rate >= 0.75)
    out.push({ icon: 'clock', text: `You finished ${pctTxt(worst.rate)} of quests scheduled for ${BUCKETS.find((b) => b.id === worst.id).name}, but ${pctTxt(best.rate)} in ${BUCKETS.find((b) => b.id === best.id).name}. Try moving some to that time.` });
  // Weekday pattern
  const wds = Object.entries(st.byWeekday).map(([d, v]) => ({ d: Number(d), ...v, rate: v.due ? v.done / v.due : 1 })).filter((x) => x.due >= 3);
  const worstDay = [...wds].sort((a, b) => a.rate - b.rate)[0];
  if (worstDay && worstDay.rate < 0.4 && wds.length >= 3) out.push({ icon: 'calendar', text: `${WD_LONG[worstDay.d]} was your hardest day (${worstDay.done}/${worstDay.due}). Consider a lighter schedule or a rest day there.` });
  if (st.study.goal && st.study.minutes < st.study.goal * 0.7)
    out.push({ icon: 'book', text: `You logged ${Math.round(st.study.minutes / 6) / 10}h of study against a ${Math.round(st.study.goal / 6) / 10}h goal. Schedule specific focus blocks next week, or lower the goal to something you’ll actually hit.`, action: { kind: 'nav', href: '#/grind?tab=school', label: 'School' } });
  if (st.sleep.logs >= 3 && st.sleep.avgHours !== null && st.sleep.avgHours < 7)
    out.push({ icon: 'moon', text: `Your logged sleep averaged ${st.sleep.avgHours.toFixed(1)}h. Teens generally need 8–10h and adults 7–9h — earlier screens-off and a consistent bedtime help more than any quest.` });
  if (st.fitness.workouts >= 6 && st.restDays === 0) out.push({ icon: 'bed', text: `${st.fitness.workouts} workouts and no rest day. Recovery is when you get stronger — plan at least one rest day.` });
  if (st.trading.broken) out.push({ icon: 'chart', text: `You broke your risk rule ${st.trading.broken} time${st.trading.broken > 1 ? 's' : ''}. Re-read the position sizing lesson before your next trade.`, action: { kind: 'nav', href: '#/grind?tab=trading', label: 'Trading' } });
  const tiers = tiersOf(state);
  if (state.ranked.placed && state.ranked.tier >= tiers.findIndex((t) => t.major === 'diamond') && !st.verified)
    out.push({ icon: 'video', text: 'No verified challenges this week. Elite and above require them — use the camera, upload or nose-tap counter on your push-up challenge.' });
  if (!out.length) out.push({ icon: 'check', text: 'Solid, balanced week. Keep the same plan and focus on consistency.' });
  return out;
}

export function defaultReviewWeek(state, today) {
  const wkStart = state.settings.weekStartsOn ?? 1;
  const cur = addDays(today, -((weekday(today) - wkStart + 7) % 7));
  const lastDayOfWeek = weekday(today) === (wkStart + 6) % 7;
  if (lastDayOfWeek) return cur;
  const prev = addDays(cur, -7);
  if (state.setupDay && addDays(prev, 6) < state.setupDay) return cur;
  return state.weeks[prev] && state.weeks[prev].reviewed ? cur : prev;
}

