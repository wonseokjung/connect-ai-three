// Adapter: three examples/jsm RGBELoader (MIT). An .hdr photo lights the scene (a CC0 Poly Haven studio ships in assets/).
import {RGBELoader} from 'three/examples/jsm/loaders/RGBELoader.js';
import {registerPlugin} from '../runtime/registry.js';
registerPlugin({name: 'hdri', load: (url) => new RGBELoader().loadAsync(url)});
