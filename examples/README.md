# Examples

Each folder is one finished scene: a single `scene.json`. Copy a folder, change the words, run `make`.

| Folder | What it is | Run |
|---|---|---|
| `logo-night-city` | Gold 3D logo over a night city: letters arrive one by one, a rim light sweeps, the city is out of focus. Also the scene behind `npx connect-ai-three`. | `npx connect-ai-three make examples/logo-night-city --short` |
| `interactive-hero` | A web hero: the camera leans to the pointer, objects lift on hover, spin on click, the scene turns when dragged. The `pointerScript` in the file lets the video show the same interaction. | `npx connect-ai-three web examples/interactive-hero` |
| `explainer-fly` | Three glass cards in one 3D space and a camera that flies between them. | `npx connect-ai-three make examples/explainer-fly` |
| `korean-title` | 3D text in Korean: the same letters-arrive scene with your own font file (`fontFile`). Bring a font: see the README inside. | `npx connect-ai-three make examples/korean-title` |
| `on-my-video` | A 3D object next to the speaker in a talking video, with a face keep-out box. Bring your own clip: see the README inside. | `npx connect-ai-three on-video my-talk.mp4 --face 0.33,0.13,0.25,0.48` |

More starting points: every catalog item is a complete scene too (`npx connect-ai-three catalog`, `npx connect-ai-three use <id>`).
