#!/usr/bin/env node
// connect-ai-three: say it, get a three.js scene. One spec -> an interactive web page AND a frame-locked video.
// Open source by CONNECT AI LAB.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {KIT, KIT_NAME, RUN_CMD, VERSION, projectPaths, readJson, writeJson} from '../lib/paths.mjs';
import {banner} from '../lib/banner.mjs';

const argv = process.argv.slice(2);
const VALUE = ['copy', 'dir', 'agent', 'at', 'out', 'scale', 'target', 'faces', 'face', 'matte', 'matte-fps', 'start', 'port', 'place', 'size', 'times'];
const flag = (n) => argv.includes('--' + n);
const opt = (n, d = null) => {
  const i = argv.indexOf('--' + n);
  return i >= 0 && argv[i + 1] != null && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const pos = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--') && VALUE.includes(argv[i - 1].slice(2))));
const log = (...a) => console.log(...a);
const secs = (t) => ((Date.now() - t) / 1000).toFixed(1) + ' s';
const open = (f) => {
  if (flag('no-open') || process.env.CI) return;
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  try {
    spawn(cmd, process.platform === 'win32' ? ['/c', 'start', '', f] : [f], {stdio: 'ignore', detached: true}).unref();
  } catch {}
};

const HELP = `${KIT_NAME} ${VERSION} · open source by CONNECT AI LAB
Say it, get a three.js scene: one spec becomes an interactive web page and a frame-locked video.

  ${RUN_CMD} examples              the 13 ready examples (miniature world, glass, neon, shaders, particles,
                                         physics, machine teardown, scroll site, styles, flight game, splats, XR)
  ${RUN_CMD} example <name>        open one in your browser   --copy <folder>: your own copy to edit
  ${RUN_CMD}                       make the demo scene and open it in your browser
  ${RUN_CMD} new "'MY SHOP' logo in a pastel cafe, slow orbit"
                                         draft scene.json from words (your AI agent writes better ones: see install)
  ${RUN_CMD} make [folder]         self-check, then web page + video + still sheet + report
  ${RUN_CMD} web [folder]          out/web/index.html (one file, opens by double-click)
  ${RUN_CMD} video [folder]        out/video.mp4   --alpha: out/overlay.mov (transparent)   --short: 9:16 too
  ${RUN_CMD} check [folder]        blank frames, draw calls, textures, phone framing, WebGL leaks, same-picture-twice
  ${RUN_CMD} sheet [folder]        out/sheet.jpg (stills across the scene)
  ${RUN_CMD} on-video talk.mp4 [folder]
                                         3D object on top of your own video; --face x,y,w,h keeps your face clear;
                                         --matte <folder> draws the 3D BEHIND you (person matte, one picture per frame)
  ${RUN_CMD} catalog [group]       every object, material, motion, camera move, light, pass, look
  ${RUN_CMD} use <catalog-id> [folder]   start from a catalog example
  ${RUN_CMD} install               add the skill to Claude Code / Codex / Cursor / Antigravity
  ${RUN_CMD} doctor                is this machine ready?

A project is a folder with scene.json (+ assets/). Everything we make goes to out/.
Docs and every example clip: https://github.com/wonseokjung/${KIT_NAME}`;

async function loadAll() {
  const [{loadSpec}, check, render, web] = await Promise.all([import('../lib/project.mjs'), import('../lib/check.mjs'), import('../lib/render.mjs'), import('../lib/web.mjs')]);
  return {loadSpec, ...check, ...render, ...web};
}
const sheetTimes = (spec, n = 8) => {
  const d = spec.duration ?? 5, fps = spec.fps ?? 30;
  return Array.from({length: n}, (_, i) => +Math.min(d - 1 / fps, (d * (i + 0.5)) / n).toFixed(3));
};
function printCheck(r, t) {
  log(`  check: ${r.ok ? 'PASS' : 'FAIL'}  ${r.errors.length} to fix, ${r.advice.length} worth a look${t ? `  (${secs(t)})` : ''}`);
  for (const e of r.errors) log(`    FIX   ${e.msg}`);
  for (const a of r.advice) log(`    look  ${a.msg}`);
  const n = r.numbers || {};
  if (n.calls != null) log(`    ${n.calls} draw calls · ${n.triangles.toLocaleString('en-US')} triangles · largest texture ${n.maxTexture || 0}px · ${n.frameMs ? n.frameMs.median + ' ms/frame' : ''}${n.phoneMs != null ? ` · phone ${n.phoneMs} ms` : ''}`);
}
// the 9:16 version: the same scene at 1080x1920. A spec may carry "short": {...} with what should differ in the tall
// frame: any top-level field, and "objects": {"<id>": {...}} to change single objects (a bigger caption, another place).
const shortSpec = (spec) => {
  const {objects: perId = {}, ...top} = spec.short || {};
  const {short, ...base} = spec;
  return {...base, ...top, camera: {...(base.camera || {}), ...(top.camera || {})}, size: {width: 1080, height: 1920}, objects: (base.objects || []).map((o) => (perId[o.id] ? {...o, ...perId[o.id]} : o))};
};

async function cmdMake(dirArg) {
  const L = await loadAll();
  const {spec, dir} = L.loadSpec(dirArg || '.');
  const P = projectPaths(dir);
  const t0 = Date.now();
  log(`${KIT_NAME} · ${dir}`);
  log('1/4 check');
  let t = Date.now();
  const vj = readJson(path.join(dir, 'video.json'));
  // with a person matte every object is drawn behind the person: the face keep-out cannot be broken
  const r = await L.check(dir, vj && vj.matte ? {...spec, behindPerson: true} : spec, {target: opt('target', 'both')});
  printCheck(r, t);
  fs.mkdirSync(P.out, {recursive: true});
  fs.writeFileSync(path.join(P.out, 'report.md'), L.reportMd(spec.name || path.basename(dir), r));
  if (!r.probe) return r;
  log('2/4 sheet');
  await L.renderSheet(dir, spec, path.join(P.out, 'sheet.jpg'), {times: sheetTimes(spec), cols: 4, title: `${spec.name || path.basename(dir)} · check ${r.ok ? 'PASS' : 'FAIL'}`, keepOut: (spec.keepOut || []).length > 0});
  log('  out/sheet.jpg');
  if (!r.ok && !flag('force')) {
    log('3/4 web, 4/4 video: skipped until the check passes (see out/report.md and out/sheet.jpg, or add --force)');
    return r;
  }
  log('3/4 web');
  const w = await L.buildWeb(dir, spec, {log, inline: flag('no-inline') ? false : 'auto'});
  log('4/4 video');
  t = Date.now();
  const video = readJson(path.join(dir, 'video.json'));
  await L.renderVideo(dir, spec, path.join(P.out, 'video.mp4'), {log, video});
  log(`  out/video.mp4  (${secs(t)})`);
  if (video) {
    // on your own footage: three stills with the video behind, so you can see the placement against the real picture
    const D = spec.duration ?? 5;
    for (const k of [0.3, 0.6, 0.9]) await L.renderStillAt(dir, spec, path.join(P.out, `on_video_${(D * k).toFixed(1)}s.jpg`), D * k, {video});
    log('  out/on_video_*.jpg');
  }
  if (flag('alpha')) {
    // with a person matte the overlay already has the person cut out of it: lay it over the footage in any editor
    await L.renderVideo(dir, {...spec, background: 'transparent'}, path.join(P.out, 'overlay.mov'), {alpha: true, log, video: video && video.matte ? {matte: video.matte} : null});
    log('  out/overlay.mov');
  }
  if (flag('short')) {
    await L.renderVideo(dir, shortSpec(spec), path.join(P.out, 'short_9x16.mp4'), {log});
    log('  out/short_9x16.mp4');
  }
  log(`done in ${secs(t0)}. Page: ${w.file}`);
  if (flag('open')) open(w.file);
  return r;
}

async function main() {
  const cmd = pos[0] || 'demo';
  if (flag('help') || cmd === 'help') { log(banner()); return log(HELP); }
  if (flag('version')) return log(VERSION);

  if (cmd === 'examples') {
    const {listExamples, exampleProblems} = await import('../lib/examples.mjs');
    const all = listExamples();
    if (flag('json')) return log(JSON.stringify(all.map(({dir, ...e}) => e), null, 2));
    log(`${KIT_NAME} examples: ${all.length}  (open one: ${RUN_CMD} example <name>)\n`);
    let bad = 0;
    for (const e of all) {
      log(`  ${String(e.section).padStart(2, '0')}  ${e.name.padEnd(17)} ${e.title}\n      say: "${e.prompt}"`);
      const p = flag('check') ? exampleProblems(e) : [];
      for (const x of p) log(`      FIX ${x}`);
      bad += p.length;
    }
    if (bad) process.exitCode = 1;
    return;
  }
  if (cmd === 'example') {
    const {findExample, listExamples, serveExamples, copyExample} = await import('../lib/examples.mjs');
    const ex = findExample(pos[1] || '');
    if (!ex) return log(`no example "${pos[1] || ''}". The list: ${RUN_CMD} examples\n  ${listExamples().map((e) => e.name).join(', ')}`), (process.exitCode = 1);
    if (opt('copy')) {
      if (ex.name === 'opening') return log('the opening plays the other examples, so it only runs inside the kit: open it without --copy'), (process.exitCode = 1);
      const to = copyExample(ex, opt('copy'));
      log(`${to}\n  your copy of "${ex.title}". three.js comes from a pinned CDN, so any static server works:\n  npx serve ${path.relative(process.cwd(), to) || '.'}   (or open it in VS Code Live Server)`);
      return;
    }
    const s = await serveExamples(Number(opt('port', 4180)));
    globalThis.__serving = true;
    const url = `${s.url}/examples/${path.basename(ex.dir)}/`;
    log(`${ex.title}  ${url}\n  say: "${ex.prompt}"\n  (ctrl-c to stop)`);
    open(url);
    return;
  }
  if (cmd === 'demo') {
    const L = await loadAll();
    const dir = path.resolve(pos[1] || opt('dir') || `${KIT_NAME}-demo`);
    const P = projectPaths(dir);
    if (!fs.existsSync(P.spec)) writeJson(P.spec, readJson(path.join(KIT, 'examples', 'scene-json', 'toy-studio', 'scene.json')));
    const {spec} = L.loadSpec(dir);
    log(banner());
    log(`${KIT_NAME} ${VERSION} · open source by CONNECT AI LAB`);
    log(`demo scene: ${P.spec}`);
    const t = Date.now();
    const w = await L.buildWeb(dir, spec, {log});
    log(`web page ready in ${secs(t)}. ${flag('no-open') || process.env.CI ? `Open ${path.relative(process.cwd(), w.file)}` : 'Opening it'}: drag to look around.`);
    open(w.file);
    log(`\nnext:\n  ${RUN_CMD} make ${path.relative(process.cwd(), dir) || '.'}      (self-check + video + sheet)\n  ${RUN_CMD} install             (teach your AI agent the spec and the catalog)\n  edit scene.json, or tell your agent: "change the text to my name and make it a 9:16 short"`);
    return;
  }
  if (cmd === 'new') {
    const {draftSpec} = await import('../lib/draft.mjs');
    const words = pos.slice(1).join(' ');
    if (!words) return log(`say what you want to see: ${RUN_CMD} new "'MY SHOP' logo in a pastel cafe, slow orbit"`);
    const {spec, notes} = draftSpec(words);
    const dir = path.resolve(opt('dir') || spec.name);
    const P = projectPaths(dir);
    if (fs.existsSync(P.spec) && !flag('force')) {
      writeJson(path.join(dir, 'scene.draft.json'), spec);
      log(`kept your scene.json; the new draft is in ${path.join(dir, 'scene.draft.json')}`);
    } else writeJson(P.spec, spec);
    log(`${P.spec}`);
    for (const n of notes) log(`  ${n}`);
    log(`next: ${RUN_CMD} make ${path.relative(process.cwd(), dir) || '.'}`);
    return;
  }
  if (cmd === 'use') {
    const {findItem} = await import('../lib/catalog.mjs');
    const it = findItem(pos[1] || '');
    if (!it) return log(`no catalog item "${pos[1] || ''}". List them: ${KIT_NAME} catalog`), (process.exitCode = 1);
    const dir = path.resolve(pos[2] || opt('dir') || it.id);
    const P = projectPaths(dir);
    if (fs.existsSync(P.spec) && !flag('force')) return log(`${P.spec} exists (add --force to replace it)`), (process.exitCode = 1);
    writeJson(P.spec, it.spec);
    log(`${P.spec}  (${it.group}/${it.id}: ${it.about})\nnext: ${RUN_CMD} make ${path.relative(process.cwd(), dir) || '.'}`);
    return;
  }
  if (cmd === 'catalog') {
    const {loadIndex, buildIndex} = await import('../lib/catalog.mjs');
    const idx = flag('build') ? buildIndex() : loadIndex();
    if (flag('json')) return log(JSON.stringify(idx, null, 2));
    const only = pos[1];
    log(`${KIT_NAME} catalog: ${idx.count} items`);
    for (const g of idx.groups) {
      if (only && only !== g.id) continue;
      log(`\n${g.title} (${g.count}): ${g.about}`);
      for (const it of idx.items.filter((i) => i.group === g.id)) log(`  ${it.id.padEnd(22)} ${it.about}${only ? `\n${''.padEnd(25)}say: "${it.prompt}"` : ''}`);
    }
    log(`\nstart from one: ${RUN_CMD} use <id>`);
    return;
  }
  if (cmd === 'install' || cmd === 'uninstall') {
    const {installSkill, removeSkill} = await import('../lib/install.mjs');
    const o = {agent: opt('agent', 'all'), dir: opt('dir'), project: flag('project'), dryRun: flag('dry-run'), log};
    log(`${KIT_NAME} skill ${cmd}${o.dryRun ? ' (dry run)' : ''}`);
    if (cmd === 'install') {
      log(banner());
      installSkill(o);
      log(`now tell your agent what you want to see, for example:\n  "Use ${KIT_NAME}: my name in gold 3D letters over a night city, as a web hero and a 6 s video."`);
    } else removeSkill(o);
    return;
  }
  if (cmd === 'doctor') {
    const {doctor} = await import('../lib/doctor.mjs');
    if (!(await doctor(log))) process.exitCode = 1;
    return;
  }

  const L = await loadAll();
  if (cmd === 'make') {
    const r = await cmdMake(pos[1]);
    if (!r.ok) process.exitCode = 1;
    return;
  }
  if (cmd === 'on-video') {
    const video = pos[1];
    if (!video || !fs.existsSync(video)) return log(`give a video file: ${RUN_CMD} on-video talk.mp4 [folder]`), (process.exitCode = 1);
    const src = path.resolve(video);
    const dir = path.resolve(pos[2] || opt('dir') || path.join(path.dirname(src), path.basename(src).replace(/\.[^.]+$/, '') + '-three'));
    const P = projectPaths(dir);
    fs.mkdirSync(P.assets, {recursive: true});
    const rel = 'assets/' + path.basename(src);
    if (!fs.existsSync(path.join(dir, rel))) fs.copyFileSync(src, path.join(dir, rel));
    // face box: --face x,y,w,h (fractions of the frame), or --faces face.json from connect-ai-video-motion
    let keepOut = [];
    if (opt('face')) {
      const [x, y, w, h] = opt('face').split(',').map(Number);
      keepOut = [{x, y, w, h}];
    } else if (opt('faces') && fs.existsSync(opt('faces'))) {
      const f = readJson(opt('faces'));
      const b = (f.samples || []).map((s) => s.box).filter(Boolean);
      if (b.length) {
        const x0 = Math.min(...b.map((v) => v[0])), y0 = Math.min(...b.map((v) => v[1])), x1 = Math.max(...b.map((v) => v[0] + v[2])), y1 = Math.max(...b.map((v) => v[1] + v[3]));
        const m = 0.02;
        keepOut = [{x: +(x0 / f.width - m).toFixed(4), y: +(y0 / f.height - m).toFixed(4), w: +((x1 - x0) / f.width + m * 2).toFixed(4), h: +((y1 - y0) / f.height + m * 2).toFixed(4)}];
      }
    }
    if (!fs.existsSync(P.spec)) {
      const right = !keepOut.length || keepOut[0].x + keepOut[0].w / 2 < 0.5;
      writeJson(P.spec, {
        name: path.basename(dir), duration: Number(opt('at') ? 6 : 6), look: 'on-video', keepOut,
        camera: {position: [0, 1.2, 6.5], target: [0, 0.9, 0], fov: 34},
        objects: [
          {id: 'floor', type: 'floor', kind: 'shadow', position: [0, -0.2, 0]},
          {id: 'object', type: 'rings', radius: 0.62, position: [right ? 2.1 : -2.1, 1.25, 0], motion: [{type: 'pop', at: 0.3}, {type: 'float', amp: 0.06}]},
        ],
      });
      log(`made ${P.spec} (edit the object, or ask your agent)`);
    } else if (keepOut.length) {
      // a folder drafted with "new" (or written by an agent) gets the face box too, so the check really guards the face
      const s0 = readJson(P.spec);
      s0.keepOut = [...keepOut, ...(s0.keepOut || []).filter((k) => k.front)];
      writeJson(P.spec, s0);
      log(`  face box added to ${path.basename(dir)}/scene.json: the check keeps the 3D off your face`);
    }
    // person matte: --matte <folder of m_000000.png ...> (connect-ai-video-motion writes one in work/matte). With it
    // every 3D object is drawn behind the person, so nothing can ever sit in front of a face or a hand.
    let matte = null;
    if (opt('matte') && fs.existsSync(opt('matte'))) {
      const from = path.resolve(opt('matte'));
      const names = fs.readdirSync(from).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort();
      if (names.length) {
        const to = path.join(P.assets, 'matte');
        fs.mkdirSync(to, {recursive: true});
        for (const n of names) if (!fs.existsSync(path.join(to, n))) fs.copyFileSync(path.join(from, n), path.join(to, n));
        const m = names[0].match(/^(.*?)(\d+)(\.\w+)$/);
        matte = {dir: 'assets/matte', pattern: m ? `${m[1]}%0${m[2].length}d${m[3]}` : names[0], fps: Number(opt('matte-fps', 30)), start: m ? Number(m[2]) : 0, count: names.length};
        log(`  person matte: ${names.length} frames, 3D goes behind the person`);
      }
    }
    writeJson(path.join(dir, 'video.json'), {src: rel, startFrom: Math.round(Number(opt('start', 0)) * 30), ...(matte ? {matte} : {})});
    if (!keepOut.length) log('  no face box given: add --face x,y,w,h (fractions) or --faces <face.json from connect-ai-video-motion> so the check can keep your face clear');
    const r = await cmdMake(dir);
    if (!r.ok) process.exitCode = 1;
    return;
  }
  // single steps
  const {spec, dir} = L.loadSpec(pos[1] || '.');
  const P = projectPaths(dir);
  if (cmd === 'check') {
    const t = Date.now();
    const r = await L.check(dir, spec, {target: opt('target', 'both')});
    printCheck(r, t);
    fs.mkdirSync(P.out, {recursive: true});
    fs.writeFileSync(path.join(P.out, 'report.md'), L.reportMd(spec.name || path.basename(dir), r));
    if (flag('json')) writeJson(path.join(P.out, 'check.json'), {ok: r.ok, errors: r.errors, advice: r.advice, numbers: r.numbers});
    log('  out/report.md');
    if (!r.ok) process.exitCode = 1;
  } else if (cmd === 'web') {
    const w = await L.buildWeb(dir, spec, {log, inline: flag('no-inline') ? false : 'auto'});
    if (flag('serve') || !w.inlined) {
      const s = await L.serve(path.dirname(w.file), Number(opt('port', 4173)));
      log(`  serving ${s.url}  (ctrl-c to stop)`);
      open(s.url);
    } else if (!flag('no-open')) open(w.file);
  } else if (cmd === 'video') {
    const t = Date.now();
    const video = readJson(path.join(dir, 'video.json'));
    const out = path.resolve(opt('out') || path.join(P.out, flag('alpha') ? 'overlay.mov' : 'video.mp4'));
    await L.renderVideo(dir, flag('alpha') ? {...spec, background: 'transparent'} : spec, out, {alpha: flag('alpha'), video: flag('alpha') ? (video && video.matte ? {matte: video.matte} : null) : video, scale: Number(opt('scale', 1)), r3f: flag('r3f'), log});
    log(`  ${path.relative(dir, out)}  (${secs(t)})`);
    if (flag('short')) {
      await L.renderVideo(dir, shortSpec(spec), path.join(P.out, 'short_9x16.mp4'), {log});
      log('  out/short_9x16.mp4');
    }
  } else if (cmd === 'sheet') {
    const times = opt('times') ? opt('times').split(',').map(Number) : sheetTimes(spec);
    await L.renderSheet(dir, spec, path.join(P.out, 'sheet.jpg'), {times, cols: Math.min(4, times.length), title: spec.name || path.basename(dir), keepOut: (spec.keepOut || []).length > 0});
    log('  out/sheet.jpg');
  } else if (cmd === 'still') {
    const t = Number(opt('at', (spec.duration ?? 5) * 0.6));
    const out = path.resolve(opt('out') || path.join(P.out, `still_${t.toFixed(2)}s.jpg`));
    await L.renderStillAt(dir, spec, out, t, {video: readJson(path.join(dir, 'video.json'))});
    log(`  ${path.relative(dir, out)}`);
  } else {
    log(`unknown command "${cmd}"\n`);
    log(HELP);
    process.exitCode = 1;
  }
}
main().then(() => {
  // the renderer keeps a browser alive: leave once the work is done (a --serve keeps running)
  if (!flag('serve') && !globalThis.__serving) setTimeout(() => process.exit(process.exitCode || 0), 50);
}).catch((e) => {
  console.error(`${KIT_NAME}: ${e && e.message ? e.message : e}`);
  if (process.env.DEBUG) console.error(e);
  process.exit(1);
});
