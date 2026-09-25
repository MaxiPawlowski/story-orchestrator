import { readFileSync } from "fs";
import { join } from "path";
import { ROLE_DIRECTOR_CASES, runRoleSelfTest } from "./roleSelfTest";

const send = jest.fn();

jest.mock("@services/STAPI", () => ({
  sendConnectionProfileRequest: (...args: unknown[]) => send(...args),
}));

beforeEach(() => send.mockReset());

const fixture = JSON.parse(readFileSync(join(__dirname, "..", "..", "test", "fixtures", "judge", "director.json"), "utf8")) as { rows: Array<{ id: string; acceptable: string[]; input: { candidates: unknown[]; allowSilence: boolean; window: unknown[] } }> };

describe("per-role self-test (v2.4 plan 08 T18)", () => {
  it("the three director cases are rows of the labelled director set, not a private copy that can drift", () => {
    expect(ROLE_DIRECTOR_CASES).toHaveLength(3);
    for (const entry of ROLE_DIRECTOR_CASES) {
      const row = fixture.rows.find((candidate) => candidate.id === entry.id);
      expect(row).toBeDefined();
      expect({ id: entry.id, acceptable: entry.acceptable, candidates: entry.input.candidates, allowSilence: entry.input.allowSilence, window: entry.input.window })
        .toEqual({ id: row!.id, acceptable: row!.acceptable, candidates: row!.input.candidates, allowSilence: row!.input.allowSilence, window: row!.input.window });
    }
  });

  it("director passes when every case answers a parseable SPEAKER line, and names the profile it asked", async () => {
    const result = await runRoleSelfTest("director", { profileId: "fast", debugResponses: ["SPEAKER: Ponticius", "SPEAKER: DM Narrator", "SPEAKER: NONE"] });
    expect(result).toMatchObject({ role: "director", profileId: "fast", status: "pass" });
    expect(result.detail).toContain("3 of 3");
  });

  it("director fails when a case answers prose instead of a SPEAKER line", async () => {
    const result = await runRoleSelfTest("director", { profileId: "fast", debugResponses: ["SPEAKER: Ponticius", "I think the narrator should describe the corridor at length.", "SPEAKER: NONE"] });
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("2 of 3");
  });

  it("curator passes when its fixture yields at least one op, fails when nothing parses", async () => {
    expect((await runRoleSelfTest("curator", { profileId: "c", debugResponses: ["[enable] The Old Tunnel | the party is in the tunnel now"] })).status).toBe("pass");
    expect((await runRoleSelfTest("curator", { profileId: "c", debugResponses: ["The lorebook looks fine to me."] })).status).toBe("fail");
  });

  it("synthesis passes on a non-empty summary after the channel noise is stripped", async () => {
    expect((await runRoleSelfTest("synthesis", { profileId: "s", debugResponses: ["Bel led the party into the tunnel by lantern light."] })).status).toBe("pass");
    expect((await runRoleSelfTest("synthesis", { profileId: "s", debugResponses: ["<think>\n</think>\n   "] })).status).toBe("fail");
  });

  it("authoring passes on valid proposal JSON and fails on prose", async () => {
    const valid = JSON.stringify({ summary: "Adds one quality.", ops: [{ kind: "addQuality", quality: { key: "lantern_lit", type: "bool", source: "extractor", rubric: "Is the lantern lit?" } }] });
    expect((await runRoleSelfTest("authoring", { profileId: "a", debugResponses: [valid] })).status).toBe("pass");
    expect((await runRoleSelfTest("authoring", { profileId: "a", debugResponses: ["Sure! Here are some ideas for qualities."] })).status).toBe("fail");
  });

  it("read runs the memory model self-test and fails when the core read misses the scene", async () => {
    const result = await runRoleSelfTest("read", { profileId: "m", debugResponses: ["NO_DELTA", "NO_DELTA"] });
    expect(result).toMatchObject({ role: "read", status: "fail" });
  });

  it("a transport failure is a failed self-test carrying the error, never a pass", async () => {
    send.mockResolvedValueOnce({ ok: false, kind: "transport", message: "API request failed: down" });
    const result = await runRoleSelfTest("synthesis", { profileId: "s" });
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("API request failed");
  });

  it("no profile means nothing is sent", async () => {
    const result = await runRoleSelfTest("curator", { profileId: null });
    expect(result.status).toBe("fail");
    expect(send).not.toHaveBeenCalled();
  });
});
