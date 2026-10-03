export const TRANSCRIPT_COPIERS: Readonly<Record<string, string>> = { "1_memory": "Summarize", "3_vectors": "Vector Storage" };

export const secretLeaks = (groupStory: boolean, foreign: ReadonlyArray<{ key: string }>, switchedOn: readonly string[] = []): string[] =>
  groupStory ? [...new Set([...foreign.map((block) => block.key), ...switchedOn].map((key) => TRANSCRIPT_COPIERS[key]).filter((name): name is string => Boolean(name)))] : [];

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
