import type { StoryDisplay, StoryDisplayToggle } from "@engine/index";
import { isRecord } from "@utils/guards";

export const PRESENCE_TOGGLES = ["continueList", "groupCard", "chapterCard", "wand", "rollChips", "suggestions", "journal", "statSheet", "widgets"] as const;
export type PresenceToggle = (typeof PRESENCE_TOGGLES)[number];

export const STORY_TOGGLE_KEYS: Record<PresenceToggle, StoryDisplayToggle> = {
  continueList: "continue_list",
  groupCard: "group_card",
  chapterCard: "chapter_card",
  wand: "wand",
  rollChips: "roll_chips",
  suggestions: "suggestions",
  journal: "journal",
  statSheet: "stat_sheet",
  widgets: "widgets",
};

export interface PresenceSettings extends Record<PresenceToggle, boolean> {
  listBadges: boolean;
}

export const PRESENCE_SETTING_KEYS = ["listBadges", ...PRESENCE_TOGGLES] as const;

export const defaultPresenceSettings = (): PresenceSettings => ({
  listBadges: true, continueList: true, groupCard: true, chapterCard: true, wand: true, rollChips: true, suggestions: true, journal: true, statSheet: true, widgets: true,
});

export const sanitizePresenceSettings = (value: unknown): PresenceSettings => {
  const source = isRecord(value) ? value : {};
  const on = (key: keyof PresenceSettings) => source[key] !== false;
  return {
    listBadges: on("listBadges"), continueList: on("continueList"), groupCard: on("groupCard"), chapterCard: on("chapterCard"), wand: on("wand"), rollChips: on("rollChips"),
    suggestions: on("suggestions"), journal: on("journal"), statSheet: on("statSheet"), widgets: on("widgets"),
  };
};

export const storyAllows = (display: StoryDisplay | null | undefined, toggle: PresenceToggle): boolean => display?.[STORY_TOGGLE_KEYS[toggle]] !== false;

export const shownFor = (display: StoryDisplay | null | undefined, install: Pick<PresenceSettings, PresenceToggle>, toggle: PresenceToggle): boolean =>
  storyAllows(display, toggle) && install[toggle] === true;

export type PresenceShown = Record<PresenceToggle, boolean>;

export const presenceShown = (display: StoryDisplay | null | undefined, install: Pick<PresenceSettings, PresenceToggle>): PresenceShown =>
  Object.fromEntries(PRESENCE_TOGGLES.map((toggle) => [toggle, shownFor(display, install, toggle)])) as PresenceShown;
