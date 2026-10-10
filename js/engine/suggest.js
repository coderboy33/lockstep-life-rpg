// Turns the profile into suggested quests, routines and alarms. Nothing here invents personal
// facts: it only uses what you entered during onboarding / in your profile.

import { uid, clamp } from '../core/util.js';
import { hmToMin, minToHm } from '../core/dates.js';
import { routineTemplates, routineMinutes, available, exerciseById } from '../data/exercises.js';
import { CARE_ROUTINE_TEMPLATES, CARE_STEPS, careStepMinutes } from '../data/care.js';
import { createQuest } from './quests.js';
import { newAlarm } from './alarms.js';

const ALL = [0, 1, 2, 3, 4, 5, 6];
// Care routines switched on by default (others are suggested but start unticked, to avoid overload).
const DEFAULT_CARE = new Set(['skin-am', 'dental-pm', 'face-relax', 'posture-reset']);
const shift = (hm, min) => minToHm((hmToMin(hm) ?? 0) + min);

export const PRODUCTIVITY_GOALS = [
  { id: 'plan', name: 'Plan my day' },
  { id: 'deepwork', name: 'Deep work' },
  { id: 'phone', name: 'Less phone time' },
  { id: 'reading', name: 'Read more' },
  { id: 'journal', name: 'Daily journaling' },
  { id: 'meditate', name: 'Meditation' },
  { id: 'water', name: 'Drink enough water' },
  { id: 'tidy', name: 'Keep my space tidy' },
];

export const GROOMING_ITEMS = [
  { id: 'shower', name: 'Shower' },
  { id: 'hair', name: 'Hair care' },
  { id: 'lips', name: 'Lip care' },
  { id: 'clothes', name: 'Clean clothes' },
  { id: 'deodorant', name: 'Deodorant' },
  { id: 'nails', name: 'Nails (weekly)' },
  { id: 'shave', name: 'Shave / beard (weekly)' },
];

// ---------- routines ----------

export function ensureFitnessRoutines(state, now) {
  const f = state.profile.fitness;
  const have = new Set(state.fitness.routines.map((r) => r.key).filter(Boolean));
  const tpls = routineTemplates(f.experience, f.equipment).map((t) => ({
    ...t,
    exercises: t.exercises.filter((x) => {
      const ex = exerciseById(state, x.exId);
      return ex && available(ex, f.equipment);
    }),
  }));
  const training = tpls.filter((t) => !t.recovery);
  const days = (f.days && f.days.length ? f.days : [1, 3, 5]).slice().sort();
  // Rotate templates across training days (A, B, A, B…).
  const assign = {};
  days.forEach((d, i) => {
    const t = training[i % Math.max(1, training.length)];
    if (t) (assign[t.key] ||= []).push(d);
  });
  for (const t of tpls) {
    if (have.has(t.key)) continue;
    state.fitness.routines.push({
      id: uid('r'),
      key: t.key,
      name: t.name,
      days: t.recovery ? [] : assign[t.key] || [],
      time: f.time || '17:30',
      exercises: t.exercises.map((x) => ({ ...x })),
      recovery: !!t.recovery,
      notes: '',
      createdAt: now,
    });
  }
  return state.fitness.routines;
}

export function ensureCareRoutines(state, now) {
  const p = state.profile;
  const have = new Set(state.care.routines.map((r) => r.key).filter(Boolean));
  const groomIds = new Set(p.care.grooming || []);
  for (const t of CARE_ROUTINE_TEMPLATES) {
    if (have.has(t.key)) continue;
    let steps = t.steps;
    if (t.section === 'groom') {
      const picked = steps.filter((s) => groomIds.has(s));
      if (picked.length) steps = picked;
    }
    const time = t.time || (t.slot === 'am' ? shift(p.wakeTime, 15) : t.slot === 'pm' ? shift(p.bedTime, -40) : null);
    state.care.routines.push({
      id: uid('cr'),
      key: t.key,
      section: t.section,
      name: t.name,
      slot: t.slot,
      time,
      weekly: !!t.weekly,
      steps: steps.map((sid) => ({ ...CARE_STEPS[sid], id: uid('st'), ref: sid, product: '' })),
      createdAt: now,
    });
  }
  return state.care.routines;
}

// ---------- suggestions ----------

function item(key, cat, title, quest, extra = {}) {
  return { key, cat, title, quest: { title, category: cat, ...quest }, ...extra };
}

/** Builds suggestions from the profile. `routines` must exist (call ensure* first). */
export function buildSuggestions(state) {
  const p = state.profile;
  const out = [];
  const focus = new Set(p.focusAreas && p.focusAreas.length ? p.focusAreas : ['school', 'study', 'fitness', 'care', 'discipline', 'productivity', 'sleep']);
  const schoolDays = p.schoolDays && p.schoolDays.length ? p.schoolDays : [1, 2, 3, 4, 5];
  const weekend = ALL.filter((d) => !schoolDays.includes(d));
  const on = (cat) => focus.has(cat);

  // ----- Fitness -----
  for (const r of state.fitness.routines) {
    if (r.recovery || !r.days.length) continue;
    const mins = routineMinutes(state, r);
    out.push(
      item(`workout:${r.key || r.id}`, 'fitness', `Workout: ${r.name}`, {
        days: r.days,
        time: r.time,
        durationMin: mins,
        difficulty: mins >= 45 ? 'epic' : mins >= 25 ? 'hard' : 'medium',
        description: 'Complete the routine in the workout player. Sets, reps and rest are tracked for you.',
        instructions: ['Open the workout and warm up for 3–5 minutes (easy cardio or mobility).', 'Log each set; rest when the timer runs.', 'Use the easier variation whenever form breaks down.', 'Stop if you feel sharp pain.'],
        linked: { kind: 'workout', id: r.id },
      }, { selected: on('fitness') })
    );
  }
  const rec = state.fitness.routines.find((r) => r.recovery);
  if (rec) {
    const trainDays = new Set(state.fitness.routines.flatMap((r) => r.days));
    const rest = ALL.filter((d) => !trainDays.has(d));
    if (rest.length)
      out.push(
        item('workout:recovery', 'fitness', 'Recovery & mobility', {
          days: rest,
          time: p.fitness.time,
          durationMin: routineMinutes(state, rec),
          difficulty: 'medium',
          description: 'Gentle mobility and a walk on non-training days. Recovery is part of training.',
          linked: { kind: 'workout', id: rec.id },
        }, { selected: false })
      );
  }
  const reps = clamp(Math.round((p.fitness.pushupMax || 10) * 0.6), 3, 60);
  out.push(
    item('alarm:pushup', 'fitness', 'Morning push-up challenge', {
      days: ALL,
      time: shift(p.wakeTime, 5),
      durationMin: Math.max(5, Math.ceil((reps * 4) / 60) + 3),
      difficulty: reps >= 40 ? 'hard' : 'medium',
      description: `Your alarm rings and you complete ${reps} push-ups before starting your day.`,
      instructions: ['When the alarm rings, tap START CHALLENGE.', 'Pick a counting method (camera, nose-tap, or manual).', `Complete ${reps} push-ups with good form — knee push-ups count if you need them.`, 'Submit your result.'],
    }, { selected: true, alarm: { kind: 'pushup', label: 'Morning Push-Up Challenge', time: shift(p.wakeTime, 5), days: ALL, challenge: { pushups: reps, situps: 0, requireVideo: false } } })
  );

  // ----- Self-care -----
  for (const r of state.care.routines) {
    const mins = careStepMinutes(r.steps);
    const sectionOn = r.section === 'face' ? p.care.faceRelax : r.section === 'posture' ? p.care.posture : true;
    out.push(
      item(`care:${r.key || r.id}`, 'care', r.name, {
        type: r.weekly ? 'weekly' : 'daily',
        target: 1,
        days: r.weekly ? [] : ALL,
        time: r.time,
        durationMin: mins,
        difficulty: mins >= 5 ? 'medium' : 'easy',
        description: r.section === 'face' ? 'Gentle relaxation for face and jaw tension. Not a reshaping program.' : `Your ${r.name.toLowerCase()} routine, step by step.`,
        linked: { kind: 'care', id: r.id },
      }, { selected: on('care') && sectionOn && !r.weekly && DEFAULT_CARE.has(r.key) })
    );
  }

  // ----- School & studying -----
  const studyMin = clamp(p.studyMinutesPerDay || 45, 15, 180);
  out.push(
    item('study:block', 'study', 'Deep study block', {
      days: schoolDays,
      time: p.studyTime,
      durationMin: Math.min(studyMin, 90),
      difficulty: studyMin >= 45 ? 'hard' : 'medium',
      verification: 'timer',
      description: `Focus for ${Math.min(studyMin, 90)} minutes with the built-in focus timer (breaks included).`,
      instructions: ['Pick the subject with the nearest deadline.', 'Phone on Do Not Disturb, out of reach.', 'Start the focus timer and work until it ends.', 'Write one line about what you finished.'],
      linked: { kind: 'focus', minutes: Math.min(studyMin, 90) },
    }, { selected: on('study') || on('school') })
  );
  if (weekend.length)
    out.push(
      item('study:weekend', 'study', 'Weekend revision', {
        days: weekend,
        time: '11:00',
        durationMin: 45,
        difficulty: 'hard',
        verification: 'timer',
        description: 'Review the week’s material and get ahead on upcoming tests.',
        linked: { kind: 'focus', minutes: 45 },
      }, { selected: false })
    );
  out.push(
    item('school:notes', 'school', 'Review today’s class notes', {
      days: schoolDays,
      time: shift(p.schoolEnd || '15:00', 60),
      durationMin: 15,
      difficulty: 'medium',
      description: 'Skim and tidy today’s notes, write 3 key points and any questions to ask.',
    }, { selected: on('school') })
  );
  out.push(
    item('school:planner', 'school', 'Check deadlines & planner', {
      days: schoolDays,
      time: shift(p.schoolEnd || '15:00', 30),
      durationMin: 5,
      difficulty: 'medium',
      description: 'Open School → Deadlines. Add anything new from today and pick tomorrow’s priority.',
    }, { selected: on('school') })
  );
  for (const sub of state.school.subjects.filter((s) => s.priority === 'high').slice(0, 3)) {
    out.push(
      item(`study:subject:${sub.id}`, 'study', `Revise ${sub.name}`, {
        type: 'weekly',
        target: 2,
        durationMin: 30,
        difficulty: 'hard',
        verification: 'timer',
        description: `Two focused ${sub.name} sessions this week (30 min each).`,
        linked: { kind: 'focus', id: sub.id, minutes: 30 },
      }, { selected: on('study') || on('school') })
    );
  }

  // ----- Discipline / productivity / growth -----
  const goals = new Set(p.productivity.goals || []);
  out.push(item('disc:plan', 'discipline', 'Plan tomorrow', { days: ALL, time: shift(p.bedTime, -60), durationMin: 5, difficulty: 'medium', description: 'Write tomorrow’s top 3 priorities and check your schedule and alarms.' }, { selected: true }));
  if (goals.has('phone') || on('discipline'))
    out.push(item('disc:phone', 'discipline', 'No phone for 30 min after waking', { days: ALL, time: shift(p.wakeTime, 30), durationMin: 30, difficulty: 'medium', description: 'Get up, move, wash, eat — before opening social apps. (This app is allowed for your challenge.)' }, { selected: goals.has('phone') }));
  if (goals.has('deepwork'))
    out.push(item('prod:deep', 'productivity', 'Deep work block', { days: schoolDays, durationMin: 60, difficulty: 'epic', verification: 'timer', description: '60 minutes of single-task focus on your most important work.', linked: { kind: 'focus', minutes: 60 } }, { selected: true }));
  if (goals.has('tidy')) out.push(item('prod:tidy', 'productivity', 'Reset your space', { days: ALL, durationMin: 10, difficulty: 'medium', description: 'Clear desk, make bed, put things back. 10 minutes max.' }, { selected: true }));
  if (goals.has('water')) out.push(item('disc:water', 'discipline', 'Drink water through the day', { days: ALL, durationMin: 1, difficulty: 'easy', description: 'Keep a bottle with you and refill it. Tick when you’ve had a reasonable amount for you.' }, { selected: true }));
  if (goals.has('reading')) out.push(item('growth:read', 'growth', 'Read for 20 minutes', { days: ALL, durationMin: 20, difficulty: 'hard', description: 'Any book that helps you grow. Note one idea worth keeping.' }, { selected: true }));
  if (goals.has('journal')) out.push(item('growth:journal', 'growth', 'Evening reflection', { days: ALL, time: shift(p.bedTime, -30), durationMin: 10, difficulty: 'medium', description: 'Write: one win, one lesson, one thing to improve tomorrow.' }, { selected: true }));
  if (goals.has('meditate')) out.push(item('growth:meditate', 'growth', 'Meditate', { days: ALL, durationMin: 10, difficulty: 'medium', description: 'Sit comfortably and follow your breath for 10 minutes. Wandering is normal — gently return.' }, { selected: true }));
  out.push(item('growth:review', 'growth', 'Weekly review', { type: 'weekly', target: 1, durationMin: 15, difficulty: 'hard', description: 'Open Me → Weekly review, read your stats and adjust next week’s plan.', linked: { kind: 'review' } }, { selected: true }));

  // ----- Sleep & routines -----
  out.push(item('sleep:log', 'sleep', 'Log last night’s sleep', { days: ALL, time: shift(p.wakeTime, 20), durationMin: 1, difficulty: 'easy', description: 'Record bedtime, wake time and how rested you feel.', linked: { kind: 'sleep' } }, { selected: on('sleep') }));
  out.push(item('sleep:screens', 'sleep', 'Screens off before bed', { days: ALL, time: shift(p.bedTime, -30), durationMin: 30, difficulty: 'medium', description: `Put screens away by ${shift(p.bedTime, -30)} and wind down (read, stretch, prep for tomorrow).` }, { selected: on('sleep') }));
  out.push(item('sleep:lights', 'sleep', `Lights out by ${p.bedTime}`, { days: ALL, time: p.bedTime, durationMin: 5, difficulty: 'medium', description: 'Tick this before you sleep if you were in bed with lights off on time.' }, { selected: on('sleep') }));

  // ----- Trading education -----
  const t = p.trading;
  if (t.level && t.level !== 'none') {
    out.push(item('trade:journal', 'trading', 'Trading journal entries', { type: 'weekly', target: clamp(t.journalPerWeek || 3, 1, 7), durationMin: 20, difficulty: 'hard', description: 'Journal practice trades, backtests or market ideas with the full checklist. Process over profit.', linked: { kind: 'journal' } }, { selected: on('trading') }));
    out.push(item('trade:backtest', 'trading', 'Backtesting session', { type: 'weekly', target: clamp(t.backtestPerWeek || 1, 1, 7), durationMin: 45, difficulty: 'hard', description: 'Test one written strategy on historical data and journal each result with mode “Backtest”.', linked: { kind: 'journal', mode: 'backtest' } }, { selected: on('trading') }));
    out.push(item('trade:lesson', 'trading', 'Risk-management lesson', { type: 'weekly', target: 1, durationMin: 10, difficulty: 'medium', description: 'Study one lesson in Grind → Trading → Lessons and practise the calculator.' }, { selected: on('trading') }));
    out.push(item('trade:review', 'trading', 'Weekly trade review', { type: 'weekly', target: 1, durationMin: 30, difficulty: 'hard', description: 'Read this week’s journal: repeated mistakes, best setups, and one rule to improve.' }, { selected: on('trading') }));
  }

  // ----- Business -----
  for (const proj of state.business.projects.filter((x) => x.status !== 'done')) {
    out.push(item(`biz:ship:${proj.id}`, 'business', `Ship one task: ${proj.name}`, { days: schoolDays, durationMin: 45, difficulty: 'hard', description: `Finish one meaningful task on ${proj.name} and mark it done in the project.`, linked: { kind: 'project', id: proj.id } }, { selected: on('business') }));
    out.push(item(`biz:objectives:${proj.id}`, 'business', `Set weekly objectives: ${proj.name}`, { type: 'weekly', target: 1, durationMin: 15, difficulty: 'medium', description: 'Write 1–3 concrete outcomes for this week in the project page.' }, { selected: on('business') }));
  }

  return out;
}

/** Suggestions that aren't already active quests. */
export function openSuggestions(state) {
  const have = new Set(state.quests.filter((q) => !q.archived && q.suggestKey).map((q) => q.suggestKey));
  return buildSuggestions(state).filter((s) => !have.has(s.key));
}

/** Creates the quest (and alarm, if any) for a suggestion. */
export function addSuggestion(state, s, now, opts = {}) {
  const res = createQuest(state, { ...s.quest, createdDay: opts.createdDay }, now, 'suggested');
  if (!res.ok) return res;
  res.quest.suggestKey = s.key;
  if (s.alarm) {
    const a = newAlarm({ ...s.alarm, partOfDaily: true }, now);
    if (a.ok) {
      a.alarm.questId = res.quest.id;
      res.quest.linked = { kind: 'alarm', id: a.alarm.id };
      res.quest.days = a.alarm.days;
      if (a.alarm.challenge && a.alarm.challenge.requireVideo) res.quest.verification = 'video';
      state.alarms.push(a.alarm);
    }
  }
  return res;
}

/** Called when onboarding finishes. */
export function applySetup(state, selectedKeys, now) {
  ensureFitnessRoutines(state, now);
  ensureCareRoutines(state, now);
  const keys = new Set(selectedKeys);
  const created = [];
  for (const s of buildSuggestions(state)) {
    if (!keys.has(s.key)) continue;
    const r = addSuggestion(state, s, now);
    if (r.ok) created.push(r.quest);
  }
  return created;
}
