// Adapter: three examples/jsm TextGeometry + FontLoader (MIT). Extruded 3D text, whole or split into letters.
import * as THREE from 'three';
import {TextGeometry} from 'three/examples/jsm/geometries/TextGeometry.js';
import {Font} from 'three/examples/jsm/loaders/FontLoader.js';
import {REG, registerObject, registerPlugin} from '../runtime/registry.js';
import {makeMaterial} from '../runtime/materials.js';

const cache = new Map();
function font(name) {
  const key = REG.fonts.has(name) ? name : 'sans-bold';
  if (!REG.fonts.has(key)) throw new Error(`text3d: font "${name}" is not loaded (fonts adapter missing)`);
  if (!cache.has(key)) cache.set(key, new Font(REG.fonts.get(key)));
  return cache.get(key);
}
registerObject('text3d', async (d, ctx) => {
  let f;
  if (d.fontFile) {
    const ttf = REG.plugins.get('ttf');
    if (!ttf) throw new Error('text3d "fontFile" needs the "ttf" adapter (it is left out of this build)');
    f = new Font(await ttf.load(ctx.resolve(d.fontFile), d.fontReversed));
  } else f = font(d.font || 'sans-bold');
  const size = d.size ?? 0.6;
  const depth = d.depth ?? size * 0.22;
  const bevel = d.bevel ?? size * 0.018;
  const opts = {font: f, size, depth, curveSegments: d.curveSegments ?? 8, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 3};
  const text = String(d.text ?? 'CONNECT AI LAB');
  const mat = makeMaterial(d.material ?? 'gold', ctx);
  const track = (d.tracking ?? 0.04) * size;
  const scale = size / f.data.resolution;
  // lay the letters out ourselves: lets each letter move alone (stagger, explode, physics)
  let x = 0;
  const letters = [];
  const missing = [...new Set([...text].filter((ch) => ch !== ' ' && !f.data.glyphs[ch]))];
  if (missing.length) ctx.warn(`text3d "${text.slice(0, 20)}": the font has no shape for ${missing.slice(0, 6).map((c) => `"${c}"`).join(', ')}. The built-in font is Latin only: give "fontFile": "assets/YourFont.ttf" (any .ttf / .otf you may use), or use a "label".`);
  for (const ch of text) {
    const gl = f.data.glyphs[ch] || f.data.glyphs['?'];
    const adv = (gl ? gl.ha : f.data.resolution * 0.5) * scale;
    if (ch !== ' ') letters.push({ch, x, adv});
    x += adv + track;
  }
  const total = x - track;
  const g = new THREE.Group();
  if (d.split) {
    for (const L of letters) {
      const geo = new TextGeometry(L.ch, opts);
      geo.computeBoundingBox();
      const bb = geo.boundingBox;
      const cx = (bb.min.x + bb.max.x) / 2, cy = (bb.min.y + bb.max.y) / 2;
      geo.translate(-cx, -cy, -depth / 2);
      ctx.disposables.push(geo);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(L.x + cx - total / 2, cy - size / 2, 0);
      m.userData.letter = L.ch;
      g.add(m);
    }
  } else {
    // one mesh per letter merged by position (keeps our tracking), still a single material
    for (const L of letters) {
      const geo = new TextGeometry(L.ch, opts);
      geo.translate(L.x - total / 2, -size / 2, -depth / 2);
      ctx.disposables.push(geo);
      g.add(new THREE.Mesh(geo, mat));
    }
  }
  g.userData.textWidth = total;
  return g;
}, {source: 'three examples/jsm TextGeometry (MIT) + Droid Sans (Apache-2.0)', about: 'extruded 3D text; split:true makes every letter its own object'});
registerPlugin({name: 'text3d'});
