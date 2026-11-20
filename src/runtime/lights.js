// Lights and environment. Light motions are functions of t as well (a rim light can sweep around the subject).
import * as THREE from 'three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {RectAreaLightUniformsLib} from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import {REG, NEEDS} from './registry.js';
import {v3, DEG, prog, lerp} from './util.js';

export const LIGHTS = {
  key: {about: 'main directional light with soft shadows'},
  fill: {about: 'weak light from the other side, no shadow'},
  rim: {about: 'light from behind that draws the edge (gold by default)'},
  ambient: {about: 'flat base light'},
  hemi: {about: 'sky / ground light'},
  point: {about: 'small warm practical light'},
  spot: {about: 'cone light with a soft edge and shadow'},
  area: {about: 'softbox (RectAreaLight)'},
  sun: {about: 'sun set by elevation and azimuth'},
};
export const LIGHT_NAMES = Object.keys(LIGHTS);
export const LIGHT_MOTIONS = {sweep: 'the light circles the subject', fade: 'intensity up or down', breathe: 'slow intensity swell'};

let areaReady = false;

export function makeLights(defs, ctx) {
  const out = [];
  for (const d of defs) {
    let l;
    const color = d.color || '#ffffff', I = d.intensity ?? 1;
    switch (d.type) {
      case 'ambient': l = new THREE.AmbientLight(color, I); break;
      case 'hemi': l = new THREE.HemisphereLight(d.sky || '#bcd4ff', d.ground || '#3a3128', I); break;
      case 'point': l = new THREE.PointLight(color, I, d.distance ?? 0, d.decay ?? 2); break;
      case 'spot': {
        l = new THREE.SpotLight(color, I, d.distance ?? 0, (d.angle ?? 28) * DEG, d.penumbra ?? 0.6, d.decay ?? 1.6);
        l.target.position.set(...v3(d.target, [0, 0.5, 0]));
        ctx.scene.add(l.target);
        break;
      }
      case 'area': {
        if (!areaReady) {
          RectAreaLightUniformsLib.init();
          areaReady = true;
        }
        l = new THREE.RectAreaLight(color, I, d.width ?? 4, d.height ?? 2);
        break;
      }
      case 'sun': {
        l = new THREE.DirectionalLight(color, I);
        const el = (d.elevation ?? 20) * DEG, az = (d.azimuth ?? 150) * DEG;
        l.position.set(Math.cos(el) * Math.sin(az) * 30, Math.sin(el) * 30, Math.cos(el) * Math.cos(az) * 30);
        break;
      }
      case 'key':
      case 'fill':
      case 'rim':
      default:
        l = new THREE.DirectionalLight(color, I);
        break;
    }
    if (d.position && l.position) l.position.set(...v3(d.position));
    else if (!d.position && (d.type === 'key' || !d.type)) l.position.set(-3, 4, 4.5);
    if (l.isRectAreaLight) l.lookAt(...v3(d.target, [0, 0.4, 0]));
    const wantsShadow = d.shadow ?? (d.type === 'key' || d.type === 'sun' || d.type === 'spot');
    if (wantsShadow && l.shadow && ctx.shadows) {
      l.castShadow = true;
      const res = ctx.mode === 'web' ? 1024 : 2048;
      l.shadow.mapSize.set(res, res);
      l.shadow.bias = -0.0004;
      l.shadow.normalBias = 0.02;
      l.shadow.radius = d.softness ?? 5;
      if (l.shadow.camera.isOrthographicCamera) {
        const s = d.shadowArea ?? 6;
        Object.assign(l.shadow.camera, {left: -s, right: s, top: s, bottom: -s, near: 0.5, far: 60});
      }
    }
    l.userData.def = d;
    l.userData.base = {p: l.position.clone(), i: I};
    ctx.scene.add(l);
    out.push(l);
  }
  return out;
}

export function updateLights(lights, t) {
  for (const l of lights) {
    const d = l.userData.def, b = l.userData.base;
    if (!d.motion) continue;
    l.position.copy(b.p);
    l.intensity = b.i;
    for (const m of Array.isArray(d.motion) ? d.motion : [d.motion]) {
      if (m.type === 'sweep') {
        const a = (m.from ?? 0) * DEG + (m.speed != null ? m.speed * DEG * t : lerp(0, (m.to ?? 180) - (m.from ?? 0), prog(t, m.at ?? 0, m.dur ?? 4, m.ease || 'inOut')) * DEG);
        const r = Math.hypot(b.p.x, b.p.z), a0 = Math.atan2(b.p.x, b.p.z);
        l.position.set(Math.sin(a0 + a) * r, b.p.y, Math.cos(a0 + a) * r);
      } else if (m.type === 'fade') l.intensity = b.i * lerp(m.from ?? 0, m.to ?? 1, prog(t, m.at ?? 0, m.dur ?? 1, m.ease || 'smooth'));
      else if (m.type === 'breathe') l.intensity = b.i * (1 + Math.sin((t / (m.period ?? 3)) * Math.PI * 2) * (m.amp ?? 0.25));
    }
    if (l.isRectAreaLight) l.lookAt(...v3(d.target, [0, 0.4, 0]));
  }
}

// --- environment (what the metal reflects) -----------------------------------------------------------------
export const ENVS = {
  softbox: 'our own: black room with long warm and white strip lights (best for gold and chrome)',
  room: 'three RoomEnvironment: neutral lit room',
  hdri: 'an .hdr file (CC0 Poly Haven studio ships with the kit)',
  none: 'no reflections',
};
function softboxTexture(d) {
  // equirect: u = 0.75 is the camera side (+z), u = 0.25 is behind the subject (-z); v = 0.5 is the horizon
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d');
  const base = g.createLinearGradient(0, 0, 0, 512);
  base.addColorStop(0, '#16171b');
  base.addColorStop(0.5, '#08090b');
  base.addColorStop(1, '#040405');
  g.fillStyle = base;
  g.fillRect(0, 0, 1024, 512);
  const soft = (cx, cy, rx, ry, col, a) => {
    g.save();
    g.translate(cx, cy);
    g.scale(rx, ry);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    gr.addColorStop(0, col);
    gr.addColorStop(0.55, col);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = a;
    g.fillStyle = gr;
    g.fillRect(-1, -1, 2, 2);
    g.restore();
    g.globalAlpha = 1;
  };
  soft(768, 150, 250, 95, '#ffffff', 1); // big softbox above the camera
  soft(700, 262, 150, 60, '#fff3e2', 0.75); // front fill at eye level: lights flat faces that look at the camera
  soft(905, 250, 60, 120, '#ffffff', 0.55); // tall strip, camera right
  soft(256, 215, 260, 26, d.warm || '#D6892A', 1); // long warm strip behind the subject = the gold rim in reflections
  soft(256, 120, 120, 40, d.warm || '#D6892A', 0.6);
  soft(480, 250, 40, 110, '#5f97c4', 0.6); // cool kicker, camera left
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export async function makeEnvironment(defIn, ctx) {
  const d = typeof defIn === 'string' ? {type: defIn} : defIn || {type: 'none'};
  if (d.type === 'none') return null;
  const pmrem = new THREE.PMREMGenerator(ctx.renderer);
  let rt;
  if (d.type === 'room') {
    const room = new RoomEnvironment();
    rt = pmrem.fromScene(room, 0.04);
    room.dispose?.();
  } else if (d.type === 'hdri') {
    const hook = REG.plugins.get('hdri');
    if (!hook) throw new Error(`env type "hdri" needs the "${NEEDS.env.hdri}" adapter (it is left out of this build)`);
    const tex = await hook.load(ctx.resolve(d.src || 'kit:studio_small_08_1k.hdr'));
    ctx.textures.push({name: 'hdri:' + (d.src || 'studio_small_08_1k.hdr'), width: tex.image.width, height: tex.image.height});
    rt = pmrem.fromEquirectangular(tex);
    if (d.show) {
      tex.mapping = THREE.EquirectangularReflectionMapping;
      ctx.scene.background = tex;
      ctx.scene.backgroundBlurriness = d.blur ?? 0.35;
      ctx.scene.backgroundIntensity = d.backgroundIntensity ?? 0.6;
      ctx.disposables.push(tex);
    } else tex.dispose();
  } else {
    const tex = softboxTexture(d);
    rt = pmrem.fromEquirectangular(tex);
    tex.dispose();
  }
  pmrem.dispose();
  ctx.scene.environment = rt.texture;
  ctx.scene.environmentIntensity = d.intensity ?? 1.8;
  if (d.rotation != null) ctx.scene.environmentRotation.y = d.rotation * DEG;
  ctx.disposables.push(rt);
  return rt;
}
