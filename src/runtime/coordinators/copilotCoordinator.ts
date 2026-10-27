import {
  Blackboard, authorsOwnNote, evaluateGate, objectiveLineApplies, renderGateText, type EngineState, type NormalizedStory, type Story,
} from "@engine/index";
import type { CopilotMessage, CopilotStage, DriverContext, ProposalResult, Suggestion } from "@copilot/index";

const authoring = () => import("@copilot/index");
const provisioning = () => import("../copilotProvisioning");
import type { ModelAsk, ModelCall } from "@extraction/index";
import type { ProvisioningEnvironment, ProvisioningOp, ProvisioningResult, WizardSessionState } from "@wizard/types";
import { wizardSessionKey } from "@wizard/sessionKey";
import { draftCastNames } from "@wizard/castNames";
import type { CardReadBackRecord } from "@utils/cardReadBack";
import type { WIEntrySnapshot } from "@services/STAPI";
import { lorebookFileId } from "@utils/string";
import { COPILOT_NUDGE_KEY } from "@constants/defaults";
import { buildConvergenceReadout } from "../snapshot";
import type { CopilotRuntimeSettings } from "../types";
import type { RunOwnership } from "../runToken";
import type { ProvisioningScope } from "../copilotProvisioning";
import type { ChatHost, PromptHost, ProvisioningHost } from "../hostPorts";

export interface CopilotCoordinatorDeps {
  getStory: () => NormalizedStory | null;
  getState: () => EngineState | null;
  getSettings: () => CopilotRuntimeSettings;
  model: ModelCall;
  getCanon: () => string;
  notify: () => void;
  ownership: RunOwnership;
  // Which lorebooks this story may write into, and the author's way to add one.
  wizardSession?: (key: string) => WizardSessionState | null;
  saveWizardSession?: (session: WizardSessionState) => void;
  openChat?: () => string | null;
  hosts: { prompt: PromptHost; chat: Pick<ChatHost, "lastMessageText">; provisioning: ProvisioningHost };
}

// Authoring stages, the driver read-model and the one-turn nudge. Stateless apart from the
// nudge currently injected — nothing here is persisted. The nudge belongs to the chat it was set in.
export class CopilotCoordinator {
  private nudge: { text: string; depth: number; chatId: string | null } | null = null;

  constructor(private readonly deps: CopilotCoordinatorDeps) {}

  private ask(debugResponse?: string): ModelAsk {
    return { role: "authoring", pass: "copilot", debugResponse: debugResponse ?? null };
  }

  async runStage(input: { draft: Story; stage: CopilotStage; message: string; history: CopilotMessage[]; environment?: ProvisioningEnvironment }, debugResponse?: string): Promise<ProposalResult> {
    const environment = input.environment ?? (input.stage === "provisioning" || input.stage === "effects" ? this.getProvisioningEnvironment(input.draft) : undefined);
    return (await authoring()).runAuthoringStage({ ...input, environment }, this.deps.model, this.ask(debugResponse));
  }

  // What the install already has, plus which lorebooks this story owns — the only facts the
  // create-only rule needs. Read fresh every time: the wizard is creating assets as it goes.
  // `lorebookNames` is *every* book, not just the globally selected ones: an inactive book the user
  // wrote is still theirs, and creating over it would be exactly the thing create-only forbids.
  getProvisioningEnvironment(draft?: Story): ProvisioningEnvironment {
    const safe = <T>(read: () => T[], fallback: T[]): T[] => { try { return read(); } catch { return fallback; } };
    const story = draft ?? this.deps.getStory();
    const host = this.deps.hosts.provisioning;
    const lorebookNames = safe(host.listAllLorebooks, safe(host.listGlobalLorebooks, []));
    const granted = this.grantedLorebooks(lorebookNames, draft);
    return {
      characterNames: [...new Set([...safe(host.getAllCharacterNames, []), ...this.ledgerCardNames(draft)])],
      lorebookNames,
      groupNames: safe(host.listGroupNames, []),
      storyLorebooks: story?.requirements?.lorebooks ?? [],
      // Owned = the books this wizard already created for this story (the session's ledger, read
      // against what the install lists) plus the ones the author granted. File ids, never the
      // requirement, never the display name.
      ownedLorebooks: [...new Set([...this.sessionOwnedLorebooks(lorebookNames, draft), ...granted])],
      grantedLorebooks: granted,
      castNames: draftCastNames(story),
      personaNames: safe(host.listPersonas, []),
      groupCasts: host.listGroupCasts ? safe(host.listGroupCasts, []) : [],
    };
  }

  private sessionFor(draft?: Story): WizardSessionState | null {
    return this.deps.wizardSession?.(this.sessionKeyFor(draft)) ?? null;
  }

  // Ownership is the books this wizard recorded creating AS books. A name in `applied` alone
  // is only a claim that something by that name was made: a card named after one of the user's
  // listed books read as owning it.
  private sessionOwnedLorebooks(lorebooks: string[], draft?: Story): string[] {
    const listed = (name: string) => lorebooks.some((entry) => entry.trim().toLowerCase() === lorebookFileId(name).toLowerCase());
    const session = this.sessionFor(draft);
    return (session?.createdLorebooks ?? []).map(lorebookFileId).filter(listed);
  }

  private ledgerCardNames(draft?: Story): string[] {
    return (this.sessionFor(draft)?.createdCards ?? []).flatMap((card) => [card.name, card.requested]);
  }

  private grantedLorebooks(lorebooks: string[], draft?: Story): string[] {
    const listed = (fileId: string) => lorebooks.some((entry) => entry.trim().toLowerCase() === fileId.toLowerCase());
    return (this.sessionFor(draft)?.grants ?? []).map((grant) => grant.lorebookFileId).filter(listed);
  }

  private provisioningScope(): ProvisioningScope {
    return {
      ownership: this.deps.ownership, host: this.deps.hosts.provisioning, session: (draft) => this.sessionFor(draft), sessionKey: (draft) => this.sessionKeyFor(draft),
      storyScopeId: (draft) => this.storyScopeId(draft), environment: (draft) => this.getProvisioningEnvironment(draft), save: this.deps.saveWizardSession,
    };
  }

  async recheckCreatedCard(op: Extract<ProvisioningOp, { kind: "createCharacterCard" }>, avatar: string, draft?: Story): Promise<CardReadBackRecord> {
    return (await provisioning()).recheckCreatedCard(this.provisioningScope(), op, avatar, draft);
  }

  private sessionKeyFor(draft?: Story): string {
    const story = draft ?? this.deps.getStory();
    return wizardSessionKey({ id: (story as { id?: string } | null)?.id, title: story?.title });
  }

  private storyScopeId(draft?: Story): string {
    const story = draft ?? this.deps.getStory();
    return (story as { id?: string } | null)?.id ?? story?.title ?? this.sessionFor(draft)?.key ?? "story";
  }

  // What a review card shows before the author confirms a write: the entry as it stands, so
  // replacing it is a visible decision rather than a promise.
  async readProvisioningEntry(lorebook: string, comment: string): Promise<WIEntrySnapshot | null> {
    return this.deps.hosts.provisioning.readWIEntry(lorebook, comment);
  }

  async applyProvisioning(op: ProvisioningOp, draft?: Story): Promise<ProvisioningResult> {
    return (await provisioning()).applyProvisioning(this.provisioningScope(), op, draft);
  }

  getDriverContext(): DriverContext | null {
    const story = this.deps.getStory();
    const state = this.deps.getState();
    if (!story || !state) return null;
    const blackboard = new Blackboard(story, state.blackboard);
    const active = story.checkpointById[state.activeCheckpointId] ?? null;
    const outgoing = story.outgoingByCheckpoint[state.activeCheckpointId] ?? [];
    return {
      title: story.title,
      activeCheckpointId: active?.id ?? null,
      activeCheckpointName: active?.name ?? null,
      activeObjective: active?.objective ?? "",
      ownNote: authorsOwnNote(active),
      objectiveLine: objectiveLineApplies(story, active),
      unmetGates: outgoing
        .filter((transition) => !evaluateGate(transition.gate, blackboard))
        .map((transition) => `${renderGateText(transition.gate)} → ${transition.to}`)
        .filter((text) => text.length > 0),
      upcomingAnchors: buildConvergenceReadout(story, state)
        .filter((entry) => !entry.reached)
        .map((entry) => ({ id: entry.anchorId, name: entry.anchorName, progress: entry.progress, threshold: entry.threshold })),
      blackboard: state.blackboard.values,
      canon: this.deps.getCanon(),
      recentChat: this.deps.hosts.chat.lastMessageText(),
    };
  }

  async runSuggest(debugResponse?: string): Promise<Suggestion[]> {
    const context = this.getDriverContext();
    if (!context) return [];
    return (await authoring()).runDriverSuggest(context, this.deps.model, this.ask(debugResponse));
  }

  async runReport(debugResponse?: string): Promise<string> {
    const context = this.getDriverContext();
    if (!context) return "";
    return (await authoring()).runDriverReport(context, this.deps.model, this.ask(debugResponse));
  }

  setNudge(text: string, depth = 1) {
    const trimmed = text.trim();
    if (!trimmed || !this.deps.getSettings().enabled) return;
    this.deps.hosts.prompt.setStoryExtensionPrompt(COPILOT_NUDGE_KEY, trimmed, depth);
    this.nudge = { text: trimmed, depth, chatId: this.openChat() };
    this.deps.notify();
  }

  clearNudge() {
    if (this.nudge === null) return;
    this.deps.hosts.prompt.clearStoryExtensionPrompt(COPILOT_NUDGE_KEY);
    this.nudge = null;
    this.deps.notify();
  }

  reapplyNudge() {
    if (this.nudge === null) return;
    if (this.nudge.chatId !== this.openChat()) {
      this.clearNudge();
      return;
    }
    this.deps.hosts.prompt.setStoryExtensionPrompt(COPILOT_NUDGE_KEY, this.nudge.text, this.nudge.depth);
  }

  getActiveNudge(): string | null {
    return this.nudge !== null && this.nudge.chatId === this.openChat() ? this.nudge.text : null;
  }

  private openChat(): string | null {
    return this.deps.openChat?.() ?? null;
  }
}
