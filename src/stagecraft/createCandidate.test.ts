import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCuratorResponse } from "./parse";
import { trigramJaccard } from "./createNearDup";
import { buildCreateCandidatePrompt, caseContext, caseEntries, caseScope, createSuiteVerdict, parseCreateLines, scoreCreateSample, validateCreate, factsNaming, CREATE_MIN_FACTS, type CreateCase } from "./createCandidate";
import { CREATE_CONTRACT_ID, CREATE_FIXTURE_REVISION, CREATE_FLOORS, createEligibility } from "./createEligibility";

const ROOT = join(__dirname, "../..");
const fixture = JSON.parse(readFileSync(join(ROOT, "test/fixtures/curator-create/cases.json"), "utf-8")) as { frozenAt: string; floors: { propose: number; none: number }; samples: number; cases: Array<CreateCase & { lang: string; why: string }> };
const byId = (id: string) => fixture.cases.find((entry) => entry.id === id) as CreateCase;

describe("F5 Phase A fixture (labels frozen before any model answer)", () => {
  it("has >= 22 English cases, >= 10 of each label (restored after v2.6 W25), the declared floors and unique ids", () => {
    const { cases } = fixture;
    expect(fixture.frozenAt).toBe("2026-09-25");
    expect(fixture.floors).toEqual({ propose: 0.9, none: 1 });
    expect(cases.length).toBeGreaterThanOrEqual(22);
    expect(cases.every((entry) => entry.lang === "en")).toBe(true);
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

describe("v2.8 11 fixture revision 2 (contract B, frozen 2026-10-09 before any model answer)", () => {
  const raw = readFileSync(join(ROOT, "test/fixtures/curator-create/revision-2.json"), "utf-8").replace(/\r\n/g, "\n");
  const r2 = JSON.parse(raw) as { revision: string; contract: string; frozenAt: string; floors: { propose: number; none: number }; samples: number; cases: Array<CreateCase & { lang: string; why: string }> };

  it("is the frozen file the plan measures: hash pinned, revision and contract match the eligibility rows", () => {
    expect(createHash("sha256").update(raw, "utf-8").digest("hex")).toBe("da7450898e42cde3e0da6e4da39a553efdac4ebadf3058af21f2a8e753aeb759");
    expect(r2.revision).toBe(CREATE_FIXTURE_REVISION);
    expect(r2.contract).toBe(CREATE_CONTRACT_ID);
    expect(r2.floors).toEqual(CREATE_FLOORS);
    expect(r2.samples).toBe(3);
  });

  it("has >= 22 English cases, >= 10 of each label, and ids no revision-1 record can claim", () => {
    const old = new Set(fixture.cases.map((entry) => entry.id));
    expect(r2.cases.length).toBeGreaterThanOrEqual(22);
    expect(r2.cases.every((entry) => entry.lang === "en" && !old.has(entry.id))).toBe(true);
    expect(new Set(r2.cases.map((entry) => entry.id)).size).toBe(r2.cases.length);
    expect(r2.cases.filter((entry) => entry.label === "propose").length).toBeGreaterThanOrEqual(10);
    expect(r2.cases.filter((entry) => entry.label === "none").length).toBeGreaterThanOrEqual(10);
    for (const entry of r2.cases) expect(Number(entry.id.slice(1))).toBeGreaterThanOrEqual(entry.label === "propose" ? 16 : 17);
  });

  it("covers every negative the plan names, the hidden-entry ones included", () => {
    const whys = new Set(r2.cases.filter((entry) => entry.label === "none").map((entry) => entry.why));
    for (const why of ["named-once", "named-once-generic-key", "roster", "roster-bystander", "covered", "near-dup", "nothing-new", "excluded", "gated"]) expect(whys).toContain(why);
    for (const entry of r2.cases.filter((row) => row.why === "excluded" || row.why === "gated" || row.why === "excluded-other-title")) expect(entry.hidden?.length).toBeGreaterThan(0);
  });

  it("a positive's entity is named by >= 2 distinct facts and nothing listed or hidden holds it; a named-once negative's entity by one", () => {
    for (const entry of r2.cases.filter((row) => row.label === "propose")) {
      const op = { comment: entry.entity as string, keys: [] };
      expect({ id: entry.id, naming: factsNaming(entry.facts, op) >= CREATE_MIN_FACTS }).toEqual({ id: entry.id, naming: true });
      expect(entry.entries.some((row) => row.comment.toLowerCase() === (entry.entity as string).toLowerCase())).toBe(false);
      expect(entry.hidden ?? []).toEqual([]);
    }
    for (const entry of r2.cases.filter((row) => row.why.startsWith("named-once"))) expect(factsNaming(entry.facts, { comment: entry.entity as string, keys: [] })).toBe(1);
    for (const entry of r2.cases.filter((row) => row.why.startsWith("roster"))) expect(entry.roster).toContain(entry.entity);
  });

  it("replays the two recorded offline runs (DeepSeek flash, thinking off): none 1.00 both runs, propose below floor, and the shipped row reads below-floor", () => {
    const dir = join(ROOT, "test/goldens/live/curator-create-r2");
    for (const run of ["run1", "run2"]) {
      const summary = JSON.parse(readFileSync(join(dir, run, "summary.json"), "utf-8")) as { endToEnd: { propose: number; none: number }; ok: boolean };
      const rows = r2.cases.map((entry) => {
        const golden = JSON.parse(readFileSync(join(dir, run, `${entry.id}.json`), "utf-8")) as { responses: string[]; passes: boolean[] };
        const passes = golden.responses.map((answer) => scoreCreateSample(entry, answer).pass);
        expect({ run, id: entry.id, passes }).toEqual({ run, id: entry.id, passes: golden.passes });
        return { label: entry.label, passes };
      });
      const verdict = createSuiteVerdict(rows, r2.floors);
      expect(Math.round(verdict.propose * 10000) / 10000).toBe(summary.endToEnd.propose);
      expect(verdict.none).toBe(1);
      expect(verdict.ok).toBe(false);
    }
    expect(createEligibility("deepseek:deepseek-flash").state).toBe("below-floor");
  });

  it("the shipped guards refuse a card that recreates a hidden entry, by title or through its keys", () => {
    const excluded = r2.cases.find((entry) => entry.id === "n28") as CreateCase;
    expect(scoreCreateSample(excluded, `[create] ${excluded.book} || Sefa || Sefa, tides || Reads the tides from fish bones.`).pass).toBe(true);
    const gated = r2.cases.find((entry) => entry.id === "n27") as CreateCase;
    expect(scoreCreateSample(gated, `[create] ${gated.book} || The Vault of Cinders || vault, cinders || A vault under the ridge.`).pass).toBe(true);
    const positive = r2.cases.find((entry) => entry.id === "p16") as CreateCase;
    expect(scoreCreateSample(positive, `[create] ${positive.book} || Tamsin || Tamsin, lantern shop || Sells lantern oil on the quay.`).pass).toBe(true);
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

  it("contract B: a title or first key named by only one live fact is refused, and the refusal says so", () => {
    expect(CREATE_MIN_FACTS).toBe(2);
    const once = { ...context, facts: ["Garrick sold the boat at dawn.", "The delta flooded twice this year."] };
    expect(validateCreate({ ...op, comment: "Garrick", keys: ["Garrick"] }, once)).toMatchObject({ ok: false, reason: 'only one live fact names "Garrick"; a new entry needs 2' });
  });

  it("contract B: a generic second key never lifts a named-once title over the bar (n12 shape)", () => {
    const once = { ...context, facts: ["Garrick sold the boat at dawn.", "A boat sank at the pier.", "The boat had no name."] };
    expect(validateCreate({ ...op, comment: "Garrick", keys: ["Garrick", "boat"] }, once)).toMatchObject({ ok: false });
  });

  it("contract B: the first key named in two facts passes, and one fact repeated counts once", () => {
    const keyed = { ...context, facts: ["The old ferryman sang.", "Ask the ferryman for the channel."] };
    expect(validateCreate({ ...op, comment: "Oskar", keys: ["ferryman"] }, keyed)).toMatchObject({ ok: true });
    const twice = { ...context, facts: ["Garrick sold the boat.", "Garrick sold the boat."] };
    expect(validateCreate({ ...op, comment: "Garrick", keys: ["Garrick"] }, twice)).toMatchObject({ ok: false });
  });

  it("a cast member's first name as a key is refused too", () => {
    const ember = caseContext(byId("n06"));
    expect(validateCreate({ lorebook: "Ember Keep Lore", comment: "Reyes' oath", keys: ["Reyes"], content: "Captain Reyes refused the ultimatum." }, ember)).toMatchObject({ ok: false });
  });

  it("a near-duplicate is a warning with the entry named, not a refusal", () => {
    const near = byId("n04");
    const verdict = validateCreate({ lorebook: near.book, comment: "Warden Hale", keys: ["warden"], content: "Warden Hale runs Greyfen, takes bribes in tobacco and keeps the master key on a chain at his neck." }, caseContext(near));
    expect(verdict.ok).toBe(true);
    expect(verdict.nearDups[0]?.comment).toBe("The Warden");
    expect(verdict.nearDups[0]).toMatchObject({ via: "wording", band: expect.stringMatching(/duplicate|same-topic/) });
  });

  it("trigram Jaccard ignores accents, case and punctuation", () => {
    expect(trigramJaccard("Café Noël!", "cafe noel")).toBe(1);
    expect(trigramJaccard("the delta", "glass choir")).toBeLessThan(0.1);
  });
});

describe("F5 scoring (end to end, after the code guards)", () => {
  it("a positive passes only on a valid card that names its entity", () => {
    const entry = byId("p05");
    expect(scoreCreateSample(entry, "[create] Greyfen Lore || Warden Hale || Hale, warden || The warden who takes bribes in tobacco and wears the master key.").pass).toBe(true);
    expect(scoreCreateSample(entry, "NONE").pass).toBe(false);
    expect(scoreCreateSample(entry, "[create] Greyfen Lore || The master key || master key || Warden Hale keeps the master key on a chain.").pass).toBe(false);
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
  it(`replays the recorded v2.6 responses under contract B (${goldens.length} recorded): every propose verdict unchanged, every none-miss now refused`, () => {
    const replayed = goldens.map((file) => {
      const golden = JSON.parse(readFileSync(join(goldenDir, file), "utf-8")) as { id: string; label: "propose" | "none"; responses: Array<string | null>; passes: boolean[] };
      return { ...golden, b: golden.responses.map((raw) => (raw === null ? false : scoreCreateSample(byId(golden.id), raw).pass)) };
    });
    expect(replayed.length).toBe(22);
    for (const row of replayed.filter((entry) => entry.label === "propose")) expect(row.b).toEqual(row.passes);
    for (const row of replayed.filter((entry) => entry.label === "none")) expect(row.b).toEqual([true, true, true]);
    expect(replayed.filter((entry) => entry.label === "none").flatMap((entry) => entry.passes).filter((pass) => !pass).length).toBe(7);
    expect(createSuiteVerdict(replayed.map((row) => ({ label: row.label, passes: row.b })), fixture.floors)).toMatchObject({ none: 1, ok: true });
  });
});
