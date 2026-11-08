import type { BackdropSettings } from "./types";

export const BACKDROP_INTENSITY_DEFAULT = 0.5;

export const BACKDROP_SWITCHES = ["enabled", "effects", "parallax", "loops", "dimBehindChat"] as const;

export const defaultBackdropSettings = (): BackdropSettings => ({
  enabled: true, effects: true, parallax: true, loops: true, intensity: BACKDROP_INTENSITY_DEFAULT, dimBehindChat: true,
});

export const clampIntensity = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : BACKDROP_INTENSITY_DEFAULT;

export const sanitizeBackdropSettings = (value: unknown): BackdropSettings => {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    enabled: source.enabled !== false, effects: source.effects !== false, parallax: source.parallax !== false, loops: source.loops !== false,
    intensity: clampIntensity(source.intensity), dimBehindChat: source.dimBehindChat !== false,
  };
};
