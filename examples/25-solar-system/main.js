// The solar system: the Sun and eight planets on their real (Keplerian) orbits, sped up, with an HUD to set the time.
//
// Written for connect-ai-three from a prompt that cb_doge shared publicly on X (2026-07-08):
//   "Make a beautiful simulation of the universe and solar system. should be sped up with adjustable time, realistic
//    motion, orbits, stars. use threejs. Make the HUD well styled and conform to modern design principles."
// Their code was never published; this is our own. Every surface, the star field, the Milky Way, the corona and the
// rings are drawn by shaders at run time: no textures, models or sounds ship with it.
//
// Distances are squeezed (r^0.55) and the planets are drawn larger than life so all of them fit in one view; the
// orbits themselves (size ratio, eccentricity, tilt, where each planet is on a date, how fast it moves) follow the
// J2000 orbital elements, solved with Kepler's equation every frame.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const FILM = !!window.__FILM__;          // the kit is filming this page: no HUD, a scripted camera move
const FILM_SECONDS = 10;                 // keep in step with "film.seconds" in example.json
if (FILM) document.body.classList.add('film');

// ---------------------------------------------------------------- a small seeded random (the same sky every time)
let seed = 20261128;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

// ---------------------------------------------------------------- renderer, scene, camera
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.05, 6000);
camera.position.set(8, 46, 88);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 1.5;
controls.maxDistance = 420;
controls.enabled = !FILM;

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.6, 0.5, 0.86);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// a tall screen keeps the same sideways view as a square one, so the whole system still fits
function fitFov() {
  camera.aspect = innerWidth / innerHeight;
  const base = 40;
  camera.fov = camera.aspect >= 1 ? base : THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(base / 2)) / camera.aspect));
  camera.updateProjectionMatrix();
}
fitFov();
addEventListener('resize', () => {
  fitFov();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------- shared GLSL: value noise and fbm (our own)
const NOISE = /* glsl */`
float h3(vec3 p) { p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++) { s += a * vnoise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s / 0.984; }
`;
const VERT = /* glsl */`
varying vec3 vObj; varying vec3 vNw; varying vec3 vPw;
void main() {
  vObj = position;
  vNw = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vPw = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

// ---------------------------------------------------------------- the sky: stars and a faint Milky Way
{
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 64, 32), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: /* glsl */`varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: NOISE + /* glsl */`
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float b = dot(d, normalize(vec3(0.35, 0.86, 0.36)));          // distance from the galactic plane
        float band = exp(-b * b * 16.0);
        float cloud = fbm(d * 5.0), dust = fbm(d * 13.0 + 4.0);
        vec3 c = mix(vec3(0.10, 0.13, 0.30), vec3(0.42, 0.33, 0.26), smoothstep(0.35, 0.75, cloud));
        c *= band * (0.35 + 1.1 * cloud) * (1.0 - 0.75 * smoothstep(0.48, 0.68, dust) * band);
        c += vec3(0.006, 0.008, 0.016);
        gl_FragColor = vec4(c * 0.42, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  sky.renderOrder = -2;
  scene.add(sky);

  const N = 16000, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), phase = new Float32Array(N);
  const tints = [[0.62, 0.72, 1.0], [0.85, 0.9, 1.0], [1.0, 1.0, 1.0], [1.0, 0.93, 0.8], [1.0, 0.78, 0.6]];
  const v = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    v.set(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1);
    if (v.lengthSq() > 1 || v.lengthSq() < 1e-4) { i--; continue; }
    v.normalize();
    // more stars along the Milky Way
    const band = Math.abs(v.dot(new THREE.Vector3(0.35, 0.86, 0.36).normalize()));
    if (band > 0.35 && rnd() < 0.45) { i--; continue; }
    v.multiplyScalar(2400);
    pos.set([v.x, v.y, v.z], i * 3);
    const t = tints[Math.floor(rnd() * tints.length)];
    const bright = Math.pow(rnd(), 3.2);
    col.set([t[0], t[1], t[2]], i * 3);
    size[i] = 0.8 + bright * 3.4;
    phase[i] = rnd() * 6.283;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('size', new THREE.BufferAttribute(size, 1));
  g.setAttribute('phase', new THREE.BufferAttribute(phase, 1));
  const stars = new THREE.Points(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPx: { value: renderer.getPixelRatio() } },
    vertexShader: /* glsl */`
      attribute float size; attribute float phase; attribute vec3 color;
      uniform float uTime, uPx; varying vec3 vCol; varying float vTw;
      void main() {
        vCol = color; vTw = 0.75 + 0.25 * sin(uTime * (1.3 + phase * 0.4) + phase * 7.0);
        gl_PointSize = size * uPx;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vCol; varying float vTw;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = exp(-d * d * 4.0);
        gl_FragColor = vec4(vCol * a * vTw * 1.4, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  stars.renderOrder = -1;
  stars.frustumCulled = false;
  scene.add(stars);
  scene.userData.stars = stars;
}

// ---------------------------------------------------------------- the Sun: boiling surface, corona, light
const SUN_R = 5;
const sunMat = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 } },
  vertexShader: VERT,
  fragmentShader: NOISE + /* glsl */`
    uniform float uTime; varying vec3 vObj; varying vec3 vNw; varying vec3 vPw;
    void main() {
      vec3 n = normalize(vObj);
      float f = fbm(n * 4.0 + vec3(0.0, uTime * 0.04, uTime * 0.02));
      float g = fbm(n * 16.0 + vec3(uTime * 0.09, 0.0, -uTime * 0.05) + f * 2.0);
      float mu = max(dot(normalize(vNw), normalize(cameraPosition - vPw)), 0.0);
      vec3 c = mix(vec3(1.0, 0.32, 0.04), vec3(1.0, 0.78, 0.36), smoothstep(0.25, 0.75, f));
      c = mix(c, vec3(1.0, 0.96, 0.82), smoothstep(0.5, 0.82, g) * 0.7);
      c *= 0.55 + 0.75 * pow(mu, 0.45);                                 // limb darkening
      gl_FragColor = vec4(c * 3.2, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});
const sun = new THREE.Mesh(new THREE.SphereGeometry(SUN_R, 96, 64), sunMat);
scene.add(sun);
const corona = new THREE.Mesh(new THREE.PlaneGeometry(SUN_R * 7.2, SUN_R * 7.2), new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uTime: { value: 0 } },
  vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: NOISE + /* glsl */`
    uniform float uTime; varying vec2 vUv;
    void main() {
      vec2 p = vUv * 2.0 - 1.0;
      float r = length(p), a = atan(p.y, p.x);
      float e = max(r - 0.27, 0.0);
      float rays = fbm(vec3(cos(a) * 2.5, sin(a) * 2.5, uTime * 0.06 + r * 1.5));
      float glow = 1.0 * exp(-e * 16.0) + 0.32 * exp(-e * 5.0) * (0.45 + 1.1 * rays) + 0.05 * exp(-e * 2.2);
      glow *= smoothstep(1.0, 0.6, r);
      vec3 c = mix(vec3(1.0, 0.45, 0.12), vec3(1.0, 0.82, 0.55), exp(-e * 6.0)) * glow;
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
}));
scene.add(corona);
scene.add(new THREE.PointLight(0xfff1dc, 3, 0, 0));

// ---------------------------------------------------------------- planets
// a: semi-major axis (AU), e: eccentricity, i: inclination, node: longitude of the ascending node, peri: longitude of
// perihelion, L: mean longitude at J2000 (degrees), P: orbital period (days), R: drawn radius, tilt: axial tilt,
// day: rotation period (hours, negative = backwards). Elements: J2000 mean values.
const PLANETS = [
  { name: 'Mercury', a: 0.387, e: 0.2056, i: 7.00, node: 48.33, peri: 77.46, L: 252.25, P: 87.97, R: 0.34, tilt: 0.03, day: 1407.6, type: 0, c: ['#8b8580', '#c9c2b8', '#5e5853'] },
  { name: 'Venus', a: 0.723, e: 0.0068, i: 3.39, node: 76.68, peri: 131.53, L: 181.98, P: 224.70, R: 0.66, tilt: 177.4, day: -5832.5, type: 1, c: ['#d9b77a', '#f4e3bb', '#c99a55'], atmo: ['#ffd9a0', 2.0, 1.2] },
  { name: 'Earth', a: 1.0, e: 0.0167, i: 0.0, node: 0, peri: 102.94, L: 100.46, P: 365.256, R: 0.70, tilt: 23.44, day: 23.93, type: 2, c: ['#1d4f8f', '#3c7a3a', '#c8b48a'], atmo: ['#5aa2ff', 2.6, 1.6] },
  { name: 'Mars', a: 1.524, e: 0.0934, i: 1.85, node: 49.56, peri: 336.04, L: 355.45, P: 686.98, R: 0.48, tilt: 25.19, day: 24.62, type: 3, c: ['#8a3b1e', '#c1643a', '#5a2a1a'], atmo: ['#ff9a6a', 3.0, 0.55] },
  { name: 'Jupiter', a: 5.203, e: 0.0484, i: 1.30, node: 100.47, peri: 14.75, L: 34.40, P: 4332.6, R: 2.30, tilt: 3.13, day: 9.93, type: 4, c: ['#c9a27c', '#efe1c8', '#9b6a46'], atmo: ['#ffe2bc', 3.2, 0.6] },
  { name: 'Saturn', a: 9.537, e: 0.0539, i: 2.49, node: 113.66, peri: 92.43, L: 49.94, P: 10759.2, R: 1.95, tilt: 26.73, day: 10.66, type: 5, c: ['#d6bf8e', '#f1e4c2', '#b39462'], atmo: ['#ffe9c0', 3.2, 0.55], rings: true },
  { name: 'Uranus', a: 19.19, e: 0.0473, i: 0.77, node: 74.02, peri: 170.96, L: 313.23, P: 30688.5, R: 1.20, tilt: 97.77, day: -17.24, type: 6, c: ['#9fd8de', '#c4eef0', '#7fc3cc'], atmo: ['#b8f4ff', 2.6, 0.9] },
  { name: 'Neptune', a: 30.07, e: 0.0086, i: 1.77, node: 131.78, peri: 44.97, L: 304.88, P: 60182, R: 1.16, tilt: 28.32, day: 16.11, type: 7, c: ['#2f5fd0', '#5d8ef0', '#1f3c94'], atmo: ['#7fa8ff', 2.6, 1.0] },
];
const visualA = (a) => 9.5 * Math.pow(a, 0.55) + 4.5;          // squeezed distance, keeps the order and the gaps readable
const D2R = Math.PI / 180;

const planetFrag = NOISE + /* glsl */`
  uniform int uType; uniform vec3 uC1, uC2, uC3; uniform float uTime, uSeed;
  varying vec3 vObj; varying vec3 vNw; varying vec3 vPw;
  void main() {
    vec3 n = normalize(vObj), N = normalize(vNw), L = normalize(-vPw), V = normalize(cameraPosition - vPw);
    float ndl = dot(N, L);
    vec3 col; float spec = 0.0, night = 0.0;
    if (uType == 0) {                                    // cratered rock
      float f = fbm(n * 3.5 + uSeed), c = fbm(n * 11.0 + uSeed * 2.0), k = fbm(n * 26.0);
      col = mix(uC3, uC2, f) * (0.7 + 0.55 * smoothstep(0.3, 0.75, c)) * (0.85 + 0.3 * k);
    } else if (uType == 1) {                             // Venus: thick swirling clouds
      float w = fbm(n * 2.5 + uSeed);
      float f = fbm(vec3(n.x * 2.0, n.y * 6.0 + w * 2.5, n.z * 2.0) + vec3(uTime * 0.01, 0.0, 0.0));
      col = mix(uC3, uC2, smoothstep(0.2, 0.85, f));
    } else if (uType == 2) {                             // Earth: oceans, land, ice, clouds, night lights
      float h = fbm(n * 2.1 + uSeed) * 0.8 + 0.2 * fbm(n * 8.0);
      float land = smoothstep(0.52, 0.545, h);
      float lat = abs(n.y);
      vec3 ocean = mix(vec3(0.01, 0.05, 0.16), vec3(0.03, 0.16, 0.32), smoothstep(0.38, 0.52, h));
      vec3 green = mix(vec3(0.10, 0.24, 0.07), vec3(0.20, 0.30, 0.10), fbm(n * 14.0));
      vec3 desert = vec3(0.52, 0.42, 0.26);
      vec3 ground = mix(green, desert, smoothstep(0.55, 0.7, fbm(n * 4.0 + 7.0)) * smoothstep(0.75, 0.2, lat));
      ground = mix(ground, vec3(0.35, 0.3, 0.25), smoothstep(0.62, 0.72, h));
      col = mix(ocean, ground, land);
      float ice = smoothstep(0.8, 0.88, lat + 0.07 * fbm(n * 6.0));
      col = mix(col, vec3(0.88, 0.92, 0.96), ice);
      spec = (1.0 - land) * (1.0 - ice);
      night = land * (1.0 - ice) * smoothstep(0.58, 0.72, fbm(n * 28.0 + 3.0)) * smoothstep(0.9, 0.3, lat);
      float cl = fbm(n * 2.6 + vec3(uTime * 0.006, 0.0, 0.0) + 0.7 * fbm(n * 5.0 - uTime * 0.003));
      float clouds = smoothstep(0.5, 0.72, cl);
      col = mix(col, vec3(0.95), clouds * 0.9);
      spec *= 1.0 - clouds; night *= 1.0 - clouds;
    } else if (uType == 3) {                             // Mars: rust, dark plains, polar caps
      float f = fbm(n * 2.8 + uSeed);
      col = mix(uC1, uC2, smoothstep(0.3, 0.7, f));
      col = mix(col, uC3, smoothstep(0.55, 0.72, fbm(n * 6.0 + 2.0)) * 0.7);
      col = mix(col, vec3(0.93, 0.9, 0.88), smoothstep(0.88, 0.94, abs(n.y) + 0.04 * fbm(n * 9.0)));
    } else {                                             // gas and ice giants: bands
      float warp = fbm(n * vec3(3.0, 1.2, 3.0) + vec3(uTime * 0.02, 0.0, 0.0) + uSeed);
      float strength = uType == 4 ? 0.12 : uType == 5 ? 0.06 : 0.03;
      float y = n.y + strength * (warp - 0.5);
      float freq = uType == 4 ? 21.0 : uType == 5 ? 16.0 : 9.0;
      float bands = 0.5 + 0.5 * sin(y * freq + fbm(n * vec3(1.0, 9.0, 1.0)) * 2.2);
      col = mix(uC1, uC2, bands);
      col = mix(col, uC3, smoothstep(0.55, 0.85, fbm(vec3(n.x * 2.0, n.y * 14.0, n.z * 2.0) + uSeed)) * 0.55);
      if (uType == 4) {                                  // the Great Red Spot
        vec3 sp = normalize(vec3(0.82, -0.36, 0.44));
        float d = length((n - sp) * vec3(1.0, 2.0, 1.0));
        col = mix(col, vec3(0.72, 0.33, 0.2), smoothstep(0.17, 0.1, d) * 0.9);
      }
      if (uType >= 6) col = mix(uC1, col, 0.35);         // ice giants are smooth
    }
    float diff = smoothstep(-0.12, 1.0, ndl);
    vec3 lit = col * (0.012 + 1.3 * diff);
    vec3 H = normalize(L + V);
    lit += spec * pow(max(dot(N, H), 0.0), 70.0) * 0.8 * smoothstep(0.0, 0.1, ndl) * vec3(1.0, 0.92, 0.8);
    lit += night * smoothstep(0.05, -0.25, ndl) * vec3(1.0, 0.68, 0.32) * 1.1;
    gl_FragColor = vec4(lit, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
const atmoFrag = /* glsl */`
  uniform vec3 uColor; uniform float uPower, uStrength;
  varying vec3 vObj; varying vec3 vNw; varying vec3 vPw;
  void main() {
    vec3 N = normalize(vNw), V = normalize(cameraPosition - vPw), L = normalize(-vPw);
    float rim = pow(1.0 - max(dot(N, V), 0.0), uPower);
    float day = smoothstep(-0.3, 0.45, dot(N, L));
    gl_FragColor = vec4(uColor * rim * day * uStrength, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
const lin = (hex) => new THREE.Color(hex);

const orbitLines = new THREE.Group();
scene.add(orbitLines);
const bodies = [];
for (const [k, p] of PLANETS.entries()) {
  const orbit = new THREE.Group();                      // moves along the orbit
  const tilt = new THREE.Group();                       // axial tilt
  tilt.rotation.z = p.tilt * D2R;
  orbit.add(tilt);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uType: { value: p.type }, uC1: { value: lin(p.c[0]) }, uC2: { value: lin(p.c[1]) }, uC3: { value: lin(p.c[2]) }, uTime: { value: 0 }, uSeed: { value: k * 3.7 + 1.3 } },
    vertexShader: VERT, fragmentShader: planetFrag,
  });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(p.R, 96, 64), mat);
  tilt.add(ball);
  if (p.atmo) {
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(p.R * 1.045, 64, 48), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: lin(p.atmo[0]) }, uPower: { value: p.atmo[1] }, uStrength: { value: p.atmo[2] } },
      vertexShader: VERT, fragmentShader: atmoFrag,
    }));
    tilt.add(atmo);
  }
  let ringMat = null;
  if (p.rings) {
    const inner = p.R * 1.24, outer = p.R * 2.35;
    ringMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uInner: { value: inner }, uOuter: { value: outer }, uCenter: { value: new THREE.Vector3() }, uR: { value: p.R }, uNormal: { value: new THREE.Vector3(0, 1, 0) } },
      vertexShader: /* glsl */`varying vec3 vLoc; varying vec3 vPw; void main() { vLoc = position; vec4 w = modelMatrix * vec4(position, 1.0); vPw = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: NOISE + /* glsl */`
        uniform float uInner, uOuter, uR; uniform vec3 uCenter, uNormal; varying vec3 vLoc; varying vec3 vPw;
        void main() {
          float r = (length(vLoc.xy) - uInner) / (uOuter - uInner);
          if (r < 0.0 || r > 1.0) discard;
          float dens = smoothstep(0.0, 0.05, r) * smoothstep(1.0, 0.93, r);
          dens *= 0.35 + 0.65 * vnoise(vec3(r * 60.0, 1.0, 1.0));
          dens *= 0.65 + 0.35 * vnoise(vec3(r * 220.0, 2.0, 2.0));
          dens *= 1.0 - 0.92 * smoothstep(0.035, 0.0, abs(r - 0.6));     // the Cassini division
          dens *= 1.0 - 0.7 * smoothstep(0.008, 0.0, abs(r - 0.88));     // the Encke gap
          dens *= mix(1.0, 0.45, smoothstep(0.62, 0.0, r) * 0.6);        // the faint inner C ring
          vec3 col = mix(vec3(0.62, 0.55, 0.43), vec3(0.95, 0.88, 0.74), vnoise(vec3(r * 35.0, 3.0, 3.0)));
          vec3 L = normalize(-vPw);
          vec3 oc = vPw - uCenter;                               // the planet's shadow on the rings
          float b = dot(oc, L), c = dot(oc, oc) - uR * uR;
          float shadow = (b < 0.0 && b * b - c > 0.0) ? 0.06 : 1.0;
          float light = 0.35 + 0.75 * abs(dot(normalize(uNormal), L));
          gl_FragColor = vec4(col * light * shadow * 1.15, dens * 0.92);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 256, 1), ringMat);
    ring.rotation.x = -Math.PI / 2;
    tilt.add(ring);
    ring.renderOrder = 2;
  }
  scene.add(orbit);

  // the orbit line: the true ellipse, squeezed like the positions
  const pts = [];
  for (let s = 0; s <= 360; s++) pts.push(keplerPos(p, null, s * D2R));
  const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x9fb4ff, transparent: true, opacity: k < 4 ? 0.22 : 0.16, depthWrite: false }));
  orbitLines.add(line);

  const label = document.createElement('div');
  label.textContent = p.name;
  document.getElementById('labels').appendChild(label);
  bodies.push({ p, orbit, tilt, ball, mat, ringMat, label });
}

// position on the orbit, in squeezed scene units. With days: solve Kepler's equation for that date. With E: that point.
function keplerPos(p, days, Egiven) {
  const e = p.e;
  let E = Egiven;
  if (E == null) {
    const M = ((p.L - p.peri) + 360 * days / p.P) * D2R;
    E = M;
    for (let it = 0; it < 6; it++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  }
  const xv = Math.cos(E) - e, yv = Math.sqrt(1 - e * e) * Math.sin(E);     // in units of a, perihelion along +x
  const scale = visualA(p.a);
  const w = (p.peri - p.node) * D2R, O = p.node * D2R, I = p.i * D2R;
  const x1 = xv * Math.cos(w) - yv * Math.sin(w), y1 = xv * Math.sin(w) + yv * Math.cos(w);
  const xe = x1 * Math.cos(O) - y1 * Math.cos(I) * Math.sin(O);
  const ye = x1 * Math.sin(O) + y1 * Math.cos(I) * Math.cos(O);
  const ze = y1 * Math.sin(I);
  return new THREE.Vector3(xe * scale, ze * scale, -ye * scale);           // ecliptic x, y -> scene x, -z; north up
}

// the Moon
const moon = new THREE.Mesh(new THREE.SphereGeometry(0.19, 48, 32), new THREE.ShaderMaterial({
  uniforms: { uType: { value: 0 }, uC1: { value: lin('#9a9690') }, uC2: { value: lin('#d6d2cb') }, uC3: { value: lin('#6c6964') }, uTime: { value: 0 }, uSeed: { value: 9.1 } },
  vertexShader: VERT, fragmentShader: planetFrag,
}));
scene.add(moon);

// the asteroid belt: 6,000 rocks, each on its own circular orbit (inner ones faster, Kepler's third law)
{
  const N = 6000, a = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    const au = 2.15 + Math.pow(rnd(), 1.4) * 1.2;
    a.set([visualA(au) + (rnd() - 0.5) * 0.6, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.9 * (rnd() < 0.8 ? 0.5 : 1.6), 360 / (365.256 * Math.pow(au, 1.5))], i * 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  g.setAttribute('orb', new THREE.BufferAttribute(a, 4));
  const belt = new THREE.Points(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uDays: { value: 0 }, uPx: { value: renderer.getPixelRatio() } },
    vertexShader: /* glsl */`
      attribute vec4 orb; uniform float uDays, uPx; varying float vL;
      void main() {
        float ang = orb.y + radians(orb.w * uDays);
        vec3 p = vec3(cos(ang) * orb.x, orb.z, -sin(ang) * orb.x);
        vL = clamp(dot(normalize(-p), normalize(cross(vec3(0.0, 1.0, 0.0), p))) * 0.0 + 1.0, 0.0, 1.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = max(1.0, 70.0 / -mv.z) * uPx;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying float vL;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        if (d > 1.0) discard;
        gl_FragColor = vec4(vec3(0.62, 0.57, 0.5) * vL, (1.0 - d * d) * 0.75);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  belt.frustumCulled = false;
  scene.add(belt);
  scene.userData.belt = belt;
}

// ---------------------------------------------------------------- the HUD
const $ = (id) => document.getElementById(id);
const START = Date.UTC(2026, 10, 28);                  // the simulation starts on this date
const J2000 = Date.UTC(2000, 0, 1, 12);
let simDays = 0, playing = true;
const speedFrom = (v) => 0.1 * Math.pow(3650, v / 1000);  // 0.1 to 365 days per second
let speed = speedFrom(+$('speed').value);
const showSpeed = () => {
  const v = speed;
  $('speedText').textContent = v < 1 ? `${(v * 24).toFixed(1)} hours / s` : v < 60 ? `${v.toFixed(1)} days / s` : `${(v / 30.44).toFixed(1)} months / s`;
  $('speed').style.setProperty('--fill', `${$('speed').value / 10}%`);
};
$('speed').addEventListener('input', (e) => { speed = speedFrom(+e.target.value); showSpeed(); });
showSpeed();
$('play').addEventListener('click', () => {
  playing = !playing;
  $('play').setAttribute('aria-label', playing ? 'Pause' : 'Play');
  $('icon').innerHTML = playing ? '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>' : '<path d="M7 5l12 7-12 7z"/>';
});
const toggle = (id, fn) => $(id).addEventListener('click', () => { const on = $(id).getAttribute('aria-pressed') !== 'true'; $(id).setAttribute('aria-pressed', on); fn(on); });
let labelsOn = true;
toggle('tOrbits', (on) => (orbitLines.visible = on));
toggle('tLabels', (on) => (labelsOn = on));
addEventListener('keydown', (e) => { if (e.key === ' ') { e.preventDefault(); $('play').click(); } });

// focus: the camera follows a body and flies to a good distance from it
let focus = null, flyT = 1;
const flyFrom = new THREE.Vector3(), flyDist = { from: 0, to: 0 };
const chips = [['Sun', null], ...bodies.map((b) => [b.p.name, b])];
for (const [name, b] of chips) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = name;
  btn.setAttribute('aria-pressed', name === 'Sun');
  btn.addEventListener('click', () => {
    for (const x of $('chips').children) x.setAttribute('aria-pressed', x === btn);
    focus = b;
    flyT = 0;
    flyFrom.copy(controls.target);
    flyDist.from = camera.position.distanceTo(controls.target);
    flyDist.to = b ? b.p.R * (b.p.rings ? 9 : 7) : 88;
  });
  $('chips').appendChild(btn);
}

// ---------------------------------------------------------------- the film camera (only when the kit films the page)
// Start wide above the system, then glide down and in past Saturn, ending on its lit side with the Sun far behind.
const ease = (x) => x * x * x * (x * (x * 6 - 15) + 10);
const bez = (a, b, c, d, t) => { const u = 1 - t; return a.clone().multiplyScalar(u * u * u).add(b.clone().multiplyScalar(3 * u * u * t)).add(c.clone().multiplyScalar(3 * u * t * t)).add(d.clone().multiplyScalar(t * t * t)); };
let filmT0 = null;
function filmCamera(nowMs) {
  if (!(window.__film && window.__film.now > 0)) return false; // warming up: the clock is not frozen yet
  if (filmT0 == null) { filmT0 = nowMs; simDays = 0; }
  const k = Math.min(1, (nowMs - filmT0) / (FILM_SECONDS * 1000));
  const sat = bodies[5].orbit.position;
  const dir = sat.clone().setY(0).normalize(), side = new THREE.Vector3(0, 1, 0).cross(dir).normalize();
  const tall = camera.aspect < 1;
  const up = new THREE.Vector3(0, 1, 0);
  // the path swings round the side of the system, never across the Sun, and arrives beside Saturn
  const P0 = side.clone().multiplyScalar(-62).add(dir.clone().multiplyScalar(-34)).add(up.clone().multiplyScalar(tall ? 66 : 50));
  const P1 = side.clone().multiplyScalar(-78).add(dir.clone().multiplyScalar(18)).add(up.clone().multiplyScalar(30));
  const P2 = sat.clone().add(side.clone().multiplyScalar(-24)).add(dir.clone().multiplyScalar(4)).add(up.clone().multiplyScalar(8));
  const P3 = sat.clone().add(side.clone().multiplyScalar(tall ? -8.2 : -7.4)).add(dir.clone().multiplyScalar(-2.4)).add(up.clone().multiplyScalar(1.6));
  const t = ease(k);
  camera.position.copy(bez(P0, P1, P2, P3, t));
  // look from the middle of the system to a point just left of Saturn, so it settles low right, clear of the title
  const toSat = sat.clone().sub(camera.position).normalize();
  const right = toSat.clone().cross(up).normalize();
  const aim = sat.clone().sub(right.multiplyScalar(tall ? 0.6 : 1.7)).add(up.clone().multiplyScalar(tall ? 0.9 : 0.6));
  const look = new THREE.Vector3().lerpVectors(new THREE.Vector3(0, 0, 0), aim, Math.pow(t, 1.15));
  camera.lookAt(look);
  return true;
}

// ---------------------------------------------------------------- the loop
const sunDir = new THREE.Vector3();
let last = performance.now(), shown = false;
const tmp = new THREE.Vector3();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  const filming = FILM && filmCamera(now);
  const rate = FILM ? 4 : speed;                          // the film shows 40 days in 10 s
  if (playing || filming) simDays += dt * rate;
  const t = now / 1000;
  const days = (START - J2000) / 864e5 + simDays;

  sunMat.uniforms.uTime.value = t;
  corona.material.uniforms.uTime.value = t;
  corona.quaternion.copy(camera.quaternion);
  scene.userData.stars.material.uniforms.uTime.value = t;
  scene.userData.belt.material.uniforms.uDays.value = days;

  for (const b of bodies) {
    b.orbit.position.copy(keplerPos(b.p, days));
    // spin: the real rate, but never faster than a calm turn on screen
    const turnsPerSec = (rate * 24) / b.p.day;
    const vis = Math.sign(turnsPerSec) * Math.min(Math.abs(turnsPerSec), 0.06);
    b.ball.rotation.y += vis * Math.PI * 2 * dt;
    b.mat.uniforms.uTime.value = t;
    if (b.ringMat) {
      b.ringMat.uniforms.uCenter.value.copy(b.orbit.position);
      b.ringMat.uniforms.uNormal.value.set(0, 1, 0).applyQuaternion(b.tilt.getWorldQuaternion(new THREE.Quaternion()));
    }
  }
  const earth = bodies[2].orbit.position, ma = (days / 27.32) * Math.PI * 2;
  moon.position.set(earth.x + Math.cos(ma) * 1.35, earth.y + Math.sin(ma) * 0.09, earth.z - Math.sin(ma) * 1.35);

  if (!filming) {
    // follow the focused body
    const goal = focus ? focus.orbit.position : tmp.set(0, 0, 0);
    if (flyT < 1) {
      flyT = Math.min(1, flyT + dt / 1.6);
      const e = ease(flyT);
      const prev = controls.target.clone();
      controls.target.lerpVectors(flyFrom, goal, e);
      camera.position.add(controls.target.clone().sub(prev));
      const d = THREE.MathUtils.lerp(flyDist.from, flyDist.to, e);
      camera.position.sub(controls.target).setLength(d).add(controls.target);
    } else if (focus) {
      const prev = controls.target.clone();
      controls.target.copy(goal);
      camera.position.add(controls.target.clone().sub(prev));
    }
    controls.update();
  }

  // the date and the labels
  if (!FILM) {
    $('dateText').textContent = new Date(START + simDays * 864e5).toISOString().slice(0, 10);
    const W = innerWidth, H = innerHeight;
    for (const b of bodies) {
      const el = b.label;
      tmp.copy(b.orbit.position).project(camera);
      const vis = labelsOn && tmp.z < 1 && Math.abs(tmp.x) < 1.05 && Math.abs(tmp.y) < 1.05;
      el.style.display = vis ? 'block' : 'none';
      if (vis) el.style.left = `${(tmp.x * 0.5 + 0.5) * W + 6}px`, el.style.top = `${(-tmp.y * 0.5 + 0.5) * H}px`;
    }
  }

  composer.render();
  if (!shown) { shown = true; window.EXAMPLE = { ready: true, renderer, scene, camera, controls }; }
}
requestAnimationFrame(frame);
