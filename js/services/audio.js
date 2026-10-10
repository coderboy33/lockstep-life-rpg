// Alarm and timer sounds generated with the Web Audio API (no audio files needed).
// Browsers only allow sound after you've tapped the page at least once — see unlockAudio().

let ctx = null;
let ringTimer = null;
let vibTimer = null;

function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

/** Call from any user gesture. Safe to call repeatedly. */
export function unlockAudio() {
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  // iOS needs a (silent) sound started inside the gesture.
  try {
    const b = c.createBuffer(1, 1, 22050);
    const s = c.createBufferSource();
    s.buffer = b;
    s.connect(c.destination);
    s.start(0);
  } catch {
    /* ignore */
  }
}

export const audioReady = () => !!ctx && ctx.state === 'running';
export const audioSupported = () => !!(window.AudioContext || window.webkitAudioContext);

let muted = false;
export function setMuted(v) {
  muted = !!v;
}

/**
 * Silent test mode (Settings → Testing tools). Alarms still ring visually, but no sound or
 * vibration plays. Off by default; stored per device so it survives reloads.
 */
export function silentTestMode() {
  try {
    return localStorage.getItem('lockstep.silent') === '1';
  } catch {
    return false;
  }
}

export function setSilentTestMode(on) {
  try {
    if (on) localStorage.setItem('lockstep.silent', '1');
    else localStorage.removeItem('lockstep.silent');
  } catch {
    /* ignore */
  }
  if (on) stopAlarmSound();
}

export function tone(freq = 880, dur = 0.15, { type = 'sine', vol = 0.25, when = 0 } = {}) {
  const c = getCtx();
  if (!c || muted || silentTestMode() || c.state !== 'running') return;
  const t0 = c.currentTime + when;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

export function chime() {
  tone(784, 0.18, { vol: 0.22 });
  tone(1175, 0.28, { vol: 0.2, when: 0.14 });
}

export function successSound() {
  tone(660, 0.12, { vol: 0.2 });
  tone(880, 0.12, { vol: 0.2, when: 0.1 });
  tone(1320, 0.25, { vol: 0.18, when: 0.2 });
}

export function tick() {
  tone(1500, 0.04, { vol: 0.12, type: 'square' });
}

export function countBeep(final = false) {
  tone(final ? 1320 : 880, final ? 0.3 : 0.12, { vol: 0.25 });
}

const PATTERNS = {
  pulse: () => {
    for (let i = 0; i < 4; i++) tone(988, 0.11, { vol: 0.35, when: i * 0.16, type: 'square' });
  },
  chime: () => {
    tone(659, 0.3, { vol: 0.3 });
    tone(988, 0.3, { vol: 0.28, when: 0.25 });
    tone(1319, 0.45, { vol: 0.26, when: 0.5 });
  },
  siren: () => {
    for (let i = 0; i < 6; i++) tone(i % 2 ? 740 : 1040, 0.16, { vol: 0.3, when: i * 0.17, type: 'sawtooth' });
  },
};

export function startAlarmSound(pattern = 'pulse', vibrate = true) {
  stopAlarmSound();
  const play = PATTERNS[pattern] || PATTERNS.pulse;
  play();
  ringTimer = setInterval(play, 1300);
  if (vibrate && navigator.vibrate && !silentTestMode()) {
    navigator.vibrate([400, 200, 400]);
    vibTimer = setInterval(() => navigator.vibrate([400, 200, 400]), 1500);
  }
}

export function stopAlarmSound() {
  const wasVibrating = !!vibTimer;
  clearInterval(ringTimer);
  clearInterval(vibTimer);
  ringTimer = null;
  vibTimer = null;
  try {
    if (wasVibrating && navigator.vibrate) navigator.vibrate(0);
  } catch {
    /* ignore */
  }
}

export const isRinging = () => !!ringTimer;
