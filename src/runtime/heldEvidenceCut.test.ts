import type { Quality } from "@engine/index";
import { applyCommitEvidence, type CommitStory } from "@extraction/commitGuard";
import { applyRatingGrounding } from "@extraction/ratingGuard";
import type { ParsedDelta } from "@extraction/types";
import { buildTypedPlan, readTypedDeltas, TYPED_EVIDENCE_CHARS } from "@judge/index";
import { heldNote } from "./heldJournal";
import type { JudgeRuntime } from "./judge";
import { createTypedJudge } from "./typedRead";

const long = `The Guild clerk shuffles papers for a long while. ${"The hall is loud and nobody looks up. ".repeat(5)}At last she says the party is E-rank now.`;
const short = "Ellie stamps your badges: the Guild promotes you to E-rank.";
const quiet = "The hall is loud and nobody looks up.";
const story = { title: "Guild", checkpointName: "The Hall", objective: "Rank up." };
const rank: Quality = { key: "party_rank", type: "int", source: "extractor", rubric: "Which rank?" };
const promoted: Quality = { key: "promoted", type: "bool", source: "extractor", read_as: "choice", rubric: "Was the party promoted?" };

const typed = (text: string) => {
  const window = [{ id: 7, speaker: "Narrator", text }];
  const plan = buildTypedPlan([promoted], window, story)!;
  return readTypedDeltas({ "q:promoted": { type: "choice", choice: "yes in msg_7", confidence: 0.99, probabilities: {} } }, plan, [promoted], window).deltas;
};

const rating: Record<string, Quality> = {
  party_rank: { ...rank, read_as: "rating", monotonic: true, criteria: { levels: [{ value: 1, label: "E-rank" }, { value: 2, label: "D-rank" }] } },
};

const RANK_ANSWERS = { "presence:party_rank": { type: "noul" as const, noul: 1 }, "q:party_rank": { type: "score" as const, score: 0, confidence: 0.99, probabilities: {} } };
const judge = { active: () => true, ask: async () => ({ answers: RANK_ANSWERS, model: "jev" }) } as unknown as JudgeRuntime;

const judgedRank = async (text: string): Promise<ParsedDelta[]> => {
  const read = await createTypedJudge(() => judge)({
    story: { title: story.title, checkpointById: { hall: { name: story.checkpointName, objective: story.objective } } },
    state: { activeCheckpointId: "hall", blackboard: { values: {}, versions: {}, latched: {} } },
    qualities: [rating.party_rank],
    window: { messages: [{ index: 7, speaker: "Narrator", text, isUser: false }] },
  } as never);
  return read?.deltas ?? [];
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

  it("the judged rating read of the long message is a delta carrying the cut, the same read of a short one carries none", async () => {
    expect(await judgedRank(long)).toEqual([expect.objectContaining({ delta: { q: "party_rank", v: 1, source: "extractor" }, evidence: long.slice(0, TYPED_EVIDENCE_CHARS), messageId: 7, sourceChars: long.length })]);
    expect((await judgedRank(quiet))[0]).not.toHaveProperty("sourceChars");
  });

  it("a rating hold on cut evidence names the cut and the message", async () => {
    const { held } = applyRatingGrounding(rating, { party_rank: 0 }, await judgedRank(long));
    expect(held).toEqual([expect.objectContaining({ messageId: 7, sourceChars: long.length })]);
    expect(heldNote(held)).toContain(`, evidence cut to the first ${TYPED_EVIDENCE_CHARS} of ${long.length} characters of message 7`);
  });

  it("a commitment hold on cut evidence names the cut too", async () => {
    const { held } = applyCommitEvidence(commitStory, await judgedRank(long), () => []);
    expect(heldNote(held)).toContain(`of ${long.length} characters of message 7`);
  });

  it("never notes a cut for a short source or an LLM-read hold", async () => {
    const shortHold = applyRatingGrounding(rating, { party_rank: 0 }, await judgedRank(quiet)).held;
    const llmHold = applyRatingGrounding(rating, { party_rank: 0 }, [{ delta: { q: "party_rank", v: 1, source: "extractor" }, evidence: "The hall is loud." }]).held;
    expect(shortHold).toHaveLength(1);
    expect(llmHold).toHaveLength(1);
    for (const held of [shortHold, llmHold]) {
      expect(held[0]).not.toHaveProperty("sourceChars");
      expect(heldNote(held)).not.toContain("evidence cut");
    }
  });
});
