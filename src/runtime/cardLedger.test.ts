import { StoryEngine, parseStoryV2OrThrow } from "@engine/index";
import { cardLedgerView } from "./cardLedger";

test("the author ledger follows card entry, later reads and rollback without a second store", () => {
  const story = parseStoryV2OrThrow({ format: 2, title: "Card mirror", description: "A synthetic field change.",
    roster: [{ id: "arin", name: "Arin", card: { fields: { hair: { quality: "hair", visual: true } } } }],
    qualities: [{ key: "hair", type: "string", source: "extractor", rubric: "Current hair colour." }],
    checkpoints: [{ id: "start", name: "Start", type: "anchor", start: true, objective: "Begin." },
      { id: "change", name: "Change", type: "anchor", objective: "Continue.", effects: { card: { arin: { hair: "red" } } } }], transitions: [] });
  const engine = new StoryEngine(); engine.loadStory(story);
  const ordinary = [{ entity: "Arin", field: "hair", value: "old claim", bound: false, turn: 0 }];
  expect(cardLedgerView(story, engine.serialize(), ordinary)).toEqual(ordinary);
  engine.activateCheckpoint("change", { lastMessageId: 1, chatLength: 2 });
  expect(cardLedgerView(story, engine.serialize(), ordinary)).toEqual([
    { entity: "Arin", field: "hair", value: "red", bound: true, turn: 1, cardWriter: "authored" },
  ]);
  engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: [{ q: "hair", v: "blue", source: "extractor" }] });
  engine.commitBoundary({ lastMessageId: 2, chatLength: 3 });
  expect(cardLedgerView(story, engine.serialize(), ordinary)[0]).toMatchObject({ value: "blue", cardWriter: "read" });
  engine.rollbackTo(1);
  expect(cardLedgerView(story, engine.serialize(), ordinary)[0]).toMatchObject({ value: "red", cardWriter: "authored" });
  expect(cardLedgerView(null, null, ordinary)).toBe(ordinary);
});
