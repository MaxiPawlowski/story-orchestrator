import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gatedWorldInfo, parseStoryV2OrThrow } from "@engine/index";
import { mergeExpansions } from "@generation/merge";
import { parseGeneratedBeats } from "@generation/parse";
import { worldInfoPlan } from "../runtime/worldInfoGates";

const root = join(__dirname, "../..");
const BOOK = "Saga Scenes";
const SCENE = "CP start - Scene";
const OTHER = "CP finish - Scene";

const saga = (stubLore: boolean) => {
  const raw = JSON.parse(readFileSync(join(root, "test/fixtures/background-generation.story.json"), "utf8"));
  raw.checkpoints = raw.checkpoints.map((checkpoint: { id: string }) => {
    if (checkpoint.id === "start") return { ...checkpoint, effects: { world_info: { enable: [{ lorebook: BOOK, comments: [SCENE] }] } } };
    if (checkpoint.id === "finish") return { ...checkpoint, effects: { world_info: { disable: [{ lorebook: BOOK, comments: [SCENE] }], enable: [{ lorebook: BOOK, comments: [OTHER] }] } } };
    if (checkpoint.id === "bridge_stub" && stubLore) return { ...checkpoint, effects: { world_info: { disable: [{ lorebook: BOOK, comments: [SCENE] }] } } };
    return checkpoint;
  });
  return raw;
};

const merged = (raw: unknown) => {
  const parsed = parseGeneratedBeats(readFileSync(join(root, "test/goldens/background-generator1.response.txt"), "utf8"), parseStoryV2OrThrow(raw));
  expect(parsed.issues).toEqual([]);
  return mergeExpansions(raw, { bridge: { status: "inserted", sourceCheckpointId: "start", stubId: "bridge_stub", targetAnchorId: "finish", beats: parsed.beats } } as never);
};

const sceneOn = (story: ReturnType<typeof merged>, path: string[]) => worldInfoPlan(story, path).find((plan) => plan.lorebook === BOOK)?.enable.includes(SCENE);

describe("v2.8 31 F2: a generated stretch plays its stub's beat lore", () => {
  it("the first generated beat carries the stub's world_info, the others carry none", () => {
    const story = merged(saga(true));
    const generated = story.checkpoints.filter((checkpoint) => checkpoint.id.startsWith("gen_bridge_stub_"));
    expect(generated.length).toBeGreaterThan(1);
    expect(generated[0].effects?.world_info).toEqual({ disable: [{ lorebook: BOOK, comments: [SCENE] }] });
    expect(generated.slice(1).every((checkpoint) => checkpoint.effects?.world_info === undefined)).toBe(true);
  });

  it("the passed scene goes off when the stretch starts, expanded or not, and the path replay of every prefix agrees", () => {
    const story = merged(saga(true));
    const chain = story.checkpoints.filter((checkpoint) => checkpoint.id.startsWith("gen_bridge_stub_")).map((checkpoint) => checkpoint.id);
    expect(sceneOn(story, ["start"])).toBe(true);
    expect(sceneOn(story, ["start", "bridge_stub"])).toBe(false);
    const path = ["start", ...chain, "finish"];
    for (let at = 2; at <= path.length; at += 1) expect(sceneOn(story, path.slice(0, at))).toBe(false);
    expect(worldInfoPlan(story, ["start", chain[0]])).toEqual(worldInfoPlan(story, ["start", "bridge_stub"]));
  });

  it("control: a stub without beat lore leaves the passed scene on through the whole stretch (the F2 defect)", () => {
    const story = merged(saga(false));
    const chain = story.checkpoints.filter((checkpoint) => checkpoint.id.startsWith("gen_bridge_stub_")).map((checkpoint) => checkpoint.id);
    expect(chain.every((_, at) => sceneOn(story, ["start", ...chain.slice(0, at + 1)]))).toBe(true);
    expect(sceneOn(story, ["start", ...chain, "finish"])).toBe(false);
  });

  it("adds no entry to the story's gated set", () => {
    expect(gatedWorldInfo([merged(saga(true))])).toEqual(gatedWorldInfo([saga(true)]));
  });
});
