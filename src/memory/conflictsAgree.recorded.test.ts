import * as recorded from "../../test/fixtures/t2-1-conflicts.recorded.json";
import { detectConflicts } from "./conflicts";
import type { LedgerEntry, MemoryEntry, MemoryTier } from "./types";

type Pair = { tier: string | null; fact: string; entity: string; field: string; value: string };

const entry = (text: string, tier: MemoryTier, entities: string[]): MemoryEntry => ({
  id: "m", tier, text, type: "fact", importance: 2, expiration: "permanent", entities, confidence: 1, activationTriggers: [], evidence: text,
  createdAt: 1, messageId: 1, recallCount: 0, provenance: { source: "extractor", messageId: 1, boundary: 1, pass: "shared-read", validity: "live" },
}) as MemoryEntry;

const row = (entity: string, field: string, value: string): LedgerEntry => ({
  id: "l", entity, entityType: "thing", field, value, createdAt: 1, messageId: 1, provenance: { source: "extractor", messageId: 1, boundary: 1, pass: "shared-read", validity: "live" },
}) as LedgerEntry;

const queued = (pair: Pair, tier = (pair.tier ?? "facts") as MemoryTier) => detectConflicts([entry(pair.fact, tier, [pair.entity])], [row(pair.entity, pair.field, pair.value)], {}).length > 0;

const pairs = recorded.pairs as Pair[];

describe("T2-1/T2-3: the memory queue held 40 memory-vs-ledger pairs, almost all agreeing (test/fixtures/t2-1-conflicts.recorded.json)", () => {
  it("a scene summary is never queued against the ledger: the 6 recorded scene rows stay live, so the chapter seal sees them", () => {
    const scenes = pairs.filter((pair) => pair.tier === "scene_history");
    expect(scenes).toHaveLength(6);
    expect(scenes.filter((pair) => queued(pair))).toEqual([]);
  });

  it("a fact that restates the ledger value is not a disagreement (B-rank, the estate gates)", () => {
    const rank = pairs.find((pair) => pair.field === "rank")!;
    const gates = pairs.find((pair) => pair.field === "gates" && pair.fact.startsWith("The Nightriver estate has"))!;
    expect(queued(rank)).toBe(false);
    expect(queued(gates)).toBe(false);
  });

  it("the recorded queue shrinks from 40 to at most 15", () => {
    expect(pairs).toHaveLength(40);
    expect(pairs.filter((pair) => queued(pair)).length).toBeLessThanOrEqual(15);
  });

  it("control: a contradicting value is still queued, a negated restatement too, and a scene's text kept as a fact still is", () => {
    const rank = { ...pairs.find((pair) => pair.field === "rank")!, fact: "Max Nightriver is promoted to B-rank for clearing the Driftmere Mines." };
    expect(queued(rank)).toBe(false);
    expect(queued({ ...rank, value: "C-rank adventurer" })).toBe(true);
    expect(queued({ tier: "facts", fact: "Riyo's left arm is no longer hidden under her cloak.", entity: "Riyo", field: "left_arm", value: "hidden under cloak" })).toBe(true);
    const garreth = pairs.find((pair) => pair.tier === "scene_history" && pair.field === "level")!;
    expect(queued(garreth, "facts")).toBe(true);
  });
});
