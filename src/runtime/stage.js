// The stage: spec in, a renderer with render(t) out. render(t) is a pure function of time, so the web page and
// the video are the same picture frame for frame. Every GPU resource is tracked and released in dispose().
import * as THREE from 'three';
import {REG} from './registry.js';
import {normalizeSpec} from './spec.js';
import {makeObject} from './objects.js';
import {makeMaterial} from './materials.js';
import {applyMotions, captureBase} from './motion.js';
import {cameraPose} from './camera.js';
import {makeLights, updateLights, makeEnvironment} from './lights.js';
import {makePost} from './post.js';
import {clamp, lerp, v3, EASE} from './util.js';

const TONE = {aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping, neutral: THREE.NeutralToneMapping, reinhard: THREE.ReinhardToneMapping, none: THREE.NoToneMapping};
export const TONES = Object.keys(TONE);
const DESIGN_ASPECT = 16 / 9;

// how many WebGL contexts this page holds through the kit (the self-check reads it to find leaks)
export const LIVE = {contexts: 0, created: 0, disposed: 0};

function gradientTexture(top, bottom, mid, horizon = 0.5) {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 512;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, top);
  if (mid) gr.addColorStop(horizon, mid);
  gr.addColorStop(1, bottom);
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// pointer script for video: [{t, x, y, orbit:[az,el], zoom}] -> the input at time t (smooth between keys)
export function scriptedInput(script, t) {
  if (!script || !script.length) return null;
  let a = script[0], b = script[script.length - 1];
  for (let i = 0; i < script.length - 1; i++) {
    if (t >= script[i].t && t <= script[i + 1].t) {
      a = script[i];
      b = script[i + 1];
      break;
    }
  }
  if (t <= script[0].t) b = a = script[0];
  if (t >= script[script.length - 1].t) a = b = script[script.length - 1];
  const k = a === b ? 0 : EASE.smooth(clamp((t - a.t) / Math.max(1e-6, b.t - a.t)));
  const mix = (p, q, d) => lerp(p ?? d, q ?? p ?? d, k);
  const x = mix(a.x, b.x, 0), y = mix(a.y, b.y, 0);
  const clicks = {};
  for (const e of script) if (e.click && e.t <= t) clicks[e.click] = e.t;
  return {pointer: [x, y], parallax: [x, y], orbit: [mix(a.orbit?.[0], b.orbit?.[0], 0), mix(a.orbit?.[1], b.orbit?.[1], 0)], zoom: mix(a.zoom, b.zoom, 1), clicks, down: !!(a.down && b.down), scripted: true};
}

export async function createStage(specIn, opts = {}) {
  const spec = normalizeSpec(specIn);
  const mode = opts.mode || 'video';
  const size = {width: opts.width ?? spec.size.width, height: opts.height ?? spec.size.height};
  const canvas = opts.canvas || document.createElement('canvas');
  const transparent = opts.transparent ?? spec.background === 'transparent';
  const warnings = [];
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: transparent, premultipliedAlpha: true, preserveDrawingBuffer: mode !== 'web' || !!opts.preserve, powerPreference: 'high-performance'});
  LIVE.contexts++;
  LIVE.created++;
  renderer.setPixelRatio(opts.pixelRatio ?? 1);
  renderer.setSize(size.width, size.height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = TONE[spec.tone] ?? THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = spec.exposure ?? 1;
  renderer.shadowMap.enabled = !!spec.shadows && opts.shadows !== false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  if (transparent) renderer.setClearColor(0x000000, 0);
  renderer.info.autoReset = false; // we count every pass of a frame, not just the last one

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(spec.camera.fov ?? 35, size.width / size.height, 0.1, 600);
  camera.layers.enable(1); // layer 1 = objects with "reflect": false
  const ctx = {
    THREE, spec, mode, size, renderer, scene, camera, transparent,
    palette: spec.palette,
    fogColor: spec.fog ? spec.fog.color : spec.background && spec.background.bottom,
    shadows: renderer.shadowMap.enabled,
    disposables: [], updaters: [], timeUniforms: [], textures: [], resizers: [], mixers: [],
    byId: new Map(),
    warn: (m) => {
      if (!warnings.includes(m)) warnings.push(m);
    },
    resolve: (url) => {
      if (/^(https?:|data:|blob:)/.test(url)) return url;
      if (url.startsWith('kit:')) return (opts.kitBase ?? 'assets/kit/') + url.slice(4);
      return (opts.assetBase ?? '') + url;
    },
    loadTexture: async (src) => {
      const tex = await new THREE.TextureLoader().loadAsync(ctx.resolve(src));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      ctx.disposables.push(tex);
      ctx.textures.push({name: src, width: tex.image.width, height: tex.image.height});
      return tex;
    },
    material: (d) => makeMaterial(d, ctx),
  };
  ctx.make = (d) => makeObject(d, ctx);

  // background
  const bg = spec.background;
  if (!transparent && bg) {
    if (bg.type === 'gradient') {
      scene.background = gradientTexture(bg.top, bg.bottom, bg.mid, bg.horizon);
      ctx.disposables.push(scene.background);
    } else if (bg.type === 'sky') {
      const hook = REG.plugins.get('jsm-objects');
      if (!hook) throw new Error('background "sky" needs the "jsm-objects" adapter (it is left out of this build)');
      scene.add(hook.makeSky(bg, ctx));
      camera.far = 12000;
    } else scene.background = new THREE.Color(bg.color || '#000000');
  }
  if (spec.fog && !transparent) scene.fog = new THREE.FogExp2(spec.fog.color, spec.fog.density ?? 0.03);
  const fogDensity = scene.fog ? scene.fog.density : null;

  await makeEnvironment(spec.env, ctx);
  const lights = makeLights(spec.lights, ctx);

  // objects (the look may add a backdrop)
  const tops = [];
  const defs = [...(transparent ? [] : spec.backdrop.map((b, i) => ({id: `backdrop-${i + 1}`, motion: [], ...b}))), ...spec.objects];
  for (const d of defs) {
    const o = await makeObject(d, ctx);
    scene.add(o);
    captureBase(o);
    tops.push(o);
    const reg = (x) => {
      if (x.userData.def && x.userData.def.id) ctx.byId.set(x.userData.def.id, x);
      x.children.forEach(reg);
    };
    reg(o);
  }
  // nested objects with their own motions
  const movers = [];
  scene.traverse((o) => {
    const d = o.userData.def;
    if (d && d.motion && d.motion.length) {
      if (!o.userData.base) captureBase(o);
      else for (const c of o.children) if (!c.userData.base) c.userData.base = {p: c.position.clone(), q: c.quaternion.clone(), s: c.scale.clone()};
      movers.push(o);
    } else if (o.userData.billboard) {
      captureBase(o);
      movers.push(o);
    }
  });

  // physics (Rapier adapter): bake the whole run once, then read poses by time
  let physics = null;
  const phys = REG.plugins.get('physics');
  const isBody = (v) => v === true || v === 'dynamic' || v === 'fixed';
  const wantsPhysics = spec.physics || defs.some((d) => isBody(d.body) || isBody(d.bodyEach));
  if (wantsPhysics) {
    if (!phys) throw new Error('physics needs the "physics" adapter (it is left out of this build)');
    scene.updateMatrixWorld(true);
    physics = await phys.bake(spec, ctx, tops);
  }
  for (const p of REG.plugins.values()) if (p.afterBuild) await p.afterBuild(ctx, tops);

  // a small ring shows where the scripted pointer is (video only), so a clip can show the interaction
  let cursor = null;
  if (spec.pointerScript && spec.showPointer !== false && mode !== 'web') {
    const cg = new THREE.RingGeometry(0.72, 1, 48), cm = new THREE.MeshBasicMaterial({color: spec.palette.text, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, toneMapped: false});
    ctx.disposables.push(cg, cm);
    cursor = new THREE.Mesh(cg, cm);
    cursor.renderOrder = 999;
    cursor.frustumCulled = false;
    scene.add(cursor);
  }

  const post = makePost(spec.post, ctx);

  // person matte (3D behind a person in your own video): after the frame is drawn, one full-screen quad erases the
  // 3D wherever the matte says "person". Doubtful pixels count as person, so the footage always wins.
  let occ = null;
  function setOccluder(image, o = {}) {
    if (!image) {
      if (occ) occ.on = false;
      return;
    }
    if (!occ) {
      const tex = new THREE.Texture();
      tex.minFilter = tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      const mat = new THREE.ShaderMaterial({
        depthTest: false, depthWrite: false, transparent: true, toneMapped: false,
        blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
        uniforms: {tMatte: {value: tex}, uLo: {value: 0.06}, uHi: {value: 0.42}, uPx: {value: new THREE.Vector2(1 / 1920, 1 / 1080)}},
        vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
        fragmentShader: /* glsl */ `uniform sampler2D tMatte; uniform float uLo; uniform float uHi; uniform vec2 uPx; varying vec2 vUv;
          void main(){ float m = texture2D(tMatte, vUv).r;
            m = max(m, max(max(texture2D(tMatte, vUv + vec2(uPx.x, 0.0)).r, texture2D(tMatte, vUv - vec2(uPx.x, 0.0)).r), max(texture2D(tMatte, vUv + vec2(0.0, uPx.y)).r, texture2D(tMatte, vUv - vec2(0.0, uPx.y)).r)));
            gl_FragColor = vec4(0.0, 0.0, 0.0, smoothstep(uLo, uHi, m)); }`,
      });
      const geo = new THREE.PlaneGeometry(2, 2);
      const quad = new THREE.Mesh(geo, mat);
      quad.frustumCulled = false;
      const sc = new THREE.Scene();
      sc.add(quad);
      ctx.disposables.push(tex, mat, geo);
      occ = {tex, mat, sc, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), on: true};
    }
    occ.tex.image = image;
    occ.tex.needsUpdate = true;
    occ.on = true;
    occ.mat.uniforms.uLo.value = o.lo ?? 0.06;
    occ.mat.uniforms.uHi.value = o.hi ?? 0.42;
    const grow = o.grow ?? 1.5;
    occ.mat.uniforms.uPx.value.set(grow / size.width, grow / size.height);
  }
  const interact = new Set(spec.interact.map((i) => (typeof i === 'string' ? i : i.type)));
  const hoverables = tops.filter((o) => !o.userData.isFloor && !o.userData.isBackdrop && o.userData.def.hover !== false);
  // hover and click change scale / rotation: those objects must go back to their base pose every frame, or the
  // change piles up and the picture stops being a function of time
  if (interact.has('hover') || interact.has('click')) for (const o of hoverables) if (!movers.includes(o)) movers.push(o);
  const ray = new THREE.Raycaster();
  ray.layers.enableAll();
  const ndc = new THREE.Vector2();
  let live = {pointer: null, orbit: [0, 0], zoom: 1, parallax: null, clicks: {}};
  let hovered = null, lastT = 0, frames = 0;
  const lookAtV = new THREE.Vector3();

  function setCamera(t, input) {
    const pose = cameraPose(spec.camera, t, input);
    const aspect = size.width / size.height;
    if (aspect < DESIGN_ASPECT * 0.98 && spec.camera.fit !== false) {
      // narrow frame (phone): step back so the picture designed for 16:9 still fits
      const k = Math.pow(DESIGN_ASPECT / aspect, spec.camera.fitPower ?? 0.9);
      pose.position.sub(pose.target).multiplyScalar(k).add(pose.target);
      // the camera is k times farther away: thin the haze by the same factor, or the scene sinks into the fog
      if (scene.fog && fogDensity != null) scene.fog.density = fogDensity / k;
    } else if (scene.fog && fogDensity != null) scene.fog.density = fogDensity;
    camera.fov = pose.fov;
    camera.aspect = aspect;
    camera.position.copy(pose.position);
    camera.lookAt(lookAtV.copy(pose.target));
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    return pose;
  }

  function render(t, inputIn) {
    t = Math.max(0, t);
    lastT = t;
    const scripted = mode !== 'web' || opts.useScript ? scriptedInput(spec.pointerScript, t) : null;
    const input = inputIn || scripted || (mode === 'web' ? live : null);
    const camInput = input ? {orbit: interact.has('orbit') || input.scripted ? input.orbit : null, zoom: interact.has('zoom') || input.scripted ? input.zoom : 1, parallax: interact.has('parallax') ? input.parallax : null, parallaxAmount: spec.parallaxAmount} : null;
    renderer.info.reset();
    for (const u of ctx.timeUniforms) u.value = t;
    const pose = setCamera(t, camInput);
    for (const up of ctx.updaters) up(t);
    for (const m of ctx.mixers) m.setTime(t);
    for (const o of movers) applyMotions(o, o.userData.def.motion || [], t, camera);
    if (physics) physics.update(t);
    updateLights(lights, t);
    // hover: lift what is under the pointer
    hovered = null;
    if (interact.has('hover') && input && input.pointer) {
      ndc.set(input.pointer[0], -input.pointer[1]);
      scene.updateMatrixWorld();
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(hoverables, true)[0];
      if (hit) {
        let o = hit.object;
        while (o.parent && !hoverables.includes(o)) o = o.parent;
        if (hoverables.includes(o)) {
          hovered = o;
          o.scale.multiplyScalar(spec.hoverScale ?? 1.07);
        }
      }
    }
    if (interact.has('click') && input && input.clicks) {
      for (const [id, t0] of Object.entries(input.clicks)) {
        const o = ctx.byId.get(id);
        if (o) o.rotateY(EASE.inOut(clamp((t - t0) / 1.1)) * Math.PI * 2);
      }
    }
    if (cursor) {
      cursor.visible = !!(input && input.pointer);
      if (cursor.visible) {
        cursor.position.set(input.pointer[0], -input.pointer[1], 0.2).unproject(camera);
        const d = camera.position.distanceTo(cursor.position);
        cursor.scale.setScalar(d * Math.tan((camera.fov * Math.PI) / 360) * (input.down ? 0.028 : 0.04));
        cursor.quaternion.copy(camera.quaternion);
      }
    }
    if (post) {
      post.frame(t, spec.fps, {focus: pose.position.distanceTo(pose.target)});
      post.composer.render();
    } else renderer.render(scene, camera);
    if (occ && occ.on) {
      const ac = renderer.autoClear;
      renderer.autoClear = false;
      renderer.setRenderTarget(null);
      renderer.render(occ.sc, occ.cam);
      renderer.autoClear = ac;
    }
    frames++;
  }

  function resize(w, h, pixelRatio = renderer.getPixelRatio()) {
    size.width = w;
    size.height = h;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(w, h, false);
    if (post) post.setSize(w, h, pixelRatio);
    for (const r of ctx.resizers) r(w, h);
  }

  function stats() {
    const i = renderer.info;
    let lights2 = 0, meshes = 0;
    scene.traverse((o) => {
      if (o.isLight) lights2++;
      if (o.isMesh || o.isPoints || o.isLine) meshes++;
    });
    return {
      calls: i.render.calls, triangles: i.render.triangles, points: i.render.points, lines: i.render.lines,
      geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs ? i.programs.length : 0,
      lights: lights2, meshes, passes: post ? post.passes : [],
      maxTexture: ctx.textures.reduce((m, x) => Math.max(m, x.width, x.height), 0),
      textureList: ctx.textures.slice(0, 40),
      textureBytes: ctx.textures.reduce((s, x) => s + x.width * x.height * 4 * 1.33, 0),
      size: {...size}, pixelRatio: renderer.getPixelRatio(), frames, warnings: warnings.slice(),
    };
  }

  // where every top-level object sits on screen at the current time (0..1 from the top-left corner)
  const box = new THREE.Box3(), part = new THREE.Box3(), corner = new THREE.Vector3();
  function screenBoxes() {
    scene.updateMatrixWorld(true);
    const out = [];
    for (const o of tops) {
      if (o.userData.isFloor || o.userData.isBackdrop) continue;
      if (!o.visible) {
        out.push({id: o.userData.def.id, type: o.userData.type, visible: false});
        continue;
      }
      // only what is visible counts: letters that have not arrived yet, or a faded-out part, are not "on screen"
      box.makeEmpty();
      o.traverseVisible((m) => {
        if (m.isInstancedMesh) {
          m.computeBoundingBox();
          box.union(part.copy(m.boundingBox).applyMatrix4(m.matrixWorld));
        } else if (m.geometry) {
          if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
          if (m.geometry.boundingBox && !m.geometry.boundingBox.isEmpty()) box.union(part.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld));
        }
      });
      if (box.isEmpty()) {
        out.push({id: o.userData.def.id, type: o.userData.type, visible: false});
        continue;
      }
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, behind = 0, bad = false;
      for (let i = 0; i < 8; i++) {
        corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(camera);
        if (!Number.isFinite(corner.x + corner.y + corner.z)) bad = true;
        if (corner.z > 1) behind++;
        x0 = Math.min(x0, corner.x); x1 = Math.max(x1, corner.x); y0 = Math.min(y0, corner.y); y1 = Math.max(y1, corner.y);
      }
      const r = {x: (x0 + 1) / 2, y: (1 - y1) / 2, w: (x1 - x0) / 2, h: (y1 - y0) / 2};
      const inView = !bad && behind < 8 && r.x < 1 && r.y < 1 && r.x + r.w > 0 && r.y + r.h > 0;
      out.push({id: o.userData.def.id, type: o.userData.type, visible: true, nan: bad, inView, rect: r, shield: !!o.userData.def.allowOverFace});
    }
    return out;
  }
  function labelSizes() {
    const out = [];
    const h = size.height;
    scene.traverse((o) => {
      if (!o.userData.isLabel || !o.visible || o.userData.decor) return;
      const d = camera.position.distanceTo(o.getWorldPosition(corner));
      const s = o.getWorldScale(new THREE.Vector3()).y;
      const px = ((o.userData.labelWorldHeight * s) / (2 * Math.tan((camera.fov * Math.PI) / 360) * d)) * h;
      out.push({text: o.userData.text.slice(0, 30), px: Math.round(px)});
    });
    return out;
  }

  function dispose() {
    if (physics && physics.dispose) physics.dispose();
    if (post) post.dispose();
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) {
        for (const k in m) if (m[k] && m[k].isTexture) m[k].dispose();
        m.dispose();
      }
      if (o.isInstancedMesh) o.dispose();
      if (o.isLight && o.shadow && o.shadow.map) o.shadow.map.dispose();
    });
    for (const d of ctx.disposables) d && d.dispose && d.dispose();
    if (scene.environment) scene.environment.dispose();
    if (scene.background && scene.background.isTexture) scene.background.dispose();
    for (const k of ['LTC_FLOAT_1', 'LTC_FLOAT_2', 'LTC_HALF_1', 'LTC_HALF_2']) if (THREE.UniformsLib[k] && THREE.UniformsLib[k].dispose) THREE.UniformsLib[k].dispose();
    renderer.renderLists.dispose();
    const left = {geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures};
    renderer.dispose();
    renderer.forceContextLoss();
    LIVE.contexts--;
    LIVE.disposed++;
    return left;
  }

  return {
    spec, THREE, renderer, scene, camera, canvas, ctx, size,
    duration: spec.duration, fps: spec.fps,
    render, resize, stats, screenBoxes, labelSizes, dispose, setOccluder,
    get hovered() {
      return hovered ? hovered.userData.def.id : null;
    },
    get time() {
      return lastT;
    },
    input: live,
    setInput(patch) {
      Object.assign(live, patch);
    },
    warnings,
  };
}
