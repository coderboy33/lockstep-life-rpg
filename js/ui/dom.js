// Tiny DOM toolkit: h() builds elements; the rest are reusable UI components.
// User-provided text is always inserted as text nodes (never as HTML).

import { iconSvg } from './icons.js';
import { catOf, DIFFICULTIES } from '../core/config.js';
import { WD_LETTER } from '../core/dates.js';

export function h(tag, props, ...children) {
  const parts = tag.split('.');
  const el = document.createElement(parts[0] || 'div');
  if (parts.length > 1) el.className = parts.slice(1).join(' ');
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
    children.unshift(props);
    props = null;
  }
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = (el.className ? el.className + ' ' : '') + v;
      else if (k === 'style') {
        if (typeof v === 'string') el.style.cssText = v;
        else for (const [sk, sv] of Object.entries(v)) sk.startsWith('--') ? el.style.setProperty(sk, sv) : (el.style[sk] = sv);
      } else if (k === 'html') el.innerHTML = v; // trusted, static markup only (icons/SVG)
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else if (k === 'ref' && typeof v === 'function') v(el);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false || c === '') continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Like el.append(...) but skips null/false (native append would print "null"). */
export function put(el, ...children) {
  return append(el, children);
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function icon(name, size = 20, cls = '') {
  return h('span.icon' + (cls ? '.' + cls : ''), { html: iconSvg(name, size), 'aria-hidden': 'true' });
}

export function haptic(ms = 12) {
  try {
    if (document.documentElement.dataset.haptics !== 'off' && navigator.vibrate) navigator.vibrate(ms);
  } catch {
    /* not supported (iOS) */
  }
}

// ---------- buttons ----------

export function btn(label, onClick, opts = {}) {
  const { variant = 'primary', iconName, size = '', block = false, disabled = false, type = 'button', title } = opts;
  const cls = ['btn', `btn-${variant}`, size && `btn-${size}`, block && 'btn-block'].filter(Boolean).join('.');
  return h(
    'button.' + cls,
    {
      type,
      disabled,
      title,
      'aria-label': title || (typeof label === 'string' ? label : undefined),
      onclick: (e) => {
        if (disabled) return;
        haptic();
        onClick && onClick(e);
      },
    },
    iconName ? icon(iconName, size === 'sm' ? 16 : 18) : null,
    label ? h('span', label) : null
  );
}

export function iconBtn(name, onClick, opts = {}) {
  return h(
    'button.icon-btn' + (opts.cls ? '.' + opts.cls : ''),
    { type: 'button', 'aria-label': opts.label || name, title: opts.label || name, onclick: (e) => (haptic(), onClick && onClick(e)) },
    icon(name, opts.size || 20)
  );
}

// ---------- display ----------

export function pill(text, opts = {}) {
  const { color, glow = false, solid = false, iconName, cls = '' } = opts;
  return h(
    'span.pill' + (glow ? '.pill-glow' : '') + (solid ? '.pill-solid' : '') + (cls ? '.' + cls : ''),
    { style: color ? { '--c': color } : null },
    iconName ? icon(iconName, 13) : null,
    text
  );
}

export function catPill(catId, short = true) {
  const c = catOf(catId);
  return pill(short ? c.short : c.name, { color: c.color, iconName: c.icon });
}

export function diffPill(diffId) {
  const d = DIFFICULTIES.find((x) => x.id === diffId) || DIFFICULTIES[1];
  return pill(d.name, { color: d.color });
}

export function progressBar(pctv, opts = {}) {
  const { color, thick = false, glow = false, label } = opts;
  const p = Math.max(0, Math.min(1, Number(pctv) || 0));
  return h(
    'div.progress' + (thick ? '.thick' : '') + (glow ? '.glow' : ''),
    { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(p * 100), 'aria-label': label, style: color ? { '--c': color } : null },
    h('div.progress-fill', { style: { width: `${p * 100}%` } })
  );
}

export function ring(pctv, opts = {}) {
  const { size = 120, stroke = 10, color = 'var(--accent)', track = 'rgba(255,255,255,0.08)', children, dashed = false, cls = '' } = opts;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, Number(pctv) || 0));
  const svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${track}" stroke-width="${stroke}" ${dashed ? `stroke-dasharray="2 ${(c / 28).toFixed(2)}"` : ''}/>
    <circle class="ring-fill" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"
      stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - p)).toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
  </svg>`;
  return h('div.ring' + (cls ? '.' + cls : ''), { style: { width: size + 'px', height: size + 'px' } }, h('div.ring-svg', { html: svg }), h('div.ring-center', children));
}

export function sectionHead(title, right = null, opts = {}) {
  return h('div.section-head' + (opts.cls ? '.' + opts.cls : ''), h('h2.section-title', title), right);
}

export function label(text) {
  return h('div.eyebrow', text);
}

export function card(children, opts = {}) {
  const { cls = '', onClick, style } = opts;
  return h('div.card' + (cls ? '.' + cls : '') + (onClick ? '.tappable' : ''), { onclick: onClick, style, role: onClick ? 'button' : undefined, tabindex: onClick ? 0 : undefined }, children);
}

export function empty(iconName, title, text, action = null) {
  return h('div.empty', h('div.empty-icon', icon(iconName, 26)), h('div.empty-title', title), text ? h('div.empty-text', text) : null, action);
}

export function stat(value, labelText, opts = {}) {
  return h('div.stat' + (opts.cls ? '.' + opts.cls : ''), h('div.stat-value', { style: opts.color ? { color: opts.color } : null }, value), h('div.stat-label', labelText));
}

export function listItem({ iconName, iconColor, title, sub, right, onClick, chevron = !!onClick, cls = '' }) {
  return h(
    'div.list-item' + (onClick ? '.tappable' : '') + (cls ? '.' + cls : ''),
    { onclick: onClick, role: onClick ? 'button' : undefined, tabindex: onClick ? 0 : undefined },
    iconName ? h('div.li-icon', { style: iconColor ? { '--c': iconColor } : null }, icon(iconName, 18)) : null,
    h('div.li-body', h('div.li-title', title), sub ? h('div.li-sub', sub) : null),
    right,
    chevron ? icon('chevronRight', 18, 'li-chev') : null
  );
}

export function badge(text, color) {
  return h('span.badge', { style: color ? { '--c': color } : null }, text);
}

// ---------- form controls ----------

export function field(labelText, control, hint = null) {
  return h('label.field', h('span.field-label', labelText), control, hint ? h('span.field-hint', hint) : null);
}

export function input(props = {}) {
  return h('input.input', { type: 'text', autocomplete: 'off', ...props });
}

export function textarea(props = {}) {
  return h('textarea.input.textarea', { rows: 3, ...props });
}

export function select(options, value, onChange, props = {}) {
  return h(
    'select.input.select',
    { onchange: (e) => onChange && onChange(e.target.value), ...props },
    options.map((o) => h('option', { value: o.id ?? o.value, selected: String(o.id ?? o.value) === String(value) }, o.name ?? o.label))
  );
}

export function segmented(options, value, onChange, opts = {}) {
  const wrap = h('div.seg' + (opts.small ? '.seg-sm' : ''), { role: 'tablist' });
  for (const o of options) {
    const b = h(
      'button.seg-btn' + (o.id === value ? '.on' : ''),
      {
        type: 'button',
        role: 'tab',
        'aria-selected': o.id === value ? 'true' : 'false',
        onclick: () => {
          haptic(8);
          for (const x of wrap.children) x.classList.remove('on');
          b.classList.add('on');
          onChange(o.id);
        },
      },
      o.iconName ? icon(o.iconName, 15) : null,
      o.name
    );
    wrap.appendChild(b);
  }
  return wrap;
}

/** Chip selector. multi=true → values is an array. */
export function chips(options, values, onChange, opts = {}) {
  const { multi = true, wrapCls = '' } = opts;
  let cur = multi ? [...(values || [])] : values;
  const wrap = h('div.chips' + (wrapCls ? '.' + wrapCls : ''));
  const render = () => {
    clear(wrap);
    for (const o of options) {
      const on = multi ? cur.includes(o.id) : cur === o.id;
      wrap.appendChild(
        h(
          'button.chip' + (on ? '.on' : ''),
          {
            type: 'button',
            'aria-pressed': on ? 'true' : 'false',
            style: o.color ? { '--c': o.color } : null,
            onclick: () => {
              haptic(8);
              if (multi) cur = on ? cur.filter((x) => x !== o.id) : [...cur, o.id];
              else cur = o.id;
              render();
              onChange(multi ? [...cur] : cur);
            },
          },
          o.iconName ? icon(o.iconName, 14) : null,
          o.name
        )
      );
    }
  };
  render();
  return wrap;
}

export function dayPicker(days, onChange) {
  let cur = [...(days || [])];
  const wrap = h('div.daypicker');
  const render = () => {
    clear(wrap);
    // Monday-first for readability.
    for (const d of [1, 2, 3, 4, 5, 6, 0]) {
      const on = cur.includes(d);
      wrap.appendChild(
        h(
          'button.day' + (on ? '.on' : ''),
          {
            type: 'button',
            'aria-pressed': on ? 'true' : 'false',
            'aria-label': ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d],
            onclick: () => {
              haptic(8);
              cur = on ? cur.filter((x) => x !== d) : [...cur, d].sort();
              render();
              onChange([...cur]);
            },
          },
          WD_LETTER[d]
        )
      );
    }
  };
  render();
  return wrap;
}

export function toggle(checked, onChange, labelText = '') {
  const inp = h('input', { type: 'checkbox', checked, onchange: (e) => (haptic(8), onChange(e.target.checked)), 'aria-label': labelText || 'Toggle' });
  return h('label.switch', inp, h('span.switch-track', h('span.switch-thumb')));
}

export function toggleRow(title, sub, checked, onChange) {
  return h('div.toggle-row', h('div.li-body', h('div.li-title', title), sub ? h('div.li-sub', sub) : null), toggle(checked, onChange, title));
}

export function stepper(value, opts = {}) {
  const { min = 0, max = 999, step = 1, onChange, suffix = '', big = false } = opts;
  let v = value;
  const out = h('span.stepper-val', `${v}${suffix}`);
  const set = (nv) => {
    v = Math.max(min, Math.min(max, nv));
    out.textContent = `${v}${suffix}`;
    onChange && onChange(v);
  };
  return h(
    'div.stepper' + (big ? '.stepper-big' : ''),
    h('button.stepper-btn', { type: 'button', 'aria-label': 'Decrease', onclick: () => (haptic(8), set(v - step)) }, icon('minus', 18)),
    out,
    h('button.stepper-btn', { type: 'button', 'aria-label': 'Increase', onclick: () => (haptic(8), set(v + step)) }, icon('plus', 18))
  );
}

export function timeInput(value, onChange) {
  return h('input.input.time-input', { type: 'time', value: value || '', onchange: (e) => onChange(e.target.value || null) });
}

export function dateInput(value, onChange, props = {}) {
  return h('input.input', { type: 'date', value: value || '', onchange: (e) => onChange(e.target.value || null), ...props });
}

export function numInput(value, onChange, props = {}) {
  return h('input.input', { type: 'number', inputmode: 'decimal', value: value ?? '', oninput: (e) => onChange(e.target.value), ...props });
}

/** A list of short strings the user can add to / remove from. */
export function tagEditor(values, onChange, placeholder = 'Add…') {
  let cur = [...(values || [])];
  const wrap = h('div.tag-editor');
  const list = h('div.chips');
  const inp = input({ placeholder, enterkeyhint: 'done' });
  const add = () => {
    const v = inp.value.trim().slice(0, 80);
    if (!v || cur.includes(v)) return;
    cur.push(v);
    inp.value = '';
    render();
    onChange([...cur]);
  };
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      add();
    }
  });
  const render = () => {
    clear(list);
    for (const v of cur)
      list.appendChild(
        h(
          'span.chip.on.chip-removable',
          v,
          h('button.chip-x', { type: 'button', 'aria-label': `Remove ${v}`, onclick: () => ((cur = cur.filter((x) => x !== v)), render(), onChange([...cur])) }, icon('x', 12))
        )
      );
  };
  render();
  wrap.append(list, h('div.row.gap-8', inp, btn('Add', add, { variant: 'ghost', size: 'sm' })));
  return wrap;
}
