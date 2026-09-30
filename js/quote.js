// Quotes: build, encode to a link, decode, share and hand off to WhatsApp.
import { CONFIG } from './config.js';
import { NEATNESS, NETWORK, FAULTS } from './engine.js';
import { naira, deviceName } from './format.js';
import { saveQuoteRemote } from './data.js';

export function buildQuote({ device, answers, result, compare, city }) {
  return {
    v: 1,
    created: new Date().toISOString(),
    device: device ? { id: device.id, name: deviceName(device), start: result?.start || 0 } : null,
    answers: device ? { ...answers, faults: [...(answers.faults || [])] } : null,
    value: result?.accepted ? result.value : 0,
    lines: result?.accepted ? result.lines.map((l) => [l.label, l.amount]) : [],
    compare: compare.map(({ device: d, terms }) => ({
      id: d.id, name: deviceName(d), price: d.price, kind: terms.kind, amount: terms.amount, dealNote: d.dealNote || '',
    })),
    city: city || '',
  };
}

// ---- self-contained link (?s=) ----

const b64u = {
  enc(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  dec(s) {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  },
};

// Short keys keep the fallback link small enough for WhatsApp.
export function encodeQuote(q) {
  const a = q.answers;
  const packed = [
    1, q.created, q.device ? [q.device.id, q.device.name, q.device.start] : 0,
    a ? [a.icloudLocked ? 1 : 0, a.battery ?? '', a.neatness || '', a.network || '', a.faults.join('.'), a.batteryLabel || ''] : 0,
    q.value, q.lines, q.compare.map((c) => [c.id, c.name, c.price, c.kind, c.amount, c.dealNote || '']), q.city || '',
  ];
  return b64u.enc(JSON.stringify(packed));
}

export function decodeQuote(s) {
  const p = JSON.parse(b64u.dec(s));
  if (p[0] !== 1) throw new Error('Unknown quote version');
  const [, created, dev, a, value, lines, compare, city] = p;
  return {
    v: 1, created,
    device: dev ? { id: dev[0], name: dev[1], start: dev[2] } : null,
    answers: a ? { icloudLocked: !!a[0], battery: a[1] === '' ? null : Number(a[1]), neatness: a[2], network: a[3], faults: a[4] ? a[4].split('.') : [], ...(a[5] ? { batteryLabel: a[5] } : {}) } : null,
    value, lines,
    compare: compare.map(([id, name, price, kind, amount, dealNote]) => ({ id, name, price, kind, amount, dealNote })),
    city,
  };
}

export function localLink(q) {
  return `${CONFIG.site}?s=${encodeQuote(q)}`;
}

/** Save to the sheet (short link); fall back to a self-contained link. */
export async function saveQuote(q, extra = {}) {
  try {
    const r = await saveQuoteRemote({ ...q, ...extra });
    return { id: r.id, link: r.link, saved: true };
  } catch {
    return { id: null, link: localLink(q), saved: false };
  }
}

// ---- text ----

export function termsText(c) {
  if (c.kind === 'add') return `you add ${naira(c.amount)}`;
  if (c.kind === 'receive') return `we pay you ${naira(c.amount)}`;
  if (c.kind === 'even') return 'even swap';
  return `${naira(c.price)}`;
}

export function answersText(a) {
  if (!a) return '';
  const bits = [];
  if (a.batteryLabel) bits.push(`battery ${a.batteryLabel}`);
  else if (a.battery !== null && a.battery !== undefined && a.battery !== '') bits.push(`battery ${a.battery}%`);
  const n = NEATNESS.find((x) => x.key === a.neatness);
  if (n) bits.push(n.label.toLowerCase());
  const net = NETWORK.find((x) => x.key === a.network);
  if (net) bits.push(net.label.toLowerCase());
  const f = (a.faults || []).map((k) => FAULTS.find((x) => x.key === k)?.label).filter(Boolean);
  bits.push(f.length ? `issues: ${f.join(', ').toLowerCase()}` : 'no issues');
  return bits.join(' · ');
}

export function summaryText(q, link) {
  const out = [];
  if (q.device) {
    out.push(`My device: ${q.device.name}`);
    const at = answersText(q.answers);
    if (at) out.push(at);
    out.push(`Trade-in value: ${naira(q.value)}`);
  }
  if (q.compare.length) {
    out.push('');
    out.push(q.device ? 'Swap options:' : 'Devices:');
    q.compare.forEach((c) => out.push(`• ${c.name}: ${q.device ? termsText(c) : naira(c.price)}`));
  }
  if (link) out.push('', link);
  return out.join('\n');
}

export function whatsappMessage(q, link, city) {
  const lines = ['Hi SwapDesk, I’d like to swap.', ''];
  lines.push(summaryText(q, ''));
  if (city) lines.push('', `City: ${city}`);
  lines.push('', `Full quote: ${link}`);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

export function whatsappURL(text) {
  return `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(text)}`;
}

export async function share({ title, text, url }) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
    }
  }
  await copy(url ? `${text}\n${url}` : text);
  return 'copied';
}

export async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function ageDays(q) {
  return (Date.now() - new Date(q.created).getTime()) / 86400000;
}
