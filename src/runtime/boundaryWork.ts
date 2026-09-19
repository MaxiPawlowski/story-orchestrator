import type { BoundaryResult } from "@engine/index";
import { getChatWindow, planReconciliation, scheduleForcedCues, type ExtractionScheduler } from "@extraction/index";
import type { SceneCoordinator } from "./coordinators/sceneCoordinator";
import type { RuntimeManager } from "./runtimeManager";

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
}

const WORK_ITEMS: BoundaryWorkItem[] = [
  {
    id: "scheduler-tick",
    order: 10,
    run: ({ result, scheduler }) => {
      scheduler.onBoundary(result.boundary, Boolean(result.fired), result.context.lastMessageId);
    },
  },
  {
    // v2.2 plan 06: the judged typed read on every boundary, skipped when this boundary's cadence
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
      const plan = planReconciliation(manager.getStory(), manager.getEngineState(), manager.getExtractionSettings().reconciliationMultiplier);
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
    // v2.2 plan 03: fire-and-forget, never a scheduler job (it would queue behind LLM reads). It
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
      }).catch((error) => console.warn("[Story Orchestrator] scene read failed", error));
    },
  },
  {
    // v2.2 plan 05: fire-and-forget on the judge, never a scheduler job; the warden itself checks
    // that the newest message is a character reply and that it is switched on.
    id: "continuity-warden",
    order: 57,
    run: ({ result, manager }) => {
      void manager.runWardenPass(result.context.lastMessageId).catch((error) => console.warn("[Story Orchestrator] continuity warden failed", error));
    },
  },
  {
    id: "short-term-compaction",
    order: 60,
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
  for (const item of BOUNDARY_WORK) {
    if (item.when && !item.when(context)) continue;
    try {
      item.run(context);
    } catch (error) {
      console.warn(`[Story Orchestrator] boundary work '${item.id}' failed`, error);
    }
  }
}
