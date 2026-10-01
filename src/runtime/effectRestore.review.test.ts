const host = { chatId: "chat-a", group: { id: "g1", disabled_members: [] as string[] }, backgroundOk: true, calls: [] as string[] };

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: [], chatId: host.chatId, extensionSettings: {}, chatMetadata: {}, characters: [] }),
  applyBackground: async (name: string) => { host.calls.push(`bg:${name}`); return host.backgroundOk ? { ok: true, changed: true, from: "old.jpg", to: name } : { ok: false, reason: "ST did not switch" }; },
  applyCharacterAN: async (text: string) => { host.calls.push(`an:${text}`); return { ok: true, text }; },
  clearCharacterAN: async () => { host.calls.push("an:clear"); return { ok: true, text: "" }; },
  samplerApi: () => "textgen",
  readSamplerPreset: () => null,
  disableWIEntry: async () => ({ ok: true, changed: true }),
  enableWIEntry: async () => ({ ok: true, changed: true }),
  lorebookExists: async () => true,
  executeSlashCommands: async () => ({ pipe: "" }),
  getActiveGroup: () => host.group,
  resolveGroupMemberId: (name: string) => name,
  setGroupMembersDisabled: async (enable: string[], disable: string[]) => {
    const flags = new Set(host.group.disabled_members);
    enable.forEach((member) => flags.delete(member));
    disable.forEach((member) => flags.add(member));
    host.group.disabled_members = [...flags];
    return { ok: true, group: "g1" };
  },
}));

import { EffectsApplier } from "./effectsApplier";
import { samplerOverlay } from "./samplerOverlay";
import { reconcileLedger } from "./effectLedger";
import { restoreEffectTarget } from "./effectHost";
import type { EffectLedgerRow, RuntimeExtras } from "./types";
import { finding } from "../../test/findings/ledger";
import { testOwnership } from "../../test/findings/testOwnership";

const story = { title: "S", checkpointById: {}, checkpoints: [] } as never;
const extrasFor = (ledger: EffectLedgerRow[] = [], cast: Array<{ member: string; disabled: boolean }> = []) => ({
  requirements: { ready: true },
  firedNpcReplies: {},
  lastSelfInjectionMessageId: -1,
  lastAppliedCheckpointId: null,
  updatedAt: "x",
  settings: {},
  effects: { ledger, cast },
}) as unknown as RuntimeExtras;

const castRow = (id: string, member: string, before: boolean, after: boolean, messageId: number): EffectLedgerRow => ({
  id, effect: "cast", status: "applied", target: { kind: "cast", group: "g1", member }, before: { disabled: before }, after: { disabled: after }, checkpointId: "cp", boundary: 1, messageId, at: "t",
});
const anRow = (id: string, messageId: number): EffectLedgerRow => ({
  id, effect: "author_note", status: "applied", target: { kind: "an" }, before: { text: "" }, after: { text: "story note" }, checkpointId: "cp", boundary: 1, messageId, at: "t",
} as unknown as EffectLedgerRow);

function harness() {
  const restored: EffectLedgerRow[] = [];
  const notes: string[] = [];
  let persisted = 0;
  const applier = new EffectsApplier(testOwnership(), {
    journal: (summary) => { notes.push(summary); },
    reads: { read: (target) => (target.kind === "cast" ? { disabled: host.group.disabled_members.includes(target.member) } : target.kind === "an" ? { text: "story note" } : null) },
    restore: async (row) => {
      restored.push(row);
      if (row.target.kind === "cast") {
        const flags = new Set(host.group.disabled_members);
        if (row.before?.disabled) flags.add(row.target.member);
        else flags.delete(row.target.member);
        host.group.disabled_members = [...flags];
      }
      return true;
    },
    persist: async () => { persisted += 1; },
  });
  return { applier, restored, notes, persisted: () => persisted };
}

beforeEach(() => {
  host.chatId = "chat-a";
  host.group = { id: "g1", disabled_members: [] };
  host.backgroundOk = true;
  host.calls = [];
});

describe("V15: a chat puts back what it changed in shared host state", () => {
  // S2: a checkpoint's cast change used to outlive the chat that made it, on a group every chat shares.
  finding("S2", async () => {
    const h = harness();
    const extras = extrasFor([castRow("c1", "luke.png", false, true, 3), anRow("a1", 3)]);
    await h.applier.applyCheckpoint(story, { id: "cp" } as never, extras, {} as never, "hydrate", ["cp"]);
    host.group.disabled_members = ["luke.png"];
    host.chatId = "chat-b";
    const outcome = await h.applier.restoreFor(extras, "leave");
    expect(outcome.reverted).toBe(1);
    expect(h.restored.map((row) => row.target.kind)).toEqual(["cast"]);
    expect(host.group.disabled_members).toEqual([]);
    expect(h.persisted()).toBe(0);
  });

  it("control: 'leave' in the SAME chat (a reload, a re-select) restores nothing", async () => {
    const h = harness();
    const extras = extrasFor([castRow("c1", "luke.png", false, true, 3)]);
    await h.applier.applyCheckpoint(story, { id: "cp" } as never, extras, {} as never, "hydrate", ["cp"]);
    host.group.disabled_members = ["luke.png"];
    expect((await h.applier.restoreFor(extras, "leave")).reverted).toBe(0);
    expect(host.group.disabled_members).toEqual(["luke.png"]);
  });

  it("restart restores everything this chat changed, the Author's Note included, and persists", async () => {
    const h = harness();
    const extras = extrasFor([castRow("c1", "luke.png", false, true, 3), anRow("a1", 3)]);
    host.group.disabled_members = ["luke.png"];
    const outcome = await h.applier.restoreFor(extras, "restart");
    expect(outcome.reverted).toBe(2);
    expect(h.persisted()).toBe(1);
  });

  it("a rollback undoes only what was applied at or after the edited message, and the cast mirror follows", async () => {
    const h = harness();
    const extras = extrasFor([castRow("c1", "luke.png", false, true, 2), castRow("c2", "arin.png", false, true, 5)], [{ member: "luke.png", disabled: true }, { member: "arin.png", disabled: true }]);
    host.group.disabled_members = ["luke.png", "arin.png"];
    await h.applier.restoreFor(extras, { since: 5 });
    expect(host.group.disabled_members).toEqual(["luke.png"]);
    expect(extras.effects.cast).toEqual([{ member: "luke.png", disabled: true }, { member: "arin.png", disabled: false }]);
  });

  it("returning to the chat re-applies its cast mirror (the leave put the group back)", async () => {
    const h = harness();
    const extras = extrasFor([], [{ member: "luke.png", disabled: true }]);
    await h.applier.applyCheckpoint(story, { id: "cp" } as never, extras, {} as never, "hydrate", ["cp"]);
    expect(host.group.disabled_members).toEqual(["luke.png"]);
    expect(extras.effects.ledger.at(-1)).toMatchObject({ effect: "cast", status: "applied", after: { disabled: true } });
  });

  it("hydrate marks a row the host already holds the before-image for as reverted, so the next leave does not call it externally changed", () => {
    const { rows } = reconcileLedger([castRow("c1", "luke.png", false, true, 3)], { read: () => ({ disabled: false }) });
    expect(rows[0].status).toBe("reverted");
  });
});

// V15b: the Author's Note and the background were written straight to the host, so no row said what
// they replaced and nothing could put them back; the background restore reported `Boolean({...})`,
// always true; and a preset row was attempted and marked revert-failed on every leave.
describe("V15b: every checkpoint effect goes through the ledger", () => {
  const checkpoint = { id: "cp", effects: { author_note: "Whisper.", background: { name: "tavern.jpg" } } } as never;

  it("records the Author's Note and the background, with what they replaced, before touching the host", async () => {
    const h = harness();
    const extras = extrasFor();
    await h.applier.applyCheckpoint(story, checkpoint, extras, {} as never, "activate", ["cp"]);
    const rows = extras.effects.ledger.map((row) => ({ effect: row.effect, kind: row.target.kind, before: row.before, after: row.after, status: row.status }));
    expect(rows).toEqual([
      { effect: "author_note", kind: "an", before: { text: "story note" }, after: { text: "Whisper." }, status: "applied" },
      { effect: "background", kind: "background", before: null, after: { name: "tavern.jpg" }, status: "applied" },
    ]);
    expect(host.calls).toEqual(["an:Whisper.", "bg:tavern.jpg"]);
  });

  it("a background the host refused is recorded failed, not applied", async () => {
    const h = harness();
    const extras = extrasFor();
    host.backgroundOk = false;
    await h.applier.applyCheckpoint(story, checkpoint, extras, {} as never, "activate", ["cp"]);
    expect(extras.effects.ledger.find((row) => row.effect === "background")).toMatchObject({ status: "failed", reason: "ST did not switch" });
  });

  it("a preset row is an overlay: restart disarms it, attempts no host restore and claims nothing was left in place", async () => {
    const h = harness();
    samplerOverlay.set({ chatId: host.chatId, checkpointId: "cp", name: "Hot", api: "textgen", values: { temperature: 1.2 }, unknown: [] });
    const preset = { id: "p1", effect: "preset", status: "applied", target: { kind: "preset", name: "Hot", api: "textgen" }, before: null, after: { name: "Hot" }, checkpointId: "cp", boundary: 1, messageId: 3, at: "t" } as unknown as EffectLedgerRow;
    const extras = extrasFor([preset]);
    await h.applier.restoreFor(extras, "restart");
    expect(h.restored).toEqual([]);
    expect(extras.effects.ledger[0].status).toBe("applied");
    expect(h.notes.join("|")).not.toContain("left in place");
    expect(samplerOverlay.view()).toBeNull();
  });

  it("the restore seams answer what the host did: a refused background is not called restored", async () => {
    const background = { id: "b1", effect: "background", status: "applied", target: { kind: "background" }, before: { name: "old.jpg" }, after: { name: "tavern.jpg" }, checkpointId: "cp", boundary: 1, messageId: 3, at: "t" } as unknown as EffectLedgerRow;
    host.backgroundOk = false;
    await expect(restoreEffectTarget(background)).resolves.toBe(false);
    host.backgroundOk = true;
    await expect(restoreEffectTarget(background)).resolves.toBe(true);
    expect(host.calls).toEqual(["bg:old.jpg", "bg:old.jpg"]);
  });

  it("an empty Author's Note before-image restores by clearing through the AN seam", async () => {
    await expect(restoreEffectTarget(anRow("a1", 3))).resolves.toBe(true);
    expect(host.calls).toEqual(["an:clear"]);
  });
});

describe("item 7: leaving the 125-member Saga puts the whole start cast back in one group write", () => {
  const saga = ["Domas.png", "Rydel.png", ...Array.from({ length: 117 }, (_, index) => `m${index}.png`)];
  const sagaRows = () => saga.map((member, index) => castRow(`c${index}`, member, false, true, 0));

  const sagaHarness = (writesBeforeTheLeaveIsCut: number) => {
    const h = harness();
    let writes = 0;
    const batches: Array<Array<{ member: string; disabled: boolean }>> = [];
    const applier = new EffectsApplier(testOwnership(), {
      reads: { read: (target) => (target.kind === "cast" ? { disabled: host.group.disabled_members.includes(target.member) } : null) },
      restore: async (row) => {
        writes += 1;
        if (writes > writesBeforeTheLeaveIsCut) return new Promise<boolean>(() => {});
        h.restored.push(row);
        host.group.disabled_members = host.group.disabled_members.filter((member) => member !== (row.target as { member: string }).member);
        return true;
      },
      restoreCast: async (group, flags) => {
        writes += 1;
        if (writes > writesBeforeTheLeaveIsCut) return new Promise<boolean>(() => {});
        batches.push(flags);
        const disabled = new Set(host.group.disabled_members);
        for (const { member, disabled: off } of flags) (off ? disabled.add(member) : disabled.delete(member));
        host.group = { id: group, disabled_members: [...disabled] };
        return true;
      },
      persist: async () => {},
    });
    return { applier, batches };
  };

  it("one write restores all 119, Domas and Rydel (the first two the checkpoint disabled) included, so a leave cut short after it leaves nothing behind", async () => {
    host.group.disabled_members = [...saga];
    const { applier, batches } = sagaHarness(1);
    const extras = extrasFor(sagaRows());
    const outcome = await applier.restoreEffects(extras, extras.effects.ledger, false);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(119);
    expect(outcome.reverted).toBe(119);
    expect(host.group.disabled_members).toEqual([]);
    expect(extras.effects.ledger.every((row) => row.status === "reverted")).toBe(true);
  });

  it("a refused row (another chat changed it) stays out of the batch; a failed batch marks every row it carried", async () => {
    host.group.disabled_members = saga.filter((member) => member !== "Rydel.png");
    const { applier, batches } = sagaHarness(1);
    const extras = extrasFor(sagaRows());
    await applier.restoreEffects(extras, extras.effects.ledger, false);
    expect(batches[0].map((flag) => flag.member)).not.toContain("Rydel.png");
    expect(extras.effects.ledger.find((row) => row.target.kind === "cast" && row.target.member === "Rydel.png")?.status).toBe("externally-changed");

    host.group.disabled_members = [...saga];
    const failing = new EffectsApplier(testOwnership(), {
      reads: { read: (target) => (target.kind === "cast" ? { disabled: host.group.disabled_members.includes(target.member) } : null) },
      restore: async () => true,
      restoreCast: async () => false,
      persist: async () => {},
    });
    const again = extrasFor(sagaRows());
    expect((await failing.restoreEffects(again, again.effects.ledger, false)).reverted).toBe(0);
    expect(again.effects.ledger.every((row) => row.status === "revert-failed")).toBe(true);
  });

  it("control: without a batch seam the per-row restore still runs (one write per member, newest first)", async () => {
    host.group.disabled_members = [...saga];
    const h = harness();
    const extras = extrasFor(sagaRows());
    await h.applier.restoreEffects(extras, extras.effects.ledger, false);
    expect(h.restored).toHaveLength(119);
    expect(h.restored.slice(-2).map((row) => (row.target as { member: string }).member)).toEqual(["Rydel.png", "Domas.png"]);
  });
});
