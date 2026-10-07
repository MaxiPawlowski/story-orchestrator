export interface BatchLeaseHandle {
  release(): Promise<void>;
  renew(): Promise<void>;
}

export interface BatchLeaseDeps {
  current(): boolean;
  mayRetain(): Promise<boolean>;
  waitForText(): Promise<void>;
  schedule(work: () => void, ms: number): unknown;
  unschedule(timer: unknown): void;
  failed(error: unknown): void;
}

export class SpriteBatchLease {
  private lease: BatchLeaseHandle | null = null;
  private key = "";
  private images = 0;
  private active = false;
  private closed = false;
  private idle: unknown = null;
  private pending: Promise<void> | null = null;

  constructor(private readonly deps: BatchLeaseDeps, private readonly limit = 3) {}

  private guard(): void {
    if (this.closed || !this.deps.current()) throw new Error("The sprite batch no longer owns this story.");
  }

  private async drop(): Promise<void> {
    if (this.idle !== null) this.deps.unschedule(this.idle);
    this.idle = null;
    if (this.pending) { await this.pending; return; }
    const lease = this.lease;
    if (!lease) return;
    this.pending = lease.release();
    try { await this.pending; this.lease = null; this.images = 0; }
    finally { this.pending = null; }
  }

  async acquire(key: string, create: () => Promise<BatchLeaseHandle>): Promise<{ release(): Promise<void> }> {
    this.guard();
    if (this.active) throw new Error("Finish the current batch image first.");
    this.active = true;
    try {
      await this.prepare(key, create);
      return this.unit();
    } catch (error) { this.active = false; throw error; }
  }

  private async prepare(key: string, create: () => Promise<BatchLeaseHandle>): Promise<void> {
    if (this.idle !== null) this.deps.unschedule(this.idle);
    this.idle = null;
    if (this.pending) await this.pending;
    if (this.lease && (this.key !== key || this.images >= this.limit || !await this.deps.mayRetain())) await this.drop();
    await this.deps.waitForText();
    this.guard();
    if (!this.lease) {
      const lease = await create();
      if (this.closed || !this.deps.current()) { await lease.release(); this.guard(); }
      this.lease = lease;
      this.key = key;
    } else await this.lease.renew();
    this.guard();
  }

  private unit(): { release(): Promise<void> } {
    let finished = false;
    return { release: async () => {
      if (finished) return;
      finished = true;
      try {
        this.images++;
        if (this.closed || !this.deps.current() || this.images >= this.limit || !await this.deps.mayRetain()) { await this.drop(); return; }
        this.idle = this.deps.schedule(() => { void this.drop().catch(this.deps.failed); }, 2000);
      } finally { this.active = false; }
    } };
  }

  async close(): Promise<void> { this.closed = true; await this.drop(); }
}
