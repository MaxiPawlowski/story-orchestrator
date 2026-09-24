jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null, sendConnectionProfileRequest: jest.fn(async () => ({ ok: true, text: "{}", finish: "stop" })) }));

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

  it("returns the interview instead of a proposal, without spending a repair pass", async () => {
    const result = await runAuthoringStage(
      { draft: baseDraft(), stage: "qualities", message: "a heist, but make it strange", history: [] },
      { profileId: null, debugResponse: JSON.stringify({ summary: "Two calls to make.", questions: [{ id: "tone", text: "Comic or grim?", options: ["comic", "grim"] }] }) },
    );
    expect(result.status).toBe("questions");
    expect(result.questions).toHaveLength(1);
    expect(result.issues).toEqual([]);
    expect(result.audit.repairResponse).toBeUndefined();
  });

  it("fails a provisioning proposal that names an asset the install already has", async () => {
    const result = await runAuthoringStage(
      {
        draft: baseDraft(),
        stage: "provisioning",
        message: "",
        history: [],
        environment: { characterNames: ["Arin"], lorebookNames: [], groupNames: [], storyLorebooks: [] },
      },
      { profileId: null, debugResponse: JSON.stringify({ summary: "", ops: [{ kind: "createCharacterCard", name: "Arin", description: "A guide." }] }) },
    );
    expect(result.status).toBe("failed");
    expect(result.issues.join(" ")).toContain("never edits yours");
    expect(result.audit.repairResponse).toBeDefined();
  });

  it("accepts a provisioning proposal that only creates what is missing", async () => {
    const result = await runAuthoringStage(
      {
        draft: baseDraft(),
        stage: "provisioning",
        message: "",
        history: [],
        environment: { characterNames: [], lorebookNames: [], groupNames: [], storyLorebooks: [] },
      },
      {
        profileId: null,
        debugResponse: JSON.stringify({
          summary: "Two steps.",
          ops: [
            { kind: "createCharacterCard", name: "Arin", description: "A guide." },
            { kind: "createGroup", name: "Vault Crew", members: ["Arin"] },
          ],
        }),
      },
    );
    expect(result.status).toBe("ok");
    expect(result.proposal.ops.map((op) => op.kind)).toEqual(["createCharacterCard", "createGroup"]);
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
