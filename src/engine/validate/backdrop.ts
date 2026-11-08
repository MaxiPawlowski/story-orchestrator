import type { ValidationError } from "../schema";
import {
  BACKDROP_LAYER_KINDS, BACKDROP_LOOPS, BACKDROP_MASKS, BACKDROP_SPEED_MAX, BACKDROP_SPEED_MIN, BACKDROP_TIMES, BACKDROP_WEATHERS,
  type BackdropEffect, type BackdropLayerEntry,
} from "../backdropSchema";
import { addError, isOneOf, rejectUnknownKeys } from "./common";
import { isRecord } from "@utils/guards";

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const LAYER_KEYS = ["kind", "intensity", "speed", "color", "mask"] as const;
const EFFECT_KEYS = ["layers", "weather", "time", "indoor", "intensity", "loop"] as const;

const unit = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;

const readLayer = (value: unknown, path: string, errors: ValidationError[]): BackdropLayerEntry | null => {
  const record = typeof value === "string" ? { kind: value.trim() } : isRecord(value) ? value : null;
  if (!record || !isOneOf(record.kind, BACKDROP_LAYER_KINDS)) {
    addError(errors, record && typeof value !== "string" ? `${path}.kind` : path, `a backdrop layer kind must be one of ${BACKDROP_LAYER_KINDS.join(", ")}`);
    return null;
  }
  rejectUnknownKeys(record, LAYER_KEYS, path, errors);
  const layer: BackdropLayerEntry = { kind: record.kind };
  if (record.intensity !== undefined) {
    if (unit(record.intensity)) layer.intensity = record.intensity;
    else addError(errors, `${path}.intensity`, "layer intensity must be a number from 0 to 1");
  }
  if (record.speed !== undefined) {
    if (typeof record.speed === "number" && record.speed >= BACKDROP_SPEED_MIN && record.speed <= BACKDROP_SPEED_MAX) layer.speed = record.speed;
    else addError(errors, `${path}.speed`, `layer speed must be a number from ${BACKDROP_SPEED_MIN} to ${BACKDROP_SPEED_MAX}`);
  }
  if (record.color !== undefined) {
    if (typeof record.color === "string" && HEX_COLOR.test(record.color.trim())) layer.color = record.color.trim().toLowerCase();
    else addError(errors, `${path}.color`, "layer color must be a hex color such as #fa0 or #ffaa00");
  }
  if (record.mask !== undefined) {
    if (isOneOf(record.mask, BACKDROP_MASKS)) layer.mask = record.mask;
    else addError(errors, `${path}.mask`, `layer mask must be ${BACKDROP_MASKS.join(", ")}`);
  }
  return layer;
};

export const readBackdrop = (value: unknown, path: string, errors: ValidationError[]): BackdropEffect | undefined => {
  if (!isRecord(value)) {
    addError(errors, path, "backdrop must be an object such as { weather, layers, intensity, loop }");
    return undefined;
  }
  rejectUnknownKeys(value, EFFECT_KEYS, path, errors);
  const effect: BackdropEffect = {};
  if (value.layers !== undefined) {
    if (Array.isArray(value.layers)) {
      const read = value.layers.map((entry, index) => readLayer(entry, `${path}.layers.${index}`, errors));
      const seen = new Set<string>();
      read.forEach((layer, index) => {
        if (!layer) return;
        if (seen.has(layer.kind)) addError(errors, `${path}.layers.${index}.kind`, `backdrop layer '${layer.kind}' is listed twice`);
        seen.add(layer.kind);
      });
      effect.layers = read.filter((entry): entry is BackdropLayerEntry => entry !== null);
    } else addError(errors, `${path}.layers`, "backdrop layers must be a list (empty for none)");
  }
  if (value.weather !== undefined) {
    if (isOneOf(value.weather, BACKDROP_WEATHERS)) effect.weather = value.weather;
    else addError(errors, `${path}.weather`, `backdrop weather must be ${BACKDROP_WEATHERS.join(", ")}`);
  }
  if (value.time !== undefined) {
    if (isOneOf(value.time, BACKDROP_TIMES)) effect.time = value.time;
    else addError(errors, `${path}.time`, `backdrop time must be ${BACKDROP_TIMES.join(", ")}`);
  }
  if (value.indoor !== undefined) {
    if (typeof value.indoor === "boolean") effect.indoor = value.indoor;
    else addError(errors, `${path}.indoor`, "backdrop indoor must be true or false");
  }
  if (value.intensity !== undefined) {
    if (unit(value.intensity)) effect.intensity = value.intensity;
    else addError(errors, `${path}.intensity`, "backdrop intensity must be a number from 0 to 1");
  }
  if (value.loop !== undefined) {
    if (value.loop === false || isOneOf(value.loop, BACKDROP_LOOPS)) effect.loop = value.loop;
    else addError(errors, `${path}.loop`, "backdrop loop must be \"pre\", \"auto\" or false");
  }
  return effect;
};

export const readBackdropDefaults = (value: unknown, errors: ValidationError[]): BackdropEffect | undefined =>
  value === undefined ? undefined : readBackdrop(value, "backdrop_defaults", errors);
