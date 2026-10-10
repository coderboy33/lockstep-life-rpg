// Onboarding: builds your profile, then generates a personalised plan you can edit.
// Re-run any time from Settings → Edit profile (?edit=1) without losing progress.

import { store } from '../core/store.js';
import { clock, WD_LONG, fmtTime } from '../core/dates.js';
import { deepClone, uid, cleanText, toInt } from '../core/util.js';
import { CATEGORIES, catOf, APP } from '../core/config.js';
import { startAccount } from '../core/state.js';
import { h, icon, btn, field, input, textarea, chips, dayPicker, toggleRow, stepper, segmented, timeInput, tagEditor, progressBar, clear, select } from '../ui/dom.js';
import { toast } from '../ui/overlay.js';
import { EQUIPMENT } from '../data/exercises.js';
import { SKIN_TYPES, COMMON_SENSITIVITIES } from '../data/care.js';
import { PRODUCTIVITY_GOALS, GROOMING_ITEMS, buildSuggestions, ensureFitnessRoutines, ensureCareRoutines, applySetup, openSuggestions, addSuggestion } from '../engine/suggest.js';
import { newAlarm } from '../engine/alarms.js';
import { requestNotifications, capabilities } from '../services/platform.js';
import { referenceManager } from './references.js';

export const isStatic = () => true;
export const fullScreen = () => true;

const AVATARS = ['🔥', '⚡', '🦁', '🐺', '🦅', '🐉', '🚀', '🎯', '💎', '🧠', '🏆', '🌙'];

let draft = null;
let step = 0;
let editMode = false;
let selected = null;
let rootEl = null;

function initDraft() {
  const s = store.state;
  draft = {
    profile: deepClone(s.profile),
    subjects: deepClone(s.school.subjects),
    projects: deepClone(s.business.projects),
    restDays: [...(s.settings.restDays || [])],
    dayStartHour: s.settings.dayStartHour,
    maxRiskPct: s.trading.maxRiskPct,
    extraAlarms: { study: true, workout: true, evening: false },
    pushup: { on: true, reps: null, requireVideo: false, time: null },
  };
  if (!draft.profile.name) draft.profile.name = '';
}

const P = () => draft.profile;

// ---------- steps ----------

const STEPS = [
  { id: 'welcome', render: stepWelcome, hideInEdit: true },
  { id: 'you', title: 'About you', sub: 'This is your character. Only you can see it.', render: stepYou },
  { id: 'focus', title: 'What matters most?', sub: 'Pick the areas you want to level up. Your plan focuses on these.', render: stepFocus },
  { id: 'rhythm', title: 'Your daily rhythm', sub: 'Used to time quests and reminders around your real schedule.', render: stepRhythm },
  { id: 'school', title: 'School & studying', sub: 'Add your subjects. Assignments and tests can be added any time in Grind → School.', render: stepSchool, optional: true },
  { id: 'fitness', title: 'Fitness', sub: 'We only use equipment you actually have.', render: stepFitness, optional: true },
  { id: 'care', title: 'Face & self-care', sub: 'Simple routines that reward consistency — not appearance standards.', render: stepCare, optional: true },
  { id: 'discipline', title: 'Discipline & productivity', sub: 'Habits to build and habits to break.', render: stepDiscipline, optional: true },
  { id: 'grind', title: 'Trading & business', sub: 'Process and real progress — never rewards for risk or luck.', render: stepGrind, optional: true },
  { id: 'reminders', title: 'Alarms & reminders', sub: 'Your morning push-up challenge and other reminders.', render: stepReminders, optional: true },
  { id: 'refs', title: 'Reference images', sub: 'Optional: screenshots of schedules, routines, products or designs you like.', render: stepRefs, optional: true },
  { id: 'plan', title: 'Your plan', sub: 'Generated from your answers. Toggle anything off — you can change everything later.', render: stepPlan },
];

function visibleSteps() {
  return STEPS.filter((s) => !(editMode && s.hideInEdit));
}

export function render(ctx) {
  editMode = !!ctx.query.edit;
  if (!draft || ctx.query.fresh) {
    initDraft();
    step = 0;
    selected = null;
  }
  rootEl = h('div.onb');
  paint();
  return rootEl;
}

export function cleanup() {
  draft = null;
  selected = null;
}

function paint() {
  const steps = visibleSteps();
  step = Math.max(0, Math.min(step, steps.length - 1));
  const st = steps[step];
  clear(rootEl);
  if (st.id !== 'welcome') {
    rootEl.appendChild(
      h(
        'div.onb-top',
        h('button.back-btn', { type: 'button', 'aria-label': 'Back', onclick: back }, icon('chevronLeft', 20)),
        h('div.grow', progressBar((step + 1) / steps.length, { glow: true })),
        h('span.small.faint.num', `${step + 1}/${steps.length}`)
      )
    );
    rootEl.appendChild(h('div.onb-head', h('h1.onb-title', st.title), st.sub ? h('p.muted.mt-8', st.sub) : null));
  }
  rootEl.appendChild(h('div.onb-body', st.render()));
  if (st.id !== 'welcome') {
    const last = step === steps.length - 1;
    rootEl.appendChild(
      h(
        'div.onb-foot',
        st.optional ? btn('Skip', next, { variant: 'ghost' }) : null,
        last ? btn(editMode ? 'Save changes' : 'Lock in', finish, { variant: 'white', block: true, iconName: 'lock' }) : btn('Continue', next, { variant: 'white', block: true })
      )
    );
  }
  window.scrollTo(0, 0);
}

function next() {
  const st = visibleSteps()[step];
  if (st.id === 'you' && !cleanText(P().name, 40)) P().name = 'Player';
  step++;
  paint();
}

function back() {
  if (step === 0) {
    if (editMode) location.hash = '#/settings';
    return;
  }
  if (visibleSteps()[step].id === 'plan') selected = null;
  step--;
  paint();
}

// ----- step renderers -----

function stepWelcome() {
  return h(
    'div.welcome',
    h('div.welcome-mark', { html: '<img src="./assets/icons/favicon.svg" width="96" height="96" alt="">' }),
    h('h1.welcome-title', APP.name),
    h('p.welcome-tag', 'Your real life, ranked.'),
    h(
      'div.welcome-feats',
      feat('target', 'Daily quests', 'Built from your school, training, self-care and projects.'),
      feat('trophy', 'Ranked ladder', 'Bronze → Unreal. Climb with consistency, not grinding.'),
      feat('alarm', 'Alarm challenges', 'Wake up, do your push-ups, prove it, earn it.'),
      feat('lock', 'Private by default', 'Everything is stored on this device. No account, no cloud.')
    ),
    btn('Get started', () => {
      step = 1;
      paint();
    }, { variant: 'white', block: true, size: 'lg' }),
    h('p.tiny.faint.center-text.mt-12', 'Takes about 3 minutes. Every question except your name can be skipped.')
  );
}

const feat = (ic, t, d) => h('div.feat', h('div.feat-icon', icon(ic, 20)), h('div', h('div.bold', t), h('div.small.muted', d)));

function stepYou() {
  const p = P();
  return h(
    'div.stack-16',
    field('What should we call you?', input({ value: p.name, placeholder: 'Your name or gamertag', maxlength: 40, autofocus: true, oninput: (e) => (p.name = e.target.value) })),
    field(
      'Avatar',
      h(
        'div.avatar-pick',
        AVATARS.map((a) =>
          h(
            'button.avatar-opt' + (p.avatar === a ? '.on' : ''),
            {
              type: 'button',
              'aria-label': `Avatar ${a}`,
              onclick: (e) => {
                p.avatar = a;
                e.currentTarget.parentElement.querySelectorAll('.avatar-opt').forEach((x) => x.classList.remove('on'));
                e.currentTarget.classList.add('on');
              },
            },
            a
          )
        )
      )
    ),
    field('Your main goals', tagEditor(p.mainGoals, (v) => (p.mainGoals = v), 'e.g. Get an A in chemistry'), 'Add a few. They show on your profile and guide your weekly review.'),
    field('What do you most want to improve right now?', textarea({ value: p.improve, placeholder: 'Be honest — this is just for you.', maxlength: 400, oninput: (e) => (p.improve = e.target.value) }))
  );
}

function stepFocus() {
  const p = P();
  const opts = CATEGORIES.map((c) => ({ id: c.id, name: c.name, iconName: c.icon, color: c.color }));
  const prioWrap = h('div');
  const renderPrio = () => {
    clear(prioWrap);
    const chosen = p.focusAreas.filter((x) => opts.some((o) => o.id === x));
    if (!chosen.length) return;
    prioWrap.appendChild(
      field(
        'Top priorities (tap in order, up to 3)',
        chips(
          chosen.map((id) => ({ id, name: catOf(id).short, color: catOf(id).color })),
          p.priorities.filter((x) => chosen.includes(x)),
          (v) => {
            p.priorities = v.slice(0, 3);
            if (v.length > 3) renderPrio();
          },
          {}
        )
      )
    );
  };
  renderPrio();
  return h(
    'div.stack-16',
    chips(opts, p.focusAreas, (v) => {
      p.focusAreas = v;
      p.priorities = p.priorities.filter((x) => v.includes(x));
      renderPrio();
    }),
    prioWrap
  );
}

function stepRhythm() {
  const p = P();
  return h(
    'div.stack-16',
    h('div.grid-2', field('Usual wake-up', timeInput(p.wakeTime, (v) => v && (p.wakeTime = v))), field('Usual bedtime', timeInput(p.bedTime, (v) => v && (p.bedTime = v)))),
    field('School days', dayPicker(p.schoolDays, (v) => (p.schoolDays = v))),
    h('div.grid-2', field('School starts', timeInput(p.schoolStart, (v) => v && (p.schoolStart = v))), field('School ends', timeInput(p.schoolEnd, (v) => v && (p.schoolEnd = v)))),
    field('Free time on school days', stepper(p.availMinSchool, { min: 0, max: 600, step: 15, suffix: ' min', onChange: (v) => (p.availMinSchool = v) })),
    field('Free time on weekends', stepper(p.availMinWeekend, { min: 0, max: 900, step: 15, suffix: ' min', onChange: (v) => (p.availMinWeekend = v) })),
    field('Weekly rest day(s)', dayPicker(draft.restDays, (v) => (draft.restDays = v)), 'On rest days nothing is due and your streak is frozen, not broken.'),
    field(
      'My day ends at',
      select(
        [0, 1, 2, 3, 4, 5].map((n) => ({ id: n, name: n === 0 ? 'Midnight' : `${n}:00 AM` })),
        draft.dayStartHour,
        (v) => (draft.dayStartHour = Number(v))
      ),
      'If you stay up late, a quest done at 1 AM still counts for “yesterday”.'
    )
  );
}

function stepSchool() {
  const p = P();
  const list = h('div.stack-8');
  const renderList = () => {
    clear(list);
    for (const sub of draft.subjects) {
      list.appendChild(
        h(
          'div.sub-row',
          h('span.sub-dot', { style: { background: sub.color } }),
          h('span.grow.bold', sub.name),
          segmented(
            [
              { id: 'high', name: 'High' },
              { id: 'medium', name: 'Med' },
              { id: 'low', name: 'Low' },
            ],
            sub.priority,
            (v) => (sub.priority = v),
            { small: true }
          ),
          h('button.icon-btn', { type: 'button', 'aria-label': `Remove ${sub.name}`, onclick: () => ((draft.subjects = draft.subjects.filter((x) => x !== sub)), renderList()) }, icon('trash', 16))
        )
      );
    }
  };
  renderList();
  const nameIn = input({ placeholder: 'Subject (e.g. Chemistry)', maxlength: 40 });
  const add = () => {
    const name = cleanText(nameIn.value, 40);
    if (!name) return;
    const colors = ['#4d8dff', '#22c3ff', '#ff5d6c', '#ff7ad9', '#ffb020', '#9be15d', '#8f7dff', '#2ee6b0', '#ff8a3d', '#c58cff'];
    draft.subjects.push({ id: uid('sub'), name, priority: 'medium', color: colors[draft.subjects.length % colors.length], weeklyGoalMin: 120 });
    nameIn.value = '';
    renderList();
  };
  nameIn.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), add()));
  return h(
    'div.stack-16',
    field('Subjects', h('div.stack-8', list, h('div.row.gap-8', nameIn, btn('Add', add, { variant: 'ghost' })))),
    h('div.grid-2', field('Preferred study time', timeInput(p.studyTime, (v) => v && (p.studyTime = v))), field('Study per day', stepper(p.studyMinutesPerDay, { min: 0, max: 300, step: 15, suffix: 'm', onChange: (v) => (p.studyMinutesPerDay = v) }))),
    field('Study priorities / upcoming tests', textarea({ value: p.studyPriorities, placeholder: 'e.g. Bio test Friday, essay due the 20th', maxlength: 400, oninput: (e) => (p.studyPriorities = e.target.value) }), 'Notes only — we never invent assignments. Add real deadlines in Grind → School.')
  );
}

function stepFitness() {
  const f = P().fitness;
  return h(
    'div.stack-16',
    field(
      'Training experience',
      segmented(
        [
          { id: 'none', name: 'New' },
          { id: 'beginner', name: 'Beginner' },
          { id: 'intermediate', name: 'Intermediate' },
          { id: 'advanced', name: 'Advanced' },
        ],
        f.experience,
        (v) => (f.experience = v)
      )
    ),
    field('Equipment you have', chips(EQUIPMENT.map((e) => ({ id: e.id, name: e.name })), f.equipment, (v) => (f.equipment = v.length ? v : ['none']))),
    field('Training days', dayPicker(f.days, (v) => (f.days = v))),
    h('div.grid-2', field('Preferred time', timeInput(f.time, (v) => v && (f.time = v))), field('Session length', stepper(f.sessionMin, { min: 10, max: 120, step: 5, suffix: 'm', onChange: (v) => (f.sessionMin = v) }))),
    field('Max push-ups in one go (roughly)', stepper(f.pushupMax, { min: 0, max: 150, step: 1, onChange: (v) => (f.pushupMax = v) }), 'Used to size your morning challenge (about 60% of your max). Knee push-ups count.'),
    field('Injuries or limitations', textarea({ value: f.limitations, placeholder: 'e.g. sore left shoulder — avoid overhead pressing', maxlength: 300, oninput: (e) => (f.limitations = e.target.value) }), 'Shown in your workouts as a reminder. Always stop if something hurts.')
  );
}

function stepCare() {
  const c = P().care;
  const sens = [...new Set([...COMMON_SENSITIVITIES, ...(store.state.care.sensitivities || [])])];
  return h(
    'div.stack-16',
    field('Skin type', chips(SKIN_TYPES.map((s) => ({ id: s.id, name: s.name })), c.skinType, (v) => (c.skinType = v), { multi: false })),
    field('Skin sensitivities (we’ll warn you about these)', chips(sens.map((x) => ({ id: x, name: x })), draft.sensitivities || store.state.care.sensitivities || [], (v) => (draft.sensitivities = v))),
    field('Current routine & products', textarea({ value: c.currentRoutine, placeholder: 'e.g. CeraVe cleanser, any moisturizer, no sunscreen yet', maxlength: 400, oninput: (e) => (c.currentRoutine = e.target.value) }), 'You can add products to each routine step later.'),
    h('div.card.flat', toggleRow('Facial relaxation routine', 'Gentle jaw/face tension release (no reshaping claims).', c.faceRelax, (v) => (c.faceRelax = v)), toggleRow('Posture & neck routine', 'Slow, pain-free mobility for screen posture.', c.posture, (v) => (c.posture = v)), toggleRow('Floss daily', 'Adds flossing to your night routine.', c.flossDaily, (v) => (c.flossDaily = v))),
    field('Grooming routine includes', chips(GROOMING_ITEMS.map((g) => ({ id: g.id, name: g.name })), c.grooming, (v) => (c.grooming = v)))
  );
}

function stepDiscipline() {
  const pr = P().productivity;
  return h(
    'div.stack-16',
    field('Productivity goals', chips(PRODUCTIVITY_GOALS.map((g) => ({ id: g.id, name: g.name })), pr.goals, (v) => (pr.goals = v))),
    field('Habits you already have (keep them)', tagEditor(pr.keepHabits, (v) => (pr.keepHabits = v), 'e.g. Walk the dog')),
    field('Habits you want to break', tagEditor(pr.breakHabits, (v) => (pr.breakHabits = v), 'e.g. Scrolling in bed'))
  );
}

function stepGrind() {
  const t = P().trading;
  const projList = h('div.stack-8');
  const renderProjects = () => {
    clear(projList);
    for (const pj of draft.projects)
      projList.appendChild(
        h('div.sub-row', h('span.sub-dot', { style: { background: pj.color } }), h('div.grow', h('div.bold', pj.name), pj.goal ? h('div.small.muted', pj.goal) : null), h('button.icon-btn', { type: 'button', 'aria-label': `Remove ${pj.name}`, onclick: () => ((draft.projects = draft.projects.filter((x) => x !== pj)), renderProjects()) }, icon('trash', 16)))
      );
  };
  renderProjects();
  const pName = input({ placeholder: 'Project name', maxlength: 50 });
  const pGoal = input({ placeholder: 'Goal (e.g. first 10 customers)', maxlength: 120 });
  const addProject = () => {
    const name = cleanText(pName.value, 50);
    if (!name) return;
    draft.projects.push({ id: uid('pj'), name, goal: cleanText(pGoal.value, 120), desc: '', color: ['#ff8a3d', '#4d8dff', '#2ee6b0', '#c58cff'][draft.projects.length % 4], status: 'active', tasks: [], objectives: [], notes: [], createdTs: clock.now() });
    pName.value = '';
    pGoal.value = '';
    renderProjects();
  };
  return h(
    'div.stack-16',
    h('div.eyebrow', 'Trading education'),
    field(
      'Where are you at?',
      segmented(
        [
          { id: 'none', name: 'Not for me' },
          { id: 'learning', name: 'Learning' },
          { id: 'paper', name: 'Simulator' },
          { id: 'live', name: 'Real money' },
        ],
        t.level,
        (v) => (t.level = v)
      )
    ),
    field('Markets you study', tagEditor(t.markets, (v) => (t.markets = v), 'e.g. Stocks, Forex')),
    h('div.grid-2', field('Journal entries / week', stepper(t.journalPerWeek, { min: 1, max: 7, onChange: (v) => (t.journalPerWeek = v) })), field('Max risk per trade', stepper(draft.maxRiskPct, { min: 0.25, max: 5, step: 0.25, suffix: '%', onChange: (v) => (draft.maxRiskPct = v) }))),
    h('p.tiny.faint', 'Lockstep rewards preparation, journaling and following your rules — never profit or risk-taking. Not financial advice.'),
    h('div.divider'),
    h('div.eyebrow', 'Business projects'),
    projList,
    h('div.stack-8', pName, pGoal, btn('Add project', addProject, { variant: 'ghost', iconName: 'plus' })),
    field('Hours per week for business', stepper(P().business.weeklyHours, { min: 0, max: 60, onChange: (v) => (P().business.weeklyHours = v) }))
  );
}

function stepReminders() {
  const p = P();
  const pu = draft.pushup;
  if (pu.reps === null) pu.reps = Math.max(3, Math.min(60, Math.round((p.fitness.pushupMax || 10) * 0.6)));
  if (!pu.time) {
    const [hh, mm] = p.wakeTime.split(':').map(Number);
    const t = hh * 60 + mm + 5;
    pu.time = `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  }
  const cap = capabilities();
  const permEl = h('div');
  const renderPerm = () => {
    clear(permEl);
    const st = cap.notifApi ? Notification.permission : 'unsupported';
    if (st === 'granted') permEl.appendChild(h('div.info-row.ok', icon('check', 16), h('span', 'Notifications are on.')));
    else if (st === 'unsupported')
      permEl.appendChild(h('div.info-row', icon('info', 16), h('span', cap.ios && !cap.standalone ? 'On iPhone, notifications only work after you Add to Home Screen (iOS 16.4+). You can enable them later in Settings.' : 'This browser doesn’t support notifications. Alarms still ring while the app is open.')));
    else
      permEl.appendChild(
        btn('Allow notifications', async () => {
          await requestNotifications();
          renderPerm();
        }, { variant: 'ghost', iconName: 'bell', block: true })
      );
  };
  renderPerm();
  return h(
    'div.stack-16',
    h(
      'div.card.glow',
      toggleRow('Morning push-up challenge', 'An alarm that makes you earn your morning.', pu.on, (v) => (pu.on = v)),
      h('div.grid-2.mt-12', field('Alarm time', timeInput(pu.time, (v) => v && (pu.time = v))), field('Push-ups', stepper(pu.reps, { min: 1, max: 200, onChange: (v) => (pu.reps = v) }))),
      h('div.mt-12', toggleRow('Require video evidence', 'Full ranked credit only with a recorded video or assisted rep count.', pu.requireVideo, (v) => (pu.requireVideo = v)))
    ),
    h(
      'div.card.flat',
      toggleRow('Study reminder', `At ${fmtTime(p.studyTime)} on school days`, draft.extraAlarms.study, (v) => (draft.extraAlarms.study = v)),
      toggleRow('Workout reminder', `At ${fmtTime(p.fitness.time)} on training days`, draft.extraAlarms.workout, (v) => (draft.extraAlarms.workout = v)),
      toggleRow('Evening routine reminder', '45 min before bedtime', draft.extraAlarms.evening, (v) => (draft.extraAlarms.evening = v))
    ),
    permEl,
    h(
      'div.card.warn',
      h('div.row.gap-8', icon('info', 18), h('div.bold', 'Honest note about alarms')),
      h('p.small.muted.mt-8', 'A web app can only ring while it’s open. For a reliable wake-up on iPhone, also set a matching alarm in the Clock app (or add the alarm to your Calendar from the Alarms screen). When you open Lockstep after it rings, your challenge is waiting.')
    )
  );
}

function stepRefs() {
  return h('div.stack-12', referenceManager({ compact: true }), h('p.tiny.faint', 'Images stay in this browser’s private storage on your device. They are never uploaded. Lockstep can’t read images automatically — open one next to a form and type in what you want to use.'));
}

function computeSuggestions() {
  const tmp = deepClone(store.state);
  applyDraftTo(tmp);
  if (editMode) return openSuggestions(tmp);
  ensureFitnessRoutines(tmp, clock.now());
  ensureCareRoutines(tmp, clock.now());
  return buildSuggestions(tmp);
}

function stepPlan() {
  const sug = computeSuggestions();
  if (!selected) {
    selected = new Set(sug.filter((s) => s.selected && (s.key !== 'alarm:pushup' || draft.pushup.on)).map((s) => s.key));
  }
  const groups = {};
  for (const s of sug) (groups[s.cat] ||= []).push(s);
  const countEl = h('span.num');
  const updateCount = () => {
    const daily = sug.filter((s) => selected.has(s.key) && (s.quest.type || 'daily') === 'daily').length;
    countEl.textContent = `${selected.size} quests selected · ${daily} recurring`;
  };
  updateCount();
  if (!sug.length) return h('div.card.flat', h('p.muted', editMode ? 'No new suggestions — your plan already covers your profile. Your profile changes will be saved.' : 'No suggestions yet. You can add your own quests after setup.'));
  return h(
    'div.stack-16',
    h('div.small.muted', countEl),
    ...Object.entries(groups).map(([cat, list]) =>
      h(
        'div',
        h('div.plan-cat', { style: { color: catOf(cat).color } }, icon(catOf(cat).icon, 16), catOf(cat).name),
        h(
          'div.list',
          list.map((s) => {
            const on = selected.has(s.key);
            const days = s.quest.type === 'weekly' ? `${s.quest.target}× per week` : s.quest.days && s.quest.days.length && s.quest.days.length < 7 ? s.quest.days.map((d) => WD_LONG[d].slice(0, 3)).join(' ') : s.quest.type === 'once' ? 'Once' : 'Daily';
            const cb = h('input.plan-check', { type: 'checkbox', checked: on, 'aria-label': s.title });
            cb.addEventListener('change', () => {
              if (cb.checked) selected.add(s.key);
              else selected.delete(s.key);
              updateCount();
            });
            return h('label.list-item.plan-item', cb, h('div.li-body', h('div.li-title', s.title), h('div.li-sub', `${days} · ${s.quest.durationMin} min${s.quest.time ? ' · ' + fmtTime(s.quest.time) : ''}`), s.quest.description ? h('div.tiny.faint.mt-4', s.quest.description) : null));
          })
        )
      )
    ),
    h('p.tiny.faint', 'New quests join your ranked matches from tomorrow. Today is your setup day: explore, complete quests for XP, and get ready.')
  );
}

// ---------- finish ----------

function applyDraftTo(s) {
  const p = draft.profile;
  p.name = cleanText(p.name, 40) || 'Player';
  s.profile = deepClone(p);
  s.school.subjects = deepClone(draft.subjects);
  // Keep existing projects' tasks when editing.
  const byId = Object.fromEntries((s.business.projects || []).map((x) => [x.id, x]));
  s.business.projects = draft.projects.map((x) => ({ ...(byId[x.id] || {}), ...x }));
  s.settings.restDays = [...draft.restDays];
  s.settings.dayStartHour = toInt(draft.dayStartHour, 3, 0, 5);
  s.trading.maxRiskPct = draft.maxRiskPct;
  if (draft.sensitivities) s.care.sensitivities = [...draft.sensitivities];
}

function finish() {
  const now = clock.now();
  const keys = selected ? [...selected] : [];
  try {
    store.update((s) => {
      applyDraftTo(s);
      if (editMode) {
        const add = openSuggestions(s).filter((x) => keys.includes(x.key));
        for (const sg of add) addSuggestion(s, sg, now);
        return;
      }
      startAccount(s, now);
      // Quests created during setup are dated to the setup day, so they join ranked matches tomorrow.
      applySetup(s, keys, now);
      const pa = s.alarms.find((a) => a.kind === 'pushup');
      if (pa) {
        pa.time = draft.pushup.time;
        pa.challenge.pushups = draft.pushup.reps;
        pa.challenge.requireVideo = draft.pushup.requireVideo;
        const q = s.quests.find((x) => x.id === pa.questId);
        if (q) {
          q.time = pa.time;
          q.verification = pa.challenge.requireVideo ? 'video' : 'none';
          q.description = `Your alarm rings and you complete ${pa.challenge.pushups} push-ups before starting your day.`;
        }
      }
      const p = s.profile;
      const mk = (data) => {
        const r = newAlarm(data, now);
        if (r.ok) s.alarms.push(r.alarm);
      };
      if (draft.extraAlarms.study) mk({ kind: 'study', label: 'Study time', time: p.studyTime, days: p.schoolDays.length ? p.schoolDays : [1, 2, 3, 4, 5], partOfDaily: false, target: { kind: 'focus' } });
      if (draft.extraAlarms.workout && p.fitness.days.length) mk({ kind: 'workout', label: 'Workout time', time: p.fitness.time, days: p.fitness.days, partOfDaily: false, target: { kind: 'workout' } });
      if (draft.extraAlarms.evening) {
        const [hh, mm] = p.bedTime.split(':').map(Number);
        const t = (hh * 60 + mm - 45 + 1440) % 1440;
        mk({ kind: 'evening', label: 'Evening routine', time: `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`, days: [0, 1, 2, 3, 4, 5, 6], partOfDaily: false, target: { kind: 'care' } });
      }
    });
  } catch (e) {
    console.error(e);
    toast('Something went wrong saving your setup: ' + e.message, { type: 'error' });
    return;
  }
  draft = null;
  selected = null;
  toast(editMode ? 'Profile updated.' : 'You’re locked in. Today is your setup day — placement starts tomorrow.', { type: 'success', duration: 4500 });
  location.hash = editMode ? '#/settings' : '#/home';
}
