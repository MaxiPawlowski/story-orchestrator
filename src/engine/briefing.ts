import type { BriefingSection, Chapter, StoryBriefing, StoryV2 } from "./schema";

export const BRIEFING_START_LABEL = "Begin";
export const BRIEFING_INTRO_HEADING = "About this story";

export interface BriefingView {
  title: string;
  image: string | null;
  tone: string | null;
  sections: BriefingSection[];
  startLabel: string;
  source: "authored" | "intro";
  chapterId: string | null;
}

type BriefingStory = Pick<StoryV2, "title" | "player_intro" | "briefing" | "chapters">;

const viewOf = (briefing: StoryBriefing, title: string, chapterId: string | null): BriefingView => ({
  title: briefing.title ?? title,
  image: briefing.image ?? null,
  tone: briefing.tone ?? null,
  sections: briefing.sections,
  startLabel: briefing.start_label ?? BRIEFING_START_LABEL,
  source: "authored",
  chapterId,
});

export const composeBriefing = (story: BriefingStory | null): BriefingView | null => {
  if (!story) return null;
  if (story.briefing?.sections.length) return viewOf(story.briefing, story.title, null);
  const intro = story.player_intro?.trim();
  return intro
    ? { title: story.title, image: null, tone: null, sections: [{ heading: BRIEFING_INTRO_HEADING, text: intro }], startLabel: BRIEFING_START_LABEL, source: "intro", chapterId: null }
    : null;
};

const chapterTitle = (chapter: Chapter) => chapter.player_title ?? chapter.title;

export const composeChapterBriefing = (story: BriefingStory | null, chapterId: string | null | undefined): BriefingView | null => {
  const chapter = chapterId ? story?.chapters?.find((entry) => entry.id === chapterId) : undefined;
  return chapter?.briefing?.sections.length ? viewOf(chapter.briefing, chapterTitle(chapter), chapter.id) : null;
};

export type StoryKind = "saga" | "story";

export const SAGA_MIN_CHAPTERS = 2;

export const storyKind = (story: { chapters?: readonly unknown[] } | null | undefined): StoryKind =>
  ((story?.chapters?.length ?? 0) >= SAGA_MIN_CHAPTERS ? "saga" : "story");

export const briefingParagraphs = (text: string): string[] => text.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
