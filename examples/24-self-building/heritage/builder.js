// heritage/builder.js from Hailey's threejs-architecture-effects (MIT, https://github.com/lhlGitHub/threejs-architecture-effects):
// assets/starter/src/heritage/builder.ts with the TypeScript types stripped by esbuild for connect-ai-three (the comments
// are in the original). Imports point at three/addons/ instead of three/examples/jsm/.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
class HeritageBuilder {
  constructor(materials) {
    this.materials = materials;
  }
  materials;
  batches = /* @__PURE__ */ new Map();
  cache = /* @__PURE__ */ new Map();
  transform = new THREE.Object3D();
  progress = { value: 0 };
  meshes = [];
  depths = [];
  pieces = 0;
  add(geometry, material, start, options = {}) {
    this.transform.position.set(...options.p ?? [0, 0, 0]);
    this.transform.rotation.set(...options.r ?? [0, 0, 0]);
    this.transform.scale.set(...options.s ?? [1, 1, 1]);
    this.transform.updateMatrix();
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    g.applyMatrix4(this.transform.matrix);
    const n = g.getAttribute("position").count;
    const schedule = new Float32Array(n * 3), color = new Float32Array(n * 3);
    const shade = options.shade ?? 1, tint = options.tint ?? [1, 1, 1];
    const uv = g.getAttribute("uv");
    if (uv && !["plaster", "glass"].includes(material)) {
      const offset = Math.sin(this.pieces * 127.1) * 43758.5453 % 1;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + offset, uv.getY(i) + offset * 0.731);
    }
    for (let i = 0; i < n; i++) {
      schedule.set([start, options.duration ?? 0.013, options.lift ?? 0.45], i * 3);
      const normal = g.getAttribute("normal");
      const underside = normal ? THREE.MathUtils.lerp(0.76, 1, THREE.MathUtils.smoothstep(normal.getY(i), -0.8, 0.2)) : 1;
      color.set(tint.map((v) => v * shade * underside), i * 3);
    }
    g.setAttribute("aBuild", new THREE.BufferAttribute(schedule, 3));
    g.setAttribute("color", new THREE.BufferAttribute(color, 3));
    if (!g.getAttribute("uv")) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    if (!g.getAttribute("normal")) g.computeVertexNormals();
    for (const name of Object.keys(g.attributes)) if (!["position", "normal", "uv", "aBuild", "color"].includes(name)) g.deleteAttribute(name);
    if (!this.batches.has(material)) this.batches.set(material, []);
    this.batches.get(material).push(g);
    this.pieces++;
  }
  geo(key, fn) {
    if (!this.cache.has(key)) this.cache.set(key, fn());
    return this.cache.get(key);
  }
  box(size, p, material, start, options = {}) {
    const key = `box:${size.join(",")}`;
    const geometry = this.geo(key, () => {
      if (Math.min(...size) < 0.18) return new THREE.BoxGeometry(...size);
      const [w, h, d] = size, r = Math.min(...size) * 0.055;
      const outline = new THREE.Shape();
      outline.moveTo(-w / 2 + r, -h / 2 + r);
      outline.lineTo(w / 2 - r, -h / 2 + r);
      outline.lineTo(w / 2 - r, h / 2 - r);
      outline.lineTo(-w / 2 + r, h / 2 - r);
      outline.closePath();
      const g = new THREE.ExtrudeGeometry(outline, { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 1, steps: 1 });
      g.translate(0, 0, -d / 2 + r);
      return g;
    });
    this.add(geometry, material, start, { ...options, p });
  }
  sphere(p, s, material, start, options = {}) {
    const detail = Math.max(...s) > 0.3;
    this.add(this.geo(`sphere:${detail}`, () => new THREE.SphereGeometry(1, detail ? 16 : 10, detail ? 12 : 7)), material, start, { ...options, p, s });
  }
  cylinder(top, bottom, height, p, material, start, options = {}) {
    this.add(this.geo(`cyl:${top}/${bottom}/${height}`, () => new THREE.CylinderGeometry(top, bottom, height, 12)), material, start, { ...options, p });
  }
  tube(points, radius, material, start, options = {}, segments = 18) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    const geometry = new THREE.TubeGeometry(curve, segments, radius, 5, false);
    this.add(geometry, material, start, options);
    geometry.dispose();
  }
  finish(scene) {
    const inject = (m) => {
      m.onBeforeCompile = (shader) => {
        shader.uniforms.uBuildProgress = this.progress;
        shader.vertexShader = "attribute vec3 aBuild; uniform float uBuildProgress; varying float vConstruction;\n" + shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
          float buildT=clamp((uBuildProgress-aBuild.x)/max(.0001,aBuild.y),0.0,1.0);
          vConstruction=buildT;
          float settle=sin(buildT*6.2831853)*pow(1.0-buildT,2.0)*0.035;
          transformed.y+=aBuild.z*(pow(1.0-buildT,3.0)-settle);`);
        shader.fragmentShader = "varying float vConstruction;\n" + shader.fragmentShader.replace("void main() {", "void main() { if(vConstruction<=0.0) discard;");
      };
      m.customProgramCacheKey = () => "heritage-solid-assembly-v2";
    };
    for (const [name, geometries] of this.batches) {
      const combined = mergeGeometries(geometries, false);
      combined.computeBoundingSphere();
      geometries.forEach((g) => g.dispose());
      const material = this.materials[name];
      inject(material);
      const mesh = new THREE.Mesh(combined, material);
      mesh.name = `heritage-${name}`;
      mesh.receiveShadow = name !== "glass";
      mesh.castShadow = !["moss", "glass"].includes(name);
      const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
      inject(depth);
      mesh.customDepthMaterial = depth;
      this.depths.push(depth);
      this.meshes.push(mesh);
      scene.add(mesh);
    }
    this.cache.forEach((g) => g.dispose());
    this.cache.clear();
    this.batches.clear();
  }
  dispose() {
    this.meshes.forEach((m) => {
      m.geometry.dispose();
      m.removeFromParent();
    });
    this.depths.forEach((m) => m.dispose());
  }
}
export {
  HeritageBuilder
};
