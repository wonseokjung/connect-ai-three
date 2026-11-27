# Changelog

## 0.3.0

Premium product and sculpture shots; the spec stays compatible.

- **`contact`**: a soft dark pool under an object, so it sits on its pedestal or the floor instead of floating.
- **Floor and wall without a seam.** `floor` mirror takes `dimFar` (with `fadeFrom` / `fadeTo`, metres) so the far
  floor fades out; `backglow` takes `floorFade` (metres) so the wall glow stops above the floor line.
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
