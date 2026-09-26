export { };

export type StoryOrchestratorExtensionSettingsRoot = globalThis.StoryOrchestratorExtensionSettingsRoot;

declare global {
  type TalkControlInterceptor = (
    chat: unknown,
    contextSize: number,
    abort: (immediate: boolean) => void,
    type: string,
  ) => unknown;

  interface StoryOrchestratorExtensionSettingsRoot {
    studio?: unknown;
    storyState?: unknown;
    [key: string]: unknown;
  }

  interface ExtensionSettingsMap {
    "story-orchestrator"?: StoryOrchestratorExtensionSettingsRoot;
    [key: string]: unknown;
  }

  interface SillyTavernEventSource {
    on: (event: string, handler: (...args: unknown[]) => void) => void | (() => void);
    off?: (event: string, handler: (...args: unknown[]) => void) => void;
    once?: (event: string, handler: (...args: unknown[]) => void) => void;
    removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
    emit: (event: string, ...args: unknown[]) => void | Promise<void>;
  }

  interface CustomToastr {
    success?: (...args: unknown[]) => unknown;
    info?: (...args: unknown[]) => unknown;
  }
  interface Window {
    toastr?: CustomToastr;
  }

  var __SO_DEV__: boolean;
  var talkControlInterceptor: TalkControlInterceptor | undefined;
  var storyOrchestratorRuntime: import("@runtime/index").RuntimeManager | undefined;
  var storyOrchestratorStudioDraft: typeof import("./src/studio/draft").useDraftStore | undefined;
  var storyOrchestratorStudioTabs: import("./src/studio/StudioModal").StudioTab[] | undefined;
  var storyOrchestratorStop: (() => void) | undefined;
  var storyOrchestratorLiveSuite: import("./src/runtime/liveSuite").LiveSuiteHandle | undefined;
  var storyOrchestratorDebugExtractionResponse: string | null | undefined;
  var storyOrchestratorDebugGenerationResponse: string | null | undefined;
  var storyOrchestratorDebugSceneSummaryResponse: string | null | undefined;
  var storyOrchestratorDebugShortTermResponse: string | null | undefined;
  var storyOrchestratorDebugSupersessionResponse: string | null | undefined;
  var storyOrchestratorDebugArcSummaryResponse: string | null | undefined;
  var storyOrchestratorDebugCanonResponse: string | null | undefined;
  var storyOrchestratorDebugEpistemicResponse: string | null | undefined;
  var storyOrchestratorDebugLedgerResponse: string | null | undefined;
  var storyOrchestratorDebugCopilotResponse: string | null | undefined;
  var storyOrchestratorDebugSelfTestResponses: string[] | null | undefined;
  var storyOrchestratorDebugDirectorResponse: string | null | undefined;
  var storyOrchestratorJudge: import("./src/runtime/judgeHarness").JudgeHarness | undefined;
  var storyOrchestratorScheduler: { nextReadWindow: () => import("./src/extraction/scheduler").NextReadWindow | null } | undefined;
  var storyOrchestratorLoreEvidence: import("./src/runtime/worldInfoEvidence").LoreEvidence | undefined;
  var storyOrchestratorScanGating: import("./src/runtime/worldInfoScanHost").ScanGatingDebug | undefined;
  var storyOrchestratorToolTurnProbe: import("./src/runtime/spikes/toolTurnProbe").ToolTurnProbe | undefined;
  var storyOrchestratorLore: { selector: import("./src/runtime/loreSelect").LoreSelector; willAddUserMessage: (type: string | undefined, params: Record<string, unknown> | undefined, dryRun: boolean | undefined) => boolean } | undefined;
  var storyOrchestratorDebugCuratorResponse: string | null | undefined;
  var storyOrchestratorDebugCallBudgetScale: number | null | undefined;
  var storyOrchestratorDebugCallBudgetTarget: string | null | undefined;
}
