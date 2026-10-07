import { checkpointFor, FAMILIES, familyOf, modelId, type Aspect, type Checkpoint, type Family, type Lora, type Placement, type Purpose, type Quality, type Shot } from "./catalog";
import { type ImageBinding, type ImageOverride, type ImageSettings } from "./settings";

export interface ImageArgs {
  checkpoint?: string;
  quality?: Quality;
  aspect?: Aspect;
  shot?: Shot;
  placement?: Placement;
  candidates?: number;
  seed?: number;
}
export interface Route {
  purpose: Purpose;
  checkpoint: Checkpoint;
  family: Family;
  source: "request" | "chat" | "character" | "purpose" | "director";
  quality: Quality;
  aspect: Aspect | "auto";
  shot: Shot;
  placement: Placement;
  candidates: number;
  loras: Array<{ entry: Lora; weight: number }>;
  allowed: string[];
  positive: string[];
  negative: string[];
  seed: number | null;
  warnings: string[];
}

const tags = (text: string) => text.split(",").map((tag) => tag.trim()).filter(Boolean);

export const resolveImageRoute = (settings: ImageSettings, purpose: Purpose, args: ImageArgs, chat: ImageOverride, binding: ImageBinding | null): Route => {
  const row = settings.purposes[purpose];
  const candidates = [
    [args.checkpoint, "request"], [chat.checkpoint, "chat"], [binding?.checkpoint, "character"], [row.checkpoint, "purpose"],
  ] as const;
  const warnings: string[] = [];
  const chosen = candidates.find(([file]) => Boolean(file));
  const source: Route["source"] = chosen?.[1] ?? "purpose";
  const file = chosen?.[0] ?? "";
  const checkpoint = checkpointFor(file, source === "purpose" ? row.family : familyOf(file) ?? row.family);
  const family = FAMILIES[checkpoint.family];
  const loras = [...chat.loras, ...(binding?.loras ?? [])].flatMap((use) => {
    const entry = settings.loras.find((item) => item.file === use.file);
    if (!entry) { warnings.push(`Missing LoRA ${use.file}.`); return []; }
    return [{ entry, weight: Math.min(entry.weight.max, Math.max(entry.weight.min, use.weight)) }];
  }).filter((use, index, all) => all.findIndex((item) => item.entry.file === use.entry.file) === index);
  const fitting = loras.filter((use) => use.entry.base === family.loraBase);
  if (fitting.length !== loras.length) warnings.push("An image LoRA did not fit the selected checkpoint and was dropped.");
  const unlocked = source === "purpose" && row.directorMayOverride;
  const mapped = Object.values(settings.purposes).map((entry) => entry.checkpoint).filter(Boolean);
  const allowed = unlocked ? [...new Set([modelId(checkpoint), ...mapped])] : [modelId(checkpoint)];
  const safe = row.safeMode === "on" || (row.safeMode === "inherit" && settings.safeMode);
  return {
    purpose, checkpoint, family, source,
    quality: args.quality ?? (chat.quality || (row.quality === "hires" || settings.defaults.quality === "hires" ? "hires" : "base")),
    aspect: args.aspect ?? row.aspect, shot: args.shot ?? row.shot,
    placement: args.placement ?? row.placement,
    candidates: Math.min(4, Math.max(1, Math.round(args.candidates ?? row.candidates))),
    loras: fitting, allowed,
    positive: [...tags(row.extraPositive), ...tags(chat.extraPositive), ...tags(binding?.alwaysTags ?? ""), ...fitting.flatMap((lora) => lora.entry.triggerWords)],
    negative: [...tags(row.extraNegative), ...(safe ? tags(checkpoint.safeNegative ?? "nsfw") : [])],
    seed: args.seed ?? binding?.seed ?? null,
    warnings,
  };
};

export const pickImageCheckpoint = (route: Route, file: string): Route => {
  if (!route.allowed.includes(file) || file === modelId(route.checkpoint) || file in FAMILIES) return route;
  const checkpoint = checkpointFor(file, familyOf(file) ?? route.family.id);
  return { ...route, checkpoint, family: FAMILIES[checkpoint.family], source: "director" };
};

export const withCheckpointFile = (route: Route, file: string): Route => ({
  ...route, checkpoint: { ...route.checkpoint, file, label: checkpointFor(file, route.family.id).label },
  allowed: route.allowed.map((id) => id === modelId(route.checkpoint) ? file : id),
});
