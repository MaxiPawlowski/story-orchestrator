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
}
