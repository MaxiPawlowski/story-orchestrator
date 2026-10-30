export const TRANSCRIPT_COPIERS: Readonly<Record<string, string>> = { "1_memory": "Summarize", "3_vectors": "Vector Storage" };

const COPIER_PREFIXES: ReadonlyArray<readonly [string, string]> = [["3_vectfox", "VectFox"]];

export const copierName = (key: string): string | undefined => TRANSCRIPT_COPIERS[key] ?? COPIER_PREFIXES.find(([prefix]) => key.startsWith(prefix))?.[1];

export const secretLeaks = (groupStory: boolean, foreign: ReadonlyArray<{ key: string }>, switchedOn: readonly string[] = []): string[] =>
  groupStory ? [...new Set([...foreign.map((block) => block.key), ...switchedOn].map(copierName).filter((name): name is string => Boolean(name)))] : [];

export interface CopierWarningInput {
  playing: boolean;
  groupChat?: boolean;
  secretsHeld?: boolean;
  foreign: ReadonlyArray<{ key: string }>;
  copiersOn?: readonly string[];
}

export const copierWarning = (input: CopierWarningInput): { secretLeaks: string[]; secretsHeld: boolean } => ({
  secretLeaks: secretLeaks(input.playing && Boolean(input.groupChat), input.foreign, input.copiersOn),
  secretsHeld: input.playing && Boolean(input.secretsHeld),
});

let readSwitchedOn: () => string[] = () => [];

export const readCopiersWith = (read: () => string[]): (() => void) => {
  readSwitchedOn = read;
  return () => {
    if (readSwitchedOn === read) readSwitchedOn = () => [];
  };
};

export const switchedOnCopiers = (): string[] => readSwitchedOn();
