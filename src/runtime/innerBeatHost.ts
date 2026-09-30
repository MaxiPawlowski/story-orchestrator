import { beatAnchorId, freshBeat, type InnerBeat } from "@memory/index";
import type { InnerCoordinator, InnerCoordinatorDeps } from "./coordinators/innerCoordinator";

export interface InnerBeatHostDeps extends InnerCoordinatorDeps {
  enabled: () => boolean;
  memberName: (rosterId: string) => string;
}

export interface InnerBeatHost {
  due: () => boolean;
  run: () => Promise<number>;
  beatFor: (rosterId: string) => string;
}

export function createInnerBeatHost(deps: InnerBeatHostDeps): InnerBeatHost {
  let coordinator: Promise<InnerCoordinator> | null = null;
  const load = () => (coordinator ??= import("./coordinators/innerCoordinator").then(({ InnerCoordinator }) => new InnerCoordinator(deps)));
  return {
    due: () => deps.enabled() && Boolean(deps.getStory()),
    run: async () => (await load()).run(),
    beatFor: (rosterId) => {
      if (!deps.enabled()) return "";
      const beats = deps.getBeats() ?? [];
      const anchor = { chatId: deps.chatId() ?? "", checkpointId: deps.getState()?.activeCheckpointId ?? null, basedOn: beatAnchorId(deps.chatRows()) };
      const beat = freshBeat(beats, rosterId, anchor);
      const name = deps.memberName(rosterId);
      if (!beat) {
        const held = beats.some((entry: InnerBeat) => entry.memberId === rosterId && entry.chatId === anchor.chatId);
        deps.journal(held ? `Inner beat stale for ${name}` : `No inner beat for ${name}`, held ? "built on an older reply, another checkpoint or another chat" : undefined);
        return "";
      }
      if (!beat.used) deps.setBeats(beats.map((entry) => (entry === beat ? { ...entry, used: true } : entry)));
      deps.journal(`Inner beat used for ${name}`);
      return beat.beat;
    },
  };
}
