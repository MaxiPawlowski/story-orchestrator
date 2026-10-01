import { TurnBridge } from "./turnBridge";
import type { RuntimeManager } from "./runtimeManager";
import type { RunOwnership } from "./runToken";
import { testOwnership } from "../../test/findings/testOwnership";

const handlers = new Map<string, (...args: unknown[]) => unknown>();
type Row = { send_date: string; name: string; is_user: boolean; is_system?: boolean; mes: string; swipes?: string[]; swipe_id?: number };
const host = { chat: [] as Row[], chatId: "swipe-chat" };

jest.mock("./storyLibrary", () => ({ listStoryRecords: () => [] }));
jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  getContext: () => ({ chat: host.chat, chatId: host.chatId, chatMetadata: {}, saveMetadata: () => undefined }),
  isHostGenerating: () => false,
  subscribeToHostEvents: (entries: Array<{ eventName: string; handler: (...args: unknown[]) => unknown }>) => {
    for (const entry of entries) handlers.set(entry.eventName, entry.handler);
    return () => handlers.clear();
  },
}));

const settle = async () => {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
};

const emit = async (eventName: string, ...args: unknown[]) => {
  await handlers.get(eventName)?.(...args);
  await settle();
};

function harness(onRollback: () => void = () => undefined) {
  const order: string[] = [];
  const world = { live: true };
  const manager = {
    commitBoundary: jest.fn(async (at?: number) => { order.push(`commit ${at}`); }),
    fireAfterSpeak: jest.fn(async () => { order.push("afterSpeak"); }),
    rollbackFromMessage: jest.fn(async (id: number) => { order.push(`rollback ${id}`); onRollback(); }),
    rollbackOnEnter: jest.fn(async () => false),
    loadSelectedFromChat: jest.fn(async () => undefined),
    reapplyPromptBlocks: jest.fn(),
    reapplyCopilotNudge: jest.fn(),
    getOwnership: (): RunOwnership => {
      const base = testOwnership();
      return { ...base, check: (token) => (world.live ? base.check(token) : { ok: false, reason: "chat", detail: "the chat changed during the rollback" }) };
    },
    notify: jest.fn(),
  };
  new TurnBridge(manager as unknown as RuntimeManager).start();
  return { manager, order, world };
}

const reply = (versions: string[], current: number): Row => ({ send_date: "t2", name: "Belle", is_user: false, mes: versions[current] ?? "", swipes: versions, swipe_id: current });

beforeEach(() => {
  handlers.clear();
  host.chatId = "swipe-chat";
  host.chat = [
    { send_date: "t0", name: "Narrator", is_user: false, mes: "The guild hall is loud." },
    { send_date: "t1", name: "Max", is_user: true, mes: "We take the Wendhope job." },
    reply(["You ride north.", "You stay in the hall."], 1),
  ];
});

describe("swipe to a version that already exists", () => {
  it("steps back and then commits the version on screen as the boundary, without NPC afterSpeak replies", async () => {
    const { manager, order } = harness();
    await emit("CHAT_CHANGED");
    host.chat[2] = reply(["You ride north.", "You stay in the hall."], 0);
    await emit("MESSAGE_SWIPED", 2);
    expect(order).toEqual(["rollback 2", "commit 2"]);
    expect(manager.fireAfterSpeak).not.toHaveBeenCalled();
  });

  it("a swipe that generates a new version only steps back: the rendered reply commits it", async () => {
    const { order } = harness();
    await emit("CHAT_CHANGED");
    host.chat[2] = { ...reply(["You ride north.", "You stay in the hall."], 1), swipe_id: 2, mes: "" };
    await emit("MESSAGE_SWIPED", 2);
    expect(order).toEqual(["rollback 2"]);
    host.chat[2] = reply(["You ride north.", "You stay in the hall.", "You buy rope."], 2);
    await emit("CHARACTER_MESSAGE_RENDERED", 2, "swipe");
    expect(order).toEqual(["rollback 2", "afterSpeak", "commit 2"]);
  });

  it("a greeting swipe before any player line is not a turn", async () => {
    const { order } = harness();
    host.chat = [reply(["Welcome.", "Hello, traveller."], 1)];
    await emit("CHAT_CHANGED");
    host.chat[0] = reply(["Welcome.", "Hello, traveller."], 0);
    await emit("MESSAGE_SWIPED", 0);
    expect(order).toEqual(["rollback 0"]);
  });

  it("a chat left during the rollback is not committed into", async () => {
    const box: { world?: { live: boolean } } = {};
    const { order, world } = harness(() => { if (box.world) box.world.live = false; });
    box.world = world;
    await emit("CHAT_CHANGED");
    host.chat[2] = reply(["You ride north.", "You stay in the hall."], 0);
    await emit("MESSAGE_SWIPED", 2);
    expect(order).toEqual(["rollback 2"]);
  });

  it("a swipe with no usable id commits nothing", async () => {
    const { order } = harness();
    await emit("CHAT_CHANGED");
    await emit("MESSAGE_SWIPED", null);
    expect(order).toEqual([]);
  });
});
