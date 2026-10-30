import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { watchBackgroundLayer, type BackgroundLayer } from "@services/stHost/backgrounds";
import type { SpriteStage } from "../stage";
import { budgetedCue } from "./cues";
import { playBackgroundFade } from "./player";

const RECENT_MS = 2500;
const ARM_MS = 4000;

interface Shown { key: number; layer: BackgroundLayer; ms: number }

export function BackgroundFade({ stage }: { stage: SpriteStage }) {
  const view = useSyncExternalStore(stage.subscribe, stage.view);
  const feed = useSyncExternalStore(stage.motionFeed.subscribe, stage.motionFeed.view);
  const [shown, setShown] = useState<Shown | null>(null);
  const change = useRef<{ previous: BackgroundLayer | null; at: number } | null>(null);
  const armed = useRef<{ ms: number; until: number } | null>(null);
  const seen = useRef(feed.seq);
  const counter = useRef(0);
  const element = useRef<HTMLDivElement | null>(null);
  const budget = useRef(view.motion);
  budget.current = view.motion;
  const show = useCallback((previous: BackgroundLayer | null, ms: number) => {
    if (previous && ms > 0) setShown({ key: ++counter.current, layer: previous, ms });
  }, []);
  useEffect(() => watchBackgroundLayer((previous) => {
    const now = Date.now();
    const pending = armed.current;
    armed.current = null;
    if (pending && now <= pending.until) return show(previous, pending.ms);
    change.current = { previous, at: now };
  }), [show]);
  useEffect(() => {
    if (feed.seq === seen.current) return;
    seen.current = feed.seq;
    for (const cue of feed.cues) {
      const allowed = cue.kind === "background" ? budgetedCue(cue, budget.current) : null;
      if (!allowed || allowed.kind !== "background") continue;
      const recent = change.current;
      change.current = null;
      if (recent && Date.now() - recent.at <= RECENT_MS) show(recent.previous, allowed.ms);
      else armed.current = { ms: allowed.ms, until: Date.now() + ARM_MS };
    }
  }, [feed, show]);
  useEffect(() => {
    if (!shown) return;
    playBackgroundFade(element.current, shown.ms, () => setShown((current) => (current?.key === shown.key ? null : current)));
  }, [shown]);
  if (!shown) return null;
  const { layer } = shown;
  return <div ref={element} key={shown.key} className="so-bg-fade" aria-hidden="true" data-ms={shown.ms}
    style={{ backgroundImage: layer.image, backgroundSize: layer.size, backgroundPosition: layer.position, backgroundRepeat: layer.repeat, filter: layer.filter || undefined }} />;
}
