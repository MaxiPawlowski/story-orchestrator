import { getContext } from "./context";
import type { HostExtensionPrompt } from "./hostTypes";
import { couldNot, wrote, type WriteResult } from "@utils/writeResult";
import { log } from "@utils/log";
import { isScannableInjectionKey } from "@constants/injectionRegistry";

const EXTENSION_PROMPT_IN_CHAT = 1;
const EXTENSION_PROMPT_ROLE_SYSTEM = 0;

type SetExtensionPromptFn = (key: string, value: string, position: number, depth: number, scan?: boolean, role?: number) => void;

// ST's clearChat reassigns `extension_prompts = {}` on every chat load, a same-chat reload included
// (script.js:1590, 1712), so what this page once wrote is no evidence of what the host holds.
const heldBlock = (key: string): HostExtensionPrompt | null => {
  const prompts = getContext().extensionPrompts;
  const entry = prompts && typeof prompts === "object" ? prompts[key] : undefined;
  return entry && typeof entry === "object" ? entry : null;
};

const holds = (key: string, text: string, depth: number, scan: boolean): boolean => {
  const entry = heldBlock(key);
  return entry !== null
    && entry.value === text
    && Number(entry.depth) === depth
    && Boolean(entry.scan) === scan
    && Number(entry.position) === EXTENSION_PROMPT_IN_CHAT
    && Number(entry.role ?? EXTENSION_PROMPT_ROLE_SYSTEM) === EXTENSION_PROMPT_ROLE_SYSTEM;
};

const holdsText = (key: string): boolean => {
  const entry = heldBlock(key);
  return entry !== null && typeof entry.value === "string" && entry.value !== "";
};

const resolveSetExtensionPrompt = (): SetExtensionPromptFn | null => {
  const context = getContext() as unknown as { setExtensionPrompt?: SetExtensionPromptFn };
  if (typeof context.setExtensionPrompt !== "function") {
    log.warn("pacing: host context has no setExtensionPrompt; steering hint suppressed");
    return null;
  }
  return context.setExtensionPrompt.bind(context);
};

// `scan` adds the block to every World Info scan buffer (script.js:8926-8935, world-info.js:4719-4725); only
// a key the injection registry marks scannable may ever carry it.
export function setStoryExtensionPrompt(key: string, text: string, depth: number, scan = false): WriteResult<{ changed: boolean }> {
  const scanned = scan && isScannableInjectionKey(key);
  if (holds(key, text, depth, scanned)) return wrote({ changed: false });
  const write = resolveSetExtensionPrompt();
  if (!write) return couldNot("this build exposes no setExtensionPrompt, so the block never reaches a prompt");
  write(key, text, EXTENSION_PROMPT_IN_CHAT, depth, scanned, EXTENSION_PROMPT_ROLE_SYSTEM);
  return wrote({ changed: true });
}

export function clearStoryExtensionPrompt(key: string): WriteResult<{ changed: boolean }> {
  if (!holdsText(key)) return wrote({ changed: false });
  const write = resolveSetExtensionPrompt();
  if (!write) return couldNot("this build exposes no setExtensionPrompt, so the block cannot be cleared");
  write(key, "", EXTENSION_PROMPT_IN_CHAT, 0, false, EXTENSION_PROMPT_ROLE_SYSTEM);
  return wrote({ changed: true });
}
