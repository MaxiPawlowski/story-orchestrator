import type { ChapterRecord } from "@memory/types";
import type { ChapterSeal, ChapterSealDeps, SealAt } from "./chapterSeal";
import { chapterOf, chapterSettings, playerTitleOf, sealTarget, type SealTarget } from "./chapters";
import { withholds } from "./generationLifecycle";

type ChapterKit = typeof import("./chapterKit");

let kit: ChapterKit | null = null;

export const chapterKit = (): ChapterKit | null => kit;

export const loadChapterKit = async (): Promise<ChapterKit> => (kit ??= await import("./chapterKit"));

// The seal pipeline and its prompts live in a lazy chunk: the main entry holds only the trigger
// and this door, so a story without chapters pays nothing for them.
export class ChapterPort {
  private unit: Promise<ChapterSeal> | null = null;

  constructor(private readonly deps: ChapterSealDeps & { storySoFarText: () => string }) {}

  private load(): Promise<ChapterSeal> {
    return (this.unit ??= import("./chapterSeal").then(({ ChapterSeal: Unit }) => new Unit(this.deps)));
  }

  settings() { return chapterSettings(this.deps.memory().settings.chapters); }

  records(): ChapterRecord[] { return this.deps.memory().chapters ?? []; }

  injects(): boolean { return this.settings().storySoFar && (this.deps.getStory()?.memory?.story_so_far ?? "block") === "block"; }

  returning(): Map<string, string> {
    const kit = chapterKit();
    const state = this.deps.getState();
    const settings = this.settings();
    return kit && state && settings.seal ? kit.returningLines(this.deps.getStory(), this.records(), state.visitedPath, state.lastMessageId, settings.dossierWindow) : new Map();
  }

  storySoFar(): string {
    const kit = chapterKit();
    const memory = this.deps.memory();
    const story = this.deps.getStory();
    const chapter = chapterOf(story, this.deps.getState()?.activeCheckpointId);
    return kit && story ? kit.storySoFarText({ records: this.records(), eras: memory.chronicle?.eras ?? [], canon: memory.canon && !memory.canon.stale ? memory.canon.text : "",
      chapterTitle: chapter ? playerTitleOf(chapter) : null, threads: memory.arcs.filter((arc) => arc.status === "open"), settings: this.settings() }) : "";
  }

  due(): SealTarget | null {
    const state = this.deps.getState();
    return state && this.settings().seal ? sealTarget(this.deps.getStory(), state.activeCheckpointId, this.records(), state.visitedPath) : null;
  }

  // D7: sealed chapters leave THIS generation's prompt only while the block that replaces them is in
  // it. Rows are replaced in the per-generation array, never mutated, so nothing needs undoing.
  fold(rows: Array<{ extra?: unknown }>, type: unknown, live: readonly unknown[]) {
    const kit = chapterKit();
    const records = this.records();
    if (!kit || !records.length || !this.settings().fold || withholds(type)) return null;
    const block = this.deps.storySoFarText();
    const eras = this.deps.memory().chronicle?.eras ?? [];
    const covered = records.filter((record) => block.includes(record.short) || block.includes(record.summary) || eras.some((era) => era.recordIds.includes(record.id) && block.includes(era.text)));
    if (!covered.length) return null;
    const ids = new Map<unknown, number>();
    live.forEach((message, index) => { const extra = (message as { extra?: unknown } | null)?.extra; if (extra && typeof extra === "object") ids.set(extra, index); });
    return kit.foldRows(rows, (row) => ids.get(row.extra) ?? null, kit.foldRange(covered, this.deps.getStory()));
  }

  async seal(target: SealTarget, at: SealAt) { return (await this.load()).seal(target, at); }
  async sealNow() { return (await this.load()).sealNow(); }
  async unseal(recordId: string) { return (await this.load()).unseal(recordId); }
  async reseal(recordId: string) { return (await this.load()).reseal(recordId); }
  async editSummary(recordId: string, summary: string, short?: string) { return (await this.load()).editSummary(recordId, summary, short); }
}
