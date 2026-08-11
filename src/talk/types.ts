export interface TalkCandidate {
  rosterId: string;
  name: string;
  weight: number;
}

export type TalkDecisionSource = "mention" | "director" | "rules" | "fallback";

export interface TalkDecision {
  chosenRosterId: string | null;
  chosenName: string | null;
  source: TalkDecisionSource;
  latencyMs?: number;
}

export interface DirectorWindowMessage {
  speaker: string;
  text: string;
}

export interface DirectorPromptInput {
  storyTitle: string;
  checkpointName: string;
  objective: string;
  candidates: TalkCandidate[];
  allowSilence: boolean;
  lead?: string;
  instruction?: string;
  window: DirectorWindowMessage[];
}
