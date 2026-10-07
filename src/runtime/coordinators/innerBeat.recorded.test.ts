import type { ModelCall } from "@extraction/index";
import type { InnerBeat } from "@memory/index";
import { beatAnchorId, freshBeat } from "@memory/innerRender";
import * as recorded from "../../../test/fixtures/t3-1-inner-turns.recorded.json";
import { mintToken, tokenMatches, type RunContext, type RunOwnership } from "../runToken";
import { createInnerBeatHost } from "../innerBeatHost";
import type { InnerCoordinatorDeps } from "./innerCoordinator";

type Message = { id: number; speaker: string; isUser: boolean };
type Talk = { lead: string; speakers: Array<{ member: string; weight: number }>; no_repeat?: boolean };

const roster = recorded.roster as Array<{ id: string; name: string }>;
const checkpoints = recorded.checkpoints as Array<{ id: string; name: string; talk_control: Talk }>;
const messages = recorded.messages as Message[];
const story = {
  title: "Adolion - Crimsonwing & Ebonwing",
  id: "adolion-deep",
  roster,
  checkpointById: Object.fromEntries(checkpoints.map((checkpoint) => [checkpoint.id, { ...checkpoint, objective: "", type: "anchor" }])),
  outgoingByCheckpoint: {},
};
const idOf = (name: string) => roster.find((member) => member.name === name)!.id;
const checkpointAfter = (messageId: number) => recorded.transitions.filter((entry) => entry.messageId <= messageId).at(-1)?.to ?? recorded.start;

const replay = async (draftFill: boolean) => {
  const current: RunContext = { chatId: "t3-1", storyId: "adolion-deep", storyHash: "h1", sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  const ownership: RunOwnership = { mint: (window = null) => mintToken(current, window), check: (token) => tokenMatches(current, token) };
  const rows: Array<{ name: string; mes: string; is_user?: boolean }> = [];
  const state = { activeCheckpointId: recorded.start };
  let beats: InnerBeat[] | undefined;
  let calls = 0;
  const model = (async () => { calls += 1; return { text: "BEAT: Hold the line.", finish: "stop" }; }) as unknown as ModelCall;
  const deps: InnerCoordinatorDeps = {
    getStory: () => story as never,
    getState: () => state as never,
    model,
    ownership,
    fanOut: () => "lead",
    chatId: () => current.chatId,
    chatRows: () => rows,
    window: (from, to) => rows.slice(from, to + 1).map((row) => ({ speaker: row.name, text: row.mes, isUser: Boolean(row.is_user) })),
    group: () => true,
    enabledIds: () => roster.map((member) => member.id),
    lastSpeaker: () => { const last = [...rows].reverse().find((row) => !row.is_user); return last ? idOf(last.name) : null; },
    privateRows: () => "",
    steering: () => "",
    getBeats: () => beats,
    setBeats: (next) => { beats = next; },
    persist: async () => {},
    journal: () => {},
  };
  const host = createInnerBeatHost({ ...deps, enabled: () => true, memberName: (id) => id });
  const tally = { drafts: 0, hits: 0, exactAnchorHits: 0, calls: 0 };
  for (const message of messages) {
    if (message.id > 0 && !message.isUser) {
      const member = idOf(message.speaker);
      state.activeCheckpointId = checkpointAfter(message.id - 1);
      tally.drafts += 1;
      tally.exactAnchorHits += freshBeat(beats, member, { chatId: current.chatId, checkpointId: state.activeCheckpointId, basedOn: beatAnchorId(rows) }) ? 1 : 0;
      if (draftFill) await host.prepare(member);
      tally.hits += host.beatFor(member) ? 1 : 0;
    }
    rows.push({ name: message.speaker, mes: `message ${message.id}`, ...(message.isUser ? { is_user: true } : {}) });
    state.activeCheckpointId = checkpointAfter(message.id);
    if (message.id > 0 && !message.isUser) await host.run();
  }
  return { ...tally, calls };
};

describe("T3-1 inner beats over the recorded turn order (16 used, 13 unused, 16 stale for Ced in the journal)", () => {
  it("records the session's counts this replay is measured against", () => {
    expect(recorded.recorded).toEqual({ passes: 24, used: 16, unused: 13, stale: 16, none: 65 });
    expect(messages.filter((message) => message.id > 0 && !message.isUser)).toHaveLength(28);
  });

  it("prediction alone (the boundary pass guessing the lead) reaches 9 of 28 drafts; the old exact-reply anchor reached 5", async () => {
    expect(await replay(false)).toEqual({ drafts: 28, hits: 9, exactAnchorHits: 5, calls: 22 });
  });

  it("with the draft-time fill all 28 drafted members get their own beat, for 15 more calls (one per draft the guess missed, at most)", async () => {
    const filled = await replay(true);
    expect(filled).toEqual({ drafts: 28, hits: 28, exactAnchorHits: 5, calls: 37 });
    expect(filled.calls - 22).toBeLessThanOrEqual(28 - 9);
  });
});
