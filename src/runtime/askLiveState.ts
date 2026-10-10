import { setupFindings } from "./repair";
import type { RuntimeSnapshot } from "./types";

const VALUE_LIMIT = 30;

export const ASK_HOST_COPY = {
  off: "Ask is switched off under Setup.",
  stale: "The chat changed while the answer was being written.",
  failed: "No answer came back. Try again in a moment.",
} as const;

export const liveStateText = (snapshot: RuntimeSnapshot): string => {
  if (!snapshot.ready || !snapshot.storyId) return `No story plays in this chat. Status: ${snapshot.status}`;
  const findings = setupFindings(snapshot);
  const missing = [...snapshot.requirements.missingMembers, ...snapshot.requirements.missingLorebooks, ...snapshot.requirements.missingPersonas];
  const values = Object.entries(snapshot.blackboard).slice(0, VALUE_LIMIT).map(([key, value]) => `${key}=${JSON.stringify(value)}`);
  return [
    `Story: ${snapshot.storyTitle ?? snapshot.storyId} (${snapshot.storyId})`,
    `Checkpoint: ${snapshot.activeCheckpointName ?? "?"} [${snapshot.activeCheckpointId ?? "?"}], objective: ${snapshot.activeObjective ?? "none"}`,
    `Reply count (boundary): ${snapshot.boundary}`,
    `What the story is doing: ${snapshot.pipeline.state}: ${snapshot.pipeline.text}${snapshot.pipeline.detail ? ` (${snapshot.pipeline.detail})` : ""}`,
    `Reading the chat: ${snapshot.extraction.settings.enabled ? "on" : "off"}, memory model ${snapshot.extraction.settings.profileId ? "set" : "not set"}`,
    `Requirements: ${snapshot.requirements.ready ? "ready" : `not ready, missing ${missing.join(", ") || "something"}`}`,
    `Setup findings: ${[...findings.blocks, ...findings.degrades].map((step) => `${step.check} (${step.severity}): ${step.consequence}`).join("; ") || "none"}`,
    `Tension: ${snapshot.tension.level ?? "unknown"}; pending reads waiting for the next reply: ${snapshot.pendingDeltas.length}`,
    `Values: ${values.join(", ") || "none"}`,
    ...(snapshot.lastRollback ? [`Last step back: to ${snapshot.lastRollback.checkpointName}`] : []),
    ...(snapshot.agencyRecovery ? ["The player refused the prepared route twice: the author is owed a move."] : []),
  ].join("\n");
};
