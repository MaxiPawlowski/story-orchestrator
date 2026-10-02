export const CHAT_SETTLE_TIMEOUT_MS = 20_000;
export const CHAT_SETTLE_POLL_MS = 100;

export interface ChatSettleClock {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

const realClock: ChatSettleClock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => { setTimeout(resolve, ms); }),
};

export type ChatSettleOutcome = "settled" | "owned" | "timed-out";

export class ChatSettle {
  private loads = 0;
  private speeches = 0;

  constructor(private readonly clock: ChatSettleClock = realClock) {}

  track<T>(work: Promise<T>): Promise<T> {
    this.loads += 1;
    return work.finally(() => { this.loads -= 1; });
  }

  speak<T>(work: () => Promise<T>): Promise<T> {
    this.speeches += 1;
    return Promise.resolve().then(work).finally(() => { this.speeches -= 1; });
  }

  loading(): boolean {
    return this.loads > 0;
  }

  speaking(): boolean {
    return this.speeches > 0;
  }

  async until(timeoutMs = CHAT_SETTLE_TIMEOUT_MS): Promise<ChatSettleOutcome> {
    const deadline = this.clock.now() + timeoutMs;
    for (;;) {
      if (!this.loading()) return "settled";
      if (this.speaking()) return "owned";
      if (this.clock.now() >= deadline) return "timed-out";
      await this.clock.sleep(CHAT_SETTLE_POLL_MS);
    }
  }
}

export const chatSettle = new ChatSettle();
