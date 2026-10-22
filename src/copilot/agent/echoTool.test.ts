import type { Story } from "@engine/index";
import type { StoryEcho } from "@engine/echoSchema";
import { emptyEnvironment } from "@wizard/index";
import { applyDraftOp, approvePlan, executeReply, newAgentSession, type StepMeta } from "./loop";
import { agentContext } from "./testing";
import type { AgentSession } from "./types";
import { runDiagnostics } from "../../studio/diagnostics";
import { addEcho, removeEcho, updateEcho } from "../../studio/gameMutations";

const AT = "2026-10-21T12:00:00.000Z";
const META: StepMeta = { route: "local", firstTryValid: true, repaired: false, at: AT };

const draft = (patch: Partial<Story> = {}): Story => ({
  title: "Harbour", description: "",
  qualities: [{ key: "paid", type: "bool", source: "extractor", rubric: "Has the debt been paid?" }],
  checkpoints: [{ id: "dock", name: "Dock", objective: "Arrive.", type: "anchor", start: true }, { id: "isle", name: "Isle", objective: "Land.", type: "anchor" }],
  transitions: [{ from: "dock", to: "isle", priority: 0, gate: { q: "paid", op: "==", v: true } }],
  roster: [{ id: "arin", name: "Arin" }, { id: "nar", name: "Narrator", view: "omniscient" }],
  ...patch,
});

const running = (): AgentSession => approvePlan({ ...newAgentSession("echoes", "review", {}, AT), plan: ["echoes"], status: "awaiting-plan" }, ["echoes"], AT);
const run = (tool: string, args: Record<string, unknown>, story = draft()) =>
  executeReply(running(), { kind: "call", call: { tool, args } }, agentContext(story, emptyEnvironment()), META).session.steps[0];

const DEBT: StoryEcho = { id: "debt", after: { transition: "dock->isle#0" }, delay: { boundaries: [2, 3] }, to: "narrator", cue: "the harbourmaster has not forgotten the fare" };

describe("v2.9 07 S4: the setEchoes tool and the typed mutations", () => {
  it("proposes the full list as one reviewed card and applies it", () => {
    const step = run("setEchoes", { echoes: [DEBT] });
    expect(step.status).toBe("pending");
    expect(applyDraftOp(draft(), step.op as never).echoes).toEqual([DEBT]);
  });

  it("refuses what the validator refuses, with the reason", () => {
    expect(run("setEchoes", { echoes: [{ ...DEBT, after: { transition: "isle->dock" } }] }).status).toBe("refused");
    expect(run("setEchoes", { echoes: [{ ...DEBT, delay: { parts: [1, 2] } }] }).status).toBe("refused");
    expect(run("setEchoes", { echoes: [{ ...DEBT, to: "ghost" }] }).status).toBe("refused");
    expect(run("setEchoes", { echoes: [{ ...DEBT, colour: "red" }] }).status).toBe("refused");
  });

  it("add, update and remove keep the list compact", () => {
    const added = addEcho(draft());
    expect(added.echoes?.[0]).toEqual(expect.objectContaining({ id: "echo", after: { transition: "dock->isle#0" }, to: "arin" }));
    const updated = updateEcho(added, "echo", { hold: 3, when: undefined });
    expect(updated.echoes?.[0].hold).toBe(3);
    expect(Object.keys(updated.echoes?.[0] ?? {})).not.toContain("when");
    expect(removeEcho(updated, "echo").echoes).toBeUndefined();
  });
});

describe("v2.9 07 S1: echo diagnostics", () => {
  const codes = (story: Story) => runDiagnostics(story).filter((entry) => entry.code.startsWith("echo-")).map((entry) => [entry.code, entry.path]);

  it("warns on a cue that speaks for the player, a narrator cue naming someone unmet, and a cancel that already holds", () => {
    const story = draft({
      codex: { people: [{ id: "tobin", name: "Tobin", known_when: { q: "paid", op: "==", v: true }, facts: [] }] },
      echoes: [
        { ...DEBT, id: "feel", to: "arin", cue: "you feel the debt weighing on you" },
        { ...DEBT, id: "named", cue: "Tobin is back in town" },
        { ...DEBT, id: "dead", cancel_when: { not: { q: "paid", op: "==", v: true } } },
      ],
    });
    expect(codes(story)).toEqual([
      ["echo-speaks-for-player", "echoes.0.cue"], ["echo-names-unknown-entity", "echoes.1.cue"], ["echo-gate-holds-never", "echoes.2.cancel_when"],
    ]);
    expect(codes(draft({ echoes: [{ ...DEBT, to: "arin", cue: "Tobin is back in town" }] }))).toEqual([]);
  });
});
