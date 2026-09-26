import type { ConflictPair } from "@memory/index";
import type { MemoryCoordinator } from "./coordinators/memoryCoordinator";
import type { DecisionRefusal } from "./memoryQueue";

// v2.3 plan 05. The memory actions the author view drives: the reconciliation queue, locks,
// and reconfirmation. They stay in one object because they are one conversation
// — "is this true?" — and because the manager, which is the façade everything else calls, is held to
// a line budget a dozen one-line delegates would spend for nothing.
export interface MemoryActionDeps {
  getConflicts: () => ConflictPair[];
  resolveMemoryConflict: (key: string, keepId: string, lock: boolean) => Promise<boolean>;
  dismissMemoryConflict: (key: string) => Promise<boolean>;
  setMemoryLocked: (id: string, locked: boolean) => Promise<void>;
  reconfirmMemoryEntry: (id: string) => Promise<boolean>;
  rereadConflictWindow: (key: string) => Promise<boolean>;
  discardQuarantined: (id: string) => Promise<boolean>;
  lastRefusal: () => DecisionRefusal | null;
}

/** The manager's side of the conversation: every action is the coordinator's, one to one. */
export function memoryDelegates(memory: MemoryCoordinator): MemoryActionDeps {
  return {
    getConflicts: () => memory.queue.getConflicts(),
    resolveMemoryConflict: (key, keepId, lock) => memory.queue.resolveMemoryConflict(key, keepId, lock),
    dismissMemoryConflict: (key) => memory.queue.dismissMemoryConflict(key),
    setMemoryLocked: (id, locked) => memory.setMemoryLocked(id, locked),
    reconfirmMemoryEntry: (id) => memory.queue.reconfirmMemoryEntry(id),
    rereadConflictWindow: (key) => memory.queue.rereadConflictWindow(key),
    discardQuarantined: (id) => memory.queue.excludeMemoryEntry(id),
    lastRefusal: () => memory.queue.lastDecisionRefusal(),
  };
}

export function memoryActions(deps: MemoryActionDeps) {
  return {
    getConflicts: () => deps.getConflicts(),
    resolveMemoryConflict: (key: string, keepId: string) => deps.resolveMemoryConflict(key, keepId, false),
    /** Keep this side AND freeze it: one decision, applied in one write (see memoryQueue). */
    lockAsCanon: (key: string, keepId: string) => deps.resolveMemoryConflict(key, keepId, true),
    dismissMemoryConflict: (key: string) => deps.dismissMemoryConflict(key),
    setMemoryLocked: (id: string, locked: boolean) => deps.setMemoryLocked(id, locked),
    reconfirmMemoryEntry: (id: string) => deps.reconfirmMemoryEntry(id),
    rereadConflictWindow: (key: string) => deps.rereadConflictWindow(key),
    /** V8: through the same write-or-put-back as every other decision in this panel. */
    discardQuarantined: (id: string) => deps.discardQuarantined(id),
    lastRefusal: () => deps.lastRefusal(),
  };
}

