// Rings alarms while the app is open (foreground, or background where the browser allows).
// When the app is fully closed, no web page can run code — see README for reliable setups.

import { store } from '../core/store.js';
import { clock } from '../core/dates.js';
import { ringingAlarms, markRung } from '../engine/alarms.js';
import { notify, appBaseUrl } from './platform.js';

let showingKey = null;

export function startAlarmRunner() {
  checkAlarms();
}

export function alarmShowing() {
  return showingKey;
}

export function checkAlarms() {
  const s = store.state;
  if (!s.onboarded || !s.alarms.length || showingKey) return;
  const now = clock.now();
  const list = ringingAlarms(s, now);
  if (!list.length) return;
  const { alarm, occ } = list[0];
  showingKey = occ.key;
  store.update((st) => markRung(st, alarm, occ, now), { render: false });
  if (document.visibilityState !== 'visible') {
    const body = alarm.challenge ? `${alarm.challenge.pushups} push-ups${alarm.challenge.situps ? ` + ${alarm.challenge.situps} sit-ups` : ''} — tap to start` : 'Tap to open Lockstep';
    notify(`⏰ ${alarm.label}`, body, { tag: occ.key, url: `${appBaseUrl()}#/alarm/${alarm.id}`, requireInteraction: true });
  }
  import('../screens/alarms.js')
    .then((m) =>
      m.showRinging(alarm, occ.key, () => {
        showingKey = null;
      })
    )
    .catch((e) => {
      console.error(e);
      showingKey = null;
    });
}
