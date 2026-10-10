// Grind: School · Trading · Business.

import { h, segmented, clear } from '../ui/dom.js';
import { topbar } from '../ui/common.js';
import { schoolTab } from './school.js';
import { tradingTab } from './trading.js';
import { businessTab } from './business.js';

let tab = 'school';

export function render(ctx) {
  if (ctx.query.tab && ['school', 'trading', 'business'].includes(ctx.query.tab)) tab = ctx.query.tab;
  const body = h('div.mt-16');
  const paint = () => {
    clear(body);
    body.appendChild(tab === 'school' ? schoolTab(ctx) : tab === 'trading' ? tradingTab(ctx) : businessTab(ctx));
  };
  paint();
  return h(
    'div.screen',
    topbar('Grind'),
    segmented(
      [
        { id: 'school', name: 'School', iconName: 'school' },
        { id: 'trading', name: 'Trading', iconName: 'chart' },
        { id: 'business', name: 'Business', iconName: 'briefcase' },
      ],
      tab,
      (v) => {
        tab = v;
        history.replaceState(null, '', `#/grind?tab=${v}`);
        paint();
      }
    ),
    body
  );
}
