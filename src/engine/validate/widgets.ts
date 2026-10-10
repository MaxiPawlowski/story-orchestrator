import {
  WIDGET_ACCENTS, WIDGET_AUDIENCES, WIDGET_DRAWER_TABS, WIDGET_ICONS, WIDGET_KINDS, type Checkpoint, type GateNode, type Quality, type RosterMember, type StoryCheck,
  type StoryWidget, type Transition, type ValidationError, type WidgetBind, type WidgetClue, type WidgetClueLink, type WidgetIntent, type WidgetKind, type WidgetPin,
  type WidgetRosterRow,
} from "../schema";
import { checksById } from "../storyChecks";
import { isRecord } from "@utils/guards";
import { addError, asString, isOneOf, refuse, rejectUnknownKeys } from "./common";
import { readGate, validateGate } from "./gates";
import { GAME_ID_PATTERN, readLabel } from "./checks";

const WIDGET_KEYS = [
  "id", "kind", "title", "bind", "options", "visible_when", "audience", "accent", "icon", "clues", "links", "image", "pins", "template", "source", "actions", "rows", "dates",
] as const;
const OPTION_KEYS = ["limit", "closed"] as const;
const CLUE_KEYS = ["id", "text", "quality", "when", "action"] as const;
const LINK_KEYS = ["from", "to", "label"] as const;
const PIN_KEYS = ["id", "label", "x", "y", "checkpoint", "when", "action"] as const;
const ROW_KEYS = ["id", "label", "member", "quality", "when"] as const;
const ITEM_KEYS = ["clues", "links", "image", "pins", "template", "source", "rows", "dates"] as const;
const INTENT_KEYS = ["id", "text", "open", "check"] as const;
export const WIDGET_LIMIT_MAX = 50;
export const CLOCK_SEGMENTS = { min: 2, max: 12 } as const;
export const WIDGET_ITEMS_MAX = 40;
export const WIDGET_LINKS_MAX = 80;
export const CLUE_TEXT_MAX = 200;
export const MAP_IMAGE_PATTERN = /^[^/\\:?#%]{1,120}\.(png|jpe?g|webp|gif|avif|bmp)$/i;

export interface WidgetRefs {
  qualityByKey: Record<string, Quality>;
  qualities: Quality[];
  checkpointIds: ReadonlySet<string>;
  checkpoints?: readonly Pick<Checkpoint, "checks">[];
  transitions?: readonly Pick<Transition, "check">[];
  roster?: readonly Pick<RosterMember, "id">[];
}

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
  meters: ["quality", "qualities", "group"], track: ["path", "quests"], log: [], clock: ["quality"], board: ["quests", "arcs"], clues: [], map: [], html: [], roster: [], timeline: [],
};

const KIND_ITEMS: Record<WidgetKind, ReadonlyArray<(typeof ITEM_KEYS)[number]>> = {
  meters: [], track: [], log: [], clock: [], board: [], clues: ["clues", "links"], map: ["image", "pins"], html: ["template", "source"], roster: ["rows"], timeline: ["dates"],
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

const readFoundWhen = (value: Record<string, unknown>, path: string, refs: WidgetRefs, errors: ValidationError[]): GateNode | undefined => {
  if (value.quality !== undefined) {
    const key = asString(value.quality)?.trim() ?? "";
    const quality = refs.qualityByKey[key];
    if (!quality) return refuse(errors, `${path}.quality`, `unknown quality '${key}'`, undefined);
    if (quality.type !== "bool") return refuse(errors, `${path}.quality`, `'${key}' is not a bool, so it cannot say found; use when`, undefined);
    return { q: key, op: "==", v: true };
  }
  const gate = readGate(value.when, `${path}.when`, errors);
  if (gate) validateGate(gate, refs.qualityByKey, `${path}.when`, errors);
  return gate ?? undefined;
};

export const WIDGET_ACTION_MAX = 200;

const readAction = (value: unknown, path: string, errors: ValidationError[]): string | undefined => {
  if (value === undefined) return undefined;
  const text = typeof value === "string" ? value.trim() : "";
  if (text && text.length <= WIDGET_ACTION_MAX) return text;
  return refuse(errors, path, `an action is the player's own line, 1 to ${WIDGET_ACTION_MAX} characters, put in the box for them to send`, undefined);
};

const readList = (value: unknown, path: string, noun: string, max: number, errors: ValidationError[]): unknown[] | undefined => {
  if (!Array.isArray(value) || !value.length) return refuse(errors, path, `${noun} are a non-empty list`, undefined);
  if (value.length > max) return refuse(errors, path, `at most ${max} ${noun}`, undefined);
  return value;
};

const uniqueIds = (items: ReadonlyArray<{ id: string }>, path: string, noun: string, errors: ValidationError[]) => {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.id)) addError(errors, `${path}.${index}.id`, `duplicate ${noun} '${item.id}'`);
    seen.add(item.id);
  });
};

const readClue = (value: unknown, path: string, refs: WidgetRefs, errors: ValidationError[]): WidgetClue | null => {
  if (!isRecord(value)) return refuse(errors, path, "a clue is {id, text, quality} or {id, text, when}", null);
  rejectUnknownKeys(value, CLUE_KEYS, path, errors);
  const id = asString(value.id)?.trim() ?? "";
  if (!GAME_ID_PATTERN.test(id)) addError(errors, `${path}.id`, "a clue id is a lowercase slug");
  const text = asString(value.text)?.trim() ?? "";
  const textOk = text.length > 0 && text.length <= CLUE_TEXT_MAX;
  if (!textOk) addError(errors, `${path}.text`, `a clue's text is 1 to ${CLUE_TEXT_MAX} characters`);
  if ((value.quality === undefined) === (value.when === undefined)) return refuse(errors, path, "a clue is found by exactly one of quality or when", null);
  const when = readFoundWhen(value, path, refs, errors);
  const action = readAction(value.action, `${path}.action`, errors);
  return GAME_ID_PATTERN.test(id) && textOk && when ? { id, text, when, ...(action ? { action } : {}) } : null;
};

const readLink = (value: unknown, path: string, clueIds: ReadonlySet<string>, errors: ValidationError[]): WidgetClueLink | null => {
  if (!isRecord(value)) return refuse(errors, path, "a link is {from, to, label?}", null);
  rejectUnknownKeys(value, LINK_KEYS, path, errors);
  const from = asString(value.from)?.trim() ?? "";
  const to = asString(value.to)?.trim() ?? "";
  const label = readLabel(value.label, `${path}.label`, errors);
  if (!clueIds.has(from)) return refuse(errors, `${path}.from`, `'${from}' is not a clue of this widget`, null);
  if (!clueIds.has(to)) return refuse(errors, `${path}.to`, `'${to}' is not a clue of this widget`, null);
  if (from === to) return refuse(errors, path, "a link joins two different clues", null);
  return { from, to, ...(label ? { label } : {}) };
};

const readLinks = (value: unknown, path: string, clues: WidgetClue[], errors: ValidationError[]): WidgetClueLink[] | undefined => {
  if (value === undefined) return undefined;
  const list = readList(value, path, "links", WIDGET_LINKS_MAX, errors);
  if (!list) return undefined;
  const ids = new Set(clues.map((clue) => clue.id));
  const links = list.map((entry, index) => readLink(entry, `${path}.${index}`, ids, errors)).filter((link): link is WidgetClueLink => link !== null);
  const pairs = new Set<string>();
  links.forEach((link, index) => {
    const pair = [link.from, link.to].sort().join(" ");
    if (pairs.has(pair)) addError(errors, `${path}.${index}`, `'${link.from}' and '${link.to}' are linked twice`);
    pairs.add(pair);
  });
  return links.length ? links : undefined;
};

const isPercent = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;

const readPin = (value: unknown, path: string, refs: WidgetRefs, errors: ValidationError[]): WidgetPin | null => {
  if (!isRecord(value)) return refuse(errors, path, "a pin is {id, label, x, y, checkpoint} or {id, label, x, y, when}", null);
  rejectUnknownKeys(value, PIN_KEYS, path, errors);
  const id = asString(value.id)?.trim() ?? "";
  if (!GAME_ID_PATTERN.test(id)) addError(errors, `${path}.id`, "a pin id is a lowercase slug");
  const label = readLabel(value.label, `${path}.label`, errors) ?? refuse(errors, `${path}.label`, "a pin needs a label", undefined);
  if (!isPercent(value.x)) addError(errors, `${path}.x`, "x is a percentage of the image width, 0 to 100");
  if (!isPercent(value.y)) addError(errors, `${path}.y`, "y is a percentage of the image height, 0 to 100");
  if ((value.checkpoint === undefined) === (value.when === undefined)) return refuse(errors, path, "a pin shows by exactly one of checkpoint or when", null);
  const checkpoint = typeof value.checkpoint === "string" ? value.checkpoint.trim() : undefined;
  if (value.checkpoint !== undefined && (!checkpoint || !refs.checkpointIds.has(checkpoint))) return refuse(errors, `${path}.checkpoint`, `unknown checkpoint '${String(value.checkpoint)}'`, null);
  const when = value.when === undefined ? undefined : readFoundWhen({ when: value.when }, path, refs, errors);
  const action = readAction(value.action, `${path}.action`, errors);
  if (!GAME_ID_PATTERN.test(id) || !label || !isPercent(value.x) || !isPercent(value.y) || (!checkpoint && !when)) return null;
  return { id, label, x: value.x, y: value.y, ...(checkpoint ? { checkpoint } : {}), ...(when ? { when } : {}), ...(action ? { action } : {}) };
};

type WidgetItems = Pick<StoryWidget, "clues" | "links" | "image" | "pins" | "template" | "source" | "rows" | "dates">;

const readClueItems = (value: Record<string, unknown>, path: string, refs: WidgetRefs, errors: ValidationError[]): WidgetItems | null => {
  const list = readList(value.clues, `${path}.clues`, "clues", WIDGET_ITEMS_MAX, errors);
  if (!list) return null;
  const clues = list.map((entry, index) => readClue(entry, `${path}.clues.${index}`, refs, errors)).filter((clue): clue is WidgetClue => clue !== null);
  uniqueIds(clues, `${path}.clues`, "clue", errors);
  const links = readLinks(value.links, `${path}.links`, clues, errors);
  return clues.length ? { clues, ...(links ? { links } : {}) } : null;
};

const readMapItems = (value: Record<string, unknown>, path: string, refs: WidgetRefs, errors: ValidationError[]): WidgetItems | null => {
  const image = typeof value.image === "string" ? value.image.trim() : "";
  const imageOk = MAP_IMAGE_PATTERN.test(image);
  if (!imageOk) addError(errors, `${path}.image`, "image is the file name of a SillyTavern background (png, jpg, webp, gif, avif or bmp), never a path or a link");
  const list = readList(value.pins, `${path}.pins`, "pins", WIDGET_ITEMS_MAX, errors);
  if (!list) return null;
  const pins = list.map((entry, index) => readPin(entry, `${path}.pins.${index}`, refs, errors)).filter((pin): pin is WidgetPin => pin !== null);
  uniqueIds(pins, `${path}.pins`, "pin", errors);
  return imageOk && pins.length ? { image, pins } : null;
};

export const HTML_TEMPLATE_MAX = 32000;
export const WIDGET_INTENTS_MAX = 10;

type CheckRefs = { checks: ReadonlyMap<string, StoryCheck>; transitionChecks: ReadonlySet<string> };

const intentTarget = (value: Record<string, unknown>, path: string, { checks, transitionChecks }: CheckRefs, errors: ValidationError[]): Pick<WidgetIntent, "open" | "check"> | null => {
  if (value.open !== undefined && value.check !== undefined) return refuse(errors, path, "an action opens a drawer tab or asks for a roll, never both", null);
  if (value.open !== undefined) {
    return isOneOf(value.open, WIDGET_DRAWER_TABS) ? { open: value.open } : refuse(errors, `${path}.open`, `open is one of ${WIDGET_DRAWER_TABS.join(", ")}: the tabs every player has`, null);
  }
  if (value.check === undefined) return {};
  const id = asString(value.check)?.trim() ?? "";
  const check = checks.get(id);
  if (!check) return refuse(errors, `${path}.check`, `'${id}' is not a check of this story`, null);
  if (check.narrate !== "public") return refuse(errors, `${path}.check`, `'${id}' is a hidden check, so a player cannot be shown a button that asks for it`, null);
  if (!transitionChecks.has(id)) return refuse(errors, `${path}.check`, `'${id}' rolls by itself when its checkpoint starts; an action can ask only for a transition's check`, null);
  return { check: id };
};

const readIntent = (value: unknown, path: string, checks: CheckRefs, errors: ValidationError[]): WidgetIntent | null => {
  if (!isRecord(value)) return refuse(errors, path, "an action is {id, text, open?, check?}", null);
  rejectUnknownKeys(value, INTENT_KEYS, path, errors);
  const id = asString(value.id)?.trim() ?? "";
  if (!GAME_ID_PATTERN.test(id)) addError(errors, `${path}.id`, "an action id is a lowercase slug");
  const text = readAction(value.text, `${path}.text`, errors) ?? refuse(errors, `${path}.text`, "an action needs its text: the player's line, or the button's words when it opens a tab", undefined);
  const target = intentTarget(value, path, checks, errors);
  return GAME_ID_PATTERN.test(id) && text && target ? { id, text, ...target } : null;
};

const readIntents = (value: unknown, path: string, refs: WidgetRefs, errors: ValidationError[]): WidgetIntent[] | undefined => {
  if (value === undefined) return undefined;
  const list = readList(value, path, "actions", WIDGET_INTENTS_MAX, errors) ?? [];
  const checks = {
    checks: checksById({ checkpoints: [...(refs.checkpoints ?? [])] as Checkpoint[], transitions: [...(refs.transitions ?? [])] as Transition[] }),
    transitionChecks: new Set((refs.transitions ?? []).flatMap((transition) => (transition.check ? [transition.check.id] : []))),
  };
  const actions = list.map((entry, index) => readIntent(entry, `${path}.${index}`, checks, errors)).filter((intent): intent is WidgetIntent => intent !== null);
  uniqueIds(actions, path, "action", errors);
  return actions.length ? actions : undefined;
};

const readHtmlItems = (value: Record<string, unknown>, path: string, errors: ValidationError[]): WidgetItems | null => {
  const template = typeof value.template === "string" ? value.template : "";
  const templateOk = template.trim().length > 0 && template.length <= HTML_TEMPLATE_MAX;
  if (!templateOk) addError(errors, `${path}.template`, `template is the panel's HTML, 1 to ${HTML_TEMPLATE_MAX} characters`);
  const source = asString(value.source)?.trim() ?? "";
  if (!GAME_ID_PATTERN.test(source)) addError(errors, `${path}.source`, "source names the ordinary widget whose view this panel shows, and that stands in when story-made panels are off");
  if (!templateOk || !GAME_ID_PATTERN.test(source)) return null;
  return { template, source };
};

const readRow = (value: unknown, path: string, refs: WidgetRefs, audience: StoryWidget["audience"], errors: ValidationError[]): WidgetRosterRow | null => {
  if (!isRecord(value)) return refuse(errors, path, "a row is {id, member, quality} or {id, label, quality}, when?", null);
  rejectUnknownKeys(value, ROW_KEYS, path, errors);
  const id = asString(value.id)?.trim() ?? "";
  if (!GAME_ID_PATTERN.test(id)) addError(errors, `${path}.id`, "a row id is a lowercase slug");
  if ((value.label === undefined) === (value.member === undefined)) return refuse(errors, path, "a row is named by exactly one of member (a roster id) or label", null);
  const label = readLabel(value.label, `${path}.label`, errors);
  const member = value.member === undefined ? undefined : asString(value.member)?.trim() ?? "";
  if (member !== undefined && !refs.roster?.some((entry) => entry.id === member)) return refuse(errors, `${path}.member`, `'${member}' is not a cast member`, null);
  const key = asString(value.quality)?.trim() ?? "";
  const quality = refs.qualityByKey[key];
  if (!quality) return refuse(errors, `${path}.quality`, `unknown quality '${key}'`, null);
  if (quality.type !== "enum") return refuse(errors, `${path}.quality`, `'${key}' is not an enum, so it cannot name a status`, null);
  if (audience === "player" && quality.display?.public !== true) return refuse(errors, `${path}.quality`, `'${key}' is not public, so a player widget cannot show it`, null);
  const when = value.when === undefined ? undefined : readFoundWhen({ when: value.when }, path, refs, errors);
  if (!GAME_ID_PATTERN.test(id) || (!label && !member) || (value.when !== undefined && !when)) return null;
  return { id, ...(label ? { label } : {}), ...(member ? { member } : {}), quality: key, ...(when ? { when } : {}) };
};

const readRosterItems = (value: Record<string, unknown>, path: string, refs: WidgetRefs, audience: StoryWidget["audience"], errors: ValidationError[]): WidgetItems | null => {
  const list = readList(value.rows, `${path}.rows`, "rows", WIDGET_ITEMS_MAX, errors);
  if (!list) return null;
  const rows = list.map((entry, index) => readRow(entry, `${path}.rows.${index}`, refs, audience, errors)).filter((row): row is WidgetRosterRow => row !== null);
  uniqueIds(rows, `${path}.rows`, "row", errors);
  return rows.length ? { rows } : null;
};

const readDates = (value: Record<string, unknown>, path: string, refs: WidgetRefs, errors: ValidationError[]): WidgetItems | null => {
  if (value.dates === undefined) return {};
  if (!isRecord(value.dates)) return refuse(errors, `${path}.dates`, "dates are {checkpointId: label}", null);
  const dates = Object.entries(value.dates).flatMap(([id, label]): Array<[string, string]> => {
    if (!refs.checkpointIds.has(id)) return refuse(errors, `${path}.dates.${id}`, `unknown checkpoint '${id}'`, []);
    const text = readLabel(label, `${path}.dates.${id}`, errors);
    return text ? [[id, text]] : [];
  });
  return dates.length ? { dates: Object.fromEntries(dates) } : {};
};

const readItems = (kind: WidgetKind, value: Record<string, unknown>, path: string, refs: WidgetRefs, audience: StoryWidget["audience"], errors: ValidationError[]): WidgetItems | null => {
  ITEM_KEYS.filter((field) => value[field] !== undefined && !KIND_ITEMS[kind].includes(field))
    .forEach((field) => addError(errors, `${path}.${field}`, `a ${kind} widget has no ${field}`));
  if (kind === "clues") return readClueItems(value, path, refs, errors);
  if (kind === "map") return readMapItems(value, path, refs, errors);
  if (kind === "html") return readHtmlItems(value, path, errors);
  if (kind === "roster") return readRosterItems(value, path, refs, audience, errors);
  if (kind === "timeline") return readDates(value, path, refs, errors);
  return {};
};

const who = (audience: StoryWidget["audience"]) => (audience === "player" ? "players" : "authors");

const checkHtmlSources = (widgets: StoryWidget[], errors: ValidationError[]) => {
  const byId = new Map(widgets.map((widget) => [widget.id, widget]));
  const used = new Set<string>();
  widgets.forEach((widget, index) => {
    if (widget.kind !== "html" || !widget.source) return;
    const source = byId.get(widget.source);
    const path = `widgets.${index}.source`;
    if (!source) addError(errors, path, `'${widget.source}' is not a widget of this story`);
    else if (source.kind === "html") addError(errors, path, "an HTML panel's source is an ordinary widget, never another HTML panel");
    else if (source.audience !== widget.audience) addError(errors, path, `'${source.id}' is shown to ${who(source.audience)}, so this panel cannot show its view to ${who(widget.audience)}`);
    else if (used.has(source.id)) addError(errors, path, `'${source.id}' already backs another HTML panel`);
    used.add(widget.source);
  });
};

const readWidget = (value: unknown, path: string, refs: WidgetRefs, errors: ValidationError[]): StoryWidget | null => {
  const { qualityByKey, qualities } = refs;
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
  const actions = readIntents(value.actions, `${path}.actions`, refs, errors);
  const items = readItems(value.kind, value, path, refs, audience, errors);
  if (!items) return null;
  const bind = readBind(value.bind, `${path}.bind`, errors) ?? DEFAULT_BIND[value.kind];
  if (!bind && (value.kind === "meters" || value.kind === "clock")) return refuse(errors, `${path}.bind`, `a ${value.kind} widget needs a bind`, null);
  const problem = bind ? bindProblem({ kind: value.kind, audience }, bind, qualityByKey, qualities) : null;
  if (problem) return refuse(errors, `${path}.bind`, problem, null);
  return {
    id, kind: value.kind, title, audience, ...(bind ? { bind } : {}), ...(options ? { options } : {}), ...(visible ? { visible_when: visible } : {}), ...look, ...items,
    ...(actions ? { actions } : {}),
  };
};

export const readWidgets = (value: unknown, refs: WidgetRefs, errors: ValidationError[]): StoryWidget[] | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return refuse(errors, "widgets", "widgets are a list", undefined);
  const widgets = value.map((entry, index) => readWidget(entry, `widgets.${index}`, refs, errors)).filter((widget): widget is StoryWidget => widget !== null);
  uniqueIds(widgets, "widgets", "widget", errors);
  checkHtmlSources(widgets, errors);
  return widgets.length ? widgets : undefined;
};
