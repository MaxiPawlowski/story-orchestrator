import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseStoryV2OrThrow } from "@engine/index";
import type { ExpansionCacheEntry, ExpansionRuntimeState } from "@generation/index";
import { ExpansionCoordinator } from "./expansionCoordinator";

const root = join(__dirname, "..", "..", "..");
const raw = JSON.parse(readFileSync(join(root, "test/fixtures/background-generation.story.json"), "utf-8"));
const story = parseStoryV2OrThrow(raw);
const kept = story.qualities[0].key;

const entry = (basis: Record<string, string | number | boolean>): ExpansionCacheEntry => ({
  key: "road-to-wendhope->on-the-road->at-the-walls",
  status: "stale",
  basis,
} as unknown as ExpansionCacheEntry);

describe("T4-4: Keep prunes a removed quality from the expansion cache (T4-4-2 x-state-A-after-keep.json, nonZero.extras.expansion)", () => {
  const harness = (entries: Record<string, ExpansionCacheEntry>) => {
    const store: ExpansionRuntimeState = { entries, scheduler: { queueDepth: 0, inFlight: false, lastError: null } };
    const coordinator = new ExpansionCoordinator({ getExpansion: () => store, getStory: () => story } as never);
    return { coordinator, store };
  };

  it("drops the removed quality from every entry's basis and keeps the rest", () => {
    const { coordinator, store } = harness({ a: entry({ guild_reputation: 1, [kept]: true }) });
    expect(coordinator.pruneRemovedQualities(story)).toBe(1);
    expect(store.entries.a.basis).toEqual({ [kept]: true });
    expect(store.entries.a.status).toBe("stale");
  });

  it("control: a basis that names only the story's own qualities is left as it is", () => {
    const original = entry({ [kept]: true });
    const { coordinator, store } = harness({ a: original });
    expect(coordinator.pruneRemovedQualities(story)).toBe(0);
    expect(store.entries.a).toBe(original);
  });
});
