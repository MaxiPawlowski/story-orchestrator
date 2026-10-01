import { assembleChapterInput, type ChapterInput } from "./chapterInput";
import { foldChapter, foldsAtSeal } from "./chapterFold";
import { parseChapterRecord, verifyChapterRecord, degradedChapterRecord } from "./chapterRecord";
import { chaptersFrom, unfoldAt, unfoldChapters } from "./chapterUnfold";
import { CHRONICLE_BUDGET_ARMS, DEFAULT_CHRONICLE_TOKENS, eraCandidates, renderChronicle } from "./chronicle";
import { selectCanonFacts } from "./entities";
import type { ArcEntry, ChapterRecord, MemoryEntry } from "./types";

const entry = (id: string, patch: Partial<MemoryEntry>): MemoryEntry => ({
  id, tier: "facts", text: `text ${id}`, type: "fact", importance: 2, expiration: "permanent", entities: [], confidence: 1,
  activationTriggers: [], evidence: "", createdAt: 0, recallCount: 0, ...patch,
}) as MemoryEntry;

const arc = (id: string, patch: Partial<ArcEntry>): ArcEntry => ({ id, text: `arc ${id}`, status: "open", entities: [], openedAt: 0, ...patch });

const record = (id: string, patch: Partial<ChapterRecord> = {}): ChapterRecord => ({
  id, chapterId: id, part: 1, title: `Title ${id}`, playerTitle: `Chapter ${id}`, range: { from: 0, to: 9 }, boundaries: { from: 0, to: 3 },
  checkpoints: [], summary: `The long account of ${id}. `.repeat(20).trim(), short: `${id} in brief.`, consequences: [], people: [], open: [],
  blackboardDelta: {}, blackboardAt: {}, status: "sealed", provenance: { source: "code" } as ChapterRecord["provenance"],
  tokens: { summary: 0, short: 0 }, sealedAt: { boundary: 3, messageId: 9, at: 0, pathLength: 2 }, ...patch,
});

const input = (): ChapterInput => assembleChapterInput({
  range: { from: 0, to: 9 },
  entries: [
    entry("s1", { tier: "scene_history", text: "Mara and Kael reached Harrowgate at dusk.", messageId: 2 }),
    entry("f1", { text: "Kael lost his sword at the gate.", messageId: 5 }),
    entry("late", { text: "Out of range.", messageId: 20 }),
  ],
  arcs: [arc("a1", { text: "Find the quartermaster", openedMessageId: 1 })],
  ledger: [],
  blackboardBefore: { step: 0 },
  blackboardAfter: { step: 2 },
  places: ["Harrowgate"],
  roster: [{ id: "mara", name: "Mara" }, { id: "kael", name: "Kael" }],
  previous: null,
});

const REPLY = [
  "SUMMARY: Mara and Kael reached Harrowgate at dusk, and Kael lost his sword at the gate.",
  "SHORT: They arrived, and Kael came away unarmed.",
  "CONSEQUENCES:",
  "- Kael is unarmed [src: f1]",
  "PEOPLE:",
  "- Kael: unarmed and sullen",
  "- Stranger: not in the cast",
  "OPEN:",
  "- a1 | carry | still searching",
].join("\n");

describe("chapter record parse and verify", () => {
  it("assembles only in-range sources, with the blackboard change as a citable item", () => {
    expect(input().items.map((item) => item.id)).toEqual(["s1", "f1", "q:step"]);
  });

  it("refuses a reply without SUMMARY or SHORT", () => {
    expect(parseChapterRecord("SHORT: x", input())).toEqual({ ok: false, reason: "no SUMMARY section" });
    expect(parseChapterRecord("SUMMARY: x", input())).toEqual({ ok: false, reason: "no SHORT section" });
  });

  it("keeps cited consequences, cast-only people and known threads", () => {
    const parsed = parseChapterRecord(REPLY, input());
    if (!parsed.ok) throw new Error(parsed.reason);
    expect(parsed.record.consequences).toEqual([{ text: "Kael is unarmed", sources: ["f1"] }]);
    expect(parsed.record.people.map((person) => person.name)).toEqual(["Kael"]);
    expect(parsed.record.open).toEqual([{ arcId: "a1", text: "Find the quartermaster", disposition: "carry" }]);
    expect(verifyChapterRecord(parsed.record, input())).toEqual([]);
  });

  it("names an invented person and a consequence that cites nothing real", () => {
    const planted = REPLY.replace("at dusk,", "at dusk with Ygritte,").replace("[src: f1]", "[src: f9]");
    const parsed = parseChapterRecord(planted, input());
    if (!parsed.ok) throw new Error(parsed.reason);
    expect(verifyChapterRecord(parsed.record, input())).toEqual(["consequence 1 cites no input id that exists", "names not in the inputs: Ygritte"]);
  });

  it("degrades to the scene text and carries every open thread", () => {
    const degraded = degradedChapterRecord(input());
    expect(degraded.summary).toContain("Harrowgate");
    expect(degraded.open).toEqual([{ arcId: "a1", text: "Find the quartermaster", disposition: "carry" }]);
  });
});

describe("fold and unfold", () => {
  const range = { from: 0, to: 9 };
  const sealed = record("c1", { range });

  it("folds scene, session, importance-1 and short-term rows, and keeps held and durable ones", () => {
    const rows = [
      entry("scene", { tier: "scene_history", messageId: 3 }),
      entry("minor", { importance: 1, messageId: 4 }),
      entry("durable", { importance: 3, messageId: 4 }),
      entry("pinned", { tier: "scene_history", messageId: 4, pinned: true }),
      entry("short", { tier: "short_term", messageId: 8 }),
      entry("later", { tier: "scene_history", messageId: 12 }),
    ];
    expect(rows.filter((row) => foldsAtSeal(row, range)).map((row) => row.id)).toEqual(["scene", "minor", "short"]);
  });

  it("round-trips: a rollback before the seal restores every row, arc and the chronicle", () => {
    const state = {
      entries: [entry("scene", { tier: "scene_history", messageId: 3 }), entry("durable", { importance: 3, messageId: 4 })],
      arcs: [arc("open", {}), arc("done", { status: "resolved", resolvedMessageId: 6 }), arc("gone", {})],
      shortTermSummaryEnd: 2,
    };
    const folded = foldChapter(state, sealed, (candidate) => (candidate.id === "gone" ? "abandoned" : "carry"));
    expect(folded.folded).toEqual(["scene", "done"]);
    expect(folded.resolved).toEqual(["gone"]);
    expect(folded.shortTermSummaryEnd).toBe(9);
    const stores = { entries: folded.entries, arcs: folded.arcs, chapters: [sealed], chronicle: { eras: [{ id: "e", recordIds: ["c1"], text: "t", messageId: 9 }] } };
    const back = unfoldAt(stores, 9, []);
    expect(back.entries).toEqual(state.entries);
    expect(back.arcs).toEqual(state.arcs);
    expect(back.chapters).toEqual([]);
    expect(back.chronicle.eras).toEqual([]);
  });

  it("leaves a seal before the cut alone, unless the derived record for it was dropped", () => {
    const records = [sealed, record("c2", { sealedAt: { boundary: 6, messageId: 20, at: 0, pathLength: 4 } })];
    expect([...chaptersFrom(records, 15, [])]).toEqual(["c2"]);
    expect([...chaptersFrom(records, 15, ["c1"])]).toEqual(["c1", "c2"]);
    expect(unfoldChapters({ entries: [], arcs: [], chapters: records, chronicle: { eras: [] } }, new Set()).chapters).toBe(records);
  });
});

describe("chronicle", () => {
  const records = ["a", "b", "c", "d"].map((id) => record(id));

  it("declares the budget arms with 700 as the default", () => {
    expect(CHRONICLE_BUDGET_ARMS).toEqual([400, 700, 1000]);
    expect(DEFAULT_CHRONICLE_TOKENS).toBe(700);
  });

  it("steps the oldest records down to SHORT first and keeps the newest at SUMMARY", () => {
    const wide = renderChronicle(records, [], 100000);
    expect(wide.lines.map((line) => line.form)).toEqual(["summary", "summary", "summary", "summary"]);
    const partial = renderChronicle(records, [], 400);
    expect(partial.lines.map((line) => line.form)).toEqual(["short", "summary", "summary", "summary"]);
    expect(partial.fits).toBe(true);
    const tight = renderChronicle(records, [], 1);
    expect(tight.lines.map((line) => line.form)).toEqual(["short", "short", "short", "summary"]);
    expect(tight.fits).toBe(false);
  });

  it("puts era lines first and leaves the records they cover out", () => {
    const rendered = renderChronicle(records, [{ id: "e1", recordIds: ["a", "b"], text: "Long ago.", messageId: 9 }], 100000);
    expect(rendered.lines.map((line) => line.ids.join(","))).toEqual(["a,b", "c", "d"]);
    expect(rendered.lines[0]).toEqual({ ids: ["a", "b"], form: "era", text: "Earlier: Long ago." });
  });

  it("offers the oldest uncovered records for an era, never the newest", () => {
    expect(eraCandidates(records, [], 5).map((item) => item.id)).toEqual(["a", "b", "c"]);
  });
});

describe("canon fact selection", () => {
  it("keeps pinned and locked facts first, ranks the rest, and returns them in store order", () => {
    const rows = [
      entry("old", { createdAt: 0, importance: 2 }),
      entry("pinned", { createdAt: 0, pinned: true }),
      entry("fresh", { createdAt: 9, importance: 3 }),
      entry("folded", { createdAt: 9, importance: 3, foldedInto: "c1" }),
    ];
    const chosen = selectCanonFacts(rows, 2, { boundary: 10, turnText: "", turnEntities: [] });
    expect(chosen.map((row) => row.id)).toEqual(["pinned", "fresh"]);
  });
});
