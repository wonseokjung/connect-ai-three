// The 4D track for the film, like the effects track a 4D cinema runs with a film.
// connect-ai-three: re-timed to our code-made film (codefilm.js); times are seconds into it. The original track was
// cued to Blender Studio's Charge, which this example does not ship.
//
// Spans set a level while they last (fading in and out): fog, smoke, rain, embers,
// rumble (the seat shakes) and sway (the seat rocks, as in wind).
// Events fire once when the film passes them: a strobe flash, a jolt, a burst of sparks.
// Strobes never come faster than about three a second.

const SPANS = [
  // Misty dawn, then rain over the city.
  { from: 0.5, to: 6.5, fadeIn: 1.2, fadeOut: 2, fog: 0.8, sway: 0.4 },
  { from: 7.8, to: 13.5, fadeIn: 0.8, fadeOut: 1, rain: 1 },
  // The storm.
  { from: 14.5, to: 20.5, fadeIn: 0.6, fadeOut: 1.4, smoke: 0.7, sway: 0.5 },
  { from: 15.1, to: 16.0, fadeIn: 0.1, fadeOut: 0.6, rumble: 0.8 },
  { from: 18.3, to: 19.0, fadeIn: 0.1, fadeOut: 0.6, rumble: 0.6 },
  // The sunset with embers, and mist at the end.
  { from: 28.5, to: 35.5, fadeIn: 1, fadeOut: 1.5, embers: 0.8 },
  { from: 30.0, to: 35.5, fadeIn: 1.5, fadeOut: 2, fog: 0.5 },
];

const WHITE = [0.8, 0.9, 1.0];
const BLUE = [0.35, 0.8, 1.0];
const PINK = [1.0, 0.25, 0.75];
const ORANGE = [1.0, 0.5, 0.15];

const EVENTS = [
  // Lightning.
  ...[15.2, 15.55, 16.9, 18.4, 18.75, 19.6].map((at, i) => ({ at, flash: [i % 2 ? WHITE : BLUE, 0.9], jolt: i % 2 ? 0.2 : 0.5 })),
  // Fireworks: a flash in their colour and sparks.
  { at: 21.4, flash: [PINK, 0.7], burst: { speed: 6 } },
  { at: 22.6, flash: [ORANGE, 0.7], burst: { speed: 7 }, jolt: 0.3 },
  { at: 23.7, flash: [PINK, 0.8], burst: { speed: 8, spread: 2 } },
  { at: 24.6, flash: [BLUE, 0.6], burst: { speed: 6 } },
  { at: 25.3, flash: [ORANGE, 0.9], burst: { speed: 9 }, jolt: 0.6 },
  { at: 26.2, flash: [ORANGE, 0.6], burst: { speed: 6 } },
  { at: 26.9, flash: [PINK, 0.8], burst: { speed: 8, distance: 3.2, spread: 0.8 } },
];

const envelope = (span, t) => {
  if (t < span.from || t > span.to + span.fadeOut) return 0;
  const up = Math.min(1, (t - span.from) / span.fadeIn);
  const down = t > span.to ? 1 - (t - span.to) / span.fadeOut : 1;
  return Math.max(0, Math.min(up, down));
};

const CHANNELS = ['fog', 'smoke', 'rain', 'embers', 'rumble', 'sway'];

export class CueTrack {
  constructor(effects, rig) {
    this.effects = effects;
    this.rig = rig;
    this.last = 0;
  }

  update(t, playing, camera) {
    const levels = Object.fromEntries(CHANNELS.map((name) => [name, 0]));
    if (playing) {
      for (const span of SPANS) {
        const k = envelope(span, t);
        for (const name of CHANNELS) if (span[name]) levels[name] = Math.max(levels[name], span[name] * k);
      }
      // Events between the last frame and this one (not after a jump in the film).
      if (t > this.last && t - this.last < 0.5) {
        for (const event of EVENTS) {
          if (event.at <= this.last || event.at > t) continue;
          if (event.flash) this.effects.flash(...event.flash);
          if (event.jolt && this.effects.enabled) this.rig.jolt(event.jolt);
          if (event.burst) this.effects.burst(camera, event.burst);
        }
      }
    }
    this.last = t;
    this.effects.set(levels);
  }
}
