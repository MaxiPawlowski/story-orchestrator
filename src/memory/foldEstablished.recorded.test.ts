import * as recorded from "../../test/fixtures/t2-1-seal.memory.json";
import { recallCandidates, selectRecall } from "./archiveRecall";
import { foldChapter } from "./chapterFold";
import { establishedBands, heldContradictions, heldGroup, standsEstablished } from "./conflicts";
import { buildMemoryInjection, type InjectionOptions } from "./inject";
import { PAIR_JACCARD_FLOOR } from "@judge/index";
import type { ChapterRecord, MemoryEntry, MemoryTier } from "./types";

const rows = recorded.entries as unknown as MemoryEntry[];
const devourer = rows.find((entry) => entry.text.includes("killing it released them into dust"))!;
const serenola = rows.find((entry) => entry.text.startsWith("Serenola is a dark green-skinned woman"))!;
const LOCK = { by: "author", at: "2026-10-01T23:59:48.133Z", boundary: 93, from: "lock" };
const locked = { ...devourer, locked: true, pinned: true, provenance: { ...devourer.provenance, override: LOCK } } as MemoryEntry;

const claim = (text: string): MemoryEntry => ({
  id: "claim", tier: "facts", text, type: "fact", importance: 3, expiration: "permanent", entities: ["Devourer"], confidence: 1, activationTriggers: [], evidence: text,
  createdAt: 95, messageId: 152, recallCount: 0, provenance: { source: "extractor", messageId: 152, boundary: 95, pass: "shared-read", validity: "live" },
}) as MemoryEntry;

const options: InjectionOptions = {
  tokenBudgets: { facts: 800, session_details: 600, short_term: 300, scene_history: 500 } as Record<MemoryTier, number>,
  scoreContext: { boundary: 95, lastMessageId: 152, turnText: "We left the Devourer alive, didn't we?", turnEntities: [] },
};

const record = { id: "adv#1", range: { from: 0, to: 121 }, open: [], sealedAt: { boundary: 76, messageId: 121, at: 0, pathLength: 11 } } as unknown as ChapterRecord;

describe("T2-5: a locked fact is never folded out of the prompt (the Devourer row, msg 103)", () => {
  it("a row locked after its chapter folded is injected again, and stands established against a new claim", () => {
    const folded = { ...locked, foldedInto: "adv#1" } as MemoryEntry;
    const injection = buildMemoryInjection([folded], null, options);
    expect(injection.fates[folded.id]).toBe("injected");
    expect(injection.blocks.session_details).toContain("released them into dust");
    expect(standsEstablished(folded)).toBe(true);
  });

  it("the seal leaves locked, author-edited and authored rows unfolded", () => {
    const edited = { ...serenola, provenance: { ...serenola.provenance, override: { ...LOCK, from: "edit" } } } as MemoryEntry;
    const authored = { ...rows[0], id: "authored", foldedInto: undefined, provenance: { ...rows[0].provenance, source: "author" } } as MemoryEntry;
    const fresh = [locked, edited, authored].map((entry) => ({ ...entry, foldedInto: undefined })) as MemoryEntry[];
    const out = foldChapter({ entries: fresh, arcs: [], shortTermSummaryEnd: -1 }, record, () => "carry");
    expect(out.entries.map((entry) => entry.foldedInto)).toEqual([undefined, undefined, undefined]);
  });

  it("control: an ordinary folded row stays held out", () => {
    const folded = { ...devourer, foldedInto: "adv#1" } as MemoryEntry;
    expect(buildMemoryInjection([folded], null, options).fates[folded.id]).toBe("folded");
    expect(standsEstablished({ ...folded, provenance: { ...folded.provenance, validity: "live" } } as MemoryEntry)).toBe(false);
  });
});

describe("T2-3: archive recall brings Serenola back when the player names her (msg 142)", () => {
  it("the folded description is recalled for 'And the Baroness Serenola is a dwarf, isn't she?'", () => {
    const archived = rows.map((entry) => ({ ...entry, foldedInto: "adv#1" })) as MemoryEntry[];
    const text = "And the Baroness Serenola is a dwarf, isn't she? Short, bearded, a dwarf of the old houses.";
    const candidates = recallCandidates(archived, text);
    expect(candidates.map((entry) => entry.id)).toContain(serenola.id);
    const lines = selectRecall(candidates, [{ id: "adv#1", playerTitle: "The Adventurer's Guild" } as ChapterRecord],
      { boundary: 89, lastMessageId: 142, turnText: text, turnEntities: ["serenola"] });
    expect(lines.map((line) => line.entryId)).toContain(serenola.id);
  });
});

describe("T2-5: a folded locked row still holds a contradicting claim in its band", () => {
  const held = (entries: MemoryEntry[], text: string) => {
    const established = entries.filter(standsEstablished);
    const candidate = claim(text);
    return heldContradictions(established, [candidate], establishedBands(heldGroup(established, [candidate]), null, PAIR_JACCARD_FLOOR)).map((pair) => pair.established.id);
  };
  const denial = "Killing the Devourer never released the frozen victims in the ice-like walls into dust.";

  it("a denial of the locked row is held against it although its chapter folded it", () => {
    expect(held([{ ...locked, foldedInto: "adv#1" } as MemoryEntry], denial)).toEqual([devourer.id]);
  });

  it("known limit: the recorded rewording (msg 152) shares too few words for the Jaccard band; only the vectors band can see it", () => {
    expect(held([{ ...locked, foldedInto: "adv#1" } as MemoryEntry], "Max admits the party left the Devourer alive and only sealed it back in.")).toEqual([]);
  });
});
