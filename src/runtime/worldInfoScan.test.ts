import { parseStoryV2OrThrow, type NormalizedStoryV2 } from "@engine/index";
import type { NormalizedLedger, ScanEntry } from "./scanGatePlan";
import { ScanGateProvider } from "./worldInfoScan";

const make = (id: string, world_info: unknown[]) => parseStoryV2OrThrow({
  format: 2,
  id,
  title: id,
  description: "Scan gating fixture.",
  qualities: [],
  checkpoints: world_info.map((effect, index) => ({ id: `cp${index + 1}`, name: `CP${index + 1}`, objective: "x", type: "anchor", ...(index === 0 ? { start: true } : {}), effects: { world_info: effect } })),
  transitions: [],
  roster: [],
});

const ruins = make("ruins", [
  { enable: [{ lorebook: "SO-T13 Ruins", comments: ["CP1 Road"] }] },
  { enable: [{ lorebook: "SO-T13 Ruins", comments: ["CP2 Gate"] }], disable: [{ lorebook: "SO-T13 Ruins", comments: ["CP1 Road"] }] },
]);
const other = make("other", [{ enable: [{ lorebook: "SO-T13 Ruins", comments: ["Theirs"] }] }]);

const world = {
  chatId: "chat-a" as string | null,
  ownedChat: "chat-a" as string | null,
  story: ruins as NormalizedStoryV2 | null,
  path: ["cp1", "cp2"],
  ready: true,
  revision: "r1",
  ledger: { "SO-T13 Ruins": ["CP1 Road", "CP2 Gate", "Theirs"] } as NormalizedLedger,
  libraryReads: 0,
};

const provider = () => new ScanGateProvider({
  chatId: () => world.chatId,
  ownedChat: () => world.ownedChat,
  story: () => world.story,
  path: () => world.path,
  ready: () => world.ready,
  library: () => { world.libraryReads += 1; return [ruins, other]; },
  libraryRevision: () => world.revision,
  ledger: () => world.ledger,
});

const payload = (): ScanEntry[][] => [[
  { world: "SO-T13 Ruins", uid: 1, comment: "CP1 Road", disable: true },
  { world: "SO-T13 Ruins", uid: 2, comment: "CP2 Gate", disable: true },
  { world: "SO-T13 Ruins", uid: 3, comment: "Theirs", disable: true },
  { world: "SO-T13 Ruins", uid: 4, comment: "Ungated", disable: false },
], [], [], []];

const states = (arrays: ScanEntry[][]) => Object.fromEntries(arrays.flat().map((entry) => [String(entry.comment), entry.disable]));

beforeEach(() => {
  Object.assign(world, { chatId: "chat-a", ownedChat: "chat-a", story: ruins, path: ["cp1", "cp2"], ready: true, revision: "r1", libraryReads: 0 });
});

describe("ScanGateProvider (v2.4 plan 05 T13 spike)", () => {
  it("the owning chat's scan sees its path: normalised entries switched on from rest, others' entries off", () => {
    const arrays = payload();
    const stats = provider().apply(arrays);
    expect(states(arrays)).toEqual({ "CP1 Road": true, "CP2 Gate": false, Theirs: true, Ungated: false });
    expect(stats).toEqual(expect.objectContaining({ owner: "story", on: 1 }));
  });

  it("a scan for any other chat is a no-story scan: every library gated entry stays off", () => {
    world.chatId = "chat-b";
    const arrays = payload();
    expect(provider().apply(arrays).owner).toBe("no-story");
    expect(states(arrays)).toEqual({ "CP1 Road": true, "CP2 Gate": true, Theirs: true, Ungated: false });
  });

  it("ST's CHAT_CHANGED pre-cache scan, before our hydrate, is a no-story scan (05-H9)", () => {
    world.chatId = "chat-new";
    world.ownedChat = "chat-a";
    expect(provider().choose().owner).toBe("no-story");
  });

  it("not-ready requirements are a no-story scan", () => {
    world.ready = false;
    const arrays = payload();
    expect(provider().apply(arrays).owner).toBe("no-story");
    expect(states(arrays)["CP2 Gate"]).toBe(true);
  });

  it("no story loaded is a no-story scan", () => {
    world.story = null;
    expect(provider().choose().owner).toBe("no-story");
  });

  it("memoises by chat, story, path and library revision, and rebuilds when any of them moves", () => {
    const gates = provider();
    const first = gates.choose();
    expect(gates.choose()).toBe(first);
    expect(world.libraryReads).toBe(1);
    world.revision = "r2";
    expect(gates.choose()).not.toBe(first);
    world.path = ["cp1"];
    const onPath = gates.choose();
    expect(onPath.gate.get("so-t13 ruins")?.entries.get("CP1 Road")).toBe(true);
    expect(world.libraryReads).toBe(3);
  });

  it("an entry the ledger does not say rests off is never switched on (compare-and-set)", () => {
    world.ledger = {};
    const arrays = payload();
    const stats = provider().apply(arrays);
    expect(states(arrays)["CP2 Gate"]).toBe(true);
    expect(stats.keptForeign).toBe(1);
    world.ledger = { "SO-T13 Ruins": ["CP1 Road", "CP2 Gate", "Theirs"] };
  });
});
