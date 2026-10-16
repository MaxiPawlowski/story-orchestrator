import type { GuideTopicId } from "@copilot/guideTopics";
import type { StudioTab } from "./StudioModal";

export const STUDIO_TAB_GUIDE: Partial<Record<StudioTab, readonly GuideTopicId[]>> = {
  features: ["feature-policies", "codex"],
  story: ["story-basics", "briefing", "player", "requirements", "arc-template", "living-director", "branching"],
  world: ["stagecraft", "lore-select", "lore-entries"],
  presentation: ["presentation", "background"],
  rules: ["arc-bridges", "scene-read", "house-rules"],
  chapters: ["chapters", "consequences", "outcome", "carry-from"],
  qualities: ["qualities", "quality-rubric", "latching", "quality-reads", "chance-roll"],
  checkpoints: [
    "checkpoints", "objective-agency", "open-stretches", "tension", "guidance", "drives-motives", "author-note", "world-info", "preset", "background", "scenario", "cast-changes",
    "opening-scene", "npc-replies", "talk-control", "convergence", "experimental-effects",
  ],
  transitions: ["gates", "transitions", "convergence"],
  roster: ["roster", "drives-motives", "inner-voice", "opening-scene", "character-life", "factions", "relationship-labels", "story-time", "living-cards", "poses"],
  sprites: ["poses"],
  game: ["quests", "checks", "widgets", "clues-and-maps", "html-panels", "rumors"],
};
