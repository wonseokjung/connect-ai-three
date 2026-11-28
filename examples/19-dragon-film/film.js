// Dragon of a Thousand Peaks by 0xCodez (Beyond Dev), MIT: https://github.com/0xCodez/thousand-peaks
// A 90 second film that renders live from code: every mesh, texture, shader, particle and note of the music is made
// when the page loads. This file is the src/NN_name.js modules joined in order, each wrapped the way the author's
// tools/build.mjs wraps it (an IIFE that gets K and THREE). boot.js puts the kit's three.js (0.187) on window.THREE
// first, instead of the vendored r180 bundle.

(function(K,THREE){'use strict';
// ============================================================================
// 00_core — shared engine for Dragon of a Thousand Peaks.
// Bright daylight film: sun + sky image-based lighting, aerial haze, karst world layout,
// K.mat() material factory, K.shaderMat(), texture baking, module registry.
// Units: metres. Y up. The lake surface is y = 0. North = -Z.
// ============================================================================
const V3 = THREE.Vector3;
K.DUR = 90;
K.q = new URLSearchParams(location.search);
K.SHOT = K.q.has('shot');

// ---------------------------------------------------------------- math
const sat = x => x < 0 ? 0 : x > 1 ? 1 : x;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
K.sat = sat; K.lerp = lerp; K.smooth = smooth;
K.clamp = (x, a, b) => x < a ? a : x > b ? b : x;
K.remap = (x, a, b, c, d) => c + (d - c) * sat((x - a) / (b - a));
// 1 between a..b with soft edges (fade in fi seconds, fade out fo seconds)
K.pulse = (t, a, b, fi = 1, fo = 1) => smooth(a, a + fi, t) * (1 - smooth(b - fo, b, t));
// seeded RNG (mulberry32): const r = K.rng(42); r() -> [0,1)
K.rng = seed => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
// integer hash -> [0,1)
const ih = (x, y) => { let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
const ih3 = (x, y, z) => ih(x + Math.imul(z | 0, 1013904223), y + Math.imul(z | 0, 1664525));
K.hash = (x, y = 0) => ih(Math.floor(x), Math.floor(y));
// value noise, quintic, [0,1]
K.noise2 = (x, y) => {
  const xi = Math.floor(x), yi = Math.floor(y); let fx = x - xi, fy = y - yi;
  fx = fx * fx * fx * (fx * (fx * 6 - 15) + 10); fy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = ih(xi, yi), b = ih(xi + 1, yi), c = ih(xi, yi + 1), d = ih(xi + 1, yi + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
};
K.noise3 = (x, y, z) => {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z); let fx = x - xi, fy = y - yi, fz = z - zi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const l = (zz) => { const a = ih3(xi, yi, zz), b = ih3(xi + 1, yi, zz), c = ih3(xi, yi + 1, zz), d = ih3(xi + 1, yi + 1, zz); return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy; };
  const p = l(zi), q = l(zi + 1); return p + (q - p) * fz;
};
K.fbm2 = (x, y, oct = 5) => { let s = 0, a = 0.5, n = 0; for (let i = 0; i < oct; i++) { s += a * K.noise2(x, y); n += a; x = x * 2.03 + 17.3; y = y * 2.03 - 9.1; a *= 0.5; } return s / n; };
K.ridged2 = (x, y, oct = 5) => { let s = 0, a = 0.5, n = 0, w = 1; for (let i = 0; i < oct; i++) { let v = 1 - Math.abs(2 * K.noise2(x, y) - 1); v *= v; s += a * v * w; n += a; w = sat(v * 1.6); x = x * 2.07 + 31.7; y = y * 2.07 + 11.9; a *= 0.5; } return s / n; };

// Time-keyed 3D track. keys: [[t, x, y, z], ...] sorted by t. Returns f(t, outVec3) -> outVec3.
// Non-uniform Catmull-Rom (Hermite with finite-difference tangents); clamps outside the range.
K.track = keys => {
  const n = keys.length, m = keys.map((k, i) => { const a = keys[Math.max(0, i - 1)], b = keys[Math.min(n - 1, i + 1)], dt = Math.max(1e-6, b[0] - a[0]); return [(b[1] - a[1]) / dt, (b[2] - a[2]) / dt, (b[3] - a[3]) / dt]; });
  return (t, out = new V3()) => {
    if (t <= keys[0][0]) return out.set(keys[0][1], keys[0][2], keys[0][3]);
    if (t >= keys[n - 1][0]) return out.set(keys[n - 1][1], keys[n - 1][2], keys[n - 1][3]);
    let i = 0; while (i < n - 2 && t > keys[i + 1][0]) i++;
    const k0 = keys[i], k1 = keys[i + 1], h = k1[0] - k0[0], s = (t - k0[0]) / h, s2 = s * s, s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1, h10 = (s3 - 2 * s2 + s) * h, h01 = -2 * s3 + 3 * s2, h11 = (s3 - s2) * h;
    return out.set(h00 * k0[1] + h10 * m[i][0] + h01 * k1[1] + h11 * m[i + 1][0], h00 * k0[2] + h10 * m[i][1] + h01 * k1[2] + h11 * m[i + 1][1], h00 * k0[3] + h10 * m[i][2] + h01 * k1[3] + h11 * m[i + 1][2]);
  };
};
// Time-keyed scalar curve. keys: [[t, v], ...]. Smoothstep between keys, clamps outside.
K.curve = keys => t => {
  const n = keys.length; if (t <= keys[0][0]) return keys[0][1]; if (t >= keys[n - 1][0]) return keys[n - 1][1];
  let i = 0; while (i < n - 2 && t > keys[i + 1][0]) i++;
  return lerp(keys[i][1], keys[i + 1][1], smooth(keys[i][0], keys[i + 1][0], t));
};

// ---------------------------------------------------------------- world layout
// A drowned karst valley: sandstone/limestone pillars rise from a turquoise lake and from forested banks.
// Temple Peak (the hero pillar) stands at the origin; Gate Rock, where the key camera stands, is to the SSW.
const W = K.world = { lakeY: 0, spires: [], sites: {} };
// add a pillar: centre x,z · r radius at the foot · h height above the lake · topR radius of its flat top · seed
W.addSpire = (name, x, z, r, h, topR, seed) => { const s = { name, x, z, r, h, topR, seed, i: W.spires.length }; W.spires.push(s); W[name] = W[name] || s; return s; };
// THE shape of a pillar: horizontal radius at height y (above the lake) and azimuth th (atan2(dz, dx)). 0 above the top.
// Everything that touches a pillar (rock mesh, buildings, trees, the dragon) uses this function.
W.spireR = (s, y, th) => {
  const u = y / s.h; if (u > 1) return 0;
  const c = Math.cos(th), sn = Math.sin(th), sd = s.seed * 7.31;
  const rs = Math.max(s.topR * 1.1, s.r * 0.8);
  let p = lerp(s.r, rs, smooth(0.08, 0.9, u));                      // shaft tapers a little
  p += s.r * 0.55 * Math.pow(1 - sat(u / 0.15), 2.2);                // talus skirt at the foot
  p = lerp(p, s.topR, smooth(0.9, 1.0, u));                          // shoulder into the flat top
  // stepped ledges: the shaft narrows in 3-5 jumps (each ledge is a shelf where trees root)
  for (let k = 0; k < 5; k++) { const uk = 0.2 + 0.15 * k + 0.09 * (K.hash(s.seed * 13 + k, 3) - 0.5); if (uk < 0.88) p -= s.r * (0.035 + 0.05 * K.hash(s.seed * 5 + k, 9)) * smooth(uk - 0.012, uk + 0.012, u) * (0.4 + 1.2 * K.noise2(c * 1.7 + k * 3.1 + sd, sn * 1.7 - k)); }
  let m = 1 + 0.46 * (K.noise3(c * 1.15 + sd, sn * 1.15 - sd * 0.37, u * 1.4 + sd) - 0.5)   // big lobes and bays
            + 0.20 * (K.noise3(c * 3.3 - sd, sn * 3.3 + sd, u * 3.6) - 0.5)                  // buttresses
            + 0.07 * (K.noise3(c * 8 + sd, sn * 8, u * 9 + sd) - 0.5);                       // ribs
  m *= 1 + 0.16 * Math.cos(2 * (th - sd));                                                   // not round: slightly slab-like
  m = lerp(m, 1, smooth(0.86, 1, u) * 0.75);
  return Math.max(0.5, p * m);
};
// heights (m above the lake) of a pillar's ledges — the shelves where the shaft steps in; trees and shrines sit on them
W.spireLedges = s => { const o = []; for (let k = 0; k < 5; k++) { const uk = 0.2 + 0.15 * k + 0.09 * (K.hash(s.seed * 13 + k, 3) - 0.5); if (uk < 0.88) o.push(uk * s.h); } return o; };
// is point (x, y, z) inside a pillar? returns the pillar or null
W.inSpire = (x, y, z, pad = 0) => { for (const s of W.spires) { const dx = x - s.x, dz = z - s.z, d2 = dx * dx + dz * dz, R = s.r * 1.8 + pad; if (d2 > R * R || y > s.h) continue; if (d2 < Math.pow(W.spireR(s, Math.max(0, y), Math.atan2(dz, dx)) + pad, 2)) return s; } return null; };
// hero set
W.addSpire('temple', 0, 0, 36, 142, 25, 1);          // Temple Peak
W.addSpire('gate', -66, 196, 30, 62, 25, 2);         // Gate Rock (key camera stands on it)
W.addSpire('needleE', 60, -34, 15, 156, 6, 3);
W.addSpire('needleW', -56, -48, 19, 178, 8, 4);
W.addSpire('shelf', 128, -30, 22, 104, 13, 5);       // right mid-ground, wooded top
W.addSpire('wallR', 62, 112, 24, 164, 13, 6);        // pillar framing the key shot on the right
W.addSpire('wallL', -82, 74, 21, 152, 11, 7);        // pillar framing it on the left
W.addSpire('isle', -34, 104, 9, 20, 5, 8);           // small rock in the lake below the bridge
{ // the thousand peaks: a forest of pillars out to 3 km, denser to the north and east
  const r = K.rng(77); let n = 0, guard = 0;
  while (n < 90 && guard++ < 4000) {
    const a = r() * Math.PI * 2, d = 250 + Math.pow(r(), 1.35) * 2900, x = Math.cos(a) * d + 40, z = Math.sin(a) * d * 0.9 - 260;
    const h = 90 + Math.pow(r(), 1.6) * 360, rad = h / (3.2 + r() * 3.4), top = rad * (0.25 + r() * 0.5);
    if (Math.hypot(x + 60, z - 190) < 330 && z > -40) continue;                    // keep the key view open
    if (W.spires.some(s => Math.hypot(s.x - x, s.z - z) < (s.r + rad) * 1.7)) continue;
    W.addSpire('p' + n, x, z, rad, h, top, 100 + n); n++;
  }
}
// ground height (lake bed is negative). Pillars are NOT included — they are separate bodies (W.spireR).
W.h = (x, z) => {
  let y = 5 + 30 * (K.fbm2(x * 0.0031 + 5.2, z * 0.0031 - 1.3, 4) - 0.47) + 3.5 * (K.fbm2(x * 0.017, z * 0.017 + 9, 3) - 0.5);
  const basin = 1 - smooth(120, 300, Math.hypot((x + 14) * 0.85, (z - 96) * 1.0));   // the lake around Temple Peak and Gate Rock
  y -= 30 * basin;
  const far = smooth(900, 2600, Math.hypot(x, z)); y = lerp(y, y * 0.5 + 4, far);
  return y;
};
W.n = (x, z, out = new V3(), e = 1.5) => out.set(W.h(x - e, z) - W.h(x + e, z), 2 * e, W.h(x, z - e) - W.h(x, z + e)).normalize();
// building sites (world coordinates) — fixed points the cameras and the dragon rely on
W.sites = {
  summit: { x: 0, y: 142, z: 0, r: 22 },                    // flat top of Temple Peak: main hall and pagoda
  mid: { x: 4, y: 58, z: 44, w: 34, d: 16 },                // terrace built out from the south face, facing +Z (toward the key camera)
  falls: { x: -30, y: 72, z: 18 },                          // waterfall spout on the SW face; falls to the lake
  gate: { x: -66, y: 62, z: 196, r: 23 },                   // flat top of Gate Rock: gate pavilion; the key camera stands at its NE rim
  bridgeA: { x: -51, y: 62, z: 180 }, bridgeB: { x: -9, y: 58, z: 55 },   // rope-and-plank bridge: Gate Rock -> mid terrace
  shore: { x: 46, y: 1.5, z: 128 },                         // lakeside pavilion and jetty on the east bank
};

// ---------------------------------------------------------------- GLSL library
K.GLSL = {};
K.GLSL.noise = /* glsl */`
float kHash11(float p){ p = fract(p*.1031); p *= p+33.33; p *= p+p; return fract(p); }
float kHash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float kHash13(vec3 p3){ p3 = fract(p3*.1031); p3 += dot(p3,p3.zyx+31.32); return fract((p3.x+p3.y)*p3.z); }
vec2  kHash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3 += dot(p3,p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
vec3  kHash33(vec3 p3){ p3 = fract(p3*vec3(.1031,.1030,.0973)); p3 += dot(p3,p3.yxz+33.33); return fract((p3.xxy+p3.yxx)*p3.zyx); }
float kNoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(kHash12(i),kHash12(i+vec2(1,0)),f.x), mix(kHash12(i+vec2(0,1)),kHash12(i+vec2(1,1)),f.x), f.y); }
float kNoise(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(mix(kHash13(i),kHash13(i+vec3(1,0,0)),f.x), mix(kHash13(i+vec3(0,1,0)),kHash13(i+vec3(1,1,0)),f.x), f.y),
             mix(mix(kHash13(i+vec3(0,0,1)),kHash13(i+vec3(1,0,1)),f.x), mix(kHash13(i+vec3(0,1,1)),kHash13(i+vec3(1,1,1)),f.x), f.y), f.z); }
float kFbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*kNoise(p); p=p*2.03+vec2(17.3,-9.1); a*=.5; } return s/.96875; }
float kFbm(vec3 p){ float s=0., a=.5; for(int i=0;i<4;i++){ s+=a*kNoise(p); p=p*2.03+vec3(17.3,-9.1,5.7); a*=.5; } return s/.9375; }
float kFbm3(vec2 p){ float s=0., a=.5; for(int i=0;i<3;i++){ s+=a*kNoise(p); p=p*2.03+vec2(17.3,-9.1); a*=.5; } return s/.875; }
// voronoi: x = F1, y = F2 - F1 (edge distance-ish), z = cell id hash
vec3 kVoronoi(vec2 p){ vec2 n=floor(p), f=fract(p); float d1=8., d2=8., id=0.;
  for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){ vec2 g=vec2(i,j), o=kHash22(n+g), r=g+o-f; float d=dot(r,r);
    if(d<d1){ d2=d1; d1=d; id=kHash12(n+g+7.7); } else if(d<d2) d2=d; }
  d1=sqrt(d1); d2=sqrt(d2); return vec3(d1, d2-d1, id); }
`;
K.GLSL.uniforms = /* glsl */`
uniform float uTime;        // film time, seconds
uniform vec3 uSunDir;       // direction TO the sun
uniform vec3 uSunCol;       // sun colour * intensity
uniform vec3 uSkyCol;       // ambient from above
uniform vec3 uGndCol;       // ambient from below (bounce)
uniform vec3 uFogCol;       // haze colour
uniform vec3 uFogSun;       // haze colour looking toward the sun
uniform vec4 uFogP;         // x density, y height falloff, z base height, w mist-noise amount
uniform vec4 uWind;         // x,y = wind direction in XZ, z = strength (0 calm .. 1 gale), w = gust phase
uniform vec4 uEnv;          // x storm 0..1, y wetness 0..1, z dusk 0..1, w flash 0..1
uniform sampler2D uNoiseTex; // tileable 512² noise: r = fbm, g = ridged fbm, b = worley F1, a = fine fbm
`;
K.GLSL.fog = /* glsl */`
// 0..1 haze between the camera and wp: thin aerial perspective + a dense mist layer low over the water
float kFogAmt(vec3 wp){
  vec3 d = wp - cameraPosition; float L = length(d); float k = uFogP.y * d.y / max(L, 1e-4);
  float od = uFogP.x * exp(clamp(-uFogP.y*(cameraPosition.y - uFogP.z), -12., 4.)) * (abs(k) > 1e-5 ? (1. - exp(-k*L))/k : L);
  od += uFogP.x * 0.05 * L;
  od *= 1. + uFogP.w * (texture2D(uNoiseTex, wp.xz*.0011 + uTime*.004).r - .5) * smoothstep(120., 30., wp.y - uFogP.z);
  return 1. - exp(-od);
}
vec3 kFogColor(vec3 rd){ float s = max(dot(rd, uSunDir), 0.); return mix(uFogCol, uFogSun, pow(s, 6.)*.6 + s*s*.4); }
vec3 kFog(vec3 col, vec3 wp){ vec3 rd = normalize(wp - cameraPosition); return mix(col, kFogColor(rd), kFogAmt(wp)); }
`;
K.GLSL.world = /* glsl */`
// bump: perturb a view-space normal by a procedural height h
vec3 kBump(vec3 vpos, vec3 n, float h, float strength){
  vec3 sx = dFdx(vpos), sy = dFdy(vpos); vec3 r1 = cross(sy, n), r2 = cross(n, sx); float det = dot(sx, r1);
  vec3 g = sign(det) * (dFdx(h)*r1 + dFdy(h)*r2) * strength;
  return normalize(abs(det)*n - g); }
// triplanar lookup of a tileable texture: p world position * scale, n world normal
vec4 kTri(sampler2D t, vec3 p, vec3 n){ vec3 w = pow(abs(n), vec3(4.)); w /= w.x + w.y + w.z;
  return texture2D(t, p.zy)*w.x + texture2D(t, p.xz)*w.y + texture2D(t, p.xy)*w.z; }
// light passing THROUGH a thin leaf / petal / membrane: add (albedo * kTrans(...) * uSunCol * yourShadowOrAO) to emissive
float kTrans(vec3 n, vec3 v){ float back = max(dot(-n, uSunDir), 0.); float toward = pow(max(dot(v, -uSunDir), 0.), 3.); return back*.55 + toward*.6; }
`;

// ---------------------------------------------------------------- shared uniforms
const U = K.U = {
  uTime: { value: 0 },
  uSunDir: { value: new V3(-0.60, 0.58, 0.55).normalize() }, uSunCol: { value: new THREE.Color(3, 2.8, 2.4) },
  uSkyCol: { value: new THREE.Color(0.25, 0.42, 0.75) }, uGndCol: { value: new THREE.Color(0.20, 0.18, 0.14) },
  uFogCol: { value: new THREE.Color(0.62, 0.74, 0.90) }, uFogSun: { value: new THREE.Color(1.0, 0.92, 0.78) },
  uFogP: { value: new THREE.Vector4(0.0005, 0.02, 0, 0.6) },
  uWind: { value: new THREE.Vector4(0.8, 0.6, 0.25, 0) }, uEnv: { value: new THREE.Vector4(0, 0, 0, 0) },
  uNoiseTex: { value: null },
};

// ---------------------------------------------------------------- renderer, scene, lights
const canvas = document.getElementById('c');
const renderer = K.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: K.SHOT });
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
renderer.setClearColor(0x000000, 1);
K.scene = new THREE.Scene();
K.camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.4, 16000);
const L = K.lights = {};
L.sun = new THREE.DirectionalLight(0xffffff, 1); L.sun.castShadow = true;
{ const sm = K.q.has('shadow') ? +K.q.get('shadow') : 4096; L.sun.shadow.mapSize.set(sm, sm); L.sun.shadow.bias = -0.0003; L.sun.shadow.normalBias = 0.25; L.sun.shadow.camera.near = 20; L.sun.shadow.camera.far = 1600; }
L.hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);   // small fill on top of the sky image-based lighting
// four point lights for lanterns / lightning / dragon pearl. Owned by the fx module (position, color, intensity).
L.pt = Array.from({ length: 4 }, () => new THREE.PointLight(0xffb060, 0, 0, 2));
K.scene.add(L.sun, L.sun.target, L.hemi, ...L.pt);

// K.env: the look of the world this frame. Written by the film module, read by everyone.
K.env = {
  sunDir: new V3(-0.60, 0.58, 0.55).normalize(), sunColor: new THREE.Color(1.0, 0.93, 0.80), sunInt: 3.4,
  skyTop: new THREE.Color(0.07, 0.22, 0.60), skyHorizon: new THREE.Color(0.52, 0.70, 0.92), ground: new THREE.Color(0.30, 0.27, 0.20),
  hemiInt: 0.06, envInt: 0.9,
  fogColor: new THREE.Color(0.64, 0.76, 0.92), fogSun: new THREE.Color(1.0, 0.93, 0.80), fogDensity: 0.00030, fogFalloff: 0.022, fogBase: 0, mist: 0.5,
  storm: 0, wet: 0, dusk: 0, flash: 0, cloud: 0.45, wind: 0.25, windDir: new THREE.Vector2(0.8, 0.6), exposure: 1.0, rays: 0.10,
  shadowFocus: new V3(-10, 60, 80), shadowSize: 190,     // the shadow map covers a box this half-size around the focus (set per shot)
};
K.applyEnv = t => {
  const e = K.env, c = L.sun.shadow.camera;
  U.uTime.value = t;
  L.sun.color.copy(e.sunColor); L.sun.intensity = e.sunInt;
  L.sun.target.position.copy(e.shadowFocus); L.sun.position.copy(e.shadowFocus).addScaledVector(e.sunDir, 800);
  if (c.right !== e.shadowSize) { c.left = -e.shadowSize; c.right = e.shadowSize; c.top = e.shadowSize; c.bottom = -e.shadowSize; c.updateProjectionMatrix(); }
  L.hemi.color.copy(e.skyTop).lerp(e.skyHorizon, 0.4); L.hemi.groundColor.copy(e.ground); L.hemi.intensity = e.hemiInt * 3.0;
  K.scene.environmentIntensity = e.envInt;
  U.uSunDir.value.copy(e.sunDir); U.uSunCol.value.copy(e.sunColor).multiplyScalar(e.sunInt);
  U.uSkyCol.value.copy(e.skyTop).lerp(e.skyHorizon, 0.4); U.uGndCol.value.copy(e.ground);
  U.uFogCol.value.copy(e.fogColor); U.uFogSun.value.copy(e.fogSun);
  U.uFogP.value.set(e.fogDensity, e.fogFalloff, e.fogBase, e.mist);
  U.uWind.value.set(e.windDir.x, e.windDir.y, e.wind, t * (0.6 + e.wind));
  U.uEnv.value.set(e.storm, e.wet, e.dusk, e.flash);
};
// Build the sky reflection/ambient map: renders whatever is on layer 1 (the sky dome) into a cube and prefilters it.
// Called by main after all modules are initialised; call again if the sky changes a lot (dusk, storm).
K.makeEnvMap = () => {
  const rt = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType }), cc = new THREE.CubeCamera(1, 20000, rt);
  cc.position.set(0, 90, 60); cc.layers.set(1); cc.update(renderer, K.scene);
  const pm = new THREE.PMREMGenerator(renderer), env = pm.fromCubemap(rt.texture).texture;
  if (K.scene.environment) K.scene.environment.dispose();
  K.scene.environment = env; rt.dispose(); pm.dispose();
};

// ---------------------------------------------------------------- materials
let matId = 0;
// K.mat(opts) -> MeshStandardMaterial (PBR: sun with shadows, sky image-based lighting and reflections, point lights)
// with the film's haze built in and hooks for procedural detail.
//  Standard params pass through: color, roughness, metalness, side, vertexColors, flatShading, transparent, opacity, alphaTest,
//                                map, normalMap, normalScale, roughnessMap, aoMap, emissive, emissiveMap, envMapIntensity ...
//  fog: false -> skip haze · uniforms: { uFoo: {value} } extra uniforms
//  vertPars / fragPars: GLSL declarations (uniforms, attributes, varyings, functions)
//  vertNormal: GLSL run after the object normal is set — may edit `objectNormal`
//  vert:       GLSL run after `vec3 transformed = position` — may edit `transformed` (uTime, uWind, uEnv, noise available)
//  frag:       GLSL run before lighting. May edit: diffuseColor (vec4), roughnessFactor, metalnessFactor,
//              normal (view space; kBump(-vViewPosition, normal, height, strength)), totalEmissiveRadiance, or discard.
//              Available: vWPos (world pos), kN (world geometric normal), kV (world dir surface->camera), vOPos (object-space pos),
//              K.GLSL.noise / K.GLSL.world functions, all K.U uniforms.
//  fragEnd:    GLSL run at the very end (after haze); may edit gl_FragColor.
K.mat = (o = {}) => {
  const std = {}; for (const k in o) if (!['fog', 'uniforms', 'vertPars', 'fragPars', 'vertNormal', 'vert', 'frag', 'fragEnd', 'key'].includes(k)) std[k] = o[k];
  const m = new THREE.MeshStandardMaterial(std), id = o.key || ('k' + (matId++));
  m.userData.uniforms = Object.assign({}, o.uniforms || {});
  m.customProgramCacheKey = () => id;
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U, m.userData.uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWNrm; varying vec3 vOPos;\nuniform float uTime; uniform vec4 uWind; uniform vec4 uEnv; uniform sampler2D uNoiseTex;\n' + K.GLSL.noise + (o.vertPars || ''))
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n' + (o.vertNormal || ''))
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOPos = position;\n' + (o.vert || ''))
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (mvPosition.xyz - viewMatrix[3].xyz) * mat3(viewMatrix);\nvWNrm = transformedNormal * mat3(viewMatrix);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWNrm; varying vec3 vOPos;\n' + K.GLSL.uniforms + K.GLSL.noise + K.GLSL.fog + K.GLSL.world + (o.fragPars || ''))
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        vec3 kN = normalize(vWNrm) * (gl_FrontFacing ? 1. : -1.); vec3 kV = normalize(cameraPosition - vWPos);
        ${o.frag || ''}`)
      .replace('#include <fog_fragment>', (o.fog === false ? '' : 'gl_FragColor.rgb = kFog(gl_FragColor.rgb, vWPos);\n') + (o.fragEnd || ''));
  };
  return m;
};
// K.shaderMat(opts) -> THREE.ShaderMaterial with K.U uniforms + GLSL library prepended (sky, water, particles…).
K.shaderMat = (o = {}) => {
  const p = Object.assign({}, o);
  p.uniforms = Object.assign({}, U, o.uniforms || {});
  p.vertexShader = K.GLSL.uniforms + K.GLSL.noise + '\n' + o.vertexShader;
  p.fragmentShader = K.GLSL.uniforms + K.GLSL.noise + K.GLSL.fog + K.GLSL.world + '\n' + o.fragmentShader;
  return new THREE.ShaderMaterial(p);
};

// ---------------------------------------------------------------- baking
const bakeScene = new THREE.Scene(), bakeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const bakeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); bakeScene.add(bakeQuad);
// K.bake(w, h, fragBody, opts) -> THREE.Texture. fragBody is GLSL that defines `vec4 bake(vec2 uv)`; K.GLSL.noise is available.
// opts: { type: THREE.UnsignedByteType|HalfFloatType, repeat: true, mips: true, uniforms, srgb: false }
K.bake = (w, h, frag, o = {}) => {
  const rt = new THREE.WebGLRenderTarget(w, h, { type: o.type || THREE.UnsignedByteType, depthBuffer: false, generateMipmaps: o.mips !== false, minFilter: o.mips !== false ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: o.repeat === false ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping, wrapT: o.repeat === false ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping, colorSpace: o.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace });
  const m = new THREE.ShaderMaterial({ uniforms: o.uniforms || {}, depthTest: false, depthWrite: false, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }', fragmentShader: 'varying vec2 vUv;\n' + K.GLSL.noise + '\n' + frag + '\nvoid main(){ gl_FragColor = bake(vUv); }' });
  bakeQuad.material = m; const prev = renderer.getRenderTarget(); renderer.setRenderTarget(rt); renderer.render(bakeScene, bakeCam); renderer.setRenderTarget(prev); m.dispose();
  rt.texture.anisotropy = 8; return rt.texture;
};
// shared tileable textures. K.tex.noise: RGBA value noise 256² (4 independent channels). K.tex.fbm: RGBA 512², r = fbm, g = ridged, b = worley F1, a = fine fbm.
K.tex = {};
{
  const N = 256, d = new Uint8Array(N * N * 4), r = K.rng(1234); for (let i = 0; i < d.length; i++) d[i] = (r() * 256) | 0;
  const t = K.tex.noise = new THREE.DataTexture(d, N, N, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  K.tex.fbm = K.bake(512, 512, /* glsl */`
    float tn(vec2 p, float per){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
      #define H(o) kHash12(mod(i+o, per))
      return mix(mix(H(vec2(0,0)),H(vec2(1,0)),f.x), mix(H(vec2(0,1)),H(vec2(1,1)),f.x), f.y); }
    float tf(vec2 p, float per){ float s=0., a=.5; for(int i=0;i<6;i++){ s+=a*tn(p*per, per); per*=2.; a*=.5; } return s/.984; }
    float tr(vec2 p, float per){ float s=0., a=.5; for(int i=0;i<5;i++){ float v=1.-abs(2.*tn(p*per+3.7, per)-1.); s+=a*v*v; per*=2.; a*=.5; } return s/.97; }
    float tw(vec2 p, float per){ p*=per; vec2 n=floor(p), f=fract(p); float d=8.; for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){ vec2 g=vec2(i,j); vec2 o=kHash22(mod(n+g, per)); vec2 r=g+o-f; d=min(d,dot(r,r)); } return sqrt(d); }
    vec4 bake(vec2 uv){ return vec4(tf(uv, 4.), tr(uv, 4.), tw(uv, 12.), tf(uv+.37, 16.)); }`);
  U.uNoiseTex.value = K.tex.fbm;
}

// ---------------------------------------------------------------- geometry helpers
// merge BufferGeometries (position/normal/uv/color where present in all). Indexed or not -> indexed output if all indexed.
K.merge = geos => {
  geos = geos.filter(Boolean); if (!geos.length) return new THREE.BufferGeometry();
  const names = Object.keys(geos[0].attributes).filter(n => geos.every(g => g.attributes[n]));
  const allIdx = geos.every(g => g.index); let vc = 0, ic = 0; for (const g of geos) { vc += g.attributes.position.count; ic += allIdx ? g.index.count : 0; }
  const out = new THREE.BufferGeometry();
  for (const n of names) { const is = geos[0].attributes[n].itemSize, arr = new Float32Array(vc * is); let o = 0; for (const g of geos) { arr.set(g.attributes[n].array, o); o += g.attributes[n].count * is; } out.setAttribute(n, new THREE.BufferAttribute(arr, is)); }
  if (allIdx) { const idx = new Uint32Array(ic); let o = 0, vo = 0; for (const g of geos) { const a = g.index.array; for (let i = 0; i < a.length; i++) idx[o + i] = a[i] + vo; o += a.length; vo += g.attributes.position.count; } out.setIndex(new THREE.BufferAttribute(idx, 1)); }
  return out;
};
// paint a constant vertex colour onto a geometry (adds a `color` attribute); returns the geometry
K.tint = (g, r, gg, b) => { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = r; a[i * 3 + 1] = gg; a[i * 3 + 2] = b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };

// ---------------------------------------------------------------- modules
K.mods = []; K.mod = {}; K.errors = [];
K.fail = (where, e) => { const s = `[${where}] ${e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n') : e}`; K.errors.push(s); console.error(s); const el = document.getElementById('err'); if (el && K.q.has('dbg')) el.textContent = K.errors.slice(-6).join('\n'); };
// K.reg(name, { init(), update(F) }) — init builds everything once; update(F) poses it for film time F.t.
// update MUST be a pure function of F (no accumulated state): any frame can be rendered alone, in any order.
K.reg = (name, m) => { m.name = name; K.mods.push(m); K.mod[name] = m; };

})(window.K=window.K||{},window.THREE);
//# sourceURL=src/00_core.js

(function(K,THREE){'use strict';
// ============================================================================
// 02_film — the director: beat sheet, the two dragons' flight paths, breath, cameras,
// light and weather per frame. Everything is a pure function of film time.
// Story (90 s): the red loong bursts from the lake, climbs Temple Peak, greets us at Gate Rock,
// threads the Sky Window; a golden rival comes out of the clouds; they fight — breath against breath,
// a chase, a double helix, a plunge into the lake, a last clash in the storm; rain, a rainbow;
// the rival leaves into the sunset; lanterns at dusk, the red loong coiled round the pagoda.
// ============================================================================
const V3 = THREE.Vector3, { sat, lerp, smooth, pulse, track, curve } = K;
const film = K.film = {};
const W = K.world;

// ---------------------------------------------------------------- event times (seconds)
const T = film.T = {
  rise: 2.2,          // the red loong breaks the surface of the lake
  key: 25.0,          // the key frame: head at the lens over Gate Rock, roar
  window: 31.5,       // it threads the Sky Window in needleW
  rival: 37.5,        // the golden loong appears out of the cloud tower
  faceoff: 44.5,
  clash0: 47.6, clash1: 50.6,   // first exchange: fire against golden lightning across the ring
  helix: 56.5,        // locked in a double helix above the lake
  plunge: 60.5,       // both dive into the lake
  burst: 63.2,        // and burst out again
  charge: 68.2, impact: 69.2,   // last charge in the storm cloud; they collide — flash
  rain0: 69.6, rain1: 76,       // sun shower, rainbow
  dusk0: 71, lanterns: 80, coil: 87,
  end: 90,
};
const P = film.P = {
  rise: new V3(-4, 0, 112), plunge: new V3(-10, 0, 100), burstR: new V3(-52, 0, 130), burstG: new V3(16, 0, 86),
  ring: new V3(200, 200, -300), impact: new V3(6, 258, -10), helix: new V3(-10, 152, 100),
};
// splashes for the water module: { x, z, t0, size }
film.splashes = [{ x: P.rise.x, z: P.rise.z, t0: T.rise, size: 1.7 }, { x: P.plunge.x, z: P.plunge.z, t0: T.plunge, size: 2.4 },
  { x: P.burstR.x, z: P.burstR.z, t0: T.burst, size: 1.5 }, { x: P.burstG.x, z: P.burstG.z, t0: T.burst + .3, size: 1.5 }];

// ---------------------------------------------------------------- flight paths
// Path of each dragon's HEAD; the body (~150 m) trails along it. Several tracks per dragon; camera cuts hide the jumps.
// Every track carries ~6 s of lead-in before its first visible frame so the body is laid out. [tFrom, tTo, track]
const ringKeys = (t0, t1, th0, w, yb) => { const o = []; for (let t = t0; t <= t1 + 1e-6; t += .5) { const th = th0 + w * (t - 46); o.push([t, P.ring.x + 52 * Math.cos(th), yb + 6 * Math.sin(th * 1.3), P.ring.z + 52 * Math.sin(th)]); } return o; };
const helixKeys = ph => { const o = []; for (let t = 56.5; t <= 58.95; t += .2) { const a = ph + 3.6 * (t - 56.5); o.push([t, P.helix.x + 8.5 * Math.cos(a), P.helix.y + 21 * (t - 56.5), P.helix.z + 8.5 * Math.sin(a)]); } return o; };
// the final coil: a helix round the pagoda (its axis is at (3.5, -9.6); eave tips reach r 7.2, the main hall roof stands to y 160 just SW of it)
const coilKeys = () => { const o = []; for (let t = 82; t <= 87.01; t += .25) { const u = (t - 82) / 5, a = 1.05 + 12.57 * u, R = 10.0 - 1.8 * u; o.push([t, 3.5 + R * Math.cos(a), 163 + 18 * u, -9.6 + R * Math.sin(a)]); } return o; };
const tracks = {
  red: [
    [0, 27.6, track([[-5, -60, -30, 150], [-2, -30, -24, 130], [.8, -8, -12, 116], [2.2, -4, 1, 112], [3.2, -2, 40, 110], [4.2, 6, 74, 104], [5.5, 30, 98, 82],
      [7, 54, 114, 30], [8.5, 36, 132, -46], [10, -14, 148, -52], [11.5, -46, 164, -4], [13, -26, 180, 36], [14.5, 22, 190, 32], [16, 44, 174, -4], [17.7, 96, 144, -4],
      [19.7, 104, 122, 40], [21.2, 40, 108, 84], [22.7, -9, 98, 96], [24, -48, 88, 106], [25, -42, 77, 142], [25.7, -39, 76, 161], [26.5, -27, 82, 189],
      [27.7, -4, 96, 232], [29.7, 70, 130, 250], [32, 190, 170, 160]])],
    [27.6, 37.5, track([[22, 80, 104, 200], [24, 30, 106, 170], [26, -14, 108, 132], [27.6, -40, 112, 96], [29, -62, 118, 52], [30.4, -58, 126, 0], [31.5, -55.4, 131, -48],
      [32.6, -53, 137, -96], [34, -20, 150, -200], [36, 80, 168, -290], [38, 170, 176, -300], [40, 240, 180, -290]])],
    [37.5, 51, track([[32, -40, 160, -170], [35, 40, 166, -230], [37.5, 96, 172, -262], [41, 104, 184, -262], [43, 116, 192, -272], [44.5, 128, 196, -280], [46, 148, 200, -300],
      ...ringKeys(46.5, 52.5, Math.PI, .45, 200)])],
    [51, 55.5, track([[46, 300, 190, -330], [48, 250, 186, -280], [50, 190, 182, -230], [51, 160, 180, -205], [52.5, 100, 164, -110], [53.5, 86, 154, -40], [54.5, 98, 146, 36],
      [55.5, 70, 150, 84], [56.5, 30, 154, 130], [58, -40, 160, 180]])],
    [55.5, 63, track([[51, 120, 112, 250], [52.5, 80, 120, 220], [54, 50, 134, 170], [55.5, 20, 146, 122], [56.2, 2, 150, 104], ...helixKeys(0),
      [59.25, -6, 206, 104], [59.65, -8, 172, 102], [60.5, -10, 0, 100], [61.2, -12, -44, 104], [62.2, 0, -60, 112], [64, 20, -60, 120]])],
    [63, 66.5, track([[57, -52, -200, 130], [61, -52, -70, 130], [62.4, -52, -30, 130], [63.2, -52, 0, 130], [64, -54, 36, 126], [64.8, -46, 70, 120], [65.6, -54, 104, 110],
      [66.5, -40, 140, 100], [67.5, -20, 180, 92], [69, 0, 230, 84]])],
    [66.5, 75, track([[60, -150, 110, 300], [62, -160, 130, 250], [64.5, -120, 160, 170], [66.5, -74, 196, 92], [68, -36, 236, 36], [69.2, 2, 258, -7], [70, -18, 250, 20],
      [70.6, -44, 238, 46], [72, -90, 222, 96], [74, -120, 214, 120], [76, -110, 194, 92], [78, -80, 190, 60]])],
    [75, 82, track([[68, 150, 190, 130], [70, 110, 204, 70], [73, 66, 214, 16], [75, 42, 214, -6], [78, 27, 212, -4], [81, 20, 212, 0], [83, 16, 212, 3]])],
    [82, 91, track([[75, 150, 188, 130], [77.5, 100, 178, 40], [79.5, 60, 168, -30], [81, 31.5, 164, -13.5], ...coilKeys(), [88, 4.5, 191, -6.5], [91, 4, 195, -7.5]])],
  ],
  gold: [
    [0, 51, track([[24, 900, 520, -1100], [30, 640, 430, -900], [34, 440, 330, -640], [37.5, 318, 268, -470], [41, 286, 238, -420], [43, 280, 222, -384], [44.5, 272, 212, -350], [46, 252, 200, -300],
      ...ringKeys(46.5, 52.5, 0, .45, 200)])],
    [51, 55.5, track([[46.8, 300, 196, -330], [48.8, 250, 192, -280], [50.8, 190, 188, -230], [51.8, 160, 186, -205], [53.3, 100, 170, -110], [54.3, 86, 160, -40], [55.3, 98, 152, 36],
      [56.3, 70, 156, 84], [57.3, 30, 160, 130], [58.8, -40, 166, 180]])],
    [55.5, 63, track([[51, -210, 112, 190], [52.5, -150, 124, 150], [54, -100, 136, 128], [55.5, -44, 146, 104], [56.2, -22, 150, 98], ...helixKeys(Math.PI),
      [59.25, -14, 206, 96], [59.65, -12, 172, 98], [60.5, -10, 0, 100], [61.2, -6, -44, 96], [62.2, -16, -60, 88], [64, -36, -60, 80]])],
    [63, 66.5, track([[57.3, 16, -200, 86], [61.3, 16, -70, 86], [62.7, 16, -30, 86], [63.5, 16, 0, 86], [64.3, 20, 36, 90], [65.1, 8, 70, 100], [65.9, 22, 104, 108],
      [66.8, 6, 140, 112], [67.8, -10, 180, 104], [69.3, -30, 230, 96]])],
    [66.5, 75, track([[60, 290, 450, -380], [62, 240, 380, -330], [64.5, 170, 340, -230], [66.5, 100, 300, -132], [68, 50, 276, -64], [69.2, 10, 259, -13], [70, 30, 252, -42],
      [70.6, 52, 244, -70], [72, 100, 240, -130], [74, 150, 236, -200], [76, 200, 230, -260], [78, 250, 236, -320]])],
    [75, 82, track([[68, 160, 250, -110], [70, 60, 232, -60], [73, 10, 214, -44], [75, -60, 206, -20], [78, -150, 200, 20], [81, -270, 204, 90], [84, -420, 220, 180]])],
    [82, 91, track([[74, -560, 220, 380], [78, -600, 236, 220], [82, -580, 252, 60], [86, -500, 270, -80], [91, -340, 284, -180]])],
  ],
};
const trackAt = (name, tNow) => { const L = tracks[name]; for (const s of L) if (tNow >= s[0] && tNow < s[1]) return s[2]; return L[L.length - 1][2]; };
let nowT = 0;
// head position at time tq on the track that is active for the frame being rendered (use it to lay the body along the path)
film.dragonPos = (tq, out = new V3()) => trackAt('red', nowT)(tq, out);
film.rivalPos = (tq, out = new V3()) => trackAt('gold', nowT)(tq, out);

const cv = { red: {}, gold: {} };
cv.red.jaw = curve([[2.3, .1], [2.9, .9], [4.6, .9], [5.4, .15], [24.3, .1], [24.8, .85], [26.2, .85], [26.9, .12], [45.3, .1], [45.6, .8], [46.4, .8], [46.9, .2], [47.5, .2], [47.8, .9], [50.6, .9], [51, .15],
  [63.2, .2], [63.6, .9], [64.8, .9], [65.4, .15], [68, .15], [68.3, .95], [69.2, .95], [69.6, .2], [86.8, .1], [87.3, .7], [88.6, .7], [89.3, .1]]);
cv.gold.jaw = curve([[41.8, .1], [42.2, .8], [43.4, .8], [44, .15], [45.9, .1], [46.2, .8], [47, .8], [47.5, .2], [47.8, .9], [50.6, .9], [51, .15], [63.5, .2], [63.9, .9], [65, .9], [65.6, .15],
  [68, .15], [68.3, .95], [69.2, .95], [69.6, .2]]);
cv.red.roar = curve([[2.4, 0], [2.9, 1], [4.4, 1], [5.2, 0], [24.4, 0], [24.8, 1], [26.1, 1], [26.7, 0], [45.3, 0], [45.6, 1], [46.4, 1], [46.9, 0], [63.3, 0], [63.6, 1], [64.7, 1], [65.2, 0], [86.9, 0], [87.3, 1], [88.5, 1], [89.2, 0]]);
cv.gold.roar = curve([[41.8, 0], [42.2, 1], [43.3, 1], [43.9, 0], [45.9, 0], [46.2, 1], [47, 1], [47.4, 0], [63.6, 0], [63.9, 1], [64.9, 1], [65.4, 0]]);
// breath: 0..1 (red = fire, gold = golden lightning)
cv.red.breath = curve([[24.75, 0], [25, .3], [25.8, .3], [26.1, 0], [47.5, 0], [47.9, 1], [50.6, 1], [50.9, 0], [68.1, 0], [68.4, 1], [69.2, 1], [69.35, 0], [87.2, 0], [87.6, .6], [88.4, .6], [88.9, 0]]);
cv.gold.breath = curve([[47.5, 0], [47.9, 1], [50.6, 1], [50.9, 0], [68.1, 0], [68.4, 1], [69.2, 1], [69.35, 0]]);
const vis = { red: t => true, gold: t => t >= 36.5 };

const _a = new V3(), _b = new V3(), _acc = new V3(), UP = new V3(0, 1, 0);
function dragonState(name, t, D) {
  const tr = trackAt(name, t), c = cv[name];
  tr(t, D.p); tr(t + .06, _a); tr(t - .06, _b); D.vel.copy(_a).sub(_b).multiplyScalar(1 / .12); D.speed = D.vel.length();
  if (D.speed > .5) D.fwd.copy(D.vel).multiplyScalar(1 / D.speed);
  tr(t + .3, _a); tr(t - .3, _b); _acc.copy(_a).add(_b).addScaledVector(D.p, -2).multiplyScalar(1 / .09); _acc.addScaledVector(D.fwd, -_acc.dot(D.fwd)); _acc.y *= .3;
  D.up.copy(UP).multiplyScalar(22).add(_acc).normalize(); D.right.crossVectors(D.fwd, D.up).normalize(); D.up.crossVectors(D.right, D.fwd).normalize();
  D.jaw = c.jaw(t); D.roar = c.roar(t); D.breath = c.breath(t); D.vis = vis[name](t);
  D.under = D.p.y < -3;      // head below the lake surface
  return D;
}
const mkD = () => ({ p: new V3(), vel: new V3(), fwd: new V3(0, 0, 1), up: new V3(0, 1, 0), right: new V3(1, 0, 0), aim: new V3(), speed: 0, jaw: 0, roar: 0, breath: 0, vis: true, under: false });
film.dragonState = (t, D = mkD()) => dragonState('red', t, D);
film.rivalState = (t, D = mkD()) => dragonState('gold', t, D);

// ---------------------------------------------------------------- cameras
const F = K.F = { t: 0, T, P, dragon: mkD(), rival: mkD(), cam: { pos: new V3(), tgt: new V3(), fov: 44, roll: 0, near: 0.4 }, shot: 0, shotName: '', shotU: 0, fade: 1 };
const mix3 = (o, a, b, u) => o.set(lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u));
const ease = u => u * u * (3 - 2 * u);
const rig = (C, D, back, up, right, ahead) => { C.pos.copy(D.p).addScaledVector(D.fwd, -back).addScaledVector(UP, up).addScaledVector(D.right, right); C.tgt.copy(D.p).addScaledVector(D.fwd, ahead); };
const KEYCAM = [-58, 66.4, 184];
const shots = film.shots = [
  [0, 'rise', (t, u, C) => { const R = F.dragon, k = smooth(1.9, 5.0, t); mix3(C.pos, [-22, 3.0, 150], [-27, 6.5, 155], ease(u)); C.tgt.set(-4, 12, 112).lerp(R.p, k * .92); C.fov = lerp(48, 60, k); C.near = .3; }],
  [5.5, 'spiral', (t, u, C) => { const e = ease(u); mix3(C.pos, [-30, 20, 150], [-34, 34, 156], e); C.tgt.set(0, 100, 6).lerp(F.dragon.p, .6); C.fov = 56; C.near = .3; }],
  [10, 'summit', (t, u, C) => { const e = ease(u); mix3(C.pos, [58, 152, 52], [40, 160, 66], e); C.tgt.set(0, 172, 0).lerp(F.dragon.p, .45); C.fov = 52; }],
  [17.2, 'portrait', (t, u, C) => { const R = F.dragon; C.pos.copy(R.p).addScaledVector(R.right, -15).addScaledVector(R.fwd, 13).addScaledVector(UP, 1.5); C.tgt.copy(R.p).addScaledVector(R.fwd, 2); C.fov = 40; C.near = .3; }],
  [20.4, 'key', (t, u, C) => { mix3(C.pos, [-59, 66.3, 185], [-56.5, 66.7, 182.5], ease(u)); C.tgt.set(-4, 86, 60).lerp(F.dragon.p, .5 * smooth(25.6, 27.2, t)); C.fov = 44; C.near = .3; }],
  [27.6, 'chase', (t, u, C) => { const R = F.dragon; film.dragonPos(t - 1.05, C.pos); C.pos.y += 9; C.pos.addScaledVector(R.right, 3); C.tgt.copy(R.p).addScaledVector(R.fwd, 26); C.fov = 58; C.near = .3; }],
  [31.3, 'window', (t, u, C) => { const e = ease(u); mix3(C.pos, [-30, 141, -124], [-22, 147, -142], e); C.tgt.set(-55, 132, -52).lerp(F.dragon.p, .55 * smooth(.25, .7, u)); C.fov = lerp(38, 48, e); }],
  [34, 'sea', (t, u, C) => { const R = F.dragon; C.pos.copy(R.p).addScaledVector(R.right, 34).addScaledVector(R.fwd, 30).addScaledVector(UP, 12 - 6 * u); C.tgt.copy(R.p).addScaledVector(R.fwd, -10); C.fov = 50; }],
  [37.5, 'omen', (t, u, C) => { const R = F.dragon, G = F.rival; C.pos.copy(R.p).addScaledVector(R.right, 27).addScaledVector(R.fwd, -4).addScaledVector(UP, 3.5); C.tgt.copy(R.p).addScaledVector(R.fwd, 6).lerp(G.p, lerp(.3, .42, u)); C.fov = lerp(50, 42, ease(u)); C.near = .3; }],
  [41, 'gold', (t, u, C) => { const G = F.rival; C.pos.copy(G.p).addScaledVector(G.fwd, 24).addScaledVector(G.right, 9).addScaledVector(UP, -2.5); C.tgt.copy(G.p).addScaledVector(G.fwd, -3); C.fov = 42; C.near = .3; }],
  [44, 'faceoff', (t, u, C) => { const R = F.dragon, G = F.rival; C.tgt.copy(R.p).lerp(G.p, .5); _a.copy(G.p).sub(R.p); const sep = _a.length(); _b.crossVectors(_a, UP).normalize(); const d = lerp(96, 78, ease(u)); C.pos.copy(C.tgt).addScaledVector(_b, -d).addScaledVector(UP, -6); C.tgt.y += 3; C.fov = K.clamp(2 * Math.atan(sep * .5 / .6 / d / 1.778) * 57.3, 26, 70); C.near = .3; }],
  [47.3, 'clash', (t, u, C) => { const e = ease(u); mix3(C.pos, [196, 178, -170], [212, 186, -196], e); C.tgt.copy(P.ring); C.tgt.y += 2; C.fov = lerp(62, 54, e); }],
  [51, 'pursuit', (t, u, C) => { const G = F.rival, R = F.dragon; C.tgt.copy(R.p).lerp(G.p, .45); C.pos.copy(C.tgt).addScaledVector(R.right, -52 + 10 * u).addScaledVector(UP, 12).addScaledVector(R.fwd, 18); C.fov = 54; C.near = .3; }],
  [55.5, 'helix', (t, u, C) => { const e = ease(u); mix3(C.pos, [-60, 66.6, 186], [-57, 67.4, 183], e); C.tgt.copy(F.dragon.p).lerp(F.rival.p, .5); C.tgt.y -= 4; C.fov = lerp(46, 52, e); C.near = .3; }],
  [59.4, 'plunge', (t, u, C) => { const e = ease(u); mix3(C.pos, [-32, 3.5, 147], [-37, 7, 152], e); const k = smooth(59.4, 60.4, t); C.tgt.copy(F.dragon.p).lerp(F.rival.p, .5).lerp(_a.set(-10, 10 + 22 * smooth(60.5, 62, t), 100), k); C.fov = 58; C.near = .3; }],
  [63, 'burst', (t, u, C) => { const e = ease(u); mix3(C.pos, [3, 67, 62], [1, 70, 60], e); C.tgt.set(-8, 14, 106).lerp(_a.copy(F.dragon.p).lerp(F.rival.p, .5), smooth(.2, .85, u) * .9); C.fov = 60; C.near = .3; }],
  [66.5, 'storm', (t, u, C) => { const e = ease(u); mix3(C.pos, [50, 150, 66], [40, 157, 74], e); C.tgt.copy(F.dragon.p).lerp(F.rival.p, .5).lerp(P.impact, .6); C.tgt.y -= 22; C.fov = lerp(66, 60, e); C.near = .3; }],
  [70.6, 'rain', (t, u, C) => { const e = ease(u), bx = lerp(-31, -30.4, e), bz = lerp(121, 119, e), dk = K.arch && K.arch.bridge ? K.arch.bridge.deck(bx, bz) : 52.7; C.pos.set(bx, dk + 3.4, bz); C.tgt.set(-2, 128, 6).lerp(_a.copy(F.dragon.p).lerp(F.rival.p, .5), .3); C.fov = 64; C.near = .2; }],
  [75, 'part', (t, u, C) => { const R = F.dragon, G = F.rival, e = ease(u); C.pos.copy(R.p).add(_a.set(46 - 8 * e, 8, -24)); C.tgt.copy(G.p).lerp(R.p, .3); C.fov = lerp(34, 24, e); C.near = .3; }],
  [80, 'lanterns', (t, u, C) => { const e = ease(u); mix3(C.pos, [-58, 66.4, 184], [-55, 67.2, 181], e); mix3(C.tgt, [-4, 100, 60], [-2, 150, 20], smooth(.1, .75, u)); C.fov = lerp(46, 40, e); C.near = .3; }],
];
film.cuts = shots.map(s => s[0]);
const shake = curve([[2.1, 0], [2.4, .8], [3.6, .15], [4.6, 0], [24.6, 0], [25, .35], [26.3, .5], [27.4, .1], [47.6, .1], [50.6, .3], [51, .1], [60.4, .1], [60.55, 1.4], [61.6, .3], [62.6, .1], [63.2, .7], [64.2, .15], [68.2, .15], [69.15, .5], [69.2, 2.2], [70.2, .4], [70.6, 0]]);

// ---------------------------------------------------------------- weather and light
const col = (r, g, b) => new THREE.Color(r, g, b);
const DAY = { sun: col(1.0, .93, .80), sunInt: 3.4, top: col(.07, .22, .60), hor: col(.52, .70, .92), gnd: col(.30, .27, .20), fog: col(.64, .76, .92), fogSun: col(1.0, .93, .80), dens: .00030, env: .9 },
  STORM = { sun: col(.80, .84, .95), sunInt: .9, top: col(.06, .08, .14), hor: col(.26, .30, .38), gnd: col(.14, .14, .15), fog: col(.34, .38, .46), fogSun: col(.55, .58, .64), dens: .00075, env: .7 },
  DUSK = { sun: col(1.0, .52, .22), sunInt: 3.0, top: col(.10, .12, .36), hor: col(1.05, .52, .30), gnd: col(.26, .17, .14), fog: col(.80, .52, .44), fogSun: col(1.5, .78, .36), dens: .00042, env: .85 };
const storm = curve([[0, 0], [36, 0], [41, .3], [47, .45], [56, .6], [63, .8], [67, 1], [69.6, 1], [72, .45], [76, .12], [80, 0]]);
const dusk = curve([[0, 0], [71, 0], [75, .5], [78, .9], [82, 1]]);
const cloud = curve([[0, .45], [36, .45], [47, .62], [63, .82], [69.5, .9], [76, .6], [84, .5]]);
const wet = curve([[0, 0], [69.4, 0], [71, 1], [77, .8], [84, .3], [90, .2]]);
const rain = curve([[69.5, 0], [70.3, 1], [73.5, .8], [76, 0]]);
const wind = curve([[0, .25], [36, .25], [47, .5], [66, .9], [70, 1], [76, .4], [82, .2]]);
const sunDay = new V3(-0.60, 0.58, 0.55).normalize(), sunDusk = new V3(-0.93, 0.10, 0.35).normalize();
const lerpP = (e, A, B, k) => { e.sunColor.lerp(B.sun, k); e.sunInt = lerp(e.sunInt, B.sunInt, k); e.skyTop.lerp(B.top, k); e.skyHorizon.lerp(B.hor, k); e.ground.lerp(B.gnd, k); e.fogColor.lerp(B.fog, k); e.fogSun.lerp(B.fogSun, k); e.fogDensity = lerp(e.fogDensity, B.dens, k); e.envInt = lerp(e.envInt, B.env, k); };
function setEnv(t) {
  const e = K.env, st = storm(t), du = dusk(t);
  e.sunColor.copy(DAY.sun); e.sunInt = DAY.sunInt; e.skyTop.copy(DAY.top); e.skyHorizon.copy(DAY.hor); e.ground.copy(DAY.gnd); e.fogColor.copy(DAY.fog); e.fogSun.copy(DAY.fogSun); e.fogDensity = DAY.dens; e.envInt = DAY.env;
  lerpP(e, DAY, DUSK, du); lerpP(e, null, STORM, st * .85);
  e.sunDir.copy(sunDay).lerp(sunDusk, smooth(0, 1, du)).normalize();
  e.storm = st; e.dusk = du; e.cloud = cloud(t); e.wet = wet(t); e.rain = rain(t); e.wind = wind(t); e.windDir.set(.8, .6);
  const tb = t - T.impact; e.flash = tb > -.06 && tb < 2 ? .55 * (tb < 0 ? smooth(-.06, 0, tb) : Math.exp(-tb * 7)) : 0;
  e.exposure = 1 + .12 * du - .1 * st - .3 * e.flash; e.rays = .10 + .25 * du; e.mist = lerp(.5, .9, st);
  e.lanterns = smooth(.15, .75, du);       // 0..1: how lit the lanterns and windows are
  // shadow box follows the action
  const R = F.dragon; if (F.shotName === 'summit' || F.shotName === 'storm' || F.shotName === 'part') { e.shadowFocus.set(0, 150, 0); e.shadowSize = 150; }
  else if (F.shotName === 'window' || F.shotName === 'chase') { e.shadowFocus.set(-50, 120, -20); e.shadowSize = 170; }
  else if (['sea', 'omen', 'gold', 'faceoff', 'clash'].includes(F.shotName)) { e.shadowFocus.copy(R.p); e.shadowSize = 190; }
  else { e.shadowFocus.set(-14, 60, 96); e.shadowSize = 170; }
}

// ---------------------------------------------------------------- per-frame
film.frame = t => {
  t = Math.max(0, Math.min(K.DUR - 1e-3, t)); nowT = t; F.t = t;
  const R = dragonState('red', t, F.dragon), G = dragonState('gold', t, F.rival);
  // breath targets
  if (t > 46.5 && t < 52) { R.aim.copy(P.ring); G.aim.copy(P.ring); } else if (t > 66 && t < 70) { R.aim.copy(G.p); G.aim.copy(R.p); } else { R.aim.copy(R.p).addScaledVector(R.fwd, 60); G.aim.copy(G.p).addScaledVector(G.fwd, 60); }
  let si = 0; while (si < shots.length - 1 && t >= shots[si + 1][0]) si++;
  const s = shots[si], t1 = si < shots.length - 1 ? shots[si + 1][0] : K.DUR, u = sat((t - s[0]) / (t1 - s[0]));
  const C = F.cam; C.roll = 0; C.near = .4; C.fov = 44;
  F.shot = si; F.shotName = s[1]; F.shotU = u; s[2](t, u, C);
  const dist = C.pos.distanceTo(C.tgt), sh = shake(t), k = dist * (.004 + .016 * sh);
  C.tgt.x += (K.noise2(t * .35, 3) - .5) * dist * .010 + (K.noise2(t * 11, 9) - .5) * k; C.tgt.y += (K.noise2(t * .31, 7) - .5) * dist * .008 + (K.noise2(t * 12, 21) - .5) * k;
  C.roll += (K.noise2(t * 9, 33) - .5) * .04 * sh;
  if (K.debug && K.debug.cam) { const c = K.debug.cam; C.pos.set(c[0], c[1], c[2]); C.tgt.set(c[3], c[4], c[5]); C.fov = c[6] || 44; C.roll = 0; }
  const cam = K.camera; cam.position.copy(C.pos); cam.up.set(0, 1, 0); cam.lookAt(C.tgt); if (C.roll) cam.rotateZ(C.roll);
  cam.fov = C.fov; cam.near = C.near; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  F.fade = 1 - smooth(89.0, 89.95, t);
  setEnv(t);
  if (K.water && K.water.events && !film._splashed) { film._splashed = true; for (const sp of film.splashes) K.water.events.push(sp); }
  return F;
};

})(window.K=window.K||{},window.THREE);
//# sourceURL=src/02_film.js

(function(K,THREE){'use strict';
// ============================================================================
// 10_sky — daylight dome: Rayleigh-ish gradient, HDR sun + aureole, pale day moon, high cirrus,
// and ray-marched cumulus (real 3D density, light-marched) rendered every frame into a low-res HDR
// target and composited with an edge-sculpting upsample. A static panorama of the same clouds feeds
// the environment map (layer 1) and any secondary camera (reflections).
// Weather (K.env, every frame): `cloud` = coverage · `storm` builds a thunderhead over Temple Peak (slate/indigo base, anvil top,
// sheet lightning inside from ~56 s, lit white by the collision flash, then a ring punched in it that opens into clear sky) ·
// `dusk` turns the dome into a sunset (hot horizon under the sun, rose-violet opposite, violet zenith, stars, a bright moon).
// Exports K.sky = { noise3D(), map, U, shadowGLSL, rebake(), lightning(t), scale, sharp, moonDir, ... }.
// ============================================================================
const V3 = THREE.Vector3, R = K.renderer, U = K.U;
const BASE = 900, TOPM = 4800, MAPSIZE = 96000, RP = 300000, WINDSPD = 6, STSPAN = 20000;
const FT = (K.film && K.film.T) || {}, FP = (K.film && K.film.P) || {}, TKEY = FT.key !== undefined ? FT.key : 25;   // the clouds are composed for the key frame
const sky = K.sky = { stormScale: .38, scale: .3, sharp: 0.9, base: BASE, top: TOPM, mapSize: MAPSIZE, steps: 84 };

// ---------------------------------------------------------------- fullscreen helper (nest-safe)
const fsScene = new THREE.Scene(), fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const fsTri = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3)));
fsTri.frustumCulled = false; fsScene.add(fsTri);
const FSV = 'varying vec2 vUv; void main(){ vUv = position.xy*.5+.5; gl_Position = vec4(position.xy, 0., 1.); }';
const blit = (mat, rt, layer = 0) => { const p = R.getRenderTarget(), pf = R.getActiveCubeFace(), pm = R.getActiveMipmapLevel(); fsTri.material = mat; R.setRenderTarget(rt, layer); R.render(fsScene, fsCam); R.setRenderTarget(p, pf, pm); };

// ---------------------------------------------------------------- tileable 3D noise (shared with the air module)
// 96³ RGBA8, mip-mapped. r = perlin-worley (cloud shape), g = worley fbm 6/12/24 (billows), b = worley fbm 2/4/8 (lumps), a = perlin fbm
sky.noise3D = () => {
  if (sky._n3) return sky._n3;
  const N = 96, rt = new THREE.WebGL3DRenderTarget(N, N, N, { type: THREE.UnsignedByteType, depthBuffer: false });
  const tx = rt.texture; tx.wrapS = tx.wrapT = tx.wrapR = THREE.RepeatWrapping; tx.minFilter = THREE.LinearMipmapLinearFilter; tx.magFilter = THREE.LinearFilter; tx.generateMipmaps = false;
  const m = new THREE.ShaderMaterial({ uniforms: { uZ: { value: 0 } }, depthTest: false, depthWrite: false, vertexShader: FSV, fragmentShader: K.GLSL.noise + /* glsl */`
    uniform float uZ; varying vec2 vUv;
    float wor(vec3 p, float per){ p *= per; vec3 i = floor(p), f = fract(p); float d = 1.;
      for(int z=-1;z<=1;z++) for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){ vec3 g = vec3(float(x),float(y),float(z)); vec3 r = g + kHash33(mod(i+g, per) + per*3.1) - f; d = min(d, dot(r,r)); }
      return 1. - min(sqrt(d), 1.); }
    float hh(vec3 i, float per){ return kHash13(mod(i, per) + per*1.3); }
    float vn(vec3 p, float per){ p *= per; vec3 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
      return mix(mix(mix(hh(i,per),hh(i+vec3(1,0,0),per),f.x), mix(hh(i+vec3(0,1,0),per),hh(i+vec3(1,1,0),per),f.x), f.y),
                 mix(mix(hh(i+vec3(0,0,1),per),hh(i+vec3(1,0,1),per),f.x), mix(hh(i+vec3(0,1,1),per),hh(i+vec3(1,1,1),per),f.x), f.y), f.z); }
    void main(){ vec3 p = vec3(vUv, uZ);
      float pf = 0., a = .5, per = 3.; for(int i=0;i<5;i++){ pf += a*vn(p, per); per *= 2.; a *= .5; } pf = clamp((pf/.96875 - .5)*1.9 + .5, 0., 1.);
      float w1 = wor(p,4.)*.625 + wor(p,8.)*.25 + wor(p,16.)*.125;
      float pw = w1 + pf*(1. - w1);
      float w2 = wor(p,6.)*.625 + wor(p,12.)*.25 + wor(p,24.)*.125;
      float w3 = wor(p,2.)*.625 + wor(p,4.)*.25 + wor(p,8.)*.125;
      gl_FragColor = vec4(pw, w2, w3, pf); }` });
  for (let z = 0; z < N; z++) { if (z === N - 1) tx.generateMipmaps = true; m.uniforms.uZ.value = (z + .5) / N; blit(m, rt, z); }
  m.dispose(); sky._n3 = tx; return tx;
};

// ---------------------------------------------------------------- shared cloud uniforms + GLSL
const CU = sky.U = {
  uN3: { value: null }, uCMap: { value: null }, uCMapC: { value: null },
  uCMapP: { value: new THREE.Vector4(0, 0, 1 / MAPSIZE, 0.45) },      // xy drift offset (m), z 1/size, w coverage
  uCDrift: { value: new V3() },
  uCMapS: { value: null },                                             // the thunderhead: same channels as uCMap, 20 km square over Temple Peak
  uStorm: { value: new THREE.Vector4(0, 0, 0, 0) },                    // x thunderhead strength 0..1, y storm 0..1, z dusk 0..1
  uHole: { value: new THREE.Vector4(0, 0, 1, 0) },                     // the ring punched by the collision: x, z, radius (m), strength
  uLtP: { value: [new THREE.Vector4(0, 2000, 0, 1e-6), new THREE.Vector4(0, 2000, 0, 1e-6)] },   // lights inside the cloud: xyz, w = 1/radius²
  uLtC: { value: [new V3(), new V3()] },                               // their radiance (0 = sheet lightning, 1 = the collision flash)
};
const STORM_GLSL = /* glsl */`
// The thunderhead (20 km square over Temple Peak). Returns r = cloud potential, g = top height, b = storm core (dark, relief under the base), a = dilated r.
// While it builds (uStorm.w = 0) it grows out of its core with a deeply lobed, broken edge and thin windows where the sun gets through; flank towers
// stand round it. After the collision (uStorm.w = 1) it breaks into solid pieces and the ring opens.
vec4 stormAt(vec2 xz){ vec4 s = texture2D(uCMapS, xz/${STSPAN.toFixed(1)} + .5); float post = uStorm.w;
  float n9 = texture2D(uNoiseTex, xz/9000. + .31).r, n6 = texture2D(uNoiseTex, xz/6100. + .77).r;
  float thr = (1. - uStorm.x) * mix(.5 + 1.0*n6, .72 + .56*n9, post);
  float win = smoothstep(.5, .6, texture2D(uNoiseTex, xz/4300. + .52).g*.6 + n6*.4) * (1. - post) * smoothstep(.2, .45, s.b);   // windows in the base
  float r0 = s.r;
  s.b = s.b * smoothstep(thr + .05, thr + .4, r0) * (1. - .75*win); s.r = smoothstep(thr, thr + .22, r0); s.a = smoothstep(thr, thr + .22, s.a);
  s.g = mix(s.g, .07, win);                                                       // a window: the cloud thins to a luminous veil the sun shines through
  if(uHole.w > 0.){ float dh = length(xz - uHole.xy) * (.86 + .3*texture2D(uNoiseTex, xz/5200.).r); float op = uHole.w*smoothstep(uHole.z, uHole.z*.86, dh);
    s.rb *= 1. - op; s.r = max(s.r, .5*uHole.w*uStorm.x*smoothstep(uHole.z*.95, uHole.z*1.06, dh)*smoothstep(uHole.z*1.3, uHole.z*1.1, dh)); }   // the ring: clear inside, a rolled rim
  return s; }
`;
// cloud shadow for anyone: add K.sky.U to your uniforms and K.sky.shadowGLSL to your fragPars; kCloudShadow(worldPos) -> 0 (shadow) .. 1 (sun)
sky.shadowGLSL = /* glsl */`
uniform sampler2D uCMap, uCMapS; uniform vec4 uCMapP, uStorm, uHole;
${STORM_GLSL}float kCloudShadow(vec3 wp){ vec2 q = wp.xz + uSunDir.xz * ((1500. - wp.y) / max(uSunDir.y, .08));
  vec4 m = texture2D(uCMap, (q - uCMapP.xy)*uCMapP.z + .5);
  if(uStorm.x > 0.){ float sr = stormAt(q).r; if(sr > m.r){ m.r = sr; m.g = 1.; } }
  float c = clamp((m.r - (1. - uCMapP.w)) / uCMapP.w, 0., 1.) * smoothstep(.02, .12, m.g);
  c *= .7 + .6*texture2D(uNoiseTex, q*.00021).r;
  return 1. - .72*smoothstep(.05, .5, c); }
`;
const CLOUD_GLSL = /* glsl */`
uniform sampler3D uN3; uniform sampler2D uCMap, uCMapC, uCMapS; uniform vec4 uCMapP, uStorm, uHole; uniform vec3 uCDrift; uniform vec3 uRo;
const float BASE = ${BASE.toFixed(1)}, TOPM = ${TOPM.toFixed(1)}, RP = ${RP.toFixed(1)}, S1 = 3100., S2 = 1700., SIG = .03;
const float STSPAN = ${STSPAN.toFixed(1)};
${STORM_GLSL}vec4 mapAt(vec2 xz){ vec4 m = texture2D(uCMap, (xz - uCMapP.xy)*uCMapP.z + .5);
  if(uStorm.x > 0.){ vec4 s = stormAt(xz); m.g = mix(m.g, max(m.g, s.g), smoothstep(0., .25, s.r)); m.rba = max(m.rba, s.rba); }
  return m; }
float altOf(vec3 p){ vec2 d = p.xz - uRo.xz; return p.y + dot(d,d)*(.5/RP); }
float tAlt(vec3 rd, float H){ float hh = dot(rd.xz, rd.xz), dy = H - uRo.y; float disc = rd.y*rd.y + 2.*hh*dy/RP; return disc < 0. ? -1. : 2.*dy/(rd.y + sqrt(disc)); }
// fp = footprint of one sample in metres (picks the mip level)
#define LOD(S) clamp(log2(fp/((S)/96.)), 0., 5.)
// big shape only (light march, env)
const float STLOW = 480.;   // how far below BASE the storm's lowest lobes and scud hang
float gV;   // how far the last densLo sample was from the cloud surface (in shape-noise units, < 0 outside)
float gB;   // local base altitude of the last densLo sample
float densLo(vec3 p, vec4 m, float fp, out float hr){
  gV = -1.; gB = BASE;
  float a = altOf(p), top = BASE + max(m.g, .05)*(TOPM - BASE), lowB = BASE - 140. - STLOW*step(.001, m.b);
  hr = (a - lowB)/(top - lowB);
  if(hr <= 0. || hr >= 1.) return 0.;
  float c = clamp((m.r - (1. - uCMapP.w)) / uCMapP.w, 0., 1.);
  c = max(c, m.b * smoothstep(.72, .86, hr) * .9);            // anvil: the tallest towers spread under the ceiling
  if(c <= .01) return 0.;
  vec3 q = p + uCDrift;
  float lf = textureLod(uN3, q.zxy / 8300., LOD(8300.)).a;
  float bs = BASE + (lf - .5)*280.;                             // ragged base
  if(m.b > 0.){                                                 // under the thunderhead the base is a landscape: rolls and shelves, hanging lobes
    float roll = texture2D(uNoiseTex, q.xz/6400. + .17).r, rip = texture2D(uNoiseTex, q.xz/2300. + .61).g;
    float lobe = 1. - min(texture2D(uNoiseTex, q.xz/3300. + .5).b*1.45, 1.);
    float rel = m.b*((roll - .42)*700. + (rip - .3)*170. - lobe*lobe*210.);
    bs += rel < 0. ? -330.*(1. - exp(rel/330.)) : rel; gB = bs; }                 // (hanging parts level off softly: no flat floor)
  hr = (a - bs)/(top - bs);
  if(hr <= 0.) return 0.;
  c *= smoothstep(0., .07, hr) * mix(mix(.74, 1.3, m.b), mix(.3, .8, m.b), pow(hr, 1.2)) * (1. - smoothstep(.92, 1., hr));
  float sh = textureLod(uN3, q / S1, LOD(S1)).b*.8 + (lf - .5)*.5 + .07;
  gV = sh - (1. - c);
  return clamp(gV / max(c, .05), 0., 1.);
}
float densHi(vec3 p, vec4 m, float fp, out float hr){
  float d = densLo(p, m, fp, hr);
  if(d <= 0.) return 0.;
  vec3 q = p + uCDrift*1.3;
  float bil = textureLod(uN3, q / S2, LOD(S2)).g*.66 + textureLod(uN3, q.yzx / (S2*.31), LOD(S2*.31)).g*.34;
  float er = (1. - bil) * mix(.76, .56, hr);
  return clamp((d - er) / (1. - er), 0., 1.);
}
`;

// ---------------------------------------------------------------- composition: the coverage map
// r = cloud potential (cloud where r > 1 - coverage), g = top height 0..1 (BASE..TOPM), b = anvil, a = r dilated by ~700 m (empty-space skipping)
const KEYC = new V3(-58, 66.4, 184), KEYT = new V3(-4, 86, 60);
function bakeMap() {
  const f = new V3().subVectors(KEYT, KEYC); f.y = 0; f.normalize(); const rx = -f.z, rz = f.x;
  // hero towers, placed as seen from the key camera: [azimuth° right of the view axis, distance m, radius m, top elevation°, anvil]
  const T = [
    [11, 6600, 2300, 29, 0], [19, 5900, 1250, 23, 0], [3, 6900, 1100, 20, 0], [25, 7200, 1700, 17.5, 0], [8, 5500, 1000, 15, 0], [14, 9500, 3000, 20, 0],   // the great tower behind Temple Peak
    [33, 9800, 2300, 19, 0], [41, 8200, 1200, 12, 0], [27, 12500, 1700, 12, 0], [52, 14000, 2600, 15, 0], [30, 17000, 3200, 13, 0],                       // right flank
    [-4, 16000, 2800, 11.5, 0], [-13.5, 9000, 1500, 13.5, 0], [-10, 13000, 2200, 10.5, 0], [-27, 13500, 2600, 8.5, 0], [-19, 19000, 3000, 9, 0], [-36, 17000, 2600, 9.5, 0],             // low banks, left (the sky above stays clear)
    [58, 7000, 1500, 24, 0], [-62, 9000, 1900, 20, 0], [100, 11000, 2800, 25, .8], [150, 8000, 1500, 17, 0], [-120, 12000, 2500, 22, 0], [-165, 9500, 1900, 18, 0], [-90, 15000, 3000, 16, 0], [125, 16000, 3000, 15, 0],
  ];
  const tow = [], anv = [], NT = T.length;
  for (const [az, d, r, el, an] of T) { const a = az * Math.PI / 180, cx = KEYC.x + d * (f.x * Math.cos(a) + rx * Math.sin(a)), cz = KEYC.z + d * (f.z * Math.cos(a) + rz * Math.sin(a));
    const alt = KEYC.y + d * Math.tan(el * Math.PI / 180) + d * d / (2 * RP); tow.push(new THREE.Vector4(cx, cz, r, K.clamp((alt - BASE) / (TOPM - BASE), .06, 1))); anv.push(an); }
  return K.bake(1024, 1024, /* glsl */`
    #define NT ${NT}
    uniform vec4 uTow[NT]; uniform float uAnv[NT]; uniform vec4 uKey;
    vec3 pot(vec2 x){
      float r = length(x);
      float w = kFbm(x/15000. + 3.7);
      vec2 wp = x + 1100.*(vec2(kNoise(x/2600.), kNoise(x/2600. + 31.7)) - .5);
      vec3 v1 = kVoronoi(wp/5600. + 2.3);
      float big = (1. - smoothstep(.10, .50, v1.x)) * smoothstep(.32, .52, v1.z*.5 + w*.7);
      vec3 v2 = kVoronoi(wp/2100. + 11.3);
      float small = (1. - smoothstep(.08, .44, v2.x)) * smoothstep(.5, .8, v2.z*.65 + w*.45);
      float P = max(big*(.82 + .18*v1.z), small*.98);
      float G = max(sqrt(big)*mix(.26, .7, v1.z*v1.z), sqrt(small)*mix(.11, .22, v2.z));
      float open = smoothstep(3000., 5200., r); P *= open;                       // open sky over the hero valley
      float ring = smoothstep(15000., 22000., r) * (1. - smoothstep(38000., 47000., r));
      float bank = ring * smoothstep(.26, .52, kFbm(x/7000. + 9.1));              // banks along the horizon
      P = max(P, bank*(.72 + .28*kNoise(x/2400.))); G = max(G, sqrt(bank)*mix(.28, .66, kNoise(x/8000. + 4.)));
      vec2 dk = x - uKey.xy; float dist = length(dk); vec2 dn = dk/max(dist, 1.);
      float az = atan(dot(dn, vec2(-uKey.w, uKey.z)), dot(dn, uKey.zw));           // + = right of the key view axis
      float wedge = smoothstep(-.86, -.66, az) * (1. - smoothstep(-.09, .03, az)) * (1. - smoothstep(10500., 13000., dist));
      P *= 1. - wedge;                                                             // clear deep blue, upper left of the key frame
      float A = 0.;
      for(int i=0;i<NT;i++){ vec4 t = uTow[i]; float an = uAnv[i]; float g = t.w;
        vec2 q = (x - t.xy)/t.z;
        float rr = length(q) * (1. + .42*(kNoise(x/900. + float(i)*7.3) - .5) + .3*(kNoise(x/2300. - float(i)*3.1) - .5));
        float fo = 1. - smoothstep(.42, 1., rr);
        float aa = an*smoothstep(0., .5, 1. - rr*.6); P = max(P, fo); G = max(G, g*max(pow(fo, .45), step(.01, aa)*.98)); A = max(A, aa); }
      return vec3(P, G, A);
    }
    vec4 bake(vec2 uv){ vec2 x = (uv - .5)*${MAPSIZE.toFixed(1)}; vec3 c = pot(x); float mx = c.x;
      for(int i=0;i<14;i++){ float a = float(i)*2.39996; float rr = i < 6 ? 380. : 760.; mx = max(mx, pot(x + vec2(cos(a), sin(a))*rr).x); }
      return vec4(c, mx); }`, { uniforms: { uTow: { value: tow }, uAnv: { value: anv }, uKey: { value: new THREE.Vector4(KEYC.x, KEYC.z, f.x, f.z) } }, mips: false, repeat: false });
}

// ---------------------------------------------------------------- the march
const MARCH = /* glsl */`
varying vec2 vUv;
uniform mat4 uCamW, uProjI; uniform vec4 uCP;   // x pixel angle (rad), y 1 = panorama, z dither seed
${CLOUD_GLSL}
float hg(float c, float g){ return (1. - g*g) / pow(1. + g*g - 2.*g*c, 1.5); }
float fogAmt(vec3 wp){ vec3 d = wp - uRo; float L = length(d); float k = uFogP.y * d.y / max(L, 1e-4);
  float od = uFogP.x * exp(clamp(-uFogP.y*(uRo.y - uFogP.z), -12., 4.)) * (abs(k) > 1e-5 ? (1. - exp(-k*L))/k : L) + uFogP.x*.05*L;
  return 1. - exp(-od*.55); }   // clouds stand above most of the haze: keep the far towers crisp
// cheap density for the light march: big lobes only, one 3D lookup
float densL(vec3 p, float fp){ vec4 m = mapAt(p.xz);
  float a = altOf(p), top = BASE + max(m.g, .05)*(TOPM - BASE), hr = (a - BASE)/(top - BASE);
  if(hr <= 0. || hr >= 1.) return 0.;
  float c = max(clamp((m.r - (1. - uCMapP.w)) / uCMapP.w, 0., 1.), m.b * smoothstep(.72, .86, hr) * .9);
  c *= smoothstep(0., .07, hr) * mix(mix(.74, 1.3, m.b), mix(.3, .8, m.b), hr) * (1. - smoothstep(.92, 1., hr));
  if(c <= .01) return 0.;
  float sh = textureLod(uN3, (p + uCDrift) / S1, LOD(S1)).b*.8 + .07;
  return clamp((sh - (1. - c)) / max(c, .05), 0., 1.); }
float sunOD(vec3 p, float fp){ float od = 0., hr;
  vec3 q = p + uSunDir*45.;  od += densHi(q, mapAt(q.xz), fp*1.4, hr) * 85.;
  od += densL(p + uSunDir*150., fp*2.5) * 150.;
  od += densL(p + uSunDir*400., fp*4.) * 330.;
  od += densL(p + uSunDir*1000., fp*8.) * 800.;
  return od; }
uniform sampler2D tDepth; uniform vec4 uDP;   // xy = low-res texel in uv, z = 1 when a depth buffer is available
uniform vec4 uLtP[2]; uniform vec3 uLtC[2];
void main(){
  vec3 rd;
  if(uCP.y > .5){ float az = (vUv.x - .5)*6.2831853, el = vUv.y*1.5707963; rd = vec3(cos(el)*cos(az), sin(el), cos(el)*sin(az)); }
  else { vec4 v = uProjI * vec4(vUv*2. - 1., 1., 1.); rd = normalize(mat3(uCamW) * (v.xyz / v.w)); }
  float lowAlt = BASE - (uStorm.x > 0. ? STLOW : 0.);
  float tIn = uRo.y > lowAlt ? 1. : tAlt(rd, lowAlt), tOut = min(tAlt(rd, TOPM), 44000.);
  vec3 S = vec3(0.); float T = 1., tw = 0.;
  bool vis = true;
  if(uDP.z > .5){ float dm = 0.;                                // skip texels that are (with a margin) entirely behind opaque geometry
    for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++) dm = max(dm, texture2D(tDepth, vUv + vec2(float(i), float(j))*uDP.xy*1.5).r);
    vis = dm > .999999; }
  if(vis && tIn > 0. && tIn < tOut){
    float cs = dot(rd, uSunDir);
    float ph = min(mix(hg(cs, -.3), hg(cs, .65), .55), 2.4);
    float st_ = uStorm.y, du_ = uStorm.z, dq = smoothstep(0., .6, du_);
    vec3 ambHi = uSkyCol*.5 + uSunCol*.025 + vec3(.13, .08, .30)*dq;                                    // violet tops at dusk
    vec3 ambLo = uSkyCol*.2 + vec3(.2,.21,.235)*(1. - .62*st_)*(1. - .75*dq) + uGndCol*.12 + vec3(.40, .13, .08)*dq*(1. - .6*st_);   // crimson-orange undersides
    ambLo = mix(ambLo, ambLo*vec3(.72, .8, 1.12), st_);                                                // slate / indigo bases under the storm
    vec3 sunHot = mix(vec3(1.), vec3(1.2, .6, .4), dq);                                                // light that has crossed cloud at sunset goes crimson
    vec3 sunGold = uSunCol * mix(vec3(1.), vec3(1.3, .84, .5), dq);                                    // sunlit faces go gold
    float rimK = pow(max(cs, 0.), 5.) * (1.1*st_ + 1.2*dq);                                            // silver / fiery linings where the sun breaks through
    vec3 bounce = (uSunCol*.3 + uSkyCol*.8) * vec3(.9, .96, 1.08) * min(st_*1.5, 1.);                               // the bright mist sea lights the base from below
    float t = tIn + uCP.z*fract(52.9829189*fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715))))*(60. + tIn*tIn/6e5), stL = 0.; bool inside = false;
    for(int i=0;i<${sky.steps};i++){
      if(t > tOut || T < .06) break;
      vec3 p = uRo + rd*t; float ds = min(60. + t*t/6e5, 480.);
      if((uStorm.x <= 0. || max(abs(p.x), abs(p.z)) > STSPAN*.5 + 2000.) && texture2D(uCMapC, (p.xz - uCMapP.xy)*uCMapP.z + .5).r < 1. - uCMapP.w){ stL = 2000.; t += stL; inside = false; continue; }   // nothing within 2 km
      vec4 m = mapAt(p.xz);
      if(m.a < 1. - uCMapP.w){ stL = max(ds, 430.); t += stL; inside = false; continue; }
      float fp = t*uCP.x, hr;
      float d = densHi(p, m, fp, hr); float gv = gV; bool near = gv > -.17;       // inside the shell around a cloud: walk in fine steps so no lobe is skipped
      if(d > 0. && !inside && stL > 0.){                           // just entered: bisect back to the surface
        float a0 = t - stL, a1 = t;
        for(int k=0;k<4;k++){ float tm = .5*(a0 + a1); vec3 pm = uRo + rd*tm; float h2; if(densHi(pm, mapAt(pm.xz), fp, h2) > 0.) a1 = tm; else a0 = tm; }
        t = a1; p = uRo + rd*t; m = mapAt(p.xz); d = densHi(p, m, fp, hr); gv = gV; near = true; }
      inside = d > 0.;
      float st = near ? ds*mix(.45, .38, uCP.z) : ds;
      if(d > 0.){
        float dd = clamp(d*5., 0., 1.);
        float od = sunOD(p, fp) * SIG * 6.;
        float sunE = exp(-od)*.76 + exp(-od*.2)*.19 + exp(-od*.04)*.05;
        float ao = 1. - .72*clamp(gv*2.6, 0., 1.); float gb = gB;
        float belly = 1.;
        if(st_ > .02){ vec3 qb = p + uCDrift; float nb = textureLod(uN3, qb/1500., LOD(1500.)).g*.6 + textureLod(uN3, qb.zxy/520., LOD(520.)).g*.4; belly = mix(1., .3 + 1.75*nb*nb, st_*(1. - .7*hr));
          belly *= mix(1., .5 + 1.7*smoothstep(.25, .75, texture2D(uNoiseTex, qb.xz/5600. + .43).r), min(st_*1.6, 1.)*(1. - .6*hr)); }   // great pale and dark provinces across the base
        float hang = clamp((BASE + 330. - altOf(p))/620., 0., 1.);                                 // the lower a lobe hangs, the more of the sea it sees
        vec3 Lc = sunGold * mix(vec3(1.), sunHot, 1. - exp(-od*.7)) * (sunE * ph * .5 + rimK*exp(-od*1.6)) + mix(ambLo, ambHi, hr) * ao * belly * mix(1., .55 + .45*hang, st_) + bounce * hang * hang * (.25 + .75*belly);
        for(int k=0;k<2;k++){ vec3 dl = p - uLtP[k].xyz; float xl = dot(dl, dl)*uLtP[k].w; Lc += uLtC[k] * belly / (1. + xl*xl); }   // lightning inside the cloud: a pool of light, not a white sky
        float tr = exp(-SIG*dd*st);
        S += T*(1. - tr)*Lc; tw += T*(1. - tr)*t; T *= tr;
      }
      stL = st; t += st;
    }
    T = clamp((T - .06)/.94, 0., 1.); float a = 1. - T; S /= .94;
    if(a > .001){ float f = fogAmt(uRo + rd*(tw/a)); S = mix(S, kFogColor(rd)*a, f); }
    // rain shafts and virga hanging from the storm base in the distance (in front of whatever cloud is behind them)
    if(uStorm.x > .05 && uStorm.w < .5){ float odr = 0., hl = length(rd.xz) + 1e-3; vec2 wn = uWind.xy;
      float j = fract(52.9829189*fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715))));
      for(int k=0;k<9;k++){ float u = (float(k) + j)/9.; float tr_ = (900. + 9500.*u*u)/hl; vec3 p = uRo + rd*tr_; float al = altOf(p);
        if(al > BASE + 150. || al < 40.) continue;
        vec4 sm = stormAt(p.xz); if(sm.b < .05) continue;
        vec2 xs = p.xz - wn*(BASE - al)*.35;                                                         // the curtains lean with the wind
        float cell = smoothstep(.44, .6, texture2D(uNoiseTex, xs/5200. + .23).r) * sm.b;
        float strk = .35 + 1.3*texture2D(uNoiseTex, vec2(dot(xs, vec2(.8, .6))/420., al/5200. + .3)).g;
        odr += cell * strk * smoothstep(60., 520., al) * smoothstep(BASE + 150., BASE - 150., al) * (2000.*u + 380.)/hl * .00062; }
      float ar = (1. - exp(-odr)) * smoothstep(.05, .3, uStorm.x) * smoothstep(.4, .16, rd.y);          // only toward the horizon: curtains in the distance
      vec3 rc = (uSkyCol*.34 + vec3(.1, .115, .15) + uSunCol*.035) * (1. + 1.6*pow(max(cs, 0.), 3.));
      S = rc*ar + S*(1. - ar); T *= 1. - ar; }
  }
  gl_FragColor = vec4(S, T);
}`;

// ---------------------------------------------------------------- the dome
const DOME_F = /* glsl */`
varying vec3 vD;
uniform sampler2D tCloud, tPano; uniform vec4 uMode;   // x 1 = panorama/env, y sharpen, zw 1/resolution
uniform vec3 uTop, uHor, uMoonDir, uRo; uniform vec4 uDet; uniform float uT, uBl; // x octave scale, y octave blend, zw low-res texel
const float RP = ${RP.toFixed(1)};
float tAltD(vec3 rd, float H){ float hh = dot(rd.xz, rd.xz), dy = H - uRo.y; return 2.*dy/(rd.y + sqrt(rd.y*rd.y + 2.*hh*dy/RP)); }
void main(){
  vec3 d = normalize(vD); float h = max(d.y, 0.), sd = dot(d, uSunDir), s = max(sd, 0.), du = uEnv.z, env = uMode.x;
  // gradient: deep zenith, lighter and slightly greener low down, a touch darker opposite the sun
  float g = pow(1. - h, mix(4.6, 3.2, du));
  float az = dot(normalize(d.xz + 1e-5), normalize(uSunDir.xz))*.5 + .5;                         // 1 = toward the sun's azimuth
  vec3 hor = mix(uHor, mix(vec3(.46, .36, .60), uHor, az*az*(3. - 2.*az)) * mix(.8, 1.25, az), du);   // sunset: hot under the sun, rose-violet opposite
  vec3 c = mix(uTop * mix(.66, .98, pow(1. - h, 1.5)), hor, g);
  c *= 1. + .16*sd*(1. - h*.5);
  // aureole + sun (at dusk a broad furnace glow and a larger, redder disc)
  vec3 warm = uSunCol * vec3(1., .93, .8);
  c += warm * (pow(s, 6.)*.035 + pow(s, 40.)*.07 + pow(s, 400.)*.35);
  c += uSunCol * du * (pow(s, 3.)*.07*(1. - h)*(1. - h) + pow(s, 14.)*.14 + pow(s, 90.)*.4);
  float dq = smoothstep(0., .6, du);                                                              // the colours of sunset arrive early (golden hour)
  c += dq * (vec3(1., .40, .10)*pow(1. - h, 5.)*(.2 + .8*az*az)*.5 + vec3(.85, .26, .26)*pow(1. - h, 2.2)*az*.12);
  c += uSunCol * mix(42., 16., du) * smoothstep(mix(.99988, .99972, du), mix(.99995, .99984, du), sd) * (1. - env);
  // stars: the first ones in the darkening sky away from the sun
  if(du > .5 && d.y > 0.02){ vec3 q = d*230., ip = floor(q), hs = kHash33(ip); float dd = length(q - ip - .5 - (hs - .5)*.6);
    c += vec3(.8, .88, 1.) * smoothstep(.2, .02, dd) * step(.55, hs.x) * (.25 + 2.2*hs.y*hs.y*hs.y) * (.7 + .3*sin(uT*(2. + 4.*hs.z) + hs.x*40.))
       * smoothstep(.5, 1., du) * (1. - .85*az) * smoothstep(.02, .3, d.y) * .9; }
  // the moon: pale by day, bright with a soft halo at dusk (lit from the sun's side)
  float md = dot(d, uMoonDir);
  c += vec3(.55, .66, 1.) * du * (.05*pow(max(md, 0.), 600.) + .02*pow(max(md, 0.), 60.));
  if(md > .9995){ vec3 mx = normalize(cross(uMoonDir, vec3(0.,1.,0.))), my = cross(mx, uMoonDir); vec2 q = vec2(dot(d, mx), dot(d, my)) / .0105; float r2 = dot(q, q);
    if(r2 < 1.){ vec3 n = normalize(q.x*mx + q.y*my - sqrt(1. - r2)*uMoonDir); float lit = smoothstep(-.08, .25, dot(n, normalize(uSunDir - uMoonDir*dot(uSunDir,uMoonDir)*.35)));
      float mare = texture2D(uNoiseTex, q*.11 + .37).r; float alb = mix(.62, 1., smoothstep(.38, .62, mare)) * (.9 + .2*texture2D(uNoiseTex, q*.5).a);
      c += vec3(.92, .95, 1.) * lit * alb * mix(.5, 2.4, du) * smoothstep(1., .9, r2) * (.35 + .65*h); } }
  // storm: a high broken overcast (altostratus sheets with luminous gaps) so that no part of the sky is a flat colour
  float stm = uEnv.x;
  if(stm > .02 && d.y > .01){ float t = tAltD(d, 6200.); vec2 p = uRo.xz + d.xz*t + vec2(uT*31., uT*22.);
    float n1 = texture2D(uNoiseTex, p/52000. + .21).r, n2 = texture2D(uNoiseTex, p/17000. + vec2(n1*.3, .4)).g, n3 = texture2D(uNoiseTex, p/5600. + .7).a, n4 = texture2D(uNoiseTex, p/1900.).r;
    float dens = smoothstep(.3, .7, n1*.55 + n2*.3 + n3*.15 + .1*stm), relief = n2*.5 + n3*.32 + n4*.18;
    vec3 lit = (uSunCol*(.2 + .5*pow(s, 4.)) + uSkyCol*.9) * mix(.5, 1.25, smoothstep(.25, .75, relief));
    vec3 shd = uSkyCol*vec3(.5, .56, .74) + vec3(.03, .035, .05);
    vec3 ac = mix(lit, shd, smoothstep(.35, .9, dens)*.85);                                         // thin = luminous, thick = slate
    c = mix(c, ac, smoothstep(.02, .35, dens) * smoothstep(.05, .5, stm) * exp(-t/60000.) * smoothstep(.01, .1, d.y) * .9); }
  // high cirrus
  if(d.y > .015){ float t = tAltD(d, 9800.); vec2 p = uRo.xz + d.xz*t + vec2(uT*14., uT*9.);
    vec2 q = vec2(p.x*.82 - p.y*.57, p.x*.57 + p.y*.82) / 30000.;
    float pch = texture2D(uNoiseTex, q*.31 + .13).r;
    vec2 w = q*vec2(.34, 1.25) + (pch - .5)*.5 + texture2D(uNoiseTex, q*.9).a*.07;
    float st = texture2D(uNoiseTex, w*1.7).g*.55 + texture2D(uNoiseTex, w*4.3 + .31).r*.3 + texture2D(uNoiseTex, w*11.).a*.15;
    float a = smoothstep(.54, .8, pch) * smoothstep(.36, .9, st) * exp(-t/70000.) * smoothstep(.015, .13, d.y);
    c = mix(c, uSunCol*mix(.3, .42, du) + uSkyCol*.35, a*mix(.2, .5, du)); }
  // cumulus
  vec4 cl;
  if(env > .5){ cl = texture2D(tPano, vec2(atan(d.z, d.x)/6.2831853 + .5, asin(clamp(d.y, 0., 1.))/1.5707963)); if(d.y < 0.) cl = vec4(0.,0.,0.,1.); c = c*cl.a + cl.rgb; }
  else {
    // edge-sculpting upsample: the low-res cloud layer is looked up through a fine, world-anchored warp (two octaves chosen by the
    // field of view), so silhouettes and shading break into full-resolution fluff instead of bilinear mush; then alpha is re-sharpened
    vec2 uc = vec2(atan(d.z, d.x)/6.2831853, asin(clamp(d.y, -1., 1.))/6.2831853), up = d.xz/6.2831853; float wz = smoothstep(.6, .85, d.y);
    float k0 = uDet.x, k1 = uDet.x*2.;
    vec4 n0 = mix(texture2D(uNoiseTex, uc*k0), texture2D(uNoiseTex, up*k0), wz), n1 = mix(texture2D(uNoiseTex, uc*k1), texture2D(uNoiseTex, up*k1), wz);
    vec4 nn = mix(n0, n1, uDet.y);
    vec2 uv = gl_FragCoord.xy * uMode.zw + (vec2(nn.a - .5, nn.g - .36) * 2.6 + vec2(.5 - nn.b*1.3) * .9) * uDet.zw * uMode.y;
    cl = texture2D(tCloud, uv);
    if(uBl > 0.){ vec2 o = uDet.zw*.7; cl = mix(cl, .25*(texture2D(tCloud, uv + o) + texture2D(tCloud, uv - o) + texture2D(tCloud, uv + vec2(o.x, -o.y)) + texture2D(tCloud, uv + vec2(-o.x, o.y))), uBl); }
    float a = 1. - cl.a;
    if(a > .004){
      vec3 base = cl.rgb / max(a, .04);
      float th = .4 + (nn.a - .5)*.2;
      float a2 = mix(a, smoothstep(th - .2, th + .2, a), uMode.y);
      c = mix(c, base, a2); } }
  // horizon: merge into the haze
  vec3 fc = kFogColor(d); fc = mix(fc, fc*vec3(1.22, .9, .7) + vec3(.2, .06, 0.)*az*az, dq);
  c = mix(c, fc, pow(1. - h, 14.)*.92);
  if(d.y < 0.) c = mix(fc, mix(fc*.82, uGndCol*1.7, env), smoothstep(0., -.22, d.y));
  gl_FragColor = vec4(c, 1.);
}`;

// Sheet lightning inside the thunderhead: stateless time buckets. K.sky.lightning(t, out) -> out = { a: brightness 0..1 at film time t,
// p: Vector3 (world position of the glow inside the cloud), r: radius of the glow (m), k: bucket index (a new flash each bucket), age: seconds since it struck }.
// The odds follow K.env.storm of the frame being rendered (nothing below storm 0.5, i.e. before ~55 s; ~1.4 flashes a second at full storm).
sky.lightning = (t, o = {}) => { const B = .62, st = K.env.storm || 0, k = Math.floor(t / B), age = t - k * B, h = K.hash;
  o.p = o.p || new V3(); o.k = k; o.age = age; o.a = 0; o.r = 800;
  if (h(k, 71) < K.smooth(.5, 1, st) * .88) {
    const f = .5 + .5 * Math.sin(age * (48 + 30 * h(k, 5)) + h(k, 9) * 6.28), re = .2 + .18 * h(k, 13);
    o.a = Math.min(1, Math.exp(-age * 7.5) * (.45 + .55 * f * f) + (age > re ? .8 * Math.exp(-(age - re) * 10) : 0));
    o.p.set((h(k, 21) - .5) * 3600, 1150 + 700 * h(k, 23), (h(k, 25) - .5) * 3600); o.r = 650 + 500 * h(k, 27); }
  return o; };

K.reg('sky', {
  init() {
    const e = K.env;
    CU.uN3.value = sky.noise3D(); CU.uCMap.value = sky.map = bakeMap();
    // coarse occupancy: max cloud potential within each 2 km cell + 3 km margin (lets empty sky be crossed in 2 km strides)
    { CU.uCMapC.value = K.bake(48, 48, `uniform sampler2D tM; vec4 bake(vec2 uv){ vec2 c = (floor(uv*48.) + .5)/48.; float m = 0.; for(int j=0;j<18;j++) for(int i=0;i<18;i++) m = max(m, texture2D(tM, c + (vec2(float(i), float(j))/17. - .5)*(8000./${MAPSIZE.toFixed(1)})).a); return vec4(m); }`, { uniforms: { tM: { value: sky.map } }, mips: false, repeat: false }); }
    // the thunderhead: a ragged cell 6 km in radius over Temple Peak, tallest and anvil-topped in the middle
    CU.uCMapS.value = K.bake(512, 512, /* glsl */`
      vec3 pot(vec2 x){ float r = length(x*vec2(1., 1.12))/6000., n = kFbm(x/4200. + 3.1), n2 = kFbm(x/1300. + 7.7);
        float P = (1. - smoothstep(.16, 1., r*(1. + .7*(n - .5)))) * (.84 + .32*n2);
        float core = smoothstep(.3, .7, P);
        vec3 c = vec3(P, mix(.5, 1., smoothstep(.1, .6, P)) * (.8 + .25*kNoise(x/1900. + 1.7)), core);
        // flank towers: cumulus congestus standing round the cell, sunlit, appearing as the storm rises
        for(int i=0;i<16;i++){ float fi = float(i), a = fi*2.39996 + 1.1, rr = (.34 + .6*kHash11(fi*3.7 + .3))*6000., sz = 520. + 760.*kHash11(fi*5.1 + 2.);
          vec2 q = (x - vec2(cos(a), sin(a))*rr)/sz; float d = length(q)*(1. + .5*(kNoise(x/700. + fi*9.1) - .5));
          float f = (1. - smoothstep(.35, 1., d)) * (.56 + .34*kHash11(fi*7.3 + 5.));
          if(f > c.x){ c.x = f; c.y = max(c.y*(1. - smoothstep(0., .3, f)), mix(.3, .5 + .5*kHash11(fi*1.7 + 9.), pow(1. - min(d, 1.), .5))); } }
        return c; }
      vec4 bake(vec2 uv){ vec2 x = (uv - .5)*${STSPAN.toFixed(1)}; vec3 c = pot(x); float mx = c.x;
        for(int i=0;i<14;i++){ float a = float(i)*2.39996; float rr = i < 6 ? 380. : 760.; mx = max(mx, pot(x + vec2(cos(a), sin(a))*rr).x); }
        float e = smoothstep(.5, .44, max(abs(uv.x - .5), abs(uv.y - .5)));
        return vec4(c.x*e, c.y, c.z*e, mx*e); }`, { mips: false, repeat: false });
    const mk = pano => K.shaderMat({ depthTest: false, depthWrite: false, vertexShader: FSV, fragmentShader: MARCH,
      uniforms: Object.assign({ uCamW: { value: new THREE.Matrix4() }, uProjI: { value: new THREE.Matrix4() }, uRo: { value: new V3(0, 90, 60) }, uCP: { value: new THREE.Vector4(.0025, pano ? 1 : 0, 0, 0) }, tDepth: { value: null }, uDP: { value: new THREE.Vector4() } }, CU) });
    const mMarch = this.mMarch = mk(false), mPano = this.mPano = mk(true);
    const rtOpt = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    let rtC = new THREE.WebGLRenderTarget(8, 8, rtOpt);
    const rtP = new THREE.WebGLRenderTarget(1024, 384, rtOpt); rtP.texture.wrapS = THREE.RepeatWrapping;
    let panoKey = '';
    // moon: upper left of the key frame, between the west needle and Temple Peak
    { const f = new V3().subVectors(KEYT, KEYC).normalize(), r = new V3().crossVectors(f, new V3(0, 1, 0)).normalize(), u = new V3().crossVectors(r, f);
      sky.moonDir = f.clone().addScaledVector(r, -.40 * .404 * 16 / 9).addScaledVector(u, .70 * .404).normalize(); }
    const dm = this.mat = K.shaderMat({ side: THREE.BackSide, depthWrite: false, depthTest: true,
      uniforms: { tCloud: { value: rtC.texture }, tPano: { value: rtP.texture }, uMode: { value: new THREE.Vector4(0, sky.sharp, 1, 1) }, uTop: { value: e.skyTop }, uHor: { value: e.skyHorizon },
        uMoonDir: { value: sky.moonDir }, uRo: { value: new V3() }, uDet: { value: new THREE.Vector4(44, 0, 1 / 576, 1 / 324) }, uT: U.uTime, uBl: { value: 0 } },
      vertexShader: `varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.); gl_Position = p.xyww; }`,
      fragmentShader: DOME_F });
    const dome = this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), dm); dome.frustumCulled = false; dome.renderOrder = 1000; dome.layers.enable(1); K.scene.add(dome);
    const sz = new THREE.Vector2(), LT = {}, ltSave = [new V3(), new V3()];
    // everything the march needs from the weather this frame (drift is anchored at the key frame; all of it is a function of film time)
    const weather = () => { const w = e.windDir, l = Math.hypot(w.x, w.y) || 1, t = U.uTime.value, s = WINDSPD * (t - TKEY), st = e.storm || 0;
      CU.uCMapP.value.x = w.x / l * s; CU.uCMapP.value.y = w.y / l * s; CU.uCMapP.value.w = Math.max(.02, e.cloud); CU.uCDrift.value.set(-w.x / l * s, t * 2.2, -w.y / l * s);
      const post = FT.impact !== undefined && t > FT.impact ? 1 : 0;                           // (both mappings give 1 at full storm, so nothing jumps at the collision)
      CU.uStorm.value.set(post ? K.smooth(.1, .62, st) : K.smooth(.22, .7, st), st, e.dusk || 0, post);
      // the ring punched by the collision opens fast, then keeps widening as the storm breaks up
      const tb = FT.impact !== undefined && FP.impact ? t - FT.impact : -1;
      if (tb > 0) CU.uHole.value.set(FP.impact.x, FP.impact.z, 200 + 1500 * (1 - Math.exp(-tb * .8)) + 260 * Math.max(tb - 2.5, 0), 1); else CU.uHole.value.set(0, 0, 1, 0);
      // sheet lightning inside the cloud + the white flash of the collision
      sky.lightning(t, LT); CU.uLtP.value[0].set(LT.p.x, LT.p.y, LT.p.z, 1 / (LT.r * LT.r)); CU.uLtC.value[0].set(.78, .86, 1.15).multiplyScalar(4.6 * LT.a);
      const fl = e.flash || 0; if (FP.impact) CU.uLtP.value[1].set(FP.impact.x, BASE + 450, FP.impact.z, 1 / (3000 * 3000)); CU.uLtC.value[1].set(1, 1, 1.06).multiplyScalar(9 * fl); };
    dome.onBeforeRender = (rnd, scene, cam) => {
      weather();
      if (cam === K.camera) {
        const cur = R.getRenderTarget(); if (cur) sz.set(cur.width, cur.height); else R.getDrawingBufferSize(sz);
        const st0 = e.storm || 0, scl = st0 > .3 || (CU.uHole.value.w > 0 && st0 > .02) ? Math.max(sky.scale, sky.stormScale) : sky.scale;   // the thunderhead is close overhead: a finer layer
        const w = Math.max(8, Math.round(sz.x * scl)), h = Math.max(8, Math.round(sz.y * scl));
        if (rtC.width !== w || rtC.height !== h) rtC.setSize(w, h);
        const u = mMarch.uniforms; u.uCamW.value.copy(cam.matrixWorld); u.uProjI.value.copy(cam.projectionMatrixInverse); u.uRo.value.setFromMatrixPosition(cam.matrixWorld);
        const tanH = 1 / cam.projectionMatrix.elements[5]; u.uCP.value.x = 2 * tanH / h;
        const near = Math.max(K.smooth(.25, .4, e.storm || 0), CU.uHole.value.w * K.smooth(0, .1, e.storm || 0)); u.uCP.value.z = near; dm.uniforms.uBl.value = near;   // the thunderhead is close overhead: finer, jittered steps + a filtered composite
        const dt = cur && cur.depthTexture && !cur.samples ? cur.depthTexture : null; u.tDepth.value = dt; u.uDP.value.set(1 / w, 1 / h, dt ? 1 : 0, 0);
        blit(mMarch, rtC);
        const lf = Math.log2(Math.max(.02, .404 / tanH)), li = Math.floor(lf);
        dm.uniforms.uMode.value.set(0, sky.sharp * K.clamp(tanH / .25, .3, 1), 1 / sz.x, 1 / sz.y);   // long lenses: less edge warp (the cloud is already magnified)
        dm.uniforms.uDet.value.set(44 * Math.pow(2, li), lf - li, 1 / w, 1 / h);
        dm.uniforms.uRo.value.copy(u.uRo.value);
      } else {
        // environment / reflection cameras: a static panorama, re-baked only when the weather has moved a step (no lightning in it)
        const key = [Math.round((e.storm || 0) * 10), Math.round((e.dusk || 0) * 10), Math.round(e.cloud * 20), Math.round(CU.uHole.value.z / 400) * CU.uHole.value.w, e.sunDir.x.toFixed(2), e.sunDir.y.toFixed(2)].join();
        if (key !== panoKey) { panoKey = key; mPano.uniforms.uCP.value.x = Math.PI / 2 / 384;
          for (let k = 0; k < 2; k++) { ltSave[k].copy(CU.uLtC.value[k]); CU.uLtC.value[k].set(0, 0, 0); }
          blit(mPano, rtP); for (let k = 0; k < 2; k++) CU.uLtC.value[k].copy(ltSave[k]); }
        dm.uniforms.uMode.value.set(1, 0, 1, 1); dm.uniforms.uRo.value.set(0, 90, 60);
      }
    };
    sky.rebake = () => { panoKey = ''; };
    sky.cloudRT = () => rtC;
  },
  update(F) {}
});

})(window.K=window.K||{},window.THREE);
//# sourceURL=src/10_sky.js

(function(K,THREE){'use strict';
// ============================================================================
// 20_terrain — the GROUND: lake bed, pebble beaches, grassy banks, forested hills out to the far plane.
//   geometry : nested square rings (2 m cells around the lake, doubling outward to ±12 km), heights from K.world.h,
//              ring borders stitched so there are no cracks
//   material : height/slope/noise layering — lake-bed sand and stones darkening with depth, wet pebble beach,
//              grass and leaf litter, and beyond ~300 m a baked forest-canopy map (pines with maple/ginkgo patches)
//   also     : scatters shoreline boulders through K.rock (25_rock.js draws them with the rock material)
// The lake surface itself is 45_water.js. Exports K.terrain = { mesh, mat, tex }.
// ============================================================================
const W = K.world, { sat, lerp, smooth } = K, CX = -14, CZ = 96;
const terrain = K.terrain = { tex: {} };

function buildGeo() {
  const N = 192, LV = 7, pos = [], nrm = [], idx = [];
  for (let l = 0; l < LV; l++) {
    const c = 2 * Math.pow(2, l), half = N / 2 * c, base = pos.length / 3, id = new Int32Array((N + 1) * (N + 1)).fill(-1);
    const hole = (i, j) => l > 0 && i > N / 4 && i < 3 * N / 4 && j > N / 4 && j < 3 * N / 4;       // strictly inside the finer level
    const H = (i, j) => W.h(CX - half + i * c, CZ - half + j * c);
    let n = 0;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      if (hole(i, j)) continue;
      const x = CX - half + i * c, z = CZ - half + j * c; let y = H(i, j);
      // outer border of a finer level: odd vertices sit exactly on the coarser level's edge
      if (l < LV - 1) { if ((j === 0 || j === N) && (i & 1)) y = (H(i - 1, j) + H(i + 1, j)) / 2; else if ((i === 0 || i === N) && (j & 1)) y = (H(i, j - 1) + H(i, j + 1)) / 2; }
      const e = c * .5, nx = W.h(x - e, z) - W.h(x + e, z), nz = W.h(x, z - e) - W.h(x, z + e), il = 1 / Math.hypot(nx, 2 * e, nz);
      pos.push(x, y, z); nrm.push(nx * il, 2 * e * il, nz * il); id[j * (N + 1) + i] = base + n++;
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = id[j * (N + 1) + i], b = id[j * (N + 1) + i + 1], d = id[(j + 1) * (N + 1) + i], e = id[(j + 1) * (N + 1) + i + 1];
      if (a < 0 || b < 0 || d < 0 || e < 0) continue; idx.push(a, d, b, b, d, e);
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setIndex(idx);
  return g;
}

function bakeCanopy() {
  // tree crowns seen from above: rg normal, b crown shading (dark gaps between crowns), a crown id
  const GL = /* glsl */`
    vec3 pv(vec2 p, vec2 per){ vec2 n=floor(p), f=fract(p); float d1=8., d2=8., id=0.;
      for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){ vec2 g=vec2(i,j), c=mod(n+g, per), o=kHash22(c+.5), r=g+o-f; float d=dot(r,r); if(d<d1){ d2=d1; d1=d; id=kHash12(c+7.7); } else if(d<d2) d2=d; }
      return vec3(sqrt(d1), sqrt(d2)-sqrt(d1), id); }
    float pnz(vec2 p, vec2 per){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(kHash12(mod(i,per)),kHash12(mod(i+vec2(1,0),per)),f.x), mix(kHash12(mod(i+vec2(0,1),per)),kHash12(mod(i+vec2(1,1),per)),f.x), f.y); }
    float hgt(vec2 uv){ vec3 a = pv(uv*13., vec2(13.)), b = pv(uv*29.+4., vec2(29.));
      return max((1. - a.x*1.25)*(.6 + .6*a.z), (1. - b.x*1.3)*.55*(.5 + b.z)) + .10*pnz(uv*90., vec2(90.)) + .05*pnz(uv*220., vec2(220.)); }`;
  return K.bake(1024, 1024, GL + /* glsl */`
    vec4 bake(vec2 uv){ float e = 1./1024., h = hgt(uv);
      vec3 n = normalize(vec3(-(hgt(uv+vec2(e,0.)) - hgt(uv-vec2(e,0.)))/(2.*e)*.022, -(hgt(uv+vec2(0.,e)) - hgt(uv-vec2(0.,e)))/(2.*e)*.022, 1.));
      vec3 a = pv(uv*13., vec2(13.)), b = pv(uv*29.+4., vec2(29.)); float id = (1. - a.x*1.25)*(.6 + .6*a.z) > (1. - b.x*1.3)*.55*(.5 + b.z) ? a.z : b.z;
      return vec4(n.xy*.5+.5, clamp(h*1.15 - .1, 0., 1.), id); }`);
}

K.reg('terrain', {
  init() {
    const R = K.rock; R.bakeGround(); const T = terrain.tex; T.gndA = R.tex.gndA; T.gndN = R.tex.gndN; T.canopy = bakeCanopy();
    const mat = terrain.mat = K.mat({
      roughness: .95, metalness: 0, envMapIntensity: .4, key: 'terrain',
      uniforms: { tGA: { value: T.gndA }, tGN: { value: T.gndN }, tCan: { value: T.canopy } },
      fragPars: /* glsl */`uniform sampler2D tGA, tGN, tCan; vec3 S(float r, float g, float b){ return pow(vec3(r,g,b), vec3(2.2)); }`,
      frag: /* glsl */`
        vec3 P = vWPos; float y = P.y, dist = length(P - cameraPosition);
        float n1 = texture2D(uNoiseTex, P.xz*.0019).r, n2 = texture2D(uNoiseTex, P.xz*.013 + .3).r, n3 = texture2D(uNoiseTex, P.xz*.09 + .7).a, rg = texture2D(uNoiseTex, P.xz*.031).g;
        vec4 gA = texture2D(tGA, P.xz/6.), gN = texture2D(tGN, P.xz/6.), gA2 = texture2D(tGA, P.xz/1.7 + .37), gN2 = texture2D(tGN, P.xz/1.7 + .37);
        float nearK = 1. - smoothstep(60., 220., dist);
        vec2 bn = (gN.xy*2.-1.) + (gN2.xy*2.-1.)*.8*nearK; float cav = gN.b * mix(1., .55 + .9*gN2.b, nearK), stone = max(gA.a, gA2.a*nearK*.8);
        vec3 peb = mix(gA.rgb, gA2.rgb, .45*nearK);
        // ---- land: grass, forest floor, leaf litter, bare soil on the paths of water
        float fib = gN.a*.6 + gN2.a*.4;
        vec3 grass = mix(S(.20,.34,.10), S(.46,.56,.16), fib) * (.7 + .6*n2); grass = mix(grass, S(.55,.52,.20), smoothstep(.55,.8,n3)*.5);
        vec3 floorC = mix(S(.30,.24,.15), S(.42,.30,.16), n3) * (.7 + .5*cav);
        vec3 litter = mix(S(.74,.30,.10), S(.84,.60,.16), step(.5, fract(gA.a*7.3 + gN2.a*3.))) ;
        float forest = smoothstep(.42, .62, n1*.6 + n2*.4);                              // where trees stand: darker floor, litter
        vec3 land = mix(grass, floorC, forest*.7);
        land = mix(land, litter, smoothstep(.62, .8, gN2.a)*(.25 + .55*forest)*nearK*step(.45, n3));
        land = mix(land, peb*.9, stone * smoothstep(.5, .75, rg) * .9);                 // stony patches
        land *= .55 + .7*cav;
        // ---- shore: wet pebbles at the waterline, pale dry gravel and sand above
        float shoreN = (n2 - .5)*1.4 + (n3 - .5)*.5;
        float beach = 1. - smoothstep(.6, 1.7, y + shoreN*.7);
        vec3 sand = mix(S(.80,.74,.60), S(.70,.62,.48), n3) * (.75 + .4*cav);
        vec3 shore = mix(sand, peb, clamp(stone*1.3 + smoothstep(.35,.6,n2)*.5, 0., 1.));
        float wetb = 1. - smoothstep(.05, .5, y + (n3 - .5)*.3);
        shore *= mix(1., .5, wetb);
        vec3 col = mix(land, shore, beach);
        // ---- lake bed: pale sand and stones in the shallows, ripples, weed, darker silt with depth
        float under = 1. - smoothstep(-.4, .1, y), depth = max(-y, 0.);
        float rip = sin(P.x*5.5 + sin(P.z*1.3)*2. + n2*12.) * .5 + .5;
        vec3 bed = mix(S(.84,.80,.66), S(.66,.62,.50), n3*.6 + rip*.25);
        bed = mix(bed, peb*1.05, clamp(stone*1.2*(1. - smoothstep(1., 7., depth)) + smoothstep(.6,.8,rg)*.6, 0., 1.));
        bed = mix(bed, S(.16,.30,.16), smoothstep(.55, .75, n2*.6 + n3*.4) * smoothstep(.5, 3., depth) * .7);   // weed beds
        bed = mix(bed, S(.20,.33,.34), smoothstep(1.5, 14., depth)*.9) * (.6 + .5*cav);
        col = mix(col, bed, under);
        // ---- far: the forest canopy
        float farK = smoothstep(240., 520., dist) * smoothstep(1.5, 4., y);
        vec4 cn = texture2D(tCan, P.xz/52.), cn2 = texture2D(tCan, P.xz/260. + .21);
        float fk2 = smoothstep(900., 2600., dist); vec4 cc = mix(cn, cn2, fk2);
        float patchM = smoothstep(.56, .74, texture2D(uNoiseTex, P.xz*.0017 + .5).r*.7 + n2*.3);
        float idc = cc.a;
        vec3 pine = mix(S(.07,.19,.07), S(.20,.36,.11), fract(idc*5.3));
        vec3 leafC = idc < .35 ? S(.74,.15,.07) : idc < .7 ? S(.88,.42,.09) : S(.90,.72,.16);
        vec3 canopy = mix(pine, leafC*.8, step(.45, fract(idc*3.7)) * patchM) * (.2 + 1.0*cc.b) * (.7 + .5*n1);
        col = mix(col, canopy, farK);
        bn = mix(bn*1.1, (cc.xy*2.-1.)*2.2, farK);
        diffuseColor.rgb = col;
        roughnessFactor = mix(mix(.95, .55, wetb*beach), .9, max(farK, under*.3));
        vec3 wn = normalize(kN + vec3(bn.x, 0., bn.y)*.55);
        normal = normalize((viewMatrix * vec4(wn, 0.)).xyz);`,
      // the last kilometres dissolve into the horizon haze so the edge of the world never shows
      fragEnd: `gl_FragColor.rgb = mix(gl_FragColor.rgb, kFogColor(normalize(vWPos - cameraPosition)), smoothstep(6500., 11500., length(vWPos.xz - cameraPosition.xz)));`,
    });
    const m = terrain.mesh = new THREE.Mesh(buildGeo(), mat); m.receiveShadow = true; m.frustumCulled = false; m.name = 'terrain'; m.renderOrder = 3; K.scene.add(m);   // after the rock, so hidden ground costs nothing
    // ---- shoreline rocks and boulder fields (drawn by the rock module with the limestone material)
    R.shore = (put, rb) => {
      const shoreR = a => { let lo = 100, hi = 460; for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; if (W.h(CX + Math.cos(a) * mid, CZ + Math.sin(a) * mid) < .2) lo = mid; else hi = mid; } return lo; };
      for (let k = 0; k < 420; k++) {
        const a = rb() * Math.PI * 2, r0 = shoreR(a), n = rb() < .5 ? 1 : 2 + (rb() * 5 | 0), cr = r0 + (rb() - .55) * 16, cx = CX + Math.cos(a) * cr, cz = CZ + Math.sin(a) * cr;
        for (let i = 0; i < n; i++) { const sz = .3 + 2.6 * Math.pow(rb(), 3), x = cx + (rb() - .5) * 7, z = cz + (rb() - .5) * 7; if (W.inSpire(x, 1, z, 2)) continue; put(x, W.h(x, z) + sz * (.05 + .2 * rb()), z, sz); }
      }
      for (let k = 0; k < 260; k++) {                                              // scattered on the banks and on the lake bed
        const a = rb() * Math.PI * 2, d = 60 + 520 * Math.sqrt(rb()), x = CX + Math.cos(a) * d, z = CZ + Math.sin(a) * d, sz = .4 + 2.2 * Math.pow(rb(), 2.5);
        if (W.inSpire(x, 1, z, 3)) continue; put(x, W.h(x, z) + sz * .12, z, sz);
      }
    };
  },
  update(F) {}
});

})(window.K=window.K||{},window.THREE);
//# sourceURL=src/20_terrain.js

(function(K,THREE){'use strict';
// ============================================================================
// 25_rock — the karst: every pillar of K.world.spires as bedded, jointed, stained limestone.
//   geometry : a cylinder grid per pillar following K.world.spireR + relief (beds, blocks, joints, chimneys,
//              real ledge shelves, undercuts, caves, carvings), soil caps, secondary towers, boulders, dripstone
//   material : baked tileable limestone set (albedo / normal+cavity+roughness), world triplanar at two scales,
//              a non-repeating stratigraphic column in world Y, streak stains, calcite, lichen, moss, damp
//   features : natural arch through needleW · colossus + niche wall + rock-cut stair grooves on Temple Peak ·
//              leaning needle with a chockstone at wallR · caves with dripstone · needleE is columnar basalt
//   exports  : K.rock = { R, topY, inside, ledges, flakes, caves, features, mat, tex, ... } (see the end of the file)
// ============================================================================
const W = K.world, { sat, lerp, smooth, clamp } = K, TAU = Math.PI * 2, DEG = Math.PI / 180;
const rock = K.rock = { ledges: [], flakes: [], caves: [], features: {}, tex: {} };
const wrapPi = t => { t = (t + Math.PI) % TAU; if (t < 0) t += TAU; return t - Math.PI; };
const ih = (a, b) => K.hash(a, b);

// ---------------------------------------------------------------- stratigraphic column (global, horizontal beds)
const SY0 = -40, SDY = 0.05, SN = 8192, SSPAN = SN * SDY, SM = SN * 2;
const bY0 = [], bY1 = [], bP = [], bTint = [], bVal = [], bKind = [], bL = [], bQ = [], bOff = [];
const bedIx = new Uint16Array(SM);
{
  const r = K.rng(90210), end = SY0 + SSPAN; let y = SY0;
  const push = (t, p, tint, val, kind) => {
    if (y + t > end - .3) t = end - y;
    bY0.push(y); y += t; bY1.push(y); bP.push(clamp(p, -1.1, 1)); bTint.push(sat(tint)); bVal.push(sat(val)); bKind.push(kind);
    bL.push(kind === 0 ? 4 + r() * 5 : kind === 1 ? 2.5 + t * (1 + r() * 2) : kind === 2 ? 2.5 + r() * 3 : 4);
    bQ.push([.35, .45, .25, .15][kind]); bOff.push(r() * 50);
  };
  while (y < end - 1e-6) {
    const mk = r(), mp = (r() - .5) * .8, mt = r(), mv = .4 + r() * .5, yEnd = Math.min(end, y + 6 + r() * 15);
    const kind = mk < .28 ? 0 : mk < .72 ? 1 : 2;                       // 0 massive cliff-former, 1 blocky, 2 thin-bedded
    while (y < yEnd - .2 && y < end - 1e-6) {
      if (kind === 0) push(3.5 + r() * 5.5, mp + .3 + r() * .3, mt + (r() - .5) * .2, mv + (r() - .5) * .2, 0);
      else if (kind === 1) push(.9 + r() * 2.2, mp + (r() - .5) * .55, mt + (r() - .5) * .35, mv + (r() - .5) * .3, 1);
      else push(.5 + r() * .8, mp - .15 + (r() - .5) * .3, mt + (r() - .5) * .4, mv + (r() - .5) * .35, 2);
    }
    if (y < end - 1e-6) push(.3 + r() * .45, mp - .55 - r() * .4, .3 * r(), .12 + .2 * r(), 3);   // recessive parting (shaly, damp, mossy)
  }
  let b = 0; for (let i = 0; i < SM; i++) { const yy = SY0 + (i + .5) * SDY * .5; while (b < bY1.length - 1 && yy >= bY1[b]) b++; bedIx[i] = b; }
}
const bedOf = y => { let i = Math.floor((y - SY0) * 40) % SM; if (i < 0) i += SM; return bedIx[i]; };

// ---------------------------------------------------------------- per-pillar parameters
const PP = [], HERO_CS = { temple: .66, gate: .7, wallL: .72, wallR: .72, needleE: .8, needleW: .8, shelf: 1.1, isle: .42 };
const CAM = { x: -58, z: 184 };
function mkP(s, o = {}) {
  const hero = s.i < 8 || !!o.hero, dCam = Math.hypot(s.x - CAM.x, s.z - CAM.z), r = K.rng(s.seed * 977 + 13);
  const P = { s, hero, dCam, Rref: s.r * .85, w: .012 * s.h, led: o.tower ? [] : W.spireLedges(s), joints: [], caves: [], fineTh: [], fineY: [], mods: [], rimW: 2.2, rimH: hero ? .7 : 2, y0: -8, lx: 0, lz: 0 };
  Object.assign(P, o);
  if (P.cs === undefined) P.cs = hero ? HERO_CS[s.name] : dCam < 600 ? 3.4 : dCam < 1200 ? 6 : dCam < 2000 ? 10 : 15;
  if (P.amp === undefined) P.amp = hero ? 1 : clamp(P.cs / 3, 1.15, 3);
  P.circ = TAU * P.Rref; P.arcK = Math.max(1, Math.round(P.circ * .18)) / .18 / TAU;   // arc coordinate that closes exactly on the streak textures
  // chimneys (wide, deep) and cracks (narrow) — vertical joints running through many beds
  const nCh = o.tower ? 0 : hero ? 6 + (r() * 4 | 0) : 3 + (r() * 3 | 0), nCr = Math.round(P.circ / ((hero ? 4.5 : 8) * P.amp));
  const keep = o.keepOut || [];
  for (let i = 0; i < nCh + nCr; i++) {
    const ch = i < nCh, span = (s.h - P.y0) * (ch ? .3 + r() * .5 : .1 + r() * .35), y0 = P.y0 + r() * (s.h - P.y0 - span * .8), a = (r() - .5) * P.circ, hw = (ch ? 1.0 + r() * 1.7 : .22 + r() * .4) * P.amp, depth = (ch ? 1.2 + r() * 1.6 : .3 + r() * .6) * P.amp;
    const deg = a / P.Rref / DEG; if (keep.some(k => deg > k[0] && deg < k[1] && (ch || k[2]))) continue;
    P.joints.push({ a, hw, depth, y0, y1: y0 + span, ch });
  }
  PP[s.i] = P; return P;
}
function bucketJoints(P) {
  const NB = 96; P.jb = Array.from({ length: NB }, () => []);
  for (const j of P.joints) { const t0 = (j.a - j.hw) / P.Rref, t1 = (j.a + j.hw) / P.Rref; for (let b = Math.floor((t0 + Math.PI) / TAU * NB); b <= Math.floor((t1 + Math.PI) / TAU * NB); b++) { const l = P.jb[((b % NB) + NB) % NB]; if (!l.includes(j)) l.push(j); } }
}
const vor2 = (x, z, o) => {   // jittered-grid Voronoi: o.id cell hash, o.d1, o.d2
  const xi = Math.floor(x), zi = Math.floor(z); let d1 = 9, d2 = 9, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const px = xi + i + ih(xi + i, zi + j), pz = zi + j + ih(xi + i + 57, zi + j + 113), d = Math.hypot(px - x, pz - z); if (d < d1) { d2 = d1; d1 = d; id = ih(xi + i + 7, zi + j + 3); } else if (d < d2) d2 = d; }
  o.id = id; o.d1 = d1; o.d2 = d2; return o;
};
const _v = {};

// Temple Peak: halls, galleries and the cliff stair are pinned to the south and east faces using spireR, so there the
// relief is held within about a metre of it (returns the allowed [lo, hi] offsets from spireR, or null outside)
const _zn = [0, 0];
function templeZone(y, th) {
  if (y < 52 || th < -58 * DEG || th > 150 * DEG) return null;
  const k = smooth(52, 57, y) * smooth(-58 * DEG, -48 * DEG, th) * (1 - smooth(140 * DEG, 150 * DEG, th)); if (k <= 0) return null;
  const mid = smooth(53.5, 55, y) * (1 - smooth(60.5, 62, y)) * smooth(44 * DEG, 50 * DEG, th) * (1 - smooth(118 * DEG, 124 * DEG, th));   // the mid-terrace platform
  _zn[0] = lerp(-4, -1, k); _zn[1] = lerp(lerp(4, .85, k), -.06, mid); return _zn;
}

// ---------------------------------------------------------------- THE displaced shape
// masks written by R() for the vertex being evaluated: macro occlusion, stain, moss, calcite
let gAO = 1, gSt = 0, gMo = 0, gCa = 0, gShelf = 1, gTal = 0;
function R(s, y, th) {
  if (y > s.h) return 0;
  const P = PP[s.i]; th = wrapPi(th);
  const amp = P.amp, arc = th * P.Rref;
  // --- ledges become real shelves: the smooth step of spireR is squeezed into a horizontal tread at the ledge height
  //     (only along ~2/3 of the perimeter — elsewhere the step stays a steep ramp, so the tiers are not perfect rings)
  const led = P.led, a = 2 * P.w; let yq = y, below = 1e9, above = 1e9, kb = -1; gShelf = 1;
  for (let k = 0; k < led.length; k++) {
    const d = y - led[k]; if (d < -40 || d > a) continue;
    const sh = smooth(.28, .46, K.noise2(arc * .045 + k * 5.3, s.seed + k * 1.7)), w = P.w * sh;
    if (d < 0) { if (-d < below) { below = -d; kb = k; gShelf = sh; } if (-d < a) yq = led[k] - a + (d + a) * (a - w) / a; }
    else { if (d < above) { above = d; gShelf = sh; } yq = led[k] + w + d * (a - w) / a; }
  }
  const r0 = P.base ? P.base(yq, th) : W.spireR(s, Math.max(0, yq), th);
  let d = 0; gAO = 1; gSt = 0; gMo = 0; gCa = 0; gTal = P.tower ? 0 : 1 - smooth(.085, .15, y / s.h);
  if (P.columnar) {
    // --- columnar jointing: polygonal columns, each proud or recessed, broken by cross joints; chaotic entablature bands
    const ck = arc / P.cw, k = Math.floor(ck), f = ck - k, hk = ih(k + 911, s.seed), hk2 = ih(k + 77, s.seed + 5);
    const ent = smooth(.62, .75, K.noise2(y * .045 + 3.1, s.seed));
    let dc = (hk - .5) * 1.25;
    const seg = Math.floor((y + hk2 * 40) / (2.2 + 3 * hk)), hs = ih(seg + k * 31, 7); dc += (hs - .5) * .3;
    if (hs < .09) { dc -= 1.1; gAO *= .6; }
    const e = Math.abs(f - .5) * 2; dc -= .2 * e * e + .6 * smooth(.84, 1, e);
    gAO *= 1 - .6 * smooth(.78, 1, e) * (1 - ent); gSt += .35 * smooth(.8, 1, e);
    d += lerp(dc, (K.noise2(arc * .5, y * .5) - .5) * 1.6 + (ih(Math.floor(arc / 1.3), Math.floor(y / 1.1)) - .5) * .7, ent);
    d += .8 * (K.noise2(arc * .11 + s.seed, y * .02) - .5);
    const yt = s.h * (.8 + .17 * ih(k + 5, s.seed + 9)); if (y > yt) { d -= 1.5 + .6 * hk2; gMo += .4; }   // organ-pipe tops: every column ends at its own height
  } else {
    // --- bedding (each bed swells and thins along its length)
    const bi = bedOf(y), kind = bKind[bi];
    d += bP[bi] * [.78, .46, .3, .9][kind] * amp * (.35 + 1.3 * K.noise2(arc * .07 + bi * 3.7, s.seed + bi * .37));
    if (kind === 3) { gMo += .7; gAO *= .72; } else if (bP[bi] < -.35) gAO *= .88;
    // --- blocky fracturing inside the bed
    const L = bL[bi] * amp, kk = Math.floor(arc / L + bOff[bi] + .3 * K.noise2(y * .23, arc * .06 + bi)), hb = ih(bi * 131 + s.seed * 17, kk);
    d += (hb - .5) * bQ[bi] * amp;
    if (hb < .07 && kind !== 3) { d -= .5 * amp; gAO *= .7; gMo += .3; }             // a block has fallen out
    // --- buttresses and exfoliation scarps: smooth lobes snapped to angular steps
    let rb = (2.1 * (K.noise2(arc * .13 + s.seed, y * .022) - .5) + .7 * (K.noise2(arc * .45, y * .09 + s.seed) - .5)) * amp;
    const q = .45 * amp; rb = lerp(rb, Math.round(rb / q) * q, .75); d += rb;
    // --- big bites: slabs that have peeled away, leaving square-cut alcoves with a roof
    const ba = arc / (9 * amp) + .37 * Math.floor(y / (6.5 * amp)), by = y / (6.5 * amp), hq = ih(Math.floor(ba) + s.seed * 53, Math.floor(by) + 7);
    if (hq < .17 && !P.tower) { const fa = ba - Math.floor(ba), fy = by - Math.floor(by), m = smooth(0, .06, fa) * (1 - smooth(.82 - .3 * hq, .88 - .3 * hq, fa)) * smooth(0, .05, fy) * (1 - smooth(.7, .76, fy)); d -= (.7 + 3 * hq) * amp * m; gAO *= 1 - .3 * m; gSt += .25 * m; }
  }
  // --- vertical joints and chimneys
  const jb = P.jb[Math.min(95, Math.floor((th + Math.PI) / TAU * 96))];
  for (let i = 0; i < jb.length; i++) {
    const j = jb[i]; if (y < j.y0 || y > j.y1) continue;
    let da = Math.abs(arc - j.a); if (da > P.circ * .5) da = P.circ - da;
    const t = da / j.hw; if (t >= 1) continue;
    const f = (t < .55 ? 1 : 1 - (t - .55) / .45) * smooth(j.y0, j.y0 + 3, y) * (1 - smooth(j.y1 - 3, j.y1, y));
    d -= j.depth * f; gAO *= 1 - (j.ch ? .62 : .5) * f; gSt += (j.ch ? .7 : .45) * f; gMo += .45 * f;
  }
  // --- under the ledges: broken lip, undercut, water stains running down
  if (below < 40) {
    if (below < 2.2 && gShelf > .5) {                                           // broken edge: blocks missing from the lip
      const bk = Math.floor(arc / (1.6 * amp) + kb * 7.3), h1 = ih(bk + s.seed * 31, kb + 5), h2 = ih(bk, kb + 11 + s.seed);
      if (h1 < .45 && below < .5 + 1.7 * h2) { const rUp = W.spireR(s, led[kb] + P.w, th); d -= Math.max(0, r0 - rUp) * (.25 + .6 * h2); gMo += .5; }
    }
    const uc = smooth(.9, 1.7, below) * (1 - smooth(2.6, 6.5, below)) * gShelf;
    d -= .6 * amp * uc; gAO *= 1 - .3 * uc;
    gSt += 1.1 * Math.exp(-below / 9) * smooth(.3, .75, K.noise2(arc * .16 + kb * 9.1, s.seed));
  }
  if (above < 1.4) gMo += .8 * (1 - above / 1.4);
  // --- caves and alcoves (arched mouth, flat floor)
  for (let i = 0; i < P.caves.length; i++) {
    const c = P.caves[i]; let da = arc - c.a; if (da > P.circ * .5) da -= P.circ; else if (da < -P.circ * .5) da += P.circ;
    const u = da / c.rw, v = (y - c.y) / c.rh;
    if (Math.abs(u) < 1.3 && v > -1 - 9 / c.rh && v < 1.3) {
      const top = 1 - .55 * u * u, e = v > 0 ? Math.max(Math.abs(u), v / Math.max(.2, top)) : Math.max(Math.abs(u), -v * 1.6);
      const f = 1 - smooth(.7, 1, e);
      if (f > 0) { d = lerp(d, Math.min(d, 0) * .4 - c.depth * (.8 + .2 * K.noise2(arc * .9, y * .9)), f); gAO *= 1 - .9 * f; }
      gMo += .35 * smooth(1.3, .95, e) * (1 - f);
      if (v < -.6 && Math.abs(u) < .95) { const dn = (-v - .6) * c.rh; gSt += .8 * Math.exp(-dn / 4); gCa += .95 * Math.exp(-dn / 3.5) * (1 - Math.abs(u)) * smooth(.3, .6, K.noise2(arc * 1.1, c.y)); }
    }
  }
  d += (K.noise2(arc * 1.9, y * 1.7) - .5) * .14;
  // --- special features of this pillar (carvings, steps, benches …)
  for (let i = 0; i < P.mods.length; i++) d = P.mods[i](y, th, arc, r0, d);
  if (P.zone) { const z = P.zone(y, th); if (z) { const rt = W.spireR(s, Math.max(0, y), th); return clamp(r0 + d, rt + z[0], rt + z[1]); } }
  return Math.max(.3, r0 + d);
}
rock.R = (s, y, th) => R(s, y, th);
// is a point inside rock (pillars with relief, secondary towers)? returns the pillar/tower or null
rock.inside = (x, y, z, pad = 0) => {
  for (const P of PP) { const s = P.s; if (y > s.h || y < P.y0 - 30) continue; const dx = x - s.x - P.lx * (y - s.h), dz = z - s.z - P.lz * (y - s.h), d2 = dx * dx + dz * dz, Rm = s.r * 1.9 + pad + 3; if (d2 > Rm * Rm) continue; if (d2 < Math.pow(R(s, y, Math.atan2(dz, dx)) + pad, 2)) return s; }
  return null;
};

// top surface (soil cap, rock rim) ------------------------------------------------------------
function Rtop(P, th) {
  if (!P.rt) { const n = 720; P.rt = new Float32Array(n + 1); for (let i = 0; i <= n; i++) P.rt[i] = R(P.s, P.s.h - .001, -Math.PI + TAU * i / n); }
  const f = (wrapPi(th) + Math.PI) / TAU * 720, i = Math.floor(f); return lerp(P.rt[i], P.rt[Math.min(720, i + 1)], f - i);
}
let gSoil = 0;
function topY(s, x, z) {
  const P = PP[s.i], dx = x - s.x, dz = z - s.z, rho = Math.hypot(dx, dz), th = Math.atan2(dz, dx), d = Rtop(P, th) - rho;
  gSoil = 0; if (d <= 0) return s.h;
  if (P.siteR && rho < P.siteR) { gSoil = 1; return s.h - .04; }
  if (P.columnar) { vor2(x * .62, z * .62, _v); gSoil = smooth(1.5, 3, d) * smooth(.45, .65, K.noise2(x * .3, z * .3)); return s.h + smooth(0, .15, d) * (.1 + 1.5 * _v.id * _v.id * (1 - smooth(1, 3.5, d))) - .25 * smooth(.12, .0, _v.d2 - _v.d1); }
  const arc = th * P.Rref, rw = Math.min(P.rimW * (.5 + 1.5 * K.noise2(arc * .17, s.seed + 3)), s.topR * .45), rag = rw + 1.4 * (K.noise2(arc * .5, s.seed + 9) - .3) + .7 * (K.noise2(x * 1.1, z * 1.1) - .5);
  const hb = ih(Math.floor(arc / .9) + s.seed * 3, Math.floor(d / .7)), rim = smooth(0, .2, d) * (1 - smooth(rag * .55, rag, d));
  const pav = smooth(.6, .7, K.noise2(x * .16 + s.seed, z * .16) * .7 + K.noise2(x * .6, z * .6) * .3);
  gSoil = smooth(rag - .25, rag + .15, d) * (1 - pav);
  const ks = P.siteR ? smooth(P.siteR, P.siteR + .8, rho) : 1;
  return s.h - .04 * (1 - ks) + ks * (rim * (.08 + P.rimH * hb * hb) + gSoil * (.16 + .1 * K.noise2(x * .5, z * .5)) + pav * .12 * ih(Math.floor(x / .8), Math.floor(z / .8)));
}
rock.topY = (s, x, z) => topY(s, x, z);

// ---------------------------------------------------------------- geometry
const mkGeo = (pos, nrm, msk, mc, idx) => {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('aM', new THREE.BufferAttribute(msk, 4)); g.setAttribute('aC', new THREE.BufferAttribute(mc, 2)); g.setIndex(new THREE.BufferAttribute(idx, 1)); return g;
};
function buildPillar(s) {
  const P = PP[s.i], hero = P.hero, e = hero ? .02 : .05 * P.amp, cs = P.cs;
  // ---- columns (azimuths): uniform + snapped to the walls of chimneys/cracks + refined windows
  let ths = []; const NA0 = Math.max(P.tower ? 14 : 20, Math.round(P.circ / cs));
  for (let i = 0; i < NA0; i++) ths.push(-Math.PI + TAU * i / NA0);
  if (hero) {
    for (const j of P.joints) for (const f of [-1, -.55, .55, 1]) ths.push(wrapPi((j.a + f * j.hw) / P.Rref));
    for (const f of P.fineTh) for (let t = f[0]; t < f[1]; t += f[2] / P.Rref) ths.push(wrapPi(t));
    if (P.columnar) { const n = Math.round(P.circ / P.cw); for (let k = 0; k < n; k++) for (const f of [-.08, .08, .5]) ths.push(wrapPi((k + f) * P.cw / P.Rref)); }
  }
  ths.sort((a, b) => a - b); { const mg = (hero ? .06 : .3) / P.Rref, o = [ths[0]]; for (let i = 1; i < ths.length; i++) if (ths[i] - o[o.length - 1] > mg) o.push(ths[i]); ths = o; }
  const NA = ths.length, NC = NA + 1;
  // ---- rows: strips between bed boundaries / ledges, split so every step is a crisp tread
  const yLo = P.tower ? P.y0 : -1.2, gy = P.tower ? P.y0 : Math.min(-3, W.h(s.x, s.z) - 3), ys = [], rf = [];
  if (!P.tower) for (const y of [gy, gy * .6, gy * .3]) if (y < -1.5) { ys.push(y); rf.push(0); }
  let B = [];
  if (!P.columnar) for (let b = 0; b < bY1.length; b++) { const y1 = bY1[b]; if (y1 > yLo + .2 && y1 < s.h - .25 && (hero ? bY1[b] - bY0[b] > (P.tower || cs > .75 ? .8 : .55) || bKind[b] === 3 : bY1[b] - bY0[b] >= cs * 1.1)) B.push([y1, 0]); }
  for (const yl of P.led) B.push([yl, 1]);
  B.sort((a, b) => a[0] - b[0]); { const o = []; for (const b of B) { const l = o[o.length - 1]; if (l && b[0] - l[0] < Math.max(.14, cs * (hero ? .2 : .5))) { if (b[1]) o[o.length - 1] = b; } else o.push(b); } B = o; }
  const bnd = [yLo, ...B.map(b => b[0]), s.h];
  for (let k = 0; k < bnd.length - 1; k++) {
    const a = bnd[k] + (k ? e : 0), b = k === bnd.length - 2 ? s.h - .001 : bnd[k + 1] - e; let step = cs;
    for (const f of P.fineY) if (b > f[0] && a < f[1]) step = Math.min(step, f[2]);
    const n = Math.max(1, Math.ceil((b - a) / step));
    for (let i = 0; i <= n; i++) { ys.push(a + (b - a) * i / n); rf.push(i === 0 ? 1 : i === n ? 2 : 0); }
  }
  const NR = ys.length, nv = NR * NC, capRings = P.tower ? [.7, .35] : hero ? [.992, .975, .955, .93, .9, .86, .81, .75, .68, .6, .5, .4, .3, .2, .1] : [.9, .6, .25], nk = capRings.length;
  const nvAll = nv + NC * (nk + 1) + 1, pos = new Float32Array(nvAll * 3), nrm = new Float32Array(nvAll * 3), msk = new Float32Array(nvAll * 4), mc = new Float32Array(nvAll * 2), rad = new Float32Array(nv);
  const cs_ = new Float32Array(NA), sn_ = new Float32Array(NA); for (let i = 0; i < NA; i++) { cs_[i] = Math.cos(ths[i]); sn_[i] = Math.sin(ths[i]); }
  for (let j = 0; j < NR; j++) {
    const y = ys[j], ax = s.x + P.lx * (y - s.h), az = s.z + P.lz * (y - s.h);
    for (let i = 0; i < NA; i++) {
      const r = R(s, y, ths[i]), v = j * NC + i; rad[v] = r;
      pos[v * 3] = ax + cs_[i] * r; pos[v * 3 + 1] = y; pos[v * 3 + 2] = az + sn_[i] * r;
      msk[v * 4] = gAO; msk[v * 4 + 1] = Math.min(1.5, gSt); msk[v * 4 + 2] = Math.min(1.5, gMo); msk[v * 4 + 3] = ths[i] * P.arcK; mc[v * 2] = Math.min(1, gCa); mc[v * 2 + 1] = -gTal;
    }
    const v = j * NC + NA, v0 = j * NC; rad[v] = rad[v0];
    pos[v * 3] = pos[v0 * 3]; pos[v * 3 + 1] = y; pos[v * 3 + 2] = pos[v0 * 3 + 2];
    msk[v * 4] = msk[v0 * 4]; msk[v * 4 + 1] = msk[v0 * 4 + 1]; msk[v * 4 + 2] = msk[v0 * 4 + 2]; msk[v * 4 + 3] = (ths[0] + TAU) * P.arcK; mc[v * 2] = mc[v0 * 2]; mc[v * 2 + 1] = mc[v0 * 2 + 1];
  }
  // ---- normals (one-sided at strip ends so walls stay crisp) + concavity darkening
  for (let j = 0; j < NR; j++) {
    const ja = rf[j] === 1 ? j : Math.max(0, j - 1), jb = rf[j] === 2 ? j : Math.min(NR - 1, j + 1), j3a = Math.max(0, j - 3), j3b = Math.min(NR - 1, j + 3);
    for (let i = 0; i < NC; i++) {
      const il = (i === 0 ? NA - 1 : i - 1), ir = (i >= NA - 1 ? i + 1 - NA : i + 1), v = j * NC + i;
      const A = (ja * NC + i) * 3, Bq = (jb * NC + i) * 3, Lq = (j * NC + il) * 3, Rq = (j * NC + ir) * 3;
      const ux = pos[Bq] - pos[A], uy = pos[Bq + 1] - pos[A + 1], uz = pos[Bq + 2] - pos[A + 2], vx = pos[Rq] - pos[Lq], vy = pos[Rq + 1] - pos[Lq + 1], vz = pos[Rq + 2] - pos[Lq + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1;
      nrm[v * 3] = nx / l; nrm[v * 3 + 1] = ny / l; nrm[v * 3 + 2] = nz / l;
      if (hero) {
        const i3l = ((i % NA) - 3 + NA) % NA, i3r = ((i % NA) + 3) % NA, av = (rad[j * NC + i3l] + rad[j * NC + i3r] + rad[j3a * NC + i] + rad[j3b * NC + i]) * .25;
        msk[v * 4] *= 1 - .5 * sat((av - rad[v]) * .7);
      }
    }
  }
  // ---- soil / rock cap
  let o = nv;
  for (let k = 0; k <= nk; k++) for (let i = 0; i < NC; i++) {
    const ii = i % NA, rt = rad[(NR - 1) * NC + ii], f = k === 0 ? 1 : capRings[k - 1], x = s.x + cs_[ii] * rt * f, z = s.z + sn_[ii] * rt * f;
    const y = k === 0 ? s.h : topY(s, x, z);
    pos[o * 3] = x; pos[o * 3 + 1] = y; pos[o * 3 + 2] = z; msk[o * 4] = 1; msk[o * 4 + 2] = k === 0 ? 0 : .3; msk[o * 4 + 3] = msk[((NR - 1) * NC + i) * 4 + 3]; mc[o * 2 + 1] = k === 0 ? 0 : gSoil; o++;
  }
  pos[o * 3] = s.x; pos[o * 3 + 1] = topY(s, s.x + .01, s.z); pos[o * 3 + 2] = s.z; msk[o * 4] = 1; msk[o * 4 + 2] = .3; mc[o * 2 + 1] = gSoil; const ctr = o;
  // ---- indices
  const idx = new Uint32Array((NR - 1) * NA * 6 + nk * NA * 6 + NA * 3); let q = 0;
  for (let j = 0; j < NR - 1; j++) for (let i = 0; i < NA; i++) { const a = j * NC + i, b = a + NC; idx[q++] = a; idx[q++] = b; idx[q++] = a + 1; idx[q++] = a + 1; idx[q++] = b; idx[q++] = b + 1; }
  for (let k = 0; k < nk; k++) for (let i = 0; i < NA; i++) { const a = nv + k * NC + i, b = a + NC; idx[q++] = a; idx[q++] = b; idx[q++] = a + 1; idx[q++] = a + 1; idx[q++] = b; idx[q++] = b + 1; }
  for (let i = 0; i < NA; i++) { const a = nv + nk * NC + i; idx[q++] = a; idx[q++] = ctr; idx[q++] = a + 1; }
  const g = mkGeo(pos, nrm, msk, mc, idx);
  // cap normals: recompute for the cap only (walls keep the crisp normals)
  { const cp = new THREE.BufferGeometry(); cp.setAttribute('position', g.attributes.position); cp.setIndex(new THREE.BufferAttribute(idx.subarray((NR - 1) * NA * 6), 1)); cp.computeVertexNormals(); const n2 = cp.attributes.normal.array; for (let v = nv; v < nvAll; v++) { nrm[v * 3] = n2[v * 3]; nrm[v * 3 + 1] = n2[v * 3 + 1]; nrm[v * 3 + 2] = n2[v * 3 + 2]; } }
  return g;
}

// ---------------------------------------------------------------- secondary towers, flakes, the leaning needle
// a slim satellite pillar standing against (or beside) a parent pillar; its own body, same beds, same material
function addTower(par, o) {
  const th = o.deg * DEG, H = o.h, y0 = o.y0 === undefined ? -8 : o.y0, r = o.r, seed = o.seed || (par.seed * 31 + Math.round(o.deg));
  const Rp = yy => W.spireR(par, Math.max(0, yy), th), yM = y0 + (H - y0) * .55;
  const D = o.D !== undefined ? o.D : Rp(yM) + r * (o.out === undefined ? .2 : o.out);
  const lean = o.lean !== undefined ? o.lean : clamp((Rp(y0 + (H - y0) * .8) - Rp(Math.max(0, y0) + (H - y0) * .25)) / ((H - y0) * .55) * .7, -.16, .04);   // radial drift per metre of height (negative = toward the parent)
  const Dtop = D + lean * (H - yM), c = Math.cos(th), sn = Math.sin(th);
  const s = { name: o.name || (par.name + '_t' + Math.round(o.deg)), x: par.x + c * Dtop, z: par.z + sn * Dtop, r, h: H, topR: r * .3, seed, i: PP.length, tower: true, parent: par };
  const sd = seed * 3.77, fl = o.flat || 1;
  const P = mkP(s, { tower: true, hero: !o.lod, cs: o.cs || .9, amp: o.amp || .55, y0, lx: c * lean, lz: sn * lean, rimW: .5, rimH: .6,
    base: (y, t) => {
      const u = sat((y - y0) / (H - y0)), cc = Math.cos(t), ss = Math.sin(t);
      let p = r * (1 - .28 * u) * (1 - .62 * smooth(.8, 1, u));
      for (let k = 0; k < 3; k++) { const uk = .3 + .22 * k + .1 * (ih(seed + k, 5) - .5); p -= r * .13 * smooth(uk - .008, uk + .008, u) * (.3 + 1.4 * K.noise2(cc * 1.3 + k * 2.1 + sd, ss * 1.3)); }
      let m = 1 + .5 * (K.noise3(cc * 1.2 + sd, ss * 1.2 - sd, u * 2.4 + sd) - .5) + .26 * (K.noise3(cc * 3.1 - sd, ss * 3.1, u * 6) - .5);
      if (fl !== 1) { const q = Math.cos(t - th); m *= fl + (1 - fl) * (1 - q * q) * 1.6; }       // flakes: a slab lying against the wall
      return Math.max(.4, p * m);
    } });
  rock.flakes.push({ name: s.name, parent: par.name, x: s.x, z: s.z, baseX: s.x + c * lean * (y0 - H), baseZ: s.z + sn * lean * (y0 - H), y0, h: H, r, lean, s });
  return s;
}

// ---------------------------------------------------------------- special features
const bump = (U, V, cu, cv, hu, hv, h, n = 2.4, e = .45) => { const q = Math.pow(Math.abs(U - cu) / hu, n) + Math.pow(Math.abs(V - cv) / hv, n); return q < 1 ? h * Math.pow(1 - q, e) : 0; };
// Temple Peak, SW face left of the waterfall cleft: a colossal seated figure (18.6 m) in an arched niche, worn almost
// smooth, feet on the 55.8 m ledge, the 74.8 m ledge as its canopy
function colossus(P) {
  const SC = .72, thC = 166 * DEG, yB = 55.95, Rl = W.spireR(P.s, yB + 9, thC), HW = 6.5, HT = 25.8;   // figure space is 13 x 25.8, built at SC
  const sm = (a, b) => { const k = .55, q = Math.max(k - Math.abs(a - b), 0); return Math.max(a, b) + q * q / (4 * k); };
  const seg = (U, V, u0, v0, u1, v1, rad, h) => { const du = u1 - u0, dv = v1 - v0, t = sat(((U - u0) * du + (V - v0) * dv) / (du * du + dv * dv)), d = Math.hypot(U - u0 - du * t, V - v0 - dv * t) / rad; return d < 1 ? h * Math.sqrt(1 - d * d) : 0; };
  const fig = (U, V) => {
    const a = Math.abs(U); let h = 0;
    h = sm(h, bump(U, V, 0, .8, 5.6, 1.0, 2.2 + .22 * Math.abs(Math.sin(U * 1.9)) * smooth(.6, 1.6, V), 6, .3));   // lotus plinth
    h = sm(h, bump(a, V, 1.5, 2.1, 1.05, .75, 2.9, 2.6, .5));                                  // feet
    h = sm(h, bump(a, V, 1.7, 5.6, 1.45 + .05 * (V - 5.5), 4.2, 2.5 + .07 * Math.sin(a * 6 + V * .6), 3, .45));   // shins under the robe
    h = sm(h, bump(a, V, 2.3, 9.7, 2.0, 1.5, 3.0, 2.2, .5));                                   // knees
    h = sm(h, bump(U, V, 0, 9.9, 3.2, 1.2, 2.6, 3, .45));                                      // lap
    h = sm(h, bump(a, V, 2.9, 10.9, .95, .55, 2.85, 2.2, .5));                                 // hands on the knees
    h = sm(h, seg(a, V, 4.1, 12.7, 3.0, 11.1, .85, 2.35));                                     // forearms
    h = sm(h, bump(a, V, 4.15, 14.9, .95, 2.8, 1.95, 2.4, .5));                                // upper arms
    h = sm(h, bump(U, V, 0, 14.3, 3.2 + .16 * (V - 11), 4.3, 2.2 + .08 * Math.sin(2.3 * (V + .22 * U * U)), 3.5, .42));   // torso, robe folds
    h = sm(h, bump(U, V, 0, 16.1, 2.9, 1.7, 2.35, 2.2, .5));                                   // chest
    h = sm(h, bump(a, V, 3.5, 17.3, 1.5, 1.0, 2.05, 2.2, .5));                                 // shoulders
    h = sm(h, bump(U, V, 0, 18.7, 1.05, 1.1, 1.9, 2.4, .5));                                   // neck
    h = sm(h, bump(U, V, 0, 20.9, 1.95, 2.45, 2.7 + .1 * smooth(21.9, 22.2, V), 2.1, .5));     // head, hair line
    h = sm(h, bump(a, V, 2.1, 20.3, .36, 1.5, 1.75, 2.4, .5));                                 // long ears
    h = sm(h, bump(U, V, 0, 23.5, 1.1, .9, 2.25, 2.1, .5));                                    // topknot
    if (V > 19 && V < 23 && a < 2) {                                                           // the worn face: nose, brow, eye hollows, mouth
      h += .32 * Math.exp(-Math.pow(U / .25, 2) - Math.pow((V - 20.7) / .68, 2)) + .15 * Math.exp(-Math.pow((V - 21.55) / .2, 2)) * (1 - smooth(1.1, 1.6, a));
      h -= .24 * Math.exp(-Math.pow((a - .78) / .4, 2) - Math.pow((V - 21.18) / .2, 2)) + .14 * Math.exp(-Math.pow(U / .65, 2) - Math.pow((V - 19.78) / .12, 2));
    }
    const hr = Math.hypot(U, V - 21); h = Math.max(h, .36 * Math.exp(-Math.pow((hr - 3.9) / .28, 2)) + .2 * Math.exp(-Math.pow((hr - 4.9) / .2, 2)) * Math.pow(Math.abs(Math.sin(Math.atan2(V - 21, U) * 9)), 3));   // halo with flame points
    return h;
  };
  P.mods.push((y, th, arc, r0, d) => {
    const U = wrapPi(th - thC) * Rl / SC, V = (y - yB) / SC, a = Math.abs(U); if (a > HW + 1 || V < -.5 || V > HT + 1) return d;
    const top = HT - 5.5 * Math.pow(a / HW, 2.2), m = (1 - smooth(HW - .45, HW + .3, a)) * smooth(-.25, .2, V) * (1 - smooth(top - .3, top + .45, V));
    if (m <= 0) return d;
    const h = fig(U, V) * (.9 + .2 * K.noise2(U * .7, V * .7)) * SC, dn = -2.9 * SC + h + clamp(d, -.6, .5) * .25;
    gAO *= lerp(1, .5 + .5 * sat(h / 1.5), m); gMo += .3 * m; gSt += .6 * m * smooth(.4, .7, K.noise2(arc * .35, 3.3)) * smooth(2, 12, V);
    return lerp(d, Math.min(dn, .2), m);
  });
  P.fineTh.push([thC - (HW + .8) * SC / Rl, thC + (HW + .8) * SC / Rl, .2]); P.fineY.push([yB - .3, yB + (HT + .6) * SC, .2]);
  rock.features.colossus = { pillar: 'temple', azDeg: 166, yBase: yB, yTop: yB + HT * SC, halfWidth: HW * SC, depth: 2.9 * SC, x: Math.cos(thC) * Rl, z: Math.sin(thC) * Rl };
}
// a honeycomb of small arched niches, each with a worn seated figure, cut into a dressed wall (wallR, the face toward Gate Rock)
function nicheWall(P, d0, d1, y0, rows) {
  const t0 = d0 * DEG, t1 = d1 * DEG, pitchY = 4.15, pitchU = 2.45, Rl = W.spireR(P.s, y0 + 8, (t0 + t1) / 2), top = y0 + rows * pitchY;
  P.mods.push((y, th, arc, r0, d) => {
    let t = th; if (t < t0 - 1) t += TAU;
    if (t < t0 - .03 || t > t1 + .03 || y < y0 - .5 || y > top) return d;
    const wall = smooth(t0 - .03, t0 + .01, t) * (1 - smooth(t1 - .01, t1 + .03, t)) * smooth(y0 - .5, y0, y) * (1 - smooth(top - .6, top, y));
    d = lerp(d, clamp(d, -.3, .25), wall);                                           // the wall was dressed flat before the niches were cut
    const k = Math.floor((y - y0) / pitchY), V = y - y0 - k * pitchY, uc = (t - t0) * Rl / pitchU + (k & 1 ? .5 : 0), j = Math.floor(uc), fu = (uc - j - .5) * pitchU;
    if (k < 0 || k >= rows || j < 0 || (j + 1) * pitchU > (t1 - t0) * Rl + .6 || ih(j * 7 + 3, k) < .1) return d;
    const a = Math.abs(fu) / .86, v = (V - .6) / 2.75, tp = 1 - .38 * Math.pow(a, 2.2);
    const m = (1 - smooth(.82, 1, a)) * smooth(0, .07, v) * (1 - smooth(tp - .13, tp, v)) * wall; if (m <= 0) return d;
    const fb = bump(fu, V, 0, 1.75, .5, 1.0, .8, 2.4, .5) + bump(fu, V, 0, 2.95, .3, .36, .75, 2, .5);
    gAO *= lerp(1, .42 + .58 * sat(fb / .7), m); gMo += .25 * m;
    return lerp(d, -1.2 + fb, m);
  });
  P.fineTh.push([t0 - .03, t1 + .03, .27]); P.fineY.push([y0 - .5, top, .27]);
  rock.features.niches = { pillar: P.s.name, azDeg: [d0, d1], y: [y0, top], rows, nicheW: 1.7, nicheH: 2.75, depth: 1.2 };
}
// Temple Peak: grooves for the cliff stair. Stone legs get a half-tunnel cut 0.9 m into the face; along the timber
// legs the rock is only kept from bulging. Leg list mirrors 30_arch.js cliffStair() — keep the two in sync.
function stairCuts(P) {
  const legs = rock.features.stairLegs = [[72, 58.2, 18, 76, 1], [18, 76, 70, 95, 0], [70, 95, 25, 113, 1], [25, 113, 75, 128, 0], [75, 128, 100, 142.2, 1]];   // [az0°, y0, az1°, y1, stone?]
  P.mods.push((y, th, arc, r0, d) => {
    if (y < 54 || th < .25 || th > 1.8) return d;
    for (const L of legs) {
      const u = (th - L[0] * DEG) / ((L[2] - L[0]) * DEG); if (u < -.04 || u > 1.04) continue;
      const dy = y - lerp(L[1], L[3], sat(u)); if (dy < -3 || dy > 3.2) continue;
      const e = smooth(-.04, 0, u) * (1 - smooth(1, 1.04, u));
      if (L[4]) { const cut = smooth(-.6, -.15, dy) * (1 - smooth(2.1, 2.9, dy)) * e; d = lerp(d, Math.min(d, .35), e * smooth(-3, -2, dy)); d = lerp(d, Math.min(d, .1) - .9, cut); gAO *= 1 - .45 * cut * smooth(2.6, 1.2, dy); }
      else d = lerp(d, Math.min(d, .25), e * smooth(-3, -2.2, dy) * (1 - smooth(2.4, 3.2, dy)));
    }
    return d;
  });
}
// natural arch ("the Sky Window") pierced through needleW: fragments inside the tunnel volume are discarded, a tube lines the hole
const ARCH = { y: 131, A: 4.4, Bt: 9.2, Bb: 6.6, L: 17 };
const archF = (u, v, t) => { const k = 1 + .0013 * t * t, A = ARCH.A * (1 + .1 * Math.sin(v * .5 + 1)) * k, B = (v > 0 ? ARCH.Bt : ARCH.Bb) * k; return Math.pow(Math.abs(u) / A, 2) + Math.pow(Math.abs(v) / B, v > 0 ? 1.7 : 2.4); };
const GL_ARCH = /* glsl */`uniform vec4 uA0, uA1, uA2;
  bool archIn(vec3 p){ vec3 ax = uA1.xyz, q = p - uA0.xyz; float t = dot(q, ax); if(abs(t) > uA2.y) return false;
    vec3 rt = normalize(cross(ax, vec3(0.,1.,0.))), upv = cross(rt, ax); vec3 r = q - ax*t; float u = dot(r, rt), v = dot(r, upv);
    float k = 1. + .0013*t*t, A = uA0.w*(1. + .1*sin(v*.5 + 1.))*k, B = (v > 0. ? uA1.w : uA2.x)*k;
    return pow(abs(u)/A, 2.) + pow(abs(v)/B, v > 0. ? 1.7 : 2.4) < 1.; }`;
function buildArch(s) {
  const V3 = THREE.Vector3, C = new V3(s.x + .6, ARCH.y, s.z), ax = new V3(.105, .13, -1).normalize(), rt = new V3().crossVectors(ax, new V3(0, 1, 0)).normalize(), up = new V3().crossVectors(rt, ax);
  ARCH.uni = { uA0: { value: new THREE.Vector4(C.x, C.y, C.z, ARCH.A) }, uA1: { value: new THREE.Vector4(ax.x, ax.y, ax.z, ARCH.Bt) }, uA2: { value: new THREE.Vector4(ARCH.Bb, ARCH.L, 0, 0) } };
  const NP = 56, NT = 18, p = new V3(), pos = [], msk = [], idx = [];
  const inside = (t, cu, cv, rho) => { p.copy(C).addScaledVector(ax, t).addScaledVector(rt, cu * rho).addScaledVector(up, cv * rho); const dx = p.x - s.x, dz = p.z - s.z; return Math.hypot(dx, dz) < R(s, p.y, Math.atan2(dz, dx)); };
  const rhoAt = (cu, cv, t, f) => { let lo = 0, hi = 30; for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (archF(cu * m, cv * m, t) < f) lo = m; else hi = m; } return lo; };
  for (let i = 0; i <= NP; i++) {
    const ph = i / NP * TAU, cu = Math.cos(ph), cv = Math.sin(ph); let t0 = 0, t1 = 0;
    while (t0 > -ARCH.L && inside(t0, cu, cv, rhoAt(cu, cv, t0, 1))) t0 -= .25; while (t1 < ARCH.L && inside(t1, cu, cv, rhoAt(cu, cv, t1, 1))) t1 += .25;
    // rings: collar tucked back into the face, lip just proud of it, the bore, lip, collar
    const ring = (t, f, o) => { const rho = rhoAt(cu, cv, t, f) + o + .28 * (K.noise2(ph * 3 + 5, t * .35) - .3); p.copy(C).addScaledVector(ax, t).addScaledVector(rt, cu * rho).addScaledVector(up, cv * rho); pos.push(p.x, p.y, p.z); msk.push(.45 + .55 * sat(Math.abs(t - (t0 + t1) / 2) / ((t1 - t0) / 2)), cv < -.2 ? 0 : .5, cv < -.5 ? .9 : .2, ph * 3); };
    ring(t0 + 1.4, 2.1, 0); ring(t0 - .45, 1.25, .1);
    for (let k = 0; k <= NT; k++) ring(lerp(t0 - .5, t1 + .5, k / NT), 1, .04);
    ring(t1 + .45, 1.25, .1); ring(t1 - 1.4, 2.1, 0);
  }
  const NK = NT + 5; for (let i = 0; i < NP; i++) for (let k = 0; k < NK - 1; k++) { const a = i * NK + k, b = a + NK; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aM', new THREE.Float32BufferAttribute(msk, 4)); g.setIndex(idx); g.computeVertexNormals();
  rock.features.arch = { pillar: 'needleW', x: C.x, y: C.y, z: C.z, axis: [ax.x, ax.y, ax.z], halfWidth: ARCH.A, top: ARCH.y + ARCH.Bt, bottom: ARCH.y - ARCH.Bb };
  return g;
}

// ---------------------------------------------------------------- loose rock: boulders, scree, chockstone, dripstone
function boulderGeo(seed, detail, hex) {
  const r = K.rng(seed); let g;
  if (hex) { g = new THREE.CylinderGeometry(.5, .5, 1, 6, 1).toNonIndexed(); g.deleteAttribute('uv'); g.rotateX(Math.PI / 2); }
  else {
    g = new THREE.IcosahedronGeometry(1, detail); g.deleteAttribute('uv');
    const pl = []; for (let i = 0; i < 9; i++) { const u = r() * 2 - 1, a = r() * TAU, q = Math.sqrt(1 - u * u); pl.push([q * Math.cos(a), u * .8, q * Math.sin(a), .5 + r() * .34]); }
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      for (const c of pl) { const l = Math.hypot(c[0], c[1], c[2]), nx = c[0] / l, ny = c[1] / l, nz = c[2] / l, dd = x * nx + y * ny + z * nz - c[3]; if (dd > 0) { x -= nx * dd; y -= ny * dd; z -= nz * dd; } }
      const n = 1 + .16 * (K.noise3(x * 2.3 + seed, y * 2.3, z * 2.3) - .5) + .07 * (K.noise3(x * 6 + seed, y * 6, z * 6) - .5);
      p.setXYZ(i, x * n, y * n * .78, z * n);
    }
  }
  g.computeVertexNormals();
  const n = g.attributes.position.count, m = new Float32Array(n * 4); for (let i = 0; i < n; i++) { m[i * 4] = 1; m[i * 4 + 1] = .1; m[i * 4 + 2] = .25; m[i * 4 + 3] = g.attributes.position.getX(i) * 2 + seed; }
  g.setAttribute('aM', new THREE.BufferAttribute(m, 4)); return g;
}
function stalGeo() {
  const g = new THREE.CylinderGeometry(.04, 1, 1, 7, 4, true).toNonIndexed(); g.deleteAttribute('uv'); g.rotateX(Math.PI); g.translate(0, -.5, 0);   // root at y = 0, tip at y = -1
  const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = -p.getY(i), k = (1 + .5 * (K.noise2(p.getX(i) * 3 + y * 5, p.getZ(i) * 3) - .5)) * (.55 + .45 * (1 - y) * (1 - y)); p.setXYZ(i, p.getX(i) * k, p.getY(i), p.getZ(i) * k); }
  g.computeVertexNormals(); const n = p.count, m = new Float32Array(n * 4), c = new Float32Array(n * 2); for (let i = 0; i < n; i++) { m[i * 4] = .8; m[i * 4 + 3] = p.getX(i) * 9; c[i * 2] = .8; }
  g.setAttribute('aM', new THREE.BufferAttribute(m, 4)); g.setAttribute('aC', new THREE.BufferAttribute(c, 2)); return g;
}
const inst = {};   // key -> { geo, list of [x,y,z, sx,sy,sz, rx,ry,rz], shadow }
const addInst = (key, x, y, z, sx, sy, sz, rx, ry, rz) => inst[key].list.push([x, y, z, sx, sy, sz, rx, ry, rz]);
function flushInst(mat) {
  const o = new THREE.Object3D(), out = [];
  for (const k in inst) {
    const it = inst[k]; if (!it.list.length) continue;
    const m = new THREE.InstancedMesh(it.geo, it.mat || mat, it.list.length);
    it.list.forEach((q, i) => { o.position.set(q[0], q[1], q[2]); o.scale.set(q[3], q[4], q[5]); o.rotation.set(q[6], q[7], q[8]); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
    m.instanceMatrix.needsUpdate = true; m.receiveShadow = !!it.shadow; m.castShadow = !!it.shadow && !it.noCast; m.frustumCulled = false; m.name = 'rock_' + k; K.scene.add(m); out.push(m);
  }
  return out;
}

// ---------------------------------------------------------------- textures
const GL_PER = /* glsl */`
float pn(vec2 p, vec2 per){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  float a=kHash12(mod(i,per)), b=kHash12(mod(i+vec2(1,0),per)), c=kHash12(mod(i+vec2(0,1),per)), d=kHash12(mod(i+vec2(1,1),per));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }
float pf(vec2 p, vec2 per){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*pn(p,per); p*=2.; per*=2.; a*=.5; } return s/.96875; }
vec3 pvor(vec2 p, vec2 per){ vec2 n=floor(p), f=fract(p); float d1=8., d2=8., id=0.;
  for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){ vec2 g=vec2(i,j), c=mod(n+g, per), o=kHash22(c+.5), r=g+o-f; float d=dot(r,r);
    if(d<d1){ d2=d1; d1=d; id=kHash12(c+7.7); } else if(d<d2) d2=d; }
  return vec3(sqrt(d1), sqrt(d2)-sqrt(d1), id); }
vec3 S(float r, float g, float b){ return pow(vec3(r,g,b), vec3(2.2)); }
`;
// the limestone structure of the tile: wavy beds that swell and break, wandering fractures, lamination, flutes, scallops, pits
const GL_ROCK = /* glsl */`
const float NB = 20.;
// returns x height (m at a 20 m tile), y bed hash, z relief 0..1, w crack 0..1. aux: x = position in bed (0 bottom..1 top), y = strength of the nearest bed joint, z = fracture, w = bed index
vec4 rockS(vec2 uv, out vec4 aux){
  vec2 q = uv; q.y += .012*(pf(uv*vec2(4.,2.), vec2(4.,2.)) - .5) + .004*(pf(uv*vec2(14.,7.)+3., vec2(14.,7.)) - .5);
  float g = q.y*NB + .8*(pn(vec2(q.y*NB*.5, 3.), vec2(NB*.5, 64.)) - .5) + .35*(pn(vec2(q.y*NB, 9.), vec2(NB, 64.)) - .5);
  float bed = floor(g), fb = fract(g), bm = mod(bed, NB);
  float hbed = kHash11(bm*7.31+1.7), hb2 = kHash11(bm*3.17+9.2);
  float along = pf(vec2(uv.x*3. + floor(hbed*8.), bm*5.), vec2(3., 4096.));
  float nc = 2. + floor(hb2*3.);
  float cu = (uv.x + .02*(pn(uv*vec2(6.,12.)+vec2(bm,0.), vec2(6.,12.))-.5))*nc + floor(hbed*7.) + .37;
  float cell = floor(cu), fc = fract(cu);
  float h0 = kHash12(vec2(mod(cell, nc), bm) + .5);
  float o = mix(along, h0, .4);
  float dV = min(fc, 1.-fc) / nc, dH = min(fb, 1.-fb) / NB;
  float jid = mod(bed + step(.5, fb), NB), jh = kHash11(jid*4.7+.3);
  float sH = mix(.12, 1., jh*jh) * (.25 + .75*smoothstep(.3, .62, pn(vec2(uv.x*7., jid*3.), vec2(7., 4096.))));
  float sV = .2 + .8*smoothstep(.4, .7, pn(vec2(cell*3.+bm, q.y*30.), vec2(4096., 30.)));
  float cV = exp(-dV/.0013)*sV, cH = exp(-dH/.0017)*sH*.8;
  vec2 wq = uv*vec2(7.,2.) + .32*vec2(pf(uv*5.+3., vec2(5.)), pf(uv*5.+7., vec2(5.)));
  vec3 fr = pvor(wq, vec2(7.,2.));
  float cF = smoothstep(.02, .0, fr.y) * smoothstep(.42, .62, pn(uv*7.+11., vec2(7.)));
  vec3 fr2 = pvor(uv*vec2(19.,9.) + .2*vec2(pf(uv*12.+1., vec2(12.)), pf(uv*12.+5., vec2(12.))), vec2(19.,9.));
  float cF2 = smoothstep(.028, .0, fr2.y) * smoothstep(.5, .7, pn(uv*9.+4., vec2(9.))) * .6;
  float crack = max(max(cV, cH), max(cF, cF2));
  float H = (hbed-.5)*.09 + (o-.5)*.26 + (fr.z-.5)*.07 + (fr2.z-.5)*.03;
  H -= .04*exp(-min(dV/max(sV,.05), dH/max(sH,.05))/.006);
  H -= .12*crack;
  float lam = 1. - abs(2.*pn(vec2(uv.x*3.+bm, g*7.), vec2(3., NB*7.)) - 1.);
  H += .02*lam*lam * (.4 + .6*hb2);
  float fl = 1. - abs(2.*pn(uv*vec2(96., 3.)+vec2(0., bm), vec2(96., 3.)) - 1.);
  H += .035*fl*fl * smoothstep(.35,.6, pn(uv*4.+2., vec2(4.)));
  vec3 sc = pvor(uv*vec2(34., 26.), vec2(34., 26.)); H -= .032*smoothstep(.55, .1, sc.x) * smoothstep(.45, .7, pn(uv*6.+8., vec2(6.)));
  vec3 pv = pvor(uv*83. + 2.*pf(uv*30., vec2(30.)), vec2(83.)); H -= .03*smoothstep(.34*pv.z, .05, pv.x) * step(.5, pv.z) * smoothstep(.4, .6, pn(uv*11.+6., vec2(11.)));
  H += .10*(pf(uv*8., vec2(8.)) - .5) + .035*(pf(uv*64., vec2(64.)) - .5);
  aux = vec4(fb, sH, max(cF, cF2), bm);
  return vec4(H, hbed, o, crack);
}`;
// ground set (shared with the terrain module): pebbles and gravel on soil. albedo.a = stone mask · normal.b cavity · normal.a fibre noise (grass)
rock.bakeGround = () => {
  const T = rock.tex; if (T.gndA) return;
  const GL_GND = /* glsl */`
    vec4 gndS(vec2 uv){ vec3 v1 = pvor(uv*13., vec2(13.)), v2 = pvor(uv*41.+3., vec2(41.));
      float s1 = step(.45, v1.z) * smoothstep(.5*(.5+.5*v1.z), .08, v1.x), s2 = step(.3, v2.z) * smoothstep(.45, .1, v2.x);
      float soil = pf(uv*24., vec2(24.));
      float H = max(s1*.11*(.5+v1.z), s2*.035) + .02*soil + .006*pf(uv*128., vec2(128.));
      return vec4(H, max(s1, s2*.8), v1.z, v2.z); }`;
  const gH = K.bake(1024, 1024, GL_PER + GL_GND + `vec4 bake(vec2 uv){ return gndS(uv); }`, { type: THREE.HalfFloatType, mips: false });
  T.gndN = K.bake(1024, 1024, GL_PER + GL_GND + /* glsl */`uniform sampler2D tH;
    vec4 bake(vec2 uv){ float px = 1./1024.; float hl = texture2D(tH, uv-vec2(px,0.)).r, hr = texture2D(tH, uv+vec2(px,0.)).r, hd = texture2D(tH, uv-vec2(0.,px)).r, hu = texture2D(tH, uv+vec2(0.,px)).r;
      vec3 n = normalize(vec3(-vec2(hr-hl, hu-hd)/(2.*px*6.)*1.3, 1.)); float h0 = texture2D(tH, uv).r, s = 0.;
      for(int i=0;i<12;i++){ float fi = float(i), a = fi*2.39996, r = (2. + 10.*sqrt((fi+.5)/12.))*px; s += texture2D(tH, uv + vec2(cos(a), sin(a))*r).r; }
      float fib = pn(uv*vec2(260., 60.) + 9.*pf(uv*9., vec2(9.)), vec2(260., 60.))*.6 + .4*pf(uv*48.+2., vec2(48.));
      return vec4(n.xy*.5+.5, clamp(.5 + (h0 - s/12.)*14., 0., 1.), fib); }`, { uniforms: { tH: { value: gH } } });
  T.gndA = K.bake(1024, 1024, GL_PER + GL_GND + /* glsl */`
    vec4 bake(vec2 uv){ vec4 g = gndS(uv); float n = pf(uv*18., vec2(18.)), n2 = pf(uv*90.+4., vec2(90.));
      vec3 soil = mix(S(.46,.38,.27), S(.62,.55,.42), n) * (.8 + .4*n2);
      vec3 st = mix(S(.70,.68,.62), S(.80,.72,.56), step(.6, g.z)); st = mix(st, S(.50,.52,.55), step(.85, g.w)) * (.75 + .5*n2);
      return vec4(mix(soil, st, g.y), g.y); }`, { srgb: true });
  gH.dispose && gH.dispose();
};
function bakeTextures() {
  const N = 2048, T = rock.tex;
  const tH = K.bake(N, N, GL_PER + GL_ROCK + `vec4 bake(vec2 uv){ vec4 aux; return rockS(uv, aux); }`, { type: THREE.HalfFloatType, mips: false });
  T.normal = K.bake(N, N, GL_PER + GL_ROCK + /* glsl */`uniform sampler2D tH;
    vec4 bake(vec2 uv){ float px = 1./${N}.; vec4 aux; vec4 rs = rockS(uv, aux);
      float hl = texture2D(tH, uv-vec2(px,0.)).r, hr = texture2D(tH, uv+vec2(px,0.)).r, hd = texture2D(tH, uv-vec2(0.,px)).r, hu = texture2D(tH, uv+vec2(0.,px)).r;
      vec2 g = vec2(hr-hl, hu-hd) / (2.*px*20.) * 1.5; vec3 n = normalize(vec3(-g, 1.));
      float h0 = rs.x, s = 0.; for(int i=0;i<20;i++){ float fi = float(i), a = fi*2.39996, r = (3. + 22.*sqrt((fi+.5)/20.))*px; s += texture2D(tH, uv + vec2(cos(a), sin(a))*r).r; }
      float cav = clamp(.5 + (h0 - s/20.)*8., 0., 1.);
      float up = max(max(texture2D(tH, uv+vec2(0., 3.*px)).r, texture2D(tH, uv+vec2(0., 7.*px)).r), texture2D(tH, uv+vec2(0., 13.*px)).r) - h0;   // rock overhanging just above -> shade
      cav *= 1. - .5*clamp(up*9., 0., 1.);
      float rough = .86 + .1*rs.w - .12*smoothstep(.55, .9, cav) + .06*(pf(uv*40., vec2(40.))-.5);
      return vec4(n.xy*.5+.5, cav, rough); }`, { uniforms: { tH: { value: tH } } });
  T.albedo = K.bake(N, N, GL_PER + GL_ROCK + /* glsl */`
    vec4 bake(vec2 uv){ vec4 aux; vec4 rs = rockS(uv, aux); float fb = aux.x, bm = aux.w;
      vec3 col = S(.77,.74,.67);
      float tw = kHash11(bm*1.93+4.1);
      col = mix(col, S(.80,.70,.52), smoothstep(.55,.95,tw)*.45); col = mix(col, S(.66,.67,.67), smoothstep(.4,.05,tw)*.5);
      col *= .90 + .20*rs.z;
      float m1 = pf(uv*14., vec2(14.)), m2 = pf(uv*96.+5., vec2(96.)), m3 = pf(uv*320.+1., vec2(320.));
      col *= .78 + .44*m1; col *= .86 + .28*m2; col *= .9 + .2*m3;
      col = mix(col, S(.63,.42,.24), smoothstep(.60,.80, pf(uv*7.+9., vec2(7.)))*.38);                 // iron staining
      // drips below bed joints: water seeps out of the joint above and runs down this bed
      float dp = smoothstep(.52,.8, pn(vec2(uv.x*84., bm+2.), vec2(84., 4096.))*.7 + .3*pn(vec2(uv.x*220., bm+7.), vec2(220., 4096.)));
      float dl = dp * pow(fb, 1.2) * smoothstep(.3, .8, aux.y) * step(.5, kHash11(bm*5.7+2.));
      col = mix(col, S(.17,.14,.11), dl*.82);
      float ca = smoothstep(.70,.92, pn(vec2(uv.x*46.+17., bm+5.), vec2(46., 4096.))) * smoothstep(.45,1.,fb) * step(.55, kHash11(bm*2.9+8.));
      col = mix(col, S(.90,.89,.84), ca*.45*step(.5, aux.y));                                          // calcite crust
      col *= 1. - .78*rs.w;                                                                             // dirt in the joints
      // crustose lichen: small irregular blotches gathered in patches
      vec2 lq = uv*90. + 1.3*vec2(pf(uv*40., vec2(40.)), pf(uv*40.+9., vec2(40.)));
      vec3 lv = pvor(lq, vec2(90.)); float lm = smoothstep(.5,.66, pf(uv*5.+3.1, vec2(5.))) * smoothstep(.35,.6, m2);
      float spot = smoothstep(.42*(.4+lv.z), .25*(.4+lv.z), lv.x) * lm * step(.3, lv.z);
      vec3 lc = lv.z < .62 ? S(.66,.69,.58) : lv.z < .8 ? S(.74,.52,.26) : lv.z < .9 ? S(.76,.70,.38) : S(.84,.84,.80);
      col = mix(col, lc, spot*.7);
      float moss = clamp(max(exp(-min(fb,1.-fb)/NB/.004)*aux.y, max(aux.z*.6, rs.w*.5)) + .25*(m1-.5), 0., 1.);
      return vec4(col, moss); }`, { srgb: true });
  tH.dispose && tH.dispose(); T.albedo.anisotropy = T.normal.anisotropy = 2;
  rock.bakeGround();
  // the stratigraphic column as a 1-D texture: r protrusion, g tint (cool..ochre), b value, a joint line
  const d = new Uint8Array(SN * 4);
  for (let i = 0; i < SN; i++) {
    const y = SY0 + (i + .5) * SDY, b = bedOf(y), dj = Math.min(y - bY0[b], bY1[b] - y);
    d[i * 4] = (bP[b] + 1.2) / 2.4 * 255; d[i * 4 + 1] = bTint[b] * 255; d[i * 4 + 2] = bVal[b] * 255; d[i * 4 + 3] = sat(1 - dj / .07) * 255;
  }
  const st = T.strata = new THREE.DataTexture(d, SN, 1, THREE.RGBAFormat); st.wrapS = st.wrapT = THREE.RepeatWrapping; st.minFilter = THREE.LinearMipmapLinearFilter; st.magFilter = THREE.LinearFilter; st.generateMipmaps = true; st.needsUpdate = true;
}

// ---------------------------------------------------------------- material
// o.far: cheaper shader for the haze pillars · o.col: columnar basalt · o.arch: discard the Sky Window volume
// Texture lookups are branched on the triplanar weights (textureGrad keeps the mip selection right), so a wall
// pixel pays for one projection, not three; the close-up scale is only sampled within ~120 m of the lens.
function rockMat(o = {}) {
  const T = rock.tex, F = W.sites.falls, col = !!o.col;
  const plane = (c, uv, sw, S, tex, extra) => `if(w.${c} > 0.){ vec2 u = ${uv}*${S}${extra || ''}, gx = dPx.${uv.slice(2)}*${S}, gy = dPy.${uv.slice(2)}*${S}; ${tex} }`;
  const big = (c, uv, sw) => plane(c, uv, sw, 'S1', `vec4 a = textureGrad(tRA, u, gx, gy), n = textureGrad(tRN, u, gx, gy); A += a*w.${c}; vec2 t = (n.xy*2.-1.)*w.${c}; off += ${sw}; cav += n.b*w.${c}; rough += n.a*w.${c};`);
  const det = (c, uv, sw, k) => plane(c, uv, sw, 'S2', `vec4 n = textureGrad(tRN, u, gx, gy); vec2 t = (n.xy*2.-1.)*w.${c}; o2 += ${sw}; c2 += n.b*w.${c}; a2 += textureGrad(tRA, u, gx, gy).rgb*w.${c};`, ' + ' + k);
  return K.mat({
    roughness: .9, metalness: 0, envMapIntensity: .55, key: 'rock' + (o.far ? 'F' : '') + (col ? 'C' : '') + (o.arch ? 'A' : ''),
    uniforms: Object.assign({ tRA: { value: T.albedo }, tRN: { value: T.normal }, tGA: { value: T.gndA }, tGN: { value: T.gndN }, tStrata: { value: T.strata }, uFalls: { value: new THREE.Vector4(F.x, F.y, F.z, 0) } }, o.arch ? ARCH.uni : {}),
    vertPars: 'attribute vec4 aM; attribute vec2 aC; varying vec4 vM; varying vec2 vC;', vert: 'vM = aM; vC = aC;',
    fragPars: /* glsl */`varying vec4 vM; varying vec2 vC; uniform sampler2D tRA, tRN, tGA, tGN, tStrata; uniform vec4 uFalls;` + (o.arch ? GL_ARCH : ''),
    frag: /* glsl */`
      vec3 P = vWPos, gN = kN, dPx = dFdx(P), dPy = dFdy(P);
      ${o.arch ? 'if(archIn(P)) discard;' : ''}
      vec3 fN = normalize(cross(dPx, dPy)); if(dot(fN, gN) < 0.) fN = -fN;
      vec3 N0 = normalize(mix(gN, fN, .25 + .75*smoothstep(.85, .5, dot(fN, gN))));                // crisp treads and joint walls
      vec3 w = abs(N0); w *= w; w *= w; w *= w; w = max(w/(w.x + w.y + w.z) - .1, 0.); w /= (w.x + w.y + w.z);
      float soil = max(vC.y, 0.), tal = max(-vC.y, 0.);
      float up = max(N0.y, 0.), side = 1. - w.y, dist = length(P - cameraPosition);
      const float S1 = 1./${col ? '13.' : '20.'}, S2 = 1./4.3;
      vec4 A = vec4(0.); vec3 off = vec3(0.); float cav = 0., rough = 0.;
      ${col ? big('x', 'P.yz', 'vec3(0., t.x, t.y)') + big('z', 'P.yx', 'vec3(t.y, t.x, 0.)') : big('x', 'P.zy', 'vec3(0., t.y, t.x)') + big('z', 'P.xy', 'vec3(t.x, t.y, 0.)')}
      ${big('y', 'P.xz', 'vec3(t.x, 0., t.y)')}
      off *= 1.7;
      ${o.far ? '' : /* glsl */`
      float dk = 1. - smoothstep(38., 85., dist);
      vec3 dcol = vec3(1.);
      if(dk > 0.){ vec3 o2 = vec3(0.), a2 = vec3(0.); float c2 = 0.;
        ${det('x', 'P.zy', 'vec3(0., t.y, t.x)', '.37') + det('z', 'P.xy', 'vec3(t.x, t.y, 0.)', '.61') + det('y', 'P.xz', 'vec3(t.x, 0., t.y)', '.13')}
        off += o2*1.5*dk; cav *= mix(1., mix(.5, 1.34, c2), dk); dcol = mix(vec3(1.), clamp(a2/vec3(.30,.26,.19), .35, 1.7), dk*.8); }`}
      vec3 col = A.rgb${o.far ? '' : '*dcol'};
      float mac = texture2D(uNoiseTex, P.xz*.0043 + P.y*.0037).r, mac2 = texture2D(uNoiseTex, P.xz*.021 + P.y*.017 + .4).a;
      ${col ? /* glsl */`
      col = col*vec3(.36,.37,.41) + vec3(.012,.010,.008) * mac;                                     // dark dolerite
      if(up > .3){ vec3 hv = kVoronoi(P.xz*.62); col *= mix(1., .35, smoothstep(.07, .0, hv.y)*up) * mix(1., .75 + .5*hv.z, up); }` : /* glsl */`
      // the stratigraphic column: beds differ in tint and value, joints are dark lines
      vec4 st = texture2D(tStrata, vec2((P.y - (${SY0.toFixed(1)})) / ${SSPAN.toFixed(1)}, .5));
      col *= mix(vec3(.94,.96,.99), vec3(1.09,1.0,.85), st.g) * (.78 + .34*st.b);
      col *= 1. - .3*st.a*side*smoothstep(.4, .6, mac2);`}
      col *= .74 + .5*mac;
      // weathering: old exposed faces carry a grey patina, fresh breaks stay pale and warm
      float pat = smoothstep(.42, .66, mac*.55 + mac2*.45 + (cav - .5)*.25);
      col = mix(col*vec3(.96,.92,.84), col*vec3(.50,.51,.54), pat*.8);
      // water stains: dark streaks running down from ledges, joints and cave mouths; calcite runs beside them
      float arc = vM.w, sm = vM.y + (mac - .5)*.7 - .15, dark = 0., s2 = mac2, calc = vC.x*(.55 + .6*mac2);
      if(sm > -.15 && side > .02){
        float s1 = texture2D(uNoiseTex, vec2(arc*.18, P.y*.017)).r; s2 = texture2D(uNoiseTex, vec2(arc*.54 + .31, P.y*.031 + .2)).a;
        dark = smoothstep(.66 - .30*sm, .78 - .24*sm, s1*.62 + s2*.38) * side * smoothstep(-.15, .3, sm);
        col = mix(col, col*vec3(.20,.17,.14) + vec3(.004), dark*.86);
        if(mac > .45) calc += smoothstep(.70, .78, texture2D(uNoiseTex, vec2(arc*.36 + .7, P.y*.0085 + .6)).g + .2*sm - .12) * side * smoothstep(.45, .7, mac) * .45 * (1. - dark);
      }
      calc = clamp(calc, 0., .92);
      col = mix(col, vec3(.80,.78,.70)*(.7 + .5*cav), calc);
      col *= mix(.36, 1.24, cav) * vM.x;
      // moss, scree and grass: flat treads and damp joints grow moss, sloping talus is rubble, soil caps are grass
      float slope = smoothstep(.35, .6, up) * (1. - smoothstep(.86, .95, up));
      float mossA = up*1.3 - slope*.75*tal + vM.z*.6 + A.a*.55 + (1.-cav)*.45 + (mac2 - .5)*1.1 - .95 - dark*.2 - calc*.6;
      float moss = smoothstep(0., .3, mossA), gr = 0.;
      vec3 mcol = mix(vec3(.035,.07,.012), vec3(.17,.22,.045), mac2*.7 + .3*s2);
      if(${o.far ? 'false' : 'up > .3 || soil > .02'}){
        vec4 gA = texture2D(tGA, P.xz/6.), gNn = texture2D(tGN, P.xz/6.);
        // rubble on talus and sloping treads
        float rub = slope * (.45 + .55*gA.a) * tal;
        col = mix(col, gA.rgb*vec3(.80,.76,.66)*(.5 + .8*gNn.b), rub*.8);
        mcol = mix(mcol, mix(vec3(.045,.09,.02), vec3(.20,.25,.06), gNn.a), smoothstep(.75, .95, up));
        // soil cap: grass, dry patches, bare soil and stones
        gr = smoothstep(.35, .65, soil + (gNn.a - .5)*.5) * smoothstep(.5, .8, up);
        vec3 gcol = mix(vec3(.04,.08,.018), vec3(.19,.24,.06), gNn.a) * (.7 + .6*mac2);
        gcol = mix(gcol, vec3(.25,.22,.09)*(.6 + .6*gNn.a), smoothstep(.5, .75, mac*.5 + s2*.5)*.6);
        gcol = mix(gcol, gA.rgb*.6, clamp(gA.a*.5 + smoothstep(.62, .78, texture2D(uNoiseTex, P.xz*.037).g), 0., 1.) * .8);
        col = mix(mix(col, mcol * (.6 + .6*cav), moss), gcol * (.6 + .5*gNn.b), gr);
        off = mix(off, vec3(gNn.x*2.-1., 0., gNn.y*2.-1.)*1.3, max(max(gr, rub), moss*smoothstep(.5, .8, up)));
      } else col = mix(col, mcol * (.6 + .6*cav), moss);
      rough = mix(rough, .95, max(moss, gr));
      // damp: the waterline band and the waterfall site
      float wl = smoothstep(2.6, .15, P.y + (mac2 - .5)*1.6);
      float fd = length(P.xz - uFalls.xz), wf = smoothstep(11., 2.5, fd + (mac2-.5)*5.) * smoothstep(uFalls.y + 6., uFalls.y - 2., P.y);
      float wet = max(wl, wf*.8);
      col *= mix(vec3(1.), vec3(.50,.55,.50), wet);
      col = mix(col, col*vec3(.55,.85,.45), wf*.5*(1.-moss));
      col = mix(col, vec3(.78,.77,.70)*(.6+.4*cav), smoothstep(.5, .0, abs(P.y - .75 - (mac2-.5))) * .35 * side);   // pale tide line
      rough = mix(rough, .35, wet*.75);
      diffuseColor.rgb = col;
      roughnessFactor = clamp(rough, .2, 1.);
      normal = normalize((viewMatrix * vec4(normalize(N0 + off), 0.)).xyz);
    `,
  });
}

// ---------------------------------------------------------------- build
K.reg('rock', {
  init() {
    bakeTextures();
    const T = W.temple, deg = (s, d) => d * DEG * PP[s.i].Rref;
    // ---- parameters: heroes with their features, then the far field
    for (const s of W.spires) mkP(s, s === T ? { keepOut: [[-58, 147, 0], [152, 181, 1]] } : s.name === 'needleE' ? { columnar: true, cw: 1.9 } : s.name === 'gate' ? { rimH: .45, siteR: 23.4 } : {});
    { // Temple Peak
      const P = PP[T.i];
      P.joints.push({ a: deg(T, 149), hw: 2.5, depth: 1.7, y0: -8, y1: 77, ch: true });                 // the waterfall cleft
      P.caves.push({ a: deg(T, 149), y: 73.2, rw: 2.5, rh: 2.3, depth: 2.6, name: 'falls spout' }, { a: deg(T, 205), y: 96, rw: 4.4, rh: 3.3, depth: 3, name: 'great cave' },
        { a: deg(T, 100), y: 1.2, rw: 5.2, rh: 2.8, depth: 3, name: 'water cave' }, { a: deg(T, 40), y: 44, rw: 2.6, rh: 2.2, depth: 2.2 }, { a: deg(T, 122), y: 40, rw: 4.4, rh: 3.4, depth: 3, name: 'lower cave' }, { a: deg(T, 262), y: 58, rw: 3.4, rh: 2.8, depth: 2.8 }, { a: deg(T, -120), y: 85, rw: 3.5, rh: 3, depth: 2.8 });
      colossus(P); stairCuts(P); P.zone = templeZone; P.siteR = 22.4;
    }
    PP[W.wallL.i].caves.push({ a: deg(W.wallL, 78), y: 63, rw: 3.6, rh: 3.6, depth: 3 }, { a: deg(W.wallL, 20), y: 2, rw: 4, rh: 2.6, depth: 2.6 }, { a: deg(W.wallL, 110), y: 104, rw: 2.6, rh: 2.4, depth: 2.4 });
    nicheWall(PP[W.wallR.i], 164, 197, 63.9, 4);
    PP[W.wallR.i].caves.push({ a: deg(W.wallR, 150), y: 79, rw: 4, rh: 3.1, depth: 3 }, { a: deg(W.wallR, 170), y: 1.5, rw: 4.6, rh: 2.7, depth: 2.8 }, { a: deg(W.wallR, 120), y: 122, rw: 2.8, rh: 2.6, depth: 2.4 });
    PP[W.gate.i].caves.push({ a: deg(W.gate, -62), y: 27, rw: 4.8, rh: 3.4, depth: 3 }, { a: deg(W.gate, 150), y: 1.5, rw: 4.4, rh: 2.6, depth: 2.6 });
    PP[W.needleW.i].caves.push({ a: deg(W.needleW, 95), y: 74, rw: 2.8, rh: 2.8, depth: 2.5 });
    PP[W.shelf.i].caves.push({ a: deg(W.shelf, 130), y: 48, rw: 3.6, rh: 3, depth: 2.8 });
    PP[W.isle.i].caves.push({ a: deg(W.isle, 80), y: 1.2, rw: 2.2, rh: 1.8, depth: 1.6 });
    for (const P of PP) for (const c of P.caves) { const th = c.a / P.Rref, r = W.spireR(P.s, Math.max(0, c.y), th); rock.caves.push({ pillar: P.s.name, name: c.name || 'cave', azDeg: th / DEG, y: c.y, halfW: c.rw, halfH: c.rh, depth: c.depth, x: P.s.x + Math.cos(th) * r, z: P.s.z + Math.sin(th) * r }); }
    // ---- secondary towers and flakes
    const tw = [];
    const T_ = (par, list) => { for (const o of list) tw.push(addTower(par, o)); };
    T_(T, [{ deg: 198, h: 78, r: 3.4 }, { deg: 4, h: 50, r: 3 }, { deg: 172, h: 36, r: 2.6 }, { deg: 250, h: 92, r: 3.6 }, { deg: 305, h: 64, r: 3.2 }, { deg: -82, h: 84, r: 3.3 }, { deg: 228, h: 30, r: 3, flat: .45 }]);
    T_(W.wallL, [{ deg: 160, h: 74, r: 3.2 }, { deg: -8, h: 92, r: 3.4 }, { deg: 82, h: 33, r: 2.6 }, { deg: 250, h: 60, r: 3 }, { deg: 40, h: 22, r: 2.8, flat: .45 }]);
    T_(W.wallR, [{ deg: 66, h: 86, r: 3.4 }, { deg: 100, h: 38, r: 2.8 }, { deg: 0, h: 64, r: 3 }, { deg: 300, h: 50, r: 3 }, { deg: 200, h: 24, r: 2.8, flat: .45 }]);
    T_(W.gate, [{ deg: 20, h: 34, r: 2.8 }, { deg: 110, h: 26, r: 2.6 }, { deg: 215, h: 40, r: 3 }, { deg: -95, h: 30, r: 2.6 }]);
    T_(W.needleW, [{ deg: 60, h: 70, r: 3 }, { deg: 170, h: 96, r: 3.2 }, { deg: 290, h: 58, r: 2.8 }]);
    T_(W.shelf, [{ deg: 150, h: 52, r: 3.2 }, { deg: 40, h: 40, r: 3 }, { deg: 260, h: 60, r: 3.2 }]);
    T_(W.isle, [{ deg: 200, h: 9, r: 1.5, cs: .4 }]);
    for (const s of W.spires) { const P = PP[s.i]; if (P.hero || P.dCam > 1300) continue; const r = K.rng(s.seed * 7 + 1), n = 1 + (r() * 2.4 | 0); for (let k = 0; k < n; k++) tw.push(addTower(s, { deg: r() * 360, h: s.h * (.3 + r() * .4), r: s.r * (.13 + r() * .09), cs: P.cs, amp: 1.2, lod: true, y0: Math.min(-4, W.h(s.x, s.z) - 6) })); }
    { // the Leaning Needle: free-standing, tilted against wallR, pinned by a chockstone
      const par = W.wallR, dg = -121, th = dg * DEG, lean = -.118, yC = 45, H = 74, rN = 4.2 * (1 - .28 * (yC + 8) / (H + 8));
      const Dc = W.spireR(par, yC, th) + 2.6 + rN, yM = -8 + (H + 8) * .55;                           // axis distance at the chockstone height
      const s = addTower(par, { name: 'leaningNeedle', deg: dg, h: H, r: 4.2, y0: -8, lean, D: Dc + lean * (yM - yC), seed: 4711, amp: .6 }); tw.push(s);
      const PN = PP[s.i]; bucketJoints(PN);
      const ax = s.x + PN.lx * (yC - s.h), az = s.z + PN.lz * (yC - s.h), inner = Math.hypot(ax - par.x, az - par.z) - R(s, yC, th + Math.PI);
      bucketJoints(PP[par.i]); const wall = R(par, yC, th), gap = inner - wall, rm = (inner + wall) / 2, f = rock.flakes[rock.flakes.length - 1];
      rock.features.leaningNeedle = { parent: 'wallR', azDeg: dg, baseX: f.baseX, baseZ: f.baseZ, topX: s.x, topZ: s.z, h: H, r: 4.2, leanDeg: Math.atan(-lean) / DEG };
      rock.features.chockstone = { x: par.x + Math.cos(th) * rm, y: yC, z: par.z + Math.sin(th) * rm, size: clamp(gap + 2.4, 2.6, 7) };
    }
    for (const P of PP) bucketJoints(P);
    // ---- materials
    const mat = rock.mat = rockMat(), matFar = rock.matFar = rockMat({ far: true }), matCol = rock.matColumnar = rockMat({ col: true });
    // ---- pillars
    const far = [], twG = [];
    for (const s of W.spires) {
      const P = PP[s.i], g = buildPillar(s);
      if (!P.hero) { far.push(g); continue; }
      let m;
      if (s.name === 'needleW') {
        const tg = buildArch(s); m = new THREE.Mesh(g, rockMat({ arch: true }));
        const dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
        dm.onBeforeCompile = sh => { Object.assign(sh.uniforms, ARCH.uni);
          sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;').replace('#include <project_vertex>', '#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.)).xyz;');
          sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;\n' + GL_ARCH).replace('void main() {', 'void main() {\n if(archIn(vWP)) discard;'); };
        m.customDepthMaterial = dm;
        const tm = new THREE.Mesh(tg, mat); tm.castShadow = tm.receiveShadow = true; tm.name = 'rock_arch'; K.scene.add(tm);
      } else m = new THREE.Mesh(g, P.columnar ? matCol : mat);
      m.castShadow = m.receiveShadow = true; m.name = 'rock_' + s.name; K.scene.add(m); g.computeBoundingSphere();
    }
    for (const s of tw) (PP[s.i].dCam < 420 ? twG : far).push(buildPillar(s));
    { const m = new THREE.Mesh(K.merge(twG), mat); m.castShadow = m.receiveShadow = true; m.name = 'rock_towers'; m.frustumCulled = false; K.scene.add(m); }
    { const m = new THREE.Mesh(K.merge(far), matFar); m.frustumCulled = false; m.name = 'rock_far'; m.renderOrder = 2; K.scene.add(m); }
    // ---- ledge spots (where trees, shrines, boulders can stand): true shelves only
    for (let i = 0; i < 8; i++) {
      const s = W.spires[i], P = PP[i];
      P.led.forEach((yl, k) => { const n = Math.round(P.circ / 2.4); for (let j = 0; j < n; j++) { const th = -Math.PI + TAU * (j + .5) / n, ri = R(s, yl + .06, th), sh = gShelf, ro = R(s, yl - .06, th), w = ro - ri; if (w > .9 && sh > .9) { const rr = ri + w * .5; rock.ledges.push({ pillar: s.name, s, k, y: yl, th, x: s.x + Math.cos(th) * rr, z: s.z + Math.sin(th) * rr, w, rIn: ri, rOut: ro }); } } });
    }
    // ---- loose rock
    const B = rock.boulders = [0, 1, 2, 3].map(i => boulderGeo(11 + i * 7, 3)), Bm = [0, 1, 2].map(i => boulderGeo(51 + i * 5, 2)), Bs = [0, 1].map(i => boulderGeo(71 + i * 3, 1)), HX = boulderGeo(5, 0, true);
    B.forEach((g, i) => inst['big' + i] = { geo: g, list: [], shadow: true }); Bm.forEach((g, i) => inst['mid' + i] = { geo: g, list: [], shadow: true, noCast: true }); Bs.forEach((g, i) => inst['small' + i] = { geo: g, list: [], shadow: true, noCast: true });
    inst.hex = { geo: HX, list: [], shadow: true, mat: matCol }; inst.stal = { geo: stalGeo(), list: [], shadow: true, noCast: true };
    const rb = K.rng(555), put = (x, y, z, sz, flat = 1) => { const k = sz > 1.6 ? 'big' + (rb() * 4 | 0) : sz > .7 ? 'mid' + (rb() * 3 | 0) : 'small' + (rb() * 2 | 0); addInst(k, x, y, z, sz * (.8 + .5 * rb()), sz * (.6 + .5 * rb()) * flat, sz * (.8 + .5 * rb()), rb() * .6 - .3, rb() * TAU, rb() * .6 - .3); };
    for (let i = 0; i < 8; i++) {                                                 // talus at the waterline of every hero pillar
      const s = W.spires[i], P = PP[i], n = Math.round(P.circ * 1.55 * (i === 7 ? 1 : .8));
      for (let j = 0; j < n; j++) {
        const th = rb() * TAU, sz = P.columnar ? .7 + 2.2 * Math.pow(rb(), 2) : .35 + 2.9 * Math.pow(rb(), 3.2), rr = R(s, .4, th) + (rb() * rb()) * 5 - .4 * sz, x = s.x + Math.cos(th) * rr, z = s.z + Math.sin(th) * rr;
        if (P.columnar) addInst('hex', x, -.3 + rb() * 1.2 * sz * .4, z, sz * .9, sz * .9, sz * (1.2 + 2.2 * rb()), rb() * 1.2 - .6, rb() * TAU, rb() * .5 - .25); else put(x, -.25 * sz + rb() * .5 * sz, z, sz);
      }
    }
    for (const l of rock.ledges) if (rb() < .3) { const sz = .3 + 1.1 * Math.pow(rb(), 2.5), rr = lerp(l.rIn, l.rOut, .25 + .6 * rb()), th = l.th + (rb() - .5) * .04; put(l.s.x + Math.cos(th) * rr, l.y + sz * .22, l.s.z + Math.sin(th) * rr, Math.min(sz, l.w * .55)); }
    { const c = rock.features.chockstone; addInst('big1', c.x, c.y, c.z, c.size * .62, c.size * .5, c.size * .62, .5, 1.1, -.4); }
    for (const P of PP) for (const c of P.caves) {                               // dripstone: stalactites along the roof of every cave, a few stalagmites
      const s = P.s, n = Math.round(c.rw * 4.5);
      for (let j = 0; j < n; j++) {
        const u = (rb() * 2 - 1) * .86, e = .5 + .42 * rb(), top = 1 - .55 * u * u, th = (c.a + u * c.rw) / P.Rref, y = c.y + c.rh * top * e, rr = R(s, y, th) + .12, len = Math.min(c.rh * (.25 + 1.1 * rb() * rb()), y - c.y + c.rh * .5), wd = .1 + .16 * rb() + len * .05;
        addInst('stal', s.x + Math.cos(th) * rr, y + .1, s.z + Math.sin(th) * rr, wd, len, wd, 0, rb() * TAU, 0);
        if (j % 4 === 0 && c.y > 3) { const yf = c.y - c.rh * .58, r2 = R(s, yf, th) + .25; addInst('stal', s.x + Math.cos(th) * r2, yf - .1, s.z + Math.sin(th) * r2, wd * 1.5, -len * .45, wd * 1.5, 0, rb() * TAU, 0); }
      }
    }
    if (rock.shore) rock.shore(put, rb);                                         // the terrain module scatters shoreline rocks through this
    rock.meshes = flushInst(mat);
    rock.strata = { y0: SY0, span: SSPAN, bedOf, bY0, bY1, bP, bKind };
    rock.makeMat = rockMat;
  },
  update(F) {}
});

})(window.K=window.K||{},window.THREE);
//# sourceURL=src/25_rock.js

(function(K,THREE){'use strict';
// ============================================================================
// 30_arch — the cliff monastery of Temple Peak. Classical timber temple architecture built from a kit:
// stone platforms + balustrades + stairs, vermilion columns, painted beams, dougong bracket sets, lattice,
// hip / hip-and-gable / pyramidal roofs with upturned flying eaves (every cover-tile row modelled),
// ridge beasts, dragon-fish finials, wind chimes, lanterns, banners, prayer wheels, bells, drums.
// Sites: gate pavilion (key-shot foreground), mid terrace, hanging halls, cliff stair, summit + pagoda,
// gallery bridge to the west needle, rope bridge, waterwheel + flume, lakeside pavilion, distant shrines.
// No text anywhere: plaques and banners carry meander / cloud-scroll patterns only.
// ============================================================================
const V3 = THREE.Vector3, M4 = THREE.Matrix4, QT = THREE.Quaternion;
const { sat, lerp, smooth, clamp } = K;
const W = K.world, S = W.sites, PI = Math.PI, TAU = PI * 2;
const DBG = false;
const ARCH = K.arch = { lanterns: [], smoke: [], roofs: [], chimes: [], bells: [], fires: [], keepOut: [] };
// keepOut: [{x, z, y0, y1, r}] cylinders where buildings stand — vegetation / rock dressing should avoid them
const keep = (p, r, y0, y1) => ARCH.keepOut.push({ x: +p.x.toFixed(2), z: +p.z.toFixed(2), y0: +y0.toFixed(1), y1: +y1.toFixed(1), r: +r.toFixed(2) });

// ---------------------------------------------------------------- palette (linear)
const C = {
  verm: [0.50, 0.045, 0.02], vermD: [0.22, 0.022, 0.012], red: [0.36, 0.05, 0.03], ochre: [0.42, 0.16, 0.07],
  teal: [0.02, 0.16, 0.15], green: [0.04, 0.20, 0.09], blue: [0.025, 0.07, 0.24], gold: [0.85, 0.58, 0.20],
  dark: [0.05, 0.03, 0.02], wood: [0.23, 0.15, 0.09], woodG: [0.30, 0.26, 0.21], white: [0.78, 0.76, 0.70],
  stone: [1, 1, 1], stoneD: [0.75, 0.73, 0.70], plaster: [0.80, 0.76, 0.66], wallR: [0.42, 0.09, 0.05],
  tile: [1, 1, 1], tileY: [1.9, 1.35, 0.35], rope: [0.36, 0.28, 0.17], bronze: [0.40, 0.27, 0.15], verd: [0.16, 0.30, 0.24],
  black: [0.02, 0.02, 0.02],
};

// ---------------------------------------------------------------- baked textures
const PER = /* glsl */`
float pn(vec2 p, vec2 per){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(kHash12(mod(i,per)),kHash12(mod(i+vec2(1,0),per)),f.x), mix(kHash12(mod(i+vec2(0,1),per)),kHash12(mod(i+vec2(1,1),per)),f.x), f.y); }
float pf(vec2 uv, vec2 per, int oct){ float s=0., a=.5, n=0.; for(int i=0;i<7;i++){ if(i>=oct) break; s+=a*pn(uv*per, per); n+=a; per*=2.; a*=.5; } return s/n; }
vec3 pvor(vec2 uv, vec2 per){ vec2 p=uv*per, n=floor(p), f=fract(p); float d1=8., d2=8., id=0.;
  for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){ vec2 g=vec2(i,j), o=kHash22(mod(n+g,per)), r=g+o-f; float d=dot(r,r);
    if(d<d1){ d2=d1; d1=d; id=kHash12(mod(n+g,per)+7.7);} else if(d<d2) d2=d; }
  return vec3(sqrt(d1), sqrt(d2)-sqrt(d1), id); }
`;
// a set of maps from one height field H(uv) (metres) + albedo/rough functions
function bakeSet(w, h, common, texel, colBody, ormBody) {
  const pre = PER + common;
  return {
    col: K.bake(w, h, pre + `vec4 bake(vec2 uv){ ${colBody} }`),
    nrm: K.bake(w, h, pre + `vec4 bake(vec2 uv){ vec2 e=vec2(1./${w}.,1./${h}.); float c=H(uv), x=H(uv+vec2(e.x,0.)), y=H(uv+vec2(0.,e.y)), x2=H(uv-vec2(e.x,0.)), y2=H(uv-vec2(0.,e.y));
      vec3 n=normalize(vec3((x2-x)*.5/${texel.toFixed(6)}, (y2-y)*.5/${texel.toFixed(6)}, 1.)); return vec4(n*.5+.5,1.); }`),
    orm: K.bake(w, h, pre + `vec4 bake(vec2 uv){ ${ormBody} }`),
  };
}
let TX = null;
function bakeAll() {
  TX = {};
  // ---- weathered ashlar / paving: 4 m tile, 11 courses, honey-grey limestone, chipped arrises, lichen
  TX.stone = bakeSet(1024, 1024, /* glsl */`
    vec4 blk(vec2 uv){ vec2 p = uv*vec2(4.,4.); float row = floor(uv.y*11.); float rh = 4./11.;
      float n = floor(3. + kHash11(row*7.13)*4.); float L = 4./n; float off = kHash11(row*3.7)*L;
      float x = mod(p.x + off, 4.); float bi = floor(x/L); float lx = x - bi*L; float ly = p.y - row*rh;
      float ex = min(lx, L-lx), ey = min(ly, rh-ly); return vec4(min(ex,ey), kHash12(vec2(bi,row)), ex, ey); }
    float H(vec2 uv){ vec4 b = blk(uv); float ch = pf(uv, vec2(64.), 3);
      float edge = b.x - .006 - .018*ch; float bev = smoothstep(0., .035, edge);
      float h = mix(-.012, 0., bev) + .004*pf(uv+.3, vec2(24.), 5) + .002*(b.y-.5) + .0015*pf(uv, vec2(160.), 3);
      float pit = smoothstep(.62,.72, pf(uv+.7, vec2(96.), 3)); h -= pit*.0025; return h; }`, 4 / 1024,
    `vec4 b = blk(uv); float ch = pf(uv, vec2(64.), 3); float edge = b.x - .006 - .018*ch; float j = 1. - smoothstep(0., .02, edge);
     vec3 c = vec3(.56,.48,.37) * (.82 + .22*b.y) * vec3(1.+.06*(kHash11(b.y*91.)-.5), 1., 1.-.08*(kHash11(b.y*33.)-.5));
     float f = pf(uv, vec2(12.), 5), f2 = pf(uv+.5, vec2(48.), 4);
     c *= .82 + .36*f; c = mix(c, c*vec3(.72,.70,.66), smoothstep(.55,.75,f2));
     float li = smoothstep(.70,.74, pf(uv+.13, vec2(40.), 4)); c = mix(c, vec3(.62,.62,.55), li*.6);
     float lo = smoothstep(.73,.76, pf(uv+.61, vec2(56.), 4)); c = mix(c, vec3(.55,.30,.08), lo*.5);
     c = mix(c, c*.45, j*.8); return vec4(c, j);`,
    `vec4 b = blk(uv); float ch = pf(uv, vec2(64.), 3); float edge = b.x - .006 - .018*ch; float j = 1. - smoothstep(0., .03, edge);
     return vec4(1. - j*.7, .78 + .18*pf(uv, vec2(32.), 3), 0., 1.);`);
  // ---- lacquered wood: craquelure, chipped paint showing grey timber, grime (2 m tile)
  TX.wood = bakeSet(1024, 1024, /* glsl */`
    float chip(vec2 uv){ return smoothstep(.765, .78, pf(uv+.21, vec2(16.,32.), 6) + .1*pf(uv, vec2(80.,160.),2)); }
    float H(vec2 uv){ vec3 v = pvor(uv, vec2(96., 48.)); float crk = 1. - smoothstep(0., .06, v.y);
      float g = pf(uv*vec2(1.,1.), vec2(160., 6.), 4); float ch = chip(uv);
      return -crk*.0006 - ch*.0009 + ch*g*.0006 + .0002*pf(uv, vec2(64.),3); }`, 2 / 1024,
    `vec3 v = pvor(uv, vec2(96., 48.)); float crk = 1. - smoothstep(0., .06, v.y); float ch = chip(uv);
     float g = pf(uv, vec2(160., 6.), 4); float grime = pf(uv+.4, vec2(6.,3.), 5);
     return vec4(.88 + .2*pf(uv, vec2(24.,12.), 4) - crk*.18, ch, grime, g);`,
    `float ch = chip(uv); vec3 v = pvor(uv, vec2(96., 48.)); float crk = 1. - smoothstep(0., .06, v.y);
     return vec4(1.-crk*.5, mix(.32 + .14*pf(uv, vec2(20.), 4), .85, ch), 0., 1.);`);
  // ---- glazed roof tiles: 8 x 8 tiles per texture; pan channel across u, overlap steps along v
  TX.tile = bakeSet(1024, 1024, /* glsl */`
    float H(vec2 uv){ vec2 t = uv*8.; vec2 f = fract(t), id = floor(t);
      float x = f.x - .5; float pan = abs(x) < .32 ? -.022*cos(x/.32*1.5708) : 0.;
      float lip = f.y*.012 + .004*smoothstep(.0,.06,f.y) - .004; float ste = -.014*(1.-smoothstep(0.,.03,f.y));
      return pan + lip + ste + .0006*pf(uv, vec2(128.), 3); }`, (8 * 0.30) / 1024 * 0.5,
    `vec2 t = uv*8.; vec2 f = fract(t), id = floor(t); float hsh = kHash12(mod(id, 8.));
     vec3 c = mix(vec3(.018,.085,.060), vec3(.020,.105,.105), hsh) * (.75 + .5*kHash12(mod(id,8.)+3.1));
     float x = f.x - .5; float dust = smoothstep(.22, .0, abs(x)) * (.4 + .6*pf(uv, vec2(8., 64.), 4));
     float pool = smoothstep(.12, .0, f.y); c *= 1. - pool*.35; c *= 1. + .5*smoothstep(.85, 1., f.y);
     c = mix(c, vec3(.16,.15,.12), dust*.45*pf(uv+.2, vec2(4.,16.),4));
     float li = smoothstep(.74,.78, pf(uv+.33, vec2(64.), 4)); c = mix(c, vec3(.2,.2,.14), li*.5);
     return vec4(c, dust);`,
    `vec2 t = uv*8.; vec2 f = fract(t); float x = f.x - .5; float dust = smoothstep(.22, .0, abs(x)) * pf(uv+.2, vec2(4.,16.),4);
     float li = smoothstep(.72,.76, pf(uv+.33, vec2(64.), 4));
     return vec4(1. - .6*smoothstep(.1,0.,f.y), .14 + .5*dust + .5*li + .06*pf(uv, vec2(64.),3), 0., 1.);`);
  // ---- painted beams (u along the beam, v across): end bands, whirl-flower panels, central meander panel
  TX.paint = K.bake(2048, 256, PER + /* glsl */`
    vec3 BL = vec3(.016,.04,.15), GR = vec3(.02,.12,.07), GD = vec3(.70,.45,.12), WH = vec3(.62,.62,.56), BK = vec3(.02,.025,.03);
    float ring(float r, float a, float b, float w){ return step(abs(r - a), w) + step(abs(r - b), w); }
    vec3 whirl(vec2 q, vec3 bg, vec3 fg){ // q in units of half beam height; rosette radius 1
      float r = length(q), a = atan(q.y, q.x); vec3 c = bg;
      float pet = .5 + .5*cos(a*9.); float edgeO = .62 + .3*pet; float pet2 = .5 + .5*cos(a*9. + 3.1416); float edgeI = .32 + .18*pet2;
      if (r < .96) c = fg; if (r < edgeO) c = bg; if (r < edgeI) c = fg; if (r < .17) c = GD;
      if (abs(r - .96) < .04 || abs(r - edgeO) < .035 || abs(r - edgeI) < .03) c = WH;
      return c; }
    vec4 bake(vec2 uv){
      float u = uv.x < .5 ? uv.x : 1. - uv.x; float v = uv.y; float H = 16.; float x = u*H; // x in beam heights from the end
      vec2 p = vec2(x, (v - .5)); vec3 c = GR;
      float bd = abs(v - .5);
      if (x < .7) { c = x < .12 ? GD : (x < .35 ? BL : (x < .42 ? GD : GR)); if (bd > .4 && x > .12) c = GD; }
      else if (x < 3.2) { // zao-tou: one big whirl + two half whirls
        vec3 bg = GR, fg = BL; c = bg;
        vec2 q = vec2(x - 1.95, v - .5) / .46; c = whirl(q, bg, fg);
        vec2 q2 = vec2(x - 1.05, v - (v > .5 ? 1. : 0.)) / .42; if (length(q2) < 1.) c = whirl(q2, fg, bg);
        vec2 q3 = vec2(x - 2.85, v - (v > .5 ? 1. : 0.)) / .42; if (length(q3) < 1.) c = whirl(q3, fg, bg);
        if (abs(x - .74) < .04 || abs(x - 3.16) < .04) c = GD;
      } else { // fang-xin: long panel with pointed ends, gold border, cloud scroll
        float e = x - 3.2; float lim = .36 * smoothstep(0., .5, e); c = BL;
        if (bd < lim) { c = BK*.0 + vec3(.02,.05,.17); float sc = sin(x*5.2 + 1.7*sin(v*14.))*cos((v-.5)*15.); if (abs(sc) < .1 && bd < lim - .07) c = GD*.85;
          float sp = length(vec2(fract(x*.9)-.5, (v-.5)*1.8)); if (abs(sp - .22) < .025 && bd < lim - .07) c = GD; }
        if (abs(bd - lim) < .035) c = GD; if (abs(bd - lim - .06) < .02) c = WH;
      }
      if (bd > .46) c = GD*.75;
      float n = .88 + .22*pf(uv, vec2(64.,8.), 4); float fade = smoothstep(.55, .8, pf(uv+.3, vec2(24.,3.), 5));
      c = mix(c*n, vec3(.22,.2,.17), fade*.25);
      return vec4(c, 1.); }`);
  // ---- lattice door panel: frame, square-diamond lattice over paper, carved lower panel
  TX.lat = bakeSet(512, 1024, /* glsl */`
    float L(vec2 uv){ vec2 p = uv*vec2(1.,2.); // p: 1 x 2
      float fr = step(min(min(p.x, 1.-p.x), min(p.y, 2.-p.y)), .06);
      float rail = step(abs(p.y - .62), .04) + step(abs(p.y - 1.9), .03);
      float lat = 0.;
      if (p.y > .66 && p.y < 1.86) { vec2 q = (p - vec2(.5, 1.26))*6.; vec2 g = fract(q) - .5;
        float sq = step(.44, max(abs(g.x), abs(g.y)));                                   // square grid
        float coin = step(abs(length(g) - .36), .045);                                     // interlocking rings
        float cl = step(abs(length(g - vec2(.5,.5)) - .2), .04) * step(length(g), .62);    // cloud curls at the crossings
        lat = max(max(sq, coin), cl);
        vec2 m = (p - vec2(.5, 1.26)) * vec2(1., 1.); float rm = length(m*vec2(1.,1.3));     // central cloud medallion
        if (rm < .3) { lat = step(abs(rm - .27), .025) + step(abs(rm - .12), .03) + step(abs(fract(atan(m.y, m.x)/6.283*8.) - .5), .07) * step(.12, rm) ; lat = min(lat, 1.); } }
      float pnl = 0.; if (p.y < .58 && p.y > .1) { vec2 q = abs(p - vec2(.5,.34)); pnl = step(max(q.x/.32, q.y/.18), 1.) * (1. - step(max(q.x/.26, q.y/.13), 1.));
        float r = length((p - vec2(.5,.34))*vec2(1.,1.6)); pnl = max(pnl, step(abs(r - .11), .02) + step(abs(fract(atan(p.y-.34, p.x-.5)/6.283*6.)-.5), .08)*step(r,.1)); }
      return clamp(max(max(fr, rail), max(lat, pnl*.7)), 0., 1.); }
    float H(vec2 uv){ float l = L(uv); vec2 p = uv*vec2(1.,2.); float sol = (p.y < .62) ? .006 : 0.; return l*.012 + sol + .0004*pf(uv, vec2(32.,64.), 3); }`, 1.2 / 512,
    `float l = L(uv); vec2 p = uv*vec2(1.,2.); vec3 paper = vec3(.62,.55,.42)*(.85+.15*pf(uv,vec2(8.,16.),4)); vec3 wd = vec3(.40,.05,.025)*(.8+.3*pf(uv,vec2(16.,64.),4));
     vec3 c = p.y < .62 ? wd*.9 : mix(paper*.45, wd, l); if (l > .5 && p.y > .62) { float rm = length((p - vec2(.5,1.26))*vec2(1.,1.3)); if (rm < .3) c = vec3(.75,.5,.16); }
     if (p.y < .58 && p.y > .1 && l > .5) c = vec3(.72,.48,.15);
     return vec4(c, l);`,
    `float l = L(uv); return vec4(1., l > .5 ? .38 : .75, 0., 1.);`);
  // ---- carved balustrade relief panel (u along the panel, v up): frame + cloud-scroll medallion + corner curls
  TX.relief = bakeSet(512, 256, /* glsl */`
    float H(vec2 uv){ vec2 p = (uv - .5) * vec2(2., 1.);                // p.x -1..1, p.y -.5..5
      float fr = 1. - step(max(abs(p.x)/.94, abs(p.y)/.44), 1.);        // raised frame
      float rec = step(max(abs(p.x)/.86, abs(p.y)/.36), 1.);             // recessed field
      vec2 q = p * vec2(1., 1.); float r = length(q * vec2(.9, 1.5));
      float ang = atan(q.y, q.x); float sp = abs(fract(r * 5. - ang / 6.283 * 2.) - .5);
      float med = smoothstep(.36, .3, r) * smoothstep(.12, .3, .5 - sp * 1.0) ;            // spiral cloud scroll
      float cx = abs(p.x) - .62; vec2 qc = vec2(cx, p.y); float rc = length(qc * vec2(1.3, 1.6)); float ac = atan(qc.y, qc.x);
      float curl = smoothstep(.2, .16, rc) * smoothstep(.1, .3, .5 - abs(fract(rc * 7. - ac / 6.283) - .5));
      float leaf = smoothstep(.06, .0, abs(p.y - .18 * sin(p.x * 9.))) * step(.36, abs(p.x)) * step(abs(p.x), .5);
      float h = fr * .02 + rec * (-.012) + rec * (med + curl + leaf * .7) * .016;
      return h + .0015 * pf(uv, vec2(32., 16.), 4); }`, 1.0 / 512,
    `float h = H(uv); float rec = step(.0, -h - .006); vec3 c = vec3(.58,.53,.45) * (.85 + .2*pf(uv, vec2(16.,8.), 4));
     c *= .75 + 18. * clamp(h + .012, 0., .02); return vec4(c, clamp(rec * .7 + smoothstep(.0, -.012, h) * .5, 0., 1.));`,
    `float h = H(uv); return vec4(clamp(.6 + h * 25., .3, 1.), .85, 0., 1.);`);
  // ---- terrace paving: 4 m tile, running-bond slabs with worn edges, per-slab tone (alpha = joint)
  TX.pave = bakeSet(1024, 1024, /* glsl */`
    vec4 slab(vec2 uv){ vec2 p = uv * 4.; float row = floor(p.y / .66); float off = mod(row, 2.) * .5 * .95; float x = p.x + off; float col = floor(x / .95);
      vec2 l = vec2(x - col * .95, p.y - row * .66); float e = min(min(l.x, .95 - l.x), min(l.y, .66 - l.y)); return vec4(e, kHash12(mod(vec2(col, row), vec2(5., 7.)) + 3.1), l); }
    float H(vec2 uv){ vec4 b = slab(uv); float ch = pf(uv, vec2(48.), 3); float bev = smoothstep(.0, .03 + .02 * ch, b.x - .006);
      return mix(-.01, 0., bev) + .003 * pf(uv + .2, vec2(20.), 5) + .0015 * (b.y - .5) - .002 * smoothstep(.6, .75, pf(uv, vec2(64.), 3)); }`, 4 / 1024,
    `vec4 b = slab(uv); float ch = pf(uv, vec2(48.), 3); float j = 1. - smoothstep(.0, .022 + .02 * ch, b.x - .006);
     vec3 c = mix(vec3(.50,.47,.42), vec3(.58,.52,.43), b.y) * (.8 + .3 * pf(uv, vec2(10.), 5));
     c = mix(c, c * vec3(.78,.8,.82), smoothstep(.55,.8, pf(uv + .4, vec2(30.), 4)));
     float wear = smoothstep(.45, .8, pf(uv + .9, vec2(6.), 4)); c = mix(c, c * 1.15 + .03, wear * .5);
     c = mix(c, c * .4, j * .85); return vec4(c, j);`,
    `vec4 b = slab(uv); float j = 1. - smoothstep(.0, .03, b.x - .006); float wear = smoothstep(.45, .8, pf(uv + .9, vec2(6.), 4));
     return vec4(1. - j * .6, mix(.82, .55, wear) + .1 * pf(uv, vec2(32.), 3), 0., 1.);`);
  // ---- textile patterns: r = meander border, g = cloud scroll, b = weave
  TX.cloth = K.bake(256, 1024, PER + /* glsl */`
    vec4 bake(vec2 uv){ vec2 p = uv*vec2(1.,4.);
      float bx = min(uv.x, 1.-uv.x); float border = step(bx, .12)*step(.04, bx);
      vec2 q = vec2(bx*30., p.y*7.5); vec2 f = fract(q); float m = step(.3, f.x)*step(f.x, .7) + step(.3,f.y)*step(f.y,.7)*step(f.x,.3);
      float cl = 0.; vec2 c = vec2(uv.x-.5, fract(p.y*1.)-.5); float r = length(c*vec2(1.,.6)); float a = atan(c.y,c.x);
      cl = step(abs(fract(r*5. - a/6.283)-.5), .12)*step(r, .32);
      float w = .9 + .1*sin(uv.x*600.)*sin(uv.y*2400.);
      return vec4(border*clamp(m,0.,1.), cl, w, 1.); }`);
}

// ---------------------------------------------------------------- materials
let MAT = null;
const STONE_FRAG = /* glsl */`
  { vec4 sc = texture2D(map, vMapUv); float jn = sc.a;
    float north = clamp(-kN.z*.8 + kN.y*.45 - kN.x*.15, 0., 1.);
    float mn = texture2D(uNoiseTex, vWPos.xz*.031 + vWPos.y*.017).r;
    float moss = clamp(jn*(.25 + north*.9)*smoothstep(.35,.6,mn) + smoothstep(.6,.85, mn + north*.3)*.5*(1.-kN.y*.6), 0., 1.);
    float st = texture2D(uNoiseTex, vec2((vWPos.x+vWPos.z)*.21, vWPos.y*.012)).g; float vert = 1. - abs(kN.y);
    diffuseColor.rgb *= 1. - vert*.45*smoothstep(.45,.8, st) * (.6 + .4*north);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.05,.085,.025)*(.7+.6*mn), moss*.8);
    roughnessFactor = mix(roughnessFactor, 1., moss);
    float ao = clamp((vWPos.y - floor(vWPos.y/30.)*30.), 0., 1.);
  }`;
// edge highlight: worn, light-catching arrises (normal discontinuities), only near the camera
const EDGE = /* glsl */`{ float cvE = clamp(length(fwidth(kN)) * 2.2, 0., 1.) * smoothstep(40., 6., length(vWPos - cameraPosition));
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.7 + vec3(.035,.03,.02), cvE * .55); }`;
// fake bounce from the hanging lanterns (sites close to the camera): warm light that keeps soffits and brackets readable
const LANPARS = /* glsl */`\nuniform vec4 uLan[6];\n`;
const LANFRAG = /* glsl */`\n{ vec3 accL = vec3(0.); for (int i = 0; i < 6; i++) { vec3 d = uLan[i].xyz - vWPos; float dd = dot(d, d); float nd = dot(d * inversesqrt(dd + 1e-4), kN) * .55 + .45;
    accL += uLan[i].w * max(nd, 0.) / (.35 + dd); }
  float under = .55 + .45 * smoothstep(.1, -.6, kN.y);
  totalEmissiveRadiance += diffuseColor.rgb * vec3(1., .5, .24) * accL * under * (1.6 + 3.5 * uLit) + diffuseColor.rgb * vec3(.10, .085, .06) * smoothstep(.0, -.7, kN.y); }\n`;
const LANU = Array.from({ length: 6 }, () => new THREE.Vector4(0, -1e4, 0, 0));
// rope-bridge sway: lateral + vertical swing of the whole span, a pure function of time
const BRU = { uBA: { value: new V3() }, uBD: { value: new V3() }, uBL: { value: 1 }, uBS: { value: new V3() } };
const SWAYPARS = /* glsl */`\nuniform vec3 uBA, uBD, uBS; uniform float uBL;\nvec3 bSway(vec3 wp){ float u = clamp(dot(wp - uBA, uBD) / uBL, 0., 1.); float b = sin(3.14159 * u);
  float sw = .32*sin(uTime*.85) + .1*sin(uTime*2.1 + 1.3) + .05*sin(uTime*3.7 + u*9.);
  return uBS * sw * b + vec3(0., -.14*sin(uTime*1.15 + .6) * b - .05*sin(uTime*2.6 + u*12.) * b, 0.); }\n`;
let DEFS = {};
// film-wide state shared by every arch material: uLit = K.env.lanterns (0 by day -> 1 at dusk)
const ARCHU = { uLit: { value: 0 } };
// wet surfaces (uEnv.y) go darker and glossy with running sheen; lantern light pools from a per-vertex light term (aLit)
const ENVCHUNK = /* glsl */`
{ float up = smoothstep(-.3, .7, kN.y), wetK = uEnv.y * (.3 + .7 * up);
  diffuseColor.rgb *= 1. - .4 * wetK;
  float runS = texture2D(uNoiseTex, vec2((vWPos.x + vWPos.z) * .35, vWPos.y * .06 + uTime * .45)).a;
  float pud = texture2D(uNoiseTex, vWPos.xz * .07).r;
  roughnessFactor = mix(roughnessFactor, mix(.42 - .22 * smoothstep(.45, .7, runS), .16 - .12 * smoothstep(.5, .65, pud), up), wetK * .85);
  totalEmissiveRadiance += diffuseColor.rgb * vec3(1., .46, .18) * vLit * uLit * 3.2; }
`;
const LITM = ['stone', 'wood', 'paint', 'tile', 'metal', 'lattice', 'lat', 'relief', 'pave', 'glaze'];
const defMat = d => { const k = d.key.replace('arch', '').toLowerCase();
  if (LITM.includes(k)) { d.uniforms = Object.assign({}, d.uniforms || {}, ARCHU);
    d.vertPars = (d.vertPars || '') + '\nattribute float aLit; varying float vLit;\n'; d.vert = (d.vert || '') + '\nvLit = aLit;\n';
    d.fragPars = (d.fragPars || '') + '\nuniform float uLit; varying float vLit;\n'; d.frag = (d.frag || '') + ENVCHUNK; }
  DEFS[k] = d; return K.mat(d); };
const MATV = {};
function matVariant(name, kind) {
  const id = name + ':' + kind; if (MATV[id]) return MATV[id];
  const d = DEFS[name] || DEFS[{ lattice: 'lat' }[name]]; if (!d) return MAT[name];
  const o = Object.assign({}, d, { key: d.key + kind });
  if (kind === 'L') { o.uniforms = Object.assign({}, d.uniforms || {}, { uLan: { value: LANU } }, ARCHU); o.fragPars = (d.fragPars || '') + LANPARS; o.frag = (d.frag || '') + LANFRAG; }
  if (kind === 'B') { o.uniforms = Object.assign({}, d.uniforms || {}, BRU); o.vertPars = (d.vertPars || '') + SWAYPARS;
    o.vert = name === 'glow' ? (d.vert || '') + `\n{ vec3 ip2 = instanceMatrix[3].xyz; transformed += bSway(ip2) / length(instanceMatrix[0].xyz); }`
      : (d.vert || '') + `\n{ transformed += bSway((modelMatrix * vec4(transformed, 1.)).xyz); }`; }
  return (MATV[id] = K.mat(o));
}
function makeMats() {
  const nrmS = new THREE.Vector2(1, 1);
  MAT = {}; DEFS = {};
  MAT.stone = defMat({ key: 'archStone', vertexColors: true, map: TX.stone.col, normalMap: TX.stone.nrm, normalScale: new THREE.Vector2(1.6, 1.6), roughnessMap: TX.stone.orm, aoMap: TX.stone.orm, aoMapIntensity: 1, roughness: 1, metalness: 0, frag: STONE_FRAG });
  MAT.wood = defMat({ key: 'archWood', vertexColors: true, normalMap: TX.wood.nrm, normalScale: new THREE.Vector2(1.2, 1.2), roughnessMap: TX.wood.orm, roughness: 1, metalness: 0,
    uniforms: { tWD: { value: TX.wood.col } }, fragPars: 'uniform sampler2D tWD;',
    frag: /* glsl */`{ vec4 wd = texture2D(tWD, vNormalMapUv); vec3 base = diffuseColor.rgb; float lum = dot(base, vec3(.3,.5,.2));
      vec3 bare = vec3(.30,.25,.20) * (.7 + .5*wd.a);
      float chipK = wd.g * smoothstep(.02, .12, lum) * smoothstep(.35, .7, texture2D(uNoiseTex, vWPos.xz*.05+vWPos.y*.03).r + (1. - smoothstep(0., 1.2, abs(vWPos.y - floor(vWPos.y/60.)*60.)))*0.);
      chipK *= smoothstep(.08, .25, base.r - base.g); diffuseColor.rgb = mix(base * wd.r, bare, chipK);
      float grime = smoothstep(.45, .8, wd.b) * (1. - abs(kN.y)*.5); diffuseColor.rgb *= 1. - grime*.35;
      float st = texture2D(uNoiseTex, vec2((vWPos.x+vWPos.z)*.4, vWPos.y*.03)).g; diffuseColor.rgb *= 1. - (1.-abs(kN.y))*.25*smoothstep(.55,.85,st); ${EDGE} }` });
  MAT.paint = defMat({ key: 'archPaint', map: TX.paint, normalMap: TX.wood.nrm, roughness: .55, metalness: 0,
    frag: /* glsl */`{ ${EDGE} float g = texture2D(uNoiseTex, vWPos.xz*.07 + vWPos.y*.05).r; diffuseColor.rgb *= .8 + .35*g; float fade = smoothstep(.55,.8, texture2D(uNoiseTex, vWPos.xy*.13+vWPos.z*.1).a); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.28,.25,.2), fade*.35); }` });
  MAT.tile = defMat({ key: 'archTile', vertexColors: true, map: TX.tile.col, normalMap: TX.tile.nrm, normalScale: new THREE.Vector2(1.4, 1.4), roughnessMap: TX.tile.orm, roughness: 1, metalness: 0, envMapIntensity: 1.25,
    frag: /* glsl */`{ float mn = texture2D(uNoiseTex, vWPos.xz*.05).r; float lich = smoothstep(.62,.8, mn) * smoothstep(.0,.6, kN.y);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.24,.25,.17), lich*.5); roughnessFactor = mix(roughnessFactor, .8, lich*.6); }` });
  MAT.metal = defMat({ key: 'archMetal', vertexColors: true, roughness: .32, metalness: 1, envMapIntensity: 1.2,
    frag: /* glsl */`{ float n = texture2D(uNoiseTex, vWPos.xz*.9 + vWPos.y*.7).r; float n2 = texture2D(uNoiseTex, vWPos.xy*2.3 + vWPos.z*.5).a;
      float bronze = step(diffuseColor.r, .6); float ver = bronze * smoothstep(.6,.8, n + (1.-abs(kN.y))*.08);
      diffuseColor.rgb = mix(diffuseColor.rgb*(.8+.4*n2), vec3(.12,.28,.22), ver*.8); metalnessFactor = 1. - ver*.9;
      roughnessFactor = mix(.22 + .35*n2, .8, ver) + bronze*.12; }` });
  MAT.lattice = defMat({ key: 'archLat', vertexColors: true, map: TX.lat.col, normalMap: TX.lat.nrm, roughnessMap: TX.lat.orm, roughness: 1, metalness: 0,
    frag: /* glsl */`{ vec4 lt = texture2D(map, vMapUv); float paper = (1. - lt.a) * smoothstep(.12, .0, lt.r - lt.g) * step(vColor.r, 1.2); totalEmissiveRadiance += vec3(1., .55, .22) * paper * uLit * 2.4 * (.8 + .2 * texture2D(uNoiseTex, vWPos.xy * .3 + uTime * .05).r); }` });
  MAT.cloth = defMat({ key: 'archCloth', vertexColors: true, side: THREE.DoubleSide, map: TX.cloth, roughness: .75, metalness: 0,
    vertPars: 'attribute vec2 aF;',
    vert: /* glsl */`{ float f = aF.x; vec2 wd = normalize(uWind.xy + 1e-4); float w = .35 + uWind.z + uEnv.x * 1.4;
      float ph = aF.y*6.283; float wave = sin(uTime*(4.5+2.*w) - f*7. + ph + position.y*.9) + .5*sin(uTime*(7.3 + 6.*uEnv.x) - f*13. + ph*2.) + uEnv.x * .6 * sin(uTime*17. - f*21. + ph*3.);
      vec3 pn = normalize(normal + vec3(1e-4));
      transformed += pn * wave * .13 * f * (.4 + w);
      transformed.xz += wd * f*f * .45 * w; transformed.y += f*f*.12*w*sin(uTime*1.3+ph); }`,
    frag: /* glsl */`{ vec4 pt = texture2D(map, vMapUv); diffuseColor.rgb = vColor.rgb * pt.b;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.9,.62,.2), max(pt.r, pt.g)*(vColor.g > .6 ? .0 : 1.));
      totalEmissiveRadiance += diffuseColor.rgb * kTrans(kN, kV) * uSunCol * .35; diffuseColor.rgb *= 1. - .35 * uEnv.y; }` });
  MAT.relief = defMat({ key: 'archRelief', vertexColors: true, map: TX.relief.col, normalMap: TX.relief.nrm, normalScale: new THREE.Vector2(2.2, 2.2), roughnessMap: TX.relief.orm, roughness: 1, metalness: 0, frag: STONE_FRAG });
  MAT.pave = defMat({ key: 'archPave', vertexColors: true, map: TX.pave.col, normalMap: TX.pave.nrm, normalScale: new THREE.Vector2(1.6, 1.6), roughnessMap: TX.pave.orm, roughness: 1, metalness: 0,
    uniforms: { uMed: { value: new THREE.Vector3(0, 0, 0) } }, fragPars: 'uniform vec3 uMed;',
    frag: STONE_FRAG + /* glsl */`{ vec2 q = vWPos.xz - uMed.xy; float r = length(q), a = atan(q.y, q.x); float R = uMed.z;
      float h = 0.;
      if (r < R) { float u = r / R;
        h += smoothstep(.03, .0, abs(u - 1.) - .015) + smoothstep(.03, .0, abs(u - .93) - .006);                  // outer rings
        float pet = .5 + .5 * cos(a * 12.); float pr = .62 + .25 * pet; h += smoothstep(.025, .0, abs(u - pr) - .01) * step(.55, u);  // lotus petals
        float pet2 = .5 + .5 * cos(a * 12. + 3.1416); h += smoothstep(.02, .0, abs(u - (.5 + .1 * pet2)) - .008) * step(.38, u);
        float sp = abs(fract(u * 4.2 - a / 6.283 * 3.) - .5); h += smoothstep(.12, .05, sp) * step(u, .36);          // cloud spiral centre
        h += smoothstep(.02, .0, abs(u - .37) - .008);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.62,.58,.5), .45) ;
        diffuseColor.rgb *= 1. - h * .35; normal = kBump(-vViewPosition, normal, -h * .02, 1.); }
    }` });
  MAT.glaze = defMat({ key: 'archGlaze', vertexColors: true, roughness: .12, metalness: 0, envMapIntensity: 1.4,
    frag: /* glsl */`{ float n = texture2D(uNoiseTex, vWPos.xz * 2.1 + vWPos.y * 1.7).a; diffuseColor.rgb *= .85 + .3 * n; float cr = smoothstep(.62, .66, texture2D(uNoiseTex, vWPos.xy * 3.3 + vWPos.z).g); diffuseColor.rgb *= 1. - cr * .3; ${EDGE} }` });
  MAT.flame = K.mat({ key: 'archFlame', vertexColors: true, color: 0x000000, roughness: 1, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, uniforms: ARCHU, fragPars: 'uniform float uLit;',
    vert: /* glsl */`{ float ph = dot(position.xz, vec2(3.1, 1.7)); transformed.x += sin(uTime * 9. + ph + position.y * 6.) * .03 * vColor.g; transformed.z += cos(uTime * 7. + ph + position.y * 5.) * .03 * vColor.g; }`,
    fragEnd: /* glsl */`{ float fr = pow(max(dot(kN, kV), 0.), 1.5); float fl = .7 + .3 * texture2D(uNoiseTex, vec2(vWPos.x * .7 + uTime * 1.9, vWPos.y * .9 - uTime * 2.3)).r;
      float k = mix(vColor.r, 1.4, uLit) * fl * fr; gl_FragColor = vec4(vec3(3.2, 1.25, .32) * k * (1. - kFogAmt(vWPos) * .8), 1.); }` });
  // instanced lanterns / chimes: hang from the instance origin and swing (stateless)
  const swing = /* glsl */`
    vec3 ip = instanceMatrix[3].xyz; float ph = fract(sin(dot(ip.xz, vec2(12.9898,78.233)))*43758.5453)*6.283;
    float w = .3 + uWind.z + uEnv.x * 1.6; float ax = sin(uTime*(1.7 + uEnv.x*1.5) + ph)*.07*w + sin(uTime*2.9+ph*1.7)*.03*w, az = cos(uTime*1.3 + ph*1.3)*.06*w;
    mat3 RX = mat3(1.,0.,0., 0.,cos(ax),sin(ax), 0.,-sin(ax),cos(ax)); mat3 RZ = mat3(cos(az),sin(az),0., -sin(az),cos(az),0., 0.,0.,1.);`;
  MAT.glow = defMat({ key: 'archGlow', vertexColors: true, roughness: .6, metalness: 0,
    vertPars: 'attribute float aK; varying float vK; varying float vRib;',
    vertNormal: `{ ${swing} objectNormal = RZ*RX*objectNormal; }`,
    vert: `{ ${swing} transformed = RZ*RX*transformed; vK = aK; vRib = atan(position.z, position.x); }`,
    uniforms: ARCHU, fragPars: 'uniform float uLit; varying float vK; varying float vRib;',
    frag: /* glsl */`{ if (vK < .5) { float rib = .75 + .25*smoothstep(.0,.4, abs(sin(vRib*8.)));
        diffuseColor.rgb *= rib; totalEmissiveRadiance += vec3(1., .07 + .1 * uLit, .018) * (.55 + .8*kTrans(kN, kV)) * rib * (1.15 + 2.6 * uLit) + vec3(1., .35, .08) * .25 * pow(max(dot(kN, kV), 0.), 3.); roughnessFactor = .55; }
      else if (vK < 1.5) { metalnessFactor = 1.; roughnessFactor = .3; }
      else { roughnessFactor = .8; } }` });
  // prayer wheels: instanced drums spinning about their own axis
  MAT.wheel = defMat({ key: 'archWheel', vertexColors: true, roughness: .35, metalness: .85,
    vertPars: 'varying float vAng;',
    vertNormal: `{ vec3 ip = instanceMatrix[3].xyz; float a = uTime*(.8 + fract(ip.x*3.1+ip.z*1.7)*1.4) + ip.x*7.; float c = cos(a), s = sin(a); objectNormal.xz = mat2(c,s,-s,c)*objectNormal.xz; }`,
    vert: `{ vec3 ip = instanceMatrix[3].xyz; float a = uTime*(.8 + fract(ip.x*3.1+ip.z*1.7)*1.4) + ip.x*7.; float c = cos(a), s = sin(a); transformed.xz = mat2(c,s,-s,c)*transformed.xz; vAng = atan(position.z, position.x); }`,
    fragPars: 'varying float vAng;',
    frag: /* glsl */`{ float y = vOPos.y; float band = step(.5, fract(y*9.)); float m = step(.82, abs(sin(vAng*6. + y*14.))) * step(abs(y - .22), .1);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.8,.12,.05), band*step(abs(y-.22),.14)*.0 + m*.0);
      float rel = abs(sin(vAng*5. + floor(y*8.)*1.3)); diffuseColor.rgb *= .75 + .35*smoothstep(.3,.9,rel)*step(.05, y)*step(y,.4); }` });
}

// ---------------------------------------------------------------- geometry buckets
const BK = {}; let SITE = 'misc';
let XF = new M4(); const STK = [];
const _q = new QT(), _e = new THREE.Euler(), _v = new V3(), _s = new V3();
const mk = (x, y, z, ry = 0, sx = 1, sy = sx, sz = sx, rx = 0, rz = 0) => new M4().compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz));
function push(x, y, z, ry = 0, s = 1) { STK.push(XF.clone()); XF.multiply(mk(x, y, z, ry, s)); }
function pop() { XF = STK.pop(); }
function wp(x, y, z) { return new V3(x, y, z).applyMatrix4(XF); }          // local -> world
function prep(g, col) {
  if (!g.index) { const n = g.attributes.position.count, ix = new Uint32Array(n); for (let i = 0; i < n; i++) ix[i] = i; g.setIndex(new THREE.BufferAttribute(ix, 1)); }
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color', 'aF'].includes(k)) g.deleteAttribute(k);
  if (col) K.tint(g, col[0], col[1], col[2]); else if (!g.attributes.color) K.tint(g, 1, 1, 1);
  return g;
}
// put a geometry (local coords, optional extra matrix) into material bucket of the current site
function put(mat, g, col, m) {
  prep(g, col); const M = m ? XF.clone().multiply(m) : XF; g.applyMatrix4(M);
  if (DBG) { const a = g.attributes.position.array, nn = g.attributes.normal.array; for (let i = 0; i < a.length; i++) if (!isFinite(a[i]) || !isFinite(nn[i])) { console.warn('NaN geo', SITE, mat, new Error().stack.split('\n').slice(2, 4).join(' | ')); break; } }
  const b = BK[SITE] || (BK[SITE] = {}); (b[mat] || (b[mat] = [])).push(g); return g;
}
function mergeIdx(geos, withF) {
  let vc = 0, ic = 0; for (const g of geos) { vc += g.attributes.position.count; ic += g.index.count; }
  const out = new THREE.BufferGeometry(); const names = ['position', 'normal', 'uv', 'color'].concat(withF ? ['aF'] : []);
  for (const n of names) { const is = n === 'uv' || n === 'aF' ? 2 : 3, arr = new Float32Array(vc * is); let o = 0; for (const g of geos) { const a = g.attributes[n]; if (a) arr.set(a.array, o); o += g.attributes.position.count * is; } out.setAttribute(n, new THREE.BufferAttribute(arr, is)); }
  const idx = new Uint32Array(ic); let o = 0, vo = 0; for (const g of geos) { const a = g.index.array; for (let i = 0; i < a.length; i++) idx[o + i] = a[i] + vo; o += a.length; vo += g.attributes.position.count; }
  out.setIndex(new THREE.BufferAttribute(idx, 1)); return out;
}
// world box-projection UVs (texture world size sz metres)
function worldUV(g, sz, szTop = sz) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) { const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i)); let u, v;
    if (ay >= ax && ay >= az) { uv.setXY(i, p.getX(i) / szTop, p.getZ(i) / szTop); continue; } else if (ax >= az) { u = p.getZ(i); v = p.getY(i); } else { u = p.getX(i); v = p.getY(i); }
    uv.setXY(i, u / sz, v / sz); }
}

// ---------------------------------------------------------------- primitive geometry
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, n = 12, open = false) => new THREE.CylinderGeometry(rt, rb, h, n, 1, open);
const lathe = (pts, n = 16) => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), n);
const sph = (r, a = 10, b = 8) => new THREE.SphereGeometry(r, a, b);
// tapered box (bottom scaled by tb), origin at bottom centre
function tbox(w, h, d, tb = 0.7) { const g = box(w, h, d); g.translate(0, h / 2, 0); const p = g.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) < h * 0.5) { p.setX(i, p.getX(i) * tb); p.setZ(i, p.getZ(i) * tb); } g.computeVertexNormals(); return g; }
// sweep a 2D profile [[x,y]...] (x = side, y = up) along a path of V3; up hint default world up. uv: u = profile index frac, v = arc length * vs
function sweep(path, prof, o = {}) {
  const n = path.length, m = prof.length, pos = [], uvs = [], idx = []; const up = o.up || new V3(0, 1, 0);
  const T = new V3(), Sd = new V3(), N = new V3(); let L = 0;
  for (let i = 0; i < n; i++) {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)]; T.subVectors(b, a).normalize();
    const u = o.ups ? o.ups[i] : up; Sd.crossVectors(T, u); if (Sd.lengthSq() < 1e-8) Sd.set(1, 0, 0); Sd.normalize(); N.crossVectors(Sd, T).normalize();
    if (i) L += path[i].distanceTo(path[i - 1]); const sc = o.scale ? o.scale(i / (n - 1)) : 1;
    for (let j = 0; j < m; j++) { const px = prof[j][0] * sc, py = prof[j][1] * sc; pos.push(path[i].x + Sd.x * px + N.x * py, path[i].y + Sd.y * px + N.y * py, path[i].z + Sd.z * px + N.z * py); uvs.push(j / (m - 1) * (o.us || 1), L * (o.vs || 1)); }
  }
  const mm = o.closed ? m : m - 1;
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < mm; j++) { const j2 = (j + 1) % m, a = i * m + j, b = i * m + j2, c = (i + 1) * m + j, d = (i + 1) * m + j2; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(idx); g.computeVertexNormals();
  if (o.flip) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); }
  return g;
}
const circ = (r, n = 8) => { const o = []; for (let i = 0; i <= n; i++) { const a = i / n * TAU; o.push([Math.cos(a) * r, Math.sin(a) * r]); } return o; };
// grid surface from a function f(i/nu, j/nv) -> [x,y,z]
function grid(nu, nv, f, uvf) {
  const pos = [], uvs = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const p = f(i / nu, j / nv); pos.push(p[0], p[1], p[2]); const t = uvf ? uvf(i / nu, j / nv, p) : [i / nu, j / nv]; uvs.push(t[0], t[1]); }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
function flipG(g) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); return g; }
// a beam from a to b (world or local points), rectangular w x h, painted uv along length
function beamAB(a, b, w, h, roll = 0) {
  const d = new V3().subVectors(b, a), L = d.length(); const g = box(L, h, w);
  const m = new M4(); const yaw = Math.atan2(-d.z, d.x), pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
  m.compose(new V3().addVectors(a, b).multiplyScalar(.5), new QT().setFromEuler(new THREE.Euler(roll, yaw, pitch, 'YZX')), new V3(1, 1, 1)); g.applyMatrix4(m); return g;
}
function rodAB(a, b, r, n = 6) { const d = new V3().subVectors(b, a), L = d.length(); const g = cyl(r, r, L, n, true); g.applyMatrix4(new M4().compose(new V3().addVectors(a, b).multiplyScalar(.5), new QT().setFromUnitVectors(new V3(0, 1, 0), d.normalize()), new V3(1, 1, 1))); return g; }
// catenary-ish sag points between a and b
function sag(a, b, s, n) { const o = []; for (let i = 0; i <= n; i++) { const t = i / n; o.push(new V3().lerpVectors(a, b, t).add(new V3(0, -s * 4 * t * (1 - t), 0))); } return o; }

// ---------------------------------------------------------------- ornaments
const LANT = []; const CHIME = []; const LIGHTX = [];
function lantern(p, s = 1, col) { LANT.push({ p: p.clone(), s, col, b: SITE === 'bridge' }); ARCH.lanterns.push({ pos: p.clone().add(new V3(0, -0.45 * s, 0)), s }); }
function chime(p, s = 1) { CHIME.push({ p: p.clone(), s }); ARCH.chimes.push(p.clone()); }
// gold finial (stack of discs, pearl, spike) at local origin
function finial(h = 1.6, s = 1) {
  const pts = [[0, 0], [.28, 0], [.3, .08], [.18, .14], [.24, .26], [.12, .36], [.2, .5], [.08, .6], [.16, .7], [.06, .82], [.12, .9], [.04, 1]].map(p => [p[0] * h * .45 * s, p[1] * h]);
  put('metal', lathe(pts, 12), C.gold); put('metal', sph(h * .07 * s, 10, 8), C.gold, mk(0, h * 1.02, 0));
}
// dragon-fish ridge finial (chiwen): upright body with a tail curling back over the ridge; facing -x by default (sits at ridge end)
function chiwen(s = 1, dir = 1) {
  const path = []; for (let i = 0; i <= 14; i++) { const t = i / 14, a = t * PI * 1.25; path.push(new V3(dir * (-.15 + Math.sin(a) * .45 * (1 - t * .3)) * s, (.05 + (1 - Math.cos(a)) * .55 + t * .25) * s, 0)); }
  const prof = [[-.11, -.11], [.11, -.11], [.13, .08], [0, .16], [-.13, .08], [-.11, -.11]];
  put('tile', sweep(path, prof, { scale: t => 1.25 - t * .75, up: new V3(0, 0, 1) }), [1.1, 1.25, 1.1]);
  put('tile', tbox(.34 * s, .5 * s, .24 * s, .85), [1.1, 1.25, 1.1], mk(-dir * .05 * s, 0, 0));
  put('metal', sph(.07 * s), C.gold, mk(-dir * .2 * s, .38 * s, .1 * s)); put('metal', sph(.07 * s), C.gold, mk(-dir * .2 * s, .38 * s, -.1 * s));
  for (let k = 0; k < 4; k++) put('metal', cyl(.0, .05 * s, .3 * s, 5), C.gold, mk(dir * (.1 + k * .12) * s, (.45 + k * .1) * s, 0, 0, 1, 1, 1, 0, -dir * (0.6 + k * .2)));
}
// small seated ridge beast (stylised)
function beast(s = 1, col = C.tileY) {
  if (isFar()) { put('tile', box(.12 * s, .26 * s, .2 * s), col, mk(0, .13 * s, 0)); return; }
  put('tile', tbox(.12 * s, .16 * s, .22 * s, 1.1), col); put('tile', sph(.075 * s, 8, 6), col, mk(0, .2 * s, .08 * s)); put('tile', cyl(.0, .03 * s, .1 * s, 4), col, mk(0, .27 * s, .1 * s));
}
// bracket set (dougong). origin: top of plate, outward +z. s = module scale (1 ~ 0.9 m tall)
const DG = {};
// arm: box of length L (x), height h, depth d with the lower ends chamfered (curved-arm silhouette), bottom at y=0
function armGeo(L, h, d, curved) {
  if (!curved) { const g = box(L, h, d); g.translate(0, h / 2, 0); const p = g.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) < h * .5) p.setX(i, p.getX(i) - Math.sign(p.getX(i)) * h * .45); g.computeVertexNormals(); return g; }
  // gong: flat top, the lower ends rolled in four facets (juansha), a small notch cut in the top for the bearing blocks
  const sh = new THREE.Shape(), r = h * .95, x0 = L / 2;
  sh.moveTo(-x0, h); sh.lineTo(-x0, h * .55);
  for (let k = 1; k <= 4; k++) { const a = k / 4 * PI / 2; sh.lineTo(-x0 + r * (1 - Math.cos(a)) * 1.1, h * .55 * (1 - Math.sin(a))); }
  for (let k = 0; k <= 4; k++) { const a = (4 - k) / 4 * PI / 2; sh.lineTo(x0 - r * (1 - Math.cos(a)) * 1.1, h * .55 * (1 - Math.sin(a))); }
  sh.lineTo(x0, h); sh.lineTo(-x0, h);
  const g = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: true, bevelThickness: .012, bevelSize: .012, bevelSegments: 1, curveSegments: 1 }); g.translate(0, 0, -d / 2); return g;
}
function dougongGeo(lod) {
  if (DG[lod]) return DG[lod];
  const parts = []; const add = (g, col, m) => { if (m) g.applyMatrix4(m); parts.push(prep(g, col)); };
  const cv = lod >= 2;
  const arm = (L, h, d, col, m) => { add(armGeo(L, h, d, cv), col, m); if (cv) { for (const sx of [-1, 1]) add(box(.012, h * .5, d + .01), C.gold, m.clone().multiply(mk(sx * (L / 2 - .02), h * .72, 0))); add(box(L * .7, .012, d + .012), [.6, .6, .55], m.clone().multiply(mk(0, h * .96, 0))); } };
  const G = [0.03, 0.19, 0.12], Bl = [0.03, 0.075, 0.26], Gd = C.gold;
  const blk = (w, h, m, col = G) => { add(tbox(w, h, w, .72), col, m); if (cv) add(box(w * 1.02, .014, w * 1.02), Gd, m.clone().multiply(mk(0, h * .98, 0))); };
  blk(.36, .22, new M4());
  arm(1.0, .16, .12, Bl, mk(0, .16, 0)); arm(.8, .16, .12, G, mk(0, .16, .12, PI / 2));
  // cantilever (ang) with a carved beak and a gilded tip
  { const a = new V3(0, 1.0, -.35), b = new V3(0, .56, 1.1); add(beamAB(a, b, .13, .17), Bl);
    if (cv) { add(beamAB(new V3(0, .64, .9), new V3(0, .5, 1.28), .135, .1), Gd); add(sph(.06, 6, 4), Gd, mk(0, .5, 1.3)); }
    else add(box(.14, .05, .22), Gd, mk(0, .55, 1.17, 0, 1, 1, 1, .45)); }
  arm(1.6, .18, .12, Bl, mk(0, .72, 0));
  add(box(2.0, .2, .16), G, mk(0, .96, 0)); add(box(1.8, .16, .14), Bl, mk(0, .97, .72));
  if (lod >= 2) {
    for (const x of [-.42, .42]) blk(.19, .12, mk(x, .32, 0));
    blk(.19, .12, mk(0, .32, .42));
    arm(1.35, .16, .12, G, mk(0, .44, 0)); arm(.95, .16, .12, Bl, mk(0, .44, .42)); arm(1.0, .16, .12, Bl, mk(0, .44, .2, PI / 2));
    for (const x of [-.6, .6]) blk(.19, .12, mk(x, .6, 0), Bl);
    for (const x of [-.4, .4, 0]) blk(.19, .12, mk(x, .6, .42));
    arm(1.2, .18, .12, G, mk(0, .72, .72));
    for (const x of [-.6, .6, 0]) blk(.18, .1, mk(x, .88, .72), Bl);
    // carved cloud-head ends on the projecting arms (huatou): a gilded scroll disc
    for (const z of [.5, .92]) add(cyl(.07, .07, .125, 10), Gd, mk(0, z > .6 ? .78 : .5, z, 0, 1, 1, 1, PI / 2));
    // white + gold line-work along the tie beams
    add(box(2.0, .014, .165), Gd, mk(0, 1.06, 0)); add(box(2.0, .014, .165), [.7, .7, .64], mk(0, .87, 0)); add(box(1.8, .014, .145), Gd, mk(0, 1.05, .72));
  }
  DG[lod] = mergeIdx(parts); return DG[lod];
}
let DGLOD = 2;
function dougongTiny() { if (DG.t) return DG.t; const parts = [prep(tbox(.36, .22, .36, .72), [0.03, 0.19, 0.12]), prep(box(1.4, .5, .3).translate(0, .5, .2), [0.03, 0.075, 0.26]), prep(box(2.0, .22, .16).translate(0, .95, 0), [0.03, 0.19, 0.12])]; return (DG.t = mergeIdx(parts)); }
let DGFORCE = false;
function dougong(x, y, z, ry, s = 1) { if (DGLOD < 0) return; put('wood', (isFar() && !DGFORCE ? dougongTiny() : dougongGeo(DGLOD)).clone(), null, mk(x, y, z, ry, s)); }
// ---------------------------------------------------------------- ROOF GENERATOR
// o: poly [[x,z]..] convex (local), y0 eave height, H rise at full depth, gable (depth, hip-and-gable), dTop (cut depth),
//    lift, flare, P tile pitch, det 0..2, over (overhang beyond the column line, for soffit/rafters), ridge (h), tipLen
function roof(o) {
  const poly = o.poly, n = poly.length, P = o.P || 0.3, det = o.det ?? 1;
  let cx = 0, cz = 0; for (const p of poly) { cx += p[0] / n; cz += p[1] / n; }
  const E = []; let maxLen = 0;
  for (let i = 0; i < n; i++) { const a = poly[i], b = poly[(i + 1) % n]; const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); const dir = [dx / L, dz / L]; let nr = [dir[1], -dir[0]];
    if ((a[0] - cx) * nr[0] + (a[1] - cz) * nr[1] < 0) nr = [-nr[0], -nr[1]]; E.push({ a, b, L, dir, n: nr }); maxLen = Math.max(maxLen, L); }
  let D = 1e9; for (const e of E) D = Math.min(D, (e.a[0] - cx) * e.n[0] + (e.a[1] - cz) * e.n[1]);
  if (o.D) D = o.D;
  const bis = []; for (let i = 0; i < n; i++) { const na = E[(i - 1 + n) % n].n, nb = E[i].n, k = 1 + na[0] * nb[0] + na[1] * nb[1]; bis.push([-(na[0] + nb[0]) / k, -(na[1] + nb[1]) / k]); }
  const gable = o.gable || 0; for (const e of E) e.end = gable > 0 && e.L < maxLen - 1e-3;
  const dmax = j => E[j].end ? gable : (o.dTop ?? D);
  const H = o.H, Fd = d => { const x = Math.min(d / D, 1); return H * (0.28 * x + 0.72 * Math.pow(Math.max(x, 0), 2.1)); };
  const liftD = o.liftD || D * 0.75; let minL = 1e9; for (const e of E) minL = Math.min(minL, e.L);
  const Lc = o.liftL || Math.min(minL * 0.5, 7);
  const hF = d => Math.pow(Math.max(0, 1 - d / liftD), 1.6), qF = e => Math.pow(Math.max(0, 1 - e / Lc), 2.0);
  const cornerAt = (i, d) => [poly[i][0] + bis[i][0] * d, poly[i][1] + bis[i][1] * d];
  const bounds = (j, d) => { const e = E[j]; const dd = (gable && !e.end) ? Math.min(d, gable) : d; const cl = cornerAt(j, dd), cr = cornerAt((j + 1) % n, dd);
    return [(cl[0] - e.a[0]) * e.dir[0] + (cl[1] - e.a[1]) * e.dir[1], (cr[0] - e.a[0]) * e.dir[0] + (cr[1] - e.a[1]) * e.dir[1]]; };
  const lift = o.lift ?? 0.8, flare = o.flare ?? 0.5;
  const pt = (j, s, d) => { const e = E[j]; let x = e.a[0] + e.dir[0] * s - e.n[0] * d, z = e.a[1] + e.dir[1] * s - e.n[1] * d;
    const bb = bounds(j, d); const eL = s - bb[0], eR = bb[1] - s; const w = hF(d) * qF(Math.max(0, Math.min(eL, eR)));
    const ci = eL < eR ? j : (j + 1) % n; const bl = Math.hypot(bis[ci][0], bis[ci][1]);
    x -= flare * w * bis[ci][0] / bl; z -= flare * w * bis[ci][1] / bl;
    return new V3(x, o.y0 + Fd(d) + lift * w, z); };
  const frame = (j, s, d) => { const p = pt(j, s, d); const T = pt(j, s, d + .05).sub(pt(j, s, d - .05)).normalize(); const Ls = pt(j, s + .05, d).sub(pt(j, s - .05, d)).normalize();
    const N = new V3().crossVectors(Ls, T).normalize(); if (N.y < 0) N.negate(); return { p, T, Ls, N }; };
  const tileCol = o.tileCol || C.tile;
  const th = (o.thick || 0.22) * (o.sc || 1);
  // ---- slopes
  for (let j = 0; j < n; j++) {
    const e = E[j], dm = dmax(j); if (dm <= 0.01) continue;
    const b0 = bounds(j, 0); const sMid = (b0[0] + b0[1]) / 2; const s0 = sMid - Math.round(sMid / P) * P + P * 0.5; // row centres at s0 + k P ... rows aligned to mid
    const Nt = Math.max(4, Math.ceil(e.L / (det >= 2 ? 0.35 : det ? 0.6 : 1.2))), Nd = Math.max(3, Math.ceil(dm / (det >= 2 ? 0.25 : det ? 0.5 : 1.0)));
    // arc length per (t) column
    const g = grid(Nt, Nd, (t, v) => { const d = v * dm, bb = bounds(j, d); const p = pt(j, lerp(bb[0], bb[1], t), d); return [p.x, p.y, p.z]; },
      (t, v) => { const d = v * dm, bb = bounds(j, d), s = lerp(bb[0], bb[1], t); return [(s - s0 + P * .5) / (8 * P), (d * 1.25 + Fd(d) * 0.6) / (8 * P * 1.1)]; });
    // fix normals to face up
    put('tile', ensureUp(g), tileCol);
    // ---- cover-tile rows
    if (det >= 0) {
      const farT = det === 1 && SITE !== 'gate' && SITE !== 'gate2' && SITE !== 'mid'; const rc = P * 0.36, np = det >= 2 ? 7 : det && !farT ? 5 : 3; const prof = []; for (let i = 0; i <= np; i++) { const a = -0.15 + (PI + 0.3) * i / np; prof.push([Math.cos(a) * rc, Math.sin(a) * rc * 0.9]); }
      const kA = Math.ceil((b0[0] - s0) / P), kB = Math.floor((b0[1] - s0) / P);
      const step = det >= 2 ? 0.3 : det && !farT ? 0.7 : 1.4;
      for (let k = kA; k <= kB; k++) {
        const s = s0 + k * P; if (s - b0[0] < P * .45 || b0[1] - s < P * .45) continue;
        let dEnd = 0; const dd = 0.05; while (dEnd < dm) { const bb = bounds(j, dEnd + dd); if (s - bb[0] < P * .45 || bb[1] - s < P * .45) break; dEnd += dd; }
        if (dEnd < 0.15) continue;
        const Lt = P * 1.1, lips = det >= 2 && o.lips;
        const ns = lips ? Math.max(4, Math.ceil(dEnd / (Lt / 4))) : Math.max(2, Math.ceil(dEnd / step)); const path = [], ups = [], arc = [0];
        for (let i = 0; i <= ns; i++) { const d = dEnd * i / ns; const f = frame(j, s, d); if (i) arc.push(arc[i - 1] + f.p.distanceTo(path[i - 1])); path.push(f.p); ups.push(f.N); }
        const rg = sweep(path, prof, { ups, vs: 1 / (8 * P * 1.1), us: 0.3 / 8, scale: lips ? (t => { const i = Math.round(t * ns); const fr = (arc[i] / Lt) % 1; return 1 + .1 * Math.max(0, 1 - fr / .3) - .04; }) : null });
        // uv: put cover rows at the flat column edge (u ~ k/8 +- small)
        const uv = rg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, (((k % 8) + 8) % 8) / 8 + (uv.getX(i) - 0.15 / 8));
        put('tile', rg, tileCol);
        if (det >= 0) { // eave end cap (round tile end) + drip tile
          const f = frame(j, s, 0.0); const cap = cyl(rc * 1.12, rc * 1.12, 0.04, det >= 2 ? 12 : 6); const m = new M4().compose(f.p.clone().addScaledVector(f.N, rc * 0.35).addScaledVector(f.T, -0.015), new QT().setFromUnitVectors(new V3(0, 1, 0), f.T.clone().negate()), new V3(1, 1, 1));
          put('tile', cap, [0.9, 1.0, 0.95], m);
          if (det >= 2) put('metal', cyl(rc * .45, rc * .55, .03, 8), C.gold, new M4().compose(f.p.clone().addScaledVector(f.N, rc * 0.35).addScaledVector(f.T, -0.045), new QT().setFromUnitVectors(new V3(0, 1, 0), f.T.clone().negate()), new V3(1, 1, 1)));
          if (det >= 1 && s + P < b0[1] - P * .45) { const fa = frame(j, s + P * .22, 0), fb = frame(j, s + P * .78, 0), fc = frame(j, s + P * .5, 0);
            const tip = fc.p.clone().addScaledVector(fc.T, -0.06).add(new V3(0, -P * .55, 0)); const pa = fa.p.clone().addScaledVector(fa.N, -.02), pb = fb.p.clone().addScaledVector(fb.N, -.02);
            const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute([pa.x, pa.y, pa.z, pb.x, pb.y, pb.z, tip.x, tip.y, tip.z, pb.x, pb.y, pb.z, pa.x, pa.y, pa.z, tip.x, tip.y, tip.z], 3)); tg.computeVertexNormals();
            const cg = tg; put('tile', cg, [0.85, 0.95, 0.9]); }
        }
      }
    }
    // ---- soffit, fascia, rafters (underside)
    if (o.over) {
      const dS = Math.min(dm, o.over + 0.4), bS = bounds(j, dS);
      const sg = grid(Math.max(4, Math.ceil(e.L / 1.0)), 3, (t, v) => { const d = v * dS, bb = bounds(j, d); const p = pt(j, lerp(bb[0], bb[1], t), d); return [p.x, p.y - th, p.z]; });
      put('wood', flipDown(sg), det >= 2 || o.raft ? [0.30, 0.05, 0.025] : [0.02, 0.09, 0.08]);
      const fg = grid(Math.max(4, Math.ceil(e.L / 0.6)), 1, (t, v) => { const bb = bounds(j, 0); const p = pt(j, lerp(bb[0], bb[1], t), 0); return [p.x, p.y + .03 - v * (th + .14), p.z]; });
      orientOut(fg, e.n); put('wood', fg, [0.16, 0.018, 0.01]);
      if ((det >= 2 && o.near) || o.raft) {
        const sc = o.sc || 1, rs = 0.23 * sc * (o.raft ? 1.25 : 1), rr = 0.06 * sc, fw = .1 * sc, lo = !!o.raft;
        const inner = (s, d, dy) => { const p = pt(j, s, d); p.y -= th + dy; return p; };
        const endCap = (a, b, r) => { const dir = b.clone().sub(a).normalize(), q = new QT().setFromUnitVectors(new V3(0, 1, 0), dir);
          if (lo) { put('metal', cyl(r * 1.04, r * 1.04, .02, 5), C.gold, new M4().compose(b.clone().addScaledVector(dir, .006), q, new V3(1, 1, 1))); return; }
          put('wood', cyl(r * 1.04, r * 1.04, .02, 10), [0.03, 0.08, 0.32], new M4().compose(b.clone().addScaledVector(dir, .004), q, new V3(1, 1, 1)));
          put('wood', cyl(r * .72, r * .72, .02, 10), [.75, .75, .7], new M4().compose(b.clone().addScaledVector(dir, .009), q, new V3(1, 1, 1)));
          put('metal', cyl(r * .36, r * .36, .02, 8), C.gold, new M4().compose(b.clone().addScaledVector(dir, .014), q, new V3(1, 1, 1))); };
        const sq = (a, b) => { put('wood', beamAB(a, b, fw, fw), [0.03, 0.16, 0.08]); const dir = b.clone().sub(a).normalize();
          put('metal', beamAB(b.clone().addScaledVector(dir, -.012), b.clone().addScaledVector(dir, .006), fw * 1.02, fw * 1.02), C.gold);
          put('wood', beamAB(b.clone().addScaledVector(dir, .004), b.clone().addScaledVector(dir, .014), fw * .7, fw * .7), [0.03, 0.2, 0.1]); };
        for (let s = bS[0] + rs * .5; s <= bS[1] - rs * .3; s += rs) {
          const a = inner(s, dS, rr * 2.6 + fw), b = inner(s, .32 * sc, rr * 2.6 + fw); put('wood', rodAB(a, b, rr, lo ? 5 : 8), [0.025, 0.13, 0.07]); endCap(a, b, rr);
          const a2 = inner(s, .7 * sc, fw * .5), b2 = inner(s, 0.02, fw * .5); sq(a2, b2); }
        // corner fans (both tiers)
        for (const side of [0, 1]) { const sIn = side ? bS[1] - rs * .3 : bS[0] + rs * .3; const sE = side ? b0[1] : b0[0]; const nF = Math.max(0, Math.round(Math.abs(sIn - sE) / rs) - 1);
          for (let f = 1; f <= nF; f++) { const t = f / (nF + 1), sO = lerp(sIn, sE, t);
            const a = inner(sIn, dS * (1 - t * .6), rr * 2.6 + fw), b = inner(lerp(sIn, sE, t * .85), .32 * sc, rr * 2.6 + fw); put('wood', rodAB(a, b, rr, 6), [0.025, 0.13, 0.07]); endCap(a, b, rr);
            sq(inner(lerp(sIn, sO, .5), .7 * sc * (1 - t * .5), fw * .5), inner(sO, .02, fw * .5)); } }
        // carved, gilded eave board (fascia) line-work
        const gl = []; for (let k = 0; k <= 16; k++) { const bb = bounds(j, 0); gl.push(pt(j, lerp(bb[0], bb[1], k / 16), 0).add(new V3(0, -th * .55, 0)).addScaledVector(new V3(e.n[0], 0, e.n[1]), .012)); }
        put('metal', sweep(gl, [[-.008, -.02], [.008, -.02], [.008, .02], [-.008, .02]], { closed: true }), C.gold);
      }
    }
  }
  // ---- hips
  const hips = [];
  for (let i = 0; i < n; i++) {
    const jp = (i - 1 + n) % n, j = i; let dH = Math.min(dmax(jp), dmax(j)); if (E[j].end || E[jp].end) dH = gable;
    if (o.dTop != null) dH = Math.min(dH, o.dTop);
    const path = [], st = det >= 2 ? .2 : .5; const ns = Math.max(3, Math.ceil(dH / st));
    const tipL = o.tipLen ?? 1.0; const p0 = pt(j, bounds(j, 0)[0], 0), p1 = pt(j, bounds(j, .3)[0], .3); const hd = p0.clone().sub(p1); hd.y = 0; hd.normalize();
    for (let k = 6; k >= 1; k--) { const u = k / 6; path.push(p0.clone().addScaledVector(hd, tipL * u).add(new V3(0, tipL * (0.25 * u + 1.05 * u * u * u), 0))); }
    for (let k = 0; k <= ns; k++) { const d = dH * k / ns; path.push(pt(j, bounds(j, d)[0], d)); }
    const rw = (o.rw || 0.32) * (o.sc || 1), rh = (o.rh || 0.3) * (o.sc || 1);
    const prof = [[-rw * .5, -.12], [-rw * .5, rh * .6], [-rw * .32, rh], [rw * .32, rh], [rw * .5, rh * .6], [rw * .5, -.12]];
    put('tile', sweep(path, prof, { vs: 1 / (8 * P * 1.1), us: .2 / 8, scale: t => t < 0.12 ? 0.55 + t / 0.12 * 0.45 : 1 }), o.ridgeCol || [0.95, 1.05, 1.0]);
    hips.push({ tip: path[0].clone(), p0 });
    // beasts along the hip, near the eave
    if (det >= 1 && o.beasts !== 0) { const nb = o.beasts || (det >= 2 ? 5 : 3); for (let b = 0; b < nb; b++) { const d = 0.5 + b * 0.42 * (o.sc || 1); if (d > dH * .6) break; const q = pt(j, bounds(j, d)[0], d); const q2 = pt(j, bounds(j, d + .1)[0], d + .1);
      const ry = Math.atan2(q.x - q2.x, q.z - q2.z); push(q.x, q.y + rh * .85, q.z, ry, 1); beast(1.0 * (o.sc || 1)); pop(); } }
    // curled tip ornament + wind chime
    { const tp = path[0]; const ry = Math.atan2(hd.x, hd.z); put('metal', cyl(0.0, .07 * (o.sc || 1), .38 * (o.sc || 1), 6), C.gold, mk(tp.x, tp.y + .12, tp.z, ry, 1, 1, 1, 0.5));
      chime(new V3().copy(path[1]).add(new V3(0, -.12, 0)), o.sc || 1); }
  }
  // ---- main ridge (rect roofs reaching the full depth) / gable / top band
  const out = { hips, top: null };
  if (o.dTop == null) {
    // apex or ridge
    const long = E.map((e, j) => j).filter(j => !E[j].end && dmax(j) >= D - 1e-3);
    const j = long[0]; const bb = bounds(j, D);
    if (bb[1] - bb[0] > 0.2 && n === 4) {
      const ext = gable ? 0.3 : 0; const a = pt(j, bb[0] - ext, D), b = pt(j, bb[1] + ext, D); const rh = (o.ridge || 0.7) * (o.sc || 1), rw = (o.rw || 0.32) * 1.3 * (o.sc || 1);
      const path = []; for (let k = 0; k <= 12; k++) path.push(new V3().lerpVectors(a, b, k / 12));
      const prof = [[-rw * .5, -.15], [-rw * .5, rh * .55], [-rw * .62, rh * .62], [-rw * .62, rh * .72], [-rw * .4, rh], [rw * .4, rh], [rw * .62, rh * .72], [rw * .62, rh * .62], [rw * .5, rh * .55], [rw * .5, -.15]];
      put('tile', sweep(path, prof, { vs: .5, us: .1 }), o.ridgeCol || [0.95, 1.05, 1.0]);
      // gold band on the ridge flanks
      const bandPath = path.map(p => p.clone().add(new V3(0, rh * .62, 0)));
      put('metal', sweep(bandPath, [[-rw * .64, -.03], [-rw * .64, .03]], {}), C.gold); put('metal', sweep(bandPath, [[rw * .64, .03], [rw * .64, -.03]], {}), C.gold);
      if (o.chiwen !== false) { const dx = b.clone().sub(a).normalize(); const ry = Math.atan2(-dx.z, dx.x);
        push(a.x, a.y + rh * .9, a.z, ry, 1); chiwen((o.sc || 1) * (o.cw || 1.4), -1); pop(); push(b.x, b.y + rh * .9, b.z, ry, 1); chiwen((o.sc || 1) * (o.cw || 1.4), 1); pop();
        if (o.pearl) { const m = a.clone().lerp(b, .5); push(m.x, m.y + rh, m.z, ry); finial(1.2 * (o.sc || 1)); pop(); } }
      out.ridge = [a, b];
      // gable triangles + bargeboards
      if (gable) for (let jj = 0; jj < n; jj++) if (E[jj].end) {
        const jl = (jj + 1) % n, jr = (jj - 1 + n) % n; // adjacent long slopes
        const outline = []; const NS = 10;
        { const bbL = bounds(jr, gable); for (let k = 0; k <= NS; k++) { const d = gable + (D - gable) * k / NS; outline.push(pt(jr, bounds(jr, d)[1], d)); } }
        { for (let k = NS; k >= 0; k--) { const d = gable + (D - gable) * k / NS; outline.push(pt(jl, bounds(jl, d)[0], d)); } }
        // pull the outline inward to the gable plane (vertical), slightly under the roof surface
        const pos = []; const base = outline[0].clone().lerp(outline[outline.length - 1], .5); base.y -= 0.05;
        for (let k = 0; k < outline.length - 1; k++) { const a = outline[k].clone(), b = outline[k + 1].clone(); a.y -= .12; b.y -= .12; pos.push(base.x, base.y, base.z, a.x, a.y, a.z, b.x, b.y, b.z); }
        const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gg.computeVertexNormals(); orientOut(gg, E[jj].n); put('wood', gg, C.vermD);
        const bp = outline.map(p => p.clone().add(new V3(E[jj].n[0] * .18, -.05, E[jj].n[1] * .18)));
        put('wood', sweep(bp, [[-.05, -.42], [.05, -.42], [.05, .05], [-.05, .05]], { closed: true }), C.verm);
        // gold hanging-fish ornament at the apex
        const ap = outline[NS].clone().add(new V3(E[jj].n[0] * .25, -.6, E[jj].n[1] * .25)); put('metal', box(.35, .6, .05), C.gold, mk(ap.x, ap.y, ap.z, Math.atan2(E[jj].n[0], E[jj].n[1])));
      }
    } else { const ap = pt(0, bounds(0, D * .999)[0], D * .999); out.apex = ap; if (o.finial !== false) { push(ap.x, ap.y - .1, ap.z); finial(o.finialH || 2.2 * (o.sc || 1), 1); pop(); } }
  } else {
    // top band where the upper body meets this eave
    const path = []; for (let j = 0; j <= n; j++) { const jj = j % n; const bb = bounds(jj, o.dTop); path.push(pt(jj, bb[0], o.dTop)); }
    const rh = .22 * (o.sc || 1); put('tile', sweep(path, [[-.18, -.1], [-.18, rh], [.12, rh], [.12, -.1]], { closed: false }), o.ridgeCol || [0.95, 1.05, 1.0]);
    out.top = path;
  }
  ARCH.roofs.push({ y: o.y0, poly: poly.map(p => wp(p[0], 0, p[1])), hips: hips.map(h => h.tip.clone().applyMatrix4(XF)) });
  return out;
}
function ensureUp(g) { const n = g.attributes.normal; let s = 0; for (let i = 0; i < n.count; i++) s += n.getY(i); if (s < 0) flipG(g); return g; }
function flipDown(g) { const n = g.attributes.normal; let s = 0; for (let i = 0; i < n.count; i++) s += n.getY(i); if (s > 0) flipG(g); return g; }
function orientOut(g, nr) { g.computeVertexNormals(); const n = g.attributes.normal; let s = 0; for (let i = 0; i < n.count; i++) s += n.getX(i) * nr[0] + n.getZ(i) * nr[1]; if (s < 0) { if (!g.index) prep(g); flipG(g); } return g; }

// ---------------------------------------------------------------- building kit
// column with stone base, origin at floor
function column(x, z, h, r, col = C.verm, det = 1) {
  if (det >= 2) { // carved base: square plinth, lotus-petal drum, gilded collar
    put('stone', box(r * 4.2, .14, r * 4.2), C.stoneD, mk(x, .07, z));
    put('relief', grid(32, 6, (u, v) => { const a = u * TAU, pet = Math.pow(Math.abs(Math.cos(a * 6)), .6); const rr = r * (1.25 + .5 * Math.sin(v * PI * .9) + .12 * pet * Math.sin(v * PI)); return [x + Math.cos(a) * rr, .14 + v * .3, z + Math.sin(a) * rr]; }, (u, v) => [u * 4, .5 + v * .3]), C.stone);
    put('stone', cyl(r * 1.25, r * 1.4, .06, 20), C.stoneD, mk(x, .47, z));
    put('wood', cyl(r * .9, r, h - .5, 16), col, mk(x, .5 + (h - .5) / 2, z));
    put('metal', cyl(r * 1.06, r * 1.06, .1, 16), C.gold, mk(x, .58, z)); put('metal', cyl(r * 1.03, r * 1.03, .05, 16), C.gold, mk(x, .7, z)); put('metal', cyl(r * .95, r * .95, .12, 16), C.gold, mk(x, h - .1, z));
    return; }
  const nS = isFar() ? 7 : 14;
  put('stone', lathe([[0, 0], [r * 1.75, 0], [r * 1.75, .1], [r * 1.55, .16], [r * 1.25, .26], [r * 1.12, .3], [0, .3]], nS), C.stoneD, mk(x, 0, z));
  put('wood', cyl(r * .9, r, h - .3, nS), col, mk(x, .3 + (h - .3) / 2, z));
  put('wood', cyl(r * 1.05, r * 1.05, .08, 14), C.gold, mk(x, .38, z));
}
// stone platform with plinth moulding; top at y=0, rectangle hw x hd (half sizes), height h
function platform(hw, hd, h, o = {}) {
  put('stone', box(hw * 2, h, hd * 2), C.stone, mk(0, -h / 2 - .2, 0));
  put('stone', box(hw * 2 + .3, .22, hd * 2 + .3), C.stoneD, mk(0, -.11, 0));                 // cap slab
  put('stone', box(hw * 2 + .4, .3, hd * 2 + .4), C.stoneD, mk(0, -h + .15, 0));             // foot
  if (o.deep) put('stone', box(hw * 2 - .4, o.deep, hd * 2 - .4), C.stone, mk(0, -h - o.deep / 2, 0));
}
// balustrade along polyline pts (local [x,z]) at y, with posts, rails and panels
function balustrade(pts, y = 0, o = {}) {
  const ph = o.h || 1.05, sp = o.sp || 1.7, col = o.col || C.stoneD, mat = o.mat || 'stone', det = o.det ?? 1;
  if (det >= 3 && mat === 'stone') return carvedBalustrade(pts, y, ph, sp, col);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1]; const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); if (L < 0.2) continue; const ry = Math.atan2(-dz, dx); const nseg = Math.max(1, Math.round(L / sp));
    for (let k = 0; k <= nseg; k++) { if (k === nseg && i < pts.length - 2) continue; const t = k / nseg, x = a[0] + dx * t, z = a[1] + dz * t;
      put(mat, box(.2, ph, .2), col, mk(x, y + ph / 2, z, ry));
      if (mat === 'stone') { put(mat, lathe([[0, 0], [.12, 0], [.13, .08], [.08, .14], [.11, .22], [.05, .3], [0, .32]], 8), col, mk(x, y + ph, z)); }
      else put('metal', sph(.07, 8, 6), C.gold, mk(x, y + ph + .05, z));
    }
    const cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2;
    put(mat, box(L, .1, .14), col, mk(cx, y + ph - .12, cz, ry));            // top rail
    put(mat, box(L, .12, .12), col, mk(cx, y + .06, cz, ry));                // bottom rail
    if (mat === 'stone') {
      if (det >= 2) { // pierced: bottom plinth panel + vase balusters
        put(mat, box(L, .2, .1), col, mk(cx, y + .22, cz, ry));
        const nb = Math.max(2, Math.round(L / .24)); for (let k = 1; k < nb; k++) { if (Math.abs(((k / nb) * nseg) % 1) < .08) continue; const t = k / nb;
          put(mat, lathe([[0, 0], [.035, 0], [.05, .05], [.06, .14], [.035, .26], [.03, .3], [.045, .33], [0, .34]].map(q => [q[0], q[1] * (ph - .5) / .34]), 7), col, mk(a[0] + dx * t, y + .32, a[1] + dz * t)); }
        put(mat, box(L, .07, .16), col, mk(cx, y + .34, cz, ry));
      } else put(mat, box(L, .5, .06), col, mk(cx, y + .4, cz, ry));                   // panel
      if (det === 1) for (let k = 0; k < nseg; k++) { const t = (k + .5) / nseg, x = a[0] + dx * t, z = a[1] + dz * t; put(mat, box(sp * .55, .3, .1), [.82, .8, .76], mk(x, y + .4, z, ry)); put(mat, cyl(.05, .07, .2, 6), col, mk(x, y + .76, z)); }
    } else {
      // timber railing: balusters + goose-neck
      const nb = Math.max(2, Math.round(L / (isFar() ? .5 : .22))); for (let k = 1; k < nb; k++) { const t = k / nb; put(mat, box(.04, ph - .2, .04), col, mk(a[0] + dx * t, y + ph / 2 - .05, a[1] + dz * t, ry)); }
      put(mat, box(L, .06, .1), col, mk(cx, y + ph * .45, cz, ry));
    }
  }
}
// near-camera balustrade: posts with sunk panels and lotus-bud finials, carved relief panels, moulded rails, plinth
const BUD = (() => { const pts = [[0, 0], [.13, 0], [.13, .04], [.1, .07], [.115, .1], [.085, .14], [.06, .16], [.075, .19]]; for (let k = 0; k <= 8; k++) { const a = k / 8 * PI * .5; pts.push([.085 * Math.cos(a) * (1 - k * .02), .19 + .17 * Math.sin(a) + k * .004]); } pts.push([0, .37]); return pts; })();
function carvedBalustrade(pts, y, ph, sp, col) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1]; const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); if (L < 0.2) continue; const ry = Math.atan2(-dz, dx); const nseg = Math.max(1, Math.round(L / sp)), seg = L / nseg;
    const cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2;
    put('stone', box(L + .1, .14, .34), col, mk(cx, y + .07, cz, ry));                                   // plinth
    put('stone', box(L, .09, .26), col, mk(cx, y + .18, cz, ry));
    put('stone', box(L, .1, .2), col, mk(cx, y + ph - .14, cz, ry));                                     // hand rail, moulded
    put('stone', box(L, .05, .24), col, mk(cx, y + ph - .07, cz, ry)); put('stone', box(L, .04, .16), col, mk(cx, y + ph - .21, cz, ry));
    for (let k = 0; k <= nseg; k++) { if (k === nseg && i < pts.length - 2) continue; const t = k / nseg, x = a[0] + dx * t, z = a[1] + dz * t;
      put('stone', box(.22, ph + .02, .22), col, mk(x, y + (ph + .02) / 2, z, ry));
      for (const sd of [-1, 1]) put('relief', box(.13, ph * .55, .01), [.9, .88, .84], mk(x + Math.sin(ry) * sd * .111, y + ph * .5, z + Math.cos(ry) * sd * .111, ry));
      put('stone', box(.26, .06, .26), col, mk(x, y + ph + .04, z, ry));
      put('stoneU', lathe(BUD, 12), [.95, .93, .88], mk(x, y + ph + .07, z));
      put('stone', grid(16, 1, (u, v) => { const an = u * TAU, rr = .1 + .02 * Math.abs(Math.cos(an * 4)); return [x + Math.cos(an) * rr, y + ph + .13 + v * .06, z + Math.sin(an) * rr * (1 - v * .15)]; }), [.92, .9, .85]);
    }
    for (let k = 0; k < nseg; k++) { const t = (k + .5) / nseg, x = a[0] + dx * t, z = a[1] + dz * t; // relief panel between posts (both faces)
      put('relief', box(seg - .24, ph - .45, .1), [.95, .93, .88], mk(x, y + .23 + (ph - .45) / 2, z, ry)); }
  }
}
// straight stair: from local (0,0,0) going toward +z, width w, rising rise over run, with side cheek walls
function stairs(w, rise, run, o = {}) {
  const n = Math.max(2, Math.round(rise / (o.step || 0.17))), sh = rise / n, sd = run / n, col = o.col || C.stoneD;
  for (let i = 0; i < n; i++) { const r = K.hash(i * 7.3 + w, run); put('stone', box(w + (r - .5) * .03, sh + .02, sd + .04), [.85 + r * .15, .83 + r * .15, .78 + r * .14], mk((r - .5) * .02, -sh * (i + .5), sd * (i + .5))); }
  if (o.cheek !== false) for (const s of [-1, 1]) { const g = new THREE.BufferGeometry(); // wedge cheek wall
    const x = s * (w / 2 + .18); const sh2 = new THREE.Shape(); sh2.moveTo(0, .15); sh2.lineTo(run, -rise + .15); sh2.lineTo(run, -rise - .2); sh2.lineTo(0, -rise - .2); sh2.lineTo(0, .15);
    const eg = new THREE.ExtrudeGeometry(sh2, { depth: .36, bevelEnabled: false }); eg.applyMatrix4(mk(x + .18, 0, 0, -PI / 2)); put('stone', eg, col); }
}
// lattice door panels filling an opening of width w, height h, centred at local origin bottom, facing +z
function doors(w, h, n = 4, o = {}) {
  const pw = w / n; for (let i = 0; i < n; i++) { const g = box(pw - .03, h, .08); put('lattice', g, null, mk(-w / 2 + pw * (i + .5), h / 2, 0)); }
  put('wood', box(w, .1, .14), C.vermD, mk(0, h + .05, 0)); put('wood', box(w, .14, .16), C.vermD, mk(0, .07, 0));
}
// wall infill (plinth stone + red plaster) with a lattice window
function wall(w, h, o = {}) {
  put('stone', box(w, .9, .45), C.stoneD, mk(0, .45, 0));
  put('stone', box(w, h - .9, .3), o.col || C.wallR, mk(0, .9 + (h - .9) / 2, 0));
  if (o.win !== false && w > 1.6) { const ww = Math.min(w * .6, 2.2), wh = Math.min(h * .4, 1.4); put('lattice', box(ww, wh, .34), null, mk(0, 1.25 + wh / 2, 0)); put('wood', box(ww + .16, .1, .38), C.vermD, mk(0, 1.2, 0)); put('wood', box(ww + .16, .1, .38), C.vermD, mk(0, 1.3 + wh, 0)); }
}
// painted lintel between two column positions (local), at height y
function lintels(a, b, y, s = 1) {
  const A = new V3(a[0], 0, a[1]), B = new V3(b[0], 0, b[1]);
  const pb = (y0, h, w) => { const g = beamAB(new V3(A.x, y0, A.z), new V3(B.x, y0, B.z), w, h); put('paint', g); };
  pb(y - .25 * s, .5 * s, .3 * s); pb(y - .78 * s, .32 * s, .26 * s);
  put('wood', beamAB(new V3(A.x, y - .56 * s, A.z), new V3(B.x, y - .56 * s, B.z), .2 * s, .14 * s), C.vermD);
  put('wood', beamAB(new V3(A.x, y + .06 * s, A.z), new V3(B.x, y + .06 * s, B.z), .4 * s, .12 * s), C.green);
}
// sparrow braces at a column top, along direction (dx,dz)
const isFar = () => SITE === 'cliff' || SITE === 'summit' || SITE === 'lake' || SITE === 'far' || SITE === 'wheelsite';
function queti(x, z, y, ry, s = 1) {
  if (isFar()) { put('wood', box(.7, .35, .07), C.gold, mk(x, y - .17, z, ry, s).multiply(mk(.35, 0, 0))); return; }
  const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(.9, 0); sh.quadraticCurveTo(.5, -.1, .35, -.3); sh.quadraticCurveTo(.15, -.5, 0, -.55); sh.lineTo(0, 0);
  const g = new THREE.ExtrudeGeometry(sh, { depth: .08, bevelEnabled: false, curveSegments: 5 }); g.translate(0, 0, -.04); put('wood', g, C.gold, mk(x, y, z, ry, s));
}
// hall: origin at floor centre, front +z. bx/bz bay widths. o.roof opts. returns info
function hall(o) {
  const bx = o.bx, bz = o.bz, ch = o.ch || 4, cr = o.cr || .24, s = o.s || 1, det = o.det ?? 1;
  const W2 = bx.reduce((a, b) => a + b, 0) / 2, D2 = bz.reduce((a, b) => a + b, 0) / 2;
  const xs = [-W2]; for (const b of bx) xs.push(xs[xs.length - 1] + b); const zs = [-D2]; for (const b of bz) zs.push(zs[zs.length - 1] + b);
  const ring = []; for (let i = 0; i < xs.length; i++) ring.push([xs[i], zs[0]]); for (let i = 1; i < zs.length; i++) ring.push([xs[xs.length - 1], zs[i]]); for (let i = xs.length - 2; i >= 0; i--) ring.push([xs[i], zs[zs.length - 1]]); for (let i = zs.length - 2; i > 0; i--) ring.push([xs[0], zs[i]]);
  const near = !!o.near;
  for (const p of ring) column(p[0], p[1], ch, cr, o.colCol, near ? 2 : 1);
  for (let i = 0; i < ring.length; i++) lintels(ring[i], ring[(i + 1) % ring.length], ch, s);
  for (const p of ring) { const corner = (Math.abs(p[0]) > W2 - .01) && (Math.abs(p[1]) > D2 - .01); if (corner) continue; const alongX = Math.abs(Math.abs(p[1]) - D2) < .01; queti(p[0], p[1], ch - .95 * s, alongX ? 0 : PI / 2, s * 0.8); queti(p[0], p[1], ch - .95 * s, alongX ? PI : -PI / 2, s * 0.8); }
  if (near) for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]) - cr * 2.2; const ry = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; put('lattice', box(L, .3 * s, .05), [1.6, 1.05, .35], mk(mx, ch - 1.12 * s, mz, ry)); put('metal', box(L, .03, .07), C.gold, mk(mx, ch - 1.29 * s, mz, ry)); }
  // bracket sets
  const dgS = o.dg || 0.8 * s, ytop = ch + .12 * s; DGLOD = near ? 2 : det >= 1 && (SITE === 'mid' || SITE === 'gate' || SITE === 'gate2') ? 1 : 0;
  if (det >= 0) {
    const sideSets = (a, b, nrm) => { const ry = Math.atan2(nrm[0], nrm[1]); const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const k = Math.max(1, Math.round(L / (1.6 * dgS))); for (let i = 1; i < k; i++) { const t = i / k; dougong(lerp(a[0], b[0], t), ytop, lerp(a[1], b[1], t), ry, dgS); } };
    for (let i = 0; i < xs.length - 1; i++) { sideSets([xs[i], zs[0]], [xs[i + 1], zs[0]], [0, -1]); sideSets([xs[i], D2], [xs[i + 1], D2], [0, 1]); }
    for (let i = 0; i < zs.length - 1; i++) { sideSets([-W2, zs[i]], [-W2, zs[i + 1]], [-1, 0]); sideSets([W2, zs[i]], [W2, zs[i + 1]], [1, 0]); }
    for (const p of ring) { const cx = Math.abs(p[0]) > W2 - .01, cz = Math.abs(p[1]) > D2 - .01;
      if (cx && cz) { const ry = Math.atan2(Math.sign(p[0]), Math.sign(p[1])); dougong(p[0], ytop, p[1], ry, dgS * 1.05); dougong(p[0], ytop, p[1], Math.sign(p[0]) > 0 ? PI / 2 : -PI / 2, dgS * .9); dougong(p[0], ytop, p[1], Math.sign(p[1]) > 0 ? 0 : PI, dgS * .9); }
      else dougong(p[0], ytop, p[1], cz ? (p[1] > 0 ? 0 : PI) : (p[0] > 0 ? PI / 2 : -PI / 2), dgS); }
  }
  const yP = ytop + dgS * 1.05; // outer purlin height
  // outer purlins (eave beams carried by bracket tips)
  const off = .7 * dgS; const pr = .13 * s;
  const R = [[-W2 - off, -D2 - off], [W2 + off, -D2 - off], [W2 + off, D2 + off], [-W2 - off, D2 + off]];
  for (let i = 0; i < 4; i++) { const a = R[i], b = R[(i + 1) % 4]; put('wood', rodAB(new V3(a[0], yP, a[1]), new V3(b[0], yP, b[1]), pr, 8), C.green); }
  // ceiling inside (dark)
  put('wood', box(W2 * 2 + 1.2, .1, D2 * 2 + 1.2), C.dark, mk(0, yP + .1, 0));
  // walls
  const fill = (side, a, b, kind) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]) - cr * 2; const nrm = side; const ry = Math.atan2(nrm[0], nrm[1]); const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; const hh = ch - 1.0 * s;
    push(mx - nrm[0] * .05, 0, mz - nrm[1] * .05, ry); if (kind === 'doors') { doors(L, hh * .78, L > 3 ? 4 : 2); put('lattice', box(L, hh * .2, .08), null, mk(0, hh * .78 + .12 + hh * .1, 0)); }
    else if (kind === 'wall') wall(L, hh, { col: o.wallCol }); else if (kind === 'open') { put('lattice', box(L, .35, .05), null, mk(0, hh - .1, 0)); } pop(); };
  const sides = o.sides || { f: 'doors', b: 'wall', l: 'wall', r: 'wall' };
  for (let i = 0; i < xs.length - 1; i++) { fill([0, 1], [xs[i], D2], [xs[i + 1], D2], typeof sides.f === 'function' ? sides.f(i) : sides.f); fill([0, -1], [xs[i], -D2], [xs[i + 1], -D2], sides.b); }
  for (let i = 0; i < zs.length - 1; i++) { fill([-1, 0], [-W2, zs[i]], [-W2, zs[i + 1]], sides.l); fill([1, 0], [W2, zs[i]], [W2, zs[i + 1]], sides.r); }
  if (o.interior !== false) put('stone', box(W2 * 2 - .3, ch, D2 * 2 - .3), C.dark, mk(0, ch / 2, 0));
  { const c = wp(0, 0, 0); keep(c, Math.hypot(W2, D2) + (o.roof && o.roof.over || 1) * s + 1.2, c.y - .5, c.y + ch + 6); }
  // roof
  const ro = Object.assign({ over: 1.0, H: 0, P: .3, det, sc: s, near }, o.roof || {});
  const over = ro.over * s + off; const hw = W2 + over, hd = D2 + over;
  let r;
  const thick = (ro.thick || .22) * s;
  if (ro.type === 'pyr') { const D = Math.min(hw, hd); const Fd = d => ro.H * (.28 * (d / D) + .72 * Math.pow(d / D, 2.1)); const y0 = yP + pr + thick - Fd(over - off);
    r = roof(Object.assign({}, ro, { poly: [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]], y0, over })); }
  else { const D = Math.min(hw, hd); const Fd = d => ro.H * (.28 * (d / D) + .72 * Math.pow(d / D, 2.1)); const y0 = yP + pr + thick - Fd(over - off);
    r = roof(Object.assign({}, ro, { poly: [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]], y0, over, gable: ro.type === 'xieshan' ? (ro.gable || D * 0.42) : 0 })); }
  // lanterns under the front eave and chimes
  if (o.lanterns !== false) for (let i = 0; i < xs.length - 1; i++) { const x = (xs[i] + xs[i + 1]) / 2; lantern(wp(x, yP - .2, D2 + off), (o.lanS || 1) * s); if (o.lanBack) lantern(wp(x, yP - .2, -D2 - off), s); }
  return { W2, D2, yP, ytop, roof: r, hw, hd, xs, zs };
}

// ---------------------------------------------------------------- cloth (banners, flags)
const CLOTH = [];
// rectangle hanging from a horizontal top edge: top centre at local p, width w, length h, in plane facing ry
function banner(p, w, h, col, ry = 0, o = {}) {
  const nu = 3, nv = Math.max(6, Math.ceil(h / .3)); const pos = [], uvs = [], af = [], idx = []; const ph = K.hash(p.x * 3.1, p.z * 1.7);
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const u = i / nu, v = j / nv; let x = (u - .5) * w, y = -v * h; if (o.tail && v > .85) x *= 1 - (v - .85) / .15 * .7; pos.push(x, y, 0); uvs.push(u, v * (o.vr || 1)); af.push(Math.pow(v, 1.2) * (o.flex || 1), ph); }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setAttribute('aF', new THREE.Float32BufferAttribute(af, 2)); g.setIndex(idx); g.computeVertexNormals();
  K.tint(g, col[0], col[1], col[2]); g.applyMatrix4(XF.clone().multiply(mk(p.x, p.y, p.z, ry)));
  (BK[SITE].cloth || (BK[SITE].cloth = [])).push(g);
}
// flag attached to a vertical pole edge, extending along local +x
function flag(p, w, h, col, ry = 0) {
  const nu = 6, nv = 2, pos = [], uvs = [], af = [], idx = []; const ph = K.hash(p.x * 5.1, p.z * 2.3 + p.y);
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const u = i / nu, v = j / nv; pos.push(u * w, -v * h * (1 - u * .35), 0); uvs.push(v, u * .5); af.push(u, ph); }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setAttribute('aF', new THREE.Float32BufferAttribute(af, 2)); g.setIndex(idx); g.computeVertexNormals();
  K.tint(g, col[0], col[1], col[2]); g.applyMatrix4(XF.clone().multiply(mk(p.x, p.y, p.z, ry)));
  (BK[SITE].cloth || (BK[SITE].cloth = [])).push(g);
}
const FLAGC = [[0.55, 0.04, 0.02], [0.75, 0.45, 0.04], [0.04, 0.10, 0.45], [0.75, 0.72, 0.62], [0.05, 0.30, 0.10]];
function pennantPole(x, z, y, h, col) { put('wood', cyl(.06, .08, h, 6), C.dark, mk(x, y + h / 2, z)); put('metal', cyl(0, .1, .35, 6), C.gold, mk(x, y + h + .17, z)); put('wood', box(1.2, .06, .06), C.dark, mk(x, y + h - .3, z)); banner(new V3(x, y + h - .33, z), .9, h * .55, col, 0, { tail: true, vr: 1 }); }
// lantern string between two world points
function lanternLine(a, b, sg, n, s = .6) {
  const pts = sag(a, b, sg, 16); put('wood', sweep(pts, circ(.012, 4), {}), C.rope);
  for (let i = 1; i < n; i++) { const t = i / n; const p = new V3().lerpVectors(a, b, t); p.y -= sg * 4 * t * (1 - t); lantern(p, s); }
}

// ---------------------------------------------------------------- props
function bell(s = 1) { // bronze bell hanging from origin
  put('metal', lathe([[0, 0], [.95, -.05], [1.0, -.18], [.9, -.4], [.72, -1.0], [.62, -1.6], [.55, -1.9], [.3, -2.0], [0, -2.02]].map(p => [p[0] * s * .7, p[1] * s]), 24), C.bronze, mk(0, 0, 0, 0, 1, 1, 1, PI));
  put('metal', lathe([[0, 0], [.95, -.05], [1.0, -.18], [.9, -.4], [.72, -1.0], [.62, -1.6], [.55, -1.9], [.3, -2.0], [0, -2.02]].map(p => [p[0] * s * .7 * .96, p[1] * s]), 24), C.dark, mk(0, -.01, 0, 0, 1, 1, 1, PI));
  for (let k = 0; k < 3; k++) put('metal', cyl(.72 * s * (.88 - k * .05), .72 * s * (.88 - k * .05), .05 * s, 24, true), C.bronze, mk(0, -(.5 + k * .4) * s, 0));
  put('metal', new THREE.TorusGeometry(.15 * s, .05 * s, 6, 12), C.bronze, mk(0, .12 * s, 0));
  ARCH.bells.push(wp(0, -s, 0));
}
function drum(s = 1) { // big ceremonial drum on a stand, axis along local x
  put('wood', cyl(.75 * s, .75 * s, 1.1 * s, 24), C.verm, mk(0, 0, 0, 0, 1, 1, 1, 0, PI / 2));
  put('wood', cyl(.85 * s, .85 * s, .9 * s, 24), C.verm, mk(0, 0, 0, 0, 1, 1, 1, 0, PI / 2));
  for (const x of [-.56, .56]) put('wood', cyl(.8 * s, .8 * s, .02, 24), [.55, .45, .3], mk(x * s, 0, 0, 0, 1, 1, 1, 0, PI / 2));
  for (const x of [-.5, .5]) for (let k = 0; k < 18; k++) { const a = k / 18 * TAU; put('metal', sph(.03 * s, 4, 3), C.gold, mk(x * s, Math.cos(a) * .8 * s, Math.sin(a) * .8 * s)); }
  for (const z of [-.6, .6]) { put('wood', box(.12 * s, 2 * s, .12 * s), C.dark, mk(0, -.2 * s, z * s, 0, 1, 1, 1, z > 0 ? .25 : -.25)); }
}
function burner(s = 1) { // bronze incense burner (tripod censer with lid)
  put('metal', lathe([[0, .4], [.5, .42], [.62, .55], [.65, .75], [.55, .95], [.6, 1.0], [.4, 1.02], [0, 1.02]].map(p => [p[0] * s, p[1] * s]), 18), C.bronze);
  for (let k = 0; k < 3; k++) { const a = k / 3 * TAU; put('metal', cyl(.05 * s, .08 * s, .5 * s, 6), C.bronze, mk(Math.cos(a) * .4 * s, .22 * s, Math.sin(a) * .4 * s)); }
  for (const x of [-1, 1]) put('metal', new THREE.TorusGeometry(.14 * s, .035 * s, 5, 10, PI), C.bronze, mk(x * .6 * s, 1.0 * s, 0, PI / 2));
  put('metal', lathe([[0, 1.5], [.12, 1.42], [.2, 1.3], [.48, 1.08], [.5, 1.02], [0, 1.02]].map(p => [p[0] * s, p[1] * s]), 14), C.bronze); put('metal', sph(.08 * s), C.gold, mk(0, 1.55 * s, 0));
  ARCH.smoke.push({ pos: wp(0, 1.6 * s, 0), s });
}
function bigBurner(s = 1) { // large bronze tripod censer: animal-foot legs, relief band, loop handles, pierced lid with a guardian lion
  const B = C.bronze;
  put('metal', lathe([[0, .55], [.62, .56], [.78, .66], [.86, .82], [.86, 1.1], [.8, 1.22], [.88, 1.27], [.9, 1.32], [.6, 1.34], [0, 1.34]].map(p => [p[0] * s, p[1] * s]), 28), B);
  for (let k = 0; k < 3; k++) put('metal', cyl(.875 * s, .875 * s, .035 * s, 28, true), C.gold, mk(0, (.86 + k * .1) * s, 0));
  for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; put('metal', box(.08 * s, .12 * s, .03 * s), B, mk(Math.cos(a) * .87 * s, .96 * s, Math.sin(a) * .87 * s, PI / 2 - a)); }
  for (let k = 0; k < 3; k++) { const a = k / 3 * TAU + .5, c = Math.cos(a), sn = Math.sin(a);
    const leg = [new V3(c * .55, .7, sn * .55), new V3(c * .7, .45, sn * .7), new V3(c * .66, .2, sn * .66), new V3(c * .74, .04, sn * .74)].map(p => p.multiplyScalar(s));
    put('metal', sweep(leg, circ(.07 * s, 8), { scale: t => 1.2 - t * .3, closed: true }), B); put('metal', sph(.11 * s, 8, 6), B, mk(c * .78 * s, .06 * s, sn * .78 * s, 0, 1, .6, 1)); }
  for (const x of [-1, 1]) { put('metal', new THREE.TorusGeometry(.2 * s, .045 * s, 6, 14, PI), B, mk(x * .62 * s, 1.32 * s, 0, PI / 2)); }
  put('metal', lathe([[.62, 1.34], [.6, 1.42], [.48, 1.6], [.3, 1.75], [.14, 1.82], [0, 1.83]].map(p => [p[0] * s, p[1] * s]), 24), B);
  for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; put('metal', cyl(.025 * s, .025 * s, .3 * s, 5), C.gold, mk(Math.cos(a) * .5 * s, 1.52 * s, Math.sin(a) * .5 * s, 0, 1, 1, 1, Math.sin(a) * .5, -Math.cos(a) * .5)); }
  push(0, 1.8 * s, 0); put('metal', tbox(.22 * s, .18 * s, .32 * s, 1.1), C.gold); put('metal', sph(.11 * s, 8, 6), C.gold, mk(0, .28 * s, .12 * s)); put('metal', sph(.12 * s, 8, 6), C.gold, mk(0, .22 * s, .06 * s, 0, 1.2, .6, 1)); put('metal', sph(.05 * s, 6, 4), C.gold, mk(.06 * s, .1 * s, .17 * s)); pop();
  ARCH.smoke.push({ pos: wp(0, 1.75 * s, .35 * s), s: s * 1.4 });
}
function candle(x, z, y, h = .22) { put('glaze', cyl(.03, .032, h, 8), [.85, .8, .68], mk(x, y + h / 2, z)); put('flame', sph(.022, 6, 5), [.7, 1, 0], mk(x, y + h + .035, z, 0, 1, 2.2, 1)); ARCH.candles = (ARCH.candles || 0) + 1; if (ARCH.candles % 3 === 0) ARCH.fires.push(wp(x, y + h + .04, z)); }
function offeringTable(s = 1) { // low table: fruit on plates, candles, a small censer
  put('wood', box(1.8 * s, .07 * s, .8 * s), C.verm, mk(0, .62 * s, 0)); put('metal', box(1.82 * s, .02, .82 * s), C.gold, mk(0, .585 * s, 0));
  for (const [x, z] of [[-.8, -.32], [.8, -.32], [.8, .32], [-.8, .32]]) { put('wood', box(.09 * s, .58 * s, .09 * s), C.vermD, mk(x * s, .29 * s, z * s)); put('wood', sph(.07 * s, 6, 4), C.vermD, mk(x * s, .02, z * s)); }
  put('wood', box(1.7 * s, .14 * s, .03), C.verm, mk(0, .52 * s, .38 * s)); put('lattice', box(1.4 * s, .1 * s, .01), [1.6, 1.05, .35], mk(0, .52 * s, .4 * s));
  const r = K.rng(77); const fruitC = [[.75, .25, .02], [.7, .05, .02], [.85, .5, .1], [.55, .6, .1]];
  for (const px of [-.55, .55]) { put('glaze', lathe([[0, 0], [.08, 0], [.2, .04], [.24, .07], [0, .07]], 16), [.75, .78, .72], mk(px * s, .655 * s, 0));
    for (let k = 0; k < 7; k++) { const a = k / 6 * TAU, rr = k ? .11 : 0, h = k ? 0 : .09; put('glaze', sph(.065 * s, 10, 8), fruitC[(k + (px > 0 ? 2 : 0)) % 4], mk((px + Math.cos(a) * rr) * s, (.75 + h) * s, Math.sin(a) * rr * s)); } }
  push(0, .655 * s, 0); burner(.22 * s); pop();
  for (const x of [-.85, -.25, .25, .85]) candle(x * s, -.25 * s, .655 * s, .2 + K.hash(x * 9, 3) * .1);
}
function pot(r = .45, h = .5, col = [.18, .32, .45]) { // glazed planter on feet; the plant inside belongs to flora
  put('glaze', lathe([[0, .04], [r * .7, .04], [r * .9, .1], [r, h * .55], [r * .96, h * .88], [r * 1.08, h * .93], [r * 1.08, h], [r * .92, h], [r * .92, h * .7], [0, h * .7]], 20), col);
  put('glaze', cyl(r * 1.0, r * 1.0, .03, 20, true), [.8, .6, .2], mk(0, h * .78, 0));
  for (let k = 0; k < 3; k++) { const a = k / 3 * TAU; put('glaze', sph(.06, 6, 4), col, mk(Math.cos(a) * r * .7, .04, Math.sin(a) * r * .7)); }
  put('stone', cyl(r * .9, r * .9, .02, 16), [.12, .09, .06], mk(0, h * .96, 0));
  (ARCH.pots || (ARCH.pots = [])).push({ pos: wp(0, h * .97, 0), r: r * .9 });
}
function drumStand(s = 1) { // ceremonial drum in a lacquered A-frame stand
  push(0, 1.3 * s, 0); drum(s * .9); pop();
  for (const sx of [-1, 1]) { for (const sz of [-1, 1]) put('wood', beamAB(new V3(sx * .62 * s, 0, sz * .7 * s), new V3(sx * .62 * s, 2.1 * s, 0), .1 * s, .1 * s), C.verm);
    put('wood', box(.1 * s, .1 * s, 1.5 * s), C.vermD, mk(sx * .62 * s, .5 * s, 0)); put('metal', sph(.08 * s, 8, 6), C.gold, mk(sx * .62 * s, 2.18 * s, 0)); }
  put('wood', box(1.4 * s, .1 * s, .1 * s), C.verm, mk(0, 2.1 * s, 0));
  for (const sx of [-.2, .2]) put('wood', cyl(.025, .02, .55, 6), C.wood, mk(sx * s, .95 * s, .55 * s, 0, 1, 1, 1, .3));
}
function darchor(h, n, R, seed) { // prayer-flag bundle: a tall pole with strings of five-colour flags fanning to the ground
  put('wood', cyl(.07, .1, h, 8), C.dark, mk(0, h / 2, 0)); put('metal', lathe([[0, 0], [.1, 0], [.12, .1], [.05, .3], [0, .5]], 10), C.gold, mk(0, h, 0));
  put('stone', cyl(.4, .5, .3, 10), C.stoneD, mk(0, .15, 0));
  for (let k = 0; k < n; k++) { const a = k / n * TAU + seed, top = new V3(0, h - .3, 0), bot = new V3(Math.cos(a) * R, .05, Math.sin(a) * R);
    const pts = sag(top, bot, .5, 14); put('wood', sweep(pts, circ(.008, 3), {}), C.rope); put('wood', box(.08, .3, .08), C.wood, mk(bot.x, .1, bot.z));
    const ry = Math.atan2(-(bot.z - top.z), bot.x - top.x);
    for (let i = 1; i < 14; i++) { const p = pts[i]; flag(new V3(p.x, p.y - .02, p.z), .32, .28, FLAGC5[(i + k) % 5], ry); } }
}
const FLAGC5 = [[0.04, 0.12, 0.55], [0.8, 0.78, 0.7], [0.62, 0.05, 0.03], [0.05, 0.38, 0.12], [0.85, 0.62, 0.05]];
function stoneLantern(s = 1) {
  put('stone', box(.7 * s, .25 * s, .7 * s), C.stoneD, mk(0, .12 * s, 0)); put('stone', cyl(.14 * s, .18 * s, 1.0 * s, 8), C.stoneD, mk(0, .75 * s, 0));
  put('stone', box(.6 * s, .14 * s, .6 * s), C.stoneD, mk(0, 1.3 * s, 0));
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) put('stone', box(.1 * s, .45 * s, .1 * s), C.stoneD, mk(x * .2 * s, 1.6 * s, z * .2 * s));
  put('flame', box(.28 * s, .3 * s, .28 * s), [.02, .75, 0], mk(0, 1.58 * s, 0));
  put('stone', cyl(.02 * s, .55 * s, .35 * s, 4), C.stoneD, mk(0, 1.98 * s, 0, PI / 4)); put('stone', sph(.09 * s, 6, 5), C.stoneD, mk(0, 2.2 * s, 0));
  ARCH.fires.push(wp(0, 1.58 * s, 0));
}
function lion(s = 1, ry = 0, det = 0) { // seated guardian lion on a carved plinth (faces local +z)
  push(0, 0, 0, ry);
  const St = [1.0, .98, .93], sp = (r, x, y, z, sx = 1, sy = 1, sz = 1, a = isFar() ? 6 : 12, b = isFar() ? 4 : 9) => put('stoneU', sph(r * s, a, b), St, mk(x * s, y * s, z * s, 0, sx, sy, sz));
  put('stone', box(1.1 * s, .14 * s, 1.5 * s), C.stoneD, mk(0, .07 * s, 0)); put(det ? 'relief' : 'stone', box(1.0 * s, .7 * s, 1.4 * s), [.95, .93, .88], mk(0, .49 * s, 0)); put('stone', box(1.1 * s, .12 * s, 1.5 * s), C.stoneD, mk(0, .9 * s, 0));
  const y0 = .96;
  sp(.42, 0, y0 + .32, -.28, 1.05, .85, 1.25);                        // haunches
  sp(.36, 0, y0 + .75, -.02, 1., 1.25, .9);                           // chest
  for (const x of [-1, 1]) { put('stone', cyl(.1 * s, .12 * s, .7 * s, 8), St, mk(x * .2 * s, (y0 + .33) * s, .32 * s, 0, 1, 1, 1, .12)); sp(.13, x * .2, y0 + .04, .4, 1.1, .6, 1.3); // forelegs + paws
    sp(.17, x * .33, y0 + .14, -.12, 1, .7, 1.5); }                       // hind paws
  sp(.17, -.12, y0 + .12, .52);                                         // ball under the left paw
  sp(.34, 0, y0 + 1.28, .12, 1.05, 1., .95);                            // head
  sp(.2, 0, y0 + 1.15, .36, 1.3, .8, 1.);                               // muzzle
  for (const x of [-1, 1]) { sp(.07, x * .14, y0 + 1.42, .38); put('stone', sph(.035 * s, 5, 4), C.dark, mk(x * .14 * s, (y0 + 1.42) * s, .44 * s)); sp(.08, x * .3, y0 + 1.55, .05); }
  for (let k = 0; k < 13; k++) { const a = k / 12 * PI - PI / 2; sp(.1, Math.sin(a) * .4, y0 + 1.25 + Math.cos(a) * .36, -.05); sp(.09, Math.sin(a) * .36, y0 + 1.0 + Math.cos(a) * .3, -.15); }   // mane curls
  for (let k = 0; k < 5; k++) sp(.07, (k - 2) * .09, y0 + .98, .3);      // collar bells
  sp(.12, 0, y0 + .45, -.72, 1, 1, 1);                                   // tail curl
  pop();
}
function stupa(s = 1) {
  put('stone', box(1.6 * s, .4 * s, 1.6 * s), C.stoneD, mk(0, .2 * s, 0)); put('stone', box(1.3 * s, .4 * s, 1.3 * s), C.stone, mk(0, .6 * s, 0));
  put('stone', lathe([[0, 0], [.6, 0], [.68, .2], [.7, .5], [.62, .85], [.4, 1.05], [.2, 1.1], [0, 1.1]].map(p => [p[0] * s, p[1] * s]), 14), [.92, .9, .86], mk(0, .8 * s, 0));
  put('stone', box(.5 * s, .2 * s, .5 * s), C.stoneD, mk(0, 2.0 * s, 0));
  for (let k = 0; k < 5; k++) put('stone', cyl(.22 * s * (1 - k * .14), .24 * s * (1 - k * .14), .14 * s, 10), C.stoneD, mk(0, (2.2 + k * .2) * s, 0));
  put('metal', sph(.1 * s), C.gold, mk(0, 3.25 * s, 0));
}
function brazier(s = 1) { // bronze fire bowl on a tripod over a stone plinth, burning (dim by day, bright at dusk)
  put('stone', box(1.0 * s, .3 * s, 1.0 * s), C.stoneD, mk(0, .15 * s, 0));
  for (let k = 0; k < 3; k++) { const a = k / 3 * TAU; put('metal', beamAB(new V3(Math.cos(a) * .42 * s, .3 * s, Math.sin(a) * .42 * s), new V3(Math.cos(a) * .22 * s, 1.0 * s, Math.sin(a) * .22 * s), .07 * s, .07 * s), C.bronze); }
  put('metal', lathe([[0, 0], [.2, 0], [.42, .12], [.55, .3], [.6, .34], [.5, .34], [.4, .2], [0, .18]].map(p => [p[0] * s, p[1] * s]), 18), C.bronze, mk(0, .95 * s, 0));
  put('metal', cyl(.6 * s, .6 * s, .04 * s, 18, true), C.gold, mk(0, 1.27 * s, 0));
  put('stone', cyl(.42 * s, .42 * s, .04, 12), [.15, .06, .03], mk(0, 1.2 * s, 0));
  for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + .3, h = (.55 + K.hash(k, s * 7) * .35) * s;
    put('flame', lathe([[0, 0], [.13, .05], [.16, .2], [.1, .45], [.03, .75], [0, 1]].map(p => [p[0] * s * 1.4, p[1] * h]), 7), [.35, 1, 0], mk(Math.cos(a) * .14 * s, 1.21 * s, Math.sin(a) * .14 * s, a)); }
  put('flame', lathe([[0, 0], [.2, .06], [.22, .25], [.12, .6], [.04, .95], [0, 1.15]].map(p => [p[0] * s * 1.4, p[1] * s]), 8), [.35, 1, 0], mk(0, 1.21 * s, 0));
  const fp = wp(0, 1.6 * s, 0); ARCH.fires.push(fp); LIGHTX.push([fp, 3.0 * s]); ARCH.smoke.push({ pos: wp(0, 2.3 * s, 0), s: s * .8, kind: 'brazier' });
}
function candleRow(n, w, y0 = 0) { put('wood', box(w + .2, .06, .3), C.vermD, mk(0, y0 + .03, 0)); put('wood', box(w + .2, .06, .25), C.vermD, mk(0, y0 + .2, -.1)); for (let i = 0; i < n; i++) { const x = -w / 2 + w * i / (n - 1); candle(x, i % 2 ? -.1 : .06, y0 + (i % 2 ? .23 : .06), .12 + K.hash(i, n) * .1); } }
function table(s = 1) { put('wood', box(1.6 * s, .08 * s, .7 * s), C.verm, mk(0, .9 * s, 0)); for (const [x, z] of [[-.7, -.28], [.7, -.28], [.7, .28], [-.7, .28]]) put('wood', box(.08 * s, .9 * s, .08 * s), C.vermD, mk(x * s, .45 * s, z * s)); put('wood', box(1.5 * s, .2 * s, .04), C.gold, mk(0, .78 * s, .3 * s));
  for (let k = 0; k < 3; k++) put('metal', lathe([[0, 0], [.12, 0], [.14, .08], [.1, .14], [0, .14]], 10), k === 1 ? C.bronze : C.gold, mk((k - 1) * .45 * s, .94 * s, 0));
  put('stone', sph(.08, 6, 5), [1.1, .7, .2], mk(-.45 * s, 1.1 * s, 0)); put('stone', sph(.08, 6, 5), [1.2, .5, .1], mk(.45 * s, 1.1 * s, 0)); }
function bonsai(s = 1, seed = 1) {
  const r = K.rng(seed);
  put('stone', lathe([[0, 0], [.32, 0], [.4, .3], [.42, .34], [0, .34]], 10), [.45, .55, .62], mk(0, 0, 0, 0, s));
  const tr = [new V3(0, .3 * s, 0)]; let p = tr[0].clone(); for (let i = 0; i < 4; i++) { p = p.clone().add(new V3((r() - .5) * .35 * s, .28 * s, (r() - .5) * .35 * s)); tr.push(p); }
  put('wood', sweep(tr, circ(.05 * s, 5), { scale: t => 1 - t * .6 }), C.wood);
  for (let i = 0; i < 4; i++) { const c = tr[2 + (i % 3)].clone().add(new V3((r() - .5) * .45 * s, (r() * .08) * s, (r() - .5) * .45 * s)); for (let k = 0; k < 5; k++) { const q = c.clone().add(new V3((r() - .5) * .22 * s, (r() - .3) * .08 * s, (r() - .5) * .22 * s)); put('stone', new THREE.IcosahedronGeometry(.09 * s, 0), [.035, .07, .02], mk(q.x, q.y, q.z, r() * 3, 1, .75, 1, r() * 3)); } }
}
function prayerWheels(n, sp, s = 1) { // row along local x; returns positions (wheels are instanced)
  put('wood', box(n * sp + .4, .1, .4), C.vermD, mk((n - 1) * sp / 2, 1.85 * s, 0)); put('wood', box(n * sp + .4, .1, .4), C.vermD, mk((n - 1) * sp / 2, .15 * s, 0));
  for (let i = 0; i < n; i++) WHEELS.push(wp(i * sp, .25 * s, 0));
}
const WHEELS = [];

// ---------------------------------------------------------------- rock queries
const T = W.temple;
const thOf = (x, z, s = T) => Math.atan2(z - s.z, x - s.x);
const rockR = (y, th, s = T) => W.spireR(s, Math.max(0, y), th);
const onRock = (th, y, off, s = T) => { const r = rockR(y, th, s) + off; return new V3(s.x + Math.cos(th) * r, y, s.z + Math.sin(th) * r); };
// timber cantilever beams + posts fixing a floor polygon area to the cliff below. floor rectangle in local frame; checks rock in world
function stiltsUnder(hw, hd, y0, drop = 14, sp = 1.8) {
  for (let x = -hw; x <= hw + 1e-3; x += (2 * hw) / Math.max(1, Math.round(2 * hw / sp))) {
    // cantilever beam: runs from the front (local +z) back into the rock (local -z)
    put('wood', box(.24, .3, hd * 2 + 3), C.wood, mk(x, y0 - .35, -1.5));
    // long post from the front edge down until it meets rock
    const top = wp(x, y0 - .5, hd - .2); let yb = null; for (let y = top.y - 1; y > top.y - drop; y -= .5) { if (W.inSpire(top.x, y, top.z, .3)) { yb = y - .5; break; } }
    if (yb !== null) { const L = top.y - yb; put('wood', cyl(.12, .14, L, 8), C.wood, mk(x, y0 - .5 - L / 2, hd - .2));
      const bL = Math.min(L * .7, 6); put('wood', beamAB(new V3(x, y0 - .5 - bL * .8, hd - .2), new V3(x, y0 - .6, -hd * .2), .14, .14), C.wood); }
    else { // raking strut from the front edge down into the cliff, with a knee brace
      put('wood', beamAB(new V3(x, y0 - .45, hd - .2), new V3(x, y0 - 5.5, -hd - 1.5), .18, .18), C.wood);
      put('wood', beamAB(new V3(x, y0 - 2.6, (hd - .2) * .2 + (-hd - 1.5) * .8 + 1.8), new V3(x, y0 - .45, -hd * .3), .12, .12), C.wood); }
  }
  put('wood', box(hw * 2 + .4, .25, .3), C.wood, mk(0, y0 - .5, hd - .2));
}

// ---------------------------------------------------------------- SITES
const KEYCAM = new V3(-58, 66.4, 184);
function hull(pts) { pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); const lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of pts.slice().reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1)); }
const GP = { C: [-59.25, 176.7], ry: -0.2, bx: [1.5, 2.8, 1.5], bz: [2.7] };
function siteGate() {
  SITE = 'gate';
  const yT = 64.75;  // terrace top (camera eye 1.65 m above)
  const W2 = GP.bx.reduce((a, b) => a + b) / 2, D2 = GP.bz[0] / 2, f = [Math.sin(GP.ry), Math.cos(GP.ry)], r = [Math.cos(GP.ry), -Math.sin(GP.ry)];
  const pc = [GP.C[0] - W2 * r[0] - D2 * f[0], GP.C[1] - W2 * r[1] - D2 * f[1]];
  const foot = []; for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const lx = sx * (W2 + 1.1), lz = sz * (D2 + 1.1); foot.push([pc[0] + lx * r[0] + lz * f[0], pc[1] + lx * r[1] + lz * f[1]]); }
  const poly = hull(foot.concat([[-70.5, 186.5], [-63, 192.5], [-53, 190], [-50.4, 185.6]]));
  // stairwell notch down to the rope bridge deck at bridgeA
  const BA = S.bridgeA, bd = new V3(S.bridgeB.x - BA.x, 0, S.bridgeB.z - BA.z).normalize(), sd = new V3(-bd.z, 0, bd.x);
  const rayEdge = (ox, oz, dx, dz) => { let best = null; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; const ex = q[0] - p[0], ez = q[1] - p[1]; const den = dx * ez - dz * ex; if (Math.abs(den) < 1e-9) continue;
      const t = ((p[0] - ox) * ez - (p[1] - oz) * ex) / den, u = ((p[0] - ox) * dz - (p[1] - oz) * dx) / den; if (t > 0 && u >= 0 && u <= 1 && (!best || t < best.t)) best = { t, i, x: ox + dx * t, z: oz + dz * t }; } return best; };
  const RUN = 4.9, WS = 1.2; const S0 = new V3(BA.x - bd.x * RUN, yT, BA.z - bd.z * RUN);
  { const el = rayEdge(BA.x + sd.x * WS, BA.z + sd.z * WS, -bd.x, -bd.z), er = rayEdge(BA.x - sd.x * WS, BA.z - sd.z * WS, -bd.x, -bd.z);
    if (el && er && el.i === er.i) { const i = el.i, p = poly[i], q = poly[(i + 1) % poly.length]; const dl = (el.x - p[0]) ** 2 + (el.z - p[1]) ** 2, dr = (er.x - p[0]) ** 2 + (er.z - p[1]) ** 2;
      const a = dl < dr ? [el, 1] : [er, -1], b = dl < dr ? [er, -1] : [el, 1];
      poly.splice(i + 1, 0, [a[0].x, a[0].z], [S0.x + sd.x * WS * a[1], S0.z + sd.z * WS * a[1]], [S0.x + sd.x * WS * b[1], S0.z + sd.z * WS * b[1]], [b[0].x, b[0].z]); } }
  { const sh = new THREE.Shape(); poly.forEach((p, i) => i ? sh.lineTo(p[0], -p[1]) : sh.moveTo(p[0], -p[1]));
    const g = new THREE.ExtrudeGeometry(sh, { depth: 12, bevelEnabled: false }); g.rotateX(-PI / 2); g.translate(0, yT - 12, 0); put('stone', g, C.stone);
    const pts = poly.concat([poly[0]]).map(p => new V3(p[0], yT, p[1]));
    put('stone', sweep(pts, [[-.25, -.34], [.2, -.34], [.2, .03], [-.25, .03]], { closed: true, vs: .25 }), C.stoneD);
    put('stone', sweep(pts.map(p => p.clone().add(new V3(0, -2.6, 0))), [[-.1, -.5], [.35, -.5], [.35, .0], [-.1, .0]], { closed: true, vs: .25 }), C.stoneD);
    // stepped corbels under the coping
    let cxm = 0, czm = 0; for (const p of poly) { cxm += p[0] / poly.length; czm += p[1] / poly.length; }
    for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const nC = Math.floor(L / 1.5);
      let nx = (b[1] - a[1]) / L, nz = -(b[0] - a[0]) / L; if ((a[0] - cxm) * nx + (a[1] - czm) * nz < 0) { nx = -nx; nz = -nz; }
      const ry = Math.atan2(nx, nz);
      for (let k = 1; k < nC; k++) { const t = k / nC, x = lerp(a[0], b[0], t), z = lerp(a[1], b[1], t);
        put('stone', box(.42, .5, .55), C.stoneD, mk(x + nx * .1, yT - .62, z + nz * .1, ry)); put('stone', box(.38, .4, .35), C.stoneD, mk(x + nx * .05, yT - 1.05, z + nz * .05, ry)); } }
  }
  for (const p of poly) keep(new V3((p[0] * 2 + -58) / 3, 0, (p[1] * 2 + 184) / 3), 6, yT - 1, yT + 3); keep(new V3(-58, 0, 184), 7, yT - 1, yT + 3);
  // low parapet along the rim facing the view (top ~ 0.8 m) and a full balustrade elsewhere
  { let cx = 0, cz = 0; for (const p of poly) { cx += p[0] / poly.length; cz += p[1] / poly.length; }
    const ins = poly.map(p => { const dx = cx - p[0], dz = cz - p[1], L = Math.hypot(dx, dz); return [p[0] + dx / L * .3, p[1] + dz / L * .3]; });
    const skip = (x, z) => Math.hypot(x - pc[0], z - pc[1]) < W2 + 2.2 || Math.hypot(x - (S0.x + BA.x) / 2, z - (S0.z + BA.z) / 2) < 3.0;
    for (let i = 0; i < ins.length; i++) { const a = ins[i], b = ins[(i + 1) % ins.length]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const n = Math.max(1, Math.round(L / 1.55));
      let run = []; const flush = () => { if (run.length > 1) balustrade(run, yT, { det: 3, sp: 1.75, h: .72 }); run = []; };
      for (let k = 0; k <= n; k++) { const x = lerp(a[0], b[0], k / n), z = lerp(a[1], b[1], k / n); if (skip(x, z)) flush(); else run.push([x, z]); } flush(); }
  }
  // ---- paving with a carved medallion (own material), drainage border
  { const sh = new THREE.Shape(); poly.forEach((p, i) => i ? sh.lineTo(p[0], -p[1]) : sh.moveTo(p[0], -p[1]));
    const g = new THREE.ShapeGeometry(sh); g.rotateX(-PI / 2); g.translate(0, yT + .015, 0); put('pave', g, [1.0, .93, .82]);
    MAT.pave.userData.uniforms.uMed.value.set(GMED[0], GMED[1], 1.7); }
  ARCH.gateTerrace = { poly: poly.map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]), y: yT };
  // ---- the gate pavilion: SE corner column enters the left edge of the key frame
  push(pc[0], yT, pc[1], GP.ry);
  put('stone', box(W2 * 2 + 1.5, .3, D2 * 2 + 1.5), C.stoneD, mk(0, .15, 0)); put('relief', box(W2 * 2 + 1.52, .2, D2 * 2 + 1.52), [.95, .93, .88], mk(0, .15, 0));
  push(0, .3, 0);
  hall({ near: true, bx: GP.bx, bz: GP.bz, ch: 3.05, cr: .19, det: 2, s: .8, sides: { f: 'open', b: i => i === 1 ? 'open' : 'doors', l: 'doors', r: 'open' },
    roof: { type: 'xieshan', H: 2.3, over: 1.15, lift: 0.7, flare: 0.45, P: .25, det: 2, tipLen: 0.85, ridge: .55, cw: 1.15, beasts: 4, lips: true }, lanS: .95, interior: false, lanBack: true });
  put('wood', box(2.7, 2.4, .12), C.verm, mk(0, 1.2, -D2));
  for (let rr = 0; rr < 5; rr++) for (let c = 0; c < 9; c++) put('metal', sph(.032, 6, 4), C.gold, mk(-1.15 + c * .29, .45 + rr * .42, -D2 + .07));
  for (const x of [-.12, .12]) { put('metal', new THREE.TorusGeometry(.09, .015, 5, 12), C.gold, mk(x, 1.25, -D2 + .1)); put('metal', cyl(.07, .07, .03, 10), C.gold, mk(x, 1.36, -D2 + .08, 0, 1, 1, 1, PI / 2)); }
  put('wood', box(1.5, .62, .1), C.blue, mk(0, 2.35, D2 + .05)); put('paint', box(1.3, .44, .02), null, mk(0, 2.35, D2 + .11)); put('metal', box(1.6, .05, .12), C.gold, mk(0, 2.68, D2 + .05)); put('metal', box(1.6, .05, .12), C.gold, mk(0, 2.02, D2 + .05));
  push(W2 - .05, 0, 0); balustrade([[0, -D2 + .25], [0, D2 - .25]], .0, { mat: 'wood', col: C.vermD, h: .85, det: 1 }); pop();
  // a row of red silk lanterns along both visible eaves + one at the corner, and a bronze bell under the corner
  for (let i = 0; i < 4; i++) lantern(wp(-W2 + .4 + i * (2 * W2 - .8) / 3, 3.55, D2 + .62), .85);
  for (let i = 0; i < 3; i++) lantern(wp(W2 + .62, 3.55, -D2 + .3 + i * (2 * D2 - .6) / 2), .85);
  lantern(wp(W2 + .62, 3.75, D2 + .62), 1.05);
  push(W2 + 1.1, 3.95, D2 + 1.1); put('wood', box(.06, .25, .06), C.dark, mk(0, .1, 0)); bell(.22); pop();
  pop(); pop();
  // ---- bridgehead: stair to the deck, guardian lions, ceremonial gate, banners, prayer-flag bundles
  push(S0.x, yT, S0.z, Math.atan2(bd.x, bd.z)); stairs(WS * 2 - .1, yT - 62.05, RUN, { col: C.stoneD, cheek: false }); pop();
  for (const sg of [-1, 1]) { const p = S0.clone().addScaledVector(bd, -3.4).addScaledVector(sd, sg * 2.0); push(p.x, yT, p.z); brazier(.75); pop(); }
  for (const sg of [-1, 1]) { const p = S0.clone().addScaledVector(sd, sg * (WS + .9)).addScaledVector(bd, -.4); push(p.x, yT, p.z, Math.atan2(bd.x, bd.z)); lion(.62, 0, 1); pop(); }
  { const m = S0.clone().addScaledVector(bd, -1.6); pennantPole(m.x + sd.x * 2.6, m.z + sd.z * 2.6, yT, 7.5, FLAGC[0]); pennantPole(m.x - sd.x * 2.6, m.z - sd.z * 2.6, yT, 7.5, FLAGC[1]); }
  // ---- terrace furniture
  for (const [x, z, sc] of GPROPS.lanterns) { push(x, yT, z); stoneLantern(sc); pop(); }
  push(GPROPS.burner[0], yT, GPROPS.burner[1]); bigBurner(.9); pop();
  push(GPROPS.table[0], yT, GPROPS.table[1], GPROPS.table[2]); offeringTable(.9); push(0, 0, .75); candleRow(9, 1.6, 0); pop(); pop();
  push(GPROPS.drum[0], yT, GPROPS.drum[1], GPROPS.drum[2]); drumStand(.8); pop();
  for (const [x, z, r, h, c] of GPROPS.pots) { push(x, yT, z); pot(r, h, c); pop(); }
  for (const [x, z, sd2] of GPROPS.darchor) { push(x, yT, z); darchor(6.5, 6, 3.2, sd2); pop(); }
}
// gate terrace layout (world x, z): medallion centre, props
const GMED = [-56.2, 182.0];
const GPROPS = {
  lanterns: [[-52.3, 187.6, 1.0], [-61.8, 189.6, 1.0]], burner: [-60.6, 186.6], table: [-62.2, 181.4, .55], drum: [-67.6, 186.4, .9],
  pots: [[-53.2, 179.4, .42, .5, [.16, .32, .42]], [-57.2, 186.9, .5, .55, [.52, .62, .5]], [-54.4, 189.4, .4, .45, [.16, .32, .42]], [-64.6, 190.0, .45, .5, [.52, .62, .5]]],
  darchor: [[-66.4, 191.2, .3]],
};
function hullEdge(poly, a, b) { // sub-polyline of poly between the vertices nearest to a and b (forward order)
  const nearest = q => { let bi = 0, bd = 1e9; poly.forEach((p, i) => { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < bd) { bd = d; bi = i; } }); return bi; };
  const ia = nearest(a), ib = nearest(b), o = []; let i = ia; for (let g = 0; g < poly.length + 1; g++) { o.push(poly[i]); if (i === ib) break; i = (i + 1) % poly.length; }
  if (o.length > poly.length / 2 + 1) { o.length = 0; i = ia; for (let g = 0; g < poly.length + 1; g++) { o.push(poly[i]); if (i === ib) break; i = (i - 1 + poly.length) % poly.length; } }
  const sh = .25; let cx = 0, cz = 0; for (const p of poly) { cx += p[0] / poly.length; cz += p[1] / poly.length; }
  return o.map(p => { const dx = cx - p[0], dz = cz - p[1], L = Math.hypot(dx, dz); return [p[0] + dx / L * sh, p[1] + dz / L * sh]; });
}

function midTerrace() {
  SITE = 'mid';
  const M = S.mid, y = M.y; // floor
  // platform from the rock face out to z = 52, x -14..22 ; built on corbels + struts
  const x0 = -14, x1 = 22, zf = 52.5;
  let zb = 99, zx = -99; for (let x = x0; x <= x1; x += 1) for (const yy of [y, y + 4, y + 9]) { let z = 0; while (W.inSpire(x, yy, z, 0) && z < 60) z += .25; zb = Math.min(zb, z); zx = Math.max(zx, z); }
  const zBack = zx - 1.5; const dep = zf - zBack;
  put('stone', box(x1 - x0, 2.2, zx - zb + 2), C.stone, mk((x0 + x1) / 2, y - 1.1, (zb + zx) / 2 - 1));
  push((x0 + x1) / 2, y, (zBack + zf) / 2);
  const hw = (x1 - x0) / 2, hd = dep / 2; for (let x = x0 + 3; x < x1; x += 5) for (let z = zBack + 3; z < zf; z += 5) keep(new V3(x, 0, z), 3.6, y - 1, y + 12);
  put('stone', box(hw * 2, 2.2, hd * 2), C.stone, mk(0, -1.1, 0));
  put('stone', box(hw * 2 + .4, .3, hd * 2 + .4), C.stoneD, mk(0, -.15, .0));
  // massive corbels under the front, stepping into the rock
  put('stone', box(hw * 2 + .2, .5, .5), C.stoneD, mk(0, -2.45, hd - .1));
  for (let x = -hw + .6; x <= hw - .5; x += 1.2) { put('stone', box(.5, .45, .55), C.stoneD, mk(x, -2.9, hd - .2)); put('stone', box(.4, .4, .35), C.stoneD, mk(x, -3.3, hd - .3)); }
  for (let x = -hw + 1.5; x <= hw - 1.4 + 1e-3; x += 3.6) {
    const sh = new THREE.Shape(); sh.moveTo(hd, -2.2); sh.lineTo(hd - .2, -3.2); sh.quadraticCurveTo(hd - 2.5, -6.5, -hd, -11); sh.lineTo(-hd, -2.2); sh.lineTo(hd, -2.2);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 1.2, bevelEnabled: false, curveSegments: 6 }); g.applyMatrix4(mk(x + .6, 0, 0, -PI / 2)); put('stone', g, C.stoneD);
    put('wood', beamAB(new V3(x + 1.8, -2.4, hd - .6), new V3(x + 1.8, -13, -hd + 1), .32, .32), C.wood); put('wood', beamAB(new V3(x - .6, -2.4, hd - .6), new V3(x - .6, -13, -hd + 1), .32, .32), C.wood); }
  // paving top: front balustrade with lanterns
  balustrade([[-hw + .2, hd - .3], [-1.5, hd - .3]], 0, { det: 1 }); balustrade([[2.5, hd - .3], [hw - .2, hd - .3]], 0, { det: 1 });
  balustrade([[-hw + .2, -hd + 2], [-hw + .2, hd - .3]], 0, {}); balustrade([[hw - .2, hd - .3], [hw - .2, -hd + 2]], 0, {});
  for (let x = -hw + 1.8; x < hw; x += 3.4) { put('stone', box(.25, 1.6, .25), C.stoneD, mk(x, .8, hd - .3)); put('wood', box(.7, .08, .08), C.dark, mk(x, 1.6, hd - .1)); lantern(wp(x, 1.55, hd + .2), .7); }
  // main two-storey hall against the cliff
  push(1, 0, -hd + 6.6);
  put('stone', box(17, .9, 10.5), C.stoneD, mk(0, .45, 0)); push(-0, .9, 5.25); stairs(4, .9, 1.6, {}); pop();
  push(0, .9, 0);
  const h1 = hall({ bx: [3.0, 3.6, 3.0], bz: [2.6, 3.0], ch: 4.2, cr: .26, det: 2, s: .95, sides: { f: 'doors', b: 'wall', l: 'wall', r: 'wall' },
    roof: { type: 'hip', H: 3.2, over: 1.3, lift: .55, flare: .4, P: .28, det: 2, dTop: 2.0, tipLen: .7 }, lanS: 1.1 });
  // upper storey
  const yU = h1.yP + 0.9; push(0, yU, 0);
  put('wood', box(h1.W2 * 2 + 1.4, .25, h1.D2 * 2 + 1.4), C.vermD, mk(0, -.12, 0));
  balustrade([[-h1.W2 - .6, h1.D2 + .6], [h1.W2 + .6, h1.D2 + .6], [h1.W2 + .6, -h1.D2 - .6], [-h1.W2 - .6, -h1.D2 - .6], [-h1.W2 - .6, h1.D2 + .6]], 0, { mat: 'wood', col: C.verm, h: 1.0 });
  hall({ bx: [3.0, 3.6, 3.0], bz: [2.6, 3.0], ch: 3.4, cr: .22, det: 2, s: .9, sides: { f: 'doors', b: 'wall', l: 'doors', r: 'doors' },
    roof: { type: 'xieshan', H: 3.6, over: 1.4, lift: .9, flare: .55, P: .28, det: 2, tipLen: 1.1, ridge: .8, pearl: true }, lanS: 1.1 });
  pop();
  // the lower pent roof needs a proper H: re-run with the right rise
  pop(); pop();
  // banner poles in front of the hall
  pennantPole(-6.5, -hd + 13.6, 0, 9, FLAGC[2]); pennantPole(8.5, -hd + 13.6, 0, 9, FLAGC[0]);
  // incense burner and offering table on the axis
  push(1, 0, -hd + 14.5); burner(1.1); pop(); for (const sx of [-1, 1]) { push(1 + sx * 6.2, 0, -hd + 14.2); brazier(.9); pop(); } push(1, .9, -hd + 10.6); candleRow(9, 2.4, 0); pop(); push(1, .9, -hd + 11.4); table(1); pop();
  // bell tower (west) and drum pavilion (east)
  push(-hw + 3.6, 0, hd - 4.0, 0.1);
  put('stone', box(5.6, 1.1, 5.6), C.stoneD, mk(0, .55, 0)); push(0, 1.1, 0);
  const hb = hall({ bx: [3.6], bz: [3.6], ch: 4.6, cr: .22, det: 1, s: .8, sides: { f: 'open', b: 'open', l: 'open', r: 'open' }, interior: false, roof: { type: 'pyr', H: 3.2, over: 1.2, lift: .7, flare: .45, P: .28, det: 1, tipLen: .9 } });
  put('wood', box(3.8, .3, .3), C.vermD, mk(0, 3.9, 0)); push(0, 3.75, 0); bell(1.15); pop();
  put('wood', rodAB(new V3(-1.6, 2.4, -.2), new V3(-0.9, 2.4, -.2), .1, 8), C.wood);
  pop(); pop();
  push(hw - 3.4, 0, hd - 4.2, -0.1);
  put('stone', box(5.0, .8, 5.0), C.stoneD, mk(0, .4, 0)); push(0, .8, 0);
  hall({ bx: [3.2], bz: [3.2], ch: 3.8, cr: .2, det: 1, s: .78, sides: { f: 'open', b: 'open', l: 'open', r: 'open' }, interior: false, roof: { type: 'pyr', H: 2.8, over: 1.1, lift: .7, flare: .45, P: .28, det: 1, tipLen: .8 } });
  push(0, 1.4, 0); drum(1.0); pop(); pop(); pop();
  // prayer wheel gallery along the back east side
  push(9.5, 0, -hd + 1.6, 0); prayerWheels(10, .55, 1); pop();
  push(-12.5, 0, -hd + 1.6, 0); prayerWheels(8, .55, 1); pop();
  // guardian lions at the stair
  push(-1.5, 0, -hd + 13.0); lion(.8, 0); pop(); push(3.5, 0, -hd + 13.0); lion(.8, 0); pop();
  push(-hw + 1.2, 0, -hd + 9); stoneLantern(.9); pop(); push(hw - 1.2, 0, -hd + 9); stoneLantern(.9); pop();
  for (let i = 0; i < 4; i++) { push(-8 + i * 5.3, 0, hd - 1.2); bonsai(1.1, 11 + i); pop(); }
  pop();
  // bridge landing (front-left) at bridgeB
  const B = S.bridgeB; push(B.x, B.y, B.z - 1.2, 0.33);
  put('stone', box(4.2, 2.6, 4.6), C.stone, mk(0, -1.3, 0)); 
  pop();
  // lantern strings between the hall and the side pavilions
  lanternLine(new V3(-11, 63.4, zf - 4.2), new V3(-3.5, 64.4, zBack + 9), .8, 6, .5);
  lanternLine(new V3(18.5, 63.0, zf - 4.4), new V3(9.5, 64.4, zBack + 9), .8, 6, .5);
  lanternLine(new V3(-11, 63.4, zf - 4.2), new V3(18.5, 63.0, zf - 4.4), 1.4, 16, .45);
  return { zBack, zf };
}

// ceremonial timber gate (paifang-like): two columns on stone drums with clasping stones, painted beams, a pattern panel, a small tiled roof
function paifang(w, h, s = 1) {
  for (const x of [-w / 2, w / 2]) { put('stone', box(.7 * s, .5 * s, .7 * s), C.stoneD, mk(x, .25 * s, 0)); for (const z of [-1, 1]) put('stone', tbox(.3 * s, .9 * s, .5 * s, 1.4), C.stoneD, mk(x, .1 * s, z * .4 * s));
    put('wood', cyl(.17 * s, .19 * s, h, 14), C.verm, mk(x, h / 2, 0)); put('metal', cyl(.2 * s, .2 * s, .08, 14), C.gold, mk(x, .55 * s, 0)); }
  put('paint', beamAB(new V3(-w / 2 - .3, h - .3 * s, 0), new V3(w / 2 + .3, h - .3 * s, 0), .3 * s, .45 * s));
  put('paint', beamAB(new V3(-w / 2, h - 1.25 * s, 0), new V3(w / 2, h - 1.25 * s, 0), .26 * s, .3 * s));
  put('wood', box(w * .62, .55 * s, .1), C.blue, mk(0, h - .78 * s, 0)); put('paint', box(w * .55, .42 * s, .13), null, mk(0, h - .78 * s, 0)); put('metal', box(w * .64, .04, .14), C.gold, mk(0, h - .5 * s, 0)); put('metal', box(w * .64, .04, .14), C.gold, mk(0, h - 1.06 * s, 0));
  for (const x of [-w / 2 + .4, w / 2 - .4]) queti(x, 0, h - 1.4 * s, x < 0 ? 0 : PI, .7 * s);
  for (let k = 0; k < 3; k++) { DGLOD = 1; dougong(-w / 2 + .5 + k * (w - 1) / 2, h - .08 * s, 0, 0, .5 * s); dougong(-w / 2 + .5 + k * (w - 1) / 2, h - .08 * s, 0, PI, .5 * s); }
  const hw = w / 2 + .9 * s, hd = .85 * s; roof({ poly: [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]], y0: h + .45 * s, H: .9 * s, lift: .45, flare: .3, P: .22, det: 2, lips: true, over: .7, tipLen: .55, ridge: .38, cw: .9, beasts: 2, sc: .7 });
  for (const x of [-w / 2, w / 2]) lantern(wp(x, h - 1.55 * s, .32 * s), .7 * s);
}
function ropeBridge() {
  SITE = 'bridge';
  const A = new V3(S.bridgeA.x, S.bridgeA.y, S.bridgeA.z), B = new V3(S.bridgeB.x, S.bridgeB.y, S.bridgeB.z);
  const d = new V3().subVectors(B, A); const L = Math.hypot(d.x, d.z); const dir = new V3(d.x, 0, d.z).normalize(); const side = new V3(-dir.z, 0, dir.x);
  BRU.uBA.value.copy(A); BRU.uBD.value.copy(dir); BRU.uBL.value = L; BRU.uBS.value.copy(side);
  const N = 220, sagD = 7.5; const deck = t => new V3().lerpVectors(A, B, t).add(new V3(0, -sagD * 4 * t * (1 - t), 0));
  // deck height (y of the plank tops, no sway) at the point of the span nearest to (x, z); sway: lateral .32*sin(.85 t)+..., vertical ~.14 m mid-span
  ARCH.bridge = { A: A.clone(), B: B.clone(), sag: sagD, deck: (x, z) => { const t = clamp(((x - A.x) * dir.x + (z - A.z) * dir.z) / L, 0, 1); return deck(t).y + .03; } };
  const ry = Math.atan2(dir.x, dir.z);
  for (let i = 0; i <= N; i += 5) { const p = deck(i / N); keep(p, 1.6, p.y - 1, p.y + 2.5); }
  for (let i = 0; i <= N; i++) { const t = i / N; if (i % 9 === 4) continue; const p = deck(t); const r = K.hash(i, 3);
    put('wood', box(1.7 + r * .15, .06, .42), [C.wood[0] * lerp(.7, 1.4, r), C.wood[1] * lerp(.7, 1.35, r), C.wood[2] * lerp(.7, 1.3, r)], mk(p.x, p.y, p.z, ry + (r - .5) * .06, 1, 1, 1, (K.hash(i, 9) - .5) * .05)); }
  const NP = 13; // posts with lanterns every ~10 m
  for (const s of [-1, 1]) {
    const rails = [], low = [], stringers = []; for (let i = 0; i <= 60; i++) { const t = i / 60; const p = deck(t); stringers.push(p.clone().addScaledVector(side, s * .7).add(new V3(0, -.08, 0))); rails.push(p.clone().addScaledVector(side, s * .95).add(new V3(0, 1.05 + .4 * Math.sin(t * PI), 0))); low.push(p.clone().addScaledVector(side, s * .9).add(new V3(0, .5, 0))); }
    put('wood', sweep(rails, circ(.04, 6), {}), C.rope); put('wood', sweep(low, circ(.028, 5), {}), C.rope); put('wood', sweep(stringers, circ(.055, 6), {}), C.rope);
    for (let i = 0; i <= 60; i++) put('wood', rodAB(stringers[i], rails[i], .013, 3), C.rope);
    const tops = [];
    for (let k = 0; k <= NP; k++) { const t = k / NP, p = deck(t).addScaledVector(side, s * 1.0); const hgt = 2.3;
      put('wood', box(.13, hgt + .3, .13), C.verm, mk(p.x, p.y + hgt / 2 - .15, p.z, ry)); put('metal', lathe([[0, 0], [.1, 0], [.11, .05], [.05, .12], [0, .2]], 8), C.gold, mk(p.x, p.y + hgt, p.z));
      const arm = p.clone().addScaledVector(side, s * .45).add(new V3(0, hgt - .15, 0)); put('wood', beamAB(new V3(p.x, p.y + hgt - .15, p.z), arm, .06, .06), C.dark);
      if (k > 0 && k < NP) lantern(arm.clone().add(new V3(0, -.03, 0)), .7);
      tops.push(new V3(p.x, p.y + hgt - .05, p.z)); }
    // five-colour prayer-flag line from post top to post top, flags every ~0.55 m
    for (let k = 0; k < NP; k++) { const a = tops[k], b = tops[k + 1]; const pts = sag(a, b, .35, 16); put('wood', sweep(pts, circ(.008, 3), {}), C.rope);
      const n = Math.round(a.distanceTo(b) / .55); for (let i = 1; i < n; i++) { const t = i / n, p = new V3().lerpVectors(a, b, t); p.y -= .35 * 4 * t * (1 - t); flag(p, .42, .36, FLAGC5[(i + k * 3) % 5], Math.atan2(-dir.z, dir.x) + (s > 0 ? 0 : PI)); } }
  }
  // anchor posts at both ends
  for (const [P0, sgn] of [[A, 1], [B, -1]]) for (const s of [-1, 1]) { const p = P0.clone().addScaledVector(side, s * 1.1).addScaledVector(dir, -sgn * .3);
    put('wood', cyl(.16, .2, 3.6, 10), C.wood, mk(p.x, p.y + .8, p.z)); put('metal', sph(.12), C.gold, mk(p.x, p.y + 2.65, p.z)); }
  // ceremonial gates at both bridgeheads (outside the swaying span)
  SITE = 'gate2';
  { const p = A.clone().addScaledVector(dir, -.2); push(p.x, A.y, p.z, ry + PI / 2); paifang(2.8, 4.0, .78); pop(); }
  for (const sg of [-1, 1]) { const p = B.clone().addScaledVector(dir, 2.6).addScaledVector(side, sg * 2.4); push(p.x, B.y, p.z); brazier(.8); pop(); }
  { const p = B.clone().addScaledVector(dir, .6); push(p.x, B.y, p.z, ry + PI / 2); paifang(3.2, 5.0, .95); pop(); }
}

function summit() {
  SITE = 'summit';
  const Sm = S.summit, y = Sm.y;
  // upper terrace paving & perimeter balustrade following the rim (inset 1.5 m from the rock edge)
  const rim = []; for (let i = 0; i <= 48; i++) { const th = i / 48 * TAU; const r = rockR(141.9, th) - 1.2; rim.push([Math.cos(th) * r, Math.sin(th) * r]); }
  { const sh = new THREE.Shape(); rim.forEach((p, i) => i ? sh.lineTo(p[0], -p[1]) : sh.moveTo(p[0], -p[1])); const g = new THREE.ExtrudeGeometry(sh, { depth: 3, bevelEnabled: false }); g.rotateX(-PI / 2); g.translate(0, y - 2.6, 0); put('stone', g, C.stone); }
  const yF = y + .4; keep(new V3(0, 0, 0), 16, yF - 1, yF + 50);
  balustrade(rim.filter((p, i) => !(i >= 17 && i <= 19)), yF, { det: 1, sp: 1.9 });
  // main hall: two-tier platform, double eaves, faces +z (south toward the key camera)
  const BX = [2.5, 2.9, 3.5, 2.9, 2.5], BZ = [2.3, 3.0, 2.3];
  push(-3.5, yF, 3.2, 0.05);
  push(0, 1.0, 0); platform(8.7, 5.4, 1.0); pop(); push(0, 2.0, 0); platform(7.9, 4.8, 1.0); pop();
  push(0, 1.0, 5.4); stairs(3.0, 1.0, 1.6); pop(); push(0, 2.0, 4.8); stairs(3.0, 1.0, .9); pop();
  balustrade([[-8.5, 5.25], [-1.7, 5.25]], 1.0, {}); balustrade([[1.7, 5.25], [8.5, 5.25], [8.5, -5.25], [-8.5, -5.25], [-8.5, 5.25]], 1.0, {});
  push(0, 2.0, 0);
  const hm = hall({ bx: BX, bz: BZ, ch: 4.6, cr: .28, det: 1, s: 1.0, sides: { f: 'doors', b: 'wall', l: 'wall', r: 'wall' },
    roof: { type: 'hip', H: 2.6, over: 1.4, lift: .7, flare: .5, P: .3, det: 1, dTop: 2.0 }, lanS: 1.15 });
  push(0, hm.yP + 1.0, 0);
  hall({ bx: BX.map(b => b * .8), bz: BZ.map(b => b * .72), ch: 2.4, cr: .24, det: 1, s: .95, sides: { f: 'wall', b: 'wall', l: 'wall', r: 'wall' }, lanterns: false,
    roof: { type: 'xieshan', H: 4.4, over: 1.5, lift: 1.0, flare: .6, P: .3, det: 1, tipLen: 1.3, ridge: .95, pearl: true, cw: 1.7 } });
  pop(); pop(); pop();
  // courtyard in front: incense burner, stone lanterns, lions
  push(-3.5, yF, 10.6); burner(1.2); pop(); for (const x of [-11.2, 4.2]) { push(x, yF, 11.6); brazier(.9); pop(); } push(-3.5, yF + 2.0, 6.0); candleRow(11, 3.2, 0); pop();
  push(-8.3, yF, 10.2); stoneLantern(1.0); pop(); push(1.3, yF, 10.2); stoneLantern(1.0); pop();
  push(-6.8, yF, 12.3); lion(.75); pop(); push(-.2, yF, 12.3); lion(.75); pop();
  // the seven-tier pagoda (octagonal) rises behind the hall
  push(3.5, yF, -9.6);
  pagoda(7, 3.5, 1);
  pop();
  // side pavilion (west) and gate on the south rim
  push(-11.8, yF, 6.5, 0.6); put('stone', box(4.6, .6, 4.6), C.stoneD, mk(0, .3, 0)); push(0, .6, 0);
  hall({ bx: [3.0], bz: [3.0], ch: 3.2, cr: .19, det: 1, s: .78, interior: false, sides: { f: 'open', b: 'open', l: 'open', r: 'open' }, roof: { type: 'pyr', H: 2.6, over: 1.1, lift: .7, flare: .45, P: .3, det: 1 } }); pop(); pop();
  push(-3.6, yF, 14.0, 0.05);
  hall({ bx: [1.2, 2.4, 1.2], bz: [1.5], ch: 3.1, cr: .19, det: 1, s: .72, interior: false, sides: { f: 'open', b: 'open', l: 'wall', r: 'wall' }, roof: { type: 'xieshan', H: 1.7, over: 1.0, lift: .6, flare: .4, P: .26, det: 1, tipLen: .7, ridge: .5 } });
  pop();
  pennantPole(-9.0, 12.6, yF, 8, FLAGC[1]); pennantPole(1.8, 12.6, yF, 8, FLAGC[2]);
  for (const [x, z] of [[10.5, -4], [-6, -10.5], [11, 4.5]]) { push(x, yF, z); stupa(.75); pop(); }
  // prayer wheels along the east side of the courtyard
  push(7.2, yF, 7.5, -PI / 2); prayerWheels(9, .55, 1); pop();
}
function pagoda(tiers, r0, s) {
  let y = 0; DGLOD = 1; DGFORCE = true; const PG = ARCH.pagoda = { x: 0, z: 0, tiers: [] }; { const c = wp(0, 0, 0); PG.x = +c.x.toFixed(2); PG.z = +c.z.toFixed(2); PG.base = +c.y.toFixed(2); }
  put('stone', cyl(r0 * 1.6, r0 * 1.7, 1.4, 8), C.stoneD, mk(0, .7, 0, PI / 8)); put('stone', cyl(r0 * 1.7, r0 * 1.7, 4, 8), C.stone, mk(0, -2, 0, PI / 8)); y = 1.4;
  for (let i = 0; i < tiers; i++) {
    const r = r0 * (1 - i * .07), hT = (i === 0 ? 4.4 : 3.2 - i * .1);
    const ap = r * Math.cos(PI / 8); // apothem
    // body: 8 columns + walls + lintels
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU + PI / 8; const x = Math.cos(a) * r, z = Math.sin(a) * r; put('wood', cyl(.2, .22, hT, 10), C.verm, mk(x, y + hT / 2, z));
      const a2 = (k + 1) / 8 * TAU + PI / 8; const x2 = Math.cos(a2) * r, z2 = Math.sin(a2) * r; put('paint', beamAB(new V3(x, y + hT - .25, z), new V3(x2, y + hT - .25, z2), .26, .45));
      const am = (k + .5) / 8 * TAU + PI / 8; const mx = Math.cos(am) * ap * .97, mz = Math.sin(am) * ap * .97; const ry = Math.atan2(Math.cos(am), Math.sin(am)); const sideL = 2 * r * Math.sin(PI / 8) - .4;
      push(mx, y, mz, ry); if (k % 2 === 0) { doors(sideL, hT - .9, 2); put('wood', box(sideL, .9, .12), C.vermD, mk(0, hT - .45, -.05)); } else wall(sideL, hT - .5, { col: C.plaster }); pop();
      dougong(Math.cos(am) * ap, y + hT + .05, Math.sin(am) * ap, ry, .62); dougong(x * 1.0, y + hT + .05, z * 1.0, Math.atan2(x, z), .66); }
    put('stone', cyl(r * .95, r * .95, hT, 8, false), C.dark, mk(0, y + hT / 2, 0, PI / 8));
    if (i > 0) { // balcony ring
      const br = r + .55; const ring = []; for (let k = 0; k <= 8; k++) { const a = k / 8 * TAU + PI / 8; ring.push([Math.cos(a) * br, Math.sin(a) * br]); } balustrade(ring, y, { mat: 'wood', col: C.verm, h: .85 }); }
    const yE = y + hT + .62;
    const R = r + 1.7 - i * .05; const poly = []; for (let k = 0; k < 8; k++) { const a = -k / 8 * TAU - PI / 8; poly.push([Math.cos(a) * R / Math.cos(PI / 8), Math.sin(a) * R / Math.cos(PI / 8)]); }
    const rNext = r0 * (1 - (i + 1) * .07); const top = i === tiers - 1;
    roof({ poly, y0: yE - .25, H: top ? 4.5 : 1.6, D: top ? undefined : (R - rNext * .7) * 1.8, dTop: top ? undefined : (R - rNext * Math.cos(PI / 8)) + .1, lift: .75, flare: .55, P: .28, det: 1, over: 1.3, tipLen: .9, finialH: 4.6, beasts: 2, raft: true });
    { const Rc = R / Math.cos(PI / 8), yw = wp(0, yE - .25, 0).y; PG.tiers.push({ eaveY: +yw.toFixed(2), topY: +(yw + (top ? 4.5 + 4.6 + 1 : 1.6 + 1.1)).toFixed(2), rFlat: +(R + .55).toFixed(2), rCorner: +(Rc + .55).toFixed(2), rTip: +(Rc + .55 + .9 * 1.1).toFixed(2) }); }
    // a ring of small lanterns hung under the eave of every tier
    for (let k = 0; k < 8; k++) { const a = poly[k], b = poly[(k + 1) % 8]; for (let j = 0; j < 3; j++) { const t = (j + .5) / 3, x = lerp(a[0], b[0], t) * .93, z = lerp(a[1], b[1], t) * .93; lantern(wp(x, yE - .55, z), .36); } }
    y = yE + (top ? 0 : 1.1);
  }
  DGFORCE = false; DGLOD = 1;
}

// a path pinned to Temple Peak's cliff from (th0,y0) to (th1,y1) (radians): rock-cut steps or a timber gallery
function cliffPath(t0, y0, t1, y1, timber, seed, o = {}) {
  const N = 200, off = o.off || .9; let acc = 0, prev = null;
  const rr0 = (th, yy) => Math.max(rockR(yy, th), rockR(yy + 1.5, th), rockR(yy - 1, th));
  for (let i = 0; i <= N; i++) { const u = i / N, th = lerp(t0, t1, u), yy = lerp(y0, y1, u); const r = rr0(th, yy) + off; const q = new V3(Math.cos(th) * r, yy, Math.sin(th) * r);
    if (prev) acc += q.distanceTo(prev); if (prev && acc < (timber ? .5 : .32)) continue; acc = 0; prev = q;
    const ry = Math.atan2(Math.cos(th), Math.sin(th)); const rr = K.hash(i * 3, seed);
    if (!timber) put('stone', box(1.5, .5, 3.2), [.85 + rr * .2, .82 + rr * .2, .78 + rr * .2], mk(q.x - Math.cos(th) * .9, q.y - .25, q.z - Math.sin(th) * .9, ry + (rr - .5) * .05));
    else put('wood', box(1.6, .08, .5), [C.wood[0] * (.8 + rr * .5), C.wood[1] * (.8 + rr * .5), C.wood[2] * (.8 + rr * .5)], mk(q.x, q.y, q.z, ry + PI / 2));
    if (i % (timber ? 6 : 10) === 0) {
      const p2 = new V3(Math.cos(th) * (r + .75), yy, Math.sin(th) * (r + .75)); keep(q, 1.6, yy - .5, yy + 2.5);
      put('wood', box(.12, 1.1, .12), C.verm, mk(p2.x, p2.y + .55, p2.z));
      if (timber) put('wood', beamAB(new V3(p2.x, p2.y - .1, p2.z), new V3(Math.cos(th) * (r - 1.6), yy - 2.2, Math.sin(th) * (r - 1.6)), .12, .12), C.wood);
      if (i % 30 === 0 && i > 0 && i < N) lantern(new V3(p2.x, p2.y + 1.1, p2.z), .45);
    } }
  const rail = []; for (let i = 0; i <= 40; i++) { const u = i / 40, th = lerp(t0, t1, u), yy = lerp(y0, y1, u); const r = rr0(th, yy) + off + .75; rail.push(new V3(Math.cos(th) * r, yy + 1.05, Math.sin(th) * r)); }
  put('wood', sweep(rail, [[-.04, -.04], [.04, -.04], [.04, .04], [-.04, .04]], { closed: true }), C.verm);
  if (timber) { const lo = rail.map(p => p.clone().add(new V3(0, -1.15, 0))); put('wood', sweep(lo, [[-.06, -.12], [.06, -.12], [.06, .12], [-.06, .12]], { closed: true }), C.wood); }
  // a string of small lanterns above the rail
  if (o.lights !== false) { const top = rail.map(p => p.clone().add(new V3(0, 1.3, 0))); for (let k = 0; k < 40; k += 5) { const a = top[k], b = top[Math.min(40, k + 5)]; lanternLine(a, b, .35, 3, .32); } }
}
const HALLS = [];
function moonWindow(r) { // round window in a wall plane facing +z: gilded ring, lattice disc, plaster surround
  put('stone', box(r * 2.6, r * 2.6, .32), C.plaster, mk(0, 0, 0));
  put('lattice', cyl(r, r, .34, 24), [1, 1, 1], mk(0, 0, 0, 0, 1, 1, 1, PI / 2));
  put('metal', new THREE.TorusGeometry(r * 1.03, .07, 6, 28), C.gold, mk(0, 0, .18)); put('wood', new THREE.TorusGeometry(r * 1.15, .06, 6, 28), C.verm, mk(0, 0, .17));
}
function hangingHalls() {
  SITE = 'cliff';
  // [azimuth deg, floor y, width, depth, type]
  const spots = [[128, 86, 9, 4.5, 'moon'], [100, 116, 10, 5, 'double'], [160, 103, 7, 4, 'belv'], [143, 126, 6.5, 3.6, 'hip'], [88, 77, 7, 3.8, 'hall'], [176, 86, 6, 3.6, 'pyr'], [118, 96, 4.2, 4.2, 'tower']];
  const BANC = [[.62, .05, .03], [.85, .6, .08], [.05, .12, .5], [.62, .05, .03]];
  spots.forEach(([deg, y, w, d, type], si) => {
    const th = deg * PI / 180; let r = 0; for (let k = -3; k <= 3; k++) for (const dy of [-2, 0, 2, 4, 7]) r = Math.max(r, rockR(y + dy, th + k * .05));
    const cx = Math.cos(th) * (r + d / 2 - 1.4), cz = Math.sin(th) * (r + d / 2 - 1.4); const ry = Math.atan2(Math.cos(th), Math.sin(th));
    push(cx, y, cz, ry);
    put('wood', box(w + .6, .3, d + 2.4), C.wood, mk(0, -.15, -1.0));
    stiltsUnder(w / 2, d / 2 + .2, 0, 9);
    balustrade([[-w / 2 - .25, -d / 2 + .3], [-w / 2 - .25, d / 2 + .3], [w / 2 + .25, d / 2 + .3], [w / 2 + .25, -d / 2 + .3]], 0, { mat: 'wood', col: C.verm, h: 1.0 });
    // painted + gilded fascia under the balcony (reads at 200 m)
    put('paint', box(w + .7, .45, .12), null, mk(0, -.45, d / 2 + .45)); put('metal', box(w + .75, .06, .14), C.gold, mk(0, -.2, d / 2 + .46)); put('metal', box(w + .75, .06, .14), C.gold, mk(0, -.7, d / 2 + .46));
    const bx = [w / 3 - .4, w / 3 + .8, w / 3 - .4].map(b => b * .85), RO = { over: .9, lift: .7, flare: .45, P: .26, det: 1, tipLen: .75, ridge: .5, beasts: 2, pearl: true, cw: 1.3, finialH: 1.9 };
    let topY = 5;
    if (type === 'double') {
      const h1 = hall({ bx, bz: [d * .5], ch: 3.2, cr: .18, det: 1, s: .7, sides: { f: 'doors', b: 'wall', l: 'doors', r: 'doors' }, roof: Object.assign({}, RO, { type: 'hip', H: 2.2, dTop: 1.2, beasts: 0 }) });
      push(0, h1.yP + .7, 0); balustrade([[-h1.W2 - .5, h1.D2 + .5], [h1.W2 + .5, h1.D2 + .5]], 0, { mat: 'wood', col: C.verm, h: .9 });
      hall({ bx, bz: [d * .5], ch: 2.6, cr: .16, det: 1, s: .65, sides: { f: 'doors', b: 'wall', l: 'wall', r: 'wall' }, roof: Object.assign({}, RO, { type: 'xieshan', H: 2.4 }) }); pop(); topY = h1.yP + 6;
    } else if (type === 'tower') { // slender three-storey tower clamped to the rock
      let yy = 0; for (let k = 0; k < 3; k++) { push(0, yy, 0); const top = k === 2;
        const hh = hall({ bx: [w * .8 - k * .4], bz: [w * .8 - k * .4], ch: 2.8, cr: .16, det: 1, s: .62, sides: { f: k === 1 ? 'wall' : 'doors', b: 'wall', l: 'doors', r: 'doors' },
          roof: Object.assign({}, RO, top ? { type: 'pyr', H: 2.8, finialH: 2.6 } : { type: 'hip', H: 1.6, dTop: .9, beasts: 0 }), lanterns: k !== 1 });
        if (k === 1) { push(0, 1.6, hh.D2 + .02); moonWindow(.75); pop(); }
        if (k < 2) balustrade([[-hh.W2 - .4, hh.D2 + .4], [hh.W2 + .4, hh.D2 + .4]], hh.yP + .7, { mat: 'wood', col: C.verm, h: .8 });
        yy += hh.yP + .7; pop(); } topY = yy + 4;
    } else if (type === 'belv') { // open belvedere: columns only, pyramidal roof, a bench rail
      hall({ bx: [w * .8], bz: [d * .8], ch: 3.0, cr: .18, det: 1, s: .7, interior: false, sides: { f: 'open', b: 'open', l: 'open', r: 'open' }, roof: Object.assign({}, RO, { type: 'pyr', H: 2.6, finialH: 2.2 }) });
    } else if (type === 'moon') {
      const hh = hall({ bx, bz: [d * .5], ch: 3.4, cr: .18, det: 1, s: .72, sides: { f: i => i === 1 ? 'wall' : 'doors', b: 'wall', l: 'doors', r: 'doors' }, roof: Object.assign({}, RO, { type: 'xieshan', H: 2.3 }) });
      push(0, 1.75, hh.D2 + .02); moonWindow(.95); pop();
    } else hall({ bx, bz: [d * .5], ch: 3.2, cr: .18, det: 1, s: .7, sides: { f: 'doors', b: 'wall', l: 'doors', r: 'doors' }, roof: Object.assign({}, RO, { type: type === 'hip' ? 'hip' : type === 'pyr' ? 'pyr' : 'xieshan', H: type === 'pyr' ? 2.6 : 2.1 }) });
    // long silk banners hanging down the cliff from the balcony
    const bh = type === 'tower' ? 4.5 : 8 + K.hash(si, 4) * 6; for (const sx of [-1, 1]) if (type !== 'belv' || sx > 0) banner(new V3(sx * (w / 2 - .2), -.75, d / 2 + .55), 1.0, bh, BANC[(si + (sx > 0 ? 1 : 0)) % 4], 0, { tail: true, vr: bh / 3, flex: .5 });
    // chimney with a smoke thread on two of the halls
    if (si === 0 || si === 4) { put('stone', box(.6, 1.6, .6), C.stoneD, mk(w / 2 - .9, 4.4, -d / 2 + .3)); put('tile', box(.8, .1, .8), C.tile, mk(w / 2 - .9, 5.25, -d / 2 + .3)); ARCH.smoke.push({ pos: wp(w / 2 - .9, 5.5, -d / 2 + .3), s: .7, kind: 'chimney' }); }
    HALLS.push({ th, y, w, d, front: [wp(-w / 2 - .2, 1.6, d / 2 + .3), wp(w / 2 + .2, 1.6, d / 2 + .3)], top: wp(0, topY, d / 2) });
    pop();
  });
  const link = (i, j) => { const A = HALLS[i], B = HALLS[j]; const s0 = Math.sign(B.th - A.th); const ta = A.th + s0 * (A.w / 2 + .6) / (rockR(A.y, A.th) + 2), tb = B.th - s0 * (B.w / 2 + .6) / (rockR(B.y, B.th) + 2); cliffPath(ta, A.y, tb, B.y, true, i * 7 + j, { off: 1.0 });
    const a = A.front[s0 > 0 ? 1 : 0], b = B.front[s0 > 0 ? 0 : 1]; let ok = true; for (let k = 1; k < 10; k++) { const p = a.clone().lerp(b, k / 10); if (W.inSpire(p.x, p.y - 1, p.z, 1)) ok = false; } if (ok) lanternLine(a.clone().add(new V3(0, 1.4, 0)), b.clone().add(new V3(0, 1.4, 0)), 1.2, Math.max(4, Math.round(a.distanceTo(b) / 1.3)), .55); };
  link(4, 0); link(0, 6); link(0, 2); link(2, 5); link(6, 1); link(1, 3);
  // high swags of lanterns from roof to roof (bold shapes at 150-200 m)
  const swag = (i, j) => { const a = HALLS[i].top, b = HALLS[j].top; let ok = true; for (let k = 1; k < 12; k++) { const p = a.clone().lerp(b, k / 12); p.y -= 2.5 * Math.sin(k / 12 * PI); if (W.inSpire(p.x, p.y, p.z, .8)) ok = false; } if (ok) lanternLine(a, b, 2.5, Math.max(5, Math.round(a.distanceTo(b) / 1.6)), .6); };
  swag(4, 6); swag(6, 1); swag(0, 2); swag(2, 3); swag(0, 6);
}
// small shrine niche cut into the rock beside the stair: stone frame, tiled hood, gilded figure, candles, offering bowl (faces local +z)
function shrineNiche(s = 1) {
  put('stone', box(1.2 * s, 1.6 * s, .5 * s), C.stoneD, mk(0, .8 * s, -.15 * s));
  put('stone', box(.8 * s, 1.1 * s, .3 * s), C.dark, mk(0, .75 * s, .02 * s));
  put('tile', box(1.5 * s, .12 * s, .7 * s), C.tile, mk(0, 1.68 * s, .05 * s, 0, 1, 1, 1, .25)); put('metal', sph(.07 * s, 6, 4), C.gold, mk(0, 1.8 * s, 0));
  put('wood', box(1.0 * s, .14 * s, .1 * s), C.verm, mk(0, 1.38 * s, .2 * s)); put('metal', box(1.02 * s, .03, .11 * s), C.gold, mk(0, 1.31 * s, .2 * s));
  put('metal', lathe([[0, 0], [.2, 0], [.22, .06], [.16, .12], [.18, .26], [.12, .4], [.09, .46], [.1, .52], [.05, .6], [0, .62]].map(p => [p[0] * s, p[1] * s]), 12), C.gold, mk(0, .3 * s, .02));
  put('stone', box(1.1 * s, .12 * s, .35 * s), C.stoneD, mk(0, .24 * s, .32 * s)); candle(-.35 * s, .38 * s, .3 * s, .14); candle(.35 * s, .38 * s, .3 * s, .14);
  put('glaze', sph(.06 * s, 6, 5), [.75, .25, .02], mk(0, .36 * s, .36 * s));
  ARCH.fires.push(wp(0, .6 * s, .3 * s));
}
function cliffStair() {
  SITE = 'cliff';
  const RL = K.rock && K.rock.features && K.rock.features.stairLegs;
  const legs = RL && RL.length ? RL : [[72, 58.2, 18, 76, 1], [18, 76, 70, 95, 0], [70, 95, 25, 113, 1], [25, 113, 75, 128, 0], [75, 128, 100, 142.2, 1]];
  for (let li = 0; li < legs.length; li++) {
    const [a0, y0, a1, y1] = legs[li]; const t0 = a0 * PI / 180, t1 = a1 * PI / 180; const stone = legs[li].length > 4 ? !!legs[li][4] : li % 2 === 0;
    cliffPath(t0, y0, t1, y1, !stone, li);
    if (stone) { const n = Math.max(2, Math.round(Math.abs(t1 - t0) * 24 / 6.5)); for (let k = 1; k < n; k++) { const u = k / n, th = lerp(t0, t1, u), yy = lerp(y0, y1, u);
      const rr = rockR(yy + 1, th) - 1.25; push(Math.cos(th) * rr, yy + .15, Math.sin(th) * rr, Math.atan2(Math.cos(th), Math.sin(th))); shrineNiche(.75); pop(); } }
    if (li < legs.length - 1) { const th = t1, r = rockR(y1, th); const q = new V3(Math.cos(th) * (r + .2), y1, Math.sin(th) * (r + .2)); const ry = Math.atan2(Math.cos(th), Math.sin(th));
      push(q.x, y1, q.z, ry); put('stone', box(3.6, 1.0, 4.2), C.stoneD, mk(0, -.5, -.4)); put('stone', tbox(2.4, 2.2, 3.0, .3), C.stoneD, mk(0, -1.0, -.6, 0, 1, -1, 1));
      balustrade([[-1.8, -1.8], [-1.8, 1.7], [1.8, 1.7], [1.8, -1.8]], 0, {});
      if (li === 1) {
        put('stone', box(2.2, .4, 1.0), C.stoneD, mk(0, .2, -1.6)); put('stone', box(2.6, 2.6, .4), C.stoneD, mk(0, 1.5, -2.2)); put('wood', box(1.5, 1.6, .2), C.dark, mk(0, 1.4, -1.95));
        put('metal', lathe([[0, 0], [.3, 0], [.35, .2], [.2, .5], [.22, .8], [.12, 1.0], [0, 1.05]], 10), C.gold, mk(0, .4, -1.7));
        put('tile', box(2.9, .2, 1.2), [1, 1, 1], mk(0, 2.9, -1.7, 0, 1, 1, 1, .25)); burner(.4); }
      else { push(1.1, 0, -1.2); stupa(.5); pop(); }
      pop(); }
  }
  const led = W.spireLedges(T);
  for (const [ly, deg] of [[led[2], 140], [led[3], 112], [led[2], 95], [led[4], 152], [led[1], 160], [led[3], 170], [led[4], 120]]) { const th = deg * PI / 180; const r = rockR(ly - .5, th) - 1.4; push(Math.cos(th) * r, ly - .2, Math.sin(th) * r, -th); stupa(.7); pop(); }
}
function galleryBridge() {
  SITE = 'cliff';
  const N = W.needleW; const y = 112; const th = thOf(N.x, N.z); const thN = Math.atan2(T.z - N.z, T.x - N.x);
  const a = onRock(th, y, -2.5), b = onRock(thN, y, -2.5, N); const dir = b.clone().sub(a); const L = dir.length(); dir.normalize(); const ry = Math.atan2(dir.x, dir.z);
  const mid = a.clone().lerp(b, .5);
  push(mid.x, y, mid.z, ry);
  // timber arch truss under the deck
  const span = L; const arch = []; for (let i = 0; i <= 24; i++) { const u = i / 24; arch.push(new V3(0, -6 + 5.2 * Math.sin(u * PI), -span / 2 + span * u)); }
  for (const x of [-1.3, 1.3]) { const p = arch.map(q => q.clone().add(new V3(x, 0, 0))); put('wood', sweep(p, [[-.2, -.3], [.2, -.3], [.2, .3], [-.2, .3]], { closed: true }), C.wood); for (let i = 1; i < 24; i += 2) put('wood', beamAB(p[i], new V3(x, -.3, p[i].z), .14, .14), C.wood); }
  put('wood', box(3.2, .3, span), C.wood, mk(0, -.15, 0));
  // covered gallery: columns, roof
  const nb = Math.round(span / 3.2); const bays = Array(nb).fill(span / nb);
  push(0, 0, 0, PI / 2);
  hall({ bx: bays, bz: [2.6], ch: 3.0, cr: .15, det: 0, s: .6, interior: false, lanterns: false, sides: { f: 'open', b: 'open', l: 'open', r: 'open' }, roof: { type: 'xieshan', H: 1.6, over: .8, lift: .5, flare: .3, P: .3, det: 0, gable: 1.2, tipLen: .6, ridge: .45, beasts: 0 } });
  pop();
  balustrade([[-1.45, -span / 2], [-1.45, span / 2]], 0, { mat: 'wood', col: C.verm, h: .9 }); balustrade([[1.45, -span / 2], [1.45, span / 2]], 0, { mat: 'wood', col: C.verm, h: .9 });
  for (let i = 1; i < nb; i++) lantern(wp(0, 2.6, -span / 2 + i * span / nb), .55);
  pop();
}
function waterWheel() {
  SITE = 'wheelsite';
  const F = S.falls; const th = thOf(-24, 32); const y = 61; const r = rockR(y, th); const c = onRock(th, y, 4.5); const ry = Math.atan2(Math.cos(th), Math.sin(th));
  // platform (timber) beside the falls
  push(c.x, y - 3.5, c.z, ry); put('wood', box(6, .3, 7), C.wood, mk(0, 0, -.5)); stiltsUnder(3, 3, 0, 10); balustrade([[-3, 2.8], [3, 2.8]], 0, { mat: 'wood', col: C.vermD, h: .9 });
  // the wheel axle frame
  for (const z of [-1.5, 1.5]) { put('wood', beamAB(new V3(-1.8, 0, z), new V3(0, 4.3, z), .25, .25), C.wood); put('wood', beamAB(new V3(1.8, 0, z), new V3(0, 4.3, z), .25, .25), C.wood); put('wood', box(.5, .3, .5), C.dark, mk(0, 4.25, z)); }
  put('wood', box(7.4, .3, 2.2), C.wood, mk(0, -.6, -.5)); put('wood', box(1.6, .1, 6), [.02, .03, .03], mk(0, .16, -.5));
  pop();
  WHEEL.pos = wp(0, 0, 0).set(c.x, y + .7, c.z); WHEEL.ry = -th;
  // flume from the spout to the wheel top
  const s0 = new V3(F.x + 2.5, F.y - 1.0, F.z + 2.0); const s1 = WHEEL.pos.clone().add(new V3(0, 4.0, 0)).addScaledVector(new V3(Math.cos(th), 0, Math.sin(th)), -2.2);
  const fl = []; for (let i = 0; i <= 20; i++) fl.push(new V3().lerpVectors(s0, s1, i / 20));
  put('wood', sweep(fl, [[-.45, .35], [-.45, -.1], [.45, -.1], [.45, .35], [.38, .35], [.38, 0], [-.38, 0], [-.38, .35]], { closed: true }), C.wood);
  WATER.push(fl.map(p => p.clone().add(new V3(0, .22, 0))));
  for (let i = 2; i < 20; i += 3) { const p = fl[i]; let yb = null; for (let yy = p.y - 1; yy > p.y - 9; yy -= .5) if (W.inSpire(p.x, yy, p.z, .2)) { yb = yy - .5; break; }
    if (yb !== null) { for (const s of [-1, 1]) put('wood', rodAB(new V3(p.x + s * .4, p.y - .1, p.z), new V3(p.x + s * .6, yb, p.z), .08, 6), C.wood); continue; }
    // cantilever bracket back to the cliff
    const th2 = Math.atan2(p.z, p.x), rc = rockR(p.y - 2, th2) - .8; const q = new V3(Math.cos(th2) * rc, p.y - 2.5, Math.sin(th2) * rc);
    put('wood', rodAB(new V3(p.x, p.y - .15, p.z), q, .09, 6), C.wood); put('wood', rodAB(new V3(p.x, p.y - .15, p.z), new V3(q.x, p.y - .15, q.z), .08, 6), C.wood); }
}
const WHEEL = { pos: null, ry: 0, mesh: null }, WATER = [];
function wheelMesh() {
  SITE = 'wheel'; const saveXF = XF; XF = new M4();
  const R = 3.6; for (const x of [-.55, .55]) { put('wood', new THREE.TorusGeometry(R, .1, 6, 48), C.wood, mk(x, 0, 0, PI / 2)); put('wood', new THREE.TorusGeometry(R * .8, .07, 6, 40), C.wood, mk(x, 0, 0, PI / 2)); }
  for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; put('wood', box(.12, R * 2 - .1, .12), C.wood, mk(0, 0, 0, 0, 1, 1, 1, a)); for (const x of [-.55, .55]) {} put('wood', box(1.3, .5, .06), C.woodG, mk(0, Math.cos(a) * R * .92, Math.sin(a) * R * .92, 0, 1, 1, 1, a)); }
  for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; for (const x of [-.55, .55]) put('wood', box(.08, .1, R * .9), C.wood, mk(x, Math.cos(a) * R * .5, Math.sin(a) * R * .5, 0, 1, 1, 1, a + PI / 2)); }
  put('wood', cyl(.25, .25, 2.4, 10), C.dark, mk(0, 0, 0, 0, 1, 1, 1, 0, PI / 2));
  XF = saveXF;
}

const LAKEP = new V3();
function lakeside() {
  SITE = 'lake';
  const P = S.shore; const y = P.y + .6; const Wr = W.wallR; const dx = P.x - Wr.x, dz = P.z - Wr.z, dl = Math.hypot(dx, dz); let px = P.x, pz = P.z;
  const ux = dz / dl, uz = -dx / dl; // local +x (along the shore)
  for (let k = 0; k < 160; k++) { let hit = false; for (const t of [-21, -14, -7, 0, 7, 14, 21]) for (const o of [-5, 0, 5]) { const q = [px + ux * t + dx / dl * o, pz + uz * t + dz / dl * o]; for (const yy of [0, 4]) if (W.inSpire(q[0], yy, q[1], 1)) hit = true; } if (!hit) break; px += dx / dl * .5; pz += dz / dl * .5; }
  LAKEP.set(px, y, pz); if (DBG) console.warn('LAKEP', px.toFixed(1), pz.toFixed(1));
  ARCH.lake = { x: +px.toFixed(2), z: +pz.toFixed(2), ry: +Math.atan2(dx, dz).toFixed(4), y };
  push(px, y, pz, Math.atan2(dx, dz));
  // stilts in the water
  for (let x = -4.5; x <= 4.5; x += 2.25) for (let z = -4.5; z <= 4.5; z += 2.25) put('wood', cyl(.16, .2, 7, 8), C.wood, mk(x, -3.6, z));
  put('wood', box(10.4, .35, 10.4), C.wood, mk(0, -.18, 0));
  balustrade([[-5, -2], [-5, 5], [5, 5], [5, -5], [1.5, -5]], 0, { mat: 'wood', col: C.verm, h: .9 });
  hall({ bx: [2.4, 3.2, 2.4], bz: [2.4, 3.2, 2.4].map(b => b * .9), ch: 3.4, cr: .2, det: 1, s: .8, interior: false, sides: { f: 'open', b: 'open', l: 'open', r: 'open' }, lanBack: true,
    roof: { type: 'xieshan', H: 2.6, over: 1.1, lift: .8, flare: .5, P: .28, det: 1, tipLen: .9, ridge: .6 } });
  // jetty toward the open lake (local -x)
  for (let i = 0; i < 9; i++) { const x = -6 - i * 1.6; for (const z of [-.8, .8]) put('wood', cyl(.1, .12, 4, 6), C.wood, mk(x, -2, z)); }
  for (let i = 0; i < 48; i++) { const r = K.hash(i, 77); put('wood', box(.28, .08, 1.9), [C.wood[0] * (.8 + r * .5), C.wood[1] * (.8 + r * .5), C.wood[2] * (.8 + r * .5)], mk(-5.4 - i * .3, -.05, 0, (r - .5) * .04)); }
  lantern(wp(-19.5, 1.6, .9), .6); put('wood', cyl(.07, .07, 2.2, 6), C.dark, mk(-19.5, 1.0, .9)); put('wood', box(.6, .06, .06), C.dark, mk(-19.3, 2.05, .9));
  // moon bridge to a small walled islet (local +x)
  const span = 9; const arc = [], arcI = []; for (let i = 0; i <= 30; i++) { const u = i / 30, a = PI * u; arc.push(new V3(5.4 + span * u, -.6 + Math.sin(a) * 3.0, 0)); }
  put('stone', sweep(arc, [[-1.0, -.5], [1.0, -.5], [1.0, .1], [-1.0, .1]], { closed: true, vs: .3, up: new V3(0, 0, 1) }), C.stone);
  const ring = []; for (let i = 0; i <= 40; i++) { const a = i / 40 * TAU; ring.push(new V3(5.4 + span / 2 + Math.cos(a) * span * .48, -.6 + Math.sin(a) * span * .48 * .62 + .0, 0)); }
  { const pts = arc.map(p => p.clone()); for (const s of [-1, 1]) { const rp = pts.map(p => [p.x, p.z + s * 1.0]); }
    for (const s of [-1, 1]) { const rail = arc.map(p => p.clone().add(new V3(0, .75, s * .95))); put('stone', sweep(rail, [[-.08, -.7], [.08, -.7], [.08, .08], [-.08, .08]], { closed: true, up: new V3(0, 1, 0) }), C.stoneD); } }
  push(5.4 + span + 3.5, 0, 0);
  put('stone', cyl(3.6, 4.0, 5, 16), C.stone, mk(0, -2.5, 0)); put('stone', cyl(3.8, 3.8, .3, 16), C.stoneD, mk(0, .05, 0));
  push(0, .2, 0); stupa(.9); pop(); push(-2.6, .2, 1.8); stoneLantern(.7); pop(); push(1.5, .2, 2.2); bonsai(1.3, 21); pop();
  pop();
  pop();
  // shrine on the isle rock
  const I = W.isle; const yI = I.h; push(I.x, yI, I.z, 0.4);
  put('stone', box(4, 1.5, 4), C.stone, mk(0, -.55, 0));
  hall({ bx: [2.4], bz: [2.0], ch: 2.4, cr: .14, det: 1, s: .6, sides: { f: 'doors', b: 'wall', l: 'wall', r: 'wall' }, roof: { type: 'xieshan', H: 1.4, over: .8, lift: .55, flare: .35, P: .24, det: 1, tipLen: .6, ridge: .4, beasts: 2 } });
  pop();
}
function farShrines() {
  SITE = 'far';
  const fwd = new V3(54, 0, -124).normalize(); const pick = [];
  for (const s of W.spires) { if (!/^p\d/.test(s.name)) continue; const d = new V3(s.x - KEYCAM.x, 0, s.z - KEYCAM.z); const dist = d.length(); if (dist > 1100) continue; const c = d.normalize().dot(fwd); if (c < .75) continue; pick.push({ s, dist }); }
  pick.sort((a, b) => a.dist - b.dist);
  let k = 0;
  for (const { s } of pick.slice(0, 7)) {
    const y = s.h; push(s.x, y, s.z, s.seed);
    put('stone', box(5, 1.5, 5), C.stone, mk(0, -.5, 0));
    if (k % 3 === 2) { // tiny pagoda
      for (let i = 0; i < 4; i++) { const r = 1.6 - i * .25, yy = .2 + i * 2.3; put('wood', cyl(r * .8, r * .8, 2.0, 8), C.verm, mk(0, yy + 1.0, 0)); put('tile', cyl(.2, r + 1.0, .8, 8), C.tile, mk(0, yy + 2.2, 0)); }
      put('metal', cyl(0, .15, 2.5, 6), C.gold, mk(0, 10.9, 0));
    } else hall({ bx: [3.0], bz: [3.0], ch: 2.8, cr: .16, det: 0, s: .7, interior: true, lanterns: false, sides: { f: 'doors', b: 'wall', l: 'wall', r: 'wall' }, roof: { type: k % 2 ? 'pyr' : 'xieshan', H: 2.2, over: 1.0, lift: .6, flare: .4, P: .4, det: 0, beasts: 0 } });
    pop(); k++;
  }
}

// ---------------------------------------------------------------- assemble
const VC = {};
// per-vertex warm light from every lantern / fire within reach (normal-weighted), stored as aLit and scaled by uLit at dusk
let LGRID = null;
function buildLightGrid() {
  const L = []; for (const l of ARCH.lanterns) L.push([l.pos, .9 * l.s * l.s]); for (const f of ARCH.fires) L.push([f.pos || f, .9]); for (const x of LIGHTX) L.push(x);
  const G = new Map(), cs = 7; for (const l of L) { const k = Math.floor(l[0].x / cs) + ',' + Math.floor(l[0].z / cs); if (!G.has(k)) G.set(k, []); G.get(k).push(l); }
  LGRID = { G, cs };
}
function addLit(g) {
  const p = g.attributes.position, n = g.attributes.normal, a = new Float32Array(p.count), { G, cs } = LGRID;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), cx = Math.floor(x / cs), cz = Math.floor(z / cs); let acc = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const c = G.get((cx + dx) + ',' + (cz + dz)); if (!c) continue;
      for (const l of c) { const ex = l[0].x - x, ey = l[0].y - y, ez = l[0].z - z, d2 = ex * ex + ey * ey + ez * ez; if (d2 > 64) continue; const d = Math.sqrt(d2) + 1e-4;
        const nd = (ex * n.getX(i) + ey * n.getY(i) + ez * n.getZ(i)) / d; acc += l[1] * Math.max(0, nd * .6 + .4) / (.6 + d2) * (1 - d2 / 64); } }
    a[i] = Math.min(acc, 3); }
  g.setAttribute('aLit', new THREE.BufferAttribute(a, 1));
}
function finalize() {
  buildLightGrid();
  const shadowC = new V3(-14, 60, 96);
  for (const site in BK) for (const mk2 in BK[site]) {
    const geos = BK[site][mk2]; if (!geos.length) continue;
    const g = mergeIdx(geos, mk2 === 'cloth'); if (DBG) { VC[site + '.' + mk2] = g.attributes.position.count; } if (mk2 === 'stone') worldUV(g, 5.5, 5); else if (mk2 === 'pave') worldUV(g, 4, 4); else if (mk2 === 'stoneU') { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * .35, uv.getY(i) * .35); } else if (mk2 === 'wood') worldUV(g, 2); else if (mk2 === 'metal') worldUV(g, 1);
    if (mk2 !== 'cloth' && mk2 !== 'flame' && site !== 'far') addLit(g);
    g.computeBoundingSphere(); g.computeBoundingBox();
    const mk3 = mk2 === 'stoneU' ? 'stone' : mk2;
    const mat = site === 'gate' && mk2 !== 'cloth' ? matVariant(mk3, 'L') : site === 'bridge' ? matVariant(mk3, 'B') : MAT[mk3];
    const m = new THREE.Mesh(g, mat); m.name = site + '.' + mk2; m.castShadow = (mk2 !== 'cloth' && mk2 !== 'metal' && mk2 !== 'lattice' && mk2 !== 'paint') || site === 'gate'; m.receiveShadow = true;
    if (site === 'far') m.castShadow = false;
    if (site === 'wheel') { WHEEL.mesh = WHEEL.mesh || new THREE.Group(); WHEEL.mesh.add(m); continue; }
    K.scene.add(m);
  }
  if (WHEEL.mesh) { WHEEL.mesh.position.copy(WHEEL.pos); WHEEL.mesh.rotation.set(0, WHEEL.ry, 0, 'YXZ'); K.scene.add(WHEEL.mesh); }
  // lanterns (instanced)
  const lg = lanternGeo(), cg = chimeGeo();
  const o = new THREE.Object3D();
  const lgLo = lanternGeoLo();
  for (const [br, near] of [[false, true], [false, false], [true, false]]) { const L = LANT.filter(l => !!l.b === br && (br || (l.p.distanceTo(KEYCAM) < 45) === near)); if (!L.length) continue;
    const im = new THREE.InstancedMesh(near ? lg : lgLo, br ? matVariant('glow', 'B') : MAT.glow, L.length);
    L.forEach((l, i) => { o.position.copy(l.p); o.scale.setScalar(l.s); o.rotation.set(0, br ? 0 : K.hash(i, 5) * 3, 0); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
    im.castShadow = false; im.receiveShadow = false; im.computeBoundingSphere(); K.scene.add(im); }
  // the lanterns nearest the gate pavilion light its soffit (fake bounce)
  { const c = new V3(GP.C[0], 68, GP.C[1]); const near = ARCH.lanterns.filter(l => l.pos.distanceTo(c) < 14).sort((a, b) => a.pos.distanceTo(c) - b.pos.distanceTo(c)).slice(0, 6);
    near.forEach((l, i) => LANU[i].set(l.pos.x, l.pos.y, l.pos.z, 1.5 * l.s * l.s)); }
  const ic = new THREE.InstancedMesh(cg, MAT.glow, CHIME.length);
  CHIME.forEach((l, i) => { o.position.copy(l.p); o.scale.setScalar(l.s); o.rotation.set(0, 0, 0); o.updateMatrix(); ic.setMatrixAt(i, o.matrix); }); ic.computeBoundingSphere(); K.scene.add(ic);
  if (WHEELS.length) { const wg = wheelGeo(); const iw = new THREE.InstancedMesh(wg, MAT.wheel, WHEELS.length); WHEELS.forEach((p, i) => { o.position.copy(p); o.scale.setScalar(1); o.rotation.set(0, 0, 0); o.updateMatrix(); iw.setMatrixAt(i, o.matrix); }); iw.castShadow = true; iw.receiveShadow = true; iw.computeBoundingSphere(); K.scene.add(iw); }
  // flume water: thin glossy ribbon with flowing streaks
  if (WATER.length) { const wm = K.mat({ key: 'archFlume', color: 0x3a7f86, roughness: .05, metalness: 0, envMapIntensity: 1.5, frag: `{ float f = texture2D(uNoiseTex, vec2(vUv.x*.5, vUv.y*.6 - uTime*.9)).r; diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.85,.92,.95), smoothstep(.55,.75,f)); }`, vertPars: 'varying vec2 vUv;', vert: 'vUv = uv;', fragPars: 'varying vec2 vUv;' });
    for (const p of WATER) { const g = sweep(p, [[-.36, 0], [.36, 0]], { vs: .5 }); K.scene.add(new THREE.Mesh(g, wm)); } }
}
function lanternGeoLo() {
  const parts = []; const add = (g, col, k, m) => { if (m) g.applyMatrix4(m); prep(g, col); const n = g.attributes.position.count; g.setAttribute('aK', new THREE.BufferAttribute(new Float32Array(n).fill(k), 1)); parts.push(g); };
  add(lathe([[0.001, .02], [.12, .0], [.2, -.06], [.26, -.18], [.25, -.3], [.2, -.4], [.12, -.45], [.001, -.46]], 8), [.42, .02, .01], 0, mk(0, -.31, 0));
  add(cyl(.11, .11, .06, 6), C.gold, 1, mk(0, -.3, 0)); add(cyl(.04, .01, .5, 4), [.72, .07, .03], 2, mk(0, -1.05, 0));
  const m = mergeIdx(parts); const aK = []; for (const p of parts) aK.push(...p.attributes.aK.array); m.setAttribute('aK', new THREE.BufferAttribute(new Float32Array(aK), 1)); return m;
}
function lanternGeo() {
  const parts = []; const add = (g, col, k, m) => { if (m) g.applyMatrix4(m); prep(g, col); const n = g.attributes.position.count; g.setAttribute('aK', new THREE.BufferAttribute(new Float32Array(n).fill(k), 1)); parts.push(g); };
  add(cyl(.006, .006, .25, 3), C.dark, 2, mk(0, -.125, 0));
  add(cyl(.05, .05, .05, 8), C.gold, 1, mk(0, -.255, 0));
  add(lathe([[.03, 0], [.1, -.01], [.13, -.04], [.14, -.07], [.001, -.07]], 14), C.gold, 1, mk(0, -.26, 0));
  add(lathe([[0.001, 0], [.14, -.02], [.22, -.08], [.26, -.18], [.25, -.3], [.2, -.4], [.12, -.45], [.001, -.46]], 22), [.42, .02, .01], 0, mk(0, -.31, 0));
  add(lathe([[.001, 0], [.13, 0], [.12, -.03], [.08, -.06], [.03, -.07], [.001, -.07]], 14), C.gold, 1, mk(0, -.76, 0));
  add(sph(.035, 8, 6), C.gold, 1, mk(0, -.86, 0));
  add(cyl(.018, .018, .1, 6), [.75, .08, .03], 2, mk(0, -.94, 0));
  add(sph(.03, 6, 4), C.gold, 1, mk(0, -1.0, 0));
  add(cyl(.045, .012, .55, 10), [.72, .07, .03], 2, mk(0, -1.3, 0));
  const m = mergeIdx(parts); const aK = []; for (const p of parts) aK.push(...p.attributes.aK.array); m.setAttribute('aK', new THREE.BufferAttribute(new Float32Array(aK), 1)); return m;
}
function chimeGeo() {
  const parts = []; const add = (g, col, k, m) => { if (m) g.applyMatrix4(m); prep(g, col); const n = g.attributes.position.count; g.setAttribute('aK', new THREE.BufferAttribute(new Float32Array(n).fill(k), 1)); parts.push(g); };
  add(cyl(.006, .006, .15, 3), C.dark, 2, mk(0, -.075, 0));
  add(lathe([[0.001, 0], [.05, -.01], [.07, -.06], [.09, -.2], [.1, -.22], [.001, -.22]], 10), C.bronze, 1, mk(0, -.15, 0));
  add(cyl(.004, .004, .2, 3), C.dark, 2, mk(0, -.45, 0)); add(box(.12, .16, .01), C.gold, 1, mk(0, -.6, 0));
  const m = mergeIdx(parts); const aK = []; for (const p of parts) aK.push(...p.attributes.aK.array); m.setAttribute('aK', new THREE.BufferAttribute(new Float32Array(aK), 1)); return m;
}
function wheelGeo() {
  const parts = [];
  const g1 = lathe([[0.001, 0], [.16, 0], [.17, .04], [.15, .06], [.16, .4], [.17, .44], [.12, .48], [.03, .52], [.03, .6], [0.001, .6]], 16); prep(g1, [.85, .55, .2]); parts.push(g1);
  const g2 = cyl(.155, .155, .3, 16, true); g2.translate(0, .23, 0); prep(g2, [.5, .06, .03]); parts.push(g2);
  const g3 = cyl(.02, .02, 1.6, 4); g3.translate(0, .8, 0); prep(g3, C.dark); parts.push(g3);
  return mergeIdx(parts);
}

K.reg('arch', {
  init() {
    const t0 = performance.now(), n0 = K.scene.children.length;
    bakeAll(); makeMats();
    const run = (n, f) => { try { f(); } catch (e) { K.fail('arch.' + n, e); } XF = new M4(); STK.length = 0; };
    run('gate', siteGate); run('mid', midTerrace); run('bridge', ropeBridge); run('summit', summit); run('hanging', hangingHalls); run('stair', cliffStair);
    run('gallery', galleryBridge); run('wheel', waterWheel); run('wheelMesh', wheelMesh); run('lake', lakeside); run('far', farShrines);
    finalize(); this.objs = K.scene.children.slice(n0);
    this.ms = performance.now() - t0; if (DBG) console.warn('arch counts', 'lanterns', LANT.length, 'chimes', CHIME.length, 'wheels', WHEELS.length, 'smoke', ARCH.smoke.length, 'keepOut', ARCH.keepOut.length, 'ms', this.ms | 0, JSON.stringify(VC));
  },
  update(F) {
    ARCHU.uLit.value = K.env.lanterns || 0;
    if (WHEEL.mesh) WHEEL.mesh.rotation.set(-F.t * 0.55, WHEEL.ry, 0, 'YXZ');
  }
});

})(window.K=window.K||{},window.THREE);
//# sourceURL=src/30_arch.js

(function(K,THREE){'use strict';
// ============================================================================
// 40_flora — every plant in the film. Trees with real branch skeletons and thousands of alpha-tested
// leaf-cluster cards (baked atlas: alpha as a distance field, normal map, translucency mask), lit with
// sun-through-leaf transmission, baked crown occlusion and leaf-shaped shadows; wind in the vertex shader.
// Species: maples, ginkgos (incl. the thousand-year ginkgo on Temple Peak), Huangshan pines, bamboo, plum,
// magnolia, azalea / berry shrubs, wisteria, ivy and crimson creepers, ferns, grass, silver-grass, lotus.
// Stateless: update(F) only re-bins instances into distance LODs as a pure function of the camera position.
// ============================================================================
const V3 = THREE.Vector3, M4 = THREE.Matrix4, Q4 = THREE.Quaternion;
const { sat, lerp, smooth, rng, clamp } = K;
const W = K.world, S = W.sites, TAU = Math.PI * 2;
const CX = 6, CY = 4;
const C = { mapleA: 0, mapleB: 1, mapleC: 2, mapleD: 3, mapleS: 4, ginkgoA: 5, ginkgoD: 6, pine: 7, pineD: 8, bamboo: 9, broad: 10, broadD: 11,
  fern: 12, grass: 13, reed: 14, blossom: 15, wist: 16, berry: 17, lotus: 18, blossomD: 19, ginkgoB: 20, magnolia: 21, ribbon: 22, ivy: 23 };
const DENSE = { 0: 3, 1: 3, 2: 3, 5: 6, 20: 6, 7: 8, 10: 11, 17: 11, 23: 11, 15: 19, 9: 9 };

// ---------------------------------------------------------------- leaf atlas (6 x 4 cells of 512 px)
const ATLAS = /* glsl */`
#define PI 3.14159265
uniform float uOut;
struct L { float d; float sh; float id; float mt; vec2 n; float tr; };
float h1(float x){ return kHash11(x * 1.731 + 3.7); }
vec2 h2(float x){ return vec2(kHash11(x * 1.317 + 1.1), kHash11(x * 2.171 + 7.3)); }
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
float sdSeg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba)/dot(ba, ba), 0., 1.); return length(pa - ba*h); }
// layer a shape over what is already there (later shapes lie on top and cast a contact shadow)
void put(inout L a, float d, float sh, float id, float mt, vec2 n, float tr){
  if (d < 0. || d < a.d) { a.sh = sh; a.id = id; a.mt = mt; a.n = n; a.tr = tr; }
  else if (a.d < 0.) a.sh *= .58 + .42*smoothstep(0., .03, d);
  a.d = min(a.d, d);
}
// lanceolate lobe along +x: length len, half-width w*len, serration teeth, tipk < 1 draws the tip out to a point
float lobe(vec2 q, float len, float w, float teeth, float tipk){
  float t = q.x/len, tc = clamp(t, 0., 1.);
  float prof = pow(sin(PI*pow(tc, .6)), .8)*mix(1., tipk, smoothstep(.4, 1., tc));
  float saw = teeth > 0. ? (fract(tc*teeth) - .5)*step(.1, tc)*.34 : 0.;
  float d = abs(q.y) - w*len*prof*(1. + saw);
  if (t < 0.) d = max(d, -q.x);
  if (t > 1.) d = max(d, q.x - len);
  return d;
}
// palmate leaf, base at the origin, tip toward +y, central lobe length 1. nl = 3 -> seven lobes, 2 -> five
float palmate(vec2 q, float sd, float nl, float w, float teeth, out float vein, out vec2 cup){
  float d = 1e3; vein = 0.; cup = vec2(0.);
  for (float i = -3.; i <= 3.; i++) {
    float ai = abs(i); if (ai > nl) continue;
    float ang = i*(.66 + .1*(h1(sd + ai) - .5));
    float len = (1. - .05*ai - .055*ai*ai)*(.9 + .2*h1(sd*1.7 + i + 5.));
    vec2 dir = vec2(sin(ang), cos(ang)), prp = vec2(dir.y, -dir.x);
    vec2 lq = vec2(dot(q, dir), dot(q, prp));
    float dl = lobe(lq, len, w, teeth, .5);
    if (dl < d) { d = dl; cup = prp*clamp(lq.y/(w*len), -1., 1.); }
    float inl = step(0., lq.x)*step(lq.x, len*.96);
    vein = max(vein, inl*smoothstep(.02, .006, abs(lq.y)));
    float sv = abs(fract((lq.x - abs(lq.y)*1.5)/len*6.5 + .5) - .5);
    vein = max(vein, inl*.5*smoothstep(.13, .04, sv)*step(abs(lq.y), w*len*.9));
  }
  d = min(d, length(q - vec2(0., .1)) - .12 - w*.5);
  return d;
}
void drawPalm(inout L a, vec2 p, vec2 base, float ang, float S, float sd, float dmg, float nl, float w, float teeth){
  vec2 ax = vec2(sin(ang), cos(ang)), px = vec2(ax.y, -ax.x);
  vec2 q = vec2(dot(p - base, px), dot(p - base, ax))/S;
  if (dot(q, q) > 2.4) return;
  float curl = step(.8, dmg); q.x *= 1. + .9*curl; q.x += curl*.25*q.y*q.y;
  float vein; vec2 cup;
  float d = palmate(q, sd, nl, w, teeth, vein, cup);
  float sh = .8 + .24*vein + .2*(kNoise(q*7. + sd*3.1) - .5) + .1*(kNoise(q*31. + sd) - .5);
  sh *= 1. - .22*smoothstep(-.06, 0., d);
  sh *= 1. - .3*curl*smoothstep(-.1, .3, q.x);
  if (dmg > .3) for (float k = 0.; k < 3.; k++) {
    vec2 c = vec2((h1(sd + k*3.3) - .5)*.9, .2 + .65*h1(sd*2.1 + k));
    float dh = .05 + .08*h1(sd*4.7 + k) - length(q - c) + .05*(kNoise(q*19. + k*7.) - .5);
    d = max(d, dh); sh *= .42 + .58*smoothstep(0., .08, -dh);
  }
  vec2 n = (h2(sd*3.1) - .5)*(.9 + .5*curl) + (px*cup.x + ax*cup.y)*.38;
  put(a, d*S/(1. + .5*curl), sh, h1(sd*9.3 + .5), 1., n, 1. - .5*vein);
}
void drawMaple(inout L a, vec2 p, vec2 base, float ang, float S, float sd, float dmg){ drawPalm(a, p, base, ang, S, sd, dmg, 3., .15, 8.); }
void twig(inout L a, vec2 p, vec2 b0, float bend, float tl, float w){
  float d = 1e3; vec2 prev = b0;
  for (float i = 1.; i <= 6.; i++){ float t = i/6.; vec2 c = b0 + vec2(bend*t*t, tl*t); d = min(d, sdSeg(p, prev, c) - w*(1. - .6*t)); prev = c; }
  put(a, d, .9, .3, 0., vec2(0.), 0.);
}
void mapleCluster(inout L a, vec2 p, float sd, float np, float S, float bend, float tl, float dmgAmt){
  vec2 b0 = vec2(.5, .03);
  twig(a, p, b0, bend, tl, .008);
  for (float i = 0.; i <= np; i++){
    float t = i < np ? (i + 1.1)/(np + .9) : 1.;
    vec2 c = b0 + vec2(bend*t*t, tl*t); float ta = atan(2.*bend*t, tl);
    for (float s = -1.; s <= 1.; s += 2.){
      float k = sd + i*7.13 + s*2.71;
      float ang = ta + s*(i < np ? .8 + .4*h1(k) : .3 + .22*h1(k));
      float pl = .05 + .05*h1(k + 1.);
      vec2 lb = c + vec2(sin(ang), cos(ang))*pl;
      put(a, sdSeg(p, c, lb) - .0042, .95, .2, 0., vec2(0.), 0.);
      float dm = h1(k + 2.) < dmgAmt ? .35 + .65*h1(k + 3.) : 0.;
      drawMaple(a, p, lb, ang + s*.3*(h1(k + 4.) - .3), S*(.8 + .35*h1(k + 5.))*(1. - .1*t), k, dm);
    }
  }
}
void mapleDense(inout L a, vec2 p, float sd){
  for (float j = 0.; j < 5.; j++) for (float i = 0.; i < 5.; i++){
    float h = kHash12(vec2(i, j) + sd); vec2 hh = kHash22(vec2(i, j)*1.7 + sd);
    vec2 c = (vec2(i, j) + .5 + (hh - .5)*.85)/5.; c = .5 + (c - .5)*.8;
    if (length(c - .5) > .42 + .1*h) continue;
    float ang = h*6.283, S = .13 + .05*hh.x;
    drawMaple(a, p, c - vec2(sin(ang), cos(ang))*S*.35, ang, S, sd*3. + i*5. + j*11., 0.);
  }
}
void drawGinkgo(inout L a, vec2 p, vec2 base, float ang, float S, float sd);
void drawOval(inout L a, vec2 p, vec2 base, float ang, float len, float w, float sd, float mt, float teeth, float tipk);
// loose leaves, one per quadrant: maple, torn maple, ginkgo fan, petal
void mapleSingles(inout L a, vec2 p, float sd){
  for (float j = 0.; j < 2.; j++) for (float i = 0.; i < 2.; i++){
    float k = sd + i*3. + j*7.; float ang = h1(k)*6.283, S = .2 + .03*h1(k + 1.);
    vec2 c = vec2(.25 + .5*i, .25 + .5*j), ax = vec2(sin(ang), cos(ang));
    if (j < .5) { put(a, sdSeg(p, c - ax*S*.42, c - ax*S*.8) - .004, .95, .2, 0., vec2(0.), 0.); drawMaple(a, p, c - ax*S*.42, ang, S, k, i > .5 ? .5 : 0.); }
    else if (i < .5) { put(a, sdSeg(p, c - ax*.1, c - ax*.19) - .004, .95, .2, 0., vec2(0.), 0.); drawGinkgo(a, p, c - ax*.1, ang, .22, k); }
    else drawOval(a, p, c - ax*.13, ang, .26, .33, k, 1., 0., .85);
  }
}
void drawGinkgo(inout L a, vec2 p, vec2 base, float ang, float S, float sd){
  vec2 ax = vec2(sin(ang), cos(ang)), px = vec2(ax.y, -ax.x);
  vec2 q = vec2(dot(p - base, px), dot(p - base, ax))/S;
  if (dot(q, q) > 1.7) return;
  float r = length(q), th = atan(q.x, q.y), tm = .95 + .3*h1(sd);
  float R = 1. - .12*pow(abs(th)/tm, 2.) + .03*sin(th*21. + sd*9.) + .012*sin(th*57.);
  R *= 1. - .34*exp(-pow(th/.07, 2.))*step(.25, h1(sd*2.3));
  float d = max(r - R, (abs(th) - tm)*r);
  float vein = .5 + .5*sin(th*110.);
  float sh = .78 + .1*vein*smoothstep(.15, .5, r) + .14*r + .14*(kNoise(q*6. + sd) - .5) - .12*smoothstep(-.05, 0., d);
  vec2 n = (h2(sd*3.1) - .5)*.9 + (px*q.x + ax*q.y)*(r - .45)*.6;
  put(a, d*S, sh, h1(sd*9.3), 1., n, 1.);
}
void ginkgoSpur(inout L a, vec2 p, vec2 c, float dir, float sd, float S, float n){
  for (float i = 0.; i < n; i++){
    float k = sd + i*3.7; float ang = dir + (i - (n - 1.)*.5)*(2.6/n) + (h1(k) - .5)*.3; float pl = S*(.55 + .5*h1(k + 1.));
    vec2 lb = c + vec2(sin(ang), cos(ang))*pl;
    put(a, sdSeg(p, c, lb) - .0038, .95, .2, 0., vec2(0.), 0.);
    drawGinkgo(a, p, lb, ang + (h1(k + 2.) - .5)*.5, S*(.8 + .35*h1(k + 3.)), k);
  }
}
void ginkgoDense(inout L a, vec2 p, float sd){
  for (float j = 0.; j < 5.; j++) for (float i = 0.; i < 5.; i++){
    float h = kHash12(vec2(i, j) + sd); vec2 hh = kHash22(vec2(i, j)*1.7 + sd);
    vec2 c = (vec2(i, j) + .5 + (hh - .5)*.85)/5.; c = .5 + (c - .5)*.8;
    if (length(c - .5) > .42 + .1*h) continue;
    float ang = h*6.283, S = .15 + .05*hh.x;
    drawGinkgo(a, p, c - vec2(sin(ang), cos(ang))*S*.5, ang, S, sd*3. + i*5. + j*11.);
  }
}
// pine: a brush of needles
void drawTuft(inout L a, vec2 p, vec2 c, float ang, float len, float sd){
  vec2 q = p - c; float r = length(q); if (r > len*1.05) return;
  vec2 ax = vec2(sin(ang), cos(ang));
  float th = atan(q.x*ax.y - q.y*ax.x, dot(q, ax));
  const float span = 2.4; float dth = span*2./34.;
  float i = floor(th/dth + .5), thi = i*dth, h = h1(i*3.7 + sd);
  float l = len*(.66 + .34*h)*(1. - .3*abs(thi)/span);
  float d = max(r*abs(sin(th - thi)) - .0036*(1. - .45*r/l), r - l);
  d = max(d, (abs(thi) - span)*.01);
  float dir = thi + ang;
  put(a, d, .5 + .7*pow(r/len, 1.6) + .14*(h - .5), h, 1., vec2(cos(dir), -sin(dir))*(h - .5)*.9, .7);
}
void pinePad(inout L a, vec2 p, float sd){
  twig(a, p, vec2(.5, .03), .03, .62, .011);
  for (float i = 0.; i < 7.; i++){
    float t = .16 + .125*i, s = mod(i, 2.)*2. - 1.; vec2 c = vec2(.5 + .03*t*t, .03 + .62*t);
    vec2 e = c + vec2(s*(.17 + .07*h1(sd + i*3.)), .1 + .08*h1(sd + i*7.))*(1. - .3*t);
    put(a, sdSeg(p, c, e) - .0055, .9, .3, 0., vec2(0.), 0.);
    drawTuft(a, p, mix(c, e, .45), s*1.1, .1, sd + i*5.);
    drawTuft(a, p, e, s*(.5 + .5*h1(sd + i)), .12 + .03*h1(sd + i*2.), sd + i*9. + 3.);
    drawTuft(a, p, e + vec2(s*.05, .07), s*.2, .1, sd + i*17. + 5.);
    drawTuft(a, p, c, s*-.6, .095, sd + i*13. + 1.);
  }
  drawTuft(a, p, vec2(.515, .7), 0., .15, sd + 77.);
}
void pineDense(inout L a, vec2 p, float sd){
  for (float j = 0.; j < 4.; j++) for (float i = 0.; i < 5.; i++){
    vec2 hh = kHash22(vec2(i, j)*1.7 + sd);
    vec2 c = (vec2(i + .5*mod(j, 2.), j) + .5 + (hh - .5)*.7)/vec2(5.5, 4.); c = .5 + (c - .5)*.72;
    drawTuft(a, p, c, hh.x*6.283, .17 + .05*hh.y, sd + i*5. + j*11.);
  }
}
// plain leaf (ovate / lanceolate) with midrib and side veins
void drawOval(inout L a, vec2 p, vec2 base, float ang, float len, float w, float sd, float mt, float teeth, float tipk){
  vec2 ax = vec2(sin(ang), cos(ang)), px = vec2(ax.y, -ax.x);
  vec2 q = vec2(dot(p - base, ax), dot(p - base, px));
  if (q.x < -.03 || q.x > len + .03 || abs(q.y) > len*w*1.5 + .03) return;
  float d = lobe(q, len, w, teeth, tipk);
  float mid = smoothstep(.01, .003, abs(q.y)), sv = abs(fract((q.x - abs(q.y)*.9)/len*7.) - .5);
  float vein = max(mid, .45*smoothstep(.12, .04, sv));
  float sh = .8 + .2*vein + .14*(kNoise(q*40. + sd) - .5) - .2*smoothstep(-.012, 0., d);
  vec2 n = (h2(sd*3.1) - .5)*.9 + px*clamp(q.y/(w*len), -1., 1.)*.4;
  put(a, d, sh, h1(sd*9.3), mt, n, 1. - .4*vein);
}
void bambooSpray(inout L a, vec2 p, float sd){
  twig(a, p, vec2(.5, .03), .05, .5, .005);
  for (float k = 0.; k < 3.; k++){
    float t = k < 2. ? .45 + .28*k : 1.; vec2 c = vec2(.5 + .05*t*t, .03 + .5*t); float dir = k < 2. ? (k*2. - 1.)*-1.05 : .1;
    vec2 e = c + vec2(sin(dir), cos(dir))*(k < 2. ? .1 : 0.);
    put(a, sdSeg(p, c, e) - .0035, .9, .3, 0., vec2(0.), 0.);
    for (float j = 0.; j < 5.; j++){ float kk = sd + k*7. + j*3.; drawOval(a, p, e, dir + (j - 2.)*.4 + (h1(kk) - .5)*.2, .28 + .14*h1(kk + 1.), .085, kk, 1., 0., .3); }
  }
}
void broadCluster(inout L a, vec2 p, float sd, float n, float len, float w, float tl){
  twig(a, p, vec2(.5, .03), .07, tl, .006);
  for (float i = 0.; i < n; i++){
    float t = (i + 1.)/n, s = mod(i, 2.)*2. - 1.; vec2 c = vec2(.5 + .07*t*t, .03 + tl*t); float k = sd + i*4.3;
    float ang = (i == n - 1. ? 0. : s*(.75 + .45*h1(k))) + atan(.14*t, tl);
    drawOval(a, p, c, ang, len*(.75 + .4*h1(k + 1.)), w, k, 1., 0., .6);
  }
}
void broadDense(inout L a, vec2 p, float sd){
  for (float j = 0.; j < 5.; j++) for (float i = 0.; i < 5.; i++){
    float h = kHash12(vec2(i, j) + sd); vec2 hh = kHash22(vec2(i, j)*1.7 + sd);
    vec2 c = (vec2(i, j) + .5 + (hh - .5)*.85)/5.; c = .5 + (c - .5)*.8;
    if (length(c - .5) > .42 + .1*h) continue;
    float ang = h*6.283, len = .2 + .08*hh.x;
    drawOval(a, p, c - vec2(sin(ang), cos(ang))*len*.5, ang, len, .22, sd*3. + i*5. + j*11., 1., 0., .6);
  }
}
float rx(float y){ return .5 + .03*sin((y - .03)*5.); }
void fern(inout L a, vec2 p, float sd){
  const float y0 = .03, y1 = .96, sp = .042;
  float t = clamp((p.y - y0)/(y1 - y0), 0., 1.);
  put(a, max(abs(p.x - rx(p.y)) - .006*(1.2 - t), max(y0 - p.y, p.y - y1)), .8, .3, 1., vec2(0.), .5);
  float j0 = floor((p.y - y0)/sp);
  for (float k = -4.; k <= 0.; k++) for (float s = -1.; s <= 1.; s += 2.){
    float j = j0 + k; if (j < 1.) continue; float yb = y0 + j*sp + (s > 0. ? sp*.5 : 0.); if (yb > y1 - .02) continue;
    float tj = (yb - y0)/(y1 - y0);
    float len = .37*smoothstep(0., .14, tj)*pow(1. - tj, .75) + .012;
    drawOval(a, p, vec2(rx(yb), yb), s*(1.12 - .25*tj), len, .15, sd + j*2. + s, 1., 9., .55);
  }
}
float blade(vec2 p, vec2 b, float h, float o1, float o2, float w, out float u){
  u = (p.y - b.y)/h; float uc = clamp(u, 0., 1.);
  float cx = b.x + o1*uc + o2*uc*uc, sl = (o1 + 2.*o2*uc)/h;
  float d = abs(p.x - cx)/sqrt(1. + sl*sl) - w*(1. - .92*uc);
  return max(d, (abs(u - .5) - .5)*h);
}
void grass(inout L a, vec2 p, float sd, float n, float wd, float spread){
  for (float i = 0.; i < n; i++){
    vec2 hh = h2(sd + i*3.17); float h3 = h1(sd*2. + i);
    float bx = .5 + (hh.x - .5)*spread, ht = .42 + .52*h3, lean = ((hh.y - .5)*.9 + (bx - .5)*2.)*.8;
    float u; float d = blade(p, vec2(bx, .025), ht, lean*.12, lean*.5*ht, wd*(.7 + .6*hh.y), u);
    put(a, d, .5 + .65*clamp(u, 0., 1.), h3, 1., vec2(clamp(lean, -.8, .8)*clamp(u, 0., 1.), 0.), 1.);
  }
}
void reed(inout L a, vec2 p, float sd){
  for (float k = 0.; k < 3.; k++){
    float top = .64 + .2*h1(sd + k*3.1), bx = .5 + (k - 1.)*.09 + (h1(sd + k) - .5)*.04, lean = (h1(sd + k*7.) - .5)*.2;
    float u;
    for (float j = 0.; j < 5.; j++){
      float yb = .04 + .1*j + .04*h1(sd + k*5. + j), s = mod(j + k, 2.)*2. - 1.;
      float bh = .26 + .22*h1(sd + j*2.3 + k), o2 = s*(.12 + .2*h1(sd + j + k*7.));
      float d = blade(p, vec2(bx + lean*pow(yb/top, 2.), yb), bh, s*.02, o2, .012, u);
      put(a, d, .55 + .55*clamp(u, 0., 1.), h1(sd + j*1.3 + k*4.), 1., vec2(s*clamp(u, 0., 1.)*.7, 0.), 1.);
    }
    float ds = blade(p, vec2(bx, .025), top, 0., lean, .0065, u);
    put(a, ds, .8, .5, 1., vec2(0.), .6);
    vec2 pa = vec2(bx + lean, top - .01), pb = pa + vec2(lean*1.2 + (h1(sd + k*9.) - .5)*.12, .2 + .06*h1(sd + k*11.));
    vec2 ba = pb - pa; float hh = clamp(dot(p - pa, ba)/dot(ba, ba), 0., 1.);
    float dp = length(p - pa - ba*hh) - (.006 + .034*sin(PI*pow(hh, .7))) + .03*(kNoise(p*vec2(170., 60.) + k*9.) - .5);
    put(a, dp, .55 + .7*kNoise(p*vec2(260., 40.)), h1(sd + k*13.), .5, vec2(kNoise(p*120.) - .5, 0.), 1.);
  }
}
void drawFlower(inout L a, vec2 p, vec2 c, float R, float sd, float np){
  vec2 q = (p - c)/R; float r = length(q); if (r > 1.3) return;
  float th = atan(q.x, q.y) + sd, seg = 6.2832/np, i = floor(th/seg + .5), tl = th - i*seg;
  vec2 lq = r*vec2(sin(tl), cos(tl));
  float d = length((lq - vec2(0., .58))*vec2(1., .82)) - .43;
  d = max(d, -(length(lq - vec2(0., 1.06)) - .1));
  d = min(d, r - .22);
  float sh = .8 + .3*smoothstep(.15, .9, r) + .06*sin(tl*11.);
  sh = mix(sh, .5 + .5*step(.6, kNoise(q*14. + sd)), smoothstep(.24, .14, r));
  float pa = i*seg - sd;
  put(a, d*R, sh, fract(h1(sd)*.7 + h1(sd + i*.37)*.3), .5, vec2(sin(pa), cos(pa))*.45*smoothstep(.1, .5, r) + (h2(sd) - .5)*.5, 1.);
}
vec2 zz(float t){ return vec2(.5 + .06*sin(t*8.), .03 + .86*t); }
void blossom(inout L a, vec2 p, float sd){
  float d = 1e3; vec2 prev = zz(0.);
  for (float i = 1.; i <= 9.; i++){ vec2 c = zz(i/9.); d = min(d, sdSeg(p, prev, c) - .007*(1.3 - i/9.)); prev = c; }
  d = min(d, sdSeg(p, zz(.3), zz(.3) + vec2(-.22, .16)) - .005); d = min(d, sdSeg(p, zz(.55), zz(.55) + vec2(.24, .13)) - .005);
  put(a, d, .8, .3, 0., vec2(0.), 0.);
  for (float i = 0.; i < 3.; i++){ float k = sd + i*9.; drawOval(a, p, zz(.2 + .3*i), (mod(i, 2.)*2. - 1.)*1.1, .13, .2, k, 1., 0., .6); }
  for (float i = 0.; i < 11.; i++){
    float k = sd + i*4.7; vec2 c = i < 7. ? zz(.14 + .14*i) + (h2(k) - .5)*.1 : (i < 9. ? zz(.3) + vec2(-.22, .16)*(.5 + .5*(i - 7.)) : zz(.55) + vec2(.24, .13)*(.5 + .5*(i - 9.)));
    if (h1(k + 2.) < .2) put(a, length(p - c) - .028, .7, h1(k), .5, vec2(0.), .6);
    else drawFlower(a, p, c, .085 + .035*h1(k + 1.), k, 5.);
  }
}
void blossomDense(inout L a, vec2 p, float sd){
  for (float j = 0.; j < 4.; j++) for (float i = 0.; i < 4.; i++){
    vec2 hh = kHash22(vec2(i, j)*1.7 + sd); vec2 c = (vec2(i, j) + .5 + (hh - .5)*.8)/4.; c = .5 + (c - .5)*.8;
    put(a, sdSeg(p, c, c + (hh.yx - .5)*.3) - .005, .8, .3, 0., vec2(0.), 0.);
    if (hh.x < .8) drawFlower(a, p, c, .1 + .04*hh.y, sd + i*5. + j*11., 5.);
  }
}
void wisteria(inout L a, vec2 p, float sd){
  twig(a, p, vec2(.5, .03), .03, .9, .004);
  for (float j = 0.; j < 56.; j++){
    float t = pow(j/56., .9); vec2 hh = h2(sd + j*1.71);
    float wd = .19*pow(1. - t, .6) + .012;
    vec2 c = vec2(.5 + .03*t*t + (hh.x - .5)*2.*wd, .055 + .88*t + (hh.y - .5)*.03);
    float R = .044*(1. - .68*t)*(.8 + .4*hh.y);
    vec2 q = (p - c)/R; if (dot(q, q) > 4.) continue;
    q = rot((hh.x - .5)*2.5)*q;
    put(a, (length(q*vec2(1., .8) - vec2(0., .15)) - .85)*R, .9 + .2*clamp(q.y, -1., 1.), hh.y, .5, q*.4, 1.);
    put(a, (length(q - vec2(0., -.5)) - .45)*R, .6, hh.y, .5, q*.3, .8);
  }
}
void berries(inout L a, vec2 p, float sd){
  broadCluster(a, p, sd, 6., .24, .2, .7);
  for (float k = 0.; k < 3.; k++){
    float t = .3 + .3*k; vec2 c0 = vec2(.5 + .07*t*t + (mod(k, 2.)*2. - 1.)*.1, .03 + .7*t - .03);
    for (float j = 0.; j < 9.; j++){
      vec2 c = c0 + (h2(sd + k*11. + j*3.1) - .5)*.13; float R = .024 + .008*h1(sd + j + k);
      vec2 q = (p - c)/R; float r = length(q); if (r > 1.6) continue;
      put(a, (r - 1.)*R, .7 + .4*(1. - r*r) + .5*smoothstep(.35, .1, length(q - vec2(-.35, .35))), h1(sd + j*.7 + k), .5, q*.8, .2);
    }
  }
}
void lotus(inout L a, vec2 p){
  vec2 q = p - .5; float r = length(q), th = atan(q.x, q.y);
  float R = .44 + .012*sin(th*9. + 1.) + .006*sin(th*23.);
  float d = max(r - R, -((abs(th - 2.2) - .07)*r));
  float vein = pow(abs(cos(th*11.)), 26.)*smoothstep(.03, .2, r);
  float sh = .74 + .24*vein + .25*smoothstep(.08, 0., r) - .15*smoothstep(-.03, 0., d) + .1*(kNoise(q*20.) - .5);
  put(a, d, sh, .5, 1., -q/R*.5, .9);
}
void magnolia(inout L a, vec2 p, float sd){
  vec2 q0 = p - .5;
  for (float ring = 0.; ring < 2.; ring++) for (float i = 0.; i < 6.; i++){
    float ang = i*1.0472 + ring*.5236 + (h1(sd + i + ring*7.) - .5)*.25;
    float len = (ring < .5 ? .43 : .3)*(.9 + .2*h1(sd*3. + i + ring*5.));
    vec2 ax = vec2(sin(ang), cos(ang)), px = vec2(ax.y, -ax.x);
    vec2 q = vec2(dot(q0, ax), dot(q0, px));
    float d = lobe(q, len, .27, 0., .75), t = clamp(q.x/len, 0., 1.);
    float sh = .55 + .55*t - .12*smoothstep(-.015, 0., d) + .05*sin(q.y*90.);
    put(a, d, sh, .3 + .5*h1(sd + i*3. + ring), .5, ax*(.5 - .3*ring) + px*clamp(q.y/(.27*len), -1., 1.)*.3, 1.);
  }
  put(a, length(q0) - .06, .7, .9, .5, vec2(0.), .3);
}
void ribbon(inout L a, vec2 p){
  float x = p.x - .5 - .06*sin(p.y*9.), w = .26 + .02*sin(p.y*23.);
  float d = max(abs(x) - w, max(.03 - p.y, p.y - .97));
  d = max(d, (p.y - (.97 - .1*(1. - abs(x)/w)))*.7);
  put(a, d, .8 + .2*sin(p.y*31. + x*20.), .5, .5, vec2(cos(p.y*31.)*.5, 0.), 1.);
}
void ivy(inout L a, vec2 p, float sd){
  vec2 prev = vec2(.5, .03); float d = 1e3;
  for (float i = 1.; i <= 8.; i++){ float t = i/8.; vec2 c = vec2(.5 + .05*sin(t*7. + sd), .03 + .9*t); d = min(d, sdSeg(p, prev, c) - .005); prev = c; }
  put(a, d, .9, .3, 0., vec2(0.), 0.);
  for (float i = 0.; i < 8.; i++){
    float t = (i + .5)/8.5, s = mod(i, 2.)*2. - 1., k = sd + i*5.3; vec2 c = vec2(.5 + .05*sin(t*7. + sd), .03 + .9*t);
    float ang = s*(1.2 + .5*h1(k)), pl = .05 + .05*h1(k + 1.);
    vec2 lb = c + vec2(sin(ang), cos(ang))*pl;
    put(a, sdSeg(p, c, lb) - .0035, .95, .2, 0., vec2(0.), 0.);
    drawPalm(a, p, lb, ang + s*.4 + (h1(k + 2.) - .5)*.6, .15 + .05*h1(k + 3.), k, 0., 2., .3, 4.);
  }
}
vec4 bake(vec2 uv){
  vec2 g = uv*vec2(6., 4.), ci = floor(g), p = fract(g); int id = int(ci.x + ci.y*6. + .5);
  L a = L(1., 1., 0., 1., vec2(0.), 1.);
  if (id == 0) mapleCluster(a, p, 11., 3., .21, .06, .52, 0.);
  else if (id == 1) mapleCluster(a, p, 23., 2., .25, -.07, .46, .34);
  else if (id == 2) mapleCluster(a, p, 37., 4., .175, .09, .58, .1);
  else if (id == 3) mapleDense(a, p, 5.);
  else if (id == 4) mapleSingles(a, p, 3.);
  else if (id == 5) { twig(a, p, vec2(.5, .03), .04, .5, .008); ginkgoSpur(a, p, vec2(.505, .2), -1.2, 3., .15, 4.); ginkgoSpur(a, p, vec2(.52, .37), 1.2, 9., .15, 4.); ginkgoSpur(a, p, vec2(.54, .53), 0., 17., .17, 5.); }
  else if (id == 6) ginkgoDense(a, p, 7.);
  else if (id == 7) pinePad(a, p, 3.);
  else if (id == 8) pineDense(a, p, 9.);
  else if (id == 9) bambooSpray(a, p, 5.);
  else if (id == 10) broadCluster(a, p, 13., 9., .25, .21, .68);
  else if (id == 11) broadDense(a, p, 21.);
  else if (id == 12) fern(a, p, 4.);
  else if (id == 13) grass(a, p, 2., 30., .012, .16);
  else if (id == 14) reed(a, p, 6.);
  else if (id == 15) blossom(a, p, 8.);
  else if (id == 16) wisteria(a, p, 2.);
  else if (id == 17) berries(a, p, 31.);
  else if (id == 18) lotus(a, p);
  else if (id == 19) blossomDense(a, p, 12.);
  else if (id == 20) { twig(a, p, vec2(.5, .03), -.05, .42, .008); ginkgoSpur(a, p, vec2(.49, .25), 1.1, 41., .16, 4.); ginkgoSpur(a, p, vec2(.45, .45), -.2, 47., .18, 6.); }
  else if (id == 21) magnolia(a, p, 14.);
  else if (id == 22) ribbon(a, p);
  else ivy(a, p, 19.);
  float bd = min(min(p.x, 1. - p.x), min(p.y, 1. - p.y)); a.d = max(a.d, .018 - bd);
  if (uOut < .5) return vec4(clamp(a.sh*.6, 0., 1.), a.id, a.mt > .75 ? 1. : a.mt > .25 ? 0. : .5, clamp(.5 - a.d*42., 0., 1.));
  vec2 n = a.n; float l = length(n); if (l > .85) n *= .85/l;
  return vec4(n*.5 + .5, sqrt(1. - dot(n, n))*.5 + .5, a.tr);
}`;

// ---------------------------------------------------------------- bark
const BARK = /* glsl */`
float pn(vec2 p, vec2 per){ vec2 i = floor(p), f = fract(p); f = f*f*(3. - 2.*f);
  return mix(mix(kHash12(mod(i, per)), kHash12(mod(i + vec2(1, 0), per)), f.x), mix(kHash12(mod(i + vec2(0, 1), per)), kHash12(mod(i + vec2(1, 1), per)), f.x), f.y); }
float pf(vec2 p, vec2 per){ float s = 0., a = .5; for (int i = 0; i < 5; i++){ s += a*pn(p*per, per); per *= 2.; a *= .5; } return s/.97; }
float barkH(vec2 uv){
  float x = uv.x*9. + (pf(uv + .3, vec2(3., 6.)) - .5)*7.;
  float r = abs(fract(x) - .5)*2.;
  float h = (1. - r*r)*(.55 + .45*pf(uv, vec2(8., 20.)));
  h -= .4*smoothstep(.56, .7, pf(uv + .7, vec2(5., 14.)));
  return clamp(h + .18*pf(uv + .1, vec2(32., 48.)), 0., 1.);
}
vec4 bake(vec2 uv){
  float h = barkH(uv);
  vec3 c = mix(vec3(.085, .068, .055), vec3(.27, .22, .175), smoothstep(.05, .9, h));
  c *= .75 + .5*pf(uv + .5, vec2(6., 9.));
  float lich = smoothstep(.62, .74, pf(uv + .21, vec2(3., 3.)))*smoothstep(.35, .6, h);
  c = mix(c, vec3(.4, .42, .36), lich*.55);
  float moss = smoothstep(.66, .8, pf(uv + .63, vec2(2., 2.)));
  c = mix(c, vec3(.1, .17, .04)*(.6 + .8*h), moss*.6);
  return vec4(c, h);
}`;

// ---------------------------------------------------------------- shaders
const SWAY = /* glsl */`
vec3 kSway(vec3 p, mat4 im){
  float sc = length(im[0].xyz); vec3 ip = im[3].xyz;
  vec3 wl = normalize(vec3(uWind.x, 0., uWind.y)*mat3(im));
  float h = abs(p.y)*sc, rad = length(p.xz)*sc;
  float ph = uWind.w*1.7 + dot(ip.xz, uWind.xy)*.05;
  float g = .6 + .4*sin(ph) + .22*sin(ph*2.7 + 1.3);
  vec3 d = wl*(uWind.z*g*(.004*h*h + .02*rad));
  float bp = uWind.w*3.1 + p.x*1.3 + p.z*1.7 + ip.x;
  d.y += sin(bp)*uWind.z*.035*rad;
  d += cross(vec3(0., 1., 0.), wl)*(cos(bp*1.3)*uWind.z*.025*rad);
  return d/sc;
}`;
const LEAF_VP = /* glsl */`
attribute vec4 aCard; attribute vec3 aNg; attribute vec3 iCol; attribute vec3 iCol2; attribute vec4 iVar;
varying vec3 vCol; varying vec3 vCol2; varying vec4 vLeaf; varying vec2 vVar; varying vec3 vNg;
` + SWAY;
const LEAF_V = /* glsl */`
  float kr = kHash13(aCard.xyz*31.7 + iVar.x);
  float kAcc = step(1.5, aCard.w);
  vec3 kRel = transformed - aCard.xyz; float kl = length(kRel);
  float kfl = iVar.w > 0. ? sin(uTime*(2.6 + 3.4*kr) + kr*47.)*.6 + sin(uTime*6.1 + kr*19.)*.4 : 0.;
  if (iVar.w > 0.) transformed += kSway(aCard.xyz, instanceMatrix) + (normal*.6 + vec3(sin(kr*40.), 0., cos(kr*40.))*.7)*(kfl*uWind.z*.2*iVar.w*kl);
  vCol = iCol; vCol2 = iCol2; vLeaf = vec4(kr, aCard.w - 2.*kAcc, kAcc, 0.); vVar = iVar.yz;
  vNg = normalize(mat3(instanceMatrix)*aNg);
`;
const LEAF_FP = /* glsl */`
varying vec3 vCol; varying vec3 vCol2; varying vec4 vLeaf; varying vec2 vVar; varying vec3 vNg;
float kLeafAO = 1., kLeafT = 0., kLeafGloss = 1.; vec3 kLeafNg = vec3(0., 0., 1.), kLeafTc = vec3(0.);
`;
const LEAF_F = /* glsl */`
  {
    float shade = diffuseColor.r/.6, lid = diffuseColor.g, mid = diffuseColor.b;
    float trn = texture2D(normalMap, vNormalMapUv).a;
    float r1 = fract(lid*7.31 + vLeaf.x*3.71), r2 = fract(lid*13.7 + vLeaf.x*9.13), r3 = fract(lid*29.3 + vLeaf.x*17.7);
    vec3 lc = mix(vCol, vCol2, vLeaf.z)*(.68 + .64*r1)*(.72 + .56*vLeaf.x);
    lc.g += (r2 - .5)*vVar.x*.55*lc.r;
    lc = mix(lc, vec3(.2, .09, .035), step(1. - vVar.y*.6, r3)*.85);
    lc = mix(lc, vec3(.3, .38, .06), step(r3, vVar.y*.4)*.8);
    lc = max(lc, vec3(0.));
    float isLeaf = clamp(mid*2. - 1., 0., 1.), isAcc = clamp(1. - mid*2., 0., 1.);
    vec3 alb = mix(vec3(.1, .07, .045), lc, isLeaf); alb = mix(alb, vCol2*(.75 + .5*r1), isAcc);
    alb *= shade*(.62 + .38*vLeaf.y);
    diffuseColor.rgb = alb;
    kLeafAO = .16 + .84*vLeaf.y; kLeafT = trn*max(isLeaf, isAcc); kLeafGloss = isLeaf;
    kLeafTc = pow(alb, vec3(.72))*vec3(1.15, 1.1, .8);
    kLeafNg = normalize((viewMatrix*vec4(vNg, 0.)).xyz);
    totalEmissiveRadiance += kLeafTc*uSunCol*(.034*kLeafT*(.5 + .5*vLeaf.y));   // sunlight scattered down through the canopy: shaded leaves still glow
    roughnessFactor = .62;
  }
`;
const LEAF_ALPHA = /* glsl */`
  { float kd = length(vWPos - cameraPosition); if (diffuseColor.a < mix(.5, .34, smoothstep(30., 170., kd))) discard; }
`;
const LEAF_LIGHT = /* glsl */`
void RE_Direct_Leaf( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
  float nl = dot(geometryNormal, directLight.direction);
  float form = clamp(dot(kLeafNg, directLight.direction)*.55 + .6, .26, 1.);
  float front = clamp(nl*.75 + .25, 0., 1.), back = clamp(-nl, 0., 1.);
  float glow = pow(clamp(dot(geometryViewDir, -directLight.direction), 0., 1.), 3.);
  vec3 irr = directLight.color;
  reflectedLight.directDiffuse += irr*material.diffuseColor*(RECIPROCAL_PI*front*form);
  reflectedLight.directDiffuse += irr*kLeafTc*(RECIPROCAL_PI*kLeafT*(back*1.25 + glow*.7)*(.45 + .55*form));
  vec3 hv = normalize(directLight.direction + geometryViewDir);
  reflectedLight.directSpecular += irr*(pow(clamp(dot(geometryNormal, hv), 0., 1.), 26.)*.2*clamp(nl*3., 0., 1.)*kLeafGloss);
}`;
// falling leaves: closed-form particles f(seed, time)
const FALL_VP = /* glsl */`
attribute vec4 aSeed; attribute vec4 aVel; attribute vec4 aPar; attribute vec3 iCol;   // aSeed: start xyz + seed · aVel: velocity xyz, birth time (< 0 = periodic) · aPar: half size, leaf shape 0..3, period / life, fall distance
varying vec3 vCol; varying vec3 vCol2; varying vec4 vLeaf; varying vec2 vVar; varying vec3 vNg;
mat3 kRotA(vec3 a, float t){ float c = cos(t), s = sin(t), o = 1. - c; return mat3(o*a.x*a.x + c, o*a.x*a.y + a.z*s, o*a.z*a.x - a.y*s, o*a.x*a.y - a.z*s, o*a.y*a.y + c, o*a.y*a.z + a.x*s, o*a.z*a.x + a.y*s, o*a.y*a.z - a.x*s, o*a.z*a.z + c); }
`;
const FALL_VN = /* glsl */`
  float fs = aSeed.w, fper = aPar.z, fage, life;
  if (aVel.w < 0.) { life = fract(uTime/fper + fs*13.7); fage = life*fper; } else { fage = uTime - aVel.w; life = fage/fper; }
  float fvis = step(0., life)*step(life, 1.)*smoothstep(0., .05, life)*(1. - smoothstep(.88, 1., life));
  mat3 fr = kRotA(normalize(vec3(sin(fs*91.), .5, cos(fs*57.))), fage*(1.5 + 3.*fract(fs*3.7)) + fs*60.)*kRotA(vec3(0., 1., 0.), fage*(.8 + 1.4*fract(fs*5.3)) + fs*31.);
  objectNormal = fr*objectNormal;
`;
const FALL_V = /* glsl */`
  vec3 fo = aSeed.xyz;
  if (aVel.w < 0.) {          // peeling off a crown and drifting down the wind
    fo += aVel.xyz*fage; fo.y -= aPar.w*life*(.55 + .45*life);
    fo.x += sin(fage*.9 + fs*40.)*1.3; fo.z += cos(fage*.75 + fs*23.)*1.3; fo.y += sin(fage*1.7 + fs*11.)*.35;
  } else {                    // torn off by the dragon: dragged along its path, spiralling outward in the wake, then sinking
    float fk = (1. - exp(-fage*.45))/.45; vec3 vd = normalize(aVel.xyz), fu = normalize(cross(vd, vec3(0., 1., 0.))), fw = cross(vd, fu);
    float fa = fs*80. + fage*(1.1 + 2.*fract(fs*9.1))*(fract(fs*2.3) < .5 ? 1. : -1.), frad = 3. + 8.*fract(fs*6.7) + 2.4*fage;
    fo += aVel.xyz*fk + (fu*cos(fa) + fw*sin(fa))*frad + vec3(uWind.x, 0., uWind.y)*(1.6*fage);
    fo.y -= 1.1*fage + .12*fage*fage;
  }
  float fd = length(fo - cameraPosition);
  float fq = mix(min(aPar.x, .075), aPar.x, smoothstep(8., 40., fd)); fq = max(fq, min(fd*.0026, .8));   // true size near the lens, never smaller than ~5 px far away
  transformed = fr*(transformed*(fq*fvis*smoothstep(.9, 1.7, fd))) + fo;
  vMapUv = (vec2(4., 0.) + (vec2(mod(aPar.y, 2.), floor(aPar.y*.5)) + uv)*.5)/vec2(6., 4.); vNormalMapUv = vMapUv;
  vCol = iCol; vCol2 = iCol; vLeaf = vec4(fract(fs*3.3), 1., 0., 0.); vVar = vec2(.5, .08); vNg = vec3(0., 1., 0.);
`;

let atlasA, atlasN, barkA, barkN, leafMat, groundMat, fallMat, woodMat, depthMat;
function mkLeafMat(key, o = {}) {
  const m = K.mat({ key, map: atlasA, normalMap: atlasN, side: THREE.DoubleSide, alphaTest: .42, roughness: .62, metalness: 0, envMapIntensity: .9,
    vertPars: o.fall ? FALL_VP : LEAF_VP, vertNormal: o.fall ? FALL_VN : '', vert: o.fall ? FALL_V : LEAF_V, fragPars: LEAF_FP, frag: LEAF_F });
  const obc = m.onBeforeCompile;
  m.onBeforeCompile = sh => {
    obc(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <alphatest_fragment>', LEAF_ALPHA)
      .replace('#include <lights_physical_pars_fragment>', '#include <lights_physical_pars_fragment>\n' + LEAF_LIGHT)
      .replace('#include <lights_fragment_begin>', '#undef RE_Direct\n#define RE_Direct RE_Direct_Leaf\n#include <lights_fragment_begin>')
      .replace('#include <aomap_fragment>', 'reflectedLight.indirectDiffuse *= kLeafAO; reflectedLight.indirectSpecular *= kLeafAO*kLeafAO; reflectedLight.directDiffuse *= mix(.66, 1., kLeafAO); reflectedLight.directSpecular *= kLeafAO;');
  };
  return m;
}
function mkMaterials() {
  atlasA = K.bake(512 * CX, 512 * CY, ATLAS, { repeat: false, uniforms: { uOut: { value: 0 } } });
  atlasN = K.bake(512 * CX, 512 * CY, ATLAS, { repeat: false, uniforms: { uOut: { value: 1 } } });
  barkA = K.bake(512, 1024, BARK);
  barkN = K.bake(512, 1024, /* glsl */`uniform sampler2D tH; vec4 bake(vec2 uv){ vec2 e = vec2(1./512., 1./1024.);
    float hx = texture2D(tH, uv + vec2(e.x, 0.)).a - texture2D(tH, uv - vec2(e.x, 0.)).a, hy = texture2D(tH, uv + vec2(0., e.y)).a - texture2D(tH, uv - vec2(0., e.y)).a;
    return vec4(normalize(vec3(-hx*6., -hy*3., 1.))*.5 + .5, 1.); }`, { uniforms: { tH: { value: barkA } } });
  leafMat = mkLeafMat('floraLeaf');
  groundMat = mkLeafMat('floraLeaf'); groundMat.polygonOffset = true; groundMat.polygonOffsetFactor = -2; groundMat.polygonOffsetUnits = -2;
  fallMat = mkLeafMat('floraFall', { fall: true });
  woodMat = K.mat({ key: 'floraWood', map: barkA, normalMap: barkN, normalScale: new THREE.Vector2(1.5, 1.5), roughness: .9, metalness: 0, vertexColors: true, envMapIntensity: .5,
    vertPars: 'attribute vec3 iBark; varying vec3 vBark;' + SWAY, vert: 'transformed += kSway(transformed, instanceMatrix); vBark = iBark;',
    fragPars: 'varying vec3 vBark;', frag: 'diffuseColor.rgb *= vBark;' });
  depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: atlasA, alphaTest: .42, side: THREE.DoubleSide });
  depthMat.onBeforeCompile = sh => {
    sh.uniforms.uTime = K.U.uTime; sh.uniforms.uWind = K.U.uWind;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec4 uWind; attribute vec4 aCard;\n' + SWAY)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += kSway(aCard.xyz, instanceMatrix);');
  };
  depthMat.customProgramCacheKey = () => 'floraDepth';
}

// ---------------------------------------------------------------- geometry: cards and tubes
const rv = R => { const z = R() * 2 - 1, a = R() * TAU, s = Math.sqrt(1 - z * z); return new V3(Math.cos(a) * s, z, Math.sin(a) * s); };
// a card: { p base (pivot), a axis (unit, base -> tip), n plane normal (unit), w, h, cell, flip, acc, a2 (second-half axis: bent card), occ, occB, sn shading normal, ng crown normal }
function leafGeo(cards) {
  let nq = 0; for (const c of cards) nq += c.a2 ? 2 : 1;
  const P = new Float32Array(nq * 12), N = new Float32Array(nq * 12), UV = new Float32Array(nq * 8), CD = new Float32Array(nq * 16), G = new Float32Array(nq * 12), I = new Uint32Array(nq * 6);
  const s = new V3(); let q = 0;
  for (const c of cards) {
    const cx = c.cell % CX, cy = (c.cell / CX) | 0; let u0 = cx / CX, u1 = (cx + 1) / CX; const v0 = cy / CY, v1 = (cy + 1) / CY; if (c.flip) { const t = u0; u0 = u1; u1 = t; }
    s.crossVectors(c.a, c.n).normalize().multiplyScalar(c.w * .5);
    const segs = c.a2 ? 2 : 1, sn = c.sn || c.n, ng = c.ng || c.n, oT = c.occ ?? 1, oB = c.occB ?? oT, acc = c.acc ? 2 : 0;
    let bx = c.p.x, by = c.p.y, bz = c.p.z;
    for (let k = 0; k < segs; k++) {
      const ax = k ? c.a2 : c.a, hh = c.h / segs, va = lerp(v0, v1, k / segs), vb = lerp(v0, v1, (k + 1) / segs), oa = lerp(oB, oT, k / segs), ob = lerp(oB, oT, (k + 1) / segs);
      const ex = bx + ax.x * hh, ey = by + ax.y * hh, ez = bz + ax.z * hh, o = q * 12;
      P[o] = bx - s.x; P[o + 1] = by - s.y; P[o + 2] = bz - s.z; P[o + 3] = bx + s.x; P[o + 4] = by + s.y; P[o + 5] = bz + s.z;
      P[o + 6] = ex + s.x; P[o + 7] = ey + s.y; P[o + 8] = ez + s.z; P[o + 9] = ex - s.x; P[o + 10] = ey - s.y; P[o + 11] = ez - s.z;
      UV.set([u0, va, u1, va, u1, vb, u0, vb], q * 8);
      for (let v = 0; v < 4; v++) {
        N[o + v * 3] = sn.x; N[o + v * 3 + 1] = sn.y; N[o + v * 3 + 2] = sn.z; G[o + v * 3] = ng.x; G[o + v * 3 + 1] = ng.y; G[o + v * 3 + 2] = ng.z;
        const cc = q * 16 + v * 4; CD[cc] = c.p.x; CD[cc + 1] = c.p.y; CD[cc + 2] = c.p.z; CD[cc + 3] = (v < 2 ? oa : ob) + acc;
      }
      const i0 = q * 4; I.set([i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3], q * 6);
      bx = ex; by = ey; bz = ez; q++;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
  g.setAttribute('aCard', new THREE.BufferAttribute(CD, 4)); g.setAttribute('aNg', new THREE.BufferAttribute(G, 3)); g.setIndex(new THREE.BufferAttribute(I, 1));
  return g;
}
// branches -> tubes. br: { pts: [V3], rad: [], lvl, sides, lobe, col }; extra: { pos, nor, uv, col, idx } raw triangles appended (fungi…)
function woodGeo(brs0, maxLvl, sideMul = 1, extra, stride = 1) {
  const brs = stride < 2 ? brs0 : brs0.map(b => { const ix = b.pts.map((p, i) => i).filter(i => i % stride === 0 || i === b.pts.length - 1); return Object.assign({}, b, { pts: ix.map(i => b.pts[i]), rad: ix.map(i => b.rad[i]) }); });
  const pos = [], nor = [], uv = [], col = [], idx = [];
  const t = new V3(), n = new V3(), b = new V3(), t2 = new V3(), q = new Q4();
  for (const br of brs) {
    if (br.lvl > maxLvl) continue;
    const sides = Math.max(3, Math.round(br.sides * sideMul)), np = br.pts.length, base = pos.length / 3;
    t.subVectors(br.pts[1], br.pts[0]).normalize();
    n.set(1, 0, 0); if (Math.abs(t.x) > .9) n.set(0, 0, 1); n.addScaledVector(t, -n.dot(t)).normalize();
    let len = 0; const ur = Math.max(1, Math.round(TAU * br.rad[0] / 1.1)), bc = br.col || [1, 1, 1];
    for (let i = 0; i < np; i++) {
      if (i > 0) { t2.subVectors(br.pts[Math.min(i + 1, np - 1)], br.pts[i - 1]).normalize(); q.setFromUnitVectors(t, t2); n.applyQuaternion(q); t.copy(t2); n.addScaledVector(t, -n.dot(t)).normalize(); len += br.pts[i].distanceTo(br.pts[i - 1]); }
      b.crossVectors(t, n);
      const p = br.pts[i], r = br.rad[i];
      for (let j = 0; j <= sides; j++) {
        const a = j / sides * TAU, ca = Math.cos(a), sa = Math.sin(a), rr = r * (1 + (br.lobe || 0) * (Math.sin(3 * a + i * .8) + .6 * Math.sin(5 * a - i * 1.3)));
        const nx = n.x * ca + b.x * sa, ny = n.y * ca + b.y * sa, nz = n.z * ca + b.z * sa;
        pos.push(p.x + nx * rr, p.y + ny * rr, p.z + nz * rr); nor.push(nx, ny, nz); uv.push(j / sides * ur, len / 1.6); col.push(bc[0], bc[1], bc[2]);
      }
    }
    for (let i = 0; i < np - 1; i++) for (let j = 0; j < sides; j++) { const a = base + i * (sides + 1) + j, d = a + sides + 1; idx.push(a, a + 1, d, a + 1, d + 1, d); }
  }
  if (extra) { const base = pos.length / 3; for (const v of extra.pos) pos.push(v); for (const v of extra.nor) nor.push(v); for (const v of extra.uv) uv.push(v); for (const v of extra.col) col.push(v); for (const v of extra.idx) idx.push(v + base); }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
  return g;
}
// bracket fungus: a half-disc shelf growing out of a trunk at p, pointing along dir
function fungus(ex, p, dir, size, c) {
  const side = new V3(-dir.z, 0, dir.x).normalize(), b = ex.pos.length / 3, N = 6;
  ex.pos.push(p.x, p.y + size * .12, p.z); ex.nor.push(0, 1, 0); ex.uv.push(.5, .5); ex.col.push(c[0] * .6, c[1] * .6, c[2] * .6);
  for (let i = 0; i <= N; i++) { const a = i / N * Math.PI, x = Math.cos(a) * size, y = Math.sin(a) * size * .8; ex.pos.push(p.x + side.x * x + dir.x * y, p.y, p.z + side.z * x + dir.z * y); ex.nor.push(dir.x * .5, .85, dir.z * .5); ex.uv.push(.5 + .1 * Math.cos(a), .5 + .1 * Math.sin(a)); ex.col.push(c[0] * 1.5, c[1] * 1.5, c[2] * 1.5); }
  ex.pos.push(p.x, p.y - size * .3, p.z); ex.nor.push(0, -1, 0); ex.uv.push(.5, .5); ex.col.push(c[0] * 1.2, c[1] * 1.1, c[2] * .9);
  for (let i = 0; i < N; i++) { ex.idx.push(b, b + 2 + i, b + 1 + i); ex.idx.push(b + N + 2, b + 1 + i, b + 2 + i); }
}
// baked crown occlusion: how much sky each card sees through the rest of the crown (voxel march)
function occlude(cards, kk = 1) {
  if (!cards.length) return;
  const mn = new V3(1e9, 1e9, 1e9), mx = new V3(-1e9, -1e9, -1e9), cc = cards.map(c => c.p.clone().addScaledVector(c.a, c.h * .5));
  for (const p of cc) { mn.min(p); mx.max(p); }
  const cs = Math.max(.45, Math.max(mx.x - mn.x, mx.y - mn.y, mx.z - mn.z) / 30), nx = Math.ceil((mx.x - mn.x) / cs) + 1, ny = Math.ceil((mx.y - mn.y) / cs) + 1, nz = Math.ceil((mx.z - mn.z) / cs) + 1;
  const D = new Float32Array(nx * ny * nz), vi = p => ((p.x - mn.x) / cs | 0) + nx * (((p.y - mn.y) / cs | 0) + ny * ((p.z - mn.z) / cs | 0));
  cards.forEach((c, i) => { D[vi(cc[i])] += c.w * c.h; });
  const dirs = [[0, 1, 0], [.64, .77, 0], [-.64, .77, 0], [0, .77, .64], [0, .77, -.64]], k = kk * .1 / (cs * cs);
  cards.forEach((c, i) => {
    let T = 0; const p = cc[i];
    for (const d of dirs) { let s = D[vi(p)] * .3, x = p.x - mn.x, y = p.y - mn.y, z = p.z - mn.z; for (let st = 0; st < 40; st++) { x += d[0] * cs; y += d[1] * cs; z += d[2] * cs; const ix = x / cs | 0, iy = y / cs | 0, iz = z / cs | 0; if (ix < 0 || iy < 0 || iz < 0 || ix >= nx || iy >= ny || iz >= nz) break; s += D[ix + nx * (iy + ny * iz)]; } T += Math.exp(-s * k); }
    c.occ = .15 + .85 * Math.pow(T / 5, .7);
  });
}
// shuffle, crown normals, shading normals, occlusion
function finish(cards, R, o = {}) {
  for (let i = cards.length - 1; i > 0; i--) { const j = (R() * (i + 1)) | 0, t = cards[i]; cards[i] = cards[j]; cards[j] = t; }
  const c0 = new V3(), mn = new V3(1e9, 1e9, 1e9), mx = new V3(-1e9, -1e9, -1e9), t = new V3();
  for (const c of cards) { t.copy(c.p).addScaledVector(c.a, c.h * .5); mn.min(t); mx.max(t); }
  c0.addVectors(mn, mx).multiplyScalar(.5); c0.y -= (mx.y - mn.y) * (o.low ?? .15); const ext = mx.clone().sub(mn).multiplyScalar(.5).addScalar(.3);
  for (const c of cards) {
    t.copy(c.p).addScaledVector(c.a, c.h * .5).sub(c0).divide(ext); t.y += o.ngUp ?? .2; c.ng = t.clone().normalize();
    if (c.keepN) { c.sn = c.n; continue; }
    if (c.n.dot(c.ng) < 0) c.n.negate();
    c.sn = c.n.clone().multiplyScalar(1 - (o.blend ?? .45)).addScaledVector(c.ng, o.blend ?? .45).normalize();
  }
  if (o.occ !== false) occlude(cards, o.occK ?? 1);
  return { c0, r: Math.max(ext.x, ext.z), h: mx.y, cy: c0.y, ext, cen: mn.clone().add(mx).multiplyScalar(.5) };
}
// fewer, larger cards for distance
function lodCards(cards, keep, mul, dense = true, vol = 0) {
  const out = [], n = Math.max(3, Math.round(cards.length * keep)), R = rng(cards.length * 7 + n);
  for (let i = 0; i < n; i++) {
    const c = cards[(i * cards.length / n) | 0], m = c.fixed ? 1 : mul, shell = vol > 0 && (c.occ ?? 1) > .6 && i % 2;   // leafy cells on the outside keep the silhouette sparkling
    const o = Object.assign({}, c, { w: c.w * m, h: c.h * m, p: c.p.clone().addScaledVector(c.a, c.h * .5 * (1 - m)), cell: c.fixed || !dense || shell ? c.cell : (DENSE[c.cell] ?? c.cell), a2: null });
    if (!c.fixed && c.ng && R() < vol) {      // turn the card to face outward / sideways so the crown has sides and depth, and shade it with the crown normal
      const cen = c.p.clone().addScaledVector(c.a, c.h * .5), nn = rv(R).multiplyScalar(.8).addScaledVector(c.ng, .6); nn.y *= .5; nn.normalize();
      const a = new V3((R() - .5) * .9, 1, (R() - .5) * .9); a.addScaledVector(nn, -a.dot(nn)).normalize(); if (R() < .5) a.negate();
      o.n = nn; o.a = a; o.p = cen.addScaledVector(a, -o.h * .5); o.sn = nn.clone().multiplyScalar(.3).addScaledVector(c.ng, .7).normalize();
    }
    out.push(o);
  }
  if (out.length > 12) { const old = out.map(c => c.occ); occlude(out, 1); out.forEach((c, i) => { if (c.fixed) c.occ = old[i]; }); } else for (const c of out) c.occ = lerp(c.occ ?? 1, 1, .6);
  return out;
}
// the farthest level: three crossed cards the size of the crown
function impostor(info, cell, flat = 1) {
  const c = info.cen, h = (info.ext.y * 2 + .6) * flat, w = Math.min(info.ext.x + info.ext.z + .6, h * (flat < 1 ? 3 : 1.5)), mk = (a, n, ww, hh) => ({ p: c.clone().addScaledVector(a, -hh * .5), a, n, sn: n, ng: n, w: ww, h: hh, cell, occ: .9 });
  return [mk(new V3(0, 1, 0), new V3(1, 0, 0), w, h), mk(new V3(0, 1, 0), new V3(0, 0, 1), w, h), mk(new V3(1, 0, 0), new V3(0, 1, 0), w, w)];
}
// spec: one entry per level after the first: [keep (0 = impostor), size multiplier, dense cells?, deepest branch level kept (-1 none), tube side multiplier]
function mkLods(cards, sk, spec, info, extra) {
  const out = [{ cards, brs: sk.br, maxLvl: 9, extra }];
  for (const [keep, mul, dense, maxLvl, sideMul, vol] of spec) out.push({ cards: keep > 0 ? lodCards(cards, keep, mul, dense, vol || 0) : impostor(info, DENSE[cards[0].cell] ?? cards[0].cell, mul), brs: maxLvl < 0 ? null : sk.br, maxLvl, sideMul, stride: keep < .1 ? 2 : 1 });
  return out;
}
const TREE_LODS = [[.25, 1.95, false, 2, .6, .3], [.15, 2.6, true, 1, .45, 1], [.032, 5, true, 1, .34, 1], [0, 1, true, -1, 0]], TREE_DIST = [34, 78, 160, 300];

// ---------------------------------------------------------------- skeletons
function limb(sk, R, o) {
  const pts = [o.p.clone()], rad = [o.r0], d = o.d.clone().normalize(); let p = o.p.clone();
  for (let i = 1; i <= o.n; i++) {
    const u = i / o.n;
    d.x += (R() - .5) * o.wob; d.y += (R() - .5) * o.wob * .7 + (o.up || 0) - (o.droop || 0) * u; d.z += (R() - .5) * o.wob;
    if (o.pull) d.addScaledVector(o.pull, u);
    if (o.flat) d.y *= 1 - o.flat;
    d.normalize(); p = p.clone().addScaledVector(d, o.len / o.n); pts.push(p);
    let r = lerp(o.r0, o.r1, Math.pow(u, o.tp || 1)); if (o.knot) r *= 1 + o.knot * (R() - .3);
    rad.push(r);
  }
  if (o.flare) { rad[0] *= 1 + o.flare; rad[1] *= 1 + o.flare * .35; }
  const b = { pts, rad, lvl: o.lvl, sides: o.sides || 5, lobe: o.lobe || 0, col: o.col };
  sk.br.push(b); return b;
}
function atB(b, u) {
  const f = clamp(u, 0, 1) * (b.pts.length - 1), i = Math.min(b.pts.length - 2, f | 0), k = f - i;
  return { p: b.pts[i].clone().lerp(b.pts[i + 1], k), d: b.pts[i + 1].clone().sub(b.pts[i]).normalize(), r: lerp(b.rad[i], b.rad[i + 1], k) };
}
function splay(d, tilt, az) {
  const u = new V3(0, 1, 0).cross(d); if (u.lengthSq() < 1e-4) u.set(1, 0, 0); u.normalize(); const v = new V3().crossVectors(d, u);
  return d.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(u, Math.sin(tilt) * Math.cos(az)).addScaledVector(v, Math.sin(tilt) * Math.sin(az)).normalize();
}
// recursive branching by level description P.lv[k]
function grow(sk, R, par, k, P, sc) {
  const lv = P.lv[k]; if (!lv) return;
  const n = lv.n[0] + (R() * (lv.n[1] - lv.n[0] + 1) | 0), az0 = lv.az0 ?? R() * TAU;
  for (let i = 0; i < n; i++) {
    const u = lv.abs && i === n - 1 ? 1 : lv.from + (1 - lv.from) * (i + R() * .7) / n, A = atB(par, Math.min(1, u)), tilt = lv.tilts ? lv.tilts[i] : lerp(lv.tilt[0], lv.tilt[1], R());
    let d;
    if (lv.abs) { const az = lv.azs ? lv.azs[i] : az0 + (lv.gold ? i * 2.39996 : i / n * TAU) + (R() - .5) * .6; d = new V3(Math.cos(az) * Math.sin(tilt), Math.cos(tilt), Math.sin(az) * Math.sin(tilt)); }
    else if (lv.lead && i === n - 1) d = A.d.clone();
    else d = splay(A.d, tilt, lv.fan != null ? (i % 2 ? 0 : Math.PI) + (R() - .5) * lv.fan : az0 + i * 2.4);
    const len = lerp(lv.len[0], lv.len[1], R()) * sc * (1 - (lv.fall || 0) * u) * (lv.lens ? lv.lens[i] : 1);
    const b = limb(sk, R, { p: A.p, d, len, r0: Math.max((lv.rmin || .008) * sc, A.r * lv.rr), r1: (lv.r1 || .008) * sc, n: lv.seg, wob: lv.wob, up: lv.up, flat: lv.flat, droop: lv.droop, lvl: k, sides: lv.sides, knot: lv.knot, lobe: lv.lobe });
    if (P.keep && k >= 2) { const kn = P.keep(b); if (kn < 3) { sk.br.pop(); continue; } if (kn < b.pts.length) { b.pts.length = kn; b.rad.length = kn; b.rad[kn - 1] *= .4; } }
    if (lv.an) for (const ua of lv.an) sk.an.push(atB(b, ua));
    if (lv.pad) sk.pads.push({ p: atB(b, 1).p, r: lerp(lv.pad[0], lv.pad[1], R()) * sc, d: atB(b, 1).d });
    grow(sk, R, b, k + 1, P, sc);
  }
}
function leafCards(R, an, o) {
  const cards = [];
  for (const A of an) for (let i = 0; i < o.n; i++) {
    const a = A.d.clone().multiplyScalar(o.along ?? .6).addScaledVector(rv(R), o.spread ?? .7); a.y -= o.droop ?? .3; a.normalize();
    const n = rv(R).multiplyScalar(o.nrand ?? .7); n.y += o.nup ?? .7; n.addScaledVector(a, -n.dot(a)).normalize();
    const h = lerp(o.size[0], o.size[1], R());
    cards.push({ p: A.p.clone().addScaledVector(rv(R), o.jit ?? .12), a, n, w: h * (o.aspect || 1), h, cell: o.cells[(R() * o.cells.length) | 0], flip: R() < .5, acc: o.acc });
  }
  return cards;
}

// ---------------------------------------------------------------- species
const MODELS = [], MI = {};
// lods: [{ cards, brs, maxLvl, sideMul, extra }] ; o: { dist: [d0, d1, …] distance / scale at which each level hands over to the next, cull }
function addModel(name, lods, info, o = {}) {
  const M = { name, lods: lods.map(l => ({ leaf: l.cards && l.cards.length ? leafGeo(l.cards) : null, wood: l.brs ? woodGeo(l.brs, l.maxLvl ?? 9, l.sideMul ?? 1, l.extra, l.stride || 1) : null })), info, dist: o.dist || TREE_DIST, cull: o.cull || 1e9, trees: [], kind: o.kind || name };
  M.big = ['maple', 'ginkgo', 'pine', 'ancient', 'plum', 'magnolia'].includes(M.kind);
  MI[name] = MODELS.length; MODELS.push(M); return M;
}
const MAPLE_P = { lv: [null,
  { n: [4, 6], from: .6, abs: true, tilt: [.45, 1.1], len: [3.8, 6], rr: .62, r1: .035, seg: 8, wob: .2, up: .05, flat: .03, droop: .05, sides: 6, lobe: .05 },
  { n: [5, 7], from: .28, tilt: [.55, 1.05], fan: 1.6, lead: true, len: [1.9, 3.3], fall: .45, rr: .6, r1: .012, seg: 5, wob: .28, flat: .1, droop: .06, sides: 4, an: [.8, 1] },
  { n: [4, 6], from: .25, tilt: [.5, 1.1], fan: 1.2, len: [.8, 1.5], rr: .5, rmin: .011, r1: .004, seg: 3, wob: .3, flat: .15, droop: .12, sides: 3, an: [.35, .6, .8, 1] }] };
function trunkOf(sk, R, sc, tl, r0, lean, o = {}) {
  return limb(sk, R, Object.assign({ p: new V3(0, -1.2 * sc, 0), d: new V3((R() - .5) * .3 + lean, 1, (R() - .5) * .3), len: tl + 1.2 * sc, r0: r0 * 1.15, r1: r0 * .5, tp: 2.2, n: 7, wob: .14, lvl: 0, sides: 9, lobe: .07, flare: .5 }, o));
}
function roots(sk, R, n, r0, len, droop = .12) {
  for (let i = 0; i < n; i++) { const az = i / n * TAU + R() * .6; limb(sk, R, { p: new V3(0, .35 * r0 / .3, 0), d: new V3(Math.cos(az), -.12, Math.sin(az)), len: len * (.7 + R() * .6), r0: r0 * .55, r1: r0 * .12, n: 5, wob: .35, droop, lvl: 0, sides: 5 }); }
}
function mkMaple(name, seed, sc, o = {}) {
  const R = rng(seed), sk = { br: [], an: [], pads: [] };
  const tk = trunkOf(sk, R, sc, o.tl || (2.3 + R() * 1.2) * sc, (.2 + R() * .1) * sc * (o.thick || 1), o.lean || 0);
  grow(sk, R, tk, 1, o.P || MAPLE_P, sc);
  if (o.roots) roots(sk, R, 6, .3 * sc, 2.2 * sc);
  let cards = leafCards(R, sk.an, { n: o.n || 4, size: o.size || [.5, .78], cells: o.cells || [C.mapleA, C.mapleA, C.mapleB, C.mapleC], along: .55, spread: .75, droop: o.droop || .35, nup: .75, nrand: .75, jit: .14 });
  if (o.keepCard) cards = cards.filter(o.keepCard);
  const info = finish(cards, R, { low: .2, ngUp: .25 });
  let extra = null;
  if (o.fungi) { extra = { pos: [], nor: [], uv: [], col: [], idx: [] }; for (let i = 0; i < o.fungi; i++) { const A = atB(tk, .3 + .5 * R()), az = R() * TAU, d = new V3(Math.cos(az), 0, Math.sin(az)); fungus(extra, A.p.clone().addScaledVector(d, A.r * .85), d, (.1 + R() * .12) * sc, [.75, .5, .28]); } }
  return addModel(name, o.solo ? [{ cards, brs: sk.br, maxLvl: 9, extra }] : mkLods(cards, sk, TREE_LODS, info, extra), info, { kind: 'maple' });
}
function mkGinkgo(name, seed, sc) {
  const R = rng(seed), sk = { br: [], an: [], pads: [] };
  const H = (9 + R() * 5) * sc, tk = trunkOf(sk, R, sc, H, (.24 + R() * .1) * sc, 0, { n: 10, wob: .06, up: .05, r1: .05 * sc });
  grow(sk, R, tk, 1, { lv: [null,
    { n: [12, 16], from: .24, abs: true, gold: true, tilt: [.6, .95], len: [2.4, 4.6], fall: .55, rr: .5, r1: .015, seg: 6, wob: .15, up: .05, sides: 5, an: [.3, .42, .55, .68, .8, .9, 1] },
    { n: [3, 4], from: .3, tilt: [.5, .9], len: [1, 2.1], fall: .3, rr: .5, r1: .008, seg: 3, wob: .2, up: .04, sides: 3, an: [.4, .7, 1] }] }, sc);
  sk.an.push(atB(tk, .85), atB(tk, .93), atB(tk, 1));
  const cards = leafCards(R, sk.an, { n: 4, size: [.55, .82], cells: [C.ginkgoA, C.ginkgoB], along: .3, spread: .9, droop: .25, nup: .35, nrand: 1, jit: .22 });
  const info = finish(cards, R, { low: .05, ngUp: .15 });
  return addModel(name, mkLods(cards, sk, TREE_LODS, info), info, { kind: 'ginkgo' });
}
// the thousand-year ginkgo on Temple Peak: massive gnarled trunk, roots, bracket fungi, prayer ribbons
function mkAncient(name, seed) {
  const R = rng(seed), sk = { br: [], an: [], pads: [] }, sc = 1;
  const tk = limb(sk, R, { p: new V3(0, -2, 0), d: new V3(.06, 1, -.04), len: 12, r0: 1.75, r1: 1.2, n: 8, wob: .12, lvl: 0, sides: 14, lobe: .11, flare: .7, knot: .12 });
  grow(sk, R, tk, 1, { lv: [null,
    { n: [8, 8], from: .55, abs: true, tilt: [.3, 1.2], len: [10, 14], rr: .44, r1: .09, seg: 9, wob: .24, up: .035, flat: .04, sides: 8, lobe: .06, knot: .15 },
    { n: [6, 8], from: .22, tilt: [.5, 1.0], fan: 1.6, lead: true, len: [3.4, 6], fall: .4, rr: .55, r1: .03, seg: 5, wob: .3, up: .02, sides: 5, an: [.5, .7, .9, 1] },
    { n: [5, 7], from: .2, tilt: [.5, 1.1], len: [1.3, 2.4], rr: .5, r1: .01, seg: 3, wob: .3, droop: .05, sides: 3, an: [.3, .5, .7, .85, 1] }] }, sc);
  roots(sk, R, 9, 1.5, 3.6, .3);
  const cards = leafCards(R, sk.an, { n: 6, size: [.75, 1.1], cells: [C.ginkgoA, C.ginkgoB], along: .3, spread: .9, droop: .3, nup: .35, nrand: 1, jit: .3 });
  // prayer ribbons tied into the lower branches
  const rib = [];
  for (const b of sk.br) if (b.lvl === 2 || b.lvl === 1) for (let i = 0; i < (b.lvl === 1 ? 5 : 2); i++) {
    const A = atB(b, .15 + R() * .8); if (A.p.y > 19 || R() < .5) continue; const az = R() * TAU;
    rib.push({ p: A.p.clone(), a: new V3((R() - .5) * .15, -1, (R() - .5) * .15).normalize(), n: new V3(Math.cos(az), 0, Math.sin(az)), w: .2, h: 1.1 + R() * 1.2, cell: C.ribbon, acc: true, fixed: true, keepN: true });
  }
  const info = finish(cards, R, { low: .1, ngUp: .2 });
  for (const c of rib) { c.sn = c.n; c.ng = new V3(c.n.x, .4, c.n.z).normalize(); c.occ = .8; }
  const all = cards.concat(rib);
  const extra = { pos: [], nor: [], uv: [], col: [], idx: [] };
  for (let i = 0; i < 26; i++) { const A = atB(tk, .28 + .5 * R()), az = R() * TAU, d = new V3(Math.cos(az), 0, Math.sin(az)); fungus(extra, A.p.clone().addScaledVector(d, A.r * .9), d, .18 + R() * .3, [.8, .55, .3]); }
  const lods = mkLods(cards, sk, [[.3, 1.8, false, 2, .7], [.08, 3.4, true, 1, .5], [.015, 7, true, 0, .4]], info, extra);
  lods[0].cards = all; lods[1].cards = lods[1].cards.concat(rib); lods[1].extra = extra;
  return addModel(name, lods, info, { kind: 'ancient', dist: [330, 700, 1500] });
}
function mkPine(name, seed, sc, o = {}) {
  const R = rng(seed), sk = { br: [], an: [], pads: [], epi: [] }, cl = o.cliff || 0, bc = [1.25, .8, .62];
  const H = o.H || (5 + R() * 3) * sc * (cl ? .75 : 1), r0 = (.17 + R() * .08) * sc;
  const tk = limb(sk, R, { p: cl ? new V3(-1.4, -.4, 0) : new V3(0, -1.2, 0), d: o.d0 ? o.d0 : cl ? new V3(.97, .22, (R() - .5) * .3) : new V3((o.lean || 0) + (R() - .5) * .3, 1, (R() - .5) * .3),
    len: H + 1.2, r0: r0 * 1.3 * (o.thick || 1), r1: r0 * .32 * (o.thick || 1), n: 11, wob: o.twist || .3, up: o.up ?? (cl ? .2 : .05), lvl: 0, sides: 7, lobe: .07, col: bc, flare: cl ? 0 : .4 });
  const nl = 5 + (R() * 3 | 0);
  for (let i = 0; i < nl; i++) {
    const u = .42 + .58 * i / (nl - 1), A = atB(tk, u), az = i * 2.4 + R() * .8, top = i === nl - 1;
    const d = top ? A.d.clone().lerp(new V3(Math.cos(az), .25, Math.sin(az)), .65).normalize() : new V3(Math.cos(az), .02 + R() * .22, Math.sin(az)).normalize();
    const lb = limb(sk, R, { p: A.p, d, len: (2.2 + R() * 2.2) * sc * (1 - .35 * u) * (top ? .65 : 1), r0: Math.max(.03, A.r * .55), r1: .02 * sc, n: 6, wob: .28, flat: .25, up: .03, lvl: 1, sides: 5, col: bc });
    const n2 = 2 + (R() * 2 | 0);
    for (let j = 0; j < n2; j++) {
      const B = atB(lb, .42 + .5 * j / n2 + R() * .1);
      const sb = limb(sk, R, { p: B.p, d: splay(B.d, .6 + R() * .5, (j % 2 ? 0 : Math.PI) + (R() - .5) * .6), len: (.9 + R() * .9) * sc, r0: Math.max(.02, B.r * .6), r1: .012 * sc, n: 3, wob: .25, flat: .4, lvl: 2, sides: 4, col: bc });
      sk.pads.push({ p: atB(sb, 1).p, r: (.75 + R() * .5) * sc });
    }
    sk.pads.push({ p: atB(lb, 1).p, r: (1 + R() * .6) * sc });
    if (o.epi) for (let e = 0; e < 2; e++) sk.epi.push(atB(lb, .15 + R() * .5));
  }
  const cards = [];
  for (const pd of sk.pads) {
    const n = 38 + (R() * 16 | 0);
    for (let i = 0; i < n; i++) {                                    // a shallow dome of small sprays pointing every way: upright in the middle, flat at the rim
      const ang = R() * TAU, q = Math.sqrt(R()), rr = q * pd.r, h = (.42 + R() * .36) * sc, lift = .75 - .6 * q + (R() - .5) * .3, dir = ang + (R() - .5) * 3.4;
      const a = new V3(Math.cos(dir), lift, Math.sin(dir)).normalize();
      const n0 = new V3(-Math.cos(ang) * q * .5 + (R() - .5) * .6, 1, -Math.sin(ang) * q * .5 + (R() - .5) * .6); n0.addScaledVector(a, -n0.dot(a)).normalize();
      const c = pd.p.clone().add(new V3(Math.cos(ang) * rr, .3 * pd.r * (1 - q * q) + (R() - .5) * .18, Math.sin(ang) * rr));
      cards.push({ p: c.addScaledVector(a, -h * .5), a, n: n0, w: h, h, cell: C.pine, flip: R() < .5 });
    }
    for (let i = 0; i < 13; i++) {                                   // upright sprays give the pad thickness from the side
      const ang = R() * TAU, rr = Math.sqrt(R()) * pd.r * .85, yaw = R() * TAU, h = (.5 + R() * .3) * sc;
      const a = new V3(Math.cos(ang) * .35, 1, Math.sin(ang) * .35).normalize(), n0 = new V3(Math.cos(yaw), 0, Math.sin(yaw)); n0.addScaledVector(a, -n0.dot(a)).normalize();
      cards.push({ p: pd.p.clone().add(new V3(Math.cos(ang) * rr, -.12, Math.sin(ang) * rr)), a, n: n0, w: h, h, cell: C.pine, flip: R() < .5 });
    }
  }
  // epiphytes on the limbs: little fern rosettes on top, beards of moss below
  const epi = [];
  for (const E of sk.epi) {
    for (let i = 0; i < 4; i++) { const az = R() * TAU, a = new V3(Math.cos(az), .7, Math.sin(az)).normalize(); epi.push({ p: E.p.clone(), a, n: new V3(-a.x * .6, 1, -a.z * .6).normalize(), w: .16 * sc, h: (.4 + R() * .25) * sc, cell: C.fern, acc: true, fixed: true }); }
    const az = R() * TAU; epi.push({ p: E.p.clone(), a: new V3(0, -1, 0), n: new V3(Math.cos(az), 0, Math.sin(az)), w: .45 * sc, h: (.5 + R() * .5) * sc, cell: C.grass, acc: true, fixed: true });
  }
  const info = finish(cards.concat(epi), R, { low: .3, ngUp: 1.1, blend: .35, occK: .4 }); for (const c of cards) c.occ = .4 + .6 * c.occ;
  const all = cards.concat(epi);
  const lods = mkLods(cards, sk, [[.36, 1.55, false, 2, .6], [.16, 2.3, true, 1, .45, .15], [.045, 3.9, true, 1, .34, .2], [0, .55, true, -1, 0]], info); lods[0].cards = all;
  return addModel(name, lods, info, { kind: 'pine' });
}
function mkBamboo(name, seed) {
  const R = rng(seed), sk = { br: [], an: [], pads: [] }, H = 7.5 + R() * 3.5, gc = [.75, 1.5, .5];
  const tk = limb(sk, R, { p: new V3(0, -.6, 0), d: new V3(.04, 1, 0), len: H + .6, r0: .05, r1: .012, n: 12, wob: .03, pull: new V3(.07, -.02, 0), lvl: 0, sides: 5, col: gc });
  for (let u = .32; u < 1; u += .045) { const A = atB(tk, u), b = limb(sk, R, { p: A.p, d: splay(A.d, .9 + R() * .5, R() * TAU), len: .5 + R() * .6, r0: .008, r1: .003, n: 2, wob: .2, droop: .2, lvl: 2, sides: 3, col: gc }); sk.an.push(atB(b, .6), atB(b, 1)); }
  sk.an.push(atB(tk, 1), atB(tk, .97));
  const cards = leafCards(R, sk.an, { n: 2, size: [.75, 1.1], cells: [C.bamboo], along: .7, spread: .5, droop: .55, nup: .5, nrand: .8, jit: .1 });
  const info = finish(cards, R, { low: 0, ngUp: .3, occK: .6 });
  return addModel(name, mkLods(cards, sk, [[.3, 1.8, false, 0, .8], [.08, 3.2, true, 0, .6], [0, 1, true, -1, 0]], info), info, { kind: 'bamboo', dist: [34, 100, 260] });
}
// small flowering trees and shrubs
function mkSmall(name, seed, sc, o) {
  const R = rng(seed), sk = { br: [], an: [], pads: [] };
  const tk = trunkOf(sk, R, sc, o.tl * sc, o.r0 * sc, o.lean || 0, { wob: o.twob ?? .3, sides: 6, n: 4, col: o.bark });
  grow(sk, R, tk, 1, o.P, sc);
  let cards = leafCards(R, sk.an, o.leaf);
  if (o.leaf2) cards = cards.concat(leafCards(R, sk.an.filter((a, i) => i % o.leaf2.every === 0), o.leaf2));
  const info = finish(cards, R, { low: .1, ngUp: .3, occK: o.occK ?? .8 });
  return addModel(name, mkLods(cards, sk, o.lods || [[.5, 1.4, false, 2, .6], [.25, 2, true, 1, .5], [.1, 3, true, 0, .34]], info), info, { kind: o.kind, dist: o.dist || [36, 90, 220], cull: o.cull });
}
const PLUM_P = { lv: [null,
  { n: [3, 4], from: .6, abs: true, tilt: [.55, 1.0], len: [1.9, 2.8], rr: .62, r1: .02, seg: 5, wob: .5, up: .04, sides: 5 },
  { n: [3, 5], from: .25, tilt: [.6, 1.1], lead: true, len: [.9, 1.6], fall: .3, rr: .6, r1: .01, seg: 3, wob: .5, up: .03, sides: 4, an: [.6, 1] },
  { n: [3, 4], from: .2, tilt: [.5, 1.1], len: [.5, .9], rr: .5, r1: .004, seg: 2, wob: .4, sides: 3, an: [.4, .7, 1] }] };
const SHRUB_P = { lv: [null,
  { n: [6, 9], from: .3, abs: true, tilt: [.35, 1.15], len: [.8, 1.4], rr: .5, r1: .008, seg: 3, wob: .4, up: .05, sides: 3, an: [.45, .7, .9, 1] },
  { n: [2, 3], from: .3, tilt: [.5, 1], len: [.35, .6], rr: .6, r1: .004, seg: 2, wob: .4, sides: 3, an: [.6, 1] }] };
// hanging strands (pivot at the top, model +X points away from the cliff)
function mkVine(name, seed, len, o) {
  const R = rng(seed), sk = { br: [] }, cards = [];
  const nS = o.strands || 3;
  for (let s = 0; s < nS; s++) {
    const z0 = (s - (nS - 1) / 2) * (o.spacing || .5) + (R() - .5) * .3, L = len * (.55 + R() * .45);
    const b = limb(sk, R, { p: new V3(-.15, .25, z0), d: new V3(.25, -1, (R() - .5) * .2), len: L, r0: .016, r1: .005, n: Math.max(4, L / .9 | 0), wob: .1, droop: 0, up: -.06, lvl: 0, sides: 3, col: [.8, .75, .6] });
    for (let d = .15; d < L; d += o.step || .24) {
      const A = atB(b, d / L), az = (R() - .5) * 2.4, h = lerp(o.size[0], o.size[1], R());
      const a = new V3((R() - .5) * .5 + .1, -1, (R() - .5) * .6).normalize(), n = new V3(Math.cos(az), .15, Math.sin(az)); n.addScaledVector(a, -n.dot(a)).normalize();
      const fl = o.flower && R() < o.flower;
      cards.push({ p: A.p.clone().add(new V3(R() * .1, 0, (R() - .5) * .15)), a, n, w: h * (fl ? .5 : 1), h: h * (fl ? 1.5 : 1), cell: fl ? C.wist : o.cells[(R() * o.cells.length) | 0], flip: R() < .5, fixed: fl });
    }
  }
  const info = finish(cards, R, { low: 0, ngUp: .1, blend: .3, occ: false });
  for (const c of cards) { c.ng = new V3(.9, .35, 0).normalize(); c.occ = .6 + .4 * R(); c.sn = c.n.clone().multiplyScalar(.6).addScaledVector(c.ng, .4).normalize(); }
  return addModel(name, mkLods(cards, sk, [[.3, 1.8, false, -1, 0], [.1, 3, true, -1, 0]], info), info, { kind: 'vine', dist: [40, 110], cull: 330 });
}
// wisteria: a woody rope along z with racemes hanging in a curtain; post = a twisted trunk carrying an umbrella of flowers
function mkWisteria(name, seed, o = {}) {
  const R = rng(seed), sk = { br: [] }, cards = [], bc = [.9, .8, .7];
  const hang = [];
  if (o.post) {
    for (let k = 0; k < 2; k++) { const b = limb(sk, R, { p: new V3(k * .16 - .08, -.5, 0), d: new V3((R() - .5) * .3, 1, (R() - .5) * .3), len: 3.9, r0: .1, r1: .06, n: 8, wob: .45, up: .25, lvl: 0, sides: 5, col: bc, knot: .2 });
      for (let i = 0; i < 5; i++) { const az = R() * TAU, A = atB(b, .85 + R() * .15), arm = limb(sk, R, { p: A.p, d: new V3(Math.cos(az), .35, Math.sin(az)), len: 1.4 + R() * 1.5, r0: .04, r1: .012, n: 5, wob: .3, droop: .22, lvl: 1, sides: 4, col: bc }); for (let u = .2; u <= 1; u += .09) hang.push(atB(arm, u)); } }
  } else {
    const b = limb(sk, R, { p: new V3(0, .3, -3), d: new V3(.05, -.12, 1), len: 6, r0: .06, r1: .035, n: 9, wob: .22, up: .03, lvl: 0, sides: 4, col: bc, knot: .2 });
    for (let u = 0; u <= 1; u += .022) hang.push(atB(b, u));
    for (let i = 0; i < 5; i++) { const A = atB(b, R()), sb = limb(sk, R, { p: A.p, d: new V3(.4, -1, (R() - .5) * .5), len: 1 + R() * 2.2, r0: .02, r1: .006, n: 4, wob: .15, up: -.05, lvl: 1, sides: 3, col: bc }); for (let u = .2; u <= 1; u += .12) hang.push(atB(sb, u)); }
  }
  for (const A of hang) {
    const nr = o.post ? 2 : 2;
    for (let i = 0; i < nr; i++) { const az = R() * TAU, h = .6 + R() * .55; cards.push({ p: A.p.clone().add(new V3((R() - .5) * .25 + .1, -.05, (R() - .5) * .25)), a: new V3((R() - .5) * .12, -1, (R() - .5) * .12).normalize(), n: new V3(Math.cos(az), 0, Math.sin(az)), w: h * .5, h, cell: C.wist, flip: R() < .5, fixed: true }); }
    const az = R() * TAU, a = new V3(Math.cos(az), .1 - R() * .5, Math.sin(az)).normalize(), n = new V3(0, 1, 0); n.addScaledVector(a, -n.dot(a)).normalize();
    cards.push({ p: A.p.clone(), a, n, w: .5, h: .5 + R() * .2, cell: C.broad, flip: R() < .5 });
  }
  const info = finish(cards, R, { low: -.2, ngUp: .5, blend: .35, occK: .5 });
  return addModel(name, mkLods(cards, sk, [[.4, 1.5, false, 0, .7], [.12, 2.6, true, -1, 0]], info), info, { kind: 'wisteria', dist: [50, 140], cull: 420 });
}

function buildModels() {
  mkMaple('maple0', 11, 1); mkMaple('maple1', 12, 1.12); mkMaple('maple2', 13, .82);
  // the old maple beside the key camera: big, limbs placed by hand (model space = world axes, yaw 0)
  const hk = b => { let i = 0; while (i < b.pts.length && heroKeep(b.pts[i].x, b.pts[i].y, b.pts[i].z)) i++; return i; };
  mkMaple('mapleHero', 21, 1.6, { roots: true, fungi: 9, tl: 11.5, thick: 1.4, lean: .1, n: 11, droop: .5, size: [.36, .56], cells: [C.mapleA, C.mapleB, C.mapleB, C.mapleC, C.mapleC], solo: true,
    keepCard: c => heroKeep(c.p.x + c.a.x * c.h * .5, c.p.y + c.a.y * c.h * .5, c.p.z + c.a.z * c.h * .5),
    P: { keep: hk, lv: [null, Object.assign({}, MAPLE_P.lv[1], { from: .72, len: [4.2, 6.4], up: .015, flat: .07, an: [.45, .55, .65, .75, .85, .95], n: [6, 6], azs: [3.05, 2.0, .7, -.5, -1.4, -1.96], tilts: [1.0, .9, .85, .9, 1.05, 1.25], lens: [.9, .9, .85, .9, 1.05, 1.3] }),
      Object.assign({}, MAPLE_P.lv[2], { n: [8, 10], droop: .13, fan: .8, flat: .2 }), Object.assign({}, MAPLE_P.lv[3], { n: [5, 7], droop: .22, len: [1, 1.8] })] } });
  mkGinkgo('ginkgo0', 31, 1); mkGinkgo('ginkgo1', 32, .85);
  mkAncient('ancient', 41);
  mkPine('pine0', 51, 1, { epi: true }); mkPine('pine1', 52, 1.1, { lean: .45, epi: true }); mkPine('pine2', 53, .85, { lean: -.2 });
  mkPine('pineCliff0', 54, .9, { cliff: 1, epi: true }); mkPine('pineCliff1', 55, .7, { cliff: 1 }); mkPine('pineHero', 56, .72, { cliff: 1, epi: true, H: 6.6, up: .1, thick: 2, twist: .75, d0: new V3(.6, .8, 0) });
  mkBamboo('bamboo0', 61); mkBamboo('bamboo1', 62);
  mkSmall('plum', 71, 1, { kind: 'plum', tl: 1.3, r0: .13, P: PLUM_P, bark: [.55, .45, .45], leaf: { n: 2, size: [.42, .6], cells: [C.blossom], along: .7, spread: .5, droop: .1, nup: .4, nrand: 1, jit: .08 }, occK: .5 });
  mkSmall('magnolia', 72, 1.15, { kind: 'magnolia', tl: 1.6, r0: .13, twob: .15, bark: [1.2, 1.15, 1.1], P: { lv: [null,
    { n: [4, 6], from: .5, abs: true, tilt: [.4, .8], len: [2.2, 3.2], rr: .6, r1: .02, seg: 5, wob: .2, up: .09, sides: 5, an: [1] },
    { n: [3, 4], from: .3, tilt: [.4, .8], len: [.9, 1.5], rr: .6, r1: .01, seg: 3, wob: .25, up: .1, sides: 3, an: [.55, 1] }] },
    leaf: { n: 4, size: [.24, .34], cells: [C.magnolia], along: 0, spread: 1, droop: 0, nup: 1.2, nrand: .7, jit: .22 }, leaf2: { every: 5, n: 1, size: [.4, .5], cells: [C.broad], along: .6, spread: .6, droop: .2, nup: .6, nrand: .8, jit: .1 }, occK: .4 });
  const shrub = (name, seed, cells, n, size) => mkSmall(name, seed, 1, { kind: 'shrub', tl: .25, r0: .035, P: SHRUB_P, nl: 3, leaf: { n, size, cells, along: .5, spread: .8, droop: .15, nup: .7, nrand: .9, jit: .12 }, lods: [[.3, 1.8, false, -1, 0], [.08, 3.2, true, -1, 0]], dist: [30, 90], cull: 300 });
  shrub('azalea', 81, [C.blossom, C.blossomD, C.broad], 2, [.36, .5]); shrub('bush', 82, [C.broad, C.broad, C.broadD], 2, [.4, .55]); shrub('berry', 83, [C.berry, C.berry, C.broad], 2, [.4, .55]);
  mkVine('ivyLong', 91, 9, { size: [.5, .7], cells: [C.ivy, C.ivy, C.broad], strands: 4, spacing: .45 });
  mkVine('ivyShort', 92, 4.5, { size: [.45, .65], cells: [C.ivy], strands: 3, spacing: .5 });
  mkVine('roots', 96, 3.2, { size: [.5, .9], cells: [C.grass], strands: 5, spacing: .22, step: .45 });
  mkVine('wistVine', 93, 5, { size: [.5, .65], cells: [C.broad], strands: 3, spacing: .6, flower: .45 });
  mkWisteria('wistCurtain', 94); mkWisteria('wistPost', 95, { post: true });
}

// ---------------------------------------------------------------- placement
const TREES = [];           // { mi, x, y, z, yaw, s, lean, laz, col, col2, v, bark }
const _q = new Q4(), _q2 = new Q4(), _ax = new V3(), _m = new M4(), _p = new V3(), _s = new V3(), UP = new V3(0, 1, 0);
function add(name, x, y, z, o = {}) {
  const mi = MI[name], M = MODELS[mi], s = o.s || 1;
  const t = { mi, x, y, z, yaw: o.yaw ?? 0, s, lean: o.lean || 0, laz: o.laz || 0, col: o.col || [.2, .4, .1], col2: o.col2 || [.2, .4, .1], v: o.v || [0, .5, 0, 1], bark: o.bark || [1, 1, 1], lodS: Math.min(s, 1.25) * (o.lodS || 1) * LODK };
  M.trees.push(TREES.length); TREES.push(t); return t;
}
const jit = (c, R, a = .12) => [c[0] * (1 + (R() - .5) * a * 2), c[1] * (1 + (R() - .5) * a * 2), c[2] * (1 + (R() - .5) * a * 2)];
const PAL = {
  crimson: [.7, .05, .03], scarlet: [.92, .11, .03], orange: [1, .3, .035], gold: [1, .6, .05], ginkgo: [1.15, .84, .06],
  pine: [.085, .19, .06], pineEpi: [.2, .36, .08], bamboo: [.22, .4, .09], bush: [.1, .23, .06], azalea: [.72, .05, .09], berry: [.8, .03, .02],
  plum: [1, .62, .7], magnolia: [1, .9, .93], violet: [.5, .32, .95], white: [.95, .93, 1], wleaf: [.25, .42, .1], ivy: [.09, .22, .05], creeper: [.62, .05, .04],
  fern: [.16, .34, .07], grass: [.17, .36, .06], dry: [.5, .44, .16], reed: [.34, .42, .12], plume: [.8, .72, .55], lotus: [.1, .33, .13], lotusF: [1, .6, .72], ribbon: [.9, .05, .03],
};
// the real rock surface when the rock module is present (ledge treads, relief, soil caps)
let useRock = false;
const RR = (s, y, th) => useRock ? K.rock.R(s, y, th) : W.spireR(s, y, th);
const topY = (s, x, z) => useRock ? K.rock.topY(s, x, z) : s.h;
// key camera (for keeping the view open)
const KC = { p: new V3(-58, 66.4, 184), f: new V3(-4, 86, 60).sub(new V3(-58, 66.4, 184)).normalize() };
KC.r = new V3().crossVectors(KC.f, UP).normalize(); KC.u = new V3().crossVectors(KC.r, KC.f);
const keyUV = (x, y, z) => { _p.set(x, y, z).sub(KC.p); const zf = _p.dot(KC.f); return [_p.dot(KC.r) / zf, _p.dot(KC.u) / zf, zf, _p.length()]; };
function blocksKey(x, y, z, r) {
  const [tx, ty, zf, d] = keyUV(x, y, z);
  if (d < r + 2.5) return true; if (zf < 1 || zf > 90) return false;
  const rr = r / zf;
  return tx + rr > -.5 && tx - rr < .76 && ty + rr > -.33 && ty - rr < .45;
}
const segD = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1); return [Math.hypot(x - ax - dx * t, z - az - dz * t), t]; };
// the masonry terrace of the gate pavilion (approximate footprint; plants stay off it)
const GATE_T = [[-65.3, 171.6], [-57.4, 173.2], [-55.2, 175.6], [-50.4, 177.4], [-49.4, 184], [-53, 190], [-63, 192.5], [-70.5, 186.5], [-66.3, 176.4]];
function polyD(poly, x, z) {   // < 0 inside, else distance to the outline
  let inside = false, dm = 1e9;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    dm = Math.min(dm, segD(x, z, a[0], a[1], b[0], b[1])[0]);
  }
  return inside ? -dm : dm;
}
let KEEP = [];
// is a plant rooted at (x, y, z) with crown radius r and height h clear of the buildings?
function siteOK(x, y, z, r = 0, h = 6) {
  for (const k of KEEP) if (y + h > k.y0 && y < k.y1 && Math.hypot(x - k.x, z - k.z) < k.r + r * .7) return false;
  if (y > 132 && Math.hypot(x - S.summit.x, z - S.summit.z) < 16.5 + r * .3) return false;
  if (y + h > 46 && y < 84 && Math.abs(x - S.mid.x) < S.mid.w / 2 + 2.5 + r * .5 && z > S.mid.z - S.mid.d / 2 - 14 && z < S.mid.z + S.mid.d / 2 + 4 + r * .5) return false;
  if (y < 78 && Math.hypot(x - S.falls.x, z - S.falls.z) < 7 + r * .4) return false;
  if (y + h > 54 && y < 80 && polyD(GATE_T, x, z) < 1 + r * .5) return false;
  const [bd, bt] = segD(x, z, S.bridgeA.x, S.bridgeA.z, S.bridgeB.x, S.bridgeB.z), by = lerp(S.bridgeA.y, S.bridgeB.y, bt) - 7.5 * 4 * bt * (1 - bt);
  if (bd < 3.2 + r * .8 && y > by - h - r * .5 && y < by + 8) return false;
  if (y > 56 && y < 80) { const [pd] = segD(x, z, -50.6, 181.7, S.bridgeA.x, S.bridgeA.z); if (pd < 3.2 + r * .3) return false; }
  if (y < 30 && Math.hypot(x - S.shore.x, z - S.shore.z) < 14 + r * .5) return false;
  return true;
}
const FLORA = { trees: [], maples: [], pines: [], meshes: [] };
const reg = (t, kind, h, r) => { const e = { x: t.x, y: t.y, z: t.z, h: h * t.s, r: r * t.s, kind }; FLORA.trees.push(e); if (kind === 'maple') FLORA.maples.push(e); if (kind === 'pine') FLORA.pines.push(e); return e; };
const MAPLES = ['maple0', 'maple1', 'maple2'], PINES = ['pine0', 'pine1', 'pine2'], MCOL = ['crimson', 'scarlet', 'orange', 'gold'];
function maple(R, x, y, z, s, ci, o = {}) {
  const t = add(MAPLES[(R() * 3) | 0], x, y, z, Object.assign({ yaw: R() * TAU, s, col: jit(PAL[MCOL[ci]], R, .1), v: [R() * 100, ci > 2 ? .55 : .8, .16, 1], bark: [.75, .68, .62] }, o));
  const e = reg(t, 'maple', 9, 5.5); e.col = t.col; e.gy = o.gy; e.sl = o.sl; return e;
}
function pine(R, x, y, z, s, o = {}, m) {
  const t = add(m || PINES[(R() * 3) | 0], x, y, z, Object.assign({ yaw: R() * TAU, s, col: jit(PAL.pine, R, .15), col2: PAL.pineEpi, v: [R() * 100, .5, .03, .5], bark: [.8, .62, .5] }, o));
  return reg(t, 'pine', 8, 4);
}
function ginkgo(R, x, y, z, s, o = {}) {
  const t = add(R() < .5 ? 'ginkgo0' : 'ginkgo1', x, y, z, Object.assign({ yaw: R() * TAU, s, col: jit(PAL.ginkgo, R, .06), v: [R() * 100, .3, .08, 1.2], bark: [.85, .8, .72] }, o));
  return reg(t, 'ginkgo', 13, 4);
}
function bamboo(R, x, y, z, n, rad, sc = 1) {
  for (let i = 0; i < n; i++) { const a = R() * TAU, r = Math.sqrt(R()) * rad; add(R() < .5 ? 'bamboo0' : 'bamboo1', x + Math.cos(a) * r, y, z + Math.sin(a) * r, { yaw: R() * TAU, s: sc * (.75 + R() * .5), lean: .05 + R() * .12, laz: a, col: jit(PAL.bamboo, R, .15), v: [R() * 100, .6, .05, 1.6], bark: [.9, 1, .8] }); }
}
function shrub(R, x, y, z, s, kind) {
  kind = kind ?? (R() < .1 ? 0 : R() < .34 ? 1 : 2);
  if (kind === 0) add('azalea', x, y, z, { yaw: R() * TAU, s, col: jit(PAL.bush, R), col2: jit(PAL.azalea, R, .1), v: [R() * 100, .5, .02, 1] });
  else if (kind === 1) add('berry', x, y, z, { yaw: R() * TAU, s, col: jit(PAL.bush, R), col2: PAL.berry, v: [R() * 100, .5, .05, 1] });
  else add('bush', x, y, z, { yaw: R() * TAU, s, col: jit(R() < .25 ? PAL.orange : PAL.bush, R), v: [R() * 100, .7, .1, 1] });
}
const plum = (R, x, y, z, s, o = {}) => add('plum', x, y, z, Object.assign({ yaw: R() * TAU, s, col: [.3, .45, .12], col2: jit(PAL.plum, R, .05), v: [R() * 100, .2, 0, 1], bark: [.45, .36, .36] }, o));
const magnolia = (R, x, y, z, s, o = {}) => add('magnolia', x, y, z, Object.assign({ yaw: R() * TAU, s, col: [.2, .38, .1], col2: jit(PAL.magnolia, R, .03), v: [R() * 100, .15, 0, .8], bark: [1.1, 1.05, 1] }, o));
// a point on a pillar's surface
const surf = (s, th, y, inset = 0) => { const r = RR(s, y, th) - inset; return { x: s.x + Math.cos(th) * r, z: s.z + Math.sin(th) * r, r }; };
// direction (azimuth) from a pillar toward the key camera, for composing what faces the lens
const camTh = s => Math.atan2(KC.p.z - s.z, KC.p.x - s.x);
const angD = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

const HERO = { x: -49.9, y: 57.6, z: 188.75 }, ANC = { x: 19, z: -2.5 };
function plantSpire(s, hero) {
  const R = rng(s.seed * 977 + 5), dist = Math.hypot(s.x + 14, s.z - 96), big = hero ? 1.85 : clamp(dist / 420, 1.4, 3), isT = s.name === 'temple', isG = s.name === 'gate';
  const scheme = (s.seed * 7 + 1) % 4, mc = () => { const r = R(); return r < .72 ? scheme : r < .88 ? (scheme + 1) % 4 : (scheme + 3) % 4; };
  const placed = [];
  const free = (x, z, d) => { for (const p of placed) if (Math.hypot(p[0] - x, p[1] - z) < d) return false; return true; };
  const ok = (x, y, z, r, h) => !hero || (siteOK(x, y, z, r, h) && !blocksKey(x, y + h * .6, z, r));
  // ---- summit
  const nTop = hero ? Math.round(Math.PI * s.topR * s.topR / (30 * big * big)) + 2 : Math.min(40, Math.round(Math.PI * s.topR * s.topR / (26 * big * big)) + 3);
  for (let i = 0, n = 0; i < nTop * 8 && n < nTop; i++) {
    const th = R() * TAU, Rt = RR(s, s.h - .02, th), r = isT ? Rt - .35 - R() * .5 : Math.sqrt(R()) * .9 * Rt, x = s.x + Math.cos(th) * r, z = s.z + Math.sin(th) * r, y = (isT ? s.h : topY(s, x, z)) - .25;
    if (!free(x, z, (isT ? 4.2 : 4.4) * big)) continue;
    if (isT && (angD(th, 1.2) < 1.75 || Math.hypot(x - ANC.x, z - ANC.z) < 11)) continue;   // keep the monastery open toward the lens, and room for the old ginkgo
    const sc = big * (.8 + R() * .45) * (isT ? .85 : 1);
    if (!isT && !ok(x, y, z, 5 * sc, 9 * sc)) continue;
    placed.push([x, z]); n++;
    const k = R(), out = { lean: r > Rt * .72 ? .12 + R() * .2 : 0, laz: th, gy: isT ? null : y + .25 };
    if (k < .42) pine(R, x, y, z, sc * (hero ? .8 : 1), out); else if (k < (scheme === 3 ? .7 : .94)) maple(R, x, y, z, sc, mc(), out); else ginkgo(R, x, y, z, sc * .9);
  }
  // ---- ledges (the rock module squeezes each step into a flat tread at the ledge height)
  const e = useRock ? .3 : .014 * s.h;
  for (const yl of W.spireLedges(s)) {
    const circ = TAU * W.spireR(s, yl, 0), n = hero ? Math.round(circ / (3 * big)) : Math.round(circ / (11 * big)), lc = mc();
    for (let i = 0; i < n; i++) {
      const th = (i + R()) / n * TAU, ri = RR(s, yl + e, th), ro = RR(s, yl - e, th), wd = ro - ri;
      if (wd < .8) { if (hero && R() < .6) { const r = ro - .3, x = s.x + Math.cos(th) * r, z = s.z + Math.sin(th) * r; if (siteOK(x, yl, z, 1, 2) && !blocksKey(x, yl, z, 1.5)) shrub(R, x, yl - .3, z, 1 + R() * .7); } continue; }
      const r = ri + wd * (.3 + R() * .4), x = s.x + Math.cos(th) * r, z = s.z + Math.sin(th) * r, y = yl - .25, sc = big * clamp(.6 + wd * .14, .65, 1.1) * (.8 + R() * .4);
      let sc1 = sc; if (!ok(x, y, z, 4.5 * sc, 8 * sc)) { sc1 = sc * .55; if (!ok(x, y, z, 4.5 * sc1, 8 * sc1)) continue; }
      const k = R(), out = { lean: .1 + R() * .22, laz: th };
      if (k < .4) pine(R, x, y, z, sc1 * (hero ? .8 : 1), out, R() < .5 ? 'pine1' : null); else if (k < (scheme === 3 ? .72 : .96)) maple(R, x, y, z, sc1 * .9, R() < .85 ? lc : mc(), out); else ginkgo(R, x, y, z, sc1 * .75, out);
      if (hero && R() < .2) { const fc = R() < .45 ? PAL.azalea : R() < .5 ? [1, .7, .08] : [.95, .9, .85]; for (let j = 0; j < 5; j++) { const t2 = th + (R() - .5) * 6 / r, r2 = ri + .3 + R() * Math.max(.2, wd - .6), x2 = s.x + Math.cos(t2) * r2, z2 = s.z + Math.sin(t2) * r2; if (siteOK(x2, yl, z2, 1, 2) && !blocksKey(x2, yl, z2, 1.5)) add('azalea', x2, yl - .2, z2, { yaw: R() * TAU, s: .9 + R() * .6, col: jit(PAL.bush, R), col2: jit(fc, R, .08), v: [R() * 100, .5, .02, 1] }); } }
      if (hero) for (let j = 0; j < 2; j++) { const t2 = th + (j ? 1 : -1) * (1.6 + R()) / r, r2 = RR(s, yl + e, t2) + .3 + R() * Math.max(0, RR(s, yl - e, t2) - RR(s, yl + e, t2) - .6), x2 = s.x + Math.cos(t2) * r2, z2 = s.z + Math.sin(t2) * r2; if (siteOK(x2, yl, z2, 1, 2) && !blocksKey(x2, yl, z2, 1.5)) shrub(R, x2, yl - .2, z2, 1 + R() * .8); }
    }
  }
  // ---- pines growing out of the cliff faces
  const area = TAU * s.r * s.h * .85, nC = hero ? Math.round(area / 150) : Math.round(area / (1500 * big));
  for (let i = 0; i < nC; i++) {
    const th = R() * TAU, y = s.h * (.14 + .82 * R()), p = surf(s, th, y, .35), sc = (hero ? 1.4 : big) * (.55 + R() * .5);
    if (!ok(p.x + Math.cos(th) * 2, y, p.z + Math.sin(th) * 2, 3.5 * sc, 6 * sc)) continue;
    const k = R();
    if (k < .5) pine(R, p.x, y, p.z, sc, { yaw: -th }, R() < .6 ? 'pineCliff0' : 'pineCliff1');
    else if (k < .68) maple(R, p.x, y, p.z, sc * .6, mc(), { lean: .5 + R() * .3, laz: th });
    else if (hero) { shrub(R, p.x, y, p.z, 1.2 + R()); add(R() < .5 ? 'ivyLong' : 'ivyShort', p.x + Math.cos(th) * .5, y, p.z + Math.sin(th) * .5, { yaw: -th, s: .9 + R() * .6, lean: .05, laz: th, col: jit(R() < .2 ? PAL.creeper : PAL.ivy, R, .2), v: [R() * 100, .8, .1, 1.3] }); }
  }
  // ---- forest on the talus skirt down to the water
  const nS = hero ? Math.round(TAU * s.r * 1.3 * s.h * .13 / (34 * big)) : Math.round(TAU * s.r * 1.3 * s.h * .13 / (90 * big * big));
  for (let i = 0; i < nS; i++) {
    const th = R() * TAU, y = Math.max(.7, s.h * .15 * Math.pow(R(), 1.3)), p = surf(s, th, y, .5), sc = big * (.75 + R() * .5);
    if (W.h(p.x, p.z) > y) continue;
    if (hero && (!siteOK(p.x, y, p.z, 3 * sc, 9 * sc) || !free(p.x, p.z, 3.4))) continue;
    placed.push([p.x, p.z]);
    const k = R();
    if (hero && y < 6 && k < .3) bamboo(R, p.x, y, p.z, 4 + (R() * 5 | 0), 2.4, 1.3);
    else if (k < .66) maple(R, p.x, y, p.z, sc, mc(), { lean: .1, laz: th }); else if (k < .9) pine(R, p.x, y, p.z, sc * .85); else ginkgo(R, p.x, y, p.z, sc * .85);
  }
  if (!hero) return;
  // ---- creepers, ivy and wisteria hanging from every ledge and from the rim
  const lips = W.spireLedges(s).map(y => [y - e - .1, 1]).concat([[s.h - 1.2, 0]]);
  for (const [yl, isL] of lips) {
    const circ = TAU * W.spireR(s, yl, 0), n = Math.round(circ / 3.2);
    for (let i = 0; i < n; i++) {
      if (R() < .3) continue;
      const th = (i + R()) / n * TAU, p = surf(s, th, yl, -.3), L = R() < .5 ? 9 : 4.5, below = RR(s, Math.max(0, yl - L * .7), th) - p.r + .3;
      if (!siteOK(p.x, yl - L, p.z, 1.5, L + 1) || blocksKey(p.x, yl - 3, p.z, 2)) continue;
      const k = R(), lean = clamp(Math.atan2(below, L * .7), -.05, .6), o = { yaw: -th, lean, laz: th, s: .9 + R() * .6 };
      if (isL && R() < .3) add('roots', p.x - Math.cos(th) * .5, yl - .25, p.z - Math.sin(th) * .5, { yaw: -th, s: .8 + R() * .9, col: jit([.3, .22, .13], R, .2), v: [R() * 100, .2, 0, .7] });
      const facing = angD(th, camTh(s)) < 1.7;
      if (k < .22 && facing) add('wistCurtain', p.x, yl + .15, p.z, Object.assign(o, { s: 1 + R() * .5, col: jit(PAL.wleaf, R), col2: R() < .78 ? jit(PAL.violet, R, .08) : PAL.white, v: [R() * 100, .4, 0, 1.4] }));
      else if (k < .32) add('wistVine', p.x, yl, p.z, Object.assign(o, { col: jit(PAL.wleaf, R), col2: R() < .7 ? jit(PAL.violet, R, .08) : PAL.white, v: [R() * 100, .4, 0, 1.5] }));
      else if (k < .44) add(L > 5 ? 'ivyLong' : 'ivyShort', p.x, yl, p.z, Object.assign(o, { col: jit(PAL.creeper, R, .15), v: [R() * 100, .9, .12, 1.3] }));
      else add(L > 5 ? 'ivyLong' : 'ivyShort', p.x, yl, p.z, Object.assign(o, { col: jit(PAL.ivy, R, .2), v: [R() * 100, .6, .06, 1.3] }));
    }
  }
}

function plantBanks() {
  const R = rng(4242), cx = -14, cz = 96; LODK = .55;   // the bank forest hands over to its cheap levels sooner than the trees on the hero pillars
  const ring = (r0, r1, g, big) => {
    for (let x = cx - r1; x < cx + r1; x += g) for (let z = cz - r1; z < cz + r1; z += g) {
      const px = x + R() * g, pz = z + R() * g, d = Math.hypot(px - cx, pz - cz); if (d < r0 || d >= r1) continue;
      const y = W.h(px, pz); if (y < .5) continue;
      if (W.inSpire(px, Math.max(1, y), pz, 3) || !siteOK(px, y, pz, 4, 12)) continue;
      const grove = K.fbm2(px * .0052 + 3.1, pz * .0052 - 7.7, 3), hue = K.fbm2(px * .009 - 5, pz * .009 + 2, 2), sc = big * (.8 + R() * .5), k = R();
      if (y < 3.5 && d < 700 && K.noise2(px * .03, pz * .03) > .6) { bamboo(R, px, y, pz, 4 + (R() * 4 | 0), 2.6, 1.35); continue; }
      const ci = hue < .42 ? 0 : hue < .52 ? 1 : hue < .62 ? 2 : 3;
      if (grove < .42) { if (k < .8) pine(R, px, y, pz, sc * 1.1); else maple(R, px, y, pz, sc, ci, { gy: y, sl: 1 }); }
      else if (grove < .62) { if (k < .78) maple(R, px, y, pz, sc, k < .08 ? (ci + 1) % 4 : ci, { gy: y, sl: 1 }); else if (k < .93) pine(R, px, y, pz, sc); else ginkgo(R, px, y, pz, sc * .9); }
      else { if (k < .66) ginkgo(R, px, y, pz, sc); else if (k < .86) maple(R, px, y, pz, sc, 3, { gy: y, sl: 1 }); else pine(R, px, y, pz, sc); }
      if (d < 520 && R() < .25) shrub(R, px + 3, y, pz + 2, 1.2 + R() * .8);
    }
  };
  ring(0, 640, 11.5, 1.5); ring(640, 1750, 42, 4.4);
  // a denser, more colourful belt right at the water's edge
  for (let a = 0; a < TAU; a += .016) {
    let r = 140; while (r < 480 && W.h(cx + Math.cos(a) * r, cz + Math.sin(a) * r) < .6) r += 2.5; if (r >= 480) continue;
    for (let k = 0; k < 2; k++) {
      const rr = r + 2 + k * 9 + R() * 8, aa = a + (R() - .5) * .012, px = cx + Math.cos(aa) * rr, pz = cz + Math.sin(aa) * rr, y = W.h(px, pz); if (y < .5) continue;
      if (W.inSpire(px, Math.max(1, y), pz, 3) || !siteOK(px, y, pz, 4, 12)) continue;
      const hue = K.fbm2(px * .009 - 5, pz * .009 + 2, 2), ci = hue < .42 ? 0 : hue < .52 ? 1 : hue < .62 ? 2 : 3, sc = 1.3 + R() * .7, q = R();
      if (q < .6) maple(R, px, y, pz, sc, ci, { gy: y, sl: 1 }); else if (q < .8) ginkgo(R, px, y, pz, sc); else pine(R, px, y, pz, sc);
    }
  }

}

// the old maple beside the key camera: where its branches may grow (never across the view of Temple Peak and the dragon, never into the lens)
function heroKeep(px, py, pz) {
  const [tx, ty, zf, d] = keyUV(px + HERO.x, py + HERO.y, pz + HERO.z);
  if (d < 3.4) return false; if (zf < .4 || tx > .8 || ty > .52 || ty < -.5) return true;
  const n = (K.noise2(px * .6 + 3, pz * .6 + py * .4) - .5) * .12;
  if (tx < .2 + n) return false;
  if (tx < .47 + n && ty < .13 + n + smooth(.34, .2, tx) * .1) return false;
  return true;
}
// hand-placed plants: the key shot's foreground, the ancient ginkgo, blossom by the buildings, wisteria at the bridge
let LODK = 1;
function plantHero() {
  LODK = 1;
  const R = rng(99), G = W.gate, T = W.temple;
  const hm = add('mapleHero', HERO.x, HERO.y, HERO.z, { yaw: 0, s: 1, col: [.78, .065, .03], v: [7, .95, .2, 1], bark: [.7, .62, .56] });
  FLORA.hero = reg(hm, 'maple', 14, 10); FLORA.hero.col = [.7, .06, .03];
  // the pine leaning out over the void on the left, below the pavilion eave
  pine(R, -57.8, 60.3, 173.0, 1, { yaw: Math.PI / 2, col: [.1, .22, .07] }, 'pineHero');   // rooted in the terrace wall, rising into the gap between the eave and Temple Peak
  // the thousand-year ginkgo crowning Temple Peak, beside the pagoda
  const an = add('ancient', ANC.x, 142.3, ANC.z, { yaw: 1.1, s: 1.12, col: [1.3, .95, .07], col2: PAL.ribbon, v: [3, .28, .06, 1.3], bark: [.8, .74, .66] });
  FLORA.ancient = reg(an, 'ancient', 27, 16);
  // blossom beside the buildings: on the cliff at either end of the mid terrace …
  for (const [x, dy, m, s] of [[-17.5, 1.2, 0, 1.6], [26, 1.5, 1, 1.5], [-21, 5, 1, 1.3], [30, 6, 0, 1.4]]) {
    const y = S.mid.y + dy; let th = Math.acos(clamp((x - T.x) / 31, -1, 1)); for (let i = 0; i < 4; i++) th = Math.acos(clamp((x - T.x) / RR(T, y, th), -1, 1));
    const p = surf(T, th, y, .5); (m ? magnolia : plum)(R, p.x, y, p.z, s, { lean: .4, laz: th });
  }
  // … around the gate terrace, on the summit court, by the shore pavilion
  for (const [x, z, m] of [[-47.5, 192.5, 0], [-55, 195.5, 1], [-71.5, 192, 0], [-73.5, 181, 1]]) if (!blocksKey(x, 65, z, 3)) (m ? magnolia : plum)(R, x, topY(G, x, z) - .15, z, 1.3 + R() * .3);
  for (const [a, m] of [[.25, 1], [2.9, 0], [3.9, 1], [5.5, 0]]) { const r = RR(T, T.h - .02, a) - 2.6, x = T.x + Math.cos(a) * r, z = T.z + Math.sin(a) * r; (m ? magnolia : plum)(R, x, T.h + .35, z, 1.3 + R() * .3); }
  for (const [dx, dz] of [[-12, 9], [11, -12], [-4, -15]]) plum(R, S.shore.x + dx, Math.max(.6, W.h(S.shore.x + dx, S.shore.z + dz)), S.shore.z + dz, 1.3);
  // wisteria climbing the bridge posts at both ends
  const bd = new V3(S.bridgeB.x - S.bridgeA.x, 0, S.bridgeB.z - S.bridgeA.z).normalize(), bs = new V3(-bd.z, 0, bd.x);
  for (const [P, k] of [[S.bridgeA, 1], [S.bridgeB, -1]]) for (const sd of [-1, 1]) {
    const x = P.x + bs.x * sd * 1.55 - bd.x * k * .45, z = P.z + bs.z * sd * 1.55 - bd.z * k * .45;
    add('wistPost', x, P.y - .1, z, { yaw: R() * TAU, s: 1 + R() * .15, col: PAL.wleaf, col2: sd * k > 0 ? PAL.violet : [.62, .45, .98], v: [R() * 100, .4, 0, 1.4], bark: [.7, .62, .55] });
  }
  // wisteria spilling from the galleries and hanging halls of Temple Peak (their keep-out cylinders mark where they stand)
  for (const k of KEEP) {
    if (k.r < 3 || k.r > 9 || k.y0 < 70 || k.y0 > 130 || Math.hypot(k.x, k.z) < 24 || R() < .3) continue;
    const th = Math.atan2(k.z - T.z, k.x - T.x), n = 2 + (R() * 3 | 0);
    for (let i = 0; i < n; i++) { const a = th + (R() - .5) * 1.6, x = k.x + Math.cos(a) * k.r * .95, z = k.z + Math.sin(a) * k.r * .95;
      add('wistVine', x, k.y0 + .9, z, { yaw: -a, s: 1 + R() * .5, col: jit(PAL.wleaf, R), col2: R() < .7 ? jit(PAL.violet, R, .08) : PAL.white, v: [R() * 100, .4, 0, 1.5] }); }
  }
  // planting on the free rock of Gate Rock around the terrace: azalea, berries
  for (let i = 0; i < 70; i++) {
    const th = R() * TAU, rr = RR(G, G.h - .02, th), r = rr - .5 - R() * R() * 9, x = G.x + Math.cos(th) * r, z = G.z + Math.sin(th) * r;
    if (!siteOK(x, G.h, z, 1, 2) || blocksKey(x, G.h + 1, z, 1.6)) continue;
    shrub(R, x, topY(G, x, z) - .15, z, 1 + R() * .8);
  }
}

// ---------------------------------------------------------------- instanced meshes + LOD binning
let TM, TP, TLS, TC, binKey = '';
function buildMeshes() {
  const n = TREES.length; TM = new Float32Array(n * 16); TP = new Float32Array(n * 3); TLS = new Float32Array(n); TC = new Float32Array(n * 13);
  TREES.forEach((t, i) => {
    _q.setFromAxisAngle(UP, t.yaw);
    if (t.lean) { _ax.set(Math.sin(t.laz), 0, -Math.cos(t.laz)); _q2.setFromAxisAngle(_ax, t.lean); _q.premultiply(_q2); }
    _m.compose(_p.set(t.x, t.y, t.z), _q, _s.set(t.s, t.s, t.s)); _m.toArray(TM, i * 16);
    TC.set(t.col, i * 13); TC.set(t.col2, i * 13 + 3); TC.set(t.v, i * 13 + 6); TC.set(t.bark, i * 13 + 10);
    TP[i * 3] = t.x; TP[i * 3 + 1] = t.y + MODELS[t.mi].info.cy * t.s; TP[i * 3 + 2] = t.z; TLS[i] = t.lodS;
  });
  const CAP = [48, 170, 1300, 9000, 1e9];
  for (const M of MODELS) {
    const nt = M.trees.length; if (!nt) continue;
    M.lods.forEach((l, li) => {
      const cap = l.cap = li === M.lods.length - 1 ? nt : Math.min(nt, CAP[li]);
      l.im = new THREE.InstancedBufferAttribute(new Float32Array(cap * 16), 16); l.im.setUsage(THREE.DynamicDrawUsage);
      const mk = (geo, mat, isLeaf) => {
        const m = new THREE.InstancedMesh(geo, mat, cap); m.instanceMatrix = l.im; m.frustumCulled = false; m.count = 0; m.receiveShadow = li < 3;   // the far levels skip the shadow lookup (they lie at or beyond the edge of the shadow map)
        m.castShadow = li < 2 && (isLeaf || li < 1); if (isLeaf) m.customDepthMaterial = depthMat;
        m.onBeforeShadow = function () { this.count = l.nc; }; m.onAfterShadow = function () { this.count = l.n; };
        m.userData.tag = 'L' + li + (isLeaf ? 'leaf' : 'wood') + ' ' + M.name; m.renderOrder = 2 + li; /* after the rock and the buildings, near levels first: hidden leaves fail the depth test before they are shaded */ K.scene.add(m); FLORA.meshes.push(m); return m;
      };
      if (l.leaf) {
        l.ic = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); l.ic2 = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); l.iv = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
        l.leaf.setAttribute('iCol', l.ic); l.leaf.setAttribute('iCol2', l.ic2); l.leaf.setAttribute('iVar', l.iv); l.lm = mk(l.leaf, leafMat, true);
      }
      if (l.wood) { l.ib = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); l.wood.setAttribute('iBark', l.ib); l.wm = mk(l.wood, woodMat, false); }
    });
  }
}
const _lod = [];
function bin(cx, cy, cz, fx, fy, fz, fr, vx, vy, vz) {
  for (const M of MODELS) {
    const nt = M.trees.length; if (!nt) continue;
    const L = M.lods, nl = L.length, D = M.dist; for (const l of L) { l.n = 0; l.nc = 0; }
    for (let i = 0; i < nt; i++) {
      const ti = M.trees[i], x = TP[ti * 3], y = TP[ti * 3 + 1], z = TP[ti * 3 + 2], d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy) + (z - cz) * (z - cz)) / TLS[ti];
      let lod = 0; while (lod < nl - 1 && d >= D[lod]) lod++; if (d >= M.cull) lod = 9;
      if (lod === 0 && nl > 2) { const dx = x - cx, dy = y - cy, dz = z - cz, al = dx * vx + dy * vy + dz * vz, rr = M.info.r * TLS[ti] + 4; if (al < -rr || dx * dx + dy * dy + dz * dz - al * al > Math.pow(Math.max(al, 0) * 1.25 + rr, 2)) lod = 1; }   // out of view: fewer leaves, still casts its shadow
      const cast = lod < (M.big ? 2 : 1) && (x - fx) * (x - fx) + (z - fz) * (z - fz) < fr * fr && Math.abs(y - fy) < fr * 1.6;
      _lod[i] = lod + (cast ? 0 : 16);
    }
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < nt; i++) {
        const code = _lod[i]; if ((code >= 16) !== (pass === 1)) continue;
        let lod = code & 15; while (lod < nl && L[lod].n >= L[lod].cap) lod++; if (lod >= nl) continue;
        const l = L[lod], k = l.n++, ti = M.trees[i], c = ti * 13;
        const a = l.im.array, o = k * 16, s = ti * 16; for (let j = 0; j < 16; j++) a[o + j] = TM[s + j];
        if (l.ic) { const A = l.ic.array, B = l.ic2.array, V = l.iv.array, k3 = k * 3, k4 = k * 4; A[k3] = TC[c]; A[k3 + 1] = TC[c + 1]; A[k3 + 2] = TC[c + 2]; B[k3] = TC[c + 3]; B[k3 + 1] = TC[c + 4]; B[k3 + 2] = TC[c + 5]; V[k4] = TC[c + 6]; V[k4 + 1] = TC[c + 7]; V[k4 + 2] = TC[c + 8]; V[k4 + 3] = lod > 1 ? 0 : TC[c + 9]; }   // no wind beyond the near levels
        if (l.ib) { const A = l.ib.array, k3 = k * 3; A[k3] = TC[c + 10]; A[k3 + 1] = TC[c + 11]; A[k3 + 2] = TC[c + 12]; }
      }
      if (pass === 0) for (const l of L) l.nc = l.n;
    }
    L.forEach((l, li) => {
      if (!l.n && !l.n0) return; l.n0 = l.n;
      const up = (a, k) => { a.clearUpdateRanges(); a.addUpdateRange(0, l.n * k); a.needsUpdate = true; };
      up(l.im, 16);
      if (l.lm) { l.lm.count = l.n; up(l.ic, 3); up(l.ic2, 3); up(l.iv, 4); l.lm.castShadow = li < 2 && l.nc > 0; }
      if (l.wm) { l.wm.count = l.n; up(l.ib, 3); l.wm.castShadow = li < 1 && l.nc > 0; }
    });
  }
}

// ---------------------------------------------------------------- ground cover: grass, ferns, silver-grass, lotus, moss, fallen leaves
// Static instanced sets grouped by zone (a pillar, a stretch of shore); each zone is frustum-culled and switched off beyond its range.
const SETS = {}, SETMESH = [];
const crossCards = (n, w, h, cell, o = {}) => { const out = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI + (o.jit || 0) * i, nn = new V3(Math.cos(a), 0, Math.sin(a)); out.push({ p: new V3(0, 0, 0), a: new V3(0, 1, 0), a2: o.bend ? new V3(-nn.z * o.bend * (i % 2 ? 1 : -1), 1, nn.x * o.bend * (i % 2 ? 1 : -1)).normalize() : null, n: nn, sn: new V3(nn.x * .35, 1, nn.z * .35).normalize(), ng: UP, w, h, cell, occ: 1, occB: .45 }); } return out; };
function buildSetModels() {
  const R = rng(777);
  SETS.grass = { cards: crossCards(3, .75, .6, C.grass), far: 150 };
  SETS.reed = { cards: crossCards(3, 1.3, 2.5, C.reed, { bend: .22 }), far: 420 };
  { const cards = []; for (let i = 0; i < 4; i++) { const az = i / 4 * TAU + R() * .7, a = new V3(Math.cos(az) * .8, .62 + R() * .2, Math.sin(az) * .8).normalize(), a2 = new V3(Math.cos(az), -.35, Math.sin(az)).normalize(), n = new V3(-Math.cos(az) * .5, 1, -Math.sin(az) * .5); n.addScaledVector(a, -n.dot(a)).normalize();
      cards.push({ p: new V3(0, 0, 0), a, a2, n, sn: new V3(n.x * .5, 1, n.z * .5).normalize(), ng: UP, w: .3, h: .95 + R() * .25, cell: C.fern, occ: 1, occB: .5, flip: R() < .5 }); }
    SETS.fern = { cards, far: 170 }; }
  { const cards = []; for (let i = 0; i < 6; i++) { const az = R() * TAU, rr = .25 + Math.sqrt(R()) * 1.3, s = .7 + R() * .6, y = i < 3 ? .03 + i * .004 : .25 + R() * .45, a = new V3(Math.cos(az * 3), 0, Math.sin(az * 3)), n = new V3((R() - .5) * (i < 3 ? 0 : .4), 1, (R() - .5) * (i < 3 ? 0 : .4)); n.addScaledVector(a, -n.dot(a)).normalize();
      cards.push({ p: new V3(Math.cos(az) * rr, y, Math.sin(az) * rr).addScaledVector(a, -s * .5), a, n, sn: n, ng: UP, w: s, h: s, cell: C.lotus, occ: 1 }); }
    for (let k = 0; k < 2; k++) { const c = new V3(.5 - k * 1.1, .55 + k * .2, .2 + k * .6); for (let i = 0; i < 2; i++) { const nn = new V3(i, 0, 1 - i); cards.push({ p: c.clone().add(new V3(0, -.24, 0)), a: new V3(0, 1, 0), n: nn, sn: new V3(nn.x * .5, .8, nn.z * .5).normalize(), ng: UP, w: .5, h: .5, cell: C.magnolia, occ: 1, acc: false }); }
      cards.push({ p: c.clone().add(new V3(-.25, 0, 0)), a: new V3(1, 0, 0), n: UP, sn: UP, ng: UP, w: .5, h: .5, cell: C.magnolia, occ: 1 }); }
    SETS.lotus = { cards, far: 420 }; }
  SETS.litter = { cards: [{ p: new V3(-.5, 0, 0), a: new V3(1, 0, 0), n: UP, sn: UP, ng: UP, w: 1, h: 1, cell: C.mapleS, occ: 1 }], far: 130, mat: 1 };
  SETS.carpet = { cards: [{ p: new V3(-.5, 0, 0), a: new V3(1, 0, 0), n: UP, sn: UP, ng: UP, w: 1, h: 1, cell: C.mapleD, occ: .8 }], far: 260, mat: 1 };
  for (const k in SETS) { SETS[k].geo = leafGeo(SETS[k].cards); SETS[k].zones = {}; }
  // moss cushions use the bark material, tinted
  const g = new THREE.SphereGeometry(1, 7, 3, 0, TAU, 0, Math.PI * .5); g.scale(1, .45, 1); K.tint(g, 1, 1, 1); SETS.moss = { geo: g, zones: {}, far: 190, wood: true };
  const pg = new THREE.LatheGeometry([[.001, .3], [.2, .3], [.2, .34], [.25, .34], [.26, .3], [.22, .1], [.16, .02], [.17, 0], [.001, 0]].map(p => new THREE.Vector2(p[0], p[1])), 12); K.tint(pg, 1, 1, 1);
  { const u = pg.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, .31, .43); } SETS.pot = { geo: pg, zones: {}, far: 160, wood: true, cast: true };
}
function strew(name, zone, x, y, z, yaw, s, col, col2, v, lean = 0, laz = 0) { (SETS[name].zones[zone] || (SETS[name].zones[zone] = [])).push([x, y, z, yaw, s, col, col2 || col, v, lean, laz]); }
function buildSets() {
  for (const name in SETS) {
    const S0 = SETS[name];
    for (const zone in S0.zones) {
      const it = S0.zones[zone], n = it.length, g = new THREE.BufferGeometry(); for (const k in S0.geo.attributes) g.setAttribute(k, S0.geo.attributes[k]); g.setIndex(S0.geo.index);
      const m = new THREE.InstancedMesh(g, S0.wood ? woodMat : S0.mat ? groundMat : leafMat, n), ic = new Float32Array(n * 3), ic2 = new Float32Array(n * 3), iv = new Float32Array(n * 4);
      let cx = 0, cy = 0, cz = 0; for (const t of it) { cx += t[0] / n; cy += t[1] / n; cz += t[2] / n; } let rad = 0;
      it.forEach((t, i) => {
        _q.setFromAxisAngle(UP, t[3]); if (t[8]) { _ax.set(Math.sin(t[9]), 0, -Math.cos(t[9])); _q2.setFromAxisAngle(_ax, t[8]); _q.premultiply(_q2); }
        _m.compose(_p.set(t[0], t[1], t[2]), _q, _s.set(t[4], t[4], t[4])); m.setMatrixAt(i, _m); ic.set(t[5], i * 3); ic2.set(t[6], i * 3); iv.set(t[7] || [0, 0, 0, 0], i * 4);
        rad = Math.max(rad, Math.hypot(t[0] - cx, t[1] - cy, t[2] - cz));
      });
      if (S0.wood) g.setAttribute('iBark', new THREE.InstancedBufferAttribute(ic, 3));
      else { g.setAttribute('iCol', new THREE.InstancedBufferAttribute(ic, 3)); g.setAttribute('iCol2', new THREE.InstancedBufferAttribute(ic2, 3)); g.setAttribute('iVar', new THREE.InstancedBufferAttribute(iv, 4)); }
      m.receiveShadow = true; m.castShadow = !!S0.cast; m.renderOrder = 3; m.userData = { c: new V3(cx, cy, cz), far: S0.far + rad, tag: 'set ' + name }; K.scene.add(m); SETMESH.push(m); FLORA.meshes.push(m);
    }
  }
}
function plantGround() {
  const R = rng(31337), G = W.gate, T = W.temple;
  const gcol = () => jit(R() < .22 ? PAL.dry : PAL.grass, R, .2), gv = f => [R() * 100, .7, .22, f];
  const tuft = (zone, x, y, z, s = 1) => {
    const k = R();
    if (k < .68) strew('grass', zone, x, y - .03, z, R() * TAU, s * (1 + R() * 1.3), gcol(), null, gv(2.6));
    else if (k < .9) strew('fern', zone, x, y - .02, z, R() * TAU, s * (.6 + R() * .7), jit(PAL.fern, R, .2), null, gv(1.6));
    else strew('moss', zone, x, y - .05, z, R() * TAU, s * (.14 + R() * .3), jit([.2, .5, .08], R, .25));
  };
  W.spires.slice(0, 8).forEach(s => {
    const zone = s.name, isT = s.name === 'temple', isG = s.name === 'gate';
    // summit
    const nTop = isT ? 0 : Math.round(Math.PI * s.topR * s.topR * (isG ? 3.2 : 1.6));
    for (let i = 0; i < nTop; i++) {
      const th = R() * TAU, Rt = RR(s, s.h - .02, th), r = Math.sqrt(R()) * Rt * .97, x = s.x + Math.cos(th) * r, z = s.z + Math.sin(th) * r, y = topY(s, x, z);
      if (isG && (polyD(GATE_T, x, z) < .5 || segD(x, z, -50.6, 181.7, S.bridgeA.x, S.bridgeA.z)[0] < 1.6)) continue;
      if (!isG && !siteOK(x, y, z, .3, 1)) continue;
      if (r > Rt - 3.5 && R() < .16) strew('reed', zone, x, y - .05, z, R() * TAU, .7 + R() * .5, jit(PAL.reed, R, .2), PAL.plume, gv(3.5)); else tuft(zone, x, y, z);
    }
    // ledge treads
    const e = useRock ? .3 : .014 * s.h;
    for (const yl of W.spireLedges(s)) {
      const n = Math.round(TAU * W.spireR(s, yl, 0) / .8);
      for (let i = 0; i < n; i++) {
        const th = (i + R()) / n * TAU, ri = RR(s, yl + e, th), ro = RR(s, yl - e, th), wd = ro - ri; if (wd < .45) continue;
        const r = ri + .15 + R() * (wd - .3), x = s.x + Math.cos(th) * r, z = s.z + Math.sin(th) * r; if (!siteOK(x, yl, z, .3, 1)) continue;
        if (R() < .08 && wd > 1.2) strew('reed', zone, x, yl - .05, z, R() * TAU, .6 + R() * .4, jit(PAL.reed, R, .2), PAL.plume, gv(3.5)); else tuft(zone, x, yl, z, 1.1);
        if (R() < .3) { const x2 = s.x + Math.cos(th) * (ro + .05), z2 = s.z + Math.sin(th) * (ro + .05); strew('fern', zone, x2, yl - .15, z2, R() * TAU, .8 + R() * .7, jit(PAL.fern, R, .2), null, gv(1.6), .9, th); }   // ferns spilling over the lip
      }
    }
    // every small shelf and crack of the faces (found on the rock relief itself): tufts, ferns, dwarf pines, shrubs, creepers
    const nF = Math.round(TAU * s.r * s.h / 19);
    for (let i = 0; i < nF; i++) {
      const th = R() * TAU, y = s.h * (.03 + .95 * R()), ro = RR(s, y - .3, th), ri = RR(s, y + .5, th), wd = ro - ri;
      if (wd > .4) {
        const r = ri + .15 + R() * (wd - .25), x = s.x + Math.cos(th) * r, z = s.z + Math.sin(th) * r, k = R(); if (!siteOK(x, y, z, .5, 1.5)) continue;
        if (k < .09) { if (!blocksKey(x, y + 1, z, 2.5)) pine(R, x, y - .2, z, .28 + R() * .3, { lean: .25, laz: th, lodS: 1.4 }, 'pine2'); }
        else if (k < .2) { if (!blocksKey(x, y + .5, z, 1.5)) shrub(R, x, y - .15, z, .6 + R() * .5); }
        else tuft(zone, x, y - .08, z, 1.1);
      } else {
        const p = surf(s, th, y, .12), k = R(); if (!siteOK(p.x, y, p.z, .5, 1)) continue;
        if (k < .6) strew('fern', zone, p.x, y, p.z, R() * TAU, .8 + R() * .9, jit(PAL.fern, R, .25), null, gv(1.6), 1.1 + R() * .3, th);
        else if (k < .86) strew('moss', zone, p.x, y, p.z, R() * TAU, .25 + R() * .5, jit([.2, .5, .08], R, .25), null, null, 1.3, th);
        else if (!blocksKey(p.x, y - 2, p.z, 2)) add(R() < .5 ? 'ivyLong' : 'ivyShort', p.x + Math.cos(th) * .35, y, p.z + Math.sin(th) * .35, { yaw: -th, s: .8 + R() * .7, lean: .04, laz: th, col: jit(R() < .25 ? PAL.creeper : PAL.ivy, R, .2), v: [R() * 100, .8, .1, 1.3] });
      }
    }
    // lichen-grey dwarf shrubs along the rim
    for (let i = 0, n = Math.round(TAU * s.topR / 1.5); i < n; i++) {
      if (R() < .3) continue; const th = (i + R()) / n * TAU, r = RR(s, s.h - .02, th) - .3 - R() * .5, x = s.x + Math.cos(th) * r, z = s.z + Math.sin(th) * r;
      if (siteOK(x, s.h, z, .5, 1) && !blocksKey(x, s.h + .5, z, 1.2)) add('bush', x, s.h - .1, z, { yaw: R() * TAU, s: .4 + R() * .4, col: jit([.4, .44, .24], R, .15), v: [R() * 100, .3, .05, 1] });
    }
    // the water's edge: reeds on the rock, lotus on the water
    const nW = Math.round(TAU * s.r * 1.5 / 1.6);
    for (let i = 0; i < nW; i++) {
      const th = (i + R()) / nW * TAU, r0 = RR(s, .25, th), dens = K.noise2(Math.cos(th) * 2.2 + s.seed, Math.sin(th) * 2.2);
      if (W.h(s.x + Math.cos(th) * r0, s.z + Math.sin(th) * r0) > .3) continue;
      if (dens > .42) { const r = r0 - .4 + R() * 1.3; strew('reed', zone + 'w', s.x + Math.cos(th) * r, .05, s.z + Math.sin(th) * r, R() * TAU, .75 + R() * .6, jit(PAL.reed, R, .2), PAL.plume, gv(3.5)); }
      if (dens < .5 && R() < .55) { const r = r0 + 1.8 + R() * 6; strew('lotus', zone + 'w', s.x + Math.cos(th) * r, .02, s.z + Math.sin(th) * r, R() * TAU, .8 + R() * .7, jit(PAL.lotus, R, .15), jit(PAL.lotusF, R, .06), [R() * 100, .4, .1, .5]); }
    }
  });
  // the banks of the lake
  for (let a = 0; a < TAU; a += .009) {
    let r = 140; while (r < 480 && W.h(-14 + Math.cos(a) * r, 96 + Math.sin(a) * r) < .05) r += 2.5; if (r >= 480) continue;
    const zone = 'bank' + (a / TAU * 10 | 0), dens = K.noise2(Math.cos(a) * 5 + 9, Math.sin(a) * 5);
    for (let k = 0; k < 3; k++) {
      const rr = r - 6 + R() * 9, x = -14 + Math.cos(a + (R() - .5) * .01) * rr, z = 96 + Math.sin(a + (R() - .5) * .01) * rr, h = W.h(x, z);
      if (W.inSpire(x, 1, z, 2) || !siteOK(x, 0, z, 1, 3)) continue;
      if (h > -.5 && h < 1.2 && dens > .35) strew('reed', zone, x, Math.max(0, h) - .03, z, R() * TAU, .8 + R() * .7, jit(PAL.reed, R, .2), PAL.plume, gv(3.5));
      else if (h < -.4 && h > -3.5 && dens < .55 && R() < .6) strew('lotus', zone, x, .02, z, R() * TAU, .8 + R() * .8, jit(PAL.lotus, R, .15), jit(PAL.lotusF, R, .06), [R() * 100, .4, .1, .5]);
    }
  }
  // a carpet of fallen leaves under every maple that stands on level ground
  for (const m of FLORA.maples) {
    if (m.gy == null || Math.hypot(m.x + 14, m.z - 96) > 560) continue;
    const zone = 'c' + Math.round(m.x / 160) + '_' + Math.round(m.z / 160), n = 9 + (R() * 5 | 0), c = [m.col[0] * .85, m.col[1] * .85 + .01, m.col[2] * .85];
    for (let i = 0; i < n; i++) { const a = R() * TAU, r = Math.sqrt(R()) * m.r * 1.05, x = m.x + Math.cos(a) * r, z = m.z + Math.sin(a) * r; strew('carpet', zone, x, m.gy + .05 + (m.sl ? (W.h(x, z) - m.gy) : 0), z, R() * TAU, 1.5 + R() * 1.6, jit(c, R, .2), null, [R() * 100, 1, .35, 0]); }
  }
  // a skirt of moss cushions at the foot of every tree near the hero set
  for (const t of FLORA.trees) { if (Math.hypot(t.x + 14, t.z - 96) > 190 || t.kind === 'ancient' || t.r < 1.5) continue; for (let i = 0; i < 2; i++) { const a = R() * TAU, r = .35 + R() * 1.1; strew('moss', 'mk' + Math.round(t.x / 80) + '_' + Math.round(t.z / 80), t.x + Math.cos(a) * r, t.y + .1, t.z + Math.sin(a) * r, R() * TAU, .28 + R() * .45, jit([.2, .5, .08], R, .25)); } }
  // the gate terrace: potted bonsai pines and chrysanthemums along the balustrade, leaves gathered against the balusters, moss and ferns in the paving joints
  { const yT = 64.76, N = GATE_T.length, fix = [[-50.6, 181.7, 2.2], [-56.5, 189.6, 1.3], [-51.6, 187.3, 1], [-61.5, 189.8, 1.2], [-50, 179.6, .8], [-49.3, 184.6, .8], [KC.p.x, KC.p.z, 1.6]]; let gx = 0, gz = 0; for (const p of GATE_T) { gx += p[0] / N; gz += p[1] / N; }
    const free = (x, z, pad) => { for (const f of fix) if (Math.hypot(x - f[0], z - f[1]) < f[2] + pad) return false; for (const k of KEEP) if (k.r < 6.5 && k.y1 > 68 && Math.hypot(x - k.x, z - k.z) < 3.6 + pad && Math.hypot(k.x + 58, k.z - 184) > 9) return false; return polyD(GATE_T, x, z) < -.3; };
    const mum = [[1, .72, .06], [.96, .93, .86], [.78, .2, .05], [.9, .45, .6]];
    for (let i = 0, np = 0; i < N; i++) { const a = GATE_T[i], b = GATE_T[(i + 1) % N], L = Math.hypot(b[0] - a[0], b[1] - a[1]); let nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L; if ((gx - a[0]) * nx + (gz - a[1]) * nz < 0) { nx = -nx; nz = -nz; }
      for (let d = 1; d < L - .7; d += 1.75) { const x = a[0] + (b[0] - a[0]) * d / L + nx * .95, z = a[1] + (b[1] - a[1]) * d / L + nz * .95; if (!free(x, z, .2)) continue; np++;
        strew('pot', 'gateT', x, yT, z, R() * TAU, .9 + R() * .25, np % 3 ? [1.6, 3.4, 3.3] : [3.6, 1.7, 1.1]);
        if (np % 2) pine(R, x, yT + .3, z, .12 + R() * .04, { lodS: 7, lean: .15 + R() * .2, laz: R() * TAU }, 'pine2');
        else add('azalea', x, yT + .28, z, { yaw: R() * TAU, s: .5 + R() * .12, lodS: 2.6, col: jit(PAL.bush, R), col2: jit(mum[(np >> 1) % 4], R, .06), v: [R() * 100, .4, .02, 1] }); }
      for (let k = 0; k < L * 9; k++) { const d = R() * L, o = .4 + R() * R() * 1.1, x = a[0] + (b[0] - a[0]) * d / L + nx * o, z = a[1] + (b[1] - a[1]) * d / L + nz * o; if (free(x, z, -.4)) strew('litter', 'gateT', x, yT + .015, z, R() * TAU, .4 + R() * .35, jit(R() < .7 ? PAL.scarlet : R() < .5 ? PAL.orange : PAL.gold, R, .2), null, [R() * 100, 1, .4, 0]); } }
    for (let i = 0; i < 420; i++) { const x = -71 + R() * 22, z = 171 + R() * 22; if (!free(x, z, 0)) continue; const k = R();
      if (k < .6) strew('moss', 'gateT', x, yT - .012, z, R() * TAU, .05 + R() * .08, jit([.2, .5, .08], R, .25)); else if (k < .8) strew('fern', 'gateT', x, yT, z, R() * TAU, .13 + R() * .12, jit(PAL.fern, R, .2), null, gv(1.6)); else strew('grass', 'gateT', x, yT, z, R() * TAU, .22 + R() * .2, gcol(), null, gv(2.6)); } }
  // leaves blown across the paving of the gate terrace, and thick under the old maple
  for (let i = 0; i < 520; i++) {
    const x = -71 + R() * 22, z = 171 + R() * 22; if (polyD(GATE_T, x, z) > -.35) continue; let ok = true; for (const k of KEEP) if (k.r < 6.5 && k.y1 > 68 && Math.hypot(x - k.x, z - k.z) < 3.4 && Math.hypot(k.x + 58, k.z - 184) > 9) ok = false; if (!ok) continue;
    if (R() > .12 + .88 * sat(1.5 - Math.hypot(x - HERO.x, z - HERO.z) / 10)) continue;
    strew('litter', 'gateT', x, 64.775, z, R() * TAU, .45 + R() * .35, jit(R() < .8 ? PAL.scarlet : PAL.orange, R, .2), null, [R() * 100, 1, .4, 0]);
  }
  for (let i = 0; i < 90; i++) { const a = R() * TAU, r = Math.sqrt(R()) * 10, x = HERO.x + Math.cos(a) * r, z = HERO.z + Math.sin(a) * r; if (polyD(GATE_T, x, z) < .3 || Math.hypot(x - G.x, z - G.z) > RR(G, G.h - .02, Math.atan2(z - G.z, x - G.x)) - .3) continue; strew('carpet', 'gate', x, topY(G, x, z) + .05, z, R() * TAU, 1.4 + R() * 1.4, jit([.5, .05, .03], R, .25), null, [R() * 100, 1, .35, 0]); }
}
// falling foliage, all closed-form in the vertex shader: streams peeling off the crowns, a rain from the old maple in front of the lens,
// petals from the plum and magnolia trees, and gusts torn loose along the dragon's path (born when its body passes — a fixed time per leaf)
function buildFalling() {
  const R = rng(555), P = [], wx = .8, wz = .6;
  const put = (x, y, z, vx, vy, vz, b, size, sub, per, fall, c) => P.push(x, y, z, R(), vx, vy, vz, b, size, sub, per, fall, c[0], c[1], c[2]);
  const shape = c => c[1] > .4 ? 2 : R() < .3 ? 1 : 0, lc = c => { const o = jit(c, R, .22); o[1] += R() * .06; return o; };
  const src = FLORA.trees.filter(m => (m.kind === 'maple' || m.kind === 'ginkgo' || m.kind === 'ancient') && Math.hypot(m.x + 14, m.z - 96) < 250 && m.y > 18);
  for (let i = 0; i < 7000 && src.length; i++) { const m = src[(R() * src.length) | 0], a = R() * TAU, r = Math.sqrt(R()) * m.r * .8, sp = 3 + R() * 7, c = m.col || PAL.ginkgo;
    put(m.x + Math.cos(a) * r, m.y + m.h * (.4 + R() * .5), m.z + Math.sin(a) * r, wx * sp + (R() - .5) * 2, (R() - .3) * .8, wz * sp + (R() - .5) * 2, -1, .1 + R() * .13, shape(c), 9 + R() * 9, 14 + R() * 30, lc(c)); }
  for (let i = 0; i < 700; i++) { const zf = 3 + R() * 40, tx = (i < 350 ? .1 : -.55) + R() * (i < 350 ? .6 : 1.2), ty = .12 + R() * .5, p = KC.p.clone().addScaledVector(KC.f, zf).addScaledVector(KC.r, tx * zf).addScaledVector(KC.u, ty * zf);
    put(p.x, p.y, p.z, wx * (.3 + R()) * .7, 0, wz * (.3 + R()) * .4, -1, .058 + R() * .03, R() < .3 ? 1 : 0, 7 + R() * 6, zf * (.45 + R() * .6) + 1, lc([.85, .08, .03])); }
  const bl = TREES.filter(t => MODELS[t.mi].kind === 'plum' || MODELS[t.mi].kind === 'magnolia');
  for (let i = 0; i < 1300 && bl.length; i++) { const t = bl[(R() * bl.length) | 0], a = R() * TAU, r = Math.sqrt(R()) * 2.5 * t.s;
    put(t.x + Math.cos(a) * r, t.y + (2 + R() * 2.5) * t.s, t.z + Math.sin(a) * r, wx * (1.5 + R() * 3), 0, wz * (1.5 + R() * 3), -1, .05 + R() * .04, 3, 7 + R() * 7, 6 + R() * 14, jit(t.col2, R, .06)); }
  const pa = new V3(), pb = new V3(), times = [];
  if (K.film && K.film.dragonPos) for (let t = 0; t < K.DUR; t += .2) { K.film.dragonPos(t, pa); if (Math.hypot(pa.x + 14, pa.z - 96) < 420 && pa.y < 260) times.push(t); }
  for (let i = 0; i < 11000 && times.length; i++) { const tau = times[(R() * times.length) | 0] + R() * .2; K.film.dragonPos(tau, pa); K.film.dragonPos(tau + .05, pb); pb.sub(pa).multiplyScalar(20); if (pb.length() < 5) continue;
    const c = R() < .6 ? PAL.scarlet : R() < .55 ? PAL.gold : PAL.orange;
    put(pa.x, pa.y, pa.z, pb.x * .3, pb.y * .3, pb.z * .3, tau + R() * 2.4, .17 + R() * .2, shape(c), 5 + R() * 5, 0, lc(c)); }
  const N = P.length / 15, g = new THREE.InstancedBufferGeometry(), A = new Float32Array(N * 4), B = new Float32Array(N * 4), Cc = new Float32Array(N * 4), D = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { const o = i * 15; A.set(P.slice(o, o + 4), i * 4); B.set(P.slice(o + 4, o + 8), i * 4); Cc.set(P.slice(o + 8, o + 12), i * 4); D.set(P.slice(o + 12, o + 15), i * 3); }
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2)); g.setIndex([0, 1, 2, 0, 2, 3]);
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(A, 4)); g.setAttribute('aVel', new THREE.InstancedBufferAttribute(B, 4)); g.setAttribute('aPar', new THREE.InstancedBufferAttribute(Cc, 4)); g.setAttribute('iCol', new THREE.InstancedBufferAttribute(D, 3)); g.instanceCount = N;
  const m = new THREE.Mesh(g, fallMat); m.frustumCulled = false; m.castShadow = false; m.receiveShadow = true; m.userData.tag = 'falling'; K.scene.add(m); FLORA.meshes.push(m); FLORA.falling = N;
}

// ---------------------------------------------------------------- module
K.reg('flora', {
  init() {
    const t0 = performance.now(), ms = {};
    const lap = k => { ms[k] = Math.round(performance.now() - t0); };
    try { K.rock.R(W.temple, 50, 0); K.rock.topY(W.temple, 1, 1); useRock = true; } catch (e) { useRock = false; }
    KEEP = (K.arch && K.arch.keepOut) || [];
    mkMaterials(); lap('mat');
    buildModels(); lap('models');
    W.spires.forEach((s, i) => plantSpire(s, i < 8)); lap('spires');
    plantBanks(); lap('banks');
    plantHero(); lap('hero');
    buildSetModels(); plantGround(); lap('ground');
    buildMeshes(); buildSets(); lap('meshes');
    buildFalling(); lap('fall');
    K.flora = FLORA; FLORA.ms = ms; FLORA.count = TREES.length;
    FLORA.stats = () => { const o = { lv: [0, 0, 0, 0, 0], wv: [0, 0, 0, 0, 0], n: [0, 0, 0, 0, 0], sh: [0, 0, 0, 0, 0], by: {} }; for (const M of MODELS) M.lods.forEach((l, i) => { if (!l.n) return; const a = l.leaf ? l.leaf.attributes.position.count * l.n : 0, b = l.wood ? l.wood.attributes.position.count * l.n : 0; o.lv[i] += a; o.wv[i] += b; o.n[i] += l.n; o.sh[i] += l.nc; o.by[M.name] = (o.by[M.name] || 0) + a + b; }); return o; };
    FLORA.dbg = MODELS.map(M => M.name + ':' + M.trees.length + '/' + M.lods.map(l => l.leaf ? l.leaf.index.count / 6 : 0).join(',')).join(' ');
  },
  update(F) {
    const c = F.cam.pos, e = K.env, Q = 3, v = _p.copy(F.cam.tgt).sub(c).normalize();
    const kx = Math.round(c.x / Q) * Q, ky = Math.round(c.y / Q) * Q, kz = Math.round(c.z / Q) * Q, qx = Math.round(v.x * 8), qy = Math.round(v.y * 8), qz = Math.round(v.z * 8), ql = Math.hypot(qx, qy, qz) || 1;
    const key = kx + ',' + ky + ',' + kz + ',' + qx + ',' + qy + ',' + qz + ',' + e.shadowFocus.x + ',' + e.shadowFocus.z + ',' + e.shadowSize;
    for (const m of SETMESH) m.visible = c.distanceTo(m.userData.c) < m.userData.far;
    if (key !== binKey) { binKey = key; bin(kx, ky, kz, e.shadowFocus.x, e.shadowFocus.y, e.shadowFocus.z, e.shadowSize * 1.08, qx / ql, qy / ql, qz / ql); }
  }
});

})(window.K=window.K||{},window.THREE);
//# sourceURL=src/40_flora.js

(function(K,THREE){'use strict';
// ============================================================================
// 45_water — the turquoise lake, its planar reflection, the waterfalls, spray & mist at their feet,
// travertine pools, and life on the water (leaves, lotus, koi, sampans, floating lanterns, dragonflies).
// Exports K.water = { y, reflection, events, splash(), depthAt(), glslLight, lightUniforms }.
//
// Lake = two passes over one big disc at y = 0 (both in the transparent list, renderOrder −20/−19):
//   A  multiply  : dst *= per-channel transmittance (bed seen through the water, tinted turquoise)
//   B  additive  : inscatter body colour + caustics + Fresnel(reflection) + sun glitter + foam, haze
// Planar reflection: rendered from the lake mesh's onBeforeRender, i.e. INSIDE post's main scene render,
// after every module's update(F) has posed its objects (so the dragon is current), once per frame,
// half resolution HDR, oblique clip plane at y = 0, shadow-map update skipped, far = 6 km.
// ============================================================================
const V3 = THREE.Vector3, W = K.world, U = K.U, R = K.renderer;
const { sat, lerp, smooth } = K;
const TAU = Math.PI * 2;

const water = K.water = { y: 0, reflection: null, events: [], depthAt: null };
// shared uniform arrays (lake passes, particles, splash sheets)
const EVU = Array.from({ length: 4 }, () => new THREE.Vector4()), EVK = Array.from({ length: 4 }, () => new THREE.Vector4());
const CROSS = Array.from({ length: 8 }, () => new THREE.Vector4()), WX = new THREE.Vector4();
// per-event behaviour: enter (a body diving in: cavity, then a jet), the swell before an eruption, how long the lake boils after
function evMeta(e) {
  const T = K.film && K.film.T, near = (a, b) => b !== undefined && Math.abs(a - b) < .05;
  const enter = e.enter ?? (T ? near(e.t0, T.plunge) : false);
  const pre = e.pre ?? (T && near(e.t0, T.rise) ? 1.3 : enter ? 0 : .5);
  const boilEnd = e.boilEnd ?? (enter ? (T && T.burst ? T.burst + .2 : e.t0 + 2.6) : -1e4);
  return { enter: enter ? 1 : 0, pre, boilEnd };
}
// K.water.boil(x, z, t) -> 0..1: how hard the lake is boiling over the fight below (for the fx glow / steam)
water.boil = (x, z, t) => { let b = 0; for (const e of water.events) { const m = evMeta(e); if (!m.enter || t < e.t0 || t > m.boilEnd + .6) continue;
  const r = Math.hypot(x - e.x, z - e.z), S = e.size || 1; b = Math.max(b, smooth(e.t0 + .2, e.t0 + 1, t) * (1 - smooth(m.boilEnd - .4, m.boilEnd + .6, t)) * Math.exp(-r * r / (100 * S * S))); } return b; };
// dragon / film hook: K.water.splash(x, z, t0, size) — size 1 ≈ the loong's head dipping in (crown ~10 m)
water.splash = (x, z, t0, size = 1) => { water.events.push({ x, z, t0, size }); return water.events; };

// ---------------------------------------------------------------- depth / shore map (baked at init)
const MAP = { x0: -560, z0: -500, size: 1120, N: 512 };
let depA, pdA, rawA;   // effective depth (m), distance to nearest pillar waterline (m), raw bed depth
function bakeMap() {
  const N = MAP.N, c = MAP.size / N;
  depA = new Float32Array(N * N); pdA = new Float32Array(N * N).fill(80); rawA = new Float32Array(N * N);
  for (let j = 0; j < N; j++) { const z = MAP.z0 + (j + .5) * c; for (let i = 0; i < N; i++) rawA[j * N + i] = -W.h(MAP.x0 + (i + .5) * c, z); }
  for (const s of W.spires) {
    const rr = s.r * 1.9 + 40;
    const i0 = Math.max(0, Math.floor((s.x - rr - MAP.x0) / c)), i1 = Math.min(N - 1, Math.ceil((s.x + rr - MAP.x0) / c));
    const j0 = Math.max(0, Math.floor((s.z - rr - MAP.z0) / c)), j1 = Math.min(N - 1, Math.ceil((s.z + rr - MAP.z0) / c));
    if (i0 > i1 || j0 > j1) continue;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = MAP.x0 + (i + .5) * c, z = MAP.z0 + (j + .5) * c, dx = x - s.x, dz = z - s.z, d = Math.hypot(dx, dz);
      if (d > rr) continue;
      const pd = d - W.spireR(s, 0, Math.atan2(dz, dx)); const k = j * N + i; if (pd < pdA[k]) pdA[k] = pd;
    }
  }
  // submerged talus round every pillar foot: the bed rises toward the rock -> aquamarine halo
  for (let k = 0; k < N * N; k++) { const raw = rawA[k]; depA[k] = raw > 0 ? Math.min(raw, .25 + Math.max(0, pdA[k]) * .62) : raw; }
  addPosts();
  const hd = new Uint16Array(N * N * 4), th = THREE.DataUtils.toHalfFloat;
  for (let k = 0; k < N * N; k++) { hd[k * 4] = th(Math.max(-8, Math.min(40, depA[k]))); hd[k * 4 + 1] = th(Math.max(-8, Math.min(80, pdA[k]))); hd[k * 4 + 2] = th(Math.max(-8, Math.min(40, rawA[k]))); hd[k * 4 + 3] = th(0); }
  const t = new THREE.DataTexture(hd, N, N, THREE.RGBAFormat, THREE.HalfFloatType);
  t.minFilter = t.magFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
  return t;
}
// the lakeside pavilion (30_arch): built near sites.shore but pushed clear of wallR's foot, turned to face away from wallR;
// its jetty runs along local -x on posts at z = ±0.8. 30_arch does not export the frame, so it is recovered from
// K.arch.keepOut (the pavilion's cylinder, r 5..10 m, nearest the site) — fallback: the site itself.
const SHORE = { x: W.sites.shore.x, z: W.sites.shore.z, ry: Math.atan2(W.sites.shore.x - W.wallR.x, W.sites.shore.z - W.wallR.z) };
function findShore() { const ko = K.arch && K.arch.keepOut; if (!ko) return; let best = 45;
  for (const c of ko) { const d = Math.hypot(c.x - W.sites.shore.x, c.z - W.sites.shore.z); if (c.r > 5 && c.r < 10 && c.y0 < 4 && d < best) { best = d; SHORE.x = c.x; SHORE.z = c.z; } } }
let SHORE_RY = SHORE.ry;
const shoreW = (lx, lz, out = new V3()) => { const c = Math.cos(SHORE.ry), sn = Math.sin(SHORE.ry); return out.set(SHORE.x + lx * c + lz * sn, 0, SHORE.z - lx * sn + lz * c); };
function addPosts() {   // jetty posts, pavilion stilts and the walled islet feed the foam / wake field
  // structures standing in the water: K.arch.keepOut cylinders reaching the waterline (big ones -> 2 m foam map, thin ones ->
  // the shader pile list WPOSTS: ring + downwind wake), plus the pavilion's stilts / jetty piles / islet in the recovered SHORE frame.
  const ko = (K.arch && K.arch.keepOut || []).filter(c => c.y0 <= .6 && c.y1 >= -.3);
  const list = [];
  for (const c of ko) { if (c.r >= 1.5) list.push([c.x, c.z, c.r, 1]); else WPOSTS.push([c.x, c.z, c.r]); }
  list.push([17.9, 0, 3.9, 0]);                                                   // the walled islet beyond the moon bridge
  for (const q of POSTS) { const w = shoreW(q[0], q[1]); WPOSTS.push([w.x, w.z, q[2]]); }   // jetty piles + pavilion stilts
  const N = MAP.N, c = MAP.size / N;
  for (const [lx, lz, r, world] of list) { const p = world ? new V3(lx, 0, lz) : shoreW(lx, lz), rr = r + 6;
    const i0 = Math.max(0, Math.floor((p.x - rr - MAP.x0) / c)), i1 = Math.min(N - 1, Math.ceil((p.x + rr - MAP.x0) / c)), j0 = Math.max(0, Math.floor((p.z - rr - MAP.z0) / c)), j1 = Math.min(N - 1, Math.ceil((p.z + rr - MAP.z0) / c));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * N + i, d = Math.hypot(MAP.x0 + (i + .5) * c - p.x, MAP.z0 + (j + .5) * c - p.z) - r; if (d < pdA[k]) pdA[k] = d; } }
}
const POSTS = [], WPOSTS = [];
// is (x, z) inside / within pad of a structure standing at the waterline?
const blocked = (x, z, pad = 0) => { const ko = K.arch && K.arch.keepOut; if (!ko) return false; for (const c of ko) if (c.y0 <= 2.5 && c.y1 >= -.5 && Math.hypot(x - c.x, z - c.z) < c.r + pad) return true; return false; };
for (let i = 0; i < 9; i++) for (const z of [-.8, .8]) POSTS.push([-6 - i * 1.6, z, .12]);
for (let x = -4.5; x <= 4.5; x += 2.25) for (let z = -4.5; z <= 4.5; z += 2.25) if (Math.abs(x) > 2 || Math.abs(z) > 2) POSTS.push([x, z, .2]);
const sampleA = (A, x, z, out) => {
  const N = MAP.N, fx = (x - MAP.x0) / MAP.size * N - .5, fz = (z - MAP.z0) / MAP.size * N - .5;
  if (fx < 0 || fz < 0 || fx >= N - 1 || fz >= N - 1) return out;
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * N + i;
  return lerp(lerp(A[k], A[k + 1], u), lerp(A[k + N], A[k + N + 1], u), v);
};
water.depthAt = (x, z) => sampleA(depA, x, z, -W.h(x, z));
const pillarDist = (x, z) => sampleA(pdA, x, z, 80);
// nearest open-water point to (x,z) whose depth is in [d0,d1] and pillar clearance >= pmin
function findWater(x, z, d0, d1, pmin, maxR = 120) {
  for (let r = 0; r < maxR; r += 1.5) {
    const n = Math.max(1, Math.round(r * .9));
    for (let k = 0; k < n; k++) { const a = k / n * TAU + r * .37, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r, d = water.depthAt(px, pz), p = pillarDist(px, pz);
      if (d >= d0 && d <= d1 && p >= pmin) return new V3(px, 0, pz); }
  }
  return new V3(x, 0, z);
}

// ---------------------------------------------------------------- baked textures
let tRip, tCaus, tStreak;
function bakeTextures() {
  // tileable ripple field: 40 directional waves with integer wave vectors. rg = slope, b = height
  tRip = K.bake(512, 512, /* glsl */`
    vec4 bake(vec2 uv){ vec2 g = vec2(0.); float h = 0.;
      for(int i=0;i<44;i++){ float fi = float(i); vec2 r = kHash22(vec2(fi*1.37+.5, 7.13));
        float f = floor(2. + pow(r.x, 1.5)*26.); float a = 6.2832*r.y + (r.x-.5)*.0; vec2 k = floor(vec2(cos(a), sin(a))*f + .5);
        if(dot(k,k) < 1.) k = vec2(1.,1.);
        float amp = 1./pow(length(k), 1.45); float ph = kHash12(vec2(fi, 3.3))*6.2832;
        float s = dot(k, uv)*6.2832 + ph; h += amp*sin(s); g += amp*cos(s)*k; }
      return vec4(g*.045 + .5, h*.18 + .5, 1.); }`);
  // tileable caustic network (two independent layers in r and g)
  tCaus = K.bake(512, 512, /* glsl */`
    vec2 vor(vec2 p, float per, float sd){ vec2 n = floor(p), f = fract(p); float d1 = 8., d2 = 8.;
      for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){ vec2 g = vec2(i,j); vec2 o = kHash22(mod(n+g, per) + sd); vec2 r = g + o - f; float d = dot(r,r);
        if(d < d1){ d2 = d1; d1 = d; } else if(d < d2) d2 = d; }
      return vec2(sqrt(d1), sqrt(d2)); }
    vec4 bake(vec2 uv){ vec2 a = vor(uv*7., 7., 0.), b = vor(uv*11. + .3, 11., 9.1);
      float ca = 1. - smoothstep(0., .16, a.y - a.x), cb = 1. - smoothstep(0., .16, b.y - b.x);
      return vec4(ca, cb, a.x, 1.); }`);
  // tileable waterfall streaks: x across (fine), y along the flow (coarse) -> braided threads
  tStreak = K.bake(256, 512, /* glsl */`
    float pn(vec2 p, vec2 per){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
      float a = kHash12(mod(i, per)), b = kHash12(mod(i+vec2(1,0), per)), c = kHash12(mod(i+vec2(0,1), per)), d = kHash12(mod(i+vec2(1,1), per));
      return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }
    float pf(vec2 uv, vec2 per){ float s = 0., a = .5; for(int i=0;i<5;i++){ s += a*pn(uv*per, per); per *= 2.; a *= .5; } return s/.97; }
    vec4 bake(vec2 uv){
      vec2 w = uv + vec2(pf(uv + .3, vec2(4., 2.))*.08, 0.);
      float s1 = pf(w, vec2(36., 3.)); float s2 = pf(w + .5, vec2(18., 2.)); float bl = pf(uv + .71, vec2(10., 8.));
      float th = pow(1. - abs(2.*pn(w*vec2(64., 4.), vec2(64., 4.)) - 1.), 3.);
      return vec4(s1, s2, bl, th); }`);
}

// ---------------------------------------------------------------- splash events (rise, plunge, bursts, K.water.splash)
// uEv[i]  = (x, z, t0, size)          uEvK[i] = (enter 0/1, pre-swell seconds, boil end time, 0)
// evField(p, t) -> (height, dh/dx, dh/dz): central mound / cavity, three racing wave fronts, the boil heave, late ripples.
// The same closed form displaces the lake vertices and gives the fragment normals, so the surface really heaves.
const EV_GLSL = /* glsl */`
uniform vec4 uEv[4]; uniform vec4 uEvK[4];
float evC(float S, float enter){ return 32.*sqrt(S/1.7)*(1. + .12*enter); }
float evA(float S, float R, float age){ return 2.4*S/(1. + R/22.)*exp(-age*.10)*smoothstep(0., .25, age); }
vec3 evField(vec2 p, float t){ vec3 o = vec3(0.);
  for(int i=0;i<4;i++){ vec4 ev = uEv[i]; vec4 ek = uEvK[i]; if(ev.w <= 0.) continue;
    float S = ev.w, age = t - ev.z; if(age < -ek.y || age > 45.) continue;
    vec2 d = p - ev.xy; float r = length(d); vec2 dn = d/max(r, .001); float h = 0., dh = 0.;
    if(age < 0.){ float k = smoothstep(-ek.y, 0., age); k *= k; float R = 5.5*S, e = exp(-r*r/(R*R));
      float wob = 1. + .25*sin(t*9. + r*.8); h += 1.2*S*k*e*wob; dh += 1.2*S*k*e*wob*(-2.*r/(R*R));
      float rp = r - (ek.y + age)*6.; dh += cos(r*1.6 - t*9.)*.35*k*exp(-r/(9.*S)); }
    else {
      float c = evC(S, ek.x);
      for(int k=0;k<3;k++){ float fk = float(k); float R = c*age*(1. - .27*fk); float w = 2.2 + .10*R + fk;
        float A = evA(S, R, age)*(k == 0 ? 1. : .55 - .15*fk);
        float x = (r - R)/w, g1 = exp(-x*x), x2 = x + 1.3, g2 = exp(-x2*x2);
        h += A*(g1 - .5*g2); dh += A*(-2.*x*g1 + x2*g2)/w; }
      float Rc = 3.2*S, ec = exp(-r*r/(Rc*Rc));
      float m = ek.x > .5 ? -2.6*S*exp(-age*1.6)*smoothstep(0., .12, age) + 1.6*S*smoothstep(.5, 1.1, age)*exp(-max(age - 1.1, 0.)*.9)
                          : 2.4*S*exp(-age*.75)*smoothstep(0., .1, age);
      h += m*ec; dh += m*ec*(-2.*r/(Rc*Rc));
      if(t < ek.z + .6){ float b = smoothstep(ev.z + .3, ev.z + 1.2, t)*smoothstep(ek.z + .6, ek.z - .4, t); float Rb = 10.*S, eb = exp(-r*r/(Rb*Rb));
        float n = texture2D(uNoiseTex, p*.035 + vec2(t*.21, -t*.17)).r - .5, n2 = texture2D(uNoiseTex, p*.09 - vec2(t*.33, t*.27)).a - .5;
        float hb = b*S*(1.1 + .6*sin(t*2.7 + r*.3) + 2.2*n + 1.2*n2)*eb; h += hb; dh += hb*(-2.*r/(Rb*Rb)) + b*S*eb*sin(r*.9 - t*5.)*.8; }
      float R2 = 4.*age + 3., a2 = .3*S*exp(-age*.11)/(1. + R2/40.);
      dh += cos(r*1.4 - age*6.)*1.4*a2*smoothstep(R2 + 6., R2, r)*.5;
    }
    o.x += h; o.yz += dn*dh;
  }
  return o; }
// boil intensity 0..1 at p (the plunge: from entry until the bursts)
float evBoil(vec2 p, float t){ float b = 0.; for(int i=0;i<4;i++){ vec4 ev = uEv[i]; vec4 ek = uEvK[i]; if(ev.w <= 0. || t > ek.z + .6 || t < ev.z) continue;
  float r = length(p - ev.xy); b = max(b, smoothstep(ev.z + .2, ev.z + 1., t)*smoothstep(ek.z + .6, ek.z - .4, t)*exp(-r*r/(100.*ev.w*ev.w))); } return b; }
`;

// ---------------------------------------------------------------- GLSL shared by the lake passes
const LAKE_GLSL = EV_GLSL + /* glsl */`
uniform sampler2D tMap, tRip, tCaus; uniform vec4 uBox;
uniform vec4 uImp[6]; uniform vec3 uPosts[40]; uniform vec4 uPostBox;
uniform vec4 uCross[8];      // dragon bodies piercing the surface: (x, z, body radius, strength)
uniform vec4 uWx;            // x rain, y calm boost (opening), z 0, w 0
varying vec3 vW; varying float vH;
vec4 mapAt(vec2 p){ vec2 uv = (p - uBox.xy)/uBox.z; vec4 m = texture2D(tMap, uv);
  float inb = step(0., uv.x)*step(uv.x, 1.)*step(0., uv.y)*step(uv.y, 1.);
  return mix(vec4(26., 80., 26., 0.), m, inb); }
// foam + extra slope from the falls' impact zones and the dragon's splash events
void disturb(vec2 p, float t, inout vec2 g, inout float foam){
  for(int i=0;i<6;i++){ vec4 im = uImp[i]; if(im.w <= 0.) continue;
    vec2 d = p - im.xy; float r = length(d); vec2 dn = d/max(r, 1e-3); float R0 = im.z;
    float n = texture2D(uNoiseTex, p*.09 + vec2(t*.21, -t*.17)).r;
    float boil = smoothstep(R0*1.05, R0*.25, r + (n - .5)*R0*.7);
    float ph = r*1.25 - t*4.2;
    float ringA = exp(-max(r - R0*.6, 0.)/(R0*1.3)) * smoothstep(R0*.4, R0*.9, r);
    g += dn*cos(ph + n*3.)*.3*ringA*im.w;
    float rings = pow(.5 + .5*sin(ph + n*3.5), 10.)*ringA*.25*smoothstep(.45, .7, texture2D(uNoiseTex, vec2(atan(d.y, d.x)*.9, r*.02)).r + .1);
    float streak = smoothstep(.5, .8, texture2D(uNoiseTex, vec2(atan(d.y, d.x)*.6, r*.05 - t*.08)).a) * exp(-r/(R0*1.5));
    foam = max(foam, (boil*(.65 + .5*n) + rings + streak*.35)*im.w);
    // boiling surface: chaotic slopes
    g += (texture2D(tRip, p*.43 + t*vec2(.31, -.27)).rg - .5)*3.*boil*im.w; }
  // dragon bodies through the surface: white collar + churned trail
  for(int i=0;i<8;i++){ vec4 cr = uCross[i]; if(cr.w <= 0.) continue; vec2 d = p - cr.xy; float r = length(d), R = cr.z;
    float n = texture2D(uNoiseTex, p*.21 + vec2(t*.6, -t*.5)).r, n2 = texture2D(uNoiseTex, p*.07 - t*.11).a;
    float collar = smoothstep(R + 2.6 + 2.*n2, R + .3, r);
    float churn = smoothstep(R + 7. + 4.*n2, R + 1., r)*smoothstep(.45, .7, n);
    foam = max(foam, (collar*(.75 + .35*n) + churn*.6)*cr.w);
    g += normalize(d + 1e-4)*sin(r*2.2 - t*11.)*exp(-max(r - R, 0.)*.18)*1.4*cr.w; }
}
// splash looks: foam fields, the dark shape and glow under the surface before the rise
void evLook(vec2 p, float t, inout float foam, inout float dark, inout vec3 glow){
  for(int i=0;i<4;i++){ vec4 ev = uEv[i]; vec4 ek = uEvK[i]; if(ev.w <= 0.) continue;
    float S = ev.w, age = t - ev.z; if(age < -ek.y || age > 45.) continue;
    vec2 d = p - ev.xy; float r = length(d);
    float n = texture2D(uNoiseTex, p*.06 + vec2(age*.02, -age*.015)).r, n2 = texture2D(uNoiseTex, p*.19 + age*.03).a;
    if(age < 0.){ float k = smoothstep(-ek.y, 0., age);
      float sh = smoothstep(6.*S*(.5 + k), 0., r + (n - .5)*7.); dark = max(dark, sh*sqrt(k)*.95);
      glow += vec3(1., .36, .10)*exp(-r*r/(12.*S*S))*k*k*1.1;
      float rings = pow(.5 + .5*sin(r*1.6 - t*9.), 8.)*exp(-r/(8.*S))*k; foam = max(foam, rings*.45);
      continue; }
    float c = evC(S, ek.x), R = c*age, A = evA(S, R, age);
    float x = (r - R)/(2.2 + .10*R);
    float crest = exp(-x*x*1.6)*smoothstep(.15, .5, n2 + .25)*clamp(A*.7, 0., 1.);
    float Rf = S*(4.5 + 3.5*sqrt(age))*(1. + .25*ek.x);
    float sheet = smoothstep(Rf, Rf*.55, r + (n - .5)*Rf*.5)*exp(-age*.11);
    float patches = smoothstep(.56, .78, n + n2*.25)*smoothstep(Rf*2.2, Rf*.6, r)*smoothstep(45., 12., age);
    float streaks = smoothstep(.45, .75, texture2D(uNoiseTex, vec2(atan(d.y, d.x)*1.3, r*.04 - age*.05)).a + n*.3);
    foam = max(foam, max(crest*.7*streaks, max(sheet*(.25 + .4*streaks)*smoothstep(.3, .6, n2 + .15), patches*.45*streaks)));
    float b = evBoil(p, t);
    foam = max(foam, b*.55*smoothstep(.45, .75, n2 + n*.45));
    glow += vec3(1., .42, .12)*b*b*(.4 + .6*n)*.6*(1. - .5*ek.x);
    dark = max(dark, smoothstep(Rf*.6, 0., r)*exp(-age*3.)*.4);
  }
}
// rain: rings opening on the surface, two staggered cell layers
vec2 rainRings(vec2 p, float t, float dist){ vec2 g = vec2(0.); if(uWx.x <= .01 || dist > 90.) return g;
  for(int l=0;l<2;l++){ float fl = float(l); vec2 q = p*1.7 + fl*vec2(.37, .71); vec2 c = floor(q);
    vec2 f = fract(q) - .5 - (kHash22(c + fl*7.) - .5)*.45; float ph = fract(t*(1.1 + .4*fl) + kHash12(c + fl*3.));
    float on = step(kHash12(c*1.3 + fl), uWx.x*.9); float R = ph*.42, dd = length(f);
    float ring = exp(-pow((dd - R)/.035, 2.))*(1. - ph)*on; g += f/max(dd, .01)*ring*2.2; }
  return g*smoothstep(90., 15., dist); }
vec2 waves(vec2 p, float dist, float t, float shelter, out float calm){
  vec2 wd = uWind.xy; vec2 wp = vec2(-wd.y, wd.x);
  // cat's-paw gusts: large patches of calm (mirror) and ruffled water drifting with the wind
  float c = texture2D(uNoiseTex, p*.0016 - wd*t*.0011).r*.75 + texture2D(uNoiseTex, p*.0051 + wp*t*.0015).a*.35;
  calm = smoothstep(.47, .72, c)*(.2 + .8*shelter);
  vec2 g1 = texture2D(tRip, p/11. - wd*t*.045).rg - .5;
  vec2 g2 = texture2D(tRip, p/4.3 + wp*t*.05 - wd*t*.035).rg - .5;
  vec2 g3 = texture2D(tRip, p/1.55 - wd*t*.12 + wp*t*.03).rg - .5;
  vec2 sw = texture2D(tRip, p/97. + wd*t*.0035).rg - .5;
  float l1 = 1./(1. + dist*.006), l2 = 1./(1. + dist*.02);
  return sw*.7 + (g1*1.0 + g2*.7*l1 + g3*.4*l2)*mix(.06, 1., calm)*(.6 + uWind.z*1.6);
}
`;

// ---------------------------------------------------------------- the lake
let lakeA, lakeB, lakeMatA, lakeMatB, rt, rcam, texM = new THREE.Matrix4(), frameNo = 0, reflDone = -1, crossDone = -1;
// where a dragon's body pierces the lake: spine samples changing sign in y (K.dragon / K.rival.spine, posed by 50_dragon this frame)
const _s0 = new V3(), _s1 = new V3();
function findCrossings() {
  let n = 0;
  for (const D of [K.dragon, K.rival]) { if (!D || !D.spine || n >= 8) continue;
    const L = D.bodyLength || D.length || 150; let prev = null;
    for (let s = 0; s <= L && n < 8; s += 1.5) { D.spine(s, _s1);
      if (prev !== null && (prev < 0) !== (_s1.y < 0)) { const f = prev / (prev - _s1.y), x = lerp(_s0.x, _s1.x, f), z = lerp(_s0.z, _s1.z, f);
        const R = D.radius ? Math.max(.4, D.radius(s)) : 1.5; CROSS[n++].set(x, z, R, 1); }
      prev = _s1.y; _s0.copy(_s1); } }
  for (; n < 8; n++) CROSS[n].set(0, 0, 0, 0);
}
// splash sheets: the crown wall and the column as open, animated sheets of streaked water (one mesh per event slot)
const sheets = [];
function buildSheets() {
  const NU = 96, NV = 28, pos = [], idx = [];
  for (let part = 0; part < 2; part++) { const o = pos.length / 3;
    for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) pos.push(i / NU, j / NV, part);
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const a = o + j * (NU + 1) + i, b = a + NU + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.boundingSphere = new THREE.Sphere(new V3(), 1e5);
  for (let slot = 0; slot < 4; slot++) {
    const m = K.shaderMat({ uniforms: { uEv: { value: EVU }, uEvK: { value: EVK }, uSlot: { value: slot }, tStreak: { value: tStreak } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: /* glsl */`uniform vec4 uEv[4]; uniform vec4 uEvK[4]; uniform float uSlot;
        varying vec2 vUv; varying float vPart, vAge, vAl; varying vec3 vW, vN;
        void main(){ int sl = int(uSlot + .5); vec4 ev = uEv[sl], ek = uEvK[sl]; float S = ev.w, age = uTime - ev.z, e = ek.x, sS = sqrt(max(S, 0.));
          float u = position.x, v = position.y, part = position.z, a = u*6.2832;
          float n = texture2D(uNoiseTex, vec2(u*3. + ev.x*.01, v*.6 + age*.12)).r - .5, n2 = texture2D(uNoiseTex, vec2(u*9., v*1.7 - age*.3)).a - .5;
          float r, y, al;
          if(part < .5){ float H = max(0., 15.*sS*(1. + .25*e)*age - 4.9*age*age); float Rb = S*(2.2 + 5.*sqrt(max(age, 0.)));
            r = Rb + v*H*(.3 + .15*age) + (n*1.2 + n2*.5*v)*S; y = v*H*(1. + n*.35); al = smoothstep(0., .08, age)*smoothstep(2.8, 1.1, age)*.85; }
          else { float a2 = age - e*.55, vc = 23.*sS*(1. + .1*e), Hc = max(0., vc*a2 - 4.9*a2*a2), tp = vc/9.8;
            r = S*(e > .5 ? .6 : 1.3)*(1. + .8*v + .35*sin(a*3. + v*5. + age*2.)) + (n*.7 + n2*.4)*S; y = v*Hc*(1. + n2*.08); al = smoothstep(0., .1, a2)*smoothstep(tp*2.1, tp*1.05, a2); }
          if(S <= 0. || age < 0.) al = 0.;
          vec3 p = vec3(ev.x + cos(a)*r, y, ev.y + sin(a)*r);
          vN = normalize(vec3(cos(a), .25, sin(a))); vUv = vec2(u, v); vPart = part; vAge = age; vAl = al; vW = p;
          gl_Position = al > .001 ? projectionMatrix*viewMatrix*vec4(p, 1.) : vec4(0., 0., 2., 1.); }`,
      fragmentShader: /* glsl */`uniform sampler2D tStreak; varying vec2 vUv; varying float vPart, vAge, vAl; varying vec3 vW, vN;
        void main(){ bool crown = vPart < .5; float u = vUv.x, v = vUv.y;
          vec4 a = texture2D(tStreak, vec2(u*(crown ? 11. : 6.), v*(crown ? 1.2 : 2.6) - vAge*1.4));
          vec4 b = texture2D(tStreak, vec2(u*(crown ? 23. : 13.) + .3, v*(crown ? 2. : 4.) - vAge*1.9));
          float st = a.r*.55 + b.g*.45 + a.a*.3;
          float thr = .24 + .42*smoothstep(.55, 1., v) + .12*vAge*(crown ? 1. : .5);      // tears into fingers at the rim, breaks up as it ages
          float al = smoothstep(thr, thr + .16, st)*vAl*smoothstep(0., .05, v)*(crown ? .92 : .78);
          if(al < .01) discard;
          vec3 V = normalize(cameraPosition - vW); vec3 n = normalize(vN); if(dot(n, V) < 0.) n = -n;
          float sunF = .45 + .55*max(dot(n, uSunDir), 0.), back = pow(max(dot(-V, uSunDir), 0.), 4.);
          vec3 E = uSunCol*(sunF*.36 + back*.35) + uSkyCol*.95;
          vec3 col = mix(vec3(.55, .82, .80), vec3(.97, .99, 1.), smoothstep(.2, .7, st + v*.3))*E*(.75 + .35*a.a);
          gl_FragColor = vec4(kFog(col, vW), al); }` });
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 5; mesh.userData.slot = slot; mesh.visible = false; K.scene.add(mesh); sheets.push(mesh);
  }
}
const hideInRefl = [];
function postUniforms() {   // up to 40 piles, nearest the jetty first
  const c = shoreW(-6, 0), L = WPOSTS.slice().sort((a, b) => Math.hypot(a[0] - c.x, a[1] - c.z) - Math.hypot(b[0] - c.x, b[1] - c.z)).slice(0, 40);
  return Array.from({ length: 40 }, (_, i) => L[i] ? new V3(L[i][0], L[i][1], L[i][2]) : new V3()); }
function postBox() { const P = postUniforms().filter(v => v.z > 0); if (!P.length) return new THREE.Vector4(0, 0, -1, 0);
  const c = P.reduce((a, v) => a.add(new V3(v.x, 0, v.y)), new V3()).multiplyScalar(1 / P.length); let r = 0; for (const v of P) r = Math.max(r, Math.hypot(v.x - c.x, v.y - c.z));
  return new THREE.Vector4(c.x, c.z, r + 4, 0); }
function buildLake(mapTex) {
  // camera-centred polar grid (dense rings near the lens, 9 km out): the vertex shader places it round the camera and
  // displaces it with evField, so splash waves are real geometry where it matters
  const NR = 190, NA = 256, gp = [0, 0, 0], gi = [];
  for (let i = 1; i <= NR; i++) for (let j = 0; j < NA; j++) gp.push(i / NR, 0, j / NA * TAU);
  for (let j = 0; j < NA; j++) gi.push(0, 1 + (j + 1) % NA, 1 + j);
  for (let i = 0; i < NR - 1; i++) for (let j = 0; j < NA; j++) { const a = 1 + i * NA + j, b = 1 + i * NA + (j + 1) % NA, c = a + NA, d = b + NA; gi.push(a, b, c, b, d, c); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3)); geo.setIndex(gi);
  geo.boundingSphere = new THREE.Sphere(new V3(), 1e5);
  const common = { tMap: { value: mapTex }, tRip: { value: tRip }, tCaus: { value: tCaus }, uBox: { value: new THREE.Vector4(MAP.x0, MAP.z0, MAP.size, 0) },
    uImp: { value: Array.from({ length: 6 }, () => new THREE.Vector4()) }, uPosts: { value: postUniforms() },
    uPostBox: { value: postBox() }, uEv: { value: EVU }, uEvK: { value: EVK }, uCross: { value: CROSS }, uWx: { value: WX } };
  const VS = LAKE_GLSL + /* glsl */`
    float lakeH(vec2 xz){ vec4 m = mapAt(xz); return evField(xz, uTime).x*smoothstep(.3, 2.5, m.r)*smoothstep(-1., 1.5, m.g); }
    void main(){ float r = position.x > 0. ? .25*pow(36000., position.x) : 0.; vec2 xz = cameraPosition.xz + r*vec2(cos(position.z), sin(position.z));
      float h = r < 1500. ? lakeH(xz) : 0.; vH = h; vW = vec3(xz.x, h, xz.y); gl_Position = projectionMatrix*viewMatrix*vec4(vW, 1.); }`;
  // ---- pass A: multiply the already-rendered bed by the water's transmittance
  lakeMatA = K.shaderMat({ uniforms: common, transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor,
    vertexShader: VS, fragmentShader: LAKE_GLSL + /* glsl */`
    void main(){ vec3 toC = cameraPosition - vW; float dist = length(toC); vec3 V = toC/dist;
      vec4 M = mapAt(vW.xz); float dep = max(M.r, 0.);
      float foam = 0., dark = 0.; vec2 g = vec2(0.); vec3 glow = vec3(0.); disturb(vW.xz, uTime, g, foam); evLook(vW.xz, uTime, foam, dark, glow);
      float cosT = sqrt(1. - (1. - V.y*V.y)/1.7689), sunT = sqrt(1. - (1. - uSunDir.y*uSunDir.y)/1.7689);
      vec3 Tb = exp(-vec3(.36, .075, .062)*dep*(1./cosT + 1./sunT)*1.15);
      float F = .02 + .98*pow(1. - max(V.y, 0.), 5.);
      float shore = smoothstep(.0, .5, dep);
      float fa = kFogAmt(vW);
      gl_FragColor = vec4(mix(vec3(1.), Tb*(1. - F)*(1. - min(foam, 1.))*(1. - dark), shore)*(1. - fa), 1.); }` });
  // ---- pass B: everything the water itself sends to the eye
  lakeMatB = K.shaderMat({ uniforms: Object.assign({}, common, { tRefl: { value: null }, uRM: { value: texM }, uRefl: { value: 0 }, uSkyTop: { value: new THREE.Color() }, uSkyHor: { value: new THREE.Color() } }),
    transparent: true, depthWrite: true, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    vertexShader: VS, fragmentShader: LAKE_GLSL + /* glsl */`
    uniform sampler2D tRefl; uniform mat4 uRM; uniform float uRefl; uniform vec3 uSkyTop, uSkyHor;
    vec3 skyC(vec3 d){ float h = max(d.y, 0.); vec3 c = mix(uSkyHor, uSkyTop, pow(h, .5))*1.15; return mix(c, kFogColor(d), pow(1. - h, 10.)); }
    void main(){ vec3 toC = cameraPosition - vW; float dist = length(toC); vec3 V = toC/dist; float t = uTime;
      vec4 M = mapAt(vW.xz); float dep = max(M.r, 0.), pd = M.g;
      float shelter = smoothstep(2., 18., pd) * .6 + .4;
      float calm; vec2 g = waves(vW.xz, dist, t, smoothstep(3., 25., pd), calm);
      float rain = uWx.x, storm = uEnv.x, dusk = uEnv.z;
      g *= (1. - .8*uWx.y) * (1. + rain*.9 + storm*.5);   // the opening: mirror-calm; rain and storm: ruffled
      calm *= 1. - .85*uWx.y;
      g += evField(vW.xz, t).yz*smoothstep(.3, 2.5, dep)*smoothstep(-1., 1.5, pd);
      g += rainRings(vW.xz, t, dist)*rain;
      float foam = 0., dark = 0.; vec3 glow = vec3(0.); disturb(vW.xz, t, g, foam); evLook(vW.xz, t, foam, dark, glow);
      // wakes / foam lines round every pillar foot, drawn downwind
      vec2 wd = uWind.xy; float nf = texture2D(uNoiseTex, vW.xz*.035 + vec2(t*.013, -t*.009)).r;
      float pdUp = mapAt(vW.xz - wd*7.).g;
      float inside = smoothstep(-.6, -2.5, pd); float edge = smoothstep(1.4, .0, pd + (nf - .5)*1.6)*(1. - inside);
      float wake = smoothstep(3., .6, pdUp)*smoothstep(.6, 3., pd)*smoothstep(.62, .82, texture2D(uNoiseTex, vec2(dot(vW.xz, vec2(-wd.y, wd.x))*.035, dot(vW.xz, wd)*.008 - t*.02)).a);
      float lace = smoothstep(.75, .95, texture2D(tCaus, vW.xz*.03 + t*.004).r)*smoothstep(3., .8, pd)*nf;
      float shoreF = smoothstep(.55, .05, dep + (nf - .5)*.5)*step(.0, M.r + .2)*(1. - inside);
      foam = max(foam, max(edge*.85, max(wake*.35, max(lace*.3, shoreF*.8))));
      if(length(vW.xz - uPostBox.xy) < uPostBox.z){ vec2 wq = vec2(-wd.y, wd.x);
        for(int i=0;i<40;i++){ vec3 po = uPosts[i]; if(po.z <= 0.) continue; vec2 d = vW.xz - po.xy; float r = length(d) - po.z;
          float along = dot(d, wd), across = dot(d, wq);
          float ring = smoothstep(.32, .04, r + (nf - .5)*.25);
          float wk = step(0., along)*exp(-along/2.5)*smoothstep(.12 + along*.16, .0, abs(across))*smoothstep(.3, .7, nf + .2);
          foam = max(foam, max(ring*.8, wk*.6)); g += normalize(d + 1e-4)*sin(r*9. - t*5.)*exp(-r*1.5)*.25; } }
      // storm: wind streaks and small whitecaps
      if(storm > .02){ vec2 wq = vec2(-wd.y, wd.x);
        float st = smoothstep(.62, .8, texture2D(uNoiseTex, vec2(dot(vW.xz, wq)*.05, dot(vW.xz, wd)*.004 - t*.05)).a);
        float wc = smoothstep(.78, .92, texture2D(uNoiseTex, vW.xz*.045 - wd*t*.12).r*.7 + texture2D(uNoiseTex, vW.xz*.13 - wd*t*.3).a*.45)*smoothstep(4., 15., dep);
        foam = max(foam, (st*.22 + wc*.8)*storm*uWind.z); }
      foam = clamp(foam, 0., 1.);
      vec3 N = normalize(vec3(-g.x*.42, 1., -g.y*.42));
      float NdV = max(dot(N, V), 0.); float F = .02 + .98*pow(1. - NdV, 5.);
      vec3 Rd = reflect(-V, N);
      vec3 refl = skyC(Rd);
      if(uRefl > .5){ vec4 rc = uRM*vec4(vW, 1.); vec2 ruv = rc.xy/rc.w + N.xz*.035*min(1., 25./dist + .15)*(1. + rain*1.5);
        vec3 rr = texture2D(tRefl, clamp(ruv, .001, .999)).rgb; refl = rr; }
      // sun glitter: a hot core plus sparkles on ripple facets
      vec3 H = normalize(uSunDir + V); float nh = max(dot(N, H), 0.);
      vec3 spec = uSunCol*(pow(nh, 1400.)*90. + pow(nh, 160.)*1.2)*(.35 + .65*(1. - calm*.6));
      // golden hour: a wide glitter path of sparkles toward the low sun
      float spk = smoothstep(.55, .9, texture2D(tRip, vW.xz*.6 + t*vec2(.21, -.17)).b);
      spec += uSunCol*pow(nh, 45.)*(.08 + 1.4*spk)*dusk*(1. - storm);
      spec *= 1. - storm*.7;
      // body colour: light scattered inside the water column, saturated turquoise
      float cosT = sqrt(1. - (1. - V.y*V.y)/1.7689), sunT = sqrt(1. - (1. - uSunDir.y*uSunDir.y)/1.7689);
      vec3 sig = vec3(.36, .075, .062);
      vec3 Tv = exp(-sig*dep*(1./cosT + 1./sunT)*1.15);
      vec3 E = uSunCol*max(uSunDir.y, 0.)*.30 + uSkyCol*.85;
      vec3 scat = mix(vec3(.10, .55, .50), vec3(.02, .26, .30), smoothstep(1.5, 16., dep));
      scat = mix(scat, vec3(.05, .12, .15), storm*.75);                      // steel under the storm
      vec3 body = scat*E*(1. - Tv)*.5*(1. - dark*.85);
      // caustics dancing on the shallow bed (light only; the bed colour itself comes through pass A)
      vec2 cp = vW.xz + V.xz*dep*.4;
      cp += (texture2D(tRip, cp*.045 + t*.006).rg - .5)*4.5 + (texture2D(uNoiseTex, cp*.02).ra - .5)*6.;   // organic warp: no tiling grid
      float ca = texture2D(tCaus, cp*.27 + vec2(t*.031, t*.019) + g*.03).r * .6 + texture2D(tCaus, cp*.19 - vec2(t*.027, -t*.033)).g * .6;
      ca = pow(smoothstep(.15, 1.1, ca), 1.6)*1.5*smoothstep(260., 40., dist)*(.55 + .9*texture2D(uNoiseTex, cp*.013 + t*.002).r) + .1;
      vec3 caus = uSunCol*.30*ca*Tv*smoothstep(9., .2, dep)*max(uSunDir.y, 0.);
      float shore = smoothstep(.0, .5, dep);
      vec3 fc = vec3(.92, .96, 1.)*(uSunCol*(.45 + .55*max(uSunDir.y, 0.))*.32 + uSkyCol*.9);
      vec3 col = ((body + caus*(1. - dark))*(1. - F) + refl*F + spec*(1. - foam))*(1. - foam) + fc*foam;
      col += glow*(1. - F*.5)*(1. - foam*.5);
      col *= shore;
      col += fc*shoreF*.0;
      float fa = kFogAmt(vW);
      gl_FragColor = vec4(col*(1. - fa) + kFogColor(-V)*fa, 1.); }` });
  lakeA = new THREE.Mesh(geo, lakeMatA); lakeA.renderOrder = -20; lakeA.frustumCulled = false;
  lakeA.onBeforeRender = (renderer, scene, camera) => { if (camera === K.camera && crossDone !== frameNo) { crossDone = frameNo; findCrossings(); } };
  lakeB = new THREE.Mesh(geo, lakeMatB); lakeB.renderOrder = -19; lakeB.frustumCulled = false;
  K.scene.add(lakeA, lakeB); hideInRefl.push(lakeA, lakeB);
  // reflection target + mirrored camera
  rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
  water.reflection = rt.texture; water._rt = rt; lakeMatB.uniforms.tRefl.value = rt.texture;
  rcam = new THREE.PerspectiveCamera(); rcam.layers.set(0);
  lakeB.onBeforeRender = (renderer, scene, camera) => { if (reflDone !== frameNo && camera === K.camera) { reflDone = frameNo; renderReflection(renderer, camera); } };
}
const _rot = new THREE.Matrix4(), _look = new V3(), _pl = new THREE.Plane(), _cp = new THREE.Vector4(), _q = new THREE.Vector4(), _sz = new THREE.Vector2();
// What the mirror leaves out to stay cheap: props smaller than REFL.minR metres and anything wholly under the lake.
// Built once, lazily, at the first reflection (every module has initialised by then).
const REFL = { div: 3, far: 3000, minR: 8, maxPer: 200, maxInst: 1e5, thin: .15 };
let reflCull = null, reflThin = [], rockProxy = null; const _bs = new THREE.Sphere(), _hp = new V3();
function buildCull() {
  reflCull = [];
  K.scene.traverse(o => { if (o.isInstancedMesh) o.capacity0 = o.instanceMatrix.count; });
  K.scene.traverse(o => {
    if (!(o.isMesh || o.isPoints || o.isLine) || !o.visible || hideInRefl.includes(o) || !o.geometry || o === rockProxy) return;
    // the pillars' full-detail rock (25_rock: meshes named rock_*, materials keyed rock*) is replaced by rockProxy in the mirror
    const key = o.material && o.material.customProgramCacheKey ? String(o.material.customProgramCacheKey()) : '';
    if (rockProxy && ((o.name || '').startsWith('rock_') || /^rock/.test(key))) { reflCull.push(o); return; }
    // lanterns, windows, glows: always mirrored (the dusk lake is full of their reflections)
    if (/glow|lantern|lamp|window/i.test(key + ' ' + (o.name || '')) || (o.material && o.material.emissive && o.material.emissive.getHex && o.material.emissive.getHex() !== 0 && (o.material.emissiveIntensity || 1) > .3)) return;
    if (/^flora/.test(key) && o.isInstancedMesh) { const g = o.geometry, per = (g.index ? g.index.count : g.attributes.position.count) / 3;
      if (per > REFL.maxPer || /Wood/.test(key)) { reflCull.push(o); return; }   // 40_flora's branches: not resolvable in the mirror
      reflThin.push(o); return; }                                                   // its leaf cards: mirror a fraction of the instances
    if (o.isInstancedMesh) { const g = o.geometry, per = (g.index ? g.index.count : g.attributes.position.count) / 3;
      // dense instanced detail (branches, twigs, tiles): millions of triangles that the rippled mirror cannot resolve
      // other dense instanced detail: millions of triangles the rippled mirror cannot resolve -> left out
      if (per > REFL.maxPer && per * o.capacity0 > REFL.maxInst) { reflCull.push(o); return; }
      if (o.frustumCulled === false) return;
      if (!o.boundingSphere) o.computeBoundingSphere(); _bs.copy(o.boundingSphere); }
    else { const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); if (!g.boundingSphere) return; _bs.copy(g.boundingSphere); }
    if (!(_bs.radius >= 0)) return;
    _bs.applyMatrix4(o.matrixWorld);
    if (o.frustumCulled === false) return;
    if (_bs.radius < REFL.minR || _bs.center.y + _bs.radius < 0) reflCull.push(o);
  });
}
const _vis = [];
// every pillar as a plain surface of revolution of K.world.spireR with a cheap limestone shader (mirror only)
function buildRockProxy() {
  const geos = [];
  for (const s of W.spires) {
    const d = Math.hypot(s.x + 14, s.z - 96), NA = d < 400 ? 72 : 28, NY = d < 400 ? 48 : 14, pos = [], idx = [];
    for (let j = 0; j <= NY; j++) for (let i = 0; i <= NA; i++) { const th = i / NA * TAU, y = -2 + (s.h + 2) * j / NY, r = W.spireR(s, Math.max(0, y), th); pos.push(s.x + Math.cos(th) * r, Math.min(y, s.h), s.z + Math.sin(th) * r); }
    const c = pos.length / 3; pos.push(s.x, s.h, s.z);
    for (let j = 0; j < NY; j++) for (let i = 0; i < NA; i++) { const a = j * (NA + 1) + i, b = a + NA + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    for (let i = 0; i < NA; i++) idx.push(NY * (NA + 1) + i, c, NY * (NA + 1) + i + 1);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); geos.push(g);
  }
  const mat = K.mat({ color: 0xc9b896, roughness: .9, key: 'waterRockProxy',
    frag: /* glsl */`float bed = texture2D(uNoiseTex, vec2(vWPos.x*.004 + vWPos.z*.003, vWPos.y*.06)).r, st = texture2D(uNoiseTex, vec2((vWPos.x + vWPos.z)*.02, vWPos.y*.004)).g;
      diffuseColor.rgb *= (.72 + .45*bed)*(1. - .45*smoothstep(.55, .85, st));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.20,.30,.10), smoothstep(.55, .9, kN.y)*.85);` });
  rockProxy = new THREE.Mesh(K.merge(geos), mat); rockProxy.visible = false; rockProxy.frustumCulled = false; K.scene.add(rockProxy);
}
water._debugReflect = () => { const R = K.renderer; R.info.autoReset = false; R.info.reset(); renderReflection(R, K.camera); const o = { calls: R.info.render.calls, tris: R.info.render.triangles, culled: reflCull ? reflCull.length : 0 }; R.info.autoReset = true; return o; };
function renderReflection(renderer, camera) {
  const cur = renderer.getRenderTarget();
  let w, h; if (cur) { w = cur.width; h = cur.height; } else { renderer.getDrawingBufferSize(_sz); w = _sz.x; h = _sz.y; }
  const dv = K.SHOT ? 2 : (camera.position.y > 40 ? 4 : REFL.div);   // full-quality mirror when frames are captured for the MP4 w = Math.max(2, Math.round(w / dv)); h = Math.max(2, Math.round(h / dv));
  if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
  const cp = camera.position;
  if (cp.y < .05) { lakeMatB.uniforms.uRefl.value = 0; return; }
  // only the part of the frame below the horizon can show the lake: scissor the mirror pass to it
  _rot.extractRotation(camera.matrixWorld); _look.set(0, 0, -1).applyMatrix4(_rot);
  let yTop = 1;
  const fh = Math.hypot(_look.x, _look.z);
  if (fh > 1e-3) { _hp.set(cp.x + _look.x / fh * 1e5, cp.y, cp.z + _look.z / fh * 1e5).project(camera); if (_hp.z < 1) yTop = Math.min(1, _hp.y + .08); }
  if (yTop < -1) { lakeMatB.uniforms.uRefl.value = 0; return; }
  const sh = Math.max(1, Math.min(h, Math.ceil((yTop * .5 + .5) * h)));
  rt.scissor.set(0, 0, w, sh); rt.scissorTest = true;
  if (!reflCull) buildCull();
  _rot.extractRotation(camera.matrixWorld);
  _look.set(0, 0, -1).applyMatrix4(_rot).add(cp); _look.y = -_look.y;
  rcam.position.set(cp.x, -cp.y, cp.z);
  rcam.up.set(0, 1, 0).applyMatrix4(_rot); rcam.up.y = -rcam.up.y;
  rcam.lookAt(_look);
  rcam.fov = camera.fov; rcam.aspect = camera.aspect; rcam.near = camera.near; rcam.far = REFL.far; rcam.updateProjectionMatrix();
  rcam.updateMatrixWorld(); rcam.matrixWorldInverse.copy(rcam.matrixWorld).invert();
  texM.set(.5, 0, 0, .5, 0, .5, 0, .5, 0, 0, .5, .5, 0, 0, 0, 1).multiply(rcam.projectionMatrix).multiply(rcam.matrixWorldInverse);
  // oblique near plane = the water plane (clip everything below y = 0)
  _pl.set(new V3(0, 1, 0), -0.05).applyMatrix4(rcam.matrixWorldInverse);
  _cp.set(_pl.normal.x, _pl.normal.y, _pl.normal.z, _pl.constant);
  const P = rcam.projectionMatrix.elements;
  _q.x = (Math.sign(_cp.x) + P[8]) / P[0]; _q.y = (Math.sign(_cp.y) + P[9]) / P[5]; _q.z = -1; _q.w = (1 + P[10]) / P[14];
  _cp.multiplyScalar(2 / _cp.dot(_q));
  P[2] = _cp.x; P[6] = _cp.y; P[10] = _cp.z + 1; P[14] = _cp.w;
  rcam.projectionMatrixInverse.copy(rcam.projectionMatrix).invert();
  for (const o of hideInRefl) o.visible = false;
  for (let i = 0; i < reflCull.length; i++) { _vis[i] = reflCull[i].visible; reflCull[i].visible = false; }
  if (rockProxy) rockProxy.visible = true;
  for (const o of reflThin) { o.userData._wc = o.count; o.count = Math.ceil(o.count * REFL.thin); }
  const sAU = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
  renderer.setRenderTarget(rt); renderer.state.buffers.depth.setMask(true); renderer.clear();
  renderer.render(K.scene, rcam);
  renderer.shadowMap.autoUpdate = sAU;
  for (const o of hideInRefl) o.visible = true;
  for (let i = 0; i < reflCull.length; i++) reflCull[i].visible = _vis[i];
  if (rockProxy) rockProxy.visible = false;
  for (const o of reflThin) o.count = o.userData._wc;
  renderer.setRenderTarget(cur);
  lakeMatB.uniforms.uRefl.value = 1;
}

// ---------------------------------------------------------------- waterfalls
// rows: [{ at(u) -> V3, tau, s, white, wM, nrm }]  ->  ribbon mesh (u across, rows along the flow)
let fallMat;
function fallMaterial() {
  fallMat = K.shaderMat({ uniforms: { tStreak: { value: tStreak } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */`attribute vec4 aF; attribute vec3 aN; varying vec4 vF; varying vec2 vUv; varying vec3 vW; varying vec3 vN;
      varying float vOp; void main(){ vF = aF; float k = floor(uv.y/1000. + .00001); vUv = vec2(uv.x, uv.y - k*1000.); vOp = clamp(k/100., 0., 1.); vN = aN; vec4 w = modelMatrix*vec4(position, 1.);
        float sway = vUv.y*vUv.y*.00025*(.6 + uWind.z)/(1. + aF.w*.15); w.xz += uWind.xy*sway*(sin(uTime*.7 + vUv.y*.05 + aF.z*9.) + .6);
        vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: /* glsl */`uniform sampler2D tStreak; varying vec4 vF; varying vec2 vUv; varying vec3 vW; varying vec3 vN; varying float vOp;
      void main(){ float t = uTime; float tau = vF.x, white = vF.y, sd = vF.z, wM = vF.w;
        float dist = length(cameraPosition - vW);
        float x = vUv.x*wM/16. + sd;
        float y = tau*1.5 - t*1.5;
        vec4 a = texture2D(tStreak, vec2(x, y*.35));
        vec4 b = texture2D(tStreak, vec2(x*1.7 + .37, y*.55 + .21));
        vec4 c = texture2D(tStreak, vec2(x*.45 + .13, y*.22 + sd));
        // threads + travelling clumps of white water (the blob channel scrolls with the flow)
        float st = a.r*.5 + b.g*.4 + a.a*.45*(.4 + white) + (c.b - .5)*.5;
        float fw = clamp(fwidth(x)*28. - .3, 0., 1.);
        st = mix(st, .45 + (c.r - .5)*1.4 + (c.b - .5)*.9 + white*.15, fw);
        float clumps = smoothstep(.35, .7, c.b + white*.35);
        float fray = (c.r - .5)*.5;
        float edge = smoothstep(0., .2 + fray*.25, vUv.x + fray*.1)*smoothstep(1., .8 - fray*.25, vUv.x - fray*.1);
        float topFade = smoothstep(0., 1.2, vUv.y);
        float lo = mix(.48, .22, white), hi = lo + .22 + .1*smoothstep(80., 300., dist);
        float dens = smoothstep(lo, hi, st*(.75 + .45*clumps));
        float alpha = clamp(dens*edge*topFade*(.62 + .38*white), 0., 1.)*vOp*(1. - fw*.3);
        if(alpha < .01) discard;
        vec3 V = normalize(cameraPosition - vW); vec3 n = normalize(vN); if(dot(n, V) < 0.) n = -n;
        float sunF = .40 + .60*max(dot(n, uSunDir), 0.); float back = pow(max(dot(-V, uSunDir), 0.), 4.);
        vec3 E = uSunCol*(sunF*.36 + back*.25) + uSkyCol*.95;
        vec3 glass = mix(vec3(.26, .56, .55), vec3(.95, .98, 1.), smoothstep(.05, .6, white + a.a*.35 + clumps*.2));
        vec3 col = glass*E*(.62 + .5*a.a*clumps + .18*b.g);
        col = kFog(col, vW);
        gl_FragColor = vec4(col, alpha); }` });
}
function ribbon(rows, NC, seed) {
  const pos = [], uv = [], aF = [], aN = [], idx = [];
  for (let j = 0; j < rows.length; j++) { const r = rows[j];
    for (let i = 0; i <= NC; i++) { const u = i / NC, p = r.at(u); pos.push(p.x, p.y, p.z); uv.push(u, r.s + Math.round((r.op ?? 1) * 100) * 1000); aF.push(r.tau, r.white, seed, r.wM); const n = r.nrm(u); aN.push(n.x, n.y, n.z); } }
  for (let j = 0; j < rows.length - 1; j++) for (let i = 0; i < NC; i++) { const a = j * (NC + 1) + i, b = a + NC + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aF', new THREE.Float32BufferAttribute(aF, 4)); g.setAttribute('aN', new THREE.Float32BufferAttribute(aN, 3)); g.setIndex(idx); g.computeBoundingSphere();
  const m = new THREE.Mesh(g, fallMat); m.renderOrder = 2; K.scene.add(m); return m;
}
// a fall down a pillar face: free fall from a lip, breaks wherever the face steps out (ledges, talus), fans out at the foot
function pillarFall(o) {
  const s = o.s, th = o.th, G = 9.81, dt = .01;
  const face = (y, a) => W.spireR(s, Math.max(0, y), a) + (o.gap ?? .45);
  let y = o.y0, r = face(o.y0, th) + .3, vr = o.v0, vy = 0, tau = 0, sArc = 0, contact = false, lastRow = -1;
  const pts = [], impacts = [];
  let white = .05;
  while (y > -1.5 && tau < 30) {
    vy -= G * dt; y += vy * dt; r += vr * dt; tau += dt;
    const f = face(y, th);
    if (r < f) {
      if (!contact && vy < -3.5) { impacts.push({ y, r: f, v: -vy, th }); vy *= .42; vr = 1.2 + .6 * Math.abs(vy) * .1; white = Math.min(1, white + .45); }
      else { vy = Math.max(vy, -(o.slide ?? 7)); vr = Math.max(vr * .98, .4); }
      r = f; contact = true;
    } else contact = false;
    white = Math.min(1, white + dt * (contact ? .5 : .045));
    const sp = Math.hypot(vr, vy); sArc += sp * dt;
    if (sArc - lastRow >= (o.step ?? .7) || y <= -1.4) { lastRow = sArc; pts.push({ y, r, tau, s: sArc, white, contact }); }
  }
  const total = o.y0, rows = [];
  for (const p of pts) {
    const fall = sat((o.y0 - p.y) / total);
    const wM = lerp(o.w0, o.w1, Math.pow(fall, o.fan ?? 2.2));
    const fr0 = face(p.y, th);
    const at = u => { const a = th + (u - .5) * wM / Math.max(p.r, 1); const fa = face(p.y, a); const rr = Math.max(p.r + (fa - fr0) * .85, fa + .15);
      return new V3(s.x + Math.cos(a) * rr, p.y, s.z + Math.sin(a) * rr); };
    const nrm = u => { const a = th + (u - .5) * wM / Math.max(p.r, 1); return new V3(Math.cos(a), .15, Math.sin(a)).normalize(); };
    rows.push({ at, nrm, tau: p.tau, s: p.s, white: Math.min(p.white, o.maxWhite ?? 1), wM, y: p.y, r: p.r, op: o.op ?? 1 });
  }
  const mesh = ribbon(rows, o.nc ?? 14, o.seed ?? 0);
  // a second, thinner sheet slightly outside the first one: depth and braiding
  if (o.layers !== 1) { const rows2 = rows.map(r => ({ ...r, at: u => { const p = r.at(u * .8 + .1); const d = new V3(p.x - s.x, 0, p.z - s.z).normalize(); return p.addScaledVector(d, .55); }, wM: r.wM * .8, tau: r.tau * 1.07 })); ribbon(rows2, o.nc ?? 14, (o.seed ?? 0) + .37); }
  const last = rows[rows.length - 1], foot = new V3(s.x + Math.cos(th) * last.r, 0, s.z + Math.sin(th) * last.r);
  return { rows, impacts, foot, wFoot: last.wM, th, s, mesh };
}

// ---------------------------------------------------------------- spray, mist, splash particles (one instanced draw)
const EMIT = [];   // { p:V3, dir:[dx,dz], w, power, drops, mist, spray }
function particles() {
  const A = [], B = [], C = [], rnd = K.rng(4242);
  for (const e of EMIT) {
    if (blocked(e.p.x, e.p.z, .5) && e.p.y < 3) { e.drops = Math.round((e.drops || 0) * .3); e.mist = Math.round((e.mist || 0) * .5); }   // spray source under a structure: thin it out
    for (let i = 0; i < (e.drops || 0); i++) { A.push(e.p.x, e.p.y, e.p.z, 0); B.push(e.dir[0], e.dir[1], e.w, e.power); C.push(rnd(), rnd(), rnd(), rnd()); }
    for (let i = 0; i < (e.mist || 0); i++) { A.push(e.p.x, e.p.y, e.p.z, 1); B.push(e.dir[0], e.dir[1], e.w, e.mistSize || 1); C.push(rnd(), rnd(), rnd(), rnd()); }
  }
  const add = (kind, slot, n) => { for (let i = 0; i < n; i++) { A.push(0, 0, 0, kind); B.push(slot, 0, 0, 0); C.push(rnd(), rnd(), rnd(), rnd()); } };
  // per splash slot: beads, fingers, column blobs, pour-back, mist, the wave-crest spray that races toward the camera
  for (let slot = 0; slot < 4; slot++) { add(2, slot, 1800); add(6, slot, 300); add(3, slot, 600); add(7, slot, 600); add(4, slot, 230); add(5, slot, 900); }
  for (let slot = 0; slot < 8; slot++) add(8, slot, 80);    // spray round a dragon body piercing the surface
  add(9, 0, 2200); add(10, 0, 70);                          // rain splashes round the camera, rain mist
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-.5, -.5, 0, .5, -.5, 0, .5, .5, 0, -.5, .5, 0], 3)); g.setIndex([0, 1, 2, 0, 2, 3]);
  g.setAttribute('aP', new THREE.InstancedBufferAttribute(new Float32Array(A), 4)); g.setAttribute('aD', new THREE.InstancedBufferAttribute(new Float32Array(B), 4)); g.setAttribute('aR', new THREE.InstancedBufferAttribute(new Float32Array(C), 4));
  g.instanceCount = A.length / 4;
  const m = K.shaderMat({ uniforms: { uEv: { value: EVU }, uEvK: { value: EVK }, uCross: { value: CROSS }, uWx: { value: WX } }, transparent: true, depthWrite: false,
    vertexShader: /* glsl */`attribute vec4 aP, aD, aR; uniform vec4 uEv[4]; uniform vec4 uEvK[4]; uniform vec4 uCross[8]; uniform vec4 uWx;
      varying vec2 vQ; varying float vA; varying float vK; varying vec3 vWP; varying float vS;
      void main(){ float kind = aP.w, t = uTime; vec3 pos = aP.xyz; vec3 vel = vec3(0., 1., 0.); float size = 0., alpha = 0., stretch = 1.;
        vec2 dir = aD.xy, tg = vec2(-dir.y, dir.x); vec3 D = vec3(dir.x, 0., dir.y), Tg = vec3(tg.x, 0., tg.y), Wd = vec3(uWind.x, 0., uWind.y);
        if(kind < .5){ // spray droplets thrown off the rock / the foot
          float L = 1.0 + aR.x*1.3, age = fract(t/L + aR.y)*L;
          vec3 p0 = pos + Tg*(aR.z - .5)*aD.z;
          vec3 v0 = D*(1. + aR.w*5.5)*aD.w + vec3(0., (1.5 + aR.x*6.)*aD.w, 0.) + Tg*(fract(aR.y*7.3) - .5)*5.*aD.w;
          pos = p0 + v0*age + vec3(0., -4.6, 0.)*age*age + Wd*age*.8; vel = v0 + vec3(0., -9.2, 0.)*age;
          size = (.05 + .16*fract(aR.z*13.1))*(.7 + .5*aD.w); stretch = 1.5 + length(vel)*.2;
          alpha = .85*smoothstep(0., .08, age)*smoothstep(L, L*.6, age)*step(-.1, pos.y);
        } else if(kind < 1.5){ // mist rising and drifting from the foot
          float L = 7. + aR.x*6., age = fract(t/L + aR.y)*L, u = age/L;
          vec3 p0 = pos + Tg*(aR.z - .5)*aD.z*1.2 + D*(aR.w - .2)*aD.z*.5;
          pos = p0 + D*age*(.6 + aR.w*1.4) + Wd*age*(.6 + uWind.z*3.) + vec3(0., age*(.35 + aR.x*.9) + 1.5*aD.w, 0.);
          size = (3. + 9.*sqrt(u))*aD.w*(.7 + .6*aR.z);
          alpha = .26*smoothstep(0., .18, u)*smoothstep(1., .45, u);
        } else if(kind < 7.5){ // splash events, slot = aD.x
          int sl = int(aD.x + .5); vec4 ev = uEv[sl], ek = uEvK[sl];
          float S = ev.w, age0 = t - ev.z, e = ek.x; vec3 c0 = vec3(ev.x, 0., ev.y);
          if(S > 0. && age0 > 0. && age0 < 30.){ float sS = sqrt(S); float a = aR.y*6.2832; vec3 rd = vec3(cos(a), 0., sin(a));
            if(kind < 2.5){ // beads off the crown
              float age = age0 - aR.x*.45; vec3 v0 = rd*(2.5 + 9.*aR.w*aR.w)*sS + vec3(0., (6. + 12.*aR.z)*sS*(1. + .25*e), 0.);
              pos = c0 + rd*S*(2. + 2.5*aR.z) + v0*age + vec3(0., -4.9, 0.)*age*age + Wd*age*.6; vel = v0 + vec3(0., -9.8, 0.)*age;
              size = (.035 + .16*aR.w*aR.w)*sS; stretch = 1.2 + length(vel)*.07; alpha = .85*step(0., age)*step(-.2, pos.y);
            } else if(kind < 3.5){ // the column: blobs thrown straight up (a jet after the cavity closes when entering)
              float age = age0 - e*.55 - aR.x*.7; vec3 v0 = rd*(.4 + 1.8*aR.w)*sS + vec3(0., (11. + 21.*aR.z)*sS*(1. + .1*e), 0.);
              pos = c0 + rd*aR.w*S*1.3 + v0*age + vec3(0., -4.9, 0.)*age*age + Wd*age*.8; vel = v0 + vec3(0., -9.8, 0.)*age;
              size = (.15 + .55*aR.w*aR.w)*sS; stretch = 1.15 + length(vel)*.035; alpha = .6*step(0., age)*step(-.2, pos.y);
            } else if(kind < 4.5){ // spray cloud: low and wide, plus mist torn off the top of the column
              float hi = step(.68, aR.z); float age = age0 - .3 - aR.x*1.5 - hi*(.8 + e*.5), L = 11.; float u = age/L;
              pos = c0 + rd*S*(2. + 6.*aR.w)*(.4 + sqrt(max(u, 0.))) + vec3(0., 1. + hi*(14. + 30.*aR.w)*S/1.7 + age*(.6 + aR.z)*sS, 0.) + Wd*age*1.5;
              size = S*(6. + 12.*sqrt(max(u, 0.)))*(1. - .4*hi); alpha = .24*step(0., age)*smoothstep(0., .08, u)*smoothstep(1., .35, u);
            } else if(kind < 5.5){ // spray riding the wave crest, concentrated toward the camera (it washes past the lens)
              float c = 32.*sqrt(S/1.7)*(1. + .12*e), R = c*age0; float A = 2.4*S/(1. + R/22.)*exp(-age0*.10);
              float ac = atan(cameraPosition.z - ev.y, cameraPosition.x - ev.x) + (aR.y - .5)*1.5; vec3 rc = vec3(cos(ac), 0., sin(ac));
              float L = .55 + .45*aR.x, la = fract(t/L + aR.z)*L; float up = (2.5 + 6.*aR.w)*sqrt(A/2.4);
              pos = c0 + rc*(R + (aR.w - .5)*4. + c*la*.3) + vec3(0., A*.85 + up*la - 4.9*la*la, 0.); vel = rc*c*.3 + vec3(0., up - 9.8*la, 0.);
              size = (.03 + .16*aR.w*aR.w)*(.6 + .4*A); stretch = 1.2 + length(vel)*.05;
              alpha = .85*smoothstep(.25, 1.1, A)*step(-.1, pos.y)*smoothstep(.1, .35, age0)*smoothstep(160., 90., R);
            } else if(kind < 6.5){ // fingers: long jets thrown up and out from the crown rim
              float age = age0 - aR.x*.3; vec3 v0 = rd*(3. + 5.*aR.w)*sS + vec3(0., (12. + 12.*aR.z)*sS*(1. + .2*e), 0.);
              pos = c0 + rd*S*(2.6 + 2.*aR.z) + v0*age + vec3(0., -4.9, 0.)*age*age + Wd*age*.5; vel = v0 + vec3(0., -9.8, 0.)*age;
              size = (.12 + .22*aR.w)*sS; stretch = 1.3 + length(vel)*.12; alpha = .65*step(0., age)*step(-.2, pos.y);
            } else { // pour-back: water falling out of the column in streaks
              float tr = e*.55 + 1. + aR.x*2.8, age = age0 - tr; float y0 = (8. + 42.*aR.z)*S/1.7*(1. + .25*e);
              vec3 v0 = rd*(.8 + 3.*aR.w)*sS + vec3(0., -1. - 2.*aR.w, 0.);
              pos = c0 + rd*S*(.8 + 2.*aR.w) + vec3(0., y0, 0.) + v0*age + vec3(0., -4.9, 0.)*age*age + Wd*age; vel = v0 + vec3(0., -9.8, 0.)*age;
              size = (.08 + .22*aR.w)*sS; stretch = 1.3 + length(vel)*.1; alpha = .55*step(0., age)*step(-.2, pos.y);
            }
          }
        } else if(kind < 8.5){ // spray round a dragon body crossing the surface
          vec4 cr = uCross[int(aD.x + .5)];
          if(cr.w > 0.){ float L = .7 + .6*aR.x, age = fract(t/L + aR.y)*L; float a = aR.z*6.2832; vec3 rd = vec3(cos(a), 0., sin(a));
            vec3 v0 = rd*(1. + 4.*aR.w)*(.6 + cr.w) + vec3(0., (2. + 7.*aR.w)*(.5 + cr.w), 0.);
            pos = vec3(cr.x, 0., cr.y) + rd*(cr.z + .4) + v0*age + vec3(0., -4.9, 0.)*age*age; vel = v0 + vec3(0., -9.8, 0.)*age;
            size = (.08 + .35*aR.w*aR.w)*(.7 + .5*cr.w); stretch = 1.4 + length(vel)*.15; alpha = .85*cr.w*step(-.1, pos.y)*smoothstep(L, L*.7, age); }
        } else if(kind < 9.5){ // rain splashes: tiny crowns on a 26 m tile that follows the camera (world-fixed positions)
          float Lt = 26., P = .3 + .3*aR.z, age = fract(t/P + aR.w)*P;
          vec2 b = aR.xy*Lt, q = cameraPosition.xz + (fract((b - cameraPosition.xz)/Lt) - .5)*Lt;
          float a = fract(aR.w*13.7)*6.2832; vec3 v0 = vec3(cos(a)*.5, 1.3 + aR.z*1.2, sin(a)*.5);
          pos = vec3(q.x, 0., q.y) + v0*age + vec3(0., -4.9, 0.)*age*age; vel = v0 + vec3(0., -9.8, 0.)*age;
          size = .035; stretch = 2.5; alpha = .75*uWx.x*step(0., pos.y)*step(cameraPosition.y, 30.);
        } else { // rain mist lifting off the lake
          float Lt = 170.; vec2 b = aR.xy*Lt, q = cameraPosition.xz + (fract((b + Wd.xz*t*1.5 - cameraPosition.xz)/Lt) - .5)*Lt;
          pos = vec3(q.x, 1.5 + 5.*aR.z + sin(t*.3 + aR.w*6.)*.8, q.y); size = 20. + 20.*aR.w; alpha = .09*uWx.x;
        }
        vK = kind; vA = alpha; vQ = position.xy; vWP = pos; vS = aR.z*7.1 + aR.w;
        vec4 mv = viewMatrix*vec4(pos, 1.);
        vec3 vv = mat3(viewMatrix)*vel; vec2 ax = length(vv.xy) > 1e-4 ? normalize(vv.xy) : vec2(0., 1.); if(kind > .5 && kind < 1.5 || kind > 3.5 && kind < 4.5 || kind > 9.5){ ax = vec2(0., 1.); stretch = 1.; }
        vec2 px = vec2(ax.y, -ax.x);
        float dcam = -mv.z; alpha *= smoothstep(1.5, 6., dcam);
        if(alpha < .003) size = 0.;
        mv.xy += px*position.x*size + ax*position.y*size*stretch;
        gl_Position = projectionMatrix*mv; }`,
    fragmentShader: /* glsl */`varying vec2 vQ; varying float vA; varying float vK; varying vec3 vWP; varying float vS;
      vec3 hue(float h){ return clamp(abs(fract(h + vec3(0., 2./3., 1./3.))*6. - 3.) - 1., 0., 1.); }
      void main(){ float r = length(vQ)*2.; if(r > 1.) discard;
        bool puff = (vK > .5 && vK < 1.5) || (vK > 3.5 && vK < 4.5) || vK > 9.5;
        float shape;
        if(puff){ float n = texture2D(uNoiseTex, vQ*.45 + vec2(vS, vS*.7) + uTime*.006).r*.65 + texture2D(uNoiseTex, vQ*1.3 + vec2(vS*.3, vS) - uTime*.01).a*.35; shape = smoothstep(1., .0, r)*smoothstep(.3, .8, n + (1. - r)*.3); }
        else shape = smoothstep(1., .2, r);
        float a = vA*shape; if(a < .004) discard;
        vec3 rd = normalize(vWP - cameraPosition); float cs = dot(rd, uSunDir);
        float phase = .55 + 1.6*pow(max(cs, 0.), 6.) + .25*max(-cs, 0.);
        vec3 col = uSunCol*phase*.30 + uSkyCol*.95;
        // rainbow: 40.6° (violet) .. 42.4° (red) from the antisolar point
        float ang = degrees(acos(clamp(dot(rd, -uSunDir), -1., 1.)));
        float x = (ang - 40.3)/2.4;
        vec3 bow = hue((1. - clamp(x, 0., 1.))*.78)*smoothstep(-.1, .12, x)*smoothstep(1.12, .9, x);
        col += bow*uSunCol*(puff ? (vK > 9.5 ? .0 : .55) : .06);
        col = kFog(col, vWP);
        gl_FragColor = vec4(col, a); }` });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 6; K.scene.add(mesh); hideInRefl.push(mesh);
  return mesh;
}

// ---------------------------------------------------------------- travertine pools on the talus beside the main fall
function travertine(s, th0) {
  // Huanglong-style rimstone terraces: scalloped pools stepping down the talus into the lake;
  // a thin film of water slides over every outer lip as a wide translucent curtain.
  const tiers = [{ y: 6.2, rP: 4.2 }, { y: 4.4, rP: 5.0 }, { y: 2.7, rP: 4.6 }, { y: 1.15, rP: 5.6 }, { y: .25, rP: 3.6 }];
  const rockG = [], waterG = [], rnd = K.rng(919);
  const centres = [];
  tiers.forEach((tr, k) => {
    const a = th0 + Math.sin(k * 1.9) * .05, fr = W.spireR(s, tr.y, a);
    const R0 = fr + tr.rP * .75 + (k ? 0 : -.5);
    centres.push({ x: s.x + Math.cos(a) * R0, z: s.z + Math.sin(a) * R0, a });
  });
  tiers.forEach((tr, k) => {
    const { x: cx, z: cz, a } = centres[k], out = new V3(Math.cos(a), 0, Math.sin(a));
    const nextY = k < tiers.length - 1 ? tiers[k + 1].y : -1.2, drop = tr.y - nextY;
    const ph = rnd() * 6, rim = ang => tr.rP * (1 + .13 * Math.sin(ang * 3 + ph) + .07 * Math.sin(ang * 7 + 2 * ph) + .03 * Math.sin(ang * 17 + ph));
    // rock: lip -> bulging drapery wall -> down into the next pool / under the lake
    const NA = 160, prof = [[-.04, .02], [.04, .07], [.11, .09], [.18, .04], [.3, -.14], [.55, -drop * .3], [.95, -drop * .66], [1.45, -drop - .2], [1.6, -drop - 4]];
    const pos = [], uv = [], idx = [], P = prof.length;
    for (let i = 0; i <= NA; i++) { const ang = i / NA * TAU, rr0 = rim(ang);
      for (let j = 0; j < P; j++) { const drape = j >= 4 ? (.16 * Math.sin(ang * rr0 * 6.5 + ph) + .08 * Math.sin(ang * rr0 * 15 + 2.1 * ph) + .05 * Math.sin(ang * rr0 * 31)) * Math.min(1, (j - 3) / 3) : 0; const rr = rr0 + prof[j][0] + drape;
        pos.push(cx + Math.cos(ang) * rr, tr.y + prof[j][1], cz + Math.sin(ang) * rr); uv.push(i / NA, j / (P - 1)); } }
    for (let i = 0; i < NA; i++) for (let j = 0; j < P - 1; j++) { const a0 = i * P + j, b0 = a0 + P; idx.push(a0, a0 + 1, b0, b0, a0 + 1, b0 + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); rockG.push(g);
    // pool water: radial uv.x (0 centre .. 1 rim) for the shallow-edge colour
    const wg = new THREE.CircleGeometry(1, 64, 0, TAU).rotateX(-Math.PI / 2); const wp = wg.attributes.position, wl = new Float32Array(wp.count);
    for (let i = 0; i < wp.count; i++) { const x = wp.getX(i), z = wp.getZ(i), ang = Math.atan2(z, x), l = Math.hypot(x, z), rr = rim(ang) + .02;
      wp.setXYZ(i, cx + Math.cos(ang) * l * rr, tr.y + .035, cz + Math.sin(ang) * l * rr); wl[i] = l; }
    wg.setAttribute('aL', new THREE.BufferAttribute(wl, 1)); wg.deleteAttribute('uv'); wg.deleteAttribute('normal'); wg.computeVertexNormals(); waterG.push(wg);
    // the overflow film: rows go down the drop, columns run along the outer arc
    const arcs = [[-1.05 + rnd() * .3, -.15 - rnd() * .2], [.15 + rnd() * .2, 1.0 + rnd() * .3]];
    if (k === tiers.length - 1) arcs.splice(0, 2, [-1.2, 1.2]);
    for (const [a0, a1] of arcs) {
      const rows = [], N = 9, arc = (a1 - a0) * tr.rP;
      for (let j = 0; j <= N; j++) { const f = j / N, yy = tr.y + .1 - (drop + .4) * f;
        const dy = yy - tr.y; let wo = prof[0][0]; for (let q = 0; q < P - 1; q++) if (dy <= prof[q][1] && dy >= prof[q + 1][1]) { const ff = (dy - prof[q][1]) / (prof[q + 1][1] - prof[q][1]); wo = lerp(prof[q][0], prof[q + 1][0], ff); break; }
        if (dy > prof[0][1]) wo = .1;
        rows.push({ at: u => { const ang = a + a0 + (a1 - a0) * u, rr0 = rim(ang), d = j > 3 ? (.16 * Math.sin(ang * rr0 * 6.5 + ph) + .08 * Math.sin(ang * rr0 * 15 + 2.1 * ph)) : 0, rr = rr0 + Math.max(wo, .1) + d + .09; return new V3(cx + Math.cos(ang) * rr, yy, cz + Math.sin(ang) * rr); },
          nrm: u => { const ang = a + a0 + (a1 - a0) * u; return new V3(Math.cos(ang), .3, Math.sin(ang)).normalize(); }, tau: Math.sqrt(2 * Math.max(0, drop * f) / 9.81) * 2.5 + .2, s: drop * f, white: .08 + .4 * f * f, wM: arc, op: .6 }); }
      ribbon(rows, Math.max(6, Math.round(arc * 2)), .21 + k * .13 + a0);
      const am = a + (a0 + a1) * .5; EMIT.push({ p: new V3(cx + Math.cos(am) * (tr.rP + .9), Math.max(nextY, 0) + .15, cz + Math.sin(am) * (tr.rP + .9)), dir: [Math.cos(am), Math.sin(am)], w: arc * .8, power: .22, drops: 18 });
    }
  });
  const mat = K.mat({ color: 0xe8dcc0, roughness: .62, key: 'travertine', side: THREE.DoubleSide,
    frag: /* glsl */`float n1 = texture2D(uNoiseTex, vWPos.xz*.17 + vWPos.y*.05).r, n2 = texture2D(uNoiseTex, vec2(atan(vWPos.z, vWPos.x)*14., vWPos.y*.7)).a, n3 = texture2D(uNoiseTex, vWPos.xz*1.3 + vWPos.y*.6).a;
      float bands = .5 + .5*sin(vWPos.y*14. + n1*7.);
      float wall = smoothstep(.25, -.4, kN.y);
      vec3 cream = vec3(1.,.86,.62), ochre = vec3(.86,.58,.28), algae = vec3(.58,.55,.20);
      vec3 c = mix(cream, ochre, smoothstep(.35, .8, n1)*.6 + wall*.25);
      c = mix(c, algae, smoothstep(.6, .85, n2)*wall*.5);
      c *= .82 + .22*bands*wall + .14*n3;
      float wet = wall*.8 + smoothstep(.3, .0, vWPos.y - floor(vWPos.y))*0.;
      diffuseColor.rgb = c*(1. - wet*.32);
      roughnessFactor = mix(.8, .18, wet);
      normal = kBump(-vViewPosition, normal, bands*.5*wall + n2*.9 + n3*.6, .045);` });
  const rm = new THREE.Mesh(K.merge(rockG), mat); rm.castShadow = rm.receiveShadow = true; K.scene.add(rm);
  const wmat = K.mat({ color: 0x5fd8cc, roughness: .03, metalness: 0, envMapIntensity: 1.3, key: 'poolwater',
    frag: /* glsl */`vec2 g = texture2D(tRipP, vWPos.xz*.21 + uTime*vec2(.03,.017)).rg - .5; g += texture2D(tRipP, vWPos.xz*.6 - uTime*vec2(.05,.02)).rg - .5;
      normal = normalize(normal + (viewMatrix*vec4(g.x*.35, 0., g.y*.35, 0.)).xyz);
      float l = vL; float n = texture2D(uNoiseTex, vWPos.xz*.25).r;
      diffuseColor.rgb = mix(vec3(.03,.32,.38), vec3(.38,.74,.62), smoothstep(.4, 1., l + (n - .5)*.3));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.85,.85,.75), smoothstep(.93, 1., l)*.6);`,
    fragPars: 'uniform sampler2D tRipP; varying float vL;', vertPars: 'attribute float aL; varying float vL;', vert: 'vL = aL;', uniforms: { tRipP: { value: tRip } } });
 const wm = new THREE.Mesh(K.merge(waterG), wmat); wm.receiveShadow = true; K.scene.add(wm);
}

// ---------------------------------------------------------------- mossy boulders (stepped cascade)
function boulders(list) {
  const base = new THREE.IcosahedronGeometry(1, 3), p = base.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const n = .78 + .38 * K.noise3(x * 1.4 + 3, y * 1.4, z * 1.4) + .1 * K.noise3(x * 4, y * 4 + 9, z * 4); p.setXYZ(i, x * n, y * n * .72, z * n); }
  base.computeVertexNormals();
  const mat = K.mat({ color: 0x8d877a, roughness: .85, key: 'boulder',
    frag: /* glsl */`float n = texture2D(uNoiseTex, vWPos.xz*.31 + vWPos.y*.17).r, n2 = texture2D(uNoiseTex, vWPos.xy*.9 + vWPos.z*.3).a;
      diffuseColor.rgb *= .7 + .55*n2;
      float moss = smoothstep(.05, .55, kN.y + (n - .5)*.9);
      diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(.16,.30,.07), vec3(.36,.46,.12), n2), moss);
      float wet = smoothstep(2.5, .0, vWPos.y - uWaterY); diffuseColor.rgb *= 1. - wet*.35; roughnessFactor = mix(roughnessFactor, .3, wet*(1.-moss));
      normal = kBump(-vViewPosition, normal, n2*1.4 + n, .06);`, fragPars: 'uniform float uWaterY;', uniforms: { uWaterY: { value: 0 } } });
  const m = new THREE.InstancedMesh(base, mat, list.length), o = new THREE.Object3D();
  list.forEach((b, i) => { o.position.copy(b.p); o.scale.set(b.s * b.sx, b.s, b.s * b.sz); o.rotation.set(b.rx, b.ry, b.rz); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
  m.castShadow = m.receiveShadow = true; K.scene.add(m); return m;
}
function cascade(s, th, yTop, steps, seed) {
  const rnd = K.rng(seed), rocks = []; let y = yTop, a = th;
  for (let k = 0; k < steps; k++) {
    const drop = y / (steps - k) * (.8 + .4 * rnd()), y1 = Math.max(-.5, y - drop);
    const fr = W.spireR(s, Math.max(0, y), a) + 1.2, fr1 = W.spireR(s, Math.max(0, y1), a) + 1.2;
    const lipR = fr + 1.0, footR = Math.max(fr1, lipR + 1.2) + 1.0;
    const c = (r, yy, aa = a) => new V3(s.x + Math.cos(aa) * r, yy, s.z + Math.sin(aa) * r);
    const lip = c(lipR, y), wM = 3 + rnd() * 2.5 + k * .4, rows = [], N = 9;
    const tg = new V3(-Math.sin(a), 0, Math.cos(a)), out = new V3(Math.cos(a), 0, Math.sin(a));
    for (let j = 0; j <= N; j++) { const f = j / N, yy = y - (y - y1) * f, rr = lerp(lipR, footR, Math.sqrt(f)), cc = c(rr, yy);
      rows.push({ at: u => cc.clone().addScaledVector(tg, (u - .5) * wM * (1 + .3 * f)), nrm: () => out.clone().setY(.4).normalize(), tau: Math.sqrt(2 * (y - yy) / 9.81) + k * .6, s: (y - yy) + k * 4, white: .35 + .5 * f, wM: wM * (1 + .3 * f) }); }
    ribbon(rows, 8, seed * .1 + k * .17);
    // boulders framing the lip and the plunge pool
    for (let b = 0; b < 6; b++) { const side = b < 3 ? -1 : 1, off = (wM * .5 + .8 + rnd() * 1.5) * side, yb = b % 3 === 0 ? y - .4 : y1 + rnd() * 1.2;
      const rr = (b % 3 === 0 ? lipR - .6 : footR - .5 + rnd() * 1.5); const p = c(rr, yb).addScaledVector(tg, off);
      rocks.push({ p, s: 1.1 + rnd() * 1.8, sx: 1 + rnd() * .5, sz: 1 + rnd() * .5, rx: rnd() * 3, ry: rnd() * 6, rz: rnd() * 3 }); }
    rocks.push({ p: c(lipR - 1.2, y - 1.0), s: 1.8 + rnd(), sx: 1.6, sz: 1.2, rx: 0, ry: a, rz: 0 });
    EMIT.push({ p: c(footR + .5, Math.max(y1, 0) + .3), dir: [out.x, out.z], w: wM, power: .55, drops: 45, mist: y1 < .5 ? 26 : 6, mistSize: .5 });
    y = y1; a += (rnd() - .5) * .05;
    if (y <= -.4) break;
  }
  boulders(rocks);
  return c => c;
}

// ---------------------------------------------------------------- cave mouth behind the veil fall
function caveMouth(s, th, y0, y1, wM) {
  const NA = 24, NY = 16, pos = [], uv = [], idx = [];
  for (let j = 0; j <= NY; j++) for (let i = 0; i <= NA; i++) { const u = i / NA, v = j / NY, y = lerp(y0, y1, v), a = th + (u - .5) * wM / W.spireR(s, y, th);
    const r = W.spireR(s, Math.max(0, y), a) + 1.45; pos.push(s.x + Math.cos(a) * r, y, s.z + Math.sin(a) * r); uv.push(u, v); }
  for (let j = 0; j < NY; j++) for (let i = 0; i < NA; i++) { const a = j * (NA + 1) + i, b = a + NA + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  const m = K.shaderMat({ uniforms: {}, vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: /* glsl */`varying vec2 vUv; varying vec3 vW;
      void main(){ vec2 p = vUv*2. - 1.; float n = texture2D(uNoiseTex, vUv*vec2(1.3, 2.1)).r, n2 = texture2D(uNoiseTex, vUv*vec2(4., 6.) + .3).a;
        // arched mouth: rectangle below, ellipse above, ragged rim
        float d = p.y < .1 ? abs(p.x) : length(vec2(p.x, (p.y - .1)/.95));
        float rim = .82 + (n - .5)*.35 + (n2 - .5)*.12;
        if(d > rim || p.y < -.98) discard;
        float k = smoothstep(rim, rim - .45, d);
        vec3 col = mix(vec3(.10,.10,.085), vec3(.012,.018,.016), k) + vec3(.02,.05,.03)*n2*(1. - k);
        col *= 1. + .5*smoothstep(-.6, -1., p.y);        // wet floor catches a little light
        gl_FragColor = vec4(kFog(col, vW), 1.); }` });
  const mesh = new THREE.Mesh(g, m); K.scene.add(mesh); return mesh;
}

// ---------------------------------------------------------------- life on the water
let leaves, lilies, lotus, koi, boats = [], lanterns, flies, flyWings;
const leafData = [], koiData = [], lanternData = [], flyData = [];
let lanternSpawn, lanternDir, koiC;
function life() {
  const rnd = K.rng(5150), o = new THREE.Object3D();
  // ---- fallen maple leaves: near pillar feet and banks
  const leafGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const leafMat = K.mat({ roughness: .55, side: THREE.DoubleSide, key: 'leaf', alphaTest: .5,
    frag: /* glsl */`vec2 q = vOPos.xz*2.; float a = atan(q.x, -q.y), r = length(q);
      float lobes = .55 + .45*pow(abs(cos(a*2.5)), 1.6); float stem = step(abs(q.x), .04)*step(0., q.y)*step(q.y, .9);
      if(r > lobes*.92 && stem < .5) discard;
      float vein = smoothstep(.06, .0, abs(fract(a*2.5/3.1416 + .5) - .5)*r*3.);
      diffuseColor.rgb *= .85 + .3*vein; diffuseColor.rgb *= .8 + .4*texture2D(uNoiseTex, vOPos.xz*.7 + vWPos.xz*.1).a;` });
  const NL = 600; leaves = new THREE.InstancedMesh(leafGeo, leafMat, NL); leaves.receiveShadow = true;
  const cols = [[.75, .12, .04], [.85, .30, .05], [.92, .55, .08], [.62, .08, .05], [.80, .42, .10]], col = new THREE.Color();
  let n = 0, guard = 0;
  while (n < NL && guard++ < 20000) {
    const x = -200 + rnd() * 400, z = -120 + rnd() * 380, pd = pillarDist(x, z), d = water.depthAt(x, z);
    if (d < .15 || pd < .8 || blocked(x, z, .3)) continue;
    const want = Math.exp(-pd / 7) + (d < 2 ? .7 : 0);
    if (rnd() > want) continue;
    leafData.push({ x, z, a: rnd() * TAU, s: .14 + rnd() * .12, ph: rnd() * TAU, sp: .03 + rnd() * .06 });
    const c = cols[(rnd() * cols.length) | 0]; col.setRGB(c[0], c[1], c[2]); leaves.setColorAt(n, col); n++;
  }
  for (let i = 0; i < 70 && n < NL; i++) { const a = rnd() * TAU, r = 3 + rnd() * 16, x = -18 + Math.cos(a) * r, z = 138 + Math.sin(a) * r * .8;
    leafData.push({ x, z, a: rnd() * TAU, s: .12 + rnd() * .1, ph: rnd() * TAU, sp: .03 + rnd() * .05 });
    if (rnd() < .45) col.setRGB(.95, .55, .70); else { const c = cols[(rnd() * cols.length) | 0]; col.setRGB(c[0], c[1], c[2]); } leaves.setColorAt(n, col); n++; }
  leaves.count = n; K.scene.add(leaves); hideInRefl.push(leaves);
  // ---- lotus pads + flowers in sheltered water at pillar feet (lee side, away from the falls)
  const padGeo = new THREE.CircleGeometry(.5, 24).rotateX(-Math.PI / 2);
  const padMat = K.mat({ color: 0x3f7a2a, roughness: .45, key: 'lilypad',
    frag: /* glsl */`vec2 q = vOPos.xz; float a = atan(q.y, q.x); if(a > -.18 && a < .18 && length(q) > .03) discard;
      float r = length(q)*2.; float vein = smoothstep(.08, .0, abs(fract(a*7./3.1416) - .5))*smoothstep(.1,.5,r);
      float n = texture2D(uNoiseTex, vWPos.xz*.9).a;
      diffuseColor.rgb = mix(vec3(.06,.17,.04), vec3(.20,.34,.07), n)*(1. + .35*vein); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.55,.30,.12), smoothstep(.92,1.,r)*.6);
      roughnessFactor = .35 + .3*n;` });
  const pads = [], flowers = [];
  const clusterAt = (cx, cz, R, np, nf) => { for (let i = 0; i < np; i++) { const a = rnd() * TAU, r = Math.sqrt(rnd()) * R, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r; if (pillarDist(x, z) < .8 || water.depthAt(x, z) < .2 || blocked(x, z, 1.2)) continue; pads.push({ x, z, s: .9 + rnd() * 1.4, a: rnd() * TAU, ph: rnd() * TAU }); if (flowers.length < 60 && i < nf) flowers.push({ x: x + .2, z: z + .1, s: .7 + rnd() * .5, a: rnd() * TAU, ph: rnd() * TAU }); } };
  const isle = W.isle, gate = W.gate, wR = W.wallR, wL = W.wallL;
  for (const [s, a, R] of [[isle, 2.3, 9], [isle, -.6, 6], [gate, -1.2, 10], [wR, 2.2, 8], [wR, 1.4, 7], [wL, .2, 8], [W.temple, 1.4, 9], [W.temple, .4, 7]]) {
    const r0 = W.spireR(s, 0, a) + R * .6 + 1, p = findWater(s.x + Math.cos(a) * r0, s.z + Math.sin(a) * r0, .3, 6, 1.0, 20);
    clusterAt(p.x, p.z, R, Math.round(R * 4.5), 6);
  }
  // the opening shot's foreground (camera 1.5-3 m over the water at (-22, 150) looking north)
  clusterAt(-17.5, 141, 5.5, 30, 14); clusterAt(-26, 136, 4, 14, 5); clusterAt(-12, 145, 3, 9, 4);
  lilies = new THREE.InstancedMesh(padGeo, padMat, pads.length); lilies.receiveShadow = true;
  pads.forEach((p, i) => { o.position.set(p.x, .025, p.z); o.rotation.set(0, p.a, 0); o.scale.setScalar(p.s); o.updateMatrix(); lilies.setMatrixAt(i, o.matrix); });
  lilies.userData.pads = pads; K.scene.add(lilies); hideInRefl.push(lilies);
  // lotus flower: two rings of cupped petals
  const petals = [];
  for (let ring = 0; ring < 3; ring++) { const nP = [6, 8, 10][ring]; for (let i = 0; i < nP; i++) { const a = i / nP * TAU + ring * .4; const pg = new THREE.SphereGeometry(.5, 8, 6, 0, TAU, 0, Math.PI * .5);
    pg.scale(.10, .22 - ring * .02, .05); pg.rotateX(-.25 - ring * .32); pg.translate(0, .03, .03 + ring * .02); pg.rotateY(-a + Math.PI / 2); petals.push(pg); } }
  const cg = new THREE.CylinderGeometry(.035, .03, .04, 10).translate(0, .05, 0); petals.push(cg);
  const fGeo = K.merge(petals.map(g => g.toNonIndexed ? g : g)); fGeo.computeVertexNormals();
  const fMat = K.mat({ color: 0xf2a0c0, roughness: .5, side: THREE.DoubleSide, key: 'lotus',
    frag: /* glsl */`float h = smoothstep(.0, .09, vOPos.y); float rr = length(vOPos.xz);
      diffuseColor.rgb = mix(vec3(1.,.90,.90), vec3(.93,.30,.55), h); if(rr < .045 && vOPos.y > .03) diffuseColor.rgb = vec3(.95,.78,.2);
      totalEmissiveRadiance += diffuseColor.rgb*kTrans(kN, kV)*uSunCol*.08;` });
  lotus = new THREE.InstancedMesh(fGeo, fMat, flowers.length); lotus.castShadow = true;
  flowers.forEach((p, i) => { o.position.set(p.x, .03, p.z); o.rotation.set(0, p.a, 0); o.scale.setScalar(p.s * 2.4); o.updateMatrix(); lotus.setMatrixAt(i, o.matrix); });
  K.scene.add(lotus);
  // ---- jetty bay: the lakeside pavilion site
  const shore = W.sites.shore;
  koiC = findWater(shoreW(-12, 7).x, shoreW(-12, 7).z, 1.1, 2.6, 2.2, 70);
  // ---- koi under the surface
  const kb = new THREE.SphereGeometry(.5, 14, 10); kb.scale(.16, .10, .62);
  const tail = new THREE.PlaneGeometry(.26, .22).rotateX(-Math.PI / 2).translate(0, 0, -.38);
  const fin = new THREE.PlaneGeometry(.22, .08).rotateX(-Math.PI / 2).translate(0, -.01, .06);
  const kGeo = K.merge([kb.toNonIndexed(), tail.toNonIndexed(), fin.toNonIndexed()]); kGeo.computeVertexNormals();
  const kMat = K.mat({ roughness: .35, side: THREE.DoubleSide, key: 'koi',
    frag: /* glsl */`float n = texture2D(uNoiseTex, vOPos.xz*2.1 + vec2(vWPos.x*.0, 0.) + diffuseColor.r*.37).r;
      vec3 base = diffuseColor.rgb; diffuseColor.rgb = mix(base, vec3(.95,.93,.88), smoothstep(.48,.56, n)*step(.5, base.g + .3));
      if(vOPos.z < -.3) diffuseColor.rgb *= .9;
      // the koi are drawn flattened just under the lake's depth (see update): they carry their own 'seen through 30 cm of water' look
      float wob = texture2D(uNoiseTex, vWPos.xz*.7 + uTime*.05).r;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.05,.42,.42), .32 + .1*wob); roughnessFactor = 1.;
      totalEmissiveRadiance += diffuseColor.rgb*.12;` });
  const NK = 11; koi = new THREE.InstancedMesh(kGeo, kMat, NK);
  const kc = [[.95, .35, .05], [.95, .55, .12], [.92, .90, .85], [.85, .20, .05], [.98, .70, .25]];
  for (let i = 0; i < NK; i++) { const c = kc[i % kc.length]; col.setRGB(c[0], c[1], c[2]); koi.setColorAt(i, col);
    const op = i >= NK - 2;   // the last two: a pair gliding through the opening's foreground
    koiData.push({ r: op ? 3.5 : 2 + rnd() * 5, w: op ? .16 : (.08 + rnd() * .12) * (rnd() < .5 ? -1 : 1), ph: op ? i * .5 : rnd() * TAU, d: .22 + rnd() * .3, s: op ? 1.2 : .8 + rnd() * .6,
      ox: op ? -16 - koiC.x : (rnd() - .5) * 5, oz: op ? 141 - koiC.z : (rnd() - .5) * 5 }); }
  K.scene.add(koi);
  // ---- moored sampans with a red lantern
  const wood = K.mat({ color: 0x6e3c1a, roughness: .7, side: THREE.DoubleSide, key: 'sampanwood',
    frag: /* glsl */`float g = texture2D(uNoiseTex, vec2(vOPos.x*.05, vOPos.y*3. + vOPos.z*3.)).a; float pl = smoothstep(.0,.05, abs(fract(vOPos.y*7.) - .5));
      diffuseColor.rgb *= (.65 + .6*g)*(.75 + .25*pl); float wl = smoothstep(.12, -.02, vWPos.y); diffuseColor.rgb *= 1. - wl*.45;` });
  const weave = K.mat({ color: 0x5c4524, roughness: .9, side: THREE.DoubleSide, key: 'sampanweave',
    frag: /* glsl */`vec2 q = vec2(vOPos.x*12., atan(vOPos.y, vOPos.z)*14.); float w = step(.5, fract(q.x))*step(.5, fract(q.y)) + step(fract(q.x), .5)*step(fract(q.y), .5);
      diffuseColor.rgb *= .6 + .35*w + .25*texture2D(uNoiseTex, q*.05).a; normal = kBump(-vViewPosition, normal, w, .01);` });
  const lantM = K.mat({ color: 0xd8301c, roughness: .6, emissive: 0xff4a1a, emissiveIntensity: 1.6, key: 'sampanlantern',
    frag: `float r = fract(vOPos.y*9.); diffuseColor.rgb *= .8 + .2*step(.15, r); totalEmissiveRadiance *= .55 + .45*step(.15, r);` });
  const hull = sampanHull(), canopy = new THREE.CylinderGeometry(.78, .78, 2.3, 18, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2).translate(.4, .32, 0);
  canopy.rotateY(0);
  const pole = new THREE.CylinderGeometry(.035, .035, 1.5, 6).translate(0, .75, 0).rotateZ(.25).translate(-2.5, .3, 0);
  const lanternG = new THREE.SphereGeometry(.27, 14, 10).scale(1, 1.3, 1).translate(-2.88, 1.62, 0);
  for (let b = 0; b < 2; b++) {
    const p = shoreW(b ? -15.5 : -10.5, b ? -2.7 : 2.6), side = shoreW(0, b ? -1 : 1).sub(shoreW(0, 0)).normalize();
    for (let k = 0; k < 20 && (blocked(p.x, p.z, .9) || blocked(p.x + Math.cos(SHORE_RY) * 3, p.z - Math.sin(SHORE_RY) * 3, .9) || blocked(p.x - Math.cos(SHORE_RY) * 3, p.z + Math.sin(SHORE_RY) * 3, .9)); k++) p.addScaledVector(side, .4);
    const g = new THREE.Group(); g.add(new THREE.Mesh(hull, wood), new THREE.Mesh(canopy, weave), new THREE.Mesh(pole, wood), new THREE.Mesh(lanternG, lantM));
    g.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    g.position.copy(p); g.userData = { y0: 0, yaw: SHORE_RY + (b ? Math.PI + .06 : -.05), ph: b * 2.1 };
    K.scene.add(g); boats.push(g);
  }
  // ---- floating lanterns / flower offerings drifting out from the pavilion
  const lpet = []; for (let i = 0; i < 8; i++) { const pg = new THREE.SphereGeometry(.5, 6, 4, 0, TAU, 0, Math.PI * .5); pg.scale(.09, .16, .05); pg.rotateX(-.55); pg.translate(0, .02, .07); pg.rotateY(i / 8 * TAU); lpet.push(pg.toNonIndexed()); }
  lpet.push(new THREE.CylinderGeometry(.05, .06, .09, 10).translate(0, .05, 0).toNonIndexed()); lpet.push(new THREE.CircleGeometry(.24, 12).rotateX(-Math.PI / 2).translate(0, .01, 0).toNonIndexed());
  const lg = K.merge(lpet); lg.computeVertexNormals();
  const lmat = K.mat({ color: 0xffd9c0, roughness: .6, side: THREE.DoubleSide, key: 'floatlantern', emissive: 0xffa040, emissiveIntensity: 1,
    frag: /* glsl */`float h = smoothstep(.0, .14, vOPos.y); diffuseColor.rgb = mix(vec3(.25,.45,.15), vec3(1.,.72,.78), step(.012, vOPos.y));
      float core = smoothstep(.12, .0, length(vOPos.xz))*step(.03, vOPos.y);
      totalEmissiveRadiance = vec3(1.,.55,.2)*(core*5. + h*.6*step(.012, vOPos.y));` });
  lanterns = new THREE.InstancedMesh(lg, lmat, 14);
  lanternSpawn = shoreW(-20.5, 0);
  lanternDir = shoreW(-21.5, 0).sub(lanternSpawn).normalize().lerp(new V3(-14 - lanternSpawn.x, 0, 96 - lanternSpawn.z).normalize(), .35).normalize();
  for (let i = 0; i < 14; i++) lanternData.push({ ph: i / 14 + rnd() * .03, lat: (rnd() - .5) * 2, sp: .9 + rnd() * .3, a: rnd() * TAU, s: 1.1 + rnd() * .4 });
  K.scene.add(lanterns); hideInRefl.push(lanterns);
  // ---- dragonflies over the lily pads
  const body = new THREE.CylinderGeometry(.008, .005, .11, 5).rotateX(Math.PI / 2).toNonIndexed();
  const head = new THREE.SphereGeometry(.014, 6, 4).translate(0, 0, .058).toNonIndexed();
  const fl = K.merge([body, head]); fl.computeVertexNormals();
  flies = new THREE.InstancedMesh(fl, K.mat({ color: 0x1f8fa0, roughness: .3, metalness: .5, key: 'dragonfly' }), 8);
  const wg = []; for (const [z, sx] of [[.025, 1], [.025, -1], [.0, 1], [.0, -1]]) wg.push(new THREE.PlaneGeometry(.075, .018).rotateX(-Math.PI / 2).translate(sx * .04, .004, z).toNonIndexed());
  flyWings = new THREE.InstancedMesh(K.merge(wg), K.mat({ color: 0xd8eef0, roughness: .2, transparent: true, opacity: .45, side: THREE.DoubleSide, depthWrite: false, key: 'dfwing' }), 8);
  for (let i = 0; i < 8; i++) { const p = i < 3 ? { x: -17 + i * 2, z: 141 - i } : pads[(rnd() * pads.length) | 0] || { x: koiC.x, z: koiC.z }; flyData.push({ x: p.x, z: p.z, ph: rnd() * 100, r: 1.5 + rnd() * 3, h: .5 + rnd() * .8 }); }
  K.scene.add(flies, flyWings);
}
function sampanHull() {
  const L = 6.4, B = 1.35, NL = 28, NS = 12, pos = [], idx = [];
  for (let i = 0; i <= NL; i++) { const u = i / NL * 2 - 1, x = u * L / 2, w = B / 2 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u), 2.4)), .55) + .02, d = .38 * (1 - Math.pow(Math.abs(u), 5)) + .02, gH = .30 + .55 * Math.pow(Math.abs(u), 3.2);
    for (let j = 0; j <= NS; j++) { const a = j / NS * Math.PI, z = -Math.cos(a) * w, y = gH - (gH + d) * Math.pow(Math.sin(a), .6); pos.push(x, y, z); } }
  for (let i = 0; i < NL; i++) for (let j = 0; j < NS; j++) { const a = i * (NS + 1) + j, b = a + NS + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const deck = new THREE.PlaneGeometry(4.6, .95).rotateX(-Math.PI / 2).translate(0, .08, 0);
  const g2 = K.merge([g.toNonIndexed(), deck.toNonIndexed()]); g2.computeVertexNormals(); return g2;
}

// ---------------------------------------------------------------- light reflected off the water onto rock feet (and a GLSL hook for others)
// K.water.glslLight: `float kWaterLight(vec3 wp, vec3 n)` -> 0..~1.5 dancing light-ripple intensity at a surface point above the lake.
// Add `albedo * kWaterLight(vWPos, kN) * uSunCol * 0.25` to totalEmissiveRadiance (needs uniform tWaterCaus = K.water.lightUniforms.tWaterCaus).
water.glslLight = /* glsl */`
uniform sampler2D tWaterCaus;
float kWaterLight(vec3 wp, vec3 n){
  float h = wp.y; if(h < 0. || h > 26.) return 0.;
  vec3 rl = reflect(-uSunDir, vec3(0., 1., 0.)); rl.y = abs(rl.y); // sunlight bounced up off the lake
  float facing = max(dot(n, -normalize(vec3(rl.x, rl.y, rl.z))), 0.)*.6 + max(-n.y, 0.)*.8 + .15;
  float hz = (wp.x + wp.z)*.7071;
  float c1 = texture2D(tWaterCaus, vec2(hz*.018 + uTime*.021, wp.y*.11 - uTime*.017)).r, c2 = texture2D(tWaterCaus, vec2(hz*.013 - uTime*.016, wp.y*.085 + uTime*.012)).g;
  float c = pow((c1 + c2)*.5, 2.)*2.2;
  return c*facing*exp(-h*.16)*smoothstep(0., .6, h); }`;
function lightBands() {
  const near = W.spires.filter(s => Math.hypot(s.x + 14, s.z - 96) < 380 && s.h > 15);
  const geos = [];
  for (const s of near) { const NA = 160, NY = 9, H = Math.min(14, s.h * .5), pos = [], idx = [];
    for (let j = 0; j <= NY; j++) for (let i = 0; i <= NA; i++) { const th = i / NA * TAU, y = .05 + H * Math.pow(j / NY, 1.4), r = W.spireR(s, y, th) + .12; pos.push(s.x + Math.cos(th) * r, y, s.z + Math.sin(th) * r); }
    for (let j = 0; j < NY; j++) for (let i = 0; i < NA; i++) { const a = j * (NA + 1) + i, b = a + NA + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); geos.push(g); }
  const m = K.shaderMat({ uniforms: { tWaterCaus: { value: tCaus } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec3 vW; varying vec3 vN; void main(){ vN = normal; vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: water.glslLight + /* glsl */`varying vec3 vW; varying vec3 vN;
      void main(){ vec3 n = normalize(vN); float l = kWaterLight(vW, n); float fa = kFogAmt(vW);
        gl_FragColor = vec4(uSunCol*vec3(.85,1.,.95)*l*.07*(1. - fa), 1.); }` });
  const mesh = new THREE.Mesh(K.merge(geos), m); mesh.renderOrder = 1; K.scene.add(mesh); hideInRefl.push(mesh);
  water.lightUniforms = { tWaterCaus: { value: tCaus } };
}

// ---------------------------------------------------------------- module
const IMPACTS = [];
K.reg('water', {
  init() {
    // the terrain blockout carries a placeholder lake plane (colour 0x1f6f78) that is being removed; hide it if it is still there
    K.scene.traverse(o => { if (o.isMesh && o !== lakeA && o.material && o.material.color && o.material.color.getHex && o.material.color.getHex() === 0x1f6f78 && o.geometry && o.geometry.type === 'PlaneGeometry') o.visible = false; });
    findShore();
    bakeTextures();
    const mapTex = bakeMap();
    buildLake(mapTex);
    fallMaterial();
    const T = W.temple, site = W.sites.falls;
    // 1. the main fall: from the cleft on Temple Peak's SW face, 72 m, breaks on the ledges, fans out over the talus
    const thM = Math.atan2(site.z - T.z, site.x - T.x);
    const main = pillarFall({ s: T, th: thM, y0: site.y, v0: 1.1, w0: 5, w1: 16, fan: 2.6, seed: .11, nc: 18, slide: 8 });
    this.main = main;
    for (const im of main.impacts) { const p = new V3(T.x + Math.cos(thM) * (im.r + .4), im.y + .3, T.z + Math.sin(thM) * (im.r + .4));
      EMIT.push({ p, dir: [Math.cos(thM), Math.sin(thM)], w: 4 + im.y * .03, power: Math.min(1.3, im.v / 9), drops: 260 }); }
    { const f = main.foot, d = [Math.cos(thM), Math.sin(thM)];
      EMIT.push({ p: f.clone().setY(.2), dir: d, w: main.wFoot, power: 1.0, drops: 900, mist: 120, mistSize: 1.0 });
      IMPACTS.push([f.x + d[0] * 2.5, f.z + d[1] * 2.5, main.wFoot * .55, 1]); }
    // 2. the broad veil over a cave mouth on wallR (facing the key camera / the lake)
    const wR = W.wallR, thV = Math.atan2(96 - wR.z, -14 - wR.x) + .1;
    const veil = pillarFall({ s: wR, th: thV, y0: 25, v0: 4.2, w0: 14, w1: 18, fan: 1.2, seed: .53, nc: 24, gap: 1.6, slide: 6, maxWhite: .45, op: .62 });
    caveMouth(wR, thV, 1.5, 17, 10);
    { const f = veil.foot, d = [Math.cos(thV), Math.sin(thV)];
      EMIT.push({ p: f.clone().setY(.2), dir: d, w: veil.wFoot, power: .7, drops: 380, mist: 90, mistSize: .75 }); IMPACTS.push([f.x + d[0] * 2, f.z + d[1] * 2, veil.wFoot * .45, .85]); }
    // 3. stepped cascade through mossy boulders down wallL's talus into the lake
    const wL = W.wallL, thC = Math.atan2(184 - wL.z, -58 - wL.x) + .32;
    cascade(wL, thC, 26, 6, 31);
    { const r0 = W.spireR(wL, 0, thC) + 4; IMPACTS.push([wL.x + Math.cos(thC) * r0, wL.z + Math.sin(thC) * r0, 4, .6]); }
    // 4. a thin thread from high on 'shelf', 5. a far ribbon on a background pillar
    const sh = W.shelf, thS = Math.atan2(184 - sh.z, -58 - sh.x);
    const thin = pillarFall({ s: sh, th: thS, y0: 88, v0: 1.6, w0: 2.2, w1: 7, fan: 2, seed: .77, nc: 8, layers: 1, step: 1.2, op: .8, maxWhite: .45 });
    { const f = thin.foot, d = [Math.cos(thS), Math.sin(thS)]; EMIT.push({ p: f.clone().setY(.2), dir: d, w: 4, power: .55, drops: 120, mist: 40, mistSize: .6 }); IMPACTS.push([f.x + d[0] * 1.5, f.z + d[1] * 1.5, 3, .7]); }
    for (const im of thin.impacts) EMIT.push({ p: new V3(sh.x + Math.cos(thS) * (im.r + .4), im.y, sh.z + Math.sin(thS) * (im.r + .4)), dir: [Math.cos(thS), Math.sin(thS)], w: 2, power: .7, drops: 60 });
    let far = null, best = 1e9; const kd = new V3(-4 + 58, 86 - 66.4, 60 - 184).normalize();
    for (const s of W.spires) { if (s.name[0] !== 'p') continue; const v = new V3(s.x + 58, s.h * .5 - 66, s.z - 184), d = v.length(); if (d < 350 || d > 1100) continue; v.normalize(); const sc = (1 - v.dot(kd)) * 10 + Math.abs(d - 600) / 600 + (v.x < 0 ? 1 : 0); if (sc < best) { best = sc; far = s; } }
    if (far) { const thF = Math.atan2(184 - far.z, -58 - far.x); const ff = pillarFall({ s: far, th: thF, y0: far.h * .72, v0: 2, w0: 3, w1: 10, fan: 1.6, seed: .91, nc: 8, layers: 1, step: 2.5, op: .75 });
      EMIT.push({ p: ff.foot.clone().setY(.2), dir: [Math.cos(thF), Math.sin(thF)], w: 9, power: .8, mist: 30, mistSize: 1.5 }); this.far = far.name; }
    // travertine terraces on Temple Peak's talus beside the main fall
    travertine(T, thM - .36);
    for (let i = 0; i < IMPACTS.length && i < 6; i++) lakeMatB.uniforms.uImp.value[i].fromArray(IMPACTS[i]);
    particles();
    buildSheets();
    buildRockProxy();
    lightBands();
    life();
    hideInRefl.push(koi);
  },
  update(F) {
    frameNo++;
    const t = F.t, u = lakeMatB.uniforms;
    u.uSkyTop.value.copy(K.env.skyTop); u.uSkyHor.value.copy(K.env.skyHorizon);
    // splash events -> 4 slots (most recent active ones)
    let k = 0;
    for (let i = water.events.length - 1; i >= 0 && k < 4; i--) { const e = water.events[i], m = evMeta(e), age = t - e.t0; if (age < -m.pre - .01 || age > 45) continue;
      EVU[k].set(e.x, e.z, e.t0, e.size || 1); EVK[k].set(m.enter, m.pre, m.boilEnd, 0); k++; }
    for (; k < 4; k++) { EVU[k].set(0, 0, 0, 0); EVK[k].set(0, 0, -1e4, 0); }
    WX.set(K.env.rain || 0, t < 2.4 ? .92 * (1 - smooth(1.1, 2.2, t)) : 0, 0, 0);
    for (const sh of sheets) sh.visible = EVU[sh.userData.slot].w > 0 && t - EVU[sh.userData.slot].z > -.1 && t - EVU[sh.userData.slot].z < 7;
    const o = this._o || (this._o = new THREE.Object3D());
    // leaves drift with the wind, bob and turn
    const wd = K.env.windDir;
    for (let i = 0; i < leaves.count; i++) { const L = leafData[i], dx = wd.x * L.sp * t + Math.sin(t * .13 + L.ph) * .6, dz = wd.y * L.sp * t + Math.cos(t * .11 + L.ph) * .6;
      o.position.set(L.x + dx, .02 + .015 * Math.sin(t * 1.3 + L.ph), L.z + dz); o.rotation.set(.06 * Math.sin(t * 1.1 + L.ph), L.a + t * .05 * Math.sin(L.ph), .06 * Math.cos(t * .9 + L.ph)); o.scale.setScalar(L.s * 2); o.updateMatrix(); leaves.setMatrixAt(i, o.matrix); }
    leaves.instanceMatrix.needsUpdate = true;
    // koi cruise in loose loops under the jetty
    for (let i = 0; i < koiData.length; i++) { const q = koiData[i], a = q.ph + q.w * t + .3 * Math.sin(t * .21 + q.ph);
      const x = koiC.x + q.ox + Math.cos(a) * q.r, z = koiC.z + q.oz + Math.sin(a) * q.r * .7, dx = -Math.sin(a) * q.r * Math.sign(q.w), dz = Math.cos(a) * q.r * .7 * Math.sign(q.w);
      o.position.set(x, .012, z); o.rotation.set(0, Math.atan2(dx, dz) + .25 * Math.sin(t * 5 * q.s + q.ph), 0); o.scale.set(q.s, .05, q.s); o.updateMatrix(); koi.setMatrixAt(i, o.matrix); }
    koi.instanceMatrix.needsUpdate = true;
    // sampans bob on the swell
    for (const b of boats) { const d = b.userData; b.position.y = .04 * Math.sin(t * .9 + d.ph) - .02; b.rotation.set(.025 * Math.sin(t * .7 + d.ph), d.yaw + .03 * Math.sin(t * .13 + d.ph), .04 * Math.sin(t * 1.1 + d.ph * 1.3)); }
    // floating lanterns: born at the pavilion, drift out over 180 s
    for (let i = 0; i < lanternData.length; i++) { const L = lanternData[i], P = 180, age = ((t / P + L.ph) % 1) * P, d = age * .22 * L.sp;
      const side = new V3(-lanternDir.z, 0, lanternDir.x);
      const x = lanternSpawn.x + lanternDir.x * d + side.x * (L.lat * (2 + d * .25) + Math.sin(age * .05 + L.a) * 1.5), z = lanternSpawn.z + lanternDir.z * d + side.z * (L.lat * (2 + d * .25) + Math.sin(age * .05 + L.a) * 1.5);
      const vis = smooth(0, 4, age) * (1 - smooth(P - 10, P, age));
      o.position.set(x, .01 + .02 * Math.sin(t * 1.4 + L.a), z); o.rotation.set(0, L.a + age * .02, 0); o.scale.setScalar(L.s * vis + 1e-4); o.updateMatrix(); lanterns.setMatrixAt(i, o.matrix); }
    lanterns.instanceMatrix.needsUpdate = true;
    // dragonflies dart and hover
    for (let i = 0; i < flyData.length; i++) { const f = flyData[i], tt = t + f.ph, seg = Math.floor(tt / 1.7), fr = smooth(.0, .35, tt / 1.7 - seg);
      const p0x = (K.hash(seg, i) - .5) * 2 * f.r, p0z = (K.hash(seg, i + 50) - .5) * 2 * f.r, p1x = (K.hash(seg + 1, i) - .5) * 2 * f.r, p1z = (K.hash(seg + 1, i + 50) - .5) * 2 * f.r;
      const x = f.x + lerp(p0x, p1x, fr), z = f.z + lerp(p0z, p1z, fr), y = f.h + .15 * Math.sin(tt * 2.3);
      o.position.set(x, y, z); o.rotation.set(0, Math.atan2(p1x - p0x, p1z - p0z), 0); o.scale.setScalar(1); o.updateMatrix(); flies.setMatrixAt(i, o.matrix);
      o.scale.set(1, 1 + .0, 1); o.rotation.z = .5 * Math.sin(t * 90 + i); o.updateMatrix(); flyWings.setMatrixAt(i, o.matrix); }
    flies.instanceMatrix.needsUpdate = true; flyWings.instanceMatrix.needsUpdate = true;
  }
});

})(window.K=window.K||{},window.THREE);
//# sourceURL=src/45_water.js

(function(K,THREE){'use strict';
// ============================================================================
// 50_dragon — the two loongs, drawn by ONE generator (makeDragon) from two parameter sets:
//   the HERO  — crimson and scarlet lacquer scales edged in gold, jade/turquoise sails and fins, a flame mane (K.dragon, F.dragon, K.film.dragonPos)
//   the RIVAL — burnished gold, white-silver mane, ice-blue sails and eyes, longer and more slender (K.rival, F.rival, K.film.rivalPos)
// The film drives both: head paths (several tracks each), jaw, roar, breath + aim, under-water. The body takes what room there is: its own
// waves fade inside rock (the Sky Window), beside buildings, in tight turns of the path and under the camera; legs fold or grip the pagoda.
// Bodies fresh out of the lake are streaming wet for ~8 s (wetness travels with the body, stateless); nothing but the body is drawn under water.
// A spine is laid along the film's head path (arc-length marching, S-curves, one corkscrew coil, banking, neck look) and written to a
// float texture every frame; body tube, instanced overlapping scales, belly plates, sails, mane, whiskers and particles are skinned to
// it in the vertex shader. Head, jaw and legs are rigid sculpts (SDF -> surface nets). Stateless: update(F) is a pure function of F.
// Exports K.dragon / K.rival = { head, headDir, mouth:{pos,dir}, eye:[V3,V3], claw:[V3 x4], tail, spine(s,out), frame(s,m4), radius(s), length, bodyLength }.
// ============================================================================
const V3 = THREE.Vector3, M4 = THREE.Matrix4, Q = THREE.Quaternion;
const { sat, lerp, smooth, clamp } = K;
const PI = Math.PI, TAU = PI * 2;
let skinId = 0, TEXC = null; const NETC = {};
const v3 = c => 'vec3(' + c.map(x => x.toFixed(4)).join(',') + ')';
// ============================================================================ one dragon from a parameter set P
function makeDragon(cfg) {
const pal = cfg.pal;
const L = cfg.L, LT = L + 110, NS = 449, DS = LT / (NS - 1); // body length behind the skull (m); the spine texture runs on behind the tail (wake)
const SF = 17, SH = Math.round(L * .665), TP = L * .68;    // arc length of the front and hind legs; where the tail starts to taper
const BELLY = 50 * PI / 180;                               // half-angle of the belly-plate sector
// body radius along the spine: neck -> chest -> trunk -> hips -> long tapering tail
const radius = s => { const b = lerp(1.72, (2.42 - .22 * smooth(24, 60, s) + .1 * smooth(SH - 17, SH - 1, s)) * cfg.girth, smooth(0, 15, s)); return Math.max(.09, b * (.035 + .965 * Math.pow(1 - sat((s - TP) / (L - TP + .5)), .9))); };
const attr = (g, n, a, k) => g.setAttribute(n, new THREE.BufferAttribute(a instanceof Float32Array ? a : new Float32Array(a), k));
const iattr = (g, n, a, k) => g.setAttribute(n, new THREE.InstancedBufferAttribute(a instanceof Float32Array ? a : new Float32Array(a), k));

// ---------------------------------------------------------------- spine (CPU, every frame)
const MAXR = 1400, raw = new Float32Array(MAXR * 5);
const SPa = { aimW: 0 }, BLD = [];
const SP = { P: new Float32Array(NS * 3), X: new Float32Array(NS * 3), Y: new Float32Array(NS * 3), Z: new Float32Array(NS * 3), tau: new Float32Array(NS), B: new Float32Array(NS * 3) };
const Pd = new Float32Array(NS * 3), Yd = new Float32Array(NS * 3), taud = new Float32Array(NS), arcd = new Float32Array(NS);
const spineData = new Float32Array(NS * 3 * 4);
const spineTex = new THREE.DataTexture(spineData, NS, 3, THREE.RGBAFormat, THREE.FloatType);
spineTex.minFilter = spineTex.magFilter = THREE.NearestFilter; spineTex.generateMipmaps = false; spineTex.needsUpdate = true;
const UD = { uSpine: { value: spineTex }, uSp: { value: new THREE.Vector4(NS - 1, LT, 0, 0) }, uJaw: { value: new THREE.Vector4(-.55, 1.15, 0, 1) }, uDrg: { value: new THREE.Vector4(30, 1, 0, 0) }, uFx: { value: new THREE.Vector4(0, 0, 0, 0) } };
const clr = new Float32Array(NS).fill(1), wetA = new Float32Array(NS), cross = new Float32Array(16), CS = 4, NCO = Math.ceil(NS / CS) + 1, clrC = new Float32Array(NCO), clrT = new Float32Array(NCO);
const _a = new V3(), _b = new V3(), _c = new V3(), _d = new V3(), _e = new V3(), _q = new Q(), _q2 = new Q(), _qi = new Q(), UP = new V3(0, 1, 0);
const g3 = (A, i, o) => o.set(A[i * 3], A[i * 3 + 1], A[i * 3 + 2]);
const s3 = (A, i, v) => { A[i * 3] = v.x; A[i * 3 + 1] = v.y; A[i * 3 + 2] = v.z; };
function updateSpine(F) {
  const t = F.t, pos = cfg.pos, Dg = cfg.state(F);
  // 1. march back along the head path, accumulating arc length
  let n = 1, arc = 0, tq = t, dt = .02, stall = 0, nc = 0;
  pos(t, _a); raw[0] = _a.x; raw[1] = _a.y; raw[2] = _a.z; raw[3] = 0; raw[4] = t;
  while (arc < LT + 3 && n < MAXR) {
    tq -= dt; pos(tq, _b); const d = _b.distanceTo(_a);
    if (d < 2e-3) { if (++stall > 500) break; dt = .04; continue; }   // head parked (end of the path): keep looking back; path not started: give up
    if (d > 9) break;                                    // a cut in the path: the rest trails straight
    arc += d; const o = n * 5; raw[o] = _b.x; raw[o + 1] = _b.y; raw[o + 2] = _b.z; raw[o + 3] = arc; raw[o + 4] = tq; n++;
    if (_a.y >= 0 && _b.y < 0 && nc < 16) cross[nc++] = tq;   // (going back in time) the path came up through the lake surface here
    dt = clamp(.55 * dt / d, .006, .05); _a.copy(_b);
  }
  if (arc < LT + 3) {
    if (n >= 2) _c.set(raw[n * 5 - 5] - raw[n * 5 - 10], raw[n * 5 - 4] - raw[n * 5 - 9], raw[n * 5 - 3] - raw[n * 5 - 8]).normalize(); else { _c.copy(Dg.fwd).multiplyScalar(-1); if (_c.lengthSq() < .5) _c.set(0, 0, -1); }
    while (arc < LT + 3 && n < MAXR) { _a.addScaledVector(_c, .6); arc += .6; tq -= .02; const o = n * 5; raw[o] = _a.x; raw[o + 1] = _a.y; raw[o + 2] = _a.z; raw[o + 3] = arc; raw[o + 4] = tq; n++; }
  }
  // 2. resample at uniform arc length
  const B = SP.B, P = SP.P, X = SP.X, Y = SP.Y, Z = SP.Z, tau = SP.tau;
  for (let i = 0, j = 0; i < NS; i++) {
    const s = i * DS; while (j < n - 2 && raw[(j + 1) * 5 + 3] < s) j++;
    const o = j * 5, w = sat((s - raw[o + 3]) / Math.max(1e-5, raw[o + 8] - raw[o + 3]));
    B[i * 3] = lerp(raw[o], raw[o + 5], w); B[i * 3 + 1] = lerp(raw[o + 1], raw[o + 6], w); B[i * 3 + 2] = lerp(raw[o + 2], raw[o + 7], w); tau[i] = lerp(raw[o + 4], raw[o + 9], w);
  }
  // 3. how much room there is for the body's own waves: none inside or beside rock (the Sky Window), less in tight turns of the path
  //    (helix, coil round the pagoda), none right under the camera
  const Wd = K.world; if (!BLD.ready && K.arch && K.arch.keepOut) { BLD.ready = true; for (const b of K.arch.keepOut) if (b.r >= 3.5) BLD.push(b); }   // buildings big enough to matter
  for (let c = 0; c < NCO; c++) { const i = Math.min(NS - 1, c * CS), x = B[i * 3], y = B[i * 3 + 1], z = B[i * 3 + 2];
    let v = (y < -30 || i * DS > L + 12) ? 1 : Wd.inSpire(x, y, z, 6.5) ? 0 : Wd.inSpire(x, y, z, 14) ? .45 : 1;
    if (v > 0 && y > 0) for (let k = 0; k < BLD.length; k++) { const b = BLD[k]; if (y < b.y0 - 8 || y > b.y1 + 10) continue; const d = Math.hypot(x - b.x, z - b.z) - b.r; if (d < 5) { v = 0; break; } if (d < 13) v = Math.min(v, .45); }
    clrC[c] = v; }
  for (let pass = 0; pass < 4; pass++) { for (let c = 0; c < NCO; c++) clrT[c] = .25 * clrC[Math.max(0, c - 1)] + .5 * clrC[c] + .25 * clrC[Math.min(NCO - 1, c + 1)]; clrC.set(clrT); }
  const cam = F.cam.pos, imp = K.film.T && K.film.T.impact, hitK = imp ? sat((t - imp) / .1) * (1 - smooth(imp + .5, imp + 1.8, t)) : 0;
  const v2 = Math.pow(clamp(Dg.speed, 12, 46), 2), W = 6, iw = 1 / Math.pow(W * DS, 2);
  for (let i = 0; i < NS; i++) {
    const s = i * DS, ia = Math.max(0, i - 1), ib = Math.min(NS - 1, i + 1), ic = clamp(i, W, NS - 1 - W);
    g3(B, ia, _a); g3(B, ib, _b); _c.copy(_a).sub(_b).normalize();                     // forward (toward the head)
    g3(B, ic - W, _a); g3(B, ic + W, _b); g3(B, ic, _d); _a.add(_b).addScaledVector(_d, -2).multiplyScalar(iw); const kap = _a.length(); _a.multiplyScalar(v2 * lerp(1, -1.3, smooth(.06, .09, kap)));   // free flight: bank into the turn; wound tightly round something (pagoda, the other dragon): belly inward, sail outward
    _a.addScaledVector(_c, -_a.dot(_c)); _a.y *= .3; _d.copy(UP).multiplyScalar(22).add(_a).normalize();   // banked up
    _e.crossVectors(_d, _c); if (_e.lengthSq() < .02 && i > 0) g3(X, i - 1, _e); _e.normalize();          // left
    _d.crossVectors(_c, _e);                                                                             // up
    // graceful S-curves that travel tailward, and one corkscrew coil in the mid-body
    const cf = i / CS, c0 = cf | 0, room = lerp(clrC[c0], clrC[Math.min(NCO - 1, c0 + 1)], cf - c0); clr[i] = room;
    const dc = Math.hypot(B[i * 3] - cam.x, B[i * 3 + 1] - cam.y, B[i * 3 + 2] - cam.z);
    const amp = cfg.wave * room / (1 + Math.pow(kap * 40, 2)) * smooth(7, 22, dc);
    const A = amp * (4.4 * smooth(5, 45, s) + 1.5 * smooth(TP, L, s));
    let lat = A * Math.sin(TAU / 64 * s - 1.5 * t + cfg.ph), ver = 2.3 * amp * smooth(8, 56, s) * Math.sin(TAU / 88 * s - 1.1 * t + 1.3 + cfg.ph);
    const Hc = cfg.coil / cfg.wave * amp * Math.exp(-Math.pow((s - L * cfg.coilAt) / (L * .12), 2)), pc = TAU / 42 * s - .9 * t + cfg.ph;
    lat += Hc * Math.cos(pc); ver += Hc * Math.sin(pc);
    if (hitK > 0) { const w = hitK * room * smooth(2, 30, s), ph = TAU / 38 * s - 11 * (t - imp) + cfg.ph; lat += 6.5 * w * Math.sin(ph); ver += 4.5 * w * Math.cos(ph * 1.3); }   // the collision: a whip runs down the body
    g3(B, i, _a).addScaledVector(_e, lat).addScaledVector(_d, ver); s3(Pd, i, _a); s3(Yd, i, _d); taud[i] = tau[i]; s3(X, i, _e);
    if (i) { arcd[i] = arcd[i - 1] + Math.hypot(Pd[i * 3] - Pd[i * 3 - 3], Pd[i * 3 + 1] - Pd[i * 3 - 2], Pd[i * 3 + 2] - Pd[i * 3 - 1]); } else arcd[0] = 0;
  }
  // the waves lengthen the curve: resample so that s is true arc length again (scales never stretch)
  for (let i = 0, j = 0; i < NS; i++) {
    const s = i * DS; while (j < NS - 2 && arcd[j + 1] < s) j++;
    const w = sat((s - arcd[j]) / Math.max(1e-5, arcd[j + 1] - arcd[j])), k = i * 3, o = j * 3;
    P[k] = lerp(Pd[o], Pd[o + 3], w); P[k + 1] = lerp(Pd[o + 1], Pd[o + 4], w); P[k + 2] = lerp(Pd[o + 2], Pd[o + 5], w);
    Y[k] = lerp(Yd[o], Yd[o + 3], w); Y[k + 1] = lerp(Yd[o + 1], Yd[o + 4], w); Y[k + 2] = lerp(Yd[o + 2], Yd[o + 5], w); tau[i] = lerp(taud[j], taud[j + 1], w);
  }
  for (let i = 0; i < NS; i++) {
    const ia = Math.max(0, i - 1), ib = Math.min(NS - 1, i + 1);
    g3(P, ia, _a); g3(P, ib, _b); _c.copy(_a).sub(_b).normalize(); g3(Y, i, _d);
    _e.crossVectors(_d, _c).normalize(); _d.crossVectors(_c, _e);
    if (hitK > 0) { _q2.setFromAxisAngle(_c, hitK * 1.7 * Math.sin(TAU / 95 * i * DS - 5.5 * (t - imp) + cfg.ph)); _e.applyQuaternion(_q2); _d.applyQuaternion(_q2); }   // ... and it tumbles
    s3(X, i, _e); s3(Y, i, _d); s3(Z, i, _c);
    // wet: 1 under water and where this part of the body has just come up through the surface, drying over ~8 s
    let age = 0; if (P[i * 3 + 1] > .4) { age = 99; for (let c = 0; c < nc; c++) if (cross[c] <= tau[i] + .02) { age = tau[i] - cross[c]; break; } }
    wetA[i] = age <= 0 ? 1 : Math.pow(sat(1 - age / 8), 1.4);
  }
  // 4. the head leads with a look of its own: rotate the head (and, fading out, the neck) about the skull joint
  g3(P, 0, _a); g3(Z, 0, _c); g3(X, 0, _e);
  _b.copy(F.cam.pos).sub(_a); const dist = _b.length(); _b.normalize();
  const wl = smooth(.05, .8, _b.dot(_c)) * (1 - smooth(110, 260, dist)) * .7;
  let wo = 0; const Og = cfg.other(F);
  if (Og && Og.vis !== false) { _d.copy(Og.p).sub(_a); const od = _d.length(); _d.normalize(); wo = smooth(.25, .9, _d.dot(_c)) * (1 - smooth(140, 320, od)) * smooth(12, 30, od) * .85; }
  if (wo > 0) _d.multiplyScalar(wo).addScaledVector(_c, 1 - wo).normalize().lerp(_b, wl * (1 - wo)).normalize(); else _d.copy(_c).lerp(_b, wl).normalize();
  // breath: head and neck swing round to aim along `aim` (unless it is just "straight ahead")
  let aimW = 0; const br = sat(Dg.breath || 0);
  if (br > 0 && Dg.aim) { _b.copy(Dg.p).addScaledVector(Dg.fwd, 60).sub(Dg.aim); if (_b.lengthSq() > 4) { _b.copy(Dg.aim).sub(_a); if (_b.lengthSq() > 9) { aimW = smooth(0, .5, br); _b.normalize();
    if (_b.dot(_c) < -.2) { _b.addScaledVector(_c, -_b.dot(_c) - .2).normalize(); }                         // never crane further back than ~100 degrees
    _d.lerp(_b, aimW).normalize(); } } }
  SPa.aimW = aimW;
  _q.setFromUnitVectors(_c, _d);
  const gape = Math.max(Dg.jaw, br * .95) * .62;
  const nod = -(.07 * Dg.roar + .05 * Dg.jaw) + .025 * Math.sin(t * 1.7) * (1 - aimW) - aimW * gape * .5, yaw = .05 * Math.sin(t * 1.1 + 1.) * (1 - aimW);
  _q2.setFromAxisAngle(_e, nod); _q.multiply(_q2); g3(Y, 0, _d); _q2.setFromAxisAngle(_d, yaw); _q.multiply(_q2);
  _b.copy(UP).addScaledVector(_c, -_c.y).normalize(); const roll = Math.atan2(_b.dot(_e), _b.dot(_d));      // un-bank the head by 65 %
  _q2.setFromAxisAngle(_c, -roll * .65); _q.premultiply(_q2);
  const SN = lerp(9, 27, aimW);
  for (let i = 0; i * DS < SN; i++) {
    const w = Math.pow(1 - i * DS / SN, 2); _qi.identity().slerp(_q, w);
    g3(P, i, _b).sub(_a).applyQuaternion(_qi).add(_a); s3(P, i, _b);
    g3(X, i, _b).applyQuaternion(_qi); s3(X, i, _b); g3(Y, i, _b).applyQuaternion(_qi); s3(Y, i, _b); g3(Z, i, _b).applyQuaternion(_qi); s3(Z, i, _b);
  }
  // 5. upload
  for (let i = 0; i < NS; i++) {
    const o = i * 4, o1 = (NS + i) * 4, o2 = (2 * NS + i) * 4, k = i * 3;
    spineData[o] = P[k]; spineData[o + 1] = P[k + 1]; spineData[o + 2] = P[k + 2]; spineData[o + 3] = tau[i];
    spineData[o1] = Y[k]; spineData[o1 + 1] = Y[k + 1]; spineData[o1 + 2] = Y[k + 2]; spineData[o1 + 3] = wetA[i];
    spineData[o2] = X[k]; spineData[o2 + 1] = X[k + 1]; spineData[o2 + 2] = X[k + 2];
  }
  spineTex.needsUpdate = true;
}
// position / frame at arc length s (CPU side)
function spineAt(s, out) { const f = clamp(s / DS, 0, NS - 1.001), i = f | 0, w = f - i, P = SP.P, k = i * 3; out.set(lerp(P[k], P[k + 3], w), lerp(P[k + 1], P[k + 4], w), lerp(P[k + 2], P[k + 5], w)); if (s < 0) { g3(SP.Z, 0, _e); out.addScaledVector(_e, -s); } return out; }
const _fx = new V3(), _fy = new V3(), _fz = new V3(), _fp = new V3();
function frameAt(s, m) {
  const f = clamp(s / DS, 0, NS - 1.001), i = f | 0, w = f - i;
  g3(SP.X, i, _fx).lerp(g3(SP.X, i + 1, _fp), w).normalize(); g3(SP.Y, i, _fy).lerp(g3(SP.Y, i + 1, _fp), w); _fz.crossVectors(_fx, _fy).normalize(); _fy.crossVectors(_fz, _fx);
  g3(SP.P, i, _fp).lerp(g3(SP.P, i + 1, _a), w); if (s < 0) _fp.addScaledVector(_fz, -s);
  return m.makeBasis(_fx, _fy, _fz).setPosition(_fp);
}

// ---------------------------------------------------------------- shader plumbing
const SPINE_GLSL = /* glsl */`
uniform sampler2D uSpine; uniform vec4 uSp; uniform vec4 uJaw; uniform vec4 uDrg; uniform vec4 uFx;
vec3 gPos, gNrm; float gWet;
// frame of the body at arc length s (m behind the skull joint): P centre, X left, Y up, Z toward the head
void dSpine(float s, out vec3 P, out vec3 X, out vec3 Y, out vec3 Z){
  float f = clamp(s / uSp.y, 0., 1.) * uSp.x, i0 = min(floor(f), uSp.x - 1.), w = f - i0; int i = int(i0);
  P = mix(texelFetch(uSpine, ivec2(i, 0), 0).xyz, texelFetch(uSpine, ivec2(i + 1, 0), 0).xyz, w);
  vec4 y0 = texelFetch(uSpine, ivec2(i, 1), 0), y1 = texelFetch(uSpine, ivec2(i + 1, 1), 0); Y = mix(y0.xyz, y1.xyz, w); gWet = mix(y0.w, y1.w, w);
  X = normalize(mix(texelFetch(uSpine, ivec2(i, 2), 0).xyz, texelFetch(uSpine, ivec2(i + 1, 2), 0).xyz, w));
  Y = normalize(Y - X * dot(X, Y)); Z = cross(X, Y);
  P -= Z * (s < 0. ? s : max(s - uSp.y, 0.));
}
float dWet(float s){ return texelFetch(uSpine, ivec2(int(clamp(s / uSp.y, 0., 1.) * uSp.x + .5), 1), 0).w; }
void dSkin(vec3 lp, vec3 ln, float s){ vec3 P, X, Y, Z; dSpine(s, P, X, Y, Z); gPos = P + X*lp.x + Y*lp.y + Z*lp.z; gNrm = normalize(X*ln.x + Y*ln.y + Z*ln.z); }
`;
// K.mat whose vertices are placed by GLSL `xform` (must set gPos, gNrm — world space) + a matching shadow-depth material
function skinMat(o) {
  const xform = o.xform, extra = o.vert || '', p = Object.assign({}, o); delete p.xform;
  p.uniforms = Object.assign({}, UD, o.uniforms || {});
  p.vertPars = SPINE_GLSL + (o.vertPars || ''); p.vertNormal = xform + '\nobjectNormal = gNrm;'; p.vert = 'transformed = gPos;\n' + extra;
  const m = K.mat(p), id = 'drgD' + (skinId++);
  const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  d.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, K.U, p.uniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec4 uWind; uniform vec4 uEnv; uniform sampler2D uNoiseTex;\n' + K.GLSL.noise + p.vertPars)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + xform + '\ntransformed = gPos;\n');
  };
  d.customProgramCacheKey = () => id; m.userData.depth = d; return m;
}
const addMesh = (g, m, cast = true, recv = true) => { const me = new THREE.Mesh(g, m); me.frustumCulled = false; me.castShadow = cast; me.receiveShadow = recv; if (m.userData.depth) me.customDepthMaterial = m.userData.depth; K.scene.add(me); return me; };

// ---------------------------------------------------------------- body: tube, scales, belly plates
// vertex transform for a patch lying on the body surface: position = (u across, v toward the tail, h out), normal likewise
const PATCH = /* glsl */`
attribute vec4 aA;   // s, theta, body radius, d(radius)/ds
attribute vec4 aB;   // radians per unit u, metres per unit v, metres per unit h, random (+2 = pearl)
varying vec4 vSA; varying vec4 vSB; varying vec3 vTu; varying vec3 vTv;
void dPatch(){
  float dv = position.y * aB.y, s = aA.x + dv; vec3 P, X, Y, Z; dSpine(s, P, X, Y, Z);
  float th = aA.y + position.x * aB.x, r = aA.z + aA.w * dv + position.z * aB.z;
  vec3 rad = X*cos(th) + Y*sin(th), tg = Y*cos(th) - X*sin(th);
  gPos = P + rad * r;
  vec3 n = normalize(tg*normal.x - Z*normal.y + rad*normal.z);
  float far = smoothstep(45., 160., distance(gPos, cameraPosition));     // flatten per-scale normals with distance: no sparkle
  gNrm = normalize(mix(n, rad, far * .8));
  vSA = vec4(s, sin(th), aB.w, gWet); vSB = vec4(position.x, position.y, th, far); vTu = tg; vTv = -Z;
}`;
const PATCHF = 'varying vec4 vSA; varying vec4 vSB; varying vec3 vTu; varying vec3 vTv; uniform vec4 uFx;';
// streaming wet (fresh out of the lake, or rain): darker, mirror-glossy, sheets of water running down the body
const WETF = /* glsl */`
      float wet = max(vSA.w, uEnv.y*.45);
      if(wet > .01){ float run = texture2D(uNoiseTex, vec2(vSB.z*1.1 + vSA.x*.05, vWPos.y*.11 + uTime*.75)).r, run2 = texture2D(uNoiseTex, vec2(vSB.z*3.7, vWPos.y*.4 + uTime*1.6)).a;
        float sheet = wet * smoothstep(.42, .7, run*.7 + run2*.3 + wet*.25);
        c *= mix(1., .58, wet); roughnessFactor = mix(roughnessFactor, .035, wet*.92);
        c = mix(c, c*1.25 + uSkyCol*.05, sheet*.5); roughnessFactor = mix(roughnessFactor, .02, sheet);
        totalEmissiveRadiance += uSunCol * sheet * pow(run2, 6.) * .12; }
`;
// one scale: a small lifted shield (the fragment shader cuts the outline and sculpts the surface)
function scaleGeo() {
  const P = [[0, -.22, 0], [0, .5, .12], [0, 1.05, .17], [0, 1.52, .135], [-.44, -.2, 0], [-.68, .42, .04], [-.52, 1.02, .095], [.44, -.2, 0], [.68, .42, .04], [.52, 1.02, .095]];
  const T = [0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 6, 0, 8, 1, 0, 7, 8, 1, 9, 2, 1, 8, 9, 2, 9, 3];
  const g = new THREE.InstancedBufferGeometry(); attr(g, 'position', P.flat(), 3); attr(g, 'normal', P.map(() => [0, -.1, .995]).flat(), 3);
  attr(g, 'uv', P.map(p => [0, p[1]]).flat(), 2); const idx = []; for (let i = 0; i < T.length; i += 3) idx.push(T[i], T[i + 2], T[i + 1]); g.setIndex(idx); return g;
}
const SCALE_FRAG = /* glsl */`
      float dors = vSA.y, rnd = fract(vSA.z), pearl = step(1.5, vSA.z), u = vSB.x, vv = vSB.y, far = vSB.w;
      // profile of the scale: a shield, round at the root, drawn to a point at the free end
      float Wd = vv > .4 ? .6*(1. - pow((vv - .4)/1.1, 2.)) : .6*sqrt(max(1. - pow((.4 - vv)/.62, 2.), 0.));
      vec2 pq = vec2(abs(u), vv);                                                        // distance to the sides of the shield (the mesh outline): no discard needed
      float e = min(min(dot(pq - vec2(.44, -.2), vec2(-.9326, .3610)), dot(pq - vec2(.68, .42), vec2(-.9662, -.2577))), min(dot(pq - vec2(.52, 1.02), vec2(-.6931, -.7208)), vv + .21));
      // sculpted per-pixel normal: dome, keel, bevelled rim, rolled tip, growth rings
      vec3 rad = normalize(cross(vTv, vTu));
      float q = u / max(Wd, .08), bev = 1. - smoothstep(0., .12, e);
      float rr = length(vec2(u, vv + .1)), gr = sin(rr*30. + rnd*40.) * (1. - smoothstep(.06, .22, fwidth(rr)*30.));
      float tu = q*.5 + sign(u)*bev*1.0 + (u/.07)*exp(-u*u/.005)*.7*(1.-pearl) + gr*.07*q;
      float tv = .5*smoothstep(.85, 1.5, vv) - .3*(1. - smoothstep(-.2, .35, vv)) + gr*.07 + bev*.3*smoothstep(.6, 1.2, vv);
      if(pearl > .5){ tu = u*1.3; tv = (vv - .6)*1.3; }
      vec3 nW = normalize(rad + (normalize(vTu)*tu + normalize(vTv)*tv) * (1. - far*.9));
      normal = normalize(mat3(viewMatrix) * nW);
      float n1 = texture2D(uNoiseTex, vec2(vSA.x*.011, vSB.z*.16)).r, n2 = texture2D(uNoiseTex, vec2(vSA.x*.045 + .3, vSB.z*.5)).a;
      float ndv = clamp(dot(nW, kV), 0., 1.);
      // thin-film colour: azure face-on -> jade -> violet at grazing angles; film thickness varies per scale and along the body
      float x = ndv - (rnd - .5)*.2 - (n1 - .5)*.35;
      vec3 azure = ${v3(pal.scA)}, deep = ${v3(pal.scD)}, jade = ${v3(pal.film1)}, viol = ${v3(pal.film2)}, turq = ${v3(pal.scB)};
      vec3 c = mix(azure, turq, smoothstep(.25, -.7, dors + (n1 - .5)*.7));               // flanks go turquoise
      c = mix(c, deep, smoothstep(.45, 1., dors + (n2 - .5)*.5)*.65);                     // dark saddle along the back
      c = mix(c, deep, smoothstep(.52,.6, n2) * smoothstep(-.3,.5,dors) * .55);           // broken dark bands
      c = mix(c, jade, smoothstep(.8, .42, x)*${pal.film[0].toFixed(2)}); c = mix(c, viol, smoothstep(.34, .06, x)*${pal.film[1].toFixed(2)});
      c = mix(c, ${v3(pal.scBelly)}, smoothstep(-.62,-.82,dors)*.8);                         // toward the belly
      c *= .72 + .56*fract(rnd*7.31);
      float rim = smoothstep(0., .3, e);
      c *= mix(.25, 1., rim) * mix(.35, 1., smoothstep(-.1, .75, vv));                     // dark edges, occluded root
      c *= .88 + .12*gr;
      float au = (1. - smoothstep(.022, .05, e)) * (1. - far) * smoothstep(.1, .4, vv);    // fine gold edging
      roughnessFactor = mix(.4, ${pal.scRough.toFixed(2)}, rim) + .05*(gr*.5+.5); metalnessFactor = ${pal.scMetal.toFixed(2)};
      c = mix(c, ${v3(pal.edge)}, au); roughnessFactor = mix(roughnessFactor, .28, au); metalnessFactor = mix(metalnessFactor, 1., au);
      // pearls: nacre that glows softly, pulsing down the body
      vec3 nac = ${v3(pal.pearl)} + .1*cos(6.2832*(ndv*1.2 + rnd + vec3(0.,.33,.67)));
      c = mix(c, nac*mix(.45,1.,smoothstep(0.,.15,e)), pearl); roughnessFactor = mix(roughnessFactor, .12, pearl); metalnessFactor = mix(metalnessFactor, 0., pearl);
      totalEmissiveRadiance += pearl * smoothstep(0.,.3,e) * ${v3(pal.pearlGlow)} * (.7 + .5*sin(uTime*2.2 - vSA.x*.3));
      totalEmissiveRadiance += ${v3(pal.breath)} * uFx.x * exp(-vSA.x/9.) * (1. - smoothstep(-.1, .45, vv)) * smoothstep(.25, -.7, dors) * 2.2;   // the breath lights the throat from inside
${WETF}      diffuseColor.rgb = c;`;
// the same scale laid rigidly on a sculpt (head): aA = position in the frame at aT.w, size; aB = normal, random; aT = axis toward the free end, s
const PATCHR = /* glsl */`
attribute vec4 aA; attribute vec4 aB; attribute vec4 aT;
varying vec4 vSA; varying vec4 vSB; varying vec3 vTu; varying vec3 vTv;
void dPatchR(){
  vec3 P, X, Y, Z; dSpine(0., P, X, Y, Z);
  vec3 n = aB.xyz, tv = aT.xyz, bp = aA.xyz;
  if(aT.w > .5){ bp.yz -= uJaw.xy; bp.yz = vec2(bp.y*uJaw.w - bp.z*uJaw.z, bp.y*uJaw.z + bp.z*uJaw.w) + uJaw.xy;
    n.yz = vec2(n.y*uJaw.w - n.z*uJaw.z, n.y*uJaw.z + n.z*uJaw.w); tv.yz = vec2(tv.y*uJaw.w - tv.z*uJaw.z, tv.y*uJaw.z + tv.z*uJaw.w); }
  vec3 tu = cross(n, tv);
  vec3 lp = bp + (tu*position.x + tv*position.y + n*position.z*.6) * aA.w;
  gPos = P + X*lp.x + Y*lp.y + Z*lp.z;
  float far = smoothstep(45., 160., distance(gPos, cameraPosition));
  gNrm = normalize(X*n.x + Y*n.y + Z*n.z);
  vSA = vec4(30. - lp.z*3., n.y*.9 + .1, aB.w, gWet); vSB = vec4(position.x, position.y, lp.x*.8, far);
  vTu = X*tu.x + Y*tu.y + Z*tu.z; vTv = X*tv.x + Y*tv.y + Z*tv.z;
}`;
function buildBody(D) {
  // --- under-body tube (casts the shadows; hidden under scales and plates)
  { const NR = 300, NC = 24, pos = [], nrm = [], as = [], idx = [];
    for (let i = 0; i <= NR; i++) { const s = Math.pow(i / NR, 1.) * L, r = radius(s) * (i === NR ? .02 : 1) - .03; for (let j = 0; j <= NC; j++) { const th = j / NC * TAU; pos.push(Math.cos(th) * r, Math.sin(th) * r, 0); nrm.push(Math.cos(th), Math.sin(th), 0); as.push(s); } }
    for (let i = 0; i < NR; i++) for (let j = 0; j < NC; j++) { const a = i * (NC + 1) + j, b = a + 1, c = a + NC + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry(); attr(g, 'position', pos, 3); attr(g, 'normal', nrm, 3); attr(g, 'aS', as, 1); g.setIndex(idx);
    D.tube = addMesh(g, skinMat({ color: 0xffffff, roughness: .5, metalness: .1, vertPars: 'attribute float aS; varying vec3 vTb;', xform: 'dSkin(position, normal, aS); vTb = vec3(aS, normal.y, atan(normal.y, normal.x));', fragPars: 'varying vec3 vTb; uniform vec4 uDrg;', frag: /* glsl */`
      // close up this is the dark skin between the scales; far away (scales switched off) it carries the body colours itself
      float dors = vTb.y, n1 = texture2D(uNoiseTex, vec2(vTb.x*.011, vTb.z*.16)).r, n2 = texture2D(uNoiseTex, vec2(vTb.x*.045 + .3, vTb.z*.5)).a;
      vec3 c = mix(${v3(pal.scA)}, ${v3(pal.scB)}, smoothstep(.25, -.7, dors + (n1 - .5)*.7));
      c = mix(c, ${v3(pal.scD)}, smoothstep(.45, 1., dors + (n2 - .5)*.5)*.65); c = mix(c, ${v3(pal.scBelly)}, smoothstep(-.62,-.82,dors)*.8);
      c = mix(c, ${v3(pal.plB)}*.8, smoothstep(-.74, -.8, dors)); c *= .75 + .3*n2;
      diffuseColor.rgb = mix(${v3(pal.scD)}*.25, c, uDrg.z); roughnessFactor = mix(.6, .32, uDrg.z); metalnessFactor = mix(.1, ${Math.min(pal.scMetal, .35).toFixed(2)}, uDrg.z);` })); }
  // --- scales: one small shield, instanced in staggered overlapping rows
  { const g = scaleGeo();
    const aA = [], aB = [], rnd = K.rng(501); let s = .15, row = 0;
    while (s < L - 1.2) {
      const r = radius(s), sl = (radius(s + .2) - radius(s - .2)) / .4; const NA = s < SF + 2 ? 56 : 42; let w = TAU * r / NA, skip = 1; while (w < .15) { w *= 2; skip *= 2; }   // finer rows on the neck; the seam sits at the shoulder
      let jL = -1, jR = -1, bL = 9, bR = 9; for (let j = 0; j < NA; j += skip) { const th = (j + (row & 1) * .5 * skip) / NA * TAU, e = Math.abs(Math.sin(th) + .1); if (Math.cos(th) > 0) { if (e < bL) { bL = e; jL = j; } } else if (e < bR) { bR = e; jR = j; } }
      for (let j = 0; j < NA; j += skip) {
        const th = (j + (row & 1) * .5 * skip) / NA * TAU, dv = Math.abs(((th - 1.5 * PI + 3 * PI) % TAU) - PI);
        if (dv < BELLY - .04) continue;
        const edge = sat((dv - BELLY) / .25), sz = (1.1 + .1 * rnd()) * (.8 + .2 * edge);
        // pearls: a line of luminous nacre scales along each flank, a larger one every few metres
        const fl = (j === jL || j === jR) && skip === 1 && s > 5 && s < L - 16, big = fl && (row % 12 === 0), pearl = fl && (row % 12 === 0 || row % 4 === 2);
        const k = big ? 1.05 : pearl ? .62 : 1;
        aA.push(s + (rnd() - .5) * .08 * w, th + (rnd() - .5) * .1 * w / r, r + (pearl ? .02 * k : 0), sl); aB.push(w * sz * k / r, w * sz * k, w * sz * k, rnd() * .999 + (pearl ? 2 : 0));
      }
      s += .55 * w; row++;
    }
    iattr(g, 'aA', aA, 4); iattr(g, 'aB', aB, 4); g.instanceCount = aA.length / 4; D.nScales = g.instanceCount;
    D.scales = addMesh(g, skinMat({ color: 0xffffff, roughness: .3, metalness: .2, envMapIntensity: 1.5, vertPars: PATCH, xform: 'dPatch();', fragPars: PATCHF, frag: SCALE_FRAG }), false, true); }
  // --- belly plates: broad transverse plates, each overlapping the next
  { const NU = 18, NV = 5, pos = [], nrm = [], uv = [], idx = [], LEN = .62;          // local: u -1..1 across, v 0..1 along; h in body radii
    const hf = (u, v) => { const e = 1 - Math.pow(Math.abs(u), 5); return (.085 * Math.pow(v, .8) - .06 * Math.pow(Math.max(0, v - .82) / .18, 2)) * e + .03 * e * (1 - u * u) - .015 - .05 * (1 - e); };
    for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
      const u = i / NU * 2 - 1, vv = [0, .3, .6, .82, .93, 1][j], h = hf(u, vv);
      const e = .01, du = (hf(u + e, vv) - hf(u - e, vv)) / (2 * e) / (BELLY + .08), dv = (hf(u, vv + e) - hf(u, vv - e)) / (2 * e) / LEN, l = Math.hypot(du, dv, 1);
      pos.push(u, vv, h); nrm.push(-du / l, -dv / l, 1 / l); uv.push(u, vv);
    }
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const a = j * (NU + 1) + i, b = a + 1, c = a + NU + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.InstancedBufferGeometry(); attr(g, 'position', pos, 3); attr(g, 'normal', nrm, 3); attr(g, 'uv', uv, 2); g.setIndex(idx);
    const aA = [], aB = [], rnd = K.rng(502); let s = -.3;
    while (s < L - .6) { const r = radius(Math.max(s, 0)), sl = (radius(s + .2) - radius(s - .2)) / .4, sp = Math.max(.42 * r, .1); aA.push(s, 1.5 * PI, r, sl); aB.push(BELLY + .08, sp / .42 * LEN, r, rnd() * .999); s += sp; }
    iattr(g, 'aA', aA, 4); iattr(g, 'aB', aB, 4); g.instanceCount = aA.length / 4;
    D.plates = addMesh(g, skinMat({ color: 0xffffff, roughness: .34, metalness: .1, envMapIntensity: 1.1, vertPars: PATCH, xform: 'dPatch();', fragPars: PATCHF, frag: /* glsl */`
      float u = vSB.x, vv = vSB.y, rnd = vSA.z, far = vSB.w;
      float g1 = texture2D(uNoiseTex, vec2(u*.6 + rnd*7., vv*.5 + rnd)).a, g2 = texture2D(uNoiseTex, vec2(u*2.4 + rnd*3., vSA.x*.5)).r, g3 = texture2D(uNoiseTex, vec2(u*7., vv*1.5 + rnd*5.)).a;
      // growth ridges parallel to the free edge (they bow with the plate), a shallow keel, fine cross-hatching
      float w = vv + .05*u*u + (g1 - .5)*.03, ridge = (.5 + .5*cos(w*69.)) * (1. - smoothstep(.05, .2, fwidth(w)*11.));
      float keel = exp(-u*u*60.) + .5*exp(-pow(abs(u) - .5, 2.)*90.);
      float hgt = ridge*.007 + keel*.02*smoothstep(.1,.5,vv) + g3*.004;
      normal = kBump(-vViewPosition, normal, hgt * 1.6 * (1. - far), 1.);
      vec3 c = mix(${v3(pal.plA)}, ${v3(pal.plB)}, smoothstep(.05, .9, vv));         // ivory-gold, paler toward the free edge
      c = mix(c, vec3(.42,.2,.05), (1. - smoothstep(0., .28, vv))*.8);                       // amber shadow where it tucks under the plate ahead
      c *= .78 + .3*g1 + .14*ridge; c = mix(c, c*vec3(1.08,.9,.7), g2*.5);
      c = mix(c, ${v3(pal.plEdge)}, smoothstep(.66, .97, abs(u)));                           // jade where the plates run under the scales
      float lip = smoothstep(.9, .97, vv);
      c = mix(c, vec3(1.,.66,.2), lip*.75);                                                  // gilded lip
      roughnessFactor = mix(.34 - .14*ridge + .2*g2*(1. - vv), .25, lip); metalnessFactor = .08 + .75*lip;
      totalEmissiveRadiance += ${v3(pal.breath)} * uFx.x * exp(-max(vSA.x, 0.)/11.) * ((1. - smoothstep(0., .5, vv))*3.2 + .4) * (.65 + .35*texture2D(uNoiseTex, vec2(vSA.x*.1 - uTime*.7, u*.3)).r);   // chest and throat glow between the plates
${WETF}      diffuseColor.rgb = c;` }), false, true); }
}


// ---------------------------------------------------------------- baked textures
function bakeTextures(D) {
  if (TEXC) { D.tex = TEXC; return; }
  D.tex = TEXC = {};
  // scutes: tileable cells. r = height (domed plates), g = crevice mask (0 in the grooves), b = per-plate random, a = fine grain
  D.tex.scute = K.bake(1024, 1024, /* glsl */`
    vec4 bake(vec2 uv){ const float PER = 14.; vec2 p = uv*PER, n = floor(p), f = fract(p); float d1 = 8., d2 = 8.; vec2 id = vec2(0.);
      for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){ vec2 g = vec2(i,j), c = mod(n+g, PER), o = kHash22(c)*.72+.14, r = g+o-f; float d = dot(r,r); if(d<d1){ d2=d1; d1=d; id=c; } else if(d<d2) d2=d; }
      d1 = sqrt(d1); d2 = sqrt(d2); float e = d2 - d1;
      float dome = smoothstep(0., .3, e), rnd = kHash12(id + 3.7);
      float fine = kNoise(uv*PER*9.)*.6 + kNoise(uv*PER*23.)*.4;
      float h = pow(dome, .7) * (.72 + .28*rnd) + (1. - d1)*.12*dome + fine*.05*dome;
      return vec4(h, smoothstep(0., .14, e), rnd, fine); }`);
  // hair: fibres running along v. r = fibre shade, g = fraying mask, b = fibre tilt
  D.tex.hair = K.bake(1024, 256, /* glsl */`
    vec4 bake(vec2 uv){ const float NF = 110.; float x = uv.x*NF, c0 = floor(x), al = 0., sh = .5, id = .5;
      for(int i=-1;i<=1;i++){ float c = mod(c0 + float(i), NF), h1 = kHash11(c*1.7 + .3), h2 = kHash11(c*3.1 + 7.), h3 = kHash11(c*5.3 + 2.);
        float cen = c0 + float(i) + .5 + (h1 - .5)*.7 + sin(uv.y*6.2832*(1. + h2*2.) + h3*6.)*.16;
        float hw = .2 + .2*h2, len = .5 + .5*sqrt(h3);
        float a = smoothstep(hw, hw*.4, abs(x - cen)) * smoothstep(len, len - .05, uv.y);
        if(a > al){ al = a; sh = .45 + .55*h1; id = h3; } }
      return vec4(sh, al, id, 1.); }`, { mips: true });
  D.tex.hair.wrapT = THREE.ClampToEdgeWrapping;
}

// ---------------------------------------------------------------- fins: spines with membranes between them
// A fin is built in a plane: p, q in-plane (metres), w out of plane. Vertices: pos (p,q,w), nrm, col, fin (ribU, rho, kind 0 membrane / 1 spine, sway amplitude).
const newFin = () => ({ p: [], n: [], c: [], f: [], i: [] });
const GOLD = pal.spineA, IVORY = pal.spineB;
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const ramp = (st, t) => { for (let i = 1; i < st.length; i++) if (t <= st[i][0]) return mix3(st[i - 1][1], st[i][1], sat((t - st[i - 1][0]) / (st[i][0] - st[i - 1][0]))); return st[st.length - 1][1]; };
// spine sp = { p, q, dp, dq (unit direction), len, rb (base radius), bend }: point at fraction f
const spPt = (sp, f, o) => { const b = sp.bend * f * f * sp.len; o[0] = sp.p + sp.dp * sp.len * f - sp.dq * b; o[1] = sp.q + sp.dq * sp.len * f + sp.dp * b; return o; };
function finSpine(F, sp, ribU, sway) {
  const NR = 6, NC = 5, v0 = F.p.length / 3, o = [0, 0];
  for (let k = 0; k <= NR; k++) { const f = k / NR, rr = sp.rb * (1 - .93 * Math.pow(f, .8)); spPt(sp, f, o);
    for (let a = 0; a < NC; a++) { const an = a / NC * TAU, ca = Math.cos(an), sa = Math.sin(an);
      F.p.push(o[0] - sp.dq * ca * rr, o[1] + sp.dp * ca * rr, sa * rr * .8); F.n.push(-sp.dq * ca, sp.dp * ca, sa); F.c.push(...mix3(GOLD, IVORY, Math.pow(f, 1.5))); F.f.push(ribU, f, 1, sway * f * f * sp.len); } }
  for (let k = 0; k < NR; k++) for (let a = 0; a < NC; a++) { const A = v0 + k * NC + a, B = v0 + k * NC + (a + 1) % NC, C = A + NC, Dd = B + NC; F.i.push(A, B, C, B, Dd, C); }
}
function finWeb(F, A, B, ribU, sway, colors, r0 = 0, scal = .3, NA2 = 5, NR = 6) {
  const v0 = F.p.length / 3, a0 = [0, 0], b0 = [0, 0];
  for (let k = 0; k <= NR; k++) for (let j = 0; j <= NA2; j++) { const a = j / NA2, top = 1 - scal * Math.sin(PI * a) - .04, f = lerp(r0, top, k / NR); spPt(A, f, a0); spPt(B, f, b0);
    F.p.push(lerp(a0[0], b0[0], a), lerp(a0[1], b0[1], a), 0); F.n.push(0, 0, 1); F.c.push(...ramp(colors, f)); F.f.push(ribU + a, f, 0, sway * f * f * lerp(A.len, B.len, a)); }
  for (let k = 0; k < NR; k++) for (let j = 0; j < NA2; j++) { const a = v0 + k * (NA2 + 1) + j, b = a + 1, c = a + NA2 + 1, d = c + 1; F.i.push(a, b, c, b, d, c); }
}
const SAIL = pal.sail;
const FINFRAG = /* glsl */`
  float ribU = vFin.x, rho = vFin.y, spn = vFin.z;
  float rays = abs(fract(ribU*7. + rho*.6*sin(ribU*3.)) - .5)*2., ray = smoothstep(.72, .98, rays) * (1. - spn);
  float nz = texture2D(uNoiseTex, vec2(ribU*.37, rho*.9)).r, n2 = texture2D(uNoiseTex, vec2(ribU*2.3, rho*3.1)).a;
  vec3 c = diffuseColor.rgb; c *= .8 + .4*nz; c = mix(c, c*.4, ray*.7);
  c = mix(c, c*vec3(.5,.7,1.), smoothstep(.55,.7,n2)*(1.-spn)*.5);                       // darker blue blotches in the web
  float webEdge = (1. - spn) * smoothstep(.93, 1., rho);
  normal = normalize(normal + (rays - .5) * .35 * (1. - spn) * normalize(cross(normal, vec3(.3,.9,.2))));
  roughnessFactor = mix(.38, .3, spn) + .2*nz; metalnessFactor = mix(.05, .45, spn);
  float thin = mix(1., .25, ray) * (1. - spn) * (.55 + .45*rho);
  totalEmissiveRadiance += c * uSunCol * kTrans(kN, kV) * thin * .9;                     // the sun through the membrane; ribs stay dark
  diffuseColor.rgb = c;`;
const finMatOpts = () => ({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide, roughness: .4, metalness: .05, fragPars: 'varying vec4 vFin;', frag: FINFRAG });
// skinned fin: p runs toward the tail (arc length), q = height above the spine axis, w = to the left
function finGeoSkinned(F, s0) {
  const n = F.p.length / 3, pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), as = new Float32Array(n);
  for (let i = 0; i < n; i++) { pos[i * 3] = F.p[i * 3 + 2]; pos[i * 3 + 1] = F.p[i * 3 + 1]; as[i] = s0 + F.p[i * 3]; nrm[i * 3] = F.n[i * 3 + 2]; nrm[i * 3 + 1] = F.n[i * 3 + 1]; nrm[i * 3 + 2] = -F.n[i * 3]; }
  const g = new THREE.BufferGeometry(); attr(g, 'position', pos, 3); attr(g, 'normal', nrm, 3); attr(g, 'color', F.c, 3); attr(g, 'aFin', F.f, 4); attr(g, 'aS', as, 1); g.setIndex(F.i); return g;
}
function buildCrest(D) {
  const F = newFin(), rnd = K.rng(503), sp = []; let s = 2.2, j = 0;
  while (s < L - 4) { const r = radius(s), H = cfg.sail * r * (1.2 - .3 * smooth(8, 40, s) + .5 * smooth(TP, L * .945, s)) * smooth(1.2, 9, s) * (j % 2 ? .7 : 1) * (.88 + .24 * rnd()) + .12;
    const rk = .62 + .1 * rnd(); sp.push({ p: s, q: r - .1, dp: Math.sin(rk), dq: Math.cos(rk), len: H / Math.cos(rk), rb: .06 + .05 * r, bend: .22 }); s += .4 * r + .2; j++; }
  for (let k = 0; k < sp.length; k++) { finSpine(F, sp[k], k, .13); if (k < sp.length - 1) finWeb(F, sp[k], sp[k + 1], k, .13, SAIL, 0, .34, 4, 5); }
  // tail fan: long spines sweeping back from the last metres of the tail, above and below
  const T = newFin(), s0 = L - 6.5, NT = 13, ts = [];
  for (let k = 0; k < NT; k++) { const a = lerp(-1.25, 1.25, k / (NT - 1)), lobe = 1 - cfg.fork * Math.pow(Math.cos(a * 1.25), 6), len = cfg.tailFan * (7.5 + 1.5 * rnd()) * lobe * (k % 2 ? .82 : 1);
    ts.push({ p: s0 + 3.2 - 2.6 * Math.cos(a) + .2 , q: Math.sin(a) * .25, dp: Math.cos(a * .8), dq: Math.sin(a * .8), len, rb: .09, bend: -.1 * Math.sign(a) }); }
  for (let k = 0; k < NT; k++) { finSpine(T, ts[k], 300 + k, .1); if (k < NT - 1) finWeb(T, ts[k], ts[k + 1], 300 + k, .1, SAIL, .0, .22, 5, 8); }
  const o = finMatOpts();
  o.vertPars = 'attribute float aS; attribute vec4 aFin; varying vec4 vFin;';
  o.xform = /* glsl */`float sw = aFin.w * (sin(uTime*2.4 - aS*.33 + aFin.x*.7) * .9 + sin(uTime*5.3 - aS*.8 + aFin.x*2.1) * .35);
    vec3 lp = position; lp.x += sw; dSkin(lp, normal, aS + abs(aFin.w)*.5); vFin = aFin;`;
  const m = skinMat(o);
  D.crest = addMesh(finGeoSkinned(F, 0), m); D.tailFan = addMesh(finGeoSkinned(T, 0), m);
}

// ---------------------------------------------------------------- sculpting: signed distance fields -> surface nets
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * .25; };
const smax = (a, b, k) => -smin(-a, -b, k);
const sdSph = (x, y, z, cx, cy, cz, r) => Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy) + (z - cz) * (z - cz)) - r;
const sdEll = (x, y, z, cx, cy, cz, rx, ry, rz) => { const px = (x - cx) / rx, py = (y - cy) / ry, pz = (z - cz) / rz, k0 = Math.sqrt(px * px + py * py + pz * pz), qx = px / rx, qy = py / ry, qz = pz / rz, k1 = Math.sqrt(qx * qx + qy * qy + qz * qz); return k1 < 1e-9 ? -Math.min(rx, ry, rz) : k0 * (k0 - 1) / k1; };
const sdCone = (x, y, z, ax, ay, az, bx, by, bz, ra, rb) => { const px = x - ax, py = y - ay, pz = z - az, dx = bx - ax, dy = by - ay, dz = bz - az, h = sat((px * dx + py * dy + pz * dz) / (dx * dx + dy * dy + dz * dz)), ex = px - dx * h, ey = py - dy * h, ez = pz - dz * h; return Math.sqrt(ex * ex + ey * ey + ez * ez) - (ra + (rb - ra) * h); };
// mesh the zero set of sdf inside a box with cell size h. Returns { pos, nrm, idx } (smooth normals from the field).
function surfNets(sdf, x0, y0, z0, x1, y1, z1, h) {
  const nx = Math.ceil((x1 - x0) / h) + 1, ny = Math.ceil((y1 - y0) / h) + 1, nz = Math.ceil((z1 - z0) / h) + 1, nxy = nx * ny;
  const V = new Float32Array(nxy * nz).fill(1), Bk = 4, th = Bk * h * .866 * 1.7;
  for (let bz = 0; bz < nz; bz += Bk) for (let by = 0; by < ny; by += Bk) for (let bx = 0; bx < nx; bx += Bk) {
    const d = sdf(x0 + (bx + 1.5) * h, y0 + (by + 1.5) * h, z0 + (bz + 1.5) * h); if (d > th) continue;
    const ex = Math.min(bx + Bk, nx), ey = Math.min(by + Bk, ny), ez = Math.min(bz + Bk, nz);
    for (let k = bz; k < ez; k++) for (let j = by; j < ey; j++) for (let i = bx; i < ex; i++) V[i + nx * j + nxy * k] = d < -th ? -1 : sdf(x0 + i * h, y0 + j * h, z0 + k * h);
  }
  const id = new Int32Array(nxy * nz).fill(-1), pos = [], nrm = [], idx = [], c = new Float32Array(8), off = [0, 1, nx, nx + 1, nxy, nxy + 1, nxy + nx, nxy + nx + 1];
  const E = [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7];
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const o = i + nx * j + nxy * k; let m = 0; for (let q = 0; q < 8; q++) { c[q] = V[o + off[q]]; if (c[q] < 0) m |= 1 << q; }
    if (m === 0 || m === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (let e = 0; e < 24; e += 2) { const a = E[e], b = E[e + 1]; if ((c[a] < 0) === (c[b] < 0)) continue; const t = c[a] / (c[a] - c[b]);
      sx += (a & 1) + ((b & 1) - (a & 1)) * t; sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t; sz += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t; n++; }
    sx /= n; sy /= n; sz /= n;
    // gradient: trilinear derivative of the corner values
    let gx = ((c[1] - c[0]) * (1 - sy) + (c[3] - c[2]) * sy) * (1 - sz) + ((c[5] - c[4]) * (1 - sy) + (c[7] - c[6]) * sy) * sz;
    let gy = ((c[2] - c[0]) * (1 - sx) + (c[3] - c[1]) * sx) * (1 - sz) + ((c[6] - c[4]) * (1 - sx) + (c[7] - c[5]) * sx) * sz;
    let gz = ((c[4] - c[0]) * (1 - sx) + (c[5] - c[1]) * sx) * (1 - sy) + ((c[6] - c[2]) * (1 - sx) + (c[7] - c[3]) * sx) * sy;
    const gl = Math.hypot(gx, gy, gz) || 1; id[o] = pos.length / 3; pos.push(x0 + (i + sx) * h, y0 + (j + sy) * h, z0 + (k + sz) * h); nrm.push(gx / gl, gy / gl, gz / gl);
  }
  const st = [1, nx, nxy];
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const o = i + nx * j + nxy * k, v0 = V[o];
    for (let a = 0; a < 3; a++) { const v1 = V[o + st[a]]; if ((v0 < 0) === (v1 < 0)) continue; const b = st[(a + 1) % 3], cc = st[(a + 2) % 3];
      const A = id[o], B = id[o - b], C = id[o - b - cc], Dd = id[o - cc]; if (A < 0 || B < 0 || C < 0 || Dd < 0) continue;
      if (v0 < 0) idx.push(A, B, C, A, C, Dd); else idx.push(A, C, B, A, Dd, C); }
  }
  // smooth the normals a little (average over the faces' vertices) — hides the grid
  return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), idx };
}
const netGeo = (n, extra) => { const g = new THREE.BufferGeometry(); attr(g, 'position', n.pos, 3); attr(g, 'normal', n.nrm, 3); g.setIndex(n.idx); for (const k in extra || {}) attr(g, k, extra[k][0], extra[k][1]); return g; };
// tapered tube along a smooth curve through pts
function tubeGeo(pts, rad, segs, sides, colFn) {
  const cv = new THREE.CatmullRomCurve3(pts.map(p => new V3(p[0], p[1], p[2])), false, 'centripetal'), P = cv.getSpacedPoints(segs);
  const pos = [], nrm = [], uv = [], col = [], idx = [], T = new V3(), N = new V3(), B = new V3();
  for (let i = 0; i <= segs; i++) {
    T.copy(P[Math.min(segs, i + 1)]).sub(P[Math.max(0, i - 1)]).normalize();
    if (i === 0) { N.set(0, 1, 0); if (Math.abs(T.y) > .9) N.set(1, 0, 0); } N.addScaledVector(T, -N.dot(T)).normalize(); B.crossVectors(T, N);
    const t = i / segs, r = rad(t), c = colFn ? colFn(t) : null;
    for (let a = 0; a <= sides; a++) { const an = a / sides * TAU, ca = Math.cos(an), sa = Math.sin(an), nx = N.x * ca + B.x * sa, ny = N.y * ca + B.y * sa, nz = N.z * ca + B.z * sa;
      pos.push(P[i].x + nx * r, P[i].y + ny * r, P[i].z + nz * r); nrm.push(nx, ny, nz); uv.push(t, a / sides); if (c) col.push(c[0], c[1], c[2]); }
  }
  for (let i = 0; i < segs; i++) for (let a = 0; a < sides; a++) { const A = i * (sides + 1) + a, Bq = A + 1, C = A + sides + 1, Dd = C + 1; idx.push(A, Bq, C, Bq, Dd, C); }
  const g = new THREE.BufferGeometry(); attr(g, 'position', pos, 3); attr(g, 'normal', nrm, 3); attr(g, 'uv', uv, 2); if (colFn) attr(g, 'color', col, 3); g.setIndex(idx); return g;
}

// ---------------------------------------------------------------- head. Local space: +Z muzzle, +Y up, +X left; origin = skull joint. ~10 m long.
const HINGE = [0, -.5, 1.15];
const HK = cfg.muzzle || 1, HN = cfg.narrow || 0, HV = cfg.head || 0;
// the sculpt is built once in a common space; hw() then stretches and narrows the muzzle for this individual (in place, at offset o)
const hw = (q, o = 0) => { const z = q[o + 2]; if (z > 3.4) { q[o] *= 1 - HN * smooth(3.4, 5.6, z); q[o + 2] = 3.4 + (z - 3.4) * HK; } return q; };
const warpNet = (n, hinged) => { if (HK === 1 && !HN) return n; const pos = new Float32Array(n.pos), h = hinged ? HINGE : [0, 0, 0];
  for (let i = 0; i < pos.length; i += 3) { pos[i] += h[0]; pos[i + 1] += h[1]; pos[i + 2] += h[2]; hw(pos, i); pos[i] -= h[0]; pos[i + 1] -= h[1]; pos[i + 2] -= h[2]; } return { pos, nrm: n.nrm, idx: n.idx }; };
const lipY = z => -.55 + .12 * Math.sin(z * 1.7 + .4) * smooth(2.4, 3.4, z) - .2 * smooth(6.6, 8., z) + .3 * (1 - smooth(1.6, 3.2, z)) + .12 * Math.exp(-Math.pow((z - 6.9) / .45, 2));
const EYE = [1.5, .95, 3.05];
function sdUpper(x, y, z) {
  const ax = Math.abs(x);
  let d = sdEll(ax, y, z, 0, .4, .8, 1.95, 1.55, 2.3);                              // cranium
  d = smin(d, sdCone(ax, y, z, 0, .05, 2.4, 0, -.02, 6.9, 1.4, .84), .7);          // long muzzle with a waist
  d = smin(d, sdEll(ax, y, z, 0, .26, 7.5, 1.2, .9, 1.05), .45);                    // heavy nose pad
  d = smin(d, sdEll(ax, y, z, 0, 1.5, 1.8, 1.05, .75, 1.4), .5);                    // forehead dome
  d = smin(d, sdCone(ax, y, z, .4, 1.15, 4.7, 1.3, 1.85, 3.0, .26, .56), .3);       // brow ridges: converge in a frown...
  if (HV) { d = smin(d, sdCone(ax, y, z, 1.3, 1.85, 3.0, 2.05, 1.75, 1.3, .5, .36), .3);  // the rival: sleeker brows that run out into swept-back brow horns, and a horn on the nose
    d = smin(d, sdCone(ax, y, z, 1.8, 1.95, 2.2, 2.7, 2.9, -.5, .36, .06), .22); d = smin(d, sdCone(ax, y, z, 0, 1.1, 6.7, 0, 2.15, 6.0, .32, .05), .18); }
  else d = smin(d, sdCone(ax, y, z, 1.3, 1.85, 3.0, 2.15, 1.8, 1.2, .56, .5), .3);  // ...and flare into bosses over the temples
  d = smin(d, sdCone(ax, y, z, 1.78, .3, 1.9, 1.12, .16, 4.8, .4, .24), .3);        // cheekbone under the eye
  d = smin(d, sdEll(ax, y, z, 1.5, -.1, 1.4, .85, 1.05, 1.5), .45);                 // cheeks
  d = smin(d, sdEll(ax, y, z, 1.55, .7, -.35, .8, 1.15, .9), .5);                   // flare at the back of the skull
  d = smin(d, sdCone(ax, y, z, 0, 1.0, 4.2, 0, .98, 6.8, .46, .4), .35);            // nasal ridge
  for (let k = 0; k < 4; k++) d = smin(d, sdSph(ax, y, z, 0, 1.42 - .06 * k, 4.5 + .74 * k, .3 - .03 * k), .16);   // knobs down the bridge
  if (!HV) for (let k = 0; k < 3; k++) d = smin(d, sdCone(ax, y, z, 0, 2.05 - .1 * k, 1.5 - .95 * k, 0, 2.55 - .2 * k, 1.0 - .95 * k, .3, .1), .2);   // sagittal crest of short horns
  d = smin(d, sdEll(ax, y, z, .6, .78, 7.75, .46, .38, .6), .2);                   // nostril wings
  d = smin(d, sdEll(ax, y, z, .82, -.3, 6.5, .52, .52, 1.6), .3);                   // flews
  d = smin(d, sdCone(ax, y, z, 0, 0, .8, 0, 0, -1.7, 1.76, 1.72), .5);              // neck stub
  d = smin(d, sdCone(ax, y, z, .95, 1.6, 1.25, 1.1, 2.15, 1.0, .5, .44), .25);      // antler pedicles
  // snarl wrinkles over the nose, segmented brows
  d -= .045 * smooth(4.9, 5.4, z) * smooth(7.3, 6.8, z) * smooth(.2, .7, y) * (.5 + .5 * Math.sin(z * 13. - ax * 2.5));
  d -= .04 * smooth(1.2, 1.5, y) * smooth(.6, 1., ax) * smooth(4.6, 4., z) * (.5 + .5 * Math.sin(z * 9. + ax * 6.));
  d = smax(d, -sdSph(ax, y, z, EYE[0], EYE[1], EYE[2], .66), .12);                  // eye sockets
  d = smax(d, -sdCone(ax, y, z, .58, .84, 7.9, .95, .76, 8.5, .16, .2), .09);      // nostrils
  d = smax(d, -sdCone(ax, y, z, 0, .25, 8.62, 0, -.6, 8.45, .1, .14), .1);          // cleft lip
  d -= .07 * Math.exp(-Math.pow((y - lipY(z) - .1) / .12, 2)) * smooth(1.9, 2.7, z);   // the lip: a roll of thicker skin along the mouth
  d = smax(d, (lipY(z) - y) - 5 * (1 - smooth(1.3, 2.3, z)), .1);                   // the mouth: nothing below the lip line
  d = smax(d, -sdEll(ax, y, z, 0, -.66, 4.6, .8, .55, 3.2), .2);                    // vault of the palate
  return d;
}
function sdJaw(x, y, z) {
  const ax = Math.abs(x);
  let d = sdCone(ax, y, z, .82, -1.05, 1.0, .32, -.95, 7.1, .72, .5);               // the two rami meeting at the chin
  d = smin(d, sdEll(ax, y, z, 0, -1.3, 4.1, 1.0, .4, 3.2), .35);                    // floor of the mouth
  d = smin(d, sdEll(ax, y, z, 0, -1.02, 7.3, .78, .5, .7), .3);                     // chin
  d = smin(d, sdEll(ax, y, z, 1.3, -.95, 1.5, .5, .8, 1.1), .35);                   // angle of the jaw
  d -= .06 * Math.exp(-Math.pow((y - lipY(z) + .16) / .11, 2)) * smooth(1.6, 2.4, z);   // lower lip
  d = smax(d, y - (lipY(z) - .05), .09);
  d = smax(d, -sdEll(ax, y, z, 0, -.62, 4.3, .58, .5, 2.9), .18);                   // trough for the tongue
  return d;
}
function sdTongue(x, y, z) {
  const ax = Math.abs(x); let d = sdCone(ax, y * 1.7, z, 0, -.95 * 1.7, 1.6, 0, -.72 * 1.7, 5.6, .52, .34);
  d = smin(d, sdCone(ax, y * 1.7, z, .0, -.72 * 1.7, 5.5, .22, -.6 * 1.7, 6.7, .3, .1), .15);     // forked tip
  d = smax(d, -sdCone(ax, y, z, 0, -.5, 2., 0, -.38, 6., .08, .06), .12);                          // median groove
  return d * .6;
}
const scanIn = (f, from, to) => { const st = (to - from) / 160; let x = from; for (let i = 0; i < 160 && f(x) > 0; i++) x += st; return x; };   // first solid point coming in from outside
function tooth(geos, bx, by, bz, dx, dy, dz, len, r, cx, cy, cz) {      // curved cone from base b along d, tip bent by c
  const NR = 6, NC = 10, pos = [], nrm = [], col = [], idx = [], D3 = new V3(dx, dy, dz).normalize(), A = new V3(1, 0, 0); if (Math.abs(D3.x) > .8) A.set(0, 0, 1); A.addScaledVector(D3, -A.dot(D3)).normalize(); const Bv = new V3().crossVectors(D3, A);
  for (let k = 0; k <= NR; k++) { const f = k / NR, rr = r * (1 - Math.pow(f, 1.6)) + .004, o = f * len, bend = f * f * len;
    for (let a = 0; a < NC; a++) { const an = a / NC * TAU, ca = Math.cos(an), sa = Math.sin(an), nx = A.x * ca + Bv.x * sa, ny = A.y * ca + Bv.y * sa, nz = A.z * ca + Bv.z * sa;
      pos.push(bx + D3.x * o + cx * bend + nx * rr, by + D3.y * o + cy * bend + ny * rr, bz + D3.z * o + cz * bend + nz * rr); nrm.push(nx + D3.x * .25, ny + D3.y * .25, nz + D3.z * .25);
      const sh = .3 + .5 * smooth(0, .4, f) + .08 * Math.sin(a * 2.4 + bx * 9); col.push(sh, sh * (.8 + .14 * f), sh * (.5 + .32 * f)); } }
  for (let k = 0; k < NR; k++) for (let a = 0; a < NC; a++) { const p = k * NC + a, q = k * NC + (a + 1) % NC; idx.push(p, q, p + NC, q, q + NC, p + NC); }
  const g = new THREE.BufferGeometry(); attr(g, 'position', pos, 3); attr(g, 'normal', nrm, 3); attr(g, 'color', col, 3); g.setIndex(idx); geos.push(g);
}
function finGeoRigid(F, base, e1, e2, flip) {
  const n = F.p.length / 3, pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), pn = new Float32Array(n * 3), e3 = new V3().crossVectors(e1, e2).normalize(); e2 = new V3().crossVectors(e3, e1);
  for (let i = 0; i < n; i++) { const p = F.p[i * 3], q = F.p[i * 3 + 1], w = F.p[i * 3 + 2], a = F.n[i * 3], b = F.n[i * 3 + 1], c = F.n[i * 3 + 2];
    pos[i * 3] = base.x + e1.x * p + e2.x * q + e3.x * w; pos[i * 3 + 1] = base.y + e1.y * p + e2.y * q + e3.y * w; pos[i * 3 + 2] = base.z + e1.z * p + e2.z * q + e3.z * w;
    nrm[i * 3] = e1.x * a + e2.x * b + e3.x * c; nrm[i * 3 + 1] = e1.y * a + e2.y * b + e3.y * c; nrm[i * 3 + 2] = e1.z * a + e2.z * b + e3.z * c; pn[i * 3] = e3.x; pn[i * 3 + 1] = e3.y; pn[i * 3 + 2] = e3.z; }
  const g = new THREE.BufferGeometry(); attr(g, 'position', pos, 3); attr(g, 'normal', nrm, 3); attr(g, 'color', F.c, 3); attr(g, 'aFin', F.f, 4); attr(g, 'aPn', pn, 3);
  const idx = F.i.slice(); if (flip) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } g.setIndex(idx); return g;
}
function buildHead(D) {
  const tex = D.tex;
  const HG = D.headG = new THREE.Group(); HG.matrixAutoUpdate = false; K.scene.add(HG);
  const JG = D.jawG = new THREE.Group(); JG.position.set(HINGE[0], HINGE[1], HINGE[2]); HG.add(JG);
  const add = (parent, g, m) => { const me = new THREE.Mesh(g, m); me.castShadow = me.receiveShadow = true; me.frustumCulled = false; parent.add(me); return me; };
  // ---- skin material (head, jaw, tongue, legs): vertex colours + triplanar scute relief + the same thin-film sheen as the body
  const mkSkin = D.mkSkin = uWet => K.mat({ key: 'drgSkin_' + cfg.name, color: 0xffffff, vertexColors: true, roughness: .35, metalness: .3, envMapIntensity: 1.2,
    uniforms: { uScute: { value: tex.scute }, uGlow: D.uGlow, uWetR: uWet },
    vertPars: 'attribute vec3 aMask; varying vec3 vMask; varying vec3 vON;', vert: 'vMask = aMask; vON = normal;',
    fragPars: 'uniform sampler2D uScute; uniform vec4 uGlow; uniform vec4 uWetR; varying vec3 vMask; varying vec3 vON;',
    frag: /* glsl */`
      vec3 on = normalize(vON); float scl = vMask.x, wet = vMask.y, tile = vMask.z;
      vec4 sc = kTri(uScute, vOPos * tile, on);
      float hgt = sc.r * .045 / tile * .38 * scl;
      // inside the mouth: transverse palate ridges and a wet, pebbled surface
      float rid = sin(vOPos.z * 15. + sin(vOPos.x*3.)*1.2) * .5 + .5; hgt += wet * (.012 * rid + .006 * sc.a);
      normal = kBump(-vViewPosition, normal, hgt, 1.6);
      vec3 c = diffuseColor.rgb;
      c *= mix(1., mix(.3, 1., sc.g) * (.72 + .56*sc.b), scl);
      float ndv = clamp(dot(normalize(vWNrm), kV), 0., 1.);
      c = mix(c, mix(${v3(pal.film1)}, ${v3(pal.film2)}, smoothstep(.4, .05, ndv)), smoothstep(.85, .3, ndv) * .3 * scl * (1. - vMask.y));
      c *= mix(1., .75 + .25*rid, wet);
      roughnessFactor = mix(mix(.5, .3, sc.g) + .15*sc.a, .06 + .1*sc.a, wet); metalnessFactor = .35 * scl * (1. - wet);
      { float ww = max(uWetR.x, uEnv.y*.45) * (1. - wet); c *= mix(1., .6, ww); roughnessFactor = mix(roughnessFactor, .04, ww*.9); }
      diffuseColor.rgb = c;`,
    fragEnd: /* glsl */`
      // the mouth is a cave: no sky reaches it. Then the breath: a cold glow deep in the throat
      float occ = vMask.y * smoothstep(8.2, 3., vOPos.z); gl_FragColor.rgb *= mix(1., .2, occ);
      // wet: a tight sun glint, scattered saliva sparkles, a sheen at grazing angles
      vec3 wn = normalize(vWNrm), rn = reflect(-kV, wn); float sp = texture2D(uNoiseTex, vOPos.xz*1.9 + vOPos.y*.7).a;
      gl_FragColor.rgb += vMask.y * uSunCol * (pow(max(dot(rn, uSunDir), 0.), 120.)*.5 + smoothstep(.6, .78, sp)*pow(max(dot(rn, normalize(uSunDir + vec3(0.,.6,0.))), 0.), 10.)*.1 + pow(1. - max(dot(wn, kV), 0.), 3.)*.025);
      // the breath: a glow deep in the throat
      vec3 gd = vOPos - uGlow.xyz; float gl = exp(-dot(gd, gd) * 1.5) * uGlow.w * vMask.y;
      gl_FragColor.rgb += ${v3(pal.breath)} * gl * 2.;` });
  const skinMatl = D.skinMat = mkSkin(D.uWetH); D.skinF = mkSkin(D.uWetF); D.skinB = mkSkin(D.uWetB);
  // ---- sculpt
  const colorize = (n, fn) => { const N = n.pos.length / 3, col = new Float32Array(N * 3), msk = new Float32Array(N * 3), o = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < N; i++) { fn(n.pos[i * 3], n.pos[i * 3 + 1], n.pos[i * 3 + 2], n.nrm[i * 3], n.nrm[i * 3 + 1], n.nrm[i * 3 + 2], o); col.set([o[0], o[1], o[2]], i * 3); msk.set([o[3], o[4], o[5]], i * 3); }
    return { color: [col, 3], aMask: [msk, 3] }; };
  const AZ = pal.skA, DEEP = pal.skD, TEAL = pal.skB, BELLYC = pal.skBelly, FLESH = [.34, .028, .04], GUM = [.5, .1, .1], NAVY = pal.skLip;
  const skinCol = (x, y, z, nx, ny, nz, o) => {
    const ax = Math.abs(x), n1 = K.fbm2(z * .9 + 7, (y + ax) * .9, 3);
    let c = mix3(TEAL, AZ, smooth(-.4, .7, y + (n1 - .5) * .8)); c = mix3(c, DEEP, smooth(.9, 1.7, y + (n1 - .5)) * .7);
    c = mix3(c, BELLYC, smooth(-.75, -1.25, y + .25 * ny) * smooth(.2, -.5, ny));                        // pale gold underside
    c = mix3(c, pal.skB, smooth(.55, .75, n1) * .5);
    let scl = 1, wet = 0, tile = .42;
    const nose = smooth(7.5, 8.0, z) * smooth(-.35, .0, y) * smooth(1.25, .9, y); c = mix3(c, NAVY, nose * .85); scl *= 1 - nose * .75;
    const lip = lipY(z), lipB = (1 - smooth(.04, .3, Math.abs(y - lip + .02))) * smooth(1.8, 2.6, z); c = mix3(c, NAVY, lipB * .8); scl *= 1 - lipB * .7;
    const eye = 1 - smooth(.62, .95, Math.hypot(ax - EYE[0], y - EYE[1], z - EYE[2])); c = mix3(c, NAVY, eye * .85); scl *= 1 - eye * .5;
    return [c, scl, wet, tile];
  };
  let t0 = performance.now();
  const up = NETC['up' + HV] || (NETC['up' + HV] = surfNets(sdUpper, -3., -1.75, -1.8, 3., 3.2, 8.9, .072));
  const upG = netGeo(warpNet(up), colorize(up, (x, y, z, nx, ny, nz, o) => {
    let [c, scl, wet, tile] = skinCol(x, y, z, nx, ny, nz, o);
    const mw = lerp(1.22, .78, sat((z - 2.4) / 4.5)) + .22 * smooth(6.9, 7.5, z) - .1; const inside = (Math.abs(x) < mw + .1 && y < lipY(z) + .7 && y > -2 && z > .9 && z < 7.95 && (ny < .1 || nz > .4)) ? smooth(.1, -.15, ny - (nz > .4 ? 1 : 0)) * smooth(.9, 1.5, z) * smooth(.75, .45, y - lipY(z)) * smooth(mw + .1, mw - .05, Math.abs(x)) * smooth(7.95, 7.7, z) : 0;
    const deep = (Math.abs(x) < 1.25 && z < 3.2 && z > .3 && y < .3 && y > -1.5) ? smooth(3.2, 2.4, z) * smooth(1.25, 1.05, Math.abs(x)) * smooth(-1.5, -1.3, y) : 0, ins = Math.max(inside, deep);
    if (ins > 0) { c = mix3(c, mix3(FLESH, [.05, .004, .012], smooth(5, 1.6, z)), ins); wet = ins; scl *= 1 - ins; }
    const gum = smooth(-.3, -.7, ny) * smooth(.2, .05, Math.abs(y - lipY(z))) * smooth(1.9, 2.5, z); if (gum > 0) { c = mix3(c, GUM, gum); wet = Math.max(wet, gum * .8); scl *= 1 - gum; }
    o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; o[3] = scl; o[4] = wet; o[5] = tile; }));
  D.skull = add(HG, upG, skinMatl);
  const jw = NETC.jw || surfNets(sdJaw, -2., -1.95, -.1, 2., -.2, 8.2, .08);
  if (!NETC.jw) for (let i = 0; i < jw.pos.length; i += 3) { jw.pos[i] -= HINGE[0]; jw.pos[i + 1] -= HINGE[1]; jw.pos[i + 2] -= HINGE[2]; }
  const jwG = netGeo(warpNet(jw, true), colorize(jw, (x, y, z, nx, ny, nz, o) => { x += HINGE[0]; y += HINGE[1]; z += HINGE[2];
    let [c, scl, wet, tile] = skinCol(x, y, z, nx, ny, nz, o);
    c = mix3(c, BELLYC, smooth(-.9, -1.35, y) * .9);
    const inside = Math.max(smooth(-.22, -.08, y - lipY(z)) * smooth(-.1, .3, ny) * (Math.abs(x) < 1.25 ? 1 : 0) * smooth(1.2, 1.8, z), (Math.abs(x) < 1.1 && z < 3 && y > -1.25) ? smooth(3, 2.3, z) * smooth(-1.25, -1.05, y) : 0);
    if (inside > 0) { c = mix3(c, mix3(FLESH, [.05, .004, .012], smooth(5, 1.6, z)), inside); wet = inside; scl *= 1 - inside; }
    const gum = smooth(.3, .7, ny) * smooth(.22, .06, Math.abs(y - lipY(z) + .05)) * smooth(1.6, 2.2, z); if (gum > 0) { c = mix3(c, GUM, gum); wet = Math.max(wet, gum * .8); scl *= 1 - gum; }
    o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; o[3] = scl; o[4] = wet; o[5] = tile; }));
  add(JG, jwG, skinMatl);
  NETC.jw = jw; const tg = NETC.tg || surfNets(sdTongue, -.8, -1.1, 1.3, .8, -.2, 7., .07);
  if (!NETC.tg) for (let i = 0; i < tg.pos.length; i += 3) { tg.pos[i] -= HINGE[0]; tg.pos[i + 1] -= HINGE[1]; tg.pos[i + 2] -= HINGE[2]; } NETC.tg = tg;
  add(JG, netGeo(warpNet(tg, true), colorize(tg, (x, y, z, nx, ny, nz, o) => { const k = K.noise2(x * 9, z * 9); const tz = smooth(1.5, 5.5, z + HINGE[2]); o[0] = (.3 + .08 * k) * (.25 + .75 * tz); o[1] = (.035 + .02 * k) * (.25 + .75 * tz); o[2] = .05 * (.25 + .75 * tz); o[3] = 0; o[4] = 1; o[5] = 2.2; })), skinMatl);
  D.msHead = performance.now() - t0;
  // ---- teeth
  const ivory = K.mat({ color: 0xffffff, vertexColors: true, roughness: .2, metalness: 0, envMapIntensity: 1.1, frag: 'float tn = texture2D(uNoiseTex, vec2(vOPos.x*2.3 + vOPos.z*1.7, vOPos.y*.35)).a; diffuseColor.rgb *= .78 + .4*tn; roughnessFactor = .16 + .25*tn;' });
  const upT = [], loT = [], rnd = K.rng(511);
  const toothU = (g, x, y, z, ...r) => { const q = hw([x, y, z]); tooth(g, q[0], q[1], q[2], ...r); }, toothJ = (g, x, y, z, ...r) => { const q = hw([x, y, z]); tooth(g, q[0] - HINGE[0], q[1] - HINGE[1], q[2] - HINGE[2], ...r); };
  const xUp = z => scanIn(x => sdUpper(x, lipY(z) + .1, z), 2.6, 0) - .17, xLo = z => scanIn(x => sdJaw(x, lipY(z) - .2, z), 2.6, 0) - .15;
  for (let sgn = -1; sgn <= 1; sgn += 2) {
    for (let z = 2.7, k = 0; z < 7.75; k++) { const fang = Math.abs(z - 7.0) < .23 ? 1.25 : Math.abs(z - 5.3) < .2 ? .8 : 0, len = fang || (.3 + .22 * rnd()), r = fang ? .2 * Math.sqrt(fang) + .03 : .1 + .03 * rnd();
      toothU(upT, sgn * xUp(z), lipY(z) + .12, z, sgn * .12, -1, .05, len, r, 0, 0, -.18); z += fang ? .5 : .3 + .12 * rnd(); }
    for (let z = 2.9, k = 0; z < 7.35; k++) { const fang = Math.abs(z - 6.2) < .22 ? 1.0 : 0, len = fang || (.26 + .2 * rnd()), r = fang ? .2 : .09 + .03 * rnd();
      toothJ(loT, sgn * xLo(z), lipY(z) - .2, z, sgn * .05, 1, .08, len, r, 0, 0, -.15); z += fang ? .5 : .3 + .12 * rnd(); }
  }
  for (const x of [-.62, -.22, .22, .62]) { const zf = scanIn(z => sdUpper(x, lipY(8) + .12, z), 9.2, 7) - .16; toothU(upT, x, lipY(zf) + .14, zf, 0, -1, .12, .42, .1, 0, 0, -.15);
    const zl = scanIn(z => sdJaw(x * .8, lipY(7.6) - .2, z), 9, 6.5) - .16; toothJ(loT, x * .8, lipY(zl) - .2, zl, 0, 1, .1, .36, .09, 0, 0, -.12); }
  add(HG, K.merge(upT), ivory); add(JG, K.merge(loT), ivory);
  // ---- eyes
  const eyeM = D.eyeMat = K.mat({ color: 0xffffff, roughness: .05, metalness: 0, envMapIntensity: 1.8, uniforms: { uEye: D.uEye, uScute: { value: tex.scute } }, fragPars: 'uniform vec4 uEye; uniform sampler2D uScute;', frag: /* glsl */`
    vec3 q = normalize(vOPos); float r = length(q.xy) / .72 + step(q.z, 0.) * 4., ang = atan(q.y, q.x);
    float f1 = texture2D(uNoiseTex, vec2(ang * .95, r * .22 + .1)).a, f2 = texture2D(uNoiseTex, vec2(ang * 2.9, r * .5 + .6)).r, f3 = texture2D(uNoiseTex, vec2(ang * 6.4, r * .3)).a;
    float fib = f1 * .5 + f2 * .3 + f3 * .35;
    vec3 iris = mix(${v3(pal.irisA)}, ${v3(pal.irisB)}, smoothstep(.2, .7, r + (fib - .5) * .4));
    iris = mix(iris, ${v3(pal.irisD)}, smoothstep(.6, 1., r)) * (.35 + 1.25 * fib);
    iris = mix(iris, ${v3(pal.irisC)}, (1. - smoothstep(.0, .25, abs(r - .32) + fib * .2)) * .3);          // a green-gold collarette
    float pup = 1. - smoothstep(.8, 1.15, length(vec2(q.x / (.72 * mix(.075, .3, uEye.y)), q.y / (.72 * .7))));
    iris *= 1. - pup; iris *= smoothstep(1.03, .86, r);
    vec3 c = mix(iris, vec3(.09, .025, .02) + vec3(.25, .04, .02) * f2, smoothstep(.95, 1.05, r));
    float glow = (1. - pup) * smoothstep(1., .8, r);
    // nictitating membrane: a milky third eyelid sweeping across from the inner corner
    float nm = smoothstep(-.07, .07, uEye.x * 2.4 - 1.2 - q.x + q.y * .25 + (f2 - .5) * .12);
    c = mix(c, vec3(.42, .5, .48) * (.65 + .6 * f1), nm * .92); glow *= 1. - nm;
    roughnessFactor = mix(.04, .28, nm);
    // eyelids painted over the ball: an almond opening, outer corner raised, heavy upper lid
    float lx = q.x, ly = q.y - lx * .16 + .04;
    float open = .47 * (1. - uEye.w * .9), lid = (ly > 0. ? ly / (open * .8) : -ly / (open * 1.05)); lid = lid * lid + pow(abs(lx) / .82, 2.6);
    float lm = smoothstep(.92, 1.04, lid);
    vec4 sc = texture2D(uScute, q.xy * 2.1 + .3);
    vec3 lidc = mix(${v3(pal.skLip)}, ${v3(pal.skA)}*.5, smoothstep(1., 2.2, lid)) * (.6 + .6 * sc.g);
    lidc = mix(lidc, vec3(.9, .55, .12), (1. - smoothstep(1.02, 1.12, lid)) * .55);                         // gilt rim to the lids
    c = mix(c, lidc, lm); glow *= 1. - lm;
    normal = kBump(-vViewPosition, normal, lm * (.05 + sc.r * .02), 1.);
    roughnessFactor = mix(roughnessFactor, .42, lm);
    c *= mix(1., smoothstep(.35, 1., lid) * .75 + .25, 1. - lm);                                            // the lids shade the ball
    diffuseColor.rgb = c; totalEmissiveRadiance += iris * .32 * glow;` });
  D.eyeL = []; const eg = new THREE.SphereGeometry(.62, 32, 24); eg.rotateX(PI / 2);
  for (let sgn = -1; sgn <= 1; sgn += 2) { const e = add(HG, eg, eyeM); const zax = new V3(sgn * .62, .05, .78).normalize(); e.position.set(sgn * EYE[0] - zax.x * .26, EYE[1] - zax.y * .26, EYE[2] - zax.z * .26); const xax = new V3().crossVectors(UP, zax).normalize(), yax = new V3().crossVectors(zax, xax);
    e.quaternion.setFromRotationMatrix(new M4().makeBasis(xax, yax, zax)); if (sgn < 0) e.scale.x = -1; e.castShadow = false; D.eyeL.push(e); }
  // ---- antlers: stag-like, swept back; ridged gold fading to polished ivory tines
  const gold = D.goldMat = K.mat({ color: 0xffffff, vertexColors: true, roughness: .3, metalness: .55, envMapIntensity: 1.2, vertPars: 'varying vec2 vTu2;', vert: 'vTu2 = uv;', fragPars: 'varying vec2 vTu2;', frag: /* glsl */`
    float t = vTu2.x, a = vTu2.y; float rg = texture2D(uNoiseTex, vec2(a * 3., t * .35)).a, r2 = texture2D(uNoiseTex, vec2(a * 9., t * 1.5)).r;
    float groove = (abs(fract(a * 7. + rg * .8) - .5) * 2.) ; float k = 1. - smoothstep(.3, .95, t);
    normal = kBump(-vViewPosition, normal, (groove * .03 + r2 * .015) * k, 1.);
    diffuseColor.rgb *= mix(1., .45 + .65 * groove, k * .8) * (.85 + .3 * r2);
    roughnessFactor = mix(.2, .45, k * (1. - groove)); metalnessFactor = mix(.25, .6, k);` });
  const ant = [], aCol = t => mix3(pal.antA, pal.antB, smooth(.12, .7, t));
  const beam = [[.98, 1.75, 1.2], [1.3, 2.9, .75], [1.75, 4.3, -.3], [2.05, 5.5, -1.9], [1.95, 6.3, -3.8], [1.55, 6.7, -5.6]];
  const tines = [[[1.2, 2.55, .88], [1.35, 3.0, 1.9], [1.3, 3.9, 2.9], [1.15, 4.9, 3.3]], .2, [[1.72, 4.2, -.2], [2.35, 5.0, .4], [2.75, 6.1, .5], [2.8, 7.1, .2]], .19,
    [[2.03, 5.4, -1.75], [2.6, 6.3, -1.9], [2.9, 7.4, -2.3], [2.85, 8.3, -3.0]], .17, [[1.98, 6.2, -3.5], [2.3, 7.1, -4.0], [2.3, 8.0, -4.9]], .13, [[1.5, 3.4, .35], [.95, 4.1, .1], [.6, 5.0, .2]], .14];
  if (HV) { beam.length = 0; beam.push([.98, 1.75, 1.2], [1.25, 3.1, .9], [1.45, 4.9, .2], [1.5, 6.6, -1.3], [1.35, 7.9, -3.4], [1.0, 8.7, -5.8]);     // the rival: a tall lyre with forward prongs
    tines.length = 0; tines.push([[1.2, 2.7, .95], [1.25, 3.2, 2.2], [1.2, 4.2, 3.2]], .17, [[1.42, 4.6, .3], [1.9, 5.3, 1.3], [2.2, 6.4, 1.9]], .16, [[1.5, 6.4, -1.1], [2.1, 7.2, -.6], [2.5, 8.3, -.5]], .15,
      [[1.38, 7.7, -3.1], [1.9, 8.6, -3.2], [2.2, 9.7, -3.8]], .13, [[1.42, 4.9, .2], [.9, 5.6, -.4], [.55, 6.5, -.6]], .13, [[1.48, 5.8, -.5], [1.95, 6.3, .3], [2.15, 7.1, .8]], .12); }
  else if (cfg.tines > 0) tines.push([[1.9, 6.45, -4.5], [2.25, 7.5, -5.1], [2.15, 8.6, -6.1]], .12); if (!HV && cfg.tines > 1) tines.push([[1.32, 2.95, .72], [1.95, 3.2, 1.6], [2.4, 3.95, 2.2], [2.5, 4.9, 2.3]], .14);
  for (let sgn = -1; sgn <= 1; sgn += 2) { const mir = pts => pts.map(p => [p[0] * sgn, p[1], p[2]]);
    ant.push(tubeGeo(mir(beam), t => .4 * Math.pow(1 - t, .7) * (1 + .25 * Math.exp(-t * 30)) + .025, 44, 10, aCol));
    for (let k = 0; k < tines.length; k += 2) ant.push(tubeGeo(mir(tines[k]), t => tines[k + 1] * Math.pow(1 - t, .75) + .02, 18, 8, t => aCol(.25 + .75 * t))); }
  // filigree: a gold cord along each brow ridge that ends in a scroll at the temple, and a fine cord down the bridge of the nose
  const oc = () => pal.orn;
  for (let sgn = -1; sgn <= 1; sgn += 2) { const pts = [[.42, 1.5, 4.72], [.86, 1.99, 3.85], [1.3, 2.52, 3.0], [1.75, 2.5, 2.1], [2.16, 2.4, 1.25]], c = [2.2, 2.82, .72];
    for (let k = 0; k <= 20; k++) { const th = -.6 - k * .55, r = lerp(.62, .1, k / 20); pts.push([c[0] + .12 * k / 20, c[1] + Math.sin(th) * r, c[2] + Math.cos(th) * r]); }
    ant.push(tubeGeo(pts.map(q => hw([q[0] * sgn, q[1], q[2]])), t => .1 * (1 - .7 * t) + .015, 90, 7, oc));
    const p2 = [[1.2, .62, 4.9], [1.5, .55, 3.6], [1.95, .5, 2.2]], c2 = [2.05, .2, 1.75]; for (let k = 0; k <= 12; k++) { const th = 1.0 + k * .6, r = lerp(.34, .07, k / 12); p2.push([c2[0] + .1 * k / 12, c2[1] + Math.sin(th) * r, c2[2] + Math.cos(th) * r]); }
    ant.push(tubeGeo(p2.map(q => hw([q[0] * sgn, q[1], q[2]])), t => .07 * (1 - .7 * t) + .012, 60, 6, oc)); }
  add(HG, K.merge(ant), gold);
  const pearlM = K.mat({ color: new THREE.Color(...pal.pearl), emissive: new THREE.Color(...pal.pearlGlow), emissiveIntensity: 9, roughness: .12, metalness: 0, envMapIntensity: 1.5 });
  const pm = add(JG, new THREE.SphereGeometry(.3, 24, 16), pearlM); { const q = hw([0, -2.5, 6.35]); pm.position.set(q[0] - HINGE[0], q[1] - HINGE[1], q[2] - HINGE[2]); }
  // ---- cheek fans and ear frills
  const fo = finMatOpts(); fo.vertPars = 'attribute vec4 aFin; attribute vec3 aPn; varying vec4 vFin;';
  fo.vert = 'vFin = aFin; transformed += aPn * aFin.w * (sin(uTime*2.6 + aFin.x*.9)*.8 + sin(uTime*6.3 + aFin.x*2.3)*.3);';
  const finM = D.finMat = K.mat(fo), fg = [];
  for (let sgn = -1; sgn <= 1; sgn += 2) {
    const ch = newFin(), cs = [], NCs = 9;
    for (let k = 0; k < NCs; k++) { const a = lerp(1.15, -1.0, k / (NCs - 1)), len = (2.5 + 1.5 * Math.pow(Math.cos((a - .25) * 1.1), 2)) * (k % 2 ? .86 : 1); cs.push({ p: .25 * Math.cos(a), q: .45 * Math.sin(a), dp: Math.cos(a), dq: Math.sin(a), len, rb: .085, bend: -.1 * Math.sign(a) }); }
    for (let k = 0; k < NCs; k++) { finSpine(ch, cs[k], 20 + k, .05); if (k < NCs - 1) finWeb(ch, cs[k], cs[k + 1], 20 + k, .05, SAIL, .0, .26, 5, 7); }
    fg.push(finGeoRigid(ch, new V3(sgn * 1.85, -.25, .8), new V3(sgn * .74, .12, -.66).normalize(), new V3(sgn * -.15, 1, .05).normalize(), sgn < 0));
    const er = newFin(), es = [], NE = 5;
    for (let k = 0; k < NE; k++) { const a = lerp(.75, -.55, k / (NE - 1)), len = (1.5 + 1.0 * Math.cos(a * 1.3)) * (k % 2 ? .85 : 1); es.push({ p: .15 * Math.cos(a), q: .3 * Math.sin(a), dp: Math.cos(a), dq: Math.sin(a), len, rb: .07, bend: -.12 }); }
    for (let k = 0; k < NE; k++) { finSpine(er, es[k], 40 + k, .06); if (k < NE - 1) finWeb(er, es[k], es[k + 1], 40 + k, .06, SAIL, .0, .25, 5, 6); }
    fg.push(finGeoRigid(er, new V3(sgn * 1.7, 1.05, .35), new V3(sgn * .62, .5, -.6).normalize(), new V3(sgn * .1, .75, .65).normalize(), sgn < 0));
  }
  add(HG, K.merge(fg), finM);
}

// shield scales over the skull, brows, cheeks and the top of the muzzle: real overlapping geometry like the body's
function buildHeadScales(D) {
  if (!NETC['hs' + HV]) {
  const aA = [], aB = [], aT = [], rnd = K.rng(541), NP = 150, ring = new Float32Array(NP * 4), e = .09;
  // rings of scales at constant z, each ring half a scale behind the last and staggered; free ends point straight back along the skull
  const layRows = (sdf, jaw, z0, z1, ph0, ph1, cy0, keep) => {
    let z = z0, row = 0;
    while (z > z1) {
      const w = lerp(.18, .34, smooth(7., 2.2, z));
      for (let i = 0; i < NP; i++) { const ph = lerp(ph0, ph1, i / (NP - 1)), cx = Math.cos(ph), cy = Math.sin(ph); let t = 3.7;
        for (let k = 0; k < 28; k++) { const d = sdf(cx * t, cy0 + cy * t, z); if (d < .006) break; t -= d * .9; if (t < .15) break; }
        ring[i * 4] = cx * t; ring[i * 4 + 1] = cy0 + cy * t; ring[i * 4 + 3] = t; }
      let acc = (row & 1) * .5 * w;
      for (let i = 1; i < NP; i++) { const dx = ring[i * 4] - ring[i * 4 - 4], dy = ring[i * 4 + 1] - ring[i * 4 - 3], dl = Math.hypot(dx, dy); acc += dl;
        if (dl > .5) { acc = 0; continue; } if (acc < w) continue; acc -= w;
        const x = ring[i * 4], y = ring[i * 4 + 1]; if (ring[i * 4 + 3] < .2 || !keep(x, y, z)) continue;
        let nx = sdf(x + e, y, z) - sdf(x - e, y, z), ny = sdf(x, y + e, z) - sdf(x, y - e, z), nz = sdf(x, y, z + e) - sdf(x, y, z - e); const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
        if (nz > .72) continue;
        let tx = nx * nz, ty = ny * nz, tz = nz * nz - 1; const tl = Math.hypot(tx, ty, tz) || 1;
        aA.push(x - nx * .015, y - ny * .015, z - nz * .015, w * (1.2 + .06 * rnd())); aB.push(nx, ny, nz, rnd() * .999); aT.push(tx / tl, ty / tl, tz / tl, jaw);
      }
      z -= .5 * w; row++;
    }
  };
  layRows(sdUpper, 0, 7.45, -.9, -.62, PI + .62, .15, (x, y, z) => { const ax = Math.abs(x);
    return !(y < lipY(z) + .16 && z > 1.9) && !(z > 7.05 && y < 1.) && Math.hypot(ax - EYE[0], y - EYE[1], z - EYE[2]) > .84 && Math.hypot(ax - .58, y - .84, z - 7.95) > .5 && Math.hypot(ax - 1.02, y - 1.95, z - 1.1) > .6; });
  layRows(sdJaw, 1, 7.2, 1.35, PI - .12, TAU + .12, -1.05, (x, y, z) => y < lipY(z) - .2);
  NETC['hs' + HV] = [aA, aB, aT]; }
  const [aA0, aB, aT] = NETC['hs' + HV], aA = aA0.slice(); for (let i = 0; i < aA.length; i += 4) hw(aA, i);
  const g = scaleGeo(); iattr(g, 'aA', aA, 4); iattr(g, 'aB', aB, 4); iattr(g, 'aT', aT, 4); g.instanceCount = aA.length / 4; D.nHeadScales = g.instanceCount;
  D.headScales = addMesh(g, skinMat({ color: 0xffffff, roughness: .3, metalness: .2, envMapIntensity: 1.5, vertPars: PATCHR, xform: 'dPatchR();', fragPars: PATCHF, frag: SCALE_FRAG }), false, true);
}

// ---------------------------------------------------------------- mane, beard, tufts (instanced ribbons) and whiskers (instanced tubes)
// One strand = a closed-form curve: leaves the skin along d0, then is swept into the airstream (back along the body, drooping a
// little), with travelling flutter waves. Stateless. Roots ride the spine frame (the head is the frame at s = 0).
const STRAND = /* glsl */`
attribute vec4 aR;   // root in the local frame (x left, y up, z fwd), w = arc length s of the frame
attribute vec4 aD;   // root direction (local), w = length
attribute vec4 aM;   // x width / radius, y random, z beta (how fast it turns into the flow), w flag: 1 rides the jaw, 2 tuft at a whisker tip
attribute vec4 aN;   // x droop, y spread outward, z flutter, w shade (0 inner dark layer .. 1 outer) / tuft random
varying vec4 vHr; varying vec4 vHt;
vec3 gAx;   // normal of the plane the strand bends in: never parallel to its tangent, so a stable frame axis
void dStrand(float u, out vec3 p, out vec3 tn, out vec3 rad){
  vec3 P, X, Y, Z; dSpine(aR.w, P, X, Y, Z); vec3 lr = aR.xyz, ld = aD.xyz;
  if(aM.w > .5 && aM.w < 1.5){ lr.yz -= uJaw.xy; lr.yz = vec2(lr.y*uJaw.w - lr.z*uJaw.z, lr.y*uJaw.z + lr.z*uJaw.w) + uJaw.xy; ld.yz = vec2(ld.y*uJaw.w - ld.z*uJaw.z, ld.y*uJaw.z + ld.z*uJaw.w); }
  vec3 root = P + X*lr.x + Y*lr.y + Z*lr.z, d0 = normalize(X*ld.x + Y*ld.y + Z*ld.z);
  rad = X*lr.x + Y*lr.y; float rl = length(rad); rad = rl > 1e-3 ? rad/rl : Y;
  vec3 flow = normalize(-Z + vec3(0., -aN.x, 0.) + rad*aN.y);
  float len = aD.w, e = exp(-aM.z*u), A = (1. - e)/aM.z;
  p = root + len*(d0*A + flow*(u - A)); tn = normalize(d0*e + flow*(1. - e));
  gAx = normalize(cross(rad, Z) + d0*.02);
  vec3 b1 = normalize(cross(tn, gAx)), b2 = cross(tn, b1);
  float ph = aM.y*6.2832, k = aN.z*len*u*sqrt(u);
  p += b1*(sin(uTime*5.2 - u*7. + ph)*.09 + sin(uTime*2.1 - u*3.2 + ph*1.7)*.13)*k + b2*(cos(uTime*4.3 - u*6. + ph*2.3)*.08 + sin(uTime*1.3 - u*2.1 + ph)*.1)*k;
}
void dHair(){
  float u = position.y; vec3 p, tn, rad;
  if(aM.w > 1.5){ vec3 p0, t0; dStrand(.97, p0, t0, rad); vec3 h = kHash33(vec3(aN.w*91.7, aN.w*37.3 + 1., 5.)) - .5; tn = normalize(t0 + h*.75);
    float tl = (.4 + .7*fract(aN.w*13.7)) * (aD.w > 10. ? 1.6 : 1.); p = p0 + tn*u*tl + t0*u*u*tl*.5 + h*sin(uTime*6. + aN.w*40.)*.05*u; tn = normalize(tn + t0*u); }
  else dStrand(u, p, tn, rad);
  vec3 vd = normalize(cameraPosition - p), wx = normalize(cross(tn, vd)), nf = cross(wx, tn);
  float w = aM.x*uDrg.y*(.45 + .55*smoothstep(0., .2, u))*(1. - .55*u*u);
  gPos = p + wx*position.x*w; gNrm = normalize(nf + wx*position.x*.9 + rad*.25);
  vHr = vec4(u, position.x, aM.y, aM.w > 1.5 ? 1. : aN.w); vHt = vec4(tn, gWet);
}
void dTube(){
  float u = position.y; vec3 p, tn, rad; dStrand(u, p, tn, rad);
  vec3 b1 = normalize(cross(tn, gAx)), b2 = cross(tn, b1), n = b1*position.x + b2*position.z;
  if(aM.w > 2.5){   // a trailing ribbon of fin: flat, widest in the middle, twisting and rippling in the airstream
    float w = aM.x * pow(sin(3.1416*min(u*1.12 + .05, 1.)), .6), tw = sin(uTime*2.6 - u*8. + aM.y*6.)*.8 + u*2.;
    vec3 a1 = b1*cos(tw) + b2*sin(tw), a2 = cross(tn, a1);
    gPos = p + a1*position.x*w + a2*position.z*.025; gNrm = normalize(a2*position.z + a1*position.x*.25);
    vHr = vec4(u, position.x, aM.y, 3.); vHt = vec4(tn, gWet); return; }
  float r = aM.x*(1. - .82*pow(u, .8))*(1. + .5*exp(-u*40.));
  gPos = p + n*r; gNrm = n; vHr = vec4(u, position.x, aM.y, 0.); vHt = vec4(tn, gWet);
}`;
function buildMane(D) {
  let A = { R: [], D: [], M: [], N: [] }; const A1 = A, A2 = { R: [], D: [], M: [], N: [] }, T = { R: [], D: [], M: [], N: [] }, rnd = K.rng(521);
  const put = (o, lx, ly, lz, s, dx, dy, dz, len, w, beta, flag, droop, spread, flut, shade, r = rnd()) => { if (s === 0) { const q = hw([lx, ly, lz]); lx = q[0]; lz = q[2]; } o.R.push(lx, ly, lz, s); o.D.push(dx, dy, dz, len); o.M.push(w, r, beta, flag); o.N.push(droop, spread, flut, shade); };
  // a lock: n fine strands that share a root patch, a direction and a flutter phase, so the hair clumps and moves together
  const lock = (n, sp, lx, ly, lz, s, dx, dy, dz, len, w, beta, flag, droop, spread, flut, lay) => { const r = rnd() * .98;
    for (let k = 0; k < n; k++) put(A, lx + (rnd() - .5) * sp, ly + (rnd() - .5) * sp, lz + (rnd() - .5) * sp, s, dx + (rnd() - .5) * .18, dy + (rnd() - .5) * .18, dz + (rnd() - .5) * .18,
      len * (.7 + .42 * rnd()), w * (.7 + .6 * rnd()), beta * (.92 + .16 * rnd()), flag, droop, spread * (.8 + .4 * rnd()), flut, lay, r + k * .0013); };
  // (1) ruff round the back of the skull, lying back along it
  for (let i = 0; i < 520; i++) {
    const ph = lerp(-.42, PI + .42, rnd()), cx = Math.cos(ph), cy = Math.sin(ph), z = lerp(-1.25, 1.3 + 1.1 * smooth(.3, .9, cy) * rnd(), Math.pow(rnd(), 1.2));
    let t = 3.4; while (t > .3 && sdUpper(cx * t, .15 + cy * t, z) > 0) t -= .06;
    const up = smooth(-.3, 1, cy), lay = rnd() < .42 ? 0 : 1, len = (3. + 3.2 * up) * (.6 + .6 * rnd()) * (lay ? 1 : .7) * (1 - .45 * smooth(.9, 2.2, z));
    lock(6, .34, cx * (t - .4), .15 + cy * (t - .4), z, 0, cx * .5, cy * .5 + .12, -.75 - .3 * rnd(), len, .056, 2.6 + 1.6 * rnd(), 0, .1 + .1 * rnd(), lay ? .3 + .2 * rnd() : .08, .5 + .5 * rnd(), lay);
  }
  // (2) neck mane, thinning out down the back
  for (let i = 0; i < 560; i++) {
    const s = 28 * Math.pow(rnd(), 1.5), th = PI / 2 + (rnd() + rnd() - 1) * 1.75, r = radius(s), cy = Math.sin(th), lay = rnd() < .42 ? 0 : 1;
    const len = lerp(5., 1.6, Math.pow(s / 28, .8)) * (.55 + .7 * rnd()) * (.75 + .35 * cy) * (lay ? 1 : .7);
    lock(6, .36, Math.cos(th) * r * .94, cy * r * .94, 0, s, Math.cos(th) * .8, cy * .8, -.6, len, .056, 2.4 + 1.6 * rnd(), 0, .1 + .12 * rnd(), lay ? .25 + .2 * rnd() : .06, .5 + .5 * rnd(), lay);
  }
  // (3) hackles down both sides of the dorsal sail
  A = A2;
  for (let i = 0; i < 400; i++) {
    const s = lerp(24, L - 7, rnd()), sd = rnd() < .5 ? -1 : 1, th = PI / 2 + sd * (.1 + .42 * rnd()), r = radius(s), lay = rnd() < .35 ? 0 : 1;
    lock(4, .3, Math.cos(th) * r * .98, Math.sin(th) * r * .98, 0, s, Math.cos(th) * .7, Math.sin(th) * .7, -.7, r * (.6 + .9 * rnd()) + .3, .04 + .013 * r, 3 + 2 * rnd(), 0, .15, .12 + .15 * rnd(), .5 + .5 * rnd(), lay);
  }
  // (4) beard and jowl fringe, hung from the lower jaw
  A = A1;
  for (let i = 0; i < 170; i++) {
    const chin = i < 100, z = chin ? lerp(4.2, 7.55, Math.pow(rnd(), .6)) : lerp(1.4, 5., rnd()), x = chin ? (rnd() * 2 - 1) * .62 : (rnd() < .5 ? -1 : 1) * lerp(.75, 1.5, rnd()) * lerp(1, .6, sat((z - 1.4) / 3.6));
    let y = -2.6; while (y < -.6 && sdJaw(x, y, z) > 0) y += .04; if (y >= -.6) continue;
    const len = chin ? (1.8 + 2.6 * smooth(4.2, 7.4, z)) * (.6 + .6 * rnd()) : 1.2 + 1.5 * rnd(), lay = rnd() < .35 ? 0 : 1;
    lock(6, .24, x, y + .12, z, 0, x * .5, -.85, -.25, len * (lay ? 1 : .75), .04, 2.2 + 1.5 * rnd(), 1, .45 + .2 * rnd(), .1, .5 + .5 * rnd(), lay);
  }
  // (5) eyebrow plumes sweeping back off the brow ridges
  for (let i = 0; i < 60; i++) { const sg = i & 1 ? 1 : -1, f = rnd(), x = lerp(1.15, 1.95, f), z = lerp(3.0, 1.45, f); let y = 3; while (y > .5 && sdUpper(x, y, z) > 0) y -= .05;
    lock(4, .16, sg * x, y - .06, z, 0, sg * .45, .75, -.45, (1.5 + 2.6 * f) * (.6 + .6 * rnd()), .035, 2.8 + 1.5 * rnd(), 0, .05, .35, .6 + .4 * rnd(), rnd() < .3 ? 0 : 1); }
  // (6) plume at the end of the tail
  A = A2;
  for (let i = 0; i < 170; i++) { const s = lerp(L - 10, L - .3, Math.pow(rnd(), .7)), th = rnd() * TAU, r = radius(s);
    lock(5, .2, Math.cos(th) * r, Math.sin(th) * r, 0, s, Math.cos(th) * .6, Math.sin(th) * .6, -.8, (3. + 5. * rnd()) * smooth(L - 11, L - 4, s), .045, 2.5 + 1.5 * rnd(), 0, .12, .1 + .2 * rnd(), .7 + .5 * rnd(), rnd() < .35 ? 0 : 1); }
  A = A1;
  // whiskers (tubes) with tufts at their tips
  const W = [[.98, -.02, 7.4, .9, .25, .35, 14, .115, 3.6, 0, .5, .55, .34], [.62, .86, 8.02, .45, .85, .35, 5.5, .06, 3.4, 0, .1, .35, .4], [.36, -1.5, 7.25, .25, -.95, .15, 4, .055, 3, 1, .5, .15, .45], [.78, -1.5, 6.2, .35, -.9, 0, 2.8, .045, 3, 1, .5, .2, .45]];
  for (const w of W) for (let sg = -1; sg <= 1; sg += 2) { const r = rnd(); put(T, sg * w[0], w[1], w[2], 0, sg * w[3], w[4], w[5], w[6], w[7], w[8], w[9], w[10], w[11], w[12], 0, r);
    const nt = w[6] > 10 ? 44 : w[6] > 5 ? 20 : 12; for (let k = 0; k < nt; k++) put(A, sg * w[0], w[1], w[2], 0, sg * w[3], w[4], w[5], w[6], (.028 + .022 * rnd()) * (w[6] > 10 ? 1 : .7), w[8], 2, w[10], w[11], w[12], rnd(), r); }
  for (let sg = -1; sg <= 1; sg += 2) { put(T, sg * 1.95, -.15, .75, 0, sg * .8, .15, -.55, 12, .34, 3.2, 3, .22, .55, .5, 0); put(T, sg * 1.8, -.8, .95, 0, sg * .75, -.25, -.6, 8.5, .26, 3.4, 3, .4, .45, .55, 0); }   // long trailing ribbons of fin from the cheeks
  // ribbons
  { const ribbon = (A, NSEG) => { const pos = [], idx = []; for (let i = 0; i <= NSEG; i++) { const u = Math.pow(i / NSEG, 1.25); pos.push(-1, u, 0, 1, u, 0); } for (let i = 0; i < NSEG; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      const g = new THREE.InstancedBufferGeometry(); attr(g, 'position', pos, 3); attr(g, 'normal', pos.map(() => 0), 3); g.setIndex(idx);
      const n = A.R.length / 4, perm = Array.from({ length: n }, (_, i) => i), sh = name => { const src = A[name], o = new Float32Array(n * 4); for (let i = 0; i < n; i++) o.set(src.slice(perm[i] * 4, perm[i] * 4 + 4), i * 4); return o; };
      for (let i = n - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0, t = perm[i]; perm[i] = perm[j]; perm[j] = t; }                       // shuffled, so drawing the first k of them thins the mane evenly
      iattr(g, 'aR', sh('R'), 4); iattr(g, 'aD', sh('D'), 4); iattr(g, 'aM', sh('M'), 4); iattr(g, 'aN', sh('N'), 4); g.instanceCount = n; g.userData.n = n; return g; };
    const g = ribbon(A1, 8), g2 = ribbon(A2, 6); D.nHair = g.instanceCount + g2.instanceCount;
    D.mane = addMesh(g, skinMat({ color: 0xffffff, side: THREE.DoubleSide, roughness: .5, metalness: 0, envMapIntensity: .8, uniforms: { uHair: { value: D.tex.hair } }, vertPars: STRAND, xform: 'dHair();',
      fragPars: 'uniform sampler2D uHair; varying vec4 vHr; varying vec4 vHt;', frag: /* glsl */`
      float u = vHr.x, sd = vHr.y, rnd = vHr.z, lay = vHr.w;
      // each card is a lock of fine hairs: the fibre texture cuts it into separate hairs that end at different lengths
      float tx = (sd*.5 + .5)*.055 + fract(rnd*931.7);
      vec4 hx = texture2D(uHair, vec2(tx, u*.97 + .015));
      float fpp = fwidth(tx)*110.;                                                                          // hairs per pixel: far away the lock is drawn solid, as one strand
      float solid = smoothstep(1., .45, abs(sd)) * smoothstep(1.02, .86, u + (hx.b - .5)*.25);
      if(mix(hx.g, solid, smoothstep(.28, .75, fpp)) < .5) discard;
      float r2 = fract(rnd*17.3), r3 = fract(rnd*41.7);
      vec3 c = mix(${v3(pal.maneRoot)}, ${v3(pal.maneMid)}, smoothstep(.02, .3, u)); c = mix(c, ${v3(pal.maneMid2)}, smoothstep(.3, .66, u)); c = mix(c, ${v3(pal.maneTip)}, smoothstep(.62, 1., u + (r2 - .5)*.2));
      c = mix(mix(${v3(pal.maneInner)}, c*.4, .5), c, max(lay, smoothstep(.8, 1., u)*.5));                  // darker inner layer
      c *= (.5 + .7*hx.r) * (.75 + .45*r3) * mix(.7, 1., smoothstep(0., .12, u));
      normal = kBump(-vViewPosition, normal, hx.r*.03, 1.);
      roughnessFactor = .42;
      // soft anisotropic highlight band along the hair (Kajiya-Kay): a broad coloured lobe and a narrower pale one, shifted hair by hair
      float wet = max(vHt.w, uEnv.y*.4); c *= mix(1., .45, wet);                                                  // wet hair: dark, with a hard shine
      vec3 T = normalize(vHt.xyz + kN*((hx.b - .5)*.3 - .08)), H = normalize(uSunDir + kV); float th = dot(T, H), st = sqrt(max(1. - th*th, 0.));
      float lit = smoothstep(-.3, .4, dot(kN, uSunDir)) * mix(.35, 1., lay);
      totalEmissiveRadiance += uSunCol * (vec3(1.,.95,.86)*pow(st, 44.)*.13*(1. + 3.*wet) + c*pow(st, 9.)*.3) * lit;
      totalEmissiveRadiance += c * uSunCol * kTrans(kN, kV) * .25 * smoothstep(.2, 1., u);                  // tips light up against the sun
      diffuseColor.rgb = c;` }), true, true); D.mane2 = addMesh(g2, D.mane.material, false, true); }
  // tubes
  { const NSEG = 56, NC = 7, pos = [], idx = []; for (let i = 0; i <= NSEG; i++) for (let a = 0; a <= NC; a++) pos.push(Math.cos(a / NC * TAU), i / NSEG, Math.sin(a / NC * TAU));
    for (let i = 0; i < NSEG; i++) for (let a = 0; a < NC; a++) { const p = i * (NC + 1) + a, q = p + 1, c = p + NC + 1, d = c + 1; idx.push(p, c, q, q, c, d); }
    const g = new THREE.InstancedBufferGeometry(); attr(g, 'position', pos, 3); attr(g, 'normal', pos.map(() => 0), 3); g.setIndex(idx);
    iattr(g, 'aR', T.R, 4); iattr(g, 'aD', T.D, 4); iattr(g, 'aM', T.M, 4); iattr(g, 'aN', T.N, 4); g.instanceCount = T.R.length / 4;
    D.whiskers = addMesh(g, skinMat({ color: 0xffffff, side: THREE.DoubleSide, roughness: .28, metalness: .25, vertPars: STRAND, xform: 'dTube();', fragPars: 'varying vec4 vHr; varying vec4 vHt;', frag: /* glsl */`
      float u = vHr.x; float nz = texture2D(uNoiseTex, vec2(u*3., vHr.z)).a;
      vec3 c = mix(${v3(pal.whA)}, ${v3(pal.whB)}, smoothstep(.0,.6,u)); c = mix(c, ${v3(pal.whC)}, smoothstep(.6,1.,u));
      c *= .8 + .4*nz; c *= .9 + .1*sin(u*260.);                                                           // faint annular rings
      roughnessFactor = .25 + .2*nz;
      if(vHr.w > 2.5){ float e = abs(vHr.y), rays = abs(fract(vHr.y*3. + .5) - .5)*2.;
        c = mix(${v3(pal.sail[1][1])}, ${v3(pal.sail[2][1])}, smoothstep(0., .8, u)); c *= .7 + .5*nz; c = mix(c, c*.45, smoothstep(.75, .95, rays)*.7);
        c = mix(c, ${v3(pal.sail[3][1])}, smoothstep(.82, .97, e)); roughnessFactor = .36; metalnessFactor = .05;
        totalEmissiveRadiance += c * uSunCol * kTrans(kN, kV) * .7; }
      diffuseColor.rgb = c;` }), true, true); }
}

// ---------------------------------------------------------------- legs: four short powerful limbs, five-clawed. Bones run down -Y; built for the left side, mirrored for the right.
const LU = 3.3, LLo = 3.1, LEGS = [[SF, 1, 0], [SF, -1, PI], [SH, 1, PI * .9], [SH, -1, -.1 * PI]];
function sdLegU(x, y, z) {
  let d = sdEll(x, y, z, -.25, .1, 0, 1.25, 1.35, 1.35);
  d = smin(d, sdCone(x, y, z, 0, -.2, 0, 0, -LU, 0, 1.05, .62), .4);
  d = smin(d, sdEll(x, y, z, .15, -1.25, .38, .72, 1.1, .75), .3); d = smin(d, sdEll(x, y, z, 0, -1.7, -.45, .62, 1.05, .6), .3);
  d = smin(d, sdSph(x, y, z, 0, -LU, 0, .68), .25); d = smin(d, sdCone(x, y, z, 0, -LU, -.3, 0, -LU + .45, -1.5, .36, .04), .2);     // elbow and its spur
  d = smin(d, sdCone(x, y, z, -.2, -.3, -.78, 0, -LU + .3, -.52, .32, .22), .22);                                                      // triceps
  for (let k = 0; k < 5; k++) d = smin(d, sdEll(x, y, z, .8 - .07 * k, -.5 - .56 * k, .05, .2, .44, .52 - .04 * k), .07);              // greave-like shields down the outer side
  return d;
}
function sdLegL(x, y, z) {
  let d = sdCone(x, y, z, 0, 0, 0, 0, -LLo, 0, .64, .42);
  d = smin(d, sdEll(x, y, z, 0, -.95, .22, .64, 1.0, .62), .3); d = smin(d, sdSph(x, y, z, 0, -LLo, 0, .5), .2);
  d = smin(d, sdCone(x, y, z, 0, -1.5, -.34, 0, -LLo, -.3, .13, .17), .12);                                                           // tendon down the back of the shank
  for (let k = 0; k < 5; k++) d = smin(d, sdEll(x, y, z, .47 - .03 * k, -.4 - .52 * k, 0, .16, .37, .37 - .03 * k), .06);
  return d;
}
const TOES = []; { for (let k = 0; k < 4; k++) { const ph = (-.62 + .413 * k), sx = Math.sin(ph), cx = Math.cos(ph), b0 = [sx * .5, -.85, .12];
    const d1 = new V3(sx, -cx, -.22).normalize(), b1 = [b0[0] + d1.x * 1.05, b0[1] + d1.y * 1.05, b0[2] + d1.z * 1.05], d2 = new V3(sx * .9, -cx * .8, .5).normalize(), b2 = [b1[0] + d2.x * .85, b1[1] + d2.y * .85, b1[2] + d2.z * .85];
    TOES.push({ b0, b1, b2, d2, r: k === 1 || k === 2 ? .27 : .24 }); }
  const b0 = [-.55, -.45, -.25], d1 = new V3(-.55, -.45, -.7).normalize(), b1 = [b0[0] + d1.x * .8, b0[1] + d1.y * .8, b0[2] + d1.z * .8], d2 = new V3(-.25, -.9, .35).normalize(), b2 = [b1[0] + d2.x * .6, b1[1] + d2.y * .6, b1[2] + d2.z * .6];
  TOES.push({ b0, b1, b2, d2, r: .23 }); }
function sdFoot(x, y, z) {
  let d = sdEll(x, y, z, 0, -.55, .02, .78, .68, .48); d = smin(d, sdSph(x, y, z, 0, 0, 0, .5), .3);
  for (const t of TOES) { let f = sdCone(x, y, z, t.b0[0], t.b0[1], t.b0[2], t.b1[0], t.b1[1], t.b1[2], t.r, t.r * .85); f = smin(f, sdSph(x, y, z, t.b1[0], t.b1[1], t.b1[2], t.r * .98), .08);
    f = smin(f, sdCone(x, y, z, t.b1[0], t.b1[1], t.b1[2], t.b2[0], t.b2[1], t.b2[2], t.r * .85, t.r * .68), .1); d = smin(d, f, .22);
    d = smin(d, sdCone(x, y, z, 0, -.12, -.24, t.b0[0], t.b0[1] + .03, t.b0[2] - .17, .1, .09), .1);                                 // tendons fanning over the back of the foot
    d = smin(d, sdSph(x, y, z, t.b0[0], t.b0[1], t.b0[2] - .1, t.r * 1.08), .08); d = smin(d, sdSph(x, y, z, t.b2[0], t.b2[1], t.b2[2], t.r * .8), .06); }   // knuckles
  return d;
}
function buildLegs(D) {
  const legCol = (n, tile) => { const N = n.pos.length / 3, col = new Float32Array(N * 3), msk = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { const x = n.pos[i * 3], y = n.pos[i * 3 + 1], z = n.pos[i * 3 + 2], nz = n.nrm[i * 3 + 2], nx = n.nrm[i * 3], k = K.fbm2(y * 1.1 + 3, (x + z) * 1.1, 3);
      let c = mix3(pal.skB, pal.skA, smooth(-.3, .6, nx * .6 - nz * .5 + (k - .5))); c = mix3(c, pal.skD, smooth(.55, .75, k) * .6); c = mix3(c, pal.skBelly, smooth(.25, .8, nz * .9 - nx * .5) * .9);
      col.set(c, i * 3); msk.set([1, 0, tile], i * 3); }
    return { color: [col, 3], aMask: [msk, 3] }; };
  const nu = NETC.lu || (NETC.lu = surfNets(sdLegU, -1.7, -4.3, -1.8, 1.5, 1.6, 1.6, .105)), nl = NETC.ll || (NETC.ll = surfNets(sdLegL, -.9, -3.8, -.9, 1., .8, 1., .095)), nf = NETC.lf || (NETC.lf = surfNets(sdFoot, -1.9, -3., -1.5, 1.9, .6, 1.3, .076));
  const gU = netGeo(nu, legCol(nu, .7)), gL = netGeo(nl, legCol(nl, .9)), gF = netGeo(nf, legCol(nf, 1.2));
  // claws
  const cl = []; for (const t of TOES) { const d = t.d2, e = [t.b2[0], t.b2[1], t.b2[2]], up = new V3(0, .25, 1);
    const pts = [[e[0] - d.x * .15, e[1] - d.y * .15, e[2] - d.z * .15], [e[0] + d.x * .35, e[1] + d.y * .35, e[2] + d.z * .35 + .04], [e[0] + d.x * .75 + up.x * .2, e[1] + d.y * .7 + up.y * .22, e[2] + d.z * .7 + up.z * .26], [e[0] + d.x * .95 + up.x * .55, e[1] + d.y * .8 + up.y * .6, e[2] + d.z * .8 + up.z * .7]];
    cl.push(tubeGeo(pts, f => t.r * .74 * Math.pow(1 - f, .8) + .012, 12, 8, f => mix3(pal.clawA, pal.clawB, smooth(.2, 1, f)))); }
  const gC = K.merge(cl);
  // elbow fin
  const ef = newFin(), es = [], NE = 6; for (let k = 0; k < NE; k++) { const a = lerp(.9, -.5, k / (NE - 1)), len = (1.7 + 1.5 * Math.cos((a - .2) * 1.2)) * (k % 2 ? .85 : 1); es.push({ p: .1 * Math.cos(a), q: .35 * Math.sin(a), dp: Math.cos(a), dq: Math.sin(a), len, rb: .075, bend: -.12 }); }
  for (let k = 0; k < NE; k++) { finSpine(ef, es[k], 60 + k, .07); if (k < NE - 1) finWeb(ef, es[k], es[k + 1], 60 + k, .07, SAIL, .0, .26, 5, 6); }
  const gE = finGeoRigid(ef, new V3(0, -LU + .5, -.45), new V3(0, .45, -.9).normalize(), new V3(0, .9, .45).normalize(), false);
  D.legs = [];
  for (const [sl, sg, ph] of LEGS) {
    const R = new THREE.Group(); R.matrixAutoUpdate = false; K.scene.add(R);
    const mk = (g, m, par, x, y, z) => { const G = new THREE.Group(); G.position.set(x, y, z); par.add(G); const me = new THREE.Mesh(g, m); me.castShadow = me.receiveShadow = true; me.frustumCulled = false; G.add(me); return G; };
    const sm = sl === SH ? D.skinB : D.skinF, r = radius(sl), S = mk(gU, sm, R, .74 * r, -.52 * r, 0), E = mk(gL, sm, S, 0, -LU, 0), Wr = mk(gF, sm, E, 0, -LLo, 0);
    const c = new THREE.Mesh(gC, D.goldMat); c.castShadow = c.receiveShadow = true; c.frustumCulled = false; Wr.add(c);
    const f = new THREE.Mesh(gE, D.finMat); f.castShadow = f.receiveShadow = true; f.frustumCulled = false; S.add(f);
    D.legs.push({ R, S, E, Wr, s: sl, sg, ph, hind: sl > 50 });
  }
}
const _lm = new M4(), _ls = new M4();
function poseLegs(D, F) {
  const t = F.t, PG = K.arch && K.arch.pagoda;
  for (const g of D.legs) {
    frameAt(g.s, g.R.matrix); if (g.sg < 0) g.R.matrix.multiply(_ls.makeScale(-1, 1, 1)); g.R.matrixWorldNeedsUpdate = true;
    const c = t * 2.3 + g.ph, sw = Math.sin(c), s2 = Math.sin(c + 1.1), s3 = Math.sin(c + 2.);
    const room = clr[Math.min(NS - 1, Math.round(g.s / DS))], tuck = 1 - room;                // no room (threading the Sky Window): fold the legs back along the body
    g.S.rotation.set(lerp((g.hind ? 1.0 : .72) + .28 * sw, 1.45, tuck), .15 * s2 * room, lerp(.55 + .1 * s2, .14, tuck));         // trailing back and out, paddling
    g.E.rotation.set(lerp(-(g.hind ? 1.15 : 1.3) - .3 * s2, -.45, tuck), 0, -.15);
    g.Wr.rotation.set(.35 + .3 * s3, 0, .1);
    if (PG && PG.tiers && PG.tiers.length) {                                                   // coiled round the pagoda: reach for the nearest eave and hold on
      _a.copy(g.S.position).applyMatrix4(g.R.matrix); const dx = PG.x - _a.x, dz = PG.z - _a.z, dh = Math.hypot(dx, dz);
      if (dh < 20 && _a.y > PG.base - 2 && _a.y < PG.tiers[PG.tiers.length - 1].topY + 3) {
        let tb = PG.tiers[0], bd = 1e9; for (const tr of PG.tiers) { const d = Math.abs(tr.eaveY - (_a.y - 1.2)); if (d < bd) { bd = d; tb = tr; } }
        _b.set(PG.x - dx / dh * tb.rFlat, tb.eaveY + .5, PG.z - dz / dh * tb.rFlat).sub(_a); const d = _b.length(), w = smooth(10, 7.6, d);
        if (w > 0) { const L1 = LU, L2 = LLo + 1.9, dd = clamp(d, 2.6, L1 + L2 - .15), a1 = Math.acos(clamp((L1 * L1 + dd * dd - L2 * L2) / (2 * L1 * dd), -1, 1)), bend = PI - Math.acos(clamp((L1 * L1 + L2 * L2 - dd * dd) / (2 * L1 * L2), -1, 1));
          _b.multiplyScalar(1 / d).transformDirection(_lm.copy(g.R.matrix).invert());
          _q.setFromUnitVectors(_c.set(0, -1, 0), _b).multiply(_q2.setFromAxisAngle(_c.set(1, 0, 0), a1));
          g.S.quaternion.slerp(_q, w); g.E.rotation.x = lerp(g.E.rotation.x, -bend, w); g.E.rotation.z = lerp(-.15, 0, w); g.Wr.rotation.x = lerp(g.Wr.rotation.x, .75, w); } } }
    g.R.updateMatrixWorld(true);
  }
  // emitters for mist and drops (local to the spine frame at .w): 0-3 claws, 4-7 elbow fins, 8-9 cheek fans, 10-11 tail fan
  const E = D.uEm.value;
  D.legs.forEach((g, i) => { frameAt(g.s, _lm).invert(); E[i].copy(_fp.set(0, -1.9, .5).applyMatrix4(g.Wr.matrixWorld).applyMatrix4(_lm)); E[i].w = g.s; E[4 + i].copy(_fp.set(0, -LU + 1.2, -2.2).applyMatrix4(g.S.matrixWorld).applyMatrix4(_lm)); E[4 + i].w = g.s; });
  E[8].set(4.2, .2, -1.2, 0); E[9].set(-4.2, .2, -1.2, 0); E[10].set(0, 3.2, 0, L + 1.5); E[11].set(0, -3.2, 0, L + 1.5);
  { const q = hw([.62, .86, 8.35]); E[12].set(0, -1.2, hw([0, 0, 5.6])[2], 0); E[13].set(q[0], q[1], q[2], 0); E[14].set(-q[0], q[1], q[2], 0); }                              // mouth, nostrils
}

// ---------------------------------------------------------------- water and vapour: beads streaming off the wet body, mist off fins and claws, a curling wake
// Closed form. A particle shed by the body point at arc length s, `age` seconds ago, hangs where that point WAS — which is where the
// spine is now at s + speed * age (the body slides along its own track), so the trail needs no history.
function buildFx(D) {
  const rnd = K.rng(531), P = [], Q = [], V = [], put = (a, b, c, d, life, size, kind) => { P.push(a, b, c, d); Q.push(life, rnd() * 10, size, kind); V.push(rnd(), rnd(), rnd(), rnd()); };
  for (let i = 0; i < 1200; i++) { const s = Math.pow(rnd(), 1.2) * (L - 4), th = 1.5 * PI + (rnd() + rnd() - 1) * 2.2; put(s, th, radius(s), 0, .6 + .9 * rnd(), .02 + .035 * rnd(), 0); }                 // 0 water beads off the belly
  for (let i = 0; i < 210; i++) { const s = lerp(L - 34, L + 6, rnd()), th = rnd() * TAU; put(s, th, radius(Math.min(s, L)) + .5, 0, 2.2 + 2.4 * rnd(), 1.4 + 2.4 * rnd(), 1); }                           // 1 vapour wake
  for (let i = 0; i < 190; i++) { const e = (rnd() * 12) | 0; put(e, 0, 0, 0, .7 + 1.2 * rnd(), (e < 4 ? .3 : .45) + .5 * rnd(), 2); }                                                                     // 2 mist off claws and fins
  for (let i = 0; i < 160; i++) { const e = (rnd() * 4) | 0; put(e, 0, 0, 0, .5 + .7 * rnd(), .03 + .04 * rnd(), 3); }                                                                                    // 3 drops off the claws
  for (let i = 0; i < 46; i++) { const e = rnd() < .7 ? 12 : rnd() < .5 ? 13 : 14; put(e, 0, 0, 0, .5 + 1.1 * rnd(), .025 + .045 * rnd(), 4); }                                                              // 4 embers from the jaws and nostrils
  for (let i = 0; i < 360; i++) { const s = 4 + Math.pow(rnd(), 1.3) * (L - 10), th = PI / 2 + (rnd() - .5) * 1.1; put(s, th, radius(s) + .4, 0, 1.2 + 1.8 * rnd(), .025 + .035 * rnd(), 5); }              // 5 glowing motes off the spine
  for (let i = 0; i < 520; i++) { const s = Math.pow(rnd(), 1.1) * (L - 3), th = 1.5 * PI + (rnd() + rnd() - 1) * 1.5; put(s, th, radius(s) * .96, 0, .55 + .7 * rnd(), .1 + .16 * rnd(), 7); }                     // 7 sheets of water pouring off a body fresh out of the lake
  for (let i = 0; i < 130; i++) { const s = 25 + rnd() * (L - 10), th = rnd() * TAU; put(s, th, radius(Math.min(s, L)) + 1.5, 0, 2. + 2. * rnd(), .2 + .22 * rnd(), 6); }                                  // 6 leaves caught in the wake
  const g = new THREE.InstancedBufferGeometry(); attr(g, 'position', [-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3); g.setIndex([0, 1, 2, 0, 2, 3]);
  iattr(g, 'aP', P, 4); iattr(g, 'aQ', Q, 4); iattr(g, 'aV', V, 4); g.instanceCount = P.length / 4;
  D.uEm = { value: Array.from({ length: 16 }, () => new THREE.Vector4()) };
  const m = K.shaderMat({ transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms: Object.assign({ uEm: D.uEm }, UD),
    vertexShader: SPINE_GLSL + /* glsl */`
      attribute vec4 aP; attribute vec4 aQ; attribute vec4 aV; uniform vec4 uEm[16];
      varying vec4 vQ; varying vec3 vW; varying vec3 vR;
      void main(){
        float life = aQ.x, ph = (uTime + aQ.y) / life, age = fract(ph) * life, k = age / life, cyc = floor(ph), kind = aQ.w;
        vec3 h = kHash33(vec3(aV.x * 97. + cyc, aV.y * 61., aV.z * 43. + cyc * .37));
        float s0, sz = aQ.z, al = 0., spin = 0., drag = 1.; vec3 lp; vec3 P, X, Y, Z; vec2 str = vec2(1.);
        bool wet = kind < .5 || (kind > 2.5 && kind < 3.5) || kind > 6.5;
        if(kind < 1.5 || kind > 4.5){ float th = aP.y + (h.x - .5) * .8; s0 = aP.x + (h.y - .5) * 3.; lp = vec3(cos(th), sin(th), 0.) * aP.z; }
        else { vec4 e = uEm[int(aP.x + .5)]; lp = e.xyz + (h - .5) * (kind > 2.5 ? .5 : .9); s0 = e.w; }
        if(wet) drag = .82 + .14 * h.z; else if(kind > 3.5 && kind < 4.5) drag = .35 + .5 * h.z; else if(kind > 4.5 && kind < 5.5) drag = .05;
        dSpine(s0 + uDrg.x * age * drag, P, X, Y, Z);
        vec3 wp = P + X * lp.x + Y * lp.y + Z * lp.z, rad = normalize(X * lp.x + Y * lp.y + vec3(0., 1e-4, 0.));
        if(wet){ wp += rad * age * (.4 + 1.2 * h.x) + vec3(0., -4.9 * age * age, 0.) + (h - .5) * age * 1.2; al = smoothstep(0., .06, k) * pow(1. - k, 1.3); str = vec2(1., 1.6 + 3.5 * age);
          float we = dWet(s0);
          if(kind > 6.5){ al *= we * we * 1.4; str = vec2(1. + 2. * age, 5. + 14. * age); } else al *= .22 + .78 * we; }
        else if(kind < 1.5){ float an = aP.y + age * (1.1 + h.x) * (h.y > .5 ? 1. : -1.), rr = .3 + (1. + 1.4 * h.z) * age;      // curl round the track
          wp += (X * cos(an) + Y * sin(an)) * rr + vec3(0., .25 * age, 0.); sz *= .18 + 1.5 * sqrt(k); al = smoothstep(0., .3, k) * pow(1. - k, 1.5) * .26; }
        else if(kind < 2.5){ wp += (h - .5) * age * 1.6 + vec3(0., .3 * age, 0.); sz *= .3 + 1.9 * sqrt(k); al = smoothstep(0., .1, k) * pow(1. - k, 1.6) * .3; }
        else if(kind < 4.5){ wp += (h - .5) * age * (2. + 3. * h.x) + vec3(0., 1.1 * age + age * age, 0.); sz *= 1. - .6 * k;        // embers: flung out, rising, flickering, cooling
          al = smoothstep(0., .06, k) * pow(1. - k, 1.2) * (.55 + .45 * sin(uTime * 31. + h.x * 40.)) * uDrg.w; }
        else if(kind < 5.5){ wp += rad * (.2 + 1.5 * age * h.x) + vec3(0., .6 * age, 0.) + (h - .5) * age * .9;                       // motes: a shimmer of heat drifting up off the back
          al = smoothstep(0., .2, k) * smoothstep(1., .45, k) * (.45 + .55 * sin(uTime * 9. + h.y * 30.)) * .7; }
        else { float an = aP.y + age * (1.5 + h.x) * (h.y > .5 ? 1. : -1.), rr = (1. + 1.5 * h.z) * age * .8;                        // leaves: swept along the track, tumbling
          wp += (X * cos(an) + Y * sin(an)) * rr + vec3(0., -.3 * age * age, 0.); al = smoothstep(0., .1, k) * smoothstep(1., .8, k); spin = uTime * (3. + 4. * h.x) + h.y * 20.; }
        if(wp.y < .2) al = 0.;                                                                                                   // nothing of this under the lake
        if(al <= 0.) sz = 0.;
        vec4 mv = viewMatrix * vec4(wp, 1.); vec2 q = position.xy * sz * str;
        if(kind > 5.5){ float c = cos(spin), s = sin(spin); q.x *= .3 + .7 * abs(cos(spin * .63 + h.z * 6.)); q = vec2(q.x * c - q.y * s, q.x * s + q.y * c); }
        mv.xy += q;
        vW = wp; vQ = vec4(position.xy, kind, al); vR = h; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */`varying vec4 vQ; varying vec3 vW; varying vec3 vR;
      void main(){ float d = length(vQ.xy), kind = vQ.z; vec3 col; float a;
        if(kind < .5 || (kind > 2.5 && kind < 3.5)){ a = smoothstep(1., .35, d) * vQ.w; col = (uSkyCol * .9 + uSunCol * (.25 + 1.6 * pow(max(1. - d * 1.6, 0.), 3.))); }   // beads: sky-filled drops with a sun glint
        else if(kind < 2.5){ float n = texture2D(uNoiseTex, vQ.xy * .23 + vR.xy * 3.).r, n2 = texture2D(uNoiseTex, vQ.xy * .6 + vR.yx * 5.).a;
          a = smoothstep(1., .1, d) * smoothstep(.34, .8, n * .7 + n2 * .3 + (1. - d) * .3) * vQ.w; if(a < .004) discard;
          float sun = .5 + .5 * dot(normalize(vW - cameraPosition), uSunDir); col = mix(uSkyCol * 1.3 + .22, uSunCol * .36 + .1, .55 + .3 * (n - .5)) * (1. + .6 * sun * sun); }
        else if(kind < 5.5){ float core = max(1. - d, 0.), hot = kind < 4.5 ? .55 : .22;                                                                            // embers and motes: light, not matter
          col = mix(${v3(cfg.pal.spark)}, vec3(1., .95, .8), core * core) * (pow(core, 3.) * 5. + core * .5) * hot * vQ.w * (1. - kFogAmt(vW));
          gl_FragColor = vec4(col, 0.); return; }
        else if(kind > 6.5){ float n = texture2D(uNoiseTex, vec2(vQ.x * .35 + vR.x * 7., vQ.y * .12 + vR.y * 3.)).a;                                                    // a sheet of falling water: streaky, sky-filled
          a = smoothstep(1., .3, abs(vQ.x)) * (1. - vQ.y * vQ.y) * smoothstep(.3, .7, n) * vQ.w * .55; if(a < .004) discard;
          col = uSkyCol * 1.2 + .1 + uSunCol * (.12 + .5 * pow(n, 5.)); }
        else { vec2 q = vQ.xy; float sh = (1. - q.y * q.y) * (.5 + .12 * sin(q.y * 9.)) - abs(q.x); if(sh < 0.) discard;                                           // a leaf: pointed oval with a midrib
          col = mix(vec3(.62, .05, .015), vec3(.95, .42, .03), vR.x); col = mix(col, vec3(.9, .7, .08), step(.72, vR.y)); col *= .6 + .4 * smoothstep(0., .1, abs(q.x));
          col *= uSkyCol * .7 + uSunCol * (.2 + .25 * vR.z); a = vQ.w; }
        col = kFog(col, vW); gl_FragColor = vec4(col * a, a); }` });
  D.fx = new THREE.Mesh(g, m); D.fx.frustumCulled = false; D.fx.renderOrder = 20; K.scene.add(D.fx);
}

// ---------------------------------------------------------------- per-dragon init / update / exports
const D = {};
const api = { head: new V3(), headDir: new V3(0, 0, 1), mouth: { pos: new V3(), dir: new V3(0, 0, 1) }, eye: [new V3(), new V3()], claw: [new V3(), new V3(), new V3(), new V3()], tail: new V3(), length: L + 9, bodyLength: L, radius, breath: 0, wet: s => wetA[Math.min(NS - 1, Math.max(0, Math.round(s / DS)))],
  spine: (s, out = new V3()) => spineAt(s, out), frame: (s, m = new M4()) => frameAt(s, m) };
function init() {
  const F0 = K.film.frame(K.film.T.key); if (cfg.state(F0)) updateSpine(F0);
  D.uGlow = { value: new THREE.Vector4(0, -.8, 1.1, 0) }; D.uEye = { value: new THREE.Vector4(0, .3, 1, 0) };
  D.uWetH = { value: new THREE.Vector4() }; D.uWetF = { value: new THREE.Vector4() }; D.uWetB = { value: new THREE.Vector4() };
  bakeTextures(D); buildBody(D); buildCrest(D); buildHead(D); buildHeadScales(D); buildMane(D); buildLegs(D); buildFx(D);
  D.roots = [D.tube, D.scales, D.plates, D.crest, D.tailFan, D.headG, D.headScales, D.mane, D.mane2, D.whiskers, D.fx, ...D.legs.map(l => l.R)];
  for (const o of [D.scales, D.plates, D.headScales]) o.renderOrder = -2; D.tube.renderOrder = 2; D.skull.renderOrder = 1;
}
function update(F) {
  const Dg = cfg.state(F), vis = !!Dg && Dg.vis !== false; if (D.vis !== vis) { D.vis = vis; for (const o of D.roots) o.visible = vis; } if (!vis) return;
  updateSpine(F);
  const Kd = api, t = F.t; UD.uDrg.value.x = clamp(Dg.speed, 8, 60); const br = sat(Dg.breath || 0), aimW = SPa.aimW; UD.uDrg.value.w = Dg.under ? 0 : .2 + .8 * Math.max(Dg.jaw, Dg.roar, br); g3(SP.P, 0, Kd.head); g3(SP.Z, 0, Kd.headDir); spineAt(L, Kd.tail);
  // head: rigid on the first spine frame; the jaw swings on its hinge
  frameAt(0, D.headG.matrix); D.headG.matrixWorldNeedsUpdate = true;
  const jaw = Math.max(Dg.jaw, br * .95) * .62 + .02 + .015 * Math.sin(t * 9.) * Math.max(Dg.roar, br); D.jawG.rotation.x = jaw;   // breathing: jaws wide
  UD.uJaw.value.set(HINGE[1], HINGE[2], Math.sin(jaw), Math.cos(jaw));
  // the breath lights throat and chest from inside: red — a steady roaring orange; gold — white-gold with an electric flicker
  const flick = cfg.name === 'rival' ? .5 + .5 * K.noise2(t * 37, 5.5) + (K.hash(Math.floor(t * 26), 9) > .62 ? .55 : 0) : .86 + .14 * Math.sin(t * 19.) + .1 * K.noise2(t * 9, 2.5);
  D.uGlow.value.w = .1 + .3 * Dg.jaw + .55 * Dg.roar * (.8 + .2 * Math.sin(t * 13.)) + 1.7 * br * flick; UD.uFx.value.x = br * flick;
  const wi = s => wetA[Math.min(NS - 1, Math.round(s / DS))]; D.uWetH.value.x = wi(0); D.uWetF.value.x = wi(SF); D.uWetB.value.x = wi(SH);
  // eyes: the pupil widens with the roar; a blink of the lids and the nictitating membrane every few seconds
  const bl = (((t + 2.8 + cfg.ph) % 3.9) + 3.9) % 3.9; D.uEye.value.x = smooth(0, .12, bl) * (1 - smooth(.16, .38, bl)); D.uEye.value.y = .22 + .15 * Dg.roar; D.uEye.value.w = .12 * Dg.roar + .9 * smooth(.02, .1, bl) * (1 - smooth(.12, .22, bl));
  D.headG.updateMatrixWorld(true); poseLegs(D, F);
  Kd.mouth.pos.set(0, -.7 - 3.2 * Math.sin(jaw * .5), 3.4 + 3.8 * HK).applyMatrix4(D.headG.matrix); g3(SP.Y, 0, _a); Kd.mouth.dir.copy(Kd.headDir).multiplyScalar(Math.cos(jaw * .5)).addScaledVector(_a, -Math.sin(jaw * .5));
  if (aimW > 0) { _b.copy(Dg.aim).sub(Kd.mouth.pos).normalize(); Kd.mouth.dir.lerp(_b, aimW).normalize(); } Kd.breath = br;
  Kd.eye[0].set(EYE[0] + .3, EYE[1], EYE[2] + .35).applyMatrix4(D.headG.matrix); Kd.eye[1].set(-EYE[0] - .3, EYE[1], EYE[2] + .35).applyMatrix4(D.headG.matrix);
  D.legs.forEach((g, i) => Kd.claw[i].set(0, -1.9, .5).applyMatrix4(g.Wr.matrixWorld));
  // level of detail by apparent distance: fewer, wider mane strands; far away the individual scales and the particles are switched off
  let dn = 1e9; for (let s = 0; s <= L; s += 24) dn = Math.min(dn, spineAt(s, _a).distanceTo(F.cam.pos)); dn *= F.cam.fov / 44;
  const lodN = lerp(1, .6, smooth(22, 44, dn)), lodF = lerp(1, .5, smooth(55, 130, dn)) * lerp(1, .3, smooth(150, 300, dn)), lod = lodN * lodF, far = smooth(170, 260, dn);
  UD.uDrg.value.y = 1 / Math.sqrt(lodF); UD.uDrg.value.z = far;        // thinned first (fewer fragments), widened only once strands are sub-pixel
  D.mane.geometry.instanceCount = Math.ceil(D.mane.geometry.userData.n * lod); D.mane2.geometry.instanceCount = Math.ceil(D.mane2.geometry.userData.n * lod);
  D.scales.visible = D.headScales.visible = far < 1; D.fx.visible = dn < 320;
  // outside the sun's shadow box nothing needs to be drawn into the shadow map
  const e = K.env; let inBox = false; for (let s = 0; s <= L && !inBox; s += 24) { spineAt(s, _a).sub(e.shadowFocus); inBox = Math.max(Math.abs(_a.x), Math.abs(_a.y), Math.abs(_a.z)) < e.shadowSize * 1.5 + 30; }
  if (D.inBox !== inBox) { D.inBox = inBox; for (const o of D.roots) o.traverse(m => { if (m.isMesh) { if (m.userData.cast === undefined) m.userData.cast = m.castShadow; m.castShadow = inBox && m.userData.cast; } }); }
}
return { init, update, api, D };
}

// ============================================================================ the two dragons
const HERO = { name: 'hero', L: 146, girth: 1, sail: 1, tailFan: 1, fork: .45, tines: 0, wave: 1, coil: 5.2, coilAt: .5, ph: 0,
  pos: (t, o) => K.film.dragonPos(t, o), state: F => F.dragon, other: F => F.rival,
  pal: {
    scA: [.50, .012, .016], scB: [.80, .065, .02], scD: [.085, .004, .008], scBelly: [.80, .42, .10], film1: [.95, .40, .04], film2: [.62, .015, .2], film: [.4, .3], scRough: .1, scMetal: .22,
    edge: [1, .62, .16], pearl: [.92, .80, .58], pearlGlow: [.55, .36, .12],
    plA: [.66, .44, .17], plB: [.95, .82, .54], plEdge: [.55, .10, .03],
    sail: [[0, [.004, .13, .15]], [.35, [.01, .42, .40]], [.7, [.10, .68, .55]], [.9, [.95, .70, .25]], [1, [1, .95, .78]]], spineA: [.95, .58, .15], spineB: [1, .9, .68],
    skA: [.48, .012, .016], skB: [.78, .07, .02], skD: [.08, .004, .008], skBelly: [.84, .62, .30], skLip: [.035, .003, .005],
    antA: [.30, .13, .025], antB: [1, .88, .58], clawA: [.8, .45, .08], clawB: [1, .9, .64],
    irisA: [1, .82, .2], irisB: [.95, .40, .02], irisD: [.3, .05, 0], irisC: [.6, .9, .4],
    maneRoot: [1, .93, .70], maneMid: [.98, .62, .12], maneMid2: [.92, .26, .02], maneTip: [.55, .025, .01], maneInner: [.2, .07, .05],
    whA: [.85, .42, .06], whB: [1, .8, .42], whC: [1, .95, .8], breath: [1, .42, .04], spark: [1, .5, .08], orn: [1, .7, .22],
  } };
const RIVAL = { name: 'rival', head: 1, muzzle: 1.22, narrow: .16, L: 172, girth: .8, sail: 1.45, tailFan: 1.7, fork: .85, tines: 2, wave: 1.15, coil: 6.5, coilAt: .42, ph: 2.1,
  pos: (t, o) => K.film.rivalPos(t, o), state: F => K.film.rivalPos ? F.rival : null, other: F => F.dragon,
  pal: {
    scA: [.74, .38, .035], scB: [.88, .62, .2], scD: [.2, .08, .012], scBelly: [.95, .84, .58], film1: [1, .8, .4], film2: [.8, .3, .12], film: [.35, .4], scRough: .2, scMetal: .5,
    edge: [.14, .06, .012], pearl: [.85, .92, 1], pearlGlow: [.25, .5, .7],
    plA: [.7, .6, .42], plB: [.98, .95, .86], plEdge: [.35, .2, .05],
    sail: [[0, [.03, .1, .22]], [.35, [.15, .42, .68]], [.7, [.55, .78, .95]], [.9, [.95, .97, 1]], [1, [1, 1, 1]]], spineA: [.75, .78, .85], spineB: [1, 1, 1],
    skA: [.72, .38, .04], skB: [.88, .62, .22], skD: [.2, .08, .012], skBelly: [.97, .9, .7], skLip: [.09, .04, .008],
    antA: [.3, .2, .08], antB: [.97, .97, 1], clawA: [.6, .62, .7], clawB: [1, 1, 1],
    irisA: [.8, .96, 1], irisB: [.12, .5, .95], irisD: [0, .06, .3], irisC: [1, 1, 1],
    maneRoot: [.62, .66, .76], maneMid: [.9, .92, .97], maneMid2: [.97, .98, 1], maneTip: [1, 1, 1], maneInner: [.3, .34, .45],
    whA: [.7, .73, .8], whB: [.95, .96, 1], whC: [1, 1, 1], breath: [.2, .7, 1], spark: [.6, .85, 1], orn: [.9, .93, 1],
  } };
const hero = makeDragon(HERO), rival = makeDragon(RIVAL);
K.dragon = hero.api; K.rival = rival.api;
K.reg('dragon', {
  init() { hero.init(); try { rival.init(); rival.ok = true; } catch (e) { K.fail('dragon.rival.init', e); } if (K.debug) { K.debug.dragon = hero.D; K.debug.rival = rival.D; } },
  update(F) { hero.update(F); if (rival.ok) rival.update(F); }
});

})(window.K=window.K||{},window.THREE);
//# sourceURL=src/50_dragon.js

(function(K,THREE){'use strict';
// ============================================================================
// 60_fx — the fight: fire, golden lightning, the clash, the plunge, the storm collision, storm lightning,
// the sun shower and its rainbow, and the four point lights. Everything is a closed-form function of film time.
//
//   beams     two ray-marched volumes bent along a quadratic Bezier from the jaws (mouth.dir) to the aim:
//             the red loong's fire (white-gold core, rolling orange body, crimson tongues, smoke) and the
//             golden loong's torrent of light (blinding core, ionised mist, filaments)
//   balls     ray-marched spheres: the clash plasma (fire one side, lightning the other, rotating shells),
//             the detonation fireball; analytic shock shells
//   bolts     CPU-built fractal polylines -> one instanced ribbon buffer (breath arcs, clash arcs to the bodies,
//             storm lightning, the forked bolts of the collision), each with glow and after-image decay
//   glints    GPU particles (additive): sparks, star motes, spark rain, embers, droplets with rainbow glints
//   soft      GPU sprites (premultiplied, lit): smoke, steam, mist curtains, falling water sheets, spray, vapour ring
//   water     light under the surface while they fight below
//   rain      streaks at several depths, far veils, splashes / drips / warm-stone mist on a baked top-down
//             height map of the set, and a physically placed primary + secondary rainbow
//   lights    K.lights.pt[0..3]: fire, gold breath, clash / glow / impact, lightning
//
// Exports K.fx = { flash 0..1 (lightning this frame), bolt:{pos, amt}, heat:[{pos, r, amt}] (hot air, for a post shimmer),
//                 rainbow 0..1, height:{tex, box} (top-down height map of the set), addGlow(), parts, off (debug: { beams: 1, ... }) }.
// No depth texture exists in the main pass, so nothing here is soft-clipped against the scene: volumes are depth-tested hulls,
// sprites fade near the lens, and light under the lake is drawn as shallow domes that ride just above the water.
// ============================================================================
const V3 = THREE.Vector3, V4 = THREE.Vector4, V2 = THREE.Vector2;
const { sat, lerp, smooth, clamp } = K, W = K.world, R = K.renderer, TAU = Math.PI * 2;
const film = K.film, T = film.T, P = film.P;
const fx = K.fx = { flash: 0, bolt: { pos: new V3(), amt: 0 }, heat: [], height: null, parts: {} };
// everything is drawn premultiplied: (rgb, a) -> dst*(1-a) + rgb. Light is (rgb, 0).
const PRE = { transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor };
const parts = [];
const part = (name, p) => { p.name = name; parts.push(p); fx.parts[name] = p; return p; };
const h1 = (a, b = 0) => K.hash(a, b);                       // integer hash -> [0,1)
const _v = [new V3(), new V3(), new V3(), new V3(), new V3(), new V3()];
const uRes = { value: new V2(1920, 1080) };

// ---------------------------------------------------------------- per-frame state shared by all parts
const mkBeam = () => ({ bh: new Float32Array(12), on: false, A: new V3(), C: new V3(), E: new V3(), N: new V3(0, 1, 0), d0: new V3(0, 0, 1), L: 1, r0: .5, r1: 3, tail: 0, front: 0, pow: 0, b: 0, fixed: 0, flare: 0, trail: false, hist: Array.from({ length: 12 }, () => new V3()) });   // hist[k]: where the jaws were k*HDT s ago, relative to now · bh[k]: the breath then
const S = fx.S = {
  t: 0, beam: [mkBeam(), mkBeam()],
  ball: { on: false, c: new V3(), R: 1, pow: 0, axis: new V3(1, 0, 0), burst: 0 },
  mR: new V3(), mG: new V3(), dR: new V3(0, 0, 1), dG: new V3(0, 0, 1), hasD: false,
  tb: -1e3,                                                    // seconds since the collision
  light: [0, 1, 2, 3].map(() => ({ p: new V3(), c: new THREE.Color(), i: 0 })),
};
const heatPool = Array.from({ length: 6 }, () => ({ pos: new V3(), r: 1, amt: 0 })); let nHeat = 0;
const addHeat = (p, r, amt) => { if (nHeat >= heatPool.length) return; const h = heatPool[nHeat++]; h.pos.copy(p); h.r = r; h.amt = amt; fx.heat.push(h); };   // K.fx.heat: where the air is hot this frame (for a post-process shimmer)
const HDT = .25;                                            // spacing of the head-path history (s)
// breath of both dragons sampled once from the film's curves (20 Hz): cheap look-ups for "was it breathing a moment ago / will it be"
let BR = null;
function breathAt(key, t) { if (!BR) { BR = { r: new Float32Array(1802), g: new Float32Array(1802) }; const D = film.dragonState(0); for (let i = 0; i < 1802; i++) { BR.r[i] = film.dragonState(i * .05, D).breath; BR.g[i] = film.rivalState(i * .05, D).breath; } }
  const f = clamp(t * 20, 0, 1800), i = f | 0; return lerp(BR[key][i], BR[key][i + 1], f - i); }
function state(F) {
  const t = S.t = F.t, Rd = F.dragon, Gd = F.rival, hasD = S.hasD = !!(K.dragon && K.mod.dragon && K.mod.dragon.ok);
  if (hasD) { S.mR.copy(K.dragon.mouth.pos); S.dR.copy(K.dragon.mouth.dir); S.mG.copy(K.rival.mouth.pos); S.dG.copy(K.rival.mouth.dir); }
  else { S.mR.copy(Rd.p).addScaledVector(Rd.fwd, 7); S.dR.copy(Rd.fwd); S.mG.copy(Gd.p).addScaledVector(Gd.fwd, 7); S.dG.copy(Gd.fwd); }
  if (S.mG.lengthSq() < 1e-6) { S.mG.copy(Gd.p).addScaledVector(Gd.fwd, 7); S.dG.copy(Gd.fwd); }
  S.tb = t - T.impact;
  const clash = t > 46.5 && t < 52, charge = t > 66 && t < T.impact + .2;
  // the ball where the breaths meet
  const B = S.ball; B.on = false; B.pow = 0; B.burst = 0;
  if (clash) {
    const k = smooth(T.clash0 + .25, T.clash1, t), tau = t - T.clash1;
    B.c.copy(P.ring); B.R = 1.4 + 7.2 * Math.pow(k, .8) + .35 * Math.sin(t * 9.) * k; B.pow = smooth(T.clash0 + .12, T.clash0 + .5, t);
    if (tau > 0) { B.burst = tau; B.R *= 1 + 1.1 * (1 - Math.exp(-tau * 4.5)); B.pow *= Math.exp(-tau * 5.5); }
    B.on = B.pow > .02;
  } else if (charge) {
    B.c.copy(S.mR).add(S.mG).multiplyScalar(.5); const k = smooth(T.charge + .2, T.impact, t);
    B.R = 1.2 + 4.6 * k + .25 * Math.sin(t * 13.) * k; B.pow = smooth(T.charge + .15, T.charge + .45, t) * (1 - smooth(T.impact, T.impact + .08, t)); B.on = B.pow > .004;
  }
  B.axis.copy(S.mG).sub(S.mR).normalize();
  for (let i = 0; i < 2; i++) {
    const b = S.beam[i], D = i ? Gd : Rd, key = i ? 'g' : 'r', A = i ? S.mG : S.mR, d0 = i ? S.dG : S.dR, br = D.breath;
    b.on = false; b.b = br;
    { let any = br > .004; for (let k = 0; k < 12; k++) { b.bh[k] = breathAt(key, t - k * HDT); if (b.bh[k] > .004) any = true; } b.trail = any; }
    if (b.trail) { const hp = i ? film.rivalPos : film.dragonPos, now = hp(t, _v[4]); for (let k = 0; k < 12; k++) hp(t - k * HDT, b.hist[k]).sub(now); }
    if (!b.trail || D.vis === false) continue;        // the jet's geometry is laid out for as long as its sparks and smoke are in the air, so they never read a stale frame
    let pk = Math.max(br, 1e-3); for (let k = -5; k <= 5; k++) if (k) pk = Math.max(pk, breathAt(key, t + k * .2));
    const rising = breathAt(key, t + .04) >= breathAt(key, t - .04) - 1e-5, bn = sat(br / pk);
    b.d0.copy(d0); b.A.copy(A).addScaledVector(d0, -.9);
    const aimD = _v[0].copy(D.aim).sub(A).normalize();
    if (clash || charge) { const toC = _v[1].copy(B.c).sub(b.A), L = toC.length(); b.E.copy(B.c).addScaledVector(toC, -Math.min(.5, B.R * .45 / Math.max(L, 1e-3))); b.fixed = 1; b.flare = 1; }
    else { const L = lerp(9, 46, smooth(.3, .8, pk)); b.E.copy(d0).multiplyScalar(.86).addScaledVector(aimD, .14).normalize(); b.E.y += .05 + .3 * smooth(.4, .7, pk); b.E.normalize().multiplyScalar(L).add(b.A); b.fixed = 0; b.flare = 0; }   // a full breath in open air climbs: flame rises
    const ch = _v[1].copy(b.E).sub(b.A), L = ch.length(); if (L < .5) continue;
    b.C.copy(b.A).addScaledVector(d0, Math.min(.46 * L, 26));
    b.N.crossVectors(_v[2].copy(b.C).sub(b.A), ch); if (b.N.lengthSq() < 1e-4 * L * L) b.N.crossVectors(ch, Math.abs(ch.y) < .9 * L ? _v[3].set(0, 1, 0) : _v[3].set(1, 0, 0)); b.N.normalize();
    b.L = .5 * (b.C.distanceTo(b.A) + b.C.distanceTo(b.E) + L);
    b.r0 = i ? .42 : .5; b.r1 = i ? .75 + .05 * b.L : Math.max(2.3, .7 + .11 * b.L); b.pk = pk;
    if (rising) { b.front = sat(bn / .82); b.tail = 0; } else { b.front = 1; b.tail = 1 - sat(bn * 1.02); }
    b.pow = smooth(0, .12, bn) * (charge ? 1 - smooth(T.impact - .03, T.impact + .05, t) : 1); b.on = br > .004 && b.pow > .003 && b.front - b.tail > .01;
  }
  for (const l of S.light) l.i = 0;
  fx.heat.length = 0; nHeat = 0; nSeg = 0; nGlow = 0;
}

// ---------------------------------------------------------------- baked textures
const FSV = 'varying vec2 vUv; void main(){ vUv = position.xy*.5+.5; gl_Position = vec4(position.xy, 0., 1.); }';
const tex = fx.tex = {};
// 3D tileable noise 64³: r = perlin fbm (period 4), g = billows (inverted worley fbm 4/8/16), b = fine perlin fbm (period 8), a = filaments (worley edges F3-F1, period 5)
function bakeNoise3D() {
  const N = 64, rt = new THREE.WebGL3DRenderTarget(N, N, N, { type: THREE.UnsignedByteType, depthBuffer: false });
  const tx = rt.texture; tx.wrapS = tx.wrapT = tx.wrapR = THREE.RepeatWrapping; tx.minFilter = THREE.LinearFilter; tx.magFilter = THREE.LinearFilter; tx.generateMipmaps = false;
  const sc = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const m = new THREE.ShaderMaterial({ uniforms: { uZ: { value: 0 } }, depthTest: false, depthWrite: false, vertexShader: FSV, fragmentShader: K.GLSL.noise + /* glsl */`
    uniform float uZ; varying vec2 vUv;
    float hh(vec3 i, float per){ return kHash13(mod(i, per) + per*1.3); }
    float vn(vec3 p, float per){ p *= per; vec3 i = floor(p), f = fract(p); f = f*f*f*(f*(f*6.-15.)+10.);
      return mix(mix(mix(hh(i,per),hh(i+vec3(1,0,0),per),f.x), mix(hh(i+vec3(0,1,0),per),hh(i+vec3(1,1,0),per),f.x), f.y),
                 mix(mix(hh(i+vec3(0,0,1),per),hh(i+vec3(1,0,1),per),f.x), mix(hh(i+vec3(0,1,1),per),hh(i+vec3(1,1,1),per),f.x), f.y), f.z); }
    float pf(vec3 p, float per){ float s = 0., a = .5; for(int i=0;i<4;i++){ s += a*vn(p + float(i)*.371, per); per *= 2.; a *= .5; } return s/.9375; }
    vec3 wor(vec3 p, float per){ p *= per; vec3 i = floor(p), f = fract(p); vec3 d = vec3(9.);
      for(int z=-1;z<=1;z++) for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){ vec3 g = vec3(float(x),float(y),float(z)); vec3 r = g + kHash33(mod(i+g, per) + per*3.1) - f; float q = dot(r,r);
        if(q < d.x){ d.z = d.y; d.y = d.x; d.x = q; } else if(q < d.y){ d.z = d.y; d.y = q; } else if(q < d.z) d.z = q; }
      return sqrt(d); }
    void main(){ vec3 p = vec3(vUv, uZ);
      float r = clamp((pf(p, 4.) - .5)*1.9 + .5, 0., 1.);
      float g = 1. - clamp((wor(p,4.).x*.58 + wor(p,8.).x*.28 + wor(p,16.).x*.14)*1.45, 0., 1.);
      float b = clamp((pf(p + .5, 8.) - .5)*1.9 + .5, 0., 1.);
      vec3 w = wor(p + .25, 5.); float a = pow(clamp(1. - (w.z - w.x)*2.6, 0., 1.), 3.);
      gl_FragColor = vec4(r, g, b, a); }` });
  const q = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3)), m); q.frustumCulled = false; sc.add(q);
  const prev = R.getRenderTarget();
  for (let z = 0; z < N; z++) { m.uniforms.uZ.value = (z + .5) / N; R.setRenderTarget(rt, z); R.render(sc, cam); }
  R.setRenderTarget(prev); m.dispose(); return tx;
}

// ---------------------------------------------------------------- GLSL shared by the volumes
const VOL_GLSL = /* glsl */`
precision highp sampler3D;
uniform sampler3D tN3;
#define N3(p) textureLod(tN3, p, 0.)
// black-body-ish ramp for the red loong's fire: T 0 (smoke) .. 1+ (white-gold)
vec3 fireCol(float T){
  vec3 c = vec3(.50, .022, .008)*smoothstep(.03, .2, T);
  c = mix(c, vec3(1., .12, .014)*1.5, smoothstep(.16, .4, T));
  c = mix(c, vec3(1., .33, .045)*3.3, smoothstep(.36, .62, T));
  c = mix(c, vec3(1., .60, .17)*7.5, smoothstep(.58, .86, T));
  c = mix(c, vec3(1., .89, .64)*22., smoothstep(.84, 1.2, T));
  return c; }
float ign(vec2 p){ return fract(52.9829189*fract(dot(p, vec2(.06711056, .00583715)))); }
`;

// ---------------------------------------------------------------- 1 + 2. the breaths: ray-marched bent jets
const BEAM_VERT = /* glsl */`
uniform vec3 uA, uC, uE, uNrm; uniform vec4 uRad; uniform vec4 uRange;                       // uRange: tail, front, flare, swell of the radius at the far end
varying vec3 vW; varying float vU;
vec3 bez(float u){ float v = 1. - u; return v*v*uA + 2.*u*v*uC + u*u*uE; }
vec3 bezD(float u){ return 2.*(1. - u)*(uC - uA) + 2.*u*(uE - uC); }
float radius(float u){ return mix(uRad.x, uRad.y, pow(u, uRad.z))*(1. + uRange.w*smoothstep(.78, 1., u)); }
void main(){ float u = mix(uRange.x, min(uRange.y + .03, 1.), position.x);
  vec3 c = bez(u), Tn = normalize(bezD(u)), B = normalize(cross(uNrm, Tn)), N2 = cross(Tn, B);
  float rr = radius(u)*uRad.w*position.z;
  vec3 p = c + (B*cos(position.y) + N2*sin(position.y))*rr + Tn*(position.x < .001 ? -.6 : position.x > .999 ? radius(u)*.9 : 0.);
  vW = p; vU = u; gl_Position = projectionMatrix*viewMatrix*vec4(p, 1.); }`;
const beamFrag = (steps, field) => VOL_GLSL + /* glsl */`
uniform vec3 uA, uC, uE, uNrm; uniform vec4 uRad; uniform vec4 uRange; uniform vec4 uP;   // uRange: tail, front, flare, 0 · uP: power, length, seed, breath
varying vec3 vW; varying float vU;
vec3 bez(float u){ float v = 1. - u; return v*v*uA + 2.*u*v*uC + u*u*uE; }
vec3 bezD(float u){ return 2.*(1. - u)*(uC - uA) + 2.*u*(uE - uC); }
float radius(float u){ return mix(uRad.x, uRad.y, pow(u, uRad.z))*(1. + uRange.w*smoothstep(.78, 1., u)); }
float closestU(vec3 p, float u){ vec3 d2 = 2.*(uA - 2.*uC + uE);
  for(int i=0;i<2;i++){ vec3 d1 = bezD(u), q = bez(u) - p; float g = dot(d1, d1); u = clamp(u - dot(q, d1)/max(g + dot(q, d2), .35*g), 0., 1.); } return u; }
${field}
void main(){
  vec3 ro = cameraPosition, rd = normalize(vW - ro); float t = length(vW - ro), u = vU, tt = uTime;
  float jit = ign(gl_FragCoord.xy + fract(tt*7.31)*61.);
  vec3 col = vec3(0.); float Tr = 1.; float h = max(.05, radius(u)*STEPK); t += h*jit;
  for(int i=0;i<${steps};i++){
    vec3 p = ro + rd*t; u = closestU(p, u);
    vec3 c = bez(u), Tn = normalize(bezD(u)), B = normalize(cross(uNrm, Tn)), N2 = cross(Tn, B), q = p - c;
    float Rl = radius(u), r = length(q), rn = r/Rl;
    if(rn > uRad.w*1.03){ if(i > 1) break; }
    else { vec3 e; float s; field(vec3(dot(q, B), dot(q, N2), dot(q, Tn)), u, Rl, rn, tt, e, s);
      float a = 1. - exp(-s*h); col += Tr*e*h; Tr *= 1. - a; if(Tr < .015) break; }
    h = max(.05, Rl*STEPK); t += h; }
  float fg = kFogAmt(vW); col *= 1. - fg*.85;
  gl_FragColor = vec4(col*uP.x, (1. - Tr)*min(uP.x*1.5, 1.)); }`;
// fire: a pressurised jet — streaked and narrow at the jaws, breaking into rolling billows and curling tongues; cools outward and downstream
const FIRE_FIELD = /* glsl */`
#define STEPK .11
void field(vec3 l, float u, float Rl, float rn, float tt, out vec3 e, out float s){
  float a = u*uP.y, sc = 1./mix(1., Rl, .7), uu = (u - uRange.x)/max(uRange.y - uRange.x, 1e-3);
  vec2 xy = l.xy*sc;
  float fq = uP.w;
  vec4 n1 = N3(vec3(xy*.16*fq, a*.028*fq - tt*1.1) + uP.z);                                 // big rolling billows carried down the jet
  vec3 wv = (n1.rgb - .5);
  vec4 n2 = N3(vec3(xy*.5*fq, a*.07*fq - tt*2.6) + wv*.3 + uP.z*1.7);                          // tongues, warped by the billows (curl)
  vec4 n3 = N3(vec3(xy*1.9*fq, a*.15*fq - tt*6.5) + wv*.3 + .31);                                 // fine streaks drawn out along the flow
  float grow = smoothstep(0., .4, u);
  float turb = n1.g*.52 + n2.g*.36 + n3.b*.12;
  float shape = 1. - rn*rn*mix(1.7, 1., grow);
  float d = shape + (turb - .47)*mix(.5, 3., grow) + (n3.r - .5)*.3;
  d -= smoothstep(.45, 1., uu)*(1.25 - turb)*2.*(1. - uRange.z);                           // the front breaks up into separate tongues
  d -= uRange.z*smoothstep(.93, 1., u)*1.5;
  d -= (1. - smoothstep(0., .1, uu))*step(.001, uRange.x)*2.5;                             // a jet that has been shut off: its tail tears away
  d -= (1. - smoothstep(-1.2, 0., l.z))*3.*step(u, .001);
  float dens = smoothstep(0., .5, d);
  float hot = mix(1.25, .6, smoothstep(.0, .85, u)) + uRange.z*smoothstep(.72, 1., u)*.5;  // white-hot at the jaws; brightens again where it is rammed into the clash
  float temp = clamp(d, 0., 1.5)*hot*(.42 + .8*exp(-rn*rn*mix(5., 2.6, grow)))*(.72 + .56*n3.b);
  temp *= 1. - .5*smoothstep(.55, 1., uu)*(1. - uRange.z);
  float sig = dens*1.7/pow(Rl, .55);                                                        // optically thick: you see the hot skin of the billows, not a washed-out sum
  float smoke = smoothstep(-.3, .1, d)*(1. - smoothstep(.03, .26, temp))*smoothstep(.2, .6, u)*(1. - .7*uRange.z*smoothstep(.6, .9, u))*smoothstep(.2, .9, n2.r)*.8;   // sooty rind between the tongues
  e = fireCol(temp)*sig + vec3(.05, .036, .03)*smoke*.45*(uSunCol*.3 + uSkyCol);
  s = sig*.8 + smoke*.45; }`;
// golden breath: a blinding core, a sheath of filaments (lightning seen in depth) and ionised mist coiling round it
const GOLD_FIELD = /* glsl */`
#define STEPK .125
void field(vec3 l, float u, float Rl, float rn, float tt, out vec3 e, out float s){
  float a = u*uP.y, sc = 1./mix(1., Rl, .6), uu = (u - uRange.x)/max(uRange.y - uRange.x, 1e-3);
  float an = a*.16 - tt*2.2 + rn*1.3; float ca = cos(an), sa = sin(an); vec2 xy = vec2(ca*l.x - sa*l.y, sa*l.x + ca*l.y)*sc;   // the sheath coils
  vec4 n1 = N3(vec3(xy*.17, a*.03 - tt*1.1) + uP.z);
  vec4 n2 = N3(vec3(xy*.42, a*.06 - tt*3.4) + (n1.rgb - .5)*.2 + uP.z*2.3);
  vec4 n3 = N3(vec3(l.xy*sc*1.1, a*.17 - tt*8.) + .57);
  float env = smoothstep(0., .06, uu)*(1. - smoothstep(.86, 1., uu)*(1. - uRange.z))*smoothstep(-1., 0., l.z + step(.001, u));
  vec2 wob = (n1.rb - .5)*.55*smoothstep(0., .3, u);                                         // the core wanders inside its sheath
  float rc = length(l.xy/Rl - wob);
  float core = exp(-rc*rc*mix(60., 130., smoothstep(0., .5, u)))*(.7 + .6*n3.b)*(1. - .8*uRange.z*smoothstep(.82, 1., u));
  float sheath = exp(-rn*rn*2.6);
  float fil = pow(n2.a, 2.2)*2.2 + pow(n3.a, 2.6)*1.3;                                       // crackling filaments (seen in depth)
  float mist = smoothstep(.5, .9, n1.g*.6 + n2.r*.5 + (1. - rn)*.15)*(1. - smoothstep(.7, 1.45, rn));
  float pulse = .8 + .2*sin(tt*31. + a*.4);
  e = vec3(1., .93, .72)*110.*core*pulse/pow(Rl, .5)
    + mix(vec3(1., .74, .26), vec3(1., .93, .7), sheath)*4.2*sheath*fil
    + mix(vec3(1., .80, .42), vec3(.55, .66, 1.), smoothstep(.45, 1.2, rn))*.55*mist*(.35 + sheath)
    + vec3(1., .8, .4)*.08*sheath*sheath*sheath;
  e *= env; s = (mist*.1 + core*.6)*env; }`;
function tubeGeo(NU, NS) {
  const pos = [], idx = [];
  for (let i = 0; i <= NU; i++) for (let j = 0; j < NS; j++) pos.push(i / NU, j / NS * TAU, 1);
  const c0 = pos.length / 3; pos.push(0, 0, 0); const c1 = c0 + 1; pos.push(1, 0, 0);
  for (let i = 0; i < NU; i++) for (let j = 0; j < NS; j++) { const a = i * NS + j, b = i * NS + (j + 1) % NS, c = a + NS, d = b + NS; idx.push(a, b, c, b, d, c); }
  for (let j = 0; j < NS; j++) { idx.push(c0, (j + 1) % NS, j); idx.push(c1, NU * NS + j, NU * NS + (j + 1) % NS); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); return g;
}
part('beams', {
  init() {
    tex.n3 = bakeNoise3D();
    const g = tubeGeo(40, 12);
    this.m = [0, 1].map(i => {
      const u = { tN3: { value: tex.n3 }, uA: { value: new V3() }, uC: { value: new V3() }, uE: { value: new V3() }, uNrm: { value: new V3(0, 1, 0) }, uRad: { value: new V4(.5, 3, .8, 1.75) }, uRange: { value: new V4(0, 1, 0, 0) }, uP: { value: new V4(1, 30, i * 3.7, 1) } };
      const mat = K.shaderMat(Object.assign({ uniforms: u, vertexShader: BEAM_VERT, fragmentShader: beamFrag(i ? 34 : 42, i ? GOLD_FIELD : FIRE_FIELD) }, PRE, { side: THREE.FrontSide }));
      // front faces of the hull only, depth-tested: pillars and bodies in front hide the jet; the march starts at the hull and runs through it
      const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 30 + i; mesh.visible = false; K.scene.add(mesh); return mesh;
    });
  },
  update(F) {
    for (let i = 0; i < 2; i++) { const b = S.beam[i], m = this.m[i]; m.visible = b.on; if (!b.on) continue;
      const u = m.material.uniforms; u.uA.value.copy(b.A); u.uC.value.copy(b.C); u.uE.value.copy(b.E); u.uNrm.value.copy(b.N);
      u.uRad.value.set(b.r0, b.r1, i ? .8 : .72, i ? 1.6 : 1.8); u.uRange.value.set(b.tail, b.front, b.flare, b.flare * (i ? .25 : 1.1)); u.uP.value.set(b.pow, b.L, i * 3.7 + .13, Math.pow(clamp(46 / b.L, 1, 4), .55));
      // light: a third of the way down the jet
      const l = S.light[i], uu = lerp(b.tail, b.front, .45), v = 1 - uu; l.p.copy(b.A).multiplyScalar(v * v).addScaledVector(b.C, 2 * uu * v).addScaledVector(b.E, uu * uu);
      const fl = .82 + .18 * Math.sin(F.t * 23 + i * 2) * Math.sin(F.t * 37.3 + 1) + .1 * (K.noise2(F.t * 9, 5 + i) - .5);
      if (i) l.c.setRGB(1, .86, .55); else l.c.setRGB(1, .5, .16);
      l.i = b.pow * fl * (4 + 9 * b.L) * Math.min(1, b.pk * 1.2) * (b.front - b.tail) * (i ? 1.1 : 1);
      addHeat(l.p, b.r1 * 2.2, b.pow * (i ? .3 : 1));
    }
  }
});

// ---------------------------------------------------------------- 3 + 5. spheres: the clash plasma, the detonation fireball, shock shells
const SPH_VERT = /* glsl */`uniform vec4 uCen; varying vec3 vW; void main(){ vW = position*uCen.w + uCen.xyz; gl_Position = projectionMatrix*viewMatrix*vec4(vW, 1.); }`;
const sphFrag = (steps, field) => VOL_GLSL + /* glsl */`
uniform vec4 uCen; uniform vec4 uB; uniform vec3 uAxis; uniform mat3 uRot[3]; varying vec3 vW;
${field}
void main(){
  vec3 ro = cameraPosition, rd = normalize(vW - ro), oc = ro - uCen.xyz; float b = dot(oc, rd), c = dot(oc, oc) - uCen.w*uCen.w, h = b*b - c; if(h < 0.) discard;
  h = sqrt(h); float t0 = max(-b - h, 0.), t1 = -b + h; if(t1 <= t0) discard;
  float dt = (t1 - t0)/${steps}., t = t0 + dt*ign(gl_FragCoord.xy + fract(uTime*5.3)*47.);
  vec3 col = vec3(0.); float Tr = 1.;
  for(int i=0;i<${steps};i++){ vec3 e; float s; field(ro + rd*t - uCen.xyz, e, s); col += Tr*e*dt; Tr *= exp(-s*dt); if(Tr < .015) break; t += dt; }
  col *= 1. - kFogAmt(uCen.xyz)*.85;
  gl_FragColor = vec4(col, 1. - Tr); }`;
// plasma where the breaths meet: white-gold heart, three shells turning on different axes — flame on the red loong's side, filaments on the golden one's
const BALL_FIELD = /* glsl */`
void field(vec3 q, out vec3 e, out float s){
  float Rb = uB.x; vec3 x = q/Rb; float r = length(x); vec3 dir = x/max(r, 1e-3);
  vec4 nA = N3(uRot[0]*x*.13 + uB.w);
  float sd = smoothstep(-.35, .35, dot(dir, uAxis) + (nA.r - .5)*1.5 + (nA.b - .5)*.6);     // 0 fire side .. 1 lightning side; the border swirls
  float core = exp(-r*r*42.);
  e = vec3(1., .94, .78)*42.*core*(.8 + .4*nA.b);
  float occ = core*2.;
  for(int k=0;k<3;k++){ float fk = float(k), rk = .36 + .28*fk; vec3 xk = uRot[k]*x;
    vec4 n = N3(xk*(.2 + .05*fk) + (nA.rgb - .5)*.14 + fk*.37);
    vec4 nf = N3(xk*(.6 + .1*fk) + (n.rgb - .5)*.12 + fk*.71);
    float sh = exp(-pow((r - rk - (n.r - .5)*.2)/(.07 + .03*fk), 2.));
    float fire = smoothstep(.3, .72, n.g*.7 + nf.g*.45);
    float arc = pow(n.a, 3.)*9. + pow(nf.a, 4.)*9.;
    vec3 cf = fireCol(.28 + .7*fire*(1. - .22*fk) + .25*nf.b*fire)*(fire*1.1 + .05);
    vec3 cg = mix(vec3(1., .62, .16), vec3(1., .95, .8), smoothstep(.3, 2.5, arc))*(arc*2.6 + .035) + vec3(.25, .35, 1.)*.05*n.b;
    e += mix(cf, cg, sd)*sh; occ += sh*mix(fire*1.4, .1 + arc*.15, sd); }
  float co = exp(-max(r - 1., 0.)*3.)*smoothstep(.72, 1.05, r)*smoothstep(.3, .7, nA.g + .2)*(1. - smoothstep(1.3, 1.6, r));   // ragged corona
  e += mix(vec3(1., .3, .04)*.6, vec3(1., .82, .5)*.35, sd)*co;
  e *= uB.y*2.4/pow(Rb, .9); s = occ*2.4/Rb*uB.y; }`;
// the collision: a boiling ball of gold and crimson that swells, cools and tears into smoke. uB = (radius, age, heat, seed)
const BOOM_FIELD = /* glsl */`
void field(vec3 q, out vec3 e, out float s){
  float Rf = uB.x, tau = uB.y; vec3 x = q/Rf; float r = length(x); vec3 dir = x/max(r, 1e-3);
  vec4 n1 = N3(x*.19 - dir*tau*.035 + uB.w);
  vec4 n2 = N3(x*.52 - dir*tau*.06 + (n1.rgb - .5)*.2 + uB.w*1.9);
  vec4 n3 = N3(x*1.5 - dir*tau*.09 + (n1.rgb - .5)*.25);
  float turb = n1.g*.52 + n2.g*.34 + n3.b*.14;
  float d = (1. - r*r) + (turb - .5)*(1.5 + tau*.5) - smoothstep(.5, 3.6, tau)*1.5;
  float dens = smoothstep(0., .45, d);
  float temp = clamp(d, 0., 1.5)*uB.z*(.5 + .9*exp(-r*r*2.2))*(.7 + .6*n3.b);
  vec3 c = fireCol(temp);
  c += vec3(1., .78, .3)*pow(n2.a, 2.)*9.*uB.z*smoothstep(.2, .6, temp);                    // veins of gold through the crimson
  float sig = dens*5.5/Rf;
  float smoke = dens*(1. - smoothstep(.04, .3, temp));
  e = c*sig + vec3(.07, .055, .05)*smoke*3./Rf*(uSunCol*.3 + uSkyCol*1.2);
  s = sig*.8*smoothstep(.0, .2, temp) + smoke*3.2/Rf*(1. - smoothstep(2.5, 5., tau)); }`;
const SHELL_FRAG = VOL_GLSL + /* glsl */`
uniform vec4 uCen; uniform vec4 uSh; uniform vec3 uCol; varying vec3 vW;      // uCen: xyz, outer radius · uSh: shell radius, width, intensity, seed
float chord(vec3 oc, vec3 rd, float rad){ float b = dot(oc, rd), h = b*b - dot(oc, oc) + rad*rad; if(h <= 0.) return 0.; h = sqrt(h); return max(-b + h, 0.) - max(-b - h, 0.); }
void main(){ vec3 ro = cameraPosition, rd = normalize(vW - ro), oc = ro - uCen.xyz; float Rs = uSh.x, w = uSh.y;
  float L = chord(oc, rd, Rs + w*.5) - chord(oc, rd, max(Rs - w*.5, 0.));
  float I = L/(2.*sqrt(2.*Rs*w)); I = I*I*(.4 + .6*I);                                       // limb-brightened: reads as a thin expanding bubble
  vec3 cp = oc - rd*dot(oc, rd); vec3 dir = normalize(cp + rd*.001);
  float n = N3(dir*.45 + uSh.w).r, n2 = N3(dir*1.3 + uSh.w*2.).g; I *= smoothstep(.3, .85, n*.75 + n2*.5)*1.9;
  gl_FragColor = vec4(uCol*I*uSh.z*(1. - kFogAmt(uCen.xyz)*.8), 0.); }`;
const NSHELL = 5;
part('balls', {
  init() {
    const g = new THREE.IcosahedronGeometry(1, 3), rot = () => ({ value: [new THREE.Matrix3(), new THREE.Matrix3(), new THREE.Matrix3()] });
    const mk = (frag, o = {}) => { const u = Object.assign({ tN3: { value: tex.n3 }, uCen: { value: new V4(0, 0, 0, 1) }, uB: { value: new V4(1, 1, 0, 0) }, uAxis: { value: new V3(1, 0, 0) }, uRot: rot() }, o.uniforms || {});
      const mat = K.shaderMat(Object.assign({ uniforms: u, vertexShader: SPH_VERT, fragmentShader: frag }, PRE, { side: o.side || THREE.FrontSide }));
      const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.visible = false; m.renderOrder = o.ro || 34; K.scene.add(m); return m; };
    this.ball = mk(sphFrag(28, BALL_FIELD));
    this.boom = mk(sphFrag(44, BOOM_FIELD), { ro: 33 });
    this.shells = []; for (let i = 0; i < NSHELL; i++) this.shells.push(mk(SHELL_FRAG, { side: THREE.BackSide, ro: 35, uniforms: { uSh: { value: new V4(1, 1, 0, i * .37) }, uCol: { value: new THREE.Color(1, 1, 1) } } }));
    this.m4 = new THREE.Matrix4(); this.eu = new THREE.Euler();
  },
  rot(u, t, w) { const R3 = u.uRot.value, m4 = this.m4, e = this.eu; e.set(t * .9 * w, t * 1.3 * w, .3); R3[0].setFromMatrix4(m4.makeRotationFromEuler(e)); e.set(1.1 - t * 1.7 * w, .4, t * 1.1 * w); R3[1].setFromMatrix4(m4.makeRotationFromEuler(e)); e.set(t * .6 * w, 2.2 + t * .8 * w, -t * 1.9 * w); R3[2].setFromMatrix4(m4.makeRotationFromEuler(e)); },
  shell(k, c, Rs, w, I, r, g, b) { const m = this.shells[k]; if (!(I > .003) || k >= NSHELL) return; m.visible = true; const u = m.material.uniforms; u.uCen.value.set(c.x, c.y, c.z, Rs + w * .5 + .1); u.uSh.value.x = Rs; u.uSh.value.y = w; u.uSh.value.z = I; u.uCol.value.setRGB(r, g, b); },
  update(F) {
    const t = F.t, B = S.ball, tb = S.tb, L = S.light[2];
    for (const m of this.shells) m.visible = false;
    // ---- the clash ball (also the knot of light between the jaws during the last charge)
    this.ball.visible = B.on;
    if (B.on) { const u = this.ball.material.uniforms; u.uCen.value.set(B.c.x, B.c.y, B.c.z, B.R * 1.6); u.uB.value.set(B.R, B.pow, B.burst, .37); u.uAxis.value.copy(B.axis); this.rot(u, t, 1);
      L.p.copy(B.c); L.c.setRGB(1, .82, .56); L.i = B.pow * (1500 + 1500 * B.R) * (.85 + .15 * Math.sin(t * 29) * Math.sin(t * 17.7));
      addHeat(B.c, B.R * 3, B.pow); }
    // shock rings off the clash: one every .6 s while the breaths grind, a bigger one when it bursts
    if (t > T.clash0 && t < T.clash1 + 2.2) { let k = 0;
      for (let j = 0; j < 6; j++) { const tj = T.clash0 + .55 + j * .6, a = t - tj; if (a < 0 || a > 1.5 || tj > T.clash1 - .2) continue; this.shell(k++, P.ring, 6 + 70 * (1 - Math.exp(-a * 1.7)), 5 + 14 * a, .3 * Math.exp(-a * 2.6) * smooth(0, .06, a), 1, .86, .6); }
      const a = t - T.clash1; if (a > 0) this.shell(k++, P.ring, 10 + 150 * (1 - Math.exp(-a * 1.5)), 6 + 20 * a, .42 * Math.exp(-a * 1.9), 1, .9, .72); }
    // ---- the collision
    const on = tb > -.02 && tb < 6.5; this.boom.visible = on;
    if (on) { const tau = Math.max(tb, 0), u = this.boom.material.uniforms, Rf = 5 + 38 * (1 - Math.exp(-tau * 1.9)) + 4.5 * tau;
      u.uCen.value.set(P.impact.x, P.impact.y + 2.2 * tau * tau, P.impact.z, Rf * 1.45); u.uB.value.set(Rf, tau, 1.75 * Math.exp(-tau * .62) + .1, 1.7);
      this.shell(0, P.impact, 12 + 520 * (1 - Math.exp(-tau * 1.25)), 4 + 16 * tau, 2.2 * Math.exp(-tau * 1.7), .86, .92, 1);              // the fast shock
      this.shell(1, P.impact, 8 + 190 * (1 - Math.exp(-tau * .95)), 5 + 12 * tau, 1.3 * Math.exp(-tau * 1.5), 1, .78, .42);                 // a slower golden one
      this.shell(2, P.impact, 6 + 90 * (1 - Math.exp(-Math.max(tau - .35, 0) * 1.1)), 4 + 9 * tau, .9 * Math.exp(-tau * 1.3) * smooth(.35, .5, tau), 1, .42, .2);
      L.p.set(P.impact.x, P.impact.y - 6, P.impact.z); L.c.setRGB(1, .72, .42); L.i = (260000 * Math.exp(-tau * 2.4) + 42000 * Math.exp(-tau * .7)) * smooth(-.02, .03, tb); }
  }
});

// ---------------------------------------------------------------- bolts: fractal polylines built on the CPU -> one instanced ribbon buffer
const MAXSEG = 7000, boltArr = new Float32Array(MAXSEG * 16); let nSeg = 0;
const pathPool = [0, 1, 2, 3].map(() => new Float32Array(129 * 3));
const _ba = new V3(), _bb = new V3(), _bd = new V3();
function mkPath(seed, A, B, lv, disp, rough, p) { const N = 1 << lv; p[0] = A.x; p[1] = A.y; p[2] = A.z; p[N * 3] = B.x; p[N * 3 + 1] = B.y; p[N * 3 + 2] = B.z; let amp = A.distanceTo(B) * disp;
  for (let st = N; st > 1; st >>= 1) { const hf = st >> 1; for (let i = hf; i < N; i += st) { const a = (i - hf) * 3, b = (i + hf) * 3, m = i * 3; for (let c = 0; c < 3; c++) p[m + c] = .5 * (p[a + c] + p[b + c]) + (h1(seed * 131 + i, c + 11) - .5) * 2 * amp; } amp *= rough; } return N; }
// o: { lv, disp, rough, w (m), I, col (0 gold · 1 blue-white · 2 fire · 3 violet), taper, br, brLen, grav }
function addBolt(seed, A, B, o, depth = 0) {
  const p = pathPool[depth], N = mkPath(seed, A, B, o.lv, o.disp, o.rough || .52, p), tp = o.taper || 0, a = boltArr;
  for (let k = 0; k < N && nSeg < MAXSEG; k++) { const q = nSeg++ * 16, i0 = Math.max(k - 1, 0) * 3, i1 = k * 3, i2 = (k + 1) * 3, i3 = Math.min(k + 2, N) * 3, f = (k + .5) / N, wk = 1 - tp * f;
    a[q] = p[i0]; a[q + 1] = p[i0 + 1]; a[q + 2] = p[i0 + 2]; a[q + 3] = o.w * (.35 + .65 * wk);
    a[q + 4] = p[i1]; a[q + 5] = p[i1 + 1]; a[q + 6] = p[i1 + 2]; a[q + 7] = o.I * wk * wk;
    a[q + 8] = p[i2]; a[q + 9] = p[i2 + 1]; a[q + 10] = p[i2 + 2]; a[q + 11] = o.col || 0;
    a[q + 12] = p[i3]; a[q + 13] = p[i3 + 1]; a[q + 14] = p[i3 + 2]; a[q + 15] = o.glow == null ? 1 : o.glow; }
  if (o.br && depth < 3) { const len = A.distanceTo(B);
    for (let j = 0; j < o.br; j++) { const i = Math.min(N - 1, Math.max(1, Math.floor(N * (.12 + .76 * h1(seed * 17 + j, 3))))), s = _ba.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]).clone();
      const d = _bd.set(p[i * 3 + 3] - p[i * 3 - 3], p[i * 3 + 4] - p[i * 3 - 2], p[i * 3 + 5] - p[i * 3 - 1]).normalize();
      d.x += (h1(seed * 29 + j, 5) - .5) * 1.7; d.y += (h1(seed * 29 + j, 6) - .5) * 1.7 - (o.grav || 0); d.z += (h1(seed * 29 + j, 7) - .5) * 1.7; d.normalize();
      const e = s.clone().addScaledVector(d, len * (o.brLen || .3) * (.45 + .9 * h1(seed * 31 + j, 8)) * (1 - .5 * i / N));
      addBolt(seed * 7 + j * 13 + 5, s, e, { lv: Math.max(2, o.lv - 1 - depth), disp: o.disp * 1.25, rough: o.rough, w: o.w * .6, I: o.I * .42, col: o.col, taper: 1, br: depth < 1 ? Math.min(2, o.br) : 0, brLen: .45, grav: o.grav, glow: o.glow }, depth + 1); } }
}
part('bolts', {
  init() {
    const g = new THREE.InstancedBufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0], 3)); g.setIndex([0, 1, 2, 0, 2, 3]);
    const ib = this.ib = new THREE.InstancedInterleavedBuffer(boltArr, 16); ib.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < 4; i++) g.setAttribute('a' + i, new THREE.InterleavedBufferAttribute(ib, 4, i * 4));
    const m = K.shaderMat(Object.assign({ uniforms: { uRes }, vertexShader: /* glsl */`
      attribute vec4 a0, a1, a2, a3; uniform vec2 uRes; varying vec3 vC; varying vec3 vP;
      vec2 scr(vec4 c){ return c.xy/max(c.w, .05)*uRes*.5; }
      void main(){ mat4 PV = projectionMatrix*viewMatrix; vec4 c0 = PV*vec4(a0.xyz, 1.), c1 = PV*vec4(a1.xyz, 1.), c2 = PV*vec4(a2.xyz, 1.), c3 = PV*vec4(a3.xyz, 1.);
        float e = position.x; vec4 cc = mix(c1, c2, e);
        vec2 dA = scr(c2) - scr(c0), dB = scr(c3) - scr(c1), d = normalize(mix(dA, dB, e) + 1e-4), n = vec2(-d.y, d.x);
        float px = min(a0.w*projectionMatrix[1][1]*uRes.y*.5/max(cc.w, .05), 1.5);          // core half-width in pixels (a bolt close to the lens stays a line)
        float gl = a3.w, half_ = max(px, .55)*mix(2., 7., gl) + 1.5;                       // the ribbon carries the glow
        cc.xy += n*position.y*half_*2./uRes*cc.w;
        vP = vec3(position.y*half_, max(px, .55), gl);
        vec3 col = a2.w < .5 ? vec3(1., .80, .42) : a2.w < 1.5 ? vec3(.62, .76, 1.) : a2.w < 2.5 ? vec3(1., .42, .12) : vec3(.74, .55, 1.);
        vC = col*a1.w*min(px/.55, 1.)*step(.05, c1.w)*step(.05, c2.w);
        gl_Position = cc; }`,
      fragmentShader: /* glsl */`varying vec3 vC; varying vec3 vP;
      void main(){ float x = abs(vP.x), c = vP.y; float core = exp(-x*x/(c*c)*1.4); float g1 = exp(-x/(c*2.6 + 1.)), g2 = 1./(1. + x*x/(c*c*30. + 6.));
        float edge = 1. - smoothstep(.6, 1., x/(c*mix(2., 7., vP.z) + 1.5));
        vec3 col = (mix(vC, vec3(dot(vC, vec3(.4))), .75)*core*2.2 + vC*(g1*.16 + g2*.035)*vP.z)*edge;
        gl_FragColor = vec4(col, 0.); }` }, PRE));
    const mesh = this.mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 36; mesh.visible = false; K.scene.add(mesh); this.g = g;
  },
  begin() { nSeg = 0; },
  update(F) {                                                    // runs last among the bolt makers (see order of parts): upload
    const t = F.t, B = S.ball;
    // ---- braided arcs round the golden breath: strands that leave the core and re-join it, re-struck 24 times a second
    const b = S.beam[1];
    if (b.on) { const fr = Math.floor(t * 24), bz = (u, o) => { const v = 1 - u; return o.copy(b.A).multiplyScalar(v * v).addScaledVector(b.C, 2 * u * v).addScaledVector(b.E, u * u); };
      for (let j = 0; j < 9; j++) { const sd = fr * 37 + j * 101, life = h1(sd, 1); if (life < .25) continue;
        let u0 = lerp(b.tail, b.front, h1(sd, 2) * .8), u1 = Math.min(b.front, u0 + (.12 + .3 * h1(sd, 3)) * (b.front - b.tail));
        const pa = bz(u0, _v[0]), pb = bz(u1, _v[1]), rr = lerp(b.r0, b.r1, (u0 + u1) * .5);
        // a strand: out from the core, along, back in (two legs that share their ends -> it forks and re-joins)
        const mid = _v[2].copy(pa).add(pb).multiplyScalar(.5), off = _v[3].set(h1(sd, 4) - .5, h1(sd, 5) - .5, h1(sd, 6) - .5).normalize().multiplyScalar(rr * (.5 + .7 * h1(sd, 7)));
        const I = b.pow * (10 + 22 * h1(sd, 8)) * (.6 + .4 * life), o = { lv: 4, disp: .1, rough: .6, w: .03 + .025 * h1(sd, 9), I, col: h1(sd, 10) < .25 ? 1 : 0, glow: .45 };
        mid.add(off); addBolt(sd, pa, mid, o); addBolt(sd + 1, mid, pb, o);
        if (h1(sd, 12) < .5) { const m2 = _v[4].copy(pa).add(pb).multiplyScalar(.5).addScaledVector(off, -.8); o.I *= .6; addBolt(sd + 2, pa, m2, o); addBolt(sd + 3, m2, pb, o); } }
      // stray forks leaping off the jet into the air
      for (let j = 0; j < 3; j++) { const sd = Math.floor(t * 12) * 53 + j * 7; if (h1(sd, 1) < .45) continue; const u0 = lerp(b.tail, b.front, .15 + .8 * h1(sd, 2)), pa = bz(u0, _v[0]), rr = lerp(b.r0, b.r1, u0);
        const d = _v[1].set(h1(sd, 3) - .5, h1(sd, 4) - .3, h1(sd, 5) - .5).normalize().multiplyScalar(rr * (2.2 + 3 * h1(sd, 6))).add(pa);
        addBolt(sd, pa, d, { lv: 4, disp: .16, w: .05, I: b.pow * 16, col: 0, taper: 1, br: 2, brLen: .5, glow: .5 }); } }
    // ---- arcs lashing from the plasma to the two bodies
    if (B.on && S.hasD && t < T.clash1 + .3 && t > 46) { const fr = Math.floor(t * 14);
      for (let j = 0; j < 7; j++) { const sd = fr * 71 + j * 19; if (h1(sd, 1) > .5 * B.pow) continue; const gold = j % 2 === 1, D = gold ? K.rival : K.dragon;
        const e = D.spine(3 + 55 * h1(sd, 2) * h1(sd, 3), _v[0]); e.y += (gold ? 1 : 1) * (h1(sd, 4) - .3) * 2.5;
        const s = _v[1].copy(e).sub(B.c).normalize().multiplyScalar(B.R * .8).add(B.c);
        addBolt(sd, s, e, { lv: 5, disp: .13, rough: .55, w: .05, I: 26 * B.pow, col: gold ? 0 : (h1(sd, 5) < .5 ? 2 : 0), taper: .5, br: 3, brLen: .22, glow: .6 }); }
      // short crawlers over the ball's skin
      for (let j = 0; j < 8; j++) { const sd = Math.floor(t * 20) * 13 + j * 31, d0 = _v[0].set(h1(sd, 1) - .5, h1(sd, 2) - .5, h1(sd, 3) - .5).normalize(), d1 = _v[1].set(h1(sd, 4) - .5, h1(sd, 5) - .5, h1(sd, 6) - .5).normalize().multiplyScalar(.8).add(d0).normalize();
        const gs = d0.dot(B.axis) > 0; d0.multiplyScalar(B.R * 1.02).add(B.c); d1.multiplyScalar(B.R * (1.05 + .5 * h1(sd, 7))).add(B.c);
        addBolt(sd, d0, d1, { lv: 4, disp: .2, w: .05, I: 22 * B.pow, col: gs ? 0 : 2, br: 1, brLen: .5, glow: .5 }); } }
    for (const f of fx.boltMakers) f(F);
    this.mesh.visible = nSeg > 0; this.g.instanceCount = nSeg; if (nSeg) { this.ib.clearUpdateRanges(); this.ib.addUpdateRange(0, nSeg * 16); this.ib.needsUpdate = true; }
  }
});
fx.boltMakers = [];

// ---------------------------------------------------------------- glints: additive GPU particles, closed form in film time
const PGLSL = /* glsl */`
vec3 bz(vec3 A, vec3 C, vec3 E, float u){ float v = 1. - u; return v*v*A + 2.*u*v*C + u*u*E; }
vec3 bzD(vec3 A, vec3 C, vec3 E, float u){ return 2.*(1. - u)*(C - A) + 2.*u*(E - C); }
// ballistic flight with linear drag k, gravity g and wind (terminal velocity wind + (0,-g/k,0))
vec3 dragPos(vec3 p0, vec3 v0, float k, float g, vec3 wind, float a){ vec3 vt = wind + vec3(0., -g/k, 0.); return p0 + (v0 - vt)*(1. - exp(-k*a))/k + vt*a; }
vec3 dragVel(vec3 v0, float k, float g, vec3 wind, float a){ vec3 vt = wind + vec3(0., -g/k, 0.); return vt + (v0 - vt)*exp(-k*a); }
#define HIST(H, age, o) { float f_ = clamp((age)/${HDT.toFixed(3)}, 0., 10.99); int i_ = int(f_); o = mix(H[i_], H[i_+1], f_ - float(i_)); }
vec3 spectrum(float x){ x = clamp(x, 0., 1.); return clamp(vec3(1.5 - abs(x - .82)*4.2, 1.35 - abs(x - .5)*4., 1.5 - abs(x - .18)*4.2), 0., 1.) + vec3(.55, 0., .9)*clamp(1. - abs(x - .04)*14., 0., 1.)*.5; }
`;
const beamU = () => ({ A: { value: new V3() }, C: { value: new V3() }, E: { value: new V3() }, P: { value: new V4() }, Q: { value: new V4() }, H: { value: Array.from({ length: 12 }, () => new V3()) }, B: { value: new Float32Array(12) } });
const PU = fx.PU = { uRes, uF: beamU(), uG: beamU(), uBall: { value: new V4() }, uBallT: { value: new V4(-1e3, -1e3, 0, 0) }, uImp: { value: new V4(P.impact.x, P.impact.y, P.impact.z, T.impact) },
  uEv: { value: [new V4(), new V4(), new V4(), new V4()] }, uEvD: { value: new V4(3.5, 3.6, 3, 3) }, uWindV: { value: new V3() }, uRainbow: { value: 1 } };
// flatten nested beam uniforms into uFA, uFC ... for the shaders
const PUf = {}; for (const k in PU) { if (PU[k].A) { for (const j in PU[k]) PUf[k + j] = PU[k][j]; } else PUf[k] = PU[k]; }
const PU_DECL = /* glsl */`
uniform vec3 uFA, uFC, uFE, uGA, uGC, uGE; uniform vec4 uFP, uGP, uFQ, uGQ;      // P: tail, front, power, end radius · Q: length, fixed end, r0, 0
uniform vec3 uFH[12], uGH[12]; uniform float uFB[12], uGB[12];
uniform vec4 uBall, uBallT, uImp, uEv[4], uEvD; uniform vec3 uWindV; uniform vec2 uRes; uniform float uRainbow;
`;
function setParticleUniforms(F) {
  const t = F.t;
  for (let i = 0; i < 2; i++) { const b = S.beam[i], u = i ? PU.uG : PU.uF; u.A.value.copy(b.A); u.C.value.copy(b.C); u.E.value.copy(b.E); u.P.value.set(b.tail, b.front, b.on ? b.pow : 0, b.r1); u.Q.value.set(b.L, b.fixed, b.r0, b.trail ? 1 : 0);
    for (let k = 0; k < 12; k++) { u.H.value[k].copy(b.hist[k]); u.B.value[k] = b.bh[k]; } }
  const B = S.ball;
  if (t > 46.5 && t < 58) { PU.uBall.value.set(P.ring.x, P.ring.y, P.ring.z, t < T.clash1 ? B.R : 8.6); PU.uBallT.value.set(T.clash0 + .2, T.clash1, 0, 0); }
  else if (t > 66 && t < T.impact + 3) { if (t < T.impact + .2) PU.uBall.value.set(B.c.x, B.c.y, B.c.z, B.R); else PU.uBall.value.set(P.impact.x, P.impact.y, P.impact.z, 5.8); PU.uBallT.value.set(T.charge + .2, T.impact, 1, 0); }   // never left over from another frame
  else PU.uBallT.value.set(-1e3, -1e3, 0, 0);
  PU.uImp.value.set(P.impact.x, P.impact.y, P.impact.z, T.impact);
  const sp = film.splashes; for (let i = 0; i < 4; i++) { const e = sp[i]; if (e) PU.uEv.value[i].set(e.x, e.z, e.t0, e.size || 1); else PU.uEv.value[i].set(0, 0, -1e3, 0); }
  const e = K.env; PU.uWindV.value.set(e.windDir.x * e.wind * 9, 0, e.windDir.y * e.wind * 9);
}
function quadGeo(n, fill) {     // fill(i, S, Kk, Pp): seeds, kind/life/size/extra, base position
  const g = new THREE.InstancedBufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3)); g.setIndex([0, 1, 2, 0, 2, 3]);
  const aS = new Float32Array(n * 4), aK = new Float32Array(n * 4), aP = new Float32Array(n * 3), s = [0, 0, 0, 0], k = [0, 0, 0, 0], p = [0, 0, 0];
  for (let i = 0; i < n; i++) { p[0] = p[1] = p[2] = 0; fill(i, s, k, p); aS.set(s, i * 4); aK.set(k, i * 4); aP.set(p, i * 3); }
  g.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 4)); g.setAttribute('aK', new THREE.InstancedBufferAttribute(aK, 4)); g.setAttribute('aP', new THREE.InstancedBufferAttribute(aP, 3)); g.instanceCount = n; return g;
}
const GLINT_VERT = K.GLSL.fog + PGLSL + PU_DECL + /* glsl */`
attribute vec4 aS, aK; attribute vec3 aP; varying vec3 vC; varying vec3 vQ;
void main(){
  float kind = aK.x, t = uTime, sz = aK.z, lum = 0., expo = .018, shape = 0., minPx = 1.3;
  vec3 wp = vec3(0.), vel = vec3(0., 1e-3, 0.), col = vec3(1.);
  vec3 rn = normalize(aS.xyz*2. - 1. + 1e-3); float tw = sin(t*(6. + 11.*aS.x) + aS.y*40.);
  if(kind < .5){                                                   // sparks torn off the fire: thrown down the jet, arc away, cool
    float L = aK.y, ph = fract(t/L + aS.w), age = ph*L, pw; { float f_ = clamp(age/${HDT.toFixed(3)}, 0., 10.99); int i_ = int(f_); pw = mix(uFB[i_], uFB[i_+1], f_ - float(i_)); }
    if(pw > .01 && uFQ.w > .5 && fract(aS.z*17.3 + aS.x) < .12 + .88*smoothstep(.25, .9, pw)){ float ub = mix(0., max(uFP.y, .5), pow(aS.x, 1.5)); vec3 c = bz(uFA, uFC, uFE, ub), Tn = normalize(bzD(uFA, uFC, uFE, ub)), hs; HIST(uFH, age, hs)
      float Rl = mix(uFQ.z, uFP.w, pow(ub, .72)); vec3 sd = normalize(rn - Tn*dot(rn, Tn));
      vec3 v0 = Tn*(12. + 30.*aS.y)*(1. - .45*ub) + sd*(3. + 11.*aS.z*aS.z);
      vec3 p0 = c + sd*Rl*(.25 + .6*aS.z) + hs*(1. - ub*uFQ.y);
      wp = dragPos(p0, v0, 1.5, 6., uWindV*.3, age) + vec3(sin(age*5. + aS.y*20.), cos(age*4.3 + aS.x*17.), sin(age*3.7 + aS.z*31.))*.35*age;
      vel = dragVel(v0, 1.5, 6., uWindV*.3, age); float Tm = 1. - ph;
      col = mix(vec3(1., .16, .02), vec3(1., .5, .12), Tm); col = mix(col, vec3(1., .78, .42), smoothstep(.75, 1., Tm));
      lum = 22.*Tm*Tm*smoothstep(0., .03, ph)*min(pw*2., 1.)*(.7 + .3*tw); sz *= (.5 + .5*Tm)*(.6 + .4*smoothstep(.3, .9, pw)); }
  } else if(kind < 1.5){                                           // star motes and gold dust drifting round the golden breath
    float L = aK.y, ph = fract(t/L + aS.w), age = ph*L, pw; { float f_ = clamp(age/${HDT.toFixed(3)}, 0., 10.99); int i_ = int(f_); pw = mix(uGB[i_], uGB[i_+1], f_ - float(i_)); }
    if(pw > .01 && uGQ.w > .5){ float ub = aS.x*max(uGP.y, .5); vec3 c = bz(uGA, uGC, uGE, ub), Tn = normalize(bzD(uGA, uGC, uGE, ub)), hs; HIST(uGH, age, hs)
      float Rl = mix(uGQ.z, uGP.w, pow(ub, .8)); vec3 sd = normalize(rn - Tn*dot(rn, Tn)), s2 = cross(Tn, sd);
      float an = age*(1.5 + 2.*aS.y) + aS.z*6.28, rr = Rl*(.5 + 1.6*aS.z + .9*age);
      wp = c + (sd*cos(an) + s2*sin(an))*rr + Tn*age*(3. + 9.*aS.y) + hs*(1. - ub*uGQ.y) + vec3(0., .5*age, 0.);
      vel = Tn*(3. + 9.*aS.y) + (s2*cos(an) - sd*sin(an))*rr*2.;
      float star = step(.88, aS.w); shape = star; col = mix(vec3(1., .78, .34), vec3(.86, .92, 1.), step(.8, aS.y));
      lum = (1.2 + 9.*pow(max(tw, 0.), 6.) + 4.*star)*smoothstep(0., .08, ph)*(1. - ph)*min(pw*2., 1.); sz *= 1. + 1.6*star; expo = .004; }
  } else if(kind < 2.5){                                           // sparks sprayed from the clash: a rain falling to the mist sea
    float L = aK.y, ph = fract(t/L + aS.w), age = ph*L, tb = t - age;
    float pw = smoothstep(uBallT.x, uBallT.x + .5, tb)*(1. - smoothstep(uBallT.y, uBallT.y + .1, tb));
    if(pw > .01){ vec3 d = normalize(rn + vec3(0., .25, 0.)); float sp = 9. + 34.*aS.x*aS.x;
      float k = .55 + .9*aS.y; vec3 p0 = uBall.xyz + d*uBall.w*.7;
      wp = dragPos(p0, d*sp, k, 9.8, uWindV, age); vel = dragVel(d*sp, k, 9.8, uWindV, age);
      float Tm = 1. - ph; bool gold = aS.z > .5;
      col = gold ? mix(vec3(1., .5, .1), vec3(1., .86, .5), Tm) : mix(vec3(1., .12, .02), vec3(1., .5, .14), Tm);
      lum = (gold ? 24. : 20.)*pow(Tm, 1.4)*pw*(.65 + .35*tw); sz *= .45 + .55*Tm; }
  } else if(kind < 3.5){                                           // the soft burst when the breaths break off
    float age = t - uBallT.y - aS.w*.12, L = aK.y;
    if(age > 0. && age < L && uBallT.z < .5){ float ph = age/L; vec3 d = rn; float sp = 14. + 46.*aS.x; float k = .7 + 1.1*aS.y;
      wp = dragPos(uBall.xyz + d*4., d*sp, k, 9.8, uWindV, age); vel = dragVel(d*sp, k, 9.8, uWindV, age);
      float Tm = 1. - ph; col = aS.z > .5 ? mix(vec3(1., .45, .08), vec3(1., .88, .55), Tm) : mix(vec3(1., .1, .02), vec3(1., .5, .14), Tm);
      lum = 20.*pow(Tm, 1.5)*(.65 + .35*tw); sz *= .5 + .5*Tm; shape = step(.9, aS.y); }
  } else if(kind < 4.5){                                           // after the collision: embers and gold motes hang, then sift down for seconds
    float age = t - uImp.w - aS.w*.25, L = aK.y;
    if(age > 0. && age < L){ float ph = age/L; vec3 d = normalize(rn + vec3(0., .12, 0.)); float sp = 30. + 150.*aS.x*aS.x; float k = 1.1 + 1.5*aS.y;
      wp = dragPos(uImp.xyz + d*3., d*sp, k, 2.2 + 3.*aS.z, uWindV*.7, age)
         + vec3(sin(age*1.3 + aS.y*20.), cos(age*1.1 + aS.x*17.)*.5, sin(age*.9 + aS.z*31.))*(1.5 + age*.9);
      vel = dragVel(d*sp, k, 2.2 + 3.*aS.z, uWindV*.7, age) + vec3(0., .01, 0.);
      bool gold = aS.z > .55; float cool = exp(-age*(gold ? .28 : .55));
      col = gold ? mix(vec3(1., .62, .2), vec3(1., .9, .62), cool) : mix(vec3(1., .1, .02), vec3(1., .55, .16), cool);
      lum = (gold ? 5. + 12.*pow(max(tw, 0.), 5.) : 9.)*(.25 + .75*cool)*smoothstep(0., .05, age)*(1. - smoothstep(.8, 1., ph)); shape = gold ? step(.75, aS.w) : 0.;
      sz *= gold ? 1. + .5*shape : .6 + .5*cool; expo = .012; }
  } else if(kind < 5.5){                                           // debris streaks thrown out by the blast
    float age = t - uImp.w - aS.w*.1, L = aK.y;
    if(age > 0. && age < L){ float ph = age/L; vec3 d = rn; float sp = 110. + 260.*aS.x; float k = 1.4 + 1.2*aS.y;
      wp = dragPos(uImp.xyz, d*sp, k, 9.8, vec3(0.), age); vel = dragVel(d*sp, k, 9.8, vec3(0.), age);
      col = mix(vec3(1., .3, .05), vec3(1., .9, .6), 1. - ph); lum = 30.*(1. - ph)*(1. - ph); expo = .03; }
  } else if(kind < 6.5){                                           // droplets flung up by the plunge / the bursts: they hang, flash, and rain back for seconds
    int sl = int(aK.w + .5); vec4 ev = sl == 0 ? uEv[0] : sl == 1 ? uEv[1] : sl == 2 ? uEv[2] : uEv[3];
    float age = t - ev.z - aS.w*aS.w*1.6;
    if(age > 0. && ev.w > 0.){ float S = ev.w, sS = sqrt(S), a = aS.x*6.2832; vec3 rd = vec3(cos(a), 0., sin(a));
      float k = .28 + 1.5*aS.y*aS.y; vec3 v0 = rd*(1.5 + 8.*aS.z)*sS + vec3(0., (10. + 22.*fract(aS.z*7.3 + aS.y))*sS, 0.);
      vec3 p0 = vec3(ev.x, .2, ev.y) + rd*S*(.6 + 2.6*aS.y);
      wp = dragPos(p0, v0, k, 9.8, uWindV*.4, age); vel = dragVel(v0, k, 9.8, uWindV*.4, age);
      vec3 vd = normalize(wp - cameraPosition); float ang = acos(clamp(dot(vd, -uSunDir), -1., 1.));
      float bow = exp(-pow((ang - .722)/.03, 2.)) + .35*exp(-pow((ang - .89)/.04, 2.));     // drops at 42° (and 51°) from the anti-solar point split the sunlight
      vec3 sc = spectrum(ang < .8 ? (ang - .69)/.06 : 1. - (ang - .85)/.08);
      float fw = pow(max(dot(vd, uSunDir), 0.), 6.);
      col = mix(vec3(.92, .97, 1.), sc, min(bow*1.4, 1.)*uRainbow);
      lum = (1.6 + 16.*pow(max(tw, 0.), 8.) + 9.*bow*uRainbow + 8.*fw)*step(0., wp.y)*smoothstep(0., .1, age)*dot(uSunCol, vec3(.11));
      sz *= .6 + .8*aS.y; expo = .014; minPx = 1.25; }
  } else if(kind < 7.5){                                           // hard electric sparks spat off the golden breath
    float L = aK.y, ph = fract(t/L + aS.w), age = ph*L, pw; { float f_ = clamp(age/${HDT.toFixed(3)}, 0., 10.99); int i_ = int(f_); pw = mix(uGB[i_], uGB[i_+1], f_ - float(i_)); }
    if(pw > .01 && uGQ.w > .5){ float ub = mix(0., max(uGP.y, .5), aS.x); vec3 c = bz(uGA, uGC, uGE, ub), Tn = normalize(bzD(uGA, uGC, uGE, ub)), hs; HIST(uGH, age, hs)
      vec3 sd = normalize(rn - Tn*dot(rn, Tn)); vec3 v0 = Tn*(10. + 20.*aS.y) + sd*(14. + 30.*aS.z);
      wp = dragPos(c + hs*(1. - ub*uGQ.y), v0, 3.5, 9.8, vec3(0.), age); vel = dragVel(v0, 3.5, 9.8, vec3(0.), age);
      col = mix(vec3(1., .8, .4), vec3(.8, .9, 1.), aS.w); lum = 26.*(1. - ph)*(1. - ph)*min(pw*3., 1.); expo = .022; }
  }
  vec4 mv = viewMatrix*vec4(wp, 1.); vec3 vv = mat3(viewMatrix)*vel; float sl = length(vv.xy)*expo; vec2 ax = sl > 1e-5 ? normalize(vv.xy) : vec2(0., 1.);
  float dist = max(-mv.z, .1), px = sz*projectionMatrix[1][1]*uRes.y*.5/dist, kk = max(1., minPx/px);
  lum *= max(1./kk, .3)*smoothstep(.5, 2.5, dist); sz *= kk;
  float asp = (sz + sl)/sz; lum /= mix(1., sqrt(asp), .7);
  mv.xy += ax*position.y*(sz + sl) + vec2(ax.y, -ax.x)*position.x*sz*(1. + 2.5*shape);
  if(shape > .5) mv.xy += ax*position.y*sz*2.5;
  vC = col*lum*(1. - kFogAmt(wp)*.8); vQ = vec3(position.xy*vec2(1., asp), asp + shape*100.);
  gl_Position = lum > .002 ? projectionMatrix*mv : vec4(0., 0., 2., 1.); }`;
const GLINT_FRAG = /* glsl */`varying vec3 vC; varying vec3 vQ;
void main(){ float asp = mod(vQ.z, 100.), star = step(50., vQ.z); float a;
  if(star > .5){ vec2 p = vQ.xy/asp; float r = length(p); float c = max(1. - r*3.5, 0.); float ray = max(0., 1. - abs(p.x)*18.)*max(0., 1. - abs(p.y)) + max(0., 1. - abs(p.y)*18.)*max(0., 1. - abs(p.x));
    a = c*c*2.2 + ray*ray*.9 + .05*max(1. - r, 0.); }
  else { float d = length(vec2(vQ.x, max(abs(vQ.y) - (asp - 1.), 0.))); if(d > 1.) discard; float c = 1. - d; a = c*c*(.25 + 1.6*c*c*c*c); }
  gl_FragColor = vec4(vC*a, 0.); }`;
part('glints', {
  init() {
    const rnd = K.rng(6007), mat = K.shaderMat(Object.assign({ uniforms: PUf, vertexShader: GLINT_VERT, fragmentShader: GLINT_FRAG }, PRE));
    const grp = (n, f, ro = 40) => { const g = quadGeo(n, (i, s, k, p) => { s[0] = rnd(); s[1] = rnd(); s[2] = rnd(); s[3] = rnd(); f(i, k); }); const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.visible = false; m.renderOrder = ro; K.scene.add(m); return m; };
    const set = (k, a, b, c, d) => { k[0] = a; k[1] = b; k[2] = c; k[3] = d; };
    this.fire = grp(1800, (i, k) => set(k, 0, .45 + 1.5 * rnd() * rnd(), .014 + .028 * rnd(), 0));
    this.gold = grp(2400, (i, k) => i < 1800 ? set(k, 1, 1 + 2.2 * rnd(), .04 + .07 * rnd(), 0) : set(k, 7, .25 + .5 * rnd(), .012 + .02 * rnd(), 0));
    this.clash = grp(4200, (i, k) => i < 2800 ? set(k, 2, 2 + 5 * rnd() * rnd(), .03 + .05 * rnd(), 0) : set(k, 3, 1.5 + 3 * rnd(), .03 + .06 * rnd(), 0));
    this.imp = grp(5200, (i, k) => i < 4500 ? set(k, 4, 4 + 3.2 * rnd(), .07 + .13 * rnd(), 0) : set(k, 5, .5 + .9 * rnd(), .09 + .1 * rnd(), 0));
    this.drops = [0, 1, 2, 3].map(sl => grp(sl < 2 ? 3200 : 1500, (i, k) => set(k, 6, 0, .009 + .02 * rnd(), sl)));
  },
  update(F) {
    const t = F.t; setParticleUniforms(F);
    this.fire.visible = S.beam[0].trail; this.gold.visible = S.beam[1].trail;
    this.clash.visible = (t > T.clash0 && t < T.clash1 + 6.5) || (t > T.charge && t < T.impact + .5);
    this.imp.visible = S.tb > 0 && S.tb < 8;
    const sp = film.splashes; for (let i = 0; i < 4; i++) { const e = sp[i]; this.drops[i].visible = !!e && t > e.t0 && t < e.t0 + 11; }
    PU.uRainbow.value = sat(K.env.sunInt / 3) * (1 - .6 * K.env.storm);
  }
});

// ---------------------------------------------------------------- soft: lit premultiplied sprites (smoke, steam, mist curtains, falling sheets, spray, vapour)
// atlas 4x4: rows 0-1 eight billowing puffs · row 2 four streaked water sheets · row 3 four speckled spray clumps.  r = density, g = light/shade detail, b = fine detail
function bakeAtlas() {
  return K.bake(1024, 1024, /* glsl */`
    vec4 bake(vec2 uv){ vec2 cell = floor(uv*4.), c = fract(uv*4.)*2. - 1.; float id = cell.x + cell.y*4., r = length(c); vec2 so = vec2(id*7.31, id*3.17 + 1.);
      float edge = 1. - smoothstep(.72, .98, r);
      if(cell.y < 1.5){                                                  // puffs: cauliflower lumps with ragged, wispy rims
        vec3 v = kVoronoi(c*2.6 + so); float bil = 1. - v.x; float f1 = kFbm(c*1.7 + so), f2 = kFbm(c*5. + so*1.3 + f1*1.5);
        float d = (1. - r*1.05) + (f1 - .5)*1.2 + (bil - .6)*.45 + (f2 - .5)*.35;
        float a = smoothstep(.0, .8, d)*edge;
        return vec4(a, clamp(.5 + (bil - .55)*.9 + (f2 - .5)*.7, 0., 1.), f2, 1.); }
      if(cell.y < 2.5){                                                  // jets: a finger of water, thick at the root, torn into strands and beads at the tip (tip = +y)
        float v = c.y*.5 + .5, w = kFbm(vec2(v*2.2 + so.x, so.y));
        float ax = (w - .5)*.5*v, hw = .42*pow(1. - v, 1.25) + .035, dx = abs(c.x - ax);
        float st = kFbm(vec2((c.x - ax)*11. + so.x, v*2.2 + so.y)), st2 = kFbm(vec2(c.x*30. + so.y, v*4.));
        float body = (1. - smoothstep(hw*.35, hw, dx))*smoothstep(0., .14, v)*(1. - smoothstep(.8, .98, v));
        float a = body*smoothstep(.2, .62, st*.7 + st2*.35 + (1. - v)*.3);
        vec3 vo = kVoronoi(c*vec2(11., 8.) + so); a = max(a, (1. - smoothstep(.1, .26, vo.x))*step(.5, vo.z)*(1. - smoothstep(hw + .05, hw + .35, dx))*smoothstep(.25, .6, v)*(1. - smoothstep(.85, 1., v))*.9);
        return vec4(a, clamp(.5 + st2*.6, 0., 1.), st, 1.); }
      { vec3 v = kVoronoi(c*7. + so), v2 = kVoronoi(c*15. + so*2.); float f = kFbm(c*2.3 + so);             // spray: clumps of droplets in a veil
        float d = (1. - r) + (f - .5)*1.3;
        float a = smoothstep(.0, .7, d)*(.6 + .4*f) + (1. - smoothstep(.1, .34, v.x))*smoothstep(.0, .3, d)*.35 + (1. - smoothstep(.1, .3, v2.x))*smoothstep(.1, .5, d)*.3*step(.4, v2.z);
        return vec4(clamp(a, 0., 1.)*edge, clamp(.45 + f*.6, 0., 1.), v.z, 1.); } }`, { repeat: false });
}
const SOFT_VERT = K.GLSL.fog + PGLSL + PU_DECL + /* glsl */`
attribute vec4 aS, aK; attribute vec3 aP; uniform vec4 uRainP; varying vec4 vUV; varying vec4 vCol; varying vec3 vEm; varying vec3 vWP; varying vec2 vQ;
void main(){
  float kind = aK.x, t = uTime, sz = 1., alpha = 0., row = 0., stretch = 1., rot = aS.w*6.2832 + t*(aS.z - .5)*.4;
  vec3 wp = vec3(0.), vel = vec3(0., 1., 0.), col = vec3(.93), em = vec3(0.);
  vec3 rn = normalize(aS.xyz*2. - 1. + 1e-3); bool along = false;
  if(kind < .5){                                                   // sooty smoke rolling off the far half of the fire
    float L = aK.y, ph = fract(t/L + aS.w), age = ph*L, pw; { float f_ = clamp(age/${HDT.toFixed(3)}, 0., 10.99); int i_ = int(f_); pw = mix(uFB[i_], uFB[i_+1], f_ - float(i_)); }
    if(pw > .01 && uFQ.w > .5){ float ub = mix(.3, 1., aS.x)*max(uFP.y, .4); vec3 c = bz(uFA, uFC, uFE, ub), Tn = normalize(bzD(uFA, uFC, uFE, ub)), hs; HIST(uFH, age, hs)
      float Rl = mix(uFQ.z, uFP.w, pow(ub, .72)); vec3 sd = normalize(rn - Tn*dot(rn, Tn) + vec3(0., .5, 0.));
      vec3 p0 = c + sd*Rl*(.75 + .4*aS.z) + hs*(1. - ub*uFQ.y); vec3 v0 = Tn*(7. + 9.*aS.y)*(1. - .4*ub) + sd*2.5;
      wp = dragPos(p0, v0, 1.1, -3.2, uWindV*.5, age); sz = (.9 + 3.6*sqrt(ph))*(.6 + .8*aS.z)*(.5 + Rl*.3);
      alpha = .24*smoothstep(0., .1, ph)*pow(1. - ph, 1.4)*smoothstep(.35, .8, pw); col = vec3(.085, .07, .062); em = vec3(1., .3, .06)*1.1*(1. - smoothstep(0., .22, ph)); }
  } else if(kind < 1.5){                                           // steam: lake water flashing to vapour round the fire-hot body
    int sl = int(aK.w + .5); vec4 ev = sl == 0 ? uEv[0] : sl == 1 ? uEv[1] : sl == 2 ? uEv[2] : uEv[3]; float dur = sl == 0 ? uEvD.x : sl == 1 ? uEvD.y : sl == 2 ? uEvD.z : uEvD.w;
    float age = t - ev.z - aS.w*dur, L = aK.y;
    if(age > 0. && age < L && ev.w > 0.){ float ph = age/L, S = ev.w, sS = sqrt(S), a = aS.x*6.2832; vec3 rd = vec3(cos(a), 0., sin(a));
      vec3 p0 = vec3(ev.x, .6, ev.y) + rd*S*(1.6 + 3.2*sqrt(aS.y)); vec3 v0 = vec3(0., (3.5 + 7.*aS.z)*sS, 0.) + rd*(1.5 + 4.*aS.y);
      wp = dragPos(p0, v0, .8, -1.1, uWindV*.5, age); wp.xz += vec2(sin(age*.9 + aS.y*20.), cos(age*.8 + aS.x*17.))*.8*age;
      sz = (1.4 + 5.5*pow(ph, .6))*sS*(.65 + .7*aS.z); alpha = (sl == 1 ? .15 : .1)*smoothstep(0., .08, ph)*pow(1. - ph, 1.4);
      vec3 hotc = sl == 3 || (sl == 1 && aS.x > .5) ? vec3(1., .72, .3) : vec3(1., .34, .08); em = hotc*(sl == 1 ? .65 : .5)*(1. - smoothstep(0., .3, ph))*step(aS.w, .85); }
  } else if(kind < 2.5){                                           // mist curtains rolling out low over the water
    int sl = int(aK.w + .5); vec4 ev = sl == 0 ? uEv[0] : sl == 1 ? uEv[1] : sl == 2 ? uEv[2] : uEv[3];
    float age = t - ev.z - .1 - aS.w*.7, L = aK.y;
    if(age > 0. && age < L && ev.w > 0.){ float ph = age/L, S = ev.w, sS = sqrt(S), a = aS.x*6.2832; vec3 rd = vec3(cos(a), 0., sin(a));
      float rr = S*(2.5 + 12.*(1. - exp(-age*.5))*(.35 + .9*aS.y)); sz = (3. + 8.*(1. - exp(-age*.55)))*sS*(.6 + .7*aS.z);
      wp = vec3(ev.x, 0., ev.y) + rd*rr + vec3(0., sz*.4 + age*.9*aS.z, 0.) + uWindV*age*.35;
      alpha = .11*smoothstep(0., .07, ph)*pow(1. - ph, 1.5); }
  } else if(kind < 3.5){                                           // the crown: fingers of water flung up and outward, falling back in torn strands
    int sl = int(aK.w + .5); vec4 ev = sl == 0 ? uEv[0] : sl == 1 ? uEv[1] : sl == 2 ? uEv[2] : uEv[3];
    float age = t - ev.z - .15 - aS.w*1.3;
    if(age > 0. && ev.w > 0.){ float S = ev.w, sS = sqrt(S), a = aS.x*6.2832; vec3 rd = vec3(cos(a), 0., sin(a));
      vec3 v0 = rd*(1.5 + 4.5*aS.z)*sS + vec3(0., (9. + 13.*aS.y)*sS, 0.); vec3 p0 = vec3(ev.x, 0., ev.y) + rd*S*(1.6 + 2.6*aS.z);
      wp = dragPos(p0, v0, .4, 9.8, uWindV*.3, age); vel = dragVel(v0, .4, 9.8, uWindV*.3, age);
      sz = (.55 + 1.1*aS.z)*sS*(1. + .3*age); stretch = 2.6 + .05*length(vel); row = 2.; along = true;
      alpha = .3*smoothstep(.2, .9, age)*(1. - smoothstep(2.6, 5., age))*smoothstep(-2., .5, wp.y); col = vec3(.93, .98, 1.); }
  } else if(kind < 4.5){                                           // the white heart of the column: spray driven straight up
    int sl = int(aK.w + .5); vec4 ev = sl == 0 ? uEv[0] : sl == 1 ? uEv[1] : sl == 2 ? uEv[2] : uEv[3];
    float age = t - ev.z - aS.w*aS.w*1.5;
    if(age > 0. && ev.w > 0.){ float S = ev.w, sS = sqrt(S), a = aS.x*6.2832; vec3 rd = vec3(cos(a), 0., sin(a));
      vec3 v0 = rd*(1.5 + 6.*aS.z)*sS + vec3(0., (8. + 15.*aS.y)*sS, 0.); vec3 p0 = vec3(ev.x, 0., ev.y) + rd*S*(1.5 + 1.8*aS.z);
      wp = dragPos(p0, v0, .8, 9.8, uWindV*.4, age); vel = dragVel(v0, .8, 9.8, uWindV*.4, age);
      sz = (.6 + 1.3*aS.z)*sS*(1. + .5*age); row = 3.; stretch = 1.35; along = true;
      alpha = .2*smoothstep(0., .1, age)*(1. - smoothstep(1.6, 4., age))*smoothstep(-2., .5, wp.y); col = vec3(.96, .99, 1.); }
  } else if(kind < 5.5){                                           // the collision: a ring of vapour torn out of the cloud
    float age = t - uImp.w - aS.w*.12, L = aK.y;
    if(age > 0. && age < L){ float ph = age/L, a = aS.x*6.2832;
      float rr = (20. + 250.*(1. - exp(-age*1.05)))*(.9 + .2*aS.y); sz = (7. + 30.*(1. - exp(-age*.7)))*(.6 + .8*aS.z);
      wp = uImp.xyz + vec3(cos(a)*rr, (aS.z - .5)*.12*rr + 6.*sin(a*3. + aS.y*6.), sin(a)*rr);
      alpha = .14*smoothstep(0., .05, ph)*pow(1. - ph, 1.5); col = vec3(1.25, 1.27, 1.32); em = vec3(1., .66, .36)*1.3*exp(-age*1.6); }
  } else if(kind < 6.5){                                           // rain on warm stone: wisps lifting off terraces and roofs
    float L = aK.y, ph = fract(t/L + aS.w), age = ph*L;
    if(uRainP.y > .02){ wp = aP + vec3(0., .2 + age*(.25 + .5*aS.y), 0.) + uWindV*age*.12 + vec3(sin(age*.7 + aS.x*20.), 0., cos(age*.6 + aS.z*20.))*.5;
      sz = (.7 + 2.6*ph)*(.6 + .8*aS.z); alpha = .13*uRainP.y*smoothstep(0., .15, ph)*pow(1. - ph, 1.2); }
  } else if(kind < 7.5){                                           // ionised vapour shed by the clash
    float L = aK.y, ph = fract(t/L + aS.w), age = ph*L, tb = t - age;
    float pw = smoothstep(uBallT.x, uBallT.x + .5, tb)*(1. - smoothstep(uBallT.y, uBallT.y + .1, tb));
    if(pw > .01){ vec3 d = normalize(rn + vec3(0., .3, 0.)); wp = dragPos(uBall.xyz + d*uBall.w*.9, d*(6. + 12.*aS.x), .9, -1.5, uWindV*.5, age);
      sz = (1.5 + 6.*sqrt(ph))*(.6 + .8*aS.z); alpha = .1*pw*smoothstep(0., .1, ph)*pow(1. - ph, 1.4);
      col = vec3(.9, .9, .92); em = mix(vec3(1., .45, .12), vec3(1., .85, .55), step(.5, aS.y))*.5*(1. - smoothstep(0., .3, ph)); }
  }
  vec4 mv = viewMatrix*vec4(wp, 1.); vec2 ax = vec2(sin(rot), cos(rot));
  if(along){ vec3 vv = mat3(viewMatrix)*vel; ax = length(vv.xy) > 1e-4 ? normalize(vv.xy) : vec2(0., 1.); }
  alpha *= smoothstep(1.5 + sz*.6, 5. + sz*1.6, -mv.z);
  mv.xy += ax*position.y*sz*stretch + vec2(ax.y, -ax.x)*position.x*sz;
  float cell = floor(fract(aS.y*7.77 + aS.x)*(row < 1.5 ? 8. : 4.)); vec2 co = row < 1.5 ? vec2(mod(cell, 4.), floor(cell/4.)) : vec2(cell, row);
  vUV = vec4(co*.25, row > 1.5 ? 1. : 0., 0.); vQ = position.xy; vCol = vec4(col, alpha); vEm = em; vWP = wp;
  gl_Position = alpha > .003 ? projectionMatrix*mv : vec4(0., 0., 2., 1.); }`;
const SOFT_FRAG = /* glsl */`uniform sampler2D tAtlas; varying vec4 vUV; varying vec4 vCol; varying vec3 vEm; varying vec3 vWP; varying vec2 vQ;
void main(){ vec4 tx = texture2D(tAtlas, vUV.xy + (.5 + vQ*.485)*.25); float a = tx.r*vCol.a; if(a < .003) discard;
  vec3 nv = normalize(vec3(vQ*.8 + (tx.gb - .5)*vec2(.7, .7), .7)); vec3 nW = nv*mat3(viewMatrix);
  float wrap = dot(nW, uSunDir)*.5 + .5; vec3 rd = normalize(vWP - cameraPosition);
  vec3 L = uSunCol*.3183*(.4 + .7*wrap*wrap) + uSkyCol*.7 + uGndCol*.2;
  L += uSunCol*.3*pow(max(dot(rd, uSunDir), 0.), 4.)*(1. - tx.r*.7);                           // sun through the thin rims
  L = mix(L, uSunCol*.3183*(.75 + .35*wrap) + uSkyCol*.5, vUV.z);                              // water: bright, hardly shaded
  vec3 col = vCol.rgb*L*mix(.8 + .3*tx.g, .9 + .2*tx.g, vUV.z) + vEm*(.5 + .7*tx.g);
  float fg = kFogAmt(vWP); col = mix(col, kFogColor(rd), fg*.9);
  gl_FragColor = vec4(col*a, a); }`;
part('soft', {
  init() {
    tex.atlas = bakeAtlas(); this.uRainP = { value: new V4() };
    const rnd = K.rng(6011), mat = K.shaderMat(Object.assign({ uniforms: Object.assign({ tAtlas: { value: tex.atlas }, uRainP: this.uRainP }, PUf), vertexShader: SOFT_VERT, fragmentShader: SOFT_FRAG }, PRE));
    this.mat = mat;
    const grp = (n, f, ro = 28) => { const g = quadGeo(n, (i, s, k, p) => { s[0] = rnd(); s[1] = rnd(); s[2] = rnd(); s[3] = rnd(); f(i, k, p); }); const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.visible = false; m.renderOrder = ro; K.scene.add(m); return m; };
    const set = (k, a, b, c, d) => { k[0] = a; k[1] = b; k[2] = c; k[3] = d; };
    this.smoke = grp(300, (i, k) => set(k, 0, 1.8 + 1.6 * rnd(), 0, 0), 29);
    // per water event: steam, mist curtain, sheets, spray (sizes follow the event size in the shader)
    this.ev = [0, 1, 2, 3].map(sl => { const big = sl < 2; return grp(big ? 900 : 480, (i, k) => { const n = big ? 900 : 480, f = i / n;
      if (f < .5) set(k, 1, 4 + 4.5 * rnd(), 0, sl); else if (f < .62) set(k, 2, 7 + 5 * rnd(), 0, sl); else if (f < .92) set(k, 3, 0, 0, sl); else set(k, 4, 0, 0, sl); }, 27); });
    this.ring = grp(520, (i, k) => set(k, 5, 2.6 + 1.8 * rnd(), 0, 0), 32);
    this.clash = grp(220, (i, k) => set(k, 7, 2 + 2.5 * rnd(), 0, 0), 33);
    this.grp = grp;
  },
  update(F) {
    const t = F.t, sp = film.splashes;
    this.smoke.visible = S.beam[0].trail;
    for (let i = 0; i < 4; i++) { const e = sp[i]; this.ev[i].visible = !!e && t > e.t0 && t < e.t0 + 16; }
    this.ring.visible = S.tb > 0 && S.tb < 7.5;
    this.clash.visible = (t > T.clash0 && t < T.clash1 + 4.6) || (t > T.charge && t < T.impact + .3);
    // how long the hot body keeps boiling the lake at each event
    PU.uEvD.value.set(4.2, 4.6, 3.4, 3.4);
    this.uRainP.value.set(K.env.rain || 0, Math.max(K.env.rain || 0, (K.env.wet || 0) * .7 * (1 - smooth(76, 82, t))), 0, 0);
  }
});

// ---------------------------------------------------------------- glows: a small dynamic pool of soft halos (jaws, plasma, flashes inside the cloud) and light under the water
const NGLOW = 24, glowArr = new Float32Array(NGLOW * 8); let nGlow = 0;
// kind 0 = round halo facing the camera · 1 = flat patch on the lake (light from below, broken by ripples) · 2 = cloud lit from inside
function addGlow(p, size, r, g, b, kind = 0) { if (nGlow >= NGLOW) return; const q = nGlow++ * 8; glowArr[q] = p.x; glowArr[q + 1] = p.y; glowArr[q + 2] = p.z; glowArr[q + 3] = size; glowArr[q + 4] = r; glowArr[q + 5] = g; glowArr[q + 6] = b; glowArr[q + 7] = kind; }
fx.addGlow = addGlow;
// light under the lake: shallow domes that ride just above the heaving surface (the lake writes depth, so a flat patch at y = 0 would drown)
const NLAKE = 44, lakeArr = new Float32Array(NLAKE * 8); let nLake = 0;
function addLake(x, z, R, H, r, g, b) { if (nLake >= NLAKE) return; const q = nLake++ * 8; lakeArr[q] = x; lakeArr[q + 1] = z; lakeArr[q + 2] = R; lakeArr[q + 3] = H; lakeArr[q + 4] = r; lakeArr[q + 5] = g; lakeArr[q + 6] = b; lakeArr[q + 7] = nLake * .37; }
part('glows', {
  init() {
    const g = new THREE.InstancedBufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3)); g.setIndex([0, 1, 2, 0, 2, 3]);
    const ib = this.ib = new THREE.InstancedInterleavedBuffer(glowArr, 8); ib.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aG', new THREE.InterleavedBufferAttribute(ib, 4, 0)); g.setAttribute('aC', new THREE.InterleavedBufferAttribute(ib, 4, 4));
    const m = K.shaderMat(Object.assign({ uniforms: {}, vertexShader: K.GLSL.fog + /* glsl */`
      attribute vec4 aG, aC; varying vec3 vC; varying vec3 vQ; varying vec3 vWP;
      void main(){ vec3 wp = aG.xyz; float sz = aG.w; vQ = vec3(position.xy, aC.w); vC = aC.rgb*(1. - kFogAmt(wp)*.8);
        if(aC.w > .5 && aC.w < 1.5){ wp += vec3(position.x, 0., position.y)*sz; vWP = wp; gl_Position = projectionMatrix*viewMatrix*vec4(wp, 1.); }
        else { vec3 toC = cameraPosition - wp; float d = length(toC); wp += toC/d*min(sz*.55, d*.5)*(aC.w < .5 ? 1. : 0.);      // pulled toward the lens so it does not cut into what it lights
          vec4 mv = viewMatrix*vec4(wp, 1.); mv.xy += position.xy*sz; vWP = wp + vec3(position.xy*sz, 0.); gl_Position = projectionMatrix*mv; } }`,
      fragmentShader: /* glsl */`varying vec3 vC; varying vec3 vQ; varying vec3 vWP;
      void main(){ float r = length(vQ.xy); if(r > 1.) discard; float f = 1. - r; float a;
        if(vQ.z < .5) a = f*f*f*(.6 + 2.4*f*f*f);
        else if(vQ.z < 1.5){ vec2 x = vWP.xz; float c1 = texture2D(uNoiseTex, x*.031 + vec2(uTime*.021, uTime*.013)).b, c2 = texture2D(uNoiseTex, x*.047 - vec2(uTime*.017, -uTime*.024)).b;
          float ca = pow(clamp(1.25 - abs(c1 - c2)*5.5, 0., 1.), 3.) ; float fb = texture2D(uNoiseTex, x*.012 + uTime*.01).r;
          vec3 rd = normalize(vWP - cameraPosition); float fres = 1. - .75*pow(1. - abs(rd.y), 4.);
          a = f*f*(3. - 2.*f)*(.3 + 1.5*ca*(.4 + fb))*fres; }
        else { float n = texture2D(uNoiseTex, vQ.xy*.35 + vWP.xz*.0004).r, n2 = texture2D(uNoiseTex, vQ.xy*.9 + .3).g; a = f*f*(.35 + 1.6*n*n + .6*n2*f); }
        gl_FragColor = vec4(vC*a, 0.); }` }, PRE));
    const mesh = this.mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 26; mesh.visible = false; K.scene.add(mesh); this.g = g;
    { const pos = [], idx = [], NR = 7, NA = 20; pos.push(0, 0, 0); for (let i = 1; i <= NR; i++) for (let j = 0; j < NA; j++) { const a = j / NA * TAU, r = i / NR; pos.push(Math.cos(a) * r, Math.sin(a) * r, 0); }
      for (let j = 0; j < NA; j++) idx.push(0, 1 + j, 1 + (j + 1) % NA); for (let i = 1; i < NR; i++) for (let j = 0; j < NA; j++) { const a = 1 + (i - 1) * NA + j, b = 1 + (i - 1) * NA + (j + 1) % NA, c = a + NA, d = b + NA; idx.push(a, c, b, b, c, d); }
      const g2 = new THREE.InstancedBufferGeometry(); g2.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g2.setIndex(idx);
      const ib2 = this.ibL = new THREE.InstancedInterleavedBuffer(lakeArr, 8); ib2.setUsage(THREE.DynamicDrawUsage);
      g2.setAttribute('aG', new THREE.InterleavedBufferAttribute(ib2, 4, 0)); g2.setAttribute('aC', new THREE.InterleavedBufferAttribute(ib2, 4, 4));
      const m2 = K.shaderMat(Object.assign({ uniforms: {}, vertexShader: K.GLSL.fog + /* glsl */`
        attribute vec4 aG, aC; varying vec3 vC; varying vec3 vQ; varying vec3 vWP;
        void main(){ float r2 = dot(position.xy, position.xy), k = (1. - r2); vec3 wp = vec3(aG.x + position.x*aG.z, -.35 + aG.w*k*k, aG.y + position.y*aG.z);
          vQ = vec3(position.xy, aC.w); vC = aC.rgb*(1. - kFogAmt(wp)*.8); vWP = wp; gl_Position = projectionMatrix*viewMatrix*vec4(wp, 1.); }`,
        fragmentShader: /* glsl */`varying vec3 vC; varying vec3 vQ; varying vec3 vWP;
        void main(){ float r = length(vQ.xy), f = max(1. - r, 0.); vec2 x = vWP.xz;
          float c1 = texture2D(uNoiseTex, x*.027 + vec2(uTime*.031, uTime*.019) + vQ.z).b, c2 = texture2D(uNoiseTex, x*.041 - vec2(uTime*.027, -uTime*.034)).b;
          float ca = pow(clamp(1.3 - abs(c1 - c2)*5., 0., 1.), 3.), fb = texture2D(uNoiseTex, x*.011 + uTime*.013).r;       // light broken up by the ripples above it
          float a = f*f*(3. - 2.*f)*(.45 + 1.5*ca*(.35 + fb));
          gl_FragColor = vec4(vC*a, 0.); }` }, PRE));
      const lm = this.lake = new THREE.Mesh(g2, m2); lm.frustumCulled = false; lm.renderOrder = -10; lm.visible = false; K.scene.add(lm); this.gL = g2; }
  },
  update(F) {
    const t = F.t, B = S.ball;
    // the jaws glow while they breathe
    for (let i = 0; i < 2; i++) { const b = S.beam[i]; if (!b.on) continue; const k = b.pow * Math.min(1, b.pk * 1.1) * Math.max(0, 1 - b.tail * 3) * .8; if (k > .01) { _v[0].copy(b.A).addScaledVector(b.d0, 2.2); i ? addGlow(_v[0], 7, 1.6 * k, 1.3 * k, .8 * k) : addGlow(_v[0], 6, 1.5 * k, .55 * k, .12 * k); } }
    if (B.on) addGlow(B.c, B.R * 3.2, .1 * B.pow, .08 * B.pow, .05 * B.pow);
    // ---- light under the lake: the red loong smoulders below the surface before it erupts; red and gold boil and flash while they fight down there
    nLake = 0;
    if (S.hasD && (t < 9 || (t > 59.8 && t < 67.5))) { const L = S.light[2]; let wsum = 0; const c = _v[1].set(0, 0, 0); let cr = 0, cg = 0, cb = 0; const boil = K.water && K.water.boil;
      for (let d = 0; d < 2; d++) { const D = d ? K.rival : K.dragon; if (d && !F.rival.vis) continue;
        const fight = smooth(59.8, 60.8, t) * (1 - smooth(66, 67.5, t));     // a smoulder before the eruption, a furnace while they fight below
        for (let s = 0; s <= 144; s += 12) { const p = D.spine(s, _v[0]); if (p.y > -1.2) continue; const dep = -p.y, k = (.3 + 1.1 * fight) * sat((dep - 1.2) / 4) * Math.exp(-dep / 90) * (1 - s / 200) * (.65 + .35 * Math.sin(t * 6.3 + s * .23 + d * 2));
          if (t < 9 && s > 48) continue; const I = k * (s === 0 ? 1.8 : 1), rad = 6 + Math.min(dep, 45) * .3, H = .55 + (boil ? 5.5 * boil(p.x, p.z, t) : 0) + (t < T.rise + 2 ? 2.2 * smooth(T.rise - 1.3, T.rise, t) * Math.exp(-((p.x - P.rise.x) ** 2 + (p.z - P.rise.z) ** 2) / 90) : 0);
          if (d) { addLake(p.x, p.z, rad, H, 1.9 * I, 1.25 * I, .36 * I); if (s % 36 === 0) addGlow(_v[2].set(p.x, 3 + 4 * fight, p.z), rad * (.9 + .6 * fight), (.4 + .1 * fight) * I, (.27 + .07 * fight) * I, (.08 + .02 * fight) * I); cr += 1 * I; cg += .7 * I; cb += .25 * I; }
          else { addLake(p.x, p.z, rad, H, 2.4 * I, .36 * I, .05 * I); if (s % 36 === 0) addGlow(_v[2].set(p.x, 3 + 4 * fight, p.z), rad * (.9 + .6 * fight), (.5 + .12 * fight) * I, (.08 + .02 * fight) * I, (.012 + .004 * fight) * I); cr += 1 * I; cg += .22 * I; cb += .04 * I; }
          c.addScaledVector(p, I); wsum += I; } }
      // blows landing under water: white-gold flashes between the two heads
      if (t > T.plunge + .25 && t < T.burst + .1) { for (let j = 0; j < 2; j++) { const k = Math.floor(t / .23) - j, a = t - k * .23; if (h1(k, 91) > .62) continue;
          const u = h1(k, 92), I = 2.6 * Math.exp(-a * 11) * smooth(0, .03, a), p = _v[0].copy(F.dragon.p).lerp(F.rival.p, u); p.x += (h1(k, 93) - .5) * 14; p.z += (h1(k, 94) - .5) * 14;
          addLake(p.x, p.z, 16 + 12 * h1(k, 95), 6, 3 * I, 2.5 * I, 1.7 * I); addGlow(_v[2].set(p.x, 3, p.z), 16, 1.1 * I, .9 * I, .6 * I); c.addScaledVector(p, I * 2); wsum += I * 2; cr += 2 * I; cg += 1.7 * I; cb += 1.2 * I; } }
      if (wsum > .01 && L.i < 1) { L.p.copy(c).multiplyScalar(1 / wsum); L.p.y = 3; const m = Math.max(cr, cg, cb); L.c.setRGB(cr / m, cg / m, cb / m); L.i = Math.min(wsum, 4) * 260; } }
    this.lake.visible = nLake > 0; this.gL.instanceCount = nLake; if (nLake) { this.ibL.clearUpdateRanges(); this.ibL.addUpdateRange(0, nLake * 8); this.ibL.needsUpdate = true; }
    for (const f of fx.glowMakers) f(F);
    this.mesh.visible = nGlow > 0; this.g.instanceCount = nGlow; if (nGlow) { this.ib.clearUpdateRanges(); this.ib.addUpdateRange(0, nGlow * 8); this.ib.needsUpdate = true; }
  }
});
fx.glowMakers = [];

// ---------------------------------------------------------------- 5 + 6. lightning: the forks of the collision, bolts of the storm
part('lightning', {
  init() {
    // where the collision's forks ground themselves: the pagoda finial and the pillar tops round Temple Peak, then open air
    const tg = this.targets = []; const PG = K.arch && K.arch.pagoda;
    if (PG && PG.tiers && PG.tiers.length) tg.push(new V3(PG.x, PG.tiers[PG.tiers.length - 1].topY, PG.z)); else tg.push(new V3(0, 178, 0));
    for (const n of ['needleE', 'needleW', 'wallR', 'wallL', 'shelf']) { const s = W[n]; if (s) tg.push(new V3(s.x + s.topR * .3, s.h + 1, s.z)); }
    const near = W.spires.filter(s => s.name[0] === 'p').map(s => ({ s, d: Math.hypot(s.x - P.impact.x, s.z - P.impact.z) })).sort((a, b) => a.d - b.d).slice(0, 5); for (const n of near) tg.push(new V3(n.s.x, n.s.h + 1, n.s.z));
    this.nGround = tg.length; const r = K.rng(6021);
    for (let i = 0; i < 9; i++) { const a = i / 9 * TAU + r(), el = -.5 + 1.1 * r(), d = 150 + 230 * r(); tg.push(new V3(P.impact.x + Math.cos(a) * Math.cos(el) * d, P.impact.y + Math.sin(el) * d, P.impact.z + Math.sin(a) * Math.cos(el) * d)); }
    fx.boltMakers.push(F => this.bolts(F));
  },
  strobe(a, sd) { return Math.exp(-a * 9) + .75 * Math.exp(-Math.pow((a - .11 - .05 * h1(sd, 41)) / .022, 2)) + .5 * Math.exp(-Math.pow((a - .24 - .08 * h1(sd, 42)) / .03, 2)) + .12 * Math.exp(-a * 3.2); },
  bolts(F) {
    const t = F.t, tb = S.tb, e = K.env, L = S.light[3]; let flash = 0; fx.bolt.amt = 0;
    // ---- the collision: forks strike outward and down to the pillar tops
    if (tb > -.01 && tb < 2.1) { const tg = this.targets; let li = 0;
      for (let j = 0; j < tg.length; j++) { const ts = j < 3 ? .02 * j : .06 + (j < this.nGround ? .9 : .6) * h1(j, 51), a = tb - ts; if (a < 0 || a > .7) continue;
        const st = this.strobe(a, j * 7), sd = j * 977 + (a < .09 ? 0 : a < .2 ? 1 : 2), ground = j < this.nGround;
        const s = _v[0].copy(tg[j]).sub(P.impact).normalize().multiplyScalar(5 + 8 * Math.min(tb, 1)).add(P.impact);
        addBolt(sd, s, tg[j], { lv: ground ? 6 : 5, disp: .1, rough: .56, w: ground ? .34 : .22, I: (ground ? 70 : 38) * st, col: j % 3 === 1 ? 0 : 1, taper: ground ? .25 : .9, br: ground ? 5 : 3, brLen: .3, grav: .5, glow: 1 });
        if (ground && st > .25) addGlow(tg[j], 9, 2.2 * st, 2.3 * st, 2.8 * st);
        flash = Math.max(flash, st * (ground ? 1 : .5)); li += st; }
      if (li > .02) { L.p.set(P.impact.x, P.impact.y - 20, P.impact.z); L.c.setRGB(.72, .82, 1); L.i = Math.min(li, 3) * 60000; } }
    // ---- storm: bolts inside and below the cloud, in time buckets
    const st = e.storm;
    if (st > .5 && t < T.impact - .5) { const PER = .95, cam = F.cam, az0 = Math.atan2(cam.tgt.x - cam.pos.x, -(cam.tgt.z - cam.pos.z));
      for (let k = Math.floor(t / PER) - 1; k <= Math.floor(t / PER); k++) { if (h1(k, 61) > (st - .42) * 1.45) continue; const ts = k * PER + .4 * h1(k, 62), a = t - ts; if (a < 0 || a > .62) continue;
        const s = this.strobe(a, k), az = az0 + (h1(k, 63) - .5) * 1.5, d = 330 + 950 * h1(k, 64) * h1(k, 65);
        const top = _v[0].set(cam.pos.x + Math.sin(az) * d, 700 + 170 * h1(k, 66), cam.pos.z - Math.cos(az) * d), end = _v[1];
        let hit = null; if (h1(k, 67) < .5) { let bd = 420; for (const sp of W.spires) { const dd = Math.hypot(sp.x - top.x, sp.z - top.z); if (dd < bd && sp.h > 100) { bd = dd; hit = sp; } } }
        if (hit) end.set(hit.x, hit.h + 1, hit.z); else end.set(top.x + (h1(k, 68) - .5) * 420, top.y - 240 - 330 * h1(k, 69), top.z + (h1(k, 70) - .5) * 420);
        addBolt(k * 7919 + (a < .09 ? 0 : 1), top, end, { lv: 7, disp: .085, rough: .55, w: .9 + .0012 * d, I: 62 * s, col: h1(k, 71) < .3 ? 3 : 1, taper: hit ? .3 : .85, br: 6, brLen: .34, grav: .75, glow: 1 });
        addGlow(top, 200 + 160 * h1(k, 72), .5 * s, .56 * s, .8 * s, 2); if (hit && s > .2) addGlow(end, 22, 2 * s, 2.1 * s, 2.6 * s);
        if (s > flash) { flash = s; fx.bolt.pos.copy(top).lerp(end, .5); }
        if (s >= flash) { const mid = _v[2].copy(top).lerp(end, .6); L.p.copy(mid); L.c.setRGB(.7, .8, 1); const dd = mid.distanceTo(cam.tgt); L.i = s * 2.6 * dd * dd; } } }
    fx.flash = flash; fx.bolt.amt = flash;
  }
});

// ---------------------------------------------------------------- 7. the sun shower
// A top-down height map of the set (Temple Peak, the bridge, Gate Rock) is rendered once at init: rain is stopped by roofs,
// splashes sit on whatever is uppermost (tiles, paving, planks, rock, the lake), eaves drip, warm stone steams.
const HBOX = { x0: -112, x1: 72, z0: -56, z1: 232, NX: 1024, NZ: 1536 };
function bakeHeight() {
  const B = HBOX, float = R.extensions.has('EXT_color_buffer_float');
  const rt = new THREE.WebGLRenderTarget(B.NX, B.NZ, { type: float ? THREE.FloatType : THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, generateMipmaps: false });
  const cam = new THREE.OrthographicCamera(-(B.x1 - B.x0) / 2, (B.x1 - B.x0) / 2, (B.z1 - B.z0) / 2, -(B.z1 - B.z0) / 2, 1, 700);
  cam.position.set((B.x0 + B.x1) / 2, 600, (B.z0 + B.z1) / 2); cam.up.set(0, 0, -1); cam.lookAt((B.x0 + B.x1) / 2, 0, (B.z0 + B.z1) / 2); cam.updateMatrixWorld();
  const om = new THREE.ShaderMaterial({ side: THREE.DoubleSide, vertexShader: /* glsl */`varying float vY;
    void main(){ vec4 p = vec4(position, 1.);
      #ifdef USE_INSTANCING
      p = instanceMatrix*p;
      #endif
      vec4 w = modelMatrix*p; vY = w.y; gl_Position = projectionMatrix*viewMatrix*w; }`, fragmentShader: 'varying float vY; void main(){ gl_FragColor = vec4(vY, 0., 0., 1.); }' });
  // only solid, opaque, standard-material meshes count (no leaves, no water, no particles, no sky)
  const hidden = []; K.scene.traverse(o => { if (!o.visible) return; const m = o.material; const solid = o.isMesh && m && !Array.isArray(m) && m.isMeshStandardMaterial && !m.transparent && !(m.alphaTest > 0) && (o.isInstancedMesh || !o.geometry.isInstancedBufferGeometry) && o.layers.test(cam.layers);
    if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && !solid) { hidden.push(o); o.visible = false; } });
  const pRT = R.getRenderTarget(), pAU = R.shadowMap.autoUpdate, pOM = K.scene.overrideMaterial, pBG = K.scene.background, cc = new THREE.Color(); R.getClearColor(cc); const ca = R.getClearAlpha();
  R.shadowMap.autoUpdate = false; K.scene.overrideMaterial = om; K.scene.background = null; R.setRenderTarget(rt); R.setClearColor(new THREE.Color(-1000, 0, 0), 1); R.clear(); R.render(K.scene, cam);
  // read back three windows for the drips and the steam: summit, mid terrace + bridge head, gate terrace
  const wins = [], rd = (cx, cz, half) => { if (!float) return; const tx = B.NX / (B.x1 - B.x0), tz = B.NZ / (B.z1 - B.z0), w = Math.min(320, Math.round(half * 2 * tx)), h = Math.min(320, Math.round(half * 2 * tz));
    const px = Math.max(0, Math.min(B.NX - w, Math.round((cx - B.x0) * tx - w / 2))), py = Math.max(0, Math.min(B.NZ - h, Math.round((B.z1 - cz) * tz - h / 2))), buf = new Float32Array(w * h * 4);
    try { R.readRenderTargetPixels(rt, px, py, w, h, buf); wins.push({ px, py, w, h, buf }); } catch (e) { } };
  rd(0, 0, 28); rd(2, 46, 28); rd(-62, 190, 28);
  R.setRenderTarget(pRT); R.setClearColor(cc, ca); R.shadowMap.autoUpdate = pAU; K.scene.overrideMaterial = pOM; K.scene.background = pBG; for (const o of hidden) o.visible = true; om.dispose();
  const toWorld = (win, i, j, out) => out.set(B.x0 + (win.px + i + .5) / B.NX * (B.x1 - B.x0), win.buf[(j * win.w + i) * 4], B.z1 - (win.py + j + .5) / B.NZ * (B.z1 - B.z0));
  return { tex: rt.texture, box: new V4(B.x0, B.z1, 1 / (B.x1 - B.x0), -1 / (B.z1 - B.z0)), wins, toWorld };
}
const HGLSL = /* glsl */`uniform sampler2D tHgt; uniform vec4 uHBox;
float hgt(vec2 xz){ vec2 uv = (xz - uHBox.xy)*uHBox.zw; if(uv.x < 0. || uv.x > 1. || uv.y < 0. || uv.y > 1.) return -1000.; return texture2D(tHgt, uv).r; }
`;
function bakeRainTex() {    // tileable veil of streaks: r = fine streaks, g = clumping of the curtain
  return K.bake(512, 512, /* glsl */`
    float pn(vec2 p, vec2 per){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
      float a = kHash12(mod(i, per)), b = kHash12(mod(i+vec2(1,0), per)), c = kHash12(mod(i+vec2(0,1), per)), d = kHash12(mod(i+vec2(1,1), per)); return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }
    vec4 bake(vec2 uv){ float s = 0.;
      for(int l=0;l<3;l++){ float n = 90.*pow(1.7, float(l)), col = floor(uv.x*n), h = kHash12(vec2(col, float(l)*7.)), h2 = kHash12(vec2(col, 3. + float(l)));
        float y = fract(uv.y*(1. + floor(h2*3.)) + h), len = .08 + .22*h2; float seg = smoothstep(0., .02, y)*(1. - smoothstep(len*.6, len, y));
        float x = abs(fract(uv.x*n) - .5); s += seg*(1. - smoothstep(.12, .42, x))*step(.45, h)*(.5 + .5*h2)/(1. + float(l)*.5); }
      float cl = pn(uv*vec2(6., 2.), vec2(6., 2.))*.6 + pn(uv*vec2(17., 3.) + .3, vec2(17., 3.))*.4;
      return vec4(clamp(s, 0., 1.), cl, 0., 1.); }`);
}
part('rain', {
  init() {
    const H = fx.height = bakeHeight(); this.H = H; const rnd = K.rng(6031);
    const hu = { tHgt: { value: H.tex }, uHBox: { value: H.box } };
    const uRain = this.uRain = { value: new V4() }, uWindR = this.uWindR = { value: new V3() };   // uRain: amount, wet, time, sun gate
    // ---- streaks: a box of drops that travels with the camera (positions wrap, so each drop is a pure function of time)
    { const N = 11000, g = quadGeo(N, (i, s, k) => { s[0] = rnd(); s[1] = rnd(); s[2] = rnd(); s[3] = rnd(); k[0] = .8 + .4 * rnd(); k[1] = rnd(); k[2] = rnd(); k[3] = rnd(); });
      const m = K.shaderMat(Object.assign({ uniforms: Object.assign({ uRain, uWindR, uRes }, hu), vertexShader: K.GLSL.fog + HGLSL + /* glsl */`
        attribute vec4 aS, aK; uniform vec4 uRain; uniform vec3 uWindR; uniform vec2 uRes; varying vec3 vC; varying vec2 vQ;
        const vec3 BOX = vec3(64., 46., 64.);
        void main(){ float sp = 21.*aK.x; vec3 v = vec3(uWindR.x, -1., uWindR.z)*sp;
          vec3 p = aS.xyz*BOX + v*uTime; p = cameraPosition + mod(p - cameraPosition + BOX*.5, BOX) - BOX*.5;
          float on = step(aS.w, uRain.x)*step(hgt(p.xz), p.y - .15);                         // nothing falls through a roof
          vec4 mv = viewMatrix*vec4(p, 1.); vec3 vv = mat3(viewMatrix)*v; vec2 ax = normalize(vv.xy + 1e-5);
          float dist = max(-mv.z, .1), len = (.016 + .012*aK.y)*length(vv.xy) + .02, w = .0045 + .004*aK.z;
          float px = w*projectionMatrix[1][1]*uRes.y*.5/dist, kk = max(1., .75/px);
          vec3 rd = normalize(p - cameraPosition); float mu = dot(rd, uSunDir);
          float ph = .10 + .55*pow(max(mu, 0.), 4.) + .16*pow(max(-mu, 0.), 2.);          // glare toward the sun, a softer return away from it
          float fade = smoothstep(1., 3.5, dist)*(1. - smoothstep(24., 32., length(p - cameraPosition)));
          vC = (uSunCol*ph*uRain.w + uSkyCol*.22)*(.5 + .9*aK.w)*fade*on/kk*(1. - kFogAmt(p)*.7);
          mv.xy += ax*position.y*len + vec2(ax.y, -ax.x)*position.x*w*kk; vQ = position.xy;
          gl_Position = on*fade > .001 ? projectionMatrix*mv : vec4(0., 0., 2., 1.); }`,
        fragmentShader: /* glsl */`varying vec3 vC; varying vec2 vQ;
        void main(){ float a = (1. - vQ.x*vQ.x)*smoothstep(1., .5, abs(vQ.y))*(.55 + .45*smoothstep(-1., 1., vQ.y)); gl_FragColor = vec4(vC*a, 0.); }` }, PRE));
      const mesh = this.streaks = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 44; mesh.visible = false; K.scene.add(mesh); }
    // ---- far veils: curtains of rain standing in the air between the pillars (fixed in the world on a jittered grid)
    { const N = 150, g = quadGeo(N, (i, s, k) => { s[0] = rnd(); s[1] = rnd(); s[2] = rnd(); s[3] = rnd(); k[0] = (i % 12) - 5.5; k[1] = Math.floor(i / 12) - 5.5 + (rnd() - .5); k[2] = rnd(); k[3] = rnd(); });
      tex.rain = bakeRainTex();
      const m = K.shaderMat(Object.assign({ uniforms: { uRain, uWindR, tRain: { value: tex.rain } }, vertexShader: K.GLSL.fog + /* glsl */`
        attribute vec4 aS, aK; uniform vec4 uRain; uniform vec3 uWindR; varying vec3 vC; varying vec4 vUV;
        void main(){ const float G = 46.; vec2 cell = floor(cameraPosition.xz/G) + aK.xy; vec2 c = (cell + .5 + (kHash22(cell) - .5)*.9)*G;
          float d = length(c - cameraPosition.xz); vec2 fw = normalize(c - cameraPosition.xz), rt = vec2(-fw.y, fw.x);
          float W = 46. + 30.*aS.x, Hh = 95. + 50.*aS.y, yc = cameraPosition.y + 10. + (aS.z - .5)*30.;
          vec3 p = vec3(c.x, yc, c.y) + vec3(rt.x, 0., rt.y)*position.x*W + vec3(0., position.y*Hh, 0.);
          p.xz += uWindR.xz*(position.y*Hh)*-1.;                                               // the curtain leans with the wind
          float fade = smoothstep(28., 60., d)*(1. - smoothstep(190., 265., d))*uRain.x*step(.45, kHash12(cell + 3.7))*1.6;   // about half the cells carry a curtain
          vec3 rd = normalize(p - cameraPosition); float mu = dot(rd, uSunDir);
          vC = (uSunCol*(.04 + .22*pow(max(mu, 0.), 3.) + .05*pow(max(-mu, 0.), 2.))*uRain.w + uSkyCol*.08)*fade*(1. - kFogAmt(p)*.6);
          vUV = vec4(position.xy, W/14., Hh/14.); gl_Position = fade > .002 ? projectionMatrix*viewMatrix*vec4(p, 1.) : vec4(0., 0., 2., 1.); }`,
        fragmentShader: /* glsl */`uniform sampler2D tRain; varying vec3 vC; varying vec4 vUV;
        void main(){ vec2 q = vUV.xy; vec2 uv = (q*.5 + .5)*vUV.zw; uv.y += uTime*1.35; vec4 a = texture2D(tRain, uv), b = texture2D(tRain, uv*vec2(.53, .41) + vec2(.37, uTime*.5));
          float edge = (1. - q.x*q.x)*(1. - q.x*q.x)*(1. - pow(abs(q.y), 3.)); float v = (a.r*1.5 + b.r*.9 + .12)*(.35 + 1.1*b.g*a.g);
          gl_FragColor = vec4(vC*v*edge, 0.); }` }, PRE));
      const mesh = this.veils = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 25; mesh.visible = false; K.scene.add(mesh); }
    // ---- splashes where drops land (crowns on roofs, paving and planks; rings on the lake) and drips off the eaves
    const drips = [], steam = []; { const o = new V3(), o2 = new V3();
      for (const w of H.wins) for (let n = 0; n < 9000; n++) { const i = 3 + Math.floor(rnd() * (w.w - 6)), j = 3 + Math.floor(rnd() * (w.h - 6)); H.toWorld(w, i, j, o); if (o.y < 20) continue;
        // an edge: the height falls away by more than 1.2 m within three texels on one side
        let drop = 0; for (const [di, dj] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) { H.toWorld(w, i + di, j + dj, o2); if (o.y - o2.y > 1.2 && o2.y > -900) { drop = Math.max(drop, o.y - o2.y); o.x += (o2.x - o.x) * .5; o.z += (o2.z - o.z) * .5; break; } }
        if (drop > 0 && drips.length < 900 * 4) drips.push(o.x, o.y - .08, o.z, Math.min(drop, 6));
        else if (!drop && steam.length < 260 * 3 && rnd() < .08) { H.toWorld(w, i + 2, j, o2); const sl = Math.abs(o.y - o2.y); H.toWorld(w, i, j + 2, o2); if (sl + Math.abs(o.y - o2.y) < .12) steam.push(o.x, o.y, o.z); } } }
    this.nDrip = drips.length / 4;
    { const N = 7000 + this.nDrip, g = quadGeo(N, (i, s, k, p) => { s[0] = rnd(); s[1] = rnd(); s[2] = rnd(); s[3] = rnd();
        if (i < 7000) { k[0] = 0; k[1] = .22 + .26 * rnd(); k[2] = .022 + .03 * rnd(); k[3] = rnd(); } else { const q = (i - 7000) * 4; k[0] = 1; k[1] = .55 + .9 * rnd(); k[2] = .012 + .01 * rnd(); k[3] = drips[q + 3]; p[0] = drips[q]; p[1] = drips[q + 1]; p[2] = drips[q + 2]; } });
      const m = K.shaderMat(Object.assign({ uniforms: Object.assign({ uRain, uRes }, hu), vertexShader: K.GLSL.fog + HGLSL + /* glsl */`
        attribute vec4 aS, aK; attribute vec3 aP; uniform vec4 uRain; uniform vec2 uRes; varying vec3 vC; varying vec3 vQ;
        void main(){ float kind = aK.x, t = uTime, L = aK.y, ph = fract(t/L + aS.w), cyc = floor(t/L + aS.w); vec3 p; float sz = aK.z, lum = 0., shape = 0., hgtY = 1.; bool flat_ = false;
          if(kind < .5){ const float G = 10.; vec2 h = kHash22(vec2(cyc*.37 + aS.x*91., aS.y*57. + cyc*.11)); float rr = sqrt(h.x)*46.; float an = h.y*6.2832;
            vec2 xz = floor(cameraPosition.xz/G)*G + vec2(cos(an), sin(an))*rr; float y = hgt(xz);
            if(y > -900. && aS.z < uRain.x){ bool lake = y < .06; y = max(y, 0.);
              bool level = abs(hgt(xz + vec2(.4, 0.)) - y) + abs(hgt(xz + vec2(0., .4)) - y) < .05;
              flat_ = lake || (level && aS.w > .4);                                             // rings on the lake and on wet paving, little crowns everywhere else
              p = vec3(xz.x, y + (flat_ ? .03 : sz*.7), xz.y);
              if(flat_){ sz *= (lake ? 3.4 : 1.8)*(.25 + ph); shape = 1.; lum = (1. - ph)*(lake ? .6 : .75); }
              else { sz *= .5 + .9*ph; hgtY = 1.25; lum = (1. - ph)*1.3; } }
          } else { float fall = aK.w, T = sqrt(2.*fall/9.8), a = ph*L;                     // a drip: swells on the eave, lets go, falls, bursts
            if(a < T){ p = aP - vec3(0., 4.9*a*a, 0.); hgtY = 1. + 22.*a; lum = 1.3; } else { p = aP - vec3(0., fall - .03, 0.); float b = (a - T)/max(L - T, .05); sz *= 3. + 9.*b; lum = 1.2*(1. - b); hgtY = .8; }
            lum *= min(uRain.y*1.6, 1.); }
          vec4 mv = viewMatrix*vec4(p, 1.); float dist = max(-mv.z, .1), px = sz*projectionMatrix[1][1]*uRes.y*.5/dist, kk = max(1., 1.1/px);
          vec3 rd = normalize(p - cameraPosition); float mu = dot(rd, uSunDir);
          vC = (uSunCol*(.16 + .5*pow(max(mu, 0.), 3.))*uRain.w + uSkyCol*.4)*lum*max(1./kk, .22)*smoothstep(.6, 2., dist)*(1. - smoothstep(70., 110., dist)*step(kind, .5))*(1. - kFogAmt(p)*.7);
          vQ = vec3(position.xy, shape);
          if(flat_){ vec3 wp = p + vec3(position.x, 0., position.y)*sz*kk; gl_Position = projectionMatrix*viewMatrix*vec4(wp, 1.); }
          else { mv.xy += position.xy*vec2(1., hgtY)*sz*kk; gl_Position = projectionMatrix*mv; }
          if(lum < .003) gl_Position = vec4(0., 0., 2., 1.); }`,
        fragmentShader: /* glsl */`varying vec3 vC; varying vec3 vQ;
        void main(){ float r = length(vQ.xy), a;
          if(vQ.z > .5) a = smoothstep(.45, .78, r)*(1. - smoothstep(.8, 1., r))*.55;                        // ring on water / wet stone
          else { float y = vQ.y*.5 + .5, xw = abs(vQ.x); float wall = exp(-pow((xw - .18 - .62*y)/.1, 2.))*smoothstep(0., .12, y)*(1. - y);                 // a little crown: two thin walls opening upward, a bead at the foot
            a = wall*.9 + exp(-(vQ.x*vQ.x + (y - .1)*(y - .1))*26.)*.7; }
          gl_FragColor = vec4(vC*a, 0.); }` }, PRE));
      const mesh = this.splash = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 43; mesh.visible = false; K.scene.add(mesh); }
    // ---- steam off warm stone (drawn by the soft sprites)
    { const soft = fx.parts.soft; if (soft && soft.ok && steam.length) { let n = 0; const cnt = steam.length / 3;
        this.steam = soft.grp(cnt * 2, (i, k, p) => { const q = (i % cnt) * 3; k[0] = 6; k[1] = 4.5 + 4 * rnd(); k[2] = 0; k[3] = 0; p[0] = steam[q] + (rnd() - .5); p[1] = steam[q + 1]; p[2] = steam[q + 2] + (rnd() - .5); n++; }, 24); } }
    // ---- the rainbow: primary 40.6-42.4 deg and a faint reversed secondary 50.3-53.5 deg round the anti-solar point, on two shells of rain at 140 and 480 m (nearer things stay clear of it, farther ones are veiled by it)
    { const g = new THREE.IcosahedronGeometry(1, 5);
      this.bows = [[140, .42], [480, .58]].map(([rad, wgt], i) => { const u = { uBow: { value: new V4(rad, wgt, 0, 0) } };
        const m = K.shaderMat(Object.assign({ uniforms: u, vertexShader: /* glsl */`uniform vec4 uBow; varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix*viewMatrix*vec4(cameraPosition + position*uBow.x, 1.); }`,
          fragmentShader: /* glsl */`uniform vec4 uBow; varying vec3 vD;
          vec3 spectrum(float x){ x = clamp(x, 0., 1.); return clamp(vec3(1.55 - abs(x - .84)*4., 1.3 - abs(x - .5)*3.8, 1.5 - abs(x - .2)*4.2), 0., 1.) + vec3(.5, 0., .8)*clamp(1. - abs(x - .04)*12., 0., 1.)*.45; }
          void main(){ vec3 rd = normalize(vD); float ang = degrees(acos(clamp(dot(rd, -uSunDir), -1., 1.)));
            float x1 = (ang - 40.3)/2.3, w1 = smoothstep(-.3, .12, x1)*(1. - smoothstep(.9, 1.25, x1));
            float x2 = 1. - (ang - 50.)/3.6, w2 = smoothstep(-.25, .15, x2)*(1. - smoothstep(.85, 1.25, x2));
            vec3 c = spectrum(x1)*w1 + spectrum(x2)*w2*.17;
            c += vec3(.75, .9, .8)*.12*(.5 + .5*cos((40.3 - ang)*7.5))*smoothstep(37.6, 40.3, ang)*(1. - smoothstep(40.2, 40.6, ang));   // supernumerary fringes
            c += vec3(.9, .95, 1.)*.06*(1. - smoothstep(30., 40.5, ang));                                       // the sky is brighter inside the bow
            float n = texture2D(uNoiseTex, rd.xz*1.5 + rd.y).r; c *= .7 + .6*n;                                  // rain is uneven
            c *= smoothstep(-.42, -.05, rd.y);
            gl_FragColor = vec4(c*uBow.y*uBow.z*dot(uSunCol, vec3(.1)), 0.); }` }, PRE, { side: THREE.BackSide }));
        const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 22 - i; mesh.visible = false; K.scene.add(mesh); return mesh; }); }
  },
  update(F) {
    const e = K.env, t = F.t, rain = e.rain || 0, wetK = Math.max(rain, (e.wet || 0) * (1 - smooth(75.5, 79, t)) * .8), sunGate = sat(e.sunInt / 3.2) * (1 - .55 * e.storm);
    this.uRain.value.set(rain, wetK, t, .35 + .65 * sunGate); this.uWindR.value.set(e.windDir.x * e.wind * .32, 0, e.windDir.y * e.wind * .32);
    const on = rain > .004; this.streaks.visible = on; this.veils.visible = on; this.splash.visible = on || (wetK > .05 && t > T.rain0);
    if (this.steam) this.steam.visible = wetK > .03 && t > T.rain0 && t < 84;
    const bow = smooth(.02, .4, rain) * (1 - smooth(.5, .97, e.storm)) * sat(e.sunDir.y * 6);
    for (const b of this.bows) { b.visible = bow > .004; b.material.uniforms.uBow.value.z = bow; }
    fx.rainbow = bow;
  }
});

// ---------------------------------------------------------------- 8. the light pool
// air (65) still zeroes K.lights.pt at the end of its update, which runs after ours: apply at the last moment
// (film.late hook and scene.onBeforeRender, both idempotent).
function applyLights() { const pt = K.lights.pt; for (let i = 0; i < 4; i++) { const l = S.light[i], p = pt[i]; p.position.copy(l.p); p.color.copy(l.c); p.intensity = l.i; p.distance = 0; p.decay = 2; } }

K.reg('fx', {
  init() {
    for (const p of parts) { const t0 = performance.now(); try { p.init && p.init(); p.ok = true; } catch (e) { p.ok = false; K.fail('fx.' + p.name + '.init', e); } p.ms = performance.now() - t0; }
    const prevLate = film.late; film.late = F => { prevLate && prevLate(F); if (K.mod.fx && K.mod.fx.ok) applyLights(); };
    const prevOBR = K.scene.onBeforeRender; K.scene.onBeforeRender = function () { prevOBR && prevOBR.apply(this, arguments); if (K.mod.fx && K.mod.fx.ok) applyLights(); };
    if (K.debug) K.debug.fx = fx;
  },
  update(F) {
    R.getDrawingBufferSize(uRes.value);
    state(F);
    for (const p of parts) if (p.ok && p.update) { if (fx.off && fx.off[p.name]) { for (const k in p) { const o = p[k]; if (o && o.isMesh) o.visible = false; else if (Array.isArray(o)) for (const q of o) if (q && q.isMesh) q.visible = false; } continue; }   // debug: K.fx.off = { beams: 1, ... }
      try { p.update(F); } catch (e) { p.errs = (p.errs || 0) + 1; if (p.errs <= 2) K.fail('fx.' + p.name, e); if (p.errs > 20) p.ok = false; } }
    applyLights();
  }
});

})(window.K=window.K||{},window.THREE);
//# sourceURL=src/60_fx.js

(function(K,THREE){'use strict';
// ============================================================================
// 65_air — everything that floats: the lake of cloud (a lit, animated mist surface over the far valleys
// + 6-way-lit volumetric puffs curling round the pillars), sun shafts, cranes at three depths, a hawk,
// swallows, sky lanterns and kites, drifting leaves / petals / butterflies / seeds / motes, incense smoke
// and lantern halos. Everything is a closed-form function of film time.
// Film-wide: all timed events read K.film.T / K.film.shots. Cranes on the lake scatter at T.rise; no birds in the storm sky (helix cut ->
// parting cut); the cloud tower the rival bursts out of at T.rival; beams through the breaking storm (T.rain0..T.rain1); at dusk the mist sea
// turns peach with pillar shadows, halos swell with K.env.lanterns, fireflies wake, and from T.lanterns 430 sky lanterns rise in a river.
// Exports K.air = { seaH(x,z,t), flocks, sprites, ... }.
// ============================================================================
const V3 = THREE.Vector3, { sat, lerp, smooth, rng } = K, W = K.world, U = K.U, R = K.renderer;
const air = K.air = { mist: 1, shafts: 1, life: 1 };
const KEYC = new V3(-58, 66.4, 184), KEYT = new V3(-4, 86, 60);
// film times (everything that is timed reads the director's table; the fallbacks are only for running without the film's beat sheet)
const FT = (K.film && K.film.T) || {}, FP = (K.film && K.film.P) || {}, tOf = (k, d) => FT[k] !== undefined ? FT[k] : d;
const shotT = (name, d) => { const sh = K.film && K.film.shots; if (sh) for (const x of sh) if (x[1] === name) return x[0]; return d; };
const TKEY = tOf('key', 25), TRISE = tOf('rise', 2.2), TRIVAL = tOf('rival', 37.5), TRAIN0 = tOf('rain0', 69.6), TRAIN1 = tOf('rain1', 76), TLAN = tOf('lanterns', 80);
const T_KEYCUT = shotT('key', 19.6), T_BIRDS_OFF = shotT('helix', 55.5), T_BIRDS_ON = shotT('part', 75), T_GATE_ON = shotT('window', 31.3), T_GATE_OFF = shotT('pursuit', 51);
const BCX = -14, BCZ = 96, SPAN = 11200;
const TAU = Math.PI * 2, SH_T = [8, 20, 40, 75, 130];
// key-camera frame (for placing things where the key shot wants them)
const KF = new V3().subVectors(KEYT, KEYC).setY(0).normalize(), KR = new V3(-KF.z, 0, KF.x);
// a point in the key camera's own frame: f metres ahead, r to the right, u up
const KF3 = new V3().subVectors(KEYT, KEYC).normalize(), KR3 = new V3().crossVectors(KF3, new V3(0, 1, 0)).normalize(), KU3 = new V3().crossVectors(KR3, KF3);
const keyLocal = (f, r, u) => KEYC.clone().addScaledVector(KF3, f).addScaledVector(KR3, r).addScaledVector(KU3, u);
const keyDir = (azDeg, elDeg, dist) => { const a = azDeg * Math.PI / 180, e = elDeg * Math.PI / 180, h = Math.cos(e) * dist; return new V3(KEYC.x + h * (KF.x * Math.cos(a) + KR.x * Math.sin(a)), KEYC.y + Math.sin(e) * dist, KEYC.z + h * (KF.z * Math.cos(a) + KR.z * Math.sin(a))); };

// ---------------------------------------------------------------- pillar map: r = signed distance to the nearest pillar wall at mist height, g = that pillar's height
function bakePillarMap() {
  const N = 1024, d = new Uint8Array(N * N * 2), NA = 48, tex = SPAN / N; for (let i = 0; i < N * N; i++) d[i * 2] = 255;
  for (const s of W.spires) {
    const y = Math.min(46, s.h * .4), rad = []; let rm = 0;
    for (let k = 0; k < NA; k++) { const r = W.spireR(s, y, k / NA * TAU); rad.push(r); rm = Math.max(rm, r); }
    const ext = rm + 172, i0 = Math.max(0, Math.floor((s.x - ext - BCX + SPAN / 2) / tex)), i1 = Math.min(N - 1, Math.ceil((s.x + ext - BCX + SPAN / 2) / tex));
    const j0 = Math.max(0, Math.floor((s.z - ext - BCZ + SPAN / 2) / tex)), j1 = Math.min(N - 1, Math.ceil((s.z + ext - BCZ + SPAN / 2) / tex));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const dx = BCX - SPAN / 2 + (i + .5) * tex - s.x, dz = BCZ - SPAN / 2 + (j + .5) * tex - s.z, dist = Math.hypot(dx, dz);
      let a = Math.atan2(dz, dx) / TAU; a = (a - Math.floor(a)) * NA; const k = Math.floor(a), f = a - k;
      const r = rad[k % NA] * (1 - f) + rad[(k + 1) % NA] * f, v = Math.max(0, Math.min(255, (dist - r + 30) / 200 * 255)) | 0, q = (j * N + i) * 2;
      if (v < d[q]) d[q] = v;
      if (dist - r < 26) d[q + 1] = Math.max(d[q + 1], Math.min(255, s.h / 500 * 255) | 0);      // g = height of the pillar here (for its shadow on the mist)
    }
  }
  const t = new THREE.DataTexture(d, N, N, THREE.RGFormat); t.minFilter = t.magFilter = THREE.LinearFilter; t.needsUpdate = true; return t;
}
// radius table of a pillar at height y (64 azimuths) -> fast lookups for orbiting mist
const radTable = (s, y) => { const a = new Float32Array(64); for (let k = 0; k < 64; k++) a[k] = W.spireR(s, y, k / 64 * TAU); return a; };
const radAt = (tb, th) => { let a = th / TAU; a = (a - Math.floor(a)) * 64; const k = Math.floor(a), f = a - k; return tb[k & 63] * (1 - f) + tb[(k + 1) & 63] * f; };

// ---------------------------------------------------------------- the mist sea (GLSL shared by vertex + fragment, mirrored on the CPU as air.seaH)
const SEA_GLSL = /* glsl */`
uniform sampler2D tPil; uniform vec4 uSea;  // xy basin centre, z 1/span, w amount
float pilSD(vec2 x){ return texture2D(tPil, (x - uSea.xy)*uSea.z + .5).r*200. - 30.; }
float seaEnv(vec2 x){ vec2 dc = x - uSea.xy; float r = length(dc), ang = atan(dc.y, dc.x)/6.2831853;
  float tg = smoothstep(.42, .75, texture2D(uNoiseTex, vec2(ang*2., .37)).r);     // tongues pouring into the basin
  float rin = 430. - 190.*tg;
  return smoothstep(rin, rin + 460., r); }
// long shadow of the pillars on the mist: sphere-trace the distance map toward the sun, soft edge widening with distance
float pilShadow(vec3 wp){ vec2 l2 = normalize(uSunDir.xz); float tanE = uSunDir.y/max(length(uSunDir.xz), 1e-3), s = 6., res = 1.;
  for(int i=0;i<18;i++){ vec2 m = texture2D(tPil, (wp.xz + l2*s - uSea.xy)*uSea.z + .5).rg; float sd = m.r*200. - 30., hRay = wp.y + s*tanE;
    if(hRay > 480.) break;
    float tall = smoothstep(-8., 10., m.g*500. - hRay);
    res = min(res, mix(1., clamp(.5 + sd/(3. + s*.05), 0., 1.), tall));
    s += max(sd*.9, 6. + s*.03); }
  return res; }
// det = 0: smooth shape for the mesh · det = 1: with the small billows (shading). Billows = round-capped Worley cells (cauliflower heads).
float cap(float f){ f *= 1.3; return sqrt(max(1. - f*f, 0.)); }
float seaH(vec2 x, float env, float det){ vec2 w = uWind.xy;
  float s1 = texture2D(uNoiseTex, x/1700. - w*uTime*.0013).r;                           // swell
  float h = (s1 - .5)*30. + cap(texture2D(uNoiseTex, x/1560. + 7.3 - w*uTime*.0026).b)*(16. + 14.*s1);
  if(det > .5) h += cap(texture2D(uNoiseTex, x/520. + 3.1 - w*uTime*.007).b)*7.5 + cap(texture2D(uNoiseTex, x/170. + 5.7 - w*uTime*.016).b)*2.4;
  return mix(2., 26., env) + env*h; }
`;
air.seaH = (x, z) => { const r = Math.hypot(x - BCX, z - BCZ), env = smooth(330, 710, r); return lerp(3, 40, env) + env * (K.noise2(x / 300, z / 300) - .5) * 20; };   // coarse CPU estimate (no waves)

// ---------------------------------------------------------------- bird geometry
// model space: +Z forward, +Y up, metres. Attribute aW = (side ±1 | 0, distance from the shoulder along the span, 1 for wing vertices)
function birdGeo(o) {
  const P = [], Nn = [], C = [], Wt = [], I = [];
  const add = (x, y, z, nx, ny, nz, c, w) => { P.push(x, y, z); Nn.push(nx, ny, nz); C.push(c[0], c[1], c[2]); Wt.push(w[0], w[1], w[2]); return P.length / 3 - 1; };
  const loft = (rings, seg) => { const b = P.length / 3;
    rings.forEach(r => { for (let i = 0; i < seg; i++) { const a = i / seg * TAU, nx = Math.cos(a), ny = Math.sin(a); add((r.x || 0) + nx * r.rx, r.y + ny * r.ry, r.z, nx, ny, 0, typeof r.c === 'function' ? r.c(nx, ny) : r.c, [0, 0, 0]); } });
    for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < seg; i++) { const a = b + j * seg + i, bb = b + j * seg + (i + 1) % seg, c = a + seg, d = bb + seg; I.push(a, bb, c, bb, d, c); } };
  loft(o.body, o.seg || 8);
  for (const L of (o.legs || [])) loft(L, 4);
  // wings
  const w = o.wing, ns = w.ns || 9, nc = 4;
  for (const sd of [-1, 1]) { const b = P.length / 3;
    for (let i = 0; i <= ns; i++) for (let j = 0; j <= nc; j++) { const s = i / ns, c = j / nc, ch = w.chord(s), z = w.lead(s) - c * ch;
      add(sd * (w.sx + s * w.L), w.sy + .08 * ch * Math.sin(Math.PI * c) * (1 - s), z, 0, 1, 0, w.col(s, c), [sd, s * w.L, 1]); }
    for (let i = 0; i < ns; i++) for (let j = 0; j < nc; j++) { const a = b + i * (nc + 1) + j, bb = a + 1, c = a + nc + 1, d = c + 1; if (sd > 0) I.push(a, c, bb, bb, c, d); else I.push(a, bb, c, bb, d, c); } }
  // flat extras (tail fans): [[x,y,z]...] triangles
  for (const f of (o.flats || [])) { const b = P.length / 3; for (const v of f.v) add(v[0], v[1], v[2], 0, 1, 0, f.c, [0, 0, 0]); for (let i = 1; i < f.v.length - 1; i++) I.push(b, b + i + 1, b + i); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setAttribute('aW', new THREE.Float32BufferAttribute(Wt, 3)); g.setIndex(I);
  return g;
}
const WH = [.93, .93, .9], BK = [.035, .035, .04], RD = [.75, .05, .03];
const craneGeo = () => birdGeo({
  body: [
    { z: -.52, y: 0, rx: .012, ry: .008, c: WH }, { z: -.43, y: 0, rx: .075, ry: .04, c: WH }, { z: -.30, y: 0, rx: .13, ry: .11, c: WH }, { z: -.10, y: 0, rx: .165, ry: .15, c: WH },
    { z: .10, y: 0, rx: .165, ry: .15, c: WH }, { z: .25, y: .005, rx: .12, ry: .115, c: WH }, { z: .35, y: .012, rx: .07, ry: .07, c: WH }, { z: .43, y: .018, rx: .05, ry: .05, c: BK },
    { z: .80, y: .035, rx: .04, ry: .04, c: BK }, { z: .92, y: .042, rx: .042, ry: .044, c: (nx, ny) => ny > .1 ? WH : BK }, { z: .985, y: .046, rx: .052, ry: .054, c: (nx, ny) => ny > .35 ? RD : BK },
    { z: 1.04, y: .044, rx: .036, ry: .036, c: (nx, ny) => ny > .5 ? RD : BK }, { z: 1.07, y: .04, rx: .02, ry: .022, c: [.5, .47, .28] }, { z: 1.27, y: .034, rx: .004, ry: .004, c: [.55, .5, .3] }],
  legs: [-1, 1].map(s => [{ x: s * .05, z: -.25, y: -.08, rx: .024, ry: .024, c: BK }, { x: s * .035, z: -.7, y: -.05, rx: .02, ry: .02, c: BK }, { x: s * .03, z: -1.1, y: -.04, rx: .018, ry: .018, c: BK }, { x: s * .03, z: -1.2, y: -.055, rx: .03, ry: .012, c: BK }]),
  wing: { sx: .12, sy: .05, L: 1.16, lead: s => .17 - .11 * s * s, chord: s => s < .72 ? .37 * (1 - .22 * s) : lerp(.31, .09, Math.pow((s - .72) / .28, 1.5)),
    col: (s, c) => (s > .86 || (c > .52 && s > .06 && s < .9)) ? BK : WH },
});
const BR = [.2, .13, .075], BR2 = [.36, .26, .15], CRM = [.62, .55, .42];
const hawkGeo = () => birdGeo({
  body: [{ z: -.3, y: 0, rx: .03, ry: .02, c: BR }, { z: -.2, y: 0, rx: .075, ry: .06, c: BR }, { z: 0, y: 0, rx: .1, ry: .09, c: (nx, ny) => ny < -.3 ? CRM : BR }, { z: .16, y: .005, rx: .085, ry: .08, c: (nx, ny) => ny < -.3 ? CRM : BR },
    { z: .27, y: .012, rx: .055, ry: .055, c: BR2 }, { z: .33, y: .012, rx: .04, ry: .04, c: [.5, .42, .3] }, { z: .39, y: .0, rx: .006, ry: .01, c: [.6, .5, .2] }],
  wing: { sx: .08, sy: .03, L: .92, ns: 10, lead: s => .16 - .05 * s * s, chord: s => s < .8 ? .4 * (1 - .12 * s) : lerp(.36, .14, (s - .8) / .2), col: (s, c) => (c > .8 || s > .9) ? [.07, .05, .04] : (c < .3 ? BR : BR2) },
  flats: [{ c: BR2, v: [[0, .01, -.2], [.2, .005, -.56], [.07, .005, -.6], [-.07, .005, -.6], [-.2, .005, -.56]] }],
});
const SB = [.03, .05, .1], SC = [.8, .76, .68];
const swallowGeo = () => birdGeo({ seg: 6,
  body: [{ z: -.075, y: 0, rx: .004, ry: .003, c: SB }, { z: -.04, y: 0, rx: .016, ry: .013, c: (nx, ny) => ny < -.2 ? SC : SB }, { z: .01, y: 0, rx: .021, ry: .019, c: (nx, ny) => ny < -.2 ? SC : SB },
    { z: .05, y: .002, rx: .017, ry: .016, c: (nx, ny) => ny < -.2 ? [.5, .16, .06] : SB }, { z: .075, y: .003, rx: .012, ry: .012, c: SB }, { z: .095, y: .002, rx: .002, ry: .002, c: BK }],
  wing: { sx: .016, sy: .006, L: .15, ns: 6, lead: s => .035 - .05 * s * s, chord: s => .05 * (1 - .85 * s), col: () => SB },
  flats: [{ c: SB, v: [[0, .002, -.05], [.012, .002, -.07], [.034, .002, -.16]] }, { c: SB, v: [[0, .002, -.05], [-.034, .002, -.16], [-.012, .002, -.07]] }],
});
// wing-beat vertex code shared by all birds. aFl = (rad/s, phase, seed, amplitude) · uWing = (shoulder x, inner-wing length, shoulder y, glide dihedral)
const BIRD_PARS = /* glsl */`
attribute vec3 aW; attribute vec4 aFl; uniform vec4 uWing;
vec2 wingTh(){ float ph = uTime*aFl.x + aFl.y;
  float gl = smoothstep(-.4, .1, sin(uTime*.31 + aFl.z*40.) + .6*sin(uTime*.83 + aFl.z*17.));
  float amp = aFl.w * mix(.06, 1., gl);
  float t1 = amp*.52*sin(ph) + uWing.w + .06*amp;
  float t2 = t1 + amp*.5*sin(ph - 1.15) - .1*amp + uWing.w*.6;
  return vec2(t1, t2); }
`;
const BIRD_NORMAL = `if(aW.z > .5){ vec2 th = wingTh(); float a = aW.y < uWing.y ? th.x : th.y; objectNormal = vec3(-aW.x*sin(a), cos(a), 0.); }`;
const BIRD_VERT = /* glsl */`{ vec2 th = wingTh(); float ph = uTime*aFl.x + aFl.y;
  if(aW.z > .5){ float d = aW.y; vec2 e = d < uWing.y ? d*vec2(cos(th.x), sin(th.x)) : uWing.y*vec2(cos(th.x), sin(th.x)) + (d - uWing.y)*vec2(cos(th.y), sin(th.y));
    float camber = transformed.y - uWing.z;
    transformed.x = aW.x*(uWing.x + e.x); transformed.y = uWing.z + e.y + camber; }
  transformed.y -= aFl.w * .035 * sin(ph) * (uWing.y*2.); }`;

// ---------------------------------------------------------------- flock circuits (closed loops: no pops, any time is valid)
// A flock flies a big ellipse whose near side passes through `p0` at the key time heading `hdg` (unit, horizontal).
function circuit(p0, hdg, a, b, yA, period, turn = 1, phi = .45) {
  const ex = hdg.clone(), ez = new V3(-hdg.z, 0, hdg.x).multiplyScalar(turn), cc = p0.clone().addScaledVector(ez, b), om = TAU / period;
  return (t, lag, lat, out, tan) => { const th = -Math.PI / 2 + om * (t - TKEY) - lag / a, c = Math.cos(th), s = Math.sin(th);
    out.set(cc.x + ex.x * a * c + ez.x * b * s, p0.y + yA * Math.sin((th + Math.PI / 2) + phi) - yA * Math.sin(phi), cc.z + ex.z * a * c + ez.z * b * s);
    tan.set(-ex.x * a * s + ez.x * b * c, yA * Math.cos(th + Math.PI / 2 + phi), -ex.z * a * s + ez.z * b * c).normalize();
    out.x += -tan.z * lat; out.z += tan.x * lat; return out; };
}

K.reg('air', {
  init() {
    const rnd = rng(6501), self = this, e = K.env;
    const n3 = (K.sky && K.sky.noise3D) ? K.sky.noise3D() : null;
    const tPil = bakePillarMap();
    const skyU = (K.sky && K.sky.U && K.sky.U.uCMap.value) ? K.sky.U : null;
    const SHADOW = skyU ? K.sky.shadowGLSL : 'float kCloudShadow(vec3 wp){ return 1.; }\n';
    const uSea = { value: new THREE.Vector4(BCX, BCZ, 1 / SPAN, 1) };

    // ============================================================ 1. the mist sea
    {
      const NR = 104, NA = 264, pos = new Float32Array((NR + 1) * NA * 3), idx = [];
      for (let j = 0; j <= NR; j++) { const r = 150 * Math.pow(6400 / 150, j / NR); for (let i = 0; i < NA; i++) { const a = (i + (j & 1) * .5) / NA * TAU, q = (j * NA + i) * 3; pos[q] = BCX + Math.cos(a) * r; pos[q + 1] = 0; pos[q + 2] = BCZ + Math.sin(a) * r; } }
      for (let j = 0; j < NR; j++) for (let i = 0; i < NA; i++) { const a = j * NA + i, b = j * NA + (i + 1) % NA, c = a + NA, d = b + NA; idx.push(a, c, b, b, c, d); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx);
      const m = K.shaderMat({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
        uniforms: Object.assign({ tPil: { value: tPil }, uSea }, skyU || {}),
        vertexShader: SEA_GLSL + /* glsl */`
          varying vec3 vW; varying float vEnv;
          void main(){ vec3 p = position; float env = seaEnv(p.xz), sd = pilSD(p.xz);
            float surf = exp(-max(sd, 0.)/26.) * (11. + 7.*sin(sd*.1 - uTime*.55 + p.x*.013));          // surf climbing the pillars
            p.y = seaH(p.xz, env, 0.) + surf*env; vW = p; vEnv = env; gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.); }`,
        fragmentShader: SEA_GLSL + SHADOW + /* glsl */`
          varying vec3 vW; varying float vEnv;
          void main(){ vec2 x = vW.xz; float env = vEnv; const float E = 2.5;
            float h0 = seaH(x, env, 1.), hx = seaH(x + vec2(E, 0.), env, 1.), hz = seaH(x + vec2(0., E), env, 1.);
            vec3 N = normalize(vec3(h0 - hx, E*.42, h0 - hz));
            vec3 Vv = cameraPosition - vW; float dist = length(Vv); vec3 V = Vv/dist;
            float ndl = dot(N, uSunDir), wrap = clamp((ndl + .1)/1.1, 0., 1.);
            vec2 l2 = normalize(uSunDir.xz); float hs = seaH(x + l2*38., env, 0.);
            float sh = 1. - .75*smoothstep(0., 14., hs - h0 - 6.);                                        // billows shadow the troughs behind them
            float ao = smoothstep(-6., 34., h0 - mix(2., 26., env) + 4.);                                 // deep troughs are darker
            float cs = kCloudShadow(vW) * mix(1., pilShadow(vW), .62);
            float du = smoothstep(0., .6, uEnv.z), grz = 1. - uSunDir.y;                                 // low sun: light skims the tops and fills the mist with glow
            vec3 amb = uSkyCol*.5 + vec3(.14, .15, .17)*(1. - .55*uEnv.x)*(1. - .7*du) + vec3(.30, .14, .11)*du;
            vec3 sunP = uSunCol * mix(vec3(1.), vec3(1.25, .86, .6), du);                                // peach
            vec3 col = sunP*(.29*(1. + .5*du)*mix(wrap, .35 + .65*wrap, grz*grz)*sh*cs*(.6 + .4*ao)) + amb*(.3 + .6*ao)*mix(.76, 1., cs);
            col += sunP*.3*pow(1. - max(dot(N, V), 0.), 4.)*pow(max(dot(-V, uSunDir)*.5 + .5, 0.), 3.)*sh*cs;   // silver lining
            col += sunP*du*.3*pow(max(dot(-V, normalize(vec3(uSunDir.x, 0., uSunDir.z))), 0.), 3.)*cs;   // the sea glows toward the setting sun
            float sd = pilSD(x), s3 = texture2D(uNoiseTex, x/170. + uTime*.004).a;
            float a = clamp(env*7. - (1. - s3)*1.6*(1. - smoothstep(.1, .5, env)), 0., 1.);
            a *= mix(.45, 1., smoothstep(-2., 16., sd)) * smoothstep(25., 100., dist) * mix(.8, 1., pow(1. - abs(V.y), 2.)) * uSea.w;
            col = kFog(col, vW) * mix(vec3(1.), vec3(1.16, .93, .8), du);
            gl_FragColor = vec4(col, a); }` });
      const mesh = this.sea = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 10; K.scene.add(mesh);
    }

    // ============================================================ 2. volumetric puffs: 6-way light maps baked from a 3D density
    {
      const BK_GLSL = (n3 ? 'uniform sampler3D uN3;\n#define N3(p) texture(uN3, p)\n' : '#define N3(p) vec4(kFbm((p)*9.), 1. - kVoronoi(((p).xy + (p).z*.7)*14.).x, kFbm((p)*5. + 3.), 0.)\n') + /* glsl */`
        uniform float uPass;
        float dens(vec3 p, vec2 tl){ float seed = tl.x + tl.y*4.; bool wisp = tl.y > 1.5;                    // rows 0-1 billowy heaps, rows 2-3 flatter banks
          vec3 q = p*(wisp ? vec3(.82, 1.75, 1.) : vec3(.9, 1.2, .95)); float r = length(q);
          vec3 s3 = seed*vec3(.37, .71, .13);
          vec4 n = N3(p*.3 + s3), n2 = N3(p*.56 + s3.yzx), n3 = N3(p*1.4 + s3.zxy);
          float d = 1.32 - r*1.0 - (1. - n.b)*.95 - (1. - n2.g)*(wisp ? .58 : .46) - (1. - n3.g)*.2;
          d -= smoothstep(.72, .98, max(abs(p.x), abs(p.y)))*1.5;
          return clamp(d*4.5, 0., 1.); }
        float lod(vec3 p, vec3 dir, vec2 tl){ float o = 0.; for(int k=0;k<3;k++) o += dens(p + dir*(float(k) + .5)*.24, tl); return exp(-o*.24*5.5); }
        vec4 bake(vec2 uv){ vec2 tl = floor(uv*4.), f = fract(uv*4.)*2. - 1.; float T = 1.; vec3 aP = vec3(0.), aN = vec3(0.);
          for(int i=0;i<18;i++){ vec3 p = vec3(f, 1. - (float(i) + .5)/9.); float d = dens(p, tl);
            if(d > 0.){ float a = 1. - exp(-d*(2./18.)*5.5);
              if(uPass < .5){ aP.xy += T*a*vec2(lod(p, vec3(1,0,0), tl), lod(p, vec3(0,1,0), tl)); aN.xy += T*a*vec2(lod(p, vec3(-1,0,0), tl), lod(p, vec3(0,-1,0), tl)); }
              else { aP.z += T*a*lod(p, vec3(0,0,1), tl); aN.z += T*a*lod(p, vec3(0,0,-1), tl); }
              T *= 1. - a; } }
          float al = (1. - T) * smoothstep(1., .9, max(abs(f.x), abs(f.y)));
          return uPass < .5 ? vec4(aP.x, aP.y, aN.x, aN.y) : vec4(aP.z, aN.z, al, 0.); }`;
      const bk = pass => K.bake(1024, 1024, BK_GLSL, { uniforms: { uN3: { value: n3 }, uPass: { value: pass } }, repeat: false });
      const tPA = bk(0), tPB = bk(1);
      const MAXS = this.MAXS = 840;
      const g = new THREE.InstancedBufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3)); g.setIndex([0, 1, 2, 0, 2, 3]);
      const aP = this.aP = new THREE.InstancedBufferAttribute(new Float32Array(MAXS * 4), 4), aQ = this.aQ = new THREE.InstancedBufferAttribute(new Float32Array(MAXS * 4), 4);
      aP.setUsage(THREE.DynamicDrawUsage); aQ.setUsage(THREE.DynamicDrawUsage); g.setAttribute('aP', aP); g.setAttribute('aQ', aQ);
      const m = K.shaderMat({ transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
        uniforms: Object.assign({ tPA: { value: tPA }, tPB: { value: tPB } }, skyU || {}),
        vertexShader: K.GLSL.fog + /* glsl */`
          attribute vec4 aP, aQ;   // xyz centre, size · roll, alpha, tile (+16 = smoke), stretch
          varying vec2 vUv; varying vec3 vLp, vLn; varying vec4 vFog; varying vec4 vK;
          void main(){ vec3 c = aP.xyz; vec3 cr = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), cu = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]), cf = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
            float cs = cos(aQ.x), sn = sin(aQ.x); vec3 ax = cr*cs + cu*sn, ay = cu*cs - cr*sn;
            float sunQ = floor(aQ.w/8.), str = aQ.w - sunQ*8.;                 // stretch + 8 * (sunlit 0..15)
            vec3 wp = c + (ax*position.x*str + ay*position.y) * aP.w;
            vec3 l = vec3(dot(uSunDir, ax), dot(uSunDir, ay), dot(uSunDir, cf));
            vLp = max(l, 0.); vLp *= vLp; vLn = max(-l, 0.); vLn *= vLn;
            float tile = mod(aQ.z, 16.); vK = vec4(aQ.y, step(15.5, aQ.z), 0., sunQ/15.);
            vec2 t = vec2(mod(tile, 4.), floor(tile/4.)); vUv = (t + position.xy*.5 + .5) / 4.;
            vec3 rd = normalize(c - cameraPosition); float tow = max(dot(rd, uSunDir), 0.);
            vK.z = 1. + 1.6*pow(tow, 5.);
            vFog = vec4(kFogColor(rd), kFogAmt(c));
            gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.); }`,
        fragmentShader: /* glsl */`
          uniform sampler2D tPA, tPB; varying vec2 vUv; varying vec3 vLp, vLn; varying vec4 vFog; varying vec4 vK;
          void main(){ vec4 A = texture2D(tPA, vUv), B = texture2D(tPB, vUv); float d = B.b;
            if(d < .004) discard;
            float litN = clamp((dot(vec3(A.r, A.g, B.r), vLp) + dot(vec3(A.b, A.a, B.g), vLn)) / max(d, .05), 0., 1.);   // 0 self-shadowed .. 1 facing the sun
            float al = d*d*(3. - 2.*d) * mix(.82, 1., d);                                    // feathered edge, never fully opaque
            // sunlit mist is brighter than any rock behind it: white with only a gentle self-shadow; in a pillar's shadow it turns pale sky-blue
            vec3 sunC = uSunCol * (.31 * vK.z) * (.8 + .3*litN) + uSkyCol*.14;
            vec3 shdC = (uSkyCol*.6 + vec3(.33, .36, .4)*(1. - .6*uEnv.x)*(1. - .62*uEnv.z) + vec3(.13, .07, .1)*uEnv.z) * (.9 + .15*litN);
            vec3 col = mix(shdC, sunC, vK.w);
            col = mix(col, uSunCol*(.2*vK.w)*(.7 + .45*litN) + uSkyCol*.45 + vec3(.26, .28, .31), step(.5, vK.y));    // incense smoke: sunlit blue-white
            col = mix(col, max(vFog.rgb, col*.9), vFog.a);
            gl_FragColor = vec4(col*al, al) * vK.x; }` });
      const mesh = this.puffs = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 11; K.scene.add(mesh);

      // ---- sprite definitions
      const S = this.S = [];
      const tileB = () => (rnd() * 8) | 0, tileF = () => 8 + ((rnd() * 8) | 0);
      // (a) bands curling round the hero pillars
      // (a) tongues of mist curling round the hero pillars: clusters of 3-4 overlapping puffs that creep round the rock
      const ring = (name, ys, nc, sz, om, alpha, off = .7, th0 = rnd() * TAU) => { const s = W[name]; if (!s) return;
        for (const y0 of ys) { const tb = radTable(s, y0), om1 = om * (.7 + .6 * rnd());
          for (let c = 0; c < nc; c++) { const thc = th0 + (c + rnd() * .5) / nc * TAU, n = 3 + (rnd() * 2 | 0), ac = alpha * (.55 + .6 * rnd());
            for (let i = 0; i < n; i++) { const z = sz * (.7 + .65 * rnd()); S.push({ k: 0, s, tb, y: y0 + (rnd() - .5) * 9 + i * 1.5, th: thc + (i - n / 2) * (z * 1.05 / s.r) + (rnd() - .5) * .08, om: om1, sz: z, off: off + rnd() * .25, al: ac * (.7 + .3 * rnd()), tile: rnd() < .55 ? tileF() : tileB(), st: 1.2 + rnd() * .5, roll: (rnd() - .5) * .35, ph: rnd() * TAU }); } } } };
      const ledge = (name, i, d = 3) => { const s = W[name]; if (!s) return 60; const L = W.spireLedges(s); return L.length ? L[Math.min(i, L.length - 1)] + d : s.h * .5; };
      ring('temple', [ledge('temple', 3)], 3, 12, .011, .44, .8, 1.2); ring('temple', [ledge('temple', 0)], 3, 12, .010, .42, .8, 4.2); ring('temple', [12], 3, 13, .009, .42);
      ring('wallL', [ledge('wallL', 1)], 2, 12, .010, .4, .8); ring('wallL', [10], 2, 12, .009, .4); ring('wallR', [ledge('wallR', 0), ledge('wallR', 3)], 2, 13, .010, .44, .8); ring('wallR', [10], 2, 12, .009, .4);
      ring('needleE', [ledge('needleE', 1), ledge('needleE', 3)], 2, 10, .012, .5, .8); ring('needleW', [ledge('needleW', 1), ledge('needleW', 3)], 2, 11, .012, .5, .8); ring('shelf', [ledge('shelf', 2)], 3, 13, .01, .5, .8); ring('isle', [6], 2, 7, .012, .36);
      // (b) low mist drifting over the lake
      for (let i = 0; i < 34; i++) { const a = rnd() * TAU, r = 40 + Math.sqrt(rnd()) * 300, x = BCX + Math.cos(a) * r, z = BCZ + Math.sin(a) * r; if (W.inSpire(x, 6, z, 26)) continue;
        S.push({ k: 1, x, y: 2 + rnd() * 5, z, len: 90 + rnd() * 120, v: 1.2 + rnd() * 1.6, sz: 16 + rnd() * 18, al: .12 + rnd() * .16, tile: tileF(), st: 1.3 + rnd() * .6, roll: (rnd() - .5) * .2, ph: rnd() }); }
      // (c) streams pouring through the gaps, from the far valleys into the basin
      for (let k = 0; k < 7; k++) { const a = -Math.PI * .5 + (k - 3) * .4 + (rnd() - .5) * .2, n = 8;
        for (let i = 0; i < n; i++) { const u = i / n; S.push({ k: 2, a: a + (rnd() - .5) * .1, r0: 700 + rnd() * 80, r1: 260 + rnd() * 60, u0: u, v: .012 + rnd() * .006, sz: 22 + rnd() * 18, al: .2 + rnd() * .16, tile: rnd() < .5 ? tileF() : tileB(), st: 1.6 + rnd(), roll: (rnd() - .5) * .6, ph: rnd() * TAU }); } }
      // (d) surf and crests on the far sea: puffs breaking round every pillar within 2.6 km, and loose crests
      for (const s of W.spires) { const d = Math.hypot(s.x - BCX, s.z - BCZ); if (d < 420 || d > 2700) continue; const n = d < 1300 ? 5 : 3;
        for (let i = 0; i < n; i++) { const th = rnd() * TAU, r = W.spireR(s, 45, th) + s.r * (.25 + rnd() * .5), sz = s.r * (.55 + rnd() * .5);
          S.push({ k: 3, x: s.x + Math.cos(th) * r, z: s.z + Math.sin(th) * r, y: 44 + rnd() * 16 + sz * .25, sz, al: .5 + rnd() * .3, tile: tileB(), st: 1.2 + rnd() * .8, roll: (rnd() - .5) * .8, ph: rnd() * TAU }); } }
      for (let i = 0; i < 110; i++) { const a = rnd() * TAU, r = 520 + Math.pow(rnd(), 1.4) * 1700, x = BCX + Math.cos(a) * r, z = BCZ + Math.sin(a) * r, sz = 34 + rnd() * 60; if (W.inSpire(x, 50, z, sz * .7)) continue;
        S.push({ k: 3, x, z, y: 46 + rnd() * 14 + sz * .2, sz, al: .35 + rnd() * .35, tile: rnd() < .5 ? tileB() : tileF(), st: 1.4 + rnd() * 1.4, roll: (rnd() - .5) * .5, ph: rnd() * TAU }); }
      // (e) incense smoke (sources from the architecture, if any)
      const smoke = (K.arch && K.arch.smoke) || [];
      smoke.slice(0, 8).forEach((sm, j) => { const p = sm.pos || sm; for (let i = 0; i < 24; i++) S.push({ k: 4, x: p.x, y: p.y, z: p.z, s: sm.s || 1, u0: i / 24, ph: rnd() * TAU + j, tile: tileF(), roll: rnd() * TAU }); });
      // (f) the dragons: curling vortices in the hero's wake · cloud streamers dragged by the rival · the halo it tore out of the cloud
      for (let i = 0; i < 18; i++) S.push({ k: 5, i, u0: i / 18, ph: rnd() * TAU, dir: i % 2 ? 1 : -1, tile: tileB(), r: rnd() });
      for (let i = 0; i < 20; i++) S.push({ k: 6, i, tau: .5 + i * .3 + rnd() * .15, ph: rnd() * TAU, tile: tileF(), r: rnd() });
      for (let i = 0; i < 18; i++) S.push({ k: 7, i, a: (i + rnd() * .6) / 18 * TAU, ph: rnd() * TAU, tile: tileB(), r: rnd(), sz: 22 + rnd() * 16 });
      // (g) the cloud the golden one bursts out of: a low cumulus tower standing across its path (it merges with the big tower behind it in the sky)
      for (let i = 0; i < 56; i++) { const a = rnd() * TAU, rr = Math.pow(rnd(), .6), up = rnd() * 2 - .75;
        S.push({ k: 8, i, ox: Math.cos(a) * rr, oy: up, oz: Math.sin(a) * rr, ax: rnd() * 2 - 1, sz: 34 + rnd() * 44, tile: tileB(), ph: rnd() * TAU, r: rnd(), roll: (rnd() - .5) * .8 }); }
      this.order = new Uint16Array(MAXS); this.depth = new Float32Array(MAXS); this.buf = new Float32Array(MAXS * 8);
    }

    // ============================================================ 3. sun beams in the mist between the pillars
    // Broad camera-facing slabs along the sun direction. Their light is broken up by a noise field that is anchored in the world
    // (in the plane across the sun), and they exist only in the mist layer — no straight white stripes.
    {
      const pairs = [['temple', 'wallR'], ['temple', 'needleE'], ['needleE', 'shelf'], ['temple', 'needleW'], ['wallL', 'temple'], ['wallL', 'needleW'], ['temple', 'isle'], ['wallR', 'shelf']], P = [], Q = [];
      const sd = e.sunDir;
      for (const [a, b] of pairs) { const A = W[a], B = W[b]; if (!A || !B) continue;
        for (let k = 0; k < 1; k++) { const u = .4 + .2 * rnd(), mx = lerp(A.x, B.x, u), mz = lerp(A.z, B.z, u), my = 8 + rnd() * 10, up = 80 + rnd() * 30;
          P.push(mx + sd.x * up, my + sd.y * up, mz + sd.z * up, 0); Q.push(up + 30, 8 + rnd() * 6, .7 + rnd() * .5, rnd() * TAU); } }
      // after the rain: great beams slanting down through the broken cloud onto the valley (aP.w = 1)
      for (let k = 0; k < 11; k++) { const a = rnd() * TAU, rr = 40 + rnd() * 330, bx = -8 + Math.cos(a) * rr, bz = 70 + Math.sin(a) * rr, by = 30 + rnd() * 110, up = 620 + rnd() * 200;
        P.push(bx + sd.x * up, by + sd.y * up, bz + sd.z * up, 1); Q.push(up + 120, 16 + rnd() * 34, .6 + rnd() * .6, rnd() * TAU); }
      const n = this.nShaft = P.length / 4, g = new THREE.InstancedBufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0]), 3)); g.setIndex([0, 1, 2, 0, 2, 3]);
      g.setAttribute('aP', new THREE.InstancedBufferAttribute(new Float32Array(P), 4)); g.setAttribute('aQ', new THREE.InstancedBufferAttribute(new Float32Array(Q), 4)); g.instanceCount = n;
      const m = K.shaderMat({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uAmt: { value: 1 }, uBrk: { value: 0 } },
        vertexShader: /* glsl */`
          attribute vec4 aP, aQ; varying vec3 vC; varying vec4 vS; varying float vT; uniform float uAmt, uBrk;   // aQ: length, half-width, strength, phase
          void main(){ vec3 ax = -uSunDir; vec3 c = aP.xyz + ax*position.x*aQ.x; vec3 vd = normalize(c - cameraPosition);
            vec3 sx = cross(ax, vd); float sl = length(sx); sx /= max(sl, 1e-3);
            vec3 wp = c + sx*position.y*aQ.y*(1. + .5*position.x);
            float tow = dot(vd, uSunDir)*.5 + .5;
            vS = vec4(position.x, position.y, aQ.z * smoothstep(.2, .6, sl) * mix(.6, 1.1, tow*tow) * (aP.w > .5 ? uBrk : uAmt), aQ.w); vT = aP.w;
            vC = wp; gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.);
            if(vS.z < .002) gl_Position = vec4(2., 2., 2., 1.); }`,
        fragmentShader: /* glsl */`
          varying vec3 vC; varying vec4 vS; varying float vT;
          void main(){ float across = 1. - abs(vS.y); across = across*across*across*(across*(across*6. - 15.) + 10.); across *= across;
            float along = smoothstep(0., .3, vS.x) * (1. - smoothstep(.7, 1., vS.x));
            vec3 bx = normalize(cross(uSunDir, vec3(0., 1., 0.))), by = cross(uSunDir, bx); vec2 q = vec2(dot(vC, bx), dot(vC, by));
            float n1 = texture2D(uNoiseTex, q/70. + uTime*.0015).r, n2 = texture2D(uNoiseTex, q/19. - uTime*.003).a, n3 = texture2D(uNoiseTex, vec2(q.x/160., dot(vC, uSunDir)/240.)).g;
            float brk = smoothstep(.36, .68, n1*.6 + n2*.4) * (.5 + n3);
            float inMist = smoothstep(72., 22., vC.y) * smoothstep(-1., 6., vC.y);
            if(vT > .5){ float n4 = texture2D(uNoiseTex, q/260. + uTime*.002).r; brk = smoothstep(.3, .7, n4*.65 + n2*.35) * (.55 + .9*n3); inMist = smoothstep(640., 260., vC.y) * smoothstep(-2., 30., vC.y) * 2.2; }
            float f = across*along*brk*inMist*vS.z;
            vec3 col = uSunCol*vec3(1., .93, .78)*(vT > .5 ? .045 : .07)*f * (1. - .6*kFogAmt(vC));
            gl_FragColor = vec4(col, 1.); }` });
      const mesh = this.shafts = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 12; K.scene.add(mesh);
    }

    // ============================================================ 4. birds
    {
      const mk = (geo, n, wing, key, rough) => { geo.setAttribute('aFl', new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4));
        const m = new THREE.InstancedMesh(geo, K.mat({ vertexColors: true, roughness: rough, side: THREE.DoubleSide, key, uniforms: { uWing: { value: new THREE.Vector4(...wing) } }, vertPars: BIRD_PARS + 'varying vec3 vWg;', vertNormal: BIRD_NORMAL, vert: 'vWg = aW;' + BIRD_VERT,
          fragPars: 'varying vec3 vWg; uniform vec4 uWing;',
          frag: `if(vWg.z > .5){ float sp = vWg.y / (uWing.y*2.2);                                     // 0 at the shoulder .. 1 at the tip
            float fe = fract(vWg.y / (uWing.y*2.2) * 22. + vOPos.z*3.); float gap = smoothstep(.0, .12, fe) * smoothstep(1., .88, fe);
            diffuseColor.rgb *= mix(.72, 1., gap) * (.9 + .1*sin(vOPos.z*90.));                       // feather rows
            if(sp > .8 && fe > .62 + (1. - sp)*1.6) discard; }                                        // fingered primaries`, }), n);
        m.frustumCulled = false; m.castShadow = false; K.scene.add(m); return m; };
      const hdgA = KR.clone().multiplyScalar(.93).addScaledVector(KF, .37).normalize();
      // the skein that crosses the key frame: tail (MA) lower left, leader (MB) upper right, in front of the far pillars right of Temple Peak.
      // Every bird follows the same gently undulating track (a wide level circuit + a slow rise and fall), so at the key time the line climbs.
      const MA = keyDir(9, 0, 125), MB = keyDir(23, 10, 230), MAB = MB.clone().sub(MA).setY(0), VC = 14, OM2 = TAU / 80, AC = (MB.y - MA.y) / Math.sin(OM2 * MAB.length() / VC);
      const lvl = circuit(MB, MAB.clone().normalize(), 700, 350, 0, TAU * 700 / VC, -1, 0);
      const climb = (t, lag, lat, out, tan) => { lvl(t, lag, lat, out, tan); const ph = OM2 * ((t - TKEY) - lag / VC); out.y += AC * Math.sin(ph); tan.y = AC * OM2 * Math.cos(ph) / VC; tan.normalize(); return out; };
      const flocks = this.flocks = air.flocks = [
        { name: 'pair', n: 2, sp: 4.2, path: circuit(keyDir(-14.5, 2.2, 64), hdgA, 230, 120, 16, 118), sc: 1.15, bank: .66 },
        { name: 'mid', n: 13, sp: MAB.length() / 12, line: 1, path: climb, sc: 1.75, bank: .6 },
        { name: 'tower', n: 11, sp: 7.5, path: circuit(keyDir(11.5, 26.5, 300), KR.clone().multiplyScalar(.96).addScaledVector(KF, -.28).normalize(), 520, 260, 22, 250), sc: 2.0, bank: .3 },
        { name: 'far', n: 19, sp: 9, path: circuit(keyDir(27, 21, 1250), KR.clone().multiplyScalar(-1).addScaledVector(KF, .25).normalize(), 1500, 700, 60, 620, -1), sc: 1.7, bank: -.3 },
      ];
      const NSC = this.NSC = 9, SC = this.SC = [], rp = FP.rise || new V3(-4, 0, 112);
      for (let i = 0; i < NSC; i++) SC.push({ a: (i + rnd() * .7) / NSC * TAU, r: 15 + rnd() * 19, y: 2.6 + rnd() * 3.4, w: (i % 2 ? 1 : -1) * (.2 + rnd() * .12), d: rnd() * .35, v: 20 + rnd() * 10, up: 6 + rnd() * 5, cx: rp.x, cz: rp.z });
      const nC = flocks.reduce((a, f) => a + f.n, 0) + NSC; this.nFlock = nC - NSC;
      const cr = this.cranes = mk(craneGeo(), nC, [.12, .52, .05, .02], 'airCrane', .75);
      { const a = cr.geometry.attributes.aFl; let q = 0; for (const f of flocks) for (let i = 0; i < f.n; i++, q++) a.setXYZW(q, TAU * (2.15 + rnd() * .25), rnd() * TAU, rnd(), 1); for (let i = 0; i < NSC; i++, q++) a.setXYZW(q, TAU * (2.7 + rnd() * .4), rnd() * TAU, rnd(), 1.15); }
      const hk = this.hawk = mk(hawkGeo(), 1, [.08, .46, .03, .13], 'airHawk', .8); hk.geometry.attributes.aFl.setXYZW(0, TAU * 2.4, 0, .37, .1);
      const NSW = this.NSW = 23, sw = this.swallows = mk(swallowGeo(), NSW, [.016, .07, .006, -.04], 'airSwallow', .5);
      const sws = this.sws = []; const anchors = [[-44, 60, 168, 13, 1.25], [-62, 64, 172, 10, 1.25], [-40, 52, 150, 16, 1.25], [-70, 58, 205, 12, 1.25], [6, 62, 56, 12, 1.6], [-4, 150, 6, 14, 2.2],
        [-10, 118, 40, 20, 3.0], [16, 130, 30, 18, 3.0], [-24, 100, 36, 22, 3.0], [6, 154, 20, 24, 3.2], [22, 92, 46, 18, 2.8], [-34, 126, 14, 20, 3.0]];   // the last six: swifts wheeling round Temple Peak
      for (let i = 0; i < NSW; i++) { const an = anchors[i < 11 ? i % 6 : 6 + (i - 11) % 6]; sws.push({ sc: an[4], c: new V3(an[0], an[1], an[2]), r: an[3] * (.7 + rnd() * .6), f: [.5 + rnd() * .5, .8 + rnd() * .7, .6 + rnd() * .6], p: [rnd() * TAU, rnd() * TAU, rnd() * TAU] }); sw.geometry.attributes.aFl.setXYZW(i, TAU * (6.5 + rnd() * 2), rnd() * TAU, rnd(), 1); }
      this.hawkC = keyDir(8, 27, 150);
    }

    // ============================================================ 5. sky lanterns and kites from the monastery
    {
      const NDAY = 34, NDUSK = 430, NL = this.NL = NDAY + NDUSK, pts = [];
      for (let i = 0; i <= 10; i++) { const u = i / 10; pts.push(new THREE.Vector2(.07 + .36 * Math.sin(Math.PI * Math.pow(u, .75) * .93 + .08), u * 1.05)); }
      const lg = new THREE.LatheGeometry(pts, 10);
      const lm = K.mat({ color: 0xffffff, roughness: .85, side: THREE.DoubleSide, key: 'airLantern',
        frag: `float gy = clamp(vOPos.y, 0., 1.05); float an = atan(vOPos.z, vOPos.x); float ribs = .8 + .2*smoothstep(.1, .3, abs(fract(an*1.5915*1.)*2. - 1.)); float cap = smoothstep(.93, .98, gy) + smoothstep(.07, .03, gy);
          vec3 pc = diffuseColor.rgb * mix(vec3(1.), vec3(1., .82, .5), smoothstep(.55, .0, gy)); totalEmissiveRadiance += pc * (3.4*pow(1. - gy*.9, 2.) + .7) * ribs * (1. - cap); diffuseColor.rgb = mix(pc*.75*ribs, vec3(.12, .05, .03), cap);` });
      const lan = this.lanterns = new THREE.InstancedMesh(lg, lm, NL); lan.frustumCulled = false; K.scene.add(lan);
      const cols = [0xff5a1e, 0xff8a2a, 0xffb347, 0xff3d2e, 0xffc65a], L = this.L = []; const col = new THREE.Color();
      const src = [W.sites.summit, { x: W.sites.mid.x, y: W.sites.mid.y + 3, z: W.sites.mid.z + 5 }];
      // a loose rising cluster of 26 above the mid terrace + 8 from the summit
      for (let i = 0; i < NDAY; i++) { const mid = i < 26, s = src[mid ? 1 : 0], n = mid ? 26 : 8, j = mid ? i : i - 26;
        L.push({ x: s.x + (rnd() - .5) * (mid ? 26 : 14), y: s.y + 3, z: s.z + (rnd() - .5) * (mid ? 12 : 14), H: mid ? 96 : 150, u0: (j + rnd() * .8) / n, v: mid ? .8 + rnd() * .6 : 1.5 + rnd() * .7, sc: mid ? 1.7 + rnd() * .9 : 1.4 + rnd() * .6, ph: rnd() * TAU, k: mid ? .1 + rnd() * .1 : .16 + rnd() * .12 }); lan.setColorAt(i, col.setHex(cols[i % cols.length])); }
      // DUSK: hundreds of lanterns are lit and let go from the summit court, the terrace, the bridge, the gate, the ledges, the shore and boats on the lake.
      // Each waits at its place (lit) from the cut to the last shot, lifts off at its own moment, rises fast then slower, and leans into the wind: a river.
      { const S = W.sites, DL = [], T = W.temple, put = (x, y, z, t0) => { const L = { x, y, z, t0, v: 5.2 + rnd() * 2.6, sc: 1.25 + rnd() * .9, ph: rnd() * TAU, k: .7 + rnd() * .7 };
          for (let tau = 0; tau <= 12; tau += .5) { const h = L.v * tau * (1 - .03 * tau), dr = (.9 * tau + .16 * tau * tau) * L.k;      // its path must stay clear of the lens
            if (Math.hypot(x + .8 * dr - KEYC.x + 1.5, y + h - KEYC.y, z + .6 * dr - KEYC.z + 1.5) < 17) return; }
          DL.push(L); };
        for (let i = 0; i < 80; i++) { const a = rnd() * TAU, r = 11 + rnd() * 11; put(S.summit.x + Math.cos(a) * r, S.summit.y + 1.4, S.summit.z + Math.sin(a) * r, rnd() * 3.2); }
        for (let i = 0; i < 60; i++) put(S.mid.x + (rnd() - .5) * (S.mid.w || 34), S.mid.y + 1.4, S.mid.z + 2 + rnd() * 5.5, .4 + rnd() * 3.6);
        for (let i = 0; i < 44; i++) { const u = .04 + .92 * rnd(); put(lerp(S.bridgeA.x, S.bridgeB.x, u) + (rnd() - .5) * 1.6, lerp(S.bridgeA.y, S.bridgeB.y, u) - 14 * u * (1 - u) + 1.6, lerp(S.bridgeA.z, S.bridgeB.z, u) + (rnd() - .5) * 1.6, 1 + rnd() * 4.5); }
        for (let i = 0; i < 22; i++) { const a = rnd() * TAU, r = 9 + rnd() * 12; put(S.gate.x + Math.cos(a) * r, S.gate.y + 1.2, S.gate.z + Math.sin(a) * r, 1.5 + rnd() * 5); }
        for (const [name, n] of [['temple', 84], ['wallL', 16], ['wallR', 16], ['needleE', 10], ['isle', 8]]) { const sp = W[name]; if (!sp) continue; const L = W.spireLedges(sp), th0 = Math.atan2(KEYC.z - sp.z, KEYC.x - sp.x);
          for (let i = 0; i < n; i++) { const y = L.length ? L[(rnd() * L.length) | 0] + .8 + rnd() * 2 : sp.h * .5, th = th0 + (rnd() - .5) * 2.7, r = W.spireR(sp, y, th) + 1 + rnd() * 2; put(sp.x + Math.cos(th) * r, y, sp.z + Math.sin(th) * r, .3 + rnd() * 6); } }
        for (let i = 0; i < 24; i++) put(S.shore.x + (rnd() - .5) * 26, S.shore.y + .6, S.shore.z + (rnd() - .5) * 18, rnd() * 5);
        for (let g = 0; DL.length < NDUSK && g < 4000; g++) { const a = rnd() * TAU, r = 22 + Math.sqrt(rnd()) * 125, x = BCX + Math.cos(a) * r, z = BCZ + Math.sin(a) * r; if (W.h(x, z) > -1 || W.inSpire(x, 1, z, 5)) continue; put(x, .7, z, rnd() * 6.5); }
        while (DL.length < NDUSK) put(S.summit.x + (rnd() - .5) * 30, S.summit.y + 1.4, S.summit.z + (rnd() - .5) * 30, rnd() * 6);
        DL.length = NDUSK; this.DL = DL; this.NDAY = NDAY; for (let i = 0; i < NDUSK; i++) lan.setColorAt(NDAY + i, col.setHex(cols[(i * 7 + (rnd() * 2 | 0)) % cols.length])); }
      lan.instanceColor.needsUpdate = true;
      // kites: a diamond sail + two ribbon tails (uv.y = distance along the tail)
      const P = [], Nn = [], Cc = [], Uv = [], I = []; const v = (x, y, z, c, t) => { P.push(x, y, z); Nn.push(0, 0, 1); Cc.push(c[0], c[1], c[2]); Uv.push(x, t); return P.length / 3 - 1; };
      { const c0 = [1, 1, 1]; const a = v(0, 1, 0, c0, 0), b = v(-.72, .25, -.12, c0, 0), c = v(0, -.9, 0, c0, 0), d = v(.72, .25, -.12, c0, 0), m0 = v(0, .25, .06, c0, 0); I.push(a, b, m0, b, c, m0, c, d, m0, d, a, m0);
        for (const sx of [-.12, .12]) { let prev = null; for (let i = 0; i <= 14; i++) { const t = i / 14, y = -.9 - t * 11, w2 = .12 * (1 - .5 * t); const l = v(sx - w2, y, 0, [.9, .2, .1], t * 11 + .001), r = v(sx + w2, y, 0, [.95, .75, .2], t * 11 + .001); if (prev) I.push(prev[0], l, prev[1], prev[1], l, r); prev = [l, r]; } } }
      const kg = new THREE.BufferGeometry(); kg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); kg.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3)); kg.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3)); kg.setAttribute('uv', new THREE.Float32BufferAttribute(Uv, 2)); kg.setIndex(I);
      const km = K.mat({ vertexColors: true, roughness: .7, side: THREE.DoubleSide, key: 'airKite',
        vert: `{ float tl = uv.y; float sd = instanceMatrix[3].x + instanceMatrix[3].z; transformed.x += sin(tl*1.2 - uTime*5.5 + sd)*.22*tl*.3 + sin(tl*.45 - uTime*2.1 + sd*2.)*.18*tl*.4; transformed.z -= tl*tl*.03 + sin(tl*.9 - uTime*4.2 + sd)*.12*tl*.25; }`,
        frag: `if(vOPos.y > -.9001){ vec2 q = vOPos.xy - vec2(0., .1); float dm = abs(q.x)*1.25 + abs(q.y); float band = step(.5, fract(dm*2.6)); diffuseColor.rgb *= mix(vec3(1.), vec3(1., .78, .25), band) * (step(.2, dm) * .0 + 1.); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.95, .9, .8), smoothstep(.2, .17, length(q))); }
               totalEmissiveRadiance += diffuseColor.rgb * uSunCol * .1 * max(dot(-kN, uSunDir), 0.);` });
      const NK = this.NK = 4, kt = this.kites = new THREE.InstancedMesh(kg, km, NK); kt.frustumCulled = false; K.scene.add(kt);
      const kcol = [0xd8281c, 0x1a8f9c, 0xe8a81c, 0xc8362a]; for (let i = 0; i < NK; i++) kt.setColorAt(i, col.setHex(kcol[i])); kt.instanceColor.needsUpdate = true;
      const wd = new V3(e.windDir.x, 0, e.windDir.y).normalize();
      this.KT = [
        { a: new V3(W.sites.mid.x, W.sites.mid.y + 2, W.sites.mid.z), out: 30, up: 38, sc: 2.1, ph: 0 },
        { a: new V3(0, 150, 0), out: 44, up: 13, sc: 2.3, ph: 2.1 },
        { a: new V3(W.sites.mid.x - 12, W.sites.mid.y + 2, W.sites.mid.z), out: 20, up: 24, sc: 1.8, ph: 4.0 },
        { a: new V3(8, 150, -6), out: 62, up: 40, sc: 2.2, ph: 5.2 },
      ]; this.wd = wd;
    }

    // ============================================================ 6. small air: leaves, petals, butterflies (instanced flakes in a box that wraps round the camera)
    {
      const tFl = K.bake(1024, 512, /* glsl */`
        float lobe(float a, float a0, float L, float w){ float d = a - a0; return L * pow(max(cos(clamp(d*w, -1.57, 1.57)), 0.), 1.4); }
        vec4 maple(vec2 p, vec3 c1, vec3 c2, float sd){ p.y += .12; float r = length(p), a = atan(p.x, p.y), aa = abs(a);
          float rm = max(max(lobe(aa, 0., 1., 2.9), lobe(aa, .92, .86, 2.7)), max(lobe(aa, 1.85, .6, 2.6), lobe(aa, 2.6, .3, 3.)));
          rm *= .93 + .09*sin(aa*38. + sd) * smoothstep(.2, .6, rm); rm = max(rm, .2);
          float in_ = smoothstep(rm, rm - .04, r);
          float stem = smoothstep(.022, .008, abs(p.x)) * step(p.y, 0.) * step(-.62, p.y);
          float vein = 0.; for(int i=0;i<4;i++){ float a0 = i == 0 ? 0. : i == 1 ? .92 : i == 2 ? 1.85 : 2.6; float d = abs(sin(aa - a0))*r; vein = max(vein, smoothstep(.02, .004, d) * step(0., cos(aa - a0))); }
          vec3 col = mix(c1, c2, smoothstep(.2, .9, r/rm) * .7 + .5*kNoise(p*5. + sd)); col *= .8 + .4*kNoise(p*17. + sd); col = mix(col, col*1.5 + .04, vein*.6); col *= .65 + .35*smoothstep(0., .25, rm - r);
          return vec4(mix(col, c1*.45, stem*(1. - in_)), max(in_, stem)); }
        vec4 ginkgo(vec2 p){ p.y += .55; float r = length(p), a = atan(p.x, p.y); float rm = 1.25*(1. - .1*smoothstep(.0, .12, abs(a) < .1 ? .1 - abs(a) : 0.)) * (.95 + .04*sin(a*40.));
          float in_ = smoothstep(.98, .9, abs(a)) * smoothstep(rm, rm - .04, r) * step(.25, r); float stem = smoothstep(.022, .008, abs(p.x)) * step(0., p.y) * step(p.y, .3);
          vec3 col = mix(vec3(.85, .55, .04), vec3(.95, .78, .1), r) * (.85 + .25*sin(a*60.)*.5 + .2*kNoise(p*9.));
          return vec4(col, max(in_, stem)); }
        vec4 petal(vec2 p, vec3 c){ float d = length(p*vec2(1.25, .82) + vec2(0., .1*abs(p.x))); float in_ = smoothstep(.78, .72, d) * (1. - smoothstep(.1, .0, length(p - vec2(0., .82)) - .08));
          return vec4(mix(c, vec3(1., .97, .95), smoothstep(.1, .8, d + .2*p.y)) * (.9 + .1*kNoise(p*20.)), in_); }
        vec4 bfly(vec2 p, vec3 c1, vec3 c2){   // one wing pair half: hinge along x = -1
          vec2 q = p + vec2(1., 0.); vec2 f = (q - vec2(.9, .42)) * mat2(.9, -.42, .42, .9) / vec2(.98, .52), h = (q - vec2(.6, -.42)) / vec2(.66, .52);
          float df = length(f), dh = length(h); float d = min(df, dh); float in_ = smoothstep(1., .94, d);
          float edge = smoothstep(.72, .86, d); float veins = smoothstep(.07, .0, abs(fract(atan(q.y - (df < dh ? .1 : -.1), q.x)*5.) - .5) - .38) ;
          vec3 col = mix(c1, c2, smoothstep(.2, .9, d)); col = mix(col, vec3(.02), max(edge, veins*.8));
          col = mix(col, vec3(.95), edge * step(.6, kVoronoi(q*9.).x) * 0. + edge*smoothstep(.1, .05, kVoronoi(q*8.).x));
          return vec4(col, in_); }
        vec4 bake(vec2 uv){ vec2 t = floor(uv*vec2(4., 2.)), p = fract(uv*vec2(4., 2.))*2. - 1.; p *= 1.06; float id = t.x + t.y*4.;
          vec4 o;
          if(id < .5) o = maple(p, vec3(.62, .05, .025), vec3(.8, .16, .03), 1.);
          else if(id < 1.5) o = maple(p, vec3(.85, .3, .03), vec3(.95, .6, .06), 5.);
          else if(id < 2.5) o = ginkgo(p);
          else if(id < 3.5) o = petal(p, vec3(.95, .55, .62));
          else if(id < 4.5) o = bfly(p, vec3(.95, .45, .04), vec3(.9, .25, .02));
          else if(id < 5.5) o = bfly(p, vec3(.75, .9, 1.), vec3(.15, .45, .95));
          else if(id < 6.5) o = maple(p, vec3(.4, .02, .03), vec3(.62, .06, .04), 9.);
          else o = petal(p, vec3(1., .9, .8));
          return o; }`, { repeat: false });
      tFl.anisotropy = 4;
      const NLEAF = 460, NBF = 12, N = NLEAF + NBF * 2, aS = new Float32Array(N * 4), aK = new Float32Array(N * 4);
      for (let i = 0; i < NLEAF; i++) { const r = rnd(), tile = r < .24 ? 0 : r < .42 ? 1 : r < .52 ? 2 : r < .64 ? 6 : r < .84 ? 3 : 7, petal = tile === 3 || tile === 7;
        aS.set([rnd(), rnd(), rnd(), rnd()], i * 4); aK.set([tile, petal ? .03 + rnd() * .018 : .055 + rnd() * .04, 0, rnd()], i * 4); }
      for (let i = 0; i < NBF; i++) { const s = [rnd(), .25 + rnd() * .4, rnd(), rnd()], w = rnd(), tile = i % 3 === 2 ? 5 : 4, sz = .045 + rnd() * .02; for (let k = 0; k < 2; k++) { const q = (NLEAF + i * 2 + k) * 4; aS.set(s, q); aK.set([tile, sz, k ? 2 : 1, w], q); } }
      const g = new THREE.InstancedBufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3)); g.setIndex([0, 1, 2, 0, 2, 3]);
      g.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 4)); g.setAttribute('aK', new THREE.InstancedBufferAttribute(aK, 4)); g.instanceCount = N;
      const m = K.shaderMat({ side: THREE.DoubleSide, uniforms: { tFl: { value: tFl }, uBox: { value: new V3(46, 24, 46) }, uCalm: (this.uCalm = { value: 1 }) },
        vertexShader: /* glsl */`
          attribute vec4 aS, aK; uniform vec3 uBox; uniform float uCalm; varying vec2 vUv; varying vec3 vN, vW;
          void main(){ float t = uTime; vec3 wind = vec3(uWind.x, 0., uWind.y); vec3 base = aS.xyz*uBox, off, e1, e2; float sz = aK.y;
            if(aK.z < .5){
              base += wind*(1.1 + 2.4*aS.w)*(.5 + 2.*uWind.z)*t + vec3(0., -(.22 + .5*aK.w)*t, 0.);
              off = vec3(sin(t*.7 + aS.w*40.), .45*sin(t*.9 + aK.w*30.), cos(t*.6 + aS.w*23.))*.55;
              float a1 = t*(1.2 + 3.2*aK.w) + aS.w*60., a2 = t*(.8 + 2.2*aS.w) + aK.w*50.;
              e1 = vec3(cos(a1), 0., sin(a1)); e2 = vec3(-sin(a1)*sin(a2), cos(a2), cos(a1)*sin(a2));
            } else {
              base += wind*.25*t;
              vec4 ph = aS.w*vec4(41., 67., 23., 89.) + aK.w*vec4(13., 7., 31., 3.);
              off = vec3(sin(t*.83 + ph.x)*1.7 + sin(t*2.1 + ph.y)*.45, sin(t*1.27 + ph.z)*.6 + sin(t*3.3 + ph.w)*.2, cos(t*.71 + ph.y)*1.7 + cos(t*1.9 + ph.x)*.45);
              vec3 vel = vec3(cos(t*.83 + ph.x)*1.41 + cos(t*2.1 + ph.y)*.95, 0., -sin(t*.71 + ph.y)*1.21 - sin(t*1.9 + ph.x)*.86);
              vec3 f = normalize(vel + vec3(1e-3, 0., 0.)), r = vec3(-f.z, 0., f.x);
              float th = .12 + 1.15*abs(sin(t*10. + ph.z)); float sd = aK.z < 1.5 ? -1. : 1.;
              e1 = (r*cos(th)*sd + vec3(0., sin(th), 0.)); e2 = f;
            }
            vec3 rel = mod(base - cameraPosition + uBox*.5, uBox) - uBox*.5;
            vec3 q = abs(rel)/uBox; float fade = 1. - smoothstep(.36, .49, max(q.x, max(q.y, q.z)));
            vec3 c = cameraPosition + rel + off; float dist = length(c - cameraPosition);
            sz *= fade * smoothstep(.45, 1.3, dist) * min(1., dist/9.) * step(.25, c.y) * (aK.z > .5 ? uCalm : 1.);
            vec2 lp = position.xy; vUv = (vec2(mod(aK.x, 4.), floor(aK.x/4.)) + lp*.5 + .5) / vec2(4., 2.);
            if(aK.z > .5){ lp.x = lp.x + 1.; if(aK.z > 1.5) vUv.x = (mod(aK.x, 4.) + lp.x*.5) / 4.; else vUv.x = (mod(aK.x, 4.) + lp.x*.5) / 4.; }
            else { float cl = lp.x*lp.x*.25*sin(t*2. + aS.w*9.); c += normalize(cross(e1, e2))*cl*sz; }   // slight cup
            vec3 wp = c + (e1*lp.x + e2*lp.y)*sz;
            vN = normalize(cross(e1, e2)); vW = wp; gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.); }`,
        fragmentShader: /* glsl */`
          uniform sampler2D tFl; varying vec2 vUv; varying vec3 vN, vW;
          void main(){ vec4 tx = texture2D(tFl, vUv); if(tx.a < .45) discard;
            vec3 V = normalize(cameraPosition - vW), N = normalize(vN); if(dot(N, V) < 0.) N = -N;
            float ndl = dot(N, uSunDir); float dif = max(ndl, 0.), tr = max(-ndl, 0.);
            vec3 hv = normalize(V + uSunDir); float sp = pow(max(dot(N, hv), 0.), 60.) * step(0., ndl);
            vec3 col = tx.rgb * (uSkyCol*.55 + uGndCol*.3 + uSunCol*(.32*dif + .3*tr)) + uSunCol*sp*.25;
            gl_FragColor = vec4(kFog(col, vW), 1.); }` });
      const mesh = this.flakes = new THREE.Mesh(g, m); mesh.frustumCulled = false; K.scene.add(mesh);
    }

    // ============================================================ 7. sparkle: depth-layered motes, seeds, insects, lantern sparks, spray glints (one Points)
    const uH = this.uH = { value: 1080 }, PREMUL = { transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor };
    const lanAll = ((K.arch && K.arch.lanterns) || []).map(l => ({ pos: l.pos || l, s: l.s || 1 })).sort((a, b) => a.pos.distanceToSquared(KEYC) - b.pos.distanceToSquared(KEYC));
    const fallA = new V3(W.sites.falls.x - 3, W.sites.falls.y - 6, W.sites.falls.z + 5), fallB = new V3(W.sites.mid.x + 6, W.sites.mid.y + 9, W.sites.mid.z + 6);
    {
      const P = [], Sx = [], add = (x, y, z, kind, size) => { P.push(x, y, z); Sx.push(rnd(), size, kind, rnd()); };
      for (let i = 0; i < 760; i++) add(rnd(), rnd(), rnd(), 0, .006 + rnd() * .009);                                  // 0 motes near the lens
      for (let i = 0; i < 130; i++) add(rnd(), rnd(), rnd(), 1, .028 + rnd() * .022);                                  // 1 dandelion seeds
      for (let i = 0; i < 1500; i++) add(rnd(), rnd(), rnd(), 2, .028 + rnd() * rnd() * .07);                          // 2 pollen in the mid-distance air (big box)
      const wis = keyLocal(8, 3.6, -2.0);
      for (let i = 0; i < 130; i++) add(wis.x + (rnd() - .5) * 7, wis.y + (rnd() - .3) * 1.4, wis.z + (rnd() - .5) * 6, 4, .009 + rnd() * .008);   // 4 insects shimmering over the wisteria
      lanAll.slice(0, 46).forEach(l => { for (let k = 0; k < 3; k++) add(l.pos.x, l.pos.y - .1 * l.s, l.pos.z, 5, .012 + rnd() * .012); });         // 5 sparks at the nearest hanging lanterns
      for (let i = 0; i < 320; i++) add(rnd(), rnd(), rnd(), 6, .02 + rnd() * .03);                                    // 6 spray drifting off the waterfall across the terrace
      for (let i = 0; i < 300; ) { const a = rnd() * TAU, r = 12 + Math.sqrt(rnd()) * 165, x = BCX + Math.cos(a) * r, z = BCZ + Math.sin(a) * r; if (W.inSpire(x, 3, z, 3)) continue; add(x, .7 + rnd() * rnd() * 9, z, 7, .1 + rnd() * .08); i++; }   // 7 fireflies over the lake at dusk
      for (let i = 0; i < 90; i++) add(wis.x + (rnd() - .5) * 9, wis.y + (rnd() - .3) * 2.2, wis.z + (rnd() - .5) * 8, 7, .03 + rnd() * .03);                // … and in the wisteria
      for (let i = 0; i < 70; i++) { const q = keyLocal(4 + rnd() * 16, (rnd() - .5) * 14, -3 + rnd() * 3.5); add(q.x, q.y, q.z, 7, .03 + rnd() * .03); }      // … and along the gate terrace
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('aS', new THREE.Float32BufferAttribute(Sx, 4));
      const m = K.shaderMat(Object.assign({ uniforms: { uBox: { value: new V3(34, 20, 34) }, uBox2: { value: new V3(170, 64, 170) }, uH, uFA: { value: fallA }, uFB: { value: fallB }, uLan: (this.uLan = { value: 0 }), uCalm: this.uCalm },
        vertexShader: /* glsl */`
          attribute vec4 aS; uniform vec3 uBox, uBox2, uFA, uFB; uniform float uH, uLan, uCalm; varying vec4 vC; varying vec2 vK;
          float beam(vec3 wp){ vec3 bx = normalize(cross(uSunDir, vec3(0., 1., 0.))), by = cross(uSunDir, bx); vec2 q = vec2(dot(wp, bx), dot(wp, by));   // shafts of light: a noise field across the sun
            return smoothstep(.4, .66, texture2D(uNoiseTex, q/70. + uTime*.0015).r*.6 + texture2D(uNoiseTex, q/19. - uTime*.003).a*.4); }
          void main(){ float t = uTime, kind = aS.z; vec3 wind = vec3(uWind.x, 0., uWind.y), wp; float fade = 1., lum = 1., minPx = 1.5; vec3 col = uSunCol*vec3(1., .93, .74)*.32;
            float tw = .55 + .45*sin(t*(2. + 5.*aS.w) + aS.x*70.);
            if(kind < 2.5){ vec3 box = kind > 1.5 ? uBox2 : uBox;
              vec3 base = position*box + wind*(.35 + .5*aS.x)*(.5 + 2.*uWind.z)*t + vec3(0., (kind > .5 && kind < 1.5 ? -.06 : .05)*t, 0.);
              vec3 rel = mod(base - cameraPosition + box*.5, box) - box*.5;
              vec3 q = abs(rel)/box; fade = 1. - smoothstep(.36, .49, max(q.x, max(q.y, q.z)));
              wp = cameraPosition + rel + vec3(sin(t*.5 + aS.w*50.), sin(t*.37 + aS.x*40.), cos(t*.43 + aS.w*30.))*(kind > 1.5 ? 1.2 : .35);
              vec3 rd = normalize(wp - cameraPosition); float tow = max(dot(rd, uSunDir), 0.), bm = beam(wp);
              if(kind < .5) lum = (.14 + 1.5*pow(tow, 3.) + .8*bm) * tw;
              else if(kind < 1.5){ lum = .55; col += uSkyCol*.25; }
              else { lum = (.04 + 1.2*bm*bm) * (.6 + .8*tw*tw) * (1. + 1.5*pow(tow, 3.)) * (1. - .6*smoothstep(-.05, .25, rd.y)); col = uSunCol*vec3(1., .8, .42)*.34; fade *= smoothstep(3., 9., length(rel)); }   // fireflies in the sunbeams
            } else if(kind < 4.5){                                                           // insects: hovering, wings flashing in the sun
              vec4 ph = aS.x*vec4(41., 67., 23., 89.) + aS.w*vec4(13., 7., 31., 3.);
              wp = position + vec3(sin(t*.9 + ph.x) + .4*sin(t*2.3 + ph.y), .35*sin(t*1.3 + ph.z) + .15*sin(t*3.1 + ph.w), cos(t*.8 + ph.y) + .4*cos(t*2.1 + ph.x))*.7
                 + vec3(sin(t*11. + ph.w), sin(t*13. + ph.x), cos(t*12. + ph.z))*.04;
              lum = .5 + 5.*pow(abs(sin(t*(9. + 9.*aS.w) + ph.z)), 10.); col = uSunCol*vec3(1., .95, .7)*.3; minPx = 1.8;
            } else if(kind < 5.5){                                                           // lantern sparks: rise, curl, cool
              float life = 1.1 + 1.3*aS.x, u = fract(t/life + aS.w), a = u*life;
              wp = position + vec3(sin(a*5. + aS.x*40.)*.12*a, .55*a - .12*a*a, cos(a*4.3 + aS.w*40.)*.12*a) + wind*.25*a;
              lum = 5.*(1. - u)*(1. - u)*smoothstep(0., .08, u); col = mix(vec3(1., .2, .03), vec3(1., .62, .16), 1. - u); minPx = 1.6;
            } else if(kind > 6.5){                                                           // fireflies: slow wander, soft green-gold pulses, only once the lanterns are lit
              vec4 ph = aS.x*vec4(41., 67., 23., 89.) + aS.w*vec4(13., 7., 31., 3.);
              wp = position + vec3(sin(t*.31 + ph.x) + .5*sin(t*.83 + ph.y), .5*sin(t*.47 + ph.z), cos(t*.29 + ph.y) + .5*cos(t*.71 + ph.x))*1.6;
              lum = 4.5*pow(max(sin(t*(.9 + 1.3*aS.w) + ph.w), 0.), 5.) * uLan; col = vec3(.78, 1., .3)*.5; minPx = 2.2;
            } else {                                                                         // waterfall spray: fine droplets carried across the terrace
              float life = 7. + 6.*aS.x, u = fract(t/life + aS.w);
              wp = mix(uFA, uFB, u) + (position - .5)*vec3(12., 16., 12.)*(.35 + u) + vec3(0., -9.*u*u + 2.*sin(u*6. + aS.x*20.), 0.);
              lum = (.25 + 3.5*pow(max(sin(t*(6. + 8.*aS.w) + aS.x*50.), 0.), 8.)) * sin(3.14159*u); col = uSunCol*vec3(.92, .97, 1.)*.3;
            }
            vec4 cp = projectionMatrix * viewMatrix * vec4(wp, 1.); gl_Position = cp;
            float px = aS.y * projectionMatrix[1][1] * uH * .5 / max(cp.w, .1);
            float small = min(px/minPx, 1.);                                    // sub-pixel points fade instead of flickering
            if(kind > 3.5 && kind < 4.5) lum *= uCalm;
            if(kind > 1.5 && kind < 2.5) lum *= .35 + .65*uCalm;
            vC = vec4(col*lum, fade*small*smoothstep(.4, 1.5, cp.w));
            vK = vec2(kind, aS.w*6.283);
            gl_PointSize = clamp(px, minPx, 32.); }`,
        fragmentShader: /* glsl */`
          varying vec4 vC; varying vec2 vK;
          void main(){ vec2 p = gl_PointCoord*2. - 1.; float r = length(p); if(r > 1.) discard; float a; bool seed = vK.x > .5 && vK.x < 1.5;
            if(seed){ float an = atan(p.y, p.x) + vK.y; float sp = pow(abs(cos(an*7.)), 14.) * smoothstep(1., .25, r) + smoothstep(.22, .05, r); a = clamp(sp, 0., 1.)*.9; }   // dandelion-like seed
            else a = smoothstep(1., .1, r); a *= a;
            gl_FragColor = vec4(vC.rgb*a*vC.a, seed ? a*vC.a*.6 : 0.); }` }, PREMUL));
      const pts = this.motes = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 13; K.scene.add(pts);
      // halos on the architecture's lanterns and stone-lantern fires
      const lan = lanAll.concat(((K.arch && K.arch.fires) || []).map(f => ({ pos: f.pos || f, s: 1.6 }))).sort((a, b) => a.pos.distanceToSquared(KEYC) - b.pos.distanceToSquared(KEYC)).slice(0, 560);
      if (lan.length) { const hp = new Float32Array(lan.length * 3), hs = new Float32Array(lan.length); lan.forEach((l, i) => { const q = l.pos; hp.set([q.x, q.y, q.z], i * 3); hs[i] = l.s * 3.4; });
        const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.BufferAttribute(hp, 3)); hg.setAttribute('aSz', new THREE.BufferAttribute(hs, 1));
        const hm = K.shaderMat({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uH, uLan: this.uLan },
          vertexShader: K.GLSL.fog + `attribute float aSz; uniform float uH, uLan; varying float vA; void main(){ vec4 cp = projectionMatrix * viewMatrix * vec4(position, 1.); gl_Position = cp; float px = aSz * (1. + 1.5*uLan) * projectionMatrix[1][1] * uH * .5 / max(cp.w, .1); vA = (1. - kFogAmt(position)) * min(px/3., 1.) * (.8 + .2*sin(uTime*3.1 + position.x*7. + position.z*3.)); gl_PointSize = clamp(px, 2., 190.); }`,
          fragmentShader: `uniform float uLan; varying float vA; void main(){ float r = length(gl_PointCoord*2. - 1.); float g = max(1. - r, 0.); float a = .34*g*g + .7*g*g*g*g*g*g; gl_FragColor = vec4(vec3(1., .5, .16)*(.5 + 1.7*uLan)*a*vA, 1.); }` });
        const hpt = this.halos = new THREE.Points(hg, hm); hpt.frustumCulled = false; hpt.renderOrder = 14; K.scene.add(hpt); }
    }

    // ============================================================ 8. soft quads: bokeh fluff near the lens, the spray veil with its rainbow, sky-lantern glows
    {
      const NB = 18, NV = 9, NLn = this.NL, N = NB + NV + NLn, A = new Float32Array(N * 4), B = new Float32Array(N * 4); this.softLan = NB + NV;
      for (let i = 0; i < NB; i++) { A.set([rnd(), rnd(), rnd(), .012 + rnd() * .02], i * 4); B.set([0, rnd(), rnd(), .1 + rnd() * .12], i * 4); }
      for (let i = 0; i < NV; i++) { const q = (NB + i) * 4; A.set([rnd(), rnd(), rnd(), 6 + rnd() * 4], q); B.set([1, i / NV, rnd(), .8 + rnd() * .4], q); }
      for (let i = 0; i < NLn; i++) { const q = (NB + NV + i) * 4; B.set([2, rnd(), rnd(), 1], q); }
      const g = new THREE.InstancedBufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3)); g.setIndex([0, 1, 2, 0, 2, 3]);
      const aA = this.softA = new THREE.InstancedBufferAttribute(A, 4); aA.setUsage(THREE.DynamicDrawUsage); g.setAttribute('aA', aA); g.setAttribute('aB', new THREE.InstancedBufferAttribute(B, 4)); g.instanceCount = N;
      const m = K.shaderMat(Object.assign({ uniforms: { uBox: { value: new V3(9, 5, 9) }, uFA: { value: fallA }, uFB: { value: fallB } },
        vertexShader: /* glsl */`
          attribute vec4 aA, aB; uniform vec3 uBox, uFA, uFB; varying vec2 vP; varying vec4 vQ; varying vec3 vW;
          void main(){ float t = uTime, kind = aB.x, sz = aA.w, al = aB.w; vec3 c;
            vec3 cr = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), cu = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
            if(kind < .5){ vec3 wind = vec3(uWind.x, 0., uWind.y); vec3 base = aA.xyz*uBox + wind*(.25 + .3*aB.y)*t + vec3(0., -.04*t, 0.);
              vec3 rel = mod(base - cameraPosition + uBox*.5, uBox) - uBox*.5; vec3 q = abs(rel)/uBox;
              c = cameraPosition + rel + vec3(sin(t*.4 + aB.y*40.), sin(t*.3 + aB.z*40.), cos(t*.35 + aB.y*20.))*.25;
              float d = length(rel); al *= (1. - smoothstep(.36, .49, max(q.x, max(q.y, q.z)))) * smoothstep(.9, 1.7, d) * (1. - smoothstep(2.6, 4.4, d));
              sz *= (1. + .7/max(d, 1.)) * min(1., 2.475/projectionMatrix[1][1]);        // the closer, the more out of focus; long lenses don't magnify it
            } else if(kind < 1.5){ float u = fract(t*.022 + aB.y);
              c = mix(uFA, uFB, u) + (aA.xyz - .5)*vec3(8., 10., 8.) + vec3(0., -7.*u*u, 0.); sz *= .7 + .9*u; al *= sin(3.14159*u);
            } else c = aA.xyz;
            vec3 wp = c + (cr*position.x + cu*position.y)*sz;
            vP = position.xy; vQ = vec4(kind, al, aB.y, aB.z); vW = wp; gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.); }`,
        fragmentShader: /* glsl */`
          varying vec2 vP; varying vec4 vQ; varying vec3 vW;
          void main(){ float r = length(vP); if(r > 1.) discard; vec3 col; float a;
            if(vQ.x < .5){ float disc = smoothstep(1., .9, r), rim = smoothstep(.62, .95, r); col = (uSunCol*vec3(1., .96, .86)*.2 + uSkyCol*.3) * (.75 + .5*rim) * disc * vQ.y; a = disc*vQ.y*.35; }   // bokeh disc
            else if(vQ.x < 1.5){ vec3 rd = normalize(vW - cameraPosition); float th = degrees(acos(clamp(dot(rd, -uSunDir), -1., 1.)));
              float soft = pow(1. - r, 1.5) * (.5 + texture2D(uNoiseTex, vP*.21 + vQ.zw*3. + uTime*.01).r);
              float x = (th - 40.1)/2.5, x2 = (53.6 - th)/3.2;
              vec3 bow = clamp(vec3(1.5 - abs(4.*x - 3.), 1.5 - abs(4.*x - 2.), 1.5 - abs(4.*x - 1.)), 0., 1.) * smoothstep(0., .15, x) * smoothstep(1., .85, x)
                       + clamp(vec3(1.5 - abs(4.*x2 - 3.), 1.5 - abs(4.*x2 - 2.), 1.5 - abs(4.*x2 - 1.)), 0., 1.) * smoothstep(0., .15, x2) * smoothstep(1., .85, x2) * .3;
              col = (uSunCol*.01 + bow*uSunCol*.02) * soft * vQ.y; a = 0.; }
            else { float g = pow(1. - r, 2.2); col = (vec3(1., .46, .13) * (.9*g + 1.6*g*g*g) + vec3(1., .8, .45)*3.*pow(g, 9.)) * (.85 + .15*sin(uTime*4. + vQ.z*40.)); a = 0.; }                                              // warm glow round a sky lantern
            gl_FragColor = vec4(col, a); }` }, PREMUL));
      const mesh = this.soft = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 15; K.scene.add(mesh);
    }

    // ============================================================ 9. the dragons' air: embers, sparks, mane dust, flung droplets (hero) · sun glints (rival)
    {
      const P = [], Sx = [], Kx = [], add = (kind, life, size, s0) => { P.push(0, 0, 0); Sx.push(rnd(), rnd(), rnd(), rnd()); Kx.push(kind, life, size, s0); };
      for (let i = 0; i < 520; i++) add(0, .7 + rnd() * rnd() * 3.2, .2 + rnd() * rnd() * .75, 0);            // embers streaming back from the jaws along the body
      for (let i = 0; i < 70; i++) add(1, .45 + rnd() * .7, .12 + rnd() * .22, 0);                       // sparks spat from the jaws
      for (let i = 0; i < 650; i++) add(2, 1.2 + rnd() * 1.4, .07 + rnd() * .12, 2 + rnd() * 34);        // golden dust shed by the mane
      for (let i = 0; i < 300; i++) add(3, .7 + rnd() * .7, .08 + rnd() * .1, 6 + rnd() * 136);         // droplets flung off the body
      for (let i = 0; i < 180; i++) add(4, 1, .7 + rnd() * .7, rnd() * 3.4);                              // glints along the rival
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('aS', new THREE.Float32BufferAttribute(Sx, 4)); g.setAttribute('aK', new THREE.Float32BufferAttribute(Kx, 4));
      const NP = this.NP = 64, NR = this.NR = 20;
      const U2 = this.dU = { uPath: { value: Array.from({ length: NP }, () => new V3()) }, uPathR: { value: Array.from({ length: NR }, () => new V3()) }, uMo: { value: new THREE.Vector4() }, uMd: { value: new THREE.Vector4(0, 0, 1, 30) }, uUp: { value: new THREE.Vector4(0, 1, 0, 1) }, uH, uRv: { value: 1 } };
      const m = K.shaderMat(Object.assign({ uniforms: U2,
        vertexShader: /* glsl */`
          attribute vec4 aS, aK; uniform vec3 uPath[${NP}]; uniform vec3 uPathR[${NR}]; uniform vec4 uMo, uMd, uUp; uniform float uH, uRv; varying vec3 vC;
          vec3 pathAt(float s){ float f = clamp(s/4., 0., ${NP - 1.01}); int i = int(f); return mix(uPath[i], uPath[i+1], f - float(i)); }          // hero spine by arc length (m behind the head)
          vec3 pathR(float tau){ float f = clamp(tau/.2, 0., ${NR - 1.01}); int i = int(f); return mix(uPathR[i], uPathR[i+1], f - float(i)); }     // rival head path by time (s ago)
          void main(){ float t = uTime, kind = aK.x, life = aK.y, v = uMd.w, a = fract(t/life + aS.w)*life, u = a/life, sz = aK.z, lum, minPx = 1.5, vis = uUp.w;
            vec3 rn = normalize(aS.xyz*2. - 1. + 1e-3), wp, col; float tw = sin(t*(7. + 9.*aS.x) + aS.y*40.);
            if(kind < .5){ float T = 1. - u;                                                            // ember: born at the mouth, left behind in the air, swirls outward and up, cools
              float spread = mix(.6, 3.4 + 1.4*aS.x, smoothstep(0., .45, a)) + 2.6*sqrt(a)*aS.y;
              wp = pathAt(v*a) + uMo.xyz*(1. - smoothstep(0., .5, a)) + rn*spread
                 + vec3(0., .7*a + .2*a*a, 0.) + vec3(sin(a*3.1 + aS.y*20.), cos(a*2.3 + aS.x*17.), sin(a*2.7 + aS.z*31.))*.7*a;
              col = mix(vec3(1., .3, .03), vec3(1., .42, .05), smoothstep(.15, .6, T)); col = mix(col, vec3(1., .66, .18), smoothstep(.75, 1., T));
              lum = 3.4*pow(T, 1.5) * (.7 + .3*tw) * smoothstep(0., .04, u) * (.4 + .6*uMo.w); sz *= .5 + .5*T;
            } else if(kind < 1.5){                                                                    // spark: thrown forward out of the jaws, then overtaken
              wp = pathAt(v*a) + uMo.xyz + uMd.xyz*((v + 12.)*a*(1. - .45*u)) + rn*(1. + 8.*a) - vec3(0., 3.*a*a, 0.);
              col = vec3(1., .5, .1); lum = 2.6*(1. - u)*(1. - u)*(.6 + .4*tw)*uMo.w;
            } else if(kind < 2.5){                                                                    // mane dust: gold glitter shed along the neck
              wp = pathAt(aK.w + v*a) + uUp.xyz*2.3 + rn*(1.2 + 1.1*a) - vec3(0., .4*a*a, 0.) + vec3(sin(a*2.1 + aS.y*20.), 0., cos(a*1.7 + aS.x*20.))*.4*a;
              col = vec3(1., .66, .16); lum = (.5 + 2.6*pow(max(tw, 0.), 5.)) * smoothstep(0., .1, u) * (1. - u);
            } else if(kind < 3.5){                                                                    // droplets: flung outward, fall, flash in the sun
              wp = pathAt(aK.w + v*a) + rn*(2.5 + 3.5*a) + vec3(0., 1.2*a - 4.*a*a, 0.);
              col = vec3(.9, .97, 1.); lum = (.1 + 5.*pow(max(tw, 0.), 9.)) * (1. - u) * smoothstep(0., .1, u);
            } else {                                                                                  // the rival: sunlight flashing along its scales
              wp = pathR(aK.w) + rn*(1.8 + 2.2*aS.x); col = vec3(1., .74, .26); lum = .8 + 6.*pow(max(sin(t*(4. + 7.*aS.x) + aS.y*50.), 0.), 10.); minPx = 2.6; vis = uRv;
            }
            vec4 cp = projectionMatrix * viewMatrix * vec4(wp, 1.); gl_Position = cp;
            float px = sz * projectionMatrix[1][1] * uH * .5 / max(cp.w, .1);
            vC = col * lum * min(px/minPx, 1.) * smoothstep(.6, 2.5, cp.w) * vis * smoothstep(0., 1.5, wp.y);
            gl_PointSize = clamp(px, minPx, 28.); }`,
        fragmentShader: /* glsl */`
          varying vec3 vC;
          void main(){ float r = length(gl_PointCoord*2. - 1.); if(r > 1.) discard; float a = 1. - r; a = a*a*(.3 + 1.5*a*a*a*a);                  // a hot core in a soft glow
            gl_FragColor = vec4(vC*a, 0.); }` }, PREMUL));
      const pts = this.dfx = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 21; K.scene.add(pts);
    }

    // ============================================================ 10. dragonflies near the gate terrace (in front of the key camera)
    {
      const P = [], C = [], I = [], quad = (pts, c) => { const b = P.length / 3; for (const q of pts) { P.push(q[0], q[1], q[2]); C.push(c[0], c[1], c[2]); } I.push(b, b + 1, b + 2, b, b + 2, b + 3); };
      const body = [.05, .5, .62], wing = [.8, .93, 1.];
      quad([[-.004, 0, .03], [.004, 0, .03], [.003, 0, -.05], [-.003, 0, -.05]], body); quad([[0, -.004, .03], [0, .004, .03], [0, .003, -.05], [0, -.003, -.05]], body);
      quad([[-.007, -.006, .034], [.007, -.006, .034], [.007, .006, .022], [-.007, .006, .022]], [.1, .7, .5]);
      for (const sx of [-1, 1]) { quad([[sx * .004, .003, .022], [sx * .05, .004, .03], [sx * .052, .004, .017], [sx * .004, .003, .012]], wing); quad([[sx * .004, .003, .01], [sx * .046, .004, .008], [sx * .048, .004, -.006], [sx * .004, .003, .0]], wing); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setIndex(I); g.computeVertexNormals();
      const m = K.mat({ vertexColors: true, roughness: .25, metalness: .3, side: THREE.DoubleSide, key: 'airDfly',
        vert: `{ float w = smoothstep(.0045, .012, abs(position.x)); transformed.y += w * abs(position.x) * .55 * sin(uTime*95. + instanceMatrix[3].x*7.); }`,
        frag: `float wg = smoothstep(.0045, .012, abs(vOPos.x)); totalEmissiveRadiance += diffuseColor.rgb * uSunCol * .12 * wg; diffuseColor.rgb *= 1. - .4*wg*step(.5, fract(vOPos.x*260.));` });
      const ND = this.ND = 14, mesh = this.dflies = new THREE.InstancedMesh(g, m, ND); mesh.frustumCulled = false; K.scene.add(mesh);
      this.DF = []; for (let i = 0; i < ND; i++) this.DF.push({ c: i < 6 ? keyLocal(5 + rnd() * 5, -1 + rnd() * 5.5, -2.1 + rnd() * 1.3) : new V3(-19 + (rnd() - .5) * 9, 1.5 + rnd() * 1.6, 141 + (rnd() - .5) * 8), r: 1.2 + rnd() * 1.3, T: .7 + rnd() * .6, sd: rnd() * 100, sc: 1.5 + rnd() * .5 });
    }
    this.hero = ['temple', 'gate', 'needleE', 'needleW', 'shelf', 'wallR', 'wallL', 'isle'].map(n => W[n]).filter(Boolean).map(s => ({ x: s.x, z: s.z, h: s.h, r: s.r * 1.02, rt: Math.max(s.topR * 1.1, s.r * .8) }));
    air.sprites = this.S; this.keep = ((K.arch && K.arch.keepOut) || []).filter(c => c && c.r > 0);
  },

  update(F) {
    const t = F.t, e = K.env, cam = K.camera, cp = cam.position, S = this.S, buf = this.buf, depth = this.depth, order = this.order;
    const fwd = this._f || (this._f = new V3()); cam.getWorldDirection(fwd);
    const wx = e.windDir.x, wz = e.windDir.y, mistAmt = sat(e.mist * 1.45) * air.mist, sunH = Math.hypot(e.sunDir.x, e.sunDir.z) || 1, SHT = SH_T;
    this.sea.material.uniforms.uSea.value.w = mistAmt;
    // ---- the dragons this frame: hero spine by arc length (the dragon module's own spine if it ran, else the film's head path), rival head path by time
    const Dg = F.dragon, vD = Math.max(Dg.speed || 30, 8), film = K.film, hasD = !!(K.dragon && K.dragon.spine && K.mod.dragon && K.mod.dragon.ok), heroVis = Dg.vis !== false;
    const spine = (sa, out) => hasD ? K.dragon.spine(sa, out) : film.dragonPos(t - sa / vD, out);
    const dU = this.dU, UP = dU.uPath.value, UR = dU.uPathR.value, hasR = !!film.rivalPos;
    for (let k = 0; k < this.NP; k++) spine(k * 4, UP[k]);
    for (let k = 0; k < this.NR; k++) { if (hasR) film.rivalPos(t - k * .2, UR[k]); else UR[k].set(0, -1e5, 0); }
    if (hasD) { const mo = K.dragon.mouth; dU.uMo.value.set(mo.pos.x - K.dragon.head.x, mo.pos.y - K.dragon.head.y, mo.pos.z - K.dragon.head.z, 0); dU.uMd.value.set(mo.dir.x, mo.dir.y, mo.dir.z, vD); }
    else { dU.uMo.value.set(Dg.fwd.x * 7, Dg.fwd.y * 7 - 1, Dg.fwd.z * 7, 0); dU.uMd.value.set(Dg.fwd.x, Dg.fwd.y, Dg.fwd.z, vD); }
    dU.uMo.value.w = sat(.3 + .5 * (Dg.jaw || 0) + .6 * (Dg.roar || 0)); dU.uUp.value.set(Dg.up.x, Dg.up.y, Dg.up.z, heroVis ? 1 : 0);
    const RS = this._rs || (this._rs = new Float32Array(24)), V = this._v || (this._v = [new V3(), new V3(), new V3(), new V3(), new V3()]);
    for (let j = 0; j < 8; j++) { spine(j * 20, V[0]); RS[j * 3] = V[0].x; RS[j * 3 + 1] = V[0].y; RS[j * 3 + 2] = V[0].z; }
    const cr = V[3].setFromMatrixColumn(cam.matrixWorld, 0), cu = V[4].setFromMatrixColumn(cam.matrixWorld, 1);
    const rivVis = hasR && (!F.rival || F.rival.vis !== false); dU.uRv.value = rivVis ? 1 : 0;
    // where and when the golden one bursts out of its cloud (T.rival on the path active this frame): the torn halo and the cloud tower itself
    const tbr = t - TRIVAL; this.halo = null; this.gate = null;
    if (hasR && t >= T_GATE_ON && t < T_GATE_OFF) { const H = this._halo || (this._halo = { P0: new V3(), T0: new V3(), u1: new V3(), u2: new V3(), C: new V3() });
      film.rivalPos(TRIVAL, H.P0); film.rivalPos(TRIVAL + .2, H.T0).sub(film.rivalPos(TRIVAL - .2, V[0])).normalize(); H.u1.crossVectors(H.T0, V[1].set(0, 1, 0)).normalize(); H.u2.crossVectors(H.u1, H.T0);
      film.rivalPos(TRIVAL - .9, H.C); H.tb = TRIVAL; this.gate = H; if (tbr > 0 && tbr < 11) this.halo = H; }
    const gateVis = this.gate ? 1 - smooth(TRIVAL + 6, T_GATE_OFF, t) : 0;
    // ---- puffs: closed-form positions, camera fade, back-to-front sort
    let n = 0;
    for (let i = 0; i < S.length && n < this.MAXS; i++) { const s = S[i]; let x, y, z, sz = s.sz, al = s.al, st = s.st || 1, roll = s.roll || 0, tile = s.tile;
      if (s.k === 0) { const th = s.th + s.om * t, r = radAt(s.tb, th) + sz * s.off, ct = Math.cos(th), sn = Math.sin(th); x = s.s.x + ct * r; z = s.s.z + sn * r; y = s.y + 3 * Math.sin(t * .11 + s.ph); al *= .75 + .25 * Math.sin(t * .07 + s.ph * 3);
        // mist hangs on the flanks and the lee of a pillar: (almost) none between the lens and a sunlit rock face
        const cx = cp.x - s.s.x, cz = cp.z - s.s.z, cl = Math.hypot(cx, cz) || 1, toCam = (ct * cx + sn * cz) / cl, toSun = (ct * e.sunDir.x + sn * e.sunDir.z) / sunH;
        al *= 1 - .93 * smooth(-.15, .45, toCam) * smooth(-.35, .25, toSun) * (.55 + .45 * smooth(14, 30, y)); }
      else if (s.k === 1) { const u = ((t * s.v / s.len + s.ph) % 1 + 1) % 1, d = (u - .5) * s.len; x = s.x + wx * d; z = s.z + wz * d; y = s.y + 1.2 * Math.sin(t * .13 + s.ph * 9); al *= Math.sin(Math.PI * u); }
      else if (s.k === 2) { const u = ((s.u0 + t * s.v) % 1 + 1) % 1, r = lerp(s.r0, s.r1, u), a = s.a + .12 * Math.sin(u * 5 + s.ph); x = BCX + Math.cos(a) * r; z = BCZ + Math.sin(a) * r;
        y = lerp(46, 7, smooth(.15, .8, u)) + sz * .15 + 2 * Math.sin(t * .2 + s.ph); al *= smooth(0, .12, u) * (1 - smooth(.72, 1, u)); st = s.st * (1 + u); }
      else if (s.k === 3) { x = s.x + 6 * Math.sin(t * .05 + s.ph); z = s.z + 6 * Math.cos(t * .043 + s.ph); y = s.y + 3.5 * Math.sin(t * .09 + s.ph * 2); al *= .8 + .2 * Math.sin(t * .06 + s.ph * 5); }
      else if (s.k === 5) { if (!heroVis || Dg.under) continue;                                                      // wake vortices: shed behind the tail, they stay in the air, swell and curl
        const life = 100 / vD, age = (((s.u0 + t / life) % 1) + 1) % 1 * life, ua = age / life, sa = 150 + vD * age; spine(sa, V[0]); spine(sa + 3, V[1]).sub(V[0]).normalize();
        V[2].set(-V[1].z, 0, V[1].x).normalize(); const up2x = V[2].y * V[1].z - V[2].z * V[1].y, up2y = V[2].z * V[1].x - V[2].x * V[1].z, up2z = V[2].x * V[1].y - V[2].y * V[1].x;
        const ang = s.ph + s.dir * age * 2.4, rr = 2 + 3.5 * ua, ca = Math.cos(ang) * rr, sa2 = Math.sin(ang) * rr;
        x = V[0].x + V[2].x * ca + up2x * sa2; y = V[0].y + V[2].y * ca + up2y * sa2; z = V[0].z + V[2].z * ca + up2z * sa2;
        if (y < 3) continue; sz = 3.5 + 10 * ua + 2 * s.r; al = .42 * smooth(0, .12, ua) * Math.pow(1 - ua, 1.5); st = 1.15; roll = s.ph + s.dir * age * 1.7; }
      else if (s.k === 6) { if (!rivVis || tbr < -1 || tbr > 9) continue; const tau = s.tau;                                       // the rival's cloud streamers
        film.rivalPos(t - tau, V[0]); film.rivalPos(t - tau + .15, V[1]).sub(film.rivalPos(t - tau - .15, V[2]));
        const w = 5 + 4.5 * tau; x = V[0].x + Math.sin(s.ph + t * .6) * w; y = V[0].y + Math.cos(s.ph * 1.7 + t * .5) * w * .7; z = V[0].z + Math.sin(s.ph * 2.3 - t * .4) * w;
        sz = 11 + 5.5 * tau + 6 * s.r; al = .7 * smooth(.3, .9, tau) * (1 - tau / 7) * smooth(-.6, .4, tbr - tau * .5) * (1 - smooth(5, 9, tbr)); st = 2.6; roll = Math.atan2(V[1].dot(cu), V[1].dot(cr)); }
      else if (s.k === 7) { const h = this.halo; if (!h) continue; const age = t - h.tb; if (age < 0 || age > 11) continue;   // the halo of vapour it tore out of the cloud: a ring opening round the burst point
        const Rr = (34 + 15 * Math.sqrt(age)) * (.85 + .3 * s.r), ang = s.a + .05 * age, ca = Math.cos(ang) * Rr, sa2 = Math.sin(ang) * Rr, ax = -12 + 24 * s.r;
        x = h.P0.x + h.u1.x * ca + h.u2.x * sa2 + h.T0.x * ax; y = h.P0.y + h.u1.y * ca + h.u2.y * sa2 + h.T0.y * ax; z = h.P0.z + h.u1.z * ca + h.u2.z * sa2 + h.T0.z * ax;
        sz = s.sz * (1 + .12 * age); al = .8 * smooth(0, .5, age) * (1 - smooth(4, 11, age)); st = 1.3; roll = ang + s.ph * .2; }
      else if (s.k === 8) { const g = this.gate; if (!g || gateVis <= 0) continue;                        // the cloud tower across the rival's path; torn open as it comes through
        let lx = s.ox * 88, ly = s.oy * 96 + 22; const la = s.ax * 58, d = Math.hypot(lx, ly), open = smooth(-1.1, 1.3, tbr);
        if (d < 46) { const k = (d + (46 - d) * open * 1.15) / Math.max(d, 1); lx *= k; ly *= k; }
        x = g.C.x + g.u1.x * lx + g.T0.x * la; y = g.C.y + ly; z = g.C.z + g.u1.z * lx + g.T0.z * la;
        sz = s.sz * (1 + .1 * Math.sin(t * .13 + s.ph)); al = .92 * gateVis; st = 1.25; roll = s.roll + .02 * Math.sin(t * .2 + s.ph); }
      else { const u = ((s.u0 + t * .05) % 1 + 1) % 1, h = u * 13 * s.s, cw = u * u * 2.6;                 // incense: a thin thread that widens, curls and leans with the wind
        x = s.x + (wx * h * .3 * u + (.45 * Math.sin(u * 11 - t * .7) + .3 * Math.sin(u * 9 + s.ph + t * .5)) * cw) * s.s; z = s.z + (wz * h * .3 * u + (.45 * Math.cos(u * 9.5 - t * .6) + .3 * Math.cos(u * 8 + s.ph + t * .4)) * cw) * s.s; y = s.y + h;
        sz = (.26 + 2.3 * Math.pow(u, 1.2)) * s.s; al = .9 * smooth(0, .03, u) * Math.pow(1 - u, 1.3); st = 1; roll = s.roll + t * .2; tile = s.tile + 16; }
      if (s.k <= 2 && heroVis) { const R = 20 + sz * .5;                                                  // pressure ripple: the dragon shoulders the mist aside
        for (let j = 0; j < 24; j += 3) { const ex = x - RS[j], ey = y - RS[j + 1], ez = z - RS[j + 2], d2 = ex * ex + ey * ey + ez * ez; if (d2 < R * R) { const d = Math.sqrt(d2) || 1; let pu = 1 - d / R; pu *= pu; x += ex / d * pu * 14; y += ey / d * pu * 7; z += ez / d * pu * 14; al *= 1 - .75 * pu; } } }
      const dx = x - cp.x, dy = y - cp.y, dz = z - cp.z, dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      al *= smooth(sz * .7, sz * 2.4, dist) * (s.k >= 4 ? 1 : mistAmt); if (al < .004) continue;
      if (s.k < 3) { const kp = this.keep, m = sz * .55; for (let j = 0; j < kp.length; j++) { const c = kp[j]; if (y < c.y0 - m || y > c.y1 + m) continue; const ddx = x - c.x, ddz = z - c.z, rr = c.r + m; if (ddx * ddx + ddz * ddz < rr * rr) { al *= smooth(c.r * .5, rr, Math.sqrt(ddx * ddx + ddz * ddz)); if (al < .004) break; } } if (al < .004) continue; }
      if (s.k === 2 && W.inSpire(x, y, z, sz * .5)) continue;
      let lit = 1; if (s.k !== 3 && s.k < 5) { const H = this.hero, sd = e.sunDir;                              // soft shadow of the hero pillars (tapered cylinders)
        for (let j = 0; j < H.length && lit > .02; j++) { const p = H[j], ox = x - p.x, oz = z - p.z, bq = ox * sd.x + oz * sd.z; if (bq > 0 || y > p.h) continue;
          for (let m = 0; m < 5; m++) { const tt = SHT[m], yy = y + sd.y * tt; if (yy > p.h) break; const dx2 = ox + sd.x * tt, dz2 = oz + sd.z * tt, R = lerp(p.r, p.rt, sat(yy / p.h)), v = smooth(R * .8, R * 1.2, Math.sqrt(dx2 * dx2 + dz2 * dz2)); if (v < lit) lit = v; } } }
      if (s.k === 6) lit = .5; else if (s.k === 7) lit = .1 + .5 * s.r; else if (s.k === 8) lit = s.oy > -.2 ? .8 + .2 * s.r : .35 + .4 * s.r;
      const q = n * 8; buf[q] = x; buf[q + 1] = y; buf[q + 2] = z; buf[q + 3] = sz; buf[q + 4] = roll; buf[q + 5] = al; buf[q + 6] = tile; buf[q + 7] = Math.min(st, 7.9) + 8 * Math.round(lit * 15);
      depth[n] = dx * fwd.x + dy * fwd.y + dz * fwd.z; order[n] = n; n++; }
    const ord = Array.prototype.slice.call(order, 0, n).sort((a, b) => depth[b] - depth[a]);
    const P = this.aP.array, Q = this.aQ.array;
    for (let i = 0; i < n; i++) { const q = ord[i] * 8, o = i * 4; P[o] = buf[q]; P[o + 1] = buf[q + 1]; P[o + 2] = buf[q + 2]; P[o + 3] = buf[q + 3]; Q[o] = buf[q + 4]; Q[o + 1] = buf[q + 5]; Q[o + 2] = buf[q + 6]; Q[o + 3] = buf[q + 7]; }
    this.aP.needsUpdate = true; this.aQ.needsUpdate = true; this.puffs.geometry.instanceCount = n;
    this.shafts.material.uniforms.uAmt.value = air.shafts * (1 - .8 * e.storm);
    // great beams: through the windows of the building storm (they close as it reaches full strength), and again when it breaks after the rain
    this.shafts.material.uniforms.uBrk.value = air.shafts * Math.max(smooth(TRAIN0, TRAIN0 + 1.8, t) * (1 - smooth(TRAIN1, TRAIN1 + 4, t)), t < TRAIN0 ? .8 * smooth(.3, .45, e.storm || 0) * (1 - smooth(.66, .82, e.storm || 0)) : 0);

    // ---- birds
    const o = this._o || (this._o = new THREE.Object3D()), p = this._p || (this._p = new V3()), tn = this._t || (this._t = new V3()), X = this._x || (this._x = new V3()), Y = this._y || (this._y = new V3()), M = this._m || (this._m = new THREE.Matrix4());
    const place = (mesh, i, pos, tan, bank, sc) => { X.set(tan.z, 0, -tan.x).normalize(); Y.crossVectors(tan, X).normalize(); if (bank) { X.applyAxisAngle(tan, bank); Y.applyAxisAngle(tan, bank); }
      M.makeBasis(X, Y, tan); M.scale(p.set(sc, sc, sc)); M.setPosition(pos); mesh.setMatrixAt(i, M); };
    let q = 0; const P2 = this._p2 || (this._p2 = new V3());
    for (const f of this.flocks) for (let i = 0; i < f.n; i++, q++) { const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1, jit = K.hash(q * 7.3, 5);
      if (f.line) f.path(t, i * f.sp * (1 + .2 * (jit - .5)), (K.hash(q * 3.1, 9) - .5) * f.sp * .7 + (i % 2 ? 2.2 : -2.2), P2, tn);
      else f.path(t, row * f.sp * (1 + .25 * jit) + (f.n === 2 ? i * 1.5 : 0), side * row * f.sp * .7 * (f.n === 2 ? .9 : 1), P2, tn);
      P2.y += row * .35 * (jit - .3) + .5 * Math.sin(t * .7 + q * 1.7); place(this.cranes, q, P2, tn, (f.bank || 0) + .06 * Math.sin(t * .4 + q), f.sc); }
    // the cranes circling low over the calm lake burst outward and up when the dragon erupts (gone by the cut to the key shot)
    for (let i = 0; i < this.NSC; i++, q++) { const c = this.SC[i], at = (tt, out) => { const tau = Math.max(0, tt - TRISE - c.d), a = c.a + c.w * (Math.min(tt, TRISE + c.d) + tau * .35), r = c.r + c.v * Math.pow(tau, 1.25);
        return out.set(c.cx + Math.cos(a) * r, c.y + .35 * Math.sin(tt * .9 + i) + c.up * Math.pow(tau, 1.3), c.cz + Math.sin(a) * r); };
      at(t, P2); at(t + .06, tn).sub(P2).normalize(); if (t >= T_KEYCUT) P2.y = -500; place(this.cranes, q, P2, tn, -.25 * Math.sign(c.w) * (t < TRISE ? 1 : .3), 1.25); }
    this.cranes.instanceMatrix.needsUpdate = true;
    // no birds in the storm sky: they are gone from the cut to the helix until the cut to the parting at dusk, when they return
    const birdsOn = !(t >= T_BIRDS_OFF && t < T_BIRDS_ON); this.cranes.visible = this.hawk.visible = this.swallows.visible = birdsOn;
    { const a = t * TAU / 21 + 1.2, c = this.hawkC, r = 32; P2.set(c.x + Math.cos(a) * r, c.y + 5 * Math.sin(t * .13), c.z + Math.sin(a) * r); tn.set(-Math.sin(a), .02, Math.cos(a)).normalize(); place(this.hawk, 0, P2, tn, .5, 1.35); this.hawk.instanceMatrix.needsUpdate = true; }
    for (let i = 0; i < this.NSW; i++) { const s = this.sws[i], f = s.f, ph = s.p;
      const px = Math.sin(t * f[0] + ph[0]) * s.r + Math.sin(t * f[1] * 1.7 + ph[1]) * s.r * .3, py = Math.sin(t * f[1] + ph[1]) * s.r * .35, pz = Math.cos(t * f[2] + ph[2]) * s.r + Math.cos(t * f[0] * 1.9 + ph[0]) * s.r * .3;
      P2.set(s.c.x + px, s.c.y + py, s.c.z + pz);
      tn.set(Math.cos(t * f[0] + ph[0]) * f[0] + Math.cos(t * f[1] * 1.7 + ph[1]) * f[1] * .51, Math.cos(t * f[1] + ph[1]) * f[1] * .35, -Math.sin(t * f[2] + ph[2]) * f[2] - Math.sin(t * f[0] * 1.9 + ph[0]) * f[0] * .57).normalize();
      if (W.inSpire(P2.x, P2.y, P2.z, 1.5)) P2.y += 400;
      place(this.swallows, i, P2, tn, .5 * Math.sin(t * f[0] * 2 + ph[2]), s.sc); }
    this.swallows.instanceMatrix.needsUpdate = true;

    // ---- sky lanterns and kites
    const dayLan = 1 - smooth(.42, .68, e.storm || 0);                      // the day's little clusters are taken in before the storm
    for (let i = 0; i < this.NDAY; i++) { const L = this.L[i], H = L.H, u = ((L.u0 + t * L.v / H) % 1 + 1) % 1, h = u * H, dr = h * L.k * (1 + h / 160);
      o.position.set(L.x + wx * dr + 1.4 * Math.sin(t * .31 + L.ph), L.y + h, L.z + wz * dr + 1.4 * Math.cos(t * .27 + L.ph));
      o.rotation.set(.08 * Math.sin(t * .5 + L.ph), t * .1 + L.ph, .08 * Math.cos(t * .43 + L.ph)); const ls = L.sc * smooth(0, .05, u) * (1 - smooth(.9, 1, u)) * dayLan; o.scale.setScalar(ls + 1e-4); o.updateMatrix(); this.lanterns.setMatrixAt(i, o.matrix);
      const g = (this.softLan + i) * 4, A = this.softA.array; A[g] = o.position.x; A[g + 1] = o.position.y + .45 * ls; A[g + 2] = o.position.z; A[g + 3] = ls * 2.6; }
    { const DL = this.DL, on = t >= TLAN, A = this.softA.array;
      for (let i = 0; i < DL.length; i++) { const L = DL[i], q = this.NDAY + i, g = (this.softLan + q) * 4; let x = L.x, y = L.y, z = L.z, ls = 0;
        if (on) { const tau = t - TLAN - L.t0; ls = L.sc;
          if (tau > 0) { const h = L.v * tau * (1 - .03 * Math.min(tau, 12)), dr = (.9 * tau + .16 * tau * tau) * L.k, sw = .5 + h * .035;
            x += wx * dr + Math.sin(h * .06 + L.ph + t * .25) * sw; z += wz * dr + Math.cos(h * .05 + L.ph * 1.3 + t * .2) * sw; y += h; }
          else y += .12 * Math.sin(t * 1.3 + L.ph);
          o.rotation.set(.07 * Math.sin(t * .5 + L.ph), t * .1 + L.ph, .07 * Math.cos(t * .43 + L.ph)); } else { y = -300; o.rotation.set(0, 0, 0); }
        o.position.set(x, y, z); o.scale.setScalar(ls + 1e-4); o.updateMatrix(); this.lanterns.setMatrixAt(q, o.matrix);
        A[g] = x; A[g + 1] = y + .4 * ls; A[g + 2] = z; A[g + 3] = ls * 1.9; } }
    this.softA.needsUpdate = true;
    this.lanterns.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < this.NK; i++) { const k = this.KT[i], sx = Math.sin(t * .37 + k.ph), sy = Math.sin(t * .74 + k.ph * 2);
      o.position.set(k.a.x + this.wd.x * k.out - this.wd.z * sx * 7, k.a.y + k.up + sy * 2.5 + sx * sx * 2, k.a.z + this.wd.z * k.out + this.wd.x * sx * 7);
      o.rotation.set(0, 0, 0); o.lookAt(o.position.x - this.wd.x, o.position.y + .75, o.position.z - this.wd.z); o.rotateZ(.25 * Math.cos(t * .37 + k.ph)); o.scale.setScalar(k.sc); o.updateMatrix(); this.kites.setMatrixAt(i, o.matrix); }
    this.kites.instanceMatrix.needsUpdate = true;
    // ---- dragonflies: hover, dart to a new spot, hover (they shelter from storm and rain, like the butterflies)
    for (let i = 0; i < this.ND; i++) { const d = this.DF[i], ft = t / d.T, k = Math.floor(ft), u = smooth(0, .4, ft - k), h = (kk, a) => K.hash(kk + d.sd, a) - .5;
      const ax = h(k, 1), ay = h(k, 2), az = h(k, 3), bx = h(k + 1, 1), by = h(k + 1, 2), bz = h(k + 1, 3);
      o.position.set(d.c.x + lerp(ax, bx, u) * 2 * d.r, d.c.y + lerp(ay, by, u) * .8 * d.r + .03 * Math.sin(t * 7 + i), d.c.z + lerp(az, bz, u) * 2 * d.r);
      o.rotation.set(0, Math.atan2(bx - ax, bz - az), 0); o.scale.setScalar(d.sc); o.updateMatrix(); this.dflies.setMatrixAt(i, o.matrix); }
    this.dflies.instanceMatrix.needsUpdate = true;
    const sz = this._sz || (this._sz = new THREE.Vector2()); R.getDrawingBufferSize(sz); this.uH.value = sz.y;
    this.uLan.value = e.lanterns || 0; this.uCalm.value = (1 - smooth(.35, .7, e.storm || 0)) * (1 - sat((e.rain || 0) * 2)); this.dflies.visible = this.uCalm.value > .02;
  }
});

})(window.K=window.K||{},window.THREE);
//# sourceURL=src/65_air.js

(function(K,THREE){'use strict';
// ============================================================================
// 80_post — HDR pipeline: scene target (+depth) -> ambient occlusion -> bloom pyramid -> light shafts
// -> composite (exposure, filmic tone map, grade, lens) -> FXAA + grain.
// ============================================================================
const post = K.post = { bloom: 0.07, rays: 1.0, ao: 1.0, aoRadius: 1.6, enabled: !K.q.has('nopost') };
const R = K.renderer, LEVELS = 6;
const fsScene = new THREE.Scene(), fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const fsQuad = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3)));
fsQuad.frustumCulled = false; fsScene.add(fsQuad);
const VS = 'varying vec2 vUv; void main(){ vUv = position.xy*.5+.5; gl_Position = vec4(position.xy, 0., 1.); }';
const pass = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: 'varying vec2 vUv;\n' + frag, uniforms, depthTest: false, depthWrite: false });
const draw = (mat, target) => { fsQuad.material = mat; R.setRenderTarget(target); R.render(fsScene, fsCam); };

const mDown = pass(/* glsl */`uniform sampler2D tA; uniform vec2 uPx; uniform float uFirst;
  float lum(vec3 c){ return dot(c, vec3(.2126,.7152,.0722)); }
  vec3 pre(vec3 c){ c = min(c, vec3(60.)); float l = lum(c); float k = max(l - .85, 0.); k = k*k/(k + .6); return c * (uFirst > .5 ? (k/max(l,1e-4) + .035) : 1.); }
  void main(){ vec2 p = uPx;
    vec3 a = pre(texture2D(tA, vUv + p*vec2(-2,-2)).rgb), b = pre(texture2D(tA, vUv + p*vec2(0,-2)).rgb), c = pre(texture2D(tA, vUv + p*vec2(2,-2)).rgb);
    vec3 d = pre(texture2D(tA, vUv + p*vec2(-2,0)).rgb), e = pre(texture2D(tA, vUv).rgb), f = pre(texture2D(tA, vUv + p*vec2(2,0)).rgb);
    vec3 g = pre(texture2D(tA, vUv + p*vec2(-2,2)).rgb), h = pre(texture2D(tA, vUv + p*vec2(0,2)).rgb), i = pre(texture2D(tA, vUv + p*vec2(2,2)).rgb);
    vec3 j = pre(texture2D(tA, vUv + p*vec2(-1,-1)).rgb), k = pre(texture2D(tA, vUv + p*vec2(1,-1)).rgb), l = pre(texture2D(tA, vUv + p*vec2(-1,1)).rgb), m = pre(texture2D(tA, vUv + p*vec2(1,1)).rgb);
    vec3 o;
    if(uFirst > .5){ // Karis average against fireflies
      vec3 g0 = (j+k+l+m)*.25, g1 = (a+b+d+e)*.25, g2 = (b+c+e+f)*.25, g3 = (d+e+g+h)*.25, g4 = (e+f+h+i)*.25;
      float w0 = 1./(1.+lum(g0)), w1 = 1./(1.+lum(g1)), w2 = 1./(1.+lum(g2)), w3 = 1./(1.+lum(g3)), w4 = 1./(1.+lum(g4));
      o = (g0*w0*.5 + (g1*w1+g2*w2+g3*w3+g4*w4)*.125) / (w0*.5 + (w1+w2+w3+w4)*.125);
    } else o = e*.125 + (a+c+g+i)*.03125 + (b+d+f+h)*.0625 + (j+k+l+m)*.125;
    gl_FragColor = vec4(o, 1.); }`, { tA: { value: null }, uPx: { value: new THREE.Vector2() }, uFirst: { value: 0 } });
const mUp = pass(/* glsl */`uniform sampler2D tA; uniform sampler2D tB; uniform vec2 uPx; uniform float uMix;
  void main(){ vec2 p = uPx; vec3 s = texture2D(tA, vUv).rgb*4.;
    s += (texture2D(tA, vUv+vec2(p.x,0)).rgb + texture2D(tA, vUv-vec2(p.x,0)).rgb + texture2D(tA, vUv+vec2(0,p.y)).rgb + texture2D(tA, vUv-vec2(0,p.y)).rgb)*2.;
    s += texture2D(tA, vUv+p).rgb + texture2D(tA, vUv-p).rgb + texture2D(tA, vUv+vec2(p.x,-p.y)).rgb + texture2D(tA, vUv+vec2(-p.x,p.y)).rgb;
    gl_FragColor = vec4(mix(texture2D(tB, vUv).rgb, s/16., uMix), 1.); }`, { tA: { value: null }, tB: { value: null }, uPx: { value: new THREE.Vector2() }, uMix: { value: .5 } });
// ambient occlusion from the depth buffer (half resolution, normals rebuilt from depth), then a depth-aware blur
const mAO = pass(/* glsl */`uniform sampler2D tD; uniform mat4 uPI; uniform mat4 uP; uniform vec2 uRes; uniform float uRad;
  vec3 vp(vec2 uv){ float d = texture2D(tD, uv).r; vec4 v = uPI * vec4(uv*2.-1., d*2.-1., 1.); return v.xyz/v.w; }
  void main(){ float d = texture2D(tD, vUv).r; if(d >= .999995){ gl_FragColor = vec4(1.); return; }
    vec3 p = vp(vUv); vec2 px = 1./uRes;
    vec3 pr = vp(vUv+vec2(px.x,0.)), pl = vp(vUv-vec2(px.x,0.)), pu = vp(vUv+vec2(0.,px.y)), pd = vp(vUv-vec2(0.,px.y));
    vec3 dx = abs(pr.z-p.z) < abs(p.z-pl.z) ? pr-p : p-pl, dy = abs(pu.z-p.z) < abs(p.z-pd.z) ? pu-p : p-pd;
    vec3 n = normalize(cross(dx, dy));
    vec3 t = normalize(cross(n, abs(n.y) < .9 ? vec3(0.,1.,0.) : vec3(1.,0.,0.))), b = cross(n, t);
    float rnd = fract(52.9829189*fract(dot(gl_FragCoord.xy, vec2(.06711056,.00583715)))) * 6.2832;
    float rad = uRad * (1. + (-p.z)*.02), occ = 0.;
    for(int i=0;i<14;i++){ float fi = float(i), a = rnd + fi*2.39996, r = sqrt((fi+.5)/14.);
      vec3 s = p + (t*cos(a)*r + b*sin(a)*r + n*(.15 + .85*sqrt(1.-r*r))) * rad;
      vec4 c = uP * vec4(s, 1.); vec2 suv = c.xy/c.w*.5+.5; float sz = vp(suv).z;
      occ += step(s.z + .04*rad, sz) * smoothstep(0., 1., rad / max(abs(p.z - sz), 1e-3)); }
    float ao = 1. - occ/14.;
    gl_FragColor = vec4(mix(ao, 1., smoothstep(600., 1500., -p.z))); }`, { tD: { value: null }, uPI: { value: new THREE.Matrix4() }, uP: { value: new THREE.Matrix4() }, uRes: { value: new THREE.Vector2() }, uRad: { value: 1.6 } });
const mAOBlur = pass(/* glsl */`uniform sampler2D tA; uniform sampler2D tD; uniform vec2 uPx;
  void main(){ float d0 = texture2D(tD, vUv).r, s = 0., w = 0.;
    for(int j=-2;j<=2;j++) for(int i=-2;i<=2;i++){ vec2 u = vUv + vec2(float(i), float(j))*uPx; float d = texture2D(tD, u).r;
      float k = 1. / (1. + abs(d - d0)/max(1. - d0, 1e-6)*6.); s += texture2D(tA, u).r*k; w += k; }
    gl_FragColor = vec4(s/w); }`, { tA: { value: null }, tD: { value: null }, uPx: { value: new THREE.Vector2() } });
// light shafts: bright sky seen past occluders, smeared toward the key light
const mRaysPre = pass(/* glsl */`uniform sampler2D tA; uniform sampler2D tD; uniform float uHasD;
  void main(){ vec3 c = min(texture2D(tA, vUv).rgb, vec3(24.)); float sky = uHasD > .5 ? step(.99995, texture2D(tD, vUv).r) : 1.;
    float l = dot(c, vec3(.3,.6,.1)); gl_FragColor = vec4(c * sky * smoothstep(.25, 1.6, l), 1.); }`, { tA: { value: null }, tD: { value: null }, uHasD: { value: 0 } });
const mRays = pass(/* glsl */`uniform sampler2D tA; uniform vec2 uC; uniform float uAmt;
  void main(){ vec2 d = (uC - vUv); float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898,78.233)))*43758.5453); vec3 s = vec3(0.); float w = 1., ws = 0.;
    for(int i=0;i<28;i++){ vec2 u = vUv + d*(float(i)+n)/28.*.9; s += texture2D(tA, u).rgb*w; ws += w; w *= .955; }
    gl_FragColor = vec4(s/ws*uAmt, 1.); }`, { tA: { value: null }, uC: { value: new THREE.Vector2(.5, .5) }, uAmt: { value: 0 } });
const mFinal = pass(/* glsl */`uniform sampler2D tA; uniform sampler2D tBloom; uniform sampler2D tRays; uniform sampler2D tAO; uniform float uAO; uniform vec2 uRes; uniform float uTime, uBloom, uExp, uFade, uFlash, uDawn, uBars, uGrain;
  vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14), 0., 1.); }
  float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
  void main(){ vec2 d = vUv - .5; float r2 = dot(d, d);
    vec2 ca = d * r2 * .0045;
    vec3 c = vec3(texture2D(tA, vUv - ca).r, texture2D(tA, vUv).g, texture2D(tA, vUv + ca).b);
    float ao = texture2D(tAO, vUv).r; c *= mix(1., ao*ao*(.55 + .45*ao), uAO);
    vec3 b = texture2D(tBloom, vUv).rgb; c = mix(c, b, uBloom) + b*uBloom*.5;
    c += texture2D(tRays, vUv).rgb;
    c *= uExp;
    c += uFlash * vec3(.75,.85,1.) * 1.4;
    // split-tone before the curve: cold shadows, warm highlights
    float l = dot(c, vec3(.2126,.7152,.0722));
    c = mix(c, c*vec3(.95,1.0,1.08), 1.-smoothstep(0., .35, l));            // a little blue in the shadows
    c = mix(c, c*vec3(1.05,1.0,.94), smoothstep(.8, 3., l));               // warm highlights
    c = aces(c*.74);
    c = pow(c, vec3(1./2.2));
    l = dot(c, vec3(.299,.587,.114)); c = mix(vec3(l), c, 1.16);            // saturation
    c = (c - .5)*1.10 + .5 - .012;                                          // contrast
    c *= 1. - smoothstep(.16, .7, r2)*.34;                                  // vignette
    gl_FragColor = vec4(clamp(c, 0., 1.), 1.); }`,
  { tA: { value: null }, tBloom: { value: null }, tRays: { value: null }, tAO: { value: null }, uAO: { value: 1 }, uRes: { value: new THREE.Vector2() }, uTime: { value: 0 }, uBloom: { value: .1 }, uExp: { value: 1 }, uFade: { value: 1 }, uFlash: { value: 0 }, uDawn: { value: 0 }, uBars: { value: 1 }, uGrain: { value: .035 } });

// last pass: FXAA on the graded image (the scene target is not multisampled — MSAA cost ~5 ms), then grain, letterbox, fade
const mFxaa = pass(/* glsl */`uniform sampler2D tA; uniform vec2 uPx; uniform float uTime, uFade, uBars, uGrain;
  float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
  void main(){ const vec3 L = vec3(.299,.587,.114);
    vec3 m = texture2D(tA, vUv).rgb;
    float lNW = dot(texture2D(tA, vUv + vec2(-1,-1)*uPx).rgb, L), lNE = dot(texture2D(tA, vUv + vec2(1,-1)*uPx).rgb, L);
    float lSW = dot(texture2D(tA, vUv + vec2(-1,1)*uPx).rgb, L), lSE = dot(texture2D(tA, vUv + vec2(1,1)*uPx).rgb, L), lM = dot(m, L);
    float lMin = min(lM, min(min(lNW,lNE), min(lSW,lSE))), lMax = max(lM, max(max(lNW,lNE), max(lSW,lSE)));
    vec3 c = m;
    if(lMax - lMin > max(.03, lMax*.11)){
      vec2 dir = vec2(-((lNW+lNE)-(lSW+lSE)), (lNW+lSW)-(lNE+lSE));
      float red = max((lNW+lNE+lSW+lSE)*.03125, .0078125), rcp = 1./(min(abs(dir.x),abs(dir.y)) + red);
      dir = clamp(dir*rcp, -8., 8.)*uPx;
      vec3 A = .5*(texture2D(tA, vUv + dir*(1./3.-.5)).rgb + texture2D(tA, vUv + dir*(2./3.-.5)).rgb);
      vec3 B = A*.5 + .25*(texture2D(tA, vUv - dir*.5).rgb + texture2D(tA, vUv + dir*.5).rgb);
      float lB = dot(B, L); c = (lB < lMin || lB > lMax) ? A : B; }
    c += (h12(gl_FragCoord.xy + fract(uTime)*91.7) - .5) * uGrain * (1.15 - dot(c, L));
    c *= step(abs(vUv.y - .5), .5*uBars);
    gl_FragColor = vec4(clamp(c, 0., 1.)*uFade, 1.); }`,
  { tA: { value: null }, uPx: { value: new THREE.Vector2() }, uTime: { value: 0 }, uFade: { value: 1 }, uBars: { value: 1 }, uGrain: { value: .022 } });
let rtLDR, rtAO, rtAO2;
let rtMain, chain = [], rtRaysA, rtRaysB, hasDepth = true, W = 0, H = 0;
const half = (w, h) => new THREE.WebGLRenderTarget(Math.max(2, w), Math.max(2, h), { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
post.resize = (w, h) => {
  if (w === W && h === H) return; W = w; H = h;
  [rtMain, rtLDR, rtAO, rtAO2, rtRaysA, rtRaysB, ...chain.flat()].forEach(t => t && t.dispose()); chain = [];
  const o = { type: THREE.HalfFloatType, samples: K.q.has('msaa') ? +K.q.get('msaa') : 0, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
  if (hasDepth) { o.depthTexture = new THREE.DepthTexture(w, h); o.depthTexture.type = THREE.UnsignedIntType; }
  rtMain = new THREE.WebGLRenderTarget(w, h, o);
  let cw = w, ch = h; for (let i = 0; i < LEVELS; i++) { cw = cw >> 1; ch = ch >> 1; chain.push([half(cw, ch), half(cw, ch)]); }
  rtLDR = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  mFxaa.uniforms.uPx.value.set(1 / w, 1 / h);
  const aoT = () => new THREE.WebGLRenderTarget(w >> 1, h >> 1, { type: THREE.UnsignedByteType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  rtAO = aoT(); rtAO2 = aoT(); mAO.uniforms.uRes.value.set(w >> 1, h >> 1); mAOBlur.uniforms.uPx.value.set(2 / w, 2 / h);
  rtRaysA = half(w >> 2, h >> 2); rtRaysB = half(w >> 2, h >> 2);
  mFinal.uniforms.uRes.value.set(w, h);
};
const _p = new THREE.Vector3();
post.render = F => {
  const scene = K.scene, cam = K.camera, e = K.env;
  if (!post.enabled) { R.setRenderTarget(null); R.render(scene, cam); return; }
  R.setRenderTarget(rtMain); R.clear(); R.render(scene, cam);
  // ambient occlusion
  if (hasDepth && post.ao > 0) { mAO.uniforms.tD.value = rtMain.depthTexture; mAO.uniforms.uP.value.copy(cam.projectionMatrix); mAO.uniforms.uPI.value.copy(cam.projectionMatrixInverse); mAO.uniforms.uRad.value = post.aoRadius; draw(mAO, rtAO);
    mAOBlur.uniforms.tA.value = rtAO.texture; mAOBlur.uniforms.tD.value = rtMain.depthTexture; draw(mAOBlur, rtAO2); }
  // bloom
  let src = rtMain.texture, sw = W, sh = H;
  for (let i = 0; i < LEVELS; i++) { mDown.uniforms.tA.value = src; mDown.uniforms.uPx.value.set(1 / sw, 1 / sh); mDown.uniforms.uFirst.value = i === 0 ? 1 : 0; draw(mDown, chain[i][0]); src = chain[i][0].texture; sw = chain[i][0].width; sh = chain[i][0].height; }
  let up = chain[LEVELS - 1][0];
  for (let i = LEVELS - 2; i >= 0; i--) { mUp.uniforms.tA.value = up.texture; mUp.uniforms.tB.value = chain[i][0].texture; mUp.uniforms.uPx.value.set(1 / up.width, 1 / up.height); mUp.uniforms.uMix.value = .62; draw(mUp, chain[i][1]); up = chain[i][1]; }
  // light shafts toward the key light (moon at night, sun at dawn)
  _p.copy(cam.position).addScaledVector(e.sunDir, 5000).project(cam);
  const front = _p.z < 1, onScreen = front ? Math.max(0, 1 - Math.max(0, Math.max(Math.abs(_p.x), Math.abs(_p.y)) - 1) * 1.4) : 0;
  const amt = onScreen * post.rays * e.rays;
  if (amt > .001) {
    mRaysPre.uniforms.tA.value = chain[0][0].texture; mRaysPre.uniforms.tD.value = hasDepth ? rtMain.depthTexture : null; mRaysPre.uniforms.uHasD.value = hasDepth ? 1 : 0; draw(mRaysPre, rtRaysA);
    mRays.uniforms.tA.value = rtRaysA.texture; mRays.uniforms.uC.value.set(_p.x * .5 + .5, _p.y * .5 + .5); mRays.uniforms.uAmt.value = amt; draw(mRays, rtRaysB);
  } else { R.setRenderTarget(rtRaysB); R.clear(); }
  const u = mFinal.uniforms; u.tA.value = rtMain.texture; u.tBloom.value = up.texture; u.tRays.value = rtRaysB.texture;
  u.tAO.value = rtAO2 ? rtAO2.texture : null; u.uAO.value = hasDepth ? post.ao : 0; u.uTime.value = F.t; u.uBloom.value = post.bloom; u.uExp.value = e.exposure; u.uFade.value = F.fade; u.uFlash.value = e.flash; u.uDawn.value = e.dusk;
  draw(mFinal, rtLDR);
  const f = mFxaa.uniforms; f.tA.value = rtLDR.texture; f.uTime.value = F.t; f.uFade.value = F.fade; f.uBars.value = 1.;
  draw(mFxaa, null);
};
post.noDepth = () => { hasDepth = false; W = 0; };

})(window.K=window.K||{},window.THREE);
//# sourceURL=src/80_post.js

(function(K,THREE){'use strict';
// ============================================================================
// 85_audio — score and sound design for «Дракон тысячи вершин». Zero assets: the
// whole 90-second stereo mix is synthesised sample by sample (seeded, deterministic)
// in Web Workers built from this file's own source, then played from one AudioBuffer
// kept locked to the picture clock.
//
//   main thread: gather() samples the film (camera, both dragons, weather) at 100 Hz
//                -> automation lanes + events (T, shot starts, splashes)
//   workers:     8 stem groups in parallel — strings/bed, erhu+dizi, guzheng+pipa,
//                percussion, brass/sheng/shimmer (music bus) · ambience, dragons,
//                events (sfx bus) -> dry + reverb-send buses
//   master:      2 FDN reverbs (music hall, mountain valley) -> roar ducking ->
//                underwater muffle -> HP -> glue compressor -> loudness normalise
//                (BS.1770, -16 LUFS) -> look-ahead limiter (-1.2 dBFS).
//                Everything is circular: tails past 90 s fold into the opening.
// Music is written in beats inside sections whose ends are film events/cuts, so the
// tempo of each section stretches if the director moves a time in 02_film.js.
// K.audio = { unlock(), sync(t, playing, hardSeek), toggleMute(), ready (Promise), mix, info, state() }
// Capture mode (?shot) does nothing unless the URL also has ?audio.
// ============================================================================
const AR = 100;   // automation rate (Hz)
const audio = K.audio = { unlock() {}, sync() {}, toggleMute() {}, ready: null, mix: null, info: null };

// ---------------------------------------------------------------- automation from the film
function gather() {
  const film = K.film, V3 = THREE.Vector3, n = Math.ceil(K.DUR * AR) + 2, ch = {}, W = K.world, st = W.sites;
  const lanes = ['storm', 'wind', 'rain', 'dusk', 'lant', 'camY', 'lakeP', 'fallsD', 'monD', 'treeP', 'camSpeed'];
  for (const k of ['r', 'g']) for (const s of ['D', 'Pan', 'Vr', 'Roar', 'Breath', 'Under', 'BodyD', 'BodyPan', 'Sp', 'FlameD', 'Vis', 'Rel']) lanes.push(k + s);
  for (const nm of lanes) ch[nm] = new Float32Array(n);
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x, sm = K.smooth;
  const camV = new V3(), fwd = new V3(), right = new V3(), rel = new V3(), UP = new V3(0, 1, 0), tmp = new V3(), prevCam = new V3(), q = new V3();
  const fallsA = new V3(st.falls.x, st.falls.y, st.falls.z), fallsB = new V3(st.falls.x - 3, 0, st.falls.z + 8);
  const mons = [new V3(st.summit.x, st.summit.y + 8, st.summit.z), new V3(st.mid.x, st.mid.y + 4, st.mid.z), new V3(st.gate.x, st.gate.y + 4, st.gate.z)];
  const trees = [[st.summit, 34], [st.mid, 30], [st.gate, 30], [st.shore, 26], [st.bridgeA, 20]].map(([s, r]) => [new V3(s.x, s.y, s.z), r]);
  const segD = (p, a, b) => { tmp.copy(b).sub(a); const L2 = tmp.lengthSq() || 1; let u = rel.copy(p).sub(a).dot(tmp) / L2; u = u < 0 ? 0 : u > 1 ? 1 : u; return rel.copy(a).addScaledVector(tmp, u).distanceTo(p); };
  const cuts = film.cuts.slice(), shotT = {}; for (const s of film.shots) shotT[s[1]] = s[0];
  const T = {}; for (const k in film.T) T[k] = film.T[k];
  const spl = film.splashes.map(s => ({ t0: s.t0, size: s.size, x: s.x, z: s.z, d: 100, pan: 0 }));
  const pts = { impact: { p: film.P.impact, t: T.impact }, ring: { p: film.P.ring, t: T.clash0 }, window: { p: null, t: T.window } }, PT = {};
  let C = null;
  const panOf = (p, d) => clamp(rel.copy(p).sub(C.pos).dot(right) / Math.max(1, d) * 1.2, -1, 1);
  for (let i = 0; i < n; i++) {
    const t = Math.min(K.DUR - 1e-3, i / AR), F = film.frame(t), E = K.env; C = F.cam;
    fwd.copy(C.tgt).sub(C.pos).normalize(); right.crossVectors(fwd, UP).normalize();
    ch.storm[i] = E.storm; ch.wind[i] = E.wind; ch.rain[i] = E.rain; ch.dusk[i] = E.dusk; ch.lant[i] = E.lanterns || 0;
    const y = C.pos.y; ch.camY[i] = y;
    const rh = Math.hypot((C.pos.x + 14) * .85, C.pos.z - 96);
    ch.lakeP[i] = (1 - sm(110, 280, rh)) * 10 / (10 + Math.max(0, y));
    ch.fallsD[i] = segD(C.pos, fallsA, fallsB);
    let md = 1e9; for (const m of mons) md = Math.min(md, m.distanceTo(C.pos)); ch.monD[i] = md;
    let tp = 0; for (const [p, r] of trees) tp = Math.max(tp, r / (r + Math.max(0, p.distanceTo(C.pos) - r))); ch.treeP[i] = tp;
    const cut = i > 0 && cuts.some(c => c > (i - 1) / AR && c <= t + 1e-6);
    if (i && !cut) camV.copy(C.pos).sub(prevCam).multiplyScalar(AR); else if (!i) camV.set(0, 0, 0);
    ch.camSpeed[i] = Math.min(150, camV.length()); prevCam.copy(C.pos);
    for (const [S, k, pos] of [[F.dragon, 'r', film.dragonPos], [F.rival, 'g', film.rivalPos]]) {
      const d = Math.max(1, S.p.distanceTo(C.pos));
      ch[k + 'D'][i] = d; ch[k + 'Pan'][i] = panOf(S.p, d); ch[k + 'Roar'][i] = S.roar; ch[k + 'Breath'][i] = S.breath; ch[k + 'Under'][i] = S.p.y < -1.5 ? 1 : 0;
      ch[k + 'Sp'][i] = S.speed; ch[k + 'Rel'][i] = Math.min(200, tmp.copy(S.vel).sub(camV).length()); ch[k + 'Vis'][i] = S.vis ? 1 : 0;
      ch[k + 'FlameD'][i] = S.breath > .01 ? Math.max(2, segD(C.pos, S.p, S.aim)) : 1e4;
      // the body trails the head along the path: nearest body point to the camera
      let bd = d, bp = ch[k + 'Pan'][i];
      for (let tau = .15; tau <= 3.01; tau += .15) { pos(t - tau, q); const dd = q.distanceTo(C.pos); if (dd < bd) { bd = dd; bp = panOf(q, dd); } }
      ch[k + 'BodyD'][i] = Math.max(1, bd); ch[k + 'BodyPan'][i] = bp;
    }
    for (const s of spl) if (Math.abs(t - s.t0) < .5 / AR) { q.set(s.x, 0, s.z); s.d = Math.max(3, q.distanceTo(C.pos)); s.pan = panOf(q, s.d); }
    for (const k in pts) { const P = pts[k]; if (Math.abs(t - P.t) < .5 / AR) { const p = P.p || F.dragon.p; const d = Math.max(3, p.distanceTo(C.pos)); PT[k] = { d, pan: panOf(p, d) }; } }
  }
  // radial velocity (m/s, + = receding), never across a cut
  for (const k of ['r', 'g']) {
    const D = ch[k + 'D'], V = ch[k + 'Vr'];
    for (let i = 1; i < n - 1; i++) { const t0 = (i - 1) / AR, t1 = (i + 1) / AR; const v = (D[i + 1] - D[i - 1]) * AR / 2, cut = cuts.some(c => c > t0 && c <= t1) || Math.abs(v) > 250; V[i] = cut ? V[i - 1] : v; }
    for (let i = 1; i < n; i++) V[i] = V[i - 1] + (V[i] - V[i - 1]) * .35;
  }
  // the fly-over at the key shot: the head's closest pass after the roar, the body sweeping overhead just after it
  { let best = 1e9; T.fly = T.key + 1.5; for (let i = Math.round(T.key * AR); i < Math.round((shotT.chase - .05) * AR); i++) if (ch.rD[i] < best) { best = ch.rD[i]; T.fly = i / AR; } T.fly = Math.min(shotT.chase - .6, T.fly + .45); }
  return { aut: ch, ev: { T, cuts, shotT, spl, PT, AR } };
}
// ============================================================================
// DSP — runs inside the workers (and as a main-thread fallback). Self-contained.
// ============================================================================
function DSP() {
  'use strict';
  const SRATE = 44100, DUR = 90, N = SRATE * DUR, TAU = Math.PI * 2, BL = 32;
  let AUT = null, EV = null, AR = 100, T = null;
  const sat = x => x < 0 ? 0 : x > 1 ? 1 : x;
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const pulse = (t, a, b, fi, fo) => smooth(a, a + fi, t) * (1 - smooth(b - fo, b, t));
  const curve = keys => t => { const n = keys.length; if (t <= keys[0][0]) return keys[0][1]; if (t >= keys[n - 1][0]) return keys[n - 1][1]; let i = 0; while (i < n - 2 && t > keys[i + 1][0]) i++; return lerp(keys[i][1], keys[i + 1][1], smooth(keys[i][0], keys[i + 1][0], t)); };
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const dB = x => Math.pow(10, x / 20);
  const hash1 = (i, s) => { let n = Math.imul(i | 0, 374761393) + Math.imul(s | 0, 668265263) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const vn = (x, s) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash1(i, s), hash1(i + 1, s), u); };
  function rng(seed) { let s = (Math.imul(seed | 0, 747796405) + 2891336453) | 0; if (!s) s = 1; return () => { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }
  class Noise { constructor(seed) { this.s = (Math.imul(seed | 0, 1664525) + 1013904223) | 0 || 7; } w() { let s = this.s; s ^= s << 13; s ^= s >> 17; s ^= s << 5; this.s = s; return s * 4.656612873077393e-10; } }
  // TPT state-variable filter (Zavalishin). lp / bp (bpn = unity-peak) / hp
  class SVF {
    constructor() { this.ic1 = 0; this.ic2 = 0; this.lp = 0; this.bp = 0; this.hp = 0; this.set(1000, .707); }
    set(fc, q) { if (fc > SRATE * .46) fc = SRATE * .46; else if (fc < 8) fc = 8; const g = Math.tan(Math.PI * fc / SRATE); this.k = 1 / q; this.a1 = 1 / (1 + g * (g + this.k)); this.a2 = g * this.a1; this.a3 = g * this.a2; }
    run(x) { const v3 = x - this.ic2, v1 = this.a1 * this.ic1 + this.a2 * v3, v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3; this.ic1 = 2 * v1 - this.ic1; this.ic2 = 2 * v2 - this.ic2; this.bp = v1; this.lp = v2; this.hp = x - this.k * v1 - v2; return v2; }
  }
  const pan2 = p => { p = clamp(p, -1, 1); return [Math.cos((p + 1) * Math.PI / 4), Math.sin((p + 1) * Math.PI / 4)]; };
  // automation lane lookup (linear)
  function au(name, t) { const a = AUT[name], x = t * AR; if (x <= 0) return a[0]; const i = x | 0; if (i >= a.length - 1) return a[a.length - 1]; const f = x - i; return a[i] + (a[i + 1] - a[i]) * f; }
  const prox = (d, ref) => ref / (ref + d);
  // segments where a lane is above thr: [[t0, t1], ...]
  function segs(name, thr) { const a = AUT[name], out = []; let s = -1; for (let i = 0; i < a.length; i++) { const on = a[i] > thr; if (on && s < 0) s = i; if (!on && s >= 0) { out.push([s / AR, i / AR]); s = -1; } } if (s >= 0) out.push([s / AR, a.length / AR]); return out; }

  // ---------------------------------------------------------------- section buffers
  class Buf {
    constructor(t0, t1) { this.t0 = t0; this.i0 = Math.round(t0 * SRATE); this.n = Math.max(1, Math.ceil((t1 - t0) * SRATE)); this.L = new Float32Array(this.n); this.R = new Float32Array(this.n); }
    idx(t) { return Math.round(t * SRATE) - this.i0; }
    tm(k) { return (this.i0 + k) / SRATE; }
  }
  // add a Buf into an output bus (dry + reverb send), folding time circularly into [0, DUR)
  let KEEP = false, TAGS = {}, MUSIC = false;
  function mixTo(out, B, gd, gs, tag) {
    if (KEEP && tag) { const X = TAGS[tag] || (TAGS[tag] = new Float32Array(N)); let j = ((B.i0 % N) + N) % N; for (let k = 0; k < B.n; k++) { X[j] += (B.L[k] + B.R[k]) * .5 * gd; if (++j >= N) j = 0; } }
    const L = B.L, R = B.R, n = B.n, DL = out.D[0], DR = out.D[1], SL = out.S[0], SR = out.S[1];
    // music fades out with the picture: nothing it plays past the end may fold back into the opening
    if (MUSIC) { const kf = Math.max(0, Math.round((T.end - 1) * SRATE) - B.i0); for (let k = kf; k < n; k++) { const g = 1 - smooth(T.end - 1, T.end - .05, (B.i0 + k) / SRATE); L[k] *= g; R[k] *= g; } }
    let j = ((B.i0 % N) + N) % N;
    for (let k = 0; k < n; k++) { const l = L[k], r = R[k]; DL[j] += l * gd; DR[j] += r * gd; if (gs) { SL[j] += l * gs; SR[j] += r * gs; } if (++j >= N) j = 0; }
  }
  // in-place SVF over a Buf: out = cl*lp + cb*bpn + ch*hp ; fc / q may be functions of t
  const LP = [1, 0, 0], BP = [0, 1, 0], HP = [0, 0, 1];
  function filt(B, mode, fc, q) {
    const cl = mode[0], cb = mode[1], chh = mode[2], ff = typeof fc === 'function', qf = typeof q === 'function';
    for (const X of [B.L, B.R]) {
      const f = new SVF(); if (!ff && !qf) f.set(fc, q);
      for (let k = 0; k < B.n; k += BL) {
        if (ff || qf) { const t = B.tm(k); f.set(ff ? fc(t) : fc, qf ? q(t) : q); }
        const kk = Math.min(B.n, k + BL), kn = f.k * cb;
        for (let j = k; j < kk; j++) { f.run(X[j]); X[j] = cl * f.lp + kn * f.bp + chh * f.hp; }
      }
    }
  }
  function gainBuf(B, fn) { for (let k = 0; k < B.n; k += BL) { const g0 = fn(B.tm(k)), g1 = fn(B.tm(k + BL)), kk = Math.min(B.n, k + BL); for (let j = k; j < kk; j++) { const g = g0 + (g1 - g0) * (j - k) / BL; B.L[j] *= g; B.R[j] *= g; } } }
  // note envelope: sine-eased attack, optional exponential decay, squared release
  function env(tt, dur, att, rel, dec) {
    if (tt < 0) return 0; let a = tt < att ? Math.sin(tt / att * Math.PI / 2) : 1; a *= a;
    if (dec) a *= Math.exp(-tt / dec);
    if (tt > dur) { const u = (tt - dur) / rel; if (u >= 1) return 0; a *= (1 - u) * (1 - u); }
    return a;
  }

  // ---------------------------------------------------------------- oscillators
  // one band-limited (polyBLEP) saw voice, control at block rate: vibrato, drift, glide fn
  function sawVoice(B, t0, dur, f, o, seed) {
    const att = o.att ?? .05, rel = o.rel ?? .3, dec = o.dec || 0;
    const k0 = Math.max(0, B.idx(t0)), k1 = Math.min(B.n, B.idx(t0 + dur + rel)); if (k1 <= k0) return;
    const [gl0, gr0] = pan2(o.pan || 0), g = o.gain ?? 1, gl = gl0 * g, gr = gr0 * g;
    const r = rng(seed); let ph = r(); const vibR = (o.vibR || 5) * (.85 + .3 * r()), vibD = (o.vibD || 0) / 1200 * Math.LN2, vibP = r() * TAU, drift = o.drift || 0, ds = seed * 7 + 3, fm = o.fm;
    const L = B.L, R = B.R;
    for (let k = k0; k < k1; k += BL) {
      const t = B.tm(k), tt = t - t0, e0 = env(tt, dur, att, rel, dec), e1 = env(tt + BL / SRATE, dur, att, rel, dec);
      let ff = f * (1 + vibD * Math.sin(TAU * vibR * tt + vibP) * sat(tt / .5)) * (1 + drift * (vn(t * .8, ds) - .5));
      if (fm) ff *= fm(t);
      const inc = ff / SRATE, kk = Math.min(k + BL, k1), de = (e1 - e0) / BL; let e = e0;
      for (let j = k; j < kk; j++) {
        ph += inc; if (ph >= 1) ph -= 1;
        let v = 2 * ph - 1;
        if (ph < inc) { const x = ph / inc; v -= x + x - x * x - 1; } else if (ph > 1 - inc) { const x = (ph - 1) / inc; v -= x * x + x + x + 1; }
        v *= e; e += de; L[j] += v * gl; R[j] += v * gr;
      }
    }
  }
  // detuned ensemble of saws on one pitch
  function sawEns(B, t0, dur, f, o) {
    const nv = o.nv || 3, det = o.det ?? 10, sp = o.spread ?? .6, g = (o.gain ?? 1) / Math.sqrt(nv);
    for (let v = 0; v < nv; v++) {
      const u = nv > 1 ? v / (nv - 1) * 2 - 1 : 0, rr = hash1(v, o.seed || 1) - .5;
      sawVoice(B, t0 + Math.abs(rr) * (o.stagger || 0), dur, f * Math.pow(2, (u * det + rr * det * .4) / 1200), Object.assign({}, o, { gain: g, pan: clamp((o.pan || 0) + u * sp, -1, 1) }), (o.seed || 1) * 31 + v);
    }
  }
  // sine with optional FM (bells / glass): carrier f, modulator f*ratio, index decays
  function fmNote(B, t0, dur, f, o) {
    const k0 = Math.max(0, B.idx(t0)), k1 = Math.min(B.n, B.idx(t0 + dur)); if (k1 <= k0) return;
    const [gl0, gr0] = pan2(o.pan || 0), g = o.gain ?? 1, gl = gl0 * g, gr = gr0 * g, ratio = o.ratio || 2, I0 = o.index ?? 1, Id = o.idec || .4, dec = o.dec || 1, att = o.att || .004;
    let pc = 0, pm = 0; const ic = f / SRATE, im = f * ratio / SRATE, L = B.L, R = B.R;
    const beat = o.beat || 0; let pb = 0; const ib = (f + beat) / SRATE;
    for (let k = k0; k < k1; k++) {
      const tt = (k - k0) / SRATE; pc += ic; pm += im; pb += ib;
      const I = I0 * Math.exp(-tt / Id), e = sat(tt / att) * Math.exp(-tt / dec) * sat((dur - tt) / .05);
      let v = Math.sin(TAU * pc + I * Math.sin(TAU * pm)); if (beat) v = .6 * v + .4 * Math.sin(TAU * pb);
      v *= e; L[k] += v * gl; R[k] += v * gr;
    }
  }
  // mono line (legato with glides) -> control arrays per block, then ensemble saws + sine, filter follows loudness
  function line(B, notes, o) {
    const nb = Math.ceil(B.n / BL) + 2, Fq = new Float32Array(nb), Am = new Float32Array(nb), glide = o.glide ?? .08, att = o.att ?? .12, rel = o.rel ?? .45;
    let ni = 0;
    for (let b = 0; b < nb; b++) {
      const t = B.tm(b * BL);
      while (ni < notes.length - 1 && t >= notes[ni + 1][0]) ni++;
      const n = notes[ni], ts = n[0], te = n[0] + n[2]; let f = mtof(n[1]), a = 0;
      if (t >= ts) {
        const tt = t - ts, prev = ni > 0 ? notes[ni - 1] : null, leg = prev && ts - (prev[0] + prev[2]) < .06;
        if (leg && tt < glide) { const u = tt / glide, s = u * u * (3 - 2 * u); f = mtof(prev[1]) * Math.pow(mtof(n[1]) / mtof(prev[1]), s); }
        a = leg ? 1 - .22 * Math.sin(Math.PI * sat(tt / (glide * 2.2))) : Math.pow(Math.sin(Math.PI / 2 * sat(tt / att)), 2);
        const next = notes[ni + 1], nextLeg = next && next[0] - te < .06;
        if (!nextLeg && t > te) { const u = (t - te) / rel; a *= u >= 1 ? 0 : (1 - u) * (1 - u); }
        // swell inside long notes (horn bloom)
        a *= (n[3] ?? 1) * (1 + (o.bloom || 0) * smooth(0, Math.max(.3, n[2]), tt));
      }
      Fq[b] = f; Am[b] = a;
    }
    const nv = o.nv || 3, det = o.det ?? 6, g = (o.gain ?? 1) / Math.sqrt(nv + 1), vibD = (o.vibD || 0) / 1200 * Math.LN2, vibR = o.vibR || 5;
    const tmpL = new Float32Array(B.n), tmpR = new Float32Array(B.n);
    for (let v = 0; v <= nv; v++) {
      const sine = v === nv, u = nv > 1 ? (v / (nv - 1)) * 2 - 1 : 0, dm = sine ? 1 : Math.pow(2, u * det / 1200), [gl, gr] = pan2(sine ? (o.pan || 0) : (o.pan || 0) + u * (o.spread ?? .4));
      let ph = hash1(v, 99), na = 0; const r = rng(v + 5), vp = r() * TAU, vr = vibR * (.9 + .2 * r()), sg = sine ? (o.sine ?? .8) : 1;
      for (let b = 0; b < nb - 1; b++) {
        const k = b * BL; if (k >= B.n) break; const a0 = Am[b], a1 = Am[b + 1]; if (a0 === 0 && a1 === 0) { na = 0; continue; }
        na += BL / SRATE; const t = B.tm(k);
        const inc = Fq[b] * dm * (1 + vibD * Math.sin(TAU * vr * t + vp) * sat(na / .6)) / SRATE, kk = Math.min(B.n, k + BL);
        for (let j = k; j < kk; j++) {
          const a = a0 + (a1 - a0) * (j - k) / BL; ph += inc; if (ph >= 1) ph -= 1;
          let s;
          if (sine) s = Math.sin(TAU * ph) * sg;
          else { s = 2 * ph - 1; if (ph < inc) { const x = ph / inc; s -= x + x - x * x - 1; } else if (ph > 1 - inc) { const x = (ph - 1) / inc; s -= x * x + x + x + 1; } }
          s *= a * g; tmpL[j] += s * gl; tmpR[j] += s * gr;
        }
      }
    }
    // loudness-following low-pass (brass: brighter when louder) + body formant
    const cut = o.cut || (a => 400 + 2500 * a * a), fq = o.q ?? .9, form = o.formant || 0, ff = o.formF || 900;
    for (const [X, Y] of [[tmpL, B.L], [tmpR, B.R]]) {
      const f = new SVF(), f2 = new SVF(); f2.set(ff, 1.6);
      for (let b = 0; b < nb - 1; b++) {
        const k = b * BL; if (k >= B.n) break; f.set(cut(Am[b], B.tm(k)), fq); const kk = Math.min(B.n, k + BL);
        for (let j = k; j < kk; j++) { const y = f.run(X[j]); f2.run(y); Y[j] += y + form * f2.k * f2.bp; }
      }
    }
    return Am;
  }
  // formant filter bank over a Buf (choir / voice). vowel(t) -> [[f, amp] x4]
  const VOW = { a: [[780, 1], [1180, .55], [2800, .22], [3600, .1]], o: [[470, 1], [820, .45], [2800, .12], [3500, .05]], u: [[330, 1], [720, .22], [2500, .06], [3400, .03]],
    i: [[290, 1], [2150, .38], [2950, .25], [3800, .1]], e: [[420, 1], [1750, .4], [2600, .2], [3300, .1]] };
  function formants(B, vowel, shift = 1) {
    for (const X of [B.L, B.R]) {
      const fs = [new SVF(), new SVF(), new SVF(), new SVF()]; let amps = [1, 1, 1, 1];
      for (let k = 0; k < B.n; k += BL) {
        const V = vowel(B.tm(k));
        for (let i = 0; i < 4; i++) { const f = V[i][0] * shift; fs[i].set(f, f / (55 + f * .07)); amps[i] = V[i][1]; }
        const kk = Math.min(B.n, k + BL), g0 = amps[0] * fs[0].k, g1 = amps[1] * fs[1].k, g2 = amps[2] * fs[2].k, g3 = amps[3] * fs[3].k;
        for (let j = k; j < kk; j++) { const x = X[j]; fs[0].run(x); fs[1].run(x); fs[2].run(x); fs[3].run(x); X[j] = g0 * fs[0].bp + g1 * fs[1].bp + g2 * fs[2].bp + g3 * fs[3].bp; }
      }
    }
  }
  const vowelMix = (a, b, u) => a.map((p, i) => [p[0] * Math.pow(b[i][0] / p[0], u), lerp(p[1], b[i][1], u)]);
  // vowel automation from a list [[t0, t1, vowel], ...] (crossfades .8 s)
  function vowelTrack(list) {
    return t => { let cur = list[0], i = 0; for (let k = 0; k < list.length; k++) if (t >= list[k][0] - .4) { cur = list[k]; i = k; } const prev = list[Math.max(0, i - 1)]; const u = smooth(cur[0] - .4, cur[0] + .4, t); return vowelMix(VOW[prev[2]], VOW[cur[2]], u); };
  }

  // ---------------------------------------------------------------- percussion / impulses
  // membrane drum: pitch-dropping fundamental + fixed inharmonic modes + stick/skin noise
  function drum(B, t, o) {
    const k0 = B.idx(t), len = Math.ceil((o.len || 1.2) * SRATE); if (k0 >= B.n || k0 + len < 0) return;
    const [gl0, gr0] = pan2(o.pan || 0), g = o.g ?? 1, gl = gl0 * g, gr = gr0 * g, ns = new Noise(o.seed || 1), bp = new SVF(), lp = new SVF();
    bp.set(o.nf || 1400, o.nq || 1.1); lp.set(o.bf || 260, .8);
    const f0 = o.f, pd = o.pitch ?? .7, pr = o.pr || 22, d0 = Math.exp(-1 / ((o.dec || .5) * SRATE));
    const md = o.modes || [[1.59, .45, .25], [2.14, .3, .16], [2.65, .2, .11], [3.16, .12, .08]];
    const mc = [], ms = [], mr = [], mx = [], my = [];
    for (const m of md) { const w = TAU * f0 * m[0] / SRATE; mc.push(Math.cos(w)); ms.push(Math.sin(w)); mr.push(Math.exp(-1 / (m[2] * (o.dec || .5) / .5 * SRATE))); mx.push(0); my.push(m[1]); }
    let ph = 0, e0 = 1, en = 1; const dn = Math.exp(-1 / ((o.ndec || .025) * SRATE)), sk = o.skin ?? .5, st = o.stick ?? .35;
    const L = B.L, R = B.R;
    for (let j = 0; j < len; j++) {
      const k = k0 + j, tt = j / SRATE;
      ph += f0 * (1 + pd * Math.exp(-tt * pr)) / SRATE; e0 *= d0; en *= dn;
      let y = Math.sin(TAU * ph) * e0 * Math.min(1, j / 40);
      for (let m = 0; m < mc.length; m++) { const x = mx[m], yy = my[m], nx = (x * mc[m] - yy * ms[m]) * mr[m], ny = (x * ms[m] + yy * mc[m]) * mr[m]; mx[m] = nx; my[m] = ny; y += nx * Math.min(1, j / 60); }
      const w = ns.w() * en; bp.run(w); lp.run(ns.w() * Math.exp(-tt * 9));
      y += bp.bp * bp.k * st + lp.lp * sk * 2.5;
      if (k >= 0 && k < B.n) { L[k] += y * gl; R[k] += y * gr; }
    }
  }
  // sine thump with exponential pitch glide f0 -> f1
  function thump(B, t, f0, f1, dur, g, pan, ptc = .08, att = .004) {
    const k0 = B.idx(t), len = Math.ceil(dur * SRATE), [gl, gr] = pan2(pan || 0); let ph = 0;
    for (let j = 0; j < len; j++) { const k = k0 + j, tt = j / SRATE; ph += (f1 + (f0 - f1) * Math.exp(-tt / ptc)) / SRATE; const e = sat(tt / att) * Math.pow(1 - tt / dur, 2) * Math.exp(-tt / (dur * .35)); const y = Math.sin(TAU * ph) * e * g; if (k >= 0 && k < B.n) { B.L[k] += y * gl; B.R[k] += y * gr; } }
  }
  // filtered noise event with exponential cutoff sweep
  function nburst(B, t, dur, o) {
    const k0 = B.idx(t), len = Math.ceil(dur * SRATE), [gl0, gr0] = pan2(o.pan || 0), g = o.g ?? 1, gl = gl0 * g, gr = gr0 * g;
    const ns = new Noise(o.seed || 3), f = new SVF(), f0 = o.f0 || 1000, f1 = o.f1 ?? f0, q = o.q ?? .8, att = o.att ?? .005, dec = o.dec ?? dur * .3, mode = o.mode || LP, shape = o.shape;
    for (let j = 0; j < len; j += BL) {
      const tt = j / SRATE, u = tt / dur; f.set(f0 * Math.pow(f1 / f0, u), q);
      const kk = Math.min(len, j + BL), kn = f.k * mode[1];
      for (let i = j; i < kk; i++) {
        const t2 = i / SRATE, e = shape ? shape(t2 / dur) : sat(t2 / att) * Math.exp(-t2 / dec) * sat((dur - t2) / (dur * .15 + 1e-4));
        f.run(ns.w()); const y = (mode[0] * f.lp + kn * f.bp + mode[2] * f.hp) * e;
        const k = k0 + i; if (k >= 0 && k < B.n) { B.L[k] += y * gl; B.R[k] += y * gr; }
      }
    }
  }
  // poisson crackle stream: tiny decaying noise grains through a band-pass, rate(t) grains/s, amp(t)
  function crackle(B, t0, t1, rate, amp, o) {
    const k0 = Math.max(0, B.idx(t0)), k1 = Math.min(B.n, B.idx(t1)), ns = new Noise(o.seed || 5), r = rng(o.seed || 5), bp = new SVF(), hp = new SVF(); bp.set(o.f || 2500, o.q || 1.4); hp.set(o.hp || 500, .7);
    let ce = 0, cd = .9, pp = 0, rr = 0, aa = 0; const width = o.width ?? .8;
    for (let k = k0; k < k1; k += BL) {
      const t = B.tm(k); rr = rate(t) / SRATE; aa = amp(t); if (o.fmod) bp.set(o.fmod(t), o.q || 1.4);
      const kk = Math.min(k1, k + BL);
      for (let j = k; j < kk; j++) {
        if (r() < rr) { const x = r(); ce = aa * (.15 + .85 * x * x * x) * (r() < .08 ? 2.5 : 1); cd = Math.exp(-1 / ((.0006 + .003 * r()) * SRATE)); pp = (r() * 2 - 1) * width; }
        ce *= cd; hp.run(ns.w() * ce); const h = hp.hp; bp.run(h); const out = bp.bp * bp.k * .7 + h * .5;
        const gl = .7071 * (1 - pp), gr = .7071 * (1 + pp); B.L[j] += out * gl; B.R[j] += out * gr;
      }
    }
  }
  // resonant ringing modes excited by an impulse (ice cracks, glass)
  function ring(B, t, freqs, decs, amps, g, pan) {
    const k0 = B.idx(t), [gl, gr] = pan2(pan || 0); let mx = Math.max(...decs);
    const len = Math.ceil(mx * 5 * SRATE);
    for (let m = 0; m < freqs.length; m++) {
      const w = TAU * freqs[m] / SRATE, c = Math.cos(w), s = Math.sin(w), r = Math.exp(-1 / (decs[m] * SRATE)); let x = 0, y = amps[m] * g;
      for (let j = 0; j < len; j++) { const nx = (x * c - y * s) * r, ny = (x * s + y * c) * r; x = nx; y = ny; const k = k0 + j; if (k >= 0 && k < B.n) { B.L[k] += x * gl; B.R[k] += x * gr; } if (Math.abs(y) + Math.abs(x) < 1e-6) break; }
    }
  }

  // ============================================================================
  // INSTRUMENTS
  // ============================================================================
  const sawB = (p, inc) => { let v = 2 * p - 1; if (p < inc) { const x = p / inc; v -= x + x - x * x - 1; } else if (p > 1 - inc) { const x = (p - 1) / inc; v -= x * x + x + x + 1; } return v; };
  const PENT = [0, 2, 4, 7, 9];     // D gong mode: D E F# A B
  const isPent = m => PENT.includes(((m - 62) % 12 + 12) % 12);

  // Karplus–Strong string (guzheng / pipa). o: g, pan, dec (T60), bright 0..1, pos (pluck point), bend(tt) -> semitones,
  // strokes [[tt, amp]] (re-plucks of the same string: pipa tremolo), stop (damp after), body resonance
  function pluck(B, t, f, o) {
    const k0 = B.idx(t); if (k0 >= B.n) return;
    const dec = o.dec || 3, len = Math.min(o.len || dec * 1.15, 9), nS = Math.ceil(len * SRATE); if (k0 + nS <= 0) return;
    const M = 8192, mask = M - 1, buf = new Float32Array(M), ns = new Noise(o.seed || 1);
    const [gl0, gr0] = pan2(o.pan || 0), g = o.g ?? 1, gl = gl0 * g, gr = gr0 * g;
    const br = o.bright ?? .6, d = .5 - .42 * br, gp = Math.pow(10, -3 / (dec * f)), bend = o.bend, stop = o.stop ?? 1e9;
    let L = SRATE / f - d; const exN = Math.max(2, Math.round(SRATE / f));
    const ex = new Float32Array(exN), lpk = .15 + .8 * br; let s1 = 0, m = 0;
    for (let i = 0; i < exN; i++) { s1 += lpk * (ns.w() - s1); ex[i] = s1; m += s1; }
    m /= exN; const pp = Math.max(1, Math.round(exN * (o.pos ?? .13))), ex2 = new Float32Array(exN);
    for (let i = 0; i < exN; i++) ex2[i] = (ex[i] - m) - (i >= pp ? ex[i - pp] - m : 0);
    const strokes = o.strokes || [[0, 1]]; let si = 0, sStart = -1, sAmp = 0;
    const body = new SVF(); body.set(o.bodyF || 240, 1.3); const bodyG = o.body ?? .35;
    let w = 0, zp = 0, peak = 0; const BL_ = B.L, BR_ = B.R;
    for (let j = 0; j < nS; j++) {
      const tt = j / SRATE;
      if (bend && !(j & 31)) L = SRATE / (f * Math.pow(2, bend(tt) / 12)) - d;
      while (si < strokes.length && tt >= strokes[si][0]) { sStart = j; sAmp = strokes[si][1]; si++; }
      const x = sStart >= 0 && j - sStart < exN ? ex2[j - sStart] * sAmp : 0;
      const rp = w - L, i0 = Math.floor(rp), fr = rp - i0, z = buf[i0 & mask] * (1 - fr) + buf[(i0 + 1) & mask] * fr;
      const v = (1 - d) * z + d * zp; zp = z;
      const y = x + (tt < stop ? gp : .93) * v; buf[w & mask] = y; w++;
      body.run(y); let o2 = y + body.bp * body.k * bodyG;
      if (nS - j < 2205) o2 *= (nS - j) / 2205;
      const k = k0 + j; if (k >= 0 && k < B.n) { BL_[k] += o2 * gl; BR_[k] += o2 * gr; }
      const a = y < 0 ? -y : y; if (a > peak) peak = a;
      if (!(j & 1023)) { if (tt > .25 && si >= strokes.length && peak < 1.5e-4) break; peak = 0; }
    }
  }
  const zheng = (B, t, m, g, o = {}) => pluck(B, t, mtof(m), Object.assign({ g: g * .55, dec: 1.8 + 2.6 * clamp((76 - m) / 26, 0, 1), bright: .74, pos: .11, bodyF: 260, body: .3,
    pan: clamp((m - 68) / 28, -.6, .6), seed: ((t * 1000) | 0) ^ (m * 31) }, o));
  const pressBend = (semi, at, dur = .14) => tt => semi * smooth(at, at + dur, tt);
  const rouVib = (depth = .22, at = .35) => tt => depth * Math.sin(TAU * 5.2 * tt) * sat((tt - at) / .3);
  // pipa: bright short string, tremolo (lunzhi) = many strokes on one string
  function pipa(B, t0, dur, m, g, o = {}) {
    const rate = o.rate || 15, st = [], r = rng((t0 * 977 | 0) + m);
    if (o.single) st.push([0, 1]); else for (let tt = 0; tt < dur - .02; tt += (1 / rate) * (.9 + .2 * r())) st.push([tt, (.62 + .38 * r()) * (tt === 0 ? 1.25 : 1) * (o.cres ? lerp(o.cres[0], o.cres[1], tt / dur) : 1)]);
    pluck(B, t0, mtof(m), { g: g * .42, dec: o.dec || 1.3, bright: .88, pos: .085, bodyF: 540, body: .55, strokes: st, stop: dur + .04, len: dur + .5, pan: o.pan ?? 0, seed: (t0 * 1000 | 0) + m * 7 });
  }
  // guzheng glissando sweep over the pentatonic strings
  function gliss(B, t, m0, m1, dur, g, o = {}) {
    const lo = Math.min(m0, m1), hi = Math.max(m0, m1), ns = []; for (let m = lo; m <= hi; m++) if (isPent(m)) ns.push(m);
    if (m1 < m0) ns.reverse(); const n = ns.length;
    ns.forEach((m, i) => { const u = i / Math.max(1, n - 1); zheng(B, t + dur * (o.acc ? Math.pow(u, o.acc) : u), m, g * (o.shape ? o.shape(u) : .5 + .5 * u), { dec: o.dec || 1.5, pan: lerp(-.55, .55, (m - lo) / Math.max(1, hi - lo)) }); });
  }

  // expressive monophonic lead -> per-block pitch / amplitude lanes. notes: [t, midi, dur, vel, {scoop, grace, trill, fall, gl, vib}]
  function leadCtl(B, notes, o) {
    const nb = Math.ceil(B.n / BL) + 2, Fq = new Float32Array(nb), Am = new Float32Array(nb);
    const att = o.att ?? .08, rel = o.rel ?? .25, glide = o.glide ?? .1, vD = (o.vibD || 0) / 1200 * Math.LN2, vR = o.vibR || 5.5, vDel = o.vibDel ?? .22;
    let ni = 0, vph = 0;
    for (let b = 0; b < nb; b++) {
      const t = B.tm(b * BL);
      while (ni < notes.length - 1 && t >= notes[ni + 1][0]) ni++;
      const n = notes[ni], ts = n[0], te = ts + n[2], fl = n[4] || {};
      let f = mtof(n[1]), a = 0;
      if (t >= ts) {
        const tt = t - ts, prev = ni > 0 ? notes[ni - 1] : null, leg = prev && ts - (prev[0] + prev[2]) < .05;
        if (leg) { const iv = Math.abs(n[1] - prev[1]), gT = glide * (iv >= 3 ? 1.5 : .55) * (fl.gl || 1); if (tt < gT) { const u = tt / gT, s = u * u * (3 - 2 * u); f = mtof(prev[1] + (n[1] - prev[1]) * s); } }
        const sc = fl.scoop ?? (!leg ? o.scoop || 0 : 0); if (sc) f *= Math.pow(2, -sc / 12 * (1 - smooth(0, o.scoopT || .12, tt)));
        if (fl.grace) { if (tt < .05) f = mtof(n[1] + fl.grace); else if (tt < .075) f = mtof(n[1] + fl.grace * (1 - (tt - .05) / .025)); }
        if (fl.trill && tt > .15 && tt < n[2] - .1) f *= Math.pow(2, (Math.sin(TAU * 10.5 * tt) > 0 ? fl.trill : 0) / 12);
        if (fl.fall && t > te - .22) f *= Math.pow(2, -fl.fall / 12 * smooth(te - .22, te + .12, t));
        a = leg ? 1 - (o.legDip ?? .15) * Math.sin(Math.PI * sat(tt / (glide * 2))) : Math.pow(Math.sin(Math.PI / 2 * sat(tt / att)), 2);
        const next = notes[ni + 1], nextLeg = next && next[0] - te < .05;
        if (!nextLeg && t > te) { const u = (t - te) / rel; a *= u >= 1 ? 0 : (1 - u) * (1 - u); }
        a *= (n[3] ?? 1) * (1 + (o.swell || 0) * (smooth(0, Math.max(.4, n[2]), tt) - .5));
        const vt = leg ? tt + .12 : tt;
        f *= 1 + vD * Math.sin(vph) * sat((vt - vDel) / .35) * (fl.vib ?? 1);
      }
      vph += TAU * vR * (1 + .08 * Math.sin(t * .7)) * BL / SRATE;
      Fq[b] = f; Am[b] = a;
    }
    return { Fq, Am, nb };
  }
  // erhu: bowed two-string fiddle — saw + bow noise through a snakeskin body (thin fundamental, nasal formants), wide vibrato, portamento
  function erhu(B, notes, o = {}) {
    const { Fq, Am, nb } = leadCtl(B, notes, Object.assign({ att: .07, rel: .3, glide: .13, vibD: 36, vibR: 6.0, vibDel: .2, scoop: .9, scoopT: .11, swell: .3 }, o));
    const X = new Float32Array(B.n), ns = new Noise(o.seed || 9); let ph = 0, jit = 0;
    for (let b = 0; b < nb - 1; b++) { const k = b * BL; if (k >= B.n) break; const a0 = Am[b], a1 = Am[b + 1]; if (a0 < 1e-5 && a1 < 1e-5) continue;
      const kk = Math.min(B.n, k + BL);
      for (let j = k; j < kk; j++) { const a = a0 + (a1 - a0) * (j - k) / BL, w = ns.w(); jit = jit * .999 + w * .001; const inc = Fq[b] * (1 + jit * .5) / SRATE; ph += inc; if (ph >= 1) ph -= 1;
        X[j] = (sawB(ph, inc) * (1 + .1 * w) + w * (o.bow ?? .06)) * a; } }
    const sh = o.shift || 1, fs = [[880 * sh, 1.6, 1], [1650 * sh, 2.2, .75], [3000 * sh, 3, .42], [4700 * sh, 3.5, .16]], hp = new SVF(); hp.set(240 * sh, .7);
    const fb = fs.map(([f, q]) => { const s = new SVF(); s.set(f, q); return s; }), lp = new SVF(); lp.set(o.lp || 7500, .7);
    const [gl, gr] = pan2(o.pan || 0), g = o.g ?? 1;
    for (let j = 0; j < B.n; j++) { hp.run(X[j]); const h = hp.hp; let y = h * .3; for (let i = 0; i < 4; i++) { fb[i].run(h); y += fb[i].bp * fb[i].k * fs[i][2]; } y = lp.run(y) * g; B.L[j] += y * gl; B.R[j] += y * gr; }
  }
  // dizi: bamboo flute — few harmonics, breath noise at the pitch, chiff, and the dimo membrane buzz (nonlinear residue, band-passed high)
  function dizi(B, notes, o = {}) {
    const { Fq, Am, nb } = leadCtl(B, notes, Object.assign({ att: .04, rel: .12, glide: .045, vibD: 13, vibR: 5.3, vibDel: .25, legDip: .3 }, o));
    const ns = new Noise(o.seed || 19), bpN = new SVF(), hpN = new SVF(), mem = new SVF(), lp = new SVF(); hpN.set(2600, .7); mem.set(o.memF || 4300, 2.0); lp.set(11000, .7);
    let ph = 0, chiff = 0, prevA = 0; const [gl, gr] = pan2(o.pan || 0), g = o.g ?? 1, buzz = o.buzz ?? .6, brG = o.breath ?? .22;
    for (let b = 0; b < nb - 1; b++) { const k = b * BL; if (k >= B.n) break; const a0 = Am[b], a1 = Am[b + 1];
      if (a1 - prevA > .2) chiff = 1; prevA = a1; if (a0 < 1e-5 && a1 < 1e-5 && chiff < 1e-3) { for (let j = k; j < Math.min(B.n, k + BL); j++) { lp.run(0); mem.run(0); } continue; }
      bpN.set(Fq[b], 7); const kk = Math.min(B.n, k + BL), inc = Fq[b] / SRATE, trem = 1 + .07 * Math.sin(TAU * 5.3 * B.tm(k));
      for (let j = k; j < kk; j++) { const a = (a0 + (a1 - a0) * (j - k) / BL) * trem, w = ns.w(); ph += inc; if (ph >= 1) ph -= 1;
        const p = TAU * ph, s = Math.sin(p) + .33 * Math.sin(2 * p) + .16 * Math.sin(3 * p) + .07 * Math.sin(4 * p);
        bpN.run(w); hpN.run(w); chiff *= .9993; mem.run(Math.tanh(3.4 * s * a) - s * a * .95);
        let y = s * a * .55 + bpN.bp * bpN.k * a * brG + hpN.hp * (a * .03 + chiff * .1 * a) + mem.bp * mem.k * buzz * a;
        y = lp.run(y) * g; B.L[j] += y * gl; B.R[j] += y * gr; } }
  }
  // sheng reed: two slightly detuned narrow pulses
  function reed(B, t0, dur, f, o) {
    const att = o.att ?? .25, rel = o.rel ?? .4, k0 = Math.max(0, B.idx(t0)), k1 = Math.min(B.n, B.idx(t0 + dur + rel)); if (k1 <= k0) return;
    const [gl0, gr0] = pan2(o.pan || 0), g = o.g ?? 1, pw = o.pw ?? .28, r = rng(o.seed || 3);
    for (let v = 0; v < 2; v++) { let ph = r(); const det = Math.pow(2, (v ? 1 : -1) * (o.det ?? 3) / 1200), gl = gl0 * g * .5, gr = gr0 * g * .5;
      for (let k = k0; k < k1; k += BL) { const tt = B.tm(k) - t0, e0 = env(tt, dur, att, rel), e1 = env(tt + BL / SRATE, dur, att, rel), inc = f * det * (1 + .0015 * Math.sin(tt * 3.1 + v * 2)) / SRATE, kk = Math.min(k1, k + BL), de = (e1 - e0) / BL; let e = e0;
        for (let j = k; j < kk; j++) { ph += inc; if (ph >= 1) ph -= 1; let p2 = ph + pw; if (p2 >= 1) p2 -= 1; const y = (sawB(ph, inc) - sawB(p2, inc)) * e; e += de; B.L[j] += y * gl; B.R[j] += y * gr; } } }
  }
  // bank of decaying sinusoidal modes [f, T60, amp, att]; o.glide(tt) -> frequency factor
  function modes(B, t, list, g, pan, o = {}) {
    const k0 = B.idx(t), [gl, gr] = pan2(pan || 0), maxL = o.len || Math.max(...list.map(m => m[1])) * 1.05;
    const len = Math.min(Math.ceil(maxL * SRATE), B.n - k0); if (len <= 0) return;
    for (const [f, T60, amp, att = .001] of list) {
      if (f > SRATE * .45 || f < 15) continue;
      const l2 = Math.min(len, Math.ceil(T60 * 1.05 * SRATE)); let x = 0, y = 1, ed = amp * g, ea = 1; const rd = Math.exp(-6.91 / (T60 * SRATE)), ra = Math.exp(-1 / (att * SRATE));
      for (let j0 = 0; j0 < l2; j0 += BL) {
        const ff = f * (o.glide ? o.glide(j0 / SRATE) : 1), w = TAU * ff / SRATE, c = Math.cos(w), s = Math.sin(w), kk = Math.min(l2, j0 + BL);
        for (let j = j0; j < kk; j++) { const nx = x * c - y * s; y = x * s + y * c; x = nx; ed *= rd; ea *= ra; const e = ed * (1 - ea), k = k0 + j; if (k >= 0) { B.L[k] += x * e * gl; B.R[k] += x * e * gr; } }
      }
    }
  }
  // temple bell: hum / prime / tierce / quint / nominal... each a beating pair; struck with a wooden ram
  const BELLR = [[.5, 1, .55], [1, .78, .9], [1.19, .62, .55], [1.5, .45, .35], [2, .5, .6], [2.52, .32, .25], [2.67, .3, .3], [3.01, .24, .2], [4.03, .17, .14], [5.35, .11, .08], [6.6, .08, .05]];
  function bell(B, t, f, g, pan, o = {}) {
    const dec = o.dec || 9, list = [], r = rng(o.seed || (t * 100 | 0) + 3);
    for (const [rt, dk, am] of BELLR) { const ff = f * rt, bt = .3 + 1.1 * r(); list.push([ff, dec * dk, am * .55, .002], [ff + bt, dec * dk * .9, am * .45, .002]); }
    modes(B, t, list, g * .22, pan, { len: dec * 1.05 });
    thump(B, t, f * .9, f * .5, .25, g * .25, pan, .03, .002); nburst(B, t, .12, { f0: 900, q: .7, mode: LP, g: g * .22, pan, att: .001, dec: .03, seed: o.seed || 5 });
  }
  // big gong (daluo / tam-tam): dense inharmonic modes, high ones bloom late, pitch sinks a little
  const GONGR = [1, 1.47, 1.98, 2.43, 2.91, 3.39, 3.96, 4.52, 5.1, 5.83, 6.7, 7.4, 8.3, 9.5, 10.6, 12.2, 13.9, 15.8, 18.1, 20.7, 23.5, 27.1, 31.4, 36.0, 41.5, 47.0];
  function gong(B, t, f0, g, pan, o = {}) {
    const dec = o.dec || 8, r = rng(o.seed || (t * 100 | 0) + 7), list = [], bloom = o.bloom ?? .5;
    GONGR.forEach((rt, i) => { const u = i / GONGR.length; list.push([f0 * rt * (1 + .012 * (r() - .5)), dec * (1 - .72 * u) * (.8 + .4 * r()), (i ? .75 : 1) / Math.sqrt(1 + i * .55) * (.6 + .4 * r()), .002 + bloom * u * u * (.5 + r())]); });
    const drop = o.drop ?? .02;
    modes(B, t, list, g * .2, pan, { len: dec * 1.05, glide: tt => 1 - drop * (1 - Math.exp(-tt / 1.5)) });
    thump(B, t, f0 * 1.6, f0 * .95, 1.2, g * .4, pan, .05, .003);
    nburst(B, t, dec * .6, { f0: 3500, f1: 2500, q: .6, mode: HP, g: g * .045, pan, shape: u => sat(u * 8) * Math.pow(1 - u, 2.5), seed: o.seed || 11 });
  }
  // hand cymbals (bo / nao): inharmonic metal + bright noise
  function cym(B, t, g, o = {}) {
    const len = o.len || 2.2, r = rng((t * 1000 | 0) + 17), base = o.lo || 480;
    for (const p of o.pans || [-.45, .45]) { const list = []; for (let i = 0; i < 12; i++) list.push([base * Math.pow(1.29, i) * (.94 + .12 * r()), len * (.25 + .6 * r()) * (1 - i / 20), .3 + .7 * r(), .0005]);
      modes(B, t, list, g * .045, p, { len });
      nburst(B, t, len, { f0: o.nf || 7000, f1: (o.nf || 7000) * .7, q: .5, mode: HP, g: g * .42, pan: p, att: .001, dec: len * .28, seed: (t * 977 | 0) + (p > 0 ? 1 : 0) }); }
  }
  const swellCym = (B, t1, dur, g) => { for (const p of [-.5, .5]) nburst(B, t1 - dur, dur + .02, { f0: 2500, f1: 9000, q: .5, mode: HP, g, pan: p, shape: u => Math.pow(u, 3.5) * sat((1 - u) * 80), seed: (t1 * 100 | 0) + (p > 0 ? 1 : 0) }); };
  const chime = (B, t, f, g, pan) => modes(B, t, [[f, 3.4, 1, .0008], [f * 2.756, 1.8, .45, .0005], [f * 5.404, .85, .22, .0004], [f * 8.93, .4, .1, .0003]], g, pan);
  let DS = 5000;
  const dagu = (B, t, g, p = 0) => drum(B, t, { f: 51 + 5 * hash1(DS, 1), g: g * .75, pan: p, dec: .75, pitch: .55, pr: 14, nf: 700, nq: .9, stick: .2, skin: .9, bf: 180, len: 1.8, seed: DS++ });
  const tang = (B, t, g, p = 0, f = 0) => drum(B, t, { f: (f || 116) + 14 * hash1(DS, 2), g: g * .6, pan: p, dec: .3, pitch: .8, pr: 22, nf: 1900, nq: 1, stick: .55, skin: .45, bf: 480, len: .9, seed: DS++ });
  const bang = (B, t, g, p = 0) => drum(B, t, { f: 430 + 40 * hash1(DS, 3), g: g * .35, pan: p, dec: .05, pitch: .2, pr: 50, nf: 4200, nq: .9, stick: 1.6, skin: .1, bf: 1500, len: .2, ndec: .008, seed: DS++ });
  const clap = (B, t, g, p = 0) => { nburst(B, t, .05, { f0: 2600, q: 2, mode: BP, g: g * .6, pan: p, att: .0003, dec: .008, seed: DS++ }); modes(B, t, [[1250, .05, 1], [2900, .03, .5]], g * .08, p); };
  // thunder: optional near crack, several rolling bursts, sub
  function thunder(B, t, o) {
    const r = rng(o.seed || (t * 100 | 0)), dur = o.dur || 5, near = o.near || 0, g = o.g ?? 1, p = o.pan || 0;
    if (near > .2) { nburst(B, t, .09, { f0: 12000, q: .5, mode: LP, g: g * 1.6 * near, pan: p, att: .0004, dec: .025, seed: r() * 1e6 | 0 }); crackle(B, t, t + .8, tt => 900 * Math.exp(-(tt - t) / .2), tt => g * near * .8 * Math.exp(-(tt - t) / .3), { seed: r() * 1e6 | 0, f: 3000, q: .7, hp: 600, width: .5 }); }
    const nb = 3 + (r() * 4 | 0);
    for (let i = 0; i < nb; i++) { const t1 = t + .05 + Math.pow(r(), 1.5) * dur * .5, d1 = dur * (.3 + .5 * r()); nburst(B, t1, d1, { f0: 260 + 900 * near, f1: 80, q: .6, mode: LP, g: g * (.5 + .6 * r()) * (i ? .7 : 1.1), pan: clamp(p + (r() - .5) * .8, -1, 1), shape: u => sat(u * (6 + 20 * near)) * Math.pow(1 - u, 1.6) * (.55 + .45 * vn(u * 22, i * 7 + 3)), seed: r() * 1e6 | 0 }); }
    thump(B, t + .05, 50, 24, dur * .6, g * .5, p, .4, .05);
  }
  // red-crowned crane: hoarse trumpeting call
  function crane(B, t, o) {
    const dur = o.dur || .42, k0 = B.idx(t), len = Math.ceil(dur * SRATE), ns = new Noise(o.seed || 1), f1 = new SVF(), f2 = new SVF(), f3 = new SVF(), lp = new SVF(), [gl, gr] = pan2(o.pan || 0), g = o.g ?? 1;
    f1.set(1050, 3); f2.set(2200, 4); f3.set(3300, 5); lp.set(o.lp || 9000, .7); let ph = 0, rough = 0;
    for (let j = 0; j < len; j++) { const tt = j / SRATE, u = tt / dur, f0 = (o.f || 780) * (.82 + .26 * Math.sin(Math.PI * Math.min(1, u * 2.2)) - .06 * u);
      rough = rough * .9 + ns.w() * .1; ph += f0 * (1 + rough * .25) / SRATE; if (ph >= 1) ph -= 1;
      const src = (2 * ph - 1) * (1 + .4 * Math.sin(TAU * 38 * tt)) + ns.w() * .15, e = sat(tt / .02) * (u < .7 ? 1 : (1 - u) / .3);
      f1.run(src); f2.run(src); f3.run(src); const y = lp.run((f1.bp * f1.k + .7 * f2.bp * f2.k + .3 * f3.bp * f3.k) * e) * g;
      const k = k0 + j; if (k >= 0 && k < B.n) { B.L[k] += y * gl; B.R[k] += y * gr; } }
  }
  // small songbird: a few swept sine syllables
  function chirp(B, t, o) {
    const r = rng(o.seed || 1), n = o.n || 4, [gl, gr] = pan2(o.pan || 0), g = o.g ?? 1, fA = o.f || 3600 + 1800 * r(), up = r() < .5; let t0 = t;
    for (let s = 0; s < n; s++) { const d = .025 + .05 * r(), fa = fA * (.85 + .3 * r()), fb = fa * (up ? 1.4 : .7), k0 = B.idx(t0), len = Math.ceil(d * SRATE); let ph = 0;
      for (let j = 0; j < len; j++) { const u = j / len, e = Math.sin(Math.PI * u) ** 2 * g; ph += (fa + (fb - fa) * u) / SRATE; const y = (Math.sin(TAU * ph) + .12 * Math.sin(2 * TAU * ph)) * e, k = k0 + j; if (k >= 0 && k < B.n) { B.L[k] += y * gl; B.R[k] += y * gr; } }
      t0 += d + .02 + .07 * r(); }
  }

  // ============================================================================
  // THE SCORE — D gong-mode pentatonic (D E F# A B); the fight in D yu-mode.
  // Sections end on film events / cuts; music inside is written in beats.
  // ============================================================================
  let SEC = {}, CHT = [], HITS = [], S = {};
  const CHD = { D: [38, 50, 57, 62, 66, 69], Bm: [35, 47, 54, 59, 62, 66], G: [31, 43, 50, 55, 59, 62], Asus: [33, 45, 52, 57, 62, 64], A: [33, 45, 52, 57, 61, 64],
    Dm: [38, 50, 57, 62, 65, 69], Bb: [34, 46, 53, 58, 62, 65], C: [36, 48, 55, 60, 64, 67], F: [29, 41, 53, 57, 60, 65], Gmaj: [31, 43, 50, 55, 59, 62], Dcl: [26, 38, 50, 51, 57, 63] };
  const bt = (sec, b) => SEC[sec].t0 + b * SEC[sec].bt;
  const mel = (sec, notes, b0 = 0, tr = 0, vel = 1) => notes.map(n => [bt(sec, b0 + n[0]), n[1] + tr, n[2] * SEC[sec].bt, (n[3] ?? 1) * vel, n[4]]);
  const chordAt = t => { let c = CHT[0][1]; for (const p of CHT) if (t >= p[0] - 1e-6) c = p[1]; return c; };
  // hero theme (red loong) — a: 16 beats, b': 8 beats
  const HA = [[0, 69, 1, .85, { scoop: 1.6 }], [1, 74, 1.5, 1], [2.5, 76, .5, .85], [3, 78, 2, 1.05], [5, 76, .5, .85], [5.5, 74, .5, .85], [6, 71, 1, .9], [7, 69, 1, .9, { fall: .6 }],
    [8, 71, .75, .9, { scoop: 1 }], [8.75, 74, .25, .8], [9, 76, 1.5, 1], [10.5, 78, .5, .9], [11, 81, 2, 1.1], [13, 78, .5, .9], [13.5, 76, .5, .85], [14, 74, 2, 1, { fall: .4 }]];
  const HB = [[0, 81, 1, 1, { scoop: 1 }], [1, 83, .5, .9], [1.5, 81, .5, .85], [2, 86, 2, 1.15], [4, 83, .5, .9], [4.5, 81, .5, .85], [5, 78, 1, .95], [6, 76, .5, .85], [6.5, 78, .5, .9], [7, 81, 1, 1.05]];
  const toMin = m => { const pc = ((m - 62) % 12 + 12) % 12; return m + (pc === 4 ? -1 : pc === 9 ? 1 : 0); };      // F#->F, B->C : gong -> yu
  const HAm = HA.map(n => [n[0], toMin(n[1]), n[2], n[3], n[4]]);
  // rival theme (golden loong) — cold: the sinking semitone A -> Ab
  const RV = [[0, 62, 1, .9, { scoop: .5 }], [1, 69, 1.5, 1], [2.5, 68, .5, .9, { gl: 2 }], [3, 65, 1, .95], [4, 67, .75, .9], [4.75, 65, .25, .8], [5, 62, 3, 1, { fall: .8 }]];
  const RW = [[0, 62, 1, .85, { scoop: 1 }], [1, 69, 1.5, 1], [2.5, 71, .5, .9], [3, 66, 1, .95], [4, 67, .75, .9], [4.75, 66, .25, .8], [5, 62, 3, 1]];     // resolved, warm
  const HX = [[0, 74, 1], [1, 77, 1], [2, 79, 1], [3, 81, 1], [4, 83, 1], [5, 86, 1], [6, 88, 2, 1.1]];
  // 16th-note runs: [midi, steps, flags]
  const run16 = (sec, b0, arr, tr = 0, vel = 1) => { const o = []; let s = 0; for (const a of arr) { const st = a[1] || 1; o.push([bt(sec, b0 + s / 4), a[0] + tr, st / 4 * SEC[sec].bt * .96, vel * (s % 4 === 0 ? 1 : .85), a[2]]); s += st; } return o; };
  const FL1 = [[74], [76], [78], [81], [83], [86], [88], [86], [83], [81], [83], [86], [88, 4, { grace: 2 }], [90], [88], [86], [83], [81], [83], [86], [88], [86, 2], [83, 2], [86, 4, { trill: 2 }]];
  const FL2run = [[86], [83], [81], [78], [76], [74], [71], [69], [71, 2], [74, 2], [69, 4]];

  function makeSections() {
    S = EV.shotT; const c = (a, b, beats) => ({ t0: a, t1: b, bt: beats ? (b - a) / beats : 1 });
    SEC = { climb: c(T.rise, S.portrait, 32), broad: c(S.portrait, T.key, 16), fl1: c(S.chase, T.window, 8), fl2: c(T.window + .6, T.rival, 12), rival: c(T.rival, S.faceoff, 8),
      clash: c(S.clash, S.pursuit, 8), purs: c(S.pursuit, S.helix, 10), helix: c(S.helix, S.plunge, 8), storm: c(T.burst, T.charge, 12), part: c(S.part, T.lanterns, 8), lull: c(T.lanterns, T.end - 1, 12) };
    const H = [['climb', 0, 'D'], ['climb', 12, 'Bm'], ['climb', 16, 'G'], ['climb', 20, 'Asus'], ['climb', 24, 'G'], ['climb', 28, 'Asus'],
      ['broad', 0, 'D'], ['broad', 4, 'Bm'], ['broad', 8, 'G'], ['broad', 12, 'Asus'], ['broad', 16, 'D'],
      ['fl1', 0, 'D'], ['fl1', 4, 'G'], ['fl2', 0, 'Bm'], ['fl2', 4, 'G'], ['fl2', 8, 'Asus'], ['rival', 0, 'Dcl'],
      ['clash', 0, 'Dm'], ['clash', 4, 'Bb'], ['purs', 0, 'Dm'], ['purs', 2, 'C'], ['purs', 4, 'Bb'], ['purs', 6, 'C'], ['purs', 8, 'A'],
      ['helix', 0, 'Dm'], ['helix', 2, 'F'], ['helix', 4, 'Gmaj'], ['helix', 6, 'A'], ['helix', 8, 'Dm'],
      ['storm', 0, 'Dm'], ['storm', 4, 'Bb'], ['storm', 8, 'C'], ['storm', 12, 'A'], ['part', 0, 'D'], ['part', 2, 'Bm'], ['part', 4, 'G'], ['part', 6, 'D'],
      ['lull', 0, 'D'], ['lull', 3, 'Bm'], ['lull', 6, 'G'], ['lull', 9, 'D']];
    CHT = [[0, 'D'], [T.impact, 'D'], ...H.map(([s, b, ch]) => [bt(s, b), ch])].sort((a, b) => a[0] - b[0]);
    // trailer hits: on the cuts and the events (all read from the film)
    HITS = [[T.rise, 1.3, 'gong'], [S.spiral, .7], [S.summit, .75], [S.portrait, 1.05, 'crash'], [S.key, .8], [T.key, 1.2, 'gong'], [S.chase, .85, 'crash'], [S.sea, .55], [T.rival, .85, 'dark'],
      [S.gold, .6], [S.faceoff, .8], [S.clash, 1.15, 'crash'], [S.pursuit, .95, 'crash'], [S.helix, .9, 'crash'], [S.plunge, .6], [T.plunge, 1.45, 'gong'], [T.burst, 1.1, 'crash'], [T.burst + .3, .8],
      [S.storm, .85, 'crash'], [T.impact, 1.7, 'gong']];
  }
  // music level shapes shared by several jobs
  const quietAt = t => (t > T.window - .15 && t < T.window + .6) || (t > T.impact + .02 && t < T.rain0 + .6);

  // ---- strings / trailer bed ------------------------------------------------
  function jobPads(out) {
    const B = new Buf(-1, 91); let seed = 100;
    for (let i = 0; i < CHT.length; i++) {
      const [t0, nm] = CHT[i], t1 = i + 1 < CHT.length ? CHT[i + 1][0] : 90.5, notes = CHD[nm]; if (t1 - t0 < .05) continue;
      const slow = t1 - t0 > 3;
      for (const m of notes) sawEns(B, t0, t1 - t0, mtof(m), { nv: m < 45 ? 3 : 4, det: 9, att: slow ? .9 : .16, rel: .45, gain: .17 * (m < 36 ? .4 : m < 45 ? .7 : 1), spread: .8, vibD: 6, vibR: 4.6, drift: .004, seed: seed++ });
    }
    const cut = curve([[0, 900], [2.1, 1400], [2.3, 2800], [17, 3000], [17.3, 4200], [25, 5200], [26.5, 2000], [27.6, 3500], [36, 2600], [37.5, 900], [44, 1100], [47.2, 2200], [47.4, 3500], [59.4, 4500], [60.5, 2500],
      [63.2, 3200], [69.1, 5000], [69.3, 1500], [72, 1200], [75, 1800], [80, 1600], [87, 1400], [90, 900]]);
    filt(B, LP, cut, .6); filt(B, HP, 50, .6);
    const lvl = curve([[0, 0], [.6, 0], [1.4, .18], [2.15, .3], [2.25, .7], [4.5, .45], [6, .55], [17.1, .65], [17.3, .8], [24.9, .9], [25.05, 1], [26.4, .45], [27.5, .35], [27.65, .45], [31.3, .45], [T.window - .12, .4], [T.window - .05, 0],
      [T.window + .5, 0], [T.window + .9, .35], [36, .45], [37.5, .6], [44, .6], [47.2, .7], [47.4, .85], [59.4, .9], [60.4, .9], [60.6, .7], [63.2, .75], [69.15, 1], [69.25, 0], [70.8, 0], [72.5, .2], [75, .5], [80, .5], [86, .55], [90, .4]]);
    gainBuf(B, lvl);
    mixTo(out, B, .5, .35, 'pads');
  }
  function jobLow(out) {
    // drones (cello / bass sections and deep pads) for the darker half
    const B = new Buf(30, 91); let s = 300;
    for (const [t0, t1, m, v] of [[T.rival - .3, S.clash + .3, 26, 1], [T.rival - .3, S.clash + .3, 38, .6], [S.faceoff, S.clash + .2, 27, .35], [S.plunge + .6, T.burst + .15, 26, 1], [S.plunge + .6, T.burst + .15, 38, .6], [T.burst, T.impact + .05, 26, .8], [T.burst, T.impact + .05, 38, .5], [S.part, 89.6, 38, .4], [T.lanterns - 1, 89.6, 26, .3]])
      sawEns(B, t0, t1 - t0, mtof(m), { nv: 3, det: 7, att: 1.2, rel: t1 > T.impact - 1 && t1 < T.impact + 1 ? .03 : 1.2, gain: v * .22, spread: .5, vibD: 3, vibR: 3.3, drift: .004, seed: s++ });
    filt(B, LP, t => 160 + 120 * vn(t * .4, 3), .9);
    mixTo(out, B, .55, .15, 'drone');
    // sub swells and risers
    const R = new Buf(-1, 72), sub = (t0, t1, f, g) => { const k0 = R.idx(t0), k1 = R.idx(t1); let ph = 0; for (let k = Math.max(0, k0); k < Math.min(R.n, k1); k++) { const u = (k - k0) / (k1 - k0); ph += f / SRATE; const y = Math.sin(TAU * ph) * g * Math.pow(u, 2) * sat((1 - u) * 40); R.L[k] += y; R.R[k] += y; } };
    sub(.6, T.rise, 36.7, .12); sub(S.faceoff + .2, S.clash, 36.7, .4); sub(T.charge - .4, T.impact, 36.7, .5);
    for (const [t0, t1, g] of [[.9, T.rise, .16], [S.portrait - 1.8, S.portrait, .22], [S.faceoff + .4, S.clash, .3], [S.helix + .2, S.plunge - .05, .2], [T.charge - .6, T.impact, .42]])
      for (const p of [-.5, .5]) nburst(R, t0, t1 - t0 + .01, { f0: 400, f1: 8000, q: .9, mode: HP, g, pan: p, shape: u => Math.pow(u, 3) * sat((1 - u) * 90), seed: (t0 * 100 | 0) + (p > 0 ? 1 : 0) });
    mixTo(out, R, .7, .45, 'riser');
    // Shepard-like endless climb through the helix, and the charge
    const Sh = new Buf(S.helix - .2, T.impact + .1), np = 9, phs = new Float64Array(np);
    const shep = (t0, t1, sp, g) => { let x = 0; for (let k = Math.max(0, Sh.idx(t0)); k < Math.min(Sh.n, Sh.idx(t1)); k++) { const t = Sh.tm(k), u = sat((t - t0) / (t1 - t0)); x += sp * (.4 + .9 * u) / SRATE; let y = 0;
      for (let i = 0; i < np; i++) { const o = ((i + x) % np + np) % np, f = 55 * Math.pow(2, o), a = Math.exp(-Math.pow((o - 4.3) / 1.5, 2)); phs[i] += f / SRATE; y += a * (Math.sin(TAU * phs[i]) + .3 * Math.sin(2 * TAU * phs[i])); }
      const e = g * Math.pow(u, 1.2) * sat((t1 - t) / .01) * sat((t - t0) / .3); Sh.L[k] += y * e * (1 + .25 * Math.sin(t * 9)); Sh.R[k] += y * e * (1 - .25 * Math.sin(t * 9)); } };
    shep(S.helix, S.plunge - .02, .55, .12); shep(T.charge - .3, T.impact - .005, 1.3, .16);
    mixTo(out, Sh, .7, .4, 'shepard');
  }
  // tremolo strings: the face-off cluster, the storm, the clash's rising tone; string doubling of the themes
  function jobStrings(out) {
    const B = new Buf(S.faceoff - .2, T.impact + .3); let s = 500;
    const cl = [62, 63, 69, 70, 74, 75, 81];
    cl.forEach((m, i) => { const t0 = S.faceoff + i * (S.clash - S.faceoff) / 8; sawEns(B, t0, S.clash - .01 - t0, mtof(m), { nv: 3, det: 14, att: .8, rel: .03, gain: .11, spread: .9, vibD: 9, vibR: 5.5, seed: s++ }); });
    // the rising tone of the breath clash: a cluster gliding up an octave
    const gl = t => Math.pow(2, smooth(T.clash0, T.clash1, t));
    for (const m of [57, 62, 63, 69]) sawEns(B, T.clash0, T.clash1 - T.clash0 + .1, mtof(m), { nv: 3, det: 12, att: 1.5, rel: .25, gain: .1, spread: .9, fm: gl, seed: s++ });
    // storm tremolo: chord tones high + low
    for (let i = 0; i < CHT.length; i++) { const [t0, nm] = CHT[i], t1 = i + 1 < CHT.length ? CHT[i + 1][0] : 90; if (t1 <= T.burst || t0 >= T.impact) continue; const a = Math.max(t0, T.burst), b = Math.min(t1, T.impact);
      for (const m of CHD[nm].slice(3).map(x => x + 12).concat([CHD[nm][1]])) sawEns(B, a, b - a, mtof(m), { nv: 3, det: 10, att: .05, rel: b >= T.impact - .01 ? .02 : .12, gain: .12, spread: .9, vibD: 6, seed: s++ }); }
    let ph = 0;
    for (let k = 0; k < B.n; k++) { const t = B.tm(k); let rate = 0, depth = 0;
      if (t < S.clash) { const u = sat((t - S.faceoff) / (S.clash - S.faceoff)); rate = 5 + 12 * u * u; depth = .75; } else if (t > T.burst - .05) { rate = 13 + 4 * smooth(T.charge, T.impact, t); depth = .7; }
      ph += rate / SRATE; const am = 1 - depth * (.5 + .5 * Math.sin(TAU * ph)); B.L[k] *= am; B.R[k] *= am; }
    filt(B, LP, t => t < S.clash ? 500 * Math.pow(10, smooth(S.faceoff, S.clash, t)) : 4500 + 3000 * smooth(T.charge, T.impact, t), .7); filt(B, HP, 120, .7);
    gainBuf(B, t => t < S.clash ? Math.pow(smooth(S.faceoff, S.clash - .05, t), 1.5) : t < T.burst ? smooth(T.clash0, T.clash1, t) * .8 + .2 : .8 + .5 * smooth(T.charge, T.impact, t));
    mixTo(out, B, .6, .35, 'tremolo');
    // violins + cellos double the themes in the tutti / the fight
    const V = new Buf(16, 81), vo = { nv: 5, det: 11, gain: .2, vibD: 14, vibR: 5.6, glide: .08, att: .1, rel: .4, sine: .2, spread: .9, cut: a => 1500 + 4500 * a, q: .6 };
    line(V, mel('broad', HA), vo); line(V, mel('broad', HA, 0, -12), Object.assign({}, vo, { gain: .17, cut: a => 900 + 2500 * a }));
    line(V, mel('rival', RV, 0, -24), Object.assign({}, vo, { gain: .16, cut: a => 500 + 1400 * a, vibD: 6 }));
    line(V, mel('clash', RV, 0, -12), Object.assign({}, vo, { gain: .18, cut: a => 800 + 2500 * a }));
    line(V, mel('storm', HAm.slice(0, 8), 0, 0), Object.assign({}, vo, { gain: .16 }));
    line(V, mel('part', RW, 0, -12), Object.assign({}, vo, { gain: .13, cut: a => 700 + 1800 * a, vibD: 9 }));
    filt(V, HP, 90, .7);
    mixTo(out, V, .55, .5, 'violins');
  }

  // ---- erhu, zhonghu, dizi ----------------------------------------------------
  function jobLeads(out) {
    const E = new Buf(2, 90.5);
    const er = [].concat(mel('climb', HA, 8), mel('climb', HB, 24), mel('broad', HA, 0, 0, 1.12), mel('clash', HAm.slice(0, 8), 0, 0, 1.05), mel('purs', HAm.slice(0, 4), 4, 0, 1.05), mel('helix', HX, 0, 0, 1.05),
      mel('storm', HAm.slice(0, 8), 4, 12, .85), mel('part', RW, 0, 0, .9), mel('lull', HA.slice(0, 8), 0, 0, .75)).filter(n => n[0] < 89).sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < er.length - 1; i++) if (er[i][0] + er[i][2] > er[i + 1][0] + .001) er[i][2] = er[i + 1][0] - er[i][0];    // monophonic
    erhu(E, er, { g: .5, pan: -.12, seed: 7 });
    mixTo(out, E, .7, .55, 'erhu');
    // zhonghu: the rival's voice, an octave lower, darker body, narrower colder vibrato
    const Z = new Buf(36, 48); erhu(Z, mel('rival', RV, 0, -12), { g: .62, pan: .2, shift: .72, vibD: 18, vibR: 6.8, lp: 4200, seed: 8 }); mixTo(out, Z, .7, .6, 'zhonghu');
    // dizi
    const Dz = new Buf(14, 90);
    const rainT = T.rain0 + 2.4, rd = [[0, 69, 1, .7, { grace: 2 }], [1, 74, 1.5, .8], [2.5, 76, .5, .75], [3, 78, 2.6, .85, { fall: .5 }]].map(n => [rainT + n[0] * .6, n[1], n[2] * .6, n[3], n[4]]);
    const pick = [66, 69, 71].map((m, i) => [S.chase - (3 - i) * .085, m, .08, .8]);
    const dz = [].concat(mel('climb', HB, 24, 0, .55), mel('broad', HA, 0, 12, .6), pick, run16('fl1', 0, FL1), mel('fl2', HA.slice(0, 8), 0, 12, .9), run16('fl2', 8, FL2run, 0, .85),
      [0, 1, 2, 3].map(b => [bt('purs', b + .5), 86, SEC.purs.bt * .2, .8]), rd).sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < dz.length - 1; i++) if (dz[i][0] + dz[i][2] > dz[i + 1][0] + .001) dz[i][2] = dz[i + 1][0] - dz[i][0];
    dizi(Dz, dz, { g: .5, pan: .18, seed: 21 });
    mixTo(out, Dz, .6, .6, 'dizi');
  }

  // ---- guzheng and pipa ---------------------------------------------------------
  function jobPlucks(out) {
    const Z = new Buf(-.5, 91), P = new Buf(27, 70);
    // intro: a soft figure in the stillness, then a sweep up into the eruption
    for (const [t, m, b] of [[.95, 69, 0], [1.2, 74, 0], [1.42, 74, 2], [1.7, 78, 0]]) zheng(Z, t, m, .45, b ? { bend: pressBend(b, .12) } : { bend: rouVib(.18, .3) });
    gliss(Z, T.rise - .38, 62, 93, .36, .42, { acc: .8 });
    // climb: galloping guzheng (8th + two 16ths) on chord tones, bass on 1 and 3
    const tones = nm => { const a = CHD[nm].slice(2), o = a.concat(a.map(x => x + 12)).filter(m => m >= 57 && m <= 86).sort((x, y) => x - y); return [...new Set(o)]; };
    const gallop = (sec, b0, b1, g, gfn = () => 1) => { for (let b = b0; b < b1; b++) { const t = bt(sec, b), A = tones(chordAt(t + .01)), j = b % 4; const st = [0, .5, .75];
      st.forEach((s, i) => zheng(Z, bt(sec, b + s), A[(j + i) % A.length], g * gfn(b) * (i ? .75 : 1), { dec: 1.4 }));
      if (b % 2 === 0) zheng(Z, t, CHD[chordAt(t + .01)][0] + 12, g * gfn(b) * 1.1, { dec: 3.5, bright: .6 }); } };
    gallop('climb', 4, 32, .5, b => b < 8 ? .45 + .55 * (b - 4) / 4 : 1);
    gliss(Z, bt('climb', 7.4), 62, 86, bt('climb', 8) - bt('climb', 7.4) - .02, .45); gliss(Z, bt('climb', 23.4), 69, 93, bt('climb', 24) - bt('climb', 23.4) - .02, .5);
    // broad: big sweeps on every bar, broken-chord 8ths
    for (let bar = 0; bar < 4; bar++) gliss(Z, bt('broad', bar * 4) - .3, 50, 86, .29, .55, { acc: .9 });
    for (let b = 0; b < 16; b += .5) { const t = bt('broad', b), A = tones(chordAt(t + .01)); zheng(Z, t, A[(b * 2) % A.length], .38, { dec: 1.6 }); if (b % 2 === 0) zheng(Z, t, CHD[chordAt(t + .01)][0] + 12, .55, { dec: 3.5, bright: .55 }); }
    gliss(Z, T.key - .42, 57, 93, .4, .6);
    // flight: light 16th arpeggios; pipa tremolo
    for (const [sec, b0, b1] of [['fl1', 0, 8], ['fl2', 0, 12]]) for (let s = b0 * 4; s < b1 * 4; s++) { const b = s / 4, t = bt(sec, b), A = tones(chordAt(t + .01)); zheng(Z, t, A[[0, 2, 1, 3][s % 4] % A.length] + (s % 8 >= 4 ? 12 : 0), .42 * (s % 4 ? .7 : 1), { dec: .9 }); }
    for (const [sec, b, d, m] of [['fl1', 0, 2, 66], ['fl1', 2, 2, 69], ['fl1', 4, 2, 67], ['fl1', 6, 2, 71], ['fl2', 0, 2, 71], ['fl2', 2, 2, 74], ['fl2', 4, 2, 71], ['fl2', 6, 2, 74], ['fl2', 8, 2, 76], ['fl2', 10, 2, 74]]) {
      const t0 = bt(sec, b), dur = Math.min(d * SEC[sec].bt - .03, sec === 'fl1' ? T.window - .12 - t0 : 99); if (dur < .1) continue;
      pipa(P, t0, dur, m, .75, { pan: .3 }); pipa(P, t0 + .01, dur, m - 12, .4, { pan: -.3 }); }
    gliss(Z, T.window + .55, 93, 69, .5, .4, { acc: 1.2 });
    // pursuit: driving pipa ostinato in 16ths
    for (let s = 0; s < 40; s++) { const t = bt('purs', s / 4), r = CHD[chordAt(t + .01)][0] + 24; pipa(P, t, SEC.purs.bt / 4 * .8, r + [0, 12, 7, 12][s % 4], s % 4 ? .5 : .75, { single: true, dec: .5, pan: s % 2 ? .25 : -.25 }); }
    for (let s = 0; s < 32; s++) { const t = bt('clash', s / 4), r = CHD[chordAt(t + .01)][0] + 24; pipa(P, t, SEC.clash.bt / 4 * .8, r + [0, 7, 12, 7][s % 4], .38, { single: true, dec: .4, pan: .35 }); }
    // helix: spiralling glissandi upward every beat
    for (let b = 0; b < 8; b++) { const t = bt('helix', b), r = CHD[chordAt(t + .01)][0] + 12; gliss(Z, t, r + b, r + b + 36, SEC.helix.bt * .8, .42 + .04 * b, { acc: .85 }); }
    gliss(Z, S.plunge + .08, 96, 45, T.plunge - S.plunge - .3, .55, { acc: 1.3, shape: u => 1 - .5 * u });
    // storm: pipa tremolo dyads on the chord, crescendo through the charge
    for (let i = 0; i < CHT.length; i++) { const [t0, nm] = CHT[i], t1 = i + 1 < CHT.length ? CHT[i + 1][0] : 90; if (t1 <= T.burst + .2 || t0 >= T.impact) continue; const a = Math.max(t0, T.burst + .2), b = Math.min(t1, T.impact - .01), A = CHD[nm];
      for (const m of [A[3] + 12, A[4] + 12]) pipa(P, a, b - a, m, .45, { rate: 16, cres: t1 > T.charge ? [.7, 1.4] : [.9, 1.1], pan: m % 2 ? .3 : -.3 }); }
    // sun shower: the guzheng alone in the rain (rubato), then a rainbow sweep
    const r0 = T.rain0 + .6;
    for (const [dt, m, b, v] of [[0, 69, 0, .5], [.5, 74, 0, .45], [.9, 74, 2, .5], [1.62, 78, 0, .45], [2.0, 76, 0, .4], [2.35, 74, -1, .5], [3.25, 71, 0, .4], [3.55, 69, 0, .4], [3.9, 66, 0, .38], [4.35, 69, -1, .45]])
      zheng(Z, r0 + dt, m, v, b > 0 ? { bend: pressBend(b, .18), dec: 3.5 } : b < 0 ? { bend: rouVib(.25, .4), dec: 4.5 } : { dec: 3 });
    gliss(Z, T.rain0 + 3.7, 74, 98, 1.3, .22, { shape: u => .6 + .4 * Math.sin(Math.PI * u), dec: 2.5 });
    // parting: soft broken chords
    for (let b = 0; b < 8; b += .5) { const t = bt('part', b), A = CHD[chordAt(t + .01)]; zheng(Z, t, [A[1] + 12, A[2] + 12, A[3] + 12, A[4] + 12][(b * 2) % 4], .22, { dec: 2.2 }); }
    // lullaby: broken chords in 8ths, a last arpeggio before the bell, a sweep into the final gong
    for (let b = 0; b < 9; b += .5) { const t = bt('lull', b), A = CHD[chordAt(t + .01)]; zheng(Z, t, [A[1], A[2], A[3], A[4], A[5], A[3]][Math.round(b * 2) % 6], .45, { dec: 2.6 }); }
    for (let i = 0; i < 6; i++) zheng(Z, T.coil - .9 + i * .14, [62, 66, 69, 74, 78, 81][i], .3, { dec: 3.5 });
    gliss(Z, T.end - 1.95, 62, 86, .5, .25, { dec: 3 });
    mixTo(out, Z, .62, .5, 'guzheng'); mixTo(out, P, .6, .45, 'pipa');
  }

  // ---- percussion: war drums, hits, cymbals, gongs, the temple bell -------------
  function jobPerc(out) {
    const B = new Buf(-.5, 90.5), Hb = new Buf(-.5, 92), G = new Buf(-.5, 99); DS = 3000;
    const rest = t => HITS.some(([h]) => t > h - .1 && t < h - 1e-4) || quietAt(t);
    for (const [t, g, kind] of HITS) {
      dagu(Hb, t, g * 1.05, -.3); dagu(Hb, t + .007, g, .3); tang(Hb, t, g * .7, 0);
      thump(Hb, t, 100, 32, 2.0 * Math.min(1.25, g), .3 * g, 0, .07);
      nburst(Hb, t, 1.2, { f0: 5000, f1: 300, q: .7, mode: LP, g: .35 * g, att: .002, dec: .2, seed: DS++ });
      if (kind === 'crash' || kind === 'gong') cym(Hb, t, g * .9, { len: 2.4, lo: 420 });
      if (kind === 'gong') gong(G, t, t === T.impact ? 52 : t === T.plunge ? 49 : 58, g * 1.1, 0, { dec: t === T.impact ? 11 : 8, bloom: .6 });
      if (kind === 'dark') gong(G, t, 46, .7, 0, { dec: 7, bloom: .9, drop: .03 });
    }
    // patterns, 16 steps per bar: X dagu, x tanggu, o bangu, c xiaobo (choked), C crash, k clapper
    const bar = (sec, b0, p, g = 1) => { const st = SEC[sec].bt / 4; for (let i = 0; i < 16; i++) { const t = bt(sec, b0) + i * st; if (rest(t)) continue; const acc = i % 4 === 0 ? 1 : .78;
      const a = p.d?.[i], b = p.t?.[i], c = p.c?.[i], o = p.o?.[i];
      if (a === 'X') dagu(B, t, g * acc); if (b === 'x') tang(B, t, g * acc * .85, i % 2 ? .3 : -.3); if (b === 'X') tang(B, t, g * 1.1, 0);
      if (c === 'c') cym(B, t, g * .35, { len: .28, lo: 1050, nf: 8000, pans: [.5] }); if (c === 'C') cym(B, t, g * .8, { len: 2, lo: 460 });
      if (o === 'o') bang(B, t, g * acc * .8, -.4); if (o === 'k') clap(B, t, g * .8, .2); } };
    const GAL = 'x.xxx.xxx.xxx.xx';
    bar('climb', 4, { t: GAL }, .45);
    for (let b0 = 8; b0 < 28; b0 += 4) bar('climb', b0, { d: 'X.......X.......', t: GAL, c: '....c.......c...', o: '..o.......o..o..' }, .8);
    bar('climb', 28, { d: 'X.......X...X.X.', t: 'xxxxxxxxxxxxxxxx', c: '....c.......c...' }, .9);
    for (let b0 = 0; b0 < 16; b0 += 4) bar('broad', b0, { d: 'X.......X.....X.', t: '....x.......x.xx', c: b0 % 8 ? '..c...c...c...c.' : 'C.c...c...c...c.', o: '.....k.......k..' }, 1);
    { let t = S.chase - 1.1, dt = .09; while (t < S.chase - .04) { dagu(B, t, .25 + .55 * smooth(S.chase - 1.1, S.chase, t), (hash1(DS, 4) - .5) * .5); t += dt; dt = Math.max(.045, dt * .94); } }
    for (const [sec, b0] of [['fl1', 0], ['fl1', 4], ['fl2', 0], ['fl2', 4], ['fl2', 8]]) bar(sec, b0, { t: '..x...x...x..x.x', o: 'o.o.o.oo.o.o.ooo', c: '..c...c...c...c.' }, .5);
    for (let b0 = 0; b0 < 8; b0 += 2) { const t = bt('rival', b0); if (!rest(t)) dagu(B, t, .42, 0); }
    // face-off: accelerating heartbeat on the big drum
    { let t = S.faceoff + .35; while (t < S.clash - .12) { const u = sat((t - S.faceoff) / (S.clash - S.faceoff)), per = .78 - .5 * u; dagu(B, t, .35 + .4 * u); dagu(B, t + per * .3, .22 + .3 * u); t += per; } }
    // the fight
    for (const b0 of [0, 4]) bar('clash', b0, { d: 'X..X..X.X..X.X..', t: 'xxXxxxXxxxXxxxXx', c: 'c.c.c.c.c.c.c.c.' }, 1);
    for (const b0 of [0, 4]) bar('purs', b0, { d: 'X.xX.xX.X.xX.xXx'.replace(/x/g, '.'), t: 'xxxxxxxxxxxxxxxx', c: '..c...c...c...c.', o: 'o..o..o.o..o..oo' }, 1.05);
    bar('purs', 8, { d: 'X.X.', t: 'xxxxxxxx' }, 1.1);
    for (const b0 of [0, 4]) bar('helix', b0, { d: 'X...X...X...X...', t: 'x.xxx.xxx.xxx.xx', c: 'C.......C.......' }, 1.05);
    { const t0 = S.plunge + .1, t1 = T.plunge - .25; let t = t0, i = 0; while (t < t1) { tang(B, t, .5 + .3 * (t - t0) / (t1 - t0), (i % 2 ? .4 : -.4), 150 - 70 * (t - t0) / (t1 - t0)); t += .07; i++; } }
    dagu(B, T.plunge + 1.0, .5); dagu(B, T.plunge + 1.25, .32); dagu(B, T.plunge + 2.1, .5); dagu(B, T.plunge + 2.35, .32);
    for (let b0 = 0; b0 < 12; b0 += 4) bar('storm', b0, { d: 'X..x..X.X..x.X..'.replace(/x/g, '.'), t: 'x.x.xxx.x.x.xxx.', c: (b0 ? 'C' : '.') + '.c.c.c.c.c.c.c.', o: '.o..o..o.o..o..o' }, 1.05);
    { let t = T.charge, dt = .1; while (t < T.impact - .03) { const u = sat((t - T.charge) / (T.impact - T.charge)); tang(B, t, .45 + .65 * u, (hash1(DS, 9) - .5) * .8); if (u > .4 && hash1(DS, 11) < .4) dagu(B, t, .6 * u); t += dt; dt = Math.max(.035, dt * .93); } }
    swellCym(Hb, S.clash, 1.6, .2); swellCym(Hb, T.impact, 1.0, .35); swellCym(Hb, T.rise, 1.2, .12);
    // the temple bell (stillness, lanterns, the coil) and the final gong
    bell(G, .4, 146.8, .5, -.25, { dec: 9, seed: 41 });
    bell(G, T.lanterns, 146.8, .45, .2, { dec: 9, seed: 42 }); bell(G, T.coil, 110, .45, -.15, { dec: 10, seed: 43 });
    gong(G, T.end - 1.5, 55, .75, 0, { dec: 9, bloom: .8, seed: 44 });
    gainBuf(G, t => t > T.end - 1.5 ? 1 - .75 * smooth(T.end - 1.2, T.end + 1.5, t) : 1);
    mixTo(out, B, .55, .3, 'drums'); mixTo(out, Hb, .58, .35, 'hits'); mixTo(out, G, .55, .7, 'gong');
  }

  // ---- low brass, the distant horn, sheng, chimes ---------------------------------
  function jobBrass(out) {
    const B = new Buf(16, 81);
    const bo = { nv: 4, det: 8, gain: .5, glide: .07, att: .1, rel: .35, bloom: .5, sine: .5, spread: .5, cut: a => 200 + 2000 * a * a * a, q: 1.0, formant: .6, formF: 520 };
    // tutti: root + fifth swells each bar
    const sw = []; for (let bar = 0; bar < 4; bar++) { const t = bt('broad', bar * 4), r = CHD[chordAt(t + .01)][0] + 12; sw.push([t, r, SEC.broad.bt * 4 - .05, .85]); }
    line(B, sw, bo); line(B, sw.map(n => [n[0], n[1] + 7, n[2], n[3] * .8]), Object.assign({}, bo, { gain: .38 }));
    line(B, [[T.key, 50, S.chase - T.key - .3, 1]], Object.assign({}, bo, { gain: .5, rel: .6 })); line(B, [[T.key, 57, S.chase - T.key - .3, 1]], Object.assign({}, bo, { gain: .35, rel: .6 }));
    // the fight: the rival's theme in the low brass, rising head motifs in the helix, the hero (minor) in the storm
    const fight = [].concat(mel('clash', RV, 0, -12), mel('purs', [[0, 62, 1], [1, 69, 1.5], [2.5, 68, .5]], 0, -12), mel('purs', [[0, 62, 1], [1, 69, 1.5], [2.5, 68, .5]], 4, -16), mel('purs', [[0, 57, 2, 1.1]], 8, -12),
      mel('helix', [[0, 50, 1], [1, 57, 1], [2, 53, 1], [3, 60, 1], [4, 55, 1], [5, 62, 1], [6, 57, 2, 1.15]]), mel('storm', HAm.slice(0, 8), 0, -12), mel('storm', [[8, 60, 4, 1]]),
      [[T.charge, 45, T.impact - T.charge - .02, 1.2]]).sort((a, b) => a[0] - b[0]);
    for (const n of fight) if (n[0] < T.impact && n[0] + n[2] > T.impact - .02) n[2] = T.impact - .02 - n[0];
    line(B, fight, Object.assign({}, bo, { rel: .12 })); line(B, fight.map(n => [n[0], n[1] - 12, n[2], n[3]]), Object.assign({}, bo, { gain: .42, rel: .12 }));
    mixTo(out, B, .5, .35, 'brass');
    // impact stab
    const St = new Buf(T.impact - .1, T.impact + 2); let s = 1500;
    for (const m of [26, 38, 45, 50, 51, 57, 62, 63]) sawEns(St, T.impact, .35, mtof(m), { nv: 3, det: 16, att: .006, rel: .6, gain: .2, spread: .8, seed: s++, dec: .9 });
    filt(St, LP, t => 300 + 6000 * Math.exp(-(t - T.impact) / .2), 1.2); mixTo(out, St, .8, .5, 'brass');
    // the distant horn at the parting
    const Hn = new Buf(S.part - .5, T.lanterns + 2);
    line(Hn, mel('part', [[0, 57, 3.6, .9], [4, 62, 3.6, 1]]), { nv: 3, det: 5, gain: .4, vibD: 5, vibR: 4.6, glide: .2, att: .5, rel: 1.2, bloom: .4, sine: .9, spread: .3, cut: a => 280 + 1100 * a * a, q: .8, formant: .5, formF: 700 });
    mixTo(out, Hn, .25, 1.1, 'horn');
    // sheng: bright open chords in the flight and the tutti, cold clusters for the rival, the face-off, underwater
    const Sg = new Buf(16, 90); s = 2000;
    const OPEN = { D: [62, 69, 74, 76], G: [62, 67, 74, 79], Bm: [66, 71, 74, 78], Asus: [64, 69, 74, 76] };
    for (const sec of ['broad', 'fl1', 'fl2']) for (let i = 0; i < CHT.length; i++) { const [t0, nm] = CHT[i], t1 = i + 1 < CHT.length ? CHT[i + 1][0] : 90; if (t0 < SEC[sec].t0 - .01 || t0 >= SEC[sec].t1 - .01 || !OPEN[nm]) continue;
      const e = Math.min(t1, SEC[sec].t1) - .02, cutW = sec === 'fl1' ? Math.min(e, T.window - .12) : e; for (const m of OPEN[nm]) reed(Sg, t0, cutW - t0, mtof(m), { g: sec === 'broad' ? .07 : .055, att: .12, rel: .25, pan: (m - 70) / 14, seed: s++ }); }
    const CL = [[0, [50, 57, 64]], [2, [50, 51, 57, 62]], [4, [48, 55, 57, 63]], [6, [50, 51, 57, 62, 63]]];
    for (const [b, ns] of CL) for (const m of ns) reed(Sg, bt('rival', b), SEC.rival.bt * 2, mtof(m), { g: .085, att: .9, rel: .6, pan: (m - 56) / 10, det: 5, seed: s++ });
    for (const m of [50, 51, 57, 58, 62, 63]) reed(Sg, S.faceoff, S.clash - S.faceoff - .02, mtof(m), { g: .07, att: 2.2, rel: .04, pan: (m - 56) / 10, det: 6, seed: s++ });
    for (const m of [50, 57, 62]) reed(Sg, T.plunge + .3, T.burst - T.plunge - .2, mtof(m), { g: .09, att: .8, rel: .3, seed: s++ });
    for (const m of [62, 69, 74, 78]) reed(Sg, bt('lull', 0), SEC.lull.bt * 9, mtof(m), { g: .035, att: 2.5, rel: 2, pan: (m - 70) / 12, seed: s++ });
    filt(Sg, LP, 2800, .7); filt(Sg, HP, 110, .7);
    mixTo(out, Sg, .5, .5, 'sheng');
    // chimes as music: stillness, the rainbow, the lanterns
    const Ch = new Buf(-.5, 91), r = rng(555), sc = [86, 88, 90, 93, 95, 98];
    const dens = curve([[0, 1.2], [2.1, 1.2], [2.3, 0], [72.5, 0], [73.3, 3], [75.5, .5], [80, .6], [86, .9], [89, .3], [91, 0]]);
    for (let t = -.4; t < 90.5; t += .05) if (r() < dens(t) * .05) chime(Ch, t, mtof(sc[(r() * 6) | 0]) * (1 + .006 * (r() - .5)), .05 + .05 * r(), r() * 1.8 - .9);
    mixTo(out, Ch, .45, .9, 'chimes');
  }

  // ============================================================================
  // SOUND DESIGN
  // ============================================================================
  // ---- the valley: wind, lake, waterfall, camera rush, rain, leaves, sky lanterns (circular)
  function jobAmb(out) {
    const B = new Buf(0, 90), n1 = new Noise(11), n2 = new Noise(12), n3 = new Noise(13), n4 = new Noise(14);
    const bL = new SVF(), bR = new SVF(), wL = new SVF(), wR = new SVF(), fl = new SVF(), fr = new SVF(), fb = new SVF(), lk = new SVF(), lk2 = new SVF(), rh = new SVF(), rl = new SVF(), ru = new SVF();
    fl.set(2400, .6); fr.set(2400, .6); fb.set(380, .8); lk.set(420, .7); rh.set(4200, .6); rl.set(900, .7); ru.set(1800, .7); let brL = 0, brR = 0;
    for (let k = 0; k < B.n; k += BL) {
      const t = B.tm(k), st = au('storm', t), wi = au('wind', t), gu = vn(t * .33, 5) * .65 + vn(t * 1.3, 9) * .35, gv = vn(t * .33 + 7.7, 5) * .65 + vn(t * 1.3 + 3, 9) * .35;
      const wl = dB(-50 + 28 * Math.sqrt(clamp(wi * .55 + st * .6, 0, 1.3))) * (.4 + 1.2 * gu * gu), wr = wl * (.4 + 1.2 * gv * gv) / (.4 + 1.2 * gu * gu);
      bL.set(240 + 900 * gu + 600 * st, .7 + 1.4 * gu); bR.set(240 + 900 * gv + 600 * st, .7 + 1.4 * gv);
      const wf = 650 + 900 * vn(t * .21, 13), ws = st * st * .4 * smooth(.5, .9, gu); wL.set(wf, 16); wR.set(wf * 1.13, 16);
      const fd = au('fallsD', t), fall = (au('camY', t) < 240 ? .05 : .015) + .9 * Math.pow(45 / (45 + fd), 1.4), lake = au('lakeP', t) * (.5 + .5 * vn(t * .6, 21)), rush = clamp((au('camSpeed', t) - 10) / 70, 0, 1);
      const rn = au('rain', t);
      ru.set(900 + 2500 * rush, .6); lk2.set(700 + 500 * vn(t * 2, 31), 2);
      const kk = Math.min(B.n, k + BL);
      for (let j = k; j < kk; j++) {
        const a = n1.w(), b = n2.w(), c = n3.w(), d = n4.w(); brL = brL * .996 + a * .05; brR = brR * .996 + b * .05;
        bL.run(a); bR.run(b); wL.run(a); wR.run(b); fl.run(c); fr.run(d); fb.run(c + d); lk.run(a + d); lk2.run(b); rh.run(c - a); rl.run(d); ru.run(a + b);
        const wsL = (bL.bp * bL.k * .8 + brL * .14) * wl + wL.bp * wL.k * ws * wl * 1.6, wsR = (bR.bp * bR.k * .8 + brR * .14) * wr + wR.bp * wR.k * ws * wr * 1.6;
        const fa = (fl.lp * .25 + fb.bp * fb.k * .22) * fall, fbb = (fr.lp * .25 + fb.bp * fb.k * .22) * fall;
        const lap = lk.lp * .18 * lake + lk2.bp * lk2.k * .05 * lake * (.5 + .5 * Math.sin(t * 4.1 + 2 * Math.sin(t * 1.3)));
        const rr = ru.bp * ru.k * rush * .045, rain = rh.hp * rn * .05 + rl.lp * rn * .1;
        B.L[j] += wsL + fa + lap + rr + rain; B.R[j] += wsR + fbb + lap * .9 + rr * .9 + rain * .95;
      }
    }
    filt(B, HP, 45, .7);
    // lake: little laps and plips
    { const r = rng(77); for (let t = 0; t < 90; t += .08) { const lp = au('lakeP', t); if (lp > .03 && r() < .12) { nburst(B, t, .12 + .2 * r(), { f0: 500 + 900 * r(), q: 1.2, mode: BP, g: .12 * lp, pan: r() * 1.6 - .8, shape: u => Math.sin(Math.PI * u) * (1 - u), seed: r() * 1e6 | 0 }); }
      if (lp > .03 && r() < .05) { const k0 = B.idx(t), f0 = 500 + 700 * r(), pn = r() * 1.6 - .8, [gl, gr] = pan2(pn); let ph = 0; for (let j = 0; j < 1600; j++) { const tt = j / SRATE; ph += f0 * (1 + 2.5 * tt / .036) / SRATE; const y = Math.sin(TAU * ph) * Math.exp(-tt / .012) * .06 * lp; const kq = k0 + j; if (kq < B.n) { B.L[kq] += y * gl; B.R[kq] += y * gr; } } } } }
    // rain: droplets on leaves, roofs and water
    crackle(B, T.rain0 - .2, T.rain1 + .5, t => 2500 * au('rain', t), t => .22 * au('rain', t), { seed: 81, f: 5200, q: .8, hp: 1500 });
    crackle(B, T.rain0 - .2, T.rain1 + .5, t => 60 * au('rain', t), t => .5 * au('rain', t), { seed: 82, f: 1500, q: 1.2, hp: 400 });
    // leaves rustling in the gusts
    crackle(B, 0, 90, t => { const g = vn(t * .33, 5) * .65 + vn(t * 1.3, 9) * .35; return 900 * au('treeP', t) * Math.pow(g, 2.5) * (.4 + au('wind', t)); }, t => .07 * au('treeP', t) * (1 + au('storm', t)), { seed: 83, f: 4200, q: .7, hp: 1800 });
    // sky lanterns: soft paper flutter
    { const r = rng(91); for (let t = T.lanterns; t < 90; t += .04) { const l = au('lant', t); if (r() < l * .12) nburst(B, t, .05 + .07 * r(), { f0: 600 + 700 * r(), q: 1.4, mode: BP, g: .05 * l, pan: r() * 1.6 - .8, shape: u => Math.sin(Math.PI * u) * (.6 + .4 * Math.sin(u * 40)), seed: r() * 1e6 | 0 }); } }
    mixTo(out, B, 1, .15, 'amb');
  }
  // ---- birds: small birds by day, cranes; a flock fleeing at the eruption; none in the storm
  function jobBirds(out) {
    const B = new Buf(-.5, 91), r = rng(4321);
    const calm = t => 1 - smooth(.06, .2, au('storm', t)) * (t > 30 ? 1 : 0);
    const dens = t => (t < T.rival ? 1.1 : t > T.rain1 ? .5 * (1 - au('dusk', t) * .6) : 0) * calm(t) * (.35 + .65 * au('treeP', t) + .3 * au('lakeP', t));
    for (let t = -.4; t < 90.5; t += .1) if (r() < dens(t) * .06) chirp(B, t, { g: (.025 + .05 * r()) * (.5 + au('treeP', Math.max(0, t))), pan: r() * 1.8 - .9, n: 2 + (r() * 6 | 0), seed: r() * 1e6 | 0 });
    for (let i = 0; i < 22; i++) { const t = T.rise + .1 + Math.pow(r(), 1.5) * 1.6; chirp(B, t, { g: .04 + .04 * r(), pan: r() * 1.8 - .9, n: 2 + (r() * 3 | 0), f: 3000 + 2500 * r(), seed: r() * 1e6 | 0 }); }
    for (let i = 0; i < 70; i++) { const t = T.rise + .05 + Math.pow(r(), 1.7) * 1.8; nburst(B, t, .06, { f0: 500 + 800 * r(), f1: 400, q: .9, mode: BP, g: .035 + .04 * r(), pan: r() * 1.8 - .9, shape: u => Math.sin(Math.PI * u) ** 2, seed: r() * 1e6 | 0 }); }
    for (const [t, g, n] of [[1.0, .1, 2], [8.6, .16, 3], [14.3, .1, 2], [33.4, .18, 3], [78.0, .1, 2], [82.4, .14, 3], [85.6, .08, 2]]) { if (calm(t) < .5) continue; const pn = r() * 1.2 - .6;
      for (let i = 0; i < n; i++) { crane(B, t + i * .62, { g, pan: pn, f: 760 + 40 * r(), dur: .38 + .08 * r(), lp: 6000, seed: r() * 1e6 | 0 }); crane(B, t + i * .62 + .3, { g: g * .8, pan: -pn * .6, f: 830 + 40 * r(), dur: .3 + .08 * r(), lp: 5000, seed: r() * 1e6 | 0 }); } }
    mixTo(out, B, .8, .5, 'birds');
  }
  // ---- monastery: wind chimes in the gusts, small distant bells
  function jobChimes(out) {
    const B = new Buf(-.5, 91), r = rng(99), sc = [86, 88, 90, 93, 95, 98, 100];
    for (let t = 0; t < 90; t += .05) { const gu = vn(t * .33, 5) * .65 + vn(t * 1.3, 9) * .35, prox = clamp(50 / (50 + au('monD', t)), .1, 1), rate = (.3 + 3 * Math.pow(gu, 3) * (au('wind', t) + au('storm', t))) * prox;
      if (r() < rate * .05) { const n = 1 + (r() * 3 | 0); for (let i = 0; i < n; i++) chime(B, t + i * (.03 + .05 * r()), mtof(sc[(r() * 7) | 0]) * (1 + .01 * (r() - .5)), (.025 + .03 * r()) * (.5 + prox), r() * 1.6 - .8); } }
    for (const t of [6.8, 12.4, 15.9, 21.5, 34.6, 76.5, 83.6]) modes(B, t, [[523, 4, 1, .001], [523 * 2.71, 2.4, .5, .001], [523 * 5.1, 1.2, .25, .001], [526, 3.6, .8, .001]], .06 * clamp(60 / (60 + au('monD', t)), .2, 1), .4 - (t % 3) * .3);
    mixTo(out, B, .6, .8, 'chimes2');
  }

  // ---- the dragons ------------------------------------------------------------
  // layered roar driven by the film's roar curve; distance, pan, doppler from the camera; muffled under water
  function roar(B, seg, who, o) {
    const [t0, t1] = seg, k0 = Math.max(0, B.idx(t0 - .05)), k1 = Math.min(B.n, B.idx(t1 + .1)); if (k1 <= k0) return;
    const ns = new Noise(o.seed), F = [new SVF(), new SVF(), new SVF(), new SVF()], air = new SVF(), br = new SVF(), cm = new Float32Array(256); let ci = 0;
    let p1 = 0, p2 = 0, p3 = 0, p4 = 0, pf = 0, ps = 0, pm = 0, pe = 0, jit = 0, fry = 0, y0 = 0; const base = o.f0, FM = o.formants, FA = o.famps;
    for (let k = k0; k < k1; k += BL) {
      const t = B.tm(k), r = au(who + 'Roar', t), d = au(who + 'D', t), pan = au(who + 'Pan', t), vr = au(who + 'Vr', t), und = au(who + 'Under', t);
      const dop = clamp(343 / (343 + vr), .6, 1.6), u = sat((t - t0) / (t1 - t0));
      const contour = .78 + .5 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.2)), .7) - .15 * u + .08 * (vn(t * 2.7, o.seed) - .5);
      const f = base * contour * dop, open = .7 + .45 * r;
      for (let i = 0; i < 4; i++) F[i].set(FM[i] * open * Math.sqrt(dop), o.fq[i]);
      br.set(1200 * open, .7); air.set(und > .5 ? 350 : clamp(16000 * prox(d, 160), 900, 16000), .7);
      const g = r * clamp(Math.pow(prox(d, 45), .7) * 1.7, o.gmin || .3, 1.25) * o.g, [gl, gr] = pan2(pan * .9), kk = Math.min(k1, k + BL);
      if (g < 1e-4) { for (let j = k; j < kk; j++) ns.w(); continue; }
      const g0 = FA[0] * F[0].k, g1 = FA[1] * F[1].k, g2 = FA[2] * F[2].k, g3 = FA[3] * F[3].k;
      for (let j = k; j < kk; j++) {
        const w = ns.w(); jit = jit * .995 + w * .005;
        const inc = f * (1 + jit * .6) / SRATE;
        p1 += inc; if (p1 >= 1) p1 -= 1; p2 += inc * .5 * 1.004; if (p2 >= 1) p2 -= 1; p3 += inc * 4.7; if (p3 >= 1) p3 -= 1; p4 += inc * 2.02; if (p4 >= 1) p4 -= 1; pf += (29 + 6 * r) / SRATE; if (pf >= 1) pf -= 1;
        fry = fry * .96 + w * .04;
        let src = (2 * p1 - 1) + .7 * (2 * p2 - 1) + .5 * (2 * p4 - 1) * (.4 + .6 * r);
        src *= .62 + .38 * Math.sin(TAU * pf + fry * 9) + fry * 1.5;
        if (o.shriek) src += o.shriek * Math.sin(TAU * p3 + 2 * Math.sin(TAU * p1));
        if (o.screech) { const si = o.screech * (1 + .22 * Math.sin(Math.PI * u * 1.7) - .12 * u + .015 * Math.sin(TAU * pf)) / SRATE; ps += si; if (ps >= 1) ps -= 1; pm += si * 1.5; if (pm >= 1) pm -= 1; y0 = Math.sin(TAU * ps + 1.2 * Math.sin(TAU * pm)) * (.5 + .5 * r); } else y0 = 0;
        br.run(w); src += br.bp * br.k * (.28 + .25 * r);
        F[0].run(src); F[1].run(src); F[2].run(src); F[3].run(src);
        let y = g0 * F[0].bp + g1 * F[1].bp + g2 * F[2].bp + g3 * F[3].bp + y0 * .35;
        y = Math.tanh(y * o.drive) / o.drive * 1.4;
        if (o.comb) { const dly = cm[(ci + 256 - o.comb) & 255]; y += dly * .55; cm[ci] = y; ci = (ci + 1) & 255; }
        if (o.elec) { pe += (o.elecF || 62) / SRATE; if (pe >= 1) pe -= 1; y *= 1 + o.elec * ((pe < .5 ? 1 : -1) * (.6 + .4 * fry * 8)); }   // the electric edge: buzzing ring modulation
        y += Math.sin(TAU * p2) * (o.sub || 0);
        y = air.run(y) * g;
        B.L[j] += y * gl; B.R[j] += y * gr;
      }
    }
  }
  // fire torrent (red) — layered noise bands with turbulence
  function fire(B, seg, who, o) {
    const [t0, t1] = seg, k0 = Math.max(0, B.idx(t0)), k1 = Math.min(B.n, B.idx(t1 + .2)), ns = new Noise(o.seed), nr = new Noise(o.seed + 1), lp = new SVF(), bp = new SVF(), hp = new SVF(), air = new SVF();
    lp.set(380, .8); bp.set(1100, .7); hp.set(3600, .7);
    for (let k = k0; k < k1; k += BL) {
      const t = B.tm(k), b = au(who + 'Breath', t), d = Math.min(au(who + 'FlameD', t), au(who + 'D', t)), pan = au(who + 'Pan', t) * .5, g = b * clamp(prox(d, 35) * 1.8, .1, 1.3) * o.g;
      const tu = .6 + .55 * vn(t * 11, o.seed) + .3 * vn(t * 31, o.seed + 1), [gl, gr] = pan2(pan); air.set(clamp(18000 * prox(d, 200), 1500, 18000), .7);
      const kk = Math.min(k1, k + BL);
      for (let j = k; j < kk; j++) { const w = ns.w(), w2 = nr.w(); lp.run(w); bp.run(w2); hp.run(w); let y = (lp.lp * 1.6 + bp.bp * bp.k * .9 * tu + hp.hp * .3) * g * tu; y = air.run(y); B.L[j] += y * gl * (1 + .15 * w2); B.R[j] += y * gr * (1 + .15 * w); }
    }
    crackle(B, t0, t1 + .5, t => 60 * au(who + 'Breath', t), t => au(who + 'Breath', t) * clamp(prox(Math.min(au(who + 'FlameD', t), au(who + 'D', t)), 35) * 1.8, 0, 1.2) * .45, { seed: o.seed + 5, f: 3000, q: 1 });
    const g = clamp(prox(Math.min(au(who + 'FlameD', t0 + .3), au(who + 'D', t0 + .3)), 35) * 1.8, .1, 1.2) * o.g / .55;
    nburst(B, t0 + .05, 1.2, { f0: 200, f1: 900, q: .7, mode: LP, g: .8 * g, att: .08, dec: .5, seed: o.seed + 7 }); thump(B, t0 + .1, 60, 30, .9, .45 * g, 0, .2, .05);
  }
  // golden lightning breath: electric hum (buzz harmonics with arcing jitter), dense zaps, sizzle
  function lightning(B, seg, who, o) {
    const [t0, t1] = seg, k0 = Math.max(0, B.idx(t0)), k1 = Math.min(B.n, B.idx(t1 + .25)), ns = new Noise(o.seed), bp = new SVF(), hs = new SVF(), air = new SVF(); hs.set(6500, .7);
    let p = 0, arc = 0;
    for (let k = k0; k < k1; k += BL) {
      const t = B.tm(k), b = au(who + 'Breath', t), d = Math.min(au(who + 'FlameD', t), au(who + 'D', t)), pan = au(who + 'Pan', t) * .5, g = b * clamp(prox(d, 35) * 1.8, .1, 1.3) * o.g, [gl, gr] = pan2(pan);
      bp.set(1400 + 900 * vn(t * 7, 3), 1.5); air.set(clamp(18000 * prox(d, 200), 1500, 18000), .7); const f = 98 * (1 + .04 * (vn(t * 13, 5) - .5)), kk = Math.min(k1, k + BL);
      for (let j = k; j < kk; j++) { const w = ns.w(); p += f / SRATE; if (p >= 1) p -= 1; arc = arc * .997 + (Math.abs(w) > .985 ? 1 : 0) * .4;
        const buzz = Math.tanh(4 * (sawB(p, f / SRATE) + .6 * Math.sin(TAU * 3 * p))) * (.55 + arc); bp.run(buzz + w * .3); hs.run(w);
        let y = (buzz * .25 + bp.bp * bp.k * .5 + hs.hp * .25 * (.4 + arc)) * g; y = air.run(y); B.L[j] += y * gl; B.R[j] += y * gr; }
    }
    crackle(B, t0, t1 + .4, t => 220 * sat(au(who + 'Breath', t) + .1), t => clamp(prox(Math.min(au(who + 'FlameD', t), au(who + 'D', t)), 35) * 1.8, 0, 1.2) * .55 * sat(au(who + 'Breath', t) * 1.5), { seed: o.seed + 3, f: 5500, q: 1.5, hp: 2000 });
    const r = rng(o.seed + 9); for (let t = t0; t < t1; t += .03) if (r() < .12) nburst(B, t, .06, { f0: 9000, f1: 2000, q: .6, mode: HP, g: .25 * au(who + 'Breath', t) * o.g, pan: r() * 1.4 - .7, att: .0005, dec: .012, seed: r() * 1e6 | 0 });
  }
  // body whoosh on close passes: relative speed of the nearest body point, its distance and side
  function bodyWhoosh(B, k, o) {
    const ns = new Noise(o.seed), f = new SVF(), lo = new SVF(), sc = new SVF(); lo.set(150, .8); sc.set(3200, 1.5);
    for (let i = 0; i < B.n; i += BL) { const t = B.tm(i), bd = au(k + 'BodyD', t), sp = au(k + 'Rel', t), vis = au(k + 'Vis', t);
      const w = vis * clamp((sp - 6) / 45, 0, 1.6) * Math.pow(14 / (14 + bd), 1.6), g = w * o.g, kk = Math.min(B.n, i + BL);
      if (g < 2e-4) { for (let j = i; j < kk; j++) ns.w(); continue; }
      f.set(200 + 2400 * Math.min(1, w * 1.4), .8); const [gl, gr] = pan2(au(k + 'BodyPan', t));
      for (let j = i; j < kk; j++) { const x = ns.w(); f.run(x); lo.run(x); sc.run(x); const y = (f.bp * f.k * .8 + lo.lp * 1.3 + sc.bp * sc.k * .12 * Math.sin(t * 90) ** 2) * g; B.L[j] += y * gl; B.R[j] += y * gr; } }
  }
  function jobDragons(out) {
    const Ro = new Buf(0, 90.5), Br = new Buf(20, 90.5), Wh = new Buf(0, 90.5); let s = 20000;
    const RED = { f0: 50, formants: [230, 540, 1100, 2300], famps: [1, .75, .45, .2], fq: [3, 4, 5, 6], drive: 2.2, sub: .25, g: 1.1, seed: 31 };
    const GOLD = { f0: 118, formants: [560, 1450, 2900, 4900], famps: [.8, 1, .65, .35], fq: [4, 6, 8, 9], drive: 3, sub: 0, shriek: .4, screech: 2600, comb: 61, elec: .35, elecF: 64, g: .78, gmin: .6, seed: 37 };
    for (const sg of segs('rRoar', .004)) roar(Ro, sg, 'r', RED);
    for (const sg of segs('gRoar', .004)) roar(Ro, sg, 'g', GOLD);
    mixTo(out, Ro, 1, .4, 'roar');
    for (const sg of segs('rBreath', .004)) fire(Br, sg, 'r', { g: .55, seed: s += 11 });
    for (const sg of segs('gBreath', .004)) lightning(Br, sg, 'g', { g: .5, seed: s += 11 });
    // the clash: where the breaths meet — a rising scream at the ring's centre
    { const d = EV.PT.ring ? EV.PT.ring.d : 60, pn = EV.PT.ring ? EV.PT.ring.pan : 0, gD = clamp(prox(d, 50) * 1.6, .25, 1), k0 = Br.idx(T.clash0), k1 = Br.idx(T.clash1 + .3), [gl, gr] = pan2(pn * .6); let a1 = 0, a2 = 0;
      for (let k = k0; k < k1; k++) { const t = Br.tm(k), u = sat((t - T.clash0) / (T.clash1 - T.clash0)), f = 180 * Math.pow(2, 2.6 * Math.pow(u, 1.3)); a1 += f / SRATE; a2 += f * 1.5 * 1.004 / SRATE;
        const e = (.2 + .8 * u * u) * sat((T.clash1 + .3 - t) / .3) * sat((t - T.clash0) / .2), y = (Math.sin(TAU * a1 + 1.4 * Math.sin(TAU * a2)) * .2) * e * gD; Br.L[k] += y * gl; Br.R[k] += y * gr; } }
    mixTo(out, Br, 1, .3, 'breath');
    bodyWhoosh(Wh, 'r', { g: .7, seed: 61 }); bodyWhoosh(Wh, 'g', { g: .6, seed: 62 });
    // fly-over at the key shot: the body passes overhead
    { const tf = T.fly, k0 = Wh.idx(tf - 1.3), k1 = Wh.idx(tf + 1.4), ns = new Noise(63), f = new SVF(), lo = new SVF(); lo.set(130, .8);
      for (let k = k0; k < k1; k += BL) { const t = Wh.tm(k), u = (t - tf), e = Math.exp(-u * u / (u < 0 ? .3 : .45)), [gl, gr] = pan2(au('rBodyPan', t)); f.set(300 + 2300 * e, .8); const kk = Math.min(k1, k + BL);
        for (let j = k; j < kk; j++) { const x = ns.w(); f.run(x); lo.run(x); const y = (f.bp * f.k * .9 + f.hp * .2 * e + lo.lp * 1.5) * e * .55; Wh.L[j] += y * gl; Wh.R[j] += y * gr; } } }
    // the Sky Window: rushing air through the rock, a hollow resonance, a low whum
    { const tw = T.window, k0 = Wh.idx(tw - .9), k1 = Wh.idx(tw + 1.2), ns = new Noise(64), f = new SVF(), cb = new Float32Array(2048); let ci = 0; const dl = Math.round(SRATE / 92);
      for (let k = k0; k < k1; k += BL) { const t = Wh.tm(k), u = t - tw, e = Math.exp(-u * u / (u < 0 ? .12 : .3)); f.set(250 + 2600 * e, .9); const kk = Math.min(k1, k + BL);
        for (let j = k; j < kk; j++) { const x = ns.w(); f.run(x); let y = f.bp * f.k * e; y += cb[(ci - dl + 2048) & 2047] * .7; cb[ci] = y; ci = (ci + 1) & 2047; const pn = clamp(u * 1.5, -1, 1); Wh.L[j] += y * .5 * (1 - pn * .6); Wh.R[j] += y * .5 * (1 + pn * .6); } }
      thump(Wh, tw - .03, 70, 35, 1, .35, 0, .1, .02); }
    mixTo(out, Wh, 1, .3, 'whoosh');
  }

  // ---- water events, thunder, the collision ------------------------------------
  function splash(B, sp, g0, o = {}) {
    const t = sp.t0, g = g0 * clamp(Math.pow(prox(sp.d, 40), .6) * 1.6, .35, 1.3), p = sp.pan * .7, sz = sp.size; let s = (t * 1000 | 0);
    nburst(B, t, .08, { f0: 9000, q: .5, mode: LP, g: g * .9, pan: p, att: .0005, dec: .03, seed: s++ });
    for (const q of [-.5, .5]) nburst(B, t, 2.4 * sz, { f0: 7000, f1: 350, q: .6, mode: LP, g: g * 1.1, pan: clamp(p + q, -1, 1), att: .003, dec: .6 * sz, seed: s++ });
    nburst(B, t + .02, 1.6 * sz, { f0: 6000, f1: 3000, q: .6, mode: HP, g: g * .45, pan: p, att: .01, dec: .4 * sz, seed: s++ });
    thump(B, t, 85, 24, 1.4 * sz, g * .9, p, .12, .004);
    // the column rises and falls back: dense spatter decaying, then streaming
    crackle(B, t + .25, t + 1.2 + 2.2 * sz, tt => 1400 * Math.exp(-(tt - t - .3) / (.9 * sz)), tt => g * .6 * Math.exp(-(tt - t - .3) / (1.1 * sz)), { seed: s++, f: 1800, q: .8, hp: 300 });
    nburst(B, t + .4, 2.5 * sz, { f0: 1400, f1: 600, q: .6, mode: LP, g: g * .35, pan: p, shape: u => sat(u * 4) * Math.pow(1 - u, 2), seed: s++ });
  }
  function jobEvents(out) {
    const B = new Buf(0, 90.5), U = new Buf(0, 90.5); let s = 40000;
    const sp = EV.spl;
    splash(B, sp[0], .9); splash(B, sp[1], 1.05); splash(B, sp[2], .8); splash(B, sp[3], .75);
    // the plunge: sub drop; the boiling, glowing water: steam sizzle and bubbles; under water until the burst
    thump(B, T.plunge, 70, 16, 3.4, 1.2, 0, .5, .004);
    crackle(B, T.plunge + .25, T.burst + 1.2, t => 900 * pulse(t, T.plunge + .25, T.burst + 1.2, .4, .8), t => .35 * pulse(t, T.plunge + .25, T.burst + 1.2, .4, .8), { seed: s++, f: 6500, q: .7, hp: 3000 });
    nburst(B, T.plunge + .2, T.burst - T.plunge + 1.2, { f0: 5500, f1: 4500, q: .6, mode: HP, g: .12, shape: u => sat(u * 5) * Math.pow(1 - u, .8), seed: s++ });
    nburst(U, T.plunge + .1, T.burst - T.plunge, { f0: 180, f1: 120, q: .7, mode: LP, g: .7, shape: u => sat(u * 8) * sat((1 - u) * 10) * (.7 + .3 * vn(u * 20, 5)), seed: s++ });
    { const r = rng(s++); for (let t = T.plunge + .1; t < T.burst; t += .02) if (r() < .35) { const k0 = U.idx(t), f0 = 180 + 600 * r(), g = .05 + .1 * r(), pn = r() * 1.6 - .8, [gl, gr] = pan2(pn), len = Math.ceil((.03 + .05 * r()) * SRATE); let ph = 0;
      for (let j = 0; j < len; j++) { const tt = j / SRATE; ph += f0 * (1 + 3 * tt / (len / SRATE)) / SRATE; const y = Math.sin(TAU * ph) * Math.sin(Math.PI * j / len) * g, k = k0 + j; if (k < U.n) { U.L[k] += y * gl; U.R[k] += y * gr; } } } }
    // thunder follows the storm (none during the face-off roars); the collision crack
    { const r = rng(s++); let t = 38.5; while (t < 74) { const st = au('storm', t); if (st > .3 && !(t > 45.2 && t < 47.2) && Math.abs(t - T.impact) > 1.2) thunder(B, t, { g: .25 + .55 * st * st, near: st > .9 ? .45 * r() : 0, pan: r() * 1.6 - .8, dur: 4 + 3 * r(), seed: r() * 1e6 | 0 }); t += lerp(7, 2.6, st) * (.7 + .6 * r()); } }
    const ip = EV.PT.impact || { d: 60, pan: 0 }, ig = clamp(prox(ip.d, 60) * 1.8, .6, 1.2);
    thunder(B, T.impact, { g: 1.3 * ig, near: 1, pan: ip.pan * .5, dur: 6.5, seed: 777 });
    for (const p of [-.7, .7]) nburst(B, T.impact, 2.6, { f0: 16000, f1: 1200, q: .5, mode: LP, g: 2.0 * ig, pan: p, att: .0008, dec: .9, seed: s++ });
    thump(B, T.impact, 80, 20, 4, 2.2 * ig, 0, .35, .003);
    // the silence ringing afterwards
    { const k0 = B.idx(T.impact + .1); let p1 = 0, p2 = 0; for (let j = 0; j < 4 * SRATE; j++) { const tt = j / SRATE, k = k0 + j; if (k >= B.n) break; p1 += 3150 / SRATE; p2 += 3870 / SRATE; const e = sat((tt - .1) / .4) * Math.exp(-tt / 1.6) * .012; B.L[k] += Math.sin(TAU * p1) * e; B.R[k] += Math.sin(TAU * p2) * e * .7; } }
    // the dragons streaming water after the bursts
    for (const [t, p] of [[T.burst, sp[2].pan], [T.burst + .3, sp[3].pan]]) crackle(B, t + .5, t + 3.5, tt => 300 * Math.exp(-(tt - t) / 1.2), tt => .3 * Math.exp(-(tt - t) / 1.2), { seed: s++, f: 1500, q: .8, hp: 400, width: .4 });
    mixTo(out, B, 1, .3, 'events'); mixTo(out, U, 1, .2, 'under');
  }

  // ---------------------------------------------------------------- groups (rendered in parallel)
  const GROUPS = [
    { bus: 'm', jobs: [jobPads, jobLow] },
    { bus: 'm', jobs: [jobStrings] },
    { bus: 'm', jobs: [jobLeads] },
    { bus: 'm', jobs: [jobPlucks] },
    { bus: 'm', jobs: [jobPerc] },
    { bus: 'm', jobs: [jobBrass] },
    { bus: 's', jobs: [jobAmb, jobBirds, jobChimes] },
    { bus: 's', jobs: [jobDragons] },
    { bus: 's', jobs: [jobEvents] },
  ];
  function stems(g, aut, ev, keep) {
    AUT = aut; EV = ev; AR = ev.AR; T = ev.T; KEEP = !!keep; TAGS = {}; MUSIC = GROUPS[g].bus === 'm'; makeSections();
    const out = { D: [new Float32Array(N), new Float32Array(N)], S: [new Float32Array(N), new Float32Array(N)] }, ms = {};
    for (const j of GROUPS[g].jobs) { const t0 = Date.now(); j(out); ms[j.name] = Date.now() - t0; }
    return { out, bus: GROUPS[g].bus, ms, tags: TAGS };
  }
  // ---------------------------------------------------------------- master
  // FDN reverb, 8 lines, Hadamard feedback, damping, input diffusion; circular (pre-rolls the end)
  function fdn(inL, inR, outL, outR, o) {
    const base = [1433, 1601, 1867, 2053, 2251, 2399, 2617, 2797].map(x => Math.round(x * o.size)), M = 8192, mask = M - 1;
    const lines = base.map(() => new Float32Array(M)), gains = base.map(l => Math.pow(10, -3 * l / (o.rt * SRATE))), lpS = new Float32Array(8), dmp = 1 - Math.exp(-TAU * o.damp / SRATE);
    const apL = [142, 107, 379, 277].map(l => ({ b: new Float32Array(512), l, i: 0 })), apR = [151, 113, 367, 293].map(l => ({ b: new Float32Array(512), l, i: 0 }));
    const pre = Math.round(o.pre * SRATE), preB = [new Float32Array(16384), new Float32Array(16384)]; let pi = 0, wi = 0;
    const hpL = new SVF(), hpR = new SVF(); hpL.set(o.hp || 140, .7); hpR.set(o.hp || 140, .7);
    const v = new Float32Array(8), s8 = 1 / Math.sqrt(8), PRE = 6 * SRATE;
    const ap = (A, x) => { const j = (A.i - A.l) & 511, d = A.b[j], y = -.7 * x + d; A.b[A.i] = x + .7 * y; A.i = (A.i + 1) & 511; return y; };
    for (let c = -PRE; c < N; c++) {
      const i = c < 0 ? c + N : c;
      let xl = inL[i], xr = inR[i]; hpL.run(xl); hpR.run(xr); xl = hpL.hp; xr = hpR.hp;
      preB[0][pi] = xl; preB[1][pi] = xr; const pj = (pi - pre) & 16383; xl = preB[0][pj]; xr = preB[1][pj]; pi = (pi + 1) & 16383;
      for (const A of apL) xl = ap(A, xl); for (const A of apR) xr = ap(A, xr);
      for (let k = 0; k < 8; k++) { const y = lines[k][(wi - base[k]) & mask]; lpS[k] += dmp * (y - lpS[k]); v[k] = lpS[k] * gains[k]; }
      // fast Walsh–Hadamard
      for (let h = 1; h < 8; h <<= 1) for (let a = 0; a < 8; a += h << 1) for (let b = a; b < a + h; b++) { const x = v[b], y = v[b + h]; v[b] = x + y; v[b + h] = x - y; }
      const oL = lpS[0] - lpS[2] + lpS[4] - lpS[6], oR = lpS[1] - lpS[3] + lpS[5] - lpS[7];
      for (let k = 0; k < 8; k++) lines[k][wi] = v[k] * s8 + (k & 1 ? xr : xl) * .35;
      wi = (wi + 1) & mask;
      if (c >= 0) { outL[i] += oL * o.g; outR[i] += oR * o.g; }
    }
  }
  // BS.1770 K-weighted integrated loudness (gated, 400 ms blocks / 75 % overlap)
  function kLoud(L, R, a = 0, b = L.length) {
    const bq = (b0, b1, b2, a1, a2) => ({ b0, b1, b2, a1, a2, x1: 0, x2: 0, y1: 0, y2: 0 });
    const mk = (fc, G, Q, hs) => { const A = Math.pow(10, G / 40), w0 = TAU * fc / SRATE, c = Math.cos(w0), al = Math.sin(w0) / (2 * Q); if (hs) { const sA = Math.sqrt(A), a0 = (A + 1) - (A - 1) * c + 2 * sA * al; return bq(A * ((A + 1) + (A - 1) * c + 2 * sA * al) / a0, -2 * A * ((A - 1) + (A + 1) * c) / a0, A * ((A + 1) + (A - 1) * c - 2 * sA * al) / a0, 2 * ((A - 1) - (A + 1) * c) / a0, ((A + 1) - (A - 1) * c - 2 * sA * al) / a0); } const a0 = 1 + al; return bq((1 + c) / 2 / a0, -(1 + c) / a0, (1 + c) / 2 / a0, -2 * c / a0, (1 - al) / a0); };
    const run = (f, x) => { const y = f.b0 * x + f.b1 * f.x1 + f.b2 * f.x2 - f.a1 * f.y1 - f.a2 * f.y2; f.x2 = f.x1; f.x1 = x; f.y2 = f.y1; f.y1 = y; return y; };
    const blk = Math.round(.1 * SRATE), nb = Math.floor((b - a) / blk), e = new Float64Array(nb);
    for (const X of [L, R]) { const h = mk(1681.974450955533, 3.999843853973347, .7071752369554196, true), p = mk(38.13547087602444, 0, .5003270373238773, false); for (let bi = 0; bi < nb; bi++) { let s = 0; for (let i = a + bi * blk, ie = i + blk; i < ie; i++) { const y = run(p, run(h, X[i])); s += y * y; } e[bi] += s / blk; } }
    const gates = []; for (let i = 0; i + 4 <= nb; i++) { const z = (e[i] + e[i + 1] + e[i + 2] + e[i + 3]) / 4; gates.push(z); }
    const L_ = z => -0.691 + 10 * Math.log10(z + 1e-20);
    const g1 = gates.filter(z => L_(z) > -70); if (!g1.length) return -99;
    const m1 = g1.reduce((s, z) => s + z, 0) / g1.length, thr = L_(m1) - 10, g2 = g1.filter(z => L_(z) > thr);
    return L_(g2.reduce((s, z) => s + z, 0) / g2.length);
  }
  function master(parts, keepBuses, aut, ev) {
    AUT = aut; EV = ev; AR = ev.AR; T = ev.T; makeSections();
    const t0 = Date.now(), mDL = new Float32Array(N), mDR = new Float32Array(N), mSL = new Float32Array(N), mSR = new Float32Array(N), sDL = new Float32Array(N), sDR = new Float32Array(N), sSL = new Float32Array(N), sSR = new Float32Array(N);
    for (const p of parts) { const m = p.bus === 'm', DL = m ? mDL : sDL, DR = m ? mDR : sDR, SL = m ? mSL : sSL, SR_ = m ? mSR : sSR, a = p.D[0], b = p.D[1], c = p.S[0], d = p.S[1]; for (let i = 0; i < N; i++) { DL[i] += a[i]; DR[i] += b[i]; SL[i] += c[i]; SR_[i] += d[i]; } }
    const blockGain = (arrs, fn) => { for (let i = 0; i < N; i += 64) { const g = fn(i / SRATE), e = Math.min(N, i + 64); if (g === 1) continue; for (const X of arrs) for (let j = i; j < e; j++) X[j] *= g; } };
    // the music fades with the picture BEFORE the reverb, so the hall rings on across the loop seam into the stillness of t = 0
    const fe = t => 1 - smooth(T.end - 1, T.end - .05, t);
    blockGain([mDL, mDR, mSL, mSR], fe);
    // music hall; it breathes in for the Sky Window hush
    const mRL = new Float32Array(N), mRR = new Float32Array(N); fdn(mSL, mSR, mRL, mRR, { size: 1.3, rt: 3.0, damp: 6500, pre: .03, g: .2, hp: 160 });
    blockGain([mRL, mRR], curve([[0, 1], [T.window - .12, 1], [T.window, .25], [T.window + .5, .25], [T.window + .9, 1], [90, 1]]));
    // the valley: longer, darker, later
    const sRL = new Float32Array(N), sRR = new Float32Array(N); fdn(sSL, sSR, sRL, sRR, { size: 1.8, rt: 4.4, damp: 4000, pre: .07, g: .17, hp: 120 });
    const tRev = Date.now() - t0;
    const L = new Float32Array(N), R = new Float32Array(N);
    // music ducks under the dragons' voices (curve x proximity, from the film)
    const loudOf = (k, t) => au(k + 'Roar', t) * clamp(Math.pow(prox(au(k + 'D', t), 45), .7) * 1.7, .3, 1.25) + .5 * au(k + 'Breath', t) * clamp(prox(Math.min(au(k + 'FlameD', t), au(k + 'D', t)), 35) * 1.8, .1, 1.3);
    const duck = t => 1 - .38 * clamp(Math.max(loudOf('r', t), loudOf('g', t)), 0, 1);
    const MG = curve([[0, 1], [S.chase - .3, 1], [S.chase + .2, 1.35], [T.rival - .5, 1.35], [T.rival + .5, 1], [90, 1]]);
    const SG = curve([[0, .6], [.7, 1], [T.impact - .05, 1], [T.impact, 2.8], [T.impact + 1.5, 1.6], [T.impact + 3, 1], [T.end - .8, 1], [90, .6]]);
    for (let i = 0; i < N; i += 64) { const t = i / SRATE, mg = MG(t) * duck(t), sg = SG(t); for (let j = i; j < Math.min(N, i + 64); j++) { L[j] = (mDL[j] + mRL[j]) * mg + (sDL[j] + sRL[j]) * sg; R[j] = (mDR[j] + mRR[j]) * mg + (sDR[j] + sRR[j]) * sg; } }
    let buses = null; if (keepBuses) { const mus = new Float32Array(N), sfx = new Float32Array(N); for (let i = 0; i < N; i++) { mus[i] = (mDL[i] + mDR[i]) * .5; sfx[i] = (sDL[i] + sDR[i]) * .5; } buses = { mus, sfx }; }
    // under the lake: everything muffled from just after the plunge until the burst
    { const ta = T.plunge + .05, tb = T.burst + .2, fc = curve([[0, 20000], [T.plunge + .12, 20000], [T.plunge + .45, 380], [T.burst - .06, 480], [T.burst + .08, 20000], [90, 20000]]);
      for (const X of [L, R]) { const f = new SVF(); for (let i = Math.round(ta * SRATE); i < Math.min(N, Math.round(tb * SRATE)); i += 32) { const t = i / SRATE, c = fc(t), w = smooth(ta, ta + .03, t) * (1 - smooth(tb - .03, tb, t)), mk = 1 + .4 * (1 - c / 20000); f.set(c, .9);
        for (let j = i; j < Math.min(N, i + 32); j++) { const x = X[j]; X[j] = x + (f.run(x) * mk - x) * w; } } } }
    // a little air: +3 dB shelf above ~6 kHz
    for (const X of [L, R]) { const f = new SVF(); f.set(6000, .6); for (let i = 0; i < N; i++) { f.run(X[i]); X[i] += .4 * f.hp; } }
    // DC / subsonic high-pass 20 Hz (2nd order, circular pre-roll)
    for (const X of [L, R]) { const f = new SVF(); f.set(20, .707); for (let i = N - SRATE; i < N; i++) f.run(X[i]); for (let i = 0; i < N; i++) { f.run(X[i]); X[i] = f.hp; } }
    // pre-gain to a known level, then glue compression (stereo-linked RMS, 2:1 above -12 dBFS, soft knee)
    let lu = kLoud(L, R), g0 = dB(-17.5 - lu);
    { let env = 0; const aA = Math.exp(-1 / (.012 * SRATE)), aR = Math.exp(-1 / (.25 * SRATE)), thr = -12, ratio = 2, knee = 6; let gs = 1;
      for (let i = 0; i < N; i++) { const l = L[i] * g0, r = R[i] * g0, p = (l * l + r * r) * .5; env = p > env ? aA * env + (1 - aA) * p : aR * env + (1 - aR) * p;
        if (!(i & 15)) { const x = 10 * Math.log10(env + 1e-12), over = x - thr; let gr = 0; if (over > knee / 2) gr = over * (1 - 1 / ratio); else if (over > -knee / 2) gr = (over + knee / 2) * (over + knee / 2) / (2 * knee) * (1 - 1 / ratio); gs = dB(-gr); }
        L[i] = l * gs; R[i] = r * gs; } }
    // loudness normalise + look-ahead limiter (-1.2 dBFS sample peak), iterate for -16 LUFS
    const ceil = dB(-1.2), W = 96, Lo = new Float32Array(N), Ro = new Float32Array(N), need = new Float32Array(N), mn = new Float32Array(N), dq = new Int32Array(N);
    let gain = dB(-16 - kLoud(L, R)), lout = 0;
    for (let it = 0; it < 4; it++) {
      for (let i = 0; i < N; i++) { const p = Math.max(Math.abs(L[i]), Math.abs(R[i])) * gain; need[i] = p > ceil ? ceil / p : 1; }
      let h = 0, tl = 0;
      for (let i = N - 1; i >= 0; i--) { const v = need[i]; while (tl > h && need[dq[tl - 1]] >= v) tl--; dq[tl++] = i; while (dq[h] > i + W) h++; mn[i] = need[dq[h]]; }
      let acc = W, g = 1; const rel = 1 - Math.exp(-1 / (.12 * SRATE));
      for (let i = 0; i < N; i++) { acc += mn[i] - (i >= W ? mn[i - W] : 1); const b = Math.min(1, acc / W); g = b < g ? b : g + (b - g) * rel; const s = gain * g; Lo[i] = L[i] * s; Ro[i] = R[i] * s; }
      for (let i = 0; i < N; i++) { if (Lo[i] > ceil) Lo[i] = ceil; else if (Lo[i] < -ceil) Lo[i] = -ceil; if (Ro[i] > ceil) Ro[i] = ceil; else if (Ro[i] < -ceil) Ro[i] = -ceil; }
      lout = kLoud(Lo, Ro); if (Math.abs(lout + 16) < .15) break; gain *= dB(-16 - lout);
    }
    return { L: Lo, R: Ro, info: { lufs: lout, preLufs: lu, msMaster: Date.now() - t0, msReverb: tRev }, buses };
  }
  return { stems, master, N, SRATE, NG: GROUPS.length };
}

// ---------------------------------------------------------------- orchestration (main thread)
function render() {
  const t0 = performance.now(), { aut, ev } = gather(), tGather = performance.now() - t0, NG = 9;
  const src = '(' + DSP.toString() + ')', boot = `const api = ${src}();\nself.onmessage = e => { const m = e.data; if (m.cmd === 'stems') { const r = api.stems(m.g, m.aut, m.ev, m.keep); self.postMessage({ g: m.g, bus: r.bus, ms: r.ms, D: r.out.D, S: r.out.S, tags: r.tags }, [r.out.D[0].buffer, r.out.D[1].buffer, r.out.S[0].buffer, r.out.S[1].buffer].concat(Object.values(r.tags).map(x => x.buffer))); } else if (m.cmd === 'master') { const r = api.master(m.parts, m.keep, m.aut, m.ev); const tr = [r.L.buffer, r.R.buffer]; if (r.buses) tr.push(r.buses.mus.buffer, r.buses.sfx.buffer); self.postMessage({ L: r.L, R: r.R, info: r.info, buses: r.buses }, tr); } };`;
  let url = null; try { url = URL.createObjectURL(new Blob([boot], { type: 'text/javascript' })); } catch (e) { url = null; }
  const keep = K.SHOT;
  const finish = (r, msStems) => {
    const info = Object.assign({ msGather: Math.round(tGather), msStems, msTotal: Math.round(performance.now() - t0), sr: 44100 }, r.info);
    audio.mix = { L: r.L, R: r.R, sr: 44100, buses: r.buses, tags: r.tags, events: ev, aut: keep ? aut : null }; audio.info = info; return audio.mix;
  };
  const viaWorkers = () => new Promise((res, rej) => {
    const ws = [], parts = [], msStems = {}, tags = {}; let done = 0;
    for (let g = 0; g < NG; g++) {
      const w = new Worker(url); ws.push(w); w.onerror = e => rej(e.message || e);
      w.onmessage = e => { const m = e.data; parts[m.g] = { bus: m.bus, D: m.D, S: m.S }; Object.assign(msStems, m.ms); Object.assign(tags, m.tags); if (g) w.terminate(); if (++done === NG) {
        const tS = Math.round(performance.now() - t0), mw = ws[0];
        mw.onmessage = e2 => { mw.terminate(); res(finish(Object.assign(e2.data, { tags }), Object.assign(msStems, { wallStems: tS }))); };
        const tr = []; for (const p of parts) tr.push(p.D[0].buffer, p.D[1].buffer, p.S[0].buffer, p.S[1].buffer);
        mw.postMessage({ cmd: 'master', parts, keep, aut, ev }, tr);
      } };
      w.postMessage({ cmd: 'stems', g, aut, ev, keep });
    }
  });
  const inline = () => new Promise(res => setTimeout(() => { const api = DSP(), parts = [], ms = {}, tg = {}; for (let g = 0; g < api.NG; g++) { const r = api.stems(g, aut, ev, keep); parts.push({ bus: r.bus, D: r.out.D, S: r.out.S }); Object.assign(ms, r.ms); Object.assign(tg, r.tags); } res(finish(Object.assign(api.master(parts, keep, aut, ev), { tags: tg }), ms)); }, 50));
  return (url ? viaWorkers().catch(e => { console.warn('audio worker failed, rendering inline', e); return inline(); }) : inline());
}

// ---------------------------------------------------------------- playback, locked to the picture
let ctx = null, out = null, buffer = null, src = null, srcG = null, startCtx = 0, startOff = 0, muted = false, lastT = 0, lastPlay = false, restarts = 0;
const DUR = K.DUR, wrap = x => ((x % DUR) + DUR) % DUR;
function ensureBuffer() { if (buffer || !audio.mix || !ctx) return !!buffer; const m = audio.mix; buffer = ctx.createBuffer(2, m.L.length, m.sr); buffer.copyToChannel(m.L, 0); buffer.copyToChannel(m.R, 1); return true; }
function stopSrc(fade) { if (!src) return; const now = ctx.currentTime, g = srcG.gain, s = src; g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0, now + fade); try { s.stop(now + fade + .02); } catch (e) { /* already stopped */ } src = null; srcG = null; }
function startSrc(t) {
  stopSrc(.03); const now = ctx.currentTime, s = ctx.createBufferSource(), g = ctx.createGain();
  s.buffer = buffer; s.loop = true; s.loopStart = 0; s.loopEnd = DUR; g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(1, now + .03);
  s.connect(g); g.connect(out); s.start(now, wrap(t)); src = s; srcG = g; startCtx = now; startOff = t; restarts++;
}
function sync(t, playing, hard) {
  lastT = t; lastPlay = playing;
  if (!ctx || ctx.state !== 'running' || !ensureBuffer()) return;
  if (!playing) { stopSrc(.05); return; }
  if (!src) { startSrc(t); return; }
  let d = wrap(startOff + (ctx.currentTime - startCtx)) - t; if (d > DUR / 2) d -= DUR; if (d < -DUR / 2) d += DUR;
  if (Math.abs(d) > (hard ? .05 : .08)) startSrc(t);
}
function unlock() {
  if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; ctx = new AC({ latencyHint: 'interactive' }); out = ctx.createGain(); out.gain.value = muted ? 0 : 1; out.connect(ctx.destination); }
  if (ctx.state !== 'running') ctx.resume().then(() => sync(lastT, lastPlay, true)).catch(() => {});
}
audio.state = () => ({ ctx: ctx ? ctx.state : 'none', ready: !!audio.mix, playing: !!src, pos: src ? wrap(startOff + (ctx.currentTime - startCtx)) : null, filmT: lastT, muted, restarts });
function toggleMute() { muted = !muted; if (ctx && out) { const now = ctx.currentTime; out.gain.cancelScheduledValues(now); out.gain.setValueAtTime(out.gain.value, now); out.gain.linearRampToValueAtTime(muted ? 0 : 1, now + .08); } }

K.reg('audio', {
  init() {
    if (K.SHOT && !K.q.has('audio')) return;      // capture mode: silent, zero cost
    audio.unlock = unlock; audio.sync = sync; audio.toggleMute = toggleMute;
    audio.ready = render().then(m => { if (lastPlay) sync(lastT, lastPlay, true); return m; }).catch(e => { K.fail('audio.render', e); throw e; });
  },
  update() {},
});

})(window.K=window.K||{},window.THREE);
//# sourceURL=src/85_audio.js

(function(K,THREE){'use strict';
// ============================================================================
// 90_main — boot, clock, render loop, adaptive resolution, controls, debug API.
// URL: ?t=42 freeze at a time · ?cam=x,y,z,tx,ty,tz,fov free camera · ?nopost · ?scale=1
// ============================================================================
const q = K.q, R = K.renderer;
K.debug = { cam: q.has('cam') ? q.get('cam').split(',').map(Number) : null, fixedT: q.has('t') ? +q.get('t') : null, ms: {} };
const only = q.has('only') ? q.get('only').split(',') : null;
const mods = K.mods.filter(m => !only || only.includes(m.name));

// ---- init every module; one failing module must not stop the film
for (const m of mods) { const t0 = performance.now(); try { m.init && m.init(); m.ok = true; } catch (e) { m.ok = false; K.fail(m.name + '.init', e); } K.debug.ms[m.name] = Math.round(performance.now() - t0); }

// ---- sizing / adaptive resolution
let scale = q.has('scale') ? +q.get('scale') : Math.min(window.devicePixelRatio || 1, 2), autoScale = !q.has('scale') && !K.SHOT && !window.__FILM__;   // connect-ai-three: fixed size while filming
const MAXPX = 3.7e6;
function resize() {
  const w = window.innerWidth, h = window.innerHeight; let s = scale; if (w * h * s * s > MAXPX) s = Math.sqrt(MAXPX / (w * h));
  R.setPixelRatio(1); R.setSize(Math.round(w * s), Math.round(h * s), false);
  const sz = R.getDrawingBufferSize(new THREE.Vector2()); K.camera.aspect = sz.x / sz.y; K.camera.updateProjectionMatrix(); K.post.resize(sz.x, sz.y);
}
window.addEventListener('resize', resize); resize();
try { K.film.frame(K.film.T.key); K.applyEnv(0); K.makeEnvMap(); } catch (e) { K.fail('envmap', e); }

// ---- one frame at film time t
const elBar = document.getElementById('bar');
let envKey = '0:0';
function frame(t) {
  const F = K.film.frame(t);
  K.applyEnv(F.t);
  for (const m of mods) if (m.ok && m.update) { try { m.update(F); } catch (e) { m.errs = (m.errs || 0) + 1; if (m.errs <= 2) K.fail(m.name + '.update', e); if (m.errs > 30) m.ok = false; } }
  K.film.late && K.film.late(F);
  { const e = K.env, ek = Math.round(e.storm * 10) + ':' + Math.round(e.dusk * 10); if (ek !== envKey) { envKey = ek; try { K.makeEnvMap(); } catch (err) { K.fail('envmap', err); } } }   // sky lighting follows the weather
  try { K.post.render(F); } catch (e) { K.fail('post', e); }
  elBar.style.width = (F.t / K.DUR * 100) + '%';
}
K.debug.renderAt = t => { frame(t); return K.errors.slice(); };
K.debug.bench = (t, n = 20) => { const gl = R.getContext(), px = new Uint8Array(4), sync = () => { R.setRenderTarget(null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }; frame(t); sync(); const t0 = performance.now(); for (let i = 0; i < n; i++) frame(t + i * .016); sync(); return (performance.now() - t0) / n; };

// ---- clock
let playing = !K.SHOT, filmT = K.debug.fixedT ?? 0, last = performance.now(), acc = 0, accN = 0, hintShown = false;
const seek = t => { filmT = ((t % K.DUR) + K.DUR) % K.DUR; K.audio && K.audio.sync && K.audio.sync(filmT, playing, true); };
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(.1, (now - last) / 1000); last = now;
  // connect-ai-three: while the kit films the page, ?start=<seconds> holds the film there until its frame clock starts
  if (window.__FILM__ && q.has('start') && !(window.__film && window.__film.now > 0)) filmT = +q.get('start');
  else if (playing && K.debug.fixedT == null) { filmT += dt; if (filmT >= K.DUR) { filmT -= K.DUR; K.audio && K.audio.sync && K.audio.sync(filmT, playing, true); } }
  frame(filmT);
  K.audio && K.audio.sync && K.audio.sync(filmT, playing && K.debug.fixedT == null, false);
  if (autoScale && playing) { acc += dt; accN++; if (accN >= 40) { const a = acc / accN; acc = accN = 0; const maxS = Math.min(window.devicePixelRatio || 1, 2); if (a > 1 / 48 && scale > .5) { scale = Math.max(.5, scale * .88); resize(); } else if (a < 1 / 58 && scale < maxS) { scale = Math.min(maxS, scale * 1.05); resize(); } } }
}
// warm-up: render one frame of every kind of scene behind the loading screen so no shader compiles mid-film
if (!K.SHOT && !q.has('nowarm')) { try { for (const t of [K.film.T.key]) frame(t); } catch (e) { K.fail('warmup', e); } K.errors.length = 0; }
if (!K.SHOT) {
  const unlock = () => { K.audio && K.audio.unlock && K.audio.unlock(); document.getElementById('hint').style.opacity = 0; };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', e => {
    if (e.code === 'Space') { playing = !playing; document.body.classList.toggle('paused', !playing); unlock(); e.preventDefault(); }
    else if (e.code === 'ArrowRight') seek(filmT + 5); else if (e.code === 'ArrowLeft') seek(filmT - 5);
    else if (e.code === 'KeyM') { unlock(); K.audio && K.audio.toggleMute && K.audio.toggleMute(); }
    else if (e.code === 'KeyR') seek(0);
  });
  setTimeout(() => { if (!hintShown) { hintShown = true; const h = document.getElementById('hint'); h.style.opacity = .85; setTimeout(() => h.style.opacity = 0, 7000); } }, 1500);
  requestAnimationFrame(loop);
} else frame(filmT);
const ld = document.getElementById('load'); if (K.SHOT) ld.remove(); else { ld.style.opacity = 0; setTimeout(() => ld.remove(), 1300); }
if (q.has('dbg')) document.body.classList.add('dbg');
K.ready = true;

})(window.K=window.K||{},window.THREE);
//# sourceURL=src/90_main.js
