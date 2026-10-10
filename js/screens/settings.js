// Settings: profile, time, notifications, appearance, ranked rules, privacy, data, about.

import { store } from '../core/store.js';
import { clock, deviceTz, listTimeZones, fmtDay, dayKey } from '../core/dates.js';
import { APP, ACCENTS, MAJORS, DEFAULT_RANKED, rankedConfig } from '../core/config.js';
import { fmtBytes, sha256, cleanText, deepClone } from '../core/util.js';
import { h, icon, btn, field, input, select, dayPicker, toggleRow, listItem, stepper } from '../ui/dom.js';
import { openSheet, toast, confirmDialog } from '../ui/overlay.js';
import { topbar } from '../ui/common.js';
import { unlockedAccents, unlockedTitles, levelInfo } from '../engine/progress.js';
import { capabilities, requestNotifications, notify, persistStorage, storageEstimate, shareOrDownload, downloadFile } from '../services/platform.js';
import { buildExport, importBackup, resetEverything, deleteEvidence, mediaBytes, enforceEvidenceRetention } from '../services/backup.js';
import { mediaUrl } from '../core/media.js';
import { chime, unlockAudio, silentTestMode, setSilentTestMode } from '../services/audio.js';

const set = (fn, render = true) => store.update((s) => fn(s.settings, s), { render });

export function render(ctx) {
  const s = ctx.state;
  const st = s.settings;
  const caps = capabilities();
  const lv = levelInfo(s);
  const storageEl = h('div.small.muted', 'Calculating…');
  (async () => {
    const est = await storageEstimate();
    const media = await mediaBytes();
    storageEl.textContent = `App data: ${fmtBytes(store.sizeBytes())} · Videos & images: ${fmtBytes(media)}${est && est.quota ? ` · Browser allows ~${fmtBytes(est.quota)}` : ''}`;
  })();

  return h(
    'div.screen',
    topbar('Settings', { back: '#/me' }),

    group(
      'Profile',
      h(
        'div.card.stack-12',
        field('Name', input({ value: s.profile.name, maxlength: 40, onchange: (e) => store.update((x) => (x.profile.name = cleanText(e.target.value, 40) || 'Player')) })),
        field(
          'Title',
          select(
            unlockedTitles(s).map((t) => ({ id: t.id, name: t.unlocked ? t.name : `🔒 ${t.name} (Lv ${t.level})` })),
            s.profile.titleId,
            (v) => {
              const t = unlockedTitles(s).find((x) => x.id === v);
              if (!t.unlocked) return toast(`Unlocks at level ${t.level}.`);
              store.update((x) => (x.profile.titleId = v));
            }
          )
        ),
        btn('Edit profile, goals & routines setup', () => (location.hash = '#/onboarding?edit=1&fresh=1'), { variant: 'ghost', block: true, iconName: 'user' })
      )
    ),

    group(
      'Day & time',
      h(
        'div.card.stack-12',
        field(
          'Time zone',
          select([{ id: 'auto', name: `Automatic (${deviceTz()})` }, ...listTimeZones().map((z) => ({ id: z, name: z }))], st.timeZone, (v) => set((x) => (x.timeZone = v))),
          'Quests, alarms and day resets use this time zone.'
        ),
        field('My day ends at', select([0, 1, 2, 3, 4, 5].map((n) => ({ id: n, name: n === 0 ? 'Midnight' : `${n}:00 AM` })), st.dayStartHour, (v) => set((x) => (x.dayStartHour = Number(v)))), 'Changing this mid-day can shift which day a completion belongs to.'),
        field('Week starts on', select([{ id: 1, name: 'Monday' }, { id: 0, name: 'Sunday' }], st.weekStartsOn, (v) => set((x) => (x.weekStartsOn = Number(v))))),
        field('Weekly rest days', dayPicker(st.restDays, (v) => set((x) => (x.restDays = v))), 'Nothing is due on rest days and your streak is frozen.'),
        toggleRow('24-hour clock', null, st.clock24, (v) => set((x) => (x.clock24 = v)))
      )
    ),

    group(
      'Alarms, notifications & sound',
      h(
        'div.card',
        listItem({ iconName: 'alarm', title: 'Alarms & challenges', sub: `${s.alarms.length} alarm(s)`, onClick: () => (location.hash = '#/alarms') }),
        h(
          'div.stack-8.mt-8',
          h('div.small.muted', notifText(caps)),
          caps.permission !== 'granted' && caps.permission !== 'unsupported'
            ? btn('Allow notifications', async () => {
                const r = await requestNotifications();
                toast(r === 'granted' ? 'Notifications enabled.' : 'Not allowed. You can change this in your browser or iPhone settings.');
                store.notify();
              }, { variant: 'ghost', block: true, iconName: 'bell' })
            : null,
          caps.permission === 'granted'
            ? btn('Send a test notification', async () => {
                const ok = await notify('Lockstep test', 'Notifications are working.', { tag: 'test' });
                toast(ok ? 'Sent.' : 'Couldn’t show a notification here.');
              }, { variant: 'ghost', block: true, iconName: 'bell' })
            : null
        ),
        toggleRow('Sound effects & alarm sound', 'Requires your phone’s silent switch off for web audio.', st.sound, (v) => set((x) => (x.sound = v))),
        toggleRow('Vibration', 'Android only — iPhone browsers don’t support vibration.', st.haptics, (v) => set((x) => (x.haptics = v))),
        h('div.mt-8', btn('Test sound', () => (unlockAudio(), setTimeout(chime, 50)), { variant: 'ghost', size: 'sm', iconName: 'volume' }))
      )
    ),

    group(
      'Appearance',
      h(
        'div.card.stack-12',
        h('div.field-label', `Accent colour · unlock more by levelling up (you’re Lv ${lv.level})`),
        h(
          'div.color-swatches',
          unlockedAccents(s).map((a) =>
            h(
              'button.swatch' + (st.accent === a.id ? '.on' : '') + (a.unlocked ? '' : '.locked'),
              { type: 'button', style: { background: a.color, color: a.color }, title: a.unlocked ? a.name : `${a.name} — Lv ${a.level}`, 'aria-label': a.unlocked ? a.name : `${a.name}, locked until level ${a.level}`, onclick: () => (a.unlocked ? set((x) => (x.accent = a.id)) : toast(`${a.name} unlocks at level ${a.level}.`)) },
              a.unlocked ? null : icon('lock', 16)
            )
          )
        ),
        toggleRow('Starfield background', null, st.starfield, (v) => set((x) => (x.starfield = v))),
        toggleRow('Pure black background (OLED)', null, !!st.oled, (v) => set((x) => (x.oled = v))),
        toggleRow('Reduce motion', 'Turns off animations.', st.reduceMotion, (v) => set((x) => (x.reduceMotion = v)))
      )
    ),

    group(
      'Ranked rules',
      h(
        'div.card',
        listItem({ iconName: 'ladder', title: 'How ranked works', sub: 'Every rule and number, explained', onClick: () => (location.hash = '#/ladder') }),
        listItem({ iconName: 'settings', title: 'Customise rules', sub: st.customRules ? 'Custom rules active' : 'Using standard rules', onClick: () => openRulesEditor() })
      )
    ),

    group(
      'Privacy',
      h(
        'div.card.stack-12',
        h('p.small.muted', 'Everything — profile, quests, history, videos and images — is stored only in this browser on this device. There is no account and no cloud sync. Nothing is uploaded.'),
        toggleRow('PIN lock', 'A privacy screen when the app opens (not encryption).', !!st.pinHash, (v) => (v ? openPinSetup() : removePin())),
        field(
          'Delete evidence videos after',
          select([3, 7, 14, 30, 0].map((n) => ({ id: n, name: n ? `${n} days` : 'Never (keep until I delete)' })), st.evidenceRetentionDays, async (v) => {
            set((x) => (x.evidenceRetentionDays = Number(v)), false);
            const n = await enforceEvidenceRetention();
            toast(n ? `Deleted ${n} old video(s).` : 'Saved.');
            store.notify();
          })
        ),
        btn(`Manage evidence videos (${s.evidence.length})`, () => openEvidence(), { variant: 'ghost', block: true, iconName: 'video' }),
        btn(`Reference images (${s.references.length})`, () => (location.hash = '#/references'), { variant: 'ghost', block: true, iconName: 'image' })
      )
    ),

    group(
      'Data & backup',
      h(
        'div.card.stack-12',
        storageEl,
        h('p.small.muted', 'Your data lives in this browser only. It won’t sync to other devices, and clearing Safari/website data (or deleting the Home Screen app) erases it. Export a backup regularly — e.g. weekly — and keep it in Files or iCloud Drive.'),
        h('div.grid-2', btn('Export backup', () => doExport(false), { iconName: 'download' }), btn('Export + videos', () => doExport(true), { variant: 'ghost', iconName: 'download' })),
        importButton(),
        btn('Ask browser to keep data', async () => toast((await persistStorage()) ? 'Storage marked as persistent.' : 'The browser didn’t grant persistent storage (Home Screen apps on iPhone usually keep data).'), { variant: 'ghost', block: true, iconName: 'shield' }),
        store.corruptCopy() ? btn('Download damaged save (for recovery)', () => downloadFile('lockstep-damaged-save.json', store.corruptCopy(), 'application/json'), { variant: 'ghost', block: true }) : null,
        btn('Reset everything', async () => {
          const ok = await confirmDialog({ title: 'Erase all Lockstep data?', message: 'This permanently deletes your profile, quests, history, rank, videos and images on this device. Export a backup first if you might want it back.', okText: 'Erase everything', danger: true, requireText: 'RESET' });
          if (!ok) return;
          await resetEverything();
          location.hash = '#/onboarding';
          location.reload();
        }, { variant: 'danger', block: true, iconName: 'trash' })
      )
    ),

    group(
      'About',
      h(
        'div.card.stack-8',
        h('div.bold', `${APP.name} ${APP.version}`),
        h('p.small.muted', 'A personal life RPG. Original design inspired by modern habit apps; not affiliated with any app or game. Rank names are used generically.'),
        h(
          'details',
          h('summary.small.muted', 'Known limitations'),
          h(
            'ul.instructions.small',
            h('li', 'Alarms ring only while the app is open (or in Bedside mode). Websites cannot wake a closed phone — pair with your Clock app or Calendar.'),
            h('li', 'Notifications on iPhone require iOS 16.4+ and adding the app to your Home Screen, and won’t fire while the app is fully closed.'),
            h('li', 'Rep counting is a motion estimate, not proof. You always confirm the count.'),
            h('li', 'No cloud sync: data stays on this device unless you export it.'),
            h('li', 'Images aren’t read automatically — you type in what you want to use.')
          )
        ),
        devTools()
      )
    )
  );
}

function group(title, ...children) {
  return h('div.settings-group', h('div.eyebrow', title), ...children);
}

function notifText(caps) {
  if (caps.permission === 'granted') return 'Notifications are allowed. Alarms also show a notification when Lockstep is in the background (where your browser allows it).';
  if (caps.permission === 'denied') return 'Notifications are blocked for this site. Change it in your browser/iPhone settings if you want them.';
  if (caps.permission === 'unsupported') return caps.ios && !caps.standalone ? 'On iPhone, add Lockstep to your Home Screen first (Share → Add to Home Screen), then enable notifications here.' : 'This browser doesn’t support notifications. Alarms still ring while the app is open.';
  return 'Notifications are optional. They help when the app is open in the background; they can’t wake a closed app.';
}

async function doExport(withMedia) {
  try {
    toast('Preparing backup…');
    const { blob, filename, bytes } = await buildExport({ includeMedia: withMedia });
    const r = await shareOrDownload(filename, blob, 'application/json');
    if (r !== 'cancelled') toast(`Backup ready (${fmtBytes(bytes)}). Save it somewhere safe.`, { type: 'success' });
  } catch (e) {
    toast('Export failed: ' + e.message, { type: 'error' });
  }
}

function importButton() {
  const fileIn = h('input.hidden', { type: 'file', accept: 'application/json,.json' });
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files[0];
    fileIn.value = '';
    if (!f) return;
    const ok = await confirmDialog({ title: 'Import this backup?', message: 'It will REPLACE everything currently in Lockstep on this device. Consider exporting first.', okText: 'Import & replace', danger: true });
    if (!ok) return;
    try {
      const r = await importBackup(f);
      toast(`Imported ${r.quests} quests and ${r.completions} completions${r.restored ? ` and ${r.restored} media files` : ''}.`, { type: 'success', duration: 5000 });
      location.hash = '#/home';
    } catch (e) {
      toast(e.message, { type: 'error', duration: 6000 });
    }
  });
  return h('div', fileIn, btn('Import backup', () => fileIn.click(), { variant: 'ghost', block: true, iconName: 'upload' }));
}

function openPinSetup() {
  let first = '';
  openSheet({
    title: 'Set a PIN',
    size: 'sm',
    onClose: () => store.notify(),
    render: (close) => {
      const inp = input({ type: 'password', inputmode: 'numeric', maxlength: 4, placeholder: '4 digits', autofocus: true, autocomplete: 'off' });
      const msg = h('p.small.muted', 'Choose a 4-digit PIN. If you forget it, the only way back in is clearing this site’s data (which erases everything) — so keep a backup.');
      return h(
        'div.stack-12',
        msg,
        inp,
        btn('Continue', async () => {
          const v = inp.value.trim();
          if (!/^\d{4}$/.test(v)) return toast('Use exactly 4 digits.', { type: 'error' });
          if (!first) {
            first = v;
            inp.value = '';
            msg.textContent = 'Enter it again to confirm.';
            return;
          }
          if (v !== first) {
            first = '';
            inp.value = '';
            msg.textContent = 'PINs didn’t match. Choose a 4-digit PIN.';
            return;
          }
          const hash = await sha256('lockstep:' + v);
          set((x) => (x.pinHash = hash));
          toast('PIN set.', { type: 'success' });
          close();
        }, { block: true })
      );
    },
  });
}

async function removePin() {
  if (!(await confirmDialog({ title: 'Remove PIN lock?', okText: 'Remove' }))) return store.notify();
  set((x) => (x.pinHash = ''));
}

function openEvidence() {
  openSheet({
    title: 'Evidence videos',
    render: (close, rerender) => {
      const s = store.state;
      const list = [...s.evidence].sort((a, b) => b.ts - a.ts);
      return h(
        'div.stack-12',
        h('p.small.muted', 'Stored privately on this device. They’re only used for your own challenge reviews.'),
        list.length
          ? h(
              'div.list',
              list.map((e) =>
                listItem({
                  iconName: 'video',
                  title: fmtDay(e.day || dayKey(e.ts, s.settings), { weekday: true }),
                  sub: fmtBytes(e.size || 0),
                  right: h(
                    'div.row.gap-6',
                    btn('Play', async () => {
                      const u = await mediaUrl(e.id);
                      if (!u) return toast('This video is no longer stored.');
                      openSheet({ title: 'Evidence', render: () => h('video.evidence-video', { src: u, controls: true, playsinline: true, autoplay: true }) });
                    }, { variant: 'ghost', size: 'sm' }),
                    btn('Delete', async () => {
                      if (!(await confirmDialog({ title: 'Delete this video?', message: 'The challenge result stays in your history.', okText: 'Delete', danger: true }))) return;
                      await deleteEvidence(e.id);
                      rerender();
                    }, { variant: 'ghost', size: 'sm' })
                  ),
                })
              )
            )
          : h('p.muted', 'No evidence videos stored.'),
        list.length
          ? btn('Delete all videos', async () => {
              if (!(await confirmDialog({ title: 'Delete all evidence videos?', okText: 'Delete all', danger: true }))) return;
              for (const e of list) await deleteEvidence(e.id);
              close();
            }, { variant: 'ghost', block: true, iconName: 'trash' })
          : null
      );
    },
  });
}

function openRulesEditor() {
  const s0 = store.state;
  const o = deepClone(s0.settings.rankedOverrides || {});
  const cfg = rankedConfig(s0);
  const val = (path, def) => path.reduce((a, k) => (a == null ? undefined : a[k]), o) ?? def;
  const put = (path, v) => {
    let x = o;
    for (const k of path.slice(0, -1)) x = x[k] ||= {};
    x[path[path.length - 1]] = v;
  };
  openSheet({
    title: 'Customise ranked rules',
    render: (close) =>
      h(
        'div.stack-16',
        h('div.info-row', icon('info', 16), h('span', 'These change how hard the ladder is. Changes apply from now on (past days aren’t recalculated), and the current season is marked as played with custom rules.')),
        num('Placement days', ['placementDays'], cfg.placementDays, 3, 14, 1),
        num('Demotion buffer (SR)', ['demotionBuffer'], cfg.demotionBuffer, 0, 150, 5),
        num('Protection after promotion (days)', ['promotionProtectionDays'], cfg.promotionProtectionDays, 0, 14, 1),
        num('Recovery days per 30 days', ['excuseAllowance30'], cfg.excuseAllowance30, 0, 10, 1),
        num('Log missed quests up to (days back)', ['backfillDays'], cfg.backfillDays, 0, 3, 1),
        num('Season length (weeks)', ['season', 'weeks'], cfg.season.weeks, 4, 52, 1),
        num('Streak threshold (% of quests)', ['streakThreshold'], Math.round(cfg.streakThreshold * 100), 30, 100, 5, 100),
        h('div.field-label', 'Daily standard per rank (% of quests)'),
        ...MAJORS.slice(1).map((m) => num(m.name, ['majors', m.id, 'standard'], Math.round(cfg.majors[m.id].standard * 100), 20, 98, 1, 100)),
        h(
          'div.sheet-actions',
          btn('Save rules', () => {
            store.update((x) => {
              x.settings.rankedOverrides = o;
              x.settings.customRules = true;
              x.ranked.season.customRules = true;
            });
            close();
            toast('Rules updated.', { type: 'success' });
          }, { block: true, size: 'lg' }),
          btn('Restore standard rules', () => {
            store.update((x) => (x.settings.rankedOverrides = {}));
            close();
            toast('Standard rules restored.');
          }, { variant: 'ghost', block: true })
        )
      ),
  });
  function num(label, path, cur, min, max, step, scale = 1) {
    const def = path.reduce((a, k) => a[k], DEFAULT_RANKED);
    return field(label, stepper(Math.round((val(path, def) ?? cur) * (scale === 1 ? 1 : scale)), { min, max, step, onChange: (v) => put(path, scale === 1 ? v : v / scale) }), `Standard: ${scale === 1 ? def : Math.round(def * scale) + '%'}`);
  }
}

function devTools() {
  const off = clock.offset;
  const setOff = (ms) => {
    try {
      localStorage.setItem('lockstep.devOffsetMs', String(ms));
    } catch {
      /* ignore */
    }
    location.reload();
  };
  return h(
    'details.mt-8',
    h('summary.small.muted', 'Testing tools'),
    h(
      'div.stack-8.mt-8',
      toggleRow('Silent test mode', 'Alarms still appear on screen, but no sound or vibration plays. Turn off for real use.', silentTestMode(), (v) => {
        setSilentTestMode(v);
        toast(v ? 'Silent test mode on — alarm sounds are muted on this device.' : 'Silent test mode off — alarms will make sound again.');
        store.notify();
      }),
      h('p.tiny.faint', `Time travel lets you test day resets, streaks and alarms without waiting. It changes the app’s clock only. Current offset: ${Math.round(off / 3600000)}h.`),
      h('div.grid-3', btn('+1 hour', () => setOff(off + 3600000), { variant: 'ghost', size: 'sm' }), btn('+1 day', () => setOff(off + 86400000), { variant: 'ghost', size: 'sm' }), btn('Reset', () => setOff(0), { variant: 'ghost', size: 'sm' }))
    )
  );
}

