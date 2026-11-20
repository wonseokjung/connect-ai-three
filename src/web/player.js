// Web player: mounts a spec on a page. Same runtime as the video, driven by a clock (or by scroll), plus the
// visitor's pointer. Pauses when off screen, caps the pixel ratio on phones, rebuilds after a lost WebGL context.
export function makePlayer(createStage) {
  return async function mount(spec, el, opts = {}) {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:pan-y;outline:none';
    el.appendChild(canvas);
    const coarse = matchMedia('(pointer: coarse)').matches;
    const dprCap = opts.maxPixelRatio ?? (coarse ? 1.5 : 2);
    // quality steps down by itself when the device cannot keep up (see the frame-time watch in tick)
    let quality = 1;
    const dpr = () => Math.max(0.6, Math.min(window.devicePixelRatio || 1, dprCap) * quality);
    const watch = {n: 0, sum: 0, last: 0, steps: 0};
    const rect = () => ({w: Math.max(2, el.clientWidth), h: Math.max(2, el.clientHeight)});
    const interact = new Set((spec.interact || []).map((i) => (typeof i === 'string' ? i : i.type)));
    const q = new URLSearchParams(location.search);
    const frozen = q.has('t') ? parseFloat(q.get('t')) : null;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let stage = null, raf = 0, playing = true, visible = true, start = performance.now(), held = null, disposed = false;
    const target = {px: 0, py: 0, on: false};
    const live = {pointer: null, parallax: [0, 0], orbit: [0, 0], zoom: 1, clicks: {}};
    let drag = null;

    async function build() {
      const {w, h} = rect();
      stage = await createStage(spec, {canvas, width: w, height: h, pixelRatio: dpr(), mode: 'web', assetBase: opts.assetBase ?? '', kitBase: opts.kitBase ?? 'assets/kit/'});
      stage.setInput(live);
    }
    const duration = () => stage.duration;
    function timeNow() {
      if (frozen != null) return frozen;
      if (held != null) return held;
      if (interact.has('scroll')) {
        // the stage is sticky inside a tall wrapper: progress = how far the wrapper has scrolled past the top.
        // Embedded as a normal block (no tall wrapper), progress = its way through the viewport instead.
        const host = opts.scrollHost || (el.parentElement && el.parentElement.offsetHeight > el.offsetHeight * 1.2 ? el.parentElement : el);
        const r = host.getBoundingClientRect();
        const tall = r.height - window.innerHeight;
        const k = opts.scrollRoot ? opts.scrollRoot() : tall > 40 ? -r.top / tall : (window.innerHeight - r.top) / (r.height + window.innerHeight);
        return Math.min(1, Math.max(0, k)) * (duration() - 1 / stage.fps);
      }
      const t = (performance.now() - start) / 1000;
      const loop = spec.loop ?? 'loop';
      if (loop === 'hold') return Math.min(t, duration() - 1 / stage.fps);
      if (loop === 'pingpong') {
        const k = t % (duration() * 2);
        return k < duration() ? k : duration() * 2 - k;
      }
      return t % duration();
    }
    function tick() {
      raf = 0;
      if (disposed || !stage) return;
      // ease the pointer so the camera never jumps (web only; the video uses a pointer script instead)
      const s = 0.09;
      live.parallax = [live.parallax[0] + ((target.on ? target.px : 0) - live.parallax[0]) * s, live.parallax[1] + ((target.on ? target.py : 0) - live.parallax[1]) * s];
      live.pointer = target.on ? [target.px, target.py] : null;
      const t = timeNow();
      stage.render(t, live);
      // frame-time watch: 45 frames in a row slower than ~30 fps -> render 25 % fewer pixels (at most three times)
      const now = performance.now();
      if (watch.last && now - watch.last < 250) {
        watch.sum += now - watch.last;
        if (++watch.n >= 45) {
          if (watch.sum / watch.n > 30 && watch.steps < 3 && opts.adaptive !== false) {
            quality *= 0.75;
            watch.steps++;
            const {w, h} = rect();
            stage.resize(w, h, dpr());
          }
          watch.n = watch.sum = 0;
        }
      } else watch.n = watch.sum = 0;
      watch.last = now;
      canvas.style.cursor = drag ? 'grabbing' : stage.hovered ? 'pointer' : interact.has('orbit') ? 'grab' : '';
      if (opts.onFrame) opts.onFrame(t, stage);
      if (playing && visible && frozen == null) raf = requestAnimationFrame(tick);
    }
    const kick = () => {
      if (!raf && !disposed) raf = requestAnimationFrame(tick);
    };
    function onMove(e) {
      const r = canvas.getBoundingClientRect();
      target.px = ((e.clientX - r.left) / r.width) * 2 - 1;
      target.py = ((e.clientY - r.top) / r.height) * 2 - 1;
      target.on = true;
      if (drag && interact.has('orbit')) {
        live.orbit = [drag.o[0] + ((e.clientX - drag.x) / r.width) * Math.PI * 1.2, drag.o[1] + ((e.clientY - drag.y) / r.height) * Math.PI * 0.6];
      }
      kick();
    }
    function onDown(e) {
      drag = {x: e.clientX, y: e.clientY, o: live.orbit.slice(), moved: false, t: performance.now()};
      if (interact.has('orbit')) canvas.setPointerCapture?.(e.pointerId);
    }
    function onUp(e) {
      if (drag && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6 && interact.has('click') && stage.hovered) live.clicks[stage.hovered] = stage.time;
      drag = null;
      kick();
    }
    function onLeave() {
      target.on = false;
      drag = null;
    }
    function onWheel(e) {
      if (!interact.has('zoom')) return;
      e.preventDefault();
      live.zoom = Math.min(2.2, Math.max(0.45, live.zoom * (1 + e.deltaY * 0.0012)));
      kick();
    }
    const ro = new ResizeObserver(() => {
      if (!stage) return;
      const {w, h} = rect();
      stage.resize(w, h, dpr());
      kick();
    });
    const io = new IntersectionObserver((es) => {
      visible = es[0].isIntersecting;
      if (visible) kick();
    });
    function onLost(e) {
      e.preventDefault();
      cancelAnimationFrame(raf);
      raf = 0;
    }
    async function onRestored() {
      await build();
      kick();
    }
    await build();
    if (reduce && frozen == null && !interact.has('scroll')) held = spec.poster ?? duration() * 0.6;
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('wheel', onWheel, {passive: false});
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    window.addEventListener('scroll', kick, {passive: true});
    document.addEventListener('visibilitychange', () => {
      visible = !document.hidden;
      if (visible) kick();
    });
    ro.observe(el);
    io.observe(el);
    kick();
    return {
      get stage() {
        return stage;
      },
      get quality() {
        return {pixelRatio: dpr(), steps: watch.steps};
      },
      play() {
        held = null;
        playing = true;
        start = performance.now() - (stage.time || 0) * 1000;
        kick();
      },
      pause() {
        playing = false;
      },
      seek(t) {
        held = t;
        kick();
      },
      dispose() {
        disposed = true;
        cancelAnimationFrame(raf);
        ro.disconnect();
        io.disconnect();
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('scroll', kick);
        stage.dispose();
        canvas.remove();
      },
    };
  };
}
