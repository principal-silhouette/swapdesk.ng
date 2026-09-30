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
  return c && Array.isArray(c.devices) && c.devices.length > 0 && c.settings;
}

/** Prepare a raw catalogue for the UI: indexes, orders, search text. */
export function prepare(raw, origin) {
  const devices = raw.devices.map((d, i) => ({ ...d, _i: i, _search: searchText(d) }));
  const byId = new Map(devices.map((d) => [d.id, d]));
  const modelOrder = new Map();
  const seriesOrder = new Map();
  for (const d of devices) {
    if (!modelOrder.has(d.model)) modelOrder.set(d.model, modelOrder.size);
    if (!seriesOrder.has(d.series)) seriesOrder.set(d.series, seriesOrder.size);
  }
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
