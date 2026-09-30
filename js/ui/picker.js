// Device picker: type → brand → model (grouped by series, newest first) → version.
// Search is always available ("16 pro max 256").
import { matches, variantOrder } from '../engine.js';
import { html, raw, variantName } from '../format.js';
import { ICON } from './icons.js';

const typeLabel = (t) => (t === 'Tablets' ? 'iPads & Tablets' : t);

/**
 * mountPicker(container, {
 *   devices, catalog, mode: 'single'|'multi', figure(d) → string,
 *   isSelected(id), onPick(id), state: { type, brand, search, model }
 * })
 */
export function mountPicker(el, opts) {
  const { devices, catalog, mode, figure, isSelected, onPick } = opts;
  const st = opts.state;
  const types = [...new Set(devices.map((d) => d.type))];
  if (!st.type || !types.includes(st.type)) st.type = types[0] || '';

  const byOrder = (a, b) =>
    (catalog.seriesOrder.get(a.series) ?? 1e9) - (catalog.seriesOrder.get(b.series) ?? 1e9) ||
    (catalog.modelOrder.get(a.model) ?? 1e9) - (catalog.modelOrder.get(b.model) ?? 1e9) || variantOrder(a, b);

  function variantRow(d, showModel) {
    const on = isSelected(d.id);
    const role = mode === 'multi' ? 'checkbox' : 'radio';
    return html`<button type="button" class="row" role="${role}" aria-checked="${on ? 'true' : 'false'}" data-pick="${d.id}">
      <span class="check${mode === 'multi' ? ' box' : ''}" aria-hidden="true"></span>
      <span class="row-main"><span class="row-title">${showModel ? d.model : variantName(d)}${d.condition === 'Deal' ? raw(' <span class="tag">One unit</span>') : ''}</span>
        ${showModel || d.condition === 'Deal' ? html`<span class="row-sub">${d.condition === 'Deal' ? [d.storage, d.dealNote].filter(Boolean).join(' · ') : variantName(d)}</span>` : ''}</span>
      <span class="row-value">${figure(d)}</span></button>`;
  }

  function groups(rows, fn) {
    const out = [];
    let cur = null;
    for (const d of rows) {
      if (!cur || cur.series !== d.series) { cur = { series: d.series, rows: [] }; out.push(cur); }
      cur.rows.push(d);
    }
    return out.map((g) => html`<section class="series"><h3 class="series-h" style="top:0">${g.series}</h3><div class="group">${fn(g.rows)}</div></section>`);
  }

  function draw() {
    const inType = devices.filter((d) => d.type === st.type);
    const brands = [...new Set(inType.map((d) => d.brand))];
    if (st.brand && !brands.includes(st.brand)) st.brand = '';
    const scoped = inType.filter((d) => !st.brand || d.brand === st.brand);
    let bodyHTML;
    if (st.search.trim()) {
      const found = devices.filter((d) => matches(d, st.search)).sort(byOrder);
      bodyHTML = found.length
        ? groups(found, (rows) => rows.map((d) => variantRow(d, true)))
        : html`<p class="empty">No devices match “${st.search}”.</p>`;
    } else if (st.model) {
      const versions = devices.filter((d) => d.model === st.model).sort(variantOrder);
      if (mode === 'single' && versions.length === 1 && !isSelected(versions[0].id)) {
        queueMicrotask(() => onPick(versions[0].id, { auto: true }));
      }
      bodyHTML = html`
        <button type="button" class="link-btn" data-back>‹ All ${st.brand || typeLabel(st.type)} models</button>
        <p class="title-3" style="margin:0.25rem 0 0.75rem">${st.model}</p>
        <div class="group variant-list" role="${mode === 'multi' ? 'group' : 'radiogroup'}" aria-label="Versions of ${st.model}">
          ${versions.map((d) => variantRow(d, false))}</div>`;
    } else {
      const models = [];
      const seen = new Set();
      for (const d of [...scoped].sort(byOrder)) {
        if (seen.has(d.model)) continue;
        seen.add(d.model);
        const vs = scoped.filter((x) => x.model === d.model);
        models.push({ ...d, count: vs.length, anySel: vs.some((x) => isSelected(x.id)) });
      }
      bodyHTML = groups(models, (rows) => rows.map((m) => html`
        <button type="button" class="row" data-model="${m.model}">
          <span class="row-main"><span class="row-title">${m.model}</span>
          <span class="row-sub">${m.count === 1 ? variantName(m) : `${m.count} versions`}</span></span>
          ${m.anySel ? raw('<span class="tag">Selected</span>') : ''}${raw(ICON.chevron)}</button>`));
    }

    el.innerHTML = html`
      <div class="stack">
        <label class="search"><span class="visually-hidden">Search devices</span>${raw(ICON.search)}
          <input type="search" data-search placeholder="Search, e.g. 13 pro max 256" value="${st.search}" autocomplete="off" enterkeyhint="search">
          <button type="button" class="clear" aria-label="Clear search">${raw(ICON.clear)}</button></label>
        ${st.search.trim() ? '' : html`
          ${types.length > 1 ? html`<div class="chips" role="group" aria-label="Type">${types.map((t) => html`<button type="button" class="chip" aria-pressed="${t === st.type ? 'true' : 'false'}" data-type="${t}">${typeLabel(t)}</button>`)}</div>` : ''}
          ${brands.length > 1 ? html`<div class="chips" role="group" aria-label="Brand">
            <button type="button" class="chip" aria-pressed="${!st.brand ? 'true' : 'false'}" data-brand="">All</button>
            ${brands.map((b) => html`<button type="button" class="chip" aria-pressed="${b === st.brand ? 'true' : 'false'}" data-brand="${b}">${b}</button>`)}</div>` : ''}`}
        <div data-results>${bodyHTML}</div>
      </div>`.toString();
  }

  el.addEventListener('input', (e) => {
    if (!e.target.matches('[data-search]')) return;
    st.search = e.target.value;
    const pos = e.target.selectionStart;
    draw();
    const inp = el.querySelector('[data-search]');
    inp.focus();
    try { inp.setSelectionRange(pos, pos); } catch { /* type=search */ }
  });
  el.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('.clear')) { st.search = ''; draw(); el.querySelector('[data-search]').focus(); return; }
    const type = t.closest('[data-type]');
    if (type) { st.type = type.dataset.type; st.brand = ''; st.model = ''; draw(); return; }
    const brand = t.closest('[data-brand]');
    if (brand) { st.brand = brand.dataset.brand; st.model = ''; draw(); return; }
    if (t.closest('[data-back]')) { st.model = ''; draw(); return; }
    const model = t.closest('[data-model]');
    if (model) { st.model = model.dataset.model; draw(); el.scrollIntoView?.({ block: 'nearest' }); return; }
    const pick = t.closest('[data-pick]');
    if (pick) {
      const d = catalog.byId.get(pick.dataset.pick);
      if (d && !st.search.trim()) st.model = d.model;
      onPick(pick.dataset.pick, { auto: false });
      draw();
      el.querySelector(`[data-pick="${CSS.escape(pick.dataset.pick)}"]`)?.focus({ preventScroll: true });
    }
  });

  draw();
  return { redraw: draw };
}
