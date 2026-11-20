// Remotion adapter: the same runtime drawn on a canvas, one frame per Remotion frame (frame / fps = t).
import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig, cancelRender} from 'remotion';
// @ts-ignore plain JS runtime
import {createStage} from '../runtime/all.js';

export const assetBase = () => staticFile('x').slice(0, -1);

export const SceneCanvas: React.FC<{spec: any; transparent?: boolean; style?: React.CSSProperties}> = ({spec, transparent, style}) => {
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
    if (ready && stage.current) stage.current.render(frame / fps);
  }, [frame, fps, ready]);
  useEffect(() => {
    if (ready) continueRender(handle);
  }, [ready, handle]);
  return <canvas ref={ref} width={width} height={height} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', ...style}} />;
};
