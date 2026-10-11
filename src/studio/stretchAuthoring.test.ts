import { parseStoryV2OrThrow, stretchDestination, type CheckpointStretch, type Transition } from "@engine/index";
import { OPEN_STRETCH_LINE, pullLine } from "@pacing/index";
import { readCheckpoint, readCheckpointPatch } from "@copilot/parseFields";
import { arrivalExit, newOpenStretch, offArrivalExits, stretchExits, withArrival, withMaxTurns, withPace, withPullAfter } from "./stretchDraft";
import { currentCheckpointText } from "@runtime/stretchTurns";

const arrive = { q: "reached_walls", op: "==", v: true } as const;

const story = (stretch: Record<string, unknown> | null, extra: { player_name?: string; exits?: Array<Record<string, unknown>> } = {}) => parseStoryV2OrThrow({
  format: 2, id: "road-test", title: "Road test", description: "Open stretch authoring fixture.",
  qualities: [{ key: "reached_walls", type: "bool", source: "extractor", rubric: "Arrived at the walls?" }],
  checkpoints: [
    { id: "road", name: "On the road", objective: "Reach the walls.", type: "intermediate", start: true, ...(stretch ? { stretch } : {}) },
    { id: "walls", name: "The walls", objective: "The gate is shut.", type: "anchor", ...(extra.player_name ? { player_name: extra.player_name } : {}) },
    { id: "camp", name: "The camp", objective: "Rest.", type: "anchor" },
  ],
  transitions: extra.exits ?? [{ from: "road", to: "walls", priority: 1, gate: arrive }],
  roster: [],
});

describe("open stretch destination (v2.8 19)", () => {
  it("names the arrival exit's target, the public name first", () => {
    const open = { mode: "open", arrive_when: arrive };
    expect(stretchDestination(story(open), "road")).toBe("The walls");
    expect(stretchDestination(story(open, { player_name: "Wendhope's walls" }), "road")).toBe("Wendhope's walls");
  });

  it("picks the exit on the arrival gate among several on it, by priority", () => {
    const loaded = story({ mode: "open", arrive_when: arrive }, { exits: [{ from: "road", to: "camp", priority: 1, gate: arrive }, { from: "road", to: "walls", priority: 5, gate: arrive }] });
    expect(stretchDestination(loaded, "road")).toBe("The walls");
  });

  it("is null outside an open stretch", () => {
    expect(stretchDestination(story(null), "road")).toBeNull();
    expect(stretchDestination(story(null), "walls")).toBeNull();
  });

  it("the pull line names the destination; with none it reads as before, and before the pull there is no hook", () => {
    expect(pullLine("gentle", "The walls")).toContain("let the next place (The walls) make itself felt");
    expect(pullLine("steady", "The walls")).toContain("one hook toward the next place (The walls).");
    expect(pullLine("strong", "The walls")).toContain("press toward the next place (The walls) plainly in this reply");
    expect(pullLine("gentle")).toBe(`${OPEN_STRETCH_LINE} Now and then let the next place make itself felt (a mention, a turn in the weather), as a hook, never a push. Never move the party there or narrate the decision to go.`);
    expect(pullLine(null, "The walls")).toBe(OPEN_STRETCH_LINE);
  });
});

describe("{{story_current_checkpoint}} in an open stretch (v2.8 19: no task)", () => {
  const snapshot = { activeCheckpointId: "road", activeCheckpointName: "On the road", activeObjective: "Reach the walls." };

  it("leaves the objective out in an open stretch and keeps it elsewhere", () => {
    expect(currentCheckpointText(story({ mode: "open", arrive_when: arrive }), snapshot)).toBe("On the road");
    expect(currentCheckpointText(story(null), snapshot)).toBe("On the road — Reach the walls.");
    expect(currentCheckpointText(story(null), { ...snapshot, activeObjective: "" })).toBe("On the road");
    expect(currentCheckpointText(null, { activeCheckpointId: null, activeCheckpointName: null, activeObjective: null })).toBe("(none)");
  });
});

describe("the wizard writes a stretch through updateCheckpoint (v2.8 19)", () => {
  it("reads a valid stretch with the pace defaults filled", () => {
    const issues: string[] = [];
    const patch = readCheckpointPatch({ stretch: { mode: "open", pace: "brief", arrive_when: arrive } }, "ops.0.patch", issues);
    expect(issues).toEqual([]);
    expect(patch.stretch).toEqual({ mode: "open", pace: "brief", pull_after: 3, arrive_when: arrive });
  });

  it("refuses a stretch the validator would refuse, naming the field", () => {
    const issues: string[] = [];
    const patch = readCheckpointPatch({ stretch: { mode: "open", offer: ["encounters"] } }, "ops.0.patch", issues);
    expect(patch.stretch).toBeUndefined();
    expect(issues).toEqual(expect.arrayContaining([
      "ops.0.patch.stretch.offer: offer is not built yet: a stretch has no complications or encounters",
      "ops.0.patch.stretch.arrive_when: an open stretch needs arrive_when, the arrival that lets the player leave",
    ]));
  });

  it("null clears the stretch; a new checkpoint carries one", () => {
    const issues: string[] = [];
    const cleared = readCheckpointPatch({ stretch: null }, "p", issues);
    expect("stretch" in cleared && cleared.stretch === undefined).toBe(true);
    expect(readCheckpoint({ id: "road", type: "intermediate", stretch: { mode: "open", arrive_when: arrive } }, "c", issues)?.stretch?.pull_after).toBe(6);
    expect(readCheckpoint({ id: "road", type: "intermediate" }, "c", issues)).not.toHaveProperty("stretch");
    expect(issues).toEqual([]);
  });
});

describe("the Studio stretch editor's draft helpers (v2.8 19)", () => {
  const transitions: Transition[] = [
    { from: "road", to: "walls", priority: 1, gate: arrive },
    { from: "camp", to: "walls", priority: 1, gate: arrive },
    { from: "road", to: "camp", priority: 0, gate: { q: "player_turns_in_checkpoint", op: ">=", v: 8 } },
  ];
  const checkpoints = [{ id: "road", name: "On the road" }, { id: "walls", name: "The walls", player_name: "Wendhope's walls" }, { id: "camp", name: "The camp" }];
  const exits = stretchExits("road", transitions, checkpoints);

  it("lists this beat's exits by their transition index and public name", () => {
    expect(exits.map((exit) => [exit.index, exit.toName])).toEqual([[0, "Wendhope's walls"], [2, "The camp"]]);
  });

  it("opens on the first exit's gate at the default pace, and names the side exits the validator refuses", () => {
    const stretch = newOpenStretch(exits);
    expect(stretch).toEqual({ mode: "open", pace: "unhurried", pull_after: 6, arrive_when: arrive });
    expect(arrivalExit(stretch, exits)?.to).toBe("walls");
    expect(offArrivalExits(stretch, exits).map((exit) => exit.to)).toEqual(["camp"]);
    expect(arrivalExit(withArrival(stretch, exits[1]), exits)?.to).toBe("camp");
    expect(newOpenStretch([]).arrive_when).toEqual({ all: [] });
  });

  it("pace sets pull_after, and a plain pull at or below it is dropped rather than stored invalid", () => {
    const base: CheckpointStretch = { mode: "open", pace: "unhurried", pull_after: 6, max_turns: 8, arrive_when: arrive };
    expect(withPace(base, "long")).toEqual({ mode: "open", pace: "long", pull_after: 10, arrive_when: arrive });
    expect(withPace(base, "brief")).toEqual({ ...base, pace: "brief", pull_after: 3 });
    expect(withPullAfter(base, 7)).toEqual({ ...base, pull_after: 7 });
    expect(withPullAfter(base, 0).pull_after).toBe(6);
    expect(withPullAfter(base, 9)).not.toHaveProperty("max_turns");
    expect(withMaxTurns(base, 6)).not.toHaveProperty("max_turns");
    expect(withMaxTurns(base, 12).max_turns).toBe(12);
    expect(withMaxTurns(base, undefined)).not.toHaveProperty("max_turns");
  });

  it("every stretch the helpers build validates once the arrival exit exists", () => {
    const built = withMaxTurns(withPace(newOpenStretch(exits), "brief"), 6);
    expect(() => story(built as unknown as Record<string, unknown>)).not.toThrow();
  });
});
