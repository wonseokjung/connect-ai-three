// Builds the catalog page (docs/index.html) from rendered clips.
//   node tools/make-docs.mjs --clips <work folder with clips/ and stills/> --demos <folder with demo videos> [--skip-media]
// Needs ffmpeg on PATH (only this build tool does; the kit itself does not).
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {KIT, KIT_NAME, VERSION, readJson} from '../lib/paths.mjs';
import {loadIndex} from '../lib/catalog.mjs';
import {buildWeb} from '../lib/web.mjs';

const argv = process.argv.slice(2);
const opt = (n, d = null) => (argv.indexOf('--' + n) >= 0 ? argv[argv.indexOf('--' + n) + 1] : d);
const clipsDir = opt('clips'), demosDir = opt('demos');
const skip = argv.includes('--skip-media');
const DOCS = path.join(KIT, 'docs');
for (const d of ['clips', 'posters', 'media', 'live']) fs.mkdirSync(path.join(DOCS, d), {recursive: true});
const ff = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], {stdio: ['ignore', 'ignore', 'inherit']});
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

const idx = loadIndex();
const items = [];
for (const it of idx.items) {
  const key = `${it.group}__${it.id}`;
  const src = clipsDir && path.join(clipsDir, 'clips', key + '.mp4');
  const clip = path.join(DOCS, 'clips', key + '.mp4'), poster = path.join(DOCS, 'posters', key + '.jpg');
  if (!skip && src && fs.existsSync(src)) {
    ff(['-i', src, '-an', '-vf', 'scale=640:360:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-crf', '29', '-preset', 'slow', '-movflags', '+faststart', clip]);
    const still = path.join(clipsDir, 'stills', key + '.jpg');
    if (fs.existsSync(still)) ff(['-i', still, '-vf', 'scale=640:360:flags=lanczos', '-q:v', '5', poster]);
    else ff(['-ss', String((it.spec.duration || 4) * 0.62), '-i', src, '-frames:v', '1', '-vf', 'scale=640:360:flags=lanczos', '-q:v', '5', poster]);
  }
  if (!fs.existsSync(clip)) {
    console.log('no clip:', key);
    continue; // the page only lists what really plays
  }
  if (!fs.existsSync(poster)) ff(['-ss', String((it.spec.duration || 4) * 0.62), '-i', clip, '-frames:v', '1', '-q:v', '5', poster]);
  items.push({key, id: it.id, group: it.group, title: it.title, about: it.about, prompt: it.prompt, source: it.source, license: it.license, param: it.param || '', spec: it.spec});
}
// demos
const DEMOS = [
  ['logo-night-city', 'Logo film', 'One slow push-in: the letters stand on a dark mirror with their reflection kept dim, the mark turns above, and the night city stays far behind, out of focus. Eleven seconds, one file.', "Use connect-ai-three: our name 'CONNECT AI LAB' as gold 3D letters standing on a dark mirror floor, our mark above, a night city far behind and out of focus, the camera pushing in slowly. 11 seconds, plus a page I can drag.", 9.5],
  ['on-my-video', '3D on my own video, behind me', 'Five cuts of real talking footage. A person matte, one picture per frame, puts every 3D object BEHIND the speaker: the name rises from behind his shoulders when he says it, a computer slides out from behind his head on "a good computer", a camera flies behind him on "I move the camera", three things drop on "gravity", and the studio building rises on "AI-native company". His pixels are never touched, and the check knows where his face and his mic arm are.', 'Use connect-ai-three on my talking video with the person matte: when I say "3D modeling" show our mark as a wireframe on my right and turn it into solid gold; when I say "a good computer" slide a computer out from behind my head. Nothing in front of my face or my mic.', 21.75],
  ['interactive-hero', 'Interactive hero', 'The scene at the top of this page: a small studio you can turn around. The camera leans to the pointer, things lift on hover and spin on click. This clip is that page, driven by a pointer script.', 'Use connect-ai-three: an interactive hero for my landing page. A small studio set on a desk: display, computer, microphone, a camera on a tripod, a softbox. Hover lifts, click spins, drag turns the scene.', 7.6],
  ['korean-title', '3D text, also in Korean', 'Six built-in typefaces for 3D letters (four sans weights, two serif). The sans faces also carry the Korean letters of a few brand lines, like this one: "AI education for everyone". Any other text in any script takes your own font file.', 'Use connect-ai-three: the words "모두를 위한 AI 교육" as ivory 3D letters arriving one by one, a small gold mark above, blue light behind.', 6.5],
  ['explainer-fly', 'Explainer fly-through', 'How this tool works, told by the tool: a microphone and what was said, a display with the one file, then a laptop and a clapperboard for the two outputs. One 3D space, and a camera that flies between the three.', 'Use connect-ai-three: explain my three steps as three stations in one space (a microphone with a glass card, a display, a laptop with a clapperboard), the camera flying from one to the next, then pulling back to show all of them.', 11.4],
];
const demos = [];
for (const [id, title, about, prompt, posterAt] of DEMOS) {
  const src = demosDir && path.join(demosDir, id + '.mp4');
  const out = path.join(DOCS, 'media', id + '.mp4'), poster = path.join(DOCS, 'media', id + '.jpg');
  if (!skip && src && fs.existsSync(src)) {
    // the talking cuts keep their sound (it plays muted until the visitor turns it on): the timing is to his words
    ff(['-i', src, ...(id === 'on-my-video' ? ['-c:a', 'aac', '-b:a', '128k'] : ['-an']), '-vf', 'scale=1280:720:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-crf', '26', '-preset', 'slow', '-movflags', '+faststart', out]);
    ff(['-ss', String(posterAt ?? 5), '-i', src, '-frames:v', '1', '-vf', 'scale=1280:720:flags=lanczos', '-q:v', '4', poster]);
  }
  if (fs.existsSync(out)) demos.push({id, title, about, prompt});
}
const shortSrc = demosDir && path.join(demosDir, 'logo-night-city_9x16.mp4');
if (!skip && shortSrc && fs.existsSync(shortSrc)) ff(['-i', shortSrc, '-an', '-vf', 'scale=540:960:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-crf', '27', '-preset', 'slow', '-movflags', '+faststart', path.join(DOCS, 'media', 'short.mp4')]);
const hasShort = fs.existsSync(path.join(DOCS, 'media', 'short.mp4'));
// hero montage: the logo film, then hard cuts through the demos and a handful of catalog clips (all our own renders)
const heroSrc = demosDir && path.join(demosDir, 'logo-night-city.mp4');
if (!skip && heroSrc && fs.existsSync(heroSrc)) {
  const C = (k) => path.join(clipsDir, 'clips', k + '.mp4'), Dm = (k) => path.join(demosDir, k + '.mp4');
  const cuts = [[heroSrc, 3.6, 5.6], [Dm('on-my-video'), 1.5, 2.6], [Dm('on-my-video'), 10.9, 2.2], [Dm('on-my-video'), 16.5, 2.4], [Dm('on-my-video'), 26.6, 2.2], [Dm('on-my-video'), 31.6, 2.6],
    [Dm('interactive-hero'), 6.0, 2.4], [Dm('explainer-fly'), 3.4, 2.2], [Dm('korean-title'), 1.4, 2.2],
    [C('object__building'), 1.2, 1.4], [C('camera__orbit'), 1.0, 1.3], [C('physics__dominoes'), 1.4, 1.6], [C('object__instances-wave'), 1.6, 1.2], [C('light__sweep'), 1.0, 1.3], [C('motion__path'), 1.2, 1.4],
    [C('object__gltf'), 1.6, 1.2], [C('post__halftone'), 1.6, 1.0], [C('camera__dolly-zoom'), 0.8, 1.8], [C('physics__letters-drop'), 1.6, 1.6], [C('object__sky'), 1.4, 1.3], [heroSrc, 9.0, 1.9]].filter((c) => fs.existsSync(c[0]));
  const args = [];
  cuts.forEach(([f, ss, d]) => args.push('-ss', String(ss), '-t', String(d), '-i', f));
  const fc = cuts.map((_, i) => `[${i}:v]scale=1440:810:flags=lanczos,fps=30,format=yuv420p,setsar=1[v${i}]`).join(';') + ';' + cuts.map((_, i) => `[v${i}]`).join('') + `concat=n=${cuts.length}:v=1:a=0[o]`;
  ff([...args, '-filter_complex', fc, '-map', '[o]', '-an', '-c:v', 'libx264', '-crf', '29', '-preset', 'slow', '-movflags', '+faststart', path.join(DOCS, 'media', 'hero.mp4')]);
  ff(['-ss', '9.5', '-i', heroSrc, '-frames:v', '1', '-vf', 'scale=1600:900', '-q:v', '3', path.join(DOCS, 'media', 'hero.jpg')]);
  ff(['-ss', '7.6', '-i', Dm('interactive-hero'), '-frames:v', '1', '-vf', 'scale=1600:900', '-q:v', '3', path.join(DOCS, 'media', 'live.jpg')]);
  ff(['-ss', '2.0', '-t', '8', '-i', heroSrc, '-vf', 'fps=10,scale=720:405:flags=lanczos', '-loop', '0', '-c:v', 'libwebp', '-q:v', '48', '-compression_level', '6', path.join(DOCS, 'media', 'hero.webp')]);
}
// live pages: the real web output, embedded
for (const ex of ['interactive-hero', 'logo-night-city']) {
  const spec = readJson(path.join(KIT, 'examples', ex, 'scene.json'));
  const tmp = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR || '/tmp'), 'c3-docs-'));
  const r = await buildWeb(tmp, {...spec, page: {credit: false, pageTitle: `${ex} · ${KIT_NAME}`}}, {});
  fs.copyFileSync(r.file, path.join(DOCS, 'live', ex + '.html'));
  fs.rmSync(tmp, {recursive: true, force: true});
}

const groups = idx.groups.map((g) => ({...g, count: items.filter((i) => i.group === g.id).length})).filter((g) => g.count);
const N = items.length;
const data = JSON.stringify({items: items.map(({spec, ...m}) => m), specs: Object.fromEntries(items.map((i) => [i.key, i.spec]))}).replace(/</g, '\\u003c');
const sampleSpec = JSON.stringify({name: 'my-name', duration: 6, look: 'connect-night-city', camera: {position: [0, 1.5, 9], target: [0, 0.5, 0], fov: 30, motion: [{type: 'dolly', from: 1, to: 0.8, dur: 6}]}, objects: [{id: 'floor', type: 'floor', kind: 'mirror', dim: 0.84}, {id: 'name', type: 'wordmark', text: 'MY NAME', font: 'sans', split: true, position: [0, 0.22, 0], motion: [{type: 'stagger', at: 0.5, kind: 'rise'}]}, {id: 'camera', type: 'cinema-camera', tripod: true, position: [3, 0, -1]}], addPost: [{type: 'dof', aperture: 0.0003}], interact: ['parallax', 'orbit']}, null, 1).replace(/\n\s+(-?[\d.]+),?(?=\n)/g, (m) => ' ' + m.trim()).replace(/\[ /g, '[').replace(/\n\s*\]/g, ']');

const demoCards = demos.map((d) => `    <div class="demo${d.id === 'on-my-video' || d.id === 'explainer-fly' ? ' wide' : ''}"><video data-src="media/${d.id}.mp4" poster="media/${d.id}.jpg" muted loop playsinline preload="none"${d.id === 'on-my-video' ? ' controls' : ''}></video><div class="txt"><h3>${esc(d.title)}</h3><p>${esc(d.about)}</p><p class="say">${esc(d.prompt)}</p><button class="btn" data-copy="${esc(d.prompt)}">Copy prompt</button>${d.id === 'logo-night-city' || d.id === 'interactive-hero' ? ` <a class="btn ghost" href="live/${d.id}.html" target="_blank" rel="noopener">Open live page</a>` : ''}</div></div>`);
if (hasShort) demoCards.splice(1, 0, `    <div class="demo tall"><video data-src="media/short.mp4" muted loop playsinline preload="none"></video><div class="txt"><h3>The same file, vertical</h3><p>Add <code>--short</code> and the scene also renders 9:16. Nothing is re-laid out by hand: the camera steps back until the picture designed for 16:9 fits the narrow frame, and the self-check tells you if something is still cut off.</p><p class="say">npx ${KIT_NAME} make my-scene --short --alpha</p><button class="btn" data-copy="npx ${KIT_NAME} make my-scene --short --alpha">Copy command</button></div></div>`);
const demoHtml = demoCards.join('\n');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${KIT_NAME} · open source by CONNECT AI LAB</title>
<meta name="description" content="Open source by CONNECT AI LAB. Say it, get a three.js scene: one spec becomes an interactive web page and a frame-locked video, with a self-check. ${N} catalog items, every one a living clip.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500&family=JetBrains+Mono:wght@300;400&display=swap" rel="stylesheet">
<style>
:root{--black:#08080A;--panel:#101014;--line:rgba(235,226,210,.13);--ivory:#EBE2D2;--dim:rgba(235,226,210,.62);--faint:rgba(235,226,210,.36);--gold:#D6892A;--goldhi:#F2B45A;--teal:#6FA8C4;
  --sans:"Inter","Helvetica Neue","Pretendard","Apple SD Gothic Neo",Arial,sans-serif;--mono:"JetBrains Mono",ui-monospace,Menlo,monospace}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--black);color:var(--ivory);font-family:var(--sans);font-weight:300;-webkit-font-smoothing:antialiased;overflow-x:hidden}
a{color:inherit;text-decoration:none}
code,pre,.say{font-family:var(--mono);font-variant-ligatures:none;font-feature-settings:"liga" 0,"calt" 0}
.caps{font-size:11px;letter-spacing:.28em;text-transform:uppercase;font-weight:400}
.gold{color:var(--goldhi)}
body::after{content:"";position:fixed;inset:0;pointer-events:none;z-index:60;opacity:.06;mix-blend-mode:overlay;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)'/%3E%3C/svg%3E")}
header.top{position:absolute;z-index:20;left:0;right:0;top:0;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px clamp(16px,4vw,56px);background:linear-gradient(180deg,rgba(8,8,10,.78),rgba(8,8,10,0))}
.brand{display:flex;align-items:baseline;gap:14px;min-width:0}
.brand b{font-weight:400;letter-spacing:.32em;font-size:13px;white-space:nowrap}
.brand span{color:var(--dim);font-size:12px;letter-spacing:.06em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
nav.links{display:flex;gap:22px;flex:none}
nav.links a{color:var(--dim);transition:color .2s}
nav.links a:hover{color:var(--goldhi)}

.hero{padding:58px 0 0}
/* the film is never covered: the words sit under it */
.stage{position:relative;width:min(100vw,calc((100svh - 330px) * 1.7778));min-width:min(100vw,760px);aspect-ratio:16/9;margin:0 auto;background:#000;overflow:hidden;border-radius:0 0 22px 22px}
.stage video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.stage iframe{position:absolute;inset:0;width:100%;height:100%;border:0;display:block}
.stage .tag{position:absolute;left:18px;bottom:16px;z-index:2;color:var(--goldhi);pointer-events:none}
.stage .tag b{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--goldhi);margin-right:10px;animation:pulse 1.6s infinite}
.film{border-radius:22px;overflow:hidden;border:1px solid var(--line);background:#000}
.film video{display:block;width:100%;aspect-ratio:16/9;object-fit:cover}
.stage::after{content:"";position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -60px 60px -40px rgba(8,8,10,.7)}
.hero .inner{position:relative;z-index:2;padding:26px clamp(16px,4vw,56px) 0;max-width:1680px;width:100%;margin:0 auto;display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:14px 56px;align-items:end}
.hero .inner .r{padding-bottom:6px}
.kicker{display:flex;align-items:center;gap:14px;color:var(--goldhi);margin-bottom:18px}
.kicker i{display:block;width:44px;height:1px;background:var(--gold);flex:none}
h1{font-weight:200;font-size:clamp(38px,5.4vw,88px);line-height:1;letter-spacing:-.02em;margin:0;max-width:9em}
h1 span{display:inline-block;opacity:0;filter:blur(12px);transform:translateY(10px);animation:word .8s cubic-bezier(.2,.7,.2,1) forwards}
h1 em{font-style:normal;color:var(--goldhi)}
.lede{max-width:44em;opacity:.9;font-size:clamp(15px,1.3vw,19px);line-height:1.55;margin:0 0 6px}
.lede.ko{color:var(--dim);font-size:clamp(13px,1.05vw,15px);margin:0 0 18px}
.cmd{display:inline-flex;align-items:center;max-width:100%;border:1px solid rgba(214,137,42,.6);background:rgba(8,8,10,.6);backdrop-filter:blur(8px);border-radius:999px;overflow:hidden}
.cmd code{font-family:var(--mono);font-size:clamp(13px,1.3vw,17px);padding:13px 20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cmd code::before{content:"$ ";color:var(--gold)}
button.copy{font:inherit;cursor:pointer;border:0;background:var(--gold);color:#14110E;padding:14px 20px;font-size:11px;letter-spacing:.24em;text-transform:uppercase;font-weight:500;transition:background .2s;flex:none}
button.copy:hover{background:var(--goldhi)}
.facts{display:flex;flex-wrap:wrap;gap:8px 30px;margin:30px auto 0;padding:16px clamp(16px,4vw,56px) 0;max-width:1680px;border-top:1px solid var(--line);color:var(--dim);font-size:13px}
.facts b{color:var(--ivory);font-weight:400}

section{padding:clamp(56px,9vw,120px) clamp(16px,4vw,56px);max-width:1680px;margin:0 auto}
.sec-head{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap;margin-bottom:clamp(22px,3vw,40px)}
h2{font-weight:200;font-size:clamp(28px,4vw,56px);line-height:1.05;letter-spacing:-.015em;margin:10px 0 0;max-width:16em}
h2 em{font-style:normal;color:var(--goldhi)}
.sec-head p{max-width:34em;color:var(--dim);line-height:1.6;margin:0;font-size:15px}

.live{position:relative;border-radius:22px;overflow:hidden;border:1px solid var(--line);background:#050506;aspect-ratio:16/9;max-height:78svh;width:100%}
.live iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.live .tag{position:absolute;left:18px;top:16px;z-index:2;color:var(--goldhi);pointer-events:none}
.live .tag b{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--goldhi);margin-right:10px;animation:pulse 1.6s infinite}

.demos{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:clamp(14px,2vw,28px)}
.demo{border:1px solid var(--line);border-radius:20px;overflow:hidden;background:var(--panel)}
.demo video{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;background:#000}
.demo .txt{padding:18px 20px 20px}
.demo.tall{display:grid;grid-template-columns:minmax(0,38%) minmax(0,1fr);align-items:center}
.demo.tall video{aspect-ratio:9/16;width:100%;height:auto;max-height:560px;object-fit:contain;background:#000}
.demos .demo.wide{grid-column:1/-1}
.demos .demo.wide video{max-height:76svh}
.demos .demo:last-child:nth-child(odd){grid-column:1/-1}
.demos .demo:last-child:nth-child(odd) video{max-height:70svh}
.demo h3{font-weight:300;font-size:21px;margin:0 0 8px}
.demo p{margin:0 0 14px;color:var(--dim);line-height:1.55;font-size:14px}
.say{font-family:var(--mono);font-size:12px;line-height:1.55;color:var(--ivory);opacity:.85;background:rgba(235,226,210,.05);border-radius:12px;padding:12px 14px;margin:0 0 12px}
.btn{font:inherit;cursor:pointer;border:1px solid rgba(214,137,42,.55);background:transparent;color:var(--ivory);border-radius:999px;padding:8px 14px;font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;font-weight:400;transition:background .2s,color .2s}
.btn:hover,.btn.done{background:var(--gold);color:#14110E}
.btn.ghost{border-color:var(--line);color:var(--dim)}

.chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:22px}
.chip{font:inherit;cursor:pointer;border:1px solid var(--line);background:transparent;color:var(--dim);border-radius:999px;padding:8px 14px;font-size:12px;letter-spacing:.06em;transition:all .2s}
.chip b{font-weight:400;color:var(--faint);margin-left:6px}
.chip.on{border-color:var(--gold);color:var(--ivory);background:rgba(214,137,42,.12)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:14px}
.card{border:1px solid var(--line);border-radius:16px;overflow:hidden;background:var(--panel);display:flex;flex-direction:column}
.card .v{position:relative;aspect-ratio:16/9;background:#000 center/cover no-repeat}
.card video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .3s}
.card video.on{opacity:1}
.card .g{position:absolute;left:10px;top:9px;z-index:2;font-size:9.5px;letter-spacing:.22em;text-transform:uppercase;color:var(--goldhi);background:rgba(8,8,10,.55);backdrop-filter:blur(6px);padding:4px 8px;border-radius:999px}
.card .t{padding:13px 14px 14px;display:flex;flex-direction:column;gap:7px;flex:1}
.card h4{margin:0;font-weight:400;font-size:15px;letter-spacing:.01em}
.card p{margin:0;color:var(--dim);font-size:12.5px;line-height:1.5}
.card .src{color:var(--faint);font-size:11px;margin-top:auto;padding-top:4px}
.card .row{display:flex;gap:6px;flex-wrap:wrap}

.steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-bottom:28px}
.step{border:1px solid var(--line);border-radius:18px;padding:22px;background:var(--panel)}
.step .n{color:var(--goldhi)}
.step h3{font-weight:300;font-size:22px;margin:12px 0 8px}
.step p{margin:0;color:var(--dim);line-height:1.6;font-size:14px}
.two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}
pre{margin:0;font-family:var(--mono);font-size:12.5px;line-height:1.6;background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:20px;overflow:auto;color:var(--ivory)}
table{width:100%;border-collapse:collapse;font-size:13.5px}
td{padding:11px 0;border-bottom:1px solid var(--line);vertical-align:top;line-height:1.5}
td:first-child{color:var(--ivory);padding-right:18px;width:42%}
td:last-child{color:var(--dim)}
.box{border:1px solid var(--line);border-radius:18px;padding:8px 20px 12px;background:var(--panel)}
.cmds{display:grid;gap:10px}
.cmds .cmd{border-radius:14px;width:100%;justify-content:space-between}
.cmds .cmd code{font-size:13.5px;flex:1}
.cmds small{display:block;color:var(--dim);font-size:12.5px;margin:2px 4px 8px}
footer{border-top:1px solid var(--line);padding:34px clamp(16px,4vw,56px) 60px;display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;color:var(--dim);font-size:13px;max-width:1680px;margin:0 auto}
footer a:hover{color:var(--goldhi)}
footer .l{display:flex;gap:22px;flex-wrap:wrap}
.toast{position:fixed;left:50%;bottom:26px;transform:translate(-50%,20px);background:var(--gold);color:#14110E;padding:10px 18px;border-radius:999px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;opacity:0;transition:all .25s;z-index:80;pointer-events:none}
.toast.on{opacity:1;transform:translate(-50%,0)}
@keyframes word{to{opacity:1;filter:blur(0);transform:none}}
@keyframes pulse{50%{opacity:.25}}
@media (max-width:900px){.demos,.two,.steps,.hero .inner{grid-template-columns:1fr}.demos .demo:last-child:nth-child(odd),.demos .demo.wide{grid-column:auto}.stage{border-radius:0}nav.links a.h{display:none}.brand span{display:none}}
@media (max-width:560px){.stage{aspect-ratio:1/1;min-width:0;width:100vw}.hero .inner{padding-top:16px;gap:10px}.hero .inner .r{display:flex;flex-direction:column}.hero .cmd{order:2;align-self:flex-start;margin-top:8px}.lede.ko{order:3;margin:16px 0 0}.kicker{margin-bottom:10px}h1{font-size:34px}.grid{grid-template-columns:1fr}.cmd code{font-size:12.5px;padding:12px 14px}button.copy{padding:13px 14px}.live{aspect-ratio:3/4}}
@media (prefers-reduced-motion:reduce){h1 span{animation:none;opacity:1;filter:none;transform:none}}
.still h1 span{animation:none;opacity:1;filter:none;transform:none}
</style>
</head>
<body>
<header class="top">
  <div class="brand"><b>CONNECT AI LAB</b><span>open source · AI education for everyone</span></div>
  <nav class="links caps"><a class="h" href="#film">Film</a><a class="h" href="#demos">Demos</a><a class="h" href="#catalog">Catalog</a><a class="h" href="#how">How</a><a href="https://github.com/wonseokjung/${KIT_NAME}">GitHub</a></nav>
</header>

<div class="hero">
  <div class="stage" id="stage" style="background-image:url(media/live.jpg);background-size:cover;background-position:center">
    <iframe src="live/interactive-hero.html" title="a three.js scene you can drag" allow="accelerometer"></iframe>
    <div class="tag caps"><b></b>live three.js · drag it</div>
  </div>
  <div class="inner">
    <div>
      <div class="kicker caps"><i></i><span data-scramble>Open source by CONNECT AI LAB</span></div>
      <h1>${['Say', 'it.', 'Get', 'a', '<em>three.js</em>', 'scene.'].map((w, i) => `<span style="animation-delay:${(0.2 + i * 0.1).toFixed(2)}s">${w}</span>`).join(' ')}</h1>
    </div>
    <div class="r">
      <p class="lede">A tool for one job: your sentence becomes a 3D scene that runs on a web page and renders as video, also behind you in your own footage. One small file, checked before it reaches you.</p>
      <p class="lede ko">CONNECT AI LAB 이 만든 오픈소스. 말로 부탁하면 three.js 장면이 나옵니다. 규격 하나로 웹 페이지와 영상을 함께 만들고, 내 영상에서는 내 뒤로 지나가며, 넘겨주기 전에 스스로 검사합니다.</p>
      <div class="cmd"><code id="npx">npx ${KIT_NAME}</code><button class="copy" data-copy="npx ${KIT_NAME}">Copy</button></div>
    </div>
  </div>
  <div class="facts"><span><b>${N}</b> catalog items, all playing below</span><span><b>1</b> scene.json → web page + video</span><span><b>11</b> studio props + <b>6</b> typefaces built in</span><span>MIT · v${VERSION}</span></div>
</div>

<section id="film">
  <div class="sec-head"><div><div class="caps gold">Film</div><h2>Everything below, <em>in one minute.</em></h2></div><p>The logo film, 3D behind a speaker in real footage, the live scene above as a video, and pieces of the catalog. Every frame is a render of this tool.</p></div>
  <div class="film"><video data-src="media/hero.mp4" poster="media/hero.jpg" muted loop playsinline preload="none"></video></div>
</section>

<section id="demos">
  <div class="sec-head"><div><div class="caps gold">Demos</div><h2>Finished pieces, each from <em>one file.</em></h2></div><p>Every demo is a single scene.json in <code>examples/</code>. Copy the sentence, give it to your coding agent, change the words to yours.</p></div>
  <div class="demos">
${demoHtml}
  </div>
</section>

<section id="catalog">
  <div class="sec-head"><div><div class="caps gold">Catalog</div><h2><em>${N}</em> items. Every one a scene that runs.</h2></div><p>Each clip is its own small scene.json, rendered by the tool. Copy the sentence for your agent, or copy the spec and change it.</p></div>
  <div class="chips" id="chips"></div>
  <div class="grid" id="grid"></div>
</section>

<section id="how">
  <div class="sec-head"><div><div class="caps gold">How it works</div><h2>One spec. Two outputs. <em>A self-check.</em></h2></div><p>It does not invent one more 3D library. It puts the three.js ecosystem behind one small file, and adds the check that code-made scenes usually skip.</p></div>
  <div class="steps">
    <div class="step"><div class="n caps">01 · Say it</div><h3>Plain words</h3><p>Tell your coding agent what you want to see. The skill teaches it the spec and the whole catalog, so it writes scene.json instead of raw three.js.</p></div>
    <div class="step"><div class="n caps">02 · One spec</div><h3>scene.json</h3><p>Look, camera, lights, objects, motion, finish. Everything moves from time alone, so the page and the video are the same picture frame for frame.</p></div>
    <div class="step"><div class="n caps">03 · Checked</div><h3>Then two outputs</h3><p>The scene is built in a headless browser and measured first. Only then: an interactive page in one file, and a video (also transparent, also 9:16).</p></div>
  </div>
  <div class="two">
    <pre>${esc(sampleSpec)}</pre>
    <div class="box"><table>
      <tr><td>Blank or black frames</td><td>camera looking the wrong way, no light</td></tr>
      <tr><td>Objects never in view, NaN</td><td>a typo in a position</td></tr>
      <tr><td>Face keep-out, person matte</td><td>on your own video nothing covers your face; with a matte all 3D goes behind you, and a mic arm in front of you stays in front</td></tr>
      <tr><td>Same picture twice</td><td>what makes the page and the video match</td></tr>
      <tr><td>WebGL leaks</td><td>build and dispose several times, nothing may stay</td></tr>
      <tr><td>Draw calls, triangles, textures</td><td>budgets that phones can carry</td></tr>
      <tr><td>Frame time</td><td>measured at full size and at phone size</td></tr>
      <tr><td>Phone framing, small text</td><td>nothing cut off at 390 px, labels readable</td></tr>
    </table></div>
  </div>
</section>

<section id="run">
  <div class="sec-head"><div><div class="caps gold">Run it</div><h2>Three lines to <em>your own scene.</em></h2></div><p>Node 18 or newer. Works with Claude Code, Codex, Cursor and Antigravity, or with no agent at all.</p></div>
  <div class="cmds">
    <div><div class="cmd"><code>npx ${KIT_NAME}</code><button class="copy" data-copy="npx ${KIT_NAME}">Copy</button></div><small>Makes the demo scene and opens it in your browser.</small></div>
    <div><div class="cmd"><code>npx ${KIT_NAME} install</code><button class="copy" data-copy="npx ${KIT_NAME} install">Copy</button></div><small>Adds the skill to your coding agent. Then just say what you want to see.</small></div>
    <div><div class="cmd"><code>npx ${KIT_NAME} make my-scene --short</code><button class="copy" data-copy="npx ${KIT_NAME} make my-scene --short">Copy</button></div><small>Self-check, web page, video, a 9:16 version, still sheet and report.</small></div>
  </div>
</section>

<footer>
  <div><b style="font-weight:400;letter-spacing:.3em;color:var(--ivory)">CONNECT AI LAB</b><br>AI education for everyone · 모두를 위한 AI 교육</div>
  <div class="l"><a href="https://www.youtube.com/@CONNECT-AI-LAB">YouTube</a><a href="https://www.aicitybuilders.com">aicitybuilders.com</a><a href="https://github.com/wonseokjung/${KIT_NAME}">GitHub</a><a href="https://github.com/wonseokjung/connect-ai-video-motion">connect-ai-video-motion</a><span>MIT</span></div>
</footer>
<div class="toast" id="toast">Copied</div>

<script>
if (location.search.includes('still')) document.documentElement.classList.add('still'); // for screenshots: no entrance animation
const DATA = ${data};
const GROUPS = ${JSON.stringify(groups.map((g) => ({id: g.id, title: g.title, count: g.count})))};
const $ = (s, r = document) => r.querySelector(s);
const toast = $('#toast');
function copy(text, btn) {
  const done = () => { toast.classList.add('on'); if (btn) btn.classList.add('done'); setTimeout(() => { toast.classList.remove('on'); if (btn) btn.classList.remove('done'); }, 1400); };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
  function fallback() { const t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (e) {} t.remove(); done(); }
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-copy],[data-spec]');
  if (!b) return;
  copy(b.dataset.spec ? JSON.stringify(DATA.specs[b.dataset.spec], null, 2) : b.dataset.copy, b);
});
// catalog grid
const grid = $('#grid'), chips = $('#chips');
let current = 'all';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
function draw() {
  grid.innerHTML = DATA.items.filter((i) => current === 'all' || i.group === current).map((i) => '<div class="card"><div class="v" style="background-image:url(posters/' + i.key + '.jpg)"><span class="g">' + i.group + '</span><video data-src="clips/' + i.key + '.mp4" muted loop playsinline preload="none"></video></div><div class="t"><h4>' + esc(i.title) + '</h4><p>' + esc(i.about) + '</p><div class="src">' + esc(i.source) + ' · ' + esc(i.license) + '</div><div class="row"><button class="btn" data-copy="' + esc('Use connect-ai-three: ' + i.prompt) + '">Copy prompt</button><button class="btn ghost" data-spec="' + i.key + '">Copy spec</button></div></div></div>').join('');
  grid.querySelectorAll('video').forEach((v) => io.observe(v));
}
chips.innerHTML = '<button class="chip on" data-g="all">All<b>' + DATA.items.length + '</b></button>' + GROUPS.map((g) => '<button class="chip" data-g="' + g.id + '">' + g.title + '<b>' + g.count + '</b></button>').join('');
chips.addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (!c) return; current = c.dataset.g; chips.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === c)); draw(); });
// clips load and play only while on screen
const io = new IntersectionObserver((es) => { for (const e of es) { const v = e.target; if (e.isIntersecting) { if (!v.src && v.dataset.src) v.src = v.dataset.src; v.play().then(() => v.classList.add('on')).catch(() => {}); } else if (v.src) v.pause(); } }, {rootMargin: '120px', threshold: 0.2});
document.querySelectorAll('.demo video, .film video').forEach((v) => { v.classList.add('on'); io.observe(v); });
const io2 = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting && !e.target.src) e.target.src = e.target.dataset.src; }, {rootMargin: '300px'});
document.querySelectorAll('iframe[data-src]').forEach((f) => io2.observe(f));
draw();
// kicker scramble-in
document.querySelectorAll('[data-scramble]').forEach((el) => { const txt = el.textContent, abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'; let f = 0; const id = setInterval(() => { f++; el.textContent = txt.split('').map((c, i) => (i < f * 1.4 || c === ' ' ? c : abc[(i * 7 + f * 3) % 26])).join(''); if (f * 1.4 > txt.length) clearInterval(id); }, 28); });
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(DOCS, 'index.html'), html);
const du = (d) => fs.readdirSync(d).reduce((s, f) => s + fs.statSync(path.join(d, f)).size, 0);
console.log(`docs: ${N} catalog clips (${(du(path.join(DOCS, 'clips')) / 1048576).toFixed(1)} MB), ${demos.length} demos, posters ${(du(path.join(DOCS, 'posters')) / 1048576).toFixed(1)} MB, media ${(du(path.join(DOCS, 'media')) / 1048576).toFixed(1)} MB, short ${hasShort}`);
