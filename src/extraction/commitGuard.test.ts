import { applyCommitEvidence } from "./commitGuard";
import type { Quality } from "@engine/index";
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

describe("commit-evidence guard", () => {
  it("holds a latching commit value read from a scene aside", () => {
    const story = { adv_path: quality({ commit_evidence: "\\b(take|accept|sign|we'?ll go|committed)\\b" }) };
    const result = applyCommitEvidence(story, [delta("adv_path", "wendhope", "Just us three, and perhaps our friend Dalan there?")]);
    expect(result.accepted).toHaveLength(0);
    expect(result.held).toEqual([{ key: "adv_path", value: "wendhope", evidence: "Just us three, and perhaps our friend Dalan there?" }]);
  });

  it("accepts the same value when the quote shows the commitment", () => {
    const story = { adv_path: quality({ commit_evidence: "\\b(take|accept|sign)\\b" }) };
    const result = applyCommitEvidence(story, [delta("adv_path", "wendhope", "We'll take the Wendhope posting, sign us up.")]);
    expect(result.held).toHaveLength(0);
    expect(result.accepted).toHaveLength(1);
  });

  it("holds a judge-sourced delta whose evidence is the fallback string", () => {
    const story = { adv_path: quality({ commit_evidence: "\\b(take|accept)\\b" }) };
    const result = applyCommitEvidence(story, [delta("adv_path", "wendhope", "judged from the window", { judge: 0.9, messageId: 7 })]);
    expect(result.accepted).toHaveLength(0);
    expect(result.held).toHaveLength(1);
  });

  it("leaves qualities without commit_evidence untouched", () => {
    const story = { adv_path: quality({}) };
    const result = applyCommitEvidence(story, [delta("adv_path", "wendhope", "")]);
    expect(result.held).toHaveLength(0);
    expect(result.accepted).toHaveLength(1);
  });

  it("covers bool commitments too", () => {
    const story = { war_commission_taken: quality({ key: "war_commission_taken", type: "bool", values: undefined, commit_evidence: "\\b(commission|enlist|swear)\\b" }) };
    const result = applyCommitEvidence(story, [
      delta("war_commission_taken", true, "the queen mentions the war"),
      delta("war_commission_taken", true, "I swear the oath and take the commission"),
    ]);
    expect(result.held).toHaveLength(1);
    expect(result.accepted).toHaveLength(1);
  });

  it("accepts any evidence for an unguarded quality while holding a guarded one in the same batch", () => {
    const story = {
      adv_path: quality({ commit_evidence: "\\baccept\\b" }),
      party_name: quality({ key: "party_name", type: "string", values: undefined }),
    };
    const result = applyCommitEvidence(story, [
      delta("adv_path", "wendhope", "a rider passes on the road"),
      delta("party_name", "Nightbringers", ""),
    ]);
    expect(result.held.map((entry) => entry.key)).toEqual(["adv_path"]);
    expect(result.accepted.map((entry) => entry.delta.q)).toEqual(["party_name"]);
  });

  it("falls back to today's behaviour when a stored pattern is invalid", () => {
    const story = { adv_path: quality({ commit_evidence: "([unterminated" }) };
    const result = applyCommitEvidence(story, [delta("adv_path", "wendhope", "anything")]);
    expect(result.accepted).toHaveLength(1);
  });
});
