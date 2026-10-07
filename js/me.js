// The customer on this phone: name, WhatsApp number and city, remembered so they're never asked twice.
// Codes they make here are kept too, so "My Swap Codes" works even before the sheet answers.
import { CONFIG, CITIES } from './config.js';

const KEY = 'swapdesk.me.v1';
const GUEST = 'swapdesk.guest';

export function getMe() {
  try { const m = JSON.parse(localStorage.getItem(KEY) || 'null'); return m && m.phone ? m : null; } catch { return null; }
}
export function setMe(m) {
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* private mode */ }
  return m;
}
export function updateMe(patch) {
  const m = getMe();
  return m ? setMe({ ...m, ...patch }) : null;
}
export function signOut() {
  try { localStorage.removeItem(KEY); } catch { /* private mode */ }
}
/** "Continue as Guest" lasts for this visit only; the next visit asks again. */
export const isGuest = () => { try { return sessionStorage.getItem(GUEST) === '1'; } catch { return false; } };
export const setGuest = () => { try { sessionStorage.setItem(GUEST, '1'); } catch { /* private mode */ } };

/**
 * One form for every number, so 07051111266, 2347051111266 and +234 705 111 1266 are the same customer.
 * Nigerian numbers become 0XXXXXXXXXX; other countries keep +country code. Returns '' when it isn't a number.
 */
export function normPhone(v) {
  const raw = String(v || '').trim();
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('234') && d.length === 13) d = `0${d.slice(3)}`;
  else if (d.length === 10 && /^[789]/.test(d)) d = `0${d}`;
  if (/^0[789][01]\d{8}$/.test(d)) return d;
  if (raw.startsWith('+') && d.length >= 8 && d.length <= 15) return `+${d}`;
  return '';
}
/** 07051111266 → 0705 111 1266 */
export const showPhone = (p) => (/^0\d{10}$/.test(p) ? `${p.slice(0, 4)} ${p.slice(4, 7)} ${p.slice(7)}` : p || '');
export const firstName = (m) => String(m?.name || '').trim().split(/\s+/)[0] || '';

/** Remember a code made on this phone (newest first, at most 50). */
/** Quotes made on this phone: only these (or a signed-in owner's) can be edited from a quote link. */
const MINE = 'swapdesk.mine';
const mineList = () => { try { return JSON.parse(localStorage.getItem(MINE) || '[]'); } catch { return []; } };
export function markMine(id) {
  if (!id) return;
  try { localStorage.setItem(MINE, JSON.stringify([id, ...mineList().filter((x) => x !== id)].slice(0, 100))); } catch { /* private mode */ }
}
export function isMine(id, q = {}) {
  if (!id) return false;
  if (mineList().includes(id)) return true;
  const m = getMe();
  return !!m && ((m.codes || []).some((c) => c.id === id) || (!!q.phone && normPhone(q.phone) === m.phone));
}

export function rememberCode(c) {
  const m = getMe();
  if (!m || !c?.id) return;
  const codes = (m.codes || []).filter((x) => x.id !== c.id);
  codes.unshift({ ...c, at: c.at || new Date().toISOString() });
  setMe({ ...m, codes: codes.slice(0, 50) });
}

async function post(body, ms = 25000) {
  if (!CONFIG.endpoint) throw new Error('No endpoint');
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(CONFIG.endpoint, {
      method: 'POST', signal: ctl.signal,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // simple request: no CORS preflight
      body: JSON.stringify(body),
    });
    return await r.json();
  } finally { clearTimeout(t); }
}
/** Record the customer in the sheet (Customers tab). Quietly ignored by an older script. */
export const saveCustomer = (m) => post({ action: 'customer', customer: { name: m.name, phone: m.phone, pin: m.pin || '', city: CITIES.find((c) => c.key === m.city)?.name || '' } }).catch(() => null);
/** The codes saved under a number. { ok, codes } or { ok:false, needPin } */
export const fetchCodes = (m) => post({ action: 'myCodes', phone: m.phone, pin: m.pin || '' });
/** Sign in on any phone: { ok, name, city } or { needPin } or { notFound }. */
export const signInRemote = (phone, pin) => post({ action: 'signIn', phone, pin: pin || '' });
export const savePin = (m, pin) => post({ action: 'setPin', phone: m.phone, pin, oldPin: m.pin || '' });
