// A tiny tween engine written for connect-ai-three. It replaces GSAP (whose licence is not one this kit ships) with
// just the calls this project makes: to(target or [targets], {props, duration, delay, ease, repeat, onUpdate,
// onComplete}), delayedCall(seconds, fn), killTweensOf(target), tween.kill(), tween.pause() and tween.resume(). Eases: none, power1/2/3 .in/.out/.inOut.
const EASE = {
  none: (t) => t,
  in: (p) => (t) => Math.pow(t, p + 1),
  out: (p) => (t) => 1 - Math.pow(1 - t, p + 1),
  inOut: (p) => (t) => (t < 0.5 ? Math.pow(2 * t, p + 1) / 2 : 1 - Math.pow(2 - 2 * t, p + 1) / 2),
}
function easeFn(name = 'power1.out') {
  if (name === 'none' || name === 'linear') return EASE.none
  const m = /^power(\d)\.(in|out|inOut)$/.exec(name)
  return m ? EASE[m[2]](Number(m[1])) : EASE.out(1)
}

const active = new Set()
let ticking = false
function tick(now) {
  for (const tw of [...active]) tw._step(now)
  if (active.size) requestAnimationFrame(tick)
  else ticking = false
}
function add(tw) {
  active.add(tw)
  if (!ticking) { ticking = true; requestAnimationFrame(tick) }
}

const RESERVED = new Set(['duration', 'delay', 'ease', 'repeat', 'onUpdate', 'onComplete', 'overwrite'])

class Tween {
  constructor(targets, vars) {
    this.targets = Array.isArray(targets) ? targets : [targets]
    this.vars = vars
    this.duration = Math.max(0, vars.duration ?? 0.5)
    this.ease = easeFn(vars.ease)
    this.repeat = vars.repeat ?? 0
    this.props = Object.keys(vars).filter((k) => !RESERVED.has(k))
    this.start = performance.now() + (vars.delay ?? 0) * 1000
    this.from = null
    this.dead = false
    add(this)
  }
  _step(now) {
    if (this.dead || now < this.start) return
    if (!this.from) this.from = this.targets.map((t) => Object.fromEntries(this.props.map((p) => [p, t[p]])))
    const d = this.duration * 1000
    let k = d === 0 ? 1 : (now - this.start) / d
    if (k >= 1 && this.repeat === -1) { this.start += d * Math.floor(k); k -= Math.floor(k) }
    const done = k >= 1
    const e = this.ease(Math.min(1, k))
    this.targets.forEach((t, i) => { for (const p of this.props) t[p] = this.from[i][p] + (this.vars[p] - this.from[i][p]) * e })
    this.vars.onUpdate?.()
    if (done) { this.kill(); this.vars.onComplete?.() }
  }
  kill() { this.dead = true; active.delete(this) }
  // pause / resume, like GSAP: the windmill fans stop while a tile drops on them
  pause() { if (!this.dead && this.pausedAt == null) { this.pausedAt = performance.now(); active.delete(this) } return this }
  resume() { if (this.pausedAt != null) { this.start += performance.now() - this.pausedAt; this.pausedAt = null; if (!this.dead) add(this) } return this }
}

const gsap = {
  to: (targets, vars) => new Tween(targets, vars),
  delayedCall: (seconds, fn) => new Tween({}, { duration: 0, delay: seconds, onComplete: fn }),
  killTweensOf(target) {
    for (const tw of [...active]) if (tw.targets.includes(target)) tw.kill()
  },
}
export default gsap
