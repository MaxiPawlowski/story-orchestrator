import { runModelSelfTest } from "./selfTest";

const calls: string[] = [];

jest.mock("@services/STAPI", () => ({
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
