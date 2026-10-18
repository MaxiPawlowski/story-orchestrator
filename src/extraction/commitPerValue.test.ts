import { parseStory, type Quality } from "@engine/index";
import { applyCommitEvidence, commitPattern, type CommitStory } from "./commitGuard";
import type { EvidenceMessage } from "./evidence";
import type { ParsedDelta } from "./types";
import { textRevision } from "./playerSpan";

const escape: Quality = {
  key: "escape",
  type: "enum",
  values: ["sworn", "fled", "fought"],
  source: "extractor",
  rubric: "How did the prisoner leave the cell?",
  commit_evidence: { sworn: "\\b(swear|vow|oath)\\b" },
};

const delta = (v: string, evidence: string): ParsedDelta => ({ delta: { q: "escape", v, source: "extractor" }, evidence });
const player = (text: string): EvidenceMessage => ({ messageId: 3, text, isUser: true, speaker: "Max" });
const story = (quality: Quality): CommitStory => ({ qualityByKey: { escape: quality }, transitions: [] });

const parsed = (commit_evidence: unknown, patch: Record<string, unknown> = {}) => {
  const result = parseStory({
  id: "per-value",
  title: "Per value",
  description: "Per-value commitment fixture.",
  qualities: [{ key: "escape", type: "enum", values: ["sworn", "fled", "fought"], source: "extractor", rubric: "How?", commit_evidence, ...patch }],
  checkpoints: [{ id: "cell", name: "The Cell", objective: "Get out.", type: "anchor", start: true }],
  transitions: [],
  roster: [],
  });
  return Array.isArray(result) ? { story: null, errors: result } : { story: result, errors: [] };
};

describe("v2.8 01 C11-F2: commit_evidence per value", () => {
  it("guards only the value it names: a sworn reading needs the player's oath", () => {
    const result = applyCommitEvidence(story(escape), [delta("sworn", "The guard nods.")], () => [player("I look at the guard and say nothing.")]);
    expect(result.accepted).toEqual([]);
    expect(result.held).toEqual([expect.objectContaining({ key: "escape", value: "sworn" })]);
  });

  it("the oath commits the sworn value", () => {
    const deltas = [delta("sworn", "I swear it.")];
    const line = "I swear it: from tonight I am sworn to the keep.";
    expect(applyCommitEvidence(story(escape), deltas, () => [player(line)]).accepted)
      .toEqual([{ ...deltas[0], delta: { ...deltas[0].delta, playerSpan: { messageId: 3, revision: textRevision(line), span: [0, line.length] } } }]);
  });

  it("an action value it leaves out is set by any reading, as an unguarded quality is", () => {
    const deltas = [delta("fled", "He bolts for the door.")];
    expect(applyCommitEvidence(story(escape), deltas, () => [player("I run.")])).toEqual({ accepted: deltas, held: [] });
  });

  it("control: one pattern for the whole quality still guards every value", () => {
    const whole = { ...escape, commit_evidence: "\\b(swear|vow|oath)\\b" };
    expect(applyCommitEvidence(story(whole), [delta("fled", "He bolts.")], () => [player("I run.")]).held).toHaveLength(1);
  });

  it("reads the pattern per value, bools by their string", () => {
    expect(commitPattern(escape, "sworn")).toBe("\\b(swear|vow|oath)\\b");
    expect(commitPattern(escape, "fled")).toBeUndefined();
    expect(commitPattern({ commit_evidence: { true: "\\bdeal\\b" } }, true)).toBe("\\bdeal\\b");
    expect(commitPattern({ commit_evidence: "x" }, "anything")).toBe("x");
  });

  it("validates: a map names declared values with valid patterns, on an enum or bool", () => {
    expect(parsed({ sworn: "\\bswear\\b" }).story?.qualityByKey.escape.commit_evidence).toEqual({ sworn: "\\bswear\\b" });
    expect(parsed({ hid: "x" }).errors.map((error) => error.message)).toEqual([expect.stringContaining("names hid, not a value of this quality")]);
    expect(parsed({ sworn: "(" }).errors.map((error) => error.path)).toEqual(["qualities.0.commit_evidence.sworn"]);
    expect(parsed({ sworn: "  " }).errors.map((error) => error.message)).toEqual([expect.stringContaining("for sworn must be a non-empty pattern")]);
    expect(parsed({ "5": "x" }, { type: "int", values: undefined }).errors.map((error) => error.message)).toEqual([expect.stringContaining("needs an enum or bool quality")]);
    expect(parsed({}).story?.qualityByKey.escape.commit_evidence).toBeUndefined();
  });
});
