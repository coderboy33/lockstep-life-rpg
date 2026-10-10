// Lightweight SVG charts: rating line, habit heatmap, bar chart, muscle map.

import { h } from './dom.js';
import { addDays, weekday, fmtDay } from '../core/dates.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Line chart of rating over time with tier threshold guides. points: [{day, rating}] */
export function ratingChart(points, { thresholds = [], height = 150, color = 'var(--accent)' } = {}) {
  if (!points.length) return h('div.chart-empty', 'Your rating graph appears after placement.');
  const W = 320;
  const H = height;
  const pad = { l: 8, r: 8, t: 12, b: 18 };
  const vals = points.map((p) => p.rating);
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  const span = Math.max(60, max - min);
  min = Math.max(0, min - span * 0.15);
  max = max + span * 0.15;
  const x = (i) => pad.l + (points.length === 1 ? (W - pad.l - pad.r) / 2 : (i / (points.length - 1)) * (W - pad.l - pad.r));
  const y = (v) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.rating).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${H - pad.b} L${x(0).toFixed(1)},${H - pad.b} Z`;
  const guides = thresholds
    .filter((t) => t.min > min && t.min < max)
    .map((t) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(t.min).toFixed(1)}" y2="${y(t.min).toFixed(1)}" stroke="rgba(255,255,255,.12)" stroke-dasharray="3 4"/><text x="${W - pad.r}" y="${(y(t.min) - 3).toFixed(1)}" text-anchor="end" font-size="9" fill="rgba(255,255,255,.45)">${esc(t.name)}</text>`)
    .join('');
  const last = points[points.length - 1];
  const svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="chart-svg" role="img" aria-label="Rating history">
    <defs><linearGradient id="rcg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".35"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
    ${guides}
    <path d="${area}" fill="url(#rcg)"/>
    <path d="${line}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    <circle cx="${x(points.length - 1)}" cy="${y(last.rating)}" r="3.5" fill="currentColor"/>
    <text x="${pad.l}" y="${H - 4}" font-size="9" fill="rgba(255,255,255,.45)">${esc(fmtDay(points[0].day))}</text>
    <text x="${W - pad.r}" y="${H - 4}" font-size="9" text-anchor="end" fill="rgba(255,255,255,.45)">${esc(fmtDay(last.day))}</text>
  </svg>`;
  return h('div.chart', { style: { color }, html: svg });
}

/**
 * GitHub-style heatmap. cellFn(dayKey) → 0..1 intensity, or null for "not scheduled", -1 for future.
 */
export function heatmap(endDay, weeks, cellFn, color = 'var(--accent)') {
  // Columns are weeks (Sunday-first rows); the last column holds endDay.
  const firstSunday = addDays(endDay, -weekday(endDay) - (weeks - 1) * 7);
  const cells = [];
  for (let wk = 0; wk < weeks; wk++) {
    for (let d = 0; d < 7; d++) {
      const k = addDays(firstSunday, wk * 7 + d);
      const v = k > endDay ? -1 : cellFn(k);
      let style = '';
      let cls = 'hm-cell';
      if (v === -1) cls += ' hm-future';
      else if (v === null) cls += ' hm-off';
      else if (v <= 0) cls += ' hm-zero';
      else style = `opacity:${(0.35 + 0.65 * Math.min(1, v)).toFixed(2)}`;
      cells.push(`<div class="${cls}" style="grid-column:${wk + 1};grid-row:${d + 1};${style}" title="${k}"></div>`);
    }
  }
  return h('div.heatmap', { style: { '--c': color, gridTemplateColumns: `repeat(${weeks}, 1fr)` }, html: cells.join('') });
}

/** Simple vertical bars. items: [{label, value, color}] */
export function barChart(items, { max = null, height = 110, unit = '' } = {}) {
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  return h(
    'div.bars',
    { style: { height: height + 'px' } },
    items.map((it) =>
      h(
        'div.bar-col',
        { title: `${it.label}: ${Math.round(it.value)}${unit}` },
        h('div.bar-track', h('div.bar-fill', { style: { height: `${Math.min(100, (it.value / top) * 100)}%`, background: it.color || 'var(--accent)' } })),
        h('div.bar-label', it.label)
      )
    )
  );
}

// ---------- Muscle map ----------

export const MUSCLE_TIERS = [
  { min: 1, name: 'Beginner', color: '#f5c400' },
  { min: 3, name: 'Intermediate', color: '#ff8a1f' },
  { min: 6, name: 'Experienced', color: '#2fbf4a' },
  { min: 9, name: 'Advanced', color: '#b04be0' },
  { min: 13, name: 'Elite', color: '#3b8bff' },
  { min: 17, name: 'Champion', color: '#e0313f' },
];

export function muscleColor(sets) {
  let c = null;
  for (const t of MUSCLE_TIERS) if (sets >= t.min) c = t.color;
  return c || '#3a3d63';
}

const FRONT = {
  shoulders: ['<ellipse cx="34" cy="51" rx="10" ry="9"/>', '<ellipse cx="86" cy="51" rx="10" ry="9"/>'],
  chest: ['<rect x="38" y="44" width="21.5" height="20" rx="7"/>', '<rect x="60.5" y="44" width="21.5" height="20" rx="7"/>'],
  biceps: ['<rect x="22" y="59" width="12" height="25" rx="6"/>', '<rect x="86" y="59" width="12" height="25" rx="6"/>'],
  forearms: ['<rect x="17" y="86" width="11" height="28" rx="5.5"/>', '<rect x="92" y="86" width="11" height="28" rx="5.5"/>'],
  abs: ['<rect x="47.5" y="66" width="25" height="36" rx="7"/>'],
  obliques: ['<rect x="38.5" y="67" width="8" height="31" rx="4"/>', '<rect x="73.5" y="67" width="8" height="31" rx="4"/>'],
  quads: ['<rect x="40" y="112" width="18.5" height="54" rx="9"/>', '<rect x="61.5" y="112" width="18.5" height="54" rx="9"/>'],
  calves: ['<rect x="42" y="172" width="14" height="44" rx="7"/>', '<rect x="64" y="172" width="14" height="44" rx="7"/>'],
};
const BACK = {
  traps: ['<path d="M46 38 H74 L68 56 H52 Z"/>'],
  shoulders: ['<ellipse cx="34" cy="51" rx="10" ry="9"/>', '<ellipse cx="86" cy="51" rx="10" ry="9"/>'],
  back: ['<path d="M39 50 H58.5 V91 H47 Z"/>', '<path d="M61.5 50 H81 L73 91 H61.5 Z"/>'],
  triceps: ['<rect x="22" y="59" width="12" height="25" rx="6"/>', '<rect x="86" y="59" width="12" height="25" rx="6"/>'],
  forearms: ['<rect x="17" y="86" width="11" height="28" rx="5.5"/>', '<rect x="92" y="86" width="11" height="28" rx="5.5"/>'],
  lowerback: ['<rect x="48" y="92" width="24" height="12" rx="5"/>'],
  glutes: ['<ellipse cx="50.5" cy="115" rx="10.5" ry="10"/>', '<ellipse cx="69.5" cy="115" rx="10.5" ry="10"/>'],
  hamstrings: ['<rect x="40" y="127" width="18.5" height="40" rx="9"/>', '<rect x="61.5" y="127" width="18.5" height="40" rx="9"/>'],
  calves: ['<rect x="42" y="172" width="14" height="44" rx="7"/>', '<rect x="64" y="172" width="14" height="44" rx="7"/>'],
};
const SKELETON = `<g fill="#1a1c3a" stroke="rgba(255,255,255,.08)">
  <circle cx="60" cy="20" r="13"/><rect x="54" y="31" width="12" height="10" rx="4"/>
  <rect x="34" y="40" width="52" height="66" rx="16"/><rect x="42" y="100" width="36" height="16" rx="8"/>
  <circle cx="22" cy="120" r="5.5"/><circle cx="98" cy="120" r="5.5"/>
  <rect x="44" y="164" width="10" height="10" rx="5"/><rect x="66" y="164" width="10" height="10" rx="5"/>
  <ellipse cx="49" cy="222" rx="8" ry="4"/><ellipse cx="71" cy="222" rx="8" ry="4"/></g>`;

function figure(map, sets, labelText) {
  const parts = Object.entries(map)
    .map(([m, shapes]) => `<g fill="${muscleColor(sets[m] || 0)}" stroke="rgba(0,0,0,.35)" stroke-width="1"><title>${m}: ${Math.round(sets[m] || 0)} sets</title>${shapes.join('')}</g>`)
    .join('');
  return `<svg viewBox="0 0 120 232" class="body-svg" role="img" aria-label="${labelText}">${SKELETON}${parts}</svg>`;
}

export function muscleMap(sets) {
  return h(
    'div.muscle-map',
    h('div.body-fig', { html: figure(FRONT, sets, 'Front muscles') }),
    h('div.body-fig', { html: figure(BACK, sets, 'Back muscles') })
  );
}

export function muscleLegend() {
  return h(
    'div.legend',
    MUSCLE_TIERS.map((t) => h('span.legend-chip', { style: { '--c': t.color } }, t.name))
  );
}
