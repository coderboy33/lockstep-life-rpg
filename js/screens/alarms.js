// Alarms: list, editor, ringing screen, bedside mode and calendar export.

import { store } from '../core/store.js';
import { clock, dateKey, fmtTime, parts, relDay } from '../core/dates.js';
import { CAT } from '../core/config.js';
import { h, icon, btn, iconBtn, field, input, select, dayPicker, timeInput, stepper, toggle, toggleRow, sectionHead, empty, clear, pill } from '../ui/dom.js';
import { openSheet, toast, confirmDialog } from '../ui/overlay.js';
import { topbar } from '../ui/common.js';
import { ALARM_KINDS, kindOf, sanitizeAlarm, newAlarm, alarmPhase, nextOccurrence, describeDays, currentOccurrence, logOcc, snooze, canSnooze, buildICS, isOnTime } from '../engine/alarms.js';
import { createQuest, deleteQuest } from '../engine/quests.js';
import { capabilities, requestNotifications, notify, keepAwake, shareOrDownload, appBaseUrl } from '../services/platform.js';
import { startAlarmSound, stopAlarmSound, unlockAudio, audioReady, chime, silentTestMode } from '../services/audio.js';
import { completeQuestAction, startFocus } from '../services/actions.js';

let bedsideTimer = null;

export function fullScreen(route) {
  return route.name === 'bedside';
}

export function cleanup() {
  clearInterval(bedsideTimer);
  bedsideTimer = null;
  keepAwake(false);
}

export function render(ctx) {
  const s = ctx.state;
  if (ctx.route.name === 'bedside') return bedside();
  if (ctx.route.name === 'alarm' && ctx.params[0]) {
    const a = s.alarms.find((x) => x.id === ctx.params[0]);
    if (a && a.challenge) {
      setTimeout(() => location.replace(`#/challenge/${a.id}`), 0);
      return h('div');
    }
    if (a) setTimeout(() => openAlarmEditor(a), 50);
  }
  const caps = capabilities();
  const list = [...s.alarms].sort((a, b) => (a.time < b.time ? -1 : 1));
  return h(
    'div.screen',
    topbar('Alarms', { back: '#/home', actions: [iconBtn('plus', () => openAlarmEditor(null), { label: 'New alarm', cls: 'accent-btn' })] }),
    honestyCard(s, caps),
    sectionHead('Your alarms', h('span.small.faint', `${list.filter((a) => a.enabled).length} on`), { cls: 'first' }),
    list.length ? h('div.stack-8', list.map((a) => alarmCard(s, a, ctx.now))) : empty('alarm', 'No alarms yet', 'Create a morning push-up challenge or reminders for study, workouts and routines.', btn('Create push-up alarm', () => openAlarmEditor(null, { kind: 'pushup' }), { size: 'sm' })),
    sectionHead('Tools'),
    h(
      'div.list',
      h('button.list-item.tappable', { type: 'button', onclick: () => (location.hash = '#/bedside') }, h('div.li-icon', icon('moon', 18)), h('div.li-body', h('div.li-title', 'Bedside mode'), h('div.li-sub', 'Keeps the screen on overnight so the in-app alarm rings reliably')), icon('chevronRight', 18, 'li-chev')),
      h('button.list-item.tappable', { type: 'button', onclick: () => exportCalendar(s.alarms) }, h('div.li-icon', icon('calendar', 18)), h('div.li-body', h('div.li-title', 'Add alarms to Calendar'), h('div.li-sub', 'Your phone’s calendar alerts you even when the app is closed')), icon('chevronRight', 18, 'li-chev')),
      h('button.list-item.tappable', { type: 'button', onclick: () => openSetupGuide() }, h('div.li-icon', icon('info', 18)), h('div.li-body', h('div.li-title', 'Reliable iPhone setup'), h('div.li-sub', 'Clock app + Lockstep, step by step')), icon('chevronRight', 18, 'li-chev'))
    )
  );
}

function honestyCard(s, caps) {
  const perm = caps.permission;
  return h(
    'div.card.flat',
    h('div.row.gap-8', icon('info', 18, 'accent'), h('div.bold', 'How alarms work here')),
    h('p.small.muted.mt-8', 'Lockstep rings, plays sound and shows your challenge whenever the app is open — including Bedside mode overnight. A website can’t wake a closed or locked phone by itself, so for a guaranteed wake-up also use your Clock app or Calendar (see Tools). When you open Lockstep after an alarm, your challenge is waiting.'),
    h(
      'div.row.wrap.gap-8.mt-12',
      perm === 'granted'
        ? pill('Notifications on', { color: 'var(--green)', iconName: 'check' })
        : perm === 'unsupported'
          ? pill(caps.ios && !caps.standalone ? 'Notifications: add to Home Screen first' : 'Notifications not supported', { color: 'var(--orange)' })
          : btn('Enable notifications', async () => {
              const r = await requestNotifications();
              toast(r === 'granted' ? 'Notifications enabled.' : 'Notifications were not allowed.');
              store.notify();
            }, { variant: 'ghost', size: 'sm', iconName: 'bell' }),
      btn('Test alarm', () => testAlarm(), { variant: 'ghost', size: 'sm', iconName: 'volume' })
    )
  );
}

function alarmCard(s, a, now) {
  const phase = alarmPhase(s, a, now);
  const next = nextOccurrence(s, a, now);
  const k = kindOf(a.kind);
  const chips = [];
  const st = { done: ['Done today', 'var(--green)'], missed: ['Missed today', 'var(--orange)'], ringing: ['Ringing', 'var(--red)'], snoozed: ['Snoozed', 'var(--yellow)'], started: ['In progress', 'var(--accent)'], skipped: ['Skipped today', 'var(--text-3)'], dismissed: ['Dismissed', 'var(--text-3)'] }[phase];
  if (st) chips.push(pill(st[0], { color: st[1] }));
  if (a.challenge) chips.push(pill(`${a.challenge.pushups} push-ups${a.challenge.situps ? ` + ${a.challenge.situps} sit-ups` : ''}`, { color: CAT.fitness.color }));
  if (a.challenge && a.challenge.requireVideo) chips.push(pill('Video', { iconName: 'video' }));
  return h(
    'div.card.alarm-card' + (a.enabled ? '' : '.off'),
    h(
      'div.grow.tappable',
      { onclick: () => openAlarmEditor(a) },
      h('div.alarm-time', fmtTime(a.time, s.settings.clock24)),
      h('div.bold', a.label),
      h('div.alarm-meta', `${describeDays(a.days)} · ${k.name}${next && a.enabled ? ` · next ${relDay(next.date, dateKey(now, s.settings))}` : ''}`),
      chips.length ? h('div.row.wrap.gap-6.mt-8', chips) : null
    ),
    h(
      'div.col.gap-8',
      { style: { alignItems: 'flex-end' } },
      toggle(a.enabled, (v) => {
        store.update((st2) => {
          const x = st2.alarms.find((y) => y.id === a.id);
          if (x) x.enabled = v;
        });
      }, `${a.label} on/off`),
      a.challenge && ['ringing', 'snoozed', 'started', 'missed', 'upcoming', 'notToday'].includes(phase) ? btn('Start', () => (location.hash = `#/challenge/${a.id}`), { variant: 'ghost', size: 'sm' }) : null
    )
  );
}

// ---------- editor ----------

export function openAlarmEditor(existing, defaults = {}) {
  const isNew = !existing;
  const s0 = store.state;
  const d = existing
    ? JSON.parse(JSON.stringify(existing))
    : {
        kind: defaults.kind || 'pushup',
        label: '',
        time: s0.profile.wakeTime || '06:30',
        days: [0, 1, 2, 3, 4, 5, 6],
        enabled: true,
        challenge: { pushups: Math.max(5, Math.round((s0.profile.fitness.pushupMax || 10) * 0.6)), situps: 0, requireVideo: false },
        reminderEveryMin: 5,
        reminderRepeats: 3,
        graceMin: 30,
        xp: 40,
        partOfDaily: true,
        sound: 'pulse',
        target: null,
      };
  if (!d.challenge) d.challenge = { pushups: 15, situps: 0, requireVideo: false };
  openSheet({
    title: isNew ? 'New alarm' : 'Edit alarm',
    render: (close, rerender) => {
      const s = store.state;
      const isCh = d.kind === 'pushup';
      const err = h('div.form-error.hidden');
      const targetOpts = targetOptions(s, d.kind);
      return h(
        'div.stack-16',
        field('Type', select(ALARM_KINDS, d.kind, (v) => ((d.kind = v), (d.partOfDaily = v === 'pushup' || v === 'wake'), rerender()))),
        field('Label', input({ value: d.label, placeholder: kindOf(d.kind).name, maxlength: 60, oninput: (e) => (d.label = e.target.value) })),
        h('div.grid-2', field('Time', timeInput(d.time, (v) => v && (d.time = v))), field('Grace period', stepper(d.graceMin, { min: 5, max: 240, step: 5, suffix: 'm', onChange: (v) => (d.graceMin = v) }))),
        field('Days', dayPicker(d.days, (v) => (d.days = v))),
        isCh
          ? h(
              'div.card.flat.stack-12',
              h('div.eyebrow', 'Challenge'),
              h('div.grid-2', field('Push-ups', stepper(d.challenge.pushups, { min: 1, max: 300, onChange: (v) => (d.challenge.pushups = v) })), field('Sit-ups (optional)', stepper(d.challenge.situps, { min: 0, max: 300, step: 5, onChange: (v) => (d.challenge.situps = v) }))),
              toggleRow('Require video evidence', 'Without a recorded/uploaded video the quest gets reduced credit and no bonus SR.', d.challenge.requireVideo, (v) => (d.challenge.requireVideo = v))
            )
          : null,
        !isCh && targetOpts.length > 1 ? field('When it rings, open', select(targetOpts, d.target ? `${d.target.kind}:${d.target.id || ''}` : '', (v) => (d.target = v ? { kind: v.split(':')[0], id: v.split(':')[1] || null } : null))) : null,
        h('div.grid-2', field('Remind every', stepper(d.reminderEveryMin, { min: 1, max: 60, suffix: 'm', onChange: (v) => (d.reminderEveryMin = v) })), field('Snoozes allowed', stepper(d.reminderRepeats, { min: 0, max: 10, onChange: (v) => (d.reminderRepeats = v) }))),
        isCh || d.kind === 'wake' ? toggleRow('Part of my daily routine', 'Creates a daily quest that this alarm completes.', d.partOfDaily, (v) => (d.partOfDaily = v)) : null,
        (isCh || d.kind === 'wake') && d.partOfDaily ? field('XP reward', stepper(d.xp, { min: 5, max: 200, step: 5, suffix: ' XP', onChange: (v) => (d.xp = v) }), 'Rating (SR) is set by the ranked rules, not here.') : null,
        field(
          'Sound',
          h(
            'div.row.gap-8',
            select(
              [
                { id: 'pulse', name: 'Pulse' },
                { id: 'chime', name: 'Chime' },
                { id: 'siren', name: 'Siren' },
              ],
              d.sound,
              (v) => (d.sound = v)
            ),
            btn('Play', () => {
              unlockAudio();
              startAlarmSound(d.sound, false);
              setTimeout(stopAlarmSound, 2600);
            }, { variant: 'ghost', size: 'sm', iconName: 'volume' })
          )
        ),
        err,
        h(
          'div.sheet-actions',
          btn(isNew ? 'Create alarm' : 'Save', () => {
            const res = saveAlarm(existing, d);
            if (!res.ok) {
              err.textContent = res.reason;
              err.classList.remove('hidden');
              return;
            }
            close();
            toast(isNew ? 'Alarm created.' : 'Alarm saved.', { type: 'success' });
          }, { block: true, size: 'lg' }),
          !isNew
            ? btn('Delete alarm', async () => {
                if (!(await confirmDialog({ title: 'Delete this alarm?', message: existing.questId ? 'Its daily quest will also be removed from your schedule (history is kept).' : '', okText: 'Delete', danger: true }))) return;
                store.update((st) => {
                  if (existing.questId) deleteQuest(st, existing.questId, clock.now());
                  st.alarms = st.alarms.filter((x) => x.id !== existing.id);
                });
                close();
                toast('Alarm deleted.');
              }, { variant: 'ghost', block: true, iconName: 'trash' })
            : null
        )
      );
    },
  });
}

function targetOptions(s, kind) {
  const out = [{ id: '', name: 'Just this screen' }];
  if (kind === 'study' || kind === 'custom') out.push({ id: 'focus:', name: 'Focus timer' });
  if (kind === 'workout' || kind === 'custom') {
    out.push({ id: 'workout:', name: 'Today’s workout' });
    for (const r of s.fitness.routines) out.push({ id: `workout:${r.id}`, name: `Workout: ${r.name}` });
  }
  if (kind === 'care' || kind === 'evening' || kind === 'custom') {
    out.push({ id: 'care:', name: 'Self-care routines' });
    for (const r of s.care.routines) out.push({ id: `care:${r.id}`, name: `Routine: ${r.name}` });
  }
  if (kind === 'business' || kind === 'custom') {
    out.push({ id: 'business:', name: 'Business projects' });
    for (const p of s.business.projects) out.push({ id: `project:${p.id}`, name: `Project: ${p.name}` });
  }
  if (kind === 'trading' || kind === 'custom') out.push({ id: 'trading:', name: 'Trading journal' });
  return out;
}

function saveAlarm(existing, d) {
  const now = clock.now();
  return store.update((s) => {
    const res = sanitizeAlarm({ ...d, withChallenge: d.kind === 'pushup' }, existing || {});
    if (!res.ok) return { ok: false, reason: res.errors.join(' ') };
    let a;
    if (existing) {
      a = s.alarms.find((x) => x.id === existing.id);
      if (!a) return { ok: false, reason: 'Alarm not found.' };
      Object.assign(a, res.alarm);
    } else {
      const r = newAlarm(res.alarm, now);
      if (!r.ok) return { ok: false, reason: r.errors.join(' ') };
      a = r.alarm;
      s.alarms.push(a);
    }
    syncAlarmQuest(s, a, now);
    return { ok: true, alarm: a };
  });
}

/** Keeps the alarm's daily quest in sync (create / update / remove). */
function syncAlarmQuest(s, a, now) {
  const wants = a.partOfDaily && (a.kind === 'pushup' || a.kind === 'wake');
  let q = a.questId ? s.quests.find((x) => x.id === a.questId && !x.archived) : null;
  if (!wants) {
    if (q) deleteQuest(s, q.id, now);
    a.questId = null;
    return;
  }
  const isCh = !!a.challenge;
  const total = isCh ? a.challenge.pushups + a.challenge.situps : 0;
  const data = {
    title: isCh ? a.label || 'Morning push-up challenge' : `Wake up at ${fmtTime(a.time)}`,
    category: isCh ? 'fitness' : 'sleep',
    type: 'daily',
    days: a.days,
    time: a.time,
    durationMin: isCh ? Math.max(5, Math.ceil((total * 4) / 60) + 3) : 5,
    difficulty: isCh ? (total >= 60 ? 'epic' : total >= 30 ? 'hard' : 'medium') : 'medium',
    verification: isCh && a.challenge.requireVideo ? 'video' : 'none',
    description: isCh ? `When the alarm rings: ${a.challenge.pushups} push-ups${a.challenge.situps ? ` and ${a.challenge.situps} sit-ups` : ''}. Start within the ${a.graceMin}-minute grace period for the on-time bonus.` : `Get up when your ${fmtTime(a.time)} alarm rings and tap “I’m up” within ${a.graceMin} minutes.`,
    instructions: isCh ? ['When the alarm rings, tap START CHALLENGE.', 'Choose a counting method.', 'Use good form — knee push-ups are fine.', 'Submit your result.'] : ['When the alarm rings, get out of bed.', 'Tap “I’m up”.'],
    linked: { kind: 'alarm', id: a.id },
    xpOverride: a.xp,
  };
  if (q) Object.assign(q, data, { linked: { kind: 'alarm', id: a.id } });
  else {
    const r = createQuest(s, data, now, 'alarm');
    if (r.ok) {
      r.quest.linked = { kind: 'alarm', id: a.id };
      r.quest.xpOverride = a.xp;
      a.questId = r.quest.id;
    }
  }
}

// ---------- ringing ----------

let ringingEl = null;

/** Full-screen ringing alarm. onClose is called when it's dismissed in any way. */
export function showRinging(alarm, occKey, onClose, opts = {}) {
  if (ringingEl) ringingEl.remove();
  const s = store.state;
  const test = !!opts.test;
  const k = kindOf(alarm.kind);
  const occ = test ? null : currentOccurrence(s, alarm, clock.now());
  const clockEl = h('div.ring-clock');
  const paintClock = () => {
    const p = parts(clock.now(), store.state.settings);
    clockEl.textContent = fmtTime(`${String(p.hh).padStart(2, '0')}:${String(p.mm).padStart(2, '0')}`, store.state.settings.clock24);
  };
  paintClock();
  const tick = setInterval(paintClock, 5000);
  const soundHint = h('div.tap-sound', silentTestMode() ? '🔇 Silent test mode — sound is muted (Settings → Testing tools)' : audioReady() ? '' : 'Tap anywhere to turn on the sound');
  const play = () => {
    if (store.state.settings.sound) startAlarmSound(alarm.sound || 'pulse');
  };
  if (audioReady()) play();
  const finish = (fn) => {
    clearInterval(tick);
    stopAlarmSound();
    ringingEl && ringingEl.remove();
    ringingEl = null;
    onClose && onClose();
    fn && fn();
  };
  const task = alarm.challenge ? `${alarm.challenge.pushups} PUSH-UPS${alarm.challenge.situps ? ` + ${alarm.challenge.situps} SIT-UPS` : ''}` : k.name.toUpperCase();
  const actions = [];
  if (alarm.challenge)
    actions.push(
      btn('START CHALLENGE', () =>
        finish(() => {
          if (!test) store.update((st) => logOcc(st, occKey, { status: 'started', startedTs: clock.now() }), { render: false });
          location.hash = `#/challenge/${alarm.id}${test ? '?test=1' : ''}`;
        }), { variant: 'white', size: 'xl', block: true, iconName: 'play' })
    );
  else
    actions.push(
      btn(alarm.kind === 'wake' ? 'I’M UP' : 'START', () => finish(() => (test ? null : dismissAndOpen(alarm, occKey))), { variant: 'white', size: 'xl', block: true, iconName: alarm.kind === 'wake' ? 'sun' : 'play' })
    );
  if (!test && occ && canSnooze(alarm, occ))
    actions.push(
      btn(`Snooze ${alarm.reminderEveryMin} min`, () =>
        finish(() => {
          const r = store.update((st) => snooze(st, alarm, currentOccurrence(st, alarm, clock.now()), clock.now()));
          if (r.ok) toast(`Snoozed. Rings again in ${alarm.reminderEveryMin} min (if the app is open).`);
        }), { variant: 'ghost', block: true, iconName: 'clock' })
    );
  actions.push(
    btn(test ? 'Stop test' : alarm.challenge ? 'Skip today' : 'Dismiss', () =>
      finish(() => {
        if (test) return;
        store.update((st) => logOcc(st, occKey, { status: alarm.challenge ? 'skipped' : 'dismissed', doneTs: clock.now() }));
        if (alarm.challenge) toast('Skipped. The quest stays open if you want to do it later.');
      }), { variant: 'ghost', size: 'sm' })
  );
  ringingEl = h(
    'div.ringing',
    {
      role: 'alertdialog',
      'aria-label': alarm.label,
      onclick: () => {
        if (!audioReady() && !silentTestMode()) {
          unlockAudio();
          setTimeout(() => {
            play();
            soundHint.textContent = '';
          }, 60);
        }
      },
    },
    h('div', clockEl, h('div.ring-label', alarm.label), test ? h('div.small.muted', 'Test alarm') : null),
    h('div.ring-icon', icon(k.icon, 54)),
    h('div', h('div.ring-task', task), alarm.challenge ? h('div.small.muted.mt-8', `Start within ${alarm.graceMin} min for the on-time bonus.`) : null, soundHint),
    h('div.ring-actions', actions)
  );
  document.getElementById('overlay-root').appendChild(ringingEl);
}

function dismissAndOpen(alarm, occKey) {
  const now = clock.now();
  store.update((st) => logOcc(st, occKey, { status: 'dismissed', doneTs: now }));
  if (alarm.kind === 'wake' && alarm.questId) {
    const occDate = occKey.split('@')[1];
    const onTime = isOnTime(store.state, alarm, occDate, now);
    completeQuestAction(alarm.questId, { onTime, late: !onTime, method: 'alarm' });
  }
  const t = alarm.target;
  if (!t) return;
  if (t.kind === 'focus') {
    startFocus({ workMin: 25, breakMin: 5, cycles: 2, label: alarm.label });
    location.hash = '#/focus';
  } else if (t.kind === 'workout') location.hash = t.id ? `#/workout/${t.id}` : '#/body';
  else if (t.kind === 'care') location.hash = t.id ? `#/routine/${t.id}` : '#/body?tab=care';
  else if (t.kind === 'project') location.hash = `#/project/${t.id}`;
  else if (t.kind === 'business') location.hash = '#/grind?tab=business';
  else if (t.kind === 'trading') location.hash = '#/grind?tab=trading';
}

function testAlarm() {
  unlockAudio();
  const a = { id: 'test', label: 'Test alarm', kind: 'pushup', time: '00:00', challenge: { pushups: 10, situps: 0 }, graceMin: 30, reminderEveryMin: 5, sound: 'pulse' };
  showRinging(a, 'test@test', null, { test: true });
  if (document.visibilityState === 'visible') notify('⏰ Test alarm', 'If you can see this, notifications work.', { tag: 'test' });
}

// ---------- bedside ----------

function bedside() {
  const clockEl = h('div.bedside-clock');
  const nextEl = h('div.small');
  const status = h('div.tiny');
  const paint = () => {
    const st = store.state;
    const now = clock.now();
    const p = parts(now, st.settings);
    clockEl.textContent = fmtTime(`${String(p.hh).padStart(2, '0')}:${String(p.mm).padStart(2, '0')}`, st.settings.clock24).replace(/ (AM|PM)/, '');
    const n = st.alarms.map((a) => ({ a, n: nextOccurrence(st, a, now) })).filter((x) => x.n).sort((x, y) => x.n.inMin - y.n.inMin)[0];
    nextEl.textContent = n ? `Next: ${n.a.label} at ${fmtTime(n.a.time, st.settings.clock24)} (${Math.floor(n.n.inMin / 60)}h ${n.n.inMin % 60}m)` : 'No alarms scheduled';
  };
  paint();
  clearInterval(bedsideTimer);
  bedsideTimer = setInterval(paint, 15000);
  unlockAudio();
  keepAwake(true).then((ok) => {
    status.textContent = ok ? 'Screen will stay on. Keep your phone plugged in.' : 'This browser can’t keep the screen awake — set Auto-Lock to “Never” while charging, or use your Clock app.';
  });
  return h(
    'div.bedside',
    { onclick: () => unlockAudio() },
    clockEl,
    nextEl,
    status,
    h('p.tiny', { style: 'max-width:320px' }, 'Leave Lockstep open on this screen with the volume up. Alarms ring here. Tap once now so your browser allows the alarm sound.'),
    h('div.row.gap-8.mt-16', btn('Test sound', () => (chime(), toast('If you heard a chime, sound works.')), { variant: 'ghost', size: 'sm' }), btn('Exit', () => (location.hash = '#/alarms'), { variant: 'ghost', size: 'sm' }))
  );
}

// ---------- calendar & guide ----------

async function exportCalendar(alarms) {
  const on = alarms.filter((a) => a.enabled);
  if (!on.length) return toast('Turn on at least one alarm first.');
  const s = store.state;
  const ics = buildICS(on, { appUrl: appBaseUrl(), now: clock.now(), startDate: dateKey(clock.now(), s.settings) });
  const r = await shareOrDownload('lockstep-alarms.ics', ics, 'text/calendar');
  if (r !== 'cancelled') toast('Calendar file ready — open it and tap “Add All” to get alerts even when the app is closed.', { duration: 6000 });
}

function openSetupGuide() {
  openSheet({
    title: 'Reliable iPhone wake-up',
    render: () =>
      h(
        'div.stack-12.rules',
        h('p', 'iPhone doesn’t let websites run in the background, so pair Lockstep with a native alert:'),
        h('h3', 'Option A — Clock app (most reliable)'),
        h('ol.instructions', h('li', 'Open the Clock app and create an alarm at the same time as your Lockstep alarm.'), h('li', 'Name it “Lockstep challenge”.'), h('li', 'When it rings, stop it and open Lockstep from your Home Screen. Your challenge opens automatically while you’re inside the grace period.')),
        h('h3', 'Option B — Calendar alerts'),
        h('ol.instructions', h('li', 'Alarms → “Add alarms to Calendar”.'), h('li', 'Open the file and tap “Add All”. Each alarm becomes a repeating event with an alert.'), h('li', 'If you change alarm times later, delete the old events and add them again.')),
        h('h3', 'Option C — Bedside mode'),
        h('ol.instructions', h('li', 'Before sleeping, open Alarms → Bedside mode and leave the phone charging.'), h('li', 'The screen stays on (dimmed) and the alarm rings with sound inside Lockstep.')),
        h('h3', 'Notifications'),
        h('p', 'On iPhone (iOS 16.4+), notifications only work for apps added to the Home Screen, and only while the app is running or recently used. They’re a helpful extra, not a replacement for options A–C.')
      ),
  });
}

