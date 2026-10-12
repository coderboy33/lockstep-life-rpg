// Engine tests. Run with:  node --test tests/
// These exercise the real ranked/quest code with a simulated clock.

import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, startAccount, normalize, migrate } from '../js/core/state.js';
import { dayKey, addDays } from '../js/core/dates.js';
import { createQuest, completeQuest, undoCompletion, todayView, setPaused, deleteQuest, updateGoal } from '../js/engine/quests.js';
import { runSettlement, declareDay, tiersOf, requirementStatus, evaluateRank } from '../js/engine/ranked.js';
import { streakAsOf, computeDay } from '../js/engine/schedule.js';

const DAY = 86400000;
const T0 = Date.UTC(2026, 9, 5, 12, 0, 0); // Mon 5 Oct 2026, 12:00 UTC

function freshState(now = T0) {
  const s = defaultState(now);
  s.settings.timeZone = 'UTC';
  s.settings.dayStartHour = 3;
  s.profile.name = 'Tester';
  startAccount(s, now);
  return s;
}

function addStandardQuests(s, now, n = 6, extra = {}) {
  const ids = [];
  const cats = ['study', 'fitness', 'care', 'discipline', 'productivity', 'sleep', 'trading', 'business'];
  for (let i = 0; i < n; i++) {
    const r = createQuest(s, { title: `Quest ${i}`, category: cats[i % cats.length], type: 'daily', days: [], durationMin: 30, difficulty: 'medium', ...extra }, now);
    assert.ok(r.ok, r.reason);
    ids.push(r.quest.id);
  }
  return ids;
}

/** Simulates n days: on each day completes `rate` of quests, then advances and settles. */
function simulate(s, startTs, days, rate = 1, opts = {}) {
  let now = startTs;
  for (let d = 0; d < days; d++) {
    now = startTs + d * DAY;
    s.meta.openDays.push(dayKey(now, s.settings));
    runSettlement(s, now);
    const v = todayView(s, now);
    const doable = v.daily.filter((x) => !x.done);
    const k = Math.round(doable.length * rate);
    for (const x of doable.slice(0, k)) completeQuest(s, x.q.id, { now, ...(opts.complete || {}) });
  }
  const end = startTs + days * DAY;
  runSettlement(s, end);
  return end;
}

test('new profile starts unranked with a setup day', () => {
  const s = freshState();
  assert.equal(s.onboarded, true);
  assert.equal(s.setupDay, '2026-10-05');
  assert.equal(s.ranked.placed, false);
  assert.equal(s.ranked.tier, 0);
});

test('day key respects the day-start hour', () => {
  const s = freshState();
  const at1am = Date.UTC(2026, 9, 6, 1, 0, 0);
  assert.equal(dayKey(at1am, s.settings), '2026-10-05');
  assert.equal(dayKey(Date.UTC(2026, 9, 6, 4, 0, 0), s.settings), '2026-10-06');
});

test('quest creation, completion, XP, and duplicate protection', () => {
  const s = freshState();
  const [qid] = addStandardQuests(s, T0, 1);
  const r1 = completeQuest(s, qid, { now: T0 });
  assert.ok(r1.ok);
  assert.ok(r1.completion.xp > 0, 'XP awarded');
  assert.equal(r1.completion.sr, 2, 'medium quest gives 2 SR, even during placement');
  assert.equal(s.ranked.rating, 2, 'SR banked immediately');
  const xpAfter = s.xp.total;
  const r2 = completeQuest(s, qid, { now: T0 + 1000 });
  assert.equal(r2.ok, false, 'duplicate blocked');
  assert.equal(s.xp.total, xpAfter, 'no duplicate XP');
  assert.equal(s.ranked.rating, 2, 'no duplicate SR');
  assert.equal(s.completions.length, 1);
});

test('undo removes the exact rewards', () => {
  const s = freshState();
  const [qid] = addStandardQuests(s, T0, 1);
  const r = completeQuest(s, qid, { now: T0 });
  const undo = undoCompletion(s, r.completion.id, T0 + 5000);
  assert.ok(undo.ok);
  assert.equal(s.xp.total, 0);
  assert.equal(s.ranked.rating, 0, 'SR removed too');
  assert.equal(s.completions.length, 0);
});

test('daily quests reset next day without deleting history', () => {
  const s = freshState();
  const [qid] = addStandardQuests(s, T0, 1);
  completeQuest(s, qid, { now: T0 });
  const t1 = T0 + DAY;
  runSettlement(s, t1);
  const v = todayView(s, t1);
  assert.equal(v.daily.find((x) => x.q.id === qid).done, false, 'open again tomorrow');
  assert.equal(s.completions.length, 1, 'history kept');
  assert.equal(s.days['2026-10-05'].settled, true);
  assert.equal(s.days['2026-10-05'].status, 'setup');
  const r = completeQuest(s, qid, { now: t1 });
  assert.ok(r.ok, 'can complete again on the new day');
});

test('placement takes 7 days and caps the initial rank', () => {
  const s = freshState();
  addStandardQuests(s, T0, 8);
  simulate(s, T0 + DAY, 7, 1); // perfect placement
  assert.equal(s.ranked.placed, true, 'placed after 7 days');
  const b = s.ranked.placement.result;
  assert.ok(b.rating <= 930, `placement rating ${b.rating} capped at Platinum I`);
  const tiers = tiersOf(s);
  assert.ok(s.ranked.tier < tiers.findIndex((t) => t.major === 'diamond'), 'cannot place into Diamond+');
  assert.ok(s.ranked.history.some((e) => e.type === 'placement'));
});

test('low-effort placement places low', () => {
  const s = freshState();
  addStandardQuests(s, T0, 2, { durationMin: 3, difficulty: 'easy' });
  simulate(s, T0 + DAY, 7, 0.5);
  assert.equal(s.ranked.placed, true);
  assert.ok(s.ranked.rating <= 250, `rating ${s.ranked.rating} should be capped for low activity`);
});

test('SR anti-grind: new quests do not count, a day cannot farm unlimited SR', () => {
  const s = freshState();
  addStandardQuests(s, T0, 8);
  let now = simulate(s, T0 + DAY, 7, 1);
  assert.equal(s.ranked.placed, true);
  const fresh = createQuest(s, { title: 'Brand new', category: 'growth', durationMin: 60, difficulty: 'epic' }, now);
  const r = completeQuest(s, fresh.quest.id, { now });
  assert.ok(r.completion.xp > 0, 'XP still awarded');
  assert.equal(r.completion.sr, 4, 'epic quest gives 4 SR immediately');
  assert.equal(r.completion.match, 0, 'not part of the match today');
  // 20 extra epic quests, all done: the day's SR is bounded by the rank's max gain.
  addStandardQuests(s, now - 2 * DAY, 20, { difficulty: 'epic', durationMin: 60 });
  now += DAY;
  runSettlement(s, now);
  for (const x of todayView(s, now).daily) completeQuest(s, x.q.id, { now });
  const today = dayKey(now, s.settings);
  now += DAY;
  runSettlement(s, now);
  const rec = s.days[today];
  assert.ok(rec.srApplied <= 30 + 4, `day SR ${rec.srApplied} bounded by max match gain`);
  assert.ok(rec.srApplied > 0, 'perfect day gains');
});
test('self-reported quests are capped by length; required checks reduce credit', () => {
  const s = freshState();
  const short = createQuest(s, { title: 'Brush teeth', category: 'care', durationMin: 2, difficulty: 'epic' }, T0).quest;
  const vid = createQuest(s, { title: 'Push-ups', category: 'fitness', durationMin: 10, difficulty: 'medium', verification: 'video' }, T0).quest;
  const timed = createQuest(s, { title: 'Study', category: 'study', durationMin: 30, difficulty: 'medium', verification: 'timer' }, T0).quest;
  addStandardQuests(s, T0, 6);
  let now = simulate(s, T0 + DAY, 7, 1, { complete: { verified: true, timed: true } });
  assert.equal(s.ranked.placed, true);
  now += DAY;
  runSettlement(s, now);
  const a = completeQuest(s, short.id, { now });
  assert.equal(a.completion.eff, 0, 'epic 2-minute task counted as easy');
  const v = completeQuest(s, vid.id, { now });
  assert.equal(v.completion.credit, 0.5, 'half match credit without evidence');
  assert.equal(v.completion.sr, 1, 'half quest SR without evidence, no verification bonus');
  const t = completeQuest(s, timed.id, { now });
  assert.equal(t.completion.credit, 0.75);
  assert.ok(t.completion.lines.some((l) => l.includes('Timer not used')));
  const before = s.ranked.rating;
  const vq = createQuest(s, { title: 'Verified pushups', category: 'fitness', durationMin: 10, difficulty: 'medium', verification: 'video' }, now - 3 * DAY).quest;
  const vv = completeQuest(s, vq.id, { now, verified: true });
  assert.equal(vv.completion.credit, 1);
  assert.ok(vv.completion.sr >= 2, 'verified bonus SR');
  assert.equal(s.ranked.rating, before + vv.completion.sr);
});
test('missing one task does not cost rating; a bad day does', () => {
  const s = freshState();
  addStandardQuests(s, T0, 8);
  let now = simulate(s, T0 + DAY, 7, 1);
  const before = s.ranked.rating;
  now = simulate(s, now, 1, 7 / 8); // one missed
  const d1 = s.days[dayKey(now - DAY, s.settings)];
  assert.ok(d1.srApplied >= 0, `one miss should not penalise (got ${d1.srApplied})`);
  const mid = s.ranked.rating;
  assert.ok(mid >= before);
  now = simulate(s, now, 1, 0.125); // terrible day
  const d2 = s.days[dayKey(now - DAY, s.settings)];
  assert.ok(d2.srApplied < 0, 'bad day loses SR');
});

test('excusing a day refunds its penalty', () => {
  const s = freshState();
  addStandardQuests(s, T0, 8);
  let now = simulate(s, T0 + DAY, 7, 1);
  now = simulate(s, now, 1, 0); // opened app, did nothing
  const day = dayKey(now - DAY, s.settings);
  const lost = s.days[day].srApplied;
  assert.ok(lost < 0);
  const before = s.ranked.rating;
  const r = declareDay(s, day, 'excused', now, 'sick');
  assert.ok(r.ok, r.reason);
  assert.equal(s.days[day].srApplied, 0);
  assert.equal(s.ranked.rating, before - lost);
});

test('promotion and demotion with buffer and protection', () => {
  const s = freshState();
  addStandardQuests(s, T0, 8);
  let now = simulate(s, T0 + DAY, 7, 1);
  const tiers = tiersOf(s);
  // Promotion inside Bronze/Silver (no requirements) through a winning day.
  s.ranked.rating = tiers[4].min - 5; // just below Silver I
  s.ranked.tier = 3;
  const evs = [];
  now = simulate(s, now, 1, 1);
  assert.ok(s.ranked.history.some((e) => e.type === 'promotion' && e.to >= 4), 'promoted after a winning day');
  assert.ok(s.ranked.tier >= 4);
  const today = dayKey(now, s.settings);
  // Demotion: drop well below Silver I minus buffer after protection expires.
  s.ranked.tier = 4;
  s.ranked.rating = tiers[4].min - 30;
  s.ranked.lastPromotionDay = addDays(today, -10);
  const ev = evaluateRank(s, today, now);
  assert.ok(ev.some((e) => e.type === 'demotion'), 'demoted');
  assert.ok(s.ranked.tier < 4);
  // Within buffer → no demotion.
  s.ranked.tier = 4;
  s.ranked.rating = tiers[4].min - 10;
  assert.equal(evaluateRank(s, today, now).length, 0, 'buffer prevents demotion');
  // Protected right after promotion.
  s.ranked.rating = tiers[4].min - 100;
  s.ranked.lastPromotionDay = today;
  assert.equal(evaluateRank(s, today, now).length, 0, 'protection prevents demotion');
  assert.ok(evs);
});
test('higher ranks are locked behind requirements', () => {
  const s = freshState();
  addStandardQuests(s, T0, 8);
  const now = simulate(s, T0 + DAY, 7, 1);
  const tiers = tiersOf(s);
  const unreal = tiers.findIndex((t) => t.major === 'unreal');
  const st = requirementStatus(s, unreal, dayKey(now, s.settings));
  assert.equal(st.ok, false, 'Unreal not available after one week');
  // Rating can't run away past a locked threshold.
  s.ranked.rating = tiers[unreal].min + 500;
  s.ranked.tier = tiers.findIndex((t) => t.major === 'champion');
  const q = createQuest(s, { title: 'Grind', category: 'growth', type: 'once', durationMin: 60, difficulty: 'epic' }, now - 3 * DAY).quest;
  completeQuest(s, q.id, { now });
  assert.ok(s.ranked.rating <= tiers[unreal].min + 500, 'no runaway');
  assert.equal(s.ranked.tier, tiers.findIndex((t) => t.major === 'champion'), 'still Champion');
});

test('weekly quests count once per day and reward on target', () => {
  const s = freshState();
  const q = createQuest(s, { title: 'Backtest', category: 'trading', type: 'weekly', target: 2, durationMin: 45, difficulty: 'hard' }, T0).quest;
  const r1 = completeQuest(s, q.id, { now: T0 + DAY });
  assert.ok(r1.ok);
  assert.equal(completeQuest(s, q.id, { now: T0 + DAY + 1000 }).ok, false, 'once per day');
  const r2 = completeQuest(s, q.id, { now: T0 + 2 * DAY });
  assert.ok(r2.ok && r2.completion.final);
  assert.equal(completeQuest(s, q.id, { now: T0 + 3 * DAY }).ok, false, 'target reached this week');
});

test('paused and deleted quests are not due; history survives deletion', () => {
  const s = freshState();
  const [a, b] = addStandardQuests(s, T0, 2);
  completeQuest(s, b, { now: T0 });
  const t1 = T0 + DAY;
  runSettlement(s, t1);
  setPaused(s, a, true, t1);
  deleteQuest(s, b, t1);
  assert.equal(computeDay(s, dayKey(t1 + DAY, s.settings)).due.length, 0);
  assert.equal(s.completions.length, 1);
});

test('streak counts secured days and survives rest days', () => {
  const s = freshState();
  addStandardQuests(s, T0, 4);
  let now = simulate(s, T0 + DAY, 3, 1);
  const tomorrow = dayKey(now, s.settings);
  declareDay(s, tomorrow, 'rest', now);
  now = simulate(s, now, 1, 0);
  now = simulate(s, now, 1, 1);
  const today = dayKey(now, s.settings);
  assert.equal(streakAsOf(s, addDays(today, -1), today), 4, 'rest day froze the streak');
});

test('long-term goals complete once', () => {
  const s = freshState();
  const g = createQuest(s, { title: 'Read 12 books', category: 'growth', type: 'goal', goal: { target: 12, unit: 'books', current: 0 } }, T0).quest;
  assert.ok(updateGoal(s, g.id, 5, T0 + DAY).ok);
  const r = updateGoal(s, g.id, 12, T0 + 2 * DAY);
  assert.ok(r.completed && r.completed.ok);
  assert.equal(updateGoal(s, g.id, 13, T0 + 3 * DAY).ok, false);
});

test('corrupted data is repaired, not crashed on', () => {
  const s = migrate({ schemaVersion: 1, quests: [{ id: 'x' }, { id: 'q1', title: 'ok' }], completions: 'oops', ranked: { rating: 'NaN' } }, T0);
  assert.equal(s.quests.length, 1);
  assert.deepEqual(s.completions, []);
  assert.equal(s.ranked.rating, 0);
  assert.throws(() => migrate({ schemaVersion: 99 }, T0));
  const n = normalize(JSON.parse(JSON.stringify(freshState())), T0);
  assert.equal(n.onboarded, true);
});

test('XP-only quests now also award SR immediately, without double-counting ranked quests', () => {
  const s = freshState();
  const [qid] = addStandardQuests(s, T0, 8);
  const weekly = createQuest(s, { title: 'Backtest', category: 'trading', type: 'weekly', target: 1, durationMin: 45, difficulty: 'hard' }, T0).quest;
  let now = simulate(s, T0 + DAY, 7, 1);
  assert.equal(s.ranked.placed, true);
  const banked = s.ranked.placement.result.questSr;
  assert.ok(banked > 0, 'quest SR earned during placement was kept');
  assert.equal(s.ranked.rating, s.ranked.placement.result.rating + banked);
  now += 3 * DAY;
  runSettlement(s, now);
  // Daily (previously XP-only) quest: XP and SR at once, rating moves immediately.
  const before = s.ranked.rating;
  const xp0 = s.xp.total;
  const r = completeQuest(s, qid, { now });
  assert.ok(r.completion.xp > 0 && r.completion.sr === 2, 'daily medium quest: XP + 2 SR');
  assert.equal(s.ranked.rating, before + 2);
  assert.equal(s.xp.total, xp0 + r.completion.xp);
  // Repeating it is blocked: no extra XP or SR.
  assert.equal(completeQuest(s, qid, { now: now + 1000 }).ok, false);
  assert.equal(s.ranked.rating, before + 2);
  // Weekly target already gives its own SR: it does NOT also get quest SR.
  const w = completeQuest(s, weekly.id, { now });
  assert.equal(w.completion.sr, 6, 'weekly target keeps its existing SR (3 × 2), not doubled');
  assert.equal(w.completion.questSr, 0);
});

test('quest SR has a daily cap so new quests cannot farm it', () => {
  const s = freshState();
  const now = T0 + 2 * DAY;
  let total = 0;
  for (let i = 0; i < 30; i++) {
    const q = createQuest(s, { title: 'Spam ' + i, category: 'growth', durationMin: 60, difficulty: 'epic' }, now).quest;
    total += completeQuest(s, q.id, { now }).completion.questSr;
  }
  assert.equal(total, 40, 'capped at 40 quest SR per day');
});
