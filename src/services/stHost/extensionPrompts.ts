import { getContext } from "./context";
import { couldNot, wrote, type WriteResult } from "@utils/writeResult";

const EXTENSION_PROMPT_IN_CHAT = 1;
const EXTENSION_PROMPT_ROLE_SYSTEM = 0;

type SetExtensionPromptFn = (key: string, value: string, position: number, depth: number, scan?: boolean, role?: number) => void;

const lastWritten = new Map<string, { text: string; depth: number }>();

const resolveSetExtensionPrompt = (): SetExtensionPromptFn | null => {
  const context = getContext() as unknown as { setExtensionPrompt?: SetExtensionPromptFn };
  if (typeof context.setExtensionPrompt !== "function") {
    console.warn("[Story pacing] host context has no setExtensionPrompt; steering hint suppressed");
    return null;
  }
  return context.setExtensionPrompt.bind(context);
};

export function setStoryExtensionPrompt(key: string, text: string, depth: number): WriteResult<{ changed: boolean }> {
  const previous = lastWritten.get(key);
  if (previous && previous.text === text && previous.depth === depth) return wrote({ changed: false });
  const write = resolveSetExtensionPrompt();
  if (!write) return couldNot("this build exposes no setExtensionPrompt, so the block never reaches a prompt");
  write(key, text, EXTENSION_PROMPT_IN_CHAT, depth, false, EXTENSION_PROMPT_ROLE_SYSTEM);
  lastWritten.set(key, { text, depth });
  return wrote({ changed: true });
}

export function clearStoryExtensionPrompt(key: string): WriteResult<{ changed: boolean }> {
  if (!lastWritten.has(key)) return wrote({ changed: false });
  const write = resolveSetExtensionPrompt();
  if (!write) return couldNot("this build exposes no setExtensionPrompt, so the block cannot be cleared");
  write(key, "", EXTENSION_PROMPT_IN_CHAT, 0, false, EXTENSION_PROMPT_ROLE_SYSTEM);
  lastWritten.delete(key);
  return wrote({ changed: true });
}
