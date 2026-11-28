// connect-ai-three tests. `node tests/run.mjs` runs all; `--fast` skips the ones that open the headless browser.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as THREE from 'three';
import {KIT, readJson} from '../lib/paths.mjs';
import {names, normalizeSpec, validateSpec, specNeeds} from '../src/runtime/node-names.mjs';
import {cameraPose} from '../src/runtime/camera.js';
import {applyMotions, captureBase} from '../src/runtime/motion.js';
import {scriptedInput} from '../src/runtime/stage.js';
import {draftSpec, pickMood} from '../lib/draft.mjs';
import {judge, validate, LIMITS} from '../lib/check.mjs';
import {scanCatalog, loadIndex} from '../lib/catalog.mjs';
import {installSkill, removeSkill} from '../lib/install.mjs';
import {assetRefs, materialize, isDraco, dracoDir} from '../lib/project.mjs';
import {listExamples, exampleProblems, copyExample, resolveUrl, findExample} from '../lib/examples.mjs';
import {spawnSync} from 'node:child_process';
import zlib from 'node:zlib';
import {createRequire} from 'node:module';

const fast = process.argv.includes('--fast');
let pass = 0, fail = 0;
const tests = [];
const test = (name, fn, {browser = false} = {}) => tests.push({name, fn, browser});
const eq = (a, b, msg) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg || 'not equal'}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
};
const ok = (c, msg) => {
  if (!c) throw new Error(msg || 'expected true');
};
const N = names();
const V = (spec) => validateSpec(spec, N);
const good = {name: 't', duration: 3, objects: [{id: 'a', type: 'gem', motion: ['turntable']}]};

test('registry: every kind of name is loaded', () => {
  ok(N.objects.length >= 30 && N.materials.length >= 20 && N.post.length >= 11 && N.motions.length >= 20 && N.cameraMotions.length >= 9 && N.looks.length >= 8, JSON.stringify(Object.fromEntries(Object.entries(N).map(([k, v]) => [k, v.length]))));
});
test('spec: the look fills what the spec leaves out', () => {
  const s = normalizeSpec(good);
  ok(s.look === 'connect-gold-night' && s.lights.length >= 3 && s.post.some((p) => p.type === 'grain') && s.size.width === 1920 && s.fps === 30);
  eq(s.objects[0].motion, [{type: 'turntable'}], 'string motion becomes an object');
  ok(normalizeSpec({...good, post: []}).post.length === 0, 'an empty post list stays empty');
});
test('spec: normalizing twice adds addLights and addPost only once', () => {
  const once = normalizeSpec({...good, addPost: [{type: 'dof'}], addLights: [{type: 'rim'}]});
  const twice = normalizeSpec(once);
  eq(twice.post.length, once.post.length);
  eq(twice.lights.length, once.lights.length);
});
test('spec: a valid spec has no errors', () => eq(V(good).errors, []));
test('spec: unknown names are errors with a suggestion', () => {
  const e = V({...good, look: 'gold-nite', post: ['blom'], objects: [{id: 'a', type: 'text-3d', material: 'golden', motion: ['turntabel']}], camera: {motion: ['orbitt']}}).errors.map((x) => x.msg).join('\n');
  for (const want of ['look "gold-nite"', 'object type "text-3d"', '"text3d"', 'material "golden"', 'motion "turntabel"', '"turntable"', 'post "blom"', '"bloom"', 'camera motion "orbitt"']) ok(e.includes(want), `missing: ${want}\n${e}`);
});
test('spec: duplicate ids, odd sizes, no objects, card text in "body"', () => {
  ok(V({...good, objects: [{id: 'a', type: 'gem'}, {id: 'a', type: 'box'}]}).errors.some((e) => e.msg.includes('used twice')));
  ok(V({...good, size: {width: 1281, height: 720}}).errors.some((e) => e.msg.includes('even')));
  ok(V({...good, objects: []}).errors.some((e) => e.msg.includes('no objects')));
  ok(V({...good, objects: [{id: 'c', type: 'card', title: 'x', body: 'small text'}]}).errors.some((e) => e.msg.includes('"body" is for physics')));
  ok(V({...good, objects: [{id: 'a', type: 'gem', motion: [{type: 'pop', at: 9}]}]}).advice.some((e) => e.msg.includes('after the scene ends')));
  ok(V({...good, objects: [{id: 't', type: 'text3d', text: '훈민정음'}]}).errors.some((e) => e.msg.includes('built-in fonts do not have')), 'Korean 3D text needs a font file');
  eq(V({...good, objects: [{id: 't', type: 'text3d', text: '모두를 위한 AI 교육', font: 'sans'}]}).errors, [], 'the Korean brand words are built into the sans faces');
  ok(V({...good, objects: [{id: 't', type: 'text3d', text: '모두를 위한 AI 교육', font: 'serif'}]}).errors.length === 1, 'but not into the serif faces');
  eq(V({...good, objects: [{id: 't', type: 'text3d', text: '훈민정음', fontFile: 'assets/f.ttf'}]}).errors, [], 'with a font file it is fine');
  ok(specNeeds({...good, objects: [{type: 'text3d', text: '안녕', fontFile: 'assets/f.ttf'}]}).includes('ttf'));
});
test('spec: only the adapters a spec uses are named', () => {
  eq(specNeeds(good), []);
  const n = specNeeds({...good, env: 'hdri', post: ['dof'], objects: [{type: 'text3d', text: 'A', bodyEach: true}, {type: 'gltf', src: 'm.glb'}]});
  for (const k of ['text3d', 'font:bold', 'physics', 'gltf', 'bvh', 'hdri', 'post-extra']) ok(n.includes(k), `needs ${k}: ${n}`);
  // the brand prop set: its own adapter, the text adapter, and only the typeface each object uses
  const w = specNeeds({...good, objects: [{type: 'wordmark'}, {type: 'building'}, {type: 'text3d', text: 'A', font: 'display'}]});
  for (const k of ['brand', 'text3d', 'font:light', 'font:sans', 'font:serif-bold']) ok(w.includes(k), `needs ${k}: ${w}`);
  ok(!w.includes('font:bold') && !w.includes('font:thin'), `no unused typeface: ${w}`);
  eq(specNeeds({...good, objects: [{type: 'monogram'}]}).filter((k) => k.startsWith('font:')), [], 'a prop without letters ships no typeface');
  ok(!specNeeds({...good, objects: [{type: 'card', title: 'x', text: 'y'}]}).includes('physics'));
});
test('camera: a pure function of time', () => {
  const cam = {position: [0, 1, 6], target: [0, 1, 0], motion: [{type: 'orbit', from: -30, to: 30, dur: 4}, {type: 'dolly', from: 1.2, to: 0.8, dur: 4}, {type: 'handheld'}]};
  const a = cameraPose(cam, 1.7), _ = cameraPose(cam, 3.9), b = cameraPose(cam, 1.7);
  eq(a.position.toArray(), b.position.toArray(), 'same t, same pose');
  ok(cameraPose(cam, 0).position.x < 0 && cameraPose(cam, 4).position.x > 0, 'orbit crosses the middle');
  ok(cameraPose(cam, 4).position.length() < cameraPose(cam, 0).position.length(), 'dolly moves in');
});
test('camera: shots end on the last shot', () => {
  const p = cameraPose({position: [0, 1, 6], target: [0, 1, 0], motion: [{type: 'shots', list: [{at: 0, dur: 1, position: [3, 2, 3], target: [1, 1, 0]}, {at: 2, dur: 1, position: [-4, 1, 2], target: [0, 0.5, 0], fov: 50}]}]}, 5);
  eq(p.position.toArray().map((x) => +x.toFixed(4)), [-4, 1, 2]);
  eq(p.fov, 50);
});
test('motion: same time gives the same pose, in any order', () => {
  const mk = () => {
    const g = new THREE.Group();
    g.position.set(1, 2, 3);
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
      c.position.set(i - 1, 0, 0);
      g.add(c);
    }
    captureBase(g);
    return g;
  };
  const M = [{type: 'turntable', speed: 30}, {type: 'float'}, {type: 'rise', at: 0.2}, {type: 'pop', at: 0.1}, {type: 'explode', at: 1, dur: 1}, {type: 'stagger', at: 0.2}];
  const snap = (g) => [g.position.toArray(), g.quaternion.toArray(), g.scale.toArray(), g.children.map((c) => [c.position.toArray(), c.scale.toArray()])];
  const a = mk(), b = mk();
  for (const t of [0, 3.1, 0.4, 2.2, 1.5]) applyMotions(a, M, t, null);
  applyMotions(b, M, 1.5, null);
  eq(snap(a), snap(b));
  applyMotions(a, M, 0, null);
  ok(a.visible === false, 'hidden before its rise starts');
});
test('pointer script: smooth between keys, clicks remembered', () => {
  const s = [{t: 0, x: -1, y: 0}, {t: 2, x: 1, y: 0, click: 'gem'}, {t: 4, x: 1, y: 1}];
  eq(scriptedInput(s, 1).pointer, [0, 0]);
  eq(scriptedInput(s, 9).pointer, [1, 1]);
  eq(scriptedInput(s, 1).clicks, {});
  eq(scriptedInput(s, 3).clicks, {gem: 2});
  ok(scriptedInput([], 1) === null);
});
test('draft: words become a spec that validates', () => {
  const cases = [
    ["gold logo 'AI MENTOR JAY' over a night city, slow orbit, 5s", (s) => s.look === 'connect-night-city' && s.objects.some((o) => o.type === 'wordmark' && o.text === 'AI MENTOR JAY') && s.duration === 5],
    ["my studio building with the sign 'JANE STUDIO' at night in the city", (s) => s.objects.some((o) => o.type === 'building' && o.sign === 'JANE STUDIO') && s.look === 'connect-night-city'],
    ['내 마이크를 밝은 스튜디오에', (s) => s.objects.some((o) => o.type === 'microphone') && s.look === 'pale-studio'],
    ['a chrome liquid blob, vertical short', (s) => s.objects.some((o) => o.type === 'blob' && o.material === 'chrome') && s.size.height === 1920],
    ['interactive hero for my website with a gem', (s) => s.interact.includes('hover') && s.objects.some((o) => o.type === 'gem')],
    ['내 영상 위에 3D 로고', (s) => s.look === 'on-video' && s.objects[0].kind === 'shadow'],
    ['밤 도시 위에 금색 글자 "CONNECT" 떨어지는 물리', (s) => s.look === 'connect-night-city' && s.objects.some((o) => o.bodyEach)],
    // 0.3: Korean words the built-in font covers become a real 3D wordmark; other Korean stays a flat label (never broken text3d)
    ['밤 도시 위에 금색 글자 "커넥트"', (s) => s.objects.some((o) => o.type === 'wordmark' && o.text === '커넥트') && !s.objects.some((o) => o.type === 'text3d')],
    ['밤 도시 위에 금색 글자 "햇살김밥"', (s) => s.objects.some((o) => o.type === 'label' && o.text === '햇살김밥') && !s.objects.some((o) => o.type === 'text3d' || o.type === 'wordmark')],
    ['삼각대 위 시네마 카메라, 천천히 도는 카메라', (s) => s.objects.some((o) => o.type === 'cinema-camera')],
    // "black" that describes the room does not take the gold away from the letters
    ['gold title "HELLO" on a black stage, 4s', (s) => s.objects.some((o) => /text3d|wordmark/.test(o.type) && (o.material === 'gold' || o.material?.preset === 'gold'))],
    ['slow orbit around a gold logo "CONNECT AI LAB"', (s) => !s.objects.some((o) => o.type === 'cinema-camera')],
    ['bar chart 3 5 8 12 in a bright studio', (s) => s.look === 'pale-studio' && s.objects.some((o) => o.type === 'bars' && o.values.length === 4)],
    ['', (s) => s.objects.length >= 1],
  ];
  for (const [w, t] of cases) {
    const {spec} = draftSpec(w);
    ok(t(spec), `draft "${w}": ${JSON.stringify(spec).slice(0, 300)}`);
    eq(V(spec).errors, [], `draft "${w}" validates`);
  }
});
test('draft: the sentence picks the mood, different sentences get different rooms', () => {
  eq(pickMood('our pastel cafe logo'), 'pastel');
  eq(pickMood('장난감 가게 로고'), 'toy');
  eq(pickMood('노을 지는 해변'), 'sunset');
  eq(pickMood('neon club sign'), 'neon');
  eq(pickMood('종이로 만든 동화'), 'paper');
  eq(pickMood('premium gold watch'), 'luxury');
  const seen = new Set(['MY SHOP', 'TOY BOX', 'HELLO', 'BREAD', 'JANE', 'SEOUL', 'NOVA', 'MAPLE'].map((t) => pickMood(`'${t}' logo, slow orbit`)));
  ok(seen.size >= 3, `plain sentences should not all get one room: ${[...seen]}`);
  for (const w of ["'MY SHOP' logo in a pastel cafe, slow orbit", '노을 지는 사막 위 "SUN"', 'neon club sign "NIGHT"', 'paper craft story "ONCE"', "'TOY BOX' for kids"]) {
    const {spec} = draftSpec(w);
    eq(V(spec).errors, [], `mood draft "${w}" validates`);
  }
});
test('catalog: every item validates, ids are unique, the index matches the files', () => {
  const items = scanCatalog();
  ok(items.length >= 120, `only ${items.length} items`);
  eq(loadIndex().count, items.length, 'index count');
  eq(new Set(items.map((i) => `${i.group}/${i.id}`)).size, items.length, 'unique ids');
  for (const it of items) {
    const r = V(it.spec);
    eq(r.errors, [], `${it.group}/${it.id}`);
    ok(it.prompt && it.about && it.source && it.license, `${it.id}: prompt, about, source, license`);
  }
  // 0.2: no example stars a bare tutorial shape. Every item shows a studio prop, letters, the user's own file or one of
  // our composed objects; cubes, spheres and knots only appear as parts of something.
  const PLAIN = new Set(['box', 'sphere', 'torus', 'knot', 'cylinder', 'cone', 'capsule', 'plane', 'disc', 'ring', 'gem', 'rounded-box', 'teapot', 'parametric', 'blob', 'floor', 'backglow', 'group']);
  const types = (o, out = []) => {
    out.push(o.type);
    (o.children || []).forEach((c) => types(c, out));
    return out;
  };
  // (the one exception is the "primitives" item itself: its six shapes are put together as our mark)
  const bare = items.filter((it) => it.spec.objects.flatMap((o) => types(o)).every((t) => PLAIN.has(t)) && !['primitives'].includes(it.id));
  eq(bare.map((i) => `${i.group}/${i.id}`), [], 'examples whose only subject is a plain shape');
  // and the examples are spread over the looks: none of them carries more than 40 % of the catalog
  const looks = {};
  for (const it of items) looks[it.spec.look || 'own light'] = (looks[it.spec.look || 'own light'] || 0) + 1;
  ok(Object.keys(looks).length >= 8 && Math.max(...Object.values(looks)) / items.length < 0.4, `looks: ${JSON.stringify(looks)}`);
  // every registered object, material, motion, camera move, post pass and look has its own item
  const have = (g) => new Set(items.filter((i) => i.group === g).map((i) => i.id));
  for (const m of N.materials) ok(have('material').has(m) || m === 'shadow', `material ${m} has no catalog item`);
  for (const m of N.motions) ok(have('motion').has(m), `motion ${m} has no catalog item`);
  for (const m of N.cameraMotions) ok(have('camera').has(m), `camera ${m} has no catalog item`);
  for (const m of N.post) ok(have('post').has(m), `post ${m} has no catalog item`);
  for (const m of N.looks) ok(have('look').has(m), `look ${m} has no catalog item`);
  const used = new Set();
  const walk = (o) => (used.add(o.type), (o.children || []).forEach(walk));
  items.forEach((i) => {
    const s = normalizeSpec(i.spec);
    s.objects.forEach(walk);
    s.backdrop.forEach(walk);
    if (s.background && s.background.type === 'sky') used.add('sky');
  });
  for (const o of N.objects) ok(used.has(o), `object type ${o} is never used in the catalog`);
});
test('examples: every example validates and finds its files', () => {
  for (const d of fs.readdirSync(path.join(KIT, 'examples', 'scene-json'))) {
    const f = path.join(KIT, 'examples', 'scene-json', d, 'scene.json');
    if (!fs.existsSync(f)) continue;
    const spec = readJson(f);
    eq(V(spec).errors, [], d);
    // the model files stay in the repo, not in the npm package: check them where they are
    if (fs.existsSync(path.join(KIT, 'examples', 'scene-json', d, 'assets'))) for (const m of JSON.stringify(spec).matchAll(/"src":"(assets\/[^"]+)"/g)) ok(fs.existsSync(path.join(KIT, 'examples', 'scene-json', d, m[1])), `${d}: ${m[1]} missing`);
  }
});
// --- the example pages ---
const inRepo = fs.existsSync(path.join(KIT, '.git'));
test('examples: one page per section from 0 up, each well formed', () => {
  const all = listExamples();
  ok(all.length >= 28, `only ${all.length} examples`);
  eq(all.map((e) => e.section), all.map((_, i) => i), 'sections');
  for (const e of all) {
    eq(exampleProblems(e), [], e.folder);
    ok(e.sources.length > 0, `${e.folder}: no sources`);
    const html = fs.readFileSync(path.join(e.dir, 'index.html'), 'utf8');
    if (e.renderer !== 'html') ok(/"three": "\.\.\/_three\/build\/three\.(module|webgpu)\.js"/.test(html), `${e.folder}: import map does not use the kit's three`);
    // previews stay in the repo (they are left out of the npm package)
    if (inRepo) for (const f of ['preview.jpg', 'preview.mp4']) ok(fs.existsSync(path.join(e.dir, f)), `${e.folder}: no ${f}`);
  }
});
// --- v0.6: the community library, the community examples, the scout ---
const LIB = JSON.parse(fs.readFileSync(path.join(KIT, 'catalog', 'community.json'), 'utf8'));
const OK_LIC = ['MIT', 'Apache-2.0', 'CC0-1.0', 'ISC', 'Zlib', 'BSD-2-Clause', 'BSD-3-Clause', 'Unlicense'];
test('library: every entry has the schema, a cleared licence and a real link', () => {
  const ids = new Set();
  ok(LIB.filter((c) => c.kind === 'code').length >= 68, 'at least the 68 checked works');
  for (const c of LIB) {
    ok(!ids.has(c.id), `${c.id} twice`);
    ids.add(c.id);
    for (const k of ['id', 'kind', 'category', 'categoryKo', 'title', 'what', 'whatKo', 'say', 'sayKo', 'author', 'videoFit']) ok(c[k] != null && c[k] !== '', `${c.id}: no ${k}`);
    ok([1, 2, 3].includes(c.videoFit), `${c.id}: videoFit`);
    if (c.viral) ok(/^https:\/\/(x\.com|www\.threads\.(com|net))\//.test(c.viral.url) && c.viral.numbers && /^\d{4}-\d\d-\d\d$/.test(c.viral.recorded), `${c.id}: viral`);
    if (c.kind === 'code') {
      ok(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(c.repo), `${c.id}: repo`);
      ok(OK_LIC.includes(c.license), `${c.id}: licence ${c.license}`);
      ok(['none', 'CC0', 'MIT-in-repo', 'strip', 'check'].includes(c.assets), `${c.id}: assets ${c.assets}`);
      if (c.example) ok(fs.existsSync(path.join(KIT, 'examples', c.example, 'example.json')), `${c.id}: example ${c.example} missing`);
    } else {
      eq(c.kind, 'prompt', `${c.id}: kind`);
      ok(c.prompt && c.prompt.length > 10 && c.post && /^https:\/\/x\.com\//.test(c.post), `${c.id}: prompt and post`);
      ok(!c.repo || c.codeLicense === 'none', `${c.id}: a prompt entry ships no code`);
    }
  }
});
test('library: the README tables are in sync with catalog/community.json', () => {
  for (const f of ['README.md', 'README.ko.md']) {
    const md = fs.readFileSync(path.join(KIT, f), 'utf8');
    for (const c of LIB) ok(md.includes(`| ${c.id} |`), `${f}: ${c.id} not in the library table (run node tools/make-library-table.mjs)`);
  }
});
test('community examples: credit, licence texts, film block, 16:9 and 9:16 previews', () => {
  const com = listExamples().filter((e) => e.community);
  ok(com.length >= 12, `${com.length} community examples`);
  for (const e of com) {
    const c = e.community;
    ok(c.author && c.kind && (c.kind === 'prompt' ? c.post : c.repo && OK_LIC.includes(c.license)), `${e.folder}: community block`);
    const lic = fs.readdirSync(e.dir).filter((f) => /^LICENSE-.*\.(txt|md)$/.test(f));
    if (c.kind === 'code') ok(lic.some((f) => f !== 'LICENSE-three.txt'), `${e.folder}: no licence text of the source`);
    ok(lic.includes('LICENSE-three.txt'), `${e.folder}: no LICENSE-three.txt`);
    ok(e.film && e.film.seconds > 0, `${e.folder}: no film block`);
    if (inRepo) for (const f of ['preview.jpg', 'preview.mp4', 'preview-9x16.mp4']) ok(fs.existsSync(path.join(e.dir, f)), `${e.folder}: no ${f}`);
    // no audio or model file we could not clear
    const walk = (d) => fs.readdirSync(d, {withFileTypes: true}).flatMap((x) => (x.isDirectory() ? walk(path.join(d, x.name)) : [path.join(d, x.name)]));
    for (const f of walk(e.dir)) ok(!/\.(mp3|ogg|wav|m4a|flac)$/i.test(f), `${e.folder}: ships audio ${path.basename(f)}`);
    const notice = fs.readFileSync(path.join(KIT, 'NOTICE.md'), 'utf8');
    ok(notice.includes(e.folder), `NOTICE.md does not credit ${e.folder}`);
  }
  // 23: three r187 no longer calls Material.onBuild; the example re-injects its shader inputs and says so
  const chase = listExamples().find((e) => e.name === 'police-chase');
  const jsIn = (d) => fs.readdirSync(d, {withFileTypes: true}).flatMap((x) => (x.isDirectory() ? jsIn(path.join(d, x.name)) : x.name.endsWith('.js') ? [path.join(d, x.name)] : []));
  if (chase) ok(jsIn(chase.dir).some((f) => fs.readFileSync(f, 'utf8').includes('patchedOnBuild')), 'police-chase: onBuild patch missing');
});
test('scout: licence text, stop rules, words', async () => {
  const {spdxFromText, licenceVerdict, words, rankLibrary} = await import('../lib/scout.mjs');
  eq(spdxFromText(fs.readFileSync(path.join(KIT, 'LICENSE'), 'utf8')), 'MIT');
  eq(spdxFromText('GNU AFFERO GENERAL PUBLIC LICENSE Version 3'), 'AGPL-3.0');
  eq(spdxFromText('PolyForm Noncommercial License 1.0.0'), 'PolyForm-Noncommercial');
  eq(spdxFromText('Attribution-NonCommercial-ShareAlike 4.0'), 'NC');
  eq(spdxFromText(''), 'NONE');
  for (const bad of ['NONE', 'GPL', 'AGPL-3.0', 'NC', 'PolyForm-Noncommercial', 'View-Only', 'UNKNOWN']) ok(!licenceVerdict(bad).ok, bad);
  for (const good of ['MIT', 'Apache-2.0', 'CC0-1.0']) ok(licenceVerdict(good).ok, good);
  ok(words('노을 진 바다 위 드래곤').includes('ocean') && words('노을 진 바다 위 드래곤').includes('dragon'), 'Korean words map to English');
  ok(!words('금빛 태엽 나비').includes('rain') && words('금빛 태엽 나비').includes('butterfly') && words('비 오는 밤').includes('rain'), 'one-letter Korean words match only on their own');
  ok(rankLibrary('음악 채널 블랙홀 비트').some((x) => x.source === 'prompt' || /black-hole/.test(x.example || '')), 'shared prompts are ranked too');
  const r = rankLibrary('a glass tank of water with caustics for my drink');
  eq(r[0].example, '13-caustic-water', 'the caustic example wins its own sentence');
  const d = rankLibrary('드래곤이 봉우리 사이를 나는 오프닝 필름');
  ok(d.slice(0, 2).some((x) => x.example === '19-dragon-film'), JSON.stringify(d.slice(0, 3).map((x) => x.title)));
});
test('scout: GitHub-only mode finds something or says the rate limit cleanly', async () => {
  const {find} = await import('../lib/scout.mjs');
  const r = await find('ocean waves at sunset', {limit: 4});
  ok(r.library.length > 0, 'library results');
  const limited = r.github.notes.some((n) => /rate limit|failed/.test(n));
  ok(limited || r.github.results.length > 0, `no GitHub results and no clean note: ${JSON.stringify(r.github)}`);
  for (const x of r.github.results) ok(x.skip || OK_LIC.includes(x.license), `${x.id}: ${x.license} passed the stop rules`);
}, {browser: true});
test('scout: fetch copies licence-cleared code only, with the licence and SOURCES.md', async () => {
  const {fetchRepo} = await import('../lib/scout.mjs');
  const to = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'c3-fetch-')), 'caustic');
  const r = await fetchRepo('ScottieFox/caustic-volume', to);
  eq(r.license, 'MIT');
  ok(fs.existsSync(path.join(to, 'LICENSE-caustic-volume.txt')) && fs.existsSync(path.join(to, 'lite', 'index.html')), 'licence and code');
  const src = fs.readFileSync(path.join(to, 'SOURCES.md'), 'utf8');
  ok(src.includes('ScottieFox/caustic-volume') && src.includes('Left out') && src.includes('docs/lite.jpg'), 'SOURCES.md lists what was left out');
  ok(!fs.existsSync(path.join(to, 'docs', 'lite.jpg')), 'media left out');
  fs.rmSync(path.dirname(to), {recursive: true, force: true});
}, {browser: true});
test('examples: the server maps the import map and never leaves its roots', () => {
  ok(resolveUrl('/examples/_three/build/three.module.js'), 'three');
  ok(resolveUrl('/examples/_lib/rapier/dist/rapier.mjs'), 'rapier');
  ok(resolveUrl('/examples/06-physics/'), 'a page');
  for (const bad of ['/examples/../package.json', '/examples/%2e%2e/package.json', '/package.json', '/examples/_three/../../package.json']) eq(resolveUrl(bad), null, bad);
});
test('examples: a copy loads three.js from the pinned CDN and runs without the kit', () => {
  const to = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'c3-copy-')), 'mine');
  copyExample(findExample('physics'), to);
  const html = fs.readFileSync(path.join(to, 'index.html'), 'utf8');
  ok(html.includes('https://cdn.jsdelivr.net/npm/three@0.187.0/') && !html.includes('../_three/') && !html.includes('../_lib/'), 'import map rewritten');
  ok(fs.existsSync(path.join(to, 'main.js')) && fs.existsSync(path.join(to, 'LICENSE-three.txt')) && !fs.existsSync(path.join(to, 'preview.mp4')), 'files copied, previews left out');
  let threw = false;
  try { copyExample(findExample('physics'), to); } catch { threw = true; }
  ok(threw, 'never writes into a folder that is not empty');
  fs.rmSync(path.dirname(to), {recursive: true, force: true});
});
// ffmpeg and ffprobe ship with Remotion's compositor, so the colour tests need nothing else installed
const ff = (tool, args) => {
  const dir = path.dirname(createRequire(import.meta.url).resolve(`@remotion/compositor-${process.platform}-${process.arch}/package.json`));
  const env = {...process.env, DYLD_LIBRARY_PATH: dir, LD_LIBRARY_PATH: dir};
  const r = spawnSync(path.join(dir, tool), args, {env, maxBuffer: 1 << 26});
  if (r.status !== 0) throw new Error(`${tool} failed: ${String(r.stderr).slice(-400)}`);
  return r.stdout;
};
const colourTags = (file) => {
  const j = JSON.parse(ff('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=pix_fmt,color_range,color_space,color_primaries,color_transfer', '-of', 'json', file]).toString());
  return j.streams[0];
};
// what every video we ship must say about its colours: yuv420p, limited (tv) range, BT.709. A video tagged
// yuvj420p / pc / bt470bg plays with washed-out or shifted colours in YouTube, Premiere and QuickTime.
const BT709 = {pix_fmt: 'yuv420p', color_range: 'tv', color_space: 'bt709', color_transfer: 'bt709', color_primaries: 'bt709'};
test('video: every mp4 in examples/ and docs/ is yuv420p, tv range, BT.709', () => {
  const files = [];
  const walk = (d) => fs.existsSync(d) && fs.readdirSync(d, {withFileTypes: true}).forEach((x) => (x.isDirectory() ? walk(path.join(d, x.name)) : x.name.endsWith('.mp4') && files.push(path.join(d, x.name))));
  walk(path.join(KIT, 'examples'));
  walk(path.join(KIT, 'docs'));
  if (inRepo) ok(files.length > 100, `only ${files.length} videos found`);
  for (const f of files) {
    const t = colourTags(f);
    eq({pix_fmt: t.pix_fmt, color_range: t.color_range, color_space: t.color_space, color_transfer: t.color_transfer, color_primaries: t.color_primaries}, BT709, path.relative(KIT, f));
  }
});
// one frame of a video as RGB: a PNG with no row filters (so the pixels are just inflated bytes)
const frameRgb = (file, at, vf) => {
  const png = ff('ffmpeg', ['-v', 'error', '-ss', String(at), '-i', file, '-frames:v', '1', '-vf', `${vf},format=rgb24`, '-c:v', 'png', '-pred', 'none', '-f', 'image2pipe', '-']);
  const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
  const idat = [];
  for (let o = 8; o < png.length; ) {
    const len = png.readUInt32BE(o), type = png.toString('latin1', o + 4, o + 8);
    if (type === 'IDAT') idat.push(png.subarray(o + 8, o + 8 + len));
    o += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const rgb = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) raw.copy(rgb, y * w * 3, y * (w * 3 + 1) + 1, (y + 1) * (w * 3 + 1));
  return rgb;
};
// --- the judge, on made-up probe numbers (no browser) ---
const box = (id, x, y, w, h, extra = {}) => ({id, type: 'gem', visible: true, nan: false, inView: true, rect: {x, y, w, h}, ...extra});
const probeOf = (over = {}, sample = {}) => ({
  name: 't', size: [1920, 1080], fps: 30, duration: 3, errors: [],
  samples: [0, 1, 2].map((t) => ({t, ms: 3, ink: 0.2, mean: 40, contrast: 30, blown: 0, hash: 'a' + t, calls: 30, triangles: 20000, boxes: [box('a', 0.4, 0.4, 0.2, 0.2)], labels: [], ...sample})),
  frameMs: {median: 3, worst: 5}, determinism: [{t: 1, same: true}], stats: {textures: 3, geometries: 5, programs: 4, maxTexture: 1024, textureBytes: 1e6, passes: ['bloom'], lights: 3},
  warnings: [], left: {geometries: 1, textures: 0}, liveAfter: 0, leak: [1, 2, 3].map((round) => ({round, geometries: 1, textures: 0, live: 0})),
  phone: {ms: 4, frames: [{t: 0, ink: 0.2, boxes: [box('a', 0.3, 0.4, 0.4, 0.2)]}], calls: 30},
  ...over,
});
const J = (p, spec = good) => judge(normalizeSpec(spec), p);
const has = (list, id) => list.some((e) => e.id === id);
// packs/pro is optional (left out of the public repo): when it is there, every scene in it validates and finds its files
test('packs: every pack scene validates and its assets are there', () => {
  const root = path.join(KIT, 'packs');
  if (!fs.existsSync(root)) return;
  for (const pack of fs.readdirSync(root)) for (const d of fs.readdirSync(path.join(root, pack))) {
    const f = path.join(root, pack, d, 'scene.json');
    if (!fs.existsSync(f)) continue;
    const spec = readJson(f);
    eq(V(spec).errors, [], `${pack}/${d}`);
    for (const m of JSON.stringify(spec).matchAll(/"src":"(assets\/[^"]+)"/g)) ok(fs.existsSync(path.join(root, pack, d, m[1])), `${pack}/${d}: ${m[1]} missing`);
  }
});
test('check: a healthy scene passes', () => {
  const r = J(probeOf());
  ok(r.ok && !r.errors.length && !r.advice.length, JSON.stringify(r));
});
test('check: blank screen is an error; one empty frame is advice', () => {
  ok(has(J(probeOf({}, {ink: 0.0001})).errors, 'blank'));
  const p = probeOf();
  p.samples[0].ink = 0;
  const r = J(p);
  ok(r.ok && has(r.advice, 'blank'));
});
test('check: an object that is never in view, or NaN, is an error', () => {
  ok(has(J(probeOf({}, {boxes: [box('a', 3, 3, 0.1, 0.1, {inView: false})]})).errors, 'a'));
  ok(J(probeOf({}, {boxes: [box('a', 0, 0, 0, 0, {nan: true})]})).errors.some((e) => e.msg.includes('NaN')));
});
test('check: covering the face keep-out box is an error', () => {
  const spec = {...good, keepOut: [{x: 0.4, y: 0.1, w: 0.2, h: 0.4}]};
  ok(has(J(probeOf({}, {boxes: [box('a', 0.45, 0.2, 0.2, 0.2)]}), spec).errors, 'a'), 'overlap');
  ok(J(probeOf({}, {boxes: [box('a', 0.7, 0.2, 0.2, 0.2)]}), spec).ok, 'beside the face is fine');
  ok(J(probeOf({}, {boxes: [box('a', 0.45, 0.2, 0.2, 0.2, {shield: true})]}), spec).ok, 'allowOverFace is the only way through');
});
test('check: with a person matte objects may pass behind the face, but never over a "front" box', () => {
  const spec = {...good, behindPerson: true, keepOut: [{x: 0.4, y: 0.1, w: 0.2, h: 0.4}, {x: 0, y: 0.5, w: 0.46, h: 0.5, front: true}]};
  const behind = J(probeOf({}, {boxes: [box('a', 0.45, 0.2, 0.2, 0.2)]}), spec);
  ok(behind.ok && behind.advice.some((x) => x.msg.includes('person matte')), 'behind the person is allowed and said so');
  ok(has(J(probeOf({}, {boxes: [box('a', 0.1, 0.6, 0.2, 0.2)]}), spec).errors, 'a'), 'a mic arm in front of the person is not in the matte');
  ok(has(J(probeOf({}, {boxes: [box('a', 0.1, 0.6, 0.2, 0.2)]}), {...spec, behindPerson: false}).errors, 'a'), 'front boxes also count without a matte');
});
test('check: a different picture the second time is an error', () => ok(has(J(probeOf({determinism: [{t: 1, same: false}]})).errors, 'determinism')));
test('check: leaks: growing memory or a live context', () => {
  ok(has(J(probeOf({leak: [{round: 1, geometries: 1, textures: 0, live: 0}, {round: 2, geometries: 9, textures: 4, live: 0}]})).errors, 'leak'));
  ok(has(J(probeOf({leak: [{round: 1, geometries: 1, textures: 0, live: 1}]})).errors, 'leak'));
  ok(has(J(probeOf({leak: [{round: 1, error: 'context lost'}]})).errors, 'leak'));
});
test('check: budgets: triangles, draw calls, textures, frame time, phone, small text', () => {
  ok(has(J(probeOf({}, {triangles: LIMITS.trianglesError + 1})).errors, 'triangles'));
  ok(has(J(probeOf({}, {triangles: LIMITS.trianglesAdvice + 1})).advice, 'triangles'));
  ok(has(J(probeOf({}, {calls: 400})).advice, 'calls'));
  const p = probeOf();
  p.stats.maxTexture = 8192;
  ok(has(J(p).errors, 'texture'));
  ok(has(J(probeOf({frameMs: {median: 40, worst: 60}})).advice, 'frame-time'));
  ok(has(J(probeOf({phone: {ms: 4, frames: [{t: 0, ink: 0.2, boxes: [box('a', -0.2, 0.4, 1.4, 0.2)]}]}})).advice, 'phone'));
  ok(has(J(probeOf({}, {labels: [{text: 'tiny', px: 9}]})).advice, 'text'));
  ok(has(judge(normalizeSpec(good), probeOf({errors: ['object type "x" is not in the catalog']})).errors, 'build'));
});
test('files: kit assets are copied into the project, missing files are reported', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c3-test-'));
  const spec = {...good, env: 'hdri', objects: [{type: 'gltf', src: 'kit:astronaut.glb'}, {type: 'image', src: 'assets/mine.png'}]};
  eq(assetRefs(spec).sort(), ['assets/mine.png', 'kit:astronaut.glb', 'kit:studio_small_08_1k.hdr']);
  eq(materialize(dir, spec), ['assets/mine.png']);
  ok(fs.existsSync(path.join(dir, 'assets', 'kit', 'astronaut.glb')) && fs.existsSync(path.join(dir, 'assets', 'kit', 'studio_small_08_1k.hdr')));
  fs.rmSync(dir, {recursive: true, force: true});
});
test('files: a Draco-compressed model gets its decoder, a plain one does not', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c3-test-'));
  fs.mkdirSync(path.join(dir, 'assets'));
  const glb = (json) => {
    const j = Buffer.from(JSON.stringify(json));
    const pad = Buffer.alloc((4 - (j.length % 4)) % 4, 0x20);
    const head = Buffer.alloc(20);
    head.writeUInt32LE(0x46546c67, 0);
    head.writeUInt32LE(2, 4);
    head.writeUInt32LE(20 + j.length + pad.length, 8);
    head.writeUInt32LE(j.length + pad.length, 12);
    head.writeUInt32LE(0x4e4f534a, 16);
    return Buffer.concat([head, j, pad]);
  };
  fs.writeFileSync(path.join(dir, 'assets', 'a.glb'), glb({asset: {version: '2.0'}, extensionsUsed: ['KHR_draco_mesh_compression']}));
  fs.writeFileSync(path.join(dir, 'assets', 'b.glb'), glb({asset: {version: '2.0'}}));
  ok(isDraco(path.join(dir, 'assets', 'a.glb')) && !isDraco(path.join(dir, 'assets', 'b.glb')) && !isDraco(path.join(dir, 'nope.glb')));
  ok(!isDraco(path.join(KIT, 'assets', 'astronaut.glb')), 'the model that ships with the kit needs no decoder');
  ok(dracoDir(), 'three ships the decoder');
  eq(materialize(dir, {...good, objects: [{type: 'gltf', src: 'assets/b.glb'}]}), []);
  ok(!fs.existsSync(path.join(dir, 'assets', 'kit', 'draco')));
  eq(materialize(dir, {...good, objects: [{type: 'gltf', src: 'assets/a.glb'}]}), []);
  ok(fs.existsSync(path.join(dir, 'assets', 'kit', 'draco', 'draco_decoder.wasm')) && fs.existsSync(path.join(dir, 'assets', 'kit', 'draco', 'draco_wasm_wrapper.js')));
  fs.rmSync(dir, {recursive: true, force: true});
});
test('install: copies the skill, updates only its own folder, never follows a symlink', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'c3-home-'));
  fs.mkdirSync(path.join(home, '.claude'));
  const log = [];
  const o = {home, env: {}, log: (s) => log.push(s)};
  installSkill(o);
  const dest = path.join(home, '.claude', 'skills', 'connect-ai-three');
  ok(fs.existsSync(path.join(dest, 'SKILL.md')) && fs.existsSync(path.join(dest, 'catalog.json')) && fs.existsSync(path.join(dest, '.connect-ai-three.json')), log.join('\n'));
  installSkill(o);
  ok(log.some((l) => l.includes('update')));
  removeSkill(o);
  ok(!fs.existsSync(dest), 'removed');
  fs.mkdirSync(dest, {recursive: true});
  fs.writeFileSync(path.join(dest, 'mine.txt'), 'x');
  installSkill(o);
  ok(fs.existsSync(path.join(dest, 'mine.txt')) && !fs.existsSync(path.join(dest, 'SKILL.md')), 'a folder that is not ours is left alone');
  removeSkill(o);
  ok(fs.existsSync(path.join(dest, 'mine.txt')), 'and never removed');
  const home2 = fs.mkdtempSync(path.join(os.tmpdir(), 'c3-home-'));
  fs.mkdirSync(path.join(home2, 'real'));
  fs.symlinkSync(path.join(home2, 'real'), path.join(home2, '.claude'));
  const log2 = [];
  installSkill({home: home2, env: {}, log: (s) => log2.push(s)});
  ok(log2.some((l) => l.includes('blocked')) && !fs.existsSync(path.join(home2, 'real', 'skills')), 'symlink on the path');
  for (const h of [home, home2]) fs.rmSync(h, {recursive: true, force: true});
});
test('web: one html file, only the adapters the spec uses', async () => {
  const {buildWeb} = await import('../lib/web.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c3-web-'));
  const a = await buildWeb(dir, {...good, name: 'web-test', page: {title: 'Hello <there>'}});
  const html = fs.readFileSync(a.file, 'utf8');
  ok(html.includes('Hello') && html.includes('&lt;there&gt;') && html.includes('"web-test"') && html.includes('id="stage"'), 'page content');
  ok(a.bytes < 1.4 * 1024 * 1024, `core page is ${(a.bytes / 1048576).toFixed(2)} MB`);
  ok(!html.includes('CAL Sans') && !html.includes('CAL Serif') && !/rapier/i.test(html), 'no fonts, no physics in a page that needs neither');
  const b = await buildWeb(dir, {...good, objects: [{type: 'text3d', text: 'HI', bodyEach: true}, {type: 'gltf', src: 'kit:astronaut.glb'}], env: 'hdri'});
  const html2 = fs.readFileSync(b.file, 'utf8');
  ok(/rapier/i.test(html2) && b.inlined && html2.includes('data:model/gltf-binary;base64,') && b.needs.includes('font:bold') && html2.includes('CAL Sans Bold') && !html2.includes('CAL Serif'), 'adapters and assets inlined when used');
  fs.rmSync(dir, {recursive: true, force: true});
});
test('package: no private paths, mail addresses or keys in the files we ship', () => {
  const pkg = readJson(path.join(KIT, 'package.json'));
  const bad = [];
  const walk = (p) => {
    const st = fs.statSync(p);
    if (st.isDirectory()) return fs.readdirSync(p).forEach((n) => n !== 'node_modules' && walk(path.join(p, n)));
    if (!/\.(mjs|js|ts|tsx|json|md|html|svg|txt)$/.test(p) || st.size > 2e6) return;
    const s = fs.readFileSync(p, 'utf8');
    if (/\/Users\/[a-z]/i.test(s)) bad.push(`${p}: /Users path`);
    if (/[A-Za-z0-9._%+-]+@(gmail|naver|kakao|icloud|daum)\.[a-z]+/.test(s)) bad.push(`${p}: mail address`);
    if (/(sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{20,}|ghp_[A-Za-z0-9]{20,}|npm_[A-Za-z0-9]{20,})/.test(s)) bad.push(`${p}: key`);
    if (/Co-Authored-By|Generated with \[?Claude/i.test(s) && !p.endsWith('run.mjs')) bad.push(`${p}: attribution line`);
  };
  for (const f of pkg.files) if (fs.existsSync(path.join(KIT, f))) walk(path.join(KIT, f));
  if (fs.existsSync(path.join(KIT, 'docs'))) walk(path.join(KIT, 'docs'));
  eq(bad, []);
});
// --- with the headless browser ---
const tmpProject = () => fs.mkdtempSync(path.join(os.tmpdir(), 'c3-proj-'));
test('browser: a small scene passes the real self-check', async () => {
  const {check} = await import('../lib/check.mjs');
  const dir = tmpProject();
  const r = await check(dir, {name: 'ok', duration: 2, size: {width: 640, height: 360}, objects: [{id: 'floor', type: 'floor'}, {id: 'gem', type: 'gem', position: [0, 1, 0], motion: ['turntable']}]}, {samples: 5});
  ok(r.ok, JSON.stringify(r.errors));
  ok(r.numbers.calls > 2 && r.numbers.triangles > 20 && r.probe.determinism.every((d) => d.same) && r.probe.leak.every((l) => l.live === 0), JSON.stringify(r.numbers));
  fs.rmSync(dir, {recursive: true, force: true});
}, {browser: true});
test('browser: an object far outside the frame fails; an object on the face fails', async () => {
  const {check} = await import('../lib/check.mjs');
  const dir = tmpProject();
  const away = await check(dir, {name: 'away', duration: 2, size: {width: 640, height: 360}, look: 'on-video', objects: [{id: 'gem', type: 'gem', position: [60, 1, 0]}]}, {samples: 4});
  ok(!away.ok && away.errors.some((e) => e.id === 'gem' || e.id === 'blank'), JSON.stringify(away.errors));
  const face = await check(dir, {name: 'face', duration: 2, size: {width: 640, height: 360}, look: 'on-video', keepOut: [{x: 0.4, y: 0.2, w: 0.2, h: 0.4}], camera: {position: [0, 1, 6], target: [0, 1, 0]}, objects: [{id: 'gem', type: 'gem', position: [0, 1, 0]}]}, {samples: 4});
  ok(!face.ok && face.errors.some((e) => e.msg.includes('keep-out')), JSON.stringify(face.errors));
  fs.rmSync(dir, {recursive: true, force: true});
}, {browser: true});
test('browser: baked physics is the same picture twice', async () => {
  const {check} = await import('../lib/check.mjs');
  const dir = tmpProject();
  const r = await check(dir, {name: 'phys', duration: 2, size: {width: 640, height: 360}, objects: [{id: 'floor', type: 'floor'}, {id: 'w', type: 'text3d', text: 'GO', size: 0.8, depth: 0.4, split: true, position: [0, 2, 0], bodyEach: true, each: 0.2}]}, {samples: 5});
  ok(r.ok && r.probe.determinism.every((d) => d.same), JSON.stringify(r.errors));
  fs.rmSync(dir, {recursive: true, force: true});
}, {browser: true});
test('browser: hover and click on a still object stay a pure function of time', async () => {
  // found by the self-check itself on the first catalog run: a click spin piled up on objects that had no motion
  const {check} = await import('../lib/check.mjs');
  const dir = tmpProject();
  const r = await check(dir, {name: 'click', duration: 3, size: {width: 640, height: 360}, interact: ['hover', 'click'], camera: {position: [0, 1, 6], target: [0, 1, 0]},
    pointerScript: [{t: 0, x: 0, y: 0}, {t: 0.5, x: 0, y: 0, click: 'box'}, {t: 3, x: 0, y: 0}], objects: [{id: 'box', type: 'rounded-box', position: [0, 1, 0], rotation: [0, 30, 0]}]}, {samples: 6});
  ok(r.probe.determinism.every((d) => d.same), JSON.stringify(r.probe.determinism));
  ok(r.ok, JSON.stringify(r.errors));
  fs.rmSync(dir, {recursive: true, force: true});
}, {browser: true});

test('browser: every example page opens headless, draws a real picture, and logs no errors', async () => {
  const {smokeExample} = await import('../lib/examples.mjs');
  const bad = [];
  for (const e of listExamples().filter((x) => x.name !== 'opening')) {
    const r = await smokeExample(e, {seconds: 3});
    const errors = r.errors.filter((x) => !/favicon/.test(x));
    if (!r.ready) bad.push(`${e.name}: never set window.EXAMPLE.ready`);
    if (errors.length) bad.push(`${e.name}: ${errors.slice(0, 3).join(' | ')}`);
    if (r.kind === 'webgl' && !(r.distinct > 8 && r.calls > 0)) bad.push(`${e.name}: picture looks empty ${JSON.stringify(r)}`);
  }
  eq(bad, [], 'pages');
}, {browser: true});
test('film: a page films frame by frame to H.264 BT.709 with the exact frame count, in 16:9 and 9:16', async () => {
  const {filmPage} = await import('../lib/film.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c3-film-'));
  const ex = findExample('caustic-water');
  const a = await filmPage(ex, {out: path.join(dir, 'a.mp4'), seconds: 2, fps: 30, width: 640, height: 360, wait: 2});
  ok(a.check.ok, JSON.stringify(a.check));
  eq(a.check.frames, 60, 'frames');
  eq(a.errors, [], 'page errors');
  ok(fs.existsSync(path.join(dir, 'a.jpg')), 'still');
  const b = await filmPage(ex, {out: path.join(dir, 'b.mp4'), seconds: 1, fps: 24, width: 360, height: 640, wait: 2});
  ok(b.check.ok && b.check.frames === 24 && b.check.width === 360 && b.check.height === 640, JSON.stringify(b.check));
  fs.rmSync(dir, {recursive: true, force: true});
}, {browser: true});
test('video: a rendered mp4 is yuv420p, tv range, BT.709, and a known colour comes back', async () => {
  const {renderVideo} = await import('../lib/render.mjs');
  const dir = tmpProject();
  const file = path.join(dir, 'out', 'c.mp4');
  // a flat brand-gold background, nothing in front of the middle, no post effects and no tone mapping on it
  await renderVideo(dir, {name: 'colour', duration: 1, size: {width: 320, height: 180}, background: {color: '#d6892a'}, post: [], objects: [{id: 'dot', type: 'sphere', position: [40, 40, -60], scale: 0.1}]}, file);
  const t = colourTags(file);
  eq({pix_fmt: t.pix_fmt, color_range: t.color_range, color_space: t.color_space, color_transfer: t.color_transfer, color_primaries: t.color_primaries}, BT709);
  const px = frameRgb(file, 0.5, 'crop=8:8:156:86,scale=in_color_matrix=bt709:in_range=tv:out_range=pc:flags=accurate_rnd+full_chroma_int');
  const avg = [0, 1, 2].map((c) => Math.round([...px].filter((_, i) => i % 3 === c).reduce((a, b) => a + b, 0) / (px.length / 3)));
  ok(avg.every((v, i) => Math.abs(v - [0xd6, 0x89, 0x2a][i]) <= 10), `the middle decodes as rgb(${avg}) instead of rgb(214,137,42)`);
  fs.rmSync(dir, {recursive: true, force: true});
}, {browser: true});

for (const t of tests) {
  if (t.browser && fast) {
    console.log(`skip  ${t.name}`);
    continue;
  }
  try {
    await t.fn();
    pass++;
    console.log(`ok    ${t.name}`);
  } catch (e) {
    fail++;
    console.log(`FAIL  ${t.name}\n      ${String(e && e.message ? e.message : e).split('\n').join('\n      ')}`);
  }
}
console.log(`\n${pass} passed, ${fail} failed${fast ? ' (browser tests skipped)' : ''}`);
process.exit(fail ? 1 : 0);
