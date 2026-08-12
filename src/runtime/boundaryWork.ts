import type { BoundaryResult } from "@engine/index";
import { getChatWindow, maybeScheduleReconciliation, scheduleForcedCues, type ExtractionScheduler } from "@extraction/index";
import type { RuntimeManager } from "./runtimeManager";

export const CONSOLIDATION_CADENCE = 10;

// Everything the runtime does *because* a boundary committed. One entry per behaviour, ordered by
// `order`: adding boundary work means adding an entry here, never editing a fan-out callback
// (finding I6). `when` decides, `run` acts — except where the probe itself is the condition
// (scene detection advances a cursor), which is stated on the entry.
export interface BoundaryCursor {
  previousLastMessageId: number;
}

export interface BoundaryWorkContext {
  result: BoundaryResult;
  manager: RuntimeManager;
  scheduler: ExtractionScheduler;
  cursor: BoundaryCursor;
}

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
    id: "forced-cues",
    order: 20,
    run: ({ result, manager, scheduler, cursor }) => {
      const from = cursor.previousLastMessageId >= 0 ? cursor.previousLastMessageId + 1 : result.context.lastMessageId;
      scheduleForcedCues(manager.getStory(), result.activeCheckpointId, scheduler, getChatWindow(from, result.context.lastMessageId));
      cursor.previousLastMessageId = result.context.lastMessageId;
    },
  },
  {
    id: "reconciliation",
    order: 30,
    run: ({ manager, scheduler }) => {
      const reconciliation = maybeScheduleReconciliation(manager.getStory(), manager.getEngineState(), manager.getExtractionSettings().reconciliationMultiplier, scheduler);
      if (reconciliation) manager.recordReconciliation(reconciliation);
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
    run: ({ manager, scheduler }) => {
      const hit = manager.detectSceneBreak();
      if (hit?.hit) scheduler.schedule({ priority: 0, reason: `scene:${hit.reason}` });
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
