// words -> a first scene.json, no AI needed. Your agent (Claude Code, Codex, Cursor, Antigravity) writes better
// specs by reading the skill + catalog; this is the fallback so `new "..."` always gives something that renders.
import {BUILTIN_KO} from '../src/runtime/util.js';
const has = (s, ...keys) => keys.some((k) => s.includes(k));
// camera MOVES (not the camera prop): "slow orbit camera", "천천히 도는 카메라", "카메라가 날아"
const CAMERA_MOVE = ['camera move', 'camera fl', 'camera push', 'orbit', 'camera orbit', 'camera turn', 'camera circl', '카메라가', '카메라 무빙', '카메라 이동', '카메라 움직', '카메라 워크', '도는 카메라', '돌아가는 카메라', '움직이는 카메라', '카메라로 돌', '카메라 회전'];
// Korean letters the built-in sans faces carry (a few brand lines): such text can be 3D letters without a font file
const inBuiltinFont = (t) => [...t].every((c) => c.charCodeAt(0) < 0x250 || BUILTIN_KO.includes(c));

export function draftSpec(words) {
  const raw = String(words || '').trim();
  const s = raw.toLowerCase();
  const quoted = [...raw.matchAll(/["“']([^"”']{1,60})["”']/g)].map((m) => m[1]);
  const notes = [];
  const spec = {name: (quoted[0] || raw || 'scene').toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'scene', duration: 6, look: 'connect-gold-night', camera: {position: [0, 1.25, 6.4], target: [0, 0.8, 0], fov: 34, motion: []}, objects: [], interact: []};
  const dur = s.match(/(\d+(?:\.\d+)?)\s*(?:s\b|sec|seconds?|초)/);
  if (dur) spec.duration = Math.min(60, Math.max(1, parseFloat(dur[1])));
  if (has(s, 'vertical', 'shorts', 'reel', '9:16', '세로', '숏', '쇼츠')) {
    spec.size = {width: 1080, height: 1920};
    notes.push('vertical 1080x1920');
  }
  // look
  if (has(s, 'on my video', 'over my video', 'on top of my video', '내 영상', '영상 위')) spec.look = 'on-video';
  else if (has(s, 'city', 'skyline', '도시', '야경')) spec.look = 'connect-night-city';
  else if (has(s, 'blueprint', '도면', '청사진')) spec.look = 'blueprint';
  else if (has(s, 'daylight', 'outdoor', 'sky', '하늘', '낮', '야외')) spec.look = 'daylight';
  else if (has(s, 'bright', 'white', 'pale', 'diagram', '밝', '흰')) spec.look = 'pale-studio';
  else if (has(s, 'card', 'glass card', 'explain', '카드', '설명')) spec.look = 'midnight-glass';
  else if (has(s, 'product', 'studio', '제품', '스튜디오')) spec.look = 'studio-black';
  notes.push(`look: ${spec.look}`);
  // material
  const mat = has(s, 'chrome', '크롬') ? 'chrome' : has(s, 'glass', '유리') ? 'glass' : has(s, 'black', '검은', '블랙') ? 'black' : has(s, 'iridescent', '무지개빛') ? 'iridescent' : has(s, 'clay', '클레이', '무광') ? 'clay' : has(s, 'toon', 'cartoon', '툰', '만화') ? 'toon' : 'gold';
  // subject
  const y = 0.85;
  const model = raw.match(/[\w./\-가-힣]+\.(?:glb|gltf)/i);
  const svg = raw.match(/[\w./\-가-힣]+\.svg/i);
  if (model) spec.objects.push({id: 'model', type: 'gltf', src: model[0], fit: 1.8, motion: [{type: 'turntable', speed: 16}]});
  else if (svg) spec.objects.push({id: 'logo', type: 'svg', src: svg[0], fit: 2.2, position: [0, y + 0.2, 0], material: mat, motion: [{type: 'pop', at: 0.2}, {type: 'sway', deg: 4, axis: 'y'}]});
  // the studio props: say the thing, get the thing
  else if (has(s, 'building', 'office', 'studio building', '건물', '사옥')) spec.objects.push({id: 'building', type: 'building', ...(quoted[0] ? {sign: quoted[0].toUpperCase()} : {}), scale: 0.82, rotation: [0, -26, 0], motion: [{type: 'rise', at: 0.2, from: -0.5}]});
  else if (has(s, 'microphone', 'mic ', 'podcast', '마이크', '팟캐스트')) spec.objects.push({id: 'microphone', type: 'microphone', rotation: [0, 20, 0], motion: [{type: 'turntable', speed: 12}]});
  else if (has(s, 'clapper', 'clapperboard', 'slate', '슬레이트', '클래퍼')) spec.objects.push({id: 'clapper', type: 'clapper', ...(quoted[0] ? {title: quoted[0]} : {}), position: [0, 1.15, 0], rotation: [0, -18, 0], clapAt: 1.4});
  else if (has(s, 'laptop', 'notebook', '노트북', '랩톱')) spec.objects.push({id: 'laptop', type: 'laptop', ...(quoted[0] ? {title: quoted[0]} : {}), rotation: [0, 26, 0]});
  else if (has(s, 'monitor', 'display', 'screen', '모니터', '디스플레이', '화면')) spec.objects.push({id: 'display', type: 'display', ...(quoted[0] ? {title: quoted[0]} : {}), rotation: [0, -8, 0], motion: [{type: 'rise', at: 0.2, from: -0.3}]});
  else if (has(s, 'computer', 'workstation', 'desktop', '컴퓨터', '워크스테이션', '본체')) spec.objects.push({id: 'workstation', type: 'workstation', rotation: [0, 28, 0], motion: [{type: 'turntable', speed: 14}]});
  else if (has(s, 'softbox', 'studio light', '소프트박스', '조명 스탠드')) spec.objects.push({id: 'softbox', type: 'softbox', rotation: [0, -24, 0]});
  else if (has(s, 'book', 'textbook', '책', '교재')) spec.objects.push({id: 'book', type: 'book', ...(quoted[0] ? {title: quoted[0].toUpperCase().split(/\s+/).join('\n')} : {}), position: [0, 0.95, 0], rotation: [0, 26, 0], motion: [{type: 'turntable', speed: 16}]});
  else if (has(s, 'camera on', 'my camera', 'cinema camera', 'tripod', '카메라', '삼각대') && !(has(s, ...CAMERA_MOVE) && !has(s, 'my camera', 'cinema camera', 'tripod', '삼각대', '내 카메라', '시네마 카메라'))) spec.objects.push({id: 'camera', type: 'cinema-camera', tripod: true, rotation: [0, -34, 0]});
  else if (has(s, 'logo', 'title', 'text', 'word', '로고', '글자', '제목', '타이틀') || (quoted.length && !has(s, 'card', '카드'))) {
    const text = quoted[0] || 'CONNECT AI LAB';
    if (/[^\u0000-\u024f\u2010-\u2027]/.test(text) && inBuiltinFont(text)) {
      // a Korean brand line the built-in sans carries: real 3D letters
      spec.objects.push({id: 'title', type: 'wordmark', text, font: 'sans', size: Math.min(0.42, 4.6 / Math.max(6, text.length)), tracking: 0.04, position: [0, y, 0], material: mat, split: true, motion: [{type: 'stagger', at: 0.2, each: 0.07, kind: 'rise'}]});
    } else if (/[^\u0000-\u024f\u2010-\u2027]/.test(text)) {
      // the built-in 3D font is Latin only: other scripts start as a flat label (crisp in any language)
      spec.objects.push({id: 'title', type: 'label', text, size: 0.7, weight: 300, position: [0, y + 0.2, 0], motion: [{type: 'rise', at: 0.3, from: -0.3}]});
      notes.push(`"${text}" is not Latin: made a label. For extruded 3D letters make it a text3d with "fontFile": "assets/YourFont.ttf"`);
    } else if (has(s, 'logo', 'wordmark', 'brand', '로고', '워드마크', '브랜드')) spec.objects.push({id: 'title', type: 'wordmark', text: text.toUpperCase(), font: 'sans', size: Math.min(0.46, 5.2 / Math.max(6, text.length)), position: [0, y, 0], material: mat, split: true, motion: [{type: 'stagger', at: 0.2, each: 0.07, kind: 'rise'}]});
    else spec.objects.push({id: 'title', type: 'text3d', text, size: 0.52, position: [0, y, 0], material: mat, split: true, motion: [{type: 'stagger', at: 0.2, each: 0.06}]});
  }
  else if (has(s, 'globe', 'world', 'earth', '지구', '세계')) spec.objects.push({id: 'globe', type: 'globe', position: [0, 1.25, 0], motion: [{type: 'turntable', speed: 10}]});
  else if (has(s, 'chart', 'bars', 'graph', '그래프', '차트', '막대')) {
    const nums = (raw.match(/-?\d+(?:\.\d+)?/g) || []).map(Number).filter((n) => n !== spec.duration);
    spec.objects.push({id: 'bars', type: 'bars', values: nums.length >= 2 ? nums.slice(0, 8) : [2, 3, 5, 8], position: [0, 0, 0]});
    if (nums.length < 2) notes.push('bars: put your own numbers in "values" (the four in the draft are placeholders)');
  } else if (has(s, 'card', '카드')) (quoted.length ? quoted : ['Idea one', 'Idea two', 'Idea three']).slice(0, 4).forEach((t, i, a) => spec.objects.push({id: `card-${i + 1}`, type: 'card', kicker: `0${i + 1}`, title: t, position: [(i - (a.length - 1) / 2) * 2.9, 1.1, -i * 0.6], rotation: [0, -8, 0], motion: [{type: 'rise', at: 0.2 + i * 0.25}, {type: 'float', amp: 0.04, phase: i}]}));
  else if (has(s, 'blob', 'liquid', '액체', '물방울')) spec.objects.push({id: 'blob', type: 'blob', position: [0, 1.15, 0], material: mat === 'gold' ? 'chrome' : mat});
  else if (has(s, 'wave', 'ocean', 'sea', '바다', '물결', '파도')) spec.objects.push({id: 'waves', type: 'waves', position: [0, 0, -2]});
  else if (has(s, 'terrain', 'mountain', '산', '지형')) spec.objects.push({id: 'terrain', type: 'terrain', wire: true, position: [0, -0.2, -2]});
  else if (has(s, 'grid', 'cubes', 'blocks', '큐브', '블록')) spec.objects.push({id: 'grid', type: 'instances', layout: 'wave', material: mat === 'gold' ? 'gold-brushed' : mat, position: [0, 0.3, 0]});
  else if (has(s, 'ribbon', 'swoosh', '리본')) spec.objects.push({id: 'ribbon', type: 'ribbon', curve: 'swoosh', material: mat, position: [0, 1.1, 0], motion: [{type: 'draw', at: 0.2, dur: 1.6}, {type: 'turntable', speed: 14}]});
  else if (has(s, 'gem', 'diamond', 'crystal', '보석', '다이아')) spec.objects.push({id: 'gem', type: 'gem', position: [0, 1.05, 0], material: mat === 'gold' ? 'glass' : mat, motion: [{type: 'turntable', speed: 24}, {type: 'float'}]});
  else if (has(s, 'knot', '매듭')) spec.objects.push({id: 'knot', type: 'knot', position: [0, 1.1, 0], material: mat, motion: [{type: 'turntable', speed: 22}]});
  else spec.objects.push({id: 'rings', type: 'rings', position: [0, 1.15, 0], material: mat});
  if (quoted.length && !['text3d', 'wordmark', 'card', 'label', 'building', 'clapper', 'laptop', 'display', 'book'].includes(spec.objects[0].type)) spec.objects.push({id: 'caption', type: 'label', text: quoted[0], size: 0.2, tracking: 0.2, position: [0, 0.2, 0.6], motion: [{type: 'fade', at: 0.9}]});
  // physics
  if (has(s, 'drop', 'fall', 'physics', 'tumble', '떨어', '물리') && ['text3d', 'wordmark'].includes(spec.objects[0].type)) {
    Object.assign(spec.objects[0], {position: [0, 3.2, 0], bodyEach: true, each: 0.07, bounce: 0.3, motion: []});
    notes.push('physics: every letter is a rigid body (Rapier), baked');
  }
  // floor
  if (spec.look === 'on-video') spec.objects.unshift({id: 'floor', type: 'floor', kind: 'shadow'});
  else if (!['waves', 'terrain'].includes(spec.objects[0].type) && spec.look !== 'daylight' && spec.look !== 'blueprint') spec.objects.unshift({id: 'floor', type: 'floor', kind: spec.look === 'pale-studio' ? 'matte' : 'mirror', ...(spec.look === 'pale-studio' ? {material: {preset: 'clay', color: '#dcd8d0'}} : {})});
  else if (spec.look === 'blueprint') spec.objects.unshift({id: 'floor', type: 'floor', kind: 'grid'});
  // camera
  const D = spec.duration;
  if (has(s, 'fly', '날아')) spec.camera.motion.push({type: 'shots', list: [{at: 0, dur: D * 0.45, position: [-3, 1.6, 5], target: [0, 0.9, 0]}, {at: D * 0.5, dur: D * 0.45, position: [3, 1.1, 4.2], target: [0, 0.8, 0]}]});
  else if (has(s, 'push', 'zoom in', 'closer', '다가', '줌')) spec.camera.motion.push({type: 'dolly', from: 1.15, to: 0.8, dur: D});
  else spec.camera.motion.push({type: 'orbit', from: -16, to: 16, dur: D}, {type: 'dolly', from: 1.06, to: 0.94, dur: D});
  if (has(s, 'handheld', '핸드헬드')) spec.camera.motion.push({type: 'handheld'});
  // post extras
  if (has(s, 'depth of field', 'dof', 'bokeh', 'blur background', '보케', '아웃포커스')) spec.addPost = [{type: 'dof'}];
  if (has(s, 'pixel', '픽셀')) spec.addPost = [...(spec.addPost || []), {type: 'pixel'}];
  if (has(s, 'outline', '외곽선')) spec.addPost = [...(spec.addPost || []), {type: 'outline'}];
  // interaction
  if (has(s, 'interactive', 'hero', 'website', 'web page', 'landing', '인터랙티브', '히어로', '웹', '홈페이지')) spec.interact.push('parallax', 'orbit', 'hover');
  if (has(s, 'scroll', '스크롤')) spec.interact = ['scroll'];
  if (has(s, 'hover', '호버')) spec.interact.push('hover');
  spec.interact = [...new Set(spec.interact)];
  if (spec.interact.length) notes.push(`interact: ${spec.interact.join(', ')}`);
  notes.push(`subject: ${spec.objects.filter((o) => o.type !== 'floor').map((o) => o.type + (o.material ? ` (${typeof o.material === 'string' ? o.material : o.material.preset})` : '')).join(' + ')}`);
  return {spec, notes};
}
