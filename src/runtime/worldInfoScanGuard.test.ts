import { parseStoryV2OrThrow, type NormalizedStoryV2 } from "@engine/index";
import type { ScanEntry } from "./scanGatePlan";
import { worldInfoPlan, releasePlan } from "./worldInfoGates";
import { ScanGuard } from "./worldInfoScanGuard";

const make = (id: string, book: string, scenes: string[], cast: string) => parseStoryV2OrThrow({
  format: 2,
  id,
  title: id,
  description: "Scan guard fixture.",
  qualities: [],
  checkpoints: scenes.map((scene, index) => ({
    id: `${id}-${index + 1}`, name: scene, objective: "x", type: "anchor", ...(index === 0 ? { start: true } : {}),
    effects: { world_info: {
      enable: [{ lorebook: book, comments: index === 0 ? [scene, cast] : [scene] }],
      ...(index > 0 ? { disable: [{ lorebook: book, comments: [scenes[index - 1]] }] } : {}),
    } },
  })),
  transitions: [],
  roster: [],
});

const ADV_BOOK = "Adolion Adventurer Checkpoints";
const AEGIS_BOOK = "Adolion Aegis Checkpoints";
const adventurer = make("adolion-adventurer", ADV_BOOK, ["CP guild-hall - Scene", "CP road-to-wendhope - Scene"], "Cast - The Party");
const aegis = make("adolion-aegis", AEGIS_BOOK, ["CP aegis-homecoming - Scene", "CP aegis-the-tavern - Scene"], "Cast - Aegis");

const ADV_PATH = ["adolion-adventurer-1", "adolion-adventurer-2"];
const AEGIS_PATH = ["adolion-aegis-1", "adolion-aegis-2"];

const entry = (world: string, uid: number, comment: string, disable: boolean): ScanEntry => ({ world, uid, comment, disable });

const filesAfter = (story: NormalizedStoryV2, path: string[], others: NormalizedStoryV2[]): ScanEntry[][] => {
  const on = new Set(worldInfoPlan(story, path).flatMap((plan) => plan.enable.map((comment) => `${plan.lorebook}|${comment}`)));
  const off = new Set(releasePlan(others, story).flatMap((plan) => plan.disable.map((comment) => `${plan.lorebook}|${comment}`)));
  const books: Array<[string, string[]]> = [
    [ADV_BOOK, ["CP guild-hall - Scene", "CP road-to-wendhope - Scene", "Cast - The Party", "Adventurer Ungated"]],
    [AEGIS_BOOK, ["CP aegis-homecoming - Scene", "CP aegis-the-tavern - Scene", "Cast - Aegis"]],
  ];
  let uid = 0;
  const lore = books.flatMap(([book, comments]) => comments.map((comment) => {
    const key = `${book}|${comment}`;
    return entry(book, (uid += 1), comment, off.has(key) || (!on.has(key) && !comment.endsWith("Ungated")));
  }));
  return [lore, [], [], []];
};

const live = (arrays: ScanEntry[][]) => arrays.flat().filter((item) => item.disable !== true).map((item) => String(item.comment)).sort();

const world = {
  open: "adv-chat" as string | null,
  storyChat: "adv-chat" as string | null,
  story: adventurer as NormalizedStoryV2 | null,
  path: ADV_PATH,
  ready: true,
};

const guard = () => new ScanGuard({
  openChat: () => world.open,
  storyChat: () => world.storyChat,
  story: () => world.story,
  path: () => world.path,
  ready: () => world.ready,
  library: () => [adventurer, aegis],
  libraryRevision: () => "r1",
});

beforeEach(() => {
  Object.assign(world, { open: "adv-chat", storyChat: "adv-chat", story: adventurer, path: ADV_PATH, ready: true });
});

describe("T1-7: the first scan after a chat switch never carries the previous story's gated lore (v2.6 plan 15)", () => {
  it("control: the lorebook files the adventurer chat left carry its gated scene and cast into the next scan", () => {
    expect(live(filesAfter(adventurer, ADV_PATH, [aegis]))).toEqual(["Adventurer Ungated", "CP road-to-wendhope - Scene", "Cast - The Party"]);
  });

  it("switched to the Aegis chat before the load: the old story is not this chat's, so every gated entry is off", () => {
    Object.assign(world, { open: "aegis-chat" });
    const arrays = filesAfter(adventurer, ADV_PATH, [aegis]);
    const result = guard().apply(arrays);
    expect(result.owner).toBe("no-story");
    expect(live(arrays)).toEqual(["Adventurer Ungated"]);
  });

  it("Aegis loaded but its file writes not landed: its own path is on, the adventurer's scene and cast are off", () => {
    Object.assign(world, { open: "aegis-chat", storyChat: "aegis-chat", story: aegis, path: AEGIS_PATH });
    const arrays = filesAfter(adventurer, ADV_PATH, [aegis]);
    const result = guard().apply(arrays);
    expect(result.owner).toBe("story");
    expect(live(arrays)).toEqual(["Adventurer Ungated", "CP aegis-the-tavern - Scene", "Cast - Aegis"]);
  });

  it("switching back: the adventurer's first scan drops Aegis's cast, exam and tavern scene the files still hold", () => {
    const arrays = filesAfter(aegis, AEGIS_PATH, [adventurer]);
    expect(live(arrays)).toContain("Cast - Aegis");
    guard().apply(arrays);
    expect(live(arrays)).toEqual(["Adventurer Ungated", "CP road-to-wendhope - Scene", "Cast - The Party"]);
  });

  it("a story whose requirements do not hold keeps its own entries as the files have them and still drops the others'", () => {
    Object.assign(world, { open: "aegis-chat", storyChat: "aegis-chat", story: aegis, path: AEGIS_PATH, ready: false });
    const arrays = filesAfter(adventurer, ADV_PATH, [aegis]);
    const result = guard().apply(arrays);
    expect(result.owner).toBe("story-not-ready");
    expect(live(arrays)).toEqual(["Adventurer Ungated"]);
  });

  it("once the files have landed the guard changes nothing", () => {
    const arrays = filesAfter(adventurer, ADV_PATH, [aegis]);
    const result = guard().apply(arrays);
    expect(result.off + result.on).toBe(0);
  });

  it("an entry without a disable key is never given one", () => {
    Object.assign(world, { open: "aegis-chat" });
    const bare: ScanEntry = { world: ADV_BOOK, uid: 9, comment: "Cast - The Party" };
    const result = guard().apply([[bare], [], [], []]);
    expect(Object.prototype.hasOwnProperty.call(bare, "disable")).toBe(false);
    expect(result.missingKey).toBe(1);
  });
});
