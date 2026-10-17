const calls: Array<{ lorebook: string; guard: { stillOwns(): boolean } | undefined }> = [];
const hostWrite = { onCall: null as null | (() => void) };

jest.mock("@services/STAPI", () => ({
  lorebookExists: () => true,
  setWIEntriesState: async (lorebook: string, _switches: unknown, guard?: { stillOwns(): boolean }) => {
    calls.push({ lorebook, guard });
    hostWrite.onCall?.();
    return guard && !guard.stillOwns() ? { ok: false, reason: "lapsed" } : { ok: true, changed: true, confirmed: true };
  },
  applyCharacterAN: async () => {},
  clearCharacterAN: async () => {},
  executeSlashCommands: async () => true,
  groupMemberPosition: () => ({ ok: true, position: 0 }),
  readSamplerPreset: () => null,
}));

import { applyWorldInfo } from "./effectSteps";

const owner = () => {
  let owned = true;
  return { run: { stillOwns: () => owned, lapsed: () => (owned ? null : "chat" as const), lapsedDetail: () => null, signal: new AbortController().signal, release: () => undefined }, lapse: () => { owned = false; } };
};
const plans = [{ lorebook: "Book A", enable: ["one"], disable: [] }, { lorebook: "Book B", enable: [], disable: ["two"] }];

beforeEach(() => { calls.length = 0; hostWrite.onCall = null; });

describe("review 2026-10-16 #2: the checkpoint WI replay hands its run to the host writer", () => {
  it("each host write receives the run, so a lapse inside the write's own awaits is seen at the write edge", async () => {
    const { run, lapse } = owner();
    hostWrite.onCall = lapse;
    await applyWorldInfo(plans, run);
    expect(calls).toHaveLength(1);
    expect(calls[0].guard).toBe(run);
    expect(calls[0].guard?.stillOwns()).toBe(false);
  });

  it("control: an owned run writes every book with its run", async () => {
    const { run } = owner();
    await applyWorldInfo(plans, run);
    expect(calls.map((call) => [call.lorebook, call.guard === run])).toEqual([["Book A", true], ["Book B", true]]);
  });
});
