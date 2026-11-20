// The R3F lane: the same spec inside Remotion's <ThreeCanvas> (@remotion/three) through our R3F adapter.
// Use this when you already have React Three Fiber / drei components and want to mix them with a spec.
import React, {useState} from 'react';
import {AbsoluteFill, continueRender, delayRender, useCurrentFrame, useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {ConnectScene} from '../adapters/r3f';
import {assetBase} from './SceneCanvas';
// @ts-ignore
import {normalizeSpec} from '../runtime/all.js';

export const R3FScene: React.FC<{spec: any; children?: React.ReactNode}> = ({spec, children}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const s = normalizeSpec(spec);
  const [handle] = useState(() => delayRender('connect-ai-three: r3f scene', {timeoutInMilliseconds: 180000}));
  const bg = s.background && s.background.type === 'gradient' ? `linear-gradient(${s.background.top}, ${s.background.bottom})` : s.background && s.background.color ? s.background.color : '#000';
  return (
    <AbsoluteFill style={{background: bg}}>
      <ThreeCanvas width={width} height={height} shadows gl={{antialias: true, alpha: true, preserveDrawingBuffer: true}} camera={{fov: s.camera.fov ?? 35, near: 0.1, far: 600, position: [0, 1.1, 6]}}>
        <ConnectScene spec={spec} time={frame / fps} assetBase={assetBase()} onReady={() => continueRender(handle)} />
        {children}
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
