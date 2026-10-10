// School: focus sessions, timetable, deadlines, subjects, weekly study goals, history.

import { store } from '../core/store.js';
import { clock, dayKey, addDays, weekKey, weekday, fmtTime, fmtDay, relDay, diffDays, WD_LONG, hmToMin } from '../core/dates.js';
import { uid, cleanText, toInt, fmtDuration, sum } from '../core/util.js';
import { h, icon, btn, iconBtn, field, input, textarea, select, dateInput, timeInput, stepper, segmented, sectionHead, empty, listItem, progressBar, ring, pill, clear } from '../ui/dom.js';
import { openSheet, toast, confirmDialog, rewardPop } from '../ui/overlay.js';
import { grantActivityXp, revokeActivityXp } from '../engine/quests.js';
import { startFocus, logManualStudy, showAchievements } from '../services/actions.js';
import { checkAchievements } from '../engine/progress.js';

export const ITEM_TYPES = [
  { id: 'assignment', name: 'Assignment' },
  { id: 'homework', name: 'Homework' },
  { id: 'test', name: 'Test' },
  { id: 'exam', name: 'Exam' },
  { id: 'project', name: 'Project' },
  { id: 'revision', name: 'Revision goal' },
];
const PRIORITY = [
  { id: 'high', name: 'High', color: 'var(--red)' },
  { id: 'medium', name: 'Medium', color: 'var(--orange)' },
  { id: 'low', name: 'Low', color: 'var(--text-3)' },
];
const COLORS = ['#4d8dff', '#22c3ff', '#ff5d6c', '#ff7ad9', '#ffb020', '#9be15d', '#8f7dff', '#2ee6b0', '#ff8a3d', '#c58cff'];

export function schoolTab(ctx) {
  const s = ctx.state;
  const today = ctx.today;
  const out = h('div');
  const subj = (id) => s.school.subjects.find((x) => x.id === id);

  // Focus launcher
  let subjectId = s.school.subjects[0] ? s.school.subjects[0].id : '';
  let mins = 25;
  out.appendChild(
    h(
      'div.card.glow',
      h('div.row.between', h('div.eyebrow', 'Focus session'), s.timer ? pill('Running', { color: 'var(--green)' }) : null),
      s.timer
        ? h('div.mt-12', btn('Open timer', () => (location.hash = '#/focus'), { block: true, iconName: 'timer' }))
        : h(
            'div.stack-12.mt-12',
            select([{ id: '', name: 'General focus (no subject)' }, ...s.school.subjects.map((x) => ({ id: x.id, name: x.name }))], subjectId, (v) => (subjectId = v)),
            segmented([15, 25, 45, 60].map((m) => ({ id: m, name: `${m}m` })), mins, (v) => (mins = v), { small: true }),
            btn('Start focus', () => {
              const sub = subj(subjectId);
              startFocus({ subjectId: subjectId || null, workMin: mins, breakMin: mins >= 45 ? 10 : 5, cycles: 1, label: sub ? `Study: ${sub.name}` : 'Focus session' });
              location.hash = '#/focus';
            }, { block: true, iconName: 'play' })
          )
    )
  );

  // Today's classes
  const wd = weekday(today);
  const classes = s.school.timetable.filter((t) => t.day === wd).sort((a, b) => (hmToMin(a.start) ?? 0) - (hmToMin(b.start) ?? 0));
  out.appendChild(sectionHead('Today’s classes', btn('Timetable', () => openTimetable(), { variant: 'ghost', size: 'sm', iconName: 'calendar' })));
  if (!s.profile.schoolDays.includes(wd)) out.appendChild(h('div.card.flat.small.muted', 'No school today.'));
  else if (!classes.length) out.appendChild(h('div.card.flat.small.muted', 'Add your timetable so quests can be planned around your classes.'));
  else
    out.appendChild(
      h(
        'div.list',
        classes.map((c) => {
          const sub = subj(c.subjectId);
          return h('div.list-item', h('span.sub-dot', { style: { background: sub ? sub.color : '#888' } }), h('div.li-body', h('div.li-title', sub ? sub.name : c.label || 'Class'), h('div.li-sub', `${fmtTime(c.start, s.settings.clock24)}–${fmtTime(c.end, s.settings.clock24)}${c.room ? ' · ' + c.room : ''}`)));
        })
      )
    );

  // Weekly study
  const wk = weekKey(today, s.settings.weekStartsOn);
  const weekSessions = s.school.sessions.filter((x) => x.day >= wk && x.day <= addDays(wk, 6));
  const weekMin = sum(weekSessions, (x) => x.minutes);
  const goal = s.school.weeklyGoalMin || 300;
  out.appendChild(sectionHead('Study this week', btn('Log manually', () => openManualLog(), { variant: 'ghost', size: 'sm', iconName: 'plus' })));
  out.appendChild(
    h(
      'div.card',
      h(
        'div.row.gap-16',
        ring(weekMin / goal, { size: 96, stroke: 8, color: 'var(--accent)', children: h('div', h('div.bold.num', fmtDuration(weekMin)), h('div.tiny.faint', `of ${fmtDuration(goal)}`)) }),
        h(
          'div.grow.stack-8',
          s.school.subjects.length
            ? s.school.subjects.map((sub) => {
                const m = sum(weekSessions.filter((x) => x.subjectId === sub.id), (x) => x.minutes);
                return h('div', h('div.row.between.small', h('span.bold', sub.name), h('span.faint.num', `${m}/${sub.weeklyGoalMin || 120}m`)), h('div.mt-4', progressBar(m / (sub.weeklyGoalMin || 120), { color: sub.color })));
              })
            : h('p.small.muted', 'Add subjects to track study time per subject.')
        )
      ),
      h('div.row.between.mt-12', h('span.small.muted', 'Weekly goal'), stepper(goal, { min: 30, max: 3000, step: 30, suffix: 'm', onChange: (v) => store.update((st) => (st.school.weeklyGoalMin = v), { render: false }) }))
    )
  );

  // Deadlines
  const open = s.school.items.filter((i) => i.status !== 'done').sort((a, b) => ((a.due || '9999') < (b.due || '9999') ? -1 : 1));
  out.appendChild(sectionHead('Deadlines', btn('Add', () => openItemEditor(null), { variant: 'ghost', size: 'sm', iconName: 'plus' })));
  if (!open.length) out.appendChild(empty('calendar', 'No upcoming work', 'Add real assignments, tests and exams. Lockstep never invents school tasks.', btn('Add assignment or test', () => openItemEditor(null), { size: 'sm' })));
  else out.appendChild(h('div.list', open.map((i) => itemRow(s, i, today))));

  out.appendChild(sectionHead('Subjects', btn('Manage', () => openSubjects(), { variant: 'ghost', size: 'sm', iconName: 'edit' })));
  out.appendChild(s.school.subjects.length ? h('div.row.wrap.gap-6', s.school.subjects.map((sub) => pill(`${sub.name}${sub.priority === 'high' ? ' ★' : ''}`, { color: sub.color }))) : h('p.small.muted', 'No subjects yet.'));

  const done = s.school.items.filter((i) => i.status === 'done').sort((a, b) => (b.doneTs || 0) - (a.doneTs || 0));
  const recentSessions = [...s.school.sessions].sort((a, b) => b.ts - a.ts).slice(0, 10);
  out.appendChild(
    h(
      'details.done-group.mt-16',
      h('summary', `Completed work & study history`),
      done.length ? h('div.list', done.slice(0, 20).map((i) => itemRow(s, i, today))) : h('p.small.muted', 'Nothing completed yet.'),
      recentSessions.length ? h('div.list.mt-12', recentSessions.map((x) => listItem({ iconName: 'timer', title: `${fmtDuration(x.minutes)} ${x.subjectId && subj(x.subjectId) ? subj(x.subjectId).name : 'focus'}`, sub: `${relDay(x.day, today)} · ${x.mode === 'focus' ? 'timer' : 'logged manually'}${x.note ? ' · ' + x.note : ''}` }))) : null
    )
  );
  return out;
}

function itemRow(s, i, today) {
  const sub = s.school.subjects.find((x) => x.id === i.subjectId);
  const done = i.status === 'done';
  const days = i.due ? diffDays(today, i.due) : null;
  const chipCls = done ? '' : days !== null && days < 0 ? '.over' : days !== null && days <= 2 ? '.soon' : '';
  return h(
    'div.list-item.deadline-row',
    h('button.task-check' + (done ? '.on' : ''), { type: 'button', 'aria-label': done ? 'Mark not done' : 'Mark done', onclick: () => toggleItem(i.id) }, icon('check', 16)),
    h('button.li-body', { type: 'button', style: 'text-align:left', onclick: () => openItemEditor(i) }, h('div.li-title', i.title), h('div.li-sub', [sub ? sub.name : null, (ITEM_TYPES.find((t) => t.id === i.type) || {}).name, i.estMin ? fmtDuration(i.estMin) : null].filter(Boolean).join(' · '))),
    i.due ? h('span.due-chip' + chipCls, done ? fmtDay(i.due) : relDay(i.due, today)) : null
  );
}

function toggleItem(id) {
  const now = clock.now();
  const res = store.update((s) => {
    const i = s.school.items.find((x) => x.id === id);
    if (!i) return null;
    if (i.status === 'done') {
      i.status = 'todo';
      i.doneTs = null;
      i.doneDay = null;
      return { undone: true, xp: revokeActivityXp(s, 'schoolItem', id, now) };
    }
    i.status = 'done';
    i.doneTs = now;
    i.doneDay = dayKey(now, s.settings);
    const xp = grantActivityXp(s, 'schoolItem', 'school', now, id);
    return { xp, ach: checkAchievements(s, now) };
  });
  if (!res) return;
  if (res.undone) toast('Marked as not done.');
  else {
    if (res.xp) rewardPop({ xp: res.xp, note: 'Schoolwork done' });
    else toast('Done! (Daily XP limit for school tasks reached.)');
    showAchievements(res.ach);
  }
}

export function openItemEditor(existing) {
  const s0 = store.state;
  const d = existing ? { ...existing } : { type: 'assignment', subjectId: s0.school.subjects[0] ? s0.school.subjects[0].id : '', title: '', due: null, priority: 'medium', estMin: 30, notes: '' };
  openSheet({
    title: existing ? 'Edit' : 'Add schoolwork',
    render: (close) =>
      h(
        'div.stack-16',
        field('Type', select(ITEM_TYPES, d.type, (v) => (d.type = v))),
        field('Title', input({ value: d.title, placeholder: 'e.g. Chapter 4 problem set', maxlength: 80, autofocus: !existing, oninput: (e) => (d.title = e.target.value) })),
        field('Subject', select([{ id: '', name: 'No subject' }, ...s0.school.subjects.map((x) => ({ id: x.id, name: x.name }))], d.subjectId, (v) => (d.subjectId = v))),
        h('div.grid-2', field('Due date', dateInput(d.due, (v) => (d.due = v))), field('Priority', select(PRIORITY, d.priority, (v) => (d.priority = v)))),
        field('Estimated time', stepper(d.estMin || 30, { min: 5, max: 600, step: 5, suffix: 'm', onChange: (v) => (d.estMin = v) })),
        field('Notes', textarea({ value: d.notes, rows: 3, maxlength: 500, oninput: (e) => (d.notes = e.target.value) })),
        h(
          'div.sheet-actions',
          btn(existing ? 'Save' : 'Add', () => {
            const title = cleanText(d.title, 80);
            if (!title) return toast('Add a title.', { type: 'error' });
            store.update((st) => {
              const data = { type: d.type, subjectId: d.subjectId || null, title, due: d.due || null, priority: d.priority, estMin: toInt(d.estMin, 30, 5, 600), notes: cleanText(d.notes, 500) };
              if (existing) Object.assign(st.school.items.find((x) => x.id === existing.id), data);
              else st.school.items.push({ id: uid('si'), status: 'todo', createdTs: clock.now(), ...data });
            });
            close();
          }, { block: true, size: 'lg' }),
          existing
            ? btn('Delete', async () => {
                if (!(await confirmDialog({ title: 'Delete this item?', okText: 'Delete', danger: true }))) return;
                store.update((st) => (st.school.items = st.school.items.filter((x) => x.id !== existing.id)));
                close();
              }, { variant: 'ghost', block: true, iconName: 'trash' })
            : null
        )
      ),
  });
}

function openSubjects() {
  openSheet({
    title: 'Subjects',
    render: (close, rerender) => {
      const s = store.state;
      const nameIn = input({ placeholder: 'New subject', maxlength: 40 });
      return h(
        'div.stack-12',
        ...s.school.subjects.map((sub) =>
          h(
            'div.card.flat.tight.stack-8',
            h('div.row.gap-8', h('span.sub-dot', { style: { background: sub.color } }), input({ value: sub.name, maxlength: 40, 'aria-label': 'Subject name', onchange: (e) => store.update((st) => (st.school.subjects.find((x) => x.id === sub.id).name = cleanText(e.target.value, 40) || sub.name), { render: false }) }), iconBtn('trash', async () => {
              if (!(await confirmDialog({ title: `Remove ${sub.name}?`, message: 'Past study sessions are kept.', okText: 'Remove', danger: true }))) return;
              store.update((st) => (st.school.subjects = st.school.subjects.filter((x) => x.id !== sub.id)), { render: false });
              rerender();
            }, { label: `Remove ${sub.name}` })),
            h('div.grid-2', select(PRIORITY, sub.priority, (v) => store.update((st) => (st.school.subjects.find((x) => x.id === sub.id).priority = v), { render: false })), stepper(sub.weeklyGoalMin || 120, { min: 0, max: 1200, step: 15, suffix: 'm/wk', onChange: (v) => store.update((st) => (st.school.subjects.find((x) => x.id === sub.id).weeklyGoalMin = v), { render: false }) }))
          )
        ),
        h('div.row.gap-8', nameIn, btn('Add', () => {
          const name = cleanText(nameIn.value, 40);
          if (!name) return;
          store.update((st) => st.school.subjects.push({ id: uid('sub'), name, priority: 'medium', color: COLORS[st.school.subjects.length % COLORS.length], weeklyGoalMin: 120 }), { render: false });
          rerender();
        }, { variant: 'ghost' })),
        btn('Done', () => (close(), store.notify()), { block: true })
      );
    },
  });
}

function openTimetable() {
  let day = 1;
  openSheet({
    title: 'Timetable',
    render: (close, rerender) => {
      const s = store.state;
      const entries = s.school.timetable.filter((t) => t.day === day).sort((a, b) => (hmToMin(a.start) ?? 0) - (hmToMin(b.start) ?? 0));
      const nd = { subjectId: s.school.subjects[0] ? s.school.subjects[0].id : '', start: '09:00', end: '10:00', room: '' };
      return h(
        'div.stack-12',
        segmented([1, 2, 3, 4, 5, 6, 0].map((d) => ({ id: d, name: WD_LONG[d].slice(0, 3) })), day, (v) => ((day = v), rerender()), { small: true }),
        entries.length
          ? h(
              'div.list',
              entries.map((t) => {
                const sub = s.school.subjects.find((x) => x.id === t.subjectId);
                return listItem({ iconName: 'school', iconColor: sub ? sub.color : undefined, title: sub ? sub.name : t.label || 'Class', sub: `${t.start}–${t.end}${t.room ? ' · ' + t.room : ''}`, right: iconBtn('trash', () => (store.update((st) => (st.school.timetable = st.school.timetable.filter((x) => x.id !== t.id)), { render: false }), rerender()), { label: 'Remove class' }) });
              })
            )
          : h('p.small.muted', `No classes on ${WD_LONG[day]}.`),
        h(
          'div.card.flat.stack-8',
          h('div.eyebrow', 'Add a class'),
          select([{ id: '', name: 'Other / free period' }, ...s.school.subjects.map((x) => ({ id: x.id, name: x.name }))], nd.subjectId, (v) => (nd.subjectId = v)),
          h('div.grid-2', timeInput(nd.start, (v) => v && (nd.start = v)), timeInput(nd.end, (v) => v && (nd.end = v))),
          input({ placeholder: 'Room (optional)', maxlength: 30, oninput: (e) => (nd.room = e.target.value) }),
          btn('Add class', () => {
            if ((hmToMin(nd.end) ?? 0) <= (hmToMin(nd.start) ?? 0)) return toast('End time must be after start.', { type: 'error' });
            store.update((st) => st.school.timetable.push({ id: uid('tt'), day, subjectId: nd.subjectId || null, start: nd.start, end: nd.end, room: cleanText(nd.room, 30) }), { render: false });
            rerender();
          }, { variant: 'ghost', block: true, iconName: 'plus' })
        ),
        h('p.tiny.faint', 'Tip: have a timetable screenshot? Add it in Me → Reference images and open it side-by-side while you type.'),
        btn('Done', () => (close(), store.notify()), { block: true })
      );
    },
  });
}

function openManualLog() {
  const s = store.state;
  let subjectId = s.school.subjects[0] ? s.school.subjects[0].id : '';
  let minutes = 30;
  let note = '';
  openSheet({
    title: 'Log a study session',
    size: 'sm',
    render: (close) =>
      h(
        'div.stack-16',
        field('Subject', select([{ id: '', name: 'General' }, ...s.school.subjects.map((x) => ({ id: x.id, name: x.name }))], subjectId, (v) => (subjectId = v))),
        field('Minutes', stepper(minutes, { min: 5, max: 600, step: 5, onChange: (v) => (minutes = v) })),
        field('What did you work on?', input({ maxlength: 200, oninput: (e) => (note = e.target.value) })),
        h('p.tiny.faint', 'Manual logs earn XP and count toward your weekly study goal. Timer-verified quests still need the focus timer.'),
        btn('Log session', () => {
          logManualStudy(subjectId, minutes, note);
          close();
          store.notify();
        }, { block: true })
      ),
  });
}
