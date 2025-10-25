import {
  setGenerationParamsFromPreset,
  setSettingByName,
  tgPresetObjs,
  tgPresetNames,
  TG_SETTING_NAMES,
  BIAS_CACHE,
  displayLogitBias,
  getContext,
} from './STAPI';
import type { PresetOverrides, Role } from "@utils/story-schema";
import { ARBITER_ROLE_KEY, ARBITER_ROLE_LABEL } from "@utils/story-schema";
export type PresetPartial = PresetOverrides;

export type BaseSource =
  | { source: 'current' }                   // snapshot from current sliders
  | { source: 'named'; name: string };     // copy from an existing named preset

type ConstructorOpts = {
  storyId: string;
  storyTitle?: string;
  base: BaseSource;
};

type ApplyLabelOpts = {
  role: Role;
  checkpointName?: string;
};
const BIAS_KEY = '#textgenerationwebui_api-settings';

export class PresetService {
  readonly presetName: string;
  private storyId: string;
  private storyTitle?: string;
  private base: BaseSource;

  constructor(opts: ConstructorOpts) {
    this.storyId = opts.storyId;
    this.storyTitle = opts.storyTitle;
    this.base = opts.base;
    this.presetName = `Story:${this.storyId}`;
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

  applyForRole(role: Role, checkpointOverrides?: PresetPartial, checkpointName?: string): Record<string, any> {
    const overrideKeys = checkpointOverrides ? Object.keys(checkpointOverrides) : [];
    const roleLabel = this.describeRole(role);
    const { textCompletionSettings } = getContext();
    console.log('[Story - PresetService] applyForRole', { role, roleLabel, checkpointName, overrideKeys });

    this.ensureDedicatedPresetExists();
    const merged = this.buildMergedPresetObject(role, checkpointOverrides);

    this.writeIntoRegistry(this.presetName, merged);

    textCompletionSettings.preset = this.presetName;
    const label = this.makeLabel({ role, checkpointName });
    this.applyPresetObject(merged, label);

    return merged;
  }

  private ensureDedicatedPresetExists() {
    if (this.findPresetIndex(this.presetName) !== -1) return;

    const baseObj = this.getBasePresetObject();
    this.writeIntoRegistry(this.presetName, baseObj);
  }

  private buildMergedPresetObject(role: Role, checkpointOverride?: PresetPartial): any {
    const base = this.getBasePresetObject();
    const cp = checkpointOverride ?? {};

    const merged = { ...base, ...cp };

    if (!Array.isArray(merged.logit_bias)) {
      merged.logit_bias = Array.isArray(base.logit_bias) ? base.logit_bias : [];
    }

    return this.clonePresetFields(merged);
  }

  private getBasePresetObject(): any {
    if (this.base.source === 'named') {
      const p = this.resolveExistingNamed(this.base.name);
      if (p) return this.clonePresetFields(p);
    }
    const { textCompletionSettings } = getContext();
    return this.clonePresetFields(textCompletionSettings, true);
  }
  private ensurePresetOptionExists(name: string) {
    const sel = document.getElementById('settings_preset_textgenerationwebui') as HTMLSelectElement | null;
    if (!sel) return;

    for (let i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === name) return;
    }

    const opt = document.createElement('option');
    opt.value = name;
    opt.innerText = name;
    sel.appendChild(opt);
  }

  private resolveExistingNamed(name: string): any | null {
    const idx = this.findPresetIndex(name);
    if (idx !== -1) return tgPresetObjs[idx];

    return null;
  }
  private writeIntoRegistry(name: string, obj: any) {
    const idx = this.findPresetIndex(name);
    if (idx === -1) {
      console.log('[Story - PresetService] creating dedicated preset in registry:', name);
      tgPresetNames.push(name);
      tgPresetObjs.push(this.clone(obj));
      this.ensurePresetOptionExists(name);
    } else {
      console.log('[Story - PresetService] updating dedicated preset in registry:', name);
      tgPresetObjs[idx] = this.clone(obj);
    }
  }

  private findPresetIndex(name: string): number {
    return tgPresetNames.indexOf(name);
  }

  private clonePresetFields(source: any, includeAllKnownKeys = false): any {
    const out: any = {};
    const target = source ?? {};
    for (const key of TG_SETTING_NAMES) {
      if (includeAllKnownKeys || Object.prototype.hasOwnProperty.call(target, key)) {
        const value = (target as any)[key];
        out[key] = this.clone(value);
      }
    }
    const maybeBias = (target as any).logit_bias;
    if (Array.isArray(maybeBias)) {
      out.logit_bias = this.clone(maybeBias);
    }
    return out;
  }

  private clone<T>(v: T): T {
    if (Array.isArray(v)) return v.map((x) => this.clone(x)) as any;
    if (v && typeof v === 'object') return JSON.parse(JSON.stringify(v));
    return v;
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

  private applyPresetValuesToSettings(presetObj: any) {
    const { textCompletionSettings } = getContext();
    for (const key of TG_SETTING_NAMES) {
      if (Object.prototype.hasOwnProperty.call(presetObj, key)) {
        (textCompletionSettings as any)[key] = this.clone(presetObj[key]);
      }
    }
  }

  private applyPresetObject(presetObj: any, displayLabel?: string) {
    const { saveSettingsDebounced, textCompletionSettings, eventTypes, eventSource } = getContext();
    this.applyPresetValuesToSettings(presetObj);

    textCompletionSettings.preset = this.presetName;

    setGenerationParamsFromPreset(presetObj);

    BIAS_CACHE.delete(BIAS_KEY);
    displayLogitBias(presetObj.logit_bias, BIAS_KEY);
    saveSettingsDebounced();

    this.ensurePresetOptionExists(this.presetName);
    const sel = document.getElementById('settings_preset_textgenerationwebui') as HTMLSelectElement | null;
    if (sel) {
      const option = Array.from(sel.options).find((opt) => opt.value === this.presetName);
      if (option) {
        option.textContent = displayLabel ?? this.presetName;
      }
      sel.value = this.presetName;
    }

    try {
      eventSource.emit(eventTypes.PRESET_CHANGED, {
        apiId: 'textgenerationwebui',
        name: this.presetName,
      });
    } catch (e) {
      console.error('[Story - PresetService] error emitting PRESET_CHANGED', e);
    }

    const uiBridge = (globalThis as any).ST_applyTextgenPresetToUI;
    if (typeof uiBridge === 'function' && typeof setSettingByName === 'function') {
      uiBridge(this.presetName, presetObj);
    } else {
      console.log('[Story - PresetService] UI bridge not found; runtime settings are active but UI will not move.');
    }
  }

}
