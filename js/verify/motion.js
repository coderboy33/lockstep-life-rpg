// Assisted rep counting from video, fully on-device.
//
// How it works: the first second of video (you holding the start position) becomes a
// reference image. Each frame is compared with that reference; the difference rises as
// you go down and falls as you come back up. One full rise-and-fall = one rep.
//
// This is an ESTIMATE. It needs a still camera and decent light, and it can be fooled.
// The app always shows the count for you to confirm and labels it "assisted", never "proven".
// The class is self-contained so a pose-detection model could replace it later.

const W = 48;
const H = 64;

export class RepCounter {
  constructor({ onRep, minRepSec = 0.55, minAmp = 3.2 } = {}) {
    this.onRep = onRep;
    this.minRepSec = minRepSec;
    this.minAmp = minAmp;
    this.reset();
  }
  reset() {
    this.calib = [];
    this.ref = null;
    this.s = null;
    this.hist = [];
    this.phase = 'top';
    this.count = 0;
    this.lastRepT = -Infinity;
    this.intervals = [];
    this.amps = [];
    this.peak = 0;
    this.level = 0;
  }
  get calibrated() {
    return !!this.ref;
  }
  push(gray, t) {
    if (!this.ref) {
      this.calib.push(gray);
      if (this.calib.length >= 8) {
        const ref = new Float32Array(gray.length);
        for (const f of this.calib) for (let i = 0; i < f.length; i++) ref[i] += f[i] / this.calib.length;
        this.ref = ref;
        this.calib = [];
      }
      return;
    }
    let d = 0;
    for (let i = 0; i < gray.length; i++) d += Math.abs(gray[i] - this.ref[i]);
    d /= gray.length;
    this.s = this.s === null ? d : this.s + 0.45 * (d - this.s);
    this.hist.push({ t, v: this.s });
    while (this.hist.length && t - this.hist[0].t > 6) this.hist.shift();
    let min = Infinity;
    let max = -Infinity;
    for (const x of this.hist) {
      if (x.v < min) min = x.v;
      if (x.v > max) max = x.v;
    }
    const amp = max - min;
    this.level = amp > 0 ? (this.s - min) / amp : 0;
    if (amp < this.minAmp) {
      // Nothing happening: let the reference slowly follow lighting changes.
      if (this.phase === 'top') for (let i = 0; i < gray.length; i++) this.ref[i] = this.ref[i] * 0.97 + gray[i] * 0.03;
      return;
    }
    const hi = min + 0.6 * amp;
    const lo = min + 0.3 * amp;
    if (this.phase === 'top' && this.s > hi) {
      this.phase = 'bottom';
      this.peak = this.s - min;
    } else if (this.phase === 'bottom') {
      this.peak = Math.max(this.peak, this.s - min);
      if (this.s < lo && t - this.lastRepT >= this.minRepSec) {
        this.count++;
        if (Number.isFinite(this.lastRepT)) this.intervals.push(t - this.lastRepT);
        this.amps.push(this.peak);
        this.lastRepT = t;
        this.phase = 'top';
        this.onRep && this.onRep(this.count);
      }
    }
  }
  /** 'good' when reps came at a steady rhythm with a clear signal, otherwise 'low'. */
  get confidence() {
    if (this.count < 3 || this.intervals.length < 2) return 'low';
    const mean = this.intervals.reduce((a, b) => a + b, 0) / this.intervals.length;
    const sd = Math.sqrt(this.intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / this.intervals.length);
    const ampMean = this.amps.reduce((a, b) => a + b, 0) / this.amps.length;
    return sd / mean < 0.55 && mean >= 0.6 && mean <= 6 && ampMean >= this.minAmp * 1.5 ? 'good' : 'low';
  }
}

/** Reads small grayscale frames from a <video>. */
export class FrameReader {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
  }
  read(video) {
    if (!video.videoWidth) return null;
    this.ctx.drawImage(video, 0, 0, W, H);
    const { data } = this.ctx.getImageData(0, 0, W, H);
    const g = new Float32Array(W * H);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) g[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    return g;
  }
}

/** Counts reps live from a playing <video> (camera preview). Returns a stop() function. */
export function countLive(video, counter, onFrame) {
  const reader = new FrameReader();
  let stopped = false;
  let last = 0;
  const step = () => {
    if (stopped) return;
    const now = performance.now();
    if (now - last >= 66) {
      last = now;
      const g = reader.read(video);
      if (g) {
        counter.push(g, now / 1000);
        onFrame && onFrame(counter);
      }
    }
    if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(step);
    else requestAnimationFrame(step);
  };
  step();
  return () => {
    stopped = true;
  };
}

function waitEvent(el, ev, ms = 4000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => (cleanup(), reject(new Error('timeout'))), ms);
    const done = () => (cleanup(), resolve());
    const cleanup = () => {
      clearTimeout(t);
      el.removeEventListener(ev, done);
    };
    el.addEventListener(ev, done, { once: true });
  });
}

/** Analyses a recorded/uploaded video file by stepping through it. */
export async function analyzeVideo(blob, { onProgress, fps = 8, maxSec = 180 } = {}) {
  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.preload = 'auto';
  video.src = url;
  try {
    await waitEvent(video, 'loadedmetadata', 8000);
    let duration = video.duration;
    if (!Number.isFinite(duration)) {
      // Some recorded WebM files report Infinity until you seek to the end.
      video.currentTime = 1e7;
      await waitEvent(video, 'durationchange', 4000).catch(() => {});
      duration = Number.isFinite(video.duration) ? video.duration : maxSec;
    }
    duration = Math.min(duration, maxSec);
    const counter = new RepCounter();
    const reader = new FrameReader();
    const stepT = 1 / fps;
    for (let t = 0.05; t < duration; t += stepT) {
      video.currentTime = t;
      try {
        await waitEvent(video, 'seeked', 3000);
      } catch {
        continue;
      }
      const g = reader.read(video);
      if (g) counter.push(g, t);
      onProgress && onProgress(Math.min(1, t / duration), counter.count);
    }
    return { reps: counter.count, confidence: counter.confidence, duration };
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute('src');
    video.load();
  }
}

/** Plausibility check for nose-tap counting: taps must look like a human doing reps. */
export function tapPlausibility(times) {
  if (times.length < 3) return { ok: times.length > 0, reason: '' };
  const iv = [];
  for (let i = 1; i < times.length; i++) iv.push(times[i] - times[i - 1]);
  const sorted = [...iv].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const tooFast = iv.filter((x) => x < 0.55).length / iv.length;
  if (median < 0.6) return { ok: false, reason: 'Taps were faster than realistic push-ups.' };
  if (median > 12) return { ok: false, reason: 'Taps were too far apart to be one set.' };
  if (tooFast > 0.25) return { ok: false, reason: 'Many taps came too quickly together.' };
  return { ok: true, reason: '' };
}
