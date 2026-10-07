import { applyCommitEvidence, HOLD_REASONS, type CommitStory } from "./commitGuard";
import type { Quality } from "@engine/index";
import type { EvidenceMessage } from "./evidence";
import type { ParsedDelta } from "./types";

const story: CommitStory = {
  qualityByKey: {
    adv_path: {
      key: "adv_path", type: "enum", values: ["wendhope"], source: "extractor", latching: true, rubric: "Which posting has the party committed to?",
      commit_evidence: "\\b(take|accept)\\b",
    } as Quality,
  },
  transitions: [],
};

const delta: ParsedDelta = { delta: { q: "adv_path", v: "wendhope", source: "extractor" }, evidence: "Tobias offers the Wendhope posting." };
const player = (text: string, messageId = 1): EvidenceMessage => ({ messageId, text, isUser: true, speaker: "Max" });
const npc = (text: string, messageId = 2): EvidenceMessage => ({ messageId, text, isUser: false, speaker: "Tobias" });
const held = (...messages: EvidenceMessage[]) => applyCommitEvidence(story, [delta], () => messages).held;

describe("v2.7 plan 09 E: a held commitment names the player's line and why it was held", () => {
  it.each([
    ["negated", "I don't see why we wouldn't take the Wendhope posting.", HOLD_REASONS.negated],
    ["hedged", "Maybe we take the Wendhope posting.", HOLD_REASONS.hedged],
    ["a question", "Do we take the Wendhope posting?", HOLD_REASONS.question],
    ["no commitment verb", "What does the Wendhope posting pay?", HOLD_REASONS.noMatch],
  ])("%s", (_label, line, reason) => {
    expect(held(npc("The Wendhope posting is yours if you want it."), player(line, 3))).toEqual([expect.objectContaining({ playerLine: line, reason })]);
  });

  it("reports the newest player line that tried to commit, not a later aside", () => {
    expect(held(player("We won't take the Wendhope posting.", 1), npc("Your call."), player("Who else is hiring?", 3)))
      .toEqual([expect.objectContaining({ playerLine: "We won't take the Wendhope posting.", reason: HOLD_REASONS.negated })]);
  });

  it("a window without a player line says so and carries no line", () => {
    const [entry] = held(npc("The party takes the Wendhope posting."));
    expect(entry).toMatchObject({ reason: HOLD_REASONS.noPlayerLine });
    expect(entry.playerLine).toBeUndefined();
  });

  it("control: a commitment is accepted and carries nothing", () => {
    const result = applyCommitEvidence(story, [delta], () => [player("We'll take the Wendhope posting.")]);
    expect(result.held).toEqual([]);
    expect(result.accepted).toHaveLength(1);
  });
});
