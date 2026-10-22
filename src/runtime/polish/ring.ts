export const POLISH_RING_CAP = 200;

export type PolishVerdict = "accepted" | "refused" | "unchanged" | "error" | "no-route" | "rate-limited" | "written" | "abandoned";

export interface PolishWindowRecord {
  before: string;
  after?: string;
}

export interface PolishRecord {
  messageId: number;
  sendDate: string;
  swipeId: number;
  speaker: string;
  mode: "shadow" | "stand-in";
  at: string;
  verdict: PolishVerdict;
  findings: Array<{ kind: string; phrase: string }>;
  refusals?: string[];
  consumedBy?: string;
  latencyMs?: number;
  route?: string;
  windows?: PolishWindowRecord[];
}
