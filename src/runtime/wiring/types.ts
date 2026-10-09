import type { ExtractionScheduler } from "@extraction/index";
import type { SceneCoordinator } from "../coordinators/sceneCoordinator";
import type { LoudGenerationGate } from "../loudGenerationGate";
import type { TalkController } from "../talkControl";
import type { createTypedJudge } from "../typedRead";
import type { DraftedBeat } from "../draftedBeat";

export interface LiveParts {
  scheduler: ExtractionScheduler | null;
  scene: SceneCoordinator | null;
  talk: TalkController | null;
  typedJudge: ReturnType<typeof createTypedJudge> | null;
  loudGate: LoudGenerationGate;
  draftedBeat: DraftedBeat;
}

export type Disposers = Array<() => void>;

export interface RecentMessage {
  speaker: string;
  text: string;
}

export interface WindowAccess {
  chatLastId: () => number;
  recentWindow: () => RecentMessage[];
  recentTurns: () => Array<RecentMessage & { isUser: boolean }>;
}
