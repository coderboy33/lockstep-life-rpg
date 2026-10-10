// Morning "match report" for yesterday, and the welcome-back sheet after missed days.

import { store } from '../core/store.js';
import { clock, dayKey, addDays, fmtDayFull, fmtDay } from '../core/dates.js';
import { signed, pct } from '../core/util.js';
import { h, icon, btn } from '../ui/dom.js';
import { openSheet, hasOpenSheet } from '../ui/overlay.js';
import { emblem } from '../ui/emblem.js';
import { tiersOf, recentInactiveDays, declareDay, currentTier, placementBreakdown } from '../engine/ranked.js';
import { rankedConfig } from '../core/config.js';
import { streakAsOf } from '../engine/schedule.js';
import { alarmShowing } from '../services/alarmRunner.js';
import { isLocked } from '../core/session.js';

let shownFor = null;

export function maybeShowReports() {
  const s = store.state;
  if (!s.onboarded) return;
  const today = dayKey(clock.now(), s.settings);
  if (s.meta.lastReportDay === today || shownFor === today) return;
  if (hasOpenSheet() || alarmShowing() || isLocked()) {
    setTimeout(maybeShowReports, 4000);
    return;
  }
  shownFor = today;
  const inactive = recentInactiveDays(s, today);
  const y = addDays(today, -1);
  const rec = s.days[y];
  store.update((st) => (st.meta.lastReportDay = today), { render: false });
  if (inactive.length) return showWelcomeBack(inactive);
  if (rec && rec.settled && rec.status !== 'setup') showDailyReport(y);
}

function showDailyReport(day) {
  const s = store.state;
  const rec = s.days[day];
  const tiers = tiersOf(s);
  const today = dayKey(clock.now(), s.settings);
  const streak = streakAsOf(s, today, today);
  const comps = s.completions.filter((c) => c.day === day);
  const xp = comps.reduce((a, c) => a + c.xp, 0) + s.xpLog.filter((e) => e.day === day).reduce((a, e) => a + e.amount, 0);
  const rankEvents = s.ranked.history.filter((e) => e.day === day && (e.type === 'promotion' || e.type === 'demotion'));
  const placing = !s.ranked.placed || (s.ranked.placement.endDay && day <= s.ranked.placement.endDay);
  const cfg = rankedConfig(s);
  let headline;
  let tone = 'neutral';
  if (rec.status === 'rest' || rec.status === 'excused') headline = rec.status === 'rest' ? 'Rest day. Recovered and ready.' : 'Excused day. No penalty.';
  else if (rec.status === 'empty') headline = 'No ranked quests were scheduled.';
  else if (rec.status === 'away') headline = 'You were away. Welcome back.';
  else if (rec.srKind === 'perfect') {
    headline = 'Perfect day. 🔥';
    tone = 'up';
  } else if (rec.srApplied > 0) {
    headline = 'Match won.';
    tone = 'up';
  } else if (rec.srApplied < 0) {
    headline = 'Below your standard.';
    tone = 'down';
  } else headline = placing ? 'Placement day recorded.' : 'Standard held.';
  openSheet({
    title: 'Yesterday’s match',
    size: 'sm',
    render: (close) =>
      h(
        'div.stack-16',
        h('div.small.muted', fmtDayFull(day)),
        h('div.row.gap-12', emblem(currentTier(s), 64), h('div', h('div.card-title', headline), h('div.small.muted', placing ? `Placement ${s.ranked.placement.days.length}/${cfg.placementDays}` : `${tiers[s.ranked.tier].name} · ${s.ranked.rating} SR`))),
        h(
          'div.grid-3',
          h('div.stat', h('div.stat-value.num', rec.rate === null || rec.rate === undefined ? '—' : pct(rec.rate)), h('div.stat-label', 'Completion')),
          h('div.stat', h('div.stat-value.num' + (tone === 'up' ? '.green' : tone === 'down' ? '.red' : ''), placing ? '—' : signed(rec.srApplied || 0)), h('div.stat-label', 'Match SR')),
          h('div.stat', h('div.stat-value.num', `+${xp}`), h('div.stat-label', 'XP'))
        ),
        rec.status === 'normal' && !placing && rec.std ? h('p.small.muted', `Your rank’s standard is ${Math.round(rec.std * 100)}% of today’s quests (weighted by difficulty). Above it you gain SR; below it you lose some.`) : null,
        rec.inactive ? h('div.info-row', icon('info', 16), h('span', 'The app wasn’t opened that day, so the penalty was halved. If you were sick or had an emergency, you can excuse it from the day view.')) : null,
        ...rankEvents.map((e) => h('div.info-row' + (e.type === 'promotion' ? '.ok' : ''), icon(e.type === 'promotion' ? 'trend' : 'trendDown', 16), h('span', `${e.type === 'promotion' ? 'Promoted' : 'Demoted'} to ${tiers[e.to].name}`))),
        h('div.row.gap-8', icon('flame', 18, 'flame'), h('span.bold', `${streak}-day streak`)),
        placing && s.ranked.placed && s.ranked.placement.result ? placementSummary(s) : null,
        btn('Start today', () => close(), { block: true, variant: 'white' })
      ),
  });
}

function placementSummary(s) {
  const b = s.ranked.placement.result || placementBreakdown(s, s.ranked.placement.endDay);
  const row = (label, v) => h('div.row.between.small', h('span.muted', label), h('span.num.bold', pct(v)));
  return h('div.card.flat.stack-8', h('div.eyebrow', 'How you were placed'), row('Average completion', b.avgRate), row('Consistency (days ≥ 60%)', b.consistency), row('Task difficulty', b.difficulty), row('Category breadth', b.breadth), row('Verified challenges', b.verified), b.lowActivity ? h('div.tiny.orange', 'Few quests were completed, so placement was capped at Silver I.') : null);
}

function showWelcomeBack(days) {
  openSheet({
    title: 'Welcome back',
    size: 'sm',
    render: (close, rerender) => {
      const s = store.state;
      const cfg = rankedConfig(s);
      return h(
        'div.stack-16',
        h('p.muted', 'Lockstep wasn’t opened on these days, so they were settled as missed (with half the usual SR loss). Life happens — if you were sick, had an emergency or a technical problem, mark it below and the penalty is refunded.'),
        h(
          'div.list',
          days.map((k) => {
            const rec = s.days[k];
            const excused = rec && (rec.mode === 'excused' || rec.mode === 'rest');
            return h(
              'div.list-item',
              h('div.li-body', h('div.li-title', fmtDay(k, { weekday: true })), h('div.li-sub', excused ? 'Excused — no penalty' : `${signed(rec ? rec.srApplied || 0 : 0)} SR · streak reset`)),
              excused
                ? icon('check', 18, 'green')
                : h(
                    'div.row.gap-6',
                    btn('Sick', () => {
                      const r = store.update((st) => declareDay(st, k, 'excused', clock.now(), 'sick'), { render: false });
                      if (!r.ok) alert(r.reason);
                      rerender();
                    }, { variant: 'ghost', size: 'sm' }),
                    btn('Emergency', () => {
                      const r = store.update((st) => declareDay(st, k, 'excused', clock.now(), 'emergency'), { render: false });
                      if (!r.ok) alert(r.reason);
                      rerender();
                    }, { variant: 'ghost', size: 'sm' })
                  )
            );
          })
        ),
        h('p.tiny.faint', `You can excuse up to ${cfg.excuseAllowance30} days per 30 days. Days you simply skipped should stay as they are — that keeps your rank honest.`),
        btn('Continue', () => (close(), store.notify()), { block: true, variant: 'white' })
      );
    },
  });
}
