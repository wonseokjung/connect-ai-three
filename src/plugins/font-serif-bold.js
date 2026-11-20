// Typeface data for text3d: "serif-bold" (see src/fonts/ and licenses/fonts-OFL.txt).
import data from '../fonts/serif-bold.typeface.json';
import {registerFont, registerPlugin} from '../runtime/registry.js';
registerFont('serif-bold', data);
registerPlugin({name: 'font:serif-bold'});
