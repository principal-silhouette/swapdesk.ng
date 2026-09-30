// A saved quote, read-only, exactly as quoted. Offers today's figures when they differ.
import { CONFIG } from '../config.js';
import { valueDevice, swapTerms } from '../engine.js';
import { html, raw, naira, dateLabel } from '../format.js';
import { ICON } from './icons.js';
import {
  decodeQuote, answersText, termsText, whatsappMessage, whatsappURL, share, summaryText, ageDays,
} from '../quote.js';
import { loadQuoteRemote } from '../data.js';
import { freshAnswers, saveSwap } from './swap.js';

export async function renderQuote(main, app) {
  const r = app.route;
  main.innerHTML = '<div class="wrap narrow boot"><div class="skeleton" style="width:50%"></div><div class="skeleton tall"></div></div>';
  let q;
  try {
    q = r.packed ? decodeQuote(r.packed) : await loadQuoteRemote(r.id);
  } catch {
    main.innerHTML = html`<div class="wrap narrow empty">
      <p class="title-3">We couldn’t open this quote</p>
      <p>The link may be incomplete, or we’re offline. Check the link, or start a new quote.</p>
      <p><a class="btn primary small" href="./" data-new>Start a new quote</a></p></div>`.toString();
    main.onclick = (e) => { if (e.target.closest('[data-new]')) { e.preventDefault(); app.navigate({ view: 'swap' }); } };
    return;
  }
  if (app.route !== r && app.route.view !== 'quote') return; // navigated away while loading

  const { catalog } = app;
  const link = r.id ? `${CONFIG.site}?q=${r.id}` : `${CONFIG.site}?s=${r.packed}`;
  const expired = ageDays(q) > CONFIG.quoteValidDays;

  // Compare with today's figures.
  const dev = q.device && catalog.byId.get(q.device.id);
  const todayValue = dev && q.answers ? valueDevice(dev, q.answers, catalog.settings) : null;
  const available = (c) => {
    const d = catalog.byId.get(c.id);
    return d && d.swapInto && d.price > 0 ? d : null;
  };
  const changed = (todayValue && todayValue.accepted && todayValue.value !== q.value) ||
    q.compare.some((c) => available(c) && available(c).price !== c.price);

  main.innerHTML = html`
    <div class="wrap narrow flow">
      <p class="eyebrow" style="margin-top:0.75rem">Swap quote${r.id ? ` ${r.id}` : ''} · ${dateLabel(q.created)}</p>
      <h1 class="large-title">${q.device ? 'Your swap quote' : 'Your comparison'}</h1>
      ${expired ? html`<p class="note warn">This quote is more than ${CONFIG.quoteValidDays} days old and has expired. Prices change often. <button class="link-btn" type="button" data-act="today" style="padding:0;min-height:0">See today’s figures</button></p>`
        : changed ? html`<p class="note warn">Prices have changed since this quote. <button class="link-btn" type="button" data-act="today" style="padding:0;min-height:0">See today’s figures</button></p>` : ''}

      ${q.device ? html`
        <section class="card value-card section">
          <p class="eyebrow">Trade-in value</p>
          <p class="sub" style="margin:0 0 0.5rem"><span class="headline" style="color:var(--label)">${q.device.name}</span><br>${answersText(q.answers)}</p>
          <p class="hero-num">${naira(q.value)}</p>
          <p class="caption">Estimated. Confirmed when we check the device in store, and slightly negotiable.</p>
          <ul class="lines">
            <li><span>Starting value, good condition</span><span>${naira(q.device.start)}</span></li>
            ${q.lines.map(([label, amount]) => html`<li class="${amount === null ? 'pending' : ''}"><span>${label}</span><span>${amount === null ? 'Checked in store' : `− ${naira(amount)}`}</span></li>`)}
          </ul>
        </section>` : ''}

      ${q.compare.length ? html`
        <section class="section">
          <h2 class="title-3" style="margin-bottom:0.75rem">${q.device ? 'Swap options' : 'Devices'}</h2>
          <div class="compare-grid">
            ${q.compare.map((c) => {
              const gone = !available(c);
              return html`<article class="card cmp ${c.kind}${gone ? ' gone' : ''}">
                <p class="row-title" style="padding:0">${c.name.split(' · ')[0]}</p>
                <p class="sub" style="margin:0">${c.dealNote || c.name.split(' · ').slice(1).join(' · ')}</p>
                ${gone ? raw('<p style="margin:0.25rem 0 0"><span class="tag warn">No longer available</span></p>') : ''}
                <p class="price" style="margin:0.25rem 0 0">Price ${naira(c.price)}</p>
                <div class="topup"><p class="topup-label" style="margin:0">${q.device ? termsText(c).replace(/ ₦[\d,]+$/, '').replace(/^./, (m) => m.toUpperCase()) : 'Price'}</p>
                  <p class="topup-num" style="margin:0">${q.device ? (c.kind === 'even' ? naira(0) : naira(c.amount)) : naira(c.price)}</p></div>
              </article>`;
            })}
          </div>
        </section>` : ''}

      <section class="section stack">
        <button class="btn primary block" type="button" data-act="wa">${raw(ICON.whatsapp)} Send to SwapDesk on WhatsApp</button>
        <div class="btn-row">
          <button class="btn" type="button" data-act="share">${raw(ICON.share)} Share</button>
          <button class="btn" type="button" data-act="today">Use today’s figures</button>
        </div>
        <p class="caption">${q.city ? `City: ${q.city}. ` : ''}Quotes are valid for ${CONFIG.quoteValidDays} days. SwapDesk · An Upgrade Brands product.</p>
      </section>
    </div>`.toString();
  document.title = `Swap quote${r.id ? ` ${r.id}` : ''} · SwapDesk`;

  main.onclick = async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'wa') location.href = whatsappURL(whatsappMessage(q, link, q.city));
    if (act === 'share') {
      const res = await share({ title: 'SwapDesk quote', text: summaryText(q, ''), url: link });
      if (res === 'copied') app.toast('Quote and link copied');
    }
    if (act === 'today') {
      const s = app.swap;
      const a = q.answers || {};
      Object.assign(s, {
        home: false,
        deviceId: dev ? dev.id : '',
        answers: {
          ...freshAnswers(),
          icloudLocked: a.icloudLocked ? true : (dev ? false : null),
          battery: a.battery === null || a.battery === undefined ? '' : String(a.battery),
          batteryUnknown: dev ? a.battery === null || a.battery === undefined : false,
          neatness: a.neatness || null,
          network: a.network || null,
          faults: a.faults || [],
          faultsDone: !!dev,
        },
        phase: dev ? 'done' : 'pick',
        qi: 0,
        compare: q.compare.map((c) => c.id).filter((id) => available({ id })),
        saved: null,
      });
      saveSwap(s);
      app.navigate({ view: 'swap' });
    }
  };
}

export { swapTerms };
