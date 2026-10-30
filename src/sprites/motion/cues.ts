import { TRANSITION_EFFECT_KINDS, type TransitionEffect, type TransitionEffectKind } from "@engine/schema";
import type { MotionBudget } from "./budget";

type StageTransitionKind = TransitionEffectKind;
type StageTransitionSpec = TransitionEffect;

export const DEFAULT_TRANSITION_MS: Record<StageTransitionKind, number> = { dissolve: 600, fade: 1000, wipe: 900, iris: 1000, cut: 0 };
export const DEFAULT_TRANSITION_COLOR = "#000000";
export const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const TENSION_ORDER = ["calm", "stirring", "tense", "critical", "peak"] as const;
const CRITICAL = TENSION_ORDER.indexOf("critical");

export interface StageSignals {
  session: string;
  boundary: number;
  checkpoint: string | null;
  background: string | null;
  transition: StageTransitionSpec | null;
  tension: string | null;
  chapters: number;
  chapterLabel: string | null;
  chapterTitle: string | null;
  chapterCards: boolean;
}

export interface TransitionPlay { kind: StageTransitionKind; ms: number; color: string }

export type StageCue =
  | { kind: "transition"; play: TransitionPlay }
  | { kind: "background"; ms: number }
  | { kind: "punch" }
  | { kind: "chapter"; label: string; title: string };

export function readTransitionSpec(value: unknown): StageTransitionSpec | null {
  const record = typeof value === "string" ? { kind: value } : typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
  if (!record || !(TRANSITION_EFFECT_KINDS as readonly unknown[]).includes(record.kind)) return null;
  const color = typeof record.color === "string" && HEX_COLOR.test(record.color) ? { color: record.color } : {};
  return { kind: record.kind as StageTransitionKind, ...(typeof record.ms === "number" ? { ms: record.ms } : {}), ...color };
}

const tensionRank = (level: string | null): number => (level === null ? -1 : (TENSION_ORDER as readonly string[]).indexOf(level));

export const transitionPlay = (spec: StageTransitionSpec | null): TransitionPlay => {
  const kind = spec?.kind ?? "dissolve";
  return { kind, ms: kind === "cut" ? 0 : spec?.ms ?? DEFAULT_TRANSITION_MS[kind], color: spec?.color ?? DEFAULT_TRANSITION_COLOR };
};

export function stageCues(previous: StageSignals | null, next: StageSignals): StageCue[] {
  if (!previous || previous.session !== next.session || next.boundary <= previous.boundary) return [];
  const cues: StageCue[] = [];
  if (next.checkpoint !== previous.checkpoint && next.checkpoint !== null) {
    const play = transitionPlay(next.transition);
    if (play.kind !== "dissolve" && play.kind !== "cut") cues.push({ kind: "transition", play });
    if (play.kind !== "cut" && next.background !== null && next.background !== previous.background) cues.push({ kind: "background", ms: play.kind === "dissolve" ? play.ms : Math.round(play.ms / 2) });
  }
  if (tensionRank(previous.tension) < CRITICAL && tensionRank(next.tension) >= CRITICAL) cues.push({ kind: "punch" });
  if (next.chapterCards && next.chapters > previous.chapters && next.chapterTitle) cues.push({ kind: "chapter", label: next.chapterLabel ?? "", title: next.chapterTitle });
  return cues;
}

export function budgetedCue(cue: StageCue, budget: MotionBudget): StageCue | null {
  if (budget.mode === "off") return null;
  if (cue.kind === "transition") {
    if (budget.transitions === "none") return null;
    if (budget.transitions === "opacity") return null;
    return { ...cue, play: { ...cue.play, ms: Math.min(cue.play.ms, budget.maxTransitionMs) } };
  }
  if (cue.kind === "background") return budget.transitions === "none" ? null : { ...cue, ms: Math.min(cue.ms, budget.maxTransitionMs) };
  if (cue.kind === "punch") return budget.punch === "none" ? null : cue;
  return budget.chapterCard ? cue : null;
}

export const TENSION_SHADE: Readonly<Record<string, number>> = { calm: 0, stirring: 0.08, tense: 0.18, critical: 0.3, peak: 0.38 };
export const tensionShade = (level: string | null): number => (level === null ? 0 : TENSION_SHADE[level] ?? 0);
