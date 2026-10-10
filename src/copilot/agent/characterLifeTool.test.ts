import type { StoryV2 } from "@engine/index";
import { emptyEnvironment } from "@wizard/index";
import { applyDraftOp, approvePlan, executeReply, newAgentSession, type StepMeta } from "./loop";
import { agentContext } from "./testing";
import type { AgentSession } from "./types";

const AT = "2026-10-10T12:00:00.000Z";
const META: StepMeta = { route: "local", firstTryValid: true, repaired: false, at: AT };

const draft = (patch: Partial<StoryV2> = {}): StoryV2 => ({
  format: 2,
  title: "Harbour",
  description: "",
  qualities: [{ key: "paid", type: "bool", source: "extractor", rubric: "Has the debt been paid?" }],
  checkpoints: [{ id: "dock", name: "Dock", objective: "Arrive.", type: "anchor", start: true }],
  transitions: [],
  roster: [{ id: "arin", name: "Arin" }, { id: "dalan", name: "Dalan" }],
  ...patch,
});

const running = (): AgentSession => approvePlan({ ...newAgentSession("life", "review", {}, AT), plan: ["life"], status: "awaiting-plan" }, ["life"], AT);
const run = (tool: string, args: Record<string, unknown>, story = draft()) =>
  executeReply(running(), { kind: "call", call: { tool, args } }, agentContext(story, emptyEnvironment()), META).session.steps[0];

const LIFE = {
  relationships: [{ toward: "player", axes: ["trust"], range: [-3, 3] }],
  mood: { baseline: "calm" },
  agenda: [{ id: "debt", goal: "Repay the smuggler", pace: "per_n_boundaries", every: 4, steps: [{ text: "sold her ring" }, { text: "met the smuggler", when: { q: "paid", op: "==", v: false } }] }],
};

describe("v2.8 09: setCharacterLife and setClock, the tools the character-life recipe needs", () => {
  it("proposes a member's whole life as one reviewed card, and applying it replaces those fields only", () => {
    const step = run("setCharacterLife", { id: "arin", life: LIFE });
    expect(step.status).toBe("pending");
    const story = draft({ roster: [{ id: "arin", name: "Arin", role: "smuggler's debtor", schedule: [{ when: { q: "paid", op: "==", v: true }, at: "the docks" }] }, { id: "dalan", name: "Dalan" }] });
    const applied = applyDraftOp(story, step.op as never);
    expect(applied.roster[0]).toEqual({ id: "arin", name: "Arin", role: "smuggler's debtor", ...LIFE });
    expect(applied.roster[1]).toEqual({ id: "dalan", name: "Dalan" });
  });

  it("refuses what the story validator would refuse, with the reason, and never half applies", () => {
    expect(run("setCharacterLife", { id: "arin", life: { relationships: [{ toward: "arin", axes: ["trust"] }] } })).toMatchObject({ status: "refused", observation: expect.stringContaining("toward itself") });
    expect(run("setCharacterLife", { id: "arin", life: { agenda: [{ id: "debt", goal: "x", pace: "per_chapter", steps: [{ text: "y", effect: { cast_changes: { enable: ["Dalan"] } } }] }] } }))
      .toMatchObject({ status: "refused", observation: expect.stringContaining("never changes the cast") });
    expect(run("setCharacterLife", { id: "arin", life: { moods: {} } })).toMatchObject({ status: "refused", observation: expect.stringContaining("unknown field moods") });
    expect(run("setCharacterLife", { id: "nobody", life: LIFE })).toMatchObject({ status: "refused", observation: expect.stringContaining("not a cast member") });
  });

  it("sets and clears the story clock", () => {
    const step = run("setClock", { clock: { times: ["morning", "evening", "night"] } });
    expect(step.status).toBe("pending");
    expect(applyDraftOp(draft(), step.op as never).clock).toEqual({ times: ["morning", "evening", "night"] });
    expect(run("setClock", { clock: { times: ["noon"] } })).toMatchObject({ status: "refused" });
    expect("clock" in applyDraftOp(draft({ clock: { times: ["a", "b"] } }), { kind: "setClock", clock: null } as never)).toBe(false);
  });
});
