import type { NormalizedStory } from "@engine/schema";
import type { RuntimeSnapshot } from "@runtime/types";
import { readTransitionSpec, type StageSignals } from "./cues";

type SignalSnapshot = Pick<RuntimeSnapshot, "activeCheckpointId" | "boundary" | "chapters" | "tension">;

export function stageSignals(snapshot: SignalSnapshot, story: NormalizedStory | null, session: string): StageSignals {
  const id = snapshot.activeCheckpointId;
  const effects = id ? story?.checkpointById[id]?.effects : undefined;
  const chapters = snapshot.chapters;
  const sealed = chapters?.records[chapters.records.length - 1];
  const current = chapters && !chapters.ended ? chapters.current : null;
  const label = current ? (current.interlude ? "Interlude" : `Chapter ${current.number}`) : chapters?.ended ? "The end" : null;
  return {
    session, boundary: snapshot.boundary, checkpoint: id, background: effects?.background?.name ?? null, transition: readTransitionSpec(effects?.transition),
    tension: snapshot.tension?.level ?? null, chapters: chapters?.records.length ?? 0, chapterLabel: label, chapterTitle: current?.playerTitle ?? sealed?.playerTitle ?? null,
    chapterCards: story?.display?.chapter_card !== false,
  };
}

export function watchReducedMotion(listener: () => void): () => void {
  if (typeof matchMedia !== "function") return () => undefined;
  const media = matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}
