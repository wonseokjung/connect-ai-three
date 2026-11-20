// Adapter: three examples/jsm TTFLoader (MIT, with opentype.js, MIT). 3D text in your own font file:
// {"type": "text3d", "text": "안녕하세요", "fontFile": "assets/MyFont.ttf"}. This is how Korean, Japanese and other
// scripts get extruded: the built-in Droid Sans data only has Latin letters.
import {TTFLoader} from 'three/examples/jsm/loaders/TTFLoader.js';
import {registerPlugin} from '../runtime/registry.js';

const cache = new Map();
registerPlugin({
  name: 'ttf',
  // .otf files (PostScript outlines) wind their shapes the other way round from .ttf: without `reversed` the letters
  // come out inside-out (only the holes filled). `reversed` in the spec overrides the guess.
  async load(url, reversed) {
    const rev = reversed ?? /\.otf(\?|$)|^data:font\/otf/i.test(url);
    const key = url + '|' + rev;
    if (!cache.has(key)) {
      const loader = new TTFLoader();
      loader.reversed = rev;
      cache.set(key, loader.loadAsync(url));
    }
    return cache.get(key);
  },
});
