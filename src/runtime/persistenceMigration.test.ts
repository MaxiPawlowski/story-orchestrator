import { readFileSync } from "node:fs";
import { join } from "node:path";
import { migrateMetadataBlob, migrateV3ToV4 } from "./persistenceMigration";
import type { StoryLibraryRecord } from "./types";

const record = (over: Partial<StoryLibraryRecord> = {}): StoryLibraryRecord => ({
  id: "sun-ruins",
  version: 2,
  hash: "v2-newhash",
  title: "Quest for the Sun Ruins",
  description: "",
  raw: { format: 2, id: "sun-ruins", version: 2, title: "Quest for the Sun Ruins" },
  importedAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  ...over,
});

const legacyBlob = (over: Record<string, unknown> = {}) => ({
  version: 2,
  selectedStoryHash: "v2-oldhash",
  stories: {
    "v2-oldhash": {
      storyHash: "v2-oldhash",
      storyTitle: "Quest for the Sun Ruins",
      engineState: { boundary: 4, activeCheckpointId: "cp2" },
      extras: { updatedAt: "2026-08-01T00:00:00.000Z" },
    },
  },
  ...over,
});

describe("migrateMetadataBlob", () => {
  it("ignores anything that is not a v2 blob", () => {
    expect(migrateMetadataBlob(null)).toBeNull();
    expect(migrateMetadataBlob({ version: 3, stories: {} })).toBeNull();
    expect(migrateMetadataBlob({ version: 2 })).toBeNull();
  });

  it("rekeys hash-keyed state to the library id and pins the story", () => {
    const blob = migrateMetadataBlob(legacyBlob(), [record({ hash: "v2-oldhash" })]);
    // v2.3 plan 03: the v2 path now ends by calling migrateV3ToV4, so it lands on v4 directly.
    // A pre-v4 blob cannot say which chat it came from, so the stamp is null rather than guessed.
    expect(blob?.version).toBe(4);
    expect(blob?.chatId).toBeNull();
    expect(blob?.selectedStoryId).toBe("sun-ruins");
    expect(Object.keys(blob!.stories)).toEqual(["sun-ruins"]);
    expect(blob!.stories["sun-ruins"]).toMatchObject({ storyId: "sun-ruins", playedVersion: 2, contentHashAtLoad: "v2-oldhash" });
    expect(blob!.stories["sun-ruins"].pinnedStory).toEqual(record().raw);
    expect(blob!.stories["sun-ruins"].engineState).toMatchObject({ boundary: 4 });
  });

  it("falls back to the recorded title when the content hash changed", () => {
    const blob = migrateMetadataBlob(legacyBlob(), [record()]);
    expect(blob?.selectedStoryId).toBe("sun-ruins");
    expect(blob!.stories["sun-ruins"].pinnedStory).toEqual(record().raw);
  });

  it("keeps unresolvable state under a legacy id with nothing pinned", () => {
    const blob = migrateMetadataBlob(legacyBlob(), []);
    expect(blob?.selectedStoryId).toBe("legacy-v2-oldhash");
    expect(blob!.stories["legacy-v2-oldhash"].pinnedStory).toBeNull();
    expect(blob!.stories["legacy-v2-oldhash"].storyTitle).toBe("Quest for the Sun Ruins");
  });

  it("carries a null selection through", () => {
    const blob = migrateMetadataBlob(legacyBlob({ selectedStoryHash: null }), [record()]);
    expect(blob?.selectedStoryId).toBeNull();
  });
});

describe("v3 blobs reach v4 without a history", () => {
  it("migrates a captured v3 blob and puts every record under the history floor", () => {
    // test/fixtures/v3-chat-blob.json is a REAL v3 blob (the shipped v2 -> v3 migration run over a
    // real chat's metadata, provenance in the file). v2.3 plan 04: a record that arrives without
    // `engineHistory` can only roll back from the point it was saved, permanently, until Restart.
    const fixture = JSON.parse(readFileSync(join(__dirname, "../../test/fixtures/v3-chat-blob.json"), "utf-8"));
    const migrated = migrateV3ToV4(fixture.blob);
    expect(migrated?.version).toBe(4);
    const records = Object.values(migrated?.stories ?? {});
    expect(records.length).toBeGreaterThan(0);
    for (const record of records) {
      expect(record.engineHistory).toBeUndefined();
      expect(record.engineState.boundary).toBeGreaterThanOrEqual(0);
    }
  });
});
