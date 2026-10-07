import { parseStoryV2 } from "@engine/index";
import { agencyRecovery as recoveryOf, AGENCY_STALL_TURNS, playerTurnIds, REFUSAL_PLAYER_TEXT } from "./agencyRecovery";

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

type Log = Parameters<typeof recoveryOf>[2];
type Audits = NonNullable<Parameters<typeof recoveryOf>[3]>;

const state = (activeCheckpointId: string) => ({ activeCheckpointId } as unknown as Parameters<typeof recoveryOf>[1]);
// Boundary i consumed message 2i+1 (the player's line at 2i, the reply at 2i+1).
const log = (checkpointId: string, count: number, patch: { source?: string; fired?: unknown } = {}) =>
  Array.from({ length: count }, (_, index) => ({
    source: patch.source ?? "gate",
    fired: patch.fired ?? null,
    before: { activeCheckpointId: checkpointId },
    context: { lastMessageId: index * 2 + 1, chatLength: index * 2 + 2 },
  })) as unknown as Log;
// One read per boundary, over that boundary's two messages, accepting the given keys.
const reads = (count: number, keys: string[] = [], v: unknown = true) =>
  Array.from({ length: count }, (_, index) => ({
    window: { from: index * 2, to: index * 2 + 1 },
    acceptedDeltas: keys.map((q) => ({ delta: { q, v }, evidence: "x" })),
  })) as unknown as Audits;
// A solo chat: the player's line sits just before each reply, so every boundary is one turn.
const SOLO_TURNS = Array.from({ length: 20 }, (_, index) => index * 2);
const agencyRecovery = (...args: [Parameters<typeof recoveryOf>[0], Parameters<typeof recoveryOf>[1], Log, Audits?, number[]?]) =>
  recoveryOf(args[0], args[1], args[2], args[3], args[4] ?? SOLO_TURNS);

describe("refused-route recovery (v2.3 plan 07, C4)", () => {
  it("reports a refusal only after two boundaries that were read and moved no exit", () => {
    const storyV2 = story();
    expect(AGENCY_STALL_TURNS).toBe(2);
    expect(agencyRecovery(storyV2, state("duel"), log("duel", 1), reads(1))).toBeNull();
    const stalled = agencyRecovery(storyV2, state("duel"), log("duel", 2), reads(2, ["mood"]));
    expect(stalled).toMatchObject({ checkpointId: "duel", checkpointName: "The Duel", alternate: null, turns: 2 });
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

  it("a read that set the exit's quality to a value no exit accepts is a refusal: it classified the action and moved nothing", () => {
    expect(agencyRecovery(story(), state("duel"), log("duel", 2), reads(2, ["q"], false))).not.toBeNull();
  });

  it("control: the same reads moving only a quality no exit names are a refusal", () => {
    expect(agencyRecovery(story(), state("duel"), log("duel", 2), reads(2, ["mood"]))).not.toBeNull();
  });

  it("a numeric step toward an exit's threshold is progress, even far below it", () => {
    const counted = parseStoryV2({ ...raw(), qualities: [...raw().qualities, { key: "steps", type: "int", source: "extractor", rubric: "Steps taken." }], transitions: [raw().transitions[0], { from: "duel", to: "elsewhere", priority: 1, gate: { q: "steps", op: ">=", v: 3 } }] });
    if (Array.isArray(counted)) throw new Error("fixture");
    expect(agencyRecovery(counted, state("duel"), log("duel", 2), reads(2, ["steps"], 1))).toBeNull();
    expect(agencyRecovery(counted, state("duel"), log("duel", 2), reads(2, ["mood"]))).not.toBeNull();
  });

  it("offers to generate the road ahead only where there is a stub to expand", () => {
    expect(agencyRecovery(story(), state("duel"), log("duel", 2), reads(2))?.canGenerate).toBe(false);
    expect(agencyRecovery(story(undefined, true), state("duel"), log("duel", 2), reads(2))?.canGenerate).toBe(true);
  });
});

// V13, found live: in a group one player line drew three replies, each reply committed a boundary,
// and the card appeared after a single refusal. A refusal is counted in the player's own lines.
describe("V13: a refusal is counted in player turns, not replies", () => {
  const at = (checkpointId: string, ids: number[]) =>
    ids.map((lastMessageId) => ({ source: "gate", fired: null, before: { activeCheckpointId: checkpointId }, context: { lastMessageId, chatLength: lastMessageId + 1 } })) as unknown as Log;
  const readOver = (from: number, to: number, keys: string[] = [], v: unknown = true) =>
    [{ window: { from, to }, acceptedDeltas: keys.map((q) => ({ delta: { q, v }, evidence: "x" })) }] as unknown as Audits;

  it("one player line answered by three members is one turn, not a refusal", () => {
    expect(recoveryOf(story(), state("duel"), at("duel", [1, 2, 3]), readOver(0, 3), [0])).toBeNull();
  });

  it("control: a second line refused and read makes it two turns", () => {
    expect(recoveryOf(story(), state("duel"), at("duel", [1, 2, 3, 5, 6]), readOver(0, 6), [0, 4])).toMatchObject({ turns: 2 });
  });

  it("the streak restarts after the last read that moved an exit", () => {
    const log = at("duel", [1, 3, 5, 7]);
    const moved = [...readOver(0, 1, ["q"]), ...readOver(2, 7, ["mood"])] as unknown as Audits;
    expect(recoveryOf(story(), state("duel"), log, moved, [0, 2, 4, 6])).toMatchObject({ turns: 3 });
    const movedLast = [...readOver(0, 5, ["mood"]), ...readOver(6, 7, ["q"])] as unknown as Audits;
    expect(recoveryOf(story(), state("duel"), log, movedLast, [0, 2, 4, 6])).toBeNull();
  });

  it("reads the player's lines out of the chat, never a system note", () => {
    expect(playerTurnIds([{ is_user: false }, { is_user: true }, { is_user: true, is_system: true }, null, { is_user: true }])).toEqual([1, 4]);
  });

  it("v2.7 finding 19: an OOC line is no refused turn; a line with parentheses still is", () => {
    const chat = [{ is_user: true, mes: "I refuse the duel." }, { is_user: false }, { is_user: true, mes: "OOC: is this a fight?" }, { is_user: false },
      { is_user: true, mes: "((brb))" }, { is_user: false }, { is_user: true, mes: "(OOC) back" }, { is_user: false }];
    const turns = playerTurnIds(chat);
    expect(turns).toEqual([0]);
    expect(recoveryOf(story(), state("duel"), at("duel", [1, 3, 5, 7]), readOver(0, 7), turns)).toBeNull();
    const inCharacter = playerTurnIds(chat.map((row) => (row.is_user ? { ...row, mes: "I shake my head (again)." } : row)));
    expect(recoveryOf(story(), state("duel"), at("duel", [1, 3, 5, 7]), readOver(0, 7), inCharacter)).toMatchObject({ turns: 4 });
  });
});
