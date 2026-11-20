# 3D text in Korean (or any script)

The built-in 3D font (Droid Sans) only has Latin letters. For Korean, Japanese, Chinese, Arabic and so on, give the
text your own font file and the tool extrudes it the same way:

    {"type": "text3d", "text": "모두를 위한 AI 교육", "fontFile": "assets/YourFont.otf"}

1. Put a `.ttf` or `.otf` you are allowed to use in `assets/` (the kit does not ship one).
2. Change `fontFile` in `scene.json` to its name.
3. `npx connect-ai-three make examples/korean-title`

If the letters come out inside-out (only the holes are filled), add `"fontReversed": true` (or `false`): font files
wind their outlines in two different directions and the tool can only guess from the file type.

Flat text (`label`, `card`) needs no font file: it uses the system fonts and works in every language.
