import { SCOPE_EXTRA_TOKENS } from "@extraction/scopeBudget";
import { QUEST_SCOPE_CAP, REL_AXES_PER_READ, REL_ROTATION_READS } from "@extraction/scopeSources";
import type { Check } from "./checks";

export const QUEST_SCOPE_CHECK: Check = {
  id: "quest-scope-overflow",
  area: "quest",
  scope: "story",
  audience: "author",
  severity: "degrades",
  feature: "quests",
  detect: (snapshot) => {
    const dropped = snapshot.gameAuthor?.scopeOverflow ?? [];
    return dropped.length ? {
      consequence: "Some quest steps are not read this turn, so the story can miss the moment the player does them.",
      detail: `A read carries at most ${QUEST_SCOPE_CAP} quest keys, active quests first, and about ${SCOPE_EXTRA_TOKENS} tokens of questions beyond the character fields it reads. `
        + `Left out now: ${dropped.join(", ")}. `
        + "Close or merge quests that run at the same time, or let a transition read the key.",
    } : null;
  },
};

export const RELATIONSHIP_SCOPE_CHECK: Check = {
  id: "relationship-scope-overflow",
  area: "characters",
  scope: "story",
  audience: "author",
  severity: "degrades",
  feature: "character-life",
  detect: (snapshot) => {
    const dropped = snapshot.lifeAuthor?.scopeOverflow ?? [];
    return dropped.length ? {
      consequence: "Some feelings or moods are not read this turn, so a character can keep an old feeling a little longer.",
      detail: `A read carries at most ${REL_AXES_PER_READ} feelings and moods, the speaker's first, and about ${SCOPE_EXTRA_TOKENS} tokens of questions beyond the character fields it reads; `
        + `active quests come first and the others take turns, each present pair at least once every ${REL_ROTATION_READS} reads while the budget holds them. Left out now: ${dropped.join(", ")}. `
        + "Give fewer axes to characters who share a scene, or keep side characters' feelings toward the player only.",
    } : null;
  },
};

export const GAME_CHECKS: readonly Check[] = [QUEST_SCOPE_CHECK, RELATIONSHIP_SCOPE_CHECK];
