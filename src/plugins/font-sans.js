// Typeface data for text3d: "sans" (see src/fonts/ and licenses/fonts-OFL.txt).
import data from '../fonts/sans.typeface.json';
import {registerFont, registerPlugin} from '../runtime/registry.js';
registerFont('sans', data);
registerPlugin({name: 'font:sans'});
