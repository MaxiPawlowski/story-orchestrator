import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { parseStoryV2OrThrow, type NormalizedStoryV2, type PrimitiveValue } from "@engine/index";
import { heldSecrets, keptFrom } from "../heldSecrets";
import type { EpistemicEntry } from "../types";
import { hearsayLines, rumorAuthorRows } from "./lines";
import { occurrenceIdOf, spreadRumors, type SpreadInput } from "./spread";
import { createRumors, rollbackRumors, sanitizeRumors } from "./state";
import type { RumorsState } from "./types";

type Raw = Record<string, unknown>;

const story = (patch: (raw: Raw & { roster: Raw[]; rumors: Raw[] }) => void = () => undefined): NormalizedStoryV2 => {
  const raw = {
    format: 2, id: "rumor-mill", title: "Rumor mill", description: "plan 44",
    qualities: [
      { key: "mill_burned", type: "bool", source: "extractor", rubric: "Did the mill burn?" },
      { key: "confess", type: "bool", source: "extractor", rubric: "Did Bryn confess?" },
      { key: "party_location", type: "enum", source: "extractor", values: ["square", "forest"], rubric: "Where?" },
      { key: "evening", type: "bool", source: "extractor", rubric: "Evening?" },
    ],
    checkpoints: [{ id: "a", name: "A", objective: "", type: "anchor", start: true }],
    transitions: [],
    roster: [
      { id: "bryn", name: "Bryn", gossip: { talks_to: ["tam", "cora"], contact: "any", delay: { boundaries: [1, 2] } } },
      { id: "tam", name: "Tam", gossip: { talks_to: ["ula"], contact: "any", delay: { boundaries: [0, 1] } } },
      { id: "ula", name: "Ula", gossip: { talks_to: ["vik"], contact: "any", delay: { boundaries: [0, 0] } } },
      { id: "vik", name: "Vik" },
      { id: "cora", name: "Cora" },
    ],
    rumors: [{
      id: "mill-fire", from: "bryn", claim: "the old mill burned down",
      versions: [{ text: "the old mill burned down", truth: "true", weight: 3 }, { text: "someone set the old mill ablaze", truth: "false", weight: 1 }],
      starts_when: { q: "mill_burned", op: "==", v: true },
    }],
  } as Raw & { roster: Raw[]; rumors: Raw[] };
  patch(raw);
  return parseStoryV2OrThrow(raw);
};

const NAMES = (s: NormalizedStoryV2) => (id: string) => s.roster.find((member) => member.id === id)?.name ?? id;

const secretChecker = (s: NormalizedStoryV2, epistemic: EpistemicEntry[], state: RumorsState) => {
  const names = (id: string) => [NAMES(s)(id)];
  const secrets = heldSecrets(epistemic, s.roster.map((member) => member.name ?? member.id),
    state.disclosures.map((row) => ({ entryId: row.entryId, names: names(row.member) })));
  return (text: string, member: string) => {
    const barred = secrets.filter((secret) => keptFrom(text, [secret], names(member)));
    return { barred: barred.length > 0, entryIds: barred.flatMap((secret) => (secret.entryId ? [secret.entryId] : [])) };
  };
};

interface RunOptions {
  s?: NormalizedStoryV2;
  chatId?: string;
  boundaries?: number;
  values?: (boundary: number) => Record<string, PrimitiveValue>;
  epistemic?: EpistemicEntry[];
  enabled?: string[];
  from?: { state: RumorsState; boundary: number };
}

const burned = (boundary: number): Record<string, PrimitiveValue> => ({ mill_burned: boundary >= 2 });

const run = (options: RunOptions = {}) => {
  const s = options.s ?? story();
  let state = options.from?.state ?? createRumors();
  const states: RumorsState[] = [];
  const start = (options.from?.boundary ?? 0) + 1;
  for (let boundary = start; boundary <= (options.boundaries ?? 12); boundary += 1) {
    const input: SpreadInput = {
      state, net: s.rumorNet as NonNullable<NormalizedStoryV2["rumorNet"]>, life: s.life?.members ?? [], values: (options.values ?? burned)(boundary),
      at: { boundary, messageId: boundary * 2 }, chatId: options.chatId ?? "chat-1", storyId: "rumor-mill", enabled: options.enabled ?? ["bryn", "tam", "ula", "vik", "cora"],
      secretFor: secretChecker(s, options.epistemic ?? [], state), revision: { swipeId: null, hash: `h${boundary}` }, horizonMessageId: null,
    };
    state = spreadRumors(input).state;
    states[boundary] = state;
  }
  return { state, states, s };
};

const holders = (state: RumorsState) => state.events.filter((event) => event.landedAt).map((event) => event.to);

describe("plan 44 stage 1: rumors spread in code along authored channels", () => {
  it("starts with its origin only once starts_when holds, then lands each hop inside its delay window", () => {
    const { states } = run();
    expect(states[1].events).toEqual([]);
    expect(states[2].events.map((event) => [event.to, event.hop])).toEqual([["bryn", 0], ["tam", 1], ["cora", 1]]);
    for (const event of states[12].events.filter((entry) => entry.hop === 1)) {
      const lag = (event.landedAt?.boundary ?? 0) - event.scheduledAt.boundary;
      expect(lag).toBeGreaterThanOrEqual(1);
      expect(lag).toBeLessThanOrEqual(2);
    }
  });

  it("stops at the hop limit and never hands a member the same rumor twice", () => {
    const { state } = run();
    expect(holders(state).sort()).toEqual(["bryn", "cora", "tam", "ula"]);
    expect(state.events.some((event) => event.to === "vik")).toBe(false);
    expect(new Set(state.events.map((event) => event.to)).size).toBe(state.events.length);
  });

  it("writes hearsay with the teller and a stance, never the truth flag", () => {
    const { state, s } = run();
    const row = state.hearsay.find((entry) => entry.receiver === "tam");
    expect(row).toMatchObject({ teller: "bryn", rumorId: "mill-fire", stance: "unsure" });
    expect(JSON.stringify(state)).not.toMatch(/"truth"/);
    const lines = hearsayLines(state, "tam", NAMES(s));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^- Bryn told you: (the old mill burned down|someone set the old mill ablaze) \(you are not sure of it; hearsay, it may be wrong\)$/);
    expect(hearsayLines(state, "vik", NAMES(s))).toEqual([]);
    expect(rumorAuthorRows(state, s.rumorNet, NAMES(s)).map((entry) => entry.status)).toEqual(["origin", "landed", "landed", "landed"]);
  });

  it("lands at most three hops a boundary; the rest wait for the next", () => {
    const s = story((raw) => { raw.roster[0].gossip = { talks_to: ["tam", "ula", "vik", "cora"], contact: "any", delay: { boundaries: [0, 0] } }; });
    const { states } = run({ s, boundaries: 3 });
    expect(states[2].events.filter((event) => event.landedAt && event.hop === 1)).toHaveLength(3);
    expect(states[3].events.filter((event) => event.landedAt && event.hop === 1)).toHaveLength(4);
  });

  it("together needs both schedules at one place, whatever the party's location; any reaches them anywhere", () => {
    const s = story((raw) => {
      raw.roster[0].schedule = [{ when: { q: "evening", op: "==", v: true }, at: "the inn" }, { when: { q: "evening", op: "==", v: false }, at: "the forge" }];
      raw.roster[1].schedule = [{ when: { q: "evening", op: "==", v: true }, at: "The Inn" }, { when: { q: "evening", op: "==", v: false }, at: "the farm" }];
      raw.roster[0].gossip = { talks_to: ["tam"], contact: "together", delay: { boundaries: [0, 0] } };
    });
    const day = run({ s, boundaries: 4, values: (boundary) => ({ ...burned(boundary), evening: false, party_location: "forest" }) });
    expect(holders(day.state)).toEqual(["bryn"]);
    const evening = run({ s, boundaries: 4, values: (boundary) => ({ ...burned(boundary), evening: boundary >= 4, party_location: "forest" }) });
    expect(holders(evening.state)).toEqual(["bryn", "tam"]);
  });

  it("a member outside the group never sends or receives", () => {
    expect(holders(run({ enabled: ["bryn", "ula", "vik", "cora"] }).state).sort()).toEqual(["bryn", "cora"]);
    expect(run({ enabled: ["tam", "ula"] }).state.events).toEqual([]);
  });
});

describe("plan 44 G1, G2, G13: determinism and rollback by message", () => {
  it.each(["chat-1", "chat-2", "chat-3", "chat-4"])("G1 %s: two runs draw the same events, delays, versions and stances", (chatId) => {
    expect(run({ chatId }).state).toEqual(run({ chatId }).state);
  });

  it("occurrence ids are stable over their parts and differ with any part", () => {
    const parts = { chatId: "c", storyId: "s", rumorId: "r", from: "a", to: "b", hop: 1, parent: "o1" };
    expect(occurrenceIdOf(parts)).toBe(occurrenceIdOf({ ...parts }));
    for (const key of Object.keys(parts) as Array<keyof typeof parts>) {
      expect(occurrenceIdOf({ ...parts, [key]: key === "hop" ? 2 : `${String(parts[key])}x` })).not.toBe(occurrenceIdOf(parts));
    }
  });

  it("versions follow their weights across chats", () => {
    const versions = Array.from({ length: 40 }, (_, index) => run({ chatId: `chat-${index}` }).state.events.filter((event) => event.hop > 0).map((event) => event.version)).flat();
    expect(versions.filter((version) => version === 0).length).toBeGreaterThan(versions.filter((version) => version === 1).length);
    expect(versions).toContain(1);
  });

  it.each([1, 2, 3, 4])("G2/G13 seed %i: rollback to any message equals the run up to it, and replay re-lands at the same due points", (seed) => {
    const chatId = `seed-${seed}`;
    const { states } = run({ chatId, boundaries: 14 });
    for (let message = 1; message <= 28; message += 1) {
      const kept = Math.floor((message - 1) / 2);
      const rolled = rollbackRumors(states[14], message);
      expect(rolled).toEqual(kept ? states[kept] : createRumors());
      const replay = run({ chatId, boundaries: 14, from: { state: rolled, boundary: kept } });
      expect(replay.state).toEqual(states[14]);
    }
  });

  it("G13: a hop scheduled before the cut and landed after it goes back to pending with its hearsay removed", () => {
    const { states } = run({ boundaries: 6 });
    const landed = states[6].events.find((event) => event.hop === 1 && event.landedAt && event.landedAt.boundary > event.scheduledAt.boundary);
    expect(landed).toBeDefined();
    const cut = (landed?.landedAt?.messageId ?? 0);
    const rolled = rollbackRumors(states[6], cut);
    const back = rolled.events.find((event) => event.occurrenceId === landed?.occurrenceId);
    expect(back?.landedAt).toBeUndefined();
    expect(back?.due).toEqual(landed?.due);
    expect(rolled.hearsay.some((row) => row.occurrenceId === landed?.occurrenceId)).toBe(false);
  });

  it("sanitize keeps well-formed rows only", () => {
    const { state } = run();
    expect(sanitizeRumors(JSON.parse(JSON.stringify(state)))).toEqual(state);
    expect(sanitizeRumors({ events: [{}], hearsay: [{ receiver: 1 }], disclosures: [{}], settled: [3, "a:b"] })).toEqual({ events: [], hearsay: [], disclosures: [], settled: ["a:b"] });
    expect(sanitizeRumors(null)).toEqual(createRumors());
  });
});

const hiding = (from: string, content: string): EpistemicEntry =>
  ({ id: `secret-${from.replace(/\W/g, "")}`, subject: "Bryn", tag: "hiding", hiddenFrom: from, content, messageId: 1, createdAt: 1, provenance: { validity: "live" } }) as unknown as EpistemicEntry;

describe("plan 44 G3, G4, G11: secrets travel only by an authored leak, to one recipient", () => {
  const secret = hiding("Tam, Cora", "that the old mill burned down by her own hand");

  it("G3: a member kept from the secret never gets a hop that restates it, and nobody downstream of them does", () => {
    const { state } = run({ epistemic: [secret] });
    expect(holders(state).sort()).toEqual(["bryn"]);
    expect(state.hearsay).toEqual([]);
  });

  it("G3 property: over generated channels, a barred member never holds a hearsay row restating the secret", () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const ids = ["bryn", "tam", "ula", "vik", "cora"];
      const pick = (offset: number) => ids.filter((id, index) => id !== ids[offset] && (seed + index * 7 + offset * 3) % 3 !== 0);
      const s = story((raw) => raw.roster.forEach((member, index) => { member.gossip = { talks_to: pick(index).length ? pick(index) : [ids[(index + 1) % 5]], contact: "any", delay: { boundaries: [0, seed % 3] } }; }));
      const barred = ids.filter((_, index) => index > 0 && (seed >> index) % 2 === 1);
      const planted = barred.length ? [hiding(barred.map((id) => NAMES(s)(id)).join(", "), "that the old mill burned down by her own hand")] : [];
      const { state } = run({ s, chatId: `p-${seed}`, epistemic: planted });
      const secrets = heldSecrets(planted, s.roster.map((member) => member.name ?? member.id));
      const leaks = state.hearsay.filter((row) => barred.includes(row.receiver) && keptFrom(row.claim, secrets, [NAMES(s)(row.receiver)]));
      expect({ seed, leaks }).toEqual({ seed, leaks: [] });
      if (barred.length) expect(keptFrom("the old mill burned down", secrets, [NAMES(s)(barred[0])])).toBe(true);
      expect(state.hearsay.filter((row) => barred.includes(row.receiver))).toEqual([]);
    }
  });

  it("G4: a leak reaches its one named member, is marked a leak and records the disclosure", () => {
    const s = story((raw) => { raw.rumors[0].leaks_to = [{ member: "tam", when: { q: "confess", op: "==", v: true } }]; });
    const { state } = run({ s, epistemic: [secret], values: (boundary) => ({ ...burned(boundary), confess: boundary >= 5 }) });
    const leak = state.events.find((event) => event.to === "tam");
    expect(leak).toMatchObject({ leak: true, from: "bryn" });
    expect(leak?.landedAt).toBeDefined();
    expect(state.disclosures).toEqual([{ entryId: secret.id, member: "tam", occurrenceId: leak?.occurrenceId, at: leak?.landedAt }]);
    expect(holders(state)).not.toContain("cora");
  });

  it("G11: after the leak only the recipient is a knower; every other barred member stays barred, and so does the resting view", () => {
    const s = story((raw) => { raw.rumors[0].leaks_to = [{ member: "tam", when: { q: "confess", op: "==", v: true } }]; });
    const { state } = run({ s, epistemic: [secret], values: (boundary) => ({ ...burned(boundary), confess: boundary >= 5 }) });
    const secrets = heldSecrets([secret], ["Bryn", "Tam", "Ula", "Vik", "Cora"], state.disclosures.map((row) => ({ entryId: row.entryId, names: [NAMES(s)(row.member)] })));
    const text = "Bryn burned down the old mill by her own hand.";
    expect(keptFrom(text, secrets, ["Tam"])).toBe(false);
    expect(keptFrom(text, secrets, ["Cora"])).toBe(true);
    expect(keptFrom(text, secrets, null)).toBe(true);
    expect(heldSecrets([secret], ["Bryn", "Tam", "Cora"]).every((entry) => keptFrom(text, [entry], ["Tam"]))).toBe(true);
    const rolled = rollbackRumors(state, state.disclosures[0].at.messageId);
    expect(rolled.disclosures).toEqual([]);
  });

  it("an unaware secret disclosed to its subject stops barring that subject only", () => {
    const unaware = { id: "u-tam", subject: "Tam", tag: "unaware", content: "that the old mill burned down by her own hand", messageId: 1, createdAt: 1, provenance: { validity: "live" } } as unknown as EpistemicEntry;
    const before = heldSecrets([unaware], ["Bryn", "Tam"]);
    const after = heldSecrets([unaware], ["Bryn", "Tam"], [{ entryId: "u-tam", names: ["Tam"] }]);
    const text = "the old mill burned down by her own hand";
    expect(keptFrom(text, before, ["Tam"])).toBe(true);
    expect(keptFrom(text, after, ["Tam"])).toBe(false);
    expect(keptFrom(text, after, null)).toBe(true);
    expect(keptFrom(text, after, ["Bryn"])).toBe(false);
  });
});

describe("plan 44 G5: no Math.random, no memory-id seed, no World Info write", () => {
  const files = [...readdirSync(join(__dirname)).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts")).map((name) => join(__dirname, name)),
    join(__dirname, "../../engine/validate/rumors.ts"), join(__dirname, "../../runtime/rumorPort.ts")];
  it.each(files.map((file) => [file.replace(/\\/g, "/").replace(/^.*src\//, "src/"), file]))("%s draws only seeded chance and writes no lorebook", (_label, file) => {
    const source = readFileSync(file, "utf8");
    expect(source).not.toMatch(/Math\.random|generateMemoryId|crypto\.randomUUID|upsertWIEntry|saveWorldInfo|worldInfo/);
  });
});
