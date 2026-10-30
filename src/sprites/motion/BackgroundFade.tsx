import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { watchBackgroundLayer, type BackgroundLayer } from "@services/stHost/backgroundLayer";
import type { SpriteStage } from "../stage";
import { budgetedCue } from "./cues";
import { playBackgroundFade } from "./player";
import { HOLD_MS, RELEASE_MS, layerNamesAuthored } from "./backgroundHold";

const RECENT_MS = 2500;
const ARM_MS = 4000;

interface Shown { key: number; layer: BackgroundLayer; ms: number | null }

export function BackgroundFade({ stage }: { stage: SpriteStage }) {
  const view = useSyncExternalStore(stage.subscribe, stage.view);
  const feed = useSyncExternalStore(stage.motionFeed.subscribe, stage.motionFeed.view);
  const [shown, setShown] = useState<Shown | null>(null);
  const change = useRef<{ previous: BackgroundLayer | null; at: number } | null>(null);
  const armed = useRef<{ ms: number; until: number } | null>(null);
  const held = useRef<{ key: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const seen = useRef(feed.seq);
  const counter = useRef(0);
  const element = useRef<HTMLDivElement | null>(null);
  const budget = useRef(view.motion);
  budget.current = view.motion;
  const authored = useRef(feed.backgrounds);
  authored.current = feed.backgrounds;
  const show = useCallback((previous: BackgroundLayer | null, ms: number | null) => {
    if (!previous || ms === 0) return null;
    const key = ++counter.current;
    setShown({ key, layer: previous, ms });
    return key;
  }, []);
  const release = useCallback((ms: number) => {
    const hold = held.current;
    if (!hold) return false;
    clearTimeout(hold.timer);
    held.current = null;
    setShown((current) => (current?.key === hold.key ? { ...current, ms } : current));
    return true;
  }, []);
  useEffect(() => watchBackgroundLayer((previous, next) => {
    const now = Date.now();
    const pending = armed.current;
    armed.current = null;
    if (pending && now <= pending.until) return void show(previous, pending.ms);
    if (budget.current.transitions !== "none" && next && layerNamesAuthored(next.image, authored.current)) {
      release(RELEASE_MS);
      const key = show(previous, null);
      if (key !== null) held.current = { key, timer: setTimeout(() => release(RELEASE_MS), HOLD_MS) };
      return;
    }
    change.current = { previous, at: now };
  }), [release, show]);
  useEffect(() => () => { if (held.current) clearTimeout(held.current.timer); }, []);
  useEffect(() => {
    if (feed.seq === seen.current) return;
    seen.current = feed.seq;
    for (const cue of feed.cues) {
      if (cue.kind !== "background") continue;
      const allowed = budgetedCue(cue, budget.current);
      if (!allowed || allowed.kind !== "background") { release(RELEASE_MS); continue; }
      if (release(allowed.ms)) continue;
      const recent = change.current;
      change.current = null;
      if (recent && Date.now() - recent.at <= RECENT_MS) show(recent.previous, allowed.ms);
      else armed.current = { ms: allowed.ms, until: Date.now() + ARM_MS };
    }
  }, [feed, release, show]);
  useEffect(() => {
    if (!shown || shown.ms === null) return;
    playBackgroundFade(element.current, shown.ms, () => setShown((current) => (current?.key === shown.key ? null : current)));
  }, [shown]);
  if (!shown) return null;
  const { layer } = shown;
  return <div ref={element} key={shown.key} className="so-bg-fade" aria-hidden="true" data-ms={shown.ms ?? "held"}
    style={{ backgroundImage: layer.image, backgroundSize: layer.size, backgroundPosition: layer.position, backgroundRepeat: layer.repeat, filter: layer.filter || undefined }} />;
}
