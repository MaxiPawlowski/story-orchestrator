import { getContext } from "./context";

export async function countTokens(text: string): Promise<number> {
  const value = text?.trim();
  if (!value) return 0;
  const context = getContext() as unknown as { getTokenCountAsync: (str: string, padding?: number) => Promise<number> };
  return context.getTokenCountAsync(value);
}

export async function countTokensBatch(texts: string[]): Promise<number> {
  let total = 0;
  for (const text of texts) total += await countTokens(text);
  return total;
}
