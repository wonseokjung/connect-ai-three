// Post-processing: three's own EffectComposer passes (MIT) in a fixed, safe order + one finishing shader of ours
// (vignette, grain, chroma, grade). Grain is seeded by the frame number, so it is the same on every render.
import * as THREE from 'three';
import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/examples/jsm/postprocessing/RenderPass.js';
import {ShaderPass} from 'three/examples/jsm/postprocessing/ShaderPass.js';
import {OutputPass} from 'three/examples/jsm/postprocessing/OutputPass.js';
import {UnrealBloomPass} from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {REG, registerPost, NEEDS} from './registry.js';
import {asDef} from './util.js';

const FinishShader = {
  uniforms: {tDiffuse: {value: null}, uVignette: {value: 0}, uGrain: {value: 0}, uChroma: {value: 0}, uSeed: {value: 0}, uContrast: {value: 1}, uSaturation: {value: 1}, uTint: {value: new THREE.Color('#ffffff')}, uTintAmount: {value: 0}, uLift: {value: 0}},
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `uniform sampler2D tDiffuse; uniform float uVignette; uniform float uGrain; uniform float uChroma; uniform float uSeed; uniform float uContrast; uniform float uSaturation; uniform vec3 uTint; uniform float uTintAmount; uniform float uLift; varying vec2 vUv;
    float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main(){ vec2 c = vUv - 0.5; float r2 = dot(c, c);
      vec4 base = texture2D(tDiffuse, vUv); vec3 col = base.rgb;
      if (uChroma > 0.0) { vec2 o = c * r2 * uChroma * 0.06; col.r = texture2D(tDiffuse, vUv + o).r; col.b = texture2D(tDiffuse, vUv - o).b; }
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSaturation); col = (col - 0.5) * uContrast + 0.5 + uLift;
      col = mix(col, col * uTint, uTintAmount);
      col *= 1.0 - uVignette * smoothstep(0.12, 0.62, r2) ;
      float n = hash(gl_FragCoord.xy + uSeed * 17.31) - 0.5; col += n * uGrain * (0.6 + 0.4 * (1.0 - l));
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), base.a); }`,
};

// kind: 'pass' = its own pass, 'finish' = folds into our finishing shader. alpha: keeps the transparent background?
registerPost('bloom', {kind: 'pass', order: 30, alpha: false, source: 'three examples/jsm UnrealBloomPass', about: 'glow around bright parts',
  make: (d, ctx) => new UnrealBloomPass(new THREE.Vector2(ctx.size.width, ctx.size.height), d.strength ?? 0.35, d.radius ?? 0.55, d.threshold ?? 0.82)});
registerPost('vignette', {kind: 'finish', alpha: true, source: 'CONNECT AI LAB shader', about: 'darker corners', set: (d, u) => (u.uVignette.value = d.amount ?? 0.38)});
registerPost('grain', {kind: 'finish', alpha: true, source: 'CONNECT AI LAB shader', about: 'light film grain, the same on every render', set: (d, u) => (u.uGrain.value = d.amount ?? 0.045)});
registerPost('chroma', {kind: 'finish', alpha: true, source: 'CONNECT AI LAB shader', about: 'colour fringing toward the corners', set: (d, u) => (u.uChroma.value = d.amount ?? 1)});
registerPost('grade', {kind: 'finish', alpha: true, source: 'CONNECT AI LAB shader', about: 'contrast, saturation, tint', set: (d, u) => {
  u.uContrast.value = d.contrast ?? 1.06;
  u.uSaturation.value = d.saturation ?? 1;
  u.uLift.value = d.lift ?? 0;
  if (d.tint) {
    u.uTint.value.set(d.tint);
    u.uTintAmount.value = d.amount ?? 0.35;
  }
}});

export function makePost(listIn, ctx) {
  const list = (listIn || []).map((x) => asDef(x)).filter((d) => d && d.type && d.off !== true);
  if (!list.length) return null;
  const {renderer, scene, camera, size} = ctx;
  for (const d of list) {
    if (!REG.post.get(d.type)) {
      const need = NEEDS.post[d.type];
      throw new Error(need ? `post "${d.type}" needs the "${need}" adapter (it is left out of this build)` : `post "${d.type}" is not in the catalog. Known: ${[...REG.post.keys()].join(', ')}`);
    }
  }
  const used = list.map((d) => ({d, e: REG.post.get(d.type)}));
  const dropped = [];
  const keep = used.filter(({d, e}) => {
    if (ctx.transparent && e.alpha === false) {
      dropped.push(d.type);
      return false;
    }
    return true;
  });
  if (dropped.length) ctx.warn(`post ${dropped.join(', ')} left out: it does not keep a transparent background`);
  if (!keep.length) return null;
  const dpr = renderer.getPixelRatio();
  const target = new THREE.WebGLRenderTarget(size.width * dpr, size.height * dpr, {type: THREE.HalfFloatType, samples: ctx.mode === 'web' ? 2 : 4});
  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(dpr);
  composer.setSize(size.width, size.height);
  const hooks = [];
  const replace = keep.find(({e}) => e.kind === 'render');
  if (replace) composer.addPass(replace.e.make(replace.d, ctx, hooks));
  else {
    const rp = new RenderPass(scene, camera);
    if (ctx.transparent) rp.clearAlpha = 0;
    composer.addPass(rp);
  }
  for (const {d, e} of keep.filter(({e}) => e.kind === 'pass').sort((a, b) => a.e.order - b.e.order)) composer.addPass(e.make(d, ctx, hooks));
  composer.addPass(new OutputPass());
  for (const {d, e} of keep.filter(({e}) => e.kind === 'display').sort((a, b) => a.e.order - b.e.order)) composer.addPass(e.make(d, ctx, hooks));
  const fin = keep.filter(({e}) => e.kind === 'finish');
  let finish = null;
  if (fin.length) {
    finish = new ShaderPass(FinishShader);
    for (const {d, e} of fin) e.set(d, finish.uniforms);
    composer.addPass(finish);
  }
  for (const {d, e} of keep.filter(({e}) => e.kind === 'aa')) composer.addPass(e.make(d, ctx, hooks));
  return {
    composer,
    passes: keep.map(({d}) => d.type),
    frame(t, fps, info) {
      if (finish) finish.uniforms.uSeed.value = Math.floor(t * fps + 0.5) % 1024;
      for (const h of hooks) h(t, info);
    },
    setSize(w, h, r) {
      composer.setPixelRatio(r);
      composer.setSize(w, h);
    },
    dispose() {
      for (const p of composer.passes) p.dispose && p.dispose();
      composer.dispose();
      target.dispose();
    },
  };
}
export const POST_TYPES = () => [...REG.post.keys()];
