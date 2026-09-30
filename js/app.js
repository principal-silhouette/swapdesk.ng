// SwapDesk · An Upgrade Brands product
// One pop-up, many screens. Each screen is a function that returns HTML and wires its own events.
import { loadCatalog } from './data.js';
import { CONFIG } from './config.js';
import { spring, reducedMotion } from './ui/motion.js';
import { SCREENS, restoreState, saveState } from './ui/flow.js';

const body = document.getElementById('body');
const popup = document.getElementById('popup');

export const app = {
  catalog: null,
  s: restoreState(),
  screen: 'home',
  params: {},
  toast,
  save() { saveState(app.s); },
  /** Move forward to a screen (adds a history entry). */
  go(screen, params = {}, { replace = false } = {}) {
    const url = urlFor(screen, params);
    const d = (history.state?.d || 0) + (replace ? 0 : 1);
    history[replace ? 'replaceState' : 'pushState']({ screen, params, d }, '', url);
    show(screen, params, replace ? 0 : 1);
  },
  back() {
    if ((history.state?.d || 0) > 0) history.back();
    else app.go('home', {}, { replace: true });
  },
  /** Re-draw the current screen in place (answers changed, prices updated). */
  refresh() { show(app.screen, app.params, 0, true); },
};

function urlFor(screen, params) {
  const p = new URLSearchParams();
  if (screen === 'prices' || screen === 'trade-in') {
    p.set('view', screen);
    ['type', 'brand', 'cond', 'search'].forEach((k) => params[k] && p.set(k, params[k]));
  }
  if (screen === 'quote') {
    if (params.id) p.set('q', params.id);
    else if (params.packed) p.set('s', params.packed);
  }
  const qs = p.toString();
  return `./${qs ? `?${qs}` : ''}`;
}
app.urlFor = urlFor;

function fromURL() {
  const p = new URLSearchParams(location.search);
  if (p.get('q')) return ['quote', { id: p.get('q') }];
  if (p.get('s')) return ['quote', { packed: p.get('s') }];
  const v = p.get('view');
  if (v === 'prices' || v === 'trade-in') {
    return [v, { type: p.get('type') || '', brand: p.get('brand') || '', cond: p.get('cond') || '', search: p.get('search') || '' }];
  }
  if (p.get('device')) return ['device', { id: p.get('device') }];
  return ['home', {}];
}

let current = null;
function show(screen, params, dir, inPlace = false) {
  const fn = SCREENS[screen] || SCREENS.home;
  app.screen = screen;
  app.params = params;
  const y = body.scrollTop;
  const el = document.createElement('div');
  el.className = 'screen';
  // A screen may redirect (return false) after calling app.go itself.
  const ok = fn(el, app, params);
  if (ok === false) return;
  body.replaceChildren(el);
  current = el;
  if (inPlace) { body.scrollTop = y; return; }
  body.scrollTop = 0;
  if (dir !== 0 && !reducedMotion() && el.animate) {
    const dx = dir > 0 ? 28 : -28;
    el.animate([{ transform: `translateX(${dx}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }],
      { duration: 280, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
  } else if (dir !== 0 && el.animate) {
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
  }
  const h = el.querySelector('h1, h2');
  if (h && dir !== 0) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  const titles = { prices: 'Price List', 'trade-in': 'Trade-In Values', quote: 'Swap Quote' };
  document.title = titles[screen] ? `${titles[screen]} · SwapDesk` : '@the.swapdesk Trade Ins · Swap, Trade In, Upgrade';
}

window.addEventListener('popstate', (e) => {
  const st = e.state;
  if (st && st.screen) show(st.screen, st.params || {}, -1);
  else { const [sc, pa] = fromURL(); show(sc, pa, -1); }
});
document.addEventListener('click', (e) => {
  const home = e.target.closest('[data-home]');
  if (home && !e.metaKey && !e.ctrlKey) { e.preventDefault(); app.go('home'); }
});

let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

// Opening: the pop-up rises while the background draws in.
function riseIn() {
  const phone = matchMedia('(max-width: 600px)').matches;
  if (reducedMotion()) { document.body.classList.replace('intro', 'ready'); return; }
  const h = popup.offsetHeight;
  const from = phone ? h : 60;
  popup.style.transform = `translate3d(0, ${from}px, 0)`;
  popup.style.opacity = phone ? '1' : '0';
  spring({
    from: 0, to: 1, response: 0.55, damping: 0.86,
    onUpdate: (p) => {
      popup.style.transform = `translate3d(0, ${(1 - p) * from}px, 0)`;
      if (!phone) popup.style.opacity = String(Math.min(1, p * 1.4));
    },
    onDone: () => { popup.style.transform = ''; popup.style.opacity = ''; },
  });
  setTimeout(() => document.body.classList.replace('intro', 'ready'), 2200);
}

async function boot() {
  riseIn();
  try {
    app.catalog = await loadCatalog((fresh) => {
      app.catalog = fresh;
      if (['home', 'prices', 'trade-in'].includes(app.screen)) app.refresh();
    });
  } catch (err) {
    console.warn(err);
    body.innerHTML = `<div class="screen"><h2 class="h-title">We couldn’t load prices.</h2>
      <p class="par">Check your connection and try again, or message us on WhatsApp on ${CONFIG.whatsappDisplay}.</p>
      <div class="pills"><button class="pill go" onclick="location.reload()">Try Again</button></div></div>`;
    return;
  }
  const [screen, params] = fromURL();
  if (screen === 'device') {
    const d = app.catalog.byId.get(params.id);
    history.replaceState({ screen: 'home', params: {}, d: 0 }, '', './');
    if (d) {
      SCREENS.startWith(app, d.id);
      return;
    }
    show('home', {}, 0);
    return;
  }
  history.replaceState({ screen, params, d: 0 }, '', location.search ? location.href : './');
  show(screen, params, 0);
  if (CONFIG.gaId) loadAnalytics(CONFIG.gaId);
}

function loadAnalytics(id) {
  const sc = document.createElement('script');
  sc.async = true;
  sc.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
  document.head.append(sc);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); }; // eslint-disable-line prefer-rest-params
  window.gtag('js', new Date());
  window.gtag('config', id);
}

boot();
