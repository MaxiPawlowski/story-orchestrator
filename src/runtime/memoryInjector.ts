import type { EngineState, NormalizedStoryV2 } from "@engine/index";
import {
  applyEpistemicInjection, applyLedgerInjection, applyMemoryInjection, ARC_OPEN_INJECT_LIMIT, buildLedgerView,
  buildMemoryInjectionBlocks, clearAllMemoryInjection, memoryInjectionView, pinnedOverflowOf, type MemoryInjectionView, clearEpistemicInjection, memoryExtensionKey, openArcTexts,
  renderLedgerBlock, renderPrivateEpistemicBlock, renderSoloEpistemicBlock, type LedgerBinding, type LedgerView, type MemoryTier,
  type ScoreContext,
} from "@memory/index";
import { EPISTEMIC_INJECTION_DEPTH, EPISTEMIC_INJECTION_KEY, LEDGER_INJECTION_DEPTH } from "@constants/defaults";

import { buildScoreContext } from "./scoreContext";
import { activeSpeakerId, enabledCharacterIds, enabledCharacterNames, namesForRosterId, rosterIdForName, rosterMemberName } from "./roster";
import type { MemoryRuntimeState } from "./types";
import type { InjectorHosts } from "./hostPorts";

const storyKey = (story: NormalizedStoryV2): string => story.id ?? story.title;

export interface MemoryInjectorDeps {
  getStory: () => NormalizedStoryV2 | null;
  getState: () => EngineState | null;
  memory: () => MemoryRuntimeState;
  enabled: () => boolean;
  capable: () => boolean;
  ledgerBindings: () => LedgerBinding[];
  setPinnedOverflow: (count: number) => void;
  hosts: () => InjectorHosts;
}

// What the memory stores put into SillyTavern's prompt, split out of MemoryCoordinator. The
// coordinator owns the stores; this renders them into the extension-prompt slots and holds the
// per-member private blocks staged for the next draft. Everything here is synchronous host writes, and
// the only memory field it writes is `pinnedOverflow`, through the coordinator.
export class MemoryInjector {
  private stagedPrivate = new Map<string, { facts: string; epistemic: string }>();
  private draft: { storyId: string; rosterId: string | null } | null = null;
  private withheld = false;
  private lastInjection: MemoryInjectionView | null = null;
  private readonly highWater: Partial<Record<MemoryTier, number>> = {};

  constructor(private readonly deps: MemoryInjectorDeps) {}

  private get hosts(): InjectorHosts {
    return this.deps.hosts();
  }

  private get state(): MemoryRuntimeState {
    return this.deps.memory();
  }

  private scoreContext(): ScoreContext {
    return buildScoreContext(this.hosts.chat, {
      boundary: this.deps.getState()?.boundary ?? 0,
      rosterNames: this.deps.getStory()?.roster.map(rosterMemberName) ?? [],
      openArcs: this.deps.enabled() ? openArcTexts(this.state.arcs, ARC_OPEN_INJECT_LIMIT) : [],
      weights: this.state.settings.scoreWeights,
    });
  }

  private options() {
    return { tokenBudgets: this.state.settings.tierTokenBudgets, scoreContext: this.scoreContext() };
  }

  /** The read-models the snapshot takes from the injector, fates from the same update that wrote the blocks. */
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
    if (this.draft && (!story || this.draft.storyId !== storyKey(story))) this.draft = null;
    if (!story || !this.deps.enabled()) {
      clearAllMemoryInjection(this.hosts.prompt);
      this.stagedPrivate.clear();
      this.lastInjection = null;
      if (this.state.pinnedOverflow) this.deps.setPinnedOverflow(0);
      return;
    }
    const options = this.options();
    const speaker = activeSpeakerId(story, this.hosts.roster);
    const injection = applyMemoryInjection(this.hosts.prompt, this.state.entries, speaker, this.state.settings.injectionDepths, options);
    this.lastInjection = memoryInjectionView(injection, this.highWater);
    const pinnedOverflow = pinnedOverflowOf(injection.fates);
    if (pinnedOverflow !== this.state.pinnedOverflow) this.deps.setPinnedOverflow(pinnedOverflow);

    const state = this.deps.getState();
    const values = state?.blackboard.values ?? {};
    const versions = state?.blackboard.versions ?? {};
    applyLedgerInjection(this.hosts.prompt, renderLedgerBlock(buildLedgerView(this.state.ledger, this.deps.ledgerBindings(), values, versions)), LEDGER_INJECTION_DEPTH);

    this.stagedPrivate.clear();
    if (this.deps.capable()) {
      for (const id of enabledCharacterIds(story, this.hosts.roster)) {
        const facts = buildMemoryInjectionBlocks(this.state.entries, id, options).facts;
        const epistemic = renderPrivateEpistemicBlock(this.state.epistemic, namesForRosterId(story, id));
        this.stagedPrivate.set(id, { facts, epistemic });
      }
      // A group has no speaker between drafts: whatever holds the prompt at rest (impersonate, quiet
      // generations, other extensions) must not carry the last drafted member's private knowledge.
      const solo = () => renderSoloEpistemicBlock(this.state.epistemic, enabledCharacterNames(story, this.hosts.roster));
      const group = Boolean(this.hosts.roster.getActiveGroup());
      const speakerBlock = this.withheld || group ? "" : speaker ? (this.stagedPrivate.get(speaker)?.epistemic ?? "") : solo();
      applyEpistemicInjection(this.hosts.prompt, speakerBlock, EPISTEMIC_INJECTION_DEPTH);
      if (group && this.draft) this.restageDraft(this.draft.rosterId);
    } else {
      clearEpistemicInjection(this.hosts.prompt);
    }
  }

  private setPrivateBlocks(facts: string, epistemic: string) {
    applyEpistemicInjection(this.hosts.prompt, epistemic, EPISTEMIC_INJECTION_DEPTH);
    const factsKey = memoryExtensionKey("facts");
    if (facts) this.hosts.prompt.setStoryExtensionPrompt(factsKey, facts, this.state.settings.injectionDepths.facts);
    else this.hosts.prompt.clearStoryExtensionPrompt(factsKey);
  }

  // Impersonate writes as the player and quiet generations serve other tools, even when ST drafted
  // a member for them: neither may read a character's private knowledge.
  withholdPrivateKnowledge() {
    this.withheld = true;
    clearEpistemicInjection(this.hosts.prompt);
  }

  releaseDraft() {
    this.draft = null;
    this.withheld = false;
  }

  releaseWithhold(): boolean {
    const held = this.withheld;
    this.withheld = false;
    return held;
  }

  private restageDraft(rosterId: string | null) {
    const staged = rosterId ? this.stagedPrivate.get(rosterId) : undefined;
    const epistemic = this.withheld ? "" : staged?.epistemic ?? "";
    if (staged) this.setPrivateBlocks(staged.facts, epistemic);
    else applyEpistemicInjection(this.hosts.prompt, epistemic, EPISTEMIC_INJECTION_DEPTH);
  }

  onMemberDrafted(chId: number | [number]) {
    const story = this.deps.getStory();
    if (!story || !this.deps.capable()) return;
    const numericId = typeof chId === "number" ? chId : Array.isArray(chId) ? chId[0] : undefined;
    const name = this.hosts.injection.getCharacterNameById(numericId);
    const rosterId = name ? rosterIdForName(story, name) : null;
    const staged = rosterId ? this.stagedPrivate.get(rosterId) : undefined;
    this.draft = { storyId: storyKey(story), rosterId: staged ? rosterId : null };
    if (!staged) {
      this.setPrivateBlocks(buildMemoryInjectionBlocks(this.state.entries, activeSpeakerId(story, this.hosts.roster), this.options()).facts, "");
      return;
    }
    this.setPrivateBlocks(staged.facts, staged.epistemic);
  }

  blocks(): Record<MemoryTier, string> {
    const story = this.deps.getStory();
    const entries = story && this.deps.enabled() ? this.state.entries : [];
    return buildMemoryInjectionBlocks(entries, activeSpeakerId(story, this.hosts.roster), this.options());
  }

  epistemicBlock(): string {
    const story = this.deps.getStory();
    if (!story || !this.deps.capable()) return "";
    if (this.hosts.roster.getActiveGroup()) return this.appliedEpistemicBlock();
    const speaker = activeSpeakerId(story, this.hosts.roster);
    return speaker
      ? renderPrivateEpistemicBlock(this.state.epistemic, namesForRosterId(story, speaker))
      : renderSoloEpistemicBlock(this.state.epistemic, enabledCharacterNames(story, this.hosts.roster));
  }

  /** What ST's next prompt ACTUALLY holds, not a re-render for whoever speaks next (in a group the
   * Applied block belongs to the DRAFTED member — see the note in the plan-05 record). */
  appliedEpistemicBlock(): string { return this.hosts.injection.readInjectedPromptBlocks().find((block) => block.key === EPISTEMIC_INJECTION_KEY)?.value ?? ""; }

  ledgerBlock(): string { return !this.deps.getStory() || !this.deps.enabled() ? "" : renderLedgerBlock(this.ledgerView()); }
}
