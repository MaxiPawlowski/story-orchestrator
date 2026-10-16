import { readFileSync } from "fs";
import { join } from "path";
import type { SourceSpan } from "../../src/memory/audience";
import { heldSecrets, type HeldSecret } from "../../src/memory/heldSecrets";
import type { EpistemicEntry } from "../../src/memory/types";
import { revisionOf } from "../../src/memory/witness/contract";
import { replayWitnessReads, type RecordedWitnessRead } from "../../src/memory/witness/replay";
import type { WitnessRecordState } from "../../src/memory/witness/types";
import type { RecallCandidate, RecallEligibilityContext, RecallTelling } from "../../src/memory/recall/eligibility";
import type { RecallMessage } from "../../src/memory/recall/live";
import type { RecallFixture } from "../../src/memory/recall/fixture";

export const ROSTER = [{ id: "corvin", name: "Corvin" }, { id: "tamsin", name: "Tamsin" }, { id: "hollis", name: "Hollis" }];
export const PLAYER = "Marlo";
export const CHAT_ID = "chat-kit";

export const message = (messageId: number, speaker: string, text: string, extra: Partial<RecallMessage> = {}): RecallMessage =>
  ({ messageId, speaker, isUser: speaker === PLAYER, text, ...extra });

export function spanIn(chat: readonly RecallMessage[], messageId: number, quote: string, text?: string): SourceSpan {
  const found = chat.find((entry) => entry.messageId === messageId);
  const body = text ?? found?.text ?? "";
  const at = body.indexOf(quote);
  if (at < 0) throw new Error(`quote not in message ${messageId}: ${quote}`);
  return {
    chatId: CHAT_ID, messageId, revision: revisionOf({ messageId, text: body, swipeId: found?.swipeId }),
    speaker: found?.speaker ?? "", isUser: found?.isUser ?? false, span: [at, at + quote.length],
  };
}

export const candidate = (chat: readonly RecallMessage[], messageId: number, quote: string, text?: string): RecallCandidate =>
  ({ source: spanIn(chat, messageId, quote, text), text: quote });

export const read = (readId: string, from: number, to: number, lines: string[], status: RecordedWitnessRead["status"] = "accepted"): RecordedWitnessRead =>
  ({ readId, from, to, status, response: lines.join("\n") });

export const witnessOf = (reads: readonly RecordedWitnessRead[], chat: readonly RecallMessage[]): WitnessRecordState => replayWitnessReads(reads, chat, ROSTER).state;

export const secret = (id: string, subject: string, tag: EpistemicEntry["tag"], content: string, hiddenFrom?: string): EpistemicEntry => ({
  id, subject, tag, content, hiddenFrom, createdAt: 0, provenance: { source: "extractor", messageId: 0, boundary: 0, pass: "fixture", validity: "live" },
});

export const secretsOf = (rows: EpistemicEntry[]): HeldSecret[] => heldSecrets(rows, ROSTER.map((member) => member.name));

export const ctxFor = (memberId: string, chat: readonly RecallMessage[], witness: WitnessRecordState, extra: { tellings?: RecallTelling[]; secrets?: HeldSecret[] } = {}): RecallEligibilityContext => ({
  member: { id: memberId, names: [ROSTER.find((member) => member.id === memberId)?.name ?? memberId] },
  chat, witness, tellings: extra.tellings ?? [], secrets: extra.secrets ?? [],
});

export const syntheticRecallFixture = (): RecallFixture =>
  JSON.parse(readFileSync(join(__dirname, "..", "fixtures", "recall", "synthetic", "fixture.json"), "utf8")) as RecallFixture;
