import type { TalkPacing, VoicePlan } from "./talkPacing";

export type TalkPacingApi = Pick<TalkPacing, "plain" | "reaction" | "spotlight" | "firstSpotlight" | "address" | "reserve" | "arm" | "settle" | "yielded" | "leadPreferred">;

const plain = (chosen: { rosterId: string; name: string }): VoicePlan => ({ rosterId: chosen.rosterId, name: chosen.name, origin: "chain", direction: null, yieldAfter: false, source: null });

export const IDLE_PACING: TalkPacingApi = {
  plain,
  reaction: () => null,
  spotlight: (chosen) => plain(chosen),
  firstSpotlight: (chosen) => plain(chosen),
  address: (plan) => plan,
  reserve: () => ({ reservation: null, refused: false }),
  arm: () => null,
  settle: () => undefined,
  yielded: () => false,
  leadPreferred: () => true,
};
