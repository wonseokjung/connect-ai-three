// Camera: a base pose plus motions, all from t. On a web page the visitor's drag / pointer is added on top.
import * as THREE from 'three';
import {prog, lerp, DEG, v3, drift} from './util.js';

export const CAMERA_MOTIONS = {
  orbit: {about: 'arc around the target', params: 'from, to (deg), at, dur, ease'},
  dolly: {about: 'move toward or away from the target', params: 'from, to (x distance), at, dur'},
  crane: {about: 'rise or sink while looking at the target', params: 'by, at, dur'},
  truck: {about: 'slide sideways with the target', params: 'by [x,y,z], at, dur'},
  zoom: {about: 'change the lens (fov)', params: 'from, to (fov deg), at, dur'},
  shots: {about: 'fly between camera positions (a list of shots)', params: 'list: [{at, position, target, fov, dur, ease}]'},
  path: {about: 'follow a smooth path through points', params: 'points, targets, at, dur'},
  handheld: {about: 'small organic drift, like a hand-held camera', params: 'amp, speed'},
  'dolly-zoom': {about: 'move in while widening the lens (vertigo)', params: 'to (x distance), at, dur'},
};
export const CAMERA_MOTION_NAMES = Object.keys(CAMERA_MOTIONS);

const P = new THREE.Vector3(), T = new THREE.Vector3(), off = new THREE.Vector3(), sph = new THREE.Spherical();

export function cameraPose(def = {}, t, input = null) {
  const pos = v3(def.position, [0, 1.1, 6]), tgt = v3(def.target, [0, 0.6, 0]);
  P.set(...pos);
  T.set(...tgt);
  let fov = def.fov ?? 35;
  for (const m of def.motion || []) {
    const at = m.at ?? 0;
    const k = prog(t, at, m.dur ?? 4, m.ease || 'inOut');
    switch (m.type) {
      case 'orbit': {
        off.copy(P).sub(T);
        sph.setFromVector3(off);
        sph.theta += lerp(m.from ?? -18, m.to ?? 18, k) * DEG;
        sph.phi = Math.min(Math.PI - 0.05, Math.max(0.05, sph.phi - lerp(0, m.lift ?? 0, k) * DEG));
        P.copy(T).add(off.setFromSpherical(sph));
        break;
      }
      case 'dolly':
        off.copy(P).sub(T).multiplyScalar(lerp(m.from ?? 1, m.to ?? 0.7, k));
        P.copy(T).add(off);
        break;
      case 'crane':
        P.y += (m.by ?? 1) * k;
        break;
      case 'truck': {
        const by = v3(m.by, [1, 0, 0]);
        P.x += by[0] * k; P.y += by[1] * k; P.z += by[2] * k;
        T.x += by[0] * k; T.y += by[1] * k; T.z += by[2] * k;
        break;
      }
      case 'zoom':
        fov = lerp(m.from ?? fov, m.to ?? fov * 0.7, k);
        break;
      case 'dolly-zoom': {
        const s = lerp(1, m.to ?? 0.55, k);
        const d0 = off.copy(P).sub(T).length();
        off.multiplyScalar(s);
        P.copy(T).add(off);
        fov = 2 * Math.atan((Math.tan((fov * DEG) / 2) * d0) / (d0 * s)) / DEG;
        break;
      }
      case 'shots': {
        // each shot flies from wherever the camera is to its own pose; shots are read in time order
        let a = {p: [P.x, P.y, P.z], t: [T.x, T.y, T.z], f: fov};
        for (const s of m.list || []) {
          const kk = prog(t, s.at ?? 0, s.dur ?? 1.4, s.ease || 'inOut');
          if (kk <= 0) break;
          const bp = v3(s.position, a.p), bt = v3(s.target, a.t);
          a = {
            p: [lerp(a.p[0], bp[0], kk), lerp(a.p[1], bp[1], kk) + Math.sin(kk * Math.PI) * (s.arc ?? 0), lerp(a.p[2], bp[2], kk)],
            t: [lerp(a.t[0], bt[0], kk), lerp(a.t[1], bt[1], kk), lerp(a.t[2], bt[2], kk)],
            f: lerp(a.f, s.fov ?? a.f, kk),
          };
        }
        P.set(...a.p);
        T.set(...a.t);
        fov = a.f;
        break;
      }
      case 'path': {
        if (!m._c) m._c = new THREE.CatmullRomCurve3((m.points || []).map((p) => new THREE.Vector3(...p)));
        if (m._c.points.length > 1) P.copy(m._c.getPointAt(k));
        if (m.targets) {
          if (!m._t) m._t = new THREE.CatmullRomCurve3(m.targets.map((p) => new THREE.Vector3(...p)));
          if (m._t.points.length > 1) T.copy(m._t.getPointAt(k));
        }
        break;
      }
      case 'handheld': {
        const a = m.amp ?? 0.04, sp = m.speed ?? 1;
        P.x += drift(t * sp, 1) * a; P.y += drift(t * sp, 2) * a * 0.7; P.z += drift(t * sp, 3) * a * 0.5;
        T.x += drift(t * sp, 4) * a * 0.5; T.y += drift(t * sp, 5) * a * 0.4;
        break;
      }
      default:
        break;
    }
  }
  // visitor input (web) or a scripted pointer (video): orbit drag, zoom, pointer parallax
  if (input) {
    if (input.orbit && (input.orbit[0] || input.orbit[1])) {
      off.copy(P).sub(T);
      sph.setFromVector3(off);
      sph.theta -= input.orbit[0];
      sph.phi = Math.min(Math.PI - 0.08, Math.max(0.08, sph.phi - input.orbit[1]));
      P.copy(T).add(off.setFromSpherical(sph));
    }
    if (input.zoom && input.zoom !== 1) {
      off.copy(P).sub(T).multiplyScalar(input.zoom);
      P.copy(T).add(off);
    }
    if (input.parallax) {
      off.copy(P).sub(T);
      const d = off.length();
      sph.setFromVector3(off);
      sph.theta -= input.parallax[0] * (input.parallaxAmount ?? 0.12);
      sph.phi = Math.min(Math.PI - 0.08, Math.max(0.08, sph.phi + input.parallax[1] * (input.parallaxAmount ?? 0.12) * 0.6));
      sph.radius = d;
      P.copy(T).add(off.setFromSpherical(sph));
    }
  }
  return {position: P.clone(), target: T.clone(), fov};
}
