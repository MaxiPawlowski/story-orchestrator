import { defaultImageSettings, type ImageSettings } from "./settings";

const host = {
  settings: defaultImageSettings(),
  stReady: false,
  media: null as null | { ready: true; comfyUrl: string },
  checkpoints: [] as string[],
  onReady: null as null | (() => void),
  generating: false,
  profiles: [] as Array<{ id: string }>,
  director: async () => "",
  messages: [{ name: "Narrator", mes: "The gate opens.", is_user: false, is_system: false }] as Array<{ name: string; mes: string; is_user: boolean; is_system: boolean }>,
};

const renderStImage = jest.fn(async () => "/user/images/st.png");
const comfyRenderOwned = jest.fn(async () => ({ data: "AAAA", format: "png" }));
const comfyDiscover = jest.fn(async () => ({ nodes: {}, embeddings: [], checkpoints: host.checkpoints, diffusionModels: [], textEncoders: [], vaes: [], loras: [], upscalers: [] }));
const reserveGpu = jest.fn(async () => ({ lease: null, brokered: false }));
const imagePlace = jest.fn(async () => ({ ok: true as const, placed: true as const }));

jest.mock("@services/STAPI", () => ({ isHostGenerating: () => host.generating, listConnectionProfiles: () => host.profiles, getScannableEntries: async () => [] }));
jest.mock("@services/stHost/image", () => ({
  imageChat: () => ({ id: "chat-1", groupId: "g1", folder: "g1", userName: "Player", characters: [],
    messages: host.messages }),
  imageModel: () => host.director(), imageSave: async () => "/user/images/comfy.png", imageDelete: async () => ({ ok: true }),
  imagePlace: (...args: unknown[]) => imagePlace(...(args as [])), imageChatSettings: () => null,
  imageWriteChatSettings: async () => ({ ok: true, chatId: "chat-1" }),
}));
jest.mock("@services/stHost/gpuBroker", () => ({
  reserveGpu: (...args: unknown[]) => reserveGpu(...(args as [])), releaseGpu: async () => ({ ok: true, released: false }), gpuBrokerStatus: async () => null,
}));
jest.mock("@services/stHost/stImage", () => ({
  stImageReadiness: async () => (host.onReady?.(), host.stReady ? { ready: true, reason: null, source: "comfy" } : { ready: false, reason: "Set up SillyTavern’s Image Generation extension first.", source: null }),
  renderStImage: (...args: unknown[]) => renderStImage(...(args as [])),
}));
jest.mock("@services/stHost/media", () => ({
  mediaStatus: async () => host.media,
  comfyDiscover: (...args: unknown[]) => comfyDiscover(...(args as [])),
  comfyRenderOwned: (...args: unknown[]) => comfyRenderOwned(...(args as [])),
}));
jest.mock("@runtime/settingsStore", () => ({
  getGlobalSettings: () => ({ image: host.settings }),
  setGlobalSettings: (patch: { image: Partial<ImageSettings> }) => { host.settings = { ...host.settings, ...patch.image }; return { image: host.settings }; },
}));
jest.mock("@runtime/worldInfoGates", () => ({ worldInfoPlan: () => [] }));
const workflowHost = { listed: ["Mine.json", "SO-Portrait.json"] as string[], text: "{\"6\":{\"inputs\":{\"text\":\"%prompt%\"}}}", swaps: [] as string[] };
jest.mock("@services/stHost/comfyWorkflows", () => ({
  listComfyWorkflows: async () => workflowHost.listed,
  readComfyWorkflow: async (name: string, listed: string[]) => (listed.includes(name) ? workflowHost.text : null),
  withComfyWorkflow: async (name: string, run: () => Promise<unknown>) => { workflowHost.swaps.push(name); return { value: await run(), restored: true, note: null }; },
  reconcileComfyWorkflowSwap: () => ({ restored: false, note: null }),
}));

import { StoryImageDirector } from "./runtime";
import { imageHealth } from "@runtime/imageHealth";
import { imageServiceReady } from "./service";

type Boundary = (result: { fired: boolean; context: { lastMessageId: number }; activeCheckpointId: string }) => void;

const harness = (ownership: unknown = { mint: () => ({}), check: () => ({ ok: true }) }) => {
  const boundaries: Boundary[] = [];
  const replies: Array<(id: number) => void> = [];
  const snapshot = {
    ready: true, requirements: { ready: true }, storyId: "story", storyIdentity: { pinned: true }, boundary: 3,
    activeCheckpointId: "cp2", blackboard: {}, scene: null, lore: { fired: [] },
  };
  const story = { illustrations: { checkpoints: true, scenes: true, workflows: { portrait: "SO-Portrait.json", scene: "SO-Missing.json" } },
    checkpointById: { cp2: { player_name: "The gate" } }, checkpoints: [], roster: [], requirements: {} };
  const manager = {
    getEffectiveSettings: () => ({ image: host.settings }),
    getJudge: () => null,
    getSnapshot: () => snapshot, getStory: () => story, getEngineState: () => ({ visitedPath: [] }), ownsImageChat: () => true,
    getOwnership: () => ownership, touch: () => undefined,
    subscribe: () => () => undefined, onBoundary: (callback: Boundary) => { boundaries.push(callback); return () => undefined; },
    onSceneBreakConfirmed: () => () => undefined, onRollback: () => () => undefined, onEpochChanged: () => () => undefined,
  };
  const director = new StoryImageDirector(manager as never);
  const stop = director.start();
  return { director, stop, fire: () => boundaries.forEach((callback) => callback({ fired: true, context: { lastMessageId: 0 }, activeCheckpointId: "cp2" })), replies };
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

beforeEach(() => {
  host.settings = defaultImageSettings();
  host.stReady = false;
  host.media = null;
  host.checkpoints = [];
  host.onReady = null;
  host.generating = false;
  host.profiles = [];
  host.director = async () => "";
  host.messages = [{ name: "Narrator", mes: "The gate opens.", is_user: false, is_system: false }];
  jest.clearAllMocks();
  workflowHost.swaps = [];
});

describe("an image-prompt model with no usable answer falls back to the template", () => {
  it("draws from the template and says so when the reply is not JSON twice", async () => {
    host.stReady = true;
    host.settings = { ...defaultImageSettings(), directorProfileId: "p1" };
    host.profiles = [{ id: "p1" }];
    host.director = async () => "no json here";
    const { director, fire, stop } = harness();
    fire();
    await settle();
    expect(renderStImage).toHaveBeenCalledTimes(1);
    expect(director.status().lastPlan?.promptSource).toBe("degraded");
    stop();
  });
});

describe("opening pictures: the greeting is never drawn by the reply cadence", () => {
  it("skips a reply with no player line before it, draws one after the player spoke", async () => {
    host.stReady = true;
    host.settings = { ...defaultImageSettings(), automation: { mode: "everyN", everyN: 1 } };
    const { director, stop } = harness();
    await director.onReply(0, "command");
    await settle();
    expect(renderStImage).not.toHaveBeenCalled();
    host.messages = [{ name: "Player", mes: "We go in.", is_user: true, is_system: false }, { name: "Narrator", mes: "The gate opens.", is_user: false, is_system: false }];
    await director.onReply(1, "normal");
    await settle();
    expect(renderStImage).toHaveBeenCalledTimes(1);
    stop();
  });
});

describe("the every-N cadence counts player turns, not member replies", () => {
  const turn = (n: number) => [{ name: "Player", mes: `Turn ${n}.`, is_user: true, is_system: false }, { name: "Narrator", mes: `Reply ${n}.`, is_user: false, is_system: false },
    { name: "Mira", mes: `Second voice ${n}.`, is_user: false, is_system: false }];

  it("considers only the first reply of a turn and fires on every Nth turn", async () => {
    host.stReady = true;
    host.settings = { ...defaultImageSettings(), automation: { mode: "everyN", everyN: 2 } };
    host.messages = turn(1);
    const { director, stop } = harness();
    await director.onReply(1, "normal");
    await settle();
    expect(renderStImage).not.toHaveBeenCalled();
    host.messages = [...turn(1), ...turn(2)];
    await director.onReply(5, "normal");
    await settle();
    expect(renderStImage).not.toHaveBeenCalled();
    await director.onReply(4, "normal");
    await settle();
    expect(renderStImage).toHaveBeenCalledTimes(1);
    stop();
  });
});

describe("plan 32 W4: a clean host never tries to render", () => {
  it("leaves a story cue alone when SillyTavern has no image service", async () => {
    const { director, fire, stop } = harness();
    fire();
    await settle();
    expect(renderStImage).not.toHaveBeenCalled();
    expect(reserveGpu).not.toHaveBeenCalled();
    expect(director.status().lastError).toBeNull();
    await director.refreshHealth();
    expect(imageHealth()).toMatchObject({ service: "absent", backend: "st" });
    stop();
  });

  it("leaves a story cue and an every-N reply alone on the ComfyUI route without the media plugin", async () => {
    host.settings = { ...defaultImageSettings(), backend: "comfy", automation: { mode: "everyN", everyN: 1 } };
    const { director, fire, stop } = harness();
    fire();
    await director.onReply(0, "normal");
    await settle();
    expect(comfyDiscover).not.toHaveBeenCalled();
    expect(comfyRenderOwned).not.toHaveBeenCalled();
    expect(director.status().lastError).toBeNull();
    await director.refreshHealth();
    expect(imageHealth()).toMatchObject({ service: "absent", backend: "comfy", detail: "The optional media plugin is not installed." });
    stop();
  });

  it("control: a ready SillyTavern service draws the cue, and an absent broker lets it through", async () => {
    host.stReady = true;
    const { fire, stop } = harness();
    fire();
    await settle();
    expect(reserveGpu).toHaveBeenCalledTimes(1);
    expect(renderStImage).toHaveBeenCalledTimes(1);
    expect(imagePlace).toHaveBeenCalledTimes(1);
    stop();
  });

  it("a lease granted just as a reply starts is handed back, and the cue draws once the reply is over", async () => {
    host.stReady = true;
    reserveGpu.mockImplementationOnce(async () => { host.generating = true; setTimeout(() => { host.generating = false; }, 50); return { lease: null, brokered: false }; });
    jest.useFakeTimers();
    const { fire, stop } = harness();
    try {
      fire();
      await jest.advanceTimersByTimeAsync(1_000);
    } finally { jest.useRealTimers(); }
    expect(reserveGpu).toHaveBeenCalledTimes(2);
    expect(renderStImage).toHaveBeenCalledTimes(1);
    stop();
  });

  it("Astra P1 risk: a cue whose chat changed while the service was asked draws nothing", async () => {
    host.stReady = true;
    const state = { ok: true };
    host.onReady = () => { state.ok = false; };
    const { director, fire, stop } = harness({ mint: () => ({}), check: () => (state.ok ? { ok: true } : { ok: false, reason: "chat", detail: "switched" }) });
    fire();
    await settle();
    expect(renderStImage).not.toHaveBeenCalled();
    expect(imagePlace).not.toHaveBeenCalled();
    expect(director.status().lastPlan).toBeNull();
    stop();
  });

  it("answers readiness per backend", async () => {
    await expect(imageServiceReady("st", { st: async () => ({ ready: false }), media: async () => ({}) })).resolves.toBe(false);
    await expect(imageServiceReady("comfy", { st: async () => ({ ready: true }), media: async () => null })).resolves.toBe(false);
    await expect(imageServiceReady("comfy", { st: async () => ({ ready: false }), media: async () => ({ ready: true }) })).resolves.toBe(true);
  });
});

describe("plan 32 W2: the ComfyUI route uses only discovered models", () => {
  const comfy = () => { host.settings = { ...defaultImageSettings(), backend: "comfy" }; host.media = { ready: true, comfyUrl: "http://comfy.test:8188" }; };

  it("refuses with no recognised model and sends nothing", async () => {
    comfy();
    host.checkpoints = ["dreamshaper_8.safetensors"];
    const { director, stop } = harness();
    await expect(director.direct({ purpose: "scene", text: "a gate", messageId: null })).rejects.toThrow("no installed model is recognised as SDXL · Illustrious");
    expect(reserveGpu).not.toHaveBeenCalled();
    expect(comfyRenderOwned).not.toHaveBeenCalled();
    await director.refreshHealth();
    expect(imageHealth()?.missingModels).toHaveLength(6);
    stop();
  });

  it("picks the one discovered model of the row's family", async () => {
    comfy();
    host.checkpoints = ["dreamshaper_8.safetensors", "waiIllustriousSDXL_v170.safetensors"];
    const { director, stop } = harness();
    await director.direct({ purpose: "scene", text: "a gate", messageId: null });
    const graph = (comfyRenderOwned.mock.calls[0] as unknown[])[0] as Record<string, { class_type: string; inputs: Record<string, unknown> }>;
    expect(Object.values(graph).find((node) => node.class_type === "CheckpointLoaderSimple")?.inputs.ckpt_name).toBe("waiIllustriousSDXL_v170.safetensors");
    await director.refreshHealth();
    expect(imageHealth()?.missingModels).toEqual([]);
    stop();
  });

  it("asks when several models of the family are installed, and a mapping answers it", async () => {
    comfy();
    host.checkpoints = ["waiIllustriousSDXL_v170.safetensors", "hassakuIllustrious_v2.safetensors", "novaAnimeIllustrious.safetensors"];
    const { director, stop } = harness();
    await expect(director.direct({ purpose: "scene", text: "a gate", messageId: null })).rejects.toThrow("several SDXL · Illustrious models are installed");
    expect(comfyRenderOwned).not.toHaveBeenCalled();
    director.updateSettings({ purposes: { ...host.settings.purposes, scene: { ...host.settings.purposes.scene, checkpoint: "novaAnimeIllustrious.safetensors" } } });
    await director.direct({ purpose: "scene", text: "a gate", messageId: null });
    const graph = (comfyRenderOwned.mock.calls[0] as unknown[])[0] as Record<string, { class_type: string; inputs: Record<string, unknown> }>;
    expect(Object.values(graph).find((node) => node.class_type === "CheckpointLoaderSimple")?.inputs.ckpt_name).toBe("novaAnimeIllustrious.safetensors");
    stop();
  });
});

describe("v2.8 29 B: a story's workflow is used for its renders only, and a missing one falls back", () => {
  it("renders a portrait through the mapped workflow and a scene with the player's own, saying why", async () => {
    host.stReady = true;
    const { director, stop } = harness();
    await director.direct({ purpose: "portrait", text: "Arin", messageId: null });
    expect(workflowHost.swaps).toEqual(["SO-Portrait.json"]);
    expect(director.status().lastPlan?.workflow).toBe("SO-Portrait.json");
    await director.direct({ purpose: "scene", text: "a gate", messageId: null });
    expect(workflowHost.swaps).toEqual(["SO-Portrait.json"]);
    expect(renderStImage).toHaveBeenCalledTimes(2);
    expect(director.status().workflowNote).toMatch(/SO-Missing.json is not installed/);
    await director.refreshHealth();
    expect(imageHealth()?.storyWorkflows).toEqual({ wanted: ["SO-Missing.json", "SO-Portrait.json"], missing: ["SO-Missing.json"], missingNodes: [], comfySource: true });
    stop();
  });
});
