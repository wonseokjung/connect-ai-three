// Mechanical butterfly: a clockwork butterfly of brass and gold that assembles itself out of the dark, winds up and
// starts to fly. Gears turn in mesh, a crank on its back drives push rods into the wing levers, so every wing beat comes
// from the mechanism. Filigree wing frames with enamel panels, rivets, a glowing heart, dust in the light.
//
// Written from scratch for connect-ai-three after a prompt shared publicly on X by thtbee_
// ("create a beautiful mechanical butterfly in three.js"). No code, model, texture or sound from anywhere else: every
// shape is built here, the reflections come from three.js RoomEnvironment.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const FILM = !!window.__FILM__;
if (FILM) for (const el of document.querySelectorAll('.ui')) el.style.display = 'none';

// ---------------------------------------------------------------- renderer, scene, light
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(FILM ? 1 : Math.min(window.devicePixelRatio, 2)); // fixed, never adaptive
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x040302);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

const key = new THREE.DirectionalLight(0xffc982, 2.5); // warm gold key
key.position.set(3, 4.5, 4);
scene.add(key);
const rim = new THREE.DirectionalLight(0x9cc4ff, 1.4); // cool edge from behind
rim.position.set(-4, 2, -5);
scene.add(rim);
const under = new THREE.PointLight(0xff9a3c, 2.5, 6, 2); // warm bounce from below
under.position.set(0, -1.6, 0.6);
scene.add(under);

const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.05, 100);
const target = new THREE.Vector3(0, 0, -0.25);

// ---------------------------------------------------------------- materials
const M = {
  gold: new THREE.MeshPhysicalMaterial({ color: 0xd9a44c, metalness: 1, roughness: 0.26, clearcoat: 0.35, clearcoatRoughness: 0.2 }),
  brass: new THREE.MeshPhysicalMaterial({ color: 0xb98236, metalness: 1, roughness: 0.34 }),
  rose: new THREE.MeshPhysicalMaterial({ color: 0xd08a5c, metalness: 1, roughness: 0.3 }),
  steel: new THREE.MeshPhysicalMaterial({ color: 0x8c8f96, metalness: 1, roughness: 0.3 }),
  dark: new THREE.MeshPhysicalMaterial({ color: 0x1b1712, metalness: 0.9, roughness: 0.45 }),
  eye: new THREE.MeshPhysicalMaterial({ color: 0x120a04, metalness: 0.2, roughness: 0.05, clearcoat: 1, emissive: 0xffa23a, emissiveIntensity: 0 }),
  heart: new THREE.MeshStandardMaterial({ color: 0x2a1404, emissive: 0xff8a24, emissiveIntensity: 0 }),
  panel: new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 0.15, roughness: 0.32, clearcoat: 0.45, clearcoatRoughness: 0.3, iridescence: 0.9, iridescenceIOR: 1.45, iridescenceThicknessRange: [180, 520],
    transparent: true, opacity: 0.66, side: THREE.DoubleSide, depthWrite: false, emissive: 0x3a1c06, emissiveIntensity: 0.22 }),
  spot: new THREE.MeshPhysicalMaterial({ color: 0x7a0f14, metalness: 0.2, roughness: 0.1, clearcoat: 1, emissive: 0x5a0a0c, emissiveIntensity: 0.5 }),
};

// ---------------------------------------------------------------- shapes
// a gear: trapezoid teeth, a hub hole and spoke windows, extruded with a small bevel; axis = local z
function gearGeometry(teeth, r, depth = 0.018, spokes = 5) {
  const h = r * 0.16 + 0.006, s = new THREE.Shape(), w = (Math.PI * 2) / teeth;
  for (let k = 0; k < teeth; k++) {
    const a = k * w, pts = [[r, a], [r + h, a + w * 0.18], [r + h, a + w * 0.42], [r, a + w * 0.6]];
    for (const [rr, aa] of pts) (k === 0 && rr === r && aa === a ? s.moveTo : s.lineTo).call(s, rr * Math.cos(aa), rr * Math.sin(aa));
  }
  s.closePath();
  const hub = new THREE.Path();
  hub.absarc(0, 0, r * 0.12, 0, Math.PI * 2, true);
  s.holes.push(hub);
  if (r > 0.05) {
    const rin = r * 0.3, rout = r * 0.74, span = ((Math.PI * 2) / spokes) * 0.64;
    for (let i = 0; i < spokes; i++) {
      const a0 = (i / spokes) * Math.PI * 2, p = new THREE.Path();
      p.absarc(0, 0, rout, a0, a0 + span, false);
      p.absarc(0, 0, rin, a0 + span, a0, true);
      p.closePath();
      s.holes.push(p);
    }
  }
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.003, bevelSegments: 1, curveSegments: 10 });
  g.translate(0, 0, -depth / 2);
  return g;
}
const tube = (pts, r, closed = false, seg) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, closed), seg || Math.max(8, pts.length * 6), r, 6, closed);
const v = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- the butterfly (head at +z)
const root = new THREE.Group();
scene.add(root);
const parts = []; // everything that flies in during assembly: {obj, delay}
const part = (obj, delay, parent = root) => { parent.add(obj); parts.push({ obj, delay }); return obj; };

// thorax: an openwork cage of rings and ribs around a glowing heart
const TH = { z: 0.18, rx: 0.19, ry: 0.16, rz: 0.24 };
{
  const cage = [];
  for (let i = -3; i <= 3; i++) {
    const zz = (i / 3.4) * TH.rz, k = Math.sqrt(1 - (zz / TH.rz) ** 2);
    const t = new THREE.TorusGeometry(1, 0.012, 6, 40);
    t.scale(TH.rx * k, TH.ry * k, 1);
    t.translate(0, 0, TH.z + zz);
    cage.push(t);
  }
  for (let j = 0; j < 8; j++) {
    const a = (j / 8) * Math.PI * 2, pts = [];
    for (let i = 0; i <= 12; i++) {
      const u = -1 + (2 * i) / 12, k = Math.sqrt(Math.max(0, 1 - u * u * 0.94));
      pts.push(v(Math.cos(a) * TH.rx * k, Math.sin(a) * TH.ry * k, TH.z + u * TH.rz * 0.97));
    }
    cage.push(tube(pts, 0.008));
  }
  part(new THREE.Mesh(mergeGeometries(cage), M.gold), 0.25);
  part(new THREE.Mesh(new THREE.SphereGeometry(0.075, 24, 16).translate(0, 0, TH.z), M.heart), 0.1);
  // a dark inner frame so the cage reads against the heart
  part(new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.44, 12).rotateX(Math.PI / 2).translate(0, 0, TH.z), M.dark), 0.15);
}

// head, eyes, proboscis, antennae
{
  const head = new THREE.Group();
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.105, 32, 20).translate(0, 0.01, 0.52), M.brass));
  head.add(new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.01, 6, 32).translate(0, 0, 0.47), M.gold));
  for (const s of [-1, 1]) {
    head.add(new THREE.Mesh(new THREE.SphereGeometry(0.062, 24, 16).translate(s * 0.075, 0.035, 0.56), M.eye));
    head.add(new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.007, 6, 24).rotateY((s * Math.PI) / 2.6).translate(s * 0.078, 0.035, 0.56), M.gold));
    // antenna: a fine curve with a knob and three collars
    const pts = [v(s * 0.03, 0.1, 0.56), v(s * 0.08, 0.24, 0.68), v(s * 0.17, 0.36, 0.86), v(s * 0.28, 0.4, 1.02)];
    head.add(new THREE.Mesh(tube(pts, 0.007), M.gold));
    head.add(new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 10).translate(s * 0.29, 0.402, 1.03), M.rose));
    const c = new THREE.CatmullRomCurve3(pts);
    for (const u of [0.3, 0.55, 0.78]) {
      const p = c.getPoint(u);
      head.add(new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8).translate(p.x, p.y, p.z), M.brass));
    }
  }
  // proboscis: a coiled spring under the head
  const coil = [];
  for (let i = 0; i <= 60; i++) {
    const a = i * 0.32, r = 0.055 * (1 - i / 75);
    coil.push(v(0, -0.08 - r * Math.cos(a) + 0.03, 0.6 + 0.02 + r * Math.sin(a)));
  }
  head.add(new THREE.Mesh(tube(coil, 0.0055, false, 160), M.gold));
  part(head, 0.35);
}

// abdomen: tapered segments, gold and dark steel, with collars
{
  for (let i = 0; i < 9; i++) {
    const z = -0.1 - i * 0.105, r0 = 0.12 * (1 - i / 11) + 0.02, r1 = 0.12 * (1 - (i + 1) / 11) + 0.02;
    const seg = new THREE.Group();
    seg.add(new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, 0.09, 28).rotateX(-Math.PI / 2).translate(0, 0, z), i % 2 ? M.dark : M.brass));
    seg.add(new THREE.Mesh(new THREE.TorusGeometry(r0 + 0.004, 0.009, 6, 32).translate(0, 0, z + 0.047), M.gold));
    part(seg, 0.55 + i * 0.07);
  }
  part(new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 20).rotateX(-Math.PI / 2).translate(0, 0, -1.08), M.gold), 1.2);
}

// legs: three pairs of jointed steel legs under the thorax
{
  const legs = [];
  for (const s of [-1, 1]) {
    for (const [z, sp] of [[0.3, 0.5], [0.18, 0.1], [0.06, -0.35]]) {
      const pts = [v(s * 0.06, -0.12, z), v(s * 0.2, -0.2, z + sp * 0.1), v(s * 0.3, -0.42, z + sp * 0.25), v(s * 0.34, -0.5, z + sp * 0.32)];
      legs.push(tube(pts, 0.007));
      legs.push(new THREE.SphereGeometry(0.014, 10, 8).translate(pts[1].x, pts[1].y, pts[1].z));
    }
  }
  part(new THREE.Mesh(mergeGeometries(legs), M.steel), 0.45);
}

// ---------------------------------------------------------------- gears and the crank
const gears = []; // {mesh, ratio, phase}: angle = phase + ratio * crank
function addGear(teeth, r, pos, axis, ratio, phase, mat, delay, depth) {
  const m = new THREE.Mesh(gearGeometry(teeth, r, depth), mat);
  const holder = new THREE.Group();
  holder.position.copy(pos);
  if (axis === 'x') holder.rotation.y = Math.PI / 2;
  if (axis === 'y') holder.rotation.x = -Math.PI / 2;
  holder.add(m);
  // an axle pin and a cap so it reads as a real part
  holder.add(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.12, r * 0.12, 0.05, 12).rotateX(Math.PI / 2), M.steel));
  holder.add(new THREE.Mesh(new THREE.SphereGeometry(r * 0.14, 12, 8).translate(0, 0, 0.022), M.gold));
  part(holder, delay);
  gears.push({ mesh: m, ratio, phase });
  return holder;
}
// the crank axle runs along x through the top of the thorax
const CR = { y: 0.24, z: 0.2, r: 0.052 };
for (const s of [-1, 1]) {
  const x = s * 0.205;
  const T1 = 18, r1 = 0.09, T2 = 11, r2 = 0.055, T3 = 14, r3 = 0.07;
  const h1 = r1 * 0.16 + 0.006;
  addGear(T1, r1, v(x, CR.y, CR.z), 'x', s, 0, M.gold, 0.6 + (s > 0 ? 0.1 : 0));
  const d12 = r1 + r2 + h1 * 0.95, a12 = -1.05;
  addGear(T2, r2, v(x, CR.y + Math.sin(a12) * d12, CR.z + Math.cos(a12) * d12), 'x', (-s * T1) / T2, Math.PI / T2, M.rose, 0.75);
  const d13 = r1 + r3 + h1 * 0.95, a13 = -2.45;
  addGear(T3, r3, v(x, CR.y + Math.sin(a13) * d13, CR.z + Math.cos(a13) * d13), 'x', (-s * T1) / T3, Math.PI / T3, M.brass, 0.85);
}
// the mainspring barrel on the back of the abdomen: a flat gear and a coiled spring
{
  addGear(24, 0.11, v(0, 0.135, -0.2), 'y', 0.12, 0, M.brass, 0.9, 0.022);
  const spiral = [];
  for (let i = 0; i <= 90; i++) {
    const a = i * 0.21, r = 0.012 + 0.0009 * i;
    spiral.push(v(Math.cos(a) * r, 0.162, -0.2 + Math.sin(a) * r));
  }
  part(new THREE.Mesh(tube(spiral, 0.0035, false, 240), M.gold), 1.0);
  addGear(12, 0.055, v(0.11 + 0.055 + 0.024, 0.135, -0.2 + 0.035), 'y', -0.24, Math.PI / 12, M.gold, 0.95, 0.02);
}
// the crank: a disc on the axle with a pin; the pin drives the push rods
const crank = new THREE.Group();
crank.position.set(0, CR.y, CR.z);
{
  crank.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 32).rotateZ(Math.PI / 2), M.gold));
  crank.add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.44, 12).rotateZ(Math.PI / 2), M.steel)); // axle
  crank.add(new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.07, 10).rotateZ(Math.PI / 2).translate(0, CR.r, 0), M.steel)); // pin
}
part(crank, 0.65);
const pin = new THREE.Object3D();
pin.position.set(0, CR.r, 0);
crank.add(pin);

// ---------------------------------------------------------------- wings
// outline points (x outward from the hinge, z forward), filled as a fan from the root so colours run root -> edge
const FORE = [[0.02, 0.16], [0.45, 0.42], [1.0, 0.72], [1.5, 0.84], [1.7, 0.64], [1.58, 0.26], [1.22, -0.02], [0.66, -0.14], [0.16, -0.12]];
const HIND = [[0.02, -0.1], [0.5, -0.12], [1.0, -0.3], [1.26, -0.62], [1.14, -1.0], [0.82, -1.24], [0.62, -1.58], [0.44, -1.26], [0.16, -0.76], [0.02, -0.36]];
const COL = { root: new THREE.Color(0xe08a1e), mid: new THREE.Color(0x8a2a10), edge: new THREE.Color(0x0d5560), rim: new THREE.Color(0xd9a44c) };

function wing(outline, rootPt, veins, hind) {
  const curve = new THREE.CatmullRomCurve3(outline.map(([x, z]) => v(x, 0, z)), true, 'centripetal');
  const N = 160, R = 12, edge = curve.getSpacedPoints(N).slice(0, N);
  const o = v(rootPt[0], 0, rootPt[1]);
  // panel: a fan of rings from the root to the outline
  const pos = [], col = [], idx = [], c = new THREE.Color();
  for (let j = 0; j <= R; j++) {
    const f = j / R;
    for (let i = 0; i < N; i++) {
      const p = o.clone().lerp(edge[i], f);
      pos.push(p.x, p.y, p.z);
      if (f < 0.5) c.copy(COL.root).lerp(COL.mid, f / 0.5);
      else c.copy(COL.mid).lerp(COL.edge, Math.min(1, (f - 0.5) / 0.42));
      if (f > 0.9) c.lerp(COL.rim, (f - 0.9) * 4);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let j = 0; j < R; j++) for (let i = 0; i < N; i++) {
    const a = j * N + i, b = j * N + ((i + 1) % N), cc = a + N, d = b + N;
    idx.push(a, b, d, a, d, cc);
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  pg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  pg.setIndex(idx);
  pg.computeVertexNormals();
  const g = new THREE.Group();
  g.add(new THREE.Mesh(pg, M.panel));
  // frame: outline, veins from the root, cross veins between them (the filigree cells), rings, rivets
  const frame = [tube(edge.map((p) => p.clone().setY(0.004)), 0.017, true, 240)], rivets = [];
  const at = (i, f) => o.clone().lerp(edge[((i % N) + N) % N], f).setY(0.004);
  for (const i of veins) {
    const a = at(i, 0.04), b = at(i, 1), mid = a.clone().lerp(b, 0.5);
    mid.add(v(0, 0.012, 0));
    frame.push(tube([a, mid, b], 0.0085, false, 24));
    rivets.push(b);
  }
  for (let k = 0; k < veins.length - 1; k++) {
    const i0 = veins[k], i1 = veins[k + 1];
    for (const f of [0.42, 0.68, 0.86]) {
      if (f === 0.42 && k % 2) continue;
      const pts = [];
      for (let i = i0; i <= i1; i += 2) pts.push(at(i, f + 0.035 * Math.sin(((i - i0) / (i1 - i0)) * Math.PI)));
      frame.push(tube(pts, 0.0055, false, 24));
      rivets.push(pts[0], pts[pts.length - 1]);
    }
    // a small ring ornament in the outer cell
    const m = at(Math.round((i0 + i1) / 2), 0.77);
    const ring = new THREE.TorusGeometry(0.035, 0.005, 6, 20).rotateX(Math.PI / 2).translate(m.x, m.y, m.z);
    frame.push(ring);
  }
  g.add(new THREE.Mesh(mergeGeometries(frame), M.gold));
  g.add(new THREE.Mesh(mergeGeometries(rivets.map((p) => new THREE.SphereGeometry(0.014, 10, 8).translate(p.x, p.y + 0.004, p.z))), M.rose));
  if (hind) { // an eye spot on the hind wing: enamel disc in a gold bezel
    const p = at(Math.round(N * 0.28), 0.66);
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.012, 32).translate(p.x, 0.006, p.z), M.spot));
    g.add(new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.014, 8, 40).rotateX(Math.PI / 2).translate(p.x, 0.008, p.z), M.gold));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 10).translate(p.x, 0.012, p.z), M.gold));
  }
  return g;
}

// each side: a hinge group (rotates about z) holding the fore wing and its lever, and a second hinge for the hind wing
const HINGE = { x: 0.16, y: 0.1, z: 0.2 };
const sides = [];
for (const s of [-1, 1]) {
  const mirror = new THREE.Group();
  mirror.scale.x = s; // the left side is the right side mirrored
  root.add(mirror);
  const fore = new THREE.Group(), hind = new THREE.Group();
  fore.position.set(HINGE.x, HINGE.y, HINGE.z);
  hind.position.set(HINGE.x, HINGE.y - 0.02, HINGE.z - 0.04);
  mirror.add(fore, hind);
  part(wing(FORE, [0.03, 0.04], [6, 22, 38, 52, 64, 78, 96, 116, 140], false), 1.3 + (s > 0 ? 0.15 : 0), fore);
  part(wing(HIND, [0.03, -0.1], [4, 20, 36, 52, 68, 84, 104, 128], true), 1.5 + (s > 0 ? 0.15 : 0), hind);
  // the lever: a short arm from the hinge inward and up, where the push rod grabs the wing
  const lever = new THREE.Group();
  lever.add(new THREE.Mesh(tube([v(0, 0, 0), v(-0.05, 0.045, 0), v(-0.1, 0.07, 0)], 0.011, false, 12), M.gold));
  lever.add(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.05, 14).rotateX(Math.PI / 2), M.steel)); // hinge barrel
  const tip = new THREE.Object3D();
  tip.position.set(-0.1, 0.07, 0);
  lever.add(tip);
  part(lever, 1.15, fore);
  sides.push({ fore, hind, tip });
}
// push rods from the crank pin to the levers, laid out every frame
const rods = [0, 1].map(() => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1, 10), M.steel);
  root.add(m);
  return m;
});
const UP = v(0, 1, 0), _a = v(0, 0, 0), _b = v(0, 0, 0), _d = v(0, 0, 0);
function layRods(alpha) {
  root.updateMatrixWorld(true);
  pin.getWorldPosition(_a);
  root.worldToLocal(_a);
  sides.forEach((s, i) => {
    s.tip.getWorldPosition(_b);
    root.worldToLocal(_b);
    _d.subVectors(_b, _a);
    const r = rods[i];
    r.position.copy(_a).addScaledVector(_d, 0.5);
    r.scale.set(1, _d.length(), 1);
    r.quaternion.setFromUnitVectors(UP, _d.normalize());
    r.visible = alpha > 0.02;
  });
}

// the whole butterfly sits a little turned and tilted
root.rotation.set(-0.1, 0, 0);

// ---------------------------------------------------------------- dust in the light, sparks when it winds up
function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,240,210,1)');
  gr.addColorStop(0.35, 'rgba(255,200,120,.45)');
  gr.addColorStop(1, 'rgba(255,170,80,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const DOT = dotTexture();
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const DUST = 420, dustBase = new Float32Array(DUST * 3), dustPos = new Float32Array(DUST * 3);
for (let i = 0; i < DUST; i++) {
  dustBase[i * 3] = (rnd() - 0.5) * 9;
  dustBase[i * 3 + 1] = (rnd() - 0.5) * 5;
  dustBase[i * 3 + 2] = (rnd() - 0.5) * 9;
}
const dustGeo = new THREE.BufferGeometry();
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ map: DOT, size: 0.045, color: 0xffd9a0, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
scene.add(dust);

const SPARKS = 90, sparkPos = new Float32Array(SPARKS * 3), sparkVel = new Float32Array(SPARKS * 3);
const sparkGeo = new THREE.BufferGeometry();
sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
const sparkMat = new THREE.PointsMaterial({ map: DOT, size: 0.06, color: 0xffb04a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
const sparks = new THREE.Points(sparkGeo, sparkMat);
sparks.frustumCulled = false;
root.add(sparks);
let sparkT = -1;
function burst() {
  sparkT = 0;
  for (let i = 0; i < SPARKS; i++) {
    sparkPos.set([0, CR.y + 0.05, CR.z], i * 3);
    const a = rnd() * Math.PI * 2, up = 0.6 + rnd() * 1.2, out = 0.3 + rnd() * 0.9;
    sparkVel.set([Math.cos(a) * out, up, Math.sin(a) * out], i * 3);
  }
}

// ---------------------------------------------------------------- the story: assemble, wind up, fly
for (const p of parts) {
  p.home = p.obj.position.clone();
  p.homeQ = p.obj.quaternion.clone();
  const d = v(rnd() - 0.5, rnd() - 0.3, rnd() - 0.5).normalize();
  p.from = d.multiplyScalar(1.6 + rnd() * 1.4);
  p.spin = new THREE.Quaternion().setFromAxisAngle(v(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(), 1.5 + rnd() * 2);
}
const ASSEMBLE = 1.25, WAKE = 3.1;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const _q = new THREE.Quaternion();

let crankAngle = 0, woke = false;
function update(t, dt) {
  // parts fly in from the dark and lock into place
  for (const p of parts) {
    const k = easeOut((t - p.delay * 1.0) / ASSEMBLE);
    p.obj.position.copy(p.home).addScaledVector(p.from, 1 - k);
    _q.identity().slerp(p.spin, 1 - k);
    p.obj.quaternion.copy(p.homeQ).premultiply(_q);
  }
  // wind up: the heart and eyes light, the crank starts, the wings beat
  const run = smooth((t - WAKE) / 1.4);
  if (!woke && t >= WAKE) { woke = true; burst(); }
  M.heart.emissiveIntensity = 0.2 + 2.4 * smooth((t - WAKE + 0.4) / 1.0);
  M.eye.emissiveIntensity = 1.3 * smooth((t - WAKE) / 0.8);
  crankAngle += dt * Math.PI * 2 * 1.05 * run;
  crank.rotation.x = crankAngle;
  for (const g of gears) g.mesh.rotation.z = g.phase + g.ratio * crankAngle;
  // the wings follow the lever: pin up pulls the inner arm up, so the wing goes down
  const beat = -Math.sin(crankAngle), A = 0.62 * run;
  for (const s of sides) {
    s.fore.rotation.z = 0.12 + A * beat;
    s.hind.rotation.z = 0.08 + A * 0.88 * -Math.sin(crankAngle - 0.32);
    s.fore.rotation.y = 0.05 * run * Math.cos(crankAngle); // a little twist, like a real stroke
  }
  // hover: rise on the down stroke, drift gently
  root.position.set(0.03 * Math.sin(t * 0.5), 0.06 * run * Math.sin(crankAngle - 1.3) + 0.04 * Math.sin(t * 0.8), 0);
  layRods(run + smooth((t - 1.6) / 0.6));
  // dust drifts, sparks fall
  for (let i = 0; i < DUST; i++) {
    const ph = i * 1.7;
    dustPos[i * 3] = dustBase[i * 3] + 0.25 * Math.sin(t * 0.13 + ph);
    dustPos[i * 3 + 1] = ((dustBase[i * 3 + 1] + t * 0.05 + 2.5) % 5) - 2.5;
    dustPos[i * 3 + 2] = dustBase[i * 3 + 2] + 0.25 * Math.cos(t * 0.11 + ph);
  }
  dustGeo.attributes.position.needsUpdate = true;
  if (sparkT >= 0) {
    sparkT += dt;
    for (let i = 0; i < SPARKS; i++) {
      sparkVel[i * 3 + 1] -= 2.4 * dt;
      for (let k = 0; k < 3; k++) sparkPos[i * 3 + k] += sparkVel[i * 3 + k] * dt;
    }
    sparkGeo.attributes.position.needsUpdate = true;
    sparkMat.opacity = Math.max(0, 1 - sparkT / 1.6);
    if (sparkT > 1.7) sparkT = -1;
  }
}

// ---------------------------------------------------------------- camera, controls, post
// frame the wingspan in any aspect (a phone in portrait gets the whole butterfly across its width)
function fitCamera() {
  const aspect = window.innerWidth / window.innerHeight;
  camera.aspect = aspect;
  camera.fov = aspect < 1 ? 46 : 35;
  camera.updateProjectionMatrix();
  const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), th = tv * aspect;
  // filmed 16:9 sits further back, so a wing at the top of its beat stays inside the frame
  const d = Math.max(1.95 / th, 1.56 / tv) * (FILM && aspect >= 1 ? 1.62 : 1.2);
  camera.position.copy(target).add(v(0.12, 1.5, -1).normalize().multiplyScalar(d));
  camera.lookAt(target);
}
fitCamera();
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(target);
controls.enableDamping = true;
controls.autoRotate = !FILM;
controls.autoRotateSpeed = 0.45;
controls.minDistance = 1.2;
controls.maxDistance = 14;
controls.update();

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.3, 0.5, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});
// a click winds it again: it falls apart and assembles once more
let t0 = null;
renderer.domElement.addEventListener('dblclick', () => {});
renderer.domElement.addEventListener('click', (e) => { if (!e.detail || e.detail === 1) { t0 = performance.now(); woke = false; crankAngle = 0; } });

// ---------------------------------------------------------------- loop
// The kit films with a frozen clock: hold the first frame (parts scattered in the dark) until its clock starts.
const filmStarted = () => !FILM || (window.__film && window.__film.now > 0);
let last = performance.now(), first = true;
function frame(now) {
  requestAnimationFrame(frame);
  if (t0 === null && filmStarted()) t0 = now;
  const t = t0 === null ? 0 : (now - t0) / 1000;
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  update(t, t0 === null ? 0 : dt);
  controls.update();
  composer.render();
  if (first) {
    first = false;
    window.EXAMPLE = { ready: true, renderer, scene, camera, controls, target };
  }
}
requestAnimationFrame(frame);
