import { tunnelVisionBooksWith } from "./tunnelVision";
import type { ExtensionConflictHost } from "./extensionConflicts";

const host = (settings: Record<string, unknown> = {}, overrides: Partial<ExtensionConflictHost> = {}): ExtensionConflictHost => ({
  settings: { tunnelvision: { enabledLorebooks: { "Story Lore": true, Unrelated: false }, ...settings } },
  manifest: (name) => name === "third-party/TunnelVision" ? { display_name: "TunnelVision" } : null,
  ...overrides,
});

describe("TunnelVision book ownership", () => {
  it("reports enabled books and default suppression/write access without changing settings", () => {
    const source = host();
    const before = JSON.stringify(source.settings);
    expect(tunnelVisionBooksWith(source)).toEqual([{ name: "Story Lore", suppressesScan: true, canWrite: true }]);
    expect(JSON.stringify(source.settings)).toBe(before);
  });

  it("distinguishes keyword passthrough, native injection and read-only permissions", () => {
    expect(tunnelVisionBooksWith(host({ allowKeywordTriggers: true }))).toEqual([{ name: "Story Lore", suppressesScan: false, canWrite: true }]);
    expect(tunnelVisionBooksWith(host({ bookInjectionModes: { "Story Lore": "native" } }))).toEqual([{ name: "Story Lore", suppressesScan: false, canWrite: true }]);
    expect(tunnelVisionBooksWith(host({ bookPermissions: { "Story Lore": "read_only" } }))).toEqual([{ name: "Story Lore", suppressesScan: true, canWrite: false }]);
    expect(tunnelVisionBooksWith(host({ allowKeywordTriggers: true, bookPermissions: { "Story Lore": "read_only" } }))).toEqual([]);
  });

  it.each(["lifecycleEnabled", "postTurnEnabled", "sidecarPostGenWriter"])("keeps the write risk when %s can bypass read-only permissions", (writer) => {
    expect(tunnelVisionBooksWith(host({ allowKeywordTriggers: true, bookPermissions: { "Story Lore": "read_only" }, [writer]: true })))
      .toEqual([{ name: "Story Lore", suppressesScan: false, canWrite: true }]);
  });

  it("ignores absent, disabled, globally off and malformed settings", () => {
    expect(tunnelVisionBooksWith(host({}, { manifest: () => null }))).toEqual([]);
    expect(tunnelVisionBooksWith(host({}, { settings: { disabledExtensions: ["third-party/TunnelVision"], tunnelvision: { enabledLorebooks: { "Story Lore": true } } } }))).toEqual([]);
    expect(tunnelVisionBooksWith(host({ globalEnabled: false }))).toEqual([]);
    expect(tunnelVisionBooksWith(host({ enabledLorebooks: { "Story Lore": "true" } }))).toEqual([]);
    expect(tunnelVisionBooksWith({ settings: null })).toEqual([]);
    expect(tunnelVisionBooksWith(host({ enabledLorebooks: [] }))).toEqual([]);
  });

  it("recognizes the researched installation folder", () => {
    expect(tunnelVisionBooksWith(host({}, { manifest: (name) => name === "third-party/tunnelvision-fully-autonomous-and-easy-lorebook" ? {} : null }))).toHaveLength(1);
  });
});
