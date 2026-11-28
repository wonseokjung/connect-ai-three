// The scout: for one sentence, rank what we already have (our examples, the community library) and what is out there
// now (GitHub, read through its API), and say which one to start from. Video first: a thing that looks good filmed
// (light, motion, a camera path) ranks above a thing that is only good to click (UI kits, editors, dashboards).
//
// Browser mode (X and Threads through ELDO or Ego Lite) lives in the skill, because it needs the user's own login and
// a human hand-off; this file is the part that runs anywhere: the library and GitHub-only mode, plus `fetch`, which
// copies only licence-cleared code into a new folder with the licence text and a SOURCES.md note.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync, execFileSync} from 'node:child_process';
import {KIT} from './paths.mjs';
import {listExamples} from './examples.mjs';

export const LIBRARY = path.join(KIT, 'catalog', 'community.json');
export const loadLibrary = () => JSON.parse(fs.readFileSync(LIBRARY, 'utf8'));

// --- licences -------------------------------------------------------------------------------------------------------
// read from the licence TEXT, not only the GitHub label (it says NOASSERTION for some real MIT files and for some
// non-commercial ones)
export function spdxFromText(t = '') {
  const s = String(t).replace(/\s+/g, ' ');
  if (!s.trim()) return 'NONE';
  if (/GNU AFFERO GENERAL PUBLIC LICENSE/i.test(s)) return 'AGPL-3.0';
  if (/GNU LESSER GENERAL PUBLIC LICENSE/i.test(s)) return 'LGPL';
  if (/GNU GENERAL PUBLIC LICENSE/i.test(s)) return 'GPL';
  if (/PolyForm Noncommercial/i.test(s)) return 'PolyForm-Noncommercial';
  if (/Source[- ]Available|View[- ]Only/i.test(s)) return 'View-Only';
  if (/NonCommercial|Non-Commercial|not for commercial/i.test(s)) return 'NC';
  if (/CC0 1\.0|Creative Commons Zero|CC0-1\.0|Creative Commons Legal Code\s+CC0/i.test(s)) return 'CC0-1.0';
  if (/Apache License,? Version 2\.0|Apache License\s+Version 2\.0/i.test(s)) return 'Apache-2.0';
  if (/Permission is hereby granted, free of charge, to any person obtaining a copy/i.test(s)) return 'MIT';
  if (/Permission to use, copy, modify, and\/or distribute this software for any purpose with or without fee/i.test(s)) return 'ISC';
  if (/This software is provided 'as-is', without any express or implied warranty/i.test(s) && /altered source versions must be plainly marked/i.test(s)) return 'Zlib';
  if (/Redistribution and use in source and binary forms/i.test(s)) return /Neither the name/i.test(s) ? 'BSD-3-Clause' : 'BSD-2-Clause';
  if (/This is free and unencumbered software released into the public domain/i.test(s)) return 'Unlicense';
  return 'UNKNOWN';
}
export const OK_LICENCES = ['MIT', 'Apache-2.0', 'CC0-1.0', 'ISC', 'Zlib', 'BSD-2-Clause', 'BSD-3-Clause', 'Unlicense'];
// the stop rules: skip, never adapt
export function licenceVerdict(spdx) {
  if (OK_LICENCES.includes(spdx)) return {ok: true};
  const why = {NONE: 'no licence: all rights reserved (you may ask the author)', UNKNOWN: 'licence text not recognised: read it yourself or skip', GPL: 'GPL: copyleft, skipped', LGPL: 'LGPL: skipped', 'AGPL-3.0': 'AGPL: skipped', 'PolyForm-Noncommercial': 'non-commercial: skipped', NC: 'non-commercial: skipped', 'View-Only': 'view-only source: skipped'}[spdx];
  return {ok: false, why: why || `${spdx}: not on our list, skipped`};
}
const MEDIA = /\.(glb|gltf|fbx|obj|usdz|vrm|bin|hdr|exr|ktx2|png|jpe?g|webp|avif|gif|mp3|ogg|wav|m4a|flac|mp4|webm|mov|ply|spz|splat|ttf|otf|woff2?)$/i;
const AUDIO = /\.(mp3|ogg|wav|m4a|flac)$/i;
const MODEL = /\.(glb|gltf|fbx|obj|usdz|vrm|ply|spz|splat)$/i;
const CREDITS = /(^|\/)(CREDITS|NOTICE|ATTRIBUTION|ASSET[-_]?LICENSES?|THIRD[-_]PARTY[^/]*|LICENSING)[^/]*$/i;
const IP_WORDS = /non-?commercial|fan (project|game|made)|not affiliated|trademark of|unofficial (remake|port)/i;

// --- words ----------------------------------------------------------------------------------------------------------
// Korean words a user says, and the English words the library and GitHub use
const KO = {
  '바다': 'ocean sea water waves', '파도': 'waves ocean', '물': 'water caustic', '물빛': 'caustic water', '수조': 'tank water', '탄산수': 'water drink', '음료': 'drink water product',
  '파티클': 'particles', '입자': 'particles', '빛': 'light glow', '반짝': 'sparkle particles', '불꽃': 'fire sparks fireworks', '네온': 'neon', '유리': 'glass refraction',
  '게임': 'game', '타워': 'tower defense', '디펜스': 'defense tower', '자동차': 'car', '추격': 'chase car', '경찰': 'police chase',
  '섬': 'island hex', '지도': 'map', '도시': 'city town', '마을': 'town village', '가게': 'shop store', '체인점': 'stores map',
  '건물': 'building architecture', '건축': 'architecture building', '부동산': 'architecture building real estate', '집': 'house room', '방': 'room interior', '객실': 'room hotel interior', '호텔': 'hotel room', '침실': 'bedroom room',
  '새벽': 'dawn morning', '노을': 'sunset golden hour', '밤': 'night', '비': 'rain',
  '드래곤': 'dragon film', '용': 'dragon', '필름': 'film cinematic', '영화': 'film cinematic', '영상': 'film video', '오프닝': 'opening intro film', '인트로': 'intro opening',
  '얼굴': 'face head avatar', '비서': 'assistant face ai', '캐릭터': 'character avatar', '아바타': 'avatar character',
  '로고': 'logo text', '글자': 'text letters type', '간판': 'sign neon text', '이름': 'name text',
  '제품': 'product', '브랜드': 'brand landing hero', '랜딩': 'landing hero', '히어로': 'hero landing', '광고': 'ad product brand',
  '극장': 'cinema theatre seat', '공연장': 'theatre cinema hall', '좌석': 'seat cinema', '강의장': 'hall seat',
  '나비': 'butterfly', '태엽': 'clockwork mechanical', '톱니': 'gear mechanical', '기계': 'mechanical', '시계': 'watch clockwork', '로봇': 'robot mechanical', '문어': 'octopus',
  '태양계': 'solar system planet', '태양': 'sun solar', '토성': 'saturn planet', '블랙홀': 'black hole', '음악': 'music audio', '비트': 'beat music', '오디오': 'audio music',
  '계곡': 'valley river', '벚꽃': 'cherry blossom', '나룻배': 'boat river', '수사': 'investigation board', '증거': 'evidence board',
  '우주': 'space planet stars', '행성': 'planet space', '지구': 'globe earth', '숲': 'forest trees', '풀': 'grass field', '나무': 'trees forest',
  '종이': 'paper', '팝업': 'popup paper', '동화': 'story paper', '스캔': 'scan splat', '스크롤': 'scroll', '물리': 'physics', '유체': 'fluid liquid', '꿀': 'honey fluid',
  '셰이더': 'shader', '데이터': 'data', '위성': 'satellite', '로봇': 'robot', '창고': 'warehouse', '잡지': 'magazine pages', '스티커': 'sticker',
};
const STOP = new Set('a an the and or of in on at to for with my our your me us it is be make made film show give put let like as by from into over under that this then when every one two'.split(' '));
export function words(sentence) {
  const s = String(sentence || '').toLowerCase();
  const out = new Set();
  for (const w of s.split(/[^a-z0-9가-힣]+/)) {
    if (!w || STOP.has(w)) continue;
    if (/^[a-z0-9]+$/.test(w)) { if (w.length > 2) out.add(w.replace(/(ies)$/, 'y').replace(/s$/, '')); continue; }
    // a one-letter word (비, 섬, 밤) only counts at the start of a short word, so 나비 is not rain
    const long = Object.keys(KO).filter((ko) => ko.length > 1 && w.includes(ko));
    const hit = (ko) => (ko.length === 1 ? w.startsWith(ko) && w.length <= 2 && !long.some((l) => l.startsWith(ko)) : long.includes(ko));
    for (const [ko, en] of Object.entries(KO)) if (hit(ko)) en.split(' ').forEach((e) => out.add(e.replace(/s$/, '')));
  }
  return [...out];
}
const VIDEO_WORDS = /film|cinematic|ocean|sea|water|particle|world|landscape|dragon|forest|planet|space|sunset|dawn|night|neon|glass|fire|smoke|cloud|terrain|city|flight|fly|camera|shot|trailer/i;
const CLICK_WORDS = /editor|\bui\b|component|dashboard|form|admin|template|boilerplate|starter kit|library for|carousel|button/i;

// words that say little about WHAT to make (every request is a film, most are for a shop or brand)
const WEAK = new Set(['film', 'video', 'cinematic', 'shop', 'store', 'brand', 'product', 'text', 'name', 'opening', 'intro', 'hero', 'landing', 'light', 'glow', 'ai', 'ad']);
function textScore(want, hay) {
  const h = hay.toLowerCase();
  let s = 0;
  for (const w of want) if (new RegExp(`\\b${w}`).test(h)) s += WEAK.has(w) ? 0.4 : w.length > 4 ? 2 : 1.4;
  return s;
}

// --- 1. what we have ------------------------------------------------------------------------------------------------
export function rankLibrary(sentence, {limit = 8} = {}) {
  const want = words(sentence);
  const ours = listExamples().filter((e) => e.name !== 'opening').map((e) => ({
    source: 'ours', id: e.name, title: e.title, what: e.about, license: e.community && e.community.license ? e.community.license : 'MIT', video: (e.film && e.film.videoFit) || 3,
    hay: [e.name, e.title, e.titleKo, e.about, e.prompt, e.promptKo].join(' '),
    next: `example ${e.name} --copy <folder>  then  film <folder>`, example: e.folder, community: e.community || null,
  }));
  const lib = loadLibrary().map((c) => ({
    source: c.kind === 'prompt' ? 'prompt' : c.example ? 'ours' : 'library', id: c.id, title: c.title, what: c.what, license: c.kind === 'prompt' ? 'prompt only' : c.license, assets: c.assets, video: c.videoFit || 2,
    hay: [c.title, c.what, c.whatKo, c.say, c.sayKo, c.category, c.categoryTitle, c.prompt || ''].join(' '), viral: c.viral, repo: c.repo, example: c.example,
    next: c.kind === 'prompt' ? `write your own from the prompt (${c.viral ? c.viral.url : c.post}); credit "inspired by ${c.author}"` : c.example ? `example ${c.example.replace(/^\d+-/, '')} --copy <folder>` : `fetch ${c.repo.replace('https://github.com/', '')} --to <folder>`,
  })).filter((c) => !(c.example && ours.some((o) => o.example === c.example)));
  const all = [...ours, ...lib].map((x) => {
    const match = textScore(want, x.hay);
    const assetsPenalty = x.assets === 'check' ? 1 : x.assets === 'strip' ? 0.5 : 0;
    return {...x, match, score: match * 1.0 + (match >= 1.4 ? x.video * 0.8 + (x.source === 'ours' ? 1.5 : 0) - assetsPenalty : 0)};
  });
  return all.filter((x) => x.match >= 1.4).sort((a, b) => b.score - a.score).slice(0, limit).map(({hay, ...x}) => x);
}

// --- 2. GitHub-only mode --------------------------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function hasGh() {
  try { execFileSync('gh', ['auth', 'status'], {stdio: 'ignore'}); return true; } catch { return false; }
}
// one GitHub API GET: through `gh` when it is logged in (5,000 core / 30 search per minute), else plain https
// (60 per hour without a token; set GITHUB_TOKEN for more). Rate limits come back as {limited: seconds}.
async function gh(pathAndQuery, {useGh} = {}) {
  if (useGh) {
    const r = spawnSync('gh', ['api', '-i', pathAndQuery], {maxBuffer: 1 << 27});
    const out = String(r.stdout || '');
    const head = out.split(/\r?\n\r?\n/)[0];
    const body = out.slice(head.length).trim();
    const status = Number((head.match(/^HTTP\/\S+ (\d+)/) || [])[1] || (r.status === 0 ? 200 : 0));
    if (status === 403 || status === 429) {
      const reset = Number((head.match(/x-ratelimit-reset: (\d+)/i) || [])[1] || 0);
      return {limited: reset ? Math.max(1, reset - Math.floor(Date.now() / 1000)) : 60};
    }
    if (status === 404 || status === 422) return {missing: true};
    try { return {data: JSON.parse(body)}; } catch { return {error: String(r.stderr || body).slice(0, 200)}; }
  }
  const headers = {accept: 'application/vnd.github+json', 'user-agent': 'connect-ai-three-scout'};
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  try {
    const res = await fetch(`https://api.github.com/${pathAndQuery}`, {headers});
    if (res.status === 403 || res.status === 429) {
      const reset = Number(res.headers.get('x-ratelimit-reset') || 0);
      return {limited: reset ? Math.max(1, reset - Math.floor(Date.now() / 1000)) : 60};
    }
    if (res.status === 404 || res.status === 422) return {missing: true};
    return {data: await res.json()};
  } catch (e) {
    return {error: String(e.message || e)};
  }
}
const since = (months) => new Date(Date.now() - months * 30 * 864e5).toISOString().slice(0, 10);
// the queries that worked when the library was built (커뮤니티_후보_1128.md): topics, recent, sorted by stars
export function githubQueries(sentence) {
  const w = words(sentence).filter((x) => /^[a-z0-9]+$/.test(x));
  const kw1 = w[0] || '', kw2 = w.slice(0, 2).join(' ');
  return [
    `topic:threejs ${kw1} pushed:>${since(9)}`,
    `three.js ${kw2} in:name,description,readme stars:>20 pushed:>${since(9)}`,
    `topic:webgpu ${kw1} pushed:>${since(9)}`,
  ].map((q) => q.replace(/\s+/g, ' ').trim());
}

export async function searchGithub(sentence, {limit = 6, maxQueries = 3, onNote = () => {}} = {}) {
  const useGh = hasGh();
  const notes = [];
  const note = (m) => (notes.push(m), onNote(m));
  const seen = new Map();
  const qs = githubQueries(sentence).slice(0, maxQueries);
  for (const [i, q] of qs.entries()) {
    if (i) await sleep(2100); // search API: 30 a minute with a login, 10 without
    const r = await gh(`search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=15`, {useGh});
    if (r.limited) { note(`GitHub search rate limit reached: try again in about ${r.limited} s (the library results below still count)`); break; }
    if (r.error) { note(`GitHub search failed: ${r.error}`); break; }
    for (const it of (r.data && r.data.items) || []) if (!seen.has(it.full_name)) seen.set(it.full_name, it);
  }
  const want = words(sentence);
  const pre = [...seen.values()].filter((it) => !it.fork && !it.archived).map((it) => {
    const hay = `${it.name} ${it.description || ''} ${(it.topics || []).join(' ')}`;
    const recency = Math.max(0, 1 - (Date.now() - Date.parse(it.pushed_at)) / (365 * 864e5));
    const video = VIDEO_WORDS.test(hay) ? 3 : CLICK_WORDS.test(hay) ? 1 : 2;
    return {it, hay, video, score: textScore(want, hay) * 1.0 + Math.log10(1 + it.stargazers_count) * 0.5 + recency * 0.5 + video * 0.6};
  }).filter((x) => textScore(want, x.hay) >= 1.4 && !/awesome|prompt|collection|list/i.test(x.it.name)).sort((a, b) => b.score - a.score).slice(0, limit * 2);
  const out = [];
  for (const {it, video, score} of pre) {
    if (out.length >= limit) break;
    const repo = it.full_name;
    // the licence text, not the label
    const lic = await gh(`repos/${repo}/license`, {useGh});
    if (lic.limited) { note(`GitHub API rate limit reached while checking licences: try again in about ${lic.limited} s`); break; }
    const text = lic.data && lic.data.content ? Buffer.from(lic.data.content, 'base64').toString('utf8') : '';
    const spdx = spdxFromText(text);
    const verdict = licenceVerdict(spdx);
    const row = {source: 'found', id: repo, title: it.name, what: (it.description || '').slice(0, 140), license: spdx, licenseOnGitHub: it.license ? it.license.spdx_id : null, stars: it.stargazers_count, pushed: it.pushed_at.slice(0, 10), repo: it.html_url, demo: it.homepage || null, video, score};
    if (!verdict.ok) { out.push({...row, skip: verdict.why}); continue; }
    // files: build or static, media to check, credits files
    const tree = await gh(`repos/${repo}/git/trees/${it.default_branch}?recursive=1`, {useGh});
    const files = ((tree.data && tree.data.tree) || []).filter((x) => x.type === 'blob' && !/node_modules/.test(x.path)).map((x) => x.path);
    const models = files.filter((f) => MODEL.test(f)).length, audio = files.filter((f) => AUDIO.test(f)).length;
    const media = files.filter((f) => MEDIA.test(f) && !/^(docs?|media|screenshots?)\//i.test(f)).length;
    const credits = files.filter((f) => CREDITS.test(f));
    const readme = await gh(`repos/${repo}/readme`, {useGh});
    const rtext = readme.data && readme.data.content ? Buffer.from(readme.data.content, 'base64').toString('utf8') : '';
    if (IP_WORDS.test(rtext)) { out.push({...row, skip: 'README says non-commercial / fan project / trademark: skipped'}); continue; }
    const assets = !media ? 'none' : audio || models ? 'check' : 'check';
    out.push({...row, static: !files.includes('package.json') && files.includes('index.html'), assets, assetsNote: media ? `${media} media files (${models} models, ${audio} audio)${credits.length ? ', read ' + credits.slice(0, 3).join(', ') : ', no credits file'}: leave out unless CC0 or own` : 'code only',
      next: `fetch ${repo} --to <folder>`});
  }
  return {mode: useGh ? 'gh' : process.env.GITHUB_TOKEN ? 'https+token' : 'https', queries: qs, results: out, notes};
}

// --- the answer -----------------------------------------------------------------------------------------------------
export async function find(sentence, {offline = false, limit = 6, onNote} = {}) {
  const library = rankLibrary(sentence, {limit});
  const github = offline ? {mode: 'offline', queries: [], results: [], notes: ['offline: library only']} : await searchGithub(sentence, {limit, onNote});
  const usable = github.results.filter((r) => !r.skip);
  const ranked = [...library, ...usable].sort((a, b) => b.score - a.score);
  return {sentence, words: words(sentence), library, github, best: ranked[0] || null, ranked: ranked.slice(0, limit * 2)};
}

export function formatFind(r) {
  const L = [];
  const cell = (s, n) => String(s ?? '').replace(/\|/g, '/').slice(0, n);
  L.push(`scout: "${r.sentence}"`);
  L.push(`  words: ${r.words.join(', ') || '(none matched: add an English word or two)'}`);
  L.push('');
  L.push('| # | from | what | licence | video | why / next |');
  L.push('|---|---|---|---|---|---|');
  r.ranked.forEach((x, i) => L.push(`| ${i + 1} | ${x.source} | ${cell(x.title, 34)} | ${cell(x.license, 12)}${x.assets && x.assets !== 'none' ? ' (assets: ' + x.assets + ')' : ''} | ${'*'.repeat(x.video || 1)} | ${cell(x.next, 90)} |`));
  const skipped = r.github.results.filter((x) => x.skip);
  if (skipped.length) {
    L.push('');
    L.push('skipped (stop rules):');
    for (const s of skipped) L.push(`  - ${s.id}: ${s.skip}`);
  }
  for (const n of r.github.notes) L.push(`note: ${n}`);
  L.push('');
  if (r.best) {
    L.push(`start from: ${r.best.title} (${r.best.source})`);
    L.push(`  1. ${r.best.next}`);
    L.push('  2. adapt it to the sentence: the user\'s name, colours, product; keep the author\'s structure and comments');
    L.push('  3. credit it: author, repo or post link, licence in NOTICE.md / SOURCES.md, licence text next to the code');
    L.push('  4. film it: film <folder> (16:9) and film <folder> --9x16, add --4k for 3840x2160');
    L.push('  5. check: 0 console errors, the still, frames / colour / length PASS, then show the video');
  } else L.push('nothing matched: try other words, or browser mode (X / Threads through ELDO or Ego Lite) in the skill');
  return L.join('\n');
}

// --- fetch: copy only licence-cleared code ---------------------------------------------------------------------------
const CODE = /\.(html?|m?js|cjs|jsx|ts|tsx|css|json|glsl|vert|frag|wgsl|md|txt)$/i;
export async function fetchRepo(spec, dest, {withAssets = false} = {}) {
  const m = String(spec).replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').match(/^([\w.-]+)\/([\w.-]+)/);
  if (!m) throw new Error(`not a GitHub repo: ${spec} (owner/name or https://github.com/owner/name)`);
  const repo = `${m[1]}/${m[2]}`;
  const to = path.resolve(dest || m[2]);
  if (fs.existsSync(to) && fs.readdirSync(to).length) throw new Error(`${to} is not empty: pick a new folder`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c3-fetch-'));
  try {
    // a shallow clone into its own empty folder; nothing in it is run
    const c = spawnSync('git', ['clone', '-q', '--depth', '1', `https://github.com/${repo}.git`, path.join(tmp, 'src')], {stdio: ['ignore', 'ignore', 'pipe']});
    if (c.status !== 0) throw new Error(`git clone failed: ${String(c.stderr).slice(0, 300)}`);
    const src = path.join(tmp, 'src');
    const sha = String(spawnSync('git', ['-C', src, 'rev-parse', 'HEAD']).stdout || '').trim();
    const licFile = fs.readdirSync(src).find((f) => /^(LICEN[CS]E|COPYING)(\.|$)/i.test(f));
    const text = licFile ? fs.readFileSync(path.join(src, licFile), 'utf8') : '';
    const spdx = spdxFromText(text);
    const v = licenceVerdict(spdx);
    if (!v.ok) throw new Error(`${repo}: ${v.why}. Nothing copied.`);
    const readme = fs.readdirSync(src).find((f) => /^readme/i.test(f));
    if (readme && IP_WORDS.test(fs.readFileSync(path.join(src, readme), 'utf8'))) throw new Error(`${repo}: README says non-commercial / fan project / trademark. Nothing copied.`);
    const copied = [], left = [];
    const walk = (rel) => {
      for (const n of fs.readdirSync(path.join(src, rel))) {
        const r = path.join(rel, n);
        const st = fs.lstatSync(path.join(src, r));
        if (st.isSymbolicLink()) { left.push([r, 'symbolic link']); continue; }
        if (st.isDirectory()) {
          if (['.git', 'node_modules', '.github', 'dist', 'build'].includes(n)) { if (n !== '.git') left.push([r + '/', 'build output or tooling']); continue; }
          walk(r);
          continue;
        }
        if (MEDIA.test(n) && !withAssets) { left.push([r, 'media: leave out unless it is CC0 or yours (read the credits)']); continue; }
        if (!CODE.test(n) && !MEDIA.test(n)) { left.push([r, 'not code']); continue; }
        if (st.size > 2e6) { left.push([r, 'over 2 MB']); continue; }
        fs.mkdirSync(path.dirname(path.join(to, r)), {recursive: true});
        fs.copyFileSync(path.join(src, r), path.join(to, r));
        copied.push(r);
      }
    };
    walk('');
    fs.mkdirSync(to, {recursive: true});
    const licName = `LICENSE-${m[2]}.txt`;
    fs.writeFileSync(path.join(to, licName), text);
    const credits = copied.filter((f) => CREDITS.test(f));
    const lib = (() => { try { return loadLibrary().find((c) => c.repo && c.repo.toLowerCase() === `https://github.com/${repo}`.toLowerCase()); } catch { return null; } })();
    fs.writeFileSync(path.join(to, 'SOURCES.md'), `# Sources

Started from **${repo}** (https://github.com/${repo}), commit ${sha.slice(0, 12)}, fetched ${new Date().toISOString().slice(0, 10)}.

- Licence: ${spdx} (read from the licence text${licFile ? ` \`${licFile}\`` : ''}), copied to \`${licName}\`.
- ${(text.match(/Copyright[^\n]*/i) || ['Copyright line: see the licence'])[0].trim()}
${lib && lib.viral ? `- Viral post: ${lib.viral.url} (${lib.viral.numbers}, recorded ${lib.viral.recorded})\n` : ''}- Keep this file and the licence text with the code. Credit the author in your NOTICE or video description.

## Copied (${copied.length} files)

${copied.map((f) => `- ${f}`).join('\n') || '- (none)'}

## Left out (${left.length})

${left.map(([f, why]) => `- ${f}: ${why}`).join('\n') || '- (none)'}
${credits.length ? `\nRead these before you add any asset back: ${credits.join(', ')}\n` : ''}
Replace left-out models, textures and sounds with your own or CC0 ones (Poly Haven, Kenney, Quaternius, KayKit), or
with code. Dependencies in package.json are not installed: map three.js in an import map (see the kit's examples).
`);
    return {repo, sha, license: spdx, to, copied: copied.length, left: left.length};
  } finally {
    fs.rmSync(tmp, {recursive: true, force: true});
  }
}
