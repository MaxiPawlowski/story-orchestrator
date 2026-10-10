import React, { useEffect, useMemo, useRef } from "react";
import type { RunGuard } from "@runtime/runToken";
import { headArtHash, headAssetBytes } from "@services/stHost/liveHeadAssets";
import type { LiveHeadRef } from "../liveHeadRefs";
import type { StreamActivity } from "../animation";
import { driveHead } from "./drivers";
import { headImage } from "./load";
import { attachHead } from "./mount";

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
  style?: React.CSSProperties;
}

export function LiveHead(props: LiveHeadProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const { beginRun } = props;
  const { member, look, artHash, source, manifest } = props.binding;
  const revision = useRef(0);
  const canvasKey = useMemo(() => ++revision.current, [member, look, artHash, source, manifest, beginRun]);
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
    const start = performance.now();
    const visible = (ready: boolean) => {
      if (!live) return;
      element.style.visibility = ready ? "visible" : "hidden";
      if (parent) parent.dataset.liveHeadReady = String(ready);
    };
    visible(false);
    void attachHead(element, binding, run, { bytes: headAssetBytes, hash: headArtHash, image: headImage }, () => {
      const current = latest.current;
      return driveHead(binding.member, performance.now() - start, current.label, current.activity.view() === current.name, current.motion,
        { breathing: current.breathing, blink: current.blink, mouth: current.mouth });
    }, visible).then((stop) => {
      clearTimeout(timeout);
      if (run.stillOwns()) dispose = stop;
      else stop?.();
    }).catch(() => { clearTimeout(timeout); abort.abort(); visible(false); owner.release(); });
    return () => { dispose?.(); visible(false); live = false; clearTimeout(timeout); abort.abort(); owner.signal.removeEventListener("abort", onOwnerAbort); owner.release(); };
  }, [member, look, artHash, source, manifest, beginRun]);
  return <canvas key={canvasKey} ref={canvas} className="so-live-head" aria-hidden="true" style={{ ...props.style, visibility: "hidden" }} />;
}
