// Bottom sheets, dialogs, toasts and reward pop-ups.

import { h, icon, btn, clear, haptic } from './dom.js';

const root = () => document.getElementById('overlay-root');
const stack = [];

/**
 * Opens a bottom sheet (centered modal on wide screens).
 * render(close) must return a Node. Returns { close, el, rerender }.
 */
export function openSheet({ title, render, onClose, size = '', dismissable = true, cls = '' }) {
  const body = h('div.sheet-body');
  const sheet = h(
    'div.sheet' + (size ? '.sheet-' + size : '') + (cls ? '.' + cls : ''),
    { role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Dialog' },
    h('div.sheet-grab', { 'aria-hidden': 'true' }),
    title || dismissable
      ? h(
          'div.sheet-head',
          h('h3.sheet-title', title || ''),
          dismissable ? h('button.icon-btn.sheet-close', { type: 'button', 'aria-label': 'Close', onclick: () => close() }, icon('x', 20)) : null
        )
      : null,
    body
  );
  const backdrop = h('div.sheet-backdrop', { onclick: (e) => e.target === backdrop && dismissable && close() }, sheet);
  let closed = false;
  const entry = { close: () => close(), dismissable };
  function close(result) {
    if (closed) return;
    closed = true;
    backdrop.classList.add('closing');
    const i = stack.indexOf(entry);
    if (i >= 0) stack.splice(i, 1);
    setTimeout(() => backdrop.remove(), 220);
    if (!stack.length) document.body.classList.remove('has-sheet');
    onClose && onClose(result);
  }
  const rerender = () => {
    const st = body.scrollTop;
    clear(body);
    body.appendChild(render(close, rerender));
    body.scrollTop = st;
  };
  rerender();
  // Swipe down on the grab handle / header to dismiss.
  if (dismissable) {
    let y0 = null;
    const head = sheet.querySelector('.sheet-head') || sheet.querySelector('.sheet-grab');
    const start = (e) => (y0 = e.touches ? e.touches[0].clientY : null);
    const move = (e) => {
      if (y0 === null) return;
      const dy = e.touches[0].clientY - y0;
      if (dy > 0) sheet.style.transform = `translateY(${dy}px)`;
    };
    const end = (e) => {
      if (y0 === null) return;
      const dy = (e.changedTouches ? e.changedTouches[0].clientY : y0) - y0;
      sheet.style.transform = '';
      y0 = null;
      if (dy > 90) close();
    };
    for (const el of [sheet.querySelector('.sheet-grab'), head]) {
      if (!el) continue;
      el.addEventListener('touchstart', start, { passive: true });
      el.addEventListener('touchmove', move, { passive: true });
      el.addEventListener('touchend', end);
    }
  }
  root().appendChild(backdrop);
  document.body.classList.add('has-sheet');
  stack.push(entry);
  requestAnimationFrame(() => backdrop.classList.add('open'));
  setTimeout(() => {
    const f = sheet.querySelector('[autofocus]');
    if (f) f.focus();
  }, 250);
  return { close, el: sheet, rerender };
}

export function closeTopSheet() {
  const top = stack[stack.length - 1];
  if (top && top.dismissable) {
    top.close();
    return true;
  }
  return false;
}

export function closeAllSheets() {
  for (const e of [...stack]) e.close();
}

export const hasOpenSheet = () => stack.length > 0;

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeTopSheet();
});

export function confirmDialog({ title, message, okText = 'Confirm', cancelText = 'Cancel', danger = false, requireText = '' }) {
  return new Promise((resolve) => {
    let typed = '';
    openSheet({
      title,
      size: 'sm',
      onClose: (r) => resolve(!!r),
      render: (close) => {
        const ok = btn(okText, () => close(true), { variant: danger ? 'danger' : 'primary', block: true, disabled: !!requireText });
        return h(
          'div.stack-12',
          message ? h('p.muted', message) : null,
          requireText
            ? h('input.input', {
                placeholder: `Type ${requireText} to confirm`,
                autocapitalize: 'characters',
                oninput: (e) => {
                  typed = e.target.value.trim();
                  ok.disabled = typed !== requireText;
                },
              })
            : null,
          h('div.stack-8', ok, btn(cancelText, () => close(false), { variant: 'ghost', block: true }))
        );
      },
    });
  });
}

export function promptDialog({ title, labelText = '', value = '', placeholder = '', okText = 'Save', type = 'text', multiline = false }) {
  return new Promise((resolve) => {
    openSheet({
      title,
      size: 'sm',
      onClose: (r) => resolve(r ?? null),
      render: (close) => {
        const inp = h(multiline ? 'textarea.input.textarea' : 'input.input', { type, value, placeholder, autofocus: true, rows: 4 });
        if (!multiline) inp.addEventListener('keydown', (e) => e.key === 'Enter' && close(inp.value));
        return h('div.stack-12', labelText ? h('div.field-label', labelText) : null, inp, btn(okText, () => close(inp.value), { block: true }));
      },
    });
  });
}

let toastTimer = null;
export function toast(message, opts = {}) {
  const { type = 'info', duration = 2600, action } = opts;
  const host = document.getElementById('toast-root');
  clear(host);
  const t = h(
    'div.toast.toast-' + type,
    { role: 'status', 'aria-live': 'polite' },
    icon(type === 'error' ? 'alert' : type === 'success' ? 'check' : 'info', 18),
    h('span.toast-msg', message),
    action ? h('button.toast-action', { type: 'button', onclick: () => (action.onClick(), t.remove()) }, action.label) : null
  );
  host.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, action ? Math.max(duration, 5000) : duration);
}

/** Floating reward chip: +XP / SR. */
export function rewardPop({ xp = 0, sr = 0, match = 0, note = '' }) {
  haptic(20);
  const host = document.getElementById('toast-root');
  const el = h(
    'div.reward-pop',
    xp ? h('span.rp-xp', `+${xp} XP`) : null,
    sr ? h('span.rp-sr', `+${sr} SR`) : null,
    match ? h('span.rp-match', `Match +${match} SR`) : null,
    note ? h('span.rp-note', note) : null
  );
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 400);
  }, 2200);
}

/** Full-screen moment for promotions, demotions, placement and achievements. */
export function celebrate({ kicker, title, sub, visual, cta = 'Continue', tone = 'up', details = null }) {
  return new Promise((resolve) => {
    const host = root();
    const el = h(
      'div.celebrate.tone-' + tone,
      { role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div.celebrate-rays', { 'aria-hidden': 'true' }),
      h(
        'div.celebrate-inner',
        h('div.eyebrow', kicker),
        visual ? h('div.celebrate-visual', visual) : null,
        h('h1.celebrate-title', title),
        sub ? h('p.celebrate-sub', sub) : null,
        details,
        btn(cta, () => close(), { block: true, variant: tone === 'down' ? 'ghost' : 'primary' })
      )
    );
    function close() {
      el.classList.remove('open');
      setTimeout(() => el.remove(), 300);
      resolve();
    }
    host.appendChild(el);
    haptic(40);
    requestAnimationFrame(() => el.classList.add('open'));
  });
}
