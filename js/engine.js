// SwapDesk valuation engine: pure functions, no DOM, no network.
// Ported from the customer-facing parts of Glow SwapDesk (swapEngine.js).
// Every figure is in whole naira.

export const DEFAULT_SETTINGS = {
  batteryThreshold: 85,
  // Daniel, 1 Oct: 80–84% carries 60% of a new battery; 79% and below is the full charge.
  'battery.fullBelow': 80,
  'battery.partialShare': 0.6,
  'neatness.spotless': 0,
  'neatness.prettyNeat': 0,
  'neatness.fewSpots': 0.5,
  'neatness.smallDents': 1,
  'neatness.rough': 1.5,
  'network.chipShare': 0.5,
  'network.lockedShare': 1,
  'trueTone.shareOfScreen': 0.5,
  'rounding.tradeIn': 2000,
  'rounding.quote': 1000,
  'compare.maxDevices': 6,
};

export const NEATNESS = [
  { key: 'spotless', label: 'Spotless', hint: 'No marks at all, like it just left the box.' },
  { key: 'prettyNeat', label: 'Pretty neat', hint: 'Faint signs of use you have to look for.' },
  { key: 'fewSpots', label: 'A few spots & scratches', hint: 'Light scratches you can see at arm’s length.' },
  { key: 'smallDents', label: 'Small dents & scratches', hint: 'Visible dents or scratches on the frame or screen.' },
  { key: 'rough', label: 'Pretty rough', hint: 'Deep dents, heavy scratches or chipped edges.' },
];

export const NETWORK = [
  { key: 'factory', label: 'Physical SIM, unlocked', hint: 'Takes a SIM card from any network. No chip needed.' },
  { key: 'esim', label: 'eSIM, unlocked', hint: 'eSIM only (no SIM tray), and works with any network’s eSIM.' },
  { key: 'chip', label: 'Chip unlocked', hint: 'Network locked physical SIM. Works here with an unlock chip or turbo SIM.' },
  { key: 'locked', label: 'eSIM locked', hint: 'eSIM only, tied to one foreign network. Can’t use a local eSIM.' },
];

// Fault keys match the Site Feed deduction columns.
export const FAULTS = [
  { key: 'screen', label: 'Faulty screen', hint: 'Cracked glass, lines, dead spots, burn-in or touch not working. Covers the repair and the value lost to a changed screen.' },
  { key: 'screenReplaced', label: 'Replaced screen', hint: 'Screen has been changed and is not the original (shows “Unknown Part” on iPhone).' },
  { key: 'batteryReplaced', label: 'Replaced battery', hint: 'The battery has been changed and is not the original (shows “Unknown Part” or “Non-genuine battery” on iPhone).' },
  { key: 'trueTone', label: 'No True Tone', hint: 'True Tone is missing from Control Centre or Display settings, usually after a screen change.' },
  { key: 'backGlass', label: 'Back glass', hint: 'The glass back is cracked, chipped or has been replaced.' },
  { key: 'faceId', label: 'Face ID', hint: 'Face ID won’t set up, or doesn’t recognise your face.' },
  { key: 'touchId', label: 'Touch ID / Fingerprint', hint: 'The fingerprint sensor doesn’t register or unlock the device.' },
  { key: 'earpiece', label: 'Earpiece', hint: 'Callers sound faint, muffled or crackly when the phone is at your ear.' },
  { key: 'loudspeaker', label: 'Loudspeaker', hint: 'Music, ringtones or speakerphone are quiet, distorted or silent.' },
  { key: 'camera', label: 'Camera', hint: 'Any camera is blurry, black, shaky or won’t focus.' },
  { key: 'chargingPort', label: 'Charging port / mic', hint: 'Won’t charge, charges only at an angle, or callers can’t hear you.' },
];

export const CONDITION_ORDER = [
  'Brand New',
  'Active Brand New',
  'Active Brand New (Non LLA)',
  'Foreign USED',
  'Foreign USED (Non LLA)',
  'Nigerian USED',
  'Deal',
];

const s = (settings, key) => {
  const v = settings?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : DEFAULT_SETTINGS[key];
};

export const floorTo = (n, step) => (step > 0 ? Math.floor(n / step) * step : Math.floor(n));

/** Amount for a deduction key on a device: a number, 'n/a', or null (not priced yet). */
export function amountFor(device, key) {
  if (key === 'screenReplaced' && device?.deductions?.screenReplaced === undefined) {
    // Price manager's rule: a replaced (non-original) screen loses 20% of the device's value.
    // That's the No True Tone column on the Deductions tab; otherwise 20% of the device value.
    const tt = device?.deductions?.trueTone;
    if (typeof tt === 'number' && tt > 0) return tt;
    const base = device?.price || device?.tradeInValue;
    return base > 0 ? Math.ceil((base * 0.2) / 1000) * 1000 : null;
  }
  if (key === 'batteryReplaced' && device?.deductions?.batteryReplaced === undefined) {
    // Daniel, 1 Oct: a changed battery carries 60% of a new battery charge, in case we need to replace it.
    const b = device?.deductions?.battery;
    if (b === 'n/a') return 'n/a';
    return typeof b === 'number' && b > 0 ? Math.ceil((b * 0.6) / 1000) * 1000 : null;
  }
  const v = device?.deductions?.[key];
  if (v === 'n/a') return 'n/a';
  return typeof v === 'number' && v > 0 ? v : null;
}

/** Faults the customer is asked about for this device. */
export function faultsFor(device, { includeUnpriced = true } = {}) {
  return FAULTS.filter((f) => {
    const a = amountFor(device, f.key);
    if (a === 'n/a') return false;
    if (a !== null || includeUnpriced) return true;
    return f.key === 'trueTone' && typeof amountFor(device, 'screen') === 'number';
  });
}

export function applies(device, key) {
  return amountFor(device, key) !== 'n/a';
}

/**
 * Value a customer's device.
 * answers = { icloudLocked, battery (number|null), neatness, network, faults: string[] }
 * Returns { accepted, reason?, start, lines: [{ key, label, amount|null }], pending: n, value }
 * A line with amount null is a fault we check in store (the model has no price for it yet).
 */
export function valueDevice(device, answers = {}, settings = {}) {
  if (!device) return { accepted: false, reason: 'Pick your device first.', start: 0, lines: [], pending: 0, value: 0 };
  if (answers.icloudLocked) {
    return { accepted: false, reason: 'We can’t accept devices that are iCloud or activation locked. Remove the lock and check again.', start: 0, lines: [], pending: 0, value: 0 };
  }
  if (!device.tradeIn) {
    return { accepted: false, reason: 'We don’t take this device as a trade-in yet.', start: 0, lines: [], pending: 0, value: 0 };
  }
  const start = device.tradeInValue;
  if (!(start > 0)) {
    return { accepted: false, reason: 'We don’t have a trade-in value for this device yet. Send it to us on WhatsApp for a quote.', start: 0, lines: [], pending: 0, value: 0 };
  }

  const lines = [];
  const push = (key, label, base, mult = 1) => {
    if (base === 'n/a') return;
    lines.push({ key, label, amount: typeof base === 'number' ? Math.round(base * mult) : null });
  };

  // Battery
  const battery = Number(answers.battery);
  if (applies(device, 'battery') && Number.isFinite(battery) && answers.battery !== null && answers.battery !== '' &&
      battery < s(settings, 'batteryThreshold')) {
    const label = answers.batteryLabel ? `Battery health ${answers.batteryLabel}` : `Battery health ${battery}%`;
    const full = amountFor(device, 'battery');
    if (battery < s(settings, 'battery.fullBelow')) push('battery', label, full);
    else push('battery', label, typeof full === 'number' ? Math.ceil((full * s(settings, 'battery.partialShare')) / 1000) * 1000 : full);
  }

  // Body
  const n = NEATNESS.find((x) => x.key === answers.neatness);
  if (n && applies(device, 'body')) {
    const mult = s(settings, `neatness.${n.key}`);
    if (mult > 0) push('body', `Body: ${n.label.toLowerCase()}`, amountFor(device, 'body'), mult);
  }

  // Network
  if (applies(device, 'network')) {
    if (answers.network === 'chip') push('network', 'Chip unlocked', amountFor(device, 'network'), s(settings, 'network.chipShare'));
    if (answers.network === 'locked') push('network', 'eSIM locked', amountFor(device, 'network'), s(settings, 'network.lockedShare'));
  }

  // Faults
  const faults = new Set(answers.faults || []);
  const screen = amountFor(device, 'screen');
  for (const f of FAULTS) {
    if (!faults.has(f.key)) continue;
    if (f.key === 'trueTone') {
      if (faults.has('screen') || faults.has('screenReplaced')) continue; // a new screen fixes True Tone too
      let tt = amountFor(device, 'trueTone');
      if (tt === 'n/a') continue;
      if (tt === null && typeof screen === 'number') tt = screen * s(settings, 'trueTone.shareOfScreen');
      push('trueTone', f.label, tt);
      continue;
    }
    if (f.key === 'screenReplaced' && faults.has('screen')) continue; // one screen line: a faulty screen gets replaced anyway
    if (f.key === 'batteryReplaced' && lines.some((l) => l.key === 'battery')) continue; // low health already charges a full new battery
    push(f.key, f.label, amountFor(device, f.key));
  }

  const total = lines.reduce((a, l) => a + (l.amount || 0), 0);
  const value = Math.max(0, floorTo(start - total, s(settings, 'rounding.quote')));
  return { accepted: true, start, lines, pending: lines.filter((l) => l.amount === null).length, value };
}

/** Top-up for swapping into a device. */
export function swapTerms(target, tradeValue) {
  const price = target?.price;
  if (!(price > 0)) return { kind: 'unavailable', amount: 0 };
  const diff = price - (tradeValue || 0);
  if (diff > 0) return { kind: 'add', amount: diff, price };
  if (diff < 0) return { kind: 'receive', amount: -diff, price };
  return { kind: 'even', amount: 0, price };
}

export function termsLabel(t) {
  if (t.kind === 'add') return 'You add';
  if (t.kind === 'receive') return 'We pay you';
  if (t.kind === 'even') return 'Even swap';
  return 'Not available';
}

// ---------- ordering ----------

export function storageRank(str = '') {
  const m = String(str).toLowerCase().match(/(\d+(?:\.\d+)?)\s*(tb|gb|mm)?\s*$/);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  return m[2] === 'tb' ? n * 1024 : n;
}

export const conditionRank = (c) => {
  const i = CONDITION_ORDER.indexOf(c);
  return i === -1 ? CONDITION_ORDER.length : i;
};

/**
 * Glow's comparison order: model (catalogue order), then condition, then storage.
 * `order` maps model name -> index in the catalogue (newest first).
 */
export function compareOrder(order) {
  return (a, b) =>
    (order.get(a.model) ?? 1e9) - (order.get(b.model) ?? 1e9) ||
    conditionRank(a.condition) - conditionRank(b.condition) ||
    storageRank(a.storage) - storageRank(b.storage) ||
    (a.price || 0) - (b.price || 0);
}

/** Variant order inside one model: condition, then storage, then price. */
export function variantOrder(a, b) {
  return conditionRank(a.condition) - conditionRank(b.condition) ||
    storageRank(a.storage) - storageRank(b.storage) ||
    (a.price || 0) - (b.price || 0);
}

// ---------- search ----------

const norm = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9/ ]+/g, ' ');

export function searchText(d) {
  return norm([d.brand, d.series, d.model, d.storage, d.condition, d.type, d.dealNote].join(' '));
}

/** Every word in the query must appear somewhere ("16 pro max 256"). */
export function matches(d, query) {
  const q = norm(query).trim();
  if (!q) return true;
  const hay = d._search || searchText(d);
  return q.split(/\s+/).every((w) => hay.includes(w));
}
