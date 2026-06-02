import { KEEPER_RESPONSE_LENGTH } from "@constants/defaults";
import { getContext } from "@services/STAPI";
import { storySessionStore } from "@store/storySessionStore";
import {
  addConsequence,
  addForegoneTransition,
  addSceneMemory,
  addSeed,
  removeConsequence,
  resolveSeed,
  updateRoleState,
} from "@utils/memory-stores";
import {
  formatNarrativeContextForPrompt,
  type NarrativeContext,
} from "@utils/narrative-context";
import type {
  Consequence,
  ForegoneTransition,
  NarrativeSeed,
  SceneMemoryEntry,
} from "../types/narrative-memory";

interface GenerateRawOptions {
  prompt: string;
  instructOverride?: boolean;
  quietToLoud?: boolean;
  responseLength?: number;
  trimNames?: boolean;
}

const KEEPER_PROMPT_TEMPLATE = `
You are the Continuity Keeper for an authored branching story.
Your job is to update narrative memory stores based only on the supplied event and context.
Do not narrate, roleplay, or invent unsupported facts.
Prefer small precise updates over broad rewrites.

Write only additive or resolving deltas for the memory stores below:
- consequences: durable facts, costs, or changed conditions
- seeds: unresolved hooks, threads, or foreshadowing worth tracking
- roleStates: concise current state for named roles
- sceneMemory: short factual moments from the active scene worth retaining
- foregoneTransitions: meaningful paths that are no longer viable
`;

export type KeeperEventType = "activation" | "advance" | "merge";

export interface KeeperEvent {
  type: KeeperEventType;
  checkpointId: string;
  checkpointName: string;
  observedEvents?: string[];
  transitionId?: string;
  context: NarrativeContext;
}

export interface KeeperDelta {
  consequences?: { add?: Omit<Consequence, "id">[]; remove?: string[] };
  seeds?: { add?: Omit<NarrativeSeed, "id">[]; resolve?: string[] };
  roleStates?: { update?: { role: string; summary: string }[] };
  sceneMemory?: { add?: Omit<SceneMemoryEntry, never>[] };
  foregoneTransitions?: { add?: ForegoneTransition[] };
}

export interface ContinuityKeeperServiceOptions {
  responseLength?: number;
}

const warnKeeper = (...args: unknown[]): void => {
  console.warn("[ContinuityKeeper]", ...args);
};

const toNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
};

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => toNonEmptyString(entry))
    .filter((entry): entry is string => Boolean(entry));
};

const toFiniteNumber = (value: unknown): number | null => {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

const parseConsequenceAdditions = (value: unknown): Omit<Consequence, "id">[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const obj = entry as Record<string, unknown>;
    const text = toNonEmptyString(obj.text);
    const sourceCheckpointId = toNonEmptyString(obj.sourceCheckpointId);
    const weight = toFiniteNumber(obj.weight);
    const createdAtTurn = toFiniteNumber(obj.createdAtTurn);
    if (!text || !sourceCheckpointId || weight === null || createdAtTurn === null) return [];
    return [{
      text,
      sourceCheckpointId,
      weight,
      createdAtTurn: Math.max(0, Math.floor(createdAtTurn)),
      tags: toStringArray(obj.tags),
    }];
  });
};

const parseSeedAdditions = (value: unknown): Omit<NarrativeSeed, "id">[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const obj = entry as Record<string, unknown>;
    const text = toNonEmptyString(obj.text);
    const kind = toNonEmptyString(obj.kind);
    const sourceCheckpointId = toNonEmptyString(obj.sourceCheckpointId);
    const createdAtTurn = toFiniteNumber(obj.createdAtTurn);
    if (!text || !sourceCheckpointId || createdAtTurn === null) return [];
    if (kind !== "foreshadowing" && kind !== "thread" && kind !== "hook") return [];
    return [{
      text,
      kind,
      resolved: obj.resolved === true,
      sourceCheckpointId,
      createdAtTurn: Math.max(0, Math.floor(createdAtTurn)),
    }];
  });
};

const parseRoleUpdates = (value: unknown): { role: string; summary: string }[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const obj = entry as Record<string, unknown>;
    const role = toNonEmptyString(obj.role);
    const summary = toNonEmptyString(obj.summary);
    return role && summary ? [{ role, summary }] : [];
  });
};

const parseSceneMemoryAdditions = (value: unknown): SceneMemoryEntry[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const obj = entry as Record<string, unknown>;
    const text = toNonEmptyString(obj.text);
    const checkpointId = toNonEmptyString(obj.checkpointId);
    const turn = toFiniteNumber(obj.turn);
    return text && checkpointId && turn !== null
      ? [{ text, checkpointId, turn: Math.max(0, Math.floor(turn)) }]
      : [];
  });
};

const parseForegoneTransitions = (value: unknown): ForegoneTransition[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const obj = entry as Record<string, unknown>;
    const transitionId = toNonEmptyString(obj.transitionId);
    const fromCheckpointId = toNonEmptyString(obj.fromCheckpointId);
    const reason = toNonEmptyString(obj.reason);
    const turn = toFiniteNumber(obj.turn);
    return transitionId && fromCheckpointId && reason && turn !== null
      ? [{ transitionId, fromCheckpointId, reason, turn: Math.max(0, Math.floor(turn)) }]
      : [];
  });
};

const buildPrompt = (event: KeeperEvent): string => {
  const observedEvents = event.observedEvents?.length
    ? event.observedEvents.map((entry, index) => `${index + 1}. ${entry}`).join("\n")
    : "None.";
  const transitionLine = event.transitionId ? `Transition ID: ${event.transitionId}` : "Transition ID: (none)";

  return [
    KEEPER_PROMPT_TEMPLATE.trim(),
    "",
    "=== Event ===",
    `Type: ${event.type}`,
    `Checkpoint ID: ${event.checkpointId}`,
    `Checkpoint Name: ${event.checkpointName}`,
    transitionLine,
    "",
    "=== Observed Events ===",
    observedEvents,
    "",
    formatNarrativeContextForPrompt(event.context),
    "",
    "=== Output Format (JSON ONLY) ===",
    "Return ONLY a JSON object with this exact schema (no code fences, no extra text):",
    "",
    "{",
    '  "consequences": {',
    '    "add": [{ "text": "", "weight": 0.0, "tags": [""], "sourceCheckpointId": "", "createdAtTurn": 0 }],',
    '    "remove": ["csq-1"]',
    "  },",
    '  "seeds": {',
    '    "add": [{ "text": "", "kind": "hook", "resolved": false, "sourceCheckpointId": "", "createdAtTurn": 0 }],',
    '    "resolve": ["seed-1"]',
    "  },",
    '  "roleStates": {',
    '    "update": [{ "role": "guide", "summary": "" }]',
    "  },",
    '  "sceneMemory": {',
    '    "add": [{ "text": "", "checkpointId": "", "turn": 0 }]',
    "  },",
    '  "foregoneTransitions": {',
    '    "add": [{ "transitionId": "", "fromCheckpointId": "", "reason": "", "turn": 0 }]',
    "  }",
    "}",
    "",
    "Omit any section that has no changes. Return the smallest factual delta that should be persisted.",
  ].join("\n");
};

const parseDelta = (raw: string): KeeperDelta | null => {
  if (!raw) return null;
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    warnKeeper("parse failed", "no JSON object found");
    return null;
  }

  try {
    const obj = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const consequencesSource = obj.consequences;
    const seedsSource = obj.seeds;
    const roleStatesSource = obj.roleStates ?? obj.role_states;
    const sceneMemorySource = obj.sceneMemory ?? obj.scene_memory;
    const foregoneSource = obj.foregoneTransitions ?? obj.foregone_transitions;
    const delta: KeeperDelta = {};

    if (consequencesSource && typeof consequencesSource === "object" && !Array.isArray(consequencesSource)) {
      const add = parseConsequenceAdditions(
        (consequencesSource as Record<string, unknown>).add
        ?? (consequencesSource as Record<string, unknown>).create
      );
      const remove = toStringArray((consequencesSource as Record<string, unknown>).remove);
      if (add.length || remove.length) {
        delta.consequences = {};
        if (add.length) delta.consequences.add = add;
        if (remove.length) delta.consequences.remove = remove;
      }
    }

    if (seedsSource && typeof seedsSource === "object" && !Array.isArray(seedsSource)) {
      const add = parseSeedAdditions(
        (seedsSource as Record<string, unknown>).add
        ?? (seedsSource as Record<string, unknown>).create
      );
      const resolve = toStringArray(
        (seedsSource as Record<string, unknown>).resolve
        ?? (seedsSource as Record<string, unknown>).resolved
      );
      if (add.length || resolve.length) {
        delta.seeds = {};
        if (add.length) delta.seeds.add = add;
        if (resolve.length) delta.seeds.resolve = resolve;
      }
    }

    if (roleStatesSource && typeof roleStatesSource === "object" && !Array.isArray(roleStatesSource)) {
      const update = parseRoleUpdates(
        (roleStatesSource as Record<string, unknown>).update
        ?? (roleStatesSource as Record<string, unknown>).updates
      );
      if (update.length) {
        delta.roleStates = { update };
      }
    }

    if (sceneMemorySource && typeof sceneMemorySource === "object" && !Array.isArray(sceneMemorySource)) {
      const add = parseSceneMemoryAdditions(
        (sceneMemorySource as Record<string, unknown>).add
        ?? (sceneMemorySource as Record<string, unknown>).create
      );
      if (add.length) {
        delta.sceneMemory = { add };
      }
    }

    if (foregoneSource && typeof foregoneSource === "object" && !Array.isArray(foregoneSource)) {
      const add = parseForegoneTransitions(
        (foregoneSource as Record<string, unknown>).add
        ?? (foregoneSource as Record<string, unknown>).create
      );
      if (add.length) {
        delta.foregoneTransitions = { add };
      }
    }

    return Object.keys(delta).length ? delta : {};
  } catch (err) {
    warnKeeper("parse failed", err);
    return null;
  }
};

const applyDelta = (delta: KeeperDelta): KeeperDelta => {
  const turn = Math.max(0, Math.floor(storySessionStore.getState().turn));

  delta.consequences?.remove?.forEach((id) => {
    removeConsequence(id);
  });
  delta.consequences?.add?.forEach((entry) => {
    addConsequence(entry);
  });
  delta.seeds?.resolve?.forEach((id) => {
    resolveSeed(id);
  });
  delta.seeds?.add?.forEach((entry) => {
    addSeed(entry);
  });
  delta.roleStates?.update?.forEach((entry) => {
    updateRoleState(entry.role, entry.summary, turn);
  });
  delta.sceneMemory?.add?.forEach((entry) => {
    addSceneMemory(entry);
  });
  delta.foregoneTransitions?.add?.forEach((entry) => {
    addForegoneTransition(entry);
  });

  return delta;
};

export class ContinuityKeeperService {
  private responseLength: number;

  constructor(options: ContinuityKeeperServiceOptions = {}) {
    this.responseLength = typeof options.responseLength === "number" && Number.isFinite(options.responseLength)
      ? Math.max(1, Math.floor(options.responseLength))
      : KEEPER_RESPONSE_LENGTH;
  }

  async processEvent(event: KeeperEvent): Promise<KeeperDelta | null> {
    try {
      const { generateRaw } = getContext();
      const raw = await generateRaw({
        prompt: buildPrompt(event),
        instructOverride: true,
        quietToLoud: false,
        responseLength: this.responseLength,
        trimNames: false,
      } satisfies GenerateRawOptions);
      const delta = parseDelta(raw?.trim?.() ?? "");
      if (delta === null) return null;
      try {
        return applyDelta(delta);
      } catch (err) {
        warnKeeper("apply failed", err);
        return null;
      }
    } catch (err) {
      warnKeeper("request failed", err);
      return null;
    }
  }
}

export default ContinuityKeeperService;
