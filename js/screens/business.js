// Business: multiple projects with goals, weekly objectives, typed tasks and notes.

import { store } from '../core/store.js';
import { clock, dayKey, weekKey, fmtDay, relDay } from '../core/dates.js';
import { uid, cleanText } from '../core/util.js';
import { h, icon, btn, iconBtn, field, input, textarea, select, dateInput, sectionHead, empty, progressBar, pill } from '../ui/dom.js';
import { openSheet, toast, confirmDialog } from '../ui/overlay.js';
import { topbar } from '../ui/common.js';
import { revokeActivityXp } from '../engine/quests.js';
import { activityAction } from '../services/actions.js';

export const TASK_TYPES = [
  { id: 'research', name: 'Research', color: '#22c3ff' },
  { id: 'product', name: 'Product', color: '#8f7dff' },
  { id: 'marketing', name: 'Marketing', color: '#ff7ad9' },
  { id: 'sales', name: 'Sales', color: '#2ee6b0' },
  { id: 'ops', name: 'Operations', color: '#ffb020' },
  { id: 'admin', name: 'Admin', color: '#9aa0c8' },
];
const typeOf = (id) => TASK_TYPES.find((t) => t.id === id) || TASK_TYPES[5];
const COLORS = ['#ff8a3d', '#4d8dff', '#2ee6b0', '#c58cff', '#ff5d6c', '#ffb020'];

function progressOf(p) {
  const tasks = p.tasks || [];
  return tasks.length ? tasks.filter((t) => t.status === 'done').length / tasks.length : 0;
}

export function businessTab(ctx) {
  const s = ctx.state;
  const out = h('div');
  const wk = weekKey(ctx.today, s.settings.weekStartsOn);
  out.appendChild(h('div.row.gap-8', btn('New project', () => openProjectEditor(null), { block: true, iconName: 'plus' })));
  const projects = s.business.projects;
  if (!projects.length) {
    out.appendChild(h('div.mt-16', empty('briefcase', 'No projects yet', 'Add a real project you’re building. Lockstep rewards shipping meaningful tasks, not busywork.')));
    return out;
  }
  for (const p of projects) {
    const tasks = p.tasks || [];
    const objectives = (p.objectives || []).filter((o) => o.week === wk);
    const doneWeek = tasks.filter((t) => t.status === 'done' && t.doneDay >= wk).length;
    out.appendChild(
      h(
        'a.card.mt-12',
        { href: `#/project/${p.id}`, style: { display: 'block', borderColor: p.status === 'active' ? undefined : 'var(--stroke)' } },
        h('div.row.between.gap-8', h('div.card-title', p.name), pill(p.status, { color: p.status === 'active' ? 'var(--green)' : 'var(--text-3)' })),
        p.goal ? h('div.small.muted.mt-4', `Goal: ${p.goal}`) : null,
        h('div.mt-12', progressBar(progressOf(p), { color: p.color, glow: true })),
        h('div.row.wrap.gap-6.mt-8', pill(`${tasks.filter((t) => t.status === 'done').length}/${tasks.length} tasks`), pill(`${doneWeek} shipped this week`), pill(`${objectives.filter((o) => o.done).length}/${objectives.length} objectives`))
      )
    );
  }
  return out;
}

// ---------- project screen ----------

export function render(ctx) {
  const s = ctx.state;
  const p = s.business.projects.find((x) => x.id === ctx.params[0]);
  if (!p) return h('div.screen', topbar('Project', { back: '#/grind?tab=business' }), empty('briefcase', 'Project not found', ''));
  const today = ctx.today;
  const wk = weekKey(today, s.settings.weekStartsOn);
  const objectives = (p.objectives || []).filter((o) => o.week === wk);
  const tasks = p.tasks || [];
  const groups = [
    ['doing', 'In progress'],
    ['todo', 'To do'],
    ['done', 'Done'],
  ];
  const objIn = input({ placeholder: 'Add an objective for this week', maxlength: 120 });
  const addObj = () => {
    const text = cleanText(objIn.value, 120);
    if (!text) return;
    upd(p.id, (pp) => (pp.objectives ||= []).push({ id: uid('ob'), week: wk, text, done: false }));
  };
  objIn.addEventListener('keydown', (e) => e.key === 'Enter' && addObj());
  return h(
    'div.screen',
    topbar(p.name, { back: '#/grind?tab=business', small: true, sub: p.goal ? `Goal: ${p.goal}` : null, actions: [iconBtn('edit', () => openProjectEditor(p), { label: 'Edit project' })] }),
    h('div.card', h('div.row.between', h('div.eyebrow', 'Progress'), h('span.small.num', `${Math.round(progressOf(p) * 100)}%`)), h('div.mt-8', progressBar(progressOf(p), { color: p.color, thick: true, glow: true })), p.desc ? h('p.small.muted.mt-12', p.desc) : null),
    sectionHead(`This week’s objectives`, h('span.small.faint', `Week of ${fmtDay(wk)}`)),
    h(
      'div.card',
      objectives.length
        ? objectives.map((o) =>
            h('div.task-row' + (o.done ? '.done' : ''), h('button.task-check' + (o.done ? '.on' : ''), { type: 'button', 'aria-label': 'Toggle objective', onclick: () => upd(p.id, (pp) => (pp.objectives.find((x) => x.id === o.id).done = !o.done)) }, icon('check', 16)), h('span.task-title.grow', o.text), iconBtn('x', () => upd(p.id, (pp) => (pp.objectives = pp.objectives.filter((x) => x.id !== o.id))), { label: 'Remove' }))
          )
        : h('p.small.muted', 'Set 1–3 concrete outcomes for this week (e.g. “Launch landing page”).'),
      h('div.row.gap-8.mt-12', objIn, btn('Add', addObj, { variant: 'ghost' }))
    ),
    sectionHead('Tasks', btn('Add task', () => openTaskEditor(p.id, null), { variant: 'ghost', size: 'sm', iconName: 'plus' })),
    tasks.length
      ? groups.map(([st, label]) => {
          const list = tasks.filter((t) => (t.status || 'todo') === st);
          if (!list.length) return null;
          return h(
            'div.card.mt-8',
            h('div.eyebrow', `${label} (${list.length})`),
            list.slice(0, st === 'done' ? 15 : 100).map((t) =>
              h(
                'div.task-row' + (t.status === 'done' ? '.done' : ''),
                h('button.task-check' + (t.status === 'done' ? '.on' : ''), { type: 'button', 'aria-label': t.status === 'done' ? 'Mark not done' : 'Mark done', onclick: () => toggleTask(p.id, t.id) }, icon('check', 16)),
                h('button.grow', { type: 'button', style: 'text-align:left', onclick: () => openTaskEditor(p.id, t) }, h('div.task-title.bold.small', t.title), h('div.tiny.faint', [typeOf(t.type).name, t.due ? `due ${relDay(t.due, today)}` : null, t.doneDay ? `done ${fmtDay(t.doneDay)}` : null].filter(Boolean).join(' · '))),
                h('span.badge', { style: { '--c': typeOf(t.type).color } }, typeOf(t.type).name.slice(0, 4).toUpperCase())
              )
            )
          );
        })
      : empty('list', 'No tasks yet', 'Break the goal into small, shippable tasks.'),
    sectionHead('Notes'),
    notesCard(p)
  );
}

function notesCard(p) {
  const ta = textarea({ rows: 3, maxlength: 2000, placeholder: 'Ideas, customer feedback, decisions…' });
  return h(
    'div.card.stack-12',
    ta,
    btn('Add note', () => {
      const text = cleanText(ta.value, 2000);
      if (!text) return;
      upd(p.id, (pp) => (pp.notes ||= []).unshift({ id: uid('n'), ts: clock.now(), text }));
    }, { variant: 'ghost', size: 'sm', iconName: 'note' }),
    ...(p.notes || []).slice(0, 30).map((n) => h('div.card.flat.tight', h('div.tiny.faint', fmtDay(dayKey(n.ts, store.state.settings))), h('div.small.mt-4', { style: 'white-space:pre-wrap' }, n.text), h('div.right', iconBtn('trash', () => upd(p.id, (pp) => (pp.notes = pp.notes.filter((x) => x.id !== n.id))), { label: 'Delete note' }))))
  );
}

function upd(pid, fn) {
  store.update((s) => {
    const p = s.business.projects.find((x) => x.id === pid);
    if (p) fn(p);
  });
}

function toggleTask(pid, tid) {
  const now = clock.now();
  const s = store.state;
  const p = s.business.projects.find((x) => x.id === pid);
  const t = p && p.tasks.find((x) => x.id === tid);
  if (!t) return;
  if (t.status === 'done') {
    store.update((st) => {
      const tt = st.business.projects.find((x) => x.id === pid).tasks.find((x) => x.id === tid);
      tt.status = 'todo';
      tt.doneTs = null;
      tt.doneDay = null;
      revokeActivityXp(st, 'bizTask', tid, now);
    });
    toast('Marked as not done.');
    return;
  }
  store.update((st) => {
    const tt = st.business.projects.find((x) => x.id === pid).tasks.find((x) => x.id === tid);
    tt.status = 'done';
    tt.doneTs = now;
    tt.doneDay = dayKey(now, st.settings);
  }, { render: false });
  activityAction('project', { id: pid, ref: tid }, 'bizTask', 'business');
}

function openTaskEditor(pid, existing) {
  const d = existing ? { ...existing } : { title: '', type: 'product', due: null, status: 'todo', notes: '' };
  openSheet({
    title: existing ? 'Task' : 'New task',
    size: 'sm',
    render: (close) =>
      h(
        'div.stack-16',
        field('Task', input({ value: d.title, placeholder: 'e.g. Interview 3 potential customers', maxlength: 120, autofocus: !existing, oninput: (e) => (d.title = e.target.value) })),
        h('div.grid-2', field('Type', select(TASK_TYPES, d.type, (v) => (d.type = v))), field('Status', select([{ id: 'todo', name: 'To do' }, { id: 'doing', name: 'In progress' }, { id: 'done', name: 'Done' }], d.status, (v) => (d.status = v)))),
        field('Due date', dateInput(d.due, (v) => (d.due = v))),
        field('Notes', textarea({ value: d.notes, rows: 2, maxlength: 500, oninput: (e) => (d.notes = e.target.value) })),
        h(
          'div.sheet-actions',
          btn('Save', () => {
            const title = cleanText(d.title, 120);
            if (!title) return toast('Describe the task.', { type: 'error' });
            const becameDone = d.status === 'done' && (!existing || existing.status !== 'done');
            const data = { title, type: d.type, due: d.due || null, notes: cleanText(d.notes, 500), status: d.status === 'done' && becameDone ? 'todo' : d.status };
            let tid = existing ? existing.id : uid('t');
            store.update((st) => {
              const p = st.business.projects.find((x) => x.id === pid);
              p.tasks ||= [];
              if (existing) Object.assign(p.tasks.find((x) => x.id === existing.id), data);
              else p.tasks.push({ id: tid, createdTs: clock.now(), ...data });
            }, { render: !becameDone });
            close();
            if (becameDone) toggleTask(pid, tid);
          }, { block: true, size: 'lg' }),
          existing
            ? btn('Delete task', async () => {
                if (!(await confirmDialog({ title: 'Delete this task?', okText: 'Delete', danger: true }))) return;
                upd(pid, (p) => (p.tasks = p.tasks.filter((x) => x.id !== existing.id)));
                close();
              }, { variant: 'ghost', block: true, iconName: 'trash' })
            : null
        )
      ),
  });
}

export function openProjectEditor(existing) {
  const d = existing ? { ...existing } : { name: '', goal: '', desc: '', status: 'active' };
  openSheet({
    title: existing ? 'Edit project' : 'New project',
    render: (close) =>
      h(
        'div.stack-16',
        field('Name', input({ value: d.name, maxlength: 50, placeholder: 'e.g. Sneaker resale shop', autofocus: !existing, oninput: (e) => (d.name = e.target.value) })),
        field('Goal', input({ value: d.goal, maxlength: 120, placeholder: 'A measurable outcome, e.g. First 10 sales', oninput: (e) => (d.goal = e.target.value) })),
        field('Description', textarea({ value: d.desc, rows: 3, maxlength: 600, oninput: (e) => (d.desc = e.target.value) })),
        existing ? field('Status', select([{ id: 'active', name: 'Active' }, { id: 'paused', name: 'Paused' }, { id: 'done', name: 'Done' }], d.status, (v) => (d.status = v))) : null,
        h(
          'div.sheet-actions',
          btn('Save', () => {
            const name = cleanText(d.name, 50);
            if (!name) return toast('Name your project.', { type: 'error' });
            const data = { name, goal: cleanText(d.goal, 120), desc: cleanText(d.desc, 600), status: d.status };
            store.update((st) => {
              if (existing) Object.assign(st.business.projects.find((x) => x.id === existing.id), data);
              else st.business.projects.push({ id: uid('pj'), color: COLORS[st.business.projects.length % COLORS.length], tasks: [], objectives: [], notes: [], createdTs: clock.now(), ...data });
            });
            close();
            if (!existing) toast('Project created. Add a “ship one task” quest from Quests → All → Suggested.', { duration: 5000 });
          }, { block: true, size: 'lg' }),
          existing
            ? btn('Delete project', async () => {
                if (!(await confirmDialog({ title: `Delete “${existing.name}”?`, message: 'All its tasks, objectives and notes will be deleted. This can’t be undone.', okText: 'Delete', danger: true }))) return;
                store.update((st) => (st.business.projects = st.business.projects.filter((x) => x.id !== existing.id)));
                close();
                location.hash = '#/grind?tab=business';
              }, { variant: 'ghost', block: true, iconName: 'trash' })
            : null
        )
      ),
  });
}

