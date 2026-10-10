// Optional PIN privacy screen. Note: this hides the app from casual snooping; it is not encryption.

import { store } from '../core/store.js';
import { sha256 } from '../core/util.js';
import { h, icon, clear } from '../ui/dom.js';

export const fullScreen = () => true;
export const isStatic = () => true;

export function render() {
  let entered = '';
  const dots = h('div.pin-dots');
  const msg = h('p.small.muted', 'Enter your PIN');
  const paintDots = () => {
    clear(dots);
    for (let i = 0; i < 4; i++) dots.appendChild(h('span.pin-dot' + (i < entered.length ? '.on' : '')));
  };
  paintDots();
  const press = async (k) => {
    if (k === 'del') entered = entered.slice(0, -1);
    else if (entered.length < 4) entered += k;
    paintDots();
    if (entered.length === 4) {
      const hash = await sha256('lockstep:' + entered);
      if (hash === store.state.settings.pinHash) {
        const m = await import('../main.js');
        m.unlock();
      } else {
        msg.textContent = 'Wrong PIN. Try again.';
        msg.classList.add('red');
        entered = '';
        setTimeout(paintDots, 250);
      }
    }
  };
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
  return h(
    'div.lock-screen',
    h('img', { src: './assets/icons/favicon.svg', width: 64, height: 64, alt: '' }),
    h('h1', 'Lockstep'),
    msg,
    dots,
    h(
      'div.pin-pad',
      keys.map((k) => (k === '' ? h('span') : h('button.pin-key', { type: 'button', 'aria-label': k === 'del' ? 'Delete' : k, onclick: () => press(k) }, k === 'del' ? icon('arrowLeft', 22) : k)))
    ),
    h('p.tiny.faint', 'Forgot your PIN? Clearing this site’s data in your browser settings removes the PIN and all data.')
  );
}
