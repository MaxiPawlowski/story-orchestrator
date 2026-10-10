import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { parseStoryV2OrThrow } from "@engine/index";
import { guardDraft } from "./guard";
import { parseDirectorDraft } from "./parse";
import { buildDirectorOps, checkDirectorOps, planChapter } from "./plan";

const ROOT = join(process.cwd(), "test/goldens/live/living-director");

interface Golden {
  frontierId: string;
  raw: Record<string, unknown>;
  reply: string;
  verdict: { parse: string[]; check: string[]; guard: string[] };
}

const goldens = readdirSync(ROOT).flatMap((run) => readdirSync(join(ROOT, run)).map((file) => ({
  name: `${run}/${file}`, golden: JSON.parse(readFileSync(join(ROOT, run, file), "utf8")) as Golden,
})));

const verdictOf = (golden: Golden) => {
  const story = parseStoryV2OrThrow(golden.raw);
  const parsed = parseDirectorDraft(golden.reply, story);
  if (!parsed.ok) return { parse: parsed.issues, check: [], guard: [] };
  const plan = planChapter(story, golden.frontierId, { sealsOn: true, final: parsed.draft.anchor.final, newChapter: parsed.draft.newChapter });
  const built = buildDirectorOps(story, golden.frontierId, parsed.draft, plan);
  const check = checkDirectorOps({ raw: golden.raw, story, frontierId: golden.frontierId, ops: built.ops, values: {}, latched: {} }).issues;
  return { parse: [], check: [...built.issues, ...check], guard: guardDraft(parsed.draft, { playerNames: ["Max"], restatesSecret: () => false }) };
};

describe("v2.8 22 M1: recorded director answers (DeepSeek flash, 2026-10-10) replay to the same verdicts", () => {
  it("has both runs", () => {
    expect(new Set(goldens.map((entry) => entry.name.split("/")[0]))).toEqual(new Set(["run1", "run2"]));
  });

  it.each(goldens.map((entry) => [entry.name, entry.golden] as const))("%s", (_name, golden) => {
    expect(verdictOf(golden)).toEqual(golden.verdict);
  });

  it("no recorded answer that parsed was refused for an impossible gate or a way in already open", () => {
    const refused = goldens.flatMap((entry) => entry.golden.verdict.check.filter((issue) => /impossible|already holds|open on arrival|can never/i.test(issue)).map((issue) => `${entry.name}: ${issue}`));
    expect(refused).toEqual([]);
  });
});
