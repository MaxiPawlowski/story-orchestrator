// src\services\StoryService\StoryOrchestrator.ts
import type { Role } from '@services/SchemaService/story-schema';
import { PresetService } from '../PresetService';
import {
  generateQuietPrompt,
  chat,
  applyCharacterAN,
  clearCharacterAN,
} from '@services/SillyTavernAPI';
import type { NormalizedStory } from '@services/SchemaService/story-validator';

type EvaluationOutcome = 'win' | 'fail' | 'continue';
type ModelEval = { completed: boolean; failed: boolean; reason?: string; confidence?: number };

export class StoryOrchestrator {
  private story: NormalizedStory;
  private presetService: PresetService;

  private idx = 0;
  private winRes: RegExp[] = [];
  private failRes: RegExp[] = [];
  private turn = 0;
  private sinceEval = 0;
  private intervalTurns = 3;
  private evalBusy = false;
  private queue: Array<{ reason: 'win' | 'fail' | 'interval'; text: string; matched?: string; turn: number }> = [];
  private roleNameMap = new Map<string, Role>();

  private onEvaluated?: (ev: any) => void;
  private shouldApplyRole?: (role: Role) => boolean;
  private onRoleApplied?: (role: Role, cpName: string) => void;

  constructor(opts: {
    story: NormalizedStory;
    onRoleApplied?: (role: Role, cpName: string) => void;
    shouldApplyRole?: (role: Role) => boolean;
    setEvalHooks?: (hooks: { onEvaluated?: (ev: any) => void }) => void;
  }) {
    this.story = opts.story;
    this.presetService = new PresetService({
      base: { source: "current" },
      storyId: this.story.title,
      storyTitle: this.story.title,
      roleDefaults: this.story.roleDefaults,
    });
    this.onRoleApplied = opts.onRoleApplied;
    this.shouldApplyRole = opts.shouldApplyRole;
    opts.setEvalHooks?.({ onEvaluated: (ev) => (this.onEvaluated = ev) });
  }

  index() { return this.idx; }

  setIntervalTurns(n: number) { this.intervalTurns = Math.max(1, n | 0); }

  async init() {
    this.seedRoleMap();
    await this.presetService.initForStory();
    this.activateIndex(0);
  }

  activateIndex(i: number) {
    this.idx = Math.max(0, Math.min(i, this.story.checkpoints.length - 1));
    const cp = this.story.checkpoints[this.idx];
    this.winRes = Array.isArray(cp.winTriggers) ? cp.winTriggers : [];
    this.failRes = Array.isArray(cp.failTriggers) ? cp.failTriggers : [];

    // TODO: hook these up
    // const oa = cp.onActivate;
    // if (oa?.world_info) this.applyWI(oa.world_info);
    // if (oa?.automation_ids) for (const id of oa.automation_ids) this.runAutomation?.(id);
    // if (cp.onActivate?.authors_note) this.applyAuthorsNote(cp.onActivate.authors_note);
    this.turn = 0;
    this.sinceEval = 0;
    this.queue.length = 0;

    console.log('[StoryOrch] activate', {
      idx: this.idx, id: cp.id, name: cp.name,
      win: this.winRes.map(String), fail: this.failRes.map(String),
    });
  }

  setActiveRole(roleOrDisplayName: string) {
    const raw = String(roleOrDisplayName ?? '');
    const norm = this.norm(raw);
    const role = this.roleNameMap.get(norm);
    if (!role) return;
    if (this.shouldApplyRole && !this.shouldApplyRole(role)) return;

    const cp = this.story.checkpoints[this.idx];
    const overrides = cp.onActivate?.preset_overrides?.[role];

    const roleNote = cp.onActivate?.authors_note?.[role];
    const characterName =
      role === 'dm' ? this.story.roles?.dm :
        role === 'companion' ? this.story.roles?.companion : undefined;

    if (characterName && roleNote) {
      applyCharacterAN(roleNote, {
        position: "chat",
        interval: 1,
        depth: 4,
        role: "system",
      });
      console.log('[StoryOrch] applied per-character AN', { role, characterName, cp: cp.name });
    } else {
      clearCharacterAN();
      console.log('[StoryOrch] cleared AN (no per-character AN)', { role, characterName, cp: cp.name });
    }

    this.presetService.applyForRole(role, overrides, cp.name);
    this.onRoleApplied?.(role, cp.name);
  }

  handleUserText(raw: string) {
    const text = (raw ?? '').trim();
    console.log('[StoryOrch] userText', { turn: this.turn + 1, sinceEval: this.sinceEval + 1, sample: this.clamp(raw, 80) });
    if (!text) return;
    this.turn += 1;
    this.sinceEval += 1;

    const match = this.matchTrigger(text);
    if (match) this.enqueueEval(match.reason, text, match.pattern);
    else if (this.sinceEval >= this.intervalTurns) this.enqueueEval('interval', text);
  }

  private norm(s?: string | null) { return (s ?? '').normalize('NFKC').trim().toLowerCase(); }
  private seedRoleMap() {
    const roles = (this.story?.roles ?? {}) as Partial<Record<Role, string>>;
    (['dm', 'companion', 'chat'] as Role[]).forEach((r) => {
      const n = this.norm(roles[r]);
      if (n) this.roleNameMap.set(n, r);
    });
  }
  private matchTrigger(text: string) {
    for (const re of this.failRes) {
      re.lastIndex = 0;
      if (re.test(text)) return { reason: 'fail' as const, pattern: re.toString() };
    }
    for (const re of this.winRes) {
      re.lastIndex = 0;
      if (re.test(text)) return { reason: 'win' as const, pattern: re.toString() };
    }
    return null;
  }
  private enqueueEval(reason: 'win' | 'fail' | 'interval', text: string, matched?: string) {
    this.sinceEval = 0;
    this.queue.push({ reason, text, matched, turn: this.turn });
    console.log('[StoryOrch] eval-queued', { reason, turn: this.turn, matched });

    if (!this.evalBusy) {
      console.log('[StoryOrch] drain-start');
      this.drain();
    }
  }

  private async drain() {
    if (this.evalBusy) return;
    this.evalBusy = true;
    try {
      while (this.queue.length) {
        const req = this.queue.shift()!;
        const outcome = await this.evaluate(req.reason, req.text, req.matched, req.turn);
        this.onEvaluated?.({ outcome, reason: req.reason, turn: req.turn, matched: req.matched });

        if (outcome === 'win') {
          const next = this.idx + 1;
          if (next < this.story.checkpoints.length) this.activateIndex(next);
          break;
        }
        // (fail|continue) => keep draining
      }
    } finally {
      this.evalBusy = false;
      if (this.queue.length) this.drain();
    }
  }

  private async evaluate(
    reason: 'win' | 'fail' | 'interval',
    latestText: string,
    matched: string | undefined,
    turn: number,
  ): Promise<EvaluationOutcome> {
    const cp = this.story.checkpoints[this.idx];
    const prompt = this.buildEvalPrompt({
      cpName: cp.name ?? `Checkpoint ${this.idx + 1}`,
      objective: cp.objective ?? '',
      transcript: this.snapshot(10),
      reason, matched, turn, latestText,
    });
    console.log('[StoryOrch] arbiter prompt');
    console.log(prompt)
    let raw = '';
    try {
      raw = await generateQuietPrompt({
        quietPrompt: prompt,
        quietName: 'Checkpoint Arbiter',
        skipWIAN: true,
        quietToLoud: false,
        removeReasoning: false,
        trimToSentence: false,
        responseLength: 256,
      });
    } catch (e) {
      console.warn('[StoryOrch] arbiter failed', e);
      return 'continue';
    }

    const parsed = this.parseModel(raw);
    console.log('[StoryOrch] arbiter parsed', { parsed });
    if (!parsed) {
      console.warn('[StoryOrch] arbiter parse failed', { raw: String(raw).slice(0, 200) });
      return 'continue';
    }
    return parsed.completed ? 'win'
      : parsed.failed ? 'fail'
        : 'continue';
  }

  private buildEvalPrompt(args: {
    cpName: string; objective: string; transcript: string;
    reason: 'win' | 'fail' | 'interval'; matched?: string; turn: number; latestText: string;
  }) {
    const r = args.reason === 'interval'
      ? `Periodic check (every ${this.intervalTurns} turns).`
      : args.reason === 'win'
        ? `Completion trigger matched${args.matched ? `: ${args.matched}` : ''}.`
        : `Failure trigger matched${args.matched ? `: ${args.matched}` : ''}.`;
    return [
      'You are an impartial story overseer.',
      `Checkpoint: ${args.cpName}`,
      args.objective ? `Objective: ${args.objective}` : '',
      r,
      `Player turn: ${args.turn}`,
      '',
      'Conversation excerpt (most recent first is fine):',
      args.transcript || 'No recent messages.',
      '',
      'Latest player message:',
      this.clamp(args.latestText, 240),
      '',
      'Respond ONLY with JSON. Example:',
      '{"completed": true, "failed": false, "reason": "...", "confidence": 0.95}',
    ].filter(Boolean).join('\n');
  }

  private snapshot(limit = 10): string {
    const msgs = Array.isArray(chat) ? chat.slice(-limit) : [];
    const lines: string[] = [];
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i];
      const text =
        (typeof m?.mes === 'string' && m.mes.trim()) ||
        (typeof m?.text === 'string' && m.text.trim()) ||
        (typeof m?.message === 'string' && m.message.trim()) ||
        (typeof m?.data?.text === 'string' && m.data.text.trim()) ||
        (typeof m?.data?.mes === 'string' && m.data.mes.trim()) || '';
      if (!text) continue;
      const who =
        (typeof m?.name === 'string' && m.name) ||
        (typeof m?.character === 'string' && m.character) ||
        (m?.is_user ? 'Player' : 'Companion');
      lines.push(`${i + 1}. ${this.clamp(String(who), 40)}: ${this.clamp(text, 300)}`);
    }
    return lines.reverse().join('\n');
  }

  private clamp(s: string, n: number) {
    const t = (s || '').replace(/\s+/g, ' ').trim();
    return t.length <= n ? t : `${t.slice(0, n - 3)}...`;
  }

  private parseModel(raw: unknown): ModelEval | null {
    let s = typeof raw === 'string' ? raw.trim() : '';
    if (!s) return null;

    if (/^```/m.test(s)) {
      s = s.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, '$1').trim();
    }

    const blocks = [...s.matchAll(/\{[\s\S]*?\}/g)].map(m => m[0]);
    const candidate = blocks.sort((a, b) => b.length - a.length)[0] || s;

    const toBool = (v: any): boolean | null => {
      if (typeof v === 'boolean') return v;
      if (typeof v === 'number') return v !== 0;
      if (typeof v === 'string') {
        const t = v.trim().toLowerCase();
        if (t === 'true') return true;
        if (t === 'false') return false;
      }
      return null;
    };

    const tryJson = (x: string) => {
      try {
        const obj = JSON.parse(x);
        const cRaw = obj.completed ?? obj.complete ?? obj.answer;
        const fRaw = obj.failed ?? obj.failure ?? obj.lose;
        const c = toBool(cRaw);
        const f = toBool(fRaw);
        if (c === null && f === null) return null;
        const out: ModelEval = {
          completed: !!c,
          failed: !!f,
          reason: typeof obj.reason === 'string' ? this.clamp(obj.reason, 200) : undefined,
          confidence: typeof obj.confidence === 'number'
            ? Math.max(0, Math.min(1, obj.confidence)) : undefined,
        };
        if (out.completed) out.failed = false;
        if (out.failed) out.completed = false;
        return out;
      } catch { return null; }
    };

    const parsed = tryJson(candidate) || tryJson(s);
    if (parsed) return parsed;

    const boolKey = (key: string) => {
      const re = new RegExp(`"${key}"\\s*:\\s*(true|false)`, 'i');
      const m = s.match(re);
      if (m) return m[1].toLowerCase() === 'true';
      return null;
    };
    const completed = boolKey('completed');
    const failed = boolKey('failed');
    if (completed !== null || failed !== null) {
      const out: ModelEval = {
        completed: !!completed,
        failed: !!failed,
      };
      if (out.completed) out.failed = false;
      if (out.failed) out.completed = false;
      return out;
    }

    return null;
  }

}
