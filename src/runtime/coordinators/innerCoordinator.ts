import { agencyForCheckpoint, renderAgencyPolicy, type EngineState, type NormalizedStoryV2 } from "@engine/index";
import { askText, type ModelCall } from "@extraction/modelRoute";
import { stripChannelNoise } from "@extraction/parse";
import type { InnerBeat } from "@memory/index";
import { freshBeat, pushBeat, turnAnchor } from "@memory/innerRender";
import { INNER_BEAT_MAX_TOKENS, INNER_BEAT_REPAIR, parseInnerBeat, renderInnerBeatPrompt, type ParsedInnerBeat } from "@memory/innerBeat";
import { buildCandidates } from "@talk/index";
import { likelyNextSpeakers } from "@talk/nextSpeakers";
import { beginRun, type RunGuard, type RunOwnership } from "../runToken";
import type { InnerFanOut } from "../types";

export const INNER_CALLS_PER_TURN = 2;
export const INNER_WINDOW_MESSAGES = 8;

export interface InnerWindowMessage {
  speaker: string;
  text: string;
  isUser: boolean;
}

export interface InnerCoordinatorDeps {
  getStory: () => NormalizedStoryV2 | null;
  getState: () => EngineState | null;
  model: ModelCall;
  ownership: RunOwnership;
  fanOut: () => InnerFanOut;
  chatId: () => string | null;
  chatRows: () => unknown[];
  window: (from: number, to: number) => InnerWindowMessage[];
  group: () => boolean;
  enabledIds: () => string[];
  lastSpeaker: () => string | null;
  privateRows: (rosterId: string) => string;
  steering: () => string;
  getBeats: () => InnerBeat[] | undefined;
  setBeats: (next: InnerBeat[]) => void;
  persist: () => Promise<void>;
  journal: (summary: string, note?: string) => void;
}

type Row = { is_user?: boolean; is_system?: boolean; name?: string } | null | undefined;

const turnKey = (chatId: string | null, rows: unknown[]) => {
  const lastUser = (rows as Row[]).map((row) => Boolean(row?.is_user)).lastIndexOf(true);
  return `${chatId ?? ""}:${lastUser}`;
};

const draftAnchor = (rows: unknown[], memberName: string | undefined): number => {
  const newest = rows.length - 1;
  const row = rows[newest] as Row;
  return row && !row.is_user && memberName !== undefined && row.name === memberName ? newest - 1 : newest;
};

export class InnerCoordinator {
  private spent = { key: "", calls: 0 };
  private drafted = { key: "", members: new Set<string>() };
  private inflight = new Map<string, Promise<unknown>>();

  constructor(private readonly deps: InnerCoordinatorDeps) {}

  candidates(story: NormalizedStoryV2, state: EngineState): string[] {
    if (!this.deps.group()) return story.roster.length === 1 ? [story.roster[0].id] : [];
    const control = story.checkpointById[state.activeCheckpointId]?.talk_control ?? {};
    const pool = buildCandidates(control, story.roster, this.deps.enabledIds());
    const limit = this.deps.fanOut() === "top2" ? 2 : 1;
    return likelyNextSpeakers(control, pool, this.deps.lastSpeaker(), limit).map((candidate) => candidate.rosterId);
  }

  private budget(key: string): number {
    if (this.spent.key !== key) this.spent = { key, calls: 0 };
    return INNER_CALLS_PER_TURN - this.spent.calls;
  }

  private async ask(prompt: string, signal: AbortSignal): Promise<string> {
    this.spent.calls += 1;
    return stripChannelNoise(await askText(this.deps.model, prompt, { role: "inner", pass: "inner", maxTokens: INNER_BEAT_MAX_TOKENS, signal }));
  }

  private async beatFor(
    story: NormalizedStoryV2, state: EngineState, rosterId: string, anchor: number, signal: AbortSignal, key: string, repair = true,
  ): Promise<ParsedInnerBeat | null> {
    const member = story.roster.find((entry) => entry.id === rosterId);
    const checkpoint = story.checkpointById[state.activeCheckpointId];
    const prompt = renderInnerBeatPrompt({
      storyTitle: story.title,
      memberName: member?.name ?? rosterId,
      ...(member?.role ? { memberRole: member.role } : {}),
      checkpointName: checkpoint?.name ?? state.activeCheckpointId,
      objective: checkpoint?.objective ?? "",
      agency: renderAgencyPolicy(agencyForCheckpoint(story, state.activeCheckpointId)),
      steering: this.deps.steering(),
      privateRows: this.deps.privateRows(rosterId),
      window: this.deps.window(Math.max(0, anchor - INNER_WINDOW_MESSAGES + 1), anchor).map(({ speaker, text }) => ({ speaker, text })),
    });
    const first = parseInnerBeat(await this.ask(prompt, signal));
    if (first || !repair || this.budget(key) <= 0) return first;
    return parseInnerBeat(await this.ask(`${prompt}\n\n${INNER_BEAT_REPAIR}`, signal));
  }

  async run(): Promise<number> {
    const story = this.deps.getStory();
    const state = this.deps.getState();
    const rows = this.deps.chatRows();
    const anchor = rows.length - 1;
    const reply = rows[anchor] as { is_user?: boolean; is_system?: boolean } | undefined;
    if (!story || !state || !reply || reply.is_user || reply.is_system) return 0;
    const chatId = this.deps.chatId() ?? "";
    const key = turnKey(chatId, rows);
    const run = beginRun(this.deps.ownership, { from: anchor, to: anchor });
    const before = this.spent.key === key ? this.spent.calls : 0;
    for (const rosterId of this.candidates(story, state)) {
      if (this.budget(key) <= 0) break;
      if (!await this.build(story, state, rosterId, anchor, run, key, true)) break;
    }
    const calls = this.spent.calls - before;
    if (calls && run.stillOwns()) await this.deps.persist();
    return calls;
  }

  async ensureFor(rosterId: string): Promise<boolean> {
    const story = this.deps.getStory();
    const state = this.deps.getState();
    const rows = this.deps.chatRows();
    if (!story || !state || !rows.length) return false;
    const chatId = this.deps.chatId() ?? "";
    const fresh = () => freshBeat(this.deps.getBeats(), rosterId, turnAnchor(chatId, state.activeCheckpointId, rows)) !== null;
    if (fresh()) return true;
    const pending = this.inflight.get(`${chatId}:${rosterId}`);
    if (pending) await pending.catch(() => undefined);
    if (fresh()) return true;
    const key = turnKey(chatId, rows);
    if (this.drafted.key !== key) this.drafted = { key, members: new Set() };
    if (this.drafted.members.has(`${state.activeCheckpointId}:${rosterId}`)) return false;
    this.drafted.members.add(`${state.activeCheckpointId}:${rosterId}`);
    const anchor = draftAnchor(rows, story.roster.find((member) => member.id === rosterId)?.name);
    const run = beginRun(this.deps.ownership, { from: anchor, to: anchor });
    await this.build(story, state, rosterId, anchor, run, key, false);
    return fresh();
  }

  private build(
    story: NormalizedStoryV2, state: EngineState, rosterId: string, anchor: number, run: RunGuard, key: string, repair: boolean,
  ): Promise<boolean> {
    const slot = `${this.deps.chatId() ?? ""}:${rosterId}`;
    const work = this.write(story, state, rosterId, anchor, run, key, repair);
    this.inflight.set(slot, work);
    return work.finally(() => { if (this.inflight.get(slot) === work) this.inflight.delete(slot); });
  }

  private async write(
    story: NormalizedStoryV2, state: EngineState, rosterId: string, anchor: number, run: RunGuard, key: string, repair: boolean,
  ): Promise<boolean> {
    const chatId = this.deps.chatId() ?? "";
    const parsed = await this.beatFor(story, state, rosterId, anchor, run.signal, key, repair);
    if (!run.stillOwns()) return false;
    if (!parsed) {
      this.deps.journal("Inner beat unusable", `${rosterId}: no BEAT line${repair ? " after one repair" : ""}`);
      return true;
    }
    const previous = (this.deps.getBeats() ?? []).filter((beat) => beat.memberId === rosterId && beat.chatId === chatId).at(-1);
    if (previous && !previous.used && previous.basedOnMessageId !== anchor) {
      this.deps.journal("Inner beat unused", `${rosterId}: the beat on message ${String(previous.basedOnMessageId)} was never drafted`);
    }
    this.deps.setBeats(pushBeat(this.deps.getBeats(), {
      chatId, memberId: rosterId, basedOnMessageId: anchor, checkpointId: state.activeCheckpointId,
      beat: parsed.beat, ...(parsed.tone ? { tone: parsed.tone } : {}), at: new Date().toISOString(),
    }));
    return true;
  }
}
