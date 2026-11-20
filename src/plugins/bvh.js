// Adapter: three-mesh-bvh (MIT). Fast pointer picking on heavy models: hover stays smooth on a 300k-triangle scan.
import * as THREE from 'three';
import {computeBoundsTree, disposeBoundsTree, acceleratedRaycast} from 'three-mesh-bvh';
import {registerPlugin} from '../runtime/registry.js';

let patched = false;
registerPlugin({
  name: 'bvh',
  afterBuild(ctx, tops) {
    if (!ctx.spec.interact.some((i) => (typeof i === 'string' ? i : i.type) === 'hover')) return;
    if (!patched) {
      THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
      THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
      THREE.Mesh.prototype.raycast = acceleratedRaycast;
      patched = true;
    }
    let n = 0;
    for (const o of tops) {
      if (o.userData.type !== 'gltf' || o.userData.def.bvh === false) continue;
      o.traverse((m) => {
        if (m.isMesh && !m.isInstancedMesh && !m.isSkinnedMesh && m.geometry.attributes.position.count > 3000) {
          m.geometry.computeBoundsTree();
          ctx.disposables.push({dispose: () => m.geometry.disposeBoundsTree()});
          n++;
        }
      });
    }
    ctx.bvhMeshes = n;
  },
});
