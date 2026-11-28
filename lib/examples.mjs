// The example gallery: examples/<name>/ are real three.js pages adapted from MIT open source (the official three.js
// examples, teardown, awwwards-3d, spark ...). Each one is an index.html with an import map, plus example.json.
//
// In the kit the import map points at ../_three/ and ../_lib/<x>/, which this server maps to the installed packages,
// so nothing comes from the internet. `example <name> --copy <folder>` writes a copy whose import map points at a
// pinned CDN instead, so the copy runs from any static host.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {KIT} from './paths.mjs';

export const EXAMPLES = path.join(KIT, 'examples');
// a package folder, looked up the way node does (the kit's own node_modules, then the folders above it: npx hoists)
const pkgDir = (name) => {
  for (let d = KIT; ; d = path.dirname(d)) {
    const f = path.join(d, 'node_modules', name);
    if (fs.existsSync(path.join(f, 'package.json'))) return f;
    if (path.dirname(d) === d) throw new Error(`package ${name} is not installed: run npm install in ${KIT}`);
  }
};
const pkgVersion = (name) => JSON.parse(fs.readFileSync(path.join(pkgDir(name), 'package.json'), 'utf8')).version;

// what ../_three/ and ../_lib/<x>/ mean: [local package, CDN for copies]
export function libraries() {
  return {
    _three: {dir: pkgDir('three-latest'), cdn: `https://cdn.jsdelivr.net/npm/three@${pkgVersion('three-latest')}/`},
    '_lib/rapier': {dir: pkgDir('@dimforge/rapier3d-compat'), cdn: `https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@${pkgVersion('@dimforge/rapier3d-compat')}/`},
    '_lib/three-mesh-bvh': {dir: pkgDir('three-mesh-bvh'), cdn: `https://cdn.jsdelivr.net/npm/three-mesh-bvh@${pkgVersion('three-mesh-bvh')}/`},
  };
}

export function listExamples() {
  if (!fs.existsSync(EXAMPLES)) return [];
  return fs
    .readdirSync(EXAMPLES)
    .filter((d) => fs.existsSync(path.join(EXAMPLES, d, 'example.json')))
    .map((d) => ({folder: d, dir: path.join(EXAMPLES, d), ...JSON.parse(fs.readFileSync(path.join(EXAMPLES, d, 'example.json'), 'utf8'))}))
    .sort((a, b) => (a.section ?? 99) - (b.section ?? 99));
}

export function findExample(name) {
  const all = listExamples();
  const n = String(name || '').toLowerCase();
  return all.find((e) => e.folder === n || e.name === n || String(e.section) === n || e.folder.replace(/^\d+-/, '') === n) || null;
}

const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.hdr': 'application/octet-stream', '.exr': 'application/octet-stream', '.ktx2': 'image/ktx2', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.spz': 'application/octet-stream', '.ply': 'application/octet-stream', '.typeface.json': 'application/json', '.ttf': 'font/ttf', '.woff2': 'font/woff2'};

// map a URL path to a file: /examples/_three/... -> the three package, /examples/_lib/x/... -> that package, the rest
// from the kit's examples folder. Nothing outside those roots is ever served.
export function resolveUrl(urlPath) {
  let p = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  if (p === '/' || p === '') p = '/examples/';
  if (!p.startsWith('/examples/')) return null;
  const rest = p.slice('/examples/'.length);
  const libs = libraries();
  for (const [key, lib] of Object.entries(libs)) {
    if (rest === key || rest.startsWith(key + '/')) return inside(lib.dir, rest.slice(key.length + 1));
  }
  return inside(EXAMPLES, rest);
}
function inside(root, rel) {
  const f = path.resolve(root, rel || '.');
  if (f !== root && !f.startsWith(root + path.sep)) return null;
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) return fs.existsSync(path.join(f, 'index.html')) ? path.join(f, 'index.html') : null;
  return fs.existsSync(f) ? f : null;
}

export function serveExamples(port = 4180, host = '127.0.0.1') {
  const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '') {
      res.writeHead(302, {location: '/examples/'});
      return res.end();
    }
    // a folder without a trailing slash: redirect, so relative paths inside the page work
    const clean = req.url.split('?')[0];
    const f = resolveUrl(req.url);
    if (f && !clean.endsWith('/') && f.endsWith('index.html') && !clean.endsWith('.html')) {
      res.writeHead(302, {location: clean + '/'});
      return res.end();
    }
    if (!f) {
      res.writeHead(404, {'content-type': 'text/plain'});
      return res.end('not found');
    }
    const ext = f.endsWith('.typeface.json') ? '.typeface.json' : path.extname(f).toLowerCase();
    res.writeHead(200, {'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-cache'});
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once('error', (e) => {
      if (e.code === 'EADDRINUSE' && port < 4199) resolve(serveExamples(port + 1, host));
      else reject(e);
    });
    server.listen(port, host, () => resolve({server, port, url: `http://${host}:${port}`}));
  });
}

// rewrite the kit-local import map to the pinned CDN, for a copy that runs anywhere
export function cdnHtml(html) {
  const libs = libraries();
  let out = html;
  for (const [key, lib] of Object.entries(libs)) out = out.split(`../${key}/`).join(lib.cdn);
  return out;
}

export function copyExample(ex, dest) {
  const to = path.resolve(dest);
  if (fs.existsSync(to) && fs.readdirSync(to).length) throw new Error(`${to} is not empty: pick a new folder`);
  fs.mkdirSync(to, {recursive: true});
  const skip = new Set(['preview.jpg', 'preview.mp4', 'preview.webp']);
  const walk = (from, into) => {
    for (const n of fs.readdirSync(from)) {
      if (skip.has(n) && from === ex.dir) continue;
      const a = path.join(from, n), b = path.join(into, n);
      if (fs.statSync(a).isDirectory()) {
        fs.mkdirSync(b, {recursive: true});
        walk(a, b);
      } else if (/\.(html|js|mjs)$/.test(n)) fs.writeFileSync(b, cdnHtml(fs.readFileSync(a, 'utf8')));
      else fs.copyFileSync(a, b);
    }
  };
  walk(ex.dir, to);
  return to;
}

// what a well-formed example has (used by the tests and by `examples --check`)
export function exampleProblems(ex) {
  const p = [];
  for (const k of ['name', 'section', 'title', 'titleKo', 'prompt', 'promptKo', 'sources', 'renderer']) if (ex[k] == null || ex[k] === '') p.push(`example.json has no "${k}"`);
  for (const f of ['index.html', 'README.md']) if (!fs.existsSync(path.join(ex.dir, f))) p.push(`no ${f}`);
  for (const s of ex.sources || []) {
    if (!s.name || !s.license) p.push(`a source without name or license`);
    if (s.license && !/^(MIT|Apache-2\.0|CC0-1\.0|OFL-1\.1|Zlib|PD-NASA|own)$/.test(s.license)) p.push(`source "${s.name}" has licence ${s.license}: only MIT, Apache-2.0, Zlib, CC0, OFL (fonts) or own work`);
  }
  const html = fs.existsSync(path.join(ex.dir, 'index.html')) ? fs.readFileSync(path.join(ex.dir, 'index.html'), 'utf8') : '';
  if (/https?:\/\/(?!www\.aicitybuilders\.com|github\.com|www\.youtube\.com|threejs\.org|polyhaven\.com|kenney\.nl|quaternius\.com)[^"'\s)]+\.(js|mjs|wasm|glb|hdr|jpg|png|spz|ply)/.test(html)) p.push('index.html loads a file from the internet: ship it in the folder or map it in the import map');
  return p;
}

// One headless Chrome at a time: the smoke test, the preview capture and the scout's checks all take this lock (a
// folder in the temp dir that holds the owner's pid). A lock whose owner is gone is taken over.
export async function withChromeLock(fn, {wait = 600000} = {}) {
  const os = await import('node:os');
  const lock = path.join(os.tmpdir(), 'connect-ai-three-chrome.lock');
  const t0 = Date.now();
  for (;;) {
    try {
      fs.mkdirSync(lock);
      fs.writeFileSync(path.join(lock, 'pid'), String(process.pid));
      break;
    } catch {
      let owner = 0;
      try { owner = Number(fs.readFileSync(path.join(lock, 'pid'), 'utf8')); } catch {}
      let alive = false;
      if (owner) try { process.kill(owner, 0); alive = true; } catch {}
      if (owner && !alive) { fs.rmSync(lock, {recursive: true, force: true}); continue; }
      if (Date.now() - t0 > wait) throw new Error(`another headless Chrome holds ${lock} (pid ${owner || '?'})`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  try { return await fn(); } finally { fs.rmSync(lock, {recursive: true, force: true}); }
}

// open an example in the headless browser the kit already uses for video (no window), wait until it says it is ready,
// let it run, then read back errors and a grid of pixels. Used by the tests and by `examples --smoke`.
export function smokeExample(ex, opts = {}) {
  return withChromeLock(() => smokeExampleNow(ex, opts));
}
async function smokeExampleNow(ex, {seconds = 4, width = 960, height = 540, timeout = 60000} = {}) {
  const {openBrowser} = await import('@remotion/renderer');
  const {chromiumOptions} = await import('./render.mjs');
  const {server, url} = await serveExamples(4180);
  const logs = [];
  const browser = await openBrowser('chrome', {chromiumOptions: {...chromiumOptions, gl: chromiumOptions.gl || 'angle'}, viewport: {width, height}, logLevel: 'error'});
  try {
    const page = await browser.newPage({context: () => null, logLevel: 'error', indent: false, pageIndex: 0, onBrowserLog: (l) => l.type === 'error' && logs.push(l.text), onLog: () => {}});
    await page.evaluateOnNewDocument(() => {
      window.__errs = [];
      addEventListener('error', (e) => window.__errs.push(String(e.message || e)));
      addEventListener('unhandledrejection', (e) => window.__errs.push(String(e.reason && e.reason.message ? e.reason.message : e.reason)));
    });
    await page.goto({url: `${url}/examples/${path.basename(ex.dir)}/`, timeout});
    const t0 = Date.now();
    let ready = false;
    while (!ready && Date.now() - t0 < timeout) {
      ready = await page.evaluate(() => !!(window.EXAMPLE && window.EXAMPLE.ready));
      if (!ready) await new Promise((r) => setTimeout(r, 250));
    }
    await new Promise((r) => setTimeout(r, seconds * 1000));
    const out = await page.evaluate(() => {
      const E = window.EXAMPLE;
      const r = {errs: window.__errs, kind: null, distinct: 0, calls: 0};
      if (!E || !E.renderer) return r;
      const R = E.renderer;
      if (!R.getContext || !R.getContext().readPixels) return {...r, kind: 'webgpu'};
      R.render(E.scene, E.camera);
      const gl = R.getContext();
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, a = new Uint8Array(4), seen = new Set();
      for (let i = 0; i < 100; i++) {
        gl.readPixels(Math.floor(((i % 10) + 0.5) * w / 10), Math.floor((Math.floor(i / 10) + 0.5) * h / 10), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, a);
        seen.add(`${a[0] >> 3},${a[1] >> 3},${a[2] >> 3}`);
      }
      return {...r, kind: 'webgl', distinct: seen.size, calls: R.info.render.calls};
    });
    return {ready, errors: [...logs, ...out.errs], kind: out.kind, distinct: out.distinct, calls: out.calls};
  } finally {
    await browser.close({silent: true}).catch(() => {});
    server.close();
  }
}
