const mockHost: { context: Record<string, unknown> } = { context: {} };

jest.mock("./context", () => ({ getContext: () => mockHost.context }));

import { inputBudget } from "@extraction/inputBudget";
import { CONTEXT_TABLE, clampToServed, contextLimitFromPreset, contextLimitFromTable, readProfileContextLimit } from "./contextLimit";
import { servedContext, servedContextOf } from "./servedContext";
import { readServedContextWith } from "./servedContextPort";

const PRESETS: Record<string, Record<string, Record<string, unknown>>> = {
  textgenerationwebui: { "Artemis Extraction": { max_length: 98304, temp: 0.1 }, Bare: { temp: 0.7 } },
  openai: { "Orchestrator-Gemma4-v1.0": { openai_max_context: 32768 }, "No size": { temp: 1 } },
};

const host = (profiles: Array<Record<string, unknown>>, overrides: Record<string, unknown> = {}) => ({
  extensionSettings: { disabledExtensions: [], connectionManager: { profiles } },
  CONNECT_API_MAP: { llamacpp: { selected: "textgenerationwebui", type: "llamacpp" }, openai: { selected: "openai", source: "openai" }, deepseek: { selected: "openai", source: "deepseek" }, claude: { selected: "openai", source: "claude" }, google: { selected: "openai", source: "makersuite" }, custom: { selected: "openai", source: "custom" }, openrouter: { selected: "openai", source: "openrouter" }, kobold: { selected: "kobold" } },
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

  it("a CC profile with no preset and no model is budgeted at its source row", () => {
    mockHost.context = host([{ id: "oa", api: "openai" }]);
    expect(readProfileContextLimit("oa")).toEqual({ value: 128000, source: "source", reason: "known for openai; the profile names no settings preset" });
  });

  describe("v2.7 02 C14: the per-source, per-model context table", () => {
    it("a model row wins over its source row", () => {
      mockHost.context = host([{ id: "g4", api: "openai", model: "gpt-4" }, { id: "g5", api: "openai", model: "gpt-5-mini" }]);
      expect(readProfileContextLimit("g4")).toEqual({ value: 8191, source: "source", reason: "known for gpt-4 on openai; the profile names no settings preset" });
      expect(readProfileContextLimit("g5")).toMatchObject({ value: 400000, source: "source" });
    });

    it("an unknown model on a known source takes the source row", () => {
      mockHost.context = host([{ id: "c", api: "claude", model: "claude-unreleased-9" }, { id: "gm", api: "google", model: "unknown-model" }]);
      expect(readProfileContextLimit("c")).toEqual({ value: 200000, source: "source", reason: "known for claude; the profile names no settings preset" });
      expect(readProfileContextLimit("gm")).toMatchObject({ value: 128000, source: "source" });
    });

    it("an unknown source keeps the 8192 default with its reason", () => {
      mockHost.context = host([{ id: "cu", api: "custom", model: "gpt-5" }, { id: "or", api: "openrouter", model: "deepseek/deepseek-v4" }]);
      expect(readProfileContextLimit("cu")).toEqual({ value: 8192, source: "default", reason: "the profile names no settings preset" });
      expect(readProfileContextLimit("or")).toEqual({ value: 8192, source: "default", reason: "the profile names no settings preset" });
    });

    it("a preset value wins over the table", () => {
      mockHost.context = host([{ id: "p", api: "claude", model: "claude-opus-5", preset: "Orchestrator-Gemma4-v1.0" }]);
      expect(readProfileContextLimit("p")).toEqual({ value: 32768, source: "preset" });
    });

    it("a CC preset without a usable size falls to the table, naming why", () => {
      mockHost.context = host([{ id: "p", api: "deepseek", preset: "No size" }, { id: "q", api: "deepseek", preset: "Deleted" }]);
      expect(readProfileContextLimit("p")).toEqual({ value: 131072, source: "source", reason: 'known for deepseek; the preset "No size" has no usable openai_max_context' });
      expect(readProfileContextLimit("q")).toEqual({ value: 131072, source: "source", reason: 'known for deepseek; the preset "Deleted" could not be read' });
    });

    it("a TC profile is untouched by the table", () => {
      mockHost.context = host([{ id: "tc", api: "llamacpp", model: "gpt-5" }, { id: "tcb", api: "llamacpp", preset: "Bare", model: "claude-opus-5" }]);
      expect(readProfileContextLimit("tc")).toEqual({ value: 8192, source: "default", reason: "the profile names no settings preset" });
      expect(readProfileContextLimit("tcb")).toEqual({ value: 8192, source: "default", reason: expect.stringContaining("no usable max_length") });
    });

    it("the input budget truncates at the table's limit", () => {
      mockHost.context = host([{ id: "c", api: "claude" }]);
      const budget = inputBudget(readProfileContextLimit("c"), 512);
      expect(budget).toMatchObject({ maxTokens: 512, margin: 20000, input: 200000 - 512 - 20000 });
      expect(inputBudget(readProfileContextLimit("missing"), 512).input).toBe(8192 - 512 - 820);
    });

    it("every row is a positive integer, and each source has at most one source row, after its model rows", () => {
      const sources = new Set(CONTEXT_TABLE.map((row) => row.source));
      for (const source of sources) {
        const rows = CONTEXT_TABLE.filter((row) => row.source === source);
        expect(rows.filter((row) => !row.model)).toHaveLength(1);
        expect(rows.findIndex((row) => !row.model)).toBe(rows.length - 1);
      }
      expect(CONTEXT_TABLE.every((row) => Number.isInteger(row.value) && row.value > 0)).toBe(true);
      expect(contextLimitFromTable(undefined, "gpt-5")).toBeNull();
      expect(contextLimitFromTable("deepseek", undefined)).toMatchObject({ value: 131072 });
    });
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

describe("v2.8 F20: a llama.cpp profile is budgeted against what its server serves", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });

  it("clamps the preset's context to the server's n_ctx once the server answered, and names why", async () => {
    const calls: unknown[] = [];
    globalThis.fetch = (async (url: string, init: { body: string }) => {
      calls.push([url, JSON.parse(init.body)]);
      return { ok: true, json: async () => ({ default_generation_settings: { n_ctx: 32768 } }) };
    }) as unknown as typeof fetch;
    mockHost.context = { ...host([{ id: "loc", api: "llamacpp", "api-url": "http://127.0.0.1:18888", preset: "Artemis Extraction" }]), getRequestHeaders: () => ({}) };
    (globalThis as { SillyTavern?: unknown }).SillyTavern = { getContext: () => mockHost.context };
    const stop = readServedContextWith(servedContext);
    expect(readProfileContextLimit("loc")).toEqual({ value: 98304, source: "preset" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(readProfileContextLimit("loc")).toEqual({ value: 32768, source: "source", reason: "http://127.0.0.1:18888 serves 32768" });
    expect(calls).toEqual([["/api/backends/text-completions/props", { api_server: "http://127.0.0.1:18888", api_type: "llamacpp" }]]);
    stop();
    expect(readProfileContextLimit("loc")).toEqual({ value: 98304, source: "preset" });
  });

  it("never raises a preset's context, and a server that does not answer leaves the preset alone", () => {
    expect(clampToServed({ value: 16384, source: "preset" }, 32768, "u")).toEqual({ value: 16384, source: "preset" });
    expect(clampToServed({ value: 16384, source: "preset" }, null, "u")).toEqual({ value: 16384, source: "preset" });
  });

  it("reads n_ctx only when it is a positive integer", () => {
    expect(servedContextOf({ default_generation_settings: { n_ctx: 32768 } })).toBe(32768);
    expect(servedContextOf({ default_generation_settings: { n_ctx: "32768" } })).toBeNull();
    expect(servedContextOf({})).toBeNull();
  });
});
