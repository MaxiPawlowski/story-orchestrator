import { parseStoryV2 } from "@engine/index";
import { agencyRecovery, AGENCY_STALL_BOUNDARIES, REFUSAL_PLAYER_TEXT } from "./agencyRecovery";

const raw = (agency?: Record<string, unknown>) => ({
  format: 2,
  id: "refusal-probe",
  version: 1,
  title: "Refusal Probe",
  description: "A checkpoint whose only exit asks the player to accept a duel.",
  qualities: [{ key: "q", type: "bool", source: "code", rubric: "Whether the duel was accepted." }],
  roster: [],
  checkpoints: [
    { id: "start", name: "Start", objective: "Begin.", type: "anchor", start: true },
    { id: "duel", name: "The Duel", objective: "Accept or refuse.", type: "anchor", ...(agency ? { agency } : {}) },
    { id: "elsewhere", name: "Elsewhere", objective: "Take the other road.", type: "anchor" },
  ],
  transitions: [
    { from: "start", to: "duel", priority: 1, gate: { q: "q", op: "==", v: true } },
    { from: "duel", to: "elsewhere", priority: 1, gate: { q: "q", op: "==", v: true } },
  ],
});

const story = (agency?: Record<string, unknown>) => {
  const parsed = parseStoryV2(raw(agency));
  if (Array.isArray(parsed)) throw new Error(parsed.map((error) => `${error.path}: ${error.message}`).join("; "));
  return parsed;
};

const state = (activeCheckpointId: string) => ({ activeCheckpointId } as unknown as Parameters<typeof agencyRecovery>[1]);
const log = (checkpointId: string, count: number, patch: { source?: string; fired?: unknown } = {}) =>
  Array.from({ length: count }, () => ({
    source: patch.source ?? "gate",
    fired: patch.fired ?? null,
    before: { activeCheckpointId: checkpointId },
  })) as unknown as Parameters<typeof agencyRecovery>[2];

describe("refused-route recovery (v2.3 plan 07, C4)", () => {
  it("reports a stall only after two boundaries that satisfied no exit", () => {
    const storyV2 = story();
    expect(AGENCY_STALL_BOUNDARIES).toBe(2);
    expect(agencyRecovery(storyV2, state("duel"), log("duel", 1))).toBeNull();
    const stalled = agencyRecovery(storyV2, state("duel"), log("duel", 2));
    expect(stalled).toMatchObject({ checkpointId: "duel", checkpointName: "The Duel", alternate: null, boundaries: 2 });
    expect(REFUSAL_PLAYER_TEXT).toContain("deciding how the world answers that");
  });

  it("is not a stall when the story actually moved", () => {
    const storyV2 = story();
    expect(agencyRecovery(storyV2, state("duel"), log("duel", 2, { fired: { from: "duel", to: "elsewhere" } }))).toBeNull();
    // Two quiet boundaries in DIFFERENT checkpoints are two checkpoint entries, not a refusal.
    const crossed = [...log("start", 1), ...log("duel", 1)] as unknown as Parameters<typeof agencyRecovery>[2];
    expect(agencyRecovery(storyV2, state("duel"), crossed)).toBeNull();
  });

  it("leaves a manual boundary and a checkpoint with no exits alone", () => {
    const storyV2 = story();
    expect(agencyRecovery(storyV2, state("duel"), log("duel", 2, { source: "manual" }))).toBeNull();
    expect(agencyRecovery(storyV2, state("elsewhere"), log("elsewhere", 3))).toBeNull();
  });

  it("offers the authored alternate, and only when it names a checkpoint that exists", () => {
    const named = agencyRecovery(story({ alternate: "elsewhere" }), state("duel"), log("duel", 2));
    expect(named).toMatchObject({ alternate: "elsewhere", alternateName: "Elsewhere" });
    const dangling = agencyRecovery(story({ alternate: "nowhere" }), state("duel"), log("duel", 2));
    expect(dangling?.alternate).toBeNull();
  });

  it("says nothing at all without a story or a state", () => {
    expect(agencyRecovery(null, state("duel"), log("duel", 2))).toBeNull();
    expect(agencyRecovery(story(), null, log("duel", 2))).toBeNull();
  });
});
