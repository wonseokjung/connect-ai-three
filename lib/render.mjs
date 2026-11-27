// Video side: one Remotion bundle per project folder, then mp4 / transparent mov / still sheet / self-check probe.
// WebGL needs a GPU-backed browser: ANGLE (--gl=angle) on macOS, Windows and Linux.
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {bundle} from '@remotion/bundler';
import {renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import {KIT} from './paths.mjs';
import {materialize} from './project.mjs';

export const chromiumOptions = {gl: process.env.CONNECT_AI_THREE_GL || 'angle'};
const webpackOverride = (c) => ({...c, resolve: {...c.resolve, modules: [path.join(KIT, 'node_modules'), 'node_modules', ...((c.resolve && c.resolve.modules) || [])]}});
const conc = () => Math.max(1, Math.min(Number(process.env.CONNECT_AI_THREE_CONCURRENCY) || 4, Math.floor(os.cpus().length / 2)));

// Remotion echoes browser console lines: keep our own data lines (probe numbers, notes) out of the terminal
async function hush(fn) {
  const quiet = (stream) => {
    const w = stream.write;
    stream.write = function (chunk, ...rest) {
      if (typeof chunk === 'string' && (chunk.includes('C3PROBE') || chunk.includes('C3WARN'))) return true;
      return w.call(this, chunk, ...rest);
    };
    return () => (stream.write = w);
  };
  const undo = [quiet(process.stdout), quiet(process.stderr)];
  try {
    return await fn();
  } finally {
    undo.forEach((u) => u());
  }
}

const cache = new Map();
export async function getBundle(dir) {
  // Remotion keeps its browser in node_modules/.remotion of the folder it runs from: always the kit, never your project
  if (process.cwd() !== KIT) process.chdir(KIT);
  const key = path.resolve(dir);
  if (cache.has(key)) return cache.get(key);
  fs.mkdirSync(path.join(key, 'assets'), {recursive: true});
  const outDir = path.join(os.tmpdir(), 'connect-ai-three-' + Buffer.from(key).toString('base64url').slice(-28));
  // a second bundle into the same folder trips over the public/ symlink: take the link away first (never its target)
  const link = path.join(outDir, 'public');
  try {
    if (fs.lstatSync(link).isSymbolicLink()) fs.unlinkSync(link);
  } catch {}
  // CONNECT_AI_THREE_NO_CACHE=1 rebuilds the bundle from scratch (use it after changing the kit's own source: a
  // render farm that receives the files by rsync was once seen to render one more batch from the cached bundle)
  const url = await bundle({entryPoint: path.join(KIT, 'src', 'remotion', 'index.ts'), publicDir: key, symlinkPublicDir: true, webpackOverride, outDir, enableCaching: !process.env.CONNECT_AI_THREE_NO_CACHE});
  cache.set(key, url);
  return url;
}

function need(dir, spec) {
  const missing = materialize(dir, spec);
  if (missing.length) throw new Error(`file(s) not found in ${dir}: ${missing.join(', ')}`);
}

export async function renderVideo(dir, spec, file, {alpha = false, video = null, scale = 1, frameRange = null, r3f = false, log = () => {}, crf = 21} = {}) {
  need(dir, spec);
  const serveUrl = await getBundle(dir);
  const inputProps = {spec, video};
  const warns = new Set();
  const onBrowserLog = (l) => {
    if (l.text && l.text.startsWith('C3WARN ')) warns.add(l.text.slice(7));
  };
  const composition = await selectComposition({serveUrl, id: r3f ? 'SceneR3F' : 'Scene', inputProps, chromiumOptions, onBrowserLog, logLevel: 'error'});
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const common = {composition, serveUrl, outputLocation: file, inputProps, concurrency: conc(), scale, frameRange, chromiumOptions, logLevel: 'error', onBrowserLog};
  if (alpha) await hush(() => renderMedia({...common, codec: 'prores', proresProfile: '4444', pixelFormat: 'yuva444p10le', imageFormat: 'png'}));
  else await hush(() => renderMedia({...common, codec: 'h264', crf, imageFormat: 'jpeg', jpegQuality: 95, pixelFormat: 'yuv420p', colorSpace: 'bt709'}));
  for (const w of warns) log('note: ' + w);
  return file;
}

export async function renderSheet(dir, spec, file, {times, cols = 4, title = '', keepOut = false} = {}) {
  need(dir, spec);
  const serveUrl = await getBundle(dir);
  const inputProps = {spec, times, cols, title, keepOut};
  const composition = await selectComposition({serveUrl, id: 'Sheet', inputProps, chromiumOptions, logLevel: 'error'});
  fs.mkdirSync(path.dirname(file), {recursive: true});
  await renderStill({composition, serveUrl, output: file, inputProps, imageFormat: 'jpeg', jpegQuality: 90, chromiumOptions, logLevel: 'error'});
  return file;
}

export async function renderStillAt(dir, spec, file, t, {video = null, scale = 1} = {}) {
  need(dir, spec);
  const serveUrl = await getBundle(dir);
  const inputProps = {spec, video};
  const composition = await selectComposition({serveUrl, id: 'Scene', inputProps, chromiumOptions, logLevel: 'error'});
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const png = file.endsWith('.png');
  await hush(() => renderStill({composition, serveUrl, output: file, inputProps, frame: Math.min(composition.durationInFrames - 1, Math.round(t * composition.fps)), imageFormat: png ? 'png' : 'jpeg', ...(png ? {} : {jpegQuality: 92}), scale, chromiumOptions, logLevel: 'error'}));
  return file;
}

// run the in-browser probe and collect its numbers from the console
export async function runProbe(dir, spec, {samples = 10} = {}) {
  need(dir, spec);
  const serveUrl = await getBundle(dir);
  const inputProps = {spec, samples};
  const parts = [];
  const onBrowserLog = (l) => {
    const m = l.text && l.text.match(/^C3PROBE (\d+)\/(\d+) ([\s\S]*)$/);
    if (m) parts[Number(m[1]) - 1] = m[3];
  };
  const composition = await selectComposition({serveUrl, id: 'Probe', inputProps, chromiumOptions, logLevel: 'error', onBrowserLog: () => {}});
  const tmp = path.join(os.tmpdir(), `connect-ai-three-probe-${process.pid}-${Date.now()}.jpg`);
  try {
    await hush(() => renderStill({composition, serveUrl, output: tmp, inputProps, imageFormat: 'jpeg', chromiumOptions, logLevel: 'error', onBrowserLog}));
  } finally {
    fs.rmSync(tmp, {force: true});
  }
  if (!parts.length) throw new Error('the self-check got no numbers back from the browser');
  return JSON.parse(parts.join(''));
}
