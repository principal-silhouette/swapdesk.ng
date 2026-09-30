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
  origin: '', icloudLocked: null, battery: '', batteryUnknown: false, neatness: null, network: null, faults: [], faultsDone: false,
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
function defaultRow(rows) {
  return rows.find((x) => x.condition === 'Foreign USED') || rows[0];
}

function questionsFor(device) {
  const qs = [{ key: 'icloud' }];
  const sib = siblings(device);
  if (sib.length > 1) qs.unshift({ key: 'origin', options: sib });
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
    case 'battery': return a.batteryUnknown || (Number(a.battery) >= 1 && Number(a.battery) <= 100);
    case 'neatness': return !!a.neatness;
    case 'network': return !!a.network;
    case 'faults': return a.faultsDone || a.faults.length > 0;
    default: return true;
  }
}
export function engineAnswers(a, device) {
  return {
    icloudLocked: a.icloudLocked === true,
    battery: a.batteryUnknown || a.battery === '' ? null : Number(a.battery),
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
    <h1 class="h-display">The fastest way<br>to <span class="blue">swap.</span></h1>
    <p class="lead">Trade in the phone you have for the one you love 💙 Get your swap balance in under a minute.</p>
    <div class="stack tight">
      <button class="btn green" type="button" data-act="prices">Check for Prices</button>
      <button class="btn" type="button" data-act="trade">Check My Trade-In Value</button>
      <button class="btn blue" type="button" data-act="swap">Calculate My Swap Rate</button>
    </div>
    <p class="home-note">Value your device line by line, compare your swap balance for up to ${max} devices side by side, then swap in Port Harcourt, Abuja, Lagos, Uyo or Yenagoa, or waybill from anywhere.</p>`, '').toString();
  wire(el, app, {
    prices: () => app.go('prices'),
    tradeList: () => app.go('trade-in'),
    trade: () => startFlow(app, 'trade'),
    swap: () => startFlow(app, 'swap'),
  });
}

function startFlow(app, mode) {
  const s = app.s;
  s.mode = mode;
  // Keep a device that's already valued; start fresh otherwise.
  if (s.deviceId && allAnswered(app)) { app.save(); app.go('value'); return; }
  s.pick = { ...freshPick(), type: s.pick.type };
  app.save();
  app.go('pick');
}

/** Deep link from the Trade-In Values list (?device=id). */
function startWith(app, id) {
  const s = app.s;
  if (s.deviceId !== id) { s.deviceId = id; s.answers = freshAnswers(); s.saved = null; }
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
        type: `First, what kind of device do you want to ${s.mode === 'swap' ? 'Swap' : 'Trade In'}? ⤵️`,
        brand: 'Pick the brand of your device.',
        model: raw(`<strong>Here’s how to find it ⤵️</strong><br>${st.brand === 'Apple' ? 'On your iPhone or iPad, go to Settings › General › About. You’ll see the Model Name and Storage Capacity.' : 'Go to Settings › About phone. You’ll see the model name and storage.'}`),
        version: raw('<strong>Almost there ⤵️</strong><br>You’ll find it under Settings › General › About › Capacity.'),
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
        const summary = !add ? (sizes.join(' · ') || 'One size') : n.length === 1 ? variantName(n[0]) : [sizes.join(' · '), conds.length === 1 ? conds[0] : `${conds.length} conditions`].filter(Boolean).join(' — ');
        g.models.push({ model: d.model, n: n.length, summary, sel: n.some((x) => (add ? s.compare.includes(x.id) : s.deviceId === x.id)) });
      }
      options = groups.map((g) => html`<p class="group-label">${g.series}</p>${g.models.map((m) => html`
        <button class="opt${m.sel ? ' is-selected' : ''}" type="button" data-act="model" data-v="${m.model}">
          <span class="main">${m.model}<span class="sub">${m.summary}</span></span>${raw(ICON.chevron)}</button>`)}`);
    } else {
      const vs = devices.filter((d) => d.model === st.model).sort(variantOrder);
      options = add ? vs.map((d) => version(d, false)) : byStorage(vs).map((d) => storageOpt(d, false));
    }

    el.innerHTML = html`
      <h2 class="h-title">${title}</h2>
      <p class="par">${help}</p>
      <div class="pick-search"><label class="field"><span class="visually-hidden">Search devices</span>${raw(ICON.search)}
        <input type="search" data-search placeholder="Search, e.g. 13 pro max 256" value="${st.search}" autocomplete="off" enterkeyhint="search">
        <button class="clear" type="button" data-act="clear" aria-label="Clear search">${raw(ICON.clear)}</button></label></div>
      ${crumbs.length ? html`<div class="stack crumbs">${crumbs.map(([k, label]) => html`
        <button class="opt crumb" type="button" data-act="crumb" data-v="${k}"><span class="main">${label}</span><span class="edit">Change</span></button>`)}</div><p class="chip-hint">Tap a selected option to change it.</p>` : ''}
      <div class="stack">${options}</div>`;
    el.innerHTML = layout(raw(el.innerHTML), pills(backPill(), add ? html`<button class="pill go" type="button" data-act="done">Done</button>` : '')).toString();
  }

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
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ms = reduce ? 900 : 1900;
  el.classList.add('loading');
  el.innerHTML = layout(html`
    <div class="load">
      <div class="load-ring" aria-hidden="true"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="28"/><circle class="arc" cx="32" cy="32" r="28" style="animation-duration:${ms}ms"/></svg></div>
      <h2 class="h-title">Calculating…</h2>
      <p class="par"><strong>${d.model}</strong><br>${d.storage}</p>
      <p class="load-step" role="status" aria-live="polite">Checking today’s prices</p>
    </div>`, '').toString();
  const steps = ['Checking today’s prices', 'Matching your model', 'Working out your value'];
  const stepEl = $('.load-step', el);
  let i = 0;
  const tick = setInterval(() => { i = Math.min(i + 1, steps.length - 1); if (stepEl.isConnected) stepEl.textContent = steps[i]; }, ms / 3);
  setTimeout(() => {
    clearInterval(tick);
    if (app.screen === 'loading') app.go('confirm', {}, { replace: true });
  }, ms);
}

// ---------- "Congratulations" (the original result, kept) ----------

function confirm(el, app) {
  CATALOG = app.catalog;
  const d = ownDevice(app);
  if (!d) { app.go('pick', {}, { replace: true }); return false; }
  const upTo = Math.max(...siblings(d).map((x) => x.tradeInValue || 0), d.tradeInValue || 0);
  const name = [d.storage, d.model].filter(Boolean).join(', ');
  el.innerHTML = html`
    <h2 class="h-title">Your Device</h2>
    <div class="stack crumbs">
      <button class="opt crumb" type="button" data-act="change"><span class="main">${d.model}</span><span class="edit">Change</span></button>
      ${d.storage ? html`<button class="opt crumb" type="button" data-act="change"><span class="main">${d.storage}</span><span class="edit">Change</span></button>` : ''}
    </div>
    <p class="congrats">Congratulations! 🥳</p>
    <p class="lead big-lead">You can get up to <strong class="num">${naira(upTo)}</strong> when you Trade In your <strong>${name}</strong>. You can either Trade In for <strong>Cash 💵</strong> or <strong>Swap 🔄</strong> to another device.</p>
    <p class="small">This value applies if your ${d.model} is in perfect condition ✨. Answer a few quick questions for your exact figure.</p>`;
  el.innerHTML = layout(raw(el.innerHTML), pills(backPill(), html`<button class="pill go" type="button" data-act="ok">Confirm</button>`)).toString();
  wire(el, app, {
    change: () => app.go('pick'),
    ok: () => app.go('q', { i: 0 }),
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
        return html`<h2 class="h-title">${apple ? 'Is it signed out of iCloud?' : 'Is it signed out of your accounts?'}</h2>
          <p class="par">${apple ? 'Find My must be turned off so the next owner can set it up.' : 'Remove your Google and Samsung accounts so the next owner can set it up.'}</p>
          <div class="stack q-opts" role="radiogroup">
            ${opt(a.icloudLocked === false, 'data-act="icloud" data-v="no"', 'Yes, it’s signed out')}
            ${opt(a.icloudLocked === true, 'data-act="icloud" data-v="yes"', 'No, it’s still locked')}</div>
          ${a.icloudLocked === true ? html`<div class="stop left"><b>We can’t accept locked devices.</b>Sign out of ${apple ? 'iCloud and turn off Find My' : 'your accounts'}, then continue.</div>` : ''}`;
      case 'battery':
      {
        const pct = Math.max(0, Math.min(100, Number(a.battery) || 0));
        const cut = amountFor(d, 'battery');
        const th = app.catalog.settings.batteryThreshold || 85;
        return html`<h2 class="h-title">What’s the battery health?</h2>
          <p class="par">${apple ? raw('Go to <b>Settings › Battery › Battery Health &amp; Charging</b> and read <b>Maximum Capacity</b>.') : 'Enter it if your phone shows battery health. If it doesn’t, choose Not sure.'}</p>
          <div class="battery-big">
            <span class="cell" aria-hidden="true"><i data-cell style="width:${pct}%" class="${pct && pct < th ? 'low' : ''}"></i></span>
            <label><span class="visually-hidden">Battery health percent</span>
              <input type="number" inputmode="numeric" min="1" max="100" placeholder="—" data-battery value="${a.batteryUnknown ? '' : a.battery}"><span class="pct">%</span></label>
          </div>
          <div class="stack q-opts">
            <button class="opt" type="button" aria-pressed="${a.batteryUnknown ? 'true' : 'false'}" data-act="unsure">
              <span class="main">Not sure<span class="sub">We’ll check it in store.</span></span><span class="tick" aria-hidden="true"></span></button>
          </div>
          <div class="info">
            <p><b>${th}% and above:</b> no deduction.</p>
            <p><b>Below ${th}%:</b> ${typeof cut === 'number' ? html`${naira(cut)} comes off your value, the cost of a new battery.` : 'the cost of a new battery comes off your value, confirmed in store.'}</p>
          </div>`;
      }
      case 'neatness':
        return html`<h2 class="h-title">How does it look?</h2>
          <p class="par">Check the screen, back and frame in good light.</p>
          <div class="stack q-opts" role="radiogroup">${NEATNESS.map((n, k) => opt(a.neatness === n.key, `data-act="neat" data-v="${n.key}"`, n.label, n.hint, neatnessIllo(k)))}</div>`;
      case 'network':
        return html`<h2 class="h-title">Is it network locked?</h2>
          <p class="par">How does it work with SIM cards?</p>
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
      <p class="eyebrow">Question ${i + 1} of ${qs.length} · ${d.model}</p>
      <div class="progress" aria-hidden="true"><i style="transform:scaleX(${done / qs.length})"></i></div>
      ${body()}`;
    el.innerHTML = layout(raw(el.innerHTML), html`
      ${r.accepted ? html`<p class="so-far">Trade-in value so far <b data-live>${naira(r.value)}</b></p>` : ''}
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
    unsure: () => set((x) => { x.batteryUnknown = !x.batteryUnknown; if (x.batteryUnknown) x.battery = ''; }, true),
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
  if (q.key === 'battery') queueMicrotask(() => { if (!a.battery && !a.batteryUnknown) $('[data-battery]', el)?.focus({ preventScroll: true }); });
}

// ---------- trade-in value ----------

function value(el, app) {
  const d = ownDevice(app);
  if (!d) { app.go('pick', {}, { replace: true }); return false; }
  if (!allAnswered(app)) { app.go('q', { i: 0 }, { replace: true }); return false; }
  const r = currentValue(app);
  const s = app.s;
  el.innerHTML = html`
    <h2 class="h-title">Your Trade-In Value</h2>
    <p class="par"><strong>${d.model}</strong> · ${variantName(d)}</p>
    <p class="big-num" data-value="${r.start}">${naira(r.start)}</p>
    <p class="small">Estimated. Confirmed when we check your device in store, and slightly negotiable.</p>
    <div class="card">
      <ul class="lines">
        <li><span>Starting value, perfect condition</span><span>${naira(r.start)}</span></li>
        ${r.lines.map((l) => html`<li class="${l.amount === null ? 'pending' : ''}"><span>${l.label}</span><span>${l.amount === null ? 'Checked in store' : `− ${naira(l.amount)}`}</span></li>`)}
        ${r.lines.length ? html`<li class="total"><span>Your trade-in value</span><span>${naira(r.value)}</span></li>` : ''}
      </ul>
    </div>
    <p><button class="link" type="button" data-act="edit">Edit answers</button></p>`;
  el.innerHTML = layout(raw(el.innerHTML), html`
    <button class="btn blue" type="button" data-act="swap">${s.mode === 'swap' ? 'Compare Swap Devices' : 'Calculate My Swap Rate'}</button>
    ${pills(backPill(), html`<button class="pill" type="button" data-act="cash">Trade In for Cash</button>`)}`).toString();
  requestAnimationFrame(() => animateNumber($('.big-num', el), r.value, naira));
  wire(el, app, {
    edit: () => app.go('q', { i: 0 }),
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
      <button class="x" type="button" aria-label="Remove ${x.model} ${variantName(x)}" data-act="rm" data-id="${x.id}">${raw(ICON.x)}</button>
    </article>`;
  };

  el.classList.add('wide');
  el.innerHTML = html`
    <h2 class="h-title">Your Swap Rates</h2>
    <p class="par">Compare what it costs to swap into up to ${max} devices.</p>
    ${d ? html`<div class="mine">
        <div class="mine-top">
          <span class="main"><span class="eyebrow-s">Your device</span><b>${d.model}</b><span class="sub">${variantName(d)}</span></span>
          <span class="val">${tv === null ? 'Not valued yet' : naira(tv)}</span>
        </div>
        ${r && r.accepted ? html`<p class="mine-cond">${answersText(engineAnswers(s.answers, d))}</p>
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
  el.innerHTML = layout(raw(el.innerHTML), pills(backPill(), html`<button class="pill go" type="button" data-act="next" ${tv !== null && live.length ? '' : 'disabled'}>Continue</button>`)).toString();
  wire(el, app, {
    val: () => app.go('value'),
    edit: () => app.go('q', { i: 0 }),
    own: () => startFlow(app, 'swap'),
    add: () => { s.add = { ...freshPick(), type: d?.type || '' }; app.go('pick', { purpose: 'add' }); },
    next: () => { s.cash = false; app.save(); app.go('finish'); },
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

function quoteNow(app) {
  const s = app.s;
  const d = ownDevice(app);
  const r = currentValue(app);
  const list = s.cash ? [] : s.compare.map((id) => app.catalog.byId.get(id)).filter(Boolean)
    .sort(compareOrder(app.catalog.modelOrder))
    .map((x) => ({ device: x, terms: r?.accepted ? swapTerms(x, r.value) : { kind: 'unavailable', amount: 0 } }));
  return buildQuote({ device: d, answers: d ? engineAnswers(s.answers, d) : null, result: r, compare: list, city: CITIES.find((c) => c.key === s.city)?.name });
}
async function ensureSaved(app, extra = {}) {
  const s = app.s;
  const q = quoteNow(app);
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
    <h2 class="h-title">${s.cash ? 'Complete your Trade-In' : 'Complete your Swap'}</h2>
    <p class="par">Where are you located? 📍</p>
    <div class="cities" role="radiogroup">
      ${CITIES.map((c) => html`<button class="opt" type="button" role="radio" aria-checked="${c.key === s.city ? 'true' : 'false'}" data-act="city" data-v="${c.key}">${c.name}</button>`)}
    </div>
    ${city ? html`<p class="city-text">${city.text}</p>` : ''}
    <p class="small">Our team sees every device in your quote from the link. Quotes are valid for ${CONFIG.quoteValidDays} days.</p>`;
  el.innerHTML = layout(raw(el.innerHTML), html`
    <button class="btn green fill" type="button" data-act="wa" ${city ? '' : 'disabled'}>${raw(ICON.whatsapp)} ${city ? 'Complete on WhatsApp' : 'Pick your city to continue'}</button>
    ${pills(backPill(), html`<button class="pill" type="button" data-act="save">Save & Share</button>`)}`).toString();
  wire(el, app, {
    city: (b) => { s.city = b.dataset.v; app.save(); app.refresh(); $('[data-act="wa"]', el.isConnected ? el : document)?.focus?.({ preventScroll: true }); },
    wa: async (b) => {
      b.disabled = true;
      b.textContent = 'Preparing your quote…';
      const { q, link } = await ensureSaved(app);
      location.href = whatsappURL(whatsappMessage(q, link, city?.name));
      setTimeout(() => app.refresh(), 1200);
    },
    save: () => app.go('saved'),
  });
}

function saved(el, app) {
  const s = app.s;
  if (!ownDevice(app)) { app.go('home', {}, { replace: true }); return false; }
  el.innerHTML = html`
    <h2 class="h-title">Save & Share Quote</h2>
    <p class="par">Get a link to this quote to come back to or send to someone. Your name and number are optional and help us follow up.</p>
    <form class="left" novalidate>
      <div class="form-field"><label for="qn">Name (optional)</label><input id="qn" name="name" autocomplete="name" maxlength="60"></div>
      <div class="form-field"><label for="qp">Phone (optional)</label><input id="qp" name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="20"></div>
      <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
      <button class="btn blue" type="submit">Save Quote</button>
    </form>
    <div data-result></div>`;
  el.innerHTML = layout(raw(el.innerHTML), pills(backPill())).toString();
  const form = $('form', el);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('button[type="submit"]', form);
    btn.disabled = true;
    btn.textContent = 'Saving…';
    const fd = new FormData(form);
    const { q, link } = await ensureSaved(app, { name: fd.get('name').trim(), phone: fd.get('phone').trim(), website: fd.get('website') });
    form.hidden = true;
    $('[data-result]', el).innerHTML = html`
      <p class="lead"><strong>Your quote is saved ✅</strong></p>
      <div class="linkbox">${link}</div>
      <div class="stack">
        <button class="btn blue" type="button" data-act="share">${raw(ICON.share)} Share</button>
        <button class="btn" type="button" data-act="copy">${raw(ICON.copy)} Copy Link</button>
      </div>`.toString();
    el.addEventListener('click', async (ev) => {
      const k = ev.target.closest('[data-act]')?.dataset.act;
      if (k === 'share') { const r = await share({ title: 'My SwapDesk quote', text: summaryText(q, ''), url: link }); if (r === 'copied') app.toast('Quote and link copied'); }
      if (k === 'copy') { await copy(link); app.toast('Link copied'); }
    });
  });
  wire(el, app, {});
}

export const SCREENS = {
  home,
  pick: picker,
  loading,
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
