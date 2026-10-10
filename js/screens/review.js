// Weekly review: what happened, what to change, and the plan for next week.

import { store } from '../core/store.js';
import { addDays, fmtDay, weekKey } from '../core/dates.js';
import { catOf } from '../core/config.js';
import { fmtNum, signed, pct, fmtDuration, cleanText } from '../core/util.js';
import { h, icon, btn, iconBtn, progressBar, sectionHead, field, textarea } from '../ui/dom.js';
import { topbar } from '../ui/common.js';
import { weekStats, defaultReviewWeek } from '../engine/review.js';
import { tiersOf } from '../engine/ranked.js';
import { activityAction } from '../services/actions.js';
import { openQuestDetail } from './quests.js';

let selected = null;

export function render(ctx) {
  const s = ctx.state;
  const today = ctx.today;
  const curWk = weekKey(today, s.settings.weekStartsOn);
  if (!selected || selected > curWk) selected = defaultReviewWeek(s, today);
  const wk = selected;
  const st = weekStats(s, wk, today);
  const tiers = tiersOf(s);
  const rec = s.weeks[wk] || {};
  const first = s.setupDay ? weekKey(s.setupDay, s.settings.weekStartsOn) : curWk;
  let focus = rec.focus || '';
  let notes = rec.notes || '';

  const nav = h(
    'div.review-nav',
    iconBtn('chevronLeft', () => ((selected = addDays(wk, -7)), ctx.refresh()), { label: 'Previous week' }),
    h('div.center-text', h('div.bold', `Week of ${fmtDay(wk)}`), h('div.tiny.faint', st.partial ? 'In progress' : rec.reviewed ? 'Reviewed ✓' : 'Ready to review')),
    iconBtn('chevronRight', () => ((selected = addDays(wk, 7)), ctx.refresh()), { label: 'Next week' })
  );
  nav.firstChild.disabled = wk <= first;
  nav.lastChild.disabled = wk >= curWk;

  const summary = h(
    'div.card',
    h('div.row.between', h('div', h('div.eyebrow', 'Weekly score'), h('div.big-count.num', st.score === null ? '—' : pct(st.score))), h('div.right', h('div.small', h('span.num.bold.' + (st.sr.total >= 0 ? 'green' : 'red'), `${signed(st.sr.total)} SR`)), h('div.small.muted.num', `+${fmtNum(st.xp)} XP`))),
    h('div.mt-12', progressBar(st.score || 0, { thick: true, glow: true })),
    h('div.grid-3.mt-16', h('div.stat', h('div.stat-value.num.green', String(st.doneCount)), h('div.stat-label', 'Completed')), h('div.stat', h('div.stat-value.num' + (st.missedCount ? '.red' : ''), String(st.missedCount)), h('div.stat-label', 'Missed')), h('div.stat', h('div.stat-value.num', String(st.verified)), h('div.stat-label', 'Verified'))),
    st.rankEvents.length ? h('div.stack-4.mt-12', st.rankEvents.map((e) => h('div.info-row' + (e.type === 'demotion' ? '' : '.ok'), icon(e.type === 'demotion' ? 'trendDown' : 'trend', 16), h('span', `${e.type === 'promotion' ? 'Promoted to' : e.type === 'demotion' ? 'Demoted to' : 'Placed in'} ${tiers[e.to].name} (${fmtDay(e.day)})`)))) : null,
    h('div.tiny.faint.mt-8', `SR: ${signed(st.sr.days)} from daily matches, ${signed(st.sr.bonus)} bonus${st.sr.week ? `, ${signed(st.sr.week)} weekly settlement` : ''}.`)
  );

  const cats = h(
    'div.card',
    st.cats.length
      ? st.cats
          .sort((a, b) => b.due - a.due)
          .map((c) => h('div.cat-bar', h('span.row.gap-4', { style: { color: catOf(c.id).color } }, icon(catOf(c.id).icon, 14), h('span.small.bold', catOf(c.id).short)), progressBar(c.rate ?? 0, { color: catOf(c.id).color }), h('span.small.num.right', c.due ? `${c.done}/${c.due}` : `+${c.xp}xp`)))
      : h('p.small.muted', 'No activity recorded this week.'),
    st.strongest || st.weakest ? h('div.grid-2.mt-16', st.strongest ? h('div.stat', h('div.stat-value', { style: { color: catOf(st.strongest.id).color, fontSize: '17px' } }, catOf(st.strongest.id).short), h('div.stat-label', 'Strongest')) : h('span'), st.weakest && st.weakest.rate < 0.7 && st.weakest.id !== (st.strongest && st.strongest.id) ? h('div.stat', h('div.stat-value', { style: { color: catOf(st.weakest.id).color, fontSize: '17px' } }, catOf(st.weakest.id).short), h('div.stat-label', 'Needs attention')) : null) : null
  );

  const areas = h(
    'div.grid-2',
    stat('book', 'Study', fmtDuration(st.study.minutes), st.study.goal ? `goal ${fmtDuration(st.study.goal)}` : `${st.study.sessions} sessions`),
    stat('dumbbell', 'Fitness', `${st.fitness.workouts} workouts`, `${fmtNum(st.fitness.sets)} sets`),
    stat('sparkle', 'Self-care', `${st.care.routines} routines`, st.care.rate === null ? 'no care quests' : `${pct(st.care.rate)} of care quests`),
    stat('chart', 'Trading', `${st.trading.entries} entries`, `${st.trading.followed} plan followed${st.trading.broken ? ` · ${st.trading.broken} broken` : ''}`),
    stat('briefcase', 'Business', `${st.business.tasks} tasks shipped`, st.business.objectives ? `${st.business.objectivesDone}/${st.business.objectives} objectives` : 'no objectives set'),
    stat('moon', 'Sleep', st.sleep.avgHours === null ? '—' : `${st.sleep.avgHours.toFixed(1)}h avg`, st.sleep.logs ? `${st.sleep.logs} nights logged` : 'not logged')
  );

  const recs = h(
    'div.card',
    st.recommendations.map((r) =>
      h(
        'div.rec-item',
        h('div.li-icon', icon(r.icon || 'info', 16)),
        h(
          'div.grow',
          h('div.small', r.text),
          r.action ? h('div.mt-8', r.action.kind === 'nav' ? btn(r.action.label, () => (location.hash = r.action.href), { variant: 'ghost', size: 'sm' }) : btn(r.action.label, () => openQuestDetail(r.action.qid), { variant: 'ghost', size: 'sm' })) : null
        )
      )
    )
  );

  const missed = st.missed.length
    ? h(
        'details.done-group',
        h('summary', `Missed quests (${st.missed.length})`),
        h('div.list', st.missed.slice(0, 40).map((m) => h('div.list-item', h('div.li-icon', { style: { '--c': catOf(m.cat).color } }, icon(catOf(m.cat).icon, 16)), h('div.li-body', h('div.li-title.small', m.title), h('div.li-sub', fmtDay(m.day, { weekday: true }))))))
      )
    : null;

  const plan = h(
    'div.card.stack-12',
    field('One focus for next week', textarea({ value: focus, rows: 2, maxlength: 200, placeholder: 'e.g. Do my study block before 6 PM every school day', oninput: (e) => (focus = e.target.value) })),
    field('Notes & reflections', textarea({ value: notes, rows: 3, maxlength: 1000, placeholder: 'What went well? What got in the way?', oninput: (e) => (notes = e.target.value) })),
    h('p.tiny.faint', 'To change your schedule: open a quest from the recommendations above or Quests → All, then edit its days, time or difficulty — or pause it.'),
    btn(rec.reviewed ? 'Save notes' : 'Complete review', () => {
      const already = !!(store.state.weeks[wk] && store.state.weeks[wk].reviewed);
      store.update((x) => {
        x.weeks[wk] ||= {};
        Object.assign(x.weeks[wk], { reviewed: true, reviewedAt: Date.now(), focus: cleanText(focus, 200), notes: cleanText(notes, 1000) });
      }, { render: false });
      if (!already) activityAction('review', { ref: wk }, 'review', 'growth');
      else store.notify();
    }, { block: true, size: 'lg', iconName: 'check' })
  );

  return h(
    'div.screen',
    topbar('Weekly review', { back: '#/me' }),
    nav,
    summary,
    sectionHead('By category'),
    cats,
    sectionHead('Areas'),
    areas,
    sectionHead('Recommendations', h('span.small.faint', 'From your data')),
    recs,
    missed,
    sectionHead('Plan next week'),
    rec.focus && rec.reviewed ? h('div.info-row.mb-8', icon('flag', 16), h('span', `Focus: ${rec.focus}`)) : null,
    plan
  );
}

function stat(ic, title, value, sub) {
  return h('div.stat', h('div.row.gap-6.small.muted', icon(ic, 14), title), h('div.bold.mt-4', value), h('div.tiny.faint', sub));
}
