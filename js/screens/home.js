// Home: daily command center.

import { store } from '../core/store.js';
import { clock, dayKey, greeting, fmtTime, weekday, relDay, fmtDay, minuteOfDay, hmToMin } from '../core/dates.js';
import { catOf } from '../core/config.js';
import { fmtNum, fmtDuration, uid } from '../core/util.js';
import { h, icon, btn, iconBtn, sectionHead, progressBar, field, chips, timeInput, textarea, pill } from '../ui/dom.js';
import { openSheet, toast } from '../ui/overlay.js';
import { rankHero, weekStrip, streakPill, emptyHint } from '../ui/common.js';
import { todayView } from '../engine/quests.js';
import { alarmPhase, nextAlarm, kindOf, currentOccurrence } from '../engine/alarms.js';
import { demotionRisk, lockedPromotion } from '../engine/ranked.js';
import { routineMinutes } from '../data/exercises.js';
import { dayMode } from '../engine/schedule.js';
import { careStepMinutes } from '../data/care.js';
import { isStandalone, isIOS } from '../services/platform.js';
import { activityAction, startFocus } from '../services/actions.js';
import { questRowFor, openDaySheet } from './quests.js';

export function render(ctx) {
  const s = ctx.state;
  const { now, today } = ctx;
  const v = todayView(s, now);
  const due = v.daily.filter((x) => x.due);
  const open = [...v.daily.filter((x) => !x.done), ...v.once.filter((x) => !x.done)];
  const doneN = due.filter((x) => x.done).length;

  const header = h(
    'header.home-head',
    h('div.grow', h('div.small.muted', `${greeting(now, s.settings)},`), h('h1.home-title', s.profile.name || 'Player')),
    iconBtn('bell', () => (location.hash = '#/alarms'), { label: 'Alarms' }),
    streakPill(s, today)
  );

  const alerts = buildAlerts(s, ctx);

  // Today's quests
  const questCard = h(
    'div.card',
    h('div.row.between', h('div', h('div.eyebrow', due.length ? 'Today’s quests' : 'Today’s quests · XP only'), h('div.big-count.num', due.length ? `${doneN}/${due.length}` : `${v.daily.filter((x) => x.done).length}/${v.daily.length}`)), btn('All', () => (location.hash = '#/quests'), { variant: 'ghost', size: 'sm' })),
    h('div.mt-12', progressBar(due.length ? v.stats.rate || 0 : v.daily.length ? v.daily.filter((x) => x.done).length / v.daily.length : 0, { thick: true, glow: true, color: 'var(--green)' })),
    !due.length && v.daily.length ? h('div.tiny.faint.mt-8', s.ranked.placed ? 'New quests join your ranked match tomorrow.' : 'Setup day: quests earn XP today. Ranked placement starts tomorrow.') : null,
    h('div.qlist.mt-12', open.slice(0, 7).map((x) => questRowFor(s, x, today))),
    !open.length ? emptyHint(v.daily.length ? 'Everything done for today. Legendary. 🔥' : 'No quests today. Tap Quests → + to add some.') : null,
    open.length > 7 ? h('a.see-more', { href: '#/quests' }, `+${open.length - 7} more`) : null
  );

  return h(
    'div.screen.home',
    header,
    ...alerts,
    rankHero(s, today),
    weekStrip(s, today, (k) => openDaySheet(k)),
    quickActions(s, ctx),
    nextUp(s, ctx),
    questCard,
    workoutCard(s, today),
    careCard(s, today, now),
    schoolCard(s, today),
    v.weekly.length ? weeklyCard(s, v) : null
  );
}

function buildAlerts(s, ctx) {
  const out = [];
  const { now, today } = ctx;
  if (isIOS() && !isStandalone() && !s.meta.dismissInstall) {
    out.push(
      h(
        'div.card.glow.alert-card',
        h('div.row.gap-12', h('div.li-icon', icon('phone', 18)), h('div.grow', h('div.bold', 'Add Lockstep to your Home Screen'), h('div.small.muted', 'Tap the Share button in Safari, then “Add to Home Screen”. It opens full-screen, works offline and can show notifications (iOS 16.4+).'))),
        h('div.row.gap-8.mt-12', btn('Got it', () => store.update((st) => (st.meta.dismissInstall = true)), { variant: 'ghost', size: 'sm' }))
      )
    );
  }
  for (const a of s.alarms) {
    if (!a.enabled) continue;
    const phase = alarmPhase(s, a, now);
    const occ = currentOccurrence(s, a, now);
    if (!occ) continue;
    const isCh = !!a.challenge;
    if (phase === 'started' && isCh) out.push(alertCard('alarm', `${a.label} in progress`, 'Finish your challenge to earn your rewards.', 'Continue', `#/challenge/${a.id}`, 'glow'));
    else if (phase === 'snoozed') out.push(alertCard('alarm', `${a.label} snoozed`, `Rings again soon. You can start now.`, isCh ? 'Start now' : 'Open', isCh ? `#/challenge/${a.id}` : `#/alarm/${a.id}`, 'glow'));
    else if (phase === 'missed' && isCh && occ.date === today && dayMode(s, today) === 'normal') {
      const q = s.quests.find((x) => x.id === a.questId);
      const done = q && s.completions.some((c) => c.qid === q.id && c.day === today);
      if (!done) out.push(alertCard('alarm', `Missed: ${a.label}`, `The ${fmtTime(a.time, s.settings.clock24)} alarm’s grace period passed. You can still do it — late completions earn less XP and no on-time bonus.`, 'Do it now', `#/challenge/${a.id}`, 'warn'));
    }
  }
  const pending = s.challenges.filter((c) => c.status === 'pending' && !c.final);
  if (pending.length) out.push(alertCard('video', 'Evidence waiting for review', `${pending.length} challenge video${pending.length > 1 ? 's' : ''} to review. Rewards are given after you confirm the count.`, 'Review', `#/challenge/review/${pending[0].id}`, 'glow'));
  const risk = demotionRisk(s, today);
  if (risk && risk.risky && !risk.protected) out.push(alertCard('alert', 'Demotion zone', `You’re ${Math.max(0, risk.margin)} SR above the demotion line. Hit your standard today to stay safe.`, 'Ladder', '#/ladder', 'warn'));
  const lock = lockedPromotion(s, today);
  if (lock && lock.over) out.push(alertCard('lock', `Promotion to ${lock.tier.name} locked`, lock.items.filter((i) => i.have < i.need).map((i) => `${i.label} (${i.have}/${i.need})`).join(' · '), 'Details', '#/ladder', 'glow'));
  return out;
}

function alertCard(ic, title, text, cta, href, tone = '') {
  return h('div.card.alert-card' + (tone ? '.' + tone : ''), h('div.row.gap-12', h('div.li-icon', icon(ic, 18)), h('div.grow', h('div.bold', title), h('div.small.muted', text))), h('div.mt-12', h('a.btn.btn-primary.btn-sm', { href }, cta)));
}

function quickActions(s, ctx) {
  const items = [
    { ic: 'timer', label: 'Focus', on: () => (location.hash = '#/focus') },
    { ic: 'dumbbell', label: 'Workout', on: () => (location.hash = '#/body?tab=fitness') },
    { ic: 'sparkle', label: 'Routines', on: () => (location.hash = '#/body?tab=care') },
    { ic: 'book', label: 'School', on: () => (location.hash = '#/grind?tab=school') },
    { ic: 'moon', label: 'Sleep log', on: () => openSleepLog() },
    { ic: 'alarm', label: 'Alarms', on: () => (location.hash = '#/alarms') },
  ];
  if (s.profile.trading.level !== 'none') items.splice(4, 0, { ic: 'chart', label: 'Journal', on: () => (location.hash = '#/grind?tab=trading') });

  return h(
    'div.quick-row.hscroll',
    items.map((it) => h('button.quick', { type: 'button', onclick: it.on }, h('span.quick-icon', icon(it.ic, 20)), h('span.quick-label', it.label)))
  );
}

function nextUp(s, ctx) {
  const n = nextAlarm(s, ctx.now);
  const timer = s.timer;
  const cards = [];
  if (timer) {
    cards.push(h('a.card.next-card.glow', { href: '#/focus' }, h('div.eyebrow', timer.pausedAt ? 'Focus paused' : timer.mode === 'break' ? 'On a break' : 'Focusing'), h('div.next-title', timer.label), h('div.small.muted', 'Tap to open the timer')));
  }
  if (n) {
    const k = kindOf(n.alarm.kind);
    const inTxt = n.inMin < 60 ? `in ${n.inMin} min` : n.inMin < 1440 ? `in ${Math.floor(n.inMin / 60)}h ${n.inMin % 60}m` : relDay(n.date, ctx.today);
    cards.push(
      h(
        'a.card.next-card',
        { href: '#/alarms' },
        h('div.row.gap-8', icon(k.icon, 16), h('div.eyebrow', 'Next alarm')),
        h('div.next-time.num', fmtTime(n.time, s.settings.clock24)),
        h('div.next-title', n.alarm.label),
        h('div.small.muted', inTxt)
      )
    );
  } else cards.push(h('a.card.next-card', { href: '#/alarms' }, h('div.eyebrow', 'Alarms'), h('div.next-title', 'No alarms set'), h('div.small.muted', 'Set up your push-up challenge')));
  if (!timer)
    cards.push(
      h(
        'button.card.next-card.focus-card',
        { type: 'button', onclick: () => (startFocus({ workMin: 25, breakMin: 5, cycles: 1, label: 'Focus session' }), (location.hash = '#/focus')) },
        h('div.row.gap-8', icon('timer', 16), h('div.eyebrow', 'Quick focus')),
        h('div.next-time.num', '25:00'),
        h('div.next-title', 'Start a focus session'),
        h('div.small.muted', 'Tap to start now')
      )
    );
  return h('div.next-grid', cards);
}

function workoutCard(s, today) {
  const wd = weekday(today);
  const r = s.fitness.routines.find((x) => (x.days || []).includes(wd));
  if (!r) return null;
  const doneToday = s.fitness.sessions.some((x) => x.day === today && x.routineId === r.id);
  return h(
    'div.card.workout-card',
    h('div.row.between', h('div.eyebrow', 'Today’s workout'), doneToday ? pill('Done', { color: 'var(--green)' }) : null),
    h('div.card-title.mt-8', r.name),
    h('div.small.muted', `${r.exercises.length} exercises · ~${routineMinutes(s, r)} min`),
    h('div.mt-12', btn(doneToday ? 'View routine' : 'Start routine', () => (location.hash = `#/workout/${r.id}`), { block: true, iconName: doneToday ? 'eye' : 'play' }))
  );
}

function careCard(s, today, now) {
  const list = s.care.routines.filter((r) => !r.weekly && s.quests.some((q) => q.linked && q.linked.kind === 'care' && q.linked.id === r.id && !q.archived && !q.paused));
  if (!list.length) return null;
  const mins = minuteOfDay(now, s.settings);
  const sorted = [...list].sort((a, b) => (hmToMin(a.time) ?? 720) - (hmToMin(b.time) ?? 720));
  return h(
    'div',
    sectionHead('Self-care', h('a.small', { href: '#/body?tab=care' }, 'All routines')),
    h(
      'div.hscroll',
      sorted.map((r) => {
        const done = s.care.logs.some((l) => l.routineId === r.id && l.day === today && l.complete);
        const late = r.time && hmToMin(r.time) < mins && !done;
        return h(
          'a.care-chip' + (done ? '.done' : ''),
          { href: `#/routine/${r.id}` },
          h('div.row.gap-6', icon(done ? 'check' : 'sparkle', 14), h('span.tiny.faint', r.time ? fmtTime(r.time, s.settings.clock24) : 'Any time')),
          h('div.bold.small.mt-4', r.name),
          h('div.tiny.faint', done ? 'Done' : late ? 'Not done yet' : `${careStepMinutes(r.steps)} min`)
        );
      })
    )
  );
}

function schoolCard(s, today) {
  const items = s.school.items.filter((i) => i.status !== 'done').sort((a, b) => (a.due || '9999') < (b.due || '9999') ? -1 : 1).slice(0, 3);
  if (!items.length && !s.school.subjects.length) return null;
  return h(
    'div',
    sectionHead('School priorities', h('a.small', { href: '#/grind?tab=school' }, 'School')),
    items.length
      ? h(
          'div.list',
          items.map((i) => {
            const sub = s.school.subjects.find((x) => x.id === i.subjectId);
            const overdue = i.due && i.due < today;
            return h('a.list-item.tappable', { href: '#/grind?tab=school' }, h('span.sub-dot', { style: { background: sub ? sub.color : '#888' } }), h('div.li-body', h('div.li-title', i.title), h('div.li-sub', `${sub ? sub.name + ' · ' : ''}${i.type}`)), h('span.small' + (overdue ? '.red' : '.muted'), i.due ? relDay(i.due, today) : ''));
          })
        )
      : h('div.card.flat', emptyHint('No deadlines yet. Add assignments and tests in Grind → School.'))
  );
}

function weeklyCard(s, v) {
  return h(
    'div',
    sectionHead('Weekly targets', h('a.small', { href: '#/quests?tab=week' }, 'Week')),
    h(
      'div.card',
      v.weekly.map((x) =>
        h('div.wk-target', h('div.row.between.small', h('span.bold', x.q.title), h('span.num.faint', `${x.progress}/${x.q.target}`)), h('div.mt-4', progressBar(x.progress / x.q.target, { color: catOf(x.q.category).color })))
      )
    )
  );
}

// ---------- sleep log ----------

export function openSleepLog() {
  const s = store.state;
  const today = dayKey(clock.now(), s.settings);
  const existing = s.sleep.find((x) => x.day === today);
  const d = existing ? { ...existing } : { bed: s.profile.bedTime, wake: s.profile.wakeTime, quality: 3, note: '' };
  openSheet({
    title: 'Last night’s sleep',
    size: 'sm',
    render: (close) =>
      h(
        'div.stack-16',
        h('div.grid-2', field('Went to bed', timeInput(d.bed, (v) => v && (d.bed = v))), field('Woke up', timeInput(d.wake, (v) => v && (d.wake = v)))),
        field(
          'How rested do you feel?',
          chips(
            [1, 2, 3, 4, 5].map((n) => ({ id: n, name: ['😵', '😪', '😐', '🙂', '⚡'][n - 1] + ' ' + n })),
            d.quality,
            (v) => (d.quality = v),
            { multi: false }
          )
        ),
        field('Note (optional)', textarea({ value: d.note, rows: 2, maxlength: 200, placeholder: 'e.g. phone in bed until 1am', oninput: (e) => (d.note = e.target.value) })),
        h('div.small.muted', `Sleep: ${sleepHours(d.bed, d.wake).toFixed(1)} h`),
        btn('Save', () => {
          store.update((st) => {
            const rec = { id: existing ? existing.id : uid('sl'), day: today, bed: d.bed, wake: d.wake, quality: d.quality, note: String(d.note || '').slice(0, 200), hours: sleepHours(d.bed, d.wake), ts: clock.now() };
            st.sleep = st.sleep.filter((x) => x.day !== today);
            st.sleep.push(rec);
            if (st.sleep.length > 800) st.sleep.splice(0, st.sleep.length - 800);
          }, { render: false });
          close();
          if (!existing) activityAction('sleep', {}, 'sleepLog', 'sleep');
          else {
            toast('Sleep log updated.');
            store.notify();
          }
        }, { block: true })
      ),
  });
}

export function sleepHours(bed, wake) {
  const b = hmToMin(bed);
  const w = hmToMin(wake);
  if (b === null || w === null) return 0;
  return (((w - b + 1440) % 1440) || 1440) / 60;
}

