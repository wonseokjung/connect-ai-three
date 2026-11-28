// heritage/architecture.js from Hailey's threejs-architecture-effects (MIT, https://github.com/lhlGitHub/threejs-architecture-effects):
// assets/starter/src/heritage/architecture.ts with the TypeScript types stripped by esbuild for connect-ai-three (the comments
// are in the original). Imports point at three/addons/ instead of three/examples/jsm/.
import * as THREE from "three";
const TAU = Math.PI * 2;
const variation = (n) => {
  const v = Math.sin(n * 127.1 + 31.7) * 43758.5453;
  return v - Math.floor(v);
};
function surfaceGrid(nx, ny, point, uvMap) {
  const p = [], uv = [], idx = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const u = i / nx, v = j / ny;
    p.push(...point(u, v));
    uv.push(...uvMap ? uvMap(u, v) : [u, v]);
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
const facePoint = (x, y, z, angle) => [x * Math.cos(angle) + z * Math.sin(angle), y, z * Math.cos(angle) - x * Math.sin(angle)];
function roof(b, y, outer, inner, height, start) {
  const profile = (x, z) => {
    const t = (z - inner) / (outer - inner);
    return height * Math.pow(1 - t, 1.75) + 0.2 * Math.pow(t, 5) + 0.85 * Math.pow(Math.abs(x) / outer, 8) * Math.pow(t, 3);
  };
  for (let side = 0; side < 4; side++) {
    const a = side * Math.PI / 2;
    const deck = surfaceGrid(28, 18, (u, v) => {
      const z = inner + v * (outer - inner), x = (u * 2 - 1) * z;
      return facePoint(x, y + profile(x, z) - 0.045, z, a);
    });
    b.add(deck, "tile", start, { duration: 0.025, lift: 0.35 });
    deck.dispose();
    const soffit = surfaceGrid(20, 10, (u, v) => {
      const z = inner + v * (outer - inner), x = (u * 2 - 1) * z;
      return facePoint(x, y + profile(x, z) - 0.24, z, a);
    });
    const si = soffit.index;
    for (let n = 0; n < si.count; n += 3) {
      const tmp = si.getX(n + 1);
      si.setX(n + 1, si.getX(n + 2));
      si.setX(n + 2, tmp);
    }
    soffit.computeVertexNormals();
    b.add(soffit, "wood", start, { shade: 0.79, lift: 0.35 });
    soffit.dispose();
    const fascia = surfaceGrid(32, 1, (u, v) => {
      const x = (u * 2 - 1) * outer;
      return facePoint(x, y + profile(x, outer) - 0.24 + v * 0.23, outer, a);
    });
    b.add(fascia, "jade", start + 5e-3, { shade: 0.8, lift: 0.35 });
    fascia.dispose();
    for (let j = 0; j < 22; j++) {
      const x = (j / 21 - 0.5) * outer * 1.87, z0 = Math.max(inner, Math.abs(x) + 0.1);
      if (z0 >= outer - 0.2) continue;
      const pts = [];
      for (let k = 0; k < 6; k++) {
        const z = z0 + (outer - z0) * k / 5;
        pts.push(facePoint(x, y + profile(x, z) - 0.32, z, a));
      }
      b.tube(pts, 0.075, "wood", start, { shade: 0.9, duration: 0.022 }, 8);
    }
    for (const t of [0.24, 0.57, 0.88]) {
      const z = inner + (outer - inner) * t, pts = [];
      for (let k = 0; k < 12; k++) {
        const x = (k / 11 * 2 - 1) * z;
        pts.push(facePoint(x, y + profile(x, z) - 0.43, z, a));
      }
      b.tube(pts, 0.105, "wood", start, { shade: 0.83 }, 12);
    }
    const spacing = 0.29;
    for (let i = 0; i <= Math.floor(outer * 2 / spacing); i++) {
      const x = -outer + i * spacing;
      const z0 = Math.max(inner, Math.abs(x) + 0.055);
      const count = Math.max(1, Math.ceil((outer - z0) / 0.52));
      for (let row = 0; row < count; row++) {
        const seed = i * 13 + row * 47 + side * 109 + y * 7;
        const front = outer - row * 0.52, back = Math.max(z0, front - 0.56 - (variation(seed) - 0.5) * 0.024);
        if (back >= front - 0.035) continue;
        const tile = surfaceGrid(5, 2, (u, v) => {
          const theta = (1 - u) * Math.PI, z = back + (front - back) * v;
          const xx = x + Math.cos(theta) * (0.145 + (variation(seed + 4) - 0.5) * 6e-3) + (v - 0.5) * (variation(seed + 8) - 0.5) * 0.014;
          return facePoint(xx, y + profile(xx, z) + Math.sin(theta) * (0.12 + (variation(seed + 2) - 0.5) * 8e-3) + 0.025, z, a);
        });
        b.add(tile, "tile", start + 0.014 + row * 3e-3 + i * 12e-5, { shade: 0.9 + variation(seed) * 0.16, tint: [0.96 + variation(seed + 1) * 0.08, 0.98 + variation(seed + 2) * 0.04, 0.96 + variation(seed + 3) * 0.09], duration: 0.016, lift: 0.22 });
        tile.dispose();
      }
      if (Math.abs(x) < outer - 0.12) {
        const yy = y + profile(x, outer);
        const disk = new THREE.CylinderGeometry(0.139, 0.139, 0.06, 12);
        disk.rotateX(Math.PI / 2);
        b.add(disk, "tile", start + 0.049, { p: facePoint(x, yy + 0.045, outer + 0.025, a), r: [0, a, 0], shade: 1.1 });
        disk.dispose();
        b.sphere(facePoint(x, yy + 0.045, outer + 0.068, a), [0.043, 0.043, 0.022], "stone", start + 0.052, { r: [0, a, 0], shade: 0.73 });
        const lip = new THREE.TorusGeometry(0.105, 0.012, 4, 12);
        b.add(lip, "jade", start + 0.052, { p: facePoint(x, yy + 0.045, outer + 0.062, a), r: [0, a, 0], shade: 0.88 });
        lip.dispose();
        if (i % 2 === 0) {
          const drop = new THREE.Shape();
          drop.moveTo(-0.1, 0);
          drop.lineTo(0.1, 0);
          drop.quadraticCurveTo(0.095, -0.13, 0, -0.18);
          drop.quadraticCurveTo(-0.095, -0.13, -0.1, 0);
          const dg = new THREE.ExtrudeGeometry(drop, { depth: 0.035, bevelEnabled: false, curveSegments: 3 });
          b.add(dg, "jade", start + 0.053, { p: facePoint(x + 0.145, yy - 0.035, outer, a), r: [0, a, 0], shade: 0.86 });
          dg.dispose();
        }
      }
    }
    for (let layer = 0; layer < 3; layer++) {
      const points = [];
      for (let i = 0; i <= 32; i++) {
        const x = -outer + 2 * outer * i / 32;
        points.push(facePoint(x, y + profile(x, outer) - 0.15 - layer * 0.12, outer - 0.07 * layer, a));
      }
      b.tube(points, layer === 1 ? 0.043 : 0.092, layer === 1 ? "bronze" : "jade", start + 0.043, { lift: 0.3 }, 40);
    }
    for (let i = 0; i < 38; i++) {
      const x = (i / 37 - 0.5) * outer * 1.92;
      b.box([0.14, 0.15, 0.85], facePoint(x, y + profile(x, outer) - 0.36, outer - 0.42, a), "wood", start + 0.01, { r: [0, a, 0], shade: i % 2 ? 0.96 : 1.08 });
      b.box([0.11, 0.11, 0.035], facePoint(x, y + profile(x, outer) - 0.36, outer + 0.02, a), "stone", start + 0.032, { r: [0, a, 0], shade: 0.85 });
    }
    const ridge = [];
    for (let i = 0; i <= 18; i++) {
      const z = inner + (outer - inner) * i / 18;
      ridge.push(facePoint(z, y + profile(z, z) + 0.13, z, a));
    }
    b.tube(ridge, 0.15, "tile", start + 0.065, { lift: 0.3 }, 28);
    for (let j = 1; j < Math.floor((outer - inner) / 0.55); j++) {
      const z = inner + j * 0.55, points = [];
      for (let k = 0; k <= 8; k++) {
        const t = k / 8 * Math.PI, dx = Math.cos(t) * 0.153;
        points.push(facePoint(z + dx, y + profile(z, z) + 0.13 + Math.sin(t) * 0.155, z - dx, a));
      }
      b.tube(points, 0.021, "jade", start + 0.066, { shade: 0.82 + variation(j) * 0.12 }, 8);
    }
    const corner = facePoint(outer, y + 1.16, outer, a);
    const flourish = [facePoint(outer - 0.65, y + 0.64, outer - 0.65, a), corner, facePoint(outer + 0.22, y + 1.78, outer + 0.22, a), facePoint(outer - 0.04, y + 1.86, outer - 0.04, a)];
    b.tube(flourish, 0.115, "jade", start + 0.071, { lift: 0.25 }, 18);
    for (let beast = 0; beast < 3; beast++) {
      const z = outer - 0.75 - beast * 0.48, yy = y + profile(z, z) + 0.26;
      b.sphere(facePoint(z, yy, z, a), [0.11, 0.21, 0.14], "tile", start + 0.069 + beast * 2e-3);
      b.sphere(facePoint(z, yy + 0.22, z + 0.05, a), [0.105, 0.09, 0.12], "tile", start + 0.07 + beast * 2e-3);
    }
    const bellPos = facePoint(outer - 0.12, y + 0.38, outer - 0.12, a);
    b.cylinder(0.018, 0.018, 0.54, bellPos, "bronze", start + 0.077);
    b.cylinder(0.095, 0.19, 0.25, [bellPos[0], bellPos[1] - 0.35, bellPos[2]], "bronze", start + 0.079);
    b.sphere([bellPos[0], bellPos[1] - 0.49, bellPos[2]], [0.045, 0.065, 0.045], "bronze", start + 0.08);
    const rim = new THREE.TorusGeometry(0.183, 0.017, 4, 12);
    rim.rotateX(Math.PI / 2);
    b.add(rim, "bronze", start + 0.08, { p: [bellPos[0], bellPos[1] - 0.475, bellPos[2]] });
    rim.dispose();
  }
  b.box([inner * 2 + 0.12, 0.15, inner * 2 + 0.12], [0, y + height + 0.01, 0], "tile", start + 0.068);
}
function bracketBand(b, y, r, start) {
  const outline = new THREE.Shape();
  outline.moveTo(-0.65, 0.13);
  outline.lineTo(0.65, 0.13);
  outline.lineTo(0.59, -0.02);
  outline.bezierCurveTo(0.36, -0.03, 0.33, -0.22, 0.12, -0.23);
  outline.lineTo(-0.12, -0.23);
  outline.bezierCurveTo(-0.33, -0.22, -0.36, -0.03, -0.59, -0.02);
  outline.closePath();
  const arm = new THREE.ExtrudeGeometry(outline, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.018, bevelSize: 0.02, bevelSegments: 1, steps: 1, curveSegments: 6 });
  arm.translate(0, 0, -0.11);
  for (let side = 0; side < 4; side++) {
    const a = side * Math.PI / 2;
    b.box([r * 2 + 0.45, 0.3, 0.45], facePoint(0, y, r, a), "wood", start, { r: [0, a, 0] });
    for (let i = -4; i <= 4; i++) {
      const along = i * r / 4.4;
      b.box([0.33, 0.3, 0.42], facePoint(along, y - 0.64, r, a), "brick", start + 2e-3, { r: [0, a, 0] });
      for (let level = 0; level < 3; level++) {
        const z = r + 0.12 + level * 0.2, yy = y - 0.46 + level * 0.22;
        b.add(arm, "jade", start + 5e-3 + level * 5e-3, { p: facePoint(along, yy, z, a), r: [0, a, 0], s: [0.7 + level * 0.22, 1, 1] });
        b.add(arm, "jade", start + 6e-3 + level * 5e-3, { p: facePoint(along, yy + 0.1, z, a), r: [0, a + Math.PI / 2, 0], s: [0.75 + level * 0.2, 1, 1] });
        for (const sign of [-1, 1]) b.box([0.17, 0.16, 0.19], facePoint(along + sign * (0.28 + level * 0.1), yy + 0.17, z, a), "brick", start + 9e-3 + level * 5e-3, { r: [0, a, 0], shade: 0.85 });
      }
    }
    b.box([r * 2 + 0.7, 0.2, 0.25], facePoint(0, y + 0.3, r + 0.55, a), "jade", start + 0.025, { r: [0, a, 0] });
    b.box([r * 2 + 0.6, 0.034, 0.025], facePoint(0, y + 0.32, r + 0.69, a), "bronze", start + 0.028, { r: [0, a, 0] });
    for (let i = -6; i <= 6; i++) {
      b.box([0.39, 0.105, 0.03], facePoint(i * r / 6.6, y + 0.04, r + 0.245, a), "jade", start + 0.023, { r: [0, a, 0], shade: 1.07 });
    }
  }
  arm.dispose();
}
function railing(b, y, r, start) {
  for (let side = 0; side < 4; side++) {
    const a = side * Math.PI / 2;
    for (const h of [0, 0.37, 0.95]) b.box([r * 2 + 0.18, 0.1, 0.16], facePoint(0, y + h, r, a), "wood", start + h * 4e-3, { r: [0, a, 0] });
    for (let i = -6; i <= 6; i++) {
      const x = i * r / 6;
      b.box([0.13, 1.08, 0.14], facePoint(x, y + 0.47, r, a), "wood", start + 8e-3, { r: [0, a, 0] });
      for (const h of [0.05, 0.9]) {
        b.box([0.19, 0.12, 0.2], facePoint(x, y + h, r, a), "wood", start + 9e-3, { r: [0, a, 0], shade: 0.88 });
        b.sphere(facePoint(x, y + h, r + 0.105, a), [0.021, 0.021, 9e-3], "wood", start + 0.01, { r: [0, a, 0], shade: 0.66 });
      }
      b.cylinder(0.09, 0.1, 0.065, facePoint(x, y + 1.04, r, a), "bronze", start + 0.012);
      if (i < 6) {
        const cx = x + r / 12;
        for (const sign of [-1, 1]) b.box([0.052, 0.58, 0.065], facePoint(cx, y + 0.64, r, a), "wood", start + 0.013, { r: [0, a, sign * 0.69] });
        b.box([r / 6 - 0.18, 0.065, 0.065], facePoint(cx, y + 0.21, r, a), "jade", start + 0.014, { r: [0, a, 0] });
      }
    }
  }
}
function guardian(b, center, rotation, start, scale = 1.3) {
  const point = (x, y, z) => {
    const p = facePoint(x * scale, y * scale, z * scale, rotation);
    return [p[0] + center[0], p[1] + center[1], p[2] + center[2]];
  };
  const ell = (p, s, m = "stone", shade = 1) => b.sphere(point(...p), s.map((v) => v * scale), m, start, { r: [0, rotation, 0], shade });
  for (const [w, h, d, y] of [[1.4, 0.16, 1.25, 0.08], [1.24, 0.1, 1.12, 0.21], [1.02, 0.3, 0.93, 0.4], [1.27, 0.1, 1.14, 0.6]]) b.box([w * scale, h * scale, d * scale], point(0, y, 0), "stone", start, { r: [0, rotation, 0], shade: 0.92 });
  for (let j = -3; j <= 3; j++) {
    ell([j * 0.15, 0.24, 0.555], [0.065, 0.035, 0.02], "stone", 0.83);
    ell([j * 0.15, 0.56, 0.575], [0.055, 0.026, 0.018], "stone", 1.03);
  }
  ell([0, 1.2, -0.14], [0.45, 0.63, 0.38]);
  ell([0, 1.35, 0.17], [0.43, 0.6, 0.31]);
  ell([0, 1.97, 0.08], [0.51, 0.48, 0.42]);
  for (let ring = 0; ring < 3; ring++) for (let i = 0; i < 11; i++) {
    const a = i / 11 * TAU + ring * 0.24;
    const x = Math.cos(a) * (0.43 + ring * 0.015), yy = 1.99 + Math.sin(a) * 0.43, z = 0.04 - ring * 0.12;
    const pts = [];
    for (let k = 0; k <= 13; k++) {
      const t = k / 13, rr = 0.105 * (1 - t * 0.83), th = t * TAU * 1.38;
      pts.push(point(x + Math.cos(th) * rr, yy + Math.sin(th) * rr, z + 0.31));
    }
    b.tube(pts, 0.028 * scale, "stone", start, { shade: 0.92 }, 14);
  }
  ell([0, 1.78, 0.45], [0.3, 0.19, 0.22]);
  ell([0, 1.69, 0.52], [0.22, 0.075, 0.12], "recess");
  ell([0, 1.59, 0.44], [0.26, 0.08, 0.18]);
  ell([0, 1.89, 0.58], [0.15, 0.09, 0.095], "stone", 0.69);
  for (const sign of [-1, 1]) {
    ell([sign * 0.39, 2.24, -0.03], [0.17, 0.23, 0.095]);
    ell([sign * 0.39, 2.25, 0.04], [0.09, 0.13, 0.032], "stone", 0.72);
    ell([sign * 0.195, 2.03, 0.432], [0.112, 0.081, 0.035], "recess");
    ell([sign * 0.193, 2.038, 0.46], [0.045, 0.047, 0.026], "stone", 0.8);
    b.tube([point(sign * 0.065, 2.09, 0.47), point(sign * 0.16, 2.16, 0.49), point(sign * 0.31, 2.18, 0.4)], 0.052 * scale, "stone", start, {}, 12);
    ell([sign * 0.32, 1.89, 0.37], [0.16, 0.19, 0.13]);
    ell([sign * 0.29, 1.02, 0.27], [0.14, 0.5, 0.16]);
    ell([sign * 0.3, 0.7, 0.44], [0.25, 0.125, 0.29]);
    ell([sign * 0.37, 0.92, -0.28], [0.28, 0.32, 0.29]);
    for (let toe = 0; toe < 3; toe++) {
      ell([sign * 0.3 + (toe - 1) * 0.12, 0.69, 0.65], [0.061, 0.062, 0.1]);
      b.tube([point(sign * 0.3 + (toe - 1) * 0.12 - 0.037, 0.76, 0.48), point(sign * 0.3 + (toe - 1) * 0.12 - 0.037, 0.75, 0.64)], 9e-3 * scale, "recess", start, {}, 3);
    }
    b.cylinder(0.035, 9e-3, 0.16 * scale, point(sign * 0.13, 1.72, 0.62), "stone", start);
    for (let j = 0; j < 3; j++) b.tube([point(sign * 0.14, 1.84 - j * 0.055, 0.54), point(sign * 0.32, 1.83 - j * 0.065, 0.53), point(sign * 0.39, 1.92 - j * 0.055, 0.44)], 0.014 * scale, "stone", start, { shade: 0.72 }, 10);
  }
  b.tube([point(0.1, 1.03, -0.43), point(0.55, 1.19, -0.38), point(0.62, 1.52, -0.25), point(0.46, 1.62, -0.2), point(0.43, 1.46, -0.19)], 0.085 * scale, "stone", start, {}, 18);
  const collar = [];
  for (let i = 0; i <= 18; i++) {
    const a = i / 18 * Math.PI;
    collar.push(point(Math.cos(a) * 0.35, 1.44 - Math.sin(a) * 0.17, 0.4));
  }
  b.tube(collar, 0.025 * scale, "stone", start);
  ell([0, 1.16, 0.43], [0.085, 0.11, 0.06]);
  ell([-0.33, 0.75, 0.65], [0.16, 0.16, 0.16]);
}
function shaft(b) {
  const base = 13.52, h = 8.5, rows = 34;
  for (let row = 0; row < rows; row++) {
    const v0 = row / rows, v1 = (row + 1) / rows;
    for (let side = 0; side < 4; side++) {
      const a = side * Math.PI / 2;
      const g = surfaceGrid(1, 1, (u, v) => {
        const t = THREE.MathUtils.lerp(v0, v1, v), r = 4.25 - t * 0.97;
        return facePoint((u * 2 - 1) * r, base + t * h, r, a);
      }, (u, v) => [side % 2 ? 1 - u : u, THREE.MathUtils.lerp(v0, v1, v)]);
      const indices = g.index;
      for (let i = 0; i < indices.count; i += 3) {
        const v = indices.getX(i + 1);
        indices.setX(i + 1, indices.getX(i + 2));
        indices.setX(i + 2, v);
      }
      g.computeVertexNormals();
      b.add(g, "plaster", 0.606 + row * 48e-4, { duration: 0.012, lift: 0.28 });
      g.dispose();
    }
  }
  for (let side = 0; side < 4; side++) {
    const a = side * Math.PI / 2, r = 3.72;
    b.box([0.39, 0.57, 0.025], facePoint(0, 18.25, r, a), "recess", 0.72, { r: [0, a, 0] });
    for (const sign of [-1, 1]) b.box([0.045, 0.66, 0.08], facePoint(sign * 0.23, 18.25, r + 0.03, a), "stone", 0.724, { r: [0, a, 0] });
    for (const h2 of [-0.33, 0.33]) b.box([0.5, 0.055, 0.09], facePoint(0, 18.25 + h2, r + 0.03, a), "stone", 0.724, { r: [0, a, 0] });
  }
}
function buildArchitecture(b) {
  for (let side = 0; side < 4; side++) {
    const a = side * Math.PI / 2;
    for (let row = 0; row < 3; row++) for (let col = 0; col < 11; col++) {
      const x = -5.05 + col * 1.01;
      if (Math.abs(x) < 1.35) continue;
      b.box([0.992, 0.29, 0.64], facePoint(x, 0.2 + row * 0.3, 5.25, a), "stone", 9e-3 + row * 0.012 + col * 7e-4, { r: [0, a, 0], shade: 0.91 + col % 4 * 0.02 });
    }
    for (let row = 0; row < 24; row++) {
      const y = 1.03 + row * 0.274;
      const opening = y < 4.7 ? 1.82 : y < 6.48 ? Math.sqrt(Math.max(0, 1.78 ** 2 - (y - 4.7) ** 2)) + 0.15 : 0;
      for (const sign of [-1, 1]) {
        const width = 5.35 - opening;
        b.box([width, 0.274, 0.5], facePoint(sign * (opening + width / 2), y, 5.2, a), "brick", 0.11 + row * 62e-4, { r: [0, a, 0], shade: 0.65, lift: 0.3, duration: 9e-3 });
      }
      for (let col = 0; col < 16; col++) {
        const x = -5.1 + col * 0.675 + row % 2 * 0.31;
        if (x > 5.23) continue;
        const gap = y < 4.7 ? 1.42 : y < 6.12 ? Math.sqrt(Math.max(0, 1.42 ** 2 - (y - 4.7) ** 2)) : 0;
        if (Math.abs(x) < gap + 0.21) continue;
        b.box([0.657, 0.265, 0.56], facePoint(x, y, 5.23, a), "brick", 0.11 + row * 62e-4 + col * 23e-5, { r: [0, a, 0], shade: 0.94 + (row * 7 + col * 3) % 11 * 9e-3, lift: 0.3, duration: 9e-3 });
      }
    }
    for (const sign of [-1, 1]) for (let row = 0; row < 14; row++) b.box([0.35, 0.275, 0.7], facePoint(sign * 1.55, 0.92 + row * 0.277, 5.3, a), "jade", 0.13 + row * 9e-3, { r: [0, a, 0], shade: 0.94 + row % 3 * 0.035 });
    for (let i = 0; i < 17; i++) {
      const shape = new THREE.Shape(), t0 = i * Math.PI / 17 + 0.012, t1 = (i + 1) * Math.PI / 17 - 0.012;
      shape.absarc(0, 0, 1.76, t0, t1, false);
      shape.absarc(0, 0, 1.39, t1, t0, true);
      shape.closePath();
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.72, bevelEnabled: true, bevelThickness: 8e-3, bevelSize: 8e-3, bevelSegments: 1, steps: 1, curveSegments: 4 });
      g.translate(0, 0, -0.36);
      b.add(g, "jade", 0.26 + i * 1e-3, { p: facePoint(0, 4.7, 5.3, a), r: [0, a, 0], shade: 0.93 + i % 4 * 0.025 });
      g.dispose();
    }
  }
  for (const x of [-4.1, 0, 4.1]) for (const z of [-4.1, 4.1]) {
    b.cylinder(0.15, 0.21, 6.7, [x, 4.05, z], "wood", 0.062, { duration: 0.035, lift: 3 });
    b.cylinder(0.25, 0.32, 0.28, [x, 0.88, z], "stone", 0.047);
  }
  for (const y of [3.15, 6.95]) for (const side of [0, 1]) for (const sign of [-1, 1]) b.box([8.5, 0.24, 0.28], side ? [sign * 4.1, y, 0] : [0, y, sign * 4.1], "wood", 0.085, { r: [0, side * Math.PI / 2, 0] });
  bracketBand(b, 7.57, 5.15, 0.285);
  roof(b, 8, 7.2, 4.12, 1.5, 0.32);
  b.box([10.25, 0.25, 10.25], [0, 9.24, 0], "wood", 0.412);
  for (let side = 0; side < 4; side++) {
    const a = side * Math.PI / 2;
    for (const x of [-4.72, -2.36, 0, 2.36, 4.72]) {
      b.cylinder(0.26, 0.3, 0.26, facePoint(x, 9.47, 4.72, a), "stone", 0.42);
      b.cylinder(0.15, 0.19, 3, facePoint(x, 11.05, 4.72, a), "wood", 0.435, { duration: 0.03, lift: 1.5 });
      b.cylinder(0.22, 0.22, 0.12, facePoint(x, 12.45, 4.72, a), "jade", 0.467);
      for (const sign of [-1, 1]) {
        b.tube([facePoint(x + sign * 0.58, 12.42, 4.72, a), facePoint(x + sign * 0.31, 12.18, 4.72, a), facePoint(x, 12.02, 4.72, a)], 0.065, "wood", 0.47, { shade: 0.9 }, 6);
      }
    }
    b.box([9.8, 0.35, 0.38], facePoint(0, 12.55, 4.72, a), "wood", 0.475, { r: [0, a, 0] });
    for (let i = -6; i <= 6; i++) {
      const x = i * 0.68;
      b.box([0.56, 0.3, 0.07], facePoint(x, 12.28, 4.76, a), "jade", 0.48, { r: [0, a, 0] });
      b.tube([facePoint(x - 0.24, 12.34, 4.81, a), facePoint(x, 12.16, 4.81, a), facePoint(x + 0.24, 12.34, 4.81, a)], 0.021, "bronze", 0.484, {}, 6);
    }
  }
  railing(b, 9.55, 4.82, 0.49);
  for (const [i, [x, z, a]] of [[-4.55, 4.98, 0], [0, 4.98, 0], [4.55, 4.98, 0], [4.98, 0, Math.PI / 2], [-4.98, 0, -Math.PI / 2]].entries()) guardian(b, [x, 9.35, z], a + (i - 2) * 0.025, 0.532, 1.16 + variation(i) * 0.035);
  for (const x of [-2.35, 2.35]) lantern(b, [x, 11.64, 4.95], 0.51);
  bracketBand(b, 12.87, 4.78, 0.545);
  roof(b, 13.18, 6.35, 4.02, 1.24, 0.568);
  shaft(b);
  for (let side = 0; side < 4; side++) {
    const a = side * Math.PI / 2;
    for (let level = 0; level < 3; level++) b.box([6.7 + level * 0.32, 0.16, 0.28], facePoint(0, 21.84 + level * 0.19, 3.3 + level * 0.16, a), level === 1 ? "brick" : "stone", 0.775 + level * 3e-3, { r: [0, a, 0], shade: 0.87 });
    b.box([8.8, 0.28, 0.38], facePoint(0, 22.62, 4.18, a), "wood", 0.809, { r: [0, a, 0] });
  }
  for (let side = 0; side < 4; side++) {
    const a = side * Math.PI / 2;
    for (const sign of [-1, 1]) b.tube([facePoint(sign * 1.3, 20.45, 3.48, a), facePoint(sign * 1.65, 21.15, 3.68, a), facePoint(sign * 2.22, 21.9, 4.03, a), facePoint(sign * 2.4, 22.65, 4.5, a)], 0.15, "jade", 0.78, {}, 18);
  }
  bracketBand(b, 22.58, 4.45, 0.785);
  b.box([10.4, 0.26, 10.4], [0, 22.94, 0], "wood", 0.814);
  railing(b, 23.1, 5.1, 0.852);
  for (let side = 0; side < 4; side++) {
    const a = side * Math.PI / 2;
    for (let row = 0; row < 14; row++) {
      const y0 = 23.03 + row * 0.246, y1 = y0 + 0.241;
      const minY = Math.max(-1.16, Math.min(1.16, y0 - 24.83)), maxY = Math.max(-1.16, Math.min(1.16, y1 - 24.83));
      const inHole = y1 > 23.67 && y0 < 25.99;
      for (const sign of [-1, 1]) {
        const s = new THREE.Shape();
        s.moveTo(sign * 4.06, y0);
        s.lineTo(sign * 4.06, y1);
        if (inHole) {
          for (let j = 0; j <= 8; j++) {
            const yy = y1 + (y0 - y1) * j / 8, dy = THREE.MathUtils.clamp(yy - 24.83, minY, maxY);
            s.lineTo(sign * Math.sqrt(Math.max(0, 1.16 ** 2 - dy ** 2)), yy);
          }
        } else {
          s.lineTo(0, y1);
          s.lineTo(0, y0);
        }
        s.closePath();
        const g = new THREE.ExtrudeGeometry(s, { depth: 0.42, bevelEnabled: false, steps: 1, curveSegments: 4 });
        g.translate(0, 0, -0.21);
        b.add(g, "brick", 0.824 + row * 2e-3, { p: facePoint(0, 0, 4.02, a), r: [0, a, 0], shade: 0.97 + row % 3 * 0.012 });
        g.dispose();
      }
    }
    const ring = new THREE.TorusGeometry(1.26, 0.14, 7, 64);
    b.add(ring, "stone", 0.868, { p: facePoint(0, 24.83, 4.27, a), r: [0, a, 0] });
    ring.dispose();
    const surround = new THREE.Shape();
    surround.absarc(0, 0, 1.185, 0, TAU, false);
    const hole = new THREE.Path();
    hole.absarc(0, 0, 1.105, 0, TAU, true);
    surround.holes.push(hole);
    const sleeve = new THREE.ExtrudeGeometry(surround, { depth: 0.31, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1, curveSegments: 32 });
    b.add(sleeve, "bronze", 0.87, { p: facePoint(0, 24.83, 4, a), r: [0, a, 0], shade: 0.78 });
    sleeve.dispose();
    const face = new THREE.CylinderGeometry(1.13, 1.13, 0.055, 48);
    face.rotateX(Math.PI / 2);
    b.add(face, "recess", 0.873, { p: facePoint(0, 24.83, 4.05, a), r: [0, a, 0] });
    face.dispose();
    for (let i = 0; i < 60; i++) {
      const t = i / 60 * TAU;
      b.box([i % 5 ? 0.018 : 0.045, i % 5 ? 0.065 : 0.16, 0.024], facePoint(Math.sin(t) * 0.98, 24.83 + Math.cos(t) * 0.98, 4.105, a), "stone", 0.88, { r: [0, a, -t] });
    }
    for (const r of [0.82, 1.05]) {
      const ring2 = new THREE.TorusGeometry(r, 9e-3, 4, 48);
      b.add(ring2, "bronze", 0.882, { p: facePoint(0, 24.83, 4.11, a), r: [0, a, 0] });
      ring2.dispose();
    }
    b.tube([facePoint(-0.05, 24.76, 4.13, a), facePoint(0.49, 25.39, 4.13, a)], 0.035, "stone", 0.887, {}, 2);
    b.tube([facePoint(0.03, 24.79, 4.15, a), facePoint(-0.45, 25.07, 4.15, a)], 0.045, "stone", 0.887, {}, 2);
    b.sphere(facePoint(0, 24.83, 4.17, a), [0.075, 0.075, 0.035], "bronze", 0.89, { r: [0, a, 0] });
    const glazing = new THREE.CircleGeometry(1.095, 48);
    b.add(glazing, "glass", 0.892, { p: facePoint(0, 24.83, 4.29, a), r: [0, a, 0], lift: 0.1 });
    glazing.dispose();
  }
  bracketBand(b, 26.55, 4.08, 0.895);
  roof(b, 26.9, 6.6, 0.2, 3.24, 0.905);
  for (let i = 0; i < 5; i++) b.cylinder(0.34 - i * 0.041, 0.45 - i * 0.055, 0.18, [0, 30.3 + i * 0.23, 0], "bronze", 0.989 + i * 1e-3);
  b.sphere([0, 31.5, 0], [0.21, 0.32, 0.21], "bronze", 0.997, { duration: 3e-3, lift: 0.22 });
}
function lantern(b, p, start) {
  b.sphere(p, [0.28, 0.43, 0.28], "paper", start);
  for (const sign of [-1, 1]) b.cylinder(0.2, 0.2, 0.065, [p[0], p[1] + sign * 0.37, p[2]], "bronze", start);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU;
    b.tube([[p[0] + Math.sin(a) * 0.15, p[1] - 0.37, p[2] + Math.cos(a) * 0.15], [p[0] + Math.sin(a) * 0.29, p[1], p[2] + Math.cos(a) * 0.29], [p[0] + Math.sin(a) * 0.15, p[1] + 0.37, p[2] + Math.cos(a) * 0.15]], 9e-3, "wood", start, {}, 10);
  }
  b.cylinder(0.01, 0.01, 0.65, [p[0], p[1] + 0.7, p[2]], "bronze", start);
  b.cylinder(0.03, 0.055, 0.38, [p[0], p[1] - 0.58, p[2]], "brick", start);
}
function courtyard(b) {
  b.box([23.6, 0.45, 23.6], [0, -0.45, 0], "stone", -1, { lift: 0, shade: 0.92 });
  b.box([23.9, 0.12, 23.9], [0, -0.18, 0], "stone", -1, { lift: 0 });
  for (let x2 = -8; x2 <= 8; x2++) for (let z2 = -8; z2 <= 8; z2++) {
    if (Math.abs(x2) < 4 && Math.abs(z2) < 4) continue;
    b.box([1.344, 0.08, 1.344], [x2 * 1.37, -0.085 + (variation(x2 * 71 + z2 * 13) - 0.5) * 0.012, z2 * 1.37], "stone", -1, { lift: 0, shade: 0.86 + variation(x2 * 3 + z2 * 7) * 0.13 });
  }
  for (let i = 0; i < 5; i++) b.box([4.4, 0.17, 1.02], [0, i * 0.17, 9.3 - i * 0.85], "stone", -1, { lift: 0 });
  for (const sign of [-1, 1]) {
    b.box([0.36, 0.3, 4.8], [sign * 2.46, 0.44, 7.65], "stone", -1, { r: [-0.14, 0, 0], lift: 0 });
    for (const z2 of [5.45, 9.85]) {
      const y = z2 < 6 ? 1.05 : 0.28;
      b.box([0.48, 0.78, 0.48], [sign * 2.46, y, z2], "stone", -1, { lift: 0 });
      b.sphere([sign * 2.46, y + 0.5, z2], [0.24, 0.25, 0.24], "stone", -1, { lift: 0 });
    }
    const px = sign * 9.3, pz = -7.8;
    b.box([3.1, 0.23, 3.1], [px, 0.02, pz], "stone", -1, { lift: 0 });
    b.tube([[px, 0, pz], [px + 0.25, 1.5, pz], [px - 0.25, 3.1, pz - 0.1], [px + 0.12, 4.7, pz]], 0.15, "wood", -1, { lift: 0 }, 16);
    for (let branch = 0; branch < 7; branch++) {
      const a = branch * 2.3, h = 1.9 + branch * 0.39, x2 = px + Math.cos(a) * 1.25, z2 = pz + Math.sin(a) * 1.2;
      b.tube([[px, h - 0.25, pz], [x2 - 0.2, h, z2], [x2, h + 0.18, z2]], 0.05, "wood", -1, { lift: 0 }, 8);
      for (let n = 0; n < 28; n++) {
        const an = n * 2.4, r = Math.sqrt(n / 28) * 0.75, seed = branch * 41 + n;
        const px2 = x2 + Math.cos(an) * r, py = h + 0.22 + Math.sin(n) * 0.16, pz2 = z2 + Math.sin(an) * r;
        b.sphere([px2, py, pz2], [0.17 + variation(seed) * 0.13, 0.065 + variation(seed + 1) * 0.05, 0.13 + variation(seed + 2) * 0.09], "moss", -1, { r: [variation(seed) * 0.5, an, variation(seed + 3) * 0.5], lift: 0, shade: 0.75 + variation(seed + 4) * 0.25 });
        if (n % 3 === 0) b.tube([[x2, h, z2], [px2, py - 0.08, pz2]], 0.012, "wood", -1, { lift: 0 }, 2);
      }
    }
    const lx = sign * 7.5, lz = 7.2;
    b.box([0.92, 0.2, 0.92], [lx, 0.1, lz], "stone", -1, { lift: 0 });
    b.cylinder(0.12, 0.2, 1.3, [lx, 0.8, lz], "stone", -1, { lift: 0 });
    b.box([0.72, 0.12, 0.72], [lx, 1.47, lz], "stone", -1, { lift: 0 });
    for (const dx of [-0.27, 0.27]) for (const dz of [-0.27, 0.27]) b.box([0.075, 0.65, 0.075], [lx + dx, 1.8, lz + dz], "stone", -1, { lift: 0 });
    b.sphere([lx, 1.8, lz], [0.2, 0.26, 0.2], "paper", -1, { lift: 0 });
    b.cylinder(0.07, 0.64, 0.34, [lx, 2.27, lz], "tile", -1, { lift: 0 });
    b.sphere([lx, 2.5, lz], [0.09, 0.13, 0.09], "stone", -1, { lift: 0 });
  }
  const x = -7.1, z = 5.4;
  const robe = new THREE.LatheGeometry(Array.from({ length: 15 }, (_, i) => new THREE.Vector2(0.24 + 0.28 * Math.pow(1 - i / 14, 1.6), i / 14 * 1.85)), 32);
  b.add(robe, "cloth", 5e-3, { p: [x, 0.05, z], duration: 0.018, lift: 0.05 });
  robe.dispose();
  for (let i = 0; i < 18; i++) {
    const a = i / 18 * TAU;
    b.tube([[x + Math.sin(a) * 0.5, 0.08, z + Math.cos(a) * 0.5], [x + Math.sin(a) * 0.34, 1.02, z + Math.cos(a) * 0.34], [x + Math.sin(a) * 0.25, 1.84, z + Math.cos(a) * 0.25]], 0.012, "cloth", 5e-3, { shade: i % 2 ? 0.8 : 1.1, lift: 0.05 }, 8);
  }
  b.cylinder(0.25, 0.31, 0.55, [x, 1.94, z], "cloth", 5e-3, { lift: 0.05 });
  b.sphere([x, 2.47, z], [0.16, 0.21, 0.17], "stone", 5e-3, { lift: 0.05 });
  b.sphere([x, 2.66, z - 0.045], [0.11, 0.1, 0.12], "recess", 5e-3, { lift: 0.05 });
  b.box([0.33, 0.045, 0.29], [x, 2.62, z], "recess", 5e-3, { lift: 0.05 });
  b.box([0.065, 0.25, 0.07], [x, 2.76, z], "recess", 5e-3, { lift: 0.05 });
  for (const sign of [-1, 1]) {
    b.cylinder(0.16, 0.23, 0.71, [x + sign * 0.33, 1.84, z + 0.04], "cloth", 5e-3, { r: [0, 0, sign * 0.5], lift: 0.05 });
    b.box([0.055, 0.48, 0.045], [x + sign * 0.08, 2.05, z + 0.25], "stone", 5e-3, { r: [0, 0, sign * 0.4], lift: 0.05 });
  }
}
export {
  bracketBand,
  buildArchitecture,
  courtyard,
  guardian,
  roof
};
