import React from "react";
import type { AuthorNotePosition, AuthorNoteRole, RolePresetOverrides } from "@utils/story-schema";
import {
  AuthorNoteDraft,
  CheckpointDraft,
  StoryDraft,
  TransitionTriggerDraft,
  ensureOnActivate,
  cleanupOnActivate,
  splitLines,
  clone,
} from "@utils/checkpoint-studio";
import { getContext, eventSource, event_types, tgSettings } from "@services/SillyTavernAPI";
import { PRESET_SETTING_KEYS, type PresetSettingKey } from "@constants/presetSettingKeys";
import { subscribeToEventSource } from "@utils/eventSource";
import MultiSelect from "./MultiSelect";

type Props = {
  draft: StoryDraft;
  selectedCheckpoint: CheckpointDraft | undefined;
  outgoingTransitions: StoryDraft["transitions"];
  onCheckpointIdChange: (id: string, value: string) => void;
  updateCheckpoint: (id: string, updater: (cp: CheckpointDraft) => CheckpointDraft) => void;
  onAddTransition: (fromId: string) => void;
  onRemoveTransition: (transitionId: string) => void;
  updateTransition: (transitionId: string, patch: Partial<StoryDraft["transitions"][number]>) => void;
  onRemoveCheckpoint: (id: string) => void;
};

type TabKey = "basics" | "worldinfo" | "notes" | "transitions";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "basics", label: "Basics" },
  { key: "worldinfo", label: "World Info" },
  { key: "notes", label: "Notes & Presets" },
  { key: "transitions", label: "Transitions" },
];

const NUMERIC_LITERAL_RE = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

type PresetDraftState = Record<string, Record<string, string>>;

const AUTHOR_NOTE_POSITION_OPTIONS: Array<{ value: "" | AuthorNotePosition; label: string }> = [
  { value: "", label: "Story default" },
  { value: "before", label: "Before chat" },
  { value: "chat", label: "Within chat" },
  { value: "after", label: "After chat" },
];

const AUTHOR_NOTE_ROLE_OPTIONS: Array<{ value: "" | AuthorNoteRole; label: string }> = [
  { value: "", label: "Story default" },
  { value: "system", label: "System" },
  { value: "user", label: "User" },
  { value: "assistant", label: "Assistant" },
];

const stringifyPresetValue = (value: unknown): string => {
  if (value === undefined) return "";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const parsePresetValue = (raw: string): unknown => {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const lastChar = trimmed.charAt(trimmed.length - 1);
  if (lastChar === "." || lastChar === "e" || lastChar === "E" || lastChar === "+" || lastChar === "-") {
    return raw;
  }
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (NUMERIC_LITERAL_RE.test(trimmed)) {
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : raw;
  }
  const firstChar = trimmed.charAt(0);
  if (
    (firstChar === "{" && trimmed.endsWith("}")) ||
    (firstChar === "[" && trimmed.endsWith("]")) ||
    (firstChar === "\"" && trimmed.endsWith("\""))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return raw;
    }
  }
  return raw;
};

const clonePresetValue = (value: unknown): unknown => {
  if (Array.isArray(value) || (value && typeof value === "object")) {
    try {
      return clone(value);
    } catch {
      try {
        return JSON.parse(JSON.stringify(value));
      } catch {
        return value;
      }
    }
  }
  return value;
};

const readCurrentPresetValue = (key: PresetSettingKey): unknown => {
  try {
    const base = (tgSettings as any)?.[key];
    return clonePresetValue(base);
  } catch {
    return "";
  }
};

const CheckpointEditorPanel: React.FC<Props> = ({
  draft,
  selectedCheckpoint,
  outgoingTransitions,
  onCheckpointIdChange,
  updateCheckpoint,
  onAddTransition,
  onRemoveTransition,
  updateTransition,
  onRemoveCheckpoint,
}) => {
  const [loreComments, setLoreComments] = React.useState<string[]>([]);
  const [activeTab, setActiveTab] = React.useState<TabKey>("basics");
  const [presetDrafts, setPresetDrafts] = React.useState<PresetDraftState>({});
  const overridesSignature = React.useMemo(() => {
    if (!selectedCheckpoint?.on_activate?.preset_overrides) return "";
    try {
      return JSON.stringify(selectedCheckpoint.on_activate.preset_overrides);
    } catch {
      return "";
    }
  }, [selectedCheckpoint?.on_activate?.preset_overrides]);

  const authorNotesSignature = React.useMemo(() => {
    if (!selectedCheckpoint?.on_activate?.authors_note) return "";
    try {
      return JSON.stringify(selectedCheckpoint.on_activate.authors_note);
    } catch {
      return `${selectedCheckpoint.id ?? ""}-authors-note`;
    }
  }, [selectedCheckpoint?.id, selectedCheckpoint?.on_activate?.authors_note]);

  const refreshLoreEntries = React.useCallback(async () => {
    const lorebook = (draft.global_lorebook || "").trim();
    if (!lorebook) { setLoreComments([]); return; }
    try {
      const { loadWorldInfo } = getContext();
      const res: any = await loadWorldInfo(lorebook);
      const entries = res?.entries ?? {};
      const comments = Object.values(entries)
        .map((e: any) => (typeof e?.comment === "string" ? e.comment.trim() : ""))
        .filter(Boolean);
      setLoreComments(comments);
    } catch (err) {
      console.warn("[CheckpointEditor] Failed to load world info entries", err);
      setLoreComments([]);
    }
  }, [draft.global_lorebook]);

  React.useEffect(() => {
    void refreshLoreEntries();
    const offs: Array<() => void> = [];
    const handler = () => void refreshLoreEntries();
    try {
      [
        event_types?.WORLDINFO_ENTRIES_LOADED,
        event_types?.WORLDINFO_UPDATED,
      ].forEach((eventName) => {
        if (!eventName) return;
        offs.push(subscribeToEventSource({ source: eventSource, eventName, handler }));
      });
    } catch (err) {
      console.warn("[CheckpointEditor] Failed to subscribe to WI events", err);
    }
    return () => { while (offs.length) { try { offs.pop()?.(); } catch { } } };
  }, [refreshLoreEntries]);

  React.useEffect(() => {
    if (!selectedCheckpoint) {
      setPresetDrafts({});
      return;
    }
    const overrides = selectedCheckpoint.on_activate?.preset_overrides ?? {};
    const next: PresetDraftState = {};
    Object.entries(overrides).forEach(([roleKey, entries]) => {
      next[roleKey] = {};
      Object.entries(entries ?? {}).forEach(([settingKey, value]) => {
        next[roleKey][settingKey] = stringifyPresetValue(value);
      });
    });
    setPresetDrafts(next);
  }, [selectedCheckpoint?.id, overridesSignature]);

  const buildEntryOptions = React.useCallback((selected: string[] | undefined) => {
    const base = loreComments.slice();
    const extra = (selected ?? []).filter((s) => s && !base.includes(s));
    return [
      ...base.map((v) => ({ value: v, label: v })),
      ...extra.map((v) => ({ value: v, label: `${v} (not in lorebook)` })),
    ];
  }, [loreComments]);

  const presetRoleKeys = React.useMemo(() => {

    if (!selectedCheckpoint) return [];

    const seen = new Set<string>();

    const ordered: string[] = [];

    const push = (roleKey?: string | null) => {

      if (!roleKey) return;

      if (seen.has(roleKey)) return;

      seen.add(roleKey);

      ordered.push(roleKey);

    };

    Object.keys(draft.roles ?? {}).forEach(push);

    Object.keys(selectedCheckpoint.on_activate?.preset_overrides ?? {}).forEach(push);

    Object.keys(presetDrafts).forEach(push);

    return ordered;

  }, [draft.roles, presetDrafts, selectedCheckpoint?.id, overridesSignature]);

  const noteRoleKeys = React.useMemo(() => {

    if (!selectedCheckpoint) return [];

    const seen = new Set<string>();

    const ordered: string[] = [];

    const push = (roleKey?: string | null) => {

      if (!roleKey) return;

      if (seen.has(roleKey)) return;

      seen.add(roleKey);

      ordered.push(roleKey);

    };

    Object.keys(draft.roles ?? {}).forEach(push);

    Object.keys(selectedCheckpoint.on_activate?.authors_note ?? {}).forEach(push);

    return ordered;

  }, [draft.roles, selectedCheckpoint?.id, authorNotesSignature]);



  const addPresetOverride = React.useCallback((roleKey: string) => {

    if (!selectedCheckpoint) return;

    const existing = selectedCheckpoint.on_activate?.preset_overrides?.[roleKey] ?? {};

    const usedKeys = new Set(Object.keys(existing));

    const candidate = PRESET_SETTING_KEYS.find((key) => !usedKeys.has(key));

    if (!candidate) return;

    const baseValue = readCurrentPresetValue(candidate);

    const storedValue = baseValue === undefined ? "" : baseValue;

    updateCheckpoint(selectedCheckpoint.id, (cp) => {
      const next = ensureOnActivate(cp.on_activate);
      const overrides = { ...(next.preset_overrides ?? {}) } as RolePresetOverrides;
      const roleOverrides = { ...(overrides[roleKey] ?? {}) } as Record<PresetSettingKey, unknown>;
      roleOverrides[candidate] = storedValue;
      overrides[roleKey] = roleOverrides;
      next.preset_overrides = overrides;
      return { ...cp, on_activate: cleanupOnActivate(next) };
    });

    setPresetDrafts((prev) => {

      const next = { ...prev };

      const roleDraft = { ...(next[roleKey] ?? {}) };

      roleDraft[candidate] = stringifyPresetValue(storedValue);

      next[roleKey] = roleDraft;

      return next;

    });

  }, [selectedCheckpoint, updateCheckpoint]);



  const removePresetOverride = React.useCallback((roleKey: string, settingKey: string) => {

    if (!selectedCheckpoint) return;

    updateCheckpoint(selectedCheckpoint.id, (cp) => {
      const next = ensureOnActivate(cp.on_activate);
      const overrides = { ...(next.preset_overrides ?? {}) } as RolePresetOverrides;
      const key = settingKey as PresetSettingKey;
      const roleOverrides = { ...(overrides[roleKey] ?? {}) } as Record<PresetSettingKey, unknown>;
      delete roleOverrides[key];
      if (Object.keys(roleOverrides).length) overrides[roleKey] = roleOverrides;
      else delete overrides[roleKey];
      next.preset_overrides = Object.keys(overrides).length ? overrides : undefined;
      return { ...cp, on_activate: cleanupOnActivate(next) };
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

  }, [selectedCheckpoint, updateCheckpoint]);



  const changePresetKey = React.useCallback((roleKey: string, prevKey: string, nextKey: PresetSettingKey) => {

    if (!selectedCheckpoint) return;

    if (prevKey === nextKey) return;

    const existing = selectedCheckpoint.on_activate?.preset_overrides?.[roleKey] ?? {};

    if (Object.prototype.hasOwnProperty.call(existing, nextKey) && nextKey !== prevKey) return;

    const baseValue = readCurrentPresetValue(nextKey);

    const storedValue = baseValue === undefined ? "" : baseValue;

    updateCheckpoint(selectedCheckpoint.id, (cp) => {
      const next = ensureOnActivate(cp.on_activate);
      const overrides = { ...(next.preset_overrides ?? {}) } as RolePresetOverrides;
      const previousKey = prevKey as PresetSettingKey;
      const roleOverrides = { ...(overrides[roleKey] ?? {}) } as Record<PresetSettingKey, unknown>;
      delete roleOverrides[previousKey];
      roleOverrides[nextKey] = storedValue;
      overrides[roleKey] = roleOverrides;
      next.preset_overrides = overrides;
      return { ...cp, on_activate: cleanupOnActivate(next) };
    });

    setPresetDrafts((prev) => {

      const next = { ...prev };

      const roleDraft = { ...(next[roleKey] ?? {}) };

      delete roleDraft[prevKey];

      roleDraft[nextKey] = stringifyPresetValue(storedValue);

      next[roleKey] = roleDraft;

      return next;

    });

  }, [selectedCheckpoint, updateCheckpoint]);



  const changePresetValue = React.useCallback((roleKey: string, settingKey: string, rawValue: string) => {

    setPresetDrafts((prev) => {

      const next = { ...prev };

      const roleDraft = { ...(next[roleKey] ?? {}) };

      roleDraft[settingKey] = rawValue;

      next[roleKey] = roleDraft;

      return next;

    });

    if (!selectedCheckpoint) return;

    const parsed = parsePresetValue(rawValue);

    updateCheckpoint(selectedCheckpoint.id, (cp) => {
      const next = ensureOnActivate(cp.on_activate);
      const overrides = { ...(next.preset_overrides ?? {}) } as RolePresetOverrides;
      const key = settingKey as PresetSettingKey;
      const roleOverrides = { ...(overrides[roleKey] ?? {}) } as Record<PresetSettingKey, unknown>;
      roleOverrides[key] = parsed;
      overrides[roleKey] = roleOverrides;
      next.preset_overrides = overrides;
      return { ...cp, on_activate: cleanupOnActivate(next) };
    });

  }, [selectedCheckpoint, updateCheckpoint]);



  const updateAuthorNote = React.useCallback((roleKey: string, editor: (prev: AuthorNoteDraft | undefined) => AuthorNoteDraft | undefined) => {

    if (!selectedCheckpoint) return;

    updateCheckpoint(selectedCheckpoint.id, (cp) => {
      const next = ensureOnActivate(cp.on_activate);
      const currentMap = { ...(next.authors_note ?? {}) } as Record<string, AuthorNoteDraft | undefined>;
      const updated = editor(currentMap[roleKey]);
      if (updated) currentMap[roleKey] = updated;
      else delete currentMap[roleKey];
      next.authors_note = currentMap;
      return { ...cp, on_activate: cleanupOnActivate(next) };
    });

  }, [selectedCheckpoint, updateCheckpoint]);


  const removeAuthorNote = React.useCallback((roleKey: string) => {

    updateAuthorNote(roleKey, () => undefined);

  }, [updateAuthorNote]);



  return (
    <div className="rounded-lg border border-slate-800 bg-[var(--SmartThemeBlurTintColor)] shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="font-semibold shrink-0">Checkpoint Editor</div>
          {selectedCheckpoint ? (
            <div className="max-w-[420px] truncate text-xs opacity-70">{selectedCheckpoint.name || selectedCheckpoint.id}</div>
          ) : null}
        </div>
        {selectedCheckpoint ? (
          <button
            type="button"
            className="inline-flex items-center justify-center rounded border bg-slate-800 border-slate-700 px-2.5 py-1 text-xs font-medium text-red-300/90 transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500"
            onClick={() => onRemoveCheckpoint(selectedCheckpoint.id)}
          >
            Remove
          </button>
        ) : null}
      </div>

      {/* Tabs */}
      <div className="sticky top-0 z-[1] border-b border-slate-800 bg-[var(--SmartThemeBlurTintColor)] px-3 pt-2">
        <div className="flex flex-wrap items-center gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={(activeTab === t.key
                ? "bg-slate-700 text-slate-50"
                : "bg-slate-800 text-slate-300 hover:bg-slate-900") +
                " rounded px-3 py-1 text-xs border border-slate-700 transition"}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4 p-3">
        {!selectedCheckpoint ? (
          <div className="text-xs text-slate-400">Select a checkpoint to edit.</div>
        ) : (
          <>
            {activeTab === "basics" && (
              <>
                <label className="flex flex-col gap-1 text-xs text-slate-300">
                  <span>Checkpoint Id</span>
                  <input
                    className="w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                    value={selectedCheckpoint.id}
                    onChange={(e) => onCheckpointIdChange(selectedCheckpoint.id, e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-300">
                  <span>Name</span>
                  <input
                    className="w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                    value={selectedCheckpoint.name}
                    onChange={(e) => updateCheckpoint(selectedCheckpoint.id, (cp) => ({ ...cp, name: e.target.value }))}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-300">
                  <span>Objective</span>
                  <textarea
                    className="w-full resize-y rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                    rows={3}
                    value={selectedCheckpoint.objective}
                    onChange={(e) => updateCheckpoint(selectedCheckpoint.id, (cp) => ({ ...cp, objective: e.target.value }))}
                  />
                </label>
              </>
            )}

            {activeTab === "notes" && (
              <>
                <div className="space-y-2">
                  <div className="font-medium">Author Notes & Preset Overrides</div>
                  {/* Per-role Author's Notes based on configured roles */}
                  {noteRoleKeys.length ? (
                    <div className="space-y-3">
                      <div className="text-xs text-slate-400">Define per-role author notes and optional delivery settings. Notes require text to enable additional controls.</div>
                      {noteRoleKeys.map((roleKey) => {
                        const note = selectedCheckpoint.on_activate?.authors_note?.[roleKey] as AuthorNoteDraft | undefined;
                        const textValue = note?.text ?? "";
                        const hasNote = Boolean(textValue.trim().length);
                        const missingInStory = !(draft.roles && Object.prototype.hasOwnProperty.call(draft.roles, roleKey));
                        return (
                          <div key={roleKey} className="space-y-2 rounded border border-slate-700 bg-slate-900/40 p-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-xs font-semibold text-slate-200">
                                {roleKey}
                                {missingInStory ? (
                                  <span className="ml-2 text-[11px] font-normal text-amber-300/90">Not in Story Roles</span>
                                ) : null}
                              </div>
                              <button
                                type="button"
                                className="inline-flex items-center justify-center rounded border bg-slate-800 border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-200 transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:opacity-40 disabled:hover:bg-slate-800"
                                disabled={!hasNote}
                                onClick={() => removeAuthorNote(roleKey)}
                              >
                                Clear Note
                              </button>
                            </div>
                            <label className="flex flex-col gap-1 text-xs text-slate-300">
                              <span>Author Note Text</span>
                              <textarea
                                className="w-full resize-y rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                                rows={3}
                                value={textValue}
                                placeholder="Describe tone, behavior, and guidance for this role..."
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  updateAuthorNote(roleKey, (prev) => {
                                    if (!raw.trim()) return undefined;
                                    const next: AuthorNoteDraft = { ...(prev ?? {}), text: raw };
                                    return next;
                                  });
                                }}
                              />
                            </label>
                            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                              <label className="flex flex-col gap-1 text-xs text-slate-300">
                                <span>Position</span>
                                <select
                                  className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                                  value={note?.position ?? ""}
                                  disabled={!hasNote}
                                  onChange={(e) => {
                                    const value = e.target.value as "" | AuthorNotePosition;
                                    updateAuthorNote(roleKey, (prev) => {
                                      if (!prev?.text?.trim()) return prev;
                                      const next: AuthorNoteDraft = { ...prev };
                                      if (!value) delete next.position;
                                      else next.position = value;
                                      return next;
                                    });
                                  }}
                                >
                                  {AUTHOR_NOTE_POSITION_OPTIONS.map((option) => (
                                    <option key={option.value || "default"} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="flex flex-col gap-1 text-xs text-slate-300">
                                <span>Interval (turns)</span>
                                <input
                                  type="number"
                                  min={1}
                                  className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                                  value={note?.interval !== undefined ? String(note.interval) : ""}
                                  disabled={!hasNote}
                                  placeholder="Story default"
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    updateAuthorNote(roleKey, (prev) => {
                                      if (!prev?.text?.trim()) return prev;
                                      const next: AuthorNoteDraft = { ...prev };
                                      if (!raw) {
                                        delete next.interval;
                                        return next;
                                      }
                                      const parsed = Number(raw);
                                      if (!Number.isFinite(parsed)) return next;
                                      next.interval = Math.max(1, Math.round(parsed));
                                      return next;
                                    });
                                  }}
                                />
                              </label>
                              <label className="flex flex-col gap-1 text-xs text-slate-300">
                                <span>Depth</span>
                                <input
                                  type="number"
                                  min={0}
                                  className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                                  value={note?.depth !== undefined ? String(note.depth) : ""}
                                  disabled={!hasNote}
                                  placeholder="Story default"
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    updateAuthorNote(roleKey, (prev) => {
                                      if (!prev?.text?.trim()) return prev;
                                      const next: AuthorNoteDraft = { ...prev };
                                      if (!raw) {
                                        delete next.depth;
                                        return next;
                                      }
                                      const parsed = Number(raw);
                                      if (!Number.isFinite(parsed)) return next;
                                      next.depth = Math.max(0, Math.round(parsed));
                                      return next;
                                    });
                                  }}
                                />
                              </label>
                              <label className="flex flex-col gap-1 text-xs text-slate-300">
                                <span>Send As</span>
                                <select
                                  className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                                  value={note?.role ?? ""}
                                  disabled={!hasNote}
                                  onChange={(e) => {
                                    const value = e.target.value as "" | AuthorNoteRole;
                                    updateAuthorNote(roleKey, (prev) => {
                                      if (!prev?.text?.trim()) return prev;
                                      const next: AuthorNoteDraft = { ...prev };
                                      if (!value) delete next.role;
                                      else next.role = value;
                                      return next;
                                    });
                                  }}
                                >
                                  {AUTHOR_NOTE_ROLE_OPTIONS.map((option) => (
                                    <option key={option.value || "default"} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded border border-slate-700 bg-slate-900/40 p-3 text-xs text-slate-400">
                      Define story roles or add author notes in the JSON to configure per-role guidance.
                    </div>
                  )}
                  <div className="space-y-2">
                    <div className="font-medium">Preset Overrides</div>
                    {!presetRoleKeys.length ? (
                      <div className="text-xs text-slate-400">Define story roles to configure preset overrides.</div>
                    ) : (
                      <div className="space-y-3">
                        {presetRoleKeys.map((roleKey) => {
                          const overridesForRole = selectedCheckpoint.on_activate?.preset_overrides?.[roleKey] ?? {};
                          const draftValues = presetDrafts[roleKey] ?? {};
                          const usedKeys = new Set(Object.keys(overridesForRole));
                          const canAddMore = usedKeys.size < PRESET_SETTING_KEYS.length;
                          const missingInStory = !(draft.roles && Object.prototype.hasOwnProperty.call(draft.roles, roleKey));
                          return (
                            <div key={roleKey} className="space-y-2 rounded border border-slate-700 bg-slate-900/40 p-2">
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-xs font-semibold text-slate-200">
                                  {roleKey}
                                  {missingInStory ? (
                                    <span className="ml-2 text-[11px] font-normal text-amber-300/90">Not in Story Roles</span>
                                  ) : null}
                                </div>
                                <button
                                  type="button"
                                  className="inline-flex items-center justify-center rounded border bg-slate-800 border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-200 transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:opacity-50 disabled:hover:bg-slate-800"
                                  disabled={!canAddMore}
                                  onClick={() => addPresetOverride(roleKey)}
                                >
                                  + Add Override
                                </button>
                              </div>
                              {Object.keys(overridesForRole).length ? (
                                <div className="space-y-2">
                                  {Object.entries(overridesForRole).map(([settingKey, value]) => {
                                    const displayValue = draftValues[settingKey] ?? stringifyPresetValue(value);
                                    return (
                                      <div key={settingKey} className="grid grid-cols-[minmax(140px,0.45fr)_minmax(0,1fr)_auto] items-end gap-2">
                                        <label className="flex flex-col gap-1 text-xs text-slate-300">
                                          <span>Setting</span>
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
                                          <span>Value</span>
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
                    )}
                  </div>
                </div>
              </>
            )}

            {activeTab === "worldinfo" && (
              <>
                <div className="space-y-2">
                  <div className="font-medium">World Info</div>
                  <label className="flex flex-col gap-1 text-xs text-slate-300">
                    <span>Activate</span>
                    <MultiSelect
                      options={buildEntryOptions(selectedCheckpoint.on_activate?.world_info?.activate)}
                      value={selectedCheckpoint.on_activate?.world_info?.activate ?? []}
                      onChange={(values) => {
                        updateCheckpoint(selectedCheckpoint.id, (cp) => {
                          const next = ensureOnActivate(cp.on_activate);
                          next.world_info.activate = values;
                          return { ...cp, on_activate: cleanupOnActivate(next) };
                        });
                      }}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-slate-300">
                    <span>Deactivate</span>
                    <MultiSelect
                      options={buildEntryOptions(selectedCheckpoint.on_activate?.world_info?.deactivate)}
                      value={selectedCheckpoint.on_activate?.world_info?.deactivate ?? []}
                      onChange={(values) => {
                        updateCheckpoint(selectedCheckpoint.id, (cp) => {
                          const next = ensureOnActivate(cp.on_activate);
                          next.world_info.deactivate = values;
                          return { ...cp, on_activate: cleanupOnActivate(next) };
                        });
                      }}
                    />
                  </label>
                </div>
              </>
            )}

            {activeTab === "transitions" && (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">Outgoing Transitions</div>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded border bg-slate-800 border-slate-700 px-3 py-1 text-xs font-medium text-slate-200 transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500"
                      onClick={() => onAddTransition(selectedCheckpoint.id)}
                    >
                      + Transition
                    </button>
                  </div>
                  {!outgoingTransitions.length ? (
                    <div className="text-xs text-slate-400">No transitions from this checkpoint.</div>
                  ) : (
                    <div className="space-y-2">
                      {outgoingTransitions.map((edge) => {
                        const trigger = edge.trigger;
                        const setTrigger = (next: TransitionTriggerDraft) => {
                          updateTransition(edge.id, { trigger: next });
                        };
                        const patchTrigger = (patch: Partial<TransitionTriggerDraft>) => {
                          setTrigger({ ...trigger, ...patch });
                        };
                        const handleTypeChange = (nextType: TransitionTriggerDraft["type"]) => {
                          if (nextType === trigger.type) return;
                          if (nextType === "timed") {
                            setTrigger({
                              type: "timed",
                              within_turns: Math.max(1, trigger.within_turns ?? 3),
                              label: trigger.label,
                              patterns: [],
                            });
                          } else {
                            setTrigger({
                              type: "regex",
                              patterns: trigger.patterns?.length ? trigger.patterns : ["/enter-pattern/i"],
                              condition: trigger.condition ?? "Replace with Arbiter condition",
                              label: trigger.label,
                            });
                          }
                        };
                        const isRegex = trigger.type === "regex";

                        return (
                          <div key={edge.id} className="rounded border border-slate-600 p-2 space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <label className="flex flex-col gap-1 text-xs text-slate-300">
                                <span>To</span>
                                <select
                                  className="w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                                  value={edge.to}
                                  onChange={(e) => updateTransition(edge.id, { to: e.target.value })}
                                >
                                  {draft.checkpoints.map((cp) => (
                                    <option key={cp.id} value={cp.id}>
                                      {cp.name || cp.id}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="flex flex-col gap-1 text-xs text-slate-300">
                                <span>Label</span>
                                <input
                                  className="w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                                  value={edge.label ?? ""}
                                  onChange={(e) => updateTransition(edge.id, { label: e.target.value })}
                                />
                              </label>
                            </div>
                            <label className="flex flex-col gap-1 text-xs text-slate-300">
                              <span>Description</span>
                              <textarea
                                className="w-full resize-y rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                                rows={2}
                                value={edge.description ?? ""}
                                onChange={(e) => updateTransition(edge.id, { description: e.target.value })}
                              />
                            </label>
                            <div className="space-y-2">
                              <div className="grid grid-cols-3 gap-2">
                                <label className="flex flex-col gap-1 text-xs text-slate-300">
                                  <span>Trigger Type</span>
                                  <select
                                    className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                                    value={trigger.type}
                                    onChange={(e) => handleTypeChange(e.target.value as TransitionTriggerDraft["type"])}
                                  >
                                    <option value="regex">regex</option>
                                    <option value="timed">timed</option>
                                  </select>
                                </label>
                                <label className="flex flex-col gap-1 text-xs text-slate-300">
                                  <span>Trigger Label (optional)</span>
                                  <input
                                    className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                                    value={trigger.label ?? ""}
                                    onChange={(e) => patchTrigger({ label: e.target.value })}
                                  />
                                </label>
                                {isRegex ? (
                                  <div />
                                ) : (
                                  <label className="flex flex-col gap-1 text-xs text-slate-300">
                                    <span>Advance After Turns</span>
                                    <input
                                      type="number"
                                      min={1}
                                      className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                                      value={Math.max(1, trigger.within_turns ?? 1)}
                                      onChange={(e) => patchTrigger({ within_turns: Math.max(1, Number(e.target.value) || 1) })}
                                    />
                                  </label>
                                )}
                              </div>
                              {isRegex ? (
                                <div className="grid gap-2">
                                  <label className="flex flex-col gap-1 text-xs text-slate-300">
                                    <span>Patterns (one per line)</span>
                                    <textarea
                                      className="w-full resize-y rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                                      rows={3}
                                      value={(trigger.patterns ?? []).join("\n")}
                                      onChange={(e) => patchTrigger({ patterns: splitLines(e.target.value) })}
                                    />
                                  </label>
                                  <label className="flex flex-col gap-1 text-xs text-slate-300">
                                    <span>Arbiter Condition (LLM only)</span>
                                    <textarea
                                      className="w-full resize-y rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                                      rows={2}
                                      value={trigger.condition ?? ""}
                                      onChange={(e) => patchTrigger({ condition: e.target.value })}
                                    />
                                  </label>
                                </div>
                              ) : (
                                <div className="text-xs text-slate-400">
                                  This transition will advance automatically once the turn counter reaches the specified value.
                                </div>
                              )}
                            </div>
                            <div className="flex justify-between items-center">
                              <div className="text-xs opacity-80">{edge.id}</div>
                              <button
                                type="button"
                                className="inline-flex items-center justify-center rounded border bg-slate-800 border-slate-700 px-3 py-1 text-xs font-medium text-slate-200 transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500"
                                onClick={() => onRemoveTransition(edge.id)}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default CheckpointEditorPanel;
