import { addMemoryEntries, createMemoryState } from "./stores";
import { applyEpistemicSignals } from "./epistemic";
import type { EpistemicEntry, MemoryEntry, ParsedEpistemicSignal } from "./types";

const fact = (id: string, text: string, messageId: number, evidence: string, tier: MemoryEntry["tier"] = "facts"): MemoryEntry => ({
  id, tier, text, messageId, evidence, createdAt: 9, importance: 3, expiration: "permanent",
  provenance: { source: "extractor", messageId, boundary: 9, pass: "shared-read", validity: "live" },
} as unknown as MemoryEntry);

const TRAIL_A = "Colonel Aristhide says the only route behind the Zegallan lines is a steep western trail the Zegallans use to rotate their slave corps, covered by their archers.";
const TRAIL_B = "Colonel Aristhide says the only route behind the Zegallan lines is a steep western trail used to rotate their slave corps, covered by Zegallan archers.";
const WRIT_A = "Colonel Aristhide commands Fort Vicinitas and honors Prince Forre's sealed writ, giving the party quarters in the west wing and rations on the mess hall schedule.";
const WRIT_B = "Colonel Aristhide commands Fort Vicinitas and honors Prince Forre's sealed writ without question, quartering the party in the west wing.";
const TRAIL_QUOTE = "there's a trail to the west\u2014scout routes the Zegallans use to rotate their slave corps";
const TRAIL_QUOTE_LONG = `${TRAIL_QUOTE}. It's steep, and it's covered by their archers, but it's the only route that doesn't end in a shield wall.`;
const WRIT_QUOTE = "Prince Forre's word is law here";

describe("T5-5-1 duplicate memory rows: a second, wider read re-stores the same message's facts reworded (evidence-*.json memory)", () => {
  const cadence = () => addMemoryEntries(createMemoryState(), [fact("d343", TRAIL_A, 11, TRAIL_QUOTE), fact("59da", WRIT_A, 11, WRIT_QUOTE)], { from: 9, to: 11 }).state;

  it("the scene:location read (msgs 4-11) does not add a reworded copy of a fact the cadence read (msgs 9-11) stored from the same quote", () => {
    const written = addMemoryEntries(cadence(), [fact("fdee", TRAIL_B, 11, TRAIL_QUOTE_LONG), fact("1a6f", WRIT_B, 11, WRIT_QUOTE)], { from: 4, to: 11 });
    expect(written.accepted.map((entry) => entry.id)).toEqual([]);
    expect(written.state.entries.map((entry) => entry.id)).toEqual(["d343", "59da"]);
  });

  it("control: a fact read from another quote of the same message, and the same wording from another message, are kept", () => {
    const stored = addMemoryEntries(cadence(), [fact("x1", "Colonel Aristhide hands Max Nightriver a sword.", 11, "He hands Max a sword.")], { from: 11, to: 11 }).state;
    const shield = fact("x2", "Colonel Aristhide hands Max Nightriver a shield.", 11, "He hands Max a shield.");
    const later = fact("x3", TRAIL_B, 13, TRAIL_QUOTE);
    const written = addMemoryEntries(stored, [shield, later], { from: 4, to: 13 });
    expect(written.accepted.map((entry) => entry.id)).toEqual(["x2", "x3"]);
  });

  it("control: one read's own lines are left to consolidation, and another tier keeps its own row", () => {
    const batch = addMemoryEntries(createMemoryState(), [fact("d343", TRAIL_A, 11, TRAIL_QUOTE), fact("fdee", TRAIL_B, 11, TRAIL_QUOTE)], { from: 9, to: 11 });
    expect(batch.accepted.map((entry) => entry.id)).toEqual(["d343", "fdee"]);
    const written = addMemoryEntries(cadence(), [fact("f304", TRAIL_B, 11, TRAIL_QUOTE, "session_details")], { from: 4, to: 11 });
    expect(written.accepted.map((entry) => entry.id)).toEqual(["f304"]);
  });
});

const row = (id: string, subject: string, tag: EpistemicEntry["tag"], content: string, boundary: number, messageId: number, extra: Partial<EpistemicEntry> = {}): EpistemicEntry => ({
  id, subject, tag, content, createdAt: boundary, messageId,
  provenance: { source: "extractor", messageId, boundary, pass: `epistemic:${tag}`, validity: "live" },
  ...extra,
} as EpistemicEntry);

const sig = (tag: ParsedEpistemicSignal["tag"], subject: string, content: string): ParsedEpistemicSignal => ({ tag, subject, content });

const OPTIONAL = "The commission is optional — he said \"We'll think about it\" as though it were a bargain.";
const OPPORTUNITY = "The commission is an \"opportunity\" rather than an order — he treated it as negotiable.";

describe("T5-5-1 duplicate epistemic rows (evidence-*.json epistemic slice)", () => {
  it("a belief the same pass retires and restates is neither copied (6a7e08f2 -> ea52913d, c9dc26ee -> c5a47074) nor lost (T6-4: the restatement keeps the stored row)", () => {
    const stored = [row("6a7e", "Max Nightriver", "believes", OPTIONAL, 8, 9), row("c9dc", "Max Nightriver", "believes", OPPORTUNITY, 8, 9)];
    const applied = applyEpistemicSignals(stored, [sig("believes", "Max Nightriver", OPTIONAL), sig("believes", "Max Nightriver", OPPORTUNITY)], { boundary: 9, messageId: 11 }, ["6a7e", "c9dc"]);
    expect(applied.added).toEqual([]);
    expect(applied.retired).toEqual([]);
    expect(applied.entries.filter((entry) => !entry.supersededBy).map((entry) => entry.id)).toEqual(["6a7e", "c9dc"]);
  });

  it("a later read of the same messages does not bring a retired belief back; a newer message may", () => {
    const retired = { supersededBy: "retired@9", retiredAt: { messageId: 11, boundary: 9 } };
    const stored = [row("6a7e", "Max Nightriver", "believes", OPTIONAL, 8, 9, retired)];
    expect(applyEpistemicSignals(stored, [sig("believes", "Max Nightriver", OPTIONAL)], { boundary: 9, messageId: 11 }).added).toEqual([]);
    expect(applyEpistemicSignals(stored, [sig("believes", "Max Nightriver", OPTIONAL)], { boundary: 12, messageId: 15 }).added).toHaveLength(1);
  });

  it("a restated aim affirms the stored one instead of adding a copy (Forre [intends] 95edf9e5 / 7d8ca9ec)", () => {
    const stored = [row("95ed", "Forre", "intends", "To have the party report findings directly to him and act as the Crown's dagger in the Ashen March.", 6, 8)];
    const applied = applyEpistemicSignals(stored, [sig("intends", "Forre", "To have the party report their findings directly to him, valuing precision over poetry.")], { boundary: 8, messageId: 9 });
    expect(applied.added).toEqual([]);
    expect(applied.entries[0].affirmedAt).toEqual([{ messageId: 9, boundary: 8 }]);
  });

  it("control: a different aim of the same subject is stored, and a restated [knows] stays a new row", () => {
    const stored = [row("95ed", "Forre", "intends", "To have the party report findings directly to him and act as the Crown's dagger in the Ashen March.", 6, 8)];
    const aims = applyEpistemicSignals(stored, [sig("intends", "Forre", "To win the King's favour over his brother at court.")], { boundary: 8, messageId: 9 });
    expect(aims.added).toHaveLength(1);
    const knows = [row("k1", "Max Nightriver", "knows", "Forre trusts the party.", 6, 8)];
    expect(applyEpistemicSignals(knows, [sig("knows", "Max Nightriver", "Forre trusts the party more than his brother, the King's general, and the court.")], { boundary: 8, messageId: 9 }).added).toHaveLength(1);
  });
});
