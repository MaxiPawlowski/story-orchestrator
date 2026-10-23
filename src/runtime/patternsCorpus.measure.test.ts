import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { parseStory, type NormalizedStory } from "@engine/index";
import { chapterOf } from "./consequences";
import type { StoryPattern } from "@engine/patternSchema";
import { applyBoundary } from "./patterns";
import { createPatterns } from "./patternsPort";
import type { EffectRef } from "./recapPort";

type CaseRef = { kind: "transition" | "quest" | "milestone" | "check"; id?: string; from?: string; to?: string };
type Case = { id: string; positive: boolean; expectedCompletions: number; why: string; pattern: StoryPattern; turns: CaseRef[][] };

const DIR = join(__dirname, "../../test/measurements/v2.9/05-p1p2");
const corpus = JSON.parse(readFileSync(join(DIR, "corpus.json"), "utf8")) as { cases: Case[] };

const check = (id: string, narrate = "public") => ({ id, label: id, quality: `${id}_ok`, roll: { sides: 20, target: 10 }, narrate });
const flag = (key: string) => ({ key, type: "bool", source: "code", rubric: `${key}?` });
const quest = (id: string, giver: string) => ({ id, title: id, kind: "side", giver, done_when: { q: `${id}_q`, op: "==", v: true }, steps: [] });
const hop = (from: string, to: string) => ({ from, to, priority: 1, gate: { q: `go_${to}`, op: "==", v: true } });

const BASE = {
  id: "p1p2", title: "P1P2", description: "",
  qualities: [...["climb_ok", "swim_ok", "haggle_ok", "sneak_ok", "crates_q", "nets_q", "lamp_q", "toll_q", "spring_q", "bridge_q", "vault_q"].map(flag),
    ...["market", "gate", "yard", "dock"].map((to) => ({ key: `go_${to}`, type: "bool", source: "extractor", rubric: `${to}?` }))],
  chapters: [{ id: "one", title: "One" }, { id: "two", title: "Two" }],
  checkpoints: [
    { id: "dock", name: "Dock", objective: "o", type: "anchor", chapter: "one", start: true, checks: [check("climb"), check("swim"), check("haggle"), check("sneak", "hidden")] },
    { id: "market", name: "Market", objective: "o", type: "anchor", chapter: "one" },
    { id: "gate", name: "Gate", objective: "o", type: "anchor", chapter: "two" },
    { id: "yard", name: "Yard", objective: "o", type: "anchor", chapter: "two" },
  ],
  transitions: [hop("dock", "market"), hop("market", "gate"), hop("gate", "yard"), hop("yard", "dock"), hop("market", "dock"), hop("gate", "market")],
  roster: [{ id: "mara", name: "Mara" }, { id: "tobin", name: "Tobin" }],
  quests: [quest("crates", "mara"), quest("nets", "mara"), quest("lamp", "tobin"), quest("toll", "tobin")],
  milestones: [
    { id: "spring", title: "Spring", when: { q: "spring_q", op: "==", v: true } },
    { id: "bridge", title: "Bridge", when: { q: "bridge_q", op: "==", v: true } },
    { id: "vault", title: "Vault", when: { q: "vault_q", op: "==", v: true }, secret: true },
  ],
};

const RECAP_ORDER = ["transition", "quest", "milestone", "check"];

const refsOf = (turn: CaseRef[], boundary: number, story: NormalizedStory): EffectRef[] =>
  [...turn].sort((a, b) => RECAP_ORDER.indexOf(a.kind) - RECAP_ORDER.indexOf(b.kind)).map((ref) => ({
    kind: ref.kind, id: ref.kind === "transition" ? `${ref.from}->${ref.to}#0` : ref.id ?? "", ...(ref.from ? { from: ref.from } : {}), ...(ref.to ? { to: ref.to } : {}),
    boundary, messageId: boundary * 2, chapterId: ref.kind === "transition" && ref.to ? chapterOf(story, ref.to) : null,
    visible: true, authored: false, causes: [],
  }));

const run = (entry: Case) => {
  const parsed = parseStory({ ...BASE, patterns: [entry.pattern] });
  if (Array.isArray(parsed)) return { id: entry.id, invalid: parsed.map((error) => `${error.path}: ${error.message}`).slice(0, 3) };
  const story = parsed;
  const state = entry.turns.reduce((acc, turn, index) => applyBoundary(story, acc, { boundary: index + 1, messageId: (index + 1) * 2 }, refsOf(turn, index + 1, story)), createPatterns());
  return { id: entry.id, completions: state.completed.length };
};

describe("v2.9 05 P1/P2: frozen 50-sequence corpus (informational floors, sol labels)", () => {
  it("the corpus is the frozen 25/25 split", () => {
    expect(corpus.cases).toHaveLength(50);
    expect(corpus.cases.filter((entry) => entry.positive)).toHaveLength(25);
  });

  it("measures precision and recall; records, never asserts the floor", () => {
    const rows = corpus.cases.map((entry) => ({ entry, result: run(entry) }));
    const scored = rows.filter((row) => !("invalid" in row.result));
    const predicted = (row: (typeof rows)[number]) => "completions" in row.result && (row.result.completions ?? 0) > 0;
    const tp = scored.filter((row) => row.entry.positive && predicted(row)).length;
    const fp = scored.filter((row) => !row.entry.positive && predicted(row)).length;
    const fn = rows.filter((row) => row.entry.positive && !predicted(row)).length;
    const exact = scored.filter((row) => "completions" in row.result && row.result.completions === row.entry.expectedCompletions).length;
    const report = {
      n: rows.length, invalid: rows.filter((row) => "invalid" in row.result).map((row) => row.result),
      tp, fp, fn, precision: tp + fp ? tp / (tp + fp) : null, recall: tp + fn ? tp / (tp + fn) : null, exactCount: exact,
      disagreements: rows.filter((row) => !("completions" in row.result) || row.result.completions !== row.entry.expectedCompletions)
        .map((row) => ({ id: row.entry.id, positive: row.entry.positive, expected: row.entry.expectedCompletions, got: row.result, why: row.entry.why })),
    };
    if (process.env.SO_MEASURE === "1") writeFileSync(join(DIR, "result.json"), `${JSON.stringify(report, null, 1)}\n`);
    expect(report.n).toBe(50);
  });
});
