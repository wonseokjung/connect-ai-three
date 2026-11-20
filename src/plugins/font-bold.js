// Typeface data for text3d: "bold" (see src/fonts/ and licenses/fonts-OFL.txt).
import data from '../fonts/bold.typeface.json';
import {registerFont, registerPlugin} from '../runtime/registry.js';
registerFont('bold', data);
registerPlugin({name: 'font:bold'});
