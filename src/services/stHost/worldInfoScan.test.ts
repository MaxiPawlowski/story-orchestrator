type Listener = (...args: unknown[]) => unknown;

const emitter = {
  events: new Map<string, Listener[]>(),
  ordered: true,
  on(event: string, listener: Listener) { this.events.set(event, [...(this.events.get(event) ?? []), listener]); },
  off(event: string, listener: Listener) { this.events.set(event, (this.events.get(event) ?? []).filter((entry) => entry !== listener)); },
  makeFirst(event: string, listener: Listener) { this.events.set(event, [listener, ...(this.events.get(event) ?? []).filter((entry) => entry !== listener)]); },
  makeLast(event: string, listener: Listener) { this.events.set(event, [...(this.events.get(event) ?? []).filter((entry) => entry !== listener), listener]); },
  emit(event: string, ...args: unknown[]) { for (const listener of [...(this.events.get(event) ?? [])]) listener(...args); },
};

const scanner = { emits: true };
const host: { extensionSettings?: Record<string, unknown> } = {};
const payload = () => ({ globalLore: [{ world: "SO-T13 Ruins", uid: 1, comment: "CP1", disable: true }], characterLore: [], chatLore: [], personaLore: [] });

jest.mock("./context", () => ({
  getContext: () => ({ extensionSettings: host.extensionSettings, eventSource: emitter.ordered ? emitter : { on: emitter.on.bind(emitter), off: emitter.off.bind(emitter) }, eventTypes: { WORLDINFO_ENTRIES_LOADED: "worldinfo_entries_loaded" } }),
}));
jest.mock("./worldInfoActivate", () => ({
  getScannableEntries: async () => {
    if (scanner.emits) emitter.emit("worldinfo_entries_loaded", payload());
    return [];
  },
}));

import { installScanGating, probeScanGating, vectorsScanWorldInfo } from "./worldInfoScan";

beforeEach(() => {
  emitter.events.clear();
  emitter.ordered = true;
  scanner.emits = true;
});

describe("installScanGating (v2.4 plan 05 T13 spike)", () => {
  it("runs synchronously as the last listener, over the four arrays of the scan's own copies", () => {
    const seen: string[] = [];
    emitter.on("worldinfo_entries_loaded", () => seen.push("foreign"));
    const handle = installScanGating((arrays) => {
      seen.push(`gate:${arrays.length}`);
      arrays[0][0].disable = false;
    });
    emitter.on("worldinfo_entries_loaded", () => seen.push("late foreign"));
    handle.reassert();
    const loaded = payload();
    emitter.emit("worldinfo_entries_loaded", loaded);
    expect(seen).toEqual(["foreign", "late foreign", "gate:4"]);
    expect(loaded.globalLore[0].disable).toBe(false);
    expect(handle.scans()).toBe(1);
  });

  it("a handler that throws leaves the scan alone rather than breaking it", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    installScanGating(() => { throw new Error("boom"); });
    expect(() => emitter.emit("worldinfo_entries_loaded", payload())).not.toThrow();
    warn.mockRestore();
  });

  it("the capability is present only when the handler was seen on a probe scan (S6)", async () => {
    const handle = installScanGating(() => undefined);
    expect((await probeScanGating(handle)).state).toBe("present");
    scanner.emits = false;
    expect((await probeScanGating(handle)).state).toBe("absent");
  });

  it("a host that cannot order listeners is absent: the file path stays in charge", async () => {
    emitter.ordered = false;
    const handle = installScanGating(() => undefined);
    expect((await probeScanGating(handle)).state).toBe("absent");
  });

  it("dispose detaches the handler", () => {
    const handle = installScanGating(() => undefined);
    handle.dispose();
    expect([...emitter.events.values()].flat()).toEqual([]);
  });
});

describe("L5: vectors World Info (v25-08-H10)", () => {
  it("reads the vectors extension's own switch, and treats an unreadable one as off", () => {
    host.extensionSettings = undefined;
    expect(vectorsScanWorldInfo()).toBe(false);
    host.extensionSettings = { vectors: { enabled_world_info: false } };
    expect(vectorsScanWorldInfo()).toBe(false);
    host.extensionSettings = { vectors: { enabled_world_info: true } };
    expect(vectorsScanWorldInfo()).toBe(true);
  });
});
