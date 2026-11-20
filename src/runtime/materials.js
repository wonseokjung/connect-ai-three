// Material presets. def = "gold" | {preset:'gold', color:'#..', roughness:.., ...any three material property}
import * as THREE from 'three';
import {REG, registerMaterial} from './registry.js';
import {BRAND} from './look.js';
import {GLSL_NOISE} from './util.js';

const std = (o) => new THREE.MeshStandardMaterial(o);
const phys = (o) => new THREE.MeshPhysicalMaterial(o);
const J = 'three core';

registerMaterial('gold', (d) => phys({color: d.color || BRAND.gold, metalness: 1, roughness: d.roughness ?? 0.24, clearcoat: 0.3, clearcoatRoughness: 0.2}), {source: J, about: 'polished brand gold'});
registerMaterial('gold-brushed', (d) => std({color: d.color || '#c98a3a', metalness: 1, roughness: d.roughness ?? 0.48}), {source: J, about: 'brushed gold, soft highlights'});
registerMaterial('chrome', (d) => std({color: d.color || '#f2f4f7', metalness: 1, roughness: d.roughness ?? 0.06}), {source: J, about: 'mirror chrome'});
registerMaterial('steel', (d) => std({color: d.color || '#8f96a1', metalness: 1, roughness: d.roughness ?? 0.42}), {source: J, about: 'dark brushed steel'});
registerMaterial('black', (d) => phys({color: d.color || '#0b0c0f', metalness: 0.2, roughness: d.roughness ?? 0.32, clearcoat: 0.6, clearcoatRoughness: 0.25}), {source: J, about: 'piano black'});
registerMaterial('ivory', (d) => std({color: d.color || BRAND.ivory, metalness: 0, roughness: d.roughness ?? 0.62}), {source: J, about: 'matte ivory'});
registerMaterial('clay', (d) => std({color: d.color || '#b9b2a6', metalness: 0, roughness: 0.92}), {source: J, about: 'matte clay, no gloss'});
registerMaterial('plastic', (d) => phys({color: d.color || '#d8d2c6', metalness: 0, roughness: 0.35, clearcoat: 0.5}), {source: J, about: 'soft glossy plastic'});
registerMaterial('paint', (d) => phys({color: d.color || '#7a1f1c', metalness: 0.5, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.06}), {source: J, about: 'car paint with clear coat'});
registerMaterial('glass', (d) => phys({color: d.color || '#ffffff', metalness: 0, roughness: d.roughness ?? 0.04, transmission: 1, thickness: d.thickness ?? 0.6, ior: 1.5, attenuationColor: d.tint || '#ffffff', attenuationDistance: 2.5, transparent: true}), {source: J, about: 'clear glass with refraction'});
registerMaterial('frosted', (d) => phys({color: d.color || '#dfe6f5', metalness: 0, roughness: d.roughness ?? 0.42, transmission: 0.92, thickness: 0.5, ior: 1.35, transparent: true, opacity: 0.96}), {source: J, about: 'frosted glass card'});
registerMaterial('smoked', (d) => phys({color: d.color || '#141b2c', metalness: 0.1, roughness: d.roughness ?? 0.22, transmission: 0.35, thickness: 0.3, ior: 1.4, clearcoat: 1, clearcoatRoughness: 0.12, transparent: true, opacity: 0.94}), {source: J, about: 'dark smoked glass panel'});
registerMaterial('velvet', (d) => phys({color: d.color || '#1a2740', roughness: 0.9, sheen: 1, sheenColor: d.sheenColor || '#6f90c8', sheenRoughness: 0.4}), {source: J, about: 'velvet with sheen'});
registerMaterial('iridescent', (d) => phys({color: d.color || '#1b1c22', metalness: 0.9, roughness: 0.18, iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [200, 600]}), {source: J, about: 'thin-film iridescence'});
registerMaterial('glow', (d) => std({color: '#000000', emissive: d.color || BRAND.goldHi, emissiveIntensity: d.intensity ?? 1.25, roughness: 1}), {source: J, about: 'self-lit, feeds the bloom pass'});
registerMaterial('wire', (d) => new THREE.MeshBasicMaterial({color: d.color || BRAND.ivory, wireframe: true, transparent: true, opacity: d.opacity ?? 0.55}), {source: J, about: 'wireframe'});
registerMaterial('flat', (d) => new THREE.MeshBasicMaterial({color: d.color || BRAND.ivory}), {source: J, about: 'unlit flat colour'});
registerMaterial('toon', (d) => {
  const steps = d.steps || 3;
  const data = new Uint8Array(steps);
  for (let i = 0; i < steps; i++) data[i] = Math.round((0.25 + (0.75 * i) / (steps - 1)) * 255);
  const grad = new THREE.DataTexture(data, steps, 1, THREE.RedFormat);
  grad.minFilter = grad.magFilter = THREE.NearestFilter;
  grad.needsUpdate = true;
  return new THREE.MeshToonMaterial({color: d.color || BRAND.gold, gradientMap: grad});
}, {source: J, about: 'cel shading in 3 steps'});
registerMaterial('shadow', (d) => new THREE.ShadowMaterial({opacity: d.opacity ?? 0.42, color: d.color || '#000000'}), {source: J, about: 'invisible floor that only shows the shadow'});

// our own shaders -----------------------------------------------------------------------------------------
// rim: dark body, the edge facing away from the camera lights up (gold by default)
registerMaterial('rim', (d) => new THREE.ShaderMaterial({
  uniforms: {uColor: {value: new THREE.Color(d.color || BRAND.gold)}, uBase: {value: new THREE.Color(d.base || '#07080b')}, uPower: {value: d.power ?? 2.4}, uGain: {value: d.intensity ?? 2.0}},
  vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vV;
    void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
  fragmentShader: /* glsl */ `uniform vec3 uColor; uniform vec3 uBase; uniform float uPower; uniform float uGain; varying vec3 vN; varying vec3 vV;
    void main(){ float f = pow(1.0 - clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0), uPower); gl_FragColor = vec4(uBase + uColor * f * uGain, 1.0); }`,
}), {source: 'CONNECT AI LAB shader', about: 'fresnel rim glow on a dark body'});
// gradient: two colours along an axis, with a slow noise drift (time uniform comes from the stage)
registerMaterial('gradient', (d, ctx) => {
  const m = new THREE.ShaderMaterial({
    uniforms: {uA: {value: new THREE.Color(d.color || BRAND.gold)}, uB: {value: new THREE.Color(d.color2 || '#1f5f86')}, uTime: {value: 0}, uScale: {value: d.scale ?? 1.0}},
    vertexShader: /* glsl */ `varying vec3 vP; varying vec3 vN; void main(){ vP = position; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `uniform vec3 uA; uniform vec3 uB; uniform float uTime; uniform float uScale; varying vec3 vP; varying vec3 vN; ${GLSL_NOISE}
      void main(){ float k = 0.5 + 0.5 * sin(vP.y * uScale * 1.6 + c3fbm(vP.xz * uScale * 1.3 + uTime * 0.25) * 3.0);
        float l = 0.55 + 0.45 * clamp(dot(normalize(vN), normalize(vec3(-0.4,0.8,0.5))), 0.0, 1.0);
        gl_FragColor = vec4(mix(uB, uA, k) * l, 1.0); }`,
  });
  ctx.timeUniforms.push(m.uniforms.uTime);
  return m;
}, {source: 'CONNECT AI LAB shader', about: 'two-colour flowing gradient'});

const PASS = new Set(['preset', 'tint', 'color2', 'base', 'power', 'intensity', 'steps', 'scale', 'sheenColor']);
export function makeMaterial(defIn, ctx) {
  const d = typeof defIn === 'string' ? {preset: defIn} : {...(defIn || {})};
  const name = d.preset || 'gold';
  const make = REG.materials.get(name);
  if (!make) throw new Error(`material "${name}" is not in the catalog. Known: ${[...REG.materials.keys()].join(', ')}`);
  const m = make(d, ctx);
  for (const [k, v] of Object.entries(d)) {
    if (PASS.has(k) || k === 'color' || !(k in m)) continue;
    if (m[k] && m[k].isColor) m[k].set(v);
    else m[k] = v;
  }
  if (d.opacity != null && d.opacity < 1) m.transparent = true;
  m.userData.baseOpacity = m.opacity;
  m.userData.preset = name;
  ctx.disposables.push(m);
  return m;
}
export const MATERIAL_NAMES = () => [...REG.materials.keys()];
