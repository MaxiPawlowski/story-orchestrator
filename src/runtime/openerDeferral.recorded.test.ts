import * as recorded from "../../test/fixtures/t6-4-herald.chat.json";
import type { Checkpoint } from "@engine/index";
import { executeSlashCommands } from "@services/STAPI";
import { EffectsApplier } from "./effectsApplier";
import { addressesPlayer, lastReplyAwaitsPlayer, playerAnsweredSince, sanitizeDeferredOpener } from "./openerDeferral";
import type { RuntimeExtras } from "./types";
import { testOwnership } from "../../test/findings/testOwnership";

type Row = { is_user: boolean; mes: string; name: string };

const host = { chat: [] as Row[], name1: recorded.persona };

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  getContext: () => host,
  executeSlashCommands: jest.fn(async () => undefined),
}));

const filler = Array.from({ length: 29 }, (_, index): Row => ({ is_user: index % 2 === 1, mes: "*Earlier.*", name: index % 2 === 1 ? recorded.persona : "Adolion Narrator" }));
const before: Row[] = [...filler, ...recorded.rows.filter((row) => row.index < 33).map(({ is_user, mes, name }) => ({ is_user, mes, name }))];
const herald = recorded.rows.find((row) => row.index === 33)?.mes ?? "";

const theDuel = {
  id: "the-duel",
  name: "The Duel",
  objective: "",
  type: "anchor",
  effects: { npc_replies: [{ trigger: "onEnter", member: "Adolion Narrator", kind: "scripted", text: herald }] },
} as unknown as Checkpoint;

const makeExtras = (): RuntimeExtras => ({ firedNpcReplies: {}, firedNpcRepliesAt: {}, lastSelfInjectionMessageId: null, effects: { ledger: [], cast: [] } } as unknown as RuntimeExtras);

const enter = (applier: EffectsApplier, extras: RuntimeExtras, gate: number) =>
  (applier as unknown as { fireOnEnter: (checkpoint: Checkpoint, extras: RuntimeExtras, gate?: number) => Promise<void> }).fireOnEnter(theDuel, extras, gate);

const posted = () => (executeSlashCommands as jest.Mock).mock.calls.filter(([command]) => String(command).startsWith("/sendas")).length;

describe("T6-4: the-duel's herald was posted over Natalia's unanswered demand (chat msgs 31-33)", () => {
  beforeEach(() => {
    (executeSlashCommands as jest.Mock).mockClear();
    host.chat = before.map((row) => ({ ...row }));
  });

  it("reads msg 32 as speech addressed to the player", () => {
    expect(lastReplyAwaitsPlayer(host.chat, [recorded.persona])).toBe(true);
  });

  it("holds the opener on entry, and posts it after the player's answer and the next reply", async () => {
    const applier = new EffectsApplier(testOwnership());
    const extras = makeExtras();
    await enter(applier, extras, 32);
    expect(posted()).toBe(0);
    expect(extras.deferredOpener).toEqual({ checkpointId: "the-duel", at: 32, gate: 32 });

    await applier.fireActiveReplies(theDuel, extras, "afterSpeak", null);
    expect(posted()).toBe(0);

    host.chat.push({ is_user: true, mes: "*I meet her eyes.* Father sold you to Valtara, Natalia.", name: recorded.persona });
    host.chat.push({ is_user: false, mes: "*Natalia goes very still.*", name: "Natalia" });
    await applier.fireActiveReplies(theDuel, extras, "afterSpeak", null);
    expect(posted()).toBe(1);
    expect(extras.deferredOpener).toBeUndefined();
  });

  it("drops a held opener once the story has left its checkpoint", async () => {
    const applier = new EffectsApplier(testOwnership());
    const extras = makeExtras();
    await enter(applier, extras, 32);
    host.chat.push({ is_user: true, mes: "I walk away.", name: recorded.persona });
    await applier.fireActiveReplies({ ...theDuel, id: "elsewhere" } as Checkpoint, extras, "afterSpeak", null);
    expect(posted()).toBe(0);
    expect(extras.deferredOpener).toBeUndefined();
  });

  it("reads the servant's summons (msg 29, 'your presence') as addressed too", () => {
    expect(lastReplyAwaitsPlayer(before.slice(0, 30), [recorded.persona])).toBe(true);
  });

  it("control: an entry that follows narration, not a line to the player, posts at once", async () => {
    host.chat = [...before.slice(0, 29), { is_user: false, mes: "*Dawn breaks grey over the dueling ground.*", name: "Adolion Narrator" }];
    expect(lastReplyAwaitsPlayer(host.chat, [recorded.persona])).toBe(false);
    const applier = new EffectsApplier(testOwnership());
    const extras = makeExtras();
    await enter(applier, extras, 29);
    expect(posted()).toBe(1);
    expect(extras.deferredOpener).toBeUndefined();
  });
});

describe("addressesPlayer", () => {
  it("counts a question or a second-person line in the last two spoken lines", () => {
    expect(addressesPlayer('*She waits.* "Where were you last night?"', ["Max Nightriver"])).toBe(true);
    expect(addressesPlayer('"The truth," she says. "Now, Max."', ["Max Nightriver"])).toBe(true);
    expect(addressesPlayer("*The door opens.* Will you go in?", ["Max Nightriver"])).toBe(true);
  });

  it("control: narration or speech to someone else is not addressed to the player", () => {
    expect(addressesPlayer("*The wind howls across the courtyard.*", ["Max Nightriver"])).toBe(false);
    expect(addressesPlayer('"Ronan, fetch the horses," Shiya says.', ["Max Nightriver"])).toBe(false);
  });

  it("an answer counts only when the player wrote after the held message", () => {
    const chat = [{ is_user: false, mes: "a" }, { is_user: true, mes: "b" }];
    expect(playerAnsweredSince(chat, 0)).toBe(true);
    expect(playerAnsweredSince(chat, 1)).toBe(false);
  });

  it("drops a malformed stored record", () => {
    expect(sanitizeDeferredOpener({ checkpointId: "x", at: 3 })).toEqual({ checkpointId: "x", at: 3 });
    expect(sanitizeDeferredOpener({ checkpointId: 1, at: 3 })).toBeUndefined();
  });
});
