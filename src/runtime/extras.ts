import { EXPANSION_CONTRACT, type ExpansionRuntimeState } from "@generation/types";
import {
  BEAT_RING_CAP, CHAPTER_DISPOSITIONS, CHAPTER_RECORD_STATUSES, CONFLICT_LIMIT, createMemoryState, DERIVED_LIMIT, isProvenance, type ChapterRecord, type ChronicleState, type InnerBeat,
} from "@memory/index";
import type { SealSkip } from "@memory/reverse";
import { DEFAULT_TENSION_EMA_ALPHA } from "@constants/defaults";
import { capProposalRing, sanitizeCreated, sanitizeDeclines } from "@stagecraft/index";
import { createJudgeRuntime, sanitizeJudgeRuntime } from "@judge/index";
import { sanitizeModelCalls } from "./modelCallLog";
import { sanitizeJournalRecords } from "./journal";
import { defaultExtractionSettings, defaultInlineSettings, defaultMemorySettings, defaultStagecraftSettings, type ChatOverrides, type GlobalSettings } from "./settingsModel";
import { createLore, sanitizeLore } from "./loreFired";
import { createChance, sanitizeChance } from "./rolls";
import { sanitizeChecks } from "./storyCheckDraws";
import { sanitizeAgendaProposals } from "./agendaProposals";
import { JUDGED_READ_LIMIT, VERIFY_DROP_LIMIT } from "./types";
import { trimLedger } from "./effectLedger";
import { createSaveHealth } from "./saveHealth";
import { sanitizeOnEnterPosts } from "./npcReplyRewind";
import { sanitizeDeferredOpener } from "./openerDeferral";
import { freshBriefing, sanitizeBriefingRecord } from "./briefing";
import { freshPlayerSetup, sanitizePlayerSetup } from "./playerSetup";
import type {
  CopilotRuntimeSettings, EffectLedgerRow, EffectsRuntimeState, ExtractionRuntimeState, MemoryMirrorBook,
  MemoryRuntimeState, PacingSettings, RuntimeExtras, SaveHealth, StagecraftRuntimeState, TalkRuntimeState,
  UiRuntimeSettings,
} from "./types";
import { defaultTension, sanitizeTension } from "./tensionState";
import { log } from "@utils/log";

export const TALK_DECISION_LIMIT = 10;

export const emptyRequirements = { ready: true, missingPersonas: [], missingMembers: [], missingLorebooks: [] };

export const defaultPacingSettings = (): PacingSettings => ({ alpha: DEFAULT_TENSION_EMA_ALPHA, shapeOverride: null, hintEnabled: true });

export const createExtraction = (): ExtractionRuntimeState => ({
  settings: defaultExtractionSettings(),
  audits: [],
  reconciliationEvents: [],
  lastReadBoundary: 0,
  scheduler: { queueDepth: 0, inFlight: false, lastError: null },
  judgedReads: [],
});

export const createExpansion = (): ExpansionRuntimeState => ({
  entries: {},
  scheduler: { queueDepth: 0, inFlight: false, lastError: null },
});

export const createMemory = (): MemoryRuntimeState => ({
  ...createMemoryState(),
  verifyDrops: [],
  derived: [],
  conflicts: [],
  resolvedConflicts: [],
  pinnedOverflow: 0,
  storyStart: 0,
  settings: defaultMemorySettings(),
  backfill: null,
  sceneCount: 0,
  shortTermSummaryEnd: -1,
  wiWrites: {},
  wiBook: null,
  arcs: [],
  epistemic: [],
  ledger: [],
  canon: null,
  chapters: [],
  chronicle: { eras: [] },
  updatedAt: new Date().toISOString(),
});

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isSpan = (value: unknown): value is { from: number; to: number } => isObject(value) && isFiniteNumber(value.from) && isFiniteNumber(value.to);
const rowsOf = <T>(value: unknown, valid: (row: Record<string, unknown>) => boolean): T[] | null =>
  (value === undefined ? [] : Array.isArray(value) && value.every((row) => isObject(row) && valid(row)) ? value as T[] : null);

const sanitizeChapterRecord = (value: unknown): ChapterRecord | null => {
  if (!isObject(value)) return null;
  const { id, chapterId, summary, short, range, boundaries, sealedAt, provenance } = value;
  if (typeof id !== "string" || typeof chapterId !== "string" || typeof summary !== "string" || typeof short !== "string" || !isProvenance(provenance)) return null;
  if (!isSpan(range) || !isSpan(boundaries) || !isObject(sealedAt) || !["boundary", "messageId", "pathLength"].every((key) => isFiniteNumber(sealedAt[key]))) return null;
  const people = rowsOf<ChapterRecord["people"][number]>(value.people, (row) => ["rosterId", "name", "text"].every((key) => typeof row[key] === "string"));
  const open = rowsOf<ChapterRecord["open"][number]>(value.open, (row) => typeof row.arcId === "string" && typeof row.text === "string"
    && CHAPTER_DISPOSITIONS.includes(row.disposition as ChapterRecord["open"][number]["disposition"]));
  const consequences = rowsOf<ChapterRecord["consequences"][number]>(value.consequences, (row) => typeof row.text === "string" && Array.isArray(row.sources));
  if (!people || !open || !consequences || (value.playerTitle !== undefined && typeof value.playerTitle !== "string")) return null;
  const title = typeof value.title === "string" ? value.title : chapterId;
  const bridge = isObject(value.bridge) && typeof value.bridge.text === "string"
    ? { text: value.bridge.text, ...(Number.isInteger(value.bridge.committedAt) ? { committedAt: value.bridge.committedAt as number } : {}) } : null;
  const counted = isObject(value.tokens) ? value.tokens : {};
  const tokens = isFiniteNumber(counted.summary) && isFiniteNumber(counted.short) ? { summary: counted.summary, short: counted.short } : { summary: 0, short: 0 };
  return {
    id, chapterId, part: Number.isInteger(value.part) ? value.part as number : 1, title, playerTitle: typeof value.playerTitle === "string" ? value.playerTitle : title,
    range: { from: range.from, to: range.to }, boundaries: { from: boundaries.from, to: boundaries.to },
    checkpoints: Array.isArray(value.checkpoints) ? value.checkpoints.filter((entry): entry is string => typeof entry === "string") : [],
    summary, short, consequences, people, open,
    blackboardDelta: isObject(value.blackboardDelta) ? value.blackboardDelta as ChapterRecord["blackboardDelta"] : {},
    blackboardAt: isObject(value.blackboardAt) ? value.blackboardAt : {},
    status: CHAPTER_RECORD_STATUSES.includes(value.status as ChapterRecord["status"]) ? value.status as ChapterRecord["status"] : "sealed",
    provenance: provenance as ChapterRecord["provenance"], tokens,
    sealedAt: { boundary: sealedAt.boundary as number, messageId: sealedAt.messageId as number, at: isFiniteNumber(sealedAt.at) ? sealedAt.at : 0, pathLength: sealedAt.pathLength as number },
    ...(value.final === true ? { final: true } : {}),
    ...(typeof value.epilogue === "string" ? { epilogue: value.epilogue } : {}),
    ...(bridge ? { bridge } : {}),
    ...(Number.isInteger(value.recapSeenAt) ? { recapSeenAt: value.recapSeenAt as number } : {}),
  };
};

const sanitizeChapters = (value: unknown): ChapterRecord[] => (Array.isArray(value) ? value.map(sanitizeChapterRecord).filter((record): record is ChapterRecord => record !== null) : []);

const sanitizeChronicle = (value: unknown): ChronicleState => {
  const eras = (value as Partial<ChronicleState> | null)?.eras;
  const valid = (era: ChronicleState["eras"][number]) => Boolean(era) && typeof era.id === "string" && typeof era.text === "string"
    && Array.isArray(era.recordIds) && typeof era.messageId === "number";
  return { eras: Array.isArray(eras) ? eras.filter(valid) : [] };
};

const sanitizeSealSkip = (value: unknown, depth = 8): SealSkip | null => {
  if (!isObject(value) || depth <= 0 || !Number.isInteger(value.pathLength) || !Number.isInteger(value.messageId)) return null;
  return { pathLength: value.pathLength as number, messageId: value.messageId as number, previous: sanitizeSealSkip(value.previous, depth - 1) };
};

const isBeat = (value: unknown): value is InnerBeat => isObject(value) && ["chatId", "memberId", "checkpointId", "beat", "at"].every((key) => typeof value[key] === "string")
  && isFiniteNumber(value.basedOnMessageId) && (value.tone === undefined || typeof value.tone === "string") && (value.used === undefined || typeof value.used === "boolean");

// A stored row without a valid envelope is dropped, never dressed with a default one;
// the count goes to the console so a dropped row is never silent.
const enveloped = <T extends { provenance: unknown }>(rows: unknown, store: string, dropped: string[]): T[] => {
  if (!Array.isArray(rows)) return [];
  const kept = rows.filter((row): row is T => Boolean(row) && typeof row === "object" && isProvenance((row as T).provenance));
  if (kept.length < rows.length) dropped.push(`${rows.length - kept.length} ${store}`);
  return kept;
};

const withFoldMark = <T extends { foldedInto?: unknown }>(row: T): T => {
  if (row.foldedInto === undefined || (typeof row.foldedInto === "string" && row.foldedInto)) return row;
  const { foldedInto: _foldedInto, ...rest } = row;
  return rest as T;
};

const sanitizeMirrorBook = (value: unknown): MemoryMirrorBook | null => {
  const book = value as Partial<MemoryMirrorBook> | null | undefined;
  return typeof book?.name === "string" && typeof book.chatId === "string" && book.name && book.chatId ? { name: book.name, chatId: book.chatId } : null;
};

const sanitizeInnerBeats = (value: unknown): { innerBeats?: InnerBeat[] } => {
  const beats = Array.isArray(value) ? value.filter(isBeat).slice(-BEAT_RING_CAP) : [];
  return beats.length ? { innerBeats: beats } : {};
};

export const sanitizeMemory = (value: RuntimeExtras | undefined): MemoryRuntimeState => {
  const existing = value?.memory;
  if (existing && Array.isArray(existing.entries)) {
    const dropped: string[] = [];
    const entries = enveloped<MemoryRuntimeState["entries"][number]>(existing.entries, "memory", dropped);
    const epistemic = enveloped<MemoryRuntimeState["epistemic"][number]>(existing.epistemic, "epistemic", dropped).map(withFoldMark);
    const ledger = enveloped<MemoryRuntimeState["ledger"][number]>(existing.ledger, "ledger", dropped);
    if (dropped.length) log.warn(`dropped stored rows without a provenance envelope: ${dropped.join(", ")}`);
    return {
      entries,
      excluded: Array.isArray(existing.excluded) ? existing.excluded : [],
      writeLog: Array.isArray(existing.writeLog) ? existing.writeLog.slice(-100) : [],
      settings: defaultMemorySettings(),
      backfill: existing.backfill ? { ...existing.backfill, running: false } : null,
      sceneCount: typeof existing.sceneCount === "number" ? existing.sceneCount : 0,
      shortTermSummaryEnd: typeof existing.shortTermSummaryEnd === "number" ? existing.shortTermSummaryEnd : -1,
      wiWrites: existing.wiWrites && typeof existing.wiWrites === "object" ? existing.wiWrites : {},
      wiBook: sanitizeMirrorBook(existing.wiBook),
      arcs: Array.isArray(existing.arcs) ? existing.arcs : [],
      epistemic,
      ledger,
      canon: existing.canon && typeof existing.canon === "object" ? existing.canon : null,
      verifyDrops: Array.isArray(existing.verifyDrops) ? existing.verifyDrops.filter(
        (drop) => drop && typeof drop === "object" && drop.entry && typeof drop.p === "number",
      ).slice(-VERIFY_DROP_LIMIT) : [],
      derived: Array.isArray(existing.derived) ? existing.derived.filter(
        (record) => record && typeof record === "object" && typeof record.id === "string" && Array.isArray(record.inputs) && typeof record.messageId === "number",
      ).slice(-DERIVED_LIMIT) : [],
      conflicts: Array.isArray(existing.conflicts) ? existing.conflicts.filter((pair) => Boolean(pair) && typeof pair.key === "string" && Array.isArray(pair.sides)).slice(-CONFLICT_LIMIT) : [],
      resolvedConflicts: Array.isArray(existing.resolvedConflicts) ? existing.resolvedConflicts.filter((key) => typeof key === "string").slice(-CONFLICT_LIMIT) : [],
      pinnedOverflow: typeof existing.pinnedOverflow === "number" ? existing.pinnedOverflow : 0,
      storyStart: typeof existing.storyStart === "number" ? existing.storyStart : 0,
      ...sanitizeInnerBeats(existing.innerBeats),
      chapters: sanitizeChapters(existing.chapters),
      chronicle: sanitizeChronicle(existing.chronicle),
      chapterSealSkip: sanitizeSealSkip(existing.chapterSealSkip),
      updatedAt: existing.updatedAt ?? new Date().toISOString(),
    };
  }
  return createMemory();
};

export const createCopilot = (): CopilotRuntimeSettings => ({ enabled: true, ask: true });
export const createUi = (): UiRuntimeSettings => ({ authorView: false, announceTransitions: false, hudEnabled: true, briefing: true, playerSetup: true, inline: defaultInlineSettings() });
export const createStagecraft = (): StagecraftRuntimeState => ({
  settings: defaultStagecraftSettings(), proposals: [], declines: [], lastPass: null, lastRunBoundary: -1, lastError: null, created: [], lastCreatePass: null, lastCreateBoundary: -1,
});

export const sanitizeStagecraft = (value: RuntimeExtras | undefined): StagecraftRuntimeState => {
  const existing = value?.stagecraft;
  if (!existing) return createStagecraft();
  return {
    settings: defaultStagecraftSettings(),
    proposals: Array.isArray(existing.proposals) ? capProposalRing(
      existing.proposals.filter((entry) => Boolean(entry) && Array.isArray(entry.ops)).filter((entry) => entry.curator === "warden" || entry.curator === "wi"),
    ) : [],
    declines: sanitizeDeclines(existing.declines),
    lastPass: existing.lastPass && typeof existing.lastPass === "object" ? existing.lastPass : null,
    lastRunBoundary: typeof existing.lastRunBoundary === "number" ? existing.lastRunBoundary : -1,
    lastError: typeof existing.lastError === "string" ? existing.lastError : null,
    created: sanitizeCreated(existing.created),
    lastCreatePass: existing.lastCreatePass && typeof existing.lastCreatePass === "object" ? existing.lastCreatePass : null,
    lastCreateBoundary: typeof existing.lastCreateBoundary === "number" ? existing.lastCreateBoundary : -1,
  };
};

// What this chat's effects did to shared host state. The ledger travels with the chat
// so a reloaded chat still knows what it changed and can reconcile a write that never reported back.
export const createEffects = (): EffectsRuntimeState => ({ ledger: [], cast: [] });

export const sanitizeSaveHealth = (value: RuntimeExtras | undefined): SaveHealth => {
  const health = value?.saveHealth;
  if (!health) return createSaveHealth();
  return {
    lastAppliedBoundary: typeof health.lastAppliedBoundary === "number" ? health.lastAppliedBoundary : null,
    // A pending write does NOT survive a reload as pending: the chat that comes back has a fresh
    // chance to save, and the read-back on load is what decides whether the last one landed.
    pendingBoundary: null,
    // Nor does the last save's verdict: a reload is not the page that observed it, and a stale
    // "unsaved" would refuse an author's decision on the strength of a write from a previous session.
    lastOutcome: null,
    consecutiveFailures: typeof health.consecutiveFailures === "number" ? health.consecutiveFailures : 0,
    lastReason: typeof health.lastReason === "string" ? health.lastReason : null,
    lastFailureAt: typeof health.lastFailureAt === "string" ? health.lastFailureAt : null,
  };
};

export const sanitizeEffects = (value: RuntimeExtras | undefined): EffectsRuntimeState => {
  const existing = value?.effects;
  if (!existing) return createEffects();
  return {
    ledger: Array.isArray(existing.ledger)
      ? trimLedger(existing.ledger.filter((row): row is EffectLedgerRow => Boolean(row) && typeof row.id === "string" && typeof row.effect === "string" && Boolean(row.target)))
      : [],
    cast: Array.isArray(existing.cast) ? existing.cast.filter((entry) => entry && typeof entry.member === "string").map((entry) => ({ member: entry.member, disabled: entry.disabled === true })) : [],
  };
};

export const createTalk = (): TalkRuntimeState => ({ enabled: true, decisions: [] });
export const sanitizeTalk = (value: RuntimeExtras | undefined): TalkRuntimeState => ({
  enabled: value?.talk?.enabled ?? true,
  decisions: Array.isArray(value?.talk?.decisions) ? value.talk.decisions.slice(-TALK_DECISION_LIMIT) : [],
});

// A chat with no story yet has no per-chat overrides, and `createTalk()`'s `enabled: true` would read
// as one if the fresh extras were passed through `readChatOverrides` — masking an install-wide
// `talk.enabled: false`. Both storyless paths (the manager's field initialiser and `clearStory`) build
// their extras here, so leaving the install-wide settings out of this one made the snapshot report
// defaults as though they were settings: `profileId: null` on a chat the install had configured, which
// the panel cannot tell from "not loaded yet".
const NO_CHAT_OVERRIDES: ChatOverrides = { authorView: false, shapeOverride: null, talkEnabled: null };

// `createExtras()` runs while the RuntimeManager singleton is being constructed, which happens when
// this module graph is imported — before a test has finished setting up its host mock, and before ST
// has necessarily finished wiring `getContext()`. A host that cannot answer yet leaves the defaults
// standing (the pre- behaviour, and what the store's own `settingsAreLoaded` gate exists for); a
// host that can answer has already been read by then, so the fallback covers only the window where
// reading is impossible.
const withGlobalSettings = (extras: RuntimeExtras, read: () => GlobalSettings): RuntimeExtras => {
  try {
    return applyGlobalSettings(extras, read(), NO_CHAT_OVERRIDES);
  } catch (error) {
    log.warn("install-wide settings are not readable yet; extras start at their defaults", error);
    return extras;
  }
};

export const createExtras = (read: () => GlobalSettings): RuntimeExtras => withGlobalSettings({
  firedNpcReplies: {},
  firedNpcRepliesAt: {},
  requirements: emptyRequirements,
  lastAppliedCheckpointId: null,
  lastSelfInjectionMessageId: null,
  extraction: createExtraction(),
  expansion: createExpansion(),
  memory: createMemory(),
  pacing: defaultPacingSettings(),
  tension: defaultTension(),
  copilot: createCopilot(),
  ui: createUi(),
  talk: createTalk(),
  stagecraft: createStagecraft(),
  effects: createEffects(),
  saveHealth: createSaveHealth(),
  judge: createJudgeRuntime(),
  lore: createLore(),
  chance: createChance(),
  journal: [],
  modelCalls: [],
  lastSessionAt: null,
  briefing: freshBriefing(),
  playerSetup: freshPlayerSetup(),
  updatedAt: new Date().toISOString(),
}, read);

const idleScheduler = () => ({ queueDepth: 0, inFlight: false, lastError: null });

export const sanitizeExtraction = (value: RuntimeExtras | undefined): ExtractionRuntimeState => {
  const existing = value?.extraction;
  if (!existing) return createExtraction();
  return {
    settings: defaultExtractionSettings(),
    audits: Array.isArray(existing.audits) ? existing.audits.slice(-20) : [],
    reconciliationEvents: Array.isArray(existing.reconciliationEvents) ? existing.reconciliationEvents.slice(-50) : [],
    lastReadBoundary: typeof existing.lastReadBoundary === "number" ? existing.lastReadBoundary : 0,
    ...(typeof existing.cardScopeCursor === "number" && Number.isSafeInteger(existing.cardScopeCursor) && existing.cardScopeCursor >= 0 ? { cardScopeCursor: existing.cardScopeCursor } : {}),
    scheduler: idleScheduler(),
    judgedReads: Array.isArray(existing.judgedReads) ? existing.judgedReads.slice(-JUDGED_READ_LIMIT) : [],
  };
};

const UNFINISHED_EXPANSION = new Set(["queued", "generating"]);
const EXPANSION_ORIGINS = new Set(["active", "lookahead"]);

export const sanitizeExpansion = (value: RuntimeExtras | undefined): ExpansionRuntimeState => {
  const existing = value?.expansion;
  if (!existing) return createExpansion();
  const entries = existing.entries && typeof existing.entries === "object"
    // A chain generated under an older contract was read with `outcomes[0]` and its
    // beats carry no outcome ids, so playing it would keep the single-route behaviour removed.
    // A cache does not survive the contract that produced it: the entry is dropped, and the stub is
    // re-generated on arrival like any other missing chain.
    ? Object.entries(existing.entries)
      .filter(([, entry]) => entry.contract === EXPANSION_CONTRACT && EXPANSION_ORIGINS.has(entry.origin))
      .filter(([, entry]) => !(UNFINISHED_EXPANSION.has(entry.status) && entry.origin === "active"))
      .map(([key, entry]) => [key, UNFINISHED_EXPANSION.has(entry.status) ? { ...entry, status: "stale" as const, lastError: "Interrupted before it finished" } : entry] as const)
    : [];
  return { entries: Object.fromEntries(entries), scheduler: idleScheduler() };
};

export const readChatOverrides = (extras: RuntimeExtras | undefined): ChatOverrides => ({
  authorView: extras?.ui?.authorView === true,
  shapeOverride: extras?.pacing?.shapeOverride ?? null,
  talkEnabled: typeof extras?.talk?.enabled === "boolean" ? extras.talk.enabled : null,
});

// In memory, extras still carries a full settings view so every reader stays simple; the values
// come from the install-wide store, with only the per-chat overrides taken from the chat.
export const applyGlobalSettings = (extras: RuntimeExtras, global: GlobalSettings, overrides: ChatOverrides = readChatOverrides(extras)): RuntimeExtras => {
  extras.extraction = { ...extras.extraction, settings: { ...global.extraction } };
  extras.pacing = { alpha: DEFAULT_TENSION_EMA_ALPHA, hintEnabled: global.pacing.hintEnabled, shapeOverride: overrides.shapeOverride };
  extras.copilot = { ...global.copilot };
  const { announceTransitions, hudEnabled, briefing, playerSetup, inline, presence } = global.display;
  extras.ui = { authorView: overrides.authorView, announceTransitions, hudEnabled, briefing, playerSetup, inline, presence };
  extras.memory = { ...extras.memory, settings: { ...global.memory } };
  extras.talk = { ...extras.talk, enabled: overrides.talkEnabled ?? global.talk.enabled };
  extras.stagecraft = { ...extras.stagecraft, settings: { ...global.stagecraft } };
  return extras;
};

// Persisted chat state keeps engine state, rings and the overrides only (spec addendum
// §Configuration homes) - install-wide settings are stripped on the way out.
const withoutSettings = (memory: RuntimeExtras["memory"]): RuntimeExtras["memory"] => {
  const { settings: _settings, ...rest } = memory;
  return rest as RuntimeExtras["memory"];
};

export const stripGlobalSettings = (extras: RuntimeExtras): RuntimeExtras => ({
  ...extras,
  extraction: {
    audits: extras.extraction.audits,
    reconciliationEvents: extras.extraction.reconciliationEvents,
    lastReadBoundary: extras.extraction.lastReadBoundary,
    scheduler: extras.extraction.scheduler,
    judgedReads: extras.extraction.judgedReads,
  } as RuntimeExtras["extraction"],
  pacing: { shapeOverride: extras.pacing.shapeOverride } as RuntimeExtras["pacing"],
  copilot: {} as RuntimeExtras["copilot"],
  ui: { authorView: extras.ui.authorView } as RuntimeExtras["ui"],
  memory: withoutSettings(extras.memory),
  talk: { enabled: extras.talk.enabled, decisions: extras.talk.decisions },
  stagecraft: {
    proposals: extras.stagecraft.proposals,
    declines: extras.stagecraft.declines ?? [],
    lastPass: extras.stagecraft.lastPass,
    lastRunBoundary: extras.stagecraft.lastRunBoundary,
    lastError: extras.stagecraft.lastError,
    created: extras.stagecraft.created ?? [],
    lastCreatePass: extras.stagecraft.lastCreatePass ?? null,
    lastCreateBoundary: extras.stagecraft.lastCreateBoundary ?? -1,
  } as RuntimeExtras["stagecraft"],
});

export interface RestartCarry {
  overrides: ChatOverrides;
  journal: RuntimeExtras["journal"];
  from: string;
}

export const restartCarry = (extras: RuntimeExtras, checkpoint: string | undefined, boundary: number): RestartCarry => ({
  overrides: readChatOverrides(extras), journal: [...extras.journal], from: `${checkpoint ?? "the story"} (boundary ${boundary})`,
});

export const restartedExtras = (carry: RestartCarry, read: () => GlobalSettings): RuntimeExtras => {
  const extras = createExtras(read);
  extras.journal = sanitizeJournalRecords(carry.journal);
  return applyGlobalSettings(extras, read(), carry.overrides);
};

export const hydrateExtras = (persisted: RuntimeExtras | undefined, read: () => GlobalSettings): RuntimeExtras => {
  const overrides = readChatOverrides(persisted);
  const extras = persisted ?? createExtras(read);
  extras.memory = sanitizeMemory(extras);
  extras.extraction = sanitizeExtraction(extras);
  extras.expansion = sanitizeExpansion(extras);
  extras.pacing = defaultPacingSettings();
  extras.tension = sanitizeTension(extras.tension);
  extras.copilot = createCopilot();
  extras.ui = createUi();
  extras.talk = sanitizeTalk(extras);
  extras.stagecraft = sanitizeStagecraft(extras);
  extras.effects = sanitizeEffects(extras);
  extras.saveHealth = sanitizeSaveHealth(extras);
  extras.judge = sanitizeJudgeRuntime(extras.judge);
  extras.lore = sanitizeLore(extras.lore);
  extras.chance = sanitizeChance(extras.chance);
  if (extras.checks) extras.checks = sanitizeChecks(extras.checks);
  if (extras.agendaProposals) extras.agendaProposals = sanitizeAgendaProposals(extras.agendaProposals);
  extras.journal = sanitizeJournalRecords(extras.journal);
  extras.modelCalls = sanitizeModelCalls(extras.modelCalls);
  extras.lastSelfInjectionMessageId = typeof extras.lastSelfInjectionMessageId === "number" ? extras.lastSelfInjectionMessageId : null;
  const briefing = sanitizeBriefingRecord(extras.briefing);
  if (briefing) extras.briefing = briefing; else delete extras.briefing;
  const playerSetup = sanitizePlayerSetup(extras.playerSetup);
  if (playerSetup) extras.playerSetup = playerSetup; else delete extras.playerSetup;
  if (extras.branchedFrom !== undefined && (typeof extras.branchedFrom?.chatId !== "string" || typeof extras.branchedFrom?.at !== "string")) delete extras.branchedFrom;
  extras.firedNpcReplies = extras.firedNpcReplies && typeof extras.firedNpcReplies === "object" ? extras.firedNpcReplies : {};
  extras.firedNpcRepliesAt = extras.firedNpcRepliesAt && typeof extras.firedNpcRepliesAt === "object" ? extras.firedNpcRepliesAt : {};
  if (extras.onEnterPosts !== undefined) extras.onEnterPosts = sanitizeOnEnterPosts(extras.onEnterPosts);
  if (extras.deferredOpener !== undefined) {
    const deferred = sanitizeDeferredOpener(extras.deferredOpener);
    if (deferred) extras.deferredOpener = deferred;
    else delete extras.deferredOpener;
  }
  return applyGlobalSettings(extras, read(), overrides);
};
