// Adapter: Rapier (@dimforge/rapier3d-compat, Apache-2.0). Real rigid-body physics, baked once when the scene loads:
// the whole run is simulated at a fixed step and stored, then render(t) just reads the pose for that time.
// So physics is still a pure function of t: scrub it, loop it, render it in any frame order.
import * as THREE from 'three';
import {registerPlugin} from '../runtime/registry.js';
import {v3} from '../runtime/util.js';

const SUB = 4; // physics steps per video frame

async function bake(spec, ctx, tops) {
  const mod = await import('@dimforge/rapier3d-compat');
  const RAPIER = mod.default || mod;
  await RAPIER.init();
  const P = spec.physics || {};
  const g = v3(P.gravity, [0, -9.81, 0]);
  const world = new RAPIER.World({x: g[0], y: g[1], z: g[2]});
  world.timestep = 1 / (spec.fps * SUB);
  if (P.floor !== false) world.createCollider(RAPIER.ColliderDesc.cuboid(200, 0.5, 200).setTranslation(0, (P.floorY ?? 0) - 0.5, 0).setFriction(P.floorFriction ?? 0.9).setRestitution(P.floorBounce ?? 0.2));

  const items = [];
  const box = new THREE.Box3(), size = new THREE.Vector3(), center = new THREE.Vector3(), wp = new THREE.Vector3(), wq = new THREE.Quaternion(), ws = new THREE.Vector3();
  const add = (o, def) => {
    const kind = def.body || 'dynamic';
    o.updateMatrixWorld(true);
    o.matrixWorld.decompose(wp, wq, ws);
    // collider = the object's own box, measured with its rotation taken out
    const keepQ = o.quaternion.clone();
    o.quaternion.identity();
    o.updateMatrixWorld(true);
    box.setFromObject(o);
    o.quaternion.copy(keepQ);
    o.updateMatrixWorld(true);
    box.getSize(size);
    box.getCenter(center);
    const off = center.clone().sub(wp);
    const desc = kind === 'fixed' ? RAPIER.RigidBodyDesc.fixed() : RAPIER.RigidBodyDesc.dynamic();
    desc.setTranslation(wp.x, wp.y, wp.z).setRotation({x: wq.x, y: wq.y, z: wq.z, w: wq.w});
    if (def.angularDamping) desc.setAngularDamping(def.angularDamping);
    if (def.spin) desc.setAngvel({x: def.spin[0], y: def.spin[1], z: def.spin[2]});
    if (def.push) desc.setLinvel(def.push[0], def.push[1], def.push[2]);
    const body = world.createRigidBody(desc);
    const shape = def.collider === 'ball' ? RAPIER.ColliderDesc.ball(Math.max(size.x, size.y, size.z) / 2) : RAPIER.ColliderDesc.cuboid(Math.max(0.005, size.x / 2), Math.max(0.005, size.y / 2), Math.max(0.005, size.z / 2));
    shape.setTranslation(off.x, off.y, off.z).setRestitution(def.bounce ?? 0.25).setFriction(def.friction ?? 0.7).setDensity(def.density ?? 1);
    world.createCollider(shape, body);
    const releaseAt = def.at ?? 0;
    if (releaseAt > 0 && kind !== 'fixed') body.setEnabled(false);
    items.push({o, body, releaseAt, fixed: kind === 'fixed', parentInv: o.parent ? o.parent.matrixWorld.clone().invert() : null});
  };
  for (const o of tops) {
    const d = o.userData.def;
    const ok = (v) => v === true || v === 'dynamic' || v === 'fixed';
    if (ok(d.bodyEach)) o.children.forEach((c, i) => add(c, {...d, body: d.bodyEach === true ? 'dynamic' : d.bodyEach, at: (d.at ?? 0) + i * (d.each ?? 0)}));
    else if (ok(d.body)) add(o, {...d, body: d.body === true ? 'dynamic' : d.body});
  }
  const frames = Math.ceil(spec.duration * spec.fps) + 2;
  const data = items.map(() => new Float32Array(frames * 7));
  for (let f = 0; f < frames; f++) {
    const t = f / spec.fps;
    items.forEach((it, i) => {
      if (!it.fixed && it.releaseAt > 0 && t >= it.releaseAt && !it.body.isEnabled()) it.body.setEnabled(true);
      const p = it.body.translation(), q = it.body.rotation();
      data[i].set([p.x, p.y, p.z, q.x, q.y, q.z, q.w], f * 7);
    });
    for (let s = 0; s < SUB; s++) world.step();
  }
  world.free();

  const pa = new THREE.Vector3(), pb = new THREE.Vector3(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), m = new THREE.Matrix4(), one = new THREE.Vector3();
  return {
    bodies: items.length,
    frames,
    update(t) {
      const x = Math.min(frames - 1.001, Math.max(0, t * spec.fps));
      const f = Math.floor(x), k = x - f;
      items.forEach((it, i) => {
        const a = data[i], j = f * 7, n = j + 7;
        pa.set(a[j], a[j + 1], a[j + 2]).lerp(pb.set(a[n], a[n + 1], a[n + 2]), k);
        qa.set(a[j + 3], a[j + 4], a[j + 5], a[j + 6]).slerp(qb.set(a[n + 3], a[n + 4], a[n + 5], a[n + 6]), k);
        if (it.parentInv) {
          m.compose(pa, qa, one.set(1, 1, 1)).premultiply(it.parentInv);
          m.decompose(pa, qa, one);
        }
        it.o.position.copy(pa);
        it.o.quaternion.copy(qa);
      });
    },
    dispose() {},
  };
}
registerPlugin({name: 'physics', bake});
