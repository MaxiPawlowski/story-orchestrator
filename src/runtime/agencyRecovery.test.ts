import { parseStoryV2 } from "@engine/index";
import { agencyRecovery, AGENCY_STALL_BOUNDARIES, REFUSAL_PLAYER_TEXT } from "./agencyRecovery";

const raw = (agency?: Record<string, unknown>, stub = false) => ({
  format: 2,
  id: "refusal-probe",
  version: 1,
  title: "Refusal Probe",
  description: "A checkpoint whose only exit asks the player to accept a duel.",
  qualities: [
    { key: "q", type: "bool", source: "code", rubric: "Whether the duel was accepted." },
    { key: "mood", type: "enum", values: ["calm", "tense"], source: "extractor", rubric: "The room's mood." },
  ],
  roster: [],
  checkpoints: [
    { id: "start", name: "Start", objective: "Begin.", type: "anchor", start: true },
    { id: "duel", name: "The Duel", objective: "Accept or refuse.", type: "anchor", ...(agency ? { agency } : {}) },
    ...(stub ? [{ id: "road", name: "Road", objective: "To be written.", type: "intermediate" }] : []),
    { id: "elsewhere", name: "Elsewhere", objective: "Take the other road.", type: "anchor" },
  ],
  transitions: [
    { from: "start", to: "duel", priority: 1, gate: { q: "q", op: "==", v: true } },
    ...(stub
      ? [{ from: "duel", to: "road", priority: 1, gate: { q: "q", op: "==", v: true } }, { from: "road", to: "elsewhere", priority: 1, gate: { q: "q", op: "==", v: true } }]
      : [{ from: "duel", to: "elsewhere", priority: 1, gate: { q: "q", op: "==", v: true } }]),
  ],
});

const story = (agency?: Record<string, unknown>, stub = false) => {
  const parsed = parseStoryV2(raw(agency, stub));
  if (Array.isArray(parsed)) throw new Error(parsed.map((error) => `${error.path}: ${error.message}`).join("; "));
  return parsed;
};

type Log = Parameters<typeof agencyRecovery>[2];
type Audits = NonNullable<Parameters<typeof agencyRecovery>[3]>;

const state = (activeCheckpointId: string) => ({ activeCheckpointId } as unknown as Parameters<typeof agencyRecovery>[1]);
// Boundary i consumed message 2i+1 (the player's line at 2i, the reply at 2i+1).
const log = (checkpointId: string, count: number, patch: { source?: string; fired?: unknown } = {}) =>
  Array.from({ length: count }, (_, index) => ({
    source: patch.source ?? "gate",
    fired: patch.fired ?? null,
    before: { activeCheckpointId: checkpointId },
    context: { lastMessageId: index * 2 + 1, chatLength: index * 2 + 2 },
  })) as unknown as Log;
// One read per boundary, over that boundary's two messages, accepting the given keys.
const reads = (count: number, keys: string[] = []) =>
  Array.from({ length: count }, (_, index) => ({
    window: { from: index * 2, to: index * 2 + 1 },
    acceptedDeltas: keys.map((q) => ({ delta: { q, v: true }, evidence: "x" })),
  })) as unknown as Audits;

describe("refused-route recovery (v2.3 plan 07, C4)", () => {
  it("reports a refusal only after two boundaries that were read and moved no exit", () => {
    const storyV2 = story();
    expect(AGENCY_STALL_BOUNDARIES).toBe(2);
    expect(agencyRecovery(storyV2, state("duel"), log("duel", 1), reads(1))).toBeNull();
    const stalled = agencyRecovery(storyV2, state("duel"), log("duel", 2), reads(2, ["mood"]));
    expect(stalled).toMatchObject({ checkpointId: "duel", checkpointName: "The Duel", alternate: null, boundaries: 2 });
    expect(REFUSAL_PLAYER_TEXT).toContain("deciding how the world answers that");
  });

  it("is not a stall when the story actually moved", () => {
    const storyV2 = story();
    expect(agencyRecovery(storyV2, state("duel"), log("duel", 2, { fired: { from: "duel", to: "elsewhere" } }), reads(2))).toBeNull();
    // Two quiet boundaries in DIFFERENT checkpoints are two checkpoint entries, not a refusal.
    const crossed = [...log("start", 1), ...log("duel", 2).slice(1)] as unknown as Log;
    expect(agencyRecovery(storyV2, state("duel"), crossed, reads(2))).toBeNull();
  });

  it("leaves a manual boundary and a checkpoint with no exits alone", () => {
    const storyV2 = story();
    expect(agencyRecovery(storyV2, state("duel"), log("duel", 2, { source: "manual" }), reads(2))).toBeNull();
    expect(agencyRecovery(storyV2, state("elsewhere"), log("elsewhere", 3), reads(3))).toBeNull();
  });

  it("offers the authored alternate, and only when it names a checkpoint that exists", () => {
    const named = agencyRecovery(story({ alternate: "elsewhere" }), state("duel"), log("duel", 2), reads(2));
    expect(named).toMatchObject({ alternate: "elsewhere", alternateName: "Elsewhere" });
    const dangling = agencyRecovery(story({ alternate: "nowhere" }), state("duel"), log("duel", 2), reads(2));
    expect(dangling?.alternate).toBeNull();
  });

  it("says nothing at all without a story or a state", () => {
    expect(agencyRecovery(null, state("duel"), log("duel", 2), reads(2))).toBeNull();
    expect(agencyRecovery(story(), null, log("duel", 2), reads(2))).toBeNull();
  });
});

// V13: the signal the plan asked for is "extraction cannot classify the player's action", not "two
// quiet boundaries". A checkpoint whose gate needs several increments is quiet in ordinary play.
describe("V13: a refusal is a read that classified nothing against an exit", () => {
  it("two quiet boundaries nobody has read are unknown, not a refusal", () => {
    expect(agencyRecovery(story(), state("duel"), log("duel", 2))).toBeNull();
    expect(agencyRecovery(story(), state("duel"), log("duel", 2), reads(1))).toBeNull();
  });

  it("a read that moved an exit's quality is progress, even when the gate is still shut", () => {
    expect(agencyRecovery(story(), state("duel"), log("duel", 2), reads(2, ["q"]))).toBeNull();
  });

  it("control: the same reads moving only a quality no exit names are a refusal", () => {
    expect(agencyRecovery(story(), state("duel"), log("duel", 2), reads(2, ["mood"]))).not.toBeNull();
  });

  it("offers to generate the road ahead only where there is a stub to expand", () => {
    expect(agencyRecovery(story(), state("duel"), log("duel", 2), reads(2))?.canGenerate).toBe(false);
    expect(agencyRecovery(story(undefined, true), state("duel"), log("duel", 2), reads(2))?.canGenerate).toBe(true);
  });
});
