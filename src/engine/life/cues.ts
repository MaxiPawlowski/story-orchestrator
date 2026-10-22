import { evaluateGate, gateKeys } from "../gates";
import {
  CUE_MAX_OFFERS_DEFAULT, CUE_PRIORITY, CUE_WINDOW_DEFAULT, cueAtKey, cueLandedKey, normAtKey, normSeenKey, topicKey,
  type MemberCue, type MemberTopic, type StoryNorm,
} from "../cueSchema";
import type { DerivedQualityView } from "../engine";
import type { GateNode, LifeMember, NormalizedStory, PrimitiveValue } from "../schema";
import { isInCharacterPlayerLine } from "../ooc";
import { directlyAddressed } from "@talk/directAddress";
import { termPresent } from "@utils/termPresent";
import { fnv1a } from "@utils/fnv";
import { isAway } from "./presence";
import { knownEntities, unknownEntityNames } from "../codex";
import {
  consumedOf, occurrenceKey, type CuesState, type OfferCandidate, type OfferContext, type OfferLapse, type OfferReceipt, type OfferSource, type RaiseOccurrence,
} from "./offers";

type Values = Readonly<Record<string, PrimitiveValue>>;
type Write = { q: string; v: PrimitiveValue };
type CueStory = Pick<NormalizedStory, "life" | "roster">;

const reader = (values: Values) => ({ get: (key: string) => values[key] });
const holds = (gate: GateNode | undefined, values: Values): boolean => Boolean(gate && evaluateGate(gate, reader(values)));
const at = (values: Values, key: string): number | null => (typeof values[key] === "number" ? values[key] as number : null);
const rev = (parts: unknown[]): string => fnv1a(JSON.stringify(parts));

export const cueDefRev = (cue: MemberCue): string => rev(["cue", cue.kind, cue.when, cue.lane ?? "may", cue.window ?? null, cue.repeat ?? null, cue.landed_when ?? null, cue.max_offers ?? null]);
export const topicDefRev = (topic: MemberTopic): string => rev(["topic", topic.keys, topic.tiers.length, topic.tiers.map((tier) => tier.when ?? null)]);
export const normDefRev = (norm: StoryNorm): string => rev(["norm", norm.broken_when, norm.noticed_by, norm.checkpoints ?? null]);

export const cueKey = (member: string, id: string): string => `cue:${member}:${id}`;
export const normKey = (id: string, member: string): string => `norm:${id}:${member}`;
export const topicOfferKey = (occurrence: RaiseOccurrence): string => `topic:${occurrenceKey(occurrence)}`;

export const hasCueSources = (story: Pick<NormalizedStory, "life"> | null | undefined): boolean =>
  Boolean(story?.life?.norms?.length || story?.life?.members.some((member) => member.cues?.length || member.topics?.length));

const lifeMember = (story: Pick<NormalizedStory, "life">, id: string): LifeMember | undefined => story.life?.members.find((member) => member.id === id);

const memberCues = (story: Pick<NormalizedStory, "life">) => (story.life?.members ?? []).flatMap((member) => (member.cues ?? []).map((cue, index) => ({ member: member.id, cue, index })));

export const cueLatches = (story: Pick<NormalizedStory, "life" | "roster">, view: { boundary: number; values: Values; activeCheckpointId: string }): Write[] => {
  const reactions = memberCues(story).filter(({ member, cue }) => cue.kind === "reaction" && at(view.values, cueAtKey(member, cue.id)) === null && holds(cue.when, view.values))
    .map(({ member, cue }) => ({ q: cueAtKey(member, cue.id), v: view.boundary }));
  const norms = (story.life?.norms ?? []).filter((norm) => at(view.values, normAtKey(norm.id)) === null && (!norm.checkpoints?.length || norm.checkpoints.includes(view.activeCheckpointId))
    && holds(norm.broken_when, view.values)).flatMap((norm) => [
    { q: normAtKey(norm.id), v: view.boundary },
    ...norm.noticed_by.filter((member) => {
      const life = lifeMember(story, member);
      return !life || !isAway(life, view.values);
    }).map((member) => ({ q: normSeenKey(norm.id, member), v: view.boundary })),
  ]);
  return [...reactions, ...norms];
};

const countsAt = (receipt: OfferReceipt, before: number | undefined): boolean => before === undefined || receipt.messageId < before;

export const topicCount = (receipts: readonly OfferReceipt[], member: string, topic: MemberTopic, before?: number): number => {
  const defRev = topicDefRev(topic);
  const rows = receipts.filter((receipt) => receipt.source.kind === "topic" && receipt.source.member === member && receipt.source.topicId === topic.id
    && receipt.defRev === defRev && countsAt(receipt, before))
    .sort((left, right) => (left.source.kind === "topic" && right.source.kind === "topic" ? left.source.occurrence.messageId - right.source.occurrence.messageId : 0)
      || left.messageId - right.messageId);
  const seen = new Set<number>();
  let count = 0;
  for (const row of rows) {
    if (row.source.kind !== "topic" || seen.has(row.source.occurrence.messageId) || count >= topic.tiers.length) continue;
    seen.add(row.source.occurrence.messageId);
    if (row.source.tier === count + 1) count += 1;
  }
  return count;
};

const landedOffer = (receipts: readonly OfferReceipt[], member: string, cue: MemberCue, before: number): boolean =>
  receipts.some((receipt) => receipt.key === cueKey(member, cue.id) && receipt.defRev === cueDefRev(cue) && receipt.messageId < before);

export const cueDerive = (story: Pick<NormalizedStory, "life">, view: DerivedQualityView): Write[] => {
  const receipts = view.offers?.receipts ?? [];
  const landed = memberCues(story).filter(({ member, cue }) => cue.lane === "must" && at(view.values, cueLandedKey(member, cue.id)) === null
    && holds(cue.landed_when, view.values) && landedOffer(receipts, member, cue, view.lastMessageId))
    .map(({ member, cue }) => ({ q: cueLandedKey(member, cue.id), v: view.boundary }));
  const topics = (story.life?.members ?? []).flatMap((member) => (member.topics ?? []).flatMap((topic) => {
    const count = topicCount(receipts, member.id, topic, view.lastMessageId);
    return view.values[topicKey(member.id, topic.id)] === count ? [] : [{ q: topicKey(member.id, topic.id), v: count }];
  }));
  return [...landed, ...topics];
};

const cueCandidate = (ctx: OfferContext, member: string, cue: MemberCue, index: number): OfferCandidate | null => {
  const must = cue.lane === "must";
  if (must && at(ctx.values, cueLandedKey(member, cue.id)) !== null) return null;
  const latched = cue.kind === "reaction" ? at(ctx.values, cueAtKey(member, cue.id)) : null;
  if (cue.kind === "reaction" ? latched === null : !holds(cue.when, ctx.values)) return null;
  const window = latched !== null ? { from: latched, to: latched + (cue.window ?? CUE_WINDOW_DEFAULT) - 1 } : { from: ctx.boundary, to: null };
  return {
    key: cueKey(member, cue.id), defRev: cueDefRev(cue), source: { kind: "cue", member, cueId: cue.id }, recipient: member, lane: must ? "must" : "may",
    priority: cue.priority ?? CUE_PRIORITY.cue, order: index, text: cue.cue, copy: must ? "must" : "react", window,
    spend: must ? { max: cue.max_offers ?? CUE_MAX_OFFERS_DEFAULT } : cue.repeat ? { cooldown: cue.repeat.cooldown } : "once", gap: true,
  };
};

const normCandidate = (ctx: OfferContext, norm: StoryNorm, index: number): OfferCandidate | null => {
  const seen = at(ctx.values, normSeenKey(norm.id, ctx.recipient));
  if (seen === null || !norm.noticed_by.includes(ctx.recipient)) return null;
  return {
    key: normKey(norm.id, ctx.recipient), defRev: normDefRev(norm), source: { kind: "norm", normId: norm.id, member: ctx.recipient }, recipient: ctx.recipient, lane: "may",
    priority: norm.priority ?? CUE_PRIORITY.norm, order: index, text: norm.cue, copy: "react", window: { from: seen, to: seen + CUE_WINDOW_DEFAULT - 1 }, spend: "once", gap: true,
  };
};

export const raisedTopics = (ctx: OfferContext, member: LifeMember): Array<{ topic: MemberTopic; occurrence: RaiseOccurrence; index: number }> => {
  const line = ctx.latestPlayer;
  if (!line || !member.topics?.length || !isInCharacterPlayerLine({ is_user: true, mes: line.text })) return [];
  if (directlyAddressed(ctx.story.roster, line.text) !== member.id) return [];
  return member.topics.flatMap((topic, index) => (topic.keys.some((key) => termPresent(line.text, key))
    ? [{ topic, index, occurrence: { chatId: ctx.chatId, messageId: line.messageId, revision: line.revision, member: member.id, topicId: topic.id } }] : []));
};

const topicCandidates = (ctx: OfferContext, member: LifeMember): OfferCandidate[] => {
  const consumed = new Set(consumedOf(ctx.receipts));
  return raisedTopics(ctx, member).flatMap(({ topic, occurrence, index }): OfferCandidate[] => {
    if (consumed.has(occurrenceKey(occurrence))) return [];
    const count = topicCount(ctx.receipts, member.id, topic);
    const tier = topic.tiers[count];
    if (!tier || (tier.when && !holds(tier.when, ctx.values))) return [];
    return [{
      key: topicOfferKey(occurrence), defRev: topicDefRev(topic), source: { kind: "topic", member: member.id, topicId: topic.id, tier: count + 1, occurrence },
      recipient: member.id, lane: "may", priority: topic.priority ?? CUE_PRIORITY.topic, order: index, text: tier.cue, copy: "topic",
      window: { from: ctx.boundary, to: null }, spend: "once", gap: false,
    }];
  });
};

export const cueProvider = (ctx: OfferContext): OfferCandidate[] => {
  const member = lifeMember(ctx.story, ctx.recipient);
  const cues = (member?.cues ?? []).map((cue, index) => cueCandidate(ctx, ctx.recipient, cue, index));
  const norms = (ctx.story.life?.norms ?? []).map((norm, index) => normCandidate(ctx, norm, index));
  return [...cues, ...norms].filter((candidate): candidate is OfferCandidate => candidate !== null).concat(member ? topicCandidates(ctx, member) : []);
};

export const cueDiscoveryUnits = (story: Pick<NormalizedStory, "life">, values: Values): { entries: string[][]; facts: string[][] } => ({
  entries: [],
  facts: [
    ...memberCues(story).flatMap(({ member, cue }) => {
      if (cue.kind === "reaction" && at(values, cueAtKey(member, cue.id)) === null) return [gateKeys(cue.when)];
      return cue.lane === "must" && cue.landed_when && at(values, cueLandedKey(member, cue.id)) === null ? [gateKeys(cue.landed_when)] : [];
    }),
    ...(story.life?.norms ?? []).filter((norm) => at(values, normAtKey(norm.id)) === null).map((norm) => gateKeys(norm.broken_when)),
  ].filter((keys) => keys.length > 0),
});

export const cueSourceRev = (story: Pick<NormalizedStory, "life">, source: OfferSource): string | null => {
  if (source.kind === "echo") return null;
  if (source.kind === "norm") {
    const norm = story.life?.norms?.find((entry) => entry.id === source.normId);
    return norm && norm.noticed_by.includes(source.member) ? normDefRev(norm) : null;
  }
  const member = lifeMember(story, source.member);
  if (source.kind === "cue") {
    const cue = member?.cues?.find((entry) => entry.id === source.cueId);
    return cue ? cueDefRev(cue) : null;
  }
  const topic = member?.topics?.find((entry) => entry.id === source.topicId);
  return topic ? topicDefRev(topic) : null;
};

export const reconcileCues = (state: CuesState | undefined, previous: Pick<NormalizedStory, "life">, next: Pick<NormalizedStory, "life">): CuesState | undefined => {
  if (!state) return state;
  const kept = (source: OfferSource) => source.kind === "echo" || cueSourceRev(next, source) !== null;
  const unchanged = (source: OfferSource) => source.kind === "echo" || (cueSourceRev(next, source) !== null && cueSourceRev(next, source) === cueSourceRev(previous, source));
  const receipts = state.receipts.filter((receipt) => kept(receipt.source));
  const lapses = state.lapses.filter((lapse: OfferLapse) => unchanged(lapse.source));
  if (receipts.length === state.receipts.length && lapses.length === state.lapses.length) return state;
  return { receipts, lapses, consumed: consumedOf(receipts) };
};

export interface CueDiffRow {
  code: "cue-edited" | "cue-replaced" | "cue-removed";
  path: string;
  drop: string[];
  message: string;
}

const CUE_DIFF_COPY: Record<CueDiffRow["code"], string> = {
  "cue-edited": "A character cue was reworded or reordered; what this chat already offered stays and the next offer uses the new words.",
  "cue-replaced": "When a character cue applies changed; this chat's record of it starts again.",
  "cue-removed": "A character cue was removed.",
};

const row = (code: CueDiffRow["code"], path: string, drop: string[]): CueDiffRow => ({ code, path, drop, message: CUE_DIFF_COPY[code] });

const cueKeysOf = (member: string, cue: MemberCue): string[] => [cueAtKey(member, cue.id), cueLandedKey(member, cue.id)];

const sourceRows = <T extends { id: string }>(
  path: string, before: readonly T[], after: readonly T[], defRev: (entry: T) => string, keys: (entry: T) => string[],
): CueDiffRow[] => before.flatMap((entry): CueDiffRow[] => {
  const kept = after.find((other) => other.id === entry.id);
  if (!kept) return [row("cue-removed", `${path}.${entry.id}`, keys(entry))];
  if (defRev(kept) !== defRev(entry)) return [row("cue-replaced", `${path}.${entry.id}`, keys(entry))];
  return JSON.stringify(kept) === JSON.stringify(entry) ? [] : [row("cue-edited", `${path}.${entry.id}`, [])];
});

export const diffCues = (previous: CueStory, next: CueStory): CueDiffRow[] => {
  const members = previous.life?.members ?? [];
  const nextMember = (id: string) => next.life?.members.find((member) => member.id === id);
  return [
    ...members.flatMap((member) => [
      ...sourceRows(`roster.${member.id}.cues`, member.cues ?? [], nextMember(member.id)?.cues ?? [], cueDefRev, (cue) => cueKeysOf(member.id, cue)),
      ...sourceRows(`roster.${member.id}.topics`, member.topics ?? [], nextMember(member.id)?.topics ?? [], topicDefRev, (topic) => [topicKey(member.id, topic.id)]),
    ]),
    ...sourceRows("norms", previous.life?.norms ?? [], next.life?.norms ?? [], normDefRev, (norm) => [normAtKey(norm.id), ...norm.noticed_by.map((member) => normSeenKey(norm.id, member))]),
  ];
};

export interface CueAuthorRow {
  member: string;
  key: string;
  kind: OfferSource["kind"] | "remark" | "reaction";
  lane: "must" | "may";
  text: string;
  latchedAt: number | null;
  landedAt: number | null;
  offers: number;
}

export const cueAuthorRows = (story: Pick<NormalizedStory, "life">, values: Values, receipts: readonly OfferReceipt[]): CueAuthorRow[] => [
  ...memberCues(story).map(({ member, cue }) => ({
    member, key: cueKey(member, cue.id), kind: cue.kind, lane: cue.lane ?? "may", text: cue.cue, latchedAt: cue.kind === "reaction" ? at(values, cueAtKey(member, cue.id)) : null,
    landedAt: at(values, cueLandedKey(member, cue.id)), offers: receipts.filter((receipt) => receipt.key === cueKey(member, cue.id) && receipt.defRev === cueDefRev(cue)).length,
  })),
  ...(story.life?.members ?? []).flatMap((member) => (member.topics ?? []).map((topic) => ({
    member: member.id, key: `topic:${member.id}:${topic.id}`, kind: "topic" as const, lane: "may" as const, text: topic.tiers.map((tier) => tier.cue).join(" / "),
    latchedAt: null, landedAt: null, offers: topicCount(receipts, member.id, topic),
  }))),
  ...(story.life?.norms ?? []).flatMap((norm) => norm.noticed_by.map((member) => ({
    member, key: normKey(norm.id, member), kind: "norm" as const, lane: "may" as const, text: norm.cue, latchedAt: at(values, normSeenKey(norm.id, member)), landedAt: null,
    offers: receipts.filter((receipt) => receipt.key === normKey(norm.id, member) && receipt.defRev === normDefRev(norm)).length,
  }))),
];

export const landedCues = (story: Pick<NormalizedStory, "life">, before: Values, after: Values): Array<{ member: string; id: string }> =>
  memberCues(story).filter(({ member, cue }) => cue.lane === "must" && at(before, cueLandedKey(member, cue.id)) === null && at(after, cueLandedKey(member, cue.id)) !== null)
    .map(({ member, cue }) => ({ member, id: cue.id }));

export const namesUnknownEntity = (story: NormalizedStory, values: Values, enabled: readonly string[], line: string): boolean =>
  unknownEntityNames(story, knownEntities(story, values, enabled)).some((name) => termPresent(line, name));
