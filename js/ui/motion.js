// Springs and gestures (Apple "Designing Fluid Interfaces", translated for the web).
// Springs are described by damping ratio (1 = no overshoot) and response (seconds).

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Animate a number with a spring. Interruptible: call stop() to read the live
 * value and velocity, then start a new spring from there.
 */
export function spring({ from, to, velocity = 0, response = 0.4, damping = 1, precision = 0.001, onUpdate, onDone }) {
  const k = (2 * Math.PI / response) ** 2;
  const c = (4 * Math.PI * damping) / response;
  let x = from;
  let v = velocity;
  let last = performance.now();
  let id = 0;
  let done = false;
  const frame = (now) => {
    const dt = Math.min(0.064, (now - last) / 1000);
    last = now;
    const steps = Math.max(1, Math.ceil(dt / 0.004));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const a = -k * (x - to) - c * v;
      v += a * h;
      x += v * h;
    }
    if (Math.abs(v) < precision * 10 && Math.abs(x - to) < precision) {
      x = to; v = 0; done = true;
      onUpdate(x);
      onDone?.();
      return;
    }
    onUpdate(x);
    id = requestAnimationFrame(frame);
  };
  id = requestAnimationFrame(frame);
  return {
    stop() { cancelAnimationFrame(id); return { value: x, velocity: v }; },
    get value() { return x; },
    get velocity() { return v; },
    get done() { return done; },
  };
}

/** Apple's momentum projection: where a flick would come to rest. */
export function project(velocity /* px/s */, decelerationRate = 0.998) {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Progressive resistance past a boundary. */
export function rubberband(overshoot, dimension, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/** Tracks recent pointer positions to give a release velocity in px/s. */
export class VelocityTracker {
  constructor() { this.pts = []; }
  add(y, t = performance.now()) {
    this.pts.push({ y, t });
    while (this.pts.length > 2 && t - this.pts[0].t > 100) this.pts.shift();
  }
  velocity() {
    const p = this.pts;
    if (p.length < 2) return 0;
    const a = p[0];
    const b = p[p.length - 1];
    const dt = (b.t - a.t) / 1000;
    return dt > 0 ? (b.y - a.y) / dt : 0;
  }
}

/** Animate a displayed number (e.g. the trade-in value) to a new figure. */
const running = new WeakMap();
export function animateNumber(el, to, format) {
  const prev = running.get(el);
  if (prev) cancelAnimationFrame(prev);
  const from = Number(el.dataset.value || to);
  el.dataset.value = String(to);
  if (reducedMotion() || from === to) { el.textContent = format(to); return; }
  // Time-based ease-out so the figure always lands exactly on the final value.
  const t0 = performance.now();
  const dur = 650;
  const step = (now) => {
    const t = Math.min(1, (now - t0) / dur);
    const k = 1 - (1 - t) ** 3;
    el.textContent = format(t < 1 ? Math.round((from + (to - from) * k) / 1000) * 1000 : to);
    if (t < 1) running.set(el, requestAnimationFrame(step)); else running.delete(el);
  };
  running.set(el, requestAnimationFrame(step));
}

/** Press feedback on pointer-down for any element marked .press (CSS handles :active too). */
export function haptic(ms = 8) {
  try { navigator.vibrate?.(ms); } catch { /* not supported */ }
}
