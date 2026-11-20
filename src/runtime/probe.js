// Self-check, browser half: builds the scene, renders sample frames and measures what matters.
// The node half (lib/check.mjs) turns these numbers into PASS / FAIL lines.
import {createStage, LIVE} from './stage.js';
import {normalizeSpec} from './spec.js';

function fnv(data) {
  let h = 2166136261;
  for (let i = 0; i < data.length; i++) {
    h ^= data[i];
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}
// how much of the frame is not background: compare every pixel of a small copy with the corner colour
function inkOf(canvas, small, transparent) {
  const c = small.getContext('2d', {willReadFrequently: true});
  c.clearRect(0, 0, small.width, small.height);
  c.drawImage(canvas, 0, 0, small.width, small.height);
  const d = c.getImageData(0, 0, small.width, small.height).data;
  const n = small.width * small.height;
  let ink = 0, sum = 0, sum2 = 0, bright = 0;
  const bg = [d[0], d[1], d[2]];
  for (let i = 0; i < n; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2], a = d[i * 4 + 3];
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sum += l;
    sum2 += l * l;
    if (l > 250) bright++;
    if (transparent ? a > 10 : Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2]) > 40) ink++;
  }
  const mean = sum / n;
  return {ink: ink / n, mean, contrast: Math.sqrt(Math.max(0, sum2 / n - mean * mean)), blown: bright / n, hash: fnv(d)};
}
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

export async function probe(specIn, opts = {}) {
  const spec = normalizeSpec(specIn);
  const base = {assetBase: opts.assetBase, kitBase: opts.kitBase};
  const W = opts.width ?? spec.size.width, H = opts.height ?? spec.size.height;
  const out = {name: spec.name, size: [W, H], fps: spec.fps, duration: spec.duration, look: spec.look, samples: [], errors: []};
  const transparent = spec.background === 'transparent';
  const small = document.createElement('canvas');
  small.width = 160;
  small.height = Math.round((160 * H) / W);
  const live0 = LIVE.contexts;
  let stage;
  try {
    const t0 = performance.now();
    stage = await createStage(spec, {...base, width: W, height: H, mode: 'video', canvas: opts.canvas});
    out.buildMs = Math.round(performance.now() - t0);
  } catch (e) {
    out.errors.push('build: ' + (e && e.message ? e.message : String(e)));
    return out;
  }
  const gl = stage.renderer.getContext();
  const px = new Uint8Array(4);
  const timed = (t) => {
    const a = performance.now();
    stage.render(t);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); // forces the GPU to finish
    return performance.now() - a;
  };
  timed(0);
  timed(spec.duration / 2); // warm-up: shader compile
  const n = opts.samples ?? 10;
  const last = Math.max(0, spec.duration - 1 / spec.fps);
  const times = Array.from({length: n}, (_, i) => +((last * i) / (n - 1)).toFixed(4));
  for (const t of times) {
    const ms = timed(t);
    const pic = inkOf(stage.canvas, small, transparent);
    const st = stage.stats();
    out.samples.push({t, ms: +ms.toFixed(2), ...pic, calls: st.calls, triangles: st.triangles, boxes: stage.screenBoxes(), labels: stage.labelSizes()});
  }
  // steady frame time: 24 frames in a row around the middle
  const run = [];
  for (let i = 0; i < 24; i++) run.push(timed(spec.duration * 0.4 + i / spec.fps));
  out.frameMs = {median: +median(run).toFixed(2), worst: +Math.max(...run).toFixed(2)};
  // determinism: jump back to earlier times in another order; the picture must be identical
  const again = [times[1], times[n - 2], times[Math.floor(n / 2)]];
  out.determinism = again.map((t) => {
    stage.render(t);
    const h = inkOf(stage.canvas, small, transparent).hash;
    const first = out.samples.find((s) => s.t === t).hash;
    return {t, same: h === first};
  });
  const st = stage.stats();
  out.stats = {...st, textureList: st.textureList};
  out.warnings = stage.warnings.slice();
  out.left = stage.dispose();
  out.liveAfter = LIVE.contexts - live0;

  // phone: portrait 390x844 at 2x. Does the picture still fit, and how fast is a frame?
  if (opts.phone !== false) {
    try {
      const ph = await createStage(spec, {...base, width: 390, height: 844, pixelRatio: 2, mode: 'web', preserve: true, useScript: true});
      const g2 = ph.renderer.getContext();
      ph.render(0);
      ph.render(spec.duration / 2);
      const ms = [];
      const frames = [];
      const sm = document.createElement('canvas');
      sm.width = 78;
      sm.height = 169;
      for (const t of [0, spec.duration * 0.25, spec.duration * 0.5, spec.duration * 0.75, last]) {
        const a = performance.now();
        ph.render(t);
        g2.readPixels(0, 0, 1, 1, g2.RGBA, g2.UNSIGNED_BYTE, px);
        ms.push(performance.now() - a);
        frames.push({t: +t.toFixed(3), ...inkOf(ph.canvas, sm, transparent), boxes: ph.screenBoxes()});
      }
      out.phone = {ms: +median(ms).toFixed(2), frames, calls: ph.stats().calls};
      ph.dispose();
    } catch (e) {
      out.phone = {error: String(e && e.message ? e.message : e)};
    }
  }
  // leak: build and throw away the scene a few times; nothing may stay behind
  out.leak = [];
  for (let i = 0; i < (opts.leakRounds ?? 3); i++) {
    try {
      const s = await createStage(spec, {...base, width: 480, height: 270, mode: 'video'});
      s.render(spec.duration * 0.5);
      const left = s.dispose();
      out.leak.push({round: i + 1, ...left, live: LIVE.contexts - live0});
    } catch (e) {
      out.leak.push({round: i + 1, error: String(e && e.message ? e.message : e)});
    }
  }
  return out;
}
