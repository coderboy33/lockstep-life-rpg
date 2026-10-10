// Original rank emblems drawn as SVG (no third-party artwork).

import { MAJOR } from '../core/config.js';
import { h } from './dom.js';

let uidN = 0;

function star(cx, cy, r1, r2, n) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? r2 : r1;
    const a = (Math.PI * i) / n - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

function divisionBars(div, c1) {
  if (!div) return '';
  let s = '';
  for (let i = 0; i < 3; i++) {
    const x = 35 + i * 11;
    s += `<rect x="${x}" y="88" width="8" height="5" rx="2.5" fill="${i < div ? c1 : 'rgba(255,255,255,0.18)'}"/>`;
  }
  return s;
}

export function emblemSvg(tier, size = 96) {
  const n = ++uidN;
  const major = tier ? tier.major : 'unranked';
  const m = MAJOR[major] || MAJOR.unranked;
  const { c1, c2 } = m;
  const g = `eg${n}`;
  const gl = `el${n}`;
  const defs = `<defs>
    <linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
    <linearGradient id="${gl}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset=".5" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <linearGradient id="u${n}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb3f0"/><stop offset=".35" stop-color="#c26bff"/><stop offset=".7" stop-color="#6d6bff"/><stop offset="1" stop-color="#4ee6ff"/></linearGradient>
  </defs>`;
  let body = '';
  const div = tier ? tier.div : 0;
  switch (major) {
    case 'bronze':
    case 'silver':
    case 'gold': {
      const shield = 'M50 5 L87 18 V48 C87 70 71 84 50 93 C29 84 13 70 13 48 V18 Z';
      const chevrons = [];
      const count = Math.max(1, div);
      for (let i = 0; i < count; i++) {
        const y = 54 - (count - 1) * 7 + i * 14;
        chevrons.push(`<polygon points="30,${y} 50,${y - 12} 70,${y} 70,${y + 8} 50,${y - 4} 30,${y + 8}" fill="#fff" fill-opacity=".9"/>`);
      }
      body = `<path d="${shield}" fill="url(#${g})" stroke="${c1}" stroke-width="2"/>
        <path d="M50 14 L78 24 V48 C78 65 66 76 50 83 C34 76 22 65 22 48 V24 Z" fill="${c2}" fill-opacity=".55"/>
        <path d="${shield}" fill="url(#${gl})" opacity=".55"/>
        ${chevrons.join('')}`;
      break;
    }
    case 'platinum':
      body = `<polygon points="50,4 89,27 89,71 50,94 11,71 11,27" fill="url(#${g})" stroke="${c1}" stroke-width="2"/>
        <polygon points="50,22 72,35 72,61 50,74 28,61 28,35" fill="${c2}" fill-opacity=".45" stroke="#fff" stroke-opacity=".5" stroke-width="1.5"/>
        <path d="M50 4 V22 M89 27 L72 35 M89 71 L72 61 M50 94 V74 M11 71 L28 61 M11 27 L28 35" stroke="#fff" stroke-opacity=".45" stroke-width="1.5"/>
        <polygon points="50,4 89,27 50,22 11,27" fill="#fff" fill-opacity=".25"/>
        <polygon points="50,32 62,40 50,60 38,40" fill="#fff" fill-opacity=".85"/>`;
      break;
    case 'diamond':
      body = `<path d="M27 12 H73 L93 36 L50 92 L7 36 Z" fill="url(#${g})" stroke="${c1}" stroke-width="2"/>
        <path d="M27 12 L37 36 L50 12 L63 36 L73 12 M7 36 H93 M37 36 L50 92 L63 36" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.5"/>
        <polygon points="27,12 50,12 37,36 7,36" fill="#fff" fill-opacity=".3"/>
        <polygon points="50,12 73,12 63,36 37,36" fill="#fff" fill-opacity=".12"/>
        <polygon points="37,36 50,92 7,36" fill="#000" fill-opacity=".12"/>`;
      break;
    case 'elite':
      body = `<g fill="url(#${g})" stroke="${c1}" stroke-width="1.5">
          <polygon points="30,30 4,22 10,36 28,42"/><polygon points="29,46 2,42 9,55 28,56"/><polygon points="30,60 6,62 14,72 32,68"/>
          <polygon points="70,30 96,22 90,36 72,42"/><polygon points="71,46 98,42 91,55 72,56"/><polygon points="70,60 94,62 86,72 68,68"/>
        </g>
        <path d="M33 14 H67 L82 34 L50 90 L18 34 Z" fill="url(#${g})" stroke="#fff" stroke-opacity=".8" stroke-width="2"/>
        <path d="M33 14 L41 34 L50 14 L59 34 L67 14 M18 34 H82 M41 34 L50 90 L59 34" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="1.4"/>
        <polygon points="33,14 50,14 41,34 18,34" fill="#fff" fill-opacity=".35"/>`;
      break;
    case 'champion':
      body = `<path d="M22 34 L28 10 L40 24 L50 4 L60 24 L72 10 L78 34 Z" fill="url(#${g})" stroke="${c1}" stroke-width="2" stroke-linejoin="round"/>
        <circle cx="28" cy="10" r="3.5" fill="#fff"/><circle cx="50" cy="4.5" r="3.5" fill="#fff"/><circle cx="72" cy="10" r="3.5" fill="#fff"/>
        <polygon points="50,36 82,52 76,80 50,96 24,80 18,52" fill="url(#${g})" stroke="${c1}" stroke-width="2"/>
        <polygon points="50,46 68,56 64,76 50,85 36,76 32,56" fill="#fff" fill-opacity=".25" stroke="#fff" stroke-opacity=".6" stroke-width="1.5"/>
        <polygon points="50,52 58,62 50,76 42,62" fill="#fff" fill-opacity=".9"/>`;
      break;
    case 'unreal':
      body = `<circle cx="50" cy="50" r="46" fill="none" stroke="url(#u${n})" stroke-width="2.5" stroke-opacity=".9"/>
        <circle cx="50" cy="50" r="40" fill="none" stroke="url(#u${n})" stroke-width="1" stroke-opacity=".5"/>
        <polygon points="${star(50, 50, 44, 18, 8)}" fill="url(#u${n})" stroke="#fff" stroke-opacity=".7" stroke-width="1.5"/>
        <polygon points="${star(50, 50, 26, 12, 4)}" fill="#fff" fill-opacity=".35"/>
        <polygon points="50,34 62,50 50,66 38,50" fill="#fff" fill-opacity=".95"/>`;
      break;
    default:
      body = `<polygon points="50,6 88,28 88,72 50,94 12,72 12,28" fill="rgba(255,255,255,0.04)" stroke="${c1}" stroke-width="2.5" stroke-dasharray="6 5"/>
        <text x="50" y="62" text-anchor="middle" font-family="system-ui, sans-serif" font-size="34" font-weight="800" fill="${c1}">?</text>`;
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">${defs}${body}${major === 'platinum' || major === 'diamond' ? divisionBars(div, '#fff') : ''}</svg>`;
}

export function emblem(tier, size = 96, opts = {}) {
  const major = tier ? tier.major : 'unranked';
  const m = MAJOR[major] || MAJOR.unranked;
  return h('div.emblem' + (opts.animate ? '.emblem-anim' : '') + `.em-${major}`, {
    style: { '--glow': m.c1, width: size + 'px', height: size + 'px' },
    html: emblemSvg(tier, size),
    role: 'img',
    'aria-label': tier ? tier.name : 'Unranked',
  });
}

export function majorColor(major) {
  return (MAJOR[major] || MAJOR.unranked).c1;
}
