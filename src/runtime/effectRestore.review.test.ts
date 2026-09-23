const host = { chatId: "chat-a", group: { id: "g1", disabled_members: [] as string[] } };

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: [], chatId: host.chatId, extensionSettings: {}, chatMetadata: {}, characters: [] }),
  applyBackground: async () => ({ changed: false, from: "", to: "" }),
  applyCharacterAN: async () => undefined,
  clearCharacterAN: async () => undefined,
  applyPreset: () => ({ ok: true, name: "P" }),
  presetBackend: () => "textgenerationwebui",
  readAppliedPreset: () => null,
  findTextGenPreset: () => null,
  disableWIEntry: async () => true,
  enableWIEntry: async () => true,
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
import { reconcileLedger } from "./effectLedger";
import type { EffectLedgerRow, RuntimeExtras } from "./types";

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
} as EffectLedgerRow);

function harness() {
  const restored: EffectLedgerRow[] = [];
  let persisted = 0;
  const applier = new EffectsApplier(undefined, {
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
  return { applier, restored, persisted: () => persisted };
}

beforeEach(() => {
  host.chatId = "chat-a";
  host.group = { id: "g1", disabled_members: [] };
});

describe("V15: a chat puts back what it changed in shared host state", () => {
  it("leaving for ANOTHER chat restores the group but not the Author's Note (it is chat-scoped), and writes nothing into the new chat", async () => {
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
