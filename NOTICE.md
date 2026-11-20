# NOTICE

connect-ai-three is CONNECT AI LAB's code (MIT, see LICENSE). It does not re-implement three.js: it puts one scene
spec in front of the existing three.js ecosystem and adds a self-check on top. Licence texts are in `licenses/`.
"Used as it is" = imported from the installed npm package, not copied into this repository. "Idea" = no code copied.

## What each part stands on

| Part in this kit | Source | Licence | How |
|---|---|---|---|
| Renderer, geometries, materials, lights, shadows, tone mapping, InstancedMesh, AnimationMixer | three 0.170.0 (mrdoob/three.js) | MIT, `licenses/three-MIT.txt` | Used as it is |
| `rounded-box`, `card`, `bars` | three examples/jsm `RoundedBoxGeometry` | MIT | Used as it is |
| `floor` kind mirror | three examples/jsm `Reflector` | MIT | Used as it is, plus our dimming veil |
| `line`, globe arcs | three examples/jsm `Line2`, `LineGeometry`, `LineMaterial` | MIT | Used as they are |
| `text3d` | three examples/jsm `TextGeometry`, `FontLoader`; Droid Sans / Serif typeface data from `three/examples/fonts/droid` | MIT; fonts Apache-2.0 (`licenses/droid-fonts-NOTICE.txt`) | Used as they are; letter layout (tracking, split letters) is ours |
| `text3d` with `fontFile` (Korean and other scripts) | three examples/jsm `TTFLoader` with opentype.js 1.3.4 | MIT | Used as they are; no font file is shipped |
| `gltf` | three examples/jsm `GLTFLoader`, `meshopt_decoder`, `DRACOLoader` | MIT | Used as they are |
| Draco decoder files (`draco_wasm_wrapper.js`, `draco_decoder.wasm`), only when a model is Draco-compressed | Google Draco, as shipped inside the three npm package (`examples/jsm/libs/draco/gltf`) | Apache-2.0 | Copied from your installed three package into the project (or inlined into the one-file page) at build time; not stored in this repository |
| `svg` | three examples/jsm `SVGLoader` | MIT | Used as it is |
| `sky`, `blob` | three examples/jsm `Sky`, `MarchingCubes` | MIT | Used as they are |
| `teapot`, `parametric` | three examples/jsm `TeapotGeometry`, `ParametricGeometry`, `ParametricGeometries` | MIT | Used as they are |
| env `room`, env `hdri`, light `area` | three examples/jsm `RoomEnvironment`, `RGBELoader`, `RectAreaLightUniformsLib` | MIT | Used as they are |
| post `bloom`, `dof`, `ao`, `outline`, `pixel`, `halftone`, `smaa` and the composer | three examples/jsm `EffectComposer`, `RenderPass`, `ShaderPass`, `OutputPass`, `UnrealBloomPass`, `BokehPass`, `GTAOPass`, `OutlinePass`, `RenderPixelatedPass`, `HalftonePass`, `SMAAPass` | MIT | Used as they are, in a fixed order |
| Physics (`body`, `bodyEach`) | @dimforge/rapier3d-compat 0.21.0 (dimforge/rapier) | Apache-2.0, `licenses/rapier-Apache-2.0.txt` | Used as it is; the bake (simulate once, read by time) is ours |
| Fast picking on heavy models | three-mesh-bvh 0.9.18 (gkjohnson/three-mesh-bvh) | MIT, `licenses/three-mesh-bvh-MIT.txt` | Used as it is |
| `src/adapters/r3f.tsx`, `SceneR3F` | @react-three/fiber 9.3.0 (pmndrs/react-three-fiber) | MIT, `licenses/react-three-fiber-MIT.txt` | Used as it is; the adapter component is ours |
| Video render, `on-video`, sheet, probe | remotion, @remotion/renderer, @remotion/bundler, @remotion/cli, @remotion/three 4.0.529 | Remotion License (see below); @remotion/three MIT | Used as they are |
| Web page bundle | esbuild 0.28.1 (evanw/esbuild) | MIT, `licenses/esbuild-MIT.txt` | Used as it is |
| React | react, react-dom 19.1.0 | MIT | Used as they are |

## Ours (MIT)

The scene spec and its validator, the look presets (`connect-gold-night`, `connect-night-city` and the others), the
softbox reflection map, the night-city, grid-floor, waves, rim, gradient, back-glow and finishing shaders (vignette,
grain, chroma, grade), the canvas text labels and glass cards, globe, rings, bars, instancing layouts, every motion
and camera move, the pointer script, the web player, the self-check (probe + judge), the physics bake, the words-to-spec
draft, the CLI, the skill and all catalog specs. The GLSL noise in `src/runtime/util.js` is our own value noise; no
shader library code is included.

## Ideas, no code copied

| Idea | From | Licence there |
|---|---|---|
| "One input drives everything": render(t) is a pure function of time, so a web page and a video come from the same code; stills at every beat before calling it done | elvarofficial/teardown (and whaleyxbt/claude-motion under it) | MIT |
| A camera that flies between ideas placed in one 3D space instead of a slide show; frosted glass cards | Matt Penny, "Claude + Three.js" (video) | n/a |
| Every frame of a code film as f(time), captured by a headless browser | ChetasLua/crimson-loong | no licence: read only, nothing copied |

## Looked at, not included (and why)

pmndrs/postprocessing (Zlib: fine to use, we stay on three's own MIT passes to keep one licence family) ·
pmndrs/drei (MIT: works next to our R3F adapter, not a dependency) · pmndrs/react-three-rapier (MIT: we call Rapier
directly so physics can be baked) · protectwise/troika-three-text (MIT: needs a font file to ship; our labels use a
canvas and system fonts) · pmndrs/lamina (MIT, no release since 2022) · patriciogonzalezvivo/lygia (Prosperity /
Patron dual licence, not MIT: no code taken) · sparkjsdev/spark splats, google/model-viewer, donmccurdy/glTF-Transform,
theatre-js/theatre, shader-effects-inc/shaders (all permissive; planned as later adapters).

## Assets

See `licenses/assets.md`: one CC0 HDRI (Poly Haven), one NASA public-domain model, our own mark and sample frame.
No credit-required (CC BY) asset is used.

## Remotion

The video side runs on Remotion, which has its own licence: free for individuals and for companies of up to three
people, a company licence above that. Read https://github.com/remotion-dev/remotion/blob/main/LICENSE.md before
commercial use. The web page output does not contain Remotion.
