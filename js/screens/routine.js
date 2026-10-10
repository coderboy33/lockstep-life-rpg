// Self-care routine player (step-by-step with timers), routine editor, products & sensitivities.

import { store } from '../core/store.js';
import { clock, dayKey, fmtTime } from '../core/dates.js';
import { uid, cleanText, toInt, fmtClock } from '../core/util.js';
import { h, icon, btn, iconBtn, field, input, textarea, select, timeInput, stepper, chips, clear, put, empty, pill, listItem, haptic } from '../ui/dom.js';
import { openSheet, toast, confirmDialog } from '../ui/overlay.js';
import { topbar } from '../ui/common.js';
import { CARE_SECTIONS, CARE_STEPS, SKIN_TYPES, COMMON_SENSITIVITIES, careStepMinutes } from '../data/care.js';
import { createQuest, deleteQuest } from '../engine/quests.js';
import { activityAction } from '../services/actions.js';
import { countBeep, chime, unlockAudio } from '../services/audio.js';

let stepTimer = null;
let player = null; // { routineId, idx, done:Set, skipped:Set, timer:{endTs, pausedLeft} }

export function cleanup() {
  clearInterval(stepTimer);
  stepTimer = null;
}

export function render(ctx) {
  cleanup();
  const s = ctx.state;
  const r = s.care.routines.find((x) => x.id === ctx.params[0]);
  if (!r) return h('div.screen', topbar('Routine', { back: '#/body?tab=care' }), empty('sparkle', 'Routine not found', 'It may have been deleted.'));
  if (!player || player.routineId !== r.id) player = { routineId: r.id, idx: 0, done: new Set(), skipped: new Set(), timer: null };
  const root = h('div.screen');
  paint(root, r);
  return root;
}

function paint(root, r) {
  cleanup();
  clear(root);
  const s = store.state;
  const sec = CARE_SECTIONS.find((x) => x.id === r.section) || CARE_SECTIONS[0];
  const today = dayKey(clock.now(), s.settings);
  const doneToday = s.care.logs.some((l) => l.routineId === r.id && l.day === today && l.complete);
  const steps = r.steps;
  const finished = player.idx >= steps.length;
  put(root, 
    topbar(r.name, { back: '#/body?tab=care', small: true, sub: `${steps.length} steps · ~${careStepMinutes(steps)} min${r.time ? ' · ' + fmtTime(r.time, s.settings.clock24) : ''}`, actions: [iconBtn('edit', () => openCareRoutineEditor(r), { label: 'Edit routine' })] }),
    doneToday ? h('div.card.success', h('div.row.gap-8', icon('check', 18), h('div.bold', 'Done today')), h('div.small.muted', 'You can run it again any time; rewards are once per day.')) : null
  );
  if (!steps.length) {
    put(root, empty('sparkle', 'No steps yet', 'Edit the routine to add steps.'));
    return;
  }
  if (!finished) put(root, stepCard(root, r, steps[player.idx], sec));
  else
    put(root, 
      h(
        'div.card.step-card.glow',
        h('div', { style: 'font-size:56px' }, '✨'),
        h('div.step-name', 'Routine complete'),
        h('p.muted.mt-8', `${player.done.size} of ${steps.length} steps done.`),
        h('div.mt-16', btn(doneToday ? 'Back' : 'Finish & log it', () => finish(r), { block: true, size: 'lg', iconName: 'check' }))
      )
    );
  put(root, 
    h(
      'div.list.step-list.mt-16',
      steps.map((st, i) =>
        h(
          'button.list-item.tappable' + (i === player.idx ? '.current' : '') + (player.done.has(i) ? '.done' : ''),
          { type: 'button', onclick: () => ((player.idx = i), (player.timer = null), paint(root, r)) },
          h('div.li-icon', { style: { '--c': sec.color } }, player.done.has(i) ? icon('check', 16) : h('span.bold', String(i + 1))),
          h('div.li-body', h('div.li-title', st.name), h('div.li-sub', [st.durationSec ? fmtClock(st.durationSec) : null, st.reps ? `${st.reps} reps` : null, st.product ? `🧴 ${st.product}` : null].filter(Boolean).join(' · ')))
        )
      )
    ),
    sec.disclaimer ? h('p.tiny.faint.mt-12', sec.disclaimer) : null
  );
}

function stepCard(root, r, st, sec) {
  const timeEl = h('div.step-timer.num', st.durationSec ? fmtClock(st.durationSec) : '');
  const promptEl = h('div.step-prompt');
  const controls = h('div.row.gap-8.center');
  const s = store.state;
  const sens = (s.care.sensitivities || []).filter((x) => st.product && st.product.toLowerCase().includes(x.toLowerCase().split(' ')[0]));
  const startTimer = () => {
    unlockAudio();
    const left = player.timer && player.timer.pausedLeft != null ? player.timer.pausedLeft : st.durationSec * 1000;
    player.timer = { endTs: Date.now() + left, pausedLeft: null };
    tickTimer();
  };
  const pauseTimer = () => {
    if (!player.timer) return;
    player.timer.pausedLeft = Math.max(0, player.timer.endTs - Date.now());
    clearInterval(stepTimer);
    renderControls();
  };
  let lastPrompt = -1;
  const tickTimer = () => {
    clearInterval(stepTimer);
    renderControls();
    const update = () => {
      const t = player.timer;
      if (!t || t.pausedLeft != null) return;
      const leftMs = t.endTs - Date.now();
      const left = Math.max(0, Math.ceil(leftMs / 1000));
      timeEl.textContent = fmtClock(left);
      if (st.prompts && st.prompts.length) {
        const per = st.durationSec / st.prompts.length;
        const idx = Math.min(st.prompts.length - 1, Math.floor((st.durationSec - leftMs / 1000) / per));
        if (idx !== lastPrompt) {
          lastPrompt = idx;
          promptEl.textContent = st.prompts[idx];
          if (idx > 0) {
            chime();
            haptic(60);
          }
        }
      }
      if (left <= 3 && left > 0) countBeep(false);
      if (leftMs <= 0) {
        clearInterval(stepTimer);
        countBeep(true);
        haptic(200);
        player.timer = null;
        markDone();
      }
    };
    update();
    stepTimer = setInterval(update, 500);
  };
  const markDone = () => {
    player.done.add(player.idx);
    player.idx++;
    player.timer = null;
    paint(root, r);
  };
  const renderControls = () => {
    clear(controls);
    const running = player.timer && player.timer.pausedLeft == null;
    if (st.durationSec) controls.append(running ? btn('Pause', pauseTimer, { variant: 'ghost', iconName: 'pause' }) : btn(player.timer ? 'Resume' : 'Start timer', startTimer, { iconName: 'play' }));
    controls.append(btn('Done', markDone, { variant: st.durationSec ? 'ghost' : 'primary', iconName: 'check' }), btn('Skip', () => ((player.idx += 1), (player.timer = null), paint(root, r)), { variant: 'ghost', size: 'sm' }));
  };
  renderControls();
  if (player.timer) tickTimer();
  return h(
    'div.card.step-card',
    { style: { borderColor: sec.color } },
    h('div.eyebrow', `Step ${player.idx + 1} of ${r.steps.length}`),
    h('div.step-name.mt-8', st.name),
    st.reps ? h('div.muted.bold.mt-4', `${st.reps} reps`) : null,
    st.durationSec ? timeEl : null,
    promptEl,
    st.product ? h('div.mt-8', pill(`🧴 ${st.product}`)) : null,
    sens.length ? h('div.info-row.mt-8', icon('alert', 16), h('span', `Heads up: this product may relate to your sensitivity (${sens.join(', ')}). Stop if it irritates.`)) : null,
    h('ol.instructions.mt-12', { style: 'text-align:left' }, (st.instructions || []).map((t) => h('li', t))),
    h('div.mt-16', controls)
  );
}

function finish(r) {
  const s = store.state;
  const today = dayKey(clock.now(), s.settings);
  const already = s.care.logs.some((l) => l.routineId === r.id && l.day === today && l.complete);
  const ratio = r.steps.length ? player.done.size / r.steps.length : 0;
  const complete = ratio >= 0.8;
  if (!already) {
    store.update((st) => {
      st.care.logs.push({ id: uid('cl'), routineId: r.id, day: today, ts: clock.now(), stepsDone: player.done.size, steps: r.steps.length, complete });
      if (st.care.logs.length > 3000) st.care.logs.splice(0, st.care.logs.length - 3000);
    }, { render: false });
    if (complete) activityAction('care', { id: r.id, ref: r.id }, 'routine', 'care');
    else toast('Logged. Do at least 80% of the steps for it to count as complete.');
  }
  player = null;
  location.hash = '#/body?tab=care';
}

// ---------- editor ----------

export function openCareRoutineEditor(existing, opts = {}) {
  const isNew = !existing;
  const d = existing ? JSON.parse(JSON.stringify(existing)) : { name: '', section: opts.section || 'skin', slot: 'any', time: null, weekly: false, steps: [] };
  let makeQuest = isNew;
  openSheet({
    title: isNew ? 'New routine' : 'Edit routine',
    render: (close, rerender) => {
      const s = store.state;
      const lib = Object.values(CARE_STEPS).sort((a, b) => (sectionOfStep(b.id) === d.section) - (sectionOfStep(a.id) === d.section));
      const hasQuest = existing && s.quests.some((q) => q.linked && q.linked.kind === 'care' && q.linked.id === existing.id && !q.archived);
      const addCustom = () => d.steps.push({ id: uid('st'), ref: null, name: 'New step', instructions: [], durationSec: 60, reps: 0, product: '' });
      return h(
        'div.stack-16',
        field('Name', input({ value: d.name, placeholder: 'e.g. Morning skincare', maxlength: 50, oninput: (e) => (d.name = e.target.value) })),
        h('div.grid-2', field('Section', select(CARE_SECTIONS, d.section, (v) => (d.section = v))), field('When', select([{ id: 'am', name: 'Morning' }, { id: 'pm', name: 'Evening' }, { id: 'any', name: 'Any time' }], d.slot, (v) => (d.slot = v)))),
        field('Reminder time (optional)', timeInput(d.time, (v) => (d.time = v))),
        h(
          'div',
          h('div.field-label', 'Steps (in order)'),
          d.steps.length
            ? h(
                'div.stack-8',
                d.steps.map((st, i) =>
                  h(
                    'div.card.flat.tight.stack-8',
                    h('div.row.gap-6', input({ value: st.name, maxlength: 60, 'aria-label': 'Step name', oninput: (e) => (st.name = e.target.value) }), i > 0 ? iconBtn('chevronUp', () => (d.steps.splice(i - 1, 0, d.steps.splice(i, 1)[0]), rerender()), { label: 'Move up' }) : null, iconBtn('trash', () => (d.steps.splice(i, 1), rerender()), { label: 'Remove step' })),
                    h('div.grid-2', field('Timer', stepper(st.durationSec || 0, { min: 0, max: 1800, step: 15, suffix: 's', onChange: (v) => (st.durationSec = v) })), field('Reps', stepper(st.reps || 0, { min: 0, max: 100, onChange: (v) => (st.reps = v) }))),
                    d.section === 'skin' || d.section === 'dental' || d.section === 'groom' ? input({ value: st.product || '', placeholder: 'Product used (optional)', maxlength: 60, oninput: (e) => (st.product = e.target.value) }) : null,
                    textarea({ value: (st.instructions || []).join('\n'), rows: 2, placeholder: 'Instructions (one per line)', oninput: (e) => (st.instructions = e.target.value.split('\n').map((x) => x.trim()).filter(Boolean)) })
                  )
                )
              )
            : h('p.small.muted', 'No steps yet.'),
          h(
            'div.row.gap-8.mt-8',
            select([{ id: '', name: 'Add a step from the library…' }, ...lib.map((x) => ({ id: x.id, name: x.name }))], '', (v) => {
              if (!v) return;
              d.steps.push({ ...JSON.parse(JSON.stringify(CARE_STEPS[v])), id: uid('st'), ref: v, product: '' });
              rerender();
            }),
            btn('Custom', () => (addCustom(), rerender()), { variant: 'ghost', size: 'sm', iconName: 'plus' })
          )
        ),
        !hasQuest ? h('label.toggle-row', h('div.li-body', h('div.li-title', 'Add as a daily quest'), h('div.li-sub', 'Completes when you finish this routine.')), h('input', { type: 'checkbox', checked: makeQuest, onchange: (e) => (makeQuest = e.target.checked), style: 'width:22px;height:22px' })) : null,
        h(
          'div.sheet-actions',
          btn(isNew ? 'Create routine' : 'Save', () => {
            const name = cleanText(d.name, 50);
            if (!name) return toast('Give it a name.', { type: 'error' });
            if (!d.steps.length) return toast('Add at least one step.', { type: 'error' });
            const steps = d.steps.map((st) => ({ ...st, name: cleanText(st.name, 60) || 'Step', durationSec: toInt(st.durationSec, 0, 0, 1800), reps: toInt(st.reps, 0, 0, 100), product: cleanText(st.product, 60) }));
            const now = clock.now();
            store.update((st) => {
              let r;
              if (existing) {
                r = st.care.routines.find((x) => x.id === existing.id);
                Object.assign(r, { name, section: d.section, slot: d.slot, time: d.time, steps });
              } else {
                r = { id: uid('cr'), key: null, name, section: d.section, slot: d.slot, time: d.time, weekly: false, steps, createdAt: now };
                st.care.routines.push(r);
              }
              const mins = careStepMinutes(steps);
              const q = st.quests.find((x) => x.linked && x.linked.kind === 'care' && x.linked.id === r.id && !x.archived);
              if (q) Object.assign(q, { title: name, time: d.time, durationMin: mins });
              else if (makeQuest) createQuest(st, { title: name, category: 'care', days: [0, 1, 2, 3, 4, 5, 6], time: d.time, durationMin: mins, difficulty: mins >= 5 ? 'medium' : 'easy', description: `Your ${name.toLowerCase()} routine, step by step.`, linked: { kind: 'care', id: r.id } }, now);
            });
            close();
            toast('Routine saved.', { type: 'success' });
          }, { block: true, size: 'lg' }),
          existing
            ? btn('Delete routine', async () => {
                if (!(await confirmDialog({ title: `Delete “${existing.name}”?`, message: 'Its quest is removed from your schedule; history is kept.', okText: 'Delete', danger: true }))) return;
                store.update((st) => {
                  st.care.routines = st.care.routines.filter((x) => x.id !== existing.id);
                  for (const q of st.quests.filter((x) => x.linked && x.linked.kind === 'care' && x.linked.id === existing.id && !x.archived)) deleteQuest(st, q.id, clock.now());
                });
                close();
                if (location.hash.startsWith('#/routine/')) location.hash = '#/body?tab=care';
              }, { variant: 'ghost', block: true, iconName: 'trash' })
            : null
        )
      );
    },
  });
}

function sectionOfStep(id) {
  const map = { face: ['jaw-release', 'forehead-smooth', 'eye-palming', 'cheek-puff', 'lip-trill', 'tongue-rest', 'face-scan'], posture: ['chin-tuck', 'neck-side', 'neck-turn', 'shoulder-roll', 'scap-squeeze', 'wall-angel', 'doorway-stretch', 'thoracic-chair'], skin: ['cleanse-am', 'moisturize', 'sunscreen', 'cleanse-pm'], dental: ['brush', 'floss', 'tongue'] };
  for (const [k, v] of Object.entries(map)) if (v.includes(id)) return k;
  return 'groom';
}

// ---------- products & sensitivities ----------

export function openProductsSheet() {
  openSheet({
    title: 'Skin, products & sensitivities',
    render: (close, rerender) => {
      const s = store.state;
      const allSens = [...new Set([...COMMON_SENSITIVITIES, ...(s.care.sensitivities || [])])];
      const prodName = input({ placeholder: 'Product name', maxlength: 60 });
      let type = 'cleanser';
      let when = 'both';
      return h(
        'div.stack-16',
        field('Skin type', chips(SKIN_TYPES.map((x) => ({ id: x.id, name: x.name })), s.profile.care.skinType, (v) => store.update((st) => (st.profile.care.skinType = v), { render: false }), { multi: false })),
        field('Sensitivities', chips(allSens.map((x) => ({ id: x, name: x })), s.care.sensitivities || [], (v) => store.update((st) => (st.care.sensitivities = v), { render: false })), 'Lockstep warns you when a routine step’s product mentions one of these. It can’t read ingredient lists — always check labels.'),
        h(
          'div',
          h('div.field-label', 'Your products'),
          s.care.products.length
            ? h(
                'div.list',
                s.care.products.map((p) =>
                  listItem({ iconName: 'droplet', title: p.name, sub: `${p.type} · ${p.when === 'both' ? 'AM & PM' : p.when.toUpperCase()}`, right: iconBtn('trash', () => (store.update((st) => (st.care.products = st.care.products.filter((x) => x.id !== p.id)), { render: false }), rerender()), { label: `Remove ${p.name}` }) })
                )
              )
            : h('p.small.muted', 'No products yet. You don’t need many — a gentle cleanser, a moisturizer and sunscreen cover the basics.'),
          h(
            'div.stack-8.mt-8',
            prodName,
            h('div.grid-2', select(['cleanser', 'moisturizer', 'sunscreen', 'treatment', 'lip balm', 'other'].map((x) => ({ id: x, name: x })), type, (v) => (type = v)), select([{ id: 'both', name: 'AM & PM' }, { id: 'am', name: 'AM' }, { id: 'pm', name: 'PM' }], when, (v) => (when = v))),
            btn('Add product', () => {
              const name = cleanText(prodName.value, 60);
              if (!name) return;
              store.update((st) => st.care.products.push({ id: uid('p'), name, type, when }), { render: false });
              rerender();
            }, { variant: 'ghost', block: true, iconName: 'plus' })
          )
        ),
        h('p.tiny.faint', 'Tip: add a product to a routine step by editing the routine. New products: patch-test on a small area for a few days first.'),
        btn('Done', () => (close(), store.notify()), { block: true })
      );
    },
  });
}
