// Body: Fitness (muscle map, routines, library, history) and Face & self-care (sections A–E).

import { store } from '../core/store.js';
import { clock, addDays, fmtDay, fmtTime, fmtTs, WD_SHORT, weekday, dayKey, relDay } from '../core/dates.js';
import { fmtNum, fmtDuration } from '../core/util.js';
import { h, icon, btn, iconBtn, segmented, sectionHead, empty, listItem, clear, pill } from '../ui/dom.js';
import { topbar } from '../ui/common.js';
import { muscleMap, muscleLegend } from '../ui/charts.js';
import { exerciseById, routineMinutes } from '../data/exercises.js';
import { CARE_SECTIONS, careStepMinutes } from '../data/care.js';
import { openRoutineEditor, openExerciseLibrary } from './workout.js';
import { openCareRoutineEditor, openProductsSheet } from './routine.js';

let tab = 'fitness';

export function render(ctx) {
  if (ctx.query.tab) tab = ctx.query.tab === 'care' ? 'care' : 'fitness';
  const body = h('div.mt-16');
  const paint = () => {
    clear(body);
    body.appendChild(tab === 'fitness' ? fitnessTab(ctx) : careTab(ctx));
  };
  paint();
  return h(
    'div.screen',
    topbar(tab === 'fitness' ? 'Health' : 'Self-care', {
      actions: [iconBtn('history', () => openHistory(), { label: 'Workout history' })],
    }),
    segmented(
      [
        { id: 'fitness', name: 'Fitness', iconName: 'dumbbell' },
        { id: 'care', name: 'Face & Care', iconName: 'sparkle' },
      ],
      tab,
      (v) => {
        tab = v;
        history.replaceState(null, '', `#/body?tab=${v}`);
        ctx.refresh();
      }
    ),
    body
  );
}

// ---------- Fitness ----------

export function weeklyMuscleSets(s, today) {
  const from = addDays(today, -6);
  const sets = {};
  for (const sess of s.fitness.sessions) {
    if (sess.day < from || sess.day > today) continue;
    for (const ex of sess.exercises || []) {
      const def = exerciseById(s, ex.exId);
      if (!def) continue;
      const n = (ex.sets || []).filter((x) => x.done).length;
      for (const m of def.muscles) sets[m] = (sets[m] || 0) + n;
      for (const m of def.secondary || []) sets[m] = (sets[m] || 0) + n * 0.5;
    }
  }
  return sets;
}

function fitnessTab(ctx) {
  const s = ctx.state;
  const today = ctx.today;
  const wd = weekday(today);
  const sets = weeklyMuscleSets(s, today);
  const active = s.fitness.active;
  const todays = s.fitness.routines.filter((r) => (r.days || []).includes(wd));
  const out = h('div');
  if (active)
    out.appendChild(
      h('div.card.glow', h('div.eyebrow', 'Workout in progress'), h('div.card-title.mt-4', active.name), h('div.small.muted', `Started ${fmtTs(active.startTs, s.settings, s.settings.clock24)}`), h('div.mt-12', btn('Resume workout', () => (location.hash = `#/workout/${active.routineId || 'empty'}`), { block: true, iconName: 'play' })))
    );
  out.appendChild(
    h(
      'div.card.mt-12',
      h('div.row.between', h('div.eyebrow', 'Muscles trained · last 7 days'), h('span.tiny.faint', 'sets')),
      muscleMap(sets),
      muscleLegend(),
      h('div.mt-16', btn('Start Empty Workout', () => (location.hash = '#/workout/empty'), { block: true, iconName: 'plus' }))
    )
  );
  if (s.profile.fitness.limitations) out.appendChild(h('div.info-row.mt-12', icon('alert', 16), h('span', `Your note: ${s.profile.fitness.limitations}`)));

  out.appendChild(sectionHead('Routines', btn('New', () => openRoutineEditor(null), { variant: 'ghost', size: 'sm', iconName: 'plus' })));
  const routines = [...s.fitness.routines].sort((a, b) => (todays.includes(b) ? 1 : 0) - (todays.includes(a) ? 1 : 0));
  if (!routines.length) out.appendChild(empty('dumbbell', 'No routines yet', 'Create one, or add exercises from the library.', btn('Create routine', () => openRoutineEditor(null), { size: 'sm' })));
  for (const r of routines) {
    const isToday = todays.includes(r);
    const doneToday = s.fitness.sessions.some((x) => x.day === today && x.routineId === r.id);
    out.appendChild(
      h(
        'div.card.routine-card' + (isToday ? '.glow' : ''),
        h('div.row.between.gap-8', h('div.routine-title', r.name), iconBtn('more', () => openRoutineEditor(r), { label: `Edit ${r.name}` })),
        h('div.routine-ex.mt-4', r.exercises.slice(0, 3).map((x) => (exerciseById(s, x.exId) || { name: x.exId }).name).join(', ') + (r.exercises.length > 3 ? ` +${r.exercises.length - 3}` : '')),
        h('div.row.wrap.gap-6.mt-8', isToday ? pill('Today', { color: 'var(--accent)' }) : null, doneToday ? pill('Done', { color: 'var(--green)', iconName: 'check' }) : null, pill(r.days && r.days.length ? r.days.map((d) => WD_SHORT[d]).join(' ') : 'Unscheduled'), pill(`~${routineMinutes(s, r)} min`)),
        h('div.mt-12', btn(doneToday ? 'Do it again' : 'Start Routine', () => (location.hash = `#/workout/${r.id}`), { block: true, variant: isToday && !doneToday ? 'primary' : 'ghost', iconName: 'play' }))
      )
    );
  }
  out.appendChild(sectionHead('Exercise library'));
  out.appendChild(h('div.list', listItem({ iconName: 'search', title: 'Browse exercises', sub: 'Instructions, easier/harder variations, muscles', onClick: () => openExerciseLibrary({}) })));

  // Progress
  const recent = [...s.fitness.sessions].sort((a, b) => b.startTs - a.startTs).slice(0, 5);
  out.appendChild(sectionHead('Recent workouts', h('button.small.accent', { type: 'button', onclick: openHistory }, 'All')));
  if (!recent.length) out.appendChild(h('div.card.flat', h('p.small.muted', 'Finish a workout to see your history and personal records here.')));
  else out.appendChild(h('div.list', recent.map((x) => sessionItem(s, x, today))));
  const prs = Object.entries(s.fitness.prs || {});
  if (prs.length) {
    out.appendChild(sectionHead('Personal records'));
    out.appendChild(
      h(
        'div.list',
        prs.slice(0, 12).map(([exId, pr]) => {
          const ex = exerciseById(s, exId);
          return listItem({ iconName: 'trophy', iconColor: 'var(--yellow)', title: ex ? ex.name : exId, sub: `${pr.reps ? `${pr.reps} ${ex && ex.unit === 'sec' ? 'sec' : 'reps'}` : ''}${pr.weight ? ` · ${pr.weight} kg` : ''}${pr.day ? ` · ${fmtDay(pr.day)}` : ''}` });
        })
      )
    );
  }
  out.appendChild(h('div.card.flat.mt-16', h('div.row.gap-8', icon('heart', 16, 'red'), h('div.bold.small', 'Train smart')), h('p.small.muted.mt-8', 'Rest days are part of the plan. Never train through sharp pain. Use the easier variation whenever your form breaks down, and progress slowly (add 1–2 reps or a little weight when every set feels solid).')));
  return out;
}

function sessionItem(s, x, today) {
  const sets = (x.exercises || []).reduce((a, e) => a + (e.sets || []).filter((y) => y.done).length, 0);
  return listItem({ iconName: 'dumbbell', title: x.name, sub: `${relDay(x.day, today)} · ${sets} sets · ${fmtDuration(Math.round((x.endTs - x.startTs) / 60000))}`, onClick: () => openSession(x.id) });
}

function openHistory() {
  import('../ui/overlay.js').then(({ openSheet }) =>
    openSheet({
      title: 'Workout history',
      render: () => {
        const s = store.state;
        const today = dayKey(clock.now(), s.settings);
        const all = [...s.fitness.sessions].sort((a, b) => b.startTs - a.startTs);
        const totalSets = all.reduce((a, x) => a + (x.exercises || []).reduce((b, e) => b + (e.sets || []).filter((y) => y.done).length, 0), 0);
        return h(
          'div.stack-12',
          h('div.grid-3', h('div.stat', h('div.stat-value.num', String(all.length)), h('div.stat-label', 'Workouts')), h('div.stat', h('div.stat-value.num', fmtNum(totalSets)), h('div.stat-label', 'Sets')), h('div.stat', h('div.stat-value.num', fmtDuration(all.reduce((a, x) => a + Math.round((x.endTs - x.startTs) / 60000), 0))), h('div.stat-label', 'Time'))),
          all.length ? h('div.list', all.slice(0, 60).map((x) => sessionItem(s, x, today))) : h('p.muted', 'No workouts logged yet.')
        );
      },
    })
  );
}

function openSession(id) {
  import('../ui/overlay.js').then(({ openSheet }) =>
    openSheet({
      title: 'Workout',
      render: () => {
        const s = store.state;
        const x = s.fitness.sessions.find((y) => y.id === id);
        if (!x) return h('p.muted', 'Not found.');
        return h(
          'div.stack-12',
          h('div.card-title', x.name),
          h('div.small.muted', `${fmtDay(x.day, { weekday: true })} · ${fmtDuration(Math.round((x.endTs - x.startTs) / 60000))}`),
          x.notes ? h('p.small', x.notes) : null,
          ...(x.exercises || []).map((e) => {
            const def = exerciseById(s, e.exId);
            const done = (e.sets || []).filter((y) => y.done);
            return h('div.card.flat', h('div.bold', def ? def.name : e.exId), h('div.small.muted', done.length ? done.map((y) => `${y.reps ?? '–'}${def && def.unit === 'sec' ? 's' : ''}${y.weight ? ` × ${y.weight}kg` : ''}`).join(' · ') : 'No sets completed'));
          })
        );
      },
    })
  );
}

// ---------- Face & self-care ----------

function careTab(ctx) {
  const s = ctx.state;
  const today = ctx.today;
  const out = h('div');
  out.appendChild(
    h('div.card.flat', h('div.row.gap-8', icon('heart', 16, 'accent'), h('div.bold.small', 'Consistency over perfection')), h('p.small.muted.mt-8', 'These routines reward showing up for yourself — not chasing appearance standards. Keep them simple and adjust anything that doesn’t feel right for you.'))
  );
  for (const sec of CARE_SECTIONS) {
    const list = s.care.routines.filter((r) => r.section === sec.id);
    out.appendChild(
      h(
        'div.mt-16',
        h('div.row.between.gap-8', h('div.row.gap-8', h('div.li-icon', { style: { '--c': sec.color } }, icon(sec.icon, 18)), h('div', h('div.section-title', { style: 'font-size:18px' }, sec.name), h('div.small.muted', sec.blurb))), iconBtn('plus', () => openCareRoutineEditor(null, { section: sec.id }), { label: `Add ${sec.name} routine` })),
        sec.id === 'skin' ? h('div.mt-8', btn('Products & sensitivities', () => openProductsSheet(), { variant: 'ghost', size: 'sm', iconName: 'droplet' })) : null,
        h(
          'div.list.mt-8',
          list.length
            ? list.map((r) => {
                const done = s.care.logs.some((l) => l.routineId === r.id && l.day === today && l.complete);
                const linked = s.quests.find((q) => q.linked && q.linked.kind === 'care' && q.linked.id === r.id && !q.archived);
                return listItem({
                  iconName: done ? 'check' : 'play',
                  iconColor: done ? 'var(--green)' : sec.color,
                  title: r.name,
                  sub: `${r.time ? fmtTime(r.time, s.settings.clock24) + ' · ' : ''}${r.steps.length} steps · ${careStepMinutes(r.steps)} min${r.weekly ? ' · weekly' : ''}${linked ? (linked.paused ? ' · quest paused' : ' · daily quest') : ''}`,
                  right: iconBtn('edit', (e) => (e.stopPropagation(), openCareRoutineEditor(r)), { label: `Edit ${r.name}` }),
                  onClick: () => (location.hash = `#/routine/${r.id}`),
                  chevron: false,
                });
              })
            : h('div.list-item', h('div.li-body.small.muted', 'No routines here yet. Tap + to add one.'))
        ),
        sec.disclaimer ? h('p.tiny.faint.mt-8', sec.disclaimer) : null
      )
    );
  }
  return out;
}
