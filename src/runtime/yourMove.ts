import type { TalkDecisionSource } from "@talk/index";
import type { SourceRevision } from "@memory/audience";
import { isRecord } from "@utils/guards";
import { fnv1a } from "./hash";
import type { TalkDecisionAudit } from "./talkStagecraftTypes";

export interface TurnView {
  yours: boolean;
  source: TalkDecisionSource | null;
}

export const NOT_YOURS: TurnView = { yours: false, source: null };

export const messageRevision = (row: unknown): SourceRevision | null => {
  if (!isRecord(row) || typeof row.mes !== "string") return null;
  return { swipeId: typeof row.swipe_id === "number" && Number.isInteger(row.swipe_id) ? row.swipe_id : null, hash: fnv1a(row.mes) };
};

const sameRevision = (left: SourceRevision | null | undefined, right: SourceRevision | null): boolean =>
  Boolean(left && right && left.hash === right.hash && left.swipeId === right.swipeId);

export interface TurnInputs {
  enabled: boolean;
  generating: boolean;
  chat: readonly unknown[];
  checkpointId: string | null;
  decisions: readonly TalkDecisionAudit[];
}

export function deriveTurn({ enabled, generating, chat, checkpointId, decisions }: TurnInputs): TurnView {
  if (!enabled || generating || !checkpointId) return NOT_YOURS;
  const lastId = chat.length - 1;
  const last = chat[lastId];
  if (!isRecord(last) || last.is_user === true) return NOT_YOURS;
  const latest = [...decisions].reverse().find((decision) => decision.checkpointId === checkpointId);
  if (!latest || latest.kind !== "player" || latest.messageId !== lastId || !sameRevision(latest.revision, messageRevision(last))) return NOT_YOURS;
  return { yours: true, source: latest.source };
}
