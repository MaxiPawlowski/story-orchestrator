import { isWitnessLine, witnessAudit, type WitnessRejection, type WitnessWindowMessage } from "./contract";
import { acceptWitnessRead } from "./record";
import { createWitness } from "./state";
import type { WitnessReadStatus, WitnessRecordState } from "./types";

export interface WitnessRosterMember {
  id: string;
  name: string;
  aliases?: string[];
}

export interface RecordedWitnessRead {
  readId: string;
  from: number;
  to: number;
  status: WitnessReadStatus;
  present?: string[];
  response: string;
}

export const rosterResolver = (roster: readonly WitnessRosterMember[]) => (token: string): string | null => {
  const key = token.trim().toLowerCase();
  return roster.find((member) => [member.id, member.name, ...(member.aliases ?? [])].some((name) => name.toLowerCase() === key))?.id ?? null;
};

export const witnessResponseLines = (response: string): string[] => response.split(/\r?\n/).map((line) => line.trim()).filter(isWitnessLine);

export function replayWitnessReads(
  reads: readonly RecordedWitnessRead[], messages: readonly WitnessWindowMessage[], roster: readonly WitnessRosterMember[], present?: readonly string[],
): { state: WitnessRecordState; rejected: Array<WitnessRejection & { readId: string }> } {
  const resolveMember = rosterResolver(roster);
  const rejected: Array<WitnessRejection & { readId: string }> = [];
  let state = createWitness();
  for (const read of reads) {
    const window = messages.filter((message) => message.messageId >= read.from && message.messageId <= read.to);
    const ctx = { from: read.from, to: read.to, messages: window, present: read.present ?? present ?? roster.map((member) => member.id), resolveMember };
    const { audit, rejected: lines } = witnessAudit(read.status, witnessResponseLines(read.response), ctx);
    lines.forEach((line) => rejected.push({ ...line, readId: read.readId }));
    state = acceptWitnessRead(state, read.readId, audit);
  }
  return { state, rejected };
}
