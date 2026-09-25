// Promoted from the 2026-09-18 external review. R5: the parser copies a quality's declared source
// onto the model's delta, so a code-owned quality can be written by the extractor. R6 is rewritten:
// the review asserted only that nothing was accepted, which an evidence-length rule would satisfy
// for the wrong reason — its own evidence string is seven characters. The contract pins both
// halves: reject what is out of scope, accept short legitimate evidence. v2.3 plan 01 §A.

import { StoryEngine, parseStoryV2OrThrow } from "@engine/index";
import { callExtractionReply } from "@extraction/client";
import { parseSharedReadResponse } from "@extraction/parse";
import { runSharedRead } from "@extraction/sharedRead";
import { MAX_DELTAS_PER_READ } from "@extraction/sharedRead";
import { control, finding, must } from "../../test/findings/ledger";

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null, getContext: () => ({ chat: [], extensionSettings: {} }) }));
jest.mock("@extraction/client", () => ({ callExtractionReply: jest.fn() }));

const story = () => parseStoryV2OrThrow({
  format: 2,
  id: "review-independent",
  title: "Review crossing",
  description: "Independent fixture",
  qualities: [
    { key: "crossed", type: "bool", source: "extractor", rubric: "Crossed?" },
    { key: "outside", type: "bool", source: "extractor", rubric: "Outside scope?" },
    { key: "locked", type: "bool", source: "code", rubric: "Code owns lock" },
  ],
  checkpoints: [
    { id: "bank", name: "Bank", objective: "Cross", type: "anchor", start: true },
    { id: "island", name: "Island", objective: "Rest", type: "anchor" },
  ],
  transitions: [{ id: "cross", from: "bank", to: "island", priority: 0, gate: { q: "crossed", op: "==", v: true } }],
  roster: [],
});

const readWith = async (response: string, scopeKey: "crossed") => {
  const s = story();
  const engine = new StoryEngine();
  engine.loadStory(s);
  (callExtractionReply as jest.Mock).mockResolvedValue({ text: response, finish: "unknown" });
  return runSharedRead({
    story: s,
    state: engine.serialize(),
    priority: 0,
    reason: "review",
    scope: [{ quality: s.qualityByKey[scopeKey], key: scopeKey, hints: [] }] as never,
    window: { from: 0, to: 0, messages: [{ speaker: "User", text: "crossed", id: 0 }] } as never,
    client: { profileId: "review", role: "read" },
  });
};

beforeEach(() => jest.clearAllMocks());

control("a delta naming a quality the story does not declare is rejected", () => {
  expect(parseSharedReadResponse('DELTA nonexistent value=true evidence="x"', story()).deltas).toHaveLength(0);
});

finding("R5", () => {
  const parsed = parseSharedReadResponse('DELTA locked value=true evidence="invented"', story());
  must(
    parsed.deltas.length === 0,
    `the extractor was allowed to write a code-owned quality: the parser stamped the quality's declared source onto the model's delta, so the blackboard's source check saw ${JSON.stringify(parsed.deltas.map((entry) => ({ q: entry.delta.q, source: entry.delta.source })))} instead of an extractor claim`,
  );
});

describe("review: a shared read is bounded by the scope it asked for", () => {
  control("the requested quality is accepted from the window", async () => {
    const result = await readWith('DELTA crossed value=true evidence="crossed"', "crossed");
    expect(result.audit.acceptedDeltas.map((entry) => entry.delta.q)).toEqual(["crossed"]);
  });

  finding("R6", async () => {
    // Two halves, deliberately. The out-of-scope delta must be rejected AND the in-scope one, whose
    // evidence is the same seven characters, must still be accepted — so a rule that merely throws
    // away short evidence cannot close this finding.
    const outOfScope = await readWith('DELTA outside value=true evidence="crossed"', "crossed");
    const accepted = outOfScope.audit.acceptedDeltas.map((entry) => entry.delta.q);
    must(
      accepted.length === 0,
      `a delta for a quality outside the requested scope was accepted (${JSON.stringify(accepted)}): the declared scope is prompt guidance only, the consumer takes every parsed delta the judge did not already answer`,
    );
    const rejected = outOfScope.audit.rejected.map((entry) => entry.reason);
    must(
      rejected.some((reason) => /scope/i.test(reason)),
      `the out-of-scope delta was dropped without a scope reason, so the audit cannot say why (${JSON.stringify(rejected)})`,
    );
    const inScope = await readWith('DELTA crossed value=true evidence="crossed"', "crossed");
    must(
      inScope.audit.acceptedDeltas.length === 1,
      "short but legitimate evidence was rejected — a scope rule must not become an evidence-length rule",
    );
  });
});

describe("review: what a read refuses, and why the audit can say so", () => {
  it("names the scope and the window when it drops a delta", async () => {
    const scoped = await readWith('DELTA outside value=true evidence="crossed"', "crossed");
    expect(scoped.audit.rejected.map((entry) => entry.reason)).toContain("outside requested scope");
    const unquoted = await readWith('DELTA crossed value=true evidence="a phrase nobody wrote"', "crossed");
    expect(unquoted.audit.rejected.map((entry) => entry.reason)).toContain("evidence not in window");
    expect(unquoted.audit.acceptedDeltas).toEqual([]);
  });

  it("keeps the model's own line in the audit, not a reconstruction of it", async () => {
    const scoped = await readWith('DELTA outside value=true evidence="crossed"', "crossed");
    expect(scoped.audit.rejected[0].line).toBe('DELTA outside value=true evidence="crossed"');
  });

  it("refuses an oversized response whole and asks once more", async () => {
    const deltas = Array.from({ length: MAX_DELTAS_PER_READ + 1 }, (_, index) => `DELTA crossed value=${index % 2 === 0} evidence="crossed"`).join("\n");
    (callExtractionReply as jest.Mock).mockClear();
    const result = await readWith(deltas, "crossed");
    expect(callExtractionReply).toHaveBeenCalledTimes(2);
    expect(result.audit.acceptedDeltas).toEqual([]);
    expect(result.audit.rejected.map((entry) => entry.reason)).toEqual(["oversized response"]);
    expect(result.facts).toEqual([]);
    expect(result.memory).toEqual([]);
  });
});
