import { z } from "zod";
import { PRESET_SETTING_KEYS, type PresetSettingKey } from "@constants/presetSettingKeys";

const PRESET_SETTING_KEY_TUPLE = [...PRESET_SETTING_KEYS] as [PresetSettingKey, ...PresetSettingKey[]];

// Dynamic roles: any non-empty string is a valid role name
export type Role = string;
export const PRESET_SETTING_KEY_ENUM = z.enum(PRESET_SETTING_KEY_TUPLE);
export type PresetOverrideKey = PresetSettingKey;
export type PresetOverrides = Partial<Record<PresetOverrideKey, unknown>>;
export type RolePresetOverrides = Partial<Record<Role, PresetOverrides>>;

const PresetOverridesSchema: z.ZodType<PresetOverrides> = z.record(PRESET_SETTING_KEY_ENUM, z.unknown());

// Allow arbitrary role keys mapping to preset override objects
const RolePresetOverridesSchema: z.ZodType<RolePresetOverrides> = z.record(z.string().min(1), PresetOverridesSchema);

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

const AuthorsNoteSchema = z.record(z.string().min(1), z.string().min(1));

export const OnActivateSchema = z.object({
  authors_note: AuthorsNoteSchema.optional(),
  preset_overrides: RolePresetOverridesSchema.optional(),
  world_info: WorldInfoActivationsSchema.optional(),
});

export type OnActivate = z.infer<typeof OnActivateSchema>;

const CheckpointTriggersSchema = z.object({
  win: RegexSpecListSchema,
  fail: RegexSpecListSchema.optional(),
});

export const TransitionOutcomeSchema = z.enum(["win", "fail"]);
export type TransitionOutcome = z.infer<typeof TransitionOutcomeSchema>;

export const TransitionSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  outcome: TransitionOutcomeSchema.default("win"),
  label: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});

export type Transition = z.infer<typeof TransitionSchema>;

export const CheckpointSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  objective: z.string().min(1),
  triggers: CheckpointTriggersSchema.optional(),
  on_activate: OnActivateSchema.optional(),
}).superRefine((cp, ctx) => {
  if (!(cp.triggers && cp.triggers.win)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["triggers", "win"],
      message: "Checkpoint requires 'triggers.win'",
    });
  }
});

export type Checkpoint = z.infer<typeof CheckpointSchema>;

const BasePresetSchema = z.object({
  source: z.enum(["named", "current"]).or(z.string().min(1)),
  name: z.string().min(1).optional(),
});

export const StorySchema = z.object({
  title: z.string().min(1),
  global_lorebook: z.string().min(1),
  base_preset: BasePresetSchema.optional(),
  roles: z.record(z.string().min(1), z.string().min(1)).optional(),
  on_start: OnActivateSchema.optional(),
  checkpoints: z.array(CheckpointSchema).min(1),
  transitions: z.array(TransitionSchema).default([]),
  start: z.string().min(1).optional(),
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
});

export type Story = z.infer<typeof StorySchema>;
