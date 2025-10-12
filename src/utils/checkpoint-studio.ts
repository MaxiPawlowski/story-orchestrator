import type { Story, Checkpoint, Transition, TransitionTrigger, Role, RolePresetOverrides } from "@utils/story-schema";
import type { NormalizedStory, NormalizedCheckpoint, NormalizedOnActivate, NormalizedTransition, NormalizedTransitionTrigger } from "@utils/story-validator";

export type LayoutName = "breadthfirst" | "cose" | "grid" | "dagre";

export type CheckpointDraft = Omit<Checkpoint, "on_activate"> & {
  on_activate?: {
    authors_note?: Partial<Record<Role, string>>;
    world_info?: { activate: string[]; deactivate: string[] };
    preset_overrides?: RolePresetOverrides;
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
  authors_note: Partial<Record<Role, string>>;
  world_info: { activate: string[]; deactivate: string[] };
  preset_overrides?: RolePresetOverrides;
};

export const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

export const regexToString = (re: RegExp): string => `/${re.source}/${re.flags}`;

export const sanitizeList = (values: string[] | undefined): string[] =>
  (values ?? []).map((entry) => entry.trim()).filter(Boolean);

export const splitLines = (value: string): string[] =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

export const splitCsv = (value: string): string[] =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const escapeMermaidText = (value: string): string => value.replace(/"/g, "\\\"");

const sanitizeMermaidId = (value: string): string => value.replace(/[^a-zA-Z0-9_]/g, "_");

const cleanupAuthorsNote = (value?: Partial<Record<Role, string>>): Partial<Record<Role, string>> | undefined => {
  if (!value) return undefined;
  const result: Partial<Record<Role, string>> = {};
  (Object.entries(value) as [Role, string | undefined][]).forEach(([role, maybeText]) => {
    const trimmed = (maybeText ?? "").trim();
    if (trimmed) result[role] = trimmed;
  });
  return Object.keys(result).length ? result : undefined;
};

const normalizedOnActivateToDraft = (value: NormalizedOnActivate | undefined): CheckpointDraft["on_activate"] => {
  if (!value) return undefined;
  const authors = value.authors_note ? { ...value.authors_note } : undefined;
  const worldInfo = value.world_info
    ? {
      activate: [...value.world_info.activate],
      deactivate: [...value.world_info.deactivate],
    }
    : undefined;
  const preset = value.preset_overrides ? clone(value.preset_overrides) : undefined;
  return {
    authors_note: authors,
    world_info: worldInfo,
    preset_overrides: preset,
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
});

export const cleanupOnActivate = (
  value: EnsuredOnActivate | undefined,
): CheckpointDraft["on_activate"] => {
  if (!value) return undefined;
  const authors = cleanupAuthorsNote(value.authors_note);
  const activate = sanitizeList(value.world_info?.activate);
  const deactivate = sanitizeList(value.world_info?.deactivate);
  const worldInfo = activate.length || deactivate.length ? { activate, deactivate } : undefined;
  const preset = value.preset_overrides && Object.keys(value.preset_overrides).length
    ? value.preset_overrides
    : undefined;
  if (!authors && !worldInfo && !preset) return undefined;
  return {
    authors_note: authors,
    world_info: worldInfo,
    preset_overrides: preset,
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
    const onActivateOut = onActivate ? {
      ...onActivate,
      ...(onActivate.authors_note ? { authors_note: onActivate.authors_note as unknown as Record<string, string> } : {}),
    } : undefined;
    return {
      id: cp.id.trim(),
      name: cp.name.trim(),
      objective: cp.objective.trim(),
      ...(onActivateOut ? { on_activate: onActivateOut as unknown as Story["checkpoints"][number]["on_activate"] } : {}),
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

  const roles = draft.roles ? cleanupAuthorsNote(draft.roles as Partial<Record<Role, string>>) : undefined;

  const title = draft.title.trim();
  const lore = draft.global_lorebook.trim();
  const startCandidate = typeof draft.start === "string" ? draft.start.trim() : "";
  const start = startCandidate || checkpoints[0]?.id || undefined;
  return {
    title,
    global_lorebook: lore,
    base_preset: draft.base_preset,
    roles: roles as Story["roles"],
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
