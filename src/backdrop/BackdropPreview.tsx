import { useEffect, useRef, useState } from "react";
import { BackdropController, type BackdropHost, type BackdropStory, type BackdropView } from "./stage/controller";
import { BackdropRenderer } from "./stage/renderer";
import { registerBuiltInLayers } from "./stage/layers";
import { defaultBackdropSettings } from "./settings";
import type { BackdropSettings } from "./types";
import type { BackdropEffect } from "@engine/backdropSchema";

export interface BackdropPreviewProps {
  values: Record<string, unknown>;
  effect?: BackdropEffect;
  settings?: Partial<BackdropSettings>;
  reducedMotion?: boolean;
  sceneKey?: string;
  onView?: (view: BackdropView) => void;
}

export const sceneStill = (): string => {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  const context = canvas.getContext("2d");
  if (!context) return "";
  const sky = context.createLinearGradient(0, 0, 0, 220);
  sky.addColorStop(0, "#2b4a78");
  sky.addColorStop(1, "#d9a46b");
  context.fillStyle = sky;
  context.fillRect(0, 0, 640, 220);
  context.fillStyle = "#2d3b2a";
  context.beginPath();
  context.moveTo(0, 220);
  for (let x = 0; x <= 640; x += 40) context.lineTo(x, 200 - ((x * 37) % 60));
  context.lineTo(640, 360);
  context.lineTo(0, 360);
  context.fill();
  context.fillStyle = "#3a5f7a";
  context.fillRect(0, 290, 640, 70);
  return canvas.toDataURL("image/png");
};

const loadImage = (url: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error("preview still failed"));
  image.src = url;
});

export const BackdropPreview = ({ values, effect, settings, reducedMotion = false, sceneKey = "forest lake.png", onView }: BackdropPreviewProps) => {
  const box = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef({ values, effect, settings, reducedMotion });
  live.current = { values, effect, settings, reducedMotion };
  const [controller, setController] = useState<BackdropController | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current, element = box.current;
    if (!canvas || !element) return undefined;
    const still = sceneStill();
    const listeners = new Set<() => void>();
    const host: BackdropHost = {
      readStill: () => (still ? { url: still, key: sceneKey } : null),
      watchStill: () => () => undefined,
      reducedMotion: () => live.current.reducedMotion,
      hidden: () => false,
      onVisibility: () => () => undefined,
      chatColumn: () => ({ left: element.clientWidth * 0.3, right: element.clientWidth * 0.7 }),
      setFlags: () => undefined,
      sampleColumn: () => null,
      textLuminance: () => null,
      viewport: () => ({ width: element.clientWidth || 640, height: element.clientHeight || 360, dpr: window.devicePixelRatio || 1 }),
      onResize: () => () => undefined,
      onPointer: () => () => undefined,
      loadImage,
      loadVideo: () => Promise.reject(new Error("no video in the preview")),
      requestFrame: (callback) => requestAnimationFrame(callback),
      cancelFrame: (handle) => cancelAnimationFrame(handle),
      now: () => performance.now(),
    };
    const story = (): BackdropStory | null => (live.current.effect ? { checkpointById: { preview: { effects: { backdrop: live.current.effect } } } } : null);
    const unregister = registerBuiltInLayers();
    const next = new BackdropController(host, {
      settings: () => ({ ...defaultBackdropSettings(), ...live.current.settings }), story, checkpointId: () => "preview", values: () => live.current.values,
      subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    }, () => {
      try { return new BackdropRenderer(canvas, loadImage); } catch (failure) { setError(String(failure)); return null; }
    }, (shown) => { canvas.style.opacity = shown ? "1" : "0"; });
    const stop = next.start();
    setController(next);
    return () => { stop(); unregister.forEach((off) => off()); setController(null); };
  }, [sceneKey]);
  useEffect(() => {
    if (!controller) return undefined;
    controller.refresh(true);
    const timer = setTimeout(() => onView?.(controller.view()), 50);
    return () => clearTimeout(timer);
  }, [controller, values, effect, settings, reducedMotion, onView]);
  return (
    <div ref={box} data-so="backdrop-preview" style={{ position: "relative", width: "100%", maxWidth: 960, aspectRatio: "16 / 9", background: "#000" }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block", transition: "opacity 400ms" }} />
      {error && <p role="alert" style={{ position: "absolute", inset: 0, margin: 0, padding: 8, color: "#fff" }}>{error}</p>}
    </div>
  );
};

export default BackdropPreview;
