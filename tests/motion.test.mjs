import test from 'node:test';
import assert from 'node:assert/strict';
import { RepCounter, tapPlausibility } from '../js/verify/motion.js';

function frames(reps, { period = 1.6, fps = 15, still = 1.2, noise = 1.5, amp = 40 } = {}) {
  const out = [];
  const total = still + reps * period + still;
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
  for (let t = 0; t < total; t += 1 / fps) {
    const g = new Float32Array(48 * 64);
    const inReps = t > still && t < still + reps * period;
    const phase = inReps ? (1 - Math.cos((2 * Math.PI * (t - still)) / period)) / 2 : 0;
    for (let i = 0; i < g.length; i++) {
      const row = Math.floor(i / 48);
      // the "body" region (rows 20-50) changes brightness as you go down
      g[i] = 100 + (row > 20 && row < 50 ? amp * phase : 0) + noise * rnd();
    }
    out.push([g, t]);
  }
  return out;
}

test('rep counter counts clean reps', () => {
  for (const n of [5, 12, 20]) {
    const c = new RepCounter();
    for (const [g, t] of frames(n)) c.push(g, t);
    assert.equal(c.count, n, `expected ${n}, got ${c.count}`);
    assert.equal(c.confidence, 'good');
  }
});

test('rep counter ignores sensor noise when still', () => {
  const c = new RepCounter();
  for (const [g, t] of frames(0, { still: 5 })) c.push(g, t);
  assert.equal(c.count, 0);
});

test('rep counter handles slower and faster tempos', () => {
  const slow = new RepCounter();
  for (const [g, t] of frames(8, { period: 3 })) slow.push(g, t);
  assert.equal(slow.count, 8);
  const fast = new RepCounter();
  for (const [g, t] of frames(10, { period: 0.9, fps: 24 })) fast.push(g, t);
  assert.equal(fast.count, 10);
});

test('nose-tap plausibility rejects spam tapping', () => {
  assert.equal(tapPlausibility([0, 1.2, 2.5, 3.6, 4.9]).ok, true);
  assert.equal(tapPlausibility([0, 0.2, 0.4, 0.6, 0.8, 1.0]).ok, false);
});
