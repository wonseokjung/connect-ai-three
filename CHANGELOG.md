# Changelog

## 0.4.0

Colour. Every sentence gets its own world; the spec stays compatible.

- **`new` picks a mood from your words.** A cafe gets a pastel room, kids and toys get a vivid toy world, a beach or
  a desert gets a sunset, a club gets neon, a story gets paper craft, and luxury or gold gets the black studio with
  gold. Say nothing about the room and it still picks one from the words, so two sentences rarely look the same.
  The report says which: `look: pale-studio · mood: pastel`.
- **The demo is new**: `toy-studio`, a cinema camera turning on a pink stage in a blue and yellow toy world.
- **`grade` takes `whites`** (below 1, for example 0.95): highlights roll off softly instead of clipping to flat white.
- **`gltf` takes `surface`**: `roughness`, `metalness`, `clearcoat`, `normalScale`, `envIntensity`, `brightness`, to
  calm a shiny scan or lift a dark one without editing the file.
- Every "next:" hint and the help now print the line that works without a published package:
  `npx github:wonseokjung/connect-ai-three ...`.
- 3D titles from `new` shrink with long text, so a long name stays in frame.
- Each mood brings its own props: a donut and a macaron for a cafe, a block and a cone for toys, paper cards and a
  paper tree for a story, a low sun and dunes for a sunset, lit letters and rings of light for neon.
- Fixed: `addLights` and `addPost` were applied twice when a spec was prepared twice (the page and the video both do
  it), so a scene got a second depth of field, a second grade and doubled lights. One of the hero scenes went from 172
  draw calls to 120.
- `packs/pro/`: three finished cinematic scenes (pastel gallery, toy showroom, sunset flythrough), kept apart from
  the package.

## 0.3.0

Premium product and sculpture shots; the spec stays compatible.

- **`contact`**: a soft dark pool under an object, so it sits on its pedestal or the floor instead of floating.
- **Floor and wall without a seam.** `floor` mirror takes `dimFar` (with `fadeFrom` / `fadeTo`, metres) so the far
  floor fades out; `backglow` takes `floorFade` (metres, default 3, 0 for the old look) so the wall glow stops above
  the floor line. Drafts from `new` keep the mirror floor dimmer (`dim` 0.9) and frame a camera prop whole.
- **`fade` with `until` / `back`**: fade in, then out again at `until`. Fades on one object multiply.
- **Korean 3D letters from a sentence.** `new` turns a quoted Korean line into a 3D `wordmark` when the built-in
  faces carry all its letters (more brand and business words were added to them); any other Korean stays a flat label.
- `new` keeps gold letters gold when "black" describes the room ("gold title on a black stage").
- `new` no longer adds a cinema camera when "camera" only means the camera move ("천천히 도는 카메라", "slow orbit
  camera"); "my camera", "tripod", "삼각대" still bring the prop.
- `on-video --face` now also guards a folder that already has a scene.json (drafted with `new` or by an agent): before, the face box was only written into a fresh spec, so a title across the face could pass the check.
- `wordmark` takes `subWeight`. `demo --no-open` (or `CI=1`) says "Open <path>" instead of "Opening it".
- 136 catalog items (was 135): a contact-shadow example.

## 0.2.0

The picture got better; the spec stays compatible.

- **Studio prop set.** Eleven objects built in code, no model files: `wordmark`, `monogram`, `building` (your sign
  on the roof), `cinema-camera`, `microphone`, `workstation`, `display`, `laptop`, `softbox`, `clapper`, `book`.
- **Six typefaces for 3D letters** (`thin`, `light`, `sans`, `bold`, `serif`, `serif-bold`) with kerning, replacing
  the single default face. A page ships only the faces its scene names. The sans faces carry the Korean letters of
  a few lines; any other text takes `fontFile` as before.
- **3D behind you.** `on-video --matte <folder>` draws every object behind the person in your footage (a person
  matte, one picture per frame). `keepOut` boxes marked `"front": true` guard things in front of you, like a mic
  arm. `make --alpha` writes the overlay with the person already cut out.
- **Night city** redrawn: building silhouettes in layers of haze, few lit windows, roof beacons.
- **Colour.** Every catalog example stars a different object in a different scheme (gold, teal, deep blue, ivory,
  one red accent) across the eight looks. 135 items (was 124).
- **Examples.** A new logo film, an interactive studio hero, an explainer with three stations, a Korean title that
  needs no font file, and five cuts of 3D behind a speaker.
- Smaller things: `"reflect": false` keeps an object out of the mirror floor; `torus` takes `"arc"`; a line of 3D
  text is one draw call; the parts of a prop that share a material are merged; the web player lowers its pixel
  ratio by itself when a device cannot keep 30 fps; small print on props no longer counts as "text too small".
- `"short": {...}` in a spec holds what should differ in the 9:16 version (`--short`): a top-level field, or single
  objects by id. `still` can write `.png`. `CONNECT_AI_THREE_NO_CACHE=1` rebuilds the render bundle from scratch.

## 0.1.0

First version: one scene spec, a web page and a video from it, a self-check, a 124-item catalog.
