export interface RepairedReply {
  mes: string;
  reasoning: string;
}

export function repairThoughtLeak(mes: string, reasoning: string, suffix: string): RepairedReply | null {
  const tag = suffix.trim();
  if (!tag || !reasoning.trim()) return null;
  const at = mes.indexOf(tag);
  if (at < 0) return null;
  const reply = mes.slice(at + tag.length).split(tag).join("").trimStart();
  if (!reply.trim()) return null;
  return { mes: reply, reasoning: `${reasoning}${mes.slice(0, at).trimEnd()}` };
}
