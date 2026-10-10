// Workout player, routine editor and exercise library.

import { store } from '../core/store.js';
import { clock, dayKey, WD_SHORT } from '../core/dates.js';
import { uid, cleanText, toInt, toNum, fmtClock, fmtDuration } from '../core/util.js';
import { h, icon, btn, iconBtn, field, input, textarea, select, dayPicker, timeInput, stepper, chips, clear, empty, pill, listItem, haptic } from '../ui/dom.js';
import { openSheet, toast, confirmDialog } from '../ui/overlay.js';
import { topbar } from '../ui/common.js';
import { EQUIPMENT, MUSCLES, exerciseById, allExercises, available, routineMinutes } from '../data/exercises.js';
import { createQuest } from '../engine/quests.js';
import { activityAction } from '../services/actions.js';
import { countBeep, unlockAudio } from '../services/audio.js';
import { refPreview } from './references.js';

let restTimer = null;
let elapsedTimer = null;

export function cleanup() {
  clearInterval(restTimer);
  clearInterval(elapsedTimer);
  restTimer = null;
  elapsedTimer = null;
}

const WEIGHTED = new Set(['dumbbells', 'gym', 'bands']);

export function render(ctx) {
  cleanup();
  const s = ctx.state;
  const id = ctx.params[0] || 'empty';
  const routine = id === 'empty' ? null : s.fitness.routines.find((r) => r.id === id);
  if (id !== 'empty' && !routine) return h('div.screen', topbar('Workout', { back: '#/body' }), empty('dumbbell', 'Routine not found', 'It may have been deleted.'));
  const active = s.fitness.active;
  if (active && (active.routineId || 'empty') === id) return player(s, active);
  if (active) {
    return h(
      'div.screen',
      topbar('Workout', { back: '#/body' }),
      h('div.card.warn', h('div.bold', `“${active.name}” is still in progress`), h('div.small.muted.mt-4', 'Finish or discard it before starting another workout.')),
      h('div.stack-8.mt-16', btn('Resume it', () => (location.hash = `#/workout/${active.routineId || 'empty'}`), { block: true }), btn('Discard it and continue', () => discardActive(), { variant: 'ghost', block: true }))
    );
  }
  return preview(s, routine);
}

function preview(s, routine) {
  if (!routine)
    return h(
      'div.screen',
      topbar('Empty workout', { back: '#/body' }),
      h('p.muted', 'Build it as you go — add exercises from the library and log your sets.'),
      h('div.mt-16', btn('Start workout', () => startWorkout(null), { block: true, size: 'lg', iconName: 'play' }))
    );
  return h(
    'div.screen',
    topbar(routine.name, { back: '#/body', small: true, actions: [iconBtn('edit', () => openRoutineEditor(routine), { label: 'Edit routine' })] }),
    h('div.row.wrap.gap-6', pill(`~${routineMinutes(s, routine)} min`, { iconName: 'clock' }), pill(`${routine.exercises.length} exercises`), routine.days && routine.days.length ? pill(routine.days.map((d) => WD_SHORT[d]).join(' ')) : null),
    routine.notes ? h('p.small.muted.mt-12', routine.notes) : null,
    h(
      'div.list.mt-16',
      routine.exercises.map((x) => {
        const ex = exerciseById(s, x.exId);
        return listItem({ iconName: 'dumbbell', title: ex ? ex.name : x.exId, sub: `${x.sets} × ${x.reps}${ex && ex.unit === 'sec' ? ' sec' : ''} · rest ${x.restSec ?? 60}s`, onClick: () => ex && openExerciseDetail(ex.id) });
      })
    ),
    h('div.mt-24', btn('Start workout', () => startWorkout(routine), { block: true, size: 'lg', iconName: 'play' })),
    h('p.tiny.faint.center-text.mt-12', 'Warm up for 3–5 minutes first. Stop if anything hurts.')
  );
}

function startWorkout(routine) {
  unlockAudio();
  const now = clock.now();
  store.update((s) => {
    s.fitness.active = {
      id: uid('w'),
      routineId: routine ? routine.id : null,
      name: routine ? routine.name : 'Workout',
      startTs: now,
      restUntil: null,
      exercises: routine
        ? routine.exercises.map((x) => ({ exId: x.exId, restSec: x.restSec ?? 60, sets: Array.from({ length: x.sets }, () => ({ target: x.reps, reps: null, weight: null, done: false })) }))
        : [],
    };
  });
}

function upd(fn, render = true) {
  store.update((s) => s.fitness.active && fn(s.fitness.active, s), { render });
}

function player(s, w) {
  const elapsed = h('span.num');
  const paintElapsed = () => (elapsed.textContent = fmtClock((clock.now() - w.startTs) / 1000));
  paintElapsed();
  elapsedTimer = setInterval(paintElapsed, 1000);
  const doneSets = w.exercises.reduce((a, e) => a + e.sets.filter((x) => x.done).length, 0);
  const totalSets = w.exercises.reduce((a, e) => a + e.sets.length, 0);

  const cards = w.exercises.map((e, ei) => {
    const ex = exerciseById(s, e.exId) || { name: e.exId, unit: 'reps', equipment: 'none', instructions: [] };
    const showWeight = WEIGHTED.has(ex.equipment);
    return h(
      'div.card.ex-card',
      h(
        'div.row.between.gap-8',
        h('button.ex-name', { type: 'button', onclick: () => openExerciseDetail(ex.id), style: 'text-align:left' }, ex.name, ' ', icon('info', 14, 'faint')),
        h(
          'div.row.gap-6',
          ex.easier ? iconBtn('chevronDown', () => swap(ei, ex.easier), { label: 'Swap to easier variation' }) : null,
          ex.harder ? iconBtn('chevronUp', () => swap(ei, ex.harder), { label: 'Swap to harder variation' }) : null,
          iconBtn('trash', () => upd((a) => a.exercises.splice(ei, 1)), { label: 'Remove exercise' })
        )
      ),
      ex.safety ? h('div.tiny.orange.mt-4', ex.safety) : null,
      h('div.set-row.tiny.faint.mt-8', h('span.set-idx', 'SET'), h('span', ex.unit === 'sec' ? 'SECONDS' : 'REPS'), h('span', showWeight ? 'KG' : 'TARGET'), h('span')),
      e.sets.map((set, si) =>
        h(
          'div.set-row',
          h('span.set-idx', String(si + 1)),
          h('input.input.set-input', {
            type: 'number',
            inputmode: 'numeric',
            min: 0,
            placeholder: String(set.target),
            value: set.reps ?? '',
            'aria-label': `Set ${si + 1} ${ex.unit === 'sec' ? 'seconds' : 'reps'}`,
            onchange: (ev) => upd((a) => (a.exercises[ei].sets[si].reps = ev.target.value === '' ? null : toInt(ev.target.value, 0, 0, 9999)), false),
          }),
          showWeight
            ? h('input.input.set-input', { type: 'number', inputmode: 'decimal', min: 0, step: 'any', placeholder: '–', value: set.weight ?? '', 'aria-label': `Set ${si + 1} weight`, onchange: (ev) => upd((a) => (a.exercises[ei].sets[si].weight = ev.target.value === '' ? null : toNum(ev.target.value, 0, 0, 2000)), false) })
            : h('span.small.muted.center-text', `${set.target}${ex.unit === 'sec' ? 's' : ''}`),
          h(
            'button.set-done' + (set.done ? '.on' : ''),
            {
              type: 'button',
              'aria-label': set.done ? `Set ${si + 1} done` : `Complete set ${si + 1}`,
              onclick: () => {
                haptic(15);
                upd((a) => {
                  const x = a.exercises[ei].sets[si];
                  x.done = !x.done;
                  if (x.done && (x.reps === null || x.reps === undefined)) x.reps = x.target;
                  if (x.done) a.restUntil = clock.now() + (a.exercises[ei].restSec ?? 60) * 1000;
                });
              },
            },
            icon('check', 18)
          )
        )
      ),
      h(
        'div.row.gap-8.mt-8',
        btn('Add set', () => upd((a) => a.exercises[ei].sets.push({ target: a.exercises[ei].sets.at(-1)?.target || 10, reps: null, weight: null, done: false })), { variant: 'ghost', size: 'sm', iconName: 'plus' }),
        e.sets.length > 1 ? btn('Remove set', () => upd((a) => a.exercises[ei].sets.pop()), { variant: 'ghost', size: 'sm', iconName: 'minus' }) : null
      )
    );
  });

  const restBar = h('div.rest-bar.hidden');
  const paintRest = () => {
    const a = store.state.fitness.active;
    if (!a || !a.restUntil) return restBar.classList.add('hidden');
    const left = Math.ceil((a.restUntil - clock.now()) / 1000);
    if (left <= 0) {
      restBar.classList.add('hidden');
      if (left > -2 && !restBar.dataset.beeped) {
        restBar.dataset.beeped = '1';
        countBeep(true);
        haptic(200);
      }
      return;
    }
    restBar.dataset.beeped = '';
    restBar.classList.remove('hidden');
    restBar.querySelector('.rest-time').textContent = fmtClock(left);
    if (left <= 3) countBeep(false);
  };
  restBar.append(
    h('div.grow', h('div.tiny.faint', 'REST'), h('div.rest-time', '0:00')),
    btn('+15s', () => upd((a) => (a.restUntil = (a.restUntil || clock.now()) + 15000), false), { variant: 'ghost', size: 'sm' }),
    btn('Skip', () => upd((a) => (a.restUntil = null)), { variant: 'ghost', size: 'sm' })
  );
  paintRest();
  restTimer = setInterval(paintRest, 1000);

  return h(
    'div.screen',
    topbar(w.name, { back: '#/body', small: true, sub: h('span', 'Elapsed ', elapsed, ` · ${doneSets}/${totalSets} sets`), actions: [btn('Finish', () => finishWorkout(), { size: 'sm', variant: 'success' })] }),
    s.profile.fitness.limitations ? h('div.info-row', icon('alert', 16), h('span', s.profile.fitness.limitations)) : null,
    h('div.stack-12.mt-12', cards),
    !w.exercises.length ? empty('dumbbell', 'No exercises yet', 'Add exercises from the library.') : null,
    h('div.mt-16', btn('Add exercise', () => openExerciseLibrary({ onPick: (exId) => upd((a) => a.exercises.push({ exId, restSec: 60, sets: Array.from({ length: 3 }, () => ({ target: (exerciseById(store.state, exId) || {}).unit === 'sec' ? 30 : 10, reps: null, weight: null, done: false })) })) }), { block: true, variant: 'ghost', iconName: 'plus' })),
    h('div.mt-12', btn('Discard workout', () => discardActive(), { block: true, variant: 'ghost', size: 'sm', iconName: 'trash' })),
    h('div', { style: 'height:80px' }),
    restBar
  );
}

function swap(ei, exId) {
  const ex = exerciseById(store.state, exId);
  upd((a) => (a.exercises[ei].exId = exId));
  if (ex) toast(`Swapped to ${ex.name}.`);
}

async function discardActive() {
  if (!(await confirmDialog({ title: 'Discard this workout?', message: 'Nothing from it will be saved.', okText: 'Discard', danger: true }))) return;
  store.update((s) => (s.fitness.active = null));
  location.hash = '#/body';
}

function finishWorkout() {
  const s = store.state;
  const w = s.fitness.active;
  if (!w) return;
  const doneSets = w.exercises.reduce((a, e) => a + e.sets.filter((x) => x.done).length, 0);
  const planned = w.exercises.reduce((a, e) => a + e.sets.length, 0);
  if (!doneSets) return toast('Complete at least one set before finishing (tap the ✓ next to a set).', { type: 'error' });
  const now = clock.now();
  const mins = Math.max(1, Math.round((now - w.startTs) / 60000));
  // PRs
  const prsNew = [];
  for (const e of w.exercises) {
    const best = e.sets.filter((x) => x.done).reduce((m, x) => ({ reps: Math.max(m.reps, x.reps || 0), weight: Math.max(m.weight, x.weight || 0) }), { reps: 0, weight: 0 });
    const old = (s.fitness.prs || {})[e.exId] || { reps: 0, weight: 0 };
    if (best.reps > old.reps || best.weight > old.weight) prsNew.push({ exId: e.exId, reps: Math.max(best.reps, old.reps), weight: Math.max(best.weight, old.weight) });
  }
  let notes = '';
  openSheet({
    title: 'Finish workout',
    size: 'sm',
    render: (close) =>
      h(
        'div.stack-16',
        h('div.grid-3', h('div.stat', h('div.stat-value.num', fmtDuration(mins)), h('div.stat-label', 'Time')), h('div.stat', h('div.stat-value.num', `${doneSets}/${planned}`), h('div.stat-label', 'Sets')), h('div.stat', h('div.stat-value.num', String(prsNew.length)), h('div.stat-label', 'New PRs'))),
        prsNew.length ? h('div.info-row.ok', icon('trophy', 16), h('span', `New records: ${prsNew.map((p) => (exerciseById(s, p.exId) || { name: p.exId }).name).join(', ')}`)) : null,
        doneSets / planned < 0.5 ? h('div.info-row', icon('info', 16), h('span', 'Less than half the planned sets are done, so this will be logged but won’t complete the linked quest.')) : null,
        field('How did it feel? (optional)', textarea({ rows: 2, maxlength: 300, placeholder: 'e.g. push-ups felt easier, left knee a bit sore', oninput: (e) => (notes = e.target.value) })),
        btn('Save workout', () => {
          const ws = store.state.fitness.active;
          const today = dayKey(now, store.state.settings);
          store.update(
            (st) => {
              st.fitness.sessions.push({ id: ws.id, routineId: ws.routineId, name: ws.name, startTs: ws.startTs, endTs: now, day: today, exercises: ws.exercises, notes: cleanText(notes, 300), setsDone: doneSets, setsPlanned: planned });
              st.fitness.prs ||= {};
              for (const p of prsNew) st.fitness.prs[p.exId] = { reps: p.reps, weight: p.weight, day: today };
              st.fitness.active = null;
            },
            { render: false }
          );
          close();
          if (doneSets / planned >= 0.5) activityAction('workout', { id: ws.routineId, ref: ws.id }, 'workout', 'fitness');
          else activityAction('none', {}, 'workout', 'fitness');
          location.hash = '#/body';
        }, { block: true, size: 'lg', iconName: 'check' })
      ),
  });
}

// ---------- routine editor ----------

export function openRoutineEditor(existing, opts = {}) {
  const isNew = !existing;
  const d = existing ? JSON.parse(JSON.stringify(existing)) : { name: '', days: [], time: store.state.profile.fitness.time || '17:30', exercises: [], notes: '' };
  let makeQuest = isNew;
  openSheet({
    title: isNew ? 'New routine' : 'Edit routine',
    render: (close, rerender) => {
      const s = store.state;
      const hasQuest = existing && s.quests.some((q) => q.linked && q.linked.kind === 'workout' && q.linked.id === existing.id && !q.archived);
      return h(
        'div.stack-16',
        opts.refId ? refPreview(opts.refId) : null,
        field('Name', input({ value: d.name, placeholder: 'e.g. Back & Biceps', maxlength: 50, oninput: (e) => (d.name = e.target.value) })),
        field('Training days', dayPicker(d.days, (v) => (d.days = v))),
        field('Time', timeInput(d.time, (v) => (d.time = v))),
        h(
          'div',
          h('div.field-label', 'Exercises'),
          d.exercises.length
            ? h(
                'div.stack-8',
                d.exercises.map((x, i) => {
                  const ex = exerciseById(s, x.exId);
                  return h(
                    'div.card.flat.tight',
                    h('div.row.between', h('div.bold', ex ? ex.name : x.exId), h('div.row.gap-6', i > 0 ? iconBtn('chevronUp', () => (d.exercises.splice(i - 1, 0, d.exercises.splice(i, 1)[0]), rerender()), { label: 'Move up' }) : null, iconBtn('trash', () => (d.exercises.splice(i, 1), rerender()), { label: 'Remove' }))),
                    h('div.grid-3.mt-8', field('Sets', stepper(x.sets, { min: 1, max: 10, onChange: (v) => (x.sets = v) })), field(ex && ex.unit === 'sec' ? 'Sec' : 'Reps', stepper(x.reps, { min: 1, max: ex && ex.unit === 'sec' ? 1800 : 200, step: ex && ex.unit === 'sec' ? 5 : 1, onChange: (v) => (x.reps = v) })), field('Rest', stepper(x.restSec ?? 60, { min: 0, max: 300, step: 15, suffix: 's', onChange: (v) => (x.restSec = v) })))
                  );
                })
              )
            : h('p.small.muted', 'No exercises yet.'),
          h('div.mt-8', btn('Add exercise', () => openExerciseLibrary({ onPick: (exId) => (d.exercises.push({ exId, sets: 3, reps: (exerciseById(s, exId) || {}).unit === 'sec' ? 30 : 10, restSec: 60 }), rerender()) }), { variant: 'ghost', block: true, iconName: 'plus' }))
        ),
        field('Notes', textarea({ value: d.notes, rows: 2, maxlength: 300, placeholder: 'Warm-up, cues, progression plan…', oninput: (e) => (d.notes = e.target.value) })),
        !hasQuest ? h('label.toggle-row', h('div.li-body', h('div.li-title', 'Add as a daily quest'), h('div.li-sub', 'Completes automatically when you finish this routine.')), h('input', { type: 'checkbox', checked: makeQuest, onchange: (e) => (makeQuest = e.target.checked), style: 'width:22px;height:22px' })) : null,
        h(
          'div.sheet-actions',
          btn(isNew ? 'Create routine' : 'Save', () => {
            const name = cleanText(d.name, 50);
            if (!name) return toast('Give the routine a name.', { type: 'error' });
            if (!d.exercises.length) return toast('Add at least one exercise.', { type: 'error' });
            const now = clock.now();
            store.update((st) => {
              let r;
              if (existing) {
                r = st.fitness.routines.find((x) => x.id === existing.id);
                Object.assign(r, { name, days: d.days, time: d.time, exercises: d.exercises, notes: cleanText(d.notes, 300) });
              } else {
                r = { id: uid('r'), key: null, name, days: d.days, time: d.time, exercises: d.exercises, notes: cleanText(d.notes, 300), createdAt: now };
                st.fitness.routines.push(r);
              }
              const q = st.quests.find((x) => x.linked && x.linked.kind === 'workout' && x.linked.id === r.id && !x.archived);
              const mins = routineMinutes(st, r);
              if (q && d.days.length) Object.assign(q, { title: `Workout: ${name}`, days: d.days, time: d.time, durationMin: mins });
              if (!q && makeQuest && d.days.length) createQuest(st, { title: `Workout: ${name}`, category: 'fitness', days: d.days, time: d.time, durationMin: mins, difficulty: mins >= 45 ? 'epic' : mins >= 25 ? 'hard' : 'medium', description: 'Complete this routine in the workout player.', linked: { kind: 'workout', id: r.id } }, now);
            });
            close();
            toast(isNew ? 'Routine created.' : 'Routine saved.', { type: 'success' });
          }, { block: true, size: 'lg' }),
          existing
            ? btn('Delete routine', async () => {
                if (!(await confirmDialog({ title: `Delete “${existing.name}”?`, message: 'Past workouts stay in your history. Its quest (if any) is removed from your schedule.', okText: 'Delete', danger: true }))) return;
                const { deleteQuest } = await import('../engine/quests.js');
                store.update((st) => {
                  st.fitness.routines = st.fitness.routines.filter((x) => x.id !== existing.id);
                  for (const q of st.quests.filter((x) => x.linked && x.linked.kind === 'workout' && x.linked.id === existing.id && !x.archived)) deleteQuest(st, q.id, clock.now());
                });
                close();
              }, { variant: 'ghost', block: true, iconName: 'trash' })
            : null
        )
      );
    },
  });
}

// ---------- library ----------

export function openExerciseLibrary({ onPick } = {}) {
  let q = '';
  let mine = true;
  let pattern = 'all';
  openSheet({
    title: onPick ? 'Add exercise' : 'Exercise library',
    size: 'full',
    render: (close, rerender) => {
      const s = store.state;
      const eq = s.profile.fitness.equipment;
      const listEl = h('div.list');
      const paintList = () => {
        clear(listEl);
        const items = allExercises(s).filter((e) => (!mine || available(e, eq)) && (pattern === 'all' || e.pattern === pattern) && (!q || e.name.toLowerCase().includes(q.toLowerCase()) || e.muscles.some((m) => (MUSCLES[m] || m).toLowerCase().includes(q.toLowerCase()))));
        if (!items.length) listEl.appendChild(h('div.list-item', h('div.li-body.small.muted', 'No exercises match.')));
        for (const e of items)
          listEl.appendChild(
            listItem({
              iconName: 'dumbbell',
              title: e.name,
              sub: `${e.muscles.map((m) => MUSCLES[m] || m).join(', ')} · ${(EQUIPMENT.find((x) => x.id === e.equipment) || {}).name || e.equipment}`,
              right: onPick ? btn('Add', () => (onPick(e.id), close()), { variant: 'ghost', size: 'sm' }) : null,
              onClick: () => openExerciseDetail(e.id, onPick ? () => (onPick(e.id), close()) : null),
              chevron: !onPick,
            })
          );
      };
      paintList();
      const search = input({ placeholder: 'Search by name or muscle', type: 'search', oninput: (e) => ((q = e.target.value), paintList()) });
      search.value = q;
      return h(
        'div.stack-12',
        search,
        chips(
          [
            { id: 'all', name: 'All' },
            { id: 'push', name: 'Push' },
            { id: 'pull', name: 'Pull' },
            { id: 'legs', name: 'Legs' },
            { id: 'core', name: 'Core' },
            { id: 'mobility', name: 'Mobility' },
            { id: 'cardio', name: 'Cardio' },
          ],
          pattern,
          (v) => ((pattern = v), paintList()),
          { multi: false }
        ),
        h('label.toggle-row', h('div.li-body', h('div.li-title.small', 'Only my equipment')), h('input', { type: 'checkbox', checked: mine, onchange: (e) => ((mine = e.target.checked), paintList()), style: 'width:22px;height:22px' })),
        listEl,
        btn('Create custom exercise', () => (close(), openCustomExercise(onPick)), { variant: 'ghost', block: true, iconName: 'plus' })
      );
    },
  });
}

export function openExerciseDetail(exId, onAdd) {
  const s = store.state;
  const e = exerciseById(s, exId);
  if (!e) return;
  openSheet({
    title: e.name,
    render: (close) =>
      h(
        'div.stack-12',
        h('div.row.wrap.gap-6', pill(e.pattern), pill((EQUIPMENT.find((x) => x.id === e.equipment) || {}).name || e.equipment), pill(['', 'Beginner', 'Intermediate', 'Advanced'][e.level] || 'Any level')),
        h('div.small.muted', `Works: ${e.muscles.map((m) => MUSCLES[m] || m).join(', ')}${e.secondary && e.secondary.length ? ` · also ${e.secondary.map((m) => MUSCLES[m] || m).join(', ')}` : ''}`),
        h('ol.instructions', (e.instructions || []).map((t) => h('li', t))),
        e.safety ? h('div.info-row', icon('alert', 16), h('span', e.safety)) : null,
        e.easier || e.harder
          ? h(
              'div.grid-2',
              e.easier ? btn(`Easier: ${(exerciseById(s, e.easier) || {}).name}`, () => (close(), openExerciseDetail(e.easier, onAdd)), { variant: 'ghost', size: 'sm' }) : h('span'),
              e.harder ? btn(`Harder: ${(exerciseById(s, e.harder) || {}).name}`, () => (close(), openExerciseDetail(e.harder, onAdd)), { variant: 'ghost', size: 'sm' }) : null
            )
          : null,
        onAdd ? btn('Add to workout', () => (close(), onAdd()), { block: true, iconName: 'plus' }) : null
      ),
  });
}

function openCustomExercise(onPick) {
  const d = { name: '', unit: 'reps', equipment: 'none', pattern: 'push', muscles: [], instructions: '' };
  openSheet({
    title: 'Custom exercise',
    render: (close) =>
      h(
        'div.stack-16',
        field('Name', input({ placeholder: 'e.g. Archer push-up', maxlength: 50, oninput: (e) => (d.name = e.target.value) })),
        h(
          'div.grid-2',
          field('Measured in', select([{ id: 'reps', name: 'Reps' }, { id: 'sec', name: 'Seconds' }], d.unit, (v) => (d.unit = v))),
          field('Type', select(['push', 'pull', 'legs', 'core', 'mobility', 'cardio'].map((x) => ({ id: x, name: x })), d.pattern, (v) => (d.pattern = v)))
        ),
        field('Equipment', select(EQUIPMENT, d.equipment, (v) => (d.equipment = v))),
        field('Muscles', chips(Object.entries(MUSCLES).map(([id, name]) => ({ id, name })), d.muscles, (v) => (d.muscles = v))),
        field('Instructions (one per line)', textarea({ rows: 4, oninput: (e) => (d.instructions = e.target.value) })),
        btn('Save exercise', () => {
          const name = cleanText(d.name, 50);
          if (!name) return toast('Name it first.', { type: 'error' });
          const ex = { id: uid('cx'), name, pattern: d.pattern, equipment: d.equipment, level: 1, muscles: d.muscles.length ? d.muscles : ['abs'], secondary: [], unit: d.unit, instructions: d.instructions.split('\n').map((x) => cleanText(x, 200)).filter(Boolean), custom: true };
          store.update((st) => st.fitness.customExercises.push(ex), { render: false });
          close();
          toast('Exercise saved.', { type: 'success' });
          if (onPick) onPick(ex.id);
        }, { block: true })
      ),
  });
}

