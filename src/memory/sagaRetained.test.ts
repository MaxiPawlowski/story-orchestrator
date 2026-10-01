import { recallCandidates, recallMentions, renderRecall, selectRecall } from "./archiveRecall";
import { epistemicTargets, foldEpistemic, leavingCast } from "./chapterFold";
import type { ChapterInputItem } from "./chapterInput";
import { buildChapterMapPrompt, chunkChapterItems, clipChapterInput, expandChapterSources, kindsOf, parseChapterDigest, reduceChapterInput } from "./chapterReduce";
import { unfoldAt, unfoldChapters } from "./chapterUnfold";
import { activeEpistemic, renderPrivateEpistemicBlock } from "./epistemic";
import { reverseMemoryState, type MemoryRollbackState } from "./reverse";
import type { ChapterRecord, EpistemicEntry, MemoryEntry } from "./types";

const entry = (id: string, text: string, entities: string[], foldedInto?: string, extra: Partial<MemoryEntry> = {}) => ({
  id, tier: "facts", type: "fact", text, importance: 2, expiration: "permanent", entities, confidence: 1, activationTriggers: [], evidence: "",
  createdAt: 1, messageId: 1, recallCount: 0, provenance: { source: "extractor", messageId: 1, boundary: 1, pass: "read", validity: "live" },
  ...(foldedInto ? { foldedInto } : {}), ...extra,
}) as unknown as MemoryEntry;

const record = (id: string, playerTitle: string, messageId = 10) => ({ id, chapterId: id.split("#")[0], playerTitle, sealedAt: { messageId, boundary: messageId, at: 0, pathLength: 2 } }) as unknown as ChapterRecord;

const context = { boundary: 20, turnText: "", turnEntities: [] as string[] };

describe("AS-14 D10: archive recall selects folded rows the turn names", () => {
  const entries = [
    entry("a", "Ronan swore an oath to the guild in the old hall", ["Ronan"], "adv#1"),
    entry("b", "Ronan lost his left hand to the wyrm", ["Ronan"], "adv#1"),
    entry("c", "Mara keeps the ledger of debts", ["Mara"], "adv#1"),
    entry("d", "Ronan is in the war camp now", ["Ronan"]),
  ];
  const records = [record("adv#1", "The Guild")];

  it("finds only folded rows whose entity the text names, with a word boundary", () => {
    expect(recallMentions(entries, "Where is Ronan?")).toEqual(["ronan"]);
    expect(recallCandidates(entries, "Where is Ronan?").map((row) => row.id)).toEqual(["a", "b"]);
    expect(recallCandidates(entries, "Ronanda waves")).toEqual([]);
  });

  it("control: a live row is never recalled, and nothing mentioned recalls nothing", () => {
    expect(recallCandidates(entries.map((row) => ({ ...row, foldedInto: undefined })), "Ronan").length).toBe(0);
    expect(recallCandidates(entries, "the weather").length).toBe(0);
  });

  it("ranks by the injection score with keyword overlap, names the chapter, and keeps the bound", () => {
    const lines = selectRecall(recallCandidates(entries, "Ronan, tell me about the wyrm and your hand"), records, { ...context, turnText: "Ronan, tell me about the wyrm and your hand" });
    expect(lines.map((line) => line.entryId)).toEqual(["b", "a"]);
    expect(renderRecall(lines).split("\n")[0]).toBe("Recalled from The Guild: Ronan lost his left hand to the wyrm");
    expect(selectRecall(recallCandidates(entries, "Ronan"), records, context, { tokens: 16 }).length).toBe(1);
    expect(selectRecall(recallCandidates(entries, "Ronan"), records, context, { limit: 1 }).length).toBe(1);
  });

  it("with a vectors band the semantic match wins over keyword overlap", () => {
    const query = "Ronan, tell me about the wyrm and your hand";
    expect(selectRecall(recallCandidates(entries, query), records, { ...context, turnText: query }, { semantic: new Set(["a"]) })[0].entryId).toBe("a");
  });

  it("caps at four lines", () => {
    const many = Array.from({ length: 9 }, (_, index) => entry(`r${index}`, `Ronan fact ${index}`, ["Ronan"], "adv#1"));
    expect(selectRecall(recallCandidates(many, "Ronan"), records, context, { tokens: 10_000 }).length).toBe(4);
  });
});

const item = (id: string, kind: ChapterInputItem["kind"], words = 4): ChapterInputItem => ({ id, kind, text: `${kind} ${id} ${"word ".repeat(words).trim()}` });

describe("AS-14 map-reduce: an oversize seal input loses no category", () => {
  const items = [item("s1", "scene", 40), item("s2", "scene", 40), item("f1", "fact", 40), item("d1", "detail", 40), item("l1", "ledger", 40), item("q:x", "state", 5)];

  it("chunks by fit and never exceeds the chunk cap", () => {
    const byTwo = chunkChapterItems(items, (chunk) => chunk.length <= 2, 10);
    expect(byTwo.map((chunk) => chunk.length)).toEqual([2, 2, 2]);
    const capped = chunkChapterItems(items, (chunk) => chunk.length <= 1, 4);
    expect(capped.length).toBeLessThanOrEqual(4);
    expect(capped.flat().map((row) => row.id)).toEqual(items.map((row) => row.id));
  });

  it("parses the digest lines, keeps only this chunk's ids as sources, and fills any kind the reply dropped", () => {
    const digest = parseChapterDigest("- (scene) The party reached the gate [src: s1, s2, bogus]\n- (fact) junk without a kind", items, 1);
    expect(digest.items[0]).toEqual({ id: "p1.1", kind: "scene", text: "The party reached the gate" });
    expect(digest.sources.get("p1.1")).toEqual(["s1", "s2"]);
    expect([...kindsOf({ items: digest.items } as never)].sort()).toEqual(["detail", "fact", "ledger", "scene", "state"]);
  });

  it("an empty reply still keeps every category, citing the original ids", () => {
    const digest = parseChapterDigest("", items, 2);
    expect([...new Set(digest.items.map((row) => row.kind))].sort()).toEqual(["detail", "fact", "ledger", "scene", "state"]);
    expect(digest.sources.get(digest.items[0].id)).toEqual(["s1", "s2"]);
  });

  it("reduces into one input whose consequences expand back to the original ids", () => {
    const raw = { items, openArcs: [], blackboardDelta: {}, places: [], roster: [], previous: null };
    const reduced = reduceChapterInput(raw, [parseChapterDigest("- (scene) gate [src: s1]", items.slice(0, 2), 1), parseChapterDigest("", items.slice(2), 2)]);
    expect([...kindsOf(reduced.input)].sort()).toEqual(["detail", "fact", "ledger", "scene", "state"]);
    const expanded = expandChapterSources({ summary: "", short: "", consequences: [{ text: "x", sources: ["p1.1", reduced.input.items.find((row) => row.kind === "fact")?.id ?? "", "q:x"] }], people: [], open: [] }, reduced.sources);
    expect(expanded.consequences[0].sources).toEqual(["s1", "f1", "q:x"]);
  });

  it("clipping shortens text and never drops an item", () => {
    const raw = { items, openArcs: [], blackboardDelta: {}, places: [], roster: [], previous: null };
    const clipped = clipChapterInput(raw, (candidate) => candidate.items.reduce((sum, row) => sum + row.text.length, 0) < 600);
    expect(clipped.items.map((row) => row.id)).toEqual(items.map((row) => row.id));
    expect(clipped.items.reduce((sum, row) => sum + row.text.length, 0)).toBeLessThan(600);
  });

  it("the map prompt names every kind the chunk holds", () => {
    expect(buildChapterMapPrompt("S", "C", items, 1, 2)).toContain("scene, fact, detail, ledger, state");
  });
});

const belief = (id: string, tag: EpistemicEntry["tag"], subject: string, content: string, hiddenFrom?: string, extra: Partial<EpistemicEntry> = {}): EpistemicEntry => ({
  id, tag, subject, content, ...(hiddenFrom ? { hiddenFrom } : {}), createdAt: 1, messageId: 3,
  provenance: { source: "extractor", messageId: 3, boundary: 1, pass: "epistemic", validity: "live" } as EpistemicEntry["provenance"], ...extra,
});

describe("AS-14 D3: epistemic rows fold only when subject and target both leave", () => {
  const roster = [{ id: "mara", name: "Mara" }, { id: "kael", name: "Kael" }, { id: "belle", name: "Belle" }];
  const cast = roster.flatMap((member) => [member.id, member.name]);
  const rows = [
    belief("h1", "hiding", "Mara", "the stolen seal", "Kael"),
    belief("h2", "hiding", "Mara", "the map", "Belle"),
    belief("s1", "suspects", "Kael", "Mara is lying about the seal"),
    belief("s2", "suspects", "Kael", "someone is lying"),
    belief("k1", "knows", "Mara", "Kael's real name"),
    belief("p1", "hiding", "Mara", "a pinned secret", "Kael", { pinned: true }),
  ];
  const leaving = leavingCast(["mara", "Kael"], roster);

  it("leavingCast reads ids and names", () => {
    expect([...leaving].sort()).toEqual(["kael", "mara"]);
  });

  it("folds hiding/suspects rows whose subject and every target leave; keeps the rest", () => {
    expect(epistemicTargets(rows[2], cast)).toEqual(["mara"]);
    const out = foldEpistemic(rows, "adv#1", leaving, cast);
    expect(out.folded).toEqual(["h1", "s1"]);
    expect(out.epistemic.filter((row) => row.foldedInto).map((row) => row.id)).toEqual(["h1", "s1"]);
  });

  it("control: nobody leaving folds nothing", () => {
    expect(foldEpistemic(rows, "adv#1", new Set(), cast).folded).toEqual([]);
  });

  it("a folded row reaches no prompt", () => {
    const { epistemic } = foldEpistemic(rows, "adv#1", leaving, cast);
    expect(activeEpistemic(epistemic).map((row) => row.id)).not.toContain("h1");
    expect(renderPrivateEpistemicBlock(epistemic, ["Mara"])).not.toContain("stolen seal");
    expect(renderPrivateEpistemicBlock(rows, ["Mara"])).toContain("stolen seal");
  });

  it("unfolds on unseal and on a rollback past the seal", () => {
    const { epistemic } = foldEpistemic(rows, "adv#1", leaving, cast);
    const stores = { entries: [], arcs: [], chapters: [record("adv#1", "Guild", 10)], chronicle: { eras: [] }, epistemic };
    expect(unfoldChapters(stores, new Set(["adv#1"])).epistemic?.some((row) => row.foldedInto)).toBe(false);
    expect(unfoldAt(stores, 10, []).epistemic?.some((row) => row.foldedInto)).toBe(false);
    expect(unfoldAt(stores, 11, []).epistemic?.filter((row) => row.foldedInto).length).toBe(2);
    const state = {
      entries: [], excluded: [], writeLog: [], shortTermSummaryEnd: -1, arcs: [], epistemic, ledger: [], canon: null, verifyDrops: [], derived: [], storyStart: 0,
      chapters: stores.chapters, chronicle: stores.chronicle,
    } as unknown as MemoryRollbackState;
    expect((reverseMemoryState(state, 5, 4, unfoldAt).epistemic ?? []).some((row) => row.foldedInto)).toBe(false);
  });
});
