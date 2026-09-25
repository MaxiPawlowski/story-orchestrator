import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCuratorResponse } from "./parse";
import { buildCreateCandidatePrompt, caseContext, caseEntries, caseScope, createSuiteVerdict, parseCreateLines, scoreCreateSample, trigramJaccard, validateCreate, CREATE_NEAR_DUP_THRESHOLD, type CreateCase } from "./createCandidate";

const ROOT = join(__dirname, "../..");
const fixture = JSON.parse(readFileSync(join(ROOT, "test/fixtures/curator-create/cases.json"), "utf-8")) as { frozenAt: string; floors: { propose: number; none: number }; samples: number; cases: Array<CreateCase & { lang: string; why: string }> };
const byId = (id: string) => fixture.cases.find((entry) => entry.id === id) as CreateCase;

describe("F5 Phase A fixture (labels frozen before any model answer)", () => {
  it("has >=20 cases, >=8 Spanish, >=10 of each label, the declared floors and unique ids", () => {
    const { cases } = fixture;
    expect(fixture.frozenAt).toBe("2026-09-25");
    expect(fixture.floors).toEqual({ propose: 0.9, none: 1 });
    expect(cases.length).toBeGreaterThanOrEqual(20);
    expect(cases.filter((entry) => entry.lang === "es").length).toBeGreaterThanOrEqual(8);
    expect(cases.filter((entry) => entry.label === "propose").length).toBeGreaterThanOrEqual(10);
    expect(cases.filter((entry) => entry.label === "none").length).toBeGreaterThanOrEqual(10);
    expect(new Set(cases.map((entry) => entry.id)).size).toBe(cases.length);
  });

  it("covers every negative the plan names", () => {
    const whys = new Set(fixture.cases.filter((entry) => entry.label === "none").map((entry) => entry.why));
    expect([...whys].sort()).toEqual(["covered", "named-once", "near-dup", "nothing-new", "roster"]);
  });

  it("a positive's entity is named by >=2 facts and has no entry; a roster negative names a cast member", () => {
    for (const entry of fixture.cases.filter((row) => row.label === "propose")) {
      const entity = (entry.entity as string).toLowerCase();
      expect(entry.facts.filter((fact) => fact.toLowerCase().includes(entity)).length).toBeGreaterThanOrEqual(2);
      expect(entry.entries.some((row) => row.comment.toLowerCase() === entity)).toBe(false);
    }
    for (const entry of fixture.cases.filter((row) => row.why === "roster")) expect(entry.roster).toContain(entry.entity);
  });
});

describe("F5 candidate prompt and parser", () => {
  const entry = byId("p01");

  it("adds the create line, the established facts and the cast rule, and drops 'never invent'", () => {
    const prompt = buildCreateCandidatePrompt(caseScope(entry), caseContext(entry));
    expect(prompt).toContain("[create] <lorebook> || <new entry title> || <key, key> || <entry content>");
    expect(prompt).toContain("ESTABLISHED FACTS:\n- Oskar the ferryman charges");
    expect(prompt).toContain("Never create an entry for Mira, Tolan");
    expect(prompt).not.toContain("Never invent new entries");
  });

  it("parses a create line into book, title, keys and content", () => {
    expect(parseCreateLines('- [create] Salt Road Lore || Oskar || Oskar, ferryman || The delta ferryman. "Silver per crossing."')).toEqual([{ lorebook: "Salt Road Lore", comment: "Oskar", keys: ["Oskar", "ferryman"], content: "The delta ferryman. \"Silver per crossing." }]);
    expect(parseCreateLines("[create] Salt Road Lore || Oskar || Oskar")).toEqual([]);
  });

  it("the shipped curator parser never reads a create line", () => {
    const proposal = parseCuratorResponse("[create] Salt Road Lore || Oskar || Oskar || The ferryman.", caseEntries(entry));
    expect(proposal.ops).toEqual([]);
  });
});

describe("F5 code guards", () => {
  const entry = byId("p01");
  const context = caseContext(entry);
  const op = { lorebook: "Salt Road Lore", comment: "Oskar", keys: ["Oskar", "ferryman"], content: "The delta ferryman." };

  it("takes an allowlisted, new, fact-named entry", () => {
    expect(validateCreate(op, context)).toMatchObject({ ok: true });
  });

  it.each([
    ["a book off the allowlist", { lorebook: "Other" }, '"Other" is not on this story\'s stagecraft allowlist'],
    ["an existing title", { comment: "the delta" }, '"the delta" already exists in Salt Road Lore'],
    ["empty keys", { keys: [] }, '"Oskar" has no keys, so it would never fire'],
    ["a cast name as a key", { keys: ["Oskar", "mira"] }, '"mira" is a cast member\'s name; as a key it would fire every turn'],
    ["an entity no fact names", { comment: "Garrick", keys: ["Garrick"] }, 'no live fact names "Garrick"'],
  ])("refuses %s", (_label, patch, reason) => {
    expect(validateCreate({ ...op, ...patch }, context)).toMatchObject({ ok: false, reason });
  });

  it("a cast member's first name as a key is refused too", () => {
    const ember = caseContext(byId("n06"));
    expect(validateCreate({ lorebook: "Ember Keep Lore", comment: "Reyes' oath", keys: ["Reyes"], content: "Captain Reyes refused the ultimatum." }, ember)).toMatchObject({ ok: false });
  });

  it("a near-duplicate is a warning with the entry named, not a refusal", () => {
    const near = byId("n09");
    const verdict = validateCreate({ lorebook: near.book, comment: "Faro de San Telmo", keys: ["faro"], content: "El Faro de San Telmo lleva apagado desde el naufragio del Esperanza, pero alguien volvió a encenderlo durante la tormenta." }, caseContext(near));
    expect(verdict.ok).toBe(true);
    expect(verdict.nearDups[0]?.comment).toBe("El faro");
    expect(verdict.nearDups[0]?.score).toBeGreaterThanOrEqual(CREATE_NEAR_DUP_THRESHOLD);
  });

  it("trigram Jaccard ignores accents, case and punctuation", () => {
    expect(trigramJaccard("Doña Remedios!", "dona remedios")).toBe(1);
    expect(trigramJaccard("the delta", "glass choir")).toBeLessThan(0.1);
  });
});

describe("F5 scoring (end to end, after the code guards)", () => {
  it("a positive passes only on a valid card that names its entity", () => {
    const entry = byId("p08");
    expect(scoreCreateSample(entry, "[create] Lore Casa del Pozo || Doña Remedios || Remedios, cocinera || La vieja cocinera que guarda la llave del sótano.").pass).toBe(true);
    expect(scoreCreateSample(entry, "NONE").pass).toBe(false);
    expect(scoreCreateSample(entry, "[create] Lore Casa del Pozo || El sótano || sótano || La llave del sótano la guarda Doña Remedios.").pass).toBe(false);
  });

  it("a negative passes only when no card survives; a refused card is not a failure", () => {
    const roster = byId("n03");
    expect(scoreCreateSample(roster, "[create] Ember Keep Lore || Iolo || Iolo || The priest-raised scribe.").pass).toBe(true);
    expect(scoreCreateSample(byId("n05"), "NONE").pass).toBe(true);
    expect(scoreCreateSample(byId("n05"), "[create] Night Market Lore || The Mirror || mirror || Vey won the mirror at the auction.").pass).toBe(false);
  });

  it("the verdict holds each label to its own floor", () => {
    expect(createSuiteVerdict([{ label: "propose", passes: [true, true, true] }, { label: "none", passes: [true, true, true] }], fixture.floors)).toEqual({ propose: 1, none: 1, ok: true });
    expect(createSuiteVerdict([{ label: "propose", passes: [true, true, true] }, { label: "none", passes: [true, true, false] }], fixture.floors).ok).toBe(false);
  });

  const goldenDir = join(ROOT, "test/goldens/live/curator-create");
  const goldens = existsSync(goldenDir) ? readdirSync(goldenDir).filter((file) => file.endsWith(".json")) : [];
  it(`replays the recorded live responses (${goldens.length} recorded)`, () => {
    for (const file of goldens) {
      const golden = JSON.parse(readFileSync(join(goldenDir, file), "utf-8")) as { id: string; responses: Array<string | null>; passes: boolean[] };
      const entry = byId(golden.id);
      expect(golden.responses.map((raw) => (raw === null ? false : scoreCreateSample(entry, raw).pass))).toEqual(golden.passes);
    }
  });
});
