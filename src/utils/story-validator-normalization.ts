import {
  AUTHOR_NOTE_DEFAULT_DEPTH,
  AUTHOR_NOTE_DEFAULT_INTERVAL,
  AUTHOR_NOTE_DEFAULT_POSITION,
  AUTHOR_NOTE_DEFAULT_ROLE,
} from "@constants/defaults";
import { cloneStructured, trimStringList, trimStringRecord } from "@utils/dataHelpers";
import type {
  AuthorNoteEntry,
  PresetOverrideKey,
  PresetOverrides,
  Role,
  RolePresetOverrides,
  Story,
  TalkControlReply,
} from "./story-schema";
import { buildTalkControlCheckpoint, normalizeTransitionTrigger } from "./story-validator-compilation";
import type {
  NormalizedAuthorNote,
  NormalizedAuthorNoteSettings,
  NormalizedCheckpoint,
  NormalizedStory,
  NormalizedStoryExpansionMetadata,
  NormalizedTalkControl,
  NormalizedTalkControlCheckpoint,
  NormalizedTransition,
  NormalizedWorldInfo,
} from "./story-validator-types";

const normalizeId = (value: string | null | undefined, fallback: string): string => value?.trim() || fallback;

const toInteger = (value: unknown, fallback: number): number => {
  const num = Number(value);
  return Number.isFinite(num) ? Math.floor(num) : fallback;
};

const sanitizeRoleMap = (input?: Partial<Record<Role, string>>): Partial<Record<Role, string>> | undefined => {
  const result = trimStringRecord(input);
  return result ? { ...result } : undefined;
};

function expandAuthorNoteEntry(entry: AuthorNoteEntry, defaults: NormalizedAuthorNoteSettings): NormalizedAuthorNote | null {
  if (typeof entry === "string") {
    const text = entry.trim();
    if (!text) return null;
    return { text, ...defaults };
  }
  const text = entry.text?.trim();
  if (!text) return null;
  return {
    text,
    position: entry.position ?? defaults.position,
    interval: toInteger(entry.interval, defaults.interval),
    depth: toInteger(entry.depth, defaults.depth),
    role: entry.role ?? defaults.role,
  };
}

function normalizeAuthorsNote(
  input: Record<string, AuthorNoteEntry> | undefined,
  defaults: NormalizedAuthorNoteSettings,
): Partial<Record<Role, NormalizedAuthorNote>> | undefined {
  if (!input) return undefined;
  const result: Partial<Record<Role, NormalizedAuthorNote>> = {};
  for (const [role, entry] of Object.entries(input) as [Role, AuthorNoteEntry][]) {
    const normalized = expandAuthorNoteEntry(entry, defaults);
    if (normalized) result[role] = normalized;
  }
  return Object.keys(result).length ? result : undefined;
}

function mergePresetOverrides(
  defaults: RolePresetOverrides | undefined,
  overrides: RolePresetOverrides | undefined,
): RolePresetOverrides | undefined {
  if (!defaults && !overrides) return undefined;
  const result: RolePresetOverrides = {};
  const roles = new Set([...Object.keys(defaults ?? {}), ...Object.keys(overrides ?? {})]);
  for (const role of roles) {
    const base = defaults?.[role] ?? {};
    const patch = overrides?.[role] ?? {};
    const merged: PresetOverrides = { ...base, ...patch };
    if (Object.keys(merged).length) result[role] = merged;
  }
  return Object.keys(result).length ? result : undefined;
}

function normalizePresetOverride(input?: PresetOverrides | null): PresetOverrides | undefined {
  if (!input) return undefined;
  const cleaned: PresetOverrides = {};
  for (const key of Object.keys(input) as PresetOverrideKey[]) {
    const value = input[key];
    if (value !== undefined) cleaned[key] = value;
  }
  return Object.keys(cleaned).length ? cleaned : undefined;
}

function normalizeAutomations(input?: unknown): string[] | undefined {
  if (!input) return undefined;
  const list = Array.isArray(input) ? input : [input];
  const cleaned = [...new Set(list.map((item) => String(item).trim()).filter(Boolean))];
  return cleaned.length ? cleaned : undefined;
}

function createCheckpointDrafts(story: Story, authorNoteDefaults: NormalizedAuthorNoteSettings): {
  checkpoints: NormalizedCheckpoint[];
  transitions: NormalizedTransition[];
} {
  const allWorldInfoEntries = new Set<string>();
  for (const checkpoint of story.checkpoints) {
    for (const entry of checkpoint.world_info ?? []) {
      allWorldInfoEntries.add(entry.trim());
    }
  }

  const transitions: NormalizedTransition[] = [];
  let transitionAutoIndex = 0;

  const checkpoints = story.checkpoints.map((checkpoint, checkpointIndex) => {
    const id = normalizeId(checkpoint.id, `cp-${checkpointIndex + 1}`);
    const activate = [...new Set(trimStringList(checkpoint.world_info))];
    const manualDeactivate = [...new Set(trimStringList(checkpoint.world_info_deactivate))];
    const autoDeactivate = [...allWorldInfoEntries].filter((entry) => !activate.includes(entry));
    const deactivate = [...new Set([...autoDeactivate, ...manualDeactivate])];
    const worldInfo: NormalizedWorldInfo | undefined = activate.length || deactivate.length
      ? { activate, deactivate }
      : undefined;

    for (const [transitionIndex, inlineTransition] of (checkpoint.transitions ?? []).entries()) {
      const edgeId = normalizeId(inlineTransition.id, `${id}-to-${inlineTransition.to}-${transitionAutoIndex++}`);
      transitions.push({
        id: edgeId,
        from: id,
        to: normalizeId(inlineTransition.to, inlineTransition.to),
        trigger: normalizeTransitionTrigger(
          inlineTransition.trigger,
          `checkpoints[${checkpointIndex}].transitions[${transitionIndex}].trigger`,
        ),
        label: typeof inlineTransition.label === "string" ? inlineTransition.label.trim() || undefined : undefined,
        description: typeof inlineTransition.description === "string" ? inlineTransition.description.trim() || undefined : undefined,
      });
    }

    return {
      id,
      name: checkpoint.name,
      objective: checkpoint.objective.trim(),
      authors_note: normalizeAuthorsNote(checkpoint.authors_note, authorNoteDefaults),
      world_info: worldInfo,
      preset_overrides: mergePresetOverrides(story.defaults?.presets, checkpoint.preset_overrides ?? undefined),
      arbiter_preset: normalizePresetOverride(checkpoint.arbiter_preset),
      automations: normalizeAutomations(checkpoint.automations),
      ...(checkpoint._isStub ? {
        stub: {
          isStub: true,
          ...(typeof checkpoint._stubName === "string" && checkpoint._stubName.trim()
            ? { stubName: checkpoint._stubName.trim() }
            : {}),
        },
      } : {}),
    } satisfies NormalizedCheckpoint;
  });

  return { checkpoints, transitions };
}

function orderCheckpointGraph(
  story: Story,
  checkpoints: NormalizedCheckpoint[],
  transitions: NormalizedTransition[],
): { orderedCheckpoints: NormalizedCheckpoint[]; startId: string } {
  const checkpointById = new Map<string, NormalizedCheckpoint>();
  checkpoints.forEach((checkpoint) => checkpointById.set(checkpoint.id, checkpoint));
  const nodeIdSet = new Set(checkpoints.map((checkpoint) => checkpoint.id));
  const adjacency = new Map<string, NormalizedTransition[]>();
  const indegree = new Map<string, number>();
  checkpoints.forEach((checkpoint) => indegree.set(checkpoint.id, 0));

  for (const [index, edge] of transitions.entries()) {
    if (!nodeIdSet.has(edge.from)) {
      throw new Error(`Transition ${edge.id} references unknown source checkpoint '${edge.from}' (index ${index}).`);
    }
    if (!nodeIdSet.has(edge.to)) {
      throw new Error(`Transition ${edge.id} references unknown target checkpoint '${edge.to}' (index ${index}).`);
    }
    const list = adjacency.get(edge.from);
    if (list) list.push(edge); else adjacency.set(edge.from, [edge]);
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
  }

  let startId: string;
  if (story.start) {
    const resolved = normalizeId(story.start, story.start);
    if (!nodeIdSet.has(resolved)) {
      throw new Error(`Story start references unknown checkpoint id '${story.start}'.`);
    }
    startId = resolved;
  } else {
    const roots = checkpoints.filter((checkpoint) => (indegree.get(checkpoint.id) ?? 0) === 0).map((checkpoint) => checkpoint.id);
    if (!roots.length) {
      throw new Error("Story transitions form a cycle and no starting checkpoint could be inferred. Provide a 'start' id.");
    }
    if (roots.length > 1) {
      const names = roots.map((id) => checkpointById.get(id)?.name ?? id);
      throw new Error(`Ambiguous start checkpoint. Candidates: ${names.join(", ")}. Provide a 'start' id.`);
    }
    [startId] = roots;
  }

  const indegreeForSort = new Map(indegree);
  const queue: string[] = [startId];
  const visited = new Set<string>();
  const order: string[] = [];

  while (queue.length) {
    const checkpointId = queue.shift()!;
    if (visited.has(checkpointId)) continue;
    visited.add(checkpointId);
    order.push(checkpointId);
    for (const edge of adjacency.get(checkpointId) ?? []) {
      const nextId = edge.to;
      const nextDegree = (indegreeForSort.get(nextId) ?? 0) - 1;
      indegreeForSort.set(nextId, nextDegree);
      if (nextDegree <= 0) queue.push(nextId);
    }
  }

  if (visited.size !== checkpoints.length) {
    const missing = checkpoints.filter((checkpoint) => !visited.has(checkpoint.id));
    const names = missing.map((checkpoint) => checkpoint.name || String(checkpoint.id));
    throw new Error(`Story graph contains unreachable or cyclic checkpoints: ${names.join(", ")}`);
  }

  return {
    orderedCheckpoints: order.map((id) => checkpointById.get(id)!).filter(Boolean),
    startId,
  };
}

function compileTalkControl(story: Story): NormalizedTalkControl | undefined {
  const talkControlCheckpoints = new Map<string, NormalizedTalkControlCheckpoint>();
  for (const checkpoint of story.checkpoints) {
    const id = normalizeId(checkpoint.id, checkpoint.id);
    const replies: TalkControlReply[] = checkpoint.talk_control ?? [];
    if (!replies.length) continue;
    const normalized = buildTalkControlCheckpoint(replies);
    if (!normalized) continue;
    talkControlCheckpoints.set(id, normalized);
  }
  return talkControlCheckpoints.size ? { checkpoints: talkControlCheckpoints } : undefined;
}

export function normalizeStory(story: Story): NormalizedStory {
  const rawDescription = typeof story.description === "string" ? story.description.trim() : "";
  const authorNoteDefaults: NormalizedAuthorNoteSettings = {
    position: story.defaults?.author_note?.position ?? AUTHOR_NOTE_DEFAULT_POSITION,
    interval: story.defaults?.author_note?.interval ?? AUTHOR_NOTE_DEFAULT_INTERVAL,
    depth: story.defaults?.author_note?.depth ?? AUTHOR_NOTE_DEFAULT_DEPTH,
    role: story.defaults?.author_note?.role ?? AUTHOR_NOTE_DEFAULT_ROLE,
  };
  const { checkpoints, transitions } = createCheckpointDrafts(story, authorNoteDefaults);
  const { orderedCheckpoints, startId } = orderCheckpointGraph(story, checkpoints, transitions);
  const talkControl = compileTalkControl(story);
  const expansion: NormalizedStoryExpansionMetadata | undefined = story._premise || story._roadmap
    ? {
      ...(typeof story._premise === "string" && story._premise.trim()
        ? { premise: story._premise }
        : {}),
      ...(typeof story._roadmap === "string" && story._roadmap.trim()
        ? { roadmap: story._roadmap }
        : {}),
    }
    : undefined;

  if (talkControl) {
    for (const checkpoint of orderedCheckpoints) {
      const entry = talkControl.checkpoints.get(checkpoint.id);
      if (entry) checkpoint.talkControl = entry;
    }
  }

  return {
    schemaVersion: "2.0",
    title: story.title.trim(),
    description: rawDescription || undefined,
    global_lorebook: story.global_lorebook.trim(),
    roles: sanitizeRoleMap(story.roles),
    defaults: {
      author_note: authorNoteDefaults,
      ...(story.defaults?.presets ? { presets: cloneStructured(story.defaults.presets) } : {}),
    },
    checkpoints: orderedCheckpoints,
    transitions,
    startId,
    talkControl,
    expansion,
  };
}
