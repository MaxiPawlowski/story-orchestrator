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
  };
}
