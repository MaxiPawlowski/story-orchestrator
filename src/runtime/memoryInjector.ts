import type { EngineState, NormalizedStoryV2 } from "@engine/index";
import {
  applyEpistemicInjection, applyLedgerInjection, applyMemoryInjection, ARC_OPEN_INJECT_LIMIT, buildLedgerView,
  buildMemoryInjectionBlocks, clearAllMemoryInjection, memoryInjectionView, pinnedOverflowOf, type MemoryInjectionView, clearEpistemicInjection, memoryExtensionKey, openArcTexts,
  renderLedgerBlock, renderPrivateEpistemicBlock, renderSoloEpistemicBlock, type LedgerBinding, type LedgerView, type MemoryTier,
  type ScoreContext,
} from "@memory/index";
import { clearStoryExtensionPrompt, getActiveGroup, getCharacterNameById, readInjectedPromptBlocks, setStoryExtensionPrompt } from "@services/STAPI";
import { EPISTEMIC_INJECTION_DEPTH, EPISTEMIC_INJECTION_KEY, LEDGER_INJECTION_DEPTH } from "@constants/defaults";

import { buildScoreContext } from "./scoreContext";
import { activeSpeakerId, enabledCharacterIds, enabledCharacterNames, namesForRosterId, rosterIdForName, rosterMemberName } from "./roster";
import type { MemoryRuntimeState } from "./types";

export interface MemoryInjectorDeps {
  getStory: () => NormalizedStoryV2 | null;
  getState: () => EngineState | null;
  memory: () => MemoryRuntimeState;
  enabled: () => boolean;
  capable: () => boolean;
  ledgerBindings: () => LedgerBinding[];
  setPinnedOverflow: (count: number) => void;
}

// V26: what the memory stores put into SillyTavern's prompt, split out of MemoryCoordinator. The
// coordinator owns the stores; this renders them into the extension-prompt slots and holds the
// per-member private blocks staged for the next draft. Everything here is synchronous host writes, and
// the only memory field it writes is `pinnedOverflow`, through the coordinator.
export class MemoryInjector {
  private stagedPrivate = new Map<string, { facts: string; epistemic: string }>();
  private lastInjection: MemoryInjectionView | null = null;
  private readonly highWater: Partial<Record<MemoryTier, number>> = {};

  constructor(private readonly deps: MemoryInjectorDeps) {}

  private get state(): MemoryRuntimeState {
    return this.deps.memory();
  }

  private scoreContext(): ScoreContext {
    return buildScoreContext({
      boundary: this.deps.getState()?.boundary ?? 0,
      rosterNames: this.deps.getStory()?.roster.map(rosterMemberName) ?? [],
      openArcs: this.deps.enabled() ? openArcTexts(this.state.arcs, ARC_OPEN_INJECT_LIMIT) : [],
      weights: this.state.settings.scoreWeights,
    });
  }

  private options() {
    return { tokenBudgets: this.state.settings.tierTokenBudgets, scoreContext: this.scoreContext() };
  }

  /** v2.4 plan 08: the read-models the snapshot takes from the injector, fates from the same update that wrote the blocks. */
  readModels(): { ledger: LedgerView[]; memoryInjection: MemoryInjectionView | null } {
    return { ledger: this.ledgerView(), memoryInjection: this.lastInjection };
  }

  ledgerView(): LedgerView[] {
    const state = this.deps.getState();
    if (!state) return [];
    return buildLedgerView(this.state.ledger, this.deps.ledgerBindings(), state.blackboard.values, state.blackboard.versions);
  }

  update() {
    const story = this.deps.getStory();
    if (!story || !this.deps.enabled()) {
      clearAllMemoryInjection();
      this.stagedPrivate.clear();
      this.lastInjection = null;
      if (this.state.pinnedOverflow) this.deps.setPinnedOverflow(0);
      return;
    }
    const options = this.options();
    const speaker = activeSpeakerId(story);
    const injection = applyMemoryInjection(this.state.entries, speaker, this.state.settings.injectionDepths, options);
    this.lastInjection = memoryInjectionView(injection, this.highWater);
    const pinnedOverflow = pinnedOverflowOf(injection.fates);
    if (pinnedOverflow !== this.state.pinnedOverflow) this.deps.setPinnedOverflow(pinnedOverflow);

    const state = this.deps.getState();
    const values = state?.blackboard.values ?? {};
    const versions = state?.blackboard.versions ?? {};
    applyLedgerInjection(renderLedgerBlock(buildLedgerView(this.state.ledger, this.deps.ledgerBindings(), values, versions)), LEDGER_INJECTION_DEPTH);

    this.stagedPrivate.clear();
    if (this.deps.capable()) {
      for (const id of enabledCharacterIds(story)) {
        const facts = buildMemoryInjectionBlocks(this.state.entries, id, options).facts;
        const epistemic = renderPrivateEpistemicBlock(this.state.epistemic, namesForRosterId(story, id));
        this.stagedPrivate.set(id, { facts, epistemic });
      }
      // A group has no speaker between drafts: whatever holds the prompt at rest (impersonate, quiet
      // generations, other extensions) must not carry the last drafted member's private knowledge.
      const speakerBlock = getActiveGroup() ? "" : speaker ? (this.stagedPrivate.get(speaker)?.epistemic ?? "") : renderSoloEpistemicBlock(this.state.epistemic, enabledCharacterNames(story));
      applyEpistemicInjection(speakerBlock, EPISTEMIC_INJECTION_DEPTH);
    } else {
      clearEpistemicInjection();
    }
  }

  private setPrivateBlocks(facts: string, epistemic: string) {
    applyEpistemicInjection(epistemic, EPISTEMIC_INJECTION_DEPTH);
    const factsKey = memoryExtensionKey("facts");
    if (facts) setStoryExtensionPrompt(factsKey, facts, this.state.settings.injectionDepths.facts);
    else clearStoryExtensionPrompt(factsKey);
  }

  // Impersonate writes as the player and quiet generations serve other tools, even when ST drafted
  // a member for them: neither may read a character's private knowledge.
  withholdPrivateKnowledge() {
    clearEpistemicInjection();
  }

  onMemberDrafted(chId: number | [number]) {
    const story = this.deps.getStory();
    if (!story || !this.deps.capable()) return;
    const numericId = typeof chId === "number" ? chId : Array.isArray(chId) ? chId[0] : undefined;
    const name = getCharacterNameById(numericId);
    const rosterId = name ? rosterIdForName(story, name) : null;
    const staged = rosterId ? this.stagedPrivate.get(rosterId) : undefined;
    if (!staged) {
      this.setPrivateBlocks(buildMemoryInjectionBlocks(this.state.entries, activeSpeakerId(story), this.options()).facts, "");
      return;
    }
    this.setPrivateBlocks(staged.facts, staged.epistemic);
  }

  blocks(): Record<MemoryTier, string> {
    const story = this.deps.getStory();
    const entries = story && this.deps.enabled() ? this.state.entries : [];
    return buildMemoryInjectionBlocks(entries, activeSpeakerId(story), this.options());
  }

  epistemicBlock(): string {
    const story = this.deps.getStory();
    if (!story || !this.deps.capable()) return "";
    if (getActiveGroup()) return this.appliedEpistemicBlock();
    const speaker = activeSpeakerId(story);
    return speaker
      ? renderPrivateEpistemicBlock(this.state.epistemic, namesForRosterId(story, speaker))
      : renderSoloEpistemicBlock(this.state.epistemic, enabledCharacterNames(story));
  }

  /** What ST's next prompt ACTUALLY holds, not a re-render for whoever speaks next (in a group the
   *  applied block belongs to the DRAFTED member — see the 2026-09-22 note in the plan-05 record). */
  appliedEpistemicBlock(): string { return readInjectedPromptBlocks().find((block) => block.key === EPISTEMIC_INJECTION_KEY)?.value ?? ""; }

  ledgerBlock(): string { return !this.deps.getStory() || !this.deps.enabled() ? "" : renderLedgerBlock(this.ledgerView()); }
}
