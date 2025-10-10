import {
  event_types,
  setGenerationParamsFromPreset,
  saveSettingsDebounced,
  eventSource,
  setSettingByName,
  tgSettings,
  tgPresetObjs,
  tgPresetNames,
  TG_SETTING_NAMES,
  BIAS_CACHE,
  displayLogitBias,
} from './SillyTavernAPI';
import type { PresetOverrides } from "@utils/story-schema";

export type Role = 'dm' | 'companion' | 'chat';
export type PresetPartial = PresetOverrides;

export type BaseSource =
  | { source: 'current' }                   // snapshot from current sliders
  | { source: 'named'; name: string };     // copy from an existing named preset

type ConstructorOpts = {
  storyId: string;
  storyTitle?: string;
  base: BaseSource;
  roleDefaults?: Partial<Record<Role, PresetPartial>>;
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
  private roleDefaults: Partial<Record<Role, PresetPartial>>;

  constructor(opts: ConstructorOpts) {
    this.storyId = opts.storyId;
    this.storyTitle = opts.storyTitle;
    this.base = opts.base;
    this.roleDefaults = opts.roleDefaults ?? {};
    this.presetName = `Story:${this.storyId}`;
  }

  async initForStory() {
    console.log('[PresetService] initForStory → ensure preset, select, apply DM defaults');
    this.ensureDedicatedPresetExists();
    tgSettings.preset = this.presetName;

    const merged = this.buildMergedPresetObject('dm');
    this.applyPresetObject(merged);
  }

  applyForRole(role: Role, checkpointOverrides?: PresetPartial, checkpointName?: string): Record<string, any> {
    const overrideKeys = checkpointOverrides ? Object.keys(checkpointOverrides) : [];
    console.log('[PresetService] applyForRole', { role, checkpointName, overrideKeys });

    this.ensureDedicatedPresetExists();
    const merged = this.buildMergedPresetObject(role, checkpointOverrides);

    this.writeIntoRegistry(this.presetName, merged);

    tgSettings.preset = this.presetName;
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
    const roleDef = this.roleDefaults[role] ?? {};
    const cp = checkpointOverride ?? {};

    const merged = { ...base, ...roleDef, ...cp };

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
    return this.clonePresetFields(tgSettings, true);
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
      console.log('[PresetService] creating dedicated preset in registry:', name);
      tgPresetNames.push(name);
      tgPresetObjs.push(this.clone(obj));
      this.ensurePresetOptionExists(name);
    } else {
      console.log('[PresetService] updating dedicated preset in registry:', name);
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

  private makeLabel({ role, checkpointName }: ApplyLabelOpts): string {
    const parts = [`${this.presetName}`, `[${role}]`];
    if (this.storyTitle) parts.push(this.storyTitle);
    if (checkpointName) parts.push(`• ${checkpointName}`);
    return parts.join(' ');
  }

  private applyPresetValuesToSettings(presetObj: any) {
    for (const key of TG_SETTING_NAMES) {
      if (Object.prototype.hasOwnProperty.call(presetObj, key)) {
        (tgSettings as any)[key] = this.clone(presetObj[key]);
      }
    }
  }

  private applyPresetObject(presetObj: any, displayLabel?: string) {
    console.log('[PresetService] applyPresetObject -> setGenerationParamsFromPreset, bias, emit PRESET_CHANGED', { preset: this.presetName, displayLabel, presetObj });

    this.applyPresetValuesToSettings(presetObj);

    tgSettings.preset = this.presetName;

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
      eventSource.emit(event_types.PRESET_CHANGED, {
        apiId: 'textgenerationwebui',
        name: this.presetName,
      });
    } catch (e) {
      console.error('[PresetService] error emitting PRESET_CHANGED', e);
    }

    const uiBridge = (globalThis as any).ST_applyTextgenPresetToUI;
    if (typeof uiBridge === 'function' && typeof setSettingByName === 'function') {
      uiBridge(this.presetName, presetObj);
    } else {
      console.log('[PresetService] UI bridge not found; runtime settings are active but UI will not move.');
    }
  }

}
