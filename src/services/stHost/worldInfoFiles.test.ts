const host = { listed: ["Ruins"] as string[], disk: new Map<string, { entries: Record<number, Record<string, unknown>> }>(), reads: [] as string[] };

jest.mock("./worldInfo", () => ({
  findLorebook: (name: string) => host.listed.find((entry) => entry.toLowerCase() === name.toLowerCase()) ?? null,
  readServerLorebook: async (name: string) => {
    host.reads.push(name);
    return host.disk.get(name) ?? null;
  },
}));

import { readLorebookEntries } from "./worldInfoFiles";

beforeEach(() => {
  host.listed = ["Ruins"];
  host.disk.clear();
  host.reads = [];
});

describe("readLorebookEntries (v2.5 plan 01 B)", () => {
  it("reads each comment's first entry from the server's file, with null for an entry that has no disable key", async () => {
    host.disk.set("Ruins", { entries: {
      0: { uid: 0, comment: " CP1 ", disable: true },
      1: { uid: 1, comment: "CP1", disable: false },
      2: { uid: 2, comment: "CP2", disable: false },
      3: { uid: 3, comment: "CP3" },
      4: { uid: 4, comment: "" },
    } });
    expect(await readLorebookEntries("ruins")).toEqual(new Map([["CP1", true], ["CP2", false], ["CP3", null]]));
    expect(host.reads).toEqual(["Ruins"]);
  });

  it("never asks the server for a book that is not listed (the dummy would read as an empty book)", async () => {
    host.disk.set("Gone", { entries: {} });
    expect(await readLorebookEntries("Gone")).toBeNull();
    expect(host.reads).toEqual([]);
  });

  it("answers null when the server's copy cannot be read", async () => {
    expect(await readLorebookEntries("Ruins")).toBeNull();
  });
});
