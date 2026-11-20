// Dev tool (not shipped in the npm package): turns a few open fonts into small typeface data for text3d.
//   node tools/make-fonts.mjs <dir with Pretendard-*.otf and Cormorant-*.ttf>
// Only the letters below are kept (Latin + the Korean letters of a few phrases), with kerning pairs, so a web page
// carries tens of KB per font, not megabytes. The data are Modified Versions under the SIL Open Font License 1.1
// (see licenses/fonts-OFL.txt): each file keeps the copyright line and is published under a different name.
import fs from 'node:fs';
import path from 'node:path';
import opentype from 'three/examples/jsm/libs/opentype.module.js';
import {KIT} from '../lib/paths.mjs';
import {BUILTIN_KO as KO} from '../src/runtime/util.js';

const dir = path.resolve(process.argv[2] || '.');
const LATIN = Array.from({length: 0x7f - 0x20}, (_, i) => String.fromCharCode(0x20 + i)).join('') + '·–—‘’“”©×…°éÉ';
const FONTS = [
  {key: 'thin', name: 'CAL Sans Thin', file: 'Pretendard-ExtraLight.otf', from: 'Pretendard ExtraLight', ko: true},
  {key: 'light', name: 'CAL Sans Light', file: 'Pretendard-Light.otf', from: 'Pretendard Light', ko: true},
  {key: 'sans', name: 'CAL Sans Medium', file: 'Pretendard-Medium.otf', from: 'Pretendard Medium', ko: true},
  {key: 'bold', name: 'CAL Sans Bold', file: 'Pretendard-ExtraBold.otf', from: 'Pretendard ExtraBold', ko: true},
  {key: 'serif', name: 'CAL Serif', file: 'Cormorant-400.ttf', from: 'Cormorant Garamond (wght 400 instance)'},
  {key: 'serif-bold', name: 'CAL Serif Semibold', file: 'Cormorant-600.ttf', from: 'Cormorant Garamond (wght 600 instance)'},
];
const round = Math.round;
for (const F of FONTS) {
  const buf = fs.readFileSync(path.join(dir, F.file));
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const scale = 100000 / ((font.unitsPerEm || 2048) * 72);
  const reversed = /\.otf$/i.test(F.file); // PostScript outlines wind the other way round
  const chars = [...new Set(LATIN + (F.ko ? KO : ''))];
  const glyphs = {};
  const gl = {};
  for (const ch of chars) {
    const g = font.charToGlyph(ch);
    if (!g || (g.index === 0 && ch !== ' ')) continue;
    gl[ch] = g;
    const tok = {ha: round(g.advanceWidth * scale), x_min: round((g.xMin || 0) * scale), x_max: round((g.xMax || 0) * scale), o: ''};
    const cmds = reversed ? reverse(g.path.commands) : g.path.commands;
    for (let c of cmds) {
      const t = c.type.toLowerCase() === 'c' ? 'b' : c.type.toLowerCase();
      tok.o += t + ' ';
      if (c.x !== undefined && c.y !== undefined) tok.o += round(c.x * scale) + ' ' + round(c.y * scale) + ' ';
      if (c.x1 !== undefined && c.y1 !== undefined) tok.o += round(c.x1 * scale) + ' ' + round(c.y1 * scale) + ' ';
      if (c.x2 !== undefined && c.y2 !== undefined) tok.o += round(c.x2 * scale) + ' ' + round(c.y2 * scale) + ' ';
    }
    glyphs[ch] = tok;
  }
  // kerning pairs between the kept Latin letters
  const kern = {};
  const lat = Object.keys(gl).filter((c) => c.charCodeAt(0) < 0x250);
  for (const a of lat) for (const b of lat) {
    let k = 0;
    try {
      k = font.getKerningValue(gl[a], gl[b]);
    } catch {}
    if (k) kern[a + b] = round(k * scale);
  }
  const names = font.names;
  const one = (k) => (names[k] ? Object.values(names[k])[0] : '');
  const data = {
    glyphs, kern, familyName: F.name, ascender: round(font.ascender * scale), descender: round(font.descender * scale),
    underlinePosition: round(font.tables.post.underlinePosition * scale), underlineThickness: round(font.tables.post.underlineThickness * scale),
    boundingBox: {xMin: round(font.tables.head.xMin * scale), xMax: round(font.tables.head.xMax * scale), yMin: round(font.tables.head.yMin * scale), yMax: round(font.tables.head.yMax * scale)},
    resolution: 1000,
    notice: `${F.name}: a subset of glyph outlines derived from ${F.from}. ${one('copyright')}. Licensed under the SIL Open Font License, Version 1.1 (licenses/fonts-OFL.txt). This is a Modified Version and does not carry the original font name.`,
  };
  const out = path.join(KIT, 'src', 'fonts', F.key + '.typeface.json');
  fs.writeFileSync(out, JSON.stringify(data));
  console.log(F.key.padEnd(11), Object.keys(glyphs).length, 'glyphs', Object.keys(kern).length, 'kern pairs', (fs.statSync(out).size / 1024).toFixed(0) + ' KB', '<-', F.from);
}
// same as three's TTFLoader: reverse every contour so the fill ends up on the right side
function reverse(commands) {
  const paths = [];
  let p;
  commands.forEach((c) => {
    if (c.type.toLowerCase() === 'm') {
      p = [c];
      paths.push(p);
    } else if (c.type.toLowerCase() !== 'z') p.push(c);
  });
  const reversed = [];
  paths.forEach((p) => {
    const result = {type: 'm', x: p[p.length - 1].x, y: p[p.length - 1].y};
    reversed.push(result);
    for (let i = p.length - 1; i > 0; i--) {
      const command = p[i];
      const result = {type: command.type};
      if (command.x2 !== undefined && command.y2 !== undefined) {
        result.x1 = command.x2; result.y1 = command.y2; result.x2 = command.x1; result.y2 = command.y1;
      } else if (command.x1 !== undefined && command.y1 !== undefined) {
        result.x1 = command.x1; result.y1 = command.y1;
      }
      result.x = p[i - 1].x; result.y = p[i - 1].y;
      reversed.push(result);
    }
  });
  return reversed;
}
