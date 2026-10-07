import type { GuideTopicId } from "@copilot/guideTopics";
import type { StudioTab } from "./StudioModal";

export const STUDIO_TAB_GUIDE: Partial<Record<StudioTab, readonly GuideTopicId[]>> = {
  story: ["story-basics", "briefing", "requirements", "arc-template", "arc-bridges", "stagecraft", "lore-select", "scene-read", "house-rules", "chapters", "presentation"],
  qualities: ["qualities", "quality-rubric", "latching", "quality-reads", "chance-roll"],
  checkpoints: [
    "checkpoints", "objective-agency", "open-stretches", "tension", "guidance", "drives-motives", "author-note", "world-info", "preset", "background", "scenario", "cast-changes",
    "opening-scene", "npc-replies", "talk-control", "convergence", "experimental-effects",
  ],
  transitions: ["gates", "transitions", "convergence"],
  roster: ["roster", "drives-motives", "opening-scene"],
};
