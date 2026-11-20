import serif from 'three/examples/fonts/droid/droid_serif_regular.typeface.json';
import {registerFont, registerPlugin} from '../runtime/registry.js';
registerFont('serif', serif);
registerPlugin({name: 'fonts-serif'});
