// Small pure helpers. Everything in the runtime is a function of time t (seconds): no clocks, no Math.random().
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, k) => a + (b - a) * k;
export const DEG = Math.PI / 180;

export const EASE = {
  linear: (x) => x,
  in: (x) => x * x * x,
  out: (x) => 1 - Math.pow(1 - x, 3),
  inOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  expoOut: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  smooth: (x) => x * x * (3 - 2 * x),
  back: (x) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  },
  spring: (x) => (x >= 1 ? 1 : 1 - Math.exp(-6.5 * x) * Math.cos(10 * x)),
  bounce: (x) => {
    const n = 7.5625, d = 2.75;
    if (x < 1 / d) return n * x * x;
    if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75;
    if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375;
    return n * (x -= 2.625 / d) * x + 0.984375;
  },
};
export const EASE_NAMES = Object.keys(EASE);

// progress 0..1 of a move that starts at `at` and lasts `dur` seconds
export function prog(t, at = 0, dur = 1, ease = 'inOut') {
  const x = dur <= 0 ? (t >= at ? 1 : 0) : clamp((t - at) / dur);
  return (EASE[ease] || EASE.inOut)(x);
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
// seeded random (mulberry32): the same seed gives the same scene on every machine
export function rng(seed = 1) {
  let a = (typeof seed === 'string' ? hashStr(seed) : seed) >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// smooth drift for a hand-held camera: a sum of sines, still a pure function of t
export function drift(t, seed = 0) {
  return (Math.sin(t * 1.13 + seed * 7.1) + Math.sin(t * 0.71 + seed * 3.3) * 0.6 + Math.sin(t * 2.37 + seed * 1.7) * 0.25) / 1.85;
}
// value noise + fbm (our own, no third-party shader code)
function h2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(h2(xi, yi), h2(xi + 1, yi), u), lerp(h2(xi, yi + 1), h2(xi + 1, yi + 1), u), v);
}
export function fbm2(x, y, oct = 4) {
  let a = 0.5, f = 1, s = 0;
  for (let i = 0; i < oct; i++) {
    s += a * noise2(x * f, y * f);
    a *= 0.5;
    f *= 2;
  }
  return s;
}
export const v3 = (a, d = [0, 0, 0]) => (Array.isArray(a) ? [a[0] ?? d[0], a[1] ?? d[1], a[2] ?? d[2]] : typeof a === 'number' ? [a, a, a] : d.slice());
export const asList = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
// "bloom" -> {type:'bloom'}
export const asDef = (x, key = 'type') => (typeof x === 'string' ? {[key]: x} : x);

export const GLSL_NOISE = /* glsl */ `
float c3hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float c3noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(c3hash(i), c3hash(i+vec2(1,0)), u.x), mix(c3hash(i+vec2(0,1)), c3hash(i+vec2(1,1)), u.x), u.y); }
float c3fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*c3noise(p); p*=2.03; a*=0.5; } return s; }
`;

// built-in 3D typefaces (data in src/fonts/, one small adapter each)
export const FONT_KEYS = ['thin', 'light', 'sans', 'bold', 'serif', 'serif-bold'];
export const FONT_ALIAS = {'sans-bold': 'bold', 'sans-light': 'light', 'sans-thin': 'thin', display: 'serif-bold', regular: 'sans', medium: 'sans'};
export const fontKey = (name) => FONT_ALIAS[name] || (FONT_KEYS.includes(name) ? name : 'bold');
// Korean letters the built-in sans faces carry (a few brand phrases); any other Korean text needs "fontFile"
export const BUILTIN_KO = [...new Set('모두를 위한 AI 교육 비주얼 바이브코딩 커넥트 에이아이 랩 멘토 제이 야학당 인공지능 가장 멋진 방법 배우는 를 말하면 장면이 됩니다 영상 위에 삼차원 강의 안녕하세요 오픈소스'.replace(/[ A-Za-z]/g, ''))].join('');
