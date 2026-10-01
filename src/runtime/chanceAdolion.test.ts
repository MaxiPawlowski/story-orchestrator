import { execFileSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  StoryEngine, parseStoryV2OrThrow, type GateNode, type NormalizedStoryV2, type NormalizedTransition, type PrimitiveValue,
} from "@engine/index";
import { chanceGateValues } from "./chance";

const root = join(__dirname, "../..");
const pin = JSON.parse(readFileSync(join(root, "scripts/debug/adolion-fresh.pin.json"), "utf8")) as { repo: string; commit: string };
const campaignAt = (path: string) => execFileSync("git", ["-C", pin.repo, "show", `${pin.commit}:${path}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const campaignStories = (): string[] => {
  if (!existsSync(pin.repo)) return [];
  try {
    return execFileSync("git", ["-C", pin.repo, "ls-tree", "--name-only", pin.commit, "build/story/"], { encoding: "utf8" })
      .split(/\r?\n/).filter((path) => path.endsWith(".story.json"));
  } catch {
    return [];
  }
};
const paths = campaignStories();

const SAGA_ROLLS = ["wall_breached", "aegis_examiner_watching", "deep_swarm", "east_upset", "night_moon", "esha_her_gaze", "war_turn"];
const CHATS = 300;

interface RollBranch {
  story: NormalizedStoryV2;
  key: string;
  odds: number;
  branch: NormalizedTransition;
}

const flip = (value: PrimitiveValue): PrimitiveValue => (typeof value === "boolean" ? !value : typeof value === "number" ? value + 1 : `${value} (not)`);

const satisfy = (node: GateNode, skip: string, out: Record<string, PrimitiveValue>): Record<string, PrimitiveValue> => {
  if ("all" in node) node.all.forEach((child) => satisfy(child, skip, out));
  else if ("any" in node) satisfy(node.any[0], skip, out);
  else if ("q" in node && node.q !== skip) {
    const value = Array.isArray(node.v) ? node.v[0] : node.v;
    out[node.q] = node.op === "!=" ? flip(value) : node.op === ">" ? (value as number) + 0.01 : node.op === "<" ? (value as number) - 0.01 : value;
  }
  return out;
};

const rollsIn = (story: NormalizedStoryV2): RollBranch[] =>
  story.qualities.flatMap((quality) => {
    if (!quality.roll) return [];
    const branch = story.transitions.find((transition) => JSON.stringify(transition.gate).includes(`{"q":"${quality.key}","op":"==","v":true}`)) as NormalizedTransition | undefined;
    return branch ? [{ story, key: quality.key, odds: quality.roll.target / quality.roll.sides, branch }] : [];
  });

const play = ({ story, key, branch }: RollBranch, chatId: string | null) => {
  const engine = new StoryEngine({ now: () => 0, derive: (view) => (chatId ? chanceGateValues(story.qualities, { chatId, storyId: story.id ?? "", }, view) : []) });
  engine.loadStory(story);
  engine.activateCheckpoint(branch.from, { lastMessageId: 0, chatLength: 1 });
  const writes = satisfy(branch.gate, key, {});
  engine.enqueue({ source: "extractor", blackboardVersionSum: 0, turnRange: { from: 1, to: 1 }, deltas: Object.entries(writes).map(([q, v]) => ({ q, v, source: "extractor" as const })) });
  const result = engine.commitBoundary({ lastMessageId: 1, chatLength: 2 });
  const entry = engine.stateLog[engine.stateLog.length - 1];
  return { drawn: entry.evaluated?.[key], to: result.fired?.to ?? null };
};

(paths.length ? describe : describe.skip)("SP7.b: the Adolion roll checkpoints play on a prod build", () => {
  const stories = paths.map((path) => parseStoryV2OrThrow(JSON.parse(campaignAt(path))));
  const rolls = stories.flatMap(rollsIn);

  it("the seven saga rolls survive validation as roll qualities", () => {
    expect([...new Set(rolls.map((roll) => roll.key))].sort()).toEqual([...SAGA_ROLLS].sort());
  });

  it.each(SAGA_ROLLS)("%s: the committed draw opens its branch at its odds, and only the draw does", (key) => {
    const cases = rolls.filter((roll) => roll.key === key);
    expect(cases.length).toBeGreaterThan(0);
    for (const roll of cases) {
      const runs = Array.from({ length: CHATS }, (_, index) => play(roll, `adolion-chat-${index}`));
      const branched = runs.filter((run) => run.to === roll.branch.to);
      expect(runs.every((run) => typeof run.drawn === "boolean")).toBe(true);
      expect(runs.every((run) => (run.to === roll.branch.to) === (run.drawn === true))).toBe(true);
      expect(Math.abs(branched.length / CHATS - roll.odds)).toBeLessThan(0.1);
    }
  });

  it.each(SAGA_ROLLS)("control: %s never branches without the seed (the build before SP7.b)", (key) => {
    for (const roll of rolls.filter((entry) => entry.key === key)) {
      const run = play(roll, null);
      expect(run.drawn).toBeUndefined();
      expect(run.to).not.toBe(roll.branch.to);
    }
  });
});
