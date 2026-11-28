// The film on the screen, made in code for connect-ai-three: a 36 second short drawn on a canvas every frame, with
// a soundtrack made with the Web Audio API. It replaces the original demo's film (a cut of Blender Studio's Charge,
// CC BY 4.0), so the example ships no video. It behaves like the <video> element the demo was written for:
// currentTime, play(), pause(), an 'ended' event. Change TITLE and the scenes to show your own programme.
//
// Scenes (the 4D track in cues.js is timed to them):
//   0-7 s    misty dawn, the title fades in
//   7-14 s   rain over a city at night
//   14-21 s  a storm: lightning in blue strobes
//   21-28 s  fireworks, pink and orange
//   28-36 s  a warm sunset with embers, the closing card
export const TITLE = { kicker: 'CONNECT AI LAB PRESENTS', title: 'OPENING NIGHT', closing: 'YOUR SHOW HERE' };
export const DURATION = 36;
export const W = 1280;
export const H = 536;

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;
const rnd = (i) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// The city skyline, the same every time.
const TOWERS = Array.from({ length: 46 }, (_, i) => ({ x: i * 29 - 20 + rnd(i) * 12, w: 18 + rnd(i + 9) * 26, h: 60 + rnd(i + 3) * 190 }));
const FIREWORKS = [
  { at: 21.4, x: 0.3, y: 0.32, c: [255, 70, 190] },
  { at: 22.6, x: 0.68, y: 0.26, c: [255, 150, 60] },
  { at: 23.7, x: 0.5, y: 0.2, c: [255, 90, 200] },
  { at: 24.6, x: 0.22, y: 0.28, c: [120, 210, 255] },
  { at: 25.3, x: 0.78, y: 0.34, c: [255, 120, 40] },
  { at: 26.2, x: 0.45, y: 0.3, c: [255, 210, 120] },
  { at: 26.9, x: 0.62, y: 0.18, c: [255, 80, 160] },
];
const LIGHTNING = [15.2, 15.55, 16.9, 18.4, 18.75, 19.6];

let SKYLINE = null;
function skyline() {
  if (SKYLINE) return SKYLINE;
  SKYLINE = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const g = SKYLINE.getContext('2d');
  for (const [i, b] of TOWERS.entries()) {
    g.fillStyle = 'rgb(6,8,16)';
    g.fillRect(b.x, H - b.h, b.w, b.h);
    for (let wy = H - b.h + 10; wy < H - 8; wy += 14)
      for (let wx = b.x + 4; wx < b.x + b.w - 4; wx += 8)
        if (rnd(i * 131 + wx * 3 + wy) > 0.62) {
          g.fillStyle = `rgba(255,${Math.round(200 + rnd(wx) * 40)},120,0.8)`;
          g.fillRect(wx, wy, 3, 5);
        }
  }
  return SKYLINE;
}

export class CodeFilm extends EventTarget {
  constructor() {
    super();
    this.canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
    this.ctx = this.canvas.getContext('2d');
    this.duration = DURATION;
    this.time = 0;
    this.paused = true;
    this.muted = true;
    this.last = 0;
    this.draw(0);
  }

  get currentTime() {
    return this.time;
  }
  set currentTime(t) {
    this.time = clamp(t, 0, DURATION);
    this.draw(this.time);
  }

  async play() {
    this.paused = false;
    this.last = performance.now();
    this.music?.start(this.time);
  }
  pause() {
    this.paused = true;
    this.music?.stop();
  }

  // Called once a frame by film.js. Returns true when a new picture was drawn.
  tick() {
    if (this.paused) return false;
    const now = performance.now();
    this.time += Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.time >= DURATION) {
      this.time = DURATION;
      this.pause();
      this.dispatchEvent(new Event('ended'));
    }
    this.draw(this.time);
    return true;
  }

  // The poster: the title card.
  poster() {
    const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
    const keep = this.ctx;
    this.ctx = c.getContext('2d');
    this.draw(5.5, true);
    this.ctx = keep;
    this.draw(this.time);
    return c;
  }

  draw(t, poster = false) {
    const g = this.ctx;
    g.save();
    // sky: dawn -> night -> storm -> fireworks night -> sunset
    const sky = g.createLinearGradient(0, 0, 0, H);
    const dawn = smooth(0, 1, 1 - smooth(5, 8, t));
    const sunset = smooth(27, 30, t);
    const top = [mix(mix(14, 120, dawn), 255, sunset * 0.55), mix(mix(18, 140, dawn), 120, sunset * 0.6), mix(mix(40, 190, dawn), 70, sunset * 0.7)];
    const bottom = [mix(mix(30, 255, dawn), 255, sunset), mix(mix(30, 200, dawn), 170, sunset), mix(mix(60, 170, dawn), 90, sunset)];
    sky.addColorStop(0, `rgb(${top.map(Math.round)})`);
    sky.addColorStop(1, `rgb(${bottom.map(Math.round)})`);
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    // sun (dawn and sunset)
    const sunY = t < 14 ? mix(H * 0.75, H * 0.45, smooth(0, 7, t)) : mix(H * 0.4, H * 0.78, smooth(28, 36, t));
    const sunA = Math.max(dawn * 0.9, sunset);
    if (sunA > 0.01) {
      const r = g.createRadialGradient(W * 0.5, sunY, 0, W * 0.5, sunY, 320);
      r.addColorStop(0, `rgba(255,236,190,${sunA})`);
      r.addColorStop(0.18, `rgba(255,190,110,${sunA * 0.85})`);
      r.addColorStop(1, 'rgba(255,140,60,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, W, H);
    }

    // lightning (whole frame flashes blue-white)
    let flash = 0;
    for (const at of LIGHTNING) flash = Math.max(flash, t >= at ? Math.exp(-(t - at) * 9) : 0);
    if (flash > 0.01) {
      g.fillStyle = `rgba(170,215,255,${flash * 0.85})`;
      g.fillRect(0, 0, W, H);
      g.strokeStyle = `rgba(240,250,255,${flash})`;
      g.lineWidth = 4;
      g.beginPath();
      let x = W * (0.3 + rnd(Math.floor(t * 3)) * 0.4), y = 0;
      g.moveTo(x, y);
      for (let i = 0; i < 9; i++) g.lineTo((x += (rnd(i + Math.floor(t * 3) * 7) - 0.5) * 90), (y += H * 0.07));
      g.stroke();
    }

    // fireworks
    for (const f of FIREWORKS) {
      const k = t - f.at;
      if (k < 0 || k > 2.2) continue;
      const a = 1 - k / 2.2;
      for (let i = 0; i < 64; i++) {
        const ang = (i / 64) * Math.PI * 2;
        const sp = 180 * (0.6 + rnd(i) * 0.4) * (1 - Math.exp(-k * 3));
        const px = f.x * W + Math.cos(ang) * sp, py = f.y * H + Math.sin(ang) * sp + k * k * 30;
        g.fillStyle = `rgba(${f.c},${a})`;
        g.beginPath();
        g.arc(px, py, 3.2 * a + 1, 0, Math.PI * 2);
        g.fill();
      }
      const glow = g.createRadialGradient(f.x * W, f.y * H, 0, f.x * W, f.y * H, 300);
      glow.addColorStop(0, `rgba(${f.c},${0.55 * a * a})`);
      glow.addColorStop(1, `rgba(${f.c},0)`);
      g.fillStyle = glow;
      g.fillRect(0, 0, W, H);
    }

    // city (from 7 s), drawn once and reused
    const city = smooth(6, 8.5, t) * (1 - smooth(27, 30, t) * 0.6);
    if (city > 0.01) {
      g.globalAlpha = city;
      g.drawImage(skyline(), 0, 0);
      g.globalAlpha = 1;
    }

    // rain (7-14 s) and mist (0-7 s, 28 s on)
    const rain = smooth(7.5, 9, t) * (1 - smooth(13, 14.5, t));
    if (rain > 0.01) {
      g.strokeStyle = `rgba(190,210,255,${0.35 * rain})`;
      g.lineWidth = 1.2;
      g.beginPath();
      for (let i = 0; i < 260; i++) {
        const x = (rnd(i) * W + t * 120) % W, y = (rnd(i + 99) * H + t * 900) % H;
        g.moveTo(x, y);
        g.lineTo(x - 6, y + 22);
      }
      g.stroke();
    }
    const mist = Math.max(1 - smooth(5, 7.5, t), smooth(29, 32, t) * 0.5);
    if (mist > 0.01) {
      for (let i = 0; i < 5; i++) {
        const y = H * (0.55 + i * 0.09), x = ((t * (14 + i * 6) + i * 260) % (W + 600)) - 300;
        const m = g.createRadialGradient(x, y, 0, x, y, 420);
        m.addColorStop(0, `rgba(255,245,235,${0.22 * mist})`);
        m.addColorStop(1, 'rgba(255,245,235,0)');
        g.fillStyle = m;
        g.fillRect(0, 0, W, H);
      }
    }

    // embers (28 s on)
    const embers = smooth(28, 30, t);
    if (embers > 0.01) {
      for (let i = 0; i < 90; i++) {
        const x = (rnd(i) * W + Math.sin(t + i) * 30) % W, y = H - ((rnd(i + 7) * H + t * (40 + rnd(i) * 60)) % H);
        g.fillStyle = `rgba(255,${120 + rnd(i) * 100},40,${embers * (0.4 + rnd(i + 3) * 0.6)})`;
        g.fillRect(x, y, 3, 3);
      }
    }

    // titles
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const titleA = poster ? 1 : smooth(1.5, 3.5, t) * (1 - smooth(6, 7.2, t));
    if (titleA > 0.01) {
      g.fillStyle = `rgba(40,24,10,${titleA * 0.75})`;
      g.font = '600 22px system-ui, sans-serif';
      g.fillText(TITLE.kicker.split('').join(' '), W / 2, H * 0.36);
      g.fillStyle = `rgba(30,18,8,${titleA})`;
      g.font = '700 96px Georgia, serif';
      g.fillText(TITLE.title, W / 2, H * 0.5);
    }
    const endA = smooth(31.5, 33, t) * (1 - smooth(35.2, 36, t));
    if (endA > 0.01) {
      g.fillStyle = `rgba(255,244,225,${endA})`;
      g.font = '700 84px Georgia, serif';
      g.fillText(TITLE.closing, W / 2, H * 0.42);
    }
    // fade in from black, fade out to black
    const black = poster ? 0 : Math.max(1 - smooth(0, 1.2, t), smooth(35.2, 36, t));
    if (black > 0.001) {
      g.fillStyle = `rgba(0,0,0,${black})`;
      g.fillRect(0, 0, W, H);
    }
    g.restore();
  }
}

// The soundtrack: a soft chord per scene, rain noise, thunder and firework thumps, all made with Web Audio nodes.
// connect() plays it into the cinema's speakers (audio.js) instead of a video's sound.
export class FilmMusic {
  constructor(context, out) {
    this.context = context;
    this.out = out;
    this.voices = [];
  }
  start(from) {
    this.stop();
    const c = this.context, now = c.currentTime;
    const CHORDS = [
      [0, [220, 277.2, 329.6, 440]],
      [7, [196, 246.9, 293.7, 392]],
      [14, [174.6, 220, 261.6, 349.2]],
      [21, [233.1, 293.7, 349.2, 466.2]],
      [28, [220, 277.2, 329.6, 493.9]],
    ];
    const master = c.createGain();
    master.gain.value = 0.0;
    master.gain.setTargetAtTime(0.12, now, 0.6);
    master.connect(this.out);
    for (const [at, notes] of CHORDS) {
      const end = CHORDS.find(([a]) => a > at)?.[0] ?? DURATION;
      if (end <= from) continue;
      const t0 = now + Math.max(0, at - from), t1 = now + (end - from);
      notes.forEach((f, i) => {
        const o = c.createOscillator();
        o.type = i % 2 ? 'sine' : 'triangle';
        o.frequency.value = f;
        o.detune.value = (i - 1.5) * 4;
        const g = c.createGain();
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(0.25, t0 + 1.2);
        g.gain.setValueAtTime(0.25, Math.max(t0 + 1.2, t1 - 1));
        g.gain.linearRampToValueAtTime(0, t1);
        o.connect(g).connect(master);
        o.start(t0);
        o.stop(t1 + 0.1);
        this.voices.push(o);
      });
    }
    // thumps for lightning and fireworks
    for (const at of [...LIGHTNING, ...FIREWORKS.map((f) => f.at)]) {
      if (at < from) continue;
      const o = c.createOscillator(), g = c.createGain(), t0 = now + (at - from);
      o.frequency.setValueAtTime(90, t0);
      o.frequency.exponentialRampToValueAtTime(35, t0 + 0.6);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.9, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);
      o.connect(g).connect(master);
      o.start(t0);
      o.stop(t0 + 1);
      this.voices.push(o);
    }
    this.master = master;
  }
  stop() {
    for (const v of this.voices) try { v.stop(); } catch {}
    this.voices = [];
    this.master?.disconnect();
    this.master = null;
  }
}
