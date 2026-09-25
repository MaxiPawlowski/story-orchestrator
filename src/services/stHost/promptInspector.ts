import { getContext } from "./context";
import type { HostExtensionPrompt } from "./hostTypes";

export interface InjectedPromptBlock {
  key: string;
  depth: number;
  role: number;
  value: string;
}

export interface ExtensionPromptBlock extends InjectedPromptBlock {
  position: number;
  hasFilter: boolean;
}

export interface ExtensionPromptBlocks {
  own: ExtensionPromptBlock[];
  foreign: ExtensionPromptBlock[];
}

const STORY_KEY_PREFIX = "story_";

const hostPrompts = (): Array<[string, HostExtensionPrompt]> =>
  Object.entries(getContext().extensionPrompts ?? {}).filter((entry): entry is [string, HostExtensionPrompt] => Boolean(entry[1]) && typeof entry[1] === "object");

const hasText = (entry: HostExtensionPrompt): entry is HostExtensionPrompt & { value: string } => typeof entry.value === "string" && entry.value.trim().length > 0;

const numberOr = (value: unknown, fallback: number): number => (typeof value === "number" ? value : fallback);

const byAssembly = (a: InjectedPromptBlock, b: InjectedPromptBlock) => a.depth - b.depth || a.key.localeCompare(b.key);

export function readInjectedPromptBlocks(): InjectedPromptBlock[] {
  return hostPrompts()
    .filter(([key, entry]) => key.startsWith(STORY_KEY_PREFIX) && hasText(entry))
    .map(([key, entry]) => ({ key, depth: numberOr(entry.depth, 0), role: numberOr(entry.role, 0), value: entry.value as string }))
    .sort(byAssembly);
}

export function readExtensionPromptBlocks(): ExtensionPromptBlocks {
  const blocks = hostPrompts()
    .filter(([, entry]) => hasText(entry))
    .map(([key, entry]): ExtensionPromptBlock => ({
      key,
      depth: numberOr(entry.depth, 0),
      role: numberOr(entry.role, 0),
      value: entry.value as string,
      position: Number.isFinite(Number(entry.position)) ? Number(entry.position) : 0,
      hasFilter: typeof entry.filter === "function",
    }))
    .sort(byAssembly);
  return { own: blocks.filter((block) => block.key.startsWith(STORY_KEY_PREFIX)), foreign: blocks.filter((block) => !block.key.startsWith(STORY_KEY_PREFIX)) };
}
