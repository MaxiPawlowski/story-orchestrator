import { plantedModel } from "../../test/support/modelCall";
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
import type { ProvisioningEnvironment } from "@wizard/types";

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
      plantedModel, { role: "authoring", pass: "copilot", debugResponse: readGolden("copilot-qualities.response.txt") },
    );
    expect(result.status).toBe("ok");
    expect(result.proposal.ops).toHaveLength(2);
    expect(result.preview.errors).toEqual([]);
    expect(result.audit.repairResponse).toBeUndefined();
  });

  it("marks a proposal failed and records a repair attempt when invalid", async () => {
    const result = await runAuthoringStage(
      { draft: baseDraft(), stage: "transitions", message: "", history: [] },
      plantedModel, { role: "authoring", pass: "copilot", debugResponse: readGolden("copilot-invalid.response.txt") },
    );
    expect(result.status).toBe("failed");
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.audit.repairResponse).toBeDefined();
  });

  it("fails a checkpoints proposal carrying transition and quality ops, and tells the repair pass which stage allows them", async () => {
    const response = JSON.stringify({
      summary: "Checkpoints, plus wiring.",
      ops: [
        { kind: "addCheckpoint", checkpoint: { id: "vault2", name: "Vault 2", objective: "Crack the second vault.", type: "anchor" } },
        { kind: "addTransition", transition: { from: "start", to: "vault", gate: { q: "has_key", op: "==", v: true }, priority: 0 } },
        { kind: "addQuality", quality: { key: "alarm", type: "bool", source: "extractor", rubric: "Is the alarm tripped?" } },
      ],
    });
    const result = await runAuthoringStage({ draft: baseDraft(), stage: "checkpoints", message: "", history: [] }, plantedModel, { role: "authoring", pass: "copilot", debugResponse: response });
    expect(result.status).toBe("failed");
    expect(result.issues).toEqual(expect.arrayContaining([
      "ops.1: addTransition is not allowed in the checkpoints stage; the transitions stage allows it",
      "ops.2: addQuality is not allowed in the checkpoints stage; the qualities stage allows it",
    ]));
    expect(result.audit.repairPrompt).toContain("ops.1: addTransition is not allowed in the checkpoints stage; the transitions stage allows it");
  });

  it("fails a provisioning proposal carrying a draft op, even though draft validation is skipped there", async () => {
    const result = await runAuthoringStage(
      {
        draft: baseDraft(), stage: "provisioning", message: "", history: [],
        environment: { characterNames: [], lorebookNames: [], groupNames: [], storyLorebooks: [] } as Partial<ProvisioningEnvironment> as ProvisioningEnvironment,
      },
      plantedModel, {
        role: "authoring", pass: "copilot",
        debugResponse: JSON.stringify({
          summary: "",
          ops: [
            { kind: "createCharacterCard", name: "Arin", description: "A guide." },
            { kind: "addQuality", quality: { key: "alarm", type: "bool", source: "extractor", rubric: "Is the alarm tripped?" } },
          ],
        }),
      },
    );
    expect(result.status).toBe("failed");
    expect(result.issues).toEqual(["ops.1: addQuality is not allowed in the provisioning stage; the qualities stage allows it"]);
  });

  it("control: a checkpoints proposal of checkpoint ops only stays ok without a repair pass", async () => {
    const result = await runAuthoringStage(
      { draft: baseDraft(), stage: "checkpoints", message: "", history: [] },
      plantedModel, { role: "authoring", pass: "copilot", debugResponse: readGolden("copilot-checkpoints.response.txt") },
    );
    expect(result.status).toBe("ok");
    expect(result.issues).toEqual([]);
    expect(result.audit.repairResponse).toBeUndefined();
  });

  it("a checkpoints proposal adding an intermediate is ok on the first answer, carrying the transitions stage's deferred note", async () => {
    const response = JSON.stringify({ summary: "", ops: [{ kind: "addCheckpoint", checkpoint: { id: "lobby", name: "Lobby", objective: "Crack the lobby door.", type: "intermediate" } }] });
    const result = await runAuthoringStage({ draft: baseDraft(), stage: "checkpoints", message: "", history: [] }, plantedModel, { role: "authoring", pass: "copilot", debugResponse: response });
    expect(result.status).toBe("ok");
    expect(result.issues).toEqual([]);
    expect(result.deferred).toEqual(["checkpoints.2: intermediate checkpoint 'lobby' has no route to an anchor yet; the transitions stage must connect it"]);
    expect(result.audit.repairResponse).toBeUndefined();
  });

  it("control: a transitions proposal that leaves that intermediate unconnected fails, and carries no deferred note", async () => {
    const draft: StoryV2 = { ...baseDraft(), checkpoints: [...baseDraft().checkpoints, { id: "lobby", name: "Lobby", objective: "Crack the lobby door.", type: "intermediate" }] };
    const response = JSON.stringify({ summary: "", ops: [{ kind: "addTransition", transition: { from: "start", to: "vault", priority: 1, gate: { q: "has_key", op: "==", v: true } } }] });
    const result = await runAuthoringStage({ draft, stage: "transitions", message: "", history: [] }, plantedModel, { role: "authoring", pass: "copilot", debugResponse: response });
    expect(result.status).toBe("failed");
    expect(result.issues).toEqual(["checkpoints.2: intermediate checkpoint has no reachable anchor beyond it"]);
    expect(result.deferred).toBeUndefined();
    expect(result.audit.repairPrompt).toContain("checkpoints.2: intermediate checkpoint has no reachable anchor beyond it");
  });

  it("returns the interview instead of a proposal, without spending a repair pass", async () => {
    const result = await runAuthoringStage(
      { draft: baseDraft(), stage: "qualities", message: "a heist, but make it strange", history: [] },
      plantedModel, { role: "authoring", pass: "copilot", debugResponse: JSON.stringify({ summary: "Two calls to make.", questions: [{ id: "tone", text: "Comic or grim?", options: ["comic", "grim"] }] }) },
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
        environment: { characterNames: ["Arin"], lorebookNames: [], groupNames: [], storyLorebooks: [] } as Partial<ProvisioningEnvironment> as ProvisioningEnvironment,
      },
      plantedModel, { role: "authoring", pass: "copilot", debugResponse: JSON.stringify({ summary: "", ops: [{ kind: "createCharacterCard", name: "Arin", description: "A guide." }] }) },
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
        environment: { characterNames: [], lorebookNames: [], groupNames: [], storyLorebooks: [] } as Partial<ProvisioningEnvironment> as ProvisioningEnvironment,
      },
      plantedModel, {
        role: "authoring", pass: "copilot",
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
    const suggestions = await runDriverSuggest(context, plantedModel, {
      role: "authoring", pass: "copilot",
      debugResponse: JSON.stringify({ suggestions: [{ title: "Find the key", rationale: "has_key is false" }] }),
    });
    expect(suggestions).toEqual([{ title: "Find the key", rationale: "has_key is false" }]);
  });

  it("returns trimmed report prose", async () => {
    const report = await runDriverReport(context, plantedModel, { role: "authoring", pass: "copilot", debugResponse: "  The crew is close to the vault.  " });
    expect(report).toBe("The crew is close to the vault.");
  });
});
