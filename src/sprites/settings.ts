import { isRecord } from "@utils/guards";

export type StageMode = "vn" | "always" | "off";

export interface SpriteSettings {
  enabled: boolean;
  stage: StageMode;
  profileId: string;
  segmentChars: number;
  crossfadeMs: number;
  focus: boolean;
  breathing: boolean;
}

export const defaultSpriteSettings = (): SpriteSettings => ({
  enabled: true,
  stage: "vn",
  profileId: "",
  segmentChars: 400,
  crossfadeMs: 250,
  focus: true,
  breathing: true,
});

const within = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? Math.round(value) : fallback;

export function sanitizeSpriteSettings(value: unknown): SpriteSettings {
  const d = defaultSpriteSettings();
  if (!isRecord(value)) return d;
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : d.enabled,
    stage: value.stage === "always" || value.stage === "off" || value.stage === "vn" ? value.stage : d.stage,
    profileId: typeof value.profileId === "string" ? value.profileId : d.profileId,
    segmentChars: within(value.segmentChars, 120, 2000, d.segmentChars),
    crossfadeMs: within(value.crossfadeMs, 0, 2000, d.crossfadeMs),
    focus: typeof value.focus === "boolean" ? value.focus : d.focus,
    breathing: typeof value.breathing === "boolean" ? value.breathing : d.breathing,
  };
}
