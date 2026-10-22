import { SCOPE_EXTRA_TOKENS } from "@extraction/scopeBudget";
import { DISCOVERY_SCOPE_CAP, QUEST_SCOPE_CAP, REL_AXES_PER_READ, REL_ROTATION_READS } from "@extraction/scopeSources";
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

export const DISCOVERY_SCOPE_CHECK: Check = {
  id: "discovery-scope-overflow",
  area: "quest",
  scope: "story",
  audience: "author",
  severity: "degrades",
  feature: "codex",
  detect: (snapshot) => {
    const dropped = snapshot.gameAuthor?.discoveryOverflow ?? [];
    return dropped.length ? {
      consequence: "Some People and Places lines wait an extra turn to be read, so the page can learn a little late.",
      detail: `A read carries at most ${DISCOVERY_SCOPE_CAP} codex keys, people and places not yet known first, and the rest take turns. Left out now: ${dropped.join(", ")}. `
        + "Gate facts on checkpoints (reached) or on keys a transition already reads, or split a crowded page.",
    } : null;
  },
};

export const SAME_CHARACTER_CHECK: Check = {
  id: "same-character",
  area: "characters",
  scope: "chat",
  audience: "author",
  severity: "info",
  feature: "memory",
  detect: (snapshot) => {
    const names = snapshot.sameCharacter ?? [];
    return names.length ? {
      consequence: "Memory keeps these names apart from every cast member, so what it learns about them is filed separately.",
      detail: `Seen in three or more reads, matching no cast member: ${names.join(", ")}. Same character? `
        + "Add the name to that member's roster aliases (or their People page aliases) in the Studio to merge from now on; dismiss to keep them apart. Nothing is merged on its own.",
    } : null;
  },
};

export const PATTERNS_UNAVAILABLE_CHECK: Check = {
  id: "patterns-unavailable",
  area: "quest",
  scope: "story",
  audience: "player",
  severity: "degrades",
  feature: "story-patterns",
  detect: (snapshot) => (snapshot.patternsUnavailable ? {
    consequence: "This story's callback lines may not appear, because the part that notices its patterns did not load.",
    detail: "The patterns kit was missing for a recent turn, so those turns were not matched and are recorded as a gap (Author › Patterns). Reload the page; turns already played stay unmatched.",
    player: "Some of this story's \"what changed\" lines may be missing. Reloading the page usually fixes it.",
  } : null),
};

export const GAME_CHECKS: readonly Check[] = [QUEST_SCOPE_CHECK, RELATIONSHIP_SCOPE_CHECK, DISCOVERY_SCOPE_CHECK, SAME_CHARACTER_CHECK, PATTERNS_UNAVAILABLE_CHECK];
