import { wrote } from "@utils/writeResult";
import type { WorldInfoSettings } from "./settingsStore";
import { createWiGating, type WiGatingDeps } from "./worldInfoGating";
import type { WiGatingStatus } from "./worldInfoMode";

const story = (books: Record<string, string[]>) => ({ checkpoints: [{ effects: { world_info: { enable: Object.entries(books).map(([lorebook, comments]) => ({ lorebook, comments })) } } }] });

const deferred = () => {
  let release: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
};

const harness = (options: { mode?: "file" | "scan"; confirm?: boolean; capability?: "present" | "absent"; library?: unknown[]; ledger?: Record<string, string[]> } = {}) => {
  const settings: WorldInfoSettings = { gatingMode: options.mode ?? "file", normalized: options.ledger ?? {}, normalizedFrom: {}, scanMemory: false, keptGlobal: [] };
  const disk = new Map<string, Map<string, boolean | null>>([
    ["Ruins", new Map<string, boolean | null>([["CP1", false], ["CP2", false], ["Other", false], ["Off by hand", true], ["No key", null]])],
  ]);
  const events: string[] = [];
  const toasts: string[] = [];
  const journal: Array<[string, string]> = [];
  const statuses: WiGatingStatus[] = [];
  const library = { value: options.library ?? [story({ Ruins: ["CP1"] })] };
  let active = false;
  let hold: Promise<void> | null = null;
  let onRead: (() => void) | null = null;
  const deps: WiGatingDeps = {
    settings: () => settings,
    write: (patch) => {
      Object.assign(settings, patch);
      events.push(`write:${Object.keys(patch).join(",")}`);
    },
    library: () => library.value,
    read: async (lorebook) => {
      events.push(`read:${lorebook}`);
      onRead?.();
      const book = disk.get(lorebook);
      return book ? new Map(book) : null;
    },
    disable: async (lorebook, comments) => {
      if (hold) await hold;
      events.push(`disable:${lorebook}:${comments.join("|")}`);
      comments.forEach((comment) => disk.get(lorebook)?.set(comment, true));
      return wrote({ changed: true, confirmed: true });
    },
    enable: async (lorebook, comments) => {
      if (hold) await hold;
      events.push(`enable:${lorebook}:${comments.join("|")}`);
      comments.forEach((comment) => disk.get(lorebook)?.set(comment, false));
      return wrote({ changed: true, confirmed: true });
    },
    handler: {
      install: () => { events.push("install"); },
      probe: async () => {
        events.push("probe");
        return options.capability === "absent" ? { state: "absent", detail: "no makeLast" } : { state: "present", detail: "the handler ran on a probe scan" };
      },
      dispose: () => { events.push("dispose"); },
    },
    setActive: (next) => {
      active = next;
      events.push(`active:${String(next)}`);
    },
    replayFilePath: async () => { events.push("replay"); },
    settle: (next) => { events.push(`settle:${String(next)}`); },
    confirm: async (preview) => {
      events.push(`confirm:${preview.map((book) => `${book.lorebook}=${book.entries}`).join(",")}`);
      return options.confirm ?? true;
    },
    toast: (text) => { toasts.push(text); },
    journal: (summary, note) => { journal.push([summary, note]); },
    publish: (status) => { statuses.push(status); },
  };
  const gating = createWiGating(deps);
  return {
    gating, settings, disk, events, toasts, journal, statuses, library,
    active: () => active,
    holdWrites: (promise: Promise<void> | null) => { hold = promise; },
    onRead: (callback: (() => void) | null) => { onRead = callback; },
    last: () => statuses[statuses.length - 1],
  };
};

describe("lorebook gating control (v2.5 plan 01 A/C)", () => {
  it("the confirm gates the first write: cancelling leaves file mode and writes nothing", async () => {
    const h = harness({ confirm: false });
    expect(await h.gating.requestScan()).toBe(false);
    expect(h.settings.gatingMode).toBe("file");
    expect(h.events.filter((event) => event.startsWith("disable") || event === "install")).toEqual([]);
    expect(h.disk.get("Ruins")!.get("CP1")).toBe(false);
  });

  it("the confirm names each book and how many of its entries will rest off", async () => {
    const h = harness({ library: [story({ Ruins: ["CP1", "CP2", "Not written"] })] });
    await h.gating.requestScan();
    expect(h.events).toContain("confirm:Ruins=2");
  });

  it("in file mode a library save normalises nothing (the confirm is the switch)", async () => {
    const h = harness();
    await h.gating.sync();
    expect(h.events.filter((event) => event.startsWith("disable"))).toEqual([]);
    expect(h.settings.normalized).toEqual({});
  });

  it("confirmed: normalises first, then activates (W2); a scan before that runs the file path", async () => {
    const h = harness();
    const gate = deferred();
    h.holdWrites(gate.promise);
    const pending = h.gating.requestScan();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(h.settings.gatingMode).toBe("scan");
    expect(h.active()).toBe(false);
    gate.release();
    expect(await pending).toBe(true);
    expect(h.active()).toBe(true);
    const order = h.events.filter((event) => ["install", "probe", "disable:Ruins:CP1", "active:true"].includes(event));
    expect(order).toEqual(["install", "probe", "disable:Ruins:CP1", "active:true"]);
    expect(h.settings.normalized).toEqual({ Ruins: ["CP1"] });
    expect(h.settings.normalizedFrom).toEqual({ Ruins: [{ comment: "CP1", wasOn: true }] });
  });

  it("an absent capability keeps the file path, says why, and writes nothing", async () => {
    const h = harness({ capability: "absent" });
    await h.gating.requestScan();
    expect(h.active()).toBe(false);
    expect(h.events.filter((event) => event.startsWith("disable"))).toEqual([]);
    expect(h.last().capability).toEqual({ state: "absent", detail: "no makeLast" });
  });

  it("v2.5 P01-L1: in scan mode an absent capability settles on the file path once and replays the open chat's path", async () => {
    const h = harness({ mode: "scan", capability: "absent" });
    await h.gating.sync();
    await h.gating.sync();
    expect(h.events.filter((event) => event.startsWith("settle") || event === "replay")).toEqual(["settle:true", "replay"]);
    expect(h.events.filter((event) => event.startsWith("disable") || event.startsWith("enable"))).toEqual([]);
  });

  it("v2.5 P01-L1: a scan-mode start-up verifies, normalises and activates without ever releasing the file path", async () => {
    const h = harness({ mode: "scan", ledger: { Ruins: ["CP1"] } });
    await h.gating.sync();
    expect(h.active()).toBe(true);
    expect(h.last().drift).toEqual([{ lorebook: "Ruins", comment: "CP1" }]);
    expect(h.events.filter((event) => event.startsWith("settle") || event === "replay")).toEqual([]);
  });

  it("v2.5 P01-L1: a sync that fails in scan mode keeps the file path held, so a failed start never writes around the verify", async () => {
    const h = harness({ mode: "scan" });
    const failing = Promise.reject(new Error("the server went away"));
    failing.catch(() => undefined);
    h.holdWrites(failing);
    await h.gating.sync();
    expect(h.active()).toBe(false);
    expect(h.events.filter((event) => event.startsWith("settle") || event === "replay")).toEqual([]);
  });

  it("a gated set grown by the author's own save is normalised without a second confirm, with a toast and a journal line", async () => {
    const h = harness();
    await h.gating.requestScan();
    h.toasts.length = 0;
    h.library.value = [story({ Ruins: ["CP1", "CP2"] })];
    await h.gating.sync();
    expect(h.events.filter((event) => event.startsWith("confirm"))).toHaveLength(1);
    expect(h.events).toContain("disable:Ruins:CP2");
    expect(h.toasts).toEqual(["1 story lorebook entry now rests off in 1 lorebook; each chat switches on its own story's entries."]);
    expect(h.journal).toContainEqual(["lorebook entries now rest off", "Ruins: CP2"]);
  });

  it("switching back to file asks nothing, deactivates at once and applies the current chat's path", async () => {
    const h = harness();
    await h.gating.requestScan();
    const confirms = h.events.filter((event) => event.startsWith("confirm")).length;
    await h.gating.requestFile();
    expect(h.settings.gatingMode).toBe("file");
    expect(h.active()).toBe(false);
    expect(h.events.slice(-4)).toEqual(["settle:false", "active:false", "dispose", "replay"]);
    expect(h.events.filter((event) => event.startsWith("confirm")).length).toBe(confirms);
  });

  it("a switch to file mode while the ledger is being verified normalises nothing", async () => {
    const h = harness({ mode: "scan", ledger: { Ruins: ["CP1"] }, library: [story({ Ruins: ["CP1", "CP2"] })] });
    h.disk.get("Ruins")!.set("CP1", true);
    h.onRead(() => { h.settings.gatingMode = "file"; });
    await h.gating.sync();
    expect(h.events.filter((event) => event.startsWith("disable"))).toEqual([]);
    expect(h.active()).toBe(false);
  });

  it("a switch to file mode during a normalisation read stops before the write", async () => {
    const h = harness({ mode: "scan", ledger: {} });
    h.onRead(() => { h.settings.gatingMode = "file"; });
    await h.gating.sync();
    expect(h.events.filter((event) => event.startsWith("disable"))).toEqual([]);
    expect(h.settings.normalized).toEqual({});
  });

  it("a mode written by another path takes effect without a reload", async () => {
    const h = harness({ mode: "scan", ledger: {} });
    await h.gating.sync();
    expect(h.active()).toBe(true);
    h.settings.gatingMode = "file";
    await h.gating.sync();
    expect(h.active()).toBe(false);
    expect(h.events).toContain("replay");
  });
});

describe("R7: scan mode is the default; the first run needs no confirm and touches only gated entries", () => {
  it("an install that never chose: the first sync normalises without a confirm, toasts counts only, then activates", async () => {
    const h = harness({ mode: "scan", library: [story({ Ruins: ["CP1", "CP2"] })] });
    await h.gating.sync();
    expect(h.events.filter((event) => event.startsWith("confirm"))).toEqual([]);
    expect(h.active()).toBe(true);
    expect(h.settings.normalized).toEqual({ Ruins: ["CP1", "CP2"] });
    expect(h.settings.normalizedFrom).toEqual({ Ruins: [{ comment: "CP1", wasOn: true }, { comment: "CP2", wasOn: true }] });
    expect(h.toasts).toEqual(["2 story lorebook entries now rest off in 1 lorebook; each chat switches on its own story's entries."]);
    expect(h.toasts.join(" ")).not.toMatch(/CP1|CP2/);
  });

  it("the first run never writes an entry outside a gated set, whatever its state, and keeps what each gated entry was", async () => {
    const h = harness({ mode: "scan", library: [story({ Ruins: ["CP1", "Off by hand"] })] });
    await h.gating.sync();
    expect(h.events.filter((event) => event.startsWith("disable") || event.startsWith("enable"))).toEqual(["disable:Ruins:CP1"]);
    expect(Object.fromEntries(h.disk.get("Ruins")!)).toEqual({ CP1: true, CP2: false, Other: false, "Off by hand": true, "No key": null });
    expect(h.settings.normalizedFrom).toEqual({ Ruins: [{ comment: "CP1", wasOn: true }, { comment: "Off by hand", wasOn: false }] });
  });

  it("a second start writes nothing", async () => {
    const h = harness({ mode: "scan" });
    await h.gating.sync();
    h.events.length = 0;
    h.toasts.length = 0;
    await h.gating.sync();
    expect(h.events.filter((event) => event.startsWith("disable"))).toEqual([]);
    expect(h.toasts).toEqual([]);
  });

  it("a restore offers back exactly what the first run switched off", async () => {
    const removed = { ...story({ Ruins: ["CP1", "Off by hand"] }), id: "gone" };
    const h = harness({ mode: "scan", library: [removed] });
    await h.gating.sync();
    expect(h.gating.restorable(removed)).toEqual([{ lorebook: "Ruins", comments: ["CP1"] }]);
  });
});

describe("lorebook gating: restore on story removal (v2.5 plan 01 E)", () => {
  const removed = story({ Ruins: ["CP1", "CP2"] });

  it("offers only entries that were on before normalisation, and restores them only when asked", async () => {
    const h = harness({ library: [removed] });
    h.disk.get("Ruins")!.set("CP2", true);
    h.library.value = [removed];
    await h.gating.requestScan();
    expect(h.settings.normalizedFrom).toEqual({ Ruins: [{ comment: "CP1", wasOn: true }, { comment: "CP2", wasOn: false }] });
    h.library.value = [];
    expect(h.gating.restorable(removed)).toEqual([{ lorebook: "Ruins", comments: ["CP1"] }]);
    expect(h.events.filter((event) => event.startsWith("enable"))).toEqual([]);
    const outcome = await h.gating.restore(removed);
    expect(outcome.restored).toEqual([{ lorebook: "Ruins", comment: "CP1" }]);
    expect(h.events.filter((event) => event.startsWith("enable"))).toEqual(["enable:Ruins:CP1"]);
    expect(h.disk.get("Ruins")!.get("CP1")).toBe(false);
    expect(h.disk.get("Ruins")!.get("CP2")).toBe(true);
    expect(h.settings.normalized).toEqual({ Ruins: ["CP2"] });
    expect(h.settings.normalizedFrom).toEqual({ Ruins: [{ comment: "CP2", wasOn: false }] });
  });

  it("the story being removed never counts as remaining, even while the library still lists it", async () => {
    const own = { id: "ruins", ...removed };
    const h = harness({ library: [own] });
    await h.gating.requestScan();
    expect(h.gating.restorable(own)).toEqual([{ lorebook: "Ruins", comments: ["CP1", "CP2"] }]);
  });

  it("never restores an entry a remaining story still gates", async () => {
    const h = harness({ library: [removed] });
    await h.gating.requestScan();
    h.library.value = [story({ Ruins: ["CP1"] })];
    expect(h.gating.restorable(removed)).toEqual([{ lorebook: "Ruins", comments: ["CP2"] }]);
  });

  it("a gating stopped during the enable keeps the entry in the ledger", async () => {
    const h = harness({ library: [removed] });
    await h.gating.requestScan();
    h.library.value = [];
    const gate = deferred();
    h.holdWrites(gate.promise);
    const pending = h.gating.restore(removed);
    await new Promise((resolve) => setTimeout(resolve, 0));
    h.gating.dispose();
    gate.release();
    expect((await pending).restored).toEqual([]);
    expect(h.settings.normalized).toEqual({ Ruins: ["CP1", "CP2"] });
  });

  it("a stopped gating restores nothing", async () => {
    const h = harness({ library: [removed] });
    await h.gating.requestScan();
    h.library.value = [];
    h.gating.dispose();
    expect((await h.gating.restore(removed)).restored).toEqual([]);
    expect(h.events.filter((event) => event.startsWith("enable"))).toEqual([]);
  });
});

describe("lorebook gating: verify, missingKey and re-normalise (v2.5 plan 01 B)", () => {
  it("verifies the ledger against the files at start-up and publishes drift without writing", async () => {
    const h = harness({ mode: "scan", ledger: { Ruins: ["CP1"] } });
    await h.gating.sync();
    expect(h.last().drift).toEqual([{ lorebook: "Ruins", comment: "CP1" }]);
    expect(h.events.filter((event) => event.startsWith("disable"))).toEqual([]);
    expect(h.journal).toContainEqual(["story lorebook entry switched on outside the story", "Ruins: CP1"]);
  });

  it("control: a ledger that still rests off publishes no drift", async () => {
    const h = harness({ mode: "scan", ledger: { Ruins: ["CP1"] } });
    h.disk.get("Ruins")!.set("CP1", true);
    await h.gating.sync();
    expect(h.last().drift).toEqual([]);
  });

  it("journals a gated entry an owned scan could not switch off once, and raises it; a no-story scan is not an owned scan", async () => {
    const h = harness({ mode: "scan" });
    await h.gating.sync();
    const row = { lorebook: "Ruins", comment: "CP2", uid: 1, on: false, fileDisabled: null, effectiveDisabled: null };
    h.gating.noteScan("no-story", [row]);
    expect(h.last().missingKey).toEqual([]);
    h.gating.noteScan("story", [row, { ...row, comment: "CP1", on: true }]);
    h.gating.noteScan("story", [row]);
    expect(h.last().missingKey).toEqual([{ lorebook: "Ruins", comment: "CP2" }]);
    expect(h.journal.filter(([summary]) => summary === "story lorebook entry cannot be switched off")).toEqual([["story lorebook entry cannot be switched off", "Ruins: CP2"]]);
  });

  it("re-normalise is the one write, and clears what it fixed", async () => {
    const h = harness({ mode: "scan", ledger: { Ruins: ["CP1"] } });
    await h.gating.sync();
    h.gating.noteScan("story", [{ lorebook: "Ruins", comment: "CP2", uid: 1, on: false, fileDisabled: null, effectiveDisabled: null }]);
    h.disk.get("Ruins")!.set("CP2", null);
    h.library.value = [story({ Ruins: ["CP1", "CP2"] })];
    const outcome = await h.gating.renormalize();
    expect(outcome?.refused).toEqual([]);
    expect(h.events).toContain("disable:Ruins:CP1|CP2");
    expect(h.last().drift).toEqual([]);
    expect(h.last().missingKey).toEqual([]);
  });

  it("stopping the gating mid-normalisation stops before the next write, records nothing and never activates", async () => {
    const h = harness({ library: [story({ Ruins: ["CP1"], Archive: ["Old"] })] });
    h.disk.set("Archive", new Map<string, boolean | null>([["Old", false]]));
    const gate = deferred();
    h.holdWrites(gate.promise);
    const pending = h.gating.requestScan();
    await new Promise((resolve) => setTimeout(resolve, 0));
    h.gating.dispose();
    h.holdWrites(null);
    gate.release();
    await pending;
    expect(h.events.filter((event) => event.startsWith("disable"))).toEqual(["disable:Ruins:CP1"]);
    expect(h.settings.normalized).toEqual({});
    expect(h.active()).toBe(false);
  });

  it("control: an unstopped run normalises both books", async () => {
    const h = harness({ library: [story({ Ruins: ["CP1"], Archive: ["Old"] })] });
    h.disk.set("Archive", new Map<string, boolean | null>([["Old", false]]));
    await h.gating.requestScan();
    expect(h.events.filter((event) => event.startsWith("disable"))).toEqual(["disable:Ruins:CP1", "disable:Archive:Old"]);
    expect(h.active()).toBe(true);
  });

  it("a write that throws late records nothing, never activates, journals why, and the next sync still runs", async () => {
    const h = harness();
    const failing = Promise.reject(new Error("the server went away"));
    failing.catch(() => undefined);
    h.holdWrites(failing);
    await expect(h.gating.requestScan()).resolves.toBe(false);
    expect(h.settings.normalized).toEqual({});
    expect(h.active()).toBe(false);
    expect(h.journal).toContainEqual(["lorebook gating failed", "the server went away"]);
    h.holdWrites(null);
    await h.gating.sync();
    expect(h.active()).toBe(true);
    expect(h.settings.normalized).toEqual({ Ruins: ["CP1"] });
  });

  it("re-normalise does nothing in file mode", async () => {
    const h = harness({ mode: "file", ledger: { Ruins: ["CP1"] } });
    expect(await h.gating.renormalize()).toBeNull();
    expect(h.events.filter((event) => event.startsWith("disable"))).toEqual([]);
  });
});
