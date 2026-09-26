import { recordingModel } from "../../../test/support/modelCall";
import { SP8_CONTROLS, SP8_ENTRIES, SP8_VIOLATIONS, type Sp8Case } from "../../../test/support/curatorSpikeCases";
import { testOwnership } from "../../../test/findings/testOwnership";
import { parseStoryV2OrThrow, type EngineState } from "@engine/index";
import type { CuratorOpRecord, CuratorProposalRecord } from "@stagecraft/index";
import { StagecraftCoordinator, type StagecraftCoordinatorDeps } from "./stagecraftCoordinator";
import { createStagecraft } from "../extras";
import { defaultSpikeSettings, type SpikeSettings } from "../settingsModel";
import type { StagecraftRuntimeState } from "../types";

type Entry = { uid: number; comment: string; key: string[]; content: string; disable: boolean };

const story = parseStoryV2OrThrow({
  format: 2, id: "sp8-fixture", title: "Crossing", description: "Curator.", qualities: [],
  checkpoints: [{ id: "cp1", name: "The bank", objective: "Cross", type: "anchor", start: true }], transitions: [], roster: [],
  stagecraft: { lorebooks: ["Story Lore"] },
});

const engineState = { activeCheckpointId: "cp1", boundary: 10, lastMessageId: 20, blackboard: { values: {}, versions: {}, latched: {} }, visitedAnchors: ["cp1"] } as unknown as EngineState;

const flags = (on: Partial<SpikeSettings>): SpikeSettings => ({ ...defaultSpikeSettings(), ...on });

function harness(entries: Entry[], options: { mode?: "auto" | "review"; spikes?: Partial<SpikeSettings> } = {}) {
  const book = new Map(entries.map((entry) => [entry.uid, { ...entry }]));
  const writes: Array<{ uid: number; content?: string; disabled?: boolean }> = [];
  let state: StagecraftRuntimeState = { ...createStagecraft(), settings: { ...createStagecraft().settings, curatorEnabled: true, acceptMode: options.mode ?? "review" } };
  const replies: string[] = [];
  const model = recordingModel(() => replies.shift() ?? "NONE");
  const view = (entry: Entry) => ({ comment: entry.comment, content: entry.content, keys: entry.key, constant: false, disabled: entry.disable, uid: entry.uid });
  const host = {
    loadLorebook: async () => ({ entries: Object.fromEntries([...book].map(([uid, entry]) => [uid, { ...entry }])) }),
    readWIEntry: async (_book: string, comment: string) => { const entry = [...book.values()].find((candidate) => candidate.comment === comment); return entry ? view(entry) : null; },
    readWIEntryAt: async ({ uid }: { uid: number }) => { const entry = book.get(uid); return entry ? view(entry) : null; },
    updateWIEntryByUid: async ({ uid }: { uid: number }, patch: { content?: string; disabled?: boolean }) => {
      const entry = book.get(uid);
      if (!entry) return { ok: false, reason: "gone" };
      writes.push({ uid, ...patch });
      if (patch.content !== undefined) entry.content = patch.content;
      if (patch.disabled !== undefined) entry.disable = patch.disabled;
      return { ok: true, confirmed: true };
    },
    restoreWIEntryAt: async () => ({ ok: true, confirmed: true }),
    setStoryExtensionPrompt: () => undefined,
    clearStoryExtensionPrompt: () => undefined,
  };
  const coordinator = new StagecraftCoordinator({
    hosts: { prompt: host, chat: { chatRows: () => [] }, player: { getPlayerName: () => "Max" }, curator: host } as never,
    getStory: () => story, getState: () => engineState, getStagecraft: () => state, setStagecraft: (next) => { state = next; },
    model, getCanon: () => "The flood took the bridge.", getOpenArcs: () => [], journal: () => undefined,
    persist: async () => undefined, notify: () => undefined, ownership: testOwnership(), spikes: () => flags(options.spikes ?? {}),
  } as StagecraftCoordinatorDeps);
  return {
    coordinator, writes, book,
    read: () => state,
    reply: (text: string) => replies.push(text),
    prompt: () => model.calls.at(-1)?.prompt ?? "",
    inject: (ops: CuratorOpRecord[]) => {
      const record: CuratorProposalRecord = { id: `inject-${state.proposals.length}`, curator: "wi", at: "", boundary: 10, messageId: 20, checkpointId: "cp1", reason: "replay", summary: "", mode: "review", ops, dropped: [] };
      state = { ...state, proposals: [...state.proposals, record] };
      return record.id;
    },
  };
}

const passOne = async (run: ReturnType<typeof harness>, entry: Sp8Case) => {
  run.reply(`${entry.line}\n[why] the story moved on`);
  const outcome = await run.coordinator.runCuratorPass("test");
  return { cards: outcome.record?.ops.length ?? 0, dropped: outcome.record?.dropped ?? run.read().lastPass?.dropped ?? [] };
};

const REFUSED = /touches protected text|adds a curator marker/;

describe("v2.5 plan 09 SP8 W1: protected spans through the coordinator", () => {
  it.each(SP8_VIOLATIONS.map((entry) => [entry.id, entry] as const))("plan time: violation %s never becomes a card", async (_id, entry) => {
    const run = harness(SP8_ENTRIES, { spikes: { sp8CuratorTiers: true } });
    const result = await passOne(run, entry);
    expect(result.cards).toBe(0);
    expect(result.dropped.some((reason: string) => REFUSED.test(reason))).toBe(true);
  });

  it.each(SP8_CONTROLS.map((entry) => [entry.id, entry] as const))("plan time: control %s becomes a card", async (_id, entry) => {
    const run = harness(SP8_ENTRIES, { spikes: { sp8CuratorTiers: true } });
    expect((await passOne(run, entry)).cards).toBe(1);
  });

  it("flag off (control): today every violation becomes a card", async () => {
    let cards = 0;
    for (const entry of SP8_VIOLATIONS) cards += (await passOne(harness(SP8_ENTRIES), entry)).cards;
    expect(cards).toBe(SP8_VIOLATIONS.length);
  });

  it("write edge: an accepted violation that skipped the plan is refused, and the book is untouched", async () => {
    const run = harness(SP8_ENTRIES, { spikes: { sp8CuratorTiers: true } });
    const id = run.inject(SP8_VIOLATIONS.map((entry) => ({ op: entry.op, status: "accepted" })));
    expect(await run.coordinator.applyAccepted()).toBe(0);
    const ops = run.read().proposals.find((record) => record.id === id)!.ops;
    expect(ops.map((entry) => entry.status)).toEqual(SP8_VIOLATIONS.map(() => "failed"));
    expect(ops.every((entry) => REFUSED.test(entry.message ?? ""))).toBe(true);
    expect(run.writes).toEqual([]);
  });

  it("write edge: accepted controls are written", async () => {
    const run = harness(SP8_ENTRIES, { spikes: { sp8CuratorTiers: true } });
    for (const entry of SP8_CONTROLS) {
      run.inject([{ op: entry.op, status: "accepted" }]);
      expect(await run.coordinator.applyAccepted()).toBe(1);
    }
    expect(run.writes).toHaveLength(SP8_CONTROLS.length);
    expect(run.book.get(1)!.content).toContain("{{// so:protect}}The king died in the winter of 402.{{// so:end}}");
  });

  it("write edge: the check reads the entry as it is at the write, not as it was planned", async () => {
    const run = harness(SP8_ENTRIES.map((entry) => (entry.comment === "The Ferry" ? { ...entry, content: "The ferry costs {{// so:protect}}one copper{{// so:end}}." } : entry)), { spikes: { sp8CuratorTiers: true } });
    run.inject([{ op: SP8_CONTROLS[3].op, status: "accepted" }]);
    expect(await run.coordinator.applyAccepted()).toBe(0);
    expect(run.writes).toEqual([]);
  });

  it("flag off (control): the same accepted violations are written today", async () => {
    const run = harness(SP8_ENTRIES);
    run.inject([{ op: SP8_VIOLATIONS[6].op, status: "accepted" }]);
    expect(await run.coordinator.applyAccepted()).toBe(1);
    expect(run.book.get(1)!.disable).toBe(true);
  });
});

const TIERED: Entry[] = [
  { uid: 11, comment: "Market", key: [], content: "{{// so:auto}}Market day is Thursday.", disable: true },
  { uid: 12, comment: "Weather", key: [], content: "{{// so:auto}}It rains.", disable: false },
  { uid: 13, comment: "Inn", key: [], content: "{{// so:auto}}The inn is shut.", disable: false },
  { uid: 14, comment: "Bells", key: [], content: "{{// so:auto}}The bells are silent.", disable: false },
  { uid: 21, comment: "Guild", key: [], content: "The guild meets in the granary.", disable: true },
  { uid: 22, comment: "Road", key: [], content: "The north road is safe.", disable: false },
  { uid: 23, comment: "Ferry", key: [], content: "The ferry costs one copper.", disable: false },
  { uid: 24, comment: "Mill", key: [], content: "The mill is burned.", disable: false },
];

const W2_PASSES = [
  "[enable] Market\n[disable] Weather\n[enable] Guild\n[disable] Road\n[why] the season turned",
  "[rewrite] Inn || {{// so:auto}}The inn is open again.\n[patch] Bells || are silent || ring again\n[rewrite] Ferry || The ferry costs two coppers.\n[patch] Mill || is burned || grinds again\n[why] the town recovered",
];

const AUTO = new Set(["Market", "Weather", "Inn", "Bells"]);

async function runW2(mode: "auto" | "review", spikes: Partial<SpikeSettings>) {
  const run = harness(TIERED, { mode, spikes });
  for (const reply of W2_PASSES) {
    run.reply(reply);
    await run.coordinator.runCuratorPass("test");
  }
  const decided = run.read().proposals.flatMap((record) => record.ops.map((entry) => ({ comment: (entry.op as { comment: string }).comment, status: entry.status })));
  await run.coordinator.applyAccepted();
  const after = run.read().proposals.flatMap((record) => record.ops.map((entry) => ({ comment: (entry.op as { comment: string }).comment, status: entry.status })));
  return { decided, after, written: run.writes.map((write) => TIERED.find((entry) => entry.uid === write.uid)!.comment) };
}

describe("v2.5 plan 09 SP8 W2: tier routing through the coordinator", () => {
  it("in auto, exactly the auto-tier ops are accepted and applied; the review-tier ops wait and are not written", async () => {
    const { decided, after, written } = await runW2("auto", { sp8CuratorTiers: true });
    expect(decided).toHaveLength(8);
    expect(decided.filter((entry) => AUTO.has(entry.comment)).map((entry) => entry.status)).toEqual(["accepted", "accepted", "accepted", "accepted"]);
    expect(decided.filter((entry) => !AUTO.has(entry.comment)).map((entry) => entry.status)).toEqual(["pending", "pending", "pending", "pending"]);
    expect(after.filter((entry) => AUTO.has(entry.comment)).map((entry) => entry.status)).toEqual(["applied", "applied", "applied", "applied"]);
    expect(after.filter((entry) => !AUTO.has(entry.comment)).map((entry) => entry.status)).toEqual(["pending", "pending", "pending", "pending"]);
    expect([...written].sort()).toEqual([...AUTO].sort());
  });

  it("control: flag off in auto accepts all eight, as today", async () => {
    const { decided } = await runW2("auto", {});
    expect(decided.map((entry) => entry.status)).toEqual(Array(8).fill("accepted"));
  });

  it("control: flag on in review leaves all eight pending", async () => {
    const { decided, written } = await runW2("review", { sp8CuratorTiers: true });
    expect(decided.map((entry) => entry.status)).toEqual(Array(8).fill("pending"));
    expect(written).toEqual([]);
  });
});
