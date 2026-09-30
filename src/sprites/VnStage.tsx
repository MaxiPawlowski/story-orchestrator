import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { SpriteStage, StageActor } from "./stage";
import { figureBox, frameSlice, type FigureBox, type Framing } from "./direction";
import { log } from "@utils/log";
import "./styles.css";

interface Layer {
  key: number;
  src: string;
}

const PROBE_WIDTH = 48;
const boxes = new Map<string, Promise<FigureBox | null>>();

function measure(src: string): Promise<FigureBox | null> {
  const known = boxes.get(src);
  if (known) return known;
  const pending = new Promise<FigureBox | null>((resolve) => {
    const image = new Image();
    image.onload = () => {
      const height = Math.max(1, Math.round((PROBE_WIDTH * image.naturalHeight) / Math.max(1, image.naturalWidth)));
      const canvas = document.createElement("canvas");
      canvas.width = PROBE_WIDTH;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return resolve(null);
      context.drawImage(image, 0, 0, PROBE_WIDTH, height);
      try {
        resolve(figureBox(context.getImageData(0, 0, PROBE_WIDTH, height).data, PROBE_WIDTH, height));
      } catch (error) {
        log.warn("Sprite framing: could not read the sprite's outline", error);
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });
  boxes.set(src, pending);
  return pending;
}

function useFigureBox(src: string, framing: Framing): FigureBox | null {
  const [box, setBox] = useState<FigureBox | null>(null);
  useEffect(() => {
    if (framing === "full") return;
    let live = true;
    void measure(src).then((found) => { if (live) setBox(found); });
    return () => { live = false; };
  }, [src, framing]);
  return framing === "full" ? null : box;
}

const SPRITE_HEIGHT = 0.92;
const MIN_SHARE = 0.3;

function useVisibleShare(active: boolean): number {
  const [share, setShare] = useState(1);
  useEffect(() => {
    const measureShare = () => {
      const stage = document.getElementById("so-vn-stage")?.getBoundingClientRect();
      const chat = document.getElementById("chat")?.getBoundingClientRect();
      if (!stage || !chat || !stage.height) return setShare(1);
      const top = stage.bottom - stage.height * SPRITE_HEIGHT;
      const covered = chat.top > top && chat.top < stage.bottom && chat.height > 0;
      const next = covered ? Math.max(MIN_SHARE, (chat.top - top) / (stage.height * SPRITE_HEIGHT)) : 1;
      setShare((current) => (Math.abs(current - next) < 0.01 ? current : next));
    };
    measureShare();
    const chat = document.getElementById("chat");
    const observer = typeof ResizeObserver === "undefined" || !chat ? null : new ResizeObserver(measureShare);
    if (chat) observer?.observe(chat);
    window.addEventListener("resize", measureShare);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measureShare);
    };
  }, [active]);
  return share;
}

function Sprite({ actor, index, count, speaking, focus, breathing, crossfadeMs, reducedMotion, framing, share }: {
  actor: StageActor; index: number; count: number; speaking: boolean; focus: boolean; breathing: boolean; crossfadeMs: number; reducedMotion: boolean; framing: Framing;
  share: number;
}) {
  const [layers, setLayers] = useState<Layer[]>([{ key: 0, src: actor.path }]);
  const next = useRef(1);
  useEffect(() => {
    setLayers((current) => (current[current.length - 1]?.src === actor.path ? current : [...current.slice(-1), { key: next.current++, src: actor.path }]));
  }, [actor.path]);
  const box = useFigureBox(actor.path, framing);
  const slice = frameSlice(framing, box);
  const framed = slice.scale !== 1;
  const fade = reducedMotion ? 0 : crossfadeMs;
  const width = Math.min(34, 92 / Math.max(count, 1));
  const left = count <= 1 ? 50 : 50 + (index - (count - 1) / 2) * Math.min(width * 0.8, 88 / (count - 1));
  const classes = ["so-sprite", focus ? (speaking ? "so-speaking" : "so-idle") : "", breathing && !reducedMotion ? "so-breathing" : "",
    actor.spotlight ? "so-spotlight" : "", framed ? `so-framed so-frame-${framing}` : ""].filter(Boolean).join(" ");
  const imageStyle: React.CSSProperties | undefined = framed ? { height: `${slice.scale * share * 100}%`, top: `${-slice.offset * share * 100}%` } : undefined;
  return (
    <div className={classes} data-name={actor.name} data-label={actor.label} data-set={actor.set}
      style={{ left: `${left}%`, width: `${width}vw`, zIndex: speaking ? 3 : actor.spotlight ? 2 : 1, "--so-breath-delay": `${-(index * 1.3) % 4}s`, "--so-fade": `${fade}ms` } as React.CSSProperties}>
      <div className="so-sprite-breath">
        {layers.map((layer, position) => (
          <img key={layer.key} src={layer.src} alt={`${actor.name} (${actor.label})`} draggable={false} style={imageStyle}
            className={position === layers.length - 1 ? "so-sprite-top" : "so-sprite-under"}
            onAnimationEnd={() => setLayers((current) => (current.length > 1 ? current.slice(-1) : current))} />
        ))}
      </div>
    </div>
  );
}

export function VnStage({ stage }: { stage: SpriteStage }) {
  const view = useSyncExternalStore(stage.subscribe, stage.view);
  const share = useVisibleShare(view.visible);
  if (!view.visible) return null;
  const { settings } = view;
  return (
    <div id="so-vn-stage" aria-hidden="true" data-framing={view.framing}>
      {view.actors.map((actor, index) => (
        <Sprite key={actor.avatar} actor={actor} index={index} count={view.actors.length} speaking={view.speaking === actor.name}
          framing={view.framing === "close" && view.actors.length > 1 && !actor.spotlight ? "thigh" : view.framing} share={share}
          focus={settings.focus && view.actors.length > 1} breathing={settings.breathing} crossfadeMs={settings.crossfadeMs} reducedMotion={view.reducedMotion} />
      ))}
    </div>
  );
}
