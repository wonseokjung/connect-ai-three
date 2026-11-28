// Film any three.js page frame by frame: the page is the stage, the video is what you deliver.
//
// The page runs in the same headless Chrome (Remotion's) that renders the kit's scene.json videos. Once it has loaded
// and warmed up, its clock is frozen: performance.now, Date.now, requestAnimationFrame and new timers only move when we
// step them, by exactly 1/fps. Each step runs the page's frame callbacks once, then we take the picture. A slow page
// takes longer to film but never drops or doubles a frame, so motion is as smooth in the video as the code intends.
// Frames go straight into the kit's ffmpeg: H.264, yuv420p, limited (tv) range, BT.709, like every video the kit makes.
//
// An optional camera path ("film.camera" in example.json, or --orbit) is applied to the page's own camera right before
// each render, so pages with OrbitControls get a slow cinematic move without editing their code.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn, spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {serveExamples, withChromeLock, libraries} from './examples.mjs';
import {chromiumOptions} from './render.mjs';

const ffDir = () => path.dirname(createRequire(import.meta.url).resolve(`@remotion/compositor-${process.platform}-${process.arch}/package.json`));
const ffEnv = () => ({...process.env, DYLD_LIBRARY_PATH: ffDir(), LD_LIBRARY_PATH: ffDir()});
export const ffmpegPath = () => path.join(ffDir(), 'ffmpeg');
export const ffprobePath = () => path.join(ffDir(), 'ffprobe');
export const BT709_OUT = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
  '-bsf:v', 'h264_metadata=video_full_range_flag=0:colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1', '-movflags', '+faststart'];

// the clock the page sees. Runs before any page script.
const CLOCK = `(() => {
  const nRaf = window.requestAnimationFrame.bind(window), nCaf = window.cancelAnimationFrame.bind(window);
  const nST = window.setTimeout.bind(window), nCT = window.clearTimeout.bind(window), nSI = window.setInterval.bind(window), nCI = window.clearInterval.bind(window);
  const nPerf = performance.now.bind(performance), nDate = Date.now;
  let virtual = false, now = 0, dateBase = 0, id = 1e6;
  let raf = new Map(), timers = new Map();
  performance.now = () => (virtual ? now : nPerf());
  Date.now = () => (virtual ? dateBase + now : nDate());
  window.requestAnimationFrame = (cb) => { if (!virtual) return nRaf(cb); const i = ++id; raf.set(i, cb); return i; };
  window.cancelAnimationFrame = (i) => { raf.delete(i); nCaf(i); };
  window.setTimeout = (cb, d = 0, ...a) => { if (!virtual || typeof cb !== 'function') return nST(cb, d, ...a); const i = ++id; timers.set(i, {cb, a, due: now + Math.max(0, +d || 0)}); return i; };
  window.clearTimeout = (i) => { timers.delete(i); nCT(i); };
  window.setInterval = (cb, d = 0, ...a) => { if (!virtual || typeof cb !== 'function') return nSI(cb, d, ...a); const i = ++id; timers.set(i, {cb, a, due: now + Math.max(1, +d || 1), every: Math.max(1, +d || 1)}); return i; };
  window.clearInterval = (i) => { timers.delete(i); nCI(i); };
  const pathHooks = [];
  window.__FILM__ = true; // pages may check this: fixed resolution, no UI, no autoplay audio
  window.__film = {
    start() { if (virtual) return; now = nPerf(); dateBase = nDate() - now; virtual = true; for (const m of document.querySelectorAll('video,audio')) try { m.pause(); } catch {} },
    get now() { return now; },
    onFrame(fn) { pathHooks.push(fn); },
    async step(ms) {
      now += ms;
      for (const [i, t] of [...timers].sort((x, y) => x[1].due - y[1].due)) {
        if (t.due > now || !timers.has(i)) continue;
        if (t.every) t.due += t.every; else timers.delete(i);
        try { t.cb(...t.a); } catch (e) { console.error(e); }
      }
      for (const h of pathHooks) try { h(now); } catch (e) { console.error(e); }
      const q = raf; raf = new Map();
      for (const cb of q.values()) try { cb(now); } catch (e) { console.error(e); }
      // let async renderers (WebGPU) submit, and the compositor present the frame
      await new Promise((r) => nRaf(() => r()));
      return raf.size;
    },
  };
})();`;

// the camera path, installed in the page once EXAMPLE.camera exists. type orbit: turn around the target by "degrees"
// over the clip, "dolly" scales the distance from 1 to that value, "rise" moves the camera up by that many units.
const PATH = (cam, seconds) => {
  const E = window.EXAMPLE;
  if (!E || !E.camera || !E.renderer) return 'no camera';
  const c = E.camera, R = E.renderer;
  const t0 = window.__film.now;
  const target = new c.position.constructor(...(cam.target || (E.target ? [E.target.x, E.target.y, E.target.z] : E.controls && E.controls.target ? [E.controls.target.x, E.controls.target.y, E.controls.target.z] : [0, 0, 0])));
  const start = c.position.clone().sub(target);
  const r0 = Math.hypot(start.x, start.z), a0 = Math.atan2(start.x, start.z), y0 = start.y;
  const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));
  const apply = () => {
    const k = ease((window.__film.now - t0) / (seconds * 1000));
    const a = a0 + ((cam.degrees || 0) * Math.PI / 180) * (k - (cam.centre === false ? 0 : 0.5));
    const d = 1 + ((cam.dolly || 1) - 1) * k;
    c.position.set(target.x + Math.sin(a) * r0 * d, target.y + y0 * d + (cam.rise || 0) * k, target.z + Math.cos(a) * r0 * d);
    c.lookAt(target);
    c.updateMatrixWorld();
  };
  if (E.controls) E.controls.enabled = false;
  for (const fn of ['render', 'renderAsync']) {
    if (typeof R[fn] !== 'function') continue;
    const orig = R[fn].bind(R);
    R[fn] = (s, camera, ...rest) => { if (camera === c) apply(); return orig(s, camera, ...rest); };
  }
  return 'ok';
};

// serve a folder (the user's copy of an example, or a scout result) with the kit's three.js mapped as ../_three/
function serveFolder(dir, port = 4190) {
  const libs = libraries();
  const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml'};
  const root = path.resolve(dir);
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]);
    let f = null;
    for (const [key, lib] of Object.entries(libs)) if (p.startsWith(`/${key}/`)) f = path.resolve(lib.dir, p.slice(key.length + 2));
    if (!f) f = path.resolve(root, '.' + (p.startsWith('/site/') ? p.slice(5) : p));
    const okRoot = [root, ...Object.values(libs).map((l) => l.dir)].some((r) => f === r || f.startsWith(r + path.sep));
    if (okRoot && fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!okRoot || !fs.existsSync(f)) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, {'content-type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-cache'});
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once('error', (e) => (e.code === 'EADDRINUSE' && port < 4209 ? resolve(serveFolder(dir, port + 1)) : reject(e)));
    server.listen(port, '127.0.0.1', () => resolve({server, url: `http://127.0.0.1:${port}/site/`}));
  });
}

// film an example (from listExamples) or a folder. Returns {file, frames, seconds, width, height, errors, check}.
export async function filmPage(target, opts = {}) {
  return withChromeLock(() => filmNow(target, opts));
}
async function filmNow(target, {out, fps = 30, seconds, width, height, short = false, k4 = false, wait, camera, still, crf = 18, onProgress} = {}) {
  const film = {...(target.capture ? {wait: target.capture.wait} : {}), ...(target.film || {})};
  const W = width || (short ? 1080 : 1920), H = height || (short ? 1920 : 1080), scale = k4 ? 2 : 1;
  const secs = seconds || film.seconds || 8;
  const cam = camera === false ? null : camera || (short && film.shortCamera) || film.camera || null;
  const n = Math.round(secs * fps);
  const {openBrowser} = await import('@remotion/renderer');
  const served = target.dir && target.section != null ? await serveExamples(4180).then((s) => ({...s, page: `${s.url}/examples/${path.basename(target.dir)}/`})) : await serveFolder(target.dir).then((s) => ({...s, page: s.url}));
  const query = short && film.shortQuery ? film.shortQuery : film.query || '';
  const errors = [];
  fs.mkdirSync(path.dirname(path.resolve(out)), {recursive: true});
  const browser = await openBrowser('chrome', {chromiumOptions: {...chromiumOptions, gl: chromiumOptions.gl || 'angle'}, viewport: {width: W, height: H, deviceScaleFactor: scale}, logLevel: 'error'});
  let ff = null;
  try {
    const page = await browser.newPage({context: () => null, logLevel: 'error', indent: false, pageIndex: 0, onBrowserLog: (l) => l.type === 'error' && errors.push(l.text), onLog: () => {}});
    await page.evaluateOnNewDocument(CLOCK);
    await page.evaluateOnNewDocument(() => {
      window.__errs = [];
      addEventListener('error', (e) => window.__errs.push(String(e.message || e)));
    });
    const cdp = page._client();
    await cdp.send('Emulation.setDeviceMetricsOverride', {width: W, height: H, deviceScaleFactor: scale, mobile: false});
    await page.goto({url: served.page + query, timeout: 120000});
    const t0 = Date.now();
    while (Date.now() - t0 < 90000 && !(await page.evaluate(() => !!(window.EXAMPLE && window.EXAMPLE.ready)))) await new Promise((r) => setTimeout(r, 250));
    if (film.hide && film.hide.length) await page.evaluate((sel) => { const st = document.createElement('style'); st.textContent = sel.join(',') + '{display:none !important}'; document.head.appendChild(st); }, film.hide);
    for (const k of film.keys || []) for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', {type, key: k === 'Space' ? ' ' : k, code: k.length === 1 ? 'Key' + k.toUpperCase() : k, windowsVirtualKeyCode: k === 'Space' ? 32 : k.toUpperCase().charCodeAt(0)});
    if (film.click) for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', {type, x: film.click[0] * W, y: film.click[1] * H, button: 'left', clickCount: 1});
    // warm up in real time (models load, shaders compile, a game gets going), then freeze the clock
    await new Promise((r) => setTimeout(r, (wait ?? film.wait ?? 4) * 1000));
    await page.evaluate(() => window.__film.start());
    // skip ahead in virtual time without taking pictures (a film page that should start at its best shot)
    for (let i = 0, m = Math.round((film.startAt || 0) * fps); i < m; i++) await page.evaluate((ms) => window.__film.step(ms), 1000 / fps);
    if (cam) errors.push(...[await page.evaluate(`(${PATH.toString()})(${JSON.stringify(cam)}, ${secs})`)].filter((x) => x !== 'ok').map((x) => `camera path: ${x}`));
    ff = spawn(ffmpegPath(), ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
      '-vf', `scale=${W * scale}:${H * scale}:flags=lanczos:out_color_matrix=bt709:out_range=tv,format=yuv420p`, '-r', String(fps), '-crf', String(crf), '-preset', 'medium', ...BT709_OUT, '-an', path.resolve(out)], {env: ffEnv(), stdio: ['pipe', 'ignore', 'pipe']});
    let ffErr = '';
    ff.stderr.on('data', (d) => (ffErr += d));
    const done = new Promise((r) => ff.on('close', r));
    const stillAt = Math.round((still ?? film.still ?? secs / 2) * fps);
    let stillJpg = null;
    for (let i = 0; i < n; i++) {
      if (i > 0) await page.evaluate((ms) => window.__film.step(ms), 1000 / fps);
      else await page.evaluate(() => window.__film.step(0));
      const shot = await cdp.send('Page.captureScreenshot', {format: 'jpeg', quality: 95, captureBeyondViewport: false});
      const buf = Buffer.from((shot.value || shot).data, 'base64');
      if (i === stillAt) stillJpg = buf;
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      if (onProgress && i % fps === 0) onProgress(i, n);
    }
    ff.stdin.end();
    const code = await done;
    if (code !== 0) throw new Error(`ffmpeg: ${ffErr.slice(-500)}`);
    errors.push(...(await page.evaluate(() => window.__errs || [])));
    const file = path.resolve(out);
    if (stillJpg) fs.writeFileSync(file.replace(/\.mp4$/i, '') + '.jpg', stillJpg);
    return {file, frames: n, fps, seconds: secs, width: W * scale, height: H * scale, errors: [...new Set(errors)].filter((e) => !/favicon/.test(e)), check: checkVideo(file, {frames: n, fps, width: W * scale, height: H * scale})};
  } finally {
    if (ff && ff.exitCode == null) ff.stdin.end();
    await browser.close({silent: true}).catch(() => {});
    served.server.close();
  }
}

// the self-check for a filmed page: frame count, length, size, colour tags, no black or frozen stretches
export function checkVideo(file, want = {}) {
  const probe = spawnSync(ffprobePath(), ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,nb_read_frames,r_frame_rate,pix_fmt,color_range,color_space,color_transfer,color_primaries:format=duration', '-of', 'json', file], {env: ffEnv()});
  const j = JSON.parse(String(probe.stdout || '{}'));
  const s = (j.streams || [])[0] || {};
  const problems = [];
  const tags = {pix_fmt: s.pix_fmt, color_range: s.color_range, color_space: s.color_space, color_transfer: s.color_transfer, color_primaries: s.color_primaries};
  if (s.pix_fmt !== 'yuv420p' || s.color_range !== 'tv' || s.color_space !== 'bt709' || s.color_transfer !== 'bt709' || s.color_primaries !== 'bt709') problems.push(`colour tags ${JSON.stringify(tags)}`);
  if (want.frames && Number(s.nb_read_frames) !== want.frames) problems.push(`${s.nb_read_frames} frames, expected ${want.frames}`);
  if (want.width && (s.width !== want.width || s.height !== want.height)) problems.push(`${s.width}x${s.height}, expected ${want.width}x${want.height}`);
  // tiny grey thumbnails of every frame: black frames and frames identical to the one before
  const tw = 32, th = 18;
  const raw = spawnSync(ffmpegPath(), ['-v', 'error', '-i', file, '-vf', `scale=${tw}:${th},format=gray`, '-f', 'rawvideo', '-'], {env: ffEnv(), maxBuffer: 1 << 28}).stdout || Buffer.alloc(0);
  const count = Math.floor(raw.length / (tw * th));
  let black = 0, frozen = 0;
  for (let i = 0; i < count; i++) {
    const f = raw.subarray(i * tw * th, (i + 1) * tw * th);
    const mean = f.reduce((a, b) => a + b, 0) / f.length;
    if (mean < 6) black++;
    if (i > 0) {
      const p = raw.subarray((i - 1) * tw * th, i * tw * th);
      let d = 0;
      for (let k = 0; k < f.length; k++) d += Math.abs(f[k] - p[k]);
      if (d / f.length < 0.05) frozen++;
    }
  }
  if (count && black / count > 0.2) problems.push(`${black} of ${count} frames are black`);
  if (count > 1 && frozen / (count - 1) > 0.5) problems.push(`${frozen} of ${count - 1} frames do not move`);
  return {ok: problems.length === 0, problems, frames: Number(s.nb_read_frames), duration: Number((j.format || {}).duration), width: s.width, height: s.height, tags, black, frozen};
}
