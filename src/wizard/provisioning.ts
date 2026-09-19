import { PROVISIONING_OP_KINDS, type ProvisioningEnvironment, type ProvisioningOp, type ProvisioningOpKind } from "./types";

const norm = (value: string) => value.trim().toLowerCase();
const has = (values: string[], wanted: string) => values.some((value) => norm(value) === norm(wanted));

export const isProvisioningKind = (kind: string): kind is ProvisioningOpKind => (PROVISIONING_OP_KINDS as readonly string[]).includes(kind);

export const emptyEnvironment = (): ProvisioningEnvironment => ({ characterNames: [], lorebookNames: [], groupNames: [], storyLorebooks: [] });

export interface ProvisioningValidation {
  ok: boolean;
  message: string;
}

const OK: ProvisioningValidation = { ok: true, message: "" };
const fail = (message: string): ProvisioningValidation => ({ ok: false, message });

// The create-only invariant is enforced here, not in the prompt (spec addendum §Story wizard): an op
// naming something that already exists is rejected with a message the author can act on. The single
// exception is an entry written into a lorebook this story owns.
export function validateProvisioningOp(op: ProvisioningOp, environment: ProvisioningEnvironment): ProvisioningValidation {
  switch (op.kind) {
    case "createCharacterCard": {
      if (!op.name.trim()) return fail("A character card needs a name.");
      if (!op.description.trim()) return fail(`"${op.name}" needs a description — an empty card is not playable.`);
      if (has(environment.characterNames, op.name)) return fail(`A character called "${op.name}" already exists. The wizard only creates cards, it never edits yours — rename this one or drop the step.`);
      return OK;
    }
    case "createStoryLorebook": {
      if (!op.name.trim()) return fail("A lorebook needs a name.");
      if (has(environment.lorebookNames, op.name)) return fail(`The lorebook "${op.name}" already exists. Pick a new name, or write entries into it only if it is this story's own book.`);
      return OK;
    }
    case "upsertLorebookEntry": {
      if (!op.lorebook.trim()) return fail("A lorebook entry needs a lorebook.");
      if (!op.comment.trim()) return fail("A lorebook entry needs a title.");
      if (!op.content.trim()) return fail(`"${op.comment}" has no content.`);
      if (!has(environment.storyLorebooks, op.lorebook)) return fail(`"${op.lorebook}" is not this story's lorebook. The wizard never writes into your other books — create the story lorebook first.`);
      if (!has(environment.lorebookNames, op.lorebook)) return fail(`"${op.lorebook}" does not exist yet. Add a step that creates it before writing entries into it.`);
      return OK;
    }
    case "createGroup": {
      if (!op.name.trim()) return fail("A group needs a name.");
      if (has(environment.groupNames, op.name)) return fail(`A group called "${op.name}" already exists — select it instead of creating a second one.`);
      if (!op.members.length) return fail(`"${op.name}" has no members.`);
      const missing = op.members.filter((member) => !has(environment.characterNames, member));
      if (missing.length) return fail(`These cast members do not exist yet: ${missing.join(", ")}. Create their cards first.`);
      return OK;
    }
    default:
      return fail("Unknown provisioning step.");
  }
}

// A provisioning op changes what the *next* op may legally do, so previews fold the environment
// forward instead of validating every op against the install as it is right now.
export function advanceEnvironment(environment: ProvisioningEnvironment, op: ProvisioningOp): ProvisioningEnvironment {
  switch (op.kind) {
    case "createCharacterCard":
      return { ...environment, characterNames: [...environment.characterNames, op.name] };
    case "createStoryLorebook":
      return { ...environment, lorebookNames: [...environment.lorebookNames, op.name], storyLorebooks: [...environment.storyLorebooks, op.name] };
    case "createGroup":
      return { ...environment, groupNames: [...environment.groupNames, op.name] };
    default:
      return environment;
  }
}

export interface ProvisioningPlanItem {
  index: number;
  op: ProvisioningOp;
  validation: ProvisioningValidation;
}

export function planProvisioning(ops: ProvisioningOp[], environment: ProvisioningEnvironment): { items: ProvisioningPlanItem[]; environment: ProvisioningEnvironment } {
  let current = environment;
  const items = ops.map((op, index) => {
    const validation = validateProvisioningOp(op, current);
    if (validation.ok) current = advanceEnvironment(current, op);
    return { index, op, validation };
  });
  return { items, environment: current };
}

// What a created asset means for the story record: the requirements panel goes green because the
// story now *requires* what the wizard just made, not because provisioning wrote to the engine.
export function provisioningRequirements(op: ProvisioningOp): { members: string[]; lorebooks: string[] } {
  if (op.kind === "createCharacterCard") return { members: [op.name], lorebooks: [] };
  if (op.kind === "createStoryLorebook") return { members: [], lorebooks: [op.name] };
  return { members: [], lorebooks: [] };
}

export function describeProvisioningOp(op: ProvisioningOp): { label: string; target: string } {
  switch (op.kind) {
    case "createCharacterCard":
      return { label: `Create character card "${op.name}"`, target: op.name };
    case "createStoryLorebook":
      return { label: `Create the story lorebook "${op.name}"`, target: op.name };
    case "upsertLorebookEntry":
      return { label: `Write "${op.comment}" into "${op.lorebook}"`, target: `${op.lorebook}/${op.comment}` };
    case "createGroup":
      return { label: `Create the group "${op.name}" with ${op.members.join(", ") || "no members"}`, target: op.name };
    default:
      return { label: "Unknown provisioning step", target: "" };
  }
}
