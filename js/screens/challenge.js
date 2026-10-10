// Push-up / sit-up challenge with optional evidence:
//  - Camera: records a video on-device and estimates reps from motion (assisted, not proof)
//  - Nose-tap: phone on the floor, touch it with your nose at the bottom of each rep
//  - Upload: pick a video you recorded; it's analysed on-device
//  - Manual: count yourself (self-reported)
// Videos stay in this browser's private storage and auto-delete after the retention period.

import { store } from '../core/store.js';
import { clock, dayKey, dateKey } from '../core/dates.js';
import { uid } from '../core/util.js';
import { h, icon, btn, stepper, clear, put, progressBar, haptic } from '../ui/dom.js';
import { toast, confirmDialog, rewardPop } from '../ui/overlay.js';
import { topbar } from '../ui/common.js';
import { currentOccurrence, logOcc, isOnTime } from '../engine/alarms.js';
import { questState, grantActivityXp } from '../engine/quests.js';
import { completeQuestAction, showAchievements } from '../services/actions.js';
import { checkAchievements, updateRecords } from '../engine/progress.js';
import { openCamera, stopStream, Recorder, cameraSupported, recorderSupported } from '../verify/recorder.js';
import { RepCounter, countLive, analyzeVideo, tapPlausibility } from '../verify/motion.js';
import { putMedia, mediaUrl, mediaSupported } from '../core/media.js';
import { countBeep, tick, successSound, unlockAudio } from '../services/audio.js';

export const isStatic = () => true;
export const fullScreen = () => true;

let root = null;
let ctxInfo = null; // { alarm, quest, occKey, date, test }
let chId = null;
let stream = null;
let stopCounting = null;
let recorder = null;
let objectUrls = [];
let testCh = null; // test-mode attempts are never saved

export function cleanup() {
  if (stopCounting) stopCounting();
  stopCounting = null;
  if (recorder && recorder.recording) recorder.stop();
  recorder = null;
  stopStream(stream);
  stream = null;
  for (const u of objectUrls) URL.revokeObjectURL(u);
  objectUrls = [];
}

const ch = () => testCh || store.state.challenges.find((c) => c.id === chId) || null;
const VERIFIED = new Set(['motion', 'tap', 'video']);

export function render(ctx) {
  cleanup();
  testCh = null;
  root = h('div.challenge');
  const s = ctx.state;
  const [a, b] = ctx.params;
  if (a === 'review') {
    chId = b;
    paintReview();
    return root;
  }
  let alarm = null;
  let quest = null;
  if (a === 'q') quest = s.quests.find((q) => q.id === b) || null;
  else {
    alarm = s.alarms.find((x) => x.id === a) || null;
    if (alarm && alarm.questId) quest = s.quests.find((q) => q.id === alarm.questId) || null;
  }
  if (!alarm && !quest) {
    put(root, topbar('Challenge', { back: '#/home' }), h('p.muted', 'This challenge no longer exists.'));
    return root;
  }
  const now = clock.now();
  const occ = alarm ? currentOccurrence(s, alarm, now) : null;
  const date = occ ? occ.date : dateKey(now, s.settings);
  ctxInfo = { alarm, quest, occKey: alarm ? `${alarm.id}@${date}` : null, date, test: ctx.query.test === '1' };
  // Resume an unfinished attempt for this alarm/quest today.
  const existing = s.challenges.find((c) => !c.final && c.status !== 'discarded' && ((alarm && c.alarmId === alarm.id && c.date === date) || (!alarm && quest && c.questId === quest.id && c.day === dayKey(now, s.settings))));
  chId = existing ? existing.id : null;
  if (existing) nextStep();
  else paintIntro();
  return root;
}

function exercisesFor(info) {
  const { alarm } = info;
  if (alarm && alarm.challenge) {
    const list = [{ key: 'pushups', name: 'Push-ups', target: alarm.challenge.pushups }];
    if (alarm.challenge.situps) list.push({ key: 'situps', name: 'Sit-ups', target: alarm.challenge.situps });
    return list;
  }
  return [{ key: 'reps', name: info.quest ? info.quest.title : 'Reps', target: 10 }];
}

function requireVideo() {
  const { alarm, quest } = ctxInfo;
  return !!((alarm && alarm.challenge && alarm.challenge.requireVideo) || (quest && quest.verification === 'video'));
}

function title() {
  return (ctxInfo.alarm && ctxInfo.alarm.label) || (ctxInfo.quest && ctxInfo.quest.title) || 'Challenge';
}

// ---------- intro ----------

function paintIntro() {
  clear(root);
  const exs = exercisesFor(ctxInfo);
  const s = store.state;
  const q = ctxInfo.quest;
  const today = dayKey(clock.now(), s.settings);
  const done = q ? questState(s, q, today).done : false;
  const generic = exs[0].key === 'reps';
  let target = exs[0].target;
  put(root, 
    topbar('', { back: '#/home' }),
    h(
      'div.ch-hero',
      h('div.ch-kicker', ctxInfo.alarm ? 'ALARM CHALLENGE' : 'VERIFIED CHALLENGE'),
      h('h1.ch-title', title()),
      generic ? null : h('div.ch-target', exs.map((e) => e.target).join(' + ')),
      generic ? null : h('div.muted.bold', exs.map((e) => `${e.target} ${e.name.toLowerCase()}`).join(' + '))
    ),
    generic ? h('div.card.mt-16', h('div.field-label', 'Target reps'), stepper(target, { min: 1, max: 500, onChange: (v) => (target = v), big: true })) : null,
    done ? h('div.card.success.mt-16', h('div.bold', 'Already completed today ✓'), h('div.small.muted', 'You can still do it again for practice, but it won’t earn rewards twice.')) : null,
    ctxInfo.test ? h('div.card.warn.mt-16', h('div.bold', 'Test mode'), h('div.small.muted', 'Nothing will be saved or rewarded.')) : null,
    h(
      'div.card.flat.mt-16.stack-8',
      h('div.row.gap-8', icon('shield', 16, 'accent'), h('div.bold.small', 'Safety')),
      h('div.small.muted', 'Warm up your wrists and shoulders. Knee or incline push-ups count. Stop if you feel sharp pain, dizziness or chest pain — no challenge is worth an injury.'),
      requireVideo() ? h('div.info-row', icon('video', 16), h('span', 'Video evidence is required for full credit. Use the camera or upload a video.')) : null
    ),
    h('div.mt-24', btn('START CHALLENGE', () => start(generic ? target : null), { variant: 'white', size: 'xl', block: true, iconName: 'play' }))
  );
}

function start(genericTarget) {
  unlockAudio();
  const now = clock.now();
  const s = store.state;
  const exs = exercisesFor(ctxInfo).map((e) => ({ ...e, target: genericTarget || e.target, done: 0, method: null, status: null, evidence: null, detected: null, confidence: null }));
  const c = {
    id: uid('ch'),
    alarmId: ctxInfo.alarm ? ctxInfo.alarm.id : null,
    questId: ctxInfo.quest ? ctxInfo.quest.id : null,
    title: title(),
    day: dayKey(now, s.settings),
    date: ctxInfo.date,
    startedTs: now,
    requireVideo: requireVideo(),
    exercises: exs,
    status: 'active',
    final: false,
    test: ctxInfo.test,
  };
  if (ctxInfo.test) testCh = c;
  else
    store.update(
      (st) => {
        st.challenges.push(c);
        if (st.challenges.length > 400) st.challenges.splice(0, st.challenges.length - 400);
        if (ctxInfo.occKey) logOcc(st, ctxInfo.occKey, { status: 'started', startedTs: now });
      },
      { render: false }
    );
  chId = c.id;
  nextStep();
}

function nextStep() {
  const c = ch();
  if (!c) return paintIntro();
  const i = c.exercises.findIndex((e) => !e.status);
  if (i === -1) return finalize();
  paintMethods(i);
}

function saveEx(i, patch) {
  const c = ch();
  if (!c) return;
  if (c.test) Object.assign(c.exercises[i], patch);
  else
    store.update(
      (st) => {
        const x = st.challenges.find((y) => y.id === chId);
        Object.assign(x.exercises[i], patch);
      },
      { render: false }
    );
}

function header(i) {
  const c = ch();
  const ex = c.exercises[i];
  return h(
    'div',
    topbar('', {
      back: true,
      actions: [
        btn('Cancel', async () => {
          if (await confirmDialog({ title: 'Cancel this challenge?', message: 'Your progress on this attempt will be discarded. The quest stays open.', okText: 'Discard attempt', danger: true })) discard();
        }, { variant: 'ghost', size: 'sm' }),
      ],
    }),
    h('div.ch-hero', h('div.ch-kicker', c.exercises.length > 1 ? `STEP ${i + 1} OF ${c.exercises.length}` : 'CHALLENGE'), h('div.ch-target', String(ex.target)), h('div.muted.bold', ex.name.toUpperCase()))
  );
}

function discard() {
  cleanup();
  const c = ch();
  if (c && !c.test)
    store.update((st) => {
      const x = st.challenges.find((y) => y.id === chId);
      if (x) x.status = 'discarded';
      if (ctxInfo && ctxInfo.occKey && st.alarmLog[ctxInfo.occKey] && st.alarmLog[ctxInfo.occKey].status === 'started') st.alarmLog[ctxInfo.occKey].status = 'skipped';
    });
  location.hash = '#/home';
}

// ---------- method picker ----------

function paintMethods(i) {
  cleanup();
  clear(root);
  const ex = ch().exercises[i];
  const camOk = cameraSupported();
  const opt = (ic, t, sub, on, disabled = false) => h('button.method', { type: 'button', disabled, onclick: on, style: disabled ? 'opacity:.45' : null }, icon(ic, 24), h('div.method-title', t), h('div.method-sub', sub));
  put(root, 
    header(i),
    h('div.eyebrow.mt-16', 'How do you want to count?'),
    h(
      'div.method-grid.mt-8',
      opt('camera', 'Camera', camOk ? (recorderSupported() ? 'Records + counts reps' : 'Counts reps (no recording)') : 'Not available here', () => methodCamera(i), !camOk),
      opt('upload', 'Upload video', 'Analysed on your device', () => methodUpload(i), !mediaSupported()),
      opt('hand', ex.key === 'situps' ? 'Tap counter' : 'Nose-tap', ex.key === 'situps' ? 'Tap at the top of each rep' : 'Phone under your face', () => methodTap(i)),
      opt('edit', 'Count myself', 'Self-reported', () => methodManual(i))
    ),
    h('p.tiny.faint.mt-16', 'Camera and upload counts are motion estimates — you always confirm the number. Videos never leave your device.')
  );
}

// ---------- camera ----------

async function methodCamera(i) {
  cleanup();
  clear(root);
  const ex = ch().exercises[i];
  let facing = 'user';
  const video = h('video.mirror', { playsinline: true, muted: true, autoplay: true });
  video.muted = true;
  const countEl = h('div.cam-count', '0');
  const recEl = h('span.rec-dot.hidden', 'REC');
  const sigFill = h('div.signal-fill', { style: { width: '0%' } });
  const statusEl = h('div.small.muted.center-text', 'Place your phone 1–2 m away (side view works best) so your whole body is in frame. Keep it still.');
  const actions = h('div.stack-8.mt-12');
  put(root, header(i), h('div.cam-wrap.mt-8', video, h('div.cam-overlay', countEl, recEl)), h('div.signal-bar', sigFill), h('div.mt-8', statusEl), actions);
  const startCam = async () => {
    stopStream(stream);
    try {
      stream = await openCamera(facing);
      video.srcObject = stream;
      video.classList.toggle('mirror', facing === 'user');
      await video.play().catch(() => {});
    } catch (e) {
      statusEl.textContent = e.message;
      statusEl.classList.add('red');
      clear(actions).append(btn('Choose another method', () => paintMethods(i), { variant: 'ghost', block: true }));
      return false;
    }
    return true;
  };
  if (!(await startCam())) return;
  let counter = null;
  const showReady = () => {
    clear(actions).append(
      btn('Start counting', () => go(), { block: true, size: 'lg', iconName: 'play' }),
      h('div.grid-2', btn('Flip camera', async () => ((facing = facing === 'user' ? 'environment' : 'user'), await startCam()), { variant: 'ghost', iconName: 'refresh' }), btn('Other method', () => paintMethods(i), { variant: 'ghost' }))
    );
  };
  const go = async () => {
    clear(actions);
    for (let n = 3; n >= 1; n--) {
      statusEl.textContent = `Get in the start position… ${n}`;
      countBeep(false);
      await new Promise((r) => setTimeout(r, 1000));
    }
    countBeep(true);
    statusEl.textContent = 'Hold still for a moment (calibrating)…';
    counter = new RepCounter({
      onRep: (n) => {
        countEl.textContent = String(n);
        tick();
        haptic(15);
        if (n === ex.target) successSound();
      },
    });
    if (recorderSupported()) {
      recorder = new Recorder(stream);
      if (recorder.start()) recEl.classList.remove('hidden');
    }
    stopCounting = countLive(video, counter, (c) => {
      if (c.calibrated && statusEl.dataset.cal !== '1') {
        statusEl.dataset.cal = '1';
        statusEl.textContent = 'Go! Full reps, steady pace.';
      }
      sigFill.style.width = `${Math.round(Math.max(0, Math.min(1, c.level)) * 100)}%`;
    });
    actions.append(btn('Done', () => stopAndReview(), { block: true, size: 'lg', variant: 'success', iconName: 'check' }));
  };
  const stopAndReview = async () => {
    if (stopCounting) stopCounting();
    stopCounting = null;
    recEl.classList.add('hidden');
    const blob = recorder ? await recorder.stop() : null;
    recorder = null;
    stopStream(stream);
    stream = null;
    reviewPanel(i, { blob, detected: counter ? counter.count : 0, confidence: counter ? counter.confidence : 'low', method: 'camera' });
  };
  showReady();
}

// ---------- shared review panel (camera / upload) ----------

function reviewPanel(i, { blob, detected, confidence, method }) {
  clear(root);
  const ex = ch().exercises[i];
  let confirmed = detected;
  let watched = !blob;
  const autoOk = detected >= ex.target && confidence === 'good';
  const player = blob ? h('video.evidence-video', { controls: true, playsinline: true, preload: 'metadata' }) : null;
  if (blob) {
    const u = URL.createObjectURL(blob);
    objectUrls.push(u);
    player.src = u;
    const mark = () => {
      if (player.duration && Number.isFinite(player.duration) && player.currentTime >= player.duration * 0.5) markWatched();
    };
    player.addEventListener('timeupdate', mark);
    player.addEventListener('ended', markWatched);
  }
  const watchHint = h('div.tiny.faint.center-text');
  const submitBtn = btn('Submit result', () => submit(), { block: true, size: 'lg', iconName: 'check' });
  function markWatched() {
    if (watched) return;
    watched = true;
    update();
  }
  function update() {
    const needWatch = blob && !autoOk && !watched;
    submitBtn.disabled = needWatch;
    watchHint.textContent = needWatch ? 'Watch at least half of your clip to confirm the count (manual review).' : '';
  }
  update();
  const confLabel = autoOk ? h('span.status-badge.status-verified', icon('check', 14), 'Assisted count reached target') : h('span.status-badge.status-pending', icon('info', 14), detected ? `Estimated ${detected} reps — please confirm` : 'Couldn’t count reliably — please confirm');
  async function submit() {
    const evidence = blob ? await saveEvidence(blob) : null;
    const status = confirmed < ex.target ? 'short' : autoOk && confirmed >= ex.target ? 'motion' : blob ? 'video' : 'self';
    saveEx(i, { done: confirmed, method, status, evidence, detected, confidence });
    nextStep();
  }
  async function later() {
    const evidence = await saveEvidence(blob);
    saveEx(i, { done: confirmed, method, status: 'pending', evidence, detected, confidence });
    nextStep();
  }
  put(root, 
    header(i),
    player ? h('div.mt-8', player) : h('div.card.flat.mt-8.small.muted', recorderSupported() ? 'No video was recorded.' : 'This browser can’t record video, so only the motion count is available.'),
    h('div.center-text.mt-12', confLabel),
    h('div.card.mt-12.center-text', h('div.field-label', 'Reps completed'), stepper(confirmed, { min: 0, max: 999, big: true, onChange: (v) => (confirmed = v) }), h('div.tiny.faint.mt-8', `Target: ${ex.target}`)),
    h('div.stack-8.mt-12', submitBtn, watchHint, blob && !autoOk ? btn('Save and review later', () => later(), { variant: 'ghost', block: true, iconName: 'clock' }) : null, btn('Redo', () => paintMethods(i), { variant: 'ghost', block: true, iconName: 'refresh' }))
  );
}

async function saveEvidence(blob) {
  if (!blob || ch().test) return null;
  const id = uid('ev');
  try {
    await putMedia(id, blob, { kind: 'video' });
    store.update((st) => st.evidence.push({ id, kind: 'video', mime: blob.type, size: blob.size, ts: clock.now(), day: dayKey(clock.now(), st.settings), ref: { type: 'challenge', id: chId } }), { render: false });
    return id;
  } catch (e) {
    console.error(e);
    toast('Couldn’t store the video (storage full?). Your count was still saved.', { type: 'error' });
    return null;
  }
}

// ---------- upload ----------

function methodUpload(i) {
  cleanup();
  clear(root);
  const fileIn = h('input.hidden', { type: 'file', accept: 'video/*' });
  const status = h('div.small.muted.center-text');
  const bar = h('div.hidden', progressBar(0));
  put(root, 
    header(i),
    h('div.card.mt-12.stack-12', h('div.bold', 'Upload a video of your set'), h('div.small.muted', 'Record with your camera app (phone propped up, whole body in view) or pick an existing clip. It’s analysed on this device and never uploaded anywhere.'), btn('Choose video', () => fileIn.click(), { block: true, iconName: 'upload' }), bar, status),
    btn('Other method', () => paintMethods(i), { variant: 'ghost', block: true }),
    fileIn
  );
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files[0];
    if (!f) return;
    if (!f.type.startsWith('video/')) return toast('Please choose a video file.', { type: 'error' });
    if (f.size > 250 * 1024 * 1024) return toast('That video is too large (max 250 MB). Trim it first.', { type: 'error' });
    bar.classList.remove('hidden');
    status.textContent = 'Analysing… (stays on your device)';
    try {
      const res = await analyzeVideo(f, {
        onProgress: (p, n) => {
          bar.firstChild.firstChild.style.width = `${Math.round(p * 100)}%`;
          status.textContent = `Analysing… ${Math.round(p * 100)}% · ${n} reps so far`;
        },
      });
      reviewPanel(i, { blob: f, detected: res.reps, confidence: res.confidence, method: 'upload' });
    } catch (e) {
      console.error(e);
      status.textContent = 'This video couldn’t be analysed in your browser. You can still submit it and confirm the count yourself.';
      reviewPanel(i, { blob: f, detected: 0, confidence: 'low', method: 'upload' });
    }
  });
}

// ---------- nose-tap ----------

function methodTap(i) {
  cleanup();
  clear(root);
  const ex = ch().exercises[i];
  const times = [];
  let last = -Infinity;
  const countEl = h('div.tap-count', '0');
  const hint = h('div.small.muted.center-text');
  const zone = h('button.tap-zone', { type: 'button', 'aria-label': 'Tap to count a rep' }, countEl);
  zone.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const t = performance.now() / 1000;
    if (t - last < 0.5) return;
    last = t;
    times.push(t);
    countEl.textContent = String(times.length);
    tick();
    haptic(18);
    if (times.length === ex.target) successSound();
  });
  put(root, 
    header(i),
    h('p.small.muted.center-text.mt-8', ex.key === 'situps' ? 'Hold the phone or place it on your knees. Tap the circle at the top of each sit-up.' : 'Put your phone flat on the floor under your face. Touch the circle with your nose or chin at the bottom of each push-up.'),
    h('div.mt-16', zone),
    hint,
    h(
      'div.stack-8.mt-16',
      btn('Done', () => {
        const pl = tapPlausibility(times);
        const n = times.length;
        const status = n < ex.target ? 'short' : pl.ok ? 'tap' : 'self';
        if (!pl.ok && n >= ex.target) toast(`${pl.reason} Saved as self-reported.`);
        saveEx(i, { done: n, method: 'tap', status, evidence: null, detected: n, confidence: pl.ok ? 'good' : 'low' });
        nextStep();
      }, { block: true, size: 'lg', variant: 'success', iconName: 'check' }),
      h(
        'div.grid-2',
        btn('Undo last', () => {
          times.pop();
          countEl.textContent = String(times.length);
        }, { variant: 'ghost' }),
        btn('Other method', () => paintMethods(i), { variant: 'ghost' })
      )
    )
  );
}

// ---------- manual ----------

function methodManual(i) {
  cleanup();
  clear(root);
  const ex = ch().exercises[i];
  let n = ex.target;
  put(root, 
    header(i),
    h('div.card.mt-16.center-text', h('div.field-label', 'How many did you do?'), stepper(n, { min: 0, max: 999, big: true, onChange: (v) => (n = v) })),
    requireVideo() ? h('div.info-row.mt-12', icon('alert', 16), h('span', 'Video evidence is required for this challenge, so a manual count earns reduced credit.')) : null,
    h(
      'div.stack-8.mt-16',
      btn('I did these reps — submit', () => {
        saveEx(i, { done: n, method: 'manual', status: n < ex.target ? 'short' : 'self', evidence: null });
        nextStep();
      }, { block: true, size: 'lg', iconName: 'check' }),
      btn('Other method', () => paintMethods(i), { variant: 'ghost', block: true })
    )
  );
}

// ---------- finish ----------

function summarize(c) {
  const anyPending = c.exercises.some((e) => e.status === 'pending');
  const anyShort = c.exercises.some((e) => e.status === 'short');
  const verified = !anyPending && !anyShort && c.exercises.every((e) => VERIFIED.has(e.status) && (!c.requireVideo || e.evidence));
  return { anyPending, anyShort, verified };
}

function finalize() {
  cleanup();
  const c = ch();
  const now = clock.now();
  const { anyPending, anyShort, verified } = summarize(c);
  const alarm = ctxInfo && ctxInfo.alarm;
  const onTime = alarm ? isOnTime(store.state, alarm, c.date, c.startedTs) : false;
  // Only an alarm that actually rang can make you late.
  const rang = !!(ctxInfo && ctxInfo.occKey && store.state.alarmLog[ctxInfo.occKey] && store.state.alarmLog[ctxInfo.occKey].firstRingTs);
  const late = !!alarm && rang && !onTime;
  let result = null;
  let xpOnly = 0;
  if (!c.test) {
    store.update(
      (st) => {
        const x = st.challenges.find((y) => y.id === chId);
        x.final = !anyPending;
        x.status = anyPending ? 'pending' : anyShort ? 'short' : verified ? 'verified' : 'self';
        x.verified = verified;
        x.onTime = onTime;
        x.endTs = now;
        x.pushupsDone = (x.exercises.find((e) => e.key === 'pushups') || { done: 0 }).done;
        if (ctxInfo.occKey && !anyPending) logOcc(st, ctxInfo.occKey, { status: 'done', doneTs: now, challengeId: x.id });
        updateRecords(st, now);
      },
      { render: false }
    );
    if (!anyPending && !anyShort) result = reward(c, { verified, onTime, late });
    if (anyShort) {
      xpOnly = store.update((st) => grantActivityXp(st, 'challenge', 'fitness', now, c.id, 10), { render: false });
      if (xpOnly) rewardPop({ xp: xpOnly, note: 'For the effort' });
    }
    const ach = store.update((st) => checkAchievements(st, now), { render: false });
    showAchievements(ach);
  }
  paintResult(c, { anyPending, anyShort, verified, onTime, late, result });
}

/** Completes the linked quest (or gives standalone XP). */
function reward(c, { verified, onTime, late }) {
  const s = store.state;
  const q = c.questId ? s.quests.find((x) => x.id === c.questId && !x.archived) : null;
  const evidence = c.exercises.map((e) => e.evidence).filter(Boolean);
  if (q) {
    const today = dayKey(clock.now(), s.settings);
    const day = c.day < today ? c.day : undefined;
    const st = questState(s, q, day || today);
    if (st.done) return { already: true };
    const r = completeQuestAction(q.id, { day, verified, method: 'challenge', evidence, challengeId: c.id, onTime: onTime && !day, late });
    if (r.ok) store.update((x) => Object.assign(x.challenges.find((y) => y.id === c.id), { xp: r.completion.xp, sr: r.completion.sr }), { render: false });
    return r;
  }
  const amount = (ctxInfo.alarm && ctxInfo.alarm.xp) || 30;
  const xp = store.update((st) => grantActivityXp(st, 'challenge', 'fitness', clock.now(), c.id, Math.min(100, amount)), { render: false });
  if (xp) rewardPop({ xp, note: 'Challenge' });
  return { ok: true, xpOnly: xp };
}

function statusBadge(e) {
  const map = {
    motion: ['status-verified', 'check', 'Assisted count'],
    tap: ['status-verified', 'check', 'Tap-counted'],
    video: ['status-verified', 'video', 'Video · self-reviewed'],
    self: ['status-self', 'edit', 'Self-reported'],
    pending: ['status-pending', 'clock', 'Awaiting your review'],
    short: ['status-pending', 'alert', 'Below target'],
  }[e.status] || ['status-self', 'info', e.status];
  return h('span.status-badge.' + map[0], icon(map[1], 14), map[2]);
}

function paintResult(c, info) {
  clear(root);
  const headline = info.anyPending ? 'Saved for review' : info.anyShort ? 'Almost there' : info.verified ? 'Challenge verified' : 'Challenge complete';
  const sub = info.anyPending
    ? 'Watch your video from Home → “Evidence waiting for review” to confirm the count. Rewards are given after you confirm.'
    : info.anyShort
      ? 'You didn’t reach the target this time. The quest is still open — you can try again today.'
      : info.verified
        ? 'Assisted verification counts toward Elite+ promotion requirements and earns bonus XP and SR.'
        : c.requireVideo
          ? 'Completed, but without accepted video evidence you get reduced credit.'
          : 'Self-reported. Use the camera, upload or nose-tap next time for bonus XP/SR and verified status.';
  put(root, 
    topbar('', { back: '#/home' }),
    h(
      'div.ch-hero',
      h('div.ch-kicker', c.test ? 'TEST RESULT' : 'RESULT'),
      h('div', { style: 'font-size:64px;margin:8px 0' }, info.anyShort ? '💪' : info.anyPending ? '⏳' : '🏆'),
      h('h1.ch-title', headline),
      h('p.muted.mt-8', sub)
    ),
    h(
      'div.card.mt-16.stack-12',
      c.exercises.map((e) => h('div.row.between', h('div', h('div.bold', e.name), h('div.small.muted.num', `${e.done}/${e.target}`)), statusBadge(e)))
    ),
    ctxInfo.alarm && !c.test && (info.onTime || info.late) ? h('div.info-row.mt-12' + (info.onTime ? '.ok' : ''), icon('alarm', 16), h('span', info.onTime ? `Started within the grace period${info.result && info.result.completion ? ' — on-time bonus applied' : ''}.` : 'Started after the grace period — reduced XP, no on-time bonus.')) : null,
    info.result && info.result.already ? h('div.info-row.mt-12', icon('info', 16), h('span', 'This quest was already completed today, so no extra rewards.')) : null,
    h('div.stack-8.mt-24', info.anyShort ? btn('Try again', () => retry(c), { block: true, size: 'lg', iconName: 'refresh' }) : null, btn('Back to home', () => (location.hash = '#/home'), { block: true, variant: info.anyShort ? 'ghost' : 'white', size: 'lg' }))
  );
}

function retry(c) {
  if (!c.test) store.update((st) => (st.challenges.find((y) => y.id === c.id).final = true), { render: false });
  chId = null;
  paintIntro();
}

// ---------- pending review ----------

function paintReview() {
  clear(root);
  const c = ch();
  if (!c) {
    put(root, topbar('Review', { back: '#/home' }), h('p.muted', 'Nothing to review.'));
    return;
  }
  const s = store.state;
  ctxInfo = { alarm: s.alarms.find((a) => a.id === c.alarmId) || null, quest: s.quests.find((q) => q.id === c.questId) || null, occKey: c.alarmId ? `${c.alarmId}@${c.date}` : null, date: c.date, test: false };
  const pending = c.exercises.map((e, i) => ({ e, i })).filter((x) => x.e.status === 'pending');
  if (!pending.length) {
    put(root, topbar('Review', { back: '#/home' }), h('p.muted', 'This challenge has already been reviewed.'));
    return;
  }
  const confirmedVals = {};
  const watched = {};
  const confirmBtn = btn('Confirm & claim rewards', () => confirmAll(), { block: true, size: 'lg', iconName: 'check', disabled: true });
  const update = () => (confirmBtn.disabled = !pending.every((p) => watched[p.i]));
  put(root, 
    topbar('Review evidence', { back: '#/home' }),
    h('p.small.muted', 'Watch your clip and confirm how many reps you really did. This is the manual review that replaces automatic verification.'),
    ...pending.map(({ e, i }) => {
      confirmedVals[i] = e.done;
      const v = h('video.evidence-video', { controls: true, playsinline: true, preload: 'metadata' });
      mediaUrl(e.evidence).then((u) => (u ? (v.src = u) : v.replaceWith(h('p.muted', 'The video is no longer on this device.'))));
      const mark = () => {
        if (!watched[i] && v.duration && Number.isFinite(v.duration) && v.currentTime >= v.duration * 0.5) {
          watched[i] = true;
          update();
        }
      };
      v.addEventListener('timeupdate', mark);
      v.addEventListener('ended', () => ((watched[i] = true), update()));
      return h('div.card.mt-12.stack-12', h('div.bold', `${e.name} — target ${e.target}`), v, h('div.center-text', stepper(e.done, { min: 0, max: 999, big: true, onChange: (x) => (confirmedVals[i] = x) })));
    }),
    h('div.stack-8.mt-16', confirmBtn, h('div.tiny.faint.center-text', 'Watch at least half of each clip to enable confirmation.'), btn('Discard this attempt', async () => {
      if (await confirmDialog({ title: 'Discard this attempt?', message: 'No rewards will be given. The video stays until auto-deletion unless you delete it in Settings.', okText: 'Discard', danger: true })) {
        store.update((st) => Object.assign(st.challenges.find((y) => y.id === c.id), { status: 'discarded', final: true }));
        location.hash = '#/home';
      }
    }, { variant: 'ghost', block: true }))
  );
  function confirmAll() {
    for (const { e, i } of pending) saveEx(i, { done: confirmedVals[i], status: confirmedVals[i] >= e.target ? 'video' : 'short' });
    finalize();
  }
}
