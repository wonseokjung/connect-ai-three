# Changelog

## 0.6.0

The AI Web 3D Agent. connect-ai-three is now called the AI Web 3D Agent (AI Web 3D 에이전트), and every request ends
in a video. It starts from the best work the community has made, not only from the official three.js examples.

- **A community library**, `catalog/community.json`: 74 viral three.js works from X, Threads and public viral lists
  (68 works in 9 categories + 6 agent skills), each with its viral post and numbers as recorded on 2026-11-28, the
  repository, the licence read from the licence TEXT with `gh api` (not only the GitHub label: three of them say
  NOASSERTION and are MIT), what its assets are, the sentence a user would say, and how good it looks as video.
  `library` lists it; both READMEs carry the table (`node tools/make-library-table.mjs`).
- **12 community examples** (`examples/13` to `24`), adapted under their own MIT or CC0 licence with the licence text
  next to the code: caustic water (ScottieFox), a spectral ocean (squall01337), attractor particles (danlex), a talking
  face of light (ptakaya, CC0), a tower defence an AI plays by itself (kevintngo), a hex island that builds itself
  (felixturner, KayKit CC0), a 90 s dragon film with zero assets (0xCodez), a photoreal room at dawn from code
  (Leonxlnx), the Kage landscape hero (MengTo's ThreeUI), a 3D cinema seat preview (Codrops), a red clay car chase
  (noclipepe) and a self-assembling building (lhlGitHub). Left out and replaced: CC BY music and film (Room at Dawn,
  Charge in the cinema), GSAP, howler and unverified sounds and textures, fonts without a licence, remote media.
- **The prompt lane: 10 shared prompts** (`kind: "prompt"` in the library, P1 to P10), read read-only with Ego Lite
  from the viral posts and the authors' replies: each quoted short with the post link, handle, date and numbers, no code
  shipped. Three of them are built from scratch as our own examples (`examples/25` to `27`): a solar system (cb_doge),
  a mechanical butterfly (thtbee_) and a black hole that pulses to code-made music (chetaslua), credited as "inspired
  by". For the biggest closed works (Abeto Messenger, Hop.Earth, the anatomy app, Kage, Crimson Loong) no shared prompt
  text was found, so they are not in the prompt list.
- **Video first.** `example <name> --video out.mp4 [--9x16] [--4k] [--seconds N] [--orbit deg]` and `film <folder>`
  film any three.js page frame by frame: the page's clock (`performance.now`, `Date.now`, `requestAnimationFrame`,
  timers) is frozen after warm-up and stepped exactly 1/fps per frame, so nothing is dropped or doubled. Output is
  H.264, yuv420p, limited range, BT.709 (also tagged in the stream), 1920x1080, 1080x1920 or 3840x2160, with an optional
  camera path on the page's own camera and `window.__FILM__` for the page to hide its UI. The self-check counts
  frames, reads the colour tags and size, and looks for black or frozen stretches and page errors.
  Every community example ships a 16:9 and a 9:16 preview made this way (`tools/capture-example.mjs`).
- **The scout.** `find "<sentence>"` ranks our examples, the library, shared prompts and fresh GitHub finds (GitHub-only
  mode, no browser: the queries that worked, licence text checks, asset counts, stop rules for no licence, GPL / AGPL,
  non-commercial, view-only and fan projects, a clean message at the search rate limit). `fetch <owner/repo>` copies only
  licence-cleared code into a new folder with the licence text and `SOURCES.md`, and runs nothing from the repository.
- **The skill** now works the same way on every prompt: rank (ours, library, fresh finds, shared prompts) → pick the
  best base → build → camera → film 16:9 and 9:16 → self-check → show, with credit. Browser mode (ELDO first, Ego Lite
  as fallback, its own task space, the user's own login, read only) and the prompt lane (write your own from a prompt
  an author shared, credit as "inspired by") are in `SKILL.md`. The three.js r186 reference stays.
- `smoke [name ...]` opens pages headless and reports errors; one headless Chrome at a time (a lock in the temp dir).
- The test suite checks the library schema, the README tables, credits and licence texts, no shipped audio, both
  previews, the scout's licence rules, GitHub-only mode, `fetch`, every example page in headless Chrome with zero
  console errors, and a frame-exact film in 16:9 and 9:16.

## 0.5.0

Real three.js. The kit now starts from real open source instead of only its own scene spec.

- **13 example pages in `examples/`**, one per lesson section: miniature world, glass and soap film, neon text,
  shader worlds, 260,000 GPU particles, physics, a V8 engine teardown, a scroll website, one scene in seven styles, a
  flight game, Gaussian splats and a VR roller coaster, plus an opening page that plays them all. Each is adapted from
  MIT code (the official three.js examples, elvarofficial/teardown, tsogjavklann/awwwards-3d, Spark) and uses only
  CC0 models and textures. Every folder has its sources, its licence texts, a preview and the sentence that made it.
- **`examples`** lists them; **`example <name>`** opens one in your browser; **`--copy <folder>`** writes your own copy
  that loads three.js 0.187 from a pinned CDN, so it runs on any static host.
- **The skill carries a three.js r186 reference** (CloudAI-X/threejs-skills, MIT) so agents write current three.js.
- **Video colour fixed.** Videos were tagged yuvj420p / full range / BT.601, which plays with shifted colours in some
  players and editors. Every video the kit makes is now yuv420p, limited range, BT.709, and so is every mp4 in the
  repository (re-encoded, colours kept within one level). A test renders a known colour and reads it back.
- The old scene.json examples moved to `examples/scene-json/`. The on-video example ships no footage.

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
- **Examples show their result.** Every folder in `examples/` has a `preview.jpg` and a 6 second `preview.mp4` made
  with the kit, and a README with the sentence behind it. Three new ones with CC0 models and HDRIs from Poly Haven:
  `bust`, `showroom`, `flythrough`. The README opens with a gallery of all nine.
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
