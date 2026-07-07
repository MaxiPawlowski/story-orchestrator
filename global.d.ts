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

  var talkControlInterceptor: TalkControlInterceptor | undefined;
  var storyOrchestratorRuntime: import("@runtime/index").RuntimeManager | undefined;
  var storyOrchestratorStudioDraft: typeof import("./src/studio/draft").useDraftStore | undefined;
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
}
