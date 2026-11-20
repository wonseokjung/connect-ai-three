// connect-ai-three runtime (browser). Core only: three core + the always-on parts. Adapters live in src/plugins/.
export {createStage, LIVE, TONES, scriptedInput} from './stage.js';
export {normalizeSpec, validateSpec, specNeeds, INTERACT, SPEC_VERSION} from './spec.js';
export {REG, registerObject, registerMaterial, registerPost, registerFont, registerPlugin} from './registry.js';
export {LOOKS, LOOK_NAMES, BRAND, DEFAULT_LOOK} from './look.js';
export {MOTIONS, MOTION_NAMES} from './motion.js';
export {CAMERA_MOTIONS, CAMERA_MOTION_NAMES, cameraPose} from './camera.js';
export {LIGHTS, LIGHT_NAMES, LIGHT_MOTIONS, ENVS} from './lights.js';
export {OBJECT_TYPES} from './objects.js';
export {MATERIAL_NAMES} from './materials.js';
export {POST_TYPES} from './post.js';
export {EASE_NAMES} from './util.js';
import {REG} from './registry.js';
import {LOOK_NAMES} from './look.js';
import {MOTION_NAMES} from './motion.js';
import {CAMERA_MOTION_NAMES} from './camera.js';
import {LIGHT_NAMES, ENVS} from './lights.js';
// every name a spec may use, from what is registered right now
export const names = () => ({
  objects: [...REG.objects.keys()],
  materials: [...REG.materials.keys()],
  post: [...REG.post.keys()],
  motions: MOTION_NAMES,
  cameraMotions: CAMERA_MOTION_NAMES,
  lights: LIGHT_NAMES,
  looks: LOOK_NAMES,
  envs: Object.keys(ENVS),
});
