import type { EngineState, NormalizedStoryV2 } from "@engine/index";
import { buildLoreRequests, loreCandidates, LORE_TIMEOUT_MS, pickLore, readLore, type LoreEntry, type LorePick } from "@judge/index";
import type { HostScannableEntry } from "@services/STAPI";
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
  force: (entries: HostScannableEntry[]) => Promise<boolean>;
}

export interface LoreSelection {
  trigger: LoreTrigger;
  cached: boolean;
  picks: Array<{ world: string; uid: number; comment: string; p: number }>;
}

const sameBook = (left: string, right: string) => left.trim().toLowerCase() === right.trim().toLowerCase();

// v2.2 plan 04. Force, never write: the only host effect is one WORLDINFO_FORCE_ACTIVATE for the
// next scan, so rollback has nothing to undo and a failure leaves ST's keyword scan as it was.
export class LoreSelector {
  private cache: { key: string; entries: HostScannableEntry[]; picks: LoreSelection["picks"] } | null = null;

  constructor(private readonly deps: LoreSelectDeps) {}

  active(): boolean {
    return Boolean(this.deps.judge()?.active("loreSelect") && this.deps.getStory()?.lore_select?.lorebooks.length);
  }

  async select(trigger: LoreTrigger): Promise<LoreSelection | null> {
    const judge = this.deps.judge();
    const story = this.deps.getStory();
    const state = this.deps.getState();
    const scope = story?.lore_select;
    const checkpoint = story && state ? story.checkpointById[state.activeCheckpointId] : null;
    if (!judge || !scope?.lorebooks.length || !checkpoint || !this.active()) return null;
    const key = `${this.deps.getChatId() ?? ""}:${this.deps.getLastMessageId()}:${JSON.stringify(scope)}`;
    if (this.cache?.key === key) {
      await this.deps.force(this.cache.entries);
      return { trigger, cached: true, picks: this.cache.picks };
    }
    const scannable = await this.deps.getEntries();
    const books = [...new Set(scannable.map((entry) => entry.world))].filter((world) => scope.lorebooks.some((name) => sameBook(name, world)));
    const byKey = new Map(scannable.map((entry) => [`${entry.world}.${entry.uid}`, entry]));
    const candidates = loreCandidates(scannable.map((entry): LoreEntry => ({ world: entry.world, uid: entry.uid, comment: String(entry.comment ?? ""), content: String(entry.content ?? ""), ...(entry.disable ? { disable: true } : {}), ...(entry.constant ? { constant: true } : {}) })), books);
    if (!candidates.length) return null;
    const pickScope = { ...(scope.top_k !== undefined ? { topK: scope.top_k } : {}), ...(scope.min_p !== undefined ? { minP: scope.min_p } : {}) };
    const chunks = buildLoreRequests(candidates, { checkpointName: checkpoint.name, objective: checkpoint.objective, window: this.deps.getWindow() });
    const scored = (await Promise.all(chunks.map(async (chunk) => {
      const result = await judge.ask("lore", chunk.request, {
        timeoutMs: LORE_TIMEOUT_MS,
        summarize: (answers): Record<string, number | string> => ({ trigger, ...Object.fromEntries((answers ? pickLore(readLore(answers, chunk.entries), pickScope) : []).map((pick) => [pick.entry.comment || `${pick.entry.world}.${pick.entry.uid}`, pick.p])) }),
      });
      return result.answers ? readLore(result.answers, chunk.entries) : [];
    }))).flat();
    const picked: LorePick[] = pickLore(scored, pickScope);
    const entries = picked.flatMap((pick) => byKey.get(`${pick.entry.world}.${pick.entry.uid}`) ?? []);
    const picks = picked.map((pick) => ({ world: pick.entry.world, uid: pick.entry.uid, comment: pick.entry.comment, p: pick.p }));
    this.cache = { key, entries, picks };
    if (entries.length) await this.deps.force(entries);
    return { trigger, cached: false, picks };
  }
}
