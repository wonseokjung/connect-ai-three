// A project is a folder: scene.json (the spec) + assets/ (your models, images, video) + out/ (what we make).
import fs from 'node:fs';
import path from 'node:path';
import {KIT, readJson, projectPaths} from './paths.mjs';

export const DRACO_FILES = ['draco_wasm_wrapper.js', 'draco_decoder.wasm', 'draco_decoder.js'];
// three ships the Draco decoder (Apache-2.0): find it next to the kit (npx / npm) or inside it (a clone)
export function dracoDir() {
  for (let d = KIT, i = 0; i < 6; i++, d = path.dirname(d)) {
    const c = path.join(d, 'node_modules', 'three', 'examples', 'jsm', 'libs', 'draco', 'gltf');
    if (fs.existsSync(path.join(c, 'draco_decoder.wasm'))) return c;
  }
  return null;
}
// does this .glb / .gltf use Draco compression? (reads only the JSON part)
export function isDraco(file) {
  try {
    const b = fs.readFileSync(file);
    const json = b.readUInt32LE(0) === 0x46546c67 ? JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8')) : JSON.parse(b.toString('utf8'));
    return (json.extensionsUsed || []).includes('KHR_draco_mesh_compression');
  } catch {
    return false;
  }
}
// the model files of a spec that need the Draco decoder
export function dracoModels(dir, spec) {
  return assetRefs(spec).filter((r) => /\.(glb|gltf)$/i.test(r)).filter((r) => isDraco(r.startsWith('kit:') ? path.join(KIT, 'assets', r.slice(4)) : path.join(dir, r)));
}

export function loadSpec(dirOrFile) {
  const st = fs.existsSync(dirOrFile) ? fs.statSync(dirOrFile) : null;
  const file = st && st.isFile() ? path.resolve(dirOrFile) : projectPaths(dirOrFile).spec;
  if (!fs.existsSync(file)) throw new Error(`no scene.json in ${path.dirname(file)}. Make one with: connect-ai-three new "what you want to see"`);
  const spec = readJson(file);
  if (!spec) throw new Error(`${file} is not valid JSON`);
  return {spec, file, dir: path.dirname(file)};
}

// every string a spec uses as a file: "kit:name" = an asset that ships with the kit, anything else = in your folder
export function assetRefs(spec) {
  const refs = [];
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) {
      if ((k === 'src' || k === 'fontFile') && typeof v === 'string') refs.push(v);
      else if (typeof v === 'object') walk(v);
    }
  };
  walk(spec);
  if (spec.env && (spec.env === 'hdri' || spec.env.type === 'hdri') && !(spec.env && spec.env.src)) refs.push('kit:studio_small_08_1k.hdr');
  return [...new Set(refs)].filter((r) => !/^(https?:|data:|blob:)/.test(r));
}
// copy the kit assets a spec names into <project>/assets/kit so the renderer and the web page find them
export function materialize(dir, spec) {
  const missing = [];
  for (const r of assetRefs(spec)) {
    if (r.startsWith('kit:')) {
      const from = path.join(KIT, 'assets', r.slice(4));
      const to = path.join(dir, 'assets', 'kit', r.slice(4));
      if (!fs.existsSync(from)) missing.push(r);
      else if (!fs.existsSync(to) || fs.statSync(to).size !== fs.statSync(from).size) {
        fs.mkdirSync(path.dirname(to), {recursive: true});
        fs.copyFileSync(from, to);
      }
    } else if (!fs.existsSync(path.join(dir, r))) missing.push(r);
  }
  if (!missing.length && dracoModels(dir, spec).length) {
    const from = dracoDir();
    if (!from) missing.push('the Draco decoder (three/examples/jsm/libs/draco/gltf)');
    else for (const f of DRACO_FILES) {
      const to = path.join(dir, 'assets', 'kit', 'draco', f);
      if (!fs.existsSync(to)) {
        fs.mkdirSync(path.dirname(to), {recursive: true});
        fs.copyFileSync(path.join(from, f), to);
      }
    }
  }
  return missing;
}
