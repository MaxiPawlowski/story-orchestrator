import type { ScoreContext } from "@memory/index";
import type { InjectorHosts } from "./hostPorts";

// v2.3 plan 05. What the memory scorer is told about the turn being generated: the newest thing said,
// which of the cast it names, and where the story is. It reads the host chat directly, so it lives
// beside the other host seams rather than inside the coordinator that happens to call it.

export function buildScoreContext(
  chatHost: InjectorHosts["chat"], input: { boundary: number; rosterNames: string[]; openArcs: string[]; weights?: ScoreContext["weights"] },
): ScoreContext {
  const chat = chatHost.chatRows();
  const turnText = chatHost.lastMessageText();
  const lowerTurn = turnText.toLowerCase();
  return {
    boundary: input.boundary,
    lastMessageId: chat.length - 1,
    turnText,
    turnEntities: input.rosterNames.filter((name) => lowerTurn.includes(name.trim().toLowerCase())),
    openArcs: input.openArcs,
    weights: input.weights,
  };
}
