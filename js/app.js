// SwapDesk · An Upgrade Brands product
import { loadCatalog } from './data.js';
import { $, $$ } from './format.js';
import { CONFIG } from './config.js';
import { renderList } from './ui/lists.js';
import { renderSwap, restoreSwap, saveSwap, freshAnswers } from './ui/swap.js';
import { renderQuote } from './ui/quoteView.js';

const main = $('#main');
const bar = $('#bar');
const barExtra = $('#bar-extra');

export const app = {
  catalog: null,
  swap: restoreSwap(),
  route: {},
  toast,
  navigate,
  url: (r) => routeURL(r),
  maxCompare: () => Number(app.catalog?.settings?.['compare.maxDevices']) || 6,
  addCompare(id) {
    const s = app.swap;
    if (s.compare.includes(id)) return true;
    if (s.compare.length >= app.maxCompare()) {
      toast(`You can compare up to ${app.maxCompare()} devices. Remove one first.`);
      return false;
    }
    s.compare.push(id);
    saveSwap(s);
    return true;
  },
  startWithDevice(id) {
    const s = app.swap;
    if (s.deviceId !== id) {
      s.deviceId = id;
      s.answers = freshAnswers();
      s.phase = 'questions';
      s.qi = 0;
    }
    s.home = false;
    saveSwap(s);
    navigate({ view: 'swap' });
  },
  refresh: () => render(false),
  setBarExtra(node) {
    barExtra.replaceChildren(...(node ? [node] : []));
  },
};

function parseRoute() {
  const p = new URLSearchParams(location.search);
  if (p.get('q')) return { view: 'quote', id: p.get('q') };
  if (p.get('s')) return { view: 'quote', packed: p.get('s') };
  const v = p.get('view');
  if (v === 'prices' || v === 'trade-in') {
    return { view: v, search: p.get('search') || '', type: p.get('type') || '', brand: p.get('brand') || '', cond: p.get('cond') || '' };
  }
  return { view: 'swap', device: p.get('device') || '', add: p.get('add') || '' };
}

export function routeURL(r) {
  const p = new URLSearchParams();
  if (r.view === 'prices' || r.view === 'trade-in') {
    p.set('view', r.view);
    ['type', 'brand', 'cond', 'search'].forEach((k) => r[k] && p.set(k, r[k]));
  }
  if (r.view === 'swap' && r.device) p.set('device', r.device);
  const qs = p.toString();
  return `./${qs ? `?${qs}` : ''}`;
}

function navigate(r, { replace = false, scroll = true } = {}) {
  const url = routeURL(r);
  history[replace ? 'replaceState' : 'pushState'](null, '', url);
  app.route = { ...r };
  render(scroll);
}

function render(scroll = true) {
  const r = app.route;
  $$('.seg a, .brand').forEach((a) => {
    const on = a.dataset.nav === (r.view === 'quote' ? '' : r.view);
    if (a.closest('.seg')) a.toggleAttribute('aria-current', false);
    if (on && a.closest('.seg')) a.setAttribute('aria-current', 'page');
  });
  app.setBarExtra(null);
  if (r.view === 'prices' || r.view === 'trade-in') renderList(main, app);
  else if (r.view === 'quote') renderQuote(main, app);
  else renderSwap(main, app);
  const titles = { prices: 'Price List', 'trade-in': 'Trade-In Values', quote: 'Your swap quote' };
  document.title = titles[r.view] ? `${titles[r.view]} · SwapDesk` : 'SwapDesk · Trade in and swap your phone';
  if (scroll) window.scrollTo({ top: 0 });
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

// Top-bar links navigate in place.
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-nav]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
  e.preventDefault();
  const view = a.dataset.nav;
  if (view === 'swap' && a.classList.contains('brand')) app.swap.home = true;
  navigate({ view });
});
window.addEventListener('popstate', () => { app.route = parseRoute(); render(false); });

// Keep sticky offsets in step with the bar, and fade the scroll edge in once content passes under it.
new ResizeObserver(() => {
  const offset = parseFloat(getComputedStyle(bar).top) || 0;
  document.documentElement.style.setProperty('--sticky-top', `${bar.offsetHeight + offset}px`);
}).observe(bar);
const onScroll = () => bar.style.setProperty('--edge', window.scrollY > 4 ? '1' : '0');
addEventListener('scroll', onScroll, { passive: true });
onScroll();

async function boot() {
  app.route = parseRoute();
  try {
    app.catalog = await loadCatalog((fresh) => {
      app.catalog = fresh;
      toast('Prices updated');
      if (!document.body.classList.contains('sheet-open')) render(false);
    });
  } catch (err) {
    main.innerHTML = `<div class="wrap empty"><p class="title-3">We couldn’t load prices.</p>
      <p>Check your connection and try again, or message us on WhatsApp on ${CONFIG.whatsappDisplay}.</p>
      <p><button class="btn primary small" onclick="location.reload()">Try again</button></p></div>`;
    console.warn(err);
    return;
  }
  render(false);
  if (CONFIG.gaId) loadAnalytics(CONFIG.gaId);
}

function loadAnalytics(id) {
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
  document.head.append(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); }; // eslint-disable-line prefer-rest-params
  window.gtag('js', new Date());
  window.gtag('config', id);
}

boot();
