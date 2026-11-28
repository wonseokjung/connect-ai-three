// The construction scene: lights, environment, orbit controls, the building and its detail cameras, driven by one
// 0-1 progress value. From Hailey's threejs-architecture-effects (MIT), assets/starter/src/PagodaThreeScene.tsx,
// moved out of React into a plain function for connect-ai-three (same lights, cameras, shadow throttling and
// render-on-change loop). createScene(mount) returns {setProgress, setView, renderer, scene, camera}.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createHeritageMaterials } from './heritage/materials.js';
import { HeritageBuilder } from './heritage/builder.js';
import { buildArchitecture, courtyard } from './heritage/architecture.js';

export function createScene(mount) {
  const state = { progress: 0, view: 'overview' };
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 180);
  camera.position.set(38, 22.5, 57);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, window.innerWidth < 700 ? 1.5 : 2));
  renderer.setClearColor(0xf4f1e9, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // r187: PCFSoftShadowMap is gone, PCF with a radius gives the soft edge
  // Camera movement does not change a directional light's shadow map.
  renderer.shadowMap.autoUpdate = false;
  mount.appendChild(renderer.domElement);
  // connect-ai-three: an opaque canvas with the page's paper glow drawn on a quad behind everything (the starter used a
  // transparent canvas over a CSS gradient). Opaque pixels let the kit's check read the picture.
  const glow = document.createElement('canvas');
  glow.width = glow.height = 256;
  const g2 = glow.getContext('2d'), grad = g2.createRadialGradient(128, 118, 0, 128, 118, 150);
  grad.addColorStop(0, '#fffefa');
  grad.addColorStop(1, '#f4f1e9');
  g2.fillStyle = grad;
  g2.fillRect(0, 0, 256, 256);
  const glowTex = new THREE.CanvasTexture(glow);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glowTex, toneMapped: false, depthWrite: false, fog: false }));
  backdrop.renderOrder = -1;
  backdrop.position.z = -170;
  camera.add(backdrop);
  scene.add(camera);
  const room = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(room, 0.06);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.32;
  room.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xfaf7ef, 0x706a5c, 0.72));
  const key = new THREE.DirectionalLight(0xfff2e2, 2.4);
  key.position.set(-22, 38, 30);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -22; key.shadow.camera.right = 22;
  key.shadow.camera.top = 25; key.shadow.camera.bottom = -20; key.shadow.camera.near = 0.5; key.shadow.camera.far = 100;
  key.target.position.set(0, 12, 0);
  key.shadow.normalBias = 0.025; key.shadow.bias = -0.00015; key.shadow.radius = 3;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xe5eced, 0.55);
  fill.position.set(25, 18, -10);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xfff4de, 0.7);
  rim.position.set(-12, 30, -24);
  scene.add(rim);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 15.35, 0);
  controls.enableDamping = true; controls.dampingFactor = 0.075;
  controls.enablePan = true; controls.minDistance = 12; controls.maxDistance = 110;
  controls.minPolarAngle = 0.35; controls.maxPolarAngle = Math.PI * 0.51;
  const materialKit = createHeritageMaterials(renderer), builder = new HeritageBuilder(materialKit.materials);
  courtyard(builder);
  buildArchitecture(builder);
  builder.finish(scene);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const presets = {
    overview: { position: new THREE.Vector3(38, 22.5, 57), target: new THREE.Vector3(0, 15.35, 0) },
    roof: { position: new THREE.Vector3(16, 30.3, 22), target: new THREE.Vector3(0, 26.9, 0) },
    guardian: { position: new THREE.Vector3(8.5, 12.7, 17), target: new THREE.Vector3(0.4, 11, 4.5) },
  };
  let lastView = 'overview', transition = false, lastNow = performance.now();
  let needsFrame = true, lastProgress = -2, lastShadowProgress = -2, lastShadowTime = -Infinity;
  controls.addEventListener('start', () => (transition = false));
  const resize = () => {
    const w = Math.max(1, mount.clientWidth), h = Math.max(1, mount.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = camera.aspect < 0.58 ? 39 : 34;
    camera.updateProjectionMatrix();
    const bh = 2 * 170 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.02;
    backdrop.scale.set(bh * camera.aspect, bh, 1);
    needsFrame = true;
  };
  new ResizeObserver(resize).observe(mount);
  resize();
  builder.progress.value = state.progress;
  renderer.compile(scene, camera);
  const render = (now) => {
    const dt = Math.min((now - lastNow) / 1000, 0.1);
    lastNow = now;
    builder.progress.value = state.progress;
    if (lastView !== state.view) { lastView = state.view; transition = true; }
    if (transition) {
      const preset = presets[lastView], amount = reducedMotion ? 1 : 1 - Math.exp(-dt * 5);
      camera.position.lerp(preset.position, amount);
      controls.target.lerp(preset.target, amount);
      if (camera.position.distanceTo(preset.position) < 0.02) transition = false;
    }
    const cameraChanged = controls.update();
    const progressChanged = lastProgress !== state.progress;
    // Limit construction shadow work to 30 Hz. Final/rewound poses flush
    // immediately, and a paused intermediate pose flushes on the next tick.
    const shadowChanged = lastShadowProgress !== state.progress && (now - lastShadowTime >= 1000 / 30 || state.progress === 0 || state.progress === 1);
    if (!document.hidden && (window.__FILM__ || needsFrame || cameraChanged || transition || progressChanged || shadowChanged)) {
      if (shadowChanged) {
        renderer.shadowMap.needsUpdate = true;
        lastShadowProgress = state.progress;
        lastShadowTime = now;
      }
      renderer.render(scene, camera);
      needsFrame = false;
      lastProgress = state.progress;
    }
    requestAnimationFrame(render);
  };
  requestAnimationFrame(render);
  return {
    renderer, scene, camera, controls,
    setProgress: (p) => (state.progress = p),
    setView: (v) => (state.view = v),
  };
}
