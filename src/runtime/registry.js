// One registry for everything a spec can name. Adapters (three examples/jsm, Rapier, glTF, fonts, your own code)
// register here, so a web page only ships the parts its spec uses.
export const REG = {
  objects: new Map(), // type -> {make(def, ctx) -> Object3D | Promise<Object3D>, source, license}
  materials: new Map(), // preset -> (def, ctx) -> Material
  post: new Map(), // type -> {order, make(def, ctx) -> pass | finish uniforms}
  fonts: new Map(), // name -> typeface json
  plugins: new Map(), // name -> {name, ...hooks}
};
export const registerObject = (type, make, meta = {}) => REG.objects.set(type, {make, ...meta});
export const registerMaterial = (name, make, meta = {}) => REG.materials.set(name, Object.assign(make, {meta}));
export const registerPost = (type, def) => REG.post.set(type, def);
export const registerFont = (name, json) => REG.fonts.set(name, json);
export const registerPlugin = (p) => REG.plugins.set(p.name, p);

// which optional adapter a spec needs (used by the web builder and by error messages)
export const NEEDS = {
  objects: {text3d: 'text3d', wordmark: 'brand', monogram: 'brand', building: 'brand', 'cinema-camera': 'brand', microphone: 'brand', workstation: 'brand', display: 'brand', laptop: 'brand', softbox: 'brand', clapper: 'brand', book: 'brand', gltf: 'gltf', svg: 'svg', blob: 'jsm-objects', teapot: 'jsm-geometries', parametric: 'jsm-geometries'},
  post: {ao: 'post-extra', outline: 'post-extra', pixel: 'post-extra', halftone: 'post-extra', dof: 'post-extra', smaa: 'post-extra'},
  env: {hdri: 'hdri'},
};
