import { applyGlobalSettings } from "./extras";
import { getGlobalSettings, setGlobalSettings } from "./settingsStore";
import type { TalkChainSettings } from "./settingsModel";
import type { CopilotRuntimeSettings, ExtractionRuntimeSettings, MemoryRuntimeSettings, PacingSettings, RuntimeExtras, StagecraftSettings, UiRuntimeSettings } from "./types";

export type UiSettingsPatch = Partial<UiRuntimeSettings> & { briefingSeen?: true };

export interface SettingsControlDeps {
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
    extras.talk = { ...extras.talk, enabled };
    void this.deps.persist();
    this.deps.notify();
  }

  talkChain(chain: Partial<TalkChainSettings>) {
    setGlobalSettings({ talk: { chain: { ...getGlobalSettings().talk.chain, ...chain } } });
    this.deps.notify();
  }

  ui(settings: UiSettingsPatch) {
    const { authorView, briefingSeen, ...display } = settings;
    if (Object.keys(display).length) setGlobalSettings({ display });
    const extras = this.deps.extras();
    if (authorView !== undefined) extras.ui = { ...extras.ui, authorView };
    if (briefingSeen && extras.briefing?.seen === false) extras.briefing = { seen: true };
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
    applyGlobalSettings(this.deps.extras(), getGlobalSettings());
    after?.();
    void this.deps.persist();
    this.deps.notify();
  }
}
