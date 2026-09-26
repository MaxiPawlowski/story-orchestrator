const settings: Record<string, unknown> = {};

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSettingsSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false, failed: false }),
  readServerExtensionSettings: async () => null,
  getContext: () => ({ extensionSettings: settings, saveSettingsDebounced: () => {} }),
}));

import { SETTINGS_SCHEMA, settingsRoot } from "./settingsRoot";
import { getGlobalSettings, setGlobalSettings } from "./settingsStore";
import { listStoryRecords, saveStoryRecord } from "./storyLibrary";
import { loadWizardSession, saveWizardSession } from "./wizardSessions";

const story = {
  format: 2,
  id: "heist",
  title: "Heist",
  description: "Root fixture.",
  qualities: [{ key: "go", type: "bool", source: "extractor", rubric: "Did they set off?" }],
  checkpoints: [
    { id: "start", name: "Start", objective: "Start.", type: "anchor", start: true },
    { id: "next", name: "Next", objective: "Next.", type: "anchor" },
  ],
  transitions: [{ from: "start", to: "next", gate: { q: "go", op: "==", v: true }, priority: 0 }],
  roster: [],
};
const session = { key: "k", stage: "premise", history: [], questions: [], applied: [], createdLorebooks: [], seed: "", updatedAt: "" } as never;

beforeEach(() => {
  delete settings["story-orchestrator"];
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe("v2.5 plan 11: the install-wide root carries schema 1", () => {
  it("a read never stamps the root", () => {
    getGlobalSettings();
    listStoryRecords();
    loadWizardSession("k");
    expect(settingsRoot().schema).toBeUndefined();
  });

  it.each([
    ["a settings write", () => setGlobalSettings({ talk: { enabled: false } })],
    ["a library save", () => saveStoryRecord(story)],
    ["a wizard session save", () => saveWizardSession(session)],
  ])("%s stamps it", (_label, write) => {
    write();
    expect(settingsRoot().schema).toBe(SETTINGS_SCHEMA);
  });

  it("a root carrying another value is re-stamped by the next write, and its fields are still read", () => {
    settings["story-orchestrator"] = { schema: 7, settings: { talk: { enabled: false } } };
    expect(getGlobalSettings().talk.enabled).toBe(false);
    expect(settingsRoot().schema).toBe(7);
    setGlobalSettings({ talk: { enabled: true } });
    expect(settingsRoot().schema).toBe(SETTINGS_SCHEMA);
  });

  it("a library record without an id or version is dropped on read, and the read writes nothing", () => {
    const stored = [{ hash: "h1", title: "Old", raw: { id: "old" }, importedAt: "2026-09-01T00:00:00.000Z" }, { id: "kept", version: 1, hash: "h2", title: "Kept", raw: { id: "kept" }, importedAt: "x", updatedAt: "x" }];
    settings["story-orchestrator"] = { v2Stories: stored };
    const before = JSON.stringify(settings);
    expect(listStoryRecords().map((record) => record.id)).toEqual(["kept"]);
    expect(JSON.stringify(settings)).toBe(before);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("1 record(s) without an id or version"));
  });

  it("a duplicate id keeps the newer record", () => {
    const record = (title: string, updatedAt: string) => ({ id: "same", version: 1, hash: title, title, raw: { id: "same" }, importedAt: updatedAt, updatedAt });
    settings["story-orchestrator"] = { v2Stories: [record("Newer", "2026-09-02T00:00:00.000Z"), record("Older", "2026-09-01T00:00:00.000Z")] };
    expect(listStoryRecords().map((entry) => entry.title)).toEqual(["Newer"]);
  });
});
