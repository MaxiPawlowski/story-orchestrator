import { CHECKPOINTS, FAMILIES, type Aspect, type Checkpoint, type Family, type Lora, type Placement, type Purpose, type Quality, type Shot } from "./catalog";
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
  source: "request" | "chat" | "character" | "purpose" | "lora" | "director";
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
  let checkpoint = CHECKPOINTS[0];
  let source: Route["source"] = "purpose";
  for (const [file, origin] of candidates) {
    if (!file) continue;
    const known = CHECKPOINTS.find((item) => item.file === file);
    const template = CHECKPOINTS.find((item) => item.family === row.family) ?? CHECKPOINTS[0];
    const found = known ?? (settings.backend === "comfy" ? { ...template, file, label: file, qualityBlock: "", negativeBlock: "" } : undefined);
    if (!found) { warnings.push(`Unknown image checkpoint ${file} (${origin}).`); continue; }
    checkpoint = found;
    source = origin;
    break;
  }
  const loras = [...chat.loras, ...(binding?.loras ?? [])].flatMap((use) => {
    const entry = settings.loras.find((item) => item.file === use.file);
    if (!entry) { warnings.push(`Missing LoRA ${use.file}.`); return []; }
    return [{ entry, weight: Math.min(entry.weight.max, Math.max(entry.weight.min, use.weight)) }];
  }).filter((use, index, all) => all.findIndex((item) => item.entry.file === use.entry.file) === index);
  const firstMismatch = loras.find((use) => use.entry.base !== FAMILIES[checkpoint.family].loraBase);
  if (firstMismatch && source === "purpose") {
    const alternative = CHECKPOINTS.find((item) => FAMILIES[item.family].loraBase === firstMismatch.entry.base);
    if (alternative) { checkpoint = alternative; source = "lora"; }
  }
  const family = FAMILIES[checkpoint.family];
  const fitting = loras.filter((use) => use.entry.base === family.loraBase);
  if (fitting.length !== loras.length) warnings.push("An image LoRA did not fit the selected checkpoint and was dropped.");
  const unlocked = source === "purpose" && row.directorMayOverride;
  const allowed = unlocked ? CHECKPOINTS.filter((item) => !fitting.length || FAMILIES[item.family].loraBase === family.loraBase).map((item) => item.file) : [checkpoint.file];
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
  if (!route.allowed.includes(file) || file === route.checkpoint.file) return route;
  const checkpoint = CHECKPOINTS.find((entry) => entry.file === file);
  return checkpoint ? { ...route, checkpoint, family: FAMILIES[checkpoint.family], source: "director" } : route;
};
