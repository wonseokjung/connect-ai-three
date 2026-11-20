// Motions: every one is evaluated from t alone. An object is reset to its base pose, then each motion is applied in order.
import * as THREE from 'three';
import {prog, clamp, lerp, DEG, v3, EASE} from './util.js';

export const MOTIONS = {
  turntable: {about: 'slow constant turn around Y', params: 'speed (deg/s), axis'},
  spin: {about: 'a number of turns between two moments', params: 'turns, at, dur, axis, ease'},
  float: {about: 'gentle up-down hover', params: 'amp, period, phase'},
  sway: {about: 'slow tilt left-right', params: 'deg, period, axis'},
  pop: {about: 'scale in with a small overshoot', params: 'at, dur'},
  fade: {about: 'opacity in or out', params: 'at, dur, from, to'},
  rise: {about: 'come up from below and settle', params: 'at, dur, from'},
  drop: {about: 'fall in from above with a bounce', params: 'at, dur, from'},
  slide: {about: 'slide in from an offset', params: 'at, dur, from [x,y,z]'},
  move: {about: 'move by an offset between two moments', params: 'at, dur, by [x,y,z], ease'},
  scale: {about: 'scale between two values', params: 'at, dur, from, to'},
  rotate: {about: 'rotate by degrees between two moments', params: 'at, dur, by [x,y,z]'},
  pulse: {about: 'breathing scale', params: 'amp, period'},
  orbit: {about: 'circle around a point', params: 'radius, speed (deg/s), center, tilt'},
  path: {about: 'travel along points', params: 'points, at, dur, ease'},
  explode: {about: 'children fly apart from the centre, then come back', params: 'at, dur, amount, hold, back'},
  stagger: {about: 'children pop or rise one after another', params: 'at, each, dur, kind'},
  draw: {about: 'a line or ribbon draws itself', params: 'at, dur'},
  count: {about: 'a label counts between two numbers', params: 'from, to, at, dur, decimals, prefix, suffix'},
  typewriter: {about: 'a label types itself', params: 'at, dur'},
  billboard: {about: 'always face the camera', params: ''},
};
export const MOTION_NAMES = Object.keys(MOTIONS);

const AX = {x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1)};
const q = new THREE.Quaternion();
const tmp = new THREE.Vector3();

export function captureBase(o) {
  o.userData.base = {p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone()};
  if (o.isGroup || o.children.length) {
    for (const c of o.children) if (!c.userData.base) c.userData.base = {p: c.position.clone(), q: c.quaternion.clone(), s: c.scale.clone()};
  }
}
function setOpacity(o, k) {
  o.traverse((m) => {
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    for (const mat of mats) {
      const b = mat.userData.baseOpacity ?? 1;
      const v = b * k;
      if (v < 0.999 && !mat.transparent && !mat.isShaderMaterial) {
        mat.transparent = true;
        mat.needsUpdate = true;
      }
      if (mat.isShaderMaterial && mat.uniforms && mat.uniforms.uAlpha) continue;
      mat.opacity = v;
    }
  });
  o.visible = k > 0.002;
}

export function applyMotions(o, motions, t, camera) {
  const b = o.userData.base;
  if (!b) return;
  o.position.copy(b.p);
  o.quaternion.copy(b.q);
  o.scale.copy(b.s);
  let opacity = 1, touchedOpacity = o.userData.hadOpacity;
  let hasChildMotion = false;
  for (const m of motions) {
    const at = m.at ?? 0;
    switch (m.type) {
      case 'turntable':
        o.quaternion.premultiply(q.setFromAxisAngle(AX[m.axis || 'y'], (m.speed ?? 20) * DEG * t + (m.phase ?? 0) * DEG));
        break;
      case 'spin':
        o.quaternion.premultiply(q.setFromAxisAngle(AX[m.axis || 'y'], prog(t, at, m.dur ?? 1.2, m.ease || 'inOut') * (m.turns ?? 1) * Math.PI * 2));
        break;
      case 'float':
        o.position.y += Math.sin((t / (m.period ?? 3.2)) * Math.PI * 2 + (m.phase ?? 0)) * (m.amp ?? 0.08);
        break;
      case 'sway':
        o.quaternion.multiply(q.setFromAxisAngle(AX[m.axis || 'z'], Math.sin((t / (m.period ?? 4)) * Math.PI * 2 + (m.phase ?? 0)) * (m.deg ?? 5) * DEG));
        break;
      case 'pop':
        o.scale.multiplyScalar(Math.max(0.0001, prog(t, at, m.dur ?? 0.7, 'back')));
        break;
      case 'fade':
        opacity *= lerp(m.from ?? 0, m.to ?? 1, prog(t, at, m.dur ?? 0.6, m.ease || 'smooth'));
        touchedOpacity = true;
        break;
      case 'rise': {
        const k = prog(t, at, m.dur ?? 0.9, 'expoOut');
        o.position.y += (m.from ?? -0.6) * (1 - k);
        opacity *= clamp((t - at) / ((m.dur ?? 0.9) * 0.4));
        touchedOpacity = true;
        break;
      }
      case 'drop':
        o.position.y += (m.from ?? 3) * (1 - prog(t, at, m.dur ?? 0.9, 'bounce'));
        if (t < at) opacity = 0, (touchedOpacity = true);
        break;
      case 'slide': {
        const f = v3(m.from, [-1.5, 0, 0]), k = 1 - prog(t, at, m.dur ?? 0.9, m.ease || 'expoOut');
        o.position.x += f[0] * k;
        o.position.y += f[1] * k;
        o.position.z += f[2] * k;
        break;
      }
      case 'move': {
        const by = v3(m.by), k = prog(t, at, m.dur ?? 1, m.ease || 'inOut');
        o.position.x += by[0] * k;
        o.position.y += by[1] * k;
        o.position.z += by[2] * k;
        break;
      }
      case 'scale':
        o.scale.multiplyScalar(Math.max(0.0001, lerp(m.from ?? 0.6, m.to ?? 1, prog(t, at, m.dur ?? 1, m.ease || 'inOut'))));
        break;
      case 'rotate': {
        const by = v3(m.by, [0, 90, 0]), k = prog(t, at, m.dur ?? 1, m.ease || 'inOut');
        o.quaternion.multiply(q.setFromEuler(new THREE.Euler(by[0] * DEG * k, by[1] * DEG * k, by[2] * DEG * k)));
        break;
      }
      case 'pulse':
        o.scale.multiplyScalar(1 + Math.sin((t / (m.period ?? 1.6)) * Math.PI * 2) * (m.amp ?? 0.04));
        break;
      case 'orbit': {
        const a = (m.speed ?? 30) * DEG * t + (m.phase ?? 0) * DEG, c = v3(m.center), r = m.radius ?? 1.5;
        o.position.set(c[0] + Math.cos(a) * r, c[1] + b.p.y + Math.sin(a) * r * Math.sin((m.tilt ?? 0) * DEG), c[2] + Math.sin(a) * r * Math.cos((m.tilt ?? 0) * DEG));
        break;
      }
      case 'path': {
        if (!m._curve) m._curve = new THREE.CatmullRomCurve3((m.points || []).map((p) => new THREE.Vector3(...p)));
        if (m._curve.points.length > 1) o.position.copy(m._curve.getPointAt(prog(t, at, m.dur ?? 3, m.ease || 'inOut')));
        break;
      }
      case 'explode':
      case 'stagger':
        hasChildMotion = true;
        break;
      case 'draw':
        if (o.userData.setDraw) o.userData.setDraw(prog(t, at, m.dur ?? 1.2, m.ease || 'inOut'));
        else o.traverse((c) => c.userData.setDraw && c.userData.setDraw(prog(t, at, m.dur ?? 1.2, m.ease || 'inOut')));
        break;
      case 'count': {
        const set = o.userData.setText;
        if (set) {
          const v = lerp(m.from ?? 0, m.to ?? 100, prog(t, at, m.dur ?? 1.6, m.ease || 'expoOut'));
          set(`${m.prefix ?? ''}${v.toLocaleString('en-US', {minimumFractionDigits: m.decimals ?? 0, maximumFractionDigits: m.decimals ?? 0})}${m.suffix ?? ''}`);
        }
        break;
      }
      case 'typewriter': {
        const set = o.userData.setText;
        if (set) {
          const full = o.userData.text || '';
          set(full.slice(0, Math.round(prog(t, at, m.dur ?? 1.2, 'linear') * full.length)));
        }
        break;
      }
      case 'billboard':
        if (camera) o.quaternion.copy(camera.quaternion);
        break;
      default:
        break;
    }
  }
  if (o.userData.billboard && camera) o.quaternion.copy(camera.quaternion);
  if (touchedOpacity) {
    setOpacity(o, opacity);
    o.userData.hadOpacity = true;
  }
  if (hasChildMotion || o.userData.hadChildMotion) {
    o.userData.hadChildMotion = true;
    const kids = o.children;
    for (const c of kids) {
      const cb = c.userData.base;
      if (!cb) continue;
      c.position.copy(cb.p);
      c.scale.copy(cb.s);
    }
    for (const m of motions) {
      const at = m.at ?? 0;
      if (m.type === 'explode') {
        const dur = m.dur ?? 1.2, hold = m.hold ?? 0.8;
        let k = prog(t, at, dur, 'inOut');
        if (m.back !== false) k *= 1 - prog(t, at + dur + hold, dur, 'inOut');
        kids.forEach((c, i) => {
          const cb = c.userData.base;
          if (!cb) return;
          tmp.copy(cb.p);
          if (tmp.lengthSq() < 1e-6) tmp.set(Math.cos(i * 2.4), 0.4 * Math.sin(i * 1.7), Math.sin(i * 2.4));
          c.position.addScaledVector(tmp.normalize(), k * (m.amount ?? 1.2) * (1 + (i % 3) * 0.18));
        });
      } else if (m.type === 'stagger') {
        kids.forEach((c, i) => {
          const cb = c.userData.base;
          if (!cb) return;
          const st = at + i * (m.each ?? 0.12), dur = m.dur ?? 0.7;
          if ((m.kind ?? 'pop') === 'rise') {
            c.position.y = cb.p.y + (m.from ?? -0.5) * (1 - prog(t, st, dur, 'expoOut'));
            setOpacity(c, clamp((t - st) / (dur * 0.4)));
          } else c.scale.copy(cb.s).multiplyScalar(Math.max(0.0001, prog(t, st, dur, 'back')));
        });
      }
    }
  }
}
