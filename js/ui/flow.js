// The SwapDesk screens: home, device picker, condition questions, trade-in value,
// swap comparison, completing on WhatsApp and saved quotes.
import { CONFIG, CITIES } from '../config.js';
import {
  NEATNESS, NETWORK, amountFor, valueDevice, swapTerms, termsLabel, faultsFor, applies, compareOrder, matches, variantOrder,
} from '../engine.js';
import { html, raw, naira, variantName, $, $$ } from '../format.js';
import { ICON, neatnessIllo } from './icons.js';
import { animateNumber, haptic } from './motion.js';
import {
  buildQuote, saveQuote, summaryText, whatsappMessage, whatsappURL, share, copy, answersText,
} from '../quote.js';
import { listScreen, listRows, dealRows } from './lists.js';
import { quoteScreen } from './quoteView.js';

const KEY = 'swapdesk.state.v2';

export const freshAnswers = () => ({
  batteryBand: '', origin: '', icloudLocked: null, battery: '', batteryUnknown: false, neatness: null, network: null, faults: [], faultsDone: false,
});
const freshPick = () => ({ type: '', brand: '', model: '', search: '' });

export function restoreState() {
  const base = { mode: 'swap', cash: false, deviceId: '', answers: freshAnswers(), compare: [], city: '', saved: null, pick: freshPick(), add: freshPick() };
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

const TYPE_LABEL = {};
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
  { key: '90', label: '90% and above', hint: 'Like new', value: 95 },
  { key: '85', label: '85% – 89%', hint: 'No deduction', value: 87 },
  { key: '80', label: '80% – 84%', hint: 'Battery deduction applies', value: 82 },
  { key: '79', label: '79% or less', hint: 'Battery deduction applies', value: 75 },
];
const ORIGIN_LABEL = {
  'Brand New': ['Brand new, still sealed', 'Never opened or activated.'],
  'Active Brand New': ['Brand new, but activated', 'Opened and set up, barely used.'],
  'Active Brand New (Non LLA)': ['Brand new, activated (non-LLA)', 'Opened and set up; not an LL/A model.'],
  'Foreign USED': ['Used, bought abroad', 'UK or US used, imported.'],
  'Foreign USED (Non LLA)': ['Used, bought abroad (non-LLA)', 'UK or US used; not an LL/A model.'],
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
    default: return true;
  }
}
export function engineAnswers(a, device) {
  return {
    icloudLocked: a.icloudLocked === true,
    battery: a.batteryUnknown || !a.batteryBand ? null : BATTERY_BANDS.find((b) => b.key === a.batteryBand).value,
    batteryLabel: a.batteryBand ? BATTERY_BANDS.find((b) => b.key === a.batteryBand).label : '',
    neatness: a.neatness,
    network: device.type === 'Phones' ? a.network : 'factory',
    faults: a.faults,
  };
}
function currentValue(app) {
  const d = ownDevice(app);
  return d ? valueDevice(d, engineAnswers(app.s.answers, d), app.catalog.settings) : null;
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
      <h1 class="h-display">The fastest way<br>to <span class="blue">Swap.</span></h1>
      <p class="lead">Trade in the Phone, Watch, Speaker or AirPods you’ve got for the one you love 💙 and get your swap balance in under a minute.</p>
    </div>
    <div class="stack tight">
      <button class="btn green" type="button" data-act="prices">Check for Prices</button>
      <button class="btn" type="button" data-act="trade">Check My Trade-In Value</button>
      <button class="btn blue" type="button" data-act="swap">Calculate My Swap Rate</button>
    </div>
    <p class="home-note">Get an honest value in minutes, compare up to ${max} devices side by side, then swap in Port Harcourt, Abuja, Lagos, Uyo or Yenagoa, or send your device in from anywhere.</p>`, '').toString();
  wire(el, app, {
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
  Object.assign(s, { deviceId: '', answers: freshAnswers(), compare: [], city: '', saved: null, cash: false });
  s.pick = freshPick();
  app.save();
  app.go('pick');
}

/** Deep link from the Trade-In Values list (?device=id). */
function startWith(app, id) {
  const s = app.s;
  if (s.deviceId !== id) { s.deviceId = id; s.answers = freshAnswers(); s.saved = null; s.compare = []; s.city = ''; }
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
    (cat.seriesOrder.get(a.series) ?? 1e9) - (cat.seriesOrder.get(b.series) ?? 1e9) ||
    (cat.modelOrder.get(a.model) ?? 1e9) - (cat.modelOrder.get(b.model) ?? 1e9) || variantOrder(a, b);
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
    return html`<button class="opt ver" type="button" role="${add ? 'checkbox' : 'radio'}" aria-checked="${on ? 'true' : 'false'}" data-act="version" data-id="${d.id}">
      <span class="main">${title}${deal ? raw('<span class="tag">One unit</span>') : ''}${sub ? html`<span class="sub">${sub}</span>` : ''}</span>
      <span class="val">${add ? '' : raw('<small>Up to</small>')}${add ? naira(d.price) : naira(d.tradeInValue)}</span>${add ? raw('<span class="tick box" aria-hidden="true"></span>') : ''}</button>`;
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
      <span class="main">${withModel ? d.model : (d.storage || 'Standard')}${withModel && d.storage ? html`<span class="sub">${d.storage}</span>` : ''}</span>
      ${raw(ICON.chevron)}</button>`;

  function draw() {
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
      const found = devices.filter((d) => matches(d, q)).sort(byOrder).slice(0, 60);
      options = found.length ? (add ? found.map((d) => version(d, true)) : byStorage(found).map((d) => storageOpt(d, true))) : html`<p class="empty">No devices match “${q}”.</p>`;
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
      options = add ? vs.map((d) => version(d, false)) : byStorage(vs).map((d) => storageOpt(d, false));
    }

    // Progress through picking your device: type → brand → model → storage (then Calculating).
    const STEPS = ['type', 'brand', 'model', 'version'];
    const frac = add ? 0 : (st.search ? STEPS.indexOf(lv) : STEPS.indexOf(lv)) / STEPS.length;
    const fromFrac = prevFrac ?? frac;
    const oldHead = $('.pick-head', el);
    const oldKey = oldHead?.dataset.key;
    const headKey = `${lv}|${title}`;
    el.innerHTML = html`
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
    el.innerHTML = layout(raw(el.innerHTML), pills(backPill(), add ? html`<button class="pill go" type="button" data-act="done">Done</button>` : '')).toString();
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
    const pos = e.target.selectionStart;
    draw();
    const inp = $('[data-search]', el);
    inp.focus();
    try { inp.setSelectionRange(pos, pos); } catch { /* search inputs */ }
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
          if (!cur || cur.model !== nd.model || cur.storage !== nd.storage) { s.deviceId = id; s.answers = freshAnswers(); s.saved = null; s.compare = []; s.city = ''; }
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
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ms = reduce ? 900 : 1900;
  const from = typeof app.s._pickFrac === 'number' ? app.s._pickFrac : 0.75;
  el.classList.add('loading');
  // Everything else steps away; the progress bar carries the wait, then the result appears.
  el.innerHTML = layout(html`
    <div class="progress pick-progress load-bar" aria-hidden="true"><i style="transform:scaleX(${from})"></i></div>
    <p class="visually-hidden" role="status">Calculating your trade-in value for ${d.model} ${d.storage}</p>`, '').toString();
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

// ---------- "Congratulations" (the original result, kept) ----------

function confirm(el, app) {
  CATALOG = app.catalog;
  const d = ownDevice(app);
  if (!d) { app.go('pick', {}, { replace: true }); return false; }
  const upTo = d.tradeInValue || 0;
  const name = [d.model, d.storage].filter(Boolean).join(' ');
  el.innerHTML = html`
    <div class="head-block">
      <h2 class="h-title">Your Device</h2>
      <p class="par">Here’s the standard Trade-In Value for the device you picked.</p>
    </div>
    <div class="stack crumbs">
      <button class="opt crumb" type="button" data-act="change"><span class="main">${d.model}</span><span class="edit">Change</span></button>
      ${d.storage ? html`<button class="opt crumb" type="button" data-act="change"><span class="main">${d.storage}</span><span class="edit">Change</span></button>` : ''}
    </div>
    <div class="result-block">
    <div class="tiv">
      <p class="tiv-label">Up to</p>
      <p class="big-num">${naira(upTo)}</p>
    </div>
    <p class="congrats">Congratulations!</p>
    <p class="par">You can Trade In your <strong>${name}</strong> for <strong>Cash</strong> or <strong>Swap</strong> to another device. This is its value in good working condition.</p>
    </div>`;
  el.innerHTML = layout(raw(el.innerHTML), pills(backPill(), html`<button class="pill go" type="button" data-act="ok">Confirm</button>`)).toString();
  wire(el, app, {
    change: () => app.go('pick'),
    ok: () => app.go('good'),
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
      Object.assign(app.s.answers, { icloudLocked: false, battery: '', batteryUnknown: true, neatness: 'spotless', network: 'factory', faults: [], faultsDone: true, quick: true });
      app.s.saved = null; app.save(); app.go('choose');
    },
    no: () => { app.s.answers.quick = false; app.save(); app.go('q', { i: 0 }); },
  });
}

// ---------- condition questions, one per screen ----------

function question(el, app, params) {
  const d = ownDevice(app);
  if (!d) { app.go('pick', {}, { replace: true }); return false; }
  CATALOG = app.catalog;
  const s = app.s;
  const a = s.answers;
  const qs = questionsFor(d);
  const i = Math.min(Number(params.i) || 0, qs.length - 1);
  const q = qs[i];

  const opt = (checked, attrs, main, sub, extra = '') => html`
    <button class="opt" type="button" role="radio" aria-checked="${checked ? 'true' : 'false'}" ${raw(attrs)}>
      ${raw(extra)}<span class="main">${main}${sub ? html`<span class="sub">${sub}</span>` : ''}</span><span class="tick" aria-hidden="true"></span></button>`;

  function body() {
    const apple = d.brand === 'Apple';
    switch (q.key) {
      case 'origin':
        return html`<h2 class="h-title">Is it new or used?</h2>
          <p class="par">This sets the starting value for your ${d.model}${d.storage ? ` ${d.storage}` : ''}.</p>
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
          <p class="par">${apple ? raw('Go to <b>Settings › Battery › Battery Health &amp; Charging</b> and check <b>Maximum Capacity</b>.') : 'Pick the range that matches your device. If it doesn’t show battery health, choose Not sure.'}</p></div>
          <div class="stack q-opts" role="radiogroup">
            ${BATTERY_BANDS.map((b) => opt(a.batteryBand === b.key, `data-act="band" data-v="${b.key}"`, b.label, b.hint))}
            ${opt(a.batteryUnknown, 'data-act="unsure"', 'Not sure', 'We’ll check it in store.')}
          </div>`;
      case 'neatness':
        return html`<h2 class="h-title">How does it look?</h2>
          <p class="par">Check the screen, back and frame in good light.</p>
          <div class="stack q-opts" role="radiogroup">${NEATNESS.map((n, k) => opt(a.neatness === n.key, `data-act="neat" data-v="${n.key}"`, n.label, n.hint, neatnessIllo(k)))}</div>`;
      case 'network':
        return html`<h2 class="h-title">Is it network locked?</h2>
          <p class="par">How does it take a SIM, and is it locked to a network?</p>
          <div class="stack q-opts" role="radiogroup">${NETWORK.map((n) => opt(a.network === n.key, `data-act="net" data-v="${n.key}"`, n.label, n.hint))}</div>`;
      case 'faults':
        return html`<h2 class="h-title">Anything not working?</h2>
          <p class="par">Tick everything that applies.</p>
          <div class="stack q-opts" role="group">
            ${q.faults.map((f) => html`<button class="opt" type="button" role="checkbox" aria-checked="${a.faults.includes(f.key) ? 'true' : 'false'}" data-act="fault" data-v="${f.key}">
              <span class="main">${f.label}<span class="sub">${f.hint}</span></span><span class="tick box" aria-hidden="true"></span></button>`)}
            <button class="opt" type="button" role="checkbox" aria-checked="${a.faultsDone && !a.faults.length ? 'true' : 'false'}" data-act="allgood">
              <span class="main">Everything works</span><span class="tick box" aria-hidden="true"></span></button>
          </div>`;
      default: return '';
    }
  }

  function draw() {
    const r = valueDevice(d, engineAnswers(a, d), app.catalog.settings);
    const done = qs.filter((x) => answered(x, a)).length;
    const last = i === qs.length - 1;
    el.innerHTML = html`
      <p class="eyebrow">Question ${i + 1} of ${qs.length} · ${d.model}${r.accepted ? html` · <span class="so-far-inline">so far <b data-live>${naira(r.value)}</b></span>` : ''}</p>
      <div class="progress" aria-hidden="true"><i style="transform:scaleX(${done / qs.length})"></i></div>
      ${body()}`;
    el.innerHTML = layout(raw(el.innerHTML), html`
      ${pills(backPill(), html`<button class="pill go" type="button" data-act="next" ${answered(q, a) ? '' : 'disabled'}>${last ? 'See My Value' : 'Next'}</button>`)}`).toString();
  }
  function next() {
    if (!answered(q, a)) return;
    if (i < qs.length - 1) app.go('q', { i: i + 1 });
    else if (allAnswered(app)) app.go('value');
    else app.go('q', { i: qs.findIndex((x) => !answered(x, a)) });
  }
  function set(fn, advance = false) {
    fn(a);
    s.saved = null;
    app.save();
    haptic();
    if (advance && answered(q, a)) { next(); return; }
    draw();
  }

  draw();
  wire(el, app, {
    origin: (b) => { s.deviceId = b.dataset.v; set((x) => { x.origin = b.dataset.v; }, true); },
    icloud: (b) => set((x) => { x.icloudLocked = b.dataset.v === 'yes'; }, b.dataset.v === 'no'),
    unsure: () => set((x) => { x.batteryUnknown = true; x.batteryBand = ''; x.battery = ''; }, true),
    band: (b) => set((x) => { x.batteryBand = b.dataset.v; x.batteryUnknown = false; }, true),
    neat: (b) => set((x) => { x.neatness = b.dataset.v; }, true),
    net: (b) => set((x) => { x.network = b.dataset.v; }, true),
    fault: (b) => set((x) => {
      const v = b.dataset.v;
      x.faults = x.faults.includes(v) ? x.faults.filter((f) => f !== v) : [...x.faults, v];
      x.faultsDone = x.faults.length > 0;
    }),
    allgood: () => set((x) => { x.faults = []; x.faultsDone = true; }),
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
  if (!allAnswered(app)) { app.go('q', { i: 0 }, { replace: true }); return false; }
  const r = currentValue(app);
  const s = app.s;
  el.innerHTML = html`
    <div class="head-block">
      <h2 class="h-title">Your Trade-In Value</h2>
      <p class="par">Here’s what your device is worth after the condition check.</p>
    </div>
    ${devValue(d, r.value, r.start)}
    <p class="small">Estimated. Confirmed when we check your device in store, and slightly negotiable.</p>
    <div class="card"${s.answers.quick ? raw(' hidden') : ''}>
      <ul class="lines">
        <li><span>Starting value, perfect condition</span><span>${naira(r.start)}</span></li>
        ${r.lines.map((l) => html`<li class="${l.amount === null ? 'pending' : ''}"><span>${l.label}</span><span>${l.amount === null ? 'Checked in store' : `− ${naira(l.amount)}`}</span></li>`)}
        ${r.lines.length ? html`<li class="total"><span>Your trade-in value</span><span>${naira(r.value)}</span></li>` : ''}
      </ul>
    </div>
    ${s.answers.quick ? html`<p class="small">Based on your device being in good working condition.</p>` : ''}
    <p><button class="link" type="button" data-act="edit">${s.answers.quick ? 'Answer condition questions instead' : 'Edit answers'}</button></p>`;
  el.innerHTML = layout(raw(el.innerHTML), pills(backPill(), html`<button class="pill go" type="button" data-act="proceed">Proceed</button>`)).toString();
  requestAnimationFrame(() => animateNumber($('.big-num', el), r.value, naira));
  wire(el, app, {
    edit: () => { s.answers.quick = false; app.save(); app.go('q', { i: 0 }); },
    proceed: () => app.go('choose'),
  });
}

// ---------- what next: swap or cash ----------

function choose(el, app) {
  const d = ownDevice(app);
  if (!d || !allAnswered(app)) { app.go('home', {}, { replace: true }); return false; }
  const r = currentValue(app);
  const s = app.s;
  const max = Number(app.catalog.settings['compare.maxDevices']) || 6;
  el.classList.add('choose');
  el.innerHTML = layout(html`
    <div class="head-block">
      <h2 class="h-title">What would you like to do?</h2>
      <p class="par">Swap it for something new, or trade it in for cash.</p>
    </div>
    ${devValue(d, r.value)}
    <div class="stack q-opts">
      <button class="opt" type="button" data-act="swap"><span class="main">Swap to another Device<span class="sub">Compare what you add for up to ${max} devices.</span></span>${raw(ICON.chevron)}</button>
      <button class="opt" type="button" data-act="cash"><span class="main">Trade In for Cash<span class="sub">Get ${naira(r.value)} for your ${d.model}.</span></span>${raw(ICON.chevron)}</button>
    </div>`, pills(backPill())).toString();
  wire(el, app, {
    swap: () => { s.mode = 'swap'; s.cash = false; app.save(); app.go('compare'); },
    cash: () => { s.cash = true; app.save(); app.go('finish'); },
  });
}

// ---------- compare swaps ----------

function compare(el, app) {
  const s = app.s;
  const cat = app.catalog;
  const d = ownDevice(app);
  const r = d && allAnswered(app) ? currentValue(app) : null;
  const tv = r && r.accepted ? r.value : null;
  const max = Number(cat.settings['compare.maxDevices']) || 6;
  const items = s.compare.map((id) => cat.byId.get(id) || { id, gone: true });
  const live = items.filter((x) => !x.gone).sort(compareOrder(cat.modelOrder));
  const gone = items.filter((x) => x.gone);

  const card = (x) => {
    if (x.gone) {
      return html`<article class="cmp gone"><span class="t">No longer available</span><span class="s">This device has sold or been removed.</span>
        <button class="x" type="button" aria-label="Remove" data-act="rm" data-id="${x.id}">${raw(ICON.x)}</button></article>`;
    }
    const t = tv === null ? null : swapTerms(x, tv);
    return html`<article class="cmp ${t ? t.kind : ''}">
      <span class="t">${x.model}${x.condition === 'Deal' ? raw('<span class="tag">One unit</span>') : ''}</span>
      <span class="s">${x.condition === 'Deal' ? [x.storage, x.dealNote].filter(Boolean).join(' · ') : variantName(x)}</span>
      <span class="p">Price ${naira(x.price)}</span>
      <span class="k">${t ? termsLabel(t) : 'Price'}</span>
      <span class="n">${t ? naira(t.kind === 'even' ? 0 : t.amount) : naira(x.price)}</span>
      ${t ? html`<button class="pill go cmp-go" type="button" data-act="pick" data-id="${x.id}">Proceed to Swap</button>` : ''}
      <button class="x" type="button" aria-label="Remove ${x.model} ${variantName(x)}" data-act="rm" data-id="${x.id}">${raw(ICON.x)}</button>
    </article>`;
  };

  el.classList.add('wide');
  el.innerHTML = html`
    <div class="head-block"><h2 class="h-title">Your Swap Rates</h2>
    <p class="par">Compare what it costs to swap into up to ${max} devices.</p></div>
    ${d ? html`<div class="mine">
        <div class="mine-top">
          <span class="main"><span class="eyebrow-s">Your device</span><b>${d.model}</b><span class="sub">${d.storage}</span></span>
          <span class="val">${tv === null ? 'Not valued yet' : naira(tv)}</span>
        </div>
        ${r && r.accepted ? html`<p class="mine-cond">${s.answers.quick ? 'Good working condition' : answersText(engineAnswers(s.answers, d))}</p>
        <details class="mine-how"><summary>How we got ${naira(tv)}</summary>
          <ul class="lines">
            <li><span>Starting value, perfect condition</span><span>${naira(r.start)}</span></li>
            ${r.lines.map((l) => html`<li class="${l.amount === null ? 'pending' : ''}"><span>${l.label}</span><span>${l.amount === null ? 'Checked in store' : `− ${naira(l.amount)}`}</span></li>`)}
            <li class="total"><span>Your trade-in value</span><span>${naira(tv)}</span></li>
          </ul>
          <button class="link" type="button" data-act="edit">Edit answers</button>
        </details>` : ''}
      </div>`
      : html`<div class="notice">Add your device to see what each swap costs. <button class="link" type="button" data-act="own">Value my device</button></div>`}
    ${items.length ? html`<div class="cmp-grid">${live.map(card)}${gone.map(card)}</div>` : html`<p class="small">No devices yet. Add the ones you’re considering, including different storage or condition of the same phone.</p>`}
    ${s.compare.length < max ? html`<button class="btn add" type="button" data-act="add">${raw(ICON.plus)} ${s.compare.length ? 'Add Another Device' : 'Add a Device'}</button>` : ''}`;
  const ready = tv !== null && live.length;
  el.innerHTML = layout(raw(el.innerHTML), html`
    ${ready ? html`<button class="btn green fill" type="button" data-act="help">${raw(ICON.whatsapp)} Let’s Help You Decide</button>` : ''}
    ${pills(backPill(), html`<button class="pill go" type="button" data-act="savequotes" ${ready ? '' : 'disabled'}>Save Quotes</button>`)}`).toString();
  wire(el, app, {
    val: () => app.go('value'),
    edit: () => app.go('q', { i: 0 }),
    own: () => startFlow(app, 'swap'),
    add: () => { s.add = { ...freshPick(), type: d?.type || '' }; app.go('pick', { purpose: 'add' }); },
    pick: (b) => { s.chosen = b.dataset.id; s.cash = false; app.save(); app.go('finish'); },
    savequotes: () => { s.chosen = ''; app.save(); app.go('saved'); },
    help: async (b) => {
      s.chosen = '';
      b.disabled = true;
      const label = b.innerHTML;
      b.textContent = 'Preparing your quotes…';
      const { q, link } = await ensureSaved(app);
      location.href = whatsappURL(helpMessage(q, link));
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
  const d = ownDevice(app);
  const r = currentValue(app);
  const ids = onlyChosen && s.chosen ? [s.chosen] : s.compare;
  const list = s.cash ? [] : ids.map((id) => app.catalog.byId.get(id)).filter(Boolean)
    .sort(compareOrder(app.catalog.modelOrder))
    .map((x) => ({ device: x, terms: r?.accepted ? swapTerms(x, r.value) : { kind: 'unavailable', amount: 0 } }));
  return buildQuote({ device: d ? { ...d, condition: '' } : d, answers: d ? engineAnswers(s.answers, d) : null, result: r, compare: list, city: CITIES.find((c) => c.key === s.city)?.name });
}
async function ensureSaved(app, extra = {}, opts = {}) {
  const s = app.s;
  const q = quoteNow(app, opts);
  const sig = JSON.stringify({ ...q, created: 0, ...extra });
  if (s.saved && s.saved.sig === sig) return { q, ...s.saved };
  const r = await saveQuote(q, extra);
  s.saved = { sig, link: r.link, id: r.id, saved: r.saved };
  app.save();
  return { q, ...s.saved };
}

function finish(el, app) {
  const s = app.s;
  if (!ownDevice(app)) { app.go('home', {}, { replace: true }); return false; }
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
    city: (b) => { s.city = b.dataset.v; app.save(); app.refresh(); $('[data-act="wa"]', el.isConnected ? el : document)?.focus?.({ preventScroll: true }); },
    wa: async (b) => {
      b.disabled = true;
      b.textContent = 'Preparing your quote…';
      const { q, link } = await ensureSaved(app, {}, { onlyChosen: true });
      location.href = whatsappURL(whatsappMessage(q, link, city?.name));
      setTimeout(() => app.refresh(), 1200);
    },
    save: () => app.go('saved'),
  });
}

/** One format for "your device and its value": name line sitting directly on the big figure. */
function devValue(d, value, animateFrom) {
  return html`<div class="dev-value">
    <p class="dev-line"><strong>${d.model}</strong>${d.storage ? ` · ${d.storage}` : ''}</p>
    <p class="big-num"${animateFrom !== undefined ? raw(` data-value="${animateFrom}"`) : ''}>${naira(animateFrom !== undefined ? animateFrom : value)}</p>
  </div>`;
}

function chosenCard(app) {
  const s = app.s;
  const x = !s.cash && s.chosen && app.catalog.byId.get(s.chosen);
  const r = currentValue(app);
  if (!x || !r?.accepted) return '';
  const t = swapTerms(x, r.value);
  return html`<div class="mine chosen">
    <div class="mine-top"><span class="main"><span class="eyebrow-s">Swapping into</span><b>${x.model}</b><span class="sub">${variantName(x)}</span></span>
    <span class="val"><small>${termsLabel(t)}</small>${naira(t.kind === 'even' ? 0 : t.amount)}</span></div></div>`;
}

function helpMessage(q, link) {
  const lines = ['Hi SwapDesk, please help me decide which device to swap into.', '', summaryText(q, ''), '', `My quotes: ${link}`];
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

function saved(el, app) {
  const s = app.s;
  if (!ownDevice(app)) { app.go('home', {}, { replace: true }); return false; }
  el.classList.add('choose');
  el.innerHTML = layout(html`
    <div class="head-block">
      <h2 class="h-title">Save Your Quotes</h2>
      <p class="par">Keep every swap rate you checked, or send them to someone on WhatsApp. Quotes are valid for ${CONFIG.quoteValidDays} days.</p>
    </div>
    <div class="stack q-opts">
      <button class="opt" type="button" data-act="image"><span class="main">Download as Image<span class="sub">Save a picture of your quotes to your phone.</span></span>${raw(ICON.chevron)}</button>
      <button class="opt" type="button" data-act="walink"><span class="main">Share Link on WhatsApp<span class="sub">Send a link that opens these exact quotes.</span></span>${raw(ICON.chevron)}</button>
      <button class="opt" type="button" data-act="copy"><span class="main">Copy Link<span class="sub">Paste it anywhere to come back later.</span></span>${raw(ICON.chevron)}</button>
    </div>`, pills(backPill())).toString();
  wire(el, app, {
    image: async (b) => {
      b.disabled = true;
      const { q, link } = await ensureSaved(app);
      await saveQuoteImage(q, link, app).catch(() => app.toast('Couldn’t make the image. Try Share Link instead.'));
      b.disabled = false;
    },
    walink: async () => {
      const { q, link } = await ensureSaved(app);
      location.href = `https://wa.me/?text=${encodeURIComponent(`My SwapDesk swap quotes\n\n${summaryText(q, '')}\n\n${link}`)}`;
    },
    copy: async () => { const { link } = await ensureSaved(app); await copy(link); app.toast('Link copied'); },
  });
}

/** Draw the quotes as a shareable picture (no libraries): white card, logo, value and each swap. */
async function saveQuoteImage(q, link, app) {
  const W = 1080;
  const rows = q.compare.length;
  const lines = q.lines || [];
  const bH = 70 + (lines.length + 1) * 52 + (lines.length ? 52 : 0);
  const H = 520 + bH + 30 + rows * 190 + 200;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const font = (w, px) => `${w} ${px}px -apple-system, BlinkMacSystemFont, "SF Pro Display", Inter, "Helvetica Neue", Arial, sans-serif`;
  g.fillStyle = '#eef6ff'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#ffffff'; roundRect(g, 40, 40, W - 80, H - 80, 36); g.fill();
  const logo = await loadImg('assets/swapdesk-logo.png').catch(() => null);
  if (logo) g.drawImage(logo, (W - 300) / 2, 80, 300, 300 * logo.height / logo.width);
  g.textAlign = 'center';
  g.fillStyle = '#6a6a70'; g.font = font(500, 30);
  g.fillText(`Swap quote · ${new Date(q.created).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, W / 2, 210);
  g.fillStyle = '#1d1d1f'; g.font = font(700, 40);
  g.fillText(`${q.device.name}`, W / 2, 280);
  g.fillStyle = '#18577b'; g.font = font(800, 96);
  g.fillText(naira(q.value), W / 2, 385);
  g.fillStyle = '#6a6a70'; g.font = font(400, 28);
  g.fillText('Trade-in value · confirmed when we check the device', W / 2, 430);
  // How the trade-in value was reached: starting value, each deduction, final value.
  let y = 480;
  g.fillStyle = '#f7fafe'; roundRect(g, 90, y, W - 180, bH, 24); g.fill();
  g.textAlign = 'left'; g.fillStyle = '#18577b'; g.font = font(700, 26);
  g.fillText(lines.length ? 'HOW WE GOT YOUR VALUE' : 'GOOD WORKING CONDITION', 130, y + 50);
  const row = (label, amt, bold, yy) => {
    g.textAlign = 'left'; g.fillStyle = bold ? '#1d1d1f' : '#454545'; g.font = font(bold ? 700 : 400, 30); g.fillText(label, 130, yy);
    g.textAlign = 'right'; g.fillStyle = bold ? '#18577b' : '#1d1d1f'; g.font = font(bold ? 800 : 500, 30); g.fillText(amt, W - 130, yy);
  };
  let ly = y + 102;
  row('Starting value, good condition', naira(q.device.start), false, ly);
  for (const [label, amt] of lines) { ly += 52; row(label, amt === null ? 'Checked in store' : `− ${naira(amt)}`, false, ly); }
  if (lines.length) { ly += 52; row('Your trade-in value', naira(q.value), true, ly); }
  y += bH + 30;
  g.textAlign = 'left';
  for (const cmp of q.compare) {
    g.fillStyle = '#f3f8ff'; roundRect(g, 90, y, W - 180, 160, 24); g.fill();
    const [model, ...rest] = cmp.name.split(' · ');
    g.fillStyle = '#1d1d1f'; g.font = font(700, 38); g.fillText(model, 130, y + 56);
    g.fillStyle = '#6a6a70'; g.font = font(400, 27); g.fillText(cmp.dealNote || rest.join(' · '), 130, y + 98);
    g.fillText(`Price ${naira(cmp.price)}`, 130, y + 136);
    g.textAlign = 'right';
    g.fillStyle = cmp.kind === 'add' ? '#1d1d1f' : '#0a7d45'; g.font = font(600, 26);
    g.fillText(termsLabel(cmp).toUpperCase(), W - 130, y + 52);
    g.font = font(800, 46); g.fillText(naira(cmp.kind === 'even' ? 0 : cmp.amount), W - 130, y + 112);
    g.textAlign = 'left';
    y += 190;
  }
  g.textAlign = 'center';
  g.fillStyle = '#007bff'; g.font = font(500, 28); const shown = link.replace(/^https?:\/\//, ''); g.fillText(shown.length > 48 ? 'WhatsApp 0703 785 3959 · swapdesk.ng' : shown, W / 2, y + 40);
  g.fillStyle = '#6a6a70'; g.font = font(500, 26); g.fillText('swapdesk.ng · An Upgrade Brands product', W / 2, y + 90);
  const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
  const file = new File([blob], 'swapdesk-quotes.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'My SwapDesk quotes' }); return; } catch (e) { if (e?.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'swapdesk-quotes.png';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  app.toast('Image saved');
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }

export const SCREENS = {
  home,
  pick: picker,
  choose,
  loading,
  good,
  confirm,
  q: question,
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
