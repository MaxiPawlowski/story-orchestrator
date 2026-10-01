const mockHost: { context: Record<string, unknown> } = { context: {} };

jest.mock("./context", () => ({ getContext: () => mockHost.context }));

import { contextLimitFromPreset, readProfileContextLimit } from "./contextLimit";

const PRESETS: Record<string, Record<string, Record<string, unknown>>> = {
  textgenerationwebui: { "Artemis Extraction": { max_length: 98304, temp: 0.1 }, Bare: { temp: 0.7 } },
  openai: { "Orchestrator-Gemma4-v1.0": { openai_max_context: 32768 } },
};

const host = (profiles: Array<Record<string, unknown>>, overrides: Record<string, unknown> = {}) => ({
  extensionSettings: { disabledExtensions: [], connectionManager: { profiles } },
  CONNECT_API_MAP: { llamacpp: { selected: "textgenerationwebui", type: "llamacpp" }, openai: { selected: "openai", source: "openai" }, deepseek: { selected: "openai", source: "deepseek" }, kobold: { selected: "kobold" } },
  getPresetManager: (api: string) => (PRESETS[api] ? { getCompletionPresetByName: (name: string) => PRESETS[api][name] } : null),
  ...overrides,
});

describe("v2.4 plan 03 H12: the extraction profile's context limit", () => {
  it("reads a TC profile's max_length from its preset", () => {
    mockHost.context = host([{ id: "p1", api: "llamacpp", preset: "Artemis Extraction" }]);
    expect(readProfileContextLimit("p1")).toEqual({ value: 98304, source: "preset" });
  });

  it("reads a CC profile's openai_max_context from its preset", () => {
    mockHost.context = host([{ id: "p2", api: "openai", preset: "Orchestrator-Gemma4-v1.0" }]);
    expect(readProfileContextLimit("p2")).toEqual({ value: 32768, source: "preset" });
  });

  it("a DeepSeek CC profile with no preset is budgeted at its provider's known context, not the 8192 default", () => {
    mockHost.context = host([{ id: "ds", api: "deepseek", model: "deepseek-flash" }]);
    expect(readProfileContextLimit("ds")).toEqual({ value: 131072, source: "source", reason: expect.stringContaining("deepseek") });
  });

  it("a CC profile with no preset and an unlisted source keeps the default", () => {
    mockHost.context = host([{ id: "oa", api: "openai" }]);
    expect(readProfileContextLimit("oa")).toEqual({ value: 8192, source: "default", reason: expect.stringContaining("no settings preset") });
  });

  it("unreadable preset → default 8192, reported", () => {
    mockHost.context = host([{ id: "p1", api: "llamacpp", preset: "Deleted preset" }]);
    expect(readProfileContextLimit("p1")).toEqual({ value: 8192, source: "default", reason: expect.stringContaining("Deleted preset") });
  });

  it("a host that throws while reading is the default, never a throw; the host's message goes to the log, not the panel", () => {
    mockHost.context = host([{ id: "p1", api: "llamacpp", preset: "Artemis Extraction" }], { getPresetManager: () => { throw new Error("preset manager exploded"); } });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const limit = readProfileContextLimit("p1");
    expect(limit).toEqual({ value: 8192, source: "default", reason: "the preset could not be read" });
    expect(limit.reason).not.toContain("exploded");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("preset could not be read"), expect.objectContaining({ message: "preset manager exploded" }));
    warn.mockRestore();
  });

  it.each([
    ["no profile id", null, host([]), "no memory model profile"],
    ["a deleted profile", "gone", host([{ id: "p1", api: "llamacpp", preset: "Artemis Extraction" }]), "no longer exists"],
    ["a profile with no preset", "p1", host([{ id: "p1", api: "llamacpp" }]), "no settings preset"],
    ["a preset without a size", "p1", host([{ id: "p1", api: "llamacpp", preset: "Bare" }]), "no usable max_length"],
    ["an API without completion presets", "p3", host([{ id: "p3", api: "kobold", preset: "x" }]), "no preset context size"],
    ["no preset manager on this host", "p1", host([{ id: "p1", api: "llamacpp", preset: "Artemis Extraction" }], { getPresetManager: undefined }), "no preset manager"],
    ["Connection Manager disabled", "p1", host([{ id: "p1", api: "llamacpp", preset: "Artemis Extraction" }], { extensionSettings: { disabledExtensions: ["connection-manager"], connectionManager: { profiles: [] } } }), "Connection Manager"],
  ])("%s → default 8192 with a reason", (_label, id, context, reason) => {
    mockHost.context = context;
    expect(readProfileContextLimit(id)).toEqual({ value: 8192, source: "default", reason: expect.stringContaining(reason) });
  });

  it("the pure mapping picks the key per API and refuses a non-positive size", () => {
    expect(contextLimitFromPreset("textgenerationwebui", "a", { max_length: 4096, openai_max_context: 1 })).toEqual({ value: 4096, source: "preset" });
    expect(contextLimitFromPreset("openai", "b", { max_length: 1, openai_max_context: 16384.7 })).toEqual({ value: 16384, source: "preset" });
    expect(contextLimitFromPreset("openai", "c", { openai_max_context: 0 })).toMatchObject({ value: 8192, source: "default" });
    expect(contextLimitFromPreset("textgenerationwebui", "d", { max_length: "8192" })).toMatchObject({ value: 8192, source: "default" });
    expect(contextLimitFromPreset(undefined, "e", { max_length: 4096 })).toMatchObject({ source: "default" });
  });
});
