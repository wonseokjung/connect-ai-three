// Adapter: three examples/jsm TextGeometry + FontLoader (MIT). Extruded 3D text, whole or split into letters.
// Built-in typefaces: thin, light, sans, bold, serif, serif-bold. Any other script or face: "fontFile" (.ttf / .otf).
import * as THREE from 'three';
import {TextGeometry} from 'three/examples/jsm/geometries/TextGeometry.js';
import {Font} from 'three/examples/jsm/loaders/FontLoader.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {REG, registerObject, registerPlugin} from '../runtime/registry.js';
import {makeMaterial} from '../runtime/materials.js';

import {fontKey} from '../runtime/util.js';
const cache = new Map();
function font(name) {
  const key = fontKey(name);
  if (!REG.fonts.has(key)) throw new Error(`text3d: font "${name}" is not loaded (its font adapter is left out of this build)`);
  if (!cache.has(key)) cache.set(key, new Font(REG.fonts.get(key)));
  return cache.get(key);
}

// Lays text out letter by letter (our own tracking + the font's kerning pairs) and returns a group of letter meshes.
// d: text, font | fontFile, size, depth, bevel, tracking, split, align ('center' | 'left' | 'right'), material
export async function buildText(d, ctx, matIn) {
  let f;
  if (d.fontFile) {
    const ttf = REG.plugins.get('ttf');
    if (!ttf) throw new Error('text3d "fontFile" needs the "ttf" adapter (it is left out of this build)');
    f = new Font(await ttf.load(ctx.resolve(d.fontFile), d.fontReversed));
  } else f = font(d.font || 'bold');
  const size = d.size ?? 0.6;
  const depth = d.depth ?? size * 0.2;
  const bevel = d.bevel ?? size * 0.014;
  const opts = {font: f, size, depth, curveSegments: d.curveSegments ?? 10, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.7, bevelSegments: d.bevelSegments ?? 3};
  const text = String(d.text ?? 'CONNECT AI LAB');
  const mat = matIn || makeMaterial(d.material ?? 'gold', ctx);
  const track = (d.tracking ?? 0.04) * size;
  const scale = size / f.data.resolution;
  const kern = f.data.kern || {};
  let x = 0, prev = '';
  const letters = [];
  const missing = [...new Set([...text].filter((ch) => ch !== ' ' && !f.data.glyphs[ch]))];
  if (missing.length) ctx.warn(`text3d "${text.slice(0, 20)}": the font has no shape for ${missing.slice(0, 6).map((c) => `"${c}"`).join(', ')}. The built-in fonts are Latin (plus a few Korean brand words): give "fontFile": "assets/YourFont.ttf" (any .ttf / .otf you may use), or use a "label".`);
  for (const ch of text) {
    const gl = f.data.glyphs[ch] || f.data.glyphs['?'];
    const adv = (gl ? gl.ha : f.data.resolution * 0.5) * scale;
    if (prev && d.kerning !== false) x += (kern[prev + ch] || 0) * scale;
    if (ch !== ' ') letters.push({ch: f.data.glyphs[ch] ? ch : '?', x, adv});
    x += adv + track;
    prev = ch;
  }
  const total = Math.max(0, x - track);
  const x0 = d.align === 'left' ? 0 : d.align === 'right' ? -total : -total / 2;
  const g = new THREE.Group();
  const whole = [];
  for (const L of letters) {
    const geo = new TextGeometry(L.ch, opts);
    if (d.split) {
      ctx.disposables.push(geo);
      geo.computeBoundingBox();
      const bb = geo.boundingBox;
      const cx = (bb.min.x + bb.max.x) / 2, cy = (bb.min.y + bb.max.y) / 2;
      geo.translate(-cx, -cy, -depth / 2);
      // every split letter gets its own material, so one letter can fade while the others stay
      let lm = mat;
      if (g.children.length) {
        lm = mat.clone();
        lm.userData = {...mat.userData};
        ctx.disposables.push(lm);
      }
      const m = new THREE.Mesh(geo, lm);
      m.position.set(L.x + cx + x0, cy - size / 2, 0);
      m.userData.letter = L.ch;
      g.add(m);
    } else {
      // placed by us (keeps our tracking and kerning), then merged: the whole line is one draw call
      geo.translate(L.x + x0, -size / 2, -depth / 2);
      whole.push(geo);
    }
  }
  if (whole.length) {
    const one = whole.length > 1 ? mergeGeometries(whole, false) : whole[0];
    if (whole.length > 1) whole.forEach((x) => x.dispose());
    ctx.disposables.push(one);
    g.add(new THREE.Mesh(one, mat));
  }
  g.userData.textWidth = total;
  g.userData.textHeight = size;
  return g;
}
registerObject('text3d', (d, ctx) => buildText(d, ctx), {source: 'three examples/jsm TextGeometry (MIT) + open typefaces (OFL-1.1)', about: 'extruded 3D text in six built-in typefaces; split:true makes every letter its own object'});
registerPlugin({name: 'text3d', buildText, fontKey});
