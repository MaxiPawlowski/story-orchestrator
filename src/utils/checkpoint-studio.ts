import {
  TALK_CONTROL_TRIGGERS,
  type Story,
  type InlineTransition,
  type TransitionTrigger,
  type Role,
  type RolePresetOverrides,
  type PresetOverrides,
  type AuthorNoteDefinition,
  type AuthorNotePosition,
  type AuthorNoteRole,
  type TalkControlReply,
  type TalkControlReplyContent,
  type TalkControlTrigger,
  type Defaults,
} from "@utils/story-schema";
import type {
  NormalizedStory,
  NormalizedCheckpoint,
  NormalizedTransition,
  NormalizedTransitionTrigger,
} from "@utils/story-validator";
import { cloneStructured, trimStringList, trimStringRecord } from "@utils/dataHelpers";

export type LayoutName = "breadthfirst" | "cose" | "grid" | "dagre";

export type AuthorNoteDraft = {
  text: string;
  position?: AuthorNotePosition;
  interval?: number;
  depth?: number;
  role?: AuthorNoteRole;
};

export type DefaultsDraft = {
  author_note?: Omit<AuthorNoteDraft, "text">;
  presets?: RolePresetOverrides;
};

export type TransitionTriggerDraft = {
  id?: string;
  type: "regex" | "timed";
  patterns?: string[];
  condition?: string;
  within_turns?: number;
};

// No `from` field — inferred from parent checkpoint
export type TransitionDraft = {
  id?: string;
  to: string;
  trigger: TransitionTriggerDraft;
  label?: string;
  description?: string;
  _stableId: string;
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


// Flat checkpoint draft — no on_activate wrapper, colocated transitions + talk_control
export type CheckpointDraft = {
  id: string;
  name: string;
  objective: string;
  authors_note?: Partial<Record<Role, AuthorNoteDraft>>;
  world_info?: string[];
  world_info_deactivate?: string[];
  preset_overrides?: RolePresetOverrides;
  arbiter_preset?: PresetOverrides;
  automations?: string[];
  transitions?: TransitionDraft[];
  talk_control?: TalkControlReplyDraft[];
  _isStub?: true;
  _stubName?: string;
};

export type StoryDraft = {
  title: string;
  description?: string;
  global_lorebook: string;
  roles?: Record<string, string>;
  defaults?: DefaultsDraft;
  start?: string;
  checkpoints: CheckpointDraft[];
};

export type StudioDiagnostic = {
  ok: boolean;
  name: string;
  detail: string;
};

export type StudioDraftValidationResult =
  | {
    ok: true;
    stage: "success";
    story: Story;
    normalized: NormalizedStory;
    diagnostics: StudioDiagnostic[];
  }
  | {
    ok: false;
    stage: "conversion" | "validation";
    error: string;
    diagnostics: StudioDiagnostic[];
  };

type StudioStoryValidator =
  (input: unknown) => { ok: true; story: NormalizedStory } | { ok: false; errors: string[] };

export const regexToString = (re: RegExp): string => `/${re.source}/${re.flags}`;

export const splitLines = (value: string): string[] =>
  value.split(/\r?\n/).filter((line) => line.trim());

const cleanupAuthorsNoteDrafts = (
  value?: Partial<Record<Role, AuthorNoteDraft>>,
): Record<Role, AuthorNoteDefinition> | undefined => {
  if (!value) return undefined;
  const result: Partial<Record<Role, AuthorNoteDefinition>> = {};
  (Object.entries(value) as [Role, AuthorNoteDraft | undefined][]).forEach(([role, maybeDraft]) => {
    const trimmed = (maybeDraft?.text ?? "").trim();
    if (!trimmed) return;
    const cleaned: AuthorNoteDefinition = { text: trimmed };
    if (maybeDraft?.position) cleaned.position = maybeDraft.position;
    if (maybeDraft?.interval !== undefined && Number.isFinite(maybeDraft.interval)) cleaned.interval = Number(maybeDraft.interval);
    if (maybeDraft?.depth !== undefined && Number.isFinite(maybeDraft.depth)) cleaned.depth = Number(maybeDraft.depth);
    if (maybeDraft?.role) cleaned.role = maybeDraft.role;
    result[role] = cleaned;
  });
  return Object.keys(result).length ? result as Record<Role, AuthorNoteDefinition> : undefined;
};

const cleanupRoleMap = (value?: Record<Role, unknown>): Record<Role, string> | undefined => {
  const cleaned = trimStringRecord(value);
  return cleaned ? { ...cleaned } as Record<Role, string> : undefined;
};

const normalizedCheckpointToDraft = (
  cp: NormalizedCheckpoint,
  outgoingTransitions: NormalizedTransition[],
): CheckpointDraft => {
  let authors: Partial<Record<Role, AuthorNoteDraft>> | undefined;
  if (cp.authors_note) {
    const entries: Array<[Role, AuthorNoteDraft]> = [];
    Object.entries(cp.authors_note).forEach(([role, note]) => {
      if (!note) return;
      entries.push([role, { text: note.text, position: note.position, interval: note.interval, depth: note.depth, role: note.role }]);
    });
    authors = entries.length ? Object.fromEntries(entries) : undefined;
  }

  const transitions: TransitionDraft[] = outgoingTransitions.map((edge) => ({
    id: edge.id,
    to: edge.to,
    trigger: normalizedTriggerToDraft(edge.trigger),
    label: edge.label,
    description: edge.description,
    _stableId: `stable-${edge.id}-${edge.from}-${edge.to}`,
  }));

  let talkControl: TalkControlReplyDraft[] | undefined;
  if (cp.talkControl?.replies.length) {
    talkControl = cp.talkControl.replies.map((reply) => ({
      memberId: reply.memberId,
      speakerId: reply.speakerId,
      enabled: reply.enabled,
      trigger: reply.trigger,
      probability: reply.probability,
      maxTriggers: reply.maxTriggers,
      content: reply.content.kind === "static"
        ? { kind: "static" as const, text: reply.content.text ?? "" }
        : { kind: "llm" as const, instruction: reply.content.instruction ?? "" },
    }));
  }

  return {
    id: cp.id,
    name: cp.name,
    objective: cp.objective,
    authors_note: authors,
    world_info: cp.world_info?.activate?.length ? [...cp.world_info.activate] : undefined,
    preset_overrides: cp.preset_overrides ? cloneStructured(cp.preset_overrides) : undefined,
    arbiter_preset: cp.arbiter_preset ? cloneStructured(cp.arbiter_preset) : undefined,
    automations: cp.automations ? [...cp.automations] : undefined,
    transitions: transitions.length ? transitions : undefined,
    talk_control: talkControl,
  };
};

const normalizedTriggerToDraft = (trigger: NormalizedTransitionTrigger): TransitionTriggerDraft => ({
  id: trigger.raw?.id ?? trigger.id,
  type: trigger.type,
  patterns: trigger.type === "regex" ? trigger.regexes.map(regexToString) : [],
  condition: trigger.condition,
  within_turns: trigger.withinTurns,
});

const createEmptyDraft = (): StoryDraft => ({
  title: "Untitled Story",
  description: "",
  global_lorebook: "",
  roles: undefined,
  defaults: undefined,
  start: "",
  checkpoints: [],
});

export const normalizedToDraft = (story: NormalizedStory | null | undefined): StoryDraft => {
  if (!story) return createEmptyDraft();

  const transitionsByFrom = new Map<string, NormalizedTransition[]>();
  for (const edge of story.transitions) {
    const list = transitionsByFrom.get(edge.from) ?? [];
    list.push(edge);
    transitionsByFrom.set(edge.from, list);
  }

  const checkpoints = story.checkpoints.map((cp) =>
    normalizedCheckpointToDraft(cp, transitionsByFrom.get(cp.id) ?? []),
  );

  return {
    title: story.title,
    description: story.description ?? "",
    global_lorebook: story.global_lorebook,
    roles: story.roles
      ? (Object.fromEntries(Object.entries(story.roles).filter(([, v]) => typeof v === "string")) as Record<string, string>)
      : undefined,
    defaults: story.defaults
      ? {
        author_note: story.defaults.author_note ? cloneStructured(story.defaults.author_note) : undefined,
        presets: story.defaults.presets ? cloneStructured(story.defaults.presets) : undefined,
      }
      : undefined,
    start: story.startId ?? checkpoints[0]?.id ?? "",
    checkpoints,
  };
};

const sanitizeTalkControlReplyContent = (content: TalkControlReplyContentDraft | undefined): TalkControlReplyContent | null => {
  if (!content) return null;
  if (content.kind === "static") {
    const text = typeof content.text === "string" ? content.text.trim() : "";
    return text ? { kind: "static", text } : null;
  }
  if (content.kind === "llm") {
    const instruction = typeof content.instruction === "string" ? content.instruction.trim() : "";
    return instruction ? { kind: "llm", instruction } : null;
  }
  return null;
};

const sanitizeTalkControlReply = (reply: TalkControlReplyDraft | undefined): TalkControlReply | null => {
  if (!reply) return null;
  const memberId = typeof reply.memberId === "string" ? reply.memberId.trim() : "";
  if (!memberId) return null;
  if (!TALK_CONTROL_TRIGGERS.includes(reply.trigger)) return null;
  const content = sanitizeTalkControlReplyContent(reply.content);
  if (!content) return null;
  const speakerId = typeof reply.speakerId === "string" ? reply.speakerId.trim() : "";
  const probability = typeof reply.probability === "number" && Number.isFinite(reply.probability) ? Math.round(reply.probability) : 100;
  const maxTriggers = typeof reply.maxTriggers === "number" && Number.isFinite(reply.maxTriggers) && reply.maxTriggers >= 1
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

const sanitizeTriggerDraft = (draft: TransitionTriggerDraft): TransitionTriggerDraft | null => {
  const type: TransitionTriggerDraft["type"] = draft.type === "timed" ? "timed" : "regex";
  if (type === "regex") {
    const patterns = trimStringList(draft.patterns);
    const condition = (draft.condition ?? "").trim();
    if (!patterns.length || !condition) return null;
    return { id: draft.id?.trim() || undefined, type, patterns, condition };
  }
  const within = Math.max(1, Math.floor(draft.within_turns ?? 1));
  return { id: draft.id?.trim() || undefined, type, within_turns: within };
};

const triggerDraftToSchema = (draft: TransitionTriggerDraft): TransitionTrigger => {
  const sanitized = sanitizeTriggerDraft(draft);
  if (!sanitized) throw new Error("Transition trigger is incomplete.");
  if (sanitized.type === "regex") {
    return { id: sanitized.id, type: "regex", patterns: sanitized.patterns ?? [], condition: sanitized.condition ?? "" };
  }
  return { id: sanitized.id, type: "timed", within_turns: sanitized.within_turns ?? 1 };
};

export const draftToStoryInput = (draft: StoryDraft): Story => {
  const checkpoints: Story["checkpoints"] = draft.checkpoints
    .filter((cp) => cp.id?.trim())
    .map((cp) => {
      const authors_note = cleanupAuthorsNoteDrafts(cp.authors_note);
      const world_info = trimStringList(cp.world_info);
      const world_info_deactivate = trimStringList(cp.world_info_deactivate);
      const preset_overrides = cp.preset_overrides && Object.keys(cp.preset_overrides).length ? cp.preset_overrides : undefined;
      const arbiter_preset = cp.arbiter_preset && Object.keys(cp.arbiter_preset).length ? cp.arbiter_preset : undefined;
      const automations = cp.automations ? Array.from(new Set(trimStringList(cp.automations))) : undefined;

      const validTos = new Set(draft.checkpoints.filter(c => c.id?.trim()).map(c => c.id.trim()));
      const transitions: InlineTransition[] = (cp.transitions ?? [])
        .filter((t) => t.to?.trim() && validTos.has(t.to.trim()))
        .map((t) => {
          const trigger = triggerDraftToSchema(t.trigger);
          return {
            id: t.id?.trim() || undefined,
            to: t.to.trim(),
            trigger,
            label: t.label?.trim() || undefined,
            description: t.description?.trim() || undefined,
          };
        });

      const talk_control: TalkControlReply[] = (cp.talk_control ?? [])
        .map((r) => sanitizeTalkControlReply(r))
        .filter((r): r is TalkControlReply => Boolean(r));

      return {
        id: cp.id.trim(),
        name: cp.name.trim(),
        objective: cp.objective.trim(),
        ...(authors_note ? { authors_note } : {}),
        ...(world_info.length ? { world_info } : {}),
        ...(world_info_deactivate.length ? { world_info_deactivate } : {}),
        ...(preset_overrides ? { preset_overrides } : {}),
        ...(arbiter_preset ? { arbiter_preset } : {}),
        ...(automations?.length ? { automations } : {}),
        ...(transitions.length ? { transitions } : {}),
        ...(talk_control.length ? { talk_control } : {}),
      };
    });

  const roles = cleanupRoleMap(draft.roles as Record<Role, unknown> | undefined);
  const title = draft.title.trim();
  const description = typeof draft.description === "string" ? draft.description.trim() : "";
  const lore = draft.global_lorebook.trim();
  const startCandidate = typeof draft.start === "string" ? draft.start.trim() : "";
  const start = startCandidate || checkpoints[0]?.id || undefined;

  const defaults: Defaults | undefined = (() => {
    const d = draft.defaults;
    if (!d) return undefined;
    const author_note = d.author_note && Object.keys(d.author_note).length ? d.author_note : undefined;
    const presets = d.presets && Object.keys(d.presets).length ? d.presets : undefined;
    return author_note || presets ? { ...(author_note ? { author_note } : {}), ...(presets ? { presets } : {}) } : undefined;
  })();

  return {
    title,
    ...(description ? { description } : {}),
    global_lorebook: lore,
    ...(roles ? { roles } : {}),
    ...(defaults ? { defaults } : {}),
    ...(start ? { start } : {}),
    checkpoints,
  };
};

export const safeDraftToStoryInput = (draft: StoryDraft): { ok: true; story: Story } | { ok: false; error: string } => {
  try {
    const story = draftToStoryInput(draft);
    return { ok: true, story };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
};

export const validateStudioDraft = (
  draft: StoryDraft,
  validate: StudioStoryValidator,
): StudioDraftValidationResult => {
  const conversionResult = safeDraftToStoryInput(draft);
  if (!conversionResult.ok) {
    return {
      ok: false,
      stage: "conversion",
      error: conversionResult.error,
      diagnostics: [{ ok: false, name: "Story data conversion", detail: conversionResult.error }],
    };
  }

  const validation = validate(conversionResult.story);
  if (!validation.ok) {
    const error = validation.errors.join("; ");
    return {
      ok: false,
      stage: "validation",
      error,
      diagnostics: [{ ok: false, name: "Schema validation", detail: error }],
    };
  }

  return {
    ok: true,
    stage: "success",
    story: conversionResult.story,
    normalized: validation.story,
    diagnostics: [],
  };
};

export const updateCheckpointDraft = (
  draft: StoryDraft,
  id: string,
  updater: (checkpoint: CheckpointDraft) => CheckpointDraft,
): StoryDraft => {
  const index = draft.checkpoints.findIndex((cp) => cp.id === id);
  if (index < 0) return draft;
  return {
    ...draft,
    checkpoints: draft.checkpoints.map((cp, idx) => (idx === index ? updater(cp) : cp)),
  };
};

export const renameCheckpointDraftId = (draft: StoryDraft, id: string, nextId: string): StoryDraft => ({
  ...draft,
  checkpoints: draft.checkpoints.map((cp) => {
    if (cp.id === id) return { ...cp, id: nextId };
    if (!cp.transitions?.length) return cp;
    return {
      ...cp,
      transitions: cp.transitions.map((transition) => (
        transition.to === id ? { ...transition, to: nextId } : transition
      )),
    };
  }),
  start: draft.start === id ? nextId : draft.start,
});

export const removeCheckpointDraft = (draft: StoryDraft, id: string): { draft: StoryDraft; nextSelection: string | null } => {
  const checkpoints = draft.checkpoints
    .filter((cp) => cp.id !== id)
    .map((cp) => {
      if (!cp.transitions?.length) return cp;
      const transitions = cp.transitions.filter((transition) => transition.to !== id);
      return { ...cp, transitions: transitions.length ? transitions : undefined };
    });
  const start = draft.start === id ? checkpoints[0]?.id ?? "" : draft.start;
  return {
    draft: { ...draft, checkpoints, start },
    nextSelection: start || checkpoints[0]?.id || null,
  };
};

export const removeTransitionDraft = (draft: StoryDraft, transitionId: string): StoryDraft => ({
  ...draft,
  checkpoints: draft.checkpoints.map((cp) => {
    if (!cp.transitions?.length) return cp;
    const transitions = cp.transitions.filter((transition) => transition.id !== transitionId);
    return { ...cp, transitions: transitions.length ? transitions : undefined };
  }),
});

export const patchTransitionDraft = (
  draft: StoryDraft,
  transitionId: string,
  patch: Partial<TransitionDraft>,
): StoryDraft => ({
  ...draft,
  checkpoints: draft.checkpoints.map((cp) => {
    if (!cp.transitions?.length) return cp;
    return {
      ...cp,
      transitions: cp.transitions.map((transition) => (
        transition.id === transitionId ? { ...transition, ...patch } : transition
      )),
    };
  }),
});

export const appendTransitionDraft = (draft: StoryDraft, fromId: string, transition: TransitionDraft): StoryDraft => ({
  ...draft,
  checkpoints: draft.checkpoints.map((cp) => (
    cp.id === fromId
      ? { ...cp, transitions: [...(cp.transitions ?? []), transition] }
      : cp
  )),
});

export const generateUniqueId = (existing: Set<string>, prefix: string): string => {
  let counter = existing.size + 1;
  let candidate = "";
  while (!candidate || existing.has(candidate)) {
    candidate = `${prefix}-${counter}`;
    counter += 1;
    if (counter > existing.size + 1000) {
      candidate = `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
      if (!existing.has(candidate)) break;
    }
  }
  return candidate;
};

export const slugify = (value: string): string => {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || "story";
};
