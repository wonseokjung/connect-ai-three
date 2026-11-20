// Self-check, node half: spec validation + the probe numbers -> errors (must fix) and advice (worth a look).
import fs from 'node:fs';
import path from 'node:path';
import {names, validateSpec, specNeeds} from '../src/runtime/node-names.mjs';
import {runProbe} from './render.mjs';
import {assetRefs} from './project.mjs';

export const LIMITS = {
  blankInk: 0.004, // under 0.4 % of the frame differs from the background = nothing to see
  callsAdvice: 150, callsPhone: 100,
  trianglesAdvice: 400000, trianglesError: 2500000,
  textureAdvice: 2048, textureError: 4096, // 4096 is the safe ceiling on phones
  textureBytesAdvice: 192 * 1024 * 1024,
  frameMsAdvice: 16.7, frameMsWarn: 33.4,
  labelPx: 20, // at 1080p: smaller is hard to read on a phone
  passesPhone: 3,
};

const overlap = (a, b) => {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return (x * y) / Math.max(1e-9, b.w * b.h);
};

export function validate(raw) {
  return validateSpec(raw, names());
}

export function judge(spec, p, {target = 'both'} = {}) {
  const errors = [], advice = [];
  const E = (id, msg) => errors.push({id, msg});
  const A = (id, msg) => advice.push({id, msg});
  if (p.errors && p.errors.length) {
    for (const e of p.errors) E('build', e);
    return {ok: false, errors, advice, numbers: {}};
  }
  const S = p.samples;
  // 1. blank frames
  const blank = S.filter((s) => s.ink < LIMITS.blankInk);
  if (blank.length === S.length) E('blank', `blank screen: nothing differs from the background in any of ${S.length} sampled frames. Check the camera target, object positions and lights.`);
  else if (blank.length) A('blank', `empty frame at ${blank.map((s) => s.t.toFixed(2) + 's').join(', ')} (fine if things enter later)`);
  const dark = S.filter((s) => s.ink >= LIMITS.blankInk && s.mean < 6 && s.contrast < 6);
  if (dark.length === S.length && spec.background !== 'transparent') A('dark', 'the picture is almost black in every sampled frame: add light or raise exposure');
  const blown = S.filter((s) => s.blown > 0.25);
  if (blown.length) A('blown', `more than a quarter of the frame is pure white at ${blown.map((s) => s.t.toFixed(2) + 's').join(', ')}: lower light intensity, exposure or bloom`);
  // 2. objects: NaN, never in view, face keep-out
  const ids = new Map();
  for (const s of S) for (const b of s.boxes) {
    const r = ids.get(b.id) || {seen: 0, visible: 0, nan: 0, type: b.type, keep: [], shield: b.shield};
    if (b.visible) r.visible++;
    if (b.nan) r.nan++;
    if (b.inView) r.seen++;
    if (b.visible && b.inView && b.rect) for (const k of spec.keepOut || []) {
      const o = overlap(b.rect, k);
      if (o > 0.02) r.keep.push({t: s.t, o});
    }
    ids.set(b.id, r);
  }
  for (const [id, r] of ids) {
    if (r.nan) E(id, `${id}: a position turned into NaN (a divide by zero in a motion?). One NaN can turn the whole frame black with bloom on.`);
    else if (r.visible && !r.seen) E(id, `${id}: never inside the frame. Move it toward the camera target or widen the lens.`);
    if (r.keep.length && !r.shield) E(id, `${id}: covers the keep-out area (a face) at ${[...new Set(r.keep.map((k) => k.t.toFixed(2) + 's'))].slice(0, 4).join(', ')}: up to ${Math.round(Math.max(...r.keep.map((k) => k.o)) * 100)} % of it. Move or shrink the object.`);
  }
  // 3. determinism
  const drift = (p.determinism || []).filter((d) => !d.same);
  if (drift.length) E('determinism', `not a pure function of time: frame at ${drift.map((d) => d.t.toFixed(2) + 's').join(', ')} came out different the second time. The video and the web page would not match.`);
  // 4. leaks
  // three keeps a few shared singletons (the composer's full-screen quad, the area-light lookup textures): they die with
  // the context. What matters is that every context is released and nothing grows from one rebuild to the next.
  const L = p.leak || [];
  const bad = L.find((l) => l.error);
  const grow = L.length > 1 && (L[L.length - 1].geometries > L[0].geometries || L[L.length - 1].textures > L[0].textures);
  const live = L.some((l) => l.live > 0) || p.liveAfter > 0;
  if (bad) E('leak', `rebuilding the scene failed on round ${bad.round}: ${bad.error}`);
  else if (live) E('leak', `WebGL context leak: ${Math.max(p.liveAfter || 0, ...L.map((l) => l.live))} context(s) still alive after dispose. Browsers allow about 16 per page.`);
  else if (grow) E('leak', `GPU memory leak: after building and disposing the scene ${L.length} times, geometries ${L.map((l) => l.geometries).join(' > ')}, textures ${L.map((l) => l.textures).join(' > ')} are still held`);
  // 5. budgets
  const st = p.stats || {};
  const calls = Math.max(...S.map((s) => s.calls)), tris = Math.max(...S.map((s) => s.triangles));
  if (tris > LIMITS.trianglesError) E('triangles', `${tris.toLocaleString('en-US')} triangles per frame: too heavy for a web page (limit ${LIMITS.trianglesError.toLocaleString('en-US')}). Use a lighter model.`);
  else if (tris > LIMITS.trianglesAdvice) A('triangles', `${tris.toLocaleString('en-US')} triangles per frame: fine for video, heavy for phones (aim under ${LIMITS.trianglesAdvice.toLocaleString('en-US')})`);
  if (calls > LIMITS.callsAdvice) A('calls', `${calls} draw calls per frame: merge or instance repeated objects (aim under ${LIMITS.callsAdvice}; phones like under ${LIMITS.callsPhone})`);
  if (st.maxTexture > LIMITS.textureError) E('texture', `a texture is ${st.maxTexture}px on its long side: over ${LIMITS.textureError}px many phones refuse it. Resize it.`);
  else if (st.maxTexture > LIMITS.textureAdvice) A('texture', `a texture is ${st.maxTexture}px on its long side: ${LIMITS.textureAdvice}px is enough for most web scenes`);
  if (st.textureBytes > LIMITS.textureBytesAdvice) A('texture-memory', `textures take about ${Math.round(st.textureBytes / 1048576)} MB of GPU memory`);
  // 6. frame time (web only: video renders frame by frame)
  if (target !== 'video' && p.frameMs) {
    if (p.frameMs.median > LIMITS.frameMsWarn) A('frame-time', `${p.frameMs.median} ms per frame at ${p.size[0]}x${p.size[1]} on this machine: under 30 fps as a live page. Drop a post pass or lower the pixel ratio.`);
    else if (p.frameMs.median > LIMITS.frameMsAdvice) A('frame-time', `${p.frameMs.median} ms per frame at ${p.size[0]}x${p.size[1]} on this machine: under 60 fps as a live page`);
  }
  // 7. phone framing
  if (target !== 'video' && p.phone) {
    if (p.phone.error) A('phone', `phone-size build failed: ${p.phone.error}`);
    else {
      const out = new Map();
      for (const f of p.phone.frames) for (const b of f.boxes) if (b.visible && b.rect && b.inView) {
        const cut = Math.max(0, -b.rect.x) + Math.max(0, b.rect.x + b.rect.w - 1);
        if (cut / b.rect.w > 0.12 && b.rect.w < 3) out.set(b.id, Math.max(out.get(b.id) || 0, cut / b.rect.w));
      }
      for (const [id, k] of out) A('phone', `${id}: about ${Math.round(k * 100)} % of it is cut off on a phone (390x844). Give camera.fitPower a higher value or stack the layout.`);
      if (p.phone.frames.every((f) => f.ink < LIMITS.blankInk)) A('phone', 'blank on a phone-size screen (390x844)');
      if ((st.passes || []).length > LIMITS.passesPhone) A('phone', `${st.passes.length} post passes (${st.passes.join(', ')}): phones run smoother with ${LIMITS.passesPhone} or fewer`);
    }
  }
  // 8. small text
  const k = p.size[1] / 1080;
  const tiny = new Map();
  for (const s of S) for (const l of s.labels || []) if (l.px > 0 && l.px < LIMITS.labelPx * k) tiny.set(l.text, Math.min(tiny.get(l.text) ?? 1e9, l.px));
  for (const [text, px] of tiny) A('text', `"${text}" is only ${px}px tall: hard to read on a phone (aim for ${Math.round(LIMITS.labelPx * k)}px or more)`);
  for (const w of p.warnings || []) A('note', w);
  return {
    ok: errors.length === 0,
    errors, advice,
    numbers: {calls, triangles: tris, textures: st.textures, geometries: st.geometries, programs: st.programs, maxTexture: st.maxTexture, frameMs: p.frameMs, phoneMs: p.phone && p.phone.ms, buildMs: p.buildMs, passes: st.passes, lights: st.lights},
  };
}

export async function check(dir, raw, {target = 'both', samples = 10} = {}) {
  const v = validate(raw);
  if (v.errors.length) return {ok: false, errors: v.errors, advice: v.advice, numbers: {}, probe: null};
  const missing = assetRefs(v.spec).filter((r) => !r.startsWith('kit:') && !fs.existsSync(path.join(dir, r)));
  if (missing.length) return {ok: false, errors: missing.map((m) => ({id: 'file', msg: `file not found: ${m} (put it in ${dir})`})), advice: v.advice, numbers: {}, probe: null};
  const p = await runProbe(dir, raw, {samples});
  const r = judge(v.spec, p, {target});
  r.advice.unshift(...v.advice);
  r.probe = p;
  r.needs = specNeeds(raw);
  return r;
}

export function reportMd(name, r) {
  const n = r.numbers || {};
  const L = [`# ${name}: self-check ${r.ok ? 'PASS' : 'FAIL'}`, ''];
  if (r.errors.length) L.push('## Must fix', ...r.errors.map((e) => `- ${e.msg}`), '');
  if (r.advice.length) L.push('## Worth a look', ...r.advice.map((e) => `- ${e.msg}`), '');
  if (n.calls != null) {
    L.push('## Numbers (measured in headless Chrome on this machine)', '', '| what | value |', '|---|---|');
    L.push(`| draw calls per frame | ${n.calls} |`, `| triangles per frame | ${n.triangles.toLocaleString('en-US')} |`, `| textures / geometries / shader programs | ${n.textures} / ${n.geometries} / ${n.programs} |`, `| largest texture | ${n.maxTexture || 0}px |`);
    if (n.frameMs) L.push(`| frame time at full size | ${n.frameMs.median} ms (worst ${n.frameMs.worst} ms) |`);
    if (n.phoneMs != null) L.push(`| frame time at phone size (390x844 @2x) | ${n.phoneMs} ms |`);
    L.push(`| scene build | ${n.buildMs} ms |`, `| post passes | ${(n.passes || []).join(', ') || 'none'} |`, `| lights | ${n.lights} |`, '');
    L.push('Checked: blank frames, objects in view, NaN, face keep-out, same picture twice (determinism), WebGL leak after dispose, draw calls, triangles, texture size, frame time, phone framing, small text.');
  }
  return L.join('\n') + '\n';
}
