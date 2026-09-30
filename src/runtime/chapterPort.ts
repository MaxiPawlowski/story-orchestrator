import type { ChapterRecord } from "@memory/types";
import type { DerivedRecord } from "@memory/derived";
import type { PromptHost } from "./hostPorts";
import type { MemoryCoordinator, MemoryCoordinatorDeps } from "./coordinators/memoryCoordinator";
import type { ChapterSeal, SealAt } from "./chapterSeal";
import type { SealTarget } from "./chapters";
import type { MemoryRuntimeState } from "./types";

type ChapterKit = typeof import("./chapterKit");

export interface ChapterHost {
  coordinator: MemoryCoordinator;
  deps: MemoryCoordinatorDeps;
  memory: () => MemoryRuntimeState;
  patch: (next: Partial<MemoryRuntimeState>) => void;
  record: (input: Omit<DerivedRecord, "id" | "boundary" | "messageId"> & { messageId?: number }) => void;
  save: () => Promise<void>;
}

let kit: ChapterKit | null = null;

export const chapterKit = (): ChapterKit | null => kit;

export const loadChapterKit = async (): Promise<ChapterKit> => (kit ??= await import("./chapterKit"));

export const storyEnded = (records: readonly ChapterRecord[] = []): boolean => records.some((record) => record.final);

// The main entry holds only this door: the trigger, the story-so-far block, the fold, the bridge note
// and the dossiers live in the chapter kit (loaded at startup), the seal pass in its own chunk.
export class ChapterPort {
  private unit: Promise<ChapterSeal> | null = null;
  carried: string | null = null;

  constructor(readonly host: ChapterHost) {}

  private load(): Promise<ChapterSeal> {
    return (this.unit ??= import("./chapterSeal").then(({ ChapterSeal: Unit, sealDeps }) => new Unit(sealDeps(this.host))));
  }

  records(): ChapterRecord[] { return this.host.memory().chapters ?? []; }
  inject(prompt: PromptHost, on: boolean): Map<string, string> { return kit?.inject(this, prompt, on) ?? new Map(); }
  storySoFar(): string { return kit?.storySoFar(this.host) ?? ""; }
  due(): SealTarget | null { return kit?.due(this.host) ?? null; }
  fold(rows: Array<{ extra?: unknown }>, type: unknown, live: readonly unknown[]) { return kit?.fold(this.host, rows, type, live) ?? null; }
  carryBridge(type: unknown) { kit?.carryBridge(this, type); }
  commitBridge(rendered: boolean) { kit?.commitBridge(this, rendered); }
  async seal(target: SealTarget, at: SealAt) { return (await this.load()).seal(target, at); }
  async sealNow() { return (await this.load()).sealNow(); }
  async unseal(recordId: string) { return (await this.load()).unseal(recordId); }
  async reseal(recordId: string) { return (await this.load()).reseal(recordId); }
  async editSummary(recordId: string, summary: string, short?: string) { return (await this.load()).editSummary(recordId, summary, short); }
}
