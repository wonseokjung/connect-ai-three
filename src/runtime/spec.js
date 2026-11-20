// Scene spec: normalise (fill from the look) and validate. No three.js in here, so node and the browser share it.
import {LOOKS, DEFAULT_LOOK} from './look.js';
import {asDef, asList, fontKey, BUILTIN_KO} from './util.js';

export const SPEC_VERSION = 1;
export const INTERACT = {
  orbit: 'drag to look around',
  parallax: 'the camera leans toward the pointer',
  hover: 'the object under the pointer lifts a little',
  scroll: 'scrolling the page plays the scene',
  zoom: 'wheel or pinch to move closer',
  click: 'click an object to give it a spin',
};

export function normalizeSpec(input) {
  const s = JSON.parse(JSON.stringify(input || {}));
  const lookName = s.look && LOOKS[s.look] ? s.look : DEFAULT_LOOK;
  const L = LOOKS[lookName];
  s.version = s.version ?? SPEC_VERSION;
  s.look = lookName;
  s.name = s.name || 'scene';
  s.size = {width: s.size?.width ?? 1920, height: s.size?.height ?? 1080};
  s.fps = s.fps ?? 30;
  s.duration = s.duration ?? 5;
  s.background = s.background ?? L.background;
  if (typeof s.background === 'string' && s.background !== 'transparent') s.background = {type: 'color', color: s.background};
  s.env = s.env === undefined ? L.env : typeof s.env === 'string' ? {type: s.env} : s.env;
  s.lights = s.lights ?? L.lights;
  if (s.addLights) s.lights = [...s.lights, ...s.addLights];
  s.post = (s.post ?? L.post).map((x) => asDef(x));
  if (s.addPost) s.post = [...s.post, ...s.addPost.map((x) => asDef(x))];
  s.tone = s.tone ?? L.tone;
  s.exposure = s.exposure ?? L.exposure;
  s.fog = s.fog === undefined ? L.fog || null : s.fog;
  s.palette = {...L.palette, ...(s.palette || {})};
  s.backdrop = s.backdrop === undefined ? L.backdrop || null : s.backdrop;
  s.backdrop = asList(s.backdrop).map((b) => (typeof b === 'string' ? {type: b} : b));
  s.camera = s.camera || {};
  s.camera.motion = asList(s.camera.motion).map((x) => asDef(x));
  s.objects = (s.objects || []).map(normObject);
  s.interact = asList(s.interact);
  s.keepOut = asList(s.keepOut);
  s.shadows = s.shadows ?? true;
  return s;
}
function normObject(o, i) {
  const d = typeof o === 'string' ? {type: o} : {...o};
  d.id = d.id || `${d.type}-${i + 1}`;
  d.motion = asList(d.motion).map((x) => asDef(x));
  if (d.children) d.children = d.children.map(normObject);
  return d;
}

const near = (name, list) => {
  const sc = (a, b) => {
    let n = 0;
    for (const ch of new Set(a)) if (b.includes(ch)) n++;
    return n / Math.max(a.length, b.length) + (b.startsWith(a.slice(0, 3)) ? 0.5 : 0);
  };
  return [...list].sort((a, b) => sc(name, b) - sc(name, a))[0];
};

// names = {objects, materials, post, motions, cameraMotions, lights, looks, envs}
export function validateSpec(raw, names) {
  const errors = [], advice = [];
  const err = (msg) => errors.push({id: 'spec', msg});
  if (!raw || typeof raw !== 'object') return {errors: [{id: 'spec', msg: 'the spec is not an object'}], advice};
  if (raw.look && !names.looks.includes(raw.look)) err(`look "${raw.look}" does not exist. Did you mean "${near(raw.look, names.looks)}"? (${names.looks.join(', ')})`);
  const s = normalizeSpec(raw);
  if (!(s.duration > 0 && s.duration <= 600)) err(`duration ${s.duration} s: use a number between 0 and 600`);
  if (!(s.fps >= 1 && s.fps <= 120)) err(`fps ${s.fps}: use 24, 30 or 60`);
  if (s.size.width % 2 || s.size.height % 2) err(`size ${s.size.width}x${s.size.height}: width and height must be even numbers for video`);
  if (!s.objects.length) err('no objects: the frame would be empty');
  const ids = new Set();
  const walk = (o, where) => {
    if (!names.objects.includes(o.type)) err(`${where}: object type "${o.type}" does not exist. Did you mean "${near(String(o.type), names.objects)}"?`);
    if (ids.has(o.id)) err(`${where}: id "${o.id}" is used twice`);
    if ((o.type === 'text3d' || o.type === 'wordmark') && !o.fontFile) {
      const odd = [...String(o.text ?? '')].filter((ch) => /[^\u0000-\u024f\u2010-\u2027]/.test(ch));
      const sans = !/^serif/.test(fontKey(o.font || (o.type === 'wordmark' ? 'light' : 'bold')));
      if (odd.some((ch) => !sans || !BUILTIN_KO.includes(ch))) err(`${where}: 3D text "${String(o.text).slice(0, 20)}" has letters the built-in fonts do not have (they are Latin, plus a few Korean brand words in the sans faces). Add "fontFile": "assets/YourFont.ttf" (a .ttf / .otf you may use), or make it a "label".`);
    }
    if (o.body != null && !['dynamic', 'fixed', true].includes(o.body)) err(`${where}: "body" is for physics and must be "dynamic" or "fixed" (for the small text on a card use "text")`);
    ids.add(o.id);
    const mats = [o.material, o.material2, o.coreMaterial].filter(Boolean);
    for (const m of mats) {
      const p = typeof m === 'string' ? m : m.preset;
      if (p && !names.materials.includes(p)) err(`${where}: material "${p}" does not exist. Did you mean "${near(p, names.materials)}"?`);
    }
    for (const m of o.motion) {
      if (!names.motions.includes(m.type)) err(`${where}: motion "${m.type}" does not exist. Did you mean "${near(String(m.type), names.motions)}"?`);
      const end = (m.at ?? 0) + (m.dur ?? 0);
      if ((m.at ?? 0) >= s.duration) advice.push({id: o.id, msg: `${o.id}: motion "${m.type}" starts at ${m.at}s, after the scene ends (${s.duration}s)`});
      else if (end > s.duration + 0.01 && m.dur != null) advice.push({id: o.id, msg: `${o.id}: motion "${m.type}" ends at ${end.toFixed(1)}s, after the scene ends (${s.duration}s)`});
    }
    (o.children || []).forEach((c) => walk(c, `${where} > ${c.id}`));
  };
  s.objects.forEach((o) => walk(o, o.id));
  for (const p of s.post) if (!names.post.includes(p.type)) err(`post "${p.type}" does not exist. Did you mean "${near(String(p.type), names.post)}"?`);
  for (const m of s.camera.motion) if (!names.cameraMotions.includes(m.type)) err(`camera motion "${m.type}" does not exist. Did you mean "${near(String(m.type), names.cameraMotions)}"?`);
  for (const l of s.lights) if (l.type && !names.lights.includes(l.type)) err(`light "${l.type}" does not exist. Did you mean "${near(String(l.type), names.lights)}"?`);
  if (s.env && s.env.type && !names.envs.includes(s.env.type)) err(`env "${s.env.type}" does not exist (${names.envs.join(', ')})`);
  for (const i of s.interact) if (!INTERACT[typeof i === 'string' ? i : i.type]) err(`interact "${typeof i === 'string' ? i : i.type}" does not exist (${Object.keys(INTERACT).join(', ')})`);
  for (const k of s.keepOut) if (!(k && k.w > 0 && k.h > 0)) err('keepOut needs {x, y, w, h} as fractions of the frame (0..1)');
  return {errors, advice, spec: s};
}

// the CONNECT AI LAB prop set (src/plugins/brand.js) and the typeface each one uses for its 3D letters
export const BRAND_OBJECTS = ['wordmark', 'monogram', 'building', 'cinema-camera', 'microphone', 'workstation', 'display', 'laptop', 'softbox', 'clapper', 'book'];
const BRAND_FONT = {wordmark: 'light', building: 'sans'};

// what optional adapters a spec uses (so a web page ships only those)
export function specNeeds(raw) {
  const s = normalizeSpec(raw);
  const need = new Set();
  const OBJ = {text3d: ['text3d'], gltf: ['gltf'], svg: ['svg'], blob: ['jsm-objects'], sky: ['jsm-objects'], teapot: ['jsm-geometries'], parametric: ['jsm-geometries']};
  for (const t of BRAND_OBJECTS) OBJ[t] = ['brand', 'text3d'];
  const POST = {ao: 'post-extra', outline: 'post-extra', pixel: 'post-extra', halftone: 'post-extra', dof: 'post-extra', smaa: 'post-extra'};
  const walk = (o) => {
    (OBJ[o.type] || []).forEach((n) => need.add(n));
    if (o.type === 'text3d' && o.fontFile) need.add('ttf');
    else if (o.type === 'text3d') need.add('font:' + fontKey(o.font || 'bold'));
    if (BRAND_FONT[o.type]) need.add('font:' + fontKey(o.font || BRAND_FONT[o.type]));
    if (['dynamic', 'fixed', true].includes(o.body) || ['dynamic', 'fixed', true].includes(o.bodyEach)) need.add('physics');
    if (o.type === 'gltf' && o.bvh !== false) need.add('bvh');
    (o.children || []).forEach(walk);
  };
  s.objects.forEach(walk);
  s.backdrop.forEach(walk);
  for (const p of s.post) if (POST[p.type]) need.add(POST[p.type]);
  if (s.env && s.env.type === 'hdri') need.add('hdri');
  if (s.background && s.background.type === 'sky') need.add('jsm-objects');
  if (s.physics) need.add('physics');
  return [...need];
}
