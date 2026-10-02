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
  'network.chipShare': 0.7,
  'network.esimShare': 0.4, // eSIM-only (no SIM tray), unlocked; not the iPhone Air, which is always eSIM-only
  'network.lockedShare': 1,
  'trueTone.shareOfScreen': 0.5,
  'rounding.tradeIn': 2000,
  'rounding.quote': 1000,
  'compare.maxDevices': 6,
  // Daniel, 2 Oct: consoles are valued with one controller; 2 or more controllers add 10,000.
  'console.extraPad': 10000,
  // Daniel, 2 Oct: 1–2 games add 5,000; 3 or more add 10,000. Games are reviewed in store.
  'console.fewGames': 5000,
  'console.manyGames': 10000,
};

// Console questions (type Games). Games included and a hacked console are noted and checked in store.
export const PADS = [
  { key: '1', label: '1 Controller', hint: 'The console with one controller.' },
  { key: '2', label: '2 or More Controllers', hint: 'Adds to your value.' },
];
export const GAMES = [
  { key: 'none', label: 'No Games', hint: 'Just the console and controller.' },
  { key: 'few', label: '1 – 2 Games', hint: 'Adds ₦5,000.' },
  { key: 'many', label: '3 Games or More', hint: 'Adds ₦10,000.' },
];
export const isConsole = (d) => d?.type === 'Games';
// Speakers (Daniel, 2 Oct): no deductions; we only take them in perfect condition.
export const isSpeaker = (d) => d?.type === 'Speakers';

export const NEATNESS = [
  { key: 'spotless', label: 'Spotless', hint: 'No marks at all, like it just left the box.' },
  { key: 'prettyNeat', label: 'Pretty Neat', hint: 'Faint signs of use you have to look for.' },
  { key: 'fewSpots', label: 'A Few Spots & Scratches', hint: 'Light scratches you can see at arm’s length.' },
  { key: 'smallDents', label: 'Small Dents & Scratches', hint: 'Visible dents or scratches on the frame or screen.' },
  { key: 'rough', label: 'Pretty Rough', hint: 'Deep dents, heavy scratches or chipped edges.' },
];

export const NETWORK = [
  { key: 'factory', label: 'Physical SIM, Unlocked', hint: 'Takes a SIM card from any network. No chip needed.' },
  { key: 'esim', label: 'eSIM, Unlocked', hint: 'eSIM only (no SIM tray), and works with any network’s eSIM.' },
  { key: 'chip', label: 'Chip Unlocked', hint: 'Network locked physical SIM. Works here with an unlock chip or turbo SIM.' },
  { key: 'locked', label: 'eSIM Locked', hint: 'eSIM only, tied to one foreign network. Can’t use a local eSIM.' },
  { key: 'nodata', label: 'Mobile Data Issue', hint: 'No network or mobile data at all, with any SIM.' },
];

// Fault keys match the Site Feed deduction columns.
export const FAULTS = [
  { key: 'screen', label: 'Faulty Screen', hint: 'Cracked glass, lines, dead spots, burn-in or touch not working. Covers the repair and the value lost to a changed screen.' },
  { key: 'screenReplaced', label: 'Replaced Screen', hint: 'Screen has been changed and is not the original (shows “Unknown Part” on iPhone).' },
  { key: 'batteryReplaced', label: 'Replaced Battery', hint: 'The battery has been changed and is not the original (shows “Unknown Part” or “Non-genuine battery” on iPhone).' },
  { key: 'trueTone', label: 'No True Tone', hint: 'True Tone is missing from Control Centre or Display settings, usually after a screen change.' },
  { key: 'backGlass', label: 'Back Glass', hint: 'The glass back is cracked, chipped or has been replaced.' },
  { key: 'faceId', label: 'Face ID', hint: 'Face ID won’t set up, or doesn’t recognise your face.' },
  { key: 'touchId', label: 'Touch ID / Fingerprint', hint: 'The fingerprint sensor doesn’t register or unlock the device.' },
  { key: 'earpiece', label: 'Earpiece', hint: 'Callers sound faint, muffled or crackly when the phone is at your ear.' },
  { key: 'loudspeaker', label: 'Loudspeaker', hint: 'Music, ringtones or speakerphone are quiet, distorted or silent.' },
  { key: 'camera', label: 'Camera', hint: 'Any camera is blurry, black, shaky or won’t focus.' },
  { key: 'chargingPort', label: 'Charging Port / Mic', hint: 'Won’t charge, charges only at an angle, or callers can’t hear you.' },
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
  if (isSpeaker(device) && answers.perfect === false) {
    return { accepted: false, reason: 'We only swap speakers in perfect condition.', start: 0, lines: [], pending: 0, value: 0 };
  }
  if (!device.tradeIn) {
    return { accepted: false, reason: 'We don’t take this device as a trade-in yet.', start: 0, lines: [], pending: 0, value: 0 };
  }
  const start = device.tradeInValue;
  if (!(start > 0)) {
    return { accepted: false, reason: 'We don’t have a trade-in value for this device yet. Send it to us on WhatsApp for a quote.', start: 0, lines: [], pending: 0, value: 0 };
  }

  const lines = [];
  if (isConsole(device)) {
    // A console's only questions: controllers, games included, hacked or not.
    if (answers.pads === '2') lines.push({ key: 'pads', label: '2 or More Controllers', amount: -s(settings, 'console.extraPad') });
    const g = GAMES.find((x) => x.key === answers.games);
    if (g && g.key !== 'none') lines.push({ key: 'games', label: `${g.label} Included`, amount: -s(settings, g.key === 'many' ? 'console.manyGames' : 'console.fewGames') });
    if (answers.hacked) lines.push({ key: 'hacked', label: 'Hacked / Jailbroken', amount: null });
    const total = lines.reduce((a, l) => a + (l.amount || 0), 0);
    const value = Math.max(0, floorTo(start - total, s(settings, 'rounding.quote')));
    return { accepted: true, start, lines, pending: lines.filter((l) => l.amount === null).length, value };
  }
  const push = (key, label, base, mult = 1) => {
    if (base === 'n/a') return;
    lines.push({ key, label, amount: typeof base === 'number' ? Math.round(base * mult) : null });
  };

  // Battery
  const battery = Number(answers.battery);
  if (applies(device, 'battery') && Number.isFinite(battery) && answers.battery !== null && answers.battery !== '' &&
      battery < s(settings, 'batteryThreshold')) {
    const label = answers.batteryLabel ? `Battery Health ${answers.batteryLabel}` : `Battery Health ${battery}%`;
    const full = amountFor(device, 'battery');
    if (battery < s(settings, 'battery.fullBelow')) push('battery', label, full);
    else push('battery', label, typeof full === 'number' ? Math.ceil((full * s(settings, 'battery.partialShare')) / 1000) * 1000 : full);
  }

  // Body
  const n = NEATNESS.find((x) => x.key === answers.neatness);
  if (n && applies(device, 'body')) {
    const mult = s(settings, `neatness.${n.key}`);
    if (mult > 0) push('body', `Body: ${n.label}`, amountFor(device, 'body'), mult);
  }

  // Network
  if (applies(device, 'network')) {
    if (answers.network === 'chip') push('network', 'Chip Unlocked', amountFor(device, 'network'), s(settings, 'network.chipShare'));
    if (answers.network === 'esim' && !/\bAir\b/.test(device.model || '')) push('network', 'eSIM Only', amountFor(device, 'network'), s(settings, 'network.esimShare'));
    if (answers.network === 'locked') push('network', 'eSIM Locked', amountFor(device, 'network'), s(settings, 'network.lockedShare'));
    // No network at all costs the same as an eSIM-locked phone: either way it can't be used on a local network.
    if (answers.network === 'nodata') push('network', 'Mobile Data Issue', amountFor(device, 'network'), s(settings, 'network.lockedShare'));
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
  if (t.kind === 'add') return 'To swap';
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

/** Every word in the query must start a word in the device ("16 pro max 256"), so "12" finds the iPhone 12, not 512gb. */
export function matches(d, query) {
  const q = norm(query).trim();
  if (!q) return true;
  const words = (d._search || searchText(d)).split(/[\s/]+/);
  // A number of two or more digits must be a whole number in the name: "12" is the iPhone 12, not 128gb or 512gb.
  const hit = (w, x) => (/^\d{2,}$/.test(w) ? (x.match(/^\d+/) || [''])[0] === w : x.startsWith(w));
  return q.split(/\s+/).every((w) => words.some((x) => hit(w, x)));
}
