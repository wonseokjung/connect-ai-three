# 3D on your own video

`scene.json` here is the scene from the catalog page: a wireframe shape that appears next to the speaker and turns into
solid gold when he says "3D modeling". The face is inside `keepOut`, so the self-check fails if anything
covers it.

Run it on your own clip (the kit does not ship anyone's footage):

    npx connect-ai-three on-video my-talk.mp4 my-talk-three --faces my-talk-video-motion/work/face.json

`face.json` is what `npx connect-ai-video-motion` (lesson 2) writes when it analyses the same video. No face file?
Give the box yourself: `--face 0.33,0.13,0.25,0.48` (x, y, width, height as fractions of the frame).
Then copy this `scene.json` over the one it made and run `npx connect-ai-three make my-talk-three --alpha`.
