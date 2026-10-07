import type { EngineState, NormalizedStoryV2 } from "@engine/index";
import { beginRun, type RunGuard, type RunOwnership } from "./runToken";
import { storyRevision } from "./hash";
import { buildLoreRequests, loreCandidates, LORE_TIMEOUT_MS, pickLore, readLore, type LoreEntry, type LorePick } from "@judge/index";
import type { HostScannableEntry } from "@services/STAPI";
import type { WriteResult } from "@utils/writeResult";
import type { JudgeRuntime } from "./judge";

export type LoreTrigger = "MESSAGE_SENT" | "GENERATION_STARTED";

export interface LoreSelectDeps {
  judge: () => JudgeRuntime | null;
  getStory: () => NormalizedStoryV2 | null;
  getState: () => EngineState | null;
  getWindow: () => Array<{ speaker: string; text: string }>;
  getChatId: () => string | null;
  getLastMessageId: () => number;
  getEntries: () => Promise<HostScannableEntry[]>;
  force: (entries: HostScannableEntry[]) => Promise<WriteResult<{ entries: number }>>;
  // Optional: an unwired caller never lapses.
  ownership: RunOwnership;
}

export interface CompleteLoreSelection {
  chatId: string;
  storyKey: string;
  messageId: number;
  picks: Array<{ world: string; uid: number }>;
}

export const loreStoryKey = (story: NormalizedStoryV2): string => `${story.id ?? ""}@${storyRevision(story)}`;

export interface LoreSelection {
  trigger: LoreTrigger;
  cached: boolean;
  picks: Array<{ world: string; uid: number; comment: string; p: number }>;
}

const sameBook = (left: string, right: string) => left.trim().toLowerCase() === right.trim().toLowerCase();

// Force, never write: the only host effect is one WORLDINFO_FORCE_ACTIVATE for the
// next scan, so rollback has nothing to undo and a failure leaves ST's keyword scan as it was.
export class LoreSelector {
  private cache: { key: string; entries: HostScannableEntry[]; picks: LoreSelection["picks"] } | null = null;
  private complete: CompleteLoreSelection | null = null;

  constructor(private readonly deps: LoreSelectDeps) {}

  active(): boolean {
    return Boolean(this.deps.judge()?.active("loreSelect") && this.deps.getStory()?.lore_select?.lorebooks.length);
  }

  completeSelection(): CompleteLoreSelection | null {
    return this.complete;
  }

  async select(trigger: LoreTrigger): Promise<LoreSelection | null> {
    this.complete = null;
    const judge = this.deps.judge();
    const story = this.deps.getStory();
    const state = this.deps.getState();
    const scope = story?.lore_select;
    const checkpoint = story && state ? story.checkpointById[state.activeCheckpointId] : null;
    if (!judge || !story || !scope?.lorebooks.length || !checkpoint || !this.active()) return null;
    // The story is part of the key, not only the chat, the message and the scope: the cached entry
    // holds ENTRIES PICKED for one story's checkpoint and window, and a chat that swapped to another
    // story with the same lore scope used to match the departed story's cache and force its picks
    // into the new story's next generation (matrix).
    const key = `${this.deps.getChatId() ?? ""}:${loreStoryKey(story)}:${this.deps.getLastMessageId()}:${JSON.stringify(scope)}`;
    // Names four surfaces and this is one of them. force() pushes entries into the NEXT
    // generation, so a selection that outlives its chat seeds another chat prompt with this story
    // lore. Minted before the cache check, because the cached path forces too.
    const run = beginRun(this.deps.ownership);
    const messageId = this.deps.getLastMessageId();
    const chatId = this.deps.getChatId();
    const record = (picks: LoreSelection["picks"]) => {
      if (chatId !== null && run.stillOwns()) this.complete = { chatId, storyKey: loreStoryKey(story), messageId, picks: picks.map(({ world, uid }) => ({ world, uid })) };
    };
    if (this.cache?.key === key) {
      const cached = this.cache.picks;
      if (!(await this.forced(this.cache.entries, run))) return null;
      record(cached);
      return { trigger, cached: true, picks: cached };
    }
    const scannable = await this.deps.getEntries();
    const books = [...new Set(scannable.map((entry) => entry.world))].filter((world) => scope.lorebooks.some((name) => sameBook(name, world)));
    const byKey = new Map(scannable.map((entry) => [`${entry.world}.${entry.uid}`, entry]));
    const candidates = loreCandidates(
      scannable.map((entry): LoreEntry => ({
        world: entry.world,
        uid: entry.uid,
        comment: String(entry.comment ?? ""),
        content: String(entry.content ?? ""),
        ...(entry.disable ? { disable: true } : {}),
        ...(entry.constant ? { constant: true } : {})
      })),
      books,
    );
    if (!candidates.length) return null;
    const pickScope = { ...(scope.top_k !== undefined ? { topK: scope.top_k } : {}), ...(scope.min_p !== undefined ? { minP: scope.min_p } : {}) };
    const chunks = buildLoreRequests(candidates, { checkpointName: checkpoint.name, objective: checkpoint.objective, window: this.deps.getWindow() });
    const answered = await Promise.all(chunks.map(async (chunk) => {
      const result = await judge.ask("lore", chunk.request, {
        timeoutMs: LORE_TIMEOUT_MS,
        summarize: (answers): Record<string, number | string> => ({
          trigger,
          ...Object.fromEntries((answers ? pickLore(readLore(answers, chunk.entries), pickScope) : []).map((pick) => [pick.entry.comment || `${pick.entry.world}.${pick.entry.uid}`, pick.p]))
        }),
      });
      return result.answers ? readLore(result.answers, chunk.entries) : null;
    }));
    const picked: LorePick[] = pickLore(answered.flatMap((scored) => scored ?? []), pickScope);
    const entries = picked.flatMap((pick) => byKey.get(`${pick.entry.world}.${pick.entry.uid}`) ?? []);
    const picks = picked.map((pick) => ({ world: pick.entry.world, uid: pick.entry.uid, comment: pick.entry.comment, p: pick.p }));
    const everyAnswered = answered.every((scored) => scored !== null);
    if (run.stillOwns() && everyAnswered) this.cache = { key, entries, picks };
    if (!(await this.forced(entries, run))) return null;
    if (everyAnswered) record(picks);
    return { trigger, cached: false, picks };
  }

  // Matrix. The force is the only write on this path and its result used to be
  // discarded, so a host that refused it still produced a selection the caller treated as applied —
  // the prompt then carried ST's ordinary keyword scan and nothing said why. Nothing to force is
  // not a failure; a refused force is, and this says so. The token check lives here rather than at
  // the call sites because this is where the write is.
  private async forced(entries: HostScannableEntry[], run: RunGuard): Promise<boolean> {
    if (!run.stillOwns()) return false;
    if (!entries.length) return true;
    return (await this.deps.force(entries)).ok;
  }
}
