import { isValidationErrorList, type Story, type ValidationError } from "./schema";
import { parseStory, parseStoryOrThrow } from "./validate";

const story = (roster: unknown): Story => ({
  id: "roster-role-fixture",
  title: "Roster role fixture",
  description: "One-line roles for the judge director.",
  qualities: [{ key: "arrived", type: "bool", source: "extractor", rubric: "Arrived?" }],
  checkpoints: [{ id: "cp1", name: "The road", objective: "Walk", type: "anchor", start: true }],
  transitions: [],
  roster: roster as Story["roster"],
});

const errors = (json: unknown): ValidationError[] => {
  const parsed = parseStory(json);
  return isValidationErrorList(parsed) ? parsed : [];
};

describe("roster roles (v2.2 plan 01)", () => {
  it("keeps a trimmed role and drops a blank one", () => {
    const parsed = parseStoryOrThrow(story([
      { id: "guard", name: "Mara", role: "  gate captain " },
      { id: "sage", name: "Finn", role: "   " },
      { id: "thief" },
    ]));
    expect(parsed.roster).toEqual([{ id: "guard", name: "Mara", role: "gate captain" }, { id: "sage", name: "Finn" }, { id: "thief" }]);
  });

  it("rejects a role that is not text", () => {
    expect(errors(story([{ id: "guard", name: "Mara", role: 7 }]))).toEqual([{ path: "roster.0.role", message: "roster role must be a string" }]);
  });
});
