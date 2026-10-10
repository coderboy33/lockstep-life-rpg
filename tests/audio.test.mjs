// Alarm sound tests with a mock audio device (no real sound is played).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';

let oscillators = 0;
let vibrations = 0;
class MockParam {
  setValueAtTime() {}
  exponentialRampToValueAtTime() {}
}
class MockNode {
  constructor() {
    this.frequency = new MockParam();
    this.gain = new MockParam();
  }
  connect(n) {
    return n || this;
  }
  start() {}
  stop() {}
}
class MockAudioContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 0;
    this.destination = {};
  }
  resume() {
    return Promise.resolve();
  }
  createOscillator() {
    oscillators++;
    return new MockNode();
  }
  createGain() {
    return new MockNode();
  }
  createBuffer() {
    return {};
  }
  createBufferSource() {
    return new MockNode();
  }
}
const store = new Map();
globalThis.window = globalThis;
globalThis.AudioContext = MockAudioContext;
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
Object.defineProperty(globalThis, 'navigator', { value: { vibrate: () => (vibrations++, true) }, configurable: true });

const audio = await import('../js/services/audio.js');
after(() => audio.stopAlarmSound());

test('real alarm mode plays sound and vibrates', () => {
  audio.setSilentTestMode(false);
  audio.unlockAudio();
  oscillators = 0;
  vibrations = 0;
  audio.startAlarmSound('pulse', true);
  assert.ok(oscillators > 0, 'alarm tones were generated');
  assert.ok(vibrations > 0, 'vibration requested');
  assert.equal(audio.isRinging(), true);
  audio.stopAlarmSound();
  assert.equal(audio.isRinging(), false);
});

test('silent test mode produces no sound or vibration but still "rings"', () => {
  audio.setSilentTestMode(true);
  oscillators = 0;
  vibrations = 0;
  audio.startAlarmSound('siren', true);
  audio.chime();
  assert.equal(oscillators, 0, 'no tones in silent mode');
  assert.equal(vibrations, 0, 'no vibration in silent mode');
  assert.equal(audio.isRinging(), true, 'alarm state still active for the UI');
  audio.stopAlarmSound();
  audio.setSilentTestMode(false);
  assert.equal(audio.silentTestMode(), false, 'off by default / after turning off');
});
