import type { StoryV2 } from "@engine/index";

type ChapterCode = "chapter-missing" | "chapter-unknown" | "chapter-unreachable" | "chapter-no-exit" | "chapter-reentry" | "story-dead-end";

export interface ChapterRun {
  draft: StoryV2;
  push: (code: ChapterCode, severity: "blocking" | "warning", path: string, message: string) => void;
  checkpointById: Map<string, StoryV2["checkpoints"][number]>;
  reachableFrom: (start: string) => Set<string>;
  startId: string;
}

// Chapter order is declaration order, so going back to an earlier chapter is a re-entry, and a chapter
// the story can leave only by ending must say it is the last one.
export const checkChapters = (run: ChapterRun) => {
  const { draft, push, reachableFrom, startId } = run;
  const chapters = draft.chapters ?? [];
  if (!chapters.length) return;
  const order = new Map(chapters.map((chapter, index) => [chapter.id, index]));
  const chapterOf = (id: string) => run.checkpointById.get(id)?.chapter;
  draft.checkpoints.forEach((checkpoint, index) => {
    const path = `checkpoints.${index}.chapter`;
    if (!checkpoint.chapter) push("chapter-missing", "blocking", path, `checkpoint '${checkpoint.id}' names no chapter`);
    else if (!order.has(checkpoint.chapter)) push("chapter-unknown", "blocking", path, `checkpoint '${checkpoint.id}' names undeclared chapter '${checkpoint.chapter}'`);
  });
  const reachable = new Set([startId, ...reachableFrom(startId)]);
  const leaves = (id: string) => draft.transitions.some((transition) => chapterOf(transition.from) === id && chapterOf(transition.to) !== id);
  const hasExit = (checkpointId: string) => draft.transitions.some((transition) => transition.from === checkpointId);
  chapters.forEach((chapter, index) => {
    const members = draft.checkpoints.filter((checkpoint) => checkpoint.chapter === chapter.id);
    const path = `chapters.${index}`;
    if (!members.some((checkpoint) => reachable.has(checkpoint.id))) push("chapter-unreachable", "warning", path, `no checkpoint of chapter '${chapter.id}' is reachable from the start`);
    else if (!chapter.final && !leaves(chapter.id)) push("chapter-no-exit", "warning", path, `no transition leaves chapter '${chapter.id}', and it is not final`);
  });
  draft.transitions.forEach((transition, index) => {
    const from = order.get(chapterOf(transition.from) ?? "");
    const to = order.get(chapterOf(transition.to) ?? "");
    if (from !== undefined && to !== undefined && to < from) push("chapter-reentry", "warning", `transitions.${index}`, `'${transition.from}' leads back into earlier chapter '${chapters[to].id}'`);
  });
  draft.checkpoints.forEach((checkpoint, index) => {
    const chapter = chapters[order.get(checkpoint.chapter ?? "") ?? -1];
    if (!chapter || chapter.final || hasExit(checkpoint.id)) return;
    push("story-dead-end", "warning", `checkpoints.${index}`, `checkpoint '${checkpoint.id}' has no way on and chapter '${chapter.id}' is not final`);
  });
};
