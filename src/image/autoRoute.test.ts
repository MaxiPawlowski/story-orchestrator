import { defaultImageSettings, type ImageSettings } from "./settings";
import type { QwenReadiness } from "./autoScene";

const host = {
  settings: defaultImageSettings(),
  generating: false,
  profiles: [] as Array<{ id: string }>,
  director: jest.fn(async (..._args: unknown[]) => ""),
  readiness: (names: string[]): QwenReadiness => ({ ok: false, reason: "no-reference", detail: `No reference for ${names.join(", ")}.` }),
  messages: [{ name: "Player", mes: "Ash, show us the map.", is_user: true, is_system: false }, { name: "Ash", mes: "Ash spreads the map on the table.", is_user: false, is_system: false },
    { name: "Player", mes: "And then?", is_user: true, is_system: false }] as Array<{ name: string; mes: string; is_user: boolean; is_system: boolean }>,
  characters: [{ key: "ash.png", name: "Ash", appearance: "", description: "Card text", enabled: true }],
};

const MESSAGES = host.messages;
const renderStImage = jest.fn(async () => "/user/images/st.png");
const reserveGpu = jest.fn(async () => ({ lease: null, brokered: false }));
const imagePlace = jest.fn(async (..._args: unknown[]) => ({ ok: true as const, placed: true as const }));
const qwenCheck = jest.fn(async () => (names: string[]) => host.readiness(names));
const renderAutomaticQwen = jest.fn(async (_manager: unknown, _plan: unknown, _signal: unknown, _run: unknown, seed: number) => ({ path: "/user/images/qwen.png", seed, width: 736, height: 1440,
  waitedMs: 12, qwen: { checkpoint: "qwen_image_2.1.safetensors", recipe_source: "discovered", plate: false } }));

jest.mock("@services/STAPI", () => ({ isHostGenerating: () => host.generating, listConnectionProfiles: () => host.profiles, getScannableEntries: async () => [] }));
jest.mock("@services/stHost/image", () => ({
  imageChat: () => ({ id: "chat-1", groupId: "g1", folder: "g1", userName: "Player", messages: host.messages,
    characters: host.characters }),
  imageModel: (...args: unknown[]) => host.director(...args), imageSave: async () => "/user/images/comfy.png", imageDelete: async () => ({ ok: true }),
  imagePlace: (...args: unknown[]) => imagePlace(...args), imageChatSettings: () => null, imageWriteChatSettings: async () => ({ ok: true, chatId: "chat-1" }),
}));
jest.mock("@services/stHost/gpuBroker", () => ({ reserveGpu: (...args: unknown[]) => reserveGpu(...(args as [])), releaseGpu: async () => ({ ok: true, released: false }), gpuBrokerStatus: async () => null }));
jest.mock("@services/stHost/stImage", () => ({ stImageReadiness: async () => ({ ready: true, reason: null, source: "comfy" }), renderStImage: (...args: unknown[]) => renderStImage(...(args as [])) }));
jest.mock("@services/stHost/media", () => ({ mediaStatus: async () => null, comfyDiscover: async () => ({}), comfyRenderOwned: async () => ({}) }));
jest.mock("@runtime/settingsStore", () => ({
  getGlobalSettings: () => ({ image: host.settings }),
  setGlobalSettings: (patch: { image: Partial<ImageSettings> }) => { host.settings = { ...host.settings, ...patch.image }; return { image: host.settings }; },
}));
jest.mock("@runtime/worldInfoGates", () => ({ worldInfoPlan: () => [] }));
jest.mock("@services/stHost/comfyWorkflows", () => ({ listComfyWorkflows: async () => [], readComfyWorkflow: async () => null,
  withComfyWorkflow: async (_name: string, run: () => Promise<unknown>) => ({ value: await run(), restored: true, note: null }), reconcileComfyWorkflowSwap: () => ({ restored: false, note: null }) }));
jest.mock("./autoSceneHost", () => ({ qwenCheck: (...args: unknown[]) => qwenCheck(...(args as [])), renderAutomaticQwen: (...args: unknown[]) => renderAutomaticQwen(...(args as [never, never, never, never, number])) }));

import { StoryImageDirector } from "./runtime";

const ready = (names: string[]): QwenReadiness => ({ ok: true, ready: { names, members: names.map((name) => ({ character: name, fields: { outfit: "green tunic" } })), identities: [],
  recipe: { models: { diffusion: "q", encoder: "e", vae: "v" }, steps: 8, resolution: 1024, source: "discovered" }, plate: null } });
const directorJson = (extra: Record<string, unknown> = {}) => JSON.stringify({ caption: "Ash and the map", checkpoint: "x", reason: "map moment", visible: ["Ash"], aspect: "portrait",
  shot: "cowboy", prompt: "1girl, solo, map on table, pointing", negative: "", ...extra });

const harness = () => {
  const snapshot = { ready: true, requirements: { ready: true }, storyId: "story", boundary: 3, activeCheckpointId: "cp2", blackboard: {}, scene: null, lore: { fired: [] } };
  const story = { illustrations: { checkpoints: true }, checkpointById: { cp2: { player_name: "The map room" } }, checkpoints: [], requirements: {},
    roster: [{ id: "ash", name: "Ash", role: "Courier" }], cardFieldByQuality: {} };
  const manager = {
    getEffectiveSettings: () => ({ image: host.settings }), getJudge: () => null, getSnapshot: () => snapshot, getStory: () => story,
    getEngineState: () => ({ visitedPath: [] }), ownsImageChat: () => true, getOwnership: () => ({ mint: () => ({}), check: () => ({ ok: true }) }), touch: () => undefined,
    subscribe: () => () => undefined, onBoundary: () => () => undefined, onSceneBreakConfirmed: () => () => undefined, onRollback: () => () => undefined, onEpochChanged: () => () => undefined,
  };
  return new StoryImageDirector(manager as never);
};
const placed = () => (imagePlace.mock.calls[0]?.[3] as { image_director: Record<string, unknown> } | undefined)?.image_director;
const systemPrompt = () => ((host.director.mock.calls[0]?.[1] as Array<{ content: string }> | undefined)?.[0]?.content ?? "");

beforeEach(() => {
  host.settings = { ...defaultImageSettings(), directorProfileId: "p1" };
  host.profiles = [{ id: "p1" }];
  host.generating = false;
  host.messages = MESSAGES;
  host.characters = [{ key: "ash.png", name: "Ash", appearance: "", description: "Card text", enabled: true }];
  host.director = jest.fn(async () => directorJson({ instruction: "Ash leans over the table and traces the route with one finger." }));
  host.readiness = (names) => ({ ok: false, reason: "no-reference", detail: `No reference for ${names.join(", ")}.` });
  jest.clearAllMocks();
});

describe("automatic scene pictures choose their route", () => {
  it("auto draws through references when every visible character is prepared, asking the director for plain words", async () => {
    host.readiness = ready;
    await harness().direct({ purpose: "scene", text: "", messageId: 1, automatic: true });
    expect(systemPrompt()).toContain("Also write instruction");
    expect(renderAutomaticQwen).toHaveBeenCalledTimes(1);
    expect(renderStImage).not.toHaveBeenCalled();
    expect(placed()).toMatchObject({ route: { name: "qwen", reason: "references-ready", setting: "auto" }, checkpoint: "qwen_image_2.1.safetensors", idle_wait_ms: 12,
      positive: expect.stringContaining("Ash leans over the table and traces the route with one finger."), size: { width: 736, height: 1440 } });
    expect(String(placed()?.positive)).toContain("current look: outfit: green tunic");
  });

  it("auto falls back to SDXL with the reason and the idle wait recorded, and never asks for the instruction", async () => {
    await harness().direct({ purpose: "scene", text: "", messageId: 1, automatic: true });
    expect(systemPrompt()).not.toContain("Also write instruction");
    expect(renderAutomaticQwen).not.toHaveBeenCalled();
    expect(renderStImage).toHaveBeenCalledTimes(1);
    expect(placed()).toMatchObject({ route: { name: "sdxl", reason: "no-reference", setting: "auto" }, idle_wait_ms: expect.any(Number) });
  });

  it("someone the director sees who has no reference sends the picture to SDXL", async () => {
    host.readiness = (names) => (names.includes("the visitor") ? { ok: false, reason: "visible-not-in-cast", detail: "x" } : ready(names));
    host.director = jest.fn(async () => directorJson({ visible: ["Ash", "the visitor"], instruction: "Ash and the visitor lift a crate." }));
    await harness().direct({ purpose: "scene", text: "", messageId: 1, automatic: true });
    expect(systemPrompt()).toContain("Also write instruction");
    expect(placed()).toMatchObject({ route: { name: "sdxl", reason: "visible-not-in-cast" } });
  });

  it("the SDXL setting skips the check, and a manual picture is not routed", async () => {
    host.readiness = ready;
    host.settings = { ...host.settings, automaticRoute: "sdxl" };
    const director = harness();
    await director.direct({ purpose: "scene", text: "", messageId: 1, automatic: true });
    expect(placed()).toMatchObject({ route: { name: "sdxl", reason: "setting-sdxl", setting: "sdxl" } });
    host.settings = { ...host.settings, automaticRoute: "auto" };
    await director.direct({ purpose: "scene", text: "A map", messageId: 1 });
    expect((imagePlace.mock.calls[1][3] as { image_director: Record<string, unknown> }).image_director.route).toEqual({ name: "sdxl", reason: "not-automatic" });
    expect(qwenCheck).not.toHaveBeenCalled();
  });

  it("references-only draws nothing when a character is not prepared, before asking the director", async () => {
    host.settings = { ...host.settings, automaticRoute: "qwen" };
    await expect(harness().direct({ purpose: "scene", text: "", messageId: 1, automatic: true })).rejects.toThrow(/references only/);
    expect(host.director).not.toHaveBeenCalled();
    expect(renderStImage).not.toHaveBeenCalled();
    expect(imagePlace).not.toHaveBeenCalled();
  });

  it("a request can force an arm for the route pilot", async () => {
    host.readiness = ready;
    host.settings = { ...host.settings, automaticRoute: "sdxl" };
    await harness().direct({ purpose: "scene", text: "A map", messageId: 1, automatic: true }, { route: "qwen", seed: 5 });
    expect(renderAutomaticQwen).toHaveBeenCalledTimes(1);
    expect(renderAutomaticQwen.mock.calls[0][4]).toBe(5);
  });

  it("a forced reference arm checks the frozen answer's visible pair, not every character in the scene", async () => {
    host.characters = ["Ash", "Bram", "Cleo"].map((name) => ({ key: `${name.toLowerCase()}.png`, name, appearance: "", description: "Card text", enabled: true }));
    host.messages = [{ name: "Player", mes: "Bram, ring the bell.", is_user: true, is_system: false }, { name: "Ash", mes: "Ash watches.", is_user: false, is_system: false },
      { name: "Bram", mes: "Bram hauls the rope while Cleo covers her ears.", is_user: false, is_system: false }];
    host.readiness = (names) => (names.length > 2 ? { ok: false, reason: "too-many-visible", detail: "at most two" } : ready(names));
    const answer = directorJson({ visible: ["Bram", "Cleo"], instruction: "Bram hauls the bell rope while Cleo covers her ears." });
    await harness().direct({ purpose: "scene", text: "", messageId: 2, automatic: true }, { route: "qwen", seed: 101, director: answer });
    expect(host.director).not.toHaveBeenCalled();
    expect(renderAutomaticQwen).toHaveBeenCalledTimes(1);
    expect(placed()).toMatchObject({ route: { name: "qwen", reason: "references-ready" }, director: "frozen" });
  });

  it("a frozen director answer is reused for both arms without calling the director, and the picture says so", async () => {
    host.readiness = ready;
    const director = harness();
    const plan = await director.plan({ purpose: "scene", text: "", messageId: 1, automatic: true }, { route: "auto" });
    expect(host.director).toHaveBeenCalledTimes(1);
    const answer = JSON.stringify(plan.reply);
    await director.direct({ purpose: "scene", text: "", messageId: 1, automatic: true }, { route: "qwen", seed: 101, director: answer });
    await director.direct({ purpose: "scene", text: "", messageId: 1, automatic: true }, { route: "sdxl", seed: 101, director: answer });
    expect(host.director).toHaveBeenCalledTimes(1);
    const records = imagePlace.mock.calls.map((call) => (call[3] as { image_director: Record<string, unknown> }).image_director);
    expect(records[0]).toMatchObject({ route: { name: "qwen" }, director: "frozen", prompt_source: "directed",
      positive: expect.stringContaining("Ash leans over the table and traces the route with one finger.") });
    expect(records[1]).toMatchObject({ route: { name: "sdxl", reason: "setting-sdxl" }, director: "frozen", prompt_source: "directed",
      positive: expect.stringContaining("map on table") });
  });
});

describe("automatic pictures land on the reply that cued them", () => {
  it("places on the cueing reply even when newer messages exist, and refuses a vanished target instead of using the last message", async () => {
    const director = harness();
    await director.direct({ purpose: "scene", text: "", messageId: 1, automatic: true });
    expect(imagePlace.mock.calls[0][1]).toBe(1);
    await expect(director.direct({ purpose: "scene", text: "", messageId: 9, automatic: true })).rejects.toThrow("The message this picture illustrates is gone.");
    expect(imagePlace).toHaveBeenCalledTimes(1);
  });
});
