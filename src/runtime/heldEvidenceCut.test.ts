import type { Quality } from "@engine/index";
import { applyCommitEvidence, type CommitStory } from "@extraction/commitGuard";
import { applyRatingGrounding } from "@extraction/ratingGuard";
import type { ParsedDelta } from "@extraction/types";
import { buildTypedPlan, readTypedDeltas, TYPED_EVIDENCE_CHARS } from "@judge/index";
import { heldNote } from "./heldJournal";

const long = `The Guild clerk shuffles papers for a long while. ${"The hall is loud and nobody looks up. ".repeat(5)}At last she says the party is E-rank now.`;
const short = "Ellie stamps your badges: the Guild promotes you to E-rank.";
const story = { title: "Guild", checkpointName: "The Hall", objective: "Rank up." };
const rank: Quality = { key: "party_rank", type: "int", source: "extractor", rubric: "Which rank?" };
const promoted: Quality = { key: "promoted", type: "bool", source: "extractor", read_as: "choice", rubric: "Was the party promoted?" };

const typed = (text: string) => {
  const window = [{ id: 7, speaker: "Narrator", text }];
  const plan = buildTypedPlan([promoted], window, story)!;
  return readTypedDeltas({ "q:promoted": { type: "choice", choice: "yes in msg_7", confidence: 0.99, probabilities: {} } }, plan, [promoted], window).deltas;
};

const parsed = (evidence: string, cut: Partial<ParsedDelta> = {}): ParsedDelta => ({ delta: { q: "party_rank", v: 1, source: "extractor" }, evidence, judge: 0.99, messageId: 7, ...cut });

const rating: Record<string, Quality> = {
  party_rank: { ...rank, read_as: "rating", monotonic: true, criteria: { levels: [{ value: 1, label: "E-rank" }, { value: 2, label: "D-rank" }] } },
};

const commitStory: CommitStory = {
  qualityByKey: { party_rank: { ...rank, commit_evidence: "\\b(accept)\\b" } },
  transitions: [],
};

describe("v2.7 02 C11-F1a: the author's held row says when the judge-typed evidence was cut", () => {
  it("a judged typed read of a long message keeps the cut quote and records the source length", () => {
    expect(long.length).toBeGreaterThan(TYPED_EVIDENCE_CHARS);
    expect(typed(long)).toEqual([{ q: "promoted", v: true, confidence: 0.99, evidence: long.slice(0, TYPED_EVIDENCE_CHARS), messageId: 7, sourceChars: long.length }]);
  });

  it("a short source records no length", () => {
    expect(typed(short)[0]).not.toHaveProperty("sourceChars");
  });

  it("a rating hold on cut evidence names the cut and the message", () => {
    const { held } = applyRatingGrounding(rating, { party_rank: 0 }, [parsed(long.slice(0, TYPED_EVIDENCE_CHARS), { sourceChars: long.length })]);
    expect(held).toEqual([expect.objectContaining({ messageId: 7, sourceChars: long.length })]);
    expect(heldNote(held)).toContain(`, evidence cut to the first ${TYPED_EVIDENCE_CHARS} of ${long.length} characters of message 7`);
  });

  it("a commitment hold on cut evidence names the cut too", () => {
    const { held } = applyCommitEvidence(commitStory, [parsed(long.slice(0, TYPED_EVIDENCE_CHARS), { sourceChars: long.length })], () => []);
    expect(heldNote(held)).toContain(`of ${long.length} characters of message 7`);
  });

  it("never notes a cut for a short source or an LLM-read hold", () => {
    const shortHold = applyRatingGrounding(rating, { party_rank: 0 }, [parsed("The hall is loud.")]).held;
    const llmHold = applyRatingGrounding(rating, { party_rank: 0 }, [{ delta: { q: "party_rank", v: 1, source: "extractor" }, evidence: "The hall is loud." }]).held;
    expect(shortHold).toHaveLength(1);
    expect(llmHold).toHaveLength(1);
    for (const held of [shortHold, llmHold]) {
      expect(held[0]).not.toHaveProperty("sourceChars");
      expect(heldNote(held)).not.toContain("evidence cut");
    }
  });
});
