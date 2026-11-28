// A small tween engine with the part of the GSAP API this demo uses (to, fromTo, timeline().to().call(), kill,
// overwrite, delay, onUpdate, onComplete, power and back eases). Written for connect-ai-three so the example ships
// without GSAP. It is installed as the global `gsap` the original code calls.
const EASES = {
  none: (t) => t,
  'power1.in': (t) => t * t,
  'power1.out': (t) => 1 - (1 - t) ** 2,
  'power1.inOut': (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  'power2.in': (t) => t ** 3,
  'power2.out': (t) => 1 - (1 - t) ** 3,
  'power2.inOut': (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
};
function ease(name = 'power1.out') {
  if (EASES[name]) return EASES[name];
  const back = /^back\.out(?:\(([\d.]+)\))?$/.exec(name);
  if (back) {
    const s = Number(back[1] ?? 1.70158);
    return (t) => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2;
  }
  return EASES['power1.out'];
}

const RESERVED = new Set(['duration', 'delay', 'ease', 'onUpdate', 'onComplete', 'overwrite']);
const live = new Set();
let ticking = false;
function tick(now) {
  for (const tw of [...live]) tw.step(now);
  ticking = live.size > 0;
  if (ticking) requestAnimationFrame(tick);
}
function wake() {
  if (!ticking) {
    ticking = true;
    requestAnimationFrame(tick);
  }
}

class Tween {
  constructor(target, from, vars) {
    this.target = target;
    this.vars = vars;
    this.keys = Object.keys(vars).filter((k) => !RESERVED.has(k));
    this.from = from;
    this.duration = Math.max(0, (vars.duration ?? 0.5) * 1000);
    this.delay = (vars.delay ?? 0) * 1000;
    this.ease = ease(vars.ease);
    this.done = false;
    this.onEnd = null;
  }
  start() {
    if (this.vars.overwrite) for (const tw of live) if (tw.target === this.target) tw.kill();
    this.t0 = performance.now() + this.delay;
    this.began = false;
    live.add(this);
    wake();
    return this;
  }
  step(now) {
    if (now < this.t0) return;
    if (!this.began) {
      this.began = true;
      this.a = this.keys.map((k) => (this.from && k in this.from ? this.from[k] : this.target[k]));
      this.b = this.keys.map((k) => this.vars[k]);
    }
    const p = this.duration ? Math.min(1, (now - this.t0) / this.duration) : 1;
    const e = this.ease(p);
    this.keys.forEach((k, i) => (this.target[k] = this.a[i] + (this.b[i] - this.a[i]) * e));
    this.vars.onUpdate?.();
    if (p >= 1) {
      live.delete(this);
      this.done = true;
      this.vars.onComplete?.();
      this.onEnd?.();
    }
  }
  kill() {
    live.delete(this);
    this.done = true;
    return this;
  }
}

class Timeline {
  constructor(vars = {}) {
    this.vars = vars;
    this.steps = [];
    this.current = null;
    this.killed = false;
    queueMicrotask(() => this.next());
  }
  to(target, vars) {
    this.steps.push(() => new Tween(target, null, vars));
    return this;
  }
  call(fn) {
    this.steps.push(() => (fn(), null));
    return this;
  }
  next() {
    if (this.killed) return;
    const make = this.steps.shift();
    if (!make) return this.vars.onComplete?.();
    const tw = make();
    if (!tw) return this.next();
    this.current = tw;
    tw.onEnd = () => this.next();
    tw.start();
  }
  kill() {
    this.killed = true;
    this.current?.kill();
    return this;
  }
}

export const gsap = {
  to: (target, vars) => new Tween(target, null, vars).start(),
  fromTo: (target, from, vars) => {
    Object.assign(target, from);
    return new Tween(target, from, vars).start();
  },
  timeline: (vars) => new Timeline(vars),
};
window.gsap = gsap;
