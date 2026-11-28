// SINGULARITY: a black hole that plays its own track. The accretion disk, the lensed star field and the sparks all
// pulse on one 128 BPM beat clock, and the track itself is made by Web Audio code (kick, clap, hats, a wobble bass,
// an arpeggio and a riser) once you press play.
//
// Written for connect-ai-three from the idea in a prompt that chetaslua shared publicly on X (2026-07-24): a single
// self-contained HTML audio visualizer for an EDM track called SINGULARITY. Their code was not used; all code and
// music here are our own. Nothing is downloaded: no textures, models or sound files.
//
// The black hole is drawn by one fragment shader on a full-screen quad. Every pixel shoots a light ray from the
// camera and bends it towards the hole with the photon orbit equation of a Schwarzschild black hole (units of the
// horizon radius, a = -1.5 h^2 r / |r|^5). Where the ray crosses the disk plane it picks up disk light (hotter
// inside, brighter on the side that moves towards you); rays that fall inside the horizon stay black, and rays
// that escape read the star field in the direction they leave in. That is why the far side of the disk shows up
// as an arc over and under the shadow, and stars smear into rings around it.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const FILM = !!window.__FILM__; // the kit is filming: silent, no buttons, full resolution every frame
if (FILM) document.body.classList.add('film');

// ---------------------------------------------------------------- the beat clock (shared by the music and the picture)
const BPM = 128, SPB = 60 / BPM;          // one beat is 0.46875 s
const LOOP = 32, DROP = 8;               // 32 beats a loop: 8 beats of build-up, the drop on beat 8 (3.75 s), 24 beats of drop
const CHORDS = [[57, 60, 64], [57, 60, 64], [53, 57, 60], [53, 57, 60], [48, 52, 55], [55, 59, 62]]; // Am Am F F C G, one a bar

// the picture's envelopes at music time m (seconds since the loop started)
function beatState(m) {
  const beat = m / SPB, b = ((beat % LOOP) + LOOP) % LOOP, f = beat - Math.floor(beat);
  const drop = b >= DROP;
  return {
    beat, b, drop,
    kick: Math.exp(-f * 6) * (drop ? 1 : 0.25 + 0.5 * (b / DROP)),
    flare: drop ? Math.exp(-(b - DROP) * SPB * 0.85) : 0,                 // the disk flares at the drop, then settles
    suck: drop ? 0 : Math.pow(Math.min(1, Math.max(0, (b - 5) / 3)), 2),   // the last beats before the drop pull inwards
    wobble: drop ? 0.5 + 0.5 * Math.sin(beat * Math.PI * 2) : 0,
  };
}

// ---------------------------------------------------------------- renderer, scene, camera
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
const BASE_PR = Math.min(devicePixelRatio, 2);
let quality = 1;
renderer.setPixelRatio(BASE_PR);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const tall = innerWidth / innerHeight < 1;
const camera = new THREE.PerspectiveCamera(tall ? 56 : 38, innerWidth / innerHeight, 0.1, 600);
// a low angle just above the disk: the lensed far side of the disk arcs over the shadow. The shadow is about 2.6
// horizon radii across, so from these distances it fills about a quarter of the frame height (the film pushes in to ~40%).
const START = tall ? new THREE.Vector3(-3.9, 1.9, 19.5) : new THREE.Vector3(-5.9, 2.4, 29.3);
camera.position.copy(START);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true; controls.dampingFactor = 0.06;
controls.enablePan = false; controls.minDistance = 7; controls.maxDistance = 70;
controls.autoRotate = !FILM; controls.autoRotateSpeed = -0.25;

// ---------------------------------------------------------------- the black hole, the disk and the sky (one shader)
const holeMat = new THREE.ShaderMaterial({
  depthTest: false, depthWrite: false,
  uniforms: {
    uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uCamPos: { value: new THREE.Vector3() },
    uT: { value: 0 }, uKick: { value: 0 }, uFlare: { value: 0 }, uSuck: { value: 0 }, uWobble: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vNdc;
    void main() { vNdc = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform mat4 uInvProj, uCamWorld; uniform vec3 uCamPos;
    uniform float uT, uKick, uFlare, uSuck, uWobble;
    varying vec2 vNdc;
    const float R_IN = 3.0, R_OUT = 12.5;

    float hash13(vec3 p) { p = fract(p * .1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
    vec3 hash33(vec3 p) { p = fract(p * vec3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
    float vnoise(vec3 p) {
      vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
                 mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
    }
    float fbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }

    // stars in the direction a ray escapes to (two layers), and a faint warm haze
    vec3 sky(vec3 d) {
      vec3 col = vec3(0.0);
      for (int k = 0; k < 2; k++) {
        float sc = k == 0 ? 90.0 : 210.0;
        vec3 c = d * sc, id = floor(c), h = hash33(id);
        if (h.x > (k == 0 ? 0.93 : 0.965)) {
          vec3 o = fract(c) - 0.5 - (h - 0.5) * 0.6;
          float s = exp(-dot(o, o) * (k == 0 ? 90.0 : 140.0));
          vec3 tint = mix(vec3(1.0, 0.78, 0.52), vec3(0.85, 0.9, 1.0), h.y);
          col += tint * s * (k == 0 ? 2.6 : 1.2) * (0.4 + h.z);
        }
      }
      float n = fbm(d * 2.6 + 3.0);
      col += vec3(0.11, 0.05, 0.015) * pow(n, 3.0) * 0.6;
      return col;
    }

    // the disk where a ray crosses its plane at q: colour (rgb) and opacity (a)
    vec4 disk(vec3 q, float r, vec3 rayDir) {
      float a = atan(q.z, q.x);
      float om = 2.4 / pow(r, 1.5);                            // Kepler: the inside turns faster
      float a2 = a - (uT * (1.0 + 0.25 * uWobble)) * om;
      vec3 np = vec3(cos(a2) * 2.2, sin(a2) * 2.2, r * 1.35);    // low frequency round the orbit, high across it: streaks
      float n = fbm(np + vec3(0.0, 0.0, -uT * 0.05));
      float lanes = 0.55 + 0.45 * sin(r * 5.0 + n * 6.0);
      float dens = clamp(0.25 + 0.95 * n * lanes, 0.0, 1.0);
      float edge = smoothstep(R_IN, R_IN + 0.9 + uSuck, r) * (1.0 - smoothstep(R_OUT - 6.0 + 3.0 * uFlare, R_OUT + 2.5 * uFlare, r));
      float heat = pow(R_IN / r, 1.15);
      // Doppler beaming: the side of the disk that moves towards the camera is brighter and whiter
      vec3 vd = vec3(-q.z, 0.0, q.x) / r;
      float beta = 0.5 * sqrt(R_IN / r);
      float g = 1.0 / (1.0 - beta * dot(vd, -rayDir));
      float beam = clamp(pow(g, 3.0), 0.15, 2.6);
      vec3 hot = vec3(1.0, 0.86, 0.6), warm = vec3(1.0, 0.42, 0.08), deep = vec3(0.55, 0.12, 0.02);
      vec3 col = mix(mix(deep, warm, smoothstep(0.0, 0.45, heat)), hot, smoothstep(0.45, 1.0, heat * (0.8 + 0.3 * g) + 0.35 * uFlare));
      float I = (0.3 + 1.7 * heat) * beam * (1.0 + 0.3 * uKick + 0.7 * uFlare) * (1.0 - 0.5 * uSuck);
      return vec4(col * I * dens * edge * 0.85, clamp(dens * edge, 0.0, 1.0));
    }

    void main() {
      vec4 v = uInvProj * vec4(vNdc, 1.0, 1.0); v /= v.w;
      vec3 dir = normalize((uCamWorld * vec4(v.xyz, 0.0)).xyz);
      vec3 p = uCamPos, vel = dir;
      float h2 = dot(cross(p, vel), cross(p, vel));
      float escapeR = max(80.0, length(uCamPos) * 1.3);
      vec3 col = vec3(0.0); float trans = 1.0; bool escaped = false;
      for (int i = 0; i < 220; i++) {
        float r = length(p);
        if (r < 1.0) { trans = 0.0; break; }                       // inside the horizon
        if (r > escapeR && dot(p, vel) > 0.0) { escaped = true; break; }
        float dt = clamp(0.07 * r, 0.035, 2.2);
        vel += -1.5 * h2 * p / pow(r, 5.0) * dt;
        vec3 pn = p + vel * dt;
        if (p.y * pn.y < 0.0) {                                     // crossed the disk plane
          vec3 q = mix(p, pn, p.y / (p.y - pn.y));
          float rq = length(q.xz);
          if (rq > R_IN - 0.2 && rq < R_OUT + 3.0) {
            vec4 d = disk(q, rq, normalize(vel));
            col += trans * d.rgb; trans *= 1.0 - d.a * 0.9;
            if (trans < 0.02) break;
          }
        }
        p = pn;
      }
      if (escaped || trans > 0.0) col += trans * (escaped ? sky(normalize(vel)) : vec3(0.0));
      gl_FragColor = vec4(col, 1.0);
    }`,
});
const hole = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), holeMat);
hole.frustumCulled = false; hole.renderOrder = -1;
hole.onBeforeRender = (r, s, cam) => {
  holeMat.uniforms.uInvProj.value.copy(cam.projectionMatrixInverse);
  holeMat.uniforms.uCamWorld.value.copy(cam.matrixWorld);
  holeMat.uniforms.uCamPos.value.setFromMatrixPosition(cam.matrixWorld);
};
scene.add(hole);

// ---------------------------------------------------------------- sparks round the disk and two jets
let seed = 20260724;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const DISK_N = 9000, JET_N = 1600;
const data = new Float32Array((DISK_N + JET_N) * 4);
for (let i = 0; i < DISK_N; i++) {
  const r = 3.4 + Math.pow(rnd(), 1.7) * 11;
  const gy = (rnd() + rnd() + rnd() - 1.5) * 0.22 * (0.4 + r / 6);
  data.set([r, rnd() * Math.PI * 2, gy, rnd()], i * 4);
}
for (let i = DISK_N; i < DISK_N + JET_N; i++) data.set([-1, rnd() * Math.PI * 2, rnd() < 0.5 ? -1 : 1, rnd()], i * 4);
const sparkGeo = new THREE.BufferGeometry();
sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((DISK_N + JET_N) * 3), 3));
sparkGeo.setAttribute('aData', new THREE.BufferAttribute(data, 4));
const sparkMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  uniforms: { uT: { value: 0 }, uKick: { value: 0 }, uFlare: { value: 0 }, uSuck: { value: 0 }, uScale: { value: 600 } },
  vertexShader: /* glsl */`
    attribute vec4 aData; uniform float uT, uKick, uFlare, uSuck, uScale;
    varying vec3 vCol; varying float vA;
    void main() {
      vec3 p; float a, size;
      if (aData.x > 0.0) {
        float r = aData.x * (1.0 - 0.16 * uSuck) + uFlare * 2.6 * aData.w * (aData.x / 9.0);
        a = aData.y + uT * 2.4 / pow(max(r, 2.8), 1.5);
        p = vec3(cos(a) * r, aData.z * (1.0 + 2.0 * uFlare), sin(a) * r);
        float heat = pow(3.0 / r, 1.1);
        vCol = mix(vec3(1.0, 0.36, 0.06), vec3(1.0, 0.85, 0.55), heat) * (0.55 + 0.9 * aData.w);
        vA = (0.18 + 0.45 * uKick * heat + 0.6 * uFlare) * smoothstep(3.0, 4.2, r);
        size = (0.03 + 0.045 * aData.w) * (1.0 + 0.6 * uKick + 0.8 * uFlare);
      } else {
        float s = fract(aData.w * 7.31 + uT * (0.18 + 0.1 * aData.w));
        a = aData.y + uT * 1.5;
        float w = 0.15 + s * 1.6;
        p = vec3(cos(a) * w, aData.z * (3.2 + s * 26.0), sin(a) * w); // the jets start above the shadow
        vCol = mix(vec3(1.0, 0.8, 0.5), vec3(1.0, 0.4, 0.1), s);
        vA = (0.015 + 0.7 * uFlare) * (1.0 - s) * smoothstep(0.0, 0.08, s);
        size = 0.07 + 0.05 * aData.w;
      }
      // hide what is behind the black hole's shadow (about 2.6 horizon radii across, seen from the camera)
      vec3 d = p - cameraPosition; float L = length(d); vec3 n = d / L; float tc = -dot(cameraPosition, n);
      if (tc > 0.0 && tc < L) vA *= smoothstep(2.5, 3.1, length(cameraPosition + n * tc));
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = max(1.0, size * uScale / -mv.z);
    }`,
  fragmentShader: /* glsl */`
    varying vec3 vCol; varying float vA;
    void main() { vec2 c = gl_PointCoord - 0.5; float k = exp(-dot(c, c) * 18.0); gl_FragColor = vec4(vCol * vA * k, 1.0); }`,
});
const sparks = new THREE.Points(sparkGeo, sparkMat);
sparks.frustumCulled = false;
scene.add(sparks);

// ---------------------------------------------------------------- bloom
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.6, 0.22, 0.85);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function resize() {
  const w = innerWidth, h = innerHeight;
  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.setPixelRatio(BASE_PR * quality); composer.setPixelRatio(BASE_PR * quality);
  renderer.setSize(w, h); composer.setSize(w, h);
  sparkMat.uniforms.uScale.value = (h * BASE_PR * quality) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
}
addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- the track (Web Audio, started by the button only)
class Track {
  constructor() {
    const ctx = (this.ctx = new AudioContext());
    this.out = ctx.createDynamicsCompressor();
    this.out.threshold.value = -14; this.out.ratio.value = 4;
    this.master = ctx.createGain(); this.master.gain.value = 0.8;
    this.out.connect(this.master).connect(ctx.destination);
    // a feedback delay for the arpeggio (3/16 of a bar)
    this.delay = ctx.createDelay(1); this.delay.delayTime.value = SPB * 0.75;
    const fb = ctx.createGain(); fb.gain.value = 0.32; const wet = ctx.createGain(); wet.gain.value = 0.35;
    this.delay.connect(fb).connect(this.delay); this.delay.connect(wet).connect(this.out);
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    this.step = 0; this.next = 0; this.timer = 0;
  }
  start() {
    this.t0 = this.ctx.currentTime + 0.08; this.next = this.t0; this.step = 0;
    this.timer = setInterval(() => this.schedule(), 25);
  }
  get time() { return this.ctx.currentTime - this.t0; }
  hz(note) { return 440 * Math.pow(2, (note - 69) / 12); }
  env(g, t, peak, decay) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + decay); }
  noiseHit(t, type, freq, q, peak, decay) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain(); this.env(g, t, peak, decay);
    s.connect(f).connect(g).connect(this.out); s.start(t, Math.random() * 0.5); s.stop(t + decay + 0.05);
  }
  kick(t, v) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.frequency.setValueAtTime(165, t); o.frequency.exponentialRampToValueAtTime(44, t + 0.13);
    this.env(g, t, v, 0.38); o.connect(g).connect(this.out); o.start(t); o.stop(t + 0.42);
  }
  bass(t, note, dur) {
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 9;
    // the wobble: the filter opens and closes twice a beat
    f.frequency.setValueAtTime(140, t);
    for (let k = 0; k < dur / (SPB / 2); k++) { f.frequency.linearRampToValueAtTime(1600, t + k * SPB / 2 + SPB / 4); f.frequency.linearRampToValueAtTime(160, t + (k + 1) * SPB / 2); }
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.34, t + 0.01); g.gain.setValueAtTime(0.34, t + dur - 0.03); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    for (const det of [-9, 9]) { const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = this.hz(note); o.detune.value = det; o.connect(f); o.start(t); o.stop(t + dur + 0.02); }
    const sub = this.ctx.createOscillator(); sub.frequency.value = this.hz(note); sub.connect(g); sub.start(t); sub.stop(t + dur + 0.02);
    f.connect(g).connect(this.out);
  }
  lead(t, note, v) {
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 3200;
    const g = this.ctx.createGain(); this.env(g, t, v, 0.22);
    for (const [type, det] of [['square', -6], ['sawtooth', 7]]) { const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = this.hz(note); o.detune.value = det; o.connect(f); o.start(t); o.stop(t + 0.25); }
    f.connect(g); g.connect(this.out); g.connect(this.delay);
  }
  riser(t) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 4;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(7000, t + DROP * SPB);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + DROP * SPB - 0.05); g.gain.linearRampToValueAtTime(0.0001, t + DROP * SPB);
    s.connect(f).connect(g).connect(this.out); s.start(t); s.stop(t + DROP * SPB + 0.05);
  }
  boom(t) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.frequency.setValueAtTime(62, t); o.frequency.exponentialRampToValueAtTime(28, t + 1.8);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.7, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.0);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + 2.1);
  }
  // one 16th note at a time, a little ahead of the audio clock
  schedule() {
    while (this.next < this.ctx.currentTime + 0.12) {
      const t = this.next, s = this.step, beat = s / 4, b = Math.floor(beat) % LOOP, sub = s % 4;
      const drop = b >= DROP, bar = Math.floor((b - DROP) / 4), chord = CHORDS[Math.max(0, Math.min(5, bar))];
      if (b === 0 && sub === 0) this.riser(t);
      if (b === DROP && sub === 0) { this.boom(t); this.noiseHit(t, 'highpass', 900, 0.5, 0.45, 1.6); }
      if (sub === 0) this.kick(t, drop ? 1 : 0.35 + 0.5 * (b / DROP));
      if (drop) {
        if (sub === 2) this.noiseHit(t, 'highpass', 8000, 0.7, 0.16, 0.05);
        if (sub === 0 && b % 2 === 1) this.noiseHit(t, 'bandpass', 1500, 0.8, 0.55, 0.18);
        if (sub === 0 && b % 4 === 0) this.bass(t, chord[0] - 24, SPB * 4 - 0.01);
        this.lead(t, chord[(s >> 0) % 3] + (s % 8 >= 4 ? 12 : 0), 0.09);
      } else if (b >= 4 && sub % 2 === 0) this.lead(t, CHORDS[0][(s >> 1) % 3] + 12, 0.03 + 0.03 * (b - 4) / 4);
      this.next += SPB / 4; this.step++;
    }
  }
  pause() { this.ctx.suspend(); }
  resume() { this.ctx.resume(); }
}

let track = null, playing = false;
const playBtn = document.getElementById('play');
playBtn.addEventListener('click', async () => {
  if (FILM) return;
  if (!track) { track = new Track(); await track.ctx.resume(); track.start(); playing = true; }
  else if (playing) { track.pause(); playing = false; }
  else { track.resume(); playing = true; }
  playBtn.setAttribute('aria-pressed', String(playing));
  playBtn.querySelector('.label').textContent = playing ? 'Pause' : 'Play the track';
});

// ---------------------------------------------------------------- the loop
let clock0 = performance.now(), filmStarted = false, last = performance.now(), slow = 0, frames = 0;
function musicTime(now) {
  if (track) return Math.max(0, track.time);                 // playing (or paused): the picture follows the audio clock
  if (FILM && !filmStarted && window.__film && window.__film.now) { filmStarted = true; clock0 = now; } // beat 0 = first filmed frame
  return (now - clock0) / 1000;                              // silent: BPM times the page time
}
function frame(now) {
  requestAnimationFrame(frame);
  const m = musicTime(now), st = beatState(m);
  for (const u of [holeMat.uniforms, sparkMat.uniforms]) { u.uT.value = m; u.uKick.value = st.kick; u.uFlare.value = st.flare; u.uSuck.value = st.suck; }
  holeMat.uniforms.uWobble.value = st.wobble;
  bloom.strength = 0.5 + 0.1 * st.kick + 0.2 * st.flare;
  controls.update();
  composer.render();
  // keep the frame rate: trade resolution when frames run long (never while filming)
  const dt = now - last; last = now; frames++;
  if (!FILM && frames > 30) {
    slow = slow * 0.95 + dt * 0.05;
    if (frames % 45 === 0) {
      if (slow > 24 && quality > 0.5) { quality = Math.max(0.5, quality * 0.85); resize(); }
      else if (slow < 14 && quality < 1) { quality = Math.min(1, quality + 0.1); resize(); }
    }
  }
  if (!window.EXAMPLE) window.EXAMPLE = { ready: true, renderer, scene, camera, controls };
}
requestAnimationFrame(frame);
