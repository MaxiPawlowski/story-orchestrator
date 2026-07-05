import type { Checkpoint, CheckpointEffects, NormalizedStoryV2, NpcReplyEffect, NpcReplyTrigger } from "@engine/index";
import {
  applyCharacterAN,
  applyTextGenPresetRuntime,
  clearCharacterAN,
  disableWIEntry,
  enableWIEntry,
  executeSlashCommands,
  findTextGenPreset,
  setGroupMembersDisabled,
  getContext,
} from "@services/STAPI";
import { quoteSlashArg } from "@utils/string";
import { renderBlackboardMemo } from "./blackboardMemo";
import type { RuntimeExtras, RuntimeSnapshot } from "./types";

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

const applyWorldInfo = async (value: unknown) => {
  if (!isRecord(value)) return;
  const applyEntries = async (entries: unknown, enabled: boolean) => {
    const list = Array.isArray(entries) ? entries : [entries];
    for (const entry of list) {
      if (!isRecord(entry)) continue;
      const lorebook = typeof entry.lorebook === "string" ? entry.lorebook : typeof entry.book === "string" ? entry.book : "";
      const comments = readStrings(entry.comments ?? entry.comment);
      if (!lorebook || !comments.length) continue;
      if (enabled) await enableWIEntry(lorebook, comments);
      else await disableWIEntry(lorebook, comments);
    }
  };
  await applyEntries(value.enable, true);
  await applyEntries(value.disable, false);
};

const applyCastChanges = async (value: unknown) => {
  if (!isRecord(value)) return;
  await setGroupMembersDisabled(readStrings(value.enable), readStrings(value.disable));
};

const fireReply = async (reply: NpcReplyEffect) => {
  if (reply.kind === "scripted") {
    const text = reply.text ?? reply.instruction ?? "";
    if (!text.trim()) return;
    await executeSlashCommands(`/sendas name=${quoteSlashArg(reply.member)} ${quoteSlashArg(text)}`, { silent: false });
    return;
  }
  await executeSlashCommands(`/trigger await=true ${quoteSlashArg(reply.member)}`, { silent: false });
};

const lastMessageId = () => {
  const chat = Array.isArray(getContext().chat) ? getContext().chat : [];
  return chat.length - 1;
};

export class EffectsApplier {
  async applyCheckpoint(story: NormalizedStoryV2, checkpoint: Checkpoint, extras: RuntimeExtras, snapshot: RuntimeSnapshot, mode: "activate" | "hydrate") {
    if (!extras.requirements.ready) return;
    const effects = checkpoint.effects;
    if (!effects) return;
    if (effects.author_note !== undefined) await applyAuthorNote(effects.author_note, snapshot);
    if (effects.preset !== undefined) applyPreset(effects.preset, story);
    if (effects.world_info !== undefined) await applyWorldInfo(effects.world_info);
    if (effects.cast_changes !== undefined) await applyCastChanges(effects.cast_changes);
    if (mode === "activate") await this.fireNpcReplies(checkpoint, extras, "onEnter");
    extras.lastAppliedCheckpointId = checkpoint.id;
    extras.updatedAt = new Date().toISOString();
  }

  async fireNpcReplies(checkpoint: Checkpoint, extras: RuntimeExtras, trigger: NpcReplyTrigger) {
    if (trigger === "afterSpeak" && extras.lastSelfInjectionMessageId === lastMessageId()) return;
    const replies = readNpcReplies(checkpoint.effects).filter((reply) => reply.trigger === trigger);
    for (let index = 0; index < replies.length; index += 1) {
      const reply = replies[index];
      const key = `${checkpoint.id}:${trigger}:${reply.member}:${index}`;
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
