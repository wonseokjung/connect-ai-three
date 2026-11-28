// Makes the previews of an example with the same frame-exact film pipeline users get from `example <name> --video`:
//   preview.mp4        16:9, 1280x720, from a 1920x1080 film
//   preview-9x16.mp4   9:16, 720x1280, from a 1080x1920 film
//   preview.jpg        1600x900 still from the 16:9 film
// All H.264, yuv420p, limited (tv) range, BT.709 (tagged in the stream too). One Chrome at a time (withChromeLock).
//
//   node tools/capture-example.mjs <name> [<name> ...] [--no-short]    (or --all-community)
//
// example.json "film": {seconds, wait, startAt, camera: {type: "orbit", degrees, dolly, rise, target}, shortCamera,
// hide: [css selectors of UI to hide in the video], keys: ["Space"], click: [x, y], query: "?x=1", shortQuery}
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {findExample, listExamples} from '../lib/examples.mjs';
import {filmPage, ffmpegPath, BT709_OUT, checkVideo} from '../lib/film.mjs';

const env = {...process.env, DYLD_LIBRARY_PATH: path.dirname(ffmpegPath()), LD_LIBRARY_PATH: path.dirname(ffmpegPath())};
const ff = (args) => {
  const r = spawnSync(ffmpegPath(), args, {env, maxBuffer: 1 << 26});
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${String(r.stderr).slice(-600)}`);
};
const small = (from, to, w, h) => ff(['-y', '-v', 'error', '-i', from, '-vf', `scale=${w}:${h}:flags=lanczos:in_range=tv:out_range=tv,format=yuv420p`, '-crf', '26', '-preset', 'slow', ...BT709_OUT, '-an', to]);

const args = process.argv.slice(2);
const list = args.includes('--all-community') ? listExamples().filter((e) => e.community) : args.filter((a) => !a.startsWith('--')).map((n) => findExample(n)).filter(Boolean);
if (!list.length) {
  console.log('usage: node tools/capture-example.mjs <name> [...] [--no-short] | --all-community');
  process.exit(1);
}
for (const ex of list) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c3-cap-'));
  try {
    const wide = await filmPage(ex, {out: path.join(tmp, 'wide.mp4')});
    small(wide.file, path.join(ex.dir, 'preview.mp4'), 1280, 720);
    ff(['-y', '-v', 'error', '-i', path.join(tmp, 'wide.jpg'), '-vf', 'scale=1600:900:flags=lanczos', '-q:v', '3', path.join(ex.dir, 'preview.jpg')]);
    let line = `${ex.folder}: 16:9 ${wide.check.ok ? 'ok' : 'FIX ' + wide.check.problems.join('; ')}`;
    if (!args.includes('--no-short')) {
      const tall = await filmPage(ex, {out: path.join(tmp, 'tall.mp4'), short: true});
      small(tall.file, path.join(ex.dir, 'preview-9x16.mp4'), 720, 1280);
      fs.copyFileSync(path.join(tmp, 'tall.jpg'), path.join(tmp, '..', `c3-${ex.name}-9x16.jpg`));
      line += ` · 9:16 ${tall.check.ok ? 'ok' : 'FIX ' + tall.check.problems.join('; ')} (still: ${path.join(os.tmpdir(), `c3-${ex.name}-9x16.jpg`)})`;
    }
    const errs = [...new Set(wide.errors)];
    const pv = checkVideo(path.join(ex.dir, 'preview.mp4'));
    console.log(`${line} · preview ${pv.ok ? 'ok' : 'FIX ' + pv.problems.join('; ')}${errs.length ? ' · page errors: ' + errs.slice(0, 3).join(' | ') : ''}`);
  } finally {
    fs.rmSync(tmp, {recursive: true, force: true});
  }
}
