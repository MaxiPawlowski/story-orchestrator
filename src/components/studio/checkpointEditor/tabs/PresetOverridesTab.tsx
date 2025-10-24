import React, { useCallback, useMemo } from "react";
import {
  ensureOnActivate,
  cleanupOnActivate,
  type StoryDraft,
  type CheckpointDraft,
} from "@utils/checkpoint-studio";
import {
  ARBITER_ROLE_KEY,
  ARBITER_ROLE_LABEL,
  type RolePresetOverrides,
} from "@utils/story-schema";
import { PRESET_SETTING_KEYS, type PresetSettingKey } from "@constants/presetSettingKeys";
import type { PresetDraftState } from "../types";
import { parsePresetValue, stringifyPresetValue, readCurrentPresetValue } from "../presetUtils";
import HelpTooltip from "../../HelpTooltip";

type Props = {
  draft: StoryDraft;
  checkpoint: CheckpointDraft;
  presetDrafts: PresetDraftState;
  setPresetDrafts: React.Dispatch<React.SetStateAction<PresetDraftState>>;
  updateCheckpoint: (id: string, updater: (cp: CheckpointDraft) => CheckpointDraft) => void;
};

const PresetOverridesTab: React.FC<Props> = ({
  draft,
  checkpoint,
  presetDrafts,
  setPresetDrafts,
  updateCheckpoint,
}) => {
  const overridesSignature = useMemo(() => {
    try {
      return JSON.stringify({
        preset_overrides: checkpoint.on_activate?.preset_overrides ?? {},
        arbiter_preset: checkpoint.on_activate?.arbiter_preset ?? null,
      });
    } catch {
      return `${checkpoint.id ?? ""}-preset-overrides`;
    }
  }, [checkpoint.id, checkpoint.on_activate?.preset_overrides, checkpoint.on_activate?.arbiter_preset]);

  const presetRoleKeys = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    const push = (roleKey?: string | null) => {
      if (!roleKey) return;
      if (seen.has(roleKey)) return;
      seen.add(roleKey);
      ordered.push(roleKey);
    };
    Object.keys(draft.roles ?? {}).forEach(push);
    Object.keys(checkpoint.on_activate?.preset_overrides ?? {}).forEach(push);
    Object.keys(presetDrafts).forEach(push);
    push(ARBITER_ROLE_KEY);
    return ordered;
  }, [draft.roles, presetDrafts, checkpoint.id, overridesSignature]);

  const resolveCurrentOverrides = useCallback((roleKey: string): Partial<Record<PresetSettingKey, unknown>> => {
    if (roleKey === ARBITER_ROLE_KEY) {
      return { ...(checkpoint.on_activate?.arbiter_preset ?? {}) } as Partial<Record<PresetSettingKey, unknown>>;
    }
    return { ...(checkpoint.on_activate?.preset_overrides?.[roleKey] ?? {}) } as Partial<Record<PresetSettingKey, unknown>>;
  }, [checkpoint.on_activate?.arbiter_preset, checkpoint.on_activate?.preset_overrides]);

  const updateRoleOverrides = useCallback((
    roleKey: string,
    mutate: (current: Partial<Record<PresetSettingKey, unknown>>) => Partial<Record<PresetSettingKey, unknown>> | undefined,
  ) => {
    updateCheckpoint(checkpoint.id, (cp) => {
      const next = ensureOnActivate(cp.on_activate);
      if (roleKey === ARBITER_ROLE_KEY) {
        const current = { ...(next.arbiter_preset ?? {}) } as Partial<Record<PresetSettingKey, unknown>>;
        const updated = mutate(current);
        next.arbiter_preset = updated && Object.keys(updated).length ? updated : undefined;
      } else {
        const overrides = { ...(next.preset_overrides ?? {}) } as RolePresetOverrides;
        const current = { ...(overrides[roleKey] ?? {}) } as Partial<Record<PresetSettingKey, unknown>>;
        const updated = mutate(current);
        if (updated && Object.keys(updated).length) overrides[roleKey] = updated;
        else delete overrides[roleKey];
        next.preset_overrides = Object.keys(overrides).length ? overrides : undefined;
      }
      return { ...cp, on_activate: cleanupOnActivate(next) };
    });
  }, [checkpoint.id, updateCheckpoint]);

  const addPresetOverride = useCallback((roleKey: string) => {
    const existing = resolveCurrentOverrides(roleKey);
    const usedKeys = new Set(Object.keys(existing));
    const candidate = PRESET_SETTING_KEYS.find((key) => !usedKeys.has(key));
    if (!candidate) return;
    const baseValue = readCurrentPresetValue(candidate);
    const storedValue = baseValue === undefined ? "" : baseValue;

    updateRoleOverrides(roleKey, (current) => {
      const next = { ...current };
      next[candidate] = storedValue;
      return next;
    });

    setPresetDrafts((prev) => {
      const next = { ...prev };
      const roleDraft = { ...(next[roleKey] ?? {}) };
      roleDraft[candidate] = stringifyPresetValue(storedValue);
      next[roleKey] = roleDraft;
      return next;
    });
  }, [resolveCurrentOverrides, updateRoleOverrides, setPresetDrafts]);

  const removePresetOverride = useCallback((roleKey: string, settingKey: string) => {
    const key = settingKey as PresetSettingKey;
    updateRoleOverrides(roleKey, (current) => {
      const next = { ...current };
      delete next[key];
      return Object.keys(next).length ? next : undefined;
    });

    setPresetDrafts((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, roleKey)) return prev;
      const next = { ...prev };
      const roleDraft = { ...next[roleKey] };
      delete roleDraft[settingKey];
      if (Object.keys(roleDraft).length) next[roleKey] = roleDraft;
      else delete next[roleKey];
      return next;
    });
  }, [updateRoleOverrides, setPresetDrafts]);

  const changePresetKey = useCallback((roleKey: string, prevKey: string, nextKey: PresetSettingKey) => {
    if (prevKey === nextKey) return;
    const existing = resolveCurrentOverrides(roleKey);
    if (Object.prototype.hasOwnProperty.call(existing, nextKey) && nextKey !== prevKey) return;

    const baseValue = readCurrentPresetValue(nextKey);
    const storedValue = baseValue === undefined ? "" : baseValue;
    const previousKey = prevKey as PresetSettingKey;

    updateRoleOverrides(roleKey, (current) => {
      const next = { ...current };
      delete next[previousKey];
      next[nextKey] = storedValue;
      return next;
    });

    setPresetDrafts((prev) => {
      const next = { ...prev };
      const roleDraft = { ...(next[roleKey] ?? {}) };
      delete roleDraft[prevKey];
      roleDraft[nextKey] = stringifyPresetValue(storedValue);
      next[roleKey] = roleDraft;
      return next;
    });
  }, [resolveCurrentOverrides, updateRoleOverrides, setPresetDrafts]);

  const changePresetValue = useCallback((roleKey: string, settingKey: string, rawValue: string) => {
    setPresetDrafts((prev) => {
      const next = { ...prev };
      const roleDraft = { ...(next[roleKey] ?? {}) };
      roleDraft[settingKey] = rawValue;
      next[roleKey] = roleDraft;
      return next;
    });

    const key = settingKey as PresetSettingKey;
    const parsed = parsePresetValue(rawValue);
    updateRoleOverrides(roleKey, (current) => {
      const next = { ...current };
      next[key] = parsed;
      return next;
    });
  }, [updateRoleOverrides, setPresetDrafts]);

  if (!presetRoleKeys.length) {
    return <div className="text-xs text-slate-400">Define story roles to configure preset overrides.</div>;
  }

  return (
    <div className="space-y-3">
      {presetRoleKeys.map((roleKey, roleIndex) => {
        const overridesForRole = roleKey === ARBITER_ROLE_KEY
          ? checkpoint.on_activate?.arbiter_preset ?? {}
          : checkpoint.on_activate?.preset_overrides?.[roleKey] ?? {};
        const draftValues = presetDrafts[roleKey] ?? {};
        const roleDisplayName = roleKey === ARBITER_ROLE_KEY
          ? ARBITER_ROLE_LABEL
          : (draft.roles?.[roleKey] ? `${draft.roles?.[roleKey]} (${roleKey})` : roleKey);
        const usedKeys = new Set(Object.keys(overridesForRole));
        const canAddMore = usedKeys.size < PRESET_SETTING_KEYS.length;
        const missingInStory = roleKey !== ARBITER_ROLE_KEY && !(draft.roles && Object.prototype.hasOwnProperty.call(draft.roles, roleKey));

        return (
          <div key={roleKey} className="space-y-2 rounded border border-slate-700 bg-slate-900/40 p-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-slate-200">
                {roleDisplayName}
                {missingInStory ? (
                  <span className="ml-2 text-[11px] font-normal text-amber-300/90">Not in Story Roles</span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded border bg-slate-800 border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-200 transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:opacity-50 disabled:hover:bg-slate-800"
                  disabled={!canAddMore}
                  onClick={() => addPresetOverride(roleKey)}
                >
                  + Add Override
                </button>
                {Object.keys(overridesForRole).length ? (
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-red-300 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
                    onClick={() => {
                      const keys = Object.keys(overridesForRole);
                      keys.forEach((key) => removePresetOverride(roleKey, key));
                    }}
                  >
                    Clear Overrides
                  </button>
                ) : null}
              </div>
            </div>
            {Object.keys(overridesForRole).length ? (
              <div className="space-y-2">
                {Object.entries(overridesForRole).map(([settingKey, value], settingIndex) => {
                  const displayValue = draftValues[settingKey] ?? stringifyPresetValue(value);
                  return (
                    <div key={settingKey} className="grid grid-cols-[minmax(140px,0.45fr)_minmax(0,1fr)_auto] items-end gap-2">
                      <label className="flex flex-col gap-1 text-xs text-slate-300">
                        <span className="inline-flex items-center gap-1">
                          Setting
                          {settingIndex === 0 && roleIndex === 0 && <HelpTooltip title="Select which SillyTavern preset property to override for this role as it appears if you exported your presets as a JSON; current value is default." />}
                        </span>
                        <select
                          className="w-full rounded border border-slate-700 bg-slate-800 mb-0 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                          value={settingKey}
                          onChange={(e) => changePresetKey(roleKey, settingKey, e.target.value as PresetSettingKey)}
                        >
                          {PRESET_SETTING_KEYS.map((optionKey) => (
                            <option key={optionKey} value={optionKey} disabled={optionKey !== settingKey && usedKeys.has(optionKey)}>
                              {optionKey}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-slate-300">
                        <span className="inline-flex items-center gap-1">
                          Value
                          {settingIndex === 0 && roleIndex === 0 && <HelpTooltip title="Enter the override as it would appear as if you exported your presets as a JSON; current value is default." />}
                        </span>
                        <input
                          className="w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                          value={displayValue}
                          onChange={(e) => changePresetValue(roleKey, settingKey, e.target.value)}
                          placeholder="Override value..."
                        />
                      </label>
                      <button
                        type="button"
                        className="inline-flex h-[34px] items-center justify-center rounded border bg-slate-800 border-slate-700 px-3 text-xs font-medium text-red-300/90 transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500"
                        onClick={() => removePresetOverride(roleKey, settingKey)}
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-slate-400">No overrides for this role.</div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default PresetOverridesTab;
