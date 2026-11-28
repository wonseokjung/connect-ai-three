// connect-ai-three: the film's modules expect a global THREE (the author inlines a three.js r180 bundle). Here the
// kit's three.js 0.187 comes through the import map, is copied onto window.THREE, and then film.js runs as before.
import * as T from 'three';

window.THREE = { ...T };
const s = document.createElement('script');
s.src = './film.js';
s.onload = () => {
  // tell the kit's smoke test and preview capture once the first frame is drawn
  const wait = () => {
    const K = window.K;
    if (K && K.renderer && K.renderer.info.render.frame > 0) window.EXAMPLE = { ready: true, renderer: K.renderer, scene: K.scene, camera: K.camera };
    else requestAnimationFrame(wait);
  };
  wait();
};
document.body.appendChild(s);
