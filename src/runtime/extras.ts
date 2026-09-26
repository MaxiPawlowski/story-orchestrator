import { EXPANSION_CONTRACT, type ExpansionRuntimeState } from "@generation/index";
import { CONFLICT_LIMIT, createMemoryState, DERIVED_LIMIT, isProvenance } from "@memory/index";
import { DEFAULT_TENSION_EMA_ALPHA } from "@constants/defaults";
import { capProposalRing } from "@stagecraft/index";
import { createJudgeRuntime, sanitizeJudgeRuntime } from "@judge/index";
import { sanitizeJournalRecords } from "./journal";
import { defaultExtractionSettings, defaultMemorySettings, defaultStagecraftSettings, type ChatOverrides, type GlobalSettings } from "./settingsModel";
import { EFFECT_LEDGER_LIMIT, JUDGED_READ_LIMIT, VERIFY_DROP_LIMIT } from "./types";
import { createSaveHealth } from "./saveHealth";
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
  updatedAt: new Date().toISOString(),
});

// A stored row without a valid envelope is dropped, never dressed with a default one;
// the count goes to the console so a dropped row is never silent.
const enveloped = <T extends { provenance: unknown }>(rows: unknown, store: string, dropped: string[]): T[] => {
  if (!Array.isArray(rows)) return [];
  const kept = rows.filter((row): row is T => Boolean(row) && typeof row === "object" && isProvenance((row as T).provenance));
  if (kept.length < rows.length) dropped.push(`${rows.length - kept.length} ${store}`);
  return kept;
};

const sanitizeMirrorBook = (value: unknown): MemoryMirrorBook | null => {
  const book = value as Partial<MemoryMirrorBook> | null | undefined;
  return typeof book?.name === "string" && typeof book.chatId === "string" && book.name && book.chatId ? { name: book.name, chatId: book.chatId } : null;
};

export const sanitizeMemory = (value: RuntimeExtras | undefined): MemoryRuntimeState => {
  const existing = value?.memory;
  if (existing && Array.isArray(existing.entries)) {
    const dropped: string[] = [];
    const entries = enveloped<MemoryRuntimeState["entries"][number]>(existing.entries, "memory", dropped);
    const epistemic = enveloped<MemoryRuntimeState["epistemic"][number]>(existing.epistemic, "epistemic", dropped);
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
      updatedAt: existing.updatedAt ?? new Date().toISOString(),
    };
  }
  return createMemory();
};

export const createCopilot = (): CopilotRuntimeSettings => ({ enabled: true });
export const createUi = (): UiRuntimeSettings => ({ authorView: false, announceTransitions: true, hudEnabled: true });
export const createStagecraft = (): StagecraftRuntimeState => ({ settings: defaultStagecraftSettings(), proposals: [], lastPass: null, lastRunBoundary: -1, lastError: null });

export const sanitizeStagecraft = (value: RuntimeExtras | undefined): StagecraftRuntimeState => {
  const existing = value?.stagecraft;
  if (!existing) return createStagecraft();
  return {
    settings: defaultStagecraftSettings(),
    proposals: Array.isArray(existing.proposals) ? capProposalRing(
      existing.proposals.filter((entry) => Boolean(entry) && Array.isArray(entry.ops)).filter((entry) => entry.curator === "warden" || entry.curator === "wi"),
    ) : [],
    lastPass: existing.lastPass && typeof existing.lastPass === "object" ? existing.lastPass : null,
    lastRunBoundary: typeof existing.lastRunBoundary === "number" ? existing.lastRunBoundary : -1,
    lastError: typeof existing.lastError === "string" ? existing.lastError : null,
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
      ? existing.ledger.filter((row): row is EffectLedgerRow => Boolean(row) && typeof row.id === "string" && typeof row.effect === "string" && Boolean(row.target)).slice(-EFFECT_LEDGER_LIMIT)
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
  journal: [],
  lastSessionAt: null,
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
  extras.pacing = { alpha: global.pacing.alpha, hintEnabled: global.pacing.hintEnabled, shapeOverride: overrides.shapeOverride };
  extras.copilot = { ...global.copilot };
  extras.ui = { authorView: overrides.authorView, announceTransitions: global.display.announceTransitions, hudEnabled: global.display.hudEnabled };
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
    lastPass: extras.stagecraft.lastPass,
    lastRunBoundary: extras.stagecraft.lastRunBoundary,
    lastError: extras.stagecraft.lastError,
  } as RuntimeExtras["stagecraft"],
});

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
  extras.journal = sanitizeJournalRecords(extras.journal);
  extras.lastSelfInjectionMessageId = typeof extras.lastSelfInjectionMessageId === "number" ? extras.lastSelfInjectionMessageId : null;
  return applyGlobalSettings(extras, read(), overrides);
};
