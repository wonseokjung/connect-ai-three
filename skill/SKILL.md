---
name: connect-ai-three
description: Turn a spoken request into a three.js scene with connect-ai-three (CONNECT AI LAB). Use when the user asks for a 3D scene, 3D logo, 3D title, product turntable, interactive 3D hero for a web page, three.js animation, a 3D object on top of their own video, or says "three.js", "3D로", "입체로", "웹에서 도는 3D". One scene.json becomes an interactive web page and a frame-locked video, with a self-check.
---

# connect-ai-three

You write ONE file, `scene.json` (the scene spec). The tool turns it into:
- `out/web/index.html`: an interactive page (one file, opens by double-click)
- `out/video.mp4`: the same picture as video, frame for frame (`--alpha` for a transparent `.mov`, `--short` for 9:16)
- `out/sheet.jpg` + `out/report.md`: stills and the self-check

Never write raw three.js for this. Everything you may name is in `catalog.json` next to this file (124 items, each a
complete working spec with a one-line prompt). Read the items you need before writing.

## Steps

1. Make a folder for the scene. Put the user's files (model `.glb`, logo `.svg`, images, video) in `assets/`.
2. Write `scene.json`. Start from the closest catalog item: `npx connect-ai-three use <id> <folder>`.
3. Run `npx connect-ai-three make <folder>` (add `--short` and/or `--alpha` if asked).
4. Open `out/sheet.jpg` and LOOK at it. Read `out/report.md`. Fix every "FIX" line and re-run. Do not say it is
   done before the check says PASS and you have seen the stills.
5. Tell the user the two paths (page + video) in one line. Offer one next change.

Only the page: `npx connect-ai-three web <folder>`. Only the check: `npx connect-ai-three check <folder>`.
On their own video: `npx connect-ai-three on-video talk.mp4 <folder> --faces <face.json>` (face.json comes from
`connect-ai-video-motion`; or `--face x,y,w,h` as fractions of the frame).

## The spec

```json
{
  "name": "my-scene",
  "duration": 6,
  "size": {"width": 1920, "height": 1080},
  "look": "connect-night-city",
  "camera": {"position": [0, 1.2, 7], "target": [0, 1, 0], "fov": 32,
    "motion": [{"type": "orbit", "from": -20, "to": 14, "dur": 6}, {"type": "dolly", "from": 1.3, "to": 1, "dur": 6}]},
  "objects": [
    {"id": "floor", "type": "floor", "kind": "mirror"},
    {"id": "title", "type": "text3d", "text": "MY NAME", "size": 0.56, "split": true, "position": [0, 1, 0],
      "material": "gold", "motion": [{"type": "stagger", "at": 0.5, "each": 0.08}]}
  ],
  "addPost": [{"type": "dof"}],
  "interact": ["parallax", "orbit"]
}
```

- Units are metres-ish: the floor is y = 0, a hero object is about 1 to 2 units tall, the camera sits 5 to 7 back.
- `look` sets background, lights, reflections and finish in one word. Leave `lights`, `env`, `post` out unless the
  user asks; add to a look with `addLights` and `addPost`.
- Every motion has `at` (start, seconds) and usually `dur`. Motions stack in order.
- Angles are degrees. Colours are hex strings.
- `id` every object: the check talks about objects by id.
- Text on a card goes in `kicker`, `title`, `text`. The word `body` means physics (`"body": "dynamic"`).

Names (details and examples for each are in `catalog.json`):
- looks: connect-gold-night (default), connect-night-city, studio-black, midnight-glass, pale-studio, blueprint,
  daylight, on-video
- objects: text3d, label, card, image, gltf, svg, floor, rounded-box, box, sphere, torus, knot, cylinder, cone,
  capsule, plane, disc, ring, gem, rings, ribbon, line, instances, globe, bars, city, backglow, terrain, waves, sky,
  blob, teapot, parametric, group
- materials: gold, gold-brushed, chrome, steel, black, ivory, clay, plastic, paint, glass, frosted, smoked, velvet,
  iridescent, glow, wire, flat, toon, rim, gradient, shadow
- motions: turntable, spin, float, sway, pop, fade, rise, drop, slide, move, scale, rotate, pulse, orbit, path,
  explode, stagger, draw, count, typewriter, billboard
- camera: orbit, dolly, crane, truck, zoom, shots, path, handheld, dolly-zoom
- post: bloom, vignette, grain, chroma, grade, dof, ao, outline, pixel, halftone, smaa
- interact (web page): orbit, parallax, hover, zoom, click, scroll
- physics: `"body": "dynamic" | "fixed"` on an object, or `"bodyEach": true` on a group / split text

## Rules that keep it good

- One hero. One idea per scene. Empty space is fine; clutter is not.
- Motion is slow and has weight: 4 to 8 seconds, ease in and out, never constant shaking.
- Text in 3D stays short (a name, a title). Sentences go in the page (`page.title`, `page.sub`) or in labels.
- Show the user's real things: their name, their logo file, their numbers, their model. Never invent numbers,
  results or claims. If a `bars` chart has no numbers from the user, ask for them.
- On video: nothing may cover the face. Put the face box in `keepOut`; place the object beside the head, about one
  head-width away. The check fails if any object crosses the box.
- Phone: the page must work at 390 px wide. If the report says something is cut off on a phone, pull the camera
  back (`camera.fitPower`) or stack things vertically.
- Assets: only files the user gave, or CC0 / public-domain ones. `kit:astronaut.glb` and
  `kit:studio_small_08_1k.hdr` ship with the tool.
- Models: `.glb` / `.gltf`, also Draco- or Meshopt-compressed. Put them in `assets/`.
- 3D text (`text3d`) is Latin only unless you add `"fontFile": "assets/<their font>.ttf|.otf"`. For Korean, Japanese
  and other scripts: ask the user for a font file they may use, or use a `label` (flat text works in every language).
  Inside-out letters: set `"fontReversed": true` or `false`.

## What the check looks at

Blank frames · objects never in view · NaN positions · the face keep-out box · the same picture twice (video and
page must match) · WebGL leaks after dispose · draw calls · triangles · texture size · frame time · phone framing ·
text too small to read. "FIX" lines must be fixed. "look" lines are advice: read them, decide, say what you decided.

## When the user already has React Three Fiber

Use the adapter instead of the CLI: `import {ConnectScene} from 'connect-ai-three/src/adapters/r3f'` and put
`<ConnectScene spec={spec} time={t} />` inside their `<Canvas>` (or Remotion `<ThreeCanvas>`).
