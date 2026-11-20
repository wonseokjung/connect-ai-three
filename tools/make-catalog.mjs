// Writes the catalog: one small complete spec per item under catalog/<group>/<id>.json, then catalog/index.json.
// Every item is rendered as a clip for the catalog page, so every item is a scene that really runs.
import fs from 'node:fs';
import path from 'node:path';
import {KIT, writeJson} from '../lib/paths.mjs';
import {buildIndex} from '../lib/catalog.mjs';
import {REG, LOOKS, MOTIONS, CAMERA_MOTIONS, LIGHTS, LIGHT_MOTIONS, INTERACT} from '../src/runtime/node-names.mjs';

const CORE = 'three.js core', JSM = 'three.js examples/jsm', OURS = 'CONNECT AI LAB';
const D = 4;
const items = [];
const floor = (kind = 'mirror', extra = {}) => ({id: 'floor', type: 'floor', kind, ...extra});
const cam = (motion = [{type: 'orbit', from: -12, to: 12, dur: D}], extra = {}) => ({position: [0, 1.4, 5.2], target: [0, 1.0, 0], fov: 34, motion, ...extra});
const WIDE = {position: [0, 1.35, 6.5], target: [0, 0.95, 0]};
const base = (objects, extra = {}) => ({duration: D, look: 'connect-gold-night', camera: cam(), objects: [floor(), ...objects], ...extra});
let order = 0;
const add = (group, id, title, about, prompt, source, spec, extra = {}) => items.push({id, group, title, about, prompt, source, license: source.includes('Rapier') ? 'Apache-2.0' : 'MIT', order: order++, ...extra, spec: {name: id, ...spec}});

// ---------------------------------------------------------------- objects
const O = 'object';
add(O, 'primitives', 'Primitives', 'box, sphere, cylinder, cone, capsule, torus', 'Six basic shapes in a row, each a different material, popping in one after another.', CORE, base([
  {id: 'row', type: 'group', position: [0, 0.6, 0], motion: [{type: 'stagger', at: 0.2, each: 0.14}], children: [
    {type: 'box', size: [0.8, 0.8, 0.8], position: [-3.1, 0, 0], material: 'gold', motion: [{type: 'turntable', speed: 30}]},
    {type: 'sphere', radius: 0.5, position: [-1.86, 0, 0], material: 'chrome'},
    {type: 'cylinder', radius: 0.4, height: 0.95, position: [-0.62, 0, 0], material: 'black'},
    {type: 'cone', radius: 0.48, height: 1, position: [0.62, 0, 0], material: 'ivory'},
    {type: 'capsule', radius: 0.3, height: 0.5, position: [1.86, 0, 0], material: 'steel'},
    {type: 'torus', radius: 0.4, tube: 0.14, position: [3.1, 0, 0], material: 'gold-brushed', motion: [{type: 'turntable', speed: -40}]},
  ]},
], {camera: cam([{type: 'truck', by: [0.8, 0, 0], dur: D}], {position: [-0.4, 1.3, 9.2], target: [-0.4, 0.7, 0]})}));
add(O, 'flat-shapes', 'Flat shapes', 'plane, disc and ring: plates, targets, thin rules', 'A gold ring and an ivory disc lying on the floor like a target, a tall dark plate standing behind, a gem floating above.', CORE, base([
  {id: 'plate', type: 'plane', width: 2.2, height: 2.6, position: [0, 1.3, -1.2], material: {preset: 'black', side: 2}},
  {id: 'disc', type: 'disc', radius: 0.7, position: [0, 0.012, 0.4], rotation: [-90, 0, 0], material: {preset: 'ivory', side: 2}, shadow: false, motion: [{type: 'pop', at: 0.2}]},
  {id: 'target', type: 'ring', inner: 1.0, radius: 1.12, position: [0, 0.014, 0.4], rotation: [-90, 0, 0], material: {preset: 'flat', color: '#D6892A', side: 2}, shadow: false, motion: [{type: 'pop', at: 0.5}]},
  {id: 'gem', type: 'gem', radius: 0.42, position: [0, 1.05, 0.4], material: 'gold', motion: [{type: 'turntable', speed: 30}, {type: 'float', amp: 0.07}]},
]));
add(O, 'rounded-box', 'Rounded box', 'box with soft edges that catch the light', 'Three rounded blocks stacked like a small monument, gold on black, turning slowly.', JSM + ' RoundedBoxGeometry', base([
  {id: 'stack', type: 'group', position: [0, 0, 0], motion: [{type: 'turntable', speed: 18}], children: [
    {type: 'rounded-box', size: [1.7, 0.5, 1.7], radius: 0.07, position: [0, 0.25, 0], material: 'black'},
    {type: 'rounded-box', size: [1.2, 0.5, 1.2], radius: 0.07, position: [0, 0.75, 0], rotation: [0, 18, 0], material: 'ivory'},
    {type: 'rounded-box', size: [0.75, 0.75, 0.75], radius: 0.1, position: [0, 1.38, 0], rotation: [0, 40, 0], material: 'gold'},
  ]},
]));
add(O, 'knot', 'Torus knot', 'one endless knot: the classic material test shape', 'A polished gold knot floating over a black mirror floor, slow turn.', CORE, base([{id: 'knot', type: 'knot', position: [0, 1.2, 0], material: 'gold', motion: [{type: 'turntable', speed: 26}, {type: 'float'}]}]));
add(O, 'gem', 'Gem', 'faceted gem: icosa, octa or dodeca cut', 'A glass gem and two small gold gems, turning, light passing through.', CORE, base([
  {id: 'big', type: 'gem', radius: 0.8, position: [0, 1.15, 0], material: 'glass', motion: [{type: 'turntable', speed: 22}, {type: 'float', amp: 0.06}]},
  {id: 'left', type: 'gem', cut: 'octa', radius: 0.36, position: [-1.7, 0.75, 0.3], material: 'gold', motion: [{type: 'turntable', speed: -34}, {type: 'float', phase: 1.4}]},
  {id: 'right', type: 'gem', cut: 'dodeca', radius: 0.36, position: [1.7, 0.85, -0.2], material: 'gold-brushed', motion: [{type: 'turntable', speed: 30}, {type: 'float', phase: 2.6}]},
  {id: 'behind', type: 'rings', radius: 1.25, position: [0, 1.15, -1.4], core: false, count: 3},
]));
add(O, 'text3d', '3D text', 'extruded letters with a bevel', "The words 'CONNECT AI LAB' as gold 3D letters, a slow sway, reflected on the floor.", JSM + ' TextGeometry', base([
  {id: 'title', type: 'text3d', text: 'CONNECT AI LAB', size: 0.56, position: [0, 0.95, 0], material: 'gold', motion: [{type: 'sway', deg: 9, axis: 'y', period: 8}, {type: 'rise', at: 0.1, from: -0.4}]},
], {camera: cam(undefined, WIDE)}));
add(O, 'text3d-letters', '3D text, letter by letter', 'split:true makes each letter its own object', "The name 'AI MENTOR JAY' arriving one gold letter at a time.", JSM + ' TextGeometry', base([
  {id: 'title', type: 'text3d', text: 'AI MENTOR JAY', size: 0.58, split: true, position: [0, 0.95, 0], material: 'gold', motion: [{type: 'stagger', at: 0.25, each: 0.11, dur: 0.7}]},
], {camera: cam(undefined, WIDE)}));
add(O, 'label', 'Text label', 'thin sans text that is always crisp', "A small wide-spaced line 'VISUAL VIBE CODING' with a thin ivory headline under it.", OURS + ' canvas label', base([
  {id: 'kicker', type: 'label', text: 'VISUAL VIBE CODING', size: 0.2, tracking: 0.4, weight: 400, color: '#D6892A', position: [0, 1.7, 0], motion: [{type: 'fade', at: 0.2}]},
  {id: 'head', type: 'label', text: 'Say it. See it in 3D.', size: 0.62, weight: 200, position: [0, 1.05, 0], motion: [{type: 'rise', at: 0.5, from: -0.25}]},
  {id: 'rule', type: 'plane', width: 0.9, height: 0.012, position: [0, 0.48, 0], material: {preset: 'flat', color: '#D6892A'}, shadow: false, motion: [{type: 'fade', at: 1.0}]},
], {camera: cam([{type: 'dolly', from: 1.1, to: 0.94, dur: D}], WIDE)}));
add(O, 'card', 'Glass card', 'frosted panel with a kicker, a title and a gold rule', "Three frosted glass cards: 'Say it', 'One spec', 'Web + video', rising in turn.", OURS + ' on RoundedBoxGeometry', {duration: D, look: 'midnight-glass', camera: cam([{type: 'orbit', from: -14, to: 10, dur: D}], {position: [0, 1.5, 7.6], target: [0, 1.25, 0]}), objects: [floor('mirror', {dim: 0.72}),
  ...['Say it', 'One spec', 'Web + video'].map((t, i) => ({id: `card-${i + 1}`, type: 'card', kicker: `0${i + 1}`, title: t, width: 2.15, height: 1.9, position: [(i - 1) * 2.4, 1.3, -Math.abs(i - 1) * 0.45], rotation: [0, (1 - i) * 14, 0], motion: [{type: 'rise', at: 0.2 + i * 0.3}, {type: 'float', amp: 0.035, phase: i * 1.3}]})),
]});
add(O, 'image', 'Image plane', 'your own picture on a framed plane', 'My screenshot on a tilted black-framed panel that slides in from the right.', CORE, base([
  {id: 'pic', type: 'image', src: 'kit:sample.jpg', height: 1.9, position: [0, 1.25, 0], rotation: [0, -16, 0], motion: [{type: 'slide', at: 0.2, from: [2.5, 0, -1]}, {type: 'sway', deg: 3, axis: 'y', period: 6}]},
]));
add(O, 'floor-mirror', 'Mirror floor', 'black floor that reflects the scene', 'A chrome ball and a gold ring on a black mirror floor.', JSM + ' Reflector', base([
  {id: 'ball', type: 'sphere', radius: 0.7, position: [-0.9, 0.7, 0], material: 'chrome'},
  {id: 'ring', type: 'torus', radius: 0.62, tube: 0.13, position: [1.15, 0.78, 0.3], rotation: [0, 30, 0], material: 'gold', motion: [{type: 'turntable', speed: 40}]},
]));
add(O, 'floor-grid', 'Grid floor', 'thin lines fading into the distance', 'A wireframe gem above an endless thin grid, blueprint style.', OURS + ' shader', {duration: D, look: 'blueprint', camera: cam([{type: 'orbit', from: -20, to: 20, dur: D}], {position: [0, 1.8, 6.5]}), objects: [floor('grid', {cell: 0.5, opacity: 0.5}),
  {id: 'gem', type: 'gem', radius: 0.9, detail: 1, position: [0, 1.2, 0], material: {preset: 'wire', color: '#F2B45A', opacity: 0.9}, motion: [{type: 'turntable', speed: 20}]},
  {id: 'core', type: 'gem', radius: 0.4, position: [0, 1.2, 0], material: 'ivory', motion: [{type: 'turntable', speed: -30}]},
]});
add(O, 'floor-shadow', 'Shadow catcher', 'an invisible floor that only shows the shadow', 'A gold knot on a bright studio floor with a soft shadow under it.', CORE + ' ShadowMaterial', {duration: D, look: 'pale-studio', camera: cam(), objects: [floor('shadow', {opacity: 0.32}),
  {id: 'knot', type: 'knot', radius: 0.5, tube: 0.16, position: [0, 1.0, 0], material: 'gold', motion: [{type: 'turntable', speed: 26}, {type: 'float', amp: 0.1}]},
]});
add(O, 'line', 'Fat line', 'lines that keep their width and can draw themselves', 'Three thin gold and ivory curves drawing themselves in the air.', JSM + ' Line2', base([
  {id: 'helix', type: 'line', curve: 'helix', radius: 0.9, height: 2, turns: 3, width: 4, position: [-2.2, 1.2, 0], motion: [{type: 'draw', at: 0.1, dur: 1.8}, {type: 'turntable', speed: 30}]},
  {id: 'wave', type: 'line', curve: 'wave', length: 3.2, amp: 0.5, width: 4, color: '#EBE2D2', position: [0.4, 1.2, 0], motion: [{type: 'draw', at: 0.6, dur: 1.6}]},
  {id: 'orbit', type: 'line', curve: 'orbit', radius: 0.9, width: 3, position: [2.6, 1.2, 0], rotation: [24, 0, 12], motion: [{type: 'draw', at: 1.1, dur: 1.6}, {type: 'turntable', speed: -24}]},
], {camera: cam(undefined, {position: [0.2, 1.4, 7], target: [0.2, 1.1, 0]})}));
add(O, 'ribbon', 'Ribbon', 'a solid tube along a curve that draws itself', 'A gold ribbon sweeping around in one stroke, then turning slowly.', CORE + ' TubeGeometry', base([
  {id: 'ribbon', type: 'ribbon', curve: 'swoosh', radius: 1.7, thickness: 0.05, position: [0, 1.25, 0], material: 'gold', motion: [{type: 'draw', at: 0.15, dur: 1.9, ease: 'out'}, {type: 'turntable', speed: 18}]},
  {id: 'core', type: 'sphere', radius: 0.34, position: [0, 1.2, 0], material: 'chrome'},
]));
add(O, 'rings', 'Gyro rings', 'metal rings turning around a glowing core', 'A gyroscope of gold and steel rings around a small glowing core.', OURS, base([{id: 'rings', type: 'rings', radius: 1.15, position: [0, 1.3, 0], motion: [{type: 'pop', at: 0.1}]}]));
add(O, 'instances-wave', 'Instances: wave grid', 'hundreds of blocks in one draw call, moving as a wave', 'A field of small brushed-gold blocks rippling like water.', CORE + ' InstancedMesh', {duration: D, look: 'connect-gold-night', camera: cam([{type: 'orbit', from: -18, to: 18, dur: D}], {position: [0, 3.2, 6.6], target: [0, 0.2, 0]}), objects: [
  {id: 'grid', type: 'instances', layout: 'wave', cols: 26, rows: 26, size: 0.2, spacing: 0.27, position: [0, 0.3, 0], material: 'gold-brushed', enter: {at: 0, each: 0, dur: 0.9, byDistance: true}},
]});
add(O, 'instances-sphere', 'Instances: sphere', 'copies laid out on a sphere, ring, spiral or scatter', 'Small gold gems arranged on a sphere, turning as one.', CORE + ' InstancedMesh', base([
  {id: 'ball', type: 'instances', layout: 'sphere', shape: 'gem', count: 260, size: 0.16, radius: 1.15, tumble: true, position: [0, 1.35, 0], material: 'gold', motion: [{type: 'turntable', speed: 18}]},
]));
add(O, 'instances-spiral', 'Instances: spiral', 'the same mesh along a spiral', 'Gold coins climbing a spiral staircase of themselves.', CORE + ' InstancedMesh', base([
  {id: 'coins', type: 'instances', layout: 'spiral', shape: 'coin', count: 140, size: 0.34, radius: 1.5, height: 2.1, position: [0, 1.2, 0], material: 'gold', enter: {at: 0.1, each: 0.012, dur: 0.5}, motion: [{type: 'turntable', speed: 24}]},
]));
add(O, 'globe', 'Dot globe', 'a globe of dots with arcs that draw themselves', 'A dark globe made of dots, gold arcs connecting places one by one.', OURS + ' on Line2', base([{id: 'globe', type: 'globe', radius: 1.2, position: [0, 1.35, 0], motion: [{type: 'turntable', speed: 12}]}]));
add(O, 'bars', '3D bars', 'a bar chart from your own numbers', 'My four numbers as 3D bars growing one by one, the biggest in gold.', OURS + ' on RoundedBoxGeometry', base([
  {id: 'bars', type: 'bars', values: [2, 3, 5, 8], labels: ['A', 'B', 'C', 'D'], height: 1.8, position: [0, 0.3, 0]},
], {camera: cam([{type: 'orbit', from: -22, to: 8, dur: D}], {position: [0, 1.7, 7.2], target: [0, 1.1, 0]})}));
add(O, 'city', 'Night city', 'a procedural skyline with lit windows, one draw call', 'A night skyline of warm lit windows, the camera sliding slowly sideways.', OURS + ' shader on InstancedMesh', {duration: D, look: 'connect-gold-night', background: {type: 'gradient', top: '#03050a', mid: '#1f2c44', bottom: '#020203'}, camera: {position: [-8, 6, 20], target: [0, 9, -120], fov: 30, motion: [{type: 'truck', by: [16, 0, 0], dur: D}]}, post: [{type: 'bloom', strength: 0.5, radius: 0.7, threshold: 0.7}, 'vignette', 'grain'], objects: [
  floor('mirror', {size: 400, dim: 0.5}), {id: 'city', type: 'city'},
]});
add(O, 'backglow', 'Back glow', 'a soft pool of light on the wall behind the subject', 'A soft warm pool of light on the wall behind the chrome ball, like a night studio set.', OURS + ' shader', {duration: D, look: 'studio-black', backdrop: [], camera: cam(), objects: [floor(),
  {id: 'glow', type: 'backglow', color: '#D6892A', intensity: 0.5, width: 16, height: 9, y: 1.8, z: -6, motion: [{type: 'fade', at: 0.3, dur: 1.4}]},
  {id: 'ball', type: 'sphere', radius: 0.8, position: [0, 0.8, 0], material: 'chrome'},
]});
add(O, 'terrain', 'Terrain', 'ridged ground from our own noise, optional wire', 'Dark mountains with a faint gold wire over them, the camera rising.', OURS + ' noise', {duration: D, look: 'connect-gold-night', camera: {position: [0, 1.6, 7], target: [0, 0.7, 0], fov: 38, motion: [{type: 'crane', by: 1.6, dur: D}, {type: 'orbit', from: -10, to: 10, dur: D}]}, objects: [
  {id: 'land', type: 'terrain', wire: true, size: 16, amp: 2.2, position: [0, -0.3, -1]},
  {id: 'gem', type: 'gem', radius: 0.4, position: [0, 1.0, 0], material: 'glow', motion: [{type: 'float'}, {type: 'turntable', speed: 30}]},
]});
add(O, 'waves', 'Rolling surface', 'a dark moving surface with gold crests', 'A dark sea rolling slowly, gold light on the crests.', OURS + ' shader', {duration: D, look: 'connect-gold-night', camera: {position: [0, 1.5, 7], target: [0, 0.2, 0], fov: 38, motion: [{type: 'dolly', from: 1.1, to: 0.9, dur: D}]}, objects: [
  {id: 'sea', type: 'waves', amp: 0.4, position: [0, 0, -3]},
  {id: 'moon', type: 'sphere', radius: 0.5, position: [0, 1.7, -2], material: 'chrome', motion: [{type: 'float', amp: 0.08}]},
]});
add(O, 'group', 'Group', 'several objects that move, stagger and explode together', 'A small machine of five parts that opens up and closes again.', CORE, base([
  {id: 'machine', type: 'group', position: [0, 1.25, 0], motion: [{type: 'turntable', speed: 14}, {type: 'explode', at: 0.6, dur: 1, hold: 0.9, amount: 0.5}], children: [
    {type: 'gem', radius: 0.34, position: [0, 0.001, 0], material: 'glow'},
    {type: 'torus', radius: 0.62, tube: 0.07, position: [0, 0.32, 0], rotation: [90, 0, 0], material: 'gold'},
    {type: 'torus', radius: 0.62, tube: 0.07, position: [0, -0.32, 0], rotation: [90, 0, 0], material: 'gold'},
    {type: 'rounded-box', size: [0.34, 0.9, 0.34], position: [0.78, 0, 0], material: 'steel'},
    {type: 'rounded-box', size: [0.34, 0.9, 0.34], position: [-0.78, 0, 0], material: 'steel'},
    {type: 'rounded-box', size: [0.34, 0.9, 0.34], position: [0, 0, 0.78], material: 'black'},
    {type: 'rounded-box', size: [0.34, 0.9, 0.34], position: [0, 0, -0.78], material: 'black'},
  ]},
]));
add(O, 'gltf', 'glTF model', 'your .glb or .gltf: fitted, grounded, animated by time', 'Load my astronaut.glb, stand it on the mirror floor and turn it slowly under the gold rim light.', JSM + ' GLTFLoader', base([
  {id: 'model', type: 'gltf', src: 'kit:astronaut.glb', fit: 2.3, position: [0, 0, 0], motion: [{type: 'turntable', speed: 22}]},
]), {assets: 'astronaut.glb: NASA 3D Resources (public domain)'});
add(O, 'svg', 'SVG logo in 3D', 'your .svg extruded into a solid object', 'Extrude my logo.svg into thick gold and let it turn like a medal.', JSM + ' SVGLoader', base([
  {id: 'mark', type: 'svg', src: 'kit:mark.svg', fit: 1.9, depth: 22, bevel: 2, position: [0, 1.2, 0], material: 'gold', motion: [{type: 'pop', at: 0.15}, {type: 'sway', deg: 28, axis: 'y', period: 5}]},
]));
add(O, 'sky', 'Sky', 'physical sky with a sun', 'Ivory blocks on a matte floor outdoors, low sun, long shadows.', JSM + ' Sky', {duration: D, look: 'daylight', camera: cam([{type: 'orbit', from: -14, to: 14, dur: D}], {position: [0, 1.5, 7]}), objects: [
  floor('matte', {material: {preset: 'clay', color: '#b9b4aa'}, size: 300}),
  {id: 'a', type: 'rounded-box', size: [0.9, 1.9, 0.9], position: [-1.2, 0.95, 0], material: 'ivory'},
  {id: 'b', type: 'rounded-box', size: [0.9, 1.2, 0.9], position: [0, 0.6, 0.5], rotation: [0, 20, 0], material: 'gold'},
  {id: 'c', type: 'sphere', radius: 0.55, position: [1.3, 0.55, 0], material: 'clay'},
]});
add(O, 'blob', 'Liquid metal blob', 'metaballs that merge and split', 'A blob of liquid chrome slowly splitting and merging.', JSM + ' MarchingCubes', base([{id: 'blob', type: 'blob', radius: 1.5, position: [0, 1.35, 0], material: 'chrome', speed: 1.4}]));
add(O, 'teapot', 'Teapot', 'the Utah teapot, the hello-world of 3D', 'The classic teapot in brushed gold on a black mirror.', JSM + ' TeapotGeometry', base([{id: 'pot', type: 'teapot', size: 0.62, position: [0, 0.62, 0], material: 'gold-brushed', motion: [{type: 'turntable', speed: 24}]}]));
add(O, 'parametric', 'Parametric surface', 'mobius band or klein bottle', 'A mobius band in polished gold, turning.', JSM + ' ParametricGeometry', base([{id: 'band', type: 'parametric', surface: 'mobius', radius: 1.05, position: [0, 1.25, 0], material: 'gold', motion: [{type: 'turntable', speed: 26}, {type: 'sway', deg: 12, axis: 'x', period: 5}]}]));

// ---------------------------------------------------------------- materials
const MAT_SAY = {gold: 'polished brand gold', 'gold-brushed': 'brushed gold with soft highlights', chrome: 'mirror chrome', steel: 'dark brushed steel', black: 'piano black', ivory: 'matte ivory', clay: 'matte clay with no gloss', plastic: 'soft glossy plastic', paint: 'deep red car paint with a clear coat', glass: 'clear glass', frosted: 'frosted glass', smoked: 'dark smoked glass', velvet: 'midnight velvet', iridescent: 'thin-film iridescent metal', glow: 'self-lit gold', wire: 'ivory wireframe', flat: 'flat unlit ivory', toon: 'three-step cel shading', rim: 'a dark body with a gold rim glow', gradient: 'a flowing gold-to-blue gradient'};
for (const name of Object.keys(MAT_SAY)) {
  const m = REG.materials.get(name);
  const glassy = ['glass', 'frosted', 'smoked'].includes(name);
  add('material', name, name, m.meta.about, `Make the knot ${MAT_SAY[name]}.`, m.meta.source.includes('CONNECT') ? OURS + ' shader' : CORE, base([
    {id: 'knot', type: 'knot', radius: 0.52, tube: 0.18, position: [-0.95, 1.15, 0], material: name, motion: [{type: 'turntable', speed: 28}]},
    {id: 'ball', type: 'sphere', radius: 0.5, position: [0.95, 0.5, 0.6], material: name},
    {id: 'block', type: 'rounded-box', size: [0.7, 0.7, 0.7], radius: 0.1, position: [1.75, 1.45, -0.6], rotation: [20, 30, 10], material: name, motion: [{type: 'turntable', speed: -20}]},
    ...(glassy ? [{id: 'behind', type: 'rings', radius: 1.3, core: false, count: 3, position: [0, 1.2, -1.6]}] : []),
  ]), {param: `"material": "${name}"`});
}

// ---------------------------------------------------------------- motion
const M = 'motion';
const block = (motion, extra = {}) => ({id: 'subject', type: 'rounded-box', size: [1, 1, 1], radius: 0.12, position: [0, 0.9, 0], rotation: [0, 28, 0], material: 'gold', motion, ...extra});
const mo = (id, prompt, objects, extra = {}) => add(M, id, id, MOTIONS[id].about, prompt, OURS, base(objects, {camera: cam([], {position: [0, 1.35, 4.7]}), ...extra}), {param: `{"type": "${id}"}  ${MOTIONS[id].params}`});
mo('turntable', 'Turn the block slowly, forever.', [block([{type: 'turntable', speed: 45}])]);
mo('spin', 'Give the block two quick spins, then let it rest.', [block([{type: 'spin', turns: 2, at: 0.5, dur: 1.6}])]);
mo('float', 'Let the gem hover up and down gently.', [{id: 'subject', type: 'gem', radius: 0.7, position: [0, 1.2, 0], material: 'gold', motion: [{type: 'float', amp: 0.18, period: 2.4}]}]);
mo('sway', 'Tilt the title left and right like a sign in the wind.', [{id: 'subject', type: 'text3d', text: 'SWAY', size: 0.8, position: [0, 1.1, 0], material: 'gold', motion: [{type: 'sway', deg: 14, axis: 'y', period: 3}]}]);
mo('pop', 'Make the block pop in with a small overshoot.', [block([{type: 'pop', at: 0.6, dur: 0.8}])]);
mo('fade', 'Fade the label in, hold, and fade it out.', [{id: 'subject', type: 'label', text: 'Fade in, fade out', size: 0.6, weight: 200, position: [0, 1.2, 0], motion: [{type: 'fade', at: 0.3, dur: 0.9}, {type: 'fade', at: 2.6, dur: 0.9, from: 1, to: 0}]}]);
mo('rise', 'Bring the block up from below and let it settle.', [block([{type: 'rise', at: 0.5, dur: 1.1, from: -1.2}])]);
mo('drop', 'Drop the block from above with a bounce.', [block([{type: 'drop', at: 0.5, dur: 1.1, from: 3}])]);
mo('slide', 'Slide the card in from the left.', [{id: 'subject', type: 'card', kicker: 'slide', title: 'From the left', position: [0, 1.2, 0], width: 2.2, height: 1.3, motion: [{type: 'slide', at: 0.4, dur: 1.1, from: [-5, 0, 0]}]}]);
mo('move', 'Move the ball from the left side to the right side.', [{id: 'subject', type: 'sphere', radius: 0.55, position: [-1.5, 0.55, 0], material: 'chrome', motion: [{type: 'move', at: 0.5, dur: 2.4, by: [3, 0, 0]}]}]);
mo('scale', 'Grow the gem from small to full size.', [{id: 'subject', type: 'gem', radius: 0.9, position: [0, 1.2, 0], material: 'gold', motion: [{type: 'scale', at: 0.4, dur: 2.2, from: 0.3, to: 1}, {type: 'turntable', speed: 20}]}]);
mo('rotate', 'Tip the block over by ninety degrees, once.', [block([{type: 'rotate', at: 0.8, dur: 1.4, by: [0, 0, -90]}], {rotation: [0, 0, 0]})]);
mo('pulse', 'Let the glowing core breathe.', [{id: 'subject', type: 'sphere', radius: 0.7, position: [0, 1.2, 0], material: 'glow', motion: [{type: 'pulse', amp: 0.12, period: 1.3}]}]);
mo('orbit', 'A small moon circling the big ball.', [{id: 'planet', type: 'sphere', radius: 0.75, position: [0, 1.2, 0], material: 'black'}, {id: 'subject', type: 'sphere', radius: 0.22, position: [0, 1.2, 0], material: 'gold', motion: [{type: 'orbit', radius: 1.6, speed: 90, center: [0, 0, 0], tilt: 12}]}]);
mo('path', 'Send the gem along the drawn path.', [{id: 'track', type: 'line', points: [[-1.9, 0.5, 0.5], [-0.8, 1.7, -0.6], [0.5, 0.7, 0.8], [1.9, 1.5, -0.2]], width: 2, color: '#EBE2D2', opacity: 0.5}, {id: 'subject', type: 'gem', radius: 0.3, material: 'gold', motion: [{type: 'path', points: [[-1.9, 0.5, 0.5], [-0.8, 1.7, -0.6], [0.5, 0.7, 0.8], [1.9, 1.5, -0.2]], at: 0.3, dur: 3.2}]}]);
mo('explode', 'Open the object up into its parts, then close it.', [{id: 'subject', type: 'group', position: [0, 1.25, 0], rotation: [0, 30, 0], motion: [{type: 'explode', at: 0.5, dur: 1, hold: 0.8, amount: 1.1}], children: [
  {type: 'rounded-box', size: [0.6, 0.6, 0.6], position: [0.31, 0.31, 0.31], material: 'gold'}, {type: 'rounded-box', size: [0.6, 0.6, 0.6], position: [-0.31, 0.31, 0.31], material: 'black'},
  {type: 'rounded-box', size: [0.6, 0.6, 0.6], position: [0.31, -0.31, 0.31], material: 'black'}, {type: 'rounded-box', size: [0.6, 0.6, 0.6], position: [-0.31, -0.31, 0.31], material: 'gold'},
  {type: 'rounded-box', size: [0.6, 0.6, 0.6], position: [0.31, 0.31, -0.31], material: 'steel'}, {type: 'rounded-box', size: [0.6, 0.6, 0.6], position: [-0.31, 0.31, -0.31], material: 'gold'},
  {type: 'rounded-box', size: [0.6, 0.6, 0.6], position: [0.31, -0.31, -0.31], material: 'gold'}, {type: 'rounded-box', size: [0.6, 0.6, 0.6], position: [-0.31, -0.31, -0.31], material: 'steel'},
]}]);
mo('stagger', 'Let the letters arrive one after another.', [{id: 'subject', type: 'text3d', text: 'ONE BY ONE', size: 0.6, split: true, position: [0, 1.05, 0], material: 'gold', motion: [{type: 'stagger', at: 0.3, each: 0.16, dur: 0.7}]}], {camera: cam([], WIDE)});
mo('draw', 'Draw the ribbon in one stroke.', [{id: 'subject', type: 'ribbon', curve: 'helix', radius: 1, height: 2, turns: 2.5, thickness: 0.05, position: [0, 1.3, 0], material: 'gold', motion: [{type: 'draw', at: 0.3, dur: 2.6}]}]);
mo('count', 'Count from 0 to 100 on screen.', [{id: 'subject', type: 'label', text: '100', widest: '100', size: 1.3, weight: 200, position: [0, 1.25, 0], motion: [{type: 'count', from: 0, to: 100, at: 0.4, dur: 2.6}]}, {id: 'unit', type: 'label', text: 'YOUR NUMBER HERE', size: 0.13, tracking: 0.35, color: '#D6892A', position: [0, 0.34, 0]}]);
mo('typewriter', 'Type the sentence out, letter by letter.', [{id: 'subject', type: 'label', text: 'Say it, get a three.js scene.', size: 0.34, weight: 300, position: [0, 1.2, 0], motion: [{type: 'typewriter', at: 0.3, dur: 2.4}]}]);
mo('billboard', 'Keep the label facing the camera while the camera circles.', [{id: 'post', type: 'cylinder', radius: 0.05, height: 1.1, position: [0, 0.55, 0], material: 'steel'}, {id: 'subject', type: 'label', text: 'Always facing you', size: 0.34, position: [0, 1.4, 0], motion: [{type: 'billboard'}]}, {id: 'block', type: 'rounded-box', size: [0.6, 0.6, 0.6], position: [1.4, 0.3, 0.4], material: 'gold'}], {camera: cam([{type: 'orbit', from: -70, to: 70, dur: D}], {position: [0, 1.4, 5]})});

// ---------------------------------------------------------------- camera
const subject = () => [
  {id: 'title', type: 'text3d', text: 'CONNECT AI LAB', size: 0.44, position: [0, 0.75, 0], material: 'gold'},
  {id: 'rings', type: 'rings', radius: 0.72, position: [0, 2.05, -0.4]},
  {id: 'left', type: 'rounded-box', size: [0.5, 1.4, 0.5], position: [-3.2, 0.7, -1.6], material: 'black'},
  {id: 'right', type: 'rounded-box', size: [0.5, 2.0, 0.5], position: [3.3, 1.0, -2.2], material: 'steel'},
];
const cm = (id, prompt, motion, camExtra = {}, extra = {}) => add('camera', id, id, CAMERA_MOTIONS[id].about, prompt, OURS, {duration: D, look: 'connect-night-city', camera: {position: [0, 1.5, 7.4], target: [0, 1.25, 0], fov: 34, motion, ...camExtra}, objects: [floor(), ...subject()], ...extra}, {param: `{"type": "${id}"}  ${CAMERA_MOTIONS[id].params}`});
cm('orbit', 'Circle the logo from left to right.', [{type: 'orbit', from: -35, to: 35, dur: D}]);
cm('dolly', 'Push in slowly toward the logo.', [{type: 'dolly', from: 1.35, to: 0.72, dur: D}]);
cm('crane', 'Start low and rise above the logo.', [{type: 'crane', by: 2.6, dur: D}], {position: [0, 0.35, 7.4]});
cm('truck', 'Slide the camera sideways past the logo.', [{type: 'truck', by: [5, 0, 0], dur: D}], {position: [-2.5, 1.5, 7.4], target: [-2.5, 1.25, 0]});
cm('zoom', 'Zoom the lens from wide to tight.', [{type: 'zoom', from: 52, to: 20, dur: D}]);
cm('shots', 'Fly between three camera positions: wide, the rings, then the letters.', [{type: 'shots', list: [{at: 0.2, dur: 1.2, position: [-2.6, 2.6, 4.2], target: [0, 2.05, -0.4], arc: 0.3}, {at: 1.7, dur: 1.2, position: [2.4, 0.7, 3.6], target: [0.6, 0.8, 0], arc: 0.2}, {at: 3.0, dur: 0.9, position: [0, 1.5, 7.4], target: [0, 1.25, 0]}]}]);
cm('path', 'Fly the camera along a smooth curve around the scene.', [{type: 'path', points: [[-6, 1, 5], [-2.5, 2.8, 6.5], [2.5, 1.2, 6.2], [5.5, 2.4, 3.5]], targets: [[0, 1, 0], [0, 1.4, 0], [0, 1.2, 0], [0, 1.4, 0]], dur: D, ease: 'inOut'}]);
cm('handheld', 'Hold the camera by hand: a small organic drift.', [{type: 'handheld', amp: 0.12, speed: 1.4}], {position: [0, 1.5, 6.2]});
cm('dolly-zoom', 'The vertigo move: push in while the lens widens.', [{type: 'dolly-zoom', to: 0.42, dur: D}], {fov: 22, position: [0, 1.4, 12]});

// ---------------------------------------------------------------- lights
const lit = () => [
  {id: 'knot', type: 'knot', radius: 0.55, tube: 0.19, position: [-0.9, 1.2, 0], material: 'ivory', motion: [{type: 'turntable', speed: 18}]},
  {id: 'ball', type: 'sphere', radius: 0.55, position: [1.0, 0.55, 0.5], material: {preset: 'plastic', color: '#D6892A'}},
  {id: 'block', type: 'rounded-box', size: [0.6, 1.5, 0.6], position: [1.9, 0.75, -0.9], rotation: [0, 25, 0], material: 'clay'},
];
const matte = () => floor('matte', {material: {preset: 'black', roughness: 0.75}});
const lg = (id, title, about, prompt, spec, source = CORE) => add('light', id, title, about, prompt, source, {duration: D, camera: cam([{type: 'orbit', from: -8, to: 8, dur: D}]), post: ['vignette', 'grain'], ...spec});
lg('key', 'Key light', LIGHTS.key.about, 'One soft key light from the upper left, soft shadows on the floor.', {env: 'none', lights: [{type: 'key', intensity: 3.2, position: [-3.5, 5, 3.5]}, {type: 'ambient', intensity: 0.08}], objects: [matte(), ...lit()]});
lg('rim-gold', 'Gold rim light', LIGHTS.rim.about, 'Light it only from behind in gold, so just the edges show.', {env: 'none', lights: [{type: 'rim', color: '#D6892A', intensity: 9, position: [3.2, 2.6, -4.5]}, {type: 'rim', color: '#F2B45A', intensity: 4, position: [-3.6, 2.2, -4]}, {type: 'ambient', intensity: 0.03}], objects: [matte(), ...lit()]});
lg('fill', 'Key + fill', LIGHTS.fill.about, 'Key light from the left, a weak cool fill from the right.', {env: 'none', lights: [{type: 'key', intensity: 2.8, position: [-3.5, 4.5, 3.5]}, {type: 'fill', color: '#7fa6d6', intensity: 1.1, position: [4, 1.5, 3]}, {type: 'ambient', intensity: 0.05}], objects: [matte(), ...lit()]});
lg('point', 'Point lights', LIGHTS.point.about, 'Two small warm lamps near the objects, nothing else.', {env: 'none', lights: [{type: 'point', color: '#ffb066', intensity: 9, position: [-0.2, 0.6, 1.3]}, {type: 'point', color: '#ff8a3c', intensity: 6, position: [2.4, 1.9, 0.3]}, {type: 'ambient', intensity: 0.03}], objects: [matte(), ...lit(), {id: 'lamp', type: 'sphere', radius: 0.07, position: [-0.2, 0.6, 1.3], material: 'glow', shadow: false}, {id: 'lamp2', type: 'sphere', radius: 0.07, position: [2.4, 1.9, 0.3], material: 'glow', shadow: false}], post: [{type: 'bloom', strength: 0.5}, 'vignette', 'grain']});
lg('spot', 'Spot light', LIGHTS.spot.about, 'A single spotlight cone from above, a pool of light on the floor.', {env: 'none', lights: [{type: 'spot', intensity: 60, position: [0, 6, 2.5], target: [0, 0.5, 0], angle: 24, penumbra: 0.7}, {type: 'ambient', intensity: 0.03}], objects: [matte(), ...lit()]});
lg('area', 'Softbox', LIGHTS.area.about, 'One big softbox right above, like a product table.', {env: 'none', lights: [{type: 'area', intensity: 9, position: [0, 3.6, 0.6], width: 5, height: 2.4}, {type: 'ambient', intensity: 0.04}], objects: [matte(), ...lit()]}, JSM + ' RectAreaLight');
lg('sun', 'Sun + sky light', LIGHTS.sun.about, 'Outdoor sun, low in the sky, with blue sky light in the shadows.', {look: 'daylight', objects: [floor('matte', {material: {preset: 'clay', color: '#b9b4aa'}, size: 300}), ...lit()], post: ['vignette']}, JSM + ' Sky');
lg('sweep', 'Light sweep', LIGHT_MOTIONS.sweep, 'Let the gold rim light travel around the object.', {env: 'none', lights: [{type: 'rim', color: '#D6892A', intensity: 9, position: [0, 2.6, -5], motion: {type: 'sweep', from: -120, to: 120, dur: D}}, {type: 'ambient', intensity: 0.04}], objects: [matte(), ...lit()], post: [{type: 'bloom', strength: 0.3}, 'vignette', 'grain']}, OURS);
lg('breathe', 'Breathing light', LIGHT_MOTIONS.breathe, 'Make the key light swell and fade slowly.', {env: 'none', lights: [{type: 'key', intensity: 3, position: [-3, 4.5, 4], motion: {type: 'breathe', period: 2, amp: 0.7}}, {type: 'rim', color: '#D6892A', intensity: 4, position: [3, 2, -4]}], objects: [matte(), ...lit()]}, OURS);
const envScene = () => [floor(), {id: 'ball', type: 'sphere', radius: 0.85, position: [-1.05, 0.85, 0], material: 'chrome'}, {id: 'knot', type: 'knot', radius: 0.5, tube: 0.17, position: [1.15, 1.1, 0], material: 'gold', motion: [{type: 'turntable', speed: 24}]}];
lg('env-softbox', 'Environment: softbox room', 'our own reflection map: black room with warm and white strip lights', 'Reflections from a black studio with long warm strip lights.', {env: {type: 'softbox', intensity: 1.5}, lights: [{type: 'ambient', intensity: 0.05}], objects: envScene(), post: ['bloom', 'vignette', 'grain']}, OURS);
lg('env-room', 'Environment: lit room', "three's RoomEnvironment: a neutral lit room", 'Reflections from a plain neutral room.', {env: {type: 'room', intensity: 1}, lights: [{type: 'ambient', intensity: 0.05}], objects: envScene(), post: ['vignette', 'grain']}, JSM + ' RoomEnvironment');
lg('env-hdri', 'Environment: HDRI photo', 'an .hdr studio photo lights the scene (CC0 file ships with the kit)', 'Light the chrome ball with a real studio HDRI.', {env: {type: 'hdri', src: 'kit:studio_small_08_1k.hdr', intensity: 1}, lights: [{type: 'ambient', intensity: 0.03}], objects: envScene(), post: ['vignette', 'grain']}, JSM + ' RGBELoader');

// ---------------------------------------------------------------- post
const postScene = () => [
  {id: 'title', type: 'text3d', text: 'CONNECT AI LAB', size: 0.46, position: [0, 0.72, 0], material: 'gold'},
  {id: 'rings', type: 'rings', radius: 0.62, position: [0, 1.9, -0.2]},
  {id: 'near', type: 'gem', radius: 0.3, position: [-1.6, 0.4, 2.6], material: 'glass', motion: [{type: 'turntable', speed: 30}]},
  {id: 'far', type: 'rounded-box', size: [0.6, 2.2, 0.6], position: [3.4, 1.1, -5], material: 'steel'},
];
const ps = (id, about, prompt, post, source, spec = {}) => add('post', id, id, about, prompt, source, {duration: D, look: 'connect-night-city', camera: cam([{type: 'orbit', from: -10, to: 10, dur: D}], {position: [0, 1.45, 6.1], target: [0, 1.25, 0]}), post, objects: [floor(), ...postScene()], ...spec}, {param: `"post": [${post.map((p) => (typeof p === 'string' ? `"${p}"` : JSON.stringify(p))).join(', ')}]`});
const P = (t) => REG.post.get(t);
ps('bloom', P('bloom').about, 'Add a soft glow around the bright parts.', [{type: 'bloom', strength: 0.85, radius: 0.75, threshold: 0.6}], JSM + ' UnrealBloomPass');
ps('vignette', P('vignette').about, 'Darken the corners.', [{type: 'vignette', amount: 0.8}], OURS + ' shader');
ps('grain', P('grain').about, 'Add visible film grain.', [{type: 'grain', amount: 0.16}], OURS + ' shader');
ps('chroma', P('chroma').about, 'Add colour fringing toward the corners, like an old lens.', [{type: 'chroma', amount: 3.2}, 'vignette'], OURS + ' shader');
ps('grade', P('grade').about, 'Grade it warmer with more contrast.', [{type: 'grade', contrast: 1.18, saturation: 1.15, tint: '#ffd9a8', amount: 0.5}, 'bloom', 'vignette'], OURS + ' shader');
ps('dof', P('dof').about, 'Keep the logo sharp and blur the city behind it.', [{type: 'dof', aperture: 0.012, maxblur: 0.012}, 'bloom', 'vignette', 'grain'], JSM + ' BokehPass');
ps('ao', P('ao').about, 'Add contact shadows where the blocks touch.', [{type: 'ao', radius: 0.45, strength: 1.6}, 'vignette'], JSM + ' GTAOPass', {look: 'pale-studio', objects: [floor('matte', {material: {preset: 'clay', color: '#dcd8d0'}}),
  {id: 'a', type: 'rounded-box', size: [1.2, 1.2, 1.2], position: [-0.5, 0.6, 0], material: 'clay'}, {id: 'b', type: 'rounded-box', size: [0.8, 0.8, 0.8], position: [0.55, 0.4, 0.5], rotation: [0, 25, 0], material: {preset: 'clay', color: '#D6892A'}},
  {id: 'c', type: 'sphere', radius: 0.45, position: [-0.3, 1.65, 0.1], material: 'clay'}, {id: 'd', type: 'cylinder', radius: 0.3, height: 1.6, position: [1.5, 0.8, -0.4], material: 'clay'}]});
ps('outline', P('outline').about, 'Draw a gold outline around the rings.', [{type: 'outline', ids: ['rings'], strength: 5, thickness: 1.5}, 'vignette'], JSM + ' OutlinePass');
ps('pixel', P('pixel').about, 'Render it as pixel art.', [{type: 'pixel', size: 6}], JSM + ' RenderPixelatedPass', {look: 'connect-gold-night'});
ps('halftone', P('halftone').about, 'Print it in halftone dots.', [{type: 'halftone', radius: 5}], JSM + ' HalftonePass', {look: 'connect-gold-night'});
ps('smaa', P('smaa').about, 'Smooth the edges after the other passes.', ['bloom', 'vignette', {type: 'smaa'}], JSM + ' SMAAPass');

// ---------------------------------------------------------------- looks
const LOOK_SAY = {'connect-gold-night': 'Our default: black room, gold rim light.', 'connect-night-city': 'Put a night city behind it.', 'studio-black': 'Black product studio with one big softbox.', 'midnight-glass': 'Deep blue with frosted glass.', 'pale-studio': 'Bright neutral studio.', blueprint: 'Blueprint: dark blue and thin lines.', daylight: 'Outdoors in daylight.', 'on-video': 'No background: ready to sit on top of my video.'};
for (const [name, L] of Object.entries(LOOKS)) {
  const fl = name === 'blueprint' ? floor('grid') : name === 'pale-studio' || name === 'daylight' ? floor('matte', {material: {preset: 'clay', color: name === 'daylight' ? '#b9b4aa' : '#dcd8d0'}, size: 300}) : name === 'on-video' ? floor('shadow') : floor();
  add('look', name, name, L.about, LOOK_SAY[name], OURS, {duration: D, look: name, camera: cam([{type: 'orbit', from: -14, to: 14, dur: D}], {position: [0, 1.5, 7], target: [0, 1.2, 0]}), objects: [fl,
    {id: 'title', type: 'text3d', text: 'CONNECT AI LAB', size: 0.44, position: [0, 0.72, 0], material: name === 'blueprint' ? {preset: 'wire', color: '#F2B45A', opacity: 0.9} : 'gold'},
    {id: 'rings', type: 'rings', radius: 0.7, position: [0, 2.0, -0.2]},
    {id: 'card', type: 'card', kicker: 'look', title: name, width: 2.3, height: 1.0, position: [2.9, 1.2, -0.8], rotation: [0, -22, 0], material: name === 'pale-studio' || name === 'daylight' ? 'ivory' : 'frosted', color: name === 'pale-studio' || name === 'daylight' ? '#17181b' : undefined},
  ]}, {param: `"look": "${name}"`});
}

// ---------------------------------------------------------------- interaction (the clip uses a scripted pointer; on the page it is yours)
const iScene = () => [floor(),
  {id: 'left', type: 'gem', radius: 0.55, position: [-2, 0.95, 0], material: 'ivory', motion: [{type: 'turntable', speed: 14}]},
  {id: 'mid', type: 'knot', radius: 0.5, tube: 0.17, position: [0, 1.1, 0], material: 'gold', motion: [{type: 'turntable', speed: 14}]},
  {id: 'right', type: 'rounded-box', size: [0.9, 0.9, 0.9], radius: 0.12, position: [2, 0.95, 0], rotation: [0, 30, 0], material: 'black', motion: [{type: 'turntable', speed: 14}]},
];
const it = (id, prompt, script, extra = {}) => add('interact', id, id, INTERACT[id], prompt, OURS, {duration: D, look: 'connect-gold-night', camera: cam([], {position: [0, 1.5, 7], target: [0, 1.0, 0]}), interact: [id], pointerScript: script, objects: iScene(), ...extra}, {param: `"interact": ["${id}"]`});
it('orbit', 'Let visitors drag to look around the scene.', [{t: 0, x: -0.2, y: 0.1, orbit: [0, 0]}, {t: 0.6, x: -0.2, y: 0.1, orbit: [0, 0], down: true}, {t: 2, x: 0.5, y: 0.25, orbit: [1.1, 0.25], down: true}, {t: 3.4, x: -0.4, y: 0, orbit: [-0.5, 0.05], down: true}, {t: 4, x: -0.4, y: 0, orbit: [-0.5, 0.05]}]);
it('parallax', 'Make the camera lean gently toward the pointer.', [{t: 0, x: -0.8, y: -0.5}, {t: 1.3, x: 0.8, y: -0.3}, {t: 2.6, x: 0.6, y: 0.6}, {t: 4, x: -0.7, y: 0.4}], {parallaxAmount: 0.3});
it('hover', 'Lift the object under the pointer a little.', [{t: 0, x: -0.75, y: 0.5}, {t: 0.8, x: -0.5, y: 0.02}, {t: 1.5, x: -0.5, y: 0.02}, {t: 2.1, x: 0, y: -0.02}, {t: 2.8, x: 0, y: -0.02}, {t: 3.4, x: 0.5, y: 0.02}, {t: 4, x: 0.5, y: 0.02}], {hoverScale: 1.16});
it('zoom', 'Let visitors wheel or pinch to move closer.', [{t: 0, x: 0, y: 0, zoom: 1}, {t: 1.6, x: 0, y: 0, zoom: 0.55}, {t: 2.6, x: 0, y: 0, zoom: 0.55}, {t: 4, x: 0, y: 0, zoom: 1.3}]);
it('click', 'Give an object a spin when it is clicked.', [{t: 0, x: -0.75, y: 0.5}, {t: 0.7, x: -0.5, y: 0.02}, {t: 0.8, x: -0.5, y: 0.02, click: 'left', down: true}, {t: 1.0, x: -0.5, y: 0.02}, {t: 2.0, x: 0.5, y: 0.02}, {t: 2.1, x: 0.5, y: 0.02, click: 'right', down: true}, {t: 2.3, x: 0.5, y: 0.02}, {t: 4, x: 0.1, y: 0.4}], {objects: iScene().map((o) => ({...o, motion: []}))});
add('interact', 'scroll', 'scroll', INTERACT.scroll, 'Play the scene as the visitor scrolls down the page.', OURS, {duration: D, look: 'connect-gold-night', interact: ['scroll'], camera: {position: [0, 1.5, 7], target: [0, 1.0, 0], fov: 34, motion: [{type: 'shots', list: [{at: 0.2, dur: 1.5, position: [-3, 1.2, 3.4], target: [-2, 0.95, 0]}, {at: 1.9, dur: 1.4, position: [3, 1.4, 3.4], target: [2, 0.95, 0]}]}]}, objects: iScene(), page: {kicker: 'scroll', title: 'Scroll to fly the camera', scrollLength: 4}}, {param: '"interact": ["scroll"]'});

// ---------------------------------------------------------------- physics (Rapier, baked)
const RAP = 'Rapier (@dimforge/rapier3d-compat)';
add('physics', 'letters-drop', 'Letters drop', 'every letter is a rigid body falling onto the floor', "Drop the letters of 'CONNECT' from above and let them land and settle.", RAP, {duration: 5, look: 'connect-gold-night', camera: cam([{type: 'dolly', from: 1.12, to: 0.95, dur: 5}], {position: [0, 1.6, 9], target: [0, 0.75, 0]}), objects: [floor(),
  {id: 'word', type: 'text3d', text: 'CONNECT', size: 0.95, depth: 0.42, tracking: 0.1, split: true, position: [0, 2.9, 0], material: 'gold', bodyEach: true, each: 0.24, bounce: 0.12, friction: 1, angularDamping: 6},
]});
add('physics', 'dominoes', 'Dominoes', 'a push on the first block travels down the row', 'A row of black and gold dominoes: tip the first, watch them all go.', RAP, {duration: 5, look: 'connect-gold-night', camera: cam([{type: 'truck', by: [3.2, 0, 0], dur: 5}], {position: [-1.6, 1.3, 6.2], target: [-1.6, 0.4, 0]}), objects: [floor(),
  ...Array.from({length: 13}, (_, i) => ({id: `d${i}`, type: 'rounded-box', size: [0.12, 0.84, 0.42], radius: 0.02, position: [-3 + i * 0.5, 0.42, 0], material: i % 4 === 0 ? 'gold' : 'black', body: 'dynamic', bounce: 0.05, friction: 0.6, ...(i === 0 ? {spin: [0, 0, -5.5], at: 0.5} : {})})),
]});
add('physics', 'tumble', 'Stack and ball', 'a chrome ball knocks a stack of blocks over', 'Stack nine blocks, then roll a chrome ball into them.', RAP, {duration: 5, look: 'connect-gold-night', camera: cam([{type: 'orbit', from: -10, to: 16, dur: 5}], {position: [0, 1.7, 7], target: [0, 0.8, 0]}), objects: [floor(),
  ...Array.from({length: 9}, (_, i) => ({id: `b${i}`, type: 'rounded-box', size: [0.5, 0.5, 0.5], radius: 0.05, position: [0.6 + ((i % 3) - 1) * 0.52, 0.25 + Math.floor(i / 3) * 0.5, 0], material: i % 2 ? 'black' : 'gold', body: 'dynamic', bounce: 0.15})),
  {id: 'ball', type: 'sphere', radius: 0.36, position: [-3.6, 0.5, 0], material: 'chrome', body: 'dynamic', collider: 'ball', at: 0.7, push: [9, 0.6, 0], density: 6},
]});

// ---------------------------------------------------------------- lanes
add('lane', 'r3f', 'React Three Fiber lane', 'the same spec inside <Canvas> / Remotion <ThreeCanvas> through our R3F adapter', 'I already use React Three Fiber: mount this spec inside my own canvas next to my drei components.', '@react-three/fiber + @remotion/three', {duration: D, look: 'connect-gold-night', camera: cam([{type: 'orbit', from: -16, to: 16, dur: D}]), objects: [
  {id: 'knot', type: 'knot', position: [0, 1.15, 0], material: 'gold', motion: [{type: 'turntable', speed: 26}]},
  {id: 'tag', type: 'label', text: 'REACT THREE FIBER LANE', size: 0.15, tracking: 0.35, weight: 400, color: '#F2B45A', position: [0, 0.08, 0.9]},
  {id: 'base', type: 'cylinder', radius: 1.1, height: 0.06, position: [0, -0.38, 0], material: 'black'},
]}, {lane: 'r3f', param: '<ConnectScene spec={spec} time={t} />'});
add('lane', 'on-video', '3D on your own video', 'transparent 3D over your footage, a shadow, and a keep-out box so your face is never covered', 'Put a gold gyroscope next to me in my talking video. Never cover my face.', OURS + ' + Remotion OffthreadVideo', {duration: 6, look: 'on-video', keepOut: [{x: 0.33, y: 0.13, w: 0.25, h: 0.48}], camera: {position: [0, 1.2, 6.5], target: [0, 0.9, 0], fov: 34}, objects: [
  {id: 'object', type: 'rings', radius: 0.6, position: [2.25, 1.6, 0], motion: [{type: 'pop', at: 0.5}, {type: 'float', amp: 0.05}]},
  {id: 'name', type: 'label', text: 'AI MENTOR JAY', size: 0.15, tracking: 0.35, position: [2.25, 0.68, 0], motion: [{type: 'fade', at: 1.2}]},
]}, {lane: 'on-video', param: 'connect-ai-three on-video talk.mp4 --faces face.json'});

// write
const dir = path.join(KIT, 'catalog');
for (const g of fs.readdirSync(dir, {withFileTypes: true})) if (g.isDirectory()) fs.rmSync(path.join(dir, g.name), {recursive: true, force: true});
for (const it2 of items) writeJson(path.join(dir, it2.group, `${String(it2.order).padStart(3, '0')}_${it2.id}.json`), it2);
const idx = buildIndex();
console.log(`catalog: ${idx.count} items`, idx.groups.map((g) => `${g.id} ${g.count}`).join(' · '));
