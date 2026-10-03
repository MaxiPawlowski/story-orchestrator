import type { BoundaryLogEntry, NormalizedStoryV2, StoryDisplay } from "@engine/index";
import { isRecord } from "@utils/guards";
import { composeChapterCards, type ChapterCard } from "./chapterCards";
import { defaultPresenceSettings, presenceShown, type PresenceSettings, type PresenceShown } from "./displayToggles";
import { continueRows, type ContinueRow, type PlaysIndex } from "./playsIndex";

export interface PresenceView {
  shown: PresenceShown;
  listBadges: boolean;
  chapterCards: ChapterCard[];
  continueRows: ContinueRow[];
}

export interface PresenceSources {
  story: NormalizedStoryV2 | null;
  settings: PresenceSettings | undefined;
  boundaryLog: readonly BoundaryLogEntry[];
  plays: PlaysIndex;
  library: ReadonlyArray<{ id: string; raw: Record<string, unknown> }>;
}

export const libraryDisplay = (raw: Record<string, unknown> | undefined): StoryDisplay | null => (raw && isRecord(raw.display) ? raw.display as StoryDisplay : null);

export function buildPresence({ story, settings, boundaryLog, plays, library }: PresenceSources): PresenceView {
  const install = settings ?? defaultPresenceSettings();
  const shown = presenceShown(story?.display, install);
  const displays = new Map(library.map((record) => [record.id, libraryDisplay(record.raw)]));
  return {
    shown,
    listBadges: install.listBadges,
    chapterCards: shown.chapterCard ? composeChapterCards(story, boundaryLog) : [],
    continueRows: continueRows(plays, (storyId) => displays.get(storyId), install.continueList),
  };
}
