// Formatting and tiny DOM helpers.
const nf = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 });

export const naira = (n) => `₦${nf.format(Math.round(n || 0))}`;

export const deviceName = (d) => [d.model, d.storage, d.condition === 'Deal' ? 'Deal' : d.condition].filter(Boolean).join(' · ');

export const variantName = (d) => [d.storage, d.condition].filter(Boolean).join(' · ');

export function updatedLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `Updated ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' })}`;
}

export function dateLabel(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** Tagged template that escapes interpolations unless wrapped with raw(). */
export function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => {
    out += render(v) + strings[i + 1];
  });
  return new Raw(out);
}
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(s);
function render(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(render).join('');
  return esc(v);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
