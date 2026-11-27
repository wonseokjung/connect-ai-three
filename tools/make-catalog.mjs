// Writes the catalog: one small complete spec per item under catalog/<group>/<id>.json, then catalog/index.json.
// Every item is rendered as a clip for the catalog page, so every item is a scene that really runs.
// 0.2: every example stars a CONNECT AI LAB object (wordmark, monogram, building, camera, microphone, workstation,
// display, laptop, softbox, clapper, book, the NASA astronaut) and the eight looks and five colour schemes are
// spread evenly, so no two neighbours on the page look alike.
import fs from 'node:fs';
import path from 'node:path';
import {KIT, writeJson} from '../lib/paths.mjs';
import {buildIndex} from '../lib/catalog.mjs';
import {REG, LOOKS, MOTIONS, CAMERA_MOTIONS, LIGHTS, LIGHT_MOTIONS, INTERACT} from '../src/runtime/node-names.mjs';

const CORE = 'three.js core', JSM = 'three.js examples/jsm', OURS = 'CONNECT AI LAB';
const GOLD = '#D6892A', GOLDHI = '#F2B45A', IVORY = '#EBE2D2', TEAL = '#2F8F9D', BLUE = '#1F3F7A', RED = '#C8372D', INK = '#15171c';
const D = 4;
const items = [];
let order = 0;
const add = (group, id, title, about, prompt, source, spec, extra = {}) => items.push({id, group, title, about, prompt, source, license: source.includes('Rapier') ? 'Apache-2.0' : 'MIT', order: order++, ...extra, spec: {name: id, ...spec}});

// --- shared pieces -------------------------------------------------------------------------------------------------
const floor = (kind = 'mirror', extra = {}) => ({id: 'floor', type: 'floor', kind, ...extra});
const matte = (color = '#0c0d10') => floor('matte', {material: {preset: 'black', color, roughness: 0.78, clearcoat: 0}});
const pale = (color = '#dcd8d0') => floor('matte', {material: {preset: 'clay', color}, size: 300});
const cam = (motion = [{type: 'orbit', from: -12, to: 12, dur: D}], extra = {}) => ({position: [0, 1.4, 5.6], target: [0, 1.0, 0], fov: 34, motion, ...extra});
const slow = (a = -10, b = 10) => [{type: 'orbit', from: a, to: b, dur: D}];
// colour schemes on the dark looks: the pool of light on the back wall + the two rim lights
const key = (i = 2.5, c = '#fff2e2') => ({type: 'key', color: c, intensity: i, position: [-3.2, 4.2, 4.5]});
const amb = {type: 'ambient', color: '#8fa0b8', intensity: 0.13};
const TONE = {
  gold: {},
  teal: {backdrop: [{type: 'backglow', color: TEAL, intensity: 0.2}], lights: [key(), {type: 'rim', color: TEAL, intensity: 8, position: [3.6, 2.6, -4.2]}, {type: 'rim', color: GOLD, intensity: 3, position: [-4.2, 1.4, -3.2]}, amb], env: {type: 'softbox', intensity: 1.9, warm: '#7fd0d8'}},
  blue: {backdrop: [{type: 'backglow', color: '#2f5fc0', intensity: 0.22}], lights: [key(2.3, '#e6eeff'), {type: 'rim', color: '#3f6fd0', intensity: 9, position: [3.6, 2.6, -4.2]}, {type: 'rim', color: GOLD, intensity: 3.5, position: [-4.2, 1.4, -3.2]}, amb], env: {type: 'softbox', intensity: 1.9, warm: '#8fb0f0'}},
  ivory: {backdrop: [{type: 'backglow', color: '#c9c2b4', intensity: 0.16}], lights: [key(2.8, '#ffffff'), {type: 'rim', color: IVORY, intensity: 5, position: [3.6, 2.6, -4.2]}, {type: 'rim', color: '#4f7dd1', intensity: 2.2, position: [-4.2, 1.4, -3.2]}, amb], env: {type: 'softbox', intensity: 1.9, warm: '#ffffff'}},
  red: {backdrop: [{type: 'backglow', color: '#b0301f', intensity: 0.16}], lights: [key(), {type: 'rim', color: RED, intensity: 7, position: [3.6, 2.6, -4.2]}, {type: 'rim', color: GOLD, intensity: 3, position: [-4.2, 1.4, -3.2]}, amb], env: {type: 'softbox', intensity: 1.9, warm: '#ff9a7a'}},
};
// a scene: look + colour scheme + camera + objects
const S = (look, tone, camera, objects, extra = {}) => ({duration: D, look, ...(look === 'connect-gold-night' ? TONE[tone] || {} : {}), camera, objects, ...extra});
const night = (tone, camera, objects, extra) => S('connect-gold-night', tone, camera, objects, extra);
const paint = (color, extra = {}) => ({preset: 'paint', color, ...extra});
// brand objects with sensible defaults
const wordmark = (o = {}) => ({id: 'wordmark', type: 'wordmark', text: 'CONNECT AI LAB', size: 0.4, position: [0, 1.1, 0], ...o});
const mono = (o = {}) => ({id: 'monogram', type: 'monogram', position: [0, 1.3, 0], ...o});
const building = (o = {}) => ({id: 'building', type: 'building', position: [0, 0, 0], rotation: [0, -26, 0], scale: 0.82, ...o});
const camera3d = (o = {}) => ({id: 'camera', type: 'cinema-camera', position: [0, 1.15, 0], rotation: [0, 32, 0], scale: 1.25, ...o});
const mic = (o = {}) => ({id: 'mic', type: 'microphone', position: [0, 0, 0], rotation: [0, 20, 0], ...o});
const work = (o = {}) => ({id: 'workstation', type: 'workstation', position: [0, 0, 0], rotation: [0, 28, 0], ...o});
const display = (o = {}) => ({id: 'display', type: 'display', position: [0, 0, 0], ...o});
const laptop = (o = {}) => ({id: 'laptop', type: 'laptop', position: [0, 0, 0], rotation: [0, 26, 0], ...o});
const softbox = (o = {}) => ({id: 'softbox', type: 'softbox', position: [0, 0, 0], ...o});
const clapper = (o = {}) => ({id: 'clapper', type: 'clapper', position: [0, 1.15, 0], rotation: [0, -18, 0], ...o});
const book = (o = {}) => ({id: 'book', type: 'book', position: [0, 0.95, 0], rotation: [0, 26, 0], ...o});
const astro = (o = {}) => ({id: 'astronaut', type: 'gltf', src: 'kit:astronaut.glb', fit: 2.1, position: [0, 0, 0], ...o});
const letters = (text, o = {}) => ({id: 'letters', type: 'text3d', text, font: 'bold', size: 1.1, depth: 0.34, position: [0, 0.95, 0], material: 'ivory', ...o});
const desk = (y = 0.74, o = {}) => ({id: 'desk', type: 'rounded-box', size: [5.2, 0.08, 1.9], radius: 0.03, position: [0, y, 0], material: {preset: 'black', color: '#16171b', roughness: 0.5}, ...o});
const NASA = {assets: 'astronaut.glb: NASA 3D Resources (public domain)'};

// ---------------------------------------------------------------- objects
const O = 'object';
add(O, 'wordmark', 'Wordmark', REG.objects.get('wordmark').about, "My brand name 'CONNECT AI LAB' as thin gold 3D letters with a small line under it, on a black mirror floor.", OURS + ' on TextGeometry', S('studio-black', null, cam(slow(-14, 10), {position: [0, 1.3, 7.2], target: [0, 1.05, 0]}), [floor('mirror', {dim: 0.72}),
  wordmark({size: 0.46, rule: true, sub: 'The most beautiful way to learn AI', split: true, motion: [{type: 'stagger', at: 0.15, each: 0.07, dur: 0.7, kind: 'rise'}]}),
]), {peak: 3.2});
add(O, 'monogram', 'Monogram', REG.objects.get('monogram').about, 'Our mark as a gold sculpture on a small black pedestal, turning slowly, teal light behind.', OURS, night('teal', cam(slow()), [floor(),
  mono({pedestal: true, position: [0, 1.42, 0], motion: [{type: 'turntable', speed: 24}]}),
]));
add(O, 'building', 'Studio building', REG.objects.get('building').about, "A small studio building at night with lit windows and the sign 'CONNECT AI LAB' on the roof.", OURS + ' on InstancedMesh', S('connect-night-city', null, cam(slow(-20, 12), {position: [0, 1.7, 7.6], target: [0, 1.25, 0]}), [floor('mirror', {size: 400, dim: 0.62}),
  building({motion: [{type: 'rise', at: 0.1, from: -0.5, dur: 1.2}]}),
]));
add(O, 'cinema-camera', 'Camera', REG.objects.get('cinema-camera').about, 'My camera on its tripod, record light blinking, in a bright studio.', OURS, S('pale-studio', null, cam(slow(-24, 14), {position: [0, 1.8, 7.4], target: [0, 1.5, 0]}), [pale(), floor('shadow', {id: 'shadow', opacity: 0.28}),
  camera3d({tripod: true, position: [0, 0, 0], scale: 1.1, rotation: [0, -34, 0]}),
]));
add(O, 'microphone', 'Microphone', REG.objects.get('microphone').about, 'A broadcast microphone on a desk stand, lit from behind in red and gold.', OURS, night('red', cam(slow(-14, 14), {position: [0, 1.25, 5], target: [0, 0.95, 0]}), [floor(),
  mic({motion: [{type: 'turntable', speed: 14}]}),
]));
add(O, 'workstation', 'Workstation', REG.objects.get('workstation').about, 'A compact aluminium desktop computer on a black mirror, a soft blue light behind.', OURS, night('blue', cam(slow(-18, 14), {position: [0, 1.35, 4.6], target: [0, 0.42, 0]}), [floor(),
  work({motion: [{type: 'turntable', speed: 16}]}),
]));
add(O, 'display', 'Display', REG.objects.get('display').about, "A studio display on its stand showing a title card: 'CONNECT AI LAB'.", OURS, S('midnight-glass', null, cam(slow(-22, 16), {position: [0, 1.35, 6], target: [0, 1.05, 0]}), [floor('mirror', {dim: 0.72}),
  display({kicker: 'Open source', title: 'connect-ai-three', rotation: [0, -8, 0], motion: [{type: 'rise', at: 0.1, from: -0.3}]}),
]));
add(O, 'laptop', 'Laptop', REG.objects.get('laptop').about, 'An open laptop on an ivory desk; my title on its screen.', OURS, S('pale-studio', null, cam(slow(-18, 18), {position: [0, 1.7, 4.8], target: [0, 0.55, 0]}), [pale('#e4dfd5'), floor('shadow', {id: 'shadow', opacity: 0.26}),
  laptop({title: 'Visual Vibe Coding', kicker: 'CONNECT AI LAB'}),
]));
add(O, 'softbox', 'Softbox', REG.objects.get('softbox').about, 'A studio softbox on its stand lighting ivory letters from the side.', OURS, night('ivory', cam(slow(-8, 12), {position: [0.3, 1.5, 7.2], target: [0.3, 1.15, 0]}), [matte(),
  softbox({position: [-2.3, 0, 0.4], rotation: [0, 62, 0]}),
  letters('AI', {position: [0.9, 0.75, 0], size: 1.5, depth: 0.42, font: 'serif-bold'}),
], {addLights: [{type: 'spot', color: '#fff0dc', intensity: 55, position: [-2.3, 2.1, 0.9], target: [0.9, 0.9, 0], angle: 40, penumbra: 0.9}]}));
add(O, 'clapper', 'Clapperboard', REG.objects.get('clapper').about, 'A film clapperboard with my title that claps once.', OURS, night('gold', cam(slow(-10, 10), {position: [0, 1.3, 5], target: [0, 1.25, 0]}), [floor(),
  clapper({clapAt: 1.4, motion: [{type: 'float', amp: 0.03}]}),
]), {peak: 1.2});
add(O, 'book', 'Course book', REG.objects.get('book').about, "A hardcover course book, 'VISUAL VIBE CODING', standing in teal light.", OURS, night('teal', cam(slow(-22, 10), {position: [0, 1.2, 4.6], target: [0, 0.95, 0]}), [floor(),
  book({material: {preset: 'ivory'}, color: INK, accent: '#9a5f14', motion: [{type: 'turntable', speed: 18, phase: -10}]}),
]));
add(O, 'primitives', 'Primitives', 'box, sphere, cylinder, cone, capsule, torus', 'Build our mark from six basic shapes: an open ring, a ball, a rod, on a stem and a block, with a small lamp pointed at it.', CORE, S('studio-black', null, cam(slow(-16, 14), {position: [0, 1.5, 5.4], target: [0, 1.2, 0]}), [floor('mirror', {dim: 0.72}),
  {id: 'mark-in-six-shapes', type: 'group', position: [0, 1.62, 0], motion: [{type: 'stagger', at: 0.15, each: 0.2}], children: [
    {id: 'base', type: 'box', size: [1.5, 0.14, 0.8], position: [0, -1.5, 0], material: {preset: 'black', color: INK}},
    {id: 'stem', type: 'cylinder', radius: 0.035, height: 0.64, position: [0, -1.12, 0], material: 'steel'},
    {id: 'open-ring', type: 'torus', radius: 0.62, tube: 0.124, arc: 296, rotation: [0, 0, 32], position: [0, 0, 0], material: 'gold'},
    {id: 'node', type: 'sphere', radius: 0.22, position: [0, 0, 0], material: 'gold'},
    {id: 'link', type: 'capsule', radius: 0.045, height: 0.42, position: [0.42, 0, 0], rotation: [0, 0, 90], material: 'ivory'},
    {id: 'end-node', type: 'sphere', radius: 0.1, position: [0.72, 0, 0], material: 'gold'},
    {id: 'lamp', type: 'cone', radius: 0.17, height: 0.3, position: [-1.35, 0.55, 0.3], rotation: [0, 0, 58], material: paint(TEAL)},
  ]},
]), {peak: 3.4});
add(O, 'flat-shapes', 'Flat shapes', 'plane, disc and ring: plates, floor marks, thin rules', 'A round stage mark on the floor, a tall teal plate behind, our gold mark standing on it.', CORE, night('gold', cam(slow()), [floor(),
  {id: 'plate', type: 'plane', width: 2.3, height: 2.7, position: [0, 1.35, -1.3], material: paint(TEAL, {side: 2})},
  {id: 'stage-disc', type: 'disc', radius: 1.05, position: [0, 0.012, 0.3], rotation: [-90, 0, 0], material: {preset: 'ivory', side: 2}, shadow: false, motion: [{type: 'pop', at: 0.15}]},
  {id: 'stage-ring', type: 'ring', inner: 1.28, radius: 1.36, position: [0, 0.014, 0.3], rotation: [-90, 0, 0], material: {preset: 'flat', color: GOLD, side: 2}, shadow: false, motion: [{type: 'pop', at: 0.45}]},
  mono({position: [0, 1.15, 0.3], radius: 0.5, motion: [{type: 'turntable', speed: 26}, {type: 'float', amp: 0.05}]}),
]));
add(O, 'rounded-box', 'Rounded box', 'box with soft edges that catch the light', 'Three rounded slabs as a plinth, the course book standing on top, turning slowly.', JSM + ' RoundedBoxGeometry', night('ivory', cam(slow(), {position: [0, 1.6, 6.2], target: [0, 1.2, 0]}), [floor(),
  {id: 'plinth', type: 'group', position: [0, 0, 0], motion: [{type: 'turntable', speed: 16}], children: [
    {id: 'slab-1', type: 'rounded-box', size: [2.0, 0.34, 2.0], radius: 0.06, position: [0, 0.17, 0], material: {preset: 'black', color: INK}},
    {id: 'slab-2', type: 'rounded-box', size: [1.5, 0.34, 1.5], radius: 0.06, position: [0, 0.51, 0], rotation: [0, 14, 0], material: 'ivory'},
    {id: 'slab-3', type: 'rounded-box', size: [1.05, 0.3, 1.05], radius: 0.06, position: [0, 0.83, 0], rotation: [0, 30, 0], material: 'gold'},
    book({id: 'plinth-book', position: [0, 1.74, 0], rotation: [0, 32, 0], material: paint(TEAL)}),
  ]},
]));
add(O, 'knot', 'Torus knot', 'one endless knot: a classic for trophies and material tests', 'A trophy: a gold knot on a black base with my name on the plate.', CORE, night('blue', cam(slow(), {position: [0, 1.4, 5.4], target: [0, 1.15, 0]}), [floor(),
  {id: 'trophy', type: 'group', position: [0, 0, 0], motion: [{type: 'turntable', speed: 14}], children: [
    {id: 'trophy-base', type: 'rounded-box', size: [1.5, 0.5, 0.9], radius: 0.04, position: [0, 0.25, 0], material: {preset: 'black', color: INK}},
    {id: 'trophy-plate', type: 'label', text: 'CONNECT AI LAB', size: 0.11, tracking: 0.3, weight: 400, color: GOLDHI, position: [0, 0.25, 0.455]},
    {id: 'trophy-stem', type: 'cylinder', radius: 0.05, height: 0.4, position: [0, 0.7, 0], material: 'gold'},
    {id: 'trophy-knot', type: 'knot', radius: 0.5, tube: 0.16, position: [0, 1.55, 0], material: 'gold', motion: [{type: 'turntable', speed: 30}]},
  ]},
]));
add(O, 'gem', 'Gem', 'faceted gem: icosa, octa or dodeca cut', "The letters 'AI' in ivory with three glass gems floating around them like crystals.", CORE, S('midnight-glass', null, cam(slow(-14, 14), {position: [0, 1.4, 6.2], target: [0, 1.1, 0]}), [floor('mirror', {dim: 0.7}),
  letters('AI', {font: 'serif-bold', size: 1.5, depth: 0.36, position: [0, 0.92, -0.2]}),
  {id: 'gem-a', type: 'gem', radius: 0.42, position: [-1.15, 1.55, 0.9], material: 'glass', motion: [{type: 'turntable', speed: 26}, {type: 'float', amp: 0.07}]},
  {id: 'gem-b', type: 'gem', cut: 'octa', radius: 0.3, position: [1.85, 0.75, 0.6], material: 'gold', motion: [{type: 'turntable', speed: -34}, {type: 'float', phase: 1.4}]},
  {id: 'gem-c', type: 'gem', cut: 'dodeca', radius: 0.24, position: [1.5, 2.15, -0.3], material: {preset: 'glass', tint: TEAL}, motion: [{type: 'turntable', speed: 30}, {type: 'float', phase: 2.6}]},
]));
add(O, 'text3d', '3D text', 'extruded letters in six built-in typefaces (thin, light, sans, bold, serif, serif-bold)', "The words 'Visual Vibe Coding' as gold serif 3D letters, a slow sway, reflected on the floor.", JSM + ' TextGeometry', night('gold', cam(slow(-8, 8), {position: [0, 1.3, 7], target: [0, 1.0, 0]}), [floor(),
  {id: 'title', type: 'text3d', text: 'Visual Vibe Coding', font: 'serif-bold', size: 0.62, depth: 0.12, tracking: 0.02, position: [0, 1.05, 0], material: 'gold', motion: [{type: 'sway', deg: 7, axis: 'y', period: 8}, {type: 'rise', at: 0.1, from: -0.4}]},
]));
add(O, 'text3d-letters', '3D text, letter by letter', 'split:true makes each letter its own object', "The name 'AI MENTOR JAY' arriving one ivory letter at a time, teal light behind.", JSM + ' TextGeometry', night('teal', cam(slow(-8, 8), {position: [0, 1.3, 7], target: [0, 1.0, 0]}), [floor(),
  {id: 'title', type: 'text3d', text: 'AI MENTOR JAY', font: 'sans', size: 0.56, depth: 0.14, tracking: 0.12, split: true, position: [0, 1.05, 0], material: 'ivory', motion: [{type: 'stagger', at: 0.25, each: 0.1, dur: 0.7}]},
]), {peak: 3.3});
add(O, 'label', 'Text label', 'thin sans text that is always crisp', "A small wide-spaced line 'CONNECT AI LAB' with a thin headline under it.", OURS + ' canvas label', S('studio-black', null, cam([{type: 'dolly', from: 1.1, to: 0.94, dur: D}], {position: [0, 1.35, 6.5], target: [0, 1.05, 0]}), [floor('mirror', {dim: 0.74}),
  {id: 'kicker', type: 'label', text: 'CONNECT AI LAB', size: 0.2, tracking: 0.4, weight: 400, color: GOLD, position: [0, 1.75, 0], motion: [{type: 'fade', at: 0.2}]},
  {id: 'head', type: 'label', text: 'The most beautiful way to learn AI', size: 0.52, weight: 200, position: [0, 1.1, 0], motion: [{type: 'rise', at: 0.5, from: -0.25}]},
  {id: 'rule', type: 'plane', width: 0.9, height: 0.012, position: [0, 0.55, 0], material: {preset: 'flat', color: GOLD}, shadow: false, motion: [{type: 'fade', at: 1.0}]},
]));
add(O, 'card', 'Glass card', 'frosted panel with a kicker, a title and a gold rule', "Three frosted glass cards: 'Say it', 'One spec', 'Web + video', rising in turn.", OURS + ' on RoundedBoxGeometry', S('midnight-glass', null, cam([{type: 'orbit', from: -14, to: 10, dur: D}], {position: [0, 1.5, 7.6], target: [0, 1.25, 0]}), [floor('mirror', {dim: 0.72}),
  ...['Say it', 'One spec', 'Web + video'].map((t, i) => ({id: `card-${i + 1}`, type: 'card', kicker: `0${i + 1}`, title: t, width: 2.15, height: 1.9, position: [(i - 1) * 2.4, 1.3, -Math.abs(i - 1) * 0.45], rotation: [0, (1 - i) * 14, 0], motion: [{type: 'rise', at: 0.2 + i * 0.3}, {type: 'float', amp: 0.035, phase: i * 1.3}]})),
]));
add(O, 'image', 'Image plane', 'your own picture on a framed plane', 'My screenshot on a tilted black-framed panel that slides in from the right.', CORE, night('blue', cam(slow(-8, 8)), [floor(),
  {id: 'pic', type: 'image', src: 'kit:sample.jpg', height: 1.9, position: [0, 1.25, 0], rotation: [0, -16, 0], motion: [{type: 'slide', at: 0.2, from: [2.5, 0, -1]}, {type: 'sway', deg: 3, axis: 'y', period: 6}]},
]));
add(O, 'floor-mirror', 'Mirror floor', 'black floor that reflects the scene', 'My camera and my microphone standing on a black mirror floor.', JSM + ' Reflector', S('studio-black', null, cam(slow(-16, 12), {position: [0, 1.3, 6], target: [0, 0.9, 0]}), [floor('mirror', {dim: 0.45}),
  camera3d({position: [-1.05, 0.62, 0.2], rotation: [0, 38, 0], scale: 1.05}),
  mic({position: [1.25, 0, 0], rotation: [0, -20, 0]}),
]));
add(O, 'floor-grid', 'Grid floor', 'thin lines fading into the distance', 'A drawing-board view: the studio building as a gold wireframe over an endless thin grid.', OURS + ' shader', S('blueprint', null, cam([{type: 'orbit', from: -24, to: 16, dur: D}], {position: [0, 2.1, 7.6], target: [0, 1.15, 0]}), [floor('grid', {cell: 0.5, opacity: 0.5}),
  building({material: {preset: 'wire', color: '#dfeaf7', opacity: 0.5}, groundMaterial: {preset: 'wire', color: '#dfeaf7', opacity: 0.25}, lit: 0.25, glow: 0.9, warm: GOLDHI, dark: '#0f2540'}),
]));
add(O, 'floor-shadow', 'Shadow catcher', 'an invisible floor that only shows the shadow', "Big black letters 'JAY' standing in a bright studio with a soft shadow under them.", CORE + ' ShadowMaterial', S('pale-studio', null, cam(slow(-18, 14), {position: [0, 1.5, 6.4], target: [0, 0.85, 0]}), [floor('shadow', {opacity: 0.34}),
  letters('JAY', {size: 1.35, depth: 0.5, position: [0, 0.68, 0], material: {preset: 'black', color: INK}, motion: [{type: 'sway', deg: 6, axis: 'y', period: 6}]}),
]));
add(O, 'line', 'Fat line', 'lines that keep their width and can draw themselves', 'Three thin orbits in gold, ivory and teal drawing themselves around our mark.', JSM + ' Line2', night('blue', cam(slow(-14, 14), {position: [0, 1.4, 6], target: [0, 1.25, 0]}), [floor(),
  mono({radius: 0.42, material: 'ivory', position: [0, 1.3, 0], motion: [{type: 'turntable', speed: 20}]}),
  {id: 'orbit-a', type: 'line', curve: 'orbit', radius: 1.3, width: 4, color: GOLD, position: [0, 1.3, 0], rotation: [18, 0, 8], motion: [{type: 'draw', at: 0.1, dur: 1.5}, {type: 'turntable', speed: 30}]},
  {id: 'orbit-b', type: 'line', curve: 'orbit', radius: 1.65, width: 3, color: IVORY, position: [0, 1.3, 0], rotation: [-28, 0, -14], motion: [{type: 'draw', at: 0.5, dur: 1.5}, {type: 'turntable', speed: -22}]},
  {id: 'orbit-c', type: 'line', curve: 'orbit', radius: 2.0, width: 3, color: '#5fc3cf', position: [0, 1.3, 0], rotation: [62, 0, 20], motion: [{type: 'draw', at: 0.9, dur: 1.5}, {type: 'turntable', speed: 16}]},
]), {peak: 3.2});
add(O, 'ribbon', 'Ribbon', 'a solid tube along a curve that draws itself', 'A gold ribbon sweeping once around my microphone.', CORE + ' TubeGeometry', night('teal', cam(slow(-12, 12), {position: [0, 1.35, 5.6], target: [0, 1.05, 0]}), [floor(),
  mic({position: [0, 0, 0], rotation: [0, 12, 0]}),
  {id: 'ribbon', type: 'ribbon', curve: 'swoosh', radius: 1.5, thickness: 0.04, position: [0, 1.15, 0], material: 'gold', motion: [{type: 'draw', at: 0.15, dur: 1.9, ease: 'out'}, {type: 'turntable', speed: 18}]},
]), {peak: 3.1});
add(O, 'rings', 'Gyro rings', 'metal rings turning around a core', 'A gyroscope of gold and steel rings turning around our small ivory mark.', OURS, night('gold', cam(slow()), [floor(),
  {id: 'rings', type: 'rings', radius: 1.2, core: false, position: [0, 1.35, 0], motion: [{type: 'pop', at: 0.1}]},
  mono({radius: 0.3, material: 'ivory', position: [-0.06, 1.35, 0], motion: [{type: 'turntable', speed: -30}]}),
]));
add(O, 'instances-wave', 'Instances: wave grid', 'hundreds of copies in one draw call, moving as a wave', 'A sea of small teal discs rippling under the gold wordmark.', CORE + ' InstancedMesh', night('teal', cam([{type: 'orbit', from: -14, to: 14, dur: D}], {position: [0, 2.7, 7.4], target: [0, 0.9, 0]}), [
  {id: 'grid', type: 'instances', layout: 'wave', shape: 'coin', cols: 30, rows: 24, size: 0.2, spacing: 0.26, position: [0, 0.2, 0], material: paint(TEAL, {roughness: 0.3}), enter: {at: 0, each: 0, dur: 0.9, byDistance: true}},
  wordmark({size: 0.42, position: [0, 1.75, 0], font: 'sans', tracking: 0.16}),
]));
add(O, 'instances-sphere', 'Instances: sphere', 'copies laid out on a sphere, ring, spiral or scatter', "A shell of small gold gems turning around the ivory letters 'AI'.", CORE + ' InstancedMesh', night('gold', cam(slow(), {position: [0, 1.45, 6], target: [0, 1.35, 0]}), [floor(),
  {id: 'shell', type: 'instances', layout: 'sphere', shape: 'gem', count: 180, size: 0.11, radius: 1.45, tumble: true, position: [0, 1.4, 0], material: 'gold', motion: [{type: 'turntable', speed: 16}]},
  letters('AI', {font: 'bold', size: 0.8, depth: 0.26, position: [0, 1.4, 0]}),
]));
add(O, 'instances-spiral', 'Instances: spiral', 'the same mesh along a spiral', 'Gold coins climbing a spiral around my course book.', CORE + ' InstancedMesh', night('blue', cam(slow(), {position: [0, 1.5, 6.4], target: [0, 1.15, 0]}), [floor(),
  book({position: [0, 1.15, 0], material: {preset: 'ivory'}, color: INK, accent: '#9a5f14', motion: [{type: 'turntable', speed: -14}]}),
  {id: 'coins', type: 'instances', layout: 'spiral', shape: 'coin', count: 120, size: 0.24, radius: 1.9, height: 2.2, position: [0, 1.2, 0], material: 'gold', enter: {at: 0.1, each: 0.012, dur: 0.5}, motion: [{type: 'turntable', speed: 24}]},
]));
add(O, 'globe', 'Dot globe', 'a globe of dots with arcs that draw themselves', 'A dark globe made of dots, gold arcs connecting places one by one; teal rim.', OURS + ' on Line2', S('midnight-glass', null, cam(slow()), [floor('mirror', {dim: 0.72}),
  {id: 'globe', type: 'globe', radius: 1.2, color: '#4fb3c4', dotColor: IVORY, arcColor: GOLDHI, position: [0, 1.35, 0], motion: [{type: 'turntable', speed: 12}]},
]));
add(O, 'bars', '3D bars', 'a bar chart from your own numbers', 'My four numbers as 3D bars growing one by one, teal with the biggest in gold.', OURS + ' on RoundedBoxGeometry', S('pale-studio', null, cam([{type: 'orbit', from: -22, to: 8, dur: D}], {position: [0, 1.7, 7.2], target: [0, 1.1, 0]}), [pale(), floor('shadow', {id: 'shadow', opacity: 0.25}),
  {id: 'bars', type: 'bars', values: [2, 3, 5, 8], labels: ['A', 'B', 'C', 'D'], height: 1.8, position: [0, 0.3, 0], material: 'gold', material2: paint(TEAL)},
]));
add(O, 'city', 'Night city', REG.objects.get('city').about, 'A night skyline: dark towers in haze, a few lit windows, red lights on the roofs; the camera slides sideways.', OURS + ' shader on InstancedMesh', {duration: D, look: 'connect-night-city', backdrop: [], camera: {position: [-8, 7, 30], target: [0, 12, -120], fov: 30, motion: [{type: 'truck', by: [16, 0, 0], dur: D}]}, objects: [
  floor('mirror', {size: 600, dim: 0.55}), {id: 'city', type: 'city'},
]});
add(O, 'backglow', 'Back glow', 'a soft pool of light on the wall behind the subject', 'A soft teal pool of light on the wall behind my camera, like a night studio set.', OURS + ' shader', S('studio-black', null, cam(slow()), [floor(),
  {id: 'glow', type: 'backglow', color: TEAL, intensity: 0.5, width: 16, height: 9, y: 1.8, z: -6, motion: [{type: 'fade', at: 0.3, dur: 1.4}]},
  camera3d({rotation: [0, -36, 0]}),
], {backdrop: []}));
add(O, 'terrain', 'Terrain', 'ridged ground from our own noise, optional wire', 'Dark mountains with a faint blue wire, our studio building standing on the plain, the camera rising.', OURS + ' noise', night('blue', {position: [0, 1.5, 6.6], target: [0, 0.8, 0], fov: 38, motion: [{type: 'crane', by: 1.4, dur: D}, {type: 'orbit', from: -10, to: 10, dur: D}]}, [
  {id: 'land', type: 'terrain', wire: true, wireColor: '#9fb8e8', size: 18, amp: 2.4, position: [0, -0.3, -1]},
  building({scale: 0.62, position: [0, -0.1, 0], rotation: [0, -30, 0]}),
]));
add(O, 'waves', 'Rolling surface', 'a dark moving surface with coloured crests', 'A dark sea rolling slowly under our gold mark, teal light on the crests.', OURS + ' shader', night('teal', {position: [0, 1.5, 7], target: [0, 0.6, 0], fov: 38, motion: [{type: 'dolly', from: 1.1, to: 0.9, dur: D}]}, [
  {id: 'sea', type: 'waves', amp: 0.4, color2: '#4fc3cf', position: [0, 0, -3]},
  mono({position: [0, 1.75, -1.5], radius: 0.55, motion: [{type: 'float', amp: 0.08}, {type: 'turntable', speed: 14}]}),
]));
add(O, 'group', 'Group', 'several objects that move, stagger and explode together', 'My desk as one group: display, computer, microphone and book move apart and come back together.', CORE, S('studio-black', null, cam(slow(-14, 14), {position: [0, 1.75, 6.2], target: [0, 1.25, 0]}), [floor('mirror', {dim: 0.72}),
  {id: 'desk-set', type: 'group', position: [0, 0, 0], motion: [{type: 'explode', at: 0.6, dur: 1, hold: 0.8, amount: 0.9}], children: [
    display({id: 'set-display', position: [0, 0.78, -0.45], width: 2.2, kicker: 'Group', title: 'One desk'}),
    work({id: 'set-work', position: [1.75, 0.78, 0.1], width: 0.7, rotation: [0, -20, 0]}),
    mic({id: 'set-mic', position: [-1.75, 0.78, 0.25], scale: 0.62}),
    book({id: 'set-book', position: [0.75, 0.86, 0.55], rotation: [-90, 0, 24], scale: 0.42}),
    desk(0.74, {id: 'set-desk', size: [4.6, 0.08, 1.7], position: [0, 0.74, 0.001]}),
  ]},
]), {peak: 0.4});
add(O, 'gltf', 'glTF model', 'your .glb or .gltf: fitted, grounded, animated by time', 'Load my astronaut.glb, stand it on the mirror floor beside our wordmark, turn it slowly.', JSM + ' GLTFLoader', night('blue', cam(slow(-12, 12), {position: [0, 1.4, 6.4], target: [0, 1.1, 0]}), [floor(),
  astro({position: [-1.5, 0, 0.2], motion: [{type: 'turntable', speed: 22}]}),
  wordmark({text: 'CONNECT', size: 0.36, position: [1.35, 1.25, 0], font: 'sans', tracking: 0.14, rule: true, sub: 'AI LAB'}),
]), NASA);
add(O, 'svg', 'SVG logo in 3D', 'your .svg extruded into a solid object', 'Extrude my logo.svg into thick ivory and let it turn like a medal, red light behind.', JSM + ' SVGLoader', night('red', cam(slow()), [floor(),
  {id: 'mark', type: 'svg', src: 'kit:mark.svg', fit: 1.9, depth: 22, bevel: 2, position: [0, 1.2, 0], material: 'ivory', motion: [{type: 'pop', at: 0.15}, {type: 'sway', deg: 28, axis: 'y', period: 5}]},
]));
add(O, 'sky', 'Sky', 'physical sky with a sun', 'The studio building outdoors under a real sky, low sun, long shadows.', JSM + ' Sky', S('daylight', null, cam([{type: 'orbit', from: -16, to: 12, dur: D}], {position: [0, 1.6, 8.2], target: [0, 1.25, 0]}), [
  floor('matte', {material: {preset: 'clay', color: '#b9b4aa'}, size: 300}),
  building({lit: 0.2, glow: 0.7, material: {preset: 'plastic', color: '#e8e2d6', roughness: 0.6}, groundMaterial: {preset: 'clay', color: '#8f8a80'}, dark: '#2a3440', signMaterial: {preset: 'black', color: INK}}),
]));
add(O, 'blob', 'Liquid metal blob', 'metaballs that merge and split', 'A blob of liquid chrome hovering over my open laptop, splitting and merging.', JSM + ' MarchingCubes', night('teal', cam(slow(-14, 14), {position: [0, 1.7, 6], target: [0, 1.15, 0]}), [floor(),
  laptop({position: [0, 0, 0.2], rotation: [0, 18, 0], title: 'idea.json', kicker: 'Draft'}),
  {id: 'blob', type: 'blob', radius: 1.1, position: [0, 2.0, 0], material: 'chrome', speed: 1.4},
]));
add(O, 'teapot', 'Teapot', 'the Utah teapot, the hello-world of 3D', 'The classic teapot in ivory sitting on my desk next to the display.', JSM + ' TeapotGeometry', S('pale-studio', null, cam(slow(-16, 12), {position: [0, 1.75, 6.4], target: [0, 1.3, 0]}), [pale(), floor('shadow', {id: 'shadow', opacity: 0.22}),
  desk(0.74, {material: {preset: 'black', color: INK, roughness: 0.5}}),
  display({position: [-0.7, 0.78, -0.3], width: 2.1, rotation: [0, 10, 0], kicker: 'Hello', title: '3D since 1975'}),
  {id: 'pot', type: 'teapot', size: 0.34, position: [1.55, 1.12, 0.25], material: 'ivory', motion: [{type: 'turntable', speed: 24}]},
]));
add(O, 'parametric', 'Parametric surface', 'mobius band or klein bottle', 'A gold mobius band turning like a halo above my workstation.', JSM + ' ParametricGeometry', night('gold', cam(slow(-14, 14), {position: [0, 1.7, 6.6], target: [0, 1.05, 0]}), [floor(),
  work({position: [0, 0, 0], rotation: [0, 24, 0]}),
  {id: 'band', type: 'parametric', surface: 'mobius', radius: 0.5, position: [0, 1.6, 0], rotation: [0, 0, 0], material: 'gold', motion: [{type: 'turntable', speed: 30}, {type: 'float', amp: 0.05}]},
]));

// ---------------------------------------------------------------- materials (the swatch is our monogram on its pedestal)
const MAT_SAY = {gold: 'polished brand gold', 'gold-brushed': 'brushed gold with soft highlights', chrome: 'mirror chrome', steel: 'dark brushed steel', black: 'piano black', ivory: 'matte ivory', clay: 'matte clay with no gloss', plastic: 'soft glossy plastic', paint: 'deep red car paint with a clear coat', glass: 'clear glass', frosted: 'frosted glass', smoked: 'dark smoked glass', velvet: 'midnight velvet', iridescent: 'thin-film iridescent metal', glow: 'self-lit gold', wire: 'ivory wireframe', flat: 'flat unlit ivory', toon: 'three-step cel shading', rim: 'a dark body with a gold rim glow', gradient: 'a flowing gold-to-blue gradient'};
for (const name of Object.keys(MAT_SAY)) {
  const m = REG.materials.get(name);
  const glassy = ['glass', 'frosted', 'smoked'].includes(name);
  add('material', name, name, m.meta.about, `Make the mark ${MAT_SAY[name]}.`, m.meta.source.includes('CONNECT') ? OURS + ' shader' : CORE, S('studio-black', null, cam(slow(-10, 10), {position: [0, 1.45, 5], target: [0, 1.25, 0]}), [floor('mirror', {dim: 0.66}),
    mono({material: name, pedestal: true, pedestalMaterial: {preset: 'black', color: INK}, position: [0, 1.5, 0], radius: 0.66, motion: [{type: 'turntable', speed: 30, phase: -30}]}),
    ...(glassy ? [-0.55, 0, 0.55].map((x, i) => ({id: `bar-${i}`, type: 'cylinder', radius: 0.05, height: 2.2, position: [x, 1.5, -1.1], material: i === 1 ? 'ivory' : 'gold'})) : []),
  ]), {param: `"material": "${name}"`});
}

// ---------------------------------------------------------------- motion (21 moves, 21 different subjects)
const M = 'motion';
const mo = (id, prompt, spec, extra = {}) => add(M, id, id, MOTIONS[id].about, prompt, OURS, spec, {param: `{"type": "${id}"}  ${MOTIONS[id].params}`, ...extra});
const still = (p = [0, 1.35, 5.2], t = [0, 1.0, 0]) => cam([], {position: p, target: t});
mo('turntable', 'Turn my workstation slowly, forever.', S('studio-black', null, still([0, 1.5, 4.4], [0, 0.45, 0]), [floor('mirror', {dim: 0.66}), work({motion: [{type: 'turntable', speed: 45}]})]));
mo('spin', 'Give the clapperboard two quick spins, then let it rest.', night('gold', still([0, 1.3, 5.2], [0, 1.25, 0]), [floor(), clapper({clapAt: null, rotation: [0, 0, 0], motion: [{type: 'spin', turns: 2, at: 0.5, dur: 1.6}]})]), {peak: 3.2});
mo('float', 'Let our mark hover up and down gently.', S('midnight-glass', null, still([0, 1.4, 5], [0, 1.25, 0]), [floor('mirror', {dim: 0.7}), mono({rotation: [0, -24, 0], motion: [{type: 'float', amp: 0.2, period: 2.4}]})]));
mo('sway', "Tilt the letters 'JAY' left and right like a sign in the wind.", night('teal', still([0, 1.3, 5.6]), [floor(), letters('JAY', {motion: [{type: 'sway', deg: 16, axis: 'y', period: 3}]})]), {peak: 0.8});
mo('pop', 'Make the microphone pop in with a small overshoot.', S('pale-studio', null, still([0, 1.3, 5], [0, 0.95, 0]), [pale(), floor('shadow', {id: 'shadow', opacity: 0.26}), mic({motion: [{type: 'pop', at: 0.6, dur: 0.8}]})]), {peak: 1.05});
mo('fade', 'Fade the line in, hold, and fade it out.', S('connect-night-city', null, still([0, 1.35, 6.4], [0, 1.2, 0]), [floor('mirror', {size: 400, dim: 0.66}),
  {id: 'subject', type: 'label', text: 'AI for everyone', size: 0.66, weight: 200, position: [0, 1.3, 0], motion: [{type: 'fade', at: 0.3, dur: 0.9}, {type: 'fade', at: 2.6, dur: 0.9, from: 1, to: 0}]},
  {id: 'rule', type: 'plane', width: 0.8, height: 0.012, position: [0, 0.78, 0], material: {preset: 'flat', color: GOLD}, shadow: false}]), {peak: 1.8});
mo('rise', 'Bring the studio building up from below and let it settle.', night('blue', still([0, 1.7, 7.4], [0, 1.25, 0]), [floor(), building({motion: [{type: 'rise', at: 0.5, dur: 1.2, from: -1.6}]})]), {peak: 1.0});
mo('drop', "Drop the letters 'AI' from above with a bounce.", S('pale-studio', null, still([0, 1.4, 5.8], [0, 1.0, 0]), [pale(), floor('shadow', {id: 'shadow', opacity: 0.3}), letters('AI', {font: 'serif-bold', size: 1.5, depth: 0.4, position: [0, 0.82, 0], material: {preset: 'black', color: INK}, motion: [{type: 'drop', at: 0.5, dur: 1.1, from: 3}]})]), {peak: 0.95});
mo('slide', 'Slide the display in from the left.', S('studio-black', null, still([0, 1.35, 6.2], [0, 1.05, 0]), [floor('mirror', {dim: 0.7}), display({kicker: 'Slide', title: 'From the left', rotation: [0, 10, 0], motion: [{type: 'slide', at: 0.4, dur: 1.2, from: [-6, 0, 0]}]})]), {peak: 0.95});
mo('move', 'Move my camera on its tripod from the left side to the right side.', S('daylight', null, still([0, 1.7, 8], [0, 1.45, 0]), [floor('matte', {material: {preset: 'clay', color: '#b9b4aa'}, size: 300}), camera3d({tripod: true, scale: 1, position: [-1.9, 0, 0], rotation: [0, 38, 0], motion: [{type: 'move', at: 0.5, dur: 2.4, by: [3.8, 0, 0]}]})]), {peak: 1.9});
mo('scale', 'Grow the course book from small to full size.', night('red', still([0, 1.2, 4.6], [0, 0.95, 0]), [floor(), book({material: {preset: 'ivory'}, color: INK, accent: '#9a5f14', motion: [{type: 'scale', at: 0.4, dur: 2.2, from: 0.3, to: 1}, {type: 'turntable', speed: 20, phase: -40}]})]), {peak: 2.6});
mo('rotate', 'Turn the laptop around to face us, once.', S('blueprint', null, still([0, 1.9, 5], [0, 0.55, 0]), [floor('grid', {cell: 0.5, opacity: 0.45}), laptop({rotation: [0, 150, 0], motion: [{type: 'rotate', at: 0.7, dur: 1.6, by: [0, -150, 0]}]})]), {peak: 1.6});
mo('pulse', 'Let the softbox breathe like a light warming up.', night('ivory', still([0, 1.6, 6.4], [0, 1.45, 0]), [matte(), softbox({rotation: [0, -24, 0], position: [0, 0, 0], motion: [{type: 'pulse', amp: 0.06, period: 1.3}]})]));
mo('orbit', "The astronaut circling the letters 'AI'.", S('midnight-glass', null, still([0, 1.9, 7.2], [0, 1.25, 0]), [floor('mirror', {dim: 0.72}), letters('AI', {font: 'serif-bold', size: 1.3, depth: 0.34, position: [0, 0.95, 0], material: 'gold'}),
  astro({id: 'subject', fit: 0.9, position: [0, 1.0, 0], motion: [{type: 'orbit', radius: 2.3, speed: 80, center: [0, 0, 0], tilt: 10}, {type: 'turntable', speed: -80}]})]), NASA);
mo('path', 'Send my camera flying along the drawn path.', night('teal', still([0, 1.4, 6.2], [0, 1.15, 0]), [floor(),
  {id: 'track', type: 'line', points: [[-2.5, 0.6, 0.5], [-1.0, 1.9, -0.8], [0.7, 0.8, 0.8], [2.5, 1.7, -0.2]], width: 2, color: IVORY, opacity: 0.5},
  camera3d({id: 'subject', scale: 0.6, rotation: [0, 60, 0], motion: [{type: 'path', points: [[-2.5, 0.6, 0.5], [-1.0, 1.9, -0.8], [0.7, 0.8, 0.8], [2.5, 1.7, -0.2]], at: 0.3, dur: 3.2}]})]), {peak: 2.2});
mo('explode', "Open the word 'CONNECT' into its letters, then close it.", S('pale-studio', null, still([0, 1.35, 6.6], [0, 1.1, 0]), [pale(), floor('shadow', {id: 'shadow', opacity: 0.22}),
  {id: 'subject', type: 'text3d', text: 'CONNECT', font: 'bold', size: 0.8, depth: 0.3, split: true, position: [0, 1.15, 0], material: {preset: 'black', color: INK}, motion: [{type: 'explode', at: 0.5, dur: 1, hold: 0.8, amount: 0.55}]}]), {peak: 1.9});
mo('stagger', 'Let the letters arrive one after another.', S('blueprint', null, still([0, 1.3, 7], [0, 1.05, 0]), [floor('grid', {cell: 0.5, opacity: 0.4}),
  {id: 'subject', type: 'text3d', text: 'VISUAL VIBE CODING', font: 'light', size: 0.44, depth: 0.08, tracking: 0.14, split: true, position: [0, 1.1, 0], material: {preset: 'flat', color: '#dfeaf7'}, motion: [{type: 'stagger', at: 0.3, each: 0.1, dur: 0.6}]}]), {peak: 3.3});
mo('draw', 'Draw our mark in one gold stroke.', night('gold', still([0, 1.35, 5.2], [0, 1.25, 0]), [floor(),
  {id: 'subject', type: 'ribbon', points: Array.from({length: 26}, (_, i) => { const a = (32 + (i / 25) * 296) * Math.PI / 180; return [Math.cos(a) * 0.95, Math.sin(a) * 0.95 + 1.3, 0]; }), thickness: 0.055, material: 'gold', motion: [{type: 'draw', at: 0.3, dur: 2.2}]},
  {id: 'node', type: 'sphere', radius: 0.2, position: [0, 1.3, 0], material: 'ivory', motion: [{type: 'pop', at: 2.4}]},
  {id: 'link', type: 'ribbon', points: [[0.2, 1.3, 0], [0.7, 1.3, 0], [1.25, 1.3, 0]], thickness: 0.035, material: 'ivory', motion: [{type: 'draw', at: 2.7, dur: 0.6}]}]), {peak: 3.6});
mo('count', 'Count from 0 to 100 on screen.', S('midnight-glass', null, still([0, 1.35, 5.2], [0, 1.1, 0]), [floor('mirror', {dim: 0.72}),
  {id: 'subject', type: 'label', text: '100', widest: '100', size: 1.3, weight: 200, position: [0, 1.25, 0], motion: [{type: 'count', from: 0, to: 100, at: 0.4, dur: 2.6}]},
  {id: 'unit', type: 'label', text: 'YOUR NUMBER HERE', size: 0.13, tracking: 0.35, color: '#5fc3cf', position: [0, 0.34, 0]}]));
mo('typewriter', 'Type the sentence onto my display, letter by letter.', night('blue', still([0, 1.35, 5.6], [0, 1.15, 0]), [floor(),
  display({title: ' ', kicker: 'connect-ai-three', width: 3.2}),
  {id: 'subject', type: 'label', text: 'Say it, get a three.js scene.', size: 0.2, weight: 300, position: [0, 1.28, 0.04], motion: [{type: 'typewriter', at: 0.3, dur: 2.4}]}]), {peak: 3.2});
mo('billboard', 'Keep the name tag facing the camera while the camera circles my microphone.', night('gold', cam([{type: 'orbit', from: -70, to: 70, dur: D}], {position: [0, 1.5, 5.4], target: [0, 1.15, 0]}), [floor(), mic({rotation: [0, 0, 0]}),
  {id: 'subject', type: 'label', text: 'AI MENTOR JAY', size: 0.2, tracking: 0.3, weight: 400, color: IVORY, position: [0, 2.25, 0], motion: [{type: 'billboard'}]}]));

// ---------------------------------------------------------------- camera (9 moves, 9 different sets)
const cm = (id, prompt, spec, extra = {}) => add('camera', id, id, CAMERA_MOTIONS[id].about, prompt, OURS, spec, {param: `{"type": "${id}"}  ${CAMERA_MOTIONS[id].params}`, ...extra});
cm('orbit', 'Circle my camera on its tripod from left to right.', S('pale-studio', null, {position: [0, 1.8, 7.4], target: [0, 1.5, 0], fov: 34, motion: [{type: 'orbit', from: -50, to: 50, dur: D}]}, [pale(), floor('shadow', {id: 'shadow', opacity: 0.28}), camera3d({tripod: true, position: [0, 0, 0], scale: 1, rotation: [0, 0, 0]})]));
cm('dolly', 'Push in slowly toward the microphone.', S('studio-black', null, {position: [0, 1.5, 7.6], target: [0, 1.35, 0], fov: 34, motion: [{type: 'dolly', from: 1.25, to: 0.5, dur: D}]}, [floor('mirror', {dim: 0.7}), mic({rotation: [0, 14, 0]}), softbox({position: [-2.6, 0, -1.6], rotation: [0, 50, 0], glow: 0.7})]));
cm('crane', 'Start low at the desk edge and rise above my desk.', night('teal', {position: [0, 0.55, 7.2], target: [0, 1.15, 0], fov: 34, motion: [{type: 'crane', by: 3.0, dur: D}]}, [floor(), desk(), display({position: [0, 0.78, -0.4], width: 2.3}), work({position: [1.85, 0.78, 0.1], width: 0.7, rotation: [0, -20, 0]}), mic({position: [-1.8, 0.78, 0.25], scale: 0.62}), laptop({position: [-0.2, 0.78, 0.5], width: 1.0, rotation: [0, 8, 0], title: 'notes', kicker: ''})]));
cm('truck', 'Slide the camera sideways past my gear: camera, microphone, laptop, book, clapperboard.', S('midnight-glass', null, {position: [-3.4, 1.35, 6.2], target: [-3.4, 0.95, 0], fov: 34, motion: [{type: 'truck', by: [6.8, 0, 0], dur: D}]}, [floor('mirror', {dim: 0.72}),
  camera3d({position: [-4.2, 0.6, 0], scale: 1, rotation: [0, 30, 0]}), mic({position: [-2.1, 0, 0]}), laptop({position: [0, 0, 0], rotation: [0, 12, 0]}), book({position: [2.1, 0.76, 0]}), clapper({position: [4.3, 0.95, 0], clapAt: null})]));
cm('zoom', 'Zoom the lens from wide to tight on the sign of the building.', S('daylight', null, {position: [0, 2.2, 12], target: [0, 2.35, 0], fov: 50, motion: [{type: 'zoom', from: 46, to: 17, dur: D}]}, [floor('matte', {material: {preset: 'clay', color: '#b9b4aa'}, size: 300}),
  building({scale: 1, rotation: [0, -14, 0], lit: 0.2, glow: 0.7, material: {preset: 'plastic', color: '#e8e2d6', roughness: 0.6}, groundMaterial: {preset: 'clay', color: '#8f8a80'}, dark: '#2a3440', signMaterial: {preset: 'black', color: INK}})]));
cm('shots', 'Fly between three camera positions: the whole set, our mark, then the clapperboard.', night('gold', {position: [0, 1.6, 8.4], target: [0, 1.2, 0], fov: 34, motion: [{type: 'shots', list: [{at: 0.3, dur: 1.2, position: [-3.4, 1.9, 3.4], target: [-2.2, 1.35, 0], arc: 0.3}, {at: 1.8, dur: 1.2, position: [3.6, 1.2, 3.2], target: [2.3, 1.15, 0], arc: 0.2}, {at: 3.1, dur: 0.9, position: [0, 1.6, 8.4], target: [0, 1.2, 0]}]}]}, [floor(),
  mono({position: [-2.2, 1.4, 0], pedestal: true, radius: 0.5}), wordmark({size: 0.3, position: [0, 1.2, -0.6], font: 'serif-bold', tracking: 0.08}), clapper({position: [2.3, 1.0, 0], scale: 0.8, clapAt: 2.6})]));
cm('path', 'Fly the camera along a smooth curve around the scene.', S('blueprint', null, {position: [-6, 1, 5], target: [0, 1, 0], fov: 34, motion: [{type: 'path', points: [[-6, 1, 5], [-2.5, 2.8, 6.5], [2.5, 1.2, 6.2], [5.5, 2.4, 3.5]], targets: [[0, 1, 0], [0, 1.2, 0], [0, 1.1, 0], [0, 1.2, 0]], dur: D, ease: 'inOut'}]}, [floor('grid', {cell: 0.5, opacity: 0.45}),
  letters('JAY', {size: 1.3, depth: 0.4, position: [0, 0.9, 0], material: {preset: 'wire', color: GOLDHI, opacity: 0.85}}), astro({position: [2.6, 0, -0.8], fit: 1.7, rotation: [0, -30, 0]})]), NASA);
cm('handheld', 'Hold the camera by hand outside the studio at night: a small organic drift.', S('connect-night-city', null, {position: [0.6, 1.3, 7.4], target: [0, 1.4, 0], fov: 34, motion: [{type: 'handheld', amp: 0.14, speed: 1.4}]}, [floor('mirror', {size: 400, dim: 0.6}), building({rotation: [0, -20, 0]})]));
cm('dolly-zoom', 'The vertigo move on our wordmark: push in while the lens widens, the city grows behind.', S('connect-night-city', null, {position: [0, 1.35, 13], target: [0, 1.15, 0], fov: 20, motion: [{type: 'dolly-zoom', to: 0.42, dur: D}]}, [floor('mirror', {size: 400, dim: 0.62}), wordmark({size: 0.4, font: 'serif-bold', tracking: 0.08, position: [0, 1.15, 0]})]));

// ---------------------------------------------------------------- lights (12, each on a different subject)
const lg = (id, title, about, prompt, spec, source = CORE, extra = {}) => add('light', id, title, about, prompt, source, {duration: D, backdrop: [], camera: cam([{type: 'orbit', from: -8, to: 8, dur: D}]), post: ['vignette', 'grain'], ...spec}, extra);
lg('key', 'Key light', LIGHTS.key.about, "One soft key light from the upper left on the ivory letters 'JAY', soft shadows on the floor.", {env: 'none', background: {type: 'gradient', top: '#10131a', bottom: '#040506'}, lights: [{type: 'key', intensity: 3.4, position: [-3.5, 5, 3.5]}, {type: 'ambient', intensity: 0.08}], objects: [matte('#191b20'), letters('JAY', {position: [0, 0.7, 0], rotation: [0, 14, 0]})], camera: cam(slow(-8, 8), {position: [0, 1.5, 6]})});
lg('rim-gold', 'Gold rim light', LIGHTS.rim.about, 'Light my microphone only from behind in gold, so just the edges show.', {env: 'none', background: {type: 'color', color: '#040405'}, lights: [{type: 'rim', color: GOLD, intensity: 12, position: [3.2, 2.6, -4.5]}, {type: 'rim', color: GOLDHI, intensity: 6, position: [-3.6, 2.2, -4]}, {type: 'ambient', intensity: 0.03}], objects: [matte('#050506'), mic({rotation: [0, 10, 0]})], camera: cam(slow(-10, 10), {position: [0, 1.3, 4.8], target: [0, 1.0, 0]})});
lg('fill', 'Key + fill', LIGHTS.fill.about, 'Key light from the left on my course book and camera, a weak blue fill from the right.', {env: 'none', background: {type: 'gradient', top: '#0c1322', bottom: '#040508'}, lights: [{type: 'key', intensity: 3.0, position: [-3.5, 4.5, 3.5]}, {type: 'fill', color: '#5f8fe0', intensity: 1.6, position: [4, 1.5, 3]}, {type: 'ambient', intensity: 0.05}], objects: [matte('#14161b'), book({position: [-1.0, 0.76, 0], rotation: [0, 30, 0], material: {preset: 'ivory'}, color: INK, accent: '#9a5f14'}), camera3d({position: [1.15, 0.62, 0.2], rotation: [0, -30, 0], scale: 1.05})], camera: cam(slow(-8, 8), {position: [0, 1.4, 5.6], target: [0, 0.8, 0]})});
lg('point', 'Point lights', LIGHTS.point.about, 'Two small warm lamps next to my workstation and laptop, nothing else.', {env: 'none', background: {type: 'color', color: '#050404'}, lights: [{type: 'point', color: '#ffb066', intensity: 5, position: [-1.9, 1.7, 1.7]}, {type: 'point', color: '#ff8a3c', intensity: 5, position: [2.3, 1.7, 0.2]}, {type: 'ambient', intensity: 0.03}], objects: [matte('#17181c'), work({position: [-1.3, 0, 0], rotation: [0, 30, 0]}), laptop({position: [1.0, 0, 0.3], rotation: [0, -24, 0], width: 1.5}), {id: 'lamp', type: 'sphere', radius: 0.07, position: [-1.9, 1.7, 1.7], material: 'glow', shadow: false}, {id: 'lamp2', type: 'sphere', radius: 0.07, position: [2.3, 1.7, 0.2], material: 'glow', shadow: false}], post: [{type: 'bloom', strength: 0.4}, 'vignette', 'grain'], camera: cam(slow(-8, 8), {position: [0, 1.5, 5.4], target: [0, 0.6, 0]})});
lg('spot', 'Spot light', LIGHTS.spot.about, 'A single spotlight cone from above on our mark, a pool of light on the floor.', {env: 'none', background: {type: 'color', color: '#040506'}, lights: [{type: 'spot', intensity: 70, position: [0, 6, 2.5], target: [0, 0.8, 0], angle: 20, penumbra: 0.7}, {type: 'ambient', intensity: 0.03}], objects: [matte('#1a1c21'), mono({material: 'ivory', pedestal: true, position: [0, 1.4, 0], rotation: [0, -20, 0]})], camera: cam(slow(-8, 8), {position: [0, 1.6, 5.6], target: [0, 1.0, 0]})});
lg('area', 'Softbox', LIGHTS.area.about, 'One big softbox right above my camera, like a product table.', {env: 'none', background: {type: 'gradient', top: '#0f1116', bottom: '#050506'}, lights: [{type: 'area', intensity: 16, position: [0, 3.2, 0.6], width: 4.4, height: 2.2}, {type: 'ambient', intensity: 0.05}], objects: [matte('#1b1d22'), camera3d({position: [0, 0.62, 0], rotation: [0, 34, 0], scale: 1.3, material: {preset: 'black', color: '#2a2c31', roughness: 0.42}})], camera: cam(slow(-8, 8), {position: [0, 1.5, 5.6], target: [0, 0.9, 0]})}, JSM + ' RectAreaLight');
lg('sun', 'Sun + sky light', LIGHTS.sun.about, "Outdoor sun, low in the sky, on the deep-blue letters 'CONNECT', with blue sky light in the shadows.", {look: 'daylight', objects: [floor('matte', {material: {preset: 'clay', color: '#b9b4aa'}, size: 300}), {id: 'word', type: 'text3d', text: 'CONNECT', font: 'bold', size: 0.9, depth: 0.5, position: [0, 0.47, 0], rotation: [0, 16, 0], material: paint(BLUE, {roughness: 0.5})}], post: ['vignette'], camera: cam(slow(-10, 10), {position: [0, 1.5, 7.2], target: [0, 0.7, 0]})}, JSM + ' Sky');
lg('sweep', 'Light sweep', LIGHT_MOTIONS.sweep, "Let a teal rim light travel around the black letters 'AI'.", {env: 'none', background: {type: 'color', color: '#030506'}, lights: [{type: 'rim', color: '#3fb6c6', intensity: 12, position: [0, 2.6, -5], motion: {type: 'sweep', from: -120, to: 120, dur: D}}, {type: 'ambient', intensity: 0.04}], objects: [matte('#050607'), letters('AI', {font: 'serif-bold', size: 1.6, depth: 0.42, position: [0, 0.86, 0], material: {preset: 'black', color: '#1c1e23', roughness: 0.3}})], post: [{type: 'bloom', strength: 0.25}, 'vignette', 'grain'], camera: cam(slow(-6, 6), {position: [0, 1.4, 5.6]})}, OURS);
lg('breathe', 'Breathing light', LIGHT_MOTIONS.breathe, 'Make the key light on the clapperboard swell and fade slowly.', {env: 'none', background: {type: 'gradient', top: '#120d0c', bottom: '#040404'}, lights: [{type: 'key', intensity: 3, position: [-3, 4.5, 4], motion: {type: 'breathe', period: 2, amp: 0.7}}, {type: 'rim', color: RED, intensity: 5, position: [3, 2, -4]}], objects: [matte('#08080a'), clapper({clapAt: null, position: [0, 1.1, 0]})], camera: cam(slow(-8, 8), {position: [0, 1.3, 5], target: [0, 1.2, 0]})}, OURS, {peak: 2.5});
lg('env-softbox', 'Environment: softbox room', 'our own reflection map: black room with warm and white strip lights', 'Reflections from a black studio with long warm strip lights on our chrome mark.', {env: {type: 'softbox', intensity: 1.6}, background: {type: 'gradient', top: '#0d1017', bottom: '#030304'}, lights: [{type: 'ambient', intensity: 0.05}], objects: [floor(), mono({material: 'chrome', pedestal: true, position: [0, 1.45, 0], radius: 0.66, motion: [{type: 'turntable', speed: 24}]})], post: ['bloom', 'vignette', 'grain'], camera: cam(slow(-8, 8), {position: [0, 1.45, 5], target: [0, 1.25, 0]})}, OURS);
lg('env-room', 'Environment: lit room', "three's RoomEnvironment: a neutral lit room", 'Reflections from a plain neutral room on my aluminium workstation.', {env: {type: 'room', intensity: 0.7}, background: {type: 'gradient', top: '#1a1c20', bottom: '#08090a'}, lights: [{type: 'ambient', intensity: 0.05}], objects: [floor(), work({motion: [{type: 'turntable', speed: 24}]})], post: ['vignette', 'grain'], camera: cam(slow(-8, 8), {position: [0, 1.4, 4.4], target: [0, 0.42, 0]})}, JSM + ' RoomEnvironment');
lg('env-hdri', 'Environment: HDRI photo', 'an .hdr studio photo lights the scene (CC0 file ships with the kit)', 'Light the chrome letters of my name with a real studio HDRI.', {env: {type: 'hdri', src: 'kit:studio_small_08_1k.hdr', intensity: 1}, background: {type: 'gradient', top: '#16181c', bottom: '#070708'}, lights: [{type: 'ambient', intensity: 0.03}], objects: [floor(), letters('JAY', {material: 'chrome', position: [0, 0.75, 0], motion: [{type: 'sway', deg: 14, axis: 'y', period: 6}]})], post: ['vignette', 'grain'], camera: cam(slow(-8, 8), {position: [0, 1.4, 5.8], target: [0, 0.85, 0]})}, JSM + ' RGBELoader');

// ---------------------------------------------------------------- post (11 passes, 11 different pictures)
const ps = (id, prompt, post, source, spec, extra = {}) => add('post', id, id, REG.post.get(id).about, prompt, source, {post, ...spec}, {param: `"post": [${post.map((p) => (typeof p === 'string' ? `"${p}"` : JSON.stringify(p))).join(', ')}]`, ...extra});
ps('bloom', 'Add a soft glow around the lit windows of the building.', [{type: 'bloom', strength: 0.5, radius: 0.7, threshold: 0.7}], JSM + ' UnrealBloomPass', S('connect-night-city', null, cam(slow(), {position: [0, 1.7, 7.6], target: [0, 1.25, 0]}), [floor('mirror', {size: 400, dim: 0.6}), building({glow: 1.25})]));
ps('vignette', 'Darken the corners around my microphone.', [{type: 'vignette', amount: 0.85}], OURS + ' shader', S('pale-studio', null, cam(slow(), {position: [0, 1.3, 5], target: [0, 0.95, 0]}), [pale(), floor('shadow', {id: 'shadow', opacity: 0.26}), mic()]));
ps('grain', 'Add visible film grain.', [{type: 'grain', amount: 0.17}], OURS + ' shader', S('midnight-glass', null, cam(slow(), {position: [0, 1.2, 4.8], target: [0, 0.95, 0]}), [floor('mirror', {dim: 0.72}), book({material: {preset: 'ivory'}, color: INK, accent: '#9a5f14'})]));
ps('chroma', 'Add colour fringing toward the corners, like an old lens.', [{type: 'chroma', amount: 3.4}, 'vignette'], OURS + ' shader', night('ivory', cam(slow(), {position: [0, 1.3, 6.6], target: [0, 1.1, 0]}), [floor(), clapper({position: [-2.1, 1.0, 0], clapAt: null, rotation: [0, 24, 0]}), letters('JAY', {size: 0.9, depth: 0.28, position: [0.9, 0.5, 0]})]));
ps('grade', 'Grade it teal and warm with more contrast.', [{type: 'grade', contrast: 1.2, saturation: 1.2, tint: '#9fe0e0', amount: 0.45}, 'bloom', 'vignette'], OURS + ' shader', night('gold', cam(slow(), {position: [0, 1.6, 5.6], target: [0, 1.3, 0]}), [floor(), desk(), display({position: [0, 0.78, -0.4], width: 2.3, kicker: 'Grade', title: 'Teal and warm'}), work({position: [1.85, 0.78, 0.1], width: 0.7, rotation: [0, -20, 0]}), mic({position: [-1.8, 0.78, 0.25], scale: 0.62})]));
ps('dof', 'Keep the wordmark sharp and blur the city behind it and the camera in front.', [{type: 'dof', aperture: 0.0006, maxblur: 0.011}, 'bloom', 'vignette', 'grain'], JSM + ' BokehPass', S('connect-night-city', null, cam(slow(), {position: [0, 1.3, 6.4], target: [0, 1.15, 0]}), [floor('mirror', {size: 400, dim: 0.62}), wordmark({size: 0.36, font: 'serif-bold', tracking: 0.08, position: [0, 1.15, 0]}), camera3d({position: [-1.5, 0.5, 3.2], scale: 0.7, rotation: [0, 150, 0]})]));
ps('ao', 'Add contact shadows where the things on my desk touch.', [{type: 'ao', radius: 0.45, strength: 1.6}, 'vignette'], JSM + ' GTAOPass', S('pale-studio', null, cam(slow(), {position: [0, 2.0, 5.6], target: [0, 0.6, 0]}), [pale(),
  work({position: [-1.15, 0, 0], material: {preset: 'clay', color: '#cfc9bd'}, mark: false}), letters('AI', {size: 1.0, depth: 0.5, position: [0.5, 0.5, 0.2], rotation: [0, -14, 0], material: {preset: 'clay', color: '#cfc9bd'}}), {id: 'slab', type: 'rounded-box', size: [0.9, 0.3, 0.9], radius: 0.05, position: [1.85, 0.15, 0.3], rotation: [0, 20, 0], material: {preset: 'clay', color: GOLD}}, {id: 'slab-2', type: 'rounded-box', size: [0.6, 0.3, 0.6], radius: 0.05, position: [1.85, 0.45, 0.3], rotation: [0, 44, 0], material: {preset: 'clay', color: '#cfc9bd'}}]));
ps('outline', 'Draw a gold outline around my camera.', [{type: 'outline', ids: ['camera'], strength: 5, thickness: 1.5}, 'vignette'], JSM + ' OutlinePass', S('studio-black', null, cam(slow(), {position: [0, 1.3, 5], target: [0, 1.15, 0]}), [floor('mirror', {dim: 0.72}), camera3d()]));
ps('pixel', 'Render the astronaut as pixel art.', [{type: 'pixel', size: 6}], JSM + ' RenderPixelatedPass', night('teal', cam(slow(), {position: [0, 1.4, 5.2], target: [0, 1.1, 0]}), [floor(), astro({motion: [{type: 'turntable', speed: 30}]})]), NASA);
ps('halftone', "Print the letters 'AI' in halftone dots.", [{type: 'halftone', radius: 5}], JSM + ' HalftonePass', night('red', cam(slow(), {position: [0, 1.4, 5.6], target: [0, 1.0, 0]}), [floor(), letters('AI', {font: 'bold', size: 1.5, depth: 0.4, position: [0, 0.85, 0]})]));
ps('smaa', 'Smooth the thin wire edges after the other passes.', ['vignette', {type: 'smaa'}], JSM + ' SMAAPass', S('blueprint', null, cam(slow(), {position: [0, 1.6, 6.4], target: [0, 1.2, 0]}), [floor('grid', {cell: 0.5, opacity: 0.45}), mono({material: {preset: 'wire', color: GOLDHI, opacity: 0.9}, pedestal: true, position: [-1.5, 1.4, 0], radius: 0.6}), wordmark({size: 0.3, text: 'CONNECT', font: 'light', position: [1.3, 1.3, 0], material: {preset: 'flat', color: '#dfeaf7'}})]));

// ---------------------------------------------------------------- looks (the same small set under each look)
const LOOK_SAY = {'connect-gold-night': 'Our default: black room, gold rim light.', 'connect-night-city': 'Put a night city behind it.', 'studio-black': 'Black product studio with one big softbox.', 'midnight-glass': 'Deep blue with frosted glass.', 'pale-studio': 'Bright neutral studio.', blueprint: 'Blueprint: dark blue and thin lines.', daylight: 'Outdoors in daylight.', 'on-video': 'No background: ready to sit on top of my video.'};
for (const [name, L] of Object.entries(LOOKS)) {
  const light = name === 'pale-studio' || name === 'daylight';
  const fl = name === 'blueprint' ? floor('grid') : light ? floor('matte', {material: {preset: 'clay', color: name === 'daylight' ? '#b9b4aa' : '#dcd8d0'}, size: 300}) : name === 'on-video' ? floor('shadow') : floor('mirror', name === 'connect-night-city' ? {size: 400, dim: 0.62} : {});
  add('look', name, name, L.about, LOOK_SAY[name], OURS, {duration: D, look: name, camera: cam([{type: 'orbit', from: -14, to: 14, dur: D}], {position: [0, 1.5, 7.2], target: [0, 1.2, 0]}), objects: [fl,
    wordmark({size: 0.34, font: 'serif-bold', tracking: 0.08, position: [0, 0.62, 0.4], material: name === 'blueprint' ? {preset: 'wire', color: GOLDHI, opacity: 0.9} : light ? {preset: 'black', color: INK} : 'gold'}),
    mono({radius: 0.44, position: [-1.9, 1.95, -0.3], pedestal: false, material: name === 'blueprint' ? {preset: 'wire', color: '#dfeaf7', opacity: 0.8} : 'gold', motion: [{type: 'turntable', speed: 24}]}),
    camera3d({position: [1.9, 1.9, -0.3], scale: 0.8, rotation: [0, -30, 0]}),
    {id: 'card', type: 'card', kicker: 'look', title: name, width: 2.5, height: 0.9, position: [0, 1.95, -0.6], material: light ? 'ivory' : 'frosted', color: light ? '#17181b' : undefined},
  ]}, {param: `"look": "${name}"`});
}

// ---------------------------------------------------------------- interaction (the clip uses a scripted pointer; on the page it is yours)
const trio = (turn = true) => [
  clapper({id: 'left', position: [-2.1, 1.05, 0], scale: 0.72, clapAt: null, rotation: [0, 16, 0], motion: turn ? [{type: 'float', amp: 0.04}] : []}),
  mono({id: 'mid', position: [0, 1.2, 0], radius: 0.5, motion: turn ? [{type: 'turntable', speed: 14}] : []}),
  camera3d({id: 'right', position: [2.1, 1.05, 0], scale: 0.85, rotation: [0, -28, 0], motion: turn ? [{type: 'float', amp: 0.04, phase: 2}] : []}),
];
const it = (id, prompt, script, spec, meta = {}) => add('interact', id, id, INTERACT[id], prompt, OURS, {interact: [id], pointerScript: script, ...spec}, {param: `"interact": ["${id}"]`, ...meta});
const icam = cam([], {position: [0, 1.5, 7], target: [0, 1.0, 0]});
it('orbit', 'Let visitors drag to look around the studio building.', [{t: 0, x: -0.2, y: 0.1, orbit: [0, 0]}, {t: 0.6, x: -0.2, y: 0.1, orbit: [0, 0], down: true}, {t: 2, x: 0.5, y: 0.25, orbit: [1.1, 0.2], down: true}, {t: 3.4, x: -0.4, y: 0, orbit: [-0.5, 0.05], down: true}, {t: 4, x: -0.4, y: 0, orbit: [-0.5, 0.05]}],
  S('connect-night-city', null, cam([], {position: [0, 1.7, 7.6], target: [0, 1.25, 0]}), [floor('mirror', {size: 400, dim: 0.62}), building({rotation: [0, -20, 0]})]));
it('parallax', 'Make the camera lean gently toward the pointer.', [{t: 0, x: -0.8, y: -0.5}, {t: 1.3, x: 0.8, y: -0.3}, {t: 2.6, x: 0.6, y: 0.6}, {t: 4, x: -0.7, y: 0.4}],
  S('midnight-glass', null, cam([], {position: [0, 1.4, 6.8], target: [0, 1.15, 0]}), [floor('mirror', {dim: 0.72}), wordmark({size: 0.27, position: [-0.9, 1.6, 1.0], font: 'light'}), mono({position: [-2.3, 0.75, -1.2], radius: 0.5}), astro({position: [3.1, 0, -2.6], fit: 2.2})], {parallaxAmount: 0.32}), NASA);
it('hover', 'Lift the object under the pointer a little.', [{t: 0, x: -0.75, y: 0.5}, {t: 0.8, x: -0.5, y: 0.02}, {t: 1.5, x: -0.5, y: 0.02}, {t: 2.1, x: 0, y: -0.04}, {t: 2.8, x: 0, y: -0.04}, {t: 3.4, x: 0.5, y: 0.02}, {t: 4, x: 0.5, y: 0.02}],
  S('studio-black', null, icam, [floor('mirror', {dim: 0.7}), ...trio()], {hoverScale: 1.16}));
it('zoom', 'Let visitors wheel or pinch to move closer to my microphone.', [{t: 0, x: 0, y: 0, zoom: 1}, {t: 1.6, x: 0, y: 0, zoom: 0.5}, {t: 2.6, x: 0, y: 0, zoom: 0.5}, {t: 4, x: 0, y: 0, zoom: 1.25}],
  S('pale-studio', null, cam([], {position: [0, 1.4, 6.6], target: [0, 1.25, 0]}), [pale(), floor('shadow', {id: 'shadow', opacity: 0.26}), mic()]));
it('click', 'Give an object a spin when it is clicked.', [{t: 0, x: -0.75, y: 0.5}, {t: 0.7, x: -0.5, y: 0.02}, {t: 0.8, x: -0.5, y: 0.02, click: 'left', down: true}, {t: 1.0, x: -0.5, y: 0.02}, {t: 2.0, x: 0.5, y: 0.02}, {t: 2.1, x: 0.5, y: 0.02, click: 'right', down: true}, {t: 2.3, x: 0.5, y: 0.02}, {t: 4, x: 0.1, y: 0.4}],
  night('teal', icam, [floor(), ...trio(false)]));
add('interact', 'scroll', 'scroll', INTERACT.scroll, 'Play the scene as the visitor scrolls down the page: the camera flies from the clapperboard to the camera.', OURS, {...S('blueprint', null, {position: [0, 1.5, 7], target: [0, 1.0, 0], fov: 34, motion: [{type: 'shots', list: [{at: 0.2, dur: 1.5, position: [-3.2, 1.3, 3.4], target: [-2.1, 1.05, 0]}, {at: 1.9, dur: 1.4, position: [3.2, 1.4, 3.4], target: [2.1, 1.05, 0]}]}]}, [floor('grid', {cell: 0.5, opacity: 0.4}), ...trio()]), interact: ['scroll'], page: {kicker: 'scroll', title: 'Scroll to fly the camera', scrollLength: 4}}, {param: '"interact": ["scroll"]'});

// ---------------------------------------------------------------- physics (Rapier, baked)
const RAP = 'Rapier (@dimforge/rapier3d-compat)';
add('physics', 'letters-drop', 'Letters drop', 'every letter is a rigid body falling onto the floor', "Drop the letters of 'CONNECT' from above and let them land and settle.", RAP, {...night('gold', cam([{type: 'dolly', from: 1.12, to: 0.95, dur: 5}], {position: [0, 1.6, 9], target: [0, 0.75, 0]}), [floor(),
  {id: 'word', type: 'text3d', text: 'CONNECT', font: 'bold', size: 0.95, depth: 0.42, tracking: 0.1, split: true, position: [0, 2.9, 0], material: 'gold', bodyEach: true, each: 0.24, bounce: 0.12, friction: 1, angularDamping: 6},
]), duration: 5}, {peak: 3.6});
add('physics', 'dominoes', 'Dominoes', 'a push on the first one travels down the row', 'A row of course books standing like dominoes: tip the first, watch them all go.', RAP, {...S('pale-studio', null, cam([{type: 'truck', by: [3.2, 0, 0], dur: 5}], {position: [-1.6, 1.5, 6.6], target: [-1.6, 0.6, 0]}), [pale(), floor('shadow', {id: 'shadow', opacity: 0.25}),
  ...Array.from({length: 9}, (_, i) => ({id: `d${i}`, type: 'book', width: 0.72, thickness: 0.14, title: i % 3 === 0 ? 'VVC' : 'AI', position: [-3 + i * 0.72, 0.512, 0], rotation: [0, 90, 0], material: i % 3 === 0 ? {preset: 'paint', color: TEAL} : i % 3 === 1 ? {preset: 'black', color: INK} : {preset: 'ivory'}, color: i % 3 === 2 ? INK : undefined, body: 'dynamic', bounce: 0.05, friction: 0.6, ...(i === 0 ? {spin: [0, 0, -4.5], at: 0.5} : {})})),
]), duration: 5}, {peak: 2.6});
add('physics', 'tumble', 'Stack and ball', 'a chrome ball knocks a stack over', "Stack the letters 'JAY' as blocks three high, then roll a chrome ball into them.", RAP, {...night('blue', cam([{type: 'orbit', from: -10, to: 16, dur: 5}], {position: [0, 1.7, 7.4], target: [0, 0.9, 0]}), [floor(),
  ...[0, 1, 2].flatMap((r) => ['J', 'A', 'Y'].map((ch, c) => ({id: `b${r}${c}`, type: 'text3d', text: ch, font: 'bold', size: 0.62, depth: 0.5, position: [0.6 + (c - 1) * 0.66, 0.31 + r * 0.455, 0], material: (r + c) % 2 ? 'ivory' : 'gold', body: 'dynamic', bounce: 0.15}))),
  {id: 'ball', type: 'sphere', radius: 0.36, position: [-3.6, 0.5, 0], material: 'chrome', body: 'dynamic', collider: 'ball', at: 0.7, push: [9, 0.6, 0], density: 6},
]), duration: 5}, {peak: 0.5});

// ---------------------------------------------------------------- lanes
add('lane', 'r3f', 'React Three Fiber lane', 'the same spec inside <Canvas> / Remotion <ThreeCanvas> through our R3F adapter', 'I already use React Three Fiber: mount this spec inside my own canvas next to my drei components.', '@react-three/fiber + @remotion/three', night('teal', cam([{type: 'orbit', from: -16, to: 16, dur: D}]), [
  mono({position: [0, 1.25, 0], motion: [{type: 'turntable', speed: 26}]}),
  {id: 'tag', type: 'label', text: 'REACT THREE FIBER LANE', size: 0.15, tracking: 0.35, weight: 400, color: GOLDHI, position: [0, 0.08, 0.9]},
  {id: 'base', type: 'cylinder', radius: 1.1, height: 0.06, position: [0, -0.1, 0], material: 'black'},
]), {lane: 'r3f', param: '<ConnectScene spec={spec} time={t} />'});
// the on-video lane shows the first cut of examples/on-my-video (the catalog page plays it over our own footage)
const hello = JSON.parse(fs.readFileSync(path.join(KIT, 'examples', 'on-my-video', 'cuts', '1-hello.json'), 'utf8'));
add('lane', 'on-video', '3D on your own video', 'transparent 3D over your footage; with a person matte the 3D goes BEHIND you, and keep-out boxes guard your face and your mic arm', "On my talking video: when I say our name, let 'CONNECT AI LAB' rise from behind my shoulders and settle above my head, then my name beside me. Never cover my face.", OURS + ' + Remotion OffthreadVideo', {duration: hello.duration, look: 'on-video', keepOut: hello.keepOut, camera: hello.camera, post: hello.post, objects: hello.objects}, {lane: 'on-video', peak: 3.3, param: 'connect-ai-three on-video talk.mp4 --faces face.json --matte work/matte'});

// 0.3: a soft contact shadow under a prop on a dark mirror floor (added last so the older item numbers stay)
add(O, 'contact', 'Contact shadow', 'a soft dark pool under an object so it sits on the floor instead of floating', 'My cinema camera on a dark pedestal, with a soft shadow where it touches the floor, slow turn.', OURS, S('studio-black', null, cam(slow(-16, 14), {position: [0, 1.5, 6.2], target: [0, 0.95, 0]}), [floor('mirror', {dim: 0.85, dimFar: 0.3}),
  {id: 'stage', type: 'cylinder', radius: 1.0, height: 0.5, position: [0, 0.25, 0], material: {preset: 'black', color: '#0A0A0A', roughness: 0.65}},
  {id: 'stage-shadow', type: 'contact', radius: 1.35, opacity: 0.8, position: [0, 0.005, 0]},
  {id: 'prop-shadow', type: 'contact', radius: 0.55, opacity: 0.7, position: [0, 0.505, 0]},
  camera3d({position: [0, 0.5, 0], scale: 1.0}),
]));

// write
const dir = path.join(KIT, 'catalog');
for (const g of fs.readdirSync(dir, {withFileTypes: true})) if (g.isDirectory()) fs.rmSync(path.join(dir, g.name), {recursive: true, force: true});
for (const it2 of items) writeJson(path.join(dir, it2.group, `${String(it2.order).padStart(3, '0')}_${it2.id}.json`), it2);
const idx = buildIndex();
console.log(`catalog: ${idx.count} items`, idx.groups.map((g) => `${g.id} ${g.count}`).join(' · '));
// which looks the examples use (they should be spread, not all one tone)
const tally = {};
for (const it3 of idx.items) tally[it3.spec.look || 'custom light'] = (tally[it3.spec.look || 'custom light'] || 0) + 1;
console.log('looks:', Object.entries(tally).map(([k, v]) => `${k} ${v}`).join(' · '));
