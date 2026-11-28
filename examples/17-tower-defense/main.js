// Tower defense with an AI commander: a self-playing 3D isometric tower defense. Towers hold a beacon against waves
// of monsters across five lands; an AI commander plays from the moment the page loads and you can take over any time.
//
// Cinderwatch by kevintngo (MIT, https://github.com/kevintngo/cinderwatch), the files of its src/ folder joined in
// order (00-util.js ... 90-main.js) the same way its tools/build.py does. Changes for this kit: three.js comes from the
// kit's import map (0.187) instead of the vendored r170 copy, and window.EXAMPLE is set after the first frame.
// Every model, texture and sound is generated in code; no asset files.
import * as THREE from 'three';
const PI = Math.PI, TAU = Math.PI * 2, HPI = Math.PI / 2;
const clamp = (x, a, b) => x < a ? a : (x > b ? b : x);
const sat = x => x < 0 ? 0 : (x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const damp = (a, b, l, dt) => b + (a - b) * Math.exp(-l * dt);
const easeOut = t => 1 - Math.pow(1 - sat(t), 3);
const easeIn = t => { t = sat(t); return t * t * t; };
const easeInOut = t => { t = sat(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const easeOutBack = t => { t = sat(t); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
function angDiff(a, b) { let d = (b - a) % TAU; if (d > PI) d -= TAU; if (d < -PI) d += TAU; return d; }
function angDamp(a, b, l, dt) { return a + angDiff(a, b) * (1 - Math.exp(-l * dt)); }

function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  const f = () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  f.range = (a, b) => a + (b - a) * f();
  f.int = (a, b) => Math.floor(a + (b - a + 1) * f());
  f.pick = arr => arr[Math.floor(f() * arr.length)];
  f.sign = () => f() < .5 ? -1 : 1;
  f.chance = p => f() < p;
  return f;
}
const rnd = makeRng(0xC1DE5);
const rr = (a, b) => a + (b - a) * rnd();

function h2(x, y, s) {
  let h = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = h2(xi, yi, s), b = h2(xi + 1, yi, s), c = h2(xi, yi + 1, s), d = h2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, s = 0, oct = 4) {
  let a = .5, f = 1, sum = 0, n = 0;
  for (let i = 0; i < oct; i++) { sum += a * vnoise(x * f, y * f, s + i * 17); n += a; a *= .5; f *= 2.03; }
  return sum / n;
}
function pnoise(x, y, per, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const m = k => ((k % per) + per) % per;
  const a = h2(m(xi), m(yi), s), b = h2(m(xi + 1), m(yi), s), c = h2(m(xi), m(yi + 1), s), d = h2(m(xi + 1), m(yi + 1), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function pfbm(x, y, per, s = 0, oct = 3) {
  let a = .5, f = 1, sum = 0, n = 0;
  for (let i = 0; i < oct; i++) { sum += a * pnoise(x * f, y * f, per * f, s + i * 31); n += a; a *= .5; f *= 2; }
  return sum / n;
}
function n1(t, s = 0) { return vnoise(t, s * 7.31, 91) * 2 - 1; }

const _tc = new THREE.Color();
function C(hex, mul = 1) { _tc.set(hex); return [_tc.r * mul, _tc.g * mul, _tc.b * mul]; }
function mixC(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
function mulC(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }

function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }
function swapRemove(arr, i) { const last = arr.pop(); if (i < arr.length) arr[i] = last; }

const HASH = (() => {
  const o = {};
  try {
    for (const kv of location.hash.replace(/^#/, '').split('&')) { if (!kv) continue; const [k, v] = kv.split('='); o[k] = v === undefined ? '1' : decodeURIComponent(v); }
  } catch (e) {}
  return o;
})();


const L_DIRT = 0, L_ROCK = 1, L_MASON = 2, L_WOOD = 3, L_COBBLE = 4, L_METAL = 5, L_SLATE = 6, L_CLOTH = 7, L_PLAIN = 8, L_BONE = 9, L_THATCH = 10;
const TEX_LAYERS = 11, TEX_N = 64;

function pnoise2(x, y, perX, perY, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const mx = k => ((k % perX) + perX) % perX, my = k => ((k % perY) + perY) % perY;
  const a = h2(mx(xi), my(yi), s), b = h2(mx(xi + 1), my(yi), s), c = h2(mx(xi), my(yi + 1), s), d = h2(mx(xi + 1), my(yi + 1), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function makeDetailTextures() {
  const N = TEX_N, data = new Uint8Array(N * N * 4 * TEX_LAYERS);
  const put = (layer, x, y, r, g, b, h) => {
    const i = ((layer * N + y) * N + x) * 4;
    data[i] = clamp(r * 127.5, 0, 255); data[i + 1] = clamp(g * 127.5, 0, 255); data[i + 2] = clamp(b * 127.5, 0, 255); data[i + 3] = clamp(h * 255, 0, 255);
  };
  const CG = 8, CS = N / CG, sites = [];
  for (let j = 0; j < CG; j++) for (let i = 0; i < CG; i++) sites.push([(i + .2 + .6 * h2(i, j, 11)) * CS, (j + .2 + .6 * h2(i, j, 12)) * CS, h2(i, j, 13), h2(i, j, 14)]);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    {
      const n = pfbm(x / 8, y / 8, 8, 1, 4), sp = h2(x, y, 3), n2 = pfbm(x / 16, y / 16, 4, 5, 2);
      let m = .78 + .34 * n + (n2 - .5) * .2, h = .35 + .35 * n;
      if (sp > .985) { m += .14; h += .4; } else if (sp < .03) { m -= .1; h -= .12; }
      put(L_DIRT, x, y, m * 1.02, m, m * .97, h);
    }
    {
      const n = pfbm(x / 8, y / 8, 8, 21, 4), n2 = pfbm(x / 16, y / 16, 4, 23, 3), n3 = pfbm(x / 16 + 9, y / 16 + 3, 4, 27, 3);
      const crack = (Math.abs(n2 - .5) < .022 || Math.abs(n3 - .52) < .016) ? 1 : 0;
      const strata = Math.sin((y + n2 * 26) * TAU / 16) * .05;
      const m = .74 + .42 * n + strata - crack * .34 + (h2(x, y, 29) - .5) * .08, h = .3 + .6 * n - crack * .4;
      put(L_ROCK, x, y, m, m, m * 1.03, h);
    }
    {
      const row = Math.floor(y / 8), ox = (row & 1) ? 8 : 0, bx = Math.floor((x + ox) / 16), lx = (x + ox) % 16, ly = y % 8;
      const id = h2(bx % 4, row, 31), id2 = h2(bx % 4, row, 32);
      const mortar = (ly === 0 || lx === 0);
      const n = pnoise2(x / 2, y / 2, 32, 32, 33) - .5;
      let m = .8 + .32 * id + n * .2, h = .66 + .2 * id2 + n * .15;
      if (id2 > .86) { m -= .12; h -= .22; }
      if (ly === 1 || lx === 1) { m += .09; }
      if (ly === 7 || lx === 15) { m -= .1; }
      let r = m * (1 + (id - .5) * .06), g = m, b = m * (1 - (id - .5) * .08);
      if (mortar) { r = g = b = .46 + n * .1; h = .12; }
      put(L_MASON, x, y, r, g, b, h);
    }
    {
      const pl = Math.floor(x / 8), lx = x % 8, id = h2(pl, 0, 41);
      const grain = pnoise2(x * 1.25, y / 7, 80, 9, 42 + pl), g2 = pnoise2(x * 2.5, y / 3, 160, 21, 44);
      let m = .8 + .28 * id + (grain - .5) * .34 + (g2 - .5) * .12, h = .55 + grain * .25;
      const joint = Math.floor(8 + id * 48);
      if (lx === 0 || y === joint) { m = .42; h = .1; }
      else if (lx === 1) m += .06; else if (lx === 7) m -= .08;
      if ((y === (joint + 3) % N || y === (joint + N - 3) % N) && (lx === 2 || lx === 6)) { m = .38; h = .8; }
      const knot = dist2(lx, y, 4, (joint + 29) % N); if (knot < 5 && id > .5) { m -= .2 * (1 - knot / 5); }
      put(L_WOOD, x, y, m * 1.03, m, m * .95, h);
    }
    {
      let d1 = 1e9, d2 = 1e9, s1 = null;
      for (const s of sites) {
        let dx = Math.abs(x + .5 - s[0]), dy = Math.abs(y + .5 - s[1]); if (dx > N / 2) dx = N - dx; if (dy > N / 2) dy = N - dy;
        const d = Math.sqrt(dx * dx * .85 + dy * dy * 1.15);
        if (d < d1) { d2 = d1; d1 = d; s1 = s; } else if (d < d2) d2 = d;
      }
      const edge = d2 - d1, n = pnoise2(x / 2, y / 2, 32, 32, 51) - .5;
      let m, h, r, g, b;
      if (edge < 1.15) { m = .36 + n * .1; h = .04; r = m * 1.04; g = m; b = m * .95; }
      else {
        const dome = smooth(1.15, 4.2, edge);
        m = .7 + .42 * s1[2] + n * .16 + dome * .1; h = .25 + .7 * dome + n * .1;
        const warm = (s1[3] - .5) * .12; r = m * (1 + warm); g = m; b = m * (1 - warm);
        if (s1[2] > .9) { r *= .8; g *= .8; b *= .82; h *= .7; }
      }
      put(L_COBBLE, x, y, r, g, b, h);
    }
    {
      const st = pnoise2(x / 3, y * 1.5, 21, 96, 61) - .5, rust = pfbm(x / 16, y / 16, 4, 63, 3), pit = h2(x, y, 65);
      let m = .92 + st * .22, r = m, g = m, b = m * 1.03, h = .5 + st * .12;
      if (rust > .58) { const k = smooth(.58, .72, rust); r = lerp(r, m * 1.05, k); g = lerp(g, m * .74, k); b = lerp(b, m * .55, k); h -= .08 * k; }
      if (pit < .03) { r *= .7; g *= .7; b *= .7; h -= .2; }
      if ((x % 16 === 2 || x % 16 === 13) && (y % 16 === 2 || y % 16 === 13)) { r *= 1.25; g *= 1.25; b *= 1.25; h = 1; }
      put(L_METAL, x, y, r, g, b, h);
    }
    {
      const row = Math.floor(y / 8), ox = (row & 1) ? 4 : 0, bx = Math.floor((x + ox) / 8), lx = (x + ox) % 8, ly = y % 8;
      const id = h2(bx % 8, row, 71), n = pnoise2(x / 2, y / 2, 32, 32, 73) - .5;
      let m = .78 + .34 * id + n * .14, h = .3 + .55 * (ly / 7);
      if (ly === 7) { m += .1; } if (ly === 0) { m -= .3; h = .1; } if (lx === 0) { m -= .2; h -= .2; }
      put(L_SLATE, x, y, m * .98, m, m * 1.05, h);
    }
    {
      const w = ((x + y) & 1) ? 1.05 : .95, n = pfbm(x / 16, y / 16, 4, 81, 3), st = pfbm(x / 8 + 3, y / 8, 8, 83, 2);
      let m = w * (.84 + .3 * n); if (st > .66) m *= .78;
      put(L_CLOTH, x, y, m, m, m, .5 + (w - 1) * .8);
    }
    { const n = pnoise2(x / 2, y / 2, 32, 32, 91) - .5; put(L_PLAIN, x, y, 1 + n * .07, 1 + n * .07, 1 + n * .07, .5 + n * .1); }
    {
      const st = pnoise2(x / 2, y / 6, 32, 11, 95) - .5, pit = h2(x, y, 97);
      let m = .96 + st * .2; if (pit < .04) m -= .22;
      put(L_BONE, x, y, m * 1.02, m, m * .94, .5 + st * .25);
    }
    {
      const st = pnoise2(x * 1.6, y / 5, 103, 13, 101), row = (y % 16);
      let m = .76 + .42 * st; if (row === 0) m -= .3; if (row === 1) m += .08;
      put(L_THATCH, x, y, m * 1.04, m, m * .88, .3 + st * .5 + (row / 16) * .2);
    }
  }
  const mk = (linear) => {
    const t = new THREE.DataArrayTexture(data, N, N, TEX_LAYERS);
    t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = linear ? THREE.LinearFilter : THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true; return t;
  };
  return { albedo: mk(false), height: mk(true) };
}

THREE.ShaderChunk.lights_pars_begin = THREE.ShaderChunk.lights_pars_begin.replace('max( pow( lightDistance, decayExponent ), 0.01 )', '( pow( lightDistance, decayExponent ) + 1.6 )');
THREE.ShaderChunk.lights_fragment_begin = THREE.ShaderChunk.lights_fragment_begin.split('RE_Direct( directLight,').join('if ( directLight.visible ) RE_Direct( directLight,');
const SH = {
  uTime: { value: 0 }, uTexA: { value: null }, uTexH: { value: null }, uBump: { value: 0.055 },
  uSky: { value: new THREE.Color(0.012, 0.022, 0.045) }, uWind: { value: 1 },
  uCover: { value: new THREE.Vector4(0, 0.55, 0.3, 0.5) }, uCoverCol: { value: new THREE.Vector3(1, 1, 1) }, uCoverP: { value: new THREE.Vector4(0.7, 0.6, 0.0, 0.0) },
  uWat: { value: new THREE.Vector4(0, 1, 1, 0) }, uWatA: { value: new THREE.Vector3(0.012, 0.02, 0.03) }, uWatB: { value: new THREE.Vector3(0.3, 0.4, 0.5) },
};

function litMaterial(kind, params = {}) {
  const mat = new THREE.MeshStandardMaterial(Object.assign({ vertexColors: kind !== 'water', roughness: 1, metalness: 0 }, params));
  const inst = kind === 'inst', water = kind === 'water', world = !inst && !water;
  mat.customProgramCacheKey = () => 'cw-' + kind;
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = SH.uTime; sh.uniforms.uTexA = SH.uTexA; sh.uniforms.uTexH = SH.uTexH; sh.uniforms.uBump = SH.uBump; sh.uniforms.uSky = SH.uSky; sh.uniforms.uWind = SH.uWind;
    sh.uniforms.uCover = SH.uCover; sh.uniforms.uCoverCol = SH.uCoverCol; sh.uniforms.uCoverP = SH.uCoverP; sh.uniforms.uWat = SH.uWat; sh.uniforms.uWatA = SH.uWatA; sh.uniforms.uWatB = SH.uWatB;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aSurf; varying vec4 vSurf; varying vec2 vTuv; uniform float uTime; uniform float uWind;
${world ? 'varying vec3 vWpos;' : ''}
${inst ? 'attribute float aFlash; varying float vFlash;' : ''}`)
      .replace('#include <project_vertex>', `#include <project_vertex>
${world ? 'vWpos = (modelMatrix * vec4(transformed, 1.0)).xyz;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vSurf = aSurf; vTuv = uv;
${inst ? 'vFlash = aFlash;' : ''}
${world ? `if (aSurf.z > 0.0) {
  float ph = uTime * 1.6 + position.x * 0.9 + position.z * 0.7;
  float g = sin(ph) * 0.6 + sin(ph * 2.3 + 1.7) * 0.4;
  transformed.x += g * 0.07 * aSurf.z * uWind; transformed.z += cos(ph * 0.8) * 0.05 * aSurf.z * uWind; transformed.y += sin(ph * 1.9) * 0.02 * aSurf.z * uWind;
}` : ''}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
precision highp sampler2DArray;
uniform sampler2DArray uTexA; uniform sampler2DArray uTexH; uniform float uBump; uniform float uTime; uniform vec3 uSky;
uniform vec4 uCover; uniform vec3 uCoverCol; uniform vec4 uCoverP; uniform vec4 uWat; uniform vec3 uWatA; uniform vec3 uWatB;
varying vec4 vSurf; varying vec2 vTuv;
${world ? 'varying vec3 vWpos;' : ''}
${inst ? 'varying float vFlash;' : ''}
vec3 cwBump(vec3 P, vec3 N, float dBx, float dBy, float sc) {
  vec3 dPdx = dFdx(P), dPdy = dFdy(P);
  vec3 R1 = cross(dPdy, N), R2 = cross(N, dPdx);
  float det = dot(dPdx, R1);
  vec3 grad = sign(det) * (dBx * R1 + dBy * R2);
  return normalize(abs(det) * N - sc * grad);
}
float cwH(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float cwN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(cwH(i), cwH(i + vec2(1.0, 0.0)), f.x), mix(cwH(i + vec2(0.0, 1.0)), cwH(i + vec2(1.0, 1.0)), f.x), f.y); }
float cwRipple(vec2 p, float t, float flow) {
  float a = cwN(vec2(p.x * 2.6, p.y * 1.3 - t * flow * 1.0));
  float b = cwN(vec2(p.x * 5.2 + 3.7, p.y * 2.6 - t * (0.15 + flow * 1.4)));
  float c = cwN(vec2(p.x * 13.0 - t * 0.12, p.y * 9.0 - t * (0.2 + flow * 2.1)));
  return a * 1.0 + b * 0.9 + c * 0.15;
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float cwL = floor(vSurf.x + 0.5);
${water ? `vec4 cwT = vec4(0.5);
float wMask = 0.0, wHeat = 0.0, wFlow = uTime * uWat.y;
float wn1 = cwN(vTuv * vec2(1.6, 0.8) + 3.0), wn2 = cwN(vTuv * vec2(5.0, 2.6) + 11.0);
diffuseColor.rgb = uWatA;
if (uWat.x > 0.5 && uWat.x < 1.5) {
  float frost = smoothstep(0.4, 0.74, wn1 * 0.65 + wn2 * 0.35);
  float ck = smoothstep(0.035, 0.0, abs(cwN(vTuv * vec2(2.3, 1.2) + 40.0) - 0.5)) + smoothstep(0.03, 0.0, abs(cwN(vTuv * vec2(1.2, 2.7) + 71.0) - 0.48));
  wMask = clamp(frost * 0.85 + ck * 0.7, 0.0, 1.0);
  diffuseColor.rgb = mix(uWatA * (0.7 + 0.6 * wn2), uWatB, wMask);
} else if (uWat.x > 1.5 && uWat.x < 2.5) {
  float t = wFlow * (0.16 + 0.34 * min(vSurf.z, 1.0));
  float c1 = cwN(vec2(vTuv.x * 2.1, vTuv.y * 1.1 - t)), c2 = cwN(vec2(vTuv.x * 4.6 + 7.0, vTuv.y * 2.4 - t * 1.7)), c3 = cwN(vec2(vTuv.x * 9.0 - 3.0, vTuv.y * 5.0 - t * 2.3));
  float ra = 1.0 - abs(2.0 * c1 - 1.0), rb = 1.0 - abs(2.0 * c2 - 1.0);
  float crack = max(pow(ra, 3.2), pow(rb, 4.4) * 0.8), pool = smoothstep(0.56, 0.74, c1 * 0.55 + c3 * 0.45);
  wHeat = clamp(crack * 0.85 + pool, 0.0, 1.0); wMask = 1.0 - smoothstep(0.38, 0.7, wHeat);
  diffuseColor.rgb = mix(uWatA, uWatB * (0.6 + 0.8 * c3), wMask);
} else if (uWat.x > 2.5) {
  wMask = smoothstep(0.56, 0.68, wn1 * 0.55 + wn2 * 0.45 + 0.12 * (1.0 - min(vSurf.z, 1.0))) * step(0.01, vSurf.z);
  diffuseColor.rgb = mix(uWatA, uWatB * (0.75 + 0.5 * wn2), wMask);
}` : 'vec4 cwT = texture(uTexA, vec3(vTuv, cwL)); diffuseColor.rgb *= cwT.rgb * 2.0;'}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = clamp(vSurf.y * (1.15 - 0.3 * cwT.a), 0.045, 1.0);
${water ? `if (uWat.x > 0.5 && uWat.x < 1.5) roughnessFactor = mix(0.09, 0.62, wMask);
else if (uWat.x > 1.5 && uWat.x < 2.5) roughnessFactor = mix(0.55, 0.96, wMask);
else if (uWat.x > 2.5) roughnessFactor = mix(roughnessFactor, 0.9, wMask);` : ''}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
${water ? `{
  float h0 = cwRipple(vTuv, wFlow, vSurf.z) + wMask * uWat.w;
  normal = cwBump(-vViewPosition, normal, dFdx(h0), dFdy(h0), (0.03 + 0.11 * min(vSurf.z, 1.0)) * uWat.z);
}` : `float cwH0 = texture(uTexH, vec3(vTuv, cwL)).a;
{
  vec2 cdx = dFdx(vTuv), cdy = dFdy(vTuv);
  float hx = texture(uTexH, vec3(vTuv + cdx, cwL)).a - cwH0;
  float hy = texture(uTexH, vec3(vTuv + cdy, cwL)).a - cwH0;
  normal = cwBump(-vViewPosition, normal, hx, hy, uBump);
}
${world ? `if (uCover.x > 0.001) {
  vec3 wn = inverseTransformDirection(normal, viewMatrix);
  float n1 = cwN(vWpos.xz * 0.8 + 17.0), n2 = cwN(vWpos.xz * 3.4 + vWpos.y * 1.3), nn = n1 * 0.62 + n2 * 0.38;
  float cv = smoothstep(uCover.y, uCover.y + 0.2, wn.y + (nn - 0.5) * uCover.z);
  if (cwL > 3.5 && cwL < 4.5) cv *= uCover.w * smoothstep(0.8, 0.25, cwH0 - (n1 - 0.5) * 0.9);
  cv *= uCover.x * (1.0 - clamp(vSurf.w * 40.0, 0.0, 1.0));
  diffuseColor.rgb = mix(diffuseColor.rgb, uCoverCol * (0.9 + 0.2 * n1), cv);
  roughnessFactor = mix(roughnessFactor, uCoverP.x, cv);
  normal = normalize(mix(normal, nonPerturbedNormal, cv * uCoverP.y));
  float ch = nn * uCoverP.z + sin(dot(vWpos.xz, vec2(5.1, 3.3)) + n1 * 7.0) * uCoverP.w;
  normal = cwBump(-vViewPosition, normal, dFdx(ch), dFdy(ch), cv);
}` : ''}`}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * vSurf.w * 6.0;
${water ? 'if (uWat.x > 1.5 && uWat.x < 2.5) totalEmissiveRadiance += mix(vec3(0.7, 0.07, 0.008), vec3(1.45, 0.42, 0.05), wHeat * wHeat) * (1.0 - wMask) + vec3(0.1, 0.012, 0.0) * wMask * (0.3 + wn2);' : ''}
${inst ? 'totalEmissiveRadiance += vec3(1.0, 0.8, 0.55) * vFlash * 0.55;' : ''}`)
      .replace('#include <opaque_fragment>', `${water ? 'outgoingLight += uSky * (0.4 + 4.0 * pow(1.0 - clamp(normal.z, 0.0, 1.0), 2.0)) * (1.5 - 0.6 * min(vSurf.z, 1.0)) * (1.0 - wMask * 0.8);' : ''}
#include <opaque_fragment>`);
  };
  return mat;
}

const ZERO3 = [0, 0, 0], WHITE = [1, 1, 1];
const GEO_CACHE = {};
function baseGeo(key, make) {
  let e = GEO_CACHE[key];
  if (!e) { let g = make(); if (g.index) g = g.toNonIndexed(); e = GEO_CACHE[key] = { pos: g.attributes.position.array, nrm: g.attributes.normal.array }; }
  return e;
}
const gBox = () => baseGeo('box', () => new THREE.BoxGeometry(1, 1, 1));
const gCyl = (n = 8, rt = 1, open = false) => baseGeo('cyl' + n + '_' + rt + (open ? 'o' : ''), () => new THREE.CylinderGeometry(rt, 1, 1, n, 1, open));
const gIco = (d = 1) => baseGeo('ico' + d, () => new THREE.IcosahedronGeometry(1, d));
const gSph = (w = 8, h = 6) => baseGeo('sph' + w + '_' + h, () => new THREE.SphereGeometry(1, w, h));
const gDome = (w = 8, h = 4) => baseGeo('dome' + w + '_' + h, () => new THREE.SphereGeometry(1, w, h, 0, TAU, 0, HPI));
const gOct = () => baseGeo('oct', () => new THREE.OctahedronGeometry(1, 0));
const gTorus = (n = 10, t = 0.2, m = 5) => baseGeo('tor' + n + '_' + t + '_' + m, () => new THREE.TorusGeometry(1, t, m, n));

const _sv = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], _sn = new THREE.Vector3(), _snv = new THREE.Vector3();
const _sq = new THREE.Quaternion(), _se = new THREE.Euler(), _sa = new THREE.Vector3(), _sb = new THREE.Vector3(), _ss = new THREE.Vector3(), _sm = new THREE.Matrix4(), _sp = new THREE.Vector3();
let soupRng = makeRng(777);

class Soup {
  constructor() { this.P = []; this.N = []; this.K = []; this.U = []; this.S = []; }
  get verts() { return this.P.length / 3; }
  clear() { this.P.length = this.N.length = this.K.length = this.U.length = this.S.length = 0; return this; }
  v(x, y, z, nx, ny, nz, r, g, b, u, w, layer, rough, sway = 0, emis = 0) {
    this.P.push(x, y, z); this.N.push(nx, ny, nz); this.K.push(r, g, b); this.U.push(u, w); this.S.push(layer, rough, sway, emis);
  }
  tri(a, b, c, col, layer, rough, o) {
    _sa.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); _sb.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]); _sn.crossVectors(_sa, _sb);
    const len = _sn.length(); if (len < 1e-10) return; _sn.multiplyScalar(1 / len);
    const ax = Math.abs(_sn.x), ay = Math.abs(_sn.y), az = Math.abs(_sn.z), mode = (ay >= ax && ay >= az) ? 0 : (ax >= az ? 1 : 2);
    const sw = o && o.sway || 0, em = o && o.emis || 0, uvs = o && o.uvs || 0.25;
    for (const p of [a, b, c]) {
      const u = mode === 0 ? p[0] : (mode === 1 ? p[2] : p[0]), w = mode === 0 ? p[2] : p[1];
      const cc = p.length > 3 ? p[3] : col;
      this.v(p[0], p[1], p[2], _sn.x, _sn.y, _sn.z, cc[0], cc[1], cc[2], u * uvs, w * uvs, layer, rough, sw, em);
    }
  }
  quad(a, b, c, d, col, layer, rough, o) { this.tri(a, b, c, col, layer, rough, o); this.tri(a, c, d, col, layer, rough, o); }
  add(src, o) {
    const sp = src.pos, sn = src.nrm, n = sp.length;
    let sx = 1, sy = 1, sz = 1; const s = o.s;
    if (s !== undefined) { if (typeof s === 'number') sx = sy = sz = s; else { sx = s[0]; sy = s[1]; sz = s[2]; } }
    const q = _sq; if (o.q) q.copy(o.q); else if (o.r) q.setFromEuler(_se.set(o.r[0], o.r[1], o.r[2], o.ro || 'XYZ')); else q.identity();
    const p = o.p || ZERO3, px = p[0], py = p[1], pz = p[2];
    const c = o.c || WHITE, jit = o.jit === undefined ? 0.07 : o.jit, k = 1 + (soupRng() * 2 - 1) * jit;
    const cr = c[0] * k, cg = c[1] * k, cb = c[2] * k;
    const layer = o.l === undefined ? L_PLAIN : o.l, rough = o.rough === undefined ? 0.92 : o.rough, sway = o.sway || 0, emis = o.emis || 0;
    const uvs = o.uvs === undefined ? 0.25 : o.uvs, uo = Math.floor(soupRng() * 64) / 16, vo = Math.floor(soupRng() * 64) / 16;
    const smoothN = !!o.smooth, deform = o.deform, grad = o.grad, cf = o.cf, swayf = o.swayf, c2 = o.c2;
    const P = this.P, N = this.N, K = this.K, U = this.U, S = this.S, start = P.length;
    for (let i = 0; i < n; i += 9) {
      for (let j = 0; j < 3; j++) { const v = _sv[j]; v.set(sp[i + j * 3] * sx, sp[i + j * 3 + 1] * sy, sp[i + j * 3 + 2] * sz); if (deform) deform(v); }
      _sa.subVectors(_sv[1], _sv[0]); _sb.subVectors(_sv[2], _sv[0]); _sn.crossVectors(_sa, _sb);
      const len = _sn.length(); if (len < 1e-12) continue; _sn.multiplyScalar(1 / len);
      const ax = Math.abs(_sn.x), ay = Math.abs(_sn.y), az = Math.abs(_sn.z), mode = (ay >= ax && ay >= az) ? 0 : (ax >= az ? 1 : 2);
      for (let j = 0; j < 3; j++) {
        const v = _sv[j];
        const u = mode === 0 ? v.x : (mode === 1 ? v.z : v.x), w = mode === 0 ? v.z : v.y;
        U.push(u * uvs + uo, w * uvs + vo);
        let g = 1; if (grad) g = lerp(grad[2], 1, smooth(grad[0], grad[1], v.y));
        if (cf) g *= cf(v);
        if (c2) { const t = c2[3](v); K.push(lerp(cr, c2[0], t) * g, lerp(cg, c2[1], t) * g, lerp(cb, c2[2], t) * g); }
        else K.push(cr * g, cg * g, cb * g);
        S.push(layer, rough, swayf ? swayf(v) : sway, emis);
        if (smoothN) _snv.set(sn[i + j * 3] / sx, sn[i + j * 3 + 1] / sy, sn[i + j * 3 + 2] / sz).normalize().applyQuaternion(q);
        else _snv.copy(_sn).applyQuaternion(q);
        N.push(_snv.x, _snv.y, _snv.z);
        v.applyQuaternion(q);
        P.push(v.x + px, v.y + py, v.z + pz);
      }
    }
    if (o.dbl) this._double(start);
    return this;
  }
  _double(start) {
    const P = this.P, N = this.N, K = this.K, U = this.U, S = this.S, end = P.length;
    for (let i = start; i < end; i += 9) {
      for (const j of [0, 2, 1]) {
        const a = i + j * 3, vi = a / 3;
        P.push(P[a], P[a + 1], P[a + 2]); N.push(-N[a], -N[a + 1], -N[a + 2]); K.push(K[a], K[a + 1], K[a + 2]);
        U.push(U[vi * 2], U[vi * 2 + 1]); S.push(S[vi * 4], S[vi * 4 + 1], S[vi * 4 + 2], S[vi * 4 + 3]);
      }
    }
  }
  box(w, h, d, x, y, z, c, o = {}) { o.s = [w, h, d]; o.p = [x, y, z]; o.c = c; return this.add(gBox(), o); }
  cyl(r, h, x, y, z, c, o = {}) { o.s = [r, h, o.rz === undefined ? r : o.rz]; o.p = [x, y, z]; o.c = c; return this.add(gCyl(o.n || 8, o.rt === undefined ? 1 : o.rt, o.open), o); }
  cone(r, h, x, y, z, c, o = {}) { o.s = [r, h, r]; o.p = [x, y, z]; o.c = c; return this.add(gCyl(o.n || 6, 0), o); }
  ico(r, x, y, z, c, o = {}) { o.s = o.sc ? [r * o.sc[0], r * o.sc[1], r * o.sc[2]] : r; o.p = [x, y, z]; o.c = c; return this.add(gIco(o.d === undefined ? 1 : o.d), o); }
  sph(r, x, y, z, c, o = {}) { o.s = o.sc ? [r * o.sc[0], r * o.sc[1], r * o.sc[2]] : r; o.p = [x, y, z]; o.c = c; if (o.smooth === undefined) o.smooth = true; return this.add(gSph(o.w || 8, o.h || 6), o); }
  rock(r, x, y, z, c, o = {}) {
    const sd = soupRng() * 100, f = 1.5 / r, sq = o.sq === undefined ? 0.75 : o.sq;
    o.deform = v => { const k = .72 + .56 * vnoise(v.x * f + v.y * f * .7 + sd, v.z * f - v.y * f * .6 + sd, 7); v.multiplyScalar(k); v.y *= sq; };
    if (o.l === undefined) o.l = L_ROCK; if (o.r === undefined) o.r = [soupRng() * .5, soupRng() * TAU, soupRng() * .5];
    o.s = r; o.p = [x, y, z]; o.c = c; return this.add(gIco(o.d === undefined ? 1 : o.d), o);
  }
  merge(o2, opt = {}) {
    const p = opt.p || ZERO3, s = opt.s === undefined ? 1 : opt.s, q = _sq;
    if (opt.q) q.copy(opt.q); else if (opt.r) q.setFromEuler(_se.set(opt.r[0], opt.r[1], opt.r[2])); else q.setFromEuler(_se.set(0, opt.ry || 0, 0));
    const tint = opt.tint, ao = opt.ao, nv = o2.P.length;
    const P = this.P, N = this.N, K = this.K;
    for (let i = 0; i < nv; i += 3) {
      const ly = o2.P[i + 1];
      _sp.set(o2.P[i] * s, ly * s, o2.P[i + 2] * s).applyQuaternion(q); P.push(_sp.x + p[0], _sp.y + p[1], _sp.z + p[2]);
      _sp.set(o2.N[i], o2.N[i + 1], o2.N[i + 2]).applyQuaternion(q); N.push(_sp.x, _sp.y, _sp.z);
      let g = 1; if (ao) g = lerp(ao[2], 1, smooth(ao[0], ao[1], ly));
      if (tint) K.push(o2.K[i] * tint[0] * g, o2.K[i + 1] * tint[1] * g, o2.K[i + 2] * tint[2] * g); else K.push(o2.K[i] * g, o2.K[i + 1] * g, o2.K[i + 2] * g);
    }
    for (let i = 0; i < o2.U.length; i++) this.U.push(o2.U[i]);
    for (let i = 0; i < o2.S.length; i++) this.S.push(o2.S[i]);
    return this;
  }
  mirrorXZ() {
    const P = this.P, N = this.N, K = this.K, U = this.U, S = this.S;
    for (let i = 0; i < P.length; i += 3) { let t = P[i]; P[i] = P[i + 2]; P[i + 2] = t; t = N[i]; N[i] = N[i + 2]; N[i + 2] = t; }
    const sw = (arr, a, b, n) => { for (let k = 0; k < n; k++) { const t = arr[a + k]; arr[a + k] = arr[b + k]; arr[b + k] = t; } };
    for (let v = 0; v < P.length / 3; v += 3) { sw(P, (v + 1) * 3, (v + 2) * 3, 3); sw(N, (v + 1) * 3, (v + 2) * 3, 3); sw(K, (v + 1) * 3, (v + 2) * 3, 3); sw(U, (v + 1) * 2, (v + 2) * 2, 2); sw(S, (v + 1) * 4, (v + 2) * 4, 4); }
    return this;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.P), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.N), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.K), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.U), 2));
    g.setAttribute('aSurf', new THREE.BufferAttribute(new Float32Array(this.S), 4));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

const COL = {
  stone: C(0x767b88), stoneD: C(0x4c505c), stoneL: C(0x9499a4), basalt: C(0x30323c), basaltL: C(0x454856),
  earth: C(0x54473c), earthD: C(0x352d27), grass: C(0x55583f), grassD: C(0x3f4231), moss: C(0x48553a),
  road: C(0x8a8176), roadD: C(0x5e574e), mud: C(0x43362b),
  wood: C(0x7a5c40), woodD: C(0x4e3a26), woodL: C(0x9a7a54), bark: C(0x3a3029), rope: C(0x8a7754),
  iron: C(0x3c4049), ironL: C(0x646b78), steel: C(0x8a93a2), brass: C(0x9a7b3a), bronze: C(0x7a5a34), gold: C(0xe2aa3c),
  bone: C(0xe0d7c0), boneD: C(0xa39a84), clothR: C(0x7c2c24), clothB: C(0x2f4c6c), clothD: C(0x2a2622), clothT: C(0x8a8068),
  slate: C(0x424a5a), thatch: C(0x8a7646), black: C(0x08090c), ember: C(0xff7a2a), crystal: C(0x7fc4ff),
  tuftA: C(0x55583f), tuftB: C(0x8a7646), snow: C(0xdfe8f4), ice: C(0x9fcfee), leaf: C(0x33492c), leafL: C(0x58703a), sand: C(0xb9976a), ash: C(0x4a4648),
  slime: C(0x4a6a44), slimeD: C(0x28402c), rat: C(0x51453c), ratD: C(0x372e28), bat: C(0x2e2a36), ogre: C(0x93a076), ogreD: C(0x63704e), leather: C(0x5a4030), skin: C(0xb98a6a),
};


const R = {
  renderer: null, scene: null, cam: null, canvas: null,
  dw: 2, dh: 2, iw: 2, ih: 2, maxIH: 620, maxPix: 690000, quality: 1, cssW: 2, cssH: 2, safe: [0, 0, 0, 0], lite: 0, opt: !HASH.noopt,
  viewH: 27, fitW: 45, fitTall: 33, shiftY: 0, px: 0.04,
  sub: new THREE.Vector2(), ditherOfs: new THREE.Vector2(),
  focusZ: 60, fade: 0, exposure: 1.0,
  rt: {}, mats: {}, fsScene: null, fsCam: null, fsMesh: null,
  NL: 12, lightPos: [], lightCol: [],
};

const FS_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const GLSL_BAYER = `
float bayer2(vec2 a){ a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a){ return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a){ return bayer4(0.5 * a) * 0.25 + bayer2(a); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
`;

function fsMat(frag, uniforms) {
  return new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, toneMapped: false });
}

function initRenderer() {
  const canvas = R.canvas = document.getElementById('gl');
  const r = R.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance' });
  r.setPixelRatio(1);
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
  r.toneMapping = THREE.NoToneMapping;
  r.setClearColor(new THREE.Color(0.0035, 0.005, 0.011), 1);
  r.info.autoReset = false;
  R.scene = new THREE.Scene();
  R.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 220);
  R.scene.add(R.cam);
  for (let i = 0; i < R.NL; i++) { R.lightPos.push(new THREE.Vector3()); R.lightCol.push(new THREE.Vector3()); }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
  R.fsScene = new THREE.Scene(); R.fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  R.fsMesh = new THREE.Mesh(g, null); R.fsMesh.frustumCulled = false; R.fsScene.add(R.fsMesh);

  const M = R.mats;
  M.atmo = fsMat(`
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor; uniform sampler2D tDepth;
uniform mat4 uInvVP; uniform vec3 uCamDir; uniform vec2 uPx; uniform float uTime;
uniform vec3 uLightPos[${R.NL}]; uniform vec3 uLightCol[${R.NL}];
uniform vec3 uMistAmb; uniform vec4 uMist;
uniform vec3 uAO;
uniform vec2 uDither; uniform vec2 uWind;
${GLSL_BAYER}
vec3 wpos(vec2 uv, float d){ vec4 p = uInvVP * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return p.xyz / p.w; }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y); }
void main(){
  vec3 col = texture2D(tColor, vUv).rgb;
  float d = texture2D(tDepth, vUv).x;
  if (d < 0.9999) {
    vec3 P = wpos(vUv, d);
    float dr = texture2D(tDepth, vUv + vec2(uPx.x, 0.0)).x, dl = texture2D(tDepth, vUv - vec2(uPx.x, 0.0)).x;
    float du = texture2D(tDepth, vUv + vec2(0.0, uPx.y)).x, dd = texture2D(tDepth, vUv - vec2(0.0, uPx.y)).x;
    vec3 ddx = abs(dr - d) < abs(d - dl) ? wpos(vUv + vec2(uPx.x, 0.0), dr) - P : P - wpos(vUv - vec2(uPx.x, 0.0), dl);
    vec3 ddy = abs(du - d) < abs(d - dd) ? wpos(vUv + vec2(0.0, uPx.y), du) - P : P - wpos(vUv - vec2(0.0, uPx.y), dd);
    vec3 N = normalize(cross(ddx, ddy)); if (dot(N, uCamDir) > 0.0) N = -N;
    float occ = 0.0, ang = bayer4(gl_FragCoord.xy + uDither) * 6.2831853;
    for (int i = 0; i < 10; i++) {
      float fi = (float(i) + 0.5) / 10.0, a = ang + float(i) * 2.39996;
      vec2 suv = vUv + vec2(cos(a), sin(a)) * uAO.y * sqrt(fi) * uPx;
      vec3 V = wpos(suv, texture2D(tDepth, suv).x) - P;
      float vv = dot(V, V);
      occ += max(0.0, dot(V, N) - 0.035) / (vv + 0.03) * step(vv, uAO.z);
    }
    float ao = clamp(1.0 - occ * uAO.x * 0.1, 0.0, 1.0);
    col *= ao;
    float n = vn(P.xz * 0.16 + uWind) * 0.65 + vn(P.xz * 0.47 - uWind * 1.7) * 0.35;
    float tau = min(uMist.z * exp(-(max(P.y, -1.0) - uMist.x) / uMist.y), 1.25) * smoothstep(0.34, 0.86, n) * smoothstep(-2.4, -1.1, P.y);
    float f = 1.0 - exp(-tau);
    vec3 L = uMistAmb; vec3 Pm = P + vec3(0.0, 0.35, 0.0);
    for (int i = 0; i < ${R.NL}; i++) { vec3 dv = uLightPos[i] - Pm; L += uLightCol[i] / (dot(dv, dv) + 2.0); }
    col = mix(col, L * uMist.w, f);
  }
  gl_FragColor = vec4(col, 1.0);
}`, {
    tColor: { value: null }, tDepth: { value: null }, uInvVP: { value: new THREE.Matrix4() }, uCamDir: { value: new THREE.Vector3() }, uPx: { value: new THREE.Vector2() }, uTime: SH.uTime,
    uLightPos: { value: R.lightPos }, uLightCol: { value: R.lightCol }, uMistAmb: { value: new THREE.Vector3(0.05, 0.08, 0.14) }, uMist: { value: new THREE.Vector4(-0.3, 0.42, 0.75, 0.1) },
    uAO: { value: new THREE.Vector3(1.0, 18, 0.7) }, uDither: { value: R.ditherOfs }, uWind: { value: new THREE.Vector2() },
  });

  M.dof = fsMat(`
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 uPx;
uniform vec4 uDof; uniform vec4 uNear;
uniform vec2 uDither;
${GLSL_BAYER}
float cocAt(float d){ float z = d - uDof.x; return z > 0.0 ? clamp((z - uDof.y) / uDof.z, 0.0, 1.0) * uDof.w : clamp((-z - uNear.x) / uNear.y, 0.0, 1.0) * uDof.w * uNear.z; }
void main(){
  float dc = texture2D(tDepth, vUv).x, cc = cocAt(dc);
  vec3 col = texture2D(tColor, vUv).rgb; float tot = 1.0;
  if (cc < uNear.w) {
    float near = 0.0;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.7853982; vec2 o = vec2(cos(a), sin(a)) * uPx * uDof.w * (mod(float(i), 2.0) < 0.5 ? 0.95 : 0.5);
      float sd = texture2D(tDepth, vUv + o).x; if (sd < dc) near = max(near, cocAt(sd));
    }
    if (near < 0.5) { gl_FragColor = vec4(col, 1.0); return; }
  }
  float rad = 0.75, ang = bayer4(gl_FragCoord.xy + uDither) * 6.2831853;
  for (int i = 0; i < 40; i++) {
    ang += 2.39996323;
    vec2 tc = vUv + vec2(cos(ang), sin(ang)) * uPx * rad;
    float sd = texture2D(tDepth, tc).x, sc = cocAt(sd);
    if (sd > dc) sc = clamp(sc, 0.0, cc * 2.0);
    float m = smoothstep(rad - 0.5, rad + 0.5, sc);
    col += mix(col / tot, texture2D(tColor, tc).rgb, m); tot += 1.0;
    rad += 1.35 / rad; if (rad > uDof.w) break;
  }
  gl_FragColor = vec4(col / tot, 1.0);
}`, { tColor: { value: null }, tDepth: { value: null }, uPx: { value: new THREE.Vector2() }, uDof: { value: new THREE.Vector4(0.3, 0.02, 0.06, 9) }, uNear: { value: new THREE.Vector4(0.05, 0.04, 0.5, 0.25) }, uDither: { value: R.ditherOfs } });

  M.bright = fsMat(`
precision highp float; varying vec2 vUv; uniform sampler2D tColor; uniform vec2 uPx; uniform vec2 uThr;
void main(){
  vec3 c = texture2D(tColor, vUv + uPx * vec2(-0.5, -0.5)).rgb + texture2D(tColor, vUv + uPx * vec2(0.5, -0.5)).rgb + texture2D(tColor, vUv + uPx * vec2(-0.5, 0.5)).rgb + texture2D(tColor, vUv + uPx * vec2(0.5, 0.5)).rgb;
  c *= 0.25; float l = max(c.r, max(c.g, c.b));
  c *= smoothstep(uThr.x, uThr.x + uThr.y, l);
  gl_FragColor = vec4(min(c, vec3(24.0)), 1.0);
}`, { tColor: { value: null }, uPx: { value: new THREE.Vector2() }, uThr: { value: new THREE.Vector2(1.1, 1.6) } });
  M.blur = fsMat(`
precision highp float; varying vec2 vUv; uniform sampler2D tColor; uniform vec2 uDir;
void main(){
  vec3 c = texture2D(tColor, vUv).rgb * 0.227027;
  c += (texture2D(tColor, vUv + uDir * 1.3846).rgb + texture2D(tColor, vUv - uDir * 1.3846).rgb) * 0.316216;
  c += (texture2D(tColor, vUv + uDir * 3.2308).rgb + texture2D(tColor, vUv - uDir * 3.2308).rgb) * 0.070270;
  gl_FragColor = vec4(c, 1.0);
}`, { tColor: { value: null }, uDir: { value: new THREE.Vector2() } });

  M.comp = fsMat(`
precision highp float; varying vec2 vUv;
uniform sampler2D tColor; uniform sampler2D tBloomA; uniform sampler2D tBloomB;
uniform vec4 uGrade;
uniform vec3 uBloom;
uniform vec3 uLift; uniform vec2 uDither; uniform vec2 uRes;
${GLSL_BAYER}
vec3 filmic(vec3 x){ x = max(x, 0.0); return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main(){
  vec3 c = texture2D(tColor, vUv).rgb;
  c += texture2D(tBloomA, vUv).rgb * uBloom.x + texture2D(tBloomB, vUv).rgb * uBloom.y;
  c *= uGrade.x;
  vec2 q = (vUv - 0.5) * vec2(1.0, 0.92);
  float vig = smoothstep(0.9, 0.3, length(q) * 1.25);
  c *= mix(1.0 - uGrade.z, 1.0, vig);
  c = filmic(c);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uGrade.y);
  c += uLift * (1.0 - smoothstep(0.0, 0.3, l)) * mix(0.55, 1.0, vig);
  c = pow(c, vec3(1.0 / 2.2)) * uGrade.w;
  float b = bayer8(gl_FragCoord.xy + uDither);
  c = floor(c * uBloom.z + b) / uBloom.z;
  gl_FragColor = vec4(c, 1.0);
}`, {
    tColor: { value: null }, tBloomA: { value: null }, tBloomB: { value: null },
    uGrade: { value: new THREE.Vector4(1.0, 0.92, 0.55, 1.0) }, uBloom: { value: new THREE.Vector3(0.35, 0.5, 28) },
    uLift: { value: new THREE.Vector3(0.010, 0.016, 0.030) }, uDither: { value: R.ditherOfs }, uRes: { value: new THREE.Vector2() },
  });

  M.up = fsMat(`
precision highp float; varying vec2 vUv;
uniform sampler2D tColor; uniform vec2 uTex; uniform vec2 uOut; uniform vec2 uSub; uniform float uGrain; uniform float uSeed;
${GLSL_BAYER}
void main(){
  vec2 texel = vUv * uTex + uSub, scale = max(uOut / uTex, vec2(1.0));
  vec2 tf = floor(texel), f = texel - tf, region = 0.5 - 0.5 / scale, cen = f - 0.5;
  vec2 off = (cen - clamp(cen, -region, region)) * scale + 0.5;
  vec3 c = texture2D(tColor, (tf + off) / uTex).rgb;
  float g = hash12(gl_FragCoord.xy + uSeed) - 0.5;
  c += g * uGrain * (0.35 + 0.65 * (1.0 - dot(c, vec3(0.333))));
  gl_FragColor = vec4(c, 1.0);
}`, { tColor: { value: null }, uTex: { value: new THREE.Vector2() }, uOut: { value: new THREE.Vector2() }, uSub: { value: R.sub }, uGrain: { value: 0.035 }, uSeed: { value: 0 } });
}

function resizeRenderer() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const dw = Math.max(8, Math.floor(window.innerWidth * dpr)), dh = Math.max(8, Math.floor(window.innerHeight * dpr));
  R.dw = dw; R.dh = dh; R.dpr = dpr; R.cssW = dw / dpr; R.cssH = dh / dpr;
  { const el = document.getElementById('safe'), cs = el ? getComputedStyle(el) : null, v = k => cs ? Math.round((parseFloat(cs[k]) || 0) * dpr) : 0; R.safe = [v('paddingLeft'), v('paddingTop'), v('paddingRight'), v('paddingBottom')]; }
  R.renderer.setSize(dw, dh, false);
  const texel = Math.max(2, Math.sqrt(dw * dh / R.maxPix), Math.min(dw, dh) / R.maxIH);
  let ih = Math.round(dh / texel * R.quality);
  ih = Math.max(ih, Math.min(dh, 240));
  let iw = Math.max(8, Math.round(dw * ih / dh));
  if (iw > 1500) { ih = Math.round(ih * 1500 / iw); iw = 1500; }
  R.iw = iw; R.ih = ih;
  for (const k in R.rt) { R.rt[k].dispose(); if (R.rt[k].depthTexture) R.rt[k].depthTexture.dispose(); }
  const mk = (w, h, type, filter, depth) => {
    const t = new THREE.WebGLRenderTarget(w, h, { type, format: THREE.RGBAFormat, minFilter: filter, magFilter: filter, depthBuffer: !!depth, stencilBuffer: false, generateMipmaps: false });
    if (depth) { t.depthTexture = new THREE.DepthTexture(w, h); t.depthTexture.type = THREE.UnsignedIntType; }
    return t;
  };
  const HF = THREE.HalfFloatType, NE = THREE.NearestFilter, LI = THREE.LinearFilter;
  R.rt.scene = mk(iw, ih, HF, NE, true);
  R.rt.atmo = mk(iw, ih, HF, NE, false);
  R.rt.dof = mk(iw, ih, HF, LI, false);
  const bw = Math.max(4, iw >> 1), bh = Math.max(4, ih >> 1), cw = Math.max(2, iw >> 2), ch = Math.max(2, ih >> 2);
  R.rt.bA = mk(bw, bh, HF, LI, false); R.rt.bA2 = mk(bw, bh, HF, LI, false);
  R.rt.bB = mk(cw, ch, HF, LI, false); R.rt.bB2 = mk(cw, ch, HF, LI, false);
  R.rt.final = mk(iw, ih, THREE.UnsignedByteType, LI, false);
  const hud = document.getElementById('hud'); hud.width = dw; hud.height = dh;
}

function fsPass(mat, target) {
  R.fsMesh.material = mat; R.renderer.setRenderTarget(target); R.renderer.render(R.fsScene, R.fsCam);
}

const _ivp = new THREE.Matrix4();
function renderFrame() {
  const r = R.renderer, M = R.mats, T = R.rt, cam = R.cam;
  r.info.reset();
  scheduleShadows(G.phase === 'crumble' || G.phase === 'rise');
  r.setRenderTarget(T.scene); r.render(R.scene, cam);
  const px = M.atmo.uniforms.uPx.value.set(1 / R.iw, 1 / R.ih);
  let u = M.atmo.uniforms;
  u.tColor.value = T.scene.texture; u.tDepth.value = T.scene.depthTexture;
  _ivp.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).invert(); u.uInvVP.value.copy(_ivp);
  cam.getWorldDirection(u.uCamDir.value);
  u.uAO.value.y = 0.85 / R.px;
  u.uWind.value.set(SH.uTime.value * 0.05, SH.uTime.value * 0.021);
  fsPass(M.atmo, T.atmo);
  u = M.dof.uniforms; u.tColor.value = T.atmo.texture; u.tDepth.value = T.scene.depthTexture; u.uPx.value.copy(px);
  const zr = cam.far - cam.near;
  const dsc = R.dofScale || 1;
  u.uDof.value.set((R.focusZ - cam.near) / zr, 3.2 * dsc / zr, 11.5 * dsc / zr, HASH.nodof || R.lite ? 0.6 : Math.max(2, Math.min(R.ih, R.iw * 1.6) * 0.0145));
  const nd = R.dofD || 20;
  u.uNear.value.set(Math.max(4 * dsc, 0.55 * nd) / zr, Math.max(6, nd) / zr, 0.6, R.opt ? 0.25 : -1);
  fsPass(M.dof, T.dof);
  u = M.bright.uniforms; u.tColor.value = T.dof.texture; u.uPx.value.copy(px); fsPass(M.bright, T.bA);
  u = M.blur.uniforms;
  u.tColor.value = T.bA.texture; u.uDir.value.set(1 / T.bA.width, 0); fsPass(M.blur, T.bA2);
  u.tColor.value = T.bA2.texture; u.uDir.value.set(0, 1 / T.bA.height); fsPass(M.blur, T.bA);
  u.tColor.value = T.bA.texture; u.uDir.value.set(1 / T.bB.width, 0); fsPass(M.blur, T.bB2);
  u.tColor.value = T.bB2.texture; u.uDir.value.set(0, 1 / T.bB.height); fsPass(M.blur, T.bB);
  u.tColor.value = T.bB.texture; u.uDir.value.set(1.6 / T.bB.width, 0); fsPass(M.blur, T.bB2);
  u.tColor.value = T.bB2.texture; u.uDir.value.set(0, 1.6 / T.bB.height); fsPass(M.blur, T.bB);
  u = M.comp.uniforms; u.tColor.value = T.dof.texture; u.tBloomA.value = T.bA.texture; u.tBloomB.value = T.bB.texture;
  u.uGrade.value.x = R.exposure; u.uGrade.value.w = R.fade; u.uRes.value.set(R.iw, R.ih);
  fsPass(M.comp, T.final);
  u = M.up.uniforms; u.tColor.value = T.final.texture; u.uTex.value.set(R.iw, R.ih); u.uOut.value.set(R.dw, R.dh); u.uSeed.value = (SH.uTime.value * 60 % 1000) * 7.13;
  fsPass(M.up, null);
}


const COL0 = Object.assign({}, COL);
const BIOMES = [
  {
    key: 'ashen', name: 'Ashen Pass', col: {},
    strata: [0x8f8474, 0x3c3f4c, 0x66564a, 0x767a86, 0x70503f, 0x4c4f5c, 0x9a8e7c, 0x55483e],
    hemi: [0x6d83bd, 0x1c1f2a, 1.15], moon: [0xa9c0f6, 1.55], fill: [0x4a5f96, .3], moonPos: [14, 44, -34],
    clear: [.0035, .005, .011], mistAmb: [.05, .08, .14], mist: [-.3, .42, .75, .1], sky: [.012, .022, .045], lift: [.010, .016, .030], sat: .92, expo: 1, sprAmb: [.05, .065, .1],
    cover: [0, .55, .3, .5], coverCol: [1, 1, 1], coverP: [.7, .6, 0, 0],
    wat: [0, 1, 1, 0], watA: [.012, .02, .03], watB: [.3, .4, .5], fall: [0, 1, 1, 0], fallA: [.022, .034, .054], fallB: [.2, .27, .38], spray: 'water',
    relief: [1.7, .5, 1, 0], puddles: 11, ponds: 1, sway: 1, wind: 1,
    wx: { n: [.05, 0], velA: [.35, -.12, .18], swayA: [.5, .5], sizeA: [.03, .055], colA: [.75, .8, .95, 1], alA: [.5, 0, 0], yA: [-1, 9], velB: [0, 0, 0], swayB: [0, 0], sizeB: [.05, .05], colB: [1, 1, 1, 1], alB: [0, 0, 0], yB: [0, 1], amb: [.1, .14, .22] },
    mobs: { ghoul: 1.6, wraith: 1.6, necro: 1.5 }, early: { wraith: 3, necro: 5 }, boss: ['giant', 'ogre'], tints: { wisp: [.75, .6, 1.3] }, wispHex: 0xb090ff,
    trees: [['tree', 13, 2.6, 4.6]], stumps: 6, rocks: 70, tufts: 320, webs: 4,
  },
  {
    key: 'frost', name: 'Frostfall',
    col: { stone: 0x6f7b90, stoneD: 0x454e60, stoneL: 0x9aa7b8, earth: 0x4b4a50, earthD: 0x2f3038, grass: 0x5a6068, grassD: 0x40454e, moss: 0x55606a, road: 0x7a808c, roadD: 0x555a66, mud: 0x3a3e48, bark: 0x2e2a2a, tuftA: 0x6f7a80, tuftB: 0xa9b4bc, leaf: 0x1d382f, leafL: 0x2c4f42 },
    strata: [0x7d8aa0, 0x3a4254, 0x5d6678, 0x9fb4c8, 0x4b5468, 0x6a7890, 0xb8cadb, 0x475062],
    hemi: [0x86a8e0, 0x323c50, 1.1], moon: [0xc6dcff, 1.38], fill: [0x5f7fb4, .28], moonPos: [16, 42, -34],
    clear: [.0045, .0075, .015], mistAmb: [.1, .14, .21], mist: [-.3, .5, .7, .12], sky: [.03, .05, .085], lift: [.012, .02, .036], sat: .9, expo: .86, sprAmb: [.1, .125, .17],
    cover: [1, .5, .34, .8], coverCol: [.5, .56, .66], coverP: [.74, .85, .32, 0],
    wat: [1, 0, .3, .35], watA: [.03, .075, .12], watB: [.4, .48, .58], fall: [1, 0, .96, 0], fallA: [.1, .17, .27], fallB: [.46, .58, .72], spray: 'none',
    relief: [1.5, .4, 1.15, 0], puddles: 8, ponds: 2, sway: .8, wind: 1.25, beacon: .8,
    wx: { n: [.68, .16], velA: [.55, -1.5, .3], swayA: [.28, 1.1], sizeA: [.055, .1], colA: [1, 1.05, 1.15, 1], alA: [.95, 0, .12], yA: [-3, 15], velB: [2.6, -1.1, 1.3], swayB: [.5, 1.6], sizeB: [.035, .06], colB: [.95, 1, 1.1, 1], alB: [.6, 0, .5], yB: [-2, 9], amb: [.4, .48, .62] },
    mobs: { wolf: 2.4, golem: 1.8, wraith: 1.3, toad: 0, wisp: .5, slime: .6 }, early: { wolf: 2, golem: 6 }, boss: ['jotun'], tints: { wolf: [1.9, 2.0, 2.2], golem: [.8, 1.05, 1.5], wisp: [.5, .9, 1.5], gargoyle: [.9, 1.1, 1.4], toad: [.8, 1.1, 1.4], brute: [1.3, 1.25, 3.0] }, wispHex: 0x80c0ff,
    trees: [['pine', 17, 2.8, 5.4], ['tree', 4, 2.6, 4.2]], stumps: 4, rocks: 52, tufts: 110, webs: 0,
  },
  {
    key: 'fen', name: 'Mirefen',
    col: { stone: 0x5c6858, stoneD: 0x384234, stoneL: 0x84907a, earth: 0x3b3a28, earthD: 0x24261a, grass: 0x40582c, grassD: 0x2c3e22, moss: 0x4c682e, road: 0x6c6a56, roadD: 0x48483a, mud: 0x2a281c, bark: 0x2c2820, tuftA: 0x486a30, tuftB: 0x7a8a40, leaf: 0x2a4626, leafL: 0x4c6c34 },
    strata: [0x5a5a40, 0x2c3226, 0x4a4030, 0x66705a, 0x3a3020, 0x44503a, 0x777a5c, 0x33382a],
    hemi: [0x4f9482, 0x1a2218, 1.05], moon: [0xa6e6c4, 1.3], fill: [0x2f6f66, .3], moonPos: [10, 46, -32],
    clear: [.003, .007, .006], mistAmb: [.035, .1, .075], mist: [-.1, .62, 1.1, .12], sky: [.018, .05, .036], lift: [.008, .02, .016], sat: .94, expo: 1.02, sprAmb: [.04, .08, .065],
    cover: [.85, .8, 1.1, .55], coverCol: [.075, .125, .05], coverP: [.92, .3, .4, 0],
    wat: [3, .3, .55, 0], watA: [.012, .026, .012], watB: [.1, .2, .045], fall: [0, .8, .9, 0], fallA: [.016, .034, .018], fallB: [.17, .27, .18], spray: 'water',
    relief: [1.0, .3, .7, 0], puddles: 15, ponds: 4, sway: .6, wind: .7,
    wx: { n: [.045, .09], velA: [.12, .02, .08], swayA: [1.3, .45], sizeA: [.05, .085], colA: [1.3, 1.9, .4, 0], alA: [1, 1.3, 0], yA: [.3, 3.4], velB: [.2, -.07, .12], swayB: [.6, .4], sizeB: [.03, .05], colB: [.7, .95, .7, 1], alB: [.5, 0, 0], yB: [-1, 7], amb: [.09, .2, .15] },
    mobs: { toad: 3.5, wisp: 2.4, spider: 2, brood: 2, slime: 1.6, mummy: 0, bomber: .5 }, early: { toad: 2, wisp: 3, brood: 6 }, boss: ['queen'], tints: { golem: [.75, 1.0, .6], wisp: [.5, 1.4, .7], wolf: [.7, .75, .6], gargoyle: [.8, 1, .8] }, wispHex: 0x70ffa0,
    trees: [['willow', 9, 3.0, 4.6], ['tree', 5, 2.6, 4.4]], stumps: 8, rocks: 42, tufts: 420, webs: 3,
  },
  {
    key: 'ember', name: 'Emberscar',
    col: { stone: 0x403c42, stoneD: 0x242228, stoneL: 0x5e5a62, earth: 0x2e2728, earthD: 0x1c1819, grass: 0x3a2f2c, grassD: 0x261e1c, moss: 0x3a3230, road: 0x5e5652, roadD: 0x3c3634, mud: 0x1e1716, bark: 0x15110f, tuftA: 0x3a2c24, tuftB: 0x6a4a30 },
    strata: [0x3a363c, 0x1c1a20, 0x5a2a22, 0x2a262c, 0x6e3a24, 0x242026, 0x4a4650, 0x301a18],
    hemi: [0x5c5470, 0x2c140e, 1.18], moon: [0xc0b0d0, 1.32], fill: [0xd04a20, .2], moonPos: [18, 40, -32],
    clear: [.008, .004, .006], mistAmb: [.09, .05, .05], mist: [-.3, .5, .9, .1], sky: [.02, .006, .002], lift: [.02, .011, .012], sat: .96, expo: 1, sprAmb: [.09, .05, .04],
    cover: [.8, .74, 1.0, .6], coverCol: [.1, .092, .1], coverP: [.97, .4, .4, 0],
    wat: [2, 1, 1.5, .5], watA: [.22, .02, 0], watB: [.03, .026, .03], fall: [2, .45, 1.2, 0], fallA: [2.1, .56, .07], fallB: [.2, .02, .008], spray: 'lava',
    relief: [1.9, .7, 1.1, 0], puddles: 0, ponds: 2, sway: .7, wind: .9, bankGlow: 1, vein: 1,
    wx: { n: [.26, .12], velA: [.3, -.42, .16], swayA: [.5, .7], sizeA: [.035, .07], colA: [.3, .28, .3, 1], alA: [.85, 0, 0], yA: [-3, 14], velB: [.2, .85, .12], swayB: [.7, .9], sizeB: [.03, .05], colB: [2.6, .9, .14, 0], alB: [1, 2.2, .3], yB: [-2, 10], amb: [.5, .3, .26] },
    mobs: { bomber: 2.4, gargoyle: 2, golem: 1.8, toad: 0, slime: .5, wisp: 1.4 }, early: { bomber: 2, gargoyle: 4, golem: 6 }, boss: ['colossus'], tints: { golem: [1.5, .5, .26], wolf: [.75, .45, .4], wisp: [1.5, .6, .2], gargoyle: [1.2, .7, .6], toad: [1.2, .7, .5] }, wispHex: 0xff8030,
    trees: [['charred', 11, 2.6, 4.4]], stumps: 4, rocks: 80, tufts: 40, webs: 0,
  },
  {
    key: 'dunes', name: 'Duskmesa',
    col: { stone: 0xb08e6c, stoneD: 0x7a5c48, stoneL: 0xd4b48c, earth: 0xa88c66, earthD: 0x7c6448, grass: 0xbca27a, grassD: 0x927856, moss: 0x7a7444, road: 0xa89478, roadD: 0x786652, mud: 0x64503a, bark: 0x4c3a28, tuftA: 0x8a8048, tuftB: 0xc0a860, leaf: 0x38582e, leafL: 0x66863e },
    strata: [0xb8845c, 0x8e5a40, 0xd6b080, 0x744a38, 0xc89866, 0x9c6a4c, 0xe4cca0, 0x805640],
    hemi: [0x6a6fc0, 0x3c3040, 1.1], moon: [0xd6c8ff, 1.5], fill: [0x2f8f9a, .34], moonPos: [26, 24, -36],
    clear: [.006, .005, .014], mistAmb: [.07, .07, .13], mist: [-.3, .4, .5, .1], sky: [.03, .03, .06], lift: [.014, .012, .03], sat: .95, expo: .9, sprAmb: [.08, .075, .11],
    cover: [.9, .76, .9, .6], coverCol: [.42, .33, .22], coverP: [.95, .5, .25, .05],
    wat: [0, 1, 1, 0], watA: [.008, .04, .045], watB: [.3, .4, .4], fall: [0, 1, 1, 0], fallA: [.02, .06, .07], fallB: [.24, .36, .38], spray: 'water',
    relief: [1.4, .25, .8, .55], puddles: 0, ponds: 2, sway: 1.3, wind: 1.2, beacon: .62,
    wx: { n: [.1, .22], velA: [.5, -.05, .25], swayA: [.6, .5], sizeA: [.03, .05], colA: [.95, .78, .6, 1], alA: [.5, 0, 0], yA: [-1, 8], velB: [4.2, -.1, 1.9], swayB: [.25, 1.2], sizeB: [.025, .045], colB: [.9, .72, .55, 1], alB: [.42, 0, .9], yB: [-.5, 4.5], amb: [.3, .22, .3] },
    mobs: { mummy: 3, scarab: 2.4, spider: .6, bomber: 1.3, ghoul: 1.3, toad: 0, slime: .4 }, early: { mummy: 4, scarab: 2 }, boss: ['king'], tints: { golem: [1.5, 1.1, .72], wolf: [1.5, 1.2, .8], wisp: [1.4, 1.0, .4], gargoyle: [1.5, 1.2, .9], toad: [1.3, 1.1, .7] }, wispHex: 0xffc060,
    trees: [['palm', 9, 3.0, 4.6], ['tree', 2, 2.4, 3.4]], stumps: 2, rocks: 44, tufts: 150, webs: 0,
  },
];
const BIOME = { start: 0 };
function biomeFor(index) { return BIOMES[((BIOME.start + index) % BIOMES.length + BIOMES.length) % BIOMES.length]; }
function applyBiomePalette(b) { Object.assign(COL, COL0); for (const k in b.col) COL[k] = C(b.col[k]); }

const LOOK = { cur: null, to: null, bio: null };
function lookOf(b) {
  return { hs: C(b.hemi[0]), hg: C(b.hemi[1]), hi: [b.hemi[2]], mc: C(b.moon[0]), mi: [b.moon[1]], fc: C(b.fill[0]), fi: [b.fill[1]], clear: b.clear.slice(), mAmb: b.mistAmb.slice(), mist: b.mist.slice(), sky: b.sky.slice(), lift: b.lift.slice(), grade: [b.sat, b.expo], amb: b.sprAmb.slice(), wamb: b.wx.amb.slice() };
}
const _lc = new THREE.Color();
function applyLook(L) {
  LT.hemi.color.setRGB(L.hs[0], L.hs[1], L.hs[2]); LT.hemi.groundColor.setRGB(L.hg[0], L.hg[1], L.hg[2]); LT.hemi.intensity = L.hi[0];
  LT.moon.color.setRGB(L.mc[0], L.mc[1], L.mc[2]); LT.moon.intensity = L.mi[0]; LT.fill.color.setRGB(L.fc[0], L.fc[1], L.fc[2]); LT.fill.intensity = L.fi[0];
  R.renderer.setClearColor(_lc.setRGB(L.clear[0], L.clear[1], L.clear[2]), 1);
  const a = R.mats.atmo.uniforms, c = R.mats.comp.uniforms;
  a.uMistAmb.value.set(L.mAmb[0], L.mAmb[1], L.mAmb[2]); a.uMist.value.set(L.mist[0], L.mist[1], L.mist[2], L.mist[3]);
  SH.uSky.value.setRGB(L.sky[0], L.sky[1], L.sky[2]); c.uLift.value.set(L.lift[0], L.lift[1], L.lift[2]); c.uGrade.value.y = L.grade[0]; R.exposure = L.grade[1];
  FX.alpha.mesh.material.uniforms.uAmb.value.set(L.amb[0], L.amb[1], L.amb[2]); WX.u.uAmb.value.set(L.wamb[0], L.wamb[1], L.wamb[2]);
}
function setBiomeLook(B, instant) {
  const b = B.bio; LOOK.bio = b; LOOK.to = lookOf(b);
  if (instant || !LOOK.cur) LOOK.cur = lookOf(b);
  SH.uCover.value.fromArray(b.cover); SH.uCoverCol.value.fromArray(b.coverCol); SH.uCoverP.value.fromArray(b.coverP);
  SH.uWat.value.fromArray(b.wat); SH.uWatA.value.fromArray(b.watA); SH.uWatB.value.fromArray(b.watB); SH.uWind.value = b.sway;
  const f = MAT.fall.uniforms; f.uFP.value.fromArray(b.fall); f.uFA.value.fromArray(b.fallA); f.uFB.value.fromArray(b.fallB);
  setWeather(b.wx, instant);
  const m = B.mirrored, p = b.moonPos; LT.moon.position.set(m ? p[2] : p[0], p[1], m ? p[0] : p[2]); LT.moon.target.position.set(0, 0, 0);
  applyLook(LOOK.cur);
}
function updateBiomeLook(dt) {
  if (!LOOK.cur) return;
  const k = 1 - Math.exp(-dt * 1.6), a = LOOK.cur, b = LOOK.to;
  for (const key in a) { const x = a[key], y = b[key]; for (let i = 0; i < x.length; i++) x[i] += (y[i] - x[i]) * k; }
  applyLook(a); WX.fade = Math.min(1, WX.fade + dt * .5); WX.u.uFade.value = WX.fade;
}


const BH = 18, CHUNK = 6, NCH = 6, CELL = 0.5, ROAD_HALF = 1.25, PATH_STEP = 0.3;

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0; t = sat(t);
  const cx = ax + dx * t, cz = az + dz * t;
  return Math.hypot(px - cx, pz - cz);
}
function segInter(a, b, c, d) {
  const r0 = b[0] - a[0], r1 = b[1] - a[1], s0 = d[0] - c[0], s1 = d[1] - c[1], den = r0 * s1 - r1 * s0;
  if (Math.abs(den) < 1e-9) return -1;
  const t = ((c[0] - a[0]) * s1 - (c[1] - a[1]) * s0) / den, u = ((c[0] - a[0]) * r1 - (c[1] - a[1]) * r0) / den;
  return (t >= 0 && t <= 1 && u >= 0 && u <= 1) ? t : -1;
}
function catmull(pts, step) {
  const raw = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < 24; k++) {
      const t = k / 24, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      raw.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  raw.push(pts[pts.length - 1].slice());
  return resample(raw, step);
}
function resample(raw, step) {
  const out = [raw[0].slice()]; let acc = 0;
  for (let i = 1; i < raw.length; i++) {
    let ax = raw[i - 1][0], az = raw[i - 1][1]; const bx = raw[i][0], bz = raw[i][1];
    let seg = Math.hypot(bx - ax, bz - az);
    while (acc + seg >= step) {
      const t = (step - acc) / seg; ax = ax + (bx - ax) * t; az = az + (bz - az) * t; out.push([ax, az]);
      seg = Math.hypot(bx - ax, bz - az); acc = 0;
    }
    acc += seg;
  }
  const l = raw[raw.length - 1], o = out[out.length - 1];
  if (Math.hypot(l[0] - o[0], l[1] - o[1]) > step * 0.4) out.push(l.slice());
  return out;
}
function relax(poly, iters) {
  for (let k = 0; k < iters; k++) for (let i = 1; i < poly.length - 1; i++) {
    poly[i][0] = poly[i][0] * 0.5 + (poly[i - 1][0] + poly[i + 1][0]) * 0.25;
    poly[i][1] = poly[i][1] * 0.5 + (poly[i - 1][1] + poly[i + 1][1]) * 0.25;
  }
  return poly;
}
function polyMinDist(poly, x, z, i0 = 0, i1 = poly.length - 1) {
  let best = 1e9, bi = 0;
  for (let i = i0; i < i1; i++) { const d = segDist(x, z, poly[i][0], poly[i][1], poly[i + 1][0], poly[i + 1][1]); if (d < best) { best = d; bi = i; } }
  return [best, bi];
}

function tryRoad(rng) {
  const zc = rng.range(-6.5, 9), kx = rng.range(0.5, 10.5);
  const way = [[-17.6, zc], [-12.0, zc]];
  const endA = [kx, -6.2], endB = [kx, -11.4];
  let cur = way[1], dir = 0;
  const nMid = rng.int(4, 7);
  const clearOf = (p, upto) => { for (let i = 0; i < upto; i++) if (segDist(p[0], p[1], way[i][0], way[i][1], way[i + 1][0], way[i + 1][1]) < 6.2) return false; return true; };
  for (let k = 0; k < nMid; k++) {
    let ok = false;
    for (let t = 0; t < 30 && !ok; t++) {
      const a = dir + rng.range(-2.3, 2.3), len = rng.range(5.5, 11.5);
      const p = [cur[0] + Math.cos(a) * len, cur[1] + Math.sin(a) * len];
      if (p[0] < -10.5 || p[0] > 14.2 || p[1] < -6.5 || p[1] > 14.2) continue;
      if (p[0] + p[1] > 24) continue;
      if (Math.abs(p[0] - kx) < 6.5 && p[1] < -4) continue;
      if (!clearOf(p, way.length - 2)) continue;
      let bad = false;
      for (let i = 0; i < way.length - 2 && !bad; i++) {
        if (segInter(cur, p, way[i], way[i + 1]) >= 0) bad = true;
        for (let u = 0.25; u <= 1 && !bad; u += 0.25) if (segDist(cur[0] + (p[0] - cur[0]) * u, cur[1] + (p[1] - cur[1]) * u, way[i][0], way[i][1], way[i + 1][0], way[i + 1][1]) < 5.6) bad = true;
      }
      if (bad) continue;
      way.push(p); dir = Math.atan2(p[1] - cur[1], p[0] - cur[0]); cur = p; ok = true;
    }
    if (!ok) return null;
  }
  way.push(endA, endB);
  let poly = relax(catmull(way, PATH_STEP), 10);
  poly = resample(poly, PATH_STEP);
  poly[poly.length - 1] = [kx, -11.4];
  const n = poly.length, L = (n - 1) * PATH_STEP;
  if (L < 58 || L > 92) return null;
  const gap = Math.round(10 / PATH_STEP);
  for (let i = 0; i < n; i++) {
    const [x, z] = poly[i], s = i * PATH_STEP;
    if (x > 15.3 || z > 15.3 || z < -11.6 || x + z > 26) return null;
    if (s > 7 && x < -12.2) return null;
    if (s < L - 5.5 && Math.abs(x - kx) < 5.6 && z < -8.6) return null;
    if (s > 7 && s < L - 6 && (z < -9.2)) return null;
    for (let j = i + gap; j < n; j += 2) if (Math.hypot(poly[j][0] - x, poly[j][1] - z) < 6.0) return null;
    if (i >= 4 && i < n - 4) {
      const a = Math.atan2(poly[i][1] - poly[i - 4][1], poly[i][0] - poly[i - 4][0]), b = Math.atan2(poly[i + 4][1] - poly[i][1], poly[i + 4][0] - poly[i][0]);
      if (Math.abs(angDiff(a, b)) > 0.62) return null;
    }
  }
  return { poly, L, zc, kx, way };
}

function tryStream(rng, road) {
  const { poly, L, kx } = road;
  for (let t = 0; t < 60; t++) {
    const sx = rng.range(-10, 12), sz = rng.range(-12.5, 2);
    if (Math.abs(sx - kx) < 7 && sz < -7) continue;
    if (polyMinDist(poly, sx, sz)[0] < 3.6) continue;
    const front = rng.chance(0.6);
    const ex = front ? rng.range(-13, 13) : BH + 0.6, ez = front ? BH + 0.6 : rng.range(-7, 13);
    const mx = (sx + ex) / 2 + rng.range(-5, 5), mz = (sz + ez) / 2 + rng.range(-5, 5);
    const raw = [];
    for (let k = 0; k <= 40; k++) { const u = k / 40, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u; raw.push([a * sx + b * mx + c * ex, a * sz + b * mz + c * ez]); }
    const sp = resample(raw, 0.5);
    if (sp.length < 20) continue;
    let cross = null, count = 0, bad = false;
    for (let i = 0; i < sp.length - 1 && !bad; i++) {
      for (let j = 0; j < poly.length - 1; j++) {
        const tt = segInter(sp[i], sp[i + 1], poly[j], poly[j + 1]);
        if (tt >= 0) {
          count++; if (count > 1) { bad = true; break; }
          const sa = Math.atan2(sp[i + 1][1] - sp[i][1], sp[i + 1][0] - sp[i][0]), ra = Math.atan2(poly[j + 1][1] - poly[j][1], poly[j + 1][0] - poly[j][0]);
          let rel = Math.abs(angDiff(sa, ra)); if (rel > HPI) rel = PI - rel;
          cross = { i, j, s: j * PATH_STEP, x: sp[i][0] + (sp[i + 1][0] - sp[i][0]) * tt, z: sp[i][1] + (sp[i + 1][1] - sp[i][1]) * tt, rel, ra };
        }
      }
    }
    if (bad || count !== 1) continue;
    if (cross.rel < 1.0 || cross.s < 9 || cross.s > L - 9) continue;
    for (let i = 0; i < sp.length && !bad; i++) {
      const [x, z] = sp[i];
      if (Math.hypot(x - cross.x, z - cross.z) > 3.4 && polyMinDist(poly, x, z)[0] < 3.3) bad = true;
      if (Math.abs(x - kx) < 6.2 && z < -9) bad = true;
      if (x < -12.8) bad = true;
    }
    if (bad) continue;
    return { pts: sp, cross, src: [sx, sz], front };
  }
  return null;
}

function choosePads(rng, road, stream) {
  const { poly, L, kx } = road, cand = [];
  const off = ROAD_HALF + 2.0;
  for (let s = 7.5; s < L - 3.5; s += 0.9) {
    const i = Math.round(s / PATH_STEP), a = poly[Math.max(0, i - 2)], b = poly[Math.min(poly.length - 1, i + 2)];
    const tx = b[0] - a[0], tz = b[1] - a[1], tl = Math.hypot(tx, tz) || 1, nx = -tz / tl, nz = tx / tl;
    for (const side of [-1, 1]) {
      const x = poly[i][0] + nx * off * side, z = poly[i][1] + nz * off * side;
      if (Math.abs(x) > BH - 2.4 || Math.abs(z) > BH - 2.4 || x < -11.2) continue;
      if (Math.abs(x - kx) < 6.4 && z < -9.6) continue;
      if (z < -12.6 || x + z < -21) continue;
      if (polyMinDist(poly, x, z)[0] < off - 0.25) continue;
      if (stream && polyMinDist(stream.pts, x, z)[0] < 2.9) continue;
      let cov = 0; for (let j = 0; j < poly.length; j++) if (dist2(x, z, poly[j][0], poly[j][1]) < 36) cov += PATH_STEP;
      cand.push({ x, z, s, side, cov });
    }
  }
  if (cand.length < 8) return null;
  cand.sort((p, q) => q.cov - p.cov);
  const pads = [], thirds = [0, 0, 0];
  const far = (c, dmin) => pads.every(p => dist2(p.x, p.z, c.x, c.z) > dmin * dmin);
  for (let pass = 0; pass < 2; pass++) for (let third = 0; third < 3; third++) {
    const c = cand.find(c => Math.min(2, Math.floor(c.s / L * 3)) === third && far(c, 4.6));
    if (c) { pads.push(c); thirds[third]++; }
  }
  for (const c of cand) { if (pads.length >= 11) break; if (far(c, 4.6)) pads.push(c); }
  if (pads.length < 8) return null;
  pads.sort((p, q) => p.s - q.s);
  return pads;
}

function genLayout(seed) {
  const rng = makeRng(seed * 7919 + 13);
  let best = null;
  for (let attempt = 0; attempt < 2500; attempt++) {
    const road = tryRoad(rng); if (!road) continue;
    const stream = tryStream(rng, road); if (!stream) continue;
    const pads = choosePads(rng, road, stream); if (!pads) continue;
    let minx = 99, maxx = -99, minz = 99, maxz = -99;
    for (const p of road.poly) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); minz = Math.min(minz, p[1]); maxz = Math.max(maxz, p[1]); }
    let turn = 0; const pp = road.poly;
    for (let i = 6; i < pp.length - 6; i += 3) turn += Math.abs(angDiff(Math.atan2(pp[i][1] - pp[i - 3][1], pp[i][0] - pp[i - 3][0]), Math.atan2(pp[i + 3][1] - pp[i][1], pp[i + 3][0] - pp[i][0])));
    const score = Math.min(road.L, 84) * 0.55 + turn * 3.2 + pads.length * 2 + (maxx - Math.max(minx, -12)) * 0.3 + (maxz - minz) * 0.3 + rng() * 5;
    if (!best || score > best.score) best = { road, stream, pads, score, turn };
    if (attempt > 700 && best) break;
  }
  if (!best) return null;
  const { road, stream, pads } = best;
  return {
    seed, pts: road.poly, L: road.L, cave: { x: -14.6, z: road.zc }, gate: { x: road.kx, z: -11.4 }, kx: road.kx,
    stream: stream.pts, cross: stream.cross, streamFront: stream.front, pads, mirrored: false,
  };
}


const MAT = {};
function initMaterials() {
  const tex = makeDetailTextures(); SH.uTexA.value = tex.albedo; SH.uTexH.value = tex.height;
  MAT.world = litMaterial('world');
  MAT.inst = litMaterial('inst');
  MAT.water = litMaterial('water', { color: new THREE.Color(0.012, 0.02, 0.03), roughness: 0.1 });
  MAT.dark = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false });
  MAT.caster = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false });
  MAT.fall = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: SH.uTime, uFP: { value: new THREE.Vector4(0, 1, 1, 0) }, uFA: { value: new THREE.Vector3(.022, .034, .054) }, uFB: { value: new THREE.Vector3(.2, .27, .38) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `precision highp float; varying vec2 vUv; uniform float uTime; uniform vec4 uFP; uniform vec3 uFA; uniform vec3 uFB;
float h(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y); }
void main(){
  float x = vUv.x, y = vUv.y, t = uTime * uFP.y;
  float edge = smoothstep(0.0, 0.14, x) * smoothstep(1.0, 0.86, x);
  if (uFP.x > 0.5 && uFP.x < 1.5) {
    float c1 = n(vec2(x * 7.0, 2.0)), c2 = n(vec2(x * 19.0 + 5.0, 7.0)), c3 = n(vec2(x * 4.0 + 1.0, y * 2.2));
    float len = 0.34 + 0.46 * c1 + 0.16 * c2, tip = smoothstep(len, len - 0.2, y);
    float rib = smoothstep(0.2, 0.8, c2 * 0.55 + n(vec2(x * 34.0, y * 1.3)) * 0.45);
    float ed = smoothstep(0.0, 0.07, x) * smoothstep(1.0, 0.93, x);
    gl_FragColor = vec4(mix(uFA, uFB, rib * (0.45 + 0.55 * c3)), ed * tip * uFP.z); return;
  }
  float s1 = n(vec2(x * 6.0, y * 5.0 - t * 2.4)), s2 = n(vec2(x * 13.0 + 3.1, y * 11.0 - t * 4.1)), s3 = n(vec2(x * 3.0 - 1.7, y * 2.2 - t * 1.3));
  float strand = smoothstep(0.34, 0.72, s1 * 0.6 + s2 * 0.4);
  float sheet = 1.0 - smoothstep(0.03, 0.3, y);
  float fade = 1.0 - smoothstep(0.4, 1.0, y);
  if (uFP.x > 1.5) {
    float body = mix(0.72 + 0.28 * s3, 1.0, sheet), crust = strand * smoothstep(0.05, 0.5, y);
    gl_FragColor = vec4(mix(uFA * (0.7 + 0.5 * s3), uFB, crust), clamp(edge * body * (1.0 - smoothstep(0.55, 1.0, y)) * uFP.z, 0.0, 1.0)); return;
  }
  float body = mix(strand * (0.55 + 0.45 * s3), 1.0, sheet);
  float foam = strand * smoothstep(0.02, 0.22, y);
  vec3 col = mix(uFA, uFB, foam * 0.85 + 0.06 * s3);
  gl_FragColor = vec4(col, clamp(edge * body * fade * (0.62 + 0.3 * foam) * uFP.z, 0.0, 1.0)); }`,
  });
}

function buildBoard(seed, index) {
  let lay = null, ls = seed;
  while (!lay) { lay = genLayout(ls); ls += 101; }
  const bio = biomeFor(index), RL = bio.relief; applyBiomePalette(bio);
  const rng = makeRng(seed * 9176 + 11); soupRng = makeRng(seed * 131 + 5);
  const sd = (seed * 53) % 997;
  const P = lay.pts, n = P.length, L = lay.L, kx = lay.kx, zc = lay.cave.z;
  const px = new Float32Array(n), pz = new Float32Array(n), py = new Float32Array(n), tx = new Float32Array(n), tz = new Float32Array(n);
  for (let i = 0; i < n; i++) { px[i] = P[i][0]; pz[i] = P[i][1]; }
  for (let i = 0; i < n; i++) { const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1); const dx = px[b] - px[a], dz = pz[b] - pz[a], l = Math.hypot(dx, dz) || 1; tx[i] = dx / l; tz[i] = dz / l; }

  const hBase = (x, z) => {
    let h = (fbm(x * .055 + sd, z * .055 + 3.1, sd, 3) - .5) * RL[0] + (fbm(x * .17 + 3, z * .17 + 7, sd + 5, 2) - .5) * RL[1] + .9 * smooth(7, -13, z);
    if (RL[3]) { const w = x * .42 + z * .2 + (fbm(x * .09, z * .09, sd + 70, 2) - .5) * 5, r = 1 - Math.abs(Math.sin(w)); h += RL[3] * r * r * (.4 + .9 * fbm(x * .07 + 9, z * .07, sd + 71, 2)); }
    return h;
  };

  { const raw = new Float32Array(n); for (let i = 0; i < n; i++) raw[i] = hBase(px[i], pz[i]) * .6;
    let a = raw, b = new Float32Array(n);
    for (let pass = 0; pass < 2; pass++) { for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let k = -16; k <= 16; k++) { const j = clamp(i + k, 0, n - 1); s += a[j]; c++; } b[i] = s / c; } const t = a; a = b; b = t; }
    py.set(a); }

  const SP = lay.stream, sn = SP.length, swl = new Float32Array(sn);
  { const wlS = hBase(SP[0][0], SP[0][1]) - .5, wlE = Math.min(hBase(SP[sn - 1][0], SP[sn - 1][1]) - .5, wlS - .3);
    let k = 0; for (let u = 0; u < sn; u++) { swl[u] = lerp(wlS, wlE, u / (sn - 1)); k = Math.min(k, hBase(SP[u][0], SP[u][1]) - .38 - swl[u]); }
    for (let u = 0; u < sn; u++) swl[u] += k; }
  const ci0 = Math.round(lay.cross.s / PATH_STEP), wlc = swl[lay.cross.i];
  { const need = Math.max(.4, wlc + 1.0 - py[ci0]); for (let i = 0; i < n; i++) py[i] += need * smooth(3.6, .7, Math.abs(i - ci0) * PATH_STEP); }
  const keepY = py[n - 1];

  const DN = 145, DS = .25, dRoad = new Float32Array(DN * DN), iRoad = new Uint16Array(DN * DN), dStr = new Float32Array(DN * DN), iStr = new Uint16Array(DN * DN);
  for (let j = 0; j < DN; j++) for (let i = 0; i < DN; i++) {
    const x = -BH + i * DS, z = -BH + j * DS; let b = 1e9, bi = 0;
    for (let k = 0; k < n; k++) { const dx = px[k] - x, dz = pz[k] - z, d = dx * dx + dz * dz; if (d < b) { b = d; bi = k; } }
    dRoad[j * DN + i] = Math.sqrt(b); iRoad[j * DN + i] = bi; b = 1e9; bi = 0;
    for (let k = 0; k < sn; k++) { const dx = SP[k][0] - x, dz = SP[k][1] - z, d = dx * dx + dz * dz; if (d < b) { b = d; bi = k; } }
    dStr[j * DN + i] = Math.sqrt(b); iStr[j * DN + i] = bi;
  }
  const dfAt = (arr, x, z) => {
    const fx = clamp((x + BH) / DS, 0, DN - 1.001), fz = clamp((z + BH) / DS, 0, DN - 1.001), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, o = j * DN + i;
    return (arr[o] * (1 - u) + arr[o + 1] * u) * (1 - v) + (arr[o + DN] * (1 - u) + arr[o + DN + 1] * u) * v;
  };
  const idxAt = (arr, x, z) => arr[clamp(Math.round((z + BH) / DS), 0, DN - 1) * DN + clamp(Math.round((x + BH) / DS), 0, DN - 1)];

  const pads = lay.pads.map(p => ({ x: p.x, z: p.z, s: p.s, cov: p.cov, y: 0 }));
  for (const p of pads) p.y0 = py[clamp(Math.round(p.s / PATH_STEP), 0, n - 1)] + .05;

  const ponds = [];
  for (let t = 0; t < 700 && ponds.length < bio.ponds; t++) {
    const r = rng.range(1.2, 2.3), x = rng.range(-BH + 3.4 + r, BH - 3.4 - r), z = rng.range(-BH + 3.4 + r, BH - 3.4 - r);
    if (dfAt(dRoad, x, z) < ROAD_HALF + 2.6 + r || dfAt(dStr, x, z) < 3.9 + r) continue;
    if (x < -12 + r || z < -12 + r || (Math.abs(x - kx) < 6.5 + r && z < -8.5 + r)) continue;
    if (pads.some(p => Math.hypot(x - p.x, z - p.z) < 3.1 + r) || ponds.some(q => Math.hypot(x - q.x, z - q.z) < r + q.r + 3.2)) continue;
    let y = 1e9; for (let k = 0; k < 24; k++) { const a = k / 12 * TAU, d = r + (k < 12 ? 1.3 : 2.1); y = Math.min(y, hBase(x + Math.cos(a) * d, z + Math.sin(a) * d)); }
    ponds.push({ x, z, r, y: Math.min(y, hBase(x, z)) - .22 });
  }
  const pondD = (q, x, z) => Math.hypot(x - q.x, z - q.z) * (.82 + .36 * vnoise(x * .55 + q.x, z * .55 + q.z, sd + 60));
  let _cl = 0;
  const hAt = (x, z) => {
    let h = hBase(x, z);
    const ds = dfAt(dStr, x, z);
    if (ds < 3.6) { const wl = swl[idxAt(iStr, x, z)]; h = Math.max(h, lerp(h, wl + .3, smooth(3.6, 2.3, ds) * smooth(.8, 1.5, ds))); }
    if (ds < 2.3) h = lerp(h, swl[idxAt(iStr, x, z)] - .34, smooth(2.2, .6, ds));
    const dsrc = Math.hypot(x - SP[0][0], z - SP[0][1]); if (dsrc < 2.7) h = lerp(h, swl[0] - .34, smooth(2.7, 1.2, dsrc));
    const dr = dfAt(dRoad, x, z);
    if (dr < ROAD_HALF + 3.2) {
      const w = smooth(ROAD_HALF + 3.2, ROAD_HALF + .4, dr) * smooth(.9, 2.3, ds);
      h = lerp(h, py[idxAt(iRoad, x, z)], w); if (dr < ROAD_HALF - .15 && ds > 2.3) h -= .07;
    }
    for (const p of pads) { const d = Math.hypot(x - p.x, z - p.z); if (d < 2.7) h = lerp(h, p.y0, smooth(2.7, 1.5, d)); }
    for (const q of ponds) { const d = pondD(q, x, z); if (d < q.r + 1.5) h = lerp(h, q.y - .45, smooth(q.r + 1.5, q.r * .4, d)); }
    const dkx = Math.max(0, Math.abs(x - kx) - 5.2), dkz = Math.max(0, z + 11.7), dk = Math.hypot(dkx, dkz);
    if (dk < 1.8) h = lerp(h, keepY, smooth(1.8, .2, dk));
    const dcl = x + BH + (fbm(z * .23 + 1.7, x * .11, sd + 9, 2) - .5) * 2.6;
    let c = smooth(5.0, 1.3, dcl) * (3.4 + 2.6 * fbm(x * .21, z * .21, sd + 11, 2) + 1.4 * smooth(4, -15, z)) * RL[2];
    const dbr = z + BH + (fbm(x * .23 + 5.1, z * .11, sd + 13, 2) - .5) * 2.4;
    const c2 = smooth(4.4, 1.0, dbr) * (1.8 + 2.2 * fbm(x * .2 + 9, z * .2, sd + 15, 2)) * smooth(5.4, 7.6, Math.abs(x - kx)) * RL[2];
    c = Math.max(c, c2) + 1.5 * smooth(11, 1, Math.hypot(x + BH, z + BH)) * smooth(7, 2.5, Math.min(x + BH, z + BH));
    if (c > .02) { const v = c / 1.2, f = Math.floor(v); c = (f + smooth(.45, .9, v - f)) * 1.2; }
    if (x < -12.2) c *= 1 - smooth(2.6, 1.6, Math.abs(z - zc)) * smooth(-12.2, -13.2, x);
    _cl = c; return h + c;
  };

  const chunks = [];
  for (let j = 0; j < NCH; j++) for (let i = 0; i < NCH; i++) chunks.push({ i, j, soup: new Soup(), water: new Soup(), cx: -BH + (i + .5) * CHUNK, cz: -BH + (j + .5) * CHUNK, extras: [], kind: 'chunk' });
  const chunkAt = (x, z) => chunks[clamp(Math.floor((z + BH) / CHUNK), 0, NCH - 1) * NCH + clamp(Math.floor((x + BH) / CHUNK), 0, NCH - 1)];
  const structs = [];
  const fires = [], glows = [];

  const NV = Math.round(2 * BH / CELL) + 1, CPC = Math.round(CHUNK / CELL);
  const VX = new Float32Array(NV * NV), VZ = new Float32Array(NV * NV), VY = new Float32Array(NV * NV), VC = new Float32Array(NV * NV), HG = new Float32Array(NV * NV);
  for (let j = 0; j < NV; j++) for (let i = 0; i < NV; i++) {
    let x = -BH + i * CELL, z = -BH + j * CELL; const o = j * NV + i;
    HG[o] = hAt(x, z);
    if (i % CPC !== 0) x += (h2(i, j, sd) - .5) * .26; if (j % CPC !== 0) z += (h2(i, j, sd + 1) - .5) * .26;
    VX[o] = x; VZ[o] = z; VY[o] = hAt(x, z); VC[o] = _cl;
  }
  const heightAt = (x, z) => {
    const fx = clamp((x + BH) / CELL, 0, NV - 1.001), fz = clamp((z + BH) / CELL, 0, NV - 1.001), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, o = j * NV + i;
    return (HG[o] * (1 - u) + HG[o + 1] * u) * (1 - v) + (HG[o + NV] * (1 - u) + HG[o + NV + 1] * u) * v;
  };
  const tcol = (x, z, ny, cl) => {
    const n1 = fbm(x * .3 + sd, z * .3, 3, 2), n2 = h2(Math.floor(x * 2 + 99), Math.floor(z * 2 + 99), sd + 2);
    if (cl > .5 || ny < .8) {
      let c = mixC(COL.stoneD, COL.stone, n1 * .9 + .1); if (ny > .93 && n1 > .5) c = mixC(c, COL.grassD, .4);
      return [mulC(c, .82 + .32 * n2), L_ROCK, .96];
    }
    let ds = dfAt(dStr, x, z); for (const q of ponds) ds = Math.min(ds, Math.max(0, pondD(q, x, z) - q.r) + .55);
    const glow = bio.bankGlow ? smooth(3.0, 1.1, ds) : 0;
    if (ds < 1.25) return [mixC(mulC(mixC(COL.mud, COL.earthD, n1), .6 + .25 * n2), [.42, .09, .02], glow * .16), L_DIRT, glow ? .9 : .5, glow * .012];
    let c = mixC(COL.earth, COL.grass, smooth(.4, .62, n1));
    c = mixC(c, COL.earthD, smooth(2.4, .5, dfAt(dRoad, x, z) - ROAD_HALF) * .55);
    return [mixC(mulC(c, .84 + .3 * n2), [.42, .09, .02], glow * .1), L_DIRT, .97, glow * .007];
  };
  const vtx = o => [VX[o], VY[o], VZ[o]];
  for (let j = 0; j < NV - 1; j++) for (let i = 0; i < NV - 1; i++) {
    const S = chunks[Math.floor(j / CPC) * NCH + Math.floor(i / CPC)].soup;
    const oa = j * NV + i, a = vtx(oa), b = vtx(oa + 1), c = vtx(oa + NV + 1), d = vtx(oa + NV);
    const cl = Math.max(VC[oa], VC[oa + 1], VC[oa + NV], VC[oa + NV + 1]);
    const tris = ((i + j) & 1) ? [[a, d, c], [a, c, b]] : [[a, d, b], [b, d, c]];
    for (const t of tris) {
      _sa.set(t[1][0] - t[0][0], t[1][1] - t[0][1], t[1][2] - t[0][2]); _sb.set(t[2][0] - t[0][0], t[2][1] - t[0][1], t[2][2] - t[0][2]); _sn.crossVectors(_sa, _sb).normalize();
      const m = tcol((t[0][0] + t[1][0] + t[2][0]) / 3, (t[0][2] + t[1][2] + t[2][2]) / 3, _sn.y, cl);
      S.tri(t[0], t[1], t[2], m[0], m[1], m[2], m[3] ? { emis: m[3] } : undefined);
    }
  }
  const facing = (S, a, b, c, d, ox, oz, col, layer, rough, o) => {
    _sa.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); _sb.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]); _sn.crossVectors(_sa, _sb);
    if (_sn.x * ox + _sn.z * oz + _sn.y * 1e-3 >= 0) S.quad(a, b, c, d, col, layer, rough, o); else S.quad(a, d, c, b, col, layer, rough, o);
  };
  const SC = bio.strata.map(h => C(h));
  const strataCol = k => k === 0 ? mulC(COL.earthD, 1.1) : mulC(SC[(k * 3 + Math.floor(h2(k, 7, sd + 40) * 3)) % SC.length], .8 + .35 * h2(k, 3, sd + 41));
  const LV = []; { let y = 13, i = 0; while (y > -11) { LV.push(y); y -= .5 + .95 * h2(i++, 9, sd + 47); } LV.push(-99); }
  const insetBase = (y, k) => y > -.5 ? -(k & 1) * .1 : -(Math.min(1.0, (-.5 - y) * .2) + (k & 1) * .16) + (y < -4.0 ? (-4.0 - y) * .6 : 0);
  const inset = (y, k, t) => insetBase(y, k) + (vnoise(t * .8, k * 3.1, sd + 45) - .5) * .14;
  const wallReach = (top, y) => { const l0 = top - .32; if (y >= l0) return 0; let j = 0; while (LV[j] > l0 - .3) j++; while (LV[j] >= y) j++; return .07 - insetBase(LV[j] + .4, j + 1); };
  const wallColumn = (S, ax, az, ay, bx, bz, by, ox, oz, outer, t0, t1) => {
    if (!outer) { facing(S, [ax, ay, az], [ax, -4.6, az], [bx, -4.6, bz], [bx, by, bz], ox, oz, mulC(COL.stoneD, .7), L_ROCK, 1); return; }
    const bot = t => -5.0 - 2.2 * fbm(t * .45, 1.7, sd + 43, 2) - (h2(Math.floor(t * 2), 5, sd + 44) > .8 ? 1.3 : 0);
    const botA = bot(t0), botB = bot(t1);
    let yA = ay, yB = by, inA = 0, inB = 0, lvl = Math.min(ay, by) - .32, j = 0; while (LV[j] > lvl - .3) j++;
    for (let step = 0; step < 34; step++) {
      const wob = step ? .2 : 0;
      const loA = Math.max(lvl + wob * (vnoise(t0 * 1.3, j, sd + 46) - .5), botA), loB = Math.max(lvl + wob * (vnoise(t1 * 1.3, j, sd + 46) - .5), botB);
      const vk = bio.vein && step > 0 && (j % 6) === 2 ? smooth(.5, .68, vnoise(t0 * .35, j * 1.7, sd + 48)) : 0, vein = vk > .01;
      const col = vein ? mixC(strataCol(j + 3), [.5, .11, .02], vk) : strataCol(step === 0 ? 0 : j + 3);
      const a1 = [ax - ox * inA, yA, az - oz * inA], a2 = [ax - ox * inA, loA, az - oz * inA], b2 = [bx - ox * inB, loB, bz - oz * inB], b1 = [bx - ox * inB, yB, bz - oz * inB];
      const glow = { emis: vein ? .008 + .075 * vk : .03 * smooth(-7.5, -1, (loA + yA) * .5) + .008 };
      if (yA - loA > .01 || yB - loB > .01) facing(S, a1, a2, b2, b1, ox, oz, col, step === 0 ? L_DIRT : L_ROCK, .97, glow);
      if (lvl <= botA && lvl <= botB) break;
      const nl = LV[j++], nA = inset(nl + .4, j, t0), nB = inset(nl + .4, j, t1);
      const l1 = [ax - ox * nA, loA, az - oz * nA], l2 = [bx - ox * nB, loB, bz - oz * nB];
      S.quad(a2, l1, l2, b2, mulC(col, 1.3), L_ROCK, .97, glow); S.quad(a2, b2, l2, l1, mulC(col, .45), L_ROCK, .97);
      yA = loA; yB = loB; inA = nA; inB = nB; lvl = nl;
    }
  };
  for (const ch of chunks) {
    const S = ch.soup, i0 = ch.i * CPC, j0 = ch.j * CPC;
    for (let k = 0; k < CPC; k++) {
      let o1 = j0 * NV + i0 + k, o2 = o1 + 1;
      wallColumn(S, VX[o1], VZ[o1], VY[o1], VX[o2], VZ[o2], VY[o2], 0, -1, ch.j === 0, VX[o1], VX[o2]);
      o1 = (j0 + CPC) * NV + i0 + k; o2 = o1 + 1;
      wallColumn(S, VX[o1], VZ[o1], VY[o1], VX[o2], VZ[o2], VY[o2], 0, 1, ch.j === NCH - 1, VX[o1] + 50, VX[o2] + 50);
      o1 = (j0 + k) * NV + i0; o2 = o1 + NV;
      wallColumn(S, VX[o1], VZ[o1], VY[o1], VX[o2], VZ[o2], VY[o2], -1, 0, ch.i === 0, VZ[o1] + 100, VZ[o2] + 100);
      o1 = (j0 + k) * NV + i0 + CPC; o2 = o1 + NV;
      wallColumn(S, VX[o1], VZ[o1], VY[o1], VX[o2], VZ[o2], VY[o2], 1, 0, ch.i === NCH - 1, VZ[o1] + 150, VZ[o2] + 150);
    }
    const inx = (ch.i === 0 ? 2.1 : 0) - (ch.i === NCH - 1 ? 2.1 : 0), inz = (ch.j === 0 ? 2.1 : 0) - (ch.j === NCH - 1 ? 2.1 : 0), edge = inx || inz;
    S.rock(edge ? 2.3 : 3.3, ch.cx + inx, edge ? -6.4 : -4.8, ch.cz + inz, mulC(COL.stoneD, .7), { sq: edge ? .9 : .62, d: 1, jit: .1 });
  }

  const OFF = [-1.62, -1.25, -.85, -.45, 0, .45, .85, 1.25, 1.62];
  const roadVert = (i, k, ext) => {
    const off = OFF[k], s = i * PATH_STEP, wj = Math.abs(off) > 1.3 ? 1 + (fbm(s * .5, k, sd + 20, 2) - .5) * .28 : 1;
    const ii = clamp(i, 0, n - 1), x = px[ii] + tx[ii] * ext - tz[ii] * off * wj, z = pz[ii] + tz[ii] * ext + tx[ii] * off * wj;
    const onBridge = Math.abs(i - ci0) * PATH_STEP < 3.0;
    let y = py[ii] + .035 * (1 - (off / 1.25) * (off / 1.25));
    const nz = fbm(x * .45, z * .45, sd + 21, 2);
    let c = mulC(COL.road, .78 + .42 * nz), rough = .6;
    const rut = Math.abs(Math.abs(off) - .62) < .3 ? smooth(.38, .62, fbm(s * .22, off > 0 ? 3 : 9, sd + 23, 2)) : 0;
    c = mixC(c, COL.roadD, rut * .75); y -= rut * .025;
    const mud = onBridge ? 0 : smooth(.57, .7, fbm(x * .3 + 7, z * .3, sd + 25, 2));
    c = mixC(c, COL.mud, mud * .85); rough = lerp(rough, .3, mud) - rut * .12;
    if (Math.abs(off) > 1.3) { c = mixC(c, COL.earth, .8); rough = .95; y = onBridge ? py[ii] - .04 : heightAt(x, z) + .012; }
    return [x, y, z, c, rough];
  };
  const rows = []; for (let i = 0; i < n; i += 2) rows.push(i); if (rows[rows.length - 1] !== n - 1) rows.push(n - 1);
  const rv = rows.map(i => OFF.map((_, k) => roadVert(i, k, 0)));
  rv.push(OFF.map((_, k) => roadVert(n - 1, k, 1.3)));
  for (let r = 0; r < rv.length - 1; r++) for (let k = 0; k < OFF.length - 1; k++) {
    const a = rv[r][k], b = rv[r][k + 1], c = rv[r + 1][k + 1], d = rv[r + 1][k];
    const S = chunkAt((a[0] + c[0]) / 2, (a[2] + c[2]) / 2).soup;
    for (const v of [a, b, c, a, c, d]) S.v(v[0], v[1], v[2], 0, 1, 0, v[3][0], v[3][1], v[3][2], v[0] * .25, v[2] * .25, L_COBBLE, v[4]);
  }
  for (let q = 0; q < 16; q++) {
    const i = rng.int(20, n - 20); if (Math.abs(i - ci0) * PATH_STEP < 4) continue;
    let x = px[i] - tz[i] * rng.range(-.9, .9), z = pz[i] + tx[i] * rng.range(-.9, .9), a = rng.range(0, TAU); const y = py[i] + .045, S = chunkAt(x, z).soup;
    for (let sgm = 0; sgm < rng.int(3, 6); sgm++) {
      a += rng.range(-.9, .9); const l = rng.range(.18, .4), x2 = x + Math.cos(a) * l, z2 = z + Math.sin(a) * l, wx = -Math.sin(a) * .028, wz = Math.cos(a) * .028;
      const col = mulC(COL.black, 2.2);
      S.quad([x - wx, y, z - wz], [x + wx, y, z + wz], [x2 + wx, y, z2 + wz], [x2 - wx, y, z2 - wz], col, L_PLAIN, 1);
      S.quad([x - wx, y, z - wz], [x2 - wx, y, z2 - wz], [x2 + wx, y, z2 + wz], [x + wx, y, z + wz], col, L_PLAIN, 1);
      x = x2; z = z2;
    }
  }
  const waterV = (S, x, y, z, u, w, flow, rough) => S.v(x, y, z, 0, 1, 0, 1, 1, 1, u, w, 0, rough, flow, 0);
  for (let q = 0, made = 0; q < 60 && made < bio.puddles; q++) {
    const i = rng.int(18, n - 14); if (Math.abs(i - ci0) * PATH_STEP < 4.5) continue;
    const off = rng.sign() * rng.range(.25, .78), cx = px[i] - tz[i] * off, cz = pz[i] + tx[i] * off, r = rng.range(.36, .78), y = py[i] + .042, ph = rng() * 9, el = rng.range(.6, 1), ang = Math.atan2(tz[i], tx[i]);
    const ring = []; for (let k = 0; k < 11; k++) { const a = k / 11 * TAU, rr2 = r * (.72 + .5 * vnoise(Math.cos(a) * 1.4 + ph, Math.sin(a) * 1.4, sd)); const lx = Math.cos(a) * rr2, lz = Math.sin(a) * rr2 * el; ring.push([cx + lx * Math.cos(ang) - lz * Math.sin(ang), cz + lx * Math.sin(ang) + lz * Math.cos(ang)]); }
    const ch = chunkAt(cx, cz), mudc = mulC(COL.mud, .55);
    for (let k = 0; k < 11; k++) {
      const p = ring[k], q2 = ring[(k + 1) % 11];
      waterV(ch.water, cx, y, cz, cx, cz, 0, .16); waterV(ch.water, q2[0], y, q2[1], q2[0], q2[1], 0, .16); waterV(ch.water, p[0], y, p[1], p[0], p[1], 0, .16);
      const e = 1.28, m1 = [cx + (p[0] - cx) * e, y - .006, cz + (p[1] - cz) * e], m2 = [cx + (q2[0] - cx) * e, y - .006, cz + (q2[1] - cz) * e];
      for (const v of [[cx, y - .006, cz], m2, m1]) ch.soup.v(v[0], v[1], v[2], 0, 1, 0, mudc[0], mudc[1], mudc[2], v[0] * .25, v[2] * .25, L_COBBLE, .28);
    }
    made++;
  }
  for (const q of ponds) {
    const R2 = q.r + .5, x0 = Math.floor(q.x - R2), x1 = Math.ceil(q.x + R2), z0 = Math.floor(q.z - R2), z1 = Math.ceil(q.z + R2);
    for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
      if (Math.hypot(x + .5 - q.x, z + .5 - q.z) > R2 + .8) continue;
      const S = chunkAt(x + .5, z + .5).water;
      for (const [dx, dz] of [[0, 0], [0, 1], [1, 1], [0, 0], [1, 1], [1, 0]]) waterV(S, x + dx, q.y, z + dz, (x + dx) * .8, (z + dz) * .8, .02, .14);
    }
  }
  if (bio.key === 'ember') {
    for (let q = 0; q < 46; q++) {
      let x = rng.range(-BH + 1.5, BH - 1.5), z = rng.range(-BH + 1.5, BH - 1.5), a = rng.range(0, TAU);
      if (dfAt(dRoad, x, z) < ROAD_HALF + .6 || dfAt(dStr, x, z) < 1.4 || dfAt(dStr, x, z) > 9 || Math.abs(hAt(x + .6, z) - hAt(x - .6, z)) > .3) continue;
      for (let sgm = 0, m = rng.int(4, 8); sgm < m; sgm++) {
        a += rng.range(-.8, .8); const l = rng.range(.25, .6), x2 = x + Math.cos(a) * l, z2 = z + Math.sin(a) * l, wd = rng.range(.02, .05), wx = -Math.sin(a) * wd, wz = Math.cos(a) * wd;
        if (Math.abs(x2) > BH - .6 || Math.abs(z2) > BH - .6) break;
        const y1 = heightAt(x, z) + .03, y2 = heightAt(x2, z2) + .03, S = chunkAt(x, z).soup, o = { emis: rng.range(.12, .3) }, col = [.75, .2, .03];
        S.quad([x - wx, y1, z - wz], [x + wx, y1, z + wz], [x2 + wx, y2, z2 + wz], [x2 - wx, y2, z2 - wz], col, L_PLAIN, 1, o);
        S.quad([x - wx, y1, z - wz], [x2 - wx, y2, z2 - wz], [x2 + wx, y2, z2 + wz], [x + wx, y1, z + wz], col, L_PLAIN, 1, o);
        x = x2; z = z2;
      }
    }
  }
  let fallAt = null;
  { let last = sn - 1; for (let u = 1; u < sn; u++) if (Math.abs(SP[u][0]) > BH || Math.abs(SP[u][1]) > BH) { last = u; break; }
    const sv = [];
    for (let u = 0; u <= last; u++) {
      let x = SP[u][0], z = SP[u][1];
      if (u === last) { const a = SP[u - 1], t = Math.abs(x) > BH ? (BH - Math.abs(a[0])) / (Math.abs(x) - Math.abs(a[0])) : (BH - Math.abs(a[1])) / (Math.abs(z) - Math.abs(a[1])); x = a[0] + (x - a[0]) * t; z = a[1] + (z - a[1]) * t; }
      const a = SP[Math.max(0, u - 1)], b = SP[Math.min(sn - 1, u + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      const w = .72 + .12 * Math.sin(u * .7) + .9 * smooth(3, 0, u * .5);
      sv.push([x, swl[u], z, -dz / l * w, dx / l * w, u * .5, w]);
    }
    for (let u = 0; u < sv.length - 1; u++) {
      const a = sv[u], b = sv[u + 1], S = chunkAt((a[0] + b[0]) / 2, (a[2] + b[2]) / 2).water;
      const q = [[a[0] - a[3], a[1], a[2] - a[4], -a[6], a[5]], [a[0] + a[3], a[1], a[2] + a[4], a[6], a[5]], [b[0] + b[3], b[1], b[2] + b[4], b[6], b[5]], [b[0] - b[3], b[1], b[2] - b[4], -b[6], b[5]]];
      for (const k of [0, 1, 2, 0, 2, 3]) waterV(S, q[k][0], q[k][1], q[k][2], q[k][3], q[k][4], 1.25, .24);
    }
    const e = sv[sv.length - 1], ox = Math.abs(e[0]) > BH - .01 ? Math.sign(e[0]) : 0, oz = ox ? 0 : Math.sign(e[2]);
    const bed = e[1] - .3, top = bed + .5, ax = Math.abs(oz), az = Math.abs(ox), w = e[6];
    let ext = .4; for (let d = 0; d <= 1.0; d += .1) ext = Math.max(ext, wallReach(top, bed - d) + .22);
    ext = Math.min(ext, .95);
    let v0 = 1.45; for (let r = 1; r <= 28; r++) { const tau = 1.6 * r / 28; v0 = Math.max(v0, (wallReach(top, e[1] - 4.5 * tau * tau) + .38 - ext) / tau); }
    v0 = Math.min(v0, 3.2);
    const S = chunkAt(e[0] - ox * .5, e[2] - oz * .5), rc = () => mulC(mixC(COL.stoneD, COL.stone, rng()), .9);
    const at = (o, a, y) => [e[0] + ox * o + ax * a, y, e[2] + oz * o + az * a];
    { const c = at((ext - .5) / 2, 0, bed - .26); S.soup.box(ox ? ext + .5 : w * 2 + 1.1, .5, ox ? w * 2 + 1.1 : ext + .5, c[0], c[1], c[2], rc(), { l: L_ROCK, jit: .04 }); }
    { const c = at(ext * .15, 0, bed - .6); S.soup.rock(w * .6 + .15, c[0], c[1], c[2], rc(), { sq: .55 }); }
    for (const sd2 of [-1, 1]) for (const [o, r, dy] of [[ext * .1, .44, .1], [ext * .62, .32, .02]]) { const c = at(o, sd2 * (w + .34), e[1] + dy); S.soup.rock(r, c[0], c[1], c[2], rc(), { sq: .72 }); }
    { const a0 = [e[0] - e[3], e[1], e[2] - e[4]], a1 = [e[0] + e[3], e[1], e[2] + e[4]], sg = (e[3] * ax + e[4] * az) >= 0 ? 1 : -1, b0 = at(ext + .06, -sg * w, e[1]), b1 = at(ext + .06, sg * w, e[1]), u1 = e[5] + (ext + .06);
      const q = [[a0, -w, e[5]], [a1, w, e[5]], [b1, w, u1], [b0, -w, u1]];
      for (const k of [0, 1, 2, 0, 2, 3]) waterV(S.water, q[k][0][0], q[k][0][1], q[k][0][2], q[k][1], q[k][2], 1.25, .24); }
    fallAt = { x: e[0], y: e[1], z: e[2], ox, oz, w, ext, v0 };
  }

  const B = {
    seed, index, lay, L, n, px, pz, py, tx, tz, pads, kx, zc, keepY, heightAt, hAt, chunks, structs, fires, glows, chunkAt, rng, sd, bio, ponds, env: [],
    dRoadAt: (x, z) => dfAt(dRoad, x, z), dStrAt: (x, z) => dfAt(dStr, x, z), cross: lay.cross, ci0, wlc, swl, SP, fallAt, mirrored: (index % 2) === 1,
    put(T, x, z, o = {}) { const y = o.y === undefined ? heightAt(x, z) + (o.dy || 0) : o.y; chunkAt(x, z).soup.merge(T, { p: [x, y, z], ry: o.ry || 0, r: o.r, s: o.s, tint: o.tint, ao: o.ao === undefined ? [0, .55, .6] : o.ao }); },
  };
  buildBridge(B); buildPads(B); buildKeep(B); buildCave(B); scatterProps(B);
  finalizeBoard(B);
  return B;
}

function pathAt(B, s, out) {
  const f = clamp(s / PATH_STEP, 0, B.n - 1.0001), i = Math.floor(f), t = f - i;
  out.x = lerp(B.px[i], B.px[i + 1], t); out.z = lerp(B.pz[i], B.pz[i + 1], t); out.y = lerp(B.py[i], B.py[i + 1], t);
  out.tx = lerp(B.tx[i], B.tx[i + 1], t); out.tz = lerp(B.tz[i], B.tz[i + 1], t);
  return out;
}
function pathNear(B, x, z, s0, win = 14) {
  const i0 = clamp(Math.round(s0 / PATH_STEP), 0, B.n - 1); let best = 1e9, bi = i0;
  for (let i = Math.max(0, i0 - win); i <= Math.min(B.n - 1, i0 + win); i++) { const d = dist2(x, z, B.px[i], B.pz[i]); if (d < best) { best = d; bi = i; } }
  let s = bi * PATH_STEP;
  const txx = B.tx[bi], tzz = B.tz[bi], along = (x - B.px[bi]) * txx + (z - B.pz[bi]) * tzz;
  s = clamp(s + clamp(along, -PATH_STEP, PATH_STEP), 0, B.L);
  const lat = -(x - B.px[bi]) * tzz + (z - B.pz[bi]) * txx;
  return { s, lat, i: bi };
}

function finalizeBoard(B) {
  const mir = B.mirrored;
  const sw = o => { const t = o.x; o.x = o.z; o.z = t; };
  B.pieces = [];
  B.group = new THREE.Group();
  { const TN = 72, raw = new Float32Array(TN * TN).fill(-99), top = new Float32Array(TN * TN);
    const mark = S => { const P = S.P; for (let i = 0; i < P.length; i += 3) { const ix = Math.floor((P[i] + BH) * 2), iz = Math.floor((P[i + 2] + BH) * 2); if (ix < 0 || iz < 0 || ix >= TN || iz >= TN) continue; const o = iz * TN + ix; if (P[i + 1] > raw[o]) raw[o] = P[i + 1]; } };
    for (const ch of B.chunks) mark(ch.soup); for (const st of B.structs) mark(st.soup);
    for (let z = 0; z < TN; z++) for (let x = 0; x < TN; x++) { let m = -99; for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, zz = z + dz; if (xx >= 0 && zz >= 0 && xx < TN && zz < TN && raw[zz * TN + xx] > m) m = raw[zz * TN + xx]; } top[z * TN + x] = m; }
    B.topAt = (x, z) => { if (mir) { const t = x; x = z; z = t; } return top[clamp(Math.floor((z + BH) * 2), 0, TN - 1) * TN + clamp(Math.floor((x + BH) * 2), 0, TN - 1)]; }; }
  const mkPiece = (soup, cx, cy, cz, kind, water, extras) => {
    if (mir) { soup.mirrorXZ(); if (water) water.mirrorXZ(); const t = cx; cx = cz; cz = t; }
    const P = soup.P; for (let i = 0; i < P.length; i += 3) { P[i] -= cx; P[i + 1] -= cy; P[i + 2] -= cz; }
    const mesh = new THREE.Mesh(soup.build(), MAT.world); mesh.castShadow = kind !== 'beaconTower' && kind !== 'keep'; mesh.receiveShadow = true; mesh.position.set(cx, cy, cz);
    if (water && water.verts) {
      const W = water.P; for (let i = 0; i < W.length; i += 3) { W[i] -= cx; W[i + 1] -= cy; W[i + 2] -= cz; }
      const wm = new THREE.Mesh(water.build(), MAT.water); wm.receiveShadow = true; mesh.add(wm);
    }
    for (const ex of extras || []) {
      if (mir) ex.soup.mirrorXZ();
      const E = ex.soup.P; for (let i = 0; i < E.length; i += 3) { E[i] -= cx; E[i + 1] -= cy; E[i + 2] -= cz; }
      const em = new THREE.Mesh(ex.soup.build(), ex.mat); em.renderOrder = ex.order || 0; mesh.add(em);
    }
    B.group.add(mesh);
    const piece = { mesh, cx, cy, cz, kind, t: 0, delay: 0, spin: new THREE.Vector3(rr(-1, 1), rr(-1, 1), rr(-1, 1)) };
    B.pieces.push(piece); return piece;
  };
  { let n = 0; for (const ch of B.chunks) n += ch.soup.P.length; const P = new Float32Array(n); let o = 0;
    for (const ch of B.chunks) {
      const sp = ch.soup.P, ss = ch.soup.S;
      for (let i = 0; i < sp.length; i += 9) {
        if (Math.max(sp[i + 1], sp[i + 4], sp[i + 7]) < -1.3) continue;
        const v = i / 3 * 4; if (ss[v] === L_PLAIN && Math.max(ss[v + 2], ss[v + 6], ss[v + 10]) >= .6) continue;
        if (mir) { for (const k of [0, 2, 1]) { P[o++] = sp[i + k * 3 + 2]; P[o++] = sp[i + k * 3 + 1]; P[o++] = sp[i + k * 3]; } } else { for (let k = 0; k < 9; k++) P[o++] = sp[i + k]; }
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P.subarray(0, o), 3)); g.computeBoundingSphere(); B.casterTris = o / 9; B.casterAll = n / 9;
    B.caster = new THREE.Mesh(g, MAT.caster); B.caster.castShadow = true; B.caster.frustumCulled = false; B.group.add(B.caster); }
  for (const ch of B.chunks) mkPiece(ch.soup, ch.cx, 0, ch.cz, 'chunk', ch.water, ch.extras);
  for (const st of B.structs) mkPiece(st.soup, st.cx, st.cy, st.cz, st.kind, null, st.extras);
  if (mir) {
    const sa = (a, b) => { for (let i = 0; i < a.length; i++) { const t = a[i]; a[i] = b[i]; b[i] = t; } };
    sa(B.px, B.pz); sa(B.tx, B.tz);
    for (const p of B.pads) sw(p); for (const f of B.fires) sw(f); for (const g of B.glows) sw(g); for (const q of B.ponds) sw(q); for (const e of B.env) sw(e);
    sw(B.beacon); sw(B.gate); sw(B.cave); if (B.fallAt) { sw(B.fallAt); const t = B.fallAt.ox; B.fallAt.ox = B.fallAt.oz; B.fallAt.oz = t; }
    const h0 = B.heightAt; B.heightAt = (x, z) => h0(z, x);
    const d0 = B.dRoadAt; B.dRoadAt = (x, z) => d0(z, x);
    for (const sp of B.SP) { const t = sp[0]; sp[0] = sp[1]; sp[1] = t; }
    B.cross = Object.assign({}, B.cross, { x: B.cross.z, z: B.cross.x });
  }
  if (B.fallAt) {
    const f = B.fallAt, ex = -f.oz, ez = f.ox, w = f.w * 1.05, pc = B.pieces.reduce((a, b) => b.kind === 'chunk' && dist2(b.cx, b.cz, f.x, f.z) < dist2(a.cx, a.cz, f.x, f.z) ? b : a, B.pieces[0]);
    const NR = 14, pos = [], uv = [], idx = [];
    for (let r = 0; r <= NR; r++) {
      const v = r / NR, tau = 1.3 * v, out = f.ext + f.v0 * tau, dy = -4.5 * tau * tau, ww = w * (1 + .35 * v);
      for (const sd of [-1, 1]) { pos.push(f.x + f.ox * out + ex * ww * sd - pc.cx, f.y + dy - pc.cy, f.z + f.oz * out + ez * ww * sd - pc.cz); uv.push(sd * .5 + .5, v); }
    }
    for (let i = 0; i < NR; i++) { const a = i * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3)); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2)); g.setIndex(idx);
    const fm = new THREE.Mesh(g, MAT.fall); fm.renderOrder = 2; pc.mesh.add(fm);
  }
  { const n = B.n, W = 14; B.ax = new Float32Array(n); B.az = new Float32Array(n);
    for (let i = 0; i < n; i++) { const w = Math.min(W, i, n - 1 - i); let sx = 0, sz = 0; for (let k = -w; k <= w; k++) { sx += B.px[i + k]; sz += B.pz[i + k]; } B.ax[i] = sx / (2 * w + 1); B.az[i] = sz / (2 * w + 1); } }
  for (const p of B.pads) { p.y = p.y0 + .29; p.tower = null; p.face = 0; const q = pathNear(B, p.x, p.z, p.s, 30); p.s = q.s; p.face = Math.atan2(B.px[q.i] - p.x, B.pz[q.i] - p.z); }
  B.soupsDone = true; setBoardCasting(B, false);
  B.chunks.forEach(c => { c.soup = c.water = null; }); B.structs.forEach(s => { s.soup = null; });
}

function setBoardCasting(B, moving) { B.caster.visible = !moving; for (const p of B.pieces) if (p.kind === 'chunk' || p.kind === 'cave') p.mesh.castShadow = moving; }
function disposeBoard(B) {
  B.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  if (B.group.parent) B.group.parent.remove(B.group);
}


const _segq = new THREE.Quaternion(), _segd = new THREE.Vector3(), _upv = new THREE.Vector3(0, 1, 0);
Soup.prototype.seg = function (a, b, r0, r1, c, o = {}) {
  _segd.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const len = _segd.length(); if (len < 1e-5) return this; _segd.multiplyScalar(1 / len);
  _segq.setFromUnitVectors(_upv, _segd);
  o.q = _segq; o.s = [r0, len, r0]; o.p = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]; o.c = c;
  return this.add(gCyl(o.n || 6, Math.round(clamp(r1 / r0, 0, 2.5) * 10) / 10), o);
};

function clothPanel(S, o) {
  const nx = o.nx || 4, ny = o.ny || 6, rng = o.rng, sway = o.sway === undefined ? .8 : o.sway;
  const yAt = j => o.yTop - o.len * j / ny, sw = j => Math.pow(j / ny, 1.3) * sway;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (j >= ny - 2 && rng() < (o.rag === undefined ? .4 : o.rag)) continue;
    if (j === ny - 1 && (i & 1)) continue;
    const xa = lerp(o.x0, o.x1, i / nx), xb = lerp(o.x0, o.x1, (i + 1) / nx);
    const emblem = o.col2 && i >= 1 && i < nx - 1 && j >= 1 && j <= 2;
    const c = mulC(emblem ? o.col2 : o.col, .78 + .3 * rng());
    const q = [[xa, yAt(j), sw(j)], [xb, yAt(j), sw(j)], [xb, yAt(j + 1), sw(j + 1)], [xa, yAt(j + 1), sw(j + 1)]];
    for (const [order, nz] of [[[0, 3, 2, 0, 2, 1], 1], [[0, 1, 2, 0, 2, 3], -1]]) for (const k of order) S.v(q[k][0], q[k][1], o.z, 0, 0, nz, c[0], c[1], c[2], q[k][0] * .5, q[k][1] * .5, L_CLOTH, .95, q[k][2], 0);
  }
}

const PROP = {
  barrel(S, x, y, z, s = 1, rng) {
    const c = mulC(COL.wood, .8 + .3 * rng());
    S.cyl(.2 * s, .27 * s, x, y + .135 * s, z, c, { n: 8, l: L_WOOD, rt: 1.16 });
    S.cyl(.232 * s, .27 * s, x, y + .405 * s, z, c, { n: 8, l: L_WOOD, rt: .86 });
    for (const h of [.06, .27, .48]) S.cyl((h === .27 ? .242 : .215) * s, .035 * s, x, y + h * s, z, COL.iron, { n: 8, l: L_METAL, rough: .6 });
  },
  crate(S, x, y, z, s, rng, ry = 0) {
    const c = mulC(COL.woodL, .75 + .3 * rng()), o = () => ({ l: L_WOOD, r: [0, ry, 0] });
    S.box(s, s, s, x, y + s / 2, z, c, o());
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) S.box(s * .12, s * 1.04, s * .12, x + (dx * Math.cos(ry) + dz * Math.sin(ry)) * s * .47, y + s / 2, z + (-dx * Math.sin(ry) + dz * Math.cos(ry)) * s * .47, COL.woodD, o());
    S.box(s * 1.04, s * .1, s * 1.04, x, y + s * .97, z, COL.woodD, o());
  },
  tree(S, rng, h, o = {}) {
    const bark = o.bark || mulC(COL.bark, .8 + .4 * rng());
    const branch = (a, d, len, r, depth) => {
      const b = [a[0] + d[0] * len, a[1] + d[1] * len, a[2] + d[2] * len], hot = o.tipEmis && depth >= 3;
      S.seg(a, b, r, r * .64, hot ? o.tip : bark, { l: L_WOOD, n: depth > 1 ? 4 : 6, sway: depth >= 2 ? .35 + depth * .15 : 0, emis: hot ? o.tipEmis : 0 });
      if (depth >= 4 || len < .3) return;
      const kids = depth === 0 ? rng.int(2, 3) : rng.int(1, 2);
      for (let k = 0; k < kids; k++) {
        const nd = [d[0] + rng.range(-1, 1), d[1] * .5 + rng.range(.05, .7), d[2] + rng.range(-1, 1)], l = Math.hypot(nd[0], nd[1], nd[2]);
        branch(b, [nd[0] / l, nd[1] / l, nd[2] / l], len * rng.range(.55, .8), r * .58, depth + 1);
      }
      if (depth < 2) { const nd = [d[0] + rng.range(-.3, .3), 1, d[2] + rng.range(-.3, .3)], l = Math.hypot(nd[0], nd[1], nd[2]); branch(b, [nd[0] / l, nd[1] / l, nd[2] / l], len * .72, r * .64, depth + 1); }
    };
    S.cyl(h * .12, .3, 0, .1, 0, bark, { n: 6, l: L_WOOD, rt: .7 });
    branch([0, .05, 0], [rng.range(-.15, .15), 1, rng.range(-.15, .15)], h * .42, h * .075, 0);
  },
  stump(S, rng) {
    S.cyl(.3, .45, 0, .2, 0, COL.bark, { n: 7, l: L_WOOD, rt: .8 }); S.cyl(.235, .04, 0, .44, 0, COL.woodL, { n: 7, l: L_WOOD });
    for (let k = 0; k < 3; k++) { const a = rng() * TAU; S.seg([Math.cos(a) * .2, .12, Math.sin(a) * .2], [Math.cos(a) * .6, -.05, Math.sin(a) * .6], .09, .04, COL.bark, { l: L_WOOD, n: 5 }); }
  },
  grave(S, rng) {
    const T = new Soup(), w = rng.range(.44, .62), h = rng.range(.62, 1.0), c = mixC(COL.stoneD, COL.stoneL, rng()), kind = rng.int(0, 3);
    if (kind === 0) { T.box(w, h * .8, .15, 0, h * .4, 0, c, { l: L_ROCK }); T.cyl(w / 2, .15, 0, h * .8, 0, c, { n: 8, l: L_ROCK, r: [HPI, 0, 0] }); }
    else if (kind === 1) { T.box(.15, h * 1.15, .14, 0, h * .57, 0, c, { l: L_ROCK }); T.box(w * 1.1, .15, .14, 0, h * .8, 0, c, { l: L_ROCK }); }
    else if (kind === 2) { T.box(w, h * .9, .16, 0, h * .45, 0, c, { l: L_ROCK }); T.box(w * .7, .14, .16, 0, h * .95, 0, c, { l: L_ROCK }); T.box(w * 1.2, .12, .3, 0, .06, 0, mulC(c, .8), { l: L_ROCK }); }
    else { T.box(w * .9, h * .55, .15, 0, h * .27, 0, c, { l: L_ROCK }); T.box(w * .5, h * .2, .15, -w * .18, h * .62, 0, c, { l: L_ROCK, r: [0, 0, .3] }); }
    S.merge(T, { r: [rng.range(-.2, .2), rng.range(-.3, .3), rng.range(-.16, .16)], ao: [0, .4, .55] });
    S.ico(.5, 0, .0, .62, mulC(COL.earthD, 1.1), { sc: [.75, .22, 1.25], l: L_DIRT, d: 1 });
  },
  cart(S, rng, broken) {
    const w = COL.wood, wd = COL.woodD, o = () => ({ l: L_WOOD });
    S.box(1.6, .08, .9, 0, .56, 0, w, o());
    for (const zz of [-.45, .45]) { S.box(1.6, .28, .06, 0, .74, zz, w, o()); for (const xx of [-.7, 0, .7]) S.box(.07, .4, .08, xx, .74, zz * 1.04, wd, o()); }
    S.box(.06, .28, .9, -.8, .74, 0, w, o());
    const wheel = (x, z, lean) => {
      const T = new Soup();
      T.add(gTorus(10, .13, 4), { s: .4, c: wd, l: L_WOOD }); T.cyl(.07, .14, 0, 0, 0, COL.iron, { n: 6, l: L_METAL, r: [HPI, 0, 0] });
      for (let k = 0; k < 4; k++) T.box(.74, .05, .05, 0, 0, 0, w, { l: L_WOOD, r: [0, 0, k * PI / 4] });
      S.merge(T, { p: [x, lean ? .12 : .4, z], r: [lean ? 1.35 : 0, 0, lean ? .3 : 0] });
    };
    wheel(-.25, .56, false); if (!broken) wheel(-.25, -.56, false); else wheel(.5, -1.0, true);
    S.box(.08, .08, 1.2, -.25, .4, 0, wd, o());
    for (const zz of [-.3, .3]) S.seg([.8, .54, zz], [2.0, broken ? .1 : .34, zz * 1.1], .04, .035, wd, { l: L_WOOD });
    S.ico(.26, .35, .74, .1, COL.clothT, { sc: [1.2, .7, 1], l: L_CLOTH, d: 1 }); S.ico(.24, -.05, .72, -.18, mulC(COL.clothT, .8), { sc: [1, .7, 1.2], l: L_CLOTH, d: 1 });
    PROP.barrel(S, -.5, .6, .12, .8, rng);
  },
  bones(S, rng, n = 5) {
    for (let k = 0; k < n; k++) { const a = rng() * TAU, l = rng.range(.2, .45), x = rng.range(-.4, .4), z = rng.range(-.4, .4); S.seg([x, .04, z], [x + Math.cos(a) * l, .05 + rng() * .08, z + Math.sin(a) * l], .03, .03, mulC(COL.bone, .7 + .3 * rng()), { l: L_BONE, n: 5 }); }
    if (rng() < .7) PROP.skull(S, rng.range(-.2, .2), .13, rng.range(-.2, .2), .15, rng() * TAU);
  },
  skull(S, x, y, z, r, ry) {
    const T = new Soup();
    T.sph(r, 0, 0, 0, COL.bone, { sc: [1, .95, 1.1], l: L_BONE, w: 7, h: 5 }); T.box(r * 1.1, r * .55, r * .8, 0, -r * .65, r * .32, COL.boneD, { l: L_BONE });
    for (const s of [-1, 1]) T.box(r * .42, r * .38, r * .2, s * r * .42, -r * .05, r * 1.0, COL.black, { jit: 0 });
    S.merge(T, { p: [x, y, z], ry, ao: null });
  },
  ribcage(S, rng) {
    const b = COL.bone;
    S.seg([-1.6, .5, 0], [1.6, .7, 0], .1, .08, b, { l: L_BONE });
    for (let k = 0; k < 6; k++) {
      const x = -1.3 + k * .5, s = 1 - Math.abs(k - 2.5) * .12;
      for (const side of [-1, 1]) {
        if (rng() < .15) continue;
        let p = [x, .55, 0]; const pts = [[x, .95 * s, side * .55 * s], [x + .05, 1.25 * s, side * .95 * s], [x + .1, .85 * s, side * 1.15 * s], [x + .12, .1, side * 1.05 * s]];
        for (const q of pts) { S.seg(p, q, .06, .05, mulC(b, .8 + .2 * rng()), { l: L_BONE, n: 5 }); p = q; }
      }
    }
    S.ico(.5, 2.15, .55, 0, b, { sc: [1.35, .8, .85], l: L_BONE, d: 1 }); S.ico(.3, 2.85, .4, 0, COL.boneD, { sc: [1.3, .6, .7], l: L_BONE, d: 1 });
    for (const side of [-1, 1]) { S.seg([2.0, .8, side * .3], [1.7, 1.4, side * .75], .1, .02, b, { l: L_BONE, n: 5 }); S.box(.2, .16, .08, 2.3, .62, side * .4, COL.black, { jit: 0 }); }
  },
  web(S, a, b, c) {
    const col = mulC(COL.stoneL, 1.5), th = .011;
    const lerp3 = (p, q, t) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t), lerp(p[2], q[2], t)];
    for (let k = 0; k <= 4; k++) S.seg(a, lerp3(b, c, k / 4), th, th, col, { n: 3, emis: .015, jit: 0, sway: .25 });
    for (let r = 1; r <= 3; r++) for (let k = 0; k < 4; k++) S.seg(lerp3(a, lerp3(b, c, k / 4), r / 3.3), lerp3(a, lerp3(b, c, (k + 1) / 4), r / 3.3 - .04), th, th, col, { n: 3, emis: .015, jit: 0, sway: .25 });
  },
  banner(S, rng, col, h = 2.8) {
    S.seg([0, 0, 0], [0, h, 0], .055, .04, COL.woodD, { l: L_WOOD }); S.seg([-.08, h - .2, 0], [.82, h - .2, 0], .03, .03, COL.woodD, { l: L_WOOD, n: 5 });
    S.cone(.07, .2, 0, h + .1, 0, COL.iron, { n: 4, l: L_METAL });
    clothPanel(S, { x0: .04, x1: .78, yTop: h - .23, len: 1.45, z: 0, col, col2: mulC(COL.gold, .6), rng });
  },
  fence(S, rng, len) {
    const nP = Math.max(2, Math.round(len) + 1);
    for (let k = 0; k < nP; k++) {
      const x = -len / 2 + k * len / (nP - 1), lean = rng.range(-.14, .14), hh = rng.range(.72, .95);
      S.box(.1, hh, .1, x, hh / 2, 0, mulC(COL.wood, .7 + .3 * rng()), { l: L_WOOD, r: [lean, 0, rng.range(-.12, .12)] });
      if (k < nP - 1) for (const y of [.36, .68]) { if (rng() < .22) continue; const drop = rng() < .15 ? -.3 : 0; S.seg([x, y, 0], [x + len / (nP - 1), y + drop + rng.range(-.04, .04), 0], .035, .035, mulC(COL.woodL, .7 + .3 * rng()), { l: L_WOOD, n: 4 }); }
    }
  },
  palisade(S, rng, len) {
    for (let x = -len / 2; x < len / 2; x += .27) {
      if (rng() < .1) continue;
      const hh = rng.range(1.25, 1.75), lean = [rng.range(-.1, .1), 0, rng.range(-.12, .12)], c = mulC(COL.wood, .65 + .35 * rng()), T = new Soup();
      T.cyl(.12, hh, 0, hh / 2, 0, c, { n: 6, l: L_WOOD }); T.cone(.12, .3, 0, hh + .15, 0, mulC(c, 1.15), { n: 6, l: L_WOOD });
      S.merge(T, { p: [x, -.1, rng.range(-.04, .04)], r: lean, ao: [0, .5, .6] });
    }
    S.box(len, .09, .07, 0, .95, .13, COL.woodD, { l: L_WOOD });
  },
  well(S, rng) {
    for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; S.box(.44, .56, .26, Math.cos(a) * .68, .28, Math.sin(a) * .68, mixC(COL.stoneD, COL.stoneL, rng()), { l: L_MASON, r: [0, -a + HPI, 0] }); }
    S.cyl(.6, .06, 0, .3, 0, COL.black, { n: 10, jit: 0 });
    for (const s of [-1, 1]) S.box(.1, 1.7, .1, s * .72, .85, 0, COL.woodD, { l: L_WOOD });
    S.seg([-.8, 1.45, 0], [.8, 1.45, 0], .05, .05, COL.wood, { l: L_WOOD });
    for (const s of [-1, 1]) S.box(1.75, .05, .62, 0, 1.86, s * .26, COL.slate, { l: L_SLATE, r: [s * .62, 0, 0] });
    S.seg([.15, 1.45, 0], [.15, .75, 0], .012, .012, COL.rope, { n: 3 }); S.cyl(.12, .2, .15, .68, 0, COL.wood, { n: 7, l: L_WOOD, rt: 1.2 });
  },
  wallRun(S, rng, len, hMax) {
    let x = -len / 2, k = 0, h = hMax * rng.range(.5, 1);
    while (x < len / 2) {
      const w = rng.range(.9, 1.4); h = clamp(h + rng.range(-1.1, .7), .5, hMax);
      const edge = Math.min(1, (len / 2 - Math.abs(x + w / 2)) / 1.4 + .25), hh = h * edge, c = mixC(COL.stoneD, COL.stone, rng());
      S.box(w, hh, .62, x + w / 2, hh / 2, 0, c, { l: L_MASON });
      for (let j = 0; j < 3; j++) if (rng() < .6) S.box(w * rng.range(.25, .45), rng.range(.2, .5), .62, x + w * (.2 + j * .3), hh + .15, 0, mixC(COL.stoneD, COL.stoneL, rng()), { l: L_MASON });
      if (hh > 2.2 && rng() < .5) S.box(.3, .8, .7, x + w / 2, hh * .62, 0, COL.black, { jit: 0 });
      if (rng() < .5) S.rock(rng.range(.2, .4), x + rng.range(0, w), .1, rng.sign() * rng.range(.5, .9), mixC(COL.stoneD, COL.stone, rng()));
      x += w; k++;
    }
    S.box(len * .9, .22, .86, 0, .08, 0, COL.stoneD, { l: L_MASON });
  },
  towerRuin(S, rng) {
    const R = 1.35, n = 10, hs = [];
    for (let k = 0; k < n; k++) hs.push(clamp(4.4 - k * .42 + rng.range(-.4, .4), .7, 4.6));
    S.cyl(R + .35, .4, 0, .2, 0, COL.stoneD, { n: 10, l: L_MASON });
    for (let k = 0; k < n; k++) {
      if (k === n - 1) continue;
      const a = k / n * TAU, c = mixC(COL.stoneD, COL.stone, rng());
      S.box(.92, hs[k], .42, Math.cos(a) * R, hs[k] / 2 + .3, Math.sin(a) * R, c, { l: L_MASON, r: [0, -a + HPI, 0] });
      if (rng() < .7) S.box(.4, rng.range(.2, .5), .42, Math.cos(a + .1) * R, hs[k] + .5, Math.sin(a + .1) * R, mixC(COL.stoneD, COL.stoneL, rng()), { l: L_MASON, r: [0, -a + HPI, 0] });
      if (hs[k] > 2.6 && (k & 1)) S.box(.2, .6, .5, Math.cos(a) * R, hs[k] * .65, Math.sin(a) * R, COL.black, { jit: 0, r: [0, -a + HPI, 0] });
    }
    for (let k = 0; k < 3; k++) { const a = rng() * TAU; S.seg([Math.cos(a) * R, 2.1, Math.sin(a) * R], [Math.cos(a + 2.4) * R * .6, 2.0 - rng() * .8, Math.sin(a + 2.4) * R * .6], .07, .06, COL.woodD, { l: L_WOOD, n: 4 }); }
    for (let k = 0; k < 7; k++) { const a = rng() * TAU, d = rng.range(1.9, 3.0); S.box(rng.range(.3, .6), rng.range(.2, .4), rng.range(.3, .5), Math.cos(a) * d, .12, Math.sin(a) * d, mixC(COL.stoneD, COL.stone, rng()), { l: L_MASON, r: [rng() * .5, rng() * 3, rng() * .5] }); }
  },
  signpost(S, rng) {
    S.box(.1, 1.7, .1, 0, .85, 0, COL.woodD, { l: L_WOOD, r: [0, 0, .06] });
    S.box(.8, .2, .05, .28, 1.45, .06, COL.woodL, { l: L_WOOD, r: [0, .2, -.08] }); S.box(.7, .18, .05, -.22, 1.15, .06, COL.wood, { l: L_WOOD, r: [0, -.25, .1] });
  },
  gibbet(S, rng) {
    S.box(.16, 3.0, .16, 0, 1.5, 0, COL.woodD, { l: L_WOOD }); S.box(1.2, .13, .13, .5, 2.9, 0, COL.woodD, { l: L_WOOD }); S.seg([0, 2.2, 0], [.6, 2.85, 0], .05, .05, COL.wood, { l: L_WOOD, n: 4 });
    S.seg([.95, 2.85, 0], [.95, 2.3, 0], .015, .015, COL.iron, { n: 3 });
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; S.seg([.95 + Math.cos(a) * .2, 2.3, Math.sin(a) * .2], [.95 + Math.cos(a) * .2, 1.5, Math.sin(a) * .2], .014, .014, COL.iron, { n: 3, l: L_METAL, sway: .12 }); }
    for (const y of [2.3, 1.9, 1.5]) S.add(gTorus(8, .08, 3), { s: .2, p: [.95, y, 0], r: [HPI, 0, 0], c: COL.iron, l: L_METAL, sway: .12 });
    PROP.skull(S, .95, 1.72, 0, .11, 1);
  },
  cairn(S, rng) { let y = 0, r = rng.range(.3, .42); for (let k = 0; k < 4; k++) { S.rock(r, rng.range(-.05, .05), y + r * .45, rng.range(-.05, .05), mixC(COL.stoneD, COL.stoneL, rng()), { sq: .6 }); y += r * .72; r *= .74; } },
  statue(S, rng) {
    const c = COL.stone, m = () => ({ l: L_ROCK });
    S.box(1.1, .6, 1.1, 0, .3, 0, COL.stoneD, { l: L_MASON }); S.box(.9, .15, .9, 0, .67, 0, COL.stoneL, { l: L_MASON });
    for (const s of [-1, 1]) S.box(.2, .75, .22, s * .16, 1.1, 0, c, m());
    S.box(.62, .7, .34, 0, 1.8, 0, c, m()); S.box(.2, .7, .2, -.42, 1.75, .05, c, { l: L_ROCK, r: [.2, 0, .15] });
    S.box(.2, .35, .2, .42, 1.95, 0, c, m()); S.box(.1, 1.3, .08, -.5, 1.25, .2, COL.stoneL, m());
    S.rock(.2, .7, .1, .5, c); S.rock(.16, .5, .08, .75, c);
  },
  tuft(S, rng) {
    const c = mulC(mixC(COL.tuftA, COL.tuftB, rng() * .6), .8 + .5 * rng());
    for (let k = 0; k < rng.int(3, 5); k++) {
      const a = rng() * TAU, l = rng.range(.22, .42), bx = Math.cos(a) * .06, bz = Math.sin(a) * .06, tx = Math.cos(a) * l * .5, tz = Math.sin(a) * l * .5, w = .035;
      const A = [bx - Math.sin(a) * w, 0, bz + Math.cos(a) * w], Bp = [bx + Math.sin(a) * w, 0, bz - Math.cos(a) * w], T = [tx, l, tz];
      for (const [p, sw] of [[A, 0], [Bp, 0], [T, .7], [A, 0], [T, .7], [Bp, 0]]) S.v(p[0], p[1], p[2], 0, 1, 0, c[0], c[1], c[2], 0, 0, L_PLAIN, 1, sw, 0);
    }
  },
};

function buildBridge(B) {
  const i = B.ci0, x = B.px[i], z = B.pz[i], ang = Math.atan2(B.tz[i], B.tx[i]), rng = B.rng, T = new Soup();
  const y0 = B.py[i], bed = B.wlc - .5 - y0, spring = B.wlc + .08 - y0, wHalf = ROAD_HALF + .34, A = 1.3;
  const yd = u => B.py[clamp(Math.round(i + u / PATH_STEP), 0, B.n - 1)] - y0;
  const crown = yd(0) - .34;
  const yArch = u => spring + (crown - spring) * Math.sqrt(Math.max(0, 1 - (u / A) * (u / A)));
  const mc = () => mixC(COL.stoneD, COL.stoneL, rng());
  for (let k = -5; k < 5; k++) {
    const u = (k + .5) * .62, top = yd(u);
    T.box(.63, .26, wHalf * 2 - .1, u, top - .16, 0, COL.stoneD, { l: L_MASON });
    for (const side of [-1, 1]) {
      const zz = side * wHalf;
      T.box(.63, .52, .3, u, top + .22, zz, mc(), { l: L_MASON });
      if (k % 2 === 0) T.box(.3, .14, .36, u, top + .55, zz, mc(), { l: L_MASON });
      const bot = Math.abs(u) < A ? yArch(u) : bed - .3;
      if (top - .05 - bot > .04) T.box(.63, top - .05 - bot, .3, u, (top - .05 + bot) / 2, zz, mc(), { l: L_MASON });
    }
  }
  for (const side of [-1, 1]) {
    for (let k = 0; k <= 8; k++) { const th = PI * k / 8, u = Math.cos(th) * A; T.box(.42, .22, .38, u, spring + (crown - spring) * Math.sin(th) - .05, side * wHalf, COL.stoneL, { l: L_MASON, r: [0, 0, th - HPI] }); }
    for (const u of [-3.25, 3.25]) { const t = yd(u); T.box(.5, 1.25, .5, u, t + .3, side * wHalf, mc(), { l: L_MASON }); T.box(.62, .13, .62, u, t + .98, side * wHalf, COL.stoneL, { l: L_MASON }); T.cone(.2, .25, u, t + 1.15, side * wHalf, COL.stoneD, { n: 4, l: L_ROCK }); }
  }
  if (B.bio.key === 'frost') for (const side of [-1, 1]) for (let u = -1.15; u <= 1.16; u += .21) { const h = rng.range(.12, .55); T.cone(.04 + .03 * rng(), h, u, yArch(u) - h / 2 - .04, side * (wHalf + .03), COL.ice, { n: 5, r: [PI, 0, 0], rough: .14, emis: .012 }); }
  B.put(T, x, z, { y: y0, ry: -ang, ao: null });
  B.bridge = { x, z, y: y0 };
}

function buildPads(B) {
  const bright = B.bio.key === 'frost' || B.bio.key === 'dunes', top = bright ? C(0x5a6070) : C(0x8e929e), rim = bright ? C(0x363a46) : C(0x565a66), brass = mulC(COL.brass, bright ? 1.7 : 1.25);
  for (const p of B.pads) {
    const T = new Soup(), rng = B.rng;
    T.cyl(1.36, .34, 0, .12, 0, mulC(rim, .8), { n: 8, l: L_MASON, r: [0, PI / 8, 0] });
    T.cyl(1.2, .05, 0, .3, 0, top, { n: 8, l: L_MASON, r: [0, PI / 8, 0], emis: .03 });
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; T.box(.46, .2, .28, Math.cos(a) * 1.34, .1 + rng() * .06, Math.sin(a) * 1.34, mixC(rim, top, rng() * .5), { l: L_ROCK, r: [rng.range(-.1, .1), -a + HPI, 0], emis: .026 }); }
    for (let k = 0; k < 8; k++) { const a = (k + .5) / 8 * TAU; T.box(.62, .03, .09, Math.cos(a) * .8, .333, Math.sin(a) * .8, brass, { l: L_METAL, rough: .4, emis: .07, jit: 0, r: [0, -a + HPI, 0] }); }
    for (const r of [0, HPI]) T.box(.5, .03, .09, 0, .333, 0, brass, { l: L_METAL, rough: .4, emis: .07, jit: 0, r: [0, r, 0] });
    B.put(T, p.x, p.z, { y: p.y0, ry: rng() * TAU, ao: [0, .3, .7] });
  }
}

function buildKeep(B) {
  const rng = B.rng, kx = B.kx, ky = B.keepY, oz = -12.35;
  const TG = new Soup(), TT = new Soup();
  const st = COL.stone, sdk = COL.stoneD, sl = COL.stoneL;
  const mc = () => mixC(sdk, sl, rng() * .8 + .1);
  const mas = (S, w, h, d, x, y, z, c, o = {}) => S.box(w, h, d, x, y, z, c || mc(), Object.assign({ l: L_MASON }, o));
  mas(TG, 10.6, .5, 6.0, 0, -.2, -2.9, sdk);
  for (let k = 0; k < 9; k++) mas(TG, 1.1, .16, .55, -4.4 + k * 1.1, .1, .25, mc());
  const tower = (x, z, w, h, broken) => {
    mas(TG, w + .34, .6, w + .34, x, .3, z, sdk); mas(TG, w, h, w, x, h / 2, z, st, { jit: .03 });
    for (let c = 0; c < 4; c++) mas(TG, w + .04, .22, w + .04, x, .9 + c * (h - 1.2) / 3.2, z, mc());
    mas(TG, w + .36, .3, w + .36, x, h + .12, z, sl);
    for (const [dx, dz] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) { if (broken && rng() < .55) continue; mas(TG, .42, broken ? rng.range(.2, .5) : .48, .42, x + dx * (w / 2 - .05), h + .5, z + dz * (w / 2 - .05)); }
    TG.box(.14, .8, .1, x, h * .62, z + w / 2 + .01, COL.black, { jit: 0 }); TG.box(.1, .8, .14, x + w / 2 + .01, h * .5, z, COL.black, { jit: 0 });
    if (broken) for (let k = 0; k < 3; k++) TG.rock(rng.range(.22, .4), x + rng.range(-1.2, 1.4), .15, z + rng.range(.9, 1.6), mc());
  };
  tower(2.3, -.75, 1.95, 3.9, true);
  mas(TG, 2.7, 1.25, 1.3, 0, 3.2, -.75, st);
  for (let k = 0; k <= 8; k++) { const th = PI * k / 8; mas(TG, .4, .3, 1.4, Math.cos(th) * 1.12, 1.5 + Math.sin(th) * 1.12, -.75, sl, { r: [0, 0, th - HPI] }); }
  for (const s of [-1, 1]) { mas(TG, .5, .9, 1.3, s * 1.12, 2.3, -.75, st); mas(TG, .3, 1.5, 1.34, s * 1.2, .75, -.75, sl); }
  TG.box(2.2, 2.7, .2, 0, 1.35, -1.3, COL.black, { jit: 0 }); TG.box(2.2, .2, 1.2, 0, 2.75, -.8, COL.black, { jit: 0 });
  for (const bx of [-.8, -.4, 0, .4, .8]) { TG.box(.07, .95, .07, bx, 2.15, -.3, COL.iron, { l: L_METAL }); TG.cone(.06, .16, bx, 1.6, -.3, COL.iron, { n: 4, l: L_METAL, r: [PI, 0, 0] }); }
  for (const by of [1.95, 2.4]) TG.box(2.0, .07, .07, 0, by, -.3, COL.iron, { l: L_METAL });
  for (const bx of [-1.02, -.34, .34, 1.02]) mas(TG, .42, .44, .42, bx, 4.05, -.3);
  mas(TG, 2.9, .2, 1.5, 0, 3.9, -.75, sl);
  const run = (x0, dir, hs) => hs.forEach((h, k) => {
    const x = x0 + dir * (k + .5) * 1.35; mas(TG, 1.35, h, .95, x, h / 2, -.95, k & 1 ? st : mc());
    if (h > 2.4) { mas(TG, 1.45, .2, 1.1, x, h + .1, -.95, sl); for (const dx of [-.4, .4]) mas(TG, .4, .42, .3, x + dx, h + .4, -.55); }
    else for (let j = 0; j < 3; j++) if (rng() < .7) mas(TG, rng.range(.3, .55), rng.range(.2, .6), .9, x + rng.range(-.4, .4), h + .15, -.95);
    if (h < 1.6) for (let j = 0; j < 3; j++) TG.rock(rng.range(.2, .42), x + rng.range(-.7, .7), .12, rng.range(-.2, .9) - .5, mc());
  });
  run(-3.3, -1, [3.1, 3.1, 2.3, 1.3, .6]); run(3.3, 1, [3.0, 2.0, 1.1]);
  for (let k = 0; k < 5; k++) { const h = [3.4, 2.4, 3.6, 1.6, 2.8][k], x = -4.7 + k * 1.3; mas(TG, 1.3, h, .7, x, h / 2, -5.3); if (h > 3) TG.box(.36, 1.0, .74, x, h * .62, -5.3, COL.black, { jit: 0 }); }
  mas(TG, .7, 2.6, 3.4, -5.0, 1.3, -3.4); mas(TG, .7, 1.2, 1.0, -5.0, .6, -1.5);
  for (let k = 0; k < 4; k++) TG.seg([-4.6, 2.5 - k * .12, -4.9 + k * .7], [-1.6 + rng() * .8, 1.2 + rng(), -4.6 + k * .7], .08, .07, COL.woodD, { l: L_WOOD, n: 4 });
  PROP.barrel(TG, -3.6, .05, -2.2, 1.1, rng); PROP.barrel(TG, -3.1, .05, -2.6, 1, rng); PROP.crate(TG, -3.9, .05, -3.2, .55, rng, .4);
  clothPanel(TG, { x0: 1.85, x1: 2.75, yTop: 3.2, len: 1.6, z: .25, col: COL.clothR, col2: mulC(COL.gold, .6), rng, sway: .5, rag: .7 });
  for (const s of [-1, 1]) { TG.seg([s * 1.32, 1.9, -.08], [s * 1.32, 2.1, .32], .035, .03, COL.iron, { l: L_METAL, n: 4 }); TG.cyl(.09, .14, s * 1.32, 2.14, .34, COL.iron, { n: 6, l: L_METAL, rt: 1.4 }); B.fires.push({ x: kx + s * 1.32, y: ky + 2.3, z: oz + .34, size: .42, type: 'sconce' }); }
  TG.cyl(1.5, 2.4, 2.4, 1.2, -4.2, sdk, { n: 8, l: L_MASON, rt: .92 });
  for (let k = 0; k < 8; k++) { const a = (k + .5) / 8 * TAU, h = rng.range(.2, 1.3); if (rng() < .3) continue; mas(TG, .9, h, .4, 2.4 + Math.cos(a) * 1.2, 2.4 + h / 2, -4.2 + Math.sin(a) * 1.2, null, { r: [0, -a + HPI, 0] }); }
  const bx = -2.6, bz = -.95, bh = 7.3;
  TT.cyl(1.9, 1.3, bx, .65, bz, sdk, { n: 8, l: L_MASON, rt: .84 });
  TT.cyl(1.52, bh, bx, bh / 2, bz, st, { n: 8, l: L_MASON, rt: .9, jit: .03 });
  for (let c = 0; c < 6; c++) TT.cyl(1.54 - c * .027, .2, bx, 1.7 + c * 1.0, bz, mc(), { n: 8, l: L_MASON });
  TT.cyl(1.42, .55, bx, bh - .15, bz, sl, { n: 8, l: L_MASON, rt: 1.26 });
  TT.cyl(1.82, .22, bx, bh + .22, bz, st, { n: 8, l: L_MASON });
  for (let k = 0; k < 8; k++) { const a = (k + .5) / 8 * TAU; if (k === 1) continue; mas(TT, .6, .5, .32, bx + Math.cos(a) * 1.6, bh + .58, bz + Math.sin(a) * 1.6, null, { r: [0, -a + HPI, 0] }); }
  for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + .4; TT.box(.12, .9, .12, bx + Math.cos(a) * 1.45, bh * (.4 + (k & 1) * .22), bz + Math.sin(a) * 1.45, COL.black, { jit: 0, r: [0, -a, 0] }); }
  for (let k = 0; k < 5; k++) { const a = k / 5 * TAU + .2; TT.seg([bx + Math.cos(a) * 1.4, bh - .55, bz + Math.sin(a) * 1.4], [bx + Math.cos(a) * 2.2, bh - .4, bz + Math.sin(a) * 2.2], .07, .06, COL.woodD, { l: L_WOOD, n: 4 }); }
  TT.cyl(.6, .55, bx, bh + .6, bz, sdk, { n: 8, l: L_MASON });
  TT.cyl(.72, .4, bx, bh + 1.06, bz, COL.iron, { n: 8, l: L_METAL, rt: 1.4, rough: .7 });
  for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + .5; TT.seg([bx + Math.cos(a) * .72, bh + .35, bz + Math.sin(a) * .72], [bx + Math.cos(a) * .96, bh + 1.22, bz + Math.sin(a) * .96], .04, .04, COL.iron, { l: L_METAL, n: 4 }); }
  TT.cyl(.9, .1, bx, bh + 1.24, bz, COL.ember, { n: 8, emis: .5, jit: 0 });
  for (let k = 0; k < 4; k++) { const a = k * 1.3; TT.seg([bx + Math.cos(a) * .7, bh + 1.28, bz + Math.sin(a) * .7], [bx - Math.cos(a) * .6, bh + 1.48, bz - Math.sin(a) * .6], .1, .09, mulC(COL.bark, .7), { l: L_WOOD, n: 5, emis: .05 }); }
  clothPanel(TT, { x0: bx - .45, x1: bx + .45, yTop: 5.2, len: 2.3, z: bz + 1.5, col: COL.clothR, col2: mulC(COL.gold, .6), rng, sway: .45 });
  B.structs.push({ soup: new Soup().merge(TG, { p: [kx, ky, oz], ao: [0, .9, .7] }), cx: kx, cy: ky, cz: oz - 2.5, kind: 'keep' });
  B.structs.push({ soup: new Soup().merge(TT, { p: [kx, ky, oz], ao: [0, 1.4, .65] }), cx: kx + bx, cy: ky, cz: oz + bz, kind: 'beaconTower' });
  B.beacon = { x: kx + bx, y: ky + bh + 1.45, z: oz + bz };
  B.gate = { x: kx, y: ky, z: -11.4 };
}

function buildCave(B) {
  const rng = B.rng, zc = B.zc, T = new Soup(), D = new Soup();
  let i0 = 0; for (let i = 0; i < B.n; i++) if (B.px[i] >= -14.6) { i0 = i; break; }
  const y0 = B.py[i0], ox = -14.5;
  const rk = (r, x, y, z, o = {}) => T.rock(r, x, y, z, mixC(COL.stoneD, COL.stone, rng() * .7), o);
  for (const s of [-1, 1]) { rk(1.3, .1, .65, s * 2.45); rk(1.1, .2, 1.9, s * 2.3); rk(.95, .2, 2.95, s * 1.95); rk(.62, 1.0, .3, s * 2.15); rk(.45, 1.5, .2, s * 1.95); }
  rk(1.35, .15, 3.65, 0, { sq: .55 }); rk(1.05, .25, 3.55, -1.05, { sq: .6 }); rk(1.05, .25, 3.55, 1.05, { sq: .6 });
  for (let k = 0; k < 4; k++) rk(2.3, -1.2 - k * .85, 4.3 + k * .3, rng.range(-.6, .6), { sq: .58 });
  for (const zz of [-1.25, -.75, -.2, .35, .9, 1.3]) T.cone(.15 + rng() * .06, .45 + rng() * .5, .3 + rng() * .2, 2.85, zz, mulC(COL.stoneL, .9), { n: 5, l: L_ROCK, r: [PI, 0, 0] });
  if (B.bio.key === 'frost') for (let zz = -1.4; zz <= 1.41; zz += .2) { const h = rng.range(.2, .75); T.cone(.045 + .03 * rng(), h, .62 + rng() * .1, 2.9 - h / 2, zz, COL.ice, { n: 5, r: [PI, 0, 0], rough: .14, emis: .012 }); }
  T.box(3.8, .2, 3.7, -1.9, 3.05, 0, COL.black, { jit: 0 }); T.box(.2, 3.4, 3.7, -3.45, 1.5, 0, COL.black, { jit: 0 });
  for (const s of [-1, 1]) T.box(3.8, 3.2, .2, -1.9, 1.5, s * 1.82, mulC(COL.stoneD, .25), { l: L_ROCK, jit: 0 });
  for (const s of [-1, 1]) { T.seg([1.7, 0, s * 2.5], [1.78, 1.6, s * 2.55], .055, .035, COL.woodD, { l: L_WOOD }); PROP.skull(T, 1.78, 1.72, s * 2.55, .17, s * .5 + 1.2); }
  const Bn = new Soup(); PROP.bones(Bn, rng, 6); T.merge(Bn, { p: [2.2, .02, 2.2], ao: null }); const Bn2 = new Soup(); PROP.bones(Bn2, rng, 5); T.merge(Bn2, { p: [2.6, .02, -2.3], ao: null });
  for (const xx of [-.35, -.95, -1.55, -2.2, -2.85]) D.quad([xx, 0, 1.8], [xx, 0, -1.8], [xx, 3.0, -1.8], [xx, 3.0, 1.8], WHITE, L_PLAIN, 1);
  B.structs.push({ soup: new Soup().merge(T, { p: [ox, y0, zc], ao: null }), cx: ox - 1.2, cy: y0, cz: zc, kind: 'cave', extras: [{ soup: new Soup().merge(D, { p: [ox, y0, zc], ao: null }), mat: MAT.dark, order: 2 }] });
  B.cave = { x: ox, y: y0, z: zc, s: Math.max(.6, (i0 - 5) * PATH_STEP) };
}

function scatterProps(B) {
  const rng = B.rng, placed = [], H = B.heightAt;
  const free = (x, z, r, roadMin = .6) => {
    if (Math.abs(x) > BH - .7 - r || Math.abs(z) > BH - .7 - r) return false;
    if (B.dRoadAt(x, z) < ROAD_HALF + roadMin + r) return false;
    if (B.dStrAt(x, z) < 1.5 + r) return false;
    for (const p of B.pads) if (dist2(x, z, p.x, p.z) < (2.15 + r) * (2.15 + r)) return false;
    if (Math.abs(x - B.kx) < 5.7 + r && z < -11.2 + r) return false;
    if (x < -12.4 && Math.abs(z - B.zc) < 3.4 + r) return false;
    for (const q of B.ponds) if (dist2(x, z, q.x, q.z) < (q.r * 1.25 + .9 + r) * (q.r * 1.25 + .9 + r)) return false;
    for (const q of placed) if (dist2(x, z, q[0], q[1]) < (q[2] + r) * (q[2] + r)) return false;
    return true;
  };
  const waterD = (x, z) => { let d = B.dStrAt(x, z); for (const q of B.ponds) d = Math.min(d, Math.hypot(x - q.x, z - q.z) - q.r); return d; };
  const slope = (x, z) => Math.abs(H(x + .5, z) - H(x - .5, z)) + Math.abs(H(x, z + .5) - H(x, z - .5));
  const find = (r, o = {}) => {
    for (let t = 0; t < 90; t++) {
      const x = rng.range(-BH + 1, BH - 1), z = rng.range(-BH + 1, BH - 1);
      if (!free(x, z, r, o.roadMin)) continue;
      if (!o.steep && slope(x, z) > (o.maxSlope || .32)) continue;
      const dr = B.dRoadAt(x, z); if (o.near && dr > o.near) continue; if (o.far && dr < o.far) continue;
      if (o.water && waterD(x, z) > o.water) continue;
      return [x, z];
    }
    return null;
  };
  const drop = (build, r, o = {}) => { const p = o.at || find(r, o); if (!p) return null; const T = new Soup(); build(T); B.put(T, p[0], p[1], { ry: o.ry === undefined ? rng() * TAU : o.ry, s: o.s, r: o.r, dy: o.dy, ao: o.ao }); placed.push([p[0], p[1], r]); return p; };
  const beside = (smin, smax, d, r) => {
    for (let t = 0; t < 40; t++) {
      const i = clamp(Math.round(rng.range(smin, smax) / PATH_STEP), 2, B.n - 3), side = rng.sign();
      const x = B.px[i] - B.tz[i] * side * (ROAD_HALF + d), z = B.pz[i] + B.tx[i] * side * (ROAD_HALF + d);
      if (free(x, z, r, d - r - .05) && slope(x, z) < .4) return [x, z, Math.atan2(B.tz[i], B.tx[i]), side];
    }
    return null;
  };
  const bio = B.bio;
  const at = (x, z, build, r, T0) => { if (Math.abs(x) > BH - .8 || Math.abs(z) > BH - .8) return; const T = T0 || new Soup(); if (!T0) build(T); B.put(T, x, z, { ry: rng() * TAU }); if (r) placed.push([x, z, r]); };
  drop(T => PROP.towerRuin(T, rng), 2.9, { far: 3.6 });
  drop(T => PROP.well(T, rng), 1.3, { near: 5.5, far: 2.6 });
  drop(T => PROP.statue(T, rng), 1.2, { near: 6, far: 2.4 });
  drop(T => PROP.ribcage(T, rng), 2.4, { far: 2.8 });
  for (let k = 0; k < 3; k++) { const len = rng.range(4, 7); drop(T => PROP.wallRun(T, rng, len, rng.range(1.8, 3.2)), len * .5, { far: 1.6 }); }
  { const g = find(3.2, { far: 3.4 }); if (g) {
      const ry = rng() * TAU, cs = Math.cos(ry), sn = Math.sin(ry);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) { if (rng() < .2) continue; const lx = (c - 1.5) * 1.15 + rng.range(-.15, .15), lz = (r - 1) * 1.5 + rng.range(-.15, .15), T = new Soup(); PROP.grave(T, rng); B.put(T, g[0] + lx * cs + lz * sn, g[1] - lx * sn + lz * cs, { ry: ry + rng.range(-.2, .2) }); }
      for (const [lx, lz, a, len] of [[0, -2.5, 0, 4.6], [-2.8, -.2, HPI, 4.2], [2.8, .5, HPI, 3]]) { const T = new Soup(); PROP.fence(T, rng, len); B.put(T, g[0] + lx * cs + lz * sn, g[1] - lx * sn + lz * cs, { ry: ry + a }); }
      const T = new Soup(); PROP.tree(T, rng, 3.6); B.put(T, g[0] + 2.3 * cs - 2.0 * sn, g[1] - 2.3 * sn - 2.0 * cs, {});
      placed.push([g[0], g[1], 3.2]);
    } }
  for (let k = 0; k < 2; k++) { const p = beside(10, B.L - 8, 1.25, 1.1); if (p) drop(T => PROP.cart(T, rng, k === 1), 1.1, { at: p, ry: -p[2] + rng.range(-.3, .3), r: k === 1 ? [0, -p[2] + .4, .22] : undefined }); }
  for (let k = 0; k < 4; k++) { const p = beside(8, B.L - 6, .75, .3); if (p) { const len = rng.range(2.6, 4.2); drop(T => PROP.palisade(T, rng, len), 1.0, { at: p, ry: -p[2] }); } }
  for (let k = 0; k < 4; k++) { const p = beside(8, B.L - 6, 1.0, .4); if (p) { const len = rng.range(2.5, 4.5); drop(T => PROP.fence(T, rng, len), 1.2, { at: p, ry: -p[2] + rng.range(-.15, .15) }); } }
  for (let k = 0; k < 4; k++) { const p = beside(8, B.L - 5, .8, .25); if (p) drop(T => PROP.banner(T, rng, k & 1 ? COL.clothR : COL.clothB), .3, { at: p, ry: -p[2] + HPI * p[3] }); }
  { const p = beside(B.L * .3, B.L * .7, .8, .3); if (p) drop(T => PROP.signpost(T, rng), .3, { at: p, ry: -p[2] }); }
  { const p = beside(12, B.L * .6, 1.3, .6); if (p) drop(T => PROP.gibbet(T, rng), .6, { at: p, ry: -p[2] + HPI }); }
  for (const pad of B.pads) {
    if (rng() < .35) continue;
    const a = rng() * TAU, x = pad.x + Math.cos(a) * 2.25, z = pad.z + Math.sin(a) * 2.25;
    if (B.dRoadAt(x, z) < ROAD_HALF + .7 || B.dStrAt(x, z) < 1.8) continue;
    const T = new Soup(); PROP.barrel(T, 0, 0, 0, 1, rng); if (rng() < .6) PROP.barrel(T, .5, 0, .15, .9, rng); if (rng() < .7) PROP.crate(T, -.1, 0, .55, .5, rng, rng()); if (rng() < .4) PROP.crate(T, -.12, .5, .55, .38, rng, rng());
    B.put(T, x, z, { ry: rng() * TAU }); placed.push([x, z, .8]);
  }
  for (let k = 0; k < 6; k++) { const x = B.lay.cave.x + rng.range(1.8, 7), z = B.zc + rng.sign() * rng.range(1.9, 5); if (free(x, z, .4, .2)) drop(T => PROP.bones(T, rng, rng.int(4, 7)), .5, { at: [x, z], ao: null }); }
  for (let k = 0; k < 5; k++) drop(T => PROP.bones(T, rng, rng.int(3, 5)), .45, { ao: null });
  for (let k = 0; k < 3; k++) drop(T => PROP.cairn(T, rng), .5, {});
  BIOME_DRESS[bio.key]({ B, rng, drop, find, beside, free, at, H, placed, slope });
  const trees = [];
  for (const [kind, cnt, h0, h1] of bio.trees) for (let k = 0; k < cnt; k++) { const h = rng.range(h0, h1), p = drop(T => PROP[kind](T, rng, h), kind === 'tree' || kind === 'charred' ? .55 : .8, { far: 1.0, water: kind === 'palm' && k < 6 ? 5.5 : 0 }); if (p && kind === 'tree') trees.push([p, h]); }
  for (let k = 0; k < bio.webs && k < trees.length; k++) {
    const [p, h] = trees[k], y = H(p[0], p[1]), a = rng() * TAU, T = new Soup();
    PROP.web(T, [0, h * .42, 0], [Math.cos(a) * .9, h * .55, Math.sin(a) * .9], [Math.cos(a) * .7, h * .18, Math.sin(a) * .7]);
    B.put(T, p[0], p[1], { y, ao: null });
  }
  for (let k = 0; k < bio.stumps; k++) drop(T => PROP.stump(T, rng), .4, {});
  for (let k = 0; k < bio.rocks; k++) { const r = rng() < .2 ? rng.range(.6, 1.25) : rng.range(.16, .5); drop(T => T.rock(r, 0, r * .28, 0, mixC(COL.stoneD, COL.stone, rng())), r * .8, { steep: true, roadMin: .25, ao: [0, r * .6, .6] }); }
  for (let k = 0; k < bio.tufts; k++) {
    const x = rng.range(-BH + .8, BH - .8), z = rng.range(-BH + .8, BH - .8);
    if (B.dRoadAt(x, z) < ROAD_HALF + .35 || waterD(x, z) < 1.1 || slope(x, z) > .5) continue;
    if (Math.abs(x - B.kx) < 5.4 && z < -11.6) continue;
    const T = new Soup(); PROP.tuft(T, rng); B.put(T, x, z, { ao: null, s: rng.range(.8, 1.5) });
  }
  for (let k = 0; k < 60; k++) {
    const i = rng.int(16, B.n - 12), side = rng.sign(), d = ROAD_HALF + rng.range(.1, .45), x = B.px[i] - B.tz[i] * side * d, z = B.pz[i] + B.tx[i] * side * d;
    if (B.dStrAt(x, z) < 2.4) continue;
    const r = rng.range(.08, .17), T = new Soup(); T.rock(r, 0, r * .3, 0, mixC(COL.roadD, COL.stone, rng())); B.put(T, x, z, { ao: null });
  }
}


function ribbon(S, a, b, c, d, col, sw) {
  _sa.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); _sb.set(d[0] - a[0], d[1] - a[1], d[2] - a[2]); _sn.crossVectors(_sa, _sb);
  const l = _sn.length() || 1, nx = _sn.x / l, ny = _sn.y / l, nz = _sn.z / l, P = [a, b, c, d];
  for (const [order, s] of [[[0, 1, 2, 0, 2, 3], 1], [[0, 2, 1, 0, 3, 2], -1]]) for (const k of order) { const p = P[k]; S.v(p[0], p[1], p[2], nx * s, ny * s, nz * s, col[0], col[1], col[2], p[0] * .5, p[1] * .5, L_PLAIN, .8, sw[k], 0); }
}

Object.assign(PROP, {
  pine(S, rng, h) {
    const bark = mulC(COL.bark, .8 + .4 * rng()), lx = rng.range(-.05, .05), lz = rng.range(-.05, .05);
    S.seg([0, -.1, 0], [lx * h, h * .94, lz * h], h * .05, h * .012, bark, { l: L_WOOD, n: 6 });
    const tiers = Math.round(4 + h * .55);
    for (let k = 0; k < tiers; k++) {
      const u = k / (tiers - 1), y = h * (.2 + .66 * u), r = h * (.33 - .23 * u) * rng.range(.88, 1.1), hh = h * (.3 - .11 * u), ph = rng() * TAU;
      const c = mulC(mixC(COL.leaf, COL.leafL, rng() * .6 + u * .25), .8 + .35 * rng());
      S.add(gCyl(9, 0), {
        s: [r, hh, r], p: [lx * y + rng.range(-.03, .03), y + hh * .5, lz * y + rng.range(-.03, .03)], r: [rng.range(-.07, .07), ph, rng.range(-.07, .07)], c, l: L_THATCH, uvs: .5,
        deform: v => { if (v.y < 0) { const j = .8 + .4 * vnoise(Math.atan2(v.z, v.x) * 2.2 + ph, k * 3.1, 5); v.x *= j; v.z *= j; v.y -= hh * .25 * (j - .8); } },
        cf: v => .62 + .38 * sat(Math.hypot(v.x, v.z) / r), swayf: v => .14 * Math.hypot(v.x, v.z) / r * (.4 + u),
      });
    }
  },
  willow(S, rng, h) {
    const bark = mulC(COL.bark, .85 + .3 * rng());
    let p = [0, -.1, 0], d = [rng.range(-.25, .25), 1, rng.range(-.25, .25)], r = h * .085; const tips = [];
    for (let k = 0; k < 4; k++) {
      const l = h * rng.range(.15, .2), q = [p[0] + d[0] * l, p[1] + d[1] * l, p[2] + d[2] * l]; S.seg(p, q, r, r * .8, bark, { l: L_WOOD, n: 6 }); p = q; r *= .8;
      d = [d[0] + rng.range(-.4, .4), 1, d[2] + rng.range(-.4, .4)]; const dl = Math.hypot(d[0], d[1], d[2]); d = d.map(v => v / dl);
    }
    for (let k = 0; k < 4; k++) { const a = rng() * TAU + k * 1.6, len = h * rng.range(.28, .42), q = [p[0] + Math.cos(a) * len * .8, p[1] + len * rng.range(.1, .45), p[2] + Math.sin(a) * len * .8]; S.seg(p, q, r, r * .45, bark, { l: L_WOOD, n: 5, sway: .12 }); tips.push(q); }
    tips.push([p[0], p[1] + h * .08, p[2]]);
    for (const t of tips) for (let j = 0; j < 2; j++) {
      const rb = h * rng.range(.2, .29), c = mulC(mixC(COL.leaf, COL.leafL, rng()), .75 + .4 * rng()), cx = t[0] + rng.range(-.25, .25), cy = t[1] + rng.range(-.05, .3), cz = t[2] + rng.range(-.25, .25);
      S.ico(rb, cx, cy, cz, c, { sc: [1.15, .48, 1.15], d: 1, l: L_THATCH, sway: .2, r: [rng.range(-.2, .2), rng() * TAU, rng.range(-.2, .2)], cf: v => .6 + .4 * sat(v.y / (rb * .5) + .5) });
      for (let s = 0; s < 7; s++) {
        const a = rng() * TAU, rad = rb * rng.range(.45, 1.05), x = cx + Math.cos(a) * rad, z = cz + Math.sin(a) * rad, len = rng.range(.5, 1.5), y0 = cy - rb * .1, wa = rng() * TAU, wx = Math.cos(wa) * .045, wz = Math.sin(wa) * .045, cc = mulC(mixC(COL.leaf, COL.leafL, rng()), .6 + .3 * rng());
        ribbon(S, [x - wx, y0, z - wz], [x + wx, y0, z + wz], [x + wx * .4, y0 - len, z + wz * .4], [x - wx * .4, y0 - len, z - wz * .4], cc, [.2, .2, .95, .95]);
      }
    }
    for (let k = 0; k < 4; k++) { const a = k * 1.57 + rng(); S.seg([Math.cos(a) * h * .04, h * .17, Math.sin(a) * h * .04], [Math.cos(a) * h * .22, -.1, Math.sin(a) * h * .22], h * .03, h * .018, bark, { l: L_WOOD, n: 5 }); }
  },
  charred(S, rng, h) { PROP.tree(S, rng, h, { bark: mulC(COL.bark, .7 + .3 * rng()), tip: [.6, .16, .03], tipEmis: .09 }); },
  palm(S, rng, h) {
    const bark = mulC(C(0x6a5238), .85 + .3 * rng()), a0 = rng() * TAU, bend = rng.range(.1, .3), N = 7;
    let p = [0, -.1, 0];
    for (let k = 0; k < N; k++) { const u = (k + 1) / N, off = bend * h * u * u, q = [Math.cos(a0) * off, h * u, Math.sin(a0) * off], r = h * (.052 - .02 * u); S.seg(p, q, r * (k & 1 ? 1.1 : 1), r * .9, mulC(bark, k & 1 ? .82 : 1.05), { l: L_WOOD, n: 6, sway: u > .6 ? .06 : 0 }); p = q; }
    const top = p, nf = rng.int(8, 10);
    for (let f = 0; f < nf; f++) {
      const a = f / nf * TAU + rng.range(-.25, .25), len = h * rng.range(.34, .46), up = rng.range(.2, .62), c = mulC(mixC(COL.leaf, COL.leafL, rng()), .8 + .4 * rng()), M = 5;
      let prev = null;
      for (let k = 0; k <= M; k++) {
        const u = k / M, out = len * u, y = top[1] + len * (up * u - .95 * u * u), cx = top[0] + Math.cos(a) * out, cz = top[2] + Math.sin(a) * out, w = len * .2 * Math.sin(Math.min(1, u * 1.1 + .1) * PI) + .015, sx = -Math.sin(a) * w, sz = Math.cos(a) * w, sw = .2 + .8 * u;
        const cur = { c: [cx, y, cz], l: [cx + sx, y - w * .6, cz + sz], r: [cx - sx, y - w * .6, cz - sz], sw };
        if (prev) { ribbon(S, prev.c, cur.c, cur.l, prev.l, c, [prev.sw, sw, sw, prev.sw]); ribbon(S, prev.c, prev.r, cur.r, cur.c, mulC(c, .8), [prev.sw, prev.sw, sw, sw]); }
        prev = cur;
      }
    }
    for (let k = 0; k < 3; k++) S.ico(h * .03, top[0] + rng.range(-.12, .12), top[1] - .1, top[2] + rng.range(-.12, .12), C(0x3a2a1c), { d: 0 });
  },
  cactus(S, rng) {
    const c = mulC(C(0x4f6a3c), .8 + .3 * rng()), hh = rng.range(1.0, 1.9), r = .17;
    S.cyl(r, hh, 0, hh / 2 - .05, 0, c, { n: 7 }); S.sph(r, 0, hh - .05, 0, c, { sc: [1, .8, 1], w: 7, h: 4 });
    for (let k = 0, n = rng.int(0, 3); k < n; k++) {
      const a = rng() * TAU, y = hh * rng.range(.35, .6), l = rng.range(.26, .4), up = rng.range(.3, .7), x = Math.cos(a) * l, z = Math.sin(a) * l;
      S.seg([0, y, 0], [x, y + .04, z], r * .62, r * .62, c, { n: 6 }); S.seg([x, y, z], [x, y + up, z], r * .62, r * .58, c, { n: 6 }); S.sph(r * .6, x, y + up, z, c, { w: 6, h: 4 });
    }
    if (rng() < .4) S.ico(.06, 0, hh + .1, 0, C(0xe86a8a), { d: 0, emis: .03 });
  },
  reeds(S, rng) {
    for (let k = 0, n = rng.int(5, 9); k < n; k++) {
      const x = rng.range(-.3, .3), z = rng.range(-.3, .3), hh = rng.range(.6, 1.35), lx = rng.range(-.18, .18), lz = rng.range(-.18, .18), c = mulC(mixC(COL.tuftA, COL.tuftB, rng()), .8 + .4 * rng());
      S.seg([x, -.08, z], [x + lx * .4, hh * .5, z + lz * .4], .022, .018, c, { n: 3, jit: 0 });
      S.seg([x + lx * .4, hh * .5, z + lz * .4], [x + lx, hh, z + lz], .018, .008, c, { n: 3, sway: .5, jit: 0 });
      if (rng() < .45) S.seg([x + lx * .8, hh * .8, z + lz * .8], [x + lx * 1.02, hh * 1.02, z + lz * 1.02], .042, .038, C(0x4a3220), { n: 5, sway: .5 });
    }
  },
  lily(S, rng) {
    for (let k = 0, n = rng.int(2, 4); k < n; k++) {
      const x = rng.range(-.4, .4), z = rng.range(-.4, .4), r = rng.range(.13, .26);
      S.cyl(r, .012, x, .006, z, mulC(mixC(COL.leaf, COL.leafL, rng()), 1.1 + .4 * rng()), { n: 7, jit: .05, r: [0, rng() * TAU, 0] });
      if (rng() < .3) S.ico(.05, x + r * .3, .05, z, C(0xe8c8d8), { d: 0, emis: .03, sc: [1, .7, 1] });
    }
  },
  shroom(S, rng) {
    const col = rng() < .5 ? C(0x4fe0c0) : C(0x7fd0ff);
    for (let k = 0, n = rng.int(3, 6); k < n; k++) {
      const x = rng.range(-.3, .3), z = rng.range(-.3, .3), hh = rng.range(.14, .44), r = hh * rng.range(.45, .7);
      S.cyl(r * .22, hh, x, hh / 2, z, C(0xb8c8b8), { n: 5, emis: .02 });
      S.add(gDome(7, 3), { s: [r, r * .7, r], p: [x, hh - r * .1, z], c: mulC(col, .5), emis: .075, jit: .1, smooth: true });
    }
  },
  log(S, rng) {
    const len = rng.range(1.5, 2.6), r = rng.range(.14, .2), bark = mulC(COL.bark, .9 + .4 * rng());
    S.seg([-len / 2, r * .8, 0], [len / 2, r * .9, 0], r, r * .85, bark, { l: L_WOOD, n: 7 });
    for (const s of [-1, 1]) S.cyl(r * (s < 0 ? .98 : .83), .02, s * len / 2, r * (s < 0 ? .8 : .9), 0, mulC(COL.woodL, .7), { n: 7, l: L_WOOD, r: [0, 0, HPI] });
    for (let k = 0; k < 2; k++) { const x = rng.range(-len * .3, len * .3), a = rng.range(-1, 1); S.seg([x, r, 0], [x + rng.range(-.15, .15), r + .35 * Math.cos(a), .35 * Math.sin(a)], r * .35, r * .2, bark, { l: L_WOOD, n: 5 }); }
  },
  basalt(S, rng) {
    const n = rng.int(5, 10), R = .3, G = [[0, 0], [1, 0], [-1, 0], [.5, .87], [-.5, .87], [.5, -.87], [-.5, -.87], [1.5, .87], [-1.5, -.87], [0, 1.73]];
    for (let k = 0; k < n; k++) {
      const q = G[k], hh = rng.range(.35, 2.2) * (k < 3 ? 1.25 : .8), c = mulC(mixC(COL.stoneD, COL.stone, rng() * .7), .8 + .3 * rng());
      S.cyl(R * 1.04, hh, q[0] * R * 1.75, hh / 2 - .1, q[1] * R * 1.75, c, { n: 6, l: L_ROCK, r: [0, PI / 6, 0], grad: [-hh / 2, hh * .1, .65] });
      S.cyl(R * .9, .05, q[0] * R * 1.75, hh - .08, q[1] * R * 1.75, mulC(c, 1.3), { n: 6, l: L_ROCK, r: [0, PI / 6, 0] });
    }
  },
  spire(S, rng, hh, cols) {
    let y = 0, r = hh * rng.range(.2, .28), x = 0, z = 0, k = rng.int(0, 3);
    while (y < hh && r > .12) { S.rock(r, x, y + r * .4, z, mulC(cols[k % cols.length], .8 + .3 * rng()), { sq: .62, d: 1 }); y += r * .78; r *= rng.range(.8, .93); x += rng.range(-.08, .08); z += rng.range(-.08, .08); k++; }
  },
  vent(S, rng) {
    for (let k = 0; k < 7; k++) { const a = k / 7 * TAU + rng() * .3, r = rng.range(.2, .34); S.rock(r, Math.cos(a) * .52, r * .3, Math.sin(a) * .52, mulC(mixC(COL.stoneD, COL.stone, rng()), .8), { sq: .8 }); }
    S.cyl(.4, .06, 0, .09, 0, [.8, .22, .03], { n: 8, emis: .3, jit: 0 });
  },
  jar(S, rng) {
    const c = mulC(C(0x9a5a3c), .8 + .35 * rng()), s = rng.range(.8, 1.25);
    S.cyl(.2 * s, .22 * s, 0, .11 * s, 0, c, { n: 8, rt: .62 }); S.cyl(.2 * s, .2 * s, 0, .32 * s, 0, c, { n: 8, rt: 1.0 }); S.cyl(.2 * s, .14 * s, 0, .49 * s, 0, c, { n: 8, rt: 2.0 });
    S.cyl(.09 * s, .1 * s, 0, .6 * s, 0, mulC(c, .9), { n: 8, rt: 1.25 }); S.cyl(.105 * s, .02 * s, 0, .655 * s, 0, COL.black, { n: 8, jit: 0 });
  },
  icicles(S, rng, len, n, maxH) {
    for (let k = 0; k < n; k++) { const x = (k + .5) / n * len - len / 2 + rng.range(-.05, .05), h = rng.range(.15, maxH) * (rng() < .2 ? 1.5 : 1); S.cone(.04 + .035 * rng(), h, x, -h / 2, rng.range(-.04, .04), COL.ice, { n: 5, r: [PI, 0, 0], rough: .14, emis: .012, jit: .1 }); }
  },
  drift(S, rng, r, col) { S.ico(r, 0, r * .04, 0, col, { sc: [1.25, .3, .85], d: 2, smooth: true, rough: .75, jit: .03 }); },
  crystal(S, rng, col, emis) {
    for (let k = 0, n = rng.int(3, 6); k < n; k++) { const hh = rng.range(.3, .9) * (k ? .7 : 1.25), a = rng() * TAU, d = k ? rng.range(.12, .32) : 0; S.add(gOct(), { s: [hh * .22, hh, hh * .22], p: [Math.cos(a) * d, hh * .5, Math.sin(a) * d], r: [rng.range(-.4, .4), rng() * TAU, rng.range(-.4, .4)], c: mulC(col, .8 + .4 * rng()), rough: .12, emis }); }
  },
});

const BIOME_DRESS = {
  ashen(X) { for (let k = 0; k < 3; k++) X.drop(T => PROP.log(T, X.rng), .9, { far: 1.2 }); },
  frost(X) {
    const { B, rng, drop } = X, snow = B.bio.coverCol;
    for (let k = 0; k < 30; k++) { const r = rng.range(.5, 1.25); drop(T => PROP.drift(T, rng, r, snow), r * .35, { roadMin: .5, ao: null, steep: true }); }
    for (const q of B.ponds) for (let k = 0; k < 2; k++) { const a = rng() * TAU, d = q.r + rng.range(.9, 1.3); X.at(q.x + Math.cos(a) * d, q.z + Math.sin(a) * d, T => PROP.crystal(T, rng, COL.ice, .03), .5); }
    for (let k = 0; k < 5; k++) drop(T => PROP.crystal(T, rng, COL.ice, .03), .5, { water: 3.2 });
    for (let k = 0; k < 2; k++) drop(T => PROP.log(T, rng), .9, { far: 1.2 });
    if (B.ponds[0]) B.env.push({ x: B.ponds[0].x, y: B.ponds[0].y + .9, z: B.ponds[0].z, c: 0x7fc8ff, I: 6, d: 7 });
  },
  fen(X) {
    const { B, rng, drop } = X;
    for (let k = 0; k < 52; k++) {
      const u = rng.int(2, B.SP.length - 2), a = B.SP[u - 1], b = B.SP[u + 1], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, off = rng.sign() * rng.range(.95, 1.9), x = B.SP[u][0] - dz / l * off, z = B.SP[u][1] + dx / l * off;
      if (Math.abs(x) > BH - .8 || Math.abs(z) > BH - .8 || B.dRoadAt(x, z) < ROAD_HALF + .9) continue;
      X.at(x, z, T => PROP.reeds(T, rng), 0);
    }
    for (const q of B.ponds) {
      for (let k = 0; k < 9; k++) { const a = rng() * TAU, d = q.r * rng.range(.75, 1.2); X.at(q.x + Math.cos(a) * d, q.z + Math.sin(a) * d, T => PROP.reeds(T, rng), 0); }
      for (let k = 0; k < 4; k++) { const a = rng() * TAU, d = q.r * rng.range(0, .55), T = new Soup(); PROP.lily(T, rng); B.put(T, q.x + Math.cos(a) * d, q.z + Math.sin(a) * d, { y: q.y + .012, ao: null }); }
    }
    const sh = [];
    for (let k = 0; k < 16; k++) { const p = drop(T => PROP.shroom(T, rng), .35, { ao: null }); if (p) sh.push(p); }
    for (let k = 0; k < Math.min(2, sh.length); k++) B.env.push({ x: sh[k][0], y: X.H(sh[k][0], sh[k][1]) + .7, z: sh[k][1], c: 0x45e0b8, I: 5, d: 6 });
    for (let k = 0; k < 5; k++) drop(T => PROP.log(T, rng), .9, { far: 1.2 });
  },
  ember(X) {
    const { B, rng, drop } = X, cols = [COL.stoneD, COL.stone, C(0x5a2a22), COL.stoneD];
    for (let k = 0; k < 9; k++) drop(T => PROP.basalt(T, rng), 1.0, { far: 1.4 });
    for (let k = 0; k < 6; k++) { const hh = rng.range(2.0, 4.2); drop(T => PROP.spire(T, rng, hh, cols), hh * .28, { far: 1.6, steep: true }); }
    for (let k = 0; k < 4; k++) { const p = drop(T => PROP.vent(T, rng), .8, { far: 2.2 }); if (p) B.fires.push({ x: p[0], y: X.H(p[0], p[1]) + .12, z: p[1], size: .5, fx: { layers: 0, smoke: 1.3, embers: 1.1, glow: .55 } }); }
    B.env.push({ x: B.bridge.x, y: B.wlc + .55, z: B.bridge.z, c: 0xff5a1e, I: 44, d: 9, flick: 1 });
    if (B.ponds[0]) { const q = B.ponds[0]; B.env.push({ x: q.x, y: q.y + .7, z: q.z, c: 0xff5a1e, I: 40, d: 9, flick: 1 }); }
    if (B.fallAt) B.env.push({ x: B.fallAt.x - B.fallAt.ox * 1.2, y: B.fallAt.y + .6, z: B.fallAt.z - B.fallAt.oz * 1.2, c: 0xff5a1e, I: 36, d: 8, flick: 1 });
  },
  dunes(X) {
    const { B, rng, drop } = X, cols = B.bio.strata.map(h => C(h));
    for (let k = 0; k < 11; k++) drop(T => PROP.cactus(T, rng), .4, { far: .9 });
    for (let k = 0; k < 6; k++) { const hh = rng.range(2.2, 4.6); drop(T => PROP.spire(T, rng, hh, cols), hh * .28, { far: 1.6, steep: true }); }
    for (const q of B.ponds) {
      for (let k = 0; k < 4; k++) { const a = rng() * TAU, d = q.r + rng.range(1.1, 1.9), h = rng.range(3, 4.4); X.at(q.x + Math.cos(a) * d, q.z + Math.sin(a) * d, T => PROP.palm(T, rng, h), .5); }
      for (let k = 0; k < 7; k++) { const a = rng() * TAU, d = q.r * rng.range(.8, 1.2); X.at(q.x + Math.cos(a) * d, q.z + Math.sin(a) * d, T => PROP.reeds(T, rng), 0); }
    }
    for (const pad of B.pads) {
      if (rng() < .5) continue;
      const a = rng() * TAU, x = pad.x + Math.cos(a) * 2.3, z = pad.z + Math.sin(a) * 2.3; if (!X.free(x, z, .5, .3)) continue;
      const T = new Soup(); PROP.jar(T, rng); if (rng() < .7) { const J = new Soup(); PROP.jar(J, rng); T.merge(J, { p: [.42, 0, .1] }); } if (rng() < .4) { const J = new Soup(); PROP.jar(J, rng); T.merge(J, { p: [.15, 0, .45], r: [1.3, rng() * 3, 0] }); }
      X.at(x, z, () => T, .7, T);
    }
  },
};


const LT = {
  hemi: null, moon: null, fill: null, beacon: null, spots: [], towers: [], flashes: [], torches: [], env: [], envSrc: [], envK: 0,
  beaconBase: 1500, beaconMul: 1, beaconLevel: 1, bp: new THREE.Vector3(), tick: 0, shadowsAt: -1, beaconGutter: 0, beaconOn: 1, cold: 0, emitters: [], spotTimer: 0,
};
function initLights() {
  const S = R.scene;
  LT.hemi = new THREE.HemisphereLight(0x6d83bd, 0x1c1f2a, 1.15); S.add(LT.hemi);
  const sm = window.matchMedia && matchMedia('(pointer: coarse)').matches ? .75 : 1;
  const moon = LT.moon = new THREE.DirectionalLight(0xa9c0f6, 1.55); moon.castShadow = true; moon.shadow.mapSize.set(2048 * sm, 2048 * sm);
  const sc = moon.shadow.camera; sc.left = -31; sc.right = 31; sc.top = 31; sc.bottom = -31; sc.near = 5; sc.far = 130; moon.shadow.bias = -0.0005; moon.shadow.normalBias = 0.06;
  S.add(moon); S.add(moon.target);
  LT.fill = new THREE.DirectionalLight(0x4a5f96, 0.3); LT.fill.position.set(30, 14, 34); S.add(LT.fill);
  const b = LT.beacon = new THREE.PointLight(0xff8a3a, 0, 80, 2); b.castShadow = true; b.shadow.mapSize.set(1024 * sm, 1024 * sm);
  b.shadow.camera.near = .5; b.shadow.camera.far = 80; b.shadow.bias = -0.004; b.shadow.normalBias = 0.05; S.add(b);
  for (let i = 0; i < 3; i++) {
    const s = new THREE.SpotLight(0xff9646, 0, 17, 1.12, .85, 2); s.castShadow = true; s.shadow.mapSize.set(1024 * sm, 1024 * sm);
    s.shadow.camera.near = .4; s.shadow.camera.far = 18; s.shadow.bias = -0.0025; s.shadow.normalBias = 0.04;
    s.position.set(0, 4, 0); S.add(s); S.add(s.target); LT.spots.push({ l: s, owner: null, fade: 0, want: null });
  }
  for (let i = 0; i < 12; i++) { const l = new THREE.PointLight(0xff9646, 0, 11, 2); S.add(l); LT.towers.push(l); }
  for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xffc070, 0, 22, 2); S.add(l); LT.flashes.push({ l, t: 1, dur: 1, i0: 0 }); }
  for (let i = 0; i < 5; i++) { const l = new THREE.PointLight(0xff9a50, 0, 7, 2); S.add(l); LT.torches.push({ l, owner: null, cur: 0 }); }
  for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xff5a1e, 0, 9, 2); S.add(l); LT.env.push(l); }
}
function scheduleShadows(busy) {
  const f = LT.tick = (LT.tick + 1) % 3, all = LT.shadowsAt < 0 || !R.opt; LT.shadowsAt = 0;
  const set = (l, on) => { l.shadow.autoUpdate = false; l.shadow.needsUpdate = (on || all) && l.intensity > 0; };
  set(LT.moon, busy || f === 0);
  if (f === 1 || all) LT.beacon.position.copy(LT.bp);
  set(LT.beacon, f === 1);
  set(LT.spots[0].l, f === 0); set(LT.spots[1].l, f === 2); set(LT.spots[2].l, f === 2);
}
function lightFlash(x, y, z, color, intensity, dur, range = 24) {
  let best = LT.flashes[0];
  for (const f of LT.flashes) { if (f.t >= 1) { best = f; break; } if (f.l.intensity < best.l.intensity) best = f; }
  best.l.position.set(x, y, z); best.l.color.set(color); best.l.distance = range; best.i0 = intensity; best.t = 0; best.dur = dur; best.l.intensity = intensity;
}
function updateLights(dt, t, focusX, focusZ) {
  LT.beaconGutter = Math.max(0, LT.beaconGutter - dt * 1.6);
  const flick = .86 + .1 * n1(t * 6.3, 1) + .06 * n1(t * 17, 2);
  const lvl = LT.beaconLevel * LT.beaconOn * (1 - .55 * LT.beaconGutter * (0.6 + .4 * Math.sin(t * 40)));
  LT.beacon.intensity = LT.beaconBase * LT.beaconMul * (.35 + .65 * lvl) * (lvl > 0.001 ? 1 : 0) * flick * LT.beaconOn;
  if (LT.beaconPos) LT.bp.set(LT.beaconPos.x + n1(t * 5, 3) * .1, LT.beaconPos.y + .5 + n1(t * 4, 4) * .08, LT.beaconPos.z + n1(t * 5, 5) * .1);
  for (const f of LT.flashes) { if (f.t < 1) { f.t += dt / f.dur; const k = Math.max(0, 1 - f.t); f.l.intensity = f.i0 * k * k; } else f.l.intensity = 0; }
  LT.spotTimer -= dt;
  if (LT.spotTimer <= 0) {
    LT.spotTimer = .4;
    const lit = LT.emitters.filter(e => e && e.alive && e.on > .5 && e.spot);
    const key = e => dist2(e.x, e.z, focusX, focusZ) - (e._spot > .2 ? 12 : 0);
    lit.sort((a, b) => key(a) - key(b));
    const want = lit.slice(0, 3);
    for (const s of LT.spots) s.want = (s.owner && want.includes(s.owner)) ? s.owner : null;
    for (const e of want) if (!LT.spots.some(s => s.want === e)) { const s = LT.spots.find(s => !s.want); if (s) s.want = e; }
  }
  for (const e of LT.emitters) if (e) e._spot = 0;
  for (const s of LT.spots) {
    if (s.owner && (!s.owner.alive || s.owner.on < .05)) { if (s.want === s.owner) s.want = null; }
    if (s.owner !== s.want) { s.fade = Math.max(0, s.fade - dt * 4); if (s.fade <= 0) s.owner = s.want; }
    else if (s.owner) s.fade = Math.min(1, s.fade + dt * 3);
    const e = s.owner;
    if (e) {
      e._spot = s.fade;
      s.l.position.set(e.x, e.y + .25, e.z); s.l.target.position.set(e.x + (e.dx || 0) * 1.2, e.y - 3, e.z + (e.dz || 0) * 1.2);
      s.l.color.setRGB(e.r, e.g, e.b); s.l.intensity = e.I * e.on * (e.fl || 1) * s.fade * 1.25;
    } else s.l.intensity = 0;
  }
  for (let i = 0; i < LT.env.length; i++) {
    const l = LT.env[i], e = LT.envSrc[i];
    if (e && LT.envK > .01) { l.position.set(e.x, e.y, e.z); l.color.setHex(e.c); l.distance = e.d; l.intensity = e.I * LT.envK * (e.flick ? .82 + .18 * n1(t * 1.7 + i * 5, i + 11) : 1); } else l.intensity = 0;
  }
  for (let i = 0; i < LT.towers.length; i++) {
    const l = LT.towers[i], e = LT.emitters[i];
    if (e && e.alive) {
      e.fl = .86 + .1 * n1(t * 7 + e.seed, e.seed) + .05 * n1(t * 19 + e.seed, e.seed + 1);
      l.position.set(e.x, e.y, e.z); l.color.setRGB(e.r, e.g, e.b); l.distance = e.range;
      l.intensity = e.I * e.on * e.fl * (1 - .68 * (e._spot || 0));
    } else l.intensity = 0;
  }
}
function updateTorchLights(dt, cands, focusX, focusZ) {
  for (const c of cands) c._ls = c.lI / (1 + dist2(c.lx, c.lz, focusX, focusZ) * .03);
  cands.sort((a, b) => b._ls - a._ls);
  const top = cands.slice(0, 9);
  for (const s of LT.torches) if (s.owner && (!s.owner.alive || !top.includes(s.owner))) s.releasing = true;
  for (let i = 0; i < Math.min(5, top.length); i++) {
    const c = top[i]; if (LT.torches.some(s => s.owner === c)) continue;
    const s = LT.torches.find(s => !s.owner); if (s) { s.owner = c; s.releasing = false; s.cur = 0; }
  }
  for (const s of LT.torches) {
    const o = s.owner;
    if (!o) { s.l.intensity = 0; continue; }
    s.cur = damp(s.cur, s.releasing ? 0 : o.lI, s.releasing ? 20 : 12, dt);
    if (s.releasing && s.cur < .5) { s.owner = null; s.cur = 0; s.l.intensity = 0; continue; }
    if (o.alive) { s.l.position.set(o.lx, o.ly, o.lz); s.l.color.setHex(o.lCol || 0xff9a50); }
    s.l.intensity = s.cur * (.85 + .15 * n1(SH.uTime.value * 9, o.lseed || 0));
  }
}
function collectMistLights() {
  let k = 0; const put = (l, gain) => { if (k >= R.NL) return; R.lightPos[k].copy(l.position); R.lightCol[k].set(l.color.r, l.color.g, l.color.b).multiplyScalar(l.intensity * gain); k++; };
  put(LT.beacon, .05);
  for (const f of LT.flashes) put(f.l, .06);
  const tw = LT.towers.filter(l => l.intensity > 0).sort((a, b) => b.intensity - a.intensity);
  for (const l of tw) put(l, .16);
  for (const l of LT.env) if (l.intensity > 0) put(l, .1);
  for (; k < R.NL; k++) R.lightCol[k].set(0, 0, 0);
}

const SPR_VERT = `
attribute vec3 iPos; attribute vec4 iSize; attribute vec4 iCol; attribute vec4 iMisc;
varying vec2 vUv; varying vec4 vCol; varying vec4 vMisc;
#ifdef LIT
uniform vec3 uLightPos[${12}]; uniform vec3 uLightCol[${12}]; uniform vec3 uAmb;
#endif
void main(){
  vUv = position.xy; vCol = iCol; vMisc = iMisc;
  vec2 q = position.xy; q.y += iSize.w;
  float c = cos(iSize.z), s = sin(iSize.z); q = vec2(q.x * c - q.y * s, q.x * s + q.y * c) * iSize.xy * 0.5;
  #ifdef LIT
  vec3 L = uAmb; for (int i = 0; i < 12; i++) { vec3 d = uLightPos[i] - iPos; L += uLightCol[i] / (dot(d, d) + 3.0); }
  vCol.rgb *= L;
  #endif
  if (iMisc.w > 0.5) { gl_Position = projectionMatrix * viewMatrix * vec4(iPos + vec3(q.x, 0.0, q.y), 1.0); }
  else { vec4 mv = viewMatrix * vec4(iPos, 1.0); mv.xy += q; gl_Position = projectionMatrix * mv; }
}`;
const SPR_NOISE = `
float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }`;
const SPR_FRAG_ADD = `
precision highp float; varying vec2 vUv; varying vec4 vCol; varying vec4 vMisc; uniform float uTime;
${SPR_NOISE}
void main(){
  int type = int(vMisc.x + 0.5); float seed = vMisc.y, age = vMisc.z; vec2 p = vUv; float r = length(p);
  vec3 col = vCol.rgb; float a = 0.0;
  if (type == 0) { a = smoothstep(1.0, 0.0, r); a *= a; }
  else if (type == 1) {
    float y = p.y * 0.5 + 0.5, t = uTime * 1.5 + seed * 17.0;
    float n1 = noise(vec2(p.x * 2.6 + seed * 7.0, y * 3.2 - t * 2.3)), n2 = noise(vec2(p.x * 5.5 - seed * 3.0, y * 6.0 - t * 3.9));
    float x = p.x + (n1 - 0.5) * 0.55 * y;
    float w = mix(0.66, 0.02, pow(y, 0.85));
    float body = 1.0 - smoothstep(w * 0.35, w, abs(x));
    float d = body * (1.08 - y) + (n1 * 0.62 + n2 * 0.38 - 0.5) * (0.28 + 0.6 * y) - smoothstep(0.0, 0.07, 0.07 - y) * 0.6;
    a = smoothstep(0.1, 0.16, d);
    col *= mix(vec3(1.0, 0.24, 0.03), vec3(1.0, 0.56, 0.1), smoothstep(0.26, 0.3, d));
    col = mix(col, vCol.rgb * vec3(1.0, 0.86, 0.42), smoothstep(0.46, 0.52, d));
    col = mix(col, vCol.rgb * vec3(1.15, 1.05, 0.8), smoothstep(0.7, 0.78, d));
  }
  else if (type == 2) { a = pow(max(0.0, 1.0 - r), 2.4); }
  else if (type == 3) {
    float n = noise(p * 2.4 + seed * 13.0 + vec2(0.0, -age * 1.6)) * 0.6 + noise(p * 5.2 - seed * 7.0) * 0.4;
    float d = (1.0 - r) + (n - 0.5) * 0.95 - age * 0.95;
    a = smoothstep(0.02, 0.1, d);
    vec3 hot = mix(vec3(0.9, 0.2, 0.03), vec3(1.0, 0.62, 0.16), smoothstep(0.16, 0.24, d));
    hot = mix(hot, vec3(1.1, 0.95, 0.7), smoothstep(0.42, 0.52, d));
    col *= hot * (1.0 - age * 0.55);
  }
  else if (type == 4) { float R0 = 0.25 + 0.75 * sqrt(age); a = smoothstep(0.14, 0.0, abs(r - R0)) * (1.0 - age) * (1.0 - age); }
  else if (type == 5) { float th = atan(p.y, p.x); a = pow(max(0.0, 1.0 - r), 1.6) * (0.25 + 0.75 * pow(abs(cos(th * 2.5 + seed)), 6.0)) * (1.0 - age); a += pow(max(0.0, 1.0 - r * 2.2), 2.0); }
  else if (type == 6) { a = smoothstep(1.0, 0.0, abs(p.y)) * smoothstep(1.0, 0.3, abs(p.x)); }
  else if (type == 7) {
    float th = atan(p.y, p.x), front = mix(-1.5, 1.5, smoothstep(0.0, 0.55, age));
    float band = smoothstep(0.5, 0.74, r) * smoothstep(1.0, 0.9, r);
    float trail = smoothstep(front - 1.5, front, th) * step(th, front) * step(-1.6, th);
    a = band * trail * (1.0 - smoothstep(0.45, 1.0, age));
  }
  gl_FragColor = vec4(col * a * vCol.a, 1.0);
}`;
const SPR_FRAG_ALPHA = `
precision highp float; varying vec2 vUv; varying vec4 vCol; varying vec4 vMisc; uniform float uTime;
${SPR_NOISE}
void main(){
  float seed = vMisc.y, age = vMisc.z; vec2 p = vUv; float r = length(p);
  float n = noise(p * 1.7 + seed * 9.0 + vec2(0.0, -age * 0.6)) * 0.65 + noise(p * 3.9 + seed * 5.0) * 0.35;
  float a = smoothstep(1.0, 0.25, r + (n - 0.5) * 0.9);
  a = floor(a * 4.0 + 0.5) / 4.0;
  gl_FragColor = vec4(vCol.rgb * (0.7 + 0.5 * n), a * vCol.a);
}`;

class SpriteBatch {
  constructor(cap, lit) {
    this.cap = cap; this.n = 0;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); this.aSize = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); this.aMisc = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    for (const a of [this.aPos, this.aSize, this.aCol, this.aMisc]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iSize', this.aSize); g.setAttribute('iCol', this.aCol); g.setAttribute('iMisc', this.aMisc);
    const uniforms = { uTime: SH.uTime };
    if (lit) { uniforms.uLightPos = { value: R.lightPos }; uniforms.uLightCol = { value: R.lightCol }; uniforms.uAmb = { value: new THREE.Vector3(.05, .065, .1) }; }
    const m = new THREE.ShaderMaterial({
      vertexShader: SPR_VERT, fragmentShader: lit ? SPR_FRAG_ALPHA : SPR_FRAG_ADD, uniforms, defines: lit ? { LIT: 1 } : {},
      transparent: true, depthWrite: false, depthTest: true,
      blending: lit ? THREE.NormalBlending : THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation,
    });
    this.mesh = new THREE.Mesh(g, m); this.mesh.frustumCulled = false; this.mesh.renderOrder = lit ? 3 : 4; this.geo = g;
  }
  begin() { this.n = 0; }
  push(x, y, z, w, h, rot, anchor, r, g, b, a, type, seed, age, ground) {
    if (this.n >= this.cap) return; const i = this.n++;
    const P = this.aPos.array, S = this.aSize.array, C = this.aCol.array, M = this.aMisc.array;
    P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z; S[i * 4] = w; S[i * 4 + 1] = h; S[i * 4 + 2] = rot; S[i * 4 + 3] = anchor;
    C[i * 4] = r; C[i * 4 + 1] = g; C[i * 4 + 2] = b; C[i * 4 + 3] = a; M[i * 4] = type; M[i * 4 + 1] = seed; M[i * 4 + 2] = age; M[i * 4 + 3] = ground;
  }
  end() {
    this.geo.instanceCount = this.n;
    for (const a of [this.aPos, this.aSize, this.aCol, this.aMisc]) { a.clearUpdateRanges(); a.addUpdateRange(0, this.n * a.itemSize); a.needsUpdate = true; }
  }
}

class SegBatch {
  constructor(cap) {
    this.cap = cap; this.n = 0;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0]), 3)); g.setIndex([0, 1, 2, 0, 2, 3]);
    this.aA = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); this.aB = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    for (const a of [this.aA, this.aB, this.aCol]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iA', this.aA); g.setAttribute('iB', this.aB); g.setAttribute('iCol', this.aCol);
    const m = new THREE.ShaderMaterial({
      vertexShader: `attribute vec4 iA; attribute vec4 iB; attribute vec4 iCol; varying vec4 vCol; varying vec2 vUv;
void main(){ vec4 a = viewMatrix * vec4(iA.xyz, 1.0), b = viewMatrix * vec4(iB.xyz, 1.0); vec2 d = b.xy - a.xy; float l = max(length(d), 1e-4); vec2 nrm = vec2(-d.y, d.x) / l;
  vec4 p = mix(a, b, position.x); p.xy += nrm * position.y * mix(iA.w, iB.w, position.x); vCol = iCol; vUv = position.xy; gl_Position = projectionMatrix * p; }`,
      fragmentShader: `precision highp float; varying vec4 vCol; varying vec2 vUv; void main(){ float a = 1.0 - abs(vUv.y); a = a * a * (3.0 - 2.0 * a); gl_FragColor = vec4(vCol.rgb * vCol.a * (0.35 + 0.65 * a) * step(0.0, a), 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    });
    this.mesh = new THREE.Mesh(g, m); this.mesh.frustumCulled = false; this.mesh.renderOrder = 5; this.geo = g;
  }
  begin() { this.n = 0; }
  push(ax, ay, az, aw, bx, by, bz, bw, r, g, b, a) {
    if (this.n >= this.cap) return; const i = this.n++ * 4;
    const A = this.aA.array, Bq = this.aB.array, C = this.aCol.array;
    A[i] = ax; A[i + 1] = ay; A[i + 2] = az; A[i + 3] = aw; Bq[i] = bx; Bq[i + 1] = by; Bq[i + 2] = bz; Bq[i + 3] = bw; C[i] = r; C[i + 1] = g; C[i + 2] = b; C[i + 3] = a;
  }
  end() { this.geo.instanceCount = this.n; for (const a of [this.aA, this.aB, this.aCol]) { a.clearUpdateRanges(); a.addUpdateRange(0, this.n * 4); a.needsUpdate = true; } }
}

class DecalBatch {
  constructor(cap) {
    this.cap = cap; this.G = 4; this.next = 0; this.slots = [];
    const vps = (this.G + 1) * (this.G + 1), g = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(cap * vps * 3), 3); this.uv = new THREE.BufferAttribute(new Float32Array(cap * vps * 2), 2); this.col = new THREE.BufferAttribute(new Float32Array(cap * vps * 4), 4);
    this.pos.setUsage(THREE.DynamicDrawUsage); this.col.setUsage(THREE.DynamicDrawUsage);
    const idx = [];
    for (let s = 0; s < cap; s++) {
      this.slots.push({ life: 0, max: 1, a: 0, seed: 0 });
      for (let j = 0; j <= this.G; j++) for (let i = 0; i <= this.G; i++) { const o = s * vps + j * (this.G + 1) + i; this.uv.array[o * 2] = i / this.G * 2 - 1; this.uv.array[o * 2 + 1] = j / this.G * 2 - 1; }
      for (let j = 0; j < this.G; j++) for (let i = 0; i < this.G; i++) { const a = s * vps + j * (this.G + 1) + i, b = a + 1, c = a + this.G + 2, d = a + this.G + 1; idx.push(a, d, c, a, c, b); }
    }
    g.setAttribute('position', this.pos); g.setAttribute('uv', this.uv); g.setAttribute('aCol', this.col); g.setIndex(idx);
    const m = new THREE.ShaderMaterial({
      vertexShader: 'attribute vec4 aCol; varying vec4 vCol; varying vec2 vUv; void main(){ vCol = aCol; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `precision highp float; varying vec4 vCol; varying vec2 vUv; ${SPR_NOISE}
void main(){ float r = length(vUv); float sd = floor(vCol.a) ; float al = fract(vCol.a) * 1.02; float n = noise(vUv * 3.0 + sd * 3.7) * 0.6 + noise(vUv * 7.0 + sd) * 0.4;
  float a = smoothstep(1.0, 0.35, r + (n - 0.5) * 0.8); float th = atan(vUv.y, vUv.x); a *= 0.75 + 0.25 * noise(vec2(th * 3.0, sd));
  gl_FragColor = vec4(vCol.rgb, a * al); }`,
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    });
    this.mesh = new THREE.Mesh(g, m); this.mesh.frustumCulled = false; this.mesh.renderOrder = 1; this.vps = vps;
  }
  add(heightAt, x, z, size, r, g, b, alpha, life) {
    const s = this.next; this.next = (this.next + 1) % this.cap; const sl = this.slots[s];
    sl.life = life; sl.max = life; sl.a = alpha; sl.seed = Math.floor(rnd() * 90) + 1; sl.r = r; sl.g = g; sl.b = b;
    const P = this.pos.array, rot = rnd() * TAU, cs = Math.cos(rot), sn = Math.sin(rot);
    for (let j = 0; j <= this.G; j++) for (let i = 0; i <= this.G; i++) {
      const o = (s * this.vps + j * (this.G + 1) + i) * 3, lx = (i / this.G * 2 - 1) * size, lz = (j / this.G * 2 - 1) * size, wx = x + lx * cs - lz * sn, wz = z + lx * sn + lz * cs;
      P[o] = wx; P[o + 1] = heightAt(wx, wz) + .05; P[o + 2] = wz;
    }
    this.pos.needsUpdate = true;
  }
  update(dt) {
    const C = this.col.array;
    for (let s = 0; s < this.cap; s++) {
      const sl = this.slots[s]; if (sl.life <= 0 && sl.dead) continue;
      sl.life -= dt; const k = sl.life <= 0 ? 0 : Math.min(1, sl.life / (sl.max * .25)) * sl.a; sl.dead = sl.life <= 0;
      for (let v = 0; v < this.vps; v++) { const o = (s * this.vps + v) * 4; C[o] = sl.r; C[o + 1] = sl.g; C[o + 2] = sl.b; C[o + 3] = sl.seed + Math.min(.97, k); }
    }
    this.col.needsUpdate = true;
  }
  clear() { for (const sl of this.slots) sl.life = 0; }
}

const FX = {
  add: null, alpha: null, segs: null, decals: null,
  parts: [], smokes: [], flames: [], timed: [], bolts: [], shake: 0, shakeK: 1, shakeX: 0, shakeY: 0, groundAt: () => 0,
};
function initFX() {
  FX.add = new SpriteBatch(2600, false); FX.alpha = new SpriteBatch(700, true); FX.segs = new SegBatch(600); FX.decals = new DecalBatch(40);
  R.scene.add(FX.add.mesh, FX.alpha.mesh, FX.segs.mesh, FX.decals.mesh);
}
function fxPart(x, y, z, vx, vy, vz, life, size, r, g, b, o) {
  if (FX.parts.length > 1700) return;
  FX.parts.push({ x, y, z, vx, vy, vz, life, max: life, size, r, g, b, grav: o && o.grav || 0, drag: o && o.drag || 0, streak: o && o.streak || 0, rise: o && o.rise || 0, bounce: o && o.bounce || 0, seed: rnd() * 100, wob: o && o.wob || 0 });
}
function fxSmoke(x, y, z, vx, vy, vz, life, size, grow, r, g, b, a, o) {
  if (FX.smokes.length > 640) return;
  FX.smokes.push({ x, y, z, vx, vy, vz, life, max: life, size, grow, r, g, b, a, drag: o && o.drag !== undefined ? o.drag : 1.2, seed: rnd() * 100, rise: o && o.rise || 0 });
}
function fxSparks(x, y, z, n, speed, r, g, b, o = {}) {
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU, e = rr(o.lo === undefined ? .1 : o.lo, o.hi === undefined ? 1.3 : o.hi), s = speed * rr(.4, 1);
    fxPart(x, y, z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s, Math.sin(a) * Math.cos(e) * s, rr(.25, .6) * (o.life || 1), o.size || .07, r, g, b, { grav: o.grav === undefined ? 9 : o.grav, drag: .6, streak: 1, bounce: .35 });
  }
}
function fxEmbers(x, y, z, n, spread, r = 1, g = .5, b = .12) {
  for (let i = 0; i < n; i++) fxPart(x + rr(-spread, spread), y + rr(0, spread), z + rr(-spread, spread), rr(-.25, .25), rr(.7, 1.9), rr(-.25, .25), rr(.9, 2.2), rr(.05, .09), r * rr(1.6, 3), g * rr(1.2, 2.4), b * 2, { drag: .3, wob: 1, rise: .25 });
}
function fxDust(x, y, z, n, size, o = {}) {
  const c = o.c || [.34, .3, .27];
  for (let i = 0; i < n; i++) { const a = rnd() * TAU, s = rr(.3, 1) * (o.speed || 1.3); fxSmoke(x + Math.cos(a) * size * .3, y + rr(0, .15), z + Math.sin(a) * size * .3, Math.cos(a) * s, rr(.2, .7) * (o.up || 1), Math.sin(a) * s, rr(.5, 1.1) * (o.life || 1), size * rr(.5, .9), size * 1.2, c[0], c[1], c[2], o.a || .5, { drag: 2.4 }); }
}
function fxTimed(type, x, y, z, w, h, r, g, b, a, life, o = {}) {
  FX.timed.push({ type, x, y, z, w, h, r, g, b, a, life, max: life, rot: o.rot || 0, ground: o.ground ? 1 : 0, grow: o.grow || 0, seed: rnd() * 50, anchor: o.anchor || 0 });
}
function fxExplosion(x, y, z, sc = 1) {
  lightFlash(x, y + 1.1, z, 0xffb060, 520 * sc * sc, .4, 20 + sc * 6);
  fxTimed(3, x, y + .45 * sc, z, 2.6 * sc, 2.6 * sc, 5.0, 4.2, 3.2, 1, .42, { grow: 1.3 });
  fxTimed(5, x, y + .4 * sc, z, 4.2 * sc, 4.2 * sc, 3.5, 2.4, 1.2, 1, .12);
  fxTimed(4, x, y + .08, z, 5.4 * sc, 5.4 * sc, 1.6, 1.0, .5, .55, .4, { ground: true });
  fxSparks(x, y + .2, z, Math.round(22 * sc), 7.5 * sc, 3.2, 1.7, .5, { size: .08 });
  for (let i = 0; i < 9 * sc; i++) { const a = rnd() * TAU, s = rr(.4, 1.6) * sc; fxSmoke(x + Math.cos(a) * .3, y + rr(.2, .7), z + Math.sin(a) * .3, Math.cos(a) * s, rr(.6, 1.7), Math.sin(a) * s, rr(1.6, 3.4), rr(.7, 1.1) * sc, 1.5 * sc, .2, .19, .19, .62, { drag: 1.5, rise: .25 }); }
  fxDust(x, y, z, 6, .9 * sc, { speed: 2.6 });
  FX.shake = Math.min(1.2, FX.shake + .32 * sc);
}
function fxBolt(a, b, life = .22, col = [.55, .8, 1.6], width = .09) {
  FX.bolts.push({ a: a.slice(), b: b.slice(), life, max: life, col, width, seed: Math.floor(rnd() * 1000), re: 0, pts: null });
}
function addFlame(o) {
  const f = Object.assign({ size: 1, r: 1, g: 1, b: 1, embers: 1, glow: 1, on: 1, seed: rnd() * 10, acc: rnd(), layers: 1, alive: true, smoke: 0 }, o);
  FX.flames.push(f); return f;
}
function removeFlame(f) { if (!f) return; f.alive = false; const i = FX.flames.indexOf(f); if (i >= 0) swapRemove(FX.flames, i); }

function updateFX(dt, t) {
  const A = FX.add, AL = FX.alpha, SG = FX.segs, groundAt = FX.groundAt;
  A.begin(); AL.begin(); SG.begin();
  const rx = Math.cos(CAM.yaw), rz = -Math.sin(CAM.yaw), se = Math.sin(CAM.elev), ce = Math.cos(CAM.elev), ux = -se * Math.sin(CAM.yaw), uy = ce, uz = -se * Math.cos(CAM.yaw);
  for (const f of FX.flames) {
    const on = f.on; if (on <= .01) continue;
    const s = f.size * (.9 + .1 * on), fl = .88 + .12 * n1(t * 8 + f.seed * 3, f.seed);
    for (let k = 0; k < f.layers; k++) {
      const kk = k / Math.max(1, f.layers), w = s * (1 - kk * .28) * (.92 + .08 * fl), h = s * (1.55 - kk * .2) * (.75 + .25 * on);
      A.push(f.x + (k ? Math.sin(f.seed * 9 + k * 2.1) * s * .16 : 0), f.y - s * .08, f.z + (k ? Math.cos(f.seed * 5 + k * 1.7) * s * .16 : 0), w, h, 0, 1, f.r * 3.3, f.g * 3.3, f.b * 3.3, on, 1, f.seed + k * 3.7, 0, 0);
    }
    if (f.glow > 0) A.push(f.x, f.y + s * .5, f.z, s * 4.2, s * 4.2, 0, 0, f.r * 1.0, f.g * .5, f.b * .16, .2 * f.glow * on * fl, 2, 0, 0, 0);
    f.acc += dt * (2.2 + 5 * s) * f.embers * on;
    while (f.acc >= 1) {
      f.acc -= 1;
      fxPart(f.x + rr(-.25, .25) * s, f.y + s * rr(.3, 1.1), f.z + rr(-.25, .25) * s, rr(-.3, .3), rr(.8, 2.0) * (0.7 + s * .3), rr(-.3, .3), rr(.8, 2.0) * (.7 + s * .35), rr(.045, .085), f.r * rr(1.8, 3.2), f.g * rr(.7, 1.4), f.b * .25, { drag: .25, wob: 1, rise: .3 });
    }
    if (f.smoke > 0) { f.sacc = (f.sacc || 0) + dt * f.smoke * on; while (f.sacc >= 1) { f.sacc -= 1; fxSmoke(f.x + rr(-.2, .2) * s, f.y + s * 1.3, f.z + rr(-.2, .2) * s, rr(-.15, .15), rr(.9, 1.5), rr(-.15, .15), rr(2.5, 4.5), s * .7, s * 1.6, .16, .15, .16, .22, { drag: .25, rise: .1 }); } }
  }
  const P = FX.parts;
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i]; p.life -= dt; if (p.life <= 0) { swapRemove(P, i); continue; }
    p.vy += (p.rise - p.grav) * dt; const dr = Math.exp(-p.drag * dt); p.vx *= dr; p.vy *= dr; p.vz *= dr;
    if (p.wob) { p.vx += n1(t * 1.7 + p.seed, p.seed) * dt * 1.4; p.vz += n1(t * 1.3 + p.seed * 2, p.seed + 3) * dt * 1.4; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.bounce) { const gy = groundAt(p.x, p.z) + .03; if (p.y < gy) { p.y = gy; p.vy = -p.vy * p.bounce; p.vx *= .6; p.vz *= .6; } }
    const k = p.life / p.max, fade = Math.min(1, k * 2.5) * (p.wob ? (.7 + .3 * Math.sin(t * 30 + p.seed)) : 1);
    if (p.streak) {
      const sx = p.vx * rx + p.vz * rz, sy = p.vx * ux + p.vy * uy + p.vz * uz, sp = Math.hypot(sx, sy);
      A.push(p.x, p.y, p.z, p.size * (1 + sp * .22), p.size * .8, Math.atan2(sy, sx), 0, p.r, p.g * (.4 + .6 * k), p.b * k, fade, 6, 0, 0, 0);
    } else A.push(p.x, p.y, p.z, p.size, p.size, 0, 0, p.r, p.g * (.35 + .65 * k), p.b * k, fade, 0, 0, 0, 0);
  }
  const Sm = FX.smokes;
  for (let i = Sm.length - 1; i >= 0; i--) {
    const p = Sm[i]; p.life -= dt; if (p.life <= 0) { swapRemove(Sm, i); continue; }
    const dr = Math.exp(-p.drag * dt); p.vx *= dr; p.vy = p.vy * dr + p.rise * dt; p.vz *= dr;
    p.x += (p.vx + .12) * dt; p.y += p.vy * dt; p.z += (p.vz + .05) * dt;
    const k = 1 - p.life / p.max, sz = p.size + p.grow * (1 - Math.exp(-k * 3));
    AL.push(p.x, p.y, p.z, sz, sz, p.seed, 0, p.r, p.g, p.b, p.a * Math.min(1, k * 8) * (1 - k) * (1 - k * .3), 0, p.seed, k, 0);
  }
  const Tm = FX.timed;
  for (let i = Tm.length - 1; i >= 0; i--) {
    const s = Tm[i]; s.life -= dt; if (s.life <= 0) { swapRemove(Tm, i); continue; }
    const k = 1 - s.life / s.max, g = 1 + s.grow * (1 - Math.exp(-k * 4));
    A.push(s.x, s.y, s.z, s.w * g, s.h * g, s.rot, s.anchor, s.r, s.g, s.b, s.a, s.type, s.seed, k, s.ground);
  }
  const Bo = FX.bolts;
  for (let i = Bo.length - 1; i >= 0; i--) {
    const b = Bo[i]; b.life -= dt; if (b.life <= 0) { swapRemove(Bo, i); continue; }
    b.re -= dt;
    if (!b.pts || b.re <= 0) {
      b.re = .045; const n = Math.max(3, Math.round(Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1], b.b[2] - b.a[2]) / .45)), pts = [];
      for (let k = 0; k <= n; k++) { const u = k / n, j = Math.sin(u * PI) * .34; pts.push([lerp(b.a[0], b.b[0], u) + rr(-j, j), lerp(b.a[1], b.b[1], u) + rr(-j, j), lerp(b.a[2], b.b[2], u) + rr(-j, j)]); }
      b.pts = pts; b.fork = rnd() < .7 ? Math.floor(rr(1, n - 1)) : -1; b.fd = [rr(-1, 1), rr(-.2, .8), rr(-1, 1)];
    }
    const k = b.life / b.max, c = b.col, w = b.width * (.5 + .5 * k);
    for (let j = 0; j < b.pts.length - 1; j++) { const p = b.pts[j], q = b.pts[j + 1]; SG.push(p[0], p[1], p[2], w, q[0], q[1], q[2], w, c[0] * 4, c[1] * 4, c[2] * 4, k); SG.push(p[0], p[1], p[2], w * 3.5, q[0], q[1], q[2], w * 3.5, c[0], c[1], c[2], k * .35); }
    if (b.fork > 0) { const p = b.pts[b.fork]; SG.push(p[0], p[1], p[2], w * .7, p[0] + b.fd[0] * .7, p[1] + b.fd[1] * .7, p[2] + b.fd[2] * .7, w * .2, c[0] * 3, c[1] * 3, c[2] * 3, k); }
  }
  FX.decals.update(dt);
  FX.shake = Math.max(0, FX.shake - dt * 2.6);
  const sh = FX.shake * FX.shake * FX.shakeK; FX.shakeX = n1(t * 31, 7) * sh * .22; FX.shakeY = n1(t * 37, 9) * sh * .22;
}
function endFX() { FX.add.end(); FX.alpha.end(); FX.segs.end(); }
function clearFX() { FX.parts.length = 0; FX.smokes.length = 0; FX.timed.length = 0; FX.bolts.length = 0; FX.decals.clear(); }


const WX = { mesh: null, u: null, fade: 1 };
function initWeather() {
  const N = 2600, g = new THREE.InstancedBufferGeometry(), rng = makeRng(4242), seed = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) { seed[i * 4] = rng(); seed[i * 4 + 1] = rng(); seed[i * 4 + 2] = rng(); seed[i * 4 + 3] = (i + .5) / N; }
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3)); g.setIndex([0, 1, 2, 0, 2, 3]);
  g.setAttribute('iSeed', new THREE.InstancedBufferAttribute(seed, 4)); g.instanceCount = N;
  const v2 = () => ({ value: new THREE.Vector2() }), v3 = () => ({ value: new THREE.Vector3() }), v4 = () => ({ value: new THREE.Vector4() });
  const u = WX.u = {
    uTime: SH.uTime, uLightPos: { value: R.lightPos }, uLightCol: { value: R.lightCol }, uAmb: v3(), uFade: { value: 1 }, uN: v2(),
    uVelA: v3(), uVelB: v3(), uSwayA: v2(), uSwayB: v2(), uSizeA: v2(), uSizeB: v2(), uColA: v4(), uColB: v4(), uAlA: v3(), uAlB: v3(), uYA: v2(), uYB: v2(),
  };
  const m = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation,
    vertexShader: `attribute vec4 iSeed; varying vec4 vCol; varying vec2 vUv; varying float vAdd;
uniform float uTime; uniform float uFade; uniform vec3 uLightPos[12]; uniform vec3 uLightCol[12]; uniform vec3 uAmb; uniform vec2 uN;
uniform vec3 uVelA; uniform vec3 uVelB; uniform vec2 uSwayA; uniform vec2 uSwayB; uniform vec2 uSizeA; uniform vec2 uSizeB; uniform vec4 uColA; uniform vec4 uColB; uniform vec3 uAlA; uniform vec3 uAlB; uniform vec2 uYA; uniform vec2 uYB;
void main(){
  float isB = step(iSeed.w, uN.y), show = step(iSeed.w, uN.x + uN.y);
  vec3 vel = mix(uVelA, uVelB, isB), al = mix(uAlA, uAlB, isB); vec2 sway = mix(uSwayA, uSwayB, isB), sz = mix(uSizeA, uSizeB, isB), yr = mix(uYA, uYB, isB); vec4 cp = mix(uColA, uColB, isB);
  float r1 = fract(iSeed.w * 91.7 + iSeed.x * 3.1), r2 = fract(iSeed.w * 357.3 + iSeed.z * 5.7), span = max(yr.y - yr.x, 0.01);
  vec3 p = vec3(iSeed.x * 48.0, iSeed.y * span, iSeed.z * 48.0) + vel * uTime * (0.65 + 0.7 * r1);
  p.x += sin(uTime * sway.y * (0.6 + r2) + iSeed.y * 40.0) * sway.x; p.z += cos(uTime * sway.y * (0.5 + r1) + iSeed.x * 40.0) * sway.x; p.y += sin(uTime * sway.y * 0.7 + r1 * 30.0) * sway.x * 0.3;
  p.x = mod(p.x, 48.0) - 24.0; p.z = mod(p.z, 48.0) - 24.0; p.y = mod(p.y, span) + yr.x;
  float size = mix(sz.x, sz.y, r2);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vec3 vv = (viewMatrix * vec4(vel, 0.0)).xyz; float vl = length(vv.xy); vec2 dir = vl > 0.0001 ? vv.xy / vl : vec2(0.0, 1.0);
  mv.xy += position.x * vec2(-dir.y, dir.x) * size + position.y * dir * size * (1.0 + al.z * vl);
  gl_Position = show > 0.5 ? projectionMatrix * mv : vec4(2.0, 2.0, 2.0, 1.0);
  vec3 L = uAmb; for (int i = 0; i < 12; i++) { vec3 d = uLightPos[i] - p; L += uLightCol[i] / (dot(d, d) + 3.0); }
  float tw = al.y > 0.0 ? pow(max(0.0, sin(uTime * al.y * (0.5 + r1) + r2 * 60.0)), 4.0) : 1.0;
  float ef = smoothstep(24.0, 21.0, max(abs(p.x), abs(p.z))) * smoothstep(yr.x, yr.x + 0.5, p.y) * smoothstep(yr.y, yr.y - 1.2, p.y);
  vCol = vec4(cp.rgb * mix(vec3(1.0), L, cp.a), al.x * tw * ef * uFade); vAdd = 1.0 - cp.a; vUv = position.xy;
}`,
    fragmentShader: `precision highp float; varying vec4 vCol; varying vec2 vUv; varying float vAdd;
void main(){ float a = smoothstep(1.0, 0.25, length(vUv)) * vCol.a; gl_FragColor = vec4(vCol.rgb * a, a * (1.0 - vAdd)); }`,
  });
  WX.mesh = new THREE.Mesh(g, m); WX.mesh.frustumCulled = false; WX.mesh.renderOrder = 4; R.scene.add(WX.mesh);
}
function setWeather(w, instant) {
  const u = WX.u;
  u.uN.value.fromArray(w.n); u.uVelA.value.fromArray(w.velA); u.uVelB.value.fromArray(w.velB); u.uSwayA.value.fromArray(w.swayA); u.uSwayB.value.fromArray(w.swayB);
  u.uSizeA.value.fromArray(w.sizeA); u.uSizeB.value.fromArray(w.sizeB); u.uColA.value.fromArray(w.colA); u.uColB.value.fromArray(w.colB); u.uAlA.value.fromArray(w.alA); u.uAlB.value.fromArray(w.alB); u.uYA.value.fromArray(w.yA); u.uYB.value.fromArray(w.yB);
  WX.fade = instant ? 1 : 0; u.uFade.value = WX.fade;
}


let RIG_CAPTURE = null;
class PartBatch {
  constructor(build, cap, o = {}) {
    const S = new Soup(); build(S); const geo = S.build();
    this.cap = cap; this.n = 0;
    const m = this.mesh = new THREE.InstancedMesh(geo, MAT.inst, cap);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.flash = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1); this.flash.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aFlash', this.flash);
    m.frustumCulled = false; m.castShadow = o.shadow !== false; m.receiveShadow = true; m.count = 0;
    this.rad = o.rad || .1;
    R.scene.add(m); PartBatch.all.push(this);
  }
  put(mat, flash = 0, tint = null) {
    if (RIG_CAPTURE) { RIG_CAPTURE(this, mat, tint); return; }
    if (this.n >= this.cap) return; const i = this.n++;
    mat.toArray(this.mesh.instanceMatrix.array, i * 16);
    const c = this.mesh.instanceColor.array;
    if (tint) { c[i * 3] = tint[0]; c[i * 3 + 1] = tint[1]; c[i * 3 + 2] = tint[2]; } else { c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = 1; }
    this.flash.array[i] = flash;
  }
  end() {
    const m = this.mesh; m.count = this.n; m.visible = this.n > 0;
    if (this.n) {
      for (const a of [m.instanceMatrix, m.instanceColor, this.flash]) { a.clearUpdateRanges(); a.addUpdateRange(0, this.n * a.itemSize); a.needsUpdate = true; }
    }
  }
}
PartBatch.all = [];
function beginParts() { for (const b of PartBatch.all) b.n = 0; }
function endParts() { for (const b of PartBatch.all) b.end(); }

const _rq = new THREE.Quaternion(), _re = new THREE.Euler(), _rv = new THREE.Vector3(), _rs = new THREE.Vector3(), _rm = new THREE.Matrix4();
const _M = []; for (let i = 0; i < 28; i++) _M.push(new THREE.Matrix4());
function xf(out, parent, px, py, pz, rx, ry, rz, sx = 1, sy = 1, sz = 1) {
  _rq.setFromEuler(_re.set(rx, ry, rz, 'XYZ')); _rm.compose(_rv.set(px, py, pz), _rq, _rs.set(sx, sy, sz));
  if (parent) out.multiplyMatrices(parent, _rm); else out.copy(_rm); return out;
}

const KIT = {};
function humanKit(style, cap) {
  const k = {}, limb = cap * 2;
  if (style === 'skel' || style === 'giant') {
    const G = style === 'giant', bone = G ? mulC(COL.bone, .82) : COL.bone, bd = G ? mulC(COL.boneD, .8) : COL.boneD, o = () => ({ l: L_BONE, jit: .05 });
    k.pelvis = new PartBatch(S => { S.box(.27, .1, .15, 0, 0, 0, bd, o()); S.box(.08, .13, .08, 0, .09, -.01, bone, o()); if (G) { for (const s of [-1, 1]) S.box(.1, .16, .17, s * .14, -.02, 0, bone, o()); clothPanel(S, { x0: -.13, x1: .13, yTop: -.03, len: .3, z: .09, col: mulC(COL.clothD, 1.4), rng: makeRng(5), sway: 0, nx: 3, ny: 4 }); } }, cap, { rad: .1 });
    k.torso = new PartBatch(S => {
      S.box(.07, .43, .07, 0, .21, -.03, bd, o());
      const ribs = G ? [.1, .16, .22, .28, .34] : [.15, .24, .33];
      for (const y of ribs) { S.box(.31 - (.34 - y) * .25, G ? .04 : .055, .21, 0, y, .01, bone, o()); }
      S.box(.39, .07, .12, 0, .43, 0, bone, o()); S.box(.06, .25, .03, 0, .25, .11, bone, o());
      if (G) { for (const s of [-1, 1]) { S.cone(.05, .16, s * .2, .52, 0, bone, { n: 4, l: L_BONE }); S.cone(.04, .12, s * .13, .5, -.04, bd, { n: 4, l: L_BONE }); } for (let v = 0; v < 4; v++) S.box(.05, .03, .06, 0, .1 + v * .09, -.08, bone, o()); }
    }, cap, { rad: .16 });
    k.head = new PartBatch(S => {
      S.sph(.15, 0, .17, 0, bone, { sc: [1, .95, 1.08], l: L_BONE, w: 7, h: 5, smooth: false }); S.box(.17, .08, .14, 0, .04, .035, bd, o());
      for (const s of [-1, 1]) S.box(.066, .062, .05, s * .058, .185, .132, COL.black, { jit: 0 });
      S.box(.03, .04, .04, 0, .12, .152, COL.black, { jit: 0 });
      if (G) { for (const s of [-1, 1]) { S.seg([s * .12, .24, 0], [s * .27, .36, .03], .05, .035, bd, { l: L_BONE, n: 5 }); S.seg([s * .27, .36, .03], [s * .3, .52, .1], .035, .008, bone, { l: L_BONE, n: 5 }); } for (let t = -2; t <= 2; t++) S.box(.022, .04, .02, t * .032, .005, .1, bone, { jit: 0 }); }
    }, cap, { rad: .15 });
    k.uArm = new PartBatch(S => { S.box(.062, .25, .062, 0, -.125, 0, bone, o()); S.box(.085, .06, .085, 0, -.26, 0, bd, o()); }, limb, { rad: .06, shadow: false });
    k.lArm = new PartBatch(S => { S.box(.052, .25, .052, 0, -.125, 0, bone, o()); S.box(.08, .08, .08, 0, -.28, 0, bd, o()); }, limb, { rad: .06, shadow: false });
    k.uLeg = new PartBatch(S => { S.box(.076, .27, .076, 0, -.135, 0, bone, o()); S.box(.09, .06, .09, 0, -.28, 0, bd, o()); }, limb, { rad: .07, shadow: false });
    k.lLeg = new PartBatch(S => { S.box(.062, .28, .062, 0, -.14, 0, bone, o()); S.box(.09, .05, .19, 0, -.295, .05, bd, o()); }, limb, { rad: .07, shadow: false });
  } else if (style === 'foot') {
    const mail = COL.steel, cloth = mulC(COL.clothB, 1.75), lea = COL.leather;
    k.pelvis = new PartBatch(S => { S.box(.28, .14, .19, 0, 0, 0, mulC(COL.clothD, 1.6), { l: L_CLOTH }); S.box(.3, .05, .2, 0, .06, 0, lea, {}); }, cap, { rad: .12 });
    k.torso = new PartBatch(S => {
      S.box(.34, .4, .22, 0, .21, 0, cloth, { l: L_CLOTH, jit: 0 }); S.box(.12, .34, .23, 0, .2, 0, mulC(cloth, .62), { l: L_CLOTH, jit: 0 });
      S.box(.42, .1, .25, 0, .4, 0, mail, { l: L_METAL, rough: .5 }); S.box(.16, .08, .16, 0, .45, 0, COL.skin, {});
    }, cap, { rad: .17 });
    k.head = new PartBatch(S => {
      S.box(.19, .2, .19, 0, .12, .0, COL.skin, { jit: .04 }); S.box(.2, .08, .1, 0, .06, -.06, mulC(COL.leather, .7), {});
      S.add(gDome(8, 3), { s: [.155, .13, .155], p: [0, .19, 0], c: mail, l: L_METAL, rough: .42 }); S.cyl(.21, .03, 0, .19, 0, mulC(mail, .85), { n: 8, l: L_METAL, rough: .42 });
      for (const s of [-1, 1]) S.box(.03, .03, .02, s * .05, .14, .098, COL.black, { jit: 0 });
    }, cap, { rad: .14 });
    k.uArm = new PartBatch(S => { S.box(.1, .26, .1, 0, -.13, 0, mail, { l: L_METAL, rough: .5 }); S.box(.13, .09, .13, 0, -.03, 0, mulC(mail, 1.1), { l: L_METAL, rough: .45 }); }, limb, { rad: .07, shadow: false });
    k.lArm = new PartBatch(S => { S.box(.085, .24, .085, 0, -.12, 0, lea, {}); S.box(.09, .08, .09, 0, -.27, 0, COL.skin, {}); }, limb, { rad: .07, shadow: false });
    k.uLeg = new PartBatch(S => { S.box(.115, .28, .115, 0, -.14, 0, mulC(COL.clothD, 1.5), { l: L_CLOTH }); }, limb, { rad: .08, shadow: false });
    k.lLeg = new PartBatch(S => { S.box(.1, .28, .1, 0, -.14, 0, mulC(lea, .7), {}); S.box(.11, .06, .2, 0, -.29, .045, mulC(lea, .6), {}); }, limb, { rad: .08, shadow: false });
  } else {
    const sk = COL.ogre, sdk = COL.ogreD, o = () => ({ jit: .06, d: 1 });
    k.pelvis = new PartBatch(S => { S.ico(.2, 0, 0, 0, sdk, { sc: [1.15, .6, .95], d: 1 }); clothPanel(S, { x0: -.15, x1: .15, yTop: .02, len: .3, z: .17, col: COL.leather, rng: makeRng(3), sway: 0, nx: 3, ny: 4 }); clothPanel(S, { x0: -.14, x1: .14, yTop: .02, len: .24, z: -.17, col: mulC(COL.leather, .7), rng: makeRng(4), sway: 0, nx: 3, ny: 3 }); S.box(.44, .05, .36, 0, .03, 0, mulC(COL.leather, .6), {}); }, cap, { rad: .2 });
    k.torso = new PartBatch(S => {
      S.ico(.27, 0, .17, .04, sk, { sc: [1.1, .9, 1.05], d: 1 }); S.ico(.25, 0, .37, -.01, sk, { sc: [1.2, .75, .85], d: 1 });
      for (const s of [-1, 1]) S.ico(.11, s * .27, .45, 0, sdk, { d: 1 });
      S.sph(.1, -.27, .5, 0, COL.iron, { l: L_METAL, w: 6, h: 4, smooth: false }); for (let a = 0; a < 3; a++) S.cone(.03, .1, -.27 + Math.cos(a * 2.1) * .08, .6, Math.sin(a * 2.1) * .08, COL.ironL, { n: 4, l: L_METAL });
      S.box(.07, .5, .03, .08, .25, .29, mulC(COL.leather, .7), { r: [0, 0, .5] });
    }, cap, { rad: .28 });
    k.head = new PartBatch(S => {
      S.ico(.13, 0, .1, .02, sk, { sc: [1.05, .95, 1.0], d: 1 }); S.box(.19, .07, .13, 0, .03, .08, sdk, { jit: 0 }); S.box(.22, .04, .08, 0, .15, .09, sdk, { jit: 0 });
      for (const s of [-1, 1]) { S.cone(.022, .09, s * .07, .08, .15, COL.bone, { n: 4, l: L_BONE }); S.box(.045, .03, .03, s * .055, .125, .125, COL.black, { jit: 0 }); S.box(.04, .09, .03, s * .15, .12, 0, sdk, { r: [0, 0, s * -.4] }); }
    }, cap, { rad: .13 });
    k.uArm = new PartBatch(S => { S.ico(.1, 0, -.12, 0, sk, { sc: [1, 1.5, 1], d: 1 }); }, limb, { rad: .1, shadow: false });
    k.lArm = new PartBatch(S => { S.ico(.09, 0, -.12, 0, sk, { sc: [1, 1.5, 1], d: 1 }); S.ico(.085, 0, -.27, 0, sdk, { d: 1 }); S.box(.2, .06, .2, 0, -.18, 0, COL.leather, {}); }, limb, { rad: .1, shadow: false });
    k.uLeg = new PartBatch(S => { S.ico(.11, 0, -.1, 0, sk, { sc: [1, 1.35, 1.05], d: 1 }); }, limb, { rad: .1, shadow: false });
    k.lLeg = new PartBatch(S => { S.ico(.095, 0, -.1, 0, sk, { sc: [1, 1.3, 1], d: 1 }); S.box(.17, .07, .26, 0, -.21, .05, sdk, {}); }, limb, { rad: .1, shadow: false });
  }
  return k;
}

function initKits() {
  const iron = COL.iron, rust = mixC(COL.ironL, C(0x7a4a2a), .45);
  KIT.skel = humanKit('skel', 96);
  KIT.foot = humanKit('foot', 40);
  KIT.giant = humanKit('giant', 2);
  KIT.ogre = humanKit('ogre', 30);
  for (const k of ['uArm', 'lArm', 'uLeg', 'lLeg']) KIT.giant[k].mesh.castShadow = true;
  const E = KIT.item = {};
  E.sword = new PartBatch(S => { S.box(.035, .13, .035, 0, 0, 0, COL.woodD, {}); S.box(.17, .03, .05, 0, .075, 0, iron, { l: L_METAL }); S.box(.055, .5, .018, 0, .34, 0, rust, { l: L_METAL, rough: .5 }); S.cone(.03, .08, 0, .63, 0, rust, { n: 4, l: L_METAL, rough: .5, rz: .012 }); }, 100, { rad: .05, shadow: false });
  E.blade = new PartBatch(S => { S.box(.04, .13, .04, 0, 0, 0, COL.leather, {}); S.box(.2, .035, .055, 0, .075, 0, COL.brass, { l: L_METAL, rough: .4 }); S.box(.06, .52, .02, 0, .35, 0, mulC(COL.steel, 1.15), { l: L_METAL, rough: .3 }); S.cone(.032, .09, 0, .655, 0, mulC(COL.steel, 1.15), { n: 4, l: L_METAL, rough: .3 }); }, 40, { rad: .05, shadow: false });
  E.torch = new PartBatch(S => { S.box(.04, .42, .04, 0, .1, 0, COL.woodD, { l: L_WOOD }); S.cyl(.06, .1, 0, .34, 0, mulC(COL.black, 3), { n: 6 }); S.cyl(.05, .03, 0, .4, 0, COL.ember, { n: 6, emis: .5, jit: 0 }); }, 80, { rad: .05, shadow: false });
  E.shieldR = new PartBatch(S => { S.cyl(.27, .05, 0, 0, 0, COL.woodD, { n: 8, r: [HPI, 0, 0], l: L_WOOD }); S.add(gTorus(8, .13, 4), { s: .25, p: [0, 0, .01], c: iron, l: L_METAL }); S.sph(.075, 0, 0, .04, COL.ironL, { l: L_METAL, w: 6, h: 4, smooth: false }); for (let a = 0; a < 4; a++) S.box(.03, .42, .012, 0, 0, .03, iron, { l: L_METAL, r: [0, 0, a * PI / 4] }); }, 60, { rad: .2, shadow: false });
  E.shieldH = new PartBatch(S => { const sc = mulC(COL.clothB, 1.6); S.box(.36, .3, .045, 0, .08, 0, sc, { l: L_WOOD, jit: 0 }); S.box(.26, .12, .045, 0, -.12, 0, sc, { l: L_WOOD, jit: 0 }); S.box(.14, .1, .045, 0, -.22, 0, sc, { l: L_WOOD, jit: 0 }); S.box(.07, .5, .05, 0, -.02, .004, mulC(COL.gold, .8), { l: L_METAL, rough: .45, jit: 0 }); S.box(.36, .06, .05, 0, .1, .004, mulC(COL.gold, .8), { l: L_METAL, rough: .45, jit: 0 }); }, 40, { rad: .2, shadow: false });
  E.helm = new PartBatch(S => { S.add(gDome(8, 3), { s: [.18, .175, .195], p: [0, .16, 0], c: iron, l: L_METAL, rough: .5 }); S.box(.035, .13, .03, 0, .15, .185, COL.ironL, { l: L_METAL }); for (const s of [-1, 1]) S.box(.03, .14, .13, s * .165, .1, .03, iron, { l: L_METAL }); S.cone(.03, .16, 0, .4, 0, COL.ironL, { n: 4, l: L_METAL }); }, 60, { rad: .16, shadow: false });
  E.plate = new PartBatch(S => { S.box(.35, .31, .25, 0, .27, 0, iron, { l: L_METAL, rough: .5 }); S.box(.2, .2, .26, 0, .29, .005, COL.ironL, { l: L_METAL, rough: .45 }); for (const s of [-1, 1]) S.sph(.1, s * .21, .44, 0, COL.ironL, { l: L_METAL, w: 6, h: 4, smooth: false, sc: [1, .8, 1.1] }); }, 60, { rad: .2, shadow: false });
  E.bow = new PartBatch(S => { let p = [0, -.36, 0]; for (let i = 1; i <= 6; i++) { const t = i / 6 * 2 - 1, q = [0, t * .36, (1 - t * t) * .12]; S.seg(p, q, .016, .016, COL.woodL, { n: 4, l: L_WOOD }); p = q; } S.seg([0, -.36, 0], [0, .36, 0], .005, .005, COL.bone, { n: 3, jit: 0 }); }, 40, { rad: .1, shadow: false });
  E.club = new PartBatch(S => { S.seg([0, -.12, 0], [0, .62, 0], .045, .11, COL.wood, { l: L_WOOD, n: 6 }); S.cyl(.12, .1, 0, .6, 0, iron, { n: 6, l: L_METAL }); for (let a = 0; a < 6; a++) S.cone(.03, .12, Math.cos(a * 1.05) * .13, .45 + (a % 2) * .14, Math.sin(a * 1.05) * .13, COL.ironL, { n: 4, l: L_METAL, r: [Math.sin(a * 1.05) * 1.57, 0, -Math.cos(a * 1.05) * 1.57] }); }, 10, { rad: .1 });
  E.greatsword = new PartBatch(S => {
    const steel = mulC(mixC(COL.steel, C(0x7a4a2a), .22), 1.15), dark = mulC(iron, .85), fl = mulC(steel, .6);
    S.box(.05, .24, .05, 0, -.02, 0, COL.leather, {}); S.ico(.055, 0, -.17, 0, COL.bone, { l: L_BONE, d: 1 });
    S.box(.36, .05, .08, 0, .12, 0, dark, { l: L_METAL }); for (const sg of [-1, 1]) S.box(.05, .1, .08, sg * .17, .08, 0, dark, { l: L_METAL });
    S.box(.12, .82, .026, 0, .555, 0, steel, { l: L_METAL, rough: .45 }); S.box(.035, .7, .034, 0, .52, 0, fl, { l: L_METAL, rough: .5 });
    for (const z of [.013, -.013]) { const a = [-.06, .965, z], b = [.06, .965, z], c = [0, 1.14, 0]; if (z > 0) S.tri(a, b, c, steel, L_METAL, .45); else S.tri(a, c, b, steel, L_METAL, .45); }
    for (const [y, sg] of [[.42, 1], [.7, -1], [.86, 1]]) S.box(.03, .05, .034, sg * .058, y, 0, COL.black, { jit: 0 });
  }, 2, { rad: .1 });
  const fur = COL.rat, furD = COL.ratD;
  KIT.rat = {
    body: new PartBatch(S => {
      S.ico(.2, 0, .02, 0, fur, { sc: [.75, .7, 1.45], d: 1 }); S.ico(.12, 0, .0, .3, furD, { sc: [.8, .75, 1.3], d: 1 }); S.cone(.045, .13, 0, -.03, .47, C(0x8a6a62), { n: 5, r: [HPI, 0, 0] });
      for (const s of [-1, 1]) { S.box(.07, .08, .02, s * .075, .11, .24, C(0x7a5a55), { r: [0, s * .4, 0] }); S.box(.025, .025, .02, s * .05, .03, .4, COL.black, { jit: 0 }); }
    }, 90, { rad: .15 }),
    leg: new PartBatch(S => { S.box(.05, .14, .05, 0, -.07, 0, furD, {}); S.box(.05, .03, .1, 0, -.14, .03, C(0x8a6a62), {}); }, 360, { rad: .05, shadow: false }),
    tail: new PartBatch(S => { S.seg([0, 0, 0], [0, 0, -.24], .028, .014, C(0x8a6a62), { n: 4 }); }, 180, { rad: .04, shadow: false }),
  };
  KIT.slime = { body: new PartBatch(S => {
    S.add(gDome(10, 5), { s: [.5, .46, .5], p: [0, 0, 0], c: COL.slime, smooth: true, rough: .32, jit: 0, emis: .006, c2: [COL.slimeD[0], COL.slimeD[1], COL.slimeD[2], v => smooth(.3, .0, v.y)] });
    S.cyl(.5, .05, 0, .0, 0, COL.slimeD, { n: 10, rough: .32, rt: .96 });
    S.ico(.17, .04, .16, -.02, mulC(COL.slimeD, .6), { d: 1, rough: .4, sc: [1, .8, 1] });
    for (const s of [-1, 1]) S.box(.07, .09, .03, s * .13, .2, .42, COL.black, { jit: 0, r: [-.35, 0, 0] });
  }, 80, { rad: .3 }) };
  KIT.bat = {
    body: new PartBatch(S => { S.ico(.11, 0, 0, 0, COL.bat, { sc: [.9, .9, 1.4], d: 1 }); for (const s of [-1, 1]) { S.cone(.03, .1, s * .05, .1, .1, COL.bat, { n: 4 }); S.box(.02, .02, .02, s * .04, .03, .15, COL.black, { jit: 0 }); } }, 50, { rad: .1 }),
    wing: new PartBatch(S => {
      const c = mulC(COL.bat, 1.25), c2 = mulC(COL.bat, .8), pts = [[0, 0, .1], [.2, .03, .14], [.46, .02, .06], [.4, 0, -.06], [.27, 0, -.02], [.2, 0, -.14], [.1, 0, -.06], [0, 0, -.12]];
      for (let i = 1; i < pts.length - 1; i++) { S.tri(pts[0], pts[i + 1], pts[i], i & 1 ? c : c2, L_PLAIN, .9); S.tri(pts[0], pts[i], pts[i + 1], i & 1 ? c : c2, L_PLAIN, .9); }
      S.seg([0, 0, .1], [.46, .02, .06], .014, .008, c2, { n: 3 });
    }, 100, { rad: .1 }),
  };
  KIT.arrow = new PartBatch(S => { S.box(.022, .022, .5, 0, 0, 0, COL.woodL, { jit: 0 }); S.cone(.035, .09, 0, 0, .29, COL.ember, { n: 4, r: [HPI, 0, 0], emis: .9, jit: 0 }); for (const r of [0, HPI]) S.box(.07, .006, .1, 0, 0, -.2, COL.bone, { r: [0, 0, r], jit: 0 }); }, 120, { shadow: false });
  KIT.shell = new PartBatch(S => { S.sph(.12, 0, 0, 0, mulC(COL.iron, .8), { l: L_METAL, w: 7, h: 5, smooth: false, rough: .5 }); S.box(.04, .04, .04, 0, .12, 0, COL.ember, { emis: 1, jit: 0 }); }, 24, {});
  KIT.coin = new PartBatch(S => { S.cyl(.075, .022, 0, 0, 0, COL.gold, { n: 8, l: L_METAL, rough: .35, emis: .16, jit: 0 }); S.cyl(.05, .026, 0, 0, 0, mulC(COL.gold, 1.3), { n: 8, l: L_METAL, rough: .3, emis: .2, jit: 0 }); }, 160, { shadow: false, rad: .05 });
  KIT.goo = new PartBatch(S => { S.ico(.08, 0, 0, 0, COL.slime, { d: 1, rough: .3, emis: .08 }); }, 200, { shadow: false, rad: .06 });
  KIT.rubble = new PartBatch(S => { S.rock(.14, 0, 0, 0, COL.stone, {}); }, 160, { rad: .1 });
  KIT.plank = new PartBatch(S => { S.box(.12, .6, .05, 0, 0, 0, COL.wood, { l: L_WOOD }); }, 100, { rad: .08 });
  initBestiary();
}

const SPEC = {
  skel: { hip: .6, pelvisH: .12, torsoH: .46, shX: .21, shY: .42, uArm: .27, lArm: .29, hipX: .085, uLeg: .29, lLeg: .3, stride: .62, lean: .12, stoop: .1, eyeX: .058, eyeY: .185, eyeZ: .15, top: 1.42 },
  foot: { hip: .59, pelvisH: .1, torsoH: .46, shX: .23, shY: .4, uArm: .27, lArm: .27, hipX: .09, uLeg: .29, lLeg: .29, stride: .55, lean: .06, stoop: 0, eyeX: 0, eyeY: 0, eyeZ: 0, top: 1.4 },
  ogre: { hip: .43, pelvisH: .08, torsoH: .5, shX: .3, shY: .43, uArm: .25, lArm: .3, hipX: .12, uLeg: .21, lLeg: .21, stride: .5, lean: .1, stoop: .14, eyeX: .055, eyeY: .125, eyeZ: .15, top: 1.2 },
};
const RIGOUT = { headM: _M[3], handR: new THREE.Vector3(), handL: new THREE.Vector3(), tip: new THREE.Vector3(), torch: new THREE.Vector3() };
function rigHuman(kit, sp, e) {
  const s = e.scale || 1, mv = e.mv, ph = e.ph, fl = e.flash || 0, tint = e.tint || null, fz = e.flinch || 0;
  const sw = Math.sin(ph) * sp.stride * mv, cw = Math.cos(ph);
  let twist = Math.sin(ph) * .12 * mv, lean = sp.lean * mv + sp.stoop, lunge = 0, dip = 0;
  let shR = .25 * sw - .15, elR = -.35, bladeA = .55, shL = -.7 * sw - .1, elL = -.3, rzR = -.1, rzL = .1;
  if (e.shamble) { shR = -1.0 + .12 * Math.sin(ph); elR = -.7; shL = -.75 + .2 * Math.sin(ph + 1); elL = -.5; bladeA = .2; }
  if (e.shield) { shL = -.55; elL = -1.25; rzL = .2; }
  if (e.torch) { shL = -1.25 + .06 * Math.sin(ph * 2); elL = -.5; }
  if (e.heavy) { shR = -.3 + .3 * sw; elR = -.5; bladeA = 1.9; shL = -.2 - .5 * sw; elL = -.6; }
  if (e.claw) { shR = -1.25 + .45 * sw; elR = -.55; shL = -1.25 - .45 * sw; elL = -.55; }
  if (e.staff) { shR = -.75; elR = -.95; bladeA = .12; }
  if (e.cast > 0) { const u = easeInOut(Math.min(1, e.cast * 1.6)); shR = lerp(shR, -2.7, u); elR = lerp(elR, -.25, u); shL = lerp(shL, -2.3, u); elL = lerp(elL, -.4, u); }
  if (e.drum) { const b = Math.sin(e.beat || 0); shR = -.95 - .5 * Math.max(0, b); elR = -1.15; shL = -.95 - .5 * Math.max(0, -b); elL = -1.15; bladeA = .9; }
  let atk = e.atk;
  if (e.bow) {
    const d = e.draw || 0; shL = -HPI + (e.pitch || 0); elL = -.05; rzL = .05; shR = -HPI + (e.pitch || 0) + .1; elR = -.2 - d * 1.9; twist = .2 + d * .25; atk = -1;
  }
  if (atk >= 0) {
    const t = atk;
    if (t < .38) { const u = easeInOut(t / .38); shR = lerp(shR, -3.35, u); elR = lerp(elR, -.95, u); bladeA = lerp(bladeA, -2.95, u); twist = lerp(twist, -.42, u); lean = lerp(lean, -.12, u); }
    else if (t < .52) { const u = easeIn((t - .38) / .14); shR = lerp(-3.35, -.85, u); elR = lerp(-.95, -.12, u); bladeA = lerp(-2.95, 1.75, u); twist = lerp(-.42, .42, u); lean = lerp(-.12, .26, u); lunge = .14 * u; dip = .05 * u; }
    else { const u = easeOut((t - .52) / .48); shR = lerp(-.85, shR, u); elR = lerp(-.12, elR, u); bladeA = lerp(1.75, bladeA, u); twist = lerp(.42, twist, u); lean = lerp(.26, lean, u); lunge = .14 * (1 - u); dip = .05 * (1 - u); }
  }
  const bob = -sp.uLeg * (1 - Math.cos(sw)) - dip + (e.heavy ? Math.abs(Math.sin(ph)) * .035 * mv : Math.abs(Math.sin(ph)) * .02 * mv);
  const M0 = xf(_M[0], null, e.x, e.y, e.z, 0, e.yaw, 0, s, s, s);
  const M1 = xf(_M[1], M0, 0, sp.hip + sp.uLeg * 0 + bob, lunge - fz * .06, lean * .4 - fz * .18, twist * .5, (e.shamble ? Math.sin(ph) * .05 * mv : 0));
  kit.pelvis.put(M1, fl, tint);
  const M2 = xf(_M[2], M1, 0, sp.pelvisH, 0, lean * .6 - fz * .4, twist, 0);
  kit.torso.put(M2, fl, tint);
  const M3 = xf(_M[3], M2, 0, sp.torsoH, 0, -lean * .6 - fz * .35 + (e.shamble ? Math.sin(ph * 2) * .05 : 0), -twist * .8, e.shamble ? Math.sin(ph) * .1 * mv : 0);
  kit.head.put(M3, fl, tint);
  const M4 = xf(_M[4], M2, sp.shX, sp.shY, 0, shL + fz * .5, 0, rzL + fz * .3), M5 = xf(_M[5], M4, 0, -sp.uArm, 0, elL, 0, 0);
  kit.uArm.put(M4, fl, tint); kit.lArm.put(M5, fl, tint);
  const M6 = xf(_M[6], M2, -sp.shX, sp.shY, 0, shR + fz * .4, 0, rzR - fz * .3), M7 = xf(_M[7], M6, 0, -sp.uArm, 0, elR, 0, 0);
  kit.uArm.put(M6, fl, tint); kit.lArm.put(M7, fl, tint);
  RIGOUT.handR.set(0, -sp.lArm, 0).applyMatrix4(M7); RIGOUT.handL.set(0, -sp.lArm, 0).applyMatrix4(M5);
  const I = KIT.item, psiR = shR + elR + fz * .4, psiL = shL + elL + fz * .5;
  if (e.weapon) { const M8 = xf(_M[8], M7, 0, -sp.lArm, 0, bladeA - psiR, 0, 0, e.wScale || 1, e.wScale || 1, e.wScale || 1); e.weapon.put(M8, fl, null); RIGOUT.tip.set(0, .6, 0).applyMatrix4(M8); }
  if (e.shield) { const M9 = xf(_M[9], M5, .04, -sp.lArm * .6, .06, -psiL + .05, .25, 0); e.shield.put(M9, fl, e.shieldTint || null); }
  if (e.torch) { const M9 = xf(_M[9], M5, 0, -sp.lArm, 0, .25 - psiL, 0, 0); I.torch.put(M9, 0, null); RIGOUT.torch.set(0, .46, 0).applyMatrix4(M9); }
  if (e.bow) { const M9 = xf(_M[9], M5, 0, -sp.lArm, 0, HPI + .0, 0, 0); I.bow.put(M9, fl, null); }
  if (e.helm) I.helm.put(M3, fl, null);
  if (e.plate) I.plate.put(M2, fl, null);
  if (e.hood) I.hood.put(M3, fl, null); if (e.robe) I.robe.put(M2, fl, null); if (e.drum) I.drum.put(M2, fl, null); if (e.standard) I.standard.put(M2, 0, null);
  if (e.keg) I.keg.put(M2, fl, null); if (e.wraps) { I.wraps.put(M2, fl, null); I.wrapHead.put(M3, fl, null); } if (e.crown) I.crown.put(M3, fl, null);
  const kL = Math.max(0, cw) * 1.0 * mv, kR = Math.max(0, -cw) * 1.0 * mv;
  const M10 = xf(_M[10], M1, sp.hipX, 0, 0, -sw - kL * .25, 0, 0), M11 = xf(_M[11], M10, 0, -sp.uLeg, 0, kL, 0, 0);
  const M12 = xf(_M[12], M1, -sp.hipX, 0, 0, sw - kR * .25, 0, 0), M13 = xf(_M[13], M12, 0, -sp.uLeg, 0, kR, 0, 0);
  kit.uLeg.put(M10, fl, tint); kit.lLeg.put(M11, fl, tint); kit.uLeg.put(M12, fl, tint); kit.lLeg.put(M13, fl, tint);
  return M3;
}
function rigRat(e) {
  const K = KIT.rat, ph = e.ph, s = e.scale || 1, fl = e.flash || 0, mv = e.mv;
  const M0 = xf(_M[0], null, e.x, e.y + (.2 + Math.abs(Math.sin(ph * 2)) * .035 * mv) * s, e.z, Math.sin(ph * 2) * .07 * mv - (e.flinch || 0) * .5, e.yaw, 0, s, s, s);
  K.body.put(M0, fl, e.tint);
  for (let i = 0; i < 4; i++) {
    const fr = i < 2, sd = (i & 1) ? -1 : 1, a = Math.sin(ph * 2 + (fr === (sd > 0) ? 0 : PI)) * .9 * mv;
    K.leg.put(xf(_M[4 + i], M0, sd * .12, -.04, fr ? .16 : -.16, a, 0, sd * .15), fl, e.tint);
  }
  const T1 = xf(_M[8], M0, 0, .03, -.26, .25, Math.sin(ph + 1) * .4, 0); K.tail.put(T1, fl, e.tint);
  K.tail.put(xf(_M[9], T1, 0, 0, -.24, -.2, Math.sin(ph + 2.2) * .6, 0, .8, .8, 1), fl, e.tint);
  return M0;
}
function rigSlime(e) {
  const s = e.scale || 1, h = e.hop || 0, fl = e.flash || 0;
  let sy = 1, y = 0;
  if (h < .22) sy = 1 - .3 * easeOut(h / .22);
  else if (h < .6) { const u = (h - .22) / .38; sy = .7 + .62 * Math.sin(Math.min(1, u * 1.6) * HPI) - .12 * u; y = Math.sin(u * PI) * .34; }
  else if (h < .76) { const u = (h - .6) / .16; sy = 1.2 - .5 * Math.sin(u * PI) - .2 * u; }
  else sy = 1 + .04 * Math.sin((h - .76) / .24 * TAU);
  sy *= 1 - (e.flinch || 0) * .25; const sx = 1 / Math.sqrt(Math.max(.4, sy));
  const M0 = xf(_M[0], null, e.x, e.y + y * s, e.z, 0, e.yaw, 0, s * sx, s * sy, s * sx);
  KIT.slime.body.put(M0, fl, e.tint); return M0;
}
function rigBat(e, K = KIT.bat, wx = .06, wy = .02) {
  const s = e.scale || 1, fl = e.flash || 0, f = Math.sin(e.ph), tint = e.tint || null;
  const M0 = xf(_M[0], null, e.x, e.y + Math.sin(e.ph * .5) * .08, e.z, -.25 + (e.flinch || 0) * .8, e.yaw, Math.sin(e.ph * .25) * .15, s, s, s);
  K.body.put(M0, fl, tint);
  K.wing.put(xf(_M[1], M0, wx, wy, 0, 0, 0, f * .85 + .15), fl, tint);
  K.wing.put(xf(_M[2], M0, -wx, wy, 0, 0, 0, -(f * .85 + .15), -1, 1, 1), fl, tint);
  return M0;
}

const DEB = [];
const _dq = new THREE.Quaternion(), _dax = new THREE.Vector3(), _dp = new THREE.Vector3(), _ds = new THREE.Vector3(), _dm = new THREE.Matrix4();
function addDebris(batch, mat, tint, vx, vy, vz, spin, life, o = {}) {
  if (DEB.length > 520) return null;
  const d = { batch, p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3(), vx, vy, vz, w: new THREE.Vector3(rr(-1, 1), rr(-1, 1), rr(-1, 1)).normalize(), ws: spin, life, max: life, tint: tint ? tint.slice() : null, rad: o.rad || batch.rad, rest: false, coin: o.coin || 0, bounce: o.bounce === undefined ? .32 : o.bounce, flash: o.flash || 0, goo: o.goo || 0, hold: o.hold || 0 };
  mat.decompose(d.p, d.q, d.s); d.rad *= Math.max(d.s.x, d.s.y); DEB.push(d); return d;
}
function shatter(rigFn, e, impulse, o = {}) {
  const ix = impulse[0], iy = impulse[1], iz = impulse[2], spread = o.spread === undefined ? 1.6 : o.spread;
  RIG_CAPTURE = (batch, mat, tint) => { addDebris(batch, mat, tint, ix + rr(-spread, spread), iy + rr(.4, 2.2) * (o.up || 1), iz + rr(-spread, spread), rr(3, 11), rr(3.2, 5.5) * (o.life || 1), { hold: o.hold ? rr(0, o.hold) : 0 }); };
  try { rigFn(e); } finally { RIG_CAPTURE = null; }
}
function updateDebris(dt, groundAt, onCoin) {
  for (let i = DEB.length - 1; i >= 0; i--) {
    const d = DEB[i]; d.life -= dt;
    if (d.life <= 0) { swapRemove(DEB, i); continue; }
    if (d.hold > 0) { d.hold -= dt; }
    else if (!d.rest) {
      d.vy -= 13 * dt; d.p.x += d.vx * dt; d.p.y += d.vy * dt; d.p.z += d.vz * dt;
      _dq.setFromAxisAngle(d.w, d.ws * dt); d.q.premultiply(_dq);
      const gy = groundAt(d.p.x, d.p.z) + d.rad;
      if (d.p.y < gy) {
        d.p.y = gy;
        if (d.goo) { d.life = 0; continue; }
        if (Math.abs(d.vy) < 1.2) { d.rest = true; d.vy = 0; } else { d.vy = -d.vy * d.bounce; }
        d.vx *= .55; d.vz *= .55; d.ws *= .5;
      }
    } else if (d.life < .9 && !d.coin) { d.p.y -= dt * .22; }
    if (d.coin && d.max - d.life > d.coin) { onCoin(d); swapRemove(DEB, i); continue; }
    let sc = 1; if (!d.coin && d.life < .5) sc = Math.max(.01, d.life / .5);
    _dm.compose(d.p, d.q, _ds.copy(d.s).multiplyScalar(sc));
    d.batch.put(_dm, d.flash, d.tint);
  }
}
function clearDebris() { DEB.length = 0; }


SPEC.golem = { hip: .5, pelvisH: .1, torsoH: .56, shX: .36, shY: .44, uArm: .26, lArm: .38, hipX: .15, uLeg: .22, lLeg: .24, stride: .42, lean: .1, stoop: .16, eyeX: .04, eyeY: .1, eyeZ: .16, top: 1.35 };

function golemKit(cap) {
  const k = {}, limb = cap * 2, c = [.34, .34, .37], cd = [.22, .22, .25], gl = [1, .9, .8], rk = () => ({ l: L_ROCK, jit: .08 });
  k.pelvis = new PartBatch(S => { S.rock(.2, 0, 0, 0, cd, { sq: .7 }); }, cap, { rad: .2, shadow: false });
  k.torso = new PartBatch(S => {
    S.rock(.3, 0, .2, 0, c, { sq: .9 }); S.rock(.27, 0, .4, -.02, c, { sq: .7 }); S.rock(.13, -.1, .56, -.12, cd, { sq: .9 });
    for (const s of [-1, 1]) S.rock(.19, s * .33, .44, 0, cd, { sq: .8 });
    S.box(.035, .26, .03, .06, .26, .28, gl, { emis: .1, jit: 0, r: [0, 0, .35] }); S.box(.03, .18, .03, -.07, .3, .28, gl, { emis: .1, jit: 0, r: [0, 0, -.5] }); S.box(.03, .14, .03, 0, .14, .27, gl, { emis: .1, jit: 0, r: [0, 0, 1.2] });
  }, cap, { rad: .3 });
  k.head = new PartBatch(S => { S.rock(.14, 0, .1, .03, c, { sq: .85 }); S.box(.22, .05, .1, 0, .17, .1, cd, rk()); S.box(.15, .035, .03, 0, .1, .155, gl, { emis: .22, jit: 0 }); }, cap, { rad: .14, shadow: false });
  k.uArm = new PartBatch(S => { S.rock(.13, 0, -.12, 0, c, { sq: 1.25 }); }, limb, { rad: .12, shadow: false });
  k.lArm = new PartBatch(S => { S.rock(.17, 0, -.15, 0, c, { sq: 1.15 }); S.rock(.15, 0, -.36, .02, cd, { sq: .9 }); }, limb, { rad: .15, shadow: false });
  k.uLeg = new PartBatch(S => { S.rock(.15, 0, -.1, 0, cd, { sq: 1.1 }); }, limb, { rad: .13, shadow: false });
  k.lLeg = new PartBatch(S => { S.rock(.15, 0, -.12, 0, c, { sq: 1.1 }); S.box(.24, .1, .32, 0, -.24, .04, cd, rk()); }, limb, { rad: .13, shadow: false });
  return k;
}

function initBestiary() {
  const I = KIT.item, cloth = C(0x3b3048), clothL = C(0x6a4a78), wrap = C(0xcdbf9a), N = { rad: .2, shadow: false };
  KIT.golem = golemKit(8);
  I.hood = new PartBatch(S => {
    S.add(gDome(8, 4), { s: [.2, .17, .21], p: [0, .19, -.03], c: cloth, l: L_CLOTH });
    S.box(.34, .24, .1, 0, .1, -.15, cloth, { l: L_CLOTH }); S.box(.3, .05, .05, 0, .2, .15, clothL, { l: L_CLOTH });
    for (const s of [-1, 1]) S.box(.06, .26, .2, s * .18, .1, -.04, mulC(cloth, .8), { l: L_CLOTH });
  }, 12, N);
  I.robe = new PartBatch(S => {
    S.add(gCyl(8, .5, true), { s: [.3, 1.12, .27], p: [0, -.12, 0], c: cloth, l: L_CLOTH, dbl: true, deform: v => { if (v.y < 0) { const j = .85 + .3 * vnoise(Math.atan2(v.z, v.x) * 2 + 3, 1, 7); v.x *= j; v.z *= j; v.y += (j - 1) * .25; } }, cf: v => .7 + .3 * sat(v.y / .56 + .5) });
    S.box(.46, .1, .28, 0, .4, 0, clothL, { l: L_CLOTH }); S.cyl(.2, .05, 0, .02, 0, COL.rope, { n: 8 });
  }, 12, N);
  I.staff = new PartBatch(S => {
    S.seg([0, -.55, 0], [0, .95, 0], .028, .024, COL.woodD, { l: L_WOOD, n: 5 });
    for (let a = 0; a < 3; a++) S.seg([0, .9, 0], [Math.cos(a * 2.1) * .09, 1.08, Math.sin(a * 2.1) * .09], .02, .008, COL.bone, { l: L_BONE, n: 4 });
    S.ico(.075, 0, 1.06, 0, [.35, 1, .5], { d: 1, emis: .2, jit: 0 });
  }, 12, N);
  I.drum = new PartBatch(S => {
    const T = new Soup(); T.cyl(.2, .2, 0, 0, 0, C(0x7a2c24), { n: 10, l: L_WOOD }); T.cyl(.205, .03, 0, .1, 0, C(0xc9b28a), { n: 10 }); T.cyl(.212, .025, 0, -.09, 0, COL.brass, { n: 10, l: L_METAL }); T.cyl(.212, .025, 0, .08, 0, COL.brass, { n: 10, l: L_METAL });
    S.merge(T, { p: [0, .1, .28], r: [.5, 0, 0], ao: null }); S.box(.05, .5, .03, .05, .26, .13, COL.leather, { r: [0, 0, .55] });
  }, 8, N);
  I.standard = new PartBatch(S => {
    S.seg([0, .1, -.14], [0, 1.55, -.2], .022, .018, COL.woodD, { l: L_WOOD, n: 4 }); S.seg([-.2, 1.42, -.2], [.2, 1.42, -.2], .016, .016, COL.woodD, { l: L_WOOD, n: 4 });
    clothPanel(S, { x0: -.18, x1: .18, yTop: 1.41, len: .56, z: -.2, col: COL.clothR, col2: mulC(COL.gold, .6), rng: makeRng(21), sway: 0, nx: 3, ny: 5 });
    PROP.skull(S, 0, 1.62, -.2, .07, 0);
  }, 8, { rad: .3, shadow: false });
  I.stick = new PartBatch(S => { S.seg([0, -.05, 0], [0, .3, 0], .02, .018, COL.bone, { l: L_BONE, n: 4 }); S.ico(.04, 0, .32, 0, COL.boneD, { d: 0, l: L_BONE }); }, 8, N);
  I.keg = new PartBatch(S => {
    const T = new Soup(); PROP.barrel(T, 0, 0, 0, .8, makeRng(3)); S.merge(T, { p: [.215, .26, -.24], r: [0, 0, HPI], ao: null });
    S.seg([0, .4, -.24], [.05, .52, -.22], .012, .01, COL.rope, { n: 3 }); S.ico(.035, .05, .53, -.22, COL.ember, { d: 0, emis: .6, jit: 0 });
    S.box(.05, .5, .03, 0, .22, .12, COL.leather, { r: [0, 0, .5] });
  }, 12, N);
  I.wraps = new PartBatch(S => {
    let k = 0; for (const [y, w, rz] of [[.12, .3, .1], [.2, .33, -.12], [.29, .35, .08], [.37, .37, -.06]]) S.box(w, .05, .25, 0, y, 0, mulC(wrap, .8 + .1 * (k++ & 1) * 3), { l: L_CLOTH, r: [0, 0, rz] });
    S.box(.05, .3, .02, .1, -.08, .12, wrap, { l: L_CLOTH, r: [0, 0, .15] });
  }, 12, N);
  I.wrapHead = new PartBatch(S => { S.cyl(.16, .07, 0, .26, 0, wrap, { n: 8, l: L_CLOTH }); S.cyl(.158, .05, 0, .09, .01, mulC(wrap, .85), { n: 8, l: L_CLOTH }); S.box(.04, .22, .02, .1, .06, -.15, wrap, { l: L_CLOTH, r: [.3, 0, .2] }); }, 12, N);
  I.crown = new PartBatch(S => {
    const g = mulC(COL.gold, .9);
    S.cyl(.165, .07, 0, .3, 0, g, { n: 8, l: L_METAL, rough: .35, emis: .03 });
    for (let a = 0; a < 6; a++) S.cone(.03, .12, Math.cos(a * 1.047) * .15, .39, Math.sin(a * 1.047) * .15, g, { n: 4, l: L_METAL, rough: .35, emis: .03 });
    for (const s of [-1, 1]) S.box(.05, .3, .16, s * .17, .12, -.02, C(0x2a4a8a), { l: L_CLOTH });
    S.ico(.03, 0, .31, .16, [.2, .9, .8], { d: 0, emis: .3, jit: 0 });
  }, 2, N);
  I.khopesh = new PartBatch(S => {
    const g = mulC(COL.gold, .85); S.box(.04, .2, .04, 0, 0, 0, COL.leather, {}); S.box(.14, .03, .05, 0, .11, 0, g, { l: L_METAL });
    let p = [.24, 0]; for (const [y, z] of [[.4, .03], [.52, .1], [.62, .2], [.66, .32]]) { const dy = y - p[0], dz = z - p[1], l = Math.hypot(dy, dz); S.box(.02, l + .02, .075, 0, (y + p[0]) / 2, (z + p[1]) / 2, g, { l: L_METAL, rough: .35, r: [Math.atan2(dz, dy), 0, 0] }); p = [y, z]; }
    S.box(.02, .14, .07, 0, .18, 0, g, { l: L_METAL, rough: .35 });
  }, 2, N);
  I.iceclub = new PartBatch(S => {
    S.seg([0, -.12, 0], [0, .5, 0], .045, .06, COL.wood, { l: L_WOOD, n: 6 });
    for (let a = 0; a < 5; a++) S.add(gOct(), { s: [.09, .25, .09], p: [Math.cos(a * 1.26) * .07, .6 + (a & 1) * .06, Math.sin(a * 1.26) * .07], r: [Math.sin(a * 1.26) * .5, a, -Math.cos(a * 1.26) * .5], c: COL.ice, rough: .15, emis: .05 });
  }, 2, { rad: .1, shadow: false });

  KIT.spider = {
    body: new PartBatch(S => {
      const c = [.3, .27, .27], cd = [.19, .17, .18];
      S.ico(.2, 0, .03, -.2, c, { sc: [.95, .8, 1.25], d: 1 }); S.ico(.13, 0, 0, .08, cd, { sc: [1, .72, 1.1], d: 1 });
      S.box(.07, .02, .13, 0, .19, -.2, [1, .25, .12], { emis: .12, jit: 0 });
      for (const s of [-1, 1]) { S.cone(.025, .1, s * .045, -.06, .2, C(0x1a1414), { n: 4, r: [PI - .5, 0, 0] }); for (const [ex, ey, ez] of [[.035, .06, .19], [.075, .05, .16]]) S.box(.022, .022, .02, s * ex, ey, ez, COL.black, { jit: 0 }); }
    }, 70, { rad: .2 }),
    leg: new PartBatch(S => { const c = [.2, .18, .19]; S.seg([0, 0, 0], [.2, .15, 0], .024, .02, c, { n: 4 }); S.seg([.2, .15, 0], [.4, -.17, 0], .02, .009, c, { n: 4 }); }, 560, { rad: .05, shadow: false }),
  };
  KIT.wolf = {
    body: new PartBatch(S => {
      const f = [.3, .3, .33], fd = [.2, .2, .23];
      S.ico(.2, 0, .02, .16, f, { sc: [.78, .95, 1.15], d: 1 }); S.ico(.16, 0, 0, -.2, fd, { sc: [.78, .85, 1.35], d: 1 }); S.ico(.1, 0, 0, .3, [.42, .42, .45], { sc: [.7, .7, .6], d: 1 });
      for (let k = 0; k < 4; k++) S.cone(.045, .13, 0, .2 - k * .02, .2 - k * .13, fd, { n: 4, r: [-.5, 0, 0] });
      S.seg([0, .08, .3], [0, .2, .46], .11, .085, f, { n: 6 });
      S.ico(.105, 0, .24, .52, f, { sc: [.9, .85, 1.1], d: 1 }); S.box(.085, .07, .17, 0, .21, .66, fd, {}); S.box(.04, .03, .03, 0, .235, .75, COL.black, { jit: 0 }); S.box(.07, .025, .14, 0, .16, .64, C(0x3a1a18), {});
      for (const s of [-1, 1]) { S.cone(.035, .1, s * .065, .35, .48, fd, { n: 4 }); S.box(.025, .022, .02, s * .05, .27, .615, COL.black, { jit: 0 }); S.box(.012, .035, .012, s * .03, .165, .7, COL.bone, { jit: 0 }); }
    }, 28, { rad: .22 }),
    leg: new PartBatch(S => { const fd = [.2, .2, .23]; S.seg([0, 0, 0], [0, -.2, -.03], .055, .038, fd, { n: 5 }); S.seg([0, -.2, -.03], [0, -.39, .02], .034, .026, fd, { n: 5 }); S.box(.06, .035, .09, 0, -.4, .04, [.13, .13, .15], {}); }, 112, { rad: .05, shadow: false }),
    tail: new PartBatch(S => { S.seg([0, 0, 0], [0, -.07, -.3], .055, .02, [.2, .2, .23], { n: 5 }); }, 28, { rad: .05, shadow: false }),
  };
  KIT.wraith = {
    body: new PartBatch(S => {
      const c = [.2, .25, .32], cd = [.12, .15, .2];
      S.add(gCyl(8, .32, true), { s: [.36, .96, .36], p: [0, .5, 0], c, l: L_CLOTH, dbl: true, emis: .012, deform: v => { if (v.y < 0) { const j = .75 + .55 * vnoise(Math.atan2(v.z, v.x) * 2.3 + 1, 2, 9); v.x *= j; v.z = v.z * j - .12; v.y += (j - 1) * .3; } }, cf: v => .55 + .45 * sat(v.y / .48 + .5) });
      S.ico(.22, 0, .9, -.02, cd, { sc: [1.3, .45, .95], d: 1, l: L_CLOTH });
      S.add(gDome(8, 4), { s: [.19, .2, .2], p: [0, 1.06, -.03], c: cd, l: L_CLOTH }); S.box(.3, .22, .1, 0, .98, -.14, cd, { l: L_CLOTH });
      S.sph(.115, 0, 1.03, .05, COL.bone, { sc: [1, 1.05, 1], l: L_BONE, w: 7, h: 5, smooth: false, emis: .03 }); S.box(.11, .06, .08, 0, .93, .1, COL.boneD, { l: L_BONE });
      for (const s of [-1, 1]) S.box(.045, .045, .03, s * .045, 1.04, .15, COL.black, { jit: 0 });
    }, 30, { rad: .3 }),
    arm: new PartBatch(S => { const c = [.16, .2, .27]; S.seg([0, 0, 0], [0, -.1, .3], .075, .05, c, { l: L_CLOTH, n: 5 }); for (let k = -1; k <= 1; k++) S.seg([k * .025, -.1, .3], [k * .05, -.16, .42], .012, .006, COL.bone, { n: 3, l: L_BONE }); }, 60, { rad: .08, shadow: false }),
  };
  KIT.garg = {
    body: new PartBatch(S => {
      const st = [.3, .31, .35], sd = [.2, .21, .24];
      S.ico(.17, 0, 0, 0, st, { sc: [.9, 1.0, 1.05], d: 1, l: L_ROCK }); S.ico(.11, 0, .13, .17, st, { sc: [.95, .9, 1.05], d: 1, l: L_ROCK }); S.box(.1, .06, .1, 0, .08, .27, sd, { l: L_ROCK });
      for (const s of [-1, 1]) {
        S.seg([s * .06, .2, .14], [s * .13, .3, .04], .03, .02, sd, { n: 4 }); S.seg([s * .13, .3, .04], [s * .12, .36, -.08], .02, .006, sd, { n: 4 }); S.box(.03, .03, .02, s * .045, .15, .265, COL.black, { jit: 0 });
        S.seg([s * .12, -.02, .08], [s * .15, -.16, .2], .04, .028, sd, { n: 4 }); S.seg([s * .09, -.1, -.08], [s * .12, -.24, 0], .045, .03, sd, { n: 4 });
      }
      S.seg([0, -.05, -.15], [0, -.14, -.42], .04, .012, sd, { n: 4 }); S.cone(.04, .08, 0, -.15, -.46, sd, { n: 4, r: [-HPI, 0, 0] });
    }, 24, { rad: .2 }),
    wing: new PartBatch(S => {
      const c = [.26, .27, .31], c2 = [.17, .18, .21], pts = [[0, 0, .12], [.3, .06, .2], [.74, .04, .1], [.66, 0, -.1], [.46, 0, -.04], [.36, 0, -.24], [.18, 0, -.1], [0, 0, -.18]];
      for (let i = 1; i < pts.length - 1; i++) { S.tri(pts[0], pts[i + 1], pts[i], i & 1 ? c : c2, L_PLAIN, .9); S.tri(pts[0], pts[i], pts[i + 1], i & 1 ? c : c2, L_PLAIN, .9); }
      S.seg([0, 0, .12], [.3, .06, .2], .03, .022, c2, { n: 4 }); S.seg([.3, .06, .2], [.74, .04, .1], .022, .01, c2, { n: 4 });
    }, 48, { rad: .15, shadow: false }),
  };
  KIT.wisp = { core: new PartBatch(S => { S.ico(.07, 0, 0, 0, [.5, .5, .5], { d: 1, emis: .45, jit: 0 }); }, 60, { rad: .07, shadow: false }) };
  const tc = [.2, .29, .15], tcd = [.13, .2, .1], pale = [.46, .46, .28];
  const toadLeg = sg => new PartBatch(S => { S.seg([0, 0, 0], [sg * .17, .05, -.1], .075, .06, tc, { n: 5 }); S.seg([sg * .17, .05, -.1], [sg * .2, -.12, .08], .055, .04, tcd, { n: 5 }); S.box(.1, .03, .18, sg * .21, -.14, .14, tcd, {}); }, 40, { rad: .1, shadow: false });
  KIT.toad = {
    body: new PartBatch(S => {
      S.ico(.27, 0, .17, -.02, tc, { sc: [1.1, .72, 1.2], d: 1, c2: [pale[0], pale[1], pale[2], v => smooth(0, -.14, v.y)] }); S.ico(.19, 0, .2, .2, tc, { sc: [1.15, .68, 1.0], d: 1 });
      S.box(.34, .02, .2, 0, .15, .27, [.05, .06, .04], { jit: 0 }); S.ico(.12, 0, .08, .26, pale, { sc: [1.1, .7, .8], d: 1 });
      for (const s of [-1, 1]) { S.sph(.075, s * .12, .33, .2, tcd, { w: 6, h: 4 }); S.box(.05, .05, .03, s * .125, .345, .265, COL.black, { jit: 0 }); S.seg([s * .2, .1, .16], [s * .26, -.02, .26], .045, .035, tcd, { n: 4 }); S.box(.08, .025, .1, s * .27, -.03, .3, tcd, {}); }
      for (const [x, y, z] of [[.1, .34, -.1], [-.14, .31, -.02], [.02, .36, -.2], [-.05, .33, .05]]) S.ico(.035, x, y, z, tcd, { d: 0 });
    }, 40, { rad: .3 }),
    legR: toadLeg(1), legL: toadLeg(-1),
  };
}

function rigSpider(e) {
  const K = KIT.spider, s = e.scale || 1, fl = e.flash || 0, ph = e.ph, mv = e.mv, Z = [.15, .08, 0, -.08], A = [1.0, .4, -.3, -.9];
  const M0 = xf(_M[0], null, e.x, e.y + (.19 + Math.abs(Math.sin(ph * 2)) * .015 * mv) * s, e.z, -(e.flinch || 0) * .3, e.yaw, Math.sin(ph) * .04 * mv, s, s, s);
  K.body.put(M0, fl, e.tint);
  for (let i = 0; i < 4; i++) for (const sd of [-1, 1]) {
    const g = ((i + (sd > 0 ? 0 : 1)) & 1) ? PI : 0, a = A[i] + Math.sin(ph * 2 + g) * .32 * mv, lift = Math.max(0, Math.cos(ph * 2 + g)) * .3 * mv;
    K.leg.put(xf(_M[1 + i * 2 + (sd > 0 ? 0 : 1)], M0, sd * .09, 0, Z[i], 0, sd > 0 ? -a : PI + a, lift), fl, e.tint);
  }
  return M0;
}
function rigWolf(e) {
  const K = KIT.wolf, ph = e.ph, s = e.scale || 1, fl = e.flash || 0, mv = e.mv, g = Math.sin(ph * 2);
  const M0 = xf(_M[0], null, e.x, e.y + (.43 + Math.abs(g) * .06 * mv) * s, e.z, g * .1 * mv - (e.flinch || 0) * .4, e.yaw, 0, s, s, s);
  K.body.put(M0, fl, e.tint);
  for (let i = 0; i < 4; i++) { const fr = i < 2, sd = (i & 1) ? -1 : 1, a = Math.sin(ph * 2 + (fr ? 0 : 2.6) + (sd > 0 ? 0 : .5)) * .85 * mv; K.leg.put(xf(_M[4 + i], M0, sd * .1, -.04, fr ? .2 : -.26, a, 0, 0), fl, e.tint); }
  K.tail.put(xf(_M[8], M0, 0, .06, -.4, -.3 + g * .2 * mv, Math.sin(ph + 1) * .3, 0), fl, e.tint);
  return M0;
}
function rigWraith(e) {
  const K = KIT.wraith, s = e.scale || 1, fl = e.flash || 0, t = SH.uTime.value + (e.lseed || 0);
  const M0 = xf(_M[0], null, e.x, e.y + (.22 + Math.sin(t * 2.1) * .07) * s, e.z, .16 * e.mv - (e.flinch || 0) * .4, e.yaw, Math.sin(t * 1.3) * .06, s, s, s);
  K.body.put(M0, fl, e.tint);
  for (const sd of [-1, 1]) K.arm.put(xf(_M[sd > 0 ? 1 : 2], M0, sd * .22, .84, .04, -.25 + Math.sin(t * 1.7 + sd) * .22, sd * -.25, 0), fl, e.tint);
  return M0;
}
function rigWisp(e) {
  const s = (e.scale || 1) * (1 + .15 * Math.sin(SH.uTime.value * 9 + (e.lseed || 0) * 5));
  const M0 = xf(_M[0], null, e.x, e.y, e.z, 0, e.yaw, 0, s, s, s); KIT.wisp.core.put(M0, e.flash || 0, e.tint); return M0;
}
function rigToad(e) {
  const K = KIT.toad, s = e.scale || 1, h = e.hop || 0, fl = e.flash || 0;
  let y = 0, pitch = 0, ext = 0, sq = 1;
  if (h < .22) sq = 1 - .22 * easeOut(h / .22);
  else if (h < .62) { const u = (h - .22) / .4; y = Math.sin(u * PI) * .5; pitch = -.45 * Math.cos(u * PI); ext = Math.sin(Math.min(1, u * 1.5) * PI); sq = 1.08; }
  else if (h < .78) sq = 1 - .25 * Math.sin((h - .62) / .16 * PI);
  sq *= 1 - (e.flinch || 0) * .2;
  const M0 = xf(_M[0], null, e.x, e.y + (.1 + y) * s, e.z, pitch, e.yaw, 0, s, s * sq, s);
  K.body.put(M0, fl, e.tint);
  K.legR.put(xf(_M[1], M0, .17, .06, -.14, -ext * .9, 0, 0), fl, e.tint); K.legL.put(xf(_M[2], M0, -.17, .06, -.14, -ext * .9, 0, 0), fl, e.tint);
  return M0;
}


const G = {
  B: null, t: 0, gold: 0, lives: 20, maxLives: 20, wave: 0, slain: 0, level: 0, run: 1,
  towers: [], mons: [], men: [], arrows: [], shells: [], stuck: [], hbars: [], phase: 'play',
};
const TOWER = {
  archer: { name: 'Archer tower', short: 'Archers', icon: 'archer', cost: [70, 90, 140], range: [6.2, 6.8, 7.4], dmg: [9, 11, 14], rate: [.85, .78, .7], n: [1, 2, 3], air: true, ground: true, light: [80, 105, 140], desc: ['Fast flaming arrows.', 'Can hit flyers.'] },
  bombard: { name: 'Bombard', short: 'Bombard', icon: 'bombard', cost: [120, 130, 190], range: [7.4, 8.0, 8.6], minRange: 2.3, dmg: [36, 60, 98], splash: [1.55, 1.8, 2.1], rate: [2.9, 2.7, 2.5], air: false, ground: true, light: [50, 62, 80], desc: ['Slow shells that burst.', 'Ground targets only.'] },
  spire: { name: 'Storm spire', short: 'Spire', icon: 'spire', cost: [110, 120, 180], range: [5.5, 6.0, 6.5], dmg: [17, 25, 35], jumps: [3, 4, 6], rate: [2.3, 2.1, 1.9], slow: [.36, .42, .48], slowT: [1.3, 1.5, 1.7], air: true, ground: true, light: [16, 20, 26], desc: ['Chain lightning that slows.', 'Can hit flyers.'] },
  guard: { name: 'Guard post', short: 'Guards', icon: 'guard', cost: [80, 90, 150], range: [3.4, 3.7, 4.0], n: [2, 3, 3], hp: [62, 90, 135], dmg: [7, 10, 15], rate: [7, 6, 5], air: false, ground: true, light: [55, 70, 90], desc: ['Footmen who block', 'and duel on the road.'] },
};
const TOWER_KINDS = ['archer', 'bombard', 'spire', 'guard'];

function blueprint(kind, lvl) {
  const pieces = [], mounts = {};
  const piece = (id, order, fn) => {
    const S = new Soup(); fn(S); if (!S.verts) return; let minY = 1e9; for (let i = 1; i < S.P.length; i += 3) minY = Math.min(minY, S.P[i]);
    for (let i = 1; i < S.P.length; i += 3) S.P[i] -= minY; pieces.push({ id, order, y: minY, soup: S });
  };
  const w = COL.wood, wd = COL.woodD, wl = COL.woodL, st = COL.stone, sdk = COL.stoneD, sl = COL.stoneL, iron = COL.iron, rng = soupRng;
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const brazier = (S, x, y, z, bs) => {
    for (let k = 0; k < 3; k++) { const a = k * TAU / 3 + .5; S.seg([x + Math.cos(a) * bs * .42, y, z + Math.sin(a) * bs * .42], [x + Math.cos(a) * bs * .2, y + bs * .5, z + Math.sin(a) * bs * .2], .028, .028, iron, { l: L_METAL, n: 4 }); }
    S.cyl(bs * .3, bs * .22, x, y + bs * .56, z, iron, { n: 8, l: L_METAL, rt: 1.5, rough: .6 });
    S.cyl(bs * .4, .04, x, y + bs * .68, z, COL.ember, { n: 8, emis: .55, jit: 0 });
  };
  if (kind === 'archer') {
    const bH = [.25, 1.0, 1.9][lvl], H = [2.0, 2.7, 3.35][lvl], W = [.75, .85, .93][lvl], bs = [.5, .62, .8][lvl];
    piece('base', 0, S => {
      if (lvl === 0) { S.box(1.6, .25, 1.6, 0, .125, 0, sdk, { l: L_MASON }); for (const [a, b] of corners) S.box(.3, .32, .3, a * .66, .16, b * .66, sl, { l: L_MASON }); }
      else {
        S.box(1.8, .3, 1.8, 0, .15, 0, sdk, { l: L_MASON });
        S.cyl(1.02, bH - .3, 0, .3 + (bH - .3) / 2, 0, st, { n: 4, l: L_MASON, rt: .9, r: [0, PI / 4, 0] });
        S.box(1.42, .14, 1.42, 0, bH - .04, 0, sl, { l: L_MASON });
        S.box(.3, .5, .06, 0, .56, .71, COL.black, { jit: 0 });
        if (lvl === 2) { for (const [a, b] of corners) for (let q = 0; q < 3; q++) S.box(.22, .2, .22, a * (.7 - q * .025), .5 + q * .5, b * (.7 - q * .025), sl, { l: L_MASON }); for (const sg of [-1, 1]) S.box(.06, .5, .12, sg * .7, 1.1, 0, COL.black, { jit: 0 }); }
      }
    });
    piece('posts', 1, S => {
      for (const [a, b] of corners) S.seg([a * .62, bH, b * .62], [a * (W - .1), H, b * (W - .1)], .085, .075, wd, { l: L_WOOD });
      const ym = (bH + H) / 2, r = lerp(.62, W - .1, .5);
      for (let k = 0; k < 4; k++) { const [a, b] = corners[k], [c, d] = corners[(k + 1) % 4]; S.seg([a * r, ym, b * r], [c * r, ym, d * r], .05, .05, w, { l: L_WOOD, n: 4 }); }
    });
    piece('brace', 2, S => {
      for (let k = 0; k < 4; k++) { const [a, b] = corners[k], [c, d] = corners[(k + 1) % 4]; S.seg([a * .62, bH + .1, b * .62], [c * (W - .12), H - .15, d * (W - .12)], .035, .035, w, { l: L_WOOD, n: 4 }); S.seg([c * .62, bH + .1, d * .62], [a * (W - .12), H - .15, b * (W - .12)], .035, .035, wl, { l: L_WOOD, n: 4 }); }
    });
    piece('deck', 3, S => {
      S.box(W * 2 + .16, .1, W * 2 + .16, 0, H + .05, 0, w, { l: L_WOOD }); for (const sg of [-1, 1]) S.box(W * 2 + .3, .09, .1, 0, H - .04, sg * (W - .1), wd, { l: L_WOOD });
      for (const sg of [-1, 1]) S.box(.1, .09, W * 2 + .3, sg * (W - .1), H - .04, 0, wd, { l: L_WOOD });
      if (lvl >= 1) for (const [a, b] of corners) S.seg([a * (W - .1), H - .55, b * (W - .1)], [a * (W + .06), H - .02, b * (W + .06)], .04, .04, wd, { l: L_WOOD, n: 4 });
    });
    piece('rail', 4, S => {
      const y0 = H + .1;
      for (let k = 0; k < 4; k++) {
        const ang = k * HPI, cs = Math.cos(ang), sn = Math.sin(ang);
        for (let j = 0; j < 5; j++) {
          if (k === 2 && (j === 1 || j === 2)) continue;
          const u = (j - 2) * W * .42, hh = (j & 1) ? .34 : .5, x = u * cs + (W + .02) * sn, z = -u * sn + (W + .02) * cs;
          S.box(W * .4, hh, .06, x, y0 + hh / 2, z, (j & 1) ? w : wl, { l: L_WOOD, r: [0, ang, 0] });
        }
      }
      for (const [a, b] of corners) S.box(.1, .66, .1, a * (W + .02), y0 + .33, b * (W + .02), wd, { l: L_WOOD });
      if (lvl >= 1) for (const u of lvl === 2 ? [-.5, 0, .5] : [-.35, .35]) { S.cyl(.2, .04, u, y0 + .22, W + .08, lvl === 2 ? COL.ironL : COL.clothB, { n: 8, r: [HPI, 0, 0], l: lvl === 2 ? L_METAL : L_WOOD }); S.sph(.05, u, y0 + .22, W + .11, COL.ironL, { l: L_METAL, w: 5, h: 3, smooth: false }); }
      if (lvl === 2) for (const sg of [-1, 1]) S.cyl(.2, .04, sg * (W + .08), y0 + .22, .1, COL.clothR, { n: 8, r: [0, 0, HPI], l: L_WOOD });
    });
    piece('ladder', 5, S => {
      for (const sg of [-1, 1]) S.seg([sg * .17, 0, -W - .5], [sg * .17, H + .15, -W - .06], .035, .035, wd, { l: L_WOOD, n: 4 });
      for (let y = .3; y < H; y += .34) { const u = y / (H + .15); S.box(.36, .04, .05, 0, y, lerp(-W - .5, -W - .06, u), wl, { l: L_WOOD }); }
    });
    const bx = -W + .34, bz = -W + .36, by = H + .1 + (lvl === 2 ? .35 : 0);
    piece('brazier', 6, S => { if (lvl === 2) S.cyl(.2, .38, bx, H + .29, bz, sdk, { n: 6, l: L_MASON }); brazier(S, bx, by, bz, bs); });
    if (lvl >= 1) piece('flag', 7, S => { S.seg([W - .08, H + .1, -W + .08], [W - .08, H + 1.75, -W + .08], .035, .025, wd, { l: L_WOOD, n: 4 }); const T = new Soup(); clothPanel(T, { x0: 0, x1: .62, yTop: 0, len: .36, z: 0, col: COL.clothR, rng, nx: 3, ny: 2, rag: 0, sway: 1.2 }); S.merge(T, { p: [W - .06, H + 1.7, -W + .08], ao: null }); });
    mounts.flame = [bx, by + bs * .7, bz]; mounts.flameSize = bs; mounts.top = H + 1.7;
    mounts.archers = [[[.12, H + .1, .28]], [[-.3, H + .1, .42], [.42, H + .1, .1]], [[-.35, H + .1, .5], [.5, H + .1, .3], [.25, H + .1, -.4]]][lvl];
  } else if (kind === 'bombard') {
    const Rr = [1.0, 1.08, 1.15][lvl], H = [1.1, 1.5, 1.9][lvl];
    piece('plinth', 0, S => { S.cyl(Rr + .22, .26, 0, .13, 0, sdk, { n: 10, l: L_MASON }); if (lvl === 2) S.cyl(Rr + .12, .2, 0, .36, 0, st, { n: 10, l: L_MASON }); });
    piece('drum', 1, S => {
      S.cyl(Rr, H, 0, H / 2, 0, st, { n: 10, l: L_MASON, rt: .93, jit: .03 });
      for (let c = 0; c < 2 + lvl; c++) S.cyl(Rr * (1 - .05 * (.5 + c) / (2 + lvl)) + .012, .16, 0, .35 + c * (H - .5) / (1.5 + lvl), 0, mixC(sdk, sl, rng()), { n: 10, l: L_MASON });
      S.box(.34, .55, .1, 0, .3, Rr * .97, COL.black, { jit: 0 });
    });
    if (lvl >= 1) piece('butt', 2, S => { for (let k = 0; k < 4; k++) { const a = k * HPI + PI / 4; S.box(.36, H * .8, .5, Math.cos(a) * (Rr + .06), H * .36, Math.sin(a) * (Rr + .06), sdk, { l: L_MASON, r: [0, -a + HPI, 0] }); S.box(.4, .12, .56, Math.cos(a) * (Rr + .06), H * .78, Math.sin(a) * (Rr + .06), sl, { l: L_MASON, r: [0, -a + HPI, 0] }); } });
    if (lvl >= 1) piece('bands', 3, S => { for (const y of lvl === 2 ? [H * .45, H * .8] : [H * .65]) S.cyl(Rr * .965 + .02, .07, 0, y, 0, iron, { n: 10, l: L_METAL, rough: .55 }); });
    piece('deck', 4, S => { S.cyl(Rr * .93 + .14, .16, 0, H + .02, 0, sl, { n: 10, l: L_MASON }); S.cyl(Rr * .8, .06, 0, H + .12, 0, w, { n: 10, l: L_WOOD }); });
    piece('rim', 5, S => { for (let k = 0; k < 10; k++) { if (k % 5 === 0) continue; const a = (k + .5) / 10 * TAU + HPI; S.box(.46, .34, .22, Math.cos(a) * Rr * .96, H + .27, Math.sin(a) * Rr * .96, lvl === 2 && (k & 1) ? iron : mixC(sdk, sl, rng()), { l: lvl === 2 && (k & 1) ? L_METAL : L_MASON, r: [0, -a + HPI, 0] }); } });
    piece('ammo', 6, S => { for (const [x, z] of [[-.42, -.5], [-.24, -.52], [-.33, -.36]]) S.sph(.09, x, H + .22, z, mulC(iron, .8), { l: L_METAL, w: 6, h: 4, smooth: false }); S.sph(.09, -.33, H + .36, -.46, mulC(iron, .8), { l: L_METAL, w: 6, h: 4, smooth: false }); PROP.barrel(S, .45, H + .13, -.5, .75, rng); });
    const lx = -Rr * .78, lz = .2, lh = H + 1.25 + lvl * .12;
    piece('lantern', 7, S => {
      for (const sg of lvl === 2 ? [-1, 1] : [1]) {
        const x = lx * sg;
        S.seg([x, H + .1, lz], [x, lh, lz], .04, .035, iron, { l: L_METAL, n: 4 }); S.seg([x, lh, lz], [x - sg * -.0, lh, lz + .32], .03, .03, iron, { l: L_METAL, n: 4 });
        S.box(.2, .05, .2, x, lh - .08, lz + .32, iron, { l: L_METAL }); S.box(.16, .2, .16, x, lh - .22, lz + .32, COL.ember, { emis: .8, jit: 0 }); S.box(.2, .04, .2, x, lh - .34, lz + .32, iron, { l: L_METAL });
        for (const [a, b] of corners) S.box(.025, .22, .025, x + a * .09, lh - .22, lz + .32 + b * .09, iron, { l: L_METAL });
      }
    });
    mounts.flame = [lx, lh - .3, lz + .32]; mounts.flameSize = .26 + lvl * .05; mounts.flame2 = lvl === 2 ? [-lx, lh - .3, lz + .32] : null; mounts.top = H + 1.6;
    mounts.gun = [0, H + .15, .05]; mounts.gunLen = [.95, 1.12, 1.25][lvl]; mounts.gunR = [.15, .18, .215][lvl];
  } else if (kind === 'spire') {
    const H = [2.7, 3.4, 4.1][lvl], bas = COL.basalt, basL = COL.basaltL, cu = C(0x8a5a3a);
    piece('plinth', 0, S => { S.box(1.55, .22, 1.55, 0, .11, 0, basL, { l: L_ROCK }); S.box(1.18, .2, 1.18, 0, .32, 0, bas, { l: L_ROCK }); if (lvl >= 1) for (const [a, b] of corners) S.cone(.16, .5, a * .62, .5, b * .62, basL, { n: 4, l: L_ROCK }); });
    piece('shaft', 1, S => {
      S.cyl(.62, H - .42, 0, .42 + (H - .42) / 2, 0, bas, { n: 4, l: L_ROCK, rt: .52, r: [0, PI / 4, 0], jit: .03 });
      for (let k = 0; k < 4; k++) { const a = k * HPI, n = 3 + lvl; for (let j = 0; j < n; j++) { const u = (j + .7) / (n + .6), y = .42 + u * (H - .42), rr2 = lerp(.62, .32, u) * .7072 + .012; S.box(.07, .2, .02, Math.sin(a) * rr2, y, Math.cos(a) * rr2, COL.crystal, { emis: .5, jit: 0, r: [-.12, a, 0], ro: 'YXZ' }); } }
    });
    if (lvl >= 1) piece('bands', 2, S => { for (const u of lvl === 2 ? [.3, .58, .82] : [.4, .75]) S.cyl(lerp(.62, .32, u) + .03, .09, 0, .42 + u * (H - .42), 0, cu, { n: 4, l: L_METAL, r: [0, PI / 4, 0], rough: .45 }); });
    piece('claws', 3, S => { for (let k = 0; k < 4; k++) { const a = k * HPI + PI / 4, cs = Math.cos(a), sn = Math.sin(a); S.seg([cs * .22, H - .12, sn * .22], [cs * .46, H + .26, sn * .46], .06, .045, basL, { l: L_ROCK, n: 4 }); S.seg([cs * .46, H + .26, sn * .46], [cs * .26, H + .74, sn * .26], .045, .012, lvl ? cu : basL, { l: lvl ? L_METAL : L_ROCK, n: 4 }); } S.cyl(.34, .12, 0, H - .02, 0, basL, { n: 4, l: L_ROCK, r: [0, PI / 4, 0] }); });
    mounts.crystal = [0, H + .42, 0]; mounts.crystalS = [.2, .24, .29][lvl]; mounts.shards = [0, 2, 4][lvl]; mounts.rings = lvl === 2; mounts.top = H + 1.2; mounts.flame = null; mounts.lightAt = [0, H + .45, 0];
  } else {
    const W = [1.5, 1.7, 1.9][lvl], D = [1.3, 1.4, 1.5][lvl], wh = [1.05, 1.25, 1.5][lvl], stoneWalls = lvl === 2;
    piece('floor', 0, S => { S.box(W + .5, .16, D + .7, 0, .08, .1, sdk, { l: L_MASON }); S.box(.7, .1, .4, 0, .05, D / 2 + .55, st, { l: L_MASON }); });
    piece('walls', 1, S => {
      const wc = stoneWalls ? st : C(0x8f8468), wlay = stoneWalls ? L_MASON : L_PLAIN;
      if (lvl === 1) S.box(W + .04, .5, D + .04, 0, .41, 0, st, { l: L_MASON });
      S.box(W, wh, D, 0, .16 + wh / 2, 0, wc, { l: wlay, jit: .03 });
      if (!stoneWalls) { for (const [a, b] of corners) S.box(.12, wh + .04, .12, a * W / 2, .16 + wh / 2, b * D / 2, wd, { l: L_WOOD }); for (const sg of [-1, 1]) { S.box(W, .1, .08, 0, .16 + wh * .55, sg * D / 2, wd, { l: L_WOOD }); S.seg([sg * W * .5, .2, D / 2 + .01], [sg * W * .22, .16 + wh, D / 2 + .01], .04, .04, wd, { l: L_WOOD, n: 4 }); } S.box(.08, .1, D, W / 2, .16 + wh * .55, 0, wd, { l: L_WOOD }); S.box(.08, .1, D, -W / 2, .16 + wh * .55, 0, wd, { l: L_WOOD }); }
      S.box(.5, .82, .12, 0, .57, D / 2, COL.black, { jit: 0 }); S.box(.66, .1, .16, 0, 1.02, D / 2 + .02, wd, { l: L_WOOD }); for (const sg of [-1, 1]) S.box(.09, .86, .16, sg * .29, .59, D / 2 + .02, wd, { l: L_WOOD });
      S.box(.24, .24, .08, W * .32, .16 + wh * .62, D / 2 + .01, COL.black, { jit: 0 }); S.box(.08, .3, .3, W / 2 + .01, .16 + wh * .6, 0, COL.black, { jit: 0 });
    });
    piece('roof', 2, S => {
      const rl = lvl === 0 ? L_THATCH : L_SLATE, rc = lvl === 0 ? COL.thatch : COL.slate, y0 = .16 + wh, rh = [.75, .85, .9][lvl], sl2 = Math.atan2(rh, D / 2 + .2), len = Math.hypot(rh, D / 2 + .2) + .12;
      for (const sg of [-1, 1]) S.box(W + .36, .09, len, 0, y0 + rh / 2 - .02, sg * (D / 4 + .1), rc, { l: rl, r: [sg * sl2, 0, 0] });
      for (const sg of [-1, 1]) { const T = [[sg * W / 2, y0, -D / 2], [sg * W / 2, y0, D / 2], [sg * W / 2, y0 + rh, 0]]; const gc = stoneWalls ? st : C(0x8f8468); if (sg > 0) S.tri(T[0], T[2], T[1], gc, stoneWalls ? L_MASON : L_PLAIN, .95); else S.tri(T[0], T[1], T[2], gc, stoneWalls ? L_MASON : L_PLAIN, .95); }
      S.box(W + .44, .1, .14, 0, y0 + rh + .02, 0, wd, { l: L_WOOD });
      S.box(.26, .5, .26, -W * .3, y0 + rh * .7 + .1, -D * .2, sdk, { l: L_MASON });
    });
    piece('rack', 3, S => { const x = -W / 2 - .28; S.box(.06, .7, .06, x, .5, -.3, wd, { l: L_WOOD }); S.box(.06, .7, .06, x, .5, .3, wd, { l: L_WOOD }); S.box(.05, .05, .7, x, .78, 0, w, { l: L_WOOD }); for (const z of [-.2, 0, .2]) { S.seg([x + .06, .12, z], [x - .04, 1.5, z], .018, .018, wl, { l: L_WOOD, n: 4 }); S.cone(.035, .14, x - .045, 1.56, z, COL.steel, { n: 4, l: L_METAL }); } if (lvl >= 1) { S.cyl(.2, .04, W / 2 + .03, .75, -.25, COL.clothB, { n: 8, r: [0, 0, HPI], l: L_WOOD }); } });
    if (lvl === 2) piece('turret', 4, S => { const x = W / 2 - .2, z = -D / 2 + .2, th = 2.7; S.box(.8, th, .8, x, th / 2 + .16, z, st, { l: L_MASON }); S.box(.94, .16, .94, x, th + .2, z, sl, { l: L_MASON }); for (const [a, b] of corners) S.box(.24, .26, .24, x + a * .35, th + .4, z + b * .35, mixC(sdk, sl, rng()), { l: L_MASON }); S.box(.1, .4, .06, x, th * .7, z + .41, COL.black, { jit: 0 }); });
    const fx = W / 2 + .12, fz = D / 2 + .5, bs = [.34, .46, .6][lvl];
    piece('fire', 5, S => { if (lvl === 0) { S.seg([fx, 0, fz], [fx, 1.05, fz], .04, .035, wd, { l: L_WOOD, n: 4 }); S.cyl(.07, .12, fx, 1.1, fz, iron, { n: 6, l: L_METAL, rt: 1.4 }); } else brazier(S, fx, .08, fz, bs + .1); });
    piece('flag', 6, S => { const x = lvl === 2 ? W / 2 - .2 : -W / 2 + .1, z = lvl === 2 ? -D / 2 + .2 : -D / 2 + .1, y0 = lvl === 2 ? 3.1 : .2, y1 = lvl === 2 ? 4.5 : 2.9; S.seg([x, y0, z], [x, y1, z], .04, .028, wd, { l: L_WOOD, n: 4 }); const T = new Soup(); clothPanel(T, { x0: 0, x1: .7, yTop: 0, len: .46, z: 0, col: COL.clothB, col2: mulC(COL.gold, .6), rng, nx: 4, ny: 3, rag: .2, sway: 1.1 }); S.merge(T, { p: [x + .03, y1 - .06, z], ao: null }); });
    mounts.flame = lvl === 0 ? [fx, 1.2, fz] : [fx, .08 + (bs + .1) * .72, fz]; mounts.flameSize = bs; mounts.door = [0, 0, D / 2 + .45]; mounts.top = lvl === 2 ? 3.4 : 2.2;
  }
  pieces.sort((a, b) => a.order - b.order);
  return { pieces, mounts };
}

function scaffoldGeo(w, h) {
  const S = new Soup(), c = mulC(COL.woodL, .9), c2 = COL.wood;
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) S.seg([a * w, 0, b * w], [a * w, h, b * w], .04, .035, c, { l: L_WOOD, n: 4 });
  for (let y = .9; y < h; y += 1.05) for (let k = 0; k < 4; k++) { const q = [[-1, -1], [1, -1], [1, 1], [-1, 1]], [a, b] = q[k], [cc, d] = q[(k + 1) % 4]; S.seg([a * w, y, b * w], [cc * w, y, d * w], .03, .03, c2, { l: L_WOOD, n: 4 }); if (k & 1) S.seg([a * w, y - .9, b * w], [cc * w, y, d * w], .022, .022, c, { l: L_WOOD, n: 3 }); }
  S.box(w * 1.2, .05, .34, 0, Math.min(h - .2, 1.95), w + .12, c2, { l: L_WOOD }); S.box(.34, .05, w * 1.2, -w - .12, Math.min(h - .25, .95), 0, c, { l: L_WOOD });
  return S.build();
}

let TOWER_STUN = false;
function findTarget(x, z, range, air, ground, minRange = 0) {
  if (G.phase !== 'play' || TOWER_STUN) return null;
  let best = null, bp = -1; const r2 = range * range, m2 = minRange * minRange;
  for (const m of G.mons) {
    if (m.dead || m.hp <= 0 || !m.vis) continue; if (m.fly ? !air : !ground) continue;
    const d = dist2(x, z, m.x, m.z); if (d > r2 || d < m2) continue;
    const sc = m.prog + (m.fly ? 2 : 0) + (m.def.boss ? -.0 : 0); if (sc > bp) { bp = sc; best = m; }
  }
  return best;
}
function aimPoint(m, dt, out) {
  if (m.fly) { out.x = m.x + m.vx * dt; out.y = m.y; out.z = m.z + m.vz * dt; return out; }
  const B = G.B, adv = m.blocked ? 0 : m.spdNow * dt, s2 = Math.min(B.L - .1, m.s + adv);
  pathAt(B, s2, out); out.x += -out.tz * m.lat; out.z += out.tx * m.lat; out.y += m.hitH; return out;
}

const _tv = new THREE.Vector3(), _tq = new THREE.Quaternion(), _tm = new THREE.Matrix4(), _tz = new THREE.Vector3(0, 0, 1), _ts = new THREE.Vector3(1, 1, 1), _ap = { x: 0, y: 0, z: 0, tx: 0, tz: 0 };

class Tower {
  constructor(pad, kind, idx) {
    this.pad = pad; this.kind = kind; this.idx = idx; this.lvl = 0; this.def = TOWER[kind];
    this.x = pad.x; this.y = pad.y; this.z = pad.z; this.yaw = pad.face; this.cs = Math.cos(this.yaw); this.sn = Math.sin(this.yaw);
    this.spent = this.def.cost[0]; this.state = 'build'; this.bt = 0; this.cool = rr(.2, .8); this.kills = 0; this.dealt = 0; this.alive = true; this.recent = 0;
    this.group = new THREE.Group(); this.group.position.set(this.x, this.y, this.z); this.group.rotation.y = this.yaw; R.scene.add(this.group);
    this.pieces = []; this.staticMesh = null; this.scaf = null; this.flame = null; this.flame2 = null; this.archers = []; this.men = []; this.respawn = 0;
    this.em = { x: this.x, y: this.y + 3, z: this.z, r: 1, g: .56, b: .26, I: 0, range: 13, on: 0, alive: true, seed: rnd() * 50, spot: kind !== 'spire', dx: this.sn, dz: this.cs, fl: 1, _spot: 0 };
    LT.emitters[idx] = this.em; pad.tower = this;
    this.gunYaw = 0; this.recoil = 0; this.charge = 0; this.spin = rnd() * 6; this.hover = 0; this.appear = 0;
    this.begin();
  }
  get range() { return this.def.range[this.lvl]; }
  w(l, out) { out.x = this.x + l[0] * this.cs + l[2] * this.sn; out.y = this.y + l[1]; out.z = this.z - l[0] * this.sn + l[2] * this.cs; return out; }
  begin() {
    const bp = blueprint(this.kind, this.lvl); this.bp = bp; this.mounts = bp.mounts; this.bt = 0; this.state = this.lvl ? 'upgrade' : 'build';
    this.clearModel(true);
    const n = bp.pieces.length, gap = Math.min(.2, 1.45 / n);
    bp.pieces.forEach((p, i) => {
      const mesh = new THREE.Mesh(p.soup.build(), MAT.world); mesh.castShadow = mesh.receiveShadow = true; mesh.visible = false; mesh.position.y = p.y + 2.4;
      this.group.add(mesh); this.pieces.push({ mesh, y: p.y, t0: .32 + i * gap, landed: false, soup: p.soup });
    });
    this.tEnd = .32 + n * gap + .3;
    this.scaf = new THREE.Mesh(scaffoldGeo(1.25, Math.min(4.4, bp.mounts.top + .3)), MAT.world); this.scaf.castShadow = true; this.scaf.scale.set(1, .01, 1); this.group.add(this.scaf);
    fxDust(this.x, this.y + .1, this.z, 7, 1.0, { speed: 1.6 });
    sfx('hammer', this.x, this.z, .8, .3);
  }
  clearModel(keepLights) {
    for (const p of this.pieces) { this.group.remove(p.mesh); p.mesh.geometry.dispose(); } this.pieces.length = 0;
    for (const k of ['staticMesh', 'scaf', 'carriage', 'crystal']) if (this[k]) { this.group.remove(this[k]); this[k].traverse(o => { if (o.geometry) o.geometry.dispose(); }); this[k] = null; }
    this.barrel = null; this.shards = null; this.ringG = null;
    removeFlame(this.flame); removeFlame(this.flame2); this.flame = this.flame2 = null; this.em.on = keepLights ? this.em.on * .4 : 0;
    this.archers.length = 0;
  }
  finish() {
    const M = new Soup(); for (const p of this.pieces) M.merge(p.soup, { p: [0, p.y, 0], ao: [0, 1.0, .72] });
    for (const p of this.pieces) { this.group.remove(p.mesh); p.mesh.geometry.dispose(); } this.pieces.length = 0;
    this.staticMesh = new THREE.Mesh(M.build(), MAT.world); this.staticMesh.castShadow = this.staticMesh.receiveShadow = true; this.group.add(this.staticMesh);
    if (this.scaf) { this.group.remove(this.scaf); this.scaf.geometry.dispose(); this.scaf = null; }
    const mt = this.mounts, lvl = this.lvl, d = this.def;
    if (mt.flame) { const p = this.w(mt.flame, {}); this.flame = addFlame({ x: p.x, y: p.y, z: p.z, size: mt.flameSize, on: 0, layers: mt.flameSize > .7 ? 2 : 1, glow: 1 }); this.em.x = p.x; this.em.y = p.y + .25; this.em.z = p.z; this.em.r = 1; this.em.g = .56; this.em.b = .26; }
    if (mt.flame2) { const p = this.w(mt.flame2, {}); this.flame2 = addFlame({ x: p.x, y: p.y, z: p.z, size: mt.flameSize, on: 0 }); }
    if (mt.lightAt) { const p = this.w(mt.lightAt, {}); this.em.x = p.x; this.em.y = p.y; this.em.z = p.z; this.em.r = .45; this.em.g = .72; this.em.b = 1; }
    this.em.I = d.light[lvl]; this.em.range = this.kind === 'archer' ? 12 : 10.5;
    if (this.kind === 'archer') mt.archers.forEach((a, i) => this.archers.push({ l: a, yaw: this.yaw, draw: 0, cool: .4 + i * .3, e: { scale: .82, ph: 0, mv: 0, atk: -1, bow: true, draw: 0, pitch: 0, tint: [1, .9, .7], x: 0, y: 0, z: 0, yaw: 0, flash: 0 } }));
    if (this.kind === 'bombard') this.makeGun();
    if (this.kind === 'spire') this.makeCrystal();
    if (this.kind === 'guard') { this.respawn = .2; }
    this.state = 'active'; this.appear = 0;
    fxDust(this.x, this.y + .2, this.z, 10, 1.3, { speed: 2.2 });
    sfx('buildDone', this.x, this.z, 1);
    if (this.flame) fxEmbers(this.flame.x, this.flame.y, this.flame.z, 10, .2);
  }
  makeGun() {
    const mt = this.mounts, L = mt.gunLen, r = mt.gunR, S = new Soup(), br = this.lvl === 2 ? COL.iron : COL.bronze;
    S.cyl(.42, .12, 0, .06, 0, COL.woodD, { n: 8, l: L_WOOD }); for (const sg of [-1, 1]) { S.box(.09, .34, .62, sg * (r + .07), .26, 0, COL.wood, { l: L_WOOD }); S.cyl(.17, .07, sg * (r + .16), .17, -.12, COL.woodD, { n: 8, r: [0, 0, HPI], l: L_WOOD }); }
    this.carriage = new THREE.Mesh(S.build(), MAT.world); this.carriage.castShadow = this.carriage.receiveShadow = true; this.carriage.position.set(mt.gun[0], mt.gun[1], mt.gun[2]); this.group.add(this.carriage);
    const Bq = new Soup(), o = () => ({ n: 8, l: L_METAL, r: [HPI, 0, 0], rough: .42 });
    Bq.cyl(r, L, 0, 0, L / 2 - .28, br, Object.assign(o(), { rt: .8 })); Bq.cyl(r * 1.16, .12, 0, 0, L - .3, br, o()); Bq.cyl(r * .62, .03, 0, 0, L - .235, COL.black, Object.assign(o(), { jit: 0 }));
    for (const z of [-.2, L * .25, L * .55]) Bq.cyl(r * 1.1 - z * .03, .07, 0, 0, z, mulC(br, .8), o());
    Bq.sph(r * .9, 0, 0, -.3, br, { l: L_METAL, w: 6, h: 4, smooth: false, rough: .42 }); Bq.sph(r * .32, 0, 0, -.3 - r * .9, mulC(br, .8), { l: L_METAL, w: 5, h: 3, smooth: false });
    this.barrel = new THREE.Mesh(Bq.build(), MAT.world); this.barrel.castShadow = this.barrel.receiveShadow = true; this.barrel.position.set(0, .4, 0); this.barrel.rotation.x = -.42; this.carriage.add(this.barrel);
    this.gunYaw = this.yaw;
  }
  makeCrystal() {
    const mt = this.mounts, mk = (sx, sy) => { const S = new Soup(); S.add(gOct(), { s: [sx, sy, sx], c: [1, 1, 1], jit: 0, cf: v => .55 + .45 * smooth(-sy, sy, v.y) + (v.x > 0 ? .12 : 0) }); return S.build(); };
    this.cmat = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(.3, .6, 1) });
    this.crystal = new THREE.Group(); this.crystal.position.set(mt.crystal[0], mt.crystal[1], mt.crystal[2]);
    const c = new THREE.Mesh(mk(mt.crystalS, mt.crystalS * 1.9), this.cmat); c.castShadow = true; this.crystal.add(c); this.core = c;
    this.shards = [];
    for (let i = 0; i < mt.shards; i++) { const s = new THREE.Mesh(mk(.07, .16), this.cmat); this.crystal.add(s); this.shards.push(s); }
    if (mt.rings) { const S = new Soup(); for (let k = 0; k < 7; k++) { if (k === 3) continue; const a = k / 7 * TAU; S.box(.5, .16, .2, Math.cos(a) * 1.0, 0, Math.sin(a) * 1.0, COL.basaltL, { l: L_ROCK, r: [0, -a + HPI, 0] }); } this.ringG = new THREE.Mesh(S.build(), MAT.world); this.ringG.castShadow = true; this.ringG.position.y = -1.25; this.crystal.add(this.ringG); }
    this.group.add(this.crystal);
  }
  upgrade() { if (this.lvl >= 2 || this.state !== 'active') return false; this.lvl++; this.spent += this.def.cost[this.lvl]; for (const m of this.men) m.lvlUp = true; this.begin(); return true; }
  sell() {
    this.alive = false; this.em.alive = false; this.em.on = 0; LT.emitters[this.idx] = null; this.pad.tower = null;
    for (let i = 0; i < 14; i++) { _tm.compose(_tv.set(this.x + rr(-.7, .7), this.y + rr(.3, 2.4), this.z + rr(-.7, .7)), _tq.set(rr(-1, 1), rr(-1, 1), rr(-1, 1), 1).normalize(), _ts.set(1, 1, 1)); addDebris(this.kind === 'archer' || this.kind === 'guard' ? KIT.plank : KIT.rubble, _tm, null, rr(-2, 2), rr(1, 4), rr(-2, 2), rr(3, 9), rr(2, 3.5)); }
    fxDust(this.x, this.y + .4, this.z, 16, 1.6, { speed: 2.6 }); sfx('sell', this.x, this.z, 1);
    for (const m of this.men) m.leave = true;
    this.clearModel(false); R.scene.remove(this.group);
  }
  update(dt) {
    const d = this.def, lvl = this.lvl; this.recent = Math.max(0, this.recent - dt * .25);
    if (this.state !== 'active') {
      this.bt += dt; const bt = this.bt;
      if (this.scaf) this.scaf.scale.y = bt < this.tEnd - .25 ? easeOutBack(bt / .3) : Math.max(.01, 1 - (bt - (this.tEnd - .25)) / .25);
      for (const p of this.pieces) {
        const u = (bt - p.t0) / .24;
        if (u < 0) continue; p.mesh.visible = true;
        if (u < 1) p.mesh.position.y = p.y + (1 - u * u) * 2.2;
        else { p.mesh.position.y = p.y; const sq = clamp((u - 1) / .5, 0, 1); p.mesh.scale.y = 1 - .1 * Math.sin(sq * PI) * (1 - sq);
          if (!p.landed) { p.landed = true; fxDust(this.x + rr(-.5, .5), this.y + p.y + .1, this.z + rr(-.5, .5), 3, .55, { speed: 1.2, a: .4 }); sfx('hammer', this.x, this.z, .7, rnd()); } }
      }
      this.em.on = damp(this.em.on, 0, 4, dt);
      if (bt >= this.tEnd) this.finish();
      return;
    }
    this.appear = Math.min(1, this.appear + dt * 2.2);
    TOWER_STUN = this.stun > 0;
    if (TOWER_STUN) { this.stun -= dt; const k = Math.min(1, this.stun * 2); FX.add.push(this.x, this.y + 1.7, this.z, 4.2, 5.6, 0, 0, .2, .5, 1.2, .3 * k, 2, 0, 0, 0); if (rnd() < dt * 5) { const a = rnd() * TAU, h = rr(.6, 3); fxBolt([this.x + Math.cos(a) * .8, this.y + h, this.z + Math.sin(a) * .8], [this.x + Math.cos(a + 1.2) * .8, this.y + h + rr(-.5, .5), this.z + Math.sin(a + 1.2) * .8], .12, [.5, .85, 1.5], .03); } if (rnd() < dt * 18) fxPart(this.x + rr(-.7, .7), this.y + rr(.4, 3.2), this.z + rr(-.7, .7), 0, rr(-.5, .1), 0, rr(.4, .9), rr(.05, .08), .6, 1.1, 2.0, { drag: .5 }); }
    this.em.on = damp(this.em.on, TOWER_STUN ? .12 : 1, TOWER_STUN ? 8 : 3, dt);
    if (this.flame) this.flame.on = this.em.on; if (this.flame2) this.flame2.on = this.em.on;
    this.cool -= dt;
    if (this.kind === 'archer') this.updArcher(dt, d, lvl);
    else if (this.kind === 'bombard') this.updBombard(dt, d, lvl);
    else if (this.kind === 'spire') this.updSpire(dt, d, lvl);
    else this.updGuard(dt, d, lvl);
    TOWER_STUN = false;
  }
  updArcher(dt, d, lvl) {
    const tgt = findTarget(this.x, this.z, d.range[lvl], true, true);
    for (const a of this.archers) {
      const p = this.w(a.l, _ap), e = a.e; e.x = p.x; e.y = p.y - (1 - easeOut(this.appear)) * .5; e.z = p.z; e.scale = .82 * (.3 + .7 * this.appear);
      a.cool -= dt;
      if (tgt) {
        const T = clamp(Math.hypot(tgt.x - p.x, tgt.z - p.z) / 14, .22, .62), q = aimPoint(tgt, T, _ap2);
        a.yaw = angDamp(a.yaw, Math.atan2(q.x - p.x, q.z - p.z), 12, dt);
        e.pitch = clamp(Math.atan2(q.y - (p.y + 1), Math.hypot(q.x - p.x, q.z - p.z)) * .7 + .2, -.5, .6);
        a.draw = a.cool < .34 ? Math.min(1, a.draw + dt * 3.6) : Math.max(0, a.draw - dt * 6);
        if (a.cool <= 0 && a.draw > .95) {
          a.cool = d.rate[lvl] * rr(.9, 1.12); a.draw = 0;
          shootArrow(p.x + Math.sin(a.yaw) * .3, p.y + 1.0, p.z + Math.cos(a.yaw) * .3, tgt, d.dmg[lvl], this);
          sfx('bow', p.x, p.z, .6, rnd());
        }
      } else { a.draw = Math.max(0, a.draw - dt * 3); a.yaw = angDamp(a.yaw, this.yaw + Math.sin(G.t * .5 + a.l[0] * 3) * .5, 2, dt); e.pitch = damp(e.pitch, 0, 4, dt); if (a.cool < .3) a.cool = .3; }
      e.yaw = a.yaw; e.draw = a.draw;
      rigHuman(KIT.foot, SPEC.foot, e);
    }
  }
  updBombard(dt, d, lvl) {
    const tgt = findTarget(this.x, this.z, d.range[lvl], false, true, d.minRange);
    this.recoil = Math.max(0, this.recoil - dt * 1.6);
    let aligned = false;
    if (tgt) {
      const dist = Math.hypot(tgt.x - this.x, tgt.z - this.z), T = clamp(dist / 7.2, .75, 1.45), q = aimPoint(tgt, T, _ap2);
      const want = Math.atan2(q.x - this.x, q.z - this.z); this.gunYaw = angDamp(this.gunYaw, want, 5, dt); aligned = Math.abs(angDiff(this.gunYaw, want)) < .12;
      if (aligned && this.cool <= 0) {
        this.cool = d.rate[lvl] * rr(.95, 1.08); this.recoil = 1;
        this.carriage.updateMatrixWorld(true); const mz = _tv.set(0, 0, this.mounts.gunLen - .2).applyMatrix4(this.barrel.matrixWorld);
        const gy = G.B.heightAt(q.x, q.z);
        G.shells.push({ x0: mz.x, y0: mz.y, z0: mz.z, tx: q.x, ty: Math.max(gy, q.y - tgt.hitH) + .05, tz: q.z, t: 0, T, dmg: d.dmg[lvl], splash: d.splash[lvl], tower: this, x: mz.x, y: mz.y, z: mz.z, sm: 0, arc: 1.5 + dist * .2 });
        const dx = Math.sin(this.gunYaw), dz = Math.cos(this.gunYaw);
        lightFlash(mz.x, mz.y + .2, mz.z, 0xffc880, 420, .16, 15);
        fxTimed(5, mz.x + dx * .2, mz.y + .1, mz.z + dz * .2, 1.9, 1.9, 4, 3, 1.6, 1, .1); fxTimed(3, mz.x + dx * .3, mz.y + .12, mz.z + dz * .3, .9, .9, 4, 3.2, 2.2, 1, .2, { grow: .8 });
        for (let i = 0; i < 6; i++) fxSmoke(mz.x + dx * .3, mz.y + .1, mz.z + dz * .3, dx * rr(1, 3.4) + rr(-.5, .5), rr(.3, 1.2), dz * rr(1, 3.4) + rr(-.5, .5), rr(1.2, 2.4), rr(.35, .6), .9, .3, .29, .28, .5, { drag: 2.2, rise: .2 });
        fxSparks(mz.x + dx * .2, mz.y, mz.z + dz * .2, 8, 5, 3, 1.8, .6, { lo: 0, hi: .6 });
        sfx('cannon', this.x, this.z, 1, lvl / 2); FX.shake = Math.min(1, FX.shake + .12);
      }
    } else this.gunYaw = angDamp(this.gunYaw, this.yaw + Math.sin(G.t * .3 + this.idx) * .7, 1.2, dt);
    this.carriage.rotation.y = this.gunYaw - this.yaw;
    const k = this.recoil; this.barrel.position.z = -.3 * k * k; this.barrel.rotation.x = -.42 - .1 * k * k;
    if (this.cool > 0 && this.cool < 1.2 && rnd() < dt * 5) { this.carriage.updateMatrixWorld(true); const mz = _tv.set(0, 0, this.mounts.gunLen - .2).applyMatrix4(this.barrel.matrixWorld); fxSmoke(mz.x, mz.y, mz.z, rr(-.1, .1), rr(.3, .6), rr(-.1, .1), 1.2, .18, .35, .3, .3, .3, .22, { drag: 1 }); }
  }
  updSpire(dt, d, lvl) {
    const tgt = findTarget(this.x, this.z, d.range[lvl], true, true);
    const was = this.charge;
    this.charge = tgt ? Math.min(1, this.charge + dt / d.rate[lvl]) : Math.max(0, this.charge - dt * .25);
    if (was < .68 && this.charge >= .68 && tgt) sfx('charge', this.x, this.z, .5);
    const c = this.charge, pulse = .85 + .15 * Math.sin(G.t * (6 + c * 20));
    this.spin += dt * (.8 + c * 5); this.core.rotation.y = this.spin; this.core.position.y = Math.sin(G.t * 1.6 + this.idx) * .05;
    this.shards.forEach((s, i) => { const a = this.spin * .7 + i * TAU / this.shards.length; s.position.set(Math.cos(a) * .58, Math.sin(a * 1.3) * .14 - .05, Math.sin(a) * .58); s.rotation.y = -a * 2; });
    if (this.ringG) this.ringG.rotation.y = -this.spin * .25;
    const k = (.9 + 4.5 * c * c) * pulse * this.appear; this.cmat.color.setRGB(.28 * k, .62 * k, 1.15 * k);
    this.em.I = (d.light[lvl] + 70 * c * c) * pulse;
    const cp = this.w(this.mounts.crystal, _ap);
    FX.add.push(cp.x, cp.y, cp.z, 1.5 + c, 1.5 + c, 0, 0, .25, .55, 1.0, (.1 + .22 * c) * pulse, 2, 0, 0, 0);
    if (c > .5 && rnd() < dt * 14 * c) { const a = rnd() * TAU; fxBolt([cp.x, cp.y, cp.z], [cp.x + Math.cos(a) * .7, cp.y + rr(-.5, .5), cp.z + Math.sin(a) * .7], .1, [.45, .7, 1.4], .035); }
    if (c >= 1 && tgt) {
      this.charge = 0; let from = [cp.x, cp.y, cp.z], cur = tgt, dmg = d.dmg[lvl]; const hit = [];
      for (let j = 0; j < d.jumps[lvl] && cur; j++) {
        hit.push(cur); const to = [cur.x, cur.y + cur.hitH, cur.z];
        fxBolt(from, to, .26 - j * .015, [.5, .78, 1.6], .1 - j * .008);
        fxSparks(to[0], to[1], to[2], 5, 3.5, 1.2, 2, 4, { grav: 3, size: .06 }); fxTimed(2, to[0], to[1], to[2], 1.6, 1.6, .5, .9, 2, .7, .16);
        const cx = cur.x, cz = cur.z; slowMonster(cur, d.slow[lvl], d.slowT[lvl]); hitMonster(cur, dmg, 'bolt', 0, 0, this);
        dmg *= .86; from = to; let nb = null, nd = 3.0 * 3.0;
        for (const m of G.mons) { if (m.dead || m.hp <= 0 || !m.vis || hit.includes(m)) continue; const dd = dist2(cx, cz, m.x, m.z); if (dd < nd) { nd = dd; nb = m; } }
        cur = nb;
      }
      lightFlash(tgt.x, tgt.y + 1.2, tgt.z, 0x9fd0ff, 520, .22, 16); lightFlash(cp.x, cp.y, cp.z, 0x9fd0ff, 300, .18, 12);
      sfx('zap', this.x, this.z, 1, lvl / 2); FX.shake = Math.min(1, FX.shake + .08);
    }
  }
  updGuard(dt, d, lvl) {
    for (let i = this.men.length - 1; i >= 0; i--) if (this.men[i].gone) this.men.splice(i, 1);
    if (this.men.length < d.n[lvl]) { this.respawn -= dt; if (this.respawn <= 0) { this.respawn = this.men.length === 0 && G.t < 4 ? .5 : d.rate[lvl]; spawnFootman(this); } }
  }
  dispose() { this.alive = false; this.em.alive = false; LT.emitters[this.idx] = null; this.clearModel(false); R.scene.remove(this.group); this.pad.tower = null; }
}
const _ap2 = { x: 0, y: 0, z: 0, tx: 0, tz: 0 };

function shootArrow(x, y, z, m, dmg, tower) {
  const dist = Math.hypot(m.x - x, m.z - z), T = clamp(dist / 14, .22, .62), q = aimPoint(m, T, _ap2);
  G.arrows.push({ x0: x, y0: y, z0: z, tx: q.x, ty: q.y, tz: q.z, t: 0, T, m, dmg, tower, x, y, z, dx: 0, dy: 0, dz: 1, arc: .25 + dist * .07, alive: true, lI: 22, lCol: 0xff9040, lx: x, ly: y, lz: z, lseed: rnd() * 9, ember: 0 });
}
function arrowMatrix(x, y, z, dx, dy, dz) { _tq.setFromUnitVectors(_tz, _tv.set(dx, dy, dz).normalize()); return _tm.compose(_tv.set(x, y, z), _tq, _ts.set(1, 1, 1)); }
function updateProjectiles(dt) {
  const A = G.arrows, B = G.B;
  for (let i = A.length - 1; i >= 0; i--) {
    const a = A[i]; a.t += dt; const u = Math.min(1, a.t / a.T), m = a.m;
    if (m && !m.dead && m.hp > 0) { const q = aimPoint(m, Math.max(0, a.T - a.t), _ap2), k = Math.min(1, dt * 9); a.tx = lerp(a.tx, q.x, k); a.ty = lerp(a.ty, q.y, k); a.tz = lerp(a.tz, q.z, k); }
    const px = a.x, py = a.y, pz = a.z;
    a.x = lerp(a.x0, a.tx, u); a.z = lerp(a.z0, a.tz, u); a.y = lerp(a.y0, a.ty, u) + a.arc * 4 * u * (1 - u);
    const dx = a.x - px, dy = a.y - py, dz = a.z - pz, l = Math.hypot(dx, dy, dz) || 1; a.dx = dx / l; a.dy = dy / l; a.dz = dz / l;
    a.lx = a.x; a.ly = a.y; a.lz = a.z;
    KIT.arrow.put(arrowMatrix(a.x, a.y, a.z, a.dx, a.dy, a.dz), 0, null);
    const hx = a.x + a.dx * .25, hy = a.y + a.dy * .25, hz = a.z + a.dz * .25;
    FX.segs.push(hx, hy, hz, .055, hx - a.dx * .95, hy - a.dy * .95, hz - a.dz * .95, .0, 2.6, 1.05, .25, .85);
    FX.add.push(hx, hy, hz, .3, .3, 0, 0, 3.6, 1.9, .5, 1, 0, 0, 0, 0); FX.add.push(hx, hy, hz, 1.0, 1.0, 0, 0, 1, .45, .12, .22, 2, 0, 0, 0);
    a.ember += dt * 26; while (a.ember > 1) { a.ember -= 1; fxPart(hx, hy, hz, rr(-.4, .4), rr(-.1, .6), rr(-.4, .4), rr(.25, .6), .05, 2.6, 1.1, .2, { drag: 1.5, rise: .6 }); }
    if (u >= 1) {
      a.alive = false; swapRemove(A, i);
      if (m && !m.dead && m.hp > 0 && dist2(a.tx, a.tz, m.x, m.z) < 1.0) {
        fxSparks(a.x, a.y, a.z, 5, 3, 3, 1.5, .4, { size: .055, grav: 6 }); fxTimed(2, a.x, a.y, a.z, .9, .9, 1.6, .8, .25, .8, .12);
        sfx('arrowHit', a.x, a.z, .55, rnd()); hitMonster(m, a.dmg, 'arrow', a.dx, a.dz, a.tower);
      } else if (!m || !m.fly) {
        const gy = B.heightAt(a.x, a.z);
        G.stuck.push({ x: a.x, y: gy + .12, z: a.z, dx: a.dx, dy: Math.min(-.5, a.dy), dz: a.dz, life: 3.2 });
        fxSparks(a.x, gy + .1, a.z, 3, 2, 3, 1.5, .4, { size: .05 });
      }
    }
  }
  const St = G.stuck;
  for (let i = St.length - 1; i >= 0; i--) {
    const s = St[i]; s.life -= dt; if (s.life <= 0) { swapRemove(St, i); continue; }
    KIT.arrow.put(arrowMatrix(s.x, s.y - Math.max(0, .5 - s.life) * .5, s.z, s.dx, s.dy, s.dz), 0, null);
    if (s.life > 1.4) { FX.add.push(s.x - s.dx * .25, s.y - s.dy * .25 + .04, s.z - s.dz * .25, .2, .2, 0, 0, 3, 1.4, .3, Math.min(1, (s.life - 1.4)), 0, 0, 0, 0); if (rnd() < dt * 5) fxPart(s.x, s.y + .1, s.z, rr(-.1, .1), rr(.4, .9), rr(-.1, .1), .6, .045, 2.4, 1, .2, { drag: .5, wob: 1 }); }
  }
  const Sh = G.shells;
  for (let i = Sh.length - 1; i >= 0; i--) {
    const s = Sh[i]; s.t += dt; const u = Math.min(1, s.t / s.T);
    s.x = lerp(s.x0, s.tx, u); s.z = lerp(s.z0, s.tz, u); s.y = lerp(s.y0, s.ty, u) + s.arc * 4 * u * (1 - u);
    _tm.compose(_tv.set(s.x, s.y, s.z), _tq.setFromAxisAngle(_tz, s.t * 9), _ts.set(1, 1, 1)); KIT.shell.put(_tm, 0, null);
    FX.add.push(s.x, s.y + .1, s.z, .3, .3, 0, 0, 3.2, 1.5, .3, 1, 0, 0, 0, 0);
    s.sm += dt * 30; while (s.sm > 1) { s.sm -= 1; fxSmoke(s.x, s.y, s.z, rr(-.1, .1), rr(0, .2), rr(-.1, .1), rr(.5, .9), .16, .3, .26, .25, .25, .32, { drag: 1 }); if (rnd() < .5) fxPart(s.x, s.y, s.z, rr(-.5, .5), rr(-.2, .5), rr(-.5, .5), .4, .05, 2.5, 1.1, .2, { grav: 2 }); }
    if (u >= 1) { swapRemove(Sh, i); explodeAt(s.tx, s.ty, s.tz, s.dmg, s.splash, s.tower); }
  }
}
function explodeAt(x, y, z, dmg, splash, tower) {
  const sc = splash / 1.7;
  fxExplosion(x, y, z, sc);
  FX.decals.add(G.B.heightAt, x, z, splash * 1.2, .016, .013, .011, .85, 45);
  sfx('explode', x, z, 1, clamp(sc - .6, 0, 1));
  for (const m of G.mons) {
    if (m.dead || m.hp <= 0 || m.fly || !m.vis) continue;
    const d = Math.hypot(m.x - x, m.z - z); if (d > splash + m.rad) continue;
    const k = lerp(1, .45, sat(d / splash)), l = d || 1;
    hitMonster(m, dmg * k, 'blast', (m.x - x) / l, (m.z - z) / l, tower);
  }
  for (let i = 0; i < 5; i++) { _tm.compose(_tv.set(x + rr(-.3, .3), y + .2, z + rr(-.3, .3)), _tq.set(rr(-1, 1), rr(-1, 1), rr(-1, 1), 1).normalize(), _ts.set(.6, .6, .6)); addDebris(KIT.rubble, _tm, [.5, .45, .4], rr(-3, 3), rr(3, 6), rr(-3, 3), rr(4, 10), rr(1.6, 2.6)); }
}


const MON = {
  skel: { name: 'Skeleton', hp: 34, spd: 1.35, rad: .27, mass: 1, bounty: 6, lives: 1, hitH: .75, top: 1.45, dmg: 6, atkT: .95, eye: [3.4, .9, .2], scale: 1, death: 'bones', blade: true },
  rat: { name: 'Giant rat', tip: 'Fast and frail. Comes in packs.', hp: 13, spd: 2.65, rad: .2, mass: .45, bounty: 3, lives: 1, hitH: .2, top: .5, dmg: 3, atkT: .6, eye: [3.2, .4, .3], scale: 1, death: 'fur', cat: 'swarm' },
  slime: { name: 'Slime', tip: 'Splits in two when it dies.', hp: 95, spd: .82, rad: .42, mass: 2.2, bounty: 9, lives: 1, hitH: .3, top: .75, dmg: 8, atkT: 1.2, eye: [1.8, 2.8, .4], scale: 1, death: 'goo', hop: [.95, 2.35], split: ['slimelet', 2] },
  slimelet: { name: 'Slimelet', hp: 30, spd: 1.2, rad: .26, mass: .9, bounty: 3, lives: 1, hitH: .2, top: .48, dmg: 4, atkT: 1.0, eye: [1.8, 2.8, .4], scale: .58, death: 'goo', hop: [1.25, 2.35], cat: 'swarm' },
  knight: { name: 'Skeleton knight', tip: 'Its armor turns most arrows.', hp: 118, spd: 1.0, rad: .3, mass: 2.2, bounty: 15, lives: 1, hitH: .8, top: 1.6, dmg: 11, atkT: 1.05, eye: [.5, 1.7, 3.4], scale: 1.08, armor: .35, death: 'bones', blade: true, cat: 'armor', tint: [.74, .78, .9] },
  bat: { name: 'Bat', tip: 'Flies over the road. Only archers and spires reach it.', hp: 20, spd: 2.3, rad: .22, mass: .3, bounty: 6, lives: 1, hitH: 0, top: .35, dmg: 0, atkT: 1, eye: [3.2, .5, .3], scale: 1.25, fly: true, death: 'bat', cat: 'air', alt: [2.9, 3.8], flap: 21 },
  ghoul: { name: 'Ghoul', tip: 'Runs faster the more it is hurt.', hp: 40, spd: 1.85, rad: .27, mass: .9, bounty: 7, lives: 1, hitH: .5, top: .95, dmg: 9, atkT: .7, eye: [3.2, 2.8, .6], scale: .62, frenzy: .55, death: 'flesh', tint: [1.24, 1.03, 1.9] },
  spider: { name: 'Cave spider', tip: 'Slips past your footmen.', hp: 20, spd: 2.25, rad: .24, mass: .4, bounty: 3, lives: 1, hitH: .18, top: .45, dmg: 4, atkT: .6, eye: [3.4, .3, .2], scale: 1, slip: true, death: 'bug', cat: 'swarm', tint: [.6, .55, .6] },
  scarab: { name: 'Scarab', hp: 9, spd: 2.5, rad: .15, mass: .2, bounty: 1, lives: 1, hitH: .1, top: .28, dmg: 2, atkT: .6, eye: [1.2, 3.0, 2.6], scale: .5, slip: true, death: 'bug', cat: 'swarm', tint: [1.5, 1.15, .45] },
  wolf: { name: 'Dire wolf', tip: 'Fast, and it bites hard.', hp: 38, spd: 2.7, rad: .3, mass: .9, bounty: 7, lives: 1, hitH: .4, top: .85, dmg: 12, atkT: .7, eye: [3.4, 2.6, .3], scale: 1, death: 'fur', cat: 'swarm', tint: [.8, .8, .9] },
  bomber: { name: 'Sapper', tip: 'Its powder keg blows up friend and foe.', hp: 38, spd: 1.55, rad: .27, mass: 1, bounty: 8, lives: 2, hitH: .75, top: 1.55, dmg: 0, atkT: 1, eye: [3.6, 1.4, .2], scale: 1, explode: { r: 1.7, dmg: 46, men: 30 }, death: 'bones', tint: [.95, .85, .75] },
  wraith: { name: 'Wraith', tip: 'Arrows and swords miss while it fades.', hp: 58, spd: 1.3, rad: .28, mass: 1, bounty: 11, lives: 1, hitH: .8, top: 1.5, dmg: 0, atkT: 1, eye: [.8, 2.4, 3.6], scale: 1, ghost: [1.7, 3.0], death: 'ghost' },
  toad: { name: 'Bog toad', tip: 'Covers ground in long hops.', hp: 78, spd: 1.0, rad: .38, mass: 1.8, bounty: 9, lives: 1, hitH: .3, top: .75, dmg: 9, atkT: 1.0, eye: [3.0, 2.4, .3], scale: 1, hop: [1.2, 2.5], death: 'flesh' },
  wisp: { name: 'Wisp', tip: 'A fast flyer. Easy to kill, hard to catch.', hp: 10, spd: 3.0, rad: .14, mass: .1, bounty: 2, lives: 1, hitH: 0, top: .3, dmg: 0, atkT: 1, eye: [1, 1, 1], scale: 1, fly: true, death: 'wisp', cat: 'air', alt: [1.3, 2.3], flap: 6, glow: 8 },
  drummer: { name: 'War drummer', tip: 'Speeds up everything near it.', hp: 92, spd: 1.15, rad: .3, mass: 1.6, bounty: 14, lives: 1, hitH: .8, top: 2.35, dmg: 6, atkT: 1, eye: [3.6, .6, .2], scale: 1.05, aura: [3.4, .3], death: 'bones' },
  gargoyle: { name: 'Gargoyle', tip: 'A flyer that shrugs off arrows.', hp: 90, spd: 1.6, rad: .32, mass: 1.2, bounty: 13, lives: 1, hitH: 0, top: .6, dmg: 0, atkT: 1, eye: [3.6, 1.2, .2], scale: 1.15, fly: true, armor: .5, death: 'rock', cat: 'air', alt: [2.4, 3.1], flap: 9 },
  necro: { name: 'Necromancer', tip: 'Raises skeletons as it walks.', hp: 105, spd: .85, rad: .3, mass: 1.6, bounty: 18, lives: 1, hitH: .8, top: 1.8, dmg: 5, atkT: 1.2, eye: [.6, 3.4, 1.0], scale: 1.08, summon: { type: 'skel', n: 2, every: 7.5, max: 3, hp: .6 }, death: 'bones', tint: [.7, .74, .7] },
  mummy: { name: 'Mummy', tip: 'Bursts into scarabs when it falls.', hp: 135, spd: .9, rad: .3, mass: 2, bounty: 14, lives: 1, hitH: .8, top: 1.55, dmg: 12, atkT: 1.1, eye: [.6, 3.0, 2.6], scale: 1.1, split: ['scarab', 3], death: 'bones', tint: [1.08, .95, .72] },
  brute: { name: 'Troll', tip: 'Heals unless you keep hitting it.', hp: 360, spd: .82, rad: .5, mass: 8, bounty: 30, lives: 2, hitH: 1.0, top: 1.95, dmg: 24, atkT: 1.4, eye: [3.4, 2.4, .4], scale: 1.5, regen: .035, death: 'flesh', cat: 'armor', tint: [.83, .8, 2.0] },
  golem: { name: 'Golem', tip: 'Shrugs off arrows and is hard to slow.', hp: 470, spd: .62, rad: .5, mass: 9, bounty: 34, lives: 2, hitH: 1.1, top: 2.1, dmg: 26, atkT: 1.5, eye: [3.2, 2.6, 1.6], scale: 1.5, armor: .35, slowRes: .5, death: 'rock', cat: 'armor' },
  brood: { name: 'Brood mother', tip: 'Bursts into spiders when it falls.', hp: 230, spd: .92, rad: .55, mass: 5, bounty: 24, lives: 2, hitH: .45, top: 1.05, dmg: 14, atkT: 1.0, eye: [3.4, .3, .2], scale: 2.3, split: ['spider', 5], death: 'bug', tint: [.7, .5, .6] },
  giant: { name: 'Bone Giant', tip: 'Slow and enormous. Hit it with everything.', hp: 1250, spd: .88, rad: .92, mass: 40, bounty: 200, lives: 5, hitH: 2.2, top: 4.0, dmg: 46, atkT: 1.7, eye: [5, .9, .2], scale: 2.7, boss: true, death: 'bones', blade: true, cat: 'armor' },
  ogre: { name: 'Ogre', tip: 'Smashes footmen aside.', hp: 1400, spd: .8, rad: 1.0, mass: 46, bounty: 200, lives: 5, hitH: 1.9, top: 3.4, dmg: 52, atkT: 1.8, eye: [4.5, 2.2, .3], scale: 2.6, boss: true, death: 'flesh', blade: true, cat: 'armor' },
  jotun: { name: 'Frost Jotun', tip: 'Its stomp freezes nearby towers.', hp: 1150, spd: .8, rad: 1.0, mass: 46, bounty: 200, lives: 5, hitH: 1.9, top: 3.6, dmg: 52, atkT: 1.8, eye: [.8, 2.4, 4], scale: 2.75, boss: true, stomp: { every: 10, r: 5.2, stun: 1.8 }, death: 'flesh', blade: true, cat: 'armor', tint: [1.0, 1.25, 3.4] },
  queen: { name: 'Brood Queen', tip: 'Keeps hatching spiders.', hp: 1150, spd: .85, rad: 1.1, mass: 40, bounty: 200, lives: 5, hitH: 1.0, top: 2.0, dmg: 40, atkT: 1.5, eye: [3.8, .3, .9], scale: 4.2, boss: true, summon: { type: 'spider', n: 2, every: 8, max: 99, hp: 1 }, death: 'bug', cat: 'armor', tint: [.85, .55, 1.0] },
  colossus: { name: 'Magma Colossus', tip: 'Speeds up when it is nearly dead.', hp: 1250, spd: .7, rad: 1.05, mass: 60, bounty: 200, lives: 5, hitH: 2.2, top: 4.3, dmg: 60, atkT: 2.0, eye: [4, 1.6, .3], scale: 3.0, boss: true, armor: .85, slowRes: .3, enrage: [.3, 1.25], death: 'rock', cat: 'armor', tint: [1.5, .5, .26] },
  king: { name: 'The Buried King', tip: 'Summons mummies to walk with him.', hp: 1250, spd: .86, rad: .92, mass: 40, bounty: 200, lives: 5, hitH: 2.2, top: 4.2, dmg: 46, atkT: 1.7, eye: [.6, 3.0, 2.6], scale: 2.7, boss: true, summon: { type: 'mummy', n: 1, every: 9, max: 99, hp: .7 }, death: 'bones', blade: true, cat: 'armor', tint: [1.2, 1.0, .55] },
};

function spawnMonster(type, o = {}) {
  const B = G.B, def = MON[type], hpMul = o.hpMul || 1, bt = B.bio.tints;
  const m = {
    type, def, hp: def.hp * hpMul, maxHp: def.hp * hpMul, s: o.s === undefined ? .7 + rnd() * .5 : o.s, lat: o.lat === undefined ? rr(-.85, .85) : o.lat,
    x: 0, y: 0, z: 0, yaw: 0, ph: rnd() * 6, mv: 1, vf: def.spd, spdNow: def.spd, spdMul: rr(.93, 1.07) * (o.spdMul || 1), slowT: 0, slowF: 0,
    flash: 0, flinch: 0, atk: -1, cd: rr(.1, .5), foe: null, prog: 0, vis: false, dead: false, dying: 0, ks: 0, kl: 0, hop: rnd(), rad: def.rad * (o.radMul || 1), mass: def.mass,
    hitH: def.hitH, scale: def.scale * rr(.95, 1.05), fly: !!def.fly, torch: false, flame: null, tint: (bt && bt[type]) || def.tint || null, men: 0, struck: false, step: 0, alive: true, lI: 0, lx: 0, ly: 0, lz: 0, lseed: rnd() * 9, vx: 0, vz: 0, pop: o.pop || 0,
    haste: 0, hitAt: -9, beat: rnd() * 6, eth: false, gT: rnd() * 4, cast: 0, sumN: 0, sumT: def.summon ? def.summon.every * rr(.45, .7) : 0, stT: def.stomp ? def.stomp.every * .6 : 0, rage: false,
  };
  m.home = m.lane = m.lat;
  if (type === 'skel' && rnd() < .26) { m.torch = true; m.flame = addFlame({ x: 0, y: -50, z: 0, size: .36, embers: .45, glow: .8 }); m.lI = 30; }
  if (type === 'bomber') { m.torch = true; m.flame = addFlame({ x: 0, y: -50, z: 0, size: .3, embers: .7, glow: .7 }); m.lI = 26; }
  if (type === 'skel') m.tint = rnd() < .3 ? [.9, .86, .74] : null;
  if (def.glow) { m.glowL = true; m.lI = def.glow; m.lCol = B.bio.wispHex || 0xb0a0ff; }
  if (m.fly) {
    const c = B.cave; m.x = c.x + rr(-.5, .5); m.z = c.z + rr(-1, 1); m.y = c.y + 2.2; m.s = c.s + rr(0, .6);
    m.alt = rr(def.alt[0], def.alt[1]); m.side = rr(-1.1, 1.1) * (def.glow ? 1.4 : 1); m.vis = true;
  } else { const p = pathAt(B, m.s, _ap); m.x = p.x - p.tz * m.lat; m.z = p.z + p.tx * m.lat; m.y = p.y; }
  if (m.vis) UI.sawMonster(type);
  G.mons.push(m); return m;
}
function removeMonster(m) { m.dead = true; m.alive = false; if (m.flame) { removeFlame(m.flame); m.flame = null; } if (m.foe) { m.foe = null; } }

function slowMonster(m, f, t) { if (m.def.boss) { f *= .4; t *= .6; } if (m.def.slowRes) f *= 1 - m.def.slowRes; m.slowF = Math.max(m.slowF, f); m.slowT = Math.max(m.slowT, t); }
function hitMonster(m, dmg, kind, dx, dz, tower) {
  if (m.dead || m.hp <= 0) return false;
  if (m.eth) { if (kind === 'arrow' || kind === 'sword') { if (rnd() < .5) fxTimed(0, m.x + rr(-.2, .2), m.y + m.hitH + rr(-.2, .3), m.z + rr(-.2, .2), .5, .5, .5, .9, 1.8, .7, .18); return false; } dmg *= .5; }
  if (kind === 'arrow' && m.def.armor) { dmg *= m.def.armor; if (rnd() < .6) { fxSparks(m.x, m.y + m.hitH, m.z, 3, 3, 2.4, 2.2, 1.6, { size: .05 }); } }
  m.hp -= dmg; m.flash = 1; m.flinch = m.def.boss ? Math.max(m.flinch, .25) : 1; m.hitAt = G.t;
  const kb = (kind === 'blast' ? 2.6 : kind === 'sword' ? 1.3 : kind === 'arrow' ? .7 : .2) / Math.sqrt(m.mass);
  if (!m.fly && (dx || dz)) { const p = pathAt(G.B, m.s, _ap); m.ks += (dx * p.tx + dz * p.tz) * kb; m.kl += (-dx * p.tz + dz * p.tx) * kb; }
  if (tower) { tower.dealt += dmg; tower.recent += dmg; }
  if (m.hp <= 0) { killMonster(m, kind, dx, dz, tower); return true; }
  return false;
}
function dropCoins(x, y, z, bounty, n) {
  G.gold += bounty; const each = bounty / n;
  for (let i = 0; i < n; i++) {
    _tm.compose(_tv.set(x + rr(-.15, .15), y + .3, z + rr(-.15, .15)), _tq.set(rr(-1, 1), rr(-1, 1), rr(-1, 1), 1).normalize(), _ts.set(1, 1, 1));
    const d = addDebris(KIT.coin, _tm, null, rr(-1.6, 1.6), rr(3.6, 6.2), rr(-1.6, 1.6), rr(8, 16), 3, { coin: rr(.5, .8), bounce: .5 });
    if (d) d.value = each; else UI.goldShown += each;
  }
}
function blastAround(m, ex) {
  fxExplosion(m.x, m.y + .3, m.z, .62); sfx('explode', m.x, m.z, .8, rnd());
  for (const o of G.mons) { if (o === m || o.dead || o.fly || o.hp <= 0) continue; const d = Math.hypot(o.x - m.x, o.z - m.z); if (d < ex.r + o.rad) hitMonster(o, ex.dmg * (1 - .5 * d / (ex.r + o.rad)), 'blast', (o.x - m.x) / (d || 1), (o.z - m.z) / (d || 1), null); }
  for (const f of G.men) { if (f.dead) continue; const d = Math.hypot(f.x - m.x, f.z - m.z); if (d < ex.r) { f.hp -= ex.men * G.dmgMul * .6; f.flash = 1; f.flinch = 1; if (f.hp <= 0) killFootman(f, (f.x - m.x) / (d || 1), (f.z - m.z) / (d || 1)); } }
}
function killMonster(m, kind, dx, dz, tower) {
  const B = G.B, def = m.def, t = m.type, dth = def.death; if (tower) tower.kills++;
  if (def.boss) { m.dying = 1.9; m.hp = 0; m.foe = null; G.slowmo = 1.4; sfx('roar', m.x, m.z, 1, 1); return; }
  G.slain++; G.waveKills++;
  const ix = (dx || 0) * 2.2, iz = (dz || 0) * 2.2, up = kind === 'blast' ? 1.7 : 1, sc = m.scale;
  if (dth === 'bones') { shatter(e => rigMonster(e), m, [ix, 1.2 * up, iz], { spread: kind === 'blast' ? 2.6 : 1.5, up }); sfx('boneRattle', m.x, m.z, .8, rnd()); fxDust(m.x, m.y + .1, m.z, 3, .6, { a: .35 }); }
  else if (dth === 'fur') { shatter(e => rigMonster(e), m, [ix, 2.2 * up, iz], { spread: 1.2, life: .6 }); sfx('ratSqueal', m.x, m.z, .55, rnd()); fxDust(m.x, m.y + .1, m.z, 2, .4, { a: .3 }); }
  else if (dth === 'bat') { shatter(e => rigMonster(e), m, [ix + m.vx * .5, .5, iz + m.vz * .5], { spread: 1.0, life: .7 }); sfx('batScreech', m.x, m.z, .6, rnd()); }
  else if (dth === 'flesh') { shatter(e => rigMonster(e), m, [ix, 1.6 * up, iz], { spread: 1.5, life: .7, up }); sfx('squelch', m.x, m.z, .7, .5); fxDust(m.x, m.y + .1, m.z, 3 + Math.round(sc * 2), .5 * sc + .3, { a: .35 }); FX.decals.add(B.heightAt, m.x, m.z, .5 * sc + .3, .03, .012, .012, .6, 16); }
  else if (dth === 'bug') { shatter(e => rigMonster(e), m, [ix, 1.8 * up, iz], { spread: 1.6, life: .55 }); sfx('squelch', m.x, m.z, .5, .9); FX.decals.add(B.heightAt, m.x, m.z, .35 * sc + .15, .02, .03, .012, .6, 14); for (let i = 0; i < 3; i++) fxSmoke(m.x, m.y + .15, m.z, rr(-1, 1), rr(.4, 1), rr(-1, 1), rr(.3, .6), .25 * sc, .4, .14, .22, .1, .45, { drag: 3 }); }
  else if (dth === 'rock') {
    shatter(e => rigMonster(e), m, [ix + m.vx * .4, 1.4 * up, iz + m.vz * .4], { spread: 1.8, life: .9 }); sfx('hammer', m.x, m.z, 1, rnd()); fxDust(m.x, m.y + .2, m.z, 6 + Math.round(sc * 3), .7 * sc, { speed: 2.4 });
    for (let i = 0; i < 5; i++) { _tm.compose(_tv.set(m.x + rr(-.3, .3) * sc, m.y + rr(.2, 1) * sc, m.z + rr(-.3, .3) * sc), _tq.identity(), _ts.setScalar(rr(.6, 1.2))); addDebris(KIT.rubble, _tm, m.tint, rr(-2.5, 2.5) + ix, rr(2, 4.5), rr(-2.5, 2.5) + iz, rr(3, 9), rr(2.5, 4)); }
  }
  else if (dth === 'ghost') { shatter(e => rigMonster(e), m, [ix * .4, 2.2, iz * .4], { spread: .8, life: .45 }); sfx('batScreech', m.x, m.z, .45, .1); fxTimed(5, m.x, m.y + .8, m.z, 2.4, 2.4, .5, 1.1, 2.2, .9, .3); for (let i = 0; i < 6; i++) fxSmoke(m.x + rr(-.2, .2), m.y + rr(.2, 1.2), m.z + rr(-.2, .2), rr(-.5, .5), rr(.6, 1.6), rr(-.5, .5), rr(.6, 1.1), .4, .7, .3, .42, .6, .4, { drag: 1.5, rise: .3 }); }
  else if (dth === 'wisp') { const c = m.tint || [1, 1, 1]; fxTimed(5, m.x, m.y, m.z, 1.5, 1.5, c[0] * 2, c[1] * 2, c[2] * 2, .9, .22); fxSparks(m.x, m.y, m.z, 7, 3.2, c[0] * 2.4, c[1] * 2.4, c[2] * 2.4, { size: .05, grav: 2 }); sfx('ignite', m.x, m.z, .35, rnd()); }
  else {
    const big = t === 'slime', n = big ? 14 : 7;
    for (let i = 0; i < n; i++) { _tm.compose(_tv.set(m.x + rr(-.2, .2) * sc, m.y + rr(.1, .5) * sc, m.z + rr(-.2, .2) * sc), _tq.identity(), _ts.setScalar(rr(.8, 1.8) * sc)); addDebris(KIT.goo, _tm, null, rr(-3, 3) + ix, rr(2, 5.5), rr(-3, 3) + iz, 0, 2, { goo: 1 }); }
    FX.decals.add(B.heightAt, m.x, m.z, .95 * sc + .2, .012, .034, .014, .75, 22);
    fxTimed(4, m.x, m.y + .08, m.z, 2.6 * sc, 2.6 * sc, .25, .8, .2, .6, .3, { ground: true });
    for (let i = 0; i < 5; i++) fxSmoke(m.x, m.y + .3, m.z, rr(-1, 1), rr(.5, 1.5), rr(-1, 1), rr(.4, .8), .35 * sc, .5, .12, .3, .12, .5, { drag: 3 });
    sfx('squelch', m.x, m.z, .8, big ? .8 : .2);
  }
  if (def.split && G.mons.length < 90) { const [ty, n] = def.split; for (let i = 0; i < n; i++) { const u = n > 1 ? i / (n - 1) * 2 - 1 : 0; spawnMonster(ty, { s: Math.max(.5, m.s - .15 - .1 * Math.abs(u)), lat: clamp(m.lat + u * .34, -.95, .95), hpMul: m.maxHp / def.hp, pop: 1 }).kl = u * 2.2; } }
  if (m.torch && m.flame) fxEmbers(m.flame.x, m.flame.y, m.flame.z, 8, .15);
  dropCoins(m.x, m.y + m.hitH * .6, m.z, Math.round(def.bounty * G.bountyMul), clamp(Math.round(def.bounty / 3), 1, 6));
  removeMonster(m);
  if (def.explode) blastAround(m, def.explode);
}
function finishBoss(m) {
  G.slain++; G.waveKills++;
  shatter(e => rigMonster(e), m, [0, 2.5, 0], { spread: 3.4, up: 1.5, life: 1.5, hold: .25 });
  fxDust(m.x, m.y + .2, m.z, 26, 2.4, { speed: 4.5, life: 1.6 }); fxExplosion(m.x, m.y + 1, m.z, .9); FX.shake = 1.2;
  FX.decals.add(G.B.heightAt, m.x, m.z, 2.6, .02, .017, .015, .8, 60);
  sfx('bossDie', m.x, m.z, 1.2, 1);
  dropCoins(m.x, m.y + 1.4, m.z, Math.round(m.def.bounty * G.bountyMul), 26);
  G.bossDown = true; removeMonster(m);
}

const SKEL_EYE = [.058, .185, .152, .07], OGRE_EYE = [.055, .125, .15, .06], BUG_EYE = [.05, .055, .19, .035];
const RIGS = {
  skel(m) { m.weapon = KIT.item.sword; m.shamble = true; return rigHuman(KIT.skel, SPEC.skel, m); },
  knight(m) { m.weapon = KIT.item.sword; m.wScale = 1.2; m.shield = KIT.item.shieldR; m.helm = true; m.plate = true; return rigHuman(KIT.skel, SPEC.skel, m); },
  giant(m) { m.weapon = KIT.item.greatsword; m.wScale = 1.1; m.heavy = true; return rigHuman(KIT.giant, SPEC.skel, m); },
  ogre(m) { m.weapon = KIT.item.club; m.wScale = 1.2; m.heavy = true; return rigHuman(KIT.ogre, SPEC.ogre, m); },
  rat: rigRat, bat: m => rigBat(m), slime: rigSlime, slimelet: rigSlime,
  ghoul(m) { m.claw = true; return rigHuman(KIT.ogre, SPEC.ogre, m); },
  brute(m) { m.weapon = KIT.item.club; m.wScale = 1.1; m.heavy = true; return rigHuman(KIT.ogre, SPEC.ogre, m); },
  jotun(m) { m.weapon = KIT.item.iceclub; m.wScale = 1.3; m.heavy = true; return rigHuman(KIT.ogre, SPEC.ogre, m); },
  golem(m) { m.heavy = true; return rigHuman(KIT.golem, SPEC.golem, m); },
  colossus(m) { m.heavy = true; return rigHuman(KIT.golem, SPEC.golem, m); },
  necro(m) { m.weapon = KIT.item.staff; m.staff = true; m.hood = true; m.robe = true; return rigHuman(KIT.skel, SPEC.skel, m); },
  drummer(m) { m.weapon = KIT.item.stick; m.drum = true; m.standard = true; return rigHuman(KIT.skel, SPEC.skel, m); },
  bomber(m) { m.keg = true; return rigHuman(KIT.skel, SPEC.skel, m); },
  mummy(m) { m.shamble = true; m.wraps = true; return rigHuman(KIT.skel, SPEC.skel, m); },
  king(m) { m.weapon = KIT.item.khopesh; m.wScale = 1.25; m.heavy = true; m.crown = true; m.wraps = true; return rigHuman(KIT.giant, SPEC.skel, m); },
  spider: rigSpider, scarab: rigSpider, brood: rigSpider, queen: rigSpider, wolf: rigWolf, wraith: rigWraith, toad: rigToad, wisp: rigWisp,
  gargoyle: m => rigBat(m, KIT.garg, .1, .06),
};
function rigMonster(m) { return RIGS[m.type](m); }
const EYES = {
  skel: SKEL_EYE, knight: SKEL_EYE, giant: [.058, .185, .152, .075], ogre: OGRE_EYE, rat: [.05, .03, .42, .05], bat: [.04, .03, .16, .05], slime: [.13, .2, .44, .08], slimelet: [.13, .2, .44, .08],
  ghoul: OGRE_EYE, brute: OGRE_EYE, jotun: OGRE_EYE, golem: [.04, .1, .17, .05], colossus: [.04, .1, .17, .05], necro: SKEL_EYE, drummer: SKEL_EYE, bomber: SKEL_EYE, mummy: SKEL_EYE, king: [.058, .185, .152, .075],
  spider: BUG_EYE, scarab: BUG_EYE, brood: [.05, .055, .19, .022], queen: [.05, .055, .19, .016], wolf: [.05, .27, .63, .04], wraith: [.045, 1.04, .17, .055], toad: [.125, .345, .285, .035], gargoyle: [.045, .15, .28, .045], wisp: null,
};
function drawMonster(m, t) {
  const M = rigMonster(m), ey = EYES[m.type], c = m.def.eye, sc = m.scale, tw = .8 + .2 * Math.sin(t * 9 + m.lseed * 7), ty = m.type;
  if (ey) {
    for (const sg of [-1, 1]) { _tv.set(sg * ey[0], ey[1], ey[2]).applyMatrix4(M); FX.add.push(_tv.x, _tv.y, _tv.z, ey[3] * sc * 1.5, ey[3] * sc * 1.5, 0, 0, c[0], c[1], c[2], tw, 0, 0, 0, 0); }
    _tv.set(0, ey[1], ey[2]).applyMatrix4(M); FX.add.push(_tv.x, _tv.y, _tv.z, ey[3] * sc * 9, ey[3] * sc * 9, 0, 0, c[0] * .3, c[1] * .3, c[2] * .3, .5 * tw, 2, 0, 0, 0);
  }
  if (ty === 'wisp') { const k = m.tint || [1, 1, 1]; FX.add.push(m.x, m.y, m.z, .26, .26, 0, 0, k[0] * 2.2, k[1] * 2.2, k[2] * 2.2, tw, 0, 0, 0, 0); FX.add.push(m.x, m.y, m.z, 1.5, 1.5, 0, 0, k[0] * .5, k[1] * .5, k[2] * .5, .5 * tw, 2, 0, 0, 0); m.lx = m.x; m.ly = m.y; m.lz = m.z; if (rnd() < .3) fxPart(m.x + rr(-.05, .05), m.y + rr(-.05, .05), m.z + rr(-.05, .05), -m.vx * .2, rr(-.2, .2), -m.vz * .2, rr(.3, .6), .05, k[0] * 1.6, k[1] * 1.6, k[2] * 1.6, { drag: 1 }); }
  else if (ty === 'wraith') { const a = m.eth ? .5 + .2 * Math.sin(t * 23) : .16; FX.add.push(m.x, m.y + .75 * sc, m.z, 2.3 * sc, 2.6 * sc, 0, 0, .25, .55, 1.2, a, 2, 0, 0, 0); if (m.eth && rnd() < .3) fxPart(m.x + rr(-.25, .25), m.y + rr(.1, 1.3), m.z + rr(-.25, .25), 0, rr(.3, .9), 0, rr(.3, .6), .05, .5, 1.0, 2.0, { drag: .5 }); }
  else if (ty === 'necro' || ty === 'queen' || ty === 'king') { if (m.cast > 0) { const g = ty === 'necro' ? [.4, 1.6, .6] : ty === 'queen' ? [1.2, .5, 1.6] : [.4, 1.5, 1.3]; FX.add.push(m.x, m.y + m.hitH * 1.6, m.z, 3.2 * m.cast * sc, 3.2 * m.cast * sc, 0, 0, g[0], g[1], g[2], .28 * m.cast, 2, 0, 0, 0); } }
  else if (ty === 'colossus' && rnd() < (m.rage ? .5 : .12)) fxPart(m.x + rr(-.7, .7), m.y + rr(.6, 3), m.z + rr(-.7, .7), rr(-.3, .3), rr(.6, 1.8), rr(-.3, .3), rr(.6, 1.2), rr(.05, .08), 2.6, .9, .15, { drag: .3, wob: 1, rise: .3 });
  if (m.torch && m.flame) { const p = RIGOUT.torch; m.flame.x = p.x; m.flame.y = p.y; m.flame.z = p.z; m.lx = p.x; m.ly = p.y + .2; m.lz = p.z; }
  if (m.slowT > 0 && rnd() < .2) { const a = rnd() * TAU; fxBolt([m.x, m.y + m.hitH, m.z], [m.x + Math.cos(a) * m.rad * 1.4, m.y + m.hitH + rr(-.3, .4), m.z + Math.sin(a) * m.rad * 1.4], .08, [.4, .65, 1.3], .028); }
  if (m.vis || m.fly) G.hbars.push({ x: m.x, y: m.y + m.def.top * sc / m.def.scale + .22, z: m.z, f: sat(m.hp / m.maxHp), boss: !!m.def.boss, man: false, name: m.def.boss ? m.def.name : null });
}

function spawnFootman(tower) {
  const d = tower.def, lvl = tower.lvl, door = tower.w(tower.mounts.door, {});
  const used = tower.men.map(f => f.slot); let slot = 0; while (used.includes(slot)) slot++;
  const f = {
    isMan: true, tower, slot, x: door.x, y: door.y, z: door.z, yaw: tower.yaw, ph: 0, mv: 0, atk: -1, flinch: 0, flash: 0, hp: d.hp[lvl], maxHp: d.hp[lvl], dmg: d.dmg[lvl],
    rad: .26, mass: 7, s: tower.pad.s, lat: 0, onRoad: false, state: 'march', target: null, cd: rr(.2, .6), torch: slot === 0, gone: false, dead: false, vf: 0, scale: .9 + lvl * .05,
    struck: false, alive: true, lI: slot === 0 ? 32 : 0, lx: 0, ly: 0, lz: 0, lseed: rnd() * 9, flame: null, leave: false, lvlUp: false, weapon: null, shield: null, age: 0, foes: 0,
  };
  if (f.torch) f.flame = addFlame({ x: door.x, y: -50, z: door.z, size: .34, embers: .45, glow: .8 });
  tower.men.push(f); G.men.push(f); return f;
}
function killFootman(f, dx, dz) {
  f.dead = true; f.alive = false; f.gone = true; if (f.flame) { fxEmbers(f.flame.x, f.flame.y, f.flame.z, 6, .1); removeFlame(f.flame); f.flame = null; }
  f.weapon = KIT.item.blade; if (!f.torch) f.shield = KIT.item.shieldH;
  shatter(e => rigHuman(KIT.foot, SPEC.foot, e), f, [(dx || 0) * 1.6, .8, (dz || 0) * 1.6], { spread: .9, life: .8 });
  fxDust(f.x, f.y + .1, f.z, 3, .5, { a: .35 }); sfx('footmanDie', f.x, f.z, .8);
}
function slotPos(f, out) {
  const B = G.B, n = f.tower.def.n[f.tower.lvl], lat = (n === 2 ? [-.48, .48] : [-.66, 0, .66])[f.slot % n] || 0;
  const p = pathAt(B, f.tower.pad.s, out); p.x += -p.tz * lat; p.z += p.tx * lat; return p;
}
const _fp = { x: 0, y: 0, z: 0, tx: 0, tz: 0 };
function footmanThink(f, dt) {
  const B = G.B, tw = f.tower; f.age += dt;
  if (f.lvlUp) { f.lvlUp = false; const d = tw.def, r = f.hp / f.maxHp; f.maxHp = d.hp[tw.lvl]; f.hp = f.maxHp * Math.max(r, .6); f.dmg = d.dmg[tw.lvl]; f.scale = .9 + tw.lvl * .05; }
  if (!tw.alive) f.leave = true;
  let gx, gz, face = null, speed = 2.1, fighting = false;
  const rally = slotPos(f, _fp), rs = tw.pad.s;
  if (f.leave) { f.gone = true; f.alive = false; if (f.flame) { removeFlame(f.flame); f.flame = null; } fxDust(f.x, f.y + .3, f.z, 4, .6); return; }
  let m = f.target;
  if (m && (m.dead || m.hp <= 0 || Math.abs(m.s - rs) > 3.0 || m.dying)) { if (m.foe === f) m.foe = null; m.men = Math.max(0, m.men - 1); m = f.target = null; }
  if (!m && f.state !== 'march') {
    let best = null, bd = 1e9;
    for (const q of G.mons) { if (q.dead || q.fly || q.hp <= 0 || !q.vis || q.dying || q.def.ghost) continue; if (Math.abs(q.s - rs) > 2.5) continue; const d = dist2(f.x, f.z, q.x, q.z) + q.men * 6; if (d < bd) { bd = d; best = q; } }
    if (best) { m = f.target = best; best.men++; }
  }
  if (m) {
    const p = pathAt(B, m.s, _ap), reach = m.rad + f.rad + .14;
    gx = m.x + p.tx * reach; gz = m.z + p.tz * reach;
    const d = Math.hypot(m.x - f.x, m.z - f.z);
    face = Math.atan2(m.x - f.x, m.z - f.z);
    if (d < reach + .3) { fighting = true; if (!m.foe && !m.def.slip) m.foe = f; if (d < reach + .12) { gx = f.x; gz = f.z; } }
  } else { gx = rally.x; gz = rally.z; if (f.state === 'march' && Math.hypot(gx - f.x, gz - f.z) < .2) f.state = 'ready'; }
  const dx = gx - f.x, dz = gz - f.z, dl = Math.hypot(dx, dz);
  if (dl > .06) { const st = Math.min(dl, speed * dt); f.x += dx / dl * st; f.z += dz / dl * st; f.ph += st * 6.2; f.mv = damp(f.mv, 1, 12, dt); if (!fighting) face = Math.atan2(dx, dz); }
  else { f.mv = damp(f.mv, 0, 10, dt); if (!m) { const p = pathAt(B, rs, _ap); face = Math.atan2(-p.tx, -p.tz); } }
  if (face !== null) f.yaw = angDamp(f.yaw, face, 12, dt);
  f.cd -= dt;
  if (f.atk >= 0) {
    f.atk += dt / .58;
    if (f.atk >= .5 && !f.struck) { f.struck = true; if (m && !m.dead && Math.hypot(m.x - f.x, m.z - f.z) < m.rad + f.rad + .75) strike(f, m, f.dmg, true); }
    if (f.atk >= 1) { f.atk = -1; f.cd = rr(.3, .5); }
  } else if (fighting && f.cd <= 0) { f.atk = 0; f.struck = false; }
  f.flash = Math.max(0, f.flash - dt * 7); f.flinch = Math.max(0, f.flinch - dt * 4.5);
  const q = pathNear(B, f.x, f.z, f.s, 20); f.s = q.s; f.lat = q.lat; f.onRoad = Math.abs(q.lat) < ROAD_HALF + .3;
  f.y = f.onRoad ? B.py[q.i] + .03 : B.heightAt(f.x, f.z);
}
function strike(a, b, dmg, byMan) {
  const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1, mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, big = !!(a.def && a.def.boss);
  const my = a.y + (byMan ? .85 : (a.hitH || .7) * (big ? .6 : 1)) + .1;
  const rx = Math.cos(CAM.yaw), rz = -Math.sin(CAM.yaw), se = Math.sin(CAM.elev), ux = -se * Math.sin(CAM.yaw), uz = -se * Math.cos(CAM.yaw);
  const rot = Math.atan2(dx * ux + dz * uz, dx * rx + dz * rz);
  const blade = byMan || (a.def && a.def.blade) || big;
  if (blade) fxTimed(7, mx, my, mz, big ? 4.2 : 1.55, big ? 4.2 : 1.55, byMan ? 2.2 : 2.0, byMan ? 2.2 : 1.7, byMan ? 2.4 : 1.3, .9, .2, { rot });
  if (byMan) { const metal = !!b.def.armor || (b.def.death === 'bones' && rnd() < .4); fxSparks(b.x - dx / l * b.rad, my, b.z - dz / l * b.rad, metal ? 7 : 3, 3.6, 3, 2.3, 1.2, { size: .055, grav: 7 }); sfx(metal ? 'clash' : 'slash', mx, mz, .7, rnd()); hitMonster(b, dmg, 'sword', dx / l, dz / l, a.tower); a.tower.recent += dmg * .5; }
  else {
    if (big) { fxDust(b.x, b.y + .1, b.z, 10, 1.4, { speed: 3 }); FX.shake = Math.min(1.2, FX.shake + .5); sfx('bossStep', b.x, b.z, 1, 1); fxTimed(4, b.x, b.y + .08, b.z, 4.5, 4.5, 1.2, .9, .6, .5, .35, { ground: true }); }
    const hitList = big ? G.men.filter(f => !f.dead && Math.hypot(f.x - b.x, f.z - b.z) < 1.5) : [b];
    for (const f of hitList) {
      f.hp -= dmg; f.flash = 1; f.flinch = 1;
      if (!f.torch && rnd() < .65) { fxSparks(f.x - dx / l * .2, my, f.z - dz / l * .2, 5, 3.2, 3, 2.3, 1.3, { size: .055, grav: 7 }); if (f === b) sfx('clash', mx, mz, .6, rnd()); } else if (f === b) sfx('slash', mx, mz, .55, rnd());
      if (f.hp <= 0) killFootman(f, dx / l, dz / l);
    }
  }
}
function drawFootman(f) {
  f.weapon = KIT.item.blade; f.shield = f.torch ? null : KIT.item.shieldH; f.wScale = 1;
  rigHuman(KIT.foot, SPEC.foot, f);
  if (f.torch && f.flame) { const p = RIGOUT.torch; f.flame.x = p.x; f.flame.y = p.y; f.flame.z = p.z; f.lx = p.x; f.ly = p.y + .2; f.lz = p.z; }
  if (f.hp < f.maxHp) G.hbars.push({ x: f.x, y: f.y + 1.55 * f.scale, z: f.z, f: sat(f.hp / f.maxHp), boss: false, man: true });
}

const _units = [];
function updateUnits(dt) {
  const B = G.B, mons = G.mons, men = G.men, L = B.L, maxLatBase = ROAD_HALF + .04;
  for (let i = men.length - 1; i >= 0; i--) { const f = men[i]; if (f.gone) { swapRemove(men, i); continue; } footmanThink(f, dt); if (f.gone) swapRemove(men, i); }
  _units.length = 0;
  for (const m of mons) { m.haste = 0; if (!m.dead && !m.fly && !m.def.ghost) _units.push(m); }
  for (const d of mons) if (!d.dead && d.def.aura && d.vis && !d.dying) for (const m of mons) if (m !== d && !m.dead && !m.fly && !m.def.boss && Math.abs(m.s - d.s) < d.def.aura[0]) m.haste = d.def.aura[1];
  for (const f of men) if (!f.dead && f.onRoad) _units.push(f);
  const U = _units, nu = U.length;
  for (const m of mons) {
    if (m.dead) continue;
    m.flash = Math.max(0, m.flash - dt * 7); m.flinch = Math.max(0, m.flinch - dt * 4.2);
    if (m.slowT > 0) { m.slowT -= dt; if (m.slowT <= 0) m.slowF = 0; }
    if (m.fly) { updateBat(m, dt); continue; }
    const def = m.def, maxLat = Math.max(0, maxLatBase - m.rad * .7);
    if (m.dying > 0) {
      m.dying -= dt; m.flinch = .5 + .5 * Math.sin(m.dying * 22); m.mv = 0; m.atk = -1; m.y -= dt * .12;
      if (rnd() < dt * 14) fxDust(m.x + rr(-.8, .8), m.y + rr(.4, 2.6), m.z + rr(-.8, .8), 1, .7, { a: .4 });
      if (m.dying <= 0) finishBoss(m); continue;
    }
    if (m.foe && (m.foe.dead || m.foe.gone)) m.foe = null;
    if (def.explode && m.foe) { m.hp = 0; killMonster(m, 'blast', 0, 0, null); continue; }
    if (def.regen && m.hp < m.maxHp && G.t - m.hitAt > 2.2) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * def.regen * dt);
    if (def.ghost) { m.gT = (m.gT + dt) % (def.ghost[0] + def.ghost[1]); m.eth = m.gT < def.ghost[0]; }
    if (def.aura) { const b0 = m.beat; m.beat += dt * 7.5; if (m.vis && Math.floor(m.beat / TAU) !== Math.floor(b0 / TAU)) fxTimed(4, m.x, m.y + .08, m.z, def.aura[0] * 1.5, def.aura[0] * 1.5, 1.4, .5, .2, .22, .5, { ground: true }); }
    if (m.cast > 0) m.cast = Math.max(0, m.cast - dt * 1.1);
    if (def.summon && m.vis) {
      m.sumT -= dt;
      if (m.sumT <= 0 && m.sumN < def.summon.max && mons.length < 78) {
        const sm = def.summon; m.sumT = sm.every; m.sumN++; m.cast = 1; sfx('ignite', m.x, m.z, .7, .3);
        for (let i = 0; i < sm.n; i++) { const q = spawnMonster(sm.type, { s: Math.max(.5, m.s - .6 - .3 * i - (def.boss ? 1.2 : 0)), lat: clamp(m.lat + (i - (sm.n - 1) / 2) * .8 + rr(-.1, .1), -.9, .9), hpMul: (m.maxHp / def.hp) * sm.hp, pop: 1 }); fxTimed(4, q.x, q.y + .08, q.z, 1.8, 1.8, .4, 1.6, .7, .6, .5, { ground: true }); fxDust(q.x, q.y + .1, q.z, 4, .6, { a: .4, c: [.2, .34, .24] }); }
      }
    }
    if (def.stomp && m.vis) {
      m.stT -= dt;
      if (m.stT <= 0) {
        const sp = def.stomp; m.stT = sp.every; FX.shake = Math.min(1.2, FX.shake + .8); sfx('bossStep', m.x, m.z, 1.2, 1); sfx('roar', m.x, m.z, .6, .4);
        fxTimed(4, m.x, m.y + .08, m.z, sp.r * 2, sp.r * 2, .6, 1.2, 2.2, .8, .7, { ground: true }); fxDust(m.x, m.y + .1, m.z, 16, 1.8, { speed: 4, c: [.6, .7, .85] }); lightFlash(m.x, m.y + 1.5, m.z, 0x8fc8ff, 300, .5, 16);
        for (const tw of G.towers) if (tw.alive && tw.state === 'active' && dist2(tw.x, tw.z, m.x, m.z) < sp.r * sp.r) { tw.stun = sp.stun; fxTimed(5, tw.x, tw.y + 2, tw.z, 3, 3, .6, 1.2, 2.4, .9, .3); }
      }
    }
    let want = def.spd * m.spdMul * (1 - m.slowF) * (1 + m.haste), hopMul = 1;
    if (def.frenzy) want *= 1 + def.frenzy * (1 - m.hp / m.maxHp);
    if (def.enrage && m.hp < m.maxHp * def.enrage[0]) { want *= def.enrage[1]; if (!m.rage) { m.rage = true; sfx('roar', m.x, m.z, 1, .9); fxEmbers(m.x, m.y + 2, m.z, 40, 1.2); FX.shake = Math.min(1.2, FX.shake + .6); } }
    if (def.hop) { if (!m.foe) m.hop = (m.hop + dt * def.hop[0] * (1 - m.slowF * .6)) % 1; hopMul = (m.hop > .22 && m.hop < .62) ? def.hop[1] : .1; }
    let v = want * hopMul, obstacle = null, og = 9;
    if (def.boss) {
      if (!m.foe) for (const f of men) if (!f.dead && f.onRoad && f.s > m.s - .3 && f.s - m.s < 1.9 && Math.abs(f.lat - m.lat) < 1.4) { m.foe = f; break; }
      if (m.foe) v *= .55;
    } else if (m.foe) v = 0;
    else if (!def.ghost) for (let j = 0; j < nu; j++) {
      const o = U[j]; if (o === m || (def.slip && o.isMan)) continue; const ds = o.s - m.s; if (ds <= 0 || ds > 1.7 + m.rad + o.rad) continue;
      if (Math.abs(o.lat - m.lat) > (m.rad + o.rad) * .92) continue;
      const gap = ds - (m.rad + o.rad), lim = Math.max(0, (o.vf || 0) + gap * 2.6);
      if (lim < v) { v = lim; obstacle = o; og = gap; }
    }
    if (!m.foe && obstacle && obstacle.isMan && og < .3 && obstacle.foes < 2) m.foe = obstacle;
    if (obstacle && v < want * .55 && !m.foe) {
      if (m.laneT === undefined || m.laneT <= 0) {
        m.laneT = .35; const first = rnd() < .5 ? 1 : -1;
        for (const d of [first * .5, -first * .5, first * 1.0, -first * 1.0]) {
          const cand = clamp(m.lat + d, -maxLat, maxLat); if (Math.abs(cand - m.lat) < .2) continue; let free = true;
          for (let j = 0; j < nu && free; j++) { const o = U[j]; if (o === m) continue; const ds = o.s - m.s; if (ds < -.5 - o.rad || ds > 1.3 + o.rad) continue; if (Math.abs(o.lat - cand) < (m.rad + o.rad) * .97) free = false; }
          if (free) { m.lane = cand; break; }
        }
      } else m.laneT -= dt;
    } else if (!obstacle) m.lane = damp(m.lane, m.home, .25, dt);
    m.vf = v; m.spdNow = damp(m.spdNow, want * (m.foe ? (def.boss ? .55 : 0) : 1), 3, dt);
    const kd = Math.exp(-7 * dt); m.s += (v - m.ks * 0) * dt + m.ks * dt; m.lat += m.kl * dt; m.ks *= kd; m.kl *= kd;
    m.lat += clamp(m.lane - m.lat, -1.3 * dt, 1.3 * dt); m.lat = clamp(m.lat, -maxLat, maxLat); m.s = Math.max(.3, m.s);
    const moved = v * dt;
    if (def.death === 'fur' || def.death === 'bug') m.ph += moved * (def.boss ? 2.4 : def.death === 'bug' ? 9 / Math.sqrt(m.scale) : 7.5 / m.scale); else if (def.boss) m.ph += moved * 6.0 / m.scale * 1.15; else m.ph += moved * 5.6 / (m.scale || 1);
    m.mv = damp(m.mv, sat(v / (want * .5 + .01)), 10, dt);
    m.cd -= dt;
    if (m.atk >= 0) {
      m.atk += dt / def.atkT * 1.7;
      if (m.atk >= .5 && !m.struck) { m.struck = true; const f = m.foe; if (f && !f.dead && Math.hypot(f.x - m.x, f.z - m.z) < m.rad + f.rad + (def.boss ? 1.4 : .8)) strike(m, f, def.dmg * G.dmgMul, false); }
      if (m.atk >= 1) { m.atk = -1; m.cd = def.atkT * rr(.35, .5); }
    } else if (m.foe && m.cd <= 0) { m.atk = 0; m.struck = false; if (def.boss) sfx('roar', m.x, m.z, .5, .7); }
    if (def.boss && v > .05) { const st = Math.floor(m.ph / PI); if (st !== m.step) { m.step = st; const p = pathAt(B, m.s, _ap), sd = (st & 1) ? 1 : -1; const fxp = m.x - p.tz * sd * .5, fzp = m.z + p.tx * sd * .5; fxDust(fxp, m.y + .05, fzp, 7, 1.0, { speed: 2.2 }); FX.shake = Math.min(1.1, FX.shake + .4); sfx('bossStep', m.x, m.z, 1, .6); FX.decals.add(B.heightAt, fxp, fzp, .55, .02, .017, .015, .5, 9); } }
    if (m.s >= L - .35) { leak(m); continue; }
  }
  for (const u of U) if (u.isMan) u.foes = 0;
  for (const m of mons) if (!m.dead && m.foe) m.foe.foes++;
  for (const m of mons) { if (m.dead || m.fly) continue; const p = pathAt(B, m.s, _ap); m.x = p.x - p.tz * m.lat; m.z = p.z + p.tx * m.lat; m.y = p.y + .02 - (m.dying > 0 ? (1.9 - m.dying) * .15 : 0); m._tx = p.tx; m._tz = p.tz; m._x0 = m.x; m._z0 = m.z; }
  for (let i = 0; i < nu; i++) {
    const a = U[i]; if (a.dead) continue;
    for (let j = i + 1; j < nu; j++) {
      const b = U[j]; if (b.dead) continue; const dx = b.x - a.x, dz = b.z - a.z, rs = a.rad + b.rad, d2 = dx * dx + dz * dz;
      if (d2 >= rs * rs || d2 < 1e-6) continue;
      const d = Math.sqrt(d2), ov = (rs - d) * .6, ma = a.isMan ? (a.target ? 9 : 4) : a.mass, mb = b.isMan ? (b.target ? 9 : 4) : b.mass, wa = mb / (ma + mb), wb = ma / (ma + mb);
      a.x -= dx / d * ov * wa; a.z -= dz / d * ov * wa; b.x += dx / d * ov * wb; b.z += dz / d * ov * wb;
    }
  }
  for (const m of mons) {
    if (m.dead || m.fly) continue;
    const dx = m.x - m._x0, dz = m.z - m._z0, maxLat = Math.max(0, maxLatBase - m.rad * .7);
    if (dx || dz) { m.s = Math.max(.3, m.s + clamp(dx * m._tx + dz * m._tz, -.12, .12)); m.lat = clamp(m.lat + (-dx * m._tz + dz * m._tx), -maxLat, maxLat); }
    const p = pathAt(B, m.s, _ap); m.x = p.x - p.tz * m.lat; m.z = p.z + p.tx * m.lat;
    let yaw = Math.atan2(p.tx, p.tz); if (m.foe) yaw = Math.atan2(m.foe.x - m.x, m.foe.z - m.z);
    m.yaw = angDamp(m.yaw, yaw, m.def.boss ? 4 : 9, dt);
    m.prog = m.s / L; if (!m.vis && m.s > B.cave.s + 1.7) { m.vis = true; UI.sawMonster(m.type); }
    if (m.pop > 0) m.pop = Math.max(0, m.pop - dt * 3);
  }
}
function updateBat(m, dt) {
  const B = G.B, b = B.beacon, def = m.def, v = def.spd * m.spdMul * (1 - m.slowF);
  m.s = Math.min(B.L, m.s + v * dt);
  const f = clamp(m.s / PATH_STEP, 0, B.n - 1.001), i = Math.floor(f), u = f - i, dxp = B.ax[i + 1] - B.ax[i], dzp = B.az[i + 1] - B.az[i], dl = Math.hypot(dxp, dzp) || 1;
  const lat = m.side + Math.sin(G.t * (def.glow ? 2.6 : 1.7) + m.lseed * 3) * (def.glow ? .7 : .45), e = sat((m.s - (B.L - 6)) / 6), e2 = e * e * (3 - 2 * e);
  const tx = lerp(lerp(B.ax[i], B.ax[i + 1], u) - dzp / dl * lat, b.x, e2), tz = lerp(lerp(B.az[i], B.az[i + 1], u) + dxp / dl * lat, b.z, e2);
  let vx = (tx - m.x) * 4, vz = (tz - m.z) * 4; const sp = Math.hypot(vx, vz), cap = v * 2.2 + .5; if (sp > cap) { vx *= cap / sp; vz *= cap / sp; }
  m.vx = damp(m.vx, vx, 8, dt); m.vz = damp(m.vz, vz, 8, dt); m.x += m.vx * dt; m.z += m.vz * dt;
  const ground = B.heightAt(m.x, m.z), k = sat((m.s - B.cave.s - 1.5) / 2.5);
  let top = Math.max(B.topAt(m.x, m.z), B.topAt(m.x + m.vx * .45, m.z + m.vz * .45));
  for (const t of G.towers) if (t.alive && dist2(t.x, t.z, m.x + m.vx * .3, m.z + m.vz * .3) < 3.2) top = Math.max(top, t.y + (t.mounts ? t.mounts.top : 2.5) + .4);
  let wantY = Math.max(ground + m.alt, lerp(ground + m.alt, top + (def.glow ? .45 : .7), k)) + (def.glow ? Math.sin(G.t * 2.3 + m.lseed * 5) * .3 : 0);
  wantY = lerp(wantY, b.y - .2, e2 * e2);
  m.y = damp(m.y, wantY, wantY > m.y ? 5 : 2.2, dt); if (sp > .05) m.yaw = angDamp(m.yaw, Math.atan2(m.vx, m.vz), 8, dt); m.ph += dt * def.flap;
  m.prog = m.s / B.L * .98;
  if (e >= 1 && (dist2(b.x, b.z, m.x, m.z) < .8 || (m.endT = (m.endT || 0) + dt) > 3)) leak(m);
}
function leak(m) {
  const B = G.B, n = m.def.lives;
  G.lives = Math.max(0, G.lives - n); G.leaks++; G.waveLeaks++; G.leakTypes[m.type] = (G.leakTypes[m.type] || 0) + n;
  LT.beaconGutter = 1; UI.hurt = 1;
  if (m.fly) { fxSparks(m.x, m.y, m.z, 14, 5, 3, 1.4, .4); fxSmoke(m.x, m.y, m.z, 0, 1, 0, 1.2, .5, .8, .2, .2, .2, .6); }
  else { for (let i = 0; i < 6; i++) fxSmoke(m.x + rr(-.3, .3), m.y + rr(.2, 1), m.z + rr(-.3, .3), rr(-.4, .4), rr(.2, .8), rr(-.4, .4), rr(.6, 1.2), .5, .7, .05, .05, .07, .7, { drag: 2 }); }
  fxEmbers(B.beacon.x, B.beacon.y, B.beacon.z, 26, .5);
  sfx('leak', B.gate.x, B.gate.z, 1);
  removeMonster(m);
}


Object.assign(G, {
  press: 1, bountyMul: 1, dmgMul: 1, waveKills: 0, waveLeaks: 0, leaks: 0, leakTypes: {}, slowmo: 0, bossDown: false,
  queue: [], waveT: 0, nextIn: 0, spawning: false, bossWave: false, bossAlive: false, k: 0, phaseT: 0, banner: null, started: false, timeScale: 1, trickle: 0, clearT: 0, paused: false, speed: 1, best: 0, seen: {},
});

function waveNumber() { return G.level * 5 + (G.phase === 'rise' ? 1 : Math.max(1, G.k)); }
const ROSTER = {
  skel: [4, 3, 6, .5, 1, 5], rat: [1.7, 5, 9, .2, 2, 3], bat: [4.2, 3, 5, .35, 2, 1.3], ghoul: [5.5, 2, 4, .4, 2, 2],
  slime: [9.5, 1, 3, .9, 3, 2], spider: [3, 3, 6, .25, 3, 2], scarab: [1.9, 5, 8, .18, 2, 0], knight: [12.5, 1, 3, .5, 4, 2], wolf: [5.5, 2, 4, .35, 4, 1.6], bomber: [6, 1, 2, .8, 4, 1.2],
  wraith: [9, 1, 3, .7, 5, 1.4], toad: [8, 1, 3, .7, 5, .7], wisp: [2.6, 4, 7, .22, 5, .8], drummer: [13, 1, 1, 1, 6, .9], gargoyle: [11, 1, 3, .6, 6, .9],
  necro: [18, 1, 1, 1.2, 7, .9], mummy: [15, 1, 2, .9, 7, .9], brute: [32, 1, 1, 2, 8, .7], golem: [40, 1, 1, 2, 8, .7], brood: [30, 1, 1, 2, 9, .6],
};
function waveMenu(k, level) {
  const w = level * 5 + k, bio = G.B.bio, menu = [];
  for (const ty in ROSTER) {
    const r = ROSTER[ty], mul = bio.mobs[ty] === undefined ? 1 : bio.mobs[ty], un = Math.min(r[4], bio.early[ty] || 99), wt = r[5] ? r[5] * mul : (bio.mobs[ty] || 0);
    if (w >= un && wt > 0) menu.push([ty, wt * (w === un && w > 1 ? 2.2 : 1)]);
  }
  return menu;
}
function bossType() { const b = G.B.bio.boss; return b[Math.floor(G.level / BIOMES.length) % b.length]; }
function buildWave(k, level) {
  const q = [], boss = k === 5, lv = 1 + .25 * level;
  let budget = (34 + 25 * (k - 1)) * lv * G.press * (boss ? .7 : 1), heavy = 0, air = budget * .42;
  const hpMul = (1 + .13 * (k - 1)) * (1 + .27 * level) * (.85 + .15 * G.press);
  const menu = waveMenu(k, level), tot = menu.reduce((a, b) => a + b[1], 0);
  let t = .6;
  if (boss) q.push({ t: 2.2, type: bossType(), hpMul: (1 + .4 * level) * Math.pow(G.press, .4) });
  while (budget > 0) {
    let r = rnd() * tot, type = 'skel'; for (const [ty, w] of menu) { r -= w; if (r <= 0) { type = ty; break; } }
    let R = ROSTER[type];
    if (R[0] > budget + 5 || (R[0] >= 30 && heavy >= 1 + (level >> 1)) || (MON[type].fly && air <= 0)) { type = 'skel'; R = ROSTER.skel; }
    if (R[0] >= 30) heavy++;
    const n = Math.floor(rr(R[1], R[2] + .999)), gap = R[3];
    for (let i = 0; i < n && budget > 0; i++) { q.push({ t, type, hpMul }); t += gap * rr(.8, 1.25); budget -= R[0]; if (MON[type].fly) air -= R[0]; }
    t += rr(1.1, 2.3) * (boss ? 1.5 : 1);
  }
  q.sort((a, b) => a.t - b.t);
  return q;
}
function startWave() {
  G.k = G.k % 5 + 1; G.queue = buildWave(G.k, G.level); if (waveNumber() > G.best) { G.best = waveNumber(); try { localStorage.setItem('cinderwatch.best', '' + G.best); } catch (e) {} } G.waveT = 0; G.spawning = true; G.bossWave = G.k === 5; G.waveKills = 0; G.waveLeaks = 0; G.bossDown = false; G.trickle = 6; G.trickleN = 0;
  sfx(G.bossWave ? 'hornBoss' : 'horn', G.B.cave.x, G.B.cave.z, 1.1);
  UI.banner(G.bossWave ? 'Wave ' + waveNumber() + ' · ' + MON[bossType()].name : 'Wave ' + waveNumber(), G.bossWave ? 3.6 : 2.2, G.bossWave);
}
function endWave() {
  const l = G.waveLeaks;
  if (l === 0) G.press *= 1.17; else if (l >= 6) G.press *= .8; else if (l >= 3) G.press *= .9;
  if (G.lives <= 6) G.press *= .9;
  G.press = clamp(G.press, .6, 2.2);
  G.gold += 24 + 9 * G.k + 10 * G.level;
}
function updateWaves(dt) {
  if (G.phase !== 'play') return;
  const B = G.B;
  if (G.spawning) {
    G.waveT += dt;
    while (G.queue.length && G.queue[0].t <= G.waveT) {
      if (G.mons.length > 84) break;
      const e = G.queue.shift(); spawnMonster(e.type, { hpMul: e.hpMul });
    }
    if (!G.queue.length) {
      G.bossAlive = G.mons.some(m => m.def.boss && !m.dead);
      if (G.bossWave && G.bossAlive) {
        G.trickle -= dt;
        if (G.trickle <= 0 && G.trickleN < 9) { G.trickleN++; G.trickle = rr(3.2, 4.6); const tm = waveMenu(5, G.level).filter(e => ROSTER[e[0]][0] < 13), ty = tm[Math.floor(rnd() * tm.length)][0], n = Math.max(1, Math.min(5, Math.round(8 / ROSTER[ty][0]))), hpMul = (1 + .5) * (1 + .22 * G.level); for (let i = 0; i < n; i++) G.queue.push({ t: G.waveT + i * .4, type: ty, hpMul }); }
      } else { G.spawning = false; endWave(); G.nextIn = G.bossWave ? -1 : 6.5; G.clearT = 0; }
    }
  } else if (G.bossWave) {
    G.clearT += dt;
    if (!G.mons.some(m => !m.dead) || G.clearT > 40) { setPhase('clear'); }
  } else {
    G.nextIn -= dt;
    if (G.nextIn <= 0) startWave();
  }
  if (G.lives <= 0 && G.phase === 'play') setPhase('defeat');
}
function callWaveEarly() { if (G.phase === 'play' && !G.spawning && !G.bossWave && G.nextIn > .4) { G.gold += Math.round(G.nextIn * 3); G.nextIn = .05; return true; } return false; }

function padCoverage(pad, range, air) {
  const B = G.B; let c = 0; const r2 = range * range;
  for (let i = 0; i < B.n; i += 2) if (dist2(pad.x, pad.z, B.px[i], B.pz[i]) < r2) c += PATH_STEP * 2;
  return c;
}
function buildTower(pad, kind, byPlayer) {
  const def = TOWER[kind]; if (pad.tower || G.gold < def.cost[0] || G.phase !== 'play') return null;
  G.gold -= def.cost[0]; UI.goldShown = Math.min(UI.goldShown, G.gold);
  const t = new Tower(pad, kind, G.B.pads.indexOf(pad)); G.towers.push(t); UI.ping(pad.x, pad.y, pad.z, byPlayer); return t;
}
function upgradeTower(t, byPlayer) {
  if (!t || t.lvl >= 2 || t.state !== 'active' || G.phase !== 'play') return false; const c = t.def.cost[t.lvl + 1]; if (G.gold < c) return false;
  G.gold -= c; UI.goldShown = Math.min(UI.goldShown, G.gold); t.upgrade(); UI.ping(t.x, t.y, t.z, byPlayer); return true;
}
function sellTower(t) {
  if (!t || !t.alive || G.phase !== 'play') return false; const refund = Math.round(t.spent * .6);
  G.gold += refund; t.sell(); const i = G.towers.indexOf(t); if (i >= 0) G.towers.splice(i, 1); return true;
}

const AI = { think: .15, wait: 0, last: '' };
function aiThink(dt) {
  if (G.phase !== 'play' || UI.playerActive()) return;
  AI.think -= dt; if (AI.think > 0) return; AI.think = .5;
  const B = G.B, towers = G.towers.filter(t => t.alive), empty = B.pads.filter(p => !p.tower), N = towers.length;
  const cnt = { archer: 0, bombard: 0, spire: 0, guard: 0 }; for (const t of towers) cnt[t.kind]++;
  const ideal = { archer: .36, bombard: .22, spire: .2, guard: .22 };
  const lt = G.leakTypes; let air = 0, armor = 0, swarm = 0; for (const ty in lt) { const c = MON[ty].cat; if (c === 'air') air += lt[ty]; else if (c === 'armor') armor += lt[ty]; else if (c === 'swarm') swarm += lt[ty]; }
  const gatePress = sat(G.leaks / 8);
  const opts = [];
  for (const kind of TOWER_KINDS) {
    const def = TOWER[kind];
    let need = ideal[kind] * (N + 1.6) - cnt[kind] + .35;
    if (kind === 'archer') need += air * .2 + (N === 0 ? 1 : 0); if (kind === 'spire') need += air * .12 + armor * .1; if (kind === 'bombard') need += armor * .08 + swarm * .06 + (N >= 2 && cnt.bombard === 0 ? .5 : 0); if (kind === 'guard') need += swarm * .04 + (N >= 1 && cnt.guard === 0 ? .9 : 0);
    if (need <= 0) continue;
    for (const pad of empty) {
      const cov = padCoverage(pad, def.range[0]) / (def.range[0] * 2);
      let sc = need * (.55 + cov * .5);
      const rel = pad.s / B.L;
      if (N < 2) sc *= 1 - Math.abs(rel - .42) * .9;
      sc *= 1 + gatePress * (rel - .5) * .8;
      let syn = 0;
      for (const t of towers) { const d = Math.hypot(t.x - pad.x, t.z - pad.z); if (kind === 'guard' && t.kind !== 'guard' && d < t.range + 1.5) syn += .16; if (kind !== 'guard' && t.kind === 'guard' && d < def.range[0] + 1) syn += .2; if (t.kind === kind && d < 6) syn -= .12; }
      if (kind === 'guard') { sc *= .8 + .5 * rel; for (const t of towers) if (t.kind === 'guard' && Math.abs(t.pad.s - pad.s) < 9) syn -= .5; }
      sc *= 1 + syn;
      opts.push({ sc, cost: def.cost[0], act: 'build', kind, pad });
    }
  }
  for (const t of towers) {
    if (t.state !== 'active' || t.lvl >= 2) continue;
    const c = t.def.cost[t.lvl + 1], use = sat(t.recent / 60);
    let sc = (.5 + use * .9 + (t.lvl === 0 ? .12 : 0)) * (N >= 4 ? 1.25 : .7) * (empty.length === 0 ? 1.6 : 1) * (110 / c);
    if (t.kind === 'archer') sc *= 1 + air * .06; if (t.kind === 'spire') sc *= 1 + armor * .05;
    opts.push({ sc, cost: c, act: 'up', t });
  }
  if (!opts.length) return;
  opts.sort((a, b) => b.sc - a.sc);
  let pick = opts[0];
  if (pick.cost > G.gold) {
    AI.wait += .5;
    const aff = opts.find(o => o.cost <= G.gold && o.sc > pick.sc * (AI.wait > 9 ? .45 : .8));
    if (!aff) return; pick = aff;
  }
  AI.wait = 0;
  if (pick.act === 'build') buildTower(pick.pad, pick.kind, false); else upgradeTower(pick.t, false);
  AI.think = N < 3 ? .12 : .8;
}

function setPhase(p) {
  G.phase = p; G.phaseT = 0;
  if (p === 'clear') { G.advance = true; UI.banner('The pass holds', 3.2, false); UI.closeMenu(); }
  if (p === 'defeat') { UI.banner('The beacon is out', 4.2, true); UI.closeMenu(); sfx('beaconOut', G.B.beacon.x, G.B.beacon.z, 1.2); fxEmbers(G.B.beacon.x, G.B.beacon.y, G.B.beacon.z, 60, .8); for (let i = 0; i < 14; i++) fxSmoke(G.B.beacon.x + rr(-.4, .4), G.B.beacon.y + rr(0, 1), G.B.beacon.z + rr(-.4, .4), rr(-.3, .3), rr(.8, 2), rr(-.3, .3), rr(2, 4), 1, 2, .2, .2, .22, .6, { drag: .5, rise: .2 }); }
  if (p === 'crumble') startCrumble();
  if (p === 'rise') startRise();
}
function startCrumble() {
  const B = G.B;
  for (const m of G.mons) if (!m.dead) { shatter(e => rigMonster(e), m, [0, 1, 0], { spread: 1.2, life: 1 }); removeMonster(m); }
  for (const f of G.men) if (!f.dead) { f.weapon = KIT.item.blade; shatter(e => rigHuman(KIT.foot, SPEC.foot, e), f, [0, 1, 0], { spread: 1, life: 1 }); f.dead = f.gone = true; f.alive = false; if (f.flame) removeFlame(f.flame); }
  G.mons.length = 0; G.men.length = 0; G.arrows.length = 0; G.shells.length = 0; G.stuck.length = 0;
  for (const t of G.towers) {
    t.em.alive = false; LT.emitters[t.idx] = null; removeFlame(t.flame); removeFlame(t.flame2); t.flame = t.flame2 = null; t.archers.length = 0; t.alive = false; t.state = 'gone';
    let best = null, bd = 1e9; for (const p of B.pieces) if (p.kind === 'chunk') { const d = dist2(p.cx, p.cz, t.x, t.z); if (d < bd) { bd = d; best = p; } }
    if (best) best.mesh.attach(t.group);
  }
  for (const f of B.flames) removeFlame(f); B.flames.length = 0;
  for (const p of B.pieces) { p.t = 0; p.delay = .25 + rnd() * .9 + sat((36 - (p.cx + p.cz)) / 72) * 1.3 + (p.kind !== 'chunk' ? .2 : 0); p.vy = 0; }
  FX.groundAt = () => -500; clearFX(); setBoardCasting(B, true);
  sfx('crumble', 0, 0, 1.3); FX.shake = 1.2;
}
function startRise() {
  if (G.B) { for (const t of G.towers) { t.clearModel(false); } G.towers.length = 0; clearDebris(); disposeBoard(G.B); }
  for (let i = 0; i < LT.emitters.length; i++) LT.emitters[i] = null;
  const B = G.B = buildBoard(G.boardSeed++, G.boardIndex++);
  R.scene.add(B.group); activateBoard(B, false);
  setBoardCasting(B, true);
  for (const p of B.pieces) { p.t = 0; p.delay = sat((p.cx + p.cz + 36) / 72) * 1.7 + rnd() * .25 + (p.kind === 'chunk' ? 0 : 2.0 + rnd() * .3); p.mesh.visible = false; }
  sfx('rise', 0, 0, 1.2); UI.banner(B.bio.name, 3.6, false);
}
function activateBoard(B, lit) {
  B.flames = [];
  const b = B.beacon;
  B.beaconFlame = addFlame({ x: b.x, y: b.y - .12, z: b.z, size: 2.3, layers: 3, embers: 2.6, glow: 1.1, smoke: 5, on: lit ? 1 : 0 }); B.flames.push(B.beaconFlame);
  for (const f of B.fires) B.flames.push(addFlame(Object.assign({ x: f.x, y: f.y, z: f.z, size: f.size, embers: .5, glow: .8, on: lit ? 1 : 0 }, f.fx)));
  LT.beaconPos = b; LT.beaconOn = lit ? 1 : 0; LT.beaconLevel = 1; LT.envSrc = B.env.slice(0, LT.env.length); LT.envK = lit ? 1 : 0; setBiomeLook(B, lit);
  FX.groundAt = B.heightAt;
  G.padCov = null;
}
function beginBattle(first) {
  const B = G.B;
  G.lives = G.maxLives; G.gold = 300 + 80 * G.level; G.bountyMul = 1 + .18 * G.level; G.dmgMul = 1.55 + .2 * G.level; G.press = lerp(G.press, 1, .5); UI.goldShown = G.gold; G.k = 0; G.leaks = 0; G.leakTypes = {}; G.spawning = false; G.bossWave = false; G.nextIn = first ? .9 : 1.6; G.queue = []; AI.think = .15; AI.wait = 0;
  const n = 4 + Math.min(3, G.level);
  for (let i = 0; i < n; i++) spawnMonster(i === n - 1 && G.level > 0 ? 'knight' : 'skel', { s: B.cave.s + 2.2 + i * 1.15, lat: rr(-.7, .7), hpMul: 1 + .22 * G.level });
  G.phase = 'play'; G.phaseT = 0;
}
function updatePhase(dt) {
  G.phaseT += dt; const B = G.B, t = G.phaseT;
  updateBiomeLook(dt); LT.envK = damp(LT.envK, G.phase === 'crumble' ? 0 : (G.phase === 'rise' && t < 2.4 ? 0 : 1), 2, dt); LT.beaconMul = damp(LT.beaconMul, B.bio.beacon || 1, 2, dt);
  const want = G.phase === 'defeat' ? 0 : (G.phase === 'rise' ? (t > B.igniteAt ? 1 : 0) : 1);
  LT.beaconOn = damp(LT.beaconOn, want, want ? 3 : 1.6, dt);
  LT.beaconLevel = damp(LT.beaconLevel, G.lives / G.maxLives, 3, dt);
  if (B.beaconFlame) { const f = B.beaconFlame, lv = LT.beaconLevel; f.on = LT.beaconOn; f.size = 2.35 * (.42 + .58 * lv) * (1 - .32 * LT.beaconGutter); f.embers = 1 + 2 * lv + 6 * LT.beaconGutter; }
  for (let i = 1; i < B.flames.length; i++) B.flames[i].on = LT.beaconOn;
  if (G.phase === 'clear') { if (t > 2.6) setPhase('crumble'); }
  else if (G.phase === 'defeat') {
    for (const tw of G.towers) { tw.em.on = damp(tw.em.on, 0, 1.5 + tw.idx * .15, dt); if (tw.flame) tw.flame.on = tw.em.on; if (tw.flame2) tw.flame2.on = tw.em.on; }
    if (t > 4.4) { G.level = 0; G.press = Math.max(.8, G.press * .85); G.run++; setPhase('crumble'); }
  } else if (G.phase === 'crumble') {
    let done = true;
    for (const p of B.pieces) {
      const u = t - p.delay;
      if (u < 0) { p.mesh.position.set(p.cx + rr(-.03, .03) * sat(t * 2), p.cy, p.cz + rr(-.03, .03) * sat(t * 2)); done = false; continue; }
      const y = p.cy - 9 * u * u - u * 1.2; p.mesh.position.set(p.cx, y, p.cz); p.mesh.rotation.set(p.spin.x * u * .5, p.spin.y * u * .25, p.spin.z * u * .5);
      if (!p.dusted) { p.dusted = true; fxDust(p.cx, 0, p.cz, 5, 2.2, { speed: 2.5, life: 1.4 }); FX.shake = Math.min(1, FX.shake + .12); }
      if (y > -60) done = false; else p.mesh.visible = false;
    }
    if (done || t > 5.2) { if (G.advance) { G.level++; G.advance = false; } setPhase('rise'); }
  } else if (G.phase === 'rise') {
    let done = true;
    for (const p of B.pieces) {
      const u = (t - p.delay) / (p.kind === 'chunk' ? 1.15 : .8);
      if (u < 0) { done = false; continue; }
      p.mesh.visible = true;
      if (u >= 1) { p.mesh.position.set(p.cx, p.cy, p.cz); p.mesh.rotation.set(0, 0, 0); if (!p.set) { p.set = true; if (p.kind !== 'chunk') { fxDust(p.cx, p.cy + .2, p.cz, 12, 2.2, { speed: 3 }); FX.shake = Math.min(1, FX.shake + .3); sfx('hammer', p.cx, p.cz, 1, .1); } } continue; }
      done = false; const e = easeOut(u), k = 1 - e;
      if (p.kind === 'chunk') { p.mesh.position.set(p.cx, p.cy - 30 * k, p.cz); p.mesh.rotation.set(p.spin.x * k * .7, p.spin.y * k * .5, p.spin.z * k * .7); }
      else { const d = 1 - u * u; p.mesh.position.set(p.cx, p.cy + 16 * d, p.cz); p.mesh.rotation.set(0, 0, 0); }
    }
    if (done && !B.igniteAt) { B.igniteAt = t + .25; }
    if (B.igniteAt && t > B.igniteAt && !B.lit) { B.lit = true; sfx('ignite', B.beacon.x, B.beacon.z, 1.3, 1); lightFlash(B.beacon.x, B.beacon.y + 1, B.beacon.z, 0xffa050, 2600, .7, 60); fxEmbers(B.beacon.x, B.beacon.y, B.beacon.z, 50, .6); FX.shake = .5; }
    if (B.lit && t > B.igniteAt + .7) { setBoardCasting(B, false); beginBattle(false); }
  }
}

const PX = (() => {
  const LINE = 9, CAP = 7, GAP = 1, CACHE_MAX = 500;

  const SRC = {
    '!': '#/#/#/#/#/./#',
    '"': '#.#/#.#',
    '#': '.#.#./.#.#./#####/.#.#./#####/.#.#./.#.#.',
    '$': '..#../.####/#.#../.###./..#.#/####./..#..',
    '%': '##.../##..#/...#./..#../.#.../#..##/...##',
    '&': '.##../#..#./#.#../.#.../#.#.#/#..#./.##.#',
    "'": '#/#',
    '(': '.#/#./#./#./#./#./.#',
    ')': '#./.#/.#/.#/.#/.#/#.',
    '*': '1:#.#/.#./#.#',
    '+': '2:.#./###/.#.',
    ',': '5:.#/.#/#.',
    '-': '3:###',
    '.': '6:#',
    '/': '..#/..#/.#./.#./.#./#../#..',
    '0': '.###./#...#/#..##/#.#.#/##..#/#...#/.###.',
    '1': '..#../.##../..#../..#../..#../..#../.###.',
    '2': '.###./#...#/....#/...#./..#../.#.../#####',
    '3': '.###./#...#/....#/..##./....#/#...#/.###.',
    '4': '...#./..##./.#.#./#..#./#####/...#./...#.',
    '5': '#####/#..../####./....#/....#/#...#/.###.',
    '6': '..##./.#.../#..../####./#...#/#...#/.###.',
    '7': '#####/....#/...#./..#../..#../..#../..#..',
    '8': '.###./#...#/#...#/.###./#...#/#...#/.###.',
    '9': '.###./#...#/#...#/.####/....#/...#./.##..',
    ':': '2:#/././#',
    ';': '2:.#/../../.#/.#/#.',
    '<': '1:..#/.#./#../.#./..#',
    '=': '2:###/.../###',
    '>': '1:#../.#./..#/.#./#..',
    '?': '.###./#...#/....#/...#./..#../...../..#..',
    '@': '.###./#...#/#.###/#.#.#/#.###/#..../.###.',
    'A': '.###./#...#/#...#/#####/#...#/#...#/#...#',
    'B': '####./#...#/#...#/####./#...#/#...#/####.',
    'C': '.###./#...#/#..../#..../#..../#...#/.###.',
    'D': '####./#...#/#...#/#...#/#...#/#...#/####.',
    'E': '#####/#..../#..../####./#..../#..../#####',
    'F': '#####/#..../#..../####./#..../#..../#....',
    'G': '.###./#...#/#..../#.###/#...#/#...#/.###.',
    'H': '#...#/#...#/#...#/#####/#...#/#...#/#...#',
    'I': '###/.#./.#./.#./.#./.#./###',
    'J': '...#/...#/...#/...#/...#/#..#/.##.',
    'K': '#...#/#..#./#.#../##.../#.#../#..#./#...#',
    'L': '#.../#.../#.../#.../#.../#.../####',
    'M': '#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#',
    'N': '#...#/#...#/##..#/#.#.#/#..##/#...#/#...#',
    'O': '.###./#...#/#...#/#...#/#...#/#...#/.###.',
    'P': '####./#...#/#...#/####./#..../#..../#....',
    'Q': '.###./#...#/#...#/#...#/#.#.#/#..#./.##.#',
    'R': '####./#...#/#...#/####./#.#../#..#./#...#',
    'S': '.###./#...#/#..../.###./....#/#...#/.###.',
    'T': '#####/..#../..#../..#../..#../..#../..#..',
    'U': '#...#/#...#/#...#/#...#/#...#/#...#/.###.',
    'V': '#...#/#...#/#...#/#...#/#...#/.#.#./..#..',
    'W': '#...#/#...#/#...#/#.#.#/#.#.#/#.#.#/.#.#.',
    'X': '#...#/#...#/.#.#./..#../.#.#./#...#/#...#',
    'Y': '#...#/#...#/.#.#./..#../..#../..#../..#..',
    'Z': '#####/....#/...#./..#../.#.../#..../#####',
    '[': '##/#./#./#./#./#./##',
    '\\': '#../#../.#./.#./.#./..#/..#',
    ']': '##/.#/.#/.#/.#/.#/##',
    '^': '.#./#.#',
    '_': '7:####',
    '`': '#./.#',
    'a': '2:.###./....#/.####/#...#/.####',
    'b': '#..../#..../####./#...#/#...#/#...#/####.',
    'c': '2:.###/#.../#.../#.../.###',
    'd': '....#/....#/.####/#...#/#...#/#...#/.####',
    'e': '2:.###./#...#/#####/#..../.###.',
    'f': '..##/.#../####/.#../.#../.#../.#..',
    'g': '2:.####/#...#/#...#/#...#/.####/....#/.###.',
    'h': '#..../#..../####./#...#/#...#/#...#/#...#',
    'i': '#/./#/#/#/#/#',
    'j': '..#/.../..#/..#/..#/..#/..#/..#/##.',
    'k': '#.../#.../#..#/#.#./##../#.#./#..#',
    'l': '#./#./#./#./#./#./.#',
    'm': '2:####./#.#.#/#.#.#/#.#.#/#.#.#',
    'n': '2:####./#...#/#...#/#...#/#...#',
    'o': '2:.###./#...#/#...#/#...#/.###.',
    'p': '2:####./#...#/#...#/#...#/####./#..../#....',
    'q': '2:.####/#...#/#...#/#...#/.####/....#/....#',
    'r': '2:#.##/##../#.../#.../#...',
    's': '2:.####/#..../.###./....#/####.',
    't': '1:.#../####/.#../.#../.#../..##',
    'u': '2:#...#/#...#/#...#/#...#/.####',
    'v': '2:#...#/#...#/#...#/.#.#./..#..',
    'w': '2:#...#/#...#/#.#.#/#.#.#/.#.#.',
    'x': '2:#...#/.#.#./..#../.#.#./#...#',
    'y': '2:#...#/#...#/#...#/#...#/.####/....#/.###.',
    'z': '2:#####/...#./..#../.#.../#####',
    '{': '..#/.#./.#./#../.#./.#./..#',
    '|': '#/#/#/#/#/#/#',
    '}': '#../.#./.#./..#/.#./.#./#..',
    '~': '2:.#.../#.#.#/...#.',
    '·': '3:#',
    '×': '3:#.#/.#./#.#',
    '←': '1:..#../.#.../#####/.#.../..#..',
    '→': '1:..#../...#./#####/...#./..#..',
    '↑': '..#../.###./#.#.#/..#../..#../..#../..#..',
    '↓': '..#../..#../..#../..#../#.#.#/.###./..#..',
    '–': '3:####',
    '…': '6:#.#.#',
  };
  const UNKNOWN_SRC = '1:####/#..#/#..#/#..#/#..#/####';

  function parse(def) {
    let off = 0, s = def;
    if (s.length > 1 && s[1] === ':' && s[0] >= '0' && s[0] <= '9') { off = +s[0]; s = s.slice(2); }
    const rows = s.split('/');
    let w = 0;
    for (const r of rows) if (r.length > w) w = r.length;
    const bits = new Uint8Array(LINE);
    for (let i = 0; i < rows.length && off + i < LINE; i++) {
      const r = rows[i]; let b = 0;
      for (let x = 0; x < r.length; x++) if (r[x] === '#') b |= 1 << x;
      bits[off + i] = b;
    }
    return { w, bits };
  }

  const glyphs = new Map();
  glyphs.set(' ', { w: 3, bits: new Uint8Array(LINE) });
  for (const ch in SRC) glyphs.set(ch, parse(SRC[ch]));
  const UNKNOWN = parse(UNKNOWN_SRC);

  function measure(str) {
    str = String(str);
    let w = 0, n = 0;
    for (const ch of str) { w += (glyphs.get(ch) || UNKNOWN).w + GAP; n++; }
    return n ? w - GAP : 0;
  }

  const cache = new Map();
  const DIRS = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

  function remember(key, entry) {
    cache.set(key, entry);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    return entry;
  }

  function run(str, color, shadow, outline) {
    const key = 't\u0001' + str + '\u0001' + color + '\u0001' + shadow + '\u0001' + outline;
    const hit = cache.get(key);
    if (hit) { cache.delete(key); cache.set(key, hit); return hit; }
    const gl = [];
    let w = 0;
    for (const ch of str) { const g = glyphs.get(ch) || UNKNOWN; gl.push(g); w += g.w + GAP; }
    if (gl.length) w -= GAP;
    const o = outline ? 1 : 0, sh = shadow ? 1 : 0;
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, w + 2 * o + sh);
    cv.height = LINE + 2 * o + sh;
    const c = cv.getContext('2d');
    const paint = (dx, dy) => {
      let x = o + dx;
      for (const g of gl) {
        for (let r = 0; r < LINE; r++) {
          let b = g.bits[r], cx = 0;
          while (b) { if (b & 1) c.fillRect(x + cx, o + r + dy, 1, 1); b >>= 1; cx++; }
        }
        x += g.w + GAP;
      }
    };
    if (shadow) {
      c.fillStyle = shadow;
      paint(1, 1);
      if (outline) for (const d of DIRS) paint(d[0] + 1, d[1] + 1);
    }
    if (outline) { c.fillStyle = outline; for (const d of DIRS) paint(d[0], d[1]); }
    c.fillStyle = color;
    paint(0, 0);
    return remember(key, { cv, w, o });
  }

  const NOOPT = {};

  function text(ctx, str, x, y, s, color, opts) {
    str = String(str);
    if (!str.length) return 0;
    s = Math.max(1, Math.round(s || 1));
    const op = opts || NOOPT;
    const e = run(str, color || '#ffffff', op.shadow || '', op.outline || '');
    const wpx = e.w * s;
    let dx = x;
    if (op.align === 'c') dx = x - wpx / 2; else if (op.align === 'r') dx = x - wpx;
    dx = Math.round(dx); const dy = Math.round(y);
    const a = op.alpha === undefined ? 1 : op.alpha;
    if (a <= 0) return wpx;
    if (ctx.imageSmoothingEnabled) ctx.imageSmoothingEnabled = false;
    const ga = ctx.globalAlpha;
    if (a < 1) ctx.globalAlpha = ga * a;
    ctx.drawImage(e.cv, dx - e.o * s, dy - e.o * s, e.cv.width * s, e.cv.height * s);
    if (a < 1) ctx.globalAlpha = ga;
    return wpx;
  }

  const PAL = {
    G: '#e8b04a', g: '#a8742a', Y: '#ffe2a0',
    B: '#e9dfc8', b: '#b9ad93',
    E: '#ff8a3c', e: '#c9481e', d: '#7a2a14',
    C: '#8fc7ff', c: '#4f86c6',
    S: '#9aa3b0', s: '#5b6472', k: '#353b49',
    W: '#8a6a48', w: '#5a4330',
    o: '#0b0d14',
  };

  const ICONS = {
    coin: [
      '..oooo..',
      '.oYYGGo.',
      'oYGGGGgo',
      'oYGgGGgo',
      'oGGgGGgo',
      'oGGGGggo',
      '.oGgggo.',
      '..oooo..',
    ],
    flame: [
      '....o...',
      '...oEo..',
      '...oEEo.',
      '..oEEEo.',
      '.oEEYEEo',
      'oEEYYEEo',
      'oEYYYYEo',
      'oeEYYEeo',
      '.oeEEeo.',
      '..oooo..',
    ],
    skull: [
      '..ooooo..',
      '.oBBBBBo.',
      'oBBBBBBBo',
      'oBooBooBo',
      'oBooBooBo',
      'oBBBoBBbo',
      '.oBBBBbo.',
      '.oBoBobo.',
      '..ooooo..',
    ],
    banner: [
      'S.......',
      'Wddddddd',
      'WeEEEEEe',
      'WeEEYEEe',
      'WeEYEYEe',
      'WeEEYEEe',
      'WeEEEEEe',
      'WeEe.eEe',
      'Wed...de',
      'W.......',
    ],
    hourglass: [
      'WWWWWWW',
      '.S...S.',
      '.SGGGS.',
      '..SGS..',
      '...S...',
      '..SGS..',
      '.S.G.S.',
      '.SGGGS.',
      'WWWWWWW',
    ],
    sound: [
      '...B......',
      '..BB...G..',
      'BBBB....G.',
      'BBBB.G..G.',
      'BBBB.G..G.',
      'BBBB....G.',
      '..bb...G..',
      '...b......',
    ],
    mute: [
      '...B......',
      '..BB......',
      'BBBB.e..e.',
      'BBBB..ee..',
      'BBBB..ee..',
      'BBBB.e..e.',
      '..bb......',
      '...b......',
    ],
    archer: [
      '...WW........',
      '...bWWW......',
      '...b..WW.....',
      '...b...WW....',
      '...b....W.E..',
      '...b....WEYE.',
      'bBSSSSSSSSYYE',
      '...b....WEYE.',
      '...b....W.E..',
      '...b...WW....',
      '...b..WW.....',
      '...bWWW......',
      '...WW........',
    ],
    bombard: [
      '.............',
      '...........S.',
      '.........Sso.',
      '.......SSSso.',
      '.E...SSSSsks.',
      '.e.SSSSsssk..',
      '.SSSSssss....',
      'sSSssssww....',
      'sssssooowww..',
      '.sswoWWWowww.',
      '...woWSWowww.',
      '....oWWWo....',
      '.....ooo.....',
    ],
    spire: [
      '.....C.......',
      '....CCc......',
      '....CCc....C.',
      '.....c....CC.',
      '.........CC..',
      '....sSk.CCCC.',
      '....sSk...Cc.',
      '....sCk..Cc..',
      '....sSk..c...',
      '...ssSkk.....',
      '...sSSSk.....',
      '..ssSSSkk....',
      '..sssskkk....',
    ],
    guard: [
      '..........oB.',
      '.sssssss.oBBo',
      '.sCCCCCCoBBo.',
      '.sCCCCCoBBo..',
      '.sCCccoBBo.s.',
      '.sCCcoBBocCs.',
      '.sCo.BBocCCs.',
      '.sGGoBocCCCs.',
      '..GGGocCCCs..',
      '.oGoGGoCCCs..',
      'oGo.sGocCs...',
      '.o...sscs....',
      '......ss.....',
    ],
    upgrade: [
      '....Y....',
      '...YGG...',
      '..YG.GG..',
      '.YG...GG.',
      '....G....',
      '...GGg...',
      '..GG.gg..',
      '.GG...gg.',
      '.........',
    ],
    sell: [
      '..ooooo..',
      '.oYYGGGo.',
      '.oYGgGGo.',
      '.oGGgGgo.',
      '.oGGGggo.',
      '..ooooo..',
      '..EEEEE..',
      '...EeE...',
      '....e....',
    ],
    helm: [
      '....E....',
      '..SSSSS..',
      '.SBSSSSs.',
      '.SSSSSSs.',
      '.SooSoos.',
      '.SS.S.ss.',
      '.SS.S.ss.',
      '..S...s..',
    ],
    hand: [
      '...oo....',
      '..oBBo...',
      '..oBBo...',
      '..oBBooo.',
      '..oBBbBbo',
      'ooBBBbBbo',
      'oBBBBBBBo',
      '.oBBBBbo.',
      '..ooooo..',
    ],
    star: [
      '..Y..',
      'YGGGG',
      '.GGG.',
      'GG.Gg',
      'G...g',
    ],
    starEmpty: [
      '..s..',
      'sssss',
      '.sss.',
      'ss.ss',
      's...s',
    ],
  };

  const iconMeta = {};
  for (const name in ICONS) {
    const rows = ICONS[name];
    let w = 0;
    for (const r of rows) if (r.length > w) w = r.length;
    iconMeta[name] = [w, rows.length];
  }

  function iconCanvas(name) {
    const key = 'i\u0001' + name;
    const hit = cache.get(key);
    if (hit) { cache.delete(key); cache.set(key, hit); return hit; }
    const rows = ICONS[name], m = iconMeta[name];
    const cv = document.createElement('canvas');
    cv.width = m[0]; cv.height = m[1];
    const c = cv.getContext('2d');
    for (let y = 0; y < rows.length; y++) {
      const r = rows[y];
      for (let x = 0; x < r.length; x++) {
        const col = PAL[r[x]];
        if (col) { c.fillStyle = col; c.fillRect(x, y, 1, 1); }
      }
    }
    return remember(key, { cv });
  }

  function icon(ctx, name, x, y, s, alpha) {
    if (!ICONS[name]) return;
    const a = alpha === undefined ? 1 : alpha;
    if (a <= 0) return;
    s = Math.max(1, Math.round(s || 1));
    const e = iconCanvas(name);
    if (ctx.imageSmoothingEnabled) ctx.imageSmoothingEnabled = false;
    const ga = ctx.globalAlpha;
    if (a < 1) ctx.globalAlpha = ga * a;
    ctx.drawImage(e.cv, Math.round(x), Math.round(y), e.cv.width * s, e.cv.height * s);
    if (a < 1) ctx.globalAlpha = ga;
  }

  function iconSize(name) {
    const m = iconMeta[name];
    return m ? [m[0], m[1]] : [0, 0];
  }

  return { LINE, CAP, measure, text, icon, iconSize, icons: Object.keys(ICONS), palette: PAL };
})();


const UI = (() => {
  const U = {
    ctx: null, s: 3, insetTop: 0, goldShown: 0, hurt: 0, coins: [], msg: null, hover: null, menu: null, armed: null, idle: 99, mx: -1, my: -1, inside: false,
    btns: [], hotBtn: null, press: null, gp: { sel: -1, t: 0, prev: [] , active: false }, goldBump: 0, deny: 0, hintT: 0, titleT: 0, rangeMesh: null, padMesh: null, soundRect: null, cmdRect: null, manual: false, moved: 99, focus: 0, slainBump: 0, lastSlain: 0,
    touch: false, ptrs: new Map(), gest: null, lastTap: { t: -9, x: 0, y: 0 }, waveRect: null, followRect: null, menuRect: null, wake: null, panning: false,
    hud: [], tips: [], tip: null, keys: new Set(), sndArmed: false, vvT: 0, vvN: 0,
  };
  const COLR = { bg: 'rgba(9,11,17,0.86)', bg2: 'rgba(24,27,38,0.94)', bd: '#5d4c35', bdHi: '#e8b04a', tx: '#efe4cd', dim: '#a79e8a', amber: '#e8b04a', ember: '#ff8a3c', cold: '#8fc7ff', red: '#e5553c', dark: '#0b0d14', ok: '#9fd08a' };
  const _pv = new THREE.Vector3(), _o = new THREE.Vector3(), _d = new THREE.Vector3();
  function proj(x, y, z) { _pv.set(x, y, z).project(R.cam); return { x: (_pv.x * .5 + .5) * R.dw, y: (1 - (_pv.y * .5 + .5)) * R.dh }; }
  U.proj = proj;
  U.playerActive = () => U.manual;
  U.setManual = on => { U.manual = !!on; if (!on) { U.menu = null; U.armed = null; } };
  U.banner = (text, dur, big) => { U.msg = { text, t: 0, dur, big }; };
  U.ping = (x, y, z, byPlayer) => { fxTimed(4, x, y + .12, z, 5, 5, byPlayer ? 1.0 : 1.5, byPlayer ? 1.4 : 1.1, byPlayer ? 1.8 : .5, .7, .55, { ground: true }); };
  U.closeMenu = () => { U.menu = null; U.armed = null; };
  U.coinFrom = (x, y, z, value) => {
    if (U.coins.length > 70) { U.goldShown += value; return; }
    const p = proj(x, y, z); U.coins.push({ sx: p.x, sy: p.y, t: 0, T: rr(.55, .8), value, cx: p.x + rr(-60, 60) * U.s, cy: p.y - rr(30, 70) * U.s });
  };

  function plate(x, y, w, h, o = {}) {
    const c = U.ctx, s = U.s; x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    c.fillStyle = o.bd || COLR.bd; c.fillRect(x + s, y, w - 2 * s, h); c.fillRect(x, y + s, w, h - 2 * s);
    c.fillStyle = o.bg || COLR.bg; c.fillRect(x + 2 * s, y + s, w - 4 * s, h - 2 * s); c.fillRect(x + s, y + 2 * s, w - 2 * s, h - 4 * s);
    if (o.hi) { c.fillStyle = o.hi; c.fillRect(x + 2 * s, y + s, w - 4 * s, s); }
  }
  function text(str, x, y, col, o) { return PX.text(U.ctx, str, x, y, U.s, col || COLR.tx, o); }
  const tw = str => PX.measure(str) * U.s;

  function initUI() {
    const cv = document.getElementById('hud'); U.ctx = cv.getContext('2d'); U.ctx.imageSmoothingEnabled = false;
    const mk = (seg, col) => {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((seg + 1) * 6), 3)); const idx = [];
      for (let i = 0; i < seg; i++) { const a = i * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); } g.setIndex(idx);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .5, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6, side: THREE.DoubleSide }));
      m.frustumCulled = false; m.visible = false; m.renderOrder = 6; m.seg = seg; R.scene.add(m); return m;
    };
    U.rangeMesh = mk(96, new THREE.Color(1.5, 1.15, .6)); U.padMesh = mk(40, new THREE.Color(2.2, 1.7, .9));
    U.touch = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
    const D = () => R.dpr || 1, pos = e => [e.clientX * D(), e.clientY * D()];
    window.addEventListener('pointerdown', e => {
      const [x, y] = pos(e); U.touch = e.pointerType !== 'mouse'; U.mx = x; U.my = y; U.inside = true; U.gp.active = false; U.moved = 0;
      U.ptrs.set(e.pointerId, { x, y, x0: x, y0: y });
      audioGesture();
      CAM.za = null;
      if (U.ptrs.size === 1) { const b = btnAt(x, y); U.gest = { mode: 'tap', hud: !!b || hudAt(x, y), btn: b }; U.press = b ? b.id : null; }
      else if (U.ptrs.size === 2) { const [a, b] = [...U.ptrs.values()]; U.gest = { mode: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; U.press = null; }
      e.preventDefault();
    }, { passive: false });
    window.addEventListener('pointermove', e => {
      const [x, y] = pos(e), p = U.ptrs.get(e.pointerId);
      if (e.pointerType === 'mouse' || p) { U.mx = x; U.my = y; U.inside = true; U.moved = 0; U.gp.active = false; }
      if (!p) return;
      const g = U.gest;
      if (g && g.mode === 'pinch' && U.ptrs.size >= 2) {
        p.x = x; p.y = y; const [a, b] = [...U.ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y) || 1, cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        camPan(cx - g.cx, cy - g.cy); camZoomAt(d / g.d, cx, cy); g.d = d; g.cx = cx; g.cy = cy; return;
      }
      if (g && g.mode === 'tap' && !g.hud && Math.hypot(x - p.x0, y - p.y0) > (U.touch ? 10 : 6) * D()) { g.mode = 'pan'; U.press = null; }
      if (g && g.mode === 'pan') camPan(x - p.x, y - p.y);
      p.x = x; p.y = y;
    });
    const up = e => {
      const p = U.ptrs.get(e.pointerId); if (!p) return; U.ptrs.delete(e.pointerId); audioGesture(); U.keepAwake();
      const g = U.gest;
      if (U.ptrs.size === 0) { if (g && g.mode === 'tap' && e.type === 'pointerup') onTap(p.x, p.y, g.btn); U.gest = null; U.press = null; if (U.touch) U.inside = false; }
      else if (g && g.mode === 'pinch') U.gest = { mode: 'pan' };
    };
    window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    window.addEventListener('pointerleave', () => { if (!U.ptrs.size) U.inside = false; });
    document.addEventListener('mouseleave', () => { if (!U.ptrs.size) U.inside = false; });
    window.addEventListener('wheel', e => { const [x, y] = pos(e), d = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY; camZoomTo(camZoomNow() * Math.exp(-clamp(d, -160, 160) * (e.ctrlKey ? .012 : .0024)), x, y, 16); e.preventDefault(); }, { passive: false });
    const stop = e => { if (e.cancelable) e.preventDefault(); };
    for (const ev of ['touchmove', 'touchcancel', 'dblclick', 'gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, stop, { passive: false });
    document.addEventListener('touchstart', e => {
      stop(e); const n = e.touches.length;
      if (n < U.ptrs.size) { const keys = [...U.ptrs.keys()]; for (let i = 0; i < keys.length - n; i++) U.ptrs.delete(keys[i]); if (U.ptrs.size <= 1) { const p = [...U.ptrs.values()][0]; U.gest = p ? { mode: 'tap', hud: !!btnAt(p.x, p.y) || hudAt(p.x, p.y) } : null; } }
    }, { passive: false });
    document.addEventListener('touchend', e => { audioGesture(); stop(e); if (!e.touches.length && U.ptrs.size) setTimeout(() => { if (U.ptrs.size) U.dropTouches(); }, 80); }, { passive: false });
    if (window.visualViewport) for (const ev of ['resize', 'scroll']) window.visualViewport.addEventListener(ev, fixPageZoom);
    try { if (localStorage.getItem('cinderwatch.muted') === '1') AU.muted = true; G.best = +localStorage.getItem('cinderwatch.best') || 0; } catch (e) {}
    window.addEventListener('keyup', e => { U.keys.delete(e.code); });
    window.addEventListener('blur', () => U.keys.clear());
    window.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('keydown', e => {
      if (PAN[e.code] && !e.ctrlKey && !e.metaKey && !e.altKey) { U.keys.add(e.code); e.preventDefault(); }
      if (e.repeat) return; audioGesture(); U.keepAwake(); U.touch = false;
      const k = e.key;
      if (k >= '1' && k <= '4') { pickKind(TOWER_KINDS[+k - 1]); e.preventDefault(); }
      else if (k === ' ' || k === 'Enter') { callWave(); e.preventDefault(); }
      else if (k === 'Escape') { U.closeMenu(); }
      else if (k === 'u' || k === 'U') { const t = (U.menu && U.menu.tower) || (U.hover && U.hover.tower); if (t) { touchInput(); doUpgrade(t); } }
      else if (k === 'x' || k === 'X' || k === 'Delete' || k === 'Backspace') { const t = U.menu && U.menu.tower; if (t) { touchInput(); if (U.menu.sellArm) doSell(t); else { U.menu.sellArm = true; sfx('uiHover', t.x, t.z, .8); } } }
      else if (k === 'p' || k === 'P') { togglePause(); }
      else if (k === 'Tab') { cycleSpeed(); e.preventDefault(); }
      else if (k === '0') { camReset(); }
      else if (k === 'm' || k === 'M') { setMute(!AU.muted); }
      else if (k === '+' || k === '=') { camZoomBy(1.4); }
      else if (k === '-' || k === '_') { camZoomBy(1 / 1.4); }
      else if (k === 'c' || k === 'C') { toggleCommand(); }
      else if (k === 'f' || k === 'F' || k === 'Home') { camReset(); }
    });
  }
  const PAN = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1], KeyA: [1, 0], KeyD: [-1, 0], KeyW: [0, 1], KeyS: [0, -1] };
  function togglePause() { G.paused = !G.paused; sfx('uiClick', CAM.x, CAM.z, .6); }
  function cycleSpeed() { G.speed = G.speed % 3 + 1; if (G.paused) G.paused = false; sfx('uiClick', CAM.x, CAM.z, .6); }
  function soundTap() { if (AU.ready && U.sndArmed) setMute(!AU.muted); }
  U.sawMonster = type => { if (G.seen[type]) return; G.seen[type] = 1; if (MON[type].tip && U.tips.length < 4) U.tips.push(type); };
  U.keepAwake = () => { try { if (navigator.wakeLock && !document.hidden && (!U.wake || U.wake.released)) navigator.wakeLock.request('screen').then(w => { U.wake = w; }, () => {}); } catch (e) {} };
  U.dropTouches = () => { U.ptrs.clear(); U.gest = null; U.press = null; if (U.touch) U.inside = false; };
  function fixPageZoom() {
    const vv = window.visualViewport, m = document.getElementById('vp'); if (!vv || !m || Math.abs(vv.scale - 1) < .02) { U.vvN = 0; return; }
    const now = performance.now(); if (now - U.vvT < 250 || U.vvN > 12) return; U.vvT = now; U.vvN++;
    const c = 'width=device-width,initial-scale=1,minimum-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover';
    m.setAttribute('content', c + ',shrink-to-fit=no'); setTimeout(() => { m.setAttribute('content', c); try { window.scrollTo(0, 0); } catch (e) {} resizeRenderer(); }, 40);
  }
  function setMute(b) { AU.setMuted(b); try { localStorage.setItem('cinderwatch.muted', b ? '1' : '0'); } catch (e) {} }
  function fullscreenOK() { const d = document; return !!(d.fullscreenEnabled || d.webkitFullscreenEnabled) && !(window.navigator.standalone); }
  function isFull() { const d = document; return !!(d.fullscreenElement || d.webkitFullscreenElement); }
  function toggleFull() {
    const d = document, el = d.documentElement;
    try { if (isFull()) (d.exitFullscreen || d.webkitExitFullscreen).call(d); else { const r = (el.requestFullscreen || el.webkitRequestFullscreen).call(el, { navigationUI: 'hide' }); if (r && r.catch) r.catch(() => {}); } } catch (e) {}
  }
  function buzz(p) { if (U.touch && navigator.vibrate) { try { navigator.vibrate(p); } catch (e) {} } }
  function inRect(r, x, y, min = 0) {
    if (!r) return false; const m = min * (R.dpr || 1), mw = Math.max(0, m - r.w) / 2, mh = Math.max(0, m - r.h) / 2;
    return x >= r.x - mw && x <= r.x + r.w + mw && y >= r.y - mh && y <= r.y + r.h + mh;
  }
  function btnAt(x, y) { const m = U.touch ? 44 : 0; for (const b of U.btns) if (inRect(b, x, y, m)) return b; for (const b of U.hud) if (inRect(b, x, y, m)) return b; return null; }
  function hudAt(x, y) { return inRect(U.menuRect, x, y, 0); }
  function callWave() { touchInput(); if (callWaveEarly()) { sfx('uiClick', CAM.x, CAM.z, .8); buzz(10); } else sfx('uiDeny', CAM.x, CAM.z, .5); }
  function audioGesture() { if (!AU.ready) AU.unlock(); }
  function touchInput() { U.idle = 0; U.manual = true; }
  function toggleCommand() { U.setManual(!U.manual); U.idle = 0; sfx('uiClick', CAM.x, CAM.z, .8); }
  function deny() { U.deny = 1; sfx('uiDeny', CAM.x, CAM.z, .6); buzz([18, 40, 18]); }
  function doBuild(pad, kind) { touchInput(); if (buildTower(pad, kind, true)) { sfx('uiClick', pad.x, pad.z, .8); buzz(12); U.menu = null; U.armed = null; return true; } deny(); return false; }
  function doUpgrade(t) { if (upgradeTower(t, true)) { sfx('uiClick', t.x, t.z, .8); buzz(12); U.menu = null; return true; } deny(); return false; }
  function doSell(t) { if (sellTower(t)) { U.menu = null; return true; } return false; }
  function pickKind(kind) {
    touchInput();
    if (U.menu && U.menu.pad && !U.menu.pad.tower) { doBuild(U.menu.pad, kind); return; }
    if (U.hover && !U.hover.tower) { doBuild(U.hover.pad, kind); return; }
    if (U.gp.active && U.gp.sel >= 0 && !G.B.pads[U.gp.sel].tower) { doBuild(G.B.pads[U.gp.sel], kind); return; }
    U.armed = U.armed === kind ? null : kind; U.menu = null; sfx('uiHover', CAM.x, CAM.z, .7);
  }
  function pickPad(mx, my) {
    if (!G.B || G.phase !== 'play') return null;
    const cam = R.cam; _o.set(mx / R.dw * 2 - 1, 1 - my / R.dh * 2, -1).unproject(cam); cam.getWorldDirection(_d);
    let best = null, bd = 1e9; const slop = U.touch ? clamp(24 * (R.viewW || 40) / (R.cssW || 800), 1.55, 2.3) : 1.55;
    for (const pad of G.B.pads) {
      const top = pad.tower ? Math.min(3.4, pad.tower.mounts ? pad.tower.mounts.top : 2) : .1;
      for (let h = 0; h <= top; h += .6) {
        const t = (pad.y + h - _o.y) / _d.y, x = _o.x + _d.x * t, z = _o.z + _d.z * t, d = Math.hypot(x - pad.x, z - pad.z), r = h === 0 ? slop : slop - .55;
        if (d < r && d + h * .01 < bd) { bd = d; best = pad; }
      }
    }
    return best ? { pad: best, tower: best.tower } : null;
  }
  function onTap(x, y, held) {
    const now = performance.now();
    const b = held && inRect(held, x, y, U.touch ? 44 : 8) ? held : btnAt(x, y); if (b) { if (!b.hud) touchInput(); b.fn(); return; }
    if (inRect(U.menuRect, x, y, 0)) return;
    const h = pickPad(x, y);
    if (h) {
      touchInput(); U.lastTap.t = -9;
      if (!h.tower && U.armed) { doBuild(h.pad, U.armed); return; }
      if (U.menu && U.menu.pad === h.pad) { U.menu = null; return; }
      U.menu = { pad: h.pad, tower: h.tower, t: 0, focus: 0, sel: null, sellArm: false }; U.armed = null; sfx('uiHover', h.pad.x, h.pad.z, .9); buzz(6); return;
    }
    if (U.menu || U.armed) { U.menu = null; U.armed = null; U.lastTap.t = -9; return; }
    if (now - U.lastTap.t < 330 && Math.hypot(x - U.lastTap.x, y - U.lastTap.y) < 40 * (R.dpr || 1)) { U.lastTap.t = -9; if (CAM.man && CAM.mzoom > 1.3) camReset(); else camZoomTo(Math.max(1.9, (CAM.man ? CAM.mzoom : CAM.zoom) * 1.6), x, y); }
    else { U.lastTap.t = now; U.lastTap.x = x; U.lastTap.y = y; }
  }
  function setRing(mesh, cx, cz, radius, width) {
    const P = mesh.geometry.attributes.position, a = P.array, H = G.B.heightAt, n = mesh.seg;
    for (let i = 0; i <= n; i++) { const t = i / n * TAU, c = Math.cos(t), s = Math.sin(t); for (let k = 0; k < 2; k++) { const r = radius + (k ? width : 0), x = cx + c * r, z = cz + s * r, o = (i * 2 + k) * 3; a[o] = x; a[o + 1] = H(x, z) + .1; a[o + 2] = z; } }
    P.needsUpdate = true; mesh.visible = true;
  }
  function pollGamepad(dt) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : []; let gp = null; for (const p of pads) if (p && p.connected) { gp = p; break; }
    if (!gp || !G.B || G.phase !== 'play') return;
    const st = U.gp, b = i => !!(gp.buttons[i] && gp.buttons[i].pressed), was = i => !!st.prev[i], hit = i => b(i) && !was(i);
    let ax = (Math.abs(gp.axes[0]) > .5 ? Math.sign(gp.axes[0]) : 0) + (b(15) ? 1 : 0) - (b(14) ? 1 : 0), ay = (Math.abs(gp.axes[1]) > .5 ? Math.sign(gp.axes[1]) : 0) + (b(13) ? 1 : 0) - (b(12) ? 1 : 0);
    st.t -= dt;
    if ((ax || ay) && st.t <= 0) {
      st.t = .22; st.active = true; touchInput(); audioGesture();
      if (U.menu) { const n = U.btns.length || 1; U.menu.focus = ((U.menu.focus + (ax || ay)) % n + n) % n; sfx('uiHover', CAM.x, CAM.z, .6); }
      else {
        const P = G.B.pads; if (st.sel < 0) st.sel = 0; const cur = proj(P[st.sel].x, P[st.sel].y, P[st.sel].z); let best = -1, bs = 1e9;
        P.forEach((p, i) => { if (i === st.sel) return; const q = proj(p.x, p.y, p.z), dx = q.x - cur.x, dy = q.y - cur.y, along = dx * ax + dy * ay; if (along <= 4) return; const off = Math.abs(-dx * ay + dy * ax), sc = along + off * 2.2; if (sc < bs) { bs = sc; best = i; } });
        if (best >= 0) { st.sel = best; sfx('uiHover', CAM.x, CAM.z, .6); }
      }
    }
    if (!ax && !ay) st.t = 0;
    if (hit(0)) { touchInput(); audioGesture(); st.active = true; if (st.sel < 0) st.sel = 0; if (U.menu) { const bt = U.btns[U.menu.focus]; if (bt) bt.fn(); } else { const pad = G.B.pads[st.sel]; U.menu = { pad, tower: pad.tower, t: 0, focus: 0, sel: null, sellArm: false }; sfx('uiHover', pad.x, pad.z, .9); } }
    if (hit(1)) { U.closeMenu(); touchInput(); }
    if (hit(2)) { const pad = st.sel >= 0 ? G.B.pads[st.sel] : null; if (pad && pad.tower) { touchInput(); doUpgrade(pad.tower); } }
    if (hit(3) || hit(9)) callWave();
    for (let i = 0; i < 16; i++) st.prev[i] = b(i);
  }

  function update(dt) {
    U.idle += dt; U.moved += dt; U.hurt = Math.max(0, U.hurt - dt * 1.6); U.goldBump = Math.max(0, U.goldBump - dt * 5); U.deny = Math.max(0, U.deny - dt * 3); U.titleT += dt; U.slainBump = Math.max(0, U.slainBump - dt * 4);
    if (G.slain !== U.lastSlain) { U.lastSlain = G.slain; U.slainBump = 1; }
    { const dpr = R.dpr || 1, iw = n => PX.iconSize(n)[0], m3 = PX.measure('000'); let sc = Math.max(2, Math.round(clamp(Math.min(R.cssH / 430, R.cssW / 225), 1.6, 4) * dpr));
      let st = 4; for (const [ic, v] of [['flame', G.lives], ['coin', Math.floor(U.goldShown)], ['skull', G.slain]]) st += iw(ic) + 8 + Math.max(PX.measure('' + v), m3);
      const cm = Math.max(iw('helm') + 3 + PX.measure('AI commander'), PX.measure(U.touch ? 'Tap a pad to play' : 'Click a pad to take over')) + 12, minS = Math.max(2, Math.ceil(1.3 * dpr));
      while (sc > minS && (st + cm + 13) * sc + R.safe[0] + R.safe[2] > R.dw) sc--;
      U.s = sc; }
    U.panning = !!(U.gest && U.gest.mode === 'pan');
    if (AU.ready && !U.ptrs.size) U.sndArmed = true;
    if (U.keys.size) { let kx = 0, ky = 0; for (const k of U.keys) { kx += PAN[k][0]; ky += PAN[k][1]; } if (kx || ky) { CAM.za = null; camPan(kx * R.dh * .9 * dt, ky * R.dh * .9 * dt); } }
    if (U.tip) { U.tip.t += dt; if (U.tip.t > 5.2) U.tip = null; } else if (U.tips.length && U.titleT > 7.5) U.tip = { type: U.tips.shift(), t: 0 };
    if (window.visualViewport && Math.abs(window.visualViewport.scale - 1) > .02) fixPageZoom();
    pollGamepad(dt);
    if (U.menu) { U.menu.t += dt; if ((U.menu.tower && !U.menu.tower.alive) || G.phase !== 'play') U.menu = null; else if (U.menu.pad.tower !== U.menu.tower) U.menu.tower = U.menu.pad.tower; }
    if (G.phase !== 'play') { U.armed = null; U.hover = null; }
    else U.hover = (U.inside && !U.touch && !U.hotBtn && !U.panning) ? pickPad(U.mx, U.my) : null;
    if (U.goldShown > G.gold) U.goldShown = G.gold;
    if (!U.coins.length && U.goldShown < G.gold) U.goldShown = Math.min(G.gold, U.goldShown + Math.max(1, (G.gold - U.goldShown) * 6 * dt));
    const tgt = U.menu ? U.menu : (U.gp.active && U.gp.sel >= 0 && G.phase === 'play' ? { pad: G.B.pads[U.gp.sel], tower: G.B.pads[U.gp.sel].tower } : U.hover);
    if (tgt && G.B && G.phase === 'play') {
      const pad = tgt.pad, pulse = .5 + .5 * Math.sin(G.t * 5);
      setRing(U.padMesh, pad.x, pad.z, 1.5, .1); U.padMesh.material.opacity = .45 + .25 * pulse;
      let range = 0; if (tgt.tower) range = tgt.tower.range; else { const kind = (U.menu && (U.menu.sel || (U.hotBtn && U.hotBtn.kind))) || U.armed || (U.menu && U.btns[U.menu.focus] && U.gp.active && U.btns[U.menu.focus].kind) || 'archer'; range = TOWER[kind].range[0]; }
      setRing(U.rangeMesh, pad.x, pad.z, range, .07); U.rangeMesh.material.opacity = .34;
    } else { U.padMesh.visible = false; U.rangeMesh.visible = false; }
    R.canvas.style.cursor = U.panning ? 'grabbing' : (U.hotBtn || U.hover || U.hudHot) ? 'pointer' : 'default';
  }

  function draw() {
    const c = U.ctx, s = U.s, W = R.dw, H = R.dh, pad = 5 * s, LH = PX.LINE * s;
    c.clearRect(0, 0, W, H); U.btns.length = 0; let hot = null;
    const pix = Math.max(1, Math.round(R.dh / R.ih));
    for (const b of G.hbars) {
      const p = proj(b.x, b.y, b.z), w = (b.boss ? 34 : b.man ? 8 : 9) * pix, h = (b.boss ? 2 : 1) * pix, x = Math.round(p.x - w / 2), y = Math.round(p.y);
      if (x < -w || x > W || y < 0 || y > H) continue;
      c.globalAlpha = b.f >= .999 ? .4 : .95;
      c.fillStyle = COLR.dark; c.fillRect(x - pix, y - pix, w + 2 * pix, h + 2 * pix);
      c.fillStyle = b.man ? '#7fb6ea' : (b.f > .5 ? '#d9a13c' : b.f > .25 ? '#e0762c' : '#e04a32'); c.fillRect(x, y, Math.max(pix, Math.round(w * b.f)), h);
      c.globalAlpha = 1;
      if (b.boss) text(b.name, p.x, y - LH - 2 * pix, COLR.tx, { align: 'c', outline: COLR.dark });
    }
    const [iL, iT, iR, iB] = R.safe, Wr = W - iR, Hb = H - iB, tch = U.touch, mouse = U.inside && !tch && !U.panning;
    const over = (x, y, w, h) => mouse && U.mx >= x && U.mx <= x + w && U.my >= y && U.my <= y + h;
    const stats = [['flame', '' + G.lives, U.hurt > 0 ? COLR.red : COLR.tx], ['coin', '' + Math.floor(U.goldShown), U.deny > 0 ? COLR.red : (U.goldBump > 0 ? '#ffe2a0' : COLR.tx)], ['skull', '' + G.slain, U.slainBump > .5 ? '#ffffff' : COLR.tx]];
    let wS = pad; for (const st of stats) wS += PX.iconSize(st[0])[0] * s + 2 * s + Math.max(tw(st[1]), tw('000')) + 6 * s; wS += pad - 6 * s;
    const hS = 10 * s + pad * 2 - 2 * s, x0 = 5 * s + iL, y0 = 5 * s + iT + U.insetTop;
    plate(x0, y0, wS, hS, U.hurt > 0 ? { bd: COLR.red } : {});
    let x = x0 + pad; const goldPos = { x: 0, y: 0 };
    for (const st of stats) {
      const [iw, ih] = PX.iconSize(st[0]); const iy = y0 + Math.round((hS - ih * s) / 2);
      PX.icon(c, st[0], x, iy, s, st[0] === 'flame' ? .55 + .45 * (G.lives / G.maxLives) : 1); if (st[0] === 'coin') { goldPos.x = x + iw * s / 2; goldPos.y = iy + ih * s / 2; }
      x += iw * s + 2 * s; text(st[1], x, y0 + Math.round((hS - LH) / 2) + s, st[2]); x += Math.max(tw(st[1]), tw('000')) + 6 * s;
    }
    const wn = 'Wave ' + Math.max(1, waveNumber()), callable = G.phase === 'play' && !G.spawning && !G.bossWave && G.nextIn > .4;
    let sub, frac = -1;
    if (G.phase === 'play') { if (!G.spawning && !G.bossWave && G.nextIn > 0) { sub = callable && (tch || over(U.waveRect ? U.waveRect.x : -1, U.waveRect ? U.waveRect.y : -1, U.waveRect ? U.waveRect.w : 0, U.waveRect ? U.waveRect.h : 0)) ? (tch ? 'Tap to call · +' : 'Call now · +') + Math.round(G.nextIn * 3) : 'Next wave in ' + Math.ceil(G.nextIn); frac = 1 - G.nextIn / 6.5; } else { const n = G.mons.length + G.queue.length; sub = n + ' on the road'; } }
    else sub = G.phase === 'defeat' ? 'The fire has died' : G.phase === 'clear' ? 'Boss defeated' : 'A new pass awaits';
    const bw = PX.iconSize('banner')[0] * s, wW = Math.max(bw + 3 * s + tw(wn), tw(sub), tw('Next wave in 0'), tw('Tap to call · +00')) + pad * 2 + 4 * s, hW = LH * 2 + pad * 2 + s;
    const you = U.playerActive(), ct = you ? 'You command' : 'AI commander', cs = tch ? (you ? 'Tap for the AI' : 'Tap a pad to play') : (you ? 'Click here for the AI' : 'Click a pad to take over');
    const ic = you ? 'hand' : 'helm', icw = PX.iconSize(ic)[0] * s, cW = Math.max(icw + 3 * s + tw(ct), tw(cs)) + pad * 2 + 2 * s, xc = Wr - cW - 5 * s, g3 = 3 * s;
    const xw = Math.round(W / 2 - wW / 2);
    let yc = y0, yw = y0;
    if (xc < x0 + wS + g3) yc = y0 + hS + g3;
    if (xw < x0 + wS + g3 || (yc === y0 && xw + wW > xc - g3) || yc !== y0) yw = Math.max(y0 + hS, yc + (yc === y0 || xw + wW > xc - g3 ? hW : 0)) + g3;
    const topH = Math.max(y0 + hS, yc + hW, yw + hW) - y0; R.hudTop = y0 + topH;
    U.hud.length = 0; U.hudHot = false;
    const hotW = callable && over(xw, yw, wW, hW); U.waveRect = callable ? { id: 'wave', x: xw, y: yw, w: wW, h: hW, hot: hotW, fn: callWave, hud: true } : null; if (callable) U.hud.push(U.waveRect); if (hotW) U.hudHot = true;
    plate(xw, yw, wW, hW, hotW ? { bd: COLR.bdHi, bg: COLR.bg2 } : callable && tch ? { bd: '#8a6a3a' } : {});
    const tx0 = Math.round(W / 2 - (bw + 3 * s + tw(wn)) / 2);
    PX.icon(c, 'banner', tx0, yw + pad - s, s); text(wn, tx0 + bw + 3 * s, yw + pad, COLR.amber);
    text(sub, W / 2, yw + pad + LH + s, callable && (tch || hotW) ? COLR.tx : COLR.dim, { align: 'c' });
    if (frac >= 0) { c.fillStyle = '#2a2620'; c.fillRect(xw + 3 * s, yw + hW - 3 * s, wW - 6 * s, s); c.fillStyle = COLR.amber; c.fillRect(xw + 3 * s, yw + hW - 3 * s, Math.round((wW - 6 * s) * sat(frac)), s); }
    const hotC = over(xc, yc, cW, hW); U.cmdRect = { id: 'cmd', x: xc, y: yc, w: cW, h: hW, hot: hotC, fn: toggleCommand, hud: true }; U.hud.push(U.cmdRect); if (hotC) U.hudHot = true;
    plate(xc, yc, cW, hW, hotC ? { bd: COLR.bdHi, bg: COLR.bg2 } : you ? { bd: COLR.bdHi } : {});
    PX.icon(c, ic, xc + pad, yc + pad - s, s); text(ct, xc + pad + icw + 3 * s, yc + pad, you ? COLR.amber : COLR.tx); text(cs, xc + pad, yc + pad + LH + s, COLR.dim);
    const dpr = R.dpr || 1, hB = LH + pad * 2 - s, zb = tch ? Math.max(22 * s, Math.round(40 * dpr)) : hB, yB = Hb - zb - 5 * s; let tipB = null;
    const sq = (id, x, w, fn, tip, icon, on) => {
      const r = { id, x, y: yB, w, h: zb, fn, hud: true }, hot = over(x, yB, w, zb), down = U.press === id, dy = down ? s : 0; U.hud.push(r); if (hot) { U.hudHot = true; tipB = { x: x + w / 2, tip }; }
      plate(x, yB + dy, w, zb, hot || down ? { bd: COLR.bdHi, bg: COLR.bg2 } : on ? { bd: '#8a6a3a' } : {}); icon(x, yB + dy, hot || down); return r;
    };
    const glyph = (g, col) => (x, y) => { const k = Math.max(s, Math.floor(zb / 10)); PX.text(c, g, x + zb / 2, y + Math.round(zb / 2 - 3.5 * k), k, col, { align: 'c' }); };
    const label = (t, col) => (x, y) => { const k = Math.max(s, Math.floor(zb / 15)); PX.text(c, t, x + zb / 2, y + Math.round((zb - PX.LINE * k) / 2) + k, k, col, { align: 'c' }); };
    const bars = (x, y) => { const u = zb / 18; c.fillStyle = COLR.tx; if (G.paused) { for (let i = 0; i < 4; i++) c.fillRect(Math.round(x + (6.5 + i * 1.5) * u), Math.round(y + (5 + i) * u), Math.ceil(1.5 * u), Math.round((8 - 2 * i) * u)); } else { c.fillRect(Math.round(x + 6 * u), Math.round(y + 5 * u), Math.round(2.2 * u), Math.round(8 * u)); c.fillRect(Math.round(x + 9.8 * u), Math.round(y + 5 * u), Math.round(2.2 * u), Math.round(8 * u)); } };
    const corners = (x, y) => { const u = Math.round(zb / 9), q = Math.round(zb / 5), f = isFull(); c.fillStyle = COLR.tx; for (const [ax, ay] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const cx = x + (ax ? zb - q - u : q), cy = y + (ay ? zb - q - u : q), ix = f ? (ax ? -1 : 1) : (ax ? 1 : -1), iy = f ? (ay ? -1 : 1) : (ay ? 1 : -1); c.fillRect(cx, cy, u, u); c.fillRect(cx - ix * u, cy, u, u); c.fillRect(cx, cy - iy * u, u, u); } };
    const play = G.phase === 'play' || G.phase === 'defeat', nR = (fullscreenOK() && tch ? 3 : 2), rightW = nR * zb + (nR - 1) * g3;
    let xl = 5 * s + iL;
    sq('pause', xl, zb, togglePause, G.paused ? 'Resume (P)' : 'Pause (P)', bars, G.paused); xl += zb + g3;
    sq('speed', xl, zb, cycleSpeed, 'Speed (Tab)', label(G.speed + 'x', G.speed > 1 ? COLR.amber : COLR.tx), G.speed > 1); xl += zb + g3;
    { const on = AU.ready && !AU.muted, icn = on ? 'sound' : 'mute', k = Math.max(s, Math.floor(zb / 14)), [iw2, ih2] = PX.iconSize(icn), lbl = tch ? 'Tap for sound' : 'Click for sound', wl = iw2 * s + 3 * s + tw(lbl) + pad * 2;
      const wide = !AU.ready && xl + wl + g3 + rightW + 5 * s + iR <= W;
      U.soundRect = sq('sound', xl, wide ? wl : zb, soundTap, AU.ready ? (AU.muted ? 'Sound is off (M)' : 'Sound is on (M)') : 'Sound', (x, y) => { if (wide) { PX.icon(c, icn, x + pad, y + Math.round((zb - ih2 * s) / 2), s, .85); text(lbl, x + pad + iw2 * s + 3 * s, y + Math.round((zb - LH) / 2) + s, COLR.tx); } else PX.icon(c, icn, x + Math.round((zb - iw2 * k) / 2), y + Math.round((zb - ih2 * k) / 2), k, AU.ready ? 1 : .8); }, !AU.ready);
      xl += (wide ? wl : zb) + g3; }
    let xr = Wr - 5 * s - zb; const cur = camZoomNow();
    if (nR === 3) { sq('full', xr, zb, toggleFull, 'Full screen', corners, false); xr -= zb + g3; }
    sq('zin', xr, zb, () => camZoomBy(1.5), 'Zoom in (+)', glyph('+', cur < 2.99 ? COLR.tx : '#5a5448'), false); xr -= zb + g3;
    sq('zout', xr, zb, () => camZoomBy(1 / 1.5), 'Zoom out (-)', glyph('-', cur > camZoomMin() + .01 ? COLR.tx : '#5a5448'), false);
    let yUp = yB - g3;
    if (CAM.man && play) {
      const lbl = 'Follow the fight', w = tw(lbl) + pad * 2, fits = xr - g3 - w >= xl, xf2 = fits ? xr - g3 - w : Wr - w - 5 * s, yf = fits ? yB + Math.round((zb - hB) / 2) : yB - g3 - hB, hotF = over(xf2, yf, w, hB);
      plate(xf2, yf, w, hB, hotF ? { bd: COLR.bdHi, bg: COLR.bg2 } : { bd: '#8a6a3a' }); text(lbl, xf2 + pad, yf + pad - s, COLR.tx);
      U.followRect = { id: 'follow', x: xf2, y: yf, w, h: hB, hot: hotF, fn: () => { camReset(); sfx('uiClick', CAM.x, CAM.z, .6); }, hud: true }; U.hud.push(U.followRect); if (hotF) U.hudHot = true; if (!fits) yUp = yf - g3;
    } else U.followRect = null;
    if (tipB && !tch) { const w = tw(tipB.tip) + pad * 2, x = clamp(Math.round(tipB.x - w / 2), 4 * s + iL, Wr - w - 4 * s); plate(x, yB - g3 - hB, w, hB, { bd: COLR.bdHi }); text(tipB.tip, x + pad, yB - g3 - hB + pad - s, COLR.tx); yUp = Math.min(yUp, yB - g3 - hB - g3); }
    const wrap = (str, maxW) => { const out = []; let cur2 = ''; for (const wd of str.split(' ')) { const t = cur2 ? cur2 + ' ' + wd : wd; if (cur2 && tw(t) > maxW) { out.push(cur2); cur2 = wd; } else cur2 = t; } if (cur2) out.push(cur2); return out; };
    const boxW = Wr - iL - 10 * s;
    if (G.paused) { const k = s + 1, t1 = 'Paused', w = PX.measure(t1) * k + pad * 4, h = PX.LINE * k + pad * 2; plate(Math.round(W / 2 - w / 2), yUp - h, w, h, { bd: COLR.bdHi }); PX.text(c, t1, W / 2, yUp - h + pad, k, COLR.amber, { align: 'c' }); yUp -= h + g3; }
    if (U.tip && !U.menu) {
      const d = MON[U.tip.type], a = sat(Math.min(U.tip.t * 4, (5.2 - U.tip.t) * 2)), head = (d.boss ? 'Boss: ' : 'New: ') + d.name, lines = wrap(d.tip, Math.min(boxW - pad * 2, 46 * 6 * s));
      let w = tw(head); for (const l of lines) w = Math.max(w, tw(l)); w += pad * 2; const h = LH * (lines.length + 1) + pad * 2 - s, x = Math.round((iL + Wr - w) / 2), y = yUp - h;
      c.globalAlpha = a; plate(x, y, w, h, { bd: d.boss ? COLR.ember : '#8a6a3a' }); text(head, x + w / 2, y + pad - s, COLR.amber, { align: 'c' }); lines.forEach((l, k) => text(l, x + w / 2, y + pad - s + (k + 1) * LH, COLR.tx, { align: 'c' })); c.globalAlpha = 1; yUp = y - g3;
    } else {
      const first = U.titleT < 16, a = tch ? sat(Math.min(U.titleT - 7.2, first ? 1 : 3 - U.moved, U.manual && !first ? 0 : 1, 62 - U.titleT)) : sat(Math.min(U.titleT - 7.2, 3 - Math.min(U.moved, U.idle > 20 ? U.moved : 0) + (U.titleT < 18 ? 8 : 0)));
      if (a > .02 && !U.menu && !G.paused) {
        const parts = tch ? ['Tap a pad to build', 'Drag to look around', 'Pinch or double-tap to zoom'] : ['Click a pad to build', '1-4 pick a tower', 'Space calls the next wave', 'Wheel zooms, drag moves the view'];
        let lines = [parts.join(' · ')]; if (tw(lines[0]) + pad * 2 > boxW) { lines = parts.length > 3 ? [parts.slice(0, 2).join(' · '), parts.slice(2).join(' · ')] : parts; if (lines.some(l => tw(l) + pad * 2 > boxW)) lines = parts; }
        let w = 0; for (const l of lines) w = Math.max(w, tw(l)); w += pad * 2; const h = LH * lines.length + pad * 2 - s, hx = Math.round((iL + Wr - w) / 2), hy = yUp - h;
        if (w <= boxW) { c.globalAlpha = a; plate(hx, hy, w, h); lines.forEach((l, k) => text(l, hx + w / 2, hy + pad - s + k * LH, COLR.dim, { align: 'c' })); c.globalAlpha = 1; }
      }
    }
    for (let i = U.coins.length - 1; i >= 0; i--) {
      const q = U.coins[i]; q.t += R.frameDt; const u = sat(q.t / q.T), e = u * u * (3 - 2 * u), a = 1 - e;
      const px = a * a * q.sx + 2 * a * e * q.cx + e * e * goldPos.x, py = a * a * q.sy + 2 * a * e * q.cy + e * e * goldPos.y;
      PX.icon(c, 'coin', Math.round(px - 4 * s * .75), Math.round(py - 4 * s * .75), Math.max(2, s - 1), 1);
      if (u >= 1) { U.goldShown = Math.min(G.gold, U.goldShown + q.value); U.goldBump = 1; sfx('coin', CAM.x, CAM.z, .35, rnd()); U.coins.splice(i, 1); }
    }
    if (U.msg) {
      const m = U.msg; m.t += R.frameDt; const a = sat(Math.min(m.t * 3, (m.dur - m.t) * 2));
      if (m.t >= m.dur) U.msg = null; else { let sc = s + (m.big ? 2 : 1); while (sc > 2 && PX.measure(m.text) * sc + pad * 4 > Wr - iL - 6 * s) sc--; const w = PX.measure(m.text) * sc + pad * 4, h = PX.LINE * sc + pad * 2; c.globalAlpha = a; const yb = Math.max(Math.round(H * .2), y0 + topH + 4 * s); plate(Math.round(W / 2 - w / 2), yb, w, h, { bd: m.big ? COLR.ember : COLR.bdHi }); PX.text(c, m.text, W / 2, yb + pad, sc, m.big ? '#ffd9a8' : COLR.tx, { align: 'c' }); c.globalAlpha = 1; }
    }
    U.menuRect = null;
    if (U.menu && G.phase === 'play') {
      const m = U.menu, p = proj(m.pad.x, m.pad.y + (m.tower ? Math.min(3.6, m.tower.mounts.top) : 1.2), m.pad.z), a = sat(m.t * 8), mp = 6 * s;
      const button = (bx, by, bw2, bh2, id, enabled, fn, kind, on) => {
        const ov = over(bx, by, bw2, bh2) && !U.gp.active, focused = U.gp.active && U.btns.length === m.focus;
        const b = { id, fn, kind, x: bx, y: by, w: bw2, h: bh2 }; U.btns.push(b); if (ov) hot = b; const down = U.press === id, lit = ov || focused || on || down;
        plate(bx, by + (down ? s : 0), bw2, bh2, { bg: lit ? COLR.bg2 : 'rgba(16,18,27,0.96)', bd: lit ? COLR.bdHi : (enabled ? COLR.bd : '#3a342c'), hi: lit ? 'rgba(232,176,74,0.18)' : null });
        return { lit, dy: down ? s : 0 };
      };
      const place = (wP, hP) => { const below = p.y - hP - 7 * s < y0 + topH + 2 * s && p.y + 26 * s + hP < Hb - 4 * s; return [clamp(Math.round(p.x - wP / 2), 4 * s + iL, Wr - wP - 4 * s), below ? Math.round(p.y + 26 * s) : clamp(Math.round(p.y - hP - 7 * s), Math.min(y0 + topH + 4 * s, Hb - hP - 4 * s), Hb - hP - 4 * s)]; };
      c.globalAlpha = a;
      if (!m.tower) {
        const bwid = 31 * s, bh = 35 * s, gapb = 3 * s, rowW = 4 * bwid + 3 * gapb;
        let lit = null; const fk = U.gp.active ? TOWER_KINDS[m.focus % 4] : null;
        const lines = k => k ? [TOWER[k].name].concat(TOWER[k].desc) : tch ? ['Choose a tower', 'Tap one to see what it does,', 'then tap it again to build.'] : ['Choose a tower', 'Hover or press 1 to 4', 'to see what each does.'];
        let textW = tw('Tap again to build'); for (const k of [null].concat(TOWER_KINDS)) for (const l of lines(k)) textW = Math.max(textW, tw(l));
        const wP = Math.max(rowW, textW) + mp * 2, hP = mp * 2 + LH + 3 * s + bh + 4 * s + LH * 3 + 2 * s + (tch ? LH + s : 0), [px, py] = place(wP, hP);
        U.menuRect = { x: px, y: py, w: wP, h: hP };
        plate(px, py, wP, hP); text('Build here', px + mp, py + mp - s, COLR.amber);
        const bx0 = px + Math.round((wP - rowW) / 2), by = py + mp + LH + 3 * s;
        TOWER_KINDS.forEach((kind, i) => {
          const d = TOWER[kind], can = G.gold >= d.cost[0], bx = bx0 + i * (bwid + gapb);
          const r = button(bx, by, bwid, bh, 'b' + kind, can, () => { if (U.touch && m.sel !== kind) { m.sel = kind; sfx('uiHover', m.pad.x, m.pad.z, .8); } else doBuild(m.pad, kind); }, kind, m.sel === kind);
          const [iw, ih] = PX.iconSize(d.icon); PX.icon(c, d.icon, bx + Math.round((bwid - iw * s) / 2), by + 6 * s + r.dy, s, can ? 1 : .45);
          if (!tch) text('' + (i + 1), bx + 3 * s, by + 2 * s + r.dy, COLR.dim);
          const cw2 = 8 * s + 2 * s + tw('' + d.cost[0]), cx0 = bx + Math.round((bwid - cw2) / 2);
          PX.icon(c, 'coin', cx0, by + bh - LH - 3 * s + r.dy, s, can ? 1 : .5); text('' + d.cost[0], cx0 + 10 * s, by + bh - LH - 3 * s + r.dy, can ? COLR.amber : COLR.red);
          if (r.lit) lit = kind;
        });
        const ls = lines(lit || fk), ty = by + bh + 4 * s;
        text(ls[0], px + mp, ty, lit || fk ? COLR.tx : COLR.dim); text(ls[1], px + mp, ty + LH + s, COLR.dim); if (ls[2]) text(ls[2], px + mp, ty + LH * 2 + s, COLR.dim);
        if (tch && m.sel) { const can = G.gold >= TOWER[m.sel].cost[0]; text(can ? 'Tap again to build' : 'Not enough gold yet', px + mp, ty + LH * 3 + 2 * s, can ? COLR.amber : COLR.red); }
      } else {
        const t = m.tower, d = t.def, maxed = t.lvl >= 2, upc = maxed ? 0 : d.cost[t.lvl + 1], can = !maxed && G.gold >= upc && t.state === 'active', refund = Math.round(t.spent * .6), L1 = t.lvl + 1;
        const ul = maxed ? 'Max level' : 'Upgrade ' + upc, sl = m.sellArm ? 'Confirm +' + refund : 'Sell +' + refund, iw9 = 9 * s, bw3 = Math.max(tw(ul), tw(sl), tw('Confirm +' + refund)) + iw9 + 11 * s, bh = (tch ? 24 : 15) * s, by0 = Math.round((bh - LH) / 2);
        const st = t.kind === 'guard' ? d.n[t.lvl] + ' footmen · ' + d.hp[t.lvl] + ' health' : 'Range ' + d.range[t.lvl].toFixed(1) + ' · Damage ' + d.dmg[t.lvl];
        const nx = maxed ? t.kills + ' kills' : (t.kind === 'guard' ? 'Next: ' + d.n[L1] + ' footmen · ' + d.hp[L1] + ' health' : 'Next: range ' + d.range[L1].toFixed(1) + ' · damage ' + d.dmg[L1]);
        const wP = Math.max(bw3 * 2 + 3 * s, tw(d.name) + 26 * s, tw(st), tw(nx)) + mp * 2, hP = mp * 2 + LH * 3 + 6 * s + bh, [px, py] = place(wP, hP);
        U.menuRect = { x: px, y: py, w: wP, h: hP };
        plate(px, py, wP, hP); text(d.name, px + mp, py + mp - s, COLR.amber);
        for (let i = 0; i < 3; i++) PX.icon(c, i <= t.lvl ? 'star' : 'starEmpty', px + wP - mp - (3 - i) * 6 * s, py + mp, s);
        text(st, px + mp, py + mp + LH + s, COLR.tx); text(nx, px + mp, py + mp + LH * 2 + 2 * s, maxed ? COLR.dim : COLR.ok);
        const by = py + mp + LH * 3 + 6 * s, bwf = Math.floor((wP - mp * 2 - 3 * s) / 2);
        let r = button(px + mp, by, bwf, bh, 'up', can, () => doUpgrade(t), null, false);
        PX.icon(c, 'upgrade', px + mp + 4 * s, by + by0 + r.dy, s, can ? 1 : .4); text(ul, px + mp + 4 * s + iw9 + 3 * s, by + by0 + r.dy, can ? COLR.tx : (maxed ? COLR.dim : COLR.red));
        r = button(px + mp + bwf + 3 * s, by, bwf, bh, 'sell', true, () => { if (!m.sellArm) { m.sellArm = true; sfx('uiHover', t.x, t.z, .8); } else { buzz(16); doSell(t); } }, null, m.sellArm);
        PX.icon(c, 'sell', px + mp + bwf + 7 * s, by + by0 + r.dy, s); text(sl, px + mp + bwf + 7 * s + iw9 + 3 * s, by + by0 + r.dy, m.sellArm ? COLR.ember : COLR.tx);
      }
      c.globalAlpha = 1;
    }
    if (hot !== U.hotBtn && hot) sfx('uiHover', CAM.x, CAM.z, .5);
    U.hotBtn = hot;
    if (U.armed && mouse && G.phase === 'play') { const l = TOWER[U.armed].name + ': click a pad', w = tw(l) + pad * 2; const xx = clamp(U.mx + 10 * s, 2 * s, W - w - 2 * s), yy = clamp(U.my + 10 * s, 2 * s, H - LH - pad * 2); plate(xx, yy, w, LH + pad * 2 - s, { bd: COLR.bdHi }); text(l, xx + pad, yy + pad - s, COLR.tx); }
    if (U.titleT < 7 && !U.menu) {
      const a = sat(Math.min((U.titleT - .4) * 1.5, (6.6 - U.titleT) * 1.2));
      if (a > 0) {
        const sc = s * 2, t1 = 'Cinderwatch', full = G.B.bio.name + ' · The commander plays until you take over.', t2 = tw(full) + pad * 4 > Wr - iL - 6 * s ? [G.B.bio.name, 'The commander plays', 'until you take over.'] : [full]; if (G.best > 5) t2.push('Best run: wave ' + G.best);
        let w = PX.measure(t1) * sc; for (const l of t2) w = Math.max(w, tw(l)); w += pad * 4; const h = PX.LINE * sc + LH * t2.length + pad * 2 + 2 * s, yy = Hb - h - 12 * s - zb;
        c.globalAlpha = a; plate(Math.round(W / 2 - w / 2), yy, w, h); PX.text(c, t1, W / 2, yy + pad, sc, '#ffd9a8', { align: 'c' }); t2.forEach((l, k) => text(l, W / 2, yy + pad + PX.LINE * sc + s + k * LH, k === 0 && t2.length > 1 ? COLR.tx : COLR.dim, { align: 'c' })); c.globalAlpha = 1;
      }
    }
    if (HASH.fps) { text(R.fpsText || '', 6 * s + iL, Hb - 30 * s, COLR.ok, { outline: COLR.dark }); }
  }
  U.init = initUI; U.update = update; U.draw = draw;
  return U;
})();

const AU = (function () {
  const api = { ready: false, muted: false, unlock: unlock, setMuted: setMuted, setPaused: setPaused, play: play, setAmbience: setAmbience, update: update };

  let ctx = null, sr = 44100;
  let nMaster = null, nMute = null, nSfx = null, nAmb = null, nMusic = null, nRevIn = null;
  let bufWhite = null, bufPink = null, bufBrown = null;
  let V = null;
  const shapeCurves = {};
  const ends = [];
  const last = {};
  const tgt = { fire: 0, wind: 0, tension: 0 }, cur = { fire: 0, wind: 0, tension: 0 }, app = { fire: -1, wind: -1, tension: -1 };
  const bed = { windG: null, gustG: null, windLP: [], whG: null, whF: null, fireG: null, popBus: null, droneG: null, droneLP: null, timer: 0, popAcc: 0 };
  const mus = { nextChord: 0, chord: 0, lastNote: -1, timpAt: 0, timpN: 0 };

  const rnd = Math.random;
  const rr = (a, b) => a + (b - a) * rnd();
  const cl = (x, a, b) => (x < a ? a : x > b ? b : x);
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function gn(dest, v) { const g = ctx.createGain(); g.gain.value = v === undefined ? 0 : v; if (dest) g.connect(dest); return g; }
  function flt(dest, type, f, q) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q !== undefined) b.Q.value = q; if (dest) b.connect(dest); return b; }
  function panNode(pan, dest) {
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = cl(pan, -1, 1); if (dest) p.connect(dest); return p; }
    return gn(dest, 1);
  }
  function shape(dest, drive) {
    const ws = ctx.createWaveShaper();
    let c = shapeCurves[drive];
    if (!c) { c = new Float32Array(1024); const n = Math.tanh(drive); for (let i = 0; i < 1024; i++) c[i] = Math.tanh(drive * (i / 511.5 - 1)) / n; shapeCurves[drive] = c; }
    ws.curve = c; ws.oversample = '2x'; if (dest) ws.connect(dest); return ws;
  }
  function keep(src, e) { if (V && e > V.lastT) { V.last = src; V.lastT = e; } }
  function osc(type, f, t, dur, dest) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; if (dest) o.connect(dest);
    const e = t + dur + 0.03; o.start(t); o.stop(e); keep(o, e); return o;
  }
  function noi(t, dur, dest, buf, rate) {
    const s = ctx.createBufferSource(); s.buffer = buf || bufWhite; s.loop = true; if (rate) s.playbackRate.value = rate; if (dest) s.connect(dest);
    const e = t + dur + 0.03; s.start(t, rnd() * (s.buffer.duration - 0.1)); s.stop(e); keep(s, e); return s;
  }
  function loopSrc(buf, dest, rate) {
    const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; if (rate) s.playbackRate.value = rate; s.connect(dest);
    s.start(ctx.currentTime, rnd() * (buf.duration - 0.1)); return s;
  }
  function loopOsc(type, f, dest) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; if (dest) o.connect(dest); o.start(); return o; }

  function ad(param, t, peak, a, d) { param.setValueAtTime(0.0001, t); param.linearRampToValueAtTime(Math.max(0.0002, peak), t + a); param.exponentialRampToValueAtTime(0.0001, t + a + d); }
  function sw(param, t, f0, f1, dur) { param.setValueAtTime(Math.max(1, f0), t); param.exponentialRampToValueAtTime(Math.max(1, f1), t + dur); }

  function grains(dest, t, n, span, peak, dMin, dMax, f0, f1, q, shp) {
    const g = gn(dest, 0), f = flt(g, 'bandpass', (f0 + f1) * 0.5, q || 4);
    const ts = [];
    for (let i = 0; i < n; i++) { let u = rnd(); if (shp === 1) u = u * u; else if (shp === 2) u = 1 - u * u; ts.push(u * span); }
    ts.sort((a, b) => a - b);
    let end = t + 0.01;
    g.gain.setValueAtTime(0, t);
    for (let i = 0; i < n; i++) {
      const ti = t + ts[i], room = i < n - 1 ? ts[i + 1] - ts[i] - 0.004 : 9;
      if (room < 0.004) continue;
      const d = Math.min(rr(dMin, dMax), room), a = peak * rr(0.35, 1) * (shp === 1 ? 1 - 0.6 * ts[i] / span : 1);
      f.frequency.setValueAtTime(rr(f0, f1), ti);
      g.gain.setValueAtTime(0.0001, ti);
      g.gain.linearRampToValueAtTime(Math.max(0.0002, a), ti + 0.0015);
      g.gain.exponentialRampToValueAtTime(0.0001, ti + 0.0015 + d);
      end = ti + 0.0015 + d;
    }
    noi(t, end - t + 0.02, f);
    return end;
  }

  function voice(pan, gain, send, bus) {
    const out = gn(null, gain);
    const tail = panNode(pan, bus || nSfx); out.connect(tail);
    let wet = null;
    if (send > 0) { wet = gn(nRevIn, send); tail.connect(wet); }
    return { out: out, tail: tail, wet: wet, last: null, lastT: 0 };
  }
  function finishVoice(v) {
    const done = () => { try { v.out.disconnect(); v.tail.disconnect(); if (v.wet) v.wet.disconnect(); } catch (e) {} };
    if (v.last) v.last.onended = done; else done();
    if (V === v) V = null;
  }

  function makeBuffers() {
    const mk = (secs, fill) => {
      const len = (sr * secs) | 0, fade = (sr * 0.06) | 0, x = new Float32Array(len + fade);
      fill(x);
      let pk = 0; for (let i = 0; i < x.length; i++) pk = Math.max(pk, Math.abs(x[i]));
      const b = ctx.createBuffer(1, len, sr), d = b.getChannelData(0), k = 1 / (pk || 1);
      for (let i = 0; i < len; i++) d[i] = x[i] * k;
      for (let i = 0; i < fade; i++) { const u = i / fade; d[i] = (x[i] * u + x[len + i] * (1 - u)) * k; }
      return b;
    };
    bufWhite = mk(2, (x) => { for (let i = 0; i < x.length; i++) x[i] = rnd() * 2 - 1; });
    bufPink = mk(5, (x) => {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < x.length; i++) {
        const w = rnd() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        x[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926;
      }
    });
    bufBrown = mk(5, (x) => { let b = 0; for (let i = 0; i < x.length; i++) { b = (b + 0.02 * (rnd() * 2 - 1)) / 1.02; x[i] = b; } });
  }
  function makeImpulse() {
    const len = (sr * 2.9) | 0, b = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch); let lp = 0;
      const e1 = 0.17 + ch * 0.021, e2 = 0.31 - ch * 0.027;
      for (let i = 0; i < len; i++) {
        const t = i / sr, w = rnd() * 2 - 1;
        const a = cl(0.2 + t * 0.42, 0, 0.94);
        lp += (w - lp) * (1 - a);
        let env = Math.exp(-t * 2.5) * (t < 0.022 ? t / 0.022 : 1);
        if (t > e1 && t < e1 + 0.02) env += 0.5 * Math.exp(-(t - e1) * 160);
        if (t > e2 && t < e2 + 0.025) env += 0.32 * Math.exp(-(t - e2) * 130);
        d[i] = lp * env * (1 + a * 2.2);
      }
    }
    return b;
  }

  function ding(d, t, f, peak) {
    const g = gn(d); osc('sine', f, t, 0.3, g); ad(g.gain, t, peak, 0.002, 0.2);
    const g2 = gn(d); osc('sine', f * 2.42, t, 0.15, g2); ad(g2.gain, t, peak * 0.3, 0.001, 0.06);
  }
  function whoomp(d, t, peak, len) {
    const w = gn(d), wf = flt(w, 'lowpass', 300, 1.2); noi(t, len + 0.2, wf);
    wf.frequency.setValueAtTime(180, t); wf.frequency.exponentialRampToValueAtTime(1100, t + len * 0.25); wf.frequency.exponentialRampToValueAtTime(320, t + len);
    ad(w.gain, t, peak, len * 0.18, len * 0.9);
    const g = gn(d), o = osc('sine', 70, t, len * 0.7, g); sw(o.frequency, t, 62, 115, len * 0.5); ad(g.gain, t, peak * 0.6, len * 0.15, len * 0.5);
  }
  function hornNote(d, t, f, dur, peak, bright) {
    const env = gn(d), body = flt(env, 'peaking', 480, 1.0); body.gain.value = 5;
    const lp = flt(body, 'lowpass', 300, 0.8), cents = [-8, 0, 7], oscs = [], vib = gn(null, 0);
    for (let i = 0; i < 3; i++) { const o = osc('sawtooth', f, t, dur + 0.6, gn(lp, 0.33)); o.detune.value = cents[i]; vib.connect(o.detune); oscs.push([o, f]); }
    const sub = osc('triangle', f / 2, t, dur + 0.6, gn(lp, 0.25)); vib.connect(sub.detune); oscs.push([sub, f / 2]);
    osc('sine', 5.3, t, dur + 0.6, vib); vib.gain.setValueAtTime(0, t + dur * 0.35); vib.gain.linearRampToValueAtTime(9, t + dur * 0.8);
    const a = Math.min(0.28, dur * 0.25);
    env.gain.setValueAtTime(0.0001, t); env.gain.linearRampToValueAtTime(peak * 0.6, t + a); env.gain.linearRampToValueAtTime(peak, t + dur * 0.75); env.gain.setTargetAtTime(0.0001, t + dur, 0.11);
    lp.frequency.setValueAtTime(260, t); lp.frequency.linearRampToValueAtTime(900 * bright, t + a); lp.frequency.linearRampToValueAtTime(1700 * bright, t + dur * 0.75); lp.frequency.setTargetAtTime(350, t + dur, 0.14);
    const n = gn(env, 0.03), nf = flt(n, 'bandpass', 1300, 1); noi(t, dur + 0.5, nf);
    return oscs;
  }

  const S = {};
  S.bow = (d, t) => {
    const k = rr(0.92, 1.1);
    const g = gn(d), bp = flt(g, 'bandpass', 900 * k, 1.1);
    const o = osc('triangle', 210 * k, t, 0.2, bp); sw(o.frequency, t, 230 * k, 118 * k, 0.11);
    const o2 = osc('sawtooth', 425 * k, t, 0.12, gn(bp, 0.25)); sw(o2.frequency, t, 470 * k, 240 * k, 0.08);
    ad(g.gain, t, 0.9, 0.002, 0.14);
    const w = gn(d), wf = flt(w, 'bandpass', 1800, 1.3); noi(t, 0.22, wf); sw(wf.frequency, t, 2400, 700, 0.18); ad(w.gain, t + 0.005, 0.22, 0.02, 0.15);
  };
  S.arrowHit = (d, t) => {
    const k = rr(0.85, 1.2);
    const g = gn(d), o = osc('sine', 170 * k, t, 0.12, g); sw(o.frequency, t, 190 * k, 70 * k, 0.07); ad(g.gain, t, 0.55, 0.002, 0.08);
    const n = gn(d), nf = flt(n, 'bandpass', 520 * k, 5); noi(t, 0.08, nf); ad(n.gain, t, 0.5, 0.001, 0.05);
    const c = gn(d), cf = flt(c, 'highpass', 2600); noi(t, 0.04, cf); ad(c.gain, t, 0.16, 0.0005, 0.014);
  };
  S.cannon = (d, t, p) => {
    const k = rr(0.9, 1.08) * (1 - 0.18 * p), sh = shape(d, 2.2);
    const g = gn(sh), o = osc('sine', 120 * k, t, 0.9, g); sw(o.frequency, t, 125 * k, 33 * k, 0.4); ad(g.gain, t, 1.0, 0.003, 0.7);
    const g2 = gn(sh), o2 = osc('triangle', 64 * k, t, 0.6, g2); sw(o2.frequency, t, 70 * k, 28 * k, 0.5); ad(g2.gain, t, 0.5, 0.004, 0.5);
    const b = gn(sh), bf = flt(b, 'lowpass', 1200, 0.7); noi(t, 0.7, bf); sw(bf.frequency, t, 1600, 140, 0.45); ad(b.gain, t, 0.7, 0.002, 0.5);
    const c = gn(d), cf = flt(c, 'highpass', 1100); noi(t, 0.1, cf); ad(c.gain, t, 0.5, 0.0008, 0.05);
    const r = gn(d), rf = flt(r, 'lowpass', 230, 0.5); noi(t + 0.05, 1.5, rf, bufBrown); ad(r.gain, t + 0.05, 0.5, 0.12, 1.2);
  };
  S.explode = (d, t, p) => {
    const k = rr(0.88, 1.12) * (1 - 0.25 * p), L = 1 + 0.5 * p, sh = shape(d, 1.8);
    const g = gn(sh), o = osc('sine', 90 * k, t, 0.6 * L, g); sw(o.frequency, t, 95 * k, 30 * k, 0.32 * L); ad(g.gain, t, 0.95, 0.003, 0.45 * L);
    const b = gn(sh), bf = flt(b, 'lowpass', 2600, 0.8); noi(t, 0.7 * L, bf); sw(bf.frequency, t, 3000, 180, 0.4 * L); ad(b.gain, t, 0.75, 0.002, 0.45 * L);
    const m = gn(d), mf = flt(m, 'bandpass', 420 * k, 0.9); noi(t, 0.5, mf); ad(m.gain, t, 0.35, 0.004, 0.3 * L);
    grains(d, t + 0.12, 9 + ((p * 6) | 0), 0.8 * L, 0.2, 0.015, 0.05, 500, 2400, 5, 1);
    const r = gn(d), rf = flt(r, 'lowpass', 180); noi(t + 0.05, 1.1 * L, rf, bufBrown); ad(r.gain, t + 0.05, 0.4, 0.1, 0.9 * L);
  };
  S.charge = (d, t) => {
    const k = rr(0.94, 1.06), D = 0.55, lp = flt(d, 'lowpass', 3200), g = gn(lp);
    const o = osc('sine', 380 * k, t, D, g); sw(o.frequency, t, 380 * k, 1500 * k, D);
    const o2 = osc('triangle', 572 * k, t, D, gn(g, 0.35)); sw(o2.frequency, t, 572 * k, 2270 * k, D);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.11, t + D * 0.85); g.gain.exponentialRampToValueAtTime(0.0001, t + D);
    const n = gn(d), nf = flt(n, 'bandpass', 2000, 3); noi(t, D, nf); sw(nf.frequency, t, 1500, 5200, D);
    n.gain.setValueAtTime(0.0001, t); n.gain.exponentialRampToValueAtTime(0.05, t + D * 0.9); n.gain.exponentialRampToValueAtTime(0.0001, t + D + 0.02);
  };
  S.zap = (d, t, p) => {
    const k = rr(0.9, 1.1), lp = flt(d, 'lowpass', 7500);
    const c = gn(lp), cf = flt(c, 'highpass', 1700); noi(t, 0.1, cf); ad(c.gain, t, 0.8, 0.0005, 0.045);
    const t2 = t + rr(0.03, 0.07), c2 = gn(lp), cf2 = flt(c2, 'bandpass', 2600 * k, 0.8); noi(t2, 0.12, cf2); ad(c2.gain, t2, 0.5, 0.0005, 0.07);
    const z = gn(lp, 0), zf = flt(z, 'bandpass', 2100 * k, 2.2), zo = osc('sawtooth', 96 * k, t, 0.24, zf); sw(zo.frequency, t, 130 * k, 70 * k, 0.2);
    z.gain.setValueAtTime(0, t);
    for (let i = 0; i < 9; i++) z.gain.setValueAtTime(rnd() < 0.7 ? rr(0.15, 0.4) : 0.02, t + 0.002 + i * 0.022);
    z.gain.linearRampToValueAtTime(0, t + 0.23);
    grains(lp, t + 0.02, 10, 0.28, 0.3, 0.004, 0.014, 2800, 6000, 3, 1);
    const r = gn(d), rf = flt(r, 'lowpass', 170); noi(t, 1.0, rf, bufBrown); ad(r.gain, t + 0.01, 0.55 + 0.25 * p, 0.03, 0.8);
    const th = gn(d), to = osc('sine', 70, t, 0.3, th); sw(to.frequency, t, 80, 38, 0.2); ad(th.gain, t, 0.45, 0.003, 0.22);
  };
  S.clash = (d, t) => {
    const f0 = rr(1500, 2300), lp = flt(d, 'lowpass', 7000);
    const R = [1, 1.48, 2.08, 2.57, 3.31, 4.13], A = [0.3, 0.22, 0.2, 0.13, 0.09, 0.06];
    for (let i = 0; i < 6; i++) { const g = gn(lp); osc(i % 2 ? 'sine' : 'triangle', f0 * R[i] * rr(0.995, 1.005), t, 0.4, g); ad(g.gain, t, A[i], 0.001, rr(0.2, 0.32) / (1 + i * 0.45)); }
    const c = gn(lp), cf = flt(c, 'highpass', 3000); noi(t, 0.03, cf); ad(c.gain, t, 0.35, 0.0005, 0.012);
    const b = gn(lp), bf = flt(b, 'bandpass', 1200, 2.5); noi(t, 0.06, bf); ad(b.gain, t, 0.35, 0.001, 0.035);
  };
  S.slash = (d, t) => {
    const k = rr(0.85, 1.2);
    const s = gn(d), sf = flt(s, 'bandpass', 2600, 1.5); noi(t, 0.08, sf); sw(sf.frequency, t, 1500, 4200, 0.05); ad(s.gain, t, 0.12, 0.02, 0.035);
    const t1 = t + 0.04;
    const c = gn(d), cf = flt(c, 'bandpass', 800 * k, 1.4); noi(t1, 0.14, cf); sw(cf.frequency, t1, 900 * k, 280 * k, 0.08); ad(c.gain, t1, 0.7, 0.002, 0.08);
    const g = gn(d), o = osc('sine', 150 * k, t1, 0.1, g); sw(o.frequency, t1, 160 * k, 75 * k, 0.06); ad(g.gain, t1, 0.5, 0.002, 0.07);
    const b = gn(d), bf = flt(b, 'bandpass', 1700 * k, 9); noi(t1, 0.05, bf); ad(b.gain, t1, 0.25, 0.001, 0.03);
  };
  S.ratSqueal = (d, t) => {
    const k = rr(0.85, 1.2), lp = flt(d, 'lowpass', 4800), bp = flt(lp, 'bandpass', 2700 * k, 2.5);
    const n = rnd() < 0.4 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const ti = t + i * rr(0.12, 0.16), kk = k * (i ? 1.12 : 1), g = gn(bp), o = osc('sawtooth', 2100 * kk, ti, 0.16, g);
      o.frequency.setValueAtTime(2000 * kk, ti); o.frequency.exponentialRampToValueAtTime(3100 * kk, ti + 0.04); o.frequency.exponentialRampToValueAtTime(1700 * kk, ti + 0.13);
      osc('sine', rr(55, 85), ti, 0.16, gn(o.frequency, 220));
      ad(g.gain, ti, i ? 0.1 : 0.16, 0.008, 0.11);
    }
  };
  S.boneRattle = (d, t) => {
    grains(d, t, 8 + ((rnd() * 4) | 0), 0.38, 0.5, 0.012, 0.04, 600, 1900, 11, 1);
    grains(d, t + 0.02, 4, 0.3, 0.3, 0.02, 0.05, 250, 520, 8, 1);
    const g = gn(d), o = osc('sine', 210, t, 0.08, g); sw(o.frequency, t, 230, 130, 0.05); ad(g.gain, t, 0.3, 0.002, 0.05);
  };
  S.squelch = (d, t, p) => {
    const k = rr(0.8, 1.2) * (1 - 0.3 * p);
    const g = gn(d), f = flt(g, 'lowpass', 500, 7); noi(t, 0.35, f);
    f.frequency.setValueAtTime(320 * k, t); f.frequency.exponentialRampToValueAtTime(1500 * k, t + 0.07); f.frequency.exponentialRampToValueAtTime(260 * k, t + 0.26);
    ad(g.gain, t, 0.5, 0.008, 0.26);
    const b = gn(d), o = osc('sine', 170 * k, t, 0.3, b);
    o.frequency.setValueAtTime(190 * k, t); o.frequency.exponentialRampToValueAtTime(85 * k, t + 0.09); o.frequency.exponentialRampToValueAtTime(230 * k, t + 0.2);
    ad(b.gain, t, 0.4, 0.005, 0.2);
    for (let i = 0; i < 3; i++) {
      const ti = t + 0.1 + i * rr(0.05, 0.09), dg = gn(d), f0 = rr(420, 800) * k, q = osc('sine', f0, ti, 0.06, dg);
      sw(q.frequency, ti, f0, f0 * 1.9, 0.035); ad(dg.gain, ti, 0.12, 0.003, 0.035);
    }
  };
  S.batScreech = (d, t) => {
    const k = rr(0.88, 1.15), lp = flt(d, 'lowpass', 5200), bp = flt(lp, 'bandpass', 3300 * k, 3.5);
    for (let i = 0; i < 2; i++) {
      const ti = t + i * rr(0.06, 0.085), g = gn(bp), o = osc('square', 3600 * k, ti, 0.07, g);
      sw(o.frequency, ti, 3900 * k, 2500 * k, 0.055); ad(g.gain, ti, 0.07, 0.004, 0.05);
    }
    const n = gn(lp), nf = flt(n, 'bandpass', 2400, 1); noi(t, 0.16, nf); ad(n.gain, t, 0.05, 0.01, 0.12);
  };
  S.roar = (d, t, p) => {
    const k = rr(0.92, 1.06) * (1 - 0.15 * p), D = 1.25;
    const env = gn(d), am = gn(env, 0.65);
    osc('sawtooth', rr(22, 28), t, D + 0.3, gn(am.gain, 0.35));
    const f1 = flt(am, 'bandpass', 380, 4), f2 = flt(gn(am, 0.4), 'bandpass', 1050, 6), f3 = flt(gn(am, 0.9), 'lowpass', 170);
    const pre = shape(f1, 3); pre.connect(f2); pre.connect(f3);
    const src = gn(pre, 0.5), base = [80 * k, 81.3 * k, 40 * k];
    const os = [osc('sawtooth', base[0], t, D + 0.2, src), osc('sawtooth', base[1], t, D + 0.2, src), osc('square', base[2], t, D + 0.2, gn(src, 0.5))];
    for (let i = 0; i < 3; i++) {
      const b = base[i], fr = os[i].frequency;
      fr.setValueAtTime(b * 0.85, t); fr.linearRampToValueAtTime(b * 1.3, t + 0.3); fr.linearRampToValueAtTime(b * 1.1, t + 0.7); fr.linearRampToValueAtTime(b * 0.65, t + D);
    }
    f1.frequency.setValueAtTime(330, t); f1.frequency.linearRampToValueAtTime(640, t + 0.35); f1.frequency.linearRampToValueAtTime(420, t + D);
    f2.frequency.setValueAtTime(900, t); f2.frequency.linearRampToValueAtTime(1300, t + 0.35); f2.frequency.linearRampToValueAtTime(950, t + D);
    const n = gn(am, 0.12), nf = flt(n, 'bandpass', 700, 0.9); noi(t, D + 0.2, nf);
    env.gain.setValueAtTime(0.0001, t); env.gain.linearRampToValueAtTime(0.85, t + 0.12); env.gain.linearRampToValueAtTime(0.7, t + 0.7); env.gain.exponentialRampToValueAtTime(0.0001, t + D + 0.15);
  };
  S.bossStep = (d, t, p) => {
    const k = rr(0.9, 1.1) * (1 - 0.2 * p), sh = shape(d, 1.6);
    const g = gn(sh), o = osc('sine', 60 * k, t, 0.5, g); sw(o.frequency, t, 66 * k, 29 * k, 0.26); ad(g.gain, t, 1.0, 0.004, 0.36);
    const n = gn(sh), nf = flt(n, 'lowpass', 150); noi(t, 0.4, nf, bufBrown); ad(n.gain, t, 0.9, 0.004, 0.25);
    const c = gn(d), cf = flt(c, 'bandpass', 900, 0.8); noi(t + 0.015, 0.2, cf); ad(c.gain, t + 0.015, 0.1, 0.004, 0.13);
    grains(d, t + 0.05, 4, 0.25, 0.07, 0.01, 0.03, 700, 2000, 4, 1);
  };
  S.bossDie = (d, t) => {
    const D = 1.5, k = rr(0.95, 1.05);
    const env = gn(d), am = gn(env, 0.7); osc('sawtooth', 19, t, D + 0.3, gn(am.gain, 0.3));
    const f1 = flt(am, 'bandpass', 420, 4), f3 = flt(gn(am, 0.8), 'lowpass', 170);
    const pre = shape(f1, 2.5); pre.connect(f3);
    const src = gn(pre, 0.5), a = osc('sawtooth', 92 * k, t, D + 0.2, src), b = osc('sawtooth', 93.5 * k, t, D + 0.2, src);
    sw(a.frequency, t, 100 * k, 36 * k, D); sw(b.frequency, t, 101.6 * k, 37 * k, D);
    f1.frequency.setValueAtTime(560, t); f1.frequency.exponentialRampToValueAtTime(230, t + D);
    env.gain.setValueAtTime(0.0001, t); env.gain.linearRampToValueAtTime(0.8, t + 0.1); env.gain.linearRampToValueAtTime(0.5, t + D * 0.8); env.gain.exponentialRampToValueAtTime(0.0001, t + D + 0.2);
    const tc = t + 1.15, sh = shape(d, 2);
    const g = gn(sh), o = osc('sine', 75, tc, 0.9, g); sw(o.frequency, tc, 80, 24, 0.5); ad(g.gain, tc, 1.0, 0.004, 0.7);
    const n = gn(sh), nf = flt(n, 'lowpass', 1800, 0.7); noi(tc, 0.9, nf); sw(nf.frequency, tc, 2200, 120, 0.6); ad(n.gain, tc, 0.75, 0.003, 0.6);
    grains(d, tc + 0.1, 16, 1.1, 0.28, 0.02, 0.07, 300, 1800, 5, 1);
    const r = gn(d), rf = flt(r, 'lowpass', 140); noi(tc, 1.4, rf, bufBrown); ad(r.gain, tc, 0.6, 0.1, 1.2);
  };
  S.coin = (d, t, p) => {
    const f = 1560 * Math.pow(2, (p * 5 + rr(-0.4, 0.4)) / 12), lp = flt(d, 'lowpass', 6500);
    const g = gn(lp); osc('sine', f, t, 0.15, g); ad(g.gain, t, 0.2, 0.002, 0.09);
    const g2 = gn(lp); osc('sine', f * 2.42, t, 0.1, g2); ad(g2.gain, t, 0.06, 0.001, 0.05);
    ding(lp, t + 0.055, f * 1.498, 0.2);
    const c = gn(lp), cf = flt(c, 'highpass', 3500); noi(t, 0.02, cf); ad(c.gain, t, 0.06, 0.0005, 0.008);
  };
  S.hammer = (d, t, p) => {
    const k = rr(0.82, 1.22) * (1 + 0.3 * (p - 0.5));
    const n = gn(d), nf = flt(n, 'bandpass', 760 * k, 9); noi(t, 0.07, nf); ad(n.gain, t, 1.0, 0.001, 0.035);
    const g = gn(d), o = osc('sine', 200 * k, t, 0.08, g); sw(o.frequency, t, 215 * k, 140 * k, 0.05); ad(g.gain, t, 0.45, 0.001, 0.05);
    const m = gn(d); osc('sine', 2900 * k, t, 0.06, m); ad(m.gain, t, 0.045, 0.001, 0.035);
    const c = gn(d), cf = flt(c, 'highpass', 2200); noi(t, 0.02, cf); ad(c.gain, t, 0.12, 0.0005, 0.008);
  };
  S.buildDone = (d, t) => {
    const g = gn(d), o = osc('sine', 125, t, 0.25, g); sw(o.frequency, t, 130, 58, 0.14); ad(g.gain, t, 0.8, 0.003, 0.18);
    const n = gn(d), nf = flt(n, 'lowpass', 600); noi(t, 0.15, nf); ad(n.gain, t, 0.5, 0.002, 0.09);
    whoomp(d, t + 0.1, 0.5, 0.5);
    grains(d, t + 0.2, 7, 0.5, 0.12, 0.004, 0.02, 1800, 5000, 3, 1);
  };
  S.sell = (d, t) => {
    grains(d, t, 9, 0.42, 0.7, 0.03, 0.07, 280, 900, 6, 1);
    const g = gn(d), o = osc('sine', 110, t + 0.08, 0.25, g); sw(o.frequency, t + 0.08, 120, 55, 0.15); ad(g.gain, t + 0.08, 0.6, 0.004, 0.18);
    const lp = flt(d, 'lowpass', 6500);
    for (let i = 0; i < 3; i++) ding(lp, t + 0.26 + i * 0.085, 1500 * Math.pow(2, (i * 2) / 12), 0.16);
  };
  S.horn = (d, t) => {
    const f = 146.83 * rr(0.985, 1.015);
    const os = hornNote(d, t, f, 1.5, 0.5, 1);
    for (let i = 0; i < os.length; i++) { const fr = os[i][0].frequency, b = os[i][1]; fr.setValueAtTime(b, t + 0.52); fr.exponentialRampToValueAtTime(b * 1.4983, t + 0.6); }
  };
  S.hornBoss = (d, t) => {
    const f = 73.42 * rr(0.99, 1.01);
    hornNote(d, t, f, 1.25, 0.55, 0.8);
    hornNote(d, t + 1.45, f * 0.7937, 1.9, 0.6, 0.85);
    const r = gn(d), rf = flt(r, 'lowpass', 110); noi(t + 1.45, 2.2, rf, bufBrown); ad(r.gain, t + 1.45, 0.35, 0.6, 1.5);
  };
  S.leak = (d, t) => {
    const f = 196 * rr(0.97, 1.03), lp = flt(d, 'lowpass', 1900);
    const R = [0.5, 1, 1.19, 1.56, 2, 2.51], A = [0.35, 0.5, 0.3, 0.2, 0.14, 0.08], D = [1.3, 1.1, 0.8, 0.6, 0.45, 0.3];
    for (let i = 0; i < 6; i++) { const g = gn(lp); osc('sine', f * R[i], t, D[i] + 0.1, g); ad(g.gain, t, A[i] * 0.6, 0.006, D[i]); }
    const th = gn(d), tf = flt(th, 'lowpass', 300); noi(t, 0.12, tf); ad(th.gain, t, 0.4, 0.003, 0.08);
    const fl = gn(d), am = gn(fl, 0.5), ff = flt(am, 'bandpass', 520, 0.8); noi(t, 0.75, ff); osc('sine', rr(15, 21), t, 0.75, gn(am.gain, 0.5));
    sw(ff.frequency, t, 900, 260, 0.6); ad(fl.gain, t + 0.02, 0.4, 0.06, 0.55);
  };
  S.footmanDie = (d, t) => {
    const k = rr(0.9, 1.1);
    const g = gn(d), o = osc('sine', 115 * k, t, 0.25, g); sw(o.frequency, t, 120 * k, 50 * k, 0.14); ad(g.gain, t, 0.75, 0.003, 0.17);
    const n = gn(d), nf = flt(n, 'lowpass', 420); noi(t, 0.2, nf); ad(n.gain, t, 0.5, 0.003, 0.12);
    grains(d, t + 0.04, 6, 0.36, 0.22, 0.02, 0.06, 1700, 3600, 10, 1);
  };
  S.uiHover = (d, t) => {
    const g = gn(d); osc('sine', rr(1250, 1400), t, 0.05, g); ad(g.gain, t, 0.07, 0.002, 0.03);
    const c = gn(d), cf = flt(c, 'bandpass', 3000, 2); noi(t, 0.02, cf); ad(c.gain, t, 0.05, 0.0005, 0.008);
  };
  S.uiClick = (d, t) => {
    const g = gn(d), o = osc('triangle', 900, t, 0.09, g); sw(o.frequency, t, 880, 1320, 0.035); ad(g.gain, t, 0.18, 0.002, 0.06);
    const w = gn(d); osc('sine', 300, t, 0.06, w); ad(w.gain, t, 0.15, 0.001, 0.035);
    const c = gn(d), cf = flt(c, 'bandpass', 2300, 1.5); noi(t, 0.03, cf); ad(c.gain, t, 0.2, 0.0005, 0.012);
  };
  S.uiDeny = (d, t) => {
    const lp = flt(d, 'lowpass', 700);
    for (let i = 0; i < 2; i++) {
      const ti = t + i * 0.11, g = gn(lp); osc('triangle', i ? 128 : 158, ti, 0.1, g); osc('square', i ? 64 : 79, ti, 0.1, gn(g, 0.3));
      g.gain.setValueAtTime(0.0001, ti); g.gain.linearRampToValueAtTime(0.3, ti + 0.008); g.gain.setValueAtTime(0.3, ti + 0.06); g.gain.linearRampToValueAtTime(0.0001, ti + 0.085);
    }
  };
  S.crumble = (d, t) => {
    const D = 3.0;
    const r = gn(d), rf = flt(r, 'lowpass', 130, 0.6); noi(t, D + 0.4, rf, bufBrown); sw(rf.frequency, t, 170, 60, D);
    r.gain.setValueAtTime(0.0001, t); r.gain.linearRampToValueAtTime(1.0, t + 0.35); r.gain.linearRampToValueAtTime(0.7, t + D * 0.6); r.gain.exponentialRampToValueAtTime(0.0001, t + D + 0.3);
    const s = gn(d), o = osc('sine', 44, t, D, s); sw(o.frequency, t, 48, 30, D); ad(s.gain, t, 0.5, 0.4, D - 0.4);
    grains(d, t + 0.1, 26, D - 0.3, 0.5, 0.05, 0.2, 180, 700, 3, 0);
    grains(d, t + 0.2, 16, D - 0.5, 0.2, 0.01, 0.04, 800, 2600, 5, 0);
  };
  S.rise = (d, t) => {
    const D = 3.0;
    const r = gn(d), rf = flt(r, 'lowpass', 70, 0.7); noi(t, D + 0.5, rf, bufBrown); sw(rf.frequency, t, 55, 240, D * 0.9);
    r.gain.setValueAtTime(0.0001, t); r.gain.exponentialRampToValueAtTime(0.9, t + D * 0.85); r.gain.exponentialRampToValueAtTime(0.0001, t + D + 0.35);
    const s = gn(d), o = osc('sine', 32, t, D + 0.2, s); sw(o.frequency, t, 30, 62, D * 0.9);
    s.gain.setValueAtTime(0.0001, t); s.gain.exponentialRampToValueAtTime(0.45, t + D * 0.85); s.gain.exponentialRampToValueAtTime(0.0001, t + D + 0.2);
    grains(d, t + 0.5, 14, D - 0.5, 0.55, 0.05, 0.12, 240, 720, 8, 2);
    const tf = t + D - 0.05, g = gn(d), o2 = osc('sine', 90, tf, 0.5, g); sw(o2.frequency, tf, 95, 42, 0.25); ad(g.gain, tf, 0.9, 0.004, 0.4);
    const n = gn(d), nf = flt(n, 'lowpass', 500); noi(tf, 0.3, nf); ad(n.gain, tf, 0.5, 0.003, 0.2);
  };
  S.beaconOut = (d, t) => {
    const w = gn(d), am = gn(w, 0.7), wf = flt(am, 'bandpass', 2400, 1.4); noi(t, 2.0, wf); sw(wf.frequency, t, 2600, 110, 1.7);
    osc('sine', 13, t, 2.0, gn(am.gain, 0.3));
    w.gain.setValueAtTime(0.0001, t); w.gain.linearRampToValueAtTime(0.7, t + 0.25); w.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
    const lw = gn(d), lf = flt(lw, 'lowpass', 400); noi(t, 1.6, lf, bufBrown); sw(lf.frequency, t, 500, 70, 1.4); ad(lw.gain, t, 0.6, 0.2, 1.3);
    const td = t + 0.7, dr = gn(d), dl = flt(dr, 'lowpass', 500);
    osc('sine', 55, td, 2.8, gn(dl, 0.6)); osc('sine', 82.6, td, 2.8, gn(dl, 0.35)); osc('triangle', 110.7, td, 2.8, gn(dl, 0.18)); osc('sine', 164.2, td, 2.8, gn(dl, 0.1));
    dr.gain.setValueAtTime(0.0001, td); dr.gain.linearRampToValueAtTime(0.5, td + 1.0); dr.gain.exponentialRampToValueAtTime(0.0001, td + 2.7);
    const a = gn(d), af = flt(a, 'bandpass', 3200, 0.7); noi(td, 2.6, af, bufPink);
    a.gain.setValueAtTime(0.0001, td); a.gain.linearRampToValueAtTime(0.06, td + 1.0); a.gain.exponentialRampToValueAtTime(0.0001, td + 2.6);
  };
  S.ignite = (d, t, p) => {
    whoomp(d, t, 0.75, 0.7 + 0.3 * p);
    grains(d, t + 0.12, 12, 0.9, 0.16, 0.004, 0.02, 1800, 5200, 3, 1);
    const r = gn(d), rf = flt(r, 'bandpass', 420, 0.7); noi(t + 0.1, 1.1, rf); ad(r.gain, t + 0.1, 0.18, 0.15, 0.85);
  };
  S.splash = (d, t) => {
    const k = rr(0.85, 1.15);
    const g = gn(d), f = flt(g, 'bandpass', 1300 * k, 0.8); noi(t, 0.4, f); sw(f.frequency, t, 900 * k, 2200 * k, 0.12); ad(g.gain, t, 0.45, 0.012, 0.28);
    const b = gn(d), o = osc('sine', 300 * k, t, 0.1, b); sw(o.frequency, t, 320 * k, 110 * k, 0.07); ad(b.gain, t, 0.4, 0.003, 0.07);
    grains(d, t + 0.08, 5, 0.32, 0.12, 0.006, 0.02, 2000, 4200, 6, 1);
  };

  const DEF = {
    bow: [S.bow, 0.05, 0.18, 1, 0.3, 0.55],
    arrowHit: [S.arrowHit, 0.045, 0.12, 0, 0.15, 0.5],
    cannon: [S.cannon, 0.09, 0.45, 2, 1.6, 0.9],
    explode: [S.explode, 0.08, 0.5, 2, 1.5, 0.85],
    charge: [S.charge, 0.12, 0.3, 0, 0.6, 0.6],
    zap: [S.zap, 0.09, 0.45, 1, 1.1, 0.7],
    clash: [S.clash, 0.06, 0.25, 1, 0.4, 0.55],
    slash: [S.slash, 0.06, 0.15, 1, 0.2, 0.55],
    ratSqueal: [S.ratSqueal, 0.09, 0.2, 0, 0.3, 0.5],
    boneRattle: [S.boneRattle, 0.07, 0.2, 1, 0.45, 0.6],
    squelch: [S.squelch, 0.08, 0.2, 1, 0.45, 0.6],
    batScreech: [S.batScreech, 0.09, 0.3, 0, 0.2, 0.5],
    roar: [S.roar, 0.6, 0.5, 3, 1.5, 0.85],
    bossStep: [S.bossStep, 0.12, 0.35, 2, 0.6, 0.9],
    bossDie: [S.bossDie, 1.0, 0.5, 3, 2.6, 0.9],
    coin: [S.coin, 0.035, 0.15, 0, 0.35, 0.5],
    hammer: [S.hammer, 0.05, 0.2, 0, 0.12, 0.5],
    buildDone: [S.buildDone, 0.12, 0.3, 1, 0.8, 0.65],
    sell: [S.sell, 0.15, 0.25, 1, 0.8, 0.6],
    horn: [S.horn, 1.0, 0.6, 3, 2.2, 0.75],
    hornBoss: [S.hornBoss, 1.5, 0.65, 3, 4.0, 0.8],
    leak: [S.leak, 0.15, 0.45, 2, 1.4, 0.7],
    footmanDie: [S.footmanDie, 0.09, 0.25, 1, 0.5, 0.6],
    uiHover: [S.uiHover, 0.04, 0, 2, 0.06, 0.6],
    uiClick: [S.uiClick, 0.04, 0.05, 3, 0.1, 0.7],
    uiDeny: [S.uiDeny, 0.1, 0.05, 3, 0.25, 0.7],
    crumble: [S.crumble, 1.0, 0.5, 3, 3.4, 0.9],
    rise: [S.rise, 1.0, 0.5, 3, 3.5, 0.85],
    beaconOut: [S.beaconOut, 1.5, 0.6, 3, 3.6, 0.85],
    ignite: [S.ignite, 0.15, 0.35, 2, 1.2, 0.7],
    splash: [S.splash, 0.09, 0.3, 0, 0.5, 0.5],
  };
  const CAP = [16, 22, 28, 34];

  function play(name, pan, gain, p) {
    if (!api.ready) return;
    const df = DEF[name];
    if (!df) return;
    const g = gain === undefined ? 1 : +gain;
    if (!(g > 0.003)) return;
    const now = ctx.currentTime;
    if (now - (last[name] === undefined ? -9 : last[name]) < df[1]) return;
    let c = 0;
    for (let i = ends.length - 1; i >= 0; i--) { if (ends[i] <= now) { ends[i] = ends[ends.length - 1]; ends.pop(); } else c++; }
    if (c >= CAP[df[3]]) return;
    last[name] = now;
    const t = now + 0.006 + rnd() * 0.014;
    const v = voice(+pan || 0, cl(g, 0, 1.5) * df[5], df[2], nSfx);
    V = v;
    try { df[0](v.out, t, cl(+p || 0, 0, 1)); } catch (e) {}
    finishVoice(v);
    ends.push(t + df[4]);
  }

  function startBeds() {
    bed.windG = gn(nAmb, 0); bed.windG.connect(gn(nRevIn, 0.12));
    bed.gustG = gn(bed.windG, 0.7);
    for (let i = 0; i < 2; i++) { const lf = flt(flt(panNode(i ? 0.55 : -0.55, bed.gustG), 'highpass', 110, 0.5), 'lowpass', 420, 0.4); loopSrc(bufPink, gn(lf, 2.6), 0.8 + i * 0.13); bed.windLP.push(lf); }
    bed.whG = gn(bed.gustG, 0); bed.whF = flt(bed.whG, 'bandpass', 800, 7); loopSrc(bufPink, gn(bed.whF, 3), 1.0);
    bed.fireG = gn(nAmb, 0);
    const hiss = flt(flt(gn(bed.fireG, 0.1), 'lowpass', 4500), 'highpass', 900); loopSrc(bufWhite, hiss, 1.0);
    const roarG = gn(bed.fireG, 0.32), roarF = flt(flt(roarG, 'highpass', 75, 0.5), 'lowpass', 280, 0.5); loopSrc(bufBrown, roarF, 1.0);
    loopOsc('sine', 6.7, gn(roarG.gain, 0.1)); loopOsc('sine', 2.3, gn(roarG.gain, 0.07));
    bed.popBus = gn(bed.fireG, 2.0); bed.popBus.connect(gn(nRevIn, 0.1));
    bed.droneG = gn(nMusic, 0); bed.droneG.connect(gn(nRevIn, 0.3));
    bed.droneLP = flt(bed.droneG, 'lowpass', 300, 0.6);
    const dv = gn(null, 4); loopOsc('sine', 4.9, dv);
    [[73.42, -5, 0.5], [73.42, 6, 0.5], [36.71, 0, 0.3], [110.0, 3, 0.12]].forEach((a) => { const o = loopOsc('sawtooth', a[0], gn(bed.droneLP, a[2])); o.detune.value = a[1]; dv.connect(o.detune); });
  }
  function pop() {
    const t = ctx.currentTime + rnd() * 0.08, big = rnd() < 0.12;
    const g = gn(null, 0), f = flt(g, 'bandpass', big ? rr(500, 1100) : rr(1400, 5200), rr(1.5, 6));
    const out = panNode(rr(-0.7, 0.7), bed.popBus); g.connect(out);
    const s = ctx.createBufferSource(); s.buffer = bufWhite; s.connect(f);
    const dur = big ? rr(0.025, 0.05) : rr(0.004, 0.018);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(big ? 0.5 : rr(0.12, 0.4), t + 0.0008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.start(t, rnd() * 1.8); s.stop(t + dur + 0.02);
    s.onended = () => { try { g.disconnect(); out.disconnect(); } catch (e) {} };
  }
  function setAmbience(fire, wind, tension) {
    tgt.fire = cl(+fire || 0, 0, 1); tgt.wind = cl(+wind || 0, 0, 1); tgt.tension = cl(+tension || 0, 0, 1);
  }

  const CH = [
    { n: [38, 45, 50, 53, 57], m: [62, 65, 69, 72, 74, 76], to: [1, 2, 4, 3] },
    { n: [34, 41, 50, 53, 58], m: [62, 65, 70, 74, 69], to: [2, 0, 4] },
    { n: [31, 43, 46, 50, 55], m: [62, 67, 70, 74, 69], to: [0, 3, 1] },
    { n: [33, 40, 45, 48, 52], m: [64, 69, 72, 76, 67], to: [0, 1] },
    { n: [29, 41, 45, 48, 53], m: [60, 65, 69, 72, 77, 67], to: [2, 0, 1] },
  ];
  function padChord(t, c, dur) {
    const v = voice(0, 1, 0.5, nMusic); V = v;
    const env = gn(v.out), hp = flt(env, 'highpass', 50), sides = [], open = rr(560, 700);
    for (let s = 0; s < 2; s++) {
      const l = flt(panNode(s ? 0.4 : -0.4, hp), 'lowpass', 380, 0.5);
      l.frequency.setValueAtTime(380, t); l.frequency.linearRampToValueAtTime(open, t + dur * 0.5); l.frequency.linearRampToValueAtTime(400, t + dur + 4);
      sides.push(l);
    }
    const vib = gn(null, rr(2.5, 4)); osc('sine', rr(4.4, 5.2), t, dur + 7, vib);
    for (let i = 0; i < c.n.length; i++) {
      const f = mtof(c.n[i]);
      for (let s = 0; s < 2; s++) { const o = osc('sawtooth', f, t, dur + 7, gn(sides[s], i === 0 ? 0.05 : 0.036)); o.detune.value = (s ? 1 : -1) * rr(4, 8); vib.connect(o.detune); }
    }
    env.gain.setValueAtTime(0.0001, t); env.gain.linearRampToValueAtTime(1, t + 3.5); env.gain.setTargetAtTime(0.0001, t + dur, 1.3);
    finishVoice(v);
  }
  function pianoNote(t, m, vel) {
    const f = mtof(m), v = voice(rr(-0.3, 0.3), 1, 0.8, nMusic); V = v;
    const lp = flt(v.out, 'lowpass', 2200, 0.4);
    lp.frequency.setValueAtTime(Math.min(3200, f * 5), t); lp.frequency.exponentialRampToValueAtTime(Math.max(300, f * 1.3), t + 2.2);
    const dec = 3.6 * Math.pow(440 / f, 0.35), H = [[1, 1, 1], [2.002, 0.3, 0.55], [3.006, 0.1, 0.35], [4.012, 0.04, 0.22]];
    for (let i = 0; i < H.length; i++) { const h = H[i], g = gn(lp); osc('sine', f * h[0], t, dec * h[2] + 0.1, g); ad(g.gain, t, vel * 0.11 * h[1], 0.007, dec * h[2]); }
    const tg = gn(lp); osc('triangle', f, t, dec * 0.5, tg); ad(tg.gain, t, vel * 0.03, 0.006, dec * 0.4);
    const n = gn(v.out), nf = flt(n, 'lowpass', 900); noi(t, 0.05, nf); ad(n.gain, t, vel * 0.03, 0.002, 0.03);
    finishVoice(v);
  }
  function timp(t, vel) {
    const v = voice(rr(-0.15, 0.15), 1, 0.6, nMusic); V = v;
    const g = gn(v.out), o = osc('sine', 73.4, t, 1.3, g); sw(o.frequency, t, 80, 72.5, 0.08); ad(g.gain, t, vel, 0.006, 1.1);
    const g2 = gn(v.out); osc('sine', 110.4, t, 0.7, g2); ad(g2.gain, t, vel * 0.35, 0.005, 0.5);
    const g3 = gn(v.out); osc('sine', 147.5, t, 0.4, g3); ad(g3.gain, t, vel * 0.15, 0.004, 0.3);
    const n = gn(v.out), nf = flt(n, 'lowpass', 200); noi(t, 0.1, nf); ad(n.gain, t, vel * 0.6, 0.003, 0.06);
    finishVoice(v);
  }
  function pickNote(c) {
    let m = c.m[(rnd() * c.m.length) | 0];
    if (m === mus.lastNote) m = c.m[(c.m.indexOf(m) + 1) % c.m.length];
    mus.lastNote = m; return m;
  }
  function musicTick(now) {
    if (now > mus.nextChord - 0.3) {
      const t = Math.max(mus.nextChord, now + 0.05), c = CH[mus.chord], dur = rr(11, 15);
      padChord(t, c, dur);
      if (rnd() < 0.75) {
        const t1 = t + rr(3, 6.5); pianoNote(t1, pickNote(c), rr(0.6, 1));
        if (rnd() < 0.35) pianoNote(t1 + rr(2.4, 4.2), pickNote(c), rr(0.45, 0.8));
      }
      mus.nextChord = t + dur - 1.0;
      mus.chord = c.to[(rnd() * c.to.length) | 0];
    }
    if (cur.tension > 0.12) {
      if (mus.timpAt < now - 1) mus.timpAt = now + 0.4;
      if (now > mus.timpAt - 0.2) {
        const t = Math.max(mus.timpAt, now + 0.03), vel = 0.22 * cur.tension;
        timp(t, vel * (mus.timpN % 4 === 0 ? 1 : 0.7));
        if (mus.timpN % 4 === 3) timp(t + 1.8, vel * 0.45);
        mus.timpN++; mus.timpAt = t + 2.4;
      }
    }
  }

  function sync() { api.ready = !!ctx && ctx.state === 'running'; }
  function build() {
    sr = ctx.sampleRate;
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -8; lim.knee.value = 4; lim.ratio.value = 16; lim.attack.value = 0.002; lim.release.value = 0.18;
    lim.connect(ctx.destination);
    const sh = (dest, type, f, g, q) => { const b = flt(dest, type, f, q); b.gain.value = g; return b; };
    nMaster = gn(sh(sh(sh(flt(flt(lim, 'highpass', 32, 0.7), 'highpass', 32, 0.7), 'highshelf', 3000, 6), 'peaking', 1200, 3, 0.7), 'lowshelf', 180, -10), 0); nMaster.gain.setValueAtTime(0.0001, ctx.currentTime); nMaster.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.6);
    nMute = gn(nMaster, api.muted ? 0 : 1);
    nSfx = gn(nMute, 1); nAmb = gn(nMute, 0.9); nMusic = gn(nMute, 0.5);
    makeBuffers();
    const conv = ctx.createConvolver(); conv.buffer = makeImpulse();
    conv.connect(gn(nMute, 0.5));
    nRevIn = gn(null, 1); nRevIn.connect(flt(conv, 'highpass', 120));
    startBeds();
    mus.nextChord = ctx.currentTime + 1.5; mus.chord = 0;
  }
  function unlock() {
    if (!ctx) {
      const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return false;
      try { ctx = new AC(); build(); ctx.onstatechange = sync; }
      catch (e) { try { if (ctx && ctx.close) ctx.close(); } catch (e2) {} ctx = null; api.ready = false; return false; }
    }
    if (ctx.state !== 'running' && ctx.resume) { const pr = ctx.resume(); if (pr && pr.then) pr.then(sync, () => {}); }
    sync();
    return api.ready;
  }
  let pausedByPage = false;
  function setPaused(b) {
    if (!ctx) return;
    if (b && ctx.state === 'running') { pausedByPage = true; if (ctx.suspend) ctx.suspend(); }
    else if (!b && pausedByPage) { pausedByPage = false; if (ctx.resume) { const pr = ctx.resume(); if (pr && pr.then) pr.then(sync, () => {}); } }
  }
  function setMuted(b) {
    api.muted = !!b;
    if (ctx && nMute) nMute.gain.setTargetAtTime(api.muted ? 0 : 1, ctx.currentTime, 0.06);
  }
  function setP(key, param, v, now) { if (Math.abs(v - app[key]) > 0.004) { app[key] = v; param.setTargetAtTime(v, now, 0.12); } }
  function update(dt) {
    if (!ctx) return;
    sync();
    if (!api.ready) return;
    dt = cl(+dt || 0.016, 0, 0.1);
    const now = ctx.currentTime, k = 1 - Math.exp(-dt * 2.5);
    cur.fire += (tgt.fire - cur.fire) * k; cur.wind += (tgt.wind - cur.wind) * k; cur.tension += (tgt.tension - cur.tension) * k;
    setP('fire', bed.fireG.gain, cur.fire, now);
    setP('wind', bed.windG.gain, cur.wind, now);
    if (Math.abs(cur.tension - app.tension) > 0.004) {
      app.tension = cur.tension;
      bed.droneG.gain.setTargetAtTime(cur.tension * 0.1, now, 0.3);
      bed.droneLP.frequency.setTargetAtTime(280 + 220 * cur.tension, now, 0.3);
      nMusic.gain.setTargetAtTime(0.5 + 0.15 * cur.tension, now, 0.3);
    }
    bed.timer -= dt;
    if (bed.timer <= 0) {
      bed.timer = rr(2, 5);
      const tc = rr(1.2, 3), f = rr(200, 520) * (0.7 + 0.6 * cur.wind);
      for (let i = 0; i < bed.windLP.length; i++) bed.windLP[i].frequency.setTargetAtTime(f * rr(0.85, 1.15), now, tc);
      bed.gustG.gain.setTargetAtTime(rr(0.45, 1.0), now, tc);
      const w = rnd(); bed.whG.gain.setTargetAtTime(w * w * 0.3, now, tc); bed.whF.frequency.setTargetAtTime(rr(600, 1100), now, tc);
    }
    if (cur.fire > 0.02) {
      bed.popAcc += dt * (1.5 + 13 * cur.fire);
      let n = 0;
      while (bed.popAcc >= 1 && n++ < 4) { bed.popAcc -= rr(0.5, 1.5); pop(); }
      if (bed.popAcc > 4) bed.popAcc = 0;
    }
    musicTick(now);
  }

  return api;
})();


const CAM = { yaw: PI / 4, elev: 38 * PI / 180, dist: 90, x: 0, y: 0, z: 0, zoom: 1, fx: 0, fz: 0, sx: 0, sz: 0, man: false, mx: 0, mz: 0, mzoom: 1, base: 27, aspect: 1.6, za: null };
const _cr = new THREE.Vector3(), _cu = new THREE.Vector3(), _cd = new THREE.Vector3(), _ct = new THREE.Vector3();
function applyCamera() {
  const cam = R.cam, e = CAM.elev, sy = Math.sin(CAM.yaw), cy = Math.cos(CAM.yaw);
  _cd.set(Math.cos(e) * sy, Math.sin(e), Math.cos(e) * cy); _cr.set(cy, 0, -sy); _cu.set(-Math.sin(e) * sy, Math.cos(e), -Math.sin(e) * cy);
  const aspect = R.dw / R.dh, base = Math.max(R.viewH, lerp(R.fitTall, R.fitW, smooth(.62, 1.15, aspect)) / aspect), vh = base / CAM.zoom;
  CAM.base = base; CAM.aspect = aspect;
  R.px = vh / R.ih; R.viewW = vh * aspect; R.dofScale = base / R.viewH / CAM.zoom;
  _ct.set(CAM.x, CAM.y, CAM.z).addScaledVector(_cr, FX.shakeX).addScaledVector(_cu, FX.shakeY - R.shiftY + (R.hudTop || 0) / R.dh * vh * .5);
  const u = _ct.dot(_cr), v = _ct.dot(_cu), us = Math.round(u / R.px) * R.px, vs = Math.round(v / R.px) * R.px;
  R.sub.set((u - us) / R.px, (v - vs) / R.px);
  R.ditherOfs.set(((Math.round(us / R.px) % 8) + 8) % 8, ((Math.round(vs / R.px) % 8) + 8) % 8);
  _ct.addScaledVector(_cr, us - u).addScaledVector(_cu, vs - v);
  cam.left = -vh * aspect / 2; cam.right = vh * aspect / 2; cam.top = vh / 2; cam.bottom = -vh / 2; cam.near = 1; cam.far = 210;
  cam.position.copy(_ct).addScaledVector(_cd, CAM.dist); cam.up.set(0, 1, 0); cam.lookAt(_ct);
  cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
  R.focusZ = CAM.dist;
  R.dofD = (BH - _ct.x) * _cd.x - _ct.y * _cd.y + (BH - _ct.z) * _cd.z;
}
function updateCamera(dt) {
  const B = G.B; let wx = 0, wz = 0, ws = 7, boss = false;
  if (G.phase === 'play' || G.phase === 'defeat') {
    for (const m of G.mons) {
      if (m.dead || (!m.vis && !m.fly)) continue;
      let w = 1 + 2.5 * m.prog; if (m.foe) w *= 2.4; if (m.flash > 0) w *= 1.5; if (m.def.boss) { w *= 16; boss = true; }
      wx += m.x * w; wz += m.z * w; ws += w;
    }
    for (const t of G.towers) if (t.recent > 5) { const w = Math.min(4, t.recent / 20); wx += t.x * w; wz += t.z * w; ws += w; }
  }
  let tx = wx / ws, tz = wz / ws; const l = Math.hypot(tx, tz), lim = lerp(10.5, 6.5, smooth(.62, 1.15, CAM.aspect)); if (l > lim) { tx *= lim / l; tz *= lim / l; }
  const away = G.phase === 'clear' || G.phase === 'crumble' || G.phase === 'rise';
  if (away) { tx = 0; tz = 0; }
  CAM.fx = damp(CAM.fx, tx, .9, dt); CAM.fz = damp(CAM.fz, tz, .9, dt);
  CAM.sx = damp(CAM.sx, CAM.fx, .8, dt); CAM.sz = damp(CAM.sz, CAM.fz, .8, dt);
  if (away) { CAM.man = false; CAM.za = null; }
  if (CAM.za) { const a = CAM.za, z0 = CAM.man ? CAM.mzoom : CAM.zoom, r = a.to / z0; camZoomAt(Math.pow(r, 1 - Math.exp(-dt * (a.rate || 9))), a.px, a.py); if (Math.abs(Math.log(a.to / CAM.mzoom)) < .012 || Math.abs(CAM.mzoom - z0) < 1e-5) CAM.za = null; }
  if (CAM.man) { CAM.x = CAM.sx = CAM.mx; CAM.z = CAM.sz = CAM.mz; CAM.zoom = CAM.mzoom; }
  else {
    CAM.x = CAM.sx; CAM.z = CAM.sz;
    const zt = away ? .62 : (G.phase === 'defeat' ? .92 : (boss ? 1.14 : 1));
    CAM.zoom = damp(CAM.zoom, zt, zt < CAM.zoom ? 1.1 : .7, dt);
  }
  CAM.y = damp(CAM.y, away ? -2.2 : .4, 1, dt);
  const lk = window.__cw && window.__cw.lock; if (lk) { CAM.x = lk[0]; CAM.z = lk[1]; CAM.zoom = lk[2] || 1; }
}

function camGrab() { if (!CAM.man) { CAM.man = true; CAM.mx = CAM.x; CAM.mz = CAM.z; CAM.mzoom = CAM.zoom; } }
function camZoomMin() { return Math.min(1, CAM.base * CAM.aspect / 56, CAM.base / 46); }
function camPan(dx, dy) {
  if (G.phase === 'crumble' || G.phase === 'rise' || G.phase === 'clear') return;
  camGrab(); const upp = CAM.base * CAM.aspect / CAM.mzoom / R.dw, se = Math.sin(CAM.elev), sy = Math.sin(CAM.yaw), cy = Math.cos(CAM.yaw), du = dx * upp, dv = -dy * upp;
  CAM.mx = clamp(CAM.mx - cy * du + sy * dv / se, -17, 17); CAM.mz = clamp(CAM.mz + sy * du + cy * dv / se, -17, 17);
}
function camZoomAt(f, px, py) {
  if (G.phase === 'crumble' || G.phase === 'rise' || G.phase === 'clear') return;
  camGrab(); const z0 = CAM.mzoom, z1 = clamp(z0 * f, camZoomMin(), 3), k = 1 - z0 / z1, upp = CAM.base * CAM.aspect / z0 / R.dw;
  const a = (px - R.dw / 2) * upp * k, b = -(py - R.dh / 2) * upp * k / Math.sin(CAM.elev), sy = Math.sin(CAM.yaw), cy = Math.cos(CAM.yaw);
  CAM.mx = clamp(CAM.mx + cy * a - sy * b, -17, 17); CAM.mz = clamp(CAM.mz - sy * a - cy * b, -17, 17); CAM.mzoom = z1;
}
function camReset() { CAM.man = false; CAM.za = null; }
function camZoomTo(z, px, py, rate) { CAM.za = { to: clamp(z, camZoomMin(), 3), px: px === undefined ? R.dw / 2 : px, py: py === undefined ? R.dh / 2 : py, rate }; }
function camZoomNow() { return CAM.za ? CAM.za.to : CAM.man ? CAM.mzoom : CAM.zoom; }
function camZoomBy(f) { camZoomTo(camZoomNow() * f); }

function sfx(name, x, z, gain = 1, p = 0) {
  if (!AU.ready) return;
  const dx = x - CAM.x, dz = z - CAM.z, u = dx * Math.cos(CAM.yaw) - dz * Math.sin(CAM.yaw);
  AU.play(name, clamp(u / ((R.viewW || 40) * .5), -1, 1) * .75, gain * clamp(1.12 - Math.hypot(dx, dz) / 46, .4, 1) * (.72 + .28 * CAM.zoom), p);
}

const _mm = new THREE.Matrix4(), _mq = new THREE.Quaternion(), _mv = new THREE.Vector3(), _ms = new THREE.Vector3(1, 1, 1), _torch = [];
function step(rdt) {
  G.slowmo = Math.max(0, G.slowmo - rdt);
  const dt = rdt * (G.slowmo > 0 ? lerp(1, .32, sat(G.slowmo / .35)) : 1);
  G.t += dt; SH.uTime.value = G.t;
  const B = G.B;
  beginParts(); G.hbars.length = 0;
  updateFX(dt, G.t);
  const live = G.phase === 'play' || G.phase === 'defeat' || G.phase === 'clear';
  if (live) {
    updateWaves(dt); aiThink(dt);
    for (const t of G.towers) if (t.alive) t.update(dt);
    updateUnits(dt);
    for (let i = G.mons.length - 1; i >= 0; i--) if (G.mons[i].dead) swapRemove(G.mons, i);
    updateProjectiles(dt);
    for (const m of G.mons) drawMonster(m, G.t);
    for (const f of G.men) if (!f.dead) drawFootman(f);
    if (G.phase === 'play') {
      const k0 = (G.gold >= 70 ? 1 : .5) * (UI.manual ? 1.25 : 1);
      for (let i = 0; i < B.pads.length; i++) {
        const p = B.pads[i]; if (p.tower) continue;
        _mm.compose(_mv.set(p.x, p.y, p.z), _mq.setFromAxisAngle(_upv, p.face + Math.sin(G.t * 1.3 + i * 2.1) * .3), _ms); KIT.marker.put(_mm, 0, null);
        const w = .5 + .5 * Math.sin(G.t * 2.1 + i * 1.7), sz = 3.7 + .25 * w, a = (.55 + .45 * w) * k0;
        FX.add.push(p.x, p.y + .07, p.z, sz, sz, 0, 0, 2.6, 1.6, .55, a, 4, 0, .52, 1);
      }
    }
  }
  const spray = B.bio.spray;
  if (live && B.fallAt && spray === 'lava') {
    const f = B.fallAt, ax = Math.abs(f.oz), az = Math.abs(f.ox);
    if (rnd() < dt * 9) { const tau = rr(.1, 1.1), o = f.ext + f.v0 * tau, sd = rr(-.8, .8) * f.w; fxPart(f.x + f.ox * o + ax * sd, f.y - 4.5 * tau * tau, f.z + f.oz * o + az * sd, f.ox * rr(.2, 1.2) + rr(-.4, .4), rr(.2, 1.6), f.oz * rr(.2, 1.2) + rr(-.4, .4), rr(.6, 1.3), rr(.045, .075), rr(1.8, 3), rr(.6, 1.1), .12, { grav: 2.5, drag: .4, wob: 1 }); }
    if (rnd() < dt * 5) { const tau = rr(.5, 1.2), o = f.ext + f.v0 * tau, sd = rr(-.7, .7) * f.w; fxSmoke(f.x + f.ox * o + ax * sd, f.y - 4.5 * tau * tau, f.z + f.oz * o + az * sd, f.ox * rr(.1, .4), rr(.5, 1.3), f.oz * rr(.1, .4), rr(1.6, 2.8), rr(.4, .7), 1.1, .16, .12, .11, .3, { drag: .5, rise: .2 }); }
  }
  if (live && B.fallAt && spray === 'water') {
    const f = B.fallAt, ax = Math.abs(f.oz), az = Math.abs(f.ox);
    if (rnd() < dt * 16) { const tau = rr(.7, 1.25), o = f.ext + f.v0 * tau, d = 4.5 * tau * tau, sd = rr(-.8, .8) * f.w; fxSmoke(f.x + f.ox * o + ax * sd, f.y - d, f.z + f.oz * o + az * sd, f.ox * rr(.1, .5), rr(-1.6, -.6), f.oz * rr(.1, .5), rr(.9, 1.7), rr(.3, .5), .8, .9, 1.15, 1.5, .14, { drag: .5 }); }
    if (rnd() < dt * 16) { const tau = rr(.05, .5), o = f.ext + f.v0 * tau, sd = rr(-.9, .9) * f.w; fxPart(f.x + f.ox * o + ax * sd, f.y - 4.5 * tau * tau, f.z + f.oz * o + az * sd, f.ox * rr(.8, 1.6) + rr(-.3, .3), rr(-1, .6) - 9 * tau, f.oz * rr(.8, 1.6) + rr(-.3, .3), rr(.5, .9), rr(.04, .065), .3, .42, .62, { grav: 9, drag: .2 }); }
  }
  updateDebris(dt, FX.groundAt, d => { UI.coinFrom(d.p.x, d.p.y, d.p.z, d.value || 0); fxTimed(5, d.p.x, d.p.y, d.p.z, .5, .5, 2.4, 1.8, .6, .8, .12); });
  updatePhase(dt);
  updateCamera(dt);
  updateLights(dt, G.t, CAM.x, CAM.z);
  _torch.length = 0;
  for (const m of G.mons) if ((m.torch || m.glowL) && !m.dead && m.vis) _torch.push(m);
  for (const f of G.men) if (f.torch && !f.dead) _torch.push(f);
  for (const a of G.arrows) _torch.push(a);
  updateTorchLights(dt, _torch, CAM.x, CAM.z);
  collectMistLights();
  endParts(); endFX();
  UI.update(rdt);
  if (AU.ready) { let lit = 0; for (const t of G.towers) if (t.alive && t.em.on > .5 && t.kind !== 'spire') lit++; AU.setAmbience(sat((.3 + lit * .06) * LT.beaconOn + .05), sat((G.phase === 'play' ? .5 : .85) * B.bio.wind), G.bossAlive && G.phase === 'play' ? 1 : 0); AU.update(rdt); }
}

let _last = 0, _acc = 0, _frames = 0, _slow = 0, _fast = 0, _hold = 0, _back = 12;
function frame(now) {
  requestAnimationFrame(frame);
  if (now - _last < 10.5) return;
  const raw = (now - _last) / 1000, rdt = Math.min(.05, Math.max(.001, raw)); _last = now; R.frameDt = rdt;
  if (G.paused) { updateCamera(rdt); UI.update(rdt); } else for (let i = 0; i < G.speed; i++) step(rdt);
  R.fade = Math.min(1, R.fade + rdt * 1.6);
  applyCamera(); renderFrame(); UI.draw();
  if (document.hidden || raw > .25 || window.__FILM__) { _acc = 0; _frames = 0; return; } // connect-ai-three: fixed quality while the kit films the page
  _acc += raw; _frames++;
  if (_acc >= 2) {
    const ms = _acc / _frames * 1000;
    R.fpsText = (1000 / ms).toFixed(0) + ' fps  ' + R.iw + 'x' + R.ih + '  calls ' + R.renderer.info.render.calls + '  mons ' + G.mons.length;
    if (ms > 22.5) { _slow++; _fast = 0; } else { _slow = 0; _fast = ms < 18.6 ? _fast + 1 : 0; }
    _hold -= _acc;
    if (!HASH.noscale) {
      if (_slow >= 3 && R.quality <= .55 && !R.lite) { R.lite = 1; _slow = 0; LT.moon.shadow.mapSize.set(1024, 1024); if (LT.moon.shadow.map) { LT.moon.shadow.map.dispose(); LT.moon.shadow.map = null; } }
      if (_slow >= 2 && R.quality > .55) { R.quality = Math.max(.55, R.quality - .15); resizeRenderer(); _slow = 0; _hold = _back; _back = Math.min(480, _back * 2); }
      else if (_fast >= 3 && R.quality < 1 && _hold <= 0) { R.quality = Math.min(1, R.quality + .15); resizeRenderer(); _fast = 0; }
    }
    _acc = 0; _frames = 0;
  }
}

function boot() {
  if (window.matchMedia && matchMedia('(pointer: coarse)').matches && !HASH.noscale) R.quality = .85;
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) FX.shakeK = .25;
  initRenderer(); initMaterials(); resizeRenderer(); initLights(); initFX(); initWeather(); initKits(); UI.init();
  KIT.marker = new PartBatch(S => {
    const gold = mulC(COL.gold, .85), amber = C(0xc9682a);
    S.box(.08, 1.15, .08, 0, .57, 0, COL.woodD, { l: L_WOOD, r: [0, 0, .05] }); S.cone(.07, .14, .03, 1.2, 0, COL.brass, { n: 4, l: L_METAL, emis: .05 });
    for (const [order, nz] of [[[0, 1, 2, 0, 2, 3], 1], [[0, 3, 2, 0, 2, 1], -1]]) { const q = [[.06, 1.1, 0], [.06, .68, 0], [.44, .78, 0], [.62, .89, 0]], cols = [gold, amber, amber, gold]; for (const k of order) S.v(q[k][0], q[k][1], q[k][2], 0, 0, nz, cols[k][0], cols[k][1], cols[k][2], q[k][0] * .5, q[k][1] * .5, L_CLOTH, .9, 0, .05); }
    S.rock(.12, -.2, .04, .15, C(0x767b88), {}); S.rock(.09, .22, .03, -.12, C(0x4c505c), {});
  }, 14, { rad: .1 });
  G.boardSeed = HASH.seed ? +HASH.seed : 1 + Math.floor(Math.random() * 9000);
  G.boardIndex = +(HASH.board || 0); G.level = +(HASH.level || 0);
  { const bi = HASH.biome === undefined ? -1 : BIOMES.findIndex(b => b.key === HASH.biome || b.name.toLowerCase() === String(HASH.biome).toLowerCase()); BIOME.start = (bi >= 0 ? bi : HASH.biome !== undefined && isFinite(+HASH.biome) ? +HASH.biome : HASH.seed ? 0 : Math.floor(Math.random() * BIOMES.length)) - G.boardIndex; }
  const B = G.B = buildBoard(G.boardSeed++, G.boardIndex++);
  R.scene.add(B.group); activateBoard(B, true);
  beginBattle(true);
  window.addEventListener('resize', resizeRenderer);
  window.addEventListener('orientationchange', () => setTimeout(resizeRenderer, 120));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resizeRenderer);
  R.canvas.addEventListener('webglcontextlost', e => e.preventDefault());
  R.canvas.addEventListener('webglcontextrestored', () => location.reload());
  document.addEventListener('visibilitychange', () => { AU.setPaused(document.hidden); UI.dropTouches(); if (!document.hidden) { _last = performance.now(); UI.keepAwake(); } });
  window.addEventListener('blur', () => UI.dropTouches());
  for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(ev, () => setTimeout(resizeRenderer, 60));
  window.__cw = { G, R, CAM, UI, LT, FX, AI, PX, MON, step, setPhase, spawnMonster, hitMonster, MAT, tick(dt, render) { R.frameDt = dt; step(dt); R.fade = 1; applyCamera(); if (render) renderFrame(); UI.draw(); }, bench(n = 40) { const gl = R.renderer.getContext(), px = new Uint8Array(4); applyCamera(); renderFrame(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); const t0 = performance.now(); for (let i = 0; i < n; i++) { applyCamera(); renderFrame(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } return +((performance.now() - t0) / n).toFixed(2); }, build(i, kind, lvl) { const pad = G.B.pads[i]; if (pad.tower) return; G.gold += 999; const t = buildTower(pad, kind, false); for (let k = 0; k < 90; k++) step(1 / 30); for (let l = 0; l < (lvl || 0); l++) { G.gold += 999; upgradeTower(t); for (let k = 0; k < 90; k++) step(1 / 30); } return t.kind + t.lvl; } };
  if (HASH.k) G.k = +HASH.k;
  if (HASH.ff) { const n = Math.round(+HASH.ff * 30); for (let i = 0; i < n; i++) step(1 / 30); CAM.sx = CAM.fx; CAM.sz = CAM.fz; R.fade = 1; }
  if (HASH.phase) setPhase(HASH.phase);
  if (HASH.cam) { const c = HASH.cam.split(',').map(Number); window.__cw.lock = c; }
  const ld = document.getElementById('load'); if (ld) ld.remove();
  if (HASH.manual) return;
  _last = performance.now();
  requestAnimationFrame(frame);
}
function start() {
  try { boot(); }
  catch (e) { const ld = document.getElementById('load'); if (ld) ld.innerHTML = 'Cinderwatch could not start.<br><small>It needs a browser with WebGL 2 turned on.</small>'; throw e; }
}
if (HASH.manual || HASH.ff) start(); else requestAnimationFrame(() => setTimeout(start, 0));

// connect-ai-three: tell the kit's smoke test and preview capture that the first frame is drawn
(function waitFirstFrame() {
  if (R.renderer && R.renderer.info.render.frame > 0) {
    window.EXAMPLE = { ready: true, renderer: R.renderer, scene: R.scene, camera: R.cam };
    // a tall (9:16) film: the board fits the width and leaves the frame half empty, so come closer
    if (window.__FILM__ && innerHeight > innerWidth) camZoomBy(1.7);
  }
  else requestAnimationFrame(waitFirstFrame);
})();
