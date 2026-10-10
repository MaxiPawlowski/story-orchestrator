const files: Record<string, string> = {};
const saved: string[] = [];

jest.mock("@services/stHost/comfyWorkflows", () => ({
  listComfyWorkflows: async () => Object.keys(files),
  readComfyWorkflow: async (name: string) => files[name] ?? null,
  saveNewComfyWorkflow: async (name: string, text: string) => {
    if (files[name]) return { ok: false, reason: "exists" };
    files[name] = text; saved.push(name); return { ok: true, name };
  },
}));

import { webcrypto } from "node:crypto";
import { bundleMapped, graphDigest, installBundled } from "./workflowBundle";

beforeAll(() => { if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto }); });
beforeEach(() => { for (const key of Object.keys(files)) delete files[key]; saved.length = 0; });

const graph = { 1: { class_type: "CLIPTextEncode", inputs: { text: "%prompt%" } } };

describe("v2.8 29 C: installing a story's bundled workflow", () => {
  it("installs a verified bundle under its own name, and a second time it is already present", async () => {
    const entry = { graph, sha256: await graphDigest(graph) };
    expect(await installBundled("SO-P.json", entry, ["CLIPTextEncode"])).toEqual({ ok: true, name: "SO-P.json", present: false });
    expect(await installBundled("SO-P.json", entry, ["CLIPTextEncode"])).toEqual({ ok: true, name: "SO-P.json", present: true });
    expect(saved).toEqual(["SO-P.json"]);
  });

  it("never overwrites a workflow of the same name with other bytes", async () => {
    files["SO-P.json"] = "{\"mine\":true}";
    const outcome = await installBundled("SO-P.json", { graph, sha256: await graphDigest(graph) }, null);
    expect(outcome).toEqual({ ok: true, name: "SO-P-2.json", present: false, renamedFrom: "SO-P.json" });
    expect(files["SO-P.json"]).toBe("{\"mine\":true}");
  });

  it("refuses a bundle whose hash does not match, or that holds a code or file node", async () => {
    expect(await installBundled("SO-P.json", { graph, sha256: "0".repeat(64) }, null)).toMatchObject({ ok: false, reason: expect.stringMatching(/hash/) });
    const evil = { ...graph, 2: { class_type: "ExecutePythonCode", inputs: {} } };
    expect(await installBundled("SO-E.json", { graph: evil, sha256: await graphDigest(evil) }, null)).toMatchObject({ ok: false, reason: expect.stringMatching(/never installed/) });
    expect(saved).toEqual([]);
  });

  it("bundling copies the mapped workflows with their hash and names the unreadable ones", async () => {
    files["Scene.json"] = JSON.stringify(graph);
    const { bundle, skipped } = await bundleMapped(["Scene.json", "Gone.json"]);
    expect(bundle["Scene.json"]).toEqual({ graph, sha256: await graphDigest(graph) });
    expect(skipped).toEqual(["Gone.json"]);
  });
});
