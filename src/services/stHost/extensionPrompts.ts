import { getContext } from "./context";

const EXTENSION_PROMPT_IN_CHAT = 1;
const EXTENSION_PROMPT_ROLE_SYSTEM = 0;

type SetExtensionPromptFn = (key: string, value: string, position: number, depth: number, scan?: boolean, role?: number) => void;

const resolveSetExtensionPrompt = (): SetExtensionPromptFn | null => {
  const context = getContext() as unknown as { setExtensionPrompt?: SetExtensionPromptFn };
  if (typeof context.setExtensionPrompt !== "function") {
    console.warn("[Story pacing] host context has no setExtensionPrompt; steering hint suppressed");
    return null;
  }
  return context.setExtensionPrompt.bind(context);
};

export function setStoryExtensionPrompt(key: string, text: string, depth: number) {
  resolveSetExtensionPrompt()?.(key, text, EXTENSION_PROMPT_IN_CHAT, depth, false, EXTENSION_PROMPT_ROLE_SYSTEM);
}

export function clearStoryExtensionPrompt(key: string) {
  resolveSetExtensionPrompt()?.(key, "", EXTENSION_PROMPT_IN_CHAT, 0, false, EXTENSION_PROMPT_ROLE_SYSTEM);
}
