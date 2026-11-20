// Web side: one self-contained index.html from the spec. esbuild bundles three.js + only the adapters the spec
// uses; small assets are inlined so the page opens by double-click (file://) and can be dropped on any host.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {build} from 'esbuild';
import {KIT, KIT_NAME, VERSION} from './paths.mjs';
import {specNeeds, normalizeSpec} from '../src/runtime/node-names.mjs';
import {assetRefs, materialize, dracoModels, DRACO_FILES} from './project.mjs';

const PLUGIN = {text3d: 'text3d.js', fonts: 'fonts.js', 'fonts-serif': 'fonts-serif.js', gltf: 'gltf.js', svg: 'svg.js', 'jsm-objects': 'jsm-objects.js', 'jsm-geometries': 'jsm-geometries.js', 'post-extra': 'post-extra.js', hdri: 'hdri.js', bvh: 'bvh.js', physics: 'physics.js', ttf: 'ttf.js'};
const MIME = {'.ttf': 'font/ttf', '.otf': 'font/otf', '.glb': 'model/gltf-binary', '.hdr': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.mp4': 'video/mp4', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream'};
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const INLINE_LIMIT = 6 * 1024 * 1024;

function pageHtml(spec, js, {scroll}) {
  const p = spec.page || {};
  const pal = normalizeSpec(spec).palette;
  const words = (t) => String(t || '').split(/\s+/).filter(Boolean).map((w, i) => `<span style="animation-delay:${(0.25 + i * 0.09).toFixed(2)}s">${esc(w)}</span>`).join(' ');
  const hero = p.title || p.kicker || p.sub ? `<div class="hero ${p.align === 'center' ? 'center' : ''}">
  ${p.kicker ? `<p class="kicker">${esc(p.kicker)}</p>` : ''}
  ${p.title ? `<h1>${words(p.title)}</h1>` : ''}
  ${p.sub ? `<p class="sub">${esc(p.sub)}</p>` : ''}
  ${p.cta ? `<a class="cta" href="${esc(p.cta.href || '#')}">${esc(p.cta.label || 'Open')}</a>` : ''}
</div>` : '';
  return `<!doctype html>
<html lang="${esc(p.lang || 'en')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(p.pageTitle || p.title || spec.name || 'scene')}</title>
<meta name="generator" content="${KIT_NAME} ${VERSION}">
<style>
:root{--accent:${pal.accent};--text:${pal.text};--base:${pal.base}}
*{box-sizing:border-box}
html,body{margin:0;min-height:100%;background:var(--base);color:var(--text);font-family:Inter,"Helvetica Neue","Pretendard","Apple SD Gothic Neo",system-ui,sans-serif;font-weight:300;-webkit-font-smoothing:antialiased}
#wrap{position:relative;height:${scroll ? `${Math.max(2, p.scrollLength ?? 3) * 100}vh` : '100vh'};height:${scroll ? `${Math.max(2, p.scrollLength ?? 3) * 100}svh` : '100svh'}}
#stage{position:${scroll ? 'sticky' : 'absolute'};top:0;left:0;width:100%;height:100vh;height:100svh;overflow:hidden}
.hero{position:${scroll ? 'fixed' : 'absolute'};z-index:2;left:clamp(16px,6vw,96px);right:clamp(16px,6vw,96px);bottom:clamp(40px,12vh,140px);pointer-events:none;max-width:44rem}
.hero.center{left:16px;right:16px;margin:0 auto;text-align:center;max-width:56rem}
.kicker{margin:0 0 14px;color:var(--accent);font-size:13px;font-weight:400;letter-spacing:.32em;text-transform:uppercase;opacity:0;animation:fade .8s .1s forwards}
h1{margin:0;font-weight:200;font-size:clamp(34px,6.2vw,84px);line-height:1.04;letter-spacing:-.01em}
h1 span{display:inline-block;opacity:0;filter:blur(10px);transform:translateY(8px);animation:word .7s cubic-bezier(.2,.7,.2,1) forwards}
.sub{margin:18px 0 0;font-size:clamp(15px,1.5vw,19px);line-height:1.5;opacity:0;animation:fade 1s .9s forwards;max-width:36rem}
.hero.center .sub{margin-left:auto;margin-right:auto}
.cta{pointer-events:auto;display:inline-block;margin-top:26px;padding:12px 22px;border:1px solid var(--accent);border-radius:999px;color:var(--text);text-decoration:none;font-size:14px;letter-spacing:.08em;opacity:0;animation:fade 1s 1.2s forwards;transition:background .25s,color .25s}
.cta:hover{background:var(--accent);color:#0a0a0a}
.credit{position:fixed;right:14px;bottom:10px;z-index:2;font-size:11px;letter-spacing:.14em;opacity:.38;color:var(--text);text-decoration:none}
.credit:hover{opacity:.8}
#err{position:fixed;inset:auto 16px 16px 16px;z-index:5;font:13px/1.4 ui-monospace,Menlo,monospace;color:#ffb4a8;white-space:pre-wrap}
@keyframes fade{to{opacity:.86}}
@keyframes word{to{opacity:1;filter:blur(0);transform:none}}
@media (prefers-reduced-motion:reduce){h1 span,.kicker,.sub,.cta{animation-duration:.01s;animation-delay:0s}}
</style>
</head>
<body>
<div id="wrap"><div id="stage"></div></div>
${hero}
${p.credit === false ? '' : `<a class="credit" href="https://github.com/wonseokjung/${KIT_NAME}">${KIT_NAME} · CONNECT AI LAB</a>`}
<div id="err"></div>
<script>${js.replace(/<\/script/g, '<\\/script')}</script>
</body>
</html>
`;
}

export async function buildWeb(dir, spec, {out = path.join(dir, 'out', 'web'), inline = 'auto', minify = true, log = () => {}} = {}) {
  const missing = materialize(dir, spec);
  if (missing.length) throw new Error(`file(s) not found in ${dir}: ${missing.join(', ')}`);
  const needs = specNeeds(spec);
  let serif = false;
  JSON.stringify(spec, (k, v) => {
    if (k === 'font' && v === 'serif') serif = true;
    return v;
  });
  if (serif) needs.push('fonts-serif');
  // assets: inline as data URIs when small (opens from file://), else copy next to the page
  const refs = assetRefs(spec);
  const files = refs.map((r) => ({ref: r, abs: r.startsWith('kit:') ? path.join(dir, 'assets', 'kit', r.slice(4)) : path.join(dir, r)}));
  const total = files.reduce((s, f) => s + fs.statSync(f.abs).size, 0);
  const canInline = !files.some((f) => /\.gltf$/i.test(f.abs)) && total <= INLINE_LIMIT;
  const doInline = inline === true || (inline === 'auto' && canInline);
  let webSpec = JSON.parse(JSON.stringify(spec));
  if (webSpec.env && (webSpec.env === 'hdri' || webSpec.env.type === 'hdri') && !webSpec.env.src) webSpec.env = {...(typeof webSpec.env === 'string' ? {type: 'hdri'} : webSpec.env), src: 'kit:studio_small_08_1k.hdr'};
  fs.mkdirSync(out, {recursive: true});
  const map = new Map();
  for (const f of files) {
    if (doInline) map.set(f.ref, `data:${MIME[path.extname(f.abs).toLowerCase()] || 'application/octet-stream'};base64,${fs.readFileSync(f.abs).toString('base64')}`);
    else {
      const rel = f.ref.startsWith('kit:') ? 'assets/kit/' + f.ref.slice(4) : f.ref;
      const to = path.join(out, rel);
      fs.mkdirSync(path.dirname(to), {recursive: true});
      fs.copyFileSync(f.abs, to);
      if (/\.gltf$/i.test(f.abs)) for (const side of fs.readdirSync(path.dirname(f.abs))) if (/\.(bin|png|jpe?g|webp|ktx2)$/i.test(side)) fs.copyFileSync(path.join(path.dirname(f.abs), side), path.join(path.dirname(to), side));
      map.set(f.ref, rel);
    }
  }
  const swap = (o) => {
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) {
      if ((k === 'src' || k === 'fontFile') && typeof v === 'string' && map.has(v)) o[k] = map.get(v);
      else if (typeof v === 'object') swap(v);
    }
  };
  swap(webSpec);
  // Draco models: give each one its decoder, inlined (one-file page) or copied next to the page
  const draco = dracoModels(dir, spec);
  if (draco.length) {
    const from = path.join(dir, 'assets', 'kit', 'draco');
    const urls = {};
    for (const f of DRACO_FILES.slice(0, 2)) {
      if (doInline) urls[f] = `data:${f.endsWith('.wasm') ? 'application/wasm' : 'text/javascript'};base64,${fs.readFileSync(path.join(from, f)).toString('base64')}`;
      else {
        fs.mkdirSync(path.join(out, 'assets', 'kit', 'draco'), {recursive: true});
        fs.copyFileSync(path.join(from, f), path.join(out, 'assets', 'kit', 'draco', f));
      }
    }
    if (doInline) {
      const give = (o) => {
        if (!o || typeof o !== 'object') return;
        if (o.type === 'gltf') o.draco = urls;
        for (const v of Object.values(o)) if (typeof v === 'object') give(v);
      };
      give(webSpec.objects);
    }
  }
  const imp = (f) => JSON.stringify(path.join(KIT, 'src', f));
  const entry = `import {createStage} from ${imp('runtime/index.js')};
${needs.filter((n) => PLUGIN[n]).map((n) => `import ${imp('plugins/' + PLUGIN[n])};`).join('\n')}
import {makePlayer} from ${imp('web/player.js')};
const SPEC = ${JSON.stringify(webSpec)};
const api = (window.connectAiThree = {spec: SPEC, version: ${JSON.stringify(VERSION)}});
api.ready = makePlayer(createStage)(SPEC, document.getElementById('stage')).then((p) => (api.player = p)).catch((e) => {
  document.getElementById('err').textContent = 'connect-ai-three: ' + (e && e.message ? e.message : e);
  throw e;
});
`;
  const r = await build({stdin: {contents: entry, resolveDir: KIT, loader: 'js'}, bundle: true, format: 'iife', minify, write: false, target: 'es2020', legalComments: 'none', logLevel: 'silent', loader: {'.json': 'json'}});
  const js = r.outputFiles[0].text;
  const scroll = (spec.interact || []).some((i) => (typeof i === 'string' ? i : i.type) === 'scroll');
  const html = pageHtml(webSpec, js, {scroll});
  const file = path.join(out, 'index.html');
  fs.writeFileSync(file, html);
  const info = {file, bytes: Buffer.byteLength(html), jsBytes: Buffer.byteLength(js), assetBytes: total, inlined: doInline, needs};
  log(`  ${path.relative(dir, file)}  ${(info.bytes / 1048576).toFixed(2)} MB (code ${(info.jsBytes / 1048576).toFixed(2)} MB${total ? `, assets ${(total / 1048576).toFixed(2)} MB ${doInline ? 'inlined' : 'copied next to it: serve the folder, file:// cannot load them'}` : ''})`);
  return info;
}

// tiny static server for pages whose assets are not inlined
export function serve(root, port = 4173) {
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let f = path.join(root, u);
    if (!f.startsWith(root)) return res.writeHead(403).end();
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) return res.writeHead(404).end('not found');
    res.writeHead(200, {'content-type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store'});
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((ok) => srv.listen(port, '127.0.0.1', () => ok({srv, url: `http://127.0.0.1:${port}/`})));
}
