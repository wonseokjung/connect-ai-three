# Assets that ship with connect-ai-three

| File | What | Source | Licence |
|---|---|---|---|
| `assets/studio_small_08_1k.hdr` | studio HDRI, 1k | Poly Haven, "Studio Small 08" by Sergej Majboroda, https://polyhaven.com/a/studio_small_08 | CC0 1.0 (public domain, no credit needed) |
| `assets/astronaut.glb` | astronaut model, 6,381 polygons | NASA 3D Resources, https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models/Astronaut (re-exported without Draco) | NASA media, not copyrighted (public domain). NASA does not endorse this project. |
| `assets/mark.svg` | the open-ring mark used in the SVG example | CONNECT AI LAB, own work | MIT |
| `assets/sample.jpg` | a frame of our own logo film, used by the image example | CONNECT AI LAB, own render | MIT |
| The eleven studio props (`wordmark`, `monogram`, `building`, `cinema-camera`, `microphone`, `workstation`, `display`, `laptop`, `softbox`, `clapper`, `book`) | built in code from basic shapes: no model files | CONNECT AI LAB, own work | MIT |
| `src/fonts/*.typeface.json` | six small typefaces for 3D letters (glyph subsets) | derived from Pretendard (Kil Hyung-jin) and Cormorant Garamond (The Cormorant Project Authors), published under other names | SIL Open Font License 1.1 (`fonts-OFL.txt`): stays OFL, bundled with this MIT kit as the licence allows |

## scene.json example and pack files (Poly Haven, CC0)

The three model examples in `examples/scene-json/` carry the files they use. `packs/pro/` holds the same files (`pastel-gallery` = `bust`,
`toy-showroom` = `showroom`, `sunset-flythrough` = `flythrough`). Models: the 1K textures packed into one `.glb` by us.
HDRIs: the 1k file. Each HDRI also has a `.meta.json` next to it with its source.

| File | What | Source | Licence |
|---|---|---|---|
| `examples/scene-json/bust/assets/bust.glb` | Marble Bust 01, by Rico Cilliers | https://polyhaven.com/a/marble_bust_01 | CC0 1.0 |
| `examples/scene-json/bust/assets/colorful.hdr` | Colorful Studio HDRI, by Sergej Majboroda | https://polyhaven.com/a/colorful_studio | CC0 1.0 |
| `examples/scene-json/showroom/assets/product.glb` | Vintage Video Camera, by James Ray Cock and Jenelle van Heerden | https://polyhaven.com/a/vintage_video_camera | CC0 1.0 |
| `examples/scene-json/showroom/assets/pink.hdr` | Pink Sunrise HDRI, by Greg Zaal and Rico Cilliers | https://polyhaven.com/a/pink_sunrise | CC0 1.0 |
| `examples/scene-json/flythrough/assets/boombox.glb` | Boombox, by Thomas Paul Mouilleron | https://polyhaven.com/a/boombox | CC0 1.0 |
| `examples/scene-json/flythrough/assets/watch.glb` | Pocket Watch, by PierreB3D | https://polyhaven.com/a/pocket_watch | CC0 1.0 |
| `examples/scene-json/flythrough/assets/chess.glb` | Chess Set, by Riley Queen | https://polyhaven.com/a/chess_set | CC0 1.0 |
| `examples/scene-json/flythrough/assets/sunset.hdr` | Belfast Sunset (Pure Sky) HDRI, by Greg Zaal, Dimitrios Savva and Jarod Guest | https://polyhaven.com/a/belfast_sunset_puresky | CC0 1.0 |
| `examples/*/preview.jpg`, `examples/*/preview.mp4`, `examples/scene-json/*/preview.*` | recordings of each example made by us (kept in the repository, left out of the npm package) | CONNECT AI LAB, own work | MIT |

## The 13 example pages

| Files | What | Source | Licence |
|---|---|---|---|
| `examples/01-miniature-world/assets/*.gltf`, `*.bin`, `hexagons_medieval.png` | hex tiles, buildings, trees, clouds | KayKit Medieval Hexagon Pack 1.0 by Kay Lousberg, https://kaylousberg.com/game-assets/medieval-hexagon-pack-free | CC0 1.0 (`KAYKIT-LICENSE.txt` in the folder) |
| `examples/02-glass-materials/assets/toy-car.glb` | ToyCar (clearcoat, sheen, transmission) by Guido Odendahl and Eric Chadwick | Khronos glTF Sample Assets, https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/ToyCar | CC0 1.0 |
| `examples/02-glass-materials/assets/colorful_studio_1k.hdr` | Colorful Studio HDRI by Sergej Majboroda | https://polyhaven.com/a/colorful_studio | CC0 1.0 |
| `examples/03-neon-text/assets/brick_*_1k.jpg` | Brick Wall 006 by Jan Burghardt, made smaller | https://polyhaven.com/a/brick_wall_006 | CC0 1.0 |
| `examples/03-neon-text/assets/*.typeface.json`, `examples/06-physics/assets/bold.typeface.json` | copies of the kit's own typeface subsets | Pretendard, Cormorant Garamond (see above) | SIL OFL 1.1 (`LICENSE-fonts-OFL.txt` in the folder) |
| `examples/07-teardown/assets/fonts/*.woff2` | Inter, JetBrains Mono | https://github.com/rsms/inter, https://github.com/JetBrains/JetBrainsMono | SIL OFL 1.1 (licence files in the folder) |
| `examples/08-scroll-site/assets/boombox.glb` | BoomBox by Microsoft, textures resized to 1024 px | Khronos glTF Sample Assets, https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/BoomBox | CC0 1.0 |
| `examples/09-many-styles/assets/robot.glb` | RobotExpressive by Tomás Laulhé (Quaternius), morph targets by Don McCurdy | three.js repository, examples/models/gltf/RobotExpressive | CC0 1.0 (`robot-README.md` in the folder) |
| `examples/10-flight-game/assets/jet.glb` | Spaceship by Quaternius | https://poly.pizza/m/DbGajMHrvp | CC0 1.0 |
| `examples/10-flight-game/assets/rock_*.glb` | rocks from the Nature Kit by Kenney | https://kenney.nl/assets/nature-kit | CC0 1.0 (`KENNEY-LICENSE.txt` in the folder) |
| `examples/11-gaussian-splat/assets/gothic_statue.*` | Gothic Statue photoscan, texture resized to 1k | https://polyhaven.com/a/gothic_statue | CC0 1.0 |
| `examples/11-gaussian-splat/assets/mossy_rock_diff_512.jpg` | Mossy Rock colour map, made smaller | https://polyhaven.com/a/mossy_rock | CC0 1.0 |
| `examples/12-xr/assets/*.glb`, `Textures/colormap.png` | coaster cars, station, trees, flowers, food and drink stalls | Kenney Coaster Kit, https://kenney.nl/assets/coaster-kit | CC0 1.0 (`KENNEY-LICENSE.txt` in the folder) |
| `examples/04-shader-worlds`, `examples/05-particles` | no asset files: everything is made by shaders in code | | |

No CC BY (credit-required) assets are used anywhere in the kit or its examples.
