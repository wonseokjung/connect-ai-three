import React, {useEffect, useRef, useState} from 'react';
import {AbsoluteFill, Composition, OffthreadVideo, continueRender, delayRender, staticFile, useVideoConfig, cancelRender} from 'remotion';
import {SceneCanvas, assetBase} from './SceneCanvas';
import {R3FScene} from './R3FScene';
// @ts-ignore plain JS runtime
import {createStage, normalizeSpec} from '../runtime/all.js';
// @ts-ignore
import {probe} from '../runtime/probe.js';

const FALLBACK = {name: 'empty', duration: 2, objects: [{type: 'gem'}]};
type P = {spec: any; video?: {src?: string; startFrom?: number; fit?: 'cover' | 'contain'; matte?: any} | null; times?: number[]; cols?: number; title?: string; bad?: string[]; keepOut?: boolean; samples?: number};

const meta = ({props}: {props: P}) => {
  const s = normalizeSpec(props.spec || FALLBACK);
  return {durationInFrames: Math.max(1, Math.round(s.duration * s.fps)), fps: s.fps, width: s.size.width, height: s.size.height, props};
};

// the scene alone, or on top of your own video (video below, 3D with a transparent background above)
const Scene: React.FC<P> = ({spec, video}) => {
  const s = spec || FALLBACK;
  return (
    <AbsoluteFill style={{backgroundColor: video && video.src ? '#000' : undefined}}>
      {video && video.src ? <OffthreadVideo src={staticFile(video.src as string)} startFrom={video.startFrom ?? 0} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: video.fit ?? 'cover'}} /> : null}
      <SceneCanvas spec={video ? {...s, look: s.look ?? 'on-video', background: 'transparent'} : s} transparent={video ? true : undefined} matte={video && video.matte ? video.matte : null} />
    </AbsoluteFill>
  );
};

// contact sheet: the same stage rendered at several times into one picture (no ffmpeg needed)
const Sheet: React.FC<P> = ({spec, times = [], cols = 4, title, keepOut}) => {
  const {width, height} = useVideoConfig();
  const ref = useRef<HTMLCanvasElement>(null);
  const [handle] = useState(() => delayRender('connect-ai-three: sheet', {timeoutInMilliseconds: 240000}));
  useEffect(() => {
    (async () => {
      const s = normalizeSpec(spec || FALLBACK);
      const rows = Math.ceil(times.length / cols);
      const pad = 12, head = title ? 56 : pad;
      const tw = Math.floor((width - pad * (cols + 1)) / cols);
      const th = Math.round((tw * s.size.height) / s.size.width);
      const c = ref.current!.getContext('2d')!;
      c.fillStyle = '#0a0b0e';
      c.fillRect(0, 0, width, height);
      c.fillStyle = '#EBE2D2';
      c.font = '300 26px "Helvetica Neue", system-ui, sans-serif';
      if (title) c.fillText(title, pad, 38);
      const stage = await createStage(s, {width: tw * 2, height: th * 2, mode: 'video', assetBase: assetBase(), kitBase: assetBase() + 'assets/kit/'});
      times.forEach((t, i) => {
        stage.render(t);
        const x = pad + (i % cols) * (tw + pad), y = head + Math.floor(i / cols) * (th + pad + 22);
        c.drawImage(stage.canvas, x, y, tw, th);
        if (keepOut) {
          c.strokeStyle = '#ff4d3d';
          c.lineWidth = 2;
          for (const k of s.keepOut) c.strokeRect(x + k.x * tw, y + k.y * th, k.w * tw, k.h * th);
        }
        c.fillStyle = '#D6892A';
        c.font = '400 15px "Helvetica Neue", system-ui, sans-serif';
        c.fillText(`${t.toFixed(2)} s`, x + 2, y + th + 17);
      });
      stage.dispose();
      void rows;
      continueRender(handle);
    })().catch((e) => cancelRender(e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <canvas ref={ref} width={width} height={height} />;
};

// self-check probe: measures in the browser, prints the numbers as one console line for the node side
const Probe: React.FC<P> = ({spec, samples}) => {
  const [handle] = useState(() => delayRender('connect-ai-three: self-check', {timeoutInMilliseconds: 300000}));
  const [txt, setTxt] = useState('checking');
  useEffect(() => {
    probe(spec || FALLBACK, {assetBase: assetBase(), kitBase: assetBase() + 'assets/kit/', samples})
      .then((r: any) => {
        const json = JSON.stringify(r);
        // long console lines get cut: send in pieces
        const size = 6000;
        const n = Math.ceil(json.length / size);
        for (let i = 0; i < n; i++) console.debug(`C3PROBE ${i + 1}/${n} ${json.slice(i * size, (i + 1) * size)}`);
        setTxt(`${r.name}: ${r.samples.length} samples`);
        continueRender(handle);
      })
      .catch((e: any) => cancelRender(e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <AbsoluteFill style={{backgroundColor: '#0a0b0e', color: '#EBE2D2', fontFamily: 'Helvetica Neue, sans-serif', fontSize: 28, padding: 40}}>{txt}</AbsoluteFill>;
};

export const Root: React.FC = () => (
  <>
    <Composition id="Scene" component={Scene as any} durationInFrames={60} fps={30} width={1920} height={1080} defaultProps={{spec: FALLBACK, video: null} as any} calculateMetadata={meta as any} />
    <Composition id="SceneR3F" component={R3FScene as any} durationInFrames={60} fps={30} width={1920} height={1080} defaultProps={{spec: FALLBACK} as any} calculateMetadata={meta as any} />
    <Composition id="Sheet" component={Sheet as any} durationInFrames={1} fps={30} width={1920} height={1080} defaultProps={{spec: FALLBACK, times: [0, 1], cols: 2} as any}
      calculateMetadata={(({props}: {props: P}) => {
        const s = normalizeSpec(props.spec || FALLBACK);
        const cols = props.cols ?? 4, n = (props.times || []).length || 1;
        const width = 1920, pad = 12, tw = Math.floor((width - pad * (cols + 1)) / cols), th = Math.round((tw * s.size.height) / s.size.width);
        const h = (props.title ? 56 : pad) + Math.ceil(n / cols) * (th + pad + 22) + 4;
        return {width, height: h + (h % 2), props};
      }) as any} />
    <Composition id="Probe" component={Probe as any} durationInFrames={1} fps={30} width={640} height={360} defaultProps={{spec: FALLBACK} as any} />
  </>
);
