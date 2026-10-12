import { applyGlobalSettings } from "./extras";
import { getGlobalSettings, setGlobalSettings } from "./settingsStore";
import type { BriefingDraft } from "./briefing";
import type { TalkChainSettings } from "./settingsModel";
import type { StoryV2 } from "@engine/schema";
import { readFeaturePolicies, type StoryFeatureId, type FeatureTuning } from "@engine/featurePolicy";
import { featureSettings, resolveFeatures } from "./featureResolve";
import { applyDeviceSettings } from "./deviceSettings";
import { devicePreferences } from "./featureSettingsHost";
import type { CopilotRuntimeSettings, ExtractionRuntimeSettings, MemoryRuntimeSettings, PacingSettings, RuntimeExtras, StagecraftSettings, UiRuntimeSettings } from "./types";

export type UiSettingsPatch = Partial<UiRuntimeSettings> & { briefingSeen?: true; briefingDrafted?: BriefingDraft };

export interface SettingsControlDeps {
  story?: () => StoryV2 | null;
  ownsChat?: () => boolean;
  extras: () => RuntimeExtras;
  updateSteering: () => void;
  updateInjection: () => void;
  clearNudge: () => void;
  persist: () => Promise<void>;
  notify: () => void;
}

/** The settings panel's writes: the install-wide half goes to the store, the per-chat overrides to this
 *  chat's extras, and the in-memory view every reader uses is re-derived from both. */
export class SettingsControl {
  constructor(private readonly deps: SettingsControlDeps) {}

  effective() {
    const global = getGlobalSettings();
    const features = resolveFeatures(global, this.deps.story?.() ?? null, this.deps.extras().overrides);
    return applyDeviceSettings(featureSettings(global, features), devicePreferences().read());
  }

  derive() {
    const extras = this.deps.extras();
    applyGlobalSettings(extras, this.effective(), {
      authorView: extras.ui.authorView, shapeOverride: extras.pacing.shapeOverride, talkEnabled: null,
    });
  }

  feature(id: StoryFeatureId, policy: "off" | FeatureTuning | null) {
    if (!this.deps.story?.() || !this.deps.ownsChat?.()) return false;
    const extras = this.deps.extras(), next = { ...extras.overrides };
    if (policy === null) delete next[id]; else next[id] = policy;
    extras.overrides = readFeaturePolicies(next);
    this.derive();
    this.deps.updateInjection();
    this.deps.updateSteering();
    void this.deps.persist();
    this.deps.notify();
    return true;
  }

  extraction(settings: Partial<ExtractionRuntimeSettings>) {
    setGlobalSettings({ extraction: settings });
    this.refresh();
  }

  pacing(settings: Partial<Omit<PacingSettings, "alpha">>) {
    const { shapeOverride, ...global } = settings;
    if (Object.keys(global).length) setGlobalSettings({ pacing: global });
    const extras = this.deps.extras();
    if ("shapeOverride" in settings) extras.pacing = { ...extras.pacing, shapeOverride: shapeOverride ?? null };
    this.refresh(this.deps.updateSteering);
  }

  memory(settings: Partial<MemoryRuntimeSettings>) {
    setGlobalSettings({ memory: settings });
    this.refresh(this.deps.updateInjection);
  }

  copilot(settings: Partial<CopilotRuntimeSettings>) {
    setGlobalSettings({ copilot: settings });
    this.refresh(() => { if (!getGlobalSettings().copilot.enabled) this.deps.clearNudge(); });
  }

  talk(enabled: boolean, scope: "chat" | "global") {
    if (scope === "global") setGlobalSettings({ talk: { enabled } });
    const extras = this.deps.extras();
    if (scope === "chat") extras.overrides = { ...extras.overrides, speakers: { enabled } };
    extras.talk = { ...extras.talk, enabled };
    void this.deps.persist();
    this.deps.notify();
  }

  talkChain(chain: Partial<TalkChainSettings>) {
    setGlobalSettings({ talk: { chain: { ...getGlobalSettings().talk.chain, ...chain } } });
    this.deps.notify();
  }

  ui(settings: UiSettingsPatch) {
    const { authorView, briefingSeen, briefingDrafted, ...display } = settings;
    if (Object.keys(display).length) setGlobalSettings({ display });
    const extras = this.deps.extras();
    if (authorView !== undefined) extras.ui = { ...extras.ui, authorView };
    if (briefingSeen && extras.briefing?.seen === false) extras.briefing = { ...extras.briefing, seen: true };
    if (briefingDrafted && extras.briefing) extras.briefing = { ...extras.briefing, draft: briefingDrafted };
    this.refresh();
  }

  scanMemory(on: boolean) {
    setGlobalSettings({ worldInfo: { scanMemory: on } });
    this.refresh(() => {
      this.deps.updateInjection();
      this.deps.updateSteering();
    });
  }

  stagecraft(settings: Partial<StagecraftSettings>) {
    setGlobalSettings({ stagecraft: settings });
    this.refresh();
  }

  private refresh(after?: () => void) {
    this.derive();
    after?.();
    void this.deps.persist();
    this.deps.notify();
  }
}
