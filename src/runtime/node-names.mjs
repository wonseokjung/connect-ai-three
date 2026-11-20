// Node side: the same registry, without the font data (JSON imports) and without touching the DOM.
import './index.js';
import '../plugins/text3d.js';
import '../plugins/gltf.js';
import '../plugins/svg.js';
import '../plugins/jsm-objects.js';
import '../plugins/jsm-geometries.js';
import '../plugins/post-extra.js';
import '../plugins/hdri.js';
import '../plugins/physics.js';
export {names, REG, LOOKS, MOTIONS, CAMERA_MOTIONS, LIGHTS, LIGHT_MOTIONS, ENVS, INTERACT, validateSpec, normalizeSpec, specNeeds, BRAND} from './index.js';
