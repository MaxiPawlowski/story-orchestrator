// v2.6 plan 03 spike follow-up 2 (SP5 addendum 6). The competing-cards note read the cast while an earlier
// apply's cast writes were still landing: chat B's hydrate re-disabled its members one await at a time, a
// story selected 1.3 s after arrival planned its note in between, and the note named a card (Tahlia) the
// settled cast had already disabled. The note must read the cast after every cast write in flight settles.

const world = { chatId: "chat-b", group: { id: "g1", disabled_members: [] as string[] } };
const pending: Array<() => void> = [];
let holdCastWrites = false;

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  getContext: () => ({ chat: [], chatId: world.chatId, extensionSettings: {}, chatMetadata: {}, characters: [] }),
  applyBackground: async () => ({ ok: true }),
  applyCharacterAN: async (text: string) => ({ ok: true, text }),
  clearCharacterAN: async () => ({ ok: true, text: "" }),
  samplerApi: () => "textgen",
  readSamplerPreset: () => null,
  disableWIEntry: async () => ({ ok: true, changed: true }),
  enableWIEntry: async () => ({ ok: true, changed: true }),
  lorebookExists: () => true,
  executeSlashCommands: async () => ({ pipe: "" }),
  getActiveGroup: () => world.group,
  resolveGroupMemberId: (name: string) => name,
  setGroupMembersDisabled: (enable: string[], disable: string[]) => {
    const land = () => {
      world.group.disabled_members = [...world.group.disabled_members.filter((member) => !enable.includes(member)), ...disable];
    };
    if (!holdCastWrites) {
      land();
      return Promise.resolve({ ok: true });
    }
    return new Promise((resolve) => pending.push(() => { land(); resolve({ ok: true }); }));
  },
  setGroupMemberFlags: (_group: string, flags: Array<{ member: string; disabled: boolean }>) => {
    const land = () => {
      const disabled = new Set(world.group.disabled_members);
      for (const flag of flags) {
        if (flag.disabled) disabled.add(flag.member);
        else disabled.delete(flag.member);
      }
      world.group.disabled_members = [...disabled];
    };
    if (!holdCastWrites) {
      land();
      return Promise.resolve({ ok: true });
    }
    return new Promise((resolve) => pending.push(() => { land(); resolve({ ok: true }); }));
  },
  getCurrentBackground: () => ({ name: "" }),
  readGroupMemberDisabled: () => null,
  setGroupMemberDisabled: async () => ({ ok: true }),
}));

import { parseStoryV2OrThrow } from "@engine/index";
import { couldNot, wrote } from "@utils/writeResult";
import { EffectsApplier } from "../effectsApplier";
import { registerEffectExtension } from "../effectExtensions";
import { readEffectTarget, restoreEffectTarget } from "../effectHost";
import type { RuntimeExtras } from "../types";
import { testOwnership } from "../../../test/findings/testOwnership";
import { createScenarioExtension, type ScenarioHost } from "./sp5Scenario";

const CARDS = [{ name: "Arin", scenario: "Arin's card scene." }, { name: "Tahlia", scenario: "Tahlia's card scene." }];

const host: ScenarioHost = {
  enabled: () => true,
  read: () => ({ chatId: world.chatId, text: "" }),
  write: (chatId, text) => (chatId === world.chatId ? wrote({ chatId, text }) : couldNot("not the open chat")),
  cast: () => CARDS.filter((card) => !world.group.disabled_members.includes(card.name)),
};

const story = (id: string) => parseStoryV2OrThrow({
  format: 2, id, version: 1, title: id, description: "d",
  qualities: [{ key: "step", type: "int", source: "code", rubric: "Step." }],
  roster: [],
  checkpoints: [{ id: "start", name: "start", objective: "o", type: "anchor", start: true }],
  transitions: [],
});

const extrasFor = (cast: Array<{ member: string; disabled: boolean }> = []): RuntimeExtras => ({
  requirements: { ready: true }, firedNpcReplies: {}, lastSelfInjectionMessageId: -1, lastAppliedCheckpointId: null, updatedAt: "x", settings: {}, effects: { ledger: [], cast },
}) as unknown as RuntimeExtras;

const flush = async () => { for (let index = 0; index < 20; index += 1) await Promise.resolve(); };

let unregister: () => void = () => {};
beforeEach(() => {
  world.group.disabled_members = [];
  pending.length = 0;
  holdCastWrites = false;
  unregister = registerEffectExtension(createScenarioExtension(host));
});
afterEach(() => unregister());

const harness = () => {
  const notes: Array<{ summary: string; note?: string }> = [];
  const applier = new EffectsApplier(testOwnership(), { reads: { read: readEffectTarget }, restore: restoreEffectTarget, persist: async () => {}, journal: (summary, note) => { notes.push({ summary, note }); } });
  return { applier, notes };
};

describe("SP5 competing-cards note reads the settled cast (spike follow-up 2)", () => {
  it("a story selected while the chat's hydrate is still disabling a member names the cast as it settles", async () => {
    const h = harness();
    holdCastWrites = true;
    const leaving = story("nightriver-house");
    const hydrate = h.applier.applyCheckpoint(leaving, leaving.checkpointById.start, extrasFor([{ member: "Tahlia", disabled: true }]), {} as never, "hydrate", ["start"]);
    await flush();
    expect(pending).toHaveLength(1);
    const none = story("sets-none");
    const activate = h.applier.applyCheckpoint(none, none.checkpointById.start, extrasFor(), {} as never, "activate", ["start"]);
    await flush();
    pending.splice(0).forEach((land) => land());
    await Promise.all([hydrate, activate]);
    expect(h.notes.filter((note) => note.summary.includes("card scenario"))).toEqual([
      { summary: "1 character card scenario(s) frame this chat and the story sets none", note: "Arin" },
    ]);
  });

  it("control: with no cast write in flight the note names every card that frames the chat", async () => {
    const h = harness();
    const none = story("sets-none");
    await h.applier.applyCheckpoint(none, none.checkpointById.start, extrasFor(), {} as never, "activate", ["start"]);
    expect(h.notes.filter((note) => note.summary.includes("card scenario"))).toEqual([
      { summary: "2 character card scenario(s) frame this chat and the story sets none", note: "Arin, Tahlia" },
    ]);
  });
});
