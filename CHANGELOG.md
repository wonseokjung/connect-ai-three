# Changelog

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
