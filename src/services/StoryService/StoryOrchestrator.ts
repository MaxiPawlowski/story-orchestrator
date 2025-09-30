// src\services\StoryService\StoryOrchestrator.ts
import type { Role } from '@services/SchemaService/story-schema';
import { PresetService } from '../PresetService';
import {
  applyCharacterAN,
  clearCharacterAN,
} from '@services/SillyTavernAPI';
import type {
  ArbiterReason,
  CheckpointArbiterApi,
  EvaluationOutcome,
} from './checkpoint-arbiter-types';
import type { NormalizedStory } from '@services/SchemaService/story-validator';

export class StoryOrchestrator {
  private story: NormalizedStory;
  private presetService: PresetService;
  private checkpointArbiter: CheckpointArbiterApi;

  private idx = 0;
  private winRes: RegExp[] = [];
  private failRes: RegExp[] = [];
  private turn = 0;
  private sinceEval = 0;
  private intervalTurns = 3;
  private roleNameMap = new Map<string, Role>();

  private onEvaluated?: (ev: { outcome: EvaluationOutcome; reason: ArbiterReason; turn: number; matched?: string }) => void;
  private shouldApplyRole?: (role: Role) => boolean;
  private onRoleApplied?: (role: Role, cpName: string) => void;

  constructor(opts: {
    story: NormalizedStory;
    checkpointArbiter: CheckpointArbiterApi;
    onRoleApplied?: (role: Role, cpName: string) => void;
    shouldApplyRole?: (role: Role) => boolean;
    setEvalHooks?: (hooks: { onEvaluated?: (handler: (ev: { outcome: EvaluationOutcome; reason: ArbiterReason; turn: number; matched?: string }) => void) => void }) => void;
  }) {
    this.story = opts.story;
    this.checkpointArbiter = opts.checkpointArbiter;
    this.presetService = new PresetService({
      base: { source: "current" },
      storyId: this.story.title,
      storyTitle: this.story.title,
      roleDefaults: this.story.roleDefaults,
    });
    this.onRoleApplied = opts.onRoleApplied;
    this.shouldApplyRole = opts.shouldApplyRole;
    opts.setEvalHooks?.({ onEvaluated: (handler) => { this.onEvaluated = handler; } });
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
    this.checkpointArbiter.clear();

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
  private enqueueEval(reason: ArbiterReason, text: string, matched?: string) {
    this.sinceEval = 0;
    const turnSnapshot = this.turn;
    const checkpointIndex = this.idx;
    const cp = this.story.checkpoints[checkpointIndex];
    console.log('[StoryOrch] eval-queued', { reason, turn: turnSnapshot, matched });

    void this.checkpointArbiter.evaluate({
      cpName: cp?.name ?? `Checkpoint ${checkpointIndex + 1}`,
      objective: cp?.objective ?? '',
      latestText: text,
      reason,
      matched,
      turn: turnSnapshot,
      intervalTurns: this.intervalTurns,
    }).then((payload) => {
      const outcome = payload?.outcome ?? 'continue';
      this.onEvaluated?.({ outcome, reason, turn: turnSnapshot, matched });
      if (outcome === 'win' && this.idx === checkpointIndex) {
        const next = checkpointIndex + 1;
        if (next < this.story.checkpoints.length) {
          this.activateIndex(next);
        } else {
          this.checkpointArbiter.clear();
        }
      }
    }).catch((err) => {
      console.warn('[StoryOrch] arbiter error', err);
    });
  }




  private clamp(s: string, n: number) {
    const t = (s || '').replace(/\s+/g, ' ').trim();
    return t.length <= n ? t : `${t.slice(0, n - 3)}...`;
  }

}
