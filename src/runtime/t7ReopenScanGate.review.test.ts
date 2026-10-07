import { parseStoryV2OrThrow, type NormalizedStoryV2 } from "@engine/index";
import type { NormalizedLedger, ScanEntry, ScanGateRow } from "./scanGatePlan";
import { ScanGateProvider } from "./worldInfoScan";

const story = parseStoryV2OrThrow({
  format: 2,
  id: "reopen",
  title: "reopen",
  description: "Reopen scan fixture.",
  qualities: [],
  checkpoints: [
    { id: "cp1", name: "CP1", objective: "x", type: "anchor", start: true, effects: { world_info: { enable: [{ lorebook: "SO-T7 Book", comments: ["CP1 Road"] }] } } },
    { id: "cp2", name: "CP2", objective: "x", type: "anchor", effects: { world_info: { enable: [{ lorebook: "SO-T7 Book", comments: ["CP2 Gate"] }] } } },
  ],
  transitions: [],
  roster: [],
});

const world = { chatId: "chat-a", ownedChat: null as string | null, story: null as NormalizedStoryV2 | null, path: [] as string[] };

const provider = new ScanGateProvider({
  chatId: () => world.chatId,
  ownedChat: () => world.ownedChat,
  story: () => world.story,
  path: () => world.path,
  ready: () => true,
  library: () => [story],
  libraryRevision: () => "r1",
  ledger: () => ({ "SO-T7 Book": ["CP1 Road", "CP2 Gate"] }) as NormalizedLedger,
});

const scan = () => {
  const arrays: ScanEntry[][] = [[
    { world: "SO-T7 Book", uid: 1, comment: "CP1 Road", disable: true },
    { world: "SO-T7 Book", uid: 2, comment: "CP2 Gate", disable: true },
  ], [], [], []];
  const rows: ScanGateRow[] = [];
  const stats = provider.apply(arrays, rows);
  return { owner: stats.owner, on: rows.filter((row) => row.on).map((row) => row.comment) };
};

describe("T7 I1/I2/I6: the scan gate provider keeps no scan state, so the scan after a reopen's hydrate is gated by the story whatever the pre-cache scan read", () => {
  it("each scan re-chooses from the current chat, story and path: a no-story scan in between (the shape of ST's CHAT_CHANGED pre-cache scan) leaves the next story scan identical to the continuous one", () => {
    world.ownedChat = "chat-a";
    world.story = story;
    world.path = ["cp1"];
    const continuous = scan();
    expect(continuous).toEqual({ owner: "story", on: ["CP1 Road"] });

    world.ownedChat = null;
    world.story = null;
    world.path = [];
    expect(scan()).toEqual({ owner: "no-story", on: [] });

    world.ownedChat = "chat-a";
    world.story = story;
    world.path = ["cp1"];
    expect(scan()).toEqual(continuous);
  });
});
