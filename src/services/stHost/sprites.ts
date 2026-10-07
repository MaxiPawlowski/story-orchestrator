import { getContext } from "./context";
import { saveOpenChat } from "./persistence";
import { couldNot, wrote, type WriteResult } from "@utils/writeResult";
import { isRecord } from "@utils/guards";
import { generatedSpriteSets } from "./media";
import { extensionsSharedModule } from "./modules";
import { readReasoningRoute } from "./connectionProfiles";
import { reasoningPayload } from "./reasoningPayload";

export interface SpriteCastMember {
  name: string;
  avatar: string;
  folder: string;
  profile: unknown;
  muted: boolean;
}

export interface SpriteChatMessage {
  id: number;
  name: string;
  isUser: boolean;
  isSystem: boolean;
  text: string;
  swipeId: number;
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

const overrides = (): Array<Record<string, unknown>> => {
  const list = (getContext().extensionSettings as Record<string, unknown>).expressionOverrides;
  return Array.isArray(list) ? list.filter(isRecord) : [];
};

const folderOf = (name: string, avatar: string, profile: unknown): string => {
  if (isRecord(profile) && typeof profile.folder === "string" && profile.folder.trim()) return profile.folder.trim();
  const file = avatar.replace(/\.[^/.]+$/, "");
  const override = overrides().find((entry) => entry.name === file)?.path;
  return typeof override === "string" && override.trim() ? override.trim() : name;
};

const member = (card: CardLike | undefined, muted: boolean): SpriteCastMember | null => {
  if (!card || typeof card.name !== "string" || typeof card.avatar !== "string") return null;
  const profile = card.data?.extensions?.so_sprites ?? null;
  return { name: card.name, avatar: card.avatar, folder: folderOf(card.name, card.avatar, profile), profile, muted };
};

export function spriteCast(): SpriteCast {
  const ctx = getContext();
  const chatId = typeof ctx.chatId === "string" && ctx.chatId ? ctx.chatId : null;
  const groupId = typeof ctx.groupId === "string" && ctx.groupId ? ctx.groupId : null;
  const all = cards();
  const group = groupId ? ctx.groups.find((entry) => entry.id === groupId) : null;
  if (!group) return { chatId, groupId, members: [] };
  const disabled = new Set(group.disabled_members ?? []);
  const members = group.members.map((avatar) => member(all.find((card) => card.avatar === avatar), disabled.has(avatar)));
  return { chatId, groupId, members: members.filter((entry): entry is SpriteCastMember => entry !== null) };
}

export function spriteBuilderMembers(names: string[]): Array<{ name: string; folder: string; image?: string }> {
  const selected = new Set(names.map((name) => name.toLowerCase()));
  return cards().flatMap((card) => {
    if (typeof card.name !== "string" || typeof card.avatar !== "string" || !selected.has(card.name.toLowerCase())) return [];
    const folder = folderOf(card.name, card.avatar, card.data?.extensions?.so_sprites);
    return [{ name: card.name, folder, image: `/characters/${encodeURIComponent(card.avatar)}` }];
  });
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
    swipeId: typeof row.swipe_id === "number" ? row.swipe_id : 0,
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

export async function spriteReferences(folder: string): Promise<Array<{ label: string; path: string }>> {
  const defaults = await spriteList(folder);
  const sets = await generatedSpriteSets(folder).catch(() => []);
  const extra = await Promise.all(sets.filter((set) => !set.set.startsWith("anim-")).map(async (set) =>
    (await spriteList(`${folder}/${set.set}`)).map((file) => ({ label: `${set.set}/${file.label}`, path: file.path }))));
  return [...defaults, ...extra.flat()];
}

export async function spriteClassifyLocal(text: string): Promise<Array<{ label: string; score: number }>> {
  const response = await fetch("/api/extra/classify", { method: "POST", headers: headers(), body: JSON.stringify({ text }) });
  if (!response.ok) throw new Error(`Local classifier answered ${response.status}.`);
  const body: unknown = await response.json();
  const rows = isRecord(body) && Array.isArray(body.classification) ? body.classification : [];
  return rows.filter((row): row is { label: string; score: number } => isRecord(row) && typeof row.label === "string" && typeof row.score === "number");
}

export interface SpriteModelReply {
  text: string;
  thinking: string | null;
}

const replyText = (response: unknown): string => {
  if (typeof response === "string") return response;
  if (isRecord(response) && typeof response.content === "string") return response.content;
  if (isRecord(response) && typeof response.text === "string") return response.text;
  throw new Error("The expression model answered no text.");
};

export async function spriteExpressionModel(profileId: string, messages: Array<{ role: string; content: string }>, maxTokens: number, grammar: string,
  signal: AbortSignal): Promise<SpriteModelReply> {
  const plan = reasoningPayload(readReasoningRoute(profileId), "off");
  const response: unknown = await extensionsSharedModule.ConnectionManagerRequestService.sendRequest(
    profileId, messages, maxTokens, { extractData: true, includePreset: true, includeInstruct: true, stream: false, signal }, { grammar, ...plan.payload },
  );
  return { text: replyText(response), thinking: plan.applied ? plan.sent : plan.unsupported };
}

export async function spriteWriteExpressions(chatId: string, id: number, record: unknown, owner: { text: string; swipeId: number }): Promise<WriteResult<{ saved: true }>> {
  const ctx = getContext();
  if (ctx.chatId !== chatId) return couldNot("The chat changed before the expressions were stored.");
  const row = ctx.chat[id];
  if (!isRecord(row)) return couldNot("The message is gone.");
  if (row.mes !== owner.text) return couldNot("The message changed before the expressions were stored.");
  if ((typeof row.swipe_id === "number" ? row.swipe_id : 0) !== owner.swipeId) return couldNot("Another swipe is showing, so the expressions were not stored.");
  row.extra = { ...(isRecord(row.extra) ? row.extra : {}), so_expr: record };
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

const HIDE_ID = "so-hide-st-expressions";

export function spriteHideBuiltInExpressions(hide: boolean): void {
  if (typeof document === "undefined" || typeof document.getElementById !== "function") return;
  const existing = document.getElementById(HIDE_ID);
  if (!hide) {
    existing?.remove();
    return;
  }
  if (existing) return;
  const style = document.createElement("style");
  style.id = HIDE_ID;
  style.textContent = "#expression-wrapper, #visual-novel-wrapper { display: none !important; }";
  document.head.appendChild(style);
}

const NARROW = "(max-width: 768px)";

export function spriteNarrowViewport(): boolean {
  return typeof matchMedia === "function" && matchMedia(NARROW).matches;
}

export function spriteWatchViewport(listener: () => void): () => void {
  if (typeof matchMedia !== "function") return () => undefined;
  const media = matchMedia(NARROW);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}

export function spriteMembershipKey(cast: SpriteCast = spriteCast()): string {
  return JSON.stringify([cast.chatId, cast.groupId, cast.members.map((entry) => [entry.avatar, entry.folder])]);
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
