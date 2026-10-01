export type GenerationInterceptor = (chat: unknown, contextSize: number, abort: (immediate: boolean) => void, type: string) => Promise<void>;

const GATED_TYPE = "normal";

export class LoudGenerationGate {
  private held = false;
  private refusedCount = 0;

  enter(type: string, group: boolean): "gated" | "ungated" | "refused" {
    if (type !== GATED_TYPE || !group) return "ungated";
    if (this.held) {
      this.refusedCount += 1;
      return "refused";
    }
    this.held = true;
    return "gated";
  }

  release(): void {
    this.held = false;
  }

  isHeld(): boolean {
    return this.held;
  }

  refused(): number {
    return this.refusedCount;
  }
}

export const gatedInterceptor = (
  gate: LoudGenerationGate, isGroup: () => boolean, inner: GenerationInterceptor, onRefused?: () => void, hold?: () => Promise<unknown>,
): GenerationInterceptor =>
  async (chat, contextSize, abort, type) => {
    await hold?.();
    const entry = gate.enter(type, isGroup());
    if (entry === "refused") {
      onRefused?.();
      abort(true);
      return;
    }
    let aborted = false;
    try {
      await inner(chat, contextSize, (immediate) => { aborted = true; abort(immediate); }, type);
    } finally {
      if (aborted && entry === "gated") gate.release();
    }
  };
