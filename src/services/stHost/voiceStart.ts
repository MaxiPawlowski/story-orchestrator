import { couldNot, wrote, type WriteResult } from "@utils/writeResult";

export interface VoiceStartDeps {
  generating: () => boolean;
  draft: () => string | null;
  memberId: (name: string) => number | undefined;
  lockSend: (locked: boolean) => void;
  onWrapperStarted: (listener: () => void) => () => void;
  generate: (chid: number) => Promise<unknown>;
}

export const VOICE_BUSY = "a reply is already being written";
export const VOICE_DRAFT = "the player is typing";

export async function startVoice(deps: VoiceStartDeps, name: string): Promise<WriteResult> {
  if (deps.generating()) return couldNot(VOICE_BUSY);
  if (deps.draft()?.trim()) return couldNot(VOICE_DRAFT);
  const chid = deps.memberId(name);
  if (typeof chid !== "number" || !Number.isInteger(chid) || chid < 0) return couldNot(`${name} is not a member of this group`);
  let opened = false;
  const stop = deps.onWrapperStarted(() => { opened = true; });
  deps.lockSend(true);
  try {
    await deps.generate(chid);
    return opened ? wrote() : couldNot(`${name}'s reply did not start`);
  } catch {
    return couldNot(`${name}'s reply could not start`);
  } finally {
    stop();
    if (!opened) deps.lockSend(false);
  }
}
