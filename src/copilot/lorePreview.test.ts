import { readFileSync } from "fs";
import { join } from "path";
import type { Story } from "@engine/index";
import type { HostScannableEntry } from "@services/STAPI";
import { activationUncertainty, keywordWillActivate, matchKey } from "@runtime/loreKeyMatch";
import {
  bookSiblings, draftLoreTexts, gatedAt, loreKeyLint, loreOpEntry, loreOpLintEntry, opCards, previewKeyMatches, renderKeyMatchLine, type DraftText, type LintEntry,
} from "./lorePreview";

const draft: Story = {
  title: "Harbour", description: "A smuggler's port on a cold coast.", qualities: [], transitions: [], roster: [],
  checkpoints: [
    { id: "start", name: "The Quay", objective: "Meet the harbour master at the customs house.", type: "anchor", start: true },
    { id: "vault", name: "The Vault", objective: "Open the lighthouse vault before the tide turns.", type: "anchor", effects: { world_info: { enable: { lorebook: "Harbour Lore", comments: ["Vault"] } } } },
  ],
  briefing: { sections: [{ heading: "Before you start", text: "You arrive by the night ferry with a sealed letter." }] },
};

const cards = [{ name: "Ilsa Crane", description: "A fence who buys smuggled brandy.", first_mes: "The ferry bell rings twice as Ilsa counts coins." }];
const TEXTS: DraftText[] = draftLoreTexts(draft, cards);

const entry = (key: string[], patch: Partial<HostScannableEntry> = {}): HostScannableEntry => ({ world: "Harbour Lore", uid: 0, comment: key.join("/"), content: "Text.", key, ...patch });

const FIXTURE: Array<{ label: string; entry: HostScannableEntry; uncertain: boolean; matches: string[] }> = [
  { label: "certain, customs", entry: entry(["customs"]), uncertain: false, matches: ["objective of The Quay"] },
  { label: "certain, ferry", entry: entry(["ferry"]), uncertain: false, matches: ["briefing: Before you start", "Ilsa Crane's opening message"] },
  { label: "certain, brandy", entry: entry(["brandy"]), uncertain: false, matches: ["Ilsa Crane's card"] },
  { label: "certain, regex tide", entry: entry(["/tide|coast/i"]), uncertain: false, matches: ["story description", "objective of The Vault"] },
  { label: "certain, no match", entry: entry(["dragon"]), uncertain: false, matches: [] },
  { label: "certain, two keys", entry: entry(["vault", "letter"]), uncertain: false, matches: ["objective of The Vault", "briefing: Before you start"] },
  { label: "certain, case-insensitive", entry: entry(["HARBOUR"]), uncertain: false, matches: ["objective of The Quay"] },
  { label: "certain, and-any secondary", entry: entry(["ferry"], { keysecondary: ["night"], selective: true, selectiveLogic: 0 }), uncertain: false, matches: ["briefing: Before you start", "Ilsa Crane's opening message"] },
  { label: "probability", entry: entry(["customs"], { probability: 40, useProbability: true }), uncertain: true, matches: ["objective of The Quay"] },
  { label: "inclusion group", entry: entry(["customs"], { group: "harbour" }), uncertain: true, matches: ["objective of The Quay"] },
  { label: "triggers", entry: entry(["ferry"], { triggers: ["continue"] }), uncertain: true, matches: ["briefing: Before you start", "Ilsa Crane's opening message"] },
  { label: "recursion only", entry: entry(["brandy"], { delayUntilRecursion: true }), uncertain: true, matches: ["Ilsa Crane's card"] },
  { label: "character filter", entry: entry(["brandy"], { characterFilter: { names: ["Ilsa Crane"] } }), uncertain: true, matches: ["Ilsa Crane's card"] },
  { label: "delay", entry: entry(["vault"], { delay: 3 }), uncertain: true, matches: ["objective of The Vault"] },
  { label: "cooldown", entry: entry(["vault"], { cooldown: 2 }), uncertain: true, matches: ["objective of The Vault"] },
  { label: "decorator", entry: entry(["vault"], { content: "@@activate\nText." }), uncertain: true, matches: ["objective of The Vault"] },
  { label: "constant", entry: entry(["dragon"], { constant: true }), uncertain: true, matches: [] },
  { label: "macro key", entry: entry(["{{char}}"]), uncertain: true, matches: [] },
  { label: "scan depth 0", entry: entry(["customs"], { scanDepth: 0 }), uncertain: true, matches: ["objective of The Quay"] },
  { label: "secondary NOT", entry: entry(["ferry"], { keysecondary: ["storm"], selective: true, selectiveLogic: 2 }), uncertain: true, matches: ["briefing: Before you start", "Ilsa Crane's opening message"] },
];

const BUFFER = { messages: TEXTS.map((text) => text.text), depth: 50, caseSensitive: false, matchWholeWords: false, trigger: null };

describe("v2.8 34 harvest A3: the preview lists the draft texts a key matches, never a claim that it fires", () => {
  it("has 20 fixture entries", () => expect(FIXTURE).toHaveLength(20));

  it.each(FIXTURE)("$label: listed texts equal matchKey over the same texts", ({ entry: subject, matches }) => {
    const keys = (subject.key as string[]);
    const expected = TEXTS.filter((text) => keys.some((key) => matchKey(text.text, key, { caseSensitive: false, matchWholeWords: false }))).map((text) => text.label);
    const preview = previewKeyMatches(subject, TEXTS);
    expect(preview.matches).toEqual(expected);
    expect(preview.matches).toEqual(matches);
  });

  it.each(FIXTURE)("$label: an uncertain entry carries its reason; a certain one carries none", ({ entry: subject, uncertain }) => {
    const preview = previewKeyMatches(subject, TEXTS);
    expect(preview.reasons.length > 0).toBe(uncertain);
    expect(activationUncertainty(subject, BUFFER).length > 0).toBe(uncertain);
    if (uncertain) expect(keywordWillActivate(subject, BUFFER)).toBe(false);
    if (!uncertain && preview.matches.length) expect(keywordWillActivate(subject, BUFFER)).toBe(true);
  });

  it("the card line never says fires", () => {
    const lines = FIXTURE.map(({ entry: subject }) => renderKeyMatchLine(previewKeyMatches(subject, TEXTS)));
    expect(lines.filter((line) => /fire/i.test(line))).toEqual([]);
    expect(lines[0]).toBe("Key matches these draft texts: objective of The Quay.");
    expect(lines[4]).toBe("No draft text contains any key.");
  });

  it("a gated entry names the checkpoints that switch it on", () => {
    expect(gatedAt(draft, "harbour lore", "vault")).toEqual(["The Vault"]);
    expect(previewKeyMatches(entry(["vault"]), TEXTS, gatedAt(draft, "Harbour Lore", "Vault")).reasons).toEqual(["gated: on only from The Vault"]);
  });

  it("maps a wizard op to the scan shape the preview reads", () => {
    const op = { kind: "upsertLorebookEntry" as const, lorebook: "Harbour Lore", comment: "Ferry", content: "Runs at night.", keys: ["ferry"], secondaryKeys: ["storm"], logic: "not-any" as const, triggers: ["normal"] };
    expect(loreOpEntry(op)).toMatchObject({ key: ["ferry"], keysecondary: ["storm"], selective: true, selectiveLogic: 2, triggers: ["normal"] });
    expect(previewKeyMatches(loreOpEntry(op), TEXTS).reasons).toEqual(["only on normal generations", "not-any depends on every text SillyTavern scans, not only the chat"]);
    expect(opCards([{ kind: "createCharacterCard", name: "Ilsa Crane", description: "x" }, op])).toEqual([{ name: "Ilsa Crane", description: "x" }]);
  });
});

const lint = (key: string[], patch: Partial<LintEntry> = {}): LintEntry => ({ comment: key[0] ?? "entry", key, ...patch });

const CLEAN: LintEntry[] = [
  lint(["customs house"]), lint(["ferry", "night ferry"]), lint(["brandy"]), lint(["/tide|coast/i"]), lint(["lighthouse"], { keysecondary: ["vault"], selective: true, selectiveLogic: 0 }),
  lint(["harbour master"]), lint(["Ilsa"], { keysecondary: ["storm"], selective: true, selectiveLogic: 2 }), lint(["quay"], { constant: true }), lint(["letter", "seal"]), lint(["ferry"], { comment: "Ferry times" }),
];

describe("v2.8 34 harvest A4: key lint, warnings only", () => {
  it("flags each planted control with its operational rule", () => {
    expect(loreKeyLint(lint(["ox"])).map((entry) => entry.id)).toEqual(["short-key"]);
    const book = [lint(["smuggler"], { comment: "A" }), lint(["smuggler"], { comment: "B" }), lint(["smuggler"], { comment: "C" })];
    expect(loreKeyLint(book[0], book).map((entry) => entry.id)).toEqual(["shared-key"]);
    expect(loreKeyLint(lint(["lighthouse"], { keysecondary: ["lighthouses"], selective: true, selectiveLogic: 0 })).map((entry) => entry.id)).toEqual(["secondary-repeats-primary"]);
    expect(loreKeyLint(lint(["lighthouse"], { keysecondary: ["lighthouse"], selective: true })).map((entry) => entry.id)).toEqual(["secondary-repeats-primary"]);
    expect(loreKeyLint(lint(["quay"], { constant: true, sticky: 3 })).map((entry) => entry.id)).toEqual(["sticky-on-constant"]);
  });

  it("finds nothing on 10 clean entries, read as one book", () => {
    expect(CLEAN.map((subject) => loreKeyLint(subject, CLEAN))).toEqual(CLEAN.map(() => []));
  });

  it("a NOT secondary repeating a primary is a choice, not lint; regex keys are never short", () => {
    expect(loreKeyLint(lint(["lighthouse"], { keysecondary: ["lighthouse"], selective: true, selectiveLogic: 2 }))).toEqual([]);
    expect(loreKeyLint(lint(["/a/"]))).toEqual([]);
  });

  it("reads siblings from the wizard's ops in the same book", () => {
    const op = (comment: string, keys: string[]) => ({ kind: "upsertLorebookEntry" as const, lorebook: "Harbour Lore", comment, content: "x", keys });
    const ops = [op("A", ["smuggler"]), op("B", ["smuggler"]), op("C", ["smuggler"]), { ...op("D", ["smuggler"]), lorebook: "Other" }];
    expect(bookSiblings(ops, "harbour lore")).toHaveLength(3);
    expect(loreKeyLint(loreOpLintEntry(ops[0]), bookSiblings(ops, "Harbour Lore")).map((entry) => entry.id)).toEqual(["shared-key"]);
  });
});

describe("v2.8 34 harvest A3a: the six activation fixture entries the no-model lane checks against ST", () => {
  const fixture = JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/lore-preview-a3a.json"), "utf8")) as {
    chat: string; entries: HostScannableEntry[]; gated: { comment: string; checkpoint: string }; expectedReasons: Record<string, string[]>;
  };
  const scenario = readFileSync(join(process.cwd(), "test/scenarios/v28-34-a3a-preview-activation.json"), "utf8");

  it("the scenario writes exactly the fixture's entries", () => {
    const written = JSON.parse(JSON.parse(scenario).steps[0].eval.match(/const ENTRIES = (\[.*?\]);/)[1]);
    expect(written).toEqual(fixture.entries);
  });

  it.each(Object.entries(fixture.expectedReasons))("%s: preview reasons as recorded, never a fires claim", (comment, reasons) => {
    const subject = { ...fixture.entries.find((entry) => entry.comment === comment)!, world: "SO-A3a-Preview" };
    const gated = comment === fixture.gated.comment ? [fixture.gated.checkpoint] : [];
    const preview = previewKeyMatches(subject, [{ label: "chat", text: fixture.chat }], gated);
    expect(preview.reasons).toEqual(reasons);
    expect(preview.matches).toEqual(["chat"]);
    expect(renderKeyMatchLine(preview)).not.toMatch(/fire/i);
  });
});
