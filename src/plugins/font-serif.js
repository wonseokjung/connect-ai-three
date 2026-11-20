// Typeface data for text3d: "serif" (see src/fonts/ and licenses/fonts-OFL.txt).
import data from '../fonts/serif.typeface.json';
import {registerFont, registerPlugin} from '../runtime/registry.js';
registerFont('serif', data);
registerPlugin({name: 'font:serif'});
