import type { Check } from "./checks";

export const TAVERNOS_CHECKS: readonly Check[] = [
  {
    id: "tavernos-rewrites-requests", area: "extension", scope: "story", audience: "player", severity: "info", feature: "memory",
    detect: (snapshot) => (snapshot.tavernOsRewrites ? {
      consequence: "TavernOS HUD changes every request sent to the model, the story's own included, so what the story reads and what characters are told can differ from the chat you see.",
      detail: "TavernOS HUD is installed and enabled. It replaces SillyTavern's fetch and rewrites the body of every text-generation request, other extensions' too: "
        + "earlier [HUD] blocks in the history become one-line summaries, and each character reply's request gets an extra system message that changes every turn. "
        + "The story's memory reads then see the rewritten history, and Story Orchestrator cannot filter it. Disable TavernOS HUD in SillyTavern's extensions (and reload) while this story plays.",
      player: "TavernOS HUD changes every message sent to the model, the story's included, so the story may read something other than the chat you see. "
        + "Disable it in SillyTavern's extensions while this story plays.",
    } : null),
  },
];
