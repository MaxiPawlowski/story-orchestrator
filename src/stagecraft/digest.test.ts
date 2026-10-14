import { buildCreateCandidatePrompt } from "./createCandidate";
import { digestVocabulary, refuseTitleOnlyEdits, selectCuratorDigest, SEEN_TARGET_REFUSAL, titleOnlyEditRefusal, TITLE_ONLY_REFUSAL } from "./digest";
import { parseCuratorResponse } from "./parse";
import { buildWiCuratorPrompt } from "./prompt";
import { entryRef } from "./scope";
import {
  CURATOR_DIGEST_FULL_LIMIT, CURATOR_DIGEST_INDEX_LIMIT, CURATOR_DIGEST_MIN_ENTRIES,
  type CuratorDigest, type CuratorEntryView, type CuratorOpRecord, type CuratorPlan, type CuratorScope,
} from "./types";

const scope = (entries: CuratorEntryView[], canon = "The ferry arrived."): CuratorScope =>
  ({ storyTitle: "Digest unit", checkpointName: "Harbour", objective: "Keep the harbour open", canon, openArcs: [], entries });

const view = (index: number, tweak: Partial<CuratorEntryView> = {}): CuratorEntryView =>
  ({ lorebook: "Unit", uid: index, comment: `Entry ${index}`, keys: [`key${index}`], content: `Body ${index} ${"x".repeat(80)}`, disabled: false, ...tweak });

const book = (count: number, tweak: (index: number) => Partial<CuratorEntryView> = () => ({})) => Array.from({ length: count }, (_, index) => view(index, tweak(index)));

describe("selectCuratorDigest", () => {
  it("applies from the threshold and not below it", () => {
    expect(selectCuratorDigest(book(CURATOR_DIGEST_MIN_ENTRIES - 1), scope([]))).toBeNull();
    expect(selectCuratorDigest(book(CURATOR_DIGEST_MIN_ENTRIES), scope([]))).not.toBeNull();
    expect(selectCuratorDigest([], scope([]))).toBeNull();
  });

  it("matches whole words only, so a ferryman is not the ferry", () => {
    const entries = book(45, (index) => (index === 3 ? { keys: ["ferryman"] } : index === 4 ? { keys: ["ferry"] } : {}));
    expect(selectCuratorDigest(entries, scope(entries))!.full.map((entry) => entry.uid)).toEqual([4]);
  });

  it("ranks by hits, breaks ties by authored order, caps at the full limit and keeps authored order", () => {
    const entries = book(60, (index) => (index >= 10 && index < 40 ? { keys: ["harbour"] } : index === 50 ? { keys: ["harbour", "ferry"] } : {}));
    const digest = selectCuratorDigest(entries, scope(entries))!;
    expect(digest.full).toHaveLength(CURATOR_DIGEST_FULL_LIMIT);
    expect(digest.full.map((entry) => entry.uid)).toEqual([...Array.from({ length: CURATOR_DIGEST_FULL_LIMIT - 1 }, (_, at) => at + 10), 50]);
    expect(digest.full.length + digest.titleOnly.length + digest.unlisted.length).toBe(60);
    expect(new Set([...digest.full, ...digest.titleOnly, ...digest.unlisted]).size).toBe(60);
  });

  it("bounds the index and reports what it left out, in authored order", () => {
    const entries = book(CURATOR_DIGEST_INDEX_LIMIT + 25);
    const digest = selectCuratorDigest(entries, scope(entries))!;
    expect(digest.titleOnly).toHaveLength(CURATOR_DIGEST_INDEX_LIMIT);
    expect(digest.unlisted.map((entry) => entry.uid)).toEqual(Array.from({ length: 25 }, (_, at) => CURATOR_DIGEST_INDEX_LIMIT + at));
    expect(digestVocabulary(digest)).toHaveLength(CURATOR_DIGEST_INDEX_LIMIT);
  });

  it("also reads extra context, such as the facts the create pass holds", () => {
    const entries = book(45);
    expect(selectCuratorDigest(entries, { ...scope(entries), extra: ["key7 was named twice"] })!.full.map((entry) => entry.uid)).toEqual([7]);
  });
});

describe("buildWiCuratorPrompt with a digest", () => {
  it("is the same request without one", () => {
    const entries = book(5);
    expect(buildWiCuratorPrompt(scope(entries), null)).toBe(buildWiCuratorPrompt(scope(entries)));
  });

  it("groups titles by initial under the title-only hint and keeps the full text of picked entries", () => {
    const entries = book(42, (index) => (index === 0 ? { comment: "Ferry", keys: ["ferry"] } : index === 1 ? { comment: "alpha gate" } : index === 2 ? { comment: "9 steps" } : {}));
    const prompt = buildWiCuratorPrompt(scope(entries), selectCuratorDigest(entries, scope(entries)));
    expect(prompt).toContain(`Body 0 ${"x".repeat(80)}`);
    expect(prompt).not.toContain("Body 5 ");
    expect(prompt).toMatch(/\n#: #2 "9 steps" \[currently on\]/);
    expect(prompt).toMatch(/\nA: #1 "alpha gate" \[currently on\]/);
    expect(prompt).not.toContain("more entries are not listed");
  });
});

describe("one vocabulary for the prompt, the parse and the plan", () => {
  const inBook = (lorebook: string, uid: number, tweak: Partial<CuratorEntryView> = {}): CuratorEntryView =>
    ({ lorebook, uid, comment: `${lorebook} ${uid}`, keys: [`k-${lorebook}-${uid}`], content: `Body ${lorebook} ${uid}`, disabled: false, ...tweak });

  const holds = (digest: CuratorDigest, all: CuratorEntryView[]) => {
    const prompt = buildWiCuratorPrompt(scope(all), digest);
    for (const entry of digest.listed) {
      const ref = entryRef(entry, digest.listed)!;
      expect(prompt).toContain(`${ref} "${entry.comment}"`);
      const [op] = parseCuratorResponse(`[disable] ${ref}`, digestVocabulary(digest)).ops;
      expect([op?.lorebook, op?.uid]).toEqual([entry.lorebook, entry.uid]);
    }
    for (const entry of digest.unlisted) expect(parseCuratorResponse(`[disable] "${entry.comment}"`, digestVocabulary(digest)).ops).toEqual([]);
    return prompt;
  };

  it("reorders nothing: listed entries keep their shown order whatever was picked in full", () => {
    const all = [...Array.from({ length: 25 }, (_, at) => inBook("A", at + 1)), ...Array.from({ length: 25 }, (_, at) => inBook("B", at + 1, at === 9 ? { keys: ["ferry"] } : {}))];
    const digest = selectCuratorDigest(all, scope(all))!;
    expect(digest.full.map((entry) => `${entry.lorebook}${entry.uid}`)).toEqual(["B10"]);
    expect(digestVocabulary(digest)).toEqual(all);
    const prompt = holds(digest, all);
    expect(prompt).toContain('- #2.10 "B 10" (B)');
    expect(prompt).toContain('#1.10 "A 10" [currently on]');
  });

  it("when a whole earlier book is unlisted the later book's references drop their ordinals", () => {
    const earlier = Array.from({ length: 3 }, (_, at) => inBook("A", at + 1));
    const later = Array.from({ length: 3 }, (_, at) => inBook("B", at + 1));
    const digest: CuratorDigest = { full: [later[0]], titleOnly: later.slice(1), unlisted: earlier, listed: later };
    const prompt = holds(digest, [...earlier, ...later]);
    expect(prompt).toContain('- #1 "B 1" (B)');
    expect(prompt).not.toContain("#1.1");
    expect(prompt).toContain("(3 more entries are not listed, so you may not touch them)");
  });

  it("a numeric clash across books is spelled with ordinals, and a bare clashing number names nothing", () => {
    const all = [inBook("A", 1), inBook("A", 2), inBook("B", 2), inBook("B", 12)];
    const digest: CuratorDigest = { full: [], titleOnly: all, unlisted: [], listed: all };
    const prompt = holds(digest, all);
    expect(prompt).toContain('#1 "A 1"');
    expect(prompt).toContain('#1.2 "A 2"');
    expect(prompt).toContain('#2.2 "B 2"');
    expect(prompt).toContain('#12 "B 12"');
    expect(parseCuratorResponse("[disable] #2", all).ops).toEqual([]);
  });

  it("lists the book beside a title-only entry only when another listed entry shares its title", () => {
    const all = [inBook("A", 1, { comment: "Shared" }), inBook("B", 1, { comment: "shared " }), inBook("B", 2)];
    const digest: CuratorDigest = { full: [], titleOnly: all, unlisted: [], listed: all };
    const prompt = buildWiCuratorPrompt(scope(all), digest);
    expect(prompt).toContain('#1.1 "Shared" (A) [currently on]');
    expect(prompt).toContain('#2.1 "shared " (B) [currently on]');
    expect(prompt).toContain('#2 "B 2" [currently on]');
  });

  it("an unlisted twin no longer forces a book onto a listed title", () => {
    const all = [inBook("A", 1, { comment: "Shared" }), inBook("B", 1, { comment: "Shared" })];
    const digest: CuratorDigest = { full: [], titleOnly: [all[0]], unlisted: [all[1]], listed: [all[0]] };
    expect(buildWiCuratorPrompt(scope(all), digest)).toContain('#1 "Shared" [currently on]');
  });
});

describe("refuseTitleOnlyEdits", () => {
  const entries = book(45, (index) => (index === 0 ? { keys: ["ferry"], comment: "Ferry" } : {}));
  const digest = selectCuratorDigest(entries, scope(entries))!;
  const record = (op: CuratorOpRecord["op"]): CuratorOpRecord => ({ op, status: "pending" });
  const plan = (records: CuratorOpRecord[]): CuratorPlan => ({ records, dropped: [], refused: [] });

  it("drops edits of title-only entries, marks their flips, and leaves full entries and creates alone", () => {
    const result = refuseTitleOnlyEdits(plan([
      record({ kind: "rewrite", lorebook: "Unit", comment: "Entry 9", uid: 9, text: "x" }),
      record({ kind: "patch", lorebook: "Unit", comment: "Entry 8", uid: 8, anchor: "a || b", replace: "c" }),
      record({ kind: "disable", lorebook: "Unit", comment: "Entry 7", uid: 7 }),
      record({ kind: "rewrite", lorebook: "Unit", comment: "Ferry", uid: 0, text: "y" }),
      record({ kind: "create", lorebook: "Unit", comment: "Fresh", keys: ["fresh"], text: "z" }),
    ]), digest);
    expect(result.records.map((entry) => [entry.op.kind, entry.seen])).toEqual([["disable", "title"], ["rewrite", "full"], ["create", undefined]]);
    expect(result.dropped.filter((reason) => reason.includes(TITLE_ONLY_REFUSAL))).toHaveLength(2);
    expect(result.refused.map((op) => op.comment)).toEqual(["Entry 9", "Entry 8"]);
  });

  it("names the refusal only for a marked edit", () => {
    expect(titleOnlyEditRefusal({ op: { kind: "rewrite", lorebook: "Unit", comment: "Entry 9", text: "x" }, status: "accepted", seen: "title" })).toContain(TITLE_ONLY_REFUSAL);
    expect(titleOnlyEditRefusal({ op: { kind: "rewrite", lorebook: "Unit", comment: "Entry 9", text: "x" }, status: "accepted" })).toBeNull();
    expect(titleOnlyEditRefusal({ op: { kind: "enable", lorebook: "Unit", comment: "Entry 9" }, status: "accepted", seen: "title" })).toBeNull();
    const seenTarget = { lorebook: "Unit", comment: "Ferry", uid: 0 };
    expect(titleOnlyEditRefusal({ op: { kind: "rewrite", lorebook: "Unit", comment: "Entry 9", uid: 9, text: "x" }, status: "accepted", seen: "full", seenTarget })).toContain(SEEN_TARGET_REFUSAL);
    expect(titleOnlyEditRefusal({ op: { kind: "rewrite", lorebook: "unit", comment: "ferry", text: "x" }, status: "accepted", seen: "full", seenTarget })).toBeNull();
    expect(titleOnlyEditRefusal({ op: { kind: "rewrite", lorebook: "Unit", comment: "Ferry", uid: 0, text: "x" }, status: "accepted", seen: "full", seenTarget })).toBeNull();
  });
});

describe("the create pass keeps its full-text prompt", () => {
  it("lists every entry in full however large the scope", () => {
    const entries = book(60);
    const prompt = buildCreateCandidatePrompt(scope(entries), { facts: ["A fact."], roster: ["Max"], allowlist: ["Unit"] });
    expect(prompt).toContain("Body 59 ");
    expect(prompt).not.toContain("OTHER ENTRIES");
  });
});
