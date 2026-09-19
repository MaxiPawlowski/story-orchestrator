import { quoteSlashArg } from "@utils/string";
import { getContext } from "./context";
import { backgroundsModule } from "./modules";
import { executeSlashCommands } from "./slashCommands";

// ST has no background API on the context, so this seam is built from the two things it does
// expose: `background_settings` (backgrounds.js:108, a live export carrying the active global
// background) and `/bg <name>`, which fuzzy-matches the `.bg_example` thumbnails and clicks one
// (slash-commands.js:675 -> setBackgroundCallback at :6203). Clicking is also how a chat-locked
// background gets updated (backgrounds.js:380), so one command covers both cases.
const CHAT_BACKGROUND_KEY = "custom_background";

export interface CurrentBackground {
  name: string;
  locked: boolean;
}

// A locked background is stored as the css url of its path (`url("backgrounds/foo%20bar.jpg")`,
// backgrounds.js:1407) — the filename is what the authored effect names.
const nameFromCssUrl = (value: string): string => {
  const inner = value.replace(/^url\((['"]?)/, "").replace(/(['"]?)\)$/, "");
  const file = inner.split("/").pop() ?? inner;
  try {
    return decodeURIComponent(file);
  } catch {
    return file;
  }
};

export function getCurrentBackground(): CurrentBackground {
  const locked = getContext().chatMetadata?.[CHAT_BACKGROUND_KEY];
  if (typeof locked === "string" && locked.trim()) return { name: nameFromCssUrl(locked.trim()), locked: true };
  return { name: String(backgroundsModule.background_settings?.name ?? "").trim(), locked: false };
}

// The same list `/bg` searches, read from the thumbnails it searches (backgrounds.js:187).
export function listBackgrounds(): string[] {
  return Array.from(document.querySelectorAll(".bg_example"))
    .map((node) => (node.getAttribute("bgfile") ?? "").trim())
    .filter((name) => name.length > 0);
}

export const backgroundExists = (name: string): boolean => {
  const wanted = name.trim().toLowerCase();
  return Boolean(wanted) && listBackgrounds().some((entry) => entry.toLowerCase() === wanted);
};

// Idempotent by contract: an authored name that already matches the active background is a no-op,
// and the resolved name is read back because `/bg` matches partial names.
export async function applyBackground(name: string): Promise<{ changed: boolean; from: string; to: string }> {
  const wanted = name.trim();
  const before = getCurrentBackground();
  if (!wanted || before.name.toLowerCase() === wanted.toLowerCase()) return { changed: false, from: before.name, to: before.name };
  await executeSlashCommands(`/bg ${quoteSlashArg(wanted)}`);
  const after = getCurrentBackground();
  if (after.name === before.name) console.warn("[Story stagecraft] background did not change", { wanted, current: before.name });
  return { changed: after.name !== before.name, from: before.name, to: after.name };
}
