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

const PositionEnum = z.enum(["before_defs", "after_defs", "an_top", "an_bottom", "in_chat"]);
type Position = z.infer<typeof PositionEnum>;

export const WorldInfoActivationsSchema = z.object({
  activate: z.array(z.string().min(1)).default([]),
  deactivate: z.array(z.string().min(1)).default([]),
  make_constant: z.array(z.string().min(1)).default([]),
});

export type WorldInfoActivations = z.infer<typeof WorldInfoActivationsSchema>;

const AuthorsNoteSchema = z.union([
  z.string().min(1),
  z.record(RoleEnum, z.string().min(1)),
]);

const CfgScaleSchema = z.record(RoleEnum, z.number().min(0.1).max(50));

export const OnActivateSchema = z.object({
  authors_note: AuthorsNoteSchema.optional(),
  cfg_scale: CfgScaleSchema.optional(),
  world_info: WorldInfoActivationsSchema.optional(),
});

export type OnActivate = z.infer<typeof OnActivateSchema>;

export const CheckpointSchema = z.object({
  id: z.union([z.number(), z.string().min(1)]),
  name: z.string().min(1),
  objective: z.string().min(1),
  win_trigger: RegexSpecSchema,
  fail_trigger: RegexSpecSchema.optional(),
  on_activate: OnActivateSchema.optional(),
});

export type Checkpoint = z.infer<typeof CheckpointSchema>;

export const StoryFileSchema = z.object({
  schema_version: z.literal("1.0"),
  title: z.string().min(1),
  roles: z.object({ dm: z.string().min(1).optional(), companion: z.string().min(1).optional() }).optional(),
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

export type StoryFile = z.infer<typeof StoryFileSchema>;
