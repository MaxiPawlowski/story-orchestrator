import type { EngineState, NormalizedStoryV2 } from "@engine/index";
import { getChatWindow } from "./chatWindow";
import { runSharedRead } from "./sharedRead";
import type { ParsedFact, SharedReadAudit, SharedReadWindow } from "./types";

export interface SchedulerSettings {
  enabled: boolean;
  profileId: string | null;
  cadence: number;
  reconciliationMultiplier: number;
  debugResponse?: string | null;
}

export interface SchedulerJob {
  priority: 0 | 1;
  reason: string;
  window?: SharedReadWindow;
}

export interface SchedulerHost {
  getStory(): NormalizedStoryV2 | null;
  getEngineState(): EngineState | null;
  getExtractionSettings(): SchedulerSettings;
  getFacts(): ParsedFact[];
  applyExtractionAudit(audit: SharedReadAudit, facts: ParsedFact[]): Promise<void>;
  onSchedulerChange(): void;
}

export class ExtractionScheduler {
  private readonly queue: SchedulerJob[] = [];
  private inFlight = false;
  private lastError: string | null = null;

  constructor(private readonly host: SchedulerHost) {}

  schedule(job: SchedulerJob) {
    if (job.priority === 1) {
      const existing = this.queue.find((entry) => entry.priority === 1);
      if (existing) {
        const left = existing.window ?? job.window;
        const right = job.window ?? existing.window;
        if (left && right) existing.window = getChatWindow(Math.min(left.from, right.from), Math.max(left.to, right.to));
        return;
      }
    }
    this.queue.push(job);
    this.queue.sort((left, right) => left.priority - right.priority);
    this.host.onSchedulerChange();
    void this.pump();
  }

  onBoundary(boundary: number, fired: boolean) {
    const settings = this.host.getExtractionSettings();
    if (!settings.enabled || settings.cadence <= 0) return;
    if (!fired && boundary > 0 && boundary % settings.cadence === 0) {
      this.schedule({ priority: 1, reason: "cadence", window: getChatWindow(Math.max(0, boundary - settings.cadence)) });
    }
  }

  getSnapshot() {
    return { queueDepth: this.queue.length, inFlight: this.inFlight, lastError: this.lastError };
  }

  private async pump() {
    if (this.inFlight) return;
    const job = this.queue.shift();
    if (!job) return;
    const story = this.host.getStory();
    const state = this.host.getEngineState();
    const settings = this.host.getExtractionSettings();
    if (!story || !state || !settings.enabled) {
      this.host.onSchedulerChange();
      return;
    }
    this.inFlight = true;
    this.host.onSchedulerChange();
    try {
      const result = await runSharedRead({ story, state, priority: job.priority, reason: job.reason, window: job.window, facts: this.host.getFacts(), client: settings });
      await this.host.applyExtractionAudit(result.audit, result.facts);
      this.lastError = null;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : "Extraction failed";
    } finally {
      this.inFlight = false;
      this.host.onSchedulerChange();
      void this.pump();
    }
  }
}
