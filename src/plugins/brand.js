// The CONNECT AI LAB prop set: procedural objects a creator actually has on the desk and on the channel art.
// Everything is built from three core shapes + our materials (no model files), so a web page stays small.
//   wordmark · monogram · building · cinema-camera · microphone · workstation · display · laptop · softbox · clapper · book
// The words on the building sign, the screens, the clapper and the book are yours to change ("text", "sign", "title").
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {REG, registerObject, registerPlugin} from '../runtime/registry.js';
import {makeMaterial} from '../runtime/materials.js';
import {makeLabel} from '../runtime/objects.js';
import {BRAND} from '../runtime/look.js';
import {rng, clamp, DEG, EASE} from '../runtime/util.js';

const OURS = 'CONNECT AI LAB (MIT)';
const SATIN = {preset: 'black', color: '#17181c', roughness: 0.46, clearcoat: 0.3};
const RUBBER = {preset: 'black', color: '#0c0c0e', roughness: 0.85, clearcoat: 0};
const ALU = {preset: 'steel', color: '#c5c8ce', roughness: 0.34};

// small builder: add(geometry, material, position, rotationDeg) -> mesh; materials are made once per name
function kit(ctx) {
  const g = new THREE.Group();
  const mats = new Map();
  const mat = (m) => {
    if (m && m.isMaterial) return m;
    const key = typeof m === 'string' ? m : JSON.stringify(m);
    if (!mats.has(key)) mats.set(key, makeMaterial(m, ctx));
    return mats.get(key);
  };
  const add = (geo, m, p = [0, 0, 0], r = [0, 0, 0], parent = g) => {
    ctx.disposables.push(geo);
    const mesh = new THREE.Mesh(geo, mat(m));
    mesh.position.set(p[0], p[1], p[2]);
    mesh.rotation.set(r[0] * DEG, r[1] * DEG, r[2] * DEG);
    parent.add(mesh);
    return mesh;
  };
  const basic = (color, extra = {}) => {
    const m = new THREE.MeshBasicMaterial({color, ...extra});
    m.userData.baseOpacity = m.opacity;
    ctx.disposables.push(m);
    return m;
  };
  // parts of one prop that share a material become one mesh: a camera is 5 draw calls, not 20.
  // Meshes that move by themselves (userData.keep), labels and instanced meshes are left alone.
  const compact = (parent = g) => {
    const sets = new Map();
    for (const m of parent.children.slice()) {
      if (!m.isMesh || m.isInstancedMesh || m.userData.keep || m.userData.isLabel || m.children.length) continue;
      const key = m.material.uuid + (m.userData.noShadow ? ':n' : '') + (m.receiveShadow ? ':r' : '');
      if (!sets.has(key)) sets.set(key, []);
      sets.get(key).push(m);
    }
    for (const list of sets.values()) {
      if (list.length < 2) continue;
      const geos = list.map((m) => {
        m.updateMatrix();
        const src = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        for (const k of Object.keys(src.attributes)) if (!['position', 'normal', 'uv'].includes(k)) src.deleteAttribute(k);
        return src.applyMatrix4(m.matrix);
      });
      const one = mergeGeometries(geos, false);
      geos.forEach((x) => x.dispose());
      if (!one) continue;
      ctx.disposables.push(one);
      const mesh = new THREE.Mesh(one, list[0].material);
      mesh.userData.noShadow = list[0].userData.noShadow;
      mesh.receiveShadow = list[0].receiveShadow;
      for (const m of list) parent.remove(m);
      parent.add(mesh);
    }
    return parent;
  };
  return {g, add, mat, basic, compact};
}
// a thin rod between two points (tripod legs, stands)
const UP = new THREE.Vector3(0, 1, 0);
function strut(K, a, b, r, m, parent) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), dir = B.clone().sub(A);
  const mesh = K.add(new THREE.CylinderGeometry(r, r, dir.length(), 14), m, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [0, 0, 0], parent || K.g);
  mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
  return mesh;
}
// small print on a prop (a clapper's fields, a book's author line) is decoration: the small-text check skips it
const decor = (g) => {
  g.traverse((o) => {
    if (o.userData.isLabel && !o.userData.judge) o.userData.decor = true;
  });
  return g;
};
const box = (w, h, d, r = 0.03) => new RoundedBoxGeometry(w, h, d, 4, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
const cyl = (r, h, seg = 48, r2 = r) => new THREE.CylinderGeometry(r2, r, h, seg);
const text = async (d, ctx) => {
  const t = REG.plugins.get('text3d');
  if (!t) throw new Error(`${d.type || 'this object'} needs the "text3d" adapter for its letters (it is left out of this build)`);
  return t.buildText(d, ctx);
};

// a dark screen with a kicker, a thin title and a gold rule: what a display, a laptop or a clapper shows by default
async function screenFace(d, ctx, w, h, K) {
  const s = new THREE.Group();
  if (d.src) {
    const tex = await ctx.loadTexture(d.src);
    const m = K.basic('#ffffff', {map: tex, toneMapped: false});
    K.add(new THREE.PlaneGeometry(w, h), m, [0, 0, 0], [0, 0, 0], s).userData.noShadow = true;
    return s;
  }
  K.add(new THREE.PlaneGeometry(w, h), K.basic(d.screenColor || '#07090d'), [0, 0, 0], [0, 0, 0], s).userData.noShadow = true;
  const title = String(d.title ?? 'CONNECT AI LAB'), kicker = d.kicker ?? 'VISUAL VIBE CODING';
  const accent = d.accent || ctx.palette.accent || BRAND.gold;
  const tl = makeLabel({text: title, size: Math.min(h * 0.2, (w * 0.8) / Math.max(4, title.length) / 0.5), weight: 200, tracking: 0.06, color: d.color || '#f3ede2'}, ctx);
  tl.position.set(0, -h * 0.02, 0.004);
  tl.userData.judge = true; // the title on a screen is meant to be read
  s.add(tl);
  if (kicker) {
    const kl = makeLabel({text: String(kicker).toUpperCase(), size: h * 0.075, weight: 400, tracking: 0.34, color: accent}, ctx);
    kl.position.set(0, h * 0.24, 0.004);
    s.add(kl);
  }
  const rule = K.add(new THREE.PlaneGeometry(w * 0.14, Math.max(0.004, h * 0.008)), K.basic(accent, {toneMapped: false}), [0, -h * 0.2, 0.004], [0, 0, 0], s);
  rule.userData.noShadow = true;
  return s;
}

// --- wordmark: thin wide-tracked 3D letters, an optional gold rule and a small line under it ------------------------
registerObject('wordmark', async (d, ctx) => {
  const size = d.size ?? 0.5;
  const g = await text({type: 'wordmark', text: d.text ?? 'CONNECT AI LAB', font: d.font ?? 'light', fontFile: d.fontFile, size, depth: d.depth ?? size * 0.14, bevel: d.bevel ?? size * 0.01, tracking: d.tracking ?? 0.2, split: d.split, material: d.material ?? 'gold'}, ctx);
  const w = g.userData.textWidth;
  if (d.mark) {
    // logo lockup: the mark sits left of the letters at cap height, and the pair is centred again
    const R = size * 0.4;
    const mk = await REG.objects.get('monogram').make({radius: R, material: d.markMaterial ?? d.material ?? 'gold', material2: d.markMaterial2 ?? d.markMaterial ?? d.material ?? 'gold'}, ctx);
    const gapX = size * 0.8, mw = R * 2.52, total = mw + gapX + w;
    for (const c of g.children) c.position.x += (mw + gapX) / 2;
    mk.position.set(-total / 2 + R * 1.2, -size * 0.14, 0);
    g.userData.textWidth = total;
    g.add(mk);
    g.children.unshift(g.children.pop()); // first child = first to arrive in a stagger
    g.userData.textWidth = w + mw + gapX;
  }
  if (d.rule) {
    const geo = new THREE.BoxGeometry(d.ruleWidth ?? Math.min(w * 0.2, size * 2.4), size * 0.016, size * 0.016);
    ctx.disposables.push(geo);
    const r = new THREE.Mesh(geo, makeMaterial(d.ruleMaterial ?? {preset: 'flat', color: d.accent || ctx.palette.accent}, ctx));
    r.position.set(0, -size * 0.92, 0);
    r.userData.noShadow = true;
    g.add(r);
  }
  if (d.sub) {
    const l = makeLabel({text: String(d.sub).toUpperCase(), size: d.subSize ?? size * 0.42, weight: 300, tracking: d.subTracking ?? 0.42, color: d.subColor || ctx.palette.text}, ctx);
    l.position.set(0, -size * (d.rule ? 1.42 : 1.12), 0);
    g.add(l);
  }
  return g;
}, {source: OURS + ' on TextGeometry', about: 'a wordmark in thin wide-tracked 3D letters, with an optional rule and a small line under it'});

// --- monogram: an open ring (C) and a node on a line, our "connect" mark as a sculpture. Also the material swatch. ----
registerObject('monogram', (d, ctx) => {
  const K = kit(ctx);
  const R = d.radius ?? 0.62, tube = d.tube ?? R * 0.2, gap = d.gap ?? 64;
  const m = d.material ?? 'gold', m2 = d.material2 ?? m;
  const arc = (360 - gap) * DEG;
  const q = d.detail ?? 1; // lower = fewer faces (a wireframe reads better at 0.25)
  const ring = K.add(new THREE.TorusGeometry(R, tube, Math.max(6, Math.round(40 * q)), Math.max(16, Math.round(180 * q)), arc), m, [0, 0, 0], [0, 0, gap / 2]);
  for (const a of [gap / 2, -gap / 2]) K.add(new THREE.SphereGeometry(tube, Math.max(8, Math.round(40 * q)), Math.max(6, Math.round(24 * q))), m, [Math.cos(a * DEG) * R, Math.sin(a * DEG) * R, 0]);
  K.add(new THREE.SphereGeometry(R * 0.36, Math.max(10, Math.round(64 * q)), Math.max(8, Math.round(40 * q))), m2, [0, 0, 0]).userData.part = 'node';
  K.add(cyl(tube * 0.34, R * 1.05, 32), d.linkMaterial ?? m2, [R * 0.62, 0, 0], [0, 0, 90]);
  K.add(new THREE.SphereGeometry(tube * 0.78, 40, 24), m2, [R * 1.16, 0, 0]);
  void ring;
  if (d.pedestal) {
    const y = -R - tube;
    K.add(cyl(tube * 0.3, R * 0.5, 24), d.pedestalMaterial ?? 'steel', [0, y - R * 0.2, 0]);
    K.add(cyl(R * 0.8, R * 0.1, 64), d.pedestalMaterial ?? SATIN, [0, y - R * 0.5, 0]);
  }
  K.compact();
  return K.g;
}, {source: OURS, about: 'the CONNECT mark as a sculpture: an open ring, a node and a link (the material swatch of this catalog)'});

// --- building: a small studio building with lit windows and your sign on the roof ------------------------------------
registerObject('building', async (d, ctx) => {
  const K = kit(ctx);
  const floors = Math.max(2, d.floors ?? 4), fh = d.floorHeight ?? 0.52;
  const w = d.width ?? 2.6, dp = d.depth ?? 1.7, H = floors * fh + 0.12;
  const rnd = rng(d.seed ?? 'connect-building');
  const wall = d.material ?? {preset: 'black', color: '#15171c', roughness: 0.55, clearcoat: 0.15};
  K.add(box(w + 0.7, 0.06, dp + 0.7, 0.02), d.groundMaterial ?? {preset: 'black', color: '#0b0c0f', roughness: 0.8, clearcoat: 0}, [0, 0.03, 0]).receiveShadow = true;
  K.add(box(w, H, dp, 0.025), wall, [0, 0.06 + H / 2, 0]);
  K.add(box(w + 0.05, 0.035, dp + 0.05, 0.01), d.trimMaterial ?? 'gold', [0, 0.06 + H + 0.012, 0]);
  K.add(box(w - 0.1, 0.08, dp - 0.1, 0.01), wall, [0, 0.06 + H + 0.07, 0]);
  // windows on all four sides: one instanced mesh, each window lit warm, lit cool or dark (seeded)
  const cols = d.columns ?? 6, colsSide = Math.max(2, Math.round((cols * dp) / w));
  const ww = (w * 0.86) / cols * 0.62, wh = fh * 0.56;
  const wgeo = new THREE.PlaneGeometry(1, 1);
  ctx.disposables.push(wgeo);
  const wmat = K.basic('#ffffff', {toneMapped: true});
  const places = [];
  for (let f = 1; f < floors; f++) {
    const y = 0.06 + f * fh + fh * 0.5;
    for (let c = 0; c < cols; c++) {
      const x = ((c + 0.5) / cols - 0.5) * w * 0.86;
      places.push([x, y, dp / 2 + 0.004, 0, ww], [x, y, -dp / 2 - 0.004, 180, ww]);
    }
    for (let c = 0; c < colsSide; c++) {
      const z = ((c + 0.5) / colsSide - 0.5) * dp * 0.84;
      const sw = (dp * 0.84) / colsSide * 0.62;
      places.push([w / 2 + 0.004, y, z, 90, sw], [-w / 2 - 0.004, y, z, -90, sw]);
    }
  }
  const im = new THREE.InstancedMesh(wgeo, wmat, places.length);
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  const warm = new THREE.Color(d.warm || '#ffc98a'), cool = new THREE.Color(d.cool || '#a9c6e8'), off = new THREE.Color(d.dark || '#10151d');
  const lit = d.lit ?? 0.55, gain = d.glow ?? 1.15;
  places.forEach((p, i) => {
    dummy.position.set(p[0], p[1], p[2]);
    dummy.rotation.set(0, p[3] * DEG, 0);
    dummy.scale.set(p[4], wh, 1);
    dummy.updateMatrix();
    im.setMatrixAt(i, dummy.matrix);
    const r = rnd(), k = 0.55 + rnd() * 0.6;
    if (r < lit) col.copy(rnd() < 0.82 ? warm : cool).multiplyScalar(k * gain);
    else col.copy(off);
    im.setColorAt(i, col);
  });
  im.instanceColor.needsUpdate = true;
  im.userData.noShadow = true;
  K.g.add(im);
  // lobby: a band of warm glass with a door and a canopy
  const ly = 0.06 + fh * 0.5;
  K.add(new THREE.PlaneGeometry(w * 0.86, fh * 0.7), K.basic(new THREE.Color(d.warm || '#ffc98a').multiplyScalar(0.8 * gain)), [0, ly, dp / 2 + 0.004]).userData.noShadow = true;
  for (let i = 0; i <= 6; i++) K.add(new THREE.BoxGeometry(0.018, fh * 0.72, 0.02), wall, [(i / 6 - 0.5) * w * 0.86, ly, dp / 2 + 0.008]);
  K.add(box(0.36, fh * 0.74, 0.03, 0.01), SATIN, [0, ly - 0.01, dp / 2 + 0.012]);
  K.add(box(0.82, 0.04, 0.4, 0.012), wall, [0, 0.06 + fh * 0.92, dp / 2 + 0.2]);
  K.add(box(0.84, 0.014, 0.42, 0.005), d.trimMaterial ?? 'gold', [0, 0.06 + fh * 0.945, dp / 2 + 0.2]);
  // roof: sign on a rail, a unit, a mast with one small red light
  const top = 0.06 + H + 0.11;
  if (d.sign !== false) {
    const sign = await text({type: 'building', text: d.sign ?? 'CONNECT AI LAB', font: d.font ?? 'sans', size: 0.3, depth: 0.05, bevel: 0.003, tracking: 0.12, material: d.signMaterial ?? 'gold'}, ctx);
    const k = Math.min(1, (w * 0.9) / Math.max(0.01, sign.userData.textWidth));
    sign.scale.setScalar(k);
    sign.position.set(0, top + 0.1 + 0.15 * k, dp / 2 - 0.12);
    K.g.add(sign);
    K.add(new THREE.BoxGeometry(w * 0.9, 0.014, 0.014), 'steel', [0, top + 0.085, dp / 2 - 0.12]);
    for (const x of [-0.42, -0.14, 0.14, 0.42]) K.add(new THREE.BoxGeometry(0.014, 0.1, 0.014), 'steel', [x * w, top + 0.04, dp / 2 - 0.12]);
  }
  K.add(box(0.5, 0.2, 0.36, 0.02), 'steel', [w * 0.24, top + 0.09, -dp * 0.2]);
  K.add(cyl(0.012, 0.7, 12), 'steel', [-w * 0.34, top + 0.35, -dp * 0.26]);
  const lamp = K.add(new THREE.SphereGeometry(0.028, 16, 12), K.basic(d.beacon || '#ff4a3a', {toneMapped: false}), [-w * 0.34, top + 0.72, -dp * 0.26]);
  lamp.userData.noShadow = lamp.userData.keep = true;
  ctx.updaters.push((t) => lamp.scale.setScalar(0.7 + 0.5 * Math.max(0, Math.sin(t * 2.4))));
  K.compact();
  return K.g;
}, {source: OURS + ' on InstancedMesh + TextGeometry', about: 'a small studio building: lit windows, a lobby, and your sign on the roof'});

// --- cinema-camera: a mirrorless camera with a fast prime, the one on the tripod in front of you ----------------------
registerObject('cinema-camera', (d, ctx) => {
  const K = kit(ctx);
  const body = d.material ?? SATIN, metal = d.material2 ?? 'steel', accent = d.accentMaterial ?? 'gold';
  const cam = new THREE.Group();
  K.g.add(cam);
  const A = (geo, m, p, r) => K.add(geo, m, p, r, cam);
  A(box(1.3, 0.8, 0.56, 0.07), body, [0, 0, 0]);
  A(box(0.3, 0.8, 0.66, 0.1), RUBBER, [-0.52, 0, 0.1]);
  A(box(0.4, 0.2, 0.42, 0.05), body, [0.08, 0.47, -0.02]);
  A(box(0.2, 0.035, 0.2, 0.008), metal, [0.08, 0.585, -0.04]);
  A(cyl(0.1, 0.07), metal, [0.44, 0.43, 0.04]);
  A(cyl(0.075, 0.06), metal, [-0.28, 0.43, -0.06]);
  A(cyl(0.055, 0.035), accent, [-0.52, 0.415, 0.26]);
  A(box(0.5, 0.36, 0.02, 0.02), {preset: 'black', color: '#05070b', roughness: 0.12, clearcoat: 1}, [0.1, -0.02, -0.285]);
  const rec = A(new THREE.SphereGeometry(0.03, 16, 12), K.basic(d.rec || '#ff3b2f', {toneMapped: false}), [0.5, 0.26, 0.285]);
  rec.userData.noShadow = rec.userData.keep = true;
  ctx.updaters.push((t) => (rec.visible = d.recording === false ? false : Math.sin(t * 5.2) > -0.55));
  // lens along +z
  const L = (r, len, z, m, r2 = r) => A(cyl(r, len, 64, r2), m, [0.08, -0.04, z], [90, 0, 0]);
  L(0.31, 0.05, 0.3, metal);
  L(0.3, 0.3, 0.47, body);
  L(0.325, 0.2, 0.7, RUBBER);
  L(0.305, 0.022, 0.815, accent);
  L(0.33, 0.14, 0.9, body, 0.345);
  A(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 64), {preset: 'black', color: '#030304', roughness: 0.9, clearcoat: 0}, [0.08, -0.04, 0.955], [90, 0, 0]);
  const glass = A(new THREE.SphereGeometry(0.42, 48, 24, 0, Math.PI * 2, 0, 0.62), {preset: 'iridescent', color: '#0a1024', roughness: 0.04}, [0.08, -0.04, 0.6], [90, 0, 0]);
  glass.userData.noShadow = true;
  if (d.tripod) {
    const h = d.tripodHeight ?? 1.25;
    A(box(0.36, 0.1, 0.36, 0.02), metal, [0, -0.45, 0]);
    A(cyl(0.04, 0.26), body, [0, -0.62, 0]);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
      strut(K, [Math.sin(a) * 0.05, -0.72, Math.cos(a) * 0.05], [Math.sin(a) * h * 0.42, -0.74 - h, Math.cos(a) * h * 0.42], 0.028, body, cam);
      strut(K, [Math.sin(a) * h * 0.2, -0.74 - h * 0.48, Math.cos(a) * h * 0.2], [0, -0.74 - h * 0.62, 0], 0.012, metal, cam);
    }
    cam.position.y = h + 0.74;
  }
  K.compact(cam);
  return K.g;
}, {source: OURS, about: 'a mirrorless cinema camera with a prime lens and a blinking record light; tripod optional'});

// --- microphone: a broadcast microphone on a desk stand or a boom arm -------------------------------------------------
registerObject('microphone', (d, ctx) => {
  const K = kit(ctx);
  const body = d.material ?? SATIN, metal = d.material2 ?? 'steel', accent = d.accentMaterial ?? 'gold';
  const mic = new THREE.Group();
  K.g.add(mic);
  const A = (geo, m, p, r) => K.add(geo, m, p, r, mic);
  A(cyl(0.2, 0.62, 48), body, [0, -0.1, 0]);
  A(cyl(0.14, 0.1, 48, 0.2), body, [0, -0.46, 0]);
  A(new THREE.TorusGeometry(0.203, 0.016, 16, 64), accent, [0, 0.22, 0], [90, 0, 0]);
  A(new THREE.CapsuleGeometry(0.2, 0.34, 12, 40), {preset: 'black', color: '#08090b', roughness: 0.7, clearcoat: 0}, [0, 0.46, 0]);
  const grille = A(new THREE.CapsuleGeometry(0.206, 0.34, 6, 22), {preset: 'wire', color: d.grille || '#9aa1ab', opacity: 0.75}, [0, 0.46, 0]);
  grille.userData.noShadow = true;
  A(new THREE.TorusGeometry(0.3, 0.022, 14, 48, Math.PI), metal, [0, -0.08, 0], [0, 0, 180]);
  for (const x of [-0.3, 0.3]) A(cyl(0.04, 0.05, 20), metal, [x, -0.08, 0], [0, 0, 90]);
  mic.rotation.z = (d.tilt ?? 14) * DEG;
  const stand = d.stand ?? 'desk';
  if (stand === 'desk') {
    mic.position.y = 1.02;
    K.add(cyl(0.022, 0.56, 16), metal, [0.04, 0.36, 0]);
    K.add(cyl(0.34, 0.045, 64), body, [0.04, 0.0225, 0]);
    K.add(cyl(0.3, 0.012, 64), accent, [0.04, 0.05, 0]);
  } else if (stand === 'boom') {
    mic.position.set(0, 0, 0);
    const arm = K.add(cyl(0.02, 1.5, 12), metal, [-0.82, 0.22, 0], [0, 0, 68]);
    void arm;
    K.add(cyl(0.045, 0.09, 20), body, [-0.14, -0.06, 0], [0, 0, 90]);
  }
  K.compact(mic);
  K.compact();
  return K.g;
}, {source: OURS, about: 'a broadcast microphone with a wire grille and a gold band, on a desk stand or a boom arm'});

// --- workstation: a compact desktop computer --------------------------------------------------------------------------
registerObject('workstation', (d, ctx) => {
  const K = kit(ctx);
  const m = d.material ?? ALU;
  const w = d.width ?? 1.5, h = w * 0.48;
  K.add(box(w, h, w, w * 0.12), m, [0, h / 2 + 0.02, 0]);
  K.add(cyl(w * 0.4, 0.02, 64), RUBBER, [0, 0.01, 0]);
  const dark = {preset: 'black', color: '#050608', roughness: 0.4, clearcoat: 0};
  for (const x of [-0.2, -0.11]) K.add(box(w * 0.06, h * 0.045, 0.01, 0.004), dark, [x * w, h * 0.3, w / 2 + 0.001]);
  K.add(box(w * 0.12, h * 0.03, 0.01, 0.003), dark, [0.06 * w, h * 0.3, w / 2 + 0.001]);
  const led = K.add(new THREE.SphereGeometry(w * 0.008, 12, 8), K.basic('#ffffff', {toneMapped: false}), [0.36 * w, h * 0.3, w / 2 + 0.002]);
  led.userData.noShadow = led.userData.keep = true;
  ctx.updaters.push((t) => led.scale.setScalar(0.8 + 0.3 * Math.sin(t * 1.6)));
  if (d.mark !== false) {
    const mk = K.add(new THREE.TorusGeometry(w * 0.11, w * 0.014, 16, 64, 300 * DEG), d.markMaterial ?? {preset: 'black', color: '#1b1c20', roughness: 0.25}, [0, h + 0.021, 0], [-90, 0, 30]);
    mk.userData.noShadow = true;
  }
  K.compact();
  return K.g;
}, {source: OURS, about: 'a compact aluminium desktop computer with a soft status light'});

// --- display and laptop: screens that show your picture ("src") or a title card ----------------------------------------
registerObject('display', async (d, ctx) => {
  const K = kit(ctx);
  const w = d.width ?? 2.5, h = d.height ?? w * 0.5625, y = (d.stand === false ? 0 : 0.42) + h / 2;
  K.add(box(w + 0.06, h + 0.06, 0.05, 0.025), d.material ?? SATIN, [0, y, 0]);
  const face = await screenFace(d, ctx, w, h, K);
  face.position.set(0, y, 0.027);
  K.g.add(face);
  if (d.stand !== false) {
    K.add(box(0.16, 0.5, 0.03, 0.01), d.material2 ?? ALU, [0, 0.3, -0.05]);
    K.add(box(0.8, 0.02, 0.5, 0.008), d.material2 ?? ALU, [0, 0.01, 0]);
  }
  K.compact();
  return decor(K.g);
}, {source: OURS, about: 'a studio display on a stand; shows your image ("src") or a title card'});
registerObject('laptop', async (d, ctx) => {
  const K = kit(ctx);
  const w = d.width ?? 1.7, dp = w * 0.66, m = d.material ?? ALU;
  K.add(box(w, 0.05, dp, 0.02), m, [0, 0.025, 0]);
  K.add(new THREE.PlaneGeometry(w * 0.86, dp * 0.42), {preset: 'black', color: '#0a0b0d', roughness: 0.7, clearcoat: 0}, [0, 0.0505, -dp * 0.12], [-90, 0, 0]).userData.noShadow = true;
  K.add(new THREE.PlaneGeometry(w * 0.3, dp * 0.22), {preset: 'steel', color: '#b4b8bf', roughness: 0.5}, [0, 0.0505, dp * 0.3], [-90, 0, 0]).userData.noShadow = true;
  const lid = new THREE.Group();
  lid.position.set(0, 0.05, -dp / 2);
  lid.rotation.x = -((d.open ?? 108) - 90) * DEG;
  K.g.add(lid);
  const lh = dp;
  K.add(box(w, lh, 0.03, 0.012), m, [0, lh / 2, 0], [0, 0, 0], lid);
  const face = await screenFace(d, ctx, w * 0.94, lh * 0.9, K);
  face.position.set(0, lh / 2, 0.017);
  lid.add(face);
  K.compact();
  return decor(K.g);
}, {source: OURS, about: 'an open laptop; the screen shows your image ("src") or a title card'});

// --- softbox: the key light of a small studio, on its stand -----------------------------------------------------------
registerObject('softbox', (d, ctx) => {
  const K = kit(ctx);
  const h = d.height ?? 2.1, s = d.size ?? 0.95;
  K.add(cyl(0.02, h, 16), SATIN, [0, h / 2, 0]);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    strut(K, [0, 0.62, 0], [Math.sin(a) * 0.55, 0.01, Math.cos(a) * 0.55], 0.016, SATIN);
  }
  const head = new THREE.Group();
  head.position.set(0, h, 0);
  head.rotation.set((d.tilt ?? 14) * DEG, 0, 0);
  K.g.add(head);
  const cone = K.add(new THREE.CylinderGeometry(s * 0.71, 0.1, s * 0.5, 4, 1, true), {preset: 'black', color: '#0b0b0d', roughness: 0.8, clearcoat: 0, side: 2}, [0, 0, 0.28], [90, 45, 0], head);
  void cone;
  K.add(box(s + 0.03, s + 0.03, 0.03, 0.012), SATIN, [0, 0, 0.53], [0, 0, 0], head);
  const glow = K.add(new THREE.PlaneGeometry(s * 0.96, s * 0.96), K.basic(new THREE.Color(d.color || '#fff0dc').multiplyScalar(d.on === false ? 0.08 : d.glow ?? 0.95)), [0, 0, 0.548], [0, 0, 0], head);
  glow.userData.noShadow = true;
  K.add(cyl(0.09, 0.16, 24), SATIN, [0, 0, -0.02], [90, 0, 0], head);
  K.compact(head);
  K.compact();
  return K.g;
}, {source: OURS, about: 'a studio softbox on a light stand: shows where your key light is'});

// --- clapper: a film clapperboard that claps at a given second ---------------------------------------------------------
function stripes(ctx, a = '#ebe2d2', b = '#0b0c0f') {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = b;
  g.fillRect(0, 0, 512, 64);
  g.fillStyle = a;
  for (let x = -64; x < 560; x += 96) {
    g.beginPath();
    g.moveTo(x, 64);
    g.lineTo(x + 48, 64);
    g.lineTo(x + 96, 0);
    g.lineTo(x + 48, 0);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  ctx.disposables.push(t);
  ctx.textures.push({name: 'clapper stripes', width: 512, height: 64});
  return t;
}
registerObject('clapper', (d, ctx) => {
  const K = kit(ctx);
  const w = d.width ?? 1.7, h = w * 0.62, bar = w * 0.105;
  const board = d.material ?? {preset: 'black', color: '#0c0d10', roughness: 0.6, clearcoat: 0.1};
  K.add(box(w, h, 0.045, 0.012), board, [0, 0, 0]);
  const stripe = new THREE.MeshStandardMaterial({map: stripes(ctx, d.stripe || '#ebe2d2'), roughness: 0.6, metalness: 0});
  stripe.userData.baseOpacity = 1;
  ctx.disposables.push(stripe);
  K.add(new THREE.BoxGeometry(w, bar, 0.05), stripe, [0, h / 2 + bar / 2 + 0.004, 0]);
  const arm = new THREE.Group();
  arm.position.set(-w / 2, h / 2 + bar + 0.008, 0);
  K.g.add(arm);
  K.add(new THREE.BoxGeometry(w, bar, 0.05), stripe, [w / 2, bar / 2, 0], [0, 0, 0], arm);
  K.add(cyl(bar * 0.42, 0.07, 24), d.accentMaterial ?? 'gold', [0, 0, 0], [90, 0, 0], arm);
  const accent = d.accent || ctx.palette.accent, ink = d.color || '#ebe2d2';
  const line = (y) => (K.add(new THREE.PlaneGeometry(w * 0.9, 0.006), K.basic(ink, {transparent: true, opacity: 0.5}), [0, y, 0.024]).userData.noShadow = true);
  const put = (txt, size, x, y, o = {}) => {
    const l = makeLabel({text: txt, size, weight: o.weight ?? 300, tracking: o.tracking ?? 0.1, color: o.color || ink, align: 'left'}, ctx);
    l.position.set(x + l.geometry.parameters.width / 2, y, 0.025);
    K.g.add(l);
  };
  put(String(d.title ?? 'CONNECT AI LAB').toUpperCase(), h * 0.15, -w * 0.45, h * 0.28, {weight: 300, tracking: 0.16});
  line(h * 0.13);
  put('SCENE', h * 0.062, -w * 0.45, h * 0.05, {color: accent, tracking: 0.3, weight: 400});
  put('TAKE', h * 0.062, -w * 0.1, h * 0.05, {color: accent, tracking: 0.3, weight: 400});
  put('ROLL', h * 0.062, w * 0.2, h * 0.05, {color: accent, tracking: 0.3, weight: 400});
  put(String(d.scene ?? '67'), h * 0.17, -w * 0.45, -h * 0.1, {weight: 200});
  put(String(d.take ?? '1'), h * 0.17, -w * 0.1, -h * 0.1, {weight: 200});
  put(String(d.roll ?? 'A'), h * 0.17, w * 0.2, -h * 0.1, {weight: 200});
  line(-h * 0.24);
  put(String(d.note ?? 'DIRECTOR  AI MENTOR JAY').toUpperCase(), h * 0.058, -w * 0.45, -h * 0.33, {tracking: 0.26});
  const at = d.clapAt === undefined ? 1 : d.clapAt, open = (d.open ?? 26) * DEG;
  ctx.updaters.push((t) => {
    if (at == null) return (arm.rotation.z = open);
    const k = clamp((t - (at - 0.16)) / 0.16);
    const bounce = t > at ? Math.exp(-(t - at) * 14) * Math.sin((t - at) * 38) * 0.05 : 0;
    arm.rotation.z = open * (1 - EASE.in(k)) + Math.max(0, bounce);
  });
  return decor(K.g);
}, {source: OURS, about: 'a film clapperboard with your title; the stick claps at "clapAt" seconds'});

// --- book: a hardcover course book --------------------------------------------------------------------------------------
registerObject('book', (d, ctx) => {
  const K = kit(ctx);
  const w = d.width ?? 1.05, h = w * 1.42, t = d.thickness ?? w * 0.16;
  const cover = d.material ?? {preset: 'black', color: '#0d0e12', roughness: 0.62, clearcoat: 0.12};
  K.add(box(w, h, t, 0.012), cover, [0, 0, 0]);
  K.add(new THREE.BoxGeometry(w * 0.97, h * 0.955, t * 0.74), d.pagesMaterial ?? {preset: 'ivory', color: '#e9e1d0', roughness: 0.9}, [w * 0.022, 0, 0]);
  K.add(new THREE.BoxGeometry(0.012, h * 1.001, t * 1.004), d.accentMaterial ?? 'gold', [-w * 0.39, 0, 0]);
  const accent = d.accent || ctx.palette.accent, z = t / 2 + 0.003;
  const lines = String(d.title ?? 'VISUAL\nVIBE\nCODING').split('\n');
  const size = Math.min(h * 0.105, (w * 0.62) / Math.max(...lines.map((s) => s.length)) / 0.62);
  lines.forEach((s, i) => {
    const l = makeLabel({text: s, size, weight: 200, tracking: 0.14, color: d.color || '#f1eadc', align: 'left'}, ctx);
    l.position.set(-w * 0.3 + l.geometry.parameters.width / 2, h * 0.24 - i * size * 1.02, z);
    K.g.add(l);
  });
  K.add(new THREE.PlaneGeometry(w * 0.2, 0.006), K.basic(accent, {toneMapped: false}), [-w * 0.2, h * 0.24 - lines.length * size * 1.02 - size * 0.1, z]).userData.noShadow = true;
  const by = makeLabel({text: String(d.author ?? 'CONNECT AI LAB').toUpperCase(), size: h * 0.03, weight: 400, tracking: 0.34, color: accent, align: 'left'}, ctx);
  by.position.set(-w * 0.3 + by.geometry.parameters.width / 2, -h * 0.38, z);
  K.g.add(by);
  return decor(K.g);
}, {source: OURS, about: 'a hardcover course book with your title on the cover'});

registerPlugin({name: 'brand'});
