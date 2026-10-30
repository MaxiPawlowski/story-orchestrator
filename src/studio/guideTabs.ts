import type { GuideTopicId } from "@copilot/guideTopics";
import type { StudioTab } from "./StudioModal";

export const STUDIO_TAB_GUIDE: Partial<Record<StudioTab, readonly GuideTopicId[]>> = {
  features: ["feature-policies", "codex", "codex-returns", "observations"],
  story: ["story-basics", "briefing", "player", "requirements", "arc-template", "living-director", "scene-test", "branching"],
  world: ["stagecraft", "lore-select", "lore-entries", "lore-content"],
  presentation: ["presentation", "visual-packs", "story-polish", "background", "stage-transition"],
  rules: ["arc-bridges", "scene-read", "house-rules"],
  chapters: ["chapters", "consequences", "outcome", "carry-from"],
  qualities: ["qualities", "quality-rubric", "latching", "quality-reads", "chance-roll"],
  checkpoints: [
    "checkpoints", "objective-agency", "open-stretches", "tension", "guidance", "drives-motives", "author-note", "world-info", "preset", "background", "stage-transition", "scenario",
    "cast-changes",
    "opening-scene", "npc-replies", "talk-control", "talk-pacing", "convergence", "experimental-effects",
  ],
  transitions: ["gates", "transitions", "convergence"],
  roster: ["roster", "roster-polish", "drives-motives", "inner-voice", "opening-scene", "character-life", "factions", "relationship-labels", "commitments", "cues", "topics",
    "story-time", "living-cards", "poses"],
  sprites: ["poses"],
  game: ["quests", "checks", "offers", "widgets", "clues-and-maps", "html-panels", "widget-scene", "display-narrate", "display-warn", "rumors", "patterns", "norms", "echoes"],
};
