// Adapter: three examples/jsm GLTFLoader + Meshopt decoder (MIT). Loads a .glb / .gltf, fits it to a size, puts it
// on the ground, plays its animation by time (mixer.setTime(t), no clock).
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {DRACOLoader} from 'three/examples/jsm/loaders/DRACOLoader.js';
import {registerObject, registerPlugin} from '../runtime/registry.js';
import {makeMaterial} from '../runtime/materials.js';

registerObject('gltf', async (d, ctx) => {
  if (!d.src) throw new Error('gltf: give "src" (a .glb or .gltf file in your project folder)');
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  // Draco-compressed models: the decoder (two small files from three's own package, Apache-2.0) is only fetched when
  // a model needs it. The tool copies them to assets/kit/draco/, or inlines them into a one-file web page.
  const draco = new DRACOLoader();
  draco._loadLibrary = (name, responseType) => new Promise((resolve, reject) => {
    const fl = new THREE.FileLoader();
    fl.setResponseType(responseType);
    fl.load(ctx.resolve((d.draco && d.draco[name]) || 'kit:draco/' + name), resolve, undefined, reject);
  });
  loader.setDRACOLoader(draco);
  let gltf;
  try {
    gltf = await loader.loadAsync(ctx.resolve(d.src));
  } catch (e) {
    draco.dispose();
    if (/draco/i.test(String(e && e.message))) throw new Error(`gltf "${String(d.src).slice(0, 60)}" is Draco-compressed and its decoder could not be loaded (${String(e.message).slice(0, 80)}). Run it through the connect-ai-three commands (they put the decoder in place), or export the model again without Draco.`);
    throw e;
  }
  draco.dispose();
  const model = gltf.scene;
  const box = new THREE.Box3().setFromObject(model);
  const sz = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const k = (d.fit ?? 1.6) / Math.max(sz.x, sz.y, sz.z, 1e-6);
  model.position.set(-c.x * k, d.ground === false ? -c.y * k : -box.min.y * k, -c.z * k);
  model.scale.setScalar(k);
  const override = d.material ? makeMaterial(d.material, ctx) : null;
  let tris = 0;
  model.traverse((m) => {
    if (!m.isMesh) return;
    if (override) m.material = override;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      mat.userData.baseOpacity = mat.opacity;
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) {
        const t = mat[key];
        if (t && t.image && !t.userData.counted) {
          t.userData.counted = true;
          ctx.textures.push({name: `${d.src}:${key}`, width: t.image.width || 0, height: t.image.height || 0});
        }
      }
    }
    const g = m.geometry;
    tris += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
  });
  const wrap = new THREE.Group();
  wrap.add(model);
  wrap.userData.triangles = Math.round(tris);
  if (gltf.animations && gltf.animations.length && d.animation !== false) {
    const mixer = new THREE.AnimationMixer(model);
    const clip = typeof d.animation === 'string' ? gltf.animations.find((a) => a.name === d.animation) || gltf.animations[0] : gltf.animations[d.animation ?? 0];
    const action = mixer.clipAction(clip);
    action.play();
    const speed = d.speed ?? 1;
    ctx.mixers.push({setTime: (t) => mixer.setTime((t * speed) % clip.duration)});
  }
  return wrap;
}, {source: 'three examples/jsm GLTFLoader + meshopt (MIT)', about: 'your .glb / .gltf model: fitted, grounded, animation by time'});
registerPlugin({name: 'gltf'});
