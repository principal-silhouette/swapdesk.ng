// Swap flow: their device → condition → trade-in value → compare swaps → complete.
import { CONFIG, CITIES } from '../config.js';
import {
  NEATNESS, NETWORK, valueDevice, swapTerms, termsLabel, faultsFor, applies, compareOrder,
} from '../engine.js';
import { html, raw, naira, deviceName, variantName, $, $$ } from '../format.js';
import { ICON, neatnessIllo } from './icons.js';
import { mountPicker } from './picker.js';
import { openSheet } from './sheet.js';
import { animateNumber, reducedMotion, haptic } from './motion.js';
import {
  buildQuote, saveQuote, summaryText, whatsappMessage, whatsappURL, share, copy, answersText,
} from '../quote.js';
import { listRows, dealRows } from './lists.js';

const KEY = 'swapdesk.swap.v1';

export const freshAnswers = () => ({
  icloudLocked: null, battery: '', batteryUnknown: false, neatness: null, network: null, faults: [], faultsDone: false,
});

export function restoreSwap() {
  const base = { home: true, deviceId: '', answers: freshAnswers(), phase: 'pick', qi: 0, compare: [], city: '', saved: null,
    pick: { type: '', brand: '', search: '', model: '' }, add: { type: '', brand: '', search: '', model: '' } };
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && typeof s === 'object') return { ...base, ...s, answers: { ...freshAnswers(), ...(s.answers || {}) } };
  } catch { /* ignore */ }
  return base;
}

export function saveSwap(s) {
  try {
    const { pick, add, ...keep } = s;
    localStorage.setItem(KEY, JSON.stringify(keep));
  } catch { /* private mode */ }
}

// ---------- questions ----------

function questionsFor(device) {
  const apple = device.brand === 'Apple';
  const qs = [{ key: 'icloud' }];
  if (applies(device, 'battery')) qs.push({ key: 'battery', apple });
  if (applies(device, 'body')) qs.push({ key: 'neatness' });
  if (applies(device, 'network') && device.type === 'Phones') qs.push({ key: 'network' });
  const faults = faultsFor(device, { includeUnpriced: CONFIG.showUnpricedFaults });
  if (faults.length) qs.push({ key: 'faults', faults });
  return qs;
}

function answered(q, a) {
  switch (q.key) {
    case 'icloud': return a.icloudLocked === false;
    case 'battery': return a.batteryUnknown || (Number(a.battery) >= 1 && Number(a.battery) <= 100);
    case 'neatness': return !!a.neatness;
    case 'network': return !!a.network;
    case 'faults': return a.faultsDone || a.faults.length > 0;
    default: return true;
  }
}

function engineAnswers(a, device) {
  return {
    icloudLocked: a.icloudLocked === true,
    battery: a.batteryUnknown || a.battery === '' ? null : Number(a.battery),
    neatness: a.neatness,
    network: device.type === 'Phones' ? a.network : 'factory',
    faults: a.faults,
  };
}

function questionHTML(q, a, device, i, total) {
  const opt = (checked, attrs, main, sub, extra = '') => html`
    <button type="button" class="opt" role="radio" aria-checked="${checked ? 'true' : 'false'}" ${raw(attrs)}>
      ${raw(extra)}<span class="opt-main">${main}${sub ? html`<span class="opt-sub">${sub}</span>` : ''}</span>
      <span class="check" aria-hidden="true"></span></button>`;
  const head = (title, help) => html`<h3 class="q-title" id="q-${q.key}">${title}</h3>${help ? html`<p class="q-help">${help}</p>` : ''}`;
  const count = total > 1 ? html`<p class="eyebrow">Question ${i + 1} of ${total}</p>` : '';
  switch (q.key) {
    case 'icloud':
      return html`${count}${head(device.brand === 'Apple' ? 'Is it signed out of iCloud?' : 'Is it signed out of your accounts?',
        device.brand === 'Apple' ? 'Find My must be off so the next owner can set it up.' : 'Google and Samsung accounts must be removed so the next owner can set it up.')}
        <div class="options two" role="radiogroup" aria-labelledby="q-icloud">
          ${opt(a.icloudLocked === false, 'data-a="icloud" data-v="no"', 'Yes, signed out', '')}
          ${opt(a.icloudLocked === true, 'data-a="icloud" data-v="yes"', 'No, still locked', '')}</div>`;
    case 'battery':
      return html`${count}${head('Battery health', q.apple ? 'Find it in Settings › Battery › Battery Health.' : 'Enter it if your device shows it. If not, choose Not sure.')}
        <div class="battery">
          <label class="pct"><span class="visually-hidden">Battery health percent</span>
            <input type="number" inputmode="numeric" min="1" max="100" placeholder="90" data-a="battery" value="${a.batteryUnknown ? '' : a.battery}"></label>
          <button type="button" class="chip" aria-pressed="${a.batteryUnknown ? 'true' : 'false'}" data-a="batteryUnknown">Not sure</button>
        </div>`;
    case 'neatness':
      return html`${count}${head('How does it look?', 'Check the screen, back and frame in good light.')}
        <div class="options" role="radiogroup" aria-labelledby="q-neatness">
          ${NEATNESS.map((n, k) => opt(a.neatness === n.key, `data-a="neatness" data-v="${n.key}"`, n.label, n.hint, neatnessIllo(k)))}</div>`;
    case 'network':
      return html`${count}${head('Network', 'How does it work with SIM cards?')}
        <div class="options" role="radiogroup" aria-labelledby="q-network">
          ${NETWORK.map((n) => opt(a.network === n.key, `data-a="network" data-v="${n.key}"`, n.label, n.hint))}</div>`;
    case 'faults':
      return html`${count}${head('Anything not working?', 'Tick everything that applies.')}
        <div class="options" role="group" aria-labelledby="q-faults">
          ${q.faults.map((f) => html`<button type="button" class="opt" role="checkbox" aria-checked="${a.faults.includes(f.key) ? 'true' : 'false'}" data-a="fault" data-v="${f.key}">
            <span class="opt-main">${f.label}<span class="opt-sub">${f.hint}</span></span><span class="check box" aria-hidden="true"></span></button>`)}
          <button type="button" class="opt" role="checkbox" aria-checked="${a.faultsDone && !a.faults.length ? 'true' : 'false'}" data-a="allGood">
            <span class="opt-main">Everything works</span><span class="check box" aria-hidden="true"></span></button>
        </div>`;
    default: return '';
  }
}

// ---------- render ----------

export function renderSwap(main, app) {
  const s = app.swap;
  const { catalog } = app;
  const tradeable = listRows(catalog, 'trade-in');
  const targets = [...dealRows(catalog), ...listRows(catalog, 'prices').filter((d) => CONFIG.swapTypes.includes(d.type))];

  // ?device=id from the Trade-In Values list
  if (app.route.device) {
    const d = catalog.byId.get(app.route.device);
    if (d && d.id !== s.deviceId) { s.deviceId = d.id; s.answers = freshAnswers(); s.phase = 'questions'; s.qi = 0; }
    s.home = false;
    app.route.device = '';
    history.replaceState(null, '', './');
    saveSwap(s);
  }
  if (s.deviceId && !catalog.byId.get(s.deviceId)) { s.deviceId = ''; s.phase = 'pick'; }

  if (s.home && !s.deviceId && !s.compare.length) {
    renderHome(main, app);
    return;
  }

  const device = catalog.byId.get(s.deviceId) || null;
  const qs = device ? questionsFor(device) : [];
  const a = s.answers;
  const allAnswered = device && qs.every((q) => answered(q, a));
  if (device && s.phase === 'done' && !allAnswered && a.icloudLocked !== true) s.phase = 'questions';
  const result = device ? valueDevice(device, engineAnswers(a, device), catalog.settings) : null;
  const done = device && s.phase === 'done';
  const accepted = result?.accepted;

  main.innerHTML = html`
    <div class="wrap flow">
      <div class="step-h page-title" style="margin:0.75rem 0 1.25rem"><h1 class="large-title">${done ? 'Your swap' : 'Value my device'}</h1>
        ${device || s.compare.length ? html`<button class="link-btn" type="button" data-act="reset">Start over</button>` : ''}</div>
      <div class="flow-grid${device ? ' has-result' : ''}" id="flow">
        <section class="card card-pad" style="grid-area:dev" aria-labelledby="h-dev" id="sec-dev"></section>
        ${device ? html`<section class="card" style="grid-area:q" aria-labelledby="h-q" id="sec-q"></section>` : ''}
        ${device ? html`<aside class="aside" style="grid-area:val" id="sec-val" aria-live="polite"></aside>` : ''}
        ${done || s.compare.length ? html`<section style="grid-area:cmp" aria-labelledby="h-cmp" id="sec-cmp"></section>` : ''}
        ${done && accepted ? html`<section class="card card-pad" style="grid-area:fin" aria-labelledby="h-fin" id="sec-fin"></section>` : ''}
      </div>
    </div>`.toString();

  drawDevice();
  if (device) { drawQuestions(); drawValue(); }
  if ($('#sec-cmp', main)) drawCompare();
  if ($('#sec-fin', main)) drawFinish();

  // ---- 1. their device ----
  function drawDevice() {
    const sec = $('#sec-dev', main);
    if (device && s.phase !== 'pick') {
      sec.innerHTML = html`
        <div class="step-h"><h2 class="title-3 step-title" id="h-dev"><span class="step-n">1</span>Your device</h2>
          <button class="link-btn" type="button" data-act="change">Change</button></div>
        <div class="picked"><span class="dev-ico">${raw(ICON[device.type] || ICON.Phones)}</span>
          <span><span class="headline">${device.model}</span><br><span class="sub">${variantName(device)}</span></span></div>`.toString();
      return;
    }
    sec.innerHTML = html`
      <div class="step-h"><h2 class="title-3 step-title" id="h-dev"><span class="step-n">1</span>Which device are you trading in?</h2></div>
      <div id="picker"></div>
      <div class="btn-row" style="margin-top:1rem">
        <button class="btn primary" type="button" data-act="continue" ${device ? '' : 'disabled'}>Continue</button></div>`.toString();
    mountPicker($('#picker', sec), {
      devices: tradeable, catalog, mode: 'single', state: s.pick,
      figure: (d) => `Up to ${naira(d.tradeInValue)}`,
      isSelected: (id) => id === s.deviceId,
      onPick(id) {
        if (id !== s.deviceId) { s.deviceId = id; s.answers = freshAnswers(); s.qi = 0; }
        saveSwap(s);
        $('[data-act="continue"]', sec).disabled = false;
      },
    });
  }

  // ---- 2. condition ----
  function drawQuestions() {
    const sec = $('#sec-q', main);
    if (done) {
      sec.innerHTML = html`<div class="card-pad">
        <div class="step-h"><h2 class="title-3 step-title" id="h-q"><span class="step-n">2</span>Condition</h2>
          <button class="link-btn" type="button" data-act="edit">Edit answers</button></div>
        <p class="sub" style="margin:0">${a.icloudLocked ? 'iCloud or account locked' : answersText(engineAnswers(a, device))}</p></div>`.toString();
      return;
    }
    if (a.icloudLocked === true) s.qi = 0;
    const qi = Math.min(s.qi, qs.length - 1);
    const q = qs[qi];
    const ok = answered(q, a);
    const allAnswered = qs.every((x) => answered(x, a));
    sec.innerHTML = html`
      <div class="card-pad" style="padding-bottom:0.25rem"><div class="step-h" style="margin:0"><h2 class="title-3 step-title" id="h-q"><span class="step-n">2</span>Condition</h2></div></div>
      <div class="progress" aria-hidden="true"><i style="transform:scaleX(${(qs.filter((x) => answered(x, a)).length) / qs.length})"></i></div>
      <div class="questions stepped">
        ${qs.map((x, i) => html`<div class="q${i === qi ? ' current' : ''}" data-q="${i}">${raw(questionHTML(x, a, device, i, qs.length).toString())}</div>`)}
      </div>
      <div class="q-nav stepper">
        <button class="btn" type="button" data-act="prev" ${qi === 0 ? 'disabled' : ''}>Back</button>
        ${qi < qs.length - 1
          ? html`<button class="btn primary" type="button" data-act="next" ${ok && a.icloudLocked !== true ? '' : 'disabled'}>Next</button>`
          : html`<button class="btn primary" type="button" data-act="finish" ${allAnswered ? '' : 'disabled'}>See my value</button>`}
      </div>
      <div class="q-nav desk-only">
        <button class="btn primary" type="button" data-act="finish" ${allAnswered ? '' : 'disabled'}>${allAnswered ? 'See swap options' : 'Answer every question to continue'}</button>
      </div>`.toString();
  }

  // ---- 3. value ----
  function drawValue() {
    const sec = $('#sec-val', main);
    if (!result.accepted) {
      sec.innerHTML = html`<div class="stop"><p class="title-3">We can’t value this one yet</p><p style="margin:0">${result.reason}</p>
        ${a.icloudLocked ? html`<p style="margin:0.75rem 0 0"><button class="btn small" type="button" data-act="unlocked">It’s signed out now</button></p>` : ''}</div>`.toString();
      return;
    }
    const total = result.lines.reduce((x, l) => x + (l.amount || 0), 0);
    const prev = $('.hero-num', sec)?.dataset.value;
    sec.innerHTML = html`
      <div class="card value-card">
        <p class="eyebrow">${done ? 'Your trade-in value' : 'Trade-in value so far'}</p>
        <p class="hero-num" data-value="${prev || result.value}">${naira(prev || result.value)}</p>
        <p class="caption">Estimated. Confirmed when we check your device in store, and slightly negotiable.</p>
        <ul class="lines">
          <li><span>Starting value, good condition</span><span>${naira(result.start)}</span></li>
          ${result.lines.map((l) => html`<li class="${l.amount === null ? 'pending' : 'minus'}"><span>${l.label}</span><span>${l.amount === null ? 'Checked in store' : `− ${naira(l.amount)}`}</span></li>`)}
          ${result.lines.length ? html`<li class="total"><span>Trade-in value</span><span>${naira(result.value)}</span></li>` : ''}
        </ul>
        ${result.pending ? html`<p class="caption" style="margin-top:0.75rem">${result.pending === 1 ? 'One item is' : `${result.pending} items are`} priced when we check the device.</p>` : ''}
        ${!total && !result.pending && !result.lines.length ? '' : ''}
      </div>`.toString();
    animateNumber($('.hero-num', sec), result.value, naira);
  }

  // ---- 4. compare ----
  function drawCompare() {
    const sec = $('#sec-cmp', main);
    const max = app.maxCompare();
    const tv = accepted ? result.value : null;
    const items = s.compare.map((id) => catalog.byId.get(id) || { id, gone: true });
    const live = items.filter((d) => !d.gone).sort(compareOrder(catalog.modelOrder));
    const gone = items.filter((d) => d.gone);
    const card = (d) => {
      if (d.gone) {
        return html`<article class="card cmp gone" data-id="${d.id}"><p class="row-title">No longer available</p>
          <p class="sub">This device has sold or been removed.</p>
          <button class="remove" type="button" aria-label="Remove" data-remove="${d.id}">${raw(ICON.x)}</button></article>`;
      }
      const t = tv === null ? null : swapTerms(d, tv);
      return html`<article class="card cmp ${t ? t.kind : ''}" data-id="${d.id}">
        <p class="row-title">${d.model}</p>
        <p class="sub" style="margin:0">${d.condition === 'Deal' ? [d.storage, d.dealNote].filter(Boolean).join(' · ') : variantName(d)}</p>
        ${d.condition === 'Deal' ? raw('<p style="margin:0.25rem 0 0"><span class="tag">One unit</span></p>') : ''}
        <p class="price" style="margin:0.25rem 0 0">Price ${naira(d.price)}</p>
        <div class="topup">
          <p class="topup-label" style="margin:0">${t ? termsLabel(t) : 'Price'}</p>
          <p class="topup-num" style="margin:0">${t ? (t.kind === 'even' ? naira(0) : naira(t.amount)) : naira(d.price)}</p>
        </div>
        <button class="remove" type="button" aria-label="Remove ${d.model} ${variantName(d)}" data-remove="${d.id}">${raw(ICON.x)}</button>
      </article>`;
    };
    sec.innerHTML = html`
      <div class="section-head"><h2 class="title-3 step-title" id="h-cmp"><span class="step-n">3</span>Compare swaps</h2>
        <span class="sub">${s.compare.length} of ${max}</span></div>
      ${tv === null ? html`<p class="note warn" style="margin:0 0 0.75rem">${device ? 'Finish the questions to see what each swap costs.' : 'Add your device to see what each swap costs.'}</p>` : ''}
      <div class="compare-grid">
        ${live.map(card)}${gone.map(card)}
        ${s.compare.length < max ? html`<button type="button" class="cmp-add" data-act="add"><span>${raw(ICON.plus)}${s.compare.length ? 'Add another device' : 'Add a device to swap into'}</span></button>` : ''}
      </div>
      ${!device ? html`<p style="margin-top:1rem"><button class="btn primary" type="button" data-act="start">Value my device</button></p>` : ''}`.toString();
  }

  // ---- 5. complete ----
  function drawFinish() {
    const sec = $('#sec-fin', main);
    const city = CITIES.find((c) => c.key === s.city);
    sec.innerHTML = html`
      <div class="step-h"><h2 class="title-3 step-title" id="h-fin"><span class="step-n">4</span>Complete your swap</h2></div>
      <p class="q-help" id="city-q">Where will you swap?</p>
      <div class="cities" role="radiogroup" aria-labelledby="city-q">
        ${CITIES.map((c) => html`<button type="button" class="chip" role="radio" aria-checked="${c.key === s.city ? 'true' : 'false'}" aria-pressed="${c.key === s.city ? 'true' : 'false'}" data-city="${c.key}">${c.name}</button>`)}
      </div>
      ${city ? html`<p class="city-text fade-in">${city.text}</p>` : html`<p class="city-text caption">Pick a city to see how the swap works there.</p>`}
      <div class="btn-row">
        <button class="btn primary" type="button" data-act="whatsapp" ${city ? '' : 'disabled'}>${raw(ICON.whatsapp)} Send to SwapDesk on WhatsApp</button>
        <button class="btn" type="button" data-act="save">${raw(ICON.link)} Save & share quote</button>
      </div>
      <p class="caption" style="margin-top:0.75rem">We’ll see every device you compared from the quote link. Quotes are valid for ${CONFIG.quoteValidDays} days.</p>`.toString();
  }

  // ---------- events ----------
  function rerender(keepScroll = true) {
    saveSwap(s);
    const y = window.scrollY;
    renderSwap(main, app);
    if (keepScroll) window.scrollTo({ top: y });
  }

  function setAnswer(fn) {
    fn(a);
    s.saved = null;
    saveSwap(s);
    const r2 = valueDevice(device, engineAnswers(a, device), catalog.settings);
    Object.assign(result, r2);
    drawQuestions();
    drawValue();
    if ($('#sec-cmp', main)) drawCompare();
  }

  main.onclick = (e) => {
    const t = e.target;
    const actEl = t.closest('[data-act]');
    const act = actEl?.dataset.act;
    const ans = t.closest('[data-a]');
    if (ans && ans.tagName === 'BUTTON') {
      haptic();
      const k = ans.dataset.a;
      const v = ans.dataset.v;
      const phone = !matchMedia('(min-width: 960px)').matches;
      setAnswer((x) => {
        if (k === 'icloud') x.icloudLocked = v === 'yes';
        if (k === 'batteryUnknown') { x.batteryUnknown = !x.batteryUnknown; if (x.batteryUnknown) x.battery = ''; }
        if (k === 'neatness') x.neatness = v;
        if (k === 'network') x.network = v;
        if (k === 'fault') {
          x.faults = x.faults.includes(v) ? x.faults.filter((f) => f !== v) : [...x.faults, v];
          x.faultsDone = x.faults.length > 0;
        }
        if (k === 'allGood') { x.faults = []; x.faultsDone = true; }
      });
      // Phones: single-choice answers move straight on to the next question.
      if (phone && ['icloud', 'neatness', 'network'].includes(k) && !(k === 'icloud' && v === 'yes') && s.qi < qs.length - 1) {
        s.qi++;
        saveSwap(s);
        drawQuestions();
        focusQuestion();
      }
      return;
    }
    const cityBtn = t.closest('[data-city]');
    if (cityBtn) { s.city = cityBtn.dataset.city; saveSwap(s); drawFinish(); $(`[data-city="${s.city}"]`, main)?.focus({ preventScroll: true }); return; }
    const rm = t.closest('[data-remove]');
    if (rm) { removeCompare(rm.dataset.remove, rm.closest('.cmp')); return; }

    switch (act) {
      case 'change': s.phase = 'pick'; if (device) s.pick.model = device.model; rerender(); break;
      case 'continue': s.phase = 'questions'; s.qi = 0; rerender(); focusQuestion(); break;
      case 'prev': s.qi = Math.max(0, s.qi - 1); saveSwap(s); drawQuestions(); focusQuestion(); break;
      case 'next': s.qi = Math.min(qs.length - 1, s.qi + 1); saveSwap(s); drawQuestions(); focusQuestion(); break;
      case 'finish': s.phase = 'done'; rerender(false); $('#sec-val', main)?.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' }); break;
      case 'edit': s.phase = 'questions'; s.qi = 0; rerender(); focusQuestion(); break;
      case 'unlocked': setAnswer((x) => { x.icloudLocked = false; }); break;
      case 'add': openAddSheet(actEl); break;
      case 'reset':
        Object.assign(s, { deviceId: '', answers: freshAnswers(), phase: 'pick', qi: 0, compare: [], city: '', saved: null, home: false });
        s.pick.model = ''; s.pick.search = '';
        rerender(false);
        app.toast('Started a new quote');
        break;
      case 'start': s.home = false; s.phase = 'pick'; rerender(false); break;
      case 'save': openSaveSheet(actEl); break;
      case 'whatsapp': sendWhatsApp(actEl); break;
      default:
    }
  };
  main.oninput = (e) => {
    if (e.target.matches('[data-a="battery"]')) {
      const v = e.target.value.replace(/\D/g, '').slice(0, 3);
      a.battery = v;
      a.batteryUnknown = false;
      s.saved = null;
      saveSwap(s);
      Object.assign(result, valueDevice(device, engineAnswers(a, device), catalog.settings));
      drawValue();
      // Update just the controls that depend on the answer, so typing isn't interrupted.
      $('[data-a="batteryUnknown"]', main)?.setAttribute('aria-pressed', 'false');
      const ok = answered(qs[s.qi], a);
      const nx = $('[data-act="next"]', main);
      if (nx) nx.disabled = !ok;
      const all = qs.every((q) => answered(q, a));
      $$('[data-act="finish"]', main).forEach((b) => { b.disabled = !all; });
      const bar = $('.progress i', main);
      if (bar) bar.style.transform = `scaleX(${qs.filter((x) => answered(x, a)).length / qs.length})`;
    }
  };
  main.onkeydown = (e) => {
    if (e.key === 'Enter' && e.target.matches('[data-a="battery"]')) {
      $('[data-act="next"]:not(:disabled), [data-act="finish"]:not(:disabled)', main)?.click();
    }
  };

  function focusQuestion() {
    const cur = $('.q.current', main);
    if (!cur || matchMedia('(min-width: 960px)').matches) return;
    const el = $('input, .opt, .chip', cur);
    el?.focus({ preventScroll: true });
    const top = $('#sec-q', main).getBoundingClientRect().top;
    const barH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sticky-top')) || 60;
    if (top < barH || top > innerHeight * 0.5) window.scrollBy({ top: top - barH - 12, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }

  function removeCompare(id, cardEl) {
    const finish = () => {
      s.compare = s.compare.filter((x) => x !== id);
      s.saved = null;
      saveSwap(s);
      if (!s.compare.length && !done) rerender(); else drawCompare();
      $('.cmp-add', main)?.focus({ preventScroll: true });
    };
    if (cardEl && !reducedMotion() && cardEl.animate) {
      cardEl.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.92)' }],
        { duration: 180, easing: 'cubic-bezier(0.4, 0, 1, 1)' }).onfinish = finish;
    } else finish();
  }

  function openAddSheet(source) {
    openSheet({
      source,
      title: 'Add devices to compare',
      render(body, sheet) {
        const note = document.createElement('p');
        note.className = 'caption';
        const pick = document.createElement('div');
        const foot = document.createElement('div');
        foot.style.cssText = 'position:sticky;bottom:-1.25rem;padding:1rem 0 1.25rem;margin-bottom:-1.25rem;background:linear-gradient(transparent,var(--sheet-bg) 30%)';
        body.append(note, pick, foot);
        const drawFoot = () => {
          note.textContent = `${s.compare.length} of ${app.maxCompare()} selected. Pick as many versions as you like, including deals.`;
          foot.innerHTML = `<button class="btn primary block" type="button">Done</button>`;
          foot.firstChild.onclick = () => sheet.close();
        };
        drawFoot();
        mountPicker(pick, {
          devices: targets, catalog, mode: 'multi', state: s.add,
          figure: (d) => naira(d.price),
          isSelected: (id) => s.compare.includes(id),
          onPick(id) {
            if (s.compare.includes(id)) s.compare = s.compare.filter((x) => x !== id);
            else app.addCompare(id);
            s.saved = null;
            saveSwap(s);
            drawFoot();
          },
        });
      },
      onClose: () => rerender(),
    });
  }

  function currentQuote() {
    const compare = s.compare.map((id) => catalog.byId.get(id)).filter(Boolean)
      .sort(compareOrder(catalog.modelOrder))
      .map((d) => ({ device: d, terms: accepted ? swapTerms(d, result.value) : { kind: 'unavailable', amount: 0 } }));
    return buildQuote({ device, answers: engineAnswers(a, device), result, compare, city: CITIES.find((c) => c.key === s.city)?.name });
  }

  async function ensureSaved(extra = {}) {
    const q = currentQuote();
    const sig = JSON.stringify({ ...q, created: 0, ...extra });
    if (s.saved && s.saved.sig === sig) return { q, ...s.saved };
    const r = await saveQuote(q, extra);
    s.saved = { sig, link: r.link, id: r.id, saved: r.saved };
    saveSwap(s);
    return { q, ...s.saved };
  }

  async function sendWhatsApp(btn) {
    btn.disabled = true;
    const label = btn.innerHTML;
    btn.textContent = 'Preparing your quote…';
    try {
      const { q, link } = await ensureSaved();
      const city = CITIES.find((c) => c.key === s.city)?.name;
      location.href = whatsappURL(whatsappMessage(q, link, city));
    } finally {
      setTimeout(() => { btn.disabled = false; btn.innerHTML = label; }, 800);
    }
  }

  function openSaveSheet(source) {
    openSheet({
      source,
      title: 'Save & share quote',
      render(body) {
        body.innerHTML = html`
          <form class="stack" novalidate>
            <p class="q-help" style="margin:0 0 0.5rem">Get a link to this quote to come back to or send to someone. Your name and number are optional and help us follow up.</p>
            <div class="field"><label for="qn">Name (optional)</label><input id="qn" name="name" autocomplete="name" maxlength="60"></div>
            <div class="field"><label for="qp">Phone (optional)</label><input id="qp" name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="20"></div>
            <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
            <button class="btn primary block" type="submit">Save quote</button>
          </form>`.toString();
        const form = $('form', body);
        form.onsubmit = async (e) => {
          e.preventDefault();
          const btn = $('button[type="submit"]', form);
          btn.disabled = true;
          btn.textContent = 'Saving…';
          const fd = new FormData(form);
          const extra = { name: fd.get('name').trim(), phone: fd.get('phone').trim(), website: fd.get('website') };
          const { q, link } = await ensureSaved(extra);
          showLink(body, q, link);
        };
      },
    });
  }

  function showLink(body, q, link) {
    body.innerHTML = html`
      <p class="title-3" style="margin:0.25rem 0 0">Your quote is saved</p>
      <div class="linkbox"><code>${link}</code></div>
      <div class="stack">
        <button class="btn primary block" type="button" data-s="share">${raw(ICON.share)} Share</button>
        <button class="btn block" type="button" data-s="copy">${raw(ICON.copy)} Copy link</button>
      </div>
      <p class="caption" style="margin-top:0.75rem">Anyone with the link sees these figures. Valid for ${CONFIG.quoteValidDays} days.</p>`.toString();
    body.onclick = async (e) => {
      const k = e.target.closest('[data-s]')?.dataset.s;
      if (k === 'share') {
        const r = await share({ title: 'My SwapDesk quote', text: summaryText(q, ''), url: link });
        if (r === 'copied') app.toast('Quote and link copied');
      }
      if (k === 'copy') { await copy(link); app.toast('Link copied'); }
    };
  }
}

function renderHome(main, app) {
  main.innerHTML = html`
    <div class="wrap">
      <section class="hero">
        <h1 class="large-title">Trade in your device. Swap into something better.</h1>
        <p>See what your phone, iPad, Apple Watch or AirPods are worth, compare what it costs to swap into up to six devices, then finish with us on WhatsApp.</p>
        <div class="entry">
          <a class="card primary" href="./" data-go="value"><strong>Value my device</strong><span>A few questions, a fair figure, line by line.</span></a>
          <a class="card" href="./?view=prices" data-go="prices"><strong>Price List</strong><span>Every device we sell, and today’s deals.</span></a>
          <a class="card" href="./?view=trade-in" data-go="trade-in"><strong>Trade-In Values</strong><span>What we pay for devices in good condition.</span></a>
        </div>
      </section>
      <div class="steps-mini">
        <div class="card"><b>1. Value your device</b><span class="sub">Tell us its battery health, how it looks and anything not working.</span></div>
        <div class="card"><b>2. Compare swaps</b><span class="sub">Line up to six devices and see what you add, or what we pay you.</span></div>
        <div class="card"><b>3. Swap in person</b><span class="sub">Send the quote to us on WhatsApp and complete the swap in your city.</span></div>
      </div>
    </div>`.toString();
  main.onclick = (e) => {
    const go = e.target.closest('[data-go]');
    if (!go || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    if (go.dataset.go === 'value') {
      app.swap.home = false;
      app.swap.phase = 'pick';
      saveSwap(app.swap);
      app.navigate({ view: 'swap' });
    } else app.navigate({ view: go.dataset.go });
  };
  main.oninput = null;
  main.onkeydown = null;
}

export { deviceName };
