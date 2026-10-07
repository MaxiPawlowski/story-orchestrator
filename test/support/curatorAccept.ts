import type { StagecraftCoordinator } from "../../src/runtime/coordinators/stagecraftCoordinator";

export async function authorAcceptsPending(coordinator: StagecraftCoordinator) {
  for (const record of coordinator.getProposals()) {
    if (record.ops.some((entry) => entry.status === "pending")) await coordinator.decideProposal(record.id, "accepted");
  }
}
