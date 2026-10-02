import { SpriteStage } from "./stage";
import { defaultSpriteSettings, type SpriteSettings } from "./settings";
import type { RuntimeManager } from "@runtime/runtimeManager";
import type { RunOwnership, TokenCheck } from "@runtime/runToken";
import * as host from "@services/stHost/sprites";

type Handler = (...args: unknown[]) => unknown;
const handlers = new Map<string, Handler>();

jest.mock("@services/STAPI", () => ({
  subscribeToHostEvents: (list: Array<{ eventName: string; handler: Handler }>) => {
    for (const entry of list) handlers.set(entry.eventName, entry.handler);
    return () => handlers.clear();
  },
  capabilityState: async () => "present",
}));

jest.mock("@services/stHost/image", () => ({ imageModel: jest.fn() }));
jest.mock("@runtime/settingsStore", () => ({ setGlobalSettings: jest.fn() }));

interface Row { name: string; is_user?: boolean; mes: string; extra?: Record<string, unknown> }

const chat: Row[] = [];
let chatId = "chat-1";
let vnMode = true;
let members: Array<{ name: string; avatar: string; muted?: boolean }> = [];
const hints: string[] = [];

const PROFILE = { default: "neutral", labels: { neutral: { what: "calm" }, happy: { what: "glad" }, sad: { what: "sorrow" } } };

jest.mock("@services/stHost/sprites", () => ({
  spriteCast: () => ({
    chatId, groupId: "g1",
    members: members.map((member) => ({ name: member.name, avatar: member.avatar, profile: { ...PROFILE, folder: member.name }, muted: member.muted === true })),
  }),
  spriteDraftedName: (id: number) => members[id]?.name ?? null,
  spriteMessage: (id: number) => {
    const row = chat[id];
    return row ? { id, name: row.name, isUser: row.is_user === true, isSystem: false, text: row.mes, avatar: "", expressions: row.extra?.so_expr } : null;
  },
  spriteStreamingReply: () => {
    const row = chat[chat.length - 1];
    return row && !row.is_user ? { id: chat.length - 1, name: row.name, text: row.mes } : null;
  },
  spriteChatLength: () => chat.length,
  spriteList: async (folder: string) => [{ label: "neutral", path: `/${folder}/neutral.png` }, { label: "happy", path: `/${folder}/happy.png` }, { label: "sad", path: `/${folder}/sad.png` }],
  spriteClassifyLocal: jest.fn(),
  spriteWriteExpressions: jest.fn(async () => ({ ok: true, saved: true })),
  spriteVnMode: () => vnMode,
  spriteReducedMotion: () => false,
  spriteBuiltInExpressionsActive: () => false,
  spriteHint: (text: string) => { hints.push(text); },
}));

const classify = host.spriteClassifyLocal as jest.Mock;
const write = host.spriteWriteExpressions as jest.Mock;

let pending: Array<() => void> = [];
const held = () => {
  classify.mockImplementation(() => new Promise((resolve) => { pending.push(() => resolve([{ label: "joy", score: 1 }])); }));
};
const release = async () => {
  for (let round = 0; round < 6; round += 1) {
    const now = pending;
    pending = [];
    for (const go of now) go();
    await flush();
  }
};
const flush = async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); };

const storyListeners: Array<() => void> = [];
let ownershipOk = true;
const ownership: RunOwnership = {
  mint: () => ({ chatId, storyId: "s", playedVersion: 1, sessionEpoch: 0, window: null, windowRevision: 0 }),
  check: (): TokenCheck => (ownershipOk ? { ok: true } : { ok: false, reason: "window", detail: "message 1 was edited" }),
};

let stage = { framing: "thigh", cast: {} as Record<string, unknown> } as Record<string, unknown> | null;
let settings: SpriteSettings = { ...defaultSpriteSettings(), enabled: true, explicit: true };

const manager = {
  getGlobalSettings: () => ({ sprites: settings, judge: { enabled: false, uses: {}, timeoutMs: 1000 }, image: { directorProfileId: "" } }),
  getStory: () => ({
    roster: [],
    checkpoints: [{ id: "cp1", effects: stage ? { stage } : {} }],
    checkpointById: { cp1: { id: "cp1", effects: stage ? { stage } : {} } },
  }),
  getSnapshot: () => ({ activeCheckpointId: "cp1", blackboard: {} }),
  subscribe: (listener: () => void) => { storyListeners.push(listener); return () => {}; },
  getJudge: () => null,
  getOwnership: () => ownership,
} as unknown as RuntimeManager;

(globalThis as unknown as { document: unknown }).document = { body: {}, addEventListener: () => {}, removeEventListener: () => {} };

const emit = (event: string, ...args: unknown[]) => handlers.get(event)?.(...args);

async function started(): Promise<SpriteStage> {
  const sprites = new SpriteStage(manager);
  sprites.start();
  await flush();
  return sprites;
}

beforeEach(() => {
  handlers.clear();
  chat.length = 0;
  chatId = "chat-1";
  vnMode = true;
  storyListeners.length = 0;
  members = [{ name: "Ellie", avatar: "ellie.png" }, { name: "Tobias", avatar: "tobias.png" }];
  hints.length = 0;
  pending = [];
  ownershipOk = true;
  stage = { framing: "thigh" };
  settings = { ...defaultSpriteSettings(), enabled: true, explicit: true };
  classify.mockReset();
  classify.mockResolvedValue([{ label: "joy", score: 1 }]);
  write.mockClear();
});

const REPLY = "*Ellie laughs and waves.* \"You made it!\"\n\nShe hands over the map. \"North road, then.\"";

describe("sprite stage: what it classifies", () => {
  it("never classifies the model's thinking while the visible reply is empty", async () => {
    await started();
    emit("GROUP_MEMBER_DRAFTED", 0);
    chat.push({ name: "Ellie", mes: "" });
    emit("STREAM_TOKEN_RECEIVED", "Planning notes. Ellie should look happy here.\n\nThen she turns serious. ");
    await flush();
    expect(classify).not.toHaveBeenCalled();
  });

  it("strips an unterminated inline thinking block and classifies nothing", async () => {
    await started();
    emit("GROUP_MEMBER_DRAFTED", 0);
    chat.push({ name: "Ellie", mes: "<think>She should smile. Then frown.\n\nMore planning. " });
    emit("STREAM_TOKEN_RECEIVED", chat[0].mes);
    await flush();
    expect(classify).not.toHaveBeenCalled();
  });

  it("classifies only the visible reply text once it streams", async () => {
    await started();
    emit("GROUP_MEMBER_DRAFTED", 0);
    chat.push({ name: "Ellie", mes: "*Ellie laughs and waves.* \"You made it!\"\n\nShe" });
    emit("STREAM_TOKEN_RECEIVED", "Planning notes that never reach the page.\n\n*Ellie laughs and waves.*");
    await flush();
    expect(classify.mock.calls.map((call) => call[0])).toEqual(["*Ellie laughs and waves.* \"You made it!\""]);
  });
});

describe("sprite stage: the per-message record", () => {
  it("stores the reads for the message they belong to when the next member is drafted before classification ends", async () => {
    held();
    await started();
    emit("GROUP_MEMBER_DRAFTED", 0);
    chat.push({ name: "Ellie", mes: REPLY });
    void emit("CHARACTER_MESSAGE_RENDERED", 0, "normal");
    await flush();
    emit("GROUP_MEMBER_DRAFTED", 1);
    await release();
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0].slice(0, 2)).toEqual(["chat-1", 0]);
    expect((write.mock.calls[0][2] as Array<{ who: string }>).map((read) => read.who)).toEqual(["Ellie", "Ellie"]);
    expect(write.mock.calls[0][3]).toBe(REPLY);
  });

  it("stores them when the cast reloads mid-classification", async () => {
    held();
    await started();
    emit("GROUP_MEMBER_DRAFTED", 0);
    chat.push({ name: "Ellie", mes: REPLY });
    void emit("CHARACTER_MESSAGE_RENDERED", 0, "normal");
    await flush();
    emit("GROUP_UPDATED");
    await release();
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("does not store them when the run lapsed (the message was edited, or the chat changed)", async () => {
    held();
    await started();
    emit("GROUP_MEMBER_DRAFTED", 0);
    chat.push({ name: "Ellie", mes: REPLY });
    void emit("CHARACTER_MESSAGE_RENDERED", 0, "normal");
    await flush();
    ownershipOk = false;
    await release();
    expect(write).not.toHaveBeenCalled();
  });

  it("does not store an empty visible reply and never asks the classifier for it", async () => {
    await started();
    emit("GROUP_MEMBER_DRAFTED", 0);
    chat.push({ name: "Ellie", mes: "<think>only thinking" });
    await emit("CHARACTER_MESSAGE_RENDERED", 0, "normal");
    await flush();
    expect(classify).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

});

describe("sprite stage: who stands on stage", () => {
  const names = (sprites: SpriteStage) => sprites.view().actors.map((actor) => actor.name);

  beforeEach(() => {
    members = [{ name: "Ellie", avatar: "ellie.png" }, { name: "Tobias", avatar: "tobias.png" }, { name: "Vallie", avatar: "vallie.png" }, { name: "Domas", avatar: "domas.png" }];
  });

  it("with no cast direction everyone enabled with a pack stands, as before", async () => {
    stage = { framing: "thigh" };
    expect(names(await started())).toEqual(["Ellie", "Tobias", "Vallie", "Domas"]);
  });

  it("a checkpoint that names its cast shows only those members, and whoever speaks now", async () => {
    stage = { framing: "thigh", spotlight: "Tobias", cast: { Tobias: { face: "neutral" }, Ellie: { face: "happy" }, Domas: { hidden: true } } };
    const sprites = await started();
    expect(names(sprites)).toEqual(["Ellie", "Tobias"]);
    emit("GROUP_MEMBER_DRAFTED", 2);
    expect(names(sprites)).toEqual(["Ellie", "Tobias", "Vallie"]);
    emit("GROUP_MEMBER_DRAFTED", 3);
    expect(names(sprites)).toEqual(["Ellie", "Tobias"]);
  });

  it("a member the story muted stands only when the checkpoint's stage names it", async () => {
    members[0].muted = true;
    stage = { cast: { Ellie: { face: "happy" }, Tobias: { face: "neutral" } } };
    expect(names(await started())).toEqual(["Ellie", "Tobias"]);
    stage = { cast: { Tobias: { face: "neutral" } } };
    expect(names(await started())).toEqual(["Tobias"]);
    stage = null;
    expect(names(await started())).toEqual(["Tobias", "Vallie", "Domas"]);
  });

  it("a muted member never stands just by speaking", async () => {
    members[2].muted = true;
    stage = { cast: { Tobias: { face: "neutral" } } };
    const sprites = await started();
    emit("GROUP_MEMBER_DRAFTED", 2);
    expect(names(sprites)).toEqual(["Tobias"]);
  });

  it("a member unmuted at a boundary walks on", async () => {
    members[0].muted = true;
    stage = null;
    const sprites = await started();
    expect(names(sprites)).toEqual(["Tobias", "Vallie", "Domas"]);
    members[0].muted = false;
    for (const listener of storyListeners) listener();
    expect(names(sprites)).toEqual(["Ellie", "Tobias", "Vallie", "Domas"]);
  });
});

describe("sprite stage: where it shows", () => {
  it("'Always' with Visual Novel mode off places the stage in the chat column strip", async () => {
    vnMode = false;
    settings = { ...settings, stage: "always" };
    const view = (await started()).view();
    expect({ visible: view.visible, placement: view.placement, waitsForVn: view.waitsForVn }).toEqual({ visible: true, placement: "strip", waitsForVn: false });
  });

  it("Visual Novel mode places it behind the chat", async () => {
    settings = { ...settings, stage: "always" };
    expect((await started()).view().placement).toBe("vn");
  });

  it("'With Visual Novel mode' and VN mode off: hidden, says it waits for /vn, and hints once per chat", async () => {
    vnMode = false;
    const sprites = await started();
    expect({ visible: sprites.view().visible, waitsForVn: sprites.view().waitsForVn }).toEqual({ visible: false, waitsForVn: true });
    sprites.notify();
    sprites.notify();
    expect(hints).toHaveLength(1);
    expect(hints[0]).toContain("/vn");
  });

  it("a stage switched off never waits for /vn and never hints", async () => {
    vnMode = false;
    settings = { ...defaultSpriteSettings(), enabled: false, explicit: true };
    const sprites = await started();
    expect(sprites.view().waitsForVn).toBe(false);
    expect(hints).toEqual([]);
  });
});
