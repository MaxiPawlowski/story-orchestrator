import { isRecord } from "@utils/guards";

export type StageMode = "vn" | "always" | "off";

export interface SpriteSettings {
  enabled: boolean;
  explicit: boolean;
  stage: StageMode;
  profileId: string;
  segmentChars: number;
  crossfadeMs: number;
  focus: boolean;
  breathing: boolean;
  blink: boolean;
  mouth: "off" | "simple" | "smooth";
  cardOverlay: boolean;
  onDemand: boolean;
  builders: Record<string, { baseSet: string; box: { x: number; y: number; width: number; height: number }; models: { diffusion: string; encoder: string; vae: string }; steps: number }>;
}

export type SpriteActivation = "user-on" | "user-off" | "story" | "off";

export const defaultSpriteSettings = (): SpriteSettings => ({
  enabled: false,
  explicit: false,
  stage: "vn",
  profileId: "",
  segmentChars: 400,
  crossfadeMs: 250,
  focus: true,
  breathing: true,
  blink: true,
  mouth: "simple",
  cardOverlay: false,
  onDemand: false,
  builders: {},
});

const within = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? Math.round(value) : fallback;

export function sanitizeSpriteSettings(value: unknown): SpriteSettings {
  const d = defaultSpriteSettings();
  if (!isRecord(value)) return d;
  const explicit = value.explicit === true && typeof value.enabled === "boolean";
  return {
    enabled: explicit ? value.enabled === true : d.enabled,
    explicit,
    stage: value.stage === "always" || value.stage === "off" || value.stage === "vn" ? value.stage : d.stage,
    profileId: typeof value.profileId === "string" ? value.profileId : d.profileId,
    segmentChars: within(value.segmentChars, 120, 2000, d.segmentChars),
    crossfadeMs: within(value.crossfadeMs, 0, 2000, d.crossfadeMs),
    focus: typeof value.focus === "boolean" ? value.focus : d.focus,
    breathing: typeof value.breathing === "boolean" ? value.breathing : d.breathing,
    blink: typeof value.blink === "boolean" ? value.blink : d.blink,
    mouth: value.mouth === "off" || value.mouth === "smooth" || value.mouth === "simple" ? value.mouth : d.mouth,
    cardOverlay: value.cardOverlay === true,
    onDemand: value.onDemand === true,
    builders: Object.fromEntries(Object.entries(isRecord(value.builders) ? value.builders : {}).flatMap(([folder, entry]) => {
      if (!isRecord(entry) || typeof entry.baseSet !== "string" || (entry.baseSet !== "" && !/^[a-z0-9_]+$/.test(entry.baseSet)) || !isRecord(entry.box) || !isRecord(entry.models)) return [];
      const box = entry.box, models = entry.models;
      if (![box.x, box.y, box.width, box.height].every((value) => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 8192)
        || ![models.diffusion, models.encoder, models.vae].every((value) => typeof value === "string" && value.length > 0)) return [];
      return [[folder, { baseSet: entry.baseSet, box: box as SpriteSettings["builders"][string]["box"],
        models: models as SpriteSettings["builders"][string]["models"], steps: within(entry.steps, 1, 100, 25) }]];
    })),
  };
}
