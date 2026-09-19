import type { Checkpoint, CheckpointEffects, NormalizedStoryV2, NpcReplyEffect, NpcReplyTrigger } from "@engine/index";
import {
  applyBackground,
  applyCharacterAN,
  applyTextGenPresetRuntime,
  clearCharacterAN,
  disableWIEntry,
  enableWIEntry,
  executeSlashCommands,
  findTextGenPreset,
  lorebookExists,
  setGroupMembersDisabled,
  getContext,
} from "@services/STAPI";
import { quoteSlashArg } from "@utils/string";
import { renderBlackboardMemo } from "./blackboardMemo";
import type { RuntimeExtras, RuntimeSnapshot } from "./types";
import { releasePlan, worldInfoPlan, type WorldInfoBookPlan } from "./worldInfoGates";

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const readStrings = (value: unknown): string[] => Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : typeof value === "string" && value.trim() ? [value] : [];

const readNpcReplies = (effects: CheckpointEffects | undefined): NpcReplyEffect[] => {
  const value = effects?.npc_replies;
  return Array.isArray(value) ? value : [];
};

const applyAuthorNote = async (value: unknown, snapshot: RuntimeSnapshot) => {
  if (value === null) {
    await clearCharacterAN();
    return;
  }
  if (typeof value === "string") {
    await applyCharacterAN(value);
    return;
  }
  if (!isRecord(value)) return;
  const text = typeof value.text === "string" ? value.text : "";
  const includeBlackboard = value.inject_blackboard === true || value.include_blackboard === true;
  const rendered = includeBlackboard ? `${text}\n\n${renderBlackboardMemo(snapshot)}`.trim() : text;
  if (!rendered) {
    await clearCharacterAN();
    return;
  }
  await applyCharacterAN(rendered, {
    position: value.position === "after" || value.position === "before" || value.position === "chat" ? value.position : undefined,
    depth: typeof value.depth === "number" ? value.depth : undefined,
    interval: typeof value.interval === "number" ? value.interval : undefined,
    role: value.role === "system" || value.role === "user" || value.role === "assistant" ? value.role : undefined,
  });
};

const applyPreset = (value: unknown, story: NormalizedStoryV2) => {
  if (typeof value === "string") {
    const preset = findTextGenPreset(value);
    if (preset) applyTextGenPresetRuntime(`Story:${story.title}`, preset, `Story:${story.title}`);
    return;
  }
  if (!isRecord(value)) return;
  const name = typeof value.name === "string" ? value.name : `Story:${story.title}`;
  const preset = isRecord(value.settings) ? value.settings : isRecord(value.preset) ? value.preset : null;
  if (preset) applyTextGenPresetRuntime(name, preset, name);
};

const applyWorldInfo = async (plans: WorldInfoBookPlan[]) => {
  for (const plan of plans) {
    if (!lorebookExists(plan.lorebook)) continue;
    if (plan.disable.length) await disableWIEntry(plan.lorebook, plan.disable);
    if (plan.enable.length) await enableWIEntry(plan.lorebook, plan.enable);
  }
};

const applyCastChanges = async (value: unknown) => {
  if (!isRecord(value)) return;
  await setGroupMembersDisabled(readStrings(value.enable), readStrings(value.disable));
};

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

export class EffectsApplier {
  // The one thing a transition posts into the chat itself: a compact system note naming where the
  // story moved (opt-out in settings), kept to one line.
  async announceTransition(checkpoint: Checkpoint | undefined, extras: RuntimeExtras) {
    if (!extras.ui.announceTransitions || !checkpoint) return;
    const raw = checkpoint.objective ? `◈ ${checkpoint.name} — ${checkpoint.objective}` : `◈ ${checkpoint.name}`;
    await executeSlashCommands(`/comment compact=true raw=false ${quoteSlashArg(raw.replace(/\s*\r?\n\s*/g, " ").trim())}`, { silent: true });
  }

  // `path` is every checkpoint the chat entered, ending at `checkpoint`: world_info is rebuilt from it
  // each time, so a flag another chat left in a shared lorebook never survives into this one.
  async applyCheckpoint(story: NormalizedStoryV2, checkpoint: Checkpoint, extras: RuntimeExtras, snapshot: RuntimeSnapshot, mode: "activate" | "hydrate", path: string[]) {
    if (!extras.requirements.ready) return;
    await applyWorldInfo(worldInfoPlan(story, path));
    const effects: CheckpointEffects = checkpoint.effects ?? {};
    if (effects.author_note !== undefined) await applyAuthorNote(effects.author_note, snapshot);
    if (effects.preset !== undefined) applyPreset(effects.preset, story);
    if (effects.cast_changes !== undefined) await applyCastChanges(effects.cast_changes);
    // Deterministic stagecraft: idempotent, so hydrating a chat and rolling back into this
    // checkpoint both restore its background without re-triggering anything.
    if (effects.background) await applyBackground(effects.background.name);
    if (mode === "activate") await this.fireNpcReplies(checkpoint, extras, "onEnter");
    extras.lastAppliedCheckpointId = checkpoint.id;
    extras.updatedAt = new Date().toISOString();
  }

  async releaseWorldInfo(owners: unknown[], keep: unknown | null) {
    await applyWorldInfo(releasePlan(owners, keep));
  }

  async fireNpcReplies(checkpoint: Checkpoint, extras: RuntimeExtras, trigger: NpcReplyTrigger, occurrence?: number, speakerAliases: string[] = []) {
    if (trigger === "afterSpeak" && extras.lastSelfInjectionMessageId === lastMessageId()) return;
    const aliases = speakerAliases.map((alias) => alias.trim().toLowerCase());
    const replies = readNpcReplies(checkpoint.effects).filter((reply) => reply.trigger === trigger);
    for (let index = 0; index < replies.length; index += 1) {
      const reply = replies[index];
      if (reply.enabled === false) continue;
      if (trigger === "afterSpeak" && reply.after_member && !aliases.includes(reply.after_member.trim().toLowerCase())) continue;
      const key = `${checkpoint.id}:${trigger}:${reply.member}:${index}${occurrence === undefined ? "" : `:${occurrence}`}`;
      const count = extras.firedNpcReplies[key] ?? 0;
      const max = Math.max(1, reply.maxTriggers ?? 1);
      if (count >= max) continue;
      if (typeof reply.probability === "number" && Math.random() > reply.probability) continue;
      extras.firedNpcReplies[key] = count + 1;
      await fireReply(reply);
      extras.lastSelfInjectionMessageId = lastMessageId();
    }
  }
}
