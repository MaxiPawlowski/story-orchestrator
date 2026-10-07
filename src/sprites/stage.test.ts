import { SpriteStage } from "./stage";
import { defaultSpriteSettings, type SpriteSettings } from "./settings";
import type { RuntimeManager } from "@runtime/runtimeManager";
import type { RunOwnership, TokenCheck } from "@runtime/runToken";
import * as host from "@services/stHost/sprites";
import { spriteStageHealth } from "@runtime/spriteStageHealth";

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

interface Row { name: string; is_user?: boolean; mes: string; swipe_id?: number; extra?: Record<string, unknown> }

const chat: Row[] = [];
let chatId = "chat-1";
let vnMode = true;
let members: Array<{ name: string; avatar: string; muted?: boolean; noPack?: boolean }> = [];
const hints: string[] = [];
let builtIn = false;
let narrow = false;
const hidden: boolean[] = [];

const PROFILE = { default: "neutral", labels: { neutral: { what: "calm" }, happy: { what: "glad" }, sad: { what: "sorrow" } }, local_map: { joy: "happy", grief: "sad" } };
const castNow = () => ({
  chatId, groupId: "g1",
  members: members.map((member) => ({ name: member.name, avatar: member.avatar, folder: member.name, profile: member.noPack ? null : { ...PROFILE, folder: member.name }, muted: member.muted === true })),
});

jest.mock("@services/stHost/sprites", () => ({
  spriteCast: () => castNow(),
  spriteMembershipKey: (cast?: ReturnType<typeof castNow>) => {
    const current = cast ?? castNow();
    return JSON.stringify([current.chatId, current.members.map((member) => member.avatar)]);
  },
  spriteDraftedName: (id: number) => members[id]?.name ?? null,
  spriteMessage: (id: number) => {
    const row = chat[id];
    return row ? { id, name: row.name, isUser: row.is_user === true, isSystem: false, text: row.mes, swipeId: row.swipe_id ?? 0, avatar: "", expressions: row.extra?.so_expr } : null;
  },
  spriteStreamingReply: () => {
    const row = chat[chat.length - 1];
    return row && !row.is_user ? { id: chat.length - 1, name: row.name, text: row.mes } : null;
  },
  spriteChatLength: () => chat.length,
  spriteList: jest.fn(async (folder: string) => [{ label: "neutral", path: `/${folder}/neutral.png` }, { label: "happy", path: `/${folder}/happy.png` }, { label: "sad", path: `/${folder}/sad.png` }]),
  spriteClassifyLocal: jest.fn(),
  spriteExpressionModel: jest.fn(),
  spriteWriteExpressions: jest.fn(async () => ({ ok: true, saved: true })),
  spriteVnMode: () => vnMode,
  spriteReducedMotion: () => false,
  spriteBuiltInExpressionsActive: () => builtIn,
  spriteHideBuiltInExpressions: (hide: boolean) => { hidden.push(hide); },
  spriteNarrowViewport: () => narrow,
  spriteWatchViewport: () => () => undefined,
  spriteHint: (text: string) => { hints.push(text); },
}));

const classify = host.spriteClassifyLocal as jest.Mock;
const write = host.spriteWriteExpressions as jest.Mock;
const list = host.spriteList as jest.Mock;
const listFiles = async (folder: string) => [{ label: "neutral", path: `/${folder}/neutral.png` }, { label: "happy", path: `/${folder}/happy.png` }, { label: "sad", path: `/${folder}/sad.png` }];

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
  mint: () => ({ chatId, storyId: "s", storyHash: "h1", sessionEpoch: 0, window: null, windowRevision: 0 }),
  check: (): TokenCheck => (ownershipOk ? { ok: true } : { ok: false, reason: "window", detail: "message 1 was edited" }),
};

let stage = { framing: "thigh", cast: {} as Record<string, unknown> } as Record<string, unknown> | null;
let settings: SpriteSettings = { ...defaultSpriteSettings(), enabled: true, explicit: true };
let judgeAnswers: Record<string, unknown> | null = null;

const manager = {
  getGlobalSettings: () => ({
    sprites: settings, judge: { enabled: judgeAnswers !== null, uses: { expressions: judgeAnswers !== null }, timeoutMs: 1000 }, image: { directorProfileId: "" },
  }),
  getStory: () => ({
    roster: [],
    checkpoints: [{ id: "cp1", effects: stage ? { stage } : {} }],
    checkpointById: { cp1: { id: "cp1", effects: stage ? { stage } : {} } },
  }),
  getSnapshot: () => ({ activeCheckpointId: "cp1", blackboard: {} }),
  subscribe: (listener: () => void) => { storyListeners.push(listener); return () => {}; },
  getJudge: () => (judgeAnswers ? { ask: async () => ({ answers: judgeAnswers }) } : null),
  touch: () => undefined,
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
  builtIn = false;
  narrow = false;
  hidden.length = 0;
  judgeAnswers = null;
  classify.mockReset();
  classify.mockResolvedValue([{ label: "joy", score: 1 }]);
  write.mockReset();
  write.mockResolvedValue({ ok: true, saved: true });
  list.mockReset();
  list.mockImplementation(listFiles);
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
    expect((write.mock.calls[0][2] as { reads: Array<{ who: string }> }).reads.map((read) => read.who)).toEqual(["Ellie", "Ellie"]);
    expect(write.mock.calls[0][3]).toEqual({ text: REPLY, swipeId: 0 });
  });

  it("stores them when the cast reloads mid-classification", async () => {
    held();
    await started();
    emit("GROUP_MEMBER_DRAFTED", 0);
    chat.push({ name: "Ellie", mes: REPLY });
    void emit("CHARACTER_MESSAGE_RENDERED", 0, "normal");
    await flush();
    members = [...members, { name: "Vallie", avatar: "vallie.png" }];
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

const face = (sprites: SpriteStage, name: string) => sprites.view().actors.find((actor) => actor.name === name)?.label;

describe("sprite stage: SillyTavern's own Character Expressions", () => {
  it("both on: the stage still shows, hides ST's expression picture while it shows, and says both are on", async () => {
    builtIn = true;
    settings = { ...settings, stage: "always" };
    const sprites = await started();
    expect(sprites.view().visible).toBe(true);
    expect(hidden[hidden.length - 1]).toBe(true);
    expect(spriteStageHealth("chat-1").builtInExpressions).toBe(true);
  });

  it("restores ST's picture when the stage is not showing, and when the stage stops", async () => {
    builtIn = true;
    settings = { ...settings, stage: "always" };
    const sprites = new SpriteStage(manager);
    const stop = sprites.start();
    await flush();
    settings = { ...settings, enabled: false };
    sprites.notify();
    expect(hidden[hidden.length - 1]).toBe(false);
    settings = { ...settings, enabled: true };
    sprites.notify();
    expect(hidden[hidden.length - 1]).toBe(true);
    stop();
    expect(hidden[hidden.length - 1]).toBe(false);
  });

  it("control: with ST's expressions off nothing is reported", async () => {
    settings = { ...settings, stage: "always" };
    await started();
    expect(spriteStageHealth("chat-1").builtInExpressions).toBe(false);
  });
});

describe("sprite stage: phones", () => {
  it("below 768px it shows as the strip without /vn and never hints", async () => {
    narrow = true;
    vnMode = false;
    const view = (await started()).view();
    expect({ visible: view.visible, placement: view.placement, waitsForVn: view.waitsForVn }).toEqual({ visible: true, placement: "strip", waitsForVn: false });
    expect(hints).toEqual([]);
  });

  it("Visual Novel mode on a phone still uses the strip", async () => {
    narrow = true;
    expect((await started()).view().placement).toBe("strip");
  });
});

describe("sprite stage: stored reads belong to one swipe of one text", () => {
  const storing = () => write.mockImplementation(async (_chat: string, id: number, record: unknown) => {
    chat[id].extra = { ...chat[id].extra, so_expr: record };
    return { ok: true, saved: true };
  });

  it("a swipe whose own reads were refused never replays the previous swipe's reads", async () => {
    storing();
    const sprites = await started();
    chat.push({ name: "Ellie", mes: "Ellie beams. \"Finally!\"", swipe_id: 0 });
    await emit("CHARACTER_MESSAGE_RENDERED", 0, "normal");
    await flush();
    emit("MESSAGE_EDITED", 0);
    expect(face(sprites, "Ellie")).toBe("happy");
    chat[0].mes = "Ellie looks away.";
    chat[0].swipe_id = 1;
    write.mockReset();
    write.mockResolvedValue({ ok: false, reason: "refused" });
    classify.mockResolvedValue([{ label: "calm", score: 1 }]);
    emit("MESSAGE_SWIPED", 0);
    await emit("CHARACTER_MESSAGE_RENDERED", 0, "swipe");
    await flush();
    emit("MESSAGE_EDITED", 0);
    expect(classify.mock.calls.map((call) => call[0])).toContain("Ellie looks away.");
    expect(face(sprites, "Ellie")).toBe("neutral");
  });

  it("text rewritten after the reads were stored (a regex, a thought repair) drops them", async () => {
    storing();
    const sprites = await started();
    chat.push({ name: "Ellie", mes: "Ellie beams. \"Finally!\"" });
    await emit("CHARACTER_MESSAGE_RENDERED", 0, "normal");
    await flush();
    emit("MESSAGE_EDITED", 0);
    expect(face(sprites, "Ellie")).toBe("happy");
    chat[0].mes = "Ellie beams. \"Finally!\" (edited)";
    emit("MESSAGE_EDITED", 0);
    expect(face(sprites, "Ellie")).toBe("neutral");
  });
});

describe("sprite stage: group updates", () => {
  it("a group update while a reply streams keeps the stream and does not re-list the sprites", async () => {
    await started();
    const listed = list.mock.calls.length;
    emit("GROUP_MEMBER_DRAFTED", 0);
    chat.push({ name: "Ellie", mes: "*Ellie laughs.* \"Hi!\"\n\nShe" });
    emit("STREAM_TOKEN_RECEIVED");
    await flush();
    emit("GROUP_UPDATED");
    await flush();
    chat[0].mes = "*Ellie laughs.* \"Hi!\"\n\nShe hands over the map.\n\nThen";
    emit("STREAM_TOKEN_RECEIVED");
    await flush();
    expect(classify.mock.calls.map((call) => call[0])).toEqual(["*Ellie laughs.* \"Hi!\"", "She hands over the map."]);
    expect(list.mock.calls.length).toBe(listed);
  });

  it("lists every set of every member at once, and a member who joins lists only their own folders", async () => {
    const waiting: Array<() => void> = [];
    list.mockImplementation((folder: string) => new Promise((resolve) => { waiting.push(() => resolve(listFiles(folder))); }));
    const sprites = new SpriteStage(manager);
    sprites.start();
    await flush();
    expect(waiting).toHaveLength(4);
    waiting.splice(0).forEach((go) => go());
    await flush();
    expect(sprites.view().actors).toHaveLength(2);
    list.mockClear();
    list.mockImplementation(listFiles);
    members = [...members, { name: "Vallie", avatar: "vallie.png" }];
    emit("GROUP_UPDATED");
    await flush();
    expect(list.mock.calls.map((call) => call[0]).sort()).toEqual(["Vallie", "Vallie/anim-default"]);
    expect(sprites.view().actors.map((actor) => actor.name)).toEqual(["Ellie", "Tobias", "Vallie"]);
  });

  it("a mute change updates who stands without a reload", async () => {
    stage = null;
    const sprites = await started();
    list.mockClear();
    members[1].muted = true;
    emit("GROUP_UPDATED");
    await flush();
    expect(sprites.view().actors.map((actor) => actor.name)).toEqual(["Ellie"]);
    expect(list).not.toHaveBeenCalled();
  });
});

describe("sprite stage: who talks and who is in focus", () => {
  it("the drafted member keeps the mouth while the passage's subject takes the highlight", async () => {
    judgeAnswers = { "who:1": { type: "choice", choice: "Tobias" }, "face:1": { type: "choice", choice: "sad" } };
    const sprites = await started();
    emit("GROUP_MEMBER_DRAFTED", 0);
    expect({ talker: sprites.view().talker, speaking: sprites.view().speaking }).toEqual({ talker: "Ellie", speaking: "Ellie" });
    chat.push({ name: "Ellie", mes: "Tobias stares at the floor.\n\nThen" });
    emit("STREAM_TOKEN_RECEIVED");
    await flush();
    expect({ talker: sprites.view().talker, speaking: sprites.view().speaking }).toEqual({ talker: "Ellie", speaking: "Tobias" });
    expect(face(sprites, "Tobias")).toBe("sad");
  });
});

describe("sprite stage: missing sprites and the expression record", () => {
  it("names a member the story puts on stage with no pack, and a face a beat asks for that is not installed", async () => {
    members = [{ name: "Ellie", avatar: "ellie.png" }, { name: "Tobias", avatar: "tobias.png", noPack: true }];
    stage = { cast: { Ellie: { face: "angry" } } };
    await started();
    expect(spriteStageHealth("chat-1").packIssues).toEqual([
      { name: "Tobias", reason: "no sprite pack on the card (so_sprites)" },
      { name: "Ellie", reason: "\"cp1\" asks for face \"angry\", which is not installed" },
    ]);
    expect(spriteStageHealth("chat-1").inventory.ellie).toEqual({ sets: ["default"], faces: ["happy", "neutral", "sad"] });
  });

  it("control: a story that directs no stage reports nothing", async () => {
    members = [{ name: "Ellie", avatar: "ellie.png" }, { name: "Tobias", avatar: "tobias.png", noPack: true }];
    stage = null;
    await started();
    expect(spriteStageHealth("chat-1").packIssues).toEqual([]);
  });

  it("records which source answered and how long it took; the LLM route asks with thinking off and drops a leading thought", async () => {
    settings = { ...settings, profileId: "p" };
    const model = host.spriteExpressionModel as jest.Mock;
    model.mockResolvedValue({ text: "<think>she is sad</think>1|Ellie|sad\n", thinking: "enable_thinking=false" });
    const sprites = await started();
    emit("GROUP_MEMBER_DRAFTED", 0);
    chat.push({ name: "Ellie", mes: "Ellie sighs.\n\nThen" });
    emit("STREAM_TOKEN_RECEIVED");
    await flush();
    const [call] = sprites.expressionCalls.list();
    expect({ source: call.source, segments: call.segments, thinking: call.thinking, steps: call.steps.map((step) => [step.step, step.ok]) })
      .toEqual({ source: "llm", segments: 1, thinking: "enable_thinking=false", steps: [["llm", true]] });
    expect(face(sprites, "Ellie")).toBe("sad");
    expect(classify).not.toHaveBeenCalled();
  });
});
