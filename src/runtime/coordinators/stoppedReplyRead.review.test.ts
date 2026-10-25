import { fakeHosts } from "../../../test/support/fakeHosts";
import { testOwnership } from "../../../test/findings/testOwnership";
import { ExtractionCoordinator } from "./extractionCoordinator";

const reads: Array<{ to: number; lastMessageId: number; texts: string[] }> = [];

jest.mock("@extraction/sharedRead", () => {
  const actual = jest.requireActual("@extraction/sharedRead");
  return {
    ...actual,
    runSharedRead: async (options: { window: { to: number; messages: Array<{ text: string }> }; state: { lastMessageId: number } }) => {
      reads.push({ to: options.window.to, lastMessageId: options.state.lastMessageId, texts: options.window.messages.map((message) => message.text) });
      return null;
    },
  };
});

const CHAT = [
  { name: "Kel", mes: "The hall is loud.", is_user: false },
  { name: "Max", mes: "We take the job.", is_user: true },
  { name: "Kel", mes: "You ride no", is_user: false },
];

function harness(held: number | null) {
  const stapi = { getContext: () => ({ chat: CHAT, chatId: "chat-a", extensionSettings: {}, chatMetadata: {} }), getActiveGroup: () => null };
  return new ExtractionCoordinator({ hosts: fakeHosts(stapi), ownership: testOwnership(),
    getStory: () => ({ title: "S", qualityByKey: {}, checkpointById: {}, roster: [] }),
    getState: () => ({ activeCheckpointId: "cp1", boundary: 1, lastMessageId: 1, chatLength: 2 }),
    getExtraction: () => ({ settings: { enabled: true }, audits: [], reconciliationEvents: [], judgedReads: [] }),
    model: {},
    memory: { enabled: true, capable: true, getFacts: () => [], getOpenArcs: () => [], getEntities: () => [] },
    getFiredTransitions: () => [],
    getExpansionGateSources: () => [],
    enqueueExtractorDeltas: () => {},
    commitBoundary: async () => {},
    fireSceneBreakReplies: async () => {},
    emitSceneBreak: () => {},
    emitArcsResolved: () => {},
    setStatus: () => {},
    persist: async () => {},
    notify: () => {},
    heldReply: (chatId: string | null) => (chatId === "chat-a" ? held : null),
  } as never);
}

beforeEach(() => { reads.length = 0; });

describe("A02: a manual read never reads a reply the player stopped", () => {
  it("reads up to the message before the held partial", async () => {
    await harness(2).runNow("SCENE_NONE");
    expect(reads).toEqual([{ to: 1, lastMessageId: 1, texts: ["The hall is loud.", "We take the job."] }]);
  });

  it("without a hold it reads the transcript as it is now", async () => {
    await harness(null).runNow("SCENE_NONE");
    expect(reads[0].to).toBe(2);
    expect(reads[0].texts).toContain("You ride no");
  });
});
