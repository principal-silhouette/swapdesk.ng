// SwapDesk valuation engine: pure functions, no DOM, no network.
// Ported from the customer-facing parts of Glow SwapDesk (swapEngine.js).
// Every figure is in whole naira.

export const DEFAULT_SETTINGS = {
  batteryThreshold: 85,
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
  { key: 'factory', label: 'Factory unlocked', hint: 'Works with any SIM, no chip.' },
  { key: 'chip', label: 'Chip unlocked', hint: 'Uses an unlock chip or turbo SIM.' },
  { key: 'locked', label: 'Network or eSIM locked', hint: 'Only works on one network, or eSIM only.' },
];

// Fault keys match the Site Feed deduction columns.
export const FAULTS = [
  { key: 'screen', label: 'Bad screen', hint: 'Cracked, lines, spots or not original' },
  { key: 'trueTone', label: 'No True Tone', hint: 'True Tone missing in Control Centre' },
  { key: 'backGlass', label: 'Back glass', hint: 'Cracked or replaced back' },
  { key: 'faceId', label: 'Face ID', hint: 'Face ID not working' },
  { key: 'touchId', label: 'Touch ID / Fingerprint', hint: 'Fingerprint not working' },
  { key: 'earpiece', label: 'Earpiece', hint: 'Can’t hear calls clearly' },
  { key: 'loudspeaker', label: 'Loudspeaker', hint: 'Speaker quiet or crackling' },
  { key: 'camera', label: 'Camera', hint: 'Any camera blurry or not working' },
  { key: 'chargingPort', label: 'Charging port / mic', hint: 'Charging or mic problems' },
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
    push('battery', `Battery health ${battery}%`, amountFor(device, 'battery'));
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
    if (answers.network === 'locked') push('network', 'Network or eSIM locked', amountFor(device, 'network'), s(settings, 'network.lockedShare'));
  }

  // Faults
  const faults = new Set(answers.faults || []);
  const screen = amountFor(device, 'screen');
  for (const f of FAULTS) {
    if (!faults.has(f.key)) continue;
    if (f.key === 'trueTone') {
      if (faults.has('screen')) continue; // a new screen fixes True Tone too
      let tt = amountFor(device, 'trueTone');
      if (tt === 'n/a') continue;
      if (tt === null && typeof screen === 'number') tt = screen * s(settings, 'trueTone.shareOfScreen');
      push('trueTone', f.label, tt);
      continue;
    }
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
