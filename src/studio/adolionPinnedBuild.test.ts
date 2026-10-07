import { execFileSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { parseStoryV2, type GateNode, type NormalizedStoryV2, type StoryV2 } from "@engine/index";
import { runDiagnostics } from "./diagnostics";

const root = join(__dirname, "../..");
const pin = JSON.parse(readFileSync(join(root, "scripts/debug/adolion-fresh.pin.json"), "utf8")) as { repo: string; commit: string };
const repo = process.env.ADOLION_CAMPAIGN || pin.repo;
const git = (args: string[]) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const DIRS = ["build/story/", "lab/life/", "lab/quests/", "lab/stretches/"];

const pinnedFiles = (): string[] => {
  if (!existsSync(repo)) return [];
  try {
    return DIRS.flatMap((dir) => git(["ls-tree", "--name-only", pin.commit, dir]).split(/\r?\n/).filter((path) => path.endsWith(".story.json")));
  } catch {
    return [];
  }
};
const files = pinnedFiles();

const CAMPAIGN = ["adolion-academy", "adolion-adventurer", "adolion-aegis", "adolion-deep", "adolion-east", "adolion-esha", "adolion-night", "adolion-saga", "adolion-war"];
const LAB = [
  "lab/life/esha-life.story.json", "lab/quests/academy-quests.story.json", "lab/quests/academy-quests.arm-0.story.json",
  "lab/quests/academy-quests.arm-5.story.json", "lab/quests/academy-quests.arm-10.story.json", "lab/quests/academy-quests.arm-20.story.json",
  "lab/stretches/aegis-open.story.json", "lab/stretches/adventurer-open.story.json",
];

const leaves = (gate: GateNode): string[] => {
  if ("q" in gate) return [gate.q];
  if ("all" in gate) return gate.all.flatMap(leaves);
  if ("any" in gate) return gate.any.flatMap(leaves);
  return "not" in gate ? leaves(gate.not) : [];
};

const load = (path: string) => {
  const json = JSON.parse(git(["show", `${pin.commit}:${path}`])) as StoryV2;
  return { path, json, parsed: parseStoryV2(json) };
};

(files.length ? describe : describe.skip)("v2.7 38: the pinned Adolion build validates on this plugin", () => {
  const stories = files.map(load);
  const ok = (path: string) => {
    const story = stories.find((entry) => entry.path === path);
    if (!story || Array.isArray(story.parsed)) throw new Error(`${path} did not parse`);
    return story.parsed as NormalizedStoryV2;
  };

  it("the pin names nine campaign stories and the eight lab copies", () => {
    expect(stories.filter((entry) => entry.path.startsWith("build/")).map((entry) => entry.json.id).sort()).toEqual(CAMPAIGN);
    expect(stories.filter((entry) => entry.path.startsWith("lab/")).map((entry) => entry.path).sort()).toEqual([...LAB].sort());
  });

  it("every pinned story parses with no errors and no blocking or warning diagnostics", () => {
    for (const { path, json, parsed } of stories) {
      expect([path, Array.isArray(parsed) ? parsed.map((error) => error.path) : []]).toEqual([path, []]);
      const loud = runDiagnostics(json).filter((entry) => entry.severity === "blocking" || entry.severity === "warning");
      expect([path, loud.map((entry) => entry.code)]).toEqual([path, []]);
    }
  });

  it("D13a: every campaign story carries a player profile with a role and a summary, and no fixed name", () => {
    for (const entry of stories.filter((story) => story.path.startsWith("build/"))) {
      const player = (entry.parsed as NormalizedStoryV2).player;
      expect([entry.json.id, Boolean(player?.role), Boolean(player?.summary), player?.name?.mode ?? "any"]).toEqual([entry.json.id, true, true, "any"]);
    }
  });

  it("D13d: a trigger sits exactly on the transitions a read can move", () => {
    let triggers = 0;
    for (const entry of stories.filter((story) => story.path.startsWith("build/"))) {
      const story = entry.parsed as NormalizedStoryV2;
      const read = new Set(story.qualities.filter((quality) => quality.source === "extractor").map((quality) => quality.key));
      for (const transition of story.transitions) {
        const gating = leaves(transition.gate).some((key) => read.has(key));
        expect([entry.json.id, transition.from, transition.to, Boolean(transition.extractor_trigger)]).toEqual([entry.json.id, transition.from, transition.to, gating]);
        if (transition.extractor_trigger) triggers += 1;
      }
    }
    expect(triggers).toBe(493);
  });

  it("A4: the lab copies carry what their measurements need", () => {
    const life = ok("lab/life/esha-life.story.json");
    expect(life.roster?.length).toBe(7);
    expect(life.life?.members.length).toBe(6);
    expect(life.life?.members.flatMap((member) => member.relationships.flatMap((relationship) => relationship.axes)).length).toBe(16);
    expect(life.life?.members.flatMap((member) => member.agenda).length).toBe(3);
    expect(life.life?.members.flatMap((member) => member.schedule).length).toBe(1);
    expect(life.life?.clock?.times.length).toBe(4);
    expect(life.quests?.length).toBe(3);
    for (const n of [0, 5, 10, 20]) expect(ok(`lab/quests/academy-quests.arm-${n}.story.json`).quests?.length).toBe(3 + n);
    const stretches = ["lab/stretches/aegis-open.story.json", "lab/stretches/adventurer-open.story.json"]
      .flatMap((path) => ok(path).checkpoints.filter((checkpoint) => checkpoint.stretch?.mode === "open"));
    expect(stretches.length).toBe(3);
  });
});
