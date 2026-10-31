import { fakeHosts } from "../../test/support/fakeHosts";
import { plantedModel } from "../../test/support/modelCall";
import { createMentions, memoryExtensionKey, recordMentions, type MemoryEntry, type MentionsState, type OfferedItem } from "@memory/index";
import { MemoryCoordinator } from "./coordinators/memoryCoordinator";
import { createMentionPort } from "./mentionPort";
import { mintToken, tokenMatches, type RunContext, type RunOwnership, type RunToken } from "./runToken";

const prompts = new Map<string, string>();
const MEMBERS = ["Arin", "Ponticius"];
const KEY = "Arin hid the silver key under the loose floorboard in the chapel";
let chat: Array<{ name: string; mes: string; is_user?: boolean }> = [];

const stapi = {
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat, chatId: "chat-a", extensionSettings: {}, chatMetadata: {} }),
  getActiveGroup: () => ({ members: ["arin.png", "ponticius.png"], disabled_members: [] }),
  resolveGroupMemberId: (name: string) => `${name.toLowerCase()}.png`,
  hostSystemUserName: "SillyTavern System",
  getCharacterNameById: (id: number) => MEMBERS[id],
  countTokens: () => 4,
  setStoryExtensionPrompt: (key: string, text: string) => { prompts.set(key, text); },
  clearStoryExtensionPrompt: (key: string) => { prompts.delete(key); },
};

const story = {
  title: "S", id: "s1", checkpointById: { cp1: { id: "cp1", name: "CP1", objective: "" } }, qualityByKey: {},
  roster: [{ id: "arin", name: "Arin" }, { id: "ponticius", name: "Ponticius" }], arc_bridges: [],
};

const fact = (id: string, text: string, entities: string[]): MemoryEntry => ({
  id, tier: "facts", text, type: "fact", importance: 2, expiration: "permanent", entities, confidence: 1, activationTriggers: [], evidence: "",
  createdAt: 0, messageId: 0, recallCount: 0, provenance: { source: "extractor", validity: "live" } as MemoryEntry["provenance"],
});

function harness(settings: Record<string, unknown> = {}) {
  prompts.clear();
  chat = [{ name: "Player", mes: "We should rest.", is_user: true }];
  const current: RunContext = { chatId: "chat-a", storyId: "s1", storyHash: "h1", sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  const ownership: RunOwnership = { mint: (window = null) => mintToken(current, window), check: (token: RunToken) => tokenMatches(current, token) };
  let memoryState = {
    settings: { enabled: true, epistemicLedgerCapable: true, tierTokenBudgets: { facts: 400, session_details: 400, short_term: 400, scene_history: 400 },
      injectionDepths: { facts: 4, session_details: 3, short_term: 2, scene_history: 6 }, ...settings },
    entries: [fact("f1", KEY, ["Arin", "chapel"]), fact("f2", "The ferryman charges double after dark", ["ferryman"])],
    conflicts: [], resolvedConflicts: [], writeLog: [], excluded: [], verifyDrops: [], derived: [],
    sceneCount: 0, shortTermSummaryEnd: 0, arcs: [], epistemic: [], ledger: [], canon: null, updatedAt: "",
  };
  const coordinator = new MemoryCoordinator({
    hosts: fakeHosts(stapi), getStory: () => story,
    getState: () => ({ activeCheckpointId: "cp1", boundary: 4, lastMessageId: chat.length - 1, blackboard: { values: {}, versions: {} } }),
    getMemory: () => memoryState, setMemory: (next: typeof memoryState) => { memoryState = next; }, model: plantedModel,
    getFiredTransitions: () => [], getExpansionGateSources: () => [], enqueueExtractorDeltas: () => {}, enqueueMechanical: () => {},
    ownership, judge: () => null, persist: async () => {}, notify: () => {},
  } as never);
  return { coordinator, memory: () => memoryState };
}

const facts = () => prompts.get(memoryExtensionKey("facts")) ?? "";
const offered: OfferedItem[] = [{ id: "f1", kind: "row", text: KEY }];

describe("v3.0 41 B2: the mention ledger holds back what a member just said, in that member's block only", () => {
  const said: MentionsState = recordMentions(createMentions(), ["f1"], offered, { member: "arin", messageId: 2, revision: "r", boundary: 3 });

  it("control: with nothing said both members get the row", () => {
    const { coordinator } = harness();
    coordinator.updateInjection();
    coordinator.onMemberDrafted(0);
    expect(facts()).toContain("silver key");
  });

  it("the speaker who said it does not get it back; another member still does", () => {
    const { coordinator } = harness();
    coordinator.injector.setMentions(() => said);
    coordinator.updateInjection();
    coordinator.onMemberDrafted(0);
    expect(facts()).not.toContain("silver key");
    expect(facts()).toContain("ferryman");
    coordinator.onMemberDrafted(1);
    expect(facts()).toContain("silver key");
  });

  it("the player raising it releases it at once", () => {
    const { coordinator } = harness();
    coordinator.injector.setMentions(() => said);
    chat = [...chat, { name: "Player", mes: "Arin, where did the silver key go?", is_user: true }];
    coordinator.updateInjection();
    coordinator.onMemberDrafted(0);
    expect(facts()).toContain("silver key");
  });

  it("a draft records what was offered to that member, consumed by the reply that follows it", () => {
    const { coordinator } = harness();
    coordinator.updateInjection();
    coordinator.onMemberDrafted(0);
    const items = coordinator.injector.offeredTo("arin", chat.length);
    expect(items?.map((item) => item.id).sort()).toEqual(["f1", "f2"]);
    expect(coordinator.injector.offeredTo("arin", chat.length)).toBeNull();
  });

  it("a capture is not reused for a reply far from the draft", () => {
    const { coordinator } = harness();
    coordinator.updateInjection();
    coordinator.onMemberDrafted(0);
    expect(coordinator.injector.offeredTo("arin", chat.length + 3)).toBeNull();
  });
});

describe("v3.0 41 B1: the boundary records what the reply used and stamps the rows", () => {
  const portFor = (settings: Record<string, unknown>, rows: unknown[], items: OfferedItem[] | null) => {
    const extras = { memory: { settings: { enabled: true, ...settings } } } as never as { mentions?: MentionsState };
    const stamped: Array<{ ids: string[]; at: unknown }> = [];
    const port = createMentionPort({
      getStory: () => story as never, extras: () => extras as never, chatRows: () => rows, offeredTo: () => items,
      stampUsed: (ids, at) => stamped.push({ ids, at }), refresh: () => {}, persist: () => {},
    });
    return { port, extras, stamped };
  };
  const result = (lastMessageId: number) => ({ boundary: 7, context: { lastMessageId } }) as never;
  const rows = [{ name: "Player", mes: "Hello", is_user: true }, { name: "Arin", mes: "The silver key is under the floorboard in the chapel.", swipe_id: 0 }];

  it("records the used row with message, revision and boundary, and stamps it", () => {
    const { port, extras, stamped } = portFor({}, rows, [...offered, { id: "f2", kind: "row", text: "The ferryman charges double after dark" }]);
    port.onBoundary(result(1));
    expect(extras.mentions?.records.map((record) => [record.id, record.member, record.messageId, record.boundary])).toEqual([["f1", "arin", 1, 7]]);
    expect(extras.mentions?.records[0].revision).toMatch(/^0\./);
    expect(stamped).toEqual([{ ids: ["f1"], at: { messageId: 1, boundary: 7 } }]);
  });

  it("retention off: records, no stamp; both off: nothing", () => {
    const off = portFor({ strengthRetention: false }, rows, offered);
    off.port.onBoundary(result(1));
    expect(off.extras.mentions?.records).toHaveLength(1);
    expect(off.stamped).toEqual([]);
    const none = portFor({ strengthRetention: false, mentionLedger: false }, rows, offered);
    none.port.onBoundary(result(1));
    expect(none.extras.mentions).toBeUndefined();
    expect(none.port.held()).toBeNull();
  });

  it("a player line, an unknown speaker or no capture records nothing", () => {
    for (const [index, items] of [[0, offered], [1, null]] as const) {
      const { port, extras } = portFor({}, rows, items);
      port.onBoundary(result(index));
      expect(extras.mentions).toBeUndefined();
    }
    const stranger = portFor({}, [{ name: "Nobody", mes: "silver key floorboard chapel" }], offered);
    stranger.port.onBoundary(result(0));
    expect(stranger.extras.mentions).toBeUndefined();
  });
});
