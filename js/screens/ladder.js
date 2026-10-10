// Rank ladder + the full, transparent ranked rules (generated from the live config).

import { MAJORS, MAJOR, rankedConfig, levelFromXp } from '../core/config.js';
import { fmtNum, pct } from '../core/util.js';
import { fmtDay } from '../core/dates.js';
import { h, icon, progressBar, sectionHead } from '../ui/dom.js';
import { topbar } from '../ui/common.js';
import { emblem, majorColor } from '../ui/emblem.js';
import { tiersOf, currentTier, rankProgress, requirementStatus, demotionRisk, lockedPromotion, placementBreakdown, matchProjection } from '../engine/ranked.js';

export function render(ctx) {
  const s = ctx.state;
  const today = ctx.today;
  const cfg = rankedConfig(s);
  const tiers = tiersOf(s);
  const r = s.ranked;
  const tier = currentTier(s);
  const prog = rankProgress(s);
  const color = majorColor(tier.major);
  const risk = demotionRisk(s, today);
  const lock = lockedPromotion(s, today);
  const proj = matchProjection(s, today);

  const status = h(
    'div.card.glow',
    { style: { '--accent': color } },
    h(
      'div.row.gap-16',
      emblem(tier, 92, { animate: true }),
      h(
        'div.grow',
        h('div.eyebrow', prog.placement ? 'Placement' : 'Current rank'),
        h('div.card-title', { style: { color, fontSize: '24px' } }, prog.placement ? 'Unranked' : tier.name),
        h('div.small.muted.num', prog.placement ? `${prog.done}/${prog.total} placement days complete` : `${fmtNum(r.rating)} SR${prog.next ? ` · ${fmtNum(prog.need)} SR to ${prog.next.name}` : ' · top of the ladder'}`),
        h('div.mt-8', progressBar(prog.pct, { color, glow: true }))
      )
    ),
    proj && proj.mode === 'normal' && proj.kind !== 'empty'
      ? h('div.info-row.mt-12', icon('target', 16), h('span', `Today’s match: ${Math.round((proj.rate || 0) * 100)}% done vs ${Math.round(proj.std * 100)}% standard → ${proj.delta >= 0 ? '+' : ''}${proj.delta} SR if the day ended now.`))
      : null,
    risk && !risk.protected ? h('div.info-row.mt-8' + (risk.risky ? '' : '.ok'), icon(risk.risky ? 'alert' : 'shield', 16), h('span', `Demotion line: ${fmtNum(Math.max(0, risk.line))} SR (${fmtNum(risk.margin)} SR above it).`)) : null,
    risk && risk.protected ? h('div.info-row.ok.mt-8', icon('shield', 16), h('span', `Promotion protection: you can’t be demoted until after ${fmtDay(risk.protectedUntil)}.`)) : null,
    lock ? reqBlock(`Requirements for ${lock.tier.name}`, lock.items) : null,
    r.placed && r.placement.result ? placementNote(r.placement.result) : null,
    !r.placed && s.setupDay ? placementLive(s, today) : null
  );

  // Ladder, top to bottom like a real ladder.
  const rows = [];
  const list = tiers.slice(1).reverse();
  list.forEach((t, i) => {
    const isCur = r.placed && t.index === r.tier;
    const reached = r.placed && t.index < r.tier;
    const peak = t.index <= (r.peakTier || 0);
    const st = t.div <= 1 && cfg.requirements[t.major] ? requirementStatus(s, t.index, today) : null;
    const c = MAJOR[t.major].c1;
    rows.push(
      h(
        'div.ladder-row' + (isCur ? '.current' : reached ? '.reached' : '.locked'),
        { style: { '--glow': c } },
        emblem(t, 44),
        h(
          'div.grow',
          h('div.lr-name', { style: { color: isCur || reached ? c : undefined } }, t.name, isCur ? ' (Current)' : ''),
          h('div.lr-sub.num', `${fmtNum(t.min)}+ SR`),
          st && !reached && !isCur ? h('div.tiny.faint.mt-4', `Requires: ${st.items.map((x) => `${x.label} (${Math.min(x.have, x.need)}/${x.need})`).join(' · ')}`) : null
        ),
        h('div.lr-pill', isCur ? 'You' : reached ? 'Reached' : peak ? 'Peak' : st && st.ok ? 'Ready' : 'Locked')
      )
    );
    if (i < list.length - 1) rows.push(h('div.ladder-link'));
  });
  rows.push(h('div.ladder-link'));
  rows.push(h('div.ladder-row' + (!r.placed ? '.current' : '.reached'), { style: { '--glow': MAJOR.unranked.c1 } }, emblem(tiers[0], 44), h('div.grow', h('div.lr-name', 'Unranked', !r.placed ? ' (Current)' : ''), h('div.lr-sub', `${cfg.placementDays} placement days`)), h('div.lr-pill', !r.placed ? 'You' : 'Done')));

  return h('div.screen', topbar('Rank Ladder', { back: '#/me' }), status, sectionHead('The ladder'), h('div.ladder', rows), rules(s, cfg, tiers));
}

function reqBlock(title, items) {
  return h(
    'div.mt-12',
    h('div.eyebrow', title),
    h(
      'div.req-list',
      items.map((i) => h('div.req' + (i.have >= i.need ? '.ok' : ''), icon(i.have >= i.need ? 'check' : 'lock', 15), h('span.grow', i.label), h('span.num.bold', `${Math.min(i.have, i.need)}/${i.need}`)))
    )
  );
}

function placementNote(b) {
  return h('details.mt-12', h('summary.small.muted', `How you were placed (score ${Math.round(b.score * 100)}/100)`), h('div.stack-4.mt-8.small', breakdownRows(b)));
}

function placementLive(s, today) {
  const b = placementBreakdown(s, today);
  return h(
    'div.mt-12',
    h('div.eyebrow', 'Placement so far'),
    h('div.stack-4.mt-8.small', breakdownRows(b)),
    h('p.tiny.faint.mt-8', `Estimated starting rating if placement ended now: ~${fmtNum(b.rating)} SR (max ${fmtNum(rankedConfig(s).placementMaxRating)}). Only finished days count.`)
  );
}

function breakdownRows(b) {
  const row = (l, v, w) => h('div.row.between', h('span.muted', `${l} (${w}%)`), h('span.num.bold', pct(v)));
  return [
    row('Average completion', b.avgRate, 40),
    row('Consistency — days at 60%+', b.consistency, 20),
    row('Difficulty of completed quests', b.difficulty, 15),
    row('Category breadth', b.breadth, 10),
    row('Verified challenges', b.verified, 10),
    row('Hard quests & goals', b.goals, 5),
    b.lowActivity ? h('div.tiny.orange', `Fewer than the minimum completions — capped at Silver I.`) : null,
  ];
}

function rules(s, cfg, tiers) {
  const majors = MAJORS.slice(1);
  const lv = levelFromXp(s.xp.total || 0);
  return h(
    'div.card.rules.mt-24',
    h('h2.section-title', 'How ranked works'),
    h('p.mt-8', 'Lockstep has two separate progress systems. They never convert into each other.'),
    h('h3', '1. Lifetime XP & level (never lost)'),
    h('p', `XP measures total effort. Every completed quest, workout, study session, journal entry and routine earns XP. Bad days don’t remove XP — only undoing a completion does. You’re level ${lv.level}. Levels unlock accent colours and titles.`),
    h('h3', '2. Competitive rating — SR (can go up and down)'),
    h('p', 'Every normal day is a ranked match. Your match score is the share of that day’s scheduled ranked quests you completed, weighted by difficulty (Easy 1, Medium 2, Hard 3, Epic 4). When the day ends:'),
    h('ul', h('li', 'At or above your rank’s standard → you gain SR (more the further above you are, plus a perfect-day bonus).'), h('li', 'Below the standard → you lose SR (more the further below).'), h('li', 'Missing one task out of many costs little or nothing. A no-show day costs the most.')),
    h(
      'table',
      h('tr', h('th', 'Rank'), h('th', 'Standard'), h('th', 'Max gain'), h('th', 'Max loss'), h('th', 'Min load')),
      majors.map((m) => {
        const x = cfg.majors[m.id];
        return h('tr', h('td', { style: { color: m.c1, fontWeight: 700 } }, m.name), h('td', pct(x.standard)), h('td', `+${x.up + cfg.perfectDayBonus}`), h('td', `−${x.down}`), h('td', String(x.minLoad)));
      })
    ),
    h('p.tiny.faint.mt-8', 'Min load: if a day’s quests add up to less difficulty weight than this, gains are scaled down — one trivial quest can’t farm SR.'),
    h('h3', 'Thresholds'),
    h('p', tiers.slice(1).map((t) => `${t.name} ${fmtNum(t.min)}`).join(' · ')),
    h('h3', 'Placement'),
    h('p', `New accounts start Unranked. Your setup day doesn’t count. The next ${cfg.placementDays} normal days are placement matches. Your starting rating comes from completion (40%), consistency (20%), difficulty (15%), breadth (10%), verified challenges (10%) and hard quests/goals (5%). The best possible placement is ${fmtNum(cfg.placementMaxRating)} SR (Platinum I), and completing fewer than ${cfg.placementMinCompletions} quests caps it at ${fmtNum(cfg.placementLowActivityCap)} SR.`),
    h('h3', 'Promotions'),
    h('p', 'Reach a rank’s threshold to be promoted. Entering Platinum and above also requires proof of sustained discipline:'),
    h(
      'ul',
      Object.entries(cfg.requirements).map(([maj, req]) =>
        h(
          'li',
          h('b', MAJOR[maj].name + ': '),
          [
            req.activeDays14 && `${req.activeDays14}/14 days secured`,
            req.categories7 && `${req.categories7} categories in 7 days`,
            req.categories14 && `${req.categories14} categories in 14 days`,
            req.verified14 && `${req.verified14} verified challenges in 14 days`,
            req.weeks && `last ${req.weeks.n} week(s) at ${pct(req.weeks.score)}+`,
            req.streak && `${req.streak}-day streak`,
            req.daysAtChampion && `${req.daysAtChampion} days at Champion`,
          ]
            .filter(Boolean)
            .join(', ')
        )
      )
    ),
    h('p', `While a promotion is locked, your SR can’t go more than ${cfg.lockedOverflow} past that threshold — so grinding can’t skip the requirements.`),
    h('h3', 'Demotions'),
    h('p', `You’re demoted only if your SR falls ${cfg.demotionBuffer} below your rank’s threshold, and never during the ${cfg.promotionProtectionDays} days after a promotion. Rest days, excused days (sick, emergency, technical problems — up to ${cfg.excuseAllowance30} per 30 days) and days with nothing scheduled are neutral. If you don’t open the app, the day still counts, but the loss is halved; after ${cfg.awayAfterInactiveDays} inactive days in a row you’re marked “away” with no further losses (your streak still resets).`),
    h('h3', 'Weekly settlement'),
    h('p', `At the end of each week, a weekly score well above your standard gives +${cfg.weekly.strongBonus} SR; one far below costs −${cfg.weekly.weakPenalty} SR. At Elite and above, scheduling fewer than ${cfg.weekly.eliteMinDue} ranked quests in a week costs −${cfg.weekly.lowActivityPenalty} SR (you can’t protect a high rank by scheduling nothing).`),
    h('h3', 'Anti-exploit rules'),
    h(
      'ul',
      h('li', 'Each quest can only be completed once per day (or once per week for weekly targets). Undo removes the exact rewards.'),
      h('li', 'New quests join your ranked match the day after you create them.'),
      h('li', `Self-reported quests can’t count as harder than their length allows (under ${cfg.durationCaps[0]} min = Easy, under ${cfg.durationCaps[1]} = Medium, under ${cfg.durationCaps[2]} = Hard).`),
      h('li', `Video-required quests without accepted evidence earn ${pct(cfg.credit.videoMissing)} match credit and half XP. Timer quests done without the timer earn ${pct(cfg.credit.timerMissing)} credit.`),
      h('li', `Forgot to log something? You can log it up to ${cfg.backfillDays} days later at ${pct(cfg.credit.backfill)} credit.`),
      h('li', `Bonus SR (verified challenges, on-time alarms, one-time challenges, weekly targets) is capped at ${cfg.directSrCap} per day.`),
      h('li', 'Trading quests reward journaling, research and following your rules — never profit or risk.')
    ),
    h('h3', 'Seasons'),
    h('p', `Seasons last ${cfg.season.weeks} weeks. At the end, your final and peak ranks are saved, and the SR above Gold I is compressed by ${pct(cfg.season.resetStrength)} — so Unreal has to be defended.`),
    s.settings.customRules ? h('div.info-row.mt-12', icon('settings', 16), h('span', 'You’ve customised these rules in Settings. Seasons played with custom rules are marked.')) : null
  );
}
