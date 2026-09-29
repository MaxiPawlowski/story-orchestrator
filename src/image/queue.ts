export type ImageJobState = "queued" | "running" | "done" | "failed" | "cancelled";
export interface ImageJobStatus { id: number; label: string; state: ImageJobState; startedAt: number | null; error?: string }
interface Job { status: ImageJobStatus; controller: AbortController }

export class ImageQueue {
  private jobs: Job[] = [];
  private tail: Promise<unknown> = Promise.resolve();
  private nextId = 1;
  private listeners = new Set<() => void>();

  enqueue<T>(label: string, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const job: Job = { status: { id: this.nextId++, label, state: "queued", startedAt: null }, controller: new AbortController() };
    this.jobs.push(job);
    this.notify();
    const result = this.tail.then(async () => {
      if (job.controller.signal.aborted) throw new DOMException("Cancelled", "AbortError");
      job.status = { ...job.status, state: "running", startedAt: Date.now() };
      this.notify();
      try {
        const value = await run(job.controller.signal);
        job.status = { ...job.status, state: "done" };
        return value;
      } catch (error) {
        job.status = { ...job.status, state: job.controller.signal.aborted ? "cancelled" : "failed", error: error instanceof Error ? error.message : String(error) };
        throw error;
      } finally {
        this.jobs = this.jobs.filter((entry) => entry !== job);
        this.notify();
      }
    });
    this.tail = result.catch(() => undefined);
    return result;
  }

  cancelAll(): void {
    for (const job of this.jobs) job.controller.abort();
    this.notify();
  }

  snapshot(): ImageJobStatus[] { return this.jobs.map((job) => ({ ...job.status })); }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private notify() { this.listeners.forEach((listener) => listener()); }
}
