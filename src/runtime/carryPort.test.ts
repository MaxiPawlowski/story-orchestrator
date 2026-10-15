import { readFileSync } from "fs";
import { join } from "path";
import { parseStoryV2OrThrow, PREVIOUSLY_BOUNDARIES, type CarryState } from "@engine/index";
import { INJECTION_REGISTRY } from "@constants/injectionRegistry";
import { carryKnown, carrySlice, carryStartSeed, createPreviouslyNotice, previouslyBlock, PREVIOUSLY_HEADER } from "./carryPort";
import { createExtras, restartCarry, restartedExtras } from "./extras";
import { defaultGlobalSettings } from "./settingsModel";
import { CARRY_REQUIRED_CHECK } from "./checksGame";
import type { RuntimeSnapshot } from "./types";

const raw = () => JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/carry-sequel.story.json"), "utf8")) as Record<string, unknown>;
const SEQUEL = parseStoryV2OrThrow(raw());
const settings = () => defaultGlobalSettings();

const carry = (patch: Partial<CarryState> = {}): CarryState => ({
  fromChat: "a", fromStory: "ngp-source", sourceStoryHash: "h", mode: "sequel", createdAt: "t", previously: "\"The Lantern Coast\" ended with \"The Last Lantern\".",
  projection: { storyTitle: "The Lantern Coast", endingTitle: "The Last Lantern", outcome: [], lines: [] },
  values: [
    { from: "coast_fate", key: "heritage_coast", as: "heritage", value: "lit", label: "You relit the Lantern Coast.", knownBy: ["mara"] },
    { from: "coins", key: "heritage_coins", as: "heritage", value: 7, label: "Coins: 7", knownBy: ["mara", "kel", "narrator"] },
    { from: "rep_guild", key: "guild_trust", as: "state", value: 3, label: "The Lamplighters: Trusted", knownBy: [] },
  ],
  ...patch,
});

const extrasWith = (slice?: CarryState, chapters = 0) => {
  const extras = createExtras(settings);
  if (slice) extras.carry = slice;
  extras.memory.chapters = Array.from({ length: chapters }, () => ({}) as never);
  return extras;
};

describe("v2.8 plan 45 N5: the Previously block has a bounded life", () => {
  it("is present until the first of: the first seal, 12 boundaries, or dismiss", () => {
    const at = (boundary: number, slice = carry(), chapters = 0) => previouslyBlock(carrySlice(SEQUEL, extrasWith(slice, chapters), boundary));
    for (let boundary = 0; boundary < PREVIOUSLY_BOUNDARIES; boundary += 1) expect(at(boundary)).toBe(`${PREVIOUSLY_HEADER}\n${carry().previously}`);
    expect(at(PREVIOUSLY_BOUNDARIES)).toBeNull();
    expect(at(3, carry(), 1)).toBeNull();
    expect(at(3, carry({ dismissed: true }))).toBeNull();
    expect(at(0, carry({ previously: null }))).toBeNull();
    const chapterless = parseStoryV2OrThrow({ ...raw(), chapters: undefined });
    expect(previouslyBlock(carrySlice(chapterless, extrasWith(carry()), 12))).toBeNull();
  });

  it("is injected for a loud generation and withheld from quiet and impersonate; closing clears it", () => {
    const writes: string[] = [];
    const notice = createPreviouslyNotice({
      block: () => "Previously: x", set: (key, text, depth) => writes.push(`set ${key} ${depth} ${text}`), clear: (key) => writes.push(`clear ${key}`),
    });
    notice.opened("normal");
    notice.closed();
    notice.opened("quiet");
    notice.opened("impersonate");
    notice.closed();
    const key = INJECTION_REGISTRY.previously.key;
    expect(writes).toEqual([`set ${key} 4 Previously: x`, `clear ${key}`]);
  });
});

describe("v2.8 plan 45: start seed, private lines, restart", () => {
  it("seeds the kept values and journals each dropped one (N4)", () => {
    const edited = parseStoryV2OrThrow({ ...raw(), qualities: (raw().qualities as Array<Record<string, unknown>>).filter((quality) => quality.key !== "guild_trust"),
      carry_from: { ...(raw().carry_from as Record<string, unknown>), map: (raw().carry_from as { map: Array<Record<string, unknown>> }).map.filter((entry) => entry.to !== "guild_trust") } });
    const extras = extrasWith(carry());
    const journal: string[] = [];
    expect(carryStartSeed(edited, extras, (summary, note) => journal.push(`${summary} | ${note}`))).toEqual({ heritage_coast: "lit", heritage_coins: 7 });
    expect(journal).toEqual(["carried value dropped: guild_trust | 'guild_trust' is no longer carried by this story"]);
    expect((extras.carry as CarryState).values.map((value) => value.key)).toEqual(["heritage_coast", "heritage_coins"]);
    expect(carryStartSeed(SEQUEL, extrasWith(), () => undefined)).toEqual({});
  });

  it("gives a known_by line only to the named members", () => {
    const extras = extrasWith(carry());
    expect(carryKnown(extras, "kel")).toEqual(["- From an earlier story, you know: Coins: 7"]);
    expect(carryKnown(extras, "tom")).toEqual([]);
  });

  it("Restart keeps the pinned carry, and a declined start stays declined", () => {
    const kept = restartedExtras(restartCarry(extrasWith(carry()), "pier", 3), settings);
    expect(kept.carry).toEqual(carry());
    const declined = createExtras(settings);
    declined.carry = { declined: true, at: "t" };
    expect(restartedExtras(restartCarry(declined, "pier", 0), settings).carry).toEqual({ declined: true, at: "t" });
    expect(restartedExtras(restartCarry(createExtras(settings), "pier", 0), settings).carry).toBeUndefined();
  });

  it("carry-required blocks while a required story has no run picked", () => {
    const required = parseStoryV2OrThrow({ ...raw(), carry_from: { ...(raw().carry_from as Record<string, unknown>), default: "require" } });
    const snapshotOf = (slice?: CarryState, boundary = 0) => ({ carry: carrySlice(required, extrasWith(slice), boundary) }) as unknown as RuntimeSnapshot;
    expect(CARRY_REQUIRED_CHECK.detect(snapshotOf())?.player).toMatch(/pick that run in the start pane/);
    expect(CARRY_REQUIRED_CHECK.detect(snapshotOf(undefined, 2))?.player).toMatch(/Restart it to pick one/);
    expect(CARRY_REQUIRED_CHECK.detect(snapshotOf(carry()))).toBeNull();
    expect(CARRY_REQUIRED_CHECK.detect({ carry: carrySlice(SEQUEL, extrasWith(), 0) } as unknown as RuntimeSnapshot)).toBeNull();
  });
});
