import { stripChannelNoise, type ParsedFact } from "@extraction/index";
import type { ExpansionRuntimeState } from "@generation/index";
import { createMemoryState, generateMemoryId, type MemoryEntry } from "@memory/index";
import { DEFAULT_TENSION_EMA_ALPHA } from "@constants/defaults";
import { capProposalRing } from "@stagecraft/index";
import { createJudgeRuntime, sanitizeJudgeRuntime } from "@judge/index";
import { sanitizeJournalRecords } from "./journal";
import { defaultExtractionSettings, defaultMemorySettings, defaultStagecraftSettings, getGlobalSettings, type ChatOverrides } from "./settingsStore";
import { JUDGED_READ_LIMIT, VERIFY_DROP_LIMIT } from "./types";
import type { CopilotRuntimeSettings, ExtractionRuntimeState, MemoryMirrorBook, MemoryRuntimeState, PacingSettings, RuntimeExtras, StagecraftRuntimeState, TalkRuntimeState, TensionRuntimeState, UiRuntimeSettings } from "./types";

export const TALK_DECISION_LIMIT = 10;

export const emptyRequirements = { ready: true, missingPersonas: [], missingMembers: [], missingLorebooks: [] };

export const defaultPacingSettings = (): PacingSettings => ({ alpha: DEFAULT_TENSION_EMA_ALPHA, shapeOverride: null, hintEnabled: true });

export const defaultTension = (): TensionRuntimeState => ({ levels: [], smoothed: null });

export const sanitizePacing = (value: PacingSettings | undefined): PacingSettings => ({
  ...defaultPacingSettings(),
  ...(value ?? {}),
  alpha: typeof value?.alpha === "number" && value.alpha >= 0 && value.alpha <= 1 ? value.alpha : DEFAULT_TENSION_EMA_ALPHA,
});

export const sanitizeTension = (value: TensionRuntimeState | undefined): TensionRuntimeState => ({
  levels: Array.isArray(value?.levels) ? value.levels.slice(-50) : [],
  smoothed: typeof value?.smoothed === "number" ? value.smoothed : null,
});

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

const migrateLegacyFacts = (facts: ParsedFact[]): MemoryEntry[] => facts.map((fact) => ({
  id: generateMemoryId(),
  tier: "facts",
  text: fact.text,
  type: "fact",
  importance: fact.importance,
  expiration: "permanent",
  entities: [],
  confidence: 1,
  activationTriggers: [],
  evidence: fact.evidence,
  createdAt: fact.boundary ?? 0,
  messageId: fact.messageId,
  recallCount: 0,
}));

const sanitizeMirrorBook = (value: unknown): MemoryMirrorBook | null => {
  const book = value as Partial<MemoryMirrorBook> | null | undefined;
  return typeof book?.name === "string" && typeof book.chatId === "string" && book.name && book.chatId ? { name: book.name, chatId: book.chatId } : null;
};

export const sanitizeMemory = (value: RuntimeExtras | undefined): MemoryRuntimeState => {
  const existing = value?.memory;
  if (existing && Array.isArray(existing.entries)) {
    return {
      entries: existing.entries.map((entry) => ({ ...entry, text: stripChannelNoise(entry.text) })),
      excluded: Array.isArray(existing.excluded) ? existing.excluded : [],
      writeLog: Array.isArray(existing.writeLog) ? existing.writeLog.slice(-100) : [],
      settings: { ...defaultMemorySettings(), ...existing.settings },
      backfill: existing.backfill ? { ...existing.backfill, running: false } : null,
      sceneCount: typeof existing.sceneCount === "number" ? existing.sceneCount : 0,
      shortTermSummaryEnd: typeof existing.shortTermSummaryEnd === "number" ? existing.shortTermSummaryEnd : -1,
      wiWrites: existing.wiWrites && typeof existing.wiWrites === "object" ? existing.wiWrites : {},
      wiBook: sanitizeMirrorBook(existing.wiBook),
      arcs: Array.isArray(existing.arcs) ? existing.arcs.map((arc) => ({ ...arc, text: stripChannelNoise(arc.text), ...(arc.summary ? { summary: stripChannelNoise(arc.summary) } : {}) })) : [],
      epistemic: Array.isArray(existing.epistemic) ? existing.epistemic : [],
      ledger: Array.isArray(existing.ledger) ? existing.ledger : [],
      canon: existing.canon && typeof existing.canon === "object" ? { ...existing.canon, text: stripChannelNoise(existing.canon.text) } : null,
      verifyDrops: Array.isArray(existing.verifyDrops) ? existing.verifyDrops.filter((drop) => drop && typeof drop === "object" && drop.entry && typeof drop.p === "number").slice(-VERIFY_DROP_LIMIT) : [],
      updatedAt: existing.updatedAt ?? new Date().toISOString(),
    };
  }
  const legacyFacts = (value?.extraction as unknown as { facts?: ParsedFact[] } | undefined)?.facts;
  return {
    entries: Array.isArray(legacyFacts) ? migrateLegacyFacts(legacyFacts) : [],
    excluded: [],
    writeLog: [],
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
    verifyDrops: [],
    updatedAt: new Date().toISOString(),
  };
};

export const createCopilot = (): CopilotRuntimeSettings => ({ enabled: true });
export const sanitizeCopilot = (value: RuntimeExtras | undefined): CopilotRuntimeSettings => ({ enabled: value?.copilot?.enabled ?? true });
export const createUi = (): UiRuntimeSettings => ({ authorView: false, announceTransitions: true, hudEnabled: true });
export const sanitizeUi = (value: RuntimeExtras | undefined): UiRuntimeSettings => ({ ...createUi(), ...value?.ui });
export const createStagecraft = (): StagecraftRuntimeState => ({ settings: defaultStagecraftSettings(), proposals: [], lastPass: null, lastRunBoundary: -1, lastError: null });

export const sanitizeStagecraft = (value: RuntimeExtras | undefined): StagecraftRuntimeState => {
  const existing = value?.stagecraft;
  if (!existing) return createStagecraft();
  return {
    settings: { ...defaultStagecraftSettings(), ...existing.settings },
    proposals: Array.isArray(existing.proposals) ? capProposalRing(existing.proposals.filter((entry) => Boolean(entry) && Array.isArray(entry.ops)).map((entry) => ({ ...entry, curator: entry.curator === "warden" ? "warden" : "wi" }))) : [],
    lastPass: existing.lastPass && typeof existing.lastPass === "object" ? existing.lastPass : null,
    lastRunBoundary: typeof existing.lastRunBoundary === "number" ? existing.lastRunBoundary : -1,
    lastError: typeof existing.lastError === "string" ? existing.lastError : null,
  };
};

export const createTalk = (): TalkRuntimeState => ({ enabled: true, decisions: [] });
export const sanitizeTalk = (value: RuntimeExtras | undefined): TalkRuntimeState => ({
  enabled: value?.talk?.enabled ?? true,
  decisions: Array.isArray(value?.talk?.decisions) ? value.talk.decisions.slice(-TALK_DECISION_LIMIT) : [],
});

export const createExtras = (): RuntimeExtras => ({
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
  judge: createJudgeRuntime(),
  journal: [],
  lastSessionAt: null,
  updatedAt: new Date().toISOString(),
});

export const sanitizeExtraction = (value: RuntimeExtras | undefined): ExtractionRuntimeState => {
  const existing = value?.extraction;
  if (!existing) return createExtraction();
  return {
    settings: { ...defaultExtractionSettings(), ...existing.settings },
    audits: Array.isArray(existing.audits) ? existing.audits.slice(-20) : [],
    reconciliationEvents: Array.isArray(existing.reconciliationEvents) ? existing.reconciliationEvents.slice(-50) : [],
    lastReadBoundary: typeof existing.lastReadBoundary === "number" ? existing.lastReadBoundary : 0,
    scheduler: existing.scheduler ?? { queueDepth: 0, inFlight: false, lastError: null },
    judgedReads: Array.isArray(existing.judgedReads) ? existing.judgedReads.slice(-JUDGED_READ_LIMIT) : [],
  };
};

export const sanitizeExpansion = (value: RuntimeExtras | undefined): ExpansionRuntimeState => {
  const existing = value?.expansion;
  if (!existing) return createExpansion();
  return {
    entries: existing.entries && typeof existing.entries === "object" ? Object.fromEntries(Object.entries(existing.entries).map(([key, entry]) => [key, { ...entry, origin: entry.origin ?? "active" }])) : {},
    scheduler: existing.scheduler ?? { queueDepth: 0, inFlight: false, lastError: null },
  };
};

export const readChatOverrides = (extras: RuntimeExtras | undefined): ChatOverrides => ({
  authorView: extras?.ui?.authorView === true,
  shapeOverride: extras?.pacing?.shapeOverride ?? null,
  talkEnabled: typeof extras?.talk?.enabled === "boolean" ? extras.talk.enabled : null,
});

// In memory, extras still carries a full settings view so every reader stays simple; the values
// come from the install-wide store, with only the per-chat overrides taken from the chat.
export const applyGlobalSettings = (extras: RuntimeExtras, overrides: ChatOverrides = readChatOverrides(extras)): RuntimeExtras => {
  const global = getGlobalSettings();
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
export const stripGlobalSettings = (extras: RuntimeExtras): RuntimeExtras => ({
  ...extras,
  extraction: { audits: extras.extraction.audits, reconciliationEvents: extras.extraction.reconciliationEvents, lastReadBoundary: extras.extraction.lastReadBoundary, scheduler: extras.extraction.scheduler, judgedReads: extras.extraction.judgedReads } as RuntimeExtras["extraction"],
  pacing: { shapeOverride: extras.pacing.shapeOverride } as RuntimeExtras["pacing"],
  copilot: {} as RuntimeExtras["copilot"],
  ui: { authorView: extras.ui.authorView } as RuntimeExtras["ui"],
  memory: { ...extras.memory, settings: undefined } as unknown as RuntimeExtras["memory"],
  talk: { enabled: extras.talk.enabled, decisions: extras.talk.decisions },
  stagecraft: { proposals: extras.stagecraft.proposals, lastPass: extras.stagecraft.lastPass, lastRunBoundary: extras.stagecraft.lastRunBoundary, lastError: extras.stagecraft.lastError } as RuntimeExtras["stagecraft"],
});

export const hydrateExtras = (persisted: RuntimeExtras | undefined): RuntimeExtras => {
  const overrides = readChatOverrides(persisted);
  const extras = persisted ?? createExtras();
  extras.memory = sanitizeMemory(extras);
  extras.extraction = sanitizeExtraction(extras);
  extras.expansion = sanitizeExpansion(extras);
  extras.pacing = sanitizePacing(extras.pacing);
  extras.tension = sanitizeTension(extras.tension);
  extras.copilot = sanitizeCopilot(extras);
  extras.ui = sanitizeUi(extras);
  extras.talk = sanitizeTalk(extras);
  extras.stagecraft = sanitizeStagecraft(extras);
  extras.judge = sanitizeJudgeRuntime(extras.judge);
  extras.journal = sanitizeJournalRecords(extras.journal);
  extras.lastSelfInjectionMessageId = typeof extras.lastSelfInjectionMessageId === "number" ? extras.lastSelfInjectionMessageId : null;
  return applyGlobalSettings(extras, overrides);
};
