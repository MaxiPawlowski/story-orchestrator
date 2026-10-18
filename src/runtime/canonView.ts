import type { EngineState, NormalizedStory, NormalizedTransition } from "@engine/index";
import { getCanonLite } from "@extraction/canonLite";
import type { ModelCall } from "@extraction/modelRoute";
import type { ParsedFact } from "@extraction/types";
import { canonHistory, openArcTexts, selectCanonFacts, type DerivedRecord, type MemoryEntry } from "@memory/index";
import type { RunOwnership } from "./runToken";
import type { MemoryRuntimeState } from "./types";
import type { JudgeRuntime } from "./judge";
import type { CanonSynthesis } from "./canonSynthesis";

export interface CanonSynthesisDeps {
  getStory: () => NormalizedStory | null;
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
  restingEntries: (entries: MemoryEntry[]) => MemoryEntry[];
  restingLines: (text: string) => string;
  journal?: (summary: string, note: string) => void;
  judge?: () => JudgeRuntime | null;
}

export class CanonView {
  constructor(protected readonly deps: CanonSynthesisDeps) {}

  getCanon(): string {
    const canon = this.deps.memory().canon;
    if (canon?.text && !canon.stale) return this.deps.restingLines(canon.text);
    const story = this.deps.getStory();
    const state = this.deps.getState();
    if (!story || !state) return "";
    return this.deps.restingLines(getCanonLite(story, state.visitedAnchors, this.deps.firedTransitions(), this.deps.facts()));
  }

  getCanonAt(checkpointId: string | null): string {
    const canon = this.deps.memory().canon;
    return canon?.text && !canon.stale && canon.checkpointId !== checkpointId ? this.deps.restingLines(canonHistory(canon.text)) : this.getCanon();
  }

  /** A decided conflict or a rollback was built from a claim this text still asserts.
   *  The text is kept (an author can read it) but its readers stop treating it as current. */
  canonStale(): boolean { return this.deps.memory().canon?.stale === true; }

  // Canon-lite is prompt scaffolding ("Anchor cp1: …", "Gate a -> b"): fine for the memory model,
  // never for the player, which takes the synthesized prose or nothing.
  getCanonProse(): string {
    const memory = this.deps.memory();
    if (memory.canon?.text) return this.canonStale() ? "" : this.deps.restingLines(canonHistory(memory.canon.text));
    return this.deps.restingEntries(memory.entries).filter((entry) => entry.tier === "scene_history" && !entry.foldedInto && !entry.supersededBy).map((entry) => entry.text).join("\n\n");
  }

  protected canonFacts(memory: MemoryRuntimeState) {
    const state = this.deps.getState();
    const objective = this.deps.getStory()?.checkpointById[state?.activeCheckpointId ?? ""]?.objective ?? "";
    const shown = this.deps.restingEntries(memory.entries);
    return selectCanonFacts(shown, 30, { boundary: state?.boundary ?? 0, lastMessageId: state?.lastMessageId, turnText: objective, turnEntities: [], openArcs: openArcTexts(memory.arcs, 8) });
  }

}

export class CanonPort extends CanonView {
  private readonly loading: Promise<CanonSynthesis>;

  constructor(deps: CanonSynthesisDeps) {
    super(deps);
    this.loading = import("./canonSynthesis").then(({ CanonSynthesis: Unit }) => new Unit(deps));
  }

  async regenerateCanon(force = false, draft = false): Promise<boolean> { return (await this.loading).regenerateCanon(force, draft); }

  async decideDraft(accept: boolean): Promise<boolean> { return (await this.loading).decideDraft(accept); }
}
