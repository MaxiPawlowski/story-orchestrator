import React, { useEffect, useMemo, useRef } from "react";
import type { RunGuard } from "@runtime/runToken";
import { headArtHash, headAssetBytes } from "@services/stHost/liveHeadAssets";
import { log } from "@utils/log";
import type { LiveHeadRef } from "../liveHeadRefs";
import type { StreamActivity } from "../animation";
import { HeadDriver, visemeMouth } from "./headDriver";
import { MotionDriver, type Presence } from "./motionDriver";
import { headImage } from "./load";
import { attachHead } from "./mount";
import type { DrawnSource } from "./drawn";
import { HeadLooks, type ExpressionSources } from "./expressions";
import { decodeBytes } from "./synthesis/decode";
import { HeadRenderer } from "./renderer";
import { DEFAULT_MOUTH_CONFIG, type MouthConfig } from "../mouthConfig";

export interface LiveHeadProps {
  binding: LiveHeadRef;
  name: string;
  label: string;
  activity: StreamActivity;
  motion: boolean;
  breathing: boolean;
  blink: boolean;
  mouth: boolean;
  beginRun(): RunGuard;
  drawn?: DrawnSource;
  expressions?: ExpressionSources;
  mouthConfig?: MouthConfig;
  gesture?: { id: string; nonce: number };
  style?: React.CSSProperties;
}

const drawnDeps = { bytes: headAssetBytes, hash: headArtHash, pixels: (bytes: ArrayBuffer, signal: AbortSignal) => decodeBytes(new Uint8Array(bytes), signal) };

export function LiveHead(props: LiveHeadProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const { beginRun } = props;
  const { member, look, artHash, source, manifest } = props.binding;
  const drawnKey = props.drawn ? JSON.stringify(props.drawn) : "";
  const looksKey = props.expressions && Object.keys(props.expressions.looks).length ? JSON.stringify(props.expressions) : "";
  const mouthConfig = props.mouthConfig ?? DEFAULT_MOUTH_CONFIG;
  const revision = useRef(0);
  const canvasKey = useMemo(() => ++revision.current, [member, look, artHash, source, manifest, beginRun, drawnKey, looksKey, mouthConfig]);
  useEffect(() => {
    const binding = { member, look, artHash, source, manifest };
    const element = canvas.current;
    if (!element) return;
    const parent = element.parentElement, owner = beginRun(), abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 15_000);
    let live = true, dispose: (() => void) | null = null;
    const onOwnerAbort = () => abort.abort();
    if (owner.signal.aborted) abort.abort();
    else owner.signal.addEventListener("abort", onOwnerAbort, { once: true });
    const run: RunGuard = { ...owner, signal: abort.signal, stillOwns: () => {
      const current = latest.current.binding;
      return live && !abort.signal.aborted && owner.stillOwns() && current.member === member && current.look === look
        && current.artHash === artHash && current.source === source && current.manifest === manifest;
    } };
    const start = performance.now(), driver = new HeadDriver(binding.member), motion = new MotionDriver(binding.member);
    let gestureNonce = latest.current.gesture?.nonce ?? 0;
    const looks = looksKey ? new HeadLooks(JSON.parse(looksKey) as ExpressionSources, drawnDeps, (name, prepared, problem) => {
      if (!live) return;
      element.dataset.liveHeadLooks = [element.dataset.liveHeadLooks, `${name}:${prepared ? `ok${prepared.gaze.every(Boolean) ? "" : "-still"}` : "refused"}`].filter(Boolean).join(" ");
      if (problem) log.debug("Live head expression kept neutral", name, problem);
    }) : null;
    const visible = (ready: boolean) => {
      if (!live) return;
      element.style.visibility = ready ? "visible" : "hidden";
      if (parent) parent.dataset.liveHeadReady = String(ready);
    };
    visible(false);
    void attachHead(element, binding, run, { bytes: headAssetBytes, hash: headArtHash, image: headImage }, () => {
      const current = latest.current, elapsed = performance.now() - start, speaker = current.activity.view();
      const speaking = speaker === current.name, presence: Presence = speaking ? "talking" : speaker ? "listening" : "idle";
      looks?.want(current.label, !current.motion);
      const textured = looks?.textured() ?? false;
      const p = driver.drive(elapsed, current.label, speaking, current.motion, current.breathing, current.blink, current.mouth, textured);
      if (speaking && current.motion && current.mouth) visemeMouth(p, current.activity.mouth(current.name), mouthConfig);
      if (current.gesture && current.gesture.nonce !== gestureNonce) { gestureNonce = current.gesture.nonce; motion.start(current.gesture.id, elapsed); }
      motion.apply(p, elapsed, current.label, presence, current.motion, !textured);
      if (!current.breathing) p.breath = 0;
      const gesture = motion.playing ?? "";
      if (element.dataset.liveHeadGesture !== gesture) element.dataset.liveHeadGesture = gesture;
      return p;
    }, visible, (target, prepared) => new HeadRenderer(target, prepared, mouthConfig), drawnKey ? { source: JSON.parse(drawnKey) as DrawnSource, deps: drawnDeps, report: (set, error) => {
      if (!live) return;
      element.dataset.liveHeadDrawn = set?.sprites.map((sprite) => sprite.name).join(" ") || "none";
      if (set?.refused.length || error) log.debug("Live head drawn frames partly refused", set?.refused ?? error);
    } } : undefined, (mode, problem) => {
      if (!live) return;
      element.dataset.liveHeadMouth = mode;
      if (problem) log.debug("Live head mouth kept still", problem);
    }, looks ?? undefined).then((stop) => {
      clearTimeout(timeout);
      if (run.stillOwns()) dispose = stop;
      else stop?.();
    }).catch(() => { clearTimeout(timeout); abort.abort(); visible(false); owner.release(); });
    return () => { dispose?.(); visible(false); live = false; clearTimeout(timeout); abort.abort(); owner.signal.removeEventListener("abort", onOwnerAbort); owner.release(); };
  }, [member, look, artHash, source, manifest, beginRun, drawnKey, looksKey, mouthConfig]);
  const { activity, mouth } = props;
  useEffect(() => { if (mouth) void activity.visemes(); }, [activity, mouth]);
  return <canvas key={canvasKey} ref={canvas} className="so-live-head" aria-hidden="true" style={{ ...props.style, visibility: "hidden" }} />;
}
