// The export reads the chat's persisted state, and that module reaches the host at import time.
jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chatId: "chat-a", chatMetadata: {}, saveMetadata: async () => {} }),
}));

import { EXPORT_STATE_FALLBACK, EXPORT_STATE_OK, exportState, type StateExportDeps } from "./stateExport";

// v2.3 plan 05. "Export state" is the author's copy of a chat's story state, taken before retention
// can drop it — so the one thing it must never do is fail quietly.

const deps = (options: { clipboards?: Array<"ok" | "throw"> } = {}) => {
  const writes: string[] = [];
  const toasts: string[] = [];
  const logged: string[] = [];
  const queue = [...(options.clipboards ?? ["ok"])];
  const host: StateExportDeps = {
    writeClipboard: async (text) => {
      if (queue.shift() === "throw") throw new Error("clipboard unavailable");
      writes.push(text);
    },
    toast: { success: (message) => { toasts.push(`success:${message}`); }, info: (message) => { toasts.push(`info:${message}`); } },
    log: (text) => { logged.push(text); },
  };
  return { host, writes, toasts, logged };
};

describe("exporting a chat's story state (v2.3 plan 05)", () => {
  it("puts the state on the clipboard and says so", async () => {
    const h = deps();
    expect(await exportState(h.host, "{}")).toBe(true);
    expect(h.writes).toEqual(["{}"]);
    expect(h.toasts).toEqual([`success:${EXPORT_STATE_OK}`]);
    expect(h.logged).toEqual([]);
  });

  // The failure path is the point: a clipboard the page cannot reach still has to leave the author
  // with the text somewhere they can get it.
  it("falls back to the console when the clipboard refuses, and says that instead", async () => {
    const h = deps({ clipboards: ["throw"] });
    expect(await exportState(h.host, "{\"chat\":1}")).toBe(false);
    expect(h.writes).toEqual([]);
    expect(h.toasts).toEqual([`info:${EXPORT_STATE_FALLBACK}`]);
    expect(h.logged).toEqual(["{\"chat\":1}"]);
  });

  it("takes the state it is handed, and asks the host for it once", async () => {
    const h = deps();
    await exportState(h.host, "verbatim");
    expect(h.writes).toEqual(["verbatim"]);
  });
});
