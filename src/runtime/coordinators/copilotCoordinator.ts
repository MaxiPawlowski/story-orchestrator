import { Blackboard, evaluateGate, renderGateText, type EngineState, type NormalizedStoryV2, type StoryV2 } from "@engine/index";
import { runAuthoringStage, runDriverReport, runDriverSuggest, type CopilotMessage, type CopilotStage, type DriverContext, type ProposalResult, type Suggestion } from "@copilot/index";
import { getLastMessageText } from "@extraction/index";
import { clearStoryExtensionPrompt, setStoryExtensionPrompt } from "@services/STAPI";
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

  async runStage(input: { draft: StoryV2; stage: CopilotStage; message: string; history: CopilotMessage[] }, debugResponse?: string): Promise<ProposalResult> {
    return runAuthoringStage(input, this.client(debugResponse));
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
