import type { WitnessLookup } from "../audience";
import { mayAdd, mayRemove } from "../audienceRules";
import type { SourceSpan } from "../audience";
import { nullControlBeaten, presencePredict, scoreWitness, WITNESS_LABELS_FORMAT, type WitnessLabel, type WitnessLabelSet, type WitnessPredict } from "./score";

const MEMBERS = ["a", "b", "c"];

const labels = (): WitnessLabel[] => [
  ...Array.from({ length: 30 }, (_, id): WitnessLabel => ({ messageId: id, present: MEMBERS, heard: MEMBERS })),
  ...Array.from({ length: 8 }, (_, offset): WitnessLabel => ({ messageId: 30 + offset, present: MEMBERS, heard: ["a", "b"] })),
  { messageId: 38, present: MEMBERS, heard: MEMBERS, spans: [{ span: [0, 10], heard: MEMBERS }, { span: [10, 30], heard: ["a"] }] },
  { messageId: 39, present: MEMBERS, heard: "unknown" },
];

const set = (overrides: Partial<WitnessLabelSet> = {}): WitnessLabelSet => ({ format: WITNESS_LABELS_FORMAT, set: "synthetic", synthetic: true, members: MEMBERS, labels: labels(), ...overrides });

const yes = (heard: boolean, extra: Partial<WitnessLookup> = {}): WitnessLookup => ({ state: "classified", heard: heard ? "yes" : "no", mixed: false, insideHeardSpan: false, ...extra });

const truth = (data: WitnessLabelSet): WitnessPredict => (messageId, member, span) => {
  const label = data.labels.find((entry) => entry.messageId === messageId);
  if (!label || label.heard === "unknown") return { state: "unknown", heard: "unknown", mixed: false, insideHeardSpan: false };
  if (label.spans) {
    const part = span ? label.spans.find((entry) => span[0] >= entry.span[0] && span[1] <= entry.span[1]) : undefined;
    const heard = part && part.heard !== "unknown" && part.heard.includes(member);
    return { state: "classified", heard: part ? (heard ? "yes" : "no") : "unknown", mixed: true, insideHeardSpan: Boolean(heard) };
  }
  return yes(label.heard.includes(member));
};

describe("plan 42 B: the witness scorer (W4, W4fi, W4fe, W4cov, W4u, W4m, W4a, W4n)", () => {
  it("passes a perfect witness source and reports every row unrounded", () => {
    const score = scoreWitness(set(), truth(set()));
    expect(score.verdict).toBe("pass");
    expect(score.exactSet).toEqual({ hits: 38, of: 38, rate: 1 });
    expect(score.falseInclusion).toEqual({ hits: 0, of: 8 + 3, rate: 0 });
    expect(score.mixedDetection).toEqual({ hits: 1, of: 1, rate: 1 });
    expect(score.asideExactSet).toEqual({ hits: 8, of: 8, rate: 1 });
    expect(score.coverage.of).toBe(40);
  });

  it("fails the planted presence-as-witness control on W4a and W4fi (null control W4n)", () => {
    const control = scoreWitness(set(), presencePredict(set()));
    expect(control.floors.asideExactSet).toBe(false);
    expect(control.floors.falseInclusion).toBe(false);
    expect(control.floors.asideKeptOut).toBe(false);
    expect(control.verdict).toBe("fail");
    expect(nullControlBeaten(scoreWitness(set(), truth(set())), control)).toBe(true);
  });

  it("counts heard on an ambiguous pair as a false inclusion, and unknown as no coverage", () => {
    const predict: WitnessPredict = (messageId, member, span) => (messageId === 39 ? yes(true) : truth(set())(messageId, member, span));
    const score = scoreWitness(set(), predict);
    expect(score.ambiguous).toEqual({ pairs: 3, predictedHeard: 3 });
    expect(score.falseInclusion.hits).toBe(3);
    const blind: WitnessPredict = () => ({ state: "outage", heard: "unknown", mixed: false, insideHeardSpan: false });
    const none = scoreWitness(set(), blind);
    expect(none.coverage.rate).toBe(0);
    expect(none.states.outage).toBe(40);
    expect(none.floors.coverage).toBe(false);
  });

  it("scores a heard span in a mixed message against its label span", () => {
    const leaky: WitnessPredict = (messageId, member, span) => (messageId === 38 && span ? yes(true, { mixed: true, insideHeardSpan: true }) : truth(set())(messageId, member, span));
    expect(scoreWitness(set(), leaky).spanFalseInclusion).toEqual({ hits: 2, of: 2, rate: 1 });
  });

  it("drops private labels without an agreed two-model review, and refuses a verdict under 40", () => {
    const privateSet = set({ synthetic: false, labels: labels().map((label, index) => ({ ...label, review: index < 10 ? { writer: "w", checker: "c", agreed: true } : index < 20 ? { writer: "w", checker: "w", agreed: true } : null })) });
    const score = scoreWitness(privateSet, truth(privateSet));
    expect(score.messages).toBe(10);
    expect(score.dropped).toBe(30);
    expect(score.verdict).toBe("insufficient");
  });
});

const span = (messageId: number, at: [number, number], hash = "h1"): SourceSpan => ({ chatId: "c", messageId, revision: { swipeId: null, hash }, speaker: "Ben", isUser: false, span: at });

describe("plan 42 §0: the audience contract adds only on a positive relation", () => {
  const live = { revision: { swipeId: null, hash: "h1" }, hidden: false };
  const witnessed = (lookup: WitnessLookup | null) => ({ kind: "witnessed" as const, witness: lookup });

  it.each([
    [{ live: null }, "message removed"],
    [{ live: { revision: { swipeId: 2, hash: "h1" }, hidden: false } }, "message changed"],
    [{ live: { ...live, hidden: true } }, "message hidden"],
    [{ basis: null }, "no positive relation"],
    [{ basis: witnessed(null) }, "witness unknown"],
    [{ basis: witnessed({ state: "pending", heard: "yes", mixed: false, insideHeardSpan: false }) }, "witness unknown"],
    [{ basis: witnessed({ state: "classified", heard: "unknown", mixed: false, insideHeardSpan: false }) }, "witness unknown"],
    [{ basis: witnessed({ state: "classified", heard: "no", mixed: false, insideHeardSpan: false }) }, "not witnessed"],
    [{ basis: witnessed({ state: "classified", heard: "yes", mixed: true, insideHeardSpan: false }) }, "mixed message"],
    [{ basis: { kind: "told" as const, telling: span(9, [0, 40]), receiver: "b" } }, "told someone else"],
    [{ basis: { kind: "told" as const, telling: span(9, [0, 40]), receiver: "a" } }, "origin of a telling"],
    [{ basis: { kind: "disclosure" as const, recipient: "b" } }, "disclosed to someone else"],
    [{ keptFrom: () => true }, "held secret"],
  ])("refuses %j as %s", (overrides, reason) => {
    const request = { member: "a", source: span(3, [5, 20]), text: "the key is under the anvil", live, basis: witnessed({ state: "classified", heard: "yes", mixed: false, insideHeardSpan: false }), ...overrides };
    expect(mayAdd(request)).toMatchObject({ ok: false, reason });
  });

  it("adds a witnessed span, a span inside the telling, and a disclosure to its recipient", () => {
    const base = { member: "a", text: "x", live };
    expect(mayAdd({ ...base, source: span(3, [5, 20]), basis: witnessed({ state: "classified", heard: "yes", mixed: true, insideHeardSpan: true }) })).toEqual({ ok: true, basis: "witnessed" });
    expect(mayAdd({ ...base, source: span(9, [4, 12]), basis: { kind: "told", telling: span(9, [0, 40]), receiver: "a" } })).toEqual({ ok: true, basis: "told" });
    expect(mayAdd({ ...base, source: span(3, [5, 20]), basis: { kind: "disclosure", recipient: "a" } })).toEqual({ ok: true, basis: "disclosure" });
  });

  it("removes only spans recorded as not heard; unknown and mixed-unknown stay", () => {
    expect(mayRemove([{ state: "classified", heard: "no", mixed: false, insideHeardSpan: false }])).toBe(true);
    expect(mayRemove([{ state: "classified", heard: "no", mixed: true, insideHeardSpan: false }, { state: "unknown", heard: "unknown", mixed: true, insideHeardSpan: false }])).toBe(false);
    expect(mayRemove([{ state: "outage", heard: "unknown", mixed: false, insideHeardSpan: false }])).toBe(false);
    expect(mayRemove([])).toBe(false);
  });
});
