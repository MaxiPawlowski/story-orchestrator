import type { EngineState } from "./engine";
import type { GateLeaf, GateNode, NormalizedStoryV2, PrimitiveValue, Quality, Transition } from "./schema";

// Plan 05: what changes when an author edits a story a chat is already playing. The table below is
// the spec — every row is a jest fixture. "Live" always means the running chat actually holds the
// thing the edit touches; the same edit on a fresh chat is compatible by construction.
export type StoryChangeClass = "identical" | "compatible" | "invalidating";

export type StoryDiffCode =
  | "quality-added"
  | "quality-removed"
  | "quality-removed-live"
  | "quality-retyped"
  | "quality-retyped-live"
  | "quality-enum-narrowed-live"
  | "quality-latch-enabled-live"
  | "quality-latch-disabled-live"
  | "quality-source-changed-live"
  | "quality-evidence-changed"
  | "checkpoint-agency-changed"
  | "checkpoint-added"
  | "checkpoint-removed"
  | "checkpoint-removed-visited"
  | "active-checkpoint-removed"
  | "start-changed"
  | "start-changed-unplayed"
  | "transition-added"
  | "transition-removed"
  | "gate-changed"
  | "gate-changed-frontier"
  | "gate-changed-latched"
  | "roster-member-removed"
  | "requirements-changed"
  | "stagecraft-changed"
  | "scene-read-changed"
  | "lore-select-changed"
  | "arc-template-changed"
  | "arc-bridges-changed"
  | "text-changed";

export interface StoryDiffEntry {
  code: StoryDiffCode;
  kind: Exclude<StoryChangeClass, "identical">;
  path: string;
  message: string;
}

export interface StoryDiffResult {
  classification: StoryChangeClass;
  entries: StoryDiffEntry[];
  droppedQualityKeys: string[];
  unlatchedQualityKeys: string[];
  droppedVisitedAnchors: string[];
  reanchorTo: string | null;
}

const gateLeaves = (gate: GateNode, out: GateLeaf[] = []): GateLeaf[] => {
  if ("q" in gate) out.push(gate);
  else if ("all" in gate) gate.all.forEach((entry) => gateLeaves(entry, out));
  else if ("any" in gate) gate.any.forEach((entry) => gateLeaves(entry, out));
  else gateLeaves(gate.not, out);
  return out;
};

// Transitions have no id, so identity is the pair plus its occurrence among identical pairs —
// the same rule the copilot uses to reference one (`transitionRefMatches`).
const transitionKeys = (transitions: Transition[]): Map<string, Transition> => {
  const seen = new Map<string, number>();
  const byKey = new Map<string, Transition>();
  transitions.forEach((transition) => {
    const pair = `${transition.from}->${transition.to}`;
    const occurrence = seen.get(pair) ?? 0;
    seen.set(pair, occurrence + 1);
    byKey.set(`${pair}#${occurrence}`, transition);
  });
  return byKey;
};

const sameValue = (left: unknown, right: unknown) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

const typeAccepts = (quality: Quality, value: PrimitiveValue): boolean => {
  if (quality.type === "bool") return typeof value === "boolean";
  if (quality.type === "string") return typeof value === "string";
  if (quality.type === "enum") return typeof value === "string" && Boolean(quality.values?.includes(value));
  if (quality.type === "float") return typeof value === "number" && Number.isFinite(value);
  return typeof value === "number" && Number.isInteger(value);
};

const rosterRefs = (story: NormalizedStoryV2): Set<string> => {
  const refs = new Set<string>();
  const add = (value: unknown) => { if (typeof value === "string" && value.trim()) refs.add(value.trim().toLowerCase()); };
  story.checkpoints.forEach((checkpoint) => {
    (checkpoint.talk_control?.speakers ?? []).forEach((speaker) => add(speaker.member));
    add(checkpoint.talk_control?.lead);
    (checkpoint.effects?.npc_replies ?? []).forEach((reply) => { add(reply.member); add(reply.after_member); });
    const cast = checkpoint.effects?.cast_changes as { enable?: unknown[]; disable?: unknown[] } | undefined;
    [...(cast?.enable ?? []), ...(cast?.disable ?? [])].forEach(add);
  });
  return refs;
};

export function diffStories(previous: NormalizedStoryV2, next: NormalizedStoryV2, state: EngineState | null): StoryDiffResult {
  const entries: StoryDiffEntry[] = [];
  const droppedQualityKeys = new Set<string>();
  const unlatchedQualityKeys = new Set<string>();
  const droppedVisitedAnchors: string[] = [];
  const values = state?.blackboard.values ?? {};
  const latched = state?.blackboard.latched ?? {};
  const visited = state?.visitedAnchors ?? [];
  const activeId = state?.activeCheckpointId ?? previous.startCheckpointId;
  const played = Boolean(state && (state.boundary > 0 || state.activeCheckpointId !== previous.startCheckpointId));
  let reanchorTo: string | null = null;

  const push = (kind: StoryDiffEntry["kind"], code: StoryDiffCode, path: string, message: string) => entries.push({ kind, code, path, message });
  const live = (key: string) => Object.prototype.hasOwnProperty.call(values, key);
  const drop = (key: string) => { droppedQualityKeys.add(key); };

  Object.values(previous.qualityByKey).forEach((quality) => {
    const after = next.qualityByKey[quality.key];
    const path = `qualities.${quality.key}`;
    if (!after) {
      if (live(quality.key)) {
        drop(quality.key);
        push("invalidating", "quality-removed-live", path, `“${quality.key}” is gone from the story, and this chat already holds a value for it.`);
      } else {
        push("compatible", "quality-removed", path, `“${quality.key}” removed (this chat never held a value for it).`);
      }
      return;
    }
    const value = values[quality.key];
    if (after.type !== quality.type) {
      if (live(quality.key) && !typeAccepts(after, value)) {
        drop(quality.key);
        push("invalidating", "quality-retyped-live", path, `“${quality.key}” changed from ${quality.type} to ${after.type}, and the value this chat holds no longer fits.`);
      } else {
        push("compatible", "quality-retyped", path, `“${quality.key}” changed from ${quality.type} to ${after.type}.`);
      }
    } else if (after.type === "enum" && live(quality.key) && !typeAccepts(after, value)) {
      drop(quality.key);
      push("invalidating", "quality-enum-narrowed-live", path, `“${quality.key}” no longer allows “${String(value)}”, which this chat holds.`);
    }
    if (!sameValue(quality.evidence_from, after.evidence_from)) push("compatible", "quality-evidence-changed", `${path}.evidence_from`, `Which lines can prove “${quality.key}” changed; it applies from the next read, and values already held stay.`);
    if (!droppedQualityKeys.has(quality.key) && live(quality.key)) {
      if (!quality.latching && after.latching) push("compatible", "quality-latch-enabled-live", path, `“${quality.key}” now locks once set; the value this chat holds locks on its next write.`);
      if (quality.latching && !after.latching && latched[quality.key]) {
        unlatchedQualityKeys.add(quality.key);
        push("compatible", "quality-latch-disabled-live", path, `“${quality.key}” no longer locks; the lock this chat holds is released.`);
      }
      if (quality.source !== after.source) push("compatible", "quality-source-changed-live", path, `“${quality.key}” is now written by ${after.source} instead of ${quality.source}.`);
    }
  });

  Object.keys(next.qualityByKey).filter((key) => !previous.qualityByKey[key]).forEach((key) => {
    push("compatible", "quality-added", `qualities.${key}`, `New quality “${key}”.`);
  });

  previous.checkpoints.forEach((checkpoint) => {
    if (next.checkpointById[checkpoint.id]) return;
    const path = `checkpoints.${checkpoint.id}`;
    if (checkpoint.id === activeId) {
      reanchorTo = next.startCheckpointId;
      push("invalidating", "active-checkpoint-removed", path, `“${checkpoint.name}” is where this chat currently is, and it no longer exists.`);
      return;
    }
    if (visited.includes(checkpoint.id)) {
      droppedVisitedAnchors.push(checkpoint.id);
      push("compatible", "checkpoint-removed-visited", path, `“${checkpoint.name}” was visited earlier and is gone; that step drops out of this chat's history.`);
      return;
    }
    push("compatible", "checkpoint-removed", path, `“${checkpoint.name}” removed (never reached here).`);
  });

  previous.checkpoints.forEach((checkpoint) => {
    const after = next.checkpointById[checkpoint.id];
    if (after && !sameValue(checkpoint.agency, after.agency)) push("compatible", "checkpoint-agency-changed", `checkpoints.${checkpoint.id}.agency`, `How “${checkpoint.name}” treats the player's choices changed; it applies from the next turn.`);
  });

  next.checkpoints.filter((checkpoint) => !previous.checkpointById[checkpoint.id]).forEach((checkpoint) => {
    push("compatible", "checkpoint-added", `checkpoints.${checkpoint.id}`, `New checkpoint “${checkpoint.name}”.`);
  });

  if (previous.startCheckpointId !== next.startCheckpointId) {
    if (played) {
      push("compatible", "start-changed", "checkpoints", `The story now starts at “${next.checkpointById[next.startCheckpointId]?.name ?? next.startCheckpointId}”; this chat is already past the opening.`);
    } else {
      reanchorTo = reanchorTo ?? next.startCheckpointId;
      push("invalidating", "start-changed-unplayed", "checkpoints", `The story now opens at “${next.checkpointById[next.startCheckpointId]?.name ?? next.startCheckpointId}”, and this chat has not moved past the old opening yet.`);
    }
  }

  const previousTransitions = transitionKeys(previous.transitions);
  const nextTransitions = transitionKeys(next.transitions);
  previousTransitions.forEach((transition, key) => {
    const after = nextTransitions.get(key);
    const frontier = transition.from === activeId;
    const label = `${previous.checkpointById[transition.from]?.name ?? transition.from} → ${previous.checkpointById[transition.to]?.name ?? transition.to}`;
    if (!after) {
      push("compatible", "transition-removed", `transitions.${key}`, `The way ${label} was removed.`);
      return;
    }
    if (sameValue(transition.gate, after.gate)) return;
    if (!frontier) {
      push("compatible", "gate-changed", `transitions.${key}.gate`, `What it takes to go ${label} changed.`);
      return;
    }
    const lockedKeys = gateLeaves(after.gate).map((leaf) => leaf.q).filter((key) => latched[key] === true);
    if (lockedKeys.length) {
      lockedKeys.forEach(drop);
      push("invalidating", "gate-changed-latched", `transitions.${key}.gate`, `The way out of here now depends on ${lockedKeys.join(", ")}, which this chat has already locked in.`);
      return;
    }
    push("compatible", "gate-changed-frontier", `transitions.${key}.gate`, `What it takes to go ${label} changed — the new condition applies from the next turn.`);
  });
  nextTransitions.forEach((transition, key) => {
    if (previousTransitions.has(key)) return;
    push("compatible", "transition-added", `transitions.${key}`, `A new way ${next.checkpointById[transition.from]?.name ?? transition.from} → ${next.checkpointById[transition.to]?.name ?? transition.to}.`);
  });

  const nextRoster = new Set(next.roster.flatMap((member) => [member.id, member.name ?? member.id].map((ref) => ref.trim().toLowerCase())));
  const referenced = rosterRefs(previous);
  previous.roster.forEach((member) => {
    const refs = [member.id, member.name ?? member.id].map((ref) => ref.trim().toLowerCase());
    if (refs.some((ref) => nextRoster.has(ref))) return;
    const stillDirected = refs.some((ref) => referenced.has(ref));
    push("compatible", "roster-member-removed", `roster.${member.id}`, stillDirected
      ? `${member.name ?? member.id} left the cast but is still named by a checkpoint; direction falls back to the rest of the cast.`
      : `${member.name ?? member.id} left the cast.`);
  });

  if (!sameValue(previous.requirements, next.requirements)) push("compatible", "requirements-changed", "requirements", "What the story needs from your setup changed.");
  // Presentation scope only: widening or narrowing the curator's allowlist never invalidates a run.
  if (!sameValue(previous.stagecraft, next.stagecraft)) push("compatible", "stagecraft-changed", "stagecraft", "Which lorebooks the background curator may edit changed.");
  if (!sameValue(previous.lore_select, next.lore_select)) push("compatible", "lore-select-changed", "lore_select", "Which lorebooks lore-select may judge changed.");
  if (!sameValue(previous.scene_read, next.scene_read)) push("compatible", "scene-read-changed", "scene_read", "The scene tracker's places or times changed.");
  if (!sameValue(previous.arc_template, next.arc_template)) push("compatible", "arc-template-changed", "arc_template", "The dramatic shape changed.");
  if (!sameValue(previous.arc_bridges, next.arc_bridges)) push("compatible", "arc-bridges-changed", "arc_bridges", "How resolved threads feed convergence changed.");
  if (previous.title !== next.title || previous.description !== next.description) push("compatible", "text-changed", "story", "Title or description changed.");

  const classification: StoryChangeClass = entries.some((entry) => entry.kind === "invalidating")
    ? "invalidating"
    : entries.length ? "compatible" : "identical";

  return {
    classification,
    entries,
    droppedQualityKeys: [...droppedQualityKeys],
    unlatchedQualityKeys: [...unlatchedQualityKeys].filter((key) => !droppedQualityKeys.has(key)),
    droppedVisitedAnchors,
    reanchorTo,
  };
}

// "Keep playing" in the invalidation flow: everything the new story can still explain survives,
// everything it cannot is dropped — never a silent orphan sitting in the blackboard.
export function pruneEngineState(state: EngineState, next: NormalizedStoryV2, diff: StoryDiffResult): EngineState {
  const dropped = new Set(diff.droppedQualityKeys);
  const orphaned = Object.keys(state.blackboard.values).filter((key) => !next.qualityByKey[key]);
  orphaned.forEach((key) => dropped.add(key));
  const keep = <T>(record: Record<string, T>): Record<string, T> =>
    Object.fromEntries(Object.entries(record).filter(([key]) => !dropped.has(key)));
  const latched = keep(state.blackboard.latched);
  diff.unlatchedQualityKeys.forEach((key) => { delete latched[key]; });
  Object.keys(latched).forEach((key) => { if (!next.qualityByKey[key]?.latching) delete latched[key]; });
  const activeCheckpointId = next.checkpointById[state.activeCheckpointId] && !diff.reanchorTo
    ? state.activeCheckpointId
    : diff.reanchorTo ?? next.startCheckpointId;
  const reanchored = activeCheckpointId !== state.activeCheckpointId;
  const visitedAnchors = state.visitedAnchors.filter((id) => next.checkpointById[id]?.type === "anchor");
  const visitedPath = state.visitedPath?.filter((id) => next.checkpointById[id]);
  return {
    ...state,
    activeCheckpointId,
    // Re-anchoring starts a new leg: the old checkpoint's turn counters would make the new one
    // look overstayed and trigger a stall re-read on arrival.
    checkpointStartedBoundary: reanchored ? state.boundary : state.checkpointStartedBoundary,
    checkpointStartedMessageId: reanchored ? state.lastMessageId : state.checkpointStartedMessageId,
    visitedAnchors: reanchored && next.checkpointById[activeCheckpointId]?.type === "anchor" && !visitedAnchors.includes(activeCheckpointId)
      ? [...visitedAnchors, activeCheckpointId]
      : visitedAnchors,
    visitedPath: visitedPath && visitedPath.at(-1) !== activeCheckpointId ? [...visitedPath, activeCheckpointId] : visitedPath,
    blackboard: { values: keep(state.blackboard.values), versions: keep(state.blackboard.versions), latched },
  };
}
