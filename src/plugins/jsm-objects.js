// Adapter: three examples/jsm objects (MIT): physical Sky, MarchingCubes (liquid metal blob).
import * as THREE from 'three';
import {Sky} from 'three/examples/jsm/objects/Sky.js';
import {MarchingCubes} from 'three/examples/jsm/objects/MarchingCubes.js';
import {registerObject, registerPlugin} from '../runtime/registry.js';
import {makeMaterial} from '../runtime/materials.js';
import {DEG} from '../runtime/util.js';

function makeSky(d, ctx) {
  const sky = new Sky();
  sky.scale.setScalar(9000);
  const u = sky.material.uniforms;
  u.turbidity.value = d.turbidity ?? 6;
  u.rayleigh.value = d.rayleigh ?? 1.6;
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.82;
  const el = (d.elevation ?? 18) * DEG, az = (d.azimuth ?? 150) * DEG;
  u.sunPosition.value.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
  sky.userData.noShadow = true;
  sky.userData.isBackdrop = true;
  ctx.disposables.push(sky.geometry, sky.material);
  return sky;
}
registerObject('sky', (d, ctx) => {
  const s = makeSky(d, ctx);
  ctx.camera.far = 12000;
  return s;
}, {source: 'three examples/jsm Sky (MIT)', about: 'physical sky with a sun'});

registerObject('blob', (d, ctx) => {
  const res = d.resolution ?? 52;
  const mc = new MarchingCubes(res, makeMaterial(d.material ?? 'chrome', ctx), false, false, 60000);
  mc.isolation = d.isolation ?? 80;
  const n = d.balls ?? 6, speed = d.speed ?? 1;
  const set = (t) => {
    mc.reset();
    for (let i = 0; i < n; i++) {
      const a = t * speed * (0.5 + i * 0.13) + i * 2.1;
      mc.addBall(0.5 + Math.sin(a) * 0.23 * Math.cos(i), 0.5 + Math.cos(a * 0.8 + i) * 0.2, 0.5 + Math.sin(a * 0.6 + i * 1.7) * 0.2, 0.55, 12);
    }
    mc.update();
  };
  set(0);
  ctx.updaters.push(set);
  const g = new THREE.Group();
  mc.scale.setScalar(d.radius ?? 1.3);
  mc.frustumCulled = false;
  g.add(mc);
  ctx.disposables.push(mc.geometry);
  return g;
}, {source: 'three examples/jsm MarchingCubes (MIT)', about: 'liquid metal blob (metaballs)'});
registerPlugin({name: 'jsm-objects', makeSky});
