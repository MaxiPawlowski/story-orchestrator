import * as recorded from "../../test/fixtures/t1-3-session-details.block.json";
import { buildMemoryInjection, labelMemoryBlock, SESSION_DETAILS_ROW_CAP, type InjectionOptions } from "./inject";
import type { MemoryEntry, MemoryTier } from "./types";

const RECORDED_BLOCK_CHARS = 2428;
const RECORDED_SESSION_BUDGET = 600;

const rows = (texts: string[]): MemoryEntry[] => texts.map((text, index) => ({
  id: `t1-3-${index}`,
  tier: "session_details",
  text,
  type: "detail",
  importance: 2,
  expiration: "session",
  entities: [],
  confidence: 1,
  activationTriggers: [],
  evidence: text,
  createdAt: index + 1,
  messageId: index + 1,
  recallCount: 0,
  provenance: { source: "extractor", messageId: index + 1, boundary: index + 1, pass: "shared-read", validity: "live" },
}) as MemoryEntry);

const options: InjectionOptions = {
  tokenBudgets: { facts: 800, session_details: RECORDED_SESSION_BUDGET, short_term: 300, scene_history: 500 } as Record<MemoryTier, number>,
  scoreContext: { boundary: 30, lastMessageId: 58, turnText: "", turnEntities: [] },
};

const FORT_OLDER = "Fort Vicinitas is a sprawl of grey stone and iron on the ridge, its walls scored with the scars of old wars, banners snapping in the wind, gates open, air thick with horse sweat and woodsmoke.";
const FORT_NEWER = "Fort Vicinitas is a sprawl of grey stone and iron on the ridge, its walls scarred by old wars, banners snapping in the wind, gates open, air thick with horse sweat and woodsmoke.";
const KAELEN_NEWEST = "Captain Kaelen is a grim, scarred man in dented plate with a longsword, commanding Fort Vicinitas.";

describe("T1 follow-up: [Details from this session] carries no near-duplicate rows (T1-3 payload #90)", () => {
  const texts = [...recorded.rows];
  const injection = buildMemoryInjection(rows(texts), null, options);
  const block = labelMemoryBlock("session_details", injection.blocks.session_details);
  const lines = injection.blocks.session_details.split("\n");

  it("starts from the recorded block: 20 rows, 2,428 chars, Fort Vicinitas twice and Kaelen's description three times", () => {
    expect(texts).toHaveLength(20);
    expect(labelMemoryBlock("session_details", texts.join("\n"))).toHaveLength(RECORDED_BLOCK_CHARS);
    expect(texts.filter((text) => text.startsWith("Fort Vicinitas is a sprawl"))).toHaveLength(2);
    expect(texts.filter((text) => text.startsWith("Captain Kaelen"))).toHaveLength(3);
  });

  it("keeps the newest of each near-duplicate group and holds the older ones out", () => {
    expect(lines).toContain(FORT_NEWER);
    expect(lines).not.toContain(FORT_OLDER);
    expect(lines.filter((line) => line.startsWith("Captain Kaelen"))).toEqual([KAELEN_NEWEST]);
    expect(injection.fates["t1-3-7"]).toBe("near-duplicate");
    expect(injection.fates["t1-3-9"]).not.toBe("near-duplicate");
    expect(injection.fates["t1-3-8"]).toBe("near-duplicate");
    expect(injection.fates["t1-3-10"]).toBe("near-duplicate");
  });

  it("keeps distinct rows that merely share a subject", () => {
    expect(lines.some((line) => line.startsWith("Kaelen flatly denies"))).toBe(true);
    expect(lines.some((line) => line.startsWith("Prince Forre is expected at Fort Vicinitas"))).toBe(true);
  });

  it("caps the block's rows and ends well under the recorded size", () => {
    expect(lines.length).toBeLessThanOrEqual(SESSION_DETAILS_ROW_CAP);
    expect(block.length).toBeLessThan(RECORDED_BLOCK_CHARS * 0.75);
    expect({ rows: lines.length, chars: block.length }).toEqual({ rows: 12, chars: 1445 });
  });

  it("T2-2: dedups the facts tier too, but never drops an established (locked) row", () => {
    const facts = rows([FORT_OLDER, FORT_NEWER]).map((entry) => ({ ...entry, tier: "facts" as const, type: "fact" as const }));
    expect(buildMemoryInjection(facts, null, options).blocks.facts.split("\n")).toEqual([FORT_NEWER]);
    const locked = facts.map((entry, index) => (index === 0 ? { ...entry, locked: true } : entry));
    expect(buildMemoryInjection(locked, null, options).blocks.facts.split("\n")).toEqual([FORT_OLDER]);
  });
});
