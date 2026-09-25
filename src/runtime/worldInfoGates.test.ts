import * as sunRuins from "../../examples/sun-ruins/quest-for-the-sun-ruins.json";
import { gatedWorldInfo, parseStoryV2OrThrow, readWorldInfoEffect } from "@engine/index";
import { releasePlan, worldInfoPlan } from "./worldInfoGates";

const story = (checkpoints: Array<{ id: string; type?: string; world_info?: unknown }>) => parseStoryV2OrThrow({
  format: 2,
  title: "Gates",
  description: "World info gate fixture.",
  qualities: [],
  checkpoints: checkpoints.map((checkpoint, index) => ({
    id: checkpoint.id,
    name: checkpoint.id,
    objective: checkpoint.id,
    type: checkpoint.type ?? "anchor",
    ...(index === 0 ? { start: true } : {}),
    ...(checkpoint.world_info ? { effects: { world_info: checkpoint.world_info } } : {}),
  })),
  transitions: [],
  roster: [],
});

const book = (comments: string[]) => [{ lorebook: "Book", comments }];
const planFor = (plans: ReturnType<typeof worldInfoPlan>, lorebook: string) => plans.find((plan) => plan.lorebook === lorebook);

describe("readWorldInfoEffect", () => {
  it("reads the authored aliases and drops what names no book or no entry", () => {
    expect(readWorldInfoEffect({
      enable: [{ book: "B", comment: " One " }, { lorebook: "A", comments: ["Two", "", 3] }, { lorebook: "C", comments: [] }, "junk"],
      disable: { lorebook: "A", comments: "Three" },
    })).toEqual({
      enable: [{ lorebook: "B", comments: ["One"] }, { lorebook: "A", comments: ["Two"] }],
      disable: [{ lorebook: "A", comments: ["Three"] }],
    });
    expect(readWorldInfoEffect(null)).toEqual({ enable: [], disable: [] });
  });
});

describe("worldInfoPlan", () => {
  const gated = story([
    { id: "one", world_info: { enable: book(["One"]) } },
    { id: "two", world_info: { enable: book(["Two"]) } },
    { id: "three", world_info: { enable: book(["Three"]), disable: book(["One"]) } },
    { id: "four", world_info: { disable: book(["Never on"]) } },
  ]);

  it("turns every gated entry off before any checkpoint was entered", () => {
    expect(worldInfoPlan(gated, [])).toEqual([{ lorebook: "Book", enable: [], disable: ["One", "Two", "Three", "Never on"] }]);
  });

  it("keeps what earlier checkpoints on the path enabled, the way one continuous run does", () => {
    expect(worldInfoPlan(gated, ["one", "two"])).toEqual([{ lorebook: "Book", enable: ["One", "Two"], disable: ["Three", "Never on"] }]);
  });

  it("lets a later checkpoint switch an earlier entry off, and replays in path order", () => {
    expect(planFor(worldInfoPlan(gated, ["one", "two", "three"]), "Book")).toEqual({ lorebook: "Book", enable: ["Two", "Three"], disable: ["One", "Never on"] });
    expect(planFor(worldInfoPlan(gated, ["three", "one"]), "Book")?.enable).toEqual(["One", "Three"]);
  });

  it("covers every gated entry exactly once and ignores ids the story does not have", () => {
    const [plan] = worldInfoPlan(gated, ["one", "ghost"]);
    expect([...plan.enable, ...plan.disable].sort()).toEqual(["Never on", "One", "Three", "Two"]);
  });

  it("carries an intermediate checkpoint's entries on to the checkpoints after it (sun-ruins cp-4a -> cp-4a1)", () => {
    const example = parseStoryV2OrThrow(sunRuins);
    const plan = planFor(worldInfoPlan(example, ["cp1", "cp2", "cp3", "cp-4a", "cp-4a1"]), "Xentar Checkpoints");
    expect(plan?.enable).toEqual(expect.arrayContaining(["CP1 - Mission", "CP3 - Luke", "CP4 - Scenario", "CP4 - Sphinx", "CP4 - Sphinx's Riddle"]));
    const early = planFor(worldInfoPlan(example, ["cp1"]), "Xentar Checkpoints");
    expect(early?.enable).toEqual(["CP1 - Mission", "CP1 - Scenario"]);
    expect(early?.disable).toEqual(expect.arrayContaining(["CP2 - Scenario", "CP4 - Sphinx"]));
  });
});

describe("releasePlan", () => {
  const a = story([{ id: "a", world_info: { enable: [{ lorebook: "Shared", comments: ["A", "Both"] }] } }]);
  const b = story([{ id: "b", world_info: { enable: [{ lorebook: "Shared", comments: ["B", "Both"] }, { lorebook: "Own", comments: ["B own"] }] } }]);

  it("turns off what the leaving stories gate, except what the incoming story gates too", () => {
    expect(releasePlan([a, b], b)).toEqual([{ lorebook: "Shared", enable: [], disable: ["A"] }]);
  });

  it("turns off everything when no story takes over, and skips books with nothing left to release", () => {
    expect(releasePlan([a, b], null)).toEqual([
      { lorebook: "Shared", enable: [], disable: ["A", "Both", "B"] },
      { lorebook: "Own", enable: [], disable: ["B own"] },
    ]);
    expect(releasePlan([a], a)).toEqual([]);
  });

  it("keeps what the incoming story gates when another story names the same book in another case (v2.4 plan 05)", () => {
    const lower = story([{ id: "l", world_info: { enable: [{ lorebook: "shared", comments: ["Both", "L"] }] } }]);
    expect(releasePlan([a, lower], a)).toEqual([{ lorebook: "shared", enable: [], disable: ["L"] }]);
  });

  it("keeps every entry of a story that spells its own book two ways", () => {
    const both = story([{ id: "k", world_info: { enable: [{ lorebook: "Shared", comments: ["X"] }, { lorebook: "shared", comments: ["Y"] }] } }]);
    expect(releasePlan([both], both)).toEqual([]);
  });

  it("reads raw library records as well as normalized stories", () => {
    expect(gatedWorldInfo([{ checkpoints: [{ effects: { world_info: { disable: book(["Raw"]) } } }] }, "junk", null])).toEqual(new Map([["Book", new Set(["Raw"])]]));
  });
});
