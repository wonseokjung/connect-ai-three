// Typeface data for text3d: "thin" (see src/fonts/ and licenses/fonts-OFL.txt).
import data from '../fonts/thin.typeface.json';
import {registerFont, registerPlugin} from '../runtime/registry.js';
registerFont('thin', data);
registerPlugin({name: 'font:thin'});
