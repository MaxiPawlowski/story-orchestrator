import type { BoundaryLogEntry, EngineState, NormalizedStory, PrimitiveValue } from "@engine/index";
import { gameLayer } from "@engine/validate/gameLayer";
import type {
  CuesState, OfferCandidate, OfferContext, OfferEvidence, OfferLapse, OfferLapseReason, OfferProvider, OfferReceipt, OfferSelection,
} from "@engine/life/offers";
import type { CueAuthorRow } from "@engine/life/cues";
import { fnv1a } from "@utils/fnv";
import { isRecord } from "@utils/guards";
import { messageRevision } from "./yourMove";
import { rosterIdForName } from "./roster";
import type { RuntimeExtras } from "./types";

export interface CueOfferPreview {
  member: string;
  winner: string | null;
  tiedWith: string[];
  ranked: string[];
  dropped: Array<{ key: string; reason: string }>;
}

export interface CuesAuthorView {
  rows: CueAuthorRow[];
  previews: CueOfferPreview[];
  receipts: OfferReceipt[];
  lapses: OfferLapse[];
}

export type OfferProviderId = "cues" | "echoes";

export interface OfferRegistry {
  providers: Map<OfferProviderId, OfferProvider>;
  lapseListeners: Map<OfferProviderId, (lapse: OfferLapse) => void>;
}

export interface CuePortDeps {
  story: () => NormalizedStory | null;
  state: () => EngineState | null;
  lastEntry: () => BoundaryLogEntry | undefined;
  extras: () => RuntimeExtras;
  chatId: () => string | null;
  rows: () => readonly unknown[];
  enabledIds: () => string[];
  enabled: () => boolean;
  refuses: (text: string, rosterId: string | null) => boolean;
  appliedBlock: () => string;
  historyFloor: () => number | null;
  persist: () => void;
  notify: () => void;
  journal: (summary: string, note: string) => void;
}

interface Pending {
  candidate: OfferCandidate;
  line: string;
  boundary: number;
  reached: boolean;
}

type Values = Readonly<Record<string, PrimitiveValue>>;

export const revisionKey = (row: unknown): string | null => {
  const revision = messageRevision(row);
  return revision ? `${revision.swipeId ?? "-"}.${revision.hash}` : null;
};

const latestPlayerOf = (rows: readonly unknown[]): OfferContext["latestPlayer"] => {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (!isRecord(row) || row.is_system || !row.is_user) continue;
    const revision = revisionKey(row);
    return revision && typeof row.mes === "string" ? { messageId: index, revision, text: row.mes } : null;
  }
  return null;
};

const REPLACING = new Set(["swipe", "regenerate"]);

function createCueCore(deps: CuePortDeps, { providers }: OfferRegistry) {
  const refusals = new Map<string, OfferLapseReason>();
  const kit = () => gameLayer()?.cues ?? null;
  const cues = (): CuesState => deps.extras().cues ?? { receipts: [], lapses: [], consumed: [] };
  let held: EngineState | null | undefined;
  const snapshot = () => (held === undefined ? deps.state() : held);
  const values = (): Values => snapshot()?.blackboard.values ?? {};
  const boundary = () => snapshot()?.boundary ?? 0;
  const once = <T,>(fn: () => T): T => {
    if (held !== undefined) return fn();
    held = deps.state();
    try { return fn(); } finally { held = undefined; }
  };
  const ownOn = () => Boolean(deps.enabled() && kit()?.hasCueSources(deps.story()));
  const sources = (): Array<[OfferProviderId, OfferProvider]> => {
    const layer = kit();
    return [...(layer && ownOn() ? [["cues", layer.cueProvider] as [OfferProviderId, OfferProvider]] : []), ...providers.entries()];
  };
  const active = () => Boolean(deps.story() && kit() && (ownOn() || providers.size));
  const revisionAt = (messageId: number) => revisionKey(deps.rows()[messageId]);
  const liveReceipts = (): OfferReceipt[] => kit()?.liveCueReceipts(cues().receipts, revisionAt) ?? [];
  const context = (story: NormalizedStory, recipient: string, receipts: readonly OfferReceipt[]): OfferContext => ({
    story, values: values(), boundary: boundary(), recipient, chatId: String(deps.chatId() ?? ""), latestPlayer: latestPlayerOf(deps.rows()), receipts,
  });
  const recipientState = (story: NormalizedStory, recipient: string): "ok" | "recipient-away" | "recipient-disabled" => {
    if (!deps.enabledIds().includes(recipient)) return "recipient-disabled";
    const life = story.life?.members.find((member) => member.id === recipient);
    return life && gameLayer()?.life.awayMembers(story, values()).includes(recipient) ? "recipient-away" : "ok";
  };
  const refuseFor = (story: NormalizedStory, recipient: string) => (line: string): "held-secret" | "unknown-entity" | null => {
    if (deps.refuses(line, recipient)) return "held-secret";
    if (story.roster.find((member) => member.id === recipient)?.view !== "omniscient") return null;
    if (deps.refuses(line, null)) return "held-secret";
    return kit()?.namesUnknownEntity(story, values(), deps.enabledIds(), line) ? "unknown-entity" : null;
  };
  const candidatesFor = (story: NormalizedStory, recipient: string, receipts: readonly OfferReceipt[]) =>
    sources().flatMap(([id, provider]) => provider(context(story, recipient, receipts)).map((candidate) => ({ id, candidate })));
  const select = (recipient: string, receipts: readonly OfferReceipt[]): OfferSelection | null => {
    const story = deps.story();
    const layer = kit();
    if (!story || !layer) return null;
    const candidates = candidatesFor(story, recipient, receipts).map(({ candidate }) => candidate);
    return layer.selectOffer({ candidates, receipts, boundary: boundary(), recipient: recipientState(story, recipient), refuse: refuseFor(story, recipient) });
  };
  const remember = (selection: OfferSelection) => selection.dropped.forEach(({ candidate, reason }) => {
    if (reason === "held-secret" || reason === "unknown-entity" || reason === "recipient-away" || reason === "recipient-disabled") refusals.set(`${candidate.key}@${candidate.defRev}`, reason);
  });
  return { kit, cues, values, boundary, once, active, revisionAt, liveReceipts, recipientState, candidatesFor, select, remember, refusals };
}

export function createCueRuntime(deps: CuePortDeps, registry: OfferRegistry) {
  const { kit, cues, values, boundary, once, active, revisionAt, liveReceipts, recipientState, candidatesFor, select, remember, refusals } = createCueCore(deps, registry);
  const { lapseListeners } = registry;
  let pending: Pending | null = null;
  let generation: string | null = null;
  let replacing: number | null = null;
  const draft = (rosterId: string | null) => once(() => {
    pending = null;
    if (!rosterId || !active()) return;
    const receipts = liveReceipts().filter((receipt) => replacing === null || receipt.messageId !== replacing);
    const selection = select(rosterId, receipts);
    if (!selection) return;
    remember(selection);
    if (selection.winner) pending = { candidate: selection.winner.candidate, line: selection.winner.line, boundary: boundary(), reached: false };
  });
  const writeReceipt = (held: Pending, messageId: number) => {
    const story = deps.story();
    const layer = kit();
    const row = deps.rows()[messageId];
    const revision = revisionAt(messageId);
    if (!story || !layer || !revision || !isRecord(row) || row.is_user || typeof row.name !== "string" || rosterIdForName(story, row.name) !== held.candidate.recipient) return;
    const { candidate } = held;
    const receipt: OfferReceipt = {
      key: candidate.key, defRev: candidate.defRev, source: candidate.source, recipient: candidate.recipient, chatId: String(deps.chatId() ?? ""),
      messageId, revision, boundary: held.boundary, textHash: fnv1a(held.line), ...(candidate.gap ? { gap: true as const } : {}),
    };
    deps.extras().cues = layer.withCueReceipt(cues(), receipt, deps.historyFloor());
    deps.journal("cue offered", `${candidate.recipient}: ${candidate.key} (${candidate.lane}), message ${messageId}`);
    const spend = candidate.spend;
    const offered = cues().receipts.filter((other) => other.key === candidate.key && other.defRev === candidate.defRev).length;
    if (candidate.lane === "must" && typeof spend === "object" && "max" in spend && offered >= spend.max) {
      deps.journal("cue not landed", `${candidate.recipient}: ${candidate.key} not landed after ${offered} offers`);
    }
    deps.persist();
    deps.notify();
  };
  const sweepLapses = (now: number): boolean => {
    const story = deps.story();
    const layer = kit();
    if (!story || !layer || !active()) return false;
    const receipts = liveReceipts();
    const lapses: OfferLapse[] = [];
    const listeners: Array<() => void> = [];
    story.roster.forEach((member) => candidatesFor(story, member.id, receipts).forEach(({ id, candidate }) => {
      const tag = `${candidate.key}@${candidate.defRev}`;
      const window = candidate.window;
      const state = recipientState(story, member.id);
      if (state !== "ok" && window.from <= now && (window.to === null || now <= window.to)) refusals.set(tag, state);
      if (window.to === null || window.to >= now || receipts.some((receipt) => receipt.key === candidate.key && receipt.defRev === candidate.defRev)) return;
      if (cues().lapses.some((lapse) => lapse.key === candidate.key && lapse.defRev === candidate.defRev)) return;
      const lapse: OfferLapse = { key: candidate.key, recipient: candidate.recipient, at: now, reason: refusals.get(tag) ?? "window-ended", defRev: candidate.defRev, source: candidate.source };
      lapses.push(lapse);
      const listener = lapseListeners.get(id);
      if (listener) listeners.push(() => listener(lapse));
    }));
    if (!lapses.length) return false;
    deps.extras().cues = layer.withCueLapses(cues(), lapses);
    lapses.forEach((lapse) => deps.journal("offer lapsed", `${lapse.recipient}: ${lapse.key} (${lapse.reason})`));
    listeners.forEach((call) => call());
    return true;
  };
  return {
    active,
    draft,
    perDraft: (rosterId: string) => pending?.candidate.recipient === rosterId,
    lines: (rosterId: string): string[] => (pending?.candidate.recipient === rosterId ? [pending.line] : []),
    staged() { if (pending) pending.reached = deps.appliedBlock().includes(pending.line); },
    opened(type: unknown) {
      generation = typeof type === "string" ? type : null;
      const rows = deps.rows();
      const last = rows.length - 1;
      replacing = generation && REPLACING.has(generation) && last >= 0 && isRecord(rows[last]) && !(rows[last] as Record<string, unknown>).is_user ? last : null;
    },
    settle(rendered: boolean, messageId: number | undefined) {
      const held = pending;
      const type = generation;
      pending = null;
      generation = null;
      replacing = null;
      const layer = kit();
      if (rendered && messageId !== undefined && type === "continue" && layer) {
        const revision = revisionAt(messageId);
        if (revision && cues().receipts.some((receipt) => receipt.messageId === messageId)) deps.extras().cues = layer.rebindCueReceipts(cues(), messageId, revision);
      }
      if (held?.reached && rendered && messageId !== undefined) writeReceipt(held, messageId);
    },
    evidence: (): OfferEvidence | undefined => {
      const layer = kit();
      return layer && deps.extras().cues?.receipts.length ? layer.cueEvidence(liveReceipts()) : undefined;
    },
    onBoundary: () => once(() => {
      const story = deps.story();
      const layer = kit();
      if (!story || !layer || !active()) return;
      const rearmed = layer.rearmCues(cues(), revisionAt);
      if (rearmed) deps.extras().cues = rearmed;
      const entry = deps.lastEntry();
      if (entry) layer.landedCues(story, entry.before.blackboard.values, entry.after.blackboard.values)
        .forEach((cue) => deps.journal("cue landed", `${cue.member}: ${cue.id} at boundary ${entry.boundary}`));
      if (sweepLapses(boundary()) || rearmed) deps.persist();
    }),
    authorView: (authorView: boolean): CuesAuthorView | null => once(() => {
      const story = deps.story();
      const layer = kit();
      if (!authorView || !story || !layer || !active()) return null;
      const receipts = liveReceipts();
      const previews = story.roster.map((member): CueOfferPreview => {
        const selection = select(member.id, receipts);
        return {
          member: member.id, winner: selection?.winner?.candidate.key ?? null, tiedWith: selection?.tiedWith ?? [], ranked: selection?.ranked.map(({ candidate }) => candidate.key) ?? [],
          dropped: (selection?.dropped ?? []).filter(({ reason }) => reason !== "not-yet").map(({ candidate, reason }) => ({ key: candidate.key, reason })),
        };
      }).filter((preview) => preview.ranked.length || preview.dropped.length);
      return { rows: layer.cueAuthorRows(story, values(), receipts), previews, receipts: cues().receipts.slice(-40), lapses: cues().lapses.slice(-40) };
    }),
  };
}

export type CueRuntime = ReturnType<typeof createCueRuntime>;
