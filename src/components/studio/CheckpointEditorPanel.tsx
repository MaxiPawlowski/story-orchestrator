import React from "react";
import {
  ARBITER_ROLE_KEY,
  ARBITER_ROLE_LABEL,
  type AuthorNotePosition,
  type AuthorNoteRole,
  type RolePresetOverrides,
} from "@utils/story-schema";
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

type TabKey = "basics" | "worldinfo" | "automations" | "notes" | "presets" | "transitions";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "basics", label: "Basics" },
  { key: "worldinfo", label: "World Info" },
  { key: "automations", label: "Automations" },
  { key: "notes", label: "Author Notes" },
  { key: "presets", label: "Preset Overrides" },
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

const STORY_COMMAND_TAG_ATTR = 'data-story-driver="1"';

type MacroDisplayCategory = "Runtime" | "Role";

type MacroDisplayEntry = {
  key: string;
  description: string;
  category: MacroDisplayCategory;
  detail?: string;
};

const STORY_MACRO_BASE_ENTRIES: MacroDisplayEntry[] = [
  { key: "story_active_title", description: "Active story title", category: "Runtime" },
  { key: "story_title", description: "Story title (prompt safe)", category: "Runtime" },
  { key: "story_description", description: "Story description from schema", category: "Runtime" },
  { key: "story_active_checkpoint_id", description: "Current checkpoint id", category: "Runtime" },
  { key: "story_active_checkpoint_name", description: "Current checkpoint name", category: "Runtime" },
  { key: "story_active_checkpoint_objective", description: "Current checkpoint objective", category: "Runtime" },
  { key: "story_current_checkpoint", description: "Formatted current checkpoint summary", category: "Runtime" },
  { key: "story_past_checkpoints", description: "Past checkpoint summary (most recent first)", category: "Runtime" },
  { key: "story_possible_triggers", description: "Formatted list of transition candidates", category: "Runtime" },
  { key: "chat_excerpt", description: "Recent conversation excerpt for arbiter prompts", category: "Runtime" },
  { key: "story_turn", description: "Current turn count", category: "Runtime" },
  { key: "story_turns_since_eval", description: "Turns since last arbiter evaluation", category: "Runtime" },
  { key: "story_checkpoint_turns", description: "Turns spent in the active checkpoint", category: "Runtime" },
  { key: "story_player_name", description: "Active player name", category: "Runtime" },
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
  const [slashCommands, setSlashCommands] = React.useState<Array<{
    name: string;
    aliases: string[];
    description?: string;
    samples: string[];
    isStoryDriver: boolean;
  }>>([]);
  const [slashCommandError, setSlashCommandError] = React.useState<string | null>(null);
  const [automationDraft, setAutomationDraft] = React.useState("");
  const [commandSearch, setCommandSearch] = React.useState("");
  const [referenceSearch, setReferenceSearch] = React.useState("");
  const overridesSignature = React.useMemo(() => {
    if (!selectedCheckpoint) return "";
    try {
      return JSON.stringify({
        preset_overrides: selectedCheckpoint.on_activate?.preset_overrides ?? {},
        arbiter_preset: selectedCheckpoint.on_activate?.arbiter_preset ?? null,
      });
    } catch {
      return `${selectedCheckpoint.id ?? ""}-preset-overrides`;
    }
  }, [selectedCheckpoint?.id, selectedCheckpoint?.on_activate?.preset_overrides, selectedCheckpoint?.on_activate?.arbiter_preset]);

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
      setAutomationDraft("");
      return;
    }
    const joined = (selectedCheckpoint.on_activate?.automations ?? []).join("\n");
    setAutomationDraft(joined);
  }, [selectedCheckpoint?.id]);

  React.useEffect(() => {
    if (!selectedCheckpoint) {
      setPresetDrafts({});
      return;
    }
    const overrides = selectedCheckpoint.on_activate?.preset_overrides ?? {};
    const arbiterPreset = selectedCheckpoint.on_activate?.arbiter_preset ?? null;
    const next: PresetDraftState = {};
    Object.entries(overrides).forEach(([roleKey, entries]) => {
      next[roleKey] = {};
      Object.entries(entries ?? {}).forEach(([settingKey, value]) => {
        next[roleKey][settingKey] = stringifyPresetValue(value);
      });
    });
    if (arbiterPreset) {
      next[ARBITER_ROLE_KEY] = {};
      Object.entries(arbiterPreset).forEach(([settingKey, value]) => {
        next[ARBITER_ROLE_KEY][settingKey] = stringifyPresetValue(value);
      });
    }
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

  const refreshSlashCommands = React.useCallback(() => {
    try {
      const ctx = getContext();
      const parser = (ctx as any)?.SlashCommandParser;
      const commandsRaw = parser?.commands ?? {};
      const entries: Array<{
        name: string;
        aliases: string[];
        description?: string;
        samples: string[];
        isStoryDriver: boolean;
      }> = [];

      const parseHelp = (value: unknown) => {
        if (typeof value !== "string" || !value.trim()) {
          return { description: undefined, samples: [] as string[], isStoryDriver: false };
        }
        const isStoryDriver = value.includes(STORY_COMMAND_TAG_ATTR);
        const descMatch = value.match(/<div[^>]*>([\s\S]*?)<\/div>/i);
        const description = descMatch ? descMatch[1].replace(/\s+/g, " ").trim() : undefined;
        const codeMatch = value.match(/<code[^>]*>([\s\S]*?)<\/code>/i);
        const samples = codeMatch
          ? codeMatch[1]
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
          : [];
        return { description, samples, isStoryDriver };
      };

      Object.entries(commandsRaw).forEach(([name, raw]) => {
        if (!name) return;
        const aliases = Array.isArray((raw as any)?.aliases)
          ? (raw as any).aliases.filter((alias: unknown) => typeof alias === "string" && alias.trim())
          : [];
        const help = parseHelp((raw as any)?.helpString);
        entries.push({
          name,
          aliases,
          description: help.description,
          samples: help.samples,
          isStoryDriver: help.isStoryDriver,
        });
      });
      setSlashCommands(entries);
      setSlashCommandError(null);
    } catch (err) {
      console.warn("[CheckpointEditor] Failed to read slash commands", err);
      setSlashCommands([]);
      setSlashCommandError("Unable to read slash commands from host.");
    }
  }, []);

  React.useEffect(() => {
    refreshSlashCommands();
  }, [refreshSlashCommands]);
  const slashCommandLookup = React.useMemo(() => {
    const map = new Map<string, typeof slashCommands[number]>();
    slashCommands.forEach((cmd) => {
      map.set(cmd.name.toLowerCase(), cmd);
      cmd.aliases.forEach((alias) => {
        map.set(alias.toLowerCase(), cmd);
      });
    });
    return map;
  }, [slashCommands]);

  const projectSlashCommands = React.useMemo(() => (
    slashCommands.filter((cmd) => cmd.isStoryDriver)
  ), [slashCommands]);

  const parseAutomationInput = React.useCallback((value: string) => {
    const lines = value.split(/\r?\n/);
    const seen = new Set<string>();
    const result: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (seen.has(trimmed)) continue;
      seen.add(trimmed);
      result.push(trimmed);
    }
    return result;
  }, []);

  const automationValidation = React.useMemo(() => {
    const lines = automationDraft.split(/\r?\n/);
    const seen = new Map<string, number>();
    return lines.map((rawLine, index) => {
      const trimmed = rawLine.trim();
      if (!trimmed) {
        return { line: rawLine, trimmed, status: "blank" as const, message: "" };
      }

      let status: "ok" | "error" = "ok";
      let message: string | undefined;

      if (!trimmed.startsWith("/")) {
        status = "error";
        message = "Slash commands must start with '/'.";
      } else {
        const match = trimmed.slice(1).match(/^([^\s]+)/);
        const commandName = match ? match[1].toLowerCase() : "";
        if (!commandName) {
          status = "error";
          message = "Missing command name.";
        } else {
          const commandMeta = slashCommandLookup.get(commandName);
          if (!commandMeta) {
            status = "error";
            message = `Unknown command '${commandName}'.`;
          } else if (commandMeta.description) {
            message = `Recognized /${commandMeta.name}`;
          }
        }
      }

      const duplicateOf = seen.get(trimmed);
      if (status === "ok" && duplicateOf !== undefined) {
        status = "error";
        message = `Duplicate of line ${duplicateOf + 1}.`;
      } else if (status === "ok") {
        seen.set(trimmed, index);
      }

      return { line: rawLine, trimmed, status, message };
    });
  }, [automationDraft, slashCommandLookup]);

  const filteredCommands = React.useMemo(() => {
    const query = commandSearch.trim().toLowerCase();
    if (!query) {
      return slashCommands.slice(0, 12);
    }
    return slashCommands
      .filter((cmd) => {
        if (cmd.name.toLowerCase().includes(query)) return true;
        if (cmd.aliases.some((alias) => alias.toLowerCase().includes(query))) return true;
        if (cmd.description && cmd.description.toLowerCase().includes(query)) return true;
        return false;
      })
      .slice(0, 12);
  }, [slashCommands, commandSearch]);

  const updateAutomationsForCheckpoint = React.useCallback((rawText: string) => {
    if (!selectedCheckpoint) return;
    const parsed = parseAutomationInput(rawText);
    updateCheckpoint(selectedCheckpoint.id, (cp) => {
      const next = ensureOnActivate(cp.on_activate);
      next.automations = parsed;
      return { ...cp, on_activate: cleanupOnActivate(next) };
    });
  }, [parseAutomationInput, selectedCheckpoint, updateCheckpoint]);

  const handleAutomationTextChange = React.useCallback((value: string) => {
    setAutomationDraft(value);
    updateAutomationsForCheckpoint(value);
  }, [updateAutomationsForCheckpoint]);

  const insertAutomationLine = React.useCallback((command: string) => {
    const trimmed = command.trim();
    if (!trimmed) return;
    setAutomationDraft((prev) => {
      const lines = prev.split(/\r?\n/);
      const alreadyPresent = lines.some((line) => line.trim() === trimmed);
      if (alreadyPresent) return prev;
      const base = prev.replace(/\s+$/u, "");
      const nextText = base ? `${base}\n${trimmed}` : trimmed;
      updateAutomationsForCheckpoint(nextText);
      return nextText;
    });
  }, [updateAutomationsForCheckpoint]);

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
    push(ARBITER_ROLE_KEY);

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

  const macroEntries = React.useMemo(() => {
    const entries = new Map<string, MacroDisplayEntry>();
    STORY_MACRO_BASE_ENTRIES.forEach((entry) => {
      entries.set(entry.key, { ...entry });
    });

    const roles = draft.roles && typeof draft.roles === "object" ? draft.roles : undefined;
    if (roles) {
      Object.entries(roles).forEach(([roleKey, roleLabelRaw]) => {
        if (!roleKey) return;
        const lower = roleKey.toLowerCase();
        if (!lower) return;
        const roleLabel = typeof roleLabelRaw === "string" && roleLabelRaw.trim() ? roleLabelRaw.trim() : roleKey;
        entries.set(`story_role_${lower}`, {
          key: `story_role_${lower}`,
          description: `Story role name for ${roleLabel}`,
          category: "Role",
          detail: `Role id: ${roleKey}`,
        });
      });
    }

    const dmLabelRaw = roles && Object.prototype.hasOwnProperty.call(roles, "dm") ? (roles as Record<string, unknown>)["dm"] : undefined;
    const dmLabel = typeof dmLabelRaw === "string" && dmLabelRaw.trim() ? dmLabelRaw.trim() : "DM";
    entries.set("story_role_dm", {
      key: "story_role_dm",
      description: `Story DM role name (${dmLabel})`,
      category: "Role",
    });

    const companionLabelRaw = roles && Object.prototype.hasOwnProperty.call(roles, "companion") ? (roles as Record<string, unknown>)["companion"] : undefined;
    const companionLabel = typeof companionLabelRaw === "string" && companionLabelRaw.trim() ? companionLabelRaw.trim() : "Companion";
    entries.set("story_role_companion", {
      key: "story_role_companion",
      description: `Story companion role name (${companionLabel})`,
      category: "Role",
    });

    return Array.from(entries.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [draft.roles]);

  const normalizedReferenceQuery = referenceSearch.trim().toLowerCase();

  const filteredReferenceCommands = React.useMemo(() => {
    if (!normalizedReferenceQuery) return projectSlashCommands;
    return projectSlashCommands.filter((cmd) => {
      const lowerName = cmd.name.toLowerCase();
      if (lowerName.includes(normalizedReferenceQuery)) return true;
      if (cmd.aliases.some((alias) => alias.toLowerCase().includes(normalizedReferenceQuery))) return true;
      if (cmd.description && cmd.description.toLowerCase().includes(normalizedReferenceQuery)) return true;
      if (cmd.samples.some((sample) => sample.toLowerCase().includes(normalizedReferenceQuery))) return true;
      return false;
    });
  }, [projectSlashCommands, normalizedReferenceQuery]);

  const filteredMacroEntries = React.useMemo(() => {
    if (!normalizedReferenceQuery) return macroEntries;
    return macroEntries.filter((entry) => {
      if (entry.key.toLowerCase().includes(normalizedReferenceQuery)) return true;
      if (entry.description.toLowerCase().includes(normalizedReferenceQuery)) return true;
      if (entry.detail && entry.detail.toLowerCase().includes(normalizedReferenceQuery)) return true;
      return false;
    });
  }, [macroEntries, normalizedReferenceQuery]);



  const resolveCurrentOverrides = React.useCallback((roleKey: string): Partial<Record<PresetSettingKey, unknown>> => {
    if (!selectedCheckpoint) return {};
    if (roleKey === ARBITER_ROLE_KEY) {
      return { ...(selectedCheckpoint.on_activate?.arbiter_preset ?? {}) } as Partial<Record<PresetSettingKey, unknown>>;
    }
    return { ...(selectedCheckpoint.on_activate?.preset_overrides?.[roleKey] ?? {}) } as Partial<Record<PresetSettingKey, unknown>>;
  }, [selectedCheckpoint?.id, selectedCheckpoint?.on_activate?.arbiter_preset, selectedCheckpoint?.on_activate?.preset_overrides]);

  const updateRoleOverrides = React.useCallback((
    roleKey: string,
    mutate: (current: Partial<Record<PresetSettingKey, unknown>>) => Partial<Record<PresetSettingKey, unknown>> | undefined,
  ) => {
    if (!selectedCheckpoint) return;
    updateCheckpoint(selectedCheckpoint.id, (cp) => {
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
  }, [selectedCheckpoint, updateCheckpoint]);

  const addPresetOverride = React.useCallback((roleKey: string) => {

    if (!selectedCheckpoint) return;

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

  }, [resolveCurrentOverrides, selectedCheckpoint, updateRoleOverrides]);



  const removePresetOverride = React.useCallback((roleKey: string, settingKey: string) => {

    if (!selectedCheckpoint) return;

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

  }, [selectedCheckpoint, updateRoleOverrides]);



  const changePresetKey = React.useCallback((roleKey: string, prevKey: string, nextKey: PresetSettingKey) => {

    if (!selectedCheckpoint) return;

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

  }, [resolveCurrentOverrides, selectedCheckpoint, updateRoleOverrides]);



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

    const key = settingKey as PresetSettingKey;
    updateRoleOverrides(roleKey, (current) => {
      const next = { ...current };
      next[key] = parsed;
      return next;
    });

  }, [selectedCheckpoint, updateRoleOverrides]);



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
                <div className="space-y-3">
                  <label className="flex flex-col gap-1 text-xs text-slate-300">
                    <span>Search Commands &amp; Macros</span>
                    <input
                      className="w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                      value={referenceSearch}
                      onChange={(e) => setReferenceSearch(e.target.value)}
                      placeholder="Type to filter /commands and {{macros}}..."
                    />
                  </label>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <div className="font-medium">Story Driver Slash Commands</div>
                      <div className="text-xs text-slate-400">
                        Read-only reference for commands registered by this extension.
                      </div>
                      <div className="rounded border border-slate-700 bg-slate-900/40 divide-y divide-slate-800">
                        {filteredReferenceCommands.length ? filteredReferenceCommands.map((cmd) => (
                          <div key={cmd.name} className="space-y-1 p-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="text-sm font-semibold text-slate-100">/{cmd.name}</div>
                              {cmd.aliases.length ? (
                                <div className="text-[11px] text-slate-400">Aliases: {cmd.aliases.join(", ")}</div>
                              ) : null}
                            </div>
                            {cmd.description ? (
                              <div className="text-xs text-slate-300">{cmd.description}</div>
                            ) : null}
                            {cmd.samples?.length ? (
                              <div className="flex flex-wrap gap-1">
                                {cmd.samples.slice(0, 3).map((sample) => (
                                  <span key={`${cmd.name}-${sample}`} className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-slate-200">
                                    {sample}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        )) : (
                          <div className="p-2 text-xs text-slate-500">
                            {projectSlashCommands.length
                              ? "No commands match the current search."
                              : "No Story Driver commands detected."}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="font-medium">Story Driver Macros</div>
                      <div className="text-xs text-slate-400">
                        Macros resolve at runtime; role entries update with the active story cast.
                      </div>
                      <div className="rounded border border-slate-700 bg-slate-900/40 divide-y divide-slate-800">
                        {filteredMacroEntries.length ? filteredMacroEntries.map((entry) => (
                          <div key={entry.key} className="space-y-1 p-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="font-mono text-xs text-slate-200">{`{{${entry.key}}}`}</div>
                              <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">
                                {entry.category}
                              </span>
                            </div>
                            <div className="text-xs text-slate-300">{entry.description}</div>
                            {entry.detail ? (
                              <div className="text-[11px] text-slate-500">{entry.detail}</div>
                            ) : null}
                          </div>
                        )) : (
                          <div className="p-2 text-xs text-slate-500">
                            {macroEntries.length
                              ? "No macros match the current search."
                              : "No Story Driver macros available."}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeTab === "notes" && (
              <>
                <div className="space-y-2">
                  <div className="font-medium">Author Notes</div>
                  {!noteRoleKeys.length ? (
                    <div className="text-xs text-slate-400">No story roles available for author notes.</div>
                  ) : (
                    <div className="space-y-4">
                      {noteRoleKeys.map((roleKey) => {
                        const roleName = draft.roles?.[roleKey];
                        const note = selectedCheckpoint.on_activate?.authors_note?.[roleKey];
                        const hasNote = Boolean(note?.text?.trim());
                        const roleLabel = roleName ? `${roleName} (${roleKey})` : roleKey;

                        return (
                          <div key={roleKey} className="rounded border border-slate-600 p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-sm font-semibold text-slate-100">{roleLabel}</div>
                              <button
                                type="button"
                                className="inline-flex items-center justify-center rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-600"
                                onClick={() => {
                                  updateCheckpoint(selectedCheckpoint.id, (cp) => {
                                    const next = ensureOnActivate(cp.on_activate);
                                    if (!next.authors_note) next.authors_note = {};
                                    next.authors_note[roleKey] = {
                                      text: note?.text ?? "",
                                      position: note?.position,
                                      interval: note?.interval,
                                      depth: note?.depth,
                                      role: note?.role,
                                    };
                                    return { ...cp, on_activate: cleanupOnActivate(next) };
                                  });
                                }}
                              >
                                {hasNote ? "Edit" : "Create"} Note
                              </button>
                            </div>
                            <label className="flex flex-col gap-1 text-xs text-slate-300">
                              <span>Author Note Text</span>
                              <textarea
                                className="w-full resize-y rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                                rows={3}
                                value={note?.text ?? ""}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  updateAuthorNote(roleKey, () => ({
                                    ...(note ?? { text: "" }),
                                    text: value,
                                  }));
                                }}
                                placeholder="Enter per-role Author’s Note or leave blank to inherit the story default."
                              />
                            </label>
                            <div className="grid grid-cols-4 gap-3">
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
                            <div className="flex justify-end">
                              <button
                                type="button"
                                className="inline-flex items-center justify-center rounded border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-red-300 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
                                onClick={() => {
                                  updateAuthorNote(roleKey, () => ({ text: "" }));
                                }}
                              >
                                Clear Note
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

            {activeTab === "presets" && (
              <>
                <div className="space-y-2">
                  <div className="font-medium">Preset Overrides</div>
                  {!presetRoleKeys.length ? (
                    <div className="text-xs text-slate-400">Define story roles to configure preset overrides.</div>
                  ) : (
                    <div className="space-y-3">
                      {presetRoleKeys.map((roleKey) => {
                        const overridesForRole = roleKey === ARBITER_ROLE_KEY
                          ? selectedCheckpoint.on_activate?.arbiter_preset ?? {}
                          : selectedCheckpoint.on_activate?.preset_overrides?.[roleKey] ?? {};
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

            {activeTab === "automations" && (
              <>
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium">Automations</div>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500"
                      onClick={refreshSlashCommands}
                    >
                      Reload Commands
                    </button>
                  </div>
                  <label className="flex flex-col gap-1 text-xs text-slate-300">
                    <span>Search Commands</span>
                    <input
                      className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                      value={commandSearch}
                      onChange={(e) => setCommandSearch(e.target.value)}
                      placeholder="Type to filter /command names..."
                    />
                  </label>
                  {slashCommandError ? (
                    <div className="text-xs text-red-300">{slashCommandError}</div>
                  ) : (
                    <>
                      <div className="text-xs text-slate-400">
                        Commands run when this checkpoint activates. Leading slash required; duplicates are ignored.
                      </div>
                      <div className="max-h-48 overflow-y-auto rounded border border-slate-700 bg-slate-900/40 divide-y divide-slate-800">
                        {filteredCommands.length ? filteredCommands.map((cmd) => (
                          <div key={cmd.name} className="p-2 space-y-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-xs text-slate-200">
                                <span className="font-medium">/{cmd.name}</span>
                                {cmd.aliases.length ? (
                                  <span className="ml-2 text-slate-400">
                                    ({cmd.aliases.join(", ")})
                                  </span>
                                ) : null}
                                {cmd.description ? (
                                  <div className="text-[11px] text-slate-400 mt-0.5">{cmd.description}</div>
                                ) : null}
                              </div>
                              <div className="flex flex-wrap gap-1">
                                <button
                                  type="button"
                                  className="inline-flex items-center justify-center rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-600"
                                  onClick={() => insertAutomationLine(`/${cmd.name}`)}
                                >
                                  Insert /{cmd.name}
                                </button>
                              </div>
                            </div>
                            {cmd.samples?.length ? (
                              <div className="flex flex-wrap gap-1">
                                {cmd.samples.slice(0, 4).map((sample) => (
                                  <button
                                    key={`${cmd.name}-${sample}`}
                                    type="button"
                                    className="inline-flex items-center justify-center rounded border border-slate-800 bg-slate-800/70 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-600"
                                    onClick={() => insertAutomationLine(sample)}
                                  >
                                    {sample}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        )) : (
                          <div className="p-2 text-xs text-slate-500">No commands match the current search.</div>
                        )}
                      </div>
                    </>
                  )}
                  <textarea
                    className="w-full resize-y rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                    rows={6}
                    value={automationDraft}
                    onChange={(e) => handleAutomationTextChange(e.target.value)}
                    placeholder="/checkpoint next"
                  />
                  {automationValidation.length ? (
                    <div className="space-y-1">
                      {automationValidation.map((entry, idx) => (
                        entry.status === "blank" ? null : (
                          <div
                            key={`${entry.line}-${idx}`}
                            className={`text-xs ${entry.status === "ok" ? "text-emerald-300" : "text-red-300"}`}
                          >
                            {entry.status === "ok" ? "OK" : "Issue"}: {entry.trimmed}
                            {entry.message ? `  E${entry.message}` : null}
                          </div>
                        )
                      ))}
                    </div>
                  ) : null}
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
