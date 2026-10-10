// Platform capabilities: notifications, service worker, wake lock, storage persistence.
// Every function degrades gracefully and reports honestly what's supported.

export function isIOS() {
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalone() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
}

export function capabilities() {
  const ios = isIOS();
  const standalone = isStandalone();
  const notifApi = 'Notification' in window;
  return {
    ios,
    standalone,
    notifApi,
    permission: notifApi ? Notification.permission : 'unsupported',
    serviceWorker: 'serviceWorker' in navigator,
    wakeLock: 'wakeLock' in navigator,
    vibrate: 'vibrate' in navigator,
    camera: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
    recorder: typeof MediaRecorder !== 'undefined',
    secure: window.isSecureContext,
    // Background alarms with the app closed need a push server (not included) or a native app.
    backgroundAlarms: false,
  };
}

export async function requestNotifications() {
  if (!('Notification' in window)) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

let swReg = null;

export async function registerServiceWorker(onUpdate) {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return null;
  // While developing on localhost, skip the offline cache so edits show up immediately.
  const dev = ['localhost', '127.0.0.1'].includes(location.hostname) && localStorage.getItem('lockstep.forceSW') !== '1';
  if (dev) {
    const regs = await navigator.serviceWorker.getRegistrations().catch(() => []);
    for (const r of regs) r.unregister();
    return null;
  }
  try {
    swReg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    swReg.addEventListener('updatefound', () => {
      const nw = swReg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) onUpdate && onUpdate(nw);
      });
    });
    // Notification clicks route here.
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'navigate' && e.data.url) {
        const hash = e.data.url.split('#')[1];
        if (hash) location.hash = hash;
      }
    });
    return swReg;
  } catch (e) {
    console.warn('Service worker registration failed', e);
    return null;
  }
}

/** Shows a system notification if permitted. Returns true if one was shown. */
export async function notify(title, body, { tag, url, requireInteraction = false } = {}) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;
  const opts = { body, tag, renotify: !!tag, requireInteraction, icon: './assets/icons/icon-192.png', badge: './assets/icons/icon-192.png', data: { url: url || location.href } };
  try {
    const reg = swReg || (navigator.serviceWorker && (await navigator.serviceWorker.getRegistration()));
    if (reg && reg.showNotification) {
      await reg.showNotification(title, opts);
      return true;
    }
    new Notification(title, opts);
    return true;
  } catch {
    return false;
  }
}

let wakeLock = null;
export async function keepAwake(on) {
  try {
    if (on) {
      if (!('wakeLock' in navigator)) return false;
      if (wakeLock && !wakeLock.released) return true;
      wakeLock = await navigator.wakeLock.request('screen');
      return true;
    }
    if (wakeLock) await wakeLock.release();
    wakeLock = null;
    return true;
  } catch {
    return false;
  }
}

export async function persistStorage() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch {
    /* ignore */
  }
  return false;
}

export async function storageEstimate() {
  try {
    if (navigator.storage && navigator.storage.estimate) return await navigator.storage.estimate();
  } catch {
    /* ignore */
  }
  return null;
}

export function downloadFile(filename, content, mime = 'application/octet-stream') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 2000);
}

/** Uses the iOS/Android share sheet when available (best way to save files on iPhone). */
export async function shareOrDownload(filename, content, mime) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  try {
    const file = new File([blob], filename, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancelled';
  }
  downloadFile(filename, blob, mime);
  return 'downloaded';
}

export function appBaseUrl() {
  return location.href.split('#')[0].split('?')[0];
}
