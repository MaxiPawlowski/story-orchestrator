import { z } from "zod";
import { PRESET_SETTING_KEYS, type PresetSettingKey } from "@constants/presetSettingKeys";

const PRESET_SETTING_KEY_TUPLE = [...PRESET_SETTING_KEYS] as [PresetSettingKey, ...PresetSettingKey[]];

export type Role = string;
export const ARBITER_ROLE_KEY = "$arbiter";
export const ARBITER_ROLE_LABEL = "Arbiter";
export const PRESET_SETTING_KEY_ENUM = z.enum(PRESET_SETTING_KEY_TUPLE);
export type PresetOverrideKey = PresetSettingKey;
export type PresetOverrides = Partial<Record<PresetOverrideKey, unknown>>;
export type RolePresetOverrides = Partial<Record<Role, PresetOverrides>>;

const PresetOverridesSchema: z.ZodType<PresetOverrides> = z.record(PRESET_SETTING_KEY_ENUM, z.unknown());

const RolePresetOverridesSchema: z.ZodType<RolePresetOverrides> = z.record(z.string().min(1), PresetOverridesSchema);

export const AuthorNotePositionSchema = z.enum(["before", "chat", "after"]);
export const AuthorNoteRoleSchema = z.enum(["system", "user", "assistant"]);
export type AuthorNotePosition = z.infer<typeof AuthorNotePositionSchema>;
export type AuthorNoteRole = z.infer<typeof AuthorNoteRoleSchema>;

export const AuthorNoteSettingsSchema = z.object({
  position: AuthorNotePositionSchema.optional(),
  interval: z.number().int().min(1).optional(),
  depth: z.number().int().min(0).optional(),
  role: AuthorNoteRoleSchema.optional(),
});
export type AuthorNoteSettings = z.infer<typeof AuthorNoteSettingsSchema>;

export const AuthorNoteDefinitionSchema = AuthorNoteSettingsSchema.extend({
  text: z.string().min(1),
});
export type AuthorNoteDefinition = z.infer<typeof AuthorNoteDefinitionSchema>;

export interface StubCheckpointMetadata {
  _isStub: true;
  _stubName?: string;
}

export interface StoryExpansionMetadata {
  _premise?: string;
  _roadmap?: string;
}

// Author note entry: string shorthand (text only) or full object
export const AuthorNoteEntrySchema = z.union([
  z.string().min(1),
  AuthorNoteDefinitionSchema,
]);
export type AuthorNoteEntry = z.infer<typeof AuthorNoteEntrySchema>;

export const RegexSpecSchema = z.union([
  z.string().min(1),
  z.object({
    pattern: z.string().min(1),
    flags: z.string().regex(/^[dgimsuvy]*$/, "Invalid JS RegExp flag(s)").optional(),
  }),
]);
export type RegexSpec = z.infer<typeof RegexSpecSchema>;

export const RegexSpecListSchema = z.union([
  RegexSpecSchema,
  z.array(RegexSpecSchema).min(1),
]);

// Top-level defaults section
export const DefaultAuthorNoteSchema = AuthorNoteSettingsSchema;
export type DefaultAuthorNote = z.infer<typeof DefaultAuthorNoteSchema>;

export const DefaultsSchema = z.object({
  author_note: DefaultAuthorNoteSchema.optional(),
  presets: RolePresetOverridesSchema.optional(),
});
export type Defaults = z.infer<typeof DefaultsSchema>;

const TalkControlTriggerSchema = z.enum([
  "afterSpeak",
  "beforeArbiter",
  "afterArbiter",
  "onEnter",
] as const);
export type TalkControlTrigger = z.infer<typeof TalkControlTriggerSchema>;
export const TALK_CONTROL_TRIGGERS: readonly TalkControlTrigger[] = TalkControlTriggerSchema.options;

const TalkControlStaticReplySchema = z.object({
  kind: z.literal("static"),
  text: z.string().min(1),
});

const TalkControlLlmReplySchema = z.object({
  kind: z.literal("llm"),
  instruction: z.string().min(1),
});

export const TalkControlReplyContentSchema = z.discriminatedUnion("kind", [
  TalkControlStaticReplySchema,
  TalkControlLlmReplySchema,
]);
export type TalkControlReplyContent = z.infer<typeof TalkControlReplyContentSchema>;

export const TalkControlReplySchema = z.object({
  memberId: z.string().min(1),
  speakerId: z.string().default(""),
  enabled: z.boolean().default(true),
  trigger: TalkControlTriggerSchema,
  probability: z.number().int().min(0).max(100).default(100),
  maxTriggers: z.number().int().min(1).optional(),
  content: TalkControlReplyContentSchema,
});
export type TalkControlReply = z.infer<typeof TalkControlReplySchema>;

const TriggerBaseSchema = z.object({
  id: z.string().min(1).optional(),
});

const RegexTriggerSchema = TriggerBaseSchema.extend({
  type: z.literal("regex"),
  patterns: RegexSpecListSchema,
  condition: z.string().min(1),
});

const TimedTriggerSchema = TriggerBaseSchema.extend({
  type: z.literal("timed"),
  within_turns: z.number().int().min(1),
});

export const TransitionTriggerSchema = z.discriminatedUnion("type", [RegexTriggerSchema, TimedTriggerSchema]);
export type TransitionTrigger = z.infer<typeof TransitionTriggerSchema>;

// Inline transition: colocated with checkpoint, no `from` field, `id` optional
export const InlineTransitionSchema = z.object({
  id: z.string().min(1).optional(),
  to: z.string().min(1),
  trigger: TransitionTriggerSchema,
  label: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});
export type InlineTransition = z.infer<typeof InlineTransitionSchema>;

// Full transition: used internally after normalization extracts `from`
export const TransitionSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  trigger: TransitionTriggerSchema,
  label: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});
export type Transition = z.infer<typeof TransitionSchema>;

export const CheckpointSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  objective: z.string().min(1),
  authors_note: z.record(z.string().min(1), AuthorNoteEntrySchema).optional(),
  world_info: z.array(z.string().min(1)).optional(),
  world_info_deactivate: z.array(z.string().min(1)).optional(),
  preset_overrides: RolePresetOverridesSchema.optional(),
  arbiter_preset: PresetOverridesSchema.optional(),
  automations: z.array(z.string().min(1)).optional(),
  transitions: z.array(InlineTransitionSchema).optional(),
  talk_control: z.array(TalkControlReplySchema).optional(),
  _isStub: z.literal(true).optional(),
  _stubName: z.string().optional(),
}).strict();
export type Checkpoint = z.infer<typeof CheckpointSchema>;

export function isStubCheckpoint(cp: Checkpoint): boolean {
  return cp._isStub === true;
}

export function makeStubCheckpoint(id: string, suggestedName: string): Checkpoint {
  return {
    id,
    name: suggestedName || `Upcoming Beat (${id})`,
    objective: "To be revealed…",
    _isStub: true,
    _stubName: suggestedName,
  };
}

export const StorySchema = z.object({
  title: z.string().min(1),
  description: z.string().trim().min(1).optional(),
  global_lorebook: z.string().min(1),
  roles: z.record(z.string().min(1), z.string().min(1)).optional(),
  defaults: DefaultsSchema.optional(),
  start: z.string().min(1).optional(),
  checkpoints: z.array(CheckpointSchema).min(1),
  _premise: z.string().optional(),
  _roadmap: z.string().optional(),
}).strict().superRefine((val, ctx) => {
  const seen = new Set<string>();
  for (const [i, cp] of val.checkpoints.entries()) {
    if (seen.has(cp.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["checkpoints", i, "id"],
        message: `Duplicate checkpoint id '${cp.id}'`,
      });
    } else {
      seen.add(cp.id);
    }
  }
});

export type Story = z.infer<typeof StorySchema>;
