import { runModelSelfTest } from "./selfTest";

const calls: string[] = [];

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  sendConnectionProfileRequest: jest.fn(async () => ""),
  getContext: () => ({ chat: [] }),
}));

jest.mock("@extraction/client", () => ({
  callExtractionModel: jest.fn(async (prompt: string, options: { debugResponse?: string | null }) => {
    calls.push(prompt);
    return options.debugResponse ?? "";
  }),
}));

const CORE_GOOD = [
  'DELTA q=location value="tunnel" evidence="She leads the way into the tunnel"',
  'DELTA q=has_lantern value=true evidence="I pick up the brass lantern"',
  'MEMORY type=event importance=2 expiration=session text="The party went down into the tunnel with a lit lantern." evidence="we go down"',
  '[arc] The debt owed to Bel for the ferry crossing',
].join("\n");

const CAPABILITY_GOOD = [
  '[hiding] Corin from Bel | the letter in his coat',
  '[state:Corin:character] wound=left arm',
].join("\n");

describe("runModelSelfTest", () => {
  beforeEach(() => { calls.length = 0; });

  it("refuses to run without a profile", async () => {
    const report = await runModelSelfTest({ profileId: null });
    expect(report.error).toContain("No memory model profile");
    expect(report.results).toEqual([]);
  });

  it("passes every tier when the model answers the fixtures", async () => {
    const report = await runModelSelfTest({ profileId: "p1", debugResponses: [CORE_GOOD, CAPABILITY_GOOD] });
    expect(report.results.map((result) => `${result.tier}:${result.status}`)).toEqual([
      "deltas:pass", "memory:pass", "arcs:pass", "epistemic:pass", "ledger:pass",
    ]);
    expect(report.suggestion).toBeUndefined();
  });

  it("suggests turning the capability profile off when the epistemic and ledger tiers come back empty", async () => {
    const report = await runModelSelfTest({ profileId: "p1", debugResponses: [CORE_GOOD, "NO_DELTA"] });
    expect(report.results.filter((result) => result.status === "fail").map((result) => result.tier)).toEqual(["epistemic", "ledger"]);
    expect(report.suggestion).toMatchObject({ epistemicLedgerCapable: false });
  });

  it("fails the core tiers on an empty answer without claiming capability data", async () => {
    const report = await runModelSelfTest({ profileId: "p1", debugResponses: ["NO_DELTA", "NO_DELTA"] });
    expect(report.results.every((result) => result.status === "fail")).toBe(true);
  });

  it("asks for epistemic and ledger lines only in the capability pass", async () => {
    await runModelSelfTest({ profileId: "p1", debugResponses: [CORE_GOOD, CAPABILITY_GOOD] });
    expect(calls).toHaveLength(2);
    expect(calls[0]).not.toContain("[hiding]");
    expect(calls[1]).toContain("[state:");
  });

  it("stops between passes when cancelled", async () => {
    const report = await runModelSelfTest({ profileId: "p1", debugResponses: [CORE_GOOD, CAPABILITY_GOOD], cancelled: () => calls.length >= 1 });
    expect(report.error).toBe("Cancelled.");
    expect(report.results).toEqual([]);
    expect(calls).toHaveLength(1);
  });
});

// v2.3 plan 01 §B (R12). The grader used to accept any line in a tier, so a model that answered
// fluently about the wrong things was certified capable. These are the cases that must now fail.
describe("runModelSelfTest grades meaning, not presence", () => {
  beforeEach(() => { calls.length = 0; });

  const WRONG_CORE = [
    'DELTA q=location value="tunnel" evidence="tunnel"',
    'MEMORY type=event importance=2 expiration=session text="A dragon conquered the distant moon." evidence="invented"',
    "[arc] Win the interstellar chess tournament",
  ].join("\n");
  const WRONG_CAPABILITY = ["[knows] Stranger | the moon is made of cheese", "[state:Stranger:character] costume=purple"].join("\n");

  it("fails every tier on well-formed content about the wrong entities", async () => {
    const report = await runModelSelfTest({ profileId: "p1", debugResponses: [WRONG_CORE, WRONG_CAPABILITY] });
    expect(report.error).toBeUndefined();
    expect(report.results.map((result) => `${result.tier}:${result.status}`)).toEqual([
      "deltas:fail", "memory:fail", "arcs:fail", "epistemic:fail", "ledger:fail",
    ]);
  });

  it("fails the delta tier when only one of the two stated facts is read", async () => {
    // The transcript says plainly that the lantern is taken AND that the party enters the tunnel.
    // Reading one is guessing from the checkpoint names, not reading the scene.
    const half = 'DELTA q=location value="tunnel" evidence="She leads the way into the tunnel"';
    const report = await runModelSelfTest({ profileId: "p1", debugResponses: [half, CAPABILITY_GOOD] });
    expect(report.results.find((result) => result.tier === "deltas")?.status).toBe("fail");
  });

  it("fails the memory tier on a well-formed line about another scene", async () => {
    const offTopic = [
      'DELTA q=location value="tunnel" evidence="She leads the way into the tunnel"',
      'DELTA q=has_lantern value=true evidence="I pick up the brass lantern"',
      'MEMORY type=event importance=2 expiration=session text="Bel once sold a horse in the capital." evidence="invented"',
      "[arc] The debt owed to Bel for the ferry crossing",
    ].join("\n");
    const report = await runModelSelfTest({ profileId: "p1", debugResponses: [offTopic, CAPABILITY_GOOD] });
    expect(report.results.find((result) => result.tier === "memory")?.status).toBe("fail");
  });

  it("fails the epistemic tier when the secret is attributed the wrong way round", async () => {
    // "Bel is hiding something from Corin" is the opposite claim to the one the transcript makes.
    const inverted = ["[hiding] Bel from Corin | the letter in his coat", "[state:Corin:character] wound=left arm"].join("\n");
    const report = await runModelSelfTest({ profileId: "p1", debugResponses: [CORE_GOOD, inverted] });
    expect(report.results.find((result) => result.tier === "epistemic")?.status).toBe("fail");
    expect(report.results.find((result) => result.tier === "ledger")?.status).toBe("pass");
  });

  it("accepts either ordering of the ledger pair", async () => {
    const flipped = ["[hiding] Corin from Bel | the letter in his coat", "[state:Corin:character] arm=wounded"].join("\n");
    const report = await runModelSelfTest({ profileId: "p1", debugResponses: [CORE_GOOD, flipped] });
    expect(report.results.find((result) => result.tier === "ledger")?.status).toBe("pass");
  });

  it("reports a transport failure as an error, never as a semantic fail, and never suggests a capability change", async () => {
    const client = jest.requireMock("@extraction/client") as { callExtractionModel: jest.Mock };
    client.callExtractionModel.mockRejectedValueOnce(new Error("backend unreachable"));
    const report = await runModelSelfTest({ profileId: "p1", debugResponses: [CORE_GOOD, CAPABILITY_GOOD] });
    expect(report.error).toContain("backend unreachable");
    expect(report.results.some((result) => result.status === "fail")).toBe(false);
    expect(report.suggestion).toBeUndefined();
  });

  it("does not suggest a capability change from a run that never graded both passes", async () => {
    const client = jest.requireMock("@extraction/client") as { callExtractionModel: jest.Mock };
    client.callExtractionModel.mockImplementationOnce(async (_prompt: string, options: { debugResponse?: string | null }) => {
      calls.push("core");
      return options.debugResponse ?? "";
    }).mockRejectedValueOnce(new Error("backend died between passes"));
    const report = await runModelSelfTest({ profileId: "p1", debugResponses: [CORE_GOOD, CAPABILITY_GOOD] });
    expect(report.error).toContain("backend died");
    expect(report.suggestion).toBeUndefined();
  });
});
