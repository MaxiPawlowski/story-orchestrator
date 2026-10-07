import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { mouthSequence, type AnimationFrames, type MouthMode, type StreamActivity } from "./animation";
import { decodeFrames, decodeImage, frameMemory, startBlink, startMouth } from "./faceFrames";

export function AnimatedFace({ frames, activity, name, seed, blink, mouth, paused, budget, style }: {
  frames: AnimationFrames; activity: StreamActivity; name: string; seed: string; blink: boolean; mouth: MouthMode; paused: boolean; budget: number; style?: React.CSSProperties;
}) {
  const speaker = useSyncExternalStore(activity.subscribe, activity.view);
  const [ready, setReady] = useState<AnimationFrames>({});
  const blinkRef = useRef<HTMLImageElement | null>(null);
  const mouthRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    let live = true;
    const held: string[] = [];
    setReady({});
    void decodeFrames(frames, seed, budget, frameMemory, decodeImage, () => live, held).then((loaded) => { if (loaded && live) setReady(loaded); });
    return () => { live = false; held.forEach((key) => frameMemory.release(key)); };
  }, [frames, seed, budget]);

  useEffect(() => {
    const element = blinkRef.current;
    if (!element) return;
    element.style.opacity = "0";
    if (paused || !blink || !ready.blink) return;
    return startBlink(element, seed);
  }, [blink, paused, ready.blink, seed]);

  useEffect(() => {
    const element = mouthRef.current;
    if (!element) return;
    element.style.opacity = "0";
    if (paused || speaker !== name) return;
    return startMouth(element, mouthSequence(mouth, ready));
  }, [mouth, name, paused, ready, speaker]);

  return <>
    {ready.blink && <img ref={blinkRef} src={ready.blink} alt="" aria-hidden="true" className="so-face-overlay" style={{ ...style, opacity: 0 }} />}
    {ready.talk && <img ref={mouthRef} src={ready.talk} alt="" aria-hidden="true" className="so-face-overlay" style={{ ...style, opacity: 0 }} />}
  </>;
}
