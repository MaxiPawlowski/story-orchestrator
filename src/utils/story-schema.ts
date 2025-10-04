import { z } from "zod";

export const RoleEnum = z.enum(["dm", "companion", "chat"]);
export type Role = z.infer<typeof RoleEnum>;
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

const AuthorsNoteSchema = z.union([
  z.string().min(1),
  z.record(RoleEnum, z.string().min(1)),
]);

const PresetPartialSchema = z.record(RoleEnum, z.record(z.string(), z.any()));

export const OnActivateSchema = z.object({
  authors_note: AuthorsNoteSchema.optional(),
  preset_overrides: PresetPartialSchema.optional(),
  world_info: WorldInfoActivationsSchema.optional(),
});

export type OnActivate = z.infer<typeof OnActivateSchema>;

const CheckpointTriggersSchema = z.object({
  win: RegexSpecListSchema,
  fail: RegexSpecListSchema.optional(),
});

export const CheckpointSchema = z.object({
  id: z.union([z.number(), z.string().min(1)]),
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
  schema_version: z.literal("1.0"),
  title: z.string().min(1),
  global_lorebook: z.string().min(1),
  base_preset: BasePresetSchema.optional(),
  role_defaults: PresetPartialSchema.optional(),
  roles: z.object({
    dm: z.string().min(1).optional(),
    companion: z.string().min(1).optional(),
    chat: z.string().min(1).optional(),
  }).optional(),
  on_start: OnActivateSchema.optional(),
  checkpoints: z.array(CheckpointSchema).min(1),
}).superRefine((val, ctx) => {
  const seen = new Set<string | number>();
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
});

export type Story = z.infer<typeof StorySchema>;
