import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, startAccount } from '../js/core/state.js';
import { applySetup, buildSuggestions, ensureFitnessRoutines, ensureCareRoutines, openSuggestions } from '../js/engine/suggest.js';
import { nextAlarm, ringingAlarms, alarmPhase, buildICS, currentOccurrence, isOnTime } from '../js/engine/alarms.js';

const T0 = Date.UTC(2026, 9, 5, 12, 0, 0);

test('onboarding setup builds personalised quests, routines and the push-up alarm', () => {
  const s = defaultState(T0);
  s.settings.timeZone = 'UTC';
  s.profile.name = 'Tester';
  s.profile.focusAreas = ['fitness', 'care', 'study', 'trading'];
  s.profile.fitness.equipment = ['none', 'bar'];
  s.profile.fitness.experience = 'beginner';
  s.profile.trading.level = 'learning';
  s.school.subjects.push({ id: 'sub1', name: 'Math', priority: 'high', color: '#fff' });
  startAccount(s, T0);
  ensureFitnessRoutines(s, T0);
  ensureCareRoutines(s, T0);
  const sug = buildSuggestions(s);
  assert.ok(sug.some((x) => x.key === 'alarm:pushup'));
  assert.ok(sug.some((x) => x.key === 'study:subject:sub1'), 'subject-specific suggestion');
  assert.ok(sug.some((x) => x.cat === 'trading'));
  const keys = sug.filter((x) => x.selected).map((x) => x.key);
  const made = applySetup(s, keys, T0);
  assert.equal(made.length, keys.length);
  assert.equal(s.alarms.length, 1, 'push-up alarm created');
  const pq = s.quests.find((q) => q.linked && q.linked.kind === 'alarm');
  assert.equal(s.alarms[0].questId, pq.id);
  assert.ok(s.fitness.routines.some((r) => r.exercises.some((e) => e.exId === 'dead-hang' || e.exId === 'australian-row')), 'bar routine');
  assert.ok(s.care.routines.length >= 6);
  assert.equal(openSuggestions(s).filter((x) => keys.includes(x.key)).length, 0, 'added suggestions disappear');
});

test('alarm rings in its window, and builds a calendar file', () => {
  const s = defaultState(T0);
  s.settings.timeZone = 'UTC';
  s.alarms.push({ id: 'a1', kind: 'pushup', label: 'Push', time: '06:30', days: [0, 1, 2, 3, 4, 5, 6], enabled: true, graceMin: 30, reminderEveryMin: 5, reminderRepeats: 2, challenge: { pushups: 20, situps: 0 } });
  const at = Date.UTC(2026, 9, 6, 6, 31);
  assert.equal(alarmPhase(s, s.alarms[0], Date.UTC(2026, 9, 6, 6, 0)), 'upcoming');
  assert.equal(ringingAlarms(s, at).length, 1);
  assert.equal(alarmPhase(s, s.alarms[0], Date.UTC(2026, 9, 6, 7, 30)), 'missed');
  const n = nextAlarm(s, Date.UTC(2026, 9, 6, 7, 0));
  assert.equal(n.date, '2026-10-07');
  const occ = currentOccurrence(s, s.alarms[0], at);
  assert.equal(occ.date, '2026-10-06');
  assert.ok(isOnTime(s, s.alarms[0], '2026-10-06', at));
  assert.ok(!isOnTime(s, s.alarms[0], '2026-10-06', Date.UTC(2026, 9, 6, 8, 0)));
  const ics = buildICS(s.alarms, { appUrl: 'https://x.test/', now: T0, startDate: '2026-10-06' });
  assert.ok(ics.includes('RRULE:FREQ=WEEKLY;BYDAY=SU,MO,TU,WE,TH,FR,SA'));
  assert.ok(ics.includes('DTSTART:20261006T063000'));
});

test('weekly review produces stats and data-driven recommendations', async () => {
  const { weekStats } = await import('../js/engine/review.js');
  const { createQuest, completeQuest, todayView } = await import('../js/engine/quests.js');
  const { runSettlement } = await import('../js/engine/ranked.js');
  const { dayKey } = await import('../js/core/dates.js');
  const s = defaultState(T0);
  s.settings.timeZone = 'UTC';
  startAccount(s, T0);
  const DAY = 86400000;
  createQuest(s, { title: 'Easy one', category: 'study', durationMin: 20, difficulty: 'medium', time: '08:00' }, T0);
  createQuest(s, { title: 'Never done', category: 'fitness', durationMin: 30, difficulty: 'hard', time: '22:00' }, T0);
  for (let d = 1; d <= 6; d++) {
    const now = T0 + d * DAY;
    runSettlement(s, now);
    const q = todayView(s, now).daily.find((x) => x.q.title === 'Easy one');
    completeQuest(s, q.q.id, { now });
  }
  const now = T0 + 7 * DAY;
  runSettlement(s, now);
  const st = weekStats(s, '2026-10-05', dayKey(now, s.settings));
  assert.equal(st.doneCount, 6);
  assert.ok(st.missedCount >= 6);
  assert.ok(st.recommendations.some((r) => r.text.includes('Never done')), 'flags the quest that is never completed');
  assert.equal(st.strongest.id, 'study');
});
