// A building that assembles itself, as the opening of an architecture or real-estate page: brick courses, timber
// frame, brackets, layered eaves and roof tiles go up on one 0-1 timeline you can play, pause and scrub, then the
// camera can fly to the eaves or the stone lions.
//
// From Hailey's threejs-architecture-effects (MIT): the starter's App.tsx, rewritten as plain DOM code for
// connect-ai-three (no React, English labels). The building itself is the starter's, in heritage/.
import { createScene } from './scene.js';

// Filming (window.__FILM__, the kit's film clock): the build runs in 9 s and starts on the first filmed frame.
const DURATION = window.__FILM__ ? 9 : 12.4;
const STAGES = [['Foundation stones', 0.06], ['Posts and beams', 0.11], ['Brick walls, course by course', 0.28], ['Brackets and the first eaves', 0.412], ['Timber gallery', 0.606], ['Upper walls', 0.785], ['Lookout storey', 0.905], ['Roof tiles and ridges', 0.995], ['Complete', 1]];

const $ = (s) => document.querySelector(s);
const view = createScene($('.three-scene'));
let progress = 0, playing = true, started = performance.now();

const seek = (p) => {
  progress = Math.max(0, Math.min(1, p));
  started = performance.now() - progress * DURATION * 1000;
};
const setView = (v) => {
  view.setView(v);
  document.querySelectorAll('.view-selector button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
  if (v !== 'overview') { seek(1); playing = false; }
};

$('.replay').addEventListener('click', () => { setView('overview'); seek(0); playing = true; });
$('.play').addEventListener('click', () => { const again = progress === 1; seek(again ? 0 : progress); playing = again || !playing; });
$('.timeline input').addEventListener('input', (e) => seek(Number(e.target.value) / 1000));
document.querySelectorAll('.view-selector button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

const tick = (now) => {
  if (window.__FILM__ && !(window.__film && window.__film.now)) started = now; // hold at 0 until the film clock starts
  if (playing) {
    progress = Math.min(1, (now - started) / (DURATION * 1000));
    if (progress === 1) playing = false;
  } else started = now - progress * DURATION * 1000;
  view.setProgress(progress);
  const stage = STAGES.find(([, end]) => progress < end)?.[0] ?? 'Complete';
  $('.stage-label b').textContent = stage;
  $('.stage-label span').textContent = `${Math.round(progress * 100)}%`;
  $('.timeline span').style.width = `${progress * 100}%`;
  $('.timeline input').value = Math.round(progress * 1000);
  $('footer time').textContent = `${(progress * DURATION).toFixed(1)} / ${DURATION} S`;
  $('.play').textContent = playing ? 'II' : '▶';
  requestAnimationFrame(tick);
};
requestAnimationFrame(tick);
$('.scene-loading').remove();
window.EXAMPLE = { ready: true, renderer: view.renderer, scene: view.scene, camera: view.camera, controls: view.controls };
