import { buildNameIndex, foldEpistemicSignals, foldLedgerSignals, foldName, memorySightings, resolveName, sameCharacterCandidates } from "./nameFold";

const index = buildNameIndex({
  roster: [
    { id: "mara", name: "Mara Venn", aliases: ["the captain"] },
    { id: "tobias", name: "Tobias Crane" },
    { id: "holt", name: "Mara Holt" },
    { id: "ada", name: "Ada" },
  ],
  codex: { people: [{ member: "tobias", name: "The ferryman", aliases: ["Toby"] }] },
});

describe("plan 52 harvest H16e: structural name fold", () => {
  test("folds case, accents, articles and punctuation", () => {
    expect(foldName("  The Captain! ")).toBe("captain");
    expect(foldName("Adá")).toBe("ada");
  });

  test("alias fixture: every alias, id, codex name and structural form resolves to its member (100 %)", () => {
    const cases: Array<[string, string]> = [
      ["Mara Venn", "mara"], ["mara venn", "mara"], ["the captain", "mara"], ["Captain", "mara"], ["Venn", "mara"], ["mara", "mara"],
      ["Tobias", "tobias"], ["Crane", "tobias"], ["Toby", "tobias"], ["the ferryman", "tobias"], ["Tobias Crane", "tobias"],
      ["Holt", "holt"], ["Mara Holt", "holt"], ["ADA", "ada"],
    ];
    expect(cases.filter(([name, id]) => resolveName(index, name)?.id !== id)).toEqual([]);
  });

  test("an ambiguous name is left unresolved, never guessed: no two members merge", () => {
    expect(resolveName(index, "Mara M")).toBeNull();
    expect(buildNameIndex({ roster: [{ id: "a", name: "Mara Venn" }, { id: "b", name: "Mara Holt" }] }).members.length).toBe(2);
    expect(resolveName(buildNameIndex({ roster: [{ id: "a", name: "Mara Venn" }, { id: "b", name: "Mara Holt" }] }), "Mara")).toBeNull();
    expect(resolveName(index, "the innkeeper")).toBeNull();
  });

  test("ledger character rows and epistemic subjects take the card name at write time; other types are untouched", () => {
    expect(foldLedgerSignals(index, [{ entity: "the captain", entityType: "character", field: "hp", value: "2" }, { entity: "Venn", entityType: "place", field: "x", value: "y" }]))
      .toEqual([{ entity: "Mara Venn", entityType: "character", field: "hp", value: "2" }, { entity: "Venn", entityType: "place", field: "x", value: "y" }]);
    expect(foldEpistemicSignals(index, [{ tag: "hiding" as const, subject: "Toby", content: "the debt", hiddenFrom: "the captain" }]))
      .toEqual([{ tag: "hiding", subject: "Tobias Crane", content: "the debt", hiddenFrom: "Mara Venn" }]);
  });

  test("a name seen in three reads that matches nobody becomes a same-character question; fewer reads, a member or the player do not", () => {
    const sightings = memorySightings({
      epistemic: [1, 2, 3].map((boundary) => ({ subject: "the old woman", createdAt: boundary, provenance: { boundary } })),
      ledger: [{ entity: "Bosun", entityType: "character", provenance: { boundary: 1 } }, { entity: "Bosun", entityType: "character", provenance: { boundary: 2 } }, { entity: "Bosun", entityType: "character", provenance: { boundary: 3 } },
        { entity: "Rook", entityType: "character", provenance: { boundary: 1 } }, { entity: "Rook", entityType: "character", provenance: { boundary: 1 } }, { entity: "Rook", entityType: "character", provenance: { boundary: 2 } }],
    });
    expect(sameCharacterCandidates(index, sightings, ["Wren"])).toEqual(["the old woman", "Bosun"]);
    expect(sameCharacterCandidates(index, [...sightings, ...[1, 2, 3].map((read) => ({ name: "Wren", read: String(read) }))], ["Wren"])).toEqual(["the old woman", "Bosun"]);
  });
});
