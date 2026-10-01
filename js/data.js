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
export function prepare(raw, origin) {
  const devices = raw.devices.map((d, i) => ({ ...d, _i: i, _search: searchText(d) }));
  // LLA only means something where the same model is also sold Non LLA; elsewhere it isn't shown.
  const nonLla = new Set(devices.filter((d) => /\(Non LLA\)$/.test(d.condition || '')).map((d) => `${d.model}|${d.condition.replace(/ \(Non LLA\)$/, '')}`));
  for (const d of devices) d.lla = nonLla.has(`${d.model}|${d.condition}`);
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
  return {
    updatedAt: raw.updatedAt,
    origin, // 'live' | 'cache' | 'snapshot'
    settings: raw.settings || {},
    devices,
    byId,
    modelOrder,
    seriesOrder,
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
