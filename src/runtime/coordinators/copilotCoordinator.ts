import {
  Blackboard, authorsOwnNote, evaluateGate, objectiveLineApplies, renderGateText, type EngineState, type NormalizedStoryV2, type StoryV2,
} from "@engine/index";
import {
  runAuthoringStage, runDriverReport, runDriverSuggest, type CopilotMessage, type CopilotStage, type DriverContext,
  type ProposalResult, type Suggestion,
} from "@copilot/index";
import { getLastMessageText } from "@extraction/index";
import {
  newWizardSession, recordGrant, validateProvisioningOp, wizardSessionKey, type ProvisioningEnvironment,
  type ProvisioningOp, type ProvisioningResult, type WizardSessionState,
} from "@wizard/index";
import {
  activateGlobalLorebook, clearStoryExtensionPrompt, createCharacterCard, createGroup, createLorebook,
  getAllCharacterNames, listAllLorebooks, listGlobalLorebooks, listGroupNames, readWIEntry, setStoryExtensionPrompt,
  upsertWIEntry, type WIEntrySnapshot,
} from "@services/STAPI";
import { lorebookFileId } from "@utils/string";
import { COPILOT_NUDGE_KEY } from "@constants/defaults";
import { buildConvergenceReadout } from "../snapshot";
import type { CopilotRuntimeSettings } from "../types";
import { beginRun, type RunOwnership } from "../runToken";

export interface CopilotCoordinatorDeps {
  getStory: () => NormalizedStoryV2 | null;
  getState: () => EngineState | null;
  getSettings: () => CopilotRuntimeSettings;
  getProfileId: () => string | null;
  getCanon: () => string;
  notify: () => void;
  ownership?: RunOwnership;
  // v2.3 plan 02 (R8). Which lorebooks this story may write into, and the author's way to add one.
  wizardSession?: (key: string) => WizardSessionState | null;
  saveWizardSession?: (session: WizardSessionState) => void;
}

// Authoring stages, the driver read-model and the one-turn nudge. Stateless apart from the
// nudge currently injected — nothing here is persisted.
export class CopilotCoordinator {
  private activeNudge: string | null = null;

  constructor(private readonly deps: CopilotCoordinatorDeps) {}

  private client(debugResponse?: string): { profileId: string | null; debugResponse: string | null } {
    return { profileId: this.deps.getProfileId(), debugResponse: debugResponse ?? globalThis.storyOrchestratorDebugCopilotResponse ?? null };
  }

  async runStage(input: { draft: StoryV2; stage: CopilotStage; message: string; history: CopilotMessage[]; environment?: ProvisioningEnvironment }, debugResponse?: string): Promise<ProposalResult> {
    return runAuthoringStage({ ...input, environment: input.environment ?? (input.stage === "provisioning" ? this.getProvisioningEnvironment(input.draft) : undefined) }, this.client(debugResponse));
  }

  // What the install already has, plus which lorebooks this story owns — the only facts the
  // create-only rule needs. Read fresh every time: the wizard is creating assets as it goes.
  // `lorebookNames` is *every* book, not just the globally selected ones: an inactive book the user
  // wrote is still theirs, and creating over it would be exactly the thing create-only forbids.
  getProvisioningEnvironment(draft?: StoryV2): ProvisioningEnvironment {
    const safe = <T>(read: () => T[], fallback: T[]): T[] => { try { return read(); } catch { return fallback; } };
    const story = draft ?? this.deps.getStory();
    const lorebookNames = safe(listAllLorebooks, safe(listGlobalLorebooks, []));
    const granted = this.grantedLorebooks(lorebookNames, draft);
    return {
      characterNames: safe(getAllCharacterNames, []),
      lorebookNames,
      groupNames: safe(listGroupNames, []),
      storyLorebooks: story?.requirements?.lorebooks ?? [],
      // Owned = the books this wizard already created for this story (the session's ledger, read
      // against what the install lists) plus the ones the author granted. File ids, never the
      // requirement, never the display name.
      ownedLorebooks: [...new Set([...this.sessionOwnedLorebooks(lorebookNames, draft), ...granted])],
      grantedLorebooks: granted,
    };
  }

  private sessionFor(draft?: StoryV2): WizardSessionState | null {
    return this.deps.wizardSession?.(this.sessionKeyFor(draft)) ?? null;
  }

  // V18: ownership is the books this wizard recorded creating AS books. A name in `applied` alone
  // is only a claim that something by that name was made: a card named after one of the user's
  // listed books read as owning it. A session saved before the kind was recorded keeps the old read.
  private sessionOwnedLorebooks(lorebooks: string[], draft?: StoryV2): string[] {
    const listed = (name: string) => lorebooks.some((entry) => entry.trim().toLowerCase() === lorebookFileId(name).toLowerCase());
    const session = this.sessionFor(draft);
    return (session?.createdLorebooks ?? session?.applied ?? []).map(lorebookFileId).filter(listed);
  }

  private grantedLorebooks(lorebooks: string[], draft?: StoryV2): string[] {
    const listed = (fileId: string) => lorebooks.some((entry) => entry.trim().toLowerCase() === fileId.toLowerCase());
    return (this.sessionFor(draft)?.grants ?? []).map((grant) => grant.lorebookFileId).filter(listed);
  }

  // The session's created-asset ledger, written where the asset is made. The UI keeps its own copy
  // for display; this is the one ownership is read back from.
  private recordCreated(name: string, kind: "character" | "lorebook", draft?: StoryV2): void {
    const existing = this.sessionFor(draft);
    const session = existing ?? newWizardSession(this.sessionKeyFor(draft));
    const books = session.createdLorebooks;
    const applied = session.applied.includes(name) ? session.applied : [...session.applied, name];
    const createdLorebooks = kind === "lorebook" && !books?.includes(name) ? [...new Set([...(books ?? session.applied), name])] : books;
    if (applied === session.applied && createdLorebooks === books) return;
    this.deps.saveWizardSession?.({ ...session, applied, createdLorebooks });
  }

  private sessionKeyFor(draft?: StoryV2): string {
    const story = draft ?? this.deps.getStory();
    return wizardSessionKey({ id: (story as { id?: string } | null)?.id, title: story?.title });
  }

  private storyScopeId(draft?: StoryV2): string {
    const story = draft ?? this.deps.getStory();
    return (story as { id?: string } | null)?.id ?? story?.title ?? this.sessionFor(draft)?.key ?? "story";
  }

  // What a review card shows before the author confirms a write: the entry as it stands, so
  // replacing it is a visible decision rather than a promise (v2.3 plan 02 §R8).
  async readProvisioningEntry(lorebook: string, comment: string): Promise<WIEntrySnapshot | null> {
    return readWIEntry(lorebook, comment);
  }

  // The one write path to the user's install. Validation runs again here — the UI is a convenience,
  // never the guard (spec addendum §Story wizard: enforced in op validation, not prompt-trusted).
  async applyProvisioning(op: ProvisioningOp, draft?: StoryV2): Promise<ProvisioningResult> {
    const run = beginRun(this.deps.ownership);
    const lapsed = (): ProvisioningResult => ({ ok: false, message: "The story changed before this provisioning step could finish." });
    const validation = validateProvisioningOp(op, this.getProvisioningEnvironment(draft));
    if (!validation.ok) return { ok: false, message: validation.message };
    try {
      if (op.kind === "createCharacterCard") {
        if (!run.stillOwns()) return lapsed();
        const created = await createCharacterCard(op);
        this.recordCreated(created.name, "character", draft);
        return { ok: true, message: `Created the character card "${created.name}".`, created: created.name };
      }
      if (op.kind === "createStoryLorebook") {
        if (!run.stillOwns()) return lapsed();
        const result = await createLorebook(op.name);
        if (!result.ok) return { ok: false, message: `Could not create the lorebook "${op.name}": ${result.reason}.` };
        // Ownership is recorded HERE, at the write edge, not only by the review card's UI: a book
        // created through the runtime path (a scenario, a scripted provision) then has to be
        // writable, or the create-only rule would forbid the wizard its own book (found live, J8).
        this.recordCreated(op.name, "lorebook", draft);
        return { ok: true, message: `Created the lorebook "${op.name}" and switched it on.`, created: op.name };
      }
      if (op.kind === "grantLorebook") {
        // A grant is the author's own decision, taken from a card that exists the moment the wizard
        // opens — before any conversation has been persisted. Opening a session here is what makes
        // the permission durable rather than a card that cannot be confirmed.
        const existing = this.sessionFor(draft);
        const session = existing ?? newWizardSession(this.sessionKeyFor(draft));
        if (!existing) this.deps.saveWizardSession?.(session);
        this.deps.saveWizardSession?.(recordGrant(session, this.storyScopeId(draft), lorebookFileId(op.lorebook), !op.revoke));
        return { ok: true, message: op.revoke ? `This story may no longer write into "${op.lorebook}".` : `This story may now write into "${op.lorebook}".` };
      }
      if (op.kind === "upsertLorebookEntry") {
        if (!run.stillOwns()) return lapsed();
        // R8: the host is re-read at the write edge. The environment above was built when the card
        // was rendered; a book can be created, granted or deleted in between.
        const live = this.getProvisioningEnvironment(draft);
        const fileId = lorebookFileId(op.lorebook);
        if (!live.lorebookNames.some((name) => name.toLowerCase() === fileId.toLowerCase()) || !live.ownedLorebooks.some((name) => name.toLowerCase() === fileId.toLowerCase())) {
          return { ok: false, message: `"${op.lorebook}" is not this story's to write into any more.` };
        }
        await activateGlobalLorebook(op.lorebook);
        if (!run.stillOwns()) return lapsed();
        const result = await upsertWIEntry(op.lorebook, op.comment, op.content, op.keys, op.constant === undefined ? {} : { constant: op.constant });
        if (result === "failed") return { ok: false, message: `Could not write "${op.comment}" into "${op.lorebook}".` };
        return { ok: true, message: `${result === "created" ? "Added" : "Updated"} "${op.comment}" in "${op.lorebook}".`, created: `${op.lorebook}/${op.comment}` };
      }
      if (!run.stillOwns()) return lapsed();
      const group = await createGroup(op.name, op.members);
      return { ok: true, message: `Created the group "${group.name}" with ${group.members.length} member(s).`, created: group.name };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Provisioning failed" };
    }
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
      recentChat: getLastMessageText(),
    };
  }

  async runSuggest(debugResponse?: string): Promise<Suggestion[]> {
    const context = this.getDriverContext();
    if (!context) return [];
    return runDriverSuggest(context, this.client(debugResponse));
  }

  async runReport(debugResponse?: string): Promise<string> {
    const context = this.getDriverContext();
    if (!context) return "";
    return runDriverReport(context, this.client(debugResponse));
  }

  setNudge(text: string, depth = 1) {
    const trimmed = text.trim();
    if (!trimmed || !this.deps.getSettings().enabled) return;
    setStoryExtensionPrompt(COPILOT_NUDGE_KEY, trimmed, depth);
    this.activeNudge = trimmed;
    this.deps.notify();
  }

  clearNudge() {
    if (this.activeNudge === null) return;
    clearStoryExtensionPrompt(COPILOT_NUDGE_KEY);
    this.activeNudge = null;
    this.deps.notify();
  }

  getActiveNudge(): string | null {
    return this.activeNudge;
  }
}
