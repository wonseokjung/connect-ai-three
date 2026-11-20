// CONNECT AI LAB look presets. A look only fills in what the spec leaves out (background, lights, env, post, fog).
// Base = black x gold #D6892A with a thin ivory text colour; pictures may add 2-3 subject colours on top.
export const BRAND = {
  gold: '#D6892A',
  goldHi: '#F2B45A',
  ivory: '#EBE2D2',
  black: '#060709',
  night: '#0B1220',
  teal: '#2F8F9D',
  blue: '#1F3F7A',
  red: '#C8372D',
  ember: '#B8502A',
};

const film = (bloom = 0.24, grain = 0.045, vignette = 0.38) => [
  {type: 'bloom', strength: bloom, radius: 0.55, threshold: 0.9},
  {type: 'vignette', amount: vignette},
  {type: 'grain', amount: grain},
];

export const LOOKS = {
  // our default: dark room, soft key, gold rim from behind, cool counter-rim, light bloom + grain
  'connect-gold-night': {
    about: 'CONNECT AI LAB default: near-black room, warm key, gold rim light, light bloom and grain',
    background: {type: 'gradient', top: '#0d1017', bottom: '#030304'},
    env: {type: 'softbox', intensity: 2.1, warm: BRAND.gold},
    lights: [
      {type: 'key', color: '#fff0dc', intensity: 2.6, position: [-3.2, 4.2, 4.5]},
      {type: 'rim', color: BRAND.gold, intensity: 7, position: [3.6, 2.6, -4.2]},
      {type: 'rim', color: '#3f7391', intensity: 1.6, position: [-4.2, 1.4, -3.2]},
      {type: 'ambient', color: '#8fa0b8', intensity: 0.12},
    ],
    backdrop: {type: 'backglow'},
    post: film(),
    tone: 'aces',
    exposure: 1.0,
    fog: {color: '#05060a', density: 0.028},
    palette: {accent: BRAND.gold, text: BRAND.ivory, base: '#0b0c10'},
  },
  // the same light with a procedural night city behind glass: window bokeh, haze
  'connect-night-city': {
    about: 'Night city tone: procedural skyline with warm windows behind the subject, haze, gold rim',
    background: {type: 'gradient', top: '#02040a', mid: '#2b3d5e', horizon: 0.47, bottom: '#020203'},
    env: {type: 'softbox', intensity: 2.1, warm: BRAND.gold},
    lights: [
      {type: 'key', color: '#ffe9cf', intensity: 1.7, position: [-3, 4, 4.5]},
      {type: 'rim', color: BRAND.gold, intensity: 8, position: [3.4, 2.8, -4]},
      {type: 'rim', color: '#2f6f9c', intensity: 2.2, position: [-4.5, 2, -3]},
      {type: 'ambient', color: '#6f86a8', intensity: 0.14},
    ],
    backdrop: {type: 'city'},
    post: [{type: 'bloom', strength: 0.26, radius: 0.6, threshold: 0.88}, {type: 'vignette', amount: 0.42}, {type: 'grain', amount: 0.05}],
    tone: 'aces',
    exposure: 1.0,
    fog: {color: '#060a12', density: 0.022},
    palette: {accent: BRAND.gold, text: BRAND.ivory, base: '#0a0d14'},
  },
  // product table: black mirror floor, one big softbox above
  'studio-black': {
    about: 'Black studio: soft top light, mirror floor, clean reflections',
    background: {type: 'color', color: '#050506'},
    env: {type: 'softbox', intensity: 2.2, warm: '#ffffff'},
    lights: [
      {type: 'area', color: '#ffffff', intensity: 5, position: [0, 4.5, 1.5], width: 6, height: 3},
      {type: 'rim', color: BRAND.goldHi, intensity: 3.5, position: [3, 2, -4]},
      {type: 'ambient', intensity: 0.08},
    ],
    backdrop: {type: 'backglow', color: '#8fa3c4', intensity: 0.22},
    post: film(0.18, 0.035, 0.3),
    tone: 'aces',
    exposure: 1.0,
    palette: {accent: BRAND.gold, text: BRAND.ivory, base: '#08080a'},
  },
  // frosted glass cards floating in deep blue: for explainers where the camera flies between ideas
  'midnight-glass': {
    about: 'Deep blue space with frosted glass cards; made for camera fly-throughs',
    background: {type: 'gradient', top: '#101a33', bottom: '#04060c'},
    env: {type: 'room', intensity: 0.5},
    lights: [
      {type: 'key', color: '#dfe9ff', intensity: 1.8, position: [-3, 5, 5]},
      {type: 'rim', color: BRAND.gold, intensity: 4.5, position: [4, 2, -4]},
      {type: 'point', color: '#4f7dd1', intensity: 14, position: [-3, 1, -2]},
      {type: 'ambient', intensity: 0.18},
    ],
    post: film(0.24, 0.04, 0.34),
    tone: 'aces',
    exposure: 1.05,
    fog: {color: '#070b16', density: 0.02},
    palette: {accent: BRAND.gold, text: '#eef2fb', base: '#0b1326'},
  },
  // bright neutral studio: the opposite mood, for diagrams and take-apart views
  'pale-studio': {
    about: 'Bright neutral studio for diagrams and take-apart views; one accent colour does the work',
    background: {type: 'gradient', top: '#f1efea', bottom: '#d9d5cd'},
    env: {type: 'room', intensity: 0.9},
    lights: [
      {type: 'key', color: '#ffffff', intensity: 2.4, position: [-3, 6, 4]},
      {type: 'fill', color: '#dfe6f0', intensity: 0.8, position: [4, 2, 3]},
      {type: 'ambient', intensity: 0.35},
    ],
    post: [{type: 'vignette', amount: 0.14}],
    tone: 'neutral',
    exposure: 1.0,
    palette: {accent: BRAND.gold, text: '#17181b', base: '#e9e6df'},
  },
  // drafting table: dark blue, thin lines, no gloss
  blueprint: {
    about: 'Blueprint: dark blue, thin ivory lines and wireframes',
    background: {type: 'gradient', top: '#0c2038', bottom: '#06101e'},
    env: {type: 'room', intensity: 0.25},
    lights: [{type: 'key', color: '#cfe3ff', intensity: 1.4, position: [-2, 5, 4]}, {type: 'ambient', intensity: 0.4}],
    post: [{type: 'vignette', amount: 0.3}, {type: 'grain', amount: 0.03}],
    tone: 'neutral',
    exposure: 1.0,
    palette: {accent: BRAND.goldHi, text: '#dfeaf7', base: '#0a1a2e'},
  },
  // outdoor: physical sky and one sun
  daylight: {
    about: 'Outdoor daylight: physical sky, one sun with soft shadows',
    background: {type: 'sky', elevation: 18, azimuth: 150},
    env: {type: 'room', intensity: 0.6},
    lights: [{type: 'sun', color: '#fff3dd', intensity: 3.2, elevation: 18, azimuth: 150}, {type: 'hemi', sky: '#bcd4ff', ground: '#6b5b45', intensity: 0.55}],
    post: [{type: 'vignette', amount: 0.16}],
    tone: 'agx',
    exposure: 0.9,
    palette: {accent: BRAND.gold, text: '#16181c', base: '#cdd6e2'},
  },
  // nothing behind the object: for putting 3D on top of your own video (alpha out)
  'on-video': {
    about: 'Transparent background for 3D on top of your own video: soft key, gold rim, shadow catcher friendly',
    background: 'transparent',
    env: {type: 'softbox', intensity: 2.0, warm: BRAND.gold},
    lights: [
      {type: 'key', color: '#fff0dc', intensity: 2.2, position: [-3, 4.5, 4.5]},
      {type: 'rim', color: BRAND.gold, intensity: 6, position: [3.5, 2.5, -4]},
      {type: 'ambient', intensity: 0.2},
    ],
    post: [],
    tone: 'aces',
    exposure: 1.0,
    palette: {accent: BRAND.gold, text: BRAND.ivory, base: '#000000'},
  },
};
export const LOOK_NAMES = Object.keys(LOOKS);
export const DEFAULT_LOOK = 'connect-gold-night';
