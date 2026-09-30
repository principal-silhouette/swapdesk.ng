// iOS-style sheet: opens from its source, closes back to it, drag to dismiss on phones.
import { spring, project, rubberband, VelocityTracker, reducedMotion } from './motion.js';
import { $$ } from '../format.js';

const X_ICON = '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
let openCount = 0;

const isPhone = () => matchMedia('(max-width: 719px)').matches;

/**
 * openSheet({ source, title, render(body, api) }) → api { close, body, el, setTitle }
 */
export function openSheet({ source, title, render, onClose, wide = false }) {
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  const el = document.createElement('div');
  el.className = 'sheet';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  const titleId = `sheet-t-${Date.now()}`;
  el.setAttribute('aria-labelledby', titleId);
  el.innerHTML = `
    <div class="sheet-grab" aria-hidden="true"></div>
    <div class="sheet-head"><h2 class="title-3" id="${titleId}"></h2>
      <button class="sheet-close" type="button" aria-label="Close"><span>${X_ICON}</span></button></div>
    <div class="sheet-body"></div>`;
  if (wide) el.style.width = 'min(44rem, calc(100vw - 2rem))';
  el.querySelector('h2').textContent = title || '';
  const body = el.querySelector('.sheet-body');
  document.body.append(scrim, el);
  openCount++;
  document.body.classList.add('sheet-open');
  const restoreFocus = document.activeElement;
  $$('body > :not(.sheet):not(.scrim):not(.toast)').forEach((n) => n.setAttribute('inert', ''));

  const phone = isPhone();
  const reduce = reducedMotion();
  let p = 0; // 0 closed … 1 open
  let anim = null;
  let closing = false;

  // Where the source sits relative to the sheet's resting place (for desktop open/close).
  const origin = () => {
    const s = source?.getBoundingClientRect?.();
    const r = el.getBoundingClientRect();
    if (!s || !s.width) return { dx: 0, dy: 24, sc: 0.96 };
    // Undo the current transform to get the resting rect
    const cur = new DOMMatrixReadOnly(getComputedStyle(el).transform);
    const restX = r.left - cur.m41;
    const restY = r.top - cur.m42;
    const w = r.width / (cur.a || 1);
    const h = r.height / (cur.d || 1);
    const sc = Math.max(0.3, Math.min(0.95, s.width / w));
    return { dx: s.left + s.width / 2 - (restX + w / 2), dy: s.top + s.height / 2 - (restY + h / 2), sc, h };
  };
  let o = null;

  const paint = () => {
    scrim.style.opacity = String(Math.max(0, Math.min(1, p)));
    if (reduce) {
      el.style.opacity = String(Math.max(0, Math.min(1, p)));
      el.style.transform = 'none';
      return;
    }
    if (phone) {
      const h = el.offsetHeight;
      const y = p > 1 ? -rubberband((p - 1) * h, h) : (1 - p) * h;
      el.style.transform = `translate3d(0, ${y}px, 0)`;
      if (source) el.style.transformOrigin = 'center bottom';
    } else {
      o = o || origin();
      const q = Math.max(0, p);
      const s = o.sc + (1 - o.sc) * q;
      el.style.transform = `translate3d(${o.dx * (1 - q)}px, ${o.dy * (1 - q)}px, 0) scale(${s})`;
      el.style.opacity = String(Math.min(1, q * 1.6));
    }
  };

  const to = (target, { velocity = 0, damping = 1, response = phone ? 0.35 : 0.4 } = {}) => {
    let from = p;
    let v = velocity;
    if (anim) { const s = anim.stop(); from = s.value; v = velocity || s.velocity; }
    if (reduce) { response = 0.2; }
    anim = spring({
      from, to: target, velocity: v, response, damping,
      onUpdate: (x) => { p = x; paint(); },
      onDone: () => { if (target === 0 && closing) teardown(); },
    });
  };

  function teardown() {
    scrim.remove();
    el.remove();
    openCount--;
    if (!openCount) {
      document.body.classList.remove('sheet-open');
      $$('[inert]').forEach((n) => n.removeAttribute('inert'));
    }
    document.removeEventListener('keydown', onKey, true);
    (source && document.contains(source) ? source : restoreFocus)?.focus?.({ preventScroll: true });
    onClose?.();
  }

  const api = {
    el, body,
    setTitle(t) { el.querySelector('h2').textContent = t; },
    close(opts) {
      if (closing) return;
      closing = true;
      if (!phone) o = origin();
      to(0, opts);
    },
    get closing() { return closing; },
  };

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); api.close(); }
    if (e.key === 'Tab') {
      const f = $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', el).filter((n) => !n.disabled && n.offsetParent);
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  document.addEventListener('keydown', onKey, true);
  scrim.addEventListener('click', () => api.close());
  el.querySelector('.sheet-close').addEventListener('click', () => api.close());

  // Drag to dismiss (phones): from the grabber or header, 1:1 with the finger.
  if (phone) {
    const handles = [el.querySelector('.sheet-grab'), el.querySelector('.sheet-head')];
    let startY = 0; let startP = 1; let dragging = false; let vt;
    handles.forEach((h) => h.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      dragging = true;
      h.setPointerCapture(e.pointerId);
      if (anim) { const s = anim.stop(); p = s.value; }
      closing = false;
      startY = e.clientY; startP = p;
      vt = new VelocityTracker(); vt.add(e.clientY);
    }));
    handles.forEach((h) => h.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      vt.add(e.clientY);
      const hgt = el.offsetHeight;
      let np = startP - (e.clientY - startY) / hgt;
      if (np > 1) np = 1 + (np - 1); // rubber-band is applied in paint()
      p = np; paint();
    }));
    const end = () => {
      if (!dragging) return;
      dragging = false;
      const v = vt.velocity(); // px/s, positive = downward
      const hgt = el.offsetHeight;
      const restY = (1 - p) * hgt + project(v);
      const flick = Math.abs(v) > 300;
      const pv = -v / hgt; // progress units per second
      if (restY > hgt * 0.5) { closing = true; to(0, { velocity: pv, damping: 1 }); }
      else to(1, { velocity: pv, damping: flick ? 0.8 : 1 });
    };
    handles.forEach((h) => { h.addEventListener('pointerup', end); h.addEventListener('pointercancel', end); });
  }

  render?.(body, api);
  paint();
  requestAnimationFrame(() => {
    to(1);
    const f = body.querySelector('[autofocus], input, button, [href]') || el.querySelector('.sheet-close');
    f?.focus({ preventScroll: true });
  });
  return api;
}
