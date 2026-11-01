// SwapDesk · An Upgrade Brands product
// One pop-up, many screens. Each screen is a function that returns HTML and wires its own events.
import { loadCatalog } from './data.js';
import { CONFIG } from './config.js';
import { spring, reducedMotion } from './ui/motion.js';
import { SCREENS, restoreState, saveState } from './ui/flow.js?v=212';
import { getMe, firstName, showPhone, signOut, syncCodes } from './me.js';
import { whatsappURL } from './quote.js';
import { ICON } from './ui/icons.js';
// The site caches files for 4 hours. Screen modules carry the same ?v= as app.js in index.html, and every import
// of one module must use the same URL (or it loads twice). Bump them all together: grep -rn "?v=" js index.html
import { dealsScreen, dealScreen } from './ui/deals.js?v=212';

SCREENS.deals = dealsScreen;
SCREENS.deal = dealScreen;
// Links always point at the site root, even when a page opens on a path like /deals/… (31 Oct).
if (/^https?:$/.test(location.protocol)) CONFIG.site = `${location.origin}/`;

const body = document.getElementById('body');
const popup = document.getElementById('popup');
// On phones the page itself scrolls (not the pop-up), so the browser's bars can tuck away (Daniel, 31 Oct).
const phone = matchMedia('(max-width: 600px)');
const scroller = () => (phone.matches ? document.scrollingElement : body);

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
  /**
   * The corner buttons. Right: "Hi, Name" (opens the account menu) or "Sign In".
   * Left: Open Quote, or Home while a quote is already open (Daniel, 7 Oct).
   */
  paintChip() {
    const chip = document.getElementById('mechip');
    const oq = document.getElementById('oqchip');
    if (!chip || !oq) return;
    const m = getMe();
    chip.textContent = m ? `Hi, ${firstName(m)}` : 'Sign In';
    chip.setAttribute('aria-haspopup', m ? 'menu' : 'false');
    chip.hidden = false;
    const onQuote = app.screen === 'quote' || app.screen === 'openq';
    oq.textContent = onQuote ? 'Home' : 'Open Quote';
    oq.hidden = false;
  },
};
document.getElementById('mechip')?.addEventListener('click', (e) => {
  e.stopPropagation();
  if (getMe()) toggleMenu(); else app.go('signin');
});
document.getElementById('oqchip')?.addEventListener('click', () => {
  closeMenu();
  if (app.screen === 'quote' || app.screen === 'openq') app.go(getMe() ? 'me' : 'home');
  else app.go('openq');
});

// ---------- the account menu under "Hi, Name" ----------
const menu = document.getElementById('memenu');
function closeMenu() {
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  document.getElementById('mechip')?.setAttribute('aria-expanded', 'false');
}
function toggleMenu() {
  if (!menu) return;
  if (!menu.hidden) { closeMenu(); return; }
  const m = getMe();
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // Same mix as the account page: the three main actions as wide buttons, everything else as tiles (8 Oct).
  const wide = (act, label, cls) => `<button class="btn mm-btn ${cls}" type="button" role="menuitem" data-mm="${act}">${label}</button>`;
  const tile = (act, ico, label) => `<button class="me-tile mm-tile" type="button" role="menuitem" data-mm="${act}">${ico}<span>${label}</span></button>`;
  const USER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1.4-3.6 4.2-5.5 7.5-5.5s6.1 1.9 7.5 5.5"/></svg>';
  menu.innerHTML = `<div class="mm-head"><b>${esc(m.name || '')}</b><span>${esc(showPhone(m.phone))}</span></div>
    <div class="mm-wide">${wide('prices', 'Brand New • UK Used', 'green')}${wide('deals', 'Shop Deals', 'red')}${wide('swap', 'Check My Swap Rate', 'blue')}</div>
    <div class="mm-tiles">${tile('me', USER, 'My Account')}${tile('codes', ICON.copy, 'My Swap Codes')}${tile('devices', ICON.Phones, 'My Devices')}
      ${tile('openq', ICON.search, 'Open a Quote')}${tile('chat', ICON.whatsapp, 'Chat With Us')}${tile('edit', ICON.edit, 'Edit Details')}</div>
    <button class="mm-item danger mm-out" type="button" role="menuitem" data-mm="signout">Sign Out</button>`;
  menu.hidden = false;
  document.getElementById('mechip')?.setAttribute('aria-expanded', 'true');
  menu.querySelector('[data-mm]')?.focus({ preventScroll: true });
}
menu?.addEventListener('click', (e) => {
  const b = e.target.closest('[data-mm]');
  if (!b) return;
  const act = b.dataset.mm;
  closeMenu();
  const m = getMe();
  if (act === 'me') app.go('me');
  else if (act === 'codes' || act === 'devices') app.go('me', { focus: act });
  else if (act === 'swap') SCREENS.startFlow(app, 'swap');
  else if (act === 'trade') app.go('trade-in');
  else if (act === 'prices') app.go('prices');
  else if (act === 'deals') app.go('deals');
  else if (act === 'openq') app.go('openq');
  else if (act === 'edit') app.go('signin', { form: 1 });
  else if (act === 'chat') location.href = whatsappURL(`Hi SwapDesk, this is ${m?.name || ''} (${showPhone(m?.phone || '')}).`);
  else if (act === 'signout') { signOut(); app.paintChip(); toast('Signed out'); app.go('home', {}, { replace: true }); }
});
document.addEventListener('click', (e) => { if (menu && !menu.hidden && !e.target.closest('#memenu')) closeMenu(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

function urlFor(screen, params) {
  const p = new URLSearchParams();
  if (screen === 'prices' || screen === 'trade-in') {
    p.set('view', screen);
    ['type', 'brand', 'cond', 'search'].forEach((k) => params[k] && p.set(k, params[k]));
  }
  // Shop Deals has clean links: /deals, and /deals/iphone-16-pro-max-029 for one deal (31 Oct).
  if (screen === 'deals') return '/deals';
  if (screen === 'deal') return `/deals/${dealSlug(params.id)}`;
  if (screen === 'quote') {
    if (params.id) p.set('q', params.id);
    else if (params.packed) p.set('s', params.packed);
  }
  const qs = p.toString();
  return `./${qs ? `?${qs}` : ''}`;
}
app.urlFor = urlFor;
/** deal-029 → iphone-16-pro-max-029 (the model name is only for people; the number finds the deal). */
function dealSlug(id = '') {
  const d = app.catalog?.byId.get(id);
  const name = (d?.model || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const n = String(id).replace(/^deal-/, '');
  return name ? `${name}-${n}` : n;
}

function fromURL() {
  const path = location.pathname.replace(/\/+$/, '');
  if (path === '/deals') return ['deals', {}];
  const m = path.match(/^\/deals\/(?:.*-)?(\d+)$/);
  if (m) return ['deal', { id: `deal-${m[1]}` }];
  const p = new URLSearchParams(location.search);
  if (p.get('q')) return ['quote', { id: p.get('q') }];
  if (p.get('s')) return ['quote', { packed: p.get('s') }];
  const v = p.get('view');
  if (v === 'prices' || v === 'trade-in') {
    return [v, { type: p.get('type') || '', brand: p.get('brand') || '', cond: p.get('cond') || '', search: p.get('search') || '' }];
  }
  if (v === 'deals') return p.get('deal') ? ['deal', { id: p.get('deal') }] : ['deals', {}];
  if (p.get('device')) return ['device', { id: p.get('device') }];
  return ['home', {}];
}

let current = null;
function show(screen, params, dir, inPlace = false) {
  const fn = SCREENS[screen] || SCREENS.home;
  app.screen = screen;
  app.params = params;
  closeMenu();
  // Shop Deals has its own look: the whole background turns black and red, like opening a separate pop-up.
  document.body.classList.toggle('deals-mode', screen === 'deals' || screen === 'deal');
  const y = scroller().scrollTop;
  const el = document.createElement('div');
  el.className = 'screen';
  // A screen may redirect (return false) after calling app.go itself.
  const ok = fn(el, app, params);
  if (ok === false) return;
  body.replaceChildren(el);
  current = el;
  const lt = el.querySelector('.list-top');
  if (lt) { const m = document.createElement('div'); m.className = 'stick-mark'; m.setAttribute('aria-hidden', 'true'); lt.before(m); }
  popup.classList.remove('scrolled-in');
  if (!document.getElementById('mechip')?.hidden) app.paintChip();
  requestAnimationFrame(markOverflow);
  if (inPlace) { scroller().scrollTop = y; popup.classList.toggle('scrolled-in', body.scrollTop > 2); requestAnimationFrame(markStuck); return; }
  body.scrollTop = 0; scrollTo(0, 0);
  if (dir !== 0 && !reducedMotion() && el.animate) {
    const dx = dir > 0 ? 28 : -28;
    el.animate([{ transform: `translateX(${dx}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }],
      { duration: 280, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
  } else if (dir !== 0 && el.animate) {
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
  }
  const h = el.querySelector('h1, h2');
  if (h && dir !== 0) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  const titles = { prices: 'Shop', deals: 'Shop Deals', deal: 'Shop Deals', 'trade-in': 'Trade-In Values', quote: 'Swap Quote' };
  document.title = titles[screen] ? `${titles[screen]} · SwapDesk` : '@the.swapdesk Trade Ins · Swap, Trade In, Upgrade';
}

// The pinned footer only needs its backing when content scrolls under it.
function markOverflow() {
  const sc = scroller();
  body.classList.toggle('overflowing', sc.scrollHeight > (phone.matches ? innerHeight : sc.clientHeight) + 1);
}
// Desktop: once the list scrolls, the pop-up's header strip takes the pinned bar's colour so nothing shows above it.
// The search/filter bar is see-through until it actually pins to the top, then turns solid (no band mid-page).
function markStuck() {
  const lt = body.querySelector('.list-top');
  const mark = body.querySelector('.stick-mark');
  if (lt && mark) lt.classList.toggle('stuck', mark.getBoundingClientRect().top < lt.getBoundingClientRect().top - 1);
}
body.addEventListener('scroll', () => { popup.classList.toggle('scrolled-in', body.scrollTop > 2); markStuck(); }, { passive: true });
addEventListener('scroll', markStuck, { passive: true });
// The bar behind the logo and corner buttons only shows once the page has scrolled under it.
addEventListener('scroll', () => document.body.classList.toggle('scrolled', phone.matches && scrollY > 8), { passive: true });
new ResizeObserver(markOverflow).observe(body);
new MutationObserver(() => requestAnimationFrame(markOverflow)).observe(body, { childList: true, subtree: true });

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
  const from = phone ? Math.min(h, innerHeight) : 60;
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
      if (['home', 'prices', 'trade-in', 'deals', 'deal'].includes(app.screen)) app.refresh();
    });
    // Signed in: fetch their codes in the background, so My Account opens with everything already there.
    if (getMe() && (app.catalog.features || []).includes('customers')) setTimeout(() => syncCodes().catch(() => {}), 1500);
  } catch (err) {
    console.warn(err);
    body.innerHTML = `<div class="screen"><h2 class="h-title">We couldn’t load prices.</h2>
      <p class="par">Check your connection and try again, or message us on WhatsApp on ${CONFIG.whatsappDisplay}.</p>
      <div class="pills"><button class="pill go" onclick="location.reload()">Try Again</button></div></div>`;
    return;
  }
  // The welcome stays up long enough to read, then the site rises in.
  const wait = 1300 - performance.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  app.paintChip();
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
  // Old ?view=deals links switch to the clean /deals address.
  const here = screen === 'deals' || screen === 'deal' ? urlFor(screen, params) : location.search ? location.href : './';
  history.replaceState({ screen, params, d: 0 }, '', here);
  show(screen, params, 0);
  if (!reducedMotion()) body.firstElementChild?.animate?.([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
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
