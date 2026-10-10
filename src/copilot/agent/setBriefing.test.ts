import type { StoryV2 } from "@engine/index";
import { emptyEnvironment } from "@wizard/index";
import { setBriefing } from "../../studio/mutations";
import { runDiagnostics } from "../../studio/diagnostics";
import { parseProposal } from "../parse";
import { renderStagePrompt } from "../prompts";
import { STAGE_OPS } from "../stages";
import { validateProposal } from "../validate";
import { applyDraftOp, approvePlan, executeReply, newAgentSession, type StepMeta } from "./loop";
import { readRecipe } from "./recipes";
import { agentContext } from "./testing";
import { AGENT_TOOLS, MUTATIONS_WITHOUT_A_TOOL, checkToolCall } from "./tools";
import type { AgentSession } from "./types";

const AT = "2026-10-10T12:00:00.000Z";
const META: StepMeta = { route: "local", firstTryValid: true, repaired: false, at: AT };

const draft = (patch: Partial<StoryV2> = {}): StoryV2 => ({
  format: 2,
  title: "The Road",
  description: "The guide Mara is the heir.",
  qualities: [{ key: "fate", type: "enum", source: "extractor", rubric: "How does it end?", values: ["betrayed", "crowned"] }],
  checkpoints: [
    { id: "camp", name: "Camp", objective: "Arrive.", type: "anchor", start: true, effects: { cast_changes: { disable: ["Varek"] } } },
    { id: "gate", name: "The Sunken Gate", objective: "Open it.", type: "anchor" },
  ],
  transitions: [{ from: "camp", to: "gate", priority: 1, gate: { q: "fate", op: "==", v: "crowned" } }],
  roster: [{ id: "mara", name: "Mara" }, { id: "varek", name: "Varek" }],
  ...patch,
});

const CLEAN = { sections: [{ heading: "Where you are", text: "A camp at the foot of the pass." }, { heading: "Who is with you", text: "Mara, your guide." }] };
const SPOILER = { sections: [{ heading: "Ahead", text: "Varek waits at the Sunken Gate." }] };

const running = (): AgentSession => approvePlan({ ...newAgentSession("brief", "review", {}, AT), plan: ["brief"], status: "awaiting-plan" }, ["brief"], AT);
const run = (args: Record<string, unknown>, story = draft()) =>
  executeReply(running(), { kind: "call", call: { tool: "setBriefing", args } }, agentContext(story, emptyEnvironment()), META).session.steps[0];

describe("v2.8 10 D1: the wizard drafts the briefing as an ordinary reviewed edit", () => {
  it("setBriefing is an edit tool backed by the mutation, and no longer listed as tool-less", () => {
    expect(AGENT_TOOLS.setBriefing).toMatchObject({ family: "edit", backedBy: "setBriefing" });
    expect(MUTATIONS_WITHOUT_A_TOOL.setBriefing).toBeUndefined();
  });

  it("validates the briefing with the story validator", () => {
    expect(checkToolCall({ tool: "setBriefing", args: { briefing: CLEAN } })).toMatchObject({ ok: true, op: { kind: "setBriefing", briefing: CLEAN } });
    expect(checkToolCall({ tool: "setBriefing", args: { briefing: { sections: [{ heading: "Who", text: "You are {{user}}." }] } } }))
      .toMatchObject({ ok: false, message: expect.stringContaining("macro") });
    expect(checkToolCall({ tool: "setBriefing", args: { briefing: { sections: [] } } })).toMatchObject({ ok: false, message: expect.stringContaining("at least one section") });
  });

  it("a clean briefing waits for the author and applies like the Story tab", () => {
    const step = run({ briefing: CLEAN });
    expect(step.status).toBe("pending");
    expect(applyDraftOp(draft(), step.op as never).briefing).toEqual(CLEAN);
    expect(setBriefing(draft({ briefing: CLEAN }), undefined).briefing).toBeUndefined();
  });

  it("a briefing that names a later beat, a muted member or a story value is refused with the diagnostic as feedback", () => {
    const step = run({ briefing: SPOILER });
    expect(step.status).toBe("refused");
    expect(step.observation).toContain("briefing-spoiler-risk");
    expect(step.observation).toContain("Sunken Gate");
    expect(step.observation).toContain("Varek");
    expect(run({ briefing: { sections: [{ heading: "How it ends", text: "You may be crowned." }] } }).status).toBe("refused");
    expect(runDiagnostics(draft({ briefing: SPOILER })).map((entry) => entry.code)).toContain("briefing-spoiler-risk");
  });

  it("the staged Premise and Setup steps may propose it, and a spoiler blocks the proposal so the stage repairs once", () => {
    expect(STAGE_OPS.qualities).toContain("setBriefing");
    expect(STAGE_OPS.effects).toContain("setBriefing");
    const ops = parseProposal(JSON.stringify({ summary: "", ops: [{ kind: "setBriefing", briefing: SPOILER }] })).proposal.ops;
    expect(validateProposal(draft(), ops, "qualities").blocking.join(" ")).toContain("Sunken Gate");
    const clean = parseProposal(JSON.stringify({ summary: "", ops: [{ kind: "setBriefing", briefing: CLEAN }] })).proposal.ops;
    expect(validateProposal(draft(), clean, "qualities").blocking).toEqual([]);
    expect(parseProposal(JSON.stringify({ summary: "", ops: [{ kind: "setBriefing" }] })).issues.join(" ")).toContain("briefing");
    expect(renderStagePrompt("qualities", draft(), "", [])).toContain("setBriefing");
  });

  it("the briefing recipe names the tool and its check", () => {
    const text = readRecipe("briefing");
    expect(text).toContain("setBriefing");
    expect(text).toContain("briefing-spoiler-risk");
  });
});
