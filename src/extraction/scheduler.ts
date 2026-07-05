import type { EngineState, NormalizedStoryV2, NormalizedTransition } from "@engine/index";
import type { ExtraGateSource } from "./types";
import { getChatWindow } from "./chatWindow";
import { runSharedRead } from "./sharedRead";
import type { ParsedFact, SharedReadAudit, SharedReadWindow } from "./types";

export interface SchedulerSettings {
  enabled: boolean;
  profileId: string | null;
  cadence: number;
  reconciliationMultiplier: number;
  stabilityLag: number;
  debugResponse?: string | null;
}

export interface SchedulerJob {
  priority: 0 | 1 | 2 | 3 | 4;
  reason: string;
  window?: SharedReadWindow;
  run?: () => Promise<void>;
}

export interface SchedulerHost {
  getStory(): NormalizedStoryV2 | null;
  getEngineState(): EngineState | null;
  getExtractionSettings(): SchedulerSettings;
  getFacts(): ParsedFact[];
  getFiredTransitions(): NormalizedTransition[];
  getExpansionGateSources(): ExtraGateSource[];
  applyExtractionAudit(audit: SharedReadAudit, facts: ParsedFact[]): Promise<void>;
  onSchedulerChange(): void;
  pauseExtraction(message: string): void;
}

export class ExtractionScheduler {
  private readonly queue: SchedulerJob[] = [];
  private readonly heavyQueue: SchedulerJob[] = [];
  private inFlight = false;
  private heavyInFlight = false;
  private lastError: string | null = null;
  private lastHeavyError: string | null = null;

  constructor(private readonly host: SchedulerHost) {}

  schedule(job: SchedulerJob) {
    if (job.priority >= 3) {
      this.heavyQueue.push(job);
      this.heavyQueue.sort((left, right) => left.priority - right.priority);
      this.host.onSchedulerChange();
      void this.pumpHeavy();
      return;
    }
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

  onBoundary(boundary: number, fired: boolean, lastMessageId: number) {
    const settings = this.host.getExtractionSettings();
    if (!settings.enabled || settings.cadence <= 0) return;
    if (!fired && boundary > 0 && boundary % settings.cadence === 0) {
      const stableTo = lastMessageId - Math.max(0, settings.stabilityLag ?? 1);
      if (stableTo >= 0) this.schedule({ priority: 1, reason: "cadence", window: getChatWindow(Math.max(0, stableTo - settings.cadence + 1), stableTo) });
    }
  }

  getSnapshot() {
    return { queueDepth: this.queue.length, inFlight: this.inFlight, lastError: this.lastError, heavyQueueDepth: this.heavyQueue.length, heavyInFlight: this.heavyInFlight, lastHeavyError: this.lastHeavyError };
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
      const priority = job.priority === 0 ? 0 : 1;
      const result = await this.runWithRetries(() => runSharedRead({ story, state, priority, reason: job.reason, window: job.window, stabilityLag: settings.stabilityLag, firedTransitions: this.host.getFiredTransitions(), facts: this.host.getFacts(), extraGateSources: this.host.getExpansionGateSources(), client: settings }));
      await this.host.applyExtractionAudit(result.audit, result.facts);
      this.lastError = null;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : "Extraction failed";
      this.host.pauseExtraction(this.lastError);
    } finally {
      this.inFlight = false;
      this.host.onSchedulerChange();
      void this.pump();
    }
  }

  private async pumpHeavy() {
    if (this.heavyInFlight) return;
    const job = this.heavyQueue.shift();
    if (!job) return;
    if (!job.run) return;
    this.heavyInFlight = true;
    this.host.onSchedulerChange();
    try {
      await this.runWithRetries(job.run);
      this.lastHeavyError = null;
    } catch (error) {
      this.lastHeavyError = error instanceof Error ? error.message : "Background generation failed";
    } finally {
      this.heavyInFlight = false;
      this.host.onSchedulerChange();
      void this.pumpHeavy();
    }
  }

  private async runWithRetries<T>(task: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await task();
      } catch (error) {
        lastError = error;
        if (attempt < 2) await new Promise((resolve) => globalThis.setTimeout(resolve, 250 * 2 ** attempt));
      }
    }
    throw lastError;
  }
}
