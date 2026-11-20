import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

export const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const KIT_NAME = 'connect-ai-three';
export const VERSION = JSON.parse(fs.readFileSync(path.join(KIT, 'package.json'), 'utf8')).version;
export const readJson = (f, d = null) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return d;
  }
};
export const writeJson = (f, o) => {
  fs.mkdirSync(path.dirname(f), {recursive: true});
  fs.writeFileSync(f, JSON.stringify(o, null, 2) + '\n');
};
export function projectPaths(dir) {
  const d = path.resolve(dir || '.');
  return {dir: d, spec: path.join(d, 'scene.json'), assets: path.join(d, 'assets'), out: path.join(d, 'out')};
}
