import { BOXES_MAX, QUALITY_DISPLAY_AS, type DisplayBand, type Quality, type QualityDisplay, type ValidationError } from "../schema";
import { gatedWorldInfo } from "../worldInfoEffects";
import { isRecord } from "@utils/guards";
import { addError, asString, isOneOf, rejectUnknownKeys } from "./common";

const DISPLAY_KEYS = ["public", "label", "as", "group", "min", "max", "bands", "hide_when_empty", "trend"] as const;
export const DISPLAY_LABEL_MAX = 40;
export const RELATIONSHIP_PREFIX = "rel_";

const numeric = (type: Quality["type"]) => type === "int" || type === "float";
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const readBands = (value: unknown, min: number | undefined, max: number | undefined, path: string, errors: ValidationError[]): DisplayBand[] | undefined => {
  if (!Array.isArray(value) || value.length < 2) {
    addError(errors, path, "bands are at least two {max, label}, ascending, the last with no max");
    return undefined;
  }
  const bands: DisplayBand[] = [];
  let floor = min ?? Number.NEGATIVE_INFINITY;
  value.forEach((entry, index) => {
    const at = `${path}.${index}`;
    const label = isRecord(entry) ? asString(entry.label)?.trim() : null;
    if (!isRecord(entry) || !label) return addError(errors, at, "a band is {max, label}");
    const last = index === value.length - 1;
    if (last && entry.max !== undefined) return addError(errors, `${at}.max`, "the last band is open: leave max out");
    if (!last && (!finite(entry.max) || entry.max < floor || (max !== undefined && entry.max >= max))) {
      return addError(errors, `${at}.max`, "band maxima ascend inside the meter's min and max");
    }
    if (!last) floor = entry.max as number;
    bands.push(last ? { label } : { max: entry.max as number, label });
  });
  return bands.length === value.length ? bands : undefined;
};

const shapeProblem = (as: QualityDisplay["as"], quality: Pick<Quality, "type" | "values" | "player_labels">, bounded: boolean, banded: boolean): string | null => {
  if (as === "item") return quality.type === "bool" ? null : "an item is a bool quality";
  if (as === "count") return numeric(quality.type) ? null : "a count is an int or float quality";
  if (as === "meter") return numeric(quality.type) && bounded ? null : "a meter is an int or float with min and max";
  if (as === "boxes") return quality.type === "int" && bounded ? null : `boxes are an int with min and max, at most ${BOXES_MAX} apart`;
  if (quality.type === "enum") return quality.values?.every((value) => quality.player_labels?.[value]) ? null : "a word display needs player_labels for every enum value";
  return numeric(quality.type) && bounded && banded ? null : "a word display is an enum with player_labels, or a bounded number with bands";
};

export const readDisplay = (value: unknown, quality: Pick<Quality, "type" | "values" | "player_labels">, path: string, errors: ValidationError[]): Pick<Quality, "display"> => {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    addError(errors, path, "display must be an object");
    return {};
  }
  rejectUnknownKeys(value, DISPLAY_KEYS, path, errors);
  if (value.public !== true) return {};
  const label = asString(value.label)?.trim();
  if (!label || label.length > DISPLAY_LABEL_MAX) addError(errors, `${path}.label`, `a public display needs a label of at most ${DISPLAY_LABEL_MAX} characters`);
  if (!isOneOf(value.as, QUALITY_DISPLAY_AS)) addError(errors, `${path}.as`, `as must be one of ${QUALITY_DISPLAY_AS.join(", ")}`);
  const min = finite(value.min) ? value.min : undefined;
  const max = finite(value.max) ? value.max : undefined;
  if ((value.min !== undefined && min === undefined) || (value.max !== undefined && max === undefined)) addError(errors, path, "min and max are numbers");
  const bounded = min !== undefined && max !== undefined && min < max && (value.as !== "boxes" || max - min <= BOXES_MAX);
  const bands = value.bands === undefined ? undefined : readBands(value.bands, min, max, `${path}.bands`, errors);
  const group = value.group === undefined ? undefined : asString(value.group)?.trim();
  if (value.group !== undefined && (!group || group.length > DISPLAY_LABEL_MAX)) addError(errors, `${path}.group`, `a group name is at most ${DISPLAY_LABEL_MAX} characters`);
  if (value.hide_when_empty !== undefined && typeof value.hide_when_empty !== "boolean") addError(errors, `${path}.hide_when_empty`, "hide_when_empty is true or false");
  if (value.trend !== undefined && (typeof value.trend !== "boolean" || !numeric(quality.type))) addError(errors, `${path}.trend`, "trend is true or false, on a number");
  if (!label || !isOneOf(value.as, QUALITY_DISPLAY_AS)) return {};
  const problem = shapeProblem(value.as, quality, bounded, Boolean(bands));
  if (problem) {
    addError(errors, `${path}.as`, problem);
    return {};
  }
  return {
    display: {
      public: true, label, as: value.as,
      ...(group ? { group } : {}), ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}), ...(bands ? { bands } : {}),
      ...(typeof value.hide_when_empty === "boolean" ? { hide_when_empty: value.hide_when_empty } : {}), ...(value.trend === true ? { trend: true } : {}),
    },
  };
};

export const checkDisplays = (qualities: Quality[], checkpoints: unknown[], errors: ValidationError[]) => {
  const gated = new Set([...gatedWorldInfo([{ checkpoints }]).values()].flatMap((comments) => [...comments].map((comment) => comment.toLowerCase())));
  qualities.forEach((quality, index) => {
    if (!quality.display) return;
    if (quality.key.startsWith(RELATIONSHIP_PREFIX)) addError(errors, `qualities.${index}.display`, "a relationship is never public");
    else if (gated.has(quality.key.toLowerCase())) addError(errors, `qualities.${index}.display`, "a checkpoint-gated World Info entry names this key, so showing it would spoil the entry");
  });
};
