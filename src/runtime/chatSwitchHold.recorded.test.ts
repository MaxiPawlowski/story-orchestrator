const host = { chatId: "chat-parent", group: { id: "1790919206079", disabled_members: [] as string[] }, calls: [] as string[], speakingAtSlash: [] as boolean[], speaking: () => false };

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: [], chatId: host.chatId, extensionSettings: {}, chatMetadata: {}, characters: [] }),
  applyBackground: async (name: string) => ({ ok: true, changed: true, from: "old.jpg", to: name }),
  applyCharacterAN: async (text: string) => ({ ok: true, text }),
  clearCharacterAN: async () => ({ ok: true, text: "" }),
  samplerApi: () => "textgen",
  readSamplerPreset: () => null,
  disableWIEntry: async () => ({ ok: true, changed: true }),
  enableWIEntry: async () => ({ ok: true, changed: true }),
  lorebookExists: async () => true,
  watchHostChatMove: () => () => undefined,
  guardHostStream: () => ({ halt: () => false, release: () => undefined }),
  isHostGenerating: () => false,
  stopHostGeneration: () => undefined,
  executeSlashCommands: async (command: string) => {
    host.speakingAtSlash.push(host.speaking());
    host.calls.push(command);
    return { pipe: "" };
  },
  getActiveGroup: () => host.group,
  resolveGroupMemberId: (name: string) => name,
  setGroupMembersDisabled: async (enable: string[], disable: string[]) => {
    host.calls.push(`group-save:${disable.length + enable.length}`);
    const flags = new Set(host.group.disabled_members);
    enable.forEach((member) => flags.delete(member));
    disable.forEach((member) => flags.add(member));
    host.group.disabled_members = [...flags];
    return { ok: true, group: host.group.id };
  },
  setGroupMemberFlags: async (groupId: string, flags: Array<{ member: string; disabled: boolean }>) => {
    host.calls.push(`group-save:${flags.length}`);
    const disabled = new Set(host.group.disabled_members);
    for (const flag of flags) {
      if (flag.disabled) disabled.add(flag.member);
      else disabled.delete(flag.member);
    }
    host.group.disabled_members = [...disabled];
    return { ok: true, members: flags.length };
  },
}));

import { readFileSync } from "fs";
import { join } from "path";
import { ChatSettle, chatSettle } from "./chatSettle";
import { gatedInterceptor, LoudGenerationGate } from "./loudGenerationGate";
import { EffectsApplier } from "./effectsApplier";
import type { RuntimeExtras } from "./types";
import { testOwnership } from "../../test/findings/testOwnership";

const FIXTURE = join(__dirname, "../../test/fixtures/t4-2-2-chat-switch.recorded.json");
const recorded = JSON.parse(readFileSync(FIXTURE, "utf8")) as {
  hydrate: { loadStartedAt: string; generationStartedAt: string; requestSentAt: string; continuingAt: string };
  castMirror: Array<{ member: string; disabled: boolean }>;
  groupId: string;
};

const ms = (iso: string) => Date.parse(iso);

describe("T4-2-2 finding 1: a reply waits for the opened chat's story to finish loading (Branch #1 -> parent, msg 16 Giada)", () => {
  const replay = async () => {
    const start = ms(recorded.hydrate.loadStartedAt);
    let now = start;
    const loadEndsAt = ms(recorded.hydrate.continuingAt);
    let finishLoad: () => void = () => undefined;
    const clock = {
      now: () => now,
      sleep: async (step: number) => {
        now += step;
        if (now >= loadEndsAt) finishLoad();
        await Promise.resolve();
      },
    };
    const settle = new ChatSettle(clock);
    const load = settle.track(new Promise<void>((resolve) => { finishLoad = resolve; }));
    now = ms(recorded.hydrate.generationStartedAt);
    const order: string[] = [];
    const interceptor = gatedInterceptor(new LoudGenerationGate(), () => true, async () => { order.push(`request@${now - start}`); }, undefined, async () => { order.push(`hold:${await settle.until()}`); });
    await interceptor([], 0, () => undefined, "normal");
    await load;
    return { order, requestAt: now, loadEndsAt };
  };

  it("the recorded generation started 5 s before the load ended; it now goes out only once the load has settled", async () => {
    const { order, requestAt, loadEndsAt } = await replay();
    expect(ms(recorded.hydrate.generationStartedAt)).toBeLessThan(loadEndsAt);
    expect(ms(recorded.hydrate.requestSentAt)).toBeLessThan(loadEndsAt);
    expect(order[0]).toBe("hold:settled");
    expect(requestAt).toBeGreaterThanOrEqual(loadEndsAt);
  });

  it("the load's own onEnter speech is not held behind the load it belongs to (no deadlock)", async () => {
    host.speakingAtSlash = [];
    host.speaking = () => chatSettle.speaking();
    const applier = new EffectsApplier(testOwnership());
    const extras = { requirements: { ready: true }, firedNpcReplies: {}, lastSelfInjectionMessageId: -1, effects: { ledger: [], cast: [] } } as unknown as RuntimeExtras;
    const checkpoint = { id: "on-the-road", effects: { npc_replies: [{ trigger: "onEnter", member: "Adolion Narrator", kind: "llm" }] } } as never;
    let release: () => void = () => undefined;
    const load = chatSettle.track(new Promise<void>((resolve) => { release = resolve; }));
    await applier.fireNpcReplies(checkpoint, extras, "onEnter");
    expect(host.speakingAtSlash).toEqual([true]);
    release();
    await load;
    expect(chatSettle.speaking()).toBe(false);
  });

  it("control: a reply asked while the load is still in flight and nothing of ours speaks times out instead of waiting forever", async () => {
    const settle = new ChatSettle({ now: (() => { let t = 0; return () => (t += 100); })(), sleep: async () => undefined });
    void settle.track(new Promise<void>(() => undefined));
    await expect(settle.until(1000)).resolves.toBe("timed-out");
  });
});

describe("T4-2-2 finding 1: the same-group hydrate puts the cast back in one group save, not one per member (05:49:16 -> 05:49:33)", () => {
  const extrasFor = (cast: Array<{ member: string; disabled: boolean }>) => ({
    requirements: { ready: true }, firedNpcReplies: {}, lastSelfInjectionMessageId: -1, lastAppliedCheckpointId: null, updatedAt: "x", settings: {},
    effects: { ledger: [], cast },
  }) as unknown as RuntimeExtras;

  beforeEach(() => {
    host.calls = [];
    host.group = { id: recorded.groupId, disabled_members: [] };
  });

  it(`the recorded ${"15"}-member mirror lands in one group save and two chat saves, every member its own applied row`, async () => {
    let persisted = 0;
    const applier = new EffectsApplier(testOwnership(), { persist: async () => { persisted += 1; } });
    const extras = extrasFor(recorded.castMirror);
    await applier.applyCheckpoint({ title: "Adolion: The Adventurer's Road", checkpointById: {}, checkpoints: [] } as never, { id: "on-the-road" } as never, extras, {} as never, "hydrate", ["on-the-road"]);
    expect(recorded.castMirror).toHaveLength(15);
    expect(host.calls.filter((call) => call.startsWith("group-save"))).toEqual([`group-save:${recorded.castMirror.length}`]);
    expect(persisted).toBe(2);
    expect(extras.effects.ledger.filter((row) => row.target.kind === "cast" && row.status === "applied")).toHaveLength(recorded.castMirror.length);
    expect([...host.group.disabled_members].sort()).toEqual(recorded.castMirror.filter((entry) => entry.disabled).map((entry) => entry.member).sort());
  });

  it("control: members the group already holds as the mirror says are not written again", async () => {
    host.group.disabled_members = recorded.castMirror.filter((entry) => entry.disabled).map((entry) => entry.member);
    let persisted = 0;
    const applier = new EffectsApplier(testOwnership(), { persist: async () => { persisted += 1; } });
    await applier.applyCheckpoint({ title: "S", checkpointById: {}, checkpoints: [] } as never, { id: "on-the-road" } as never, extrasFor(recorded.castMirror), {} as never, "hydrate", ["on-the-road"]);
    expect(host.calls.filter((call) => call.startsWith("group-save"))).toEqual([]);
    expect(persisted).toBe(0);
  });
});
