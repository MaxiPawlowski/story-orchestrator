import { parseStoryV2OrThrow, type NormalizedStoryV2 } from "@engine/index";
import type { HostLoreBindings, HostScannableEntry } from "@services/STAPI";
import { nextRepairStep, STORY_LORE_TARGET_ID } from "./repair";
import { readRequirements } from "./requirementsRead";
import type { NormalizedLedger } from "./scanGatePlan";
import { appendStoryLore, createStoryLore, globalStoryBooks, storyLoreBooks, type StoryLoreBook, type StoryLoreOwner } from "./storyLore";
import type { RuntimeSnapshot } from "./types";
import { ScanGateProvider } from "./worldInfoScan";
import { ScanGuard } from "./worldInfoScanGuard";

const HOARD = "The Hoard of the Dead Dragon";
const PAWN = "The Pawnbroker of Forgotten Days";

const make = (id: string, book: string, gated: string[]) => parseStoryV2OrThrow({
  format: 2,
  id,
  title: id,
  description: "Story lore fixture.",
  requirements: { lorebooks: [book] },
  qualities: [],
  checkpoints: [
    { id: `${id}-1`, name: "Start", objective: "x", type: "anchor", start: true },
    { id: `${id}-2`, name: "Vault", objective: "x", type: "anchor", ...(gated.length ? { effects: { world_info: { enable: [{ lorebook: book, comments: gated }] } } } : {}) },
  ],
  transitions: [],
  roster: [],
});

const hoard = make("the-hoard", HOARD, ["The Vault Door"]);
const pawn = make("the-pawnbroker", PAWN, []);

const entry = (world: string, uid: number, comment: string, extra: Partial<HostScannableEntry> = {}): HostScannableEntry =>
  ({ world, uid, comment, content: comment, key: [], disable: false, ...extra });

const books: Record<string, StoryLoreBook> = {
  [HOARD]: { name: HOARD, entries: [
    entry(HOARD, 0, "Vaelrith, the Dead Dragon", { constant: true }),
    entry(HOARD, 1, "The Order of the Silver Lance", { key: ["knights"] }),
    entry(HOARD, 2, "The Vault Door", { constant: true, disable: true }),
  ] },
  [PAWN]: { name: PAWN, entries: [
    entry(PAWN, 0, "The Queen's Ledger", { constant: true }),
    entry(PAWN, 1, "The City of Ledgers", { key: ["city"] }),
  ] },
};

const world = {
  chatId: "pawn-chat" as string | null,
  ownedChat: "pawn-chat" as string | null,
  story: pawn as NormalizedStoryV2 | null,
  path: ["the-pawnbroker-1"],
  loads: [] as string[],
  onLoad: null as (() => void) | null,
};

const owner = (): StoryLoreOwner => ({ chatId: world.chatId, ownedChat: world.ownedChat, story: world.story });

const lore = () => createStoryLore({
  owner,
  load: async (name) => {
    world.loads.push(name);
    world.onLoad?.();
    return books[name] ? { name: books[name].name, entries: books[name].entries.map((row) => ({ ...row })) } : null;
  },
});

const emptyScan = (): HostScannableEntry[][] => [[], [], [], []];

const play = (story: NormalizedStoryV2 | null, chat: string, path: string[] = []) => {
  world.chatId = chat;
  world.ownedChat = story ? chat : null;
  world.story = story;
  world.path = path;
};

const comments = (arrays: HostScannableEntry[][]) => arrays.flat().map((row) => String(row.comment));
const live = (arrays: HostScannableEntry[][]) => arrays.flat().filter((row) => row.disable !== true).map((row) => String(row.comment)).sort();

beforeEach(() => {
  play(pawn, "pawn-chat", ["the-pawnbroker-1"]);
  world.loads = [];
  world.onLoad = null;
});

describe("story-scoped lore: a story's books reach only the chats that play it (T5-2-2)", () => {
  it("a chat playing the Pawnbroker never receives the Hoard's always-on entries", async () => {
    const arrays = emptyScan();
    const scan = await lore().append(arrays);
    expect(comments(arrays)).toEqual(["The Queen's Ledger", "The City of Ledgers"]);
    expect(comments(arrays)).not.toContain("Vaelrith, the Dead Dragon");
    expect(world.loads).toEqual([PAWN]);
    expect(scan).toMatchObject({ owner: "story", books: [PAWN], appended: 2, missing: [] });
    expect(arrays[0].every((row) => row.world === PAWN)).toBe(true);
  });

  it("and a chat playing the Hoard never receives the Pawnbroker's", async () => {
    play(hoard, "hoard-chat", ["the-hoard-1"]);
    const arrays = emptyScan();
    await lore().append(arrays);
    expect(comments(arrays)).toEqual(["Vaelrith, the Dead Dragon", "The Order of the Silver Lance", "The Vault Door"]);
    expect(world.loads).toEqual([HOARD]);
  });

  it("a chat without a story, or a chat its story was not loaded into, scans no story book", async () => {
    play(null, "plain-chat");
    const plain = emptyScan();
    expect(await lore().append(plain)).toMatchObject({ owner: "no-story", appended: 0 });
    world.story = hoard;
    world.ownedChat = "hoard-chat";
    const foreign = emptyScan();
    await lore().append(foreign);
    expect(comments(plain)).toEqual([]);
    expect(comments(foreign)).toEqual([]);
    expect(world.loads).toEqual([]);
  });

  it("a book the user selected globally is already in the scan, so it is never added twice", async () => {
    const arrays: HostScannableEntry[][] = [[entry(PAWN, 0, "The Queen's Ledger", { constant: true })], [], [], []];
    const scan = await lore().append(arrays);
    expect(comments(arrays)).toEqual(["The Queen's Ledger"]);
    expect(scan).toMatchObject({ skipped: [PAWN], appended: 0 });
    expect(world.loads).toEqual([]);
  });

  it("appends nothing when the chat moved while the book loaded", async () => {
    world.onLoad = () => play(hoard, "hoard-chat");
    const arrays = emptyScan();
    expect(await lore().append(arrays)).toMatchObject({ owner: "no-story", appended: 0 });
    expect(comments(arrays)).toEqual([]);
  });

  it("names a listed book that could not be loaded instead of appending a dummy", async () => {
    const ghost = make("ghost", "Gone Book", []);
    play(ghost, "ghost-chat");
    const arrays = emptyScan();
    expect(await lore().append(arrays)).toMatchObject({ owner: "story", appended: 0, missing: ["Gone Book"] });
  });

  it("appends into the global array, the place a globally selected book took before", () => {
    const arrays = emptyScan();
    appendStoryLore(arrays, [books[PAWN]]);
    expect(arrays.map((list) => list.length)).toEqual([2, 0, 0, 0]);
  });

  it("lists only the books the story names, once, and never a memory mirror book", () => {
    const story = { requirements: { lorebooks: [HOARD, HOARD.toUpperCase(), "Story Orchestrator - Hoard - chat-1", " "] } };
    expect(storyLoreBooks(story)).toEqual([HOARD]);
    expect(storyLoreBooks({})).toEqual([]);
  });
});

describe("story-scoped lore keeps checkpoint gating on the path", () => {
  const ledger: NormalizedLedger = { [HOARD]: ["The Vault Door"] };
  const gate = () => new ScanGateProvider({
    chatId: () => world.chatId,
    ownedChat: () => world.ownedChat,
    story: () => world.story,
    path: () => world.path,
    ready: () => true,
    library: () => [hoard, pawn],
    libraryRevision: () => "r1",
    ledger: () => ledger,
  });

  it("scan mode: the gated entry rests off at the start and switches on once the path enters its checkpoint", async () => {
    play(hoard, "hoard-chat", ["the-hoard-1"]);
    const start = emptyScan();
    await lore().append(start);
    gate().apply(start);
    expect(live(start)).toEqual(["The Order of the Silver Lance", "Vaelrith, the Dead Dragon"]);

    play(hoard, "hoard-chat", ["the-hoard-1", "the-hoard-2"]);
    const vault = emptyScan();
    await lore().append(vault);
    gate().apply(vault);
    expect(live(vault)).toEqual(["The Order of the Silver Lance", "The Vault Door", "Vaelrith, the Dead Dragon"]);
  });

  it("file mode: the scan guard still turns off a gated entry a file write left on, once the chat plays another story", async () => {
    const guard = new ScanGuard({
      openChat: () => world.chatId,
      storyChat: () => world.ownedChat,
      story: () => world.story,
      path: () => world.path,
      ready: () => true,
      library: () => [hoard, pawn],
      libraryRevision: () => "r1",
    });
    play(pawn, "pawn-chat", ["the-pawnbroker-1"]);
    const userSelectedHoard: HostScannableEntry[][] = [[entry(HOARD, 2, "The Vault Door", { constant: true, disable: false })], [], [], []];
    await lore().append(userSelectedHoard);
    guard.apply(userSelectedHoard);
    expect(live(userSelectedHoard)).toEqual(["The City of Ledgers", "The Queen's Ledger"]);
  });

  it("switching the chat from the Hoard to the Pawnbroker releases the Hoard: nothing of it is scanned", async () => {
    play(hoard, "chat-1", ["the-hoard-1", "the-hoard-2"]);
    const before = emptyScan();
    await lore().append(before);
    gate().apply(before);
    expect(live(before)).toContain("The Vault Door");

    play(pawn, "chat-1", ["the-pawnbroker-1"]);
    const after = emptyScan();
    await lore().append(after);
    gate().apply(after);
    expect(after.flat().some((row) => row.world === HOARD)).toBe(false);
    expect(live(after)).toEqual(["The City of Ledgers", "The Queen's Ledger"]);
  });
});

describe("requirements read a story book the runtime scans for this story as present", () => {
  const lore = (overrides: Partial<HostLoreBindings> = {}): HostLoreBindings => ({ global: [], chat: null, persona: null, characters: [], listed: [HOARD, PAWN], ...overrides });
  const view = (overrides: Partial<HostLoreBindings> = {}) => ({ persona: "Max", members: [], lore: lore(overrides) });

  it("a listed book of the story is ready, satisfied by the story itself", () => {
    expect(readRequirements(hoard.requirements, view(), { scan: false, mirrorBook: null, storyLore: true }))
      .toMatchObject({ ready: true, missingLorebooks: [], satisfiedBy: { [HOARD]: "story" } });
  });

  it("the user's own global selection still reads as global", () => {
    expect(readRequirements(hoard.requirements, view({ global: [HOARD] }), { scan: false, mirrorBook: null, storyLore: true }).satisfiedBy).toEqual({ [HOARD]: "global" });
  });

  it("a book that is not on the install is missing", () => {
    expect(readRequirements(hoard.requirements, view({ listed: [PAWN] }), { scan: true, mirrorBook: null, storyLore: true }))
      .toMatchObject({ ready: false, missingLorebooks: [HOARD] });
  });

  it("control: a host that cannot append story books needs the book scanned some other way", () => {
    expect(readRequirements(hoard.requirements, view(), { scan: false, mirrorBook: null }))
      .toMatchObject({ ready: false, missingLorebooks: [HOARD] });
  });
});

describe("migration: story books an older build or installer selected for every chat", () => {
  it("names the selected books a library story lists, minus the ones the author chose to keep", () => {
    const selected = ["My Notes", HOARD, PAWN, "Adolion World"];
    const library = [hoard, pawn, { requirements: { lorebooks: ["adolion world"] } }];
    expect(globalStoryBooks(selected, library, [])).toEqual([HOARD, PAWN, "Adolion World"]);
    expect(globalStoryBooks(selected, library, [PAWN.toLowerCase()])).toEqual([HOARD, "Adolion World"]);
    expect(globalStoryBooks(["My Notes"], library, [])).toEqual([]);
  });

  it("is an author-only Repair row that points at the Lorebooks control", () => {
    const snapshot = {
      storyId: null, ui: { authorView: true }, extraction: { settings: { enabled: true, profileId: "p" } }, globalStoryLore: [HOARD],
    } as unknown as RuntimeSnapshot;
    expect(nextRepairStep(snapshot)).toMatchObject({ area: "lore", targetId: STORY_LORE_TARGET_ID, player: null, detail: `Selected for every chat: ${HOARD}` });
    expect(nextRepairStep({ ...snapshot, globalStoryLore: [] } as RuntimeSnapshot)).toBeNull();
  });
});
