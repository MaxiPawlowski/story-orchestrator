import { getContext } from "./context";

// Which chat file a book was mirrored for, and whether that file still exists. A delete
// event is not the evidence: `deleteGroup` emits GROUP_CHAT_DELETED before it reads `response.ok`
// (group-chats.js:1328-1337), and `deleteGroupChat` splices the id out of `group.chats` before
// its request (:2286), so neither the event nor the client list alone says the file is gone.

export interface ChatOwner {
  chatId: string;
  /** `chat_metadata.integrity`, minted by ST on load (script.js:7665-7667). */
  integrity: string | null;
  groupId: string | null;
  /** The solo character's avatar file: the directory its chats live in (characters.js:1503). */
  avatar: string | null;
}

export type ChatPresence = "present" | "absent" | "unknown";

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

export function currentChatOwner(): ChatOwner | null {
  const context = getContext();
  const chatId = text(context.chatId);
  if (!chatId) return null;
  const groupId = text(context.groupId);
  const character = groupId ? null : context.characters?.[Number(context.characterId)];
  return { chatId, integrity: text(context.chatMetadata?.integrity), groupId, avatar: groupId ? null : text(character?.avatar) };
}

async function post(url: string, body: Record<string, unknown>): Promise<unknown> {
  try {
    const response = await fetch(url, { method: "POST", headers: getContext().getRequestHeaders?.() ?? {}, body: JSON.stringify(body), cache: "no-cache" });
    return response.ok ? await response.json() : undefined;
  } catch {
    return undefined;
  }
}

// `/api/chats/group/info` answers a missing file with `{match:false}` and no `file_name`
// (chats.js:883-898 → getChatInfo's ENOENT branch, :398-410), and an existing one, empty or not,
// with its `file_name`.
async function groupChatPresence(chatId: string, groupId: string): Promise<ChatPresence> {
  const group = getContext().groups?.find((entry) => entry.id === groupId);
  if (group?.chats?.includes(chatId)) return "present";
  const info = await post("/api/chats/group/info", { id: chatId });
  if (!info || typeof info !== "object") return "unknown";
  if (typeof (info as { file_name?: unknown }).file_name === "string") return "present";
  return (info as { match?: unknown }).match === false ? "absent" : "unknown";
}

// `/api/characters/chats` with `simple` lists `{file_name, file_id}` for every `.jsonl` in the
// character's directory, `[]` for an empty one, and `{error: true}` for a missing directory or any
// failure (characters.js:1499-1535), which is "cannot tell", never "gone".
async function soloChatPresence(chatId: string, avatar: string): Promise<ChatPresence> {
  const list = await post("/api/characters/chats", { avatar_url: avatar, simple: true });
  if (!Array.isArray(list)) return "unknown";
  return list.some((entry) => (entry as { file_id?: unknown })?.file_id === chatId) ? "present" : "absent";
}

export async function probeChatFile(owner: Pick<ChatOwner, "chatId" | "groupId" | "avatar">): Promise<ChatPresence> {
  if (owner.groupId) return groupChatPresence(owner.chatId, owner.groupId);
  if (owner.avatar) return soloChatPresence(owner.chatId, owner.avatar);
  return "unknown";
}
