// Adapter: three examples/jsm SVGLoader (MIT). Your logo as an .svg becomes an extruded 3D object.
import * as THREE from 'three';
import {SVGLoader} from 'three/examples/jsm/loaders/SVGLoader.js';
import {registerObject, registerPlugin} from '../runtime/registry.js';
import {makeMaterial} from '../runtime/materials.js';

registerObject('svg', async (d, ctx) => {
  let text = d.svg;
  if (!text && d.src) text = await (await fetch(ctx.resolve(d.src))).text();
  if (!text) throw new Error('svg: give "src" (an .svg file) or "svg" (the markup)');
  const data = new SVGLoader().parse(text);
  const g = new THREE.Group();
  const depth = d.depth ?? 12;
  const mat = makeMaterial(d.material ?? 'gold', ctx);
  for (const p of data.paths) {
    const fill = p.userData.style.fill;
    if (fill === 'none' && !d.strokes) continue;
    for (const shape of SVGLoader.createShapes(p)) {
      const geo = new THREE.ExtrudeGeometry(shape, {depth, bevelEnabled: (d.bevel ?? 1) > 0, bevelThickness: d.bevel ?? 1, bevelSize: (d.bevel ?? 1) * 0.8, bevelSegments: 3, curveSegments: 18});
      ctx.disposables.push(geo);
      g.add(new THREE.Mesh(geo, mat));
    }
  }
  const box = new THREE.Box3().setFromObject(g);
  const sz = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const k = (d.fit ?? 2) / Math.max(sz.x, sz.y, 1e-6);
  const wrap = new THREE.Group();
  g.scale.set(k, -k, k); // svg y points down
  g.position.set(-c.x * k, c.y * k, (-depth * k) / 2);
  wrap.add(g);
  return wrap;
}, {source: 'three examples/jsm SVGLoader (MIT)', about: 'your .svg logo extruded into 3D'});
registerPlugin({name: 'svg'});
