export type PromptBucketsRead = { ok: true; counts: Record<string, number>; total: number } | { ok: false; reason: string; notChatCompletion?: true };

interface PromptManagerLike {
  tokenHandler?: { getCounts?: () => unknown } | null;
  tokenUsage?: unknown;
}

const CHAT_COMPLETION_API = "openai";

export function parsePromptBuckets(mainApi: unknown, manager: unknown): PromptBucketsRead {
  if (String(mainApi ?? "").trim().toLowerCase() !== CHAT_COMPLETION_API) {
    return { ok: false, reason: "the main API is not Chat Completion, and ST keeps prompt buckets only there", notChatCompletion: true };
  }
  const promptManager = manager as PromptManagerLike | null;
  if (!promptManager || typeof promptManager !== "object") return { ok: false, reason: "ST has no Chat Completion prompt manager yet" };
  const getCounts = promptManager.tokenHandler?.getCounts;
  if (typeof getCounts !== "function") return { ok: false, reason: "the prompt manager has no token counts" };
  if (typeof promptManager.tokenUsage !== "number" || !Number.isFinite(promptManager.tokenUsage)) return { ok: false, reason: "the prompt manager reports no token total" };
  let raw: unknown;
  try {
    raw = getCounts.call(promptManager.tokenHandler);
  } catch {
    return { ok: false, reason: "the prompt manager's token counts could not be read" };
  }
  if (!raw || typeof raw !== "object") return { ok: false, reason: "the prompt manager's token counts are not a table" };
  const counts = Object.fromEntries(Object.entries(raw as Record<string, unknown>).filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1])));
  return { ok: true, counts, total: promptManager.tokenUsage };
}
