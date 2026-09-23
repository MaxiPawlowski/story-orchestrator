import type { WizardSessionState } from "@wizard/index";
import { loadWizardSession, saveWizardSession } from "./wizardSessions";

const settings: Record<string, unknown> = {};
jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ extensionSettings: settings, saveSettingsDebounced: jest.fn() }),
}));

const session = (patch: Partial<WizardSessionState> = {}): WizardSessionState => ({
  key: "sun-ruins",
  stage: "provisioning",
  history: [],
  questions: [],
  applied: [],
  seed: "",
  updatedAt: "",
  ...patch,
});

beforeEach(() => { delete settings["story-orchestrator"]; });

describe("wizardSessions (R8)", () => {
  it("preserves grants when a later UI snapshot omits the field", () => {
    saveWizardSession(session({ grants: [{ storyId: "sun-ruins", lorebookFileId: "Adolion World", at: "2026-09-21T00:00:00.000Z", confirmed: true }] }));
    // A UI snapshot from before the grant was recorded does not carry `grants`.
    saveWizardSession(session({ stage: "checkpoints" }));
    expect(loadWizardSession("sun-ruins")?.grants).toEqual([{ storyId: "sun-ruins", lorebookFileId: "Adolion World", at: "2026-09-21T00:00:00.000Z", confirmed: true }]);
  });

  it("lets an explicit grants field, including an empty one, override", () => {
    saveWizardSession(session({ grants: [{ storyId: "sun-ruins", lorebookFileId: "Adolion World", at: "2026-09-21T00:00:00.000Z", confirmed: true }] }));
    saveWizardSession(session({ grants: [] }));
    expect(loadWizardSession("sun-ruins")?.grants).toEqual([]);
  });

  // V18: a session first stored now records which of its assets are books; a UI snapshot, which
  // carries no such list, must not erase it; a session stored before it stays without one.
  it("stores a new session with an empty book list, keeps the list through a UI snapshot, and leaves a legacy session without one", () => {
    saveWizardSession(session());
    expect(loadWizardSession("sun-ruins")?.createdLorebooks).toEqual([]);
    saveWizardSession(session({ createdLorebooks: ["Harbour"] }));
    saveWizardSession(session({ stage: "checkpoints" }));
    expect(loadWizardSession("sun-ruins")?.createdLorebooks).toEqual(["Harbour"]);
    settings["story-orchestrator"] = { wizardSessions: [session({ key: "legacy", applied: ["Harbour"] })] };
    saveWizardSession(session({ key: "legacy", stage: "checkpoints", applied: ["Harbour"] }));
    expect(loadWizardSession("legacy")?.createdLorebooks).toBeUndefined();
  });

  it("keeps sessions of other keys untouched", () => {
    saveWizardSession(session({ key: "sun-ruins", grants: [{ storyId: "sun-ruins", lorebookFileId: "A", at: "x", confirmed: true }] }));
    saveWizardSession(session({ key: "heist", grants: [{ storyId: "heist", lorebookFileId: "B", at: "x", confirmed: true }] }));
    expect(loadWizardSession("sun-ruins")?.grants?.[0].lorebookFileId).toBe("A");
    expect(loadWizardSession("heist")?.grants?.[0].lorebookFileId).toBe("B");
  });
});
