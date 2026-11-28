// Live mode: first-person walk-around with an idle "film" attract loop.
import * as THREE from 'three';
import { GI } from '../core/gi.js';
import { ROOM } from '../scene/layout.js';
import { filmState, applyFilmCamera, FILM_LENGTH, SHOTS } from '../render/film.js';
import { LOOK } from '../render/look.js';

export function startGame(api) {
  const { renderer, camera, pipe, resize, ctx, state } = api;
  const startEl = document.getElementById('start'), hint = document.getElementById('hint'), canvas = renderer.domElement;

  // ---- adaptive resolution: hold a steady frame rate on modest GPUs
  let scale = Math.min(1, 1600 / window.innerWidth), lastFit = 0, acc = 0, frames = 0;
  const fit = () => {
    const w = Math.max(320, Math.round(window.innerWidth * scale)), h = Math.max(180, Math.round(window.innerHeight * scale));
    resize(w, h, { msaa: 4 });
  };
  window.addEventListener('resize', fit); fit();

  // ---- player
  const P = { pos: new THREE.Vector3(3.95, 0, 3.15), vel: new THREE.Vector3(), yaw: 0.72, pitch: -0.06, eye: 1.62, eyeT: 1.62, bob: 0 };
  const keys = new Set();
  let mode = 'attract', filmT = 0;
  const startQ = window.__FILM__ ? new URLSearchParams(location.search).get('start') : null;
  const FILM_START = startQ == null ? null : isNaN(+startQ) ? SHOTS.slice(0, Math.max(0, SHOTS.findIndex((s) => s.name === startQ))).reduce((a, s) => a + s.dur, 0) : +startQ;
  const R = 0.2;
  const blocked = (x, z) => {
    if (x < R + 0.02 || x > ROOM.W - R - 0.02 || z < R + 0.05 || z > ROOM.D - R - 0.02) return true;
    for (const c of ctx.colliders) {
      if (c.max[1] < 0.25 || c.min[1] > P.eye) continue;
      if (x > c.min[0] - R && x < c.max[0] + R && z > c.min[2] - R && z < c.max[2] + R) return true;
    }
    return false;
  };
  if (blocked(P.pos.x, P.pos.z)) P.pos.set(3.0, 0, 3.0);

  const lock = () => canvas.requestPointerLock && canvas.requestPointerLock();
  startEl.style.display = 'grid';
  // connect-ai-three: the original plays recorded music and leaves (CC BY 4.0) and birdsong (public domain) mixed
  // into two m4a files. This kit ships CC0 and own files only, so the room is silent here.
  startEl.addEventListener('click', () => { lock(); });
  canvas.addEventListener('click', () => { if (document.pointerLockElement !== canvas) lock(); });
  document.addEventListener('pointerlockchange', () => {
    const on = document.pointerLockElement === canvas;
    if (on) { mode = 'walk'; startEl.style.display = 'none'; hint.style.opacity = 0.75; setTimeout(() => (hint.style.opacity = 0), 6000); pipe.look.fade = 1; }
    else if (mode === 'walk') { startEl.style.display = 'grid'; }
  });
  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== canvas || mode !== 'walk') return;
    P.yaw -= e.movementX * 0.0019; P.pitch = Math.max(-1.45, Math.min(1.45, P.pitch - e.movementY * 0.0019));
  });
  window.addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (e.code === 'KeyC') { mode = mode === 'film' ? 'walk' : 'film'; filmT = 0; pipe.look.fade = 1; if (mode === 'film') startEl.style.display = 'none'; /* connect-ai-three: the film plays without the start card */ }
    if (e.code === 'KeyH') hint.style.opacity = hint.style.opacity > 0 ? 0 : 0.75;
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), wish = new THREE.Vector3();
  const clock = new THREE.Clock();
  const loop = () => {
    const dt = Math.min(0.05, clock.getDelta());
    GI.uniforms.uTime.value += dt;
    for (const fn of ctx.animated) fn(GI.uniforms.uTime.value);

    if (mode === 'walk') {
      fwd.set(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)); right.set(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
      wish.set(0, 0, 0);
      if (keys.has('KeyW') || keys.has('ArrowUp')) wish.add(fwd);
      if (keys.has('KeyS') || keys.has('ArrowDown')) wish.sub(fwd);
      if (keys.has('KeyD') || keys.has('ArrowRight')) wish.add(right);
      if (keys.has('KeyA') || keys.has('ArrowLeft')) wish.sub(right);
      const crouch = keys.has('ControlLeft') || keys.has('KeyQ');
      const speed = (keys.has('ShiftLeft') ? 0.7 : 1.5) * (crouch ? 0.6 : 1);
      if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed);
      P.vel.lerp(wish, 1 - Math.exp(-dt * 9));
      const nx = P.pos.x + P.vel.x * dt, nz = P.pos.z + P.vel.z * dt;
      if (!blocked(nx, P.pos.z)) P.pos.x = nx; else P.vel.x = 0;
      if (!blocked(P.pos.x, nz)) P.pos.z = nz; else P.vel.z = 0;
      P.eyeT = crouch ? 0.98 : 1.62; P.eye += (P.eyeT - P.eye) * (1 - Math.exp(-dt * 7));
      const sp = Math.hypot(P.vel.x, P.vel.z); P.bob += sp * dt * 6.2;
      camera.position.set(P.pos.x, P.eye + Math.sin(P.bob) * 0.011 * Math.min(1, sp), P.pos.z);
      camera.rotation.set(P.pitch, P.yaw, 0, 'YXZ');
      camera.fov = 62; camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    } else {
      // connect-ai-three: while the kit films the page, ?start=<shot name or seconds> holds the cinematic camera at that
      // shot until the kit's frame clock starts
      if (FILM_START != null && !(window.__film && window.__film.now > 0)) filmT = FILM_START;
      else filmT = (filmT + dt) % FILM_LENGTH;
      applyFilmCamera(api, filmState(filmT));
    }

    if (mode === 'walk') {
      camera.getWorldDirection(fwd); wish.set(1.5, 1.55, -0.2).sub(camera.position).normalize();
      const see = Math.max(0, Math.min(1, (fwd.dot(wish) - 0.15) / 0.65)), want = LOOK.exposure * (1.5 - 0.5 * see * see * (3 - 2 * see));
      pipe.look.exposure += (want - pipe.look.exposure) * (1 - Math.exp(-dt * 1.6));
    }
    renderer.info.reset();
    pipe.render();

    // adapt resolution once a second
    acc += dt; frames++;
    if (acc > 1) {
      const ms = (acc / frames) * 1000; acc = 0; frames = 0;
      const now = performance.now();
      if (now - lastFit > 1500) {
        if (ms > 24 && scale > 0.5) { scale = Math.max(0.5, scale * 0.88); lastFit = now; fit(); }
        else if (ms < 12.5 && scale < 1) { scale = Math.min(1, scale * 1.08); lastFit = now; fit(); }
      }
    }
    requestAnimationFrame(loop);
  };
  loop();
}
