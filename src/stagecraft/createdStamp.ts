export interface CreatedStampOwner {
  chatId: string;
  groupId: string | null;
}

const STAMP = /\{\{\/\/\s*so:created\s+([^}|]*?)\s*(?:\|\s*([^}]*?)\s*)?\}\}/gi;

const clean = (value: string) => value.replace(/[{}|\r\n]/g, " ").replace(/\s+/g, " ").trim();

export const createdStamp = (owner: CreatedStampOwner): string => {
  const group = owner.groupId ? clean(owner.groupId) : "";
  return `{{// so:created ${clean(owner.chatId)}${group ? ` | ${group}` : ""}}}`;
};

export function readCreatedStamps(content: string): CreatedStampOwner[] {
  return [...content.matchAll(new RegExp(STAMP.source, "gi"))]
    .map((match) => ({ chatId: clean(match[1] ?? ""), groupId: match[2] ? clean(match[2]) || null : null }))
    .filter((owner) => owner.chatId.length > 0);
}

export const stampedFor = (content: string, chatId: string): CreatedStampOwner | null =>
  readCreatedStamps(content).find((owner) => owner.chatId === clean(chatId)) ?? null;

export const withoutStamps = (content: string): string => content.replace(new RegExp(STAMP.source, "gi"), "").replace(/\n{2,}$/, "\n").trimEnd();

export const stampCreated = (content: string, owner: CreatedStampOwner | null): string =>
  owner && clean(owner.chatId) ? `${content.trimEnd()}\n${createdStamp(owner)}` : content;

export function keepStamps(live: string, next: string): string {
  const stamps = [...live.matchAll(new RegExp(STAMP.source, "gi"))].map((match) => match[0]);
  if (!stamps.length) return next;
  const body = withoutStamps(next);
  return `${body}${body ? "\n" : ""}${stamps.join("\n")}`;
}
