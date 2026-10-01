export interface TalkCandidate {
  rosterId: string;
  name: string;
  weight: number;
  role?: string;
  aliases?: string[];
}

export type TalkDecisionSource = "judge" | "mention" | "director" | "rules" | "fallback";

export interface DirectorWindowMessage {
  speaker: string;
  text: string;
  isUser?: boolean;
}

export interface DirectorPromptInput {
  storyTitle: string;
  checkpointName: string;
  objective: string;
  candidates: TalkCandidate[];
  allowSilence: boolean;
  /** Offer a "hand back to the player" answer — the chain stops and the player speaks next. */
  handBack?: boolean;
  playerName?: string;
  lead?: string;
  sceneWork?: boolean;
  instruction?: string;
  window: DirectorWindowMessage[];
}
