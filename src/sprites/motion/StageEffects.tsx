import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { SpriteStage } from "../stage";
import type { MotionBudget } from "./budget";
import { budgetedCue, DEFAULT_TRANSITION_COLOR, tensionShade } from "./cues";
import { playPunch, playTransition } from "./player";

const CARD_HOLD_MS = 1800;
const CARD_FADE_MS = 400;

interface Card { key: number; label: string; title: string }

export function StageEffects({ stage, motion }: { stage: SpriteStage; motion: MotionBudget }) {
  const feed = useSyncExternalStore(stage.motionFeed.subscribe, stage.motionFeed.view);
  const shade = motion.vignette ? tensionShade(feed.tension) : 0;
  const vignette = useRef<HTMLDivElement | null>(null);
  const cover = useRef<HTMLDivElement | null>(null);
  const iris = useRef<HTMLDivElement | null>(null);
  const seen = useRef(feed.seq);
  const counter = useRef(0);
  const [color, setColor] = useState(DEFAULT_TRANSITION_COLOR);
  const [card, setCard] = useState<Card | null>(null);
  const budget = useRef(motion);
  budget.current = motion;
  const shadeRef = useRef(shade);
  shadeRef.current = shade;
  useEffect(() => {
    if (feed.seq === seen.current) return;
    seen.current = feed.seq;
    for (const raw of feed.cues) {
      const cue = budgetedCue(raw, budget.current);
      if (!cue) continue;
      if (cue.kind === "transition" && cue.play.kind !== "cut" && cue.play.kind !== "dissolve") {
        setColor(cue.play.color);
        playTransition(cover.current, iris.current, cue.play.kind, cue.play.ms);
      } else if (cue.kind === "punch" && budget.current.punch !== "none") {
        playPunch(vignette.current?.parentElement ?? null, vignette.current, budget.current.punch, shadeRef.current);
      } else if (cue.kind === "chapter") {
        setCard({ key: ++counter.current, label: cue.label, title: cue.title });
      }
    }
  }, [feed]);
  const fadeMs = Math.min(CARD_FADE_MS, motion.maxTransitionMs || CARD_FADE_MS);
  useEffect(() => {
    if (!card) return;
    const timer = setTimeout(() => setCard((current) => (current?.key === card.key ? null : current)), CARD_HOLD_MS + fadeMs * 2);
    return () => clearTimeout(timer);
  }, [card, fadeMs]);
  return <>
    <div ref={vignette} className="so-stage-vignette" data-tension={feed.tension ?? "none"}
      style={{ opacity: shade, transitionDuration: motion.mode === "reduced" ? "150ms" : "2s" }} />
    <div ref={cover} className="so-stage-cover" style={{ backgroundColor: color }} />
    <div ref={iris} className="so-stage-iris" style={{ boxShadow: `0 0 0 200vmax ${color}` }} />
    {card && <div key={card.key} className="so-stage-chapter" data-so="stage-chapter-card" onClick={() => setCard(null)}
      style={{ "--so-card-total": `${CARD_HOLD_MS + fadeMs * 2}ms` } as React.CSSProperties}>
      {card.label && <div className="so-stage-chapter-label">{card.label}</div>}
      <div className="so-stage-chapter-title">{card.title}</div>
    </div>}
  </>;
}
