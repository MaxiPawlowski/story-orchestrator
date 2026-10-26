import { readFileSync } from "fs";
import { PREVIOUSLY_BOUNDARIES, type CarryState } from "@engine/carrySchema";
import { join } from "path";
import { parseStoryOrThrow } from "@engine/index";
import { INJECTION_REGISTRY } from "@constants/injectionRegistry";
import { carrySlice, type CarryView } from "./carryPort";
import { carryKnownLines } from "@engine/carry";
import { createAwayNotice } from "./awayNotice";
import { carryStartSeed, createExtras, restartCarry, restartedExtras } from "./extras";
import { defaultGlobalSettings } from "./settingsModel";

const raw = () => JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/carry-sequel.story.json"), "utf8")) as Record<string, unknown>;
const SEQUEL = parseStoryOrThrow(raw());
const settings = () => defaultGlobalSettings();

const carry = (patch: Partial<CarryState> = {}): CarryState => ({
  fromChat: "a", fromStory: "ngp-source", sourceStoryHash: "h", mode: "sequel", createdAt: "t", previously: "\"The Lantern Coast\" ended with \"The Last Lantern\".",
  block: "Previously: \"The Lantern Coast\" ended with \"The Last Lantern\".",
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

const previouslyBlock = (view: CarryView | null): string | null => (view?.active ? view.state?.block ?? null : null);

describe("v2.8 plan 45 N5: the Previously block has a bounded life", () => {
  it("is present until the first of: the first seal, 12 boundaries, or dismiss", () => {
    const at = (boundary: number, slice = carry(), chapters = 0) => previouslyBlock(carrySlice(SEQUEL, extrasWith(slice, chapters), boundary));
    for (let boundary = 0; boundary < PREVIOUSLY_BOUNDARIES; boundary += 1) expect(at(boundary)).toBe(carry().block);
    expect(at(PREVIOUSLY_BOUNDARIES)).toBeNull();
    expect(at(3, carry(), 1)).toBeNull();
    expect(at(3, carry({ dismissed: true }))).toBeNull();
    expect(at(0, carry({ previously: null, block: null }))).toBeNull();
    const chapterless = parseStoryOrThrow({ ...raw(), chapters: undefined });
    expect(previouslyBlock(carrySlice(chapterless, extrasWith(carry()), 12))).toBeNull();
  });

  it("is injected for a loud generation and withheld from quiet and impersonate; closing clears it", () => {
    const writes: string[] = [];
    const notice = createAwayNotice({
      line: () => "Previously: x", set: (key, text, depth) => writes.push(`set ${key} ${depth} ${text}`), clear: (key) => writes.push(`clear ${key}`),
    }, INJECTION_REGISTRY.previously);
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
    const edited = parseStoryOrThrow({ ...raw(), qualities: (raw().qualities as Array<Record<string, unknown>>).filter((quality) => quality.key !== "guild_trust"),
      carry_from: { ...(raw().carry_from as Record<string, unknown>), map: (raw().carry_from as { map: Array<Record<string, unknown>> }).map.filter((entry) => entry.to !== "guild_trust") } });
    const extras = extrasWith(carry());
    const journal: string[] = [];
    expect(carryStartSeed(edited, extras, null, { noteRecap: (summary, note) => journal.push(`${summary} | ${note}`) })).toEqual({ heritage_coast: "lit", heritage_coins: 7 });
    expect(journal).toEqual(["carried value dropped: guild_trust | 'guild_trust' is no longer carried by this story"]);
    expect((extras.carry as CarryState).values.map((value) => value.key)).toEqual(["heritage_coast", "heritage_coins"]);
    expect(carryStartSeed(SEQUEL, extrasWith(), null, { noteRecap: () => undefined })).toEqual({});
    expect(carryStartSeed(SEQUEL, extrasWith(carry()), { engineState: {} }, { noteRecap: () => undefined })).toEqual({});
  });

  it("gives a known_by line only to the named members", () => {
    const extras = extrasWith(carry());
    expect(carryKnownLines(extras.carry, "kel")).toEqual(["- From an earlier story, you know: Coins: 7"]);
    expect(carryKnownLines(extras.carry, "tom")).toEqual([]);
  });

  it("Restart keeps the pinned carry, and a declined start stays declined", () => {
    const kept = restartedExtras(restartCarry(extrasWith(carry()), "pier", 3), settings);
    expect(kept.carry).toEqual(carry());
    const declined = createExtras(settings);
    declined.carry = { declined: true, at: "t" };
    expect(restartedExtras(restartCarry(declined, "pier", 0), settings).carry).toEqual({ declined: true, at: "t" });
    expect(restartedExtras(restartCarry(createExtras(settings), "pier", 0), settings).carry).toBeUndefined();
  });
});
