import type { BoundaryResult } from "@engine/index";
import { getChatWindow, planReconciliation, scheduleForcedCues, type ExtractionScheduler } from "@extraction/index";
import type { SceneCoordinator } from "./coordinators/sceneCoordinator";
import { sealAtState, storyEnded } from "./chapterPort";
import type { RuntimeManager } from "./runtimeManager";
import { RECONCILIATION_MULTIPLIER } from "./settingsModel";
import { log } from "@utils/log";

export const CONSOLIDATION_CADENCE = 10;

// Everything the runtime does *because* a boundary committed. One entry per behaviour, ordered by
// `order`: adding boundary work means adding an entry here, never editing a fan-out callback
// (finding I6). `when` decides, `run` acts — except where the probe itself is the condition
// (scene detection advances a cursor), which is stated on the entry.
export interface BoundaryWorkContext {
  result: BoundaryResult;
  manager: RuntimeManager;
  scheduler: ExtractionScheduler;
  scene?: SceneCoordinator;
  sceneHeuristicFired?: boolean;
}

export const cueScanStart = (result: BoundaryResult): number =>
  Math.min(result.previousLastMessageId + 1, result.context.lastMessageId);

export interface BoundaryWorkItem {
  id: string;
  order: number;
  when?: (context: BoundaryWorkContext) => boolean;
  run: (context: BoundaryWorkContext) => void;
  /** Still runs after the story's final chapter sealed (the free epilogue). */
  afterEnd?: true;
}

const WORK_ITEMS: BoundaryWorkItem[] = [
  {
    id: "game",
    order: 5,
    afterEnd: true,
    run: ({ result, manager }) => manager.game.onBoundary(result, manager.getLoadedChatId()),
  },
  {
    id: "scheduler-tick",
    order: 10,
    run: ({ result, scheduler }) => {
      scheduler.onBoundary(result.boundary, Boolean(result.fired), result.context.lastMessageId);
    },
  },
  {
    // The judged typed read on every boundary, skipped when this boundary's cadence
    // read already carries the judged step. Fire-and-forget; the manager says whether it ran.
    id: "typed-read",
    order: 15,
    when: ({ result, scheduler }) => !scheduler.cadenceQueuedAt(result.boundary),
    run: ({ result, manager }) => {
      manager.judgedExtraction({ kind: "typed", boundary: result.boundary, messageId: result.context.lastMessageId });
    },
  },
  {
    id: "forced-cues",
    order: 20,
    run: ({ result, manager, scheduler }) => {
      scheduleForcedCues(manager.getStory(), result.activeCheckpointId, scheduler, getChatWindow(cueScanStart(result), result.context.lastMessageId));
    },
  },
  {
    id: "reconciliation",
    order: 30,
    run: ({ manager, scheduler }) => {
      const plan = planReconciliation(manager.getStory(), manager.getEngineState(), RECONCILIATION_MULTIPLIER, getChatWindow);
      if (!plan) return;
      manager.recordReconciliation(plan.descriptor);
      const reread = () => scheduler.schedule({ priority: 0, reason: plan.reason, window: plan.window });
      if (!manager.judgedExtraction({ kind: "stall", plan, reread })) reread();
    },
  },
  {
    id: "expansion",
    order: 40,
    run: ({ manager, scheduler }) => {
      manager.scheduleExpansionForActive((reason, run) => scheduler.schedule({ priority: 3, reason, run }));
    },
  },
  {
    // A chain the critic passed is `validated`, and THIS is the boundary that makes it
    // part of what the chat is playing (`inserted`). Ordered before `scene-detect` so the checkpoint
    // ids the scene pass reads are the ones already in the graph.
    id: "expansion-commit",
    order: 42,
    run: ({ manager }) => {
      void manager.expansions.commitValidated();
    },
  },
  {
    // A boundary that left a chapter (or reached a final ending) seals it off the reply path, before
    // scene-detect so the closing scene belongs to the chapter it ended.
    id: "chapter-seal",
    order: 44,
    run: ({ result, manager, scheduler }) => {
      const target = manager.chapters.due();
      const state = manager.getEngineState();
      if (!target || !state) return;
      const at = sealAtState(state, { boundary: result.boundary, messageId: result.context.lastMessageId, activeCheckpointId: result.activeCheckpointId });
      scheduler.schedule({ priority: 1, reason: `chapter-seal:${target.chapter.id}`, run: async () => { await manager.chapters.seal(target, at); } });
    },
  },
  {
    // The probe is the condition: detectSceneBreak advances the location/cast cursor, so it must
    // run exactly once per boundary.
    id: "scene-detect",
    order: 50,
    run: (context) => {
      const hit = context.manager.detectSceneBreak();
      context.sceneHeuristicFired = Boolean(hit?.hit);
      if (hit?.hit) context.scheduler.schedule({ priority: 0, reason: `scene:${hit.reason}` });
    },
  },
  {
    // Fire-and-forget, never a scheduler job (it would queue behind LLM reads). It
    // runs after scene-detect so a judged break only adds a read the heuristic did not schedule.
    id: "scene-read",
    order: 55,
    when: ({ scene }) => Boolean(scene?.active()),
    run: ({ result, scene, scheduler, sceneHeuristicFired }) => {
      void scene?.run({
        boundary: result.boundary,
        messageId: result.context.lastMessageId,
        heuristicFired: Boolean(sceneHeuristicFired),
        scheduleRead: (reason) => scheduler.schedule({ priority: 0, reason }),
      }).catch((error) => log.warn("scene read failed", error));
    },
  },
  {
    // Fire-and-forget on the judge, never a scheduler job; the warden itself checks
    // that the newest message is a character reply and that it is switched on.
    id: "continuity-warden",
    order: 57,
    run: ({ result, manager }) => {
      void manager.runWardenPass(result.context.lastMessageId).catch((error) => log.warn("continuity warden failed", error));
    },
  },
  {
    id: "inner-beat",
    order: 58,
    when: ({ manager }) => manager.innerBeatDue(),
    run: ({ manager }) => {
      void manager.runInnerBeat().catch((error) => log.warn("inner beat failed", error));
    },
  },
  {
    id: "short-term-compaction",
    order: 60,
    afterEnd: true,
    when: ({ result, manager }) => manager.shouldCompactShortTerm(result.context.lastMessageId),
    run: ({ manager, scheduler }) => {
      scheduler.schedule({ priority: 2, reason: "short-term-compaction", run: async () => { await manager.runShortTermCompaction(); } });
    },
  },
  {
    // Presentation, off-path and coalesced: a checkpoint change is the moment a story's lorebook is
    // most likely to have gone stale (scene breaks queue the same pass from runtime/index.ts).
    id: "stagecraft-curator",
    order: 65,
    when: ({ result, manager }) => Boolean(result.fired) && manager.curatorDueForRun(),
    run: ({ manager, scheduler }) => {
      scheduler.schedule({ priority: 4, reason: "wi-curator:checkpoint", run: async () => { await manager.runWiCuratorPass("checkpoint"); } });
    },
  },
  {
    id: "consolidation",
    order: 70,
    when: ({ result }) => result.boundary > 0 && result.boundary % CONSOLIDATION_CADENCE === 0,
    run: ({ manager, scheduler }) => {
      scheduler.schedule({ priority: 4, reason: "consolidate", run: async () => { await manager.runConsolidation(); } });
    },
  },
];

export const BOUNDARY_WORK = [...WORK_ITEMS].sort((left, right) => left.order - right.order);

export function runBoundaryWork(context: BoundaryWorkContext) {
  const ended = storyEnded(context.manager.chapters?.records());
  for (const item of BOUNDARY_WORK) {
    if ((ended && !item.afterEnd) || (item.when && !item.when(context))) continue;
    try {
      item.run(context);
    } catch (error) {
      log.warn(`boundary work '${item.id}' failed`, error);
    }
  }
}
