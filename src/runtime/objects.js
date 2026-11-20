// Object makers. Each takes a plain definition from the spec and returns a THREE.Object3D.
// Anything that moves by itself pushes an updater (t) => void into ctx.updaters: still a pure function of time.
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {Reflector} from 'three/examples/jsm/objects/Reflector.js';
import {Line2} from 'three/examples/jsm/lines/Line2.js';
import {LineGeometry} from 'three/examples/jsm/lines/LineGeometry.js';
import {LineMaterial} from 'three/examples/jsm/lines/LineMaterial.js';
import {REG, registerObject, NEEDS} from './registry.js';
import {makeMaterial} from './materials.js';
import {BRAND} from './look.js';
import {rng, clamp, lerp, EASE, prog, fbm2, v3, DEG, GLSL_NOISE} from './util.js';

const CORE = 'three core (MIT)';
const JSM = 'three examples/jsm (MIT)';
const OURS = 'CONNECT AI LAB (MIT)';

const mesh = (geo, def, ctx, fallback = 'gold') => {
  ctx.disposables.push(geo);
  return new THREE.Mesh(geo, makeMaterial(def.material ?? fallback, ctx));
};

// --- primitives (three core) -------------------------------------------------------------------------------
const prim = (type, geo, about) => registerObject(type, (d, ctx) => mesh(geo(d), d, ctx), {source: CORE, about});
prim('box', (d) => new THREE.BoxGeometry(...v3(d.size, [1, 1, 1])), 'box');
prim('sphere', (d) => new THREE.SphereGeometry(d.radius ?? 0.6, 64, 40), 'sphere');
prim('torus', (d) => new THREE.TorusGeometry(d.radius ?? 0.6, d.tube ?? 0.16, 32, 128, (d.arc ?? 360) * DEG), 'torus (ring); "arc" in degrees opens it');
prim('knot', (d) => new THREE.TorusKnotGeometry(d.radius ?? 0.55, d.tube ?? 0.17, 220, 32, d.p ?? 2, d.q ?? 3), 'torus knot');
prim('cylinder', (d) => new THREE.CylinderGeometry(d.radius ?? 0.4, d.radiusBottom ?? d.radius ?? 0.4, d.height ?? 1, 64), 'cylinder');
prim('cone', (d) => new THREE.ConeGeometry(d.radius ?? 0.5, d.height ?? 1, 64), 'cone');
prim('capsule', (d) => new THREE.CapsuleGeometry(d.radius ?? 0.3, d.height ?? 0.7, 12, 32), 'capsule');
prim('plane', (d) => new THREE.PlaneGeometry(d.width ?? 1, d.height ?? 1), 'flat plane');
prim('disc', (d) => new THREE.CircleGeometry(d.radius ?? 0.6, 64), 'disc');
prim('ring', (d) => new THREE.RingGeometry(d.inner ?? 0.45, d.radius ?? 0.6, 96), 'flat ring');
registerObject('gem', (d, ctx) => {
  const g = d.cut === 'octa' ? new THREE.OctahedronGeometry(d.radius ?? 0.7, 0) : d.cut === 'dodeca' ? new THREE.DodecahedronGeometry(d.radius ?? 0.7, 0) : new THREE.IcosahedronGeometry(d.radius ?? 0.7, d.detail ?? 0);
  const m = mesh(g, d, ctx);
  if ('flatShading' in m.material) m.material.flatShading = true;
  return m;
}, {source: CORE, about: 'faceted gem (icosa, octa or dodeca)'});
registerObject('rounded-box', (d, ctx) => mesh(new RoundedBoxGeometry(...v3(d.size, [1, 1, 1]), 6, d.radius ?? 0.08), d, ctx), {source: JSM, about: 'box with rounded edges (RoundedBoxGeometry)'});

// --- text label: thin sans on a canvas texture, always crisp, no font files shipped --------------------------
const FONT_STACK = `"Inter", "Helvetica Neue", "Pretendard", "Apple SD Gothic Neo", system-ui, sans-serif`;
export function makeLabel(d, ctx) {
  // big type gets fewer pixels per letter so no label texture goes over 2048 px
  const px = Math.round(Math.min(110 * (d.quality ?? 1), 1900 / Math.max(1, String(d.widest ?? d.text ?? '').length * (0.64 + (d.tracking ?? 0)))));
  const weight = d.weight ?? 300;
  const font = `${weight} ${px}px ${d.fontFamily ? `"${d.fontFamily}", ` : ''}${FONT_STACK}`;
  const track = d.tracking ?? 0;
  const canvas = document.createElement('canvas');
  const c = canvas.getContext('2d');
  const widest = String(d.widest ?? d.text ?? '');
  const measure = (s) => {
    c.font = font;
    if ('letterSpacing' in c) c.letterSpacing = `${track * px}px`;
    return c.measureText(s).width;
  };
  const padX = px * 0.25, padY = px * 0.32;
  const tw = Math.max(8, measure(widest));
  canvas.width = Math.min(8192, Math.ceil(tw + padX * 2));
  canvas.height = Math.ceil(px + padY * 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  ctx.disposables.push(tex);
  ctx.textures.push({name: 'label:' + widest.slice(0, 24), width: canvas.width, height: canvas.height});
  const color = d.color || ctx.palette.text;
  let last = null;
  const draw = (s, accentFrom = -1) => {
    if (s === last) return;
    last = s;
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.font = font;
    if ('letterSpacing' in c) c.letterSpacing = `${track * px}px`;
    c.textBaseline = 'middle';
    c.textAlign = d.align === 'left' ? 'left' : 'center';
    c.fillStyle = color;
    c.fillText(s, d.align === 'left' ? padX : canvas.width / 2, canvas.height / 2 + px * 0.04);
    tex.needsUpdate = true;
  };
  draw(String(d.text ?? ''));
  const h = d.size ?? 0.28;
  const w = (h * canvas.width) / canvas.height;
  const geo = new THREE.PlaneGeometry(w, h);
  ctx.disposables.push(geo);
  const mat = new THREE.MeshBasicMaterial({map: tex, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide});
  mat.userData.baseOpacity = 1;
  ctx.disposables.push(mat);
  const m = new THREE.Mesh(geo, mat);
  m.userData.setText = draw;
  m.userData.text = String(d.text ?? '');
  m.userData.isLabel = true;
  m.userData.labelWorldHeight = h * (px / canvas.height);
  m.castShadow = false;
  m.userData.noShadow = true;
  if (d.billboard) m.userData.billboard = true;
  return m;
}
registerObject('label', makeLabel, {source: OURS, about: 'thin sans text label (canvas texture, crisp at any size)'});

// --- card: frosted glass panel with a kicker, a title and a thin gold rule ---------------------------------
registerObject('card', (d, ctx) => {
  const g = new THREE.Group();
  const w = d.width ?? 2.4, h = d.height ?? 1.4, depth = d.depth ?? 0.06;
  const panel = mesh(new RoundedBoxGeometry(w, h, depth, 6, Math.min(0.12, h * 0.12)), {material: d.material ?? 'smoked'}, ctx);
  panel.userData.part = 'panel';
  g.add(panel);
  const z = depth / 2 + 0.012;
  if (d.kicker) {
    const k = makeLabel({text: String(d.kicker).toUpperCase(), size: h * 0.1, tracking: 0.22, weight: 400, color: d.accent || ctx.palette.accent, align: 'left'}, ctx);
    k.position.set(-w / 2 + h * 0.14 + k.geometry.parameters.width / 2, h * 0.3, z);
    g.add(k);
  }
  if (d.title) {
    const t = makeLabel({text: d.title, size: Math.min(h * 0.3, (w * 0.86) / Math.max(4, String(d.title).length) / 0.42), weight: 200, color: d.color || ctx.palette.text}, ctx);
    t.position.set(0, d.kicker ? -h * 0.02 : 0.04, z);
    g.add(t);
  }
  if (d.text) {
    const b = makeLabel({text: d.text, size: h * 0.09, weight: 300, color: d.color || ctx.palette.text}, ctx);
    b.material.opacity = b.material.userData.baseOpacity = 0.72;
    b.position.set(0, -h * 0.28, z);
    g.add(b);
  }
  if (d.rule !== false) {
    const rg = new THREE.PlaneGeometry(w * 0.16, Math.max(0.006, h * 0.008));
    ctx.disposables.push(rg);
    const rm = new THREE.MeshBasicMaterial({color: d.accent || ctx.palette.accent, toneMapped: false});
    ctx.disposables.push(rm);
    const r = new THREE.Mesh(rg, rm);
    r.position.set(-w / 2 + h * 0.14 + w * 0.08, d.kicker ? h * 0.2 : h * 0.3, z);
    r.userData.noShadow = true;
    g.add(r);
  }
  return g;
}, {source: OURS + ' on RoundedBoxGeometry', about: 'frosted glass card with kicker, title and gold rule'});

// --- image on a plane (your own screenshots, photos, renders) ----------------------------------------------
registerObject('image', async (d, ctx) => {
  const tex = await ctx.loadTexture(d.src);
  const a = tex.image.width / tex.image.height;
  const h = d.height ?? 1.4, w = d.width ?? h * a;
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(w, h);
  ctx.disposables.push(geo);
  const mat = new THREE.MeshBasicMaterial({map: tex, toneMapped: false});
  mat.userData.baseOpacity = 1;
  ctx.disposables.push(mat);
  const pic = new THREE.Mesh(geo, mat);
  pic.position.z = 0.031;
  g.add(pic);
  if (d.frame !== false) g.add(mesh(new RoundedBoxGeometry(w + 0.08, h + 0.08, 0.06, 4, 0.04), {material: d.material ?? 'black'}, ctx));
  return g;
}, {source: CORE, about: 'your image on a framed plane'});

// --- floors ---------------------------------------------------------------------------------------------
registerObject('floor', (d, ctx) => {
  const size = d.size ?? 160;
  const kind = d.kind ?? 'mirror';
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(size, size);
  ctx.disposables.push(geo);
  if (kind === 'mirror') {
    const res = Math.round(Math.min(1024, ctx.size.height * 0.75) * (ctx.mode === 'web' ? 0.75 : 1));
    const refl = new Reflector(geo, {clipBias: 0.003, textureWidth: Math.round(res * (ctx.size.width / ctx.size.height)), textureHeight: res, color: new THREE.Color(d.color || '#8a8f99')});
    refl.rotation.x = -Math.PI / 2;
    refl.userData.noShadow = true;
    ctx.disposables.push({dispose: () => refl.dispose()});
    g.add(refl);
    // a dark veil just above the mirror: keeps the reflection soft and the floor black
    const veil = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({color: d.tint || ctx.palette.base, transparent: true, opacity: d.dim ?? 0.62, depthWrite: false}));
    veil.material.userData.baseOpacity = veil.material.opacity;
    ctx.disposables.push(veil.material);
    veil.rotation.x = -Math.PI / 2;
    veil.position.y = 0.002;
    veil.userData.noShadow = true;
    g.add(veil);
  } else if (kind === 'shadow') {
    const m = new THREE.Mesh(geo, makeMaterial({preset: 'shadow', opacity: d.opacity ?? 0.42}, ctx));
    m.rotation.x = -Math.PI / 2;
    m.receiveShadow = true;
    m.userData.noShadow = true;
    g.add(m);
  } else if (kind === 'grid') {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {uColor: {value: new THREE.Color(d.color || ctx.palette.text)}, uCell: {value: d.cell ?? 1.0}, uFade: {value: d.fade ?? 22.0}, uAlpha: {value: d.opacity ?? 0.35}},
      vertexShader: /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uCell; uniform float uFade; uniform float uAlpha; varying vec3 vW;
        float gridLine(vec2 p, float cell){ vec2 q = p / cell; vec2 g = abs(fract(q - 0.5) - 0.5) / fwidth(q); return 1.0 - min(min(g.x, g.y), 1.0); }
        void main(){ float a = max(gridLine(vW.xz, uCell) * 0.9, gridLine(vW.xz, uCell * 5.0));
          float fade = 1.0 - smoothstep(uFade * 0.25, uFade, length(vW.xz - cameraPosition.xz));
          gl_FragColor = vec4(uColor, a * fade * uAlpha); }`,
    });
    mat.userData.baseOpacity = 1;
    ctx.disposables.push(mat);
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.userData.noShadow = true;
    g.add(m);
  } else {
    const m = new THREE.Mesh(geo, makeMaterial(d.material ?? {preset: 'black', roughness: 0.7}, ctx));
    m.rotation.x = -Math.PI / 2;
    m.receiveShadow = true;
    m.userData.noShadow = true;
    g.add(m);
  }
  g.userData.isFloor = true;
  return g;
}, {source: JSM + ' Reflector + CONNECT AI LAB', about: 'floor: mirror, shadow catcher, grid or matte'});

// --- lines (fat lines that keep their width at any zoom) ----------------------------------------------------
function fatLine(points, d, ctx) {
  const geo = new LineGeometry();
  geo.setPositions(points.flatMap((p) => [p.x, p.y, p.z]));
  const mat = new LineMaterial({color: new THREE.Color(d.color || ctx.palette.accent).getHex(), linewidth: d.width ?? 3, transparent: true, opacity: d.opacity ?? 1, worldUnits: false});
  mat.resolution.set(ctx.size.width, ctx.size.height);
  mat.userData.baseOpacity = mat.opacity;
  ctx.disposables.push(geo, mat);
  ctx.resizers.push((w, h) => mat.resolution.set(w, h));
  const line = new Line2(geo, mat);
  line.computeLineDistances();
  const segs = points.length - 1;
  line.userData.setDraw = (k) => {
    geo.instanceCount = Math.max(0, Math.round(clamp(k) * segs));
  };
  line.userData.noShadow = true;
  return line;
}
const CURVES = {
  helix: (d) => Array.from({length: 240}, (_, i) => {
    const k = i / 239, a = k * Math.PI * 2 * (d.turns ?? 3);
    return new THREE.Vector3(Math.cos(a) * (d.radius ?? 1), (k - 0.5) * (d.height ?? 2.2), Math.sin(a) * (d.radius ?? 1));
  }),
  swoosh: (d) => Array.from({length: 200}, (_, i) => {
    const k = i / 199, a = lerp(-2.2, 2.4, k);
    return new THREE.Vector3(Math.sin(a) * (d.radius ?? 1.6) * (0.6 + 0.4 * k), Math.sin(a * 1.7) * 0.45 + (k - 0.5) * 0.8, Math.cos(a) * (d.radius ?? 1.6) * 0.8);
  }),
  orbit: (d) => Array.from({length: 181}, (_, i) => {
    const a = (i / 180) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(a) * (d.radius ?? 1.4), Math.sin(a * 2) * 0.12, Math.sin(a) * (d.radius ?? 1.4));
  }),
  wave: (d) => Array.from({length: 200}, (_, i) => {
    const k = i / 199;
    return new THREE.Vector3((k - 0.5) * (d.length ?? 5), Math.sin(k * Math.PI * 2 * (d.turns ?? 2)) * (d.amp ?? 0.4), 0);
  }),
};
const curvePoints = (d) => {
  if (Array.isArray(d.points)) {
    const pts = d.points.map((p) => new THREE.Vector3(...p));
    return d.smooth === false || pts.length < 3 ? pts : new THREE.CatmullRomCurve3(pts, !!d.closed).getPoints(Math.max(60, pts.length * 24));
  }
  return (CURVES[d.curve] || CURVES.swoosh)(d);
};
registerObject('line', (d, ctx) => fatLine(curvePoints(d), d, ctx), {source: JSM + ' Line2', about: 'fat line along points or a curve preset; can draw itself'});
registerObject('ribbon', (d, ctx) => {
  const pts = curvePoints(d);
  const curve = new THREE.CatmullRomCurve3(pts, !!d.closed);
  const tubular = 320, radial = 14;
  const geo = new THREE.TubeGeometry(curve, tubular, d.thickness ?? 0.035, radial, !!d.closed);
  const m = mesh(geo, d, ctx);
  m.userData.setDraw = (k) => geo.setDrawRange(0, Math.round(clamp(k) * tubular) * radial * 6);
  return m;
}, {source: CORE + ' TubeGeometry', about: 'solid ribbon/tube along a curve; can draw itself'});

// --- rings: a gyroscope of metal rings around a core -------------------------------------------------------
registerObject('rings', (d, ctx) => {
  const g = new THREE.Group();
  const n = d.count ?? 4, R = d.radius ?? 1;
  const speed = d.speed ?? 1;
  const rings = [];
  for (let i = 0; i < n; i++) {
    const r = R * (1 - i * (0.62 / n));
    const m = mesh(new THREE.TorusGeometry(r, d.tube ?? 0.022 + 0.004 * (n - i), 24, 200), {material: i % 2 ? d.material2 ?? 'steel' : d.material ?? 'gold'}, ctx);
    g.add(m);
    rings.push(m);
  }
  if (d.core !== false) {
    const core = mesh(new THREE.IcosahedronGeometry(R * 0.2, 0), {material: d.coreMaterial ?? 'glow'}, ctx);
    if ('flatShading' in core.material) core.material.flatShading = true;
    g.add(core);
  }
  ctx.updaters.push((t) => {
    rings.forEach((m, i) => {
      const a = t * speed * (0.5 + i * 0.22) + i * 1.3;
      m.rotation.set(Math.PI / 2 + Math.sin(a * 0.7) * 1.1 * (i % 2 ? 1 : -1), a * (i % 2 ? -1 : 1), i * 0.6);
    });
  });
  return g;
}, {source: OURS, about: 'gyroscope of metal rings around a glowing core'});

// --- instances: one mesh drawn many times in one draw call -------------------------------------------------
const SHAPES = {
  box: (s) => new RoundedBoxGeometry(s, s, s, 3, s * 0.12),
  sphere: (s) => new THREE.SphereGeometry(s * 0.5, 24, 16),
  bar: (s) => new THREE.BoxGeometry(s, 1, s),
  gem: (s) => new THREE.IcosahedronGeometry(s * 0.55, 0),
  coin: (s) => new THREE.CylinderGeometry(s * 0.5, s * 0.5, s * 0.12, 40),
};
registerObject('instances', (d, ctx) => {
  const rnd = rng(d.seed ?? 'instances');
  const layout = d.layout ?? 'grid';
  const cols = d.cols ?? 14, rows = d.rows ?? 14;
  const count = layout === 'grid' || layout === 'wave' ? cols * rows : d.count ?? 160;
  const s = d.size ?? 0.22, gap = d.spacing ?? 0.34;
  const geo = (SHAPES[d.shape] || SHAPES.box)(s);
  ctx.disposables.push(geo);
  const im = new THREE.InstancedMesh(geo, makeMaterial(d.material ?? 'gold-brushed', ctx), count);
  const base = [];
  for (let i = 0; i < count; i++) {
    let p;
    if (layout === 'grid' || layout === 'wave') p = [((i % cols) - (cols - 1) / 2) * gap, 0, (Math.floor(i / cols) - (rows - 1) / 2) * gap];
    else if (layout === 'ring') {
      const a = (i / count) * Math.PI * 2;
      p = [Math.cos(a) * (d.radius ?? 1.6), 0, Math.sin(a) * (d.radius ?? 1.6)];
    } else if (layout === 'spiral') {
      const a = i * 0.42, r = 0.25 + i * (d.radius ?? 2.2) / count;
      p = [Math.cos(a) * r, (i / count - 0.5) * (d.height ?? 1.6), Math.sin(a) * r];
    } else if (layout === 'sphere') {
      const y = 1 - (i / (count - 1)) * 2, r = Math.sqrt(1 - y * y), a = i * 2.39996;
      p = [Math.cos(a) * r * (d.radius ?? 1.4), y * (d.radius ?? 1.4), Math.sin(a) * r * (d.radius ?? 1.4)];
    } else p = [(rnd() - 0.5) * (d.spread ?? 5), (rnd() - 0.5) * (d.spread ?? 5) * 0.5, (rnd() - 0.5) * (d.spread ?? 5)];
    base.push({p, r: [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28], k: rnd()});
  }
  const dummy = new THREE.Object3D();
  const wave = d.wave ?? (layout === 'wave' ? {amp: 0.28, freq: 1.6, speed: 2} : null);
  const enter = d.enter ?? {at: 0, each: 0.004, dur: 0.6};
  const set = (t) => {
    for (let i = 0; i < count; i++) {
      const b = base[i];
      const dist = Math.hypot(b.p[0], b.p[2]);
      const y = wave ? Math.sin(dist * wave.freq - t * wave.speed) * wave.amp : 0;
      const k = enter ? prog(t, enter.at + (enter.byDistance ? dist * 0.12 : i * enter.each), enter.dur, 'back') : 1;
      dummy.position.set(b.p[0], b.p[1] + y, b.p[2]);
      if (d.tumble) dummy.rotation.set(b.r[0] + t * 0.4 * (b.k - 0.5), b.r[1] + t * 0.5, b.r[2]);
      else dummy.rotation.set(0, 0, 0);
      const sc = Math.max(0.0001, k) * (d.shape === 'bar' ? 1 : 1);
      if (d.shape === 'bar') dummy.scale.set(sc, Math.max(0.05, (0.4 + b.k * 1.2 + (wave ? y * 2 : 0)) * sc), sc);
      else dummy.scale.setScalar(sc);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    }
    im.instanceMatrix.needsUpdate = true;
  };
  set(0);
  ctx.updaters.push(set);
  im.frustumCulled = false;
  return im;
}, {source: CORE + ' InstancedMesh', about: 'hundreds of copies in one draw call: grid, wave, ring, spiral, sphere, scatter'});

// --- dot globe ---------------------------------------------------------------------------------------------
registerObject('globe', (d, ctx) => {
  const g = new THREE.Group();
  const R = d.radius ?? 1.2;
  g.add(mesh(new THREE.SphereGeometry(R * 0.985, 64, 40), {material: d.material ?? {preset: 'rim', color: d.color || ctx.palette.accent, power: 3.2, intensity: 1.3}}, ctx));
  // dots on a fibonacci sphere
  const n = d.dots ?? 1400;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), a = i * 2.39996;
    pos.set([Math.cos(a) * r * R, y * R, Math.sin(a) * r * R], i * 3);
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pm = new THREE.PointsMaterial({color: d.dotColor || ctx.palette.text, size: d.dotSize ?? 0.018, sizeAttenuation: true, transparent: true, opacity: 0.8});
  pm.userData.baseOpacity = 0.8;
  ctx.disposables.push(pg, pm);
  const pts = new THREE.Points(pg, pm);
  pts.userData.noShadow = true;
  g.add(pts);
  // arcs between seeded places, each drawing itself in turn
  const rnd = rng(d.seed ?? 'globe');
  const arcs = [];
  const onSphere = () => {
    const y = rnd() * 1.4 - 0.7, r = Math.sqrt(1 - y * y), a = rnd() * 6.283;
    return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
  };
  for (let i = 0; i < (d.arcs ?? 7); i++) {
    const a = onSphere(), b = onSphere();
    const mid = a.clone().add(b).normalize().multiplyScalar(R * (1.25 + a.distanceTo(b) * 0.22));
    const curve = new THREE.QuadraticBezierCurve3(a.clone().multiplyScalar(R), mid, b.clone().multiplyScalar(R));
    const line = fatLine(curve.getPoints(60), {color: d.arcColor || ctx.palette.accent, width: d.arcWidth ?? 2.5}, ctx);
    g.add(line);
    arcs.push(line);
  }
  ctx.updaters.push((t) => {
    arcs.forEach((l, i) => l.userData.setDraw(prog(t, 0.4 + i * (d.arcEvery ?? 0.35), 0.9, 'out')));
  });
  return g;
}, {source: OURS + ' on three core + Line2', about: 'dot globe with arcs that draw themselves'});

// --- 3D bars for your own numbers --------------------------------------------------------------------------
registerObject('bars', (d, ctx) => {
  const g = new THREE.Group();
  const vals = d.values ?? [3, 5, 4, 8];
  const max = Math.max(...vals, 1e-6);
  const w = d.barWidth ?? 0.42, gap = d.gap ?? 0.26, H = d.height ?? 2;
  const hi = d.highlight ?? vals.indexOf(Math.max(...vals));
  const bars = [];
  vals.forEach((v, i) => {
    const h = Math.max(0.02, (v / max) * H);
    const geo = new RoundedBoxGeometry(w, h, w, 4, 0.04);
    geo.translate(0, h / 2, 0);
    const m = mesh(geo, {material: i === hi ? d.material ?? 'gold' : d.material2 ?? 'steel'}, ctx);
    m.position.x = (i - (vals.length - 1) / 2) * (w + gap);
    g.add(m);
    bars.push(m);
    if (d.labels && d.labels[i] != null) {
      const l = makeLabel({text: String(d.labels[i]), size: 0.15, weight: 300}, ctx);
      l.position.set(m.position.x, -0.16, w / 2 + 0.02);
      g.add(l);
    }
  });
  ctx.updaters.push((t) => bars.forEach((m, i) => m.scale.set(1, Math.max(0.001, prog(t, (d.at ?? 0.2) + i * 0.12, 0.9, 'expoOut')), 1)));
  return g;
}, {source: OURS + ' on RoundedBoxGeometry', about: '3D bar chart from your own numbers; bars grow in turn'});

// --- procedural night city: dark building silhouettes in layers of haze, a few lit windows, roof beacons ------------
registerObject('city', (d, ctx) => {
  const rnd = rng(d.seed ?? 'city');
  const count = d.count ?? 230;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  ctx.disposables.push(geo);
  const haze = new THREE.Color(d.haze || '#1b2a45');
  const mat = new THREE.ShaderMaterial({
    uniforms: {uWarm: {value: new THREE.Color(d.warm || '#ffbe7a')}, uCool: {value: new THREE.Color(d.cool || '#9dbfe6')}, uBody: {value: new THREE.Color(d.body || '#04060a')}, uFog: {value: haze}, uFogNear: {value: d.fogNear ?? 110}, uFogFar: {value: d.fogFar ?? 330}, uLit: {value: d.lit ?? 0.1}, uGain: {value: d.intensity ?? 1.0}, uTime: {value: 0}},
    vertexShader: /* glsl */ `varying vec3 vL; varying vec3 vN; varying vec3 vS; varying float vSeed; varying float vDepth;
      void main(){ mat4 im = mat4(1.0);
        #ifdef USE_INSTANCING
          im = instanceMatrix;
        #endif
        vS = vec3(length(im[0].xyz), length(im[1].xyz), length(im[2].xyz)); vL = position * vS; vN = normal; vSeed = im[3].x * 0.37 + im[3].z * 1.91;
        vec4 mv = modelViewMatrix * im * vec4(position, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `uniform vec3 uWarm; uniform vec3 uCool; uniform vec3 uBody; uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar; uniform float uLit; uniform float uGain; uniform float uTime;
      varying vec3 vL; varying vec3 vN; varying vec3 vS; varying float vSeed; varying float vDepth; ${GLSL_NOISE}
      void main(){ vec3 an = abs(vN); float fog = smoothstep(uFogNear, uFogFar, vDepth);
        // the silhouette: a near-black body that takes the colour of the haze with distance, a touch lighter on the roof
        vec3 col = mix(uBody, uFog, fog * 0.78) * (an.y > 0.5 ? 1.5 : 1.0);
        if (an.y < 0.5) {
          vec2 uv = an.x > 0.5 ? vec2(vL.z, vL.y) : vec2(vL.x, vL.y); vec2 cell = vec2(2.6, 3.4); vec2 q = uv / cell; vec2 id = floor(q); vec2 f = fract(q);
          float b = c3hash(vec2(vSeed, 3.7));                       // how awake this building is
          float row = c3hash(vec2(id.y * 1.3, vSeed));              // some floors work late
          float h = c3hash(id + vSeed);
          float p = uLit * (0.25 + 1.5 * b) * (row > 0.9 ? 2.6 : 1.0);
          vec2 w = fwidth(q) * 1.2;
          float box = smoothstep(0.2 - w.x, 0.2 + w.x, f.x) * smoothstep(0.8 + w.x, 0.8 - w.x, f.x) * smoothstep(0.26 - w.y, 0.26 + w.y, f.y) * smoothstep(0.74 + w.y, 0.74 - w.y, f.y);
          float on = step(1.0 - p, h) * box * step(vL.y, vS.y - 1.5);
          float tw = 0.9 + 0.1 * sin(uTime * 0.6 + h * 40.0);
          vec3 wc = mix(uWarm, uCool, step(0.8, c3hash(id * 1.7 + vSeed)));
          col += wc * on * tw * (0.35 + 0.65 * h) * uGain * (1.0 - fog * 0.55);
          col += uFog * 0.5 * smoothstep(9.0, 0.0, vL.y) * (1.0 - fog);   // street glow at the foot
        }
        gl_FragColor = vec4(col, 1.0); }`,
  });
  ctx.disposables.push(mat);
  ctx.timeUniforms.push(mat.uniforms.uTime);
  const width = d.width ?? 620, depth = d.depth ?? 170, maxH = d.maxHeight ?? 58;
  const list = [], beacons = [];
  for (let i = 0; i < count; i++) {
    const z = -rnd() * depth, far = -z / depth;
    const tall = Math.pow(rnd(), 2.4);
    const h = 6 + tall * maxH * (0.4 + far * 0.8);
    const x = (rnd() - 0.5) * width, sx = 8 + rnd() * 13, sz = 8 + rnd() * 13;
    list.push([x, 0, z, sx, h, sz]);
    if (h > maxH * 0.42 && rnd() < 0.6) {
      const k = 0.5 + rnd() * 0.25, h2 = h * (0.12 + rnd() * 0.2);
      list.push([x, h, z, sx * k, h2, sz * k]);
      if (rnd() < 0.6) {
        list.push([x, h + h2, z, 0.5, 6 + rnd() * 8, 0.5]);
        beacons.push([x, h + h2 + 0.4, z, rnd() * 6.28]);
      }
    }
  }
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  const dummy = new THREE.Object3D();
  list.forEach((b, i) => {
    dummy.position.set(b[0], b[1], b[2]);
    dummy.scale.set(b[3], b[4], b[5]);
    dummy.updateMatrix();
    im.setMatrixAt(i, dummy.matrix);
  });
  im.frustumCulled = false;
  im.userData.noShadow = true;
  const g = new THREE.Group();
  g.add(im);
  if (beacons.length && d.beacons !== false) {
    const bg = new THREE.SphereGeometry(0.55, 8, 6), bm = new THREE.MeshBasicMaterial({color: d.beacon || '#ff4a3a', toneMapped: false, fog: false});
    ctx.disposables.push(bg, bm);
    const lamps = beacons.slice(0, 14).map((b) => {
      const m = new THREE.Mesh(bg, bm);
      m.position.set(b[0], b[1], b[2]);
      m.userData.noShadow = true;
      g.add(m);
      return [m, b[3]];
    });
    ctx.updaters.push((t) => lamps.forEach(([m, ph]) => m.scale.setScalar(Math.max(0.001, Math.sin(t * 1.8 + ph)))));
  }
  g.position.set(0, d.y ?? -2, d.z ?? -120);
  g.userData.isBackdrop = true;
  return g;
}, {source: OURS + ' shader on InstancedMesh', about: 'procedural night skyline: building silhouettes in haze, a few lit windows, roof beacons; one draw call for the buildings'});

// --- back glow: a soft pool of light on the wall behind the subject (the night-set look) ---------------------
registerObject('backglow', (d, ctx) => {
  const geo = new THREE.PlaneGeometry(1, 1);
  ctx.disposables.push(geo);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: {uColor: {value: new THREE.Color(d.color || ctx.palette.accent)}, uGain: {value: d.intensity ?? 0.11}, uAlpha: {value: 1}},
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uGain; uniform float uAlpha; varying vec2 vUv;
      void main(){ vec2 c = (vUv - 0.5) * vec2(1.0, 1.25); float r = length(c) * 2.0; float a = pow(max(0.0, 1.0 - r), 2.2);
        gl_FragColor = vec4(uColor * a * uGain * uAlpha, 1.0); }`,
  });
  mat.userData.baseOpacity = 1;
  ctx.disposables.push(mat);
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(d.width ?? 22, d.height ?? 12, 1);
  m.position.set(0, d.y ?? 2.2, d.z ?? -9);
  m.userData.noShadow = true;
  m.userData.isBackdrop = true;
  m.renderOrder = -5;
  return m;
}, {source: OURS + ' shader', about: 'soft pool of warm light on the wall behind the subject'});

// --- terrain and water-like surface ------------------------------------------------------------------------
registerObject('terrain', (d, ctx) => {
  const size = d.size ?? 14, seg = d.segments ?? 140;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  const sc = d.scale ?? 0.32, amp = d.amp ?? 1.5;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const ridge = Math.pow(fbm2(x * sc + 11.3, z * sc + 4.7, 5), 1.6);
    p.setY(i, ridge * amp * clamp(Math.hypot(x, z) / (size * 0.18), d.flatCenter === false ? 1 : 0.12, 1));
  }
  geo.computeVertexNormals();
  const m = mesh(geo, d, ctx, {preset: 'clay', color: '#2a2f3a'});
  m.receiveShadow = true;
  if (d.wire) {
    const w = new THREE.Mesh(geo, makeMaterial({preset: 'wire', color: d.wireColor || ctx.palette.accent, opacity: 0.22}, ctx));
    w.position.y = 0.004;
    w.userData.noShadow = true;
    m.add(w);
  }
  return m;
}, {source: OURS + ' noise on PlaneGeometry', about: 'ridged terrain from our own noise, optional wire overlay'});
registerObject('waves', (d, ctx) => {
  const size = d.size ?? 16;
  const geo = new THREE.PlaneGeometry(size, size, 200, 200);
  geo.rotateX(-Math.PI / 2);
  ctx.disposables.push(geo);
  const mat = new THREE.ShaderMaterial({
    uniforms: {uTime: {value: 0}, uDeep: {value: new THREE.Color(d.color || '#07121c')}, uCrest: {value: new THREE.Color(d.color2 || ctx.palette.accent)}, uAmp: {value: d.amp ?? 0.32}, uFog: {value: new THREE.Color(ctx.fogColor || '#05060a')}},
    vertexShader: /* glsl */ `uniform float uTime; uniform float uAmp; varying float vH; varying vec3 vW; ${GLSL_NOISE}
      float hgt(vec2 p){ return (sin(p.x*0.9 + uTime*0.9) * 0.5 + sin(p.y*1.3 - uTime*0.7) * 0.35 + c3fbm(p*0.7 + uTime*0.12) * 0.9 - 0.45); }
      void main(){ vec3 p = position; float h = hgt(p.xz); p.y += h * uAmp; vH = h; vec4 w = modelMatrix * vec4(p,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `uniform vec3 uDeep; uniform vec3 uCrest; uniform vec3 uFog; varying float vH; varying vec3 vW;
      void main(){ vec3 n = normalize(cross(dFdx(vW), dFdy(vW))); float spec = pow(clamp(dot(n, normalize(vec3(0.3,0.8,-0.5))), 0.0, 1.0), 24.0);
        vec3 col = mix(uDeep, uCrest, smoothstep(0.35, 1.0, vH) * 0.22) + uCrest * spec * 0.8;
        float fog = smoothstep(4.0, 30.0, length(vW - cameraPosition)); gl_FragColor = vec4(mix(col, uFog, fog), 1.0); }`,
  });
  ctx.disposables.push(mat);
  ctx.timeUniforms.push(mat.uniforms.uTime);
  const m = new THREE.Mesh(geo, mat);
  m.userData.noShadow = true;
  return m;
}, {source: OURS + ' shader', about: 'rolling dark surface with gold crests (vertex shader)'});

// --- group: children share one transform and can explode / stagger -----------------------------------------
registerObject('group', async (d, ctx) => {
  const g = new THREE.Group();
  for (const c of d.children || []) g.add(await ctx.make(c));
  return g;
}, {source: CORE, about: 'group of objects (explode, stagger, move together)'});

export async function makeObject(def, ctx) {
  const entry = REG.objects.get(def.type);
  if (!entry) {
    const need = NEEDS.objects[def.type];
    throw new Error(need ? `object type "${def.type}" needs the "${need}" adapter (it is left out of this build)` : `object type "${def.type}" is not in the catalog. Known: ${[...REG.objects.keys()].join(', ')}`);
  }
  const o = await entry.make(def, ctx);
  const p = v3(def.position), r = v3(def.rotation), s = v3(def.scale ?? 1, [1, 1, 1]);
  // keep an inner transform a maker set (a backdrop sets its own place) unless the spec overrides it
  if (def.position) o.position.set(...p);
  if (def.rotation) o.rotation.set(r[0] * DEG, r[1] * DEG, r[2] * DEG);
  if (def.scale != null) o.scale.set(...s);
  o.name = def.id || o.name || def.type;
  o.userData.def = def;
  o.userData.type = def.type;
  // "reflect": false keeps an object out of the mirror floor (it lives on layer 1, which only the main camera sees)
  if (def.reflect === false) o.traverse((m) => m.layers.set(1));
  o.traverse((m) => {
    if (!m.isMesh && !m.isPoints && !m.isLine2) return;
    if (m.userData.noShadow || def.shadow === false) return;
    m.castShadow = true;
    m.receiveShadow = def.receiveShadow ?? false;
  });
  return o;
}
export const OBJECT_TYPES = () => [...REG.objects.keys()];
export {EASE};
