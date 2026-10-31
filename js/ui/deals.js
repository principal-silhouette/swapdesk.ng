// Shop Deals: its own black-and-red pop-up (the @shopdeals.ng look) under the @shopupgrade.ng header.
// The deals show as small tiles; a tap opens that one deal's full card with its real photos (Daniel, 31 Oct).
import { matches } from '../engine.js';
import { html, raw, naira, nairaK, $, $$ } from '../format.js';
import { whatsappURL } from '../quote.js';
import { ICON } from './icons.js';
import { dealRows } from './lists.js?v=202';
import { SCREENS } from './flow.js?v=202';

// Photos and listing dates, kept with the cropped photos in assets/deals.
let EXTRA = null;
async function loadExtra() {
  if (EXTRA) return EXTRA;
  try { EXTRA = await (await fetch('data/deal-photos.json?v=2', { cache: 'no-cache' })).json(); } catch { EXTRA = {}; }
  return EXTRA;
}

const TYPE_LABEL = { Phones: 'iPhones', Tablets: 'iPads', Watches: 'Watches' };
const kindOf = (d) => (d.type === 'Phones' && d.brand !== 'Apple' ? d.brand : TYPE_LABEL[d.type] || d.type);
const NETWORK = /sim|esim|unit|cellular|wi-?fi|unlocked|locked/i;
const NOTE = /screen|battery|included|keyboard|pouch|face id|cracked|back|camera|box/i;
const SWATCH = {
  'deep blue': '#2d3f5e', blue: '#9db4e8', gold: '#e9d8b4', 'desert titanium': '#c9b29a', midnight: '#232a35', graphite: '#4a4a4c',
  '(product)red': '#c8102e', white: '#f4f4f2', 'cosmic orange': '#e8743b', 'space black': '#2b2b2e', black: '#1d1d1f', silver: '#d9dadc',
};

/** "89% Battery Health, Physical SIM + eSIM, Deep Blue" → battery, network, colour and the other notes. */
function parseNote(note = '') {
  const out = { bh: null, newBattery: false, network: [], colour: '', notes: [] };
  for (const p of note.split(/,\s*/).filter(Boolean)) {
    const m = p.match(/^(\d{2,3})%\s*battery/i);
    if (m) out.bh = Number(m[1]);
    else if (/^new battery$/i.test(p)) out.newBattery = true;
    else if (NETWORK.test(p) && !NOTE.test(p)) out.network.push(p);
    else if (NOTE.test(p)) out.notes.push(p);
    else out.colour = p;
  }
  return out;
}
const dayLabel = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const todayISO = () => new Date().toLocaleDateString('en-CA');

function card(d, x) {
  const photos = x?.photos || [];
  const n = photos.length;
  const p = parseNote(d.dealNote);
  const bh = p.bh ? html`<span class="bat ${p.bh >= 85 ? 'g' : p.bh >= 80 ? 'w' : 'l'}">${p.bh}%</span>` : p.newBattery ? raw('<span class="bat g">New</span>') : '—';
  const sw = SWATCH[p.colour.toLowerCase()];
  const gallery = n
    ? html`<div class="dl-track" data-track tabindex="0" aria-label="${n} photos of the ${d.model}">${photos.map((src, i) => html`<button class="dl-slide" type="button" data-zoom="${i}" aria-label="View photo ${i + 1} of ${n} full screen"><img src="${src}" alt="${d.model} ${d.storage}, photo ${i + 1} of ${n}" ${raw(i ? 'loading="lazy"' : '')} decoding="async" width="960" height="1200"></button>`)}</div>
      <span class="dl-count">📷 <span data-pc>${n > 1 ? `1 / ${n}` : '1'}</span> ${n === 1 ? 'Photo' : 'Photos'}</span>
      ${n > 1 ? html`<div class="dl-dots" aria-hidden="true">${photos.map((_, i) => raw(`<b${i ? '' : ' class="on"'}></b>`))}</div>
        <button class="dl-nav prev" type="button" data-nav="-1" aria-label="Previous photo" disabled>‹</button><button class="dl-nav next" type="button" data-nav="1" aria-label="Next photo">›</button>` : ''}`
    : raw('<div class="dl-none">Photos coming soon</div>');
  const isNew = x?.listed && x.listed === todayISO();
  return html`<article class="dl-card" data-id="${d.id}">
    <div class="dl-gal">${gallery}${isNew ? raw('<span class="dl-new">New Today</span>') : ''}</div>
    <div class="dl-body">
      <div class="dl-titlerow"><div><h3 class="dl-name">${d.model}</h3><p class="dl-sub">${d.storage} · ${kindOf(d).replace(/s$/, '')} Deal</p></div><p class="dl-price">${naira(d.price)}</p></div>
      <dl class="dl-specs">
        <div><dt>Battery Health</dt><dd>${bh}</dd></div>
        <div><dt>Colour</dt><dd>${sw ? raw(`<span class="sw" style="background:${sw}"></span>`) : ''}${p.colour || '—'}</dd></div>
        <div><dt>Network</dt><dd>${p.network.join(' · ') || '—'}</dd></div>
        <div><dt>Photos</dt><dd>${n ? `${n} Available` : 'Coming Soon'}</dd></div>
      </dl>
      ${p.notes.length ? html`<div class="dl-notes">${p.notes.map((t) => html`<span>${t}</span>`)}</div>` : ''}
      <div class="dl-acts"><button class="btn dl-swap" type="button" data-act="swapfor" data-id="${d.id}">Swap For This</button><a class="btn dl-wa" href="${whatsappURL(`Hi SwapDesk, is the ${d.model} ${d.storage} deal at ${naira(d.price)} still available? (${d.id})`)}" aria-label="Ask about this deal on WhatsApp">${raw(ICON.whatsapp)} Ask</a></div>
      ${x?.listed ? html`<p class="dl-listed">Listed ${dayLabel(x.listed)}</p>` : ''}
    </div>
  </article>`;
}

function tile(d, x) {
  const photos = x?.photos || [];
  const n = photos.length;
  const p = parseNote(d.dealNote);
  const bh = p.bh ? html`<span class="bat ${p.bh >= 85 ? 'g' : p.bh >= 80 ? 'w' : 'l'}">${p.bh}%</span>` : p.newBattery ? raw('<span class="bat g">New</span>') : '';
  return html`<button class="dl-tile" type="button" data-open="${d.id}" aria-label="${d.model} ${d.storage}, ${naira(d.price)}. See this deal.">
    ${n ? html`<img src="${photos[0]}" alt="" loading="lazy" decoding="async" width="960" height="1200">` : raw('<span class="dl-none">Photos coming soon</span>')}
    <span class="dl-tt"><b>${d.model}</b><small>${d.storage}${n ? ` · ${n} ${n === 1 ? 'photo' : 'photos'}` : ''}</small><span class="dl-tr"><span class="dl-tp">${nairaK(d.price)}</span>${bh}</span></span>
  </button>`;
}

function wireGallery(tr) {
  const gal = tr.parentElement;
  const n = tr.children.length;
  const cur = () => Math.round(tr.scrollLeft / tr.clientWidth);
  tr.addEventListener('scroll', () => requestAnimationFrame(() => {
    const i = cur();
    $$('.dl-dots b', gal).forEach((b, k) => b.classList.toggle('on', k === i));
    const pc = $('[data-pc]', gal); if (pc && n > 1) pc.textContent = `${i + 1} / ${n}`;
    const prev = $('.prev', gal), next = $('.next', gal);
    if (prev) { prev.disabled = i === 0; next.disabled = i === n - 1; }
  }), { passive: true });
  tr.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') tr.scrollBy({ left: (e.key === 'ArrowRight' ? 1 : -1) * tr.clientWidth, behavior: 'smooth' });
  });
}

// Tap a photo: full screen, swipe through the rest.
function zoom(d, i) {
  const photos = EXTRA?.[d.id]?.photos || [];
  const lb = document.createElement('div');
  lb.className = 'dl-lb';
  lb.setAttribute('role', 'dialog');
  lb.setAttribute('aria-label', `${d.model} photos`);
  lb.innerHTML = html`<div class="dl-lbbar"><span data-lbc></span><button type="button" data-lbx>Close</button></div>
    <div class="dl-lbtrack">${photos.map((src, k) => html`<img src="${src}" alt="${d.model}, photo ${k + 1} of ${photos.length}">`)}</div>`.toString();
  document.body.append(lb);
  const tr = $('.dl-lbtrack', lb);
  const upd = () => { $('[data-lbc]', lb).textContent = `${d.model} · ${Math.round(tr.scrollLeft / tr.clientWidth) + 1} of ${photos.length}`; };
  tr.scrollLeft = i * tr.clientWidth; upd();
  tr.addEventListener('scroll', () => requestAnimationFrame(upd), { passive: true });
  const close = () => { lb.remove(); removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  addEventListener('keydown', onKey);
  $('[data-lbx]', lb).addEventListener('click', close);
  $('[data-lbx]', lb).focus();
}

/** Clicks shared by both screens: photo arrows, full-screen photos, Swap For This. */
function wireCard(el, app) {
  el.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) { const tr = $('[data-track]', nav.parentElement); tr.scrollBy({ left: Number(nav.dataset.nav) * tr.clientWidth, behavior: 'smooth' }); return; }
    const z = e.target.closest('[data-zoom]');
    if (z) { zoom(app.catalog.byId.get(z.closest('.dl-card').dataset.id), Number(z.dataset.zoom)); return; }
    const a = e.target.closest('[data-act="swapfor"]');
    if (a) {
      // Value their device first; this deal is already on the swap list when they get there.
      SCREENS.startFlow(app, 'swap');
      app.s.compare = [a.dataset.id];
      app.save();
    }
  });
}

export function dealsScreen(el, app) {
  const { catalog } = app;
  const all = dealRows(catalog);
  const f = { kind: '', search: '' };
  el.classList.add('wide', 'picking', 'deals-pg');
  el.innerHTML = `<div class="screen-main">
      <div class="list-head">
        <h1 class="h-title">🔥 @shopupgrade.ng</h1>
        <p class="list-sub">One unit each, with real photos of the actual device. <strong>What you see is what you swap into.</strong></p>
        <p class="list-date" data-count></p>
      </div>
      <div class="list-top">
        <label class="field"><span class="visually-hidden">Search deals</span>${ICON.search}
          <input type="search" data-search placeholder="Search, e.g. 16 pro max" autocomplete="off" enterkeyhint="search">
          <button class="clear" type="button" data-act="clear" aria-label="Clear search">${ICON.clear}</button></label>
        <div class="chips" data-kinds></div>
      </div>
      <div data-list></div>
    </div>
    <div class="screen-foot"><div class="pills"><button class="pill" type="button" data-act="home">Go Back</button><button class="pill go" type="button" data-act="swap">My Swap Rate</button></div><p class="credit"><b>swapdesk.ng</b> · An Upgrade Brands product</p></div>`;

  const kinds = [...new Set(all.map(kindOf))];
  const drawChips = () => {
    $('[data-kinds]', el).innerHTML = kinds.length > 1
      ? ['', ...kinds].map((k) => html`<button class="chip" type="button" aria-pressed="${f.kind === k ? 'true' : 'false'}" data-kind="${k}">${k || 'All Deals'}</button>`).join('')
      : '';
  };

  async function drawList() {
    const extra = await loadExtra();
    const rows = all.filter((d) => (!f.kind || kindOf(d) === f.kind) && matches(d, f.search));
    const nPhotos = all.reduce((s, d) => s + (extra[d.id]?.photos || []).length, 0);
    $('[data-count]', el).textContent = `${all.length} ${all.length === 1 ? 'Deal' : 'Deals'} Available · ${nPhotos} Photos`;
    // Same order as the Shop list: series by the catalogue's order, then model, then most expensive first.
    const sorted = [...rows].sort((a, b) =>
      (catalog.groupOrder.get(a.series) ?? 1e9) - (catalog.groupOrder.get(b.series) ?? 1e9) ||
      (catalog.nameOrder.get(a.model) ?? 1e9) - (catalog.nameOrder.get(b.model) ?? 1e9) || b.price - a.price);
    // Every deal as a small tile, 2 across (option B, 31 Oct). A tap opens just that deal.
    $('[data-list]', el).innerHTML = sorted.length
      ? html`<div class="dl-tiles">${sorted.map((d) => tile(d, extra[d.id]))}</div>`.toString()
      : html`<div class="empty"><p>${f.search ? 'No deals match. Try a shorter search.' : 'No deals right now. Check back soon, or follow @shopupgrade.ng for new ones.'}</p></div>`.toString();
  }

  let t;
  el.addEventListener('input', (e) => {
    if (!e.target.matches('[data-search]')) return;
    clearTimeout(t);
    t = setTimeout(() => { f.search = e.target.value; drawList(); }, 120);
  });
  el.addEventListener('click', (e) => {
    const o = e.target.closest('[data-open]');
    if (o) { app.go('deal', { id: o.dataset.open }); return; }
    const k = e.target.closest('[data-kind]');
    if (k) { f.kind = k.dataset.kind; drawChips(); drawList(); return; }
    const a = e.target.closest('[data-act]');
    if (!a) return;
    if (a.dataset.act === 'home') app.back();
    else if (a.dataset.act === 'clear') { f.search = ''; $('[data-search]', el).value = ''; drawList(); }
    else if (a.dataset.act === 'swap') SCREENS.startFlow(app, 'swap');
  });
  wireCard(el, app);
  drawChips();
  drawList();
  requestAnimationFrame(() => { const top = $('.list-top', el); if (top) el.style.setProperty('--list-top', `${top.offsetHeight - 6}px`); });
}

/** One deal on its own (31 Oct): its full card, then Go Back to the deals. */
export function dealScreen(el, app, params) {
  const d = app.catalog.byId.get(params.id);
  el.classList.add('wide', 'deals-pg', 'deal-one');
  const foot = '<div class="screen-foot"><div class="pills"><button class="pill" type="button" data-act="back">Go Back</button></div><p class="credit"><b>swapdesk.ng</b> · An Upgrade Brands product</p></div>';
  el.innerHTML = `<div class="screen-main"><div data-one></div></div>${foot}`;
  el.addEventListener('click', (e) => {
    if (!e.target.closest('[data-act="back"]')) return;
    // Opened from a shared link: there's no deals page behind it, so go there instead of leaving the site.
    if ((history.state?.d || 0) > 0) app.back(); else app.go('deals', {}, { replace: true });
  });
  wireCard(el, app);
  loadExtra().then((extra) => {
    const box = $('[data-one]', el);
    if (!d || d.condition !== 'Deal' || !(d.price > 0)) {
      box.innerHTML = '<div class="empty"><p>This deal has been sold. See what else is available on the deals page.</p></div>';
      return;
    }
    box.innerHTML = card(d, extra[d.id]).toString();
    $$('[data-track]', el).forEach(wireGallery);
  });
}
