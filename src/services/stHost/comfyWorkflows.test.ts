const host = {
  sd: { comfy_workflow: "Mine.json", comfy_url: "http://127.0.0.1:8188" } as Record<string, unknown>,
  saves: 0,
  files: { "Mine.json": "{\"1\":{\"inputs\":{\"text\":\"%prompt%\"}}}", "SO-Portrait.json": "{\"1\":{\"inputs\":{\"text\":\"%prompt%\"}}}" } as Record<string, string>,
  calls: [] as string[],
};

jest.mock("./context", () => ({
  getContext: () => ({ extensionSettings: { sd: host.sd }, getRequestHeaders: () => ({}), saveSettingsDebounced: () => { host.saves += 1; } }),
}));

import { listComfyWorkflows, readComfyWorkflow, reconcileComfyWorkflowSwap, saveNewComfyWorkflow, withComfyWorkflow } from "./comfyWorkflows";

const store = new Map<string, string>();
const json = (data: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => data }) as Response;

beforeAll(() => {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value); }, removeItem: (key: string) => { store.delete(key); },
  } });
  globalThis.fetch = (async (url: string, options: { body: string }) => {
    const route = String(url).replace("/api/sd/comfy/", "");
    host.calls.push(route);
    const body = JSON.parse(options.body) as Record<string, string>;
    if (route === "workflows") return json(Object.keys(host.files));
    if (route === "workflow") return json(host.files[body.file_name] ?? host.files["Mine.json"]);
    if (route === "save-workflow") { host.files[body.file_name] = body.workflow; return json(Object.keys(host.files)); }
    return json(null, false);
  }) as unknown as typeof fetch;
});

beforeEach(() => { host.sd.comfy_workflow = "Mine.json"; host.saves = 0; host.calls = []; store.clear(); });

describe("v2.8 29: a story render switches ST's workflow in memory only and puts the player's back", () => {
  it("switches for the render, restores after it, and never saves settings", async () => {
    let during: unknown = null;
    const outcome = await withComfyWorkflow("SO-Portrait.json", async () => { during = host.sd.comfy_workflow; return "path.png"; });
    expect(during).toBe("SO-Portrait.json");
    expect(outcome).toEqual({ value: "path.png", restored: true, note: null });
    expect(host.sd.comfy_workflow).toBe("Mine.json");
    expect(host.saves).toBe(0);
    expect(store.size).toBe(0);
  });

  it("restores after a failed render too", async () => {
    await expect(withComfyWorkflow("SO-Portrait.json", async () => { throw new Error("ComfyUI down"); })).rejects.toThrow("ComfyUI down");
    expect(host.sd.comfy_workflow).toBe("Mine.json");
  });

  it("compare-and-set: a selection the player changed meanwhile is left alone and said", async () => {
    const outcome = await withComfyWorkflow("SO-Portrait.json", async () => { host.sd.comfy_workflow = "Other.json"; return 1; });
    expect(host.sd.comfy_workflow).toBe("Other.json");
    expect(outcome.restored).toBe(false);
    expect(outcome.note).toMatch(/left as you set it/);
  });

  it("a reload mid-render that persisted the story's workflow restores the player's on start, and only then saves", () => {
    store.set("story-orchestrator:comfy-workflow-swap", JSON.stringify({ previous: "Mine.json", mapped: "SO-Portrait.json", at: 1 }));
    host.sd.comfy_workflow = "SO-Portrait.json";
    expect(reconcileComfyWorkflowSwap().restored).toBe(true);
    expect(host.sd.comfy_workflow).toBe("Mine.json");
    expect(host.saves).toBe(1);
    expect(store.size).toBe(0);
  });

  it("control: a ledger row whose swap never reached the settings changes nothing", () => {
    store.set("story-orchestrator:comfy-workflow-swap", JSON.stringify({ previous: "Mine.json", mapped: "SO-Portrait.json", at: 1 }));
    expect(reconcileComfyWorkflowSwap().restored).toBe(false);
    expect(host.sd.comfy_workflow).toBe("Mine.json");
    expect(host.saves).toBe(0);
  });
});

describe("v2.8 29: existence is the /workflows list, never a read", () => {
  it("a name the list lacks is never read, because /workflow answers it with the default file", async () => {
    expect(await readComfyWorkflow("Missing.json")).toBeNull();
    expect(host.calls).toEqual(["workflows"]);
    expect(await readComfyWorkflow("SO-Portrait.json")).toContain("%prompt%");
  });

  it("saving is create-only: an existing name is refused and never written", async () => {
    const before = host.files["Mine.json"];
    const refused = await saveNewComfyWorkflow("Mine.json", "{}");
    expect(refused.ok).toBe(false);
    expect(host.files["Mine.json"]).toBe(before);
    expect(host.calls).not.toContain("save-workflow");
    const saved = await saveNewComfyWorkflow("SO-New.json", "{}");
    expect(saved).toEqual({ ok: true, name: "SO-New.json" });
    expect(await listComfyWorkflows()).toContain("SO-New.json");
    delete host.files["SO-New.json"];
  });
});
