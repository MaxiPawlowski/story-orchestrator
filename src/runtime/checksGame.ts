import { QUEST_SCOPE_CAP } from "@extraction/scopeSources";
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
      detail: `A read carries at most ${QUEST_SCOPE_CAP} quest keys, active quests first. Left out now: ${dropped.join(", ")}. `
        + "Close or merge quests that run at the same time, or let a transition read the key.",
    } : null;
  },
};

export const GAME_CHECKS: readonly Check[] = [QUEST_SCOPE_CHECK];
