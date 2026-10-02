// Quotes: build, encode to a link, decode, share and hand off to WhatsApp.
import { CONFIG } from './config.js';
import { NEATNESS, NETWORK, FAULTS, PADS, GAMES } from './engine.js';
import { naira, nairaK, deviceName } from './format.js';
import { saveQuoteRemote } from './data.js';

export function buildQuote({ device, answers, result, compare, city }) {
  return {
    v: 1,
    created: new Date().toISOString(),
    device: device ? { id: device.id, name: [device.model, device.storage].filter(Boolean).join(' · '), start: result?.start || 0 } : null,
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
    packAnswers(a),
    q.value, q.lines, q.compare.map((c) => [c.id, c.name, c.price, c.kind, c.amount, c.dealNote || '']), q.city || '',
    (q.items || []).map((it) => [it.id, it.name, it.start, it.value, packAnswers(it.answers), it.lines]),
  ];
  return b64u.enc(JSON.stringify(packed));
}

export function decodeQuote(s) {
  const p = JSON.parse(b64u.dec(s));
  if (p[0] !== 1) throw new Error('Unknown quote version');
  const [, created, dev, a, value, lines, compare, city, items] = p;
  return {
    v: 1, created,
    device: dev ? { id: dev[0], name: dev[1], start: dev[2] } : null,
    answers: unpackAnswers(a),
    value, lines,
    compare: compare.map(([id, name, price, kind, amount, dealNote]) => ({ id, name, price, kind, amount, dealNote })),
    city,
    ...(items && items.length ? { items: items.map(([id, name, start, v, ans, ls]) => ({ id, name, start, value: v, answers: unpackAnswers(ans), lines: ls })) } : {}),
  };
}
function packAnswers(a) {
  if (!a) return 0;
  const out = [a.icloudLocked ? 1 : 0, a.battery ?? '', a.neatness || '', a.network || '', (a.faults || []).join('.'), a.batteryLabel || ''];
  if (a.pads) out.push(a.pads, a.games || '', a.hacked ? 1 : 0); // consoles
  return out;
}
function unpackAnswers(a) {
  if (!a) return null;
  return { icloudLocked: !!a[0], battery: a[1] === '' ? null : Number(a[1]), neatness: a[2], network: a[3], faults: a[4] ? a[4].split('.') : [], ...(a[5] ? { batteryLabel: a[5] } : {}),
    ...(a[6] ? { pads: a[6], games: a[7] || '', hacked: !!a[8] } : {}) };
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
    // Never hand out the long ?s= link: the caller retries or tells the customer to try again.
    return { id: null, link: null, saved: false };
  }
}

// ---- text ----

export function termsText(c) {
  if (c.kind === 'add') return `${naira(c.amount)} to swap`;
  if (c.kind === 'receive') return `we pay you ${naira(c.amount)}`;
  if (c.kind === 'even') return 'even swap';
  return `${naira(c.price)}`;
}

/** Short naira for messages: ₦ 305K, ₦ 1.785M. Falls back to the full figure if it isn't whole thousands. */
export const nairaShort = nairaK;

export function answersText(a) {
  if (!a) return '';
  const bits = [];
  if (a.pads) {
    // Console
    bits.push(PADS.find((x) => x.key === a.pads)?.label || '');
    const g = GAMES.find((x) => x.key === a.games);
    if (g) bits.push(g.key === 'none' ? g.label : `${g.label} (reviewed in store)`);
    bits.push(a.hacked ? 'Hacked' : 'Not hacked');
    return bits.filter(Boolean).join(' · ');
  }
  if (a.batteryLabel) bits.push(`Battery ${a.batteryLabel}`);
  else if (a.battery !== null && a.battery !== undefined && a.battery !== '') bits.push(`Battery ${a.battery}%`);
  const n = NEATNESS.find((x) => x.key === a.neatness);
  if (n) bits.push(n.label);
  const net = NETWORK.find((x) => x.key === a.network);
  if (net) bits.push(net.label);
  const f = (a.faults || []).map((k) => FAULTS.find((x) => x.key === k)?.label).filter(Boolean);
  bits.push(f.length ? `Issues: ${f.join(', ')}` : 'No Issues');
  return bits.join(' · ');
}

export function summaryText(q, link) {
  // Message text (WhatsApp keeps the *bold*; TikTok strips it). Only what a customer needs, one idea per line:
  // the phone and its storage, its condition, then each swap with what it takes to swap, never "you pay".
  const out = [];
  const parts = (name) => { const [m, ...r] = name.split(' · '); return { model: m.replace(/^iPhone\s+/, ''), rest: r }; };
  const items = q.items && q.items.length > 1 ? q.items : q.device ? [{ name: q.device.name, value: q.value, answers: q.answers }] : [];
  const device = (it) => {
    const { model, rest } = parts(it.name);
    const a = it.answers || {};
    const battery = a.batteryLabel ? `Battery ${a.batteryLabel.replace(/ and above/i, '+')}` : a.battery !== null && a.battery !== undefined && a.battery !== '' ? `Battery ${a.battery}%` : '';
    const cond = answersText({ ...a, batteryLabel: '', battery: null });
    return [[`${model}${rest[0] ? `, ${rest[0]}` : ''}`, battery].filter(Boolean).join(' '), cond].filter(Boolean);
  };
  if (items.length) {
    const multi = items.length > 1;
    out.push(multi ? '*My Devices:*' : '*My Device:*');
    items.forEach((it, i) => {
      if (i) out.push('');
      const [line1, line2] = device(it);
      out.push(`${multi ? `${i + 1}. ` : ''}${line1}`);
      if (line2) out.push(line2);
      out.push(`Value: ${nairaShort(it.value)}`);
    });
    if (multi) out.push('', `*Total Value: ${nairaShort(q.value)}*`);
  }
  if (q.compare.length) {
    out.push('', items.length ? (q.compare.length > 1 ? '*Swap Options*' : '*Swap Device*') : '*Devices*');
    q.compare.forEach((c, i) => {
      const { model, rest } = parts(c.name);
      if (i) out.push('');
      out.push(`${q.compare.length > 1 ? '• ' : ''}${model}${rest[0] ? `, ${rest[0]}` : ''}${rest[1] ? ` ${rest[1]}` : ''}`);
      out.push(!items.length ? nairaShort(c.price)
        : c.kind === 'add' ? `${nairaShort(c.amount)} to Swap`
        : c.kind === 'receive' ? `You get ${nairaShort(c.amount)} back`
        : c.kind === 'even' ? 'Even swap' : nairaShort(c.price));
    });
  }
  if (link) out.push('', link);
  return out.join('\n');
}

export function whatsappMessage(q, link, city) {
  const lines = ['Hi SwapDesk, I’d like to swap.', ''];
  lines.push(summaryText(q, ''));
  if (city) lines.push('', `City: ${city}`);
  lines.push('', `Full Quote: ${link}`);
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
