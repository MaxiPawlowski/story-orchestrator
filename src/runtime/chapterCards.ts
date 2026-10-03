import { composeChapterBriefing, type BoundaryLogEntry, type BriefingView, type Chapter, type NormalizedStoryV2 } from "@engine/index";

export interface ChapterCard {
  messageId: number;
  chapterId: string;
  title: string;
  number: number | null;
  interlude: boolean;
  final: boolean;
  briefing?: BriefingView;
}

const chapterOfCheckpoint = (story: NormalizedStoryV2, checkpointId: string): Chapter | null => {
  const id = story.chapterByCheckpoint?.[checkpointId] ?? story.checkpointById[checkpointId]?.chapter;
  return id ? story.chapterById?.[id] ?? story.chapters?.find((chapter) => chapter.id === id) ?? null : null;
};

const numberOf = (story: NormalizedStoryV2, chapter: Chapter): number | null => {
  if (chapter.kind === "interlude") return null;
  const numbered = (story.chapters ?? []).filter((entry) => entry.kind !== "interlude");
  const index = numbered.findIndex((entry) => entry.id === chapter.id);
  return index < 0 ? null : index + 1;
};

const card = (story: NormalizedStoryV2, chapter: Chapter, messageId: number): ChapterCard => {
  const briefing = composeChapterBriefing(story, chapter.id);
  return {
    messageId, chapterId: chapter.id, title: chapter.player_title ?? chapter.title, number: numberOf(story, chapter),
    interlude: chapter.kind === "interlude", final: chapter.final === true, ...(briefing ? { briefing } : {}),
  };
};

export function composeChapterCards(story: NormalizedStoryV2 | null, log: readonly BoundaryLogEntry[]): ChapterCard[] {
  if (!story?.chapters?.length) return [];
  const cards: ChapterCard[] = [];
  const first = log[0];
  if (first && first.before.boundary === 0) {
    const opening = chapterOfCheckpoint(story, first.before.activeCheckpointId);
    if (opening) cards.push(card(story, opening, 0));
  }
  for (const entry of log) {
    if (entry.before.activeCheckpointId === entry.after.activeCheckpointId) continue;
    const from = chapterOfCheckpoint(story, entry.before.activeCheckpointId);
    const to = chapterOfCheckpoint(story, entry.after.activeCheckpointId);
    if (to && to.id !== from?.id) cards.push(card(story, to, entry.context.lastMessageId));
  }
  return cards;
}
