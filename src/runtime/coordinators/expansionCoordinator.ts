import type { EngineState, NormalizedStoryV2 } from "@engine/index";
import {
  EXPANSION_CONTRACT, collectExpansionGateSources, findStubExpansionCandidate, generateReviewedBeats,
  insertedCheckpointIds, mergeExpansions, planExpansion, renderGenerationPrompt, revalidateExpansion, type ExpansionCacheEntry,
  type ExpansionJudge, type ExpansionRuntimeState, type GeneratedBeat, type PlannedExpansionInput,
  type StubExpansionCandidate,
} from "@generation/index";
import {
  buildChainRequest, CRITIC_TIMEOUT_MS, isSceneStale, judgeVerdict, LOOKAHEAD_PREGEN_P, readChain,
  type SceneReadRecord,
} from "@judge/index";
import { numericToLevel } from "@pacing/index";
import type { PlayerHost } from "../hostPorts";
import type { JudgeRuntime } from "../judge";
import { beginRun, type RunGuard, type RunOwnership } from "../runToken";
import { failureClass } from "@extraction/breaker";
import { estimateTokens } from "@extraction/callBudget";
import type { ExtraGateSource, ModelCall, Preflight, PreflightConfirm } from "@extraction/index";

export const expansionKey = (
  candidate: Pick<StubExpansionCandidate, "sourceCheckpointId" | "stubId" | "targetAnchorId">,
) => `${candidate.sourceCheckpointId}->${candidate.stubId}->${candidate.targetAnchorId}`;

export interface ExpansionCoordinatorDeps {
  getStory: () => NormalizedStoryV2 | null;
  getStoryRaw: () => unknown;
  getState: () => EngineState | null;
  getExpansion: () => ExpansionRuntimeState;
  model: ModelCall;
  getCanon: () => string;
  getFactTexts: () => string[];
  replaceStory: (story: NormalizedStoryV2) => void;
  judge?: () => JudgeRuntime | null;
  getSceneRead?: () => SceneReadRecord | null;
  refusing?: () => boolean;
  setStatus: (status: string) => void;
  persist: () => Promise<void>;
  notify: () => void;
  ownership: RunOwnership;
  hosts: { player: PlayerHost };
}

// Owns extras.expansion: the generated-beat cache, its LLM generation and the staleness
// revalidation that runs at every boundary. Merging hands the rebuilt story back to the manager,
// which owns the engine.
export class ExpansionCoordinator {
  private readonly liveJobs = new Map<string, RunGuard>();

  constructor(private readonly deps: ExpansionCoordinatorDeps) {}

  private hasLiveJob(key: string): boolean {
    return this.liveJobs.get(key)?.stillOwns() ?? false;
  }

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
      if (!["inserted", "validated", "cached", "needs_review"].includes(entry.status)) return;
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
      contract: EXPANSION_CONTRACT,
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
      origin: "active",
      updatedAt: new Date().toISOString(),
    };
  }

  scheduleForActive(schedule: (reason: string, run: () => Promise<void>) => void) {
    const story = this.deps.getStory();
    const state = this.deps.getState();
    if (!story || !state) return false;
    const candidate = findStubExpansionCandidate(story, state.activeCheckpointId);
    const queued = candidate ? this.queue(candidate, "active", schedule) : false;
    this.scheduleLookahead(story, schedule);
    return queued;
  }

  // An entry blocks its key, except a look-ahead that went stale or failed: arrival re-queues it
  // (capped by attempts), so a pre-generation can waste a generation but never block the real one.
  private queue(candidate: StubExpansionCandidate, origin: "active" | "lookahead", schedule: (reason: string, run: () => Promise<void>) => void, headingP?: number) {
    const key = expansionKey(candidate);
    const existing = this.entries[key];
    const retryable = origin === "active" && existing?.origin === "lookahead" && ["stale", "failed"].includes(existing.status) && existing.attempts < 2;
    const orphaned = Boolean(existing && ["queued", "generating"].includes(existing.status) && !this.hasLiveJob(key));
    if (existing && !retryable && !orphaned) return false;
    this.liveJobs.set(key, beginRun(this.deps.ownership));
    this.entries[key] = { ...this.emptyEntry(candidate, "queued"), origin, attempts: existing?.attempts ?? 0, ...(headingP !== undefined ? { headingP } : {}) };
    void this.deps.persist();
    this.deps.notify();
    schedule(`expand:${origin === "lookahead" ? "ahead:" : ""}${candidate.stubId}`, () => this.generate(candidate));
    return true;
  }

  // v2.2 plan 07: one stub one hop ahead of where play is heading (plan 03's look-ahead), one
  // pre-generation in flight at most, never in place of the active candidate.
  private scheduleLookahead(story: NormalizedStoryV2, schedule: (reason: string, run: () => Promise<void>) => void) {
    const scene = this.deps.getSceneRead?.() ?? null;
    // C2: a tracker the judge can no longer confirm must not steer pre-generation either. Its
    // headingTo describes where play was going when it last answered, which may be minutes stale.
    if (!scene || isSceneStale(scene) || !this.deps.judge?.()?.active("expansionLookahead")) return;
    // V13 (C4 precedence): the player is refusing this checkpoint's exits, and a heading toward one of
    // them is the route they refused. Pre-generating it would narrate them arriving there.
    if (this.deps.refusing?.()) return;
    if (Object.values(this.entries).some((entry) => entry.origin === "lookahead" && (entry.status === "queued" || entry.status === "generating"))) return;
    const ahead = (scene.headingTo ?? []).filter((heading) => heading.hops === 1 && heading.p >= LOOKAHEAD_PREGEN_P).sort((left, right) => right.p - left.p);
    for (const heading of ahead) {
      const candidate = findStubExpansionCandidate(story, heading.id);
      if (candidate && !this.entries[expansionKey(candidate)]) {
        this.queue(candidate, "lookahead", schedule, heading.p);
        return;
      }
    }
  }

  // v2.2 plan 07: the judge as critic and ranker, each its own opt-in. The judge only checks or
  // ranks what the LLM wrote; code checks stay first and binding.
  private expansionJudge(story: NormalizedStoryV2, input: PlannedExpansionInput): ExpansionJudge {
    const judge = this.deps.judge?.() ?? null;
    const target = story.checkpointById[input.candidate.targetAnchorId];
    if (!judge || !target) return {};
    const cast = [...new Set([...story.roster.map((member) => member.name ?? member.id), this.deps.hosts.player.getPlayerName()].filter(Boolean))];
    const read = async (beats: GeneratedBeat[]) => {
      const request = buildChainRequest({ facts: input.facts, target: { name: target.name,
          objective: target.objective }, cast, trajectory: input.tensionTrajectory.map(numericToLevel),
          beats: beats.map((beat) => ({ objective: beat.objective, guidance: beat.guidance })) });
      const result = await judge.ask("critic", request, { timeoutMs: CRITIC_TIMEOUT_MS,
          summarize: (answers) => (answers ? Object.fromEntries(Object.entries(readChain(answers) ?? {}).map(([key,
          value]) => [key, value ?? "none"])) : {}) });
      return result.answers ? readChain(result.answers) : null;
    };
    const variants = judge.expansionSettings();
    return {
      ...(judge.active("expansionCritic") ? { critic: async (beats: GeneratedBeat[]) => { const chain = await read(beats); return chain ? { ...judgeVerdict(chain),
          raw: "JUDGE", judge: chain } : null; } } : {}),
      ...(variants && variants.variants > 1 ? { variants: { n: variants.variants, temperature: variants.temperature, pick: variants.pick, read } } : {}),
    };
  }

  // v2.3 plan 07. `validated` is a chain the critic passed, waiting for the boundary that makes it
  // part of what this chat is playing; `inserted` is that boundary having happened. The state exists
  // because "review states → inserted" hid the gap the review named, and because a chain staled
  // before its boundary can now be dropped without ever having claimed to be played.
  async commitValidated() {
    let changed = false;
    Object.entries(this.entries).forEach(([key, entry]) => {
      if (entry.status !== "validated") return;
      this.entries[key] = { ...entry, status: "inserted", updatedAt: new Date().toISOString() };
      changed = true;
    });
    if (changed) {
      this.rebuildMergedStory();
      await this.deps.persist();
    }
    return changed;
  }

  // v2.3 plan 07: an author action for `stale`/`failed` (the review's "manual and undocumented for
  // players" gap). It re-runs the same candidate without waiting for the queue's arrival rule.
  async regenerate(key: string): Promise<boolean> {
    const entry = this.entries[key];
    const story = this.deps.getStory();
    const state = this.deps.getState();
    if (!entry || !story || !state) return false;
    const candidate = findStubExpansionCandidate(story, entry.sourceCheckpointId);
    if (!candidate || candidate.stubId !== entry.stubId) return false;
    await this.generate(candidate, this.deps.model.planted?.("generation") ?? null);
    return true;
  }

  async runNow(debugResponse?: string, confirm?: PreflightConfirm) {
    const story = this.deps.getStory();
    const state = this.deps.getState();
    if (!story || !state) return false;
    const candidate = findStubExpansionCandidate(story, state.activeCheckpointId);
    if (!candidate) {
      this.deps.setStatus("No reachable stub from active checkpoint");
      this.deps.notify();
      return false;
    }
    const response = debugResponse ?? this.deps.model.planted?.("generation") ?? null;
    if (confirm && response === null && !(await confirm(this.preflight(story, state, candidate)))) return false;
    await this.generate(candidate, response);
    return true;
  }

  // v2.4 plan 03 D5: what an author's "generate now" is about to send: every variant, plus the critic.
  private preflight(story: NormalizedStoryV2, state: EngineState, candidate: StubExpansionCandidate): Preflight {
    const input = planExpansion(story, state.blackboard, candidate, this.deps.getCanon(), this.deps.getFactTexts());
    const requests = (this.expansionJudge(story, input).variants?.n ?? 1) + 1;
    return { requests, tokens: requests * estimateTokens(renderGenerationPrompt(story, input)) };
  }

  async generate(candidate: StubExpansionCandidate, debugResponse?: string | null) {
    const story = this.deps.getStory();
    if (!story) return;
    const key = expansionKey(candidate);
    const baseEntry = this.entries[key] ?? this.emptyEntry(candidate, "generating");
    this.entries[key] = { ...baseEntry, status: "generating", attempts: baseEntry.attempts + 1, updatedAt: new Date().toISOString(), lastError: null };
    this.deps.notify();
    // v2.3 plan 11 §Fault matrix. A generation is a model call that can run for minutes, and every
    // write below the await lands in whatever chat is open when it answers. Without this, a chain
    // generated for chat A was filed into chat B's cache and merged into chat B's story — the
    // ownership hole every other async coordinator already closes, and the one this coordinator was
    // the last to have.
    const run = beginRun(this.deps.ownership);
    this.liveJobs.set(key, run);
    let transport: unknown = null;
    try {
      const state = this.deps.getState()!;
      const input = planExpansion(story, state.blackboard, candidate, this.deps.getCanon(), this.deps.getFactTexts());
      const generated = await generateReviewedBeats(story, input, this.deps.model, { role: "authoring",
          pass: "generation", signal: run.signal, debugResponse: debugResponse ?? null }, this.expansionJudge(story,
          input));
      if (!run.stillOwns()) return;
      if (generated.issues.length || !generated.codeCheck || !generated.codeCheck.ok) {
        this.entries[key] = { ...this.entries[key], status: "failed", beats: generated.beats,
            codeCheck: generated.codeCheck,
            lastError: generated.issues.join("; ") || generated.codeCheck?.issues.join("; ") || "Generation failed",
            ...(generated.variants ? { variants: generated.variants } : {}), updatedAt: new Date().toISOString() };
      } else {
        this.entries[key] = {
          ...this.entries[key],
          status: generated.needsReview ? "needs_review" : "validated",
          basis: { ...state.blackboard.values },
          blackboardVersionSum: this.versionSum(state),
          beats: generated.beats,
          needsReview: generated.needsReview,
          verdicts: [generated.verdict],
          codeCheck: generated.codeCheck,
          insertedCheckpointIds: insertedCheckpointIds({ ...this.entries[key], beats: generated.beats }),
          ...(generated.variants ? { variants: generated.variants } : {}),
          lastError: null,
          updatedAt: new Date().toISOString(),
        };
        this.rebuildMergedStory();
      }
    } catch (error) {
      if (!run.stillOwns()) return;
      this.entries[key] = { ...this.entries[key], status: "failed", lastError: error instanceof Error ? error.message : "Generation failed", updatedAt: new Date().toISOString() };
      if (failureClass(error) === "transport") transport = error;
    } finally {
      if (this.liveJobs.get(key) === run) this.liveJobs.delete(key);
    }
    if (!run.stillOwns()) return;
    await this.deps.persist();
    this.deps.notify();
    if (transport) throw transport;
  }
}
