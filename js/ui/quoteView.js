// A saved quote, read-only, exactly as quoted. Offers today's figures when they differ.
import { CONFIG } from '../config.js';
import { valueDevice, termsLabel } from '../engine.js';
import { html, raw, naira, lineAmount, dateLabel, $ } from '../format.js';
import { ICON } from './icons.js';
import { decodeQuote, answersText, termsText, whatsappMessage, whatsappURL, share, summaryText, ageDays } from '../quote.js';
import { loadQuoteRemote } from '../data.js';

/** The battery range a saved battery reading falls in (the flow asks for a range). */
function bandFor(b) {
  if (b === null || b === undefined || b === '') return '';
  const n = Number(b);
  return n >= 90 ? '90' : n >= 85 ? '85' : n >= 80 ? '80' : '79';
}

export function quoteScreen(el, app, p) {
  el.classList.add('wide');
  el.innerHTML = '<p class="eyebrow">Opening your quote…</p>';
  (async () => {
    let q;
    try {
      q = p.packed ? decodeQuote(p.packed) : await loadQuoteRemote(p.id);
    } catch {
      el.innerHTML = html`<h2 class="h-title">We couldn’t open this quote</h2>
        <p class="par">The link may be incomplete, or we’re offline. Check the link, or start a new quote.</p>
        <div class="pills"><button class="pill go" type="button" data-act="new">Start a New Quote</button></div>`.toString();
      el.onclick = (e) => { if (e.target.closest('[data-act="new"]')) app.go('home'); };
      return;
    }
    render(el, app, p, q);
  })();
}

function render(el, app, p, q) {
  const cat = app.catalog;
  const link = p.id ? `${CONFIG.site}?q=${p.id}` : `${CONFIG.site}?s=${p.packed}`;
  const expired = ageDays(q) > CONFIG.quoteValidDays;
  const dev = q.device && cat.byId.get(q.device.id);
  const avail = (id) => { const d = cat.byId.get(id); return d && d.swapInto && d.price > 0 && d.stock !== 'soldout' ? d : null; };
  // Every trade-in device in the quote, re-valued with today's prices and rules.
  const saved = q.items && q.items.length > 1 ? q.items.map((it) => ({ id: it.id, answers: it.answers, value: it.value }))
    : dev && q.answers ? [{ id: dev.id, answers: q.answers, value: q.value }] : [];
  const revalued = saved.map((it) => { const d = cat.byId.get(it.id); return { ...it, d, r: d && it.answers ? valueDevice(d, it.answers, cat.settings) : null }; });
  const tradeChanged = revalued.some((it) => it.r && it.r.accepted && it.r.value !== it.value);
  const changed = tradeChanged || q.compare.some((c) => avail(c.id) && avail(c.id).price !== c.price);

  const items = q.items && q.items.length > 1 ? q.items
    : q.device ? [{ name: q.device.name, value: q.value, start: q.device.start, answers: q.answers, lines: q.lines || [] }] : [];
  const multi = items.length > 1;
  const nameParts = (n) => { const [m, ...r] = n.split(' · '); return [m, r.join(' · ')]; };
  el.innerHTML = html`
    <div class="head-block qv-head">
      <h2 class="h-title">${items.length ? 'Your Swap Quote' : 'Your Comparison'}</h2>
      <p class="par">${p.id ? `${p.id} · ` : ''}${dateLabel(q.created)} · valid for ${CONFIG.quoteValidDays} days</p>
      <button class="link qv-edit" type="button" data-act="edit">Edit Quote</button>
    </div>
    ${expired ? html`<div class="notice">This quote is more than ${CONFIG.quoteValidDays} days old and has expired. Prices change often. <button class="link" type="button" data-act="today" style="padding:0;min-height:0">See today’s figures</button></div>`
      : changed ? html`<div class="notice">Prices have changed since this quote. <button class="link" type="button" data-act="today" style="padding:0;min-height:0">See today’s figures</button></div>` : ''}
    ${q.compare.length ? html`
      <p class="qv-label">${items.length ? 'Your Swap Options' : 'Devices'}</p>
      <div class="cmp-grid">${q.compare.map((c) => {
        const gone = !avail(c.id);
        const [model, rest] = nameParts(c.name);
        return html`<article class="cmp slim ${c.kind}${gone ? ' gone' : ''}">
          <span class="t"><b>${model}</b>${gone ? raw(' <span class="tag warn">No longer available</span>') : ''}</span>
          <span class="row2"><span class="p">${c.dealNote || rest}<br>Price ${naira(c.price)}</span><span class="kn"><span class="k">${items.length ? termsLabel(c) : 'Price'}</span> <span class="n">${items.length ? naira(c.kind === 'even' ? 0 : c.amount) : naira(c.price)}</span></span></span>
        </article>`;
      })}</div>` : ''}
    ${items.length ? html`
      ${!q.compare.length ? html`<div class="dev-value qv-total">
        <p class="tiv-label">${multi ? `Total Trade-In Value · ${items.length} devices` : 'Your Trade-In Value'}</p>
        <p class="big-num">${naira(q.value)}</p>
        <p class="small">Estimated. Confirmed when we check ${multi ? 'the devices' : 'the device'} in store.</p>
      </div>` : ''}
      <p class="qv-label">${multi ? 'Your Trade-In Devices' : 'Your Trade-In'}</p>
      <div class="qv-card">
        ${items.map((it) => { const [m, rest] = nameParts(it.name); return html`<div class="qv-dev">
          <p class="qv-row"><span class="qv-name"><strong>${m}</strong></span><span class="qv-val">${naira(it.value)}</span></p>
          <p class="qv-cond">${[rest, answersText(it.answers)].filter(Boolean).join(' · ')}</p>
          ${!multi ? html`<ul class="lines">
            <li><span>Starting value, perfect condition</span><span>${naira(it.start)}</span></li>
            ${(it.lines || []).map(([label, amount]) => html`<li class="${amount === null ? 'pending' : ''}"><span>${label}</span><span>${lineAmount(amount)}</span></li>`)}
          </ul>` : ''}
        </div>`; })}
        ${multi ? html`<p class="qv-row qv-tot"><span class="qv-name"><strong>Total Trade-In Value</strong></span><span class="qv-val">${naira(q.value)}</span></p>` : ''}
      </div>` : ''}
    ${q.city ? html`<p class="small qv-foot">City: ${q.city}</p>` : ''}`;
  el.innerHTML = html`<div class="screen-main">${raw(el.innerHTML)}</div><div class="screen-foot">
      <div class="pills"><button class="pill" type="button" data-act="share">Share Quote</button><button class="pill wa" type="button" data-act="wa">${raw(ICON.whatsapp)}WhatsApp</button></div>
      <p class="credit"><b>swapdesk.ng</b> · An Upgrade Brands product</p></div>`.toString();

  // Long names (iPads) shrink slightly to stay on one line.
  requestAnimationFrame(() => el.querySelectorAll('.qv-name strong').forEach((n) => {
    let fs = 15; while (n.scrollWidth > n.clientWidth + 0.5 && fs > 12) { fs -= 0.5; n.style.fontSize = `${fs}px`; }
  }));
  el.onclick = async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'wa') location.href = whatsappURL(whatsappMessage(q, link, q.city));
    if (act === 'share') {
      const { sharePage } = await import('./flow.js');
      const html0 = el.innerHTML, click0 = el.onclick, cls0 = el.className;
      sharePage(el, app, {
        saved: () => Promise.resolve({ q, link }),
        onBack: () => { el.className = cls0; el.innerHTML = html0; el.onclick = click0; document.getElementById('body')?.scrollTo(0, 0); },
      });
    }
    if (act === 'today' || act === 'edit') {
      const { freshAnswers } = await import('./flow.js');
      // Put the quote back into the swap flow: every trade-in device with its answers, and the swap devices still on sale.
      const ui = (a = {}) => ({
        ...freshAnswers(),
        icloudLocked: !!a.icloudLocked,
        batteryBand: bandFor(a.battery),
        batteryUnknown: a.battery === null || a.battery === undefined,
        neatness: a.neatness || null, network: a.network || null, faults: a.faults || [], faultsDone: true,
      });
      const known = revalued.filter((it) => it.d);
      const last = known[known.length - 1];
      Object.assign(app.s, {
        mode: 'swap', cash: false, adding: false,
        more: known.slice(0, -1).map((it) => ({ deviceId: it.d.id, answers: ui(it.answers) })),
        deviceId: last ? last.d.id : '',
        answers: last ? ui(last.answers) : freshAnswers(),
        compare: q.compare.map((c) => c.id).filter((id) => avail(id)),
        chosen: null, saved: null,
        // Saving after an edit updates this quote and keeps its link.
        editing: p.id || '',
      });
      app.save();
      history.replaceState({ screen: 'home', params: {}, d: 0 }, '', './');
      app.go('compare');
    }
  };
  $('h1', el)?.focus?.({ preventScroll: true });
}
