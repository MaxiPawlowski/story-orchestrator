import type { Chapter, NormalizedStoryV2 } from "@engine/index";
import type { ChapterRecord } from "@memory/types";

export interface SealTarget {
  chapter: Chapter;
  part: number;
  final: boolean;
}

export const chapterOf = (story: NormalizedStoryV2 | null, checkpointId: string | null | undefined): Chapter | null => {
  const id = checkpointId ? story?.chapterByCheckpoint?.[checkpointId] : undefined;
  return (id && story?.chapterById?.[id]) || null;
};

export const nextPart = (records: readonly ChapterRecord[], chapterId: string): number =>
  records.filter((record) => record.chapterId === chapterId).length + 1;

export const endsStory = (story: NormalizedStoryV2, checkpointId: string): boolean =>
  Boolean(chapterOf(story, checkpointId)?.final) && !(story.outgoingByCheckpoint[checkpointId]?.length);

export const storyEnded = (records: readonly ChapterRecord[]): boolean => records.some((record) => record.final);

// Read from the path, not from the boundary that fired: a seal that never landed (a reload mid-seal,
// a chat switch) is still due at the next boundary, and an interlude is skipped back over so its
// messages join the next chapter's range.
export function sealTarget(story: NormalizedStoryV2 | null, activeCheckpointId: string, records: readonly ChapterRecord[], visitedPath: readonly string[]): SealTarget | null {
  if (!story?.chapters?.length || storyEnded(records)) return null;
  const path = visitedPath.length ? visitedPath : [activeCheckpointId];
  const current = chapterOf(story, path[path.length - 1]);
  let last = path.length - 1;
  while (last >= 0 && chapterOf(story, path[last])?.id === current?.id) last -= 1;
  while (last >= 0 && chapterOf(story, path[last])?.kind === "interlude") last -= 1;
  const left = last >= 0 ? chapterOf(story, path[last]) : null;
  if (left && left.id !== current?.id && !records.some((record) => record.sealedAt.pathLength - 1 > last)) return { chapter: left, part: nextPart(records, left.id), final: false };
  return current && endsStory(story, activeCheckpointId) ? { chapter: current, part: nextPart(records, current.id), final: true } : null;
}

export const sealRange = (records: readonly ChapterRecord[], storyStart: number, to: number) => {
  const previous = records[records.length - 1];
  return { from: previous ? previous.range.to + 1 : Math.max(0, storyStart), to };
};

export const chapterNumber = (story: NormalizedStoryV2 | null, chapterId: string): number =>
  (story?.chapters ?? []).filter((chapter) => chapter.kind !== "interlude").findIndex((chapter) => chapter.id === chapterId) + 1;

export const playerTitleOf = (chapter: Chapter): string => chapter.player_title ?? chapter.title;

export interface ChapterSettings {
  seal: boolean;
  storySoFar: boolean;
  fold: boolean;
  chronicleTokens: number;
  chapterTokens: number;
  threadTokens: number;
  recap: boolean;
  dossierWindow: number;
}

export const DEFAULT_CHAPTER_SETTINGS: ChapterSettings = {
  seal: false, storySoFar: false, fold: false, chronicleTokens: 700, chapterTokens: 500, threadTokens: 150, recap: true, dossierWindow: 12,
};

export const chapterSettings = (stored: Partial<ChapterSettings> | undefined): ChapterSettings => {
  const out = { ...DEFAULT_CHAPTER_SETTINGS };
  (Object.keys(out) as Array<keyof ChapterSettings>).forEach((key) => {
    const value = stored?.[key];
    if (typeof value === typeof out[key] && (typeof value !== "number" || (Number.isFinite(value) && value >= 0))) Object.assign(out, { [key]: value });
  });
  return out;
};

export interface ChapterViewRecord {
  id: string;
  number: number;
  playerTitle: string;
  short: string;
  summary: string;
  final: boolean;
}

export interface ChapterView {
  declared: boolean;
  current: { id: string; number: number; playerTitle: string; interlude: boolean } | null;
  records: ChapterViewRecord[];
  ended: boolean;
  epilogue: string | null;
}

export function buildChapterView(story: NormalizedStoryV2 | null, activeCheckpointId: string | undefined, records: readonly ChapterRecord[] = []): ChapterView {
  const active = chapterOf(story, activeCheckpointId);
  const ending = records.find((record) => record.final);
  return {
    declared: Boolean(story?.chapters?.length),
    current: active ? { id: active.id, number: chapterNumber(story, active.id), playerTitle: playerTitleOf(active), interlude: active.kind === "interlude" } : null,
    records: records.map((record) => ({
      id: record.id, number: chapterNumber(story, record.chapterId), playerTitle: record.playerTitle, short: record.short, summary: record.summary, final: Boolean(record.final),
    })),
    ended: Boolean(ending),
    epilogue: ending?.epilogue ?? null,
  };
}
