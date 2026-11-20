// Remotion adapter: the same runtime drawn on a canvas, one frame per Remotion frame (frame / fps = t).
import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig, cancelRender} from 'remotion';
// @ts-ignore plain JS runtime
import {createStage} from '../runtime/all.js';

export const assetBase = () => staticFile('x').slice(0, -1);

// matte = the person matte of your own video, one grayscale picture per frame (white = person). With it the 3D is
// drawn BEHIND the person: {dir: 'assets/matte', pattern: 'm_%06d.png', fps: 30, start: 0, lo, hi, grow}
export type Matte = {dir: string; pattern?: string; fps?: number; start?: number; lo?: number; hi?: number; grow?: number; count?: number};
const matteUrl = (m: Matte, frame: number, fps: number) => {
  let n = Math.floor((frame / fps) * (m.fps ?? fps) + 1e-6) + (m.start ?? 0);
  if (m.count) n = Math.min(m.count - 1 + (m.start ?? 0), n);
  const name = (m.pattern ?? 'm_%06d.png').replace(/%0(\d)d/, (_, w) => String(n).padStart(Number(w), '0'));
  return staticFile(`${m.dir.replace(/\/$/, '')}/${name}`);
};

export const SceneCanvas: React.FC<{spec: any; transparent?: boolean; style?: React.CSSProperties; matte?: Matte | null}> = ({spec, transparent, style, matte}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const ref = useRef<HTMLCanvasElement>(null);
  const stage = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [handle] = useState(() => delayRender('connect-ai-three: building the scene', {timeoutInMilliseconds: 180000}));
  useEffect(() => {
    let dead = false;
    createStage(spec, {canvas: ref.current, width, height, mode: 'video', transparent, assetBase: assetBase(), kitBase: assetBase() + 'assets/kit/'})
      .then((s: any) => {
        if (dead) return s.dispose();
        stage.current = s;
        for (const w of s.warnings) console.debug('C3WARN ' + w);
        setReady(true);
      })
      .catch((e: any) => cancelRender(e));
    return () => {
      dead = true;
      if (stage.current) stage.current.dispose();
      stage.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useLayoutEffect(() => {
    if (!ready || !stage.current) return;
    if (!matte) {
      stage.current.render(frame / fps);
      return;
    }
    // behind the person: wait for this frame's matte, then draw
    const h = delayRender('connect-ai-three: person matte', {timeoutInMilliseconds: 60000});
    const img = new Image();
    let dead = false;
    img.onload = () => {
      if (!dead && stage.current) {
        stage.current.setOccluder(img, matte);
        stage.current.render(frame / fps);
      }
      continueRender(h);
    };
    img.onerror = () => cancelRender(new Error(`person matte not found for frame ${frame}: ${img.src}`));
    img.src = matteUrl(matte, frame, fps);
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, fps, ready]);
  useEffect(() => {
    if (ready) continueRender(handle);
  }, [ready, handle]);
  return <canvas ref={ref} width={width} height={height} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', ...style}} />;
};
