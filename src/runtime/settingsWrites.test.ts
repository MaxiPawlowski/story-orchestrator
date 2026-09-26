import { onSettingsWrite, type LibrarySaveEvidence, type SettingsWrite } from "./librarySave";
import { confirmLibrarySave, listStoryRecords, removeStoryRecord, saveStoryRecord } from "./storyLibrary";
import { defaultGlobalSettings, getGlobalSettings, sanitizeGlobalSettings, setGlobalSettings } from "./settingsStore";
import { isValidationErrorList } from "@engine/index";
import type { LoadedStory } from "./types";

// v2.4 E3 completion. The library's writes (save, removal) and the settings
// store are extension-settings writes like the wizard sessions: `saveSettingsDebounced()` swallows its own
// failure (H15), so each reads T8's observation of `/api/settings/save` and the server's copy (H16).

const settings: Record<string, unknown> = {};
const host = { observation: { requested: true, status: 200, ok: true, timedOut: false, failed: false } as Record<string, unknown>, server: null as Record<string, unknown> | null, observed: 0, burst: 100 };

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSettingsSave: async () => { host.observed += 1; return { ...host.observation, burst: ++host.burst }; },
  readServerExtensionSettings: async () => host.server,
  getContext: () => ({ extensionSettings: settings, saveSettingsDebounced: () => {} }),
}));

const story = (title = "Heist") => ({
  format: 2,
  id: "heist",
  title,
  description: "Library fixture.",
  qualities: [{ key: "go", type: "bool", source: "extractor", rubric: "Did they set off?" }],
  checkpoints: [
    { id: "start", name: "Start", objective: "Start.", type: "anchor", start: true },
    { id: "next", name: "Next", objective: "Next.", type: "anchor" },
  ],
  transitions: [{ from: "start", to: "next", gate: { q: "go", op: "==", v: true }, priority: 0 }],
  roster: [],
});

const answered = (status: number) => ({ requested: true, status, ok: status >= 200 && status < 300, timedOut: false, failed: false });
const root = () => settings["story-orchestrator"] as Record<string, unknown>;
const saved = (raw: unknown): LoadedStory => {
  const result = saveStoryRecord(raw);
  if (isValidationErrorList(result)) throw new Error("fixture story failed validation");
  return result;
};

let heard: SettingsWrite[] = [];
let stop: () => void = () => {};

beforeEach(() => {
  delete settings["story-orchestrator"];
  host.observation = answered(200);
  host.server = null;
  host.observed = 0;
  heard = [];
  stop = onSettingsWrite((write) => { heard.push(write); });
});

afterEach(() => stop());

describe("v2.4 E3: library writes record save evidence", () => {
  it("a library save hands over its evidence, and the Studio reads that same one", async () => {
    host.observation = answered(500);
    const { record } = saved(story());
    expect(heard.map(({ summary, label }) => ({ summary, label }))).toEqual([{ summary: "library save not confirmed", label: "“Heist” v1" }]);
    expect(confirmLibrarySave(record)).toBe(heard[0].evidence);
    expect(host.observed).toBe(1);
    await expect(heard[0].evidence).resolves.toMatchObject({ confirmed: false, reason: "the settings save answered 500" });
  });

  it("a removal the server still holds is not confirmed", async () => {
    const { record } = saved(story());
    host.server = { v2Stories: [record] };
    heard = [];
    expect(removeStoryRecord("heist")).toBe(true);
    expect(heard.map(({ summary, label }) => ({ summary, label }))).toEqual([{ summary: "library removal not confirmed", label: "“Heist”" }]);
    await expect(heard[0].evidence).resolves.toEqual({ confirmed: false, reason: "the server's library still holds it" });
  });

  it("control: a removal the server no longer holds is confirmed", async () => {
    saved(story());
    host.server = { v2Stories: [] };
    heard = [];
    removeStoryRecord("heist");
    await expect(heard[0].evidence).resolves.toEqual({ confirmed: true });
  });

  it("control: a library read writes nothing and observes nothing", () => {
    saved(story());
    heard = [];
    host.observed = 0;
    listStoryRecords();
    expect(heard).toEqual([]);
    expect(host.observed).toBe(0);
  });

  it("control: with nothing listening, a write arms no observation", () => {
    stop();
    saved(story());
    removeStoryRecord("heist");
    expect(host.observed).toBe(0);
  });
});

describe("v2.4 E3: settings-store writes record save evidence", () => {
  it("a settings save answered 500 is not confirmed, labelled with the sections it wrote", async () => {
    host.observation = answered(500);
    setGlobalSettings({ extraction: { cadence: 5 } });
    expect(heard.map(({ summary, label }) => ({ summary, label }))).toEqual([{ summary: "settings save not confirmed", label: "extraction" }]);
    await expect(heard[0].evidence).resolves.toMatchObject({ confirmed: false, reason: "the settings save answered 500" });
  });

  it("is confirmed when the server holds what it wrote, or a later write", async () => {
    setGlobalSettings({ extraction: { cadence: 5 } });
    setGlobalSettings({ extraction: { cadence: 6 } });
    host.server = { settings: JSON.parse(JSON.stringify(getGlobalSettings())) };
    const outcomes = await Promise.all(heard.map((write) => write.evidence));
    expect(outcomes).toEqual([{ confirmed: true }, { confirmed: true }]);
  });

  it("is not confirmed when the server holds older settings", async () => {
    setGlobalSettings({ extraction: { cadence: 7 } });
    host.server = { settings: sanitizeGlobalSettings(defaultGlobalSettings()) };
    await expect(heard[0].evidence).resolves.toEqual<LibrarySaveEvidence>({ confirmed: false, reason: "the server holds other settings than this save wrote" });
  });
});

describe("per-pass profiles live install-wide (v2.4 plan 08 T18)", () => {
  it("keeps valid role routes, drops blank and unknown ones, and adds nothing at the defaults", () => {
    const sanitized = sanitizeGlobalSettings({ extraction: { profileId: "memory", profiles: { director: "fast", curator: "", bogus: "x" } } });
    expect(sanitized.extraction.profiles).toEqual({ director: "fast" });
    expect("profiles" in sanitizeGlobalSettings({ extraction: { profileId: "memory" } }).extraction).toBe(false);
    expect("profiles" in defaultGlobalSettings().extraction).toBe(false);
  });
});
