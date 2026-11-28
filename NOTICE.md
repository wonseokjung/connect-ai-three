# NOTICE

connect-ai-three is CONNECT AI LAB's code (MIT, see LICENSE). It has these parts:

- `examples/00` to `12`: 13 three.js pages adapted from MIT open source, above all the official three.js examples
  (mrdoob/three.js).
- `examples/13` and up: viral community works from X, adapted under their own MIT or CC0 licence (below), and pages
  we wrote ourselves from prompts their authors shared publicly ("inspired by", no code copied).
- `catalog/community.json`: the community library. It holds links, numbers and licence findings only; no code of
  those works ships in this repository unless it is one of the examples above. Each folder says where every piece came from in its `example.json` and `README.md`, and keeps
  the licence texts it needs next to the code, so a copy made with `example <name> --copy` carries them too.
- the scene.json lane (`src/`, `lib/`, `catalog/`): one scene spec in front of the existing three.js ecosystem, made
  into a web page and a frame-locked video, with a self-check on top.

Licence texts are in `licenses/`. "Used as it is" = imported from the installed npm package, not copied into this
repository. "Adapted" = code copied and changed. "Idea" = no code copied.

## The examples

| Example | Code it is adapted from | Licence | Models, textures, fonts (all CC0 or OFL) |
|---|---|---|---|
| 00 opening | our own page that plays the other examples | MIT (ours) | none of its own |
| 01 miniature-world | three.js `webgl_animation_keyframes`, `HorizontalTiltShiftShader`, `VerticalTiltShiftShader` | MIT | KayKit Medieval Hexagon Pack 1.0 by Kay Lousberg, CC0 (`licenses/kaykit-CC0.txt`) |
| 02 glass-materials | three.js `webgl_loader_gltf_dispersion`, `webgl_materials_physical_transmission`, `webgl_loader_gltf_iridescence` | MIT | Khronos ToyCar, CC0; Poly Haven Colorful Studio HDRI, CC0 |
| 03 neon-text | three.js `webgl_postprocessing_unreal_bloom`, `webgl_geometry_text`, `webgl_postprocessing_dof`, `Reflector` | MIT | Poly Haven Brick Wall 006, CC0; our Pretendard / Cormorant Garamond subsets, OFL |
| 04 shader-worlds | three.js `webgpu_tsl_galaxy`, `webgpu_tsl_raging_sea`, `webgpu_tsl_earth`, `webgpu_tsl_vfx_flames` | MIT | none: the Earth photos (CC BY) and the flame noise images are replaced by noise in code |
| 05 particles | three.js `webgpu_tsl_compute_attractors_particles`, `webgpu_postprocessing_bloom` | MIT | none |
| 06 physics | three.js `physics_rapier_instancing`, `TextGeometry`, `RoundedBoxGeometry`, `RoomEnvironment`; Rapier 0.21.0 | MIT; Rapier Apache-2.0 (`licenses/rapier-Apache-2.0.txt`) | our Pretendard Bold subset, OFL |
| 07 teardown | elvarofficial/teardown, the V8 four-stroke live page (`sims/kit`, `sims/v8-shared`, `sims/v8-live`) | MIT (`licenses/teardown-MIT.txt`) | Inter and JetBrains Mono, OFL (`licenses/fonts-Inter-OFL.txt`, `licenses/fonts-JetBrainsMono-OFL.txt`) |
| 08 scroll-site | tsogjavklann/awwwards-3d, coin-scroll template (GSAP and Lenis left out) | MIT (`licenses/awwwards-3d-MIT.txt`) | Khronos BoomBox by Microsoft, CC0 |
| 09 many-styles | three.js `webgl_animation_skinning_morph`, `webgl_materials_toon` + `OutlineEffect`, `webgl_postprocessing_pixel`, `HalftonePass`, `UnrealBloomPass`; the stained glass, LiDAR and hologram shaders are ours | MIT | RobotExpressive by Tomás Laulhé (Quaternius), morphs by Don McCurdy, CC0 |
| 10 flight-game | three.js `webgl_shaders_ocean` (`Water`, `Sky`) | MIT | Spaceship by Quaternius, CC0; Kenney Nature Kit rocks, CC0 (`licenses/kenney-CC0.txt`) |
| 11 gaussian-splat | Spark 2.4.0 by World Labs (`spark.module.min.js` shipped in the folder), its procedural-splats and splat-reveal-effects examples | MIT (`licenses/spark-MIT.txt`) | Poly Haven Gothic Statue and Mossy Rock, CC0 |
| 12 xr | three.js `webxr_vr_rollercoaster` (`RollerCoaster` geometries, `VRButton`), `webgl_shaders_sky` | MIT | Kenney Coaster Kit, CC0 (`licenses/kenney-CC0.txt`) |

The pages load three.js 0.187.0 (npm alias `three-latest`, MIT, `licenses/three-MIT.txt`) from the kit's own
`node_modules`; a copy loads the same version from jsDelivr.

Left out on purpose, because they need credit or are not open: Littlest Tokyo (CC BY 4.0, used by the official
keyframes example), DispersionTest and IridescenceLamp (CC BY 4.0), the Earth texture photos of the TSL Earth example
(CC BY 4.0), GSAP (its own licence). Spark's own demo captures are not used.

## The community examples (v0.6.0)

Each folder keeps the source's licence text (`LICENSE-<repo>.txt`) and three.js's (`LICENSE-three.txt`) next to the
code, and its `example.json` names the author, the repository, the licence and the viral post (numbers as they were
on 2026-11-28). The licence was read from the licence text in the repository. three.js 0.187.0 (MIT) comes from the
kit in place of any copy the original vendored.

- **13-caustic-water**: CAUSTIC//LITE by Scottie (ScottieFox), https://github.com/ScottieFox/caustic-volume, MIT,
  Copyright (c) 2026 Scottie. `lite/index.html` is used as written (random sea, GPU ripple simulation, rubber duck,
  caustics, CPU fallback, panel). Changed: the import map, a product line, a fixed resolution while filming.
- **14-deep-ocean**: ABYSSAL, a spectral FFT ocean by Sacha (squall01337), https://github.com/squall01337/abyssal-ocean,
  MIT, Copyright (c) 2026 Sacha (@squall01337). `index.html` is used as written (JONSWAP spectrum, GPU FFT, foam, sky,
  island, buoys, underwater view, presets). Changed: the import map, the Golden hour preset at start, a resort line.
- **15-attractor-particles**: Attractor Morph from Particles by Alexandru DAN (danlex), https://github.com/danlex/particles,
  MIT, Copyright (c) 2026 Alexandru DAN. `attractor-morph.html` (RK4 seeding, GPU morph between Lorenz, Aizawa, Thomas
  and Halvorsen, bloom) plus the vignette style from `shared-ui.js`. Left out: `shared-ui.js` (share, embed, export,
  audio panel) and the gallery link. Changed: the morph clock follows real time, a larger start zoom, an event name.
- **16-ai-face**: Claude Face by ptakaya, an unofficial community project, https://github.com/ptakaya/claude-face,
  CC0 1.0. `phase1/index.html` and `phase1/main.js` (particle face, viseme mouth, eyes, blinks). `assets/head.glb` is
  the project's CC0 head (MakeHuman base body plus MPFB eyes, teeth and tongue, see `assets/ATTRIBUTION-head.md`)
  without its unused textures. Added: a silent letter-to-viseme talk mode with captions in place of the HeadTTS voice.
- **17-tower-defense**: Cinderwatch by kevintngo, https://github.com/kevintngo/cinderwatch, MIT, Copyright (c) 2026
  kevintngo. The game's source files are joined unchanged the way its `tools/build.py` does it. No asset files: every
  model, texture and sound is generated in code. `media/` is not shipped.
- **18-hex-island**: Hex Map WFC by Felix Turner, https://github.com/felixturner/hex-map-wfc, MIT. Tiles and colour
  atlases: KayKit Medieval Hexagon Pack by Kay Lousberg, CC0, as packed in that repository. `venice_sunset_1k.hdr`:
  Poly Haven, CC0. Written for this kit: `src/lib/tween.js` (replaces GSAP), a silent `src/lib/Sounds.js` (replaces
  howler.js and its five sound files) and `src/lib/proceduralTextures.js` (replaces `caustic.jpg` and `cog.png`, whose
  origin is not stated).
- **19-dragon-film**: Dragon of a Thousand Peaks by 0xCodez, https://github.com/0xCodez/thousand-peaks, MIT (the
  LICENSE text; GitHub shows NOASSERTION), Copyright (c) 2026 Beyond Dev. Zero assets: meshes, textures and music are
  generated by code. `boot.js` (ours) hands the kit's three.js to the film as `window.THREE`.
- **20-room-at-dawn**: Room at Dawn by Leon Lin, https://github.com/Leonxlnx/room-at-dawn, MIT, Copyright (c) 2026
  Leon Lin. Everything visual is generated by its code. The baked lighting is the author's, re-packed to 8 bits by this
  kit (`bake/gi8.bin.gz`, `applyBake8` in `src/core/gi.js`). Not shipped: the recorded sound ("Meditation Impromptu
  02" by Kevin MacLeod, CC BY 4.0; "Rustling leaves" by Gravity Sound, CC BY 4.0; a public-domain dawn chorus mixed
  into the same file), so the example is silent.
- **21-landing-hero**: the Kage landing page in ThreeUI by Meng To, https://github.com/MengTo/threeui
  (`public/landing-pages/kage.html`), MIT, Copyright (c) 2026 Meng To. The scene images in `assets/foreground` and
  `assets/generated` are the repository's own files, MIT per its ASSET-LICENSES.md. Onest typeface: SIL Open Font
  License 1.1 (`assets/LICENSE-fonts-OFL.md`). Left out: the vendored three.js r149, the Wordmark and NotoJP fonts (no
  licence in the repository) and the threeui.com catalog media (not MIT). Changed for three.js r187: colour space
  names, the `vMapUv` varying, light units.
- **22-cinema-seat**: Cinema Seat Preview by Codrops, https://github.com/codrops/CinemaSeatPreview, MIT, Copyright (c)
  2009 - 2026 Codrops. Left out: the film on the screen (a cut of Blender Studio's Charge, CC BY 4.0) and its poster,
  GSAP, the vendored three.js r186 and Google Fonts. The film on the screen and its music (`js/codefilm.js`) and the
  tween engine (`js/tween.js`) are made for this kit.
- **23-police-chase**: Red Clay Chase by noclipepe, https://github.com/noclipepe/red-clay-chase, MIT, Copyright (c)
  2026 noclipepe. Zero asset files: every texture, model and sound is made by code. The vendored three.js r160 is
  replaced by the kit's; three.js r187 no longer calls `Material.onBuild`, so the example re-injects the car-shadow
  shader inputs through `onBeforeCompile` (marked `patchedOnBuild`).
- **24-self-building**: threejs-architecture-effects by Hailey (lhlGitHub),
  https://github.com/lhlGitHub/threejs-architecture-effects (`assets/starter`), MIT, Copyright (c) 2026 Hailey. The
  TypeScript and React starter is rewritten as plain JavaScript (types stripped with esbuild), procedural materials only.
  The skill's preview video and images are not shipped.

## Built from shared prompts (v0.6.0)

These three examples are written for this kit from scratch. The authors never published code for them, and none was
used: no code, models, textures or sound from the originals. Each is inspired by a prompt the author shared publicly
on X, and the code is MIT like the rest of the kit. The prompt and the post are in `catalog/community.json`.

- **25-solar-system**: inspired by cb_doge (https://x.com/cb_doge/status/2074920311896879359), prompt shared publicly.
- **26-mechanical-butterfly**: inspired by thtbee_ (https://x.com/thtbee_/status/2101304547876700627), prompt shared
  publicly.
- **27-black-hole-music**: inspired by chetaslua (https://x.com/chetaslua/status/2080534915494645997), prompt shared
  publicly. The music is made by Web Audio code in the page.

The other shared prompts in the library (P3 to P10) are quoted short with a link to the post, so the author keeps the
full text. Their code, where there is any, is not in this kit.


## The skill's three.js reference

`skill/references/threejs-r186/` is CloudAI-X/threejs-skills (r186), copied as it is: MIT, Copyright (c) 2026
CloudAI-X, `skill/references/threejs-r186/LICENSE` and `licenses/threejs-skills-MIT.txt`.

## The scene.json lane: what each part stands on


| Part in this kit | Source | Licence | How |
|---|---|---|---|
| Renderer, geometries, materials, lights, shadows, tone mapping, InstancedMesh, AnimationMixer | three 0.170.0 (mrdoob/three.js) | MIT, `licenses/three-MIT.txt` | Used as it is |
| `rounded-box`, `card`, `bars` | three examples/jsm `RoundedBoxGeometry` | MIT | Used as it is |
| `floor` kind mirror | three examples/jsm `Reflector` | MIT | Used as it is, plus our dimming veil |
| `line`, globe arcs | three examples/jsm `Line2`, `LineGeometry`, `LineMaterial` | MIT | Used as they are |
| `text3d` | three examples/jsm `TextGeometry`, `FontLoader`, `BufferGeometryUtils` | MIT | Used as they are; letter layout (tracking, kerning, split letters) is ours |
| The six built-in typefaces (`thin`, `light`, `sans`, `bold`, `serif`, `serif-bold`) | glyph subsets derived from Pretendard (Kil Hyung-jin) and Cormorant Garamond (The Cormorant Project Authors), stored as typeface data under other names ("CAL Sans", "CAL Serif") | SIL Open Font License 1.1, `licenses/fonts-OFL.txt` | Modified Versions (subset + format change), kept under the OFL and bundled with the kit as the OFL allows |
| `text3d` with `fontFile` (any other script or face) | three examples/jsm `TTFLoader` with opentype.js 1.3.4 | MIT | Used as they are; no font file is shipped |
| The studio props: `wordmark`, `monogram`, `building`, `cinema-camera`, `microphone`, `workstation`, `display`, `laptop`, `softbox`, `clapper`, `book` | three core shapes, `RoundedBoxGeometry`, `InstancedMesh`, `TextGeometry` | MIT | The objects are ours, built in code from those shapes; no model files |
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
softbox reflection map, the eleven studio props, the person-matte layer that draws 3D behind a speaker, the night-city, grid-floor, waves, rim, gradient, back-glow and finishing shaders (vignette,
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
Patron dual licence, not MIT: no code taken) · google/model-viewer, donmccurdy/glTF-Transform, theatre-js/theatre,
shader-effects-inc/shaders (all permissive; planned as later adapters). sparkjsdev/spark is now used by example 11.

## Assets

See `licenses/assets.md`: every model, texture, HDRI and font in the kit and in each example, with its source and
licence. They are CC0, public domain (one NASA model), SIL OFL (fonts) or our own. No credit-required (CC BY) asset is
used anywhere.

## Remotion

The video side runs on Remotion, which has its own licence: free for individuals and for companies of up to three
people, a company licence above that. Read https://github.com/remotion-dev/remotion/blob/main/LICENSE.md before
commercial use. The web page output does not contain Remotion.
