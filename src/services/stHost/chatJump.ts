import { couldNot, wrote, type WriteResult } from "@utils/writeResult";
import { executeSlashCommands } from "./slashCommands";

// `/chat-jump N` answers '' whether it scrolled or not, so this answers only whether ST took the
// command. The caller decides beforehand whether the jump is possible and never claims it scrolled.
export async function sendChatJump(messageId: number): Promise<WriteResult<{ id: number }>> {
  const id = Math.floor(messageId);
  if (!Number.isFinite(id) || id < 0) return couldNot("no such message");
  return (await executeSlashCommands(`/chat-jump ${id}`)) ? wrote({ id }) : couldNot("SillyTavern did not take the /chat-jump command");
}
