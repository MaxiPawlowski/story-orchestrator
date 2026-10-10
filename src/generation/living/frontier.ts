import { isLivingId, type Chapter, type NormalizedStoryV2, type StoryLiving } from "@engine/index";
import { LIVING_CHAPTER_PREFIX } from "./types";

export interface LivingFrontier {
  frontierId: string;
  ahead: number;
}

export const livingHorizon = (living: StoryLiving): number => living.horizon ?? 1;

export const livingAutonomy = (story: NormalizedStoryV2): "suggest" | "auto" => {
  const living = story.living;
  if (!living) return "auto";
  if (living.autonomy) return living.autonomy;
  return living.authored_until ? "suggest" : "auto";
};

const isFinalAnchor = (story: NormalizedStoryV2, id: string): boolean => {
  const chapter = story.chapterByCheckpoint?.[id];
  return Boolean(chapter && story.chapterById?.[chapter]?.final);
};

export const isEligibleFrontier = (story: NormalizedStoryV2, id: string): boolean => {
  const living = story.living;
  const checkpoint = story.checkpointById[id];
  if (!living || checkpoint?.type !== "anchor") return false;
  if ((story.outgoingByCheckpoint[id] ?? []).length > 0 || isFinalAnchor(story, id)) return false;
  if (isLivingId(id)) return true;
  return living.authored_until ? id === living.authored_until : true;
};

export function findFrontier(story: NormalizedStoryV2, activeId: string): LivingFrontier | null {
  const living = story.living;
  if (!living || !story.checkpointById[activeId]) return null;
  const reachable = story.reachableByCheckpoint[activeId] ?? [];
  const ahead = reachable.filter((id) => id !== activeId && story.checkpointById[id]?.type === "anchor").length;
  if (ahead >= livingHorizon(living)) return null;
  const order = [activeId, ...reachable.filter((id) => id !== activeId)];
  const frontierId = order.find((id) => isEligibleFrontier(story, id));
  return frontierId ? { frontierId, ahead } : null;
}

export const livingChapters = (story: NormalizedStoryV2): Chapter[] => (story.chapters ?? []).filter((chapter) => chapter.id.startsWith(LIVING_CHAPTER_PREFIX));
