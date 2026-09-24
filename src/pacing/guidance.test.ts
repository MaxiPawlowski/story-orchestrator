import { DEFAULT_AGENCY, type Checkpoint } from "@engine/index";
import { INJECTION_REGISTRY, findInjectionRegistryProblems } from "@constants/injectionRegistry";
import { composeGuidanceBlock } from "./guidance";

const checkpoint = (guidance?: string): Checkpoint => ({ id: "cp", name: "CP", objective: "Reach the gate.", type: "anchor", ...(guidance === undefined ? {} : { guidance }) });

describe("composeGuidanceBlock (v2.4 plan 01, D7)", () => {
  it("renders the checkpoint's guidance, trimmed, under the scene-direction header", () => {
    expect(composeGuidanceBlock(checkpoint("  Let the player wander.  "), DEFAULT_AGENCY)).toBe("Scene direction: Let the player wander.");
  });

  it("is empty for no checkpoint, no guidance or whitespace-only guidance, so the writer clears the block", () => {
    expect(composeGuidanceBlock(null, DEFAULT_AGENCY)).toBe("");
    expect(composeGuidanceBlock(checkpoint(), DEFAULT_AGENCY)).toBe("");
    expect(composeGuidanceBlock(checkpoint(" \n "), DEFAULT_AGENCY)).toBe("");
  });

  it("does not restate the objective: that line is plan 06's, under its own rule", () => {
    expect(composeGuidanceBlock(checkpoint("Let the player wander."), DEFAULT_AGENCY)).not.toContain("Reach the gate.");
  });

  it("is a registered depth-4 block whose collision with facts and epistemic is allowlisted", () => {
    expect(INJECTION_REGISTRY.checkpointGuidance).toMatchObject({ key: "story_orchestrator_guidance", depth: 4, writer: "runtime/coordinators/pacingCoordinator" });
    expect(findInjectionRegistryProblems()).toEqual([]);
  });
});
