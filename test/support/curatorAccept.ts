import type { StagecraftCoordinator } from "../../src/runtime/coordinators/stagecraftCoordinator";
import type { StagecraftRuntimeState } from "../../src/runtime/types";

export function acceptEveryCard(coordinator: StagecraftCoordinator, read: () => StagecraftRuntimeState, write: (next: StagecraftRuntimeState) => void) {
  const pass = coordinator.runCuratorPass.bind(coordinator);
  coordinator.runCuratorPass = async (...args) => {
    const outcome = await pass(...args);
    if (!outcome.record) return outcome;
    const accepted = { ...outcome.record, ops: outcome.record.ops.map((entry) => (entry.status === "pending" ? { ...entry, status: "accepted" as const } : entry)) };
    const state = read();
    write({ ...state, proposals: state.proposals.map((record) => (record.id === accepted.id ? accepted : record)) });
    return { ...outcome, record: accepted };
  };
}
