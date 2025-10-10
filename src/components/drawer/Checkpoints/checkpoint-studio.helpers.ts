import type { Story, Checkpoint, Transition, Role, RolePresetOverrides } from "@utils/story-schema";
import type { NormalizedStory, NormalizedCheckpoint, NormalizedOnActivate } from "@utils/story-validator";

export type LayoutName = "breadthfirst" | "cose" | "grid" | "dagre";

export type CheckpointDraft = Omit<Checkpoint, "triggers" | "on_activate"> & {
  triggers: {
    win: string[];
    fail?: string[];
  };
  on_activate?: {
    authors_note?: Partial<Record<Role, string>>;
    world_info?: { activate: string[]; deactivate: string[] };
    preset_overrides?: RolePresetOverrides;
  };
};

export type StoryDraft = Omit<Story, "checkpoints"> & {
  checkpoints: CheckpointDraft[];
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

export const joinCsv = (values?: string[]): string => (values && values.length ? values.join(", ") : "");

const escapeMermaidText = (value: string): string => value.replace(/"/g, "\\\"");

const sanitizeMermaidId = (value: string): string => value.replace(/[^a-zA-Z0-9_]/g, "_");

const cleanupAuthorsNote = (value?: Partial<Record<Role, string>>): Partial<Record<Role, string>> | undefined => {
  if (!value) return undefined;
  const result: Partial<Record<Role, string>> = {};
  (Object.entries(value) as [Role, string | undefined][]).forEach(([role, maybeText]) => {
    const trimmed = (maybeText ?? '').trim();
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
  triggers: {
    win: cp.winTriggers.map(regexToString),
    ...(cp.failTriggers && cp.failTriggers.length ? { fail: cp.failTriggers.map(regexToString) } : {}),
  },
  on_activate: normalizedOnActivateToDraft(cp.onActivate),
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
    roles: story.roles ? clone(story.roles) : undefined,
    on_start: undefined,
    checkpoints,
    transitions: story.transitions.map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      outcome: edge.outcome,
      label: edge.label,
      description: edge.description,
    })),
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

export const draftToStoryInput = (draft: StoryDraft): Story => {
  const checkpoints: Story["checkpoints"] = draft.checkpoints.map((cp) => {
    const win = sanitizeList(cp.triggers.win);
    const fail = sanitizeList(cp.triggers.fail);
    const ensuredActivate = cp.on_activate ? ensureOnActivate(cp.on_activate) : undefined;
    const onActivate = cleanupOnActivate(ensuredActivate);
    return {
      id: cp.id.trim(),
      name: cp.name.trim(),
      objective: cp.objective.trim(),
      triggers: {
        win: win.length ? win : cp.triggers.win,
        ...(fail.length ? { fail } : {}),
      },
      ...(onActivate ? { on_activate: onActivate } : {}),
    };
  });
  const transitions: Transition[] = draft.transitions.map((edge) => ({
    id: edge.id.trim(),
    from: edge.from.trim(),
    to: edge.to.trim(),
    outcome: edge.outcome,
    label: edge.label?.trim() || undefined,
    description: edge.description?.trim() || undefined,
  }));
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
    const objective = escapeMermaidText(cp.objective);
    lines.push(`  ${id}[\"${label}\\n${objective}\"]`);
  });
  draft.transitions.forEach((edge) => {
    const from = sanitizeMermaidId(edge.from);
    const to = sanitizeMermaidId(edge.to);
    const label = edge.label ? `|${escapeMermaidText(edge.label)}|` : "";
    const arrow = edge.outcome === "fail" ? "-.->" : "-->";
    lines.push(`  ${from} ${arrow}${label} ${to}`);
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
