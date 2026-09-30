import type { EngineState, NormalizedStoryV2, NormalizedTransition } from "@engine/index";
import { maxTokensForInput } from "@extraction/callBudget";
import { getCanonLite } from "@extraction/canonLite";
import { lapseAsEmpty } from "@extraction/modelError";
import { askText, type ModelCall } from "@extraction/modelRoute";
import { stripChannelNoise } from "@extraction/parse";
import type { ParsedFact } from "@extraction/types";
import { buildCanonSummaryPrompt, canonHistory, canonInputHash, openArcTexts, resolvedArcs, selectCanonFacts, type DerivedRecord } from "@memory/index";
import { beginRun, type RunOwnership } from "./runToken";
import type { CanonSource, MemoryRuntimeState } from "./types";

export interface CanonSynthesisDeps {
  getStory: () => NormalizedStoryV2 | null;
  getState: () => EngineState | null;
  memory: () => MemoryRuntimeState;
  patch: (next: Partial<MemoryRuntimeState>) => void;
  record: (input: Omit<DerivedRecord, "id" | "boundary" | "messageId">) => void;
  save: () => Promise<void>;
  model: () => ModelCall;
  ownership: () => RunOwnership;
  enabled: () => boolean;
  firedTransitions: () => NormalizedTransition[];
  facts: () => ParsedFact[];
}

export class CanonSynthesis {
  private inFlight = false;

  constructor(private readonly deps: CanonSynthesisDeps) {}

  getCanon(): string {
    const canon = this.deps.memory().canon;
    if (canon?.text && !canon.stale) return canon.text;
    const story = this.deps.getStory();
    const state = this.deps.getState();
    if (!story || !state) return "";
    return getCanonLite(story, state.visitedAnchors, this.deps.firedTransitions(), this.deps.facts());
  }

  /** A decided conflict or a rollback was built from a claim this text still asserts.
   *  The text is kept (an author can read it) but its readers stop treating it as current. */
  canonStale(): boolean { return this.deps.memory().canon?.stale === true; }

  // Canon-lite is prompt scaffolding ("Anchor cp1: …", "Gate a -> b"): fine for the memory model,
  // never for the player, which takes the synthesized prose or nothing.
  getCanonProse(): string {
    const memory = this.deps.memory();
    if (memory.canon?.text) return this.canonStale() ? "" : canonHistory(memory.canon.text);
    return memory.entries.filter((entry) => entry.tier === "scene_history" && !entry.foldedInto && !entry.supersededBy).map((entry) => entry.text).join("\n\n");
  }

  private canonFacts(memory: MemoryRuntimeState) {
    const state = this.deps.getState();
    const objective = this.deps.getStory()?.checkpointById[state?.activeCheckpointId ?? ""]?.objective ?? "";
    return selectCanonFacts(memory.entries, 30, { boundary: state?.boundary ?? 0, lastMessageId: state?.lastMessageId, turnText: objective, turnEntities: [], openArcs: openArcTexts(memory.arcs, 8) });
  }

  async regenerateCanon(force = false): Promise<boolean> {
    const story = this.deps.getStory();
    const memory = this.deps.memory();
    if (!story || !this.deps.enabled() || this.inFlight) return false;
    const arcSummaries = resolvedArcs(memory.arcs).filter((arc) => !arc.foldedInto).map((arc) => arc.summary).filter((summary): summary is string => Boolean(summary));
    if (!arcSummaries.length) return false;
    const facts = this.canonFacts(memory).map((entry) => entry.text);
    const active = story.checkpointById[this.deps.getState()?.activeCheckpointId ?? ""];
    const checkpoint = active ? { id: active.id, name: active.name, objective: active.objective } : null;
    const inputHash = canonInputHash(arcSummaries, facts, checkpoint);
    // Stale rebuilds even when the hash matches: the validity change it saw is invisible to the hash.
    if (!force && !memory.canon?.stale && memory.canon?.inputHash === inputHash) return false;
    // No window: the canon is synthesised from arc summaries and facts, not from a span of the
    // transcript, so an ordinary edit must not discard it. Chat, story, version and epoch still do.
    const run = beginRun(this.deps.ownership());
    this.inFlight = true;
    try {
      const prompt = buildCanonSummaryPrompt(story.title, arcSummaries, facts, checkpoint);
      const ask = { role: "synthesis", pass: "canon", maxTokens: maxTokensForInput("canon", prompt), signal: run.signal, refuseIncomplete: true } as const;
      const text = await askText(this.deps.model(), prompt, ask).catch(lapseAsEmpty);
      const trimmed = stripChannelNoise(text);
      if (!trimmed || !run.stillOwns()) return false;
      const current = this.deps.memory();
      const arcs = resolvedArcs(current.arcs).filter((arc) => !arc.foldedInto);
      const sourceFacts = this.canonFacts(current);
      const sources: CanonSource[] = [
        ...sourceFacts.map((entry) => ({ store: "memory" as const, id: entry.id, ...(entry.provenance ? { provenance: entry.provenance } : {}) })),
        ...arcs.map((arc) => ({ store: "memory" as const, id: arc.id }))
      ];
      this.deps.record({ kind: "canon", inputs: sources.map((source) => source.id) });
      // The prose cannot carry envelopes sentence by sentence, so what a reader can check is what
      // it was built from — recorded as it was at the moment of synthesis.
      this.deps.patch({ canon: { text: trimmed, inputHash, updatedAt: new Date().toISOString(), stale: false, sources } });
      await this.deps.save();
      return true;
    } finally {
      // Deliberately NOT guarded. This flag is this runtime's own in-flight bookkeeping, not
      // chat state; leaving it set because the world moved would wedge canon regeneration for
      // the rest of the session. A `finally` that releases something the run itself took is the
      // one kind of post-await write that must always run.
      this.inFlight = false;
    }
  }
}
