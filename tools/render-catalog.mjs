// Renders every catalog item as a clip (and one still at its peak) into a work folder. Used to build the catalog page.
//   node tools/render-catalog.mjs <workdir> [--only id,id] [--group g] [--stills] [--check] [--part i/n]
import fs from 'node:fs';
import path from 'node:path';
import {KIT, readJson, writeJson} from '../lib/paths.mjs';
import {loadIndex} from '../lib/catalog.mjs';
import {renderVideo, renderStillAt} from '../lib/render.mjs';
import {check} from '../lib/check.mjs';
import {materialize} from '../lib/project.mjs';

const argv = process.argv.slice(2);
const work = path.resolve(argv[0] || 'catalog-work');
const opt = (n) => {
  const i = argv.indexOf('--' + n);
  return i >= 0 ? argv[i + 1] : null;
};
const only = opt('only') ? opt('only').split(',') : null;
const group = opt('group');
const part = opt('part') ? opt('part').split('/').map(Number) : null;
const size = {width: 1280, height: 720};
fs.mkdirSync(path.join(work, 'clips'), {recursive: true});
fs.mkdirSync(path.join(work, 'stills'), {recursive: true});
let items = loadIndex().items.filter((i) => (!only || only.includes(i.id) || only.includes(`${i.group}/${i.id}`)) && (!group || i.group === group));
if (part) items = items.filter((_, i) => i % part[1] === part[0]);
const results = readJson(path.join(work, `results${part ? '_' + part[0] : ''}.json`), {});
for (const it of items) {
  const key = `${it.group}__${it.id}`;
  const clip = path.join(work, 'clips', key + '.mp4'), still = path.join(work, 'stills', key + '.jpg');
  const spec = {...it.spec, size};
  const t0 = Date.now();
  const r = {id: it.id, group: it.group};
  try {
    materialize(work, spec);
    const video = it.lane === 'on-video' && fs.existsSync(path.join(work, 'assets', 'talk.mp4')) ? {src: 'assets/talk.mp4'} : null;
    if (argv.includes('--check')) {
      const c = await check(work, spec, {samples: 6});
      r.check = {ok: c.ok, errors: c.errors.map((e) => e.msg), advice: c.advice.map((e) => e.msg), numbers: c.numbers};
    }
    if (!argv.includes('--stills') && !argv.includes('--check-only') && (argv.includes('--force') || !fs.existsSync(clip))) await renderVideo(work, spec, clip, {r3f: it.lane === 'r3f', video, crf: 20});
    if (!argv.includes('--check-only') && (argv.includes('--force') || !fs.existsSync(still))) {
      if (it.lane === 'r3f') r.note = 'still skipped (r3f lane)';
      else await renderStillAt(work, spec, still, (spec.duration || 4) * 0.62, {video});
    }
    r.ok = true;
    r.sec = +((Date.now() - t0) / 1000).toFixed(1);
  } catch (e) {
    r.ok = false;
    r.error = String(e && e.message ? e.message : e).split('\n').slice(0, 3).join(' | ');
  }
  results[key] = r;
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${key} ${r.sec ?? ''}s ${r.check ? (r.check.ok ? 'check PASS' : 'check FAIL: ' + r.check.errors.join('; ')) : ''} ${r.error || ''}`);
  writeJson(path.join(work, `results${part ? '_' + part[0] : ''}.json`), results);
}
console.log('ALLDONE', Object.values(results).filter((r) => r.ok).length, '/', Object.keys(results).length);
process.exit(0);
