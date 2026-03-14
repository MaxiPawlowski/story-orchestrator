import {
  applyTextGenPresetRuntime,
  findTextGenPreset,
  getTextGenSettingNames,
  type TextGenPreset,
  upsertTextGenPreset,
} from '@services/stHost/presets';
import { getContext } from '@services/stHost/context';
import { clonePresetFields, composePresetObject } from '@services/presets/presetComposition';
import type { PresetOverrides, Role } from "@utils/story-schema";
import { ARBITER_ROLE_KEY, ARBITER_ROLE_LABEL } from "@utils/story-schema";
export type PresetPartial = PresetOverrides;

export type BaseSource =
  | { source: 'current' }
  | { source: 'named'; name: string };

type ConstructorOpts = {
  storyId: string;
  storyTitle?: string;
  base: BaseSource;
  fallbackPreset?: string | null;
};

type ApplyLabelOpts = {
  role: Role;
  checkpointName?: string;
};

export class PresetService {
  readonly presetName: string;
  private storyId: string;
  private storyTitle?: string;
  private base: BaseSource;
  private fallbackPreset: string | null;
  private readonly settingNames: string[];

  constructor(opts: ConstructorOpts) {
    this.storyId = opts.storyId;
    this.storyTitle = opts.storyTitle;
    this.base = opts.base;
    this.fallbackPreset = opts.fallbackPreset ?? null;
    this.presetName = `Story:${this.storyId}`;
    this.settingNames = getTextGenSettingNames();
  }

  async initForStory() {
    this.ensureDedicatedPresetExists();
  }

  applyBasePreset() {
    const { textCompletionSettings } = getContext();
    console.log('[Story - PresetService] applyBasePreset → apply base to UI');
    this.ensureDedicatedPresetExists();
    textCompletionSettings.preset = this.presetName;

    const baseObj = this.getBasePresetObject();
    this.applyPresetObject(baseObj);
  }

  applyForRole(role: Role, checkpointOverrides?: PresetPartial, checkpointName?: string): TextGenPreset {
    const overrideKeys = checkpointOverrides ? Object.keys(checkpointOverrides) : [];
    const roleLabel = this.describeRole(role);
    const { textCompletionSettings } = getContext();
    console.log('[Story - PresetService] applyForRole', { role, roleLabel, checkpointName, overrideKeys });

    this.ensureDedicatedPresetExists();
    const merged = this.buildMergedPresetObject(checkpointOverrides);

    this.writeIntoRegistry(this.presetName, merged);

    textCompletionSettings.preset = this.presetName;
    const label = this.makeLabel({ role, checkpointName });
    this.applyPresetObject(merged, label);

    return merged;
  }

  private ensureDedicatedPresetExists() {
    if (this.hasPreset(this.presetName)) return;

    const baseObj = this.getBasePresetObject();
    this.writeIntoRegistry(this.presetName, baseObj);
  }

  private buildMergedPresetObject(checkpointOverride?: PresetPartial): TextGenPreset {
    const base = this.getBasePresetObject();
    const fallback = this.fallbackPreset ? this.resolveExistingNamed(this.fallbackPreset) : null;
    return composePresetObject({
      base,
      fallback,
      checkpointOverride,
      settingNames: this.settingNames,
    });
  }

  private getBasePresetObject(): TextGenPreset {
    if (this.base.source === 'named') {
      const p = this.resolveExistingNamed(this.base.name);
      if (p) return clonePresetFields(p, this.settingNames);
    }
    const { textCompletionSettings } = getContext();
    return clonePresetFields(textCompletionSettings, this.settingNames, true);
  }

  private resolveExistingNamed(name: string): TextGenPreset | null {
    return findTextGenPreset(name);
  }

  private writeIntoRegistry(name: string, obj: TextGenPreset) {
    console.log(`[Story - PresetService] ${this.hasPreset(name) ? 'updating' : 'creating'} dedicated preset in registry:`, name);
    upsertTextGenPreset(name, obj);
  }

  private hasPreset(name: string): boolean {
    return findTextGenPreset(name) !== null;
  }

  private describeRole(role: Role): string {
    if (role === ARBITER_ROLE_KEY) return ARBITER_ROLE_LABEL;
    return role;
  }

  private makeLabel({ role, checkpointName }: ApplyLabelOpts): string {
    const parts = [`${this.presetName}`, `[${this.describeRole(role)}]`];
    if (this.storyTitle) parts.push(this.storyTitle);
    if (checkpointName) parts.push(`• ${checkpointName}`);
    return parts.join(' ');
  }

  private applyPresetObject(presetObj: TextGenPreset, displayLabel?: string) {
    const synced = applyTextGenPresetRuntime(this.presetName, presetObj, displayLabel);
    if (!synced) {
      console.log('[Story - PresetService] UI bridge not found; runtime settings are active but UI will not move.');
    }
  }

}
