import { z } from "zod";
import { PRESET_SETTING_KEYS, type PresetSettingKey } from "@constants/presetSettingKeys";

const PRESET_SETTING_KEY_TUPLE = [...PRESET_SETTING_KEYS] as [PresetSettingKey, ...PresetSettingKey[]];

// Dynamic roles: any non-empty string is a valid role name
export type Role = string;
export const ARBITER_ROLE_KEY = "$arbiter";
export const ARBITER_ROLE_LABEL = "Arbiter";
export const PRESET_SETTING_KEY_ENUM = z.enum(PRESET_SETTING_KEY_TUPLE);
export type PresetOverrideKey = PresetSettingKey;
export type PresetOverrides = Partial<Record<PresetOverrideKey, unknown>>;
export type RolePresetOverrides = Partial<Record<Role, PresetOverrides>>;

const PresetOverridesSchema: z.ZodType<PresetOverrides> = z.record(PRESET_SETTING_KEY_ENUM, z.unknown());

// Allow arbitrary role keys mapping to preset override objects
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

export const RegexSpecSchema = z.union([
  z.string().min(1),
  z.object({
    pattern: z.string().min(1),
    flags: z.string().regex(/^[dgimsuvy]*$/, "Invalid JS RegExp flag(s)").optional(), // Node supports d,g,i,m,s,u,v,y
  }),
]);
export type RegexSpec = z.infer<typeof RegexSpecSchema>;

export const RegexSpecListSchema = z.union([
  RegexSpecSchema,
  z.array(RegexSpecSchema).min(1),
]);

export const WorldInfoActivationsSchema = z.object({
  activate: z.array(z.string().min(1)).default([]),
  deactivate: z.array(z.string().min(1)).default([]),
});

export type WorldInfoActivations = z.infer<typeof WorldInfoActivationsSchema>;

const AuthorsNoteSchema = z.record(z.string().min(1), AuthorNoteDefinitionSchema);

export const OnActivateSchema = z.object({
  authors_note: AuthorsNoteSchema.optional(),
  preset_overrides: RolePresetOverridesSchema.optional(),
  arbiter_preset: PresetOverridesSchema.optional(),
  world_info: WorldInfoActivationsSchema.optional(),
  automations: z.array(z.string().min(1)).optional(),
});

export type OnActivate = z.infer<typeof OnActivateSchema>;

const TalkControlTriggerSchema = z.enum([
  "afterSpeak",
  "beforeArbiter",
  "afterArbiter",
  "onEnter",
  "onExit",
] as const);
export type TalkControlTrigger = z.infer<typeof TalkControlTriggerSchema>;

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
  memberId: z.string().default(""),
  speakerId: z.string().min(1),
  enabled: z.boolean().default(true),
  trigger: TalkControlTriggerSchema,
  probability: z.number().int().min(0).max(100).default(100),
  content: TalkControlReplyContentSchema,
});
export type TalkControlReply = z.infer<typeof TalkControlReplySchema>;

const TalkControlCheckpointSchema = z.object({
  replies: z.array(TalkControlReplySchema).default([]),
});
export type TalkControlCheckpoint = z.infer<typeof TalkControlCheckpointSchema>;

export const TalkControlDefaultsSchema = z.object({});
export type TalkControlDefaults = z.infer<typeof TalkControlDefaultsSchema>;

export const TalkControlConfigSchema = z.object({
  defaults: TalkControlDefaultsSchema.optional(),
  checkpoints: z.record(z.string().min(1), TalkControlCheckpointSchema).default({}),
});
export type TalkControlConfig = z.infer<typeof TalkControlConfigSchema>;
export type TalkControlCheckpointMap = z.infer<typeof TalkControlConfigSchema>["checkpoints"];

const TriggerBaseSchema = z.object({
  id: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
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
  on_activate: OnActivateSchema.optional(),
});

export type Checkpoint = z.infer<typeof CheckpointSchema>;

const BasePresetSchema = z.object({
  source: z.enum(["named", "current"]).or(z.string().min(1)),
  name: z.string().min(1).optional(),
});

export const StorySchema = z.object({
  title: z.string().min(1),
  description: z.string().trim().min(1).optional(),
  global_lorebook: z.string().min(1),
  base_preset: BasePresetSchema.optional(),
  roles: z.record(z.string().min(1), z.string().min(1)).optional(),
  author_note_defaults: AuthorNoteSettingsSchema.optional(),
  role_defaults: RolePresetOverridesSchema.optional(),
  on_start: OnActivateSchema.optional(),
  checkpoints: z.array(CheckpointSchema).min(1),
  transitions: z.array(TransitionSchema).default([]),
  start: z.string().min(1).optional(),
  talkControl: TalkControlConfigSchema.optional(),
  talk_control: TalkControlConfigSchema.optional(),
}).superRefine((val, ctx) => {
  const seen = new Set<string>();
  for (const [i, cp] of val.checkpoints.entries()) {
    const key = cp.id;
    if (seen.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["checkpoints", i, "id"],
        message: `Duplicate checkpoint id '${String(key)}'`,
      });
    } else {
      seen.add(key);
    }
  }

  const transitionIds = new Set<string>();
  for (const [i, edge] of (val.transitions ?? []).entries()) {
    const key = edge.id;
    if (transitionIds.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["transitions", i, "id"],
        message: `Duplicate transition id '${String(key)}'`,
      });
    } else {
      transitionIds.add(key);
    }
  }

  if (val.talkControl && val.talk_control) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["talkControl"],
      message: "Specify either 'talkControl' or 'talk_control', not both.",
    });
  }
});

export type Story = z.infer<typeof StorySchema>;
