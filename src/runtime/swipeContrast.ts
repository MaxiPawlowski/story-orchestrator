export const SWIPE_CONTRAST_LEAD = "The reply below was rejected by the player; write a different reply. Not part of the story:";
export const SWIPE_CONTRAST_CLIP = 600;
export const SWIPE_CONTRAST_CLEARS = ["GENERATE_AFTER_DATA", "MESSAGE_RECEIVED", "GENERATION_STOPPED", "GENERATION_ENDED", "CHAT_CHANGED", "GENERATION_STARTED"] as const;

export type SwipeContrastClear = (typeof SWIPE_CONTRAST_CLEARS)[number];

export function clipRejected(text: string, limit = SWIPE_CONTRAST_CLIP): string {
  const flat = text.replace(/```/g, "'''").trim();
  if (flat.length <= limit) return flat;
  const cut = flat.slice(0, limit);
  const space = cut.lastIndexOf(" ");
  return `${(space > limit / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export function swipeContrastText(rejected: string): string | null {
  const clipped = clipRejected(rejected);
  return clipped ? `${SWIPE_CONTRAST_LEAD}\n\`\`\`\n${clipped}\n\`\`\`` : null;
}

export interface SwipeContrastDeps {
  enabled: () => boolean;
  chatId: () => string | null;
  ownedChat: () => string | null;
  rejected: () => string | null;
  set: (text: string) => { ok: boolean };
  clear: () => void;
}

export const swipeContrast = (deps: SwipeContrastDeps) => {
  let armed = false;
  const clear = () => {
    if (!armed) return;
    armed = false;
    deps.clear();
  };
  const arm = (type: string, withheld: boolean): boolean => {
    clear();
    const chatId = deps.chatId();
    if (type !== "swipe" || withheld || !deps.enabled() || chatId === null || chatId !== deps.ownedChat()) return false;
    const text = swipeContrastText(deps.rejected() ?? "");
    if (!text || !deps.set(text).ok) return false;
    armed = true;
    return true;
  };
  const onEvent = (event: SwipeContrastClear, dryRun?: unknown) => {
    if (event === "GENERATE_AFTER_DATA" && dryRun === true) return;
    clear();
  };
  return { arm, onEvent, armed: () => armed };
};
