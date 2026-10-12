// Me: profile, lifetime level, rank, attributes, stats, history and achievements.

import { store } from '../core/store.js';
import { fmtDay, addDays, weekKey } from '../core/dates.js';
import { fmtNum, sum } from '../core/util.js';
import { rankedConfig } from '../core/config.js';
import { h, icon, btn, iconBtn, progressBar, sectionHead, listItem, stat } from '../ui/dom.js';
import { topbar, levelCard } from '../ui/common.js';
import { emblem, majorColor } from '../ui/emblem.js';
import { ratingChart, barChart } from '../ui/charts.js';
import { currentTier, rankProgress, tiersOf, seasonEnd } from '../engine/ranked.js';
import { attributes, ACHIEVEMENTS, currentTitle } from '../engine/progress.js';
import { streakAsOf, computeWeek } from '../engine/schedule.js';

export function render(ctx) {
  const s = ctx.state;
  const today = ctx.today;
  const tiers = tiersOf(s);
  const tier = currentTier(s);
  const prog = rankProgress(s);
  const color = majorColor(tier.major);
  const title = currentTitle(s);

  const rankCard = h(
    'div.card',
    h('div.eyebrow', 'Competitive rank'),
    h(
      'a.rank-card.mt-12',
      { href: '#/ladder' },
      emblem(tier, 76),
      h(
        'div.grow',
        h('div.card-title', { style: { color } }, prog.placement ? 'Unranked — placement' : tier.name),
        h('div.small.muted.num', prog.placement ? `${prog.done}/${prog.total} placement days${s.ranked.rating ? ` · ${fmtNum(s.ranked.rating)} SR` : ''}` : `${fmtNum(s.ranked.rating)} SR${prog.next ? ` · ${fmtNum(prog.need)} to ${prog.next.name}` : ''}`),
        h('div.mt-8', progressBar(prog.pct, { color, glow: true }))
      )
    ),
    h('div.mt-16', btn('Rank Ladder', () => (location.hash = '#/ladder'), { block: true, iconName: 'trophy' }))
  );

  const attrs = attributes(s, today);
  const attrGrid = h(
    'div.attr-grid',
    attrs.map((a) =>
      h(
        'div.attr',
        { style: { '--c': a.color } },
        h('div.attr-top', icon(a.icon, 14), a.short),
        h('div.attr-val.num', String(a.level), a.weekXp ? h('span.attr-delta', `+${fmtNum(a.weekXp)} XP`) : null),
        progressBar(a.pct, { color: a.color })
      )
    )
  );

  const streak = streakAsOf(s, today, today);
  const studyMin = sum(s.school.sessions, (x) => x.minutes);
  const verified = s.completions.filter((c) => c.verified).length;
  const stats = h(
    'div.grid-2',
    stat(h('span.row.gap-4', icon('flame', 18, 'flame'), String(streak)), 'Current streak'),
    stat(String(s.records.bestStreak || 0), 'Best streak'),
    stat(fmtNum(s.completions.length), 'Quests completed'),
    stat(String(verified), 'Verified challenges'),
    stat(`${(studyMin / 60).toFixed(1)}h`, 'Focused study'),
    stat(String(s.fitness.sessions.length), 'Workouts logged'),
    stat(s.ranked.peakTier ? tiers[s.ranked.peakTier].name : '—', 'Peak rank'),
    stat(fmtNum(s.ranked.peakRating || 0), 'Peak SR')
  );

  // Weekly performance (last 8 weeks).
  const wk = weekKey(today, s.settings.weekStartsOn);
  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const k = addDays(wk, -7 * i);
    if (s.setupDay && addDays(k, 6) < s.setupDay) continue;
    const w = s.weeks[k] && s.weeks[k].settled ? s.weeks[k] : computeWeek(s, k, today);
    weeks.push({ label: fmtDay(k).split(' ')[1] || fmtDay(k), value: Math.round((w.score || 0) * 100), color: (w.score || 0) >= 0.7 ? 'var(--green)' : (w.score || 0) >= 0.5 ? 'var(--accent)' : 'var(--orange)' });
  }

  const history = [...s.ranked.history].reverse().slice(0, 12);
  const unlocked = ACHIEVEMENTS.filter((a) => s.achievements[a.id]);
  const end = seasonEnd(s);

  return h(
    'div.screen',
    topbar('Me', { actions: [iconBtn('settings', () => (location.hash = '#/settings'), { label: 'Settings' })] }),
    h(
      'div.profile-head',
      h('div.profile-avatar', s.profile.avatar || '🔥'),
      h('div.profile-name', s.profile.name || 'Player'),
      h('div.row.gap-6', h('span.badge', title.name), s.setupDay ? h('span.small.faint', `Since ${fmtDay(s.setupDay)}`) : null)
    ),
    levelCard(s),
    h('div.mt-12', rankCard),
    s.profile.mainGoals.length ? h('div.card.mt-12', h('div.eyebrow', 'Main goals'), h('div.stack-8.mt-8', s.profile.mainGoals.map((g) => h('div.row.gap-8', icon('flag', 16, 'accent'), h('span', g))))) : null,
    sectionHead('Your attributes', h('span.small.faint', 'Level from XP · this week')),
    attrGrid,
    sectionHead('Stats'),
    stats,
    sectionHead('Rating', h('a.small', { href: '#/ladder' }, 'Rules')),
    h('div.card', ratingChart(ratingPoints(s, today), { thresholds: tiers.slice(1), color: majorColor(tier.major) })),
    weeks.length ? sectionHead('Weekly performance', h('a.small', { href: '#/review' }, 'Review')) : null,
    weeks.length ? h('div.card', barChart(weeks, { max: 100, unit: '%' })) : null,
    sectionHead('Rank history'),
    h(
      'div.card',
      history.length
        ? history.map((e) =>
            h(
              'div.history-item',
              icon(e.type === 'promotion' ? 'trend' : e.type === 'demotion' ? 'trendDown' : e.type === 'placement' ? 'shield' : 'refresh', 18, e.type === 'demotion' ? 'red' : e.type === 'promotion' ? 'green' : 'accent'),
              h('div.grow', h('div.bold', eventText(e, tiers)), h('div.tiny.faint', `${fmtDay(e.day)} · ${fmtNum(e.rating)} SR`))
            )
          )
        : h('p.small.muted', 'Promotions, demotions and placement results will appear here.')
    ),
    sectionHead('Season', h('span.small.faint', `Season ${s.ranked.season.number}`)),
    h(
      'div.card',
      h('div.small.muted', end ? `Ends ${fmtDay(end)}. At season end your rating is softly compressed (${Math.round(rankedConfig(s).season.resetStrength * 100)}% of the SR above Gold I) and your final and peak ranks are saved.` : ''),
      s.ranked.seasons.length
        ? h(
            'div.stack-8.mt-12',
            [...s.ranked.seasons].reverse().map((ss) =>
              h('div.row.between.small', h('span.bold', `Season ${ss.number}`), h('span.muted', `Peak ${tiers[ss.peakTier] ? tiers[ss.peakTier].name : '—'} · Final ${tiers[ss.finalTier] ? tiers[ss.finalTier].name : '—'}${ss.customRules ? ' · custom rules' : ''}`))
            )
          )
        : h('p.tiny.faint.mt-8', 'Past seasons will be listed here.')
    ),
    sectionHead('Achievements', h('span.small.faint', `${unlocked.length}/${ACHIEVEMENTS.length}`)),
    h(
      'div.ach-grid',
      ACHIEVEMENTS.map((a) => {
        const got = s.achievements[a.id];
        return h('div.ach' + (got ? '' : '.locked'), { title: a.desc }, h('div.ach-icon', icon(a.icon, 22)), h('div.ach-name', a.name), h('div.tiny.faint', got ? fmtDay(got.day) : a.desc));
      })
    ),
    sectionHead('More'),
    h(
      'div.list',
      listItem({ iconName: 'clipboard', title: 'Weekly review', sub: 'Stats, insights and next week’s plan', onClick: () => (location.hash = '#/review') }),
      listItem({ iconName: 'alarm', title: 'Alarms & challenges', sub: `${s.alarms.length} alarm${s.alarms.length === 1 ? '' : 's'}`, onClick: () => (location.hash = '#/alarms') }),
      listItem({ iconName: 'image', title: 'Reference images', sub: `${s.references.length} saved on this device`, onClick: () => (location.hash = '#/references') }),
      listItem({ iconName: 'user', title: 'Edit profile & goals', sub: 'Re-run the setup questions', onClick: () => (location.hash = '#/onboarding?edit=1&fresh=1') }),
      listItem({ iconName: 'settings', title: 'Settings', sub: 'Data, notifications, rules, appearance', onClick: () => (location.hash = '#/settings') })
    )
  );
}

function ratingPoints(s, today) {
  if (!s.ranked.placed) return [];
  const pts = s.ranked.ratingLog.filter((p) => p.tier > 0 && p.day < today).slice(-89);
  pts.push({ day: today, rating: s.ranked.rating });
  return pts;
}

function eventText(e, tiers) {
  const to = tiers[e.to] ? tiers[e.to].name : '';
  if (e.type === 'promotion') return `Promoted to ${to}`;
  if (e.type === 'demotion') return `Demoted to ${to}`;
  if (e.type === 'placement') return `Placed in ${to}`;
  return e.note || 'Season update';
}

