import type { QueueDrainResult } from "./applyQueue";
import type { Blackboard } from "./blackboard";
import { isRecord } from "@utils/guards";
import type { StoryLife } from "./lifeSchema";
import type { GateLeaf, PrimitiveValue, Quality, ValidationError } from "./schema";

export const SOCIAL_ACTS = ["helped", "protected", "lied", "threatened", "insulted", "gifted", "betrayed", "confided"] as const;
export type SocialAct = typeof SOCIAL_ACTS[number];

export const ACT_LOG_PREFIX = "act_log_";
export const ACT_COUNT_PREFIX = "act_n_";
export const ACT_LOG_CAP = 24;
export const ACT_WITHIN_DEFAULT = 10;
export const ACT_WITHIN_MAX = 200;

export interface ActWindow {
  key: string;
  act: SocialAct;
  by: string;
  to: string;
  within: number;
}

export interface ActPair {
  by: string;
  to: string;
  log: string;
  keys: string[];
}

declare module "./schema" {
  interface NormalizedStory {
    socialActWindows?: ActWindow[];
  }
}

export const actLogKey = (by: string, to: string): string => `${ACT_LOG_PREFIX}${by}_${to}`;
export const actCountKey = (act: string, by: string, to: string, within: number): string => `${ACT_COUNT_PREFIX}${act}_${by}_${to}_${within}`;
export const isActLogKey = (key: string): boolean => key.startsWith(ACT_LOG_PREFIX);
export const isActCountKey = (key: string): boolean => key.startsWith(ACT_COUNT_PREFIX);

const isSocialAct = (value: unknown): value is SocialAct => typeof value === "string" && (SOCIAL_ACTS as readonly string[]).includes(value);
const intIn = (value: unknown, min: number, max: number): value is number => Number.isInteger(value) && (value as number) >= min && (value as number) <= max;

export const isActLeaf = (value: Record<string, unknown>): boolean => "act" in value && !("q" in value);

export interface ActLeaf extends ActWindow {
  count: number;
}

export function readActLeaf(value: Record<string, unknown>, path: string, errors: ValidationError[]): ActLeaf | null {
  const fail = (field: string, message: string) => { errors.push({ path: `${path}.${field}`, message }); return null; };
  if (!isSocialAct(value.act)) return fail("act", `act is one of ${SOCIAL_ACTS.join(", ")}`);
  if (typeof value.by !== "string" || !value.by.trim()) return fail("by", "by is a roster id or \"player\"");
  if (typeof value.to !== "string" || !value.to.trim()) return fail("to", "to is a roster id or \"player\"");
  const within = value.within ?? ACT_WITHIN_DEFAULT;
  if (!intIn(within, 1, ACT_WITHIN_MAX)) return fail("within", `within is a whole number of boundaries from 1 to ${ACT_WITHIN_MAX}`);
  const count = value.count ?? 1;
  if (!intIn(count, 1, ACT_LOG_CAP)) return fail("count", `count is a whole number from 1 to ${ACT_LOG_CAP}`);
  const [by, to] = [value.by.trim(), value.to.trim()];
  return { key: actCountKey(value.act, by, to, within), act: value.act, by, to, within, count };
}

export const actLeafGate = (leaf: ActLeaf): GateLeaf => ({ q: leaf.key, op: ">=", v: leaf.count });

export function actLeavesIn(json: unknown, path = "$", out: Array<{ leaf: Record<string, unknown>; path: string }> = []) {
  if (Array.isArray(json)) json.forEach((item, index) => actLeavesIn(item, `${path}.${index}`, out));
  else if (isRecord(json)) {
    if (isActLeaf(json) && isSocialAct(json.act)) out.push({ leaf: json, path });
    else Object.entries(json).forEach(([key, item]) => actLeavesIn(item, `${path}.${key}`, out));
  }
  return out;
}

export const actPairs = (life: Pick<StoryLife, "members"> | undefined): ActPair[] =>
  (life?.members ?? []).flatMap((member) => member.relationships.map((relationship) => ({
    by: relationship.toward, to: member.id, log: actLogKey(relationship.toward, member.id),
    keys: relationship.axes.map((axis) => `rel_${member.id}_${relationship.toward}_${axis}`),
  })));

export function addActQualities(qualities: Quality[], life: Pick<StoryLife, "members"> | undefined, json: unknown, errors: ValidationError[]): { qualities: Quality[]; windows: ActWindow[] } {
  const pairs = actPairs(life);
  const windows = new Map<string, ActWindow>();
  for (const { leaf, path } of actLeavesIn(json)) {
    const read = readActLeaf(leaf, path, []);
    if (!read) continue;
    if (!pairs.some((pair) => pair.by === read.by && pair.to === read.to)) {
      errors.push({ path, message: `act leaf needs a relationship that ${read.to} holds toward ${read.by}` });
      continue;
    }
    windows.set(read.key, { key: read.key, act: read.act, by: read.by, to: read.to, within: read.within });
  }
  if (!pairs.length) return { qualities, windows: [] };
  const taken = new Set(qualities.map((quality) => quality.key));
  const added: Quality[] = [
    ...pairs.filter((pair) => !taken.has(pair.log)).map((pair): Quality => ({ key: pair.log, type: "string", source: "code",
      rubric: `Recent social acts by ${pair.by} toward ${pair.to} (boundary:act), newest last.` })),
    ...[...windows.values()].filter((window) => !taken.has(window.key)).map((window): Quality => ({ key: window.key, type: "int", source: "code",
      rubric: `How many times ${window.by} ${window.act} ${window.to} in the last ${window.within} boundaries.` })),
  ];
  return { qualities: [...qualities, ...added], windows: [...windows.values()] };
}

export const parseActLog = (value: PrimitiveValue | undefined): Array<{ boundary: number; act: string }> =>
  (typeof value === "string" ? value.split(" ") : []).flatMap((item) => {
    const [at, act] = item.split(":");
    return Number.isInteger(Number(at)) && act ? [{ boundary: Number(at), act }] : [];
  });

export function actPass(story: { life?: Pick<StoryLife, "members">; socialActWindows?: readonly ActWindow[] }, queue: QueueDrainResult, boundary: number,
  blackboard: Pick<Blackboard, "entries" | "applyDelta">): QueueDrainResult {
  for (const write of actWrites(story.life, story.socialActWindows, queue.applied, boundary, blackboard.entries())) blackboard.applyDelta({ ...write, source: "code" });
  return queue;
}

export function actWrites(life: Pick<StoryLife, "members"> | undefined, windows: readonly ActWindow[] | undefined, applied: QueueDrainResult["applied"],
  boundary: number, values: Readonly<Record<string, PrimitiveValue>>): Array<{ q: string; v: PrimitiveValue }> {
  const pairs = actPairs(life);
  if (!pairs.length) return [];
  const byKey = new Map(pairs.flatMap((pair) => pair.keys.map((key): [string, ActPair] => [key, pair])));
  const landed = new Map<string, string[]>();
  for (const entry of applied) {
    for (const delta of entry.deltas) {
      const pair = delta.act && isSocialAct(delta.act) ? byKey.get(delta.q) : undefined;
      if (!pair || !entry.outcomes.some((outcome) => outcome.key === delta.q && outcome.ok)) continue;
      const acts = landed.get(pair.log) ?? [];
      if (!acts.includes(delta.act as string)) landed.set(pair.log, [...acts, delta.act as string]);
    }
  }
  const writes: Array<{ q: string; v: PrimitiveValue }> = [];
  const logs = new Map(pairs.map((pair) => [pair.log, parseActLog(values[pair.log])]));
  landed.forEach((acts, log) => {
    const next = [...(logs.get(log) ?? []), ...acts.map((act) => ({ boundary, act }))].slice(-ACT_LOG_CAP);
    logs.set(log, next);
    writes.push({ q: log, v: next.map((item) => `${item.boundary}:${item.act}`).join(" ") });
  });
  for (const window of windows ?? []) {
    const count = (logs.get(actLogKey(window.by, window.to)) ?? []).filter((item) => item.act === window.act && item.boundary > boundary - window.within).length;
    if (values[window.key] !== count) writes.push({ q: window.key, v: count });
  }
  return writes;
}
