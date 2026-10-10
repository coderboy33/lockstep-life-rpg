// Quests: today / week / goals / all / history, plus the quest editor and detail sheets.

import { store } from '../core/store.js';
import { clock, dayKey, addDays, fmtDay, fmtDayFull, fmtTime, WD_SHORT, weekKey, weekDays, diffDays, isKey, relDay, fmtTs } from '../core/dates.js';
import { CATEGORIES, catOf, DIFFICULTIES, rankedConfig } from '../core/config.js';
import { fmtNum, fmtDuration, pct, signed, toNum } from '../core/util.js';
import { h, icon, btn, iconBtn, pill, catPill, diffPill, progressBar, field, input, textarea, select, segmented, chips, dayPicker, timeInput, dateInput, stepper, empty, sectionHead, listItem, clear, badge, numInput } from '../ui/dom.js';
import { openSheet, toast, confirmDialog } from '../ui/overlay.js';
import { topbar, questRow, emptyHint } from '../ui/common.js';
import { heatmap } from '../ui/charts.js';
import { todayView, createQuest, updateQuest, setPaused, deleteQuest, previewAward, questState, goalPct, QUEST_TYPES, VERIFICATIONS, LINK_KINDS, canComplete } from '../engine/quests.js';
import { isScheduledOn, isDueOn, dayMode, computeDay, computeWeek, categoryStreak, effWeight, streakAsOf } from '../engine/schedule.js';
import { declareDay, recoveryDaysUsed, matchProjection } from '../engine/ranked.js';
import { openSuggestions, addSuggestion } from '../engine/suggest.js';
import { completeQuestAction, undoAction, goalProgressAction, startFocus } from '../services/actions.js';
import { refPreview } from './references.js';

let tab = 'today';

export function render(ctx) {
  if (ctx.query.tab) tab = ctx.query.tab;
  const s = ctx.state;
  const tabs = [
    { id: 'today', name: 'Today' },
    { id: 'week', name: 'Week' },
    { id: 'goals', name: 'Goals' },
    { id: 'all', name: 'All' },
    { id: 'history', name: 'History' },
  ];
  const body = h('div.mt-16');
  const paint = () => {
    clear(body);
    if (tab === 'today') body.appendChild(todayTab(s, ctx));
    else if (tab === 'week') body.appendChild(weekTab(s, ctx));
    else if (tab === 'goals') body.appendChild(goalsTab(s, ctx));
    else if (tab === 'all') body.appendChild(allTab(s, ctx));
    else body.appendChild(historyTab(s, ctx));
  };
  paint();
  return h(
    'div.screen',
    topbar('Quests', { actions: [iconBtn('plus', () => openQuestEditor(null, tab === 'goals' ? { type: 'goal' } : {}), { label: 'New quest', cls: 'accent-btn' })] }),
    segmented(tabs, tab, (v) => {
      tab = v;
      history.replaceState(null, '', `#/quests?tab=${v}`);
      paint();
    }),
    body
  );
}

// ---------- shared handlers ----------

export function onQuestCheck(item) {
  const q = item.q;
  const today = dayKey(clock.now(), store.state.settings);
  const st = questState(store.state, q, today);
  const doneToday = q.type === 'weekly' ? st.todayDone : st.done;
  if (doneToday) return openQuestDetail(q.id);
  if (q.linked && q.linked.kind === 'alarm') return (location.hash = `#/challenge/${q.linked.id}`);
  if ((q.linked && ['focus', 'workout', 'care', 'sleep', 'review', 'journal', 'project'].includes(q.linked.kind)) || q.verification !== 'none') return openQuestDetail(q.id);
  completeQuestAction(q.id);
}

export function questRowFor(s, item, today) {
  return questRow(s, item, today, { onCheck: onQuestCheck, onOpen: (it) => openQuestDetail(it.q.id) });
}

function dayOptionsButton(s, today) {
  return btn('Day options', () => openDayOptions(today), { variant: 'ghost', size: 'sm', iconName: 'calendar' });
}

// ---------- Today ----------

function todayTab(s, ctx) {
  const v = todayView(s, ctx.now);
  const today = v.today;
  const out = h('div');
  const due = v.daily.filter((x) => x.due);
  const fresh = v.daily.filter((x) => !x.due && x.isNew);
  const optional = v.mode !== 'normal' ? v.daily.filter((x) => !x.due && !x.isNew) : [];
  const doneCount = due.filter((x) => x.done).length;
  const proj = matchProjection(s, today);

  if (v.mode !== 'normal')
    out.appendChild(
      h('div.card.flat.row.gap-12', icon('bed', 22), h('div.grow', h('div.bold', v.mode === 'rest' ? 'Rest day' : 'Excused day'), h('div.small.muted', 'Nothing is due today. Your streak is frozen, not broken. Completing quests still earns XP.')), dayOptionsButton(s, today))
    );

  out.appendChild(
    h(
      'div.card',
      h('div.row.between', h('div', h('div.eyebrow', 'Today'), h('div.big-count.num', `${doneCount}/${due.length}`)), h('div.right', proj && proj.mode === 'normal' && proj.kind !== 'empty' ? h('div.small', 'Match ', h('span.num.bold' + (proj.delta >= 0 ? '.green' : '.red'), `${signed(proj.delta)} SR`)) : !s.ranked.placed ? h('div.small.muted', 'Placement') : null, v.mode === 'normal' ? dayOptionsButton(s, today) : null)),
      h('div.mt-12', progressBar(due.length ? (v.stats.rate || 0) : 0, { thick: true, glow: true, color: 'var(--green)' })),
      h('div.tiny.faint.mt-8', due.length ? `Weighted by difficulty. ${Math.round((v.stats.rate || 0) * 100)}% complete${proj ? ` · your rank’s standard is ${Math.round(proj.std * 100)}%` : ''}.` : 'No ranked quests due today.')
    )
  );

  const open = due.filter((x) => !x.done);
  const done = due.filter((x) => x.done);
  out.appendChild(sectionHead('Due today', h('span.small.faint', `${open.length} left`)));
  if (!due.length) out.appendChild(emptyHint(v.mode !== 'normal' ? 'Nothing is due today. Rest up — or do something optional for XP.' : fresh.length ? 'Your quests start counting tomorrow. Complete them today for XP.' : 'Nothing scheduled. Add a quest with the + button.'));
  out.appendChild(h('div.qlist', open.map((x) => questRowFor(s, x, today))));
  if (done.length) out.appendChild(h('details.done-group', h('summary', `Completed (${done.length})`), h('div.qlist', done.map((x) => questRowFor(s, x, today)))));

  if (optional.length) {
    out.appendChild(sectionHead('Optional today — XP only'));
    out.appendChild(h('div.qlist', optional.map((x) => questRowFor(s, x, today))));
  }
  if (fresh.length) {
    out.appendChild(sectionHead('New — ranked from tomorrow'));
    out.appendChild(h('div.qlist', fresh.map((x) => questRowFor(s, x, today))));
  }
  const weekly = v.weekly.filter((x) => !x.done);
  if (v.weekly.length) {
    out.appendChild(sectionHead('This week', h('a.small', { href: '#/quests?tab=week' }, 'Week view')));
    out.appendChild(h('div.qlist', v.weekly.map((x) => questRowFor(s, x, today))));
    if (!weekly.length) out.appendChild(emptyHint('All weekly targets reached. 🎉'));
  }
  if (v.once.length) {
    out.appendChild(sectionHead('One-time challenges'));
    out.appendChild(h('div.qlist', v.once.map((x) => questRowFor(s, x, today))));
  }
  const offSchedule = s.quests.filter((q) => q.type === 'daily' && !q.archived && !q.paused && !isScheduledOn(q, today));
  if (offSchedule.length)
    out.appendChild(
      h('details.done-group.mt-16', h('summary', `Not scheduled today (${offSchedule.length})`), h('p.tiny.faint', 'Doing these today earns XP only.'), h('div.qlist', offSchedule.map((q) => questRowFor(s, { q, ...questState(s, q, today), due: false }, today))))
    );
  return out;
}

// ---------- Week ----------

function weekTab(s, ctx) {
  const today = ctx.today;
  const wk = weekKey(today, s.settings.weekStartsOn);
  const w = computeWeek(s, wk, today);
  const out = h('div');
  out.appendChild(
    h(
      'div.card',
      h('div.eyebrow', `Week of ${fmtDay(wk)}`),
      h('div.row.between.mt-8', h('div.big-count.num', w.score === null ? '—' : pct(w.score)), h('div.small.muted.right', `${w.doneCount}/${w.dueCount} ranked quests`)),
      h('div.mt-12', progressBar(w.score || 0, { thick: true, glow: true })),
      h(
        'div.week-days.mt-16',
        weekDays(wk).map((k) => {
          const rec = s.days[k];
          const live = k <= today && k > (s.setupDay || '') ? (rec && rec.settled ? rec : computeDay(s, k)) : null;
          const r = live && live.rate !== null && live.rate !== undefined ? live.rate : null;
          return h(
            'button.wk-day',
            { type: 'button', onclick: () => k <= today && openDaySheet(k) },
            h('div.wk-bar', h('div.wk-fill', { style: { height: `${(r || 0) * 100}%`, background: r === null ? 'transparent' : r >= 0.5 ? 'var(--green)' : 'var(--orange)' } })),
            h('div.tiny.faint', WD_SHORT[new Date(k + 'T12:00:00Z').getUTCDay()]),
            h('div.tiny.num', r === null ? (rec && rec.status && rec.status !== 'normal' ? rec.status.slice(0, 4) : '—') : `${Math.round(r * 100)}%`)
          );
        })
      )
    )
  );
  const v = todayView(s, ctx.now);
  out.appendChild(sectionHead('Weekly targets', btn('New', () => openQuestEditor(null, { type: 'weekly' }), { variant: 'ghost', size: 'sm', iconName: 'plus' })));
  if (!v.weekly.length) out.appendChild(empty('target', 'No weekly targets', 'Weekly quests are things like “Backtest twice this week” or “3 long runs”.'));
  else out.appendChild(h('div.qlist', v.weekly.map((x) => questRowFor(s, x, today))));
  return out;
}

// ---------- Goals ----------

function goalsTab(s) {
  const goals = s.quests.filter((q) => q.type === 'goal' && !q.archived);
  const out = h('div');
  out.appendChild(sectionHead('Goals', btn('New goal', () => openQuestEditor(null, { type: 'goal' }), { variant: 'ghost', size: 'sm', iconName: 'plus' }), { cls: 'first' }));
  if (!goals.length) {
    out.appendChild(empty('flag', 'No long-term goals yet', 'Track measurable goals like “Save $1,000”, “Read 12 books” or “Bench 60 kg”. Completing one is worth big XP and SR.', btn('Create a goal', () => openQuestEditor(null, { type: 'goal' }), { size: 'sm' })));
    return out;
  }
  for (const q of goals) {
    const p = goalPct(q);
    const doneC = s.completions.find((c) => c.qid === q.id);
    const color = doneC || p >= 1 ? '#22e07a' : '#3d7bff';
    out.appendChild(
      h(
        'div.card.goal-card.tappable',
        { onclick: () => openGoalSheet(q.id) },
        h('div.row.between.gap-12', h('div.grow', h('div.goal-title', q.title), h('div.small.muted', q.dueDate ? fmtDayFull(q.dueDate) : `${fmtNum(q.goal.current)} / ${fmtNum(q.goal.target)} ${q.goal.unit}`)), pill(`${Math.round(p * 100)}% Complete`, { color, glow: true })),
        h('div.mt-16', progressBar(p, { color, glow: true }))
      )
    );
  }
  return out;
}

function openGoalSheet(qid) {
  openSheet({
    title: 'Goal',
    render: (close, rerender) => {
      const s = store.state;
      const q = s.quests.find((x) => x.id === qid);
      if (!q) return h('p.muted', 'Goal not found.');
      const done = s.completions.find((c) => c.qid === q.id);
      let val = q.goal.current;
      const valIn = numInput(val, (v) => (val = v), { step: 'any' });
      const p = goalPct(q);
      return h(
        'div.stack-16',
        h('div', h('div.goal-title', q.title), q.description ? h('p.muted.small.mt-8', q.description) : null),
        h('div.row.between', h('div.big-count.num', `${fmtNum(q.goal.current)} / ${fmtNum(q.goal.target)}`), h('span.muted', q.goal.unit)),
        progressBar(p, { thick: true, glow: true, color: done ? '#22e07a' : undefined }),
        q.dueDate ? h('div.small.muted', `Deadline: ${fmtDayFull(q.dueDate)} (${relDay(q.dueDate, dayKey(clock.now(), s.settings))})`) : null,
        done
          ? h('div.card.success', h('div.bold', 'Completed! 🎉'), h('div.small.muted', `+${done.xp} XP${done.sr ? ` · +${done.sr} SR` : ''} on ${fmtDay(done.day)}`))
          : h(
              'div.stack-8',
              field('Update current value', valIn),
              h('div.row.gap-8', ...[1, 5, 10].map((n) => btn(`+${n}`, () => (valIn.value = toNum(valIn.value, 0) + n), { variant: 'ghost', size: 'sm' }))),
              btn('Save progress', () => {
                goalProgressAction(q.id, toNum(valIn.value, q.goal.current, 0));
                rerender();
              }, { block: true })
            ),
        (q.goal.history || []).length
          ? h('details', h('summary.small.muted', 'Progress history'), h('div.stack-4.mt-8', [...q.goal.history].reverse().slice(0, 20).map((x) => h('div.row.between.small', h('span.faint', fmtDay(dayKey(x.ts, s.settings))), h('span.num', fmtNum(x.value))))))
          : null,
        h('div.grid-2', btn('Edit', () => (close(), openQuestEditor(q)), { variant: 'ghost', iconName: 'edit' }), btn('Delete', () => removeQuest(q, close), { variant: 'ghost', iconName: 'trash' }))
      );
    },
  });
}

// ---------- All ----------

function allTab(s, ctx) {
  const out = h('div');
  const live = s.quests.filter((q) => !q.archived && q.type !== 'goal');
  out.appendChild(h('div.row.gap-8', btn('New quest', () => openQuestEditor(null), { iconName: 'plus', block: true })));
  const sug = openSuggestions(s);
  if (sug.length) {
    out.appendChild(sectionHead('Suggested for you', h('span.small.faint', 'From your profile')));
    out.appendChild(
      h(
        'div.list',
        sug.slice(0, 8).map((sg) =>
          listItem({
            iconName: catOf(sg.cat).icon,
            iconColor: catOf(sg.cat).color,
            title: sg.title,
            sub: sg.quest.description || `${sg.quest.durationMin} min`,
            right: btn('Add', () => {
              const r = store.update((st) => addSuggestion(st, sg, clock.now()));
              if (r.ok) toast(`Added “${sg.title}”. It joins ranked matches tomorrow.`, { type: 'success' });
            }, { variant: 'ghost', size: 'sm' }),
          })
        )
      )
    );
  }
  for (const c of CATEGORIES) {
    const list = live.filter((q) => q.category === c.id);
    if (!list.length) continue;
    out.appendChild(sectionHead(c.name, h('span.small.faint', String(list.length))));
    out.appendChild(
      h(
        'div.list',
        list.map((q) =>
          listItem({
            iconName: c.icon,
            iconColor: c.color,
            title: q.title,
            sub: scheduleText(s, q),
            right: q.paused ? badge('PAUSED', 'var(--orange)') : null,
            onClick: () => openQuestDetail(q.id),
          })
        )
      )
    );
  }
  if (!live.length) out.appendChild(empty('target', 'No quests yet', 'Create your own or add suggestions from your profile.'));
  const archived = s.quests.filter((q) => q.archived);
  if (archived.length) out.appendChild(h('p.tiny.faint.mt-16.center-text', `${archived.length} deleted quest${archived.length > 1 ? 's are' : ' is'} kept in history only.`));
  return out;
}

export function scheduleText(s, q) {
  const parts = [];
  if (q.type === 'weekly') parts.push(`${q.target}× per week`);
  else if (q.type === 'once') parts.push(q.dueDate ? `By ${fmtDay(q.dueDate)}` : 'One-time');
  else if (q.type === 'goal') parts.push('Long-term goal');
  else parts.push(q.days.length === 7 ? 'Every day' : q.days.map((d) => WD_SHORT[d]).join(' '));
  if (q.time) parts.push(fmtTime(q.time, s.settings.clock24));
  parts.push(fmtDuration(q.durationMin));
  return parts.join(' · ');
}

// ---------- History ----------

function historyTab(s, ctx) {
  const out = h('div');
  const today = ctx.today;
  // Habit graphs for the most-used daily quests.
  const daily = s.quests.filter((q) => q.type === 'daily' && !q.archived);
  const counts = new Map();
  for (const c of s.completions) counts.set(c.qid, (counts.get(c.qid) || 0) + 1);
  const top = [...daily].sort((a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0)).slice(0, 6);
  if (top.length) {
    out.appendChild(sectionHead('Habit graphs', null, { cls: 'first' }));
    for (const q of top) out.appendChild(habitGraph(s, q, today));
  }
  out.appendChild(sectionHead('Recent days'));
  const days = [];
  for (let i = 0; i < 30; i++) {
    const k = addDays(today, -i);
    if (s.setupDay && k < s.setupDay) break;
    days.push(k);
  }
  if (!days.length) out.appendChild(emptyHint('History starts after setup.'));
  out.appendChild(
    h(
      'div.list',
      days.map((k) => {
        const rec = s.days[k];
        const comps = s.completions.filter((c) => c.day === k);
        const live = rec && rec.settled ? rec : computeDay(s, k);
        const status = rec && rec.settled ? rec.status : k === today ? 'today' : dayMode(s, k);
        const right = h(
          'div.right',
          live.rate !== null && live.rate !== undefined ? h('div.num.bold', pct(live.rate)) : h('div.small.faint', status),
          rec && rec.settled && rec.srApplied ? h('div.tiny.num' + (rec.srApplied > 0 ? '.green' : '.red'), `${signed(rec.srApplied)} SR`) : null
        );
        return listItem({ title: k === today ? 'Today' : fmtDay(k, { weekday: true }), sub: `${comps.length} completed${status !== 'normal' && status !== 'today' ? ' · ' + status : ''}`, right, onClick: () => openDaySheet(k) });
      })
    )
  );
  return out;
}

export function habitGraph(s, q, today) {
  const cat = catOf(q.category);
  const doneDays = new Set(s.completions.filter((c) => c.qid === q.id).map((c) => c.day));
  const weeks = 18;
  let due = 0;
  let done = 0;
  const cell = (k) => {
    if (k < (q.createdDay || '') || (s.setupDay && k < s.setupDay)) return null;
    const sched = isScheduledOn(q, k);
    if (doneDays.has(k)) {
      if (sched) {
        due++;
        done++;
      }
      return 1;
    }
    if (!sched) return null;
    if (k < today) due++;
    return 0;
  };
  const grid = heatmap(today, weeks, cell, cat.color);
  const streak = categoryStreakForQuest(s, q, today);
  return h(
    'div.card.habit-card.tappable',
    { onclick: () => openQuestDetail(q.id) },
    h('div.row.between', h('div.habit-title', { style: { color: cat.color } }, q.title), h('span.flame-badge', icon('flame', 14, 'flame'), h('span.num', String(streak)))),
    h('div.mt-12', grid),
    h('div.row.between.mt-8', h('div.small', h('span.bold.num', due ? pct(done / due) : '—'), h('span.faint', ` (${done}/${due})`)), h('div.legend-mini', h('span.faint.tiny', 'Less'), h('span.lm-cell', { style: { background: cat.color, opacity: 0.25 } }), h('span.lm-cell', { style: { background: cat.color } }), h('span.faint.tiny', 'More')))
  );
}

function categoryStreakForQuest(s, q, today) {
  let n = 0;
  for (let k = today, i = 0; i < 400; k = addDays(k, -1), i++) {
    if (k < (q.createdDay || today)) break;
    if (!isScheduledOn(q, k)) continue;
    const done = s.completions.some((c) => c.qid === q.id && c.day === k);
    if (done) n++;
    else if (k === today) continue;
    else {
      const rec = s.days[k];
      if (rec && (rec.status === 'rest' || rec.status === 'excused')) continue;
      break;
    }
  }
  return n;
}

// ---------- Day sheet ----------

export function openDaySheet(k) {
  openSheet({
    title: fmtDayFull(k),
    render: (close, rerender) => {
      const s = store.state;
      const today = dayKey(clock.now(), s.settings);
      const rec = s.days[k];
      const settled = rec && rec.settled;
      const live = settled ? rec : computeDay(s, k);
      const comps = s.completions.filter((c) => c.day === k);
      const cfg = rankedConfig(s);
      const canBackfill = k < today && diffDays(k, today) <= cfg.backfillDays;
      const dueList = (live.due || []).map((d) => {
        const q = s.quests.find((x) => x.id === d.qid);
        const c = comps.find((x) => x.qid === d.qid);
        return h(
          'div.row.gap-8.day-q',
          icon(c ? 'check' : 'x', 16, c ? 'green' : 'red'),
          h('span.grow', d.title),
          !c && canBackfill && q && !q.archived && !q.paused
            ? btn('Log it', () => {
                completeQuestAction(q.id, { day: k });
                rerender();
              }, { variant: 'ghost', size: 'sm' })
            : null
        );
      });
      return h(
        'div.stack-16',
        h(
          'div.grid-3',
          h('div.stat', h('div.stat-value.num', live.rate === null || live.rate === undefined ? '—' : pct(live.rate)), h('div.stat-label', 'Completion')),
          h('div.stat', h('div.stat-value.num', String(comps.length)), h('div.stat-label', 'Completed')),
          h('div.stat', h('div.stat-value.num' + (settled && rec.srApplied > 0 ? '.green' : settled && rec.srApplied < 0 ? '.red' : ''), settled ? signed(rec.srApplied || 0) : k === today ? 'Live' : '—'), h('div.stat-label', 'Match SR'))
        ),
        settled ? h('div.small.muted', statusText(rec)) : null,
        dueList.length ? h('div', h('div.eyebrow', 'Ranked quests'), h('div.stack-8.mt-8', dueList)) : h('p.small.muted', 'No ranked quests were due.'),
        canBackfill && dueList.length ? h('p.tiny.faint', `Forgot to log something you really did? You can log it up to ${cfg.backfillDays} days back at ${Math.round(cfg.credit.backfill * 100)}% match credit.`) : null,
        comps.length
          ? h(
              'div',
              h('div.eyebrow', 'Completions'),
              h(
                'div.stack-8.mt-8',
                comps.map((c) =>
                  h('div.row.gap-8.small', h('span.grow', c.title), c.verified ? badge('VERIFIED', 'var(--green)') : null, c.timed ? badge('TIMED', 'var(--accent)') : null, c.backfill ? badge('LATE LOG', 'var(--orange)') : null, h('span.num.faint', `+${c.xp} XP`))
                )
              )
            )
          : null,
        k >= addDays(today, -cfg.excuseWindowDays) && k > (s.setupDay || '') ? btn('Rest / sick / emergency…', () => (close(), openDayOptions(k)), { variant: 'ghost', iconName: 'bed', block: true }) : null
      );
    },
  });
}

function statusText(rec) {
  const m = {
    normal: rec.srKind === 'perfect' ? 'Perfect day — bonus SR.' : rec.srKind === 'win' ? 'Match won: you beat your rank’s standard.' : rec.srKind === 'loss' ? `Below your rank’s standard (${Math.round((rec.std || 0) * 100)}%).` : 'Standard met.',
    rest: 'Rest day — nothing due, streak frozen.',
    excused: 'Excused day — no penalty, streak frozen.',
    empty: 'No ranked quests were scheduled.',
    setup: 'Setup day — not ranked.',
    away: 'Away — no penalty after several inactive days, but your streak reset.',
  };
  let t = m[rec.status] || '';
  if (rec.inactive && rec.status === 'normal') t += ' The app wasn’t opened, so the penalty was halved. You can excuse this day if it was illness or an emergency.';
  return t;
}

export function openDayOptions(k) {
  openSheet({
    title: 'Rest, sick or emergency',
    size: 'sm',
    render: (close) => {
      const s = store.state;
      const cfg = rankedConfig(s);
      const used = recoveryDaysUsed(s, k);
      const cur = s.days[k] && s.days[k].mode;
      const today = dayKey(clock.now(), s.settings);
      const set = (mode, reason) => {
        const r = store.update((st) => declareDay(st, k, mode, clock.now(), reason));
        if (!r.ok) return toast(r.reason, { type: 'error' });
        toast(mode === 'normal' ? 'Back to a normal day.' : `Marked as ${mode === 'rest' ? 'a rest day' : 'excused'}.`, { type: 'success' });
        close();
      };
      return h(
        'div.stack-12',
        h('p.small.muted', `${fmtDayFull(k)}. Rest and excused days have no quests due, no rating loss, and freeze your streak. You have ${Math.max(0, cfg.excuseAllowance30 - used)} of ${cfg.excuseAllowance30} recovery days left in this 30-day window (weekly rest days in Settings don’t count).`),
        cur ? h('div.card.flat.small', `Currently: ${cur}`) : null,
        btn('Planned rest day', () => set('rest', 'rest'), { variant: 'ghost', block: true, iconName: 'bed' }),
        btn('Sick', () => set('excused', 'sick'), { variant: 'ghost', block: true, iconName: 'heart' }),
        btn('Emergency / family', () => set('excused', 'emergency'), { variant: 'ghost', block: true, iconName: 'alert' }),
        btn('App or technical problem', () => set('excused', 'technical'), { variant: 'ghost', block: true, iconName: 'info' }),
        cur && k >= today ? btn('Make it a normal day again', () => set('normal'), { variant: 'ghost', block: true }) : null
      );
    },
  });
}

// ---------- Detail ----------

export function openQuestDetail(qid) {
  openSheet({
    title: '',
    render: (close, rerender) => {
      const s = store.state;
      const q = s.quests.find((x) => x.id === qid);
      if (!q) return h('p.muted', 'Quest not found.');
      const now = clock.now();
      const today = dayKey(now, s.settings);
      const st = questState(s, q, today);
      const doneToday = q.type === 'weekly' ? st.todayDone : st.done;
      const prev = previewAward(s, q, now);
      const cfg = rankedConfig(s);
      const yesterday = addDays(today, -1);
      const yChk = q.type === 'daily' ? canComplete(s, q, yesterday, today) : { ok: false };
      const actions = [];
      const L = q.linked || {};
      if (!doneToday && !q.archived && !q.paused) {
        if (L.kind === 'alarm') actions.push(btn('Start challenge', () => (close(), (location.hash = `#/challenge/${L.id}`)), { block: true, size: 'lg', iconName: 'play' }));
        if (L.kind === 'focus') {
          const mins = L.minutes || q.durationMin;
          actions.push(
            btn(`Start ${mins}-min focus`, () => {
              close();
              startFocus({ subjectId: L.id || null, questId: q.id, workMin: Math.min(mins, 50), breakMin: mins > 50 ? 10 : 5, cycles: Math.max(1, Math.round(mins / 50)), label: q.title });
              location.hash = '#/focus';
            }, { block: true, size: 'lg', iconName: 'timer' })
          );
        }
        if (L.kind === 'workout') actions.push(btn('Start workout', () => (close(), (location.hash = `#/workout/${L.id}`)), { block: true, size: 'lg', iconName: 'dumbbell' }));
        if (L.kind === 'care') actions.push(btn('Start routine', () => (close(), (location.hash = `#/routine/${L.id}`)), { block: true, size: 'lg', iconName: 'sparkle' }));
        if (L.kind === 'journal') actions.push(btn('Open trading journal', () => (close(), (location.hash = '#/grind?tab=trading')), { block: true, size: 'lg', iconName: 'chart' }));
        if (L.kind === 'project') actions.push(btn('Open project', () => (close(), (location.hash = `#/project/${L.id}`)), { block: true, size: 'lg', iconName: 'briefcase' }));
        if (L.kind === 'sleep') actions.push(btn('Log sleep', async () => (close(), (await import('./home.js')).openSleepLog()), { block: true, size: 'lg', iconName: 'moon' }));
        if (L.kind === 'review') actions.push(btn('Open weekly review', () => (close(), (location.hash = '#/review')), { block: true, size: 'lg', iconName: 'clipboard' }));
        if (prev.allowed && L.kind !== 'review' && L.kind !== 'sleep') {
          const note = q.verification === 'video' ? `Without video: ${Math.round(cfg.credit.videoMissing * 100)}% match credit, half XP` : q.verification === 'timer' ? `Without the timer: ${Math.round(cfg.credit.timerMissing * 100)}% match credit` : null;
          actions.push(
            btn(actions.length ? 'Mark complete (self-report)' : 'Complete quest', () => {
              const r = completeQuestAction(q.id);
              if (r.ok) close();
            }, { block: true, variant: actions.length ? 'ghost' : 'primary', size: actions.length ? '' : 'lg', iconName: 'check' })
          );
          if (note && actions.length > 1) actions.push(h('div.tiny.faint.center-text', note));
        }
      }
      if (doneToday && st.completion) {
        actions.push(h('div.card.success', h('div.row.gap-8', icon('check', 18), h('div.bold', q.type === 'weekly' ? 'Logged for today' : 'Completed')), h('div.small.muted.mt-4', `+${st.completion.xp} XP${st.completion.sr ? ` · +${st.completion.sr} SR` : ''}${st.completion.match ? ` · match +${st.completion.match} SR (projected)` : ''} · ${fmtTs(st.completion.ts, s.settings, s.settings.clock24)}`)));
        actions.push(btn('Undo completion', () => (undoAction(st.completion.id), rerender()), { variant: 'ghost', block: true, iconName: 'refresh' }));
      }
      if (yChk.ok && !q.archived && !q.paused && isDueOn(q, yesterday))
        actions.push(btn('Did it yesterday? Log it', () => (completeQuestAction(q.id, { day: yesterday }), rerender()), { variant: 'ghost', block: true, iconName: 'history' }));

      const cat = catOf(q.category);
      const comps = s.completions.filter((c) => c.qid === q.id).slice(-6).reverse();
      return h(
        'div.stack-16',
        h('div.row.wrap.gap-6', catPill(q.category, false), diffPill(q.difficulty), pill(QUEST_TYPES.find((t) => t.id === q.type).name), q.paused ? pill('Paused', { color: 'var(--orange)' }) : null),
        h('h2.detail-title', q.title),
        h('div.small.muted', scheduleText(s, q)),
        q.description ? h('p', q.description) : null,
        q.instructions.length ? h('div', h('div.eyebrow', 'How to do it'), h('ol.instructions', q.instructions.map((t) => h('li', t)))) : null,
        q.verification !== 'none' ? h('div.info-row', icon(q.verification === 'video' ? 'video' : 'timer', 16), h('span', VERIFICATIONS.find((v) => v.id === q.verification).desc)) : null,
        q.type === 'weekly' ? h('div', h('div.row.between.small', h('span.muted', 'This week'), h('span.num.bold', `${st.progress}/${q.target}`)), h('div.mt-8', progressBar(st.progress / q.target, { color: cat.color }))) : null,
        !doneToday
          ? h(
              'div.reward-box',
              h('div.row.gap-12', h('div', h('div.rb-val.num', `+${prev.xp}`), h('div.rb-lab', 'XP')), prev.match ? h('div', h('div.rb-val.num.blue', `↑${prev.match}`), h('div.rb-lab', 'Match SR')) : null, prev.sr ? h('div', h('div.rb-val.num.green', `+${prev.sr}`), h('div.rb-lab', 'Bonus SR')) : null),
              prev.srNote ? h('div.tiny.faint.mt-8', prev.srNote) : null,
              prev.lines.length ? h('div.tiny.faint.mt-4', prev.lines.join(' · ')) : null,
              !prev.allowed && prev.reason ? h('div.tiny.orange.mt-4', prev.reason) : null
            )
          : null,
        h('div.stack-8', actions),
        comps.length ? h('div', h('div.eyebrow', 'Recent'), h('div.stack-4.mt-8', comps.map((c) => h('div.row.between.small', h('span.faint', relDay(c.day, today)), h('span', c.verified ? '✓ verified · ' : '', h('span.num', `+${c.xp} XP`)))))) : null,
        q.type === 'daily' ? habitGraph(s, q, today) : null,
        h(
          'div.grid-3',
          btn('Edit', () => (close(), openQuestEditor(q)), { variant: 'ghost', size: 'sm', iconName: 'edit' }),
          btn(q.paused ? 'Resume' : 'Pause', () => {
            store.update((st2) => setPaused(st2, q.id, !q.paused, clock.now()));
            toast(q.paused ? 'Resumed.' : 'Paused — it won’t be due until you resume it.');
            rerender();
          }, { variant: 'ghost', size: 'sm', iconName: q.paused ? 'play' : 'pause' }),
          btn('Delete', () => removeQuest(q, close), { variant: 'ghost', size: 'sm', iconName: 'trash' })
        )
      );
    },
  });
}

async function removeQuest(q, close) {
  const hasHistory = store.state.completions.some((c) => c.qid === q.id);
  const ok = await confirmDialog({
    title: `Delete “${q.title}”?`,
    message: hasHistory ? 'Its history, XP and rating stay in your records. It just won’t be scheduled anymore.' : 'This quest has no history and will be removed completely.',
    okText: 'Delete',
    danger: true,
  });
  if (!ok) return;
  store.update((s) => deleteQuest(s, q.id, clock.now()));
  close && close();
  toast('Quest deleted.');
}

// ---------- Editor ----------

export function openQuestEditor(existing, defaults = {}) {
  const isNew = !existing;
  const d = existing
    ? JSON.parse(JSON.stringify(existing))
    : { title: '', category: defaults.category || 'growth', type: defaults.type || 'daily', days: [0, 1, 2, 3, 4, 5, 6], time: null, durationMin: 20, difficulty: 'medium', verification: 'none', description: defaults.description || '', instructions: [], target: 3, dueDate: null, linked: null, goal: { target: 10, unit: '', current: 0 } };
  if (!d.goal) d.goal = { target: 10, unit: '', current: 0 };
  const alarmLinked = d.linked && d.linked.kind === 'alarm';
  openSheet({
    title: isNew ? (d.type === 'goal' ? 'New goal' : 'New quest') : 'Edit quest',
    render: (close, rerender) => {
      const s = store.state;
      const errBox = h('div.form-error.hidden');
      const typeSeg = segmented(QUEST_TYPES.map((t) => ({ id: t.id, name: t.name.split(' ')[0] })), d.type, (v) => ((d.type = v), rerender()), { small: true });
      const linkOpts = linkOptions(s);
      const curLink = d.linked ? `${d.linked.kind}:${d.linked.id || ''}${d.linked.mode ? ':' + d.linked.mode : ''}` : '';
      const durHint = h('span');
      const updateDurHint = () => {
        const caps = rankedConfig(s).durationCaps;
        const di = DIFFICULTIES.findIndex((x) => x.id === d.difficulty);
        const cap = d.durationMin < caps[0] ? 0 : d.durationMin < caps[1] ? 1 : d.durationMin < caps[2] ? 2 : 3;
        durHint.textContent = d.verification === 'none' && di > cap ? `Self-reported ${d.durationMin}-min quests count as ${DIFFICULTIES[cap].name} for rewards (anti-exploit).` : '';
      };
      updateDurHint();
      return h(
        'div.stack-16',
        defaults.refId ? refPreview(defaults.refId) : null,
        field('Title', input({ value: d.title, placeholder: d.type === 'goal' ? 'e.g. Save $1,000' : 'e.g. Read 20 pages', maxlength: 80, autofocus: isNew, oninput: (e) => (d.title = e.target.value) })),
        field('Category', select(CATEGORIES, d.category, (v) => (d.category = v))),
        alarmLinked ? h('div.info-row', icon('alarm', 16), h('span', 'This quest is controlled by an alarm — change its time and days in Alarms.')) : field('Type', typeSeg),
        d.type === 'daily' && !alarmLinked ? field('Days', dayPicker(d.days, (v) => (d.days = v))) : null,
        d.type === 'weekly' ? field('Times per week', stepper(d.target, { min: 1, max: 7, onChange: (v) => (d.target = v) }), 'Counts once per day. SR is awarded when the target is reached.') : null,
        d.type === 'goal'
          ? h(
              'div.stack-12',
              h('div.grid-2', field('Target', numInput(d.goal.target, (v) => (d.goal.target = v), { step: 'any' })), field('Unit', input({ value: d.goal.unit, placeholder: 'books, $, kg…', maxlength: 24, oninput: (e) => (d.goal.unit = e.target.value) }))),
              field('Current value', numInput(d.goal.current, (v) => (d.goal.current = v), { step: 'any' }), 'For a “decrease” goal (e.g. weight), set current higher than the target.')
            )
          : null,
        d.type === 'once' || d.type === 'goal' ? field('Deadline (optional)', dateInput(d.dueDate, (v) => (d.dueDate = v))) : null,
        d.type !== 'goal' && !alarmLinked ? field('Scheduled time (optional)', timeInput(d.time, (v) => (d.time = v))) : null,
        d.type !== 'goal' ? h('div.grid-2', field('Duration', stepper(d.durationMin, { min: 1, max: 600, step: 5, suffix: 'm', onChange: (v) => ((d.durationMin = v), updateDurHint()) })), field('Difficulty', select(DIFFICULTIES, d.difficulty, (v) => ((d.difficulty = v), updateDurHint())))) : null,
        d.type !== 'goal' ? h('div.tiny.orange', durHint) : null,
        field('Description', textarea({ value: d.description, placeholder: 'Why it matters / what “done” means', maxlength: 600, oninput: (e) => (d.description = e.target.value) })),
        d.type !== 'goal' ? field('Instructions (one step per line)', textarea({ value: d.instructions.join('\n'), placeholder: '1. …\n2. …', rows: 4, oninput: (e) => (d.instructions = e.target.value.split('\n')) })) : null,
        d.type !== 'goal' && !alarmLinked ? field('Verification', select(VERIFICATIONS, d.verification, (v) => ((d.verification = v), updateDurHint())), VERIFICATIONS.find((x) => x.id === d.verification).desc) : null,
        d.type !== 'goal' && !alarmLinked
          ? field(
              'Auto-complete from activity',
              select(linkOpts, curLink, (v) => {
                if (!v) d.linked = null;
                else {
                  const [kind, id, mode] = v.split(':');
                  d.linked = { kind, ...(id ? { id } : {}), ...(mode ? { mode } : {}), ...(kind === 'focus' ? { minutes: d.durationMin } : {}) };
                  if (kind === 'focus' && d.verification === 'none') d.verification = 'timer';
                }
              }),
              'Linked quests complete themselves when you finish the real activity in the app.'
            )
          : null,
        errBox,
        h(
          'div.sheet-actions',
          btn(isNew ? 'Create' : 'Save', () => {
            const data = { ...d, instructions: d.instructions.filter((x) => x.trim()) };
            if (data.linked && data.linked.kind === 'focus') data.linked.minutes = data.durationMin;
            const r = store.update((st) => (isNew ? createQuest(st, data, clock.now()) : updateQuest(st, existing.id, data)));
            if (!r.ok) {
              errBox.textContent = r.reason;
              errBox.classList.remove('hidden');
              return;
            }
            close();
            toast(isNew ? (data.type === 'goal' ? 'Goal created.' : 'Quest created — it joins ranked matches tomorrow.') : 'Saved.', { type: 'success' });
            if (r.warning) setTimeout(() => toast(r.warning), 2800);
          }, { block: true, size: 'lg' })
        )
      );
    },
  });
}

function linkOptions(s) {
  const out = [{ id: '', name: 'Nothing — I’ll tick it myself' }, { id: 'focus:', name: 'Any focus session (timer)' }];
  for (const sub of s.school.subjects) out.push({ id: `focus:${sub.id}`, name: `Focus session: ${sub.name}` });
  for (const r of s.fitness.routines) out.push({ id: `workout:${r.id}`, name: `Workout: ${r.name}` });
  for (const r of s.care.routines) out.push({ id: `care:${r.id}`, name: `Routine: ${r.name}` });
  out.push({ id: 'journal:', name: 'Any trading journal entry' }, { id: 'journal::backtest', name: 'Backtest journal entry' });
  for (const p of s.business.projects) out.push({ id: `project:${p.id}`, name: `Task done in ${p.name}` });
  out.push({ id: 'sleep:', name: 'Sleep log' }, { id: 'review:', name: 'Weekly review' });
  return out;
}

