// Price List and Trade-In Values: standalone lists for resellers and customers, inside the pop-up.
import { CONFIG } from '../config.js';
import { conditionRank, matches, variantOrder } from '../engine.js';
import { html, raw, naira, updatedLabel, variantName, $ } from '../format.js';
import { ICON } from './icons.js';
import { copy, share } from '../quote.js';

const META = {
  prices: { title: 'Price List', figure: 'price' },
  'trade-in': { title: 'Trade-In Values', figure: 'tradeInValue' },
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
const applyFilters = (rows, f) => rows.filter((d) => (!f.type || d.type === f.type) && (!f.brand || d.brand === f.brand) &&
  (!f.cond || d.condition === f.cond) && matches(d, f.search));

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
  const out = [`*SwapDesk ${meta.title}*`];
  if (filterLabel(f)) out.push(filterLabel(f));
  out.push(updatedLabel(catalog.updatedAt));
  if (view === 'trade-in') out.push('For devices in good working condition, battery 85% or higher.');
  if (deals.length) {
    out.push('', '*Deals* (one unit each)');
    deals.forEach((d) => out.push(`${d.model} ${[d.storage, d.dealNote].filter(Boolean).join(' · ')}: ${naira(d.price)}`));
  }
  for (const g of groupBySeries(rows, catalog)) {
    out.push('', `*${g.series}*`);
    g.rows.forEach((d) => out.push(`${d.model} ${variantName(d)}: ${naira(d[meta.figure])}`));
  }
  out.push('', `swapdesk.ng · WhatsApp ${CONFIG.whatsappDisplay}`, 'An Upgrade Brands product');
  return out.join('\n');
}

export function listScreen(el, app, view, params) {
  const { catalog } = app;
  const meta = META[view];
  const all = listRows(catalog, view);
  const deals = view === 'prices' ? dealRows(catalog) : [];
  const f = { type: params.type || '', brand: params.brand || '', cond: params.cond || '', search: params.search || '' };
  let open = '';

  el.classList.add('wide');
  el.innerHTML = html`
    <h1 class="h-title">${meta.title}</h1>
    <p class="small list-meta">${view === 'trade-in' ? 'Good condition, battery 85% or higher · ' : 'Premium USED 🇺🇸 and Brand New · '}${updatedLabel(catalog.updatedAt).replace('Updated ', 'updated ')}</p>
    <div class="list-actions">
      ${view === 'trade-in' ? html`<button class="link" type="button" data-act="value">Get an exact figure</button>` : ''}
      <button class="link" type="button" data-act="share">${raw(ICON.share)} Share</button>
      <button class="link" type="button" data-act="copy">${raw(ICON.copy)} Copy as Text</button>
    </div>
    <div class="list-top">
      <label class="field"><span class="visually-hidden">Search ${meta.title}</span>${raw(ICON.search)}
        <input type="search" data-search placeholder="Search, e.g. 16 pro max 256" value="${f.search}" autocomplete="off" enterkeyhint="search">
        <button class="clear" type="button" data-act="clear" aria-label="Clear search">${raw(ICON.clear)}</button></label>
      <div class="chips" data-chips="type" role="group" aria-label="Filter"></div>
      <p class="chip-hint">Tap a selected option again to clear it.</p>
    </div>
    <div data-list></div>`;
  el.innerHTML = `<div class="screen-main">${el.innerHTML}</div><div class="screen-foot"><div class="pills"><button class="pill" type="button" data-act="home">Go Back</button><button class="pill go" type="button" data-act="${view === 'prices' ? 'goCmp' : 'value'}">${view === 'prices' ? 'My Swap Rate' : 'Value My Device'}</button></div><p class="credit"><b>swapdesk.ng</b> · An Upgrade Brands product</p></div>`;

  const listEl = $('[data-list]', el);
  const chip = (label, k, v, on) => html`<button class="chip" type="button" aria-pressed="${on ? 'true' : 'false'}" data-k="${k}" data-v="${v}">${label}</button>`;

  // Drill down one level at a time: type, then brand, then condition.
  // A chosen chip stays (tap it to clear); the other choices at that level step aside.
  function drawChips() {
    const X = '<span class="chip-x" aria-hidden="true">×</span>';
    const picked = (label, k) => html`<button class="chip" type="button" aria-pressed="true" data-k="${k}" data-v="" aria-label="${label}, selected. Tap to clear.">${label}${raw(X)}</button>`;
    const options = (vals, k, label = (v) => v) => vals.map((v) => html`<button class="chip" type="button" aria-pressed="false" data-k="${k}" data-v="${v}">${label(v)}</button>`);
    const parts = [];
    const types = uniq(all.map((d) => d.type));
    if (!f.type) parts.push(...options(types, 'type', (t) => TYPE_LABEL[t] || t));
    else {
      parts.push(picked(TYPE_LABEL[f.type] || f.type, 'type'));
      const inType = all.filter((d) => d.type === f.type);
      const brands = uniq(inType.map((d) => d.brand));
      if (brands.length > 1 && !f.brand) parts.push(...options(brands, 'brand'));
      else {
        if (f.brand) parts.push(picked(f.brand, 'brand'));
        const conds = uniq(inType.filter((d) => !f.brand || d.brand === f.brand).map((d) => d.condition)).sort((a, b) => conditionRank(a) - conditionRank(b));
        if (f.cond) parts.push(picked(f.cond, 'cond'));
        else if (conds.length > 1) parts.push(...options(conds, 'cond'));
      }
    }
    const row = $('[data-chips="type"]', el);
    row.innerHTML = parts.join('');
    row.scrollLeft = 0;
  }

  const current = () => ({ rows: applyFilters(all, f), deals: f.cond ? [] : applyFilters(deals, { ...f, cond: '' }) });

  function drawList() {
    const { rows, deals: ds } = current();
    const fig = (d) => naira(d[meta.figure]);
    // Each row is one exact version, so the expanded panel is only about that version.
    const more = (d) => {
      const inCmp = app.s.compare.includes(d.id);
      const others = d.condition === 'Deal' ? 0 : all.filter((x) => x.model === d.model && x.id !== d.id).length;
      return html`<div class="row-more">
        <p class="more-note">${view === 'trade-in'
          ? `Up to ${fig(d)} for this ${d.model} in good condition. Answer a few questions for your exact figure.`
          : `${d.model} · ${d.condition === 'Deal' ? [d.storage, d.dealNote].filter(Boolean).join(' · ') : variantName(d)} for ${fig(d)}.${others ? ` ${others} other version${others > 1 ? 's' : ''} listed alongside it.` : ''}`}</p>
        ${view === 'trade-in'
          ? html`<button class="btn blue" type="button" data-act="valueThis" data-id="${d.id}">Value This Device</button>`
          : html`<button class="btn ${inCmp ? '' : 'blue'}" type="button" data-act="addCmp" data-id="${d.id}" ${inCmp ? 'disabled' : ''}>${inCmp ? '✓ In Your Swap Comparison' : 'Add to Swap Comparison'}</button>
             ${app.s.compare.length ? html`<button class="btn" type="button" data-act="goCmp" style="margin-top:8px">See Comparison (${app.s.compare.length})</button>` : ''}`}
      </div>`;
    };
    const row = (d, deal) => html`
      <button class="row" type="button" aria-expanded="${open === d.id ? 'true' : 'false'}" data-row="${d.id}">
        <span class="main"><span class="t">${d.model}${deal ? raw('<span class="tag">One unit</span>') : ''}</span>
          <span class="s">${deal ? [d.storage, d.dealNote].filter(Boolean).join(' · ') : variantName(d)}</span></span>
        <span class="v">${fig(d)}</span>${raw(ICON.chevron)}</button>
      ${open === d.id ? more(d) : ''}`;
    const out = [];
    if (ds.length) out.push(html`<section class="series"><h2 class="series-h">🔥 Deals</h2><div class="group">${ds.map((d) => row(d, true))}</div></section>`);
    for (const g of groupBySeries(rows, catalog)) {
      out.push(html`<section class="series"><h2 class="series-h">${g.series}</h2><div class="group">${g.rows.map((d) => row(d, false))}</div></section>`);
    }
    const n = rows.length + ds.length;
    out.push(n ? html`<p class="count">${n} ${n === 1 ? 'device' : 'devices'}</p>`
      : html`<div class="empty"><p>No devices match. Try a shorter search or clear the filters.</p><button class="pill" type="button" data-act="reset">Clear Filters</button></div>`);
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
    const c = e.target.closest('.chip');
    if (c) {
      const k = c.dataset.k;
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
        const res = await share({ title: `SwapDesk ${meta.title}`, text: `SwapDesk ${meta.title}${filterLabel(f) ? ` · ${filterLabel(f)}` : ''}`, url });
        if (res === 'copied') app.toast('Link copied');
        break;
      }
      default:
    }
  });
}
