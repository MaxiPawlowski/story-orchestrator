import type { BackdropEffect, BackdropLayerEntry } from "@engine/backdropSchema";
import type { BackdropLayerSpec, BackdropSettings, BackdropState, BackdropTime, BackdropWeather } from "./types";

export type Values = Record<string, unknown>;

export interface BackdropPick {
  state: BackdropState;
  layers: BackdropLayerSpec[];
  intensity: number;
  authored: boolean;
}

const WEATHER_WORDS: Array<[RegExp, BackdropWeather]> = [
  [/storm|thunder|lightning|tempest|downpour/, "storm"], [/snow|blizzard|sleet|frost/, "snow"], [/rain|drizzle|shower|wet/, "rain"],
  [/fog|mist|haze|smog/, "fog"], [/wind|gale|gust|breez/, "wind"], [/clear|sun|fair|calm|bright|dry/, "clear"],
];
const TIME_WORDS: Array<[RegExp, BackdropTime]> = [
  [/night|midnight|late|small hours/, "night"], [/dusk|evening|sunset|twilight/, "dusk"], [/dawn|morning|sunrise|daybreak/, "dawn"], [/day|noon|afternoon|midday/, "day"],
];
const INDOOR_WORDS = new RegExp(["tavern", "inn\\b", "room", "hall", "interior", "cellar", "cave", "library", "bedroom", "kitchen", "throne", "chamber",
  "dungeon", "shop", "house", "bar\\b", "temple", "church", "office", "corridor", "basement", "attic", "study", "crypt", "cabin", "tent"].join("|"));
const OUTDOOR_WORDS = new RegExp(["forest", "field", "street", "sky", "beach", "mountain", "garden", "road", "city", "village", "lake", "sea", "ocean",
  "river", "desert", "plain", "outside", "exterior", "meadow", "harbou?r", "port", "square", "bridge", "cliff", "ruin", "camp", "park", "valley", "shore",
  "swamp", "wood"].join("|"));

const textOf = (value: unknown): string => (typeof value === "string" ? value.toLowerCase() : "");

export const weatherFrom = (value: unknown): BackdropWeather | null => {
  const text = textOf(value);
  return text ? WEATHER_WORDS.find(([pattern]) => pattern.test(text))?.[1] ?? null : null;
};

export const timeFrom = (value: unknown, night?: unknown): BackdropTime | null => {
  const text = textOf(value);
  const found = text ? TIME_WORDS.find(([pattern]) => pattern.test(text))?.[1] ?? null : null;
  return found ?? (night === true ? "night" : night === false && text ? "day" : null);
};

export const indoorFrom = (key: string): boolean | undefined => {
  const text = key.toLowerCase().replace(/[_-]+/g, " ");
  if (INDOOR_WORDS.test(text)) return true;
  if (OUTDOOR_WORDS.test(text)) return false;
  return undefined;
};

const unit = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

export const mergeEffect = (defaults: BackdropEffect | undefined, beat: BackdropEffect | undefined): BackdropEffect | null =>
  defaults || beat ? { ...(defaults ?? {}), ...(beat ?? {}) } : null;

export const readState = (sceneKey: string, values: Values, effect: BackdropEffect | null): BackdropState => {
  const indoor = effect?.indoor ?? (typeof values.indoor === "boolean" ? values.indoor : indoorFrom(sceneKey));
  return {
    sceneKey,
    weather: effect?.weather ?? weatherFrom(values.weather),
    timeOfDay: effect?.time ?? timeFrom(values.time_of_day, values.is_night),
    tension: unit(values.tension_current),
    ...(indoor !== undefined ? { indoor } : {}),
  };
};

const spec = (kind: string, params: BackdropLayerSpec["params"] = {}): BackdropLayerSpec => ({ id: kind, kind, params });

const SKY_WEATHER: readonly BackdropWeather[] = ["rain", "storm", "snow", "fog"];

export const derivedLayers = (state: BackdropState): BackdropLayerSpec[] => {
  const layers: BackdropLayerSpec[] = [spec("drift")];
  const outdoor = state.indoor !== true;
  const weather = outdoor || !state.weather || !SKY_WEATHER.includes(state.weather) ? state.weather : null;
  if (weather === "rain") layers.push(spec("rain", { intensity: 0.6 }));
  if (weather === "storm") layers.push(spec("rain", { intensity: 1, speed: 1.4 }), spec("fog", { intensity: 0.3 }), spec("flicker", { intensity: 0.5, color: "#c8d8ff" }));
  if (weather === "snow") layers.push(spec("snow", { intensity: 0.6 }));
  if (weather === "fog") layers.push(spec("fog", { intensity: 0.6 }));
  if (weather === "wind") layers.push(spec("dust", { intensity: 0.5, speed: 2.5 }));
  const dark = state.timeOfDay === "night" || state.timeOfDay === "dusk";
  if (state.indoor === true) {
    layers.push(spec("dust", { intensity: 0.35 }));
    if (dark) layers.push(spec("flicker", { intensity: 0.45 }));
  } else if (state.timeOfDay === "night" && (!weather || weather === "clear")) layers.push(spec("fireflies", { intensity: 0.45 }));
  return dedupe(layers);
};

const dedupe = (layers: BackdropLayerSpec[]): BackdropLayerSpec[] => layers.filter((layer, index) => layers.findIndex((other) => other.kind === layer.kind) === index);

export const authoredLayers = (entries: readonly BackdropLayerEntry[]): BackdropLayerSpec[] => dedupe(entries.map((entry) => spec(entry.kind, {
  ...(entry.intensity !== undefined ? { intensity: entry.intensity } : {}),
  ...(entry.speed !== undefined ? { speed: entry.speed } : {}),
  ...(entry.color ? { color: entry.color } : {}),
  ...(entry.mask ? { mask: entry.mask } : {}),
})));

export const tensionScale = (tension: number): { intensity: number; speed: number } => ({ intensity: 0.85 + 0.3 * tension, speed: 1 + 0.5 * tension });

export const pickBackdrop = (input: { sceneKey: string; values: Values; effect: BackdropEffect | null; settings: BackdropSettings; reducedMotion: boolean }): BackdropPick => {
  const state = readState(input.sceneKey, input.values, input.effect);
  const authored = Boolean(input.effect?.layers);
  const intensity = input.settings.intensity * (input.effect?.intensity ?? 1) * tensionScale(state.tension).intensity;
  if (input.reducedMotion || !input.settings.enabled || !input.settings.effects) return { state, layers: [], intensity: Math.min(1, intensity), authored };
  const layers = input.effect?.layers ? authoredLayers(input.effect.layers) : derivedLayers(state);
  return { state, layers, intensity: Math.min(1, intensity), authored };
};
