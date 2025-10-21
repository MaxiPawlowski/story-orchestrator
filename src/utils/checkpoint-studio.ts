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
  TalkControlDefaults,
  TalkControlConfig,
  TalkControlMember,
  TalkControlAutoReply,
  TalkControlTrigger,
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

export type TalkControlAutoReplyDraft =
  | { kind: "static"; weight: number; text: string }
  | { kind: "llm"; weight: number; instruction: string };

export type TalkControlProbabilitiesDraft = Partial<Record<TalkControlTrigger, number>>;

export type TalkControlMemberDraft = {
  memberId: string;
  enabled: boolean;
  probabilities: TalkControlProbabilitiesDraft;
  cooldownTurns?: number;
  maxPerTurn?: number;
  maxCharsPerAuto?: number;
  sendAsQuiet?: boolean;
  forceSpeaker?: boolean;
  autoReplies: TalkControlAutoReplyDraft[];
};

export type TalkControlCheckpointDraft = {
  members: TalkControlMemberDraft[];
};

export type TalkControlDraft = {
  enabled: boolean;
  defaults?: TalkControlDefaults;
  checkpoints: Record<string, TalkControlCheckpointDraft>;
};

const TALK_CONTROL_TRIGGER_LIST: TalkControlTrigger[] = ["afterSpeak", "beforeArbiter", "afterArbiter", "onEnter", "onExit"];

export type StoryDraft = Omit<Story, "checkpoints" | "transitions" | "talkControl" | "talk_control"> & {
  checkpoints: CheckpointDraft[];
  transitions: TransitionDraft[];
  talkControl?: TalkControlDraft;
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

const normalizedTalkControlToDraft = (story: NormalizedStory | null | undefined): TalkControlDraft | undefined => {
  const config = story?.talkControl;
  if (!config) return undefined;
  const checkpoints: Record<string, TalkControlCheckpointDraft> = {};
  for (const [checkpointId, entry] of config.checkpoints.entries()) {
    checkpoints[checkpointId] = {
      members: entry.members.map((member) => ({
        memberId: member.memberId,
        enabled: member.enabled,
        probabilities: { ...member.probabilities },
        cooldownTurns: member.cooldownTurns,
        maxPerTurn: member.maxPerTurn,
        maxCharsPerAuto: member.maxCharsPerAuto,
        sendAsQuiet: member.sendAsQuiet,
        forceSpeaker: member.forceSpeaker,
        autoReplies: member.autoReplies.map((reply) => ({ ...reply })),
      })),
    };
  }
  const defaults = config.defaults ? { ...config.defaults } : undefined;
  return {
    enabled: config.enabled,
    ...(defaults ? { defaults } : {}),
    checkpoints,
  };
};

const createEmptyDraft = (): StoryDraft => ({
  title: "Untitled Story",
  description: "",
  global_lorebook: "",
  base_preset: undefined,
  roles: undefined,
  on_start: undefined,
  checkpoints: [],
  transitions: [],
  start: "",
  talkControl: undefined,
});

export const normalizedToDraft = (story: NormalizedStory | null | undefined): StoryDraft => {
  if (!story) return createEmptyDraft();
  const checkpoints = story.checkpoints.map((cp) => normalizedCheckpointToDraft(cp));
  return {
    title: story.title,
    description: story.description ?? "",
    global_lorebook: story.global_lorebook,
    base_preset: undefined,
    roles: story.roles ? (Object.fromEntries(Object.entries(story.roles).filter(([, v]) => typeof v === "string")) as Record<string, string>) : undefined,
    on_start: undefined,
    checkpoints,
    transitions: story.transitions.map((edge) => normalizedTransitionToDraft(edge)),
    start: story.startId ?? checkpoints[0]?.id ?? "",
    talkControl: normalizedTalkControlToDraft(story),
  };
};

const clampTalkControlInt = (value: unknown, min: number, max?: number): number | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  const num = Number(value);
  if (!Number.isFinite(num)) return undefined;
  let normalized = Math.floor(num);
  if (!Number.isFinite(normalized)) return undefined;
  if (normalized < min) normalized = min;
  if (typeof max === "number" && Number.isFinite(max)) normalized = Math.min(normalized, max);
  return normalized;
};

const sanitizeTalkControlDefaults = (defaults?: TalkControlDefaults): TalkControlDefaults | undefined => {
  if (!defaults) return undefined;
  const result: TalkControlDefaults = {};
  const cooldown = clampTalkControlInt(defaults.cooldownTurns, 0);
  if (cooldown !== undefined) result.cooldownTurns = cooldown;
  const maxPerTurn = clampTalkControlInt(defaults.maxPerTurn, 1);
  if (maxPerTurn !== undefined) result.maxPerTurn = maxPerTurn;
  const maxChars = clampTalkControlInt(defaults.maxCharsPerAuto, 1);
  if (maxChars !== undefined) result.maxCharsPerAuto = maxChars;
  if (typeof defaults.sendAsQuiet === "boolean") result.sendAsQuiet = defaults.sendAsQuiet;
  if (typeof defaults.forceSpeaker === "boolean") result.forceSpeaker = defaults.forceSpeaker;
  return Object.keys(result).length ? result : undefined;
};

const sanitizeTalkControlProbabilities = (probabilities: TalkControlProbabilitiesDraft | undefined): TalkControlMember["probabilities"] => {
  const result: TalkControlMember["probabilities"] = {};
  if (!probabilities) return result;
  TALK_CONTROL_TRIGGER_LIST.forEach((trigger) => {
    const raw = probabilities[trigger];
    if (raw === undefined || raw === null) return;
    const num = Number(raw);
    if (!Number.isFinite(num)) return;
    const rounded = Math.round(num);
    if (rounded <= 0) return;
    result[trigger] = Math.min(100, Math.max(1, rounded));
  });
  return result;
};

const sanitizeTalkControlAutoReplies = (replies: TalkControlAutoReplyDraft[] | undefined): TalkControlAutoReply[] => {
  if (!replies || !replies.length) return [];
  const result: TalkControlAutoReply[] = [];
  replies.forEach((reply) => {
    if (!reply) return;
    const weight = clampTalkControlInt(reply.weight, 1) ?? 1;
    if (reply.kind === "static") {
      const text = typeof reply.text === "string" ? reply.text.trim() : "";
      if (!text) return;
      result.push({ kind: "static", weight, text });
    } else if (reply.kind === "llm") {
      const instruction = typeof reply.instruction === "string" ? reply.instruction.trim() : "";
      if (!instruction) return;
      result.push({ kind: "llm", weight, instruction });
    }
  });
  return result;
};

const sanitizeTalkControlMember = (member: TalkControlMemberDraft | undefined): TalkControlMember | null => {
  if (!member) return null;
  const memberId = typeof member.memberId === "string" ? member.memberId.trim() : "";
  if (!memberId) return null;
  const autoReplies = sanitizeTalkControlAutoReplies(member.autoReplies);
  if (!autoReplies.length) return null;
  const probabilities = sanitizeTalkControlProbabilities(member.probabilities);
  const result: TalkControlMember = {
    memberId,
    enabled: member.enabled !== undefined ? Boolean(member.enabled) : true,
    probabilities,
    autoReplies,
  };
  const cooldown = clampTalkControlInt(member.cooldownTurns, 0);
  if (cooldown !== undefined) result.cooldownTurns = cooldown;
  const maxPerTurn = clampTalkControlInt(member.maxPerTurn, 1);
  if (maxPerTurn !== undefined) result.maxPerTurn = maxPerTurn;
  const maxChars = clampTalkControlInt(member.maxCharsPerAuto, 1);
  if (maxChars !== undefined) result.maxCharsPerAuto = maxChars;
  if (typeof member.sendAsQuiet === "boolean") result.sendAsQuiet = member.sendAsQuiet;
  if (typeof member.forceSpeaker === "boolean") result.forceSpeaker = member.forceSpeaker;
  return result;
};

const cleanupTalkControlDraft = (input?: TalkControlDraft): TalkControlConfig | undefined => {
  if (!input) return undefined;
  const checkpointsEntries: Array<[string, { members: TalkControlMember[] }]> = [];
  const entries = Object.entries(input.checkpoints ?? {});
  entries.forEach(([checkpointId, checkpointDraft]) => {
    const key = checkpointId.trim();
    if (!key) return;
    const members = (checkpointDraft?.members ?? [])
      .map((member) => sanitizeTalkControlMember(member))
      .filter((member): member is TalkControlMember => Boolean(member));
    if (!members.length) return;
    checkpointsEntries.push([key, { members }]);
  });
  const checkpoints = Object.fromEntries(checkpointsEntries);
  const defaults = sanitizeTalkControlDefaults(input.defaults);
  const enabled = Boolean(input.enabled);
  if (!Object.keys(checkpoints).length && !enabled && !defaults) {
    return undefined;
  }
  return {
    enabled,
    checkpoints,
    ...(defaults ? { defaults } : {}),
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
  const description = typeof draft.description === "string" ? draft.description.trim() : "";
  const lore = draft.global_lorebook.trim();
  const startCandidate = typeof draft.start === "string" ? draft.start.trim() : "";
  const start = startCandidate || checkpoints[0]?.id || undefined;
  const talkControl = cleanupTalkControlDraft(draft.talkControl);
  return {
    title,
    ...(description ? { description } : {}),
    global_lorebook: lore,
    base_preset: draft.base_preset,
    roles,
    on_start: draft.on_start,
    checkpoints,
    transitions,
    start,
    ...(talkControl ? { talkControl } : {}),
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

