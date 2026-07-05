import { tokenizersModule } from "./modules";

export async function countTokens(text: string): Promise<number> {
  const value = text?.trim();
  if (!value) return 0;
  return tokenizersModule.getTokenCountAsync(value);
}

export async function countTokensBatch(texts: string[]): Promise<number> {
  let total = 0;
  for (const text of texts) total += await countTokens(text);
  return total;
}
