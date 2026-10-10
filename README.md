# Lockstep — your life, ranked

A mobile-first personal life RPG. It turns your real school, training, self-care, discipline, trading-education and business work into daily quests. You earn **lifetime XP**, and you climb a competitive ladder:
**Unranked → Bronze → Silver → Gold → Platinum → Diamond → Elite → Champion → Unreal**.

It's plain HTML, CSS and JavaScript. There's no build step, no account, no paid services and no tracking. Everything runs and is stored **on your own device**.

> The name "Lockstep" and all artwork (rank emblems, icon, UI) are original. The look is inspired by the screenshots you provided, but this is not affiliated with the "Lock In" app or with any game. To rename it, change `APP.name` in `js/core/config.js` and the names in `manifest.webmanifest` and `index.html`.

---

## 1. Run it on your computer (2 minutes)

You need **Python** (already on this PC) or any static web server.

1. Open a terminal in this folder (`Lock In App`).
2. Run:
   ```bash
   python -m http.server 5173
   ```
3. Open **http://localhost:5173** in Chrome, Edge or Safari.

To run the automated tests (they need Node.js):

```bash
node --test
```

> The camera only works on `https://` or `localhost`. The offline cache (service worker) is deliberately switched off on `localhost` so your edits show up immediately. It turns on automatically once the app is published.

---

## 2. Put it online for free with GitHub Pages

You get a private-by-obscurity web address like `https://YOUR-NAME.github.io/lockstep/`. You don't need any coding tools.

1. Create a free account at **github.com** (skip this if you have one).
2. Click **+ → New repository**. Name it `lockstep`, choose **Public** (free Pages requires public repos), and click **Create repository**.
   - Public means the *code* is visible. **Your data is not.** It never leaves your phone.
3. On the new repo page, click **"uploading an existing file"**.
4. Drag in **everything inside this folder** (`index.html`, `manifest.webmanifest`, `sw.js`, `.nojekyll`, and the `assets`, `css`, `js` folders; `tests` and `tools` are optional). Click **Commit changes**.
   - If the hidden `.nojekyll` file doesn't drag in, that's fine. It's optional for this project.
5. Go to **Settings → Pages**. Under *Build and deployment*, set **Source: Deploy from a branch**, **Branch: main / (root)**, and click **Save**.
6. Wait 1–2 minutes and refresh that Settings page. Your link appears at the top: `https://YOUR-NAME.github.io/lockstep/`.

**Updating later:** upload the changed files again (same steps 3–4). Before uploading, open `sw.js` and bump `const VERSION = 'lockstep-v1.0.1'`. Your phone will then show **"A new version is ready → Update"**.

*Other free hosts:* Netlify Drop (drag the folder onto app.netlify.com/drop) and Cloudflare Pages also work. Any static host serving over HTTPS is fine.

---

## 3. Add it to your iPhone Home Screen

1. Open your GitHub Pages link in **Safari**. (Not Chrome or an in-app browser. iOS only allows Home Screen apps from Safari.)
2. Tap the **Share** button (square with an arrow) → **Add to Home Screen** → **Add**.
3. Open **Lockstep from the Home Screen icon** from now on. It runs full-screen, works offline, and can request notifications (iOS 16.4+).

> ⚠️ **Important on iPhone:** the Home Screen app and Safari keep **separate storage**. Do your setup inside the Home Screen app and always use that. To move data between them (or to a new phone), use **Settings → Data & backup → Export / Import**.

---

## 4. Your data (read this once)

- Everything is stored **only in this browser on this device**: profile, quests, history, rank, settings, videos and images. Text data goes in `localStorage`; videos and images go in IndexedDB.
- **There is no cloud sync.** Your phone and computer won't share data unless you export from one and import on the other.
- Data **can be lost** if you clear Safari/website data, delete the Home Screen app, or iOS removes storage for a site you haven't used in weeks. **Export a backup regularly** (Settings → Data & backup → Export backup) and save it to Files/iCloud Drive.
- The app keeps an automatic backup copy of yesterday's save. If the main save is ever damaged, it restores that copy on its own and tells you.
- Saves are versioned (`schemaVersion`), and older backups are upgraded automatically when imported.
- Evidence videos never leave your phone and auto-delete after 14 days (changeable in Settings → Privacy). An optional **PIN lock** hides the app from casual snooping. It's a privacy screen, not encryption.

---

## 5. Alarms on iPhone — what works and what doesn't

**Honest limitation:** a website cannot run in the background or wake a locked phone. iOS suspends web apps as soon as they're closed, and ordinary JavaScript timers stop. Reliable background alarms would need a native iOS app or a push server, and neither is included.

What Lockstep does instead:

| Situation | What happens |
|---|---|
| App open (or in **Bedside mode** overnight) | Alarm rings with sound, a full-screen alarm screen, Snooze/Start, and reminders every N minutes |
| App in the background but still running (desktop/Android) | System notification, if you've allowed notifications |
| App closed | Nothing can ring from the website. Use one of the options below. |
| You open the app after the alarm time | Within the grace period your challenge opens automatically. After it, Home shows "Missed — do it now (late)". |

**Recommended reliable setup** (also in the app: Alarms → Reliable iPhone setup):

1. **Clock app:** set a normal iPhone alarm for the same time. When it rings, open Lockstep from your Home Screen. The challenge is waiting.
2. **Calendar:** Alarms → **Add alarms to Calendar** downloads a `.ics` file with repeating events and alerts. Calendar alerts fire even when the app is closed.
3. **Bedside mode:** leave Lockstep open on the Bedside screen while charging. It keeps the screen awake (where supported) so the in-app alarm rings with sound.

Sound note: iPhone only plays web audio after you've tapped the app once, and not when the silent switch is on. The ringing screen says "Tap anywhere to turn on the sound" when needed.

**Silent test mode** (Settings → About → Testing tools): alarms still appear on screen, but no sound or vibration plays. It's off by default, so your real alarms make sound. Turn it on only while testing.

---

## 6. How the ranked system works (short version)

The full rules, with every number, are inside the app under **Me → Rank Ladder → How ranked works**. All values live in one place: `DEFAULT_RANKED` in `js/core/config.js`.

- **XP and rating are separate.** XP (your level) only goes up. Rating (SR) goes up *and* down and decides your rank.
- **Every normal day is a ranked "match".** Your score is the share of that day's scheduled quests you completed, weighted by difficulty. If you're above your rank's daily standard, you gain SR. If you're below it, you lose some. Standards rise with rank: Bronze 30%, Gold 58%, Diamond 76%, Champion 88%, Unreal 92%.
- **Placement:** your setup day doesn't count. Your first 7 normal days decide your starting rank, and the best possible placement is Platinum I.
- **Promotions** into Platinum and above also require sustained discipline: days secured, category breadth, verified challenges, weekly scores, streaks, and days at Champion before Unreal.
- **Demotions** need you to fall 25 SR below your rank's line. You can't be demoted in the 3 days after a promotion. Rest days, sick/emergency days (4 per 30 days) and days with nothing scheduled never cost rating.
- **Anti-grinding:** each quest counts once per day; new quests join your matches the next day; short self-reported tasks can't be rated "Epic"; required video/timer checks reduce credit when skipped; there's a daily cap on bonus SR; and trading rewards process, never profit or risk.

Simulation with the default rules (`tests/` + a 240-day run):

| Daily consistency | Where you end up |
|---|---|
| 25% | Bronze |
| 45% | Silver |
| 60% | Gold |
| 75% | Platinum–Diamond |
| 85% | Elite → Champion (after months) |
| 92% | Champion |
| 97–100% + verified challenges | Unreal in about 3 months |

---

## 7. Video verification

On a push-up/sit-up challenge you can pick:

- **Camera:** records a video on your device and estimates reps from motion. It compares each frame with your start position, and one full down-and-up counts as one rep.
- **Upload video:** pick a clip you recorded. It's analysed on the device the same way.
- **Nose-tap:** put the phone under your face and touch it with your nose at the bottom of each rep. Spammed taps are detected.
- **Count myself:** self-reported.

The rep count is **an estimate, never proof**. You always confirm the number. If the estimate is unsure, you must watch at least half of your clip before you can submit (a manual review), or you can "review later". Verified results earn bonus XP/SR and count toward Elite+ requirements. The counter is a separate module (`js/verify/motion.js`), so a pose-detection model could replace it later.

---

## 8. Testing that was done

Automated (`node --test`): **27 tests pass**. They cover XP, rating, placement, promotion, demotion with buffer and protection, duplicate protection, undo, daily reset with history kept, excused-day refunds, streaks, weekly quests, goals, corrupted-data repair, suggestions, alarm windows and calendar export, the rep counter (synthetic motion), nose-tap spam detection, the weekly review, and the alarm sound with a mock audio device (real mode plays, silent mode stays silent).

Checked by hand in a real browser (phone-sized at 375 px and 320 px, plus desktop):

| # | Requirement | Result |
|---|---|---|
| 1 | New profile can be created (onboarding) | ✅ |
| 2 | Onboarding answers persist | ✅ |
| 3 | Quest can be created (with validation) | ✅ |
| 4 | Quest can be completed | ✅ |
| 5 | XP awarded correctly | ✅ |
| 6 | Rating changes by the rules | ✅ (daily match + bonus SR) |
| 7 | No duplicate rewards | ✅ |
| 8 | Promotions work | ✅ (unit test: Silver promotion after a winning day; requirement locks for Platinum+; placement → Gold II in the app) |
| 9 | Demotions work | ✅ (Gold II → Gold I after a 0% day, with buffer) |
| 10 | Survives refresh | ✅ |
| 11 | Survives closing and reopening (new tab) | ✅ |
| 12 | Daily quests reset without deleting history | ✅ |
| 13 | Push-up alarm rings, snoozes and the challenge completes | ✅ (silent test mode used after the first test) |
| 14 | Video evidence via upload (recorded WebM analysed: 6/6 reps, stored privately) | ✅ — live camera recording couldn't be tested here because the test browser has no camera; it uses the same standard APIs |
| 15 | Face & self-care routines customisable (product + step added, routine played) | ✅ |
| 16 | Export / import (including videos) round-trips exactly; bad files rejected | ✅ |
| 17 | Works on a narrow phone screen (320 px, no sideways scrolling) | ✅ |
| 18 | Unsupported notifications handled honestly | ✅ |

Also checked: offline loading (web server stopped → app loaded from cache), the PIN lock (no data visible while locked), the focus timer finishing while the app was "away", workout logging with PRs, the trading risk rule (10% risk → flagged, 0 XP), business and school tasks auto-completing linked quests, and reference image upload.

**Still worth checking on your actual iPhone:** live camera recording, the alarm sound with your phone's silent switch, and notifications from the Home Screen app. These depend on the device and couldn't be fully tested on a PC.

---

## 9. Known limitations

- No background alarms when the app is closed (see section 5). Pair it with the Clock app or Calendar.
- iPhone notifications need iOS 16.4+, the Home Screen app and permission, and they won't fire while the app is fully closed.
- Rep counting is a motion estimate. It needs a still camera, decent light and your whole body in frame.
- No cloud sync or multi-device sync. Use export/import.
- Reference images aren't read automatically (no OCR). You view them and type in what you need.
- Vibration doesn't exist in iPhone browsers. Sound requires the silent switch off.
- Time zone and day-start changes apply going forward. Past days aren't recalculated.

---

## 10. Project structure

```
index.html              App shell
manifest.webmanifest    Home Screen app settings
sw.js                   Offline cache (bump VERSION when you update)
assets/icons/           App icons (generated by tools/make-icons.mjs)
css/                    base (tokens), components, screens
js/main.js              Router, tab bar, background tick, day rollover
js/core/                config (ALL rules/numbers), dates, state + migrations, storage, media (IndexedDB)
js/engine/              ranked rating, quests & rewards, schedule/streaks, progress & achievements,
                        alarms & calendar export, suggestions from your profile, weekly review
js/data/                exercise library & routines, face/self-care routines, trading lessons
js/verify/              camera recorder, motion rep counter
js/services/            actions (rewards/celebrations), alarm runner, audio, backup, platform features
js/screens/             one file per screen
js/ui/                  DOM helpers, icons, rank emblems, charts, sheets/toasts
tests/                  node --test suites
tools/make-icons.mjs    Regenerates the PNG icons
```

Educational content (trading lessons, exercise and care instructions) is general information, not medical or financial advice. Stop any exercise that causes pain.
