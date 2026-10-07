import { type CheckpointEffects, type NormalizedStoryV2, type NpcReplyEffect } from "@engine/index";
import { applyCharacterAN, clearCharacterAN, disableWIEntry, enableWIEntry, executeSlashCommands, lorebookExists, readSamplerPreset } from "@services/STAPI";
import { quoteSlashArg } from "@utils/string";
import type { SamplerApi } from "@utils/samplerKeys";
import type { WriteResult } from "@utils/writeResult";
import { isRecord } from "@utils/guards";
import { renderBlackboardMemo } from "./blackboardMemo";
import { releasePlan, worldInfoPlan, type WorldInfoBookPlan } from "./worldInfoGates";
import type { RunGuard } from "./runToken";
import type { RuntimeSnapshot } from "./types";

export const readNpcReplies = (effects: CheckpointEffects | undefined): NpcReplyEffect[] => (Array.isArray(effects?.npc_replies) ? effects.npc_replies : []);

// What the authored note resolves to, so the ledger can record it before the host is touched.
export const authorNoteText = (value: unknown, snapshot: RuntimeSnapshot): string | null => {
  if (value === null) return "";
  if (typeof value === "string") return value;
  if (!isRecord(value)) return null;
  const text = typeof value.text === "string" ? value.text : "";
  const includeBlackboard = value.inject_blackboard === true || value.include_blackboard === true;
  return includeBlackboard ? `${text}\n\n${renderBlackboardMemo(snapshot)}`.trim() : text;
};

export const applyAuthorNote = async (value: unknown, rendered: string): Promise<WriteResult<{ text: string }>> => {
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
export const applyWorldInfo = async (plans: WorldInfoBookPlan[], run?: RunGuard): Promise<string[]> => {
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

export const fireReply = async (reply: NpcReplyEffect) => {
  const text = reply.text ?? reply.instruction ?? "";
  if (reply.kind !== "scripted") await executeSlashCommands(`/trigger await=true ${quoteSlashArg(reply.member)}`, { silent: false });
  else if (text.trim()) await executeSlashCommands(`/sendas name=${quoteSlashArg(reply.member)} raw=false ${quoteSlashArg(text)}`, { silent: false });
};
