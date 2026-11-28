# 24 A building that builds itself

![A building that builds itself](preview.jpg)

An architecture page whose hero is a real 3D building going up: foundation stones, posts and beams, brick walls course by course, brackets, layered eaves and roof tiles, all on one timeline you can play, pause and scrub. Orbit it, or fly the camera to the eaves and the stone lions. Every material is procedural.

[preview.mp4](preview.mp4) · [preview-9x16.mp4](preview-9x16.mp4)

## Say this to your AI

> Make the opening of my architecture studio's page: a 3D building that assembles itself, foundations first, then walls brick by brick, then the roof, with a timeline I can scrub and buttons that fly the camera to the details.

## 한국어로는 이렇게 말해요

> 우리 건축 사무소 홈페이지 첫 화면을 만들어 줘. 3D 건물이 기초부터 벽돌 한 줄씩, 마지막에 지붕까지 스스로 지어지고, 타임라인을 끌어서 앞뒤로 볼 수 있고, 버튼을 누르면 카메라가 디테일 쪽으로 날아가게 해 줘.

건축 소개 페이지의 첫 화면에서 진짜 3D 건물이 올라가요. 주춧돌, 기둥과 보, 한 줄씩 쌓이는 벽돌, 공포, 겹처마, 기와까지 하나의 타임라인으로 재생하고 멈추고 앞뒤로 돌려 볼 수 있어요. 마우스로 돌려 보거나 처마랑 돌사자 쪽으로 카메라를 날릴 수 있고, 재질은 전부 코드로 만들어요.

## Run it

```bash
npx github:wonseokjung/connect-ai-three example self-building
```

Make it a video (MP4 H.264, BT.709, frame-exact, 1920x1080; add `--9x16` for a vertical one, `--4k` for 3840x2160):

```bash
npx github:wonseokjung/connect-ai-three example self-building --video self-building.mp4
```

Your own copy to change (three.js then comes from a pinned CDN, so any static server works):

```bash
npx github:wonseokjung/connect-ai-three example self-building --copy my-self-building
```

## Where it comes from

- [Hailey: threejs-architecture-effects (agent skill + starter)](https://github.com/lhlGitHub/threejs-architecture-effects) (MIT): the building, its procedural materials and the construction timeline (heritage/), the scene, lights and cameras (scene.js), the page layout and style (style.css)
- [three.js (OrbitControls, RoomEnvironment, BufferGeometryUtils)](https://threejs.org) (MIT): the kit's three.js r187

The starter is a Vite + React + TypeScript app. Here it is plain JavaScript with an import map: the types are stripped, the React components became scene.js and main.js, and the labels are in English. The skill's preview video and images are not shipped.

The full credits are in [NOTICE.md](../../NOTICE.md).
