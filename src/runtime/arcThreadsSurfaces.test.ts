jest.mock("@services/STAPI", () => ({ getContext: jest.fn(() => ({ chat: [] })) }));

import type { EngineState, NormalizedStory } from "@engine/index";
import type { ArcEntry } from "@memory/index";
import { storySoFar } from "./chapterKit";
import type { ChapterHost } from "./chapterPort";
import { chapterParts, type SnapshotSources } from "./snapshotBuilder";

const putOff = (id: string, text: string): ArcEntry => ({
  id, text, status: "open", entities: [], openedAt: 1, history: [{
    kind: "deferred", boundary: 2, messageId: 3, quote: "Later.", span: { chatId: "c", messageId: 2, revision: { swipeId: null, hash: "h" }, speaker: "Rin", isUser: true, span: [0, 6] },
  }],
});
const open = (id: string, text: string): ArcEntry => ({ id, text, status: "open", entities: [], openedAt: 1 });
const arcs = [open("a", "Who rang the bell at midnight"), putOff("b", "The debt owed to the river smugglers")];
const story = { id: "s", title: "S", roster: [], chapters: [] } as unknown as NormalizedStory;
const state = { activeCheckpointId: "c1", lastMessageId: 6, checkpointStartedBoundary: 0, boundary: 3, visitedPath: ["c1"] } as unknown as EngineState;
const memoryOf = (settings: Record<string, unknown> = {}) => ({ arcs, derived: [], entries: [], chapters: [], settings: { enabled: true, ...settings } });

describe("v3.0 33 S4: the player's thread list marks a thread they put off", () => {
  it("shows it with (put off), and the other open thread as before", () => {
    const sources = { extras: { memory: memoryOf() }, openThreads: ["x"], promptBlocks: { own: [] }, chat: [], resting: (text: string) => text } as unknown as SnapshotSources;
    expect(chapterParts(sources, story, state).openThreads).toEqual(["Who rang the bell at midnight", "The debt owed to the river smugglers (put off)"]);
  });
});

describe("v3.0 33 S3: the injected open threads keep a put-off thread until the rated control is on", () => {
  const host = (settings: Record<string, unknown>) => ({
    memory: () => memoryOf(settings), deps: { getStory: () => story, getState: () => state }, coordinator: { injector: { restingFilter: () => (text: string) => text } },
  }) as unknown as ChapterHost;

  it("keeps it by default (today's prompt) and leaves it out with deferredOutOfPrompt on", () => {
    expect(storySoFar(host({}))).toContain("The debt owed to the river smugglers");
    expect(storySoFar(host({ deferredOutOfPrompt: false }))).toContain("The debt owed to the river smugglers");
    const quiet = storySoFar(host({ deferredOutOfPrompt: true }));
    expect(quiet).toContain("Who rang the bell at midnight");
    expect(quiet).not.toContain("smugglers");
  });
});
