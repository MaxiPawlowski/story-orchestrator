const choice = { next: "seal" as string | null, asked: [] as string[] };
jest.mock("@services/STAPI", () => ({
  showChoicePopup: jest.fn(async (text: string) => {
    choice.asked.push(text);
    return choice.next;
  }),
  showTextPopup: jest.fn(),
  registerHostMacro: jest.fn(),
  unregisterHostMacro: jest.fn(),
}));

import * as sagaMini from "../../test/fixtures/chapters-mini.story.json";
import { parseStoryV2OrThrow, type StoryV2 } from "@engine/index";
import { INJECTION_REGISTRY } from "@constants/injectionRegistry";
import { reverseMemoryState, type MemoryRollbackState } from "@memory/reverse";
import type { ChapterRecord } from "@memory/types";
import { confirmChapterJump, foldPreview, markSealSkip } from "./chapterKit";
import type { ChapterPort } from "./chapterPort";
import { SessionJournal } from "./journal";
import { mintToken, tokenMatches, type RunContext, type RunOwnership } from "./runToken";
import type { MemoryRuntimeState } from "./types";

const story = parseStoryV2OrThrow(JSON.parse(JSON.stringify({ ...sagaMini, default: undefined })) as StoryV2);

const harness = (seal = true) => {
  const current: RunContext = { chatId: "chat-a", storyId: "chapters-mini", storyHash: "h1", sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  const ownership: RunOwnership = { mint: (window = null) => mintToken(current, window), check: (token) => tokenMatches(current, token) };
  let memory = { chapters: [] as ChapterRecord[], settings: { chapters: { seal } } } as unknown as MemoryRuntimeState;
  const state = { activeCheckpointId: "market", visitedPath: ["gate", "market"], boundary: 4, lastMessageId: 9, blackboard: { values: { step: 1 }, versions: {}, latched: {} } };
  const port = {
    host: {
      deps: { getState: () => state, getStory: () => story, ownership },
      memory: () => memory,
      patch: (next: Partial<MemoryRuntimeState>) => { memory = { ...memory, ...next }; },
      save: jest.fn(async () => {}),
    },
    seal: jest.fn(async () => null),
  };
  return { port, asPort: port as unknown as ChapterPort, current, state, memory: () => memory };
};

beforeEach(() => {
  choice.next = "seal";
  choice.asked = [];
});

describe("/cp activate seal confirm (v2.6 plan 07 D2)", () => {
  it("asks before a jump that leaves a chapter, and seals that chapter at the path position the jump will take", async () => {
    const { port, asPort } = harness();
    expect(await confirmChapterJump(asPort, "walls")).toBe("seal");
    expect(choice.asked[0]).toContain("leaves the chapter Arrival");
    expect(port.seal).toHaveBeenCalledWith(expect.objectContaining({ chapter: expect.objectContaining({ id: "arrival" }), final: false }), {
      boundary: 4, messageId: 9, pathLength: 3, path: ["gate", "market", "walls"], activeCheckpointId: "walls", blackboard: { step: 1 },
    });
  });

  it("does not ask inside a chapter, with sealing off, or for an unknown checkpoint", async () => {
    expect(await confirmChapterJump(harness().asPort, "gate")).toBe("none");
    expect(await confirmChapterJump(harness(false).asPort, "walls")).toBe("none");
    expect(await confirmChapterJump(harness().asPort, "nowhere")).toBe("none");
    expect(choice.asked).toEqual([]);
  });

  it("a cancelled popup, or a chat that moved while it was open, cancels the jump and seals nothing", async () => {
    choice.next = null;
    const cancelled = harness();
    expect(await confirmChapterJump(cancelled.asPort, "walls")).toBe("cancel");
    choice.next = "seal";
    const moved = harness();
    const pending = confirmChapterJump(moved.asPort, "walls");
    moved.current.chatId = "chat-b";
    expect(await pending).toBe("cancel");
    expect(cancelled.port.seal).not.toHaveBeenCalled();
    expect(moved.port.seal).not.toHaveBeenCalled();
  });

  it("jump without sealing: the marker names the path position the jump takes, and a second jump still asks about the next chapter", async () => {
    choice.next = "skip";
    const { port, asPort, state, memory } = harness();
    expect(await confirmChapterJump(asPort, "walls")).toBe("skip");
    expect(port.seal).not.toHaveBeenCalled();
    markSealSkip(asPort, { pathLength: 3, messageId: 11 });
    state.visitedPath = ["gate", "market", "walls"];
    state.activeCheckpointId = "walls";
    state.lastMessageId = 11;
    expect(memory().chapterSealSkip).toEqual({ pathLength: 3, messageId: 11, previous: null });
    expect(port.host.save).toHaveBeenCalled();
    expect(await confirmChapterJump(asPort, "walls")).toBe("none");
  });

  it("a rollback that undoes the jump drops the marker", () => {
    const state = { chapterSealSkip: { pathLength: 3, messageId: 11 }, entries: [], excluded: [], writeLog: [], arcs: [], epistemic: [], ledger: [], canon: null, verifyDrops: [], derived: [],
      storyStart: 0, shortTermSummaryEnd: -1 } as unknown as MemoryRollbackState;
    expect(reverseMemoryState(state, 11, 5).chapterSealSkip).toBeNull();
    const chained = { ...state, chapterSealSkip: { pathLength: 5, messageId: 20, previous: { pathLength: 3, messageId: 11, previous: null } } } as MemoryRollbackState;
    expect(reverseMemoryState(chained, 15, 7).chapterSealSkip).toEqual({ pathLength: 3, messageId: 11, previous: null });
    expect(reverseMemoryState(state, 12, 5)).not.toHaveProperty("chapterSealSkip");
  });
});

describe("the fold, seen before and after a generation (v2.6 plan 07 D7)", () => {
  const record = { id: "r1", chapterId: "arrival", short: "They reached the gate.", summary: "Long summary.", range: { from: 0, to: 19 } } as ChapterRecord;
  const memory = (fold: boolean) => ({ chapters: [record], chronicle: { eras: [] }, settings: { chapters: { fold } } }) as unknown as MemoryRuntimeState;
  const block = [{ key: INJECTION_REGISTRY.storySoFar.key, value: "[The story so far]\nThey reached the gate." }];

  it("the next-turn preview counts the sealed messages the fold will leave out, keep_tail included", () => {
    expect(foldPreview(memory(true), story, block, 40)).toBe(14);
    expect(foldPreview(memory(true), story, block, 10)).toBe(10);
  });

  it("counts nothing with the fold off or when the story-so-far block does not carry the record (principle 4)", () => {
    expect(foldPreview(memory(false), story, block, 40)).toBe(0);
    expect(foldPreview(memory(true), story, [], 40)).toBe(0);
    expect(foldPreview(memory(true), story, [{ key: INJECTION_REGISTRY.storySoFar.key, value: "something else" }], 40)).toBe(0);
  });

  it("the payload capture records how many messages this generation folded", () => {
    const journal = new SessionJournal();
    expect(journal.noteFolded(3)).toBe(false);
    journal.capture({ at: "t", boundary: 1, reason: "generation", blocks: [] });
    expect(journal.noteFolded(14)).toBe(true);
    expect(journal.noteFolded(14)).toBe(false);
    expect(journal.getCaptures()[0].folded).toBe(14);
  });
});
