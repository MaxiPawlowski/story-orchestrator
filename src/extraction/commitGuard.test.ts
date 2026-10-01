import { applyCommitEvidence } from "./commitGuard";
import type { Quality } from "@engine/index";
import type { EvidenceMessage } from "./evidence";
import type { ParsedDelta } from "./types";

const quality = (overrides: Partial<Quality>): Quality => ({
  key: "adv_path",
  type: "enum",
  values: ["wendhope"],
  source: "extractor",
  latching: true,
  rubric: "Which posting has the party committed to?",
  ...overrides,
});

const delta = (q: string, v: unknown, evidence: string, extra: Partial<ParsedDelta> = {}): ParsedDelta => ({
  delta: { q, v: v as ParsedDelta["delta"]["v"], source: "extractor" },
  evidence,
  ...extra,
});

const player = (text: string, messageId = 1): EvidenceMessage => ({ messageId, text, isUser: true, speaker: "Max" });
const npc = (text: string, messageId = 2, speaker = "Tobias"): EvidenceMessage => ({ messageId, text, isUser: false, speaker });
const windowOf = (...messages: EvidenceMessage[]) => () => messages;
const quoted = (evidence: string) => windowOf(player(evidence));

describe("commit-evidence guard", () => {
  it("holds a latching commit value read from a scene aside", () => {
    const story = { adv_path: quality({ commit_evidence: "\\b(take|accept|sign|we'?ll go|committed)\\b" }) };
    const result = applyCommitEvidence(story, [delta("adv_path", "wendhope", "Just us three, and perhaps our friend Dalan there?")], quoted("Just us three, and perhaps our friend Dalan there?"));
    expect(result.accepted).toHaveLength(0);
    expect(result.held).toEqual([{ key: "adv_path", value: "wendhope", evidence: "Just us three, and perhaps our friend Dalan there?" }]);
  });

  it("accepts the same value when the quote shows the commitment", () => {
    const story = { adv_path: quality({ commit_evidence: "\\b(take|accept|sign)\\b" }) };
    const result = applyCommitEvidence(story, [delta("adv_path", "wendhope", "We'll take the Wendhope posting, sign us up.")], quoted("We'll take the Wendhope posting, sign us up."));
    expect(result.held).toHaveLength(0);
    expect(result.accepted).toHaveLength(1);
  });

  it("holds a judge-sourced delta when no line the player wrote commits", () => {
    const story = { adv_path: quality({ commit_evidence: "\\b(take|accept)\\b" }) };
    const result = applyCommitEvidence(story, [delta("adv_path", "wendhope", "judged from the window", { judge: 0.9, messageId: 7 })],
      windowOf(player("What does it pay?"), npc("Take it or leave it.")));
    expect(result.accepted).toHaveLength(0);
    expect(result.held).toHaveLength(1);
  });

  it("leaves qualities without commit_evidence untouched", () => {
    const story = { adv_path: quality({}) };
    const result = applyCommitEvidence(story, [delta("adv_path", "wendhope", "")], () => { throw new Error("an unguarded batch never reads the window"); });
    expect(result.held).toHaveLength(0);
    expect(result.accepted).toHaveLength(1);
  });

  it("covers bool commitments too", () => {
    const story = { war_commission_taken: quality({ key: "war_commission_taken", type: "bool", values: undefined, commit_evidence: "\\b(commission|enlist|swear)\\b" }) };
    const result = applyCommitEvidence(story, [delta("war_commission_taken", true, "the queen mentions the war")],
      windowOf(player("Tell me about the war."), npc("the queen mentions the war")));
    const sworn = applyCommitEvidence(story, [delta("war_commission_taken", true, "the queen mentions the war")], windowOf(player("I swear the oath and take the commission")));
    expect(result.held).toHaveLength(1);
    expect(sworn.accepted).toHaveLength(1);
  });

  it("accepts any evidence for an unguarded quality while holding a guarded one in the same batch", () => {
    const story = {
      adv_path: quality({ commit_evidence: "\\baccept\\b" }),
      party_name: quality({ key: "party_name", type: "string", values: undefined }),
    };
    const result = applyCommitEvidence(story, [
      delta("adv_path", "wendhope", "a rider passes on the road"),
      delta("party_name", "Nightbringers", ""),
    ], windowOf(npc("a rider passes on the road")));
    expect(result.held.map((entry) => entry.key)).toEqual(["adv_path"]);
    expect(result.accepted.map((entry) => entry.delta.q)).toEqual(["party_name"]);
  });

  it("falls back to today's behaviour when a stored pattern is invalid", () => {
    const story = { adv_path: quality({ commit_evidence: "([unterminated" }) };
    const result = applyCommitEvidence(story, [delta("adv_path", "wendhope", "anything")], windowOf());
    expect(result.accepted).toHaveLength(1);
  });

  it("accepts the player's commitment when the read quoted the NPC who answered it", () => {
    const story = { adv_path: quality({ commit_evidence: "\\b(take|accept|we'?ll do it)\\b" }) };
    const result = applyCommitEvidence(story, [delta("adv_path", "wendhope", "Your posting.")],
      windowOf(player("Fine, we'll do it. Ash Lanterns.", 9), npc("He pulls the Wendhope notice from the board. \"Your posting.\"", 10)));
    expect(result.held).toHaveLength(0);
    expect(result.accepted).toHaveLength(1);
  });

  it("never lets an NPC or the narrator commit for the player, even quoted with a commitment verb", () => {
    const story = { adv_path: quality({ commit_evidence: "\\b(take|accept(?:s|ed)?|agree(?:s|d)?)\\b" }) };
    const npcSays = applyCommitEvidence(story, [delta("adv_path", "wendhope", "So you've agreed then.")], windowOf(player("What does it pay?"), npc("So you've agreed then.")));
    const narrated = applyCommitEvidence(story, [delta("adv_path", "wendhope", "Max nods and accepts the posting.")],
      windowOf(player("Hm."), npc("Max nods and accepts the posting.", 2, "Adolion Narrator")));
    expect(npcSays.accepted).toHaveLength(0);
    expect(narrated.accepted).toHaveLength(0);
  });
});
