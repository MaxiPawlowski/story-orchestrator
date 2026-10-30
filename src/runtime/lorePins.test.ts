import type { HostScannableEntry } from "@services/STAPI";
import { parseStory } from "@engine/validate";
import { codexEntryKey, type BoundaryLogEntry } from "@engine/index";
import { lorePinBindings, lorePinPlan, pinLore, roundBoundaries, type LorePinDeps } from "./lorePins";
import { mintToken, tokenMatches, type RunContext, type RunOwnership } from "./runToken";
import { sanitizeGlobalSettings } from "./settingsModel";
import { groundingRaw, groundingStory, playGrounding } from "../../test/support/groundingStory";

const entry = (comment: string, patch: Partial<HostScannableEntry> = {}): HostScannableEntry => ({ world: "Lab World", uid: comment.length, comment, content: `${comment} lore.`, ...patch } as HostScannableEntry);

const log = (rows: Array<[number, number]>): BoundaryLogEntry[] => rows.map(([boundary, lastMessageId]) => ({ boundary, context: { lastMessageId, chatLength: lastMessageId + 1 } }) as unknown as BoundaryLogEntry);

const createRunOwnership = (): RunOwnership & { invalidate: () => void } => {
  let current: RunContext = { chatId: "chat", storyId: "s1", storyHash: "h1", sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  return {
    mint: (window = null) => mintToken(current, window),
    check: (token) => tokenMatches(current, token),
    invalidate: () => { current = { ...current, sessionEpoch: current.sessionEpoch + 1 }; },
  };
};

const user = { is_user: true };
const reply = { is_user: false };

describe("v3.0 34 S2 lore pins: the authored binding", () => {
  test("place_lore and people_lore are validated against the story's own books, location values and People ids", () => {
    expect(Array.isArray(parseStory(groundingRaw()))).toBe(false);
    const errors = (patch: Record<string, unknown>) => {
      const parsed = parseStory(groundingRaw({ requirements: { lorebooks: ["Lab World"], ...patch } }));
      return Array.isArray(parsed) ? parsed.map((error) => error.path) : [];
    };
    expect(errors({ place_lore: { harbor: { book: "Other Book", entry: "Harbor" } } })).toEqual(["requirements.place_lore.harbor.book"]);
    expect(errors({ place_lore: { docks: { book: "Lab World", entry: "Docks" } } })).toEqual(["requirements.place_lore.docks"]);
    expect(errors({ place_lore: { harbor: { book: "Lab World" } } })).toEqual(["requirements.place_lore.harbor.entry"]);
    expect(errors({ place_lore: { harbor: { book: "Lab World", entry: "Harbor", keys: ["x"] } } })).toEqual(["requirements.place_lore.harbor.keys"]);
    expect(errors({ people_lore: { stranger: { book: "Lab World", entry: "Stranger" } } })).toEqual(["requirements.people_lore.stranger"]);
    const noLocation = parseStory(groundingRaw({ qualities: [{ key: "met_wren", type: "bool", source: "extractor", rubric: "Met." }, { key: "found_crypt", type: "bool", source: "extractor", rubric: "Found." }], codex: undefined, requirements: { lorebooks: ["Lab World"], place_lore: { harbor: { book: "Lab World", entry: "Harbor" } } } }));
    expect(Array.isArray(noLocation) ? noLocation.map((error) => error.path) : []).toEqual(["requirements.place_lore"]);
  });

  test("the install switch is on by default", () => {
    expect(sanitizeGlobalSettings(undefined).worldInfo.lorePins).toBe(true);
    expect(sanitizeGlobalSettings({ worldInfo: { lorePins: false } }).worldInfo.lorePins).toBe(false);
  });
});

describe("v3.0 34 S2 lore pins: what is pinned", () => {
  const story = groundingStory();

  test("a round is the boundaries since the player's last message, or the exchange before it until a reply lands", () => {
    const rows = [user, reply, reply, user, reply];
    expect([...roundBoundaries(log([[1, 1], [2, 2], [3, 4]]), rows)]).toEqual([3]);
    expect([...roundBoundaries(log([[1, 1], [2, 2]]), [...rows.slice(0, 4)])]).toEqual([1, 2]);
    expect([...roundBoundaries(log([[1, 1]]), [reply, reply])]).toEqual([1]);
  });

  test("the current place is pinned; a place whose page is unknown is not", () => {
    expect(lorePinBindings(story, { location: "harbor", [codexEntryKey("places", "harbor")]: 1 }, new Set())).toEqual([{ book: "Lab World", entry: "Harbor", reason: "here" }]);
    expect(lorePinBindings(story, { location: "harbor" }, new Set())).toEqual([]);
    expect(lorePinBindings(story, { location: "crypt" }, new Set())).toEqual([]);
    expect(lorePinBindings(story, { location: "market" }, new Set())).toEqual([{ book: "Lab World", entry: "Market", reason: "here" }]);
  });

  test("a person or place latched in this round is pinned, an older latch is not", () => {
    const values = { location: "market", [codexEntryKey("people", "wren")]: 3, [codexEntryKey("places", "crypt")]: 2, found_crypt: true };
    expect(lorePinBindings(story, values, new Set([3])).map((pin) => pin.entry)).toEqual(["Market", "Wren"]);
    expect(lorePinBindings(story, values, new Set([2, 3])).map((pin) => pin.entry)).toEqual(["Market", "Crypt", "Wren"]);
    expect(lorePinBindings(story, values, new Set([5])).map((pin) => pin.entry)).toEqual(["Market"]);
  });

  test("the gate wins, a secret is refused, a missing entry is skipped, and the forced copy is the scan's own object", () => {
    const harbor = entry("Harbor");
    const keys = Object.keys(harbor).sort();
    const plan = lorePinPlan([harbor, entry("Crypt", { disable: true }), entry("Wren", { content: "Wren is the smuggler." })], [
      { book: "Lab World", entry: "Harbor", reason: "here" }, { book: "lab world", entry: "Crypt", reason: "met" },
      { book: "Lab World", entry: "Wren", reason: "met" }, { book: "Lab World", entry: "Gone", reason: "met" },
    ], (text) => text.includes("smuggler"));
    expect(plan.entries).toEqual([harbor]);
    expect(plan.entries[0]).toBe(harbor);
    expect(Object.keys(harbor).sort()).toEqual(keys);
    expect(plan.refused.map((row) => `${row.entry}:${row.reason}`)).toEqual(["Crypt:switched-off", "Wren:secret", "Gone:missing"]);
  });

  test("floor D: over 40 cuts no pinned entry is gated off or restates a secret", () => {
    let pinnedBad = 0;
    for (let cut = 0; cut < 40; cut += 1) {
      const scan = ["Harbor", "Market", "Crypt", "Wren"].map((comment, index) => entry(comment, {
        disable: (cut + index) % 3 === 0, content: (cut * 7 + index) % 4 === 0 ? `${comment} hides the key.` : `${comment} lore.`,
      }));
      const values = { location: ["harbor", "market", "crypt"][cut % 3], found_crypt: cut % 2 === 0, [codexEntryKey("people", "wren")]: cut % 5, [codexEntryKey("places", "crypt")]: cut % 4 };
      const plan = lorePinPlan(scan, lorePinBindings(story, values, new Set([cut % 5, cut % 4])), (text) => text.includes("hides"));
      pinnedBad += plan.entries.filter((pinned) => pinned.disable === true || String(pinned.content).includes("hides")).length;
    }
    expect(pinnedBad).toBe(0);
  });
});

describe("v3.0 34 S2 lore pins: the force", () => {
  const story = groundingStory();
  const engine = playGrounding(story, [{ set: { location: "harbor" }, messageId: 1 }]);
  const deps = (patch: Partial<LorePinDeps> = {}): LorePinDeps & { forced: HostScannableEntry[][] } => {
    const forced: HostScannableEntry[][] = [];
    return {
      forced,
      enabled: () => true, chatId: () => "chat", ownedChat: () => "chat", story: () => story,
      values: () => engine.serialize().blackboard.values, log: () => engine.stateLog, rows: () => [user, reply],
      scannable: async () => [entry("Harbor")], force: async (entries) => { forced.push(entries); return { ok: true, entries: entries.length }; },
      restatesSecret: () => false, ownership: createRunOwnership(), ...patch,
    };
  };

  test("pins the current place once through the force path", async () => {
    const live = deps();
    const plan = await pinLore(live, false);
    expect(plan?.pinned.map((pin) => pin.comment)).toEqual(["Harbor"]);
    expect(live.forced.map((batch) => batch.map((row) => row.comment))).toEqual([["Harbor"]]);
  });

  test("withheld runs, a switched-off install and another chat force nothing", async () => {
    for (const [live, withheld] of [[deps(), true], [deps({ enabled: () => false }), false], [deps({ ownedChat: () => "other" }), false]] as const) {
      expect(await pinLore(live, withheld)).toBeNull();
      expect(live.forced).toEqual([]);
    }
  });

  test("a run that lapses while the entries load forces nothing", async () => {
    const ownership = createRunOwnership();
    const live = deps({ ownership, scannable: async () => { ownership.invalidate(); return [entry("Harbor")]; } });
    expect(await pinLore(live, false)).toBeNull();
    expect(live.forced).toEqual([]);
  });

  test("a refused force reads as nothing pinned", async () => {
    const live = deps({ force: async () => ({ ok: false, reason: "no event" }) });
    expect((await pinLore(live, false))?.pinned).toEqual([]);
  });
});
