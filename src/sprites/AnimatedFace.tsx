import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { blinkGap, mouthSequence, type AnimationFrames, type MouthMode, type StreamActivity } from "./animation";

const decoded = new Map<string, number>();
const MAX_DECODED_BYTES = 64 * 1024 * 1024;

export function AnimatedFace({ frames, activity, name, seed, blink, mouth, paused, style }: {
  frames: AnimationFrames; activity: StreamActivity; name: string; seed: string; blink: boolean; mouth: MouthMode; paused: boolean; style?: React.CSSProperties;
}) {
  const speaker = useSyncExternalStore(activity.subscribe, activity.view);
  const [ready, setReady] = useState<AnimationFrames>({});
  const blinkRef = useRef<HTMLImageElement | null>(null);
  const mouthRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    let live = true;
    const held: string[] = [];
    setReady({});
    void (async () => {
      const loaded: AnimationFrames = {};
      for (const key of ["talk", "talk2", "blink"] as const) {
        const path = frames[key];
        if (!path) continue;
        const image = new Image(); image.src = path;
        try {
          await image.decode();
          if (!live) return;
          const bytes = image.naturalWidth * image.naturalHeight * 4;
          const used = [...decoded.values()].reduce((sum, value) => sum + value, 0);
          if (used + bytes > MAX_DECODED_BYTES) continue;
          const allocation = `${seed}:${key}:${path}`;
          decoded.set(allocation, bytes); held.push(allocation); loaded[key] = path;
        } catch { continue; }
      }
      if (live) setReady(loaded);
    })();
    return () => { live = false; held.forEach((key) => decoded.delete(key)); };
  }, [frames, seed]);

  useEffect(() => {
    const element = blinkRef.current;
    if (!element) return;
    element.style.opacity = "0";
    if (paused || !blink || !ready.blink) return;
    let cycle = 0, timer: ReturnType<typeof setTimeout>;
    const schedule = () => { timer = setTimeout(() => {
      element.style.opacity = "1";
      timer = setTimeout(() => { element.style.opacity = "0"; schedule(); }, 140);
    }, blinkGap(seed, cycle++)); };
    schedule();
    return () => { clearTimeout(timer); element.style.opacity = "0"; };
  }, [blink, paused, ready.blink, seed]);

  useEffect(() => {
    const element = mouthRef.current;
    if (!element) return;
    element.style.opacity = "0";
    if (paused || speaker !== name) return;
    const sequence = mouthSequence(mouth, ready);
    if (sequence.length === 1) return;
    let index = 0;
    const timer = setInterval(() => {
      const path = sequence[index++ % sequence.length];
      if (path) element.src = path;
      element.style.opacity = path ? "1" : "0";
    }, 110);
    return () => { clearInterval(timer); element.style.opacity = "0"; };
  }, [mouth, name, paused, ready, speaker]);

  return <>
    {ready.blink && <img ref={blinkRef} src={ready.blink} alt="" aria-hidden="true" className="so-face-overlay" style={{ ...style, opacity: 0 }} />}
    {ready.talk && <img ref={mouthRef} src={ready.talk} alt="" aria-hidden="true" className="so-face-overlay" style={{ ...style, opacity: 0 }} />}
  </>;
}
