// The SwapDesk screens: home, device picker, condition questions, trade-in value,
// swap comparison, completing on WhatsApp and saved quotes.
import { CONFIG, CITIES } from '../config.js';
import {
  NEATNESS, NETWORK, FAULTS, SIM, hasSimQuestion, networkOptionsFor, simDeduction, PADS, GAMES, isConsole, isSpeaker, isPerfectOnly, perfectOnlyText, amountFor, valueDevice, swapTerms, termsLabel, faultsFor, applies, compareOrder, matches, variantOrder,
} from '../engine.js';
import { html, raw, naira, nairaK, lineAmount, lineAmountK, deviceWord, tradeStorage, variantName, conditionLabel, $, $$ } from '../format.js';
import { ICON, neatnessIllo } from './icons.js';
import { animateNumber, haptic } from './motion.js';
import {
  buildQuote, saveQuote, summaryText, whatsappMessage, whatsappURL, share, copy, answersText,
} from '../quote.js';
import { listScreen, listRows, dealRows } from './lists.js';
import { quoteScreen } from './quoteView.js';
import { getMe, setMe, updateMe, signOut, isGuest, setGuest, normPhone, showPhone, firstName, rememberCode, saveCustomer, fetchCodes, savePin, signInRemote } from '../me.js';

const KEY = 'swapdesk.state.v2';

export const freshAnswers = () => ({
  batteryBand: '', origin: '', sim: '', icloudLocked: null, battery: '', batteryUnknown: false, neatness: null, network: null, faults: [], faultsDone: false,
  pads: '', games: '', hacked: null, perfect: null,
});
const freshPick = () => ({ type: '', brand: '', model: '', search: '' });

export function restoreState() {
  const base = { mode: 'swap', cash: false, deviceId: '', answers: freshAnswers(), more: [], adding: false, compare: [], city: '', saved: null, pick: freshPick(), add: freshPick() };
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && typeof s === 'object') return { ...base, ...s, answers: { ...freshAnswers(), ...(s.answers || {}) }, pick: { ...freshPick(), ...(s.pick || {}) }, add: freshPick() };
  } catch { /* private mode */ }
  return base;
}
export function saveState(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ }
}

// ---------- shared bits ----------

const TYPE_LABEL = { Games: 'Consoles' };
const credit = () => html`<p class="credit"><b>swapdesk.ng</b> · An Upgrade Brands product</p>`;
const pills = (...b) => html`<div class="pills">${b}</div>`;
const backPill = (label = 'Go Back') => html`<button class="pill" type="button" data-back>${label}</button>`;
/** Every screen: content that fills the pop-up, and navigation pinned to the bottom. */
const layout = (main, foot) => html`<div class="screen-main">${main}</div><div class="screen-foot">${foot}${credit()}</div>`;

function wire(el, app, handlers) {
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-back]')) { app.back(); return; }
    const a = e.target.closest('[data-act]');
    if (a && handlers[a.dataset.act]) handlers[a.dataset.act](a, e);
  });
}

export function ownDevice(app) {
  return app.catalog.byId.get(app.s.deviceId) || null;
}

// Battery health is picked as a range; each range is valued the same way inside the engine.
export const BATTERY_BANDS = [
  { key: '90', label: '90% and Above', hint: 'Like new', value: 95 },
  { key: '85', label: '85% – 89%', hint: 'No deduction', value: 87 },
  { key: '80', label: '80% – 84%', hint: 'Partial battery deduction applies', value: 82 },
  { key: '79', label: '79% or Less', hint: 'Full battery deduction applies', value: 75 },
];
const ORIGIN_LABEL = {
  'Brand New': ['Brand new, still sealed', 'Never opened or activated.'],
  'Active Brand New': ['Brand new, but activated', 'Opened and set up, barely used.'],
  'Active Brand New (Non LLA)': ['Brand new, but activated', 'Opened and set up, barely used.'],
  'Foreign USED': ['Used, bought abroad', 'UK or US used, imported.'],
  'Foreign USED (Non LLA)': ['Used, bought abroad', 'UK or US used, imported.'],
  'Nigerian USED': ['Used in Nigeria', 'Bought and used locally.'],
};
let CATALOG = null;
/** Tradeable rows for the same model and storage (the conditions a customer's device could be). */
export function siblings(device) {
  if (!CATALOG || !device) return [device].filter(Boolean);
  return listRows(CATALOG, 'trade-in').filter((x) => x.model === device.model && x.storage === device.storage).sort(variantOrder);
}
/** The row we assume until the customer tells us the condition. */
// Every trade-in is a used device, so we value it on the used row for that model and storage.
const USED_FIRST = ['Nigerian USED', 'Foreign USED', 'Foreign USED (Non LLA)', 'Active Brand New (Non LLA)', 'Active Brand New', 'Brand New'];
function defaultRow(rows) {
  for (const c of USED_FIRST) { const r = rows.find((x) => x.condition === c); if (r) return r; }
  return rows[0];
}

function questionsFor(device) {
  // Consoles get their own short check: controllers, games included, hacked or not.
  if (isConsole(device)) return [{ key: 'pads' }, { key: 'games' }, { key: 'hacked' }];
  if (isSpeaker(device)) return [{ key: 'perfect' }];
  if (isPerfectOnly(device)) return [{ key: 'icloud' }, { key: 'perfect' }];
  const qs = [{ key: 'icloud' }];

  if (applies(device, 'battery')) qs.push({ key: 'battery' });
  if (applies(device, 'body')) qs.push({ key: 'neatness' });
  if (applies(device, 'network') && device.type === 'Phones') qs.push({ key: 'network' });
  const faults = faultsFor(device, { includeUnpriced: CONFIG.showUnpricedFaults });
  if (faults.length) qs.push({ key: 'faults', faults });
  return qs;
}
function answered(q, a) {
  switch (q.key) {
    case 'origin': return !!a.origin;
    case 'icloud': return a.icloudLocked === false;
    case 'battery': return a.batteryUnknown || !!a.batteryBand;
    case 'neatness': return !!a.neatness;
    case 'network': return !!a.network;
    case 'faults': return a.faultsDone || a.faults.length > 0;
    case 'pads': return !!a.pads;
    case 'games': return !!a.games;
    case 'hacked': return a.hacked === true || a.hacked === false;
    case 'perfect': return a.perfect === true;
    default: return true;
  }
}
export function engineAnswers(a, device) {
  return {
    sim: hasSimQuestion(device) ? (a.sim || 'both') : '',
    icloudLocked: a.icloudLocked === true,
    battery: a.batteryUnknown || !a.batteryBand ? null : BATTERY_BANDS.find((b) => b.key === a.batteryBand).value,
    batteryLabel: a.batteryBand ? BATTERY_BANDS.find((b) => b.key === a.batteryBand).label : '',
    neatness: a.neatness,
    network: device.type === 'Phones' ? a.network : 'factory',
    faults: a.faults,
    ...(isConsole(device) ? { pads: a.pads, games: a.games, hacked: a.hacked === true } : {}),
    ...(isPerfectOnly(device) ? { perfect: a.perfect !== false } : {}),
  };
}
function currentValue(app) {
  const d = ownDevice(app);
  return d ? valueDevice(d, engineAnswers(app.s.answers, d), app.catalog.settings) : null;
}
/** Up to 3 trade-in devices: the ones already valued (s.more) plus the one in progress. */
export const MAX_TRADE = 3;
function tradeIns(app) {
  const s = app.s;
  const out = [];
  for (const m of s.more || []) {
    const d = app.catalog.byId.get(m.deviceId);
    if (d) out.push({ d, answers: m.answers, r: valueDevice(d, engineAnswers(m.answers, d), app.catalog.settings) });
  }
  const d = ownDevice(app);
  if (d && allAnswered(app)) out.push({ d, answers: s.answers, r: currentValue(app), current: true });
  return out;
}
/** Left the extra-device steps without finishing: put the last valued device back. */
function settleAdding(app) {
  const s = app.s;
  if (!s.adding) return;
  if (ownDevice(app) && allAnswered(app)) return; // still in progress or just finished; choose() clears the flag
  s.adding = false;
  if ((s.more || []).length) { const last = s.more.pop(); s.deviceId = last.deviceId; s.answers = last.answers; }
  app.save();
}
/** Combined trade-in value of every device, or null if any isn't accepted. */
function totalValue(app) {
  const t = tradeIns(app);
  if (!t.length || t.some((x) => !x.r || !x.r.accepted)) return null;
  return t.reduce((sum, x) => sum + x.r.value, 0);
}
function allAnswered(app) {
  CATALOG = app.catalog;
  const d = ownDevice(app);
  return d && questionsFor(d).every((q) => answered(q, app.s.answers));
}
function targets(app) {
  return [...dealRows(app.catalog), ...listRows(app.catalog, 'prices').filter((d) => CONFIG.swapTypes.includes(d.type))];
}

// ---------- home ----------

function home(el, app) {
  const max = app.catalog.settings['compare.maxDevices'] || 6;
  el.classList.add('home');
  el.innerHTML = layout(html`
    <div class="home-intro">
      <p class="home-kicker">Swap · Trade In · Upgrade</p>
      <h1 class="h-display">The fastest way<br>to <span class="blue">Swap.</span></h1>
      <p class="lead">Trade in the Phone, Watch, Speaker, Console or AirPods you’ve got for the one you love 💙 and get your swap balance in under a minute.</p>
    </div>
    <div class="stack tight">
      <button class="btn green" type="button" data-act="prices">Check for Prices</button>
      <button class="btn" type="button" data-act="trade">Check My Trade-In Value</button>
      <button class="btn blue" type="button" data-act="swap">Calculate My Swap Rate</button>
    </div>
    <div class="home-tail">
      <p class="home-note">Get an honest value in minutes, compare up to ${max} devices side by side, then swap in Port Harcourt, Abuja, Lagos, Uyo or Yenagoa, or send your device in from anywhere.</p>
    </div>`, '').toString();
  wire(el, app, {
    openq: () => app.go('openq'),
    prices: () => app.go('prices'),
    tradeList: () => app.go('trade-in'),
    trade: () => app.go('trade-in'),
    swap: () => startFlow(app, 'swap'),
  });
}

function startFlow(app, mode) {
  const s = app.s;
  s.mode = mode;
  // Every start from Home is a new quote: no device, answers or swap choices carried over.
  Object.assign(s, { deviceId: '', answers: freshAnswers(), more: [], adding: false, compare: [], city: '', saved: null, cash: false, editing: '', quoteId: '' });
  s.pick = freshPick();
  app.save();
  app.go('pick');
}

/** Deep link from the Trade-In Values list (?device=id). */
function startWith(app, id) {
  const s = app.s;
  if (s.deviceId !== id) { s.deviceId = id; s.answers = freshAnswers(); s.saved = null; s.compare = []; s.city = ''; s.more = []; s.adding = false; s.editing = ''; s.quoteId = ''; }
  s.mode = 'trade';
  app.save();
  history.replaceState({ screen: 'home', params: {}, d: 0 }, '', './');
  app.go('loading');
}

// ---------- device picker (their device, or devices to compare) ----------

function picker(el, app, params) {
  const add = params.purpose === 'add';
  const s = app.s;
  const st = add ? s.add : s.pick;
  const devices = add ? targets(app) : listRows(app.catalog, 'trade-in');
  const cat = app.catalog;
  const byOrder = (a, b) =>
    (cat.groupOrder.get(a.series) ?? 1e9) - (cat.groupOrder.get(b.series) ?? 1e9) ||
    (cat.nameOrder.get(a.model) ?? 1e9) - (cat.nameOrder.get(b.model) ?? 1e9) || variantOrder(a, b);
  const types = [...new Set(devices.map((d) => d.type))];
  const max = Number(cat.settings['compare.maxDevices']) || 6;

  function level() {
    if (!st.type) return 'type';
    const brands = [...new Set(devices.filter((d) => d.type === st.type).map((d) => d.brand))];
    if (!st.brand && brands.length > 1) return 'brand';
    if (!st.brand) st.brand = brands[0];
    if (!st.model) return 'model';
    return 'version';
  }
  const figure = (d) => (add ? naira(d.price) : `Up to ${naira(d.tradeInValue)}`);
  const version = (d, withModel) => {
    const on = add ? s.compare.includes(d.id) : s.deviceId === d.id;
    const deal = d.condition === 'Deal';
    // Two short lines instead of one long one: what it is, then its condition and figure.
    const title = withModel ? d.model : (d.storage || d.condition);
    const sub = deal ? [withModel ? d.storage : '', d.dealNote].filter(Boolean).join(' · ')
      : withModel ? variantName(d) : (d.storage ? d.condition : '');
    if (add && d.stock === 'soldout') {
      return html`<div class="opt ver out" aria-disabled="true"><span class="main">${title}${sub ? html`<span class="sub">${sub}</span>` : ''}</span><span class="val sold">Sold out</span></div>`;
    }
    return html`<button class="opt ver" type="button" role="${add ? 'checkbox' : 'radio'}" aria-checked="${on ? 'true' : 'false'}" data-act="version" data-id="${d.id}">
      <span class="main">${title}${deal ? raw('<span class="tag">One unit</span>') : ''}${sub ? html`<span class="sub">${sub}</span>` : ''}</span>
      <span class="val">${add ? '' : raw('<small>Up to</small>')}${add ? naira(d.price) : naira(d.tradeInValue)}</span>${add ? raw('<span class="tick box" aria-hidden="true"></span>') : ''}</button>`;
  };

  // Swap devices: one card per model, each storage and condition a compact row with its own tick (Daniel, 7 Oct).
  const cfgRow = (d) => {
    const on = s.compare.includes(d.id);
    // "256gb eSIM only" → "256gb · eSIM Only", with the condition underneath: two short lines a row.
    const [size, ...note] = String(d.storage || '').split(' ');
    const top = [size, note.join(' ').replace(/\bonly\b/i, 'Only')].filter(Boolean).join(' · ') || 'Standard';
    // Price sits on the second line, beside the condition, so the first line has the full width.
    const line2 = (v) => html`<span class="l2"><span class="sub">${conditionLabel(d.condition)}</span>${v}</span>`;
    if (d.stock === 'soldout') return html`<div class="cfg out" aria-disabled="true"><span class="main">${top}${line2(raw('<span class="val sold">Sold out</span>'))}</span></div>`;
    return html`<button class="cfg" type="button" role="checkbox" aria-checked="${on ? 'true' : 'false'}" data-act="version" data-id="${d.id}"><span class="main">${top}${line2(html`<span class="val">${naira(d.price)}</span>`)}</span><span class="tick box" aria-hidden="true"></span></button>`;
  };
  const modelCards = (rows) => {
    const out = []; const at = new Map();
    for (const d of rows) {
      if (d.condition === 'Deal') { out.push(version(d, true)); continue; }
      if (!at.has(d.model)) { at.set(d.model, []); out.push(at.get(d.model)); }
      at.get(d.model).push(d);
    }
    return out.map((g) => (Array.isArray(g)
      ? html`<div class="mcard${g.some((d) => s.compare.includes(d.id)) ? ' has-sel' : ''}"><p class="mcard-t">${g[0].model}</p>${g.map(cfgRow)}</div>`
      : g));
  };

  el.classList.add('picking');
  CATALOG = app.catalog;
  // Your own device: model, then storage size. Condition comes later, with the other questions.
  const byStorage = (rows) => {
    const seen = new Map();
    for (const d of rows) { const k = `${d.model}|${d.storage}`; if (!seen.has(k)) seen.set(k, []); seen.get(k).push(d); }
    return [...seen.values()].map((g) => ({ ...defaultRow(g), _max: Math.max(...g.map((x) => x.tradeInValue || 0)) }));
  };
  const storageOpt = (d, withModel) => html`<button class="opt ver" type="button" role="radio" aria-checked="${s.deviceId && ownDevice(app)?.model === d.model && ownDevice(app)?.storage === d.storage ? 'true' : 'false'}" data-act="version" data-id="${d.id}">
      <span class="main">${withModel ? d.model : (tradeStorage(d.storage) || 'Standard')}${withModel && d.storage ? html`<span class="sub">${tradeStorage(d.storage)}</span>` : ''}</span>
      ${raw(ICON.chevron)}</button>`;

  function draw(typing = false) {
    const lv = level();
    const q = st.search.trim();
    const crumbs = [];
    if (st.type) crumbs.push(['type', TYPE_LABEL[st.type] || st.type]);
    const brandsInType = new Set(devices.filter((d) => d.type === st.type).map((d) => d.brand));
    if (st.brand && brandsInType.size > 1) crumbs.push(['brand', st.brand]);
    if (st.model) crumbs.push(['model', st.model]);

    let title; let help;
    if (add) {
      title = 'Add a device to compare.';
      help = { type: 'What would you like to swap into? ⤵️', brand: 'Which brand?', model: 'Which model would you like?', version: `Tick each storage and condition you want to compare. ${s.compare.length} of ${max} added.` }[lv];
    } else if (st.type === 'Games') {
      title = { type: 'Select your device to get started.', brand: 'Which brand is it?', model: 'Which console do you have?', version: 'Which edition is it?' }[lv];
      help = {
        type: `What kind of device do you want to ${s.mode === 'swap' ? 'Swap' : 'Trade In'}?`,
        brand: 'Pick the brand of your console.',
        model: 'Check the label on the back or bottom of the console.',
        version: 'The Disc edition has a disc slot. The Digital edition doesn’t.',
      }[lv];
    } else {
      title = { type: 'Select your device to get started.', brand: 'Which brand is it?', model: 'Which model do you have?', version: 'What’s your storage size?' }[lv];
      help = {
        type: `What kind of device do you want to ${s.mode === 'swap' ? 'Swap' : 'Trade In'}?`,
        brand: 'Pick the brand of your device.',
        model: st.brand === 'Apple' ? 'Find it in Settings › General › About.' : 'Find it in Settings › About phone.',
        version: 'Find it in Settings › General › About › Capacity.',
      }[lv];
    }

    let options;
    if (q) {
      // Search stays inside what's already picked (Phones, then Apple…), so "12" under Phones doesn't bring up iPads.
      const found = devices.filter((d) => (!st.type || d.type === st.type) && (!st.brand || d.brand === st.brand) && matches(d, q)).sort(byOrder).slice(0, 60);
      options = found.length ? (add ? modelCards(found) : byStorage(found).map((d) => storageOpt(d, true))) : html`<p class="empty">No devices match “${q}”.</p>`;
    } else if (lv === 'type') {
      options = types.map((t) => html`<button class="opt" type="button" data-act="type" data-v="${t}"><span class="main">${TYPE_LABEL[t] || t}</span>${raw(ICON.chevron)}</button>`);
    } else if (lv === 'brand') {
      const brands = [...new Set(devices.filter((d) => d.type === st.type).map((d) => d.brand))];
      options = brands.map((b) => html`<button class="opt" type="button" data-act="brand" data-v="${b}"><span class="main">${b}</span>${raw(ICON.chevron)}</button>`);
    } else if (lv === 'model') {
      const scoped = devices.filter((d) => d.type === st.type && d.brand === st.brand).sort(byOrder);
      const groups = [];
      const seen = new Set();
      for (const d of scoped) {
        if (seen.has(d.model)) continue;
        seen.add(d.model);
        let g = groups[groups.length - 1];
        if (!g || g.series !== d.series) { g = { series: d.series, models: [] }; groups.push(g); }
        const n = scoped.filter((x) => x.model === d.model);
        // Summarise what's on offer instead of a count: "256gb · 512gb" or "128gb · Brand New".
        const sizes = [...new Set(n.map((x) => x.storage).filter(Boolean))];
        const conds = [...new Set(n.map((x) => x.condition))];
        const summary = sizes.join(' · ') || 'One size';
        g.models.push({ model: d.model, n: n.length, summary, sel: n.some((x) => (add ? s.compare.includes(x.id) : s.deviceId === x.id)) });
      }
      options = groups.map((g) => html`<p class="group-label">${g.series}</p>${g.models.map((m) => html`
        <button class="opt${m.sel ? ' is-selected' : ''}" type="button" data-act="model" data-v="${m.model}">
          <span class="main">${m.model}<span class="sub">${m.summary}</span></span>${raw(ICON.chevron)}</button>`)}`);
    } else {
      const vs = devices.filter((d) => d.model === st.model).sort(variantOrder);
      options = add ? modelCards(vs) : byStorage(vs).map((d) => storageOpt(d, false));
    }

    // Progress through picking your device: type → brand → model → storage (then Calculating).
    const STEPS = ['type', 'brand', 'model', 'version'];
    const frac = add ? 0 : (st.search ? STEPS.indexOf(lv) : STEPS.indexOf(lv)) / STEPS.length;
    const fromFrac = prevFrac ?? frac;
    const oldHead = $('.pick-head', el);
    const oldKey = oldHead?.dataset.key;
    const headKey = `${lv}|${title}`;
    const mainHtml = html`
      ${add ? '' : html`<div class="progress pick-progress" aria-hidden="true"><i style="transform:scaleX(${fromFrac})"></i></div>`}
      <div class="pick-head-wrap"><div class="pick-head" data-key="${headKey}">
        <h2 class="h-title">${title}</h2>
        <p class="par">${help}</p>
      </div></div>
      <div class="pick-search"><label class="field"><span class="visually-hidden">Search devices</span>${raw(ICON.search)}
        <input type="search" data-search placeholder="Search, e.g. 13 pro max 256" value="${st.search}" autocomplete="off" enterkeyhint="search">
        <button class="clear" type="button" data-act="clear" aria-label="Clear search">${raw(ICON.clear)}</button></label></div>
      ${crumbs.length ? html`<nav class="trail" aria-label="Your choices">${crumbs.map(([k, label], n) => html`${n ? raw('<span class="trail-sep" aria-hidden="true">›</span>') : ''}<button class="chip" type="button" aria-pressed="true" data-act="crumb" data-v="${k}" aria-label="${label}, selected. Tap to change.">${label}<span class="chip-x" aria-hidden="true">×</span></button>`)}</nav>` : ''}
      <div class="stack">${options}</div>`;
    const fullHtml = layout(raw(mainHtml.toString()), pills(backPill(), add ? html`<button class="pill go" type="button" data-act="done">Done</button>` : '')).toString();
    // While typing, leave the search box itself alone (re-creating it resets the phone keyboard and slows typing):
    // swap in only the heading, trail and results.
    if (typing && $('[data-search]', el)) {
      const tmp = document.createElement('div');
      tmp.innerHTML = fullHtml;
      for (const sel of ['.pick-head-wrap', '.stack', '.screen-foot']) {
        const a = $(sel, el), b = $(sel, tmp);
        if (a && b && a.innerHTML !== b.innerHTML) a.replaceWith(b);
      }
      const oldTrail = $('nav.trail', el), newTrail = $('nav.trail', tmp);
      if (oldTrail && newTrail) oldTrail.replaceWith(newTrail);
      else if (oldTrail) oldTrail.remove();
      else if (newTrail) $('.stack', el)?.before(newTrail);
      const bar = $('.pick-progress i', el);
      if (bar) bar.style.transform = `scaleX(${frac})`;
      prevFrac = frac;
      app.s._pickFrac = frac;
      return;
    }
    el.innerHTML = fullHtml;
    prevFrac = frac;
    // The trail scrolls so the latest choice (the one most likely to be changed) is in view.
    const trail = $('.trail', el);
    if (trail) trail.scrollLeft = trail.scrollWidth;
    app.s._pickFrac = frac;
    const bar = $('.pick-progress i', el);
    if (bar && fromFrac !== frac) requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.transform = `scaleX(${frac})`; }));
    // The heading slides out as the next one slides in.
    const newHead = $('.pick-head', el);
    if (oldHead && oldKey !== headKey && newHead && newHead.animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const back = STEPS.indexOf(lv) < STEPS.indexOf((oldKey || '').split('|')[0]);
      const dx = back ? -1 : 1;
      oldHead.classList.add('leaving');
      newHead.parentElement.appendChild(oldHead);
      const ease = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
      oldHead.animate([{ transform: 'none', opacity: 1 }, { transform: `translateX(${-40 * dx}px)`, opacity: 0 }], { duration: 260, easing: ease }).onfinish = () => oldHead.remove();
      newHead.animate([{ transform: `translateX(${40 * dx}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 320, easing: ease });
    }
  }

  let prevFrac = null;
  draw();
  el.addEventListener('input', (e) => {
    if (!e.target.matches('[data-search]')) return;
    st.search = e.target.value;
    draw(true);
  });
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-back]')) {
      e.stopPropagation();
      // Step back one level inside the picker before leaving it.
      if (st.search) { st.search = ''; draw(); return; }
      const brands = new Set(devices.filter((d) => d.type === st.type).map((d) => d.brand));
      if (st.model) st.model = '';
      else if (st.brand && brands.size > 1) st.brand = '';
      else if (st.type) { st.type = ''; st.brand = ''; }
      else { app.back(); return; }
      if (st.brand && brands.size <= 1 && !st.model) { st.brand = ''; st.type = ''; }
      draw();
      el.closest('.popup-body').scrollTop = 0;
      return;
    }
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const v = a.dataset.v;
    const top = () => { el.closest('.popup-body').scrollTop = 0; };
    switch (a.dataset.act) {
      case 'type': st.type = v; st.brand = ''; st.model = ''; draw(); top(); break;
      case 'brand': st.brand = v; st.model = ''; draw(); top(); break;
      case 'model': st.model = v; draw(); top(); break;
      case 'crumb':
        if (v === 'type') { st.type = ''; st.brand = ''; st.model = ''; }
        if (v === 'brand') { st.brand = ''; st.model = ''; }
        if (v === 'model') st.model = '';
        draw(); top(); break;
      case 'clear': st.search = ''; draw(); $('[data-search]', el).focus(); break;
      case 'version': {
        const id = a.dataset.id;
        haptic();
        if (add) {
          if (s.compare.includes(id)) s.compare = s.compare.filter((x) => x !== id);
          else if (s.compare.length >= max) { app.toast(`You can compare up to ${max} devices. Remove one first.`); return; }
          else s.compare.push(id);
          s.saved = null;
          app.save();
          const d = app.catalog.byId.get(id);
          if (d && !st.search) st.model = d.model;
          draw();
          $(`[data-id="${CSS.escape(id)}"]`, el)?.focus({ preventScroll: true });
        } else {
          const cur = ownDevice(app); const nd = app.catalog.byId.get(id);
          // Changing the trade-in device keeps the swap devices already picked (a new quote from Home clears them).
          if (!cur || cur.model !== nd.model || cur.storage !== nd.storage) { s.deviceId = id; s.answers = freshAnswers(); s.saved = null; }
          const d = app.catalog.byId.get(id);
          Object.assign(st, { type: d.type, brand: d.brand, model: d.model, search: '' });
          app.save();
          app.go('loading');
        }
        break;
      }
      case 'done': app.back(); break;
      default:
    }
  });
}

// ---------- brief loading moment before the result ----------

function loading(el, app) {
  const d = ownDevice(app);
  if (!d) { app.go('pick', {}, { replace: true }); return false; }
  // iPhone 14 and up: the SIM version comes first, before any value is shown.
  if (hasSimQuestion(d) && !app.s.answers.sim) { app.go('sim', {}, { replace: true }); return false; }
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ms = reduce ? 900 : 1900;
  const from = typeof app.s._pickFrac === 'number' ? app.s._pickFrac : 0.75;
  el.classList.add('loading');
  // Everything else steps away; the progress bar carries the wait, then the result appears.
  el.innerHTML = layout(html`
    <div class="progress pick-progress load-bar" aria-hidden="true"><i style="transform:scaleX(${from})"></i></div>
    <p class="visually-hidden" role="status">Calculating your trade-in value for ${d.model} ${tradeStorage(d.storage)}</p>`, '').toString();
  const bar = $('.load-bar i', el);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    bar.style.transition = `transform ${ms - 200}ms cubic-bezier(0.45, 0.05, 0.25, 1)`;
    bar.style.transform = 'scaleX(1)';
  }));
  setTimeout(() => {
    app.s._pickFrac = 0;
    if (app.screen === 'loading') app.go('confirm', {}, { replace: true });
  }, ms);
}

// ---------- SIM version (iPhone 14 and up), straight after model and storage ----------

function simScreen(el, app) {
  const d = ownDevice(app);
  if (!d) { app.go('pick', {}, { replace: true }); return false; }
  if (!hasSimQuestion(d)) { app.go('loading', {}, { replace: true }); return false; }
  const a = app.s.answers;
  el.innerHTML = layout(html`
    <div class="head-block">
      <h2 class="h-title">Which SIM version is it?</h2>
      <p class="par">Check the side of your ${d.model} for a SIM tray.</p>
    </div>
    <div class="stack q-opts" role="radiogroup">
      ${SIM.map((o) => html`<button class="opt" type="button" role="radio" aria-checked="${a.sim === o.key ? 'true' : 'false'}" data-act="sim" data-v="${o.key}">
        <span class="main">${o.label}<span class="sub">${o.hint}</span></span><span class="tick" aria-hidden="true"></span></button>`)}
    </div>`, pills(backPill())).toString();
  wire(el, app, {
    sim: (b) => {
      a.sim = b.dataset.v;
      // A network answer that doesn't fit the new SIM version is cleared (e.g. Chip Unlocked on an eSIM-only phone).
      if (a.network && !networkOptionsFor(d, a.sim).some((n) => n.key === a.network)) a.network = null;
      app.s.saved = null; app.save(); haptic();
      app.go(app.s._simReturn || 'loading', {}, { replace: true });
      app.s._simReturn = '';
    },
  });
}

// ---------- "Congratulations" (the original result, kept) ----------

function confirm(el, app) {
  CATALOG = app.catalog;
  const d = ownDevice(app);
  if (!d) { app.go('pick', {}, { replace: true }); return false; }
  // The SIM version is already known here (iPhone 14 and up), so the value shown already allows for it.
  const sim = hasSimQuestion(d) ? (app.s.answers.sim || 'both') : '';
  const simLine = sim ? simDeduction(d, sim, app.catalog.settings) : null;
  const upTo = Math.max(0, (d.tradeInValue || 0) - (simLine?.amount || 0));
  const name = [d.model, tradeStorage(d.storage)].filter(Boolean).join(', ');
  el.innerHTML = html`
    <div class="head-block">
      <h2 class="h-title">Your Device</h2>
      <p class="par">Here’s the standard Trade-In Value for the device you picked.</p>
    </div>
    <div class="stack crumbs">
      <button class="opt crumb" type="button" data-act="change"><span class="main">${d.model}</span><span class="edit">Change</span></button>
      ${d.storage ? html`<button class="opt crumb" type="button" data-act="change"><span class="main">${tradeStorage(d.storage)}</span><span class="edit">Change</span></button>` : ''}
      ${sim ? html`<button class="opt crumb" type="button" data-act="chsim"><span class="main">${SIM.find((o) => o.key === sim).label}</span><span class="edit">Change</span></button>` : ''}
    </div>
    <div class="result-block">
    <div class="tiv">
      <p class="tiv-label">Up to</p>
      <p class="big-num">${naira(upTo)}</p>
    </div>
    <p class="congrats">Congratulations!</p>
    <p class="par">You can Trade In your <strong>${name}</strong> for <strong>Cash</strong> or <strong>Swap</strong> to another device. ${isConsole(d) ? 'This is its value with one controller, in good working condition.' : isPerfectOnly(d) ? 'This is its value in perfect condition.' : 'This is its value in good working condition.'}</p>
    ${d.onlyIfBought ? html`<p class="notice-only">We only accept this model as a trade-in if it was bought from us.</p>` : ''}
    </div>`;
  el.innerHTML = layout(raw(el.innerHTML), pills(backPill(), html`<button class="pill go" type="button" data-act="ok">Confirm</button>`)).toString();
  wire(el, app, {
    chsim: () => { app.s._simReturn = 'confirm'; app.save(); app.go('sim'); },
    change: () => app.go('pick'),
    // Consoles skip the phone shortcut and go straight to their three questions.
    ok: () => (isConsole(d) || isPerfectOnly(d) ? app.go('conds') : app.go('good')),
  });
}

// ---------- optional: "good working condition?" (the old SwapDesk shortcut) ----------

function good(el, app) {
  CATALOG = app.catalog;
  const d = ownDevice(app);
  if (!d) { app.go('pick', {}, { replace: true }); return false; }
  const th = app.catalog.settings.batteryThreshold || 85;
  const items = [
    ['Bluetooth, mobile data and Wi-Fi', 'work normally'],
    applies(d, 'camera') && ['Cameras', 'work, and every lens is intact'],
    applies(d, 'battery') && ['Battery health', `is ${th}% or higher`],
    applies(d, 'body') && ['Body', 'has no dents or deep scratches'],
    applies(d, 'screen') && ['Screen and back glass', 'are not broken'],
    applies(d, 'network') && d.type === 'Phones' && ['Network', 'is not locked, and no chip is used'],
    (applies(d, 'faceId') || applies(d, 'touchId')) && ['Face ID or Touch ID', 'works normally'],
  ].filter(Boolean);
  el.innerHTML = layout(html`
    <div class="head-block">
      <h2 class="h-title">Is it in good working condition?</h2>
      <p class="par">You can say <strong>Yes</strong> if:</p>
    </div>
    <ul class="checks">${items.map(([b, t]) => html`<li><b>${b}</b> ${t}.</li>`)}</ul>
    <div class="stack q-opts">
      <button class="opt" type="button" data-act="yes"><span class="main">Yes<span class="sub">Get my value now</span></span>${raw(ICON.chevron)}</button>
      <button class="opt" type="button" data-act="no"><span class="main">No<span class="sub">Answer a few questions for an exact figure</span></span>${raw(ICON.chevron)}</button>
    </div>`, pills(backPill())).toString();
  wire(el, app, {
    yes: () => {
      Object.assign(app.s.answers, { icloudLocked: false, battery: '', batteryUnknown: true, neatness: 'spotless', network: app.s.answers.sim === 'esim' ? 'esim' : 'factory', faults: [], faultsDone: true, quick: true });
      app.s.saved = null; app.save(); app.go('choose');
    },
    no: () => { app.s.answers.quick = false; app.save(); app.go('conds'); },
  });
}


// ---------- open a saved quote from its code ----------

function openQuote(el, app) {
  el.innerHTML = layout(html`
    <div class="head-block">
      <h2 class="h-title">Open a Quote</h2>
      <p class="par">Type the quote code. It’s under <b>Your Swap Quote</b> on the quote picture, and at the end of the quote link (swapdesk.ng/?q=<b>SD-…</b>).</p>
    </div>
    <label class="field oq-field"><span class="visually-hidden">Quote code</span>
      <input data-code placeholder="SD-XXXXXX" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="12" enterkeyhint="go"></label>
    <p class="small oq-err" role="alert"></p>`,
  pills(backPill(), html`<button class="pill go" type="button" data-act="open">Open</button>`)).toString();
  const inp = $('[data-code]', el);
  const open = () => {
    let v = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (v.startsWith('SD')) v = v.slice(2);
    if (v.length !== 6) { $('.oq-err', el).textContent = 'A quote code looks like SD-ABC123: SD- and 6 letters or numbers.'; return; }
    app.go('quote', { id: `SD-${v}` });
  };
  wire(el, app, { open });
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
  inp.addEventListener('input', () => { $('.oq-err', el).textContent = ''; });
  setTimeout(() => inp.focus(), 250);
}

// ---------- conditions page: pick only the groups that have an issue ----------

const GROUP = {
  icloud: (apple) => [apple ? 'iCloud' : 'Account Lock', apple ? 'Is it iCloud locked?' : 'Is it locked to an account?'],
  battery: () => ['Battery', 'Health below 85%, or replaced'],
  network: () => ['Network', 'eSIM only, chip or network locked'],
  neatness: () => ['Body Neatness', 'Scratches, dents or chips'],
  faults: (apple, d) => ['Others', `Screen, ${applies(d, 'faceId') ? 'Face ID' : applies(d, 'touchId') ? 'Touch ID' : 'speakers'}, cameras & more`],
  // Consoles (Daniel, 2 Oct)
  pads: () => ['Controllers', 'Valued with 1 controller. 2 or more adds to it'],
  games: () => ['Games', 'Any game discs included? 1–2 add ₦5,000, 3 or more add ₦10,000'],
  hacked: () => ['Hacked', 'Jailbroken, modded or custom firmware?'],
  // Speakers (Daniel, 2 Oct)
  perfect: (apple, d) => ['Faults or Damage', isSpeaker(d) ? 'Not charging, poor sound, cracks or water damage?' : 'Cracks, dents, replaced parts or anything not working?'],
};
const GROUP_ORDER = ['icloud', 'battery', 'network', 'neatness', 'faults', 'pads', 'games', 'hacked', 'perfect'];

function conditions(el, app) {
  const d = ownDevice(app);
  if (!d) { app.go('pick', {}, { replace: true }); return false; }
  CATALOG = app.catalog;
  const s = app.s; const a = s.answers;
  a.quick = false;
  const apple = d.brand === 'Apple';
  const keys = questionsFor(d).map((q) => q.key);
  const groups = GROUP_ORDER.filter((k) => keys.includes(k));
  const touched = new Set(a.touched || []);
  // What each group is set to, shown under its name once it's been filled.
  const now = (k) => {
    if (k === 'icloud') return a.icloudLocked === true ? (apple ? 'iCloud Locked' : 'Account Locked') : a.icloudLocked === false ? 'Not Locked' : '';
    if (k === 'battery') {
      const band = a.healthHidden ? 'Health Not Showing' : (BATTERY_BANDS.find((b) => b.key === a.batteryBand)?.label || '');
      return (a.faults || []).includes('batteryReplaced') ? ['Replaced Battery', band].filter(Boolean).join(' · ') : band;
    }
    if (k === 'network') return NETWORK.find((n) => n.key === a.network)?.label || '';
    if (k === 'neatness') return NEATNESS.find((n) => n.key === a.neatness)?.label || '';
    if (k === 'pads') return PADS.find((x) => x.key === a.pads)?.label || '';
    if (k === 'games') return GAMES.find((x) => x.key === a.games)?.label || '';
    if (k === 'perfect') return a.perfect === false ? 'Has a fault' : a.perfect === true ? 'Works perfectly' : '';
    if (k === 'hacked') return a.hacked === true ? 'Hacked' : a.hacked === false ? 'Not hacked' : '';
    if (k === 'faults') { const f = (a.faults || []).filter((x) => x !== 'batteryReplaced').map((x) => FAULTS.find((y) => y.key === x)?.label).filter(Boolean); return f.length ? f.join(', ') : (a.faultsDone ? 'Everything Works' : ''); }
    return '';
  };
  const r = valueDevice(d, engineAnswers({ ...defaultsFor(a) }, d), app.catalog.settings);
  el.innerHTML = layout(html`
    <div class="head-block">
      <h2 class="h-title">${isConsole(d) ? 'About your console' : isSpeaker(d) ? 'About your speaker' : 'Any issues with it?'}</h2>
      <p class="par">${isPerfectOnly(d) ? `${perfectOnlyText(d)} Tap below only if something’s wrong with your ${d.model}.` : isConsole(d) ? `Tap only what applies to your ${d.model}. Anything you skip counts as 1 controller, no games and not hacked.` : `Tap only what applies to your ${d.model}. Anything you skip counts as fine.`}</p>
    </div>
    <div class="stack q-opts conds" role="group">
      ${groups.map((k) => { const [name, hint] = GROUP[k](apple, d); const on = touched.has(k); return html`
        <button class="opt" type="button" role="checkbox" aria-checked="${on ? 'true' : 'false'}" data-act="grp" data-v="${k}">
          <span class="main">${name}<span class="sub">${on && now(k) ? now(k) : hint}</span></span><span class="tick box" aria-hidden="true"></span></button>`; })}
    </div>
    ${isPerfectOnly(d) && a.perfect === false ? html`<div class="stop left"><b>${perfectOnlyText(d)}</b>Get it fixed first, then come back for your value.</div>`
      : a.icloudLocked === true ? html`<div class="stop left"><b>We can’t accept locked devices.</b>Sign out of ${apple ? 'iCloud and turn off Find My' : 'your accounts'}, then continue.</div>`
      : r.accepted ? html`<p class="small conds-val">Value so far: <b>${naira(r.value)}</b></p>` : ''}`,
  pills(backPill(), html`<button class="pill go" type="button" data-act="proceed" ${a.icloudLocked === true || (isPerfectOnly(d) && a.perfect === false) ? 'disabled' : ''}>Proceed</button>`)).toString();
  wire(el, app, {
    grp: (b) => app.go('q', { k: b.dataset.v }),
    proceed: () => {
      Object.assign(a, defaultsFor(a));
      s.saved = null; app.save();
      app.go('value');
    },
  });
}
/** Groups left alone count as "no issue". */
function defaultsFor(a) {
  return {
    ...a,
    icloudLocked: a.icloudLocked === true,
    batteryUnknown: a.batteryBand ? false : true,
    neatness: a.neatness || 'prettyNeat',
    network: a.network || (a.sim === 'esim' ? 'esim' : 'factory'),
    faults: a.faults || [],
    faultsDone: true,
    pads: a.pads || '1',
    games: a.games || 'none',
    hacked: a.hacked === true,
    perfect: a.perfect !== false,
  };
}

// ---------- condition questions, one per screen ----------

function question(el, app, params) {
  const d = ownDevice(app);
  if (!d) { app.go('pick', {}, { replace: true }); return false; }
  CATALOG = app.catalog;
  const s = app.s;
  const a = s.answers;
  const qs = questionsFor(d);
  // Opened from the conditions page: one group (params.k), then straight back to that page.
  const hub = !!params.k;
  const i = hub ? Math.max(0, qs.findIndex((x) => x.key === params.k)) : Math.min(Number(params.i) || 0, qs.length - 1);
  const q = qs[i];

  const opt = (checked, attrs, main, sub, extra = '') => html`
    <button class="opt" type="button" role="radio" aria-checked="${checked ? 'true' : 'false'}" ${raw(attrs)}>
      ${raw(extra)}<span class="main">${main}${sub ? html`<span class="sub">${sub}</span>` : ''}</span><span class="tick" aria-hidden="true"></span></button>`;

  function body() {
    const apple = d.brand === 'Apple';
    switch (q.key) {
      case 'origin':
        return html`<h2 class="h-title">Is it new or used?</h2>
          <p class="par">This sets the starting value for your ${d.model}${d.storage ? `, ${d.storage}` : ''}.</p>
          <div class="stack q-opts" role="radiogroup">${q.options.map((o) => {
            const [label, hint] = ORIGIN_LABEL[o.condition] || [o.condition, ''];
            return html`<button class="opt ver" type="button" role="radio" aria-checked="${a.origin === o.id ? 'true' : 'false'}" data-act="origin" data-v="${o.id}">
              <span class="main">${label}<span class="sub">${hint}</span></span><span class="tick" aria-hidden="true"></span></button>`;
          })}</div>`;
      case 'icloud':
        return html`<div class="head-block"><h2 class="h-title">${apple ? 'Is it iCloud Locked?' : 'Is it Account Locked?'}</h2>
          <p class="par">${apple ? 'Do you remember your iCloud password, and can you sign out of the device?' : 'Do you remember your Google or Samsung account password, and can you sign out of the device?'}</p></div>
          <div class="stack q-opts" role="radiogroup">
            ${opt(a.icloudLocked === false, 'data-act="icloud" data-v="no"', 'Yes, I can Sign Out')}
            ${opt(a.icloudLocked === true, 'data-act="icloud" data-v="yes"', apple ? 'No, It is iCloud Locked' : 'No, It is Account Locked')}</div>
          ${a.icloudLocked === true ? html`<div class="stop left"><b>We can’t accept locked devices.</b>Sign out of ${apple ? 'iCloud and turn off Find My' : 'your accounts'}, then continue.</div>` : ''}`;
      case 'battery':
        return html`<div class="head-block"><h2 class="h-title">What’s the battery health?</h2>
          <p class="par">${apple ? raw('Go to <b>Settings › Battery › Battery Health &amp; Charging</b> and check <b>Maximum Capacity</b>.') : 'Pick the range that matches your device.'}</p></div>
          <div class="stack q-opts" role="radiogroup">
            ${BATTERY_BANDS.map((b) => opt(a.batteryBand === b.key, `data-act="band" data-v="${b.key}"`, b.label, b.hint))}
            ${a.faults.includes('batteryReplaced') ? opt(a.healthHidden === true, 'data-act="nohealth"', 'Battery Health Not Showing', 'The battery was changed and its health isn’t shown any more.') : ''}
          </div>
          ${faultsFor(d).some((f) => f.key === 'batteryReplaced') ? html`<div class="stack q-opts" role="group">
            <button class="opt" type="button" role="checkbox" aria-checked="${a.faults.includes('batteryReplaced') ? 'true' : 'false'}" data-act="replbat">
              <span class="main">${FAULTS.find((f) => f.key === 'batteryReplaced').label}<span class="sub">${a.faults.includes('batteryReplaced') ? 'Now pick its battery health above.' : FAULTS.find((f) => f.key === 'batteryReplaced').hint}</span></span><span class="tick box" aria-hidden="true"></span></button>
          </div>` : ''}`;
      case 'neatness':
        return html`<h2 class="h-title">How does it look?</h2>
          <p class="par">Check the screen, back and frame in good light.</p>
          <div class="stack q-opts" role="radiogroup">${NEATNESS.map((n, k) => opt(a.neatness === n.key, `data-act="neat" data-v="${n.key}"`, n.label, n.hint, neatnessIllo(k)))}</div>`;
      case 'network':
        return html`<h2 class="h-title">Is it network locked?</h2>
          <p class="par">How does it take a SIM, and is it locked to a network?</p>
          <div class="stack q-opts" role="radiogroup">${networkOptionsFor(d, a.sim).map((n) => opt(a.network === n.key, `data-act="net" data-v="${n.key}"`, n.label, n.hint))}</div>`;
      case 'faults':
        return html`<h2 class="h-title">Anything not working?</h2>
          <p class="par">Tick everything that applies.</p>
          <div class="stack q-opts" role="group">
            ${q.faults.filter((f) => f.key !== 'batteryReplaced').map((f) => html`<button class="opt" type="button" role="checkbox" aria-checked="${a.faults.includes(f.key) ? 'true' : 'false'}" data-act="fault" data-v="${f.key}">
              <span class="main">${f.label}<span class="sub">${f.hint}</span></span><span class="tick box" aria-hidden="true"></span></button>`)}
            <button class="opt" type="button" role="checkbox" aria-checked="${a.faultsDone && !a.faults.filter((f) => f !== 'batteryReplaced').length ? 'true' : 'false'}" data-act="allgood">
              <span class="main">Everything Works</span><span class="tick box" aria-hidden="true"></span></button>
          </div>`;
      case 'pads':
        return html`<div class="head-block"><h2 class="h-title">How many controllers?</h2>
          <p class="par">Count the working controllers you’re bringing with the console.</p></div>
          <div class="stack q-opts" role="radiogroup">${PADS.map((p) => opt(a.pads === p.key, `data-act="pads" data-v="${p.key}"`, p.label, p.hint))}</div>`;
      case 'games':
        return html`<div class="head-block"><h2 class="h-title">Any games included?</h2>
          <p class="par">Game discs you’re trading in with the console.</p></div>
          <div class="stack q-opts" role="radiogroup">${GAMES.map((g) => opt(a.games === g.key, `data-act="games" data-v="${g.key}"`, g.label, g.hint))}</div>
          <p class="small">We review the games in store to confirm they can be swapped.</p>`;
      case 'perfect':
        return html`<div class="head-block"><h2 class="h-title">Is it in perfect condition?</h2>
          <p class="par">${isSpeaker(d) ? 'It charges, pairs, plays clearly at full volume, and has no cracks or water damage.' : 'Original parts, no cracks, dents or scratches, and everything works.'}</p></div>
          <div class="stack q-opts" role="radiogroup">
            ${opt(a.perfect === true, 'data-act="perfect" data-v="yes"', 'Yes, it works perfectly')}
            ${opt(a.perfect === false, 'data-act="perfect" data-v="no"', 'No, it has a fault or damage')}</div>
          ${a.perfect === false ? html`<div class="stop left"><b>${perfectOnlyText(d)}</b>Get it fixed first, then come back for your value.</div>` : ''}`;
      case 'hacked':
        return html`<div class="head-block"><h2 class="h-title">Is it hacked?</h2>
          <p class="par">Jailbroken, modded or running custom firmware.</p></div>
          <div class="stack q-opts" role="radiogroup">
            ${opt(a.hacked === false, 'data-act="hacked" data-v="no"', 'No, it’s not hacked', 'Original Sony software.')}
            ${opt(a.hacked === true, 'data-act="hacked" data-v="yes"', 'Yes, it’s hacked', 'We check it in store.')}</div>`;
      default: return '';
    }
  }

  function draw() {
    const r = valueDevice(d, engineAnswers(a, d), app.catalog.settings);
    const done = qs.filter((x) => answered(x, a)).length;
    const last = i === qs.length - 1;
    el.innerHTML = html`
      ${hub ? html`<p class="eyebrow">${d.model}${r.accepted ? html` · <span class="so-far-inline">so far <b data-live>${naira(r.value)}</b></span>` : ''}</p>`
        : html`<p class="eyebrow">Question ${i + 1} of ${qs.length} · ${d.model}${r.accepted ? html` · <span class="so-far-inline">so far <b data-live>${naira(r.value)}</b></span>` : ''}</p>
      <div class="progress" aria-hidden="true"><i style="transform:scaleX(${done / qs.length})"></i></div>`}
      ${body()}`;
    el.innerHTML = layout(raw(el.innerHTML), hub
      ? pills(backPill(), q.key === 'faults' ? html`<button class="pill go" type="button" data-act="done">Done</button>` : '')
      : html`${pills(backPill(), html`<button class="pill go" type="button" data-act="next" ${answered(q, a) ? '' : 'disabled'}>${last ? 'See My Value' : 'Next'}</button>`)}`).toString();
  }
  function next() {
    if (!answered(q, a)) return;
    if (i < qs.length - 1) app.go('q', { i: i + 1 });
    else if (allAnswered(app)) app.go('value');
    else app.go('q', { i: qs.findIndex((x) => !answered(x, a)) });
  }
  function set(fn, advance = false, stay = false) {
    fn(a);
    s.saved = null;
    if (hub) a.touched = [...new Set([...(a.touched || []), q.key])];
    app.save();
    haptic();
    // From the conditions page, a single choice goes straight back to it (ticked); Others waits for Done.
    if (hub && q.key !== 'faults' && !stay) { app.back(); return; }
    if (advance && answered(q, a)) { next(); return; }
    draw();
  }

  draw();
  wire(el, app, {
    origin: (b) => { s.deviceId = b.dataset.v; set((x) => { x.origin = b.dataset.v; }, true); },
    icloud: (b) => set((x) => { x.icloudLocked = b.dataset.v === 'yes'; }, b.dataset.v === 'no'),
    band: (b) => set((x) => { x.batteryBand = b.dataset.v; x.batteryUnknown = false; x.healthHidden = false; }, true),
    // Replaced Battery is ticked on its own; the health range (or "not showing") is still picked above, and that returns.
    replbat: () => set((x) => {
      const on = !x.faults.includes('batteryReplaced');
      x.faults = on ? [...x.faults, 'batteryReplaced'] : x.faults.filter((f) => f !== 'batteryReplaced');
      if (!on && x.healthHidden) { x.healthHidden = false; x.batteryUnknown = false; }
    }, false, true),
    nohealth: () => set((x) => { x.batteryBand = ''; x.batteryUnknown = true; x.battery = ''; x.healthHidden = true; }, true),
    neat: (b) => set((x) => { x.neatness = b.dataset.v; }, true),
    net: (b) => set((x) => { x.network = b.dataset.v; }, true),
    fault: (b) => set((x) => {
      const v = b.dataset.v;
      x.faults = x.faults.includes(v) ? x.faults.filter((f) => f !== v) : [...x.faults, v];
      x.faultsDone = x.faults.length > 0;
    }),
    allgood: () => set((x) => { x.faults = x.faults.filter((f) => f === 'batteryReplaced'); x.faultsDone = true; }),
    done: () => { a.faultsDone = true; a.touched = [...new Set([...(a.touched || []), 'faults'])]; app.save(); app.back(); },
    pads: (b) => set((x) => { x.pads = b.dataset.v; }, true),
    games: (b) => set((x) => { x.games = b.dataset.v; }, true),
    hacked: (b) => set((x) => { x.hacked = b.dataset.v === 'yes'; }, true),
    perfect: (b) => set((x) => { x.perfect = b.dataset.v === 'yes'; }, true),
    next,
  });
  el.addEventListener('input', (e) => {
    if (!e.target.matches('[data-battery]')) return;
    a.battery = e.target.value.replace(/\D/g, '').slice(0, 3);
    a.batteryUnknown = false;
    s.saved = null;
    app.save();
    $('[data-act="unsure"]', el)?.setAttribute('aria-pressed', 'false');
    const nx = $('[data-act="next"]', el);
    if (nx) nx.disabled = !answered(q, a);
    const r = valueDevice(d, engineAnswers(a, d), app.catalog.settings);
    const live = $('[data-live]', el);
    if (live && r.accepted) live.textContent = naira(r.value);
    const cell = $('[data-cell]', el);
    if (cell) {
      const pct = Math.max(0, Math.min(100, Number(a.battery) || 0));
      cell.style.width = `${pct}%`;
      cell.classList.toggle('low', pct > 0 && pct < (app.catalog.settings.batteryThreshold || 85));
    }
  });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('[data-battery]')) next(); });
}

// ---------- trade-in value ----------

function value(el, app) {
  const d = ownDevice(app);
  if (!d) { app.go('pick', {}, { replace: true }); return false; }
  if (!allAnswered(app)) { app.go('conds', {}, { replace: true }); return false; }
  const r = currentValue(app);
  const s = app.s;
  el.innerHTML = html`
    <div class="head-block">
      <h2 class="h-title">Your Trade-In Value</h2>
      <p class="par">Here’s what your device is worth after the condition check.</p>
    </div>
    ${devValue(d, r.value, r.start)}
    <p class="small">Estimated. Confirmed when we check your device in store, and slightly negotiable.</p>
    ${isConsole(d) && s.answers.games && s.answers.games !== 'none' ? html`<p class="small">Games are reviewed in store to confirm they can be swapped.</p>` : ''}
    <div class="card"${s.answers.quick ? raw(' hidden') : ''}>
      <ul class="lines">
        <li><span>Starting Value, Perfect Condition</span><span>${naira(r.start)}</span></li>
        ${r.lines.map((l) => html`<li class="${l.amount === null ? 'pending' : ''}"><span>${l.label}</span><span>${lineAmount(l.amount)}</span></li>`)}
        ${r.lines.length ? html`<li class="total"><span>Your Trade-In Value</span><span>${naira(r.value)}</span></li>` : ''}
      </ul>
    </div>
    ${s.answers.quick ? html`<p class="small">Based on your device being in good working condition.</p>` : ''}
    <p><button class="link" type="button" data-act="edit">${s.answers.quick ? 'Answer condition questions instead' : 'Edit answers'}</button></p>`;
  el.innerHTML = layout(raw(el.innerHTML), pills(backPill(), html`<button class="pill go" type="button" data-act="proceed">Proceed</button>`)).toString();
  requestAnimationFrame(() => animateNumber($('.big-num', el), r.value, naira));
  wire(el, app, {
    edit: () => { s.answers.quick = false; app.save(); app.go('conds'); },
    proceed: () => app.go('choose'),
  });
}

// ---------- what next: swap or cash ----------

function choose(el, app) {
  const s = app.s;
  settleAdding(app);
  s.adding = false;
  const d = ownDevice(app);
  if (!d || !allAnswered(app)) { app.go('home', {}, { replace: true }); return false; }
  const trades = tradeIns(app);
  const total = totalValue(app);
  const multi = trades.length > 1;
  const max = Number(app.catalog.settings['compare.maxDevices']) || 6;
  el.classList.add('choose');
  if (multi) el.classList.add('multi');
  el.innerHTML = layout(html`
    <div class="head-block">
      <h2 class="h-title">What would you like to do?</h2>
      <p class="par">${multi ? 'Swap them for something new, or trade them in for cash.' : 'Swap it for something new, or trade it in for cash.'}</p>
    </div>
    ${multi ? html`<div class="dev-value">
        <div class="dev-list">${trades.map((t, i) => html`<p class="dev-line"><strong title="${t.d.model}">${t.d.model}</strong><span class="ds">${tradeStorage(t.d.storage)}</span><span class="dv">${naira(t.r.value)}</span><button class="x" type="button" aria-label="Remove ${t.d.model}" data-act="rmtrade" data-i="${i}">${raw(ICON.x)}</button></p>`)}</div>
        <p class="tiv-label">Total Trade-In Value</p>
        <p class="big-num">${naira(total)}</p>
      </div>` : devValue(d, total)}
    ${trades.length < MAX_TRADE ? html`<button class="btn add trade-add" type="button" data-act="addtrade">${raw(ICON.plus)} Trade In Another Device</button>` : ''}
    <div class="stack nav-stack">
      <button class="btn blue" type="button" data-act="swap">Swap to another Device</button>
      <button class="btn" type="button" data-act="cash">Swap for Cash</button>
    </div>`, pills(backPill())).toString();
  // Long names (iPads) shrink a little to stay on one line in their column.
  requestAnimationFrame(() => el.querySelectorAll('.dev-list strong').forEach((n) => {
    let fs = 14; while (n.scrollWidth > n.clientWidth + 0.5 && fs > 11) { fs -= 0.5; n.style.fontSize = `${fs}px`; }
  }));
  wire(el, app, {
    swap: () => {
      s.mode = 'swap'; s.cash = false; app.save();
      // Once per visit, until they sign in: continue as a guest, or sign in to keep their codes (Daniel, 7 Oct).
      if (!getMe() && !isGuest()) app.go('signin', { next: 'compare' });
      else app.go('compare');
    },
    cash: () => { s.cash = true; app.save(); app.go('finish'); },
    addtrade: () => {
      // Park the device just valued, value the next one; its Yes / Proceed lands back here.
      s.more = [...(s.more || []), { deviceId: s.deviceId, answers: s.answers }];
      s.deviceId = ''; s.answers = freshAnswers(); s.adding = true; s.saved = null;
      s.pick = { ...freshPick() };
      app.save(); app.go('pick');
    },
    rmtrade: (b) => { removeTrade(app, Number(b.dataset.i)); app.refresh(); },
  });
}

/** Take one trade-in device out of the quote; removing the last one leaves the swap list without a device. */
function removeTrade(app, i) {
  const s = app.s;
  const all = [...(s.more || []), { deviceId: s.deviceId, answers: s.answers }];
  all.splice(i, 1);
  const last = all.pop();
  s.more = all;
  s.deviceId = last ? last.deviceId : '';
  s.answers = last ? last.answers : freshAnswers();
  s.saved = null;
  app.save();
}

/**
 * Swap options, cheapest model first, each model followed by its other configurations
 * (iPhone 11 64gb, iPhone 11 128gb, then iPhone 11 Pro 64gb, iPhone 11 Pro 256gb…).
 */
function cheapestFirstOrder(list) {
  const low = new Map();
  for (const x of list) low.set(x.model, Math.min(low.get(x.model) ?? Infinity, x.price || Infinity));
  return (a, b) => (low.get(a.model) - low.get(b.model)) || (a.model === b.model ? 0 : a.model.localeCompare(b.model))
    || ((a.price || 0) - (b.price || 0));
}
const cheapestFirst = (list) => [...list].sort(cheapestFirstOrder(list));

// ---------- compare swaps ----------

function compare(el, app) {
  const s = app.s;
  settleAdding(app);
  s.adding = false;
  const cat = app.catalog;
  const d = ownDevice(app);
  const trades = tradeIns(app);
  const tv = totalValue(app);
  const max = Number(cat.settings['compare.maxDevices']) || 6;
  const items = s.compare.map((id) => { const x = cat.byId.get(id); return x && x.price > 0 && x.stock !== 'soldout' ? x : { ...(x || {}), id, gone: true }; });
  const live = cheapestFirst(items.filter((x) => !x.gone));
  const gone = items.filter((x) => x.gone);

  const card = (x) => {
    if (x.gone) {
      return html`<article class="cmp gone"><span class="t">No longer available</span><span class="s">This device has sold or been removed.</span>
        <button class="x" type="button" aria-label="Remove" data-act="rm" data-id="${x.id}">${raw(ICON.x)}</button></article>`;
    }
    const t = tv === null ? null : swapTerms(x, tv);
    // Three lines: what it is · price and what it takes to swap · proceed.
    return html`<article class="cmp slim ${t ? t.kind : ''}">
      <span class="t"><b>${x.model}</b>${x.condition === 'Deal' ? raw('<span class="tag">One unit</span>') : ''}${x.storage ? html` <span class="s">· ${x.storage}</span>` : ''}</span>
      <span class="row2"><span class="p">${x.condition === 'Deal' ? (x.dealNote || 'Deal') : conditionLabel(x.condition)}<br>Price ${nairaK(x.price)}</span><span class="kn"><span class="n">${t ? nairaK(t.kind === 'even' ? 0 : t.amount) : nairaK(x.price)}</span><span class="k">${t ? termsLabel(t) : 'Price'}</span></span></span>
      ${t ? html`<button class="pill go cmp-go" type="button" data-act="pick" data-id="${x.id}">Proceed to Swap</button>` : ''}
      <button class="x" type="button" aria-label="Remove ${x.model} ${variantName(x)}" data-act="rm" data-id="${x.id}">${raw(ICON.x)}</button>
    </article>`;
  };

  el.classList.add('wide');
  el.innerHTML = html`
    <div class="head-block"><h2 class="h-title">Your Swap Rates</h2>
    <p class="par">Compare what it costs to swap into up to ${max} devices.</p></div>
    ${trades.length ? html`${trades.map((t, i) => html`<div class="mine slim${trades.length > 1 ? ' multi' : ''}">
        <div class="mine-top">
          <span class="main"><b>${t.d.model}</b></span>
          <span class="val">${t.r.accepted ? nairaK(t.r.value) : 'Not Accepted'}</span>
          <button class="x" type="button" aria-label="Remove ${t.d.model}" data-act="rmtrade" data-i="${i}">${raw(ICON.x)}</button>
        </div>
        <p class="mine-cond"><span class="c">${[tradeStorage(t.d.storage), t.answers.quick ? 'Good Working Condition' : answersText(engineAnswers(t.answers, t.d))].filter(Boolean).join(' · ')}</span>${t.r.accepted ? html`<small class="vx">Value for Your ${deviceWord(t.d.type)}</small>` : ''}</p>
        ${t.r.accepted ? html`<details class="mine-how"><summary>How we got ${nairaK(t.r.value)}</summary>
          <ul class="lines">
            <li><span>Starting Value, Perfect Condition</span><span>${nairaK(t.r.start)}</span></li>
            ${t.r.lines.map((l) => html`<li class="${l.amount === null ? 'pending' : ''}"><span>${l.label}</span><span>${lineAmountK(l.amount)}</span></li>`)}
            <li class="total"><span>Trade-In Value</span><span>${nairaK(t.r.value)}</span></li>
          </ul>
          ${t.current ? html`<span class="mine-edits"><button class="link" type="button" data-act="edit">Edit answers</button><button class="link" type="button" data-act="chdev">Change device</button></span>` : ''}
        </details>` : html`<p class="mine-cond">${t.r.reason || ''}</p>`}
      </div>`)}
      ${trades.length > 1 && tv !== null ? html`<div class="trade-total"><span>Total Trade-In Value</span><b>${nairaK(tv)}</b></div>` : ''}
`
      : html`<div class="notice">Add your device to see what each swap costs. <button class="link" type="button" data-act="own">Value my device</button></div>`}
    ${items.length ? html`<div class="cmp-grid">${live.map(card)}${gone.map(card)}</div>` : html`<p class="small">No devices yet. Add the ones you’re considering, including different storage or condition of the same phone.</p>`}
    ${s.compare.length < max ? html`<button class="btn add" type="button" data-act="add">${raw(ICON.plus)} ${s.compare.length ? 'Add Another Device' : 'Add a Device'}</button>` : ''}`;
  const ready = tv !== null && live.length;
  el.innerHTML = layout(raw(el.innerHTML), html`
    ${pills(backPill(), html`<button class="pill go" type="button" data-act="savequotes" ${ready ? '' : 'disabled'}>Save Quotes</button>`)}`).toString();
  wire(el, app, {
    val: () => app.go('value'),
    edit: () => app.go('conds'),
    // Wrong storage or model: pick again from the same model; the swap devices stay.
    chdev: () => { s.pick = { ...freshPick(), type: d?.type || '', brand: d?.brand || '', model: d?.model || '' }; app.save(); app.go('pick'); },
    own: () => {
      // After the trade-in was removed: value a device but keep the swap devices already picked.
      if (!s.compare.length) { startFlow(app, 'swap'); return; }
      Object.assign(s, { mode: 'swap', cash: false, deviceId: '', answers: freshAnswers(), saved: null, pick: freshPick() });
      app.save(); app.go('pick');
    },
    rmtrade: (b) => { removeTrade(app, Number(b.dataset.i)); app.refresh(); },
    add: () => { s.add = { ...freshPick(), type: d?.type || '' }; app.go('pick', { purpose: 'add' }); },
    pick: (b) => { s.chosen = b.dataset.id; s.cash = false; app.save(); app.go('finish'); },
    savequotes: () => { s.chosen = ''; app.save(); app.go('saved'); },
    help: async (b) => {
      s.chosen = '';
      b.disabled = true;
      const label = b.innerHTML;
      b.textContent = 'Preparing your quotes…';
      await withLink(app, () => ensureSaved(app), ({ q, link }) => { location.href = whatsappURL(helpMessage(q, link)); });
      setTimeout(() => { b.disabled = false; b.innerHTML = label; }, 1200);
    },
    rm: (b) => {
      const id = b.dataset.id;
      const cardEl = b.closest('.cmp');
      const done = () => { s.compare = s.compare.filter((x) => x !== id); s.saved = null; app.save(); app.refresh(); };
      if (cardEl.animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        cardEl.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.94)' }], { duration: 170, easing: 'ease-in' }).onfinish = done;
      } else done();
    },
  });
}

// ---------- complete on WhatsApp ----------

function quoteNow(app, { onlyChosen = false } = {}) {
  const s = app.s;
  const trades = tradeIns(app);
  const first = trades[0];
  const total = totalValue(app);
  const ids = onlyChosen && s.chosen ? [s.chosen] : s.compare;
  const list = s.cash ? [] : ids.map((id) => app.catalog.byId.get(id)).filter(Boolean)
    .sort(cheapestFirstOrder(ids.map((id) => app.catalog.byId.get(id)).filter(Boolean)))
    .map((x) => ({ device: x, terms: total !== null ? swapTerms(x, total) : { kind: 'unavailable', amount: 0 } }));
  const q = buildQuote({ device: first ? { ...first.d, condition: '' } : null, answers: first ? engineAnswers(first.answers, first.d) : null, result: first?.r, compare: list, city: CITIES.find((c) => c.key === s.city)?.name });
  if (trades.length > 1) {
    q.items = trades.map((t) => ({ id: t.d.id, name: [t.d.model, tradeStorage(t.d.storage)].filter(Boolean).join(' · '), start: t.r.start || 0, value: t.r.accepted ? t.r.value : 0,
      answers: engineAnswers(t.answers, t.d), lines: t.r.accepted ? t.r.lines.map((l) => [l.label, l.amount]) : [] }));
    q.value = total || 0;
  }
  const me = getMe();
  if (me) { q.name = me.name; q.phone = me.phone; }
  return q;
}
// One save per quote: taps that arrive while it's saving share that save, so a slow connection
// can't create duplicate rows or hand out the long link while the short one is on its way.
const inFlight = new Map();
const ID_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newQuoteId = () => { const r = crypto.getRandomValues(new Uint32Array(6)); return `SD-${[...r].map((n) => ID_ABC[n % ID_ABC.length]).join('')}`; };
async function ensureSaved(app, extra = {}, opts = {}) {
  const s = app.s;
  const q = quoteNow(app, opts);
  const sig = JSON.stringify({ ...q, created: 0, ...extra });
  if (s.saved && s.saved.sig === sig && s.saved.saved) return { q, ...s.saved };
  // When the script supports it, the quote gets its ID here, so the short link is ready at once and
  // survives the phone pausing the page (switching to WhatsApp mid-save). The save runs, and retries, behind it.
  if ((app.catalog.features || []).includes('clientIds')) {
    s.quoteId = s.editing || s.quoteId || newQuoteId();
    const id = s.quoteId;
    const link = `${CONFIG.site}?q=${id}`;
    rememberCode({ id, label: codeLabel(q) });
    backgroundSave(app, q, { ...extra, replaceId: id }, sig, link, id);
    return { q, sig, link, id, saved: true };
  }
  if (!inFlight.has(sig)) {
    // Editing a quote opened from its link updates that quote (same link) instead of making a new one.
    const once = () => saveQuote(q, s.editing ? { ...extra, replaceId: s.editing } : extra);
    const p = (async () => {
      // A few tries (waiting while the page is in the background) before giving up. Only a short link is ever returned.
      for (let n = 0; n < 4; n++) {
        if (n) await new Promise((res) => setTimeout(res, 1500 * n));
        await whenVisible();
        const r = await once();
        if (r.saved && r.link) {
          s.saved = { sig, link: r.link, id: r.id, saved: true };
          rememberCode({ id: r.id, label: codeLabel(q) });
          app.save();
          return s.saved;
        }
      }
      throw new Error('Quote not saved');
    })().finally(() => inFlight.delete(sig));
    inFlight.set(sig, p);
  }
  return { q, ...(await inFlight.get(sig)) };
}
const whenVisible = () => new Promise((res) => {
  if (document.visibilityState === 'visible') { res(); return; }
  const f = () => { if (document.visibilityState === 'visible') { document.removeEventListener('visibilitychange', f); res(); } };
  document.addEventListener('visibilitychange', f);
});
const SAVE_FAILED = 'Couldn’t save your Swap. Check your connection and try again.';
/** Run fn with the saved quote's short link, showing "Saving your Swap…" while it's on its way. */
async function withLink(app, getSaved, fn) {
  let slow = setTimeout(() => app.toast('Saving your Swap…'), 300);
  try { const r = await getSaved(); clearTimeout(slow); slow = null; return await fn(r); }
  catch { if (slow) clearTimeout(slow); app.toast(SAVE_FAILED); return undefined; }
}
function backgroundSave(app, q, extra, sig, link, id) {
  const s = app.s;
  if (s.saved && s.saved.sig === sig && s.saved.stored) return;
  if (inFlight.has(sig)) return;
  s.saved = { sig, link, id, saved: true, stored: false };
  app.save();
  const attempt = (n) => {
    const p = saveQuote(q, extra).then((r) => {
      if (r.saved) { if (s.saved?.sig === sig) { s.saved.stored = true; app.save(); } return; }
      // Failed (often the page was paused): try again when it's back on screen, a few times.
      if (n < 4) {
        const again = () => { if (document.visibilityState === 'visible') { document.removeEventListener('visibilitychange', again); setTimeout(() => attempt(n + 1), 800); } };
        if (document.visibilityState === 'visible') setTimeout(() => attempt(n + 1), 3000 * (n + 1));
        else document.addEventListener('visibilitychange', again);
      }
    }).finally(() => { if (inFlight.get(sig) === p) inFlight.delete(sig); });
    inFlight.set(sig, p);
  };
  attempt(0);
}

function finish(el, app) {
  const s = app.s;
  if (!ownDevice(app)) { app.go('home', {}, { replace: true }); return false; }
  // A signed-in customer's city is filled in from last time.
  const me = getMe();
  if (!s.city && me?.city && CITIES.some((c) => c.key === me.city)) s.city = me.city;
  const city = CITIES.find((c) => c.key === s.city);
  el.innerHTML = html`
    <div class="head-block">
      <h2 class="h-title">${s.cash ? 'Complete your Trade-In' : 'Complete your Swap'}</h2>
      <p class="par city-sub">${city ? city.text : 'Pick your city to see how your swap is completed.'}</p>
    </div>
    ${chosenCard(app)}
    <p class="par">Where are you located? 📍</p>
    <div class="cities" role="radiogroup">
      ${CITIES.map((c) => html`<button class="opt" type="button" role="radio" aria-checked="${c.key === s.city ? 'true' : 'false'}" data-act="city" data-v="${c.key}">${c.name}</button>`)}
    </div>
    <p class="small">Our team sees every device in your quote from the link. Quotes are valid for ${CONFIG.quoteValidDays} days.</p>`;
  el.innerHTML = layout(raw(el.innerHTML), html`
    <button class="btn green fill" type="button" data-act="wa" ${city ? '' : 'disabled'}>${raw(ICON.whatsapp)} ${city ? 'Complete on WhatsApp' : 'Pick your city to continue'}</button>
    ${pills(backPill())}`).toString();
  wire(el, app, {
    city: (b) => {
      s.city = b.dataset.v; app.save();
      const m = getMe();
      if (m && m.city !== s.city) saveCustomer(updateMe({ city: s.city }));
      app.refresh(); $('[data-act="wa"]', el.isConnected ? el : document)?.focus?.({ preventScroll: true });
    },
    wa: async (b) => {
      b.disabled = true;
      b.textContent = 'Preparing your quote…';
      await withLink(app, () => ensureSaved(app, {}, { onlyChosen: true }), ({ q, link }) => { location.href = whatsappURL(whatsappMessage(q, link, city?.name)); });
      setTimeout(() => app.refresh(), 1200);
    },
    save: () => app.go('saved'),
    change: () => app.go('compare'),
  });
}

/** One format for "your device and its value": name line sitting directly on the big figure. */
function devValue(d, value, animateFrom) {
  return html`<div class="dev-value">
    <p class="dev-line"><strong>${d.model}</strong>${d.storage ? ` · ${tradeStorage(d.storage)}` : ''}</p>
    <p class="big-num"${animateFrom !== undefined ? raw(` data-value="${animateFrom}"`) : ''}>${naira(animateFrom !== undefined ? animateFrom : value)}</p>
  </div>`;
}

function chosenCard(app) {
  const s = app.s;
  const x = !s.cash && s.chosen && app.catalog.byId.get(s.chosen);
  const total = totalValue(app);
  if (!x || total === null) return '';
  const t = swapTerms(x, total);
  return html`<div class="mine chosen">
    <div class="mine-top"><span class="main"><span class="eyebrow-s">Swapping into</span><b>${x.model}</b><span class="sub">${variantName(x)}</span><button class="link chg" type="button" data-act="change">Change device</button></span>
    <span class="val">${nairaK(t.kind === 'even' ? 0 : t.amount)}<small>${termsLabel(t)}</small></span></div></div>`;
}

function helpMessage(q, link) {
  const lines = ['Hi SwapDesk, please help me decide which device to swap into.', '', summaryText(q, ''), '', `My quotes: ${link}`];
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

function saved(el, app) {
  if (!ownDevice(app)) { app.go('home', {}, { replace: true }); return false; }
  sharePage(el, app, { saved: () => ensureSaved(app), quote: () => quoteNow(app) });
}

/** The one share page: Download, WhatsApp, TikTok, Copy Link. Used after a new quote and from a reopened quote link. */
export function sharePage(el, app, { saved, onBack, quote }) {
  el.classList.add('choose');
  // Make the picture as soon as the page opens, so the tap can go straight to the share sheet.
  let ready = null, info = null;
  // Saving starts now, for the links and the quote code.
  let saving = saved();
  saving.then((r) => { info = r; }).catch(() => { saving = null; });
  // The picture carries the quote code (SD-XXXXXX), so it waits for the code; with the updated script that's instant.
  // If saving fails, the picture is still made, just without the code.
  const making = (saving || Promise.reject()).then((r) => quoteImageFile(r.q, r.id))
    .catch(() => (quote ? quoteImageFile(quote()) : Promise.reject(new Error('No quote'))));
  making.then((f) => { ready = f; }).catch(() => {});
  const opt = (act, ico, title, sub) => html`<button class="opt" type="button" data-act="${act}"><span class="brand-ico ${act}">${raw(ico)}</span><span class="main"><span class="tt">${title}</span><span class="sub">${sub}</span></span></button>`;
  el.innerHTML = layout(html`
    <div class="head-block">
      <h2 class="h-title">Save Your Quotes</h2>
      <p class="par">Keep every swap rate you checked, or send them to someone on WhatsApp. Quotes are valid for ${CONFIG.quoteValidDays} days.</p>
    </div>
    <div class="stack q-opts">
      ${opt('image', ICON.download, 'Download Quote as Image', 'Save it to your Photos.')}
      ${opt('walink', ICON.whatsapp, 'Share Quote to WhatsApp', 'Send the quote and its link.')}
      ${opt('tiktok', ICON.tiktok, 'Share Quote to TikTok', 'Send it in a TikTok DM.')}
      ${opt('copy', ICON.link, 'Copy Link', 'Come back to it anytime.')}
    </div>`, pills(backPill())).toString();
  el.classList.add('share-pg');
  document.getElementById('body')?.scrollTo(0, 0);
  // Keep every title and note on one line, shrinking slightly on narrow phones.
  requestAnimationFrame(() => el.querySelectorAll('.share-pg .q-opts .tt, .share-pg .q-opts .sub').forEach((n) => {
    let fs = parseFloat(getComputedStyle(n).fontSize);
    while (n.scrollWidth > n.clientWidth + 0.5 && fs > 12) { fs -= 0.5; n.style.fontSize = `${fs}px`; }
  }));
  // Phones open the share sheet (Save Image, or pick TikTok); computers download the picture.
  // The quote as a message: WhatsApp keeps its *bold* and _italic_ marks; TikTok DMs get plain text.
  const message = (q, link) => `*Swap Quote*\n\n${summaryText(q, '')}\n\nOpen the full quote: ${link}`;
  // Every image tap also copies a short message with the quote link, to paste under the picture.
  const linkText = (r) => `You can see the full quote here: ${r.link}`;
  const copyLink = () => {
    try {
      const done = () => app.toast('Quote link copied. Paste it with the image.');
      const failed = () => app.toast(SAVE_FAILED);
      if (info) { navigator.clipboard.writeText(linkText(info)).then(done, () => {}); return; }
      // The link may still be saving (or failed before: try again): hand the clipboard a promise so the tap
      // still counts on iPhone. Only the short link is ever copied.
      if (!saving) { saving = saved(); saving.then((r) => { info = r; }).catch(() => { saving = null; }); }
      app.toast('Saving your Swap…');
      if (window.ClipboardItem && navigator.clipboard?.write) {
        navigator.clipboard.write([new ClipboardItem({ 'text/plain': saving.then((r) => new Blob([linkText(r)], { type: 'text/plain' })) })]).then(done, failed);
      } else saving.then((r) => copy(linkText(r))).then(done, failed);
    } catch { /* clipboard not available */ }
  };
  const shareImage = async (b) => {
    copyLink();
    if (ready) { deliverImage(ready, app); return; }
    b.disabled = true;
    try { ready = await making; } catch { ready = null; }
    b.disabled = false;
    if (!ready) { app.toast('Couldn’t make the image. Try Copy Link instead.'); return; }
    // The tap that started this has expired; ask for one more so the phone lets us open the share sheet.
    if (navigator.canShare?.({ files: [ready] })) { app.toast('Image ready. Tap again to share it.'); return; }
    deliverImage(ready, app);
  };
  const handlers = {
    image: (b) => shareImage(b),
    tiktok: async () => {
      // TikTok has no web link for DMs. Phones: the share sheet, where TikTok sends it as a DM (opened straight from
      // the tap, so the phone allows it). Computers: copy the message to paste into the DM.
      if (info && navigator.share) { navigator.share({ text: plainText(message(info.q, info.link)) }).catch(() => {}); return; }
      await withLink(app, saved, async (r) => { await copy(plainText(message(r.q, r.link))); app.toast('Message copied. Paste it in a TikTok DM.'); });
    },
    walink: () => withLink(app, saved, ({ q, link }) => { location.href = `https://wa.me/?text=${encodeURIComponent(message(q, link))}`; }),
    copy: () => withLink(app, saved, async ({ link }) => { await copy(link); app.toast('Link copied'); }),
  };
  el.onclick = (e) => {
    if (e.target.closest('[data-back]')) { if (onBack) onBack(); else app.back(); return; }
    const a = e.target.closest('[data-act]');
    if (a && handlers[a.dataset.act]) handlers[a.dataset.act](a, e);
  };
}

/** Draw the quotes as a shareable picture (no libraries): white card, logo, value and each swap. */
async function quoteImageFile(q, code = '') {
  // A phone-screen image of the quote in the site's look: logo on white, everything on the blue pop-up,
  // laid out from measured heights and centred so there is no dead space.
  const W = 1080;
  const PX = 56, PW = W - PX * 2, PAD = 52, IX = PX + PAD, IW = PW - PAD * 2;
  const font = (w, px) => `${w} ${px}px -apple-system, BlinkMacSystemFont, "SF Pro Display", Inter, "Helvetica Neue", Arial, sans-serif`;
  const items = q.items && q.items.length > 1 ? q.items
    : q.device ? [{ name: q.device.name, value: q.value, start: q.device.start, answers: q.answers, lines: q.lines || [] }] : [];
  const multi = items.length > 1;
  const date = new Date(q.created).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const measure = document.createElement('canvas').getContext('2d');
  const wrap = (g, text, max) => { const out = []; let line = ''; for (const w of text.split(' ')) { const t = line ? `${line} ${w}` : w; if (g.measureText(t).width > max && line) { out.push(line); line = w; } else line = t; } if (line) out.push(line); return out; };
  const fit = (g, text, max) => { if (g.measureText(text).width <= max) return text; let t = text; while (t.length > 1 && g.measureText(t + '…').width > max) t = t.slice(0, -1); return t + '…'; };

  // ---- heights ----
  const H_HEAD = 168, H_HERO = 210, H_LABEL = 54, H_SWAP = 176, GAP = 20, H_FOOT = 120;
  const lineRow = 48;
  measure.font = font(400, 26);
  const subOf = (it) => { const rest = it.name.split(' · ').slice(1).join(' · '); return multi ? [rest, answersText(it.answers)].filter(Boolean).join(' · ') : rest; };
  const subLines = items.map((it) => wrap(measure, subOf(it), IW - 80 - 330));
  const nameLines = items.map((it) => { measure.font = font(800, 34); const vW = measure.measureText(nairaK(it.value)).width; measure.font = font(700, 34); return wrap(measure, it.name.split(' · ')[0], IW - 80 - vW - 30); });
  const rowH = subLines.map((l, i) => Math.max(56 + (nameLines[i].length - 1) * 42 + l.length * 34, 92) + (multi ? 18 : 0));
  const amtOf = (cmp) => nairaK(items.length ? (cmp.kind === 'even' ? 0 : cmp.amount) : cmp.price);
  const swapLines = q.compare.map((cmp) => { measure.font = font(800, 54); const aW = measure.measureText(amtOf(cmp)).width; measure.font = font(700, 36); return wrap(measure, cmp.name.split(' · ')[0], IW - 80 - aW - 36); });
  const swapH = swapLines.map((l) => 176 + (l.length - 1) * 42);
  const breakdown = multi ? 0 : (items[0]?.lines.length || 0) + 1;
  const cardH = items.length ? 36 + rowH.reduce((a, b) => a + b, 0) + (breakdown ? 16 + breakdown * lineRow : 0) + (multi ? 70 : 0) + 34 : 0;
  const swapsH = q.compare.length ? H_LABEL + swapH.reduce((a, b) => a + b + GAP, 0) - GAP : 0;
  const hero = items.length && !q.compare.length;
  const PH = 34 + H_HEAD + 6 + (items.length ? (hero ? H_HERO : 0) + H_LABEL + cardH : 0) + (swapsH ? 44 + swapsH : 0) + 40 + H_FOOT;
  const logoH = 112, GAPLOGO = 64;
  const H = Math.max(1920, PH + logoH + GAPLOGO + 240);
  const top = Math.round((H - (logoH + GAPLOGO + PH)) / 2);
  const PT = top + logoH + GAPLOGO;

  const c = document.createElement('canvas');
  const S = 2; // render at 2× (2160 wide) so WhatsApp HD keeps it sharp
  c.width = W * S; c.height = H * S;
  const g = c.getContext('2d');
  g.scale(S, S);
  g.imageSmoothingQuality = 'high';
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
  const [logo, wa, wb] = await Promise.all(['assets/swapdesk-logo.png', 'assets/wave-a.svg', 'assets/wave-b.svg'].map((u) => loadImg(u).catch(() => null)));
  const wave = (img, x, y, w, rot) => {
    if (!img) return;
    const h = w * (img.height / img.width || 1.1);
    g.save(); g.globalAlpha = 0.5; g.translate(x + w / 2, y + h / 2); g.rotate(rot * Math.PI / 180); g.drawImage(img, -w / 2, -h / 2, w, h); g.restore();
  };
  wave(wa, W - 560, -280, 1100, -18);
  wave(wb, -740, H - 1150, 1250, 28);
  if (logo) { const lw = logoH * logo.width / logo.height; g.drawImage(logo, (W - lw) / 2, top, lw, logoH); }

  // ---- pop-up ----
  g.save(); g.shadowColor = 'rgba(24, 87, 123, 0.16)'; g.shadowBlur = 60; g.shadowOffsetY = 18;
  g.fillStyle = '#e6f1fd'; roundRect(g, PX, PT, PW, PH, 56); g.fill(); g.restore();
  g.strokeStyle = '#ffffff'; g.lineWidth = 3; roundRect(g, PX, PT, PW, PH, 56); g.stroke();
  g.fillStyle = 'rgba(0,0,0,0.13)'; roundRect(g, W / 2 - 36, PT + 20, 72, 9, 4.5); g.fill();
  let y = PT + 34;

  const text = (t, x, yy, w, px, color, align = 'left') => { g.font = font(w, px); g.fillStyle = color; g.textAlign = align; g.fillText(t, x, yy); };
  const label = (t, yy) => { g.letterSpacing = '2px'; text(t, IX + 6, yy, 700, 23, '#18577b'); g.letterSpacing = '0px'; };

  // header
  text('Your Swap Quote', W / 2, y + 80, 800, 60, '#1d1d1f', 'center');
  text(`${code ? `${code} · ` : ''}${date} · valid for ${CONFIG.quoteValidDays} days`, W / 2, y + 128, 400, 27, '#6a6a70', 'center');
  y += H_HEAD;

  const drawTrade = () => {
    if (hero) {
      text(multi ? `TOTAL TRADE-IN VALUE · ${items.length} DEVICES` : 'YOUR TRADE-IN VALUE', W / 2, y + 40, 700, 26, '#18577b', 'center');
      text(nairaK(q.value), W / 2, y + 160, 800, 118, '#18577b', 'center');
      y += H_HERO;
    }
    label(multi ? 'YOUR TRADE-IN DEVICES' : 'YOUR TRADE-IN', y + 36);
    y += H_LABEL;
    // white card
    g.fillStyle = '#ffffff'; roundRect(g, IX, y, IW, cardH, 36); g.fill(); g.strokeStyle = '#d9e2ea'; g.lineWidth = 3; g.stroke();
    let cy = y + 36;
    const CX = IX + 40, CR = IX + IW - 40;
    items.forEach((it, i) => {
      if (i) { g.fillStyle = '#edf1f5'; g.fillRect(CX, cy - 10, CR - CX, 2); }
      const [nm, ...rest] = it.name.split(' · ');
      nameLines[i].forEach((ln, k) => text(ln, CX, cy + 38 + k * 42, 700, 32, '#1d1d1f'));
      text(nairaK(it.value), CR, cy + 38, 800, 34, '#18577b', 'right');
      g.letterSpacing = '1.5px';
      text(`VALUE FOR YOUR ${deviceWord(it.name).toUpperCase()}`, CR, cy + 72, 700, 18, '#5a7fa0', 'right');
      g.letterSpacing = '0px';
      const sy = (nameLines[i].length - 1) * 42;
      subLines[i].forEach((ln, k) => text(ln, CX, cy + sy + 76 + k * 34, 400, 25, '#6a6a70'));
      cy += rowH[i];
    });
    if (breakdown) {
      cy += 16;
      const it = items[0];
      const row = (l, v, bold) => {
        g.fillStyle = '#edf1f5'; g.fillRect(CX, cy - 1, CR - CX, 2);
        text(l, CX, cy + 33, bold ? 700 : 400, 26, bold ? '#1d1d1f' : '#4a4f57');
        text(v, CR, cy + 33, bold ? 800 : 500, 26, bold ? '#18577b' : '#4a4f57', 'right');
        cy += lineRow;
      };
      row('Starting Value, Perfect Condition', nairaK(it.start));
      it.lines.forEach(([l, amt]) => row(l, lineAmountK(amt)));
    }
    if (multi) {
      g.fillStyle = '#e6ebf0'; g.fillRect(CX, cy + 4, CR - CX, 2);
      text('Total Trade-In Value', CX, cy + 52, 700, 30, '#1d1d1f');
      text(nairaK(q.value), CR, cy + 52, 800, 32, '#18577b', 'right');
    }
    y += cardH;
  };

  const drawSwaps = () => {
    label(items.length ? 'YOUR SWAP OPTIONS' : 'DEVICES', y + 36);
    y += H_LABEL;
    q.compare.forEach((cmp, i) => {
      const hh = swapH[i], ex = hh - 176;
      g.fillStyle = '#c8e4ff'; roundRect(g, IX + 1.5, y + 1.5, IW - 3, hh - 3, 36); g.fill(); g.strokeStyle = '#9fcaf5'; g.lineWidth = 3; g.stroke();
      const rest = cmp.name.split(' · ').slice(1);
      const CX = IX + 40, CR = IX + IW - 40;
      const amt = amtOf(cmp);
      swapLines[i].forEach((ln, k) => text(ln, CX, y + 62 + k * 42, 700, 34, '#1d1d1f'));
      text(cmp.dealNote || rest.join(' · '), CX, y + ex + 104, 400, 26, '#4a4f57');
      if (items.length) text(`Price ${nairaK(cmp.price)}`, CX, y + ex + 142, 400, 26, '#4a4f57');
      const mid = y + hh / 2;
      const col = cmp.kind === 'receive' || cmp.kind === 'even' ? '#0a7d45' : '#18577b';
      // The figure first, then what it means in plain words underneath.
      text(amt, CR, mid + 14, 800, 54, col, 'right');
      g.letterSpacing = '1.5px';
      text(items.length ? termsLabel(cmp).toUpperCase() : 'PRICE', CR, mid + 50, 700, 19, col, 'right');
      g.letterSpacing = '0px';
      y += hh + GAP;
    });
    y -= GAP;
  };

  // The trade-in comes first, then the swap options it pays towards.
  y += 6;
  if (items.length) { drawTrade(); if (q.compare.length) { y += 44; drawSwaps(); } } else if (q.compare.length) drawSwaps();

  // footer, inside the pop-up
  const fy = PT + PH - H_FOOT;
  g.fillStyle = 'rgba(24,87,123,0.12)'; g.fillRect(IX, fy, IW, 2);
  text('swapdesk.ng', W / 2, fy + 56, 600, 30, '#007bff', 'center');
  text('An Upgrade Brands product', W / 2, fy + 96, 400, 24, '#6a6a70', 'center');
  const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
  return new File([blob], 'swapdesk-quotes.png', { type: 'image/png' });
}
/** Phones: open the share sheet (Save Image puts it in Photos). Must run straight from the tap, so the file is made in advance. */
/** Strip WhatsApp formatting (*bold*, _italic_) for places that show it literally. */
function plainText(t) { return t.replace(/\*([^*\n]+)\*/g, '$1').replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,])/gm, '$1$2'); }
function deliverImage(file, app) {
  if (navigator.canShare?.({ files: [file] })) {
    navigator.share({ files: [file] }).catch((e) => { if (e?.name !== 'AbortError') downloadFile(file, app); });
    return;
  }
  downloadFile(file, app);
}
function downloadFile(file, app) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = file.name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  app.toast('Image saved');
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }

// ---------- sign in: name and WhatsApp number, so every swap code is kept (Daniel, 7 Oct) ----------

/** A short line for a saved code: the trade-in device, then how many swap options. */
function codeLabel(q) {
  const dev = q.items && q.items.length > 1 ? `${q.items.length} devices` : q.device?.name.split(' · ')[0] || '';
  const n = q.compare?.length || 0;
  const into = n === 1 ? q.compare[0].name.split(' · ')[0] : n ? `${n} swap options` : '';
  return [dev, into].filter(Boolean).join(' → ') || 'Swap Quote';
}

function signIn(el, app, params = {}) {
  const next = params.next || '';
  const me = getMe();
  // From the swap flow, first the choice; from the corner (or "Sign In" on that choice), the form.
  if (next && !params.form && !me) {
    el.classList.add('choose');
    el.innerHTML = layout(html`
      <div class="head-block">
        <h2 class="h-title">Save Your Swap Codes</h2>
        <p class="par">Sign in once with your WhatsApp number and every swap code you make is kept for you.</p>
      </div>
      <div class="stack nav-stack signin-ask">
        <button class="btn two" type="button" data-act="guest"><span class="bt">Continue as Guest</span><span class="bs">Codes won’t be saved</span></button>
        <button class="btn blue two" type="button" data-act="form"><span class="bt">Sign In</span><span class="bs">Save your codes</span></button>
      </div>`, pills(backPill())).toString();
    wire(el, app, {
      guest: () => { setGuest(); app.go(next, {}, { replace: true }); },
      form: () => app.go('signin', { next, form: 1 }, { replace: true }),
    });
    return;
  }
  // Three forms (Daniel, 7 Oct):
  //   Sign In: WhatsApp number and PIN.
  //   Sign Up: full name, WhatsApp number, location and a PIN.
  //   Your Details (signed in): full name, WhatsApp number and location. The PIN changes from its own tile.
  const mode = me ? 'edit' : params.mode === 'up' ? 'up' : 'in';
  const live = (app.catalog.features || []).includes('customers');
  let cityKey = me?.city || app.s.city || '';
  el.classList.add('signin');
  const title = { in: 'Sign In', up: 'Sign Up', edit: 'Your Details' }[mode];
  const par = { in: 'Welcome back. Your WhatsApp number and PIN.', up: 'Create your account to keep every swap code.', edit: 'Keep your details up to date.' }[mode];
  const pinField = (label) => html`<label class="field si-field"><span class="si-label">${label}</span>
        <input data-signpin type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="${mode === 'up' ? 'new-password' : 'current-password'}" enterkeyhint="go" placeholder="4 digits"></label>`;
  el.innerHTML = layout(html`
    <div class="head-block">
      <h2 class="h-title">${title}</h2>
      <p class="par">${par}</p>
    </div>
    <div class="si-fields">
      ${mode !== 'in' ? html`<label class="field si-field"><span class="si-label">Full Name</span>
        <input data-name autocomplete="name" autocapitalize="words" maxlength="60" enterkeyhint="next" placeholder="First and last name" value="${me?.name || ''}"></label>` : ''}
      <label class="field si-field"><span class="si-label">WhatsApp Number</span>
        <input data-phone type="tel" inputmode="tel" autocomplete="tel" maxlength="20" enterkeyhint="next" placeholder="0803 123 4567" value="${me ? showPhone(me.phone) : params.phone || ''}"></label>
      ${mode !== 'in' ? html`<div class="si-field"><span class="si-label">Location</span>
        <div class="cities si-cities" role="radiogroup" aria-label="Location">
          ${CITIES.map((c) => html`<button class="opt" type="button" role="radio" aria-checked="${c.key === cityKey ? 'true' : 'false'}" data-act="city" data-v="${c.key}">${c.name}</button>`)}
        </div></div>` : ''}
      ${mode === 'in' ? pinField('PIN') : mode === 'up' ? pinField('Create a PIN') : ''}
      <p class="small oq-err" role="alert">${params.note || ''}</p>
      ${mode === 'up' ? html`<p class="small si-note">We use your number to keep your swap codes and to reach you about your swap.</p>` : ''}
      ${mode === 'in' ? html`<p class="si-switch">Don’t have an account? <button class="link" type="button" data-act="toup">Sign Up</button></p>` : ''}
      ${mode === 'up' ? html`<p class="si-switch">Already have an account? <button class="link" type="button" data-act="toin">Sign In</button></p>` : ''}
    </div>`,
  pills(backPill(), html`<button class="pill go" type="button" data-act="submit">${mode === 'edit' ? 'Save' : title}</button>`)).toString();
  const nameIn = $('[data-name]', el), phoneIn = $('[data-phone]', el), pinIn = $('[data-signpin]', el), err = $('.oq-err', el);
  const go = (m, msg) => {
    saveCustomer(m);
    app.paintChip?.();
    haptic();
    app.toast(msg);
    app.go(next || 'me', {}, { replace: true });
  };
  const switchTo = (to, extra = {}) => app.go('signin', { next, form: 1, mode: to, phone: phoneIn.value, ...extra }, { replace: true });
  const fail = (msg, input) => { err.textContent = msg; input?.focus(); };
  const submit = async () => {
    const b = $('[data-act="submit"]', el);
    const phone = normPhone(phoneIn.value);
    const pin = pinIn ? pinIn.value.trim() : '';
    if (mode === 'in') {
      if (!phone) return fail('Type your WhatsApp number, e.g. 0803 123 4567.', phoneIn);
      if (!/^\d{4}$/.test(pin)) return fail('Your PIN is 4 digits.', pinIn);
      b.disabled = true; err.textContent = '';
      const r = await signInRemote(phone, pin).catch(() => null);
      b.disabled = false;
      if (r && r.ok) {
        const city = CITIES.find((c) => c.name === r.city)?.key || '';
        return go(setMe({ name: r.name || '', phone, city, pin, codes: [], at: new Date().toISOString() }), `Welcome back, ${String(r.name || '').split(' ')[0] || 'friend'}`);
      }
      if (r && r.needPin) return fail(r.error || 'That PIN doesn’t match.', pinIn);
      if (r && r.notFound) return fail('There’s no account for this number yet. Sign Up below.');
      // The sheet can't check accounts yet (older script) or there's no connection: carry on with Sign Up.
      return switchTo('up', { note: 'We couldn’t find your account. Sign Up to continue.' });
    }
    const name = nameIn.value.trim().replace(/\s+/g, ' ');
    if (name.split(' ').length < 2 || name.length < 4) return fail('Type your full name: first and last name.', nameIn);
    if (!phone) return fail('Type your WhatsApp number, e.g. 0803 123 4567.', phoneIn);
    if (!cityKey) return fail('Pick your location.');
    if (mode === 'up') {
      if (!/^\d{4}$/.test(pin)) return fail('Create a 4-digit PIN.', pinIn);
      if (live) {
        b.disabled = true; err.textContent = '';
        const r = await savePin({ phone, pin: '' }, pin).catch(() => null);
        b.disabled = false;
        // A number that already has a PIN already has an account.
        if (r && !r.ok && /current PIN|Too many/i.test(r.error || '')) return fail('This number already has an account. Sign In instead.');
      }
      return go(setMe({ name, phone, city: cityKey, pin, codes: [], at: new Date().toISOString() }), `Welcome, ${name.split(' ')[0]}`);
    }
    // Your Details: the same number keeps its codes and PIN; a different number starts fresh.
    const same = me.phone === phone;
    return go(setMe({ ...(same ? me : {}), name, phone, city: cityKey, at: new Date().toISOString() }), 'Details saved');
  };
  wire(el, app, {
    submit,
    toup: () => switchTo('up'),
    toin: () => switchTo('in'),
    city: (b) => { cityKey = b.dataset.v; $$('[data-act="city"]', el).forEach((x) => x.setAttribute('aria-checked', String(x === b))); err.textContent = ''; },
  });
  const enter = (from, to) => from?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (to) to.focus(); else submit(); } });
  enter(nameIn, phoneIn); enter(phoneIn, pinIn); enter(pinIn, null);
  [nameIn, phoneIn, pinIn].forEach((i) => i?.addEventListener('input', () => { err.textContent = ''; }));
  if (!me) setTimeout(() => (nameIn && !params.phone ? nameIn : phoneIn).focus(), 250);
}

/** The customer's own page: the same actions as Home, plus what an account adds, and every swap code. */
function meScreen(el, app) {
  let m = getMe();
  if (!m) { app.go('signin', {}, { replace: true }); return false; }
  const live = (app.catalog.features || []).includes('customers');
  // The second time they open their page, offer a PIN, so it doesn't all come at once (Daniel, 7 Oct).
  m = updateMe({ views: (m.views || 0) + 1 });
  let showPin = live && !m.pin && m.views >= 2 && m.views >= (m.pinLater || 0);
  const city = CITIES.find((c) => c.key === m.city);
  let codes = (m.codes || []).map((c) => ({ id: c.id, at: c.at, label: c.label }));
  let state = live ? 'loading' : 'ready';
  const date = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };
  const codesHtml = () => {
    if (state === 'locked') {
      return html`<div class="pin-card"><p class="pin-t">Enter Your PIN</p><p class="small">This number has a PIN. Type it to see your swap codes.</p>
        <input class="pin-in" data-pin type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" placeholder="••••">
        <p class="small oq-err" role="alert"></p>
        <button class="btn blue" type="button" data-act="unlock">Show My Codes</button></div>`;
    }
    if (!codes.length) return html`<p class="small codes-empty">${state === 'loading' ? 'Loading your codes…' : 'No swap codes yet. Every quote you save from now on shows up here.'}</p>`;
    return html`<div class="mcard codes">${codes.map((c) => html`<button class="cfg code-row" type="button" data-act="open" data-v="${c.id}">
      <span class="main">${c.id}<span class="l2"><span class="sub">${c.label}</span><span class="sub">${date(c.at)}</span></span></span>${raw(ICON.chevron)}</button>`)}</div>`;
  };
  const hasPin = () => !!getMe()?.pin;
  const pinCard = () => (showPin && state !== 'locked' ? html`<div class="pin-card" data-pincard>
      <p class="pin-t">${hasPin() ? 'Change Your PIN' : 'Add a PIN'}</p><p class="small">4 digits, so only you can open your codes on another phone.</p>
      <input class="pin-in" data-newpin type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" placeholder="••••">
      <p class="small oq-err" role="alert"></p>
      <button class="btn blue" type="button" data-act="setpin">${hasPin() ? 'Save PIN' : 'Add PIN'}</button>
      <button class="link" type="button" data-act="later">Not Now</button></div>` : '');
  const tile = (act, ico, label) => html`<button class="me-tile" type="button" data-act="${act}">${raw(ico)}<span>${label}</span></button>`;
  const draw = () => {
    el.innerHTML = layout(html`
      <div class="head-block">
        <h2 class="h-title">Hi, ${firstName(m)}</h2>
        <p class="par">${showPhone(m.phone)}${city ? ` · ${city.name}` : ''}</p>
      </div>
      <div class="stack tight me-actions">
        <button class="btn green" type="button" data-act="prices">Check for Prices</button>
        <button class="btn" type="button" data-act="trade">Check My Trade-In Value</button>
        <button class="btn blue" type="button" data-act="swap">Calculate My Swap Rate</button>
      </div>
      <div class="me-tiles">
        ${tile('openq', ICON.search, 'Open a Quote')}
        ${tile('chat', ICON.whatsapp, 'Chat With Us')}
        ${tile('pin', ICON.lock, hasPin() ? 'Change PIN' : 'Add a PIN')}
        ${tile('edit', ICON.edit, 'Edit Details')}
      </div>
      ${pinCard()}
      <p class="group-label me-label">My Swap Codes</p>
      ${codesHtml()}
      <button class="link signout" type="button" data-act="signout">Sign Out</button>`, pills(backPill())).toString();
  };
  el.classList.add('me-pg');
  draw();
  const load = () => {
    if (!live) return;
    fetchCodes(getMe()).then((r) => {
      if (r && r.ok) {
        // A PIN made at Sign Up before the sheet could store it goes up now.
        const cur = getMe();
        if (!r.hasPin && cur?.pin) savePin({ ...cur, pin: '' }, cur.pin).catch(() => {});
        const local = new Map(codes.map((c) => [c.id, c]));
        for (const c of r.codes || []) local.set(c.id, { id: c.id, at: c.created, label: c.label || local.get(c.id)?.label || 'Swap Quote' });
        codes = [...local.values()].sort((a, b) => String(b.at).localeCompare(String(a.at)));
        state = 'ready';
      } else if (r && r.needPin) state = 'locked';
      else state = 'ready';
    }).catch(() => { state = 'ready'; }).finally(() => { if (el.isConnected) draw(); });
  };
  load();
  wire(el, app, {
    prices: () => app.go('prices'),
    trade: () => app.go('trade-in'),
    swap: () => startFlow(app, 'swap'),
    openq: () => app.go('openq'),
    chat: () => { location.href = whatsappURL(`Hi SwapDesk, this is ${m.name} (${showPhone(m.phone)}).`); },
    pin: () => {
      if (!live) { app.toast('PINs are switching on soon.'); return; }
      showPin = true; draw(); $('[data-newpin]', el)?.focus();
    },
    open: (b) => app.go('quote', { id: b.dataset.v }),
    edit: () => app.go('signin', { form: 1 }),
    signout: () => { signOut(); app.paintChip?.(); app.toast('Signed out'); app.go('home', {}, { replace: true }); },
    later: () => { m = updateMe({ pinLater: m.views + 3 }); showPin = false; $('[data-pincard]', el)?.remove(); },
    setpin: async (b) => {
      const pin = $('[data-newpin]', el).value.trim();
      const e = $('[data-pincard] .oq-err', el);
      if (!/^\d{4}$/.test(pin)) { e.textContent = 'Use 4 digits.'; return; }
      b.disabled = true;
      const r = await savePin(getMe(), pin).catch(() => null);
      b.disabled = false;
      if (!r || !r.ok) { e.textContent = r?.error || 'Couldn’t save your PIN. Check your connection and try again.'; return; }
      const had = hasPin();
      m = updateMe({ pin });
      showPin = false;
      app.toast(had ? 'PIN changed' : 'PIN added');
      draw();
    },
    unlock: async (b) => {
      const pin = $('[data-pin]', el).value.trim();
      const e = $('.pin-card .oq-err', el);
      if (!/^\d{4}$/.test(pin)) { e.textContent = 'Your PIN is 4 digits.'; return; }
      b.disabled = true;
      const r = await fetchCodes({ ...getMe(), pin }).catch(() => null);
      b.disabled = false;
      if (r && r.ok) { m = updateMe({ pin }); state = 'loading'; load(); return; }
      e.textContent = r?.error || (r?.needPin ? 'That PIN doesn’t match.' : 'Couldn’t check your PIN. Try again.');
    },
  });
}

export const SCREENS = {
  home,
  pick: picker,
  choose,
  loading,
  good,
  confirm,
  q: question,
  conds: conditions,
  sim: simScreen,
  signin: signIn,
  me: meScreen,
  openq: openQuote,
  value,
  compare,
  finish,
  saved,
  prices: (el, app, p) => listScreen(el, app, 'prices', p),
  'trade-in': (el, app, p) => listScreen(el, app, 'trade-in', p),
  quote: (el, app, p) => quoteScreen(el, app, p),
  startWith,
  startFlow,
};

export { answersText };
