// Catalog: every item is a small complete spec under catalog/<group>/<id>.json + one index (catalog/index.json).
import fs from 'node:fs';
import path from 'node:path';
import {KIT, readJson, writeJson} from './paths.mjs';

export const GROUPS = [
  ['object', 'Objects', 'things you can put in the scene'],
  ['material', 'Materials', 'what the surface is made of'],
  ['motion', 'Motion', 'how an object moves, always from time alone'],
  ['camera', 'Camera', 'how the camera moves'],
  ['light', 'Light', 'lights and what the metal reflects'],
  ['post', 'Post', 'finishing passes on the whole picture'],
  ['look', 'Looks', 'one word sets background, light and finish'],
  ['interact', 'Interaction', 'what the visitor can do on the web page'],
  ['physics', 'Physics', 'real rigid bodies, baked so they scrub and loop'],
  ['lane', 'Lanes', 'other ways in and out: React Three Fiber, your own video'],
];
export function scanCatalog(dir = path.join(KIT, 'catalog')) {
  const items = [];
  for (const [g] of GROUPS) {
    const d = path.join(dir, g);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d).filter((x) => x.endsWith('.json')).sort()) {
      const it = readJson(path.join(d, f));
      if (it && it.id) items.push({...it, file: `${g}/${f}`});
    }
  }
  return items;
}
export function buildIndex() {
  const items = scanCatalog();
  const order = new Map();
  items.forEach((it, i) => order.set(it.id, it.order ?? i));
  items.sort((a, b) => GROUPS.findIndex((g) => g[0] === a.group) - GROUPS.findIndex((g) => g[0] === b.group) || order.get(a.id) - order.get(b.id));
  const index = {
    name: 'connect-ai-three catalog',
    count: items.length,
    groups: GROUPS.map(([id, title, about]) => ({id, title, about, count: items.filter((i) => i.group === id).length})).filter((g) => g.count),
    items: items.map(({spec, ...m}) => ({...m, spec})),
  };
  writeJson(path.join(KIT, 'catalog', 'index.json'), index);
  return index;
}
export const loadIndex = () => readJson(path.join(KIT, 'catalog', 'index.json')) || buildIndex();
export const findItem = (id) => loadIndex().items.find((i) => i.id === id || `${i.group}/${i.id}` === id);
