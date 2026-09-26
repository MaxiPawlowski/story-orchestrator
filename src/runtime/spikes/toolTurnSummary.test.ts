import { markersFirst, summarizeToolTurns, type ProbeEvent } from "./toolTurnSummary";

const work = (key: "generationStarted" | "memberDrafted" | "talkDecision" | "loreSelect" | "interceptor"): ProbeEvent => ({ kind: "work", work: key });

const toolTurn: ProbeEvent[] = [
  work("loreSelect"),
  { kind: "sent", messageId: 1 },
  work("memberDrafted"),
  { kind: "drafted", member: "3" },
  work("generationStarted"),
  { kind: "started", type: "normal", dryRun: false },
  work("interceptor"),
  work("talkDecision"),
  { kind: "rendered", messageId: 2, type: "normal" },
  { kind: "tool", messageId: 3 },
  { kind: "started", type: "normal", dryRun: false },
  work("interceptor"),
  work("talkDecision"),
  { kind: "rendered", messageId: 4, type: "normal" },
];

const plainTurn: ProbeEvent[] = [
  { kind: "sent", messageId: 5 },
  work("memberDrafted"),
  { kind: "drafted", member: "3" },
  work("generationStarted"),
  { kind: "started", type: "normal", dryRun: false },
  work("interceptor"),
  { kind: "rendered", messageId: 6, type: "normal" },
];

describe("SP10 Q1 probe summary", () => {
  it("moves the work a host event's runtime handler did before the probe saw the event behind that event", () => {
    expect(markersFirst([{ kind: "rendered", messageId: 1, type: "normal" }, work("loreSelect"), { kind: "sent", messageId: 2 }]).map((event) => event.kind))
      .toEqual(["rendered", "sent", "work"]);
  });

  it("counts a tool turn's depths, tool calls and boundaries per player turn and per drafted chain", () => {
    const report = summarizeToolTurns([...toolTurn, ...plainTurn], [{ boundary: 1, messageId: 2 }, { boundary: 2, messageId: 4 }, { boundary: 3, messageId: 6 }], 2);
    const [first, second] = report.turns;
    expect({ user: first.userMessageId, generations: first.generations, tools: first.toolCalls, renders: first.renders, boundaries: first.boundaries })
      .toEqual({ user: 1, generations: 2, tools: 1, renders: 2, boundaries: 2 });
    expect(first.work).toEqual({ generationStarted: 1, memberDrafted: 1, talkDecision: 2, loreSelect: 1, interceptor: 2 });
    expect(first.drafts).toHaveLength(1);
    expect({ boundaries: first.drafts[0].boundaries, interceptor: first.drafts[0].work.interceptor, lore: first.drafts[0].work.loreSelect })
      .toEqual({ boundaries: 2, interceptor: 2, lore: 0 });
    expect({ boundaries: second.boundaries, drafts: second.drafts[0].boundaries }).toEqual({ boundaries: 1, drafts: 1 });
    expect(report.summary).toEqual({
      turns: 2,
      boundariesPerTurn: [2, 1],
      maxBoundariesPerDraft: 2,
      maxGenerationsPerDraft: 2,
      maxWorkPerDraft: { generationStarted: 1, memberDrafted: 1, talkDecision: 2, loreSelect: 0, interceptor: 2 },
      talkDecisions: 2,
      foldNeeded: true,
    });
  });

  it("control: turns without tool calls and one boundary per chain do not call for a fold", () => {
    const report = summarizeToolTurns(plainTurn, [{ boundary: 1, messageId: 6 }], 0);
    expect({ fold: report.summary.foldNeeded, perTurn: report.summary.boundariesPerTurn }).toEqual({ fold: false, perTurn: [1] });
  });

  it("a solo chat has no draft event, so its first real generation opens the chain; a dry run never does", () => {
    const report = summarizeToolTurns([
      { kind: "sent", messageId: 1 },
      { kind: "started", type: "normal", dryRun: true },
      { kind: "started", type: "normal", dryRun: false },
      { kind: "rendered", messageId: 2, type: "normal" },
    ], [{ boundary: 1, messageId: 2 }], 0);
    expect(report.turns[0].drafts.map((draft) => ({ member: draft.member, generations: draft.generations, boundaries: draft.boundaries })))
      .toEqual([{ member: null, generations: 1, boundaries: 1 }]);
  });
});
