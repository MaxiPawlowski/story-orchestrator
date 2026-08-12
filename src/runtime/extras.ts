import { stripChannelNoise, type ParsedFact } from "@extraction/index";
import type { ExpansionRuntimeState } from "@generation/index";
import { createMemoryState, DEFAULT_TIER_BUDGETS, DEFAULT_TIER_TOKEN_BUDGETS, generateMemoryId, type MemoryEntry } from "@memory/index";
import { DEFAULT_TENSION_EMA_ALPHA, MEMORY_TIER_INJECTION_DEPTHS } from "@constants/defaults";
import { sanitizeJournalRecords } from "./journal";
import type { CopilotRuntimeSettings, ExtractionRuntimeSettings, ExtractionRuntimeState, MemoryRuntimeSettings, MemoryRuntimeState, PacingSettings, RuntimeExtras, TalkRuntimeState, TensionRuntimeState, UiRuntimeSettings } from "./types";

export const TALK_DECISION_LIMIT = 10;

export const emptyRequirements = { ready: true, missingPersonas: [], missingMembers: [], missingLorebooks: [] };

export const defaultExtractionSettings = (): ExtractionRuntimeSettings => ({ enabled: false, profileId: null, cadence: 3, reconciliationMultiplier: 1.5, stabilityLag: 0 });

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
});

export const createExpansion = (): ExpansionRuntimeState => ({
  entries: {},
  scheduler: { queueDepth: 0, inFlight: false, lastError: null },
});

export const defaultMemorySettings = (): MemoryRuntimeSettings => ({
  enabled: true,
  epistemicLedgerCapable: true,
  injectionDepths: { ...MEMORY_TIER_INJECTION_DEPTHS },
  tierBudgets: { ...DEFAULT_TIER_BUDGETS },
  tierTokenBudgets: { ...DEFAULT_TIER_TOKEN_BUDGETS },
});

export const createMemory = (): MemoryRuntimeState => ({
  ...createMemoryState(),
  settings: defaultMemorySettings(),
  backfill: null,
  sceneCount: 0,
  shortTermSummaryEnd: -1,
  wiWrites: {},
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
      arcs: Array.isArray(existing.arcs) ? existing.arcs.map((arc) => ({ ...arc, text: stripChannelNoise(arc.text), ...(arc.summary ? { summary: stripChannelNoise(arc.summary) } : {}) })) : [],
      epistemic: Array.isArray(existing.epistemic) ? existing.epistemic : [],
      ledger: Array.isArray(existing.ledger) ? existing.ledger : [],
      canon: existing.canon && typeof existing.canon === "object" ? { ...existing.canon, text: stripChannelNoise(existing.canon.text) } : null,
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
    arcs: [],
    epistemic: [],
    ledger: [],
    canon: null,
    updatedAt: new Date().toISOString(),
  };
};

export const createCopilot = (): CopilotRuntimeSettings => ({ enabled: true });
export const sanitizeCopilot = (value: RuntimeExtras | undefined): CopilotRuntimeSettings => ({ enabled: value?.copilot?.enabled ?? true });
export const createUi = (): UiRuntimeSettings => ({ authorView: false, announceTransitions: true, hudEnabled: true });
export const sanitizeUi = (value: RuntimeExtras | undefined): UiRuntimeSettings => ({ ...createUi(), ...value?.ui });
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
  };
};

export const sanitizeExpansion = (value: RuntimeExtras | undefined): ExpansionRuntimeState => {
  const existing = value?.expansion;
  if (!existing) return createExpansion();
  return {
    entries: existing.entries && typeof existing.entries === "object" ? existing.entries : {},
    scheduler: existing.scheduler ?? { queueDepth: 0, inFlight: false, lastError: null },
  };
};

export const hydrateExtras = (persisted: RuntimeExtras | undefined): RuntimeExtras => {
  const extras = persisted ?? createExtras();
  extras.memory = sanitizeMemory(extras);
  extras.extraction = sanitizeExtraction(extras);
  extras.expansion = sanitizeExpansion(extras);
  extras.pacing = sanitizePacing(extras.pacing);
  extras.tension = sanitizeTension(extras.tension);
  extras.copilot = sanitizeCopilot(extras);
  extras.ui = sanitizeUi(extras);
  extras.talk = sanitizeTalk(extras);
  extras.journal = sanitizeJournalRecords(extras.journal);
  extras.lastSelfInjectionMessageId = typeof extras.lastSelfInjectionMessageId === "number" ? extras.lastSelfInjectionMessageId : null;
  return extras;
};
