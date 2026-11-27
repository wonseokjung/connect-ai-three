// words -> a first scene.json, no AI needed. Your agent (Claude Code, Codex, Cursor, Antigravity) writes better
// specs by reading the skill + catalog; this is the fallback so `new "..."` always gives something that renders.
import {BUILTIN_KO} from '../src/runtime/util.js';
const has = (s, ...keys) => keys.some((k) => s.includes(k));
// camera MOVES (not the camera prop): "slow orbit camera", "천천히 도는 카메라", "카메라가 날아"
const CAMERA_MOVE = ['camera move', 'camera fl', 'camera push', 'orbit', 'camera orbit', 'camera turn', 'camera circl', '카메라가', '카메라 무빙', '카메라 이동', '카메라 움직', '카메라 워크', '도는 카메라', '돌아가는 카메라', '움직이는 카메라', '카메라로 돌', '카메라 회전'];
// Korean letters the built-in sans faces carry (a few brand lines): such text can be 3D letters without a font file
const inBuiltinFont = (t) => [...t].every((c) => c.charCodeAt(0) < 0x250 || BUILTIN_KO.includes(c));


// moods: a palette and a light that fit the sentence. Nothing said -> one picked from the words themselves, so two
// different sentences rarely get the same room. (Black and gold is one mood among many: "luxury", "premium", "gold".)
const MOODS = {
  pastel: {keys: ['pastel', 'cafe', 'café', 'bakery', 'flower', 'spring', 'cute', 'dessert', '파스텔', '카페', '베이커리', '빵', '꽃', '봄', '귀여', '디저트'],
    look: 'pale-studio', background: {type: 'gradient', top: '#FFB89A', bottom: '#B8A4F2'}, floor: '#F2A7B8', toys: ['#5CC8B0', '#FFD166', '#9B8CF2'], mat: {preset: 'plastic', color: '#3A2E7A', roughness: 0.45}, fog: {color: '#E9B8C8', density: 0.05}, tone: 'neutral'},
  toy: {keys: ['toy', 'kids', 'child', 'game', 'fun', 'lego', 'play', '장난감', '아이', '어린이', '게임', '재밌', '레고', '놀이'],
    look: 'pale-studio', background: {type: 'gradient', top: '#2EC4F1', bottom: '#1B6FE0'}, floor: '#FFD23F', toys: ['#7BF1A8', '#00BBF9', '#9B5DE5'], mat: {preset: 'plastic', color: '#FF5D8F', roughness: 0.3}, fog: {color: '#2a8fe8', density: 0.04}, tone: 'neutral'},
  sunset: {keys: ['sunset', 'dusk', 'summer', 'beach', 'desert', 'travel', '노을', '석양', '여름', '해변', '사막', '여행'],
    look: 'daylight', background: {type: 'gradient', top: '#3E2C78', bottom: '#FF8F66'}, floor: '#E39A6C', mat: {preset: 'plastic', color: '#3B1F2B', roughness: 0.4}, fog: {color: '#F59A72', density: 0.07}, tone: 'aces', exposure: 0.55, backdrop: [{type: 'backglow', color: '#FF9A55', intensity: 0.55, floorFade: 0}],
    lights: [{type: 'sun', color: '#FFB070', intensity: 2.2, elevation: 6, azimuth: 180}, {type: 'key', color: '#ffe2c8', intensity: 0.7, position: [-2.5, 4.5, 4.5]}, {type: 'hemi', sky: '#ffb4a2', ground: '#5b3a5c', intensity: 0.5}]},
  neon: {keys: ['neon', 'cyber', 'club', 'gaming', 'night', 'party', '네온', '사이버', '클럽', '게이밍', '밤', '파티'],
    look: 'connect-gold-night', background: {type: 'gradient', top: '#1a0638', bottom: '#030008'}, backdrop: [{type: 'backglow', color: '#FF2E97', intensity: 0.3, floorFade: 2.5}], mat: {preset: 'chrome', color: '#e9e4ff'}, fog: {color: '#0a0216', density: 0.03},
    lights: [{type: 'key', color: '#ffffff', intensity: 1.4, position: [-3, 4, 4]}, {type: 'rim', color: '#FF2E97', intensity: 9, position: [3.5, 2.4, -3.5]}, {type: 'rim', color: '#00E5FF', intensity: 8, position: [-3.8, 1.6, -3]}, {type: 'ambient', intensity: 0.06}]},
  paper: {keys: ['paper', 'craft', 'watercolor', 'story', 'fairy', 'book', 'handmade', '종이', '공예', '수채화', '동화', '이야기', '손으로', '핸드메이드'],
    look: 'pale-studio', background: {type: 'gradient', top: '#FDF6E3', bottom: '#EBD9BC'}, floor: '#EADBC8', toys: ['#81B29A', '#F2CC8F', '#3D405B'], mat: {preset: 'clay', color: '#E07A5F'}, fog: {color: '#F3E6CF', density: 0.04}, tone: 'neutral', post: [{type: 'vignette', amount: 0.22}, {type: 'grain', amount: 0.06}]},
  ocean: {keys: ['tech', 'future', 'space', 'ai ', 'robot', 'science', '테크', '미래', '우주', '로봇', '과학', '인공지능'],
    look: 'midnight-glass', mat: {preset: 'iridescent'}},
  luxury: {keys: ['luxury', 'premium', 'gold', 'black', 'elegant', '럭셔리', '프리미엄', '고급', '금색', '골드', '황금', '블랙', '검은'],
    look: 'studio-black', mat: 'gold', backdrop: [{type: 'backglow', color: '#D6892A', intensity: 0.12, floorFade: 2.6}]},
};
const VARIETY = ['pastel', 'toy', 'sunset', 'neon', 'paper'];
const hashWords = (t) => [...t].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
export function pickMood(s) {
  for (const [id, m] of Object.entries(MOODS)) if (m.keys.some((k) => s.includes(k))) return id;
  return VARIETY[hashWords(s) % VARIETY.length];
}

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
  // no room named: a mood that fits the words (or a city that takes the mood's colours)
  const explicitLook = spec.look !== 'connect-gold-night';
  const moodId = spec.look === 'on-video' || spec.look === 'blueprint' || spec.look === 'daylight' || spec.look === 'pale-studio' ? null : pickMood(s);
  const mood = moodId ? MOODS[moodId] : null;
  if (mood && !explicitLook) {
    spec.look = mood.look;
    for (const k of ['background', 'fog', 'tone', 'exposure', 'lights', 'backdrop', 'post']) if (mood[k]) spec[k] = JSON.parse(JSON.stringify(mood[k]));
  } else if (mood && spec.look === 'connect-night-city' && (moodId === 'neon' || moodId === 'sunset' || moodId === 'pastel')) {
    if (mood.lights) spec.lights = JSON.parse(JSON.stringify(mood.lights));
    if (moodId === 'neon') spec.backdrop = [{type: 'city'}, {type: 'backglow', color: '#FF2E97', intensity: 0.3, floorFade: 2.5}];
  }
  notes.push(`look: ${spec.look}${moodId ? ` · mood: ${moodId}` : ''}`);
  // material
  const mat = has(s, 'chrome', '크롬') ? 'chrome' : has(s, 'glass', '유리') ? 'glass' : has(s, 'gold', '금색', '골드', '황금') ? 'gold' : has(s, 'black', '검은', '블랙') ? 'black' : has(s, 'iridescent', '무지개빛') ? 'iridescent' : has(s, 'clay', '클레이', '무광') ? 'clay' : has(s, 'toon', 'cartoon', '툰', '만화') ? 'toon' : mood ? mood.mat : 'gold';
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
  else if (has(s, 'camera on', 'my camera', 'cinema camera', 'tripod', '카메라', '삼각대') && !(has(s, ...CAMERA_MOVE) && !has(s, 'my camera', 'cinema camera', 'tripod', '삼각대', '내 카메라', '시네마 카메라'))) spec.objects.push({id: 'camera', type: 'cinema-camera', tripod: true, rotation: [0, -34, 0]}), Object.assign(spec.camera, {position: [0, 1.5, 7.2], target: [0, 1.2, 0]});
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
    else spec.objects.push({id: 'title', type: 'text3d', text, size: Math.min(0.52, 5.4 / Math.max(6, text.length)), position: [0, y, 0], material: mat, split: true, motion: [{type: 'stagger', at: 0.2, each: 0.06}]});
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
  // a few soft shapes in the mood's colours around a title, so the room is not empty
  // props that belong to the mood, so each room is its own world (not the same three shapes in new colours)
  const titled = ['text3d', 'wordmark', 'label', 'svg'].includes(spec.objects[0].type);
  const PROPS = {
    // cafe: a donut, a macaron stack, a scoop
    pastel: [[-2.9, 0.42, 0.7, 'torus', {radius: 0.3, tube: 0.12}, [0, 25, 0]], [2.5, 0.16, -1.0, 'cylinder', {radius: 0.36, height: 0.32}, [0, 0, 0]], [1.8, 0.24, 1.0, 'sphere', {radius: 0.24}, [0, 0, 0]]],
    // toy box: a block, a cone, a ring standing up
    toy: [[-2.9, 0.3, 0.6, 'rounded-box', {size: [0.64, 0.64, 0.64], radius: 0.12}, [0, 24, 0]], [2.5, 0.45, -1.0, 'cone', {radius: 0.38, height: 0.9}, [0, 0, 0]], [1.7, 0.3, 1.0, 'torus', {radius: 0.24, tube: 0.07}, [0, 30, 0]]],
    // paper craft: standing paper cards and a paper tree
    paper: [[-2.9, 0.6, 0.2, 'rounded-box', {size: [0.9, 1.2, 0.03], radius: 0.01}, [0, 28, 0]], [2.4, 0.45, -1.2, 'rounded-box', {size: [0.7, 0.9, 0.03], radius: 0.01}, [0, -24, 0]], [1.6, 0.4, 0.9, 'cone', {radius: 0.26, height: 0.8}, [0, 0, 0]]],
  };
  if (mood && titled && PROPS[moodId]) {
    PROPS[moodId].forEach(([x, py, z, type, g, rot], i) => {
      spec.objects.push({id: `shape-${i + 1}`, type, ...g, position: [x, py, z], rotation: rot, material: {preset: moodId === 'paper' ? 'clay' : 'plastic', color: mood.toys[i], roughness: 0.4}, motion: [{type: 'float', amp: 0.04, phase: i}]});
      spec.objects.push({id: `shape-${i + 1}-shadow`, type: 'contact', radius: (g.radius || 0.4) * 1.4, opacity: 0.28, color: '#4a3040', position: [x, 0.004, z]});
    });
  }
  // sunset: a low sun behind the title and dunes on the horizon
  if (moodId === 'sunset' && titled) {
    spec.objects.push({id: 'sun', type: 'sphere', radius: 2.2, position: [0, 1.4, -26], material: {preset: 'glow', color: '#FFB46B', intensity: 1.1}, reflect: false});
    [[-9, -22, 3.2, 2.2], [7, -20, 3.8, 2.6], [-2, -16, 2.6, 1.6]].forEach(([x, z, r, h], i) => spec.objects.push({id: `dune-${i + 1}`, type: 'cone', radius: r, height: h, position: [x, h / 2 - 0.05, z], material: {preset: 'clay', color: '#C9805A'}}));
  }
  // neon: the letters light up, two rings of light behind them
  if (moodId === 'neon' && titled && !has(s, 'chrome', '크롬', 'gold', '골드', '금색')) {
    spec.objects[0].material = {preset: 'glow', color: '#FF4FD8', intensity: 1.4};
    spec.objects.push({id: 'neon-ring-1', type: 'torus', radius: 1.5, tube: 0.025, position: [0, 1.0, -1.6], material: {preset: 'glow', color: '#00E5FF', intensity: 1.6}, reflect: false});
    spec.objects.push({id: 'neon-ring-2', type: 'torus', radius: 1.9, tube: 0.02, position: [0, 1.0, -2.0], material: {preset: 'glow', color: '#8B5CFF', intensity: 1.4}, reflect: false});
  }
  // physics
  if (has(s, 'drop', 'fall', 'physics', 'tumble', '떨어', '물리') && ['text3d', 'wordmark'].includes(spec.objects[0].type)) {
    Object.assign(spec.objects[0], {position: [0, 3.2, 0], bodyEach: true, each: 0.07, bounce: 0.3, motion: []});
    notes.push('physics: every letter is a rigid body (Rapier), baked');
  }
  // floor
  if (spec.look === 'on-video') spec.objects.unshift({id: 'floor', type: 'floor', kind: 'shadow'});
  else if (!['waves', 'terrain'].includes(spec.objects[0].type) && spec.look !== 'daylight' && spec.look !== 'blueprint') spec.objects.unshift({id: 'floor', type: 'floor', kind: spec.look === 'pale-studio' ? 'matte' : 'mirror', ...(spec.look === 'pale-studio' ? {material: {preset: 'clay', color: (mood && mood.floor) || '#dcd8d0'}, size: 300} : {dim: 0.9})});
  else if (spec.look === 'blueprint') spec.objects.unshift({id: 'floor', type: 'floor', kind: 'grid'});
  else if (spec.look === 'daylight' && mood && mood.floor && !['waves', 'terrain'].includes(spec.objects[0].type)) spec.objects.unshift({id: 'floor', type: 'floor', kind: 'matte', material: {preset: 'clay', color: mood.floor}, size: 60});
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
