// Price List and Trade-In Values: standalone lists for resellers and customers, inside the pop-up.
import { CONFIG } from '../config.js';
import { conditionRank, matches, variantOrder, storageRank } from '../engine.js';
import { html, raw, naira, updatedLabel, variantName, $ } from '../format.js';
import { ICON } from './icons.js';
import { copy, share } from '../quote.js';

const META = {
  prices: { title: '🛒 @shopupgrade.ng', plain: '@shopupgrade.ng', sub: raw('Enjoy best in class Warranty 💪🏾 &amp; Free Delivery 🚚 when you shop <strong>Premium USED 🇺🇸 &amp; Brand New Devices.</strong>'), figure: 'price' },
  'trade-in': { title: 'Trade-In Values 📲', plain: 'Trade-In Values', sub: raw('<strong>Ready to Swap to something new?</strong> Here’s what we pay for devices in good working condition.'), figure: 'tradeInValue' },
};
const TYPE_LABEL = {};

export function listRows(catalog, view) {
  if (view === 'prices') return catalog.devices.filter((d) => d.swapInto && d.price > 0 && d.condition !== 'Deal');
  return catalog.devices.filter((d) => d.tradeIn && d.tradeInValue > 0 && d.condition !== 'Deal' && CONFIG.swapTypes.includes(d.type));
}
export function dealRows(catalog) {
  return catalog.devices.filter((d) => d.condition === 'Deal' && d.swapInto && d.price > 0);
}

const uniq = (a) => [...new Set(a)];
// LLA and Non LLA foreign-used phones are all sold as Foreign USED.
const fam = (c) => (c === 'Foreign USED (Non LLA)' ? 'Foreign USED' : c);
const plural = (n) => `${n} ${n === 1 ? 'device' : 'devices'}`;
const shortDate = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`; };
const applyFilters = (rows, f) => rows.filter((d) => (!f.type || d.type === f.type) && (!f.brand || d.brand === f.brand) &&
  (!f.cond || d.condition === f.cond || fam(d.condition) === f.cond) && matches(d, f.search));

function groupBySeries(rows, catalog) {
  const sorted = [...rows].sort((a, b) =>
    (catalog.seriesOrder.get(a.series) ?? 1e9) - (catalog.seriesOrder.get(b.series) ?? 1e9) ||
    (catalog.modelOrder.get(a.model) ?? 1e9) - (catalog.modelOrder.get(b.model) ?? 1e9) || variantOrder(a, b));
  const groups = [];
  for (const d of sorted) {
    const g = groups[groups.length - 1];
    if (g && g.series === d.series) g.rows.push(d); else groups.push({ series: d.series, rows: [d] });
  }
  return groups;
}

function filterLabel(f) {
  return [TYPE_LABEL[f.type] || f.type, f.brand, f.cond, f.search && `“${f.search}”`].filter(Boolean).join(' · ');
}

/** WhatsApp-broadcast text: deals first, series headings, one line per device. */
export function listText(catalog, view, { rows, deals }, f) {
  const meta = META[view];
  const out = [`*${meta.plain}*`];
  if (filterLabel(f)) out.push(filterLabel(f));
  out.push(updatedLabel(catalog.updatedAt));
  if (view === 'trade-in') out.push('For devices in good working condition, battery 85% or higher.');
  if (deals.length) {
    out.push('', '*Deals* (one unit each)');
    deals.forEach((d) => out.push(`${d.model} ${[d.storage, d.dealNote].filter(Boolean).join(' · ')}: ${naira(d.price)}`));
  }
  for (const g of groupBySeries(rows, catalog)) {
    out.push('', `*${g.series}*`);
    g.rows.forEach((d) => out.push(`${d.model} ${view === 'trade-in' ? d.storage : variantName(d)}: ${naira(d[meta.figure])}`));
  }
  out.push('', `swapdesk.ng · WhatsApp ${CONFIG.whatsappDisplay}`, 'An Upgrade Brands product');
  return out.join('\n');
}

export function listScreen(el, app, view, params) {
  const { catalog } = app;
  const meta = META[view];
  const all = listRows(catalog, view);
  const deals = view === 'prices' ? dealRows(catalog) : [];
  const f = { type: params.type || '', brand: params.brand || '', cond: view === 'trade-in' ? '' : (params.cond || ''), search: params.search || '' };
  let open = '';

  el.classList.add('wide', 'picking');
  el.innerHTML = html`
    <div class="list-head">
      <h1 class="h-title">${meta.title}</h1>
      <p class="list-sub">${meta.sub}</p>
      <p class="list-date">Updated ${shortDate(catalog.updatedAt)}</p>
    </div>
    <div class="list-top">
      <label class="field"><span class="visually-hidden">Search ${meta.plain}</span>${raw(ICON.search)}
        <input type="search" data-search placeholder="Search, e.g. 16 pro max 256" value="${f.search}" autocomplete="off" enterkeyhint="search">
        <button class="clear" type="button" data-act="clear" aria-label="Clear search">${raw(ICON.clear)}</button></label>
      <nav class="trail" data-chips="type" aria-label="Your choices"></nav>
    </div>
    <div data-list></div>`;
  el.innerHTML = `<div class="screen-main">${el.innerHTML}</div><div class="screen-foot"><div class="pills"><button class="pill" type="button" data-act="home">Go Back</button><button class="pill go" type="button" data-act="${view === 'prices' ? 'goCmp' : 'value'}">${view === 'prices' ? 'My Swap Rate' : 'Value My Device'}</button></div><p class="credit"><b>swapdesk.ng</b> · An Upgrade Brands product</p></div>`;

  const listEl = $('[data-list]', el);
  const chip = (label, k, v, on) => html`<button class="chip" type="button" aria-pressed="${on ? 'true' : 'false'}" data-k="${k}" data-v="${v}">${label}</button>`;

  // Drill down one level at a time: type, then brand, then condition.
  // A chosen chip stays (tap it to clear); the other choices at that level step aside.
  const X = '<span class="chip-x" aria-hidden="true">×</span>';
  const brandsIn = (t) => uniq(all.filter((d) => d.type === t).map((d) => d.brand));
  // The list only appears once a device type and brand are chosen (or something is searched).
  const ready = () => f.cond === 'Deal' || !!f.search.trim() || (f.type && (f.brand || brandsIn(f.type).length <= 1));

  function drawChips() {
    const parts = [];
    const picked = (label, k) => html`<button class="chip" type="button" aria-pressed="true" data-k="${k}" data-v="" aria-label="${label}, selected. Tap to change.">${label}${raw(X)}</button>`;
    if (f.type) parts.push(picked(TYPE_LABEL[f.type] || f.type, 'type'));
    if (f.brand) parts.push(picked(f.brand, 'brand'));
    if (f.cond) parts.push(picked(f.cond === 'Deal' ? 'Deals' : f.cond, 'cond'));
    const row = $('[data-chips="type"]', el);
    row.innerHTML = parts.map((p, n) => (n ? '<span class="trail-sep" aria-hidden="true">›</span>' : '') + p).join('');
    row.hidden = !parts.length;
    row.scrollLeft = row.scrollWidth;
  }

  // Trade-ins are all used devices: one row per model + storage, no condition shown or filtered.
  const USED_FIRST = ['Nigerian USED', 'Foreign USED', 'Foreign USED (Non LLA)', 'Active Brand New (Non LLA)', 'Active Brand New', 'Brand New'];
  const onePerVersion = (list) => {
    const best = new Map();
    for (const d of list) {
      const k = `${d.model}|${d.storage}`; const cur = best.get(k);
      const rank = (x) => { const i = USED_FIRST.indexOf(x.condition); return i < 0 ? 99 : i; };
      if (!cur || rank(d) < rank(cur)) best.set(k, d);
    }
    return list.filter((d) => best.get(`${d.model}|${d.storage}`) === d);
  };
  const current = () => (view === 'trade-in'
    ? { rows: onePerVersion(applyFilters(all, { ...f, cond: '' })), deals: [] }
    : f.cond === 'Deal'
      ? { rows: [], deals }
      : { rows: applyFilters(all, f), deals: f.cond ? [] : applyFilters(deals, { ...f, cond: '' }) });

  function drawList() {
    if (!ready()) {
      const opt = (k, v, label, sub) => html`<button class="opt" type="button" data-k="${k}" data-v="${v}"><span class="main">${label}${sub ? html`<span class="sub">${sub}</span>` : ''}</span>${raw(ICON.chevron)}</button>`;
      let body;
      if (!f.type) {
        const types = uniq(all.map((d) => d.type));
        body = html`<p class="step-q">Choose a device type</p><div class="stack">
          ${deals.length ? opt('deals', '1', '🔥 Deals', `${deals.length} one-off ${deals.length === 1 ? 'unit' : 'units'}`) : ''}
          ${types.map((t) => opt('type', t, TYPE_LABEL[t] || t, plural(all.filter((d) => d.type === t).length)))}</div>`;
      } else {
        body = html`<p class="step-q">Choose a brand</p><div class="stack">${brandsIn(f.type).map((b) => opt('brand', b, b, plural(all.filter((d) => d.type === f.type && d.brand === b).length)))}</div>`;
      }
      listEl.innerHTML = body.toString();
      return;
    }
    const { rows, deals: ds } = current();
    const fig = (d) => naira(d[meta.figure]);
    const trade = view === 'trade-in';
    const COND = { 'Foreign USED': '🇺🇸 Foreign USED', 'Foreign USED (Non LLA)': '🇺🇸 Foreign USED (Non LLA)', 'Nigerian USED': '🇳🇬 Nigerian USED' };
    const condName = (c) => COND[c] || c;
    const byStorage = (a, b) => storageRank(a.storage) - storageRank(b.storage) || variantOrder(a, b);
    const minOf = (list) => Math.min(...list.map((d) => d[meta.figure]));
    const maxOf = (list) => Math.max(...list.map((d) => d[meta.figure]));
    // Storage sizes inside an opened row: tap one to add it (shop) or value it (trade-in).
    const sizes = (list) => {
      const cmp = app.s.compare;
      return html`<div class="row-more">
        <p class="more-note">${trade ? 'Tap your storage size to check the value of your device.' : 'Tap a storage size to add it to your Swap Comparison.'}</p>
        <div class="sizes">${list.sort(byStorage).map((d) => {
          const inCmp = !trade && cmp.includes(d.id);
          return html`<button class="size${inCmp ? ' in' : ''}" type="button" data-act="${trade ? 'valueThis' : 'addCmp'}" data-id="${d.id}" ${inCmp ? 'aria-pressed="true"' : ''}>
            <span class="st">${d.storage}${!trade && d.condition.includes('Non LLA') && d.condition.startsWith('Foreign') ? html` <small>Non LLA</small>` : ''}</span><span class="sp">${fig(d)}</span><span class="sa">${trade ? 'Value' : inCmp ? '✓ Added' : 'Add'}</span></button>`;
        })}</div>
        ${!trade && cmp.length ? html`<button class="btn" type="button" data-act="goCmp">See Comparison (${cmp.length})</button>` : ''}
      </div>`;
    };
    const cond = (model, c, list) => {
      const key = `${model}|${c}`;
      const lo = minOf(list), hi = maxOf(list);
      return html`<button class="row" type="button" aria-expanded="${open === key ? 'true' : 'false'}" data-row="${key}">
          <span class="main"><span class="t">${condName(c)}</span><span class="s">${uniq(list.sort(byStorage).map((d) => d.storage)).join(' · ')}</span></span>
          <span class="v">${list.length > 1 && lo !== hi ? html`<small>from</small> ${naira(lo)}` : naira(lo)}</span>${raw(ICON.chevron)}</button>
        ${open === key ? sizes(list) : ''}`;
    };
    const modelCard = (model, list) => {
      if (trade) {
        const key = model;
        const hi = maxOf(list);
        return html`<div class="group"><button class="row model-row" type="button" aria-expanded="${open === key ? 'true' : 'false'}" data-row="${key}">
            <span class="main"><span class="t">${model}</span><span class="s">${list.sort(byStorage).map((d) => d.storage).join(' · ')}</span></span>
            <span class="v"><small>up to</small> ${naira(hi)}</span>${raw(ICON.chevron)}</button>
          ${open === key ? sizes(list) : ''}</div>`;
      }
      const conds = uniq(list.map((d) => fam(d.condition))).sort((a, b) => conditionRank(a) - conditionRank(b));
      return html`<div class="group"><p class="model-h">${model}</p>${conds.map((c) => cond(model, c, list.filter((d) => fam(d.condition) === c)))}</div>`;
    };
    const dealRow = (d) => html`<div class="row deal-row"><span class="main"><span class="t">${d.model}${raw('<span class="tag">One unit</span>')}</span>
        <span class="s">${[d.storage, d.dealNote].filter(Boolean).join(' · ')}</span></span><span class="v">${fig(d)}</span>
        <button class="size-add" type="button" data-act="addCmp" data-id="${d.id}">${app.s.compare.includes(d.id) ? '✓ Added' : 'Add'}</button></div>`;
    const out = [];
    const condsAll = uniq(applyFilters(all, { ...f, cond: '' }).map((d) => fam(d.condition))).sort((a, b) => conditionRank(a) - conditionRank(b));
    const condName2 = (c) => ({ 'Foreign USED': '🇺🇸 Foreign USED', 'Nigerian USED': '🇳🇬 Nigerian USED' }[c] || c);
    out.push(html`<div class="table-bar">${!trade && !f.cond && f.type && condsAll.length > 1 ? html`<div class="chips">${condsAll.map((c) => html`<button class="chip" type="button" aria-pressed="${f.cond === c ? 'true' : 'false'}" data-k="cond" data-v="${c}">${condName2(c)}</button>`)}</div>` : ''}<div class="list-actions">
        <button class="link" type="button" data-act="share">${raw(ICON.share)} Share this list</button>
        <button class="link" type="button" data-act="copy">${raw(ICON.copy)} Copy as text</button>
      </div></div>`);
    if (ds.length) out.push(html`<section class="series"><h2 class="series-h">🔥 Deals</h2><div class="group">${ds.map(dealRow)}</div></section>`);
    for (const g of groupBySeries(rows, catalog)) {
      const models = uniq(g.rows.map((d) => d.model));
      out.push(html`<section class="series"><h2 class="series-h">${g.series}</h2>${models.map((m) => modelCard(m, g.rows.filter((d) => d.model === m)))}</section>`);
    }
    const n = rows.length + ds.length;
    if (!n) out.push(html`<div class="empty"><p>No devices match. Try a shorter search or clear the filters.</p><button class="pill" type="button" data-act="reset">Clear Filters</button></div>`);
    listEl.innerHTML = out.join('');
  }

  function sync() {
    history.replaceState({ ...(history.state || {}), screen: view, params: { ...f } }, '', app.urlFor(view, f));
    app.params = { ...f };
  }
  const setTop = () => {
    const top = $('.list-top', el);
    if (top) el.style.setProperty('--list-top', `${top.offsetHeight - 6}px`);
  };

  drawChips();
  drawList();
  requestAnimationFrame(setTop);

  let t;
  el.addEventListener('input', (e) => {
    if (!e.target.matches('[data-search]')) return;
    f.search = e.target.value;
    open = '';
    drawList();
    clearTimeout(t);
    t = setTimeout(sync, 300);
  });
  el.addEventListener('click', async (e) => {
    const c = e.target.closest('.chip, .opt[data-k]');
    if (c && c.dataset.k) {
      const k = c.dataset.k;
      if (k === 'deals') { f.cond = 'Deal'; f.search = ''; open = ''; drawChips(); drawList(); sync(); setTop(); return; }
      f[k] = c.getAttribute('aria-pressed') === 'true' ? '' : c.dataset.v;
      if (k === 'brand' && !f.brand) f.cond = '';
      if (k === 'type') { f.brand = ''; f.cond = ''; }
      open = '';
      drawChips(); drawList(); sync(); setTop();
      return;
    }
    const r = e.target.closest('[data-row]');
    if (r) {
      open = open === r.dataset.row ? '' : r.dataset.row;
      drawList();
      $(`[data-row="${CSS.escape(r.dataset.row)}"]`, el)?.focus({ preventScroll: true });
      return;
    }
    const act = e.target.closest('[data-act]');
    if (!act) return;
    const id = act.dataset.id;
    switch (act.dataset.act) {
      case 'home': app.back(); break;
      case 'clear': f.search = ''; $('[data-search]', el).value = ''; drawList(); sync(); break;
      case 'reset': Object.assign(f, { type: '', brand: '', cond: '', search: '' }); $('[data-search]', el).value = ''; drawChips(); drawList(); sync(); break;
      case 'value': (await import('./flow.js')).SCREENS.startFlow(app, 'trade'); break;
      case 'valueThis': app.s.mode = 'trade'; history.replaceState(history.state, '', app.urlFor(view, f)); (await import('./flow.js')).SCREENS.startWith(app, id); break;
      case 'addCmp': {
        const max = Number(catalog.settings['compare.maxDevices']) || 6;
        if (app.s.compare.includes(id)) { app.s.compare = app.s.compare.filter((x) => x !== id); app.s.saved = null; app.save(); app.toast('Removed from your swap comparison.'); drawList(); break; }
        if (app.s.compare.length >= max) { app.toast(`You can compare up to ${max} devices. Remove one first.`); break; }
        app.s.compare.push(id); app.s.saved = null; app.save();
        app.toast(`Added. ${app.s.compare.length} in your swap comparison.`);
        drawList();
        break;
      }
      case 'goCmp':
        app.s.mode = 'swap'; app.save();
        if (app.s.deviceId || app.s.compare.length) app.go('compare'); else (await import('./flow.js')).SCREENS.startFlow(app, 'swap');
        break;
      case 'copy': await copy(listText(catalog, view, current(), f)); app.toast('List copied. Paste it into WhatsApp.'); break;
      case 'share': {
        const url = CONFIG.site + app.urlFor(view, f).replace(/^\.\//, '');
        const res = await share({ title: meta.plain, text: `${meta.plain}${filterLabel(f) ? ` · ${filterLabel(f)}` : ''}`, url });
        if (res === 'copied') app.toast('Link copied');
        break;
      }
      default:
    }
  });
}
