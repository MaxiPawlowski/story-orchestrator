import type { WizardSessionState } from "@wizard/index";
import { clearWizardSession, loadWizardSession, onWizardSessionSave, saveWizardSession } from "./wizardSessions";

const settings: Record<string, unknown> = {};
const host: { observation: Record<string, unknown>; server: Record<string, unknown> | null; saves: number; burst: number } = { observation: {}, server: null, saves: 0, burst: 0 };
jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  observeNextSettingsSave: async () => ({ ...host.observation, burst: ++host.burst }),
  readServerExtensionSettings: async () => host.server,
  readServerBoundary: async () => null,
  getContext: () => ({ extensionSettings: settings, saveSettingsDebounced: () => { host.saves += 1; } }),
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

// v2.4 E3: a wizard session carries the created-asset ledger cleanup scopes against, and its write is
// `saveSettingsDebounced()`, whose failure ST swallows (H15). The write now reads the settings-save
// observation T8 built, then the server's own copy.
describe("wizardSessions save evidence (E3)", () => {
  const ok = { requested: true, status: 200, ok: true, timedOut: false, failed: false, burst: 1 };
  const serverHolding = () => ({ wizardSessions: JSON.parse(JSON.stringify((settings["story-orchestrator"] as { wizardSessions: unknown[] }).wizardSessions)) });

  beforeEach(() => { host.observation = ok; host.server = null; host.saves = 0; });

  it("is confirmed when the save answered 2xx and the server holds this session", async () => {
    const evidence = saveWizardSession(session());
    host.server = serverHolding();
    expect(await evidence).toEqual({ confirmed: true });
    expect(host.saves).toBe(1);
  });

  it("is not confirmed when the settings save answered 500", async () => {
    host.observation = { ...ok, status: 500, ok: false };
    expect(await saveWizardSession(session())).toEqual({ confirmed: false, reason: "the settings save answered 500" });
  });

  it("is not confirmed when the server holds an older copy of the session, or none", async () => {
    saveWizardSession(session());
    const older = serverHolding();
    (older.wizardSessions[0] as { updatedAt: string }).updatedAt = "2020-01-01T00:00:00.000Z";
    const evidence = saveWizardSession(session({ stage: "checkpoints" }));
    host.server = older;
    expect(await evidence).toEqual({ confirmed: false, reason: "the server holds this session as saved 2020-01-01T00:00:00.000Z" });
    host.server = { wizardSessions: [] };
    expect(await saveWizardSession(session())).toEqual({ confirmed: false, reason: "the server does not hold this session" });
  });

  it("confirms a clear only once the server no longer holds the session", async () => {
    saveWizardSession(session());
    const stillThere = serverHolding();
    const evidence = clearWizardSession("sun-ruins");
    host.server = stillThere;
    expect(await evidence).toEqual({ confirmed: false, reason: "the server still holds this session" });
    host.server = { wizardSessions: [] };
    expect(await clearWizardSession("sun-ruins")).toEqual({ confirmed: true });
  });

  it("says so when the server's settings could not be read", async () => {
    host.server = null;
    expect(await saveWizardSession(session())).toEqual({ confirmed: false, reason: "the server's settings could not be read back" });
  });

  it("hands every write to the listener, named by its session, until it is disposed", async () => {
    const heard: Array<{ summary: string; label: string }> = [];
    const stop = onWizardSessionSave((write) => { heard.push({ summary: write.summary, label: write.label }); });
    saveWizardSession(session());
    clearWizardSession("sun-ruins");
    stop();
    saveWizardSession(session());
    expect(heard).toEqual([{ summary: "wizard session save not confirmed", label: "wizard session sun-ruins" }, { summary: "wizard session clear not confirmed", label: "wizard session sun-ruins" }]);
  });
});
