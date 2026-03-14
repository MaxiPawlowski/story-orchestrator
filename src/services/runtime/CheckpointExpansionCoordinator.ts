import {
  getNormalizedStubCheckpointName,
  isNormalizedStubCheckpoint,
  type NormalizedStory,
  type NormalizedTransition,
} from "@utils/story-validator";
import { StoryGeneratorService, type CheckpointSummary, type ExpansionResult } from "@services/StoryGeneratorService";
import { storySessionStore } from "@store/storySessionStore";

interface CheckpointExpansionCoordinatorOptions {
  story: NormalizedStory;
  generatorService: StoryGeneratorService;
  buildPastCheckpoints: () => CheckpointSummary[];
  getRoadmap: () => string;
}

export class CheckpointExpansionCoordinator {
  private readonly story: NormalizedStory;
  private readonly generatorService: StoryGeneratorService;
  private readonly buildPastCheckpoints: () => CheckpointSummary[];
  private readonly getRoadmap: () => string;
  private onMergeExpansion?: (result: ExpansionResult, fromCheckpointId: string) => Promise<void>;
  private expandingStubId: string | null = null;

  constructor(options: CheckpointExpansionCoordinatorOptions) {
    this.story = options.story;
    this.generatorService = options.generatorService;
    this.buildPastCheckpoints = options.buildPastCheckpoints;
    this.getRoadmap = options.getRoadmap;
  }

  setMergeCallback(cb?: (result: ExpansionResult, fromCheckpointId: string) => Promise<void>) {
    this.onMergeExpansion = cb;
  }

  reset() {
    this.expandingStubId = null;
    this.onMergeExpansion = undefined;
  }

  isExpanding(checkpointId: string | null | undefined): boolean {
    return !!checkpointId && this.expandingStubId === checkpointId;
  }

  async expandStub(stubIndex: number, transitionTaken?: NormalizedTransition): Promise<boolean> {
    const checkpoint = this.story.checkpoints[stubIndex];
    if (!checkpoint || !isNormalizedStubCheckpoint(checkpoint)) return false;
    if (this.expandingStubId === checkpoint.id) return false;
    this.expandingStubId = checkpoint.id;

    storySessionStore.getState().setExpansion({ isExpanding: true, phase: "roadmap", phaseDone: {}, preview: null });

    try {
      const existingCheckpointIds = this.story.checkpoints.map((cp) => cp.id);
      const existingTransitionIds = this.story.transitions.map((transition) => transition.id);
      const roadmap = this.getRoadmap() || this.story.expansion?.roadmap || "";
      const premise = this.story.expansion?.premise?.trim() || "";
      const hasPremise = premise.length > 0;
      if (!hasPremise) {
        console.warn("[StoryOrch] expanding stub without a stored premise - falling back to stub objective; story may lack context");
      }
      const transitionLabel = transitionTaken?.label ?? transitionTaken?.id ?? "proceed";
      const transitionCondition = transitionTaken?.trigger.type === "regex"
        ? transitionTaken.trigger.condition ?? ""
        : `After ${transitionTaken?.trigger.withinTurns} turns`;

      const result = await this.generatorService.expandCheckpoint(
        {
          premise: hasPremise ? premise : checkpoint.objective,
          roadmap,
          transitionLabel,
          transitionCondition,
          targetCheckpointId: checkpoint.id,
          targetCheckpointName: getNormalizedStubCheckpointName(checkpoint) ?? checkpoint.name,
          pastCheckpoints: this.buildPastCheckpoints(),
          characters: StoryGeneratorService.buildCharacterSummaries(),
          worldInfo: StoryGeneratorService.buildWorldInfoSummaries(),
          existingCheckpointIds,
          existingTransitionIds,
        },
        (update) => {
          const current = storySessionStore.getState().expansion;
          storySessionStore.getState().setExpansion({
            phase: update.phase,
            phaseDone: { ...current.phaseDone, ...(update.done ? { [update.phase]: true } : {}) },
            ...(update.checkpointName ? {
              preview: {
                checkpointName: update.checkpointName,
                checkpointObjective: update.checkpointObjective ?? "",
                transitionCount: update.transitionCount ?? 0,
              },
            } : {}),
          });
        },
      );

      await this.onMergeExpansion?.(result, checkpoint.id);
      return true;
    } catch (err) {
      console.warn("[StoryOrch] stub expansion failed", err);
      return false;
    } finally {
      this.expandingStubId = null;
      storySessionStore.getState().resetExpansion();
    }
  }
}
