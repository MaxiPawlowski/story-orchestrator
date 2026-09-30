import { agencyForCheckpoint } from "@engine/index";
import { takeBeat } from "@memory/innerRender";
import { getSteeringHint } from "@pacing/index";
import { InnerCoordinator, type InnerCoordinatorDeps } from "./coordinators/innerCoordinator";
import type { MemoryCoordinator } from "./coordinators/memoryCoordinator";
import type { PacingCoordinator } from "./coordinators/pacingCoordinator";
import type { ManagerPort } from "./managerWiring";
import { activeSpeakerId, enabledCharacterIds, nameForRosterId } from "./roster";

export interface InnerBeatHostDeps extends InnerCoordinatorDeps {
  enabled: () => boolean;
  memberName: (rosterId: string) => string;
}

export interface InnerBeatHost {
  run: () => Promise<number>;
  beatFor: (rosterId: string) => string;
}

export function createInnerBeatHost(deps: InnerBeatHostDeps): InnerBeatHost {
  const coordinator = new InnerCoordinator(deps);
  return {
    run: () => coordinator.run(),
    beatFor: (rosterId) => (deps.enabled() ? takeBeat(rosterId, {
      beats: deps.getBeats() ?? [], chatId: deps.chatId() ?? "", checkpointId: deps.getState()?.activeCheckpointId ?? null,
      rows: deps.chatRows(), name: deps.memberName(rosterId), journal: deps.journal, setBeats: deps.setBeats,
    }) : ""),
  };
}

export function innerBeatHostFor(port: ManagerPort, memory: MemoryCoordinator, pacing: PacingCoordinator): InnerBeatHost {
  const { view, lifecycle } = port;
  return createInnerBeatHost({
    ...view,
    ...lifecycle,
    enabled: () => port.extras().memory.settings.innerBeat === true,
    fanOut: () => port.extras().memory.settings.innerFanOut ?? "lead",
    chatId: () => view.hosts.chat.chatId(),
    chatRows: () => view.hosts.chat.chatRows(),
    window: (from, to) => view.hosts.chat.chatWindow(from, to).messages,
    group: () => Boolean(view.hosts.roster.getActiveGroup()),
    enabledIds: () => enabledCharacterIds(view.getStory(), view.hosts.roster),
    lastSpeaker: () => activeSpeakerId(view.getStory(), view.hosts.roster),
    memberName: (rosterId) => nameForRosterId(view.getStory(), rosterId),
    privateRows: (rosterId) => memory.injector.memberPrivateBlock(rosterId),
    steering: () => getSteeringHint(port.extras().tension.smoothed, pacing.expectedTension(), undefined,
      agencyForCheckpoint(view.getStory(), view.getState()?.activeCheckpointId ?? null))?.text ?? "",
    getBeats: () => port.extras().memory.innerBeats,
    setBeats: (next) => { port.extras().memory = { ...port.extras().memory, innerBeats: next }; },
    journal: (summary, note) => port.journal("status", summary, note),
  });
}
