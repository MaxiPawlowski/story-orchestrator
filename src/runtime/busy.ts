export type BusyKind = "setup" | "model" | "image" | "sprite" | "action";

export interface BusyJob {
  kind: BusyKind;
  chatId: string | null;
  startedAt: number;
  completed?: number;
  total?: number;
}

export class BusyWork {
  private jobs = new Set<BusyJob>();
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private chat: () => string | null = () => null;
  attach(chat: () => string | null): () => void {
    this.chat = chat;
    return () => { if (this.chat === chat) this.chat = () => null; };
  }
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private notify() { this.listeners.forEach((listener) => listener()); }
  begin(kind: BusyKind, chatId: string | null, total?: number) {
    const job: BusyJob = { kind, chatId: chatId ?? this.chat(), startedAt: Date.now(), ...(total === undefined ? {} : { total, completed: 0 }) };
    this.jobs.add(job);
    if (!this.timer) this.timer = setInterval(() => this.notify(), 1000);
    this.notify();
    return {
      progress: (completed: number) => { if (this.jobs.has(job)) { job.completed = completed; this.notify(); } },
      end: () => {
        if (!this.jobs.delete(job)) return;
        if (!this.jobs.size && this.timer) { clearInterval(this.timer); this.timer = null; }
        this.notify();
      },
    };
  }
  view(chatId: string | null): BusyJob[] {
    return [...this.jobs].filter((job) => job.chatId === chatId).map((job) => ({ ...job }));
  }
}

export const busyWork = new BusyWork();
