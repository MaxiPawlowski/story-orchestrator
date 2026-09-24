import { createLibrarySaveEvidence, journalLibrarySave, librarySaveSentence, missingFromServer, type SettingsSaveObservation } from "./librarySave";
import type { RunGuard } from "./runToken";
import type { StoryLibraryRecord } from "./types";

const record: StoryLibraryRecord = { id: "heist", version: 2, hash: "h", title: "Heist", description: "", raw: {}, importedAt: "2026-09-24T10:00:00.000Z", updatedAt: "2026-09-24T12:00:00.000Z" };
const ok = (burst = 1): SettingsSaveObservation => ({ requested: true, status: 200, ok: true, timedOut: false, failed: false, burst });
const held = (version: number, updatedAt: string) => [{ id: "other", version: 9 }, { id: "heist", version, updatedAt }];

const evidenceFor = (observation: SettingsSaveObservation, stored: unknown[] | null) => {
  const readBack = jest.fn(async () => stored);
  return { readBack, confirm: createLibrarySaveEvidence({ observe: async () => observation, readBack }) };
};

const guard = (owns: boolean): RunGuard => ({ stillOwns: () => owns, lapsed: () => (owns ? null : "chat"), lapsedDetail: () => (owns ? null : "chat moved"), signal: new AbortController().signal, release: () => {} });

describe("v2.4 plan 02 §7 (T8): a library save is claimed only on evidence", () => {
  it("control: a 2xx save and a server holding this record is Saved", async () => {
    const { confirm } = evidenceFor(ok(), held(2, record.updatedAt));
    const evidence = await confirm(record);
    expect(evidence).toEqual({ confirmed: true });
    expect(librarySaveSentence(record, evidence)).toBe("Saved “Heist” v2 to the library.");
  });

  it("a settings save answered 500 is not confirmed, and the server is not asked", async () => {
    const { confirm, readBack } = evidenceFor({ requested: true, status: 500, ok: false, timedOut: false, failed: false, burst: 1 }, held(2, record.updatedAt));
    const evidence = await confirm(record);
    expect(evidence).toEqual({ confirmed: false, reason: "the settings save answered 500" });
    expect(readBack).not.toHaveBeenCalled();
    expect(librarySaveSentence(record, evidence)).toBe("Saving “Heist” v2… not confirmed: the settings save answered 500.");
  });

  it("names a save that never went out and one that failed in flight apart", async () => {
    expect(await evidenceFor({ requested: false, status: null, ok: false, timedOut: true, failed: false }, []).confirm(record)).toEqual({ confirmed: false, reason: "no settings save request went out" });
    expect(await evidenceFor({ requested: true, status: null, ok: false, timedOut: false, failed: true }, []).confirm(record)).toEqual({ confirmed: false, reason: "the settings save request failed before the server answered" });
  });

  it("a 2xx save whose read-back holds an OLDER copy is not confirmed", async () => {
    const evidence = await evidenceFor(ok(), held(1, "2026-09-24T11:00:00.000Z")).confirm(record);
    expect(evidence).toEqual({ confirmed: false, reason: "the server holds v1 saved 2026-09-24T11:00:00.000Z" });
  });

  it("a read-back that could not be read, or that lacks the record, is not confirmed and says which", async () => {
    expect(await evidenceFor(ok(), null).confirm(record)).toEqual({ confirmed: false, reason: "the server's settings could not be read back" });
    expect(await evidenceFor(ok(), [{ id: "other", version: 1 }]).confirm(record)).toEqual({ confirmed: false, reason: "the server's library does not hold it" });
  });

  it("a later save of the same record that landed confirms this one", () => {
    expect(missingFromServer(held(3, "2026-09-24T09:00:00.000Z"), record)).toBeNull();
    expect(missingFromServer(held(2, "2026-09-24T13:00:00.000Z"), record)).toBeNull();
  });

  it("reads the server back once per save burst", async () => {
    let burst = 7;
    const readBack = jest.fn(async () => held(2, record.updatedAt));
    const confirm = createLibrarySaveEvidence({ observe: async () => ok(burst), readBack });
    await Promise.all([confirm(record), confirm(record)]);
    expect(readBack).toHaveBeenCalledTimes(1);
    burst = 8;
    await confirm(record);
    expect(readBack).toHaveBeenCalledTimes(2);
  });

  it("journals an unconfirmed save in the chat it was made from, and nowhere else", async () => {
    const journal = jest.fn();
    const refused = Promise.resolve({ confirmed: false as const, reason: "the settings save answered 500" });
    await journalLibrarySave(record, refused, guard(true), journal);
    expect(journal).toHaveBeenCalledWith("library save not confirmed", "“Heist” v2: the settings save answered 500");
    journal.mockClear();
    await journalLibrarySave(record, refused, guard(false), journal);
    await journalLibrarySave(record, Promise.resolve({ confirmed: true as const }), guard(true), journal);
    expect(journal).not.toHaveBeenCalled();
  });
});
