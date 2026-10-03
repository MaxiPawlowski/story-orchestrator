import type { EngineState, NormalizedStoryV2 } from "@engine/index";
import {
  applyEpistemicInjection, applyLedgerInjection, applyMemoryInjection, ARC_OPEN_INJECT_LIMIT, buildLedgerView,
  buildMemoryInjectionBlocks, clearAllMemoryInjection, memoryInjectionView, pinnedOverflowOf, type MemoryInjectionView, clearEpistemicInjection, openArcTexts, withoutExcludedThreads,
  renderLedgerBlock, renderPrivateEpistemicBlock, selectLedgerRows, renderSoloEpistemicBlock, type LedgerBinding, type LedgerView, type MemoryTier,
  type ScoreContext, castVoices, hasInnerVoice, innerRender, joinBlocks, loadInnerRender, withoutLapsedIntents,
  type CastVoice, type EpistemicEntry, type MemoryEntry,
  heldSecrets, keptFrom, ledgerWithoutSecrets, sharedTierView, writeMemoryBlocks, type HeldSecret,
} from "@memory/index";
import { EPISTEMIC_INJECTION_DEPTH, EPISTEMIC_INJECTION_KEY, LEDGER_INJECTION_DEPTH } from "@constants/defaults";
import type { ChapterPort } from "./chapterPort";

import { buildScoreContext } from "./scoreContext";
import { activeSpeakerId, enabledCharacterIds, enabledCharacterNames, nameForRosterId, namesForRosterId, rosterIdForName, rosterMemberName } from "./roster";
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
  beatFor: (rosterId: string) => string;
  chapters?: () => Pick<ChapterPort, "inject">;
  ledgerFocus?: () => string[];
}

export interface StagedPrivateBlock {
  key: string;
  depth: number;
  role: number;
  value: string;
  target: string;
}

interface SharedBlocks {
  memory: Record<MemoryTier, string>;
  ledger: string;
}

// What the memory stores put into SillyTavern's prompt, split out of MemoryCoordinator. The
// coordinator owns the stores; this renders them into the extension-prompt slots and holds the
// per-member private blocks staged for the next draft. Everything here is synchronous host writes, and
// the only memory field it writes is `pinnedOverflow`, through the coordinator.
export class MemoryInjector {
  private stagedPrivate = new Map<string, { shared: SharedBlocks | null; epistemic: string }>();
  private rest: SharedBlocks | null = null;
  private draft: { storyId: string; rosterId: string | null; epistemic?: string } | null = null;
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
      openArcs: this.deps.enabled() ? openArcTexts(withoutExcludedThreads(this.state.arcs, this.state.derived), ARC_OPEN_INJECT_LIMIT) : [],
      weights: this.state.settings.scoreWeights,
    });
  }

  private options() {
    return { tokenBudgets: this.state.settings.tierTokenBudgets, scoreContext: this.scoreContext() };
  }

  /** The read-models the snapshot takes from the injector, fates from the same update that wrote the blocks. */
  readModels(): { ledger: LedgerView[]; memoryInjection: MemoryInjectionView | null; privateBlocks: StagedPrivateBlock[]; secretsHeld: boolean; groupChat: boolean } {
    const story = this.deps.getStory();
    return {
      ledger: this.ledgerView(), memoryInjection: this.lastInjection, privateBlocks: this.stagedBlocks(),
      secretsHeld: Boolean(story && this.secrets(story).length), groupChat: Boolean(story && this.hosts.roster.getActiveGroup()),
    };
  }

  private stagedBlocks(): StagedPrivateBlock[] {
    const story = this.deps.getStory();
    if (!story || this.withheld || !this.hosts.roster.getActiveGroup()) return [];
    return [...this.stagedPrivate].filter(([, staged]) => staged.epistemic).map(([id, staged]) => ({
      key: EPISTEMIC_INJECTION_KEY, depth: EPISTEMIC_INJECTION_DEPTH, role: 0, value: staged.epistemic, target: nameForRosterId(story, id),
    }));
  }

  ledgerView(): LedgerView[] {
    const state = this.deps.getState();
    if (!state) return [];
    return buildLedgerView(this.state.ledger, this.deps.ledgerBindings(), state.blackboard.values, state.blackboard.versions);
  }

  private knowledge(): EpistemicEntry[] {
    return withoutLapsedIntents(this.state.epistemic, { boundary: this.deps.getState()?.boundary ?? 0, derived: this.state.derived });
  }

  private voices(story: NormalizedStoryV2): CastVoice[] {
    const voices = castVoices(story, this.deps.getState()?.activeCheckpointId ?? null);
    if (!this.hosts.roster.getActiveGroup()) return voices;
    const enabled = new Set(enabledCharacterIds(story, this.hosts.roster));
    return voices.map((voice) => (enabled.has(voice.id) ? { ...voice, selfVoiced: true } : voice));
  }

  private memberBlock(story: NormalizedStoryV2, id: string, knowledge: EpistemicEntry[], beat = ""): string {
    const known = this.deps.capable() ? knowledge : [];
    const privateBlock = known.length ? renderPrivateEpistemicBlock(known, namesForRosterId(story, id)) : "";
    const render = innerRender();
    return render ? render.memberAimsBlock(this.voices(story), id, beat, known, privateBlock) : privateBlock;
  }

  private soloBlock(story: NormalizedStoryV2, knowledge: string, beat = ""): string {
    const render = innerRender();
    return render ? joinBlocks(render.soloAims(this.voices(story), beat), knowledge) : knowledge;
  }

  memberPrivateBlock(rosterId: string): string {
    const story = this.deps.getStory();
    return story ? this.memberBlock(story, rosterId, this.knowledge()) : "";
  }

  update() {
    const story = this.deps.getStory();
    if (this.draft && (!story || this.draft.storyId !== storyKey(story))) this.draft = null;
    const returning = this.deps.chapters?.().inject(this.hosts.prompt, Boolean(story && this.deps.enabled())) ?? new Map<string, string>();
    if (!story || !this.deps.enabled()) {
      clearAllMemoryInjection(this.hosts.prompt);
      this.stagedPrivate.clear();
      this.rest = null;
      this.lastInjection = null;
      if (this.state.pinnedOverflow) this.deps.setPinnedOverflow(0);
      return;
    }
    const options = this.options();
    const speaker = activeSpeakerId(story, this.hosts.roster);
    const secrets = this.secrets(story);
    const resting = sharedTierView(this.state.entries, secrets, null);
    const injection = applyMemoryInjection(this.hosts.prompt, resting.entries, speaker, this.state.settings.injectionDepths, { ...options, withheld: resting.withheld });
    this.lastInjection = memoryInjectionView(injection, this.highWater);
    const pinnedOverflow = pinnedOverflowOf(injection.fates);
    if (pinnedOverflow !== this.state.pinnedOverflow) this.deps.setPinnedOverflow(pinnedOverflow);

    const state = this.deps.getState();
    const values = state?.blackboard.values ?? {};
    const versions = state?.blackboard.versions ?? {};
    const ledger = buildLedgerView(this.state.ledger, this.deps.ledgerBindings(), values, versions);
    const focus = { boundary: state?.boundary ?? 0, names: this.ledgerFocusNames(story) };
    const ledgerFor = (member: string[] | null) => renderLedgerBlock(selectLedgerRows(ledgerWithoutSecrets(ledger, secrets, member), focus));
    this.rest = { memory: injection.blocks, ledger: ledgerFor(null) };
    applyLedgerInjection(this.hosts.prompt, this.rest.ledger, LEDGER_INJECTION_DEPTH);

    this.stagedPrivate.clear();
    const capable = this.deps.capable();
    const voiced = hasInnerVoice(this.voices(story));
    if (voiced && !innerRender()) void loadInnerRender().then(() => this.update());
    if (capable || voiced) {
      const knowledge = this.knowledge();
      for (const id of this.stagedIds(story)) {
        const names = namesForRosterId(story, id);
        const view = sharedTierView(this.state.entries, secrets, names);
        const memory = capable ? buildMemoryInjectionBlocks(view.entries, id, { ...options, withheld: view.withheld }) : null;
        if (memory) memory.facts = [memory.facts, returning.get(id) ?? ""].filter(Boolean).join("\n");
        const shared = memory ? { memory, ledger: ledgerFor(names) } : null;
        this.stagedPrivate.set(id, { shared, epistemic: this.memberBlock(story, id, knowledge) });
      }
      // A group has no speaker between drafts: whatever holds the prompt at rest (impersonate, quiet
      // generations, other extensions) must not carry the last drafted member's private knowledge.
      const solo = () => this.soloBlock(story, capable ? renderSoloEpistemicBlock(knowledge, enabledCharacterNames(story, this.hosts.roster)) : "");
      const group = Boolean(this.hosts.roster.getActiveGroup());
      const speakerBlock = this.withheld || group ? "" : speaker ? (this.stagedPrivate.get(speaker)?.epistemic ?? "") : solo();
      applyEpistemicInjection(this.hosts.prompt, speakerBlock, EPISTEMIC_INJECTION_DEPTH);
      if (group && this.draft) this.restageDraft(this.draft.rosterId);
    } else {
      clearEpistemicInjection(this.hosts.prompt);
    }
  }

  private stagedIds(story: NormalizedStoryV2): string[] {
    const ids = enabledCharacterIds(story, this.hosts.roster);
    const drafted = this.draft?.rosterId;
    return drafted && !ids.includes(drafted) ? [...ids, drafted] : ids;
  }

  private ledgerFocusNames(story: NormalizedStoryV2): string[] {
    const speaker = activeSpeakerId(story, this.hosts.roster);
    return [...(this.deps.ledgerFocus?.() ?? []), ...(speaker ? namesForRosterId(story, speaker) : [])];
  }

  private secrets(story: NormalizedStoryV2): HeldSecret[] {
    if (!this.deps.capable() || !this.hosts.roster.getActiveGroup()) return [];
    return heldSecrets(this.knowledge(), story.roster.flatMap((member) => namesForRosterId(story, member.id)));
  }

  private writeShared(shared: SharedBlocks | null) {
    if (!shared) return;
    writeMemoryBlocks(this.hosts.prompt, shared.memory, this.state.settings.injectionDepths);
    applyLedgerInjection(this.hosts.prompt, shared.ledger, LEDGER_INJECTION_DEPTH);
  }

  private setPrivateBlocks(shared: SharedBlocks | null, epistemic: string) {
    applyEpistemicInjection(this.hosts.prompt, epistemic, EPISTEMIC_INJECTION_DEPTH);
    this.writeShared(shared);
  }

  // Impersonate writes as the player and quiet generations serve other tools, even when ST drafted
  // a member for them: neither may read a character's private knowledge.
  withholdPrivateKnowledge() {
    this.withheld = true;
    clearEpistemicInjection(this.hosts.prompt);
    if (this.stagedPrivate.size) this.writeShared(this.rest);
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
    const epistemic = this.withheld ? "" : this.draft?.epistemic ?? staged?.epistemic ?? "";
    if (staged) this.setPrivateBlocks(this.withheld && staged.shared ? this.rest : staged.shared, epistemic);
    else applyEpistemicInjection(this.hosts.prompt, epistemic, EPISTEMIC_INJECTION_DEPTH);
  }

  draftedRosterId(chId: number | [number]): string | null {
    const story = this.deps.getStory();
    const numericId = typeof chId === "number" ? chId : Array.isArray(chId) ? chId[0] : undefined;
    const name = story ? this.hosts.injection.getCharacterNameById(numericId) : undefined;
    return story && name ? rosterIdForName(story, name) : null;
  }

  onMemberDrafted(chId: number | [number]) {
    const story = this.deps.getStory();
    if (!story || !this.stagedPrivate.size) return;
    const rosterId = this.draftedRosterId(chId);
    if (rosterId && !this.stagedPrivate.has(rosterId)) {
      this.draft = { storyId: storyKey(story), rosterId };
      this.update();
    }
    const staged = rosterId ? this.stagedPrivate.get(rosterId) : undefined;
    if (!rosterId || !staged) {
      this.draft = { storyId: storyKey(story), rosterId: null };
      this.setPrivateBlocks(this.deps.capable() ? this.rest : null, "");
      return;
    }
    const drafted = this.deps.beatFor(rosterId);
    const beat = drafted && keptFrom(drafted, this.secrets(story), namesForRosterId(story, rosterId)) ? "" : drafted;
    const epistemic = beat ? this.memberBlock(story, rosterId, this.knowledge(), beat) : staged.epistemic;
    this.draft = beat ? { storyId: storyKey(story), rosterId, epistemic } : { storyId: storyKey(story), rosterId };
    this.setPrivateBlocks(staged.shared, epistemic);
  }

  onSoloGeneration() {
    const story = this.deps.getStory();
    if (!story || this.withheld || this.hosts.roster.getActiveGroup() || !this.deps.enabled()) return;
    const beat = story.roster.length === 1 ? this.deps.beatFor(story.roster[0].id) : "";
    if (!beat) return;
    const known = this.deps.capable() ? renderSoloEpistemicBlock(this.knowledge(), enabledCharacterNames(story, this.hosts.roster)) : "";
    applyEpistemicInjection(this.hosts.prompt, this.soloBlock(story, known, beat), EPISTEMIC_INJECTION_DEPTH);
  }

  heldSecretsKey(): string {
    const story = this.deps.getStory();
    const sorted = (values: Iterable<string>) => [...values].sort();
    return JSON.stringify((story ? this.secrets(story) : []).map((secret) => [sorted(secret.knowers), secret.onlyFrom ? sorted(secret.onlyFrom) : null, secret.phrasings.map(sorted)]));
  }

  restingEntries(entries: MemoryEntry[]): MemoryEntry[] {
    const story = this.deps.getStory();
    const view = sharedTierView(entries, story ? this.secrets(story) : [], null);
    return view.entries.filter((entry) => !view.withheld.has(entry.id));
  }

  blocks(): Record<MemoryTier, string> {
    const story = this.deps.getStory();
    const entries = story && this.deps.enabled() ? this.state.entries : [];
    const view = sharedTierView(entries, story ? this.secrets(story) : [], null);
    return buildMemoryInjectionBlocks(view.entries, activeSpeakerId(story, this.hosts.roster), { ...this.options(), withheld: view.withheld });
  }

  epistemicBlock(): string {
    const story = this.deps.getStory();
    if (!story || !this.deps.capable()) return "";
    if (this.hosts.roster.getActiveGroup()) return this.appliedEpistemicBlock();
    const speaker = activeSpeakerId(story, this.hosts.roster);
    return speaker
      ? renderPrivateEpistemicBlock(this.knowledge(), namesForRosterId(story, speaker))
      : renderSoloEpistemicBlock(this.knowledge(), enabledCharacterNames(story, this.hosts.roster));
  }

  /** What ST's next prompt ACTUALLY holds, not a re-render for whoever speaks next (in a group the
   * Applied block belongs to the DRAFTED member — see the note in the plan-05 record). */
  appliedEpistemicBlock(): string { return this.hosts.injection.readInjectedPromptBlocks().find((block) => block.key === EPISTEMIC_INJECTION_KEY)?.value ?? ""; }

  ledgerBlock(): string { return !this.deps.getStory() || !this.deps.enabled() ? "" : renderLedgerBlock(this.ledgerView()); }
}
