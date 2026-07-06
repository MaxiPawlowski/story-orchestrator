export { };
import "../../../../public/global";
import "../../../../global";

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
  }

  interface CustomToastr {
    success?: (...args: any[]) => any;
    info?: (...args: any[]) => any;
  }
  interface Window {
    toastr?: typeof window.toastr & CustomToastr;
  }

  var talkControlInterceptor: TalkControlInterceptor | undefined;
  var ST_applyTextgenPresetToUI: import("@services/stHost/presets").TextGenPresetUiBridge | undefined;
  var storyOrchestratorRuntime: import("@runtime/index").RuntimeManager | undefined;
  var storyOrchestratorStudioDraft: typeof import("./src/studio/draft").useDraftStore | undefined;
  var storyOrchestratorDebugExtractionResponse: string | null | undefined;
  var storyOrchestratorDebugGenerationResponse: string | null | undefined;
  var storyOrchestratorDebugSceneSummaryResponse: string | null | undefined;
  var storyOrchestratorDebugSupersessionResponse: string | null | undefined;
  var storyOrchestratorDebugArcSummaryResponse: string | null | undefined;
  var storyOrchestratorDebugCanonResponse: string | null | undefined;
  var storyOrchestratorDebugEpistemicResponse: string | null | undefined;
  var storyOrchestratorDebugLedgerResponse: string | null | undefined;
  var storyOrchestratorDebugCopilotResponse: string | null | undefined;
}
