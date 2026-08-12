import type { EngineState, NormalizedStoryV2 } from "@engine/index";
import { collectExpansionGateSources, findStubExpansionCandidate, generateReviewedBeats, insertedCheckpointIds, mergeExpansions, planExpansion, revalidateExpansion, type ExpansionCacheEntry, type ExpansionRuntimeState, type StubExpansionCandidate } from "@generation/index";
import type { ExtraGateSource } from "@extraction/index";
import type { ExtractionRuntimeSettings } from "../types";

export const expansionKey = (candidate: Pick<StubExpansionCandidate, "sourceCheckpointId" | "stubId" | "targetAnchorId">) => `${candidate.sourceCheckpointId}->${candidate.stubId}->${candidate.targetAnchorId}`;

export interface ExpansionCoordinatorDeps {
  getStory: () => NormalizedStoryV2 | null;
  getStoryRaw: () => unknown;
  getState: () => EngineState | null;
  getExpansion: () => ExpansionRuntimeState;
  getSettings: () => ExtractionRuntimeSettings;
  getCanon: () => string;
  getFactTexts: () => string[];
  replaceStory: (story: NormalizedStoryV2) => void;
  setStatus: (status: string) => void;
  persist: () => Promise<void>;
  notify: () => void;
}

// Owns extras.expansion: the generated-beat cache, its LLM generation and the staleness
// revalidation that runs at every boundary. Merging hands the rebuilt story back to the manager,
// which owns the engine.
export class ExpansionCoordinator {
  constructor(private readonly deps: ExpansionCoordinatorDeps) {}

  private get entries(): Record<string, ExpansionCacheEntry> {
    return this.deps.getExpansion().entries;
  }

  private versionSum(state: EngineState): number {
    return Object.values(state.blackboard.versions).reduce((sum, version) => sum + version, 0);
  }

  getGateSources(): ExtraGateSource[] {
    return collectExpansionGateSources(this.entries);
  }

  setSchedulerSnapshot(snapshot: unknown) {
    const extended = snapshot as { heavyQueueDepth?: number; heavyInFlight?: boolean; lastHeavyError?: string | null };
    const scheduler = this.deps.getExpansion().scheduler;
    this.deps.getExpansion().scheduler = {
      queueDepth: typeof extended.heavyQueueDepth === "number" ? extended.heavyQueueDepth : scheduler.queueDepth,
      inFlight: Boolean(extended.heavyInFlight),
      lastError: typeof extended.lastHeavyError === "string" ? extended.lastHeavyError : null,
    };
  }

  // Expansions are merged into the played story, so a story that fails to merge must not take the
  // chat down with it — fall back to the authored base and surface the error as status.
  mergedStoryOrBase(raw: unknown, base: NormalizedStoryV2): NormalizedStoryV2 {
    try {
      return mergeExpansions(raw, this.entries);
    } catch (error) {
      this.deps.setStatus(error instanceof Error ? `Expansion merge failed: ${error.message}` : "Expansion merge failed");
      return base;
    }
  }

  private rebuildMergedStory() {
    if (!this.deps.getStory()) return;
    this.deps.replaceStory(mergeExpansions(this.deps.getStoryRaw(), this.entries));
  }

  // The ACTIVE generated checkpoint is never staled: splicing it out mid-play freezes boundary
  // commits (live finding, v2 acceptance run).
  revalidateInserted() {
    const story = this.deps.getStory();
    const state = this.deps.getState();
    if (!story || !state) return;
    let changed = false;
    const values = state.blackboard.values;
    Object.entries(this.entries).forEach(([key, entry]) => {
      if (!["inserted", "cached", "needs_review"].includes(entry.status)) return;
      if (entry.insertedCheckpointIds.includes(state.activeCheckpointId)) return;
      const verdict = revalidateExpansion(story, entry, values);
      if (verdict.status === "pass") return;
      this.entries[key] = { ...entry, status: "stale", lastError: verdict.issues.join("; "), updatedAt: new Date().toISOString() };
      changed = true;
    });
    if (changed) this.rebuildMergedStory();
  }

  private emptyEntry(candidate: StubExpansionCandidate, status: ExpansionCacheEntry["status"]): ExpansionCacheEntry {
    const state = this.deps.getState()!;
    return {
      key: expansionKey(candidate),
      status,
      sourceCheckpointId: candidate.sourceCheckpointId,
      stubId: candidate.stubId,
      targetAnchorId: candidate.targetAnchorId,
      basis: { ...state.blackboard.values },
      blackboardVersionSum: this.versionSum(state),
      beats: [],
      needsReview: false,
      verdicts: [],
      codeCheck: null,
      insertedCheckpointIds: [],
      lastError: null,
      attempts: 0,
      updatedAt: new Date().toISOString(),
    };
  }

  scheduleForActive(schedule: (reason: string, run: () => Promise<void>) => void) {
    const story = this.deps.getStory();
    const state = this.deps.getState();
    if (!story || !state) return false;
    const candidate = findStubExpansionCandidate(story, state.activeCheckpointId);
    if (!candidate) return false;
    const key = expansionKey(candidate);
    if (this.entries[key]) return false;
    this.entries[key] = this.emptyEntry(candidate, "queued");
    void this.deps.persist();
    this.deps.notify();
    schedule(`expand:${candidate.stubId}`, () => this.generate(candidate));
    return true;
  }

  async runNow(debugResponse?: string) {
    const story = this.deps.getStory();
    const state = this.deps.getState();
    if (!story || !state) return false;
    const candidate = findStubExpansionCandidate(story, state.activeCheckpointId);
    if (!candidate) {
      this.deps.setStatus("No reachable stub from active checkpoint");
      this.deps.notify();
      return false;
    }
    await this.generate(candidate, debugResponse ?? globalThis.storyOrchestratorDebugGenerationResponse ?? null);
    return true;
  }

  async generate(candidate: StubExpansionCandidate, debugResponse?: string | null) {
    const story = this.deps.getStory();
    if (!story) return;
    const key = expansionKey(candidate);
    const baseEntry = this.entries[key] ?? this.emptyEntry(candidate, "generating");
    this.entries[key] = { ...baseEntry, status: "generating", attempts: baseEntry.attempts + 1, updatedAt: new Date().toISOString(), lastError: null };
    this.deps.notify();
    try {
      const state = this.deps.getState()!;
      const input = planExpansion(story, state.blackboard, candidate, this.deps.getCanon(), this.deps.getFactTexts());
      const generated = await generateReviewedBeats(story, input, { ...this.deps.getSettings(), debugResponse: debugResponse ?? globalThis.storyOrchestratorDebugGenerationResponse ?? null });
      if (generated.issues.length || !generated.codeCheck || !generated.codeCheck.ok) {
        this.entries[key] = { ...this.entries[key], status: "failed", beats: generated.beats, codeCheck: generated.codeCheck, lastError: generated.issues.join("; ") || generated.codeCheck?.issues.join("; ") || "Generation failed", updatedAt: new Date().toISOString() };
      } else {
        this.entries[key] = {
          ...this.entries[key],
          status: generated.needsReview ? "needs_review" : "inserted",
          basis: { ...state.blackboard.values },
          blackboardVersionSum: this.versionSum(state),
          beats: generated.beats,
          needsReview: generated.needsReview,
          verdicts: [generated.verdict],
          codeCheck: generated.codeCheck,
          insertedCheckpointIds: insertedCheckpointIds({ ...this.entries[key], beats: generated.beats }),
          lastError: null,
          updatedAt: new Date().toISOString(),
        };
        this.rebuildMergedStory();
      }
    } catch (error) {
      this.entries[key] = { ...this.entries[key], status: "failed", lastError: error instanceof Error ? error.message : "Generation failed", updatedAt: new Date().toISOString() };
    }
    await this.deps.persist();
    this.deps.notify();
  }
}
