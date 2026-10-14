import type { CodexView, GameView } from "@runtime/gameTypes";
import { sampleGame } from "../widgets/gameViewFixtures";

export const sampleCodex = (): CodexView => ({
  people: [
    { name: "The ferryman", fresh: true, facts: [
      { text: "Runs the night crossing.", fresh: false, from: "At The landing" },
      { text: "Owes money to someone upriver.", fresh: true, from: "From The innkeeper" },
    ] },
    { name: "The innkeeper", fresh: false, facts: [{ text: "Keeps the ledger behind the bar.", fresh: false }] },
  ],
  places: [{ name: "The boathouse", fresh: false, facts: [{ text: "The back door does not lock.", fresh: false }] }],
});

export const codexGame = (codex: CodexView | undefined = sampleCodex()): GameView => ({ ...sampleGame(), ...(codex ? { codex } : {}) });
