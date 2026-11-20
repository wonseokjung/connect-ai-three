// All built-in 3D typefaces at once (the video renderer loads this; a web page ships only the ones its spec names).
//   thin · light · sans · bold      a clean geometric sans in four weights (Latin + a few Korean brand words)
//   serif · serif-bold              a display serif for titles and wordmarks (Latin)
// The data are small subsets of open fonts under the SIL Open Font License 1.1: licenses/fonts-OFL.txt.
import './font-thin.js';
import './font-light.js';
import './font-sans.js';
import './font-bold.js';
import './font-serif.js';
import './font-serif-bold.js';
import {registerPlugin} from '../runtime/registry.js';
registerPlugin({name: 'fonts'});
