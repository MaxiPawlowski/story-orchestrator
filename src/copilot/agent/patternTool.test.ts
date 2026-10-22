import type { Story } from "@engine/index";
import { emptyEnvironment } from "@wizard/index";
import { applyDraftOp, approvePlan, executeReply, newAgentSession, type StepMeta } from "./loop";
import { agentContext } from "./testing";
import type { AgentSession } from "./types";
import { runDiagnostics } from "../../studio/diagnostics";
import { addPattern, removePattern, updatePattern } from "../../studio/gameMutations";

const AT = "2026-10-21T12:00:00.000Z";
const META: StepMeta = { route: "local", firstTryValid: true, repaired: false, at: AT };

const draft = (patch: Partial<Story> = {}): Story => ({
  title: "Harbour", description: "",
  qualities: [{ key: "paid", type: "bool", source: "extractor", rubric: "Has the debt been paid?" }],
  checkpoints: [{ id: "dock", name: "Dock", objective: "Arrive.", type: "anchor", start: true }, { id: "isle", name: "Isle", objective: "Land.", type: "anchor" }],
  transitions: [],
  roster: [{ id: "arin", name: "Arin" }],
  quests: [{ id: "ferry", title: "Ferry", kind: "side", giver: "arin", done_when: { q: "paid", op: "==", v: true }, steps: [] }],
  ...patch,
});

const running = (): AgentSession => approvePlan({ ...newAgentSession("patterns", "review", {}, AT), plan: ["patterns"], status: "awaiting-plan" }, ["patterns"], AT);
const run = (tool: string, args: Record<string, unknown>, story = draft()) =>
  executeReply(running(), { kind: "call", call: { tool, args } }, agentContext(story, emptyEnvironment()), META).session.steps[0];

const FAVOURS = { id: "favours", steps: [{ kind: "quest", to: "done", where: { giver: "?who" } }, { kind: "quest", to: "done", where: { giver: "?who" } }], label: { text: "Two favours." } };

describe("v2.9 05 D: the setPatterns tool and the typed mutations", () => {
  it("proposes the full list as one reviewed card and applies it", () => {
    const step = run("setPatterns", { patterns: [FAVOURS] });
    expect(step.status).toBe("pending");
    expect(applyDraftOp(draft(), step.op as never).patterns).toEqual([FAVOURS]);
  });

  it("refuses what the validator refuses, with the reason", () => {
    expect(run("setPatterns", { patterns: [{ ...FAVOURS, steps: [{ kind: "quest", id: "ghost" }] }] }).status).toBe("refused");
    expect(run("setPatterns", { patterns: [{ id: "x", steps: [{ kind: "rumor" }], label: { text: "x" } }] }).status).toBe("refused");
  });

  it("add, update and remove keep the list compact", () => {
    const added = addPattern(draft());
    expect(added.patterns?.[0].id).toBe("pattern");
    const updated = updatePattern(added, "pattern", { repeat: "once", hint: "", within: 4 });
    expect(updated.patterns?.[0]).toEqual({ id: "pattern", steps: added.patterns?.[0].steps, within: 4, label: added.patterns?.[0].label });
    expect(removePattern(updated, "pattern").patterns).toBeUndefined();
  });
});

describe("v2.9 05 A: pattern diagnostics", () => {
  const codes = (story: Story) => runDiagnostics(story).filter((entry) => entry.code.startsWith("pattern-")).map((entry) => [entry.code, entry.path]);

  it("warns on a cause, an unmet name and a step the story can never produce", () => {
    const story = draft({
      codex: { people: [{ id: "tobin", name: "Tobin", known_when: { q: "paid", op: "==", v: true }, facts: [] }] },
      patterns: [
        { id: "cause", steps: [{ kind: "milestone" }], label: { text: "Because you paid, the harbour trusts you." } },
        { id: "named", steps: [{ kind: "milestone" }], hint: "Tobin remembers this." },
        { id: "never", steps: [{ kind: "transition", to: "isle" }, { kind: "quest", id: "ferry", to: "failed" }], pending: "Close now." },
      ],
    });
    expect(codes(story)).toEqual([
      ["pattern-label-claims-cause", "patterns.0.label.text"],
      ["pattern-label-names-unknown-entity", "patterns.1.hint"],
      ["pattern-never-completes", "patterns.2.steps.0"],
      ["pattern-never-completes", "patterns.2.steps.1"],
    ]);
    expect(codes(draft({ patterns: [FAVOURS as never] }))).toEqual([]);
  });
});
