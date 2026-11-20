// React Three Fiber adapter (MIT): drop a connect-ai-three spec inside any <Canvas> (or Remotion's <ThreeCanvas>).
// The spec's objects, lights and environment are built into your R3F scene; pass the time yourself.
//   <Canvas><ConnectScene spec={spec} time={t} /></Canvas>
import React, {useEffect, useRef, useState} from 'react';
import {useThree} from '@react-three/fiber';
import * as THREE from 'three';
// @ts-ignore plain JS runtime
import {normalizeSpec} from '../runtime/spec.js';
// @ts-ignore
import {makeObject} from '../runtime/objects.js';
// @ts-ignore
import {makeMaterial} from '../runtime/materials.js';
// @ts-ignore
import {applyMotions, captureBase} from '../runtime/motion.js';
// @ts-ignore
import {cameraPose} from '../runtime/camera.js';
// @ts-ignore
import {makeLights, updateLights, makeEnvironment} from '../runtime/lights.js';

export type ConnectSceneProps = {spec: any; time: number; controlCamera?: boolean; assetBase?: string; kitBase?: string; onReady?: () => void};

export const ConnectScene: React.FC<ConnectSceneProps> = ({spec: specIn, time, controlCamera = true, assetBase = '', kitBase, onReady}) => {
  const {gl, scene, camera, size, invalidate, advance} = useThree();
  const built = useRef<any>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let dead = false;
    const spec = normalizeSpec(specIn);
    const root = new THREE.Group();
    const ctx: any = {
      THREE, spec, mode: 'video', size: {width: size.width, height: size.height}, renderer: gl, scene: root, camera, transparent: false,
      palette: spec.palette, fogColor: spec.fog ? spec.fog.color : null, shadows: gl.shadowMap.enabled,
      disposables: [], updaters: [], timeUniforms: [], textures: [], resizers: [], mixers: [], byId: new Map(), warn: () => {},
      resolve: (u: string) => (/^(https?:|data:|blob:)/.test(u) ? u : u.startsWith('kit:') ? (kitBase ?? assetBase + 'assets/kit/') + u.slice(4) : assetBase + u),
      loadTexture: async (src: string) => {
        const t = await new THREE.TextureLoader().loadAsync(ctx.resolve(src));
        t.colorSpace = THREE.SRGBColorSpace;
        ctx.disposables.push(t);
        return t;
      },
    };
    ctx.material = (d: any) => makeMaterial(d, ctx);
    ctx.make = (d: any) => makeObject(d, ctx);
    (async () => {
      // environment goes on the real scene (reflections), everything else under one group
      const envCtx = {...ctx, scene};
      await makeEnvironment(spec.env, envCtx);
      ctx.disposables.push(...envCtx.disposables.filter((x: any) => !ctx.disposables.includes(x)));
      const lights = makeLights(spec.lights, ctx);
      const movers: any[] = [];
      for (const d of [...spec.backdrop.map((b: any, i: number) => ({id: `backdrop-${i + 1}`, motion: [], ...b})), ...spec.objects]) {
        const o = await makeObject(d, ctx);
        root.add(o);
        captureBase(o);
      }
      root.traverse((o: any) => {
        const d = o.userData.def;
        if ((d && d.motion && d.motion.length) || o.userData.billboard) {
          if (!o.userData.base) captureBase(o);
          movers.push(o);
        }
      });
      if (dead) return;
      scene.add(root);
      built.current = {spec, root, ctx, lights, movers};
      setReady(true);
      onReady && onReady();
    })();
    return () => {
      dead = true;
      scene.remove(root);
      root.traverse((o: any) => {
        if (o.geometry) o.geometry.dispose();
        const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        for (const m of mats) m.dispose();
      });
      for (const d of ctx.disposables) d && d.dispose && d.dispose();
      scene.environment = null;
      built.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const b = built.current;
    if (!b) return;
    const t = Math.max(0, time);
    for (const u of b.ctx.timeUniforms) u.value = t;
    if (controlCamera) {
      const pose = cameraPose(b.spec.camera, t, null);
      const cam = camera as THREE.PerspectiveCamera;
      cam.fov = pose.fov;
      cam.position.copy(pose.position);
      cam.lookAt(pose.target);
      cam.updateProjectionMatrix();
    }
    for (const up of b.ctx.updaters) up(t);
    for (const m of b.ctx.mixers) m.setTime(t);
    for (const o of b.movers) applyMotions(o, o.userData.def?.motion || [], t, camera);
    updateLights(b.lights, t);
    invalidate();
    advance(performance.now());
  }, [time, ready, camera, controlCamera, invalidate, advance]);
  return null;
};
