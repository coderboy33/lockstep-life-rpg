// App-level actions: wrap engine calls with saving + feedback (reward pops, celebrations).

import { store } from '../core/store.js';
import { clock, dayKey } from '../core/dates.js';
import { uid, cleanText, toInt } from '../core/util.js';
import { completeQuest, undoCompletion, triggerLinked, grantActivityXp, updateGoal } from '../engine/quests.js';
import { tiersOf } from '../engine/ranked.js';
import { checkAchievements, updateRecords } from '../engine/progress.js';
import { rewardPop, toast, celebrate } from '../ui/overlay.js';
import { emblem } from '../ui/emblem.js';
import { h } from '../ui/dom.js';
import { successSound, chime } from './audio.js';
import { whenUnlocked } from '../core/session.js';

// ---------- feedback ----------

const celebrateQueue = [];
let celebrating = false;

async function drainCelebrations() {
  if (celebrating) return;
  celebrating = true;
  await whenUnlocked();
  while (celebrateQueue.length) await celebrate(celebrateQueue.shift());
  celebrating = false;
}

export function showRankEvents(events = []) {
  const s = store.state;
  const tiers = tiersOf(s);
  for (const ev of events) {
    if (!ev || !['promotion', 'demotion', 'placement'].includes(ev.type)) continue;
    if (ev.ts && ev.ts <= (s.meta.seenRankEventTs || 0)) continue;
    const t = tiers[ev.to];
    if (ev.type === 'promotion')
      celebrateQueue.push({ kicker: 'Promoted', title: t.name, sub: `You climbed to ${t.name} with ${ev.rating} SR. Keep the standard.`, visual: emblem(t, 150, { animate: true }), tone: 'up' });
    if (ev.type === 'placement')
      celebrateQueue.push({ kicker: 'Placement complete', title: t.name, sub: `Your first 7 days placed you at ${ev.rating} SR. Now the climb begins.`, visual: emblem(t, 150, { animate: true }), tone: 'up' });
    if (ev.type === 'demotion')
      celebrateQueue.push({ kicker: 'Demoted', title: t.name, sub: `Your rating fell below the line. A few solid days will win it back — this isn’t a punishment, it’s feedback.`, visual: emblem(t, 120), tone: 'down', cta: 'Got it' });
    store.update((st) => (st.meta.seenRankEventTs = Math.max(st.meta.seenRankEventTs || 0, ev.ts || 0)), { render: false });
  }
  drainCelebrations();
}

export function showAchievements(list = []) {
  for (const a of list) {
    celebrateQueue.push({ kicker: 'Achievement unlocked', title: a.name, sub: a.desc, visual: h('div.ach-big', h('span', '🏆')), tone: 'up', cta: 'Nice' });
  }
  drainCelebrations();
}

function feedback(results) {
  const list = (Array.isArray(results) ? results : [results]).filter((r) => r && r.ok);
  if (!list.length) return;
  let xp = 0;
  let sr = 0;
  let match = 0;
  const events = [];
  const ach = [];
  for (const r of list) {
    if (r.completion) {
      xp += r.completion.xp;
      sr += r.completion.sr;
      match += r.completion.match || 0;
    }
    events.push(...(r.events || []));
    ach.push(...(r.achievements || []));
  }
  successSound();
  rewardPop({ xp, sr, match, note: list.length > 1 ? `${list.length} quests` : '' });
  showRankEvents(events);
  showAchievements(ach);
}

// ---------- quests ----------

export function completeQuestAction(qid, opts = {}) {
  const now = clock.now();
  const res = store.update((s) => completeQuest(s, qid, { now, ...opts }));
  if (!res.ok) toast(res.reason, { type: 'error' });
  else feedback(res);
  return res;
}

export function undoAction(cid) {
  const now = clock.now();
  const res = store.update((s) => undoCompletion(s, cid, now));
  if (!res.ok) toast(res.reason, { type: 'error' });
  else toast(`Undone — ${res.completion.xp} XP${res.completion.sr ? ` and ${res.completion.sr} SR` : ''} removed.`);
  return res;
}

export function goalProgressAction(qid, value) {
  const now = clock.now();
  const res = store.update((s) => updateGoal(s, qid, value, now));
  if (!res.ok) return toast(res.reason, { type: 'error' });
  if (res.completed) feedback(res.completed);
  else {
    chime();
    if (res.xp) rewardPop({ xp: res.xp, note: 'Goal progress' });
    else toast('Progress saved.');
  }
}

/** Activity happened (workout, routine, journal…): give activity XP and auto-complete linked quests. */
export function activityAction(kind, payload, xpSource, cat, extra = {}) {
  const now = clock.now();
  const out = store.update((s) => {
    const xp = xpSource ? grantActivityXp(s, xpSource, cat, now, payload && payload.ref) : 0;
    const results = triggerLinked(s, kind, payload, now, extra);
    updateRecords(s, now);
    const achievements = checkAchievements(s, now);
    return { xp, results, achievements };
  });
  if (out.results.length) {
    feedback(out.results);
    if (out.xp) setTimeout(() => rewardPop({ xp: out.xp, note: 'Activity' }), 900);
  } else if (out.xp) {
    chime();
    rewardPop({ xp: out.xp, note: 'Activity logged' });
  }
  showAchievements(out.achievements);
  return out;
}

// ---------- focus timer (survives refresh/backgrounding; based on timestamps) ----------

export function timerInfo(t, now = clock.now()) {
  if (!t) return null;
  const elapsed = t.accumMs + (t.pausedAt ? 0 : Math.max(0, now - t.startedAt));
  return { elapsed, remaining: Math.max(0, t.durationMs - elapsed), running: !t.pausedAt, done: elapsed >= t.durationMs };
}

export function startFocus({ subjectId = null, questId = null, workMin = 25, breakMin = 5, cycles = 1, label = 'Focus' }) {
  const now = clock.now();
  store.update((s) => {
    s.timer = {
      id: uid('t'),
      kind: 'focus',
      label: cleanText(label, 60) || 'Focus',
      subjectId,
      questId,
      workMin: toInt(workMin, 25, 1, 240),
      breakMin: toInt(breakMin, 5, 0, 60),
      cycles: toInt(cycles, 1, 1, 8),
      cycle: 1,
      mode: 'work',
      startedAt: now,
      pausedAt: null,
      accumMs: 0,
      durationMs: toInt(workMin, 25, 1, 240) * 60000,
      loggedMin: 0,
    };
  });
}

export function pauseFocus() {
  const now = clock.now();
  store.update((s) => {
    const t = s.timer;
    if (!t || t.pausedAt) return;
    t.accumMs += now - t.startedAt;
    t.pausedAt = now;
  });
}

export function resumeFocus() {
  const now = clock.now();
  store.update((s) => {
    const t = s.timer;
    if (!t || !t.pausedAt) return;
    t.startedAt = now;
    t.pausedAt = null;
  });
}

function logSession(s, minutes, ts, subjectId, note = '') {
  const day = dayKey(ts, s.settings);
  const sess = { id: uid('ss'), subjectId: subjectId || null, minutes, ts, day, mode: 'focus', note };
  s.school.sessions.push(sess);
  const cat = subjectId ? 'study' : 'productivity';
  grantActivityXp(s, 'study', cat, ts, sess.id, Math.round(minutes / 5));
  return sess;
}

/** Stop early. If ≥ 5 minutes of focus happened, it's logged as a partial session. */
export function stopFocus(log = true) {
  const now = clock.now();
  let logged = 0;
  const res = store.update((s) => {
    const t = s.timer;
    if (!t) return null;
    const info = timerInfo(t, now);
    if (log && t.mode === 'work') {
      const mins = Math.floor(info.elapsed / 60000);
      if (mins >= 5) {
        logSession(s, mins, now, t.subjectId, 'partial');
        logged = mins;
      }
    }
    s.timer = null;
    return logged ? triggerLinked(s, 'focus', { id: t.subjectId }, now) : [];
  });
  if (logged) {
    toast(`Logged ${logged} focused minutes.`, { type: 'success' });
    if (res && res.length) feedback(res);
  }
  return logged;
}

/** Called by the app tick. Advances phases that have ended (even while the app was closed). */
export function advanceFocus() {
  const s0 = store.state;
  if (!s0.timer || s0.timer.pausedAt) return null;
  const now = clock.now();
  if (!timerInfo(s0.timer, now).done) return null;
  const out = store.update((s) => {
    const results = [];
    const phases = [];
    let guard = 0;
    while (s.timer && !s.timer.pausedAt && timerInfo(s.timer, now).done && guard++ < 20) {
      const t = s.timer;
      const endTs = t.startedAt + (t.durationMs - t.accumMs);
      if (t.mode === 'work') {
        logSession(s, t.workMin, endTs, t.subjectId);
        t.loggedMin += t.workMin;
        results.push(...triggerLinked(s, 'focus', { id: t.subjectId }, now));
        phases.push('work');
        if (t.cycle >= t.cycles || !t.breakMin) {
          if (t.cycle >= t.cycles) {
            s.timer = null;
            phases.push('finished');
            break;
          }
          Object.assign(t, { cycle: t.cycle + 1, mode: 'work', startedAt: endTs, accumMs: 0, durationMs: t.workMin * 60000 });
        } else Object.assign(t, { mode: 'break', startedAt: endTs, accumMs: 0, durationMs: t.breakMin * 60000 });
      } else {
        phases.push('break');
        Object.assign(t, { cycle: t.cycle + 1, mode: 'work', startedAt: endTs, accumMs: 0, durationMs: t.workMin * 60000 });
      }
    }
    return { results, phases };
  });
  if (out.results.length) feedback(out.results);
  return out;
}

export function logManualStudy(subjectId, minutes, note, dayTs) {
  const ts = dayTs || clock.now();
  const out = store.update((s) => {
    const sess = { id: uid('ss'), subjectId: subjectId || null, minutes: toInt(minutes, 0, 1, 600), ts, day: dayKey(ts, s.settings), mode: 'manual', note: cleanText(note, 200) };
    s.school.sessions.push(sess);
    return grantActivityXp(s, 'study', subjectId ? 'study' : 'productivity', ts, sess.id, Math.round(sess.minutes / 5));
  });
  if (out) rewardPop({ xp: out, note: 'Study logged' });
  else toast('Study session logged.');
}
