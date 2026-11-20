// Typeface data for text3d: "light" (see src/fonts/ and licenses/fonts-OFL.txt).
import data from '../fonts/light.typeface.json';
import {registerFont, registerPlugin} from '../runtime/registry.js';
registerFont('light', data);
registerPlugin({name: 'font:light'});
