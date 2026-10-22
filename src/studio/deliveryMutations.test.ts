import type { Story } from "@engine/index";
import { setMemberPolish } from "./deliveryMutations";
import { checkToolCall } from "../copilot/agent/tools";
import { agentOnlyProblem, applyAgentOnly, describeAgentOnly, isAgentOnly } from "../copilot/agent/agentOnly";

const draft = (): Story => ({
  title: "T", description: "D", qualities: [], checkpoints: [{ id: "start", name: "Start", objective: "o", type: "anchor", start: true }], transitions: [],
  roster: [{ id: "tamsin", name: "Tamsin" }, { id: "orrin", name: "Orrin", mood: { values: ["calm", "angry"], baseline: "calm", lasts: { boundaries: 3 } } }],
});

describe("v2.9 plan 02 S5: setMemberPolish", () => {
  it("merges a patch, drops emptied and default fields, and removes an empty block", () => {
    let story = setMemberPolish(draft(), "tamsin", { notes: "Short sentences.", prefer: ["current"] });
    expect(story.roster[0].polish).toEqual({ notes: "Short sentences.", prefer: ["current"] });
    story = setMemberPolish(story, "tamsin", { prefer: [], rhythm: "clipped", dialogue: "keep", enabled: true });
    expect(story.roster[0].polish).toEqual({ notes: "Short sentences.", rhythm: "clipped" });
    story = setMemberPolish(story, "tamsin", { enabled: false });
    expect(story.roster[0].polish).toEqual({ notes: "Short sentences.", rhythm: "clipped", enabled: false });
    expect(setMemberPolish(story, "tamsin", null).roster[0]).toEqual({ id: "tamsin", name: "Tamsin" });
    expect(setMemberPolish(draft(), "tamsin", { enabled: false }).roster[0].polish).toBeUndefined();
    expect(setMemberPolish(story, "orrin", { notes: "x" }).roster[0]).toBe(story.roster[0]);
  });

  it("is an ordinary edit tool for the agent: checked, described, refused when invalid, never provisioning", () => {
    const check = checkToolCall({ tool: "setMemberPolish", args: { id: "orrin", polish: { notes: "Long, careful sentences.", by_mood: { angry: "Clipped." } } } });
    expect(check.ok && check.spec.family).toBe("edit");
    if (!check.ok || !check.op) throw new Error("no op");
    expect(isAgentOnly(check.op)).toBe(true);
    if (!isAgentOnly(check.op)) throw new Error("not agent-only");
    expect(agentOnlyProblem(draft(), check.op)).toBeNull();
    expect(applyAgentOnly(draft(), check.op).roster[1].polish).toEqual({ notes: "Long, careful sentences.", by_mood: { angry: "Clipped." } });
    expect(describeAgentOnly(check.op).entity).toBe("roster.orrin.polish");
    const bad = checkToolCall({ tool: "setMemberPolish", args: { id: "tamsin", polish: { by_mood: { calm: "slow" }, avoid: ["Orrin"] } } });
    if (!bad.ok || !bad.op || !isAgentOnly(bad.op)) throw new Error("no op");
    expect(agentOnlyProblem(draft(), bad.op)).toEqual(expect.stringContaining("polish.avoid.0"));
    expect(agentOnlyProblem(draft(), bad.op)).toEqual(expect.stringContaining("polish.by_mood"));
    const missing = checkToolCall({ tool: "setMemberPolish", args: { id: "nobody", polish: { notes: "x" } } });
    if (!missing.ok || !missing.op || !isAgentOnly(missing.op)) throw new Error("no op");
    expect(agentOnlyProblem(draft(), missing.op)).toBe("'nobody' is not a roster id");
  });

  it("clears with an empty object", () => {
    const check = checkToolCall({ tool: "setMemberPolish", args: { id: "tamsin", polish: {} } });
    if (!check.ok || !check.op || !isAgentOnly(check.op)) throw new Error("no op");
    const seeded = setMemberPolish(draft(), "tamsin", { notes: "Dry." });
    expect(applyAgentOnly(seeded, check.op).roster[0].polish).toBeUndefined();
  });
});
