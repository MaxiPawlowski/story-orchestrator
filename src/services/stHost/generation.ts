import { couldNot, wrote, type WriteResult } from "@utils/writeResult";
import { getContext } from "./context";
import { subscribeToHostEvent } from "./events";
import { groupChatsModule, scriptModule } from "./modules";
import { startVoice } from "./voiceStart";
import { guardStreamToChat, watchChatMove, type GuardedStream, type StreamGuard } from "./streamGuard";

export function isHostGenerating(): boolean {
  return Boolean(scriptModule.isGenerating());
}

export function stopHostGeneration(): WriteResult<{ stopped: boolean }> {
  try {
    return wrote({ stopped: Boolean(scriptModule.stopGeneration()) });
  } catch (error) {
    return couldNot(error instanceof Error ? error.message : "ST could not stop the generation");
  }
}

export function guardHostStream(chatId: string): StreamGuard {
  return guardStreamToChat(chatId, {
    processor: () => (scriptModule.streamingProcessor as GuardedStream | null) ?? null,
    chatId: () => String(scriptModule.getCurrentChatId() ?? ""),
    chat: () => scriptModule.chat,
    onToken: (listener) => subscribeToHostEvent("STREAM_TOKEN_RECEIVED", listener),
    settle: () => scriptModule.activateSendButtons(),
  });
}

const CHAT_MOVE_POLL_MS = 50;

export function watchHostChatMove(chatId: string, onMoved: () => void): () => void {
  return watchChatMove(chatId, {
    chatId: () => String(scriptModule.getCurrentChatId() ?? ""),
    subscribe: (listener) => {
      const target = typeof document === "undefined" ? null : document.getElementById("chat");
      const observer = target && typeof MutationObserver !== "undefined" ? new MutationObserver(listener) : null;
      observer?.observe(target as HTMLElement, { childList: true });
      const timer = setInterval(listener, CHAT_MOVE_POLL_MS);
      return () => {
        observer?.disconnect();
        clearInterval(timer);
      };
    },
  }, onMoved);
}

export const hostSystemUserName: string = scriptModule.systemUserName;

const inputBox = (): HTMLTextAreaElement | null => {
  const box = document.getElementById("send_textarea");
  return box instanceof HTMLTextAreaElement ? box : null;
};

export const readChatInput = (): string | null => inputBox()?.value ?? null;

export const startGroupVoice = (name: string): Promise<WriteResult> => startVoice({
  generating: () => Boolean(scriptModule.isGenerating()),
  draft: readChatInput,
  memberId: (member) => groupChatsModule.findGroupMemberId?.(member),
  lockSend: (locked) => scriptModule.setSendButtonState(locked),
  onWrapperStarted: (listener) => subscribeToHostEvent("GROUP_WRAPPER_STARTED", listener),
  generate: (chid) => scriptModule.Generate("normal", { force_chid: chid }),
}, name);

export function fillChatInput(text: string, expected: string): WriteResult {
  const box = inputBox();
  if (!box) return couldNot("The box where you type is not on the page.");
  if (box.value.trim() && box.value !== expected) return couldNot("You started typing, so the suggestion was not put in.");
  box.value = text;
  box.dispatchEvent(new Event("input", { bubbles: true }));
  box.focus();
  return wrote();
}

const NO_ATTACH_TYPES = ["regenerate", "swipe", "impersonate", "quiet", "continue"];
const NO_TEXTAREA_TYPES = ["regenerate", "swipe", "quiet", "impersonate"];

// Will this Generate() add a player message before its World Info scan? Mirrors
// script.js:4399-4401 (which types read #send_textarea), :4448 (text or a pending attachment, not
// automatic, not quiet, not a dry run) and :4455 (chat completion `send_if_empty`), read at
// GENERATION_STARTED, which fires before the box is read (:4299). The `depth` retry and a bias-only
// message (sent as a system message) are not visible here; both answer false.
export function willAddUserMessage(type: string | undefined, params: Record<string, unknown> | undefined, dryRun: boolean | undefined): boolean {
  if (dryRun || params?.automatic_trigger || type === "quiet") return false;
  const box = NO_TEXTAREA_TYPES.includes(type ?? "") ? null : document.getElementById("send_textarea");
  const text = box instanceof HTMLTextAreaElement ? box.value : "";
  const files = document.getElementById("file_form_input");
  const attachment = files instanceof HTMLInputElement && (files.files?.length ?? 0) > 0 && !NO_ATTACH_TYPES.includes(type ?? "");
  if (text !== "" || attachment) return true;
  const context = getContext();
  return (type === undefined || type === "normal") && context.mainApi === "openai" && Boolean(context.chatCompletionSettings?.send_if_empty?.trim());
}
