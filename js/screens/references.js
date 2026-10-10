// Reference images: private, on-device screenshots you use while building routines and schedules.

import { store } from '../core/store.js';
import { clock, fmtDay, dayKey } from '../core/dates.js';
import { uid, cleanText, fmtBytes } from '../core/util.js';
import { h, icon, btn, field, select, textarea, clear, empty } from '../ui/dom.js';
import { openSheet, toast, confirmDialog } from '../ui/overlay.js';
import { topbar } from '../ui/common.js';
import { putMedia, mediaUrl, deleteMedia, compressImage, mediaSupported, releaseUrl } from '../core/media.js';

export const REF_TAGS = [
  { id: 'workout', name: 'Workout routine' },
  { id: 'schedule', name: 'School schedule' },
  { id: 'routine', name: 'Daily routine' },
  { id: 'skincare', name: 'Skincare products' },
  { id: 'inspiration', name: 'Inspiration' },
  { id: 'tracker', name: 'Habit tracker' },
  { id: 'design', name: 'How I want it to look' },
  { id: 'other', name: 'Other' },
];
const tagName = (id) => (REF_TAGS.find((t) => t.id === id) || REF_TAGS[REF_TAGS.length - 1]).name;

export function render() {
  return h(
    'div.screen',
    topbar('Reference images', { back: '#/me' }),
    h('p.muted.small', 'Screenshots of schedules, workouts, products or designs you want to follow. Open one while creating a quest or routine and copy in what you need.'),
    h('div.mt-16', referenceManager({})),
    h(
      'div.card.flat.mt-16',
      h('div.row.gap-8', icon('lock', 16), h('div.bold.small', 'How images are stored')),
      h('p.small.muted.mt-8', 'Images are compressed and saved in this browser’s private storage (IndexedDB) on this device only. They are never uploaded or shared. They’re not included in backups unless you choose “Export with media”. Deleting an image removes it permanently.')
    )
  );
}

/** Thumbnail grid + upload button. */
export function referenceManager({ compact = false } = {}) {
  const wrap = h('div.refs');
  const grid = h('div.ref-grid');
  const fileIn = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'hidden', 'aria-label': 'Upload reference images' });
  fileIn.addEventListener('change', async () => {
    const files = [...fileIn.files].slice(0, 12);
    fileIn.value = '';
    if (!files.length) return;
    if (!mediaSupported()) return toast('This browser can’t store images.', { type: 'error' });
    let added = 0;
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      try {
        const blob = await compressImage(f);
        const mediaId = uid('img');
        await putMedia(mediaId, blob, { kind: 'image' });
        store.update((s) => s.references.push({ id: uid('ref'), mediaId, tag: 'other', note: '', name: cleanText(f.name, 60), size: blob.size, ts: clock.now() }), { render: false });
        added++;
      } catch (e) {
        console.error(e);
        toast('Couldn’t save one of the images (storage may be full).', { type: 'error' });
      }
    }
    if (added) toast(`${added} image${added > 1 ? 's' : ''} saved on this device.`, { type: 'success' });
    paint();
  });
  const paint = () => {
    clear(grid);
    const refs = [...store.state.references].sort((a, b) => b.ts - a.ts);
    if (!refs.length) grid.appendChild(empty('image', 'No reference images yet', compact ? 'Optional — you can add them later from Me → Reference images.' : 'Upload screenshots of routines, timetables or products.'));
    for (const r of refs) {
      const img = h('img.ref-img', { alt: r.note || tagName(r.tag), loading: 'lazy' });
      mediaUrl(r.mediaId).then((u) => u && (img.src = u));
      grid.appendChild(h('button.ref-tile', { type: 'button', onclick: () => openReference(r.id, paint) }, img, h('span.ref-tag', tagName(r.tag))));
    }
  };
  paint();
  wrap.append(btn('Upload images', () => fileIn.click(), { variant: 'ghost', iconName: 'upload', block: true }), fileIn, h('div.mt-12', grid));
  return wrap;
}

export function openReference(refId, onChange) {
  const r = store.state.references.find((x) => x.id === refId);
  if (!r) return;
  openSheet({
    title: 'Reference image',
    size: 'full',
    render: (close) => {
      const img = h('img.ref-full', { alt: r.note || 'Reference image' });
      mediaUrl(r.mediaId).then((u) => (u ? (img.src = u) : img.replaceWith(h('p.muted', 'This image is no longer on this device.'))));
      let tag = r.tag;
      let note = r.note;
      return h(
        'div.stack-12',
        h('a.ref-full-wrap', { onclick: () => img.classList.toggle('zoom') }, img),
        h('div.tiny.faint', `Added ${fmtDay(dayKey(r.ts, store.state.settings))}${r.size ? ' · ' + fmtBytes(r.size) : ''}`),
        field('What is this?', select(REF_TAGS, tag, (v) => (tag = v))),
        field('What do you want to take from it?', textarea({ value: note, placeholder: 'e.g. “Copy this 4-day split”, “Use the Monday timetable”', oninput: (e) => (note = e.target.value) }), 'Confirm the details yourself — nothing is read from the image automatically.'),
        btn('Save', () => {
          store.update((s) => {
            const x = s.references.find((y) => y.id === refId);
            if (x) Object.assign(x, { tag, note: cleanText(note, 500) });
          }, { render: false });
          onChange && onChange();
          close();
        }, { block: true }),
        h(
          'div.grid-2',
          btn('Make a quest', async () => {
            close();
            const m = await import('./quests.js');
            m.openQuestEditor(null, { refId: r.id, title: '', description: cleanText(note, 300) });
          }, { variant: 'ghost', iconName: 'target' }),
          btn('Make a routine', async () => {
            close();
            const m = await import('./workout.js');
            m.openRoutineEditor(null, { refId: r.id });
          }, { variant: 'ghost', iconName: 'dumbbell' })
        ),
        btn('Delete image', async () => {
          if (!(await confirmDialog({ title: 'Delete this image?', message: 'It will be permanently removed from this device.', okText: 'Delete', danger: true }))) return;
          await deleteMedia(r.mediaId).catch(() => {});
          releaseUrl(r.mediaId);
          store.update((s) => (s.references = s.references.filter((x) => x.id !== refId)), { render: false });
          onChange && onChange();
          close();
        }, { variant: 'ghost', iconName: 'trash', block: true })
      );
    },
  });
}

/** Small pinned preview used at the top of editors. */
export function refPreview(refId) {
  const r = store.state.references.find((x) => x.id === refId);
  if (!r) return null;
  const img = h('img.ref-pin-img', { alt: 'Reference' });
  mediaUrl(r.mediaId).then((u) => u && (img.src = u));
  return h('button.ref-pin', { type: 'button', onclick: () => img.classList.toggle('zoom'), 'aria-label': 'Reference image (tap to enlarge)' }, img, h('span.tiny.faint', r.note ? `Ref: ${r.note}` : 'Reference image — tap to enlarge'));
}
