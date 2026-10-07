import { StoryEngine } from "./engine";
import { parseStoryV2OrThrow, parseStoryV2 } from "./validate";
import { cardReadKeys, cardValues } from "./cardFields";
import { Blackboard } from "./blackboard";
import { deriveScope } from "@extraction/scope";

const raw = {
  format: 2, title: "Synthetic look", description: "A synthetic appearance change.",
  roster: [{ id: "test", name: "Test", card: { fields: { hair: { quality: "hair", visual: true } } } }],
  qualities: [{ key: "hair", type: "string", source: "extractor", rubric: "Current public hair colour, only when it changes." }],
  checkpoints: [{ id: "start", name: "Start", type: "anchor", start: true, objective: "Begin." },
    { id: "change", name: "Change", type: "anchor", objective: "Continue.", effects: { card: { test: { hair: "red" } } } }], transitions: [],
};

test("entry, extraction and manual writes roll back and reopen with their provenance", () => {
  const story = parseStoryV2OrThrow(raw);
  const engine = new StoryEngine(); engine.loadStory(story);
  engine.activateCheckpoint("change", { lastMessageId: 1, chatLength: 2 });
  expect(engine.serialize().blackboard.writerOf?.hair).toEqual({ writer: "card-entry", boundary: 1 });
  engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: [{ q: "hair", v: "blue", source: "extractor" }] });
  engine.commitBoundary({ lastMessageId: 2, chatLength: 3 });
  const afterRead = engine.serialize();
  engine.enqueue({ source: "mechanical", blackboardVersionSum: 0, deltas: [{ q: "hair", v: "green", source: "extractor", writer: "manual" }] });
  engine.commitBoundary({ lastMessageId: 3, chatLength: 4 });
  expect(engine.serialize().blackboard.writerOf?.hair.writer).toBe("manual");
  const reopened = new StoryEngine(); reopened.loadStory(story); reopened.hydrate(engine.serialize(), engine.serializeHistory());
  reopened.rollbackTo(2);
  expect(reopened.serialize()).toEqual(afterRead);
  reopened.rollbackTo(1);
  expect(cardValues(story, reopened.serialize().blackboard.values, "test")).toEqual({ hair: "red" });
  reopened.rollbackTo(0);
  expect(cardValues(story, reopened.serialize().blackboard.values, "test")).toEqual({});
});

test("an unbound or wrongly sourced card-entry write is refused", () => {
  const story = parseStoryV2OrThrow(raw);
  const board = new Blackboard(story);
  expect(board.applyDelta({ q: "hair", v: "red", source: "code", writer: "card-entry" })).toMatchObject({ ok: false, reason: "source mismatch" });
  expect(board.applyDelta({ q: "tension_current", v: 0.5, source: "extractor", writer: "card-entry" })).toMatchObject({ ok: false, reason: "writer not permitted" });
  expect(Array.isArray(parseStoryV2({ ...raw, qualities: [{ ...raw.qualities[0], latching: true }] }))).toBe(true);
});

test("public card fields are read without a gate, but not for an absent member", () => {
  const story = parseStoryV2OrThrow(raw), empty = { values: {}, versions: {}, latched: {} };
  expect(deriveScope(story, "start", empty, [], { owners: ["test"], cursor: 0 }).map((item) => item.key)).toContain("hair");
  expect(deriveScope(story, "start", empty, [], { owners: [], cursor: 0 }).map((item) => item.key)).not.toContain("hair");
});

test("rotation reads all overflow fields despite a fixed priority order", () => {
  const index = Object.fromEntries(Array.from({ length: 30 }, (_, at) => [`key${at}`, { owner: "test", field: `field${at}`, visual: true }]));
  const reads = Array.from({ length: 6 }, (_, at) => cardReadKeys({ cardFieldByQuality: index }, ["test"], at * 4));
  expect(new Set(reads.flat()).size).toBe(30);
  expect(new Set(Array.from({ length: 6 }, () => cardReadKeys({ cardFieldByQuality: index }, ["test"], 0)).flat()).size).toBe(12);
});

test("speaker-first owner order takes the priority slots without starving other members", () => {
  const index = Object.fromEntries(["first", "second", "third"].flatMap((owner) =>
    Array.from({ length: 10 }, (_, at) => [`${owner}${at}`, { owner, field: `field${at}`, visual: true }])));
  const reads = Array.from({ length: 6 }, (_, at) => cardReadKeys({ cardFieldByQuality: index }, ["third", "first", "second"], at * 4));
  expect(reads[0].slice(0, 8)).toEqual(Array.from({ length: 8 }, (_, at) => `third${at}`));
  expect(new Set(reads.flat()).size).toBe(30);
  expect(cardReadKeys({ cardFieldByQuality: index }, ["first", "second"], 0).some((key) => key.startsWith("third"))).toBe(false);
});
