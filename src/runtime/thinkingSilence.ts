import type { MemoryRuntimeSettings } from "./types";

export const SILENT_REPLY_WINDOW = 5;

// A generated reply carries the api that made it (script.js:6680-6749); a /sendas post says "manual"
// (slash-commands.js:5973), and a greeting carries none, so neither can show whether the model thinks.
type ReplyRow = { is_user?: boolean; is_system?: boolean; extra?: { api?: unknown; reasoning?: unknown } } | null | undefined;

const generatedReply = (row: ReplyRow): boolean => Boolean(row)
  && !row?.is_user && !row?.is_system
  && typeof row?.extra?.api === "string" && row.extra.api !== "manual";

const carriesThought = (row: ReplyRow): boolean => typeof row?.extra?.reasoning === "string" && row.extra.reasoning.trim() !== "";

export const harvestWaitsOnThought = (settings: Pick<MemoryRuntimeSettings, "harvestReasoning" | "epistemicLedgerCapable"> | undefined): boolean =>
  settings?.harvestReasoning === true && settings.epistemicLedgerCapable === true;

export function repliesCarryNoThought(rows: readonly unknown[], window = SILENT_REPLY_WINDOW): boolean {
  let seen = 0;
  for (let index = rows.length - 1; index >= 0 && seen < window; index -= 1) {
    const row = rows[index] as ReplyRow;
    if (!generatedReply(row)) continue;
    if (carriesThought(row)) return false;
    seen += 1;
  }
  return seen >= window;
}
