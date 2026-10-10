// In-memory session state shared by modules (never saved).

import { store } from './store.js';

export const session = { unlocked: false };

/** True while the optional PIN privacy screen is showing. */
export function isLocked() {
  return !!(store.state && store.state.settings.pinHash) && !session.unlocked;
}

/** Resolves once the app is unlocked (immediately if there's no PIN). */
export function whenUnlocked() {
  return new Promise((resolve) => {
    const check = () => (isLocked() ? setTimeout(check, 500) : resolve());
    check();
  });
}
