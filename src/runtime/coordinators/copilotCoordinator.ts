import { Blackboard, evaluateGate, renderGateText, type EngineState, type NormalizedStoryV2, type StoryV2 } from "@engine/index";
import { runAuthoringStage, runDriverReport, runDriverSuggest, type CopilotMessage, type CopilotStage, type DriverContext, type ProposalResult, type Suggestion } from "@copilot/index";
import { getLastMessageText } from "@extraction/index";
import { validateProvisioningOp, type ProvisioningEnvironment, type ProvisioningOp, type ProvisioningResult } from "@wizard/index";
import { activateGlobalLorebook, clearStoryExtensionPrompt, createCharacterCard, createGroup, createLorebook, getAllCharacterNames, listAllLorebooks, listGlobalLorebooks, listGroupNames, setStoryExtensionPrompt, upsertWIEntry } from "@services/STAPI";
import { COPILOT_NUDGE_KEY } from "@constants/defaults";
import { buildConvergenceReadout } from "../snapshot";
import type { CopilotRuntimeSettings } from "../types";

export interface CopilotCoordinatorDeps {
  getStory: () => NormalizedStoryV2 | null;
  getState: () => EngineState | null;
  getSettings: () => CopilotRuntimeSettings;
  getProfileId: () => string | null;
  getCanon: () => string;
  notify: () => void;
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
    return {
      characterNames: safe(getAllCharacterNames, []),
      lorebookNames: safe(listAllLorebooks, safe(listGlobalLorebooks, [])),
      groupNames: safe(listGroupNames, []),
      storyLorebooks: story?.requirements?.lorebooks ?? [],
    };
  }

  // The one write path to the user's install. Validation runs again here — the UI is a convenience,
  // never the guard (spec addendum §Story wizard: enforced in op validation, not prompt-trusted).
  async applyProvisioning(op: ProvisioningOp, draft?: StoryV2): Promise<ProvisioningResult> {
    const validation = validateProvisioningOp(op, this.getProvisioningEnvironment(draft));
    if (!validation.ok) return { ok: false, message: validation.message };
    try {
      if (op.kind === "createCharacterCard") {
        const created = await createCharacterCard(op);
        return { ok: true, message: `Created the character card "${created.name}".`, created: created.name };
      }
      if (op.kind === "createStoryLorebook") {
        const result = await createLorebook(op.name);
        if (!result.created) return { ok: false, message: `Could not create the lorebook "${op.name}".` };
        return { ok: true, message: `Created the lorebook "${op.name}"${result.activated ? " and switched it on" : " — switch it on in World Info to use it"}.`, created: op.name };
      }
      if (op.kind === "upsertLorebookEntry") {
        await activateGlobalLorebook(op.lorebook);
        const result = await upsertWIEntry(op.lorebook, op.comment, op.content, op.keys, op.constant === undefined ? {} : { constant: op.constant });
        if (result === "failed") return { ok: false, message: `Could not write "${op.comment}" into "${op.lorebook}".` };
        return { ok: true, message: `${result === "created" ? "Added" : "Updated"} "${op.comment}" in "${op.lorebook}".`, created: `${op.lorebook}/${op.comment}` };
      }
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
