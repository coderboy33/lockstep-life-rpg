// Export / import / reset, and automatic deletion of old evidence videos.

import { store } from '../core/store.js';
import { APP } from '../core/config.js';
import { clock, dayKey } from '../core/dates.js';
import { migrate, defaultState } from '../core/state.js';
import { listMedia, getMedia, putMedia, deleteMedia, clearAllMedia, blobToDataUrl, dataUrlToBlob, mediaSupported } from '../core/media.js';
import { isObj } from '../core/util.js';

export async function buildExport({ includeMedia = false } = {}) {
  store.flush();
  const out = {
    app: 'lockstep',
    appVersion: APP.version,
    schemaVersion: APP.schemaVersion,
    exportedAt: new Date(clock.now()).toISOString(),
    state: store.state,
    media: [],
  };
  if (includeMedia && mediaSupported()) {
    for (const m of await listMedia()) {
      const rec = await getMedia(m.id);
      if (rec && rec.blob) out.media.push({ id: rec.id, mime: rec.mime, data: await blobToDataUrl(rec.blob) });
    }
  }
  const json = JSON.stringify(out);
  const stamp = dayKey(clock.now(), store.state.settings);
  return { blob: new Blob([json], { type: 'application/json' }), filename: `lockstep-backup-${stamp}${includeMedia ? '-with-media' : ''}.json`, bytes: json.length };
}

/** Validates and restores a backup file. Throws a readable Error if it can't. */
export async function importBackup(file) {
  if (!file) throw new Error('No file selected.');
  if (file.size > 400 * 1024 * 1024) throw new Error('That file is too large to be a Lockstep backup.');
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('That file isn’t valid JSON. Pick a file exported from Lockstep.');
  }
  if (!isObj(data) || data.app !== 'lockstep' || !isObj(data.state)) throw new Error('This doesn’t look like a Lockstep backup.');
  const next = migrate(data.state, clock.now());
  let restored = 0;
  if (Array.isArray(data.media) && data.media.length && mediaSupported()) {
    for (const m of data.media) {
      if (!m || typeof m.id !== 'string' || typeof m.data !== 'string' || !m.data.startsWith('data:')) continue;
      try {
        await putMedia(m.id, await dataUrlToBlob(m.data), { mime: m.mime });
        restored++;
      } catch {
        /* skip broken media */
      }
    }
  }
  store.replace(next);
  return { restored, quests: next.quests.length, completions: next.completions.length };
}

export async function resetEverything() {
  store.wipe();
  if (mediaSupported()) await clearAllMedia().catch(() => {});
  store.replace(defaultState(clock.now()));
}

export async function deleteEvidence(id) {
  await deleteMedia(id).catch(() => {});
  store.update((s) => {
    const e = s.evidence.find((x) => x.id === id);
    if (e) e.deleted = true;
    s.evidence = s.evidence.filter((x) => x.id !== id);
    for (const ch of s.challenges) if (ch.evidence) ch.evidence = ch.evidence.filter((x) => x !== id);
  });
}

/** Deletes evidence videos older than the retention setting (0 = keep). */
export async function enforceEvidenceRetention() {
  const s = store.state;
  const days = Number(s.settings.evidenceRetentionDays) || 0;
  if (!days || !mediaSupported()) return 0;
  const cutoff = clock.now() - days * 86400000;
  const old = s.evidence.filter((e) => e.kind === 'video' && e.ts < cutoff);
  for (const e of old) await deleteEvidence(e.id);
  return old.length;
}

export async function mediaBytes() {
  if (!mediaSupported()) return 0;
  try {
    return (await listMedia()).reduce((a, m) => a + (m.size || 0), 0);
  } catch {
    return 0;
  }
}
