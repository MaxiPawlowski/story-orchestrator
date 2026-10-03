export const TRANSCRIPT_COPIERS: Readonly<Record<string, string>> = { "1_memory": "Summarize", "3_vectors": "Vector Storage" };

export const secretLeaks = (secretsHeld: boolean, foreign: ReadonlyArray<{ key: string }>, switchedOn: readonly string[] = []): string[] =>
  secretsHeld ? [...new Set([...foreign.map((block) => block.key), ...switchedOn].map((key) => TRANSCRIPT_COPIERS[key]).filter((name): name is string => Boolean(name)))] : [];

let readSwitchedOn: () => string[] = () => [];

export const readCopiersWith = (read: () => string[]): (() => void) => {
  readSwitchedOn = read;
  return () => {
    if (readSwitchedOn === read) readSwitchedOn = () => [];
  };
};

export const switchedOnCopiers = (): string[] => readSwitchedOn();
