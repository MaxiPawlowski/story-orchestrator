import { BACKDROP_LOOP_TIERS, type BackdropLoopTier, type BackdropSettings } from "./types";

export const BACKDROP_INTENSITY_DEFAULT = 0.5;

export const BACKDROP_SWITCHES = ["enabled", "effects", "parallax", "dimBehindChat"] as const;

export const loopTier = (value: unknown): BackdropLoopTier =>
  (BACKDROP_LOOP_TIERS as readonly unknown[]).includes(value) ? value as BackdropLoopTier : "full";

export const defaultBackdropSettings = (): BackdropSettings => ({
  enabled: true, effects: true, parallax: true, loops: "full", intensity: BACKDROP_INTENSITY_DEFAULT, dimBehindChat: true,
});

export const clampIntensity = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : BACKDROP_INTENSITY_DEFAULT;

export const sanitizeBackdropSettings = (value: unknown): BackdropSettings => {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    enabled: source.enabled !== false, effects: source.effects !== false, parallax: source.parallax !== false, loops: loopTier(source.loops),
    intensity: clampIntensity(source.intensity), dimBehindChat: source.dimBehindChat !== false,
  };
};
