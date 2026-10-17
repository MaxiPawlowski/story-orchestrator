import { agencyForCheckpoint } from "@engine/index";
import { takeBeat } from "@memory/innerRender";
import { getSteeringHint } from "@pacing/index";
import { InnerCoordinator, type InnerCoordinatorDeps } from "./coordinators/innerCoordinator";
import type { MemoryCoordinator } from "./coordinators/memoryCoordinator";
import type { PacingCoordinator } from "./coordinators/pacingCoordinator";
import type { ManagerPort } from "./managerWiring";
import { spikeSeams } from "./spikeSeams";
import { withoutStaleReasoning } from "./reasoningRevision";
import { activeSpeakerId, enabledCharacterIds, nameForRosterId } from "./roster";

export interface InnerBeatHostDeps extends InnerCoordinatorDeps {
  enabled: () => boolean;
  harvest?: () => boolean;
  personas?: () => string[];
  memberName: (rosterId: string) => string;
}

export interface InnerBeatHost {
  run: () => Promise<number>;
  prepare: (rosterId: string) => Promise<void>;
  beatFor: (rosterId: string) => string;
}

export const INNER_DRAFT_WAIT_MS = 3000;

const within = async (work: Promise<unknown>, ms: number): Promise<void> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([work.catch(() => undefined), new Promise<void>((resolve) => { timer = setTimeout(resolve, ms); })]);
  clearTimeout(timer);
};

const carried = (deps: InnerBeatHostDeps, rosterId: string): string => {
  if (!spikeSeams.carry || deps.harvest?.() !== true) return "";
  const name = deps.memberName(rosterId);
  const rows = withoutStaleReasoning(deps.chatRows());
  const started = deps.getState()?.checkpointStartedMessageId ?? -1;
  const result = spikeSeams.carry({ rosterId, name, rows, players: deps.personas?.() ?? [], from: Math.max(0, started + 1) });
  if (result.line) deps.journal(`Inner thought carried for ${name}`, `from message ${String(result.messageId)}`);
  else if (result.reason !== "off") deps.journal(`No thought to carry for ${name}`, result.reason);
  return result.line;
};

export function createInnerBeatHost(deps: InnerBeatHostDeps): InnerBeatHost {
  const coordinator = new InnerCoordinator(deps);
  return {
    run: () => coordinator.run(),
    prepare: (rosterId) => (deps.enabled() && deps.group() ? within(coordinator.ensureFor(rosterId), INNER_DRAFT_WAIT_MS) : Promise.resolve()),
    beatFor: (rosterId) => (deps.enabled() ? takeBeat(rosterId, {
      beats: deps.getBeats() ?? [], chatId: deps.chatId() ?? "", checkpointId: deps.getState()?.activeCheckpointId ?? null,
      rows: deps.chatRows(), name: deps.memberName(rosterId), journal: deps.journal, setBeats: deps.setBeats,
    }) || carried(deps, rosterId) : ""),
  };
}

export function innerBeatHostFor(port: ManagerPort, memory: MemoryCoordinator, pacing: PacingCoordinator): InnerBeatHost {
  const { view, lifecycle } = port;
  return createInnerBeatHost({
    ...view,
    ...lifecycle,
    enabled: () => port.extras().memory.settings.innerBeat === true,
    harvest: () => port.extras().memory.settings.harvestReasoning === true,
    personas: () => view.getStory()?.requirements?.personas ?? [],
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
