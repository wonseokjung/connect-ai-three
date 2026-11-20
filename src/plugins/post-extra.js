// Adapter: more of three's examples/jsm passes (MIT): depth of field, ambient occlusion, outline, pixel art,
// halftone, SMAA.
import * as THREE from 'three';
import {BokehPass} from 'three/examples/jsm/postprocessing/BokehPass.js';
import {GTAOPass} from 'three/examples/jsm/postprocessing/GTAOPass.js';
import {OutlinePass} from 'three/examples/jsm/postprocessing/OutlinePass.js';
import {RenderPixelatedPass} from 'three/examples/jsm/postprocessing/RenderPixelatedPass.js';
import {HalftonePass} from 'three/examples/jsm/postprocessing/HalftonePass.js';
import {SMAAPass} from 'three/examples/jsm/postprocessing/SMAAPass.js';
import {registerPost, registerPlugin} from '../runtime/registry.js';

const S = (n) => `three examples/jsm ${n} (MIT)`;
registerPost('dof', {kind: 'pass', order: 40, alpha: false, source: S('BokehPass'), about: 'depth of field: the subject sharp, the rest soft', make: (d, ctx, hooks) => {
  const p = new BokehPass(ctx.scene, ctx.camera, {focus: d.focus ?? 6, aperture: d.aperture ?? 0.0035, maxblur: d.maxblur ?? 0.008});
  hooks.push((t, info) => {
    p.uniforms.focus.value = d.focus ?? info.focus;
  });
  return p;
}});
registerPost('ao', {kind: 'pass', order: 10, alpha: false, source: S('GTAOPass'), about: 'contact shading where surfaces meet', make: (d, ctx) => {
  const p = new GTAOPass(ctx.scene, ctx.camera, ctx.size.width, ctx.size.height);
  p.updateGtaoMaterial({radius: d.radius ?? 0.5, distanceExponent: 1, thickness: 1, scale: d.strength ?? 1.2, samples: 16});
  return p;
}});
registerPost('outline', {kind: 'pass', order: 20, alpha: false, source: S('OutlinePass'), about: 'a coloured line around chosen objects', make: (d, ctx) => {
  const picked = (d.ids || []).map((id) => ctx.byId.get(id)).filter(Boolean);
  const all = picked.length ? picked : ctx.scene.children.filter((o) => o.userData.def && !o.userData.isFloor && !o.userData.isBackdrop);
  const p = new OutlinePass(new THREE.Vector2(ctx.size.width, ctx.size.height), ctx.scene, ctx.camera, all);
  p.edgeStrength = d.strength ?? 3.5;
  p.edgeThickness = d.thickness ?? 1.2;
  p.edgeGlow = d.glow ?? 0.0;
  p.visibleEdgeColor.set(d.color || ctx.palette.accent);
  p.hiddenEdgeColor.set(d.hidden || '#000000');
  return p;
}});
registerPost('pixel', {kind: 'render', alpha: false, source: S('RenderPixelatedPass'), about: 'pixel-art render with edges', make: (d, ctx) => new RenderPixelatedPass(d.size ?? 6, ctx.scene, ctx.camera, {normalEdgeStrength: 0.3, depthEdgeStrength: 0.4})});
registerPost('halftone', {kind: 'display', order: 10, alpha: false, source: S('HalftonePass'), about: 'print halftone dots', make: (d, ctx) => new HalftonePass(ctx.size.width, ctx.size.height, {shape: 1, radius: d.radius ?? 5, scatter: 0, blending: d.blend ?? 0.75, blendingMode: 1, greyscale: d.greyscale ?? false, rotateR: Math.PI / 12, rotateG: (Math.PI / 12) * 2, rotateB: (Math.PI / 12) * 3})});
registerPost('smaa', {kind: 'aa', alpha: true, source: S('SMAAPass'), about: 'edge smoothing after the other passes', make: (d, ctx) => new SMAAPass(ctx.size.width, ctx.size.height)});
registerPlugin({name: 'post-extra'});
