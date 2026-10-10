// Focus timer (Pomodoro-style). Based on timestamps, so it keeps counting if you switch apps
// or reload; phases that ended while you were away are logged when you come back.

import { store } from '../core/store.js';
import { fmtClock, fmtDuration, sum } from '../core/util.js';
import { h, btn, field, select, segmented, stepper, input, ring } from '../ui/dom.js';
import { topbar } from '../ui/common.js';
import { timerInfo, startFocus, pauseFocus, resumeFocus, stopFocus, advanceFocus } from '../services/actions.js';
import { keepAwake } from '../services/platform.js';
import { confirmDialog } from '../ui/overlay.js';
import { countBeep, unlockAudio } from '../services/audio.js';

let interval = null;

export function cleanup() {
  clearInterval(interval);
  interval = null;
  keepAwake(false);
}

export function render(ctx) {
  cleanup();
  const s = ctx.state;
  const t = s.timer;
  const today = ctx.today;
  const todayMin = sum(s.school.sessions.filter((x) => x.day === today), (x) => x.minutes);
  return h('div.screen', topbar('Focus', { back: true }), t ? running(s, t) : setup(s), h('div.card.flat.mt-16.row.between', h('span.small.muted', 'Focused today'), h('span.bold.num', fmtDuration(todayMin))));
}

function setup(s) {
  let subjectId = '';
  let work = 25;
  let brk = 5;
  let cycles = 1;
  let label = '';
  return h(
    'div.stack-16',
    field('What are you focusing on?', select([{ id: '', name: 'General focus' }, ...s.school.subjects.map((x) => ({ id: x.id, name: `Study: ${x.name}` }))], subjectId, (v) => (subjectId = v))),
    field('Label (optional)', input({ placeholder: 'e.g. Chemistry problem set', maxlength: 60, oninput: (e) => (label = e.target.value) })),
    field('Focus length', segmented([15, 25, 45, 50, 60, 90].map((m) => ({ id: m, name: `${m}` })), work, (v) => (work = v), { small: true })),
    h('div.grid-2', field('Break', stepper(brk, { min: 0, max: 30, suffix: 'm', onChange: (v) => (brk = v) })), field('Rounds', stepper(cycles, { min: 1, max: 8, onChange: (v) => (cycles = v) }))),
    btn('Start focus', () => {
      unlockAudio();
      const sub = s.school.subjects.find((x) => x.id === subjectId);
      startFocus({ subjectId: subjectId || null, workMin: work, breakMin: brk, cycles, label: label || (sub ? `Study: ${sub.name}` : 'Focus session') });
    }, { block: true, size: 'lg', iconName: 'play' }),
    h('p.tiny.faint.center-text', 'Put your phone on Do Not Disturb. The timer keeps running if you leave the app; finished rounds are logged automatically.')
  );
}

function running(s, t) {
  const info = timerInfo(t);
  const timeEl = h('div.focus-time.num', fmtClock(info.remaining / 1000));
  const r = ring(1 - info.remaining / t.durationMs, { size: 250, stroke: 12, color: t.mode === 'break' ? 'var(--green)' : 'var(--accent)', cls: 'glow', children: h('div', h('div.focus-mode', t.mode === 'break' ? 'Break' : 'Focus'), timeEl, h('div.small.muted', `Round ${t.cycle}/${t.cycles}`)) });
  const fill = r.querySelector('.ring-fill');
  const circ = fill ? parseFloat(fill.getAttribute('stroke-dasharray')) : 0;
  let lastLeft = null;
  interval = setInterval(() => {
    const cur = store.state.timer;
    if (!cur || cur.id !== t.id) return;
    const inf = timerInfo(cur);
    const left = Math.ceil(inf.remaining / 1000);
    timeEl.textContent = fmtClock(left);
    if (fill) fill.setAttribute('stroke-dashoffset', String(circ * (inf.remaining / cur.durationMs)));
    if (left <= 3 && left > 0 && left !== lastLeft && !cur.pausedAt) countBeep(false);
    lastLeft = left;
    if (inf.done && !cur.pausedAt) {
      countBeep(true);
      advanceFocus();
    }
  }, 250);
  keepAwake(true);
  return h(
    'div.focus-wrap',
    h('div.bold', t.label),
    r,
    h(
      'div.row.gap-8',
      t.pausedAt ? btn('Resume', () => resumeFocus(), { iconName: 'play' }) : btn('Pause', () => pauseFocus(), { variant: 'ghost', iconName: 'pause' }),
      btn('Stop', async () => {
        const mins = Math.floor(timerInfo(t).elapsed / 60000);
        const ok = await confirmDialog({ title: 'Stop this session?', message: t.mode === 'work' && mins >= 5 ? `You’ve focused ${mins} min — it will be logged as a partial session.` : 'Less than 5 focused minutes won’t be logged.', okText: 'Stop', danger: true });
        if (ok) stopFocus(true);
      }, { variant: 'ghost', iconName: 'stop' })
    ),
    t.loggedMin ? h('div.small.green', `${t.loggedMin} min logged so far`) : null,
    h('p.tiny.faint.center-text', 'Timer-verified quests linked to this focus will complete automatically when enough minutes are logged.')
  );
}

