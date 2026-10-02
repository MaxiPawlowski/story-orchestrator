import type { ApplyQueueEntry, BoundaryLogEntry, NormalizedStoryV2, PrimitiveValue } from "@engine/index";
import type { SharedReadAudit, ReconciliationEvent } from "@extraction/index";
import type { JudgeCallRecord } from "@judge/index";
import type { ArcEntry, ConflictPair, DerivedRecord, MemoryEntry } from "@memory/index";
import type { CuratorOp, CuratorOpRecord, CuratorPassAudit, CuratorProposalRecord } from "@stagecraft/index";
import type { LoreFiredRecord } from "./loreFired";
import type { PipelineStatus } from "./pipeline";
import {
  castChangeText, chosenToSpeakText, DERIVED_PLAYER_COPY, inlineTransitionText, loreConsultedText, PLAYER_COPY, readNotedText, rememberedText, steppedBackText,
  tensionLevelText, threadOpenedText, threadResolvedText, type RollbackNotice,
} from "./narrative";
import { REFUSAL_PLAYER_TEXT } from "./agencyRecovery";
import { effectiveInlineLevel, PLAYER_LEVEL_CAP, type InlineCategory, type InlineLevel, type InlineSettings } from "./settingsModel";
import type { EffectLedgerRow, EffectLedgerStatus, PayloadCapture, TalkDecisionAudit, TensionHistoryRow, VerifyDrop } from "./types";
import type { JournalRecord } from "./journal";

export type InlineState = "live" | "pending" | "applied" | "refused";

export type InlineAction =
  | { kind: "pin-fact"; id: string; pinned: boolean }
  | { kind: "exclude-fact"; id: string }
  | { kind: "lock-fact"; id: string; locked: boolean }
  | { kind: "curator-op"; proposalId: string; index: number; decision: "accepted" | "rejected" }
  | { kind: "resolve-conflict"; key: string; keepId: string; label: string };

export interface InlineItem {
  id: string;
  category: InlineCategory;
  level: InlineLevel;
  until?: InlineLevel;
  persona: "player" | "author";
  state: InlineState;
  text: string;
  detail?: string;
  actions?: InlineAction[];
}

export interface InlineView {
  level: InlineLevel;
  requested: InlineLevel;
  window: number;
  categories: Partial<Record<InlineCategory, boolean>>;
  newestMessageId: number;
  byMessage: Record<number, InlineItem[]>;
}

export interface InlineSources {
  story: NormalizedStoryV2 | null;
  settings: InlineSettings;
  authorView: boolean;
  chatLength: number;
  boundaryLog: BoundaryLogEntry[];
  audits: SharedReadAudit[];
  pending: ApplyQueueEntry[];
  reconciliation: ReconciliationEvent[];
  memory: { entries: MemoryEntry[]; arcs: ArcEntry[]; derived: DerivedRecord[]; conflicts: ConflictPair[]; verifyDrops: VerifyDrop[] };
  loreFired: LoreFiredRecord[];
  talkDecisions: TalkDecisionAudit[];
  judgeCalls: JudgeCallRecord[];
  proposals: CuratorProposalRecord[];
  curatorPass: CuratorPassAudit | null;
  effects: EffectLedgerRow[];
  tensionHistory: TensionHistoryRow[];
  tension: { expected: number | null; hint: string | null };
  payloadCaptures: PayloadCapture[];
  pipeline: PipelineStatus;
  agencyRecovery: boolean;
  lastRollback: RollbackNotice | null;
  saveNotice: string | null;
  castNames?: Record<string, string>;
  firstLines?: Record<string, number>;
  authorMoves?: JournalRecord[];
}

const RAW_LIMIT = 4000;

type Draft = Omit<InlineItem, "persona"> & { messageId: number };

const value = (entry: PrimitiveValue) => String(entry);
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
const clip = (text: string) => (text.length > RAW_LIMIT ? `${text.slice(0, RAW_LIMIT)}…` : text);
const memberStem = (member: string) => member.replace(/\.(png|webp|jpe?g)$/i, "");
const memberName = (sources: InlineSources, member: string) => sources.castNames?.[member] ?? sources.castNames?.[memberStem(member)] ?? memberStem(member);

const metBefore = (sources: InlineSources, member: string, messageId: number) => [memberStem(member), memberName(sources, member)]
  .some((key) => (sources.firstLines?.[key.trim().toLowerCase()] ?? Infinity) < messageId);

const checkpointPlayerName = (story: NormalizedStoryV2 | null, id: string) => story?.checkpointById[id]?.player_name ?? null;

const changedKeys = (entry: BoundaryLogEntry) => {
  const before = entry.before.blackboard.values;
  const after = entry.after.blackboard.values;
  return Object.keys({ ...before, ...after })
    .filter((key) => before[key] !== after[key])
    .map((key) => `${key}: ${before[key] === undefined ? "∅" : value(before[key])} → ${after[key] === undefined ? "∅" : value(after[key])}`);
};

function progressItems(sources: InlineSources): Draft[] {
  const { story } = sources;
  return sources.boundaryLog.flatMap((entry): Draft[] => {
    const messageId = entry.context.lastMessageId;
    const drafts: Draft[] = [];
    if (entry.fired) {
      const name = checkpointPlayerName(story, entry.fired.to);
      const objective = name ? story?.checkpointById[entry.fired.to]?.player_text ?? null : null;
      drafts.push({
        id: `progress:transition:${entry.boundary}`, messageId, category: "progress", level: 1, state: "applied",
        text: inlineTransitionText(name, objective),
      });
      drafts.push({
        id: `progress:gate:${entry.boundary}`, messageId, category: "progress", level: 3, state: "applied",
        text: `${entry.fired.from} → ${entry.fired.to} (${entry.source})`,
        detail: [`gate: ${JSON.stringify(entry.fired.gate)}`, ...changedKeys(entry), `path: ${entry.after.visitedPath.join(" → ")}`].join("\n"),
      });
    }
    if (entry.evaluated) {
      drafts.push({
        id: `progress:evaluated:${entry.boundary}`, messageId, category: "progress", level: 4, state: "applied",
        text: `Boundary ${entry.boundary} evaluated`, detail: JSON.stringify(entry.evaluated, null, 1),
      });
    }
    return drafts;
  }).concat((sources.authorMoves ?? []).map((move): Draft => ({
    id: `progress:author:${move.at}`, messageId: move.messageId, category: "progress", level: 3, state: "applied", text: move.summary, detail: move.note,
  })));
}

const auditState = (audit: SharedReadAudit, sources: InlineSources): InlineState => {
  if (sources.pending.some((entry) => entry.origin === audit.id)) return "pending";
  if (sources.boundaryLog.some((entry) => entry.queue.discarded.some((item) => item.origin === audit.id))
    && !sources.boundaryLog.some((entry) => entry.queue.applied.some((item) => item.origin === audit.id))) return "refused";
  return "applied";
};

const isPlayerFact = (entry: MemoryEntry) => entry.tier === "facts" && !entry.supersededBy && !entry.foldedInto && !entry.contradicted
  && !entry.characterId && (entry.provenance?.validity ?? "live") === "live";

const DERIVED_COPY: Partial<Record<DerivedRecord["kind"], string>> = DERIVED_PLAYER_COPY;

function memoryItems(sources: InlineSources): Draft[] {
  const facts = sources.memory.entries.filter(isPlayerFact).map((entry): Draft => ({
    id: `memory:fact:${entry.id}`, messageId: entry.provenance?.messageId ?? entry.messageId ?? -1, category: "memory", level: 1, state: "applied",
    text: rememberedText(entry.text),
    detail: [entry.evidence ? `"${entry.evidence}"` : null, `${entry.provenance?.pass ?? "unknown pass"} · importance ${entry.importance} · ${entry.expiration}`].filter(Boolean).join("\n"),
    actions: [
      { kind: "pin-fact", id: entry.id, pinned: !entry.pinned },
      { kind: "lock-fact", id: entry.id, locked: !entry.locked },
      { kind: "exclude-fact", id: entry.id },
    ],
  }));
  const derived = sources.memory.derived.flatMap((record): Draft[] => {
    const text = DERIVED_COPY[record.kind];
    const messageId = record.range?.to ?? record.messageId;
    const removed = record.removed?.length ? `, removed ${record.removed.length}` : "";
    const detail = `${record.kind} from ${plural(record.inputs.length, "input")}${removed}`;
    if (text) return [{ id: `memory:derived:${record.id}`, messageId, category: "memory", level: 2, state: "applied", text, detail }];
    return [{ id: `memory:derived:${record.id}`, messageId, category: "memory", level: 3, state: "applied", text: `Memory ${record.kind}`, detail: `inputs: ${record.inputs.join(", ")}` }];
  });
  const deltas = sources.audits.flatMap((audit): Draft[] => {
    const state = auditState(audit, sources);
    return [
      ...audit.acceptedDeltas.map((entry, index): Draft => ({
        id: `memory:delta:${audit.id}:${index}`, messageId: entry.messageId ?? audit.window.to, category: "memory", level: 3, state,
        text: `${entry.delta.q} = ${value(entry.delta.v)}`, detail: `"${entry.evidence}"`,
      })),
      ...audit.rejected.map((line, index): Draft => ({
        id: `memory:rejected:${audit.id}:${index}`, messageId: audit.window.to, category: "memory", level: 3, state: "refused",
        text: `Rejected: ${line.line}`, detail: line.reason,
      })),
      {
        id: `memory:raw:${audit.id}`, messageId: audit.window.to, category: "memory", level: 4, state,
        text: `Read ${audit.reason} (prompt + reply)`, detail: clip(`${audit.prompt}\n---\n${audit.rawResponse}`),
      },
    ];
  });
  const applied = sources.boundaryLog.flatMap((entry) => entry.queue.applied
    .filter((item) => item.source === "extractor" && item.deltas.length)
    .map((item, index): Draft => ({
      id: `memory:applied:${entry.boundary}:${index}`, messageId: entry.context.lastMessageId, category: "memory", level: 3, state: "applied",
      text: `Applied ${item.deltas.map((delta) => `${delta.q}=${value(delta.v)}`).join(", ")}`,
      detail: item.turnRange ? `read at message ${item.turnRange.to}` : undefined,
    })));
  const drops = sources.memory.verifyDrops.map((drop, index): Draft => ({
    id: `memory:drop:${index}:${drop.at}`, messageId: drop.entry.provenance?.messageId ?? drop.entry.messageId ?? -1, category: "memory", level: 3, state: "refused",
    text: `Not stored: ${drop.entry.text}`, detail: `p ${drop.p}${drop.model ? ` · ${drop.model}` : ""}`,
  }));
  const conflicts = sources.memory.conflicts.map((pair): Draft => {
    const ids = pair.sides.flatMap((side) => (typeof side.messageId === "number" ? [side.messageId] : []));
    return {
      id: `memory:conflict:${pair.key}`, messageId: ids.length ? Math.max(...ids) : -1, category: "memory", level: 3, state: "pending",
      text: "Held: two claims disagree", detail: pair.sides.map((side) => `${side.standing ? "standing" : "claim"}: ${side.label}`).join("\n"),
      actions: pair.sides.filter((side) => side.store === "memory").map((side) => ({ kind: "resolve-conflict" as const, key: pair.key, keepId: side.id, label: side.label })),
    };
  });
  return [...facts, ...derived, ...deltas, ...applied, ...drops, ...conflicts];
}

function threadItems(sources: InlineSources): Draft[] {
  return sources.memory.arcs.flatMap((arc): Draft[] => {
    const detail = `${arc.id}${arc.pinned ? " · pinned" : ""}${arc.bridgeApplied ? " · bridge applied" : ""}${arc.summary ? `\n${arc.summary}` : ""}`;
    const thread = (kind: string, messageId: number, text: string): Draft => ({ id: `threads:${kind}:${arc.id}`, messageId, category: "threads", level: 1, state: "applied", text, detail });
    return [
      ...(typeof arc.openedMessageId === "number" ? [thread("open", arc.openedMessageId, threadOpenedText(arc.text))] : []),
      ...(arc.status === "resolved" && typeof arc.resolvedMessageId === "number" ? [thread("resolved", arc.resolvedMessageId, threadResolvedText(arc.text))] : []),
    ];
  });
}

const describeOp = (op: CuratorOp): string => {
  if (op.kind === "note") return `Warden note: ${op.text}`;
  const target = `${op.lorebook} · ${op.comment || "(untitled)"}`;
  if (op.kind === "enable") return `Switch on ${target}`;
  if (op.kind === "disable") return `Switch off ${target}`;
  if (op.kind === "rewrite") return `Rewrite ${target}`;
  return `Patch ${target}`;
};

const opState = (record: CuratorOpRecord): InlineState => {
  if (record.status === "pending" || record.status === "accepted") return "pending";
  if (record.status === "applied") return "applied";
  return "refused";
};

function loreItems(sources: InlineSources): Draft[] {
  const publicNames = sources.story?.display?.lore_names_public === true;
  const fired = sources.loreFired.flatMap((record): Draft[] => {
    const named = publicNames ? record.entries.filter((entry) => !entry.gated && entry.via !== "mirror" && entry.comment) : [];
    const summary = loreConsultedText(named.map((entry) => entry.comment), record.entries.length);
    return [
      ...(record.entries.length
        ? [{ id: `lore:count:${record.messageId}`, messageId: record.messageId, category: "lore" as const, level: 2 as const, until: 3 as const, state: "applied" as const, text: summary }]
        : []),
      ...record.entries.map((entry): Draft => ({
        id: `lore:entry:${record.messageId}:${entry.book}:${entry.uid}`, messageId: record.messageId, category: "lore", level: 3, state: "applied",
        text: `${entry.book} · ${entry.comment || "(untitled)"}`, detail: `${entry.via}${entry.gated ? " · checkpoint-gated" : ""} · uid ${entry.uid}`,
      })),
    ];
  });
  const curator = sources.proposals.filter((proposal) => proposal.curator === "wi").flatMap((proposal) => proposal.ops.map((record, index): Draft => ({
    id: `lore:curator:${proposal.id}:${index}`, messageId: proposal.messageId, category: "lore", level: 3, state: opState(record),
    text: describeOp(record.op), detail: [proposal.summary, record.message].filter(Boolean).join("\n") || undefined,
    ...(record.status === "pending" ? { actions: [
      { kind: "curator-op" as const, proposalId: proposal.id, index, decision: "accepted" as const },
      { kind: "curator-op" as const, proposalId: proposal.id, index, decision: "rejected" as const },
    ] } : {}),
  })));
  const newestProposal = [...sources.proposals].reverse().find((proposal) => proposal.curator === "wi");
  const raw = sources.curatorPass && newestProposal
    ? [{ id: `lore:curator-raw:${sources.curatorPass.at}`, messageId: newestProposal.messageId, category: "lore" as const, level: 4 as const, state: "applied" as const,
      text: `Curator ${sources.curatorPass.reason} (prompt + reply)`, detail: clip(`${sources.curatorPass.prompt}\n---\n${sources.curatorPass.rawResponse}`) }]
    : [];
  return [...fired, ...curator, ...raw];
}

interface EffectWording {
  done: string;
  doing: string;
}

const EFFECT_STATUS: Record<EffectLedgerStatus, { state: InlineState; text: (words: EffectWording) => string }> = {
  applied: { state: "applied", text: (words) => words.done },
  pending: { state: "pending", text: (words) => `${words.doing} (not confirmed)` },
  failed: { state: "refused", text: (words) => `${words.doing} failed` },
  reverted: { state: "refused", text: (words) => `${words.done}, then undone` },
  "revert-failed": { state: "refused", text: (words) => `${words.done}, and could not be undone` },
  "externally-changed": { state: "refused", text: (words) => `${words.done}, then changed elsewhere` },
};

const effectDraft = (row: EffectLedgerRow, id: string, words: EffectWording, told = true): Draft => {
  const status = EFFECT_STATUS[row.status];
  return { id, messageId: row.messageId, category: "cast", level: row.status === "applied" && told ? 1 : 3, state: status.state, text: status.text(words) };
};

function castItems(sources: InlineSources): Draft[] {
  const effects = sources.effects.flatMap((row): Draft[] => {
    if (row.target.kind === "cast") {
      const name = memberName(sources, row.target.member);
      const left = row.after?.disabled === true;
      const words = { done: castChangeText(name, left), doing: `${name} ${left ? "leaving" : "joining"}` };
      return [effectDraft(row, `cast:member:${row.id}`, words, metBefore(sources, row.target.member, row.messageId))];
    }
    if (row.target.kind === "background") return [effectDraft(row, `cast:background:${row.id}`, { done: PLAYER_COPY.sceneChanged, doing: "Scene change" })];
    return [];
  });
  const talk = sources.talkDecisions.flatMap((decision): Draft[] => {
    const reply = decision.messageId + 1;
    if (!decision.chosenName || reply >= sources.chatLength) return [];
    return [{
      id: `cast:talk:${decision.at}:${decision.chainStep ?? 0}`, messageId: reply, category: "cast", level: 2, state: "applied",
      text: chosenToSpeakText(decision.chosenName),
      detail: [
        decision.source, decision.judge ? `p ${decision.judge.confidence} (${decision.judge.via})` : null,
        decision.chainStep ? `voice ${decision.chainStep + 1}` : null, `${decision.latencyMs} ms`,
      ].filter(Boolean).join(" · "),
    }];
  });
  const warden = sources.proposals.filter((proposal) => proposal.curator === "warden").flatMap((proposal) => proposal.ops.map((record, index): Draft => ({
    id: `cast:warden:${proposal.id}:${index}`, messageId: proposal.messageId, category: "cast", level: 3, state: opState(record),
    text: describeOp(record.op), detail: [record.status, record.message].filter(Boolean).join(" · "),
    ...(record.status === "pending" ? { actions: [
      { kind: "curator-op" as const, proposalId: proposal.id, index, decision: "accepted" as const },
      { kind: "curator-op" as const, proposalId: proposal.id, index, decision: "rejected" as const },
    ] } : {}),
  })));
  return [...effects, ...talk, ...warden];
}

function pacingItems(sources: InlineSources, newest: number): Draft[] {
  const rows = sources.tensionHistory.filter((row, index, all) => index === 0 || all[index - 1].level !== row.level).map((row): Draft => ({
    id: `pacing:level:${row.messageId}`, messageId: row.messageId, category: "pacing", level: 1, state: "applied",
    text: tensionLevelText(row.level), detail: `smoothed ${row.smoothed.toFixed(2)}`,
  }));
  const live = sources.tension.expected !== null || sources.tension.hint
    ? [{ id: "pacing:live", messageId: newest, category: "pacing" as const, level: 3 as const, state: "live" as const,
      text: `Expected tension ${sources.tension.expected?.toFixed(2) ?? "n/a"}`, detail: sources.tension.hint ? `steering: ${sources.tension.hint}` : undefined }]
    : [];
  return [...rows, ...live];
}

function callItems(sources: InlineSources, newest: number): Draft[] {
  const reads = sources.audits.map((audit): Draft => {
    const state = auditState(audit, sources);
    const count = audit.acceptedDeltas.length;
    const text = readNotedText(count, state === "pending");
    const detail = `${audit.reason} · messages ${audit.window.from}–${audit.window.to} · ${audit.rejected.length} rejected`;
    return { id: `calls:read:${audit.id}`, messageId: audit.window.to, category: "calls", level: 2, state, text, detail };
  });
  const live = sources.pipeline.state === "reading"
    ? [{ id: "calls:live", messageId: newest, category: "calls" as const, level: 2 as const, state: "live" as const, text: sources.pipeline.text, detail: sources.pipeline.detail ?? undefined }]
    : [];
  const judge = sources.judgeCalls.map((call, index): Draft => ({
    id: `calls:judge:${call.at}:${index}`, messageId: call.messageId, category: "calls", level: 3, state: call.fallback ? "refused" : "applied",
    text: `judge ${call.use} · ${call.latencyMs} ms`,
    detail: [
      call.model ?? "no model", `${call.questionCount} questions`,
      call.inputTokens !== undefined ? `${call.inputTokens}/${call.outputTokens ?? 0} tokens` : null,
      call.cost !== undefined ? `cost ${call.cost}` : null, call.fallback ? `fallback ${call.fallback}` : null, call.cached ? "cached" : null,
    ].filter(Boolean).join(" · "),
  }));
  const stalls = sources.reconciliation.flatMap((event): Draft[] => (typeof event.messageId === "number" ? [{
    id: `calls:stall:${event.id}`, messageId: event.messageId, category: "calls", level: 3, state: event.resolvedAt ? "applied" : "pending",
    text: `Stall re-check: ${event.targetedKeys.join(", ") || "recent scenes"}`, detail: event.evidence.join("\n") || undefined,
  }] : []));
  const payload = sources.payloadCaptures.flatMap((capture): Draft[] => (typeof capture.messageId === "number" ? [{
    id: `calls:payload:${capture.at}`, messageId: capture.messageId, category: "calls", level: 4, state: "applied",
    text: `${plural(capture.blocks.length, "story block")} injected`, detail: capture.blocks.map((block) => `${block.key}@${block.depth}`).join("\n"),
  }] : []));
  return [...reads, ...live, ...judge, ...stalls, ...payload];
}

const PLAYER_ACTIONS = new Set<InlineAction["kind"]>(["pin-fact", "exclude-fact"]);

const playerItem = ({ detail: _detail, actions, ...item }: Omit<Draft, "messageId">): Omit<Draft, "messageId"> => {
  const kept = actions?.filter((action) => PLAYER_ACTIONS.has(action.kind));
  return kept?.length ? { ...item, actions: kept } : item;
};

const HEALTH_LIVE: Partial<Record<PipelineStatus["state"], true>> = { "stalled-rechecking": true, "not-configured": true, error: true };

function healthItems(sources: InlineSources, newest: number): Draft[] {
  const drafts: Draft[] = [];
  if (sources.lastRollback) {
    drafts.push({ id: `health:rollback:${sources.lastRollback.at}`, messageId: newest, category: "health", level: 1, state: "applied", text: steppedBackText(sources.lastRollback.playerName) });
  }
  if (sources.agencyRecovery) drafts.push({ id: "progress:agency", messageId: newest, category: "progress", level: 2, state: "live", text: REFUSAL_PLAYER_TEXT });
  if (HEALTH_LIVE[sources.pipeline.state]) {
    drafts.push({ id: "health:pipeline", messageId: newest, category: "health", level: 2, state: "live", text: sources.pipeline.text, detail: sources.pipeline.detail ?? undefined });
  }
  if (sources.saveNotice) drafts.push({ id: "health:save", messageId: newest, category: "health", level: 2, state: "live", text: sources.saveNotice });
  for (const row of sources.effects) {
    if (row.status !== "failed" && row.status !== "externally-changed" && row.status !== "revert-failed") continue;
    drafts.push({ id: `health:effect:${row.id}`, messageId: row.messageId, category: "health", level: 3, state: "refused", text: `${row.effect} ${row.status}`, detail: row.reason });
  }
  return drafts;
}

export function composeInlineTimeline(sources: InlineSources): InlineView {
  const newest = sources.chatLength - 1;
  const oldest = newest - Math.max(1, sources.settings.window) + 1;
  const drafts = [
    ...progressItems(sources), ...memoryItems(sources), ...threadItems(sources), ...loreItems(sources),
    ...castItems(sources), ...pacingItems(sources, newest), ...callItems(sources, newest), ...healthItems(sources, newest),
  ];
  const level = effectiveInlineLevel(sources.settings.level, sources.authorView);
  const byMessage: Record<number, InlineItem[]> = {};
  for (const { messageId, ...item } of drafts) {
    if (!Number.isFinite(messageId) || messageId < Math.max(0, oldest) || messageId > newest) continue;
    if (!sources.authorView && item.level > level) continue;
    const shown = sources.authorView ? item : playerItem(item);
    (byMessage[messageId] ??= []).push({ ...shown, persona: item.level <= PLAYER_LEVEL_CAP ? "player" : "author" });
  }
  return {
    level,
    requested: sources.settings.level,
    window: sources.settings.window,
    categories: sources.settings.categories,
    newestMessageId: newest,
    byMessage,
  };
}

export const itemShown = (view: Pick<InlineView, "level" | "categories">, item: InlineItem): boolean =>
  item.level <= view.level && (item.until === undefined || view.level < item.until) && view.categories[item.category] !== false;

export const visibleInlineItems = (view: InlineView, messageId: number): InlineItem[] =>
  (view.level === 0 ? [] : (view.byMessage[messageId] ?? []).filter((item) => itemShown(view, item)));

export const inlineMessageIds = (view: InlineView): number[] =>
  Object.keys(view.byMessage).map(Number).filter((messageId) => visibleInlineItems(view, messageId).length > 0).sort((left, right) => left - right);
