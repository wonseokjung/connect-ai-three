# 19 A 90 second dragon film, all code

![A 90 second dragon film, all code](preview.jpg)

A red dragon rises from a turquoise lake, climbs a cliff monastery among stone pillars and fights a golden rival with fire and lightning, then rain, a rainbow and sky lanterns. It renders live in the browser: every mesh, texture, shader, particle and note of the music is made by code when the page loads.

[preview.mp4](preview.mp4) · [preview-9x16.mp4](preview-9x16.mp4)

## Say this to your AI

> Make a 90 second film that plays live in the browser with no asset files at all: two dragons fighting with fire and lightning around a cliff monastery among stone pillars, with its own music made by code, then rain, a rainbow and sky lanterns at dusk.

## 한국어로는 이렇게 말해요

> 에셋 파일 하나 없이 브라우저에서 바로 재생되는 90초 영화를 만들어 줘. 돌기둥 사이 절벽 사원에서 용 두 마리가 불과 번개로 싸우고, 음악도 코드로 만들고, 끝에는 해 질 녘에 비, 무지개, 하늘 등불이 나오게 해 줘.

붉은 용이 청록색 호수에서 솟아올라 돌기둥 사이 절벽 사원을 타고 오르고, 금빛 라이벌과 불과 번개로 싸워요. 끝에는 비, 무지개, 하늘에 뜬 등불이 나와요. 브라우저에서 바로 그려져요. 모델, 텍스처, 셰이더, 파티클, 음악 한 음까지 페이지가 열릴 때 코드로 만들어져요.

## Run it

```bash
npx github:wonseokjung/connect-ai-three example dragon-film
```

Make it a video (MP4 H.264, BT.709, frame-exact, 1920x1080; add `--9x16` for a vertical one, `--4k` for 3840x2160):

```bash
npx github:wonseokjung/connect-ai-three example dragon-film --video dragon-film.mp4
```

Your own copy to change (three.js then comes from a pinned CDN, so any static server works):

```bash
npx github:wonseokjung/connect-ai-three example dragon-film --copy my-dragon-film
```

## Where it comes from

- [Dragon of a Thousand Peaks by 0xCodez](https://github.com/0xCodez/thousand-peaks) (MIT): the whole film: the fourteen src/NN_name.js modules joined into film.js with the author's own wrapper, src/shell.html as index.html, licence text in LICENSE-thousand-peaks.txt (the LICENSE file is MIT; GitHub shows NOASSERTION)
- [three.js](https://threejs.org) (MIT): loaded from the kit (0.187) through the import map; boot.js puts it on window.THREE instead of the vendored r180 bundle

The vendored three.js bundle, dist/, docs/ and tools/ are not copied. Click for sound: the music is synthesized in the page, there are no audio files.

The full credits are in [NOTICE.md](../../NOTICE.md).
