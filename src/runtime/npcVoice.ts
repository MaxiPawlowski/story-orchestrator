import { couldNot, type WriteResult } from "@utils/writeResult";

export const NPC_VOICE_WAIT_MS = 10_000;
export const NPC_VOICE_POLL_MS = 100;
export const NPC_VOICE_BUSY = "another voice held the floor";
export const NPC_VOICE_PLAYER = "the player spoke first";
export const NPC_VOICE_MOVED = "the chat moved on";

export interface NpcVoiceDeps {
  busy(): boolean;
  playerLines(): number;
  live(): boolean;
  start(): Promise<WriteResult>;
  sleep(ms: number): Promise<void>;
  waitMs?: number;
}

export async function startNpcVoice(deps: NpcVoiceDeps): Promise<WriteResult> {
  const players = deps.playerLines();
  const limit = deps.waitMs ?? NPC_VOICE_WAIT_MS;
  for (let waited = 0; deps.busy(); waited += NPC_VOICE_POLL_MS) {
    if (waited >= limit) return couldNot(NPC_VOICE_BUSY);
    await deps.sleep(NPC_VOICE_POLL_MS);
    if (!deps.live()) return couldNot(NPC_VOICE_MOVED);
  }
  if (!deps.live()) return couldNot(NPC_VOICE_MOVED);
  if (deps.playerLines() !== players) return couldNot(NPC_VOICE_PLAYER);
  return deps.start();
}
