import { DEFAULT_AGENCY, OBJECTIVE_LINE_HEADER, objectiveClause, objectiveLine, objectiveLineApplies } from "./agency";
import { parseStoryV2, parseStoryV2OrThrow } from "./validate";
import { isValidationErrorList, type Checkpoint, type StoryV2 } from "./schema";
import { composeGuidanceBlock } from "@pacing/guidance";

const checkpoint = (effects?: Checkpoint["effects"], objective = "Reach the gate."): Checkpoint => ({ id: "cp", name: "CP", objective, type: "anchor", ...(effects ? { effects } : {}) });
const auto = { objective_block: undefined } as Pick<StoryV2, "objective_block">;

describe("objectiveLineApplies (v2.4 plan 06 T16a)", () => {
  it.each([
    ["an inherited note (author_note absent)", checkpoint(), true],
    ["a generated beat (no effects at all)", { id: "gen:1", name: "Beat", objective: "Find the key.", type: "intermediate" } as Checkpoint, true],
    ["a note cleared with null", checkpoint({ author_note: null }), true],
    ["an empty string note", checkpoint({ author_note: "  " }), true],
    ["an object note with empty text", checkpoint({ author_note: { text: "" } }), true],
    ["its own string note", checkpoint({ author_note: "Keep the gate tense." }), false],
    ["its own object note", checkpoint({ author_note: { text: "Keep the gate tense.", role: "system" } }), false],
    ["no objective to state", checkpoint(undefined, "  "), false],
  ])("%s", (_label, cp, expected) => {
    expect(objectiveLineApplies(auto, cp)).toBe(expected);
  });

  it("is off when the story says off, whatever the checkpoint", () => {
    expect(objectiveLineApplies({ objective_block: "off" }, checkpoint())).toBe(false);
    expect(objectiveLineApplies({ objective_block: "auto" }, checkpoint())).toBe(true);
  });

  it("renders one line with the agency clause and no player clause or look-ahead", () => {
    const line = objectiveLine(checkpoint(), DEFAULT_AGENCY);
    expect(line).toBe(`${OBJECTIVE_LINE_HEADER} Reach the gate. ${objectiveClause("world_pressure")}`);
    expect(line.split("\n")).toHaveLength(1);
    expect(objectiveLine(checkpoint(), { ...DEFAULT_AGENCY, objective_kind: "player_action" })).toContain(objectiveClause("player_action"));
  });

  it("rides the guidance block: after the guidance, alone without it, absent when it does not apply", () => {
    const guided = { ...checkpoint(), guidance: "The gate is watched." };
    expect(composeGuidanceBlock(guided, DEFAULT_AGENCY, true)).toBe(`Scene direction: The gate is watched.\n${objectiveLine(guided, DEFAULT_AGENCY)}`);
    expect(composeGuidanceBlock(checkpoint(), DEFAULT_AGENCY, true)).toBe(objectiveLine(checkpoint(), DEFAULT_AGENCY));
    expect(composeGuidanceBlock(guided, DEFAULT_AGENCY, false)).toBe("Scene direction: The gate is watched.");
  });
});

describe("objective_block schema (v2.4 plan 06 T16a)", () => {
  const story = (value?: unknown) => ({
    format: 2, id: "objective", title: "Objective", description: "", qualities: [], transitions: [], roster: [],
    checkpoints: [{ id: "cp", name: "CP", objective: "Go.", type: "anchor", start: true }],
    ...(value === undefined ? {} : { objective_block: value }),
  });

  it("keeps auto and off, and leaves it absent when absent", () => {
    expect(parseStoryV2OrThrow(story("off")).objective_block).toBe("off");
    expect(parseStoryV2OrThrow(story("auto")).objective_block).toBe("auto");
    expect(parseStoryV2OrThrow(story()).objective_block).toBeUndefined();
  });

  it("rejects any other value", () => {
    const parsed = parseStoryV2(story("sometimes"));
    expect(isValidationErrorList(parsed) ? parsed : []).toEqual([{ path: "objective_block", message: 'objective_block must be "auto" or "off"' }]);
  });
});
