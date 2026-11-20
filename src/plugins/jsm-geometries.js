// Adapter: three examples/jsm geometries (MIT): Utah teapot, parametric surfaces (mobius, klein).
import * as THREE from 'three';
import {TeapotGeometry} from 'three/examples/jsm/geometries/TeapotGeometry.js';
import {ParametricGeometry} from 'three/examples/jsm/geometries/ParametricGeometry.js';
import {ParametricGeometries} from 'three/examples/jsm/geometries/ParametricGeometries.js';
import {registerObject, registerPlugin} from '../runtime/registry.js';
import {makeMaterial} from '../runtime/materials.js';

registerObject('teapot', (d, ctx) => {
  const geo = new TeapotGeometry(d.size ?? 0.55, 14);
  ctx.disposables.push(geo);
  return new THREE.Mesh(geo, makeMaterial(d.material ?? 'gold', ctx));
}, {source: 'three examples/jsm TeapotGeometry (MIT)', about: 'the Utah teapot'});
registerObject('parametric', (d, ctx) => {
  const fn = d.surface === 'klein' ? ParametricGeometries.klein : ParametricGeometries.mobius3d;
  const geo = new ParametricGeometry(fn, 96, 48);
  geo.computeBoundingSphere();
  const k = (d.radius ?? 0.9) / geo.boundingSphere.radius;
  geo.scale(k, k, k);
  geo.center();
  ctx.disposables.push(geo);
  const m = new THREE.Mesh(geo, makeMaterial(d.material ?? 'gold', ctx));
  m.material.side = THREE.DoubleSide;
  return m;
}, {source: 'three examples/jsm ParametricGeometry (MIT)', about: 'mobius band or klein bottle'});
registerPlugin({name: 'jsm-geometries'});
