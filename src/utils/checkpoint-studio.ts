import type {
  Story,
  Checkpoint,
  Transition,
  TransitionTrigger,
  Role,
  RolePresetOverrides,
  PresetOverrides,
  AuthorNoteDefinition,
  AuthorNoteSettings,
  AuthorNotePosition,
  AuthorNoteRole,
} from "@utils/story-schema";
import type {
  NormalizedStory,
  NormalizedCheckpoint,
  NormalizedOnActivate,
  NormalizedTransition,
  NormalizedTransitionTrigger,
  NormalizedAuthorNote,
} from "@utils/story-validator";

export type LayoutName = "breadthfirst" | "cose" | "grid" | "dagre";

export type AuthorNoteDraft = {
  text: string;
  position?: AuthorNotePosition;
  interval?: number;
  depth?: number;
  role?: AuthorNoteRole;
};

export type CheckpointDraft = Omit<Checkpoint, "on_activate"> & {
  on_activate?: {
    authors_note?: Partial<Record<Role, AuthorNoteDraft>>;
    world_info?: { activate: string[]; deactivate: string[] };
    preset_overrides?: RolePresetOverrides;
    arbiter_preset?: PresetOverrides;
    automations?: string[];
  };
};

export type TransitionTriggerDraft = {
  id?: string;
  type: "regex" | "timed";
  patterns: string[];
  condition?: string;
  within_turns?: number;
  label?: string;
};

export type TransitionDraft = Omit<Transition, "trigger"> & {
  trigger: TransitionTriggerDraft;
};

export type StoryDraft = Omit<Story, "checkpoints" | "transitions"> & {
  checkpoints: CheckpointDraft[];
  transitions: TransitionDraft[];
};

export type EnsuredOnActivate = {
  authors_note: Partial<Record<Role, AuthorNoteDraft>>;
  world_info: { activate: string[]; deactivate: string[] };
  preset_overrides?: RolePresetOverrides;
  arbiter_preset?: PresetOverrides;
  automations: string[];
};

export const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

export const regexToString = (re: RegExp): string => `/${re.source}/${re.flags}`;

export const sanitizeList = (values: string[] | undefined): string[] =>
  (values ?? []).map((entry) => entry.trim()).filter(Boolean);

export const splitLines = (value: string): string[] => {
  // Preserve user spacing while stripping out lines that are entirely whitespace.
  const lines = value.split(/\r?\n/);
  const result: string[] = [];
  for (const line of lines) {
    if (!line) continue;
    if (!line.trim()) continue;
    result.push(line);
  }
  return result;
};

export const splitCsv = (value: string): string[] =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const escapeMermaidText = (value: string): string => value.replace(/"/g, "\\\"");

const sanitizeMermaidId = (value: string): string => value.replace(/[^a-zA-Z0-9_]/g, "_");

const cleanupAuthorsNoteDrafts = (
  value?: Partial<Record<Role, AuthorNoteDraft>>,
): Partial<Record<Role, AuthorNoteDraft>> | undefined => {
  if (!value) return undefined;
  const result: Partial<Record<Role, AuthorNoteDraft>> = {};
  (Object.entries(value) as [Role, AuthorNoteDraft | undefined][]).forEach(([role, maybeDraft]) => {
    const rawText = maybeDraft?.text ?? "";
    const trimmed = rawText.trim();
    if (!trimmed) return;
    const cleaned: AuthorNoteDraft = { text: trimmed };
    if (maybeDraft?.position) cleaned.position = maybeDraft.position;
    if (maybeDraft?.interval !== undefined && Number.isFinite(maybeDraft.interval)) {
      cleaned.interval = Number(maybeDraft.interval);
    }
    if (maybeDraft?.depth !== undefined && Number.isFinite(maybeDraft.depth)) {
      cleaned.depth = Number(maybeDraft.depth);
    }
    if (maybeDraft?.role) cleaned.role = maybeDraft.role;
    result[role] = cleaned;
  });
  return Object.keys(result).length ? result : undefined;
};

const convertDraftNoteToDefinition = (draft: AuthorNoteDraft): AuthorNoteDefinition => {
  const definition: AuthorNoteDefinition = {
    text: draft.text.trim(),
  };
  if (draft.position) definition.position = draft.position;
  if (draft.interval !== undefined && Number.isFinite(draft.interval)) {
    definition.interval = Number(draft.interval);
  }
  if (draft.depth !== undefined && Number.isFinite(draft.depth)) {
    definition.depth = Number(draft.depth);
  }
  if (draft.role) definition.role = draft.role;
  return definition;
};

const cleanupRoleMap = (value?: Record<Role, unknown>): Record<Role, string> | undefined => {
  if (!value) return undefined;
  const entries: Array<[Role, string]> = [];
  Object.entries(value).forEach(([role, raw]) => {
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    if (!trimmed) return;
    entries.push([role, trimmed]);
  });
  return entries.length ? Object.fromEntries(entries) : undefined;
};

const normalizedOnActivateToDraft = (value: NormalizedOnActivate | undefined): CheckpointDraft["on_activate"] => {
  if (!value) return undefined;
  let authors: Partial<Record<Role, AuthorNoteDraft>> | undefined;
  if (value.authors_note) {
    const entries: Array<[Role, AuthorNoteDraft]> = [];
    Object.entries(value.authors_note).forEach(([role, note]) => {
      if (!note) return;
      entries.push([
        role,
        {
          text: note.text,
          position: note.position,
          interval: note.interval,
          depth: note.depth,
          role: note.role,
        },
      ]);
    });
    authors = entries.length ? Object.fromEntries(entries) : undefined;
  }
  const worldInfo = value.world_info
    ? {
      activate: [...value.world_info.activate],
      deactivate: [...value.world_info.deactivate],
    }
    : undefined;
  const preset = value.preset_overrides ? clone(value.preset_overrides) : undefined;
  const arbiterPreset = value.arbiter_preset ? clone(value.arbiter_preset) : undefined;
  const automations = value.automations ? [...value.automations] : undefined;
  return {
    authors_note: authors,
    world_info: worldInfo,
    preset_overrides: preset,
    arbiter_preset: arbiterPreset,
    automations,
  };
};

const normalizedCheckpointToDraft = (cp: NormalizedCheckpoint): CheckpointDraft => ({
  id: cp.id,
  name: cp.name,
  objective: cp.objective,
  on_activate: normalizedOnActivateToDraft(cp.onActivate),
});

const normalizedTriggerToDraft = (trigger: NormalizedTransitionTrigger): TransitionTriggerDraft => ({
  id: trigger.raw?.id ?? trigger.id,
  type: trigger.type,
  patterns: trigger.type === "regex" ? trigger.regexes.map(regexToString) : [],
  condition: trigger.condition,
  within_turns: trigger.withinTurns,
  label: trigger.raw?.label ?? trigger.label,
});

const normalizedTransitionToDraft = (edge: NormalizedTransition): TransitionDraft => ({
  id: edge.id,
  from: edge.from,
  to: edge.to,
  trigger: normalizedTriggerToDraft(edge.trigger),
  label: edge.label,
  description: edge.description,
});

const createEmptyDraft = (): StoryDraft => ({
  title: "Untitled Story",
  global_lorebook: "",
  base_preset: undefined,
  roles: undefined,
  on_start: undefined,
  checkpoints: [],
  transitions: [],
  start: "",
});

export const normalizedToDraft = (story: NormalizedStory | null | undefined): StoryDraft => {
  if (!story) return createEmptyDraft();
  const checkpoints = story.checkpoints.map((cp) => normalizedCheckpointToDraft(cp));
  return {
    title: story.title,
    global_lorebook: story.global_lorebook,
    base_preset: undefined,
    roles: story.roles ? (Object.fromEntries(Object.entries(story.roles).filter(([, v]) => typeof v === "string")) as Record<string, string>) : undefined,
    on_start: undefined,
    checkpoints,
    transitions: story.transitions.map((edge) => normalizedTransitionToDraft(edge)),
    start: story.startId ?? checkpoints[0]?.id ?? "",
  };
};

export const ensureOnActivate = (value: CheckpointDraft["on_activate"] | undefined): EnsuredOnActivate => ({
  authors_note: value?.authors_note ? { ...value.authors_note } : {},
  world_info: {
    activate: [...(value?.world_info?.activate ?? [])],
    deactivate: [...(value?.world_info?.deactivate ?? [])],
  },
  preset_overrides: value?.preset_overrides ? clone(value.preset_overrides) : undefined,
  arbiter_preset: value?.arbiter_preset ? clone(value.arbiter_preset) : undefined,
  automations: [...(value?.automations ?? [])],
});

export const cleanupOnActivate = (
  value: EnsuredOnActivate | undefined,
): CheckpointDraft["on_activate"] => {
  if (!value) return undefined;
  const authors = cleanupAuthorsNoteDrafts(value.authors_note);
  const activate = sanitizeList(value.world_info?.activate);
  const deactivate = sanitizeList(value.world_info?.deactivate);
  const worldInfo = activate.length || deactivate.length ? { activate, deactivate } : undefined;
  const preset = value.preset_overrides && Object.keys(value.preset_overrides).length
    ? value.preset_overrides
    : undefined;
  const arbiterPreset = value.arbiter_preset && Object.keys(value.arbiter_preset).length
    ? value.arbiter_preset
    : undefined;
  const automationsSource = Array.isArray(value.automations) ? value.automations : [];
  const seen = new Set<string>();
  const automations: string[] = [];
  for (const entry of automationsSource) {
    if (typeof entry !== "string") continue;
    if (!entry.trim()) continue;
    const dedupeKey = entry.trim();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    automations.push(entry);
  }
  const automationList = automations.length ? automations : undefined;
  if (!authors && !worldInfo && !preset && !arbiterPreset && !automationList) return undefined;
  return {
    authors_note: authors,
    world_info: worldInfo,
    preset_overrides: preset,
    arbiter_preset: arbiterPreset,
    automations: automationList,
  };
};

const draftAuthorsNoteToSchema = (
  value?: Partial<Record<Role, AuthorNoteDraft>>,
): Record<Role, AuthorNoteDefinition> | undefined => {
  const cleaned = cleanupAuthorsNoteDrafts(value);
  if (!cleaned) return undefined;
  const entries: Array<[Role, AuthorNoteDefinition]> = [];
  Object.entries(cleaned).forEach(([role, draft]) => {
    if (!draft) return;
    entries.push([role, convertDraftNoteToDefinition(draft)]);
  });
  return entries.length ? Object.fromEntries(entries) : undefined;
};

const draftOnActivateToSchema = (
  draft: CheckpointDraft["on_activate"] | undefined,
): Story["checkpoints"][number]["on_activate"] | undefined => {
  if (!draft) return undefined;
  const authors_note = draftAuthorsNoteToSchema(draft.authors_note);
  const world_info = draft.world_info
    ? {
      activate: sanitizeList(draft.world_info.activate),
      deactivate: sanitizeList(draft.world_info.deactivate),
    }
    : undefined;
  const preset_overrides = draft.preset_overrides && Object.keys(draft.preset_overrides).length
    ? draft.preset_overrides
    : undefined;
  const arbiter_preset = draft.arbiter_preset && Object.keys(draft.arbiter_preset).length
    ? draft.arbiter_preset
    : undefined;
  const automations = draft.automations ? Array.from(new Set(sanitizeList(draft.automations))) : undefined;
  if (!authors_note && !world_info && !preset_overrides && !arbiter_preset && !automations) return undefined;
  return {
    ...(authors_note ? { authors_note } : {}),
    ...(world_info ? { world_info } : {}),
    ...(preset_overrides ? { preset_overrides } : {}),
    ...(arbiter_preset ? { arbiter_preset } : {}),
    ...(automations ? { automations } : {}),
  };
};

const sanitizeTriggerDraft = (draft: TransitionTriggerDraft): TransitionTriggerDraft | null => {
  const type: TransitionTriggerDraft["type"] = draft.type === "timed" ? "timed" : "regex";
  const patterns = type === "regex" ? sanitizeList(draft.patterns) : [];
  const condition = type === "regex" ? (draft.condition ?? "").trim() : undefined;
  if (type === "regex") {
    if (!patterns.length) return null;
    if (!condition) return null;
  }
  const within = type === "timed" ? Math.max(1, Math.floor(draft.within_turns ?? 1)) : undefined;
  return {
    id: draft.id?.trim() || undefined,
    type,
    patterns,
    condition,
    within_turns: within,
    label: draft.label?.trim() || undefined,
  };
};

const triggerDraftToSchema = (draft: TransitionTriggerDraft): TransitionTrigger => {
  const sanitized = sanitizeTriggerDraft(draft);
  if (!sanitized) {
    throw new Error("Transition trigger is incomplete.");
  }
  if (sanitized.type === "regex") {
    return {
      id: sanitized.id,
      type: "regex",
      patterns: sanitized.patterns,
      condition: sanitized.condition ?? "",
      label: sanitized.label,
    };
  }
  return {
    id: sanitized.id,
    type: "timed",
    within_turns: sanitized.within_turns ?? 1,
    label: sanitized.label,
  };
};

export const draftToStoryInput = (draft: StoryDraft): Story => {
  const checkpoints: Story["checkpoints"] = draft.checkpoints.map((cp) => {
    const ensuredActivate = cp.on_activate ? ensureOnActivate(cp.on_activate) : undefined;
    const onActivate = cleanupOnActivate(ensuredActivate);
    const onActivateOut = draftOnActivateToSchema(onActivate);
    return {
      id: cp.id.trim(),
      name: cp.name.trim(),
      objective: cp.objective.trim(),
      ...(onActivateOut ? { on_activate: onActivateOut } : {}),
    };
  });

  const transitions: Transition[] = draft.transitions.map((edge) => {
    const trigger = triggerDraftToSchema(edge.trigger);
    return {
      id: edge.id.trim(),
      from: edge.from.trim(),
      to: edge.to.trim(),
      trigger,
      label: edge.label?.trim() || undefined,
      description: edge.description?.trim() || undefined,
    };
  });

  const roles = cleanupRoleMap(draft.roles as Record<Role, unknown> | undefined);

  const title = draft.title.trim();
  const lore = draft.global_lorebook.trim();
  const startCandidate = typeof draft.start === "string" ? draft.start.trim() : "";
  const start = startCandidate || checkpoints[0]?.id || undefined;
  return {
    title,
    global_lorebook: lore,
    base_preset: draft.base_preset,
    roles,
    on_start: draft.on_start,
    checkpoints,
    transitions,
    start,
  };
};

export const buildMermaid = (draft: StoryDraft): string => {
  const lines: string[] = ["graph TD"];
  draft.checkpoints.forEach((cp) => {
    const id = sanitizeMermaidId(cp.id);
    const label = escapeMermaidText(cp.name || cp.id);
    lines.push(`  ${id}["${label}"]`);
  });
  draft.transitions.forEach((edge) => {
    const from = sanitizeMermaidId(edge.from);
    const to = sanitizeMermaidId(edge.to);
    const label = edge.label ? `|${escapeMermaidText(edge.label)}|` : "";
    lines.push(`  ${from} -->${label} ${to}`);
  });
  return lines.join("\n");
};

export const generateUniqueId = (existing: Set<string>, prefix: string): string => {
  let counter = existing.size + 1;
  let candidate = "";
  while (!candidate || existing.has(candidate)) {
    candidate = `${prefix}-${counter}`;
    counter += 1;
    if (counter > existing.size + 1000) {
      candidate = `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
      if (!existing.has(candidate)) {
        break;
      }
    }
  }
  return candidate;
};

export const slugify = (value: string): string => {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || "story";
};
