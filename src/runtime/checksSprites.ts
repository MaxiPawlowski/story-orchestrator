import type { Check } from "./checks";

export const SPRITE_STAGE_TARGET_ID = "so-sprite-cast";

export const BUILT_IN_EXPRESSIONS_PLAYER = "SillyTavern's own Character Expressions is on too. While the story's sprites show, its picture is hidden; "
  + "it comes back whenever the sprites are not showing. Switch one of them off to keep only the other.";

export const SPRITE_DEGRADE_CHECKS: readonly Check[] = [
  {
    id: "stage-pack-missing", area: "image", scope: "story", audience: "author", severity: "degrades", feature: "sprites",
    detect: (snapshot) => {
      const issues = snapshot.spriteStage?.packIssues ?? [];
      return issues.length ? {
        consequence: "A character the story puts on the sprite stage has no sprites to show, so they are missing from it or keep another face.",
        detail: issues.map((issue) => `${issue.name}: ${issue.reason}`).join(" · "),
        target: { kind: "setting", id: SPRITE_STAGE_TARGET_ID },
      } : null;
    },
  },
];

export const SPRITE_INFO_CHECKS: readonly Check[] = [
  {
    id: "sprites-builtin-expressions", area: "image", scope: "install", audience: "player", severity: "info", feature: "sprites",
    detect: (snapshot) => (snapshot.spriteStage?.builtInExpressions ? {
      consequence: "SillyTavern's Character Expressions and the Story Orchestrator sprite stage are both on, so SillyTavern's expression picture is hidden while the stage shows.",
      detail: "Both show character sprites. While the stage shows for a story with sprites, SillyTavern's expression image and its Visual Novel sprites are hidden; "
        + "they come back when the stage is not showing. Nothing in SillyTavern's settings is changed. To keep only one, switch Character Expressions off under "
        + "Extensions › Manage extensions, or switch the sprite stage off.",
      player: BUILT_IN_EXPRESSIONS_PLAYER,
      target: { kind: "st-extensions" },
    } : null),
  },
];
