import type {
  Story,
  Checkpoint,
  Transition,
  TransitionTrigger,
  Role,
  RolePresetOverrides,
  PresetOverrides,
  AuthorNoteDefinition,
  AuthorNotePosition,
  AuthorNoteRole,
  TalkControlDefaults,
  TalkControlConfig,
  TalkControlReply,
  TalkControlReplyContent,
  TalkControlTrigger,
} from "@utils/story-schema";
import type {
  NormalizedStory,
  NormalizedCheckpoint,
  NormalizedOnActivate,
  NormalizedTransition,
  NormalizedTransitionTrigger,
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
};

export type TransitionDraft = Omit<Transition, "trigger"> & {
  trigger: TransitionTriggerDraft;
};

export type TalkControlReplyContentDraft =
  | { kind: "static"; text: string }
  | { kind: "llm"; instruction: string };

export type TalkControlReplyDraft = {
  memberId: string;
  speakerId: string;
  enabled: boolean;
  trigger: TalkControlTrigger;
  probability: number;
  maxTriggers?: number;
  content: TalkControlReplyContentDraft;
};

export type TalkControlCheckpointDraft = {
  replies: TalkControlReplyDraft[];
};

export type TalkControlDraft = {
  defaults?: TalkControlDefaults;
  checkpoints: Record<string, TalkControlCheckpointDraft>;
};

const TALK_CONTROL_TRIGGER_LIST: TalkControlTrigger[] = ["afterSpeak", "beforeArbiter", "afterArbiter", "onEnter"];

export type StoryDraft = Omit<Story, "checkpoints" | "transitions" | "talkControl"> & {
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
  const lines = value.split(/\r?\n/);
  const result: string[] = [];
  for (const line of lines) {
    if (!line) continue;
    if (!line.trim()) continue;
    result.push(line);
  }
  return result;
};

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
      replies: entry.replies.map((reply) => ({
        memberId: reply.memberId,
        speakerId: reply.speakerId,
        enabled: reply.enabled,
        trigger: reply.trigger,
        probability: reply.probability,
        maxTriggers: reply.maxTriggers,
        content: reply.content.kind === "static"
          ? { kind: "static" as const, text: reply.content.text ?? "" }
          : { kind: "llm" as const, instruction: reply.content.instruction ?? "" },
      })),
    };
  }
  const defaults = config.defaults ? { ...config.defaults } : undefined;
  return {
    ...(defaults ? { defaults } : {}),
    checkpoints,
  };
};

const createEmptyDraft = (): StoryDraft => ({
  title: "Untitled Story",
  description: "",
  global_lorebook: "",
  roles: undefined,
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
    roles: story.roles ? (Object.fromEntries(Object.entries(story.roles).filter(([, v]) => typeof v === "string")) as Record<string, string>) : undefined,
    checkpoints,
    transitions: story.transitions.map((edge) => normalizedTransitionToDraft(edge)),
    start: story.startId ?? checkpoints[0]?.id ?? "",
    talkControl: normalizedTalkControlToDraft(story),
  };
};

const sanitizeTalkControlReplyContent = (content: TalkControlReplyContentDraft | undefined): TalkControlReplyContent | null => {
  if (!content) return null;
  if (content.kind === "static") {
    const text = typeof content.text === "string" ? content.text.trim() : "";
    if (!text) return null;
    return { kind: "static", text };
  } else if (content.kind === "llm") {
    const instruction = typeof content.instruction === "string" ? content.instruction.trim() : "";
    if (!instruction) return null;
    return { kind: "llm", instruction };
  }
  return null;
};

const sanitizeTalkControlReply = (reply: TalkControlReplyDraft | undefined): TalkControlReply | null => {
  if (!reply) return null;

  const memberId = typeof reply.memberId === "string" ? reply.memberId.trim() : "";
  if (!memberId) return null;

  if (!TALK_CONTROL_TRIGGER_LIST.includes(reply.trigger)) return null;

  const speakerId = typeof reply.speakerId === "string" ? reply.speakerId.trim() : "";

  const content = sanitizeTalkControlReplyContent(reply.content);
  if (!content) return null;

  const probability = typeof reply.probability === "number" && Number.isFinite(reply.probability)
    ? Math.round(reply.probability)
    : 100;

  const maxTriggers = reply.maxTriggers !== undefined && typeof reply.maxTriggers === "number" && Number.isFinite(reply.maxTriggers) && reply.maxTriggers >= 1
    ? Math.floor(reply.maxTriggers)
    : undefined;

  return {
    memberId,
    speakerId,
    enabled: reply.enabled !== undefined ? Boolean(reply.enabled) : true,
    trigger: reply.trigger,
    probability,
    maxTriggers,
    content,
  };
};

const cleanupTalkControlDraft = (input?: TalkControlDraft): TalkControlConfig | undefined => {
  if (!input) return undefined;
  const checkpointsEntries: Array<[string, { replies: TalkControlReply[] }]> = [];
  const entries = Object.entries(input.checkpoints ?? {});
  entries.forEach(([checkpointId, checkpointDraft]) => {
    const key = checkpointId.trim();
    if (!key) return;
    const replies = (checkpointDraft?.replies ?? [])
      .map((reply) => sanitizeTalkControlReply(reply))
      .filter((reply): reply is TalkControlReply => Boolean(reply));
    if (!replies.length) return;
    checkpointsEntries.push([key, { replies }]);
  });
  const checkpoints = Object.fromEntries(checkpointsEntries);
  const defaults = input.defaults;
  if (!Object.keys(checkpoints).length && !defaults) {
    return undefined;
  }
  return {
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
    };
  }
  return {
    id: sanitized.id,
    type: "timed",
    within_turns: sanitized.within_turns ?? 1,
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
    roles,
    checkpoints,
    transitions,
    start,
    ...(talkControl ? { talkControl } : {}),
  };
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

