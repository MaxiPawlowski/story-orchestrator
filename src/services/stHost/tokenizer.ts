import { getContext } from "./context";

export async function countTokens(text: string): Promise<number> {
  const value = text?.trim();
  if (!value) return 0;
  const count = getContext().getTokenCountAsync;
  if (typeof count !== "function") throw new Error("this build exposes no getTokenCountAsync");
  return count(value);
}

const TOKENIZER_WARNING_KEY = "tokenizationWarningShown";

const tokenizerFailedBefore = (): boolean => Boolean(globalThis.sessionStorage?.getItem(TOKENIZER_WARNING_KEY));

export function tokenizerIdentity(): string {
  const context = getContext();
  return [context.mainApi ?? "", context.onlineStatus ?? "", context.powerUserSettings?.tokenizer ?? "", tokenizerFailedBefore() ? "failed" : ""].join("|");
}

export async function countTokensBatch(texts: string[]): Promise<number> {
  let total = 0;
  for (const text of texts) total += await countTokens(text);
  return total;
}
