// App-specific shared components (rank hero, week strip, quest rows, headers).

import { h, icon, ring, progressBar, pill, haptic } from './dom.js';
import { emblem, majorColor } from './emblem.js';
import { catOf, rankedConfig, DIFFICULTIES } from '../core/config.js';
import { fmtNum, signed, fmtDuration } from '../core/util.js';
import { weekKey, weekDays, parseKey, WD_LETTER, weekday, fmtTime, addDays } from '../core/dates.js';
import { currentTier, rankProgress, matchProjection, matchImpact } from '../engine/ranked.js';
import { streakAsOf, dayResult, computeDay, effWeight } from '../engine/schedule.js';
import { levelInfo, currentTitle } from '../engine/progress.js';

export function topbar(title, opts = {}) {
  const { back, actions = [], small = false, sub } = opts;
  return h(
    'header.topbar',
    back
      ? h('button.back-btn', { type: 'button', 'aria-label': 'Back', onclick: () => (typeof back === 'string' ? (location.hash = back) : history.length > 1 ? history.back() : (location.hash = '#/home')) }, icon('chevronLeft', 20))
      : null,
    h('div.grow', h('h1.title' + (small ? '.sm' : ''), title), sub ? h('div.small.muted', sub) : null),
    ...actions
  );
}

export function avatarEl(state, size = 26) {
  return h('span.avatar', { style: { width: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.58) + 'px' } }, state.profile.avatar || '🔥');
}

export function streakPill(state, today) {
  const n = streakAsOf(state, today, today);
  return h(
    'a.streak-pill',
    { href: '#/me', 'aria-label': `Profile — ${n} day streak` },
    avatarEl(state),
    h('span.ellipsis', { style: 'max-width:90px' }, state.profile.name || 'You'),
    h('span.row.gap-4', icon('flame', 15, 'flame-w'), h('span.num', String(n)))
  );
}

/** Big rank emblem in a progress ring (home screen hero). */
export function rankHero(state, today, opts = {}) {
  const tier = currentTier(state);
  const prog = rankProgress(state);
  const color = majorColor(tier.major);
  const size = opts.size || 200;
  const proj = matchProjection(state, today);
  let titleLine;
  let subLine;
  if (prog.placement) {
    titleLine = h('div.hero-tier', 'PLACEMENT');
    subLine = h('div.hero-sub', `${prog.done}/${prog.total} ranked days played`);
  } else {
    titleLine = h('div.hero-tier', { style: { color } }, tier.name.toUpperCase());
    subLine = h('div.hero-sub.num', `${fmtNum(state.ranked.rating)} SR`);
  }
  const ringEl = ring(prog.pct, { size, stroke: 9, color, children: emblem(tier, Math.round(size * 0.56), { animate: true }), cls: 'glow' });
  const foot = [];
  if (prog.placement) foot.push(h('div.small.muted.center-text', 'Complete your quests each day — your first 7 ranked days decide your starting rank.'));
  else if (prog.max) foot.push(h('div.small.muted.center-text', 'Top of the ladder. Keep the standard to stay here.'));
  else foot.push(h('div.small.muted.center-text', h('span.num.bold', fmtNum(prog.need)), ` SR to ${prog.next.name}`));
  if (proj && proj.kind !== 'empty' && proj.mode === 'normal') {
    const good = proj.delta >= 0;
    foot.push(
      h(
        'div.match-chip' + (good ? '.up' : '.down'),
        icon(good ? 'trend' : 'trendDown', 15),
        h('span', `Today’s match: ${signed(proj.delta)} SR`),
        h('span.faint', ` · ${Math.round((proj.rate || 0) * 100)}% / ${Math.round(proj.std * 100)}% std`)
      )
    );
  } else if (proj && proj.mode !== 'normal') foot.push(h('div.match-chip', icon('bed', 15), h('span', proj.mode === 'rest' ? 'Rest day — no match today' : 'Excused day — no match today')));
  return h('a.rank-hero', { href: '#/ladder', 'aria-label': 'Open rank ladder' }, ringEl, titleLine, subLine, ...foot);
}

export function levelCard(state) {
  const lv = levelInfo(state);
  const t = currentTitle(state);
  return h(
    'div.card.level-card',
    h('div.eyebrow.center-text', 'Lifetime level'),
    h('div.level-big.num', `Lv ${lv.level}`),
    h('div.level-xp.num', `${fmtNum(state.xp.total)} XP · ${t.name}`),
    progressBar(lv.pct, { thick: true, glow: true }),
    h('div.tiny.faint.center-text.mt-8.num', `${fmtNum(lv.into)} / ${fmtNum(lv.need)} XP to Lv ${lv.level + 1}`)
  );
}

/** Seven day circles (completion rings) for the current week. */
export function weekStrip(state, today, onPick) {
  const wk = weekKey(today, state.settings.weekStartsOn);
  return h(
    'div.week-strip',
    weekDays(wk).map((k) => {
      const isToday = k === today;
      const future = k > today;
      let pctv = 0;
      let kind = 'future';
      if (!future) {
        const r = dayResult(state, k, today);
        kind = r.kind;
        const rec = state.days[k];
        pctv = rec && rec.settled ? rec.rate || 0 : r.rate ?? (k >= (state.setupDay || k) ? computeDay(state, k).rate || 0 : 0);
      }
      const color = kind === 'secured' ? 'var(--green)' : kind === 'missed' ? 'var(--red)' : 'var(--accent)';
      return h(
        'button.wd' + (isToday ? '.today' : '') + (future ? '.future' : ''),
        { type: 'button', onclick: () => !future && onPick && (haptic(8), onPick(k)), 'aria-label': k },
        h('span.wd-letter', WD_LETTER[weekday(k)]),
        isToday
          ? h('span.wd-num.today-num', String(parseKey(k).d))
          : ring(pctv, { size: 36, stroke: 3, color, dashed: future || kind === 'skip', children: h('span.wd-num', String(parseKey(k).d)) })
      );
    })
  );
}

const VERIFY_LABEL = { none: null, timer: 'Timer', video: 'Video' };

/**
 * One quest row. item: { q, done, completion, due, isNew, progress, target }
 * handlers: { onCheck(item), onOpen(item) }
 */
export function questRow(state, item, today, handlers = {}) {
  const { q } = item;
  const cat = catOf(q.category);
  const cfg = rankedConfig(state);
  const done = item.type === 'weekly' || q.type === 'weekly' ? item.done : item.done;
  const progress = q.type === 'weekly' ? `${item.progress || 0}/${q.target}` : null;
  const todayDone = q.type === 'weekly' ? item.todayDone : done;
  const xp = DIFFICULTIES.findIndex((d) => d.id === q.difficulty);
  const meta = [];
  if (q.time) meta.push(fmtTime(q.time, state.settings.clock24));
  meta.push(fmtDuration(q.durationMin));
  if (VERIFY_LABEL[q.verification]) meta.push(VERIFY_LABEL[q.verification]);
  if (progress) meta.push(`${progress} this week`);
  let reward = null;
  if (item.completion) reward = h('span.qr-reward.done', `+${item.completion.xp} XP${item.completion.sr ? ` · +${item.completion.sr} SR` : ''}`);
  else if (state.ranked.placed && q.type === 'daily' && item.due) {
    const imp = matchImpact(state, today, effWeight(q, cfg));
    reward = h('span.qr-reward', `+${cfg.xpBase[Math.max(0, xp)]} XP${imp ? ` · ↑${imp} SR` : ''}`);
  } else reward = h('span.qr-reward', `+${cfg.xpBase[Math.max(0, xp)]} XP`);
  return h(
    'div.qrow' + (todayDone ? '.is-done' : ''),
    { style: { '--c': cat.color } },
    h(
      'button.qcheck' + (todayDone ? '.on' : ''),
      {
        type: 'button',
        'aria-label': todayDone ? `${q.title} completed` : `Complete ${q.title}`,
        onclick: (e) => {
          e.stopPropagation();
          handlers.onCheck && handlers.onCheck(item);
        },
      },
      icon(todayDone ? 'check' : q.linked && q.linked.kind === 'alarm' ? 'alarm' : 'check', 18)
    ),
    h(
      'button.qbody',
      { type: 'button', onclick: () => handlers.onOpen && handlers.onOpen(item) },
      h('div.qtitle', q.title, item.isNew ? h('span.badge', { style: { '--c': 'var(--yellow)', marginLeft: '6px' } }, 'NEW') : null),
      h('div.qmeta', h('span.qcat', { style: { color: cat.color } }, icon(cat.icon, 13), cat.short), h('span', meta.join(' · '))),
      reward
    ),
    q.type === 'weekly' ? h('div.qprog', progressBar((item.progress || 0) / q.target, { color: cat.color })) : null
  );
}

export function emptyHint(text) {
  return h('div.small.faint.center-text', { style: 'padding:14px' }, text);
}

export function dayLabel(state, k, today) {
  if (k === today) return 'Today';
  if (k === addDays(today, -1)) return 'Yesterday';
  return k;
}

export function sectionCard(titleText, right, ...children) {
  return h('div.card', h('div.row.between.gap-8', h('div.card-title', titleText), right), h('div.mt-12', children));
}

export function infoRow(iconName, text, color) {
  return h('div.info-row', { style: color ? { '--c': color } : null }, icon(iconName, 16), h('span', text));
}

