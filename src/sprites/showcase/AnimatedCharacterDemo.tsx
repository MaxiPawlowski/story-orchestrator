import React, { useEffect, useMemo, useRef, useState } from "react";
import type { RunGuard } from "@runtime/runToken";
import { sha256Hex } from "@utils/sha256";
import { StreamActivity } from "../animation";
import type { LiveHeadRef } from "../liveHeadRefs";
import { HeadDriver, visemeMouth } from "../liveHead/headDriver";
import { MotionDriver, type Presence } from "../liveHead/motionDriver";
import { headImage } from "../liveHead/load";
import { attachHead } from "../liveHead/mount";
import { HeadLooks, type ExpressionSources } from "../liveHead/expressions";
import { decodeBytes } from "../liveHead/synthesis/decode";
import { HeadRenderer } from "../liveHead/renderer";
import { loadHeadManifest, manifestRef } from "../liveHead/manifest";
import { DEFAULT_MOUTH_CONFIG } from "../mouthConfig";
import type { AnimationFrames } from "../frameKeys";
import { publishedFrames } from "./demoFrames";
import { encodeImage } from "../builder/images";
import type { DrawnSource } from "../liveHead/drawn";
import { syntheticFrames } from "../liveHead/syntheticFrames";

export interface DemoLook { label: string; bust: string; rig: string; full: string; frames?: AnimationFrames }
export interface DemoCharacter {
  id: string;
  name: string;
  blurb: string;
  line: string;
  looks: Record<string, DemoLook>;
  expressions: Record<string, { patch: string; rect: [number, number, number, number] }>;
  poses: Record<string, { label: string; image: string }>;
}
export interface DemoData { characters: DemoCharacter[] }

export const EMOTIONS = ["neutral", "happy", "angry", "worried"] as const;
export const GESTURES = ["nod", "tilt", "think", "giggle", "surprise", "shy", "no", "greet"] as const;

const owner = (): RunGuard => ({ stillOwns: () => true, lapsed: () => null, lapsedDetail: () => null, signal: new AbortController().signal, release: () => undefined });

const dataBytes = (url: string): ArrayBuffer => {
  const comma = url.indexOf(",");
  const head = url.slice(0, comma), body = url.slice(comma + 1);
  if (head.endsWith(";base64")) return Uint8Array.from(atob(body), (char) => char.charCodeAt(0)).buffer;
  return new TextEncoder().encode(decodeURIComponent(body)).buffer;
};
const assetBytes = async (url: string): Promise<ArrayBuffer> => dataBytes(url);
const assetHash = (bytes: ArrayBuffer): Promise<string> => sha256Hex(bytes);
const drawnDeps = { bytes: assetBytes, hash: assetHash, pixels: (bytes: ArrayBuffer, signal: AbortSignal) => decodeBytes(new Uint8Array(bytes), signal) };
const frameDeps = { ...drawnDeps, bytes: (url: string) => url.startsWith("data:") ? assetBytes(url) : fetchBytes(url) };

const toBase64 = (bytes: ArrayBuffer): string => {
  let text = "";
  const view = new Uint8Array(bytes);
  for (let i = 0; i < view.length; i += 0x8000) text += String.fromCharCode(...view.subarray(i, i + 0x8000));
  return btoa(text);
};

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}`);
  return response.arrayBuffer();
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not decode ${url}`));
    image.src = url;
  });
}

export const PATCH_FEATHER = 0.78;

async function patchedArt(bust: string, patch: string, rect: [number, number, number, number]): Promise<string> {
  const [base, piece] = await Promise.all([loadImage(bust), loadImage(patch)]);
  const canvas = document.createElement("canvas"), layer = document.createElement("canvas");
  canvas.width = base.naturalWidth; canvas.height = base.naturalHeight;
  layer.width = rect[2]; layer.height = rect[3];
  const context = canvas.getContext("2d"), local = layer.getContext("2d");
  if (!context || !local) throw new Error("No 2D canvas.");
  context.drawImage(base, 0, 0);
  local.drawImage(piece, 0, 0, rect[2], rect[3]);
  local.globalCompositeOperation = "destination-in";
  local.setTransform(rect[2] / 2, 0, 0, rect[3] / 2, rect[2] / 2, rect[3] / 2);
  const fade = local.createRadialGradient(0, 0, PATCH_FEATHER, 0, 0, 1);
  fade.addColorStop(0, "rgba(0,0,0,1)"); fade.addColorStop(1, "rgba(0,0,0,0)");
  local.fillStyle = fade;
  local.fillRect(-1, -1, 2, 2);
  context.drawImage(layer, rect[0], rect[1]);
  return canvas.toDataURL("image/png");
}

export interface LoadedLook { ref: LiveHeadRef; source: string; full: string; label: string; drawn?: DrawnSource }

export const placeholderFrames = (): boolean => typeof location !== "undefined" && new URLSearchParams(location.search).get("frames") === "placeholder";

async function syntheticSource(art: ArrayBuffer, rig: import("../liveHead/types").Rig): Promise<DrawnSource> {
  const image = await decodeBytes(new Uint8Array(art), new AbortController().signal), made = syntheticFrames(image, rig);
  return { frames: Object.fromEntries(Object.entries(made).map(([key, frame]) => [key, `data:image/png;base64,${encodeImage(frame)}`])) };
}

export async function loadLook(base: string, look: DemoLook, member: string, key: string): Promise<LoadedLook> {
  const [art, rig] = await Promise.all([fetchBytes(base + look.bust), fetchBytes(base + look.rig)]);
  const source = `data:image/png;base64,${toBase64(art)}`;
  const raw = JSON.parse(new TextDecoder().decode(rig)) as Record<string, unknown>, artHash = await sha256Hex(art);
  if (raw.artHash !== artHash) throw new Error(`${look.rig} was built from other art; rebuild it with scripts/docs/demo-rigs.mjs.`);
  const manifest = loadHeadManifest({ ...raw, member, look: key, source, artHash });
  const drawn = publishedFrames(base, look.frames) ?? (placeholderFrames() ? await syntheticSource(art, manifest.rig) : undefined);
  return { ref: manifestRef(manifest), source, full: base + look.full, label: look.label, ...(drawn ? { drawn } : {}) };
}

export async function loadExpressions(base: string, character: DemoCharacter, look: DemoLook): Promise<ExpressionSources> {
  const looks: ExpressionSources["looks"] = {};
  for (const [name, entry] of Object.entries(character.expressions)) looks[name] = { art: await patchedArt(base + look.bust, base + entry.patch, entry.rect), frames: {} };
  return { looks };
}

export interface DemoHeadProps {
  binding: LiveHeadRef;
  name: string;
  label: string;
  activity: StreamActivity;
  motion: boolean;
  gaze: { x: number; y: number } | null;
  expressions?: ExpressionSources;
  gesture?: { id: string; nonce: number };
  drawn?: DrawnSource;
}

export function DemoHead(props: DemoHeadProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const { binding, expressions, drawn } = props;
  const looksKey = expressions ? JSON.stringify(Object.keys(expressions.looks)) : "";
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const run = owner(), abort = new AbortController();
    let live = true, dispose: (() => void) | null = null;
    const guard: RunGuard = { ...run, signal: abort.signal, stillOwns: () => live && !abort.signal.aborted };
    const start = performance.now(), driver = new HeadDriver(binding.member), motion = new MotionDriver(binding.member);
    let gestureNonce = latest.current.gesture?.nonce ?? 0;
    const looks = expressions ? new HeadLooks(expressions, drawnDeps, (name, prepared, problem) => {
      if (live) element.dataset.liveHeadLooks = [element.dataset.liveHeadLooks, `${name}:${prepared ? "ok" : `refused (${problem ?? "unknown"})`}`].filter(Boolean).join(" ");
    }) : null;
    const parent = element.parentElement;
    const visible = (ready: boolean) => {
      if (!live) return;
      element.style.visibility = ready ? "visible" : "hidden";
      if (parent) parent.dataset.liveHeadReady = String(ready);
    };
    visible(false);
    void attachHead(element, binding, guard, { bytes: assetBytes, hash: assetHash, image: headImage }, () => {
      const current = latest.current, elapsed = performance.now() - start, speaker = current.activity.view();
      const speaking = speaker === current.name, presence: Presence = speaking ? "talking" : speaker ? "listening" : "idle";
      looks?.want(current.label, !current.motion);
      const textured = looks?.textured() ?? false;
      const p = driver.drive(elapsed, current.label, speaking, current.motion, true, true, true, textured);
      if (speaking && current.motion) visemeMouth(p, current.activity.mouth(current.name), DEFAULT_MOUTH_CONFIG);
      if (current.gesture && current.gesture.nonce !== gestureNonce) { gestureNonce = current.gesture.nonce; motion.start(current.gesture.id, elapsed); }
      motion.apply(p, elapsed, current.label, presence, current.motion, !textured);
      if (current.gaze) {
        p.gazeX = current.gaze.x; p.gazeY = current.gaze.y;
        if (current.motion) { p.angleX += current.gaze.x * 8; p.angleY += current.gaze.y * 5; }
      }
      element.dataset.liveHeadGesture = motion.playing ?? "";
      return p;
    }, visible, (target, prepared) => new HeadRenderer(target, prepared, DEFAULT_MOUTH_CONFIG), drawn ? { source: drawn, deps: frameDeps, report: (set) => {
      if (live) element.dataset.liveHeadFrames = set ? [set.sprites.map((sprite) => sprite.name).join(" "), ...set.refused].join(" | ") : "failed";
    } } : undefined, (mode) => {
      if (live) element.dataset.liveHeadMouth = mode;
    }, looks ?? undefined).then((stop) => {
      if (live) dispose = stop;
      else stop?.();
      if (live) element.dataset.liveHeadReady = String(Boolean(stop));
    }).catch((error: unknown) => {
      if (live) { element.dataset.liveHeadError = error instanceof Error ? error.message : String(error); visible(false); }
    });
    return () => { live = false; dispose?.(); abort.abort(); };
  }, [binding, expressions, looksKey, drawn]);
  return <canvas ref={canvas} className="so-live-head" aria-hidden="true" style={{ visibility: "hidden" }} />;
}

export function streamLine(activity: StreamActivity, name: string, line: string, onDone: () => void): () => void {
  const words = line.split(/(\s+)/);
  let index = 0;
  const timer = setInterval(() => {
    if (index >= words.length) { clearInterval(timer); onDone(); return; }
    index++;
    activity.pulse(name, words.slice(0, index).join(""));
  }, 70);
  return () => clearInterval(timer);
}

interface ViewProps { data: DemoData; base: string }

export function AnimatedCharacterDemo({ data, base }: ViewProps) {
  const [characterId, setCharacterId] = useState(data.characters[0]?.id ?? "");
  const character = data.characters.find((entry) => entry.id === characterId) ?? data.characters[0];
  const [lookKey, setLookKey] = useState(Object.keys(character.looks)[0]);
  const [emotion, setEmotion] = useState<string>("neutral");
  const [motion, setMotion] = useState(true);
  const [follow, setFollow] = useState(false);
  const [gaze, setGaze] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [pose, setPose] = useState<string>("");
  const [speaking, setSpeaking] = useState(false);
  const [gesture, setGesture] = useState<{ id: string; nonce: number } | undefined>();
  const [loaded, setLoaded] = useState<{ key: string; look: LoadedLook; expressions: ExpressionSources } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const activity = useMemo(() => new StreamActivity(), []);
  const stage = useRef<HTMLDivElement>(null);
  const stopStream = useRef<(() => void) | null>(null);
  const look = character.looks[lookKey] ?? Object.values(character.looks)[0];
  const loadKey = `${character.id}:${lookKey}`;

  useEffect(() => { void activity.visemes(); }, [activity]);
  useEffect(() => {
    let live = true;
    setProblem(null);
    void (async () => {
      const next = await loadLook(base, look, character.name, lookKey);
      const expressions = await loadExpressions(base, character, look);
      if (live) setLoaded({ key: loadKey, look: next, expressions });
    })().catch((error: unknown) => { if (live) setProblem(error instanceof Error ? error.message : String(error)); });
    return () => { live = false; };
  }, [base, character, look, lookKey, loadKey]);
  useEffect(() => () => stopStream.current?.(), []);

  const pickCharacter = (id: string) => {
    const next = data.characters.find((entry) => entry.id === id);
    if (!next || id === character.id) return;
    stopStream.current?.(); activity.stop(); setSpeaking(false);
    setCharacterId(id); setLookKey(Object.keys(next.looks)[0]); setPose(""); setLoaded(null);
  };
  const speak = () => {
    stopStream.current?.();
    if (speaking) { activity.stop(); setSpeaking(false); return; }
    setSpeaking(true);
    stopStream.current = streamLine(activity, character.name, character.line, () => { setSpeaking(false); });
  };
  const onPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!follow || !stage.current) return;
    const box = stage.current.getBoundingClientRect();
    setGaze({ x: Math.max(-1, Math.min(1, ((event.clientX - box.left) / box.width) * 2 - 1)), y: Math.max(-1, Math.min(1, 1 - ((event.clientY - box.top) / box.height) * 2)) });
  };
  const ready = loaded?.key === loadKey ? loaded : null;
  const poseImage = pose ? base + character.poses[pose]?.image : null;

  return <div className="demo-grid">
    <div className="demo-stage" ref={stage} onPointerMove={onPointer} data-ready={ready ? "true" : "false"}>
      {poseImage
        ? <img className="demo-pose" src={poseImage} alt={`${character.name.replace(/^SO-Demo /, "")}, ${character.poses[pose]?.label ?? pose}`} />
        : <div id="so-vn-root" className="demo-bust">
          <div className="so-sprite"><div className="so-sprite-breath">
            {ready && <img src={ready.look.source} alt={`${character.name.replace(/^SO-Demo /, "")}, ${ready.look.label}`} />}
            {ready && <DemoHead binding={ready.look.ref} name={character.name} label={emotion} activity={activity} motion={motion}
              gaze={follow || gaze.x !== 0 || gaze.y !== 0 ? gaze : null} expressions={ready.expressions} gesture={gesture} drawn={ready.look.drawn} />}
          </div></div>
        </div>}
      {!ready && !poseImage && <p className="demo-status">{problem ?? "Loading the rig…"}</p>}
    </div>
    <form className="demo-controls" onSubmit={(event) => event.preventDefault()}>
      <fieldset>
        <legend>Character</legend>
        <div className="demo-row">{data.characters.map((entry) => <button key={entry.id} type="button" aria-pressed={entry.id === character.id}
          onClick={() => pickCharacter(entry.id)}>{entry.name.replace(/^SO-Demo /, "")}</button>)}</div>
        <p className="demo-note">{character.blurb}</p>
      </fieldset>
      <fieldset>
        <legend>Speaking</legend>
        <button type="button" onClick={speak} aria-pressed={speaking}>{speaking ? "Stop" : "Speak a line"}</button>
        <p className="demo-note">“{character.line}”</p>
      </fieldset>
      <fieldset>
        <legend>Emotion</legend>
        <div className="demo-row">{EMOTIONS.map((name) => <button key={name} type="button" aria-pressed={emotion === name} onClick={() => setEmotion(name)}>{name}</button>)}</div>
      </fieldset>
      <fieldset>
        <legend>Gaze</legend>
        <label><input type="checkbox" checked={follow} onChange={(event) => setFollow(event.target.checked)} /> Follow the pointer</label>
        <label>Left / right <input type="range" min={-1} max={1} step={0.05} value={gaze.x} disabled={follow} onChange={(event) => setGaze({ ...gaze, x: Number(event.target.value) })} /></label>
        <label>Down / up <input type="range" min={-1} max={1} step={0.05} value={gaze.y} disabled={follow} onChange={(event) => setGaze({ ...gaze, y: Number(event.target.value) })} /></label>
        <button type="button" onClick={() => { setFollow(false); setGaze({ x: 0, y: 0 }); }}>Let the eyes wander</button>
      </fieldset>
      <fieldset>
        <legend>Gesture</legend>
        <div className="demo-row">{GESTURES.map((id) => <button key={id} type="button" disabled={Boolean(pose)}
          onClick={() => setGesture({ id, nonce: (gesture?.nonce ?? 0) + 1 })}>{id}</button>)}</div>
        <label><input type="checkbox" checked={motion} onChange={(event) => setMotion(event.target.checked)} /> Motion (off = reduced motion)</label>
      </fieldset>
      <fieldset>
        <legend>Pose</legend>
        <div className="demo-row">
          <button type="button" aria-pressed={!pose} onClick={() => setPose("")}>Live bust</button>
          {Object.entries(character.poses).map(([id, entry]) => <button key={id} type="button" aria-pressed={pose === id} onClick={() => setPose(id)}>{entry.label}</button>)}
        </div>
      </fieldset>
      {Object.keys(character.looks).length > 1 && <fieldset>
        <legend>Look</legend>
        <div className="demo-row">{Object.entries(character.looks).map(([key, entry]) => <button key={key} type="button" aria-pressed={key === lookKey}
          onClick={() => { setLookKey(key); setPose(""); }}>{entry.label}</button>)}</div>
        <p className="demo-note">A look change swaps the art and its rig; the face stays the same.</p>
      </fieldset>}
    </form>
  </div>;
}
