// The game's scripts were written for a global THREE (a vendored three.min.js, r160). Give them the kit's three.js
// r187 as one, then load them in their original order.
import * as THREE_NS from 'three';
window.THREE = { ...THREE_NS };
const files = ['util', 'textures', 'world', 'veg', 'props', 'car', 'traffic', 'people', 'game', 'menu', 'main'];
for (const f of files) {
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `./js/${f}.js`;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`could not load js/${f}.js`));
    document.body.appendChild(s);
  });
}
