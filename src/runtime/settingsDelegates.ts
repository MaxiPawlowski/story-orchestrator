import { CoordinatorDelegates } from "./managerDelegates";
import type { SettingsControl, UiSettingsPatch } from "./settingsControl";
import type { StoryFeatureId, FeatureTuning } from "@engine/featurePolicy";
import type { TalkChainSettings } from "./settingsModel";
import type { CopilotRuntimeSettings, ExtractionRuntimeSettings, MemoryRuntimeSettings, PacingSettings } from "./types";

export abstract class SettingsDelegates extends CoordinatorDelegates {
  protected abstract readonly settingsControl: SettingsControl;
  getEffectiveSettings() { return this.settingsControl.effective(); }
  protected refreshFeatureSettings() { this.settingsControl.derive(); }
  setFeatureOverride(id: StoryFeatureId, policy: "off" | FeatureTuning | null) { return this.settingsControl.feature(id, policy); }
  setExtractionSettings(settings: Partial<ExtractionRuntimeSettings>) { this.settingsControl.extraction(settings); }
  setPacingSettings(settings: Partial<Omit<PacingSettings, "alpha">>) { this.settingsControl.pacing(settings); }
  setMemorySettings(settings: Partial<MemoryRuntimeSettings>) { this.settingsControl.memory(settings); }
  setCopilotSettings(settings: Partial<CopilotRuntimeSettings>) { this.settingsControl.copilot(settings); }
  setUiSettings(settings: UiSettingsPatch) { this.settingsControl.ui(settings); }
  setTalkDirectionEnabled(on: boolean, scope: "chat" | "global" = "chat") { this.settingsControl.talk(on, scope); }
  setTalkChainSettings(chain: Partial<TalkChainSettings>) { this.settingsControl.talkChain(chain); }
}
