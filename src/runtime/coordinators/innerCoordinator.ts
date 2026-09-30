import { agencyForCheckpoint, renderAgencyPolicy, type EngineState, type NormalizedStoryV2 } from "@engine/index";
import { askText, type ModelCall } from "@extraction/modelRoute";
import { stripChannelNoise } from "@extraction/parse";
import type { InnerBeat } from "@memory/index";
import { pushBeat } from "@memory/innerRender";
import { INNER_BEAT_MAX_TOKENS, INNER_BEAT_REPAIR, parseInnerBeat, renderInnerBeatPrompt, type ParsedInnerBeat } from "@memory/innerBeat";
import { buildCandidates } from "@talk/index";
import { likelyNextSpeakers } from "@talk/nextSpeakers";
import { beginRun, type RunOwnership } from "../runToken";
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

type Row = { is_user?: boolean; is_system?: boolean } | null | undefined;

const turnKey = (chatId: string | null, rows: unknown[]) => {
  const lastUser = (rows as Row[]).map((row) => Boolean(row?.is_user)).lastIndexOf(true);
  return `${chatId ?? ""}:${lastUser}`;
};

export class InnerCoordinator {
  private spent = { key: "", calls: 0 };

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

  private async beatFor(story: NormalizedStoryV2, state: EngineState, rosterId: string, anchor: number, signal: AbortSignal, key: string): Promise<ParsedInnerBeat | null> {
    const member = story.roster.find((entry) => entry.id === rosterId);
    const checkpoint = story.checkpointById[state.activeCheckpointId];
    const prompt = renderInnerBeatPrompt({
      storyTitle: story.title,
      memberName: member?.name ?? rosterId,
      checkpointName: checkpoint?.name ?? state.activeCheckpointId,
      objective: checkpoint?.objective ?? "",
      agency: renderAgencyPolicy(agencyForCheckpoint(story, state.activeCheckpointId)),
      steering: this.deps.steering(),
      privateRows: this.deps.privateRows(rosterId),
      window: this.deps.window(Math.max(0, anchor - INNER_WINDOW_MESSAGES + 1), anchor).map(({ speaker, text }) => ({ speaker, text })),
    });
    const first = parseInnerBeat(await this.ask(prompt, signal));
    if (first || this.budget(key) <= 0) return first;
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
      const parsed = await this.beatFor(story, state, rosterId, anchor, run.signal, key);
      if (!run.stillOwns()) break;
      if (!parsed) {
        this.deps.journal("Inner beat unusable", `${rosterId}: no BEAT line after one repair`);
        continue;
      }
      const previous = (this.deps.getBeats() ?? []).filter((beat) => beat.memberId === rosterId && beat.chatId === chatId).at(-1);
      if (previous && !previous.used && previous.basedOnMessageId !== anchor) {
        this.deps.journal("Inner beat unused", `${rosterId}: the beat on message ${String(previous.basedOnMessageId)} was never drafted`);
      }
      this.deps.setBeats(pushBeat(this.deps.getBeats(), {
        chatId, memberId: rosterId, basedOnMessageId: anchor, checkpointId: state.activeCheckpointId,
        beat: parsed.beat, ...(parsed.tone ? { tone: parsed.tone } : {}), at: new Date().toISOString(),
      }));
    }
    const calls = this.spent.calls - before;
    if (calls && run.stillOwns()) await this.deps.persist();
    return calls;
  }
}
