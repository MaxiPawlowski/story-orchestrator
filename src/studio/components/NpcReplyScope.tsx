import React from "react";
import { NPC_REPLY_SCOPES, TALK_TURNS_CAP, type NpcReplyEffect, type NpcReplyScope as Scope } from "@engine/index";

const SCOPE_LABELS: Record<Scope, string> = {
  story: "per chat",
  entry: "per visit to this beat",
  player_turn: "per player message",
};

const NpcReplyScope: React.FC<{ reply: NpcReplyEffect; index: number; update: (index: number, patch: Partial<NpcReplyEffect>) => void }> = ({ reply, index, update }) => (
  <div className="flex flex-wrap items-center gap-3 text-xs st-muted">
    <label className="flex items-center gap-1">
      id
      <input data-so="npc-reply-id" className="text_pole st-input w-32" aria-label={`Reply ${index + 1} id`} placeholder={`${reply.trigger}:${reply.member || "member"}:${index}`}
        value={reply.id ?? ""} onChange={(event) => update(index, { id: event.target.value.trim() || undefined })} />
    </label>
    <label className="flex items-center gap-1">
      at most
      <input type="number" min={1} className="text_pole st-input w-16" aria-label={`Reply ${index + 1} max triggers`} placeholder="1"
        value={reply.maxTriggers ?? ""} onChange={(event) => update(index, { maxTriggers: event.target.value ? Math.max(1, Math.round(Number(event.target.value))) : undefined })} />
      <select data-so="npc-reply-once-per" className="text_pole st-input" aria-label={`Reply ${index + 1} once per`} value={reply.once_per ?? "story"}
        onChange={(event) => update(index, { once_per: NPC_REPLY_SCOPES.find((scope) => scope === event.target.value && scope !== "story") })}>
        {NPC_REPLY_SCOPES.map((scope) => <option key={scope} value={scope}>{SCOPE_LABELS[scope]}</option>)}
      </select>
    </label>
    <label className="flex items-center gap-1">
      wait
      <input data-so="npc-reply-cooldown" type="number" min={0} max={TALK_TURNS_CAP} className="text_pole st-input w-16" aria-label={`Reply ${index + 1} cooldown`}
        placeholder={reply.trigger === "onEnter" ? "0" : "2"} value={reply.cooldown_player_turns ?? ""}
        onChange={(event) => update(index, { cooldown_player_turns: event.target.value ? Math.min(TALK_TURNS_CAP, Math.max(0, Math.round(Number(event.target.value)))) : undefined })} />
      player turns between lines
    </label>
  </div>
);

export default NpcReplyScope;
