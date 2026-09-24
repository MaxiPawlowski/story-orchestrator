import { createLibrarySaveEvidence, journalSettingsWrite, librarySaveSentence, missingFromServer, missingMigrated, onSettingsWrite, recordSettingsWrite, scopeToOpenChat, stillHeldByServer, type OpenChat, type SettingsSaveObservation, type WriteChatScope } from "./librarySave";
import type { StoryLibraryRecord } from "./types";

const record: StoryLibraryRecord = { id: "heist", version: 2, hash: "h", title: "Heist", description: "", raw: {}, importedAt: "2026-09-24T10:00:00.000Z", updatedAt: "2026-09-24T12:00:00.000Z" };
const ok = (burst = 1): SettingsSaveObservation => ({ requested: true, status: 200, ok: true, timedOut: false, failed: false, burst });
const held = (version: number, updatedAt: string) => [{ id: "other", version: 9 }, { id: "heist", version, updatedAt }];

const evidenceFor = (observation: SettingsSaveObservation, stored: unknown[] | null) => {
  const readBack = jest.fn(async () => stored);
  return { readBack, confirm: createLibrarySaveEvidence({ observe: async () => observation, readBack }) };
};

const guard = (open: boolean): WriteChatScope => ({ stillOpen: () => open });

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
    expect(evidence).toEqual({ confirmed: false, reason: "the settings save answered 500", request: 1 });
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
    await journalSettingsWrite("library save not confirmed", "“Heist” v2", refused, guard(true), journal);
    expect(journal).toHaveBeenCalledWith("library save not confirmed", "“Heist” v2: the settings save answered 500");
    journal.mockClear();
    await journalSettingsWrite("library save not confirmed", "“Heist” v2", refused, guard(false), journal);
    await journalSettingsWrite("library save not confirmed", "“Heist” v2", Promise.resolve({ confirmed: true as const }), guard(true), journal);
    expect(journal).not.toHaveBeenCalled();
  });

  it("scopes install-wide evidence to the chat open when the write started, whatever the run did since", () => {
    let open: OpenChat | null = { chatId: "chat-a", integrity: "i-a" };
    const scope = scopeToOpenChat(() => open);
    expect(scope.stillOpen()).toBe(true);
    open = { chatId: "chat-a", integrity: null };
    expect(scope.stillOpen()).toBe(true);
    open = { chatId: "chat-a", integrity: "i-other" };
    expect(scope.stillOpen()).toBe(false);
    open = { chatId: "chat-b", integrity: "i-a" };
    expect(scope.stillOpen()).toBe(false);
    open = null;
    expect(scope.stillOpen()).toBe(false);
    expect(scopeToOpenChat(() => null).stillOpen()).toBe(true);
  });
});

// v2.4 E3 completion: the library's other writes and the settings store read the same observation.
describe("v2.4 E3: every install-wide write reads its settings save", () => {
  it("a removal is confirmed once the server no longer holds the record, or holds a later save of it", () => {
    const removal = { id: "heist", at: "2026-09-24T12:00:00.000Z" };
    expect(stillHeldByServer(held(2, "2026-09-24T11:00:00.000Z"), removal)).toBe("the server's library still holds it");
    expect(stillHeldByServer(held(2, removal.at), removal)).toBe("the server's library still holds it");
    expect(stillHeldByServer([{ id: "other", version: 1 }], removal)).toBeNull();
    expect(stillHeldByServer(held(3, "2026-09-24T12:30:00.000Z"), removal)).toBeNull();
    expect(stillHeldByServer(null, removal)).toBe("the server's settings could not be read back");
  });

  it("a migration is confirmed only when the server holds every rekeyed record", () => {
    expect(missingMigrated([{ id: "a" }, { id: "b" }], ["a", "b"])).toBeNull();
    expect(missingMigrated([{ id: "a" }, { hash: "h1", title: "B" }], ["a", "b"])).toBe("the server's library does not hold b");
    expect(missingMigrated(null, ["a"])).toBe("the server's settings could not be read back");
  });

  it("arms a write's evidence only while something listens, and hands it over", () => {
    const arm = jest.fn(async () => ({ confirmed: true as const }));
    expect(recordSettingsWrite("s", "l", arm)).toBeNull();
    expect(arm).not.toHaveBeenCalled();
    const heard = jest.fn();
    const stop = onSettingsWrite(heard);
    const evidence = recordSettingsWrite("s", "l", arm);
    expect(heard).toHaveBeenCalledWith({ summary: "s", label: "l", evidence });
    stop();
    expect(recordSettingsWrite("s", "l", arm)).toBeNull();
    expect(arm).toHaveBeenCalledTimes(1);
  });

  it("one failed settings request that served several writes journals one row, labelled by the first", async () => {
    const journal = jest.fn();
    const refused = (request: number) => Promise.resolve({ confirmed: false as const, reason: "the settings save answered 500", request });
    await Promise.all([
      journalSettingsWrite("library save not confirmed", "“Heist” v2", refused(41), guard(true), journal),
      journalSettingsWrite("settings save not confirmed", "extraction", refused(41), guard(true), journal),
    ]);
    expect(journal.mock.calls).toEqual([["library save not confirmed", "“Heist” v2: the settings save answered 500"]]);
  });

  it("control: two failed settings requests journal two rows", async () => {
    const journal = jest.fn();
    const refused = (request: number) => Promise.resolve({ confirmed: false as const, reason: "the settings save answered 500", request });
    await journalSettingsWrite("library save not confirmed", "“Heist” v2", refused(42), guard(true), journal);
    await journalSettingsWrite("settings save not confirmed", "extraction", refused(43), guard(true), journal);
    expect(journal).toHaveBeenCalledTimes(2);
  });
});
