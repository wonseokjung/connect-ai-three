# Examples

Each folder is one finished scene: a single `scene.json`. Copy a folder, change the words, run `make`.

| Folder | What it is | Run |
|---|---|---|
| `logo-night-city` | The logo film: gold letters standing on a dark mirror, the mark above, a night city far behind and out of focus, one slow push-in. Also the scene behind `npx connect-ai-three`. | `npx connect-ai-three make examples/logo-night-city --short` |
| `interactive-hero` | A web hero: a small studio on a desk you can turn around. The camera leans to the pointer, things lift on hover and spin on click. The `pointerScript` in the file lets the video show the same interaction. | `npx connect-ai-three web examples/interactive-hero` |
| `explainer-fly` | Three stations in one 3D space (a microphone, a display, a laptop with a clapperboard) and a camera that flies between them. | `npx connect-ai-three make examples/explainer-fly` |
| `korean-title` | 3D text in Korean with the built-in sans face; any other text takes your own font file (`fontFile`). | `npx connect-ai-three make examples/korean-title` |
| `on-my-video` | Five cuts of 3D behind the speaker in a talking video (person matte), timed to the words. Bring your own clip: see the README inside. | `npx connect-ai-three on-video my-talk.mp4 --faces face.json --matte matte/` |

More starting points: every catalog item is a complete scene too (`npx connect-ai-three catalog`, `npx connect-ai-three use <id>`).
