// Catalogue loading: live endpoint → last good copy in localStorage → bundled snapshot.
import { CONFIG } from './config.js';
import { searchText } from './engine.js';

const CACHE_KEY = 'swapdesk.catalog.v1';
const FRESH_MS = 5 * 60 * 1000;

const store = {
  get() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch { return null; }
  },
  set(c) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), catalog: c })); } catch { /* private mode */ }
  },
};

async function fetchJSON(url, ms = 6000, init) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { ...init, signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

function valid(c) {
  // A feed without stock tags comes from the old script (it would show Jiji estimates as prices), so it's refused
  // and the site falls back to the bundled snapshot.
  return c && Array.isArray(c.devices) && c.devices.length > 0 && c.settings && c.devices.some((d) => 'stock' in d);
}

/** Prepare a raw catalogue for the UI: indexes, orders, search text. */
// ---- Android lists: grouped by family, then by name, newest first ----
/** Samsung's sheet series are per generation; the lists group by family instead. */
function samsungFamily(model) {
  const m = model.toLowerCase();
  if (/fold/.test(m)) return 'Galaxy Z Fold';
  if (/flip/.test(m)) return 'Galaxy Z Flip';
  if (/note/.test(m)) return 'Galaxy Note';
  if (/\bs\d+\b.*ultra/.test(m)) return 'Galaxy S Ultra';
  if (/\bs\d+/.test(m)) return 'Galaxy S';
  if (/\ba\d+/.test(m)) return 'Galaxy A';
  return null;
}
/** Family order inside a brand: top tier first. Families not listed follow by number, newest first. */
const FAMILY_ORDER = {
  Samsung: ['Galaxy Z Fold', 'Galaxy Z Flip', 'Galaxy S Ultra', 'Galaxy Note', 'Galaxy S', 'Galaxy A'],
  Tecno: ['Tecno Phantom', 'Tecno Camon', 'Tecno Spark', 'Tecno Pop'],
  Infinix: ['Infinix Zero', 'Infinix Note', 'Infinix Hot', 'Infinix Smart'],
  Xiaomi: ['Redmi Note', 'Redmi'],
  Itel: ['Itel S-series', 'Itel P-series', 'Itel A-series'],
};
/** Within a model number: Ultra / Pro XL, Pro, Plus, the standard model, then FE and lettered versions (S10e, 9a, 40i, 30C). */
function variantWeight(rest) {
  const r = rest.toLowerCase().trim();
  if (/ultra|pro\s*xl|pro\s*max/.test(r)) return 0;
  if (/pro/.test(r)) return 1;
  if (/plus|\+/.test(r)) return 2;
  if (!r) return 3;
  if (/fe/.test(r)) return 4;
  return 5;
}
/** [family number, variant] for sorting by name: "Galaxy S22 Plus" → [22, 2], "Infinix Hot 40i" → [40, 5]. */
function nameKey(model) {
  const m = model.match(/(\d+)([a-z+]*)((?:\s.*)?)$/i);
  if (!m) return [-1, 3];
  return [Number(m[1]), variantWeight(`${m[2]} ${m[3]}`)];
}
function listOrders(devices, seriesOrder, modelOrder) {
  const groupOrder = new Map(seriesOrder); const nameOrder = new Map(modelOrder);
  const brands = new Set(devices.filter((d) => d.brand !== 'Apple' && d.type === 'Phones').map((d) => d.brand));
  for (const brand of brands) {
    const rows = devices.filter((d) => d.brand === brand && d.type === 'Phones');
    const series = [...new Set(rows.map((d) => d.series))];
    const models = [...new Set(rows.map((d) => d.model))];
    const fam = FAMILY_ORDER[brand] || [];
    const famIdx = (x) => (fam.indexOf(x) === -1 ? fam.length : fam.indexOf(x));
    const num = (x) => nameKey(x)[0];
    series.sort((a, b) => famIdx(a) - famIdx(b) || num(b) - num(a) || (seriesOrder.get(a) ?? 1e9) - (seriesOrder.get(b) ?? 1e9));
    const base = Math.min(...series.map((x) => seriesOrder.get(x) ?? 1e9));
    series.forEach((x, i) => groupOrder.set(x, base + i / 1000));
    const seriesOf = new Map(rows.map((d) => [d.model, d.series]));
    models.sort((a, b) => {
      const [na, va] = nameKey(a); const [nb, vb] = nameKey(b);
      return groupOrder.get(seriesOf.get(a)) - groupOrder.get(seriesOf.get(b)) || nb - na || va - vb || a.localeCompare(b);
    });
    const mBase = Math.min(...models.map((x) => modelOrder.get(x) ?? 1e9));
    models.forEach((x, i) => nameOrder.set(x, mBase + i / 1000));
  }
  return { groupOrder, nameOrder };
}

export function prepare(raw, origin) {
  const devices = raw.devices.map((d, i) => {
    const series = d.brand === 'Samsung' ? samsungFamily(d.model) || d.series : d.series;
    const x = { ...d, series, _i: i };
    x._search = searchText(x);
    return x;
  });
  const byId = new Map(devices.map((d) => [d.id, d]));
  // Most expensive first: series by their dearest model, models by their dearest version.
  // A model we don't sell ranks by its trade-in value instead, so older phones still fall in place.
  const worth = (d) => d.price || d.tradeInValue || 0;
  const modelTop = new Map(); const seriesTop = new Map();
  for (const d of devices) {
    modelTop.set(d.model, Math.max(modelTop.get(d.model) || 0, worth(d) * (d.price ? 1 : 1.4)));
  }
  for (const d of devices) seriesTop.set(d.series, Math.max(seriesTop.get(d.series) || 0, modelTop.get(d.model)));
  const rank = (m) => new Map([...m.entries()].sort((a, b) => b[1] - a[1]).map(([k], i) => [k, i]));
  const modelOrder = rank(modelTop);
  const seriesOrder = rank(seriesTop);
  // Lists and the device picker: Android phones by family, then by name (newest first); everything else by price.
  const { groupOrder, nameOrder } = listOrders(devices, seriesOrder, modelOrder);
  return {
    updatedAt: raw.updatedAt,
    origin, // 'live' | 'cache' | 'snapshot'
    settings: raw.settings || {},
    devices,
    byId,
    modelOrder,
    seriesOrder,
    groupOrder,
    nameOrder,
  };
}

/**
 * Load the catalogue. Resolves with the best copy available now, then calls
 * onUpdate(catalog) if a fresher one arrives in the background.
 */
export async function loadCatalog(onUpdate) {
  const cached = store.get();
  const cachedOk = cached && valid(cached.catalog);
  const live = CONFIG.endpoint
    ? fetchJSON(`${CONFIG.endpoint}?action=catalog`).then((c) => {
      if (!valid(c)) throw new Error('Bad catalogue');
      store.set(c);
      return prepare(c, 'live');
    })
    : Promise.reject(new Error('No endpoint'));

  if (cachedOk) {
    const fresh = Date.now() - cached.savedAt < FRESH_MS;
    if (!fresh) {
      live.then((c) => {
        if (c.updatedAt !== cached.catalog.updatedAt) onUpdate?.(c);
      }).catch(() => {});
    } else {
      live.catch(() => {});
    }
    return prepare(cached.catalog, fresh ? 'live' : 'cache');
  }

  try {
    return await live;
  } catch {
    // The live feed can take longer than the timeout on a cold start. Show the snapshot now,
    // and swap in the live copy when it arrives.
    if (CONFIG.endpoint) {
      fetchJSON(`${CONFIG.endpoint}?action=catalog`, 30000).then((c) => {
        if (!valid(c)) return;
        store.set(c);
        onUpdate?.(prepare(c, 'live'));
      }).catch(() => {});
    }
    const snap = await fetchJSON(CONFIG.snapshot, 15000);
    return prepare(snap, 'snapshot');
  }
}

export async function saveQuoteRemote(quote) {
  if (!CONFIG.endpoint) throw new Error('No endpoint');
  const r = await fetchJSON(CONFIG.endpoint, 10000, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // simple request: no CORS preflight
    body: JSON.stringify({ action: 'saveQuote', quote }),
  });
  if (!r.ok) throw new Error(r.error || 'Save failed');
  return r;
}

export async function loadQuoteRemote(id) {
  if (!CONFIG.endpoint) throw new Error('No endpoint');
  const r = await fetchJSON(`${CONFIG.endpoint}?action=quote&id=${encodeURIComponent(id)}`, 10000);
  if (!r.ok) throw new Error(r.error || 'Not found');
  return r.quote;
}
