import { getContext } from "./context";
import { saveOpenChat } from "./persistence";
import { couldNot, wrote, type WriteResult } from "@utils/writeResult";
import { isRecord } from "@utils/guards";

export interface SpriteCastMember {
  name: string;
  avatar: string;
  profile: unknown;
  muted: boolean;
}

export interface SpriteChatMessage {
  id: number;
  name: string;
  isUser: boolean;
  isSystem: boolean;
  text: string;
  avatar: string;
  expressions: unknown;
}

export interface SpriteCast {
  chatId: string | null;
  groupId: string | null;
  members: SpriteCastMember[];
}

const headers = () => getContext().getRequestHeaders?.() ?? { "Content-Type": "application/json" };

interface CardLike {
  name?: unknown;
  avatar?: unknown;
  data?: { extensions?: Record<string, unknown> };
}

const cards = (): CardLike[] => {
  const characters = (getContext() as unknown as { characters?: unknown }).characters;
  return Array.isArray(characters) ? characters as CardLike[] : [];
};

const member = (card: CardLike | undefined, muted: boolean): SpriteCastMember | null => {
  if (!card || typeof card.name !== "string" || typeof card.avatar !== "string") return null;
  return { name: card.name, avatar: card.avatar, profile: card.data?.extensions?.so_sprites ?? null, muted };
};

export function spriteCast(): SpriteCast {
  const ctx = getContext();
  const chatId = typeof ctx.chatId === "string" && ctx.chatId ? ctx.chatId : null;
  const groupId = typeof ctx.groupId === "string" && ctx.groupId ? ctx.groupId : null;
  const all = cards();
  if (groupId) {
    const group = ctx.groups.find((entry) => entry.id === groupId);
    if (!group) return { chatId, groupId, members: [] };
    const disabled = new Set(group.disabled_members ?? []);
    const members = group.members.map((avatar) => member(all.find((card) => card.avatar === avatar), disabled.has(avatar)));
    return { chatId, groupId, members: members.filter((entry): entry is SpriteCastMember => entry !== null) };
  }
  const raw = ctx.characterId;
  const index = typeof raw === "number" ? raw : typeof raw === "string" ? Number.parseInt(raw, 10) : Number.NaN;
  const solo = Number.isInteger(index) ? member(all[index], false) : null;
  return { chatId, groupId, members: solo ? [solo] : [] };
}

export function spriteDraftedName(characterId: number | [number]): string | null {
  const index = Array.isArray(characterId) ? characterId[0] : characterId;
  const card = cards()[index];
  return card && typeof card.name === "string" ? card.name : null;
}

export function spriteMessage(id: number): SpriteChatMessage | null {
  const row = getContext().chat[id];
  if (!isRecord(row)) return null;
  return {
    id,
    name: typeof row.name === "string" ? row.name : "",
    isUser: row.is_user === true,
    isSystem: row.is_system === true,
    text: typeof row.mes === "string" ? row.mes : "",
    avatar: typeof row.original_avatar === "string" ? row.original_avatar : "",
    expressions: isRecord(row.extra) ? row.extra.so_expr : undefined,
  };
}

export function spriteStreamingReply(): { id: number; name: string; text: string } | null {
  const message = spriteMessage(getContext().chat.length - 1);
  return message && !message.isUser && !message.isSystem ? { id: message.id, name: message.name, text: message.text } : null;
}

export function spriteChatLength(): number {
  return getContext().chat.length;
}

export async function spriteList(folder: string): Promise<Array<{ label: string; path: string }>> {
  const response = await fetch(`/api/sprites/get?name=${encodeURIComponent(folder)}`, { headers: headers() });
  if (!response.ok) return [];
  const body: unknown = await response.json();
  return Array.isArray(body)
    ? body.filter((entry): entry is { label: string; path: string } => isRecord(entry) && typeof entry.label === "string" && typeof entry.path === "string")
    : [];
}

export async function spriteClassifyLocal(text: string): Promise<Array<{ label: string; score: number }>> {
  const response = await fetch("/api/extra/classify", { method: "POST", headers: headers(), body: JSON.stringify({ text }) });
  if (!response.ok) throw new Error(`Local classifier answered ${response.status}.`);
  const body: unknown = await response.json();
  const rows = isRecord(body) && Array.isArray(body.classification) ? body.classification : [];
  return rows.filter((row): row is { label: string; score: number } => isRecord(row) && typeof row.label === "string" && typeof row.score === "number");
}

export async function spriteWriteExpressions(chatId: string, id: number, reads: unknown, text: string): Promise<WriteResult<{ saved: true }>> {
  const ctx = getContext();
  if (ctx.chatId !== chatId) return couldNot("The chat changed before the expressions were stored.");
  const row = ctx.chat[id];
  if (!isRecord(row)) return couldNot("The message is gone.");
  if (row.mes !== text) return couldNot("The message changed before the expressions were stored.");
  row.extra = { ...(isRecord(row.extra) ? row.extra : {}), so_expr: reads };
  const save = await saveOpenChat("sprite-expressions");
  return save.ok ? wrote({ saved: true }) : couldNot(save.reason);
}

export function spriteVnMode(): boolean {
  return typeof document !== "undefined" && document.body.classList.contains("waifuMode");
}

export function spriteReducedMotion(): boolean {
  const power = (getContext() as unknown as { powerUserSettings?: { reduced_motion?: unknown } }).powerUserSettings;
  return power?.reduced_motion === true;
}

export function spriteBuiltInExpressionsActive(): boolean {
  return typeof document !== "undefined" && document.getElementById("expression-wrapper") !== null;
}

export function spriteHint(text: string): void {
  window.toastr?.info?.(text, "Story Orchestrator");
}

const STRIP_ID = "so-stage-strip";

export function spriteStripHost(): HTMLElement | null {
  const existing = document.getElementById(STRIP_ID);
  if (existing) return existing;
  const sheld = document.getElementById("sheld");
  const chat = document.getElementById("chat");
  if (!sheld || !chat || chat.parentElement !== sheld) return null;
  const strip = document.createElement("div");
  strip.id = STRIP_ID;
  sheld.insertBefore(strip, chat);
  return strip;
}

export function spriteStripRemove(): void {
  document.getElementById(STRIP_ID)?.remove();
}
