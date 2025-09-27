import type {
  Story as StoryPreset,
  Role,
  RegexSpec,
  Checkpoint,
} from '@services/SchemaService/story-schema';
import type {
  NormalizedStory,
  NormalizedCheckpoint,
  NormalizedOnActivate,
} from '@services/SchemaService/story-validator';
import type { PresetPartial } from '../PresetService';
import { PresetService } from '../PresetService';
import {
  setSettingByName,
  TG_SETTING_NAMES,
  tgSettings,
  getActiveCharacterName,
  getActiveCharacterId,
  getCharacterNameById,
  currentUserName,
  event_types,
  generateQuietPrompt,
  chat,
} from '@services/SillyTavernAPI';

type Listener<T = any> = (payload: T) => void;
type StoryInput = StoryPreset | NormalizedStory;
type CheckpointInput =
  | Checkpoint
  | NormalizedCheckpoint
  | (Checkpoint & NormalizedCheckpoint);
type OnActivateInput = any;

type EvaluationOutcome = 'win' | 'fail' | 'continue';
type EvaluationTriggerReason = 'win-trigger' | 'fail-trigger' | 'turn-interval';
type YesNo = 'YES' | 'NO';

interface ModelEvaluationResponse {
  completed: YesNo;
  failed: YesNo;
  reason?: string;
  confidence?: number;
}

interface EvaluationRequest {
  reason: EvaluationTriggerReason;
  turn: number;
  text: string;
  matchedPattern?: string;
  timestamp: number;
}

interface EvaluationDetails {
  request: EvaluationRequest;
  raw: string;
  parsed: ModelEvaluationResponse | null;
  outcome: EvaluationOutcome;
  completed: boolean;
  failed: boolean;
  error?: unknown;
}

const REGEX_FROM_SLASHES = /^\/(.*)\/([dgimsuvy]*)$/;

function compileRegex(spec?: RegexSpec): RegExp | null {
  if (!spec) return null;
  if (typeof spec === 'string') {
    const m = spec.match(REGEX_FROM_SLASHES);
    if (m) return new RegExp(m[1], m[2] || undefined);
    return new RegExp(spec, 'i');
  }
  return new RegExp(spec.pattern, spec.flags ?? 'i');
}

function compileRegexList(spec?: RegexSpec | RegexSpec[]): RegExp[] {
  if (!spec) return [];
  const list = Array.isArray(spec) ? spec : [spec];
  return list.map((item) => compileRegex(item)!).filter((re): re is RegExp => !!re);
}

function ensureRegExpArray(input: any): RegExp[] | undefined {
  if (!Array.isArray(input)) return undefined;
  return input.every((v) => v instanceof RegExp) ? input : undefined;
}

function resolveTriggers(cp: any, key: 'win' | 'fail'): RegExp[] {
  const normalizedKey = key === 'win' ? 'winTriggers' : 'failTriggers';
  const known = ensureRegExpArray(cp?.[normalizedKey]);
  if (known) return known;

  const legacy = cp?.[`${key}_trigger`];
  if (legacy) return compileRegexList(legacy);

  const grouped = cp?.triggers?.[key];
  return compileRegexList(grouped);
}

function normalizeOnActivate(input?: OnActivateInput): NormalizedOnActivate | undefined {
  if (!input) return undefined;
  const authors_note = input.authors_note ?? input.authorsNote;
  const world_info = input.world_info ?? input.worldInfo;
  const preset_overrides =
    input.preset_overrides ??
    input.preset_override ??
    input.presetOverrides ??
    input.presetOverride;
  const automation_ids = input.automation_ids ?? input.automationIds;

  return {
    authors_note,
    world_info,
    preset_overrides,
    automation_ids,
    cfg_scale: input.cfg_scale ?? input.cfgScale,
  } as NormalizedOnActivate;
}

function extractOnStart(story: StoryInput): NormalizedOnActivate | undefined {
  return normalizeOnActivate((story as any).on_start ?? (story as any).onStart);
}

const MODEL_EVALUATION_SCHEMA = {
  type: 'object',
  properties: {
    completed: { type: 'string', enum: ['YES', 'NO'] },
    failed: { type: 'string', enum: ['YES', 'NO'] },
    reason: { type: 'string' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: ['completed', 'failed'],
  additionalProperties: false,
} as const;

(function attachUiBridge() {
  const MAX_UI_SYNC_ATTEMPTS = 20;
  const UI_SYNC_DELAY_MS = 100;
  console.log('[ST UI Bridge] Initializing UI Bridge');
  const applySettingWithRetry = (key: string, value: any, attempt = 0) => {
    if (typeof setSettingByName !== 'function') {
      console.warn(`[ST UI Bridge] setSettingByName not available`);
      return;
    }

    let lastError: unknown | null = null;
    try {
      setSettingByName(key, value, true);
    } catch (error) {
      lastError = error as unknown;
    }

    const inputId = `${key}_textgenerationwebui`;
    const sliderId = `${key}_textgenerationwebui_zenslider`;
    const hasTarget = Boolean(document.getElementById(inputId) || document.getElementById(sliderId));

    if (hasTarget && lastError == null) {
      return;
    }

    if (attempt >= MAX_UI_SYNC_ATTEMPTS) {
      if (lastError != null) {
        console.warn(`[ST UI Bridge] Skipped UI sync for ${key} after ${attempt + 1} attempts`, lastError);
      } else if (!hasTarget) {
        console.warn(`[ST UI Bridge] Gave up waiting for UI controls for ${key}`);
      }
      return;
    }

    setTimeout(() => applySettingWithRetry(key, value, attempt + 1), UI_SYNC_DELAY_MS);
  };

  (window as any).ST_applyTextgenPresetToUI = function apply(name: string, presetObj: any) {
    try {
      for (const key of TG_SETTING_NAMES) {
        if (Object.prototype.hasOwnProperty.call(presetObj, key)) {
          applySettingWithRetry(key, presetObj[key]);
        }
      }
      tgSettings.preset = name;
      const sel = document.getElementById('settings_preset_textgenerationwebui') as HTMLSelectElement | null;
      if (sel) {
        sel.value = name;
      }
      console.log('[ST UI Bridge] Applied preset to UI:', name);
    } catch (err) {
      console.warn('[ST UI Bridge] Failed to apply preset to UI', err);
    }
  };
})();


export class StoryOrchestrator {
  private story: StoryInput;
  private svc: PresetService;
  private applyAN: (note: any) => void;
  private applyWI: (ops: any) => void;
  private runAutomation?: (id: string) => Promise<void> | void;

  private winMatchers: RegExp[] = [];
  private failMatchers: RegExp[] = [];

  private evaluationQueue: EvaluationRequest[] = [];
  private evaluationInFlight = false;
  private userTurnCounter = 0;
  private turnsSinceLastEvaluation = 0;
  private lastEvaluationReason: EvaluationTriggerReason | null = null;
  private lastEvaluationAtTurn = 0;
  private readonly evaluationTurnInterval = 3;

  private currentRoleOverrides: Partial<Record<Role, PresetPartial>> = {};
  private cachedRoleLookup: Map<string, Role> | null = null;
  private lastGenerationContext: { type?: string; options?: any; dryRun?: boolean } | null = null;
  private generationSeq = 0;
  private currentGenerationToken: number | null = null;
  private lastAppliedGenerationToken: number | null = null;
  private pendingSpeakerRole: Role | null = null;
  private pendingSpeakerName: string | undefined;
  private lastTurnProgressSnapshot: string | null = null;

  private listeners = new Map<string, Set<Listener>>();

  currentIndex = 0;

  constructor(opts: {
    story: StoryInput;
    presetService: PresetService;
    applyAuthorsNote: (note: any) => void;
    applyWorldInfo: (ops: any) => void;
    runAutomation?: (id: string) => Promise<void> | void;
  }) {
    this.story = opts.story;
    this.svc = opts.presetService;
    this.applyAN = opts.applyAuthorsNote;
    this.applyWI = opts.applyWorldInfo;
    this.runAutomation = opts.runAutomation;
  }

  get currentCheckpoint(): CheckpointInput {
    return (this.story as any).checkpoints[this.currentIndex];
  }
  get currentCheckpointId() {
    return (this.currentCheckpoint as any)?.id;
  }

  on<T = any>(event: 'checkpointChanged' | 'evaluated' | 'evaluationQueued' | 'turnProgress', cb: Listener<T>) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb as Listener);
    return () => this.off(event, cb);
  }
  off<T = any>(event: 'checkpointChanged' | 'evaluated' | 'evaluationQueued' | 'turnProgress', cb: Listener<T>) {
    this.listeners.get(event)?.delete(cb as Listener);
  }
  private emit<T = any>(event: string, payload: T) {
    this.listeners.get(event)?.forEach((cb) => cb(payload));
  }

  async init() {
    const os = extractOnStart(this.story);
    if (os?.authors_note) this.applyAN(os.authors_note);
    if (os?.world_info) this.applyWI(os.world_info);

    await this.svc.initForStory();

    this.runAutomations(os);

    this.activateIndex(0);
  }

  activateIndex(i: number) {
    console.log('[StoryOrchestrator] Activating checkpoint index:', i);
    this.currentIndex = Math.max(0, Math.min(i, ((this.story as any).checkpoints.length - 1)));
    const cp = this.currentCheckpoint as any;

    this.winMatchers = resolveTriggers(cp, 'win');
    this.failMatchers = resolveTriggers(cp, 'fail');

    const oa = normalizeOnActivate(cp.on_activate ?? cp.onActivate);
    if (oa?.authors_note) this.applyAN(oa.authors_note);
    if (oa?.world_info) this.applyWI(oa.world_info);

    this.currentRoleOverrides = (oa?.preset_overrides ?? {}) as Partial<
      Record<Role, PresetPartial>
    >;

    this.runAutomations(oa);

    this.resetEvaluationState();

    this.emit('checkpointChanged', { index: this.currentIndex, checkpoint: cp });
  }

  private runAutomations(oa?: NormalizedOnActivate) {
    if (!oa?.automation_ids?.length || !this.runAutomation) return;
    oa.automation_ids.forEach((id) => this.runAutomation?.(id));
  }

  private resetEvaluationState() {
    this.evaluationQueue = [];
    this.userTurnCounter = 0;
    this.turnsSinceLastEvaluation = 0;
    this.lastEvaluationReason = null;
    this.lastEvaluationAtTurn = 0;
    this.lastTurnProgressSnapshot = null;
    console.log('[StoryOrchestrator] Evaluation state reset for checkpoint', { index: this.currentIndex, checkpoint: this.currentCheckpoint });
    this.emitTurnProgress();
  }

  private emitTurnProgress() {
    const remainingUntilInterval = Math.max(0, this.evaluationTurnInterval - this.turnsSinceLastEvaluation);
    const snapshotKey = [
      this.userTurnCounter,
      this.turnsSinceLastEvaluation,
      remainingUntilInterval,
      this.evaluationQueue.length,
      this.evaluationInFlight ? 1 : 0,
    ].join(':');
    console.log('[StoryOrchestrator] Turn progress updated', {
      turn: this.userTurnCounter,
      turnsSinceLastEvaluation: this.turnsSinceLastEvaluation,
      remainingUntilInterval,
      queueLength: this.evaluationQueue.length,
      evaluationInFlight: this.evaluationInFlight,
    });
    this.lastTurnProgressSnapshot = snapshotKey;

    this.emit('turnProgress', {
      turn: this.userTurnCounter,
      turnsSinceLastEvaluation: this.turnsSinceLastEvaluation,
      remainingUntilInterval,
      queueLength: this.evaluationQueue.length,
      evaluationInFlight: this.evaluationInFlight,
    });
  }

  handleUserText(text: string) {
    const raw = typeof text === 'string' ? text : String(text ?? '');
    const trimmed = raw.trim();
    console.log('[StoryOrchestrator] handleUserText invoked', {
      rawLength: raw.length,
      trimmedLength: trimmed.length,
      preview: trimmed ? this.clampMessageText(trimmed, 160) : undefined,
      currentTurn: this.userTurnCounter,
      currentCheckpointId: this.currentCheckpointId,
    });
    if (!trimmed.length) return;

    if (!Array.isArray((this.story as any)?.checkpoints)) return;

    this.userTurnCounter += 1;
    this.turnsSinceLastEvaluation += 1;

    const turnsBeforeQueue = this.turnsSinceLastEvaluation;
    let queuedRequest: EvaluationRequest | null = null;

    const trigger = this.matchTrigger(trimmed);
    if (trigger) {
      const request: EvaluationRequest = {
        reason: trigger.reason,
        matchedPattern: trigger.pattern,
        text: trimmed,
        turn: this.userTurnCounter,
        timestamp: Date.now(),
      };
      if (this.scheduleEvaluation(request)) {
        queuedRequest = request;
      }
    } else if (this.turnsSinceLastEvaluation >= this.evaluationTurnInterval) {
      const request: EvaluationRequest = {
        reason: 'turn-interval',
        text: trimmed,
        turn: this.userTurnCounter,
        timestamp: Date.now(),
      };
      if (this.scheduleEvaluation(request)) {
        queuedRequest = request;
      }
    }

    if (queuedRequest) {
      this.emit('evaluationQueued', {
        request: queuedRequest,
        reason: queuedRequest.reason,
        turn: queuedRequest.turn,
        matchedPattern: queuedRequest.matchedPattern,
        turnsSinceLastEvaluationBefore: turnsBeforeQueue,
        turnsSinceLastEvaluationAfter: this.turnsSinceLastEvaluation,
        remainingUntilInterval: Math.max(0, this.evaluationTurnInterval - this.turnsSinceLastEvaluation),
        queueLength: this.evaluationQueue.length,
        evaluationInFlight: this.evaluationInFlight,
      });
    }

    this.emitTurnProgress();
  }

  private matchTrigger(text: string): { reason: EvaluationTriggerReason; pattern?: string } | null {
    for (const re of this.failMatchers) {
      if (this.regexMatches(re, text)) {
        return { reason: 'fail-trigger', pattern: re.toString() };
      }
    }
    for (const re of this.winMatchers) {
      if (this.regexMatches(re, text)) {
        return { reason: 'win-trigger', pattern: re.toString() };
      }
    }
    return null;
  }

  private regexMatches(re: RegExp, text: string): boolean {
    if (!re) return false;
    if (typeof re.lastIndex === 'number' && (re.flags.includes('g') || re.flags.includes('y'))) {
      re.lastIndex = 0;
    }
    try {
      return re.test(text);
    } catch (err) {
      console.warn('[StoryOrchestrator] Trigger regex failed', re, err);
      return false;
    }
  }

  private scheduleEvaluation(request: EvaluationRequest): boolean {
    const cp = this.currentCheckpoint as any;
    if (!cp) return false;

    if (request.reason === 'turn-interval') {
      const hasPendingInterval = this.evaluationQueue.some((item) => item.reason === 'turn-interval');
      if (hasPendingInterval || (this.evaluationInFlight && this.lastEvaluationReason === 'turn-interval')) {
        console.log('[StoryOrchestrator] Skipping redundant interval evaluation', { turn: request.turn, queueLength: this.evaluationQueue.length, inFlight: this.evaluationInFlight });
        return false;
      }
    }

    this.turnsSinceLastEvaluation = 0;
    this.evaluationQueue.push(request);
    console.log('[StoryOrchestrator] Queued evaluation request', { reason: request.reason, turn: request.turn, matchedPattern: request.matchedPattern, queueLength: this.evaluationQueue.length, inFlight: this.evaluationInFlight });
    void this.processEvaluationQueue();
    return true;
  }

  private async processEvaluationQueue(): Promise<void> {
    if (this.evaluationInFlight) return;
    if (!this.evaluationQueue.length) return;

    this.evaluationInFlight = true;
    try {
      while (this.evaluationQueue.length) {
        const request = this.evaluationQueue.shift()!;
        console.log('[StoryOrchestrator] Processing evaluation request', { reason: request.reason, turn: request.turn, queueLength: this.evaluationQueue.length, inFlight: this.evaluationInFlight });
        if (request.reason === 'win-trigger') {
          const cpInfo = this.currentCheckpoint as any;
          console.log('[StoryOrchestrator] Running checkpoint win evaluation', {
            checkpointId: this.currentCheckpointId,
            checkpointName: cpInfo?.name,
            turn: request.turn,
            matchedPattern: request.matchedPattern,
          });
        }
        const result = await this.executeModelEvaluation(request);
        this.lastEvaluationReason = request.reason;
        this.lastEvaluationAtTurn = request.turn;

        const outcome = result.outcome;
        console.log('[StoryOrchestrator] Evaluation result ready', { outcome, completed: result.completed, failed: result.failed, parsed: result.parsed, error: result.error });
        if (outcome === 'win') {
          console.log('[StoryOrchestrator] Checkpoint win condition met', {
            checkpointId: this.currentCheckpointId,
            checkpointName: (this.currentCheckpoint as any)?.name,
            turn: request.turn,
          });
        }
        const eventResult = outcome === 'continue' ? null : outcome;
        this.emit('evaluated', {
          text: request.text,
          result: eventResult,
          details: result,
        });

        this.emitTurnProgress();
        if (outcome === 'win') {
          const nextIndex = this.currentIndex + 1;
          if (nextIndex < (this.story as any).checkpoints.length) {
            console.log('[StoryOrchestrator] Advancing to next checkpoint after win', { nextIndex });
            this.activateIndex(nextIndex);
            break;
          }
        }
      }
    } catch (err) {
      console.error('[StoryOrchestrator] Failed to process evaluation queue', err);
    } finally {
      this.evaluationInFlight = false;
      this.emitTurnProgress();
      if (this.evaluationQueue.length) {
        void this.processEvaluationQueue();
      }
    }
  }

  private async executeModelEvaluation(request: EvaluationRequest): Promise<EvaluationDetails> {
    const cp = this.currentCheckpoint as any;
    const cpName = typeof cp?.name === 'string' ? cp.name : `Checkpoint ${this.currentIndex + 1}`;
    const objective = typeof cp?.objective === 'string' ? cp.objective : '';

    const transcript = this.buildConversationSnapshot();
    const prompt = this.buildEvaluationPrompt({
      cpName,
      objective,
      transcript,
      request,
    });

    const details: EvaluationDetails = {
      request,
      raw: '',
      parsed: null,
      outcome: 'continue',
      completed: false,
      failed: false,
    };

    if (typeof generateQuietPrompt !== 'function') {
      details.error = new Error('generateQuietPrompt unavailable');
      console.warn('[StoryOrchestrator] Cannot run evaluation: generateQuietPrompt unavailable');
      return details;
    }

    try {
      console.log('[StoryOrchestrator] Sending evaluation prompt to model', { checkpoint: cpName, objectiveSummary: objective ? objective.slice(0, 80) : '', reason: request.reason, turn: request.turn });
      const raw = await generateQuietPrompt({
        quietPrompt: prompt,
        quietName: 'Checkpoint Arbiter',
        jsonSchema: MODEL_EVALUATION_SCHEMA,
        removeReasoning: true,
      });
      details.raw = typeof raw === 'string' ? raw.trim() : '';
      console.log('[StoryOrchestrator] Model responded to evaluation request', { rawSample: details.raw.slice(0, 200) });
    } catch (err) {
      details.error = err;
      console.error('[StoryOrchestrator] Model evaluation prompt failed', err);
      return details;
    }

    const parsed = this.parseEvaluationResponse(details.raw);
    details.parsed = parsed;

    if (parsed) {
      details.completed = parsed.completed === 'YES';
      details.failed = !details.completed && parsed.failed === 'YES';
      details.outcome = details.completed ? 'win' : details.failed ? 'fail' : 'continue';
      console.log('[StoryOrchestrator] Parsed evaluation response', { completed: details.completed, failed: details.failed, reason: parsed.reason, confidence: parsed.confidence });
    } else if (details.raw) {
      console.warn('[StoryOrchestrator] Could not parse evaluation response', { raw: details.raw });
    }

    return details;
  }

  private buildEvaluationPrompt(params: {
    cpName: string;
    objective: string;
    transcript: string;
    request: EvaluationRequest;
  }): string {
    const { cpName, objective, transcript, request } = params;
    const lines: string[] = [];

    lines.push('You are an impartial story overseer evaluating whether the player has completed or failed their current objective.');
    lines.push(`Current checkpoint: ${cpName || '(unnamed checkpoint)'}.`);
    if (objective) {
      lines.push(`Objective: ${objective}`);
    }
    const triggerDescription = this.describeTrigger(request);
    if (triggerDescription) {
      lines.push(triggerDescription);
    }
    lines.push(`Player turn count at evaluation: ${request.turn}.`);

    lines.push('');
    lines.push('Conversation excerpt (most recent messages first is acceptable):');
    lines.push(transcript || 'No recent messages available.');

    if (request.text) {
      lines.push('');
      lines.push('Latest player message:');
      lines.push(this.clampMessageText(request.text, 240));
    }

    lines.push('');
    lines.push('Hidden question: "Has the player completed the current objective? Respond YES or NO."');
    lines.push('Determine if the player has also failed or abandoned the objective beyond recovery.');
    lines.push('Respond ONLY with JSON matching this schema:');
    lines.push('{ "completed": "YES" | "NO", "failed": "YES" | "NO", "reason": short text <= 120 chars, "confidence": number between 0 and 1 (optional) }');
    lines.push('Rules:');
    lines.push('1. completed "YES" implies failed "NO".');
    lines.push('2. failed "YES" implies completed "NO".');
    lines.push('3. If unsure, set both to "NO".');
    lines.push('4. Base your judgment strictly on the provided conversation excerpt and latest player message.');
    lines.push('5. Do not add commentary outside the JSON.');

    return lines.join('\n');
  }

  private describeTrigger(request: EvaluationRequest): string {
    switch (request.reason) {
      case 'win-trigger':
        return `A completion trigger matched the latest player message${request.matchedPattern ? ` (${request.matchedPattern})` : ''}.`;
      case 'fail-trigger':
        return `A failure trigger matched the latest player message${request.matchedPattern ? ` (${request.matchedPattern})` : ''}.`;
      case 'turn-interval':
      default:
        return `Periodic progress check (every ${this.evaluationTurnInterval} turns).`;
    }
  }

  private buildConversationSnapshot(limit = 12): string {
    try {
      const messages = Array.isArray(chat) ? chat : [];
      if (!messages.length) {
        return 'No chat history available yet.';
      }
      const start = Math.max(0, messages.length - limit);
      const subset = messages.slice(start);
      const lines: string[] = [];
      subset.forEach((msg, idx) => {
        const text = this.extractMessageText(msg);
        if (!text) return;
        const speaker = this.resolveSpeakerName(msg);
        lines.push(`${idx + 1}. ${speaker}: ${text}`);
      });
      return lines.length ? lines.join('\n') : 'No meaningful messages extracted.';
    } catch (err) {
      console.warn('[StoryOrchestrator] Failed to gather conversation snapshot', err);
      return 'Conversation context unavailable due to error.';
    }
  }

  private extractMessageText(message: any): string {
    if (!message) return '';
    const candidates = [
      message.mes,
      message.text,
      message.message,
      message.data?.text,
      message.data?.mes,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim().length) {
        return this.clampMessageText(candidate, 320);
      }
    }
    if (Array.isArray(message?.content)) {
      for (const chunk of message.content) {
        if (chunk && typeof chunk === 'object' && typeof chunk.text === 'string' && chunk.text.trim().length) {
          return this.clampMessageText(chunk.text, 320);
        }
      }
    }
    return '';
  }

  private resolveSpeakerName(message: any): string {
    if (!message) return 'Unknown';
    if (message.is_user === true) {
      if (typeof currentUserName === 'string' && currentUserName.trim().length) {
        return currentUserName.trim();
      }
      return 'Player';
    }
    const candidates = [message.name, message.character, message.speaker, message.role, message.author];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim().length) {
        return candidate.trim();
      }
    }
    if (message.is_system) return 'System';
    return 'Companion';
  }

  private clampMessageText(text: string, max = 360): string {
    if (!text) return '';
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (normalized.length <= max) return normalized;
    const sliceEnd = Math.max(0, max - 3);
    return sliceEnd > 0 ? `${normalized.slice(0, sliceEnd)}...` : '...';
  }

  private parseEvaluationResponse(raw: string): ModelEvaluationResponse | null {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;

    const direct = this.tryParseModelJson(trimmed);
    if (direct) return direct;

    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = this.tryParseModelJson(match[0]);
      if (parsed) return parsed;
    }

    const upper = trimmed.toUpperCase();
    if (upper === 'YES') return { completed: 'YES', failed: 'NO' };
    if (upper === 'NO') return { completed: 'NO', failed: 'NO' };
    if (upper.includes('FAIL')) return { completed: 'NO', failed: 'YES' };
    if (upper.includes('COMPLETE')) return { completed: 'YES', failed: 'NO' };

    return null;
  }

  private tryParseModelJson(raw: string): ModelEvaluationResponse | null {
    try {
      const parsed = JSON.parse(raw);
      return this.normalizeModelResponse(parsed);
    } catch {
      return null;
    }
  }

  private normalizeModelResponse(input: any): ModelEvaluationResponse | null {
    if (!input || typeof input !== 'object') return null;

    let completed = this.normalizeYesNo(
      (input as any).completed ??
      (input as any).complete ??
      (input as any).hasCompleted ??
      (input as any).answer
    );
    let failed = this.normalizeYesNo(
      (input as any).failed ??
      (input as any).failure ??
      (input as any).hasFailed ??
      (input as any).lose
    );

    if (!completed) {
      return null;
    }
    if (!failed) {
      failed = 'NO';
    }
    if (completed === 'YES') {
      failed = 'NO';
    } else if (failed === 'YES') {
      completed = 'NO';
    }

    const normalized: ModelEvaluationResponse = { completed, failed };

    const rawReason =
      (input as any).reason ??
      (input as any).rationale ??
      (input as any).justification ??
      (input as any).explanation;
    if (typeof rawReason === 'string' && rawReason.trim().length) {
      normalized.reason = this.clampMessageText(rawReason.trim(), 300);
    }

    const rawConfidence = (input as any).confidence ?? (input as any).score;
    if (typeof rawConfidence === 'number' && Number.isFinite(rawConfidence)) {
      normalized.confidence = Math.max(0, Math.min(1, rawConfidence));
    }

    return normalized;
  }

  private normalizeYesNo(value: unknown): YesNo | null {
    if (value === true) return 'YES';
    if (value === false) return 'NO';
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toUpperCase();
    if (normalized === 'YES') return 'YES';
    if (normalized === 'NO') return 'NO';
    return null;
  }

  applyRolePreset(role: Role): Record<string, any> {
    const cp = this.currentCheckpoint as any;
    const cpName = cp?.name as string | undefined;
    const overridesForRole = (this.currentRoleOverrides?.[role] ?? {}) as PresetPartial;
    return this.svc.applyForRole(role, overridesForRole, cpName);
  }

  private normalizeRoleName(input?: string | null): string | null {
    if (!input || typeof input !== 'string') return null;
    const normalized = typeof input.normalize === 'function' ? input.normalize('NFKC') : input;
    const trimmed = normalized.trim();
    if (!trimmed) return null;
    return trimmed.toLowerCase();
  }

  private roleFromTag(normalized: string | null): Role | null {
    if (!normalized) return null;
    switch (normalized) {
      case '@dm':
        return 'dm';
      case '@companion':
        return 'companion';
      case '@chat':
        return 'chat';
      default:
        return null;
    }
  }

  private getRoleNameLookup(): Map<string, Role> {
    if (this.cachedRoleLookup) return this.cachedRoleLookup;
    const lookup = new Map<string, Role>();
    const roles = ((this.story as any).roles ?? {}) as Partial<Record<Role, string>>;
    (['dm', 'companion', 'chat'] as Role[]).forEach((role) => {
      const normalized = this.normalizeRoleName(roles?.[role]);
      if (normalized) lookup.set(normalized, role);
    });
    this.cachedRoleLookup = lookup;
    return lookup;
  }






  private detectRoleFromSettings(payload: any): { role: Role; speakerName?: string; reason: string } | null {
    const lookup = this.getRoleNameLookup();
    if (!lookup.size) return null;

    const resolvedPayload = Array.isArray(payload) ? payload[0] : payload;
    const roles = ((this.story as any).roles ?? {}) as Partial<Record<Role, string>>;

    const dedupe = new Map<string, { raw: string; normalized: string; source: string; weight: number }>();
    const pushCandidate = (name: unknown, source: string, weight: number) => {
      if (typeof name !== 'string') return;
      const normalized = this.normalizeRoleName(name);
      if (!normalized) return;
      const existing = dedupe.get(normalized);
      if (!existing || weight < existing.weight) {
        dedupe.set(normalized, { raw: name.trim(), normalized, source, weight });
      }
    };

    const extractFromStopArray = (value: unknown, label: string, baseWeight: number) => {
      if (!Array.isArray(value)) return;
      value.forEach((item, idx) => {
        if (typeof item !== 'string') return;
        const match = item.match(/\n\s*([^:\n]{1,80})\s*:/);
        if (!match) return;
        pushCandidate(match[1], `${label}[${idx}]`, baseWeight + idx);
      });
    };

    const context = this.lastGenerationContext;
    if (context?.type === 'impersonate') {
      pushCandidate(roles?.chat, 'context:story.roles.chat', -200);
      pushCandidate(currentUserName, 'context:currentUserName', -190);
    } else {
      pushCandidate(getActiveCharacterName(), 'context:state.activeCharacterName', -200);
      pushCandidate(getCharacterNameById(context?.options?.force_chid), 'context:options.force_chid', -195);
      pushCandidate(getCharacterNameById(getActiveCharacterId()), 'context:state.activeCharacterId', -190);
    }

    if (resolvedPayload && typeof resolvedPayload === 'object') {
      const payloadAny = resolvedPayload as any;
      pushCandidate(payloadAny.character, 'payload.character', 0);
      pushCandidate(payloadAny.speaker, 'payload.speaker', 0);
      pushCandidate(payloadAny.role, 'payload.role', 0);
      pushCandidate(payloadAny.quietName, 'payload.quietName', 5);

      const promptCandidate = payloadAny.prompt;
      const resolvedPrompt = typeof promptCandidate === 'string' ? (promptCandidate as string) : null;
      if (resolvedPrompt) {
        const lines = resolvedPrompt.replace(/\r/g, '').split('\n');
        let seen = 0;
        for (let i = lines.length - 1; i >= 0 && seen < 12; i--) {
          const rawLine = lines[i].trim();
          if (!rawLine) continue;
          const colonIdx = rawLine.indexOf(':');
          if (colonIdx === -1) continue;
          const candidate = rawLine.slice(0, colonIdx).trim();
          if (!candidate) continue;
          pushCandidate(candidate, `prompt[line ${i}]`, 10 + seen);
          seen++;
        }
      }

      extractFromStopArray(payloadAny.stop, 'stop', 100);
      extractFromStopArray(payloadAny.stopping_strings, 'stopping_strings', 120);
    }

    const candidates = Array.from(dedupe.values()).sort((a, b) => a.weight - b.weight);

    for (const cand of candidates) {
      const tagRole = this.roleFromTag(cand.normalized);
      if (tagRole) {
        return { role: tagRole, speakerName: cand.raw, reason: `tag:${cand.source}` };
      }
    }

    for (const cand of candidates) {
      const role = lookup.get(cand.normalized);
      if (role) {
        return { role, speakerName: cand.raw, reason: cand.source };
      }
    }

    for (const role of ['companion', 'dm', 'chat'] as Role[]) {
      const raw = roles?.[role];
      if (!raw) continue;
      const normalized = this.normalizeRoleName(raw);
      if (normalized && lookup.get(normalized) === role) {
        return { role, speakerName: raw, reason: `fallback:${role}` };
      }
    }

    if (candidates.length) {
      console.warn('[StoryOrchestrator] Generation intercept: no matching role for candidates',
        candidates.map((cand) => ({ raw: cand.raw, source: cand.source, weight: cand.weight })));
    }

    return null;
  }

  private onTextGenSettingsReady(rawPayload: any, sourceEvent?: string) {
    const payload = Array.isArray(rawPayload) ? rawPayload[0] : rawPayload;
    const cp = this.currentCheckpoint as any;
    const cpId = this.currentCheckpointId;
    const cpName = cp?.name as string | undefined;
    const activeToken = this.currentGenerationToken;

    if (activeToken != null && this.lastAppliedGenerationToken === activeToken) {
      console.log('[StoryOrchestrator] Generation settings already applied for this turn', { sourceEvent, activeToken });
      return;
    }

    try {
      let detection = this.detectRoleFromSettings(payload);
      if (!detection && this.pendingSpeakerRole) {
        detection = {
          role: this.pendingSpeakerRole,
          speakerName: this.pendingSpeakerName,
          reason: 'group_member_drafted',
        };
      }

      if (!detection) {
        console.warn('[StoryOrchestrator] Generation intercept: unable to determine role for upcoming speaker', {
          checkpointId: cpId,
          checkpointName: cpName,
          generationContext: this.summarizeGenerationContext(),
          sourceEvent,
          pendingSpeakerRole: this.pendingSpeakerRole,
          pendingSpeakerName: this.pendingSpeakerName,
        });
        return;
      }

      if (activeToken != null) {
        this.lastAppliedGenerationToken = activeToken;
      }
      this.pendingSpeakerRole = null;
      this.pendingSpeakerName = undefined;
    } catch (err) {
      console.error('[StoryOrchestrator] Failed to handle TEXT_COMPLETION_SETTINGS_READY payload', err, { sourceEvent });
    }
  }

  private onGenerationStarted(payload: any) {
    const args = Array.isArray(payload) ? payload : [payload];
    const [type, options, dryRun] = args;
    const normalizedType = typeof type === 'string' ? type : undefined;
    const normalizedOptions = options && typeof options === 'object' ? options : undefined;
    const normalizedDryRun = typeof dryRun === 'boolean' ? dryRun : undefined;
    this.lastGenerationContext = {
      type: normalizedType,
      options: normalizedOptions,
      dryRun: normalizedDryRun,
    };
    this.generationSeq += 1;
    this.currentGenerationToken = this.generationSeq;
    this.lastAppliedGenerationToken = null;
  }

  private clearGenerationContext(reason: string) {
    if (this.lastGenerationContext) {
      console.log('[StoryOrchestrator] Generation context cleared', {
        reason,
        previous: this.summarizeGenerationContext(),
      });
    }
    this.lastGenerationContext = null;
    this.currentGenerationToken = null;
    this.lastAppliedGenerationToken = null;
    this.pendingSpeakerRole = null;
    this.pendingSpeakerName = undefined;
  }

  private summarizeGenerationContext() {
    if (!this.lastGenerationContext) return null;
    const { type, dryRun, options } = this.lastGenerationContext;
    const summary: Record<string, unknown> = {};
    if (type) summary.type = type;
    if (typeof dryRun === 'boolean') summary.dryRun = dryRun;
    if (options && typeof options === 'object') {
      if (Object.prototype.hasOwnProperty.call(options, 'force_chid')) {
        summary.force_chid = (options as any).force_chid;
      }
      if (Object.prototype.hasOwnProperty.call(options, 'quiet_prompt')) {
        const quiet = (options as any).quiet_prompt;
        if (typeof quiet === 'string' && quiet.length) {
          summary.quietPromptLength = quiet.length;
        }
      }
    }
    return Object.keys(summary).length ? summary : null;
  }

  private normalizeEventList(names: Array<unknown>): string[] {
    const seen = new Set<string>();
    for (const raw of names) {
      if (typeof raw !== 'string') continue;
      const trimmed = raw.trim();
      if (!trimmed.length) continue;
      if (!seen.has(trimmed)) {
        seen.add(trimmed);
      }
    }
    return Array.from(seen);
  }

  private resolveUserMessageEvents(custom?: string[]): string[] {
    if (Array.isArray(custom) && custom.length) {
      return this.normalizeEventList(custom);
    }
    return this.normalizeEventList([
      (event_types as any)?.MESSAGE_RECEIVED,
      (event_types as any)?.USER_MESSAGE,
      (event_types as any)?.USER_MESSAGE_SENT,
      'MESSAGE_RECEIVED',
      'USER_MESSAGE',
      'USER_MESSAGE_SENT',
    ]);
  }

  private resolveTextGenSettingsEvents(custom?: string[]): string[] {
    if (Array.isArray(custom) && custom.length) {
      return this.normalizeEventList(custom);
    }
    return this.normalizeEventList([
      (event_types as any)?.TEXT_COMPLETION_SETTINGS_READY,
      (event_types as any)?.CHAT_COMPLETION_SETTINGS_READY,
      (event_types as any)?.GENERATE_AFTER_COMBINE_PROMPTS,
      'text_completion_settings_ready',
      'chat_completion_settings_ready',
      'generate_after_combine_prompts',
    ]);
  }

  private coerceEventName(candidate: unknown, fallback?: string): string | undefined {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }
    if (typeof fallback === 'string' && fallback.length > 0) {
      return fallback;
    }
    return undefined;
  }

  attachSillyTavernEvents(
    eventSource: any,
    options: { userMessageEvents?: string[]; settingsEvents?: string[] } = {},
  ) {
    const offs: Array<() => void> = [];
    const safePush = (fn: (() => void) | undefined, label: string) => {
      if (typeof fn !== 'function') return;
      offs.push(() => {
        try {
          fn();
        } catch (error) {
          console.warn('[StoryOrchestrator] Failed to unsubscribe from', label, error);
        }
      });
    };

    const userEvents = this.resolveUserMessageEvents(options.userMessageEvents);
    console.log('[StoryOrchestrator] Subscribing to user message events', { userEvents });
    if (userEvents.length) {
      safePush(this.attachToEventSource(eventSource, userEvents), 'user events');
    }

    const textGenEvents = this.resolveTextGenSettingsEvents(options.settingsEvents);
    console.log('[StoryOrchestrator] Subscribing to text generation events', { textGenEvents });
    if (textGenEvents.length) {
      safePush(
        this.attachTextGenSettingsInterceptor(
          eventSource,
          textGenEvents,
          {
            generationStartedEvent: this.coerceEventName((event_types as any)?.GENERATION_STARTED),
            generationEndedEvent: this.coerceEventName((event_types as any)?.GENERATION_ENDED),
            generationStoppedEvent: this.coerceEventName((event_types as any)?.GENERATION_STOPPED),
            groupMemberDraftedEvent: this.coerceEventName((event_types as any)?.GROUP_MEMBER_DRAFTED, 'group_member_drafted'),
          },
        ),
        'text generation events',
      );
    }

    return () => {
      for (const off of offs) {
        off();
      }
    };
  }
  private subscribeToEvent(eventSource: any, eventName: string, handler: (payload: any) => void): () => void {
    const wrapped = (...args: any[]) => {
      if (!args || args.length === 0) {
        handler(undefined);
      } else if (args.length === 1) {
        handler(args[0]);
      } else {
        handler(args);
      }
    };

    try {
      if (typeof eventSource?.on === 'function') {
        const maybeUnsub = eventSource.on(eventName, wrapped);
        if (typeof maybeUnsub === 'function') return maybeUnsub;
        if (typeof eventSource.off === 'function') return () => eventSource.off(eventName, wrapped);
        if (typeof eventSource.removeListener === 'function') return () => eventSource.removeListener(eventName, wrapped);
        if (typeof eventSource.removeEventListener === 'function') return () => eventSource.removeEventListener(eventName, wrapped);
        if (maybeUnsub && typeof maybeUnsub.unsubscribe === 'function') return () => maybeUnsub.unsubscribe();
        if (typeof eventSource.unsubscribe === 'function') return () => eventSource.unsubscribe(eventName, wrapped);
        return () => { };
      }
      if (typeof eventSource?.addEventListener === 'function') {
        eventSource.addEventListener(eventName, wrapped);
        if (typeof eventSource.removeEventListener === 'function') {
          return () => eventSource.removeEventListener(eventName, wrapped);
        }
        return () => { };
      }
      if (typeof eventSource?.addListener === 'function') {
        eventSource.addListener(eventName, wrapped);
        if (typeof eventSource.removeListener === 'function') return () => eventSource.removeListener(eventName, wrapped);
        if (typeof eventSource.off === 'function') return () => eventSource.off(eventName, wrapped);
        return () => { };
      }
    } catch (err) {
      console.warn('[StoryOrchestrator] Failed to subscribe', eventName, err);
    }
    return () => { };
  }

  attachTextGenSettingsInterceptor(
    eventSource: any,
    eventNames: string | string[],
    opts: { generationStartedEvent?: string; generationEndedEvent?: string; generationStoppedEvent?: string; groupMemberDraftedEvent?: string } = {},
  ) {
    const offs: Array<() => void> = [];
    const namesArray = Array.isArray(eventNames) ? eventNames : [eventNames];
    const filteredNames = namesArray.filter((name): name is string => typeof name === "string" && name.length > 0);


    const safePush = (fn: (() => void) | undefined, label: string | undefined) => {
      if (typeof fn !== "function") return;
      offs.push(() => {
        try {
          fn();
        } catch {
          console.warn("[StoryOrchestrator] Failed to unsubscribe from text completion settings event", label);
        }
      });
    };

    if (opts.generationStartedEvent) {
      const offStart = this.subscribeToEvent(eventSource, opts.generationStartedEvent, (payload: any) => this.onGenerationStarted(payload));
      safePush(offStart, `start:${opts.generationStartedEvent}`);
    }
    if (opts.generationEndedEvent) {
      const offEnd = this.subscribeToEvent(eventSource, opts.generationEndedEvent, () => this.clearGenerationContext("ended"));
      safePush(offEnd, `end:${opts.generationEndedEvent}`);
    }
    if (opts.generationStoppedEvent) {
      const offStopped = this.subscribeToEvent(eventSource, opts.generationStoppedEvent, () => this.clearGenerationContext("stopped"));
      safePush(offStopped, `stop:${opts.generationStoppedEvent}`);
    }

    if (opts.groupMemberDraftedEvent) {
      const offDraft = this.subscribeToEvent(eventSource, opts.groupMemberDraftedEvent, (payload: any) => this.onGroupMemberDraft(payload, opts.groupMemberDraftedEvent));
      safePush(offDraft, `draft:${opts.groupMemberDraftedEvent}`);
    }

    for (const name of filteredNames) {
      const offSettings = this.subscribeToEvent(eventSource, name, (payload: any) => this.onTextGenSettingsReady(payload, name));
      safePush(offSettings, name);
    }

    return () => {
      for (const off of offs) {
        off();
      }
    };
  }

  private onGroupMemberDraft(rawPayload: any, sourceEvent?: string) {
    const chId = Array.isArray(rawPayload) ? rawPayload[0] : rawPayload;
    const numericId = typeof chId === 'number' ? chId : Number.parseInt(String(chId), 10);
    const speakerName = Number.isFinite(numericId) ? getCharacterNameById(numericId) : undefined;
    const lookup = this.getRoleNameLookup();
    const normalized = this.normalizeRoleName(speakerName ?? null);
    const role = normalized ? lookup.get(normalized) ?? null : null;

    if (!role) {
      console.warn('[StoryOrchestrator] Group member drafted but no matching role', { rawPayload, sourceEvent, speakerName, normalized });
      this.pendingSpeakerRole = null;
      this.pendingSpeakerName = undefined;
      return;
    }

    this.pendingSpeakerRole = role;
    this.pendingSpeakerName = speakerName;
    this.lastAppliedGenerationToken = null;

    this.applyRolePreset(role);
  }

  attachToEventSource(eventSource: any, eventNames: string[] = ['MESSAGE_RECEIVED', 'USER_MESSAGE']) {
    const offs: Array<() => void> = [];

    const lookupChatMessage = (ref: number | string) => {
      const idx = typeof ref === 'number' ? ref : Number.parseInt(String(ref), 10);
      if (Number.isNaN(idx) || idx < 0) return undefined;
      if (!Array.isArray(chat) || !chat.length) return undefined;

      const direct = chat[idx];
      if (direct) return direct;

      for (let i = 0; i < chat.length; i += 1) {
        const entry: any = chat[i];
        if (!entry) continue;
        const possibleIds = [entry.mesId, entry.mesid, entry.id, entry.messageId, entry.internalId];
        for (const candidate of possibleIds) {
          if (candidate === undefined || candidate === null) continue;
          const parsed = typeof candidate === 'number' ? candidate : Number.parseInt(String(candidate), 10);
          if (!Number.isNaN(parsed) && parsed === idx) {
            return entry;
          }
        }
      }

      return undefined;
    };

    const resolveMessagePayload = (payload: any): any => {
      if (payload == null) return payload;
      if (typeof payload === 'number' || (typeof payload === 'string' && /^\d+$/.test(payload))) {
        const resolved = lookupChatMessage(payload);
        if (resolved) {
          console.log('[StoryOrchestrator] Resolved numeric user event payload via chat lookup', {
            ref: payload,
            resolvedKeys: Object.keys(resolved).slice(0, 8),
          });
          return resolved;
        }
        console.warn('[StoryOrchestrator] Failed to resolve numeric user event payload', {
          ref: payload,
          chatLength: Array.isArray(chat) ? chat.length : undefined,
        });
        return payload;
      }
      if (Array.isArray(payload) && payload.length === 1) {
        return resolveMessagePayload(payload[0]);
      }
      return payload;
    };

    const extractText = (payload: any) => {
      if (!payload) return '';
      if (typeof payload === 'string') return payload;
      const extracted = this.extractMessageText(payload);
      if (extracted) return extracted;
      if (payload.message && typeof payload.message === 'string') return String(payload.message);
      if (payload.data?.text) return String(payload.data.text);
      if (payload.data?.mes) return String(payload.data.mes);
      return '';
    };

    for (const ev of eventNames) {
      const handler = (payload: any) => {
        const rawData = Array.isArray(payload) && payload.length === 1 ? payload[0] : payload;
        const resolvedData = resolveMessagePayload(rawData);
        let txt = extractText(resolvedData);
        if (!txt && Array.isArray(chat) && chat.length) {
          const fallbackMessage = chat[chat.length - 1];
          const fallbackText = this.extractMessageText(fallbackMessage);
          if (fallbackText) {
            console.log('[StoryOrchestrator] Falling back to latest chat entry for user text extraction', {
              fallbackIndex: chat.length - 1,
              fallbackKeys: fallbackMessage ? Object.keys(fallbackMessage).slice(0, 8) : undefined,
            });
            txt = fallbackText;
          }
        }
        const payloadSummary = resolvedData && typeof resolvedData === 'object'
          ? {
            keys: Object.keys(resolvedData).slice(0, 8),
            hasMes: typeof (resolvedData as any).mes === 'string' && (resolvedData as any).mes.trim().length > 0,
            hasText: typeof (resolvedData as any).text === 'string' && (resolvedData as any).text.trim().length > 0,
            hasMessage: typeof (resolvedData as any).message === 'string' && (resolvedData as any).message.trim().length > 0,
            dataKeys: resolvedData?.data && typeof resolvedData.data === 'object' ? Object.keys(resolvedData.data).slice(0, 8) : undefined,
            messageKeys: resolvedData?.message && typeof resolvedData.message === 'object' ? Object.keys(resolvedData.message).slice(0, 8) : undefined,
            type: (resolvedData as any)?.type,
            sample: (() => {
              try {
                return JSON.stringify(resolvedData, (_key, value) => {
                  if (typeof value === 'string' && value.length > 180) {
                    return `${value.slice(0, 177)}...`;
                  }
                  return value;
                }, 2).slice(0, 600);
              } catch {
                return undefined;
              }
            })(),
          }
          : { type: typeof resolvedData, originalType: typeof rawData, rawValue: rawData };
        console.log('[StoryOrchestrator] User event received', {
          event: ev,
          extractedLength: txt?.length ?? 0,
          preview: txt ? this.clampMessageText(txt, 160) : undefined,
          payloadSummary,
        });
        if (txt) this.handleUserText(txt);
      };
      const off = this.subscribeToEvent(eventSource, ev, handler);
      offs.push(() => {
        try {
          off();
        } catch {
          console.warn('[StoryOrchestrator] Failed to unsubscribe from event', ev);
        }
      });
    }

    return () =>
      offs.forEach((off) => {
        try {
          off();
        } catch {
          console.warn('[StoryOrchestrator] Failed to unsubscribe from event (cleanup)');
        }
      });
  }


}

export type {
  EvaluationDetails,
  EvaluationOutcome,
  EvaluationRequest,
  EvaluationTriggerReason,
  ModelEvaluationResponse,
};
