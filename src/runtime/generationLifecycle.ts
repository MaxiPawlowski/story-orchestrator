// Which host generation is the one a turn's blocks belong to. ST's
// GENERATION_ENDED is not paired with STARTED (host-facts), a nested quiet run clears ST's
// generating flags mid-turn, and other extensions emit the same event names with their own
// `{source}` payload, so every block that rides "this reply" follows the outermost loud generation
// this reducer tracks, never the raw events.

export type GenerationIntent =
  | { kind: "opened"; type: string | null; params: Record<string, unknown> | undefined }
  | { kind: "nested"; type: string | null; params: Record<string, unknown> | undefined; withholds: boolean }
  | { kind: "reapply"; chid: number | null }
  | { kind: "closed"; reason: "rendered" | "ended" | "stopped" | "chat-changed" }
  | { kind: "settled"; rendered: boolean };

export interface GenerationLifecycleSnapshot {
  outermost: { type: string | null; watermark: number } | null;
  nested: Array<string | null>;
  awaitingRender: number | null;
  draftedChid: number | null;
  openedCount: number;
}

export const WITHHOLDING_TYPES: ReadonlySet<string> = new Set(["quiet", "impersonate"]);
const REWRITES_LAST_MESSAGE: ReadonlySet<string> = new Set(["swipe", "continue", "regenerate"]);

const isParams = (value: unknown): value is Record<string, unknown> | undefined =>
  value === undefined || (typeof value === "object" && value !== null && !Array.isArray(value));

export const isHostStartedShape = (args: readonly unknown[]): boolean =>
  (args[0] === undefined || args[0] === null || typeof args[0] === "string")
  && isParams(args[1])
  && (args[2] === undefined || typeof args[2] === "boolean");

export const isHostEndedShape = (args: readonly unknown[]): boolean => args[0] === undefined || typeof args[0] === "number";

export const withholds = (type: unknown) => typeof type === "string" && WITHHOLDING_TYPES.has(type);

export const isQuietType = (type: unknown) => type === "quiet";

const messageIndex = (value: unknown): number | null => {
  const id = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(id) ? id : null;
};

const draftedIndex = (value: unknown): number | null => {
  const id = Array.isArray(value) ? value[0] : value;
  return typeof id === "number" && Number.isInteger(id) ? id : null;
};

export class GenerationLifecycle {
  private outermost: { type: string | null; watermark: number } | null = null;
  private nested: Array<string | null> = [];
  private awaitingRender: number | null = null;
  private draftedChid: number | null = null;
  private openedCount = 0;

  constructor(private readonly isTurn: (type: unknown) => boolean) {}

  started(args: readonly unknown[], chatLength: number): GenerationIntent[] {
    if (!isHostStartedShape(args) || args[2] === true) return [];
    const type = typeof args[0] === "string" ? args[0] : null;
    const params = args[1] as Record<string, unknown> | undefined;
    if (this.outermost) {
      this.nested.push(type);
      return [{ kind: "nested", type, params, withholds: withholds(type) }];
    }
    const stale: GenerationIntent[] = this.awaitingRender === null ? [] : [{ kind: "settled", rendered: false }];
    this.awaitingRender = null;
    this.outermost = { type, watermark: type !== null && REWRITES_LAST_MESSAGE.has(type) ? chatLength - 1 : chatLength };
    this.openedCount += 1;
    return [...stale, { kind: "opened", type, params }];
  }

  ended(args: readonly unknown[]): GenerationIntent[] {
    if (!isHostEndedShape(args)) return [];
    if (this.nested.length) {
      this.nested.pop();
      return this.withheld() ? [] : [{ kind: "reapply", chid: this.draftedChid }];
    }
    const outermost = this.outermost;
    if (!outermost) return [];
    this.reset();
    if (withholds(outermost.type)) return [{ kind: "closed", reason: "ended" }, { kind: "settled", rendered: false }];
    this.awaitingRender = outermost.watermark;
    return [{ kind: "closed", reason: "ended" }];
  }

  stopped(args: readonly unknown[]): GenerationIntent[] {
    if (!isHostEndedShape(args)) return [];
    return this.close("stopped");
  }

  rendered(messageId: unknown, type: unknown): GenerationIntent[] {
    const id = messageIndex(messageId);
    if (id === null || !this.isTurn(type)) return [];
    if (this.outermost && id >= this.outermost.watermark) {
      this.reset();
      return [{ kind: "closed", reason: "rendered" }, { kind: "settled", rendered: true }];
    }
    if (this.awaitingRender === null || id < this.awaitingRender) return [];
    this.awaitingRender = null;
    return [{ kind: "settled", rendered: true }];
  }

  wrapperFinished(): GenerationIntent[] {
    if (!this.outermost || !withholds(this.outermost.type)) return [];
    this.reset();
    return [{ kind: "closed", reason: "ended" }, { kind: "settled", rendered: false }];
  }

  drafted(chid: unknown): GenerationIntent[] {
    this.draftedChid = draftedIndex(chid);
    return [];
  }

  chatChanged(): GenerationIntent[] {
    const intents = this.close("chat-changed");
    this.draftedChid = null;
    return intents;
  }

  snapshot(): GenerationLifecycleSnapshot {
    return { outermost: this.outermost ? { ...this.outermost } : null, nested: [...this.nested], awaitingRender: this.awaitingRender, draftedChid: this.draftedChid, openedCount: this.openedCount };
  }

  private withheld(): boolean {
    return (this.outermost !== null && withholds(this.outermost.type)) || this.nested.some(withholds);
  }

  private close(reason: "stopped" | "chat-changed"): GenerationIntent[] {
    const open = this.outermost !== null;
    const awaiting = this.awaitingRender !== null;
    this.reset();
    this.awaitingRender = null;
    if (open) return [{ kind: "closed", reason }, { kind: "settled", rendered: false }];
    return awaiting ? [{ kind: "settled", rendered: false }] : [];
  }

  private reset() {
    this.outermost = null;
    this.nested = [];
    this.draftedChid = null;
  }
}
