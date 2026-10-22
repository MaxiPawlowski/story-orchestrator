import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import { GUARD_CODES, guardRewrite } from "./guards";
import { judgePolish, planPolish, type PolishPlan } from "./plan";

const ROOT = join(__dirname, "..", "..");
const read = (name: string) => readFileSync(join(ROOT, "test", "fixtures", "polish", name), "utf8").replace(/\r\n/g, "\n");

const FROZEN: Record<string, string> = {
  "structural-refusals.json": "0de6d1a93005de6afde569588b78b9c1bc37e959034aa72f0e6bbafa62b9a3aa",
  "semantic-challenges.json": "7de36b45dd910b5c3cd295eacf262fd5c8983f041dffb67402d2e74720010fb9",
};

interface Context { speaker: string; text: string }
interface Base {
  reply: string; speaker: string; sheet: { avoid?: string[]; tics?: string[] }; tics: string[]; repeats: string[];
  playerNames: string[]; names: string[]; context: Context[];
}
interface StructuralCase { id: string; answer?: string; candidate?: string; finish?: string; reply?: string; secret?: string; context?: Context[]; expect: string }
interface Structural { base: Base; accepted: string; cases: StructuralCase[] }
interface SemanticCase { id: string; change: string; reply: string; answer: string }
interface Semantic { speaker: string; sheet: { avoid?: string[]; tics?: string[] }; tics: string[]; cases: SemanticCase[] }

const structural = JSON.parse(read("structural-refusals.json")) as Structural;
const semantic = JSON.parse(read("semantic-challenges.json")) as Semantic;

const planFor = (base: Base, reply = base.reply, context = base.context): PolishPlan => {
  const plan = planPolish({ reply, speaker: base.speaker, sheet: base.sheet, tics: base.tics, repeats: base.repeats, withheld: [], context });
  if ("skip" in plan) throw new Error(`fixture reply has no finding: ${reply}`);
  return plan;
};

const verdictFor = (entry: StructuralCase) => {
  const plan = planFor(structural.base, entry.reply, entry.context);
  const restates = entry.secret ? (text: string) => text.includes(entry.secret as string) : undefined;
  const context = { names: structural.base.names, playerNames: structural.base.playerNames, restates };
  if (entry.candidate !== undefined) {
    return guardRewrite({ original: plan.reply, windows: plan.windows, candidate: entry.candidate, targets: plan.targets, reference: plan.reference, ...context });
  }
  return judgePolish(plan, { text: entry.answer ?? "", finish: entry.finish }, context);
};

describe("v2.9 plan 03 S1: frozen guard fixture sets", () => {
  it("are frozen before any inference: their contents hash to the recorded values", () => {
    const hashes = Object.fromEntries(Object.keys(FROZEN).map((name) => [name, createHash("sha256").update(read(name)).digest("hex")]));
    expect(hashes).toEqual(FROZEN);
  });
});

describe("v2.9 plan 03 S1: structural refusal set (100 % refused, not a floor)", () => {
  it("accepts the clean rewrite of the base reply (control)", () => {
    const plan = planFor(structural.base);
    const verdict = judgePolish(plan, { text: structural.accepted }, { names: structural.base.names, playerNames: structural.base.playerNames });
    expect(verdict.status).toBe("accepted");
    expect(verdict.candidate).toBe("*Mara leans on the rail and grins.* \"The tide turns at dawn,\" she says. She does not look back, and her voice is quiet.");
  });

  it.each(structural.cases.map((entry) => [entry.id, entry] as const))("%s is refused with its code", (_id, entry) => {
    const verdict = verdictFor(entry);
    expect(verdict.status).toBe("refused");
    expect(verdict.refusals.map((refusal) => refusal.code)).toContain(entry.expect);
  });

  it("covers every structural guard the plan names", () => {
    const named = ["negation-changed", "modal-changed", "added-name", "added-number", "player-action", "quote-changed", "outside-window", "no-finding-reduced",
      "truncated", "reasoning-tagged", "length-band", "copied-reference"];
    expect(named.filter((code) => !structural.cases.some((entry) => entry.expect === code))).toEqual([]);
    expect(structural.cases.every((entry) => (GUARD_CODES as readonly string[]).includes(entry.expect))).toBe(true);
  });

  it("an answer equal to the original after whitespace is unchanged, never a write", () => {
    const plan = planFor(structural.base);
    const verdict = judgePolish(plan, { text: "[1] *Mara  leans on the rail and smirks.*\n[2] She does not look back, and her voice is, indeed,  quiet." },
      { names: [], playerNames: [] });
    expect(verdict.status).toBe("unchanged");
  });
});

describe("v2.9 plan 03 S1: semantic challenge set (scored and reported, never asserted refused)", () => {
  it("scores every case through the guards and reports how many pass them", () => {
    const rows = semantic.cases.map((entry) => {
      const plan = planPolish({ reply: entry.reply, speaker: semantic.speaker, sheet: semantic.sheet, tics: semantic.tics, repeats: [], withheld: [], context: [] });
      if ("skip" in plan) throw new Error(`fixture reply has no finding: ${entry.id}`);
      return { id: entry.id, change: entry.change, status: judgePolish(plan, { text: entry.answer }, { names: [], playerNames: [] }).status };
    });
    const report = { total: rows.length, guardPassing: rows.filter((row) => row.status === "accepted").length, refused: rows.filter((row) => row.status === "refused").length };
    expect(report.total).toBe(semantic.cases.length);
    expect(report.guardPassing + report.refused + rows.filter((row) => row.status === "unchanged").length).toBe(report.total);
    expect(rows.every((row) => ["accepted", "refused", "unchanged"].includes(row.status))).toBe(true);
  });
});
