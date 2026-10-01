// A saved quote, read-only, exactly as quoted. Offers today's figures when they differ.
import { CONFIG } from '../config.js';
import { valueDevice } from '../engine.js';
import { html, raw, naira, dateLabel, $ } from '../format.js';
import { ICON } from './icons.js';
import { decodeQuote, answersText, termsText, whatsappMessage, whatsappURL, share, summaryText, ageDays } from '../quote.js';
import { loadQuoteRemote } from '../data.js';

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
  const today = dev && q.answers ? valueDevice(dev, q.answers, cat.settings) : null;
  const avail = (id) => { const d = cat.byId.get(id); return d && d.swapInto && d.price > 0 ? d : null; };
  const changed = (!(q.items && q.items.length > 1) && today && today.accepted && today.value !== q.value) || q.compare.some((c) => avail(c.id) && avail(c.id).price !== c.price);

  el.innerHTML = html`
    <p class="eyebrow">Swap Quote${p.id ? ` ${p.id}` : ''} · ${dateLabel(q.created)}</p>
    <h1 class="h-title">${q.device ? 'Your Swap Quote' : 'Your Comparison'}</h1>
    ${expired ? html`<div class="notice">This quote is more than ${CONFIG.quoteValidDays} days old and has expired. Prices change often. <button class="link" type="button" data-act="today" style="padding:0;min-height:0">See today’s figures</button></div>`
      : changed ? html`<div class="notice">Prices have changed since this quote. <button class="link" type="button" data-act="today" style="padding:0;min-height:0">See today’s figures</button></div>` : ''}
    ${q.items && q.items.length > 1 ? html`
      <p class="par">Trading in ${q.items.length} devices</p>
      <p class="big-num">${naira(q.value)}</p>
      <p class="small">Total trade-in value. Estimated, confirmed when we check the devices in store.</p>
      ${q.items.map((it) => html`<div class="card"><ul class="lines">
        <li class="total"><span>${it.name}</span><span>${naira(it.value)}</span></li>
        <li><span class="small">${answersText(it.answers)}</span><span></span></li>
        <li><span>Starting value, perfect condition</span><span>${naira(it.start)}</span></li>
        ${it.lines.map(([label, amount]) => html`<li class="${amount === null ? 'pending' : ''}"><span>${label}</span><span>${amount === null ? 'Checked in store' : `− ${naira(amount)}`}</span></li>`)}
      </ul></div>`)}` : q.device ? html`
      <p class="par"><strong>${q.device.name}</strong><br><span class="small">${answersText(q.answers)}</span></p>
      <p class="big-num">${naira(q.value)}</p>
      <p class="small">Trade-in value. Estimated, confirmed when we check the device in store.</p>
      <div class="card"><ul class="lines">
        <li><span>Starting value, perfect condition</span><span>${naira(q.device.start)}</span></li>
        ${q.lines.map(([label, amount]) => html`<li class="${amount === null ? 'pending' : ''}"><span>${label}</span><span>${amount === null ? 'Checked in store' : `− ${naira(amount)}`}</span></li>`)}
      </ul></div>` : ''}
    ${q.compare.length ? html`
      <h2 class="h-sub">${q.device ? 'Swap Rates' : 'Devices'}</h2>
      <div class="cmp-grid">${q.compare.map((c) => {
        const gone = !avail(c.id);
        const [model, ...rest] = c.name.split(' · ');
        const label = q.device ? termsText(c).replace(/ ₦[\d,]+$/, '') : 'price';
        return html`<article class="cmp ${c.kind}${gone ? ' gone' : ''}">
          <span class="t">${model}${gone ? raw('<span class="tag warn">No longer available</span>') : ''}</span>
          <span class="s">${c.dealNote || rest.join(' · ')}</span>
          <span class="p">Price ${naira(c.price)}</span>
          <span class="k">${label}</span>
          <span class="n">${q.device ? naira(c.kind === 'even' ? 0 : c.amount) : naira(c.price)}</span></article>`;
      })}</div>` : ''}
    <p class="small">${q.city ? `City: ${q.city}. ` : ''}Quotes are valid for ${CONFIG.quoteValidDays} days.</p>`;
  el.innerHTML = html`<div class="screen-main">${raw(el.innerHTML)}</div><div class="screen-foot">
      <button class="btn green fill" type="button" data-act="wa">${raw(ICON.whatsapp)} Complete on WhatsApp</button>
      <div class="pills"><button class="pill" type="button" data-act="share">Share Quote</button><button class="pill go" type="button" data-act="today">Today’s Prices</button></div>
      <p class="credit"><b>swapdesk.ng</b> · An Upgrade Brands product</p></div>`.toString();

  el.onclick = async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'wa') location.href = whatsappURL(whatsappMessage(q, link, q.city));
    if (act === 'share') {
      const r = await share({ title: 'SwapDesk quote', text: summaryText(q, ''), url: link });
      if (r === 'copied') app.toast('Quote and link copied');
    }
    if (act === 'today') {
      const { freshAnswers } = await import('./flow.js');
      const a = q.answers || {};
      Object.assign(app.s, {
        mode: 'swap', cash: false, deviceId: dev ? dev.id : '',
        answers: {
          ...freshAnswers(),
          icloudLocked: dev ? !!a.icloudLocked : null,
          battery: a.battery === null || a.battery === undefined ? '' : String(a.battery),
          batteryUnknown: !!dev && (a.battery === null || a.battery === undefined),
          neatness: a.neatness || null, network: a.network || null, faults: a.faults || [], faultsDone: !!dev,
        },
        compare: q.compare.map((c) => c.id).filter((id) => avail(id)),
        saved: null,
      });
      app.save();
      history.replaceState({ screen: 'home', params: {}, d: 0 }, '', './');
      app.go('compare');
    }
  };
  $('h1', el)?.focus?.({ preventScroll: true });
}
