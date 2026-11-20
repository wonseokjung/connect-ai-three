// doctor: is this machine ready? Node, the packages, a GPU-backed headless browser, one real frame.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {KIT, VERSION} from './paths.mjs';

export async function doctor(log = console.log) {
  let ok = true;
  const line = (good, what, note = '') => {
    if (!good) ok = false;
    log(`  ${good ? 'ok  ' : 'FAIL'} ${what}${note ? '  ' + note : ''}`);
  };
  log(`connect-ai-three ${VERSION} · ${os.platform()} ${os.arch()} · node ${process.version}`);
  line(Number(process.versions.node.split('.')[0]) >= 18, 'node 18 or newer');
  for (const p of ['three', 'remotion', '@remotion/renderer', '@remotion/bundler', '@remotion/three', '@react-three/fiber', 'esbuild', '@dimforge/rapier3d-compat', 'three-mesh-bvh']) {
    // installed with npx / npm the packages sit next to the kit (hoisted), in a clone they sit inside it: look upward
    let f = null;
    for (let d = KIT, i = 0; i < 6 && !f; i++, d = path.dirname(d)) {
      const c = path.join(d, 'node_modules', p, 'package.json');
      if (fs.existsSync(c)) f = c;
    }
    line(!!f, p, f ? JSON.parse(fs.readFileSync(f, 'utf8')).version : 'missing: run npm install');
  }
  try {
    const {renderStillAt} = await import('./render.mjs');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'connect-ai-three-doctor-'));
    const out = path.join(dir, 'out', 'frame.jpg');
    const t = Date.now();
    await renderStillAt(dir, {name: 'doctor', duration: 1, size: {width: 640, height: 360}, objects: [{type: 'gem'}]}, out, 0.5);
    line(fs.existsSync(out) && fs.statSync(out).size > 3000, 'one WebGL frame from the headless browser (ANGLE)', `${((Date.now() - t) / 1000).toFixed(1)} s`);
    fs.rmSync(dir, {recursive: true, force: true});
  } catch (e) {
    line(false, 'one WebGL frame from the headless browser', String(e && e.message ? e.message : e).split('\n')[0]);
  }
  log(ok ? 'ready.' : 'something is missing: see the FAIL lines.');
  return ok;
}
