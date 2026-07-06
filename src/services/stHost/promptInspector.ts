import { getContext } from "./context";

export interface InjectedPromptBlock {
  key: string;
  depth: number;
  role: number;
  value: string;
}

const STORY_KEY_PREFIX = "story_";

interface RawExtensionPrompt {
  value?: unknown;
  depth?: unknown;
  role?: unknown;
}

export function readInjectedPromptBlocks(): InjectedPromptBlock[] {
  const prompts = (getContext() as unknown as { extensionPrompts?: Record<string, RawExtensionPrompt> }).extensionPrompts ?? {};
  return Object.entries(prompts)
    .filter(([key, entry]) => key.startsWith(STORY_KEY_PREFIX) && typeof entry?.value === "string" && (entry.value as string).trim().length > 0)
    .map(([key, entry]) => ({
      key,
      depth: typeof entry.depth === "number" ? entry.depth : 0,
      role: typeof entry.role === "number" ? entry.role : 0,
      value: entry.value as string,
    }))
    .sort((a, b) => a.depth - b.depth || a.key.localeCompare(b.key));
}
