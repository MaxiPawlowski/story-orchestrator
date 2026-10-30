import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Lazy } from "@components/Lazy";
import { lazyRetry } from "@utils/lazyRetry";
import type { SpriteStage, StageActor } from "./stage";
import { figureBox, frameSlice, type FigureBox, type Framing } from "./direction";
import { log } from "@utils/log";
import "./styles.css";
import { AnimatedFace } from "./AnimatedFace";
import { frameBudget } from "./faceFrames";
import { StreamActivity } from "./animation";
import type { MotionBudget } from "./motion/budget";
import { nextExpiry, stagePhases, type Placed, type StagePhase } from "./motion/roster";

const inactiveActivity = new StreamActivity();
const LiveHead = lazyRetry(() => import("./liveHead/LiveHead").then((module) => ({ default: module.LiveHead })));
type MotionKit = typeof import("./motion/lazy");
const loadMotion = (): Promise<MotionKit> => import("./motion/lazy");
const StageEffects = lazyRetry(() => loadMotion().then((module) => ({ default: module.StageEffects })));
const REACTION_GAP_MS = 900;
const IDLE_TICK_MS = 1000;

function useMotionKit(enabled: boolean): MotionKit | null {
  const [kit, setKit] = useState<MotionKit | null>(null);
  useEffect(() => {
    if (!enabled || kit) return;
    let live = true;
    loadMotion().then((module) => { if (live) setKit(module); }, (error: unknown) => log.warn("Sprite motion: the effects chunk did not load; the stage stays still.", error));
    return () => { live = false; };
  }, [enabled, kit]);
  return enabled ? kit : null;
}

interface SpriteMotionDeps { kit: MotionKit | null; gate: InstanceType<MotionKit["MotionGate"]> | null }

interface SpriteMotionState { speaking: boolean; talking: boolean; headActive: boolean; still: boolean; boundary: () => number }

function useSpriteMotion(act: React.RefObject<HTMLDivElement | null>, { kit, gate }: SpriteMotionDeps, motion: MotionBudget, actor: StageActor,
  { speaking, talking, headActive, still, boundary }: SpriteMotionState) {
  const label = useRef(actor.label);
  const wasSpeaking = useRef(speaking);
  useEffect(() => {
    const started = speaking && !wasSpeaking.current;
    wasSpeaking.current = speaking;
    if (!started || !kit || !gate || !motion.hop || still) return;
    if (gate.once(`hop:${actor.avatar}:${boundary()}`)) kit.playHop(act.current);
  }, [act, actor.avatar, boundary, gate, kit, motion.hop, speaking, still]);
  useEffect(() => {
    const changed = actor.label !== label.current;
    label.current = actor.label;
    if (!changed || !kit || !gate || !motion.reactions || headActive || still) return;
    if (gate.allow(`react:${actor.avatar}`, Date.now(), REACTION_GAP_MS)) kit.playReaction(act.current, actor.label);
  }, [act, actor.avatar, actor.label, gate, kit, motion.reactions, headActive, still]);
  const resting = !speaking && !talking && !headActive && !still;
  useEffect(() => {
    if (!kit || !motion.idle || !resting) return;
    const began = Date.now();
    let lastSlot = -1;
    const timer = setInterval(() => {
      const elapsed = Date.now() - began, slot = Math.floor(elapsed / kit.IDLE_SLOT_MS);
      if (slot === lastSlot) return;
      const beat = kit.idleBeat(actor.avatar, slot);
      if (!beat || elapsed < beat.startMs || elapsed >= beat.startMs + beat.motion.ms) return;
      lastSlot = slot;
      kit.playMotion(act.current, beat.motion);
    }, IDLE_TICK_MS);
    return () => clearInterval(timer);
  }, [act, actor.avatar, kit, motion.idle, resting]);
}

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

function useStageRoster(actors: StageActor[], session: string, exitMs: number): Placed<StageActor>[] {
  const memory = useRef<{ session: string; placed: Placed<StageActor>[]; seeded: boolean }>({ session, placed: [], seeded: false });
  const [, setTick] = useState(0);
  const same = memory.current.session === session;
  const previous = same ? memory.current.placed : [];
  const seeded = same && memory.current.seeded;
  const placed = stagePhases(previous, actors, (actor) => actor.avatar, Date.now(), exitMs, !seeded);
  memory.current = { session, placed, seeded: seeded || placed.length > 0 };
  const expiry = nextExpiry(placed);
  useEffect(() => {
    if (expiry === null) return;
    const timer = setTimeout(() => setTick((tick) => tick + 1), Math.max(0, expiry - Date.now()) + 16);
    return () => clearTimeout(timer);
  }, [expiry]);
  return placed;
}

function Sprite({ actor, index, left, width, phase, motion, kit, speaking, talking, focus, breathing, crossfadeMs, reducedMotion, framing, share, budget, stage, liveHead }: {
  actor: StageActor; index: number; left: number; width: number; phase: StagePhase; motion: MotionBudget; kit: SpriteMotionDeps; speaking: boolean; talking: boolean; focus: boolean;
  breathing: boolean; crossfadeMs: number; reducedMotion: boolean;
  framing: Framing; share: number; budget: number;
  stage: SpriteStage;
  liveHead: boolean;
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
  const [mediaMotion, setMediaMotion] = useState(() => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setMediaMotion(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  const act = useRef<HTMLDivElement | null>(null);
  const headActive = liveHead && Boolean(actor.liveHead);
  const still = reducedMotion || mediaMotion || phase === "exit";
  useSpriteMotion(act, kit, motion, actor, { speaking, talking, headActive, still, boundary: stage.boundary });
  const swaying = motion.idle && !still && !headActive;
  const entering = phase === "enter" && motion.enter !== "none";
  const classes = ["so-sprite", focus ? (speaking ? "so-speaking" : talking ? "so-talking" : "so-idle") : "", breathing && !reducedMotion && !mediaMotion ? "so-breathing" : "",
    actor.spotlight ? "so-spotlight" : "", framed ? `so-framed so-frame-${framing}` : "", entering ? "so-enter" : "", phase === "exit" ? "so-exit" : ""].filter(Boolean).join(" ");
  const imageStyle: React.CSSProperties | undefined = framed ? { height: `${slice.scale * share * 100}%`, top: `${-slice.offset * share * 100}%` } : undefined;
  return (
    <div className={classes} data-name={actor.name} data-label={actor.label} data-set={actor.set} data-phase={phase} data-enter={motion.enter === "rise" ? "rise" : "fade"}
      style={{ left: `${left}%`, width: `${width}%`, zIndex: speaking ? 3 : actor.spotlight ? 2 : 1, "--so-breath-delay": `${-(index * 1.3) % 4}s`, "--so-fade": `${fade}ms`,
        "--so-enter-ms": `${motion.enterMs}ms`, "--so-exit-ms": `${motion.exitMs}ms`, "--so-sway-delay": `${-((index * 2.3) % 7)}s` } as React.CSSProperties}>
      <div className={swaying ? "so-sprite-sway so-swaying" : "so-sprite-sway"}><div ref={act} className="so-sprite-act"><div className="so-sprite-breath">
        {layers.map((layer, position) => (
          <img key={layer.key} src={layer.src} alt={`${actor.name} (${actor.label})`} draggable={false} style={imageStyle}
            className={position === layers.length - 1 ? "so-sprite-top" : "so-sprite-under"}
            onAnimationEnd={() => setLayers((current) => (current.length > 1 ? current.slice(-1) : current))} />
        ))}
        {actor.frames && <AnimatedFace frames={actor.frames} activity={stage.activity ?? inactiveActivity} name={actor.name} seed={actor.avatar}
          blink={stage.view().settings.blink} mouth={stage.view().settings.mouth} paused={reducedMotion || mediaMotion || layers.length > 1} budget={budget} style={imageStyle} />}
        {liveHead && actor.liveHead && <Lazy quiet key={stage.view().headSession}><LiveHead binding={actor.liveHead}
          beginRun={stage.beginHeadRun} activity={stage.activity ?? inactiveActivity} name={actor.name} label={actor.label}
          motion={!reducedMotion && !mediaMotion} breathing={breathing} blink={stage.view().settings.blink}
          mouth={stage.view().settings.mouth !== "off"} drawn={actor.headFrames} expressions={actor.headLooks} style={imageStyle} /></Lazy>}
      </div></div></div>
    </div>
  );
}

export function VnStage({ stage }: { stage: SpriteStage }) {
  const view = useSyncExternalStore(stage.subscribe, stage.view);
  const share = useVisibleShare(view.visible);
  const placed = useStageRoster(view.visible ? view.actors : [], view.headSession, view.motion.exitMs);
  const kit = useMotionKit(view.visible && (view.motion.hop || view.motion.reactions || view.motion.idle));
  const gate = useMemo(() => (kit ? new kit.MotionGate() : null), [kit]);
  const motionDeps = useMemo(() => ({ kit, gate }), [kit, gate]);
  if (!view.visible) return null;
  const { settings } = view;
  const budget = frameBudget(view.actors.filter((actor) => actor.frames).length);
  const closeActors = view.actors.filter((actor) => (actor.framing ?? view.framing) === "close");
  const headActor = closeActors.find((actor) => actor.spotlight) ?? closeActors.find((actor) => actor.name === view.speaking) ?? closeActors[0];
  return (
    <div id="so-vn-stage" aria-hidden="true" data-framing={view.framing} data-placement={view.placement} data-motion={view.motion.mode}
      data-blur={settings.focus && view.motion.blurOthers && view.actors.length > 1 ? "true" : undefined}
      style={{ "--so-move-ms": `${view.motion.moveMs}ms` } as React.CSSProperties}>
      {view.motion.mode !== "off" && <Lazy quiet><StageEffects stage={stage} motion={view.motion} /></Lazy>}
      {placed.map(({ actor, index, left, width, phase }) => (
        <Sprite key={actor.avatar} actor={actor} index={index} left={left} width={width} phase={phase} motion={view.motion} kit={motionDeps} speaking={view.speaking === actor.name}
          talking={view.talker === actor.name} budget={budget} stage={stage}
          liveHead={settings.liveHead && (actor.framing ?? view.framing) === "close" && actor === headActor}
          framing={actor.framing ?? (view.framing === "close" && view.actors.length > 1 && actor !== headActor ? "thigh" : view.framing)} share={share}
          focus={settings.focus && view.actors.length > 1} breathing={settings.breathing} crossfadeMs={settings.crossfadeMs} reducedMotion={view.reducedMotion} />
      ))}
    </div>
  );
}
