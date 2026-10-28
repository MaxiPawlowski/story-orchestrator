import type { NpcReplyEffect, ValidationError } from "../schema";
import { addError } from "./common";

export const npcReplyId = (reply: Pick<NpcReplyEffect, "id" | "trigger" | "member">, index: number): string => reply.id ?? `${reply.trigger}:${reply.member}:${index}`;

export const checkReplyIds = (replies: readonly NpcReplyEffect[], path: string, errors: ValidationError[]) => {
  const seen = new Map<string, number>();
  replies.forEach((reply, index) => {
    const id = npcReplyId(reply, index);
    if (seen.has(id)) addError(errors, `${path}.${index}.id`, `npc reply id "${id}" is already used by reply ${seen.get(id)}`);
    else seen.set(id, index);
  });
};
