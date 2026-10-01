import type { Checkpoint, CheckpointEffects, NormalizedStoryV2, NpcReplyEffect, NpcReplyTrigger } from "@engine/index";
import {
  applyBackground,
  applyCharacterAN,
  clearCharacterAN,
  disableWIEntry,
  enableWIEntry,
  executeSlashCommands,
  lorebookExists,
  readSamplerPreset,
  resolveGroupMemberId,
  samplerApi,
  setGroupMembersDisabled,
  getActiveGroup,
  getContext,
  guardHostStream,
  watchHostChatMove,
  isHostGenerating,
  stopHostGeneration,
} from "@services/STAPI";
import { quoteSlashArg } from "@utils/string";
import { resolveSamplerOverlay, type SamplerApi } from "@utils/samplerKeys";
import { couldNot, wrote } from "@utils/writeResult";
import { samplerOverlay } from "./samplerOverlay";
import type { WriteResult } from "@utils/writeResult";
import { renderBlackboardMemo } from "./blackboardMemo";
import { transitionNoteText } from "./narrative";
import { appendRow, castRestoreBatches, pendingRow, restorePlan, rowsAfter, setStatus, type EffectWrite } from "./effectLedger";
import { effectExtensions, type EffectExtension, type EffectExtensionInput } from "./effectExtensions";
import type { EffectLedgerRow, EffectTarget, RuntimeExtras, RuntimeSnapshot } from "./types";
import { releasePlan, worldInfoPlan, type WorldInfoBookPlan } from "./worldInfoGates";
import { worldInfoFilesHeld } from "./worldInfoMode";
import { beginRun, type RunGuard, type RunOwnership } from "./runToken";
import { generationWatch } from "./generationWatch";
import { recordNpcReplyFire, recordOnEnterPost } from "./npcReplyRewind";
import { isRecord } from "@utils/guards";
import { castInPlayNote } from "./castInPlay";

// What a host effect changed, read back from the host as it is NOW. Every reader is a
// QUESTION with an honest "cannot tell", so a reconcile never guesses: a target whose value cannot be
// read leaves its row `pending` rather than inventing an answer.
export interface EffectHostReads {
  read: (target: EffectTarget) => Record<string, unknown> | null;
}

export const rollbackCastMirror = (mirror: { member: string; disabled: boolean }[], reverted: EffectLedgerRow[]) => {
  let next = [...mirror];
  for (const row of [...reverted].reverse()) {
    if (row.target.kind !== "cast") continue;
    const member = row.target.member;
    const before = typeof row.before?.disabled === "boolean" ? row.before.disabled : null;
    next = next.filter((entry) => entry.member !== member);
    if (before !== null) next.push({ member, disabled: before });
  }
  return next;
};

// The targets a restore can put back. a preset is a per-request sampler overlay
// that writes nothing to the host, so it has nothing to restore and is not "left in place" either.
const RESTORABLE = new Set<EffectTarget["kind"]>(["cast", "an", "background", "extension"]);
const CHAT_SCOPED = new Set<EffectTarget["kind"]>(["an", "extension"]);
const NOTHING_TO_RESTORE = new Set<EffectTarget["kind"]>(["preset"]);
const JUMP_RELEASED = new Set<EffectTarget["kind"]>(["an", "background", "extension"]);

export const OVERLAY_UNSUPPORTED_REASON = "a checkpoint preset applies on Text Completion and Chat Completion connections only; this connection uses another API";

const readStrings = (value: unknown): string[] => Array.isArray(value) ? value.filter(
  (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
) : typeof value === "string" && value.trim() ? [value] : [];

const readNpcReplies = (effects: CheckpointEffects | undefined): NpcReplyEffect[] => {
  const value = effects?.npc_replies;
  return Array.isArray(value) ? value : [];
};

// What the authored note resolves to, so the ledger can record it before the host is touched.
const authorNoteText = (value: unknown, snapshot: RuntimeSnapshot): string | null => {
  if (value === null) return "";
  if (typeof value === "string") return value;
  if (!isRecord(value)) return null;
  const text = typeof value.text === "string" ? value.text : "";
  const includeBlackboard = value.inject_blackboard === true || value.include_blackboard === true;
  return includeBlackboard ? `${text}\n\n${renderBlackboardMemo(snapshot)}`.trim() : text;
};

const applyAuthorNote = async (value: unknown, rendered: string): Promise<WriteResult<{ text: string }>> => {
  if (!rendered) return clearCharacterAN();
  if (!isRecord(value)) return applyCharacterAN(rendered);
  return applyCharacterAN(rendered, {
    position: value.position === "after" || value.position === "before" || value.position === "chat" ? value.position : undefined,
    depth: typeof value.depth === "number" ? value.depth : undefined,
    interval: typeof value.interval === "number" ? value.interval : undefined,
    role: value.role === "system" || value.role === "user" || value.role === "assistant" ? value.role : undefined,
  });
};

// The authored preset effect, resolved at activation to the sampler stack it overlays. A string names
// an installed preset of the connection's own API, matched exactly (never `/preset`'s fuzzy match); an
// object may carry the stack inline.
export function resolvePreset(value: unknown, story: NormalizedStoryV2, api: SamplerApi | null): { name: string; settings: Record<string, unknown> | null } {
  if (typeof value === "string") return { name: value, settings: api ? readSamplerPreset(value, api) : null };
  if (!isRecord(value)) return { name: "", settings: null };
  const name = typeof value.name === "string" ? value.name : `Story:${story.title}`;
  const inline = isRecord(value.settings) ? value.settings : isRecord(value.preset) ? value.preset : null;
  return { name, settings: inline ?? (api && typeof value.name === "string" ? readSamplerPreset(value.name, api) : null) };
}

// Each book is two host writes and the plan spans several books, so the world is asked before
// every one of them, not once around the loop.
// Each toggle answers what the host did, and a refusal is returned so the caller can journal
// it; before, both answers were discarded and a lost write read as an applied checkpoint.
const applyWorldInfo = async (plans: WorldInfoBookPlan[], run?: RunGuard): Promise<string[]> => {
  const refused: string[] = [];
  for (const plan of plans) {
    if (!lorebookExists(plan.lorebook)) continue;
    if (run && !run.stillOwns()) return refused;
    const off = plan.disable.length ? await disableWIEntry(plan.lorebook, plan.disable) : null;
    if (off && !off.ok) refused.push(off.reason);
    if (run && !run.stillOwns()) return refused;
    const on = plan.enable.length ? await enableWIEntry(plan.lorebook, plan.enable) : null;
    if (on && !on.ok) refused.push(on.reason);
  }
  return refused;
};

// C: leaving scan mode applies the open chat's state through the file path at once. It enables
// from rest-off. `path` is null when the story's requirements do not hold, which leaves its own entries
// alone, as the file path does.
export const replayWorldInfoFiles = async (library: unknown[], story: NormalizedStoryV2 | null, path: string[] | null, run?: RunGuard): Promise<string[]> => {
  const released = await applyWorldInfo(releasePlan(story ? [...library, story] : library, story), run);
  if (!story || !path) return released;
  return [...released, ...(await applyWorldInfo(worldInfoPlan(story, path), run))];
};

// `disabled_members` lives on the GROUP, shared by every chat that opens it, so a
// checkpoint's cast change outlives the chat that made it: one story's staging would otherwise decide
// another story's cast. Each member an effect names is its own ledger row, carrying the flag the
// group held BEFORE, and the chat keeps its own `extras.effects.cast` mirror — what this chat plays
// is never read back from the group.
const castFlag = (group: { disabled_members?: string[] }, member: string) => ({ disabled: (group.disabled_members ?? []).includes(member) });

const fireReply = async (reply: NpcReplyEffect) => {
  if (reply.kind === "scripted") {
    const text = reply.text ?? reply.instruction ?? "";
    if (!text.trim()) return;
    await executeSlashCommands(`/sendas name=${quoteSlashArg(reply.member)} raw=false ${quoteSlashArg(text)}`, { silent: false });
    return;
  }
  await executeSlashCommands(`/trigger await=true ${quoteSlashArg(reply.member)}`, { silent: false });
};

const lastMessageId = () => {
  const chat = Array.isArray(getContext().chat) ? getContext().chat : [];
  return chat.length - 1;
};

export interface EffectApplierDeps {
  /** The host as it is now, for the ledger's questions. */
  reads?: EffectHostReads;
  /** Puts a recorded value back. Returns whether the host agreed. */
  restore?: (row: EffectLedgerRow) => Promise<boolean>;
  /** Puts a group's recorded member flags back in ONE write. */
  restoreCast?: (group: string, flags: Array<{ member: string; disabled: boolean }>) => Promise<boolean>;
  /** Persist what has been recorded so far: a pending row must survive a crash to be reconciled. */
  persist?: () => Promise<void>;
  /**
   * Matrix. Whether the last save is still unwritten (`hasUnsavedChanges`).
   * `persist()` cannot answer this: it resolves even when nothing landed, because the call it wraps
   * swallows its own errors. Read AFTER the write-ahead persist, this is the evidence that the
   * `pending` row exists anywhere but memory — and a host effect whose record is memory-only is the
   * one thing the write-ahead row exists to prevent.
   *
   * This reading is deliberately the STICKY one, and it is deliberately NOT the reading the
   * reconciliation queue uses (`saveWasLost`, `memoryQueue.commitDecision`). The two ask different
   * questions with different tolerances for not knowing. The applier asks "may I touch the HOST with a
   * write I cannot record?" — so an unverifiable save refuses, because a checkpoint's world info
   * switching on an unrecorded write is the failure the row exists to prevent. The queue asks "may I
   * tell the AUTHOR their decision is settled?" — and refusing THAT on a read-back that merely could
   * not speak would block the only actor who can make the decision, for a write that in fact landed.
   * Unifying them would move one of the two failures to the other's side of the line.
   */
  unsaved?: () => boolean;
  journal?: (summary: string, note?: string) => void;
  roll?: (key: string) => number | null;
}

export const PENDING_NOT_SAVED = "the effect was not applied: its write-ahead record could not be saved";

export type RestoreScope = "leave" | "exit" | "restart" | { since: number };

const openChatId = () => String(getContext().chatId ?? "");

export class EffectsApplier {
  private speaking = 0;
  constructor(private readonly ownership: RunOwnership, private readonly deps: EffectApplierDeps = {}) {}

  private appliedChat: string | null = null;
  private applying: { key: string; run: RunGuard; done: Promise<void> } | null = null;

  // The one thing a transition posts into the chat itself: a compact system note naming where the
  // story moved (opt-out in settings), kept to one line.
  // A transition the player was never told about leaves a trace: both ways out of this used to be silent.
  async announceTransition(checkpoint: Checkpoint | undefined, extras: RuntimeExtras, ownsOpenChat = true) {
    if (!checkpoint) return;
    await this.announceText(transitionNoteText(checkpoint), extras, ownsOpenChat, `transition to "${checkpoint.name}"`);
  }

  async announceText(raw: string, extras: RuntimeExtras, ownsOpenChat = true, what = `"${raw}"`) {
    if (!extras.ui.announceTransitions) return;
    const unannounced = `${what} was not announced`;
    if (!ownsOpenChat) return this.deps.journal?.(unannounced, "the open chat is not the chat this boundary belongs to");
    if (!(await executeSlashCommands(`/comment compact=true raw=false ${quoteSlashArg(raw.replace(/\s*\r?\n\s*/g, " ").trim())}`, { silent: true }))) {
      this.deps.journal?.(unannounced, "the /comment that posts the note was refused");
    }
  }

  // The write-ahead rule for one effect: RECORD what is about to change (and what it
  // holds now) BEFORE the host is touched, then record what the host said. A crash in between leaves
  // a `pending` row that hydrate reconciles against the host's own value, so a write that landed
  // without being recorded is still known to have landed — and one that never landed is known to
  // have nothing to restore.
  private async withLedger<T extends object>(extras: RuntimeExtras, write: Omit<EffectWrite, "at">, apply: () => Promise<WriteResult<T>>): Promise<WriteResult<T>> {
    const row = pendingRow({ ...write, at: new Date().toISOString() });
    extras.effects.ledger = appendRow(extras.effects.ledger, row);
    await this.deps.persist?.();
    if (this.deps.unsaved?.()) {
      extras.effects.ledger = setStatus(extras.effects.ledger, row.id, "failed", { reason: PENDING_NOT_SAVED });
      this.deps.journal?.(`${write.effect} effect was not applied`, PENDING_NOT_SAVED);
      return { ok: false, reason: PENDING_NOT_SAVED };
    }
    let result: WriteResult<T>;
    try {
      result = await apply();
    } catch (error) {
      result = { ok: false, reason: error instanceof Error ? error.message : "the host refused the write" };
    }
    extras.effects.ledger = setStatus(extras.effects.ledger, row.id, result.ok ? "applied" : "failed", result.ok ? {} : { reason: result.reason });
    await this.deps.persist?.();
    if (!result.ok) this.deps.journal?.(`${write.effect} effect could not be applied`, result.reason);
    return result;
  }

  // `path` is every checkpoint the chat entered, ending at `checkpoint`: world_info is rebuilt from it
  // each time, so a flag another chat left in a shared lorebook never survives into this one.
  async applyCheckpoint(
    story: NormalizedStoryV2, checkpoint: Checkpoint, extras: RuntimeExtras, snapshot: RuntimeSnapshot, mode: "activate" | "hydrate", path: string[], gate?: number,
  ): Promise<void> {
    const key = `${openChatId()}|${checkpoint.id}`;
    const running = this.applying;
    if (mode === "hydrate" && running?.key === key && running.run.stillOwns()) return running.done;
    const run = beginRun(this.ownership);
    const entry = { key, run, done: this.applyCheckpointNow(story, checkpoint, extras, snapshot, mode, path, run, gate) };
    this.applying = entry;
    try {
      await entry.done;
    } finally {
      if (this.applying === entry) this.applying = null;
    }
  }

  private async applyCheckpointNow(
    story: NormalizedStoryV2, checkpoint: Checkpoint, extras: RuntimeExtras, snapshot: RuntimeSnapshot, mode: "activate" | "hydrate", path: string[], run: RunGuard, gate?: number,
  ) {
    const ready = extras.requirements.ready;
    // This is the write edge with the widest blast radius in the extension: unlike
    // a memory pass, almost nothing here is per-chat. World Info flags live in shared lorebook
    // FILES, the Author's Note and preset are install state, and `cast_changes` mutates the
    // GROUP's disabled_members, which outlives the chat entirely. Five awaits run in sequence,
    // two of which go out to the host (a slash command, the group API), so the world can move
    // between any two steps and the rest of the sequence would then apply one story's staging to
    // another story's chat.
    //
    // It stops rather than completing. Whatever moved the world — a chat change, a story swap —
    // runs its own applyCheckpoint, so a partial sequence is corrected immediately, while a
    // completed wrong sequence leaves the other story's cast disabled on a shared group.
    // The authored new-chat opening goes out FIRST, before any staging. Applying a Saga checkpoint
    // writes ~100 group members one await at a time, so an opening fired at the end of the sequence
    // left a brand-new chat blank for the better part of a minute — and an interrupted apply lost it
    // entirely. Every other onEnter beat stays below, after the cast it needs is enabled.
    if (ready) await this.fireNpcReplies(checkpoint, extras, "onEnter", undefined, [], (reply) => reply.new_chat_only === true);
    if (!run.stillOwns()) return;
    const scope = { checkpointId: checkpoint.id, boundary: 0, messageId: lastMessageId() };
    const worldInfoRefused = !ready || worldInfoFilesHeld() ? [] : await applyWorldInfo(worldInfoPlan(story, path), run);
    if (worldInfoRefused.length) this.deps.journal?.("world_info effect could not be applied", worldInfoRefused.join("; "));
    const effects: CheckpointEffects = checkpoint.effects ?? {};
    if (!run.stillOwns()) return;
    const note = effects.author_note === undefined ? null : authorNoteText(effects.author_note, snapshot);
    if (note !== null) await this.withLedger(
      extras,
      { effect: "author_note", target: { kind: "an" }, before: this.reads().read({ kind: "an" }), after: { text: note }, ...scope },
      () => applyAuthorNote(effects.author_note, note),
    );
    // The check goes before EVERY host write, not once per group of them: the Author Note above is
    // itself a host write, so the preset below it is the second one since the last check.
    if (!run.stillOwns()) return;
    samplerOverlay.clear();
    if (effects.preset !== undefined) {
      const api = samplerApi();
      const preset = resolvePreset(effects.preset, story, api);
      await this.withLedger(
        extras,
        { effect: "preset", target: { kind: "preset", name: preset.name, api: api ?? "none" }, before: null, after: { name: preset.name }, ...scope },
        async () => this.armOverlay(preset, api, checkpoint.id),
      );
    }
    if (!run.stillOwns()) return;
    if (ready && mode === "hydrate") await this.applyCastMirror(extras, scope, run);
    if (!run.stillOwns()) return;
    if (ready && effects.cast_changes !== undefined) await this.applyCastChanges(effects.cast_changes, extras, scope, run, mode === "activate" ? checkpoint.name : null);
    // Deterministic stagecraft: idempotent, so hydrating a chat and rolling back into this
    // checkpoint both restore its background without re-triggering anything.
    // `applyCastChanges` awaits once per member, so this needs its own check: without it the
    // background is the one write in this sequence that can land in another chat.
    if (!run.stillOwns()) return;
    if (effects.background) {
      const name = effects.background.name;
      await this.withLedger(
        extras,
        { effect: "background", target: { kind: "background" }, before: this.reads().read({ kind: "background" }), after: { name }, ...scope },
        () => applyBackground(name),
      );
    }
    for (const extension of ready ? effectExtensions() : []) {
      if (!run.stillOwns()) return;
      await this.applyExtension(extension, { story, checkpoint, path, ledger: extras.effects.ledger, mode }, extras, scope);
    }
    if (!run.stillOwns()) return;
    this.appliedChat = openChatId();
    if (!ready) return;
    if (mode === "activate") await this.fireOnEnter(checkpoint, extras, gate);
    if (!run.stillOwns()) return;
    extras.lastAppliedCheckpointId = checkpoint.id;
    extras.updatedAt = new Date().toISOString();
  }

  private async applyExtension(extension: EffectExtension, input: EffectExtensionInput, extras: RuntimeExtras, scope: { checkpointId: string | null; boundary: number; messageId: number }) {
    const { step, notes } = extension.plan(input);
    for (const note of notes) this.deps.journal?.(note.summary, note.detail);
    if (!step) return;
    const write = { ...scope, effect: step.effect, target: { kind: "extension" as const, name: extension.name }, before: step.before, after: step.after };
    if (step.found !== undefined) {
      const row = pendingRow({ ...write, at: new Date().toISOString() });
      extras.effects.ledger = appendRow(extras.effects.ledger, { ...row, status: "externally-changed", found: step.found });
      this.deps.journal?.(`${step.effect} effect was not applied`, "the chat holds a value this story did not write, so it was left alone");
      return;
    }
    await this.withLedger(extras, write, step.write);
  }

  // A checkpoint preset is a sampler overlay on this checkpoint's loud requests. It
  // never changes the selected preset and writes no install-wide setting; unknown keys are reported.
  private armOverlay(preset: { name: string; settings: Record<string, unknown> | null }, api: SamplerApi | null, checkpointId: string) {
    if (!api) return couldNot(OVERLAY_UNSUPPORTED_REASON);
    if (!preset.settings) return couldNot(`there is no ${api === "textgen" ? "Text Completion" : "Chat Completion"} preset named "${preset.name}"`);
    const { values, unknown } = resolveSamplerOverlay(preset.settings, api);
    if (!Object.keys(values).length) return couldNot(`"${preset.name}" sets no sampler this connection sends`);
    samplerOverlay.set({ chatId: openChatId(), checkpointId, name: preset.name, api, values, unknown });
    if (unknown.length) this.deps.journal?.(`${unknown.length} setting(s) of "${preset.name}" are not per-request samplers and are not sent`, unknown.slice(0, 12).join(", "));
    return wrote({ name: preset.name });
  }

  async releaseStaging(story: NormalizedStoryV2, extras: RuntimeExtras, run: RunGuard) {
    const staged = extras.effects.ledger.filter((row) => row.status === "applied" && JUMP_RELEASED.has(row.target.kind));
    if (staged.length) await this.restoreEffects(extras, staged);
    if (!run.stillOwns() || !extras.requirements.ready) return;
    await this.releaseWorldInfo([story], null, run);
  }

  // Spike: under scan-time gating a chat's world info is a per-scan view, so neither
  // the path replay nor the release writes a file. Default off; the file path is the fallback.
  async releaseWorldInfo(owners: unknown[], keep: unknown | null, run?: RunGuard) {
    if (worldInfoFilesHeld()) return;
    const refused = await applyWorldInfo(releasePlan(owners, keep), run);
    if (refused.length) this.deps.journal?.("world_info could not be released", refused.join("; "));
  }

  // Each member the effect names is one decision about a shared group, so each is its own row: a
  // two-member change that fails on the second leaves the first recorded and restorable.
  private async applyCastChanges(value: unknown, extras: RuntimeExtras, scope: { checkpointId: string | null; boundary: number; messageId: number }, run: RunGuard, entering: string | null) {
    if (!isRecord(value)) return;
    const group = getActiveGroup();
    const dropped = entering ? castInPlayNote(entering, readStrings(value.disable), getContext().chat) : null;
    if (dropped) this.deps.journal?.(dropped.summary, dropped.note);
    const changes: Array<[string, boolean]> = [
      ...readStrings(value.disable).map((name): [string, boolean] => [name, true]),
      ...readStrings(value.enable).map((name): [string, boolean] => [name, false])
    ];
    for (const [identifier, disabled] of changes) {
      // Inside the loop, like `fireNpcReplies`: one member is one await, and a two-member change
      // that stops half-way must not disable the second member on another chat's group.
      if (!run.stillOwns()) return;
      const member = resolveGroupMemberId(identifier);
      if (!member) continue;
      const before = group ? castFlag(group, member) : null;
      if (before?.disabled === disabled) continue;
      await this.withLedger(extras, { ...scope, effect: "cast", target: { kind: "cast", group: String(group?.id ?? ""), member }, before, after: { disabled } }, async () => {
        const result = await setGroupMembersDisabled(disabled ? [] : [identifier], disabled ? [identifier] : []);
        if (result.ok) extras.effects.cast = [...extras.effects.cast.filter((entry) => entry.member !== member), { member, disabled }];
        return result;
      });
    }
  }

  private async applyCastMirror(extras: RuntimeExtras, scope: { checkpointId: string | null; boundary: number; messageId: number }, run: RunGuard) {
    const group = getActiveGroup();
    if (!group) return;
    for (const { member, disabled } of extras.effects.cast) {
      if (!run.stillOwns()) return;
      const before = castFlag(group, member);
      if (before.disabled === disabled) continue;
      await this.withLedger(
        extras,
        { ...scope, effect: "cast", target: { kind: "cast", group: String(group.id ?? ""), member }, before, after: { disabled } },
        async () => setGroupMembersDisabled(disabled ? [] : [member], disabled ? [member] : []),
      );
    }
  }

  async restoreFor(extras: RuntimeExtras, scope: RestoreScope): Promise<{ reverted: number; refused: number }> {
    const left = this.appliedChat !== null && this.appliedChat !== openChatId();
    if (scope === "leave" && !left) return { reverted: 0, refused: 0 };
    const chatScoped = (row: EffectLedgerRow) => CHAT_SCOPED.has(row.target.kind);
    const since = typeof scope === "object" ? new Set(rowsAfter(extras.effects.ledger, scope.since).map((row) => row.id)) : null;
    const rows = extras.effects.ledger.filter((row) => (since ? since.has(row.id) : true) && !(left && chatScoped(row)));
    const outcome = await this.restoreEffects(extras, rows, !left);
    if (since) extras.effects.cast = rollbackCastMirror(extras.effects.cast, extras.effects.ledger.filter((row) => since.has(row.id) && row.status === "reverted"));
    if (left || scope === "exit" || scope === "restart") {
      this.appliedChat = null;
      samplerOverlay.clear();
    }
    return outcome;
  }

  /**
   * Put back what this chat changed in shared host state. Compare-and-set: a row whose
   * target no longer holds what this chat wrote is REFUSED and marked `externally-changed`, so a
   * restore can never silently undo an edit someone else made in between.
   */
  async restoreEffects(extras: RuntimeExtras, rows: EffectLedgerRow[] = extras.effects.ledger, persist = true): Promise<{ reverted: number; refused: number }> {
    if (!this.deps.restore) return { reverted: 0, refused: 0 };
    const kept = rows.filter((row) => row.status === "applied" && !RESTORABLE.has(row.target.kind) && !NOTHING_TO_RESTORE.has(row.target.kind));
    if (kept.length) this.deps.journal?.(`${kept.length} host change(s) this story cannot put back were left in place`, [...new Set(kept.map((row) => row.effect))].join(", "));
    const { steps, refused } = restorePlan(rows.filter((row) => RESTORABLE.has(row.target.kind)), this.reads());
    for (const row of refused) extras.effects.ledger = setStatus(extras.effects.ledger, row.id, "externally-changed", { found: row.found });
    let reverted = 0;
    const settle = (row: EffectLedgerRow, restored: boolean) => {
      extras.effects.ledger = setStatus(extras.effects.ledger, row.id, restored ? "reverted" : "revert-failed", restored ? {} : { reason: `could not restore ${row.effect}` });
      if (restored) reverted += 1;
    };
    const { batches, rest } = castRestoreBatches(steps, Boolean(this.deps.restoreCast));
    for (const batch of batches) {
      const restored = await this.deps.restoreCast?.(batch.group, batch.flags).catch(() => false) ?? false;
      batch.rows.forEach((row) => settle(row, restored));
    }
    for (const step of rest) settle(step.row, await this.deps.restore(step.row).catch(() => false));
    if (refused.length) this.deps.journal?.(`${refused.length} host change(s) were edited outside this story and left alone`);
    if (reverted) this.deps.journal?.(`restored ${reverted} host change(s)`);
    if (persist) await this.deps.persist?.();
    return { reverted, refused: refused.length };
  }

  private reads(): EffectHostReads {
    return this.deps.reads ?? { read: () => null };
  }

  private async speak(reply: NpcReplyEffect) {
    if (reply.kind === "scripted") return fireReply(reply);
    const chatId = openChatId();
    const stream = guardHostStream(chatId);
    const lapse = this.ownership.signal?.();
    const before = generationWatch.openedCount();
    let stopped = false;
    const stopIfOurs = () => {
      if (stopped) return;
      stopped = true;
      if (stream.halt()) return;
      if (before !== null && generationWatch.openedCount() === before + 1 && isHostGenerating()) stopHostGeneration();
    };
    lapse?.addEventListener("abort", stopIfOurs, { once: true });
    const unwatch = watchHostChatMove(chatId, stopIfOurs);
    try {
      await fireReply(reply);
    } finally {
      unwatch();
      lapse?.removeEventListener("abort", stopIfOurs);
      stream.release();
    }
  }

  private async fireOnEnter(checkpoint: Checkpoint, extras: RuntimeExtras, gate?: number) {
    const run = beginRun(this.ownership);
    const first = Math.max(gate ?? 0, lastMessageId()) + 1;
    const spoken = await this.fireNpcReplies(checkpoint, extras, "onEnter", undefined, [], (reply) => reply.new_chat_only !== true);
    const last = lastMessageId();
    if (gate === undefined || !spoken || last < first || !run.stillOwns()) return;
    extras.onEnterPosts = recordOnEnterPost(extras.onEnterPosts ?? [], { checkpointId: checkpoint.id, gate, first, last });
  }

  async removeOnEnterPost(post: { first: number; last: number }, run: RunGuard) {
    if (post.last < post.first || lastMessageId() !== post.last || !run.stillOwns()) return;
    if (!(await executeSlashCommands(`/cut ${post.first}-${post.last}`, { silent: true }))) this.deps.journal?.("the scene opener was not removed", "the /cut that removes it was refused");
  }

  async fireNpcReplies(
    checkpoint: Checkpoint, extras: RuntimeExtras, trigger: NpcReplyTrigger, breakAt?: number, speakerAliases: string[] = [], allow?: (reply: NpcReplyEffect) => boolean,
  ): Promise<number> {
    if (trigger === "afterSpeak" && (this.speaking > 0 || extras.lastSelfInjectionMessageId === lastMessageId())) return 0;
    if (trigger === "sceneBreak" && (this.speaking > 0 || (breakAt !== undefined && extras.lastSelfInjectionMessageId === breakAt))) return 0;
    const aliases = speakerAliases.map((alias) => alias.trim().toLowerCase());
    const replies = readNpcReplies(checkpoint.effects).filter((reply) => reply.trigger === trigger && (!allow || allow(reply)));
    // This is the only effect that SPEAKS: `fireReply` posts a message into whatever
    // chat is open. One await per reply, so a multi-reply checkpoint that outlives its chat puts
    // the rest of this story's characters into somebody else's conversation, visibly, in the
    // transcript. The check is inside the loop because each reply is its own write.
    const run = beginRun(this.ownership);
    let spoken = 0;
    for (let index = 0; index < replies.length; index += 1) {
      if (!run.stillOwns()) return spoken;
      const reply = replies[index];
      if (reply.enabled === false) continue;
      if (reply.new_chat_only && (trigger !== "onEnter" || !Array.isArray(getContext().chat) || getContext().chat.length !== 0)) continue;
      if (trigger === "afterSpeak" && reply.after_member && !aliases.includes(reply.after_member.trim().toLowerCase())) continue;
      const key = `${checkpoint.id}:${trigger}:${reply.member}:${index}`;
      const count = extras.firedNpcReplies[key] ?? 0;
      const max = Math.max(1, reply.maxTriggers ?? 1);
      if (count >= max) continue;
      if (typeof reply.probability === "number") {
        const roll = this.deps.roll?.(key) ?? Math.random();
        const fired = roll <= reply.probability;
        this.deps.journal?.(`NPC reply ${reply.member} (${trigger}) ${fired ? "fired" : "skipped"} by its roll`, `rolled ${roll.toFixed(3)} against ${reply.probability} at ${key}`);
        if (!fired) continue;
      }
      extras.firedNpcRepliesAt = extras.firedNpcRepliesAt ?? {};
      recordNpcReplyFire(extras.firedNpcReplies, extras.firedNpcRepliesAt, key, lastMessageId());
      this.speaking += 1;
      try { await this.speak(reply); }
      finally { this.speaking -= 1; }
      spoken += 1;
      if (!run.stillOwns()) return spoken;
      extras.lastSelfInjectionMessageId = lastMessageId();
    }
    return spoken;
  }
}
