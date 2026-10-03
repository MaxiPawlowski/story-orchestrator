import { getContext } from "./context";
import { groupChatsModule } from "./modules";
import { couldNot, wrote, type WriteResult } from "@utils/writeResult";

// A group chat file starts with a header row carrying `chat_metadata` (group-chats.js:633-640 writes
// `[chatHeader, ...chat]`, :268-273 reads it back), and `/api/chats/group/get` answers the parsed file
// (chats.js:872-881). The group list itself carries no metadata (src/endpoints/groups.js:18-28).
export async function readGroupChatMetadata(chatId: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch("/api/chats/group/get", { method: "POST", headers: getContext().getRequestHeaders?.() ?? {}, body: JSON.stringify({ id: chatId }), cache: "no-cache" });
    if (!response.ok) return null;
    const rows: unknown = await response.json();
    const header = Array.isArray(rows) ? rows[0] : null;
    const metadata = header && typeof header === "object" ? (header as { chat_metadata?: unknown }).chat_metadata : null;
    return metadata && typeof metadata === "object" ? metadata as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export interface HostGroupChats {
  id: string;
  name: string;
  chats: string[];
}

export function listGroupChats(): HostGroupChats[] {
  return (getContext().groups ?? []).flatMap((group) => {
    const id = typeof group.id === "string" || typeof group.id === "number" ? String(group.id) : "";
    if (!id) return [];
    const chats = Array.isArray(group.chats) ? group.chats.filter((chat): chat is string => typeof chat === "string" && chat.length > 0) : [];
    return [{ id, name: typeof group.name === "string" ? group.name : id, chats }];
  });
}

export const isHostGeneratingFlag = (): boolean => typeof document !== "undefined" && document.body?.dataset.generating === "true";

// The welcome screen's own path (welcome-screen.js:506-523): select the group, then the chat. `openGroupChat`
// returns silently for a chat the group does not list (group-chats.js:2195-2201), so that is checked first.
export async function openStoryGroupChat(groupId: string, chatId: string): Promise<WriteResult<{ opened: true }>> {
  const context = getContext();
  const group = (context.groups ?? []).find((entry) => String(entry.id) === groupId);
  if (!group) return couldNot("That group is gone.");
  if (!Array.isArray(group.chats) || !group.chats.includes(chatId)) return couldNot("That chat is no longer in its group.");
  if (isHostGeneratingFlag()) return couldNot("Wait for the reply to finish first.");
  const openById = groupChatsModule.openGroupById;
  if (typeof openById !== "function") return couldNot("This SillyTavern cannot open a group from here.");
  if (String(context.groupId ?? "") !== groupId) await openById(groupId);
  if (String(getContext().chatId ?? "") !== chatId) await context.openGroupChat?.(groupId, chatId);
  return String(getContext().chatId ?? "") === chatId ? wrote({ opened: true }) : couldNot("SillyTavern did not open that chat.");
}
