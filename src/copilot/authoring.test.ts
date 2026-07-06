jest.mock("@services/STAPI", () => ({ sendConnectionProfileRequest: jest.fn(async () => "{}") }));

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { StoryV2 } from "@engine/index";
import { runAuthoringStage, runDriverReport, runDriverSuggest } from "./authoring";
import type { DriverContext } from "./types";

const readGolden = (name: string): string => readFileSync(join(process.cwd(), "test/goldens", name), "utf8");

const baseDraft = (): StoryV2 => ({
  format: 2,
  title: "The Vault Job",
  description: "A heist.",
  qualities: [{ key: "has_key", type: "bool", source: "extractor", rubric: "Does the crew have the vault key?" }],
  checkpoints: [
    { id: "start", name: "Start", objective: "Case the vault.", type: "anchor", start: true },
    { id: "vault", name: "Vault", objective: "Open the vault.", type: "anchor" },
  ],
  transitions: [],
  roster: [],
});

describe("runAuthoringStage", () => {
  it("returns an ok proposal for a valid debug response and skips repair", async () => {
    const result = await runAuthoringStage(
      { draft: baseDraft(), stage: "qualities", message: "", history: [] },
      { profileId: null, debugResponse: readGolden("copilot-qualities.response.txt") },
    );
    expect(result.status).toBe("ok");
    expect(result.proposal.ops).toHaveLength(2);
    expect(result.preview.errors).toEqual([]);
    expect(result.audit.repairResponse).toBeUndefined();
  });

  it("marks a proposal failed and records a repair attempt when invalid", async () => {
    const result = await runAuthoringStage(
      { draft: baseDraft(), stage: "transitions", message: "", history: [] },
      { profileId: null, debugResponse: readGolden("copilot-invalid.response.txt") },
    );
    expect(result.status).toBe("failed");
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.audit.repairResponse).toBeDefined();
  });
});

describe("driver passes", () => {
  const context: DriverContext = {
    title: "The Vault Job",
    activeCheckpointId: "start",
    activeObjective: "Case the vault.",
    unmetGates: ["has_key == true"],
    upcomingAnchors: [{ id: "vault", name: "Vault", progress: 0, threshold: 1 }],
    blackboard: { has_key: false },
    canon: "",
    recentChat: "",
  };

  it("parses driver suggestions", async () => {
    const suggestions = await runDriverSuggest(context, {
      profileId: null,
      debugResponse: JSON.stringify({ suggestions: [{ title: "Find the key", rationale: "has_key is false" }] }),
    });
    expect(suggestions).toEqual([{ title: "Find the key", rationale: "has_key is false" }]);
  });

  it("returns trimmed report prose", async () => {
    const report = await runDriverReport(context, { profileId: null, debugResponse: "  The crew is close to the vault.  " });
    expect(report).toBe("The crew is close to the vault.");
  });
});
