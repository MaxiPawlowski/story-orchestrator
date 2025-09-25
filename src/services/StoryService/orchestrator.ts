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
} from '@services/SillyTavernAPI';

type Listener<T = any> = (payload: T) => void;
type StoryInput = StoryPreset | NormalizedStory;
type CheckpointInput =
  | Checkpoint
  | NormalizedCheckpoint
  | (Checkpoint & NormalizedCheckpoint);
type OnActivateInput = any;

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

(function attachUiBridge() {
  const MAX_UI_SYNC_ATTEMPTS = 20;
  const UI_SYNC_DELAY_MS = 100;

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

  private currentRoleOverrides: Partial<Record<Role, PresetPartial>> = {};
  private cachedRoleLookup: Map<string, Role> | null = null;
  private lastGenerationContext: { type?: string; options?: any; dryRun?: boolean } | null = null;
  private generationSeq = 0;
  private currentGenerationToken: number | null = null;
  private lastAppliedGenerationToken: number | null = null;
  private pendingSpeakerRole: Role | null = null;
  private pendingSpeakerName: string | undefined;

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

  on<T = any>(event: 'checkpointChanged' | 'evaluated', cb: Listener<T>) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb as Listener);
    return () => this.off(event, cb);
  }
  off<T = any>(event: 'checkpointChanged' | 'evaluated', cb: Listener<T>) {
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

    this.emit('checkpointChanged', { index: this.currentIndex, checkpoint: cp });
  }

  private runAutomations(oa?: NormalizedOnActivate) {
    if (!oa?.automation_ids?.length || !this.runAutomation) return;
    oa.automation_ids.forEach((id) => this.runAutomation?.(id));
  }

  evaluate(text: string): 'win' | 'fail' | null {
    if (this.failMatchers.some((re) => re.test(text))) return 'fail';
    if (this.winMatchers.some((re) => re.test(text))) return 'win';
    return null;
  }

  handleUserText(text: string): 'win' | 'fail' | null {
    const res = this.evaluate(text);
    this.emit('evaluated', { text, result: res });
    if (res === 'win') {
      const next = this.currentIndex + 1;
      if (next < (this.story as any).checkpoints.length) this.activateIndex(next);
    }
    return res;
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
    if (userEvents.length) {
      safePush(this.attachToEventSource(eventSource, userEvents), 'user events');
    }

    const textGenEvents = this.resolveTextGenSettingsEvents(options.settingsEvents);
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

    const extractText = (payload: any) => {
      if (!payload) return '';
      if (typeof payload === 'string') return payload;
      if (payload.text) return String(payload.text);
      if (payload.mes) return String(payload.mes);
      if (payload.message) return String(payload.message);
      if (payload.data?.text) return String(payload.data.text);
      return '';
    };

    for (const ev of eventNames) {
      const handler = (payload: any) => {
        const data = Array.isArray(payload) ? payload[0] : payload;
        const txt = extractText(data);
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
