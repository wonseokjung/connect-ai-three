// The page script (kage.js) was written for a global THREE. Give it the kit's three.js as one, then load it.
import * as THREE_NS from 'three';
window.THREE = { ...THREE_NS };
const s = document.createElement('script');
s.src = './kage.js';
document.body.appendChild(s);
