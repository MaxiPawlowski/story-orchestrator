import {
  WIDGET_ACCENTS, WIDGET_AUDIENCES, WIDGET_ICONS, WIDGET_KINDS, type Quality, type StoryWidget, type ValidationError, type WidgetBind, type WidgetKind,
} from "../schema";
import { isRecord } from "@utils/guards";
import { addError, asString, isOneOf, refuse, rejectUnknownKeys } from "./common";
import { readGate, validateGate } from "./gates";
import { GAME_ID_PATTERN, readLabel } from "./checks";

const WIDGET_KEYS = ["id", "kind", "title", "bind", "options", "visible_when", "audience", "accent", "icon"] as const;
const OPTION_KEYS = ["limit", "closed"] as const;
export const WIDGET_LIMIT_MAX = 50;
export const CLOCK_SEGMENTS = { min: 2, max: 12 } as const;

const BIND_WORDS: Record<string, WidgetBind> = { quests: { quests: true }, path: { path: true }, arcs: { arcs: true } };

const readBind = (value: unknown, path: string, errors: ValidationError[]): WidgetBind | undefined => {
  if (value === undefined) return undefined;
  if (typeof value === "string" && BIND_WORDS[value]) return BIND_WORDS[value];
  if (typeof value === "string" && value.startsWith("quality:") && value.length > 8) return { quality: value.slice(8) };
  if (isRecord(value) && asString(value.quality)) return { quality: String(value.quality).trim() };
  const word = isRecord(value) ? Object.keys(BIND_WORDS).find((key) => value[key] === true) : undefined;
  if (word) return BIND_WORDS[word];
  if (isRecord(value) && Array.isArray(value.qualities) && value.qualities.length && value.qualities.every((key) => typeof key === "string")) return { qualities: value.qualities as string[] };
  if (isRecord(value) && asString(value.group)) return { group: String(value.group).trim() };
  if (isRecord(value) && asString(value.releases)) return refuse(errors, `${path}.releases`, "a release clock is not built yet: open stretches have no pressure pool", undefined);
  return refuse(errors, path, "bind is \"quality:<key>\", {qualities}, {group}, \"quests\", \"path\" or \"arcs\"", undefined);
};

const KIND_BINDS: Record<WidgetKind, ReadonlyArray<keyof WidgetBind | string>> = {
  meters: ["quality", "qualities", "group"], track: ["path", "quests"], log: [], clock: ["quality"], board: ["quests", "arcs"],
};

const DEFAULT_BIND: Partial<Record<WidgetKind, WidgetBind>> = { track: { path: true }, board: { quests: true } };

const boundKeys = (bind: WidgetBind, qualities: Quality[]): string[] => {
  if ("quality" in bind) return [bind.quality];
  if ("qualities" in bind) return bind.qualities;
  if ("group" in bind) return qualities.filter((quality) => quality.display?.group === bind.group).map((quality) => quality.key);
  return [];
};

const bindProblem = (widget: Pick<StoryWidget, "kind" | "audience">, bind: WidgetBind, qualityByKey: Record<string, Quality>, qualities: Quality[]): string | null => {
  if (!KIND_BINDS[widget.kind].includes(Object.keys(bind)[0])) return `a ${widget.kind} widget cannot bind ${Object.keys(bind)[0]}`;
  const keys = boundKeys(bind, qualities);
  if (("group" in bind || "qualities" in bind) && !keys.length) return "the bind names no quality";
  const unknown = keys.find((key) => !qualityByKey[key]);
  if (unknown) return `unknown quality '${unknown}'`;
  const hidden = widget.audience === "player" ? keys.find((key) => !qualityByKey[key].display?.public) : undefined;
  if (hidden) return `'${hidden}' is not public, so a player widget cannot show it`;
  if (widget.kind !== "clock") return null;
  const display = qualityByKey[keys[0]].display;
  const segments = display?.min !== undefined && display.max !== undefined ? display.max - display.min : 0;
  const bounded = qualityByKey[keys[0]].type === "int" && segments >= CLOCK_SEGMENTS.min && segments <= CLOCK_SEGMENTS.max;
  return bounded ? null : `a clock binds an int whose display min and max are ${CLOCK_SEGMENTS.min} to ${CLOCK_SEGMENTS.max} apart`;
};

const readOptions = (value: unknown, path: string, errors: ValidationError[]): StoryWidget["options"] => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return refuse(errors, path, "options is {limit?, closed?}", undefined);
  rejectUnknownKeys(value, OPTION_KEYS, path, errors);
  const limit = Number.isInteger(value.limit) && (value.limit as number) >= 1 && (value.limit as number) <= WIDGET_LIMIT_MAX ? value.limit as number : undefined;
  if (value.limit !== undefined && limit === undefined) addError(errors, `${path}.limit`, `limit is 1 to ${WIDGET_LIMIT_MAX}`);
  if (value.closed !== undefined && typeof value.closed !== "boolean") addError(errors, `${path}.closed`, "closed is true or false");
  return limit !== undefined || typeof value.closed === "boolean" ? { ...(limit !== undefined ? { limit } : {}), ...(typeof value.closed === "boolean" ? { closed: value.closed } : {}) } : undefined;
};

const readLook = (value: Record<string, unknown>, path: string, errors: ValidationError[]): Pick<StoryWidget, "accent" | "icon"> => {
  if (value.accent !== undefined && !isOneOf(value.accent, WIDGET_ACCENTS)) addError(errors, `${path}.accent`, `accent is one of ${WIDGET_ACCENTS.join(", ")}`);
  if (value.icon !== undefined && !isOneOf(value.icon, WIDGET_ICONS)) addError(errors, `${path}.icon`, `icon is one of ${WIDGET_ICONS.join(", ")}`);
  return { ...(isOneOf(value.accent, WIDGET_ACCENTS) ? { accent: value.accent } : {}), ...(isOneOf(value.icon, WIDGET_ICONS) ? { icon: value.icon } : {}) };
};

const readWidget = (value: unknown, path: string, qualityByKey: Record<string, Quality>, qualities: Quality[], errors: ValidationError[]): StoryWidget | null => {
  if (!isRecord(value)) return refuse(errors, path, "a widget is {id, kind, title}", null);
  rejectUnknownKeys(value, WIDGET_KEYS, path, errors);
  const id = asString(value.id)?.trim() ?? "";
  if (!GAME_ID_PATTERN.test(id)) addError(errors, `${path}.id`, "a widget id is a lowercase slug");
  if (!isOneOf(value.kind, WIDGET_KINDS)) addError(errors, `${path}.kind`, `kind is one of ${WIDGET_KINDS.join(", ")}`);
  if (value.audience !== undefined && !isOneOf(value.audience, WIDGET_AUDIENCES)) addError(errors, `${path}.audience`, "audience is player or author");
  const title = readLabel(value.title, `${path}.title`, errors) ?? refuse(errors, `${path}.title`, "a widget needs a title", undefined);
  const visible = value.visible_when === undefined ? undefined : readGate(value.visible_when, `${path}.visible_when`, errors) ?? undefined;
  if (visible) validateGate(visible, qualityByKey, `${path}.visible_when`, errors);
  const options = readOptions(value.options, `${path}.options`, errors);
  const look = readLook(value, path, errors);
  if (!GAME_ID_PATTERN.test(id) || !isOneOf(value.kind, WIDGET_KINDS) || !title) return null;
  const audience = isOneOf(value.audience, WIDGET_AUDIENCES) ? value.audience : "player";
  const bind = readBind(value.bind, `${path}.bind`, errors) ?? DEFAULT_BIND[value.kind];
  if (!bind && (value.kind === "meters" || value.kind === "clock")) return refuse(errors, `${path}.bind`, `a ${value.kind} widget needs a bind`, null);
  const problem = bind ? bindProblem({ kind: value.kind, audience }, bind, qualityByKey, qualities) : null;
  if (problem) return refuse(errors, `${path}.bind`, problem, null);
  return { id, kind: value.kind, title, audience, ...(bind ? { bind } : {}), ...(options ? { options } : {}), ...(visible ? { visible_when: visible } : {}), ...look };
};

export const readWidgets = (value: unknown, qualityByKey: Record<string, Quality>, qualities: Quality[], errors: ValidationError[]): StoryWidget[] | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return refuse(errors, "widgets", "widgets are a list", undefined);
  const widgets = value.map((entry, index) => readWidget(entry, `widgets.${index}`, qualityByKey, qualities, errors)).filter((widget): widget is StoryWidget => widget !== null);
  const seen = new Set<string>();
  widgets.forEach((widget, index) => {
    if (seen.has(widget.id)) addError(errors, `widgets.${index}.id`, `duplicate widget '${widget.id}'`);
    seen.add(widget.id);
  });
  return widgets.length ? widgets : undefined;
};
