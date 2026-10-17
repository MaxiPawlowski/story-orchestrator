import { CLOCK_DAY_KEY, evaluateGate, relationshipKey, type GateNode, type LifeMember, type PrimitiveValue } from "@engine/index";
import { chanceSeed, unitDraw } from "@engine/chance";
import { whereabouts } from "@engine/life/presence";
import { rumorVersions, type GossipChannel, type GossipDelay, type HearsayStance, type Rumor, type StoryRumors } from "@engine/rumorSchema";
import type { SourceRevision } from "../audience";
import {
  HEARSAY_CAP, RUMOR_EVENTS_CAP, RUMOR_LANDINGS_PER_BOUNDARY,
  type HearsayRow, type RumorAt, type RumorDisclosure, type RumorDue, type RumorEvent, type RumorsState,
} from "./types";

type Values = Readonly<Record<string, PrimitiveValue>>;

export interface SecretCheck {
  barred: boolean;
  entryIds: string[];
}

export interface SpreadInput {
  state: RumorsState;
  net: StoryRumors;
  life: readonly LifeMember[];
  values: Values;
  at: RumorAt;
  chatId: string;
  storyId: string;
  enabled: readonly string[];
  secretFor: (text: string, member: string) => SecretCheck;
  revision: SourceRevision | null;
  horizonMessageId: number | null;
}

export interface SpreadResult {
  state: RumorsState;
  started: RumorEvent[];
  scheduled: RumorEvent[];
  landed: RumorEvent[];
  held: RumorEvent[];
  disclosed: RumorDisclosure[];
}

const holds = (gate: GateNode | undefined, values: Values): boolean => !gate || evaluateGate(gate, { get: (key) => values[key] });

export const occurrenceIdOf = (parts: { chatId: string; storyId: string; rumorId: string; from: string; to: string; hop: number; parent: string | null }): string => {
  const key = [parts.chatId, parts.storyId, parts.rumorId, parts.from, parts.to, parts.hop, parts.parent ?? ""];
  return `o${chanceSeed(key).toString(36)}${chanceSeed([...key, "occurrence"]).toString(36)}`;
};

const draw = (input: Pick<SpreadInput, "chatId" | "storyId">, occurrenceId: string, what: "delay" | "version"): number =>
  unitDraw([input.chatId, input.storyId, occurrenceId, what]);

const span = (range: [number, number], unit: number): number => range[0] + Math.min(range[1] - range[0], Math.floor(unit * (range[1] - range[0] + 1)));

const storyDay = (values: Values): number | null => (typeof values[CLOCK_DAY_KEY] === "number" ? values[CLOCK_DAY_KEY] as number : null);

const dueOf = (delay: GossipDelay, unit: number, at: RumorAt, values: Values): RumorDue => {
  if ("days" in delay) {
    const day = storyDay(values);
    if (day !== null) return { day: day + span(delay.days, unit) };
  }
  return { boundary: at.boundary + span("boundaries" in delay ? delay.boundaries : [0, 0], unit) };
};

const isDue = (due: RumorDue, at: RumorAt, values: Values): boolean => {
  if ("boundary" in due) return due.boundary <= at.boundary;
  const day = storyDay(values);
  return day !== null && due.day <= day;
};

const dueRank = (due: RumorDue): number => ("boundary" in due ? due.boundary : due.day);

export const pickVersion = (rumor: Rumor, unit: number): number => {
  const versions = rumorVersions(rumor);
  const total = versions.reduce((sum, version) => sum + version.weight, 0);
  let left = unit * total;
  for (let index = 0; index < versions.length; index += 1) {
    left -= versions[index].weight;
    if (left < 0) return index;
  }
  return versions.length - 1;
};

const inContact = (channel: GossipChannel, from: LifeMember | undefined, to: LifeMember | undefined, values: Values): boolean => {
  if (channel.contact === "any") return true;
  if (typeof channel.contact === "object") return holds(channel.contact, values);
  const here = from ? whereabouts(from, values) : null;
  const there = to ? whereabouts(to, values) : null;
  return here !== null && there !== null && here.trim().toLowerCase() === there.trim().toLowerCase();
};

export const stanceOf = (life: readonly LifeMember[], receiver: string, teller: string, values: Values): HearsayStance => {
  const relationship = life.find((member) => member.id === receiver)?.relationships.find((entry) => entry.toward === teller);
  if (!relationship?.axes.length) return "unsure";
  const value = values[relationshipKey(receiver, teller, relationship.axes[0])];
  const raw = typeof value === "number" ? value : relationship.start;
  const share = (raw - relationship.range[0]) / Math.max(1, relationship.range[1] - relationship.range[0]);
  return share >= 2 / 3 ? "believes" : share <= 1 / 3 ? "doubts" : "unsure";
};

const settledKey = (rumorId: string, to: string): string => `${rumorId}:${to}`;

const rumorSecret = (input: Pick<SpreadInput, "secretFor">, rumor: Rumor, to: string): SecretCheck => {
  const checks = [rumor.claim, ...rumorVersions(rumor).map((version) => version.text)].map((text) => input.secretFor(text, to));
  return { barred: checks.some((check) => check.barred), entryIds: [...new Set(checks.flatMap((check) => check.entryIds))] };
};

const evict = (state: RumorsState, horizon: number | null): RumorsState => {
  if (horizon === null) return state;
  const overflow = state.events.length - RUMOR_EVENTS_CAP;
  const old = overflow > 0 ? state.events.filter((event) => event.landedAt && event.landedAt.messageId < horizon).slice(0, overflow) : [];
  const rows = state.hearsay.length - HEARSAY_CAP;
  const stale = rows > 0 ? state.hearsay.filter((row) => row.told.messageId < horizon).slice(0, rows) : [];
  if (!old.length && !stale.length) return state;
  const gone = new Set(old);
  const dropped = new Set(stale);
  return {
    ...state,
    events: state.events.filter((event) => !gone.has(event)),
    hearsay: state.hearsay.filter((row) => !dropped.has(row)),
    settled: [...state.settled, ...old.map((event) => settledKey(event.rumorId, event.to))],
  };
};

export function spreadRumors(input: SpreadInput): SpreadResult {
  const { net, values, at } = input;
  const enabled = new Set(input.enabled);
  const lifeOf = (id: string) => input.life.find((member) => member.id === id);
  const events = [...input.state.events];
  const known = new Set([...input.state.settled, ...events.map((event) => settledKey(event.rumorId, event.to))]);
  const started: RumorEvent[] = [];
  const scheduled: RumorEvent[] = [];
  const held: RumorEvent[] = [];
  const add = (event: RumorEvent, into: RumorEvent[]) => {
    events.push(event);
    known.add(settledKey(event.rumorId, event.to));
    into.push(event);
  };
  for (const rumor of net.rumors) {
    if (known.has(settledKey(rumor.id, rumor.from)) || !enabled.has(rumor.from) || !holds(rumor.starts_when, values)) continue;
    const occurrenceId = occurrenceIdOf({ ...input, rumorId: rumor.id, from: rumor.from, to: rumor.from, hop: 0, parent: null });
    add({ occurrenceId, rumorId: rumor.id, from: rumor.from, to: rumor.from, hop: 0, parent: null, scheduledAt: at, due: { boundary: at.boundary }, version: 0, landedAt: at }, started);
  }
  const rumorById = new Map(net.rumors.map((rumor) => [rumor.id, rumor]));
  const schedule = (rumor: Rumor, parent: RumorEvent, to: string, delay: GossipDelay, leak: boolean) => {
    const hop = parent.hop + 1;
    const occurrenceId = occurrenceIdOf({ ...input, rumorId: rumor.id, from: parent.to, to, hop, parent: parent.occurrenceId });
    const version = pickVersion(rumor, draw(input, occurrenceId, "version"));
    if (!leak && rumorSecret(input, rumor, to).barred) return;
    const event: RumorEvent = {
      occurrenceId, rumorId: rumor.id, from: parent.to, to, hop, parent: parent.occurrenceId, scheduledAt: at,
      due: dueOf(delay, draw(input, occurrenceId, "delay"), at, values), version, ...(leak ? { leak: true as const } : {}),
    };
    add(event, scheduled);
  };
  const holders = events.filter((event) => event.landedAt).sort((left, right) => left.occurrenceId.localeCompare(right.occurrenceId));
  for (const holder of holders) {
    const rumor = rumorById.get(holder.rumorId);
    if (!rumor || !enabled.has(holder.to)) continue;
    for (const channel of net.channels.filter((entry) => entry.from === holder.to && holder.hop < entry.hops && holds(entry.when, values))) {
      for (const to of channel.talks_to) {
        if (!enabled.has(to) || known.has(settledKey(rumor.id, to)) || !inContact(channel, lifeOf(holder.to), lifeOf(to), values)) continue;
        schedule(rumor, holder, to, channel.delay, false);
      }
    }
  }
  for (const rumor of net.rumors) {
    const origin = events.find((event) => event.rumorId === rumor.id && event.hop === 0 && event.landedAt);
    if (!origin) continue;
    for (const leak of rumor.leaks_to ?? []) {
      if (!enabled.has(leak.member) || known.has(settledKey(rumor.id, leak.member)) || !holds(leak.when, values)) continue;
      schedule(rumor, origin, leak.member, net.channels.find((channel) => channel.from === rumor.from)?.delay ?? { boundaries: [0, 0] }, true);
    }
  }
  const landed: RumorEvent[] = [];
  const disclosed: RumorDisclosure[] = [];
  const hearsay: HearsayRow[] = [];
  const due = events.filter((event) => !event.landedAt && isDue(event.due, at, values))
    .sort((left, right) => dueRank(left.due) - dueRank(right.due) || left.occurrenceId.localeCompare(right.occurrenceId));
  for (const event of due) {
    if (landed.length >= RUMOR_LANDINGS_PER_BOUNDARY) break;
    const rumor = rumorById.get(event.rumorId);
    if (!rumor || !enabled.has(event.to)) continue;
    const claim = rumorVersions(rumor)[event.version]?.text ?? rumor.claim;
    const secret = rumorSecret(input, rumor, event.to);
    if (secret.barred && !event.leak) {
      held.push(event);
      continue;
    }
    const index = events.indexOf(event);
    events[index] = { ...event, landedAt: at };
    landed.push(events[index]);
    hearsay.push({ occurrenceId: event.occurrenceId, receiver: event.to, teller: event.from, rumorId: event.rumorId, claim,
      stance: stanceOf(input.life, event.to, event.from, values), told: { messageId: at.messageId, revision: input.revision } });
    if (event.leak) secret.entryIds.forEach((entryId) => disclosed.push({ entryId, member: event.to, occurrenceId: event.occurrenceId, at }));
  }
  const state = evict({
    events, hearsay: [...input.state.hearsay, ...hearsay], disclosures: [...input.state.disclosures, ...disclosed], settled: input.state.settled,
  }, input.horizonMessageId);
  return { state, started, scheduled, landed, held, disclosed };
}
