// Price List and Trade-In Values: standalone, shareable, searchable lists.
import { CONFIG } from '../config.js';
import { CONDITION_ORDER, conditionRank, matches, variantOrder } from '../engine.js';
import { html, raw, naira, updatedLabel, variantName, $, $$ } from '../format.js';
import { ICON } from './icons.js';
import { openSheet } from './sheet.js';
import { copy, share } from '../quote.js';

const META = {
  prices: { title: 'Price List', figure: 'price', unit: 'Price' },
  'trade-in': { title: 'Trade-In Values', figure: 'tradeInValue', unit: 'Trade-in value' },
};

export function listRows(catalog, view) {
  if (view === 'prices') {
    return catalog.devices.filter((d) => d.swapInto && d.price > 0 && d.condition !== 'Deal');
  }
  return catalog.devices.filter((d) => d.tradeIn && d.tradeInValue > 0 && d.condition !== 'Deal' && CONFIG.swapTypes.includes(d.type));
}

export function dealRows(catalog) {
  return catalog.devices.filter((d) => d.condition === 'Deal' && d.swapInto && d.price > 0);
}

const uniq = (arr) => [...new Set(arr)];

function applyFilters(rows, f) {
  return rows.filter((d) => (!f.type || d.type === f.type) && (!f.brand || d.brand === f.brand) &&
    (!f.cond || d.condition === f.cond) && matches(d, f.search));
}

function groupBySeries(rows, catalog) {
  const order = (d) => catalog.modelOrder.get(d.model) ?? 1e9;
  const sorted = [...rows].sort((a, b) =>
    (catalog.seriesOrder.get(a.series) ?? 1e9) - (catalog.seriesOrder.get(b.series) ?? 1e9) ||
    order(a) - order(b) || variantOrder(a, b));
  const groups = [];
  for (const d of sorted) {
    const g = groups[groups.length - 1];
    if (g && g.series === d.series) g.rows.push(d);
    else groups.push({ series: d.series, rows: [d] });
  }
  return groups;
}

export function renderList(main, app) {
  const { catalog, route } = app;
  const view = route.view;
  const meta = META[view];
  const all = listRows(catalog, view);
  const deals = view === 'prices' ? dealRows(catalog) : [];
  const f = { type: route.type, brand: route.brand, cond: route.cond, search: route.search };

  // ----- bar: search + filters -----
  const extra = document.createElement('div');
  extra.className = 'filters';
  extra.innerHTML = html`
    <label class="search"><span class="visually-hidden">Search ${meta.title}</span>
      ${raw(ICON.search)}<input type="search" id="list-search" placeholder="Search, e.g. 16 pro max 256" value="${f.search}" autocomplete="off" enterkeyhint="search">
      <button type="button" class="clear" aria-label="Clear search">${raw(ICON.clear)}</button></label>
    <div class="chips" id="chips-type" role="group" aria-label="Type"></div>
    <div class="chips" id="chips-more" role="group" aria-label="Brand and condition"></div>`.toString();
  app.setBarExtra(extra);

  main.innerHTML = html`
    <div class="wrap narrow">
      <div class="print-only"><p class="eyebrow">SwapDesk · An Upgrade Brands product</p></div>
      <header class="page-head">
        <h1 class="large-title">${meta.title}</h1>
        <p class="sub" id="list-updated">${updatedLabel(catalog.updatedAt)}${catalog.origin !== 'live' ? ' · showing the last saved list' : ''}</p>
        ${view === 'trade-in' ? html`<p class="note">For devices in good working condition, battery 85% or higher. <a href="./" data-value-link>Get an exact figure for yours.</a></p>` : ''}
        <div class="page-actions">
          <button class="link-btn" type="button" data-act="share">${raw(ICON.share)} Share list</button>
          <button class="link-btn" type="button" data-act="copy">${raw(ICON.copy)} Copy as text</button>
          <button class="link-btn" type="button" data-act="print">${raw(ICON.print)} Print</button>
        </div>
      </header>
      <div id="list-body"></div>
    </div>`.toString();

  const body = $('#list-body', main);
  const input = $('#list-search', extra);

  const chip = (label, key, value, on) => html`<button type="button" class="chip" aria-pressed="${on ? 'true' : 'false'}" data-k="${key}" data-v="${value}">${label}</button>`;

  function drawChips() {
    const types = uniq(all.map((d) => d.type));
    $('#chips-type', extra).innerHTML = [chip('All', 'type', '', !f.type), ...types.map((t) => chip(t === 'Tablets' ? 'iPads & Tablets' : t, 'type', t, f.type === t))].join('');
    const inType = all.filter((d) => !f.type || d.type === f.type);
    const brands = uniq(inType.map((d) => d.brand));
    const conds = uniq(inType.map((d) => d.condition)).sort((a, b) => conditionRank(a) - conditionRank(b));
    const parts = [];
    if (brands.length > 1) parts.push(...brands.map((b) => chip(b, 'brand', b, f.brand === b)));
    if (brands.length > 1 && conds.length > 1) parts.push('<span class="chip-divider" aria-hidden="true"></span>');
    if (conds.length > 1) parts.push(...conds.map((c) => chip(c, 'cond', c, f.cond === c)));
    $('#chips-more', extra).innerHTML = parts.join('');
    $('#chips-more', extra).hidden = !parts.length;
  }

  function current() {
    return { rows: applyFilters(all, f), deals: applyFilters(deals, { ...f, cond: '' }).filter(() => !f.cond || f.cond === 'Deal') };
  }

  function drawBody() {
    const { rows, deals: ds } = current();
    const groups = groupBySeries(rows, catalog);
    const figure = (d) => naira(d[meta.figure]);
    const rowHTML = (d, deal) => html`
      <button type="button" class="row" data-id="${d.id}">
        <span class="row-main"><span class="row-title">${d.model}${deal ? raw(' <span class="tag">One unit</span>') : ''}</span>
          <span class="row-sub">${deal ? [d.storage, d.dealNote].filter(Boolean).join(' · ') : variantName(d)}</span></span>
        <span class="row-value">${figure(d)}</span>${raw(ICON.chevron)}
      </button>`;
    const out = [];
    if (ds.length) {
      out.push(html`<section class="series" aria-label="Deals"><h2 class="series-h">Deals</h2><div class="group">${ds.map((d) => rowHTML(d, true))}</div></section>`);
    }
    for (const g of groups) {
      out.push(html`<section class="series"><h2 class="series-h">${g.series}</h2><div class="group">${g.rows.map((d) => rowHTML(d, false))}</div></section>`);
    }
    if (!out.length) {
      out.push(html`<div class="empty"><p class="title-3">No matches</p><p>Try a shorter search or clear the filters.</p>
        <button class="btn small" type="button" data-act="reset">Clear filters</button></div>`);
    } else {
      out.push(html`<p class="count">${rows.length + ds.length} ${rows.length + ds.length === 1 ? 'device' : 'devices'}</p>`);
    }
    body.innerHTML = out.join('');
  }

  function sync() {
    const r = { view, ...f };
    history.replaceState(null, '', app.url(r));
    app.route = r;
  }

  drawChips();
  drawBody();

  let t;
  input.addEventListener('input', () => {
    f.search = input.value;
    drawBody();
    clearTimeout(t);
    t = setTimeout(sync, 300);
  });
  $('.clear', extra).addEventListener('click', () => { input.value = ''; f.search = ''; drawBody(); sync(); input.focus(); });
  extra.addEventListener('click', (e) => {
    const c = e.target.closest('.chip');
    if (!c) return;
    const k = c.dataset.k;
    const v = c.dataset.v;
    f[k] = f[k] === v ? '' : v;
    if (k === 'type') { f.brand = ''; f.cond = ''; }
    drawChips();
    drawBody();
    sync();
  });

  main.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'reset') { f.type = f.brand = f.cond = f.search = ''; input.value = ''; drawChips(); drawBody(); sync(); return; }
    if (act === 'print') { window.print(); return; }
    if (act === 'copy') {
      copy(listText(catalog, view, current(), f)).then(() => app.toast('List copied. Paste it into WhatsApp.'));
      return;
    }
    if (act === 'share') {
      const url = CONFIG.site + app.url({ view, ...f }).replace(/^\.\//, '');
      share({ title: `SwapDesk ${meta.title}`, text: `SwapDesk ${meta.title}${filterLabel(f) ? ` · ${filterLabel(f)}` : ''}`, url })
        .then((r) => r === 'copied' && app.toast('Link copied'));
      return;
    }
    if (e.target.closest('[data-value-link]')) {
      e.preventDefault();
      app.navigate({ view: 'swap' });
      return;
    }
    const row = e.target.closest('.row[data-id]');
    if (row) openModelSheet(row, catalog.byId.get(row.dataset.id), app, view);
  });
}

function filterLabel(f) {
  return [f.type === 'Tablets' ? 'iPads & Tablets' : f.type, f.brand, f.cond, f.search && `“${f.search}”`].filter(Boolean).join(' · ');
}

/** WhatsApp-broadcast text: deals first, series headings, one line per device. */
export function listText(catalog, view, { rows, deals }, f) {
  const meta = META[view];
  const out = [`*SwapDesk ${meta.title}*`];
  const fl = filterLabel(f);
  if (fl) out.push(fl);
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

function openModelSheet(source, device, app, view) {
  const { catalog } = app;
  const meta = META[view];
  const isDeal = device.condition === 'Deal';
  const versions = isDeal ? [device] : listRows(catalog, view).filter((d) => d.model === device.model).sort(variantOrder);
  let selected = device.id;

  openSheet({
    source,
    title: device.model,
    render(body, sheet) {
      const draw = () => {
        const inCompare = app.swap.compare.includes(selected);
        body.innerHTML = html`
          ${isDeal ? html`<p class="note">${device.dealNote} <span class="tag">One unit</span></p>` : ''}
          <p class="eyebrow" style="margin-top:0.5rem">${versions.length > 1 ? `${versions.length} versions` : meta.unit}</p>
          <div class="group variant-list" role="radiogroup" aria-label="Versions">
            ${versions.map((d) => html`
              <button type="button" class="row" role="radio" aria-checked="${d.id === selected ? 'true' : 'false'}" data-id="${d.id}">
                <span class="check" aria-hidden="true"></span>
                <span class="row-main"><span class="row-title">${variantName(d) || d.model}</span></span>
                <span class="row-value">${naira(d[meta.figure])}</span>
              </button>`)}
          </div>
          <div class="stack" style="margin-top:1.25rem">
            ${view === 'trade-in'
              ? html`<button class="btn primary block" type="button" data-act="value">Value this device</button>
                 <p class="caption">Answer a few questions about its condition for an exact figure.</p>`
              : html`<button class="btn primary block" type="button" data-act="add" ${inCompare ? 'disabled' : ''}>${inCompare ? 'In your comparison' : 'Add to compare'}</button>
                 ${app.swap.compare.length ? html`<button class="btn block" type="button" data-act="go">See comparison (${app.swap.compare.length})</button>` : ''}`}
          </div>`.toString();
      };
      draw();
      body.addEventListener('click', (e) => {
        const r = e.target.closest('[role="radio"]');
        if (r) { selected = r.dataset.id; draw(); $(`[data-id="${selected}"]`, body)?.focus(); return; }
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (act === 'value') {
          sheet.close();
          app.startWithDevice(selected);
        } else if (act === 'add') {
          const ok = app.addCompare(selected);
          if (ok) app.toast(`Added. ${app.swap.compare.length} in your comparison.`);
          draw();
        } else if (act === 'go') {
          sheet.close();
          app.navigate({ view: 'swap' });
        }
      });
    },
  });
}

export { CONDITION_ORDER };
