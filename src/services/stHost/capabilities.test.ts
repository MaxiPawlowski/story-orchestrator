const mockHost = { parser: true, commands: ["bg", "sendas"], judge: { configured: true } as { configured: boolean } | null, vectorStatus: 200, vectorThrows: false, fetches: 0, judgeCalls: 0, backgrounds: { background_settings: { name: "tavern.jpg" } } as unknown, hostVersion: null as { version: string; commit: string | null; branch: string | null } | null, macroEngine: "new" as "new" | "legacy" | "unknown", script: { getMaxContextTokens: () => 98304, getMaxResponseTokens: () => 600, getMaxPromptTokens: () => 97704 } as Record<string, unknown> | null };

jest.mock("./context", () => ({
  getContext: () => ({ getRequestHeaders: () => ({ "X-CSRF-Token": "t" }), mainApi: "textgenerationwebui" }),
  hostMacrosAvailable: () => mockHost.parser,
}));

jest.mock("./judge", () => ({
  JUDGE_PLUGIN_BASE: "/api/plugins/story-orchestrator-judge",
  judgeStatus: async () => {
    mockHost.judgeCalls += 1;
    return mockHost.judge;
  },
}));

jest.mock("./selectors", () => ({
  listSlashCommands: () => mockHost.commands.map((name) => ({ name, aliases: [] })),
}));

// `modules.ts` top-level-awaits five ST modules, so importing it under jest is a parse error — the
// backgrounds probe is driven through the one export it reads.
jest.mock("./modules", () => ({
  get backgroundsModule() { return mockHost.backgrounds; },
  get scriptModule() { return mockHost.script; },
}));

jest.mock("./version", () => ({
  getHostVersion: async () => mockHost.hostVersion,
  macroEngineInUse: () => mockHost.macroEngine,
}));

import { CAPABILITY_IDS, capabilityReport, hostFacts, invalidateCapabilities, probeCapability, renderCapabilityReport } from "./capabilities";

const okFetch = (status: number) => () => {
  mockHost.fetches += 1;
  if (mockHost.vectorThrows) return Promise.reject(new Error("network down"));
  return Promise.resolve({ ok: status >= 200 && status < 300, status } as Response);
};

describe("capability probes", () => {
  beforeEach(() => {
    invalidateCapabilities();
    mockHost.parser = true;
    mockHost.commands = ["bg", "sendas"];
    mockHost.judge = { configured: true };
    mockHost.vectorStatus = 200;
    mockHost.vectorThrows = false;
    mockHost.fetches = 0;
    mockHost.judgeCalls = 0;
    mockHost.backgrounds = { background_settings: { name: "tavern.jpg" } };
    mockHost.hostVersion = { version: "1.13.4", commit: "abc1234", branch: "release" };
    mockHost.macroEngine = "new";
    mockHost.script = { getMaxContextTokens: () => 98304, getMaxResponseTokens: () => 600, getMaxPromptTokens: () => 97704 };
    globalThis.fetch = okFetch(mockHost.vectorStatus) as unknown as typeof fetch;
  });

  it("probes every capability id and reports a healthy install as present", async () => {
    const reports = await capabilityReport();
    expect(reports.map((report) => report.id)).toEqual(CAPABILITY_IDS);
    expect(reports.filter((report) => report.state !== "present").map((report) => `${report.id}: ${report.detail}`)).toEqual([]);
  });

  it("names an absent macro engine rather than throwing on the first registration", async () => {
    mockHost.parser = false;
    await expect(probeCapability("macros")).resolves.toEqual({ id: "macros", state: "absent", detail: expect.stringContaining("MacrosParser") });
  });

  it("names the commands an effects path needs and this build does not have", async () => {
    mockHost.commands = ["bg"];
    const report = await probeCapability("slashCommands");
    expect(report.state).toBe("absent");
    expect(report.detail).toContain("/sendas");
    expect(report.detail).not.toContain("/bg,");
  });

  // V17: a 500 was cached as `absent` for the page load, so one bad moment switched consolidation to
  // keyword overlap until a reload.
  it("reads a failing vectors route as an error it will retry, not as an absent feature", async () => {
    globalThis.fetch = okFetch(500) as unknown as typeof fetch;
    await expect(probeCapability("vectors")).resolves.toMatchObject({ state: "error", detail: expect.stringContaining("500") });
    const before = mockHost.fetches;
    globalThis.fetch = okFetch(200) as unknown as typeof fetch;
    await expect(probeCapability("vectors")).resolves.toMatchObject({ state: "present" });
    expect(mockHost.fetches).toBe(before + 1);
  });

  it("reads a missing vectors route as absent, and an answer as present", async () => {
    globalThis.fetch = okFetch(404) as unknown as typeof fetch;
    await expect(probeCapability("vectors")).resolves.toMatchObject({ state: "absent" });
    invalidateCapabilities();
    globalThis.fetch = okFetch(200) as unknown as typeof fetch;
    await expect(probeCapability("vectors")).resolves.toMatchObject({ state: "present" });
  });

  it("caches a verdict for the page load, and re-asks only when told to", async () => {
    await probeCapability("vectors");
    await probeCapability("vectors");
    expect(mockHost.fetches).toBe(1);
    await probeCapability("vectors", { refresh: true });
    expect(mockHost.fetches).toBe(2);
    expect(mockHost.judgeCalls).toBe(0);
  });

  it("does NOT cache a probe that threw, so the next use retries it", async () => {
    mockHost.vectorThrows = true;
    await expect(probeCapability("vectors")).resolves.toMatchObject({ state: "error", detail: "network down" });
    mockHost.vectorThrows = false;
    await expect(probeCapability("vectors")).resolves.toMatchObject({ state: "present" });
    expect(mockHost.fetches).toBe(2);
  });

  it("distinguishes an installed-but-unkeyed judge plugin from a missing one", async () => {
    mockHost.judge = { configured: false };
    await expect(probeCapability("judge")).resolves.toMatchObject({ state: "absent", detail: expect.stringContaining("no key") });
  });

  it("names a build whose backgrounds module did not load, since a checkpoint effect needs it", async () => {
    mockHost.backgrounds = {};
    await expect(probeCapability("backgrounds")).resolves.toMatchObject({ state: "absent", detail: expect.stringContaining("background_settings") });
    mockHost.backgrounds = { background_settings: { name: "tavern.jpg" } };
    await expect(probeCapability("backgrounds", { refresh: true })).resolves.toMatchObject({ state: "present" });
  });

  it("reports the host facts a bug report needs, and one paste carries all of it", async () => {
    await expect(hostFacts()).resolves.toEqual({ stVersion: "1.13.4", stCommit: "abc1234", macroEngine: "new" });
    const reports = await capabilityReport();
    const text = renderCapabilityReport(reports, await hostFacts(), "2.3.0");
    expect(text).toContain("Story Orchestrator 2.3.0");
    expect(text).toContain("SillyTavern 1.13.4 (abc1234)");
    expect(text).toContain("macros: new engine");
    reports.forEach((report) => expect(text).toContain(`${report.id}: ${report.state}`));
  });

  it("says unknown rather than guessing when the host cannot answer /version", async () => {
    mockHost.hostVersion = null;
    mockHost.macroEngine = "unknown";
    await expect(hostFacts()).resolves.toEqual({ stVersion: null, stCommit: null, macroEngine: "unknown" });
  });

  it("states the main API's prompt budget as present, and a build without the exports as absent", async () => {
    await expect(probeCapability("contextBudget")).resolves.toMatchObject({ state: "present", detail: expect.stringContaining("97704") });
    mockHost.script = {};
    invalidateCapabilities();
    await expect(probeCapability("contextBudget")).resolves.toMatchObject({ state: "absent" });
  });
});
