import { keptStagedFrom, type EngineHistory, type EngineState } from "./engine";
import {
  CODEX_PAGES, observationIdentity, observationKey, observationMissedKey, codexArmedKey, codexEntryKey, codexFactKey, codexReturnKey, isCodexKey, isObservationKey,
  factionMoveKey, questClosedKey, questRewardKey, STORY_DISPLAY_TOGGLES,
  type CodexEntry, type CodexPage, type NormalizedStory, type PrimitiveValue, type TalkControl, type Transition,
} from "./schema";
import { qualityAccepts } from "./blackboard";
import { gateLeaves } from "./gates";
import { gameLayer } from "./validate/gameLayer";

// What changes when an author edits a story a chat is already playing. The table below is
// the spec — every row is a jest fixture. "Live" always means the running chat actually holds the
// thing the edit touches; the same edit on a fresh chat is compatible by construction.
export type StoryChangeClass = "identical" | "compatible" | "invalidating";

export type StoryDiffCode =
  | "quality-added" | "quality-removed" | "quality-removed-live" | "quality-retyped" | "quality-retyped-live"
  | "quality-enum-narrowed-live" | "quality-latch-enabled-live" | "quality-latch-disabled-live"
  | "quality-source-changed-live" | "quality-evidence-changed" | "checkpoint-agency-changed" | "checkpoint-changed"
  | "roster-member-changed" | "quality-changed" | "checkpoint-added" | "checkpoint-removed"
  | "checkpoint-removed-visited" | "active-checkpoint-removed" | "start-changed" | "start-changed-unplayed"
  | "transition-added" | "transition-removed" | "gate-changed" | "gate-changed-frontier" | "gate-changed-latched"
  | "roster-member-removed" | "requirements-changed" | "stagecraft-changed" | "features-changed"
  | "story-objective-block-changed" | "story-display-changed" | "story-presence-changed" | "story-kind-changed"
  | "scene-read-changed" | "player-card-changed" | "player-profile-changed" | "lore-select-changed"
  | "house-rules-changed" | "talk-defaults-changed" | "arc-template-changed" | "arc-bridges-changed" | "chapters-changed" | "game-changed"
  | "quest-removed" | "quest-removed-closed" | "quest-reward-changed-earned" | "check-changed" | "codex-changed"
  | "factions-changed" | "faction-move-changed-applied"
  | "codex-entry-removed" | "codex-entry-replaced" | "codex-fact-removed" | "codex-fact-replaced"
  | "codex-fact-edited" | "codex-return-removed" | "codex-return-replaced" | "codex-return-edited"
  | "observations-changed" | "observation-removed" | "cue-edited" | "cue-replaced" | "cue-removed"
  | "observation-replaced" | "observation-edited" | "text-changed";

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

const talkPacingMembers = (control: TalkControl | undefined): string[] => [
  ...(control?.spotlight ? control.spotlight.members ?? [] : []),
  ...(control?.reaction ? control.reaction.members ?? [] : []),
  ...(control?.address_player && Array.isArray(control.address_player.by) ? control.address_player.by : []),
];

const rosterRefs = (story: NormalizedStory): Set<string> => {
  const refs = new Set<string>();
  const add = (value: unknown) => { if (typeof value === "string" && value.trim()) refs.add(value.trim().toLowerCase()); };
  story.checkpoints.forEach((checkpoint) => {
    (checkpoint.talk_control?.speakers ?? []).forEach((speaker) => add(speaker.member));
    add(checkpoint.talk_control?.lead);
    talkPacingMembers(checkpoint.talk_control).forEach(add);
    (checkpoint.effects?.npc_replies ?? []).forEach((reply) => { add(reply.member); add(reply.after_member); });
    const cast = checkpoint.effects?.cast_changes as { enable?: unknown[]; disable?: unknown[] } | undefined;
    [...(cast?.enable ?? []), ...(cast?.disable ?? [])].forEach(add);
  });
  return refs;
};

interface DiffContext {
  previous: NormalizedStory;
  next: NormalizedStory;
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

const diffContext = (previous: NormalizedStory, next: NormalizedStory, state: EngineState | null): DiffContext => {
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
  Object.values(previous.qualityByKey).filter((quality) => !isCodexKey(quality.key) && !isObservationKey(quality.key)).forEach((quality) => {
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

  Object.keys(next.qualityByKey).filter((key) => !previous.qualityByKey[key] && !isCodexKey(key) && !isObservationKey(key)).forEach((key) => {
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
    if (!sameValue(transition.check, after.check)) push("compatible", "check-changed", `transitions.${key}.check`, `The check on ${label} changed.`);
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

const diffQuests = ({ previous, next, values, push }: DiffContext) => {
  const after = new Map((next.quests ?? []).map((quest) => [quest.id, quest]));
  for (const quest of previous.quests ?? []) {
    const kept = after.get(quest.id);
    const closed = values[questClosedKey(quest.id)];
    if (!kept) {
      const verb = closed === "done" ? "finished" : "failed";
      if (typeof closed === "string") push("invalidating", "quest-removed-closed", `quests.${quest.id}`, `“${quest.title}” is gone from the story, and this chat already ${verb} it.`);
      else push("compatible", "quest-removed", `quests.${quest.id}`, `“${quest.title}” left the story; this chat stops tracking it.`);
      continue;
    }
    if (values[questRewardKey(quest.id)] === true && !sameValue(quest.reward, kept.reward)) {
      push("compatible", "quest-reward-changed-earned", `quests.${quest.id}.reward`, `The reward for “${quest.title}” changed; this chat already received the old one and is not given the new one.`);
    }
  }
};

const diffFactions = (ctx: DiffContext) => {
  const { previous, next } = ctx;
  if (sameValue(previous.factions, next.factions)) return;
  const before = ctx.entries.length;
  const after = new Map((next.factions ?? []).map((faction) => [faction.id, faction]));
  (previous.factions ?? []).forEach((faction) => {
    const moves = new Map((after.get(faction.id)?.moves ?? []).map((move) => [move.id, move]));
    faction.moves.forEach((move) => {
      const kept = moves.get(move.id);
      if (!kept || !ctx.live(factionMoveKey(faction.id, move.id)) || sameValue([move.when, move.add], [kept.when, kept.add])) return;
      ctx.push("compatible", "faction-move-changed-applied", `factions.${faction.id}.moves.${move.id}`,
        `A standing change with “${faction.name}” was rewritten; this chat already had the old one and is not given the new one.`);
    });
  });
  if (ctx.entries.length === before) ctx.push("compatible", "factions-changed", "factions", "The story's factions changed; the standing this chat already holds stays.");
};

const conditionOf = (entry: CodexEntry) => entry.known_when ?? (entry.location ? { location: entry.location } : null);

const dropLive = (ctx: DiffContext, key: string): boolean => {
  if (!ctx.live(key)) return false;
  ctx.drop(key);
  return true;
};

const diffReturns = (ctx: DiffContext, path: string, label: string, entry: CodexEntry, kept: CodexEntry) => {
  const after = new Map((kept.returns ?? []).map((back) => [back.id, back]));
  (entry.returns ?? []).forEach((back) => {
    const next = after.get(back.id);
    if (next && (back.rev ?? 1) === (next.rev ?? 1) && sameValue(back.when, next.when)) {
      if (back.text !== next.text) ctx.push("compatible", "codex-return-edited", `${path}.returns.${back.id}`, `A return line at “${label}” was reworded; a chat that shows it sees the new wording.`);
      return;
    }
    const earned = [codexArmedKey(entry.id, back.id), codexReturnKey(entry.id, back.id)].map((key) => dropLive(ctx, key)).some(Boolean);
    ctx.push("compatible", next ? "codex-return-replaced" : "codex-return-removed", `${path}.returns.${back.id}`, next
      ? `A return line at “${label}” changed; ${earned ? "this chat must come back for it again" : "it shows on a later return"}.` : `A return line at “${label}” was removed.`);
  });
};

const diffCodexEntry = (ctx: DiffContext, page: CodexPage, entry: CodexEntry, kept: CodexEntry | undefined) => {
  const path = `codex.${page}.${entry.id}`;
  const label = entry.name ?? entry.member ?? entry.id;
  if (!kept) {
    const returns = (entry.returns ?? []).flatMap((back) => [codexArmedKey(entry.id, back.id), codexReturnKey(entry.id, back.id)]);
    const dropped = [codexEntryKey(page, entry.id), ...entry.facts.map((fact) => codexFactKey(page, entry.id, fact.id)), ...returns].filter((key) => dropLive(ctx, key));
    ctx.push("compatible", "codex-entry-removed", path, dropped.length ? `“${label}” left the codex; what this chat learned about it is dropped.` : `“${label}” left the codex.`);
    return;
  }
  if (!sameValue(conditionOf(entry), conditionOf(kept)) && dropLive(ctx, codexEntryKey(page, entry.id))) {
    ctx.push("compatible", "codex-entry-replaced", path, `When the player learns of “${label}” changed; this chat must learn of it again.`);
  }
  const facts = new Map(kept.facts.map((fact) => [fact.id, fact]));
  entry.facts.forEach((fact) => {
    const after = facts.get(fact.id);
    const key = codexFactKey(page, entry.id, fact.id);
    if (!after) {
      dropLive(ctx, key);
      ctx.push("compatible", "codex-fact-removed", `${path}.${fact.id}`, `A fact about “${label}” was removed.`);
    } else if ((fact.rev ?? 1) !== (after.rev ?? 1) || !sameValue(fact.known_when, after.known_when)) {
      const earned = dropLive(ctx, key);
      ctx.push("compatible", "codex-fact-replaced", `${path}.${fact.id}`, earned
        ? `A fact about “${label}” became a new discovery; this chat must earn it again.` : `When a fact about “${label}” is learned changed.`);
    } else if (fact.text !== after.text) {
      ctx.push("compatible", "codex-fact-edited", `${path}.${fact.id}`, `A fact about “${label}” was reworded; a chat that knows it sees the new wording.`);
    }
  });
  diffReturns(ctx, path, label, entry, kept);
};

const diffCodex = (ctx: DiffContext) => {
  const { previous, next } = ctx;
  if (sameValue(previous.codex, next.codex)) return;
  const before = ctx.entries.length;
  CODEX_PAGES.forEach((page) => {
    const after = new Map((next.codex?.[page] ?? []).map((entry) => [entry.id, entry]));
    (previous.codex?.[page] ?? []).forEach((entry) => diffCodexEntry(ctx, page, entry, after.get(entry.id)));
  });
  if (ctx.entries.length === before) ctx.push("compatible", "codex-changed", "codex", "The People and Places pages changed; what this chat already learned stays.");
};

const diffObservations = (ctx: DiffContext) => {
  const { previous, next } = ctx;
  if (sameValue(previous.observations, next.observations)) return;
  const before = ctx.entries.length;
  const after = new Map((next.observations ?? []).map((observation) => [observation.id, observation]));
  (previous.observations ?? []).forEach((observation) => {
    const kept = after.get(observation.id);
    const path = `observations.${observation.id}`;
    if (kept && observationIdentity(kept) === observationIdentity(observation)) {
      const reworded = kept.text !== observation.text || kept.source !== observation.source;
      if (reworded) ctx.push("compatible", "observation-edited", path, "A line the player can notice was reworded; a chat that noticed it sees the new wording.");
      return;
    }
    const earned = [observationKey(observation.id), observationMissedKey(observation.id)].map((key) => dropLive(ctx, key)).some(Boolean);
    ctx.push("compatible", kept ? "observation-replaced" : "observation-removed", path, kept
      ? `A line the player can notice changed; ${earned ? "this chat must notice it again" : "it is noticed when its moment comes"}.`
      : "A line the player can notice was removed.");
  });
  if (ctx.entries.length === before) ctx.push("compatible", "observations-changed", "observations", "The lines the player can notice changed; what this chat already noticed stays.");
};

const diffCueSources = (ctx: DiffContext) => (gameLayer()?.cues.diffCues(ctx.previous, ctx.next) ?? []).forEach((row) => {
  row.drop.forEach((key) => dropLive(ctx, key));
  ctx.push("compatible", row.code, row.path, row.message);
});

const diffStoryFields = (ctx: DiffContext) => {
  const { previous, next, push } = ctx;
  if (!sameValue(previous.requirements, next.requirements)) push("compatible", "requirements-changed", "requirements", "What the story needs from your setup changed.");
  // Presentation scope only: widening or narrowing the curator's allowlist never invalidates a run.
  if (!sameValue(previous.stagecraft, next.stagecraft)) push("compatible", "stagecraft-changed", "stagecraft", "Which lorebooks the background curator may edit changed.");
  if (!sameValue(previous.features, next.features)) push("compatible", "features-changed", "features", "Story feature policies changed; chat overrides remain in force.");
  if (previous.display?.lore_names_public !== next.display?.lore_names_public) push("compatible", "story-display-changed", "display", "Whether players see World Info entry names changed.");
  if (STORY_DISPLAY_TOGGLES.some((key) => previous.display?.[key] !== next.display?.[key])) {
    push("compatible", "story-presence-changed", "display", "Which story panels and cards this story shows changed.");
  }
  if ((previous.kind ?? "story") !== (next.kind ?? "story")) push("compatible", "story-kind-changed", "kind", "Whether the story shows as a saga or a single story changed.");
  if (previous.objective_block !== next.objective_block) push("compatible", "story-objective-block-changed", "objective_block", "Whether the objective line is added changed.");
  if (!sameValue(previous.lore_select, next.lore_select)) push("compatible", "lore-select-changed", "lore_select", "What lore-select may judge, or whether it excludes unpicked entries, changed.");
  if (!sameValue(previous.house_rules, next.house_rules)) push("compatible", "house-rules-changed", "house_rules", "What the narrator is held to changed.");
  if (!sameValue(previous.talk_defaults, next.talk_defaults)) push("compatible", "talk-defaults-changed", "talk_defaults", "The story's default pacing profile or speech budget changed.");
  if (!sameValue(previous.scene_read, next.scene_read)) push("compatible", "scene-read-changed", "scene_read", "The scene tracker's places or times changed.");
  if (!sameValue(previous.player?.card, next.player?.card)) push("compatible", "player-card-changed", "player", "The player’s public character fields changed.");
  if (!sameValue({ ...previous.player, card: undefined }, { ...next.player, card: undefined })) {
    push("compatible", "player-profile-changed", "player", "Who the player is in this story changed; the persona this chat locked stays.");
  }
  if (!sameValue(previous.arc_template, next.arc_template)) push("compatible", "arc-template-changed", "arc_template", "The dramatic shape changed.");
  if (!sameValue(previous.arc_bridges, next.arc_bridges)) push("compatible", "arc-bridges-changed", "arc_bridges", "How resolved threads feed convergence changed.");
  if (!sameValue(previous.chapters, next.chapters) || !sameValue(previous.chapterByCheckpoint, next.chapterByCheckpoint) || !sameValue(previous.memory, next.memory)) {
    push("compatible", "chapters-changed", "chapters", "The story's chapters changed; chapters already sealed keep their records.");
  }
  if (!sameValue([previous.quests, previous.milestones, previous.widgets], [next.quests, next.milestones, next.widgets])) {
    push("compatible", "game-changed", "quests", "The story's quests, milestones or panels changed; what this chat already reached stays.");
  }
  diffQuests(ctx);
  diffFactions(ctx);
  diffCodex(ctx);
  diffObservations(ctx);
  diffCueSources(ctx);
  if (previous.title !== next.title || previous.description !== next.description) push("compatible", "text-changed", "story", "Title or description changed.");
};

export function diffStories(previous: NormalizedStory, next: NormalizedStory, state: EngineState | null): StoryDiffResult {
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
export function pruneEngineState(state: EngineState, next: NormalizedStory, diff: StoryDiffResult): EngineState {
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
      ...(state.blackboard.writerOf ? { writerOf: Object.fromEntries(Object.entries(keep(state.blackboard.writerOf)).filter(([key]) => next.cardFieldByQuality?.[key])) } : {}),
      ...(state.blackboard.authoredAt ? { authoredAt: keep(state.blackboard.authoredAt) } : {}) },
  };
}

export function pruneEngineHistory(history: EngineHistory | null, next: NormalizedStory, diff: StoryDiffResult): EngineHistory | null {
  if (!history || diff.reanchorTo) return null;
  const prune = (state: EngineState) => pruneEngineState(state, next, diff);
  return { ...history, base: prune(history.base), log: history.log.map((entry) => ({ ...entry, before: prune(entry.before), after: prune(entry.after) })) };
}
