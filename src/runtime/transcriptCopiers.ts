export const TRANSCRIPT_COPIERS: Readonly<Record<string, string>> = { "1_memory": "Summarize", "3_vectors": "Vector Storage" };

export const secretLeaks = (secretsHeld: boolean, foreign: ReadonlyArray<{ key: string }>): string[] =>
  secretsHeld ? [...new Set(foreign.map((block) => TRANSCRIPT_COPIERS[block.key]).filter((name): name is string => Boolean(name)))] : [];
