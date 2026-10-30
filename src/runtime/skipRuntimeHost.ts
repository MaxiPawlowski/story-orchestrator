import type { NormalizedStory } from "@engine/index";
import { chatSettle } from "./chatSettle";
import { hostChat, lastMessageId, lastSpeakerName, speakGenerated } from "./npcSpeak";
import { rosterIdForName } from "./roster";
import type { RunOwnership } from "./runToken";
import { runSkip, type SkipOutcome, type SkipRunInput } from "./skipRuntime";
import type { SpeechPort } from "./speechWiring";
import { messageRevision } from "./yourMove";

export interface SkipHost {
  story: NormalizedStory;
  ownership: RunOwnership;
  direct: (member: string, text: string) => (() => void) | null;
  speech: SpeechPort;
  recordCue: (line: { messageId: number; member: string; text: string }) => void;
  journal: (summary: string, note?: string) => void;
  persist: () => void;
}

export const runSkipOnHost = (input: SkipRunInput, host: SkipHost): Promise<SkipOutcome> => runSkip(input, {
  source: () => ({ messageId: lastMessageId(), revision: messageRevision(hostChat().at(-1)) }),
  reserve: (request) => host.speech.reserve(request),
  settle: (reservation, messageId) => host.speech.settle(reservation, messageId),
  speak: (reply) => chatSettle.speak(() => speakGenerated(reply, host.ownership, { direct: host.direct, journal: host.journal })),
  rendered: () => (rosterIdForName(host.story, lastSpeakerName()) === input.teller.rosterId ? lastMessageId() : null),
  recordCue: host.recordCue,
  journal: host.journal,
  persist: host.persist,
});
