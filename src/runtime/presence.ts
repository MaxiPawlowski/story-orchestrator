import type { BoundaryLogEntry, NormalizedStoryV2, StoryDisplay } from "@engine/index";
import { isRecord } from "@utils/guards";
import { composeChapterCards, type ChapterCard } from "./chapterCards";
import { defaultPresenceSettings, presenceShown, type PresenceSettings, type PresenceShown } from "./displayToggles";
import { continueRows, type ContinueRow, type PlaysIndex } from "./playsIndex";
import type { RollRecord } from "./rolls";

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

export interface InlinePresence {
  cards: Record<number, ChapterCard[]>;
  rolls: Record<number, RollRecord[]>;
}

export const ROLL_CHIP_LEVEL = 2;

const byMessage = <T extends { messageId: number }>(items: readonly T[]): Record<number, T[]> => {
  const grouped: Record<number, T[]> = {};
  for (const item of items) if (Number.isFinite(item.messageId) && item.messageId >= 0) (grouped[item.messageId] ??= []).push(item);
  return grouped;
};

export function inlinePresence(level: number, authorView: boolean, presence: PresenceView | undefined, rolls: readonly RollRecord[] | undefined): InlinePresence {
  if (!presence || level < 1) return { cards: {}, rolls: {} };
  const author = authorView && level >= ROLL_CHIP_LEVEL && presence.shown.rollChips;
  const shown = author ? rolls ?? [] : (rolls ?? []).filter((roll) => presence.shown.rollChips && roll.source === "check" && roll.narrate).map(({ detail: _detail, ...roll }) => roll);
  return { cards: byMessage(presence.chapterCards), rolls: byMessage(shown) };
}
