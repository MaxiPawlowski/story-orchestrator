import { type RosterMember } from "@engine/index";
import type { ProposalOp } from "./types";
import { isRecord } from "@utils/guards";
import {
  readArcBridges, readArcTemplate, readCheckpoint, readCheckpointPatch, readEffects, readGate, readInnerVoice, readQuality,
  readQualityPatch, readRequirements, readRosterMember, readSnapshot, readStringList, readTransition,
  readTransitionPatch, readTransitionRef, requireString,
} from "./parseFields";

type OpReader = (value: Record<string, unknown>, path: string, issues: string[]) => ProposalOp | null;

const patchOf = (value: Record<string, unknown>) => (isRecord(value.patch) ? value.patch : {});

const readSetStoryField: OpReader = (value, path, issues) => {
  if (value.field === "objective_block") {
    if (value.value === "auto" || value.value === "off") return { kind: "setStoryField", field: "objective_block", value: value.value };
    issues.push(`${path}.value: objective_block must be "auto" or "off"`);
    return null;
  }
  if (value.field !== "title" && value.field !== "description") {
    issues.push(`${path}.field: must be title, description or objective_block`);
    return null;
  }
  if (typeof value.value !== "string") {
    issues.push(`${path}.value: required string`);
    return null;
  }
  return { kind: "setStoryField", field: value.field, value: value.value };
};

const QUALITY_OPS: Record<string, OpReader> = {
  setStoryField: readSetStoryField,
  addQuality: (value, path, issues) => {
    const quality = readQuality(value.quality, `${path}.quality`, issues);
    return quality ? { kind: "addQuality", quality } : null;
  },
  updateQuality: (value, path, issues) => {
    const key = requireString(value.key, "key", path, issues);
    return key ? { kind: "updateQuality", key, patch: readQualityPatch(patchOf(value)) } : null;
  },
  removeQuality: (value, path, issues) => {
    const key = requireString(value.key, "key", path, issues);
    return key ? { kind: "removeQuality", key } : null;
  },
};

const CHECKPOINT_OPS: Record<string, OpReader> = {
  addCheckpoint: (value, path, issues) => {
    const checkpoint = readCheckpoint(value.checkpoint, `${path}.checkpoint`, issues);
    return checkpoint ? { kind: "addCheckpoint", checkpoint } : null;
  },
  updateCheckpoint: (value, path, issues) => {
    const id = requireString(value.id, "id", path, issues);
    return id ? { kind: "updateCheckpoint", id, patch: readCheckpointPatch(patchOf(value), `${path}.patch`, issues) } : null;
  },
  removeCheckpoint: (value, path, issues) => {
    const id = requireString(value.id, "id", path, issues);
    return id ? { kind: "removeCheckpoint", id } : null;
  },
  setStartCheckpoint: (value, path, issues) => {
    const id = requireString(value.id, "id", path, issues);
    return id ? { kind: "setStartCheckpoint", id } : null;
  },
  setCheckpointSnapshot: (value, path, issues) => {
    const id = requireString(value.id, "id", path, issues);
    return id ? { kind: "setCheckpointSnapshot", id, snapshot: readSnapshot(value.snapshot, `${path}.snapshot`, issues) } : null;
  },
  setCheckpointEffects: (value, path, issues) => {
    const id = requireString(value.id, "id", path, issues);
    return id ? { kind: "setCheckpointEffects", id, effects: readEffects(value.effects, `${path}.effects`, issues) } : null;
  },
};

const TRANSITION_OPS: Record<string, OpReader> = {
  addTransition: (value, path, issues) => {
    const transition = readTransition(value.transition, `${path}.transition`, issues);
    return transition ? { kind: "addTransition", transition } : null;
  },
  updateTransition: (value, path, issues) => {
    const ref = readTransitionRef(value.ref, `${path}.ref`, issues);
    return ref ? { kind: "updateTransition", ref, patch: readTransitionPatch(patchOf(value), `${path}.patch`, issues) } : null;
  },
  removeTransition: (value, path, issues) => {
    const ref = readTransitionRef(value.ref, `${path}.ref`, issues);
    return ref ? { kind: "removeTransition", ref } : null;
  },
  setTransitionGate: (value, path, issues) => {
    const ref = readTransitionRef(value.ref, `${path}.ref`, issues);
    const gate = readGate(value.gate, `${path}.gate`, issues);
    return ref && gate ? { kind: "setTransitionGate", ref, gate } : null;
  },
};

const readUpdateRosterMember: OpReader = (value, path, issues) => {
  const id = requireString(value.id, "id", path, issues);
  if (!id) return null;
  const patch: Partial<RosterMember> = {};
  if (isRecord(value.patch) && typeof value.patch.name === "string") patch.name = value.patch.name;
  if (isRecord(value.patch) && typeof value.patch.role === "string") patch.role = value.patch.role.trim() || undefined;
  if (isRecord(value.patch)) Object.assign(patch, readInnerVoice(value.patch));
  return { kind: "updateRosterMember", id, patch };
};

const readSetLoreSelect: OpReader = (value) => {
  const source = isRecord(value.loreSelect) ? value.loreSelect : isRecord(value.lore_select) ? value.lore_select : value;
  const topK = typeof source.top_k === "number" ? source.top_k : undefined;
  return { kind: "setLoreSelect", loreSelect: { lorebooks: readStringList(source.lorebooks), ...(topK !== undefined ? { top_k: topK } : {}) } };
};

const readSetSceneRead: OpReader = (value) => {
  const source = isRecord(value.sceneRead) ? value.sceneRead : isRecord(value.scene_read) ? value.scene_read : value;
  return { kind: "setSceneRead", sceneRead: { locations: readStringList(source.locations), times: readStringList(source.times), ...(source.inject === false ? { inject: false } : {}) } };
};

const STORY_SHAPE_OPS: Record<string, OpReader> = {
  addRosterMember: (value, path, issues) => {
    const member = readRosterMember(value.member, `${path}.member`, issues);
    return member ? { kind: "addRosterMember", member } : null;
  },
  updateRosterMember: readUpdateRosterMember,
  removeRosterMember: (value, path, issues) => {
    const id = requireString(value.id, "id", path, issues);
    return id ? { kind: "removeRosterMember", id } : null;
  },
  setArcTemplate: (value, path, issues) => {
    const template = readArcTemplate(value.template, `${path}.template`, issues);
    return template === undefined ? null : { kind: "setArcTemplate", template };
  },
  setArcBridges: (value, path, issues) => {
    const bridges = readArcBridges(value.bridges, `${path}.bridges`, issues);
    return bridges ? { kind: "setArcBridges", bridges } : null;
  },
  setRequirements: (value, path, issues) => {
    const requirements = readRequirements(value.requirements, `${path}.requirements`, issues);
    return requirements ? { kind: "setRequirements", requirements } : null;
  },
  setStagecraft: (value) => {
    const source = isRecord(value.stagecraft) ? value.stagecraft.lorebooks : value.lorebooks;
    return { kind: "setStagecraft", stagecraft: { lorebooks: readStringList(source) } };
  },
  setLoreSelect: readSetLoreSelect,
  setSceneRead: readSetSceneRead,
};

const readCreateCharacterCard: OpReader = (value, path, issues) => {
  const name = requireString(value.name, "name", path, issues);
  const description = requireString(value.description, "description", path, issues);
  if (!name || !description) return null;
  return {
    kind: "createCharacterCard",
    name,
    description,
    ...(typeof value.role === "string" && value.role.trim() ? { role: value.role.trim() } : {}),
    ...(typeof value.personality === "string" ? { personality: value.personality } : {}),
    ...(typeof value.scenario === "string" ? { scenario: value.scenario } : {}),
    ...(typeof value.first_mes === "string" ? { first_mes: value.first_mes } : {}),
    ...(typeof value.mes_example === "string" ? { mes_example: value.mes_example } : {}),
    ...(value.tags !== undefined ? { tags: readStringList(value.tags) } : {}),
  };
};

const readUpsertLorebookEntry: OpReader = (value, path, issues) => {
  const lorebook = requireString(value.lorebook, "lorebook", path, issues);
  const comment = requireString(value.comment, "comment", path, issues);
  const content = requireString(value.content, "content", path, issues);
  if (!lorebook || !comment || !content) return null;
  return { kind: "upsertLorebookEntry", lorebook, comment, content, keys: readStringList(value.keys), ...(typeof value.constant === "boolean" ? { constant: value.constant } : {}) };
};

const readCreateGroup: OpReader = (value, path, issues) => {
  const name = requireString(value.name, "name", path, issues);
  if (!name) return null;
  const members = readStringList(value.members);
  if (!members.length) {
    issues.push(`${path}.members: at least one cast member is required`);
    return null;
  }
  return { kind: "createGroup", name, members };
};

// Provisioning ops are parsed here so the wizard shares one grammar, but never applied to the
// draft: the runtime creates the ST asset and validation enforces create-only.
const PROVISIONING_OPS: Record<string, OpReader> = {
  createCharacterCard: readCreateCharacterCard,
  createStoryLorebook: (value, path, issues) => {
    const name = requireString(value.name, "name", path, issues);
    return name ? { kind: "createStoryLorebook", name } : null;
  },
  upsertLorebookEntry: readUpsertLorebookEntry,
  createGroup: readCreateGroup,
};

const OP_READERS: Record<string, OpReader> = { ...QUALITY_OPS, ...CHECKPOINT_OPS, ...TRANSITION_OPS, ...STORY_SHAPE_OPS, ...PROVISIONING_OPS };

export const readOp = (value: unknown, path: string, issues: string[]): ProposalOp | null => {
  if (!isRecord(value) || typeof value.kind !== "string") {
    issues.push(`${path}: op must have a kind`);
    return null;
  }
  const reader = Object.hasOwn(OP_READERS, value.kind) ? OP_READERS[value.kind] : undefined;
  if (!reader) {
    issues.push(`${path}.kind: unknown '${value.kind}'`);
    return null;
  }
  return reader(value, path, issues);
};
