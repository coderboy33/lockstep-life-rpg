// Private on-device storage for videos and images (IndexedDB). Nothing is uploaded anywhere.

const DB_NAME = 'lockstep-media';
const STORE = 'blobs';
let dbPromise = null;

export const mediaSupported = () => typeof indexedDB !== 'undefined';

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx(mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        let result;
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error || new Error('Transaction aborted'));
        try {
          fn(t.objectStore(STORE), (r) => (result = r));
        } catch (e) {
          reject(e);
        }
      })
  );
}

export function putMedia(id, blob, meta = {}) {
  return tx('readwrite', (st) => {
    st.put({ id, blob, mime: blob.type || meta.mime || 'application/octet-stream', size: blob.size, ts: Date.now(), ...meta });
  });
}

export function getMedia(id) {
  return tx('readonly', (st, set) => {
    const r = st.get(id);
    r.onsuccess = () => set(r.result || null);
  });
}

export function deleteMedia(id) {
  return tx('readwrite', (st) => {
    st.delete(id);
  });
}

export function listMedia() {
  return tx('readonly', (st, set) => {
    const out = [];
    const r = st.openCursor();
    r.onsuccess = () => {
      const c = r.result;
      if (c) {
        out.push({ id: c.value.id, size: c.value.size || 0, mime: c.value.mime, ts: c.value.ts });
        c.continue();
      } else set(out);
    };
  });
}

export async function clearAllMedia() {
  const all = await listMedia();
  for (const m of all) await deleteMedia(m.id);
}

const urlCache = new Map();
/** Object URL for showing a stored blob (cached; revoke with releaseUrl). */
export async function mediaUrl(id) {
  if (urlCache.has(id)) return urlCache.get(id);
  const rec = await getMedia(id);
  if (!rec) return null;
  const url = URL.createObjectURL(rec.blob);
  urlCache.set(id, url);
  return url;
}

export function releaseUrl(id) {
  const u = urlCache.get(id);
  if (u) URL.revokeObjectURL(u);
  urlCache.delete(id);
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}

/** Downscale an image file so reference photos don't fill up storage. */
export async function compressImage(file, maxSide = 1600, quality = 0.85) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', quality));
    return blob || file;
  } catch {
    return file;
  }
}
