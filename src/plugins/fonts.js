// Typeface data for text3d: Droid Sans / Serif from three's examples (Apache-2.0, see licenses/droid-fonts-NOTICE.txt).
import sansBold from 'three/examples/fonts/droid/droid_sans_bold.typeface.json';
import sans from 'three/examples/fonts/droid/droid_sans_regular.typeface.json';
import {registerFont, registerPlugin} from '../runtime/registry.js';
registerFont('sans-bold', sansBold);
registerFont('sans', sans);
registerPlugin({name: 'fonts'});
