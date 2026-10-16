import { syntheticRecallFixture } from "../../../test/support/recallKit";
import type { RecallFixture } from "./fixture";
import { scoreRecallFixture } from "./score";

const allPresent = (fixture: RecallFixture): RecallFixture => ({
  ...fixture,
  sessions: fixture.sessions.map((session) => ({
    ...session,
    reads: session.reads.map((read) => ({ ...read, response: read.response.split("\n").filter((line) => line.startsWith("WITNESS")).map((line) => line.replace(/ (?:heard=.*|mixed)$/, " heard=all-present")).join("\n") })),
  })),
});

describe("plan 43: the synthetic recall fixture replayed through the modules (no model, no vectors)", () => {
  const fixture = syntheticRecallFixture();

  it("meets the 21 §6.2 minimum shape and passes VR1, VR2, VR2s, VR2t, VR2k, VR3, VR8", () => {
    const report = scoreRecallFixture(fixture);
    expect(report.minimums).toEqual({ positives: true, exclusions: true, askers: true, secretScenes: true, sessions: true });
    expect(report.floors).toEqual({ vr1: true, vr2: true, vr2s: true, vr2t: true, vr2k: true, vr3: true, vr8: true, withheld: true });
    expect(report.vr2s.provenanceRefusals).toBe(report.vr2s.secretCandidates);
    expect(report.vr2k.forbiddenInPool).toBe(8);
    expect(report.vr8.baitRefused).toBe(report.vr8.bait);
    expect(report.verdict).toBe("pass");
  });

  it("control: a presence-style witness record (everyone heard everything) leaks nonce and secret spans and fails", () => {
    const report = scoreRecallFixture(allPresent(fixture));
    expect(report.vr2.nonceLines).toBeGreaterThan(0);
    expect(report.floors.vr2).toBe(false);
    expect(report.vr2s.leaks + report.vr2s.keptFromOnlyRefusals).toBeGreaterThan(0);
    expect(report.floors.vr2s).toBe(false);
    expect(report.verdict).toBe("fail");
  });

  it("a fixture below the minimum shape is insufficient, not scored as a pass", () => {
    const one = { ...fixture, sessions: [fixture.sessions[0]] };
    expect(scoreRecallFixture(one).verdict).toBe("insufficient");
  });

  it("a ranker plugs in after eligibility and cannot change what is eligible", () => {
    const reversed = scoreRecallFixture(fixture, (eligible) => [...eligible].reverse());
    expect(reversed.vr2.unwitnessedLines).toBe(0);
    expect(reversed.vr2s.leaks).toBe(0);
    expect(reversed.vr2t.originLines).toBe(0);
  });
});
