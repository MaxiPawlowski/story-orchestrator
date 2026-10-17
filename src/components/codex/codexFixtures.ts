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

export const labelledPeople = (): CodexView["people"] => [
  { name: "The ferryman", fresh: true, facts: [{ text: "Runs the night crossing.", fresh: false }], rows: [
    { text: "Toward you: wary", kind: "label" },
    { text: "Learned: secretly loyal to you", kind: "learned", fresh: true },
  ] },
  { name: "Mara", fresh: false, facts: [], rows: [{ text: "Toward Tom: rivals", kind: "label" }] },
];

export const returnPlaces = (): CodexView["places"] => [
  { name: "The boathouse", fresh: false, facts: [{ text: "The back door does not lock.", fresh: false }], rows: [
    { text: "The back door still hangs off one hinge.", kind: "return", fresh: true },
    { text: "Someone has mended the cut nets.", kind: "return" },
  ] },
];

export const promisedPeople = (): CodexView["people"] => [
  { name: "Mara", fresh: true, facts: [], rows: [
    { text: "Promised you: get past the north gate together (open)", kind: "promised", fresh: true },
    { text: "Promised you: repay the debt from the river (kept)", kind: "promised" },
  ] },
];

export const codexGame = (codex: CodexView | null = sampleCodex()): GameView => ({ ...sampleGame(), ...(codex ? { codex } : {}) });
