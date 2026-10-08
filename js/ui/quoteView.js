// A saved quote, read-only, exactly as quoted. Offers today's figures when they differ.
import { CONFIG } from '../config.js';
import { valueDevice, termsLabel } from '../engine.js';
import { html, raw, naira, nairaK, lineAmount, lineAmountK, deviceWord, dateLabel, $ } from '../format.js';
import { ICON } from './icons.js';
import { decodeQuote, answersText, termsText, whatsappMessage, whatsappURL, share, summaryText, ageDays, saveQuote } from '../quote.js';
import { loadQuoteRemote } from '../data.js';
import { isMine } from '../me.js';

/** The battery range a saved battery reading falls in (the flow asks for a range). */
function bandFor(b) {
  if (b === null || b === undefined || b === '') return '';
  const n = Number(b);
  return n >= 90 ? '90' : n >= 85 ? '85' : n >= 80 ? '80' : '79';
}

export function quoteScreen(el, app, p) {
  el.classList.add('wide');
  // The blue bar carries the wait: it runs most of the way while the quote loads, then the quote replaces it.
  el.innerHTML = '<div class="screen-main"><div class="progress load-bar" aria-hidden="true"><i style="transform:scaleX(0.06)"></i></div><p class="eyebrow qv-opening" role="status">Opening your quote…</p></div>';
  const bar = el.querySelector('.load-bar i');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (!bar) return;
    bar.style.transition = 'transform 6s cubic-bezier(0.1, 0.7, 0.2, 1)';
    bar.style.transform = 'scaleX(0.92)';
  }));
  (async () => {
    let q;
    try {
      q = p.packed ? decodeQuote(p.packed) : await loadQuoteRemote(p.id);
    } catch (err) {
      const missing = err && err.notFound;
      el.innerHTML = html`<h2 class="h-title">${missing ? 'We couldn’t find this quote' : 'We couldn’t open this quote'}</h2>
        <p class="par">${missing ? `Check the code${p.id ? ` (${p.id})` : ''} and try again, or start a new quote.` : 'The connection is slow or offline. Try again in a moment.'}</p>
        <div class="pills">${missing ? '' : html`<button class="pill go" type="button" data-act="retry">Try Again</button>`}<button class="pill${missing ? ' go' : ''}" type="button" data-act="new">Start a New Quote</button></div>`.toString();
      el.onclick = (e) => {
        if (e.target.closest('[data-act="new"]')) app.go('home');
        if (e.target.closest('[data-act="retry"]')) app.refresh();
      };
      return;
    }
    render(el, app, p, q);
  })();
}

function render(el, app, p, q) {
  const cat = app.catalog;
  const link = p.id ? `${CONFIG.site}?q=${p.id}` : '';
  // An old long-link quote (?s=) gets saved once to give it a short link; the long one is never shared.
  let short = p.id ? Promise.resolve({ q, link, id: p.id }) : null;
  const shortLink = (raw = false) => {
    if (!short) {
      short = saveQuote(q).then((r) => { if (!r.saved || !r.link) throw new Error('Quote not saved'); return { q, link: r.link, id: r.id }; });
      short.catch(() => { short = null; });
    }
    if (raw) return short;
    const t = setTimeout(() => app.toast('Saving your Swap…'), 300);
    return short.then((r) => { clearTimeout(t); return r; }, () => { clearTimeout(t); app.toast('Couldn’t save your Swap. Check your connection and try again.'); return null; });
  };
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
  // Anyone with the link can view; only the person who made it can edit it (Daniel, 8 Oct).
  const mine = isMine(p.id, q);
  const nameParts = (n) => { const [m, ...r] = n.split(' · '); return [m, r.join(' · ')]; };
  el.innerHTML = html`
    <div class="head-block qv-head">
      <h2 class="h-title">${items.length ? 'Your Swap Quote' : 'Your Comparison'}</h2>
      <p class="par">${p.id ? `${p.id} · ` : ''}${dateLabel(q.created)} · valid for ${CONFIG.quoteValidDays} days</p>
      ${mine ? html`<button class="link qv-edit" type="button" data-act="edit">Edit Quote</button>` : ''}
    </div>
    ${expired ? html`<div class="notice">This quote is more than ${CONFIG.quoteValidDays} days old and has expired. Prices change often. <button class="link" type="button" data-act="today" style="padding:0;min-height:0">See today’s figures</button></div>`
      : changed ? html`<div class="notice">Prices have changed since this quote. <button class="link" type="button" data-act="today" style="padding:0;min-height:0">See today’s figures</button></div>` : ''}
    ${items.length ? html`
      ${!q.compare.length ? html`<div class="dev-value qv-total">
        <p class="tiv-label">${multi ? `Total Trade-In Value · ${items.length} Devices` : 'Your Trade-In Value'}</p>
        <p class="big-num">${nairaK(q.value)}</p>
        <p class="small">Estimated. Confirmed when we check ${multi ? 'the devices' : 'the device'} in store.</p>
      </div>` : ''}
      <p class="qv-label">${multi ? 'Your Trade-In Devices' : 'Your Trade-In'}</p>
      <div class="qv-card">
        ${items.map((it) => { const [m, rest] = nameParts(it.name); return html`<div class="qv-dev">
          <p class="qv-row"><span class="qv-name"><strong>${m}</strong></span><span class="qv-val">${nairaK(it.value)}<small>Value for Your ${deviceWord(it.name)}</small></span></p>
          <p class="qv-cond">${[rest, answersText(it.answers)].filter(Boolean).join(' · ')}</p>
          ${!multi ? html`<ul class="lines">
            <li><span>Starting Value, Perfect Condition</span><span>${nairaK(it.start)}</span></li>
            ${(it.lines || []).map(([label, amount]) => html`<li class="${amount === null ? 'pending' : ''}"><span>${label}</span><span>${lineAmountK(amount)}</span></li>`)}
          </ul>` : ''}
        </div>`; })}
        ${multi ? html`<p class="qv-row qv-tot"><span class="qv-name"><strong>Total Trade-In Value</strong></span><span class="qv-val">${nairaK(q.value)}</span></p>` : ''}
      </div>` : ''}
    ${q.compare.length ? html`
      <p class="qv-label">${items.length ? 'Your Swap Options' : 'Devices'}</p>
      <div class="cmp-grid">${q.compare.map((c) => {
        const gone = !avail(c.id);
        const [model, rest] = nameParts(c.name);
        return html`<article class="cmp slim ${c.kind}${gone ? ' gone' : ''}">
          <span class="t"><b>${model}</b>${gone ? raw(' <span class="tag warn">No longer available</span>') : ''}</span>
          <span class="row2"><span class="p">${c.dealNote || rest}<br>Price ${nairaK(c.price)}</span><span class="kn"><span class="n">${items.length ? nairaK(c.kind === 'even' ? 0 : c.amount) : nairaK(c.price)}</span><span class="k">${items.length ? termsLabel(c) : 'Price'}</span></span></span>
        </article>`;
      })}</div>` : ''}
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
    if (act === 'wa') {
      const r = await shortLink();
      if (r) location.href = whatsappURL(whatsappMessage(q, r.link, q.city));
    }
    if (act === 'share') {
      const { sharePage } = await import('./flow.js');
      const html0 = el.innerHTML, click0 = el.onclick, cls0 = el.className;
      sharePage(el, app, {
        saved: () => shortLink(true),
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
        sim: a.sim || '',
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
        // Someone else's quote opens as a new quote of their own; the original stays as it was.
        editing: mine ? p.id || '' : '',
        quoteId: mine ? p.id || '' : '',
      });
      app.save();
      history.replaceState({ screen: 'home', params: {}, d: 0 }, '', './');
      app.go('compare');
    }
  };
  $('h1', el)?.focus?.({ preventScroll: true });
}
