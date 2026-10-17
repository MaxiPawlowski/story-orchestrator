import type { StoryV2 } from "@engine/index";
import { approvePlan, decideStep, executeReply, newAgentSession, type StepMeta } from "./loop";
import { agentContext } from "./testing";
import type { AgentSession } from "./types";

const AT = "2026-10-16T18:00:00.000Z";
const META: StepMeta = { route: "harness", firstTryValid: true, repaired: false, at: AT };

const ferry = (): StoryV2 => ({
  format: 2,
  title: "SO-K11 stale proposals",
  description: "A ferry crossing.",
  qualities: [
    { key: "ferry_paid", type: "bool", source: "extractor", rubric: "Has the player paid the ferryman?" },
    { key: "arin_name_known", type: "bool", source: "extractor", rubric: "Has the player learned Arin's name?" },
  ],
  checkpoints: [
    { id: "dock", name: "The Dock", objective: "The ferryman names his price.", type: "anchor", start: true },
    { id: "far_bank", name: "The Far Bank", objective: "The player lands.", type: "anchor" },
  ],
  transitions: [{ from: "dock", to: "far_bank", priority: 0, gate: { q: "ferry_paid", op: "==", v: true } }],
  roster: [{ id: "arin", name: "Arin", role: "the ferryman's daughter" }],
});

type Edit = (draft: StoryV2) => StoryV2;

const checkpoint = (id: string, patch: Record<string, unknown>): Edit => (draft) =>
  ({ ...draft, checkpoints: draft.checkpoints.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)) });
const quality = (key: string, patch: Record<string, unknown>): Edit => (draft) =>
  ({ ...draft, qualities: draft.qualities.map((entry) => (entry.key === key ? { ...entry, ...patch } as typeof entry : entry)) });
const member = (id: string, patch: Record<string, unknown>): Edit => (draft) =>
  ({ ...draft, roster: draft.roster.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)) });
const field = (patch: Partial<StoryV2>): Edit => (draft) => ({ ...draft, ...patch });

interface Case {
  name: string;
  tool: string;
  args: Record<string, unknown>;
  touched: Edit;
  unrelated: Edit;
}

const CASES: Case[] = [
  { name: "checkpoint objective", tool: "updateCheckpoint", args: { id: "dock", patch: { objective: "He asks for two coins." } },
    touched: checkpoint("dock", { objective: "The author's own objective." }), unrelated: checkpoint("far_bank", { objective: "The author lands elsewhere." }) },
  { name: "checkpoint name, other field of the same beat", tool: "updateCheckpoint", args: { id: "dock", patch: { name: "The Old Dock" } },
    touched: checkpoint("dock", { name: "The Author's Dock" }), unrelated: checkpoint("dock", { objective: "A new objective, same beat." }) },
  { name: "quality rubric", tool: "updateQuality", args: { key: "ferry_paid", patch: { rubric: "Did the player pay?" } },
    touched: quality("ferry_paid", { rubric: "The author's rubric." }), unrelated: quality("arin_name_known", { rubric: "Did Arin say her name?" }) },
  { name: "story title", tool: "setStoryField", args: { field: "title", value: "SO-K11 the crossing" },
    touched: field({ title: "SO-K11 author title" }), unrelated: field({ description: "The author's description." }) },
  { name: "house rules", tool: "setHouseRules", args: { rules: ["No magic on the river."] },
    touched: field({ house_rules: ["The author's rule."] }), unrelated: field({ title: "SO-K11 renamed" }) },
  { name: "roster role", tool: "updateRosterMember", args: { id: "arin", patch: { role: "the ferry's pilot" } },
    touched: member("arin", { role: "the author's role" }),
    unrelated: (draft) => ({ ...draft, roster: [...draft.roster, { id: "oren", name: "Oren", role: "a passenger" }] }) },
  { name: "transition gate", tool: "setTransitionGate", args: { ref: { from: "dock", to: "far_bank" }, gate: { q: "arin_name_known", op: "==", v: true } },
    touched: (draft) => ({ ...draft, transitions: draft.transitions.map((entry) => ({ ...entry, gate: { q: "ferry_paid", op: "==", v: false } })) }),
    unrelated: (draft) => ({ ...draft, transitions: [...draft.transitions, { from: "far_bank", to: "dock", priority: 0, gate: { q: "ferry_paid", op: "==", v: false } }] }) },
  { name: "new checkpoint", tool: "addCheckpoint", args: { checkpoint: { id: "inn", name: "The Inn", objective: "Rest.", type: "intermediate" } },
    touched: (draft) => ({ ...draft, checkpoints: [...draft.checkpoints, { id: "inn", name: "The Author's Inn", objective: "Sleep.", type: "intermediate" }] }),
    unrelated: checkpoint("dock", { name: "The Renamed Dock" }) },
  { name: "player profile", tool: "setPlayer", args: { player: { role: "a traveller with no coin" } },
    touched: field({ player: { role: "the author's traveller" } }), unrelated: checkpoint("far_bank", { name: "The Landing" }) },
  { name: "checkpoint snapshot", tool: "setCheckpointSnapshot", args: { id: "far_bank", snapshot: { ferry_paid: true } },
    touched: checkpoint("far_bank", { state_snapshot: { ferry_paid: false } }), unrelated: quality("ferry_paid", { rubric: "Paid at last?" }) },
];

const running = (): AgentSession => approvePlan({ ...newAgentSession("ferry", "review", {}, AT), plan: ["edit"], status: "awaiting-plan" }, ["edit"], AT);

const propose = (draft: StoryV2, tool: string, args: Record<string, unknown>) => {
  const turn = executeReply(running(), { kind: "call", call: { tool, args } }, agentContext(draft), META);
  const step = turn.session.steps.at(-1)!;
  expect(step.status).toBe("pending");
  return { session: turn.session, id: step.id };
};

describe("K11: an accepted proposal never overwrites an author edit made since it was proposed", () => {
  it.each(CASES)("refuses when the author changed what the proposal touches: $name", ({ tool, args, touched }) => {
    const { session, id } = propose(ferry(), tool, args);
    const decided = decideStep(session, id, { kind: "accept" }, touched(ferry()));
    expect(decided.apply).toBeNull();
    const step = decided.session.steps.find((entry) => entry.id === id)!;
    expect(step.status).toBe("failed");
    expect(step.observation).toContain("changed since proposed");
  });

  it.each(CASES)("accepts when the author changed something unrelated: $name", ({ tool, args, unrelated }) => {
    const { session, id } = propose(ferry(), tool, args);
    const decided = decideStep(session, id, { kind: "accept" }, unrelated(ferry()));
    expect(decided.session.steps.find((entry) => entry.id === id)!.status).toBe("accepted");
    expect(decided.apply).not.toBeNull();
  });

  it("an author-edited op is still judged against what the proposal touched", () => {
    const { session, id } = propose(ferry(), "updateCheckpoint", { id: "dock", patch: { objective: "He asks for two coins." } });
    const decided = decideStep(session, id, { kind: "accept", op: { kind: "updateCheckpoint", id: "dock", patch: { objective: "Three coins." } } }, checkpoint("dock", { objective: "Mine." })(ferry()));
    expect(decided.apply).toBeNull();
    expect(decided.session.steps.find((entry) => entry.id === id)!.status).toBe("failed");
  });

  it("refuses an op that would drop an author edit it never touched when proposed", () => {
    const { session, id } = propose(ferry(), "setPlayer", { player: { role: "a traveller" } });
    const decided = decideStep(session, id, { kind: "accept" }, field({ player: { summary: "The author's summary." } })(ferry()));
    expect(decided.apply).toBeNull();
    expect(decided.session.steps.find((entry) => entry.id === id)!.observation).toContain("player.summary changed since proposed");
    const removal = propose(ferry(), "removeCheckpoint", { id: "far_bank" });
    const bumped = (draft: StoryV2) => ({ ...draft, transitions: draft.transitions.map((entry) => ({ ...entry, priority: 5 })) });
    expect(decideStep(removal.session, removal.id, { kind: "accept" }, bumped(ferry())).apply).toBeNull();
  });

  it("a decided step drops its proposal base", () => {
    const { session, id } = propose(ferry(), "updateCheckpoint", { id: "dock", patch: { objective: "He asks for two coins." } });
    expect(session.steps.find((entry) => entry.id === id)!.base?.touched.length).toBeGreaterThan(0);
    expect(decideStep(session, id, { kind: "accept" }, ferry()).session.steps.find((entry) => entry.id === id)!.base).toBeUndefined();
  });

  it("the unchanged draft accepts as before", () => {
    const { session, id } = propose(ferry(), "updateCheckpoint", { id: "dock", patch: { objective: "He asks for two coins." } });
    expect(decideStep(session, id, { kind: "accept" }, ferry()).session.steps.find((entry) => entry.id === id)!.status).toBe("accepted");
  });
});
