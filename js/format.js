// Formatting and tiny DOM helpers.
const nf = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 });

export const naira = (n) => `₦${nf.format(Math.round(n || 0))}`;
/** A breakdown line: a deduction (− ₦), an addition (+ ₦, stored as a negative), or checked in store. */
export const lineAmount = (n) => (n === null || n === undefined ? 'Checked in store' : n < 0 ? `+ ${naira(-n)}` : `− ${naira(n)}`);
/** Lighter figures for quotes: ₦ 470K, ₦ 1.785M (the full figure if it isn't whole thousands). */
export const nairaK = (n) => {
  const v = Math.round(n || 0);
  if (!v) return '₦ 0';
  if (v % 100) return naira(v);
  if (v >= 1e6 && v % 1000 === 0) return `₦ ${(v / 1e6).toFixed(3).replace(/\.?0+$/, '')}M`;
  return `₦ ${String(v / 1000)}K`; // ₦ 24.5K, ₦ 104.3K
};
export const lineAmountK = (n) => (n === null || n === undefined ? 'Checked in store' : n < 0 ? `+ ${nairaK(-n)}` : `− ${nairaK(n)}`);
/** "Value for Your Phone": the device word from its type, or guessed from its name. */
export const deviceWord = (typeOrName = '') => {
  const t = String(typeOrName);
  const byType = { Phones: 'Phone', Tablets: 'Tablet', Watches: 'Watch', AirPods: 'AirPods', Speakers: 'Speaker', Games: 'Console', Laptops: 'Laptop' };
  if (byType[t]) return byType[t];
  if (/watch/i.test(t)) return 'Watch';
  if (/ipad|\btab\b/i.test(t)) return 'Tablet';
  if (/airpods|buds/i.test(t)) return 'AirPods';
  if (/playstation|xbox|nintendo|switch/i.test(t)) return 'Console';
  if (/jbl|speaker|harman|boombox|charge|flip/i.test(t)) return 'Speaker';
  if (/macbook|laptop/i.test(t)) return 'Laptop';
  return 'Phone';
};



// LLA / Non LLA isn't shown on the site: "(Non LLA)" is folded into its condition.
export const conditionLabel = (c = '') => c.replace(/ \(Non LLA\)$/, '');
export const variantName = (d) => [d.storage, conditionLabel(d.condition)].filter(Boolean).join(' · ');

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

export const deviceName = (d) => (d.condition === 'Deal' ? [d.model, d.storage, 'Deal'].join(' · ') : [d.model, variantName(d)].filter(Boolean).join(' · '));
