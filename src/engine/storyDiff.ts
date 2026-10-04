import { keptStagedFrom, type EngineHistory, type EngineState } from "./engine";
import { STORY_DISPLAY_TOGGLES, type NormalizedStoryV2, type PrimitiveValue, type Transition } from "./schema";
import { qualityAccepts } from "./blackboard";
import { gateLeaves } from "./gates";

// What changes when an author edits a story a chat is already playing. The table below is
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
  | "checkpoint-changed"
  | "roster-member-changed"
  | "quality-changed"
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
  | "story-objective-block-changed"
  | "story-display-changed"
  | "story-presence-changed"
  | "story-kind-changed"
  | "scene-read-changed"
  | "player-card-changed"
  | "lore-select-changed"
  | "house-rules-changed"
  | "arc-template-changed"
  | "arc-bridges-changed"
  | "chapters-changed"
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

const changedFields = (before: object, after: object, skip: readonly string[]): string[] => {
  const left = before as Record<string, unknown>;
  const right = after as Record<string, unknown>;
  return [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .filter((key) => !skip.includes(key) && !sameValue(left[key], right[key]))
    .flatMap((key) => (key === "effects" ? changedFields(left.effects ?? {}, right.effects ?? {}, []).map((field) => `effects.${field}`) : [key]));
};

const QUALITY_DIFFED = ["key", "type", "values", "evidence_from", "latching", "source"] as const;

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

interface DiffContext {
  previous: NormalizedStoryV2;
  next: NormalizedStoryV2;
  values: Record<string, PrimitiveValue>;
  latched: Record<string, boolean>;
  visited: string[];
  activeId: string;
  played: boolean;
  entries: StoryDiffEntry[];
  droppedQualityKeys: Set<string>;
  unlatchedQualityKeys: Set<string>;
  droppedVisitedAnchors: string[];
  reanchorTo: string | null;
  push: (kind: StoryDiffEntry["kind"], code: StoryDiffCode, path: string, message: string) => void;
  live: (key: string) => boolean;
  drop: (key: string) => void;
}

const diffContext = (previous: NormalizedStoryV2, next: NormalizedStoryV2, state: EngineState | null): DiffContext => {
  const entries: StoryDiffEntry[] = [];
  const droppedQualityKeys = new Set<string>();
  const values = state?.blackboard.values ?? {};
  return {
    previous,
    next,
    values,
    latched: state?.blackboard.latched ?? {},
    visited: state?.visitedAnchors ?? [],
    activeId: state?.activeCheckpointId ?? previous.startCheckpointId,
    played: Boolean(state && (state.boundary > 0 || state.activeCheckpointId !== previous.startCheckpointId)),
    entries,
    droppedQualityKeys,
    unlatchedQualityKeys: new Set<string>(),
    droppedVisitedAnchors: [],
    reanchorTo: null,
    push: (kind, code, path, message) => { entries.push({ kind, code, path, message }); },
    live: (key) => Object.prototype.hasOwnProperty.call(values, key),
    drop: (key) => { droppedQualityKeys.add(key); },
  };
};

const diffQualities = (ctx: DiffContext) => {
  const { previous, next, push } = ctx;
  Object.values(previous.qualityByKey).forEach((quality) => {
    const after = next.qualityByKey[quality.key];
    const path = `qualities.${quality.key}`;
    if (!after) {
      if (ctx.live(quality.key)) {
        ctx.drop(quality.key);
        push("invalidating", "quality-removed-live", path, `“${quality.key}” is gone from the story, and this chat already holds a value for it.`);
      } else {
        push("compatible", "quality-removed", path, `“${quality.key}” removed (this chat never held a value for it).`);
      }
      return;
    }
    const value = ctx.values[quality.key];
    if (after.type !== quality.type) {
      if (ctx.live(quality.key) && !qualityAccepts(after, value)) {
        ctx.drop(quality.key);
        push("invalidating", "quality-retyped-live", path, `“${quality.key}” changed from ${quality.type} to ${after.type}, and the value this chat holds no longer fits.`);
      } else {
        push("compatible", "quality-retyped", path, `“${quality.key}” changed from ${quality.type} to ${after.type}.`);
      }
    } else if (after.type === "enum" && ctx.live(quality.key) && !qualityAccepts(after, value)) {
      ctx.drop(quality.key);
      push("invalidating", "quality-enum-narrowed-live", path, `“${quality.key}” no longer allows “${String(value)}”, which this chat holds.`);
    }
    if (!sameValue(quality.evidence_from, after.evidence_from)) push(
      "compatible",
      "quality-evidence-changed",
      `${path}.evidence_from`,
      `Which lines can prove “${quality.key}” changed; it applies from the next read, and values already held stay.`,
    );
    const reworded = changedFields(quality, after, QUALITY_DIFFED);
    if (reworded.length) push("compatible", "quality-changed", path, `How “${quality.key}” is read changed (${reworded.join(", ")}); it applies from the next read.`);
    if (!ctx.droppedQualityKeys.has(quality.key) && ctx.live(quality.key)) {
      if (!quality.latching && after.latching) push("compatible", "quality-latch-enabled-live", path, `“${quality.key}” now locks once set; the value this chat holds locks on its next write.`);
      if (quality.latching && !after.latching && ctx.latched[quality.key]) {
        ctx.unlatchedQualityKeys.add(quality.key);
        push("compatible", "quality-latch-disabled-live", path, `“${quality.key}” no longer locks; the lock this chat holds is released.`);
      }
      if (quality.source !== after.source) push("compatible", "quality-source-changed-live", path, `“${quality.key}” is now written by ${after.source} instead of ${quality.source}.`);
    }
  });

  Object.keys(next.qualityByKey).filter((key) => !previous.qualityByKey[key]).forEach((key) => {
    push("compatible", "quality-added", `qualities.${key}`, `New quality “${key}”.`);
  });
};

const diffCheckpoints = (ctx: DiffContext) => {
  const { previous, next, push } = ctx;
  previous.checkpoints.forEach((checkpoint) => {
    if (next.checkpointById[checkpoint.id]) return;
    const path = `checkpoints.${checkpoint.id}`;
    if (checkpoint.id === ctx.activeId) {
      ctx.reanchorTo = next.startCheckpointId;
      push("invalidating", "active-checkpoint-removed", path, `“${checkpoint.name}” is where this chat currently is, and it no longer exists.`);
      return;
    }
    if (ctx.visited.includes(checkpoint.id)) {
      ctx.droppedVisitedAnchors.push(checkpoint.id);
      push("compatible", "checkpoint-removed-visited", path, `“${checkpoint.name}” was visited earlier and is gone; that step drops out of this chat's history.`);
      return;
    }
    push("compatible", "checkpoint-removed", path, `“${checkpoint.name}” removed (never reached here).`);
  });

  previous.checkpoints.forEach((checkpoint) => {
    const after = next.checkpointById[checkpoint.id];
    if (after && !sameValue(checkpoint.agency, after.agency)) push(
      "compatible",
      "checkpoint-agency-changed",
      `checkpoints.${checkpoint.id}.agency`,
      `How “${checkpoint.name}” treats the player's choices changed; it applies from the next turn.`,
    );
  });

  previous.checkpoints.forEach((checkpoint) => {
    const after = next.checkpointById[checkpoint.id];
    const fields = after ? changedFields(checkpoint, after, ["agency"]) : [];
    if (fields.length) push("compatible", "checkpoint-changed", `checkpoints.${checkpoint.id}`, `“${after?.name ?? checkpoint.name}” changed (${fields.join(", ")}); it applies from the next turn.`);
  });

  next.checkpoints.filter((checkpoint) => !previous.checkpointById[checkpoint.id]).forEach((checkpoint) => {
    push("compatible", "checkpoint-added", `checkpoints.${checkpoint.id}`, `New checkpoint “${checkpoint.name}”.`);
  });
};

const diffStart = (ctx: DiffContext) => {
  const { previous, next, push } = ctx;
  if (previous.startCheckpointId !== next.startCheckpointId) {
    if (ctx.played) {
      push(
        "compatible",
        "start-changed",
        "checkpoints",
        `The story now starts at “${next.checkpointById[next.startCheckpointId]?.name ?? next.startCheckpointId}”; this chat is already past the opening.`,
      );
    } else {
      ctx.reanchorTo = ctx.reanchorTo ?? next.startCheckpointId;
      push(
        "invalidating",
        "start-changed-unplayed",
        "checkpoints",
        `The story now opens at “${next.checkpointById[next.startCheckpointId]?.name ?? next.startCheckpointId}”, and this chat has not moved past the old opening yet.`,
      );
    }
  }
};

const diffTransitions = (ctx: DiffContext) => {
  const { previous, next, push } = ctx;
  const previousTransitions = transitionKeys(previous.transitions);
  const nextTransitions = transitionKeys(next.transitions);
  previousTransitions.forEach((transition, key) => {
    const after = nextTransitions.get(key);
    const frontier = transition.from === ctx.activeId;
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
    const lockedKeys = gateLeaves(after.gate).map((leaf) => leaf.q).filter((key) => ctx.latched[key] === true);
    if (lockedKeys.length) {
      lockedKeys.forEach(ctx.drop);
      push("invalidating", "gate-changed-latched", `transitions.${key}.gate`, `The way out of here now depends on ${lockedKeys.join(", ")}, which this chat has already locked in.`);
      return;
    }
    push("compatible", "gate-changed-frontier", `transitions.${key}.gate`, `What it takes to go ${label} changed — the new condition applies from the next turn.`);
  });
  nextTransitions.forEach((transition, key) => {
    if (previousTransitions.has(key)) return;
    push(
      "compatible",
      "transition-added",
      `transitions.${key}`,
      `A new way ${next.checkpointById[transition.from]?.name ?? transition.from} → ${next.checkpointById[transition.to]?.name ?? transition.to}.`,
    );
  });
};

const diffRoster = (ctx: DiffContext) => {
  const { previous, next, push } = ctx;
  const nextRoster = new Set(next.roster.flatMap((member) => [member.id, member.name ?? member.id].map((ref) => ref.trim().toLowerCase())));
  const referenced = rosterRefs(previous);
  previous.roster.forEach((member) => {
    const refs = [member.id, member.name ?? member.id].map((ref) => ref.trim().toLowerCase());
    if (refs.some((ref) => nextRoster.has(ref))) {
      const after = next.roster.find((entry) => entry.id === member.id);
      const fields = after ? changedFields(member, after, []) : [];
      if (fields.length) push("compatible", "roster-member-changed", `roster.${member.id}`, `${after?.name ?? member.id} changed (${fields.join(", ")}).`);
      return;
    }
    const stillDirected = refs.some((ref) => referenced.has(ref));
    push("compatible", "roster-member-removed", `roster.${member.id}`, stillDirected
      ? `${member.name ?? member.id} left the cast but is still named by a checkpoint; direction falls back to the rest of the cast.`
      : `${member.name ?? member.id} left the cast.`);
  });
};

const diffStoryFields = (ctx: DiffContext) => {
  const { previous, next, push } = ctx;
  if (!sameValue(previous.requirements, next.requirements)) push("compatible", "requirements-changed", "requirements", "What the story needs from your setup changed.");
  // Presentation scope only: widening or narrowing the curator's allowlist never invalidates a run.
  if (!sameValue(previous.stagecraft, next.stagecraft)) push("compatible", "stagecraft-changed", "stagecraft", "Which lorebooks the background curator may edit changed.");
  if (previous.display?.lore_names_public !== next.display?.lore_names_public) push("compatible", "story-display-changed", "display", "Whether players see World Info entry names changed.");
  if (STORY_DISPLAY_TOGGLES.some((key) => previous.display?.[key] !== next.display?.[key])) {
    push("compatible", "story-presence-changed", "display", "Which story panels and cards this story shows changed.");
  }
  if ((previous.kind ?? "story") !== (next.kind ?? "story")) push("compatible", "story-kind-changed", "kind", "Whether the story shows as a saga or a single story changed.");
  if (previous.objective_block !== next.objective_block) push("compatible", "story-objective-block-changed", "objective_block", "Whether the objective line is added changed.");
  if (!sameValue(previous.lore_select, next.lore_select)) push("compatible", "lore-select-changed", "lore_select", "What lore-select may judge, or whether it excludes unpicked entries, changed.");
  if (!sameValue(previous.house_rules, next.house_rules)) push("compatible", "house-rules-changed", "house_rules", "What the narrator is held to changed.");
  if (!sameValue(previous.scene_read, next.scene_read)) push("compatible", "scene-read-changed", "scene_read", "The scene tracker's places or times changed.");
  if (!sameValue(previous.player, next.player)) push("compatible", "player-card-changed", "player", "The player’s public character fields changed.");
  if (!sameValue(previous.arc_template, next.arc_template)) push("compatible", "arc-template-changed", "arc_template", "The dramatic shape changed.");
  if (!sameValue(previous.arc_bridges, next.arc_bridges)) push("compatible", "arc-bridges-changed", "arc_bridges", "How resolved threads feed convergence changed.");
  if (!sameValue(previous.chapters, next.chapters) || !sameValue(previous.chapterByCheckpoint, next.chapterByCheckpoint) || !sameValue(previous.memory, next.memory)) {
    push("compatible", "chapters-changed", "chapters", "The story's chapters changed; chapters already sealed keep their records.");
  }
  if (previous.title !== next.title || previous.description !== next.description) push("compatible", "text-changed", "story", "Title or description changed.");
};

export function diffStories(previous: NormalizedStoryV2, next: NormalizedStoryV2, state: EngineState | null): StoryDiffResult {
  const ctx = diffContext(previous, next, state);
  [diffQualities, diffCheckpoints, diffStart, diffTransitions, diffRoster, diffStoryFields].forEach((section) => section(ctx));
  const classification: StoryChangeClass = ctx.entries.some((entry) => entry.kind === "invalidating")
    ? "invalidating"
    : ctx.entries.length ? "compatible" : "identical";

  return {
    classification,
    entries: ctx.entries,
    droppedQualityKeys: [...ctx.droppedQualityKeys],
    unlatchedQualityKeys: [...ctx.unlatchedQualityKeys].filter((key) => !ctx.droppedQualityKeys.has(key)),
    droppedVisitedAnchors: ctx.droppedVisitedAnchors,
    reanchorTo: ctx.reanchorTo,
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
  const visitedPath = state.visitedPath.filter((id) => next.checkpointById[id]);
  return {
    ...state,
    ...keptStagedFrom(state, (ids) => ids.filter((id) => next.checkpointById[id])),
    activeCheckpointId,
    // Re-anchoring starts a new leg: the old checkpoint's turn counters would make the new one
    // look overstayed and trigger a stall re-read on arrival.
    checkpointStartedBoundary: reanchored ? state.boundary : state.checkpointStartedBoundary,
    checkpointStartedMessageId: reanchored ? state.lastMessageId : state.checkpointStartedMessageId,
    visitedAnchors: reanchored && next.checkpointById[activeCheckpointId]?.type === "anchor" && !visitedAnchors.includes(activeCheckpointId)
      ? [...visitedAnchors, activeCheckpointId]
      : visitedAnchors,
    visitedPath: visitedPath.at(-1) !== activeCheckpointId ? [...visitedPath, activeCheckpointId] : visitedPath,
    blackboard: { values: keep(state.blackboard.values), versions: keep(state.blackboard.versions), latched,
      ...(state.blackboard.writerOf ? { writerOf: Object.fromEntries(Object.entries(keep(state.blackboard.writerOf)).filter(([key]) => next.cardFieldByQuality?.[key])) } : {}) },
  };
}

export function pruneEngineHistory(history: EngineHistory | null, next: NormalizedStoryV2, diff: StoryDiffResult): EngineHistory | null {
  if (!history || diff.reanchorTo) return null;
  const prune = (state: EngineState) => pruneEngineState(state, next, diff);
  return { ...history, base: prune(history.base), log: history.log.map((entry) => ({ ...entry, before: prune(entry.before), after: prune(entry.after) })) };
}
