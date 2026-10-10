// Trading education: journal (sim / backtest / real / idea), checklist, strategies,
// risk lessons and a position-size calculator. Rewards process — never profit or risk.

import { store } from '../core/store.js';
import { clock, dayKey, weekKey, addDays, fmtDay, relDay } from '../core/dates.js';
import { uid, cleanText, toNum, fmtNum } from '../core/util.js';
import { h, icon, btn, field, input, textarea, select, chips, segmented, dateInput, sectionHead, empty, listItem, clear, numInput } from '../ui/dom.js';
import { openSheet, toast, confirmDialog, rewardPop } from '../ui/overlay.js';
import { LESSONS, TRADE_MODES, EMOTIONS } from '../data/lessons.js';
import { grantActivityXp } from '../engine/quests.js';
import { activityAction } from '../services/actions.js';
import { putMedia, mediaUrl, compressImage, mediaSupported } from '../core/media.js';

let modeFilter = 'all';
const modeOf = (id) => TRADE_MODES.find((m) => m.id === id) || TRADE_MODES[0];

export function tradingTab(ctx) {
  const s = ctx.state;
  const t = s.trading;
  const today = ctx.today;
  const out = h('div');
  if (s.profile.trading.level === 'none')
    out.appendChild(h('div.card.flat', h('p.small.muted', 'You said trading isn’t for you right now — that’s a great choice too. Everything here still works if you change your mind.')));

  const wk = weekKey(today, s.settings.weekStartsOn);
  const week = t.entries.filter((e) => e.day >= wk && e.day <= addDays(wk, 6));
  const trades = week.filter((e) => e.mode !== 'idea');
  const followed = trades.filter((e) => e.followedPlan).length;
  const broken = week.filter((e) => e.ruleBroken).length;
  out.appendChild(
    h(
      'div.card',
      h('div.eyebrow', 'Process this week'),
      h('div.grid-3.mt-12', h('div.stat', h('div.stat-value.num', String(week.length)), h('div.stat-label', 'Journal entries')), h('div.stat', h('div.stat-value.num', trades.length ? `${Math.round((followed / trades.length) * 100)}%` : '—'), h('div.stat-label', 'Plan followed')), h('div.stat', h('div.stat-value.num' + (broken ? '.red' : ''), String(broken)), h('div.stat-label', 'Rule breaks'))),
      h('div.mt-12', btn('New journal entry', () => openEntryEditor(null), { block: true, iconName: 'plus' })),
      h('p.tiny.faint.mt-8', 'Educational tool, not financial advice. XP comes from complete, honest journaling and following your rules — never from profit.')
    )
  );

  out.appendChild(sectionHead('Journal'));
  out.appendChild(chips([{ id: 'all', name: 'All' }, ...TRADE_MODES.map((m) => ({ id: m.id, name: m.name, color: m.color }))], modeFilter, (v) => ((modeFilter = v), ctx.refresh()), { multi: false }));
  const list = [...t.entries].filter((e) => modeFilter === 'all' || e.mode === modeFilter).sort((a, b) => b.ts - a.ts);
  if (!list.length) out.appendChild(h('div.mt-12', empty('chart', 'No journal entries', 'Log a simulated trade, a backtest result or a market idea.')));
  else
    out.appendChild(
      h(
        'div.list.mt-12',
        list.slice(0, 30).map((e) =>
          listItem({
            iconName: e.mode === 'idea' ? 'note' : 'chart',
            iconColor: modeOf(e.mode).color,
            title: `${e.instrument || 'Untitled'}${e.direction && e.direction !== 'none' ? ' · ' + e.direction : ''}`,
            sub: `${relDay(e.day, today)} · ${modeOf(e.mode).name}${e.resultR !== null && e.resultR !== undefined && e.resultR !== '' ? ` · ${e.resultR > 0 ? '+' : ''}${e.resultR}R` : ''}${e.ruleBroken ? ' · rule broken' : e.followedPlan ? ' · plan followed' : ''}`,
            onClick: () => openEntryEditor(e),
          })
        )
      )
    );

  out.appendChild(sectionHead('Pre-trade checklist', btn('Edit', () => openChecklist(), { variant: 'ghost', size: 'sm', iconName: 'edit' })));
  out.appendChild(h('div.card.flat', h('ol.instructions', t.checklist.map((c) => h('li', c)))));

  out.appendChild(sectionHead('Strategies', btn('Add', () => openStrategy(null), { variant: 'ghost', size: 'sm', iconName: 'plus' })));
  if (!t.strategies.length) out.appendChild(h('div.card.flat', h('p.small.muted', 'Write down each strategy’s exact rules before you test it. Backtest stats are calculated from journal entries tagged with the strategy.')));
  else out.appendChild(h('div.list', t.strategies.map((st) => { const stats = strategyStats(t.entries, st.id); return listItem({ iconName: 'layers', title: st.name, sub: stats.n ? `${stats.n} results · win ${Math.round(stats.win * 100)}% · avg ${stats.avgR.toFixed(2)}R · expectancy ${stats.exp.toFixed(2)}R` : 'No results yet', onClick: () => openStrategy(st) }); })));

  out.appendChild(sectionHead('Risk lessons', h('span.small.faint', `${Object.keys(t.lessonsDone).length}/${LESSONS.length}`)));
  out.appendChild(h('div.list', LESSONS.map((l) => listItem({ iconName: t.lessonsDone[l.id] ? 'check' : 'book', iconColor: t.lessonsDone[l.id] ? 'var(--green)' : undefined, title: l.title, sub: `${l.minutes} min read`, onClick: () => openLesson(l) }))));

  out.appendChild(sectionHead('Position size calculator'));
  out.appendChild(calculator(s));
  return out;
}

function strategyStats(entries, sid) {
  const res = entries.filter((e) => e.strategyId === sid && e.mode !== 'idea' && e.resultR !== null && e.resultR !== undefined && e.resultR !== '');
  const n = res.length;
  if (!n) return { n: 0, win: 0, avgR: 0, exp: 0 };
  const rs = res.map((e) => Number(e.resultR));
  const wins = rs.filter((r) => r > 0);
  const losses = rs.filter((r) => r <= 0);
  const win = wins.length / n;
  const avgWin = wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
  const avgLoss = losses.length ? Math.abs(losses.reduce((a, b) => a + b, 0) / losses.length) : 0;
  return { n, win, avgR: rs.reduce((a, b) => a + b, 0) / n, exp: win * avgWin - (1 - win) * avgLoss };
}

function calculator(s) {
  const t = s.trading;
  let acct = t.accountSize;
  let risk = t.maxRiskPct;
  let entry = '';
  let stop = '';
  const outEl = h('div.calc-out', '—');
  const subEl = h('div.small.muted');
  const calc = () => {
    const e = toNum(entry, NaN);
    const st = toNum(stop, NaN);
    const a = toNum(acct, NaN);
    const r = toNum(risk, NaN);
    if (![e, st, a, r].every(Number.isFinite) || e === st || a <= 0) {
      outEl.textContent = '—';
      subEl.textContent = 'Enter account, risk %, entry and stop.';
      return;
    }
    const riskAmt = (a * r) / 100;
    const perUnit = Math.abs(e - st);
    const units = riskAmt / perUnit;
    outEl.textContent = `${units >= 10 ? fmtNum(Math.floor(units)) : units.toFixed(3)} units`;
    subEl.textContent = `Risking ${riskAmt.toFixed(2)} (${r}%) · ${perUnit.toFixed(4)} per unit · position value ≈ ${(units * e).toFixed(2)}`;
  };
  calc();
  return h(
    'div.card.stack-12',
    h('div.grid-2', field('Account size', numInput(acct, (v) => ((acct = v), calc()))), field('Risk %', numInput(risk, (v) => ((risk = v), calc()), { step: '0.25' }))),
    h('div.grid-2', field('Entry price', numInput(entry, (v) => ((entry = v), calc()), { step: 'any' })), field('Stop price', numInput(stop, (v) => ((stop = v), calc()), { step: 'any' }))),
    outEl,
    subEl,
    btn('Save account & risk as defaults', () => {
      store.update((st) => {
        st.trading.accountSize = Math.max(0, toNum(acct, st.trading.accountSize));
        st.trading.maxRiskPct = Math.min(100, Math.max(0.05, toNum(risk, st.trading.maxRiskPct)));
      }, { render: false });
      toast('Saved.');
    }, { variant: 'ghost', size: 'sm' })
  );
}

// ---------- journal entry ----------

export function openEntryEditor(existing) {
  const s0 = store.state;
  const t = s0.trading;
  const d = existing
    ? JSON.parse(JSON.stringify(existing))
    : { mode: 'sim', day: dayKey(clock.now(), s0.settings), instrument: '', strategyId: '', direction: 'long', entry: '', stop: '', target: '', size: '', resultR: '', outcome: 'open', checks: [], emotions: [], setup: '', notes: '', lessons: '', images: [] };
  openSheet({
    title: existing ? 'Journal entry' : 'New journal entry',
    size: 'full',
    render: (close, rerender) => {
      const s = store.state;
      const isTrade = d.mode !== 'idea';
      const riskInfo = h('div.small.muted');
      const computeRisk = () => {
        const e = toNum(d.entry, NaN);
        const st = toNum(d.stop, NaN);
        const sz = toNum(d.size, NaN);
        if ([e, st, sz].every(Number.isFinite) && s.trading.accountSize > 0) {
          const pctv = (Math.abs(e - st) * sz * 100) / s.trading.accountSize;
          d.riskPct = Math.round(pctv * 100) / 100;
          riskInfo.textContent = `Risk ≈ ${d.riskPct}% of your ${fmtNum(s.trading.accountSize)} account${d.riskPct > s.trading.maxRiskPct ? ` — ABOVE your ${s.trading.maxRiskPct}% max` : ''}`;
          riskInfo.className = d.riskPct > s.trading.maxRiskPct ? 'small red' : 'small muted';
        } else {
          d.riskPct = null;
          riskInfo.textContent = 'Fill entry, stop and size to check risk against your max.';
          riskInfo.className = 'small muted';
        }
      };
      computeRisk();
      const imgWrap = h('div.ref-grid');
      const paintImgs = () => {
        clear(imgWrap);
        for (const id of d.images) {
          const img = h('img.ref-img', { alt: 'Chart screenshot' });
          mediaUrl(id).then((u) => u && (img.src = u));
          imgWrap.appendChild(h('div.ref-tile', img));
        }
      };
      paintImgs();
      const fileIn = h('input.hidden', { type: 'file', accept: 'image/*', multiple: true });
      fileIn.addEventListener('change', async () => {
        for (const f of [...fileIn.files].slice(0, 4)) {
          try {
            const id = uid('img');
            await putMedia(id, await compressImage(f), { kind: 'image' });
            d.images.push(id);
          } catch {
            toast('Couldn’t save image.', { type: 'error' });
          }
        }
        fileIn.value = '';
        paintImgs();
      });
      return h(
        'div.stack-16',
        field('Type', segmented(TRADE_MODES.map((m) => ({ id: m.id, name: m.name })), d.mode, (v) => ((d.mode = v), rerender()), { small: true }), modeOf(d.mode).desc),
        h('div.grid-2', field('Date', dateInput(d.day, (v) => v && (d.day = v))), field('Market / instrument', input({ value: d.instrument, placeholder: 'e.g. AAPL, EUR/USD', maxlength: 30, oninput: (e) => (d.instrument = e.target.value) }))),
        field('Strategy', select([{ id: '', name: 'No strategy / discretionary' }, ...s.trading.strategies.map((x) => ({ id: x.id, name: x.name }))], d.strategyId, (v) => (d.strategyId = v))),
        isTrade
          ? h(
              'div.stack-12',
              field('Direction', segmented([{ id: 'long', name: 'Long' }, { id: 'short', name: 'Short' }], d.direction, (v) => (d.direction = v), { small: true })),
              h('div.grid-3', field('Entry', numInput(d.entry, (v) => ((d.entry = v), computeRisk()), { step: 'any' })), field('Stop', numInput(d.stop, (v) => ((d.stop = v), computeRisk()), { step: 'any' })), field('Target', numInput(d.target, (v) => (d.target = v), { step: 'any' }))),
              field('Size (units)', numInput(d.size, (v) => ((d.size = v), computeRisk()), { step: 'any' })),
              riskInfo,
              h('div.grid-2', field('Outcome', select([{ id: 'open', name: 'Still open' }, { id: 'win', name: 'Win' }, { id: 'loss', name: 'Loss' }, { id: 'be', name: 'Breakeven' }], d.outcome, (v) => (d.outcome = v))), field('Result in R', numInput(d.resultR, (v) => (d.resultR = v), { step: '0.1', placeholder: 'e.g. 2 or -1' })))
            )
          : null,
        isTrade
          ? field(
              'Checklist — tick only what’s true',
              h(
                'div.stack-8',
                s.trading.checklist.map((c, i) =>
                  h('label.row.gap-8.small', h('input', { type: 'checkbox', checked: d.checks.includes(i), style: 'width:20px;height:20px', onchange: (e) => (d.checks = e.target.checked ? [...new Set([...d.checks, i])] : d.checks.filter((x) => x !== i)) }), h('span', c))
                )
              )
            )
          : null,
        field('Emotions', chips(EMOTIONS.map((x) => ({ id: x, name: x })), d.emotions, (v) => (d.emotions = v))),
        field(isTrade ? 'Setup — why this trade?' : 'Idea / analysis', textarea({ value: d.setup, rows: 3, maxlength: 1000, oninput: (e) => (d.setup = e.target.value) })),
        field('What happened / review', textarea({ value: d.notes, rows: 3, maxlength: 1500, oninput: (e) => (d.notes = e.target.value) })),
        field('Lesson for next time', input({ value: d.lessons, maxlength: 200, oninput: (e) => (d.lessons = e.target.value) })),
        mediaSupported() ? field('Screenshots', h('div.stack-8', imgWrap, btn('Add screenshot', () => fileIn.click(), { variant: 'ghost', size: 'sm', iconName: 'image' }), fileIn)) : null,
        h(
          'div.sheet-actions',
          btn('Save entry', () => {
            const res = saveEntry(existing, d);
            if (!res.ok) return toast(res.reason, { type: 'error' });
            close();
          }, { block: true, size: 'lg' }),
          existing
            ? btn('Delete entry', async () => {
                if (!(await confirmDialog({ title: 'Delete this entry?', okText: 'Delete', danger: true }))) return;
                store.update((st) => (st.trading.entries = st.trading.entries.filter((x) => x.id !== existing.id)));
                close();
              }, { variant: 'ghost', block: true, iconName: 'trash' })
            : null
        )
      );
    },
  });
}

function saveEntry(existing, d) {
  const s = store.state;
  const isTrade = d.mode !== 'idea';
  const instrument = cleanText(d.instrument, 30);
  const setup = cleanText(d.setup, 1000);
  if (!instrument && isTrade) return { ok: false, reason: 'Add the market/instrument.' };
  if (!setup) return { ok: false, reason: isTrade ? 'Explain the setup — that’s the point of journaling.' : 'Write your idea or analysis.' };
  const checksAll = s.trading.checklist.length ? d.checks.length === s.trading.checklist.length : true;
  const riskBroken = d.mode === 'real' && d.riskPct !== null && d.riskPct !== undefined && d.riskPct > s.trading.maxRiskPct;
  const complete = isTrade ? Number.isFinite(toNum(d.entry, NaN)) && Number.isFinite(toNum(d.stop, NaN)) && setup.length >= 15 : setup.length >= 30;
  const entry = {
    mode: d.mode,
    day: d.day,
    instrument,
    strategyId: d.strategyId || null,
    direction: isTrade ? d.direction : 'none',
    entry: d.entry === '' ? null : toNum(d.entry, null),
    stop: d.stop === '' ? null : toNum(d.stop, null),
    target: d.target === '' ? null : toNum(d.target, null),
    size: d.size === '' ? null : toNum(d.size, null),
    riskPct: d.riskPct ?? null,
    outcome: isTrade ? d.outcome : null,
    resultR: d.resultR === '' || d.resultR === null ? null : toNum(d.resultR, null, -100, 100),
    checks: d.checks,
    followedPlan: isTrade && checksAll && !riskBroken,
    ruleBroken: riskBroken,
    emotions: d.emotions,
    setup,
    notes: cleanText(d.notes, 1500),
    lessons: cleanText(d.lessons, 200),
    images: d.images,
    complete,
  };
  if (existing) {
    store.update((st) => Object.assign(st.trading.entries.find((x) => x.id === existing.id), entry));
    toast('Entry updated.');
    return { ok: true };
  }
  const id = uid('je');
  store.update((st) => st.trading.entries.push({ id, ts: clock.now(), ...entry }), { render: false });
  if (riskBroken) {
    toast(`Saved. Risk was above your ${s.trading.maxRiskPct}% max, so no XP — reckless risk is never rewarded.`, { type: 'error', duration: 6000 });
    store.notify();
  } else if (!complete) {
    toast('Saved. Add entry, stop and a fuller setup description for it to count as a quality entry (XP + quests).', { duration: 5000 });
    store.notify();
  } else activityAction('journal', { mode: d.mode, ref: id }, 'journal', 'trading');
  return { ok: true };
}

// ---------- other sheets ----------

function openChecklist() {
  openSheet({
    title: 'Pre-trade checklist',
    render: (close) => {
      let text = store.state.trading.checklist.join('\n');
      return h(
        'div.stack-12',
        h('p.small.muted', 'One rule per line. A journal entry counts as “plan followed” only when every line is ticked.'),
        textarea({ value: text, rows: 8, oninput: (e) => (text = e.target.value) }),
        btn('Save', () => {
          const list = text.split('\n').map((x) => cleanText(x, 140)).filter(Boolean).slice(0, 15);
          store.update((st) => (st.trading.checklist = list));
          close();
        }, { block: true })
      );
    },
  });
}

function openStrategy(existing) {
  const d = existing ? { ...existing } : { name: '', market: '', timeframe: '', rules: '' };
  openSheet({
    title: existing ? 'Strategy' : 'New strategy',
    render: (close) => {
      const stats = existing ? strategyStats(store.state.trading.entries, existing.id) : null;
      return h(
        'div.stack-16',
        stats && stats.n ? h('div.grid-3', h('div.stat', h('div.stat-value.num', String(stats.n)), h('div.stat-label', 'Results')), h('div.stat', h('div.stat-value.num', `${Math.round(stats.win * 100)}%`), h('div.stat-label', 'Win rate')), h('div.stat', h('div.stat-value.num', `${stats.exp.toFixed(2)}R`), h('div.stat-label', 'Expectancy'))) : null,
        stats && stats.n && stats.n < 30 ? h('div.info-row', icon('info', 16), h('span', `Only ${stats.n} results — too few to trust. Aim for 30–100+.`)) : null,
        field('Name', input({ value: d.name, maxlength: 50, placeholder: 'e.g. Opening range breakout', oninput: (e) => (d.name = e.target.value) })),
        h('div.grid-2', field('Market', input({ value: d.market, maxlength: 30, oninput: (e) => (d.market = e.target.value) })), field('Timeframe', input({ value: d.timeframe, maxlength: 20, placeholder: 'e.g. 5m', oninput: (e) => (d.timeframe = e.target.value) }))),
        field('Exact rules', textarea({ value: d.rules, rows: 6, maxlength: 2000, placeholder: 'Entry: …\nStop: …\nTarget: …\nNo-trade conditions: …', oninput: (e) => (d.rules = e.target.value) })),
        btn('Save', () => {
          const name = cleanText(d.name, 50);
          if (!name) return toast('Name it.', { type: 'error' });
          const data = { name, market: cleanText(d.market, 30), timeframe: cleanText(d.timeframe, 20), rules: cleanText(d.rules, 2000) };
          store.update((st) => (existing ? Object.assign(st.trading.strategies.find((x) => x.id === existing.id), data) : st.trading.strategies.push({ id: uid('stg'), ...data })));
          close();
        }, { block: true }),
        existing
          ? btn('Delete', async () => {
              if (!(await confirmDialog({ title: 'Delete strategy?', message: 'Journal entries keep their data.', okText: 'Delete', danger: true }))) return;
              store.update((st) => (st.trading.strategies = st.trading.strategies.filter((x) => x.id !== existing.id)));
              close();
            }, { variant: 'ghost', block: true })
          : null
      );
    },
  });
}

function openLesson(l) {
  openSheet({
    title: l.title,
    render: (close) => {
      const done = store.state.trading.lessonsDone[l.id];
      return h(
        'div.stack-16',
        h('div.lesson-body', l.body.map((p) => h('p', p))),
        h('div.card.flat', h('div.eyebrow', 'Key points'), h('ul.instructions', l.points.map((p) => h('li', p)))),
        h('p.tiny.faint', 'Educational content, not financial advice.'),
        done
          ? h('div.info-row.ok', icon('check', 16), h('span', `Studied on ${fmtDay(dayKey(done, store.state.settings))}`))
          : btn('Mark as studied', () => {
              const now = clock.now();
              const xp = store.update((st) => {
                st.trading.lessonsDone[l.id] = now;
                return grantActivityXp(st, 'lesson', 'trading', now, l.id);
              });
              if (xp) rewardPop({ xp, note: 'Lesson' });
              close();
            }, { block: true, iconName: 'check' })
      );
    },
  });
}

